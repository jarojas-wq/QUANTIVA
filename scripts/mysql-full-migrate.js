import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

loadLocalEnv(path.join(projectRoot, ".env"));

const migrationsDir = path.join(projectRoot, "sql", "mysql");
const sqlitePath = resolveSqlitePath();
const mysqlConfig = buildMySqlConfig();
const itemicostosMigrationFilePattern = /^\d+_mtrd_itemicostos.*\.sql$/i;

main().catch((error) => {
  console.error("Error en migracion a MySQL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  ensureMigrationFiles(migrationsDir);

  const connection = await mysql.createConnection({
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    socketPath: mysqlConfig.socketPath,
    ssl: mysqlConfig.ssl,
    multipleStatements: true,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
  });

  try {
    await applySqlMigrations(connection, migrationsDir, mysqlConfig.database);
    const migrated = await migrateSqliteData(connection, mysqlConfig.database, sqlitePath);

    console.log(`Migracion completada en base ${mysqlConfig.database}.`);
    console.log(`Proyectos migrados desde SQLite: ${migrated}.`);
  } finally {
    await connection.end();
  }
}

function ensureMigrationFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`No existe el directorio de migraciones: ${directory}`);
  }

  const files = getItemicostosMigrationFiles(directory);
  if (files.length === 0) {
    throw new Error(
      `No se encontraron migraciones de Itemicostos en ${directory} (patron: ${itemicostosMigrationFilePattern}).`,
    );
  }
}

