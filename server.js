import http from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { google } from "googleapis";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadLocalEnv(path.join(__dirname, ".env"));

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "5500", 10);
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "itemicostos.sqlite");
const googleSheetsConfigPath = path.join(dataDir, "google-sheets.json");
const googleSheetsScopes = ["https://www.googleapis.com/auth/spreadsheets"];
const mysqlSchemaPath = path.join(__dirname, "sql", "mysql", "001_mtrd_itemicostos_real.sql");
const revitIngestApiKey = String(process.env.REVIT_INGEST_API_KEY || "").trim();

fs.mkdirSync(dataDir, { recursive: true });

let storage = null;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

    if (url.pathname === "/api/health") {
      const health = await storage.getHealth();
      respondJson(response, health.ok ? 200 : 500, health);
      return;
    }

    if (url.pathname === "/api/state") {
      if (request.method === "GET") {
        const payload = await storage.loadState();
        respondJson(response, 200, {
          ...payload,
          storage: storage.kind,
          storageLabel: storage.label,
        });
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const normalized = normalizeIncomingState(payload);
        const result = await storage.persistState(normalized);
        respondJson(response, 200, {
          ok: true,
          savedAt: result.savedAt,
          currentProjectId: normalized.currentProjectId,
          projects: normalized.projects.length,
          storage: storage.kind,
          storageLabel: storage.label,
          spreadsheetId: result.spreadsheetId || null,
          spreadsheetUrl: result.spreadsheetUrl || null,
        });
        return;
      }

      respondJson(response, 405, { error: "Metodo no permitido." });
      return;
    }

    if (url.pathname === "/api/revit/export") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      if (typeof storage.ingestRevitExport !== "function") {
        respondJson(response, 409, {
          error: "La exportacion de Revit solo esta disponible con ITEMICOSTOS_STORAGE=mysql.",
        });
        return;
      }

      if (revitIngestApiKey) {
        const providedApiKey = readIncomingApiKey(request);
        if (providedApiKey !== revitIngestApiKey) {
          respondJson(response, 401, { error: "API key invalida para exportacion Revit." });
          return;
        }
      }

      const payload = await readJsonBody(request);
      const normalized = normalizeIncomingRevitExport(payload);
      if (!normalized.projectId) {
        respondJson(response, 400, { error: "projectId es obligatorio para importar metrado Revit." });
        return;
      }
      if (normalized.rows.length === 0) {
        respondJson(response, 400, { error: "rows o items debe contener al menos un metrado." });
        return;
      }

      const result = await storage.ingestRevitExport(normalized, {
        clientIp: resolveClientIp(request),
      });
      respondJson(response, 200, {
        ok: true,
        ...result,
        storage: storage.kind,
        storageLabel: storage.label,
      });
      return;
    }

    if (!["GET", "HEAD"].includes(request.method || "GET")) {
      respondJson(response, 405, { error: "Metodo no permitido." });
      return;
    }

    await serveStaticAsset(url.pathname, response, request.method || "GET");
  } catch (error) {
    respondJson(response, 500, {
      error: "No se pudo completar la solicitud.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, async () => {
  const health = await storage.getHealth();
  console.log(`Itemicostos listo en http://${host}:${port}`);
  console.log(`Storage: ${storage.label}`);

  if (health.storage === "google-sheets" && health.spreadsheetUrl) {
    console.log(`Google Sheets: ${health.spreadsheetUrl}`);
  }

  if (health.storage === "sqlite" && health.databasePath) {
    console.log(`SQLite local: ${health.databasePath}`);
  }

  if (health.storage === "mysql" && health.database) {
    console.log(`MySQL: ${health.host} / ${health.database}`);
  }
});

function createStorageAdapter() {
  const explicitStorage = String(process.env.ITEMICOSTOS_STORAGE || "").trim().toLowerCase();

  if (explicitStorage === "google-sheets") {
    return new GoogleSheetsStorage();
  }

  if (explicitStorage === "mysql" || explicitStorage === "cloud-sql") {
    return new MySQLStorage(buildMySqlConfig());
  }

  if (explicitStorage === "sqlite") {
    return new SQLiteStorage(dbPath);
  }

  if (shouldUseGoogleSheets()) {
    return new GoogleSheetsStorage();
  }

  if (shouldUseMySql()) {
    return new MySQLStorage(buildMySqlConfig());
  }

  return new SQLiteStorage(dbPath);
}

function shouldUseGoogleSheets() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || process.env.GOOGLE_SHEETS_CREATE_IF_MISSING === "true",
  );
}

function shouldUseMySql() {
  return Boolean(
    process.env.MYSQL_SOCKET_PATH
    || (process.env.MYSQL_HOST && process.env.MYSQL_USER),
  );
}

function buildMySqlConfig() {
  const sslCaPath = String(process.env.MYSQL_SSL_CA_PATH || "").trim();
  const ssl = sslCaPath
    ? {
      ca: fs.readFileSync(path.resolve(__dirname, sslCaPath), "utf8"),
    }
    : undefined;

  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number.parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER || "",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "MTRD",
    socketPath: process.env.MYSQL_SOCKET_PATH || undefined,
    ssl,
  };
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
    // Optional local environment file.
  }
}

