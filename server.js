import http from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadLocalEnv(path.join(__dirname, ".env"));

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "5500", 10);
const dataDir = path.join(__dirname, "data");
const distDir = path.join(__dirname, "dist");
const accessControlPath = path.join(dataDir, "access-control.json");
const mysqlSchemaPath = path.join(__dirname, "sql", "mysql", "001_mtrd_itemicostos_real.sql");
const revitIngestApiKey = String(process.env.REVIT_INGEST_API_KEY || "").trim();
const webSessionCookieName = String(process.env.ACCESS_COOKIE_NAME || "mtr2_session").trim() || "mtr2_session";

fs.mkdirSync(dataDir, { recursive: true });

let storage = null;
const accessControl = createAccessControlManager(accessControlPath, {
  getExternalStore: () => (
    storage
    && typeof storage.loadAccessUsers === "function"
    && typeof storage.persistAccessUsers === "function"
      ? storage
      : null
  ),
});

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

    if (url.pathname === "/api/health") {
      const health = await storage.getHealth();
      respondJson(response, health.ok ? 200 : 500, {
        ...health,
        accessControl: accessControl.getPublicSettings(),
      });
      return;
    }

    if (url.pathname === "/api/access/settings") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      respondJson(response, 200, {
        ok: true,
        accessControl: accessControl.getPublicSettings(),
      });
      return;
    }

    if (url.pathname === "/api/auth/web/config") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      respondJson(response, 200, buildWebAuthSession(null, accessControl.getPublicSettings()));
      return;
    }

    if (url.pathname === "/api/auth/web/session") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const session = await accessControl.authorizeRequest(request, "viewer", { silent: true });
      respondJson(response, 200, buildWebAuthSession(session?.ok ? session.user : null, accessControl.getPublicSettings()));
      return;
    }

    if (url.pathname === "/api/auth/web/google/login") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      const payload = await readJsonBody(request);
      const result = await accessControl.loginWithGoogle(payload?.credential || payload?.idToken);
      if (!result.ok) {
        respondJson(response, result.status, { ok: false, error: result.error });
        return;
      }

      writeSessionCookie(response, result.token, result.expiresAt);
      respondJson(response, 200, {
        auth: buildWebAuthSession(result.user, accessControl.getPublicSettings(), result.expiresAt),
      });
      return;
    }

    if (url.pathname === "/api/auth/web/logout") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      const token = readRequestSessionToken(request);
      if (token) {
        await accessControl.logoutByToken(token);
      }
      clearSessionCookie(response);
      respondJson(response, 200, {
        auth: buildWebAuthSession(null, accessControl.getPublicSettings()),
      });
      return;
    }

    if (url.pathname === "/api/auth/login") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      respondJson(response, 409, {
        ok: false,
        error: "Login con correo/clave deshabilitado. Usa Google.",
        accessControl: accessControl.getPublicSettings(),
      });
      return;
    }

    if (url.pathname === "/api/auth/google") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      const payload = await readJsonBody(request);
      const result = await accessControl.loginWithGoogle(payload?.idToken || payload?.credential);
      if (!result.ok) {
        respondJson(response, result.status, { ok: false, error: result.error });
        return;
      }

      writeSessionCookie(response, result.token, result.expiresAt);
      respondJson(response, 200, {
        ok: true,
        token: result.token,
        user: result.user,
        accessControl: accessControl.getPublicSettings(),
      });
      return;
    }

    if (url.pathname === "/api/auth/me") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
      if (!session) {
        return;
      }

      respondJson(response, 200, {
        ok: true,
        user: session.user,
        accessControl: accessControl.getPublicSettings(),
      });
      return;
    }

    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
      if (!session) {
        return;
      }

      await accessControl.logoutByToken(session.token);
      clearSessionCookie(response);
      respondJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/auth/users") {
      if (request.method === "GET") {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "superadmin");
        if (!session) {
          return;
        }

        const statePayload = await storage.loadState();

        respondJson(response, 200, {
          ok: true,
          users: await accessControl.listUsers(),
          projects: buildProjectAccessOptions(statePayload?.projects),
        });
        return;
      }

      if (request.method === "POST") {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "superadmin");
        if (!session) {
          return;
        }

        const payload = await readJsonBody(request);
        const statePayload = await storage.loadState();
        const result = await accessControl.upsertUser(payload, session.user, {
          availableProjectIds: buildProjectAccessOptions(statePayload?.projects).map(
            (project) => project.id,
          ),
        });
        if (!result.ok) {
          respondJson(response, result.status, { ok: false, error: result.error });
          return;
        }

        respondJson(response, 200, {
          ok: true,
          user: result.user,
        });
        return;
      }

      respondJson(response, 405, { error: "Metodo no permitido." });
      return;
    }

    if (url.pathname === "/api/state") {
      if (request.method === "GET") {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
        if (!session) {
          return;
        }

        const payload = await storage.loadState();
        const scopedPayload = filterStateByUserProjects(payload, session.user);
        if (scopedPayload.projects.length === 0 && !userCanAccessAllProjects(session.user)) {
          respondJson(response, 403, {
            ok: false,
            error: "No tienes proyectos asignados. Solicita acceso al superadmin.",
          });
          return;
        }

        respondJson(response, 200, {
          ...scopedPayload,
          storage: storage.kind,
          storageLabel: storage.label,
        });
        return;
      }

      if (request.method === "PUT") {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "editor");
        if (!session) {
          return;
        }

        const payload = await readJsonBody(request);
        const normalized = normalizeIncomingState(payload);
        const currentState = await storage.loadState();
        const scopedWrite = mergeStateByUserProjects(currentState, normalized, session.user);
        if (!scopedWrite.ok) {
          respondJson(response, scopedWrite.status, {
            ok: false,
            error: scopedWrite.error,
          });
          return;
        }

        const result = await storage.persistState(scopedWrite.state);
        respondJson(response, 200, {
          ok: true,
          savedAt: result.savedAt,
          currentProjectId: scopedWrite.state.currentProjectId,
          projects: scopedWrite.state.projects.length,
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

    if (url.pathname === "/api/revit/import-state") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      const authorizedByApiKey = isAuthorizedRevitIngestRequest(request);
      let session = null;
      if (!authorizedByApiKey) {
        session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
        if (!session) {
          return;
        }
      }

      if (typeof storage.loadRevitImportState !== "function") {
        const payload = await storage.loadState();
        const scopedPayload = authorizedByApiKey ? payload : filterStateByUserProjects(payload, session.user);
        const compact = buildRevitImportStateFromState(scopedPayload, url.searchParams);
        if (!compact.project) {
          respondJson(response, 404, {
            ok: false,
            error: "No se encontro un proyecto activo para Revit.",
          });
          return;
        }

        respondJson(response, 200, {
          ok: true,
          ...compact,
          storage: storage.kind,
          storageLabel: storage.label,
        });
        return;
      }

      const compact = await storage.loadRevitImportState(
        url.searchParams.get("projectId") || url.searchParams.get("projectUid") || "",
      );
      if (!compact.project) {
        respondJson(response, 404, {
          ok: false,
          error: "No se encontro un proyecto activo para Revit.",
        });
        return;
      }

      if (!authorizedByApiKey && !userCanAccessProject(session.user, compact.project.id)) {
        respondJson(response, 403, {
          ok: false,
          error: "No tienes acceso al proyecto activo de ITEMICOSTOS.",
        });
        return;
      }

      respondJson(response, 200, {
        ok: true,
        ...compact,
        storage: storage.kind,
        storageLabel: storage.label,
      });
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

      const authorizedByApiKey = isAuthorizedRevitIngestRequest(request);

      const payload = await readJsonBody(request);
      const normalized = normalizeIncomingRevitExport(payload);
      if (!normalized.projectId) {
        respondJson(response, 400, { error: "projectId es obligatorio para importar metrado Revit." });
        return;
      }
      if (!authorizedByApiKey) {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "editor");
        if (!session) {
          return;
        }
        if (!userCanAccessProject(session.user, normalized.projectId)) {
          respondJson(response, 403, {
            ok: false,
            error: "No tienes acceso al proyecto solicitado.",
          });
          return;
        }
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
  console.log(
    accessControl.isEnabled()
      ? `Access control: habilitado (superadmin: ${accessControl.getSuperAdminEmail()})`
      : "Access control: deshabilitado",
  );

  if (health.storage === "mysql" && health.database) {
    console.log(`MySQL: ${health.host} / ${health.database}`);
  }
});

function createStorageAdapter() {
  return new MySQLStorage(buildMySqlConfig());
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

class MySQLStorage {
  constructor(config) {
    this.kind = "mysql";
    this.label = "MySQL";
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

  async loadAccessUsers() {
    await this.ensureReady();
    const [rows] = await this.pool.query(`
      SELECT
        MTRD_UsuarioAcceso_UID AS id,
        MTRD_UsuarioAcceso_Email AS email,
        MTRD_UsuarioAcceso_Nombre AS display_name,
        MTRD_UsuarioAcceso_Rol AS role_name,
        MTRD_UsuarioAcceso_Activo AS active_flag,
        MTRD_UsuarioAcceso_ProyectoIdsJson AS project_ids_json,
        MTRD_UsuarioAcceso_CreadoEn AS created_at,
        MTRD_UsuarioAcceso_ActualizadoEn AS updated_at
      FROM MTRD_UsuarioAcceso
      ORDER BY MTRD_UsuarioAcceso_Email ASC
    `);

    return {
      users: rows.map((row) => ({
        id: normalizeIdentifier(row.id, randomUUID()),
        email: String(row.email || "").trim().toLowerCase(),
        displayName: normalizeText(row.display_name, row.email),
        role: String(row.role_name || "viewer").trim().toLowerCase(),
        active: Number(row.active_flag) !== 0,
        projectIds: parseJsonArray(row.project_ids_json),
        createdAt: normalizeIsoString(row.created_at),
        updatedAt: normalizeIsoString(row.updated_at),
      })),
    };
  }

  async persistAccessUsers(payload) {
    await this.ensureReady();
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const incomingEmails = users
        .map((user) => String(user?.email || "").trim().toLowerCase())
        .filter(Boolean);
      if (incomingEmails.length > 0) {
        await connection.query(`
          UPDATE MTRD_UsuarioAcceso
          SET MTRD_UsuarioAcceso_Activo = 0,
              MTRD_UsuarioAcceso_ActualizadoEn = CURRENT_TIMESTAMP
          WHERE MTRD_UsuarioAcceso_Email NOT IN (?)
        `, [incomingEmails]);
      }

      for (const user of users) {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) {
          continue;
        }
        const role = normalizePublicRole(user.role) || "viewer";
        const projectIds = Array.isArray(user.projectIds) ? user.projectIds : [];
        await connection.query(`
          INSERT INTO MTRD_UsuarioAcceso (
            MTRD_UsuarioAcceso_UID,
            MTRD_UsuarioAcceso_Email,
            MTRD_UsuarioAcceso_Nombre,
            MTRD_UsuarioAcceso_Rol,
            MTRD_UsuarioAcceso_Activo,
            MTRD_UsuarioAcceso_ProyectoIdsJson,
            MTRD_UsuarioAcceso_CreadoEn,
            MTRD_UsuarioAcceso_ActualizadoEn
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            MTRD_UsuarioAcceso_Nombre = VALUES(MTRD_UsuarioAcceso_Nombre),
            MTRD_UsuarioAcceso_Rol = VALUES(MTRD_UsuarioAcceso_Rol),
            MTRD_UsuarioAcceso_Activo = VALUES(MTRD_UsuarioAcceso_Activo),
            MTRD_UsuarioAcceso_ProyectoIdsJson = VALUES(MTRD_UsuarioAcceso_ProyectoIdsJson),
            MTRD_UsuarioAcceso_ActualizadoEn = VALUES(MTRD_UsuarioAcceso_ActualizadoEn)
        `, [
          normalizeIdentifier(user.id, randomUUID()),
          email,
          normalizeText(user.displayName, email),
          role,
          user.active === false ? 0 : 1,
          JSON.stringify(role === "superadmin" ? ["*"] : projectIds),
          toMySqlDateTime(user.createdAt),
          toMySqlDateTime(user.updatedAt || Date.now()),
        ]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async persistAccessSession(session) {
    await this.ensureReady();
    await this.pool.query(`
      INSERT INTO MTRD_SesionAcceso (
        MTRD_SesionAcceso_TokenHash,
        MTRD_SesionAcceso_Email,
        MTRD_SesionAcceso_ExpiraEn,
        MTRD_SesionAcceso_ProfileImageUrl
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        MTRD_SesionAcceso_Email = VALUES(MTRD_SesionAcceso_Email),
        MTRD_SesionAcceso_ExpiraEn = VALUES(MTRD_SesionAcceso_ExpiraEn),
        MTRD_SesionAcceso_ProfileImageUrl = VALUES(MTRD_SesionAcceso_ProfileImageUrl),
        MTRD_SesionAcceso_ActualizadoEn = CURRENT_TIMESTAMP
    `, [
      String(session?.tokenHash || ""),
      String(session?.email || "").trim().toLowerCase(),
      toMySqlDateTime(session?.expiresAt),
      normalizeProfileImageUrlForStorage(session?.profileImageUrl || ""),
    ]);
  }

  async loadAccessSession(tokenHash) {
    await this.ensureReady();
    const [rows] = await this.pool.query(`
      SELECT
        MTRD_SesionAcceso_Email AS email,
        MTRD_SesionAcceso_ExpiraEn AS expires_at,
        MTRD_SesionAcceso_ProfileImageUrl AS profile_image_url
      FROM MTRD_SesionAcceso
      WHERE MTRD_SesionAcceso_TokenHash = ?
      LIMIT 1
    `, [String(tokenHash || "")]);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      email: row.email,
      expiresAt: normalizeIsoString(row.expires_at),
      profileImageUrl: row.profile_image_url || "",
    };
  }

  async deleteAccessSession(tokenHash) {
    await this.ensureReady();
    await this.pool.query(`
      DELETE FROM MTRD_SesionAcceso
      WHERE MTRD_SesionAcceso_TokenHash = ?
    `, [String(tokenHash || "")]);
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
        MTRD_Item_TipoMetrado AS item_tipo_metrado,
        MTRD_Item_ReglaMetrado AS item_regla_metrado
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
          MTRD_SnapshotItem_TipoMetrado AS item_tipo_metrado,
          MTRD_SnapshotItem_ReglaMetrado AS item_regla_metrado
        FROM MTRD_SnapshotItem
        WHERE MTRD_SnapshotItem_KEY_Snapshot IN (?)
        ORDER BY MTRD_SnapshotItem_KEY_Snapshot ASC, MTRD_SnapshotItem_Orden ASC
      `, [snapshotIds]))[0]
      : [];

    const [revitExportRows] = await this.pool.query(`
      SELECT
        MTRD_RevitExport_KEY_Proyecto AS project_id,
        MTRD_RevitExport_ID AS export_id,
        MTRD_RevitExport_UID AS export_uid,
        MTRD_RevitExport_RutaModelo AS model_path,
        MTRD_RevitExport_RevitVersion AS revit_version,
        MTRD_RevitExport_AddinVersion AS addin_version,
        MTRD_RevitExport_UsuarioNombre AS user_name,
        MTRD_RevitExport_FechaExportacion AS exported_at,
        MTRD_RevitExport_TotalElementos AS total_rows,
        MTRD_RevitExport_TotalCantidad AS total_quantity,
        MTRD_RevitExport_TotalItemsVinculados AS linked_items,
        MTRD_RevitExport_CreadoEn AS created_at
      FROM MTRD_RevitExport
      WHERE MTRD_RevitExport_KEY_Proyecto IN (?)
      ORDER BY MTRD_RevitExport_KEY_Proyecto ASC,
        MTRD_RevitExport_FechaExportacion DESC,
        MTRD_RevitExport_ID DESC
    `, [projectIds]);

    const latestRevitMetaKeys = projectRows.map((row) => `revit:lastExport:${row.project_uid}`);
    const [latestRevitMetaRows] = latestRevitMetaKeys.length > 0
      ? await this.pool.query(`
        SELECT
          MTRD_AppMeta_Clave AS meta_key,
          MTRD_AppMeta_Valor AS meta_value
        FROM MTRD_AppMeta
        WHERE MTRD_AppMeta_Clave IN (?)
      `, [latestRevitMetaKeys])
      : [[]];

    const itemsByProject = groupRowsByKey(itemRows, "project_id");
    const collapsedByProject = groupRowsByKey(collapsedRows, "project_id");
    const auditsByProject = groupRowsByKey(auditRows, "project_id");
    const snapshotsByProject = groupRowsByKey(snapshotRows, "project_id");
    const snapshotItemsBySnapshot = groupRowsByKey(snapshotItemRows, "snapshot_id");
    const revitExportsByProject = groupRowsByKey(revitExportRows, "project_id");
    const latestRevitExportByProjectUid = new Map(
      latestRevitMetaRows
        .map((entry) => {
          const key = String(entry.meta_key || "");
          const projectUid = key.startsWith("revit:lastExport:")
            ? key.slice("revit:lastExport:".length)
            : "";
          const value = parseJsonObject(entry.meta_value);
          return projectUid && value ? [projectUid, value] : null;
        })
        .filter(Boolean),
    );

    const projects = projectRows.map((projectRow) => {
      const projectItems = itemsByProject.get(projectRow.project_id) || [];
      const projectCollapsed = collapsedByProject.get(projectRow.project_id) || [];
      const projectAudits = auditsByProject.get(projectRow.project_id) || [];
      const projectSnapshots = snapshotsByProject.get(projectRow.project_id) || [];
      const projectRevitExports = revitExportsByProject.get(projectRow.project_id) || [];
      const latestRevitExport = projectRevitExports[0] || latestRevitExportByProjectUid.get(projectRow.project_uid) || null;

      const snapshotsById = new Map(projectSnapshots.map((snapshot) => [snapshot.snapshot_id, snapshot.snapshot_uid]));
      const snapshots = projectSnapshots.map((snapshot) => {
        const rows = addCodigoPartidaToRows((snapshotItemsBySnapshot.get(snapshot.snapshot_id) || []).map((entry) => ({
          id: entry.item_uid,
          level: Number(entry.item_level || 0),
          codificacion: entry.item_codificacion || "",
          descripcion: normalizeDescriptionText(entry.item_descripcion),
          unidad: entry.item_unidad || "",
          costo: normalizeDecimalString(entry.item_costo),
          metradoTradicional: normalizeDecimalString(entry.item_metrado_tradicional),
          metradoBim: normalizeDecimalString(entry.item_metrado_bim),
          tipoMetrado: entry.item_tipo_metrado || "",
          reglaMetrado: normalizeReglaMetrado(entry.item_tipo_metrado, entry.item_regla_metrado),
        })));

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
        rows: addCodigoPartidaToRows(projectItems.map((entry) => ({
          id: entry.item_uid,
          level: Number(entry.item_level || 0),
          codificacion: entry.item_codificacion || "",
          descripcion: normalizeDescriptionText(entry.item_descripcion),
          unidad: entry.item_unidad || "",
          costo: normalizeDecimalString(entry.item_costo),
          metradoTradicional: normalizeDecimalString(entry.item_metrado_tradicional),
          metradoBim: normalizeDecimalString(entry.item_metrado_bim),
          tipoMetrado: entry.item_tipo_metrado || "",
          reglaMetrado: normalizeReglaMetrado(entry.item_tipo_metrado, entry.item_regla_metrado),
        }))),
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
        latestRevitExport: latestRevitExport
          ? {
            id: latestRevitExport.export_id ?? latestRevitExport.id ?? null,
            uid: latestRevitExport.export_uid || latestRevitExport.uid || "",
            modelPath: latestRevitExport.model_path || latestRevitExport.modelPath || "",
            revitVersion: latestRevitExport.revit_version || latestRevitExport.revitVersion || "",
            addinVersion: latestRevitExport.addin_version || latestRevitExport.addinVersion || "",
            userName: latestRevitExport.user_name || latestRevitExport.userName || "Revit Addin",
            exportedAt: normalizeIsoString(latestRevitExport.exported_at || latestRevitExport.exportedAt),
            createdAt: normalizeIsoString(latestRevitExport.created_at || latestRevitExport.createdAt),
            totalRows: Number(latestRevitExport.total_rows ?? latestRevitExport.totalRows ?? 0),
            totalQuantity: Number(latestRevitExport.total_quantity ?? latestRevitExport.totalQuantity ?? 0),
            linkedItems: Number(latestRevitExport.linked_items ?? latestRevitExport.linkedItems ?? 0),
          }
          : null,
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

  async loadRevitImportState(projectUid = "") {
    await this.ensureReady();
    const [projectRows] = await this.pool.query(`
      SELECT
        MTRD_Proyecto_ID AS project_id,
        MTRD_Proyecto_UID AS project_uid,
        MTRD_Proyecto_Nombre AS project_name
      FROM MTRD_Proyecto
      WHERE MTRD_Proyecto_Estado = 1
      ORDER BY MTRD_Proyecto_CreadoEn ASC, MTRD_Proyecto_Nombre ASC
    `);

    if (projectRows.length === 0) {
      return {
        currentProjectId: null,
        projectId: null,
        projectName: "",
        project: null,
        rows: [],
      };
    }

    const requestedProjectUid = normalizeIdentifier(projectUid, "");
    const [metaRows] = await this.pool.query(`
      SELECT MTRD_AppMeta_Valor AS current_project_id
      FROM MTRD_AppMeta
      WHERE MTRD_AppMeta_Clave = 'currentProjectId'
      LIMIT 1
    `);
    const storedCurrentProjectId = metaRows[0]?.current_project_id || "";
    const selectedProjectUid = resolveExistingProjectUid(
      projectRows,
      requestedProjectUid,
    ) || resolveExistingProjectUid(
      projectRows,
      storedCurrentProjectId,
    ) || projectRows[0].project_uid;
    const selectedProject = projectRows.find((project) => project.project_uid === selectedProjectUid)
      || projectRows[0];

    const [itemRows] = await this.pool.query(`
      SELECT
        MTRD_Item_UID AS item_uid,
        MTRD_Item_Nivel AS item_level,
        MTRD_Item_Codificacion AS item_codificacion,
        MTRD_Item_Descripcion AS item_descripcion,
        MTRD_Item_Unidad AS item_unidad,
        MTRD_Item_Costo AS item_costo,
        MTRD_Item_MetradoBim AS item_metrado_bim,
        MTRD_Item_TipoMetrado AS item_tipo_metrado,
        MTRD_Item_ReglaMetrado AS item_regla_metrado
      FROM MTRD_Item
      WHERE MTRD_Item_KEY_Proyecto = ?
      ORDER BY MTRD_Item_Orden ASC
    `, [selectedProject.project_id]);

    const rows = addCodigoPartidaToRows(itemRows.map((entry) => ({
      id: entry.item_uid,
      level: Number(entry.item_level || 0),
      codificacion: entry.item_codificacion || "",
      descripcion: normalizeDescriptionText(entry.item_descripcion),
      unidad: entry.item_unidad || "",
      costo: normalizeDecimalString(entry.item_costo),
      metradoBim: normalizeDecimalString(entry.item_metrado_bim),
      tipoMetrado: entry.item_tipo_metrado || "",
      reglaMetrado: normalizeReglaMetrado(entry.item_tipo_metrado, entry.item_regla_metrado),
    })));

    const project = {
      id: selectedProject.project_uid,
      name: selectedProject.project_name,
      rows,
    };

    return {
      currentProjectId: selectedProject.project_uid,
      projectId: selectedProject.project_uid,
      projectName: selectedProject.project_name,
      project,
      rows,
    };
  }

  async persistState(payload) {
    await this.ensureReady();
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [existingProjectRows] = await connection.query(`
        SELECT
          MTRD_Proyecto_ID AS project_id,
          MTRD_Proyecto_UID AS project_uid,
          MTRD_Proyecto_Estado AS project_state
        FROM MTRD_Proyecto
      `);
      const existingProjectByUid = new Map(
        existingProjectRows.map((row) => [String(row.project_uid || ""), row]),
      );
      const incomingProjectUids = new Set(
        payload.projects.map((project, index) => (
          normalizeIdentifier(project.id, `project-${index + 1}`)
        )),
      );
      const inactiveProjectIds = existingProjectRows
        .filter((row) => !incomingProjectUids.has(String(row.project_uid || "")))
        .map((row) => row.project_id)
        .filter(Boolean);
      if (inactiveProjectIds.length > 0) {
        await connection.query(`
          UPDATE MTRD_Proyecto
          SET
            MTRD_Proyecto_Estado = 0,
            MTRD_Proyecto_ActualizadoEn = CURRENT_TIMESTAMP
          WHERE MTRD_Proyecto_ID IN (?)
        `, [inactiveProjectIds]);
      }
      await connection.query(`
        DELETE FROM MTRD_AppMeta
        WHERE MTRD_AppMeta_Clave = 'currentProjectId'
      `);

      for (let projectIndex = 0; projectIndex < payload.projects.length; projectIndex += 1) {
        const project = payload.projects[projectIndex];
        const projectUid = normalizeIdentifier(project.id, `project-${projectIndex + 1}`);
        const createdAt = toMySqlDateTime(project.createdAt);
        const updatedAt = toMySqlDateTime(project.updatedAt || project.createdAt);
        const existingProject = existingProjectByUid.get(projectUid);
        let projectId = existingProject?.project_id || null;

        if (projectId) {
          await connection.query(`
            UPDATE MTRD_Proyecto
            SET
              MTRD_Proyecto_Nombre = ?,
              MTRD_Proyecto_ActualizadoEn = ?,
              MTRD_Proyecto_Estado = 1
            WHERE MTRD_Proyecto_ID = ?
          `, [
            normalizeText(project.name, `Proyecto ${projectIndex + 1}`),
            updatedAt,
            projectId,
          ]);
        } else {
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
            normalizeText(project.name, `Proyecto ${projectIndex + 1}`),
            createdAt,
            updatedAt,
          ]);
          projectId = projectInsert.insertId;
          existingProjectByUid.set(projectUid, {
            project_id: projectId,
            project_uid: projectUid,
            project_state: 1,
          });
        }

        await connection.query(`
          DELETE FROM MTRD_ItemColapsado
          WHERE MTRD_ItemColapsado_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE FROM MTRD_AuditoriaItem
          WHERE MTRD_AuditoriaItem_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE snapshotItem
          FROM MTRD_SnapshotItem snapshotItem
          INNER JOIN MTRD_Snapshot snapshot
            ON snapshot.MTRD_Snapshot_ID = snapshotItem.MTRD_SnapshotItem_KEY_Snapshot
          WHERE snapshot.MTRD_Snapshot_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE FROM MTRD_Snapshot
          WHERE MTRD_Snapshot_KEY_Proyecto = ?
        `, [projectId]);

        const rows = Array.isArray(project.rows) ? project.rows : [];
        const itemIdByUid = new Map();
        const [existingItemRows] = await connection.query(`
          SELECT
            MTRD_Item_ID AS item_id,
            MTRD_Item_UID AS item_uid,
            MTRD_Item_MetradoBim AS item_metrado_bim
          FROM MTRD_Item
          WHERE MTRD_Item_KEY_Proyecto = ?
          FOR UPDATE
        `, [projectId]);
        const existingItemByUid = new Map(
          existingItemRows.map((row) => [String(row.item_uid || ""), row]),
        );
        const incomingItemUids = new Set();
        if (existingItemRows.length > 0) {
          await connection.query(`
            UPDATE MTRD_Item
            SET MTRD_Item_Orden = MTRD_Item_Orden + 1000000
            WHERE MTRD_Item_KEY_Proyecto = ?
          `, [projectId]);
        }

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const rowUid = normalizeIdentifier(row.id, `row-${projectIndex + 1}-${rowIndex + 1}`);
          const existingItem = existingItemByUid.get(rowUid);
          const metradoBim = existingItem
            ? parseDecimal(existingItem.item_metrado_bim)
            : parseDecimal(row.metradoBim);
          incomingItemUids.add(rowUid);

          const itemValues = [
            rowIndex + 1,
            Number.parseInt(row.level || 0, 10) || 0,
            String(row.codificacion || ""),
            normalizeDescriptionText(row.descripcion),
            String(row.unidad || ""),
            parseDecimal(row.costo),
            parseDecimal(row.metradoTradicional ?? row.metrado),
            metradoBim,
            String(row.tipoMetrado || ""),
            normalizeReglaMetrado(row.tipoMetrado, row.reglaMetrado),
          ];

          if (existingItem?.item_id) {
            await connection.query(`
              UPDATE MTRD_Item
              SET
                MTRD_Item_Orden = ?,
                MTRD_Item_Nivel = ?,
                MTRD_Item_Codificacion = ?,
                MTRD_Item_Descripcion = ?,
                MTRD_Item_Unidad = ?,
                MTRD_Item_Costo = ?,
                MTRD_Item_MetradoTradicional = ?,
                MTRD_Item_MetradoBim = ?,
                MTRD_Item_TipoMetrado = ?,
                MTRD_Item_ReglaMetrado = ?,
                MTRD_Item_ActualizadoEn = CURRENT_TIMESTAMP
              WHERE MTRD_Item_ID = ?
            `, [...itemValues, existingItem.item_id]);
            itemIdByUid.set(rowUid, existingItem.item_id);
          } else {
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
                MTRD_Item_TipoMetrado,
                MTRD_Item_ReglaMetrado
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              projectId,
              rowUid,
              ...itemValues,
            ]);
            itemIdByUid.set(rowUid, itemInsert.insertId);
          }
        }

        const removedItemUids = existingItemRows
          .map((row) => String(row.item_uid || ""))
          .filter((itemUid) => itemUid && !incomingItemUids.has(itemUid));
        if (removedItemUids.length > 0) {
          await connection.query(`
            DELETE FROM MTRD_Item
            WHERE MTRD_Item_KEY_Proyecto = ?
              AND MTRD_Item_UID IN (?)
          `, [projectId, removedItemUids]);
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
                MTRD_SnapshotItem_TipoMetrado,
                MTRD_SnapshotItem_ReglaMetrado
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              snapshotId,
              normalizeIdentifier(row.id, `snapshot-row-${snapshotRowIndex + 1}`),
              snapshotRowIndex + 1,
              Number.parseInt(row.level || 0, 10) || 0,
              String(row.codificacion || ""),
              normalizeDescriptionText(row.descripcion),
              String(row.unidad || ""),
              parseDecimal(row.costo),
              parseDecimal(row.metradoTradicional ?? row.metrado),
              parseDecimal(row.metradoBim),
              String(row.tipoMetrado || ""),
              normalizeReglaMetrado(row.tipoMetrado, row.reglaMetrado),
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
          await connection.query(`
            UPDATE MTRD_Item
            SET
              MTRD_Item_MetradoBim = ?,
              MTRD_Item_ActualizadoEn = CURRENT_TIMESTAMP
            WHERE MTRD_Item_ID = ?
          `, [quantity, itemId]);
        }
        updatedItems = totalItemsVinculados;
      }

      const latestExportMeta = {
        id: exportId,
        uid: payload.exportUid,
        modelPath: payload.modelPath,
        revitVersion: payload.revitVersion,
        addinVersion: payload.addinVersion,
        userName: payload.exportedBy,
        exportedAt: normalizeIsoString(payload.exportedAt),
        createdAt: new Date().toISOString(),
        totalRows: payload.rows.length,
        totalQuantity,
        linkedItems: totalItemsVinculados,
      };
      await connection.query(`
        INSERT INTO MTRD_AppMeta (MTRD_AppMeta_Clave, MTRD_AppMeta_Valor)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          MTRD_AppMeta_Valor = VALUES(MTRD_AppMeta_Valor)
      `, [
        `revit:lastExport:${payload.projectId}`,
        JSON.stringify(latestExportMeta),
      ]);

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

async function ensureAuthorizedRequest(accessControlManager, request, response, minRole) {
  const authorization = await accessControlManager.authorizeRequest(request, minRole);
  if (!authorization.ok) {
    respondJson(response, authorization.status, {
      ok: false,
      error: authorization.error,
      accessControl: accessControlManager.getPublicSettings(),
    });
    return null;
  }

  return authorization;
}

function createAccessControlManager(filePath, options = {}) {
  const enabled = parseBooleanEnv(process.env.ACCESS_CONTROL_ENABLED, true);
  const roleRank = {
    viewer: 1,
    editor: 2,
    admin: 3,
    superadmin: 4,
  };
  const superAdminEmail = normalizeAuthEmail(
    process.env.ACCESS_SUPERADMIN_EMAIL || "rjason381@gmail.com",
  );
  const googleAuthEnabled = parseBooleanEnv(process.env.ACCESS_GOOGLE_AUTH_ENABLED, true);
  const googleClientId = String(process.env.GOOGLE_AUTH_CLIENT_ID || "").trim();
  const configuredSessionTtlHours = Number.parseInt(
    String(process.env.ACCESS_SESSION_TTL_HOURS || "12"),
    10,
  );
  const sessionTtlHours =
    Number.isFinite(configuredSessionTtlHours) && configuredSessionTtlHours > 0
      ? configuredSessionTtlHours
      : 12;
  const sessionTtlMs = sessionTtlHours * 60 * 60 * 1000;
  const configuredUsersSyncMs = Number.parseInt(
    String(process.env.ACCESS_USERS_SYNC_MS || "10000"),
    10,
  );
  const usersSyncMs =
    Number.isFinite(configuredUsersSyncMs) && configuredUsersSyncMs > 0
      ? configuredUsersSyncMs
      : 10000;
  const prefersRemoteUsersStore = false;
  const sessions = new Map();
  let lastUsersSyncAt = 0;
  let disableExternalUsersStore = false;
  let externalUsersStoreDisabledReason = "";

  const store = loadOrBootstrapStore();

  return {
    isEnabled() {
      return enabled;
    },
    getSuperAdminEmail() {
      return superAdminEmail;
    },
    getPublicSettings() {
      return {
        enabled,
        sessionTtlHours,
        googleAuthEnabled: enabled && googleAuthEnabled,
        googleClientId: enabled && googleAuthEnabled ? googleClientId : "",
      };
    },
    async loginWithGoogle(idTokenInput) {
      if (!enabled) {
        return {
          ok: false,
          status: 409,
          error: "Control de accesos deshabilitado.",
        };
      }

      if (!googleAuthEnabled) {
        return {
          ok: false,
          status: 409,
          error: "Inicio de sesion con Google deshabilitado.",
        };
      }

      if (!googleClientId) {
        return {
          ok: false,
          status: 500,
          error: "Falta configurar GOOGLE_AUTH_CLIENT_ID en el backend.",
        };
      }

      const idToken = String(idTokenInput || "").trim();
      if (!idToken) {
        return {
          ok: false,
          status: 400,
          error: "idToken es obligatorio.",
        };
      }

      const usersSyncPromise = ensureUsersStoreSynchronized();
      const verification = await verifyGoogleIdToken(idToken, googleClientId);
      if (!verification.ok) {
        usersSyncPromise.catch(() => {});
        return {
          ok: false,
          status: 401,
          error: verification.error,
        };
      }

      const googlePayload = verification.payload;
      const email = normalizeAuthEmail(googlePayload.email);
      if (!email) {
        return {
          ok: false,
          status: 401,
          error: "No se pudo validar el correo de Google.",
        };
      }

      const verifiedFlag = String(googlePayload.email_verified || "").toLowerCase();
      if (!(verifiedFlag === "true" || verifiedFlag === "1")) {
        usersSyncPromise.catch(() => {});
        return {
          ok: false,
          status: 401,
          error: "Tu correo de Google no esta verificado.",
        };
      }

      await usersSyncPromise;
      let user = getUserByEmail(email);
      if (email === superAdminEmail) {
        user = await ensureSuperAdminUser(user, googlePayload.name || "Superadmin");
      }

      if (!user || !user.active) {
        return {
          ok: false,
          status: 403,
          error: "Usuario no autorizado para acceder.",
        };
      }
      if (!userCanAccessAnyProject(user)) {
        return {
          ok: false,
          status: 403,
          error: "Tu cuenta no tiene proyectos asignados. Contacta al superadmin.",
        };
      }

      const token = createSessionToken();
      const expiresAt = Date.now() + sessionTtlMs;
      const profileImageUrl = normalizeProfileImageUrl(googlePayload.picture || "");
      sessions.set(token, {
        token,
        email: user.email,
        expiresAt,
        profileImageUrl,
      });
      await persistSessionStore({
        token,
        email: user.email,
        expiresAt,
        profileImageUrl,
      });

      return {
        ok: true,
        status: 200,
        token,
        expiresAt,
        user: toPublicUser(user, { profileImageUrl }),
      };
    },
    async authorizeRequest(request, minRole = "viewer", optionsInput = {}) {
      if (!enabled) {
        return {
          ok: true,
          status: 200,
          token: "",
          user: {
            email: "sistema@local",
            role: "superadmin",
            displayName: "Sistema local",
          },
        };
      }

      const requestedRole = normalizeAuthRole(minRole, "viewer");
      const token = readRequestSessionToken(request);
      if (!token) {
        return {
          ok: false,
          status: 401,
          error: "Sesion no autenticada.",
        };
      }

      pruneExpiredSessions();
      let session = sessions.get(token);
      if (!session) {
        session = await loadSessionFromStore(token);
        if (session) {
          sessions.set(token, session);
        }
      }
      if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(token);
        await deleteSessionFromStore(token);
        return {
          ok: false,
          status: 401,
          error: "Sesion expirada o invalida.",
        };
      }

      await ensureUsersStoreSynchronized(Boolean(optionsInput.forceUserSync));
      const user = getUserByEmail(session.email);
      if (!user || !user.active) {
        sessions.delete(token);
        await deleteSessionFromStore(token);
        return {
          ok: false,
          status: 401,
          error: "Sesion expirada o invalida.",
        };
      }

      if (!userHasRole(user.role, requestedRole)) {
        return {
          ok: false,
          status: 403,
          error: "No tienes permisos para esta accion.",
        };
      }

      session.expiresAt = Date.now() + sessionTtlMs;
      sessions.set(token, session);
      await persistSessionStore(session);

      return {
        ok: true,
        status: 200,
        token,
        expiresAt: session.expiresAt,
        user: toPublicUser(user, { profileImageUrl: session.profileImageUrl }),
      };
    },
    async logoutByToken(token) {
      if (!enabled) {
        return;
      }
      const safeToken = String(token || "").trim();
      if (!safeToken) {
        return;
      }
      sessions.delete(safeToken);
      await deleteSessionFromStore(safeToken);
    },
    async listUsers() {
      await ensureUsersStoreSynchronized();
      return [...store.users]
        .map((user) => toPublicUser(user))
        .sort((left, right) => left.email.localeCompare(right.email));
    },
    async upsertUser(payload, actorUser, optionsInput = {}) {
      if (!enabled) {
        return {
          ok: false,
          status: 409,
          error: "Control de accesos deshabilitado.",
        };
      }

      await ensureUsersStoreSynchronized(true);
      const actorRole = normalizeAuthRole(actorUser?.role, "viewer");
      const actorCanManageSuperAdmin = actorRole === "superadmin";
      if (!userHasRole(actorRole, "superadmin")) {
        return {
          ok: false,
          status: 403,
          error: "Solo un superadmin puede gestionar usuarios.",
        };
      }

      const email = normalizeAuthEmail(payload?.email);
      if (!email) {
        return {
          ok: false,
          status: 400,
          error: "Email invalido.",
        };
      }

      const requestedRole = normalizeAuthRole(payload?.role, "viewer");
      if (requestedRole === "superadmin" && !actorCanManageSuperAdmin) {
        return {
          ok: false,
          status: 403,
          error: "Solo un superadmin puede asignar rol superadmin.",
        };
      }

      const existing = getUserByEmail(email);
      if (existing && existing.role === "superadmin" && !actorCanManageSuperAdmin) {
        return {
          ok: false,
          status: 403,
          error: "Solo un superadmin puede editar a otro superadmin.",
        };
      }

      const displayName = normalizeText(
        payload?.displayName,
        existing?.displayName || email,
      );
      const active = payload?.active !== false;
      const availableProjectIds = normalizeProjectIdsForUser(
        optionsInput?.availableProjectIds,
        { allowWildcard: false },
      );
      const availableProjectIdSet = new Set(availableProjectIds);
      const requestedProjectIds = normalizeProjectIdsForUser(
        payload?.projectIds,
        { allowWildcard: false },
      );
      const projectIds = requestedRole === "superadmin"
        ? ["*"]
        : requestedProjectIds.filter((projectId) => (
          availableProjectIdSet.size === 0 || availableProjectIdSet.has(projectId)
        ));
      if (requestedRole !== "superadmin" && active && availableProjectIdSet.size > 0 && projectIds.length === 0) {
        return {
          ok: false,
          status: 400,
          error: "Debes asignar al menos un proyecto al usuario activo.",
        };
      }

      if (existing) {
        existing.displayName = displayName;
        existing.role = requestedRole;
        existing.active = active;
        existing.projectIds = projectIds;
        existing.updatedAt = new Date().toISOString();

        if (!canPersistSuperAdminState(existing.email, existing.role, existing.active)) {
          return {
            ok: false,
            status: 400,
            error: "Debe existir al menos un superadmin activo.",
          };
        }

        await persistUsersStore();
        return {
          ok: true,
          status: 200,
          user: toPublicUser(existing),
        };
      }

      const createdAt = new Date().toISOString();
      const user = {
        id: randomUUID(),
        email,
        displayName,
        role: requestedRole,
        active,
        projectIds,
        createdAt,
        updatedAt: createdAt,
      };
      store.users.push(user);
      if (!canPersistSuperAdminState()) {
        return {
          ok: false,
          status: 400,
          error: "Debe existir al menos un superadmin activo.",
        };
      }
      await persistUsersStore();

      return {
        ok: true,
        status: 200,
        user: toPublicUser(user),
      };
    },
  };

  function loadOrBootstrapStore() {
    const fallbackStore = {
      version: 1,
      users: [],
    };

    if (!enabled) {
      return fallbackStore;
    }

    let shouldWriteStore = false;
    let parsedStore = fallbackStore;

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.users)) {
          parsedStore = {
            version: Number(parsed.version || 1),
            users: parsed.users
              .map((user) => sanitizeStoredUser(user))
              .filter(Boolean),
          };
          const hasLegacyPasswordFields = parsed.users.some((user) => {
            if (!user || typeof user !== "object") {
              return false;
            }
            return "passwordHash" in user || "passwordSalt" in user;
          });
          if (hasLegacyPasswordFields) {
            shouldWriteStore = true;
          }
        } else {
          shouldWriteStore = true;
        }
      } else if (!prefersRemoteUsersStore) {
        shouldWriteStore = true;
      }
    } catch {
      shouldWriteStore = !prefersRemoteUsersStore;
      parsedStore = fallbackStore;
    }

    const hasSuperAdmin = parsedStore.users.some(
      (user) => user.email === superAdminEmail && user.active && user.role === "superadmin",
    );
    if (!hasSuperAdmin) {
      parsedStore.users.push(
        createUserRecord({
          email: superAdminEmail,
          role: "superadmin",
          displayName: "Superadmin",
          active: true,
        }),
      );
      shouldWriteStore = true;
    }

    if (shouldWriteStore && !prefersRemoteUsersStore) {
      writeStoreFile(parsedStore);
    }

    return parsedStore;
  }

  function sanitizeStoredUser(user) {
    if (!user || typeof user !== "object") {
      return null;
    }

    const email = normalizeAuthEmail(user.email);
    if (!email) {
      return null;
    }

    const role = normalizeAuthRole(user.role, email === superAdminEmail ? "superadmin" : "viewer");
    const displayName = normalizeText(user.displayName, email);
    const active = user.active !== false;
    const projectIds = normalizeProjectIdsForUser(
      user.projectIds,
      { allowWildcard: role === "superadmin" },
    );
    const createdAt = normalizeIsoString(user.createdAt || Date.now());
    const updatedAt = normalizeIsoString(user.updatedAt || createdAt);

    return {
      id: normalizeIdentifier(user.id, randomUUID()),
      email,
      displayName,
      role,
      active,
      projectIds: role === "superadmin" ? ["*"] : projectIds,
      createdAt,
      updatedAt,
    };
  }

  function createUserRecord({
    email,
    role = "viewer",
    displayName = "",
    active = true,
    projectIds = [],
  }) {
    const nowIso = new Date().toISOString();
    const normalizedRole = normalizeAuthRole(role, "viewer");
    return {
      id: randomUUID(),
      email: normalizeAuthEmail(email),
      displayName: normalizeText(displayName, email),
      role: normalizedRole,
      active: active !== false,
      projectIds: normalizedRole === "superadmin"
        ? ["*"]
        : normalizeProjectIdsForUser(projectIds, { allowWildcard: false }),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  function createSessionToken() {
    return createHash("sha256")
      .update(`${randomUUID()}|${Date.now()}|${randomBytes(32).toString("hex")}`)
      .digest("hex");
  }

  function pruneExpiredSessions() {
    if (sessions.size === 0) {
      return;
    }

    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (!session || session.expiresAt <= now) {
        sessions.delete(token);
      }
    }
  }

  function getUserByEmail(email) {
    const normalized = normalizeAuthEmail(email);
    if (!normalized) {
      return null;
    }
    return store.users.find((user) => user.email === normalized) || null;
  }

  async function ensureSuperAdminUser(existingUser, displayNameInput) {
    const displayName = normalizeText(displayNameInput, "Superadmin");

    if (existingUser) {
      existingUser.role = "superadmin";
      existingUser.active = true;
      existingUser.displayName = displayName;
      existingUser.projectIds = ["*"];
      existingUser.updatedAt = new Date().toISOString();
      await persistUsersStore();
      return existingUser;
    }

    const createdUser = createUserRecord({
      email: superAdminEmail,
      role: "superadmin",
      displayName,
      active: true,
      projectIds: ["*"],
    });
    store.users.push(createdUser);
    await persistUsersStore();
    return createdUser;
  }

  function toPublicUser(user, options = {}) {
    const role = normalizeAuthRole(user?.role, "viewer");
    const profileImageUrl = normalizeProfileImageUrl(options.profileImageUrl || "");
    return {
      id: normalizeIdentifier(user?.id, ""),
      email: normalizeAuthEmail(user?.email),
      displayName: normalizeText(user?.displayName, normalizeAuthEmail(user?.email)),
      role,
      active: user?.active !== false,
      projectIds: role === "superadmin"
        ? ["*"]
        : normalizeProjectIdsForUser(user?.projectIds, { allowWildcard: false }),
      profileImageUrl,
      createdAt: normalizeIsoString(user?.createdAt || Date.now()),
      updatedAt: normalizeIsoString(user?.updatedAt || Date.now()),
    };
  }

  function normalizeProfileImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    try {
      const url = new URL(raw);
      if (!["https:", "http:"].includes(url.protocol)) {
        return "";
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  function userHasRole(actualRole, requiredRole) {
    const actual = normalizeAuthRole(actualRole, "viewer");
    const required = normalizeAuthRole(requiredRole, "viewer");
    return Number(roleRank[actual] || 0) >= Number(roleRank[required] || 0);
  }

  function normalizeAuthRole(value, fallbackRole) {
    const role = String(value || "").trim().toLowerCase();
    return roleRank[role] ? role : fallbackRole;
  }

  function normalizeAuthEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeProjectIdsForUser(projectIdsInput, { allowWildcard = false } = {}) {
    const normalized = normalizeProjectIdsInput(projectIdsInput, { allowWildcard });
    if (allowWildcard && normalized.includes("*")) {
      return ["*"];
    }
    return normalized;
  }

  function userCanAccessAnyProject(user) {
    const role = normalizeAuthRole(user?.role, "viewer");
    if (role === "superadmin") {
      return true;
    }
    const projectIds = normalizeProjectIdsForUser(user?.projectIds, { allowWildcard: true });
    if (projectIds.includes("*")) {
      return true;
    }
    return projectIds.length > 0;
  }

  async function persistSessionStore(session) {
    const externalStore = getExternalSessionStore();
    if (!externalStore) {
      return;
    }
    await externalStore.persistAccessSession({
      tokenHash: hashAccessSessionToken(session.token),
      email: normalizeAuthEmail(session.email),
      expiresAt: normalizeIsoString(session.expiresAt),
      profileImageUrl: normalizeProfileImageUrl(session.profileImageUrl || ""),
    });
  }

  async function loadSessionFromStore(token) {
    const externalStore = getExternalSessionStore();
    if (!externalStore) {
      return null;
    }
    const session = await externalStore.loadAccessSession(hashAccessSessionToken(token));
    if (!session?.email || !session?.expiresAt) {
      return null;
    }
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      return null;
    }
    return {
      token,
      email: normalizeAuthEmail(session.email),
      expiresAt,
      profileImageUrl: normalizeProfileImageUrl(session.profileImageUrl || ""),
    };
  }

  async function deleteSessionFromStore(token) {
    const externalStore = getExternalSessionStore();
    if (!externalStore) {
      return;
    }
    await externalStore.deleteAccessSession(hashAccessSessionToken(token));
  }

  async function persistUsersStore() {
    if (!canPersistSuperAdminState()) {
      throw new Error("Debe existir al menos un superadmin activo.");
    }

    const externalStore = getExternalUsersStore();
    if (externalStore) {
      try {
        await externalStore.persistAccessUsers({
          users: store.users.map((user) => ({
            id: normalizeIdentifier(user.id, randomUUID()),
            email: normalizeAuthEmail(user.email),
            displayName: normalizeText(user.displayName, normalizeAuthEmail(user.email)),
            role: normalizeAuthRole(user.role, "viewer"),
            active: user.active !== false,
            projectIds: normalizeProjectIdsForUser(
              user.projectIds,
              { allowWildcard: normalizeAuthRole(user.role, "viewer") === "superadmin" },
            ),
            createdAt: normalizeIsoString(user.createdAt || Date.now()),
            updatedAt: normalizeIsoString(user.updatedAt || Date.now()),
          })),
        });
        lastUsersSyncAt = Date.now();
        return;
      } catch (error) {
        if (isAccessUsersBridgeActionUnsupported(error)) {
          disableExternalUsersStoreForSession(error);
          writeStoreFile(store);
          return;
        }
        throw error;
      }
    }

    writeStoreFile(store);
  }

  async function ensureUsersStoreSynchronized(force = false) {
    const externalStore = getExternalUsersStore();
    if (!externalStore) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastUsersSyncAt < usersSyncMs) {
      return;
    }

    let payload;
    try {
      payload = await externalStore.loadAccessUsers();
    } catch (error) {
      if (isAccessUsersBridgeActionUnsupported(error)) {
        disableExternalUsersStoreForSession(error);
        writeStoreFile(store);
        return;
      }
      throw error;
    }
    const incomingUsers = Array.isArray(payload?.users) ? payload.users : [];
    store.users = incomingUsers
      .map((user) => sanitizeStoredUser(user))
      .filter(Boolean);

    if (!canPersistSuperAdminState()) {
      const existing = getUserByEmail(superAdminEmail);
      const createdOrUpdated = createUserRecord({
        email: superAdminEmail,
        role: "superadmin",
        displayName: existing?.displayName || "Superadmin",
        active: true,
      });

      if (existing) {
        existing.role = "superadmin";
        existing.active = true;
        existing.projectIds = ["*"];
        existing.updatedAt = new Date().toISOString();
        existing.displayName = normalizeText(existing.displayName, createdOrUpdated.displayName);
      } else {
        store.users.push(createdOrUpdated);
      }

      try {
        await externalStore.persistAccessUsers({
          users: store.users,
        });
      } catch (error) {
        if (isAccessUsersBridgeActionUnsupported(error)) {
          disableExternalUsersStoreForSession(error);
          writeStoreFile(store);
          return;
        }
        throw error;
      }
    }

    lastUsersSyncAt = Date.now();
  }

  function getExternalUsersStore() {
    if (disableExternalUsersStore) {
      return null;
    }

    try {
      const provider = typeof options.getExternalStore === "function"
        ? options.getExternalStore
        : null;
      const externalStore = provider ? provider() : null;
      if (
        !externalStore
        || typeof externalStore.loadAccessUsers !== "function"
        || typeof externalStore.persistAccessUsers !== "function"
      ) {
        return null;
      }
      return externalStore;
    } catch {
      return null;
    }
  }

  function getExternalSessionStore() {
    try {
      const provider = typeof options.getExternalStore === "function"
        ? options.getExternalStore
        : null;
      const externalStore = provider ? provider() : null;
      if (
        !externalStore
        || typeof externalStore.persistAccessSession !== "function"
        || typeof externalStore.loadAccessSession !== "function"
        || typeof externalStore.deleteAccessSession !== "function"
      ) {
        return null;
      }
      return externalStore;
    } catch {
      return null;
    }
  }

  function canPersistSuperAdminState(targetEmail = "", nextRole = "", nextActive = null) {
    const normalizedTarget = normalizeAuthEmail(targetEmail);
    const superAdminCount = store.users.reduce((total, user) => {
      let role = user.role;
      let active = user.active;

      if (normalizedTarget && user.email === normalizedTarget) {
        if (nextRole) {
          role = normalizeAuthRole(nextRole, "viewer");
        }
        if (nextActive !== null) {
          active = Boolean(nextActive);
        }
      }

      return role === "superadmin" && active ? total + 1 : total;
    }, 0);

    return superAdminCount > 0;
  }

  function isAccessUsersBridgeActionUnsupported(error) {
    const message = String(error instanceof Error ? error.message : error || "")
      .trim()
      .toLowerCase();
    if (!message) {
      return false;
    }

    const unsupportedMarker = message.includes("action no soportado")
      || message.includes("action not supported");
    if (!unsupportedMarker) {
      return false;
    }

    return message.includes("loadaccessusers")
      || message.includes("persistaccessusers")
      || (message.includes("loadstate") && message.includes("persiststate"));
  }

  function disableExternalUsersStoreForSession(error) {
    disableExternalUsersStore = true;
    const detail = String(error instanceof Error ? error.message : error || "").trim();
    if (!detail || detail === externalUsersStoreDisabledReason) {
      return;
    }

    externalUsersStoreDisabledReason = detail;
    console.warn(
      `[access-control] Se desactivo sync externo de usuarios para esta sesion: ${detail}`,
    );
  }

  function writeStoreFile(value) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(value, null, 2),
      "utf8",
    );
  }
}

async function verifyGoogleIdToken(idToken, expectedClientId) {
  try {
    const endpoint = new URL("https://oauth2.googleapis.com/tokeninfo");
    endpoint.searchParams.set("id_token", String(idToken || "").trim());

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "No se pudo validar tu sesion de Google.",
      };
    }

    const payload = await response.json();
    const audience = String(payload?.aud || "").trim();
    if (expectedClientId && audience !== expectedClientId) {
      return {
        ok: false,
        error: "Token de Google no valido para este aplicativo.",
      };
    }

    const email = String(payload?.email || "").trim().toLowerCase();
    if (!email) {
      return {
        ok: false,
        error: "Google no devolvio un correo valido.",
      };
    }

    return {
      ok: true,
      payload,
    };
  } catch {
    return {
      ok: false,
      error: "No se pudo completar la validacion con Google.",
    };
  }
}

storage = createStorageAdapter();

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
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
  return code === 1050 || code === 1060 || code === 1061 || code === 1826;
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

function normalizeProjectIdsInput(projectIdsInput, { allowWildcard = true } = {}) {
  const rawValues = [];
  if (Array.isArray(projectIdsInput)) {
    rawValues.push(...projectIdsInput);
  } else if (typeof projectIdsInput === "string") {
    const trimmed = projectIdsInput.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          rawValues.push(...parsed);
        } else {
          rawValues.push(...trimmed.split(/[;,]/g));
        }
      } catch {
        rawValues.push(...trimmed.split(/[;,]/g));
      }
    }
  }

  const unique = [];
  const seen = new Set();
  rawValues.forEach((value) => {
    const normalized = normalizeIdentifier(value, "");
    if (!normalized) {
      return;
    }
    if (!allowWildcard && normalized === "*") {
      return;
    }
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(normalized);
  });
  return unique;
}

function userCanAccessAllProjects(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "superadmin") {
    return true;
  }
  return normalizeProjectIdsInput(user?.projectIds, { allowWildcard: true }).includes("*");
}

function userProjectScopeSet(user) {
  if (userCanAccessAllProjects(user)) {
    return null;
  }
  return new Set(normalizeProjectIdsInput(user?.projectIds, { allowWildcard: false }));
}

function userCanAccessProject(user, projectIdInput) {
  const projectId = normalizeIdentifier(projectIdInput, "");
  if (!projectId) {
    return false;
  }
  if (userCanAccessAllProjects(user)) {
    return true;
  }
  const scope = userProjectScopeSet(user);
  return Boolean(scope && scope.has(projectId));
}

function filterStateByUserProjects(statePayload, user) {
  const normalizedState = normalizeIncomingState(statePayload);
  if (userCanAccessAllProjects(user)) {
    return normalizedState;
  }

  const scope = userProjectScopeSet(user);
  const projects = normalizedState.projects.filter((project) => scope && scope.has(project.id));
  const currentProjectId = projects.some((project) => project.id === normalizedState.currentProjectId)
    ? normalizedState.currentProjectId
    : (projects[0]?.id || null);

  return {
    currentProjectId,
    projects,
  };
}

function mergeStateByUserProjects(currentStatePayload, incomingStatePayload, user) {
  const incomingState = normalizeIncomingState(incomingStatePayload);
  if (userCanAccessAllProjects(user)) {
    return {
      ok: true,
      status: 200,
      state: incomingState,
    };
  }

  const scope = userProjectScopeSet(user);
  if (!scope || scope.size === 0) {
    return {
      ok: false,
      status: 403,
      error: "No tienes proyectos asignados para editar.",
    };
  }

  const currentState = normalizeIncomingState(currentStatePayload);
  const incomingById = new Map(incomingState.projects.map((project) => [project.id, project]));
  const currentById = new Map(currentState.projects.map((project) => [project.id, project]));

  for (const incomingProject of incomingState.projects) {
    if (!scope.has(incomingProject.id)) {
      return {
        ok: false,
        status: 403,
        error: `No puedes guardar cambios en el proyecto ${incomingProject.id}.`,
      };
    }
    if (!currentById.has(incomingProject.id)) {
      return {
        ok: false,
        status: 403,
        error: "No puedes crear proyectos nuevos con tu perfil actual.",
      };
    }
  }

  const mergedProjects = currentState.projects.map((project) => {
    if (!scope.has(project.id)) {
      return project;
    }
    return incomingById.get(project.id) || project;
  });

  const requestedCurrentProjectId = normalizeIdentifier(incomingState.currentProjectId, "");
  const currentProjectId = (
    requestedCurrentProjectId
    && userCanAccessProject(user, requestedCurrentProjectId)
    && mergedProjects.some((project) => project.id === requestedCurrentProjectId)
  )
    ? requestedCurrentProjectId
    : (
      mergedProjects.some((project) => project.id === currentState.currentProjectId)
        ? currentState.currentProjectId
        : (mergedProjects.find((project) => scope.has(project.id))?.id || null)
    );

  return {
    ok: true,
    status: 200,
    state: {
      currentProjectId,
      projects: mergedProjects,
    },
  };
}

function buildProjectAccessOptions(projectsInput) {
  const projects = Array.isArray(projectsInput) ? projectsInput : [];
  return projects
    .map((project) => ({
      id: normalizeIdentifier(project?.id, ""),
      name: normalizeText(project?.name, "Proyecto"),
    }))
    .filter((project) => project.id)
    .sort((left, right) => left.name.localeCompare(right.name));
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
    descripcion: normalizeDescriptionText(row?.descripcion || row?.description),
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

function buildRevitImportStateFromState(statePayload, searchParams = new URLSearchParams()) {
  const projects = Array.isArray(statePayload?.projects) ? statePayload.projects : [];
  const requestedProjectUid = normalizeIdentifier(
    searchParams.get("projectId") || searchParams.get("projectUid"),
    "",
  );
  const projectUid = resolveExistingProjectUid(
    projects.map((project) => ({
      project_uid: project.id,
    })),
    requestedProjectUid || statePayload?.currentProjectId,
  );
  const project = projects.find((candidate) => candidate.id === projectUid) || projects[0] || null;
  if (!project) {
    return {
      currentProjectId: null,
      projectId: null,
      projectName: "",
      project: null,
      rows: [],
    };
  }

  const rows = addCodigoPartidaToRows(Array.isArray(project.rows) ? project.rows : []);
  const compactProject = {
    id: project.id,
    name: project.name || "",
    rows,
  };

  return {
    currentProjectId: compactProject.id,
    projectId: compactProject.id,
    projectName: compactProject.name,
    project: compactProject,
    rows,
  };
}

function resolveExistingProjectUid(projects, projectUid) {
  const normalized = normalizeIdentifier(projectUid, "");
  if (!normalized) {
    return "";
  }

  const project = projects.find((candidate) => (
    String(candidate.project_uid || candidate.id || "").trim() === normalized
  ));
  return project
    ? String(project.project_uid || project.id || "").trim()
    : "";
}

function addCodigoPartidaToRows(rows) {
  const counters = [];

  return rows.map((row) => {
    const level = Math.max(0, Number.parseInt(row.level || 0, 10) || 0);
    counters[level] = (counters[level] || 0) + 1;
    counters.length = level + 1;

    return {
      ...row,
      level,
      codigoPartida: counters.join("."),
    };
  });
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeDescriptionText(value, fallback = "") {
  const text = repairKnownEncodingArtifacts(String(value || "").trim().replace(/\s+/g, " "));
  return text || fallback;
}

function repairKnownEncodingArtifacts(value) {
  const replacement = "\uFFFD";
  return String(value || "")
    .replaceAll(`HABILITACI${replacement}N`, "HABILITACI\u00D3N")
    .replaceAll(`COLOCACI${replacement}N`, "COLOCACI\u00D3N")
    .replaceAll(`INSTALACI${replacement}N`, "INSTALACI\u00D3N")
    .replaceAll(`CIMENTACI${replacement}N`, "CIMENTACI\u00D3N")
    .replaceAll(`ASF${replacement}LTICA`, "ASF\u00C1LTICA")
    .replaceAll(`S${replacement}TANO`, "S\u00D3TANO")
    .replaceAll(`MOVILIZACI${replacement}N`, "MOVILIZACI\u00D3N")
    .replaceAll(`DESMOVILIZACI${replacement}N`, "DESMOVILIZACI\u00D3N")
    .replaceAll(`ALBA${replacement}ILER${replacement}A`, "ALBA\u00D1ILER\u00CDA")
    .replaceAll(`ALBA${replacement}ILERIA`, "ALBA\u00D1ILERIA")
    .replaceAll(`GRADER${replacement}AS`, "GRADER\u00CDAS")
    .replaceAll(`PERIM${replacement}TRICA`, "PERIM\u00C9TRICA")
    .replaceAll(`CONTRACCI${replacement}N`, "CONTRACCI\u00D3N")
    .replaceAll(`PA${replacement}OS`, "PA\u00D1OS")
    .replaceAll(`PASES EN MURO ANCLADO ${replacement} 6"`, "PASES EN MURO ANCLADO \u00D8 6\"")
    .replaceAll(`PA${replacement}ETEO`, "PA\u00D1ETEO")
    .replaceAll(`PESTA${replacement}AS`, "PESTA\u00D1AS")
    .replaceAll(`M${replacement}NIMO`, "M\u00CDNIMO")
    .replaceAll(`EXCAVACI${replacement}N`, "EXCAVACI\u00D3N");
}

function normalizeReglaMetrado(tipoMetrado, value) {
  if (String(tipoMetrado || "").trim().toLowerCase() !== "revit") {
    return "";
  }

  return String(value || "").trim() === "Encofrado" ? "Encofrado" : "";
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

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
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

function parseBooleanEnv(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readBearerToken(request) {
  const authHeader = String(request.headers.authorization || "").trim();
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return "";
  }

  return authHeader.slice(bearerPrefix.length).trim();
}

function readRequestSessionToken(request) {
  return readBearerToken(request) || readCookieValue(request, webSessionCookieName);
}

function hashAccessSessionToken(token) {
  return createHash("sha256")
    .update(String(token || "").trim())
    .digest("hex");
}

function readCookieValue(request, name) {
  const cookieHeader = String(request.headers.cookie || "");
  if (!cookieHeader) {
    return "";
  }
  const target = `${encodeURIComponent(name)}=`;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(target));
  if (!match) {
    return "";
  }
  return decodeURIComponent(match.slice(target.length));
}

function writeSessionCookie(response, token, expiresAt) {
  const expires = new Date(expiresAt || Date.now()).toUTCString();
  response.setHeader("Set-Cookie", [
    `${encodeURIComponent(webSessionCookieName)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`,
  ]);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", [
    `${encodeURIComponent(webSessionCookieName)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ]);
}

function buildWebAuthSession(user, publicSettings, expiresAt = "") {
  const accessUser = user || null;
  const role = accessUser ? normalizePublicRole(accessUser.role) : "";
  return {
    enabled: Boolean(publicSettings?.enabled),
    configured: Boolean(publicSettings?.googleClientId),
    required: Boolean(publicSettings?.enabled),
    authenticated: Boolean(accessUser),
    clientId: String(publicSettings?.googleClientId || ""),
    allowedDomains: [],
    userId: accessUser?.id || "",
    userName: accessUser?.displayName || accessUser?.email || "",
    userEmail: accessUser?.email || "",
    pictureUrl: accessUser?.profileImageUrl || "",
    hostedDomain: "",
    expiresAt: expiresAt ? normalizeIsoString(expiresAt) : "",
    role,
    projectIds: Array.isArray(accessUser?.projectIds) ? accessUser.projectIds : [],
  };
}

function normalizePublicRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ["viewer", "editor", "admin", "superadmin"].includes(role) ? role : "";
}

function normalizeProfileImageUrlForStorage(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function isAuthorizedRevitIngestRequest(request) {
  if (!revitIngestApiKey) {
    return false;
  }

  const providedApiKey = readIncomingApiKey(request);
  return Boolean(providedApiKey && providedApiKey === revitIngestApiKey);
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
  const staticRoot = fs.existsSync(path.join(distDir, "index.html")) ? distDir : __dirname;
  const safePath = pathname === "/"
    ? "index.html"
    : path.normalize(decodeURIComponent(pathname).replace(/^\/+/, ""));
  let absolutePath = path.resolve(staticRoot, safePath);

  if (!absolutePath.startsWith(staticRoot)) {
    respondPlain(response, 403, "Acceso denegado.");
    return;
  }

  let fileBuffer;
  try {
    fileBuffer = await readFile(absolutePath);
  } catch {
    const acceptsHtmlFallback = method === "GET"
      && !path.extname(safePath)
      && fs.existsSync(path.join(staticRoot, "index.html"));
    if (!acceptsHtmlFallback) {
      respondPlain(response, 404, "No encontrado.");
      return;
    }
    absolutePath = path.join(staticRoot, "index.html");
    fileBuffer = await readFile(absolutePath);
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