async function applySqlMigrations(connection, directory, databaseName) {
  const files = getItemicostosMigrationFiles(directory);
  const ignoredFiles = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => !files.includes(name))
    .sort((left, right) => left.localeCompare(right));

  if (ignoredFiles.length > 0) {
    console.log(`Ignoradas por no ser de este app: ${ignoredFiles.join(", ")}`);
  }

  for (const fileName of files) {
    const absolutePath = path.join(directory, fileName);
    const rawSql = fs.readFileSync(absolutePath, "utf8");
    const sql = rawSql.replaceAll("`__DB_NAME__`", `\`${databaseName}\``);
    const statements = splitSqlStatements(sql);

    let appliedCount = 0;
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      try {
        // eslint-disable-next-line no-await-in-loop
        await connection.query(statement);
        appliedCount += 1;
      } catch (error) {
        if (isIgnorableSchemaError(error)) {
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Fallo aplicando ${fileName} (sentencia ${index + 1}): ${message}`);
      }
    }

    console.log(`Aplicado: ${fileName} (${appliedCount} sentencias)`);
  }
}

function getItemicostosMigrationFiles(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => itemicostosMigrationFilePattern.test(name))
    .sort((left, right) => left.localeCompare(right));
}

async function migrateSqliteData(connection, databaseName, sqliteFilePath) {
  if (!fs.existsSync(sqliteFilePath)) {
    throw new Error(`No existe archivo SQLite en ${sqliteFilePath}`);
  }

  const sqlite = new DatabaseSync(sqliteFilePath, { readonly: true });
  try {
    const projects = sqlite.prepare(`
      SELECT
        id,
        name,
        rows_json,
        audit_entries_json,
        snapshots_json,
        collapsed_ids_json,
        created_at,
        updated_at
      FROM projects
      ORDER BY datetime(created_at) ASC, name ASC
    `).all();

    const currentProjectMeta = sqlite.prepare(`
      SELECT value
      FROM app_meta
      WHERE key = 'currentProjectId'
      LIMIT 1
    `).get();

    await connection.query(`USE \`${databaseName}\``);
    await connection.beginTransaction();

    try {
      await connection.query("DELETE FROM MTRD_RevitExportItem");
      await connection.query("DELETE FROM MTRD_RevitVinculoItem");
      await connection.query("DELETE FROM MTRD_RevitExport");
      await connection.query("DELETE FROM MTRD_SnapshotItem");
      await connection.query("DELETE FROM MTRD_Snapshot");
      await connection.query("DELETE FROM MTRD_AuditoriaItem");
      await connection.query("DELETE FROM MTRD_ItemColapsado");
      await connection.query("DELETE FROM MTRD_Item");
      await connection.query("DELETE FROM MTRD_Proyecto");
      await connection.query("DELETE FROM MTRD_AppMeta WHERE MTRD_AppMeta_Clave = 'currentProjectId'");

      const insertedProjectUids = [];

      for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
        const sqliteProject = projects[projectIndex];
        const projectUid = normalizeUid(sqliteProject.id, `project-${projectIndex + 1}`, `p-${projectIndex}`);
        const projectName = normalizeText(sqliteProject.name, `Proyecto ${projectIndex + 1}`);
        const createdAt = toMySqlDateTime(sqliteProject.created_at);
        const updatedAt = toMySqlDateTime(sqliteProject.updated_at || sqliteProject.created_at);

        const [projectInsert] = await connection.query(`
          INSERT INTO MTRD_Proyecto (
            MTRD_Proyecto_UID,
            MTRD_Proyecto_Nombre,
            MTRD_Proyecto_CreadoEn,
            MTRD_Proyecto_ActualizadoEn,
            MTRD_Proyecto_Estado
          ) VALUES (?, ?, ?, ?, 1)
        `, [
          projectUid,
          projectName,
          createdAt,
          updatedAt,
        ]);
        const projectId = projectInsert.insertId;
        insertedProjectUids.push(projectUid);

        const rows = parseJsonArray(sqliteProject.rows_json);
        const itemIdByUid = new Map();

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const rowUid = normalizeUid(row?.id, `row-${projectIndex + 1}-${rowIndex + 1}`, `r-${projectIndex}-${rowIndex}`);

          const [itemInsert] = await connection.query(`
            INSERT INTO MTRD_Item (
              MTRD_Item_KEY_Proyecto,
              MTRD_Item_UID,
              MTRD_Item_Orden,
              MTRD_Item_Nivel,
              MTRD_Item_Codificacion,
              MTRD_Item_Descripcion,
              MTRD_Item_Unidad,
              MTRD_Item_Costo,
              MTRD_Item_MetradoTradicional,
              MTRD_Item_MetradoBim,
              MTRD_Item_TipoMetrado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId,
            rowUid,
            rowIndex + 1,
            Number.parseInt(row?.level || 0, 10) || 0,
            String(row?.codificacion || ""),
            String(row?.descripcion || ""),
            String(row?.unidad || ""),
            parseDecimal(row?.costo),
            parseDecimal(row?.metradoTradicional ?? row?.metrado),
            parseDecimal(row?.metradoBim),
            String(row?.tipoMetrado || ""),
          ]);

          itemIdByUid.set(rowUid, itemInsert.insertId);
        }

        const collapsedIds = parseJsonArray(sqliteProject.collapsed_ids_json);
        for (let collapsedIndex = 0; collapsedIndex < collapsedIds.length; collapsedIndex += 1) {
          const itemUid = normalizeUid(collapsedIds[collapsedIndex], "", `c-${projectIndex}-${collapsedIndex}`);
          const itemId = itemIdByUid.get(itemUid);
          if (!itemId) {
            continue;
          }

          await connection.query(`
            INSERT INTO MTRD_ItemColapsado (
              MTRD_ItemColapsado_KEY_Proyecto,
              MTRD_ItemColapsado_KEY_Item
            ) VALUES (?, ?)
          `, [projectId, itemId]);
        }

        const auditEntries = parseJsonArray(sqliteProject.audit_entries_json);
        for (let auditIndex = 0; auditIndex < auditEntries.length; auditIndex += 1) {
          const audit = auditEntries[auditIndex];
          const auditRowUid = normalizeUid(audit?.rowId, `audit-row-${auditIndex + 1}`, `a-${projectIndex}-${auditIndex}`);

          await connection.query(`
            INSERT INTO MTRD_AuditoriaItem (
              MTRD_AuditoriaItem_KEY_Proyecto,
              MTRD_AuditoriaItem_KEY_Item,
              MTRD_AuditoriaItem_ItemUID,
              MTRD_AuditoriaItem_Tipo,
              MTRD_AuditoriaItem_Campo,
              MTRD_AuditoriaItem_ValorAntes,
              MTRD_AuditoriaItem_ValorDespues,
              MTRD_AuditoriaItem_NivelAntes,
              MTRD_AuditoriaItem_NivelDespues,
              MTRD_AuditoriaItem_PartidaAntes,
              MTRD_AuditoriaItem_PartidaDespues,
              MTRD_AuditoriaItem_UsuarioNombre,
              MTRD_AuditoriaItem_FechaEvento
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId,
            itemIdByUid.get(auditRowUid) || null,
            auditRowUid,
            String(audit?.type || "field"),
            String(audit?.field || ""),
            audit?.beforeValue ?? null,
            audit?.afterValue ?? null,
            audit?.beforeLevel ?? null,
            audit?.afterLevel ?? null,
            audit?.beforePartidaCode ?? null,
            audit?.afterPartidaCode ?? null,
            String(audit?.userName || "Operador"),
            toMySqlDateTime(audit?.timestamp),
          ]);
        }

        const snapshots = parseJsonArray(sqliteProject.snapshots_json);
        const snapshotIdByUid = new Map();
        const snapshotPendingBase = [];

        for (let snapshotIndex = 0; snapshotIndex < snapshots.length; snapshotIndex += 1) {
          const snapshot = snapshots[snapshotIndex];
          const snapshotUid = normalizeUid(snapshot?.id, `snapshot-${projectIndex + 1}-${snapshotIndex + 1}`, `s-${projectIndex}-${snapshotIndex}`);
          const snapshotRows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
          const summary = snapshot?.summary && typeof snapshot.summary === "object"
            ? snapshot.summary
            : buildSnapshotSummary(snapshotRows);

          const [snapshotInsert] = await connection.query(`
            INSERT INTO MTRD_Snapshot (
              MTRD_Snapshot_KEY_Proyecto,
              MTRD_Snapshot_UID,
              MTRD_Snapshot_Nombre,
              MTRD_Snapshot_NumeroVersion,
              MTRD_Snapshot_Tipo,
              MTRD_Snapshot_KEY_SnapshotBase,
              MTRD_Snapshot_UsuarioNombre,
              MTRD_Snapshot_CreadoEn,
              MTRD_Snapshot_RowCount,
              MTRD_Snapshot_RootCount,
              MTRD_Snapshot_LeafCount,
              MTRD_Snapshot_GrandTotal,
              MTRD_Snapshot_MetradoTradicionalTotal,
              MTRD_Snapshot_MetradoBimTotal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId,
            snapshotUid,
            String(snapshot?.name || `Foto ${snapshotIndex + 1}`),
            Number.parseInt(snapshot?.versionNumber || snapshotIndex + 1, 10) || (snapshotIndex + 1),
            String(snapshot?.snapshotType || "manual"),
            null,
            String(snapshot?.userName || "Operador"),
            toMySqlDateTime(snapshot?.createdAt),
            Number.parseInt(summary.rowCount || 0, 10) || 0,
            Number.parseInt(summary.rootCount || 0, 10) || 0,
            Number.parseInt(summary.leafCount || 0, 10) || 0,
            Number(summary.grandTotal || 0),
            Number(summary.metradoTradicionalTotal || 0),
            Number(summary.metradoBimTotal || 0),
          ]);

          const snapshotId = snapshotInsert.insertId;
          snapshotIdByUid.set(snapshotUid, snapshotId);

          const baseSnapshotUid = normalizeUid(snapshot?.baseSnapshotId, "", `sb-${projectIndex}-${snapshotIndex}`);
          if (baseSnapshotUid) {
            snapshotPendingBase.push({ snapshotId, baseSnapshotUid });
          }

          for (let snapshotRowIndex = 0; snapshotRowIndex < snapshotRows.length; snapshotRowIndex += 1) {
            const snapshotRow = snapshotRows[snapshotRowIndex];
            await connection.query(`
              INSERT INTO MTRD_SnapshotItem (
                MTRD_SnapshotItem_KEY_Snapshot,
                MTRD_SnapshotItem_ItemUID,
                MTRD_SnapshotItem_Orden,
                MTRD_SnapshotItem_Nivel,
                MTRD_SnapshotItem_Codificacion,
                MTRD_SnapshotItem_Descripcion,
                MTRD_SnapshotItem_Unidad,
                MTRD_SnapshotItem_Costo,
                MTRD_SnapshotItem_MetradoTradicional,
                MTRD_SnapshotItem_MetradoBim,
                MTRD_SnapshotItem_TipoMetrado
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              snapshotId,
              normalizeUid(snapshotRow?.id, `snapshot-row-${snapshotRowIndex + 1}`, `si-${projectIndex}-${snapshotIndex}-${snapshotRowIndex}`),
              snapshotRowIndex + 1,
              Number.parseInt(snapshotRow?.level || 0, 10) || 0,
              String(snapshotRow?.codificacion || ""),
              String(snapshotRow?.descripcion || ""),
              String(snapshotRow?.unidad || ""),
              parseDecimal(snapshotRow?.costo),
              parseDecimal(snapshotRow?.metradoTradicional ?? snapshotRow?.metrado),
              parseDecimal(snapshotRow?.metradoBim),
              String(snapshotRow?.tipoMetrado || ""),
            ]);
          }
        }

        for (let baseIndex = 0; baseIndex < snapshotPendingBase.length; baseIndex += 1) {
          const pending = snapshotPendingBase[baseIndex];
          const baseId = snapshotIdByUid.get(pending.baseSnapshotUid);
          if (!baseId) {
            continue;
          }

          await connection.query(`
            UPDATE MTRD_Snapshot
            SET MTRD_Snapshot_KEY_SnapshotBase = ?
            WHERE MTRD_Snapshot_ID = ?
          `, [baseId, pending.snapshotId]);
        }
      }

      const requestedCurrentProjectId = normalizeUid(currentProjectMeta?.value, "");
      const currentProjectId = insertedProjectUids.includes(requestedCurrentProjectId)
        ? requestedCurrentProjectId
        : (insertedProjectUids[0] || "");

      if (currentProjectId) {
        await connection.query(`
          INSERT INTO MTRD_AppMeta (
            MTRD_AppMeta_Clave,
            MTRD_AppMeta_Valor
          ) VALUES ('currentProjectId', ?)
          ON DUPLICATE KEY UPDATE
            MTRD_AppMeta_Valor = VALUES(MTRD_AppMeta_Valor)
        `, [currentProjectId]);
      }

      await connection.commit();
      return projects.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    sqlite.close();
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeUid(value, fallback, seed = "") {
  const raw = normalizeIdentifier(value, fallback);
  if (!raw) {
    return "";
  }

  if (raw.length <= 36) {
    return raw;
  }

  const suffix = createHash("sha1")
    .update(`${raw}:${seed}`)
    .digest("hex")
    .slice(0, 12);

  return `${raw.slice(0, 23)}-${suffix}`;
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildSnapshotSummary(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const rootCount = safeRows.filter((row) => Number(row?.level || 0) === 0).length;
  const leafCount = safeRows.filter((row, index) => !rowHasChildren(safeRows, index)).length;
  const grandTotal = safeRows.reduce((sum, row, index) => {
    if (Number(row?.level || 0) !== 0) {
      return sum;
    }
    return sum + getRowPartialAtIndex(safeRows, index);
  }, 0);

  const metradoTradicionalTotal = safeRows.reduce((sum, row) => {
    return sum + parseDecimal(row?.metradoTradicional ?? row?.metrado);
  }, 0);

  const metradoBimTotal = safeRows.reduce((sum, row) => {
    return sum + parseDecimal(row?.metradoBim);
  }, 0);

  return {
    rowCount: safeRows.length,
    rootCount,
    leafCount,
    grandTotal,
    metradoTradicionalTotal,
    metradoBimTotal,
  };
}

function getRowPartialAtIndex(rows, rowIndex) {
  if (!rows[rowIndex]) {
    return 0;
  }

  if (!rowHasChildren(rows, rowIndex)) {
    return getLeafRowPartial(rows[rowIndex]);
  }

  const branchEnd = getBranchEnd(rows, rowIndex);
  let subtotal = 0;
  for (let cursor = rowIndex + 1; cursor <= branchEnd; cursor += 1) {
    if (!rowHasChildren(rows, cursor)) {
      subtotal += getLeafRowPartial(rows[cursor]);
    }
  }
  return subtotal;
}

function rowHasChildren(rows, index) {
  return index < rows.length - 1 && Number(rows[index + 1]?.level || 0) > Number(rows[index]?.level || 0);
}

function getBranchEnd(rows, index) {
  const currentLevel = Number(rows[index]?.level || 0);
  let cursor = index + 1;
  while (cursor < rows.length && Number(rows[cursor]?.level || 0) > currentLevel) {
    cursor += 1;
  }
  return cursor - 1;
}

function getLeafRowPartial(row) {
  const costo = parseDecimal(row?.costo);
  const metradoTradicional = parseDecimal(row?.metradoTradicional ?? row?.metrado);
  const metradoBim = parseDecimal(row?.metradoBim);
  return costo * (metradoTradicional + metradoBim);
}

function toMySqlDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function isIgnorableSchemaError(error) {
  const code = Number(error?.errno || 0);
  return code === 1050 || code === 1061 || code === 1826;
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const next = sqlText[index + 1];

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (!inBlockComment && char === "-" && next === "-") {
        inLineComment = true;
      } else if (!inLineComment && char === "/" && next === "*") {
        inBlockComment = true;
      }
    }

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      current += char;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === "\"" && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (char === "`" && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      current += char;
      continue;
    }

    if (char === ";" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

function resolveSqlitePath() {
  const customPath = String(process.env.SQLITE_PATH || "").trim();
  if (customPath) {
    return path.isAbsolute(customPath)
      ? customPath
      : path.resolve(projectRoot, customPath);
  }

  return path.join(projectRoot, "data", "itemicostos.sqlite");
}

function buildMySqlConfig() {
  const database = sanitizeMySqlIdentifier(process.env.MYSQL_DATABASE || "MTRD");
  const sslCaPath = String(process.env.MYSQL_SSL_CA_PATH || "").trim();
  const ssl = sslCaPath
    ? { ca: fs.readFileSync(path.resolve(projectRoot, sslCaPath), "utf8") }
    : undefined;

  const config = {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number.parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER || "",
    password: process.env.MYSQL_PASSWORD || "",
    socketPath: process.env.MYSQL_SOCKET_PATH || undefined,
    ssl,
    database,
  };

  if (!config.user) {
    throw new Error("Falta MYSQL_USER para conectar a MySQL/Cloud SQL.");
  }

  if (!config.socketPath && !config.host) {
    throw new Error("Falta MYSQL_HOST o MYSQL_SOCKET_PATH para conectar a MySQL/Cloud SQL.");
  }

  return config;
}

function sanitizeMySqlIdentifier(identifier) {
  const candidate = String(identifier || "").trim();
  if (!candidate || !/^[A-Za-z0-9_]+$/.test(candidate)) {
    throw new Error("MYSQL_DATABASE solo puede contener letras, numeros y guion bajo.");
  }
  return candidate;
}

function loadLocalEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || key in process.env) {
        return;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      const isQuoted =
        (value.startsWith("\"") && value.endsWith("\""))
        || (value.startsWith("'") && value.endsWith("'"));

      if (isQuoted) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    });
  } catch {
    // Archivo .env opcional.
  }
}