class SQLiteStorage {
  constructor(databasePath) {
    this.kind = "sqlite";
    this.label = "SQLite local";
    this.databasePath = databasePath;
    this.db = new DatabaseSync(this.databasePath);

    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rows_json TEXT NOT NULL,
        audit_entries_json TEXT NOT NULL,
        snapshots_json TEXT NOT NULL,
        collapsed_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.readProjectsStatement = this.db.prepare(`
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
    `);
    this.readCurrentProjectIdStatement = this.db.prepare(`
      SELECT value
      FROM app_meta
      WHERE key = 'currentProjectId'
    `);
    this.clearProjectsStatement = this.db.prepare(`DELETE FROM projects`);
    this.clearCurrentProjectIdStatement = this.db.prepare(`
      DELETE FROM app_meta
      WHERE key = 'currentProjectId'
    `);
    this.insertProjectStatement = this.db.prepare(`
      INSERT INTO projects (
        id,
        name,
        rows_json,
        audit_entries_json,
        snapshots_json,
        collapsed_ids_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.upsertCurrentProjectIdStatement = this.db.prepare(`
      INSERT INTO app_meta (key, value)
      VALUES ('currentProjectId', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  async getHealth() {
    return {
      ok: true,
      storage: this.kind,
      databasePath: this.databasePath,
    };
  }

  async loadState() {
    const projectRows = this.readProjectsStatement.all();
    const projects = projectRows.map((row) => ({
      id: row.id,
      name: row.name,
      rows: parseJsonArray(row.rows_json),
      auditEntries: parseJsonArray(row.audit_entries_json),
      snapshots: parseJsonArray(row.snapshots_json),
      collapsedIds: parseJsonArray(row.collapsed_ids_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const currentProjectRow = this.readCurrentProjectIdStatement.get();
    const currentProjectId = projects.some((project) => project.id === currentProjectRow?.value)
      ? currentProjectRow.value
      : (projects[0]?.id || null);

    return {
      currentProjectId,
      projects,
    };
  }

  async persistState(payload) {
    this.db.exec("BEGIN");

    try {
      this.clearProjectsStatement.run();
      this.clearCurrentProjectIdStatement.run();

      payload.projects.forEach((project) => {
        this.insertProjectStatement.run(
          project.id,
          project.name,
          JSON.stringify(project.rows),
          JSON.stringify(project.auditEntries),
          JSON.stringify(project.snapshots),
          JSON.stringify(project.collapsedIds),
          project.createdAt,
          project.updatedAt,
        );
      });

      if (payload.currentProjectId) {
        this.upsertCurrentProjectIdStatement.run(payload.currentProjectId);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      savedAt: new Date().toISOString(),
    };
  }
}

class MySQLStorage {
  constructor(config) {
    this.kind = "mysql";
    this.label = "MySQL (Cloud SQL)";
    this.config = config;
    this.database = sanitizeMySqlIdentifier(config.database || "MTRD");
    this.schemaPath = mysqlSchemaPath;
    this.pool = null;
    this.readyPromise = null;
  }

  async getHealth() {
    try {
      await this.ensureReady();
      await this.pool.query("SELECT 1");
      return {
        ok: true,
        storage: this.kind,
        host: this.config.socketPath || this.config.host,
        database: this.database,
      };
    } catch (error) {
      return {
        ok: false,
        storage: this.kind,
        host: this.config.socketPath || this.config.host,
        database: this.database,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async loadState() {
    await this.ensureReady();
    const [projectRows] = await this.pool.query(`
      SELECT
        MTRD_Proyecto_ID AS project_id,
        MTRD_Proyecto_UID AS project_uid,
        MTRD_Proyecto_Nombre AS project_name,
        MTRD_Proyecto_CreadoEn AS created_at,
        MTRD_Proyecto_ActualizadoEn AS updated_at
      FROM MTRD_Proyecto
      WHERE MTRD_Proyecto_Estado = 1
      ORDER BY MTRD_Proyecto_CreadoEn ASC, MTRD_Proyecto_Nombre ASC
    `);

    if (projectRows.length === 0) {
      return { currentProjectId: null, projects: [] };
    }

    const projectIds = projectRows.map((row) => row.project_id);
    const [itemRows] = await this.pool.query(`
      SELECT
        MTRD_Item_KEY_Proyecto AS project_id,
        MTRD_Item_ID AS item_id,
        MTRD_Item_UID AS item_uid,
        MTRD_Item_Orden AS item_order,
        MTRD_Item_Nivel AS item_level,
        MTRD_Item_Codificacion AS item_codificacion,
        MTRD_Item_Descripcion AS item_descripcion,
        MTRD_Item_Unidad AS item_unidad,
        MTRD_Item_Costo AS item_costo,
        MTRD_Item_MetradoTradicional AS item_metrado_tradicional,
        MTRD_Item_MetradoBim AS item_metrado_bim,
        MTRD_Item_TipoMetrado AS item_tipo_metrado
      FROM MTRD_Item
      WHERE MTRD_Item_KEY_Proyecto IN (?)
      ORDER BY MTRD_Item_KEY_Proyecto ASC, MTRD_Item_Orden ASC
    `, [projectIds]);

    const [collapsedRows] = await this.pool.query(`
      SELECT
        c.MTRD_ItemColapsado_KEY_Proyecto AS project_id,
        i.MTRD_Item_UID AS item_uid
      FROM MTRD_ItemColapsado c
      INNER JOIN MTRD_Item i ON i.MTRD_Item_ID = c.MTRD_ItemColapsado_KEY_Item
      WHERE c.MTRD_ItemColapsado_KEY_Proyecto IN (?)
      ORDER BY c.MTRD_ItemColapsado_KEY_Proyecto ASC, c.MTRD_ItemColapsado_ID ASC
    `, [projectIds]);

    const [auditRows] = await this.pool.query(`
      SELECT
        MTRD_AuditoriaItem_KEY_Proyecto AS project_id,
        MTRD_AuditoriaItem_ItemUID AS item_uid,
        MTRD_AuditoriaItem_Tipo AS audit_type,
        MTRD_AuditoriaItem_Campo AS audit_field,
        MTRD_AuditoriaItem_ValorAntes AS before_value,
        MTRD_AuditoriaItem_ValorDespues AS after_value,
        MTRD_AuditoriaItem_NivelAntes AS before_level,
        MTRD_AuditoriaItem_NivelDespues AS after_level,
        MTRD_AuditoriaItem_PartidaAntes AS before_partida,
        MTRD_AuditoriaItem_PartidaDespues AS after_partida,
        MTRD_AuditoriaItem_UsuarioNombre AS user_name,
        MTRD_AuditoriaItem_FechaEvento AS event_at,
        MTRD_AuditoriaItem_ID AS audit_id
      FROM MTRD_AuditoriaItem
      WHERE MTRD_AuditoriaItem_KEY_Proyecto IN (?)
      ORDER BY MTRD_AuditoriaItem_KEY_Proyecto ASC, MTRD_AuditoriaItem_FechaEvento ASC, MTRD_AuditoriaItem_ID ASC
    `, [projectIds]);

    const [snapshotRows] = await this.pool.query(`
      SELECT
        MTRD_Snapshot_ID AS snapshot_id,
        MTRD_Snapshot_KEY_Proyecto AS project_id,
        MTRD_Snapshot_UID AS snapshot_uid,
        MTRD_Snapshot_Nombre AS snapshot_name,
        MTRD_Snapshot_NumeroVersion AS snapshot_version,
        MTRD_Snapshot_Tipo AS snapshot_type,
        MTRD_Snapshot_KEY_SnapshotBase AS snapshot_base_key,
        MTRD_Snapshot_UsuarioNombre AS user_name,
        MTRD_Snapshot_CreadoEn AS created_at,
        MTRD_Snapshot_RowCount AS row_count,
        MTRD_Snapshot_RootCount AS root_count,
        MTRD_Snapshot_LeafCount AS leaf_count,
        MTRD_Snapshot_GrandTotal AS grand_total,
        MTRD_Snapshot_MetradoTradicionalTotal AS metrado_tradicional_total,
        MTRD_Snapshot_MetradoBimTotal AS metrado_bim_total
      FROM MTRD_Snapshot
      WHERE MTRD_Snapshot_KEY_Proyecto IN (?)
      ORDER BY MTRD_Snapshot_KEY_Proyecto ASC, MTRD_Snapshot_CreadoEn ASC, MTRD_Snapshot_ID ASC
    `, [projectIds]);

    const snapshotIds = snapshotRows.map((row) => row.snapshot_id);
    const snapshotItemRows = snapshotIds.length > 0
      ? (await this.pool.query(`
        SELECT
          MTRD_SnapshotItem_KEY_Snapshot AS snapshot_id,
          MTRD_SnapshotItem_ItemUID AS item_uid,
          MTRD_SnapshotItem_Orden AS item_order,
          MTRD_SnapshotItem_Nivel AS item_level,
          MTRD_SnapshotItem_Codificacion AS item_codificacion,
          MTRD_SnapshotItem_Descripcion AS item_descripcion,
          MTRD_SnapshotItem_Unidad AS item_unidad,
          MTRD_SnapshotItem_Costo AS item_costo,
          MTRD_SnapshotItem_MetradoTradicional AS item_metrado_tradicional,
          MTRD_SnapshotItem_MetradoBim AS item_metrado_bim,
          MTRD_SnapshotItem_TipoMetrado AS item_tipo_metrado
        FROM MTRD_SnapshotItem
        WHERE MTRD_SnapshotItem_KEY_Snapshot IN (?)
        ORDER BY MTRD_SnapshotItem_KEY_Snapshot ASC, MTRD_SnapshotItem_Orden ASC
      `, [snapshotIds]))[0]
      : [];

    const itemsByProject = groupRowsByKey(itemRows, "project_id");
    const collapsedByProject = groupRowsByKey(collapsedRows, "project_id");
    const auditsByProject = groupRowsByKey(auditRows, "project_id");
    const snapshotsByProject = groupRowsByKey(snapshotRows, "project_id");
    const snapshotItemsBySnapshot = groupRowsByKey(snapshotItemRows, "snapshot_id");

    const projects = projectRows.map((projectRow) => {
      const projectItems = itemsByProject.get(projectRow.project_id) || [];
      const projectCollapsed = collapsedByProject.get(projectRow.project_id) || [];
      const projectAudits = auditsByProject.get(projectRow.project_id) || [];
      const projectSnapshots = snapshotsByProject.get(projectRow.project_id) || [];

      const snapshotsById = new Map(projectSnapshots.map((snapshot) => [snapshot.snapshot_id, snapshot.snapshot_uid]));
      const snapshots = projectSnapshots.map((snapshot) => {
        const rows = (snapshotItemsBySnapshot.get(snapshot.snapshot_id) || []).map((entry) => ({
          id: entry.item_uid,
          level: Number(entry.item_level || 0),
          codificacion: entry.item_codificacion || "",
          descripcion: entry.item_descripcion || "",
          unidad: entry.item_unidad || "",
          costo: normalizeDecimalString(entry.item_costo),
          metradoTradicional: normalizeDecimalString(entry.item_metrado_tradicional),
          metradoBim: normalizeDecimalString(entry.item_metrado_bim),
          tipoMetrado: entry.item_tipo_metrado || "",
        }));

        return {
          id: snapshot.snapshot_uid,
          name: snapshot.snapshot_name || "Foto",
          rows,
          summary: {
            rowCount: Number(snapshot.row_count || 0),
            rootCount: Number(snapshot.root_count || 0),
            leafCount: Number(snapshot.leaf_count || 0),
            grandTotal: Number(snapshot.grand_total || 0),
            metradoTradicionalTotal: Number(snapshot.metrado_tradicional_total || 0),
            metradoBimTotal: Number(snapshot.metrado_bim_total || 0),
          },
          userName: snapshot.user_name || "Operador",
          createdAt: normalizeIsoString(snapshot.created_at),
          versionNumber: Number(snapshot.snapshot_version || 1),
          snapshotType: snapshot.snapshot_type || "manual",
          baseSnapshotId: snapshot.snapshot_base_key
            ? (snapshotsById.get(snapshot.snapshot_base_key) || null)
            : null,
        };
      });

      return {
        id: projectRow.project_uid,
        name: projectRow.project_name,
        rows: projectItems.map((entry) => ({
          id: entry.item_uid,
          level: Number(entry.item_level || 0),
          codificacion: entry.item_codificacion || "",
          descripcion: entry.item_descripcion || "",
          unidad: entry.item_unidad || "",
          costo: normalizeDecimalString(entry.item_costo),
          metradoTradicional: normalizeDecimalString(entry.item_metrado_tradicional),
          metradoBim: normalizeDecimalString(entry.item_metrado_bim),
          tipoMetrado: entry.item_tipo_metrado || "",
        })),
        auditEntries: projectAudits.map((entry) => ({
          id: `audit-${entry.audit_id}`,
          rowId: entry.item_uid,
          type: entry.audit_type || "field",
          field: entry.audit_field || "",
          beforeValue: entry.before_value ?? "",
          afterValue: entry.after_value ?? "",
          beforeLevel: entry.before_level ?? null,
          afterLevel: entry.after_level ?? null,
          beforePartidaCode: entry.before_partida ?? "",
          afterPartidaCode: entry.after_partida ?? "",
          userName: entry.user_name || "Operador",
          timestamp: normalizeIsoString(entry.event_at),
        })),
        snapshots,
        collapsedIds: projectCollapsed.map((entry) => entry.item_uid).filter(Boolean),
        createdAt: normalizeIsoString(projectRow.created_at),
        updatedAt: normalizeIsoString(projectRow.updated_at),
      };
    });

    const [metaRows] = await this.pool.query(`
      SELECT MTRD_AppMeta_Valor AS current_project_id
      FROM MTRD_AppMeta
      WHERE MTRD_AppMeta_Clave = 'currentProjectId'
      LIMIT 1
    `);
    const storedCurrentProjectId = metaRows[0]?.current_project_id || null;

    return {
      currentProjectId: projects.some((project) => project.id === storedCurrentProjectId)
        ? storedCurrentProjectId
        : (projects[0]?.id || null),
      projects,
    };
  }

  async persistState(payload) {
    await this.ensureReady();
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM MTRD_SnapshotItem");
      await connection.query("DELETE FROM MTRD_Snapshot");
      await connection.query("DELETE FROM MTRD_AuditoriaItem");
      await connection.query("DELETE FROM MTRD_ItemColapsado");
      await connection.query("DELETE FROM MTRD_Item");
      await connection.query("DELETE FROM MTRD_Proyecto");
      await connection.query(`
        DELETE FROM MTRD_AppMeta
        WHERE MTRD_AppMeta_Clave = 'currentProjectId'
      `);

      for (let projectIndex = 0; projectIndex < payload.projects.length; projectIndex += 1) {
        const project = payload.projects[projectIndex];
        const createdAt = toMySqlDateTime(project.createdAt);
        const updatedAt = toMySqlDateTime(project.updatedAt || project.createdAt);

        const [projectInsert] = await connection.query(`
          INSERT INTO MTRD_Proyecto (
            MTRD_Proyecto_UID,
            MTRD_Proyecto_Nombre,
            MTRD_Proyecto_CreadoEn,
            MTRD_Proyecto_ActualizadoEn,
            MTRD_Proyecto_Estado
          ) VALUES (?, ?, ?, ?, 1)
        `, [
          normalizeIdentifier(project.id, `project-${projectIndex + 1}`),
          normalizeText(project.name, `Proyecto ${projectIndex + 1}`),
          createdAt,
          updatedAt,
        ]);
        const projectId = projectInsert.insertId;

        const rows = Array.isArray(project.rows) ? project.rows : [];
        const itemIdByUid = new Map();
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const rowUid = normalizeIdentifier(row.id, `row-${projectIndex + 1}-${rowIndex + 1}`);
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
            Number.parseInt(row.level || 0, 10) || 0,
            String(row.codificacion || ""),
            String(row.descripcion || ""),
            String(row.unidad || ""),
            parseDecimal(row.costo),
            parseDecimal(row.metradoTradicional ?? row.metrado),
            parseDecimal(row.metradoBim),
            String(row.tipoMetrado || ""),
          ]);
          itemIdByUid.set(rowUid, itemInsert.insertId);
        }

        const collapsedIds = Array.isArray(project.collapsedIds) ? project.collapsedIds : [];
        for (let collapseIndex = 0; collapseIndex < collapsedIds.length; collapseIndex += 1) {
          const itemUid = String(collapsedIds[collapseIndex] || "").trim();
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

        const auditEntries = Array.isArray(project.auditEntries) ? project.auditEntries : [];
        for (let auditIndex = 0; auditIndex < auditEntries.length; auditIndex += 1) {
          const audit = auditEntries[auditIndex];
          const itemUid = normalizeIdentifier(audit.rowId, "");
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
            itemIdByUid.get(itemUid) || null,
            itemUid,
            String(audit.type || "field"),
            String(audit.field || ""),
            audit.beforeValue ?? null,
            audit.afterValue ?? null,
            audit.beforeLevel ?? null,
            audit.afterLevel ?? null,
            audit.beforePartidaCode ?? null,
            audit.afterPartidaCode ?? null,
            String(audit.userName || "Operador"),
            toMySqlDateTime(audit.timestamp),
          ]);
        }

        const snapshots = Array.isArray(project.snapshots) ? project.snapshots : [];
        const snapshotIdByUid = new Map();
        const snapshotPendingBase = [];

        for (let snapshotIndex = 0; snapshotIndex < snapshots.length; snapshotIndex += 1) {
          const snapshot = snapshots[snapshotIndex];
          const snapshotUid = normalizeIdentifier(snapshot.id, `snapshot-${projectIndex + 1}-${snapshotIndex + 1}`);
          const summary = snapshot.summary && typeof snapshot.summary === "object"
            ? snapshot.summary
            : buildSnapshotSummary(Array.isArray(snapshot.rows) ? snapshot.rows : []);

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
            String(snapshot.name || `Foto ${snapshotIndex + 1}`),
            Number.parseInt(snapshot.versionNumber || snapshotIndex + 1, 10) || (snapshotIndex + 1),
            String(snapshot.snapshotType || "manual"),
            null,
            String(snapshot.userName || "Operador"),
            toMySqlDateTime(snapshot.createdAt),
            Number.parseInt(summary.rowCount || 0, 10) || 0,
            Number.parseInt(summary.rootCount || 0, 10) || 0,
            Number.parseInt(summary.leafCount || 0, 10) || 0,
            Number(summary.grandTotal || 0),
            Number(summary.metradoTradicionalTotal || 0),
            Number(summary.metradoBimTotal || 0),
          ]);
          const snapshotId = snapshotInsert.insertId;
          snapshotIdByUid.set(snapshotUid, snapshotId);

          const baseSnapshotUid = typeof snapshot.baseSnapshotId === "string"
            ? snapshot.baseSnapshotId.trim()
            : "";
          if (baseSnapshotUid) {
            snapshotPendingBase.push({ snapshotId, baseSnapshotUid });
          }

          const snapshotRows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
          for (let snapshotRowIndex = 0; snapshotRowIndex < snapshotRows.length; snapshotRowIndex += 1) {
            const row = snapshotRows[snapshotRowIndex];
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
              normalizeIdentifier(row.id, `snapshot-row-${snapshotRowIndex + 1}`),
              snapshotRowIndex + 1,
              Number.parseInt(row.level || 0, 10) || 0,
              String(row.codificacion || ""),
              String(row.descripcion || ""),
              String(row.unidad || ""),
              parseDecimal(row.costo),
              parseDecimal(row.metradoTradicional ?? row.metrado),
              parseDecimal(row.metradoBim),
              String(row.tipoMetrado || ""),
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

      if (payload.currentProjectId) {
        await connection.query(`
          INSERT INTO MTRD_AppMeta (MTRD_AppMeta_Clave, MTRD_AppMeta_Valor)
          VALUES ('currentProjectId', ?)
          ON DUPLICATE KEY UPDATE
            MTRD_AppMeta_Valor = VALUES(MTRD_AppMeta_Valor)
        `, [String(payload.currentProjectId)]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return {
      savedAt: new Date().toISOString(),
    };
  }

  async ingestRevitExport(payload, context = {}) {
    await this.ensureReady();
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [projectRows] = await connection.query(`
        SELECT
          MTRD_Proyecto_ID AS project_id,
          MTRD_Proyecto_UID AS project_uid
        FROM MTRD_Proyecto
        WHERE MTRD_Proyecto_UID = ?
          AND MTRD_Proyecto_Estado = 1
        LIMIT 1
      `, [payload.projectId]);
      const projectId = projectRows[0]?.project_id || null;
      if (!projectId) {
        throw new Error(`No existe un proyecto activo con projectId ${payload.projectId}.`);
      }

      const [existingExportRows] = await connection.query(`
        SELECT
          MTRD_RevitExport_ID AS export_id,
          MTRD_RevitExport_TotalElementos AS total_elements,
          MTRD_RevitExport_TotalCantidad AS total_quantity,
          MTRD_RevitExport_CreadoEn AS created_at
        FROM MTRD_RevitExport
        WHERE MTRD_RevitExport_KEY_Proyecto = ?
          AND MTRD_RevitExport_UID = ?
        LIMIT 1
      `, [projectId, payload.exportUid]);
      if (existingExportRows.length > 0) {
        await connection.commit();
        const existing = existingExportRows[0];
        return {
          duplicate: true,
          exportId: existing.export_id,
          exportUid: payload.exportUid,
          projectId: payload.projectId,
          importedRows: Number(existing.total_elements || 0),
          totalQuantity: Number(existing.total_quantity || 0),
          importedAt: normalizeIsoString(existing.created_at),
          updatedItems: 0,
        };
      }

      const requestedItemUids = new Set();
      const requestedCodificaciones = new Set();
      let totalQuantity = 0;

      for (let rowIndex = 0; rowIndex < payload.rows.length; rowIndex += 1) {
        const row = payload.rows[rowIndex];
        totalQuantity += parseDecimal(row.cantidad);

        if (row.itemUid) {
          requestedItemUids.add(row.itemUid);
        }
        if (row.codigoPartida) {
          requestedCodificaciones.add(row.codigoPartida);
        }
      }

      const itemByUid = new Map();
      const itemByCodificacion = new Map();
      const uniqueRowItemUids = Array.from(requestedItemUids);
      if (uniqueRowItemUids.length > 0) {
        const [itemRows] = await connection.query(`
          SELECT
            MTRD_Item_ID AS item_id,
            MTRD_Item_UID AS item_uid,
            MTRD_Item_Codificacion AS item_codificacion
          FROM MTRD_Item
          WHERE MTRD_Item_KEY_Proyecto = ?
            AND MTRD_Item_UID IN (?)
        `, [projectId, uniqueRowItemUids]);
        itemRows.forEach((row) => {
          const itemUid = String(row.item_uid || "");
          const codificacion = String(row.item_codificacion || "");
          const itemDescriptor = {
            itemId: row.item_id,
            itemUid,
            codificacion,
          };
          itemByUid.set(itemUid, itemDescriptor);
          if (codificacion && !itemByCodificacion.has(codificacion)) {
            itemByCodificacion.set(codificacion, itemDescriptor);
          }
        });
      }

      const uniqueCodificaciones = Array.from(requestedCodificaciones);
      if (uniqueCodificaciones.length > 0) {
        const [codifiedRows] = await connection.query(`
          SELECT
            MTRD_Item_ID AS item_id,
            MTRD_Item_UID AS item_uid,
            MTRD_Item_Codificacion AS item_codificacion
          FROM MTRD_Item
          WHERE MTRD_Item_KEY_Proyecto = ?
            AND MTRD_Item_Codificacion IN (?)
          ORDER BY MTRD_Item_Orden ASC, MTRD_Item_ID ASC
        `, [projectId, uniqueCodificaciones]);
        codifiedRows.forEach((row) => {
          const codificacion = String(row.item_codificacion || "");
          if (!codificacion || itemByCodificacion.has(codificacion)) {
            return;
          }
          const itemUid = String(row.item_uid || "");
          const itemDescriptor = {
            itemId: row.item_id,
            itemUid,
            codificacion,
          };
          itemByCodificacion.set(codificacion, itemDescriptor);
          if (itemUid && !itemByUid.has(itemUid)) {
            itemByUid.set(itemUid, itemDescriptor);
          }
        });
      }

      const quantitiesByItemId = new Map();
      const linkedItemIds = new Set();
      const resolvedRows = payload.rows.map((row) => {
        const linkedByUid = row.itemUid ? (itemByUid.get(row.itemUid) || null) : null;
        const linkedByCodificacion = row.codigoPartida
          ? (itemByCodificacion.get(row.codigoPartida) || null)
          : null;
        const linkedItem = linkedByUid || linkedByCodificacion;
        const resolvedItemId = linkedItem?.itemId || null;
        const resolvedItemUid = linkedItem?.itemUid || row.itemUid;
        const quantity = parseDecimal(row.cantidad);

        if (resolvedItemId) {
          linkedItemIds.add(resolvedItemId);
          const previous = quantitiesByItemId.get(resolvedItemId) || 0;
          quantitiesByItemId.set(resolvedItemId, previous + quantity);
        }

        return {
          ...row,
          resolvedItemId,
          resolvedItemUid,
          quantity,
        };
      });

      const totalItemsVinculados = linkedItemIds.size;
      const payloadHash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");

      const [exportInsert] = await connection.query(`
        INSERT INTO MTRD_RevitExport (
          MTRD_RevitExport_KEY_Proyecto,
          MTRD_RevitExport_UID,
          MTRD_RevitExport_DocumentoUID,
          MTRD_RevitExport_ModeloGUID,
          MTRD_RevitExport_RutaModelo,
          MTRD_RevitExport_RevitVersion,
          MTRD_RevitExport_AddinVersion,
          MTRD_RevitExport_UsuarioNombre,
          MTRD_RevitExport_FechaExportacion,
          MTRD_RevitExport_TotalElementos,
          MTRD_RevitExport_TotalCantidad,
          MTRD_RevitExport_TotalItemsVinculados,
          MTRD_RevitExport_OrigenIP,
          MTRD_RevitExport_PayloadHash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        projectId,
        payload.exportUid,
        payload.documentUid,
        payload.modelGuid,
        payload.modelPath,
        payload.revitVersion,
        payload.addinVersion,
        payload.exportedBy,
        toMySqlDateTime(payload.exportedAt),
        payload.rows.length,
        totalQuantity,
        totalItemsVinculados,
        normalizeText(context.clientIp, "").slice(0, 45),
        payloadHash,
      ]);
      const exportId = exportInsert.insertId;

      for (let rowIndex = 0; rowIndex < resolvedRows.length; rowIndex += 1) {
        const row = resolvedRows[rowIndex];
        const serializedParameters = row.parametrosJson === null
          ? null
          : JSON.stringify(row.parametrosJson);

        await connection.query(`
          INSERT INTO MTRD_RevitExportItem (
            MTRD_RevitExportItem_KEY_Export,
            MTRD_RevitExportItem_KEY_Proyecto,
            MTRD_RevitExportItem_KEY_Item,
            MTRD_RevitExportItem_ItemUID,
            MTRD_RevitExportItem_ElementId,
            MTRD_RevitExportItem_ElementUniqueId,
            MTRD_RevitExportItem_Categoria,
            MTRD_RevitExportItem_Familia,
            MTRD_RevitExportItem_Tipo,
            MTRD_RevitExportItem_CodigoPartida,
            MTRD_RevitExportItem_Descripcion,
            MTRD_RevitExportItem_Unidad,
            MTRD_RevitExportItem_Cantidad,
            MTRD_RevitExportItem_ParametrosJson
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          exportId,
          projectId,
          row.resolvedItemId,
          row.resolvedItemUid,
          row.elementId,
          row.elementUniqueId,
          row.categoria,
          row.familia,
          row.tipo,
          row.codigoPartida,
          row.descripcion,
          row.unidad,
          row.quantity,
          serializedParameters,
        ]);

        if (row.resolvedItemId && row.elementUniqueId) {
          await connection.query(`
            INSERT INTO MTRD_RevitVinculoItem (
              MTRD_RevitVinculoItem_KEY_Proyecto,
              MTRD_RevitVinculoItem_KEY_Item,
              MTRD_RevitVinculoItem_DocumentoUID,
              MTRD_RevitVinculoItem_ElementUniqueId,
              MTRD_RevitVinculoItem_ElementId,
              MTRD_RevitVinculoItem_KEY_UltimoExport,
              MTRD_RevitVinculoItem_UltimaCantidad,
              MTRD_RevitVinculoItem_Unidad
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              MTRD_RevitVinculoItem_KEY_Item = VALUES(MTRD_RevitVinculoItem_KEY_Item),
              MTRD_RevitVinculoItem_ElementId = VALUES(MTRD_RevitVinculoItem_ElementId),
              MTRD_RevitVinculoItem_KEY_UltimoExport = VALUES(MTRD_RevitVinculoItem_KEY_UltimoExport),
              MTRD_RevitVinculoItem_UltimaCantidad = VALUES(MTRD_RevitVinculoItem_UltimaCantidad),
              MTRD_RevitVinculoItem_Unidad = VALUES(MTRD_RevitVinculoItem_Unidad)
          `, [
            projectId,
            row.resolvedItemId,
            payload.documentUid,
            row.elementUniqueId,
            row.elementId,
            exportId,
            row.quantity,
            row.unidad,
          ]);
        }
      }

      let updatedItems = 0;
      if (payload.options.syncItemMetradoBim) {
        const entries = Array.from(quantitiesByItemId.entries());
        for (let index = 0; index < entries.length; index += 1) {
          const [itemId, quantity] = entries[index];
          const [result] = await connection.query(`
            UPDATE MTRD_Item
            SET
              MTRD_Item_MetradoBim = ?,
              MTRD_Item_ActualizadoEn = CURRENT_TIMESTAMP
            WHERE MTRD_Item_ID = ?
          `, [quantity, itemId]);
          updatedItems += Number(result.affectedRows || 0);
        }
      }

      await connection.commit();
      return {
        duplicate: false,
        exportId,
        exportUid: payload.exportUid,
        projectId: payload.projectId,
        importedRows: payload.rows.length,
        totalQuantity,
        importedAt: new Date().toISOString(),
        updatedItems,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async ensureReady() {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize().catch((error) => {
        this.readyPromise = null;
        throw error;
      });
    }
    return this.readyPromise;
  }

  async initialize() {
    const adminConnection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      socketPath: this.config.socketPath,
      ssl: this.config.ssl,
      charset: "utf8mb4",
      supportBigNumbers: true,
      timezone: "Z",
    });

    try {
      await adminConnection.query(`
        CREATE DATABASE IF NOT EXISTS \`${this.database}\`
          CHARACTER SET utf8mb4
          COLLATE utf8mb4_0900_ai_ci
      `);
    } finally {
      await adminConnection.end();
    }

    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      socketPath: this.config.socketPath,
      ssl: this.config.ssl,
      database: this.database,
      charset: "utf8mb4",
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "Z",
      supportBigNumbers: true,
    });
    await applyMySqlSchema(this.pool, this.schemaPath, this.database);
  }
}

class GoogleSheetsStorage {
  constructor() {
    this.kind = "google-sheets";
    this.label = "Google Sheets";
    this.sheetNames = {
      meta: process.env.GOOGLE_SHEETS_META_TAB || "itemicostos_meta",
      state: process.env.GOOGLE_SHEETS_STATE_TAB || "itemicostos_state",
      projects: process.env.GOOGLE_SHEETS_PROJECTS_TAB || "itemicostos_projects",
    };
    this.spreadsheetId = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim() || null;
    this.readyPromise = null;

    const authConfig = {
      scopes: googleSheetsScopes,
    };
    const inlineCredentials = readInlineServiceAccountCredentials();
    if (inlineCredentials) {
      authConfig.credentials = inlineCredentials;
    }

    this.auth = new google.auth.GoogleAuth(authConfig);
    this.sheets = google.sheets({
      version: "v4",
      auth: this.auth,
    });
  }

  async getHealth() {
    try {
      await this.ensureReady();
      return {
        ok: true,
        storage: this.kind,
        spreadsheetId: this.spreadsheetId,
        spreadsheetUrl: getSpreadsheetUrl(this.spreadsheetId),
        tabs: this.sheetNames,
      };
    } catch (error) {
      return {
        ok: false,
        storage: this.kind,
        detail: error instanceof Error ? error.message : String(error),
        spreadsheetId: this.spreadsheetId,
      };
    }
  }

  async loadState() {
    await this.ensureReady();

    const { data } = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges: [
        `${this.sheetNames.meta}!A:B`,
        `${this.sheetNames.state}!A:B`,
      ],
    });

    const stateRange = (data.valueRanges || [])[1]?.values || [];
    const serializedState = joinChunkedStateRows(stateRange);
    if (!serializedState) {
      return {
        currentProjectId: null,
        projects: [],
      };
    }

    const parsed = JSON.parse(serializedState);
    return normalizeIncomingState(parsed);
  }

  async persistState(payload) {
    await this.ensureReady();

    const savedAt = new Date().toISOString();
    const serializedState = JSON.stringify(payload);
    const stateRows = [
      ["chunkIndex", "jsonChunk"],
      ...chunkText(serializedState, 40000).map((chunk, index) => [String(index + 1), chunk]),
    ];
    const metaRows = [
      ["key", "value"],
      ["savedAt", savedAt],
      ["currentProjectId", payload.currentProjectId || ""],
      ["projectCount", String(payload.projects.length)],
      ["storage", this.kind],
    ];
    const projectSummaryRows = buildProjectSummaryRows(payload.projects);

    await this.sheets.spreadsheets.values.batchClear({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        ranges: [
          `${this.sheetNames.meta}!A:Z`,
          `${this.sheetNames.state}!A:Z`,
          `${this.sheetNames.projects}!A:Z`,
        ],
      },
    });

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          {
            range: `${this.sheetNames.meta}!A1`,
            majorDimension: "ROWS",
            values: metaRows,
          },
          {
            range: `${this.sheetNames.state}!A1`,
            majorDimension: "ROWS",
            values: stateRows,
          },
          {
            range: `${this.sheetNames.projects}!A1`,
            majorDimension: "ROWS",
            values: projectSummaryRows,
          },
        ],
      },
    });

    return {
      savedAt,
      spreadsheetId: this.spreadsheetId,
      spreadsheetUrl: getSpreadsheetUrl(this.spreadsheetId),
    };
  }

  async ensureReady() {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize().catch((error) => {
        this.readyPromise = null;
        throw error;
      });
    }

    return this.readyPromise;
  }

  async initialize() {
    this.spreadsheetId = await this.resolveSpreadsheetId();
    await this.ensureSheetsStructure();
    return this.spreadsheetId;
  }

  async resolveSpreadsheetId() {
    if (this.spreadsheetId) {
      return this.spreadsheetId;
    }

    const savedConfig = readSavedGoogleSheetsConfig();
    if (savedConfig.spreadsheetId) {
      this.spreadsheetId = savedConfig.spreadsheetId;
      return this.spreadsheetId;
    }

    if (process.env.GOOGLE_SHEETS_CREATE_IF_MISSING === "true") {
      const createdSpreadsheet = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: process.env.GOOGLE_SHEETS_TITLE || "Itemicostos",
          },
          sheets: Object.values(this.sheetNames).map((title) => ({
            properties: { title },
          })),
        },
        fields: "spreadsheetId,spreadsheetUrl",
      });

      const spreadsheetId = createdSpreadsheet.data.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error("Google Sheets no devolvio un spreadsheetId.");
      }

      this.spreadsheetId = spreadsheetId;
      writeSavedGoogleSheetsConfig({
        spreadsheetId,
        spreadsheetUrl: createdSpreadsheet.data.spreadsheetUrl || getSpreadsheetUrl(spreadsheetId),
      });
      return this.spreadsheetId;
    }

    throw new Error(
      "Configura GOOGLE_SHEETS_SPREADSHEET_ID o activa GOOGLE_SHEETS_CREATE_IF_MISSING=true.",
    );
  }

  async ensureSheetsStructure() {
    const { data } = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties.title",
    });
    const existingTitles = new Set(
      (data.sheets || [])
        .map((sheet) => sheet.properties?.title)
        .filter(Boolean),
    );
    const missingTitles = Object.values(this.sheetNames).filter((title) => !existingTitles.has(title));

    if (missingTitles.length === 0) {
      return;
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: missingTitles.map((title) => ({
          addSheet: {
            properties: { title },
          },
        })),
      },
    });
  }
}

storage = createStorageAdapter();

function buildProjectSummaryRows(projects) {
  return [
    [
      "projectId",
      "name",
      "updatedAt",
      "rows",
      "auditEntries",
      "snapshots",
      "grandTotal",
    ],
    ...projects.map((project) => {
      const summary = summarizeProject(project);
      return [
        project.id,
        project.name,
        project.updatedAt,
        String(project.rows.length),
        String(project.auditEntries.length),
        String(project.snapshots.length),
        summary.grandTotal.toFixed(2),
      ];
    }),
  ];
}

function summarizeProject(project) {
  const rows = Array.isArray(project?.rows) ? project.rows : [];
  const grandTotal = rows.reduce((sum, row, index) => {
    return row.level === 0 ? sum + getRowPartialAtIndex(rows, index) : sum;
  }, 0);

  return { grandTotal };
}

function getRowPartialAtIndex(rows, rowIndex) {
  const row = rows[rowIndex];
  if (!row) {
    return 0;
  }

  if (!rowHasChildren(rows, rowIndex)) {
    return getLeafRowPartial(row);
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

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function joinChunkedStateRows(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return "";
  }

  return rows
    .slice(1)
    .map((row) => ({
      index: Number.parseInt(row[0], 10) || 0,
      chunk: row[1] || "",
    }))
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.chunk)
    .join("");
}

function chunkText(value, chunkSize) {
  const source = String(value || "");
  if (!source) {
    return [""];
  }

  const chunks = [];
  for (let cursor = 0; cursor < source.length; cursor += chunkSize) {
    chunks.push(source.slice(cursor, cursor + chunkSize));
  }
  return chunks;
}

function readInlineServiceAccountCredentials() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (typeof credentials.private_key === "string") {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return credentials;
}

function readSavedGoogleSheetsConfig() {
  try {
    const raw = fs.readFileSync(googleSheetsConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSavedGoogleSheetsConfig(value) {
  fs.writeFileSync(
    googleSheetsConfigPath,
    JSON.stringify(value, null, 2),
    "utf8",
  );
}

function getSpreadsheetUrl(spreadsheetId) {
  return spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;
}

function groupRowsByKey(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => {
    const rowKey = row[key];
    if (!grouped.has(rowKey)) {
      grouped.set(rowKey, []);
    }
    grouped.get(rowKey).push(row);
  });
  return grouped;
}

function normalizeDecimalString(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return String(value);
}

async function applyMySqlSchema(pool, schemaPath, databaseName) {
  const rawSql = await readFile(schemaPath, "utf8");
  const sql = rawSql.replaceAll("`__DB_NAME__`", `\`${databaseName}\``);
  const statements = splitSqlStatements(sql);

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    try {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(statement);
    } catch (error) {
      if (isIgnorableMySqlSchemaError(error)) {
        continue;
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo aplicar esquema MySQL (sentencia ${index + 1}): ${detail}`);
    }
  }
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

function isIgnorableMySqlSchemaError(error) {
  const code = Number(error?.errno || 0);
  return code === 1050 || code === 1061 || code === 1826;
}

function normalizeIncomingState(payload) {
  const projects = Array.isArray(payload?.projects)
    ? payload.projects.map((project, index) => normalizeIncomingProject(project, index))
    : [];

  const currentProjectId = projects.some((project) => project.id === payload?.currentProjectId)
    ? payload.currentProjectId
    : (projects[0]?.id || null);

  return { currentProjectId, projects };
}

function normalizeIncomingRevitExport(payload) {
  const model = payload?.model && typeof payload.model === "object"
    ? payload.model
    : {};
  const options = payload?.options && typeof payload.options === "object"
    ? payload.options
    : {};
  const rawRows = Array.isArray(payload?.rows)
    ? payload.rows
    : (Array.isArray(payload?.items) ? payload.items : []);

  return {
    projectId: normalizeIdentifier(payload?.projectId || payload?.projectUid, ""),
    exportUid: normalizeIdentifier(payload?.exportUid || payload?.uid, randomUUID()),
    documentUid: normalizeIdentifier(model.documentUid || payload?.documentUid, ""),
    modelGuid: normalizeIdentifier(model.modelGuid || payload?.modelGuid, ""),
    modelPath: normalizeText(model.modelPath || payload?.modelPath, ""),
    revitVersion: normalizeText(model.revitVersion || payload?.revitVersion, ""),
    addinVersion: normalizeText(model.addinVersion || payload?.addinVersion, ""),
    exportedBy: normalizeText(payload?.exportedBy || model.exportedBy || payload?.userName, "Revit Addin"),
    exportedAt: normalizeIsoString(payload?.exportedAt || model.exportedAt || Date.now()),
    rows: rawRows.map(normalizeIncomingRevitExportRow),
    options: {
      syncItemMetradoBim: options.syncItemMetradoBim !== false,
    },
  };
}

function normalizeIncomingRevitExportRow(row) {
  return {
    itemUid: normalizeIdentifier(row?.itemUid || row?.rowId || row?.itemId, ""),
    elementId: normalizeNullableInteger(row?.elementId ?? row?.revitElementId),
    elementUniqueId: normalizeIdentifier(
      row?.elementUniqueId || row?.revitUniqueId || row?.uniqueId,
      "",
    ),
    categoria: normalizeText(row?.categoria || row?.category, ""),
    familia: normalizeText(row?.familia || row?.family, ""),
    tipo: normalizeText(row?.tipo || row?.type, ""),
    codigoPartida: normalizeText(row?.codigoPartida || row?.codificacion || row?.partida, ""),
    descripcion: normalizeText(row?.descripcion || row?.description, ""),
    unidad: normalizeText(row?.unidad || row?.unit, ""),
    cantidad: parseDecimal(row?.cantidad ?? row?.quantity ?? row?.metradoBim ?? row?.metrado ?? 0),
    parametrosJson: normalizeJsonObject(row?.parametros ?? row?.parameters),
  };
}

function normalizeIncomingProject(project, index) {
  const createdAt = normalizeIsoString(project?.createdAt);
  const updatedAt = normalizeIsoString(project?.updatedAt || createdAt);

  return {
    id: normalizeIdentifier(project?.id, `project-${index + 1}`),
    name: normalizeText(project?.name, `Proyecto ${index + 1}`),
    rows: Array.isArray(project?.rows) ? project.rows : [],
    auditEntries: Array.isArray(project?.auditEntries) ? project.auditEntries : [],
    snapshots: Array.isArray(project?.snapshots) ? project.snapshots : [],
    collapsedIds: Array.isArray(project?.collapsedIds) ? project.collapsedIds : [],
    createdAt,
    updatedAt,
  };
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeIsoString(value) {
  const candidate = new Date(value || Date.now());
  return Number.isNaN(candidate.getTime())
    ? new Date().toISOString()
    : candidate.toISOString();
}

function toMySqlDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function sanitizeMySqlIdentifier(identifier) {
  const candidate = String(identifier || "").trim();
  if (!candidate || !/^[A-Za-z0-9_]+$/.test(candidate)) {
    throw new Error("MYSQL_DATABASE solo puede contener letras, numeros y guion bajo.");
  }
  return candidate;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return [];
  }

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function readIncomingApiKey(request) {
  const fromHeader = String(request.headers["x-itemicostos-key"] || request.headers["x-api-key"] || "").trim();
  if (fromHeader) {
    return fromHeader;
  }

  const authHeader = String(request.headers.authorization || "").trim();
  const bearerPrefix = "Bearer ";
  if (authHeader.startsWith(bearerPrefix)) {
    return authHeader.slice(bearerPrefix.length).trim();
  }

  return "";
}

function resolveClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (forwarded) {
    return forwarded;
  }

  const realIp = String(request.headers["x-real-ip"] || "").trim();
  if (realIp) {
    return realIp;
  }

  return String(request.socket?.remoteAddress || "").trim();
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function serveStaticAsset(pathname, response, method) {
  const safePath = pathname === "/"
    ? "index.html"
    : path.normalize(decodeURIComponent(pathname).replace(/^\/+/, ""));
  const absolutePath = path.resolve(__dirname, safePath);

  if (!absolutePath.startsWith(__dirname)) {
    respondPlain(response, 403, "Acceso denegado.");
    return;
  }

  let fileBuffer;
  try {
    fileBuffer = await readFile(absolutePath);
  } catch {
    respondPlain(response, 404, "No encontrado.");
    return;
  }

  response.writeHead(200, {
    "Content-Type": getContentType(absolutePath),
    "Cache-Control": "no-cache",
  });

  if (method === "HEAD") {
    response.end();
    return;
  }

  response.end(fileBuffer);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
  };

  return contentTypes[extension] || "application/octet-stream";
}

function respondJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(body);
}

function respondPlain(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(message);
}
