import http from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import {
  buildBimJobCacheKey as buildBimJobCacheKeyDomain,
  shouldReadBimJobCache as shouldReadBimJobCacheDomain,
  shouldRefreshBimJobCache as shouldRefreshBimJobCacheDomain,
  shouldPersistBimJobCache as shouldPersistBimJobCacheDomain,
  shouldReuseActiveBimJob as shouldReuseActiveBimJobDomain,
} from "./src/application/budget/bim-job-cache-domain.mjs";
import {
  decodeBimArtifactContent,
  hasBimArtifactContent,
  hasBimArtifactReference,
  isBimArtifactRedirectHostAllowed,
  normalizeAllowedBimArtifactRedirectUrl as normalizeAllowedBimArtifactRedirectUrlDomain,
  normalizeIncomingBimArtifacts,
  parseBimArtifactAllowedRedirectHosts as parseBimArtifactAllowedRedirectHostsDomain,
  resolveRemoteBimArtifactDownloadUrl as resolveRemoteBimArtifactDownloadUrlDomain,
  sanitizeBimArtifactName,
} from "./src/application/budget/bim-artifact-domain.mjs";
import {
  createBimBridgeClaimAccessDecision,
  normalizeBimBridgeRequestedBy,
} from "./src/application/budget/bim-bridge-access-domain.mjs";
import {
  normalizeBimBridgePresenceTtlSeconds,
  normalizeIncomingBimBridgeHeartbeat,
  summarizeBimBridgePresence,
} from "./src/application/budget/bim-bridge-presence-domain.mjs";
import {
  createBimJobStaleExpirationPlan,
  normalizeBimJobStaleMinutes,
} from "./src/application/budget/bim-job-stale-domain.mjs";
import {
  createBimJobCancelTransition,
  createBimJobProgressDecision,
  createBimJobRetryDecision,
  isFinishedBimJobStatus,
} from "./src/application/budget/bim-job-state-domain.mjs";
import { shouldEmitBimJobSseUpdate } from "./src/application/budget/bim-job-events-domain.mjs";
import { createBimJobDetailResponse } from "./src/application/budget/bim-job-query-domain.mjs";
import {
  canCreateBimApplyJobFromPreview as canCreateBimApplyJobFromPreviewDomain,
  getDirectBimApplyJobCreateIssue,
  normalizeBimApplyPlan,
  resolveBimApplyJobBatchSize,
} from "./src/application/budget/bim-apply-plan-domain.mjs";
import {
  BimJobOwnershipError,
  canAccessBimJobOperationsForClaim,
  canReportBimJobProgressForClaim,
  canWriteBimJobArtifactsForClaim,
} from "./src/application/budget/bim-job-ownership-domain.mjs";
import {
  detachBimJobOperationsForStorage,
  normalizeBimJobOperationSource,
  normalizeBimJobOperationsUpload,
  normalizeBimJobOperationsForStorage,
} from "./src/application/budget/bim-job-operations-domain.mjs";
import {
  getBimJobTargetCommandIssue,
  normalizeBimJobCommandType,
  normalizeBimJobLogLevel,
  normalizeBimJobStatus,
  normalizeBimJobTargetMode,
  normalizeIncomingBimClaimIdentity,
  normalizeIncomingBimJobCreate,
  normalizeIncomingBimJobProgress,
  normalizeOptionalBimJobCommandType,
} from "./src/application/budget/bim-job-command-domain.mjs";
import {
  canClaimBimJobForActiveModel,
  getBimBridgeClaimModelIdentityIssue,
  getBimJobCreateModelIdentityIssue,
} from "./src/application/budget/bim-job-model-identity-domain.mjs";
import {
  buildRevitImportStateFromState as buildRevitImportStateFromStateDomain,
  normalizeRevitImportRows,
} from "./src/application/budget/bim-revit-import-domain.mjs";
import { normalizeIncomingRevitExport } from "./src/application/budget/bim-revit-export-domain.mjs";
import { createBimParameterWritePlan } from "./src/application/budget/bim-parameter-operations-domain.mjs";
import { createBackendBimReadinessSnapshot } from "./src/application/budget/bim-readiness-api-domain.mjs";

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
const PROJECT_VIEW_ACCESS_KEYS = [
  "itemizado",
  "presupuesto",
  "base-recursos",
  "analisis-costos-unitarios",
  "formula-polinomica",
  "control-bim",
  "auditoria",
  "exportaciones-rvt",
  "exportacion-presupuesto",
];
const DEFAULT_PROJECT_VIEW_ACCESS_KEYS = [...PROJECT_VIEW_ACCESS_KEYS];
const APU_CATEGORY_KEYS = ["mano-obra", "materiales", "equipos", "subcontratos", "otros"];
const APU_WORKDAY_HOURS = 8;
const BIM_JOB_STATUSES = ["queued", "claimed", "running", "applying", "completed", "failed", "cancelled"];
const BIM_JOB_TARGET_MODES = ["active-revit", "cloud-model"];
const BIM_JOB_ACTIVE_REUSE_STATUSES = ["queued", "claimed", "running", "applying"];
const BIM_JOB_CREATE_LOCK_TIMEOUT_SECONDS = clampInteger(process.env.BIM_JOB_CREATE_LOCK_TIMEOUT_SECONDS, 1, 60, 8);
const BIM_JOB_STALE_MINUTES = normalizeBimJobStaleMinutes(process.env.BIM_JOB_STALE_MINUTES);
const BIM_JOB_SWEEP_INTERVAL_MS = clampInteger(process.env.BIM_JOB_SWEEP_INTERVAL_MS, 10000, 3600000, 60000);
const BIM_BRIDGE_PRESENCE_TTL_SECONDS = normalizeBimBridgePresenceTtlSeconds(process.env.BIM_BRIDGE_PRESENCE_TTL_SECONDS);
const BIM_JOB_SSE_POLL_MS = clampInteger(process.env.BIM_JOB_SSE_POLL_MS, 500, 30000, 1500);
const BIM_JOB_SSE_RETRY_MS = clampInteger(process.env.BIM_JOB_SSE_RETRY_MS, 1000, 60000, 3000);
const BIM_JOB_OPERATION_PAGE_SIZE = 1000;
const BIM_ARTIFACT_STORAGE_DIR = path.resolve(__dirname, process.env.BIM_ARTIFACT_STORAGE_DIR || path.join("data", "bim-artifacts"));
const BIM_ARTIFACT_MAX_BYTES = clampInteger(process.env.BIM_ARTIFACT_MAX_BYTES, 1024, 50 * 1024 * 1024, 5 * 1024 * 1024);
const BIM_ARTIFACT_STORAGE_PROVIDERS = ["local", "cloud-storage", "aps"];
const BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS = new Set(parseBimArtifactAllowedRedirectHosts(process.env.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS));
const BIM_JOB_SELECT_COLUMNS = `
        j.MTRD_BimJob_ID AS internal_id,
        j.MTRD_BimJob_UID AS job_uid,
        p.MTRD_Proyecto_UID AS project_uid,
        j.MTRD_BimJob_TargetMode AS target_mode,
        j.MTRD_BimJob_CommandType AS command_type,
        j.MTRD_BimJob_Status AS status_name,
        j.MTRD_BimJob_Stage AS stage_name,
        j.MTRD_BimJob_Percent AS percent_value,
        j.MTRD_BimJob_PayloadJson AS payload_json,
        j.MTRD_BimJob_ModelIdentityJson AS model_identity_json,
        j.MTRD_BimJob_ModelKeyHash AS model_key_hash,
        j.MTRD_BimJob_ResultJson AS result_json,
        j.MTRD_BimJob_Error AS error_text,
        j.MTRD_BimJob_CreadoPor AS created_by,
        j.MTRD_BimJob_ClaimedBy AS claimed_by,
        j.MTRD_BimJob_ClaimedAt AS claimed_at,
        j.MTRD_BimJob_CompletedAt AS completed_at,
        j.MTRD_BimJob_CreadoEn AS created_at,
        j.MTRD_BimJob_ActualizadoEn AS updated_at`;

class BimJobCreationLockError extends Error {
  constructor(lockName) {
    super(`No se pudo tomar el bloqueo de creacion BIM para ${lockName}. Intenta nuevamente en unos segundos.`);
    this.name = "BimJobCreationLockError";
    this.code = "BIM_JOB_CREATE_LOCK_TIMEOUT";
    this.statusCode = 503;
    this.lockName = lockName;
  }
}

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
        const compact = buildRevitImportStateFromStateDomain(scopedPayload, url.searchParams);
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
          error: "No tienes acceso al proyecto activo de Quantiva.",
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
          error: "La exportacion de Revit solo esta disponible con Quantiva en MySQL.",
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

    if (url.pathname === "/api/bim/readiness") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuthorized = isAuthorizedRevitIngestRequest(request);
      let session = null;
      if (!bridgeAuthorized) {
        session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
        if (!session) {
          return;
        }
      }
      const readiness = createBackendBimReadinessSnapshot(process.env, {
        baseUrl: resolveRequestBaseUrl(request),
        storageKind: storage.kind,
        storageLabel: storage.label,
        authenticatedBy: bridgeAuthorized ? "bridge-api-key" : "session",
        userRole: session?.user?.role || "",
      });
      respondJson(response, 200, { ok: true, readiness });
      return;
    }

    if (url.pathname === "/api/bim/jobs") {
      if (request.method === "GET") {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
        if (!session) {
          return;
        }
        const projectId = String(url.searchParams.get("projectId") || "").trim();
        if (projectId && !userCanAccessProject(session.user, projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        const jobs = await storage.listBimJobs({
          projectId,
          limit: Number.parseInt(url.searchParams.get("limit") || "25", 10),
        });
        respondJson(response, 200, { ok: true, jobs });
        return;
      }

      if (request.method === "POST") {
        const session = await ensureAuthorizedRequest(accessControl, request, response, "editor");
        if (!session) {
          return;
        }
        const payload = await readJsonBody(request);
        const normalized = normalizeIncomingBimJobCreate(payload);
        if (!normalized.projectId) {
          respondJson(response, 400, { ok: false, error: "projectId es obligatorio para crear un job BIM." });
          return;
        }
        const targetCommandIssue = getBimJobTargetCommandIssue(normalized);
        if (targetCommandIssue) {
          respondJson(response, 400, { ok: false, error: targetCommandIssue });
          return;
        }
        const directApplyIssue = getDirectBimApplyJobCreateIssue(normalized);
        if (directApplyIssue) {
          respondJson(response, 400, { ok: false, error: directApplyIssue });
          return;
        }
        const modelIdentityIssue = getBimJobCreateModelIdentityIssue(normalized);
        if (modelIdentityIssue) {
          respondJson(response, 400, { ok: false, error: modelIdentityIssue });
          return;
        }
        if (!userCanAccessProject(session.user, normalized.projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        const job = await storage.createBimJob(normalized, {
          userName: session.user.displayName || session.user.email || "Usuario",
        });
        respondJson(response, 201, { ok: true, job });
        return;
      }

      respondJson(response, 405, { error: "Metodo no permitido." });
      return;
    }

    if (url.pathname === "/api/bim/jobs/summary") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
      if (!session) {
        return;
      }
      const projectId = String(url.searchParams.get("projectId") || "").trim();
      if (!projectId) {
        respondJson(response, 400, { ok: false, error: "projectId es obligatorio para resumir la cola BIM." });
        return;
      }
      if (!userCanAccessProject(session.user, projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      const summary = await storage.getBimJobQueueSummary({ projectId });
      respondJson(response, 200, { ok: true, summary });
      return;
    }

    const bimJobArtifactDownloadRoute = url.pathname.match(/^\/api\/bim\/jobs\/([^/]+)\/artifacts\/([^/]+)\/download$/);
    if (bimJobArtifactDownloadRoute) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
      if (!session) {
        return;
      }
      const jobUid = decodeURIComponent(bimJobArtifactDownloadRoute[1] || "").trim();
      const artifactUid = decodeURIComponent(bimJobArtifactDownloadRoute[2] || "").trim();
      const job = await storage.loadBimJob(jobUid);
      if (!job) {
        respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
        return;
      }
      if (!userCanAccessProject(session.user, job.projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      const artifact = await storage.loadBimJobArtifact(jobUid, artifactUid);
      if (!artifact) {
        respondJson(response, 404, { ok: false, error: "No se encontro el artefacto BIM." });
        return;
      }
      await streamBimArtifactDownload(request, response, artifact);
      return;
    }

    const bimJobRoute = url.pathname.match(/^\/api\/bim\/jobs\/([^/]+)(?:\/(events|cancel|retry|apply|artifacts))?$/);
    if (bimJobRoute) {
      const jobUid = decodeURIComponent(bimJobRoute[1] || "").trim();
      const action = bimJobRoute[2] || "";
      if (action === "events") {
        if (request.method !== "GET") {
          respondJson(response, 405, { error: "Metodo no permitido." });
          return;
        }
        const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
        if (!session) {
          return;
        }
        const job = await storage.loadBimJob(jobUid);
        if (!job) {
          respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
          return;
        }
        if (!userCanAccessProject(session.user, job.projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        await streamBimJobEvents(request, response, storage, jobUid);
        return;
      }

      if (action === "cancel") {
        if (request.method !== "POST") {
          respondJson(response, 405, { error: "Metodo no permitido." });
          return;
        }
        const session = await ensureAuthorizedRequest(accessControl, request, response, "editor");
        if (!session) {
          return;
        }
        const job = await storage.loadBimJob(jobUid);
        if (!job) {
          respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
          return;
        }
        if (!userCanAccessProject(session.user, job.projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        const cancelled = await storage.cancelBimJob(jobUid, {
          userName: session.user.displayName || session.user.email || "Usuario",
        });
        respondJson(response, 200, { ok: true, job: cancelled });
        return;
      }

      if (action === "retry") {
        if (request.method !== "POST") {
          respondJson(response, 405, { error: "Metodo no permitido." });
          return;
        }
        const session = await ensureAuthorizedRequest(accessControl, request, response, "editor");
        if (!session) {
          return;
        }
        const job = await storage.loadBimJob(jobUid);
        if (!job) {
          respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
          return;
        }
        if (!userCanAccessProject(session.user, job.projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        const retryDecision = createBimJobRetryDecision(job.status, {
          commandType: job.commandType,
        });
        if (!retryDecision.canRetry) {
          respondJson(response, 409, { ok: false, error: retryDecision.reason });
          return;
        }
        const retriedJob = await storage.retryBimJob(jobUid, {
          userName: session.user.displayName || session.user.email || "Usuario",
        });
        if (!retriedJob) {
          respondJson(response, 409, { ok: false, error: retryDecision.reason || "No se pudo reintentar el job BIM." });
          return;
        }
        respondJson(response, 201, { ok: true, job: retriedJob });
        return;
      }

      if (action === "apply") {
        if (request.method !== "POST") {
          respondJson(response, 405, { error: "Metodo no permitido." });
          return;
        }
        const session = await ensureAuthorizedRequest(accessControl, request, response, "editor");
        if (!session) {
          return;
        }
        const job = await storage.loadBimJob(jobUid);
        if (!job) {
          respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
          return;
        }
        if (!userCanAccessProject(session.user, job.projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        if (!canCreateBimApplyJob(job)) {
          respondJson(response, 409, { ok: false, error: "Solo se puede aplicar desde un preview BIM completado para Revit activo y con identidad de modelo estable." });
          return;
        }
        const applyJob = await storage.createBimApplyJobFromPreview(jobUid, {
          userName: session.user.displayName || session.user.email || "Usuario",
        });
        if (!applyJob) {
          respondJson(response, 409, { ok: false, error: "No se pudo crear el job de aplicacion desde el preview indicado." });
          return;
        }
        respondJson(response, 201, { ok: true, job: applyJob });
        return;
      }

      if (action === "artifacts") {
        if (request.method !== "GET") {
          respondJson(response, 405, { error: "Metodo no permitido." });
          return;
        }
        const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
        if (!session) {
          return;
        }
        const job = await storage.loadBimJob(jobUid);
        if (!job) {
          respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
          return;
        }
        if (!userCanAccessProject(session.user, job.projectId)) {
          respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
          return;
        }
        const artifacts = await storage.listBimJobArtifacts(jobUid);
        respondJson(response, 200, { ok: true, artifacts });
        return;
      }

      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const session = await ensureAuthorizedRequest(accessControl, request, response, "viewer");
      if (!session) {
        return;
      }
      const job = await storage.loadBimJob(jobUid);
      const detailResponse = createBimJobDetailResponse(job);
      if (!detailResponse.ok) {
        respondJson(response, detailResponse.status, detailResponse.body);
        return;
      }
      if (!userCanAccessProject(session.user, detailResponse.body.job.projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      respondJson(response, detailResponse.status, detailResponse.body);
      return;
    }

    if (url.pathname === "/api/bim/bridge/summary") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuth = await authorizeBimBridgeRequest(request, response);
      if (!bridgeAuth) {
        return;
      }
      const projectId = String(url.searchParams.get("projectId") || url.searchParams.get("projectUid") || "").trim();
      if (!projectId) {
        respondJson(response, 400, { ok: false, error: "projectId es obligatorio para resumir la cola BIM del bridge." });
        return;
      }
      if (bridgeAuth.user && !userCanAccessProject(bridgeAuth.user, projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      const summary = await storage.getBimJobQueueSummary({ projectId });
      respondJson(response, 200, { ok: true, summary });
      return;
    }

    if (url.pathname === "/api/bim/bridge/heartbeat") {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuth = await authorizeBimBridgeRequest(request, response);
      if (!bridgeAuth) {
        return;
      }
      const payload = await readJsonBody(request);
      const heartbeat = normalizeIncomingBimBridgeHeartbeat({
        ...payload,
        requestedBy: payload?.requestedBy || payload?.userEmail || bridgeAuth.user?.email || "",
      });
      if (!heartbeat.projectId) {
        respondJson(response, 400, { ok: false, error: "projectId es obligatorio para registrar el heartbeat del bridge." });
        return;
      }
      if (bridgeAuth.user && !userCanAccessProject(bridgeAuth.user, heartbeat.projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      const bridgePresence = await storage.saveBimBridgeHeartbeat(heartbeat);
      respondJson(response, 200, { ok: true, bridgePresence });
      return;
    }

    if (url.pathname === "/api/bim/bridge/commands") {
      if (request.method !== "GET") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuth = await authorizeBimBridgeRequest(request, response);
      if (!bridgeAuth) {
        return;
      }
      const projectId = String(url.searchParams.get("projectId") || url.searchParams.get("projectUid") || "").trim();
      if (bridgeAuth.user && projectId && !userCanAccessProject(bridgeAuth.user, projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      const targetMode = normalizeBimJobTargetMode(String(url.searchParams.get("targetMode") || "active-revit").trim());
      const requestedBy = normalizeBimBridgeRequestedBy(
        url.searchParams.get("requestedBy") || url.searchParams.get("userEmail") || bridgeAuth.user?.email || "",
      );
      const bridgeClaimAccess = await authorizeBimBridgeClaimAccess({
        bridgeAuth,
        targetMode,
        requestedBy,
        projectId,
      });
      if (!bridgeClaimAccess.ok) {
        respondJson(response, bridgeClaimAccess.status, {
          ok: false,
          error: bridgeClaimAccess.error,
          code: bridgeClaimAccess.code,
        });
        return;
      }
      const activeModelIdentity = normalizeIncomingBimClaimIdentity(url.searchParams);
      const claimModelIdentityIssue = getBimBridgeClaimModelIdentityIssue(targetMode, activeModelIdentity);
      if (claimModelIdentityIssue) {
        respondJson(response, 400, { ok: false, error: claimModelIdentityIssue });
        return;
      }
      const bridgeId = String(url.searchParams.get("bridgeId") || url.searchParams.get("workerId") || "revit-bridge").trim();
      let bridgePresence = null;
      if (targetMode === "active-revit") {
        bridgePresence = await storage.saveBimBridgeHeartbeat({
          bridgeId,
          projectId,
          requestedBy: bridgeClaimAccess.requestedByEmail || requestedBy,
          activeModelIdentity,
        });
      }
      const jobs = await storage.claimBimJobs({
        projectId,
        targetMode,
        commandType: String(url.searchParams.get("commandType") || "").trim(),
        bridgeId,
        requestedBy: bridgeClaimAccess.requestedByEmail || requestedBy,
        allowedProjectIds: bridgeClaimAccess.projectScope.projectIds,
        allowAllProjects: bridgeClaimAccess.projectScope.allProjects,
        requireProjectScope: bridgeClaimAccess.projectScope.required,
        activeModelIdentity,
        limit: Number.parseInt(url.searchParams.get("limit") || "1", 10),
      });
      respondJson(response, 200, { ok: true, jobs, bridgePresence });
      return;
    }

    const bimBridgeOperationsRoute = url.pathname.match(/^\/api\/bim\/bridge\/jobs\/([^/]+)\/operations$/);
    const bimBridgeProgressRoute = url.pathname.match(/^\/api\/bim\/bridge\/jobs\/([^/]+)\/progress$/);
    const bimBridgeArtifactsRoute = url.pathname.match(/^\/api\/bim\/bridge\/jobs\/([^/]+)\/artifacts$/);
    if (bimBridgeOperationsRoute) {
      if (!["GET", "POST"].includes(request.method)) {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuth = await authorizeBimBridgeRequest(request, response);
      if (!bridgeAuth) {
        return;
      }
      const jobUidForOperations = decodeURIComponent(bimBridgeOperationsRoute[1] || "").trim();
      const job = await storage.loadBimJob(jobUidForOperations);
      if (!job) {
        respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
        return;
      }
      if (bridgeAuth.user && !userCanAccessProject(bridgeAuth.user, job.projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      const bridgeId = String(url.searchParams.get("bridgeId") || url.searchParams.get("workerId") || "").trim();
      if (!canAccessBimJobOperationsForClaim(job.claimedBy, bridgeId)) {
        respondJson(response, 409, {
          ok: false,
          error: "El bridge no es propietario del job BIM solicitado.",
          code: "BIM_JOB_OWNERSHIP_MISMATCH",
        });
        return;
      }
      if (request.method === "POST" && isFinishedBimJobStatus(job.status)) {
        respondJson(response, 409, { ok: false, error: "No se pueden registrar operaciones en un job BIM finalizado." });
        return;
      }
      if (request.method === "POST") {
        const upload = normalizeBimJobOperationsUpload(await readJsonBody(request));
        const page = await storage.saveBimJobOperationsUpload(jobUidForOperations, upload);
        if (page === null) {
          respondJson(response, 409, { ok: false, error: "No se pueden registrar operaciones en un job BIM finalizado." });
          return;
        }
        respondJson(response, 200, { ok: true, ...page });
        return;
      }
      const page = await storage.listBimJobOperations(jobUidForOperations, {
        source: url.searchParams.get("source"),
        offset: Number.parseInt(url.searchParams.get("offset") || "0", 10),
        limit: Number.parseInt(url.searchParams.get("limit") || String(BIM_JOB_OPERATION_PAGE_SIZE), 10),
      });
      respondJson(response, 200, { ok: true, ...page });
      return;
    }

    if (bimBridgeArtifactsRoute) {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuth = await authorizeBimBridgeRequest(request, response);
      if (!bridgeAuth) {
        return;
      }
      const payload = await readJsonBody(request);
      const jobUidForArtifacts = decodeURIComponent(bimBridgeArtifactsRoute[1] || "").trim();
      const job = await storage.loadBimJob(jobUidForArtifacts);
      if (!job) {
        respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
        return;
      }
      if (bridgeAuth.user && !userCanAccessProject(bridgeAuth.user, job.projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      let artifacts;
      try {
        artifacts = await storage.saveBimJobArtifacts(jobUidForArtifacts, payload?.artifacts, {
          bridgeId: payload?.bridgeId || payload?.workerId || "bim-worker",
        });
      } catch (error) {
        if (error instanceof BimJobOwnershipError) {
          respondJson(response, error.statusCode, {
            ok: false,
            error: error.message,
            code: error.code,
          });
          return;
        }
        throw error;
      }
      if (artifacts === null) {
        respondJson(response, 409, { ok: false, error: "No se pueden registrar artefactos en un job BIM finalizado." });
        return;
      }
      respondJson(response, 201, { ok: true, artifacts });
      return;
    }

    if (bimBridgeProgressRoute) {
      if (request.method !== "POST") {
        respondJson(response, 405, { error: "Metodo no permitido." });
        return;
      }
      const bridgeAuth = await authorizeBimBridgeRequest(request, response);
      if (!bridgeAuth) {
        return;
      }
      const payload = await readJsonBody(request);
      const jobUidForProgress = decodeURIComponent(bimBridgeProgressRoute[1] || "").trim();
      const existingJob = await storage.loadBimJob(jobUidForProgress);
      if (!existingJob) {
        respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
        return;
      }
      if (bridgeAuth.user && !userCanAccessProject(bridgeAuth.user, existingJob.projectId)) {
        respondJson(response, 403, { ok: false, error: "No tienes acceso al proyecto solicitado." });
        return;
      }
      let job;
      try {
        job = await storage.updateBimJobProgress(
          jobUidForProgress,
          payload,
          { bridgeId: payload?.bridgeId || payload?.workerId || "revit-bridge" },
        );
      } catch (error) {
        if (error instanceof BimJobOwnershipError) {
          respondJson(response, error.statusCode, {
            ok: false,
            error: error.message,
            code: error.code,
          });
          return;
        }
        throw error;
      }
      if (!job) {
        respondJson(response, 404, { ok: false, error: "No se encontro el job BIM." });
        return;
      }
      respondJson(response, 200, { ok: true, job });
      return;
    }

    if (!["GET", "HEAD"].includes(request.method || "GET")) {
      respondJson(response, 405, { error: "Metodo no permitido." });
      return;
    }

    await serveStaticAsset(url.pathname, response, request.method || "GET");
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0) || 500;
    respondJson(response, statusCode, {
      ok: false,
      error: statusCode >= 500
        ? "No se pudo completar la solicitud."
        : normalizeText(error?.message, "No se pudo completar la solicitud."),
      code: normalizeText(error?.code, ""),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, async () => {
  const health = await storage.getHealth();
  startBimJobStaleSweep(storage);
  console.log(`Quantiva listo en http://${host}:${port}`);
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

function startBimJobStaleSweep(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.expireStaleBimJobs !== "function") {
    return;
  }
  let sweepRunning = false;
  const runSweep = async () => {
    if (sweepRunning) {
      return;
    }
    sweepRunning = true;
    try {
      const expiredCount = await storageAdapter.expireStaleBimJobs(BIM_JOB_STALE_MINUTES);
      if (expiredCount > 0) {
        console.log(`Jobs BIM expirados por falta de heartbeat: ${expiredCount}`);
      }
    } catch (error) {
      console.warn(`No se pudo expirar jobs BIM estancados: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      sweepRunning = false;
    }
  };
  void runSweep();
  const interval = setInterval(() => void runSweep(), BIM_JOB_SWEEP_INTERVAL_MS);
  interval.unref?.();
}

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
        MTRD_UsuarioAcceso_VistasProyectoJson AS view_access_json,
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
        viewAccessByProject: normalizeViewAccessByProjectInput(
          row.view_access_json,
          parseJsonArray(row.project_ids_json),
          row.role_name,
        ),
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
            MTRD_UsuarioAcceso_VistasProyectoJson,
            MTRD_UsuarioAcceso_CreadoEn,
            MTRD_UsuarioAcceso_ActualizadoEn
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            MTRD_UsuarioAcceso_Nombre = VALUES(MTRD_UsuarioAcceso_Nombre),
            MTRD_UsuarioAcceso_Rol = VALUES(MTRD_UsuarioAcceso_Rol),
            MTRD_UsuarioAcceso_Activo = VALUES(MTRD_UsuarioAcceso_Activo),
            MTRD_UsuarioAcceso_ProyectoIdsJson = VALUES(MTRD_UsuarioAcceso_ProyectoIdsJson),
            MTRD_UsuarioAcceso_VistasProyectoJson = VALUES(MTRD_UsuarioAcceso_VistasProyectoJson),
            MTRD_UsuarioAcceso_ActualizadoEn = VALUES(MTRD_UsuarioAcceso_ActualizadoEn)
        `, [
          normalizeIdentifier(user.id, randomUUID()),
          email,
          normalizeText(user.displayName, email),
          role,
          user.active === false ? 0 : 1,
          JSON.stringify(role === "superadmin" ? ["*"] : projectIds),
          JSON.stringify(normalizeViewAccessByProjectInput(
            user.viewAccessByProject,
            role === "superadmin" ? ["*"] : projectIds,
            role,
          )),
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
    const [budgetConfigRows] = await this.pool.query(`
      SELECT
        MTRD_PresupuestoConfig_KEY_Proyecto AS project_id,
        MTRD_PresupuestoConfig_GastosGeneralesPct AS gastos_generales_pct,
        MTRD_PresupuestoConfig_UtilidadPct AS utilidad_pct,
        MTRD_PresupuestoConfig_IgvPct AS igv_pct,
        MTRD_PresupuestoConfig_IncluyeIgv AS incluye_igv
      FROM MTRD_PresupuestoConfig
      WHERE MTRD_PresupuestoConfig_KEY_Proyecto IN (?)
    `, [projectIds]);
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
        MTRD_Item_ReglaMetrado AS item_regla_metrado,
        MTRD_Item_RendimientoMO AS item_rendimiento_mo,
        MTRD_Item_RendimientoEQ AS item_rendimiento_eq
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

    const [apuRows] = await this.pool.query(`
      SELECT
        a.MTRD_ItemApuInsumo_KEY_Proyecto AS project_id,
        i.MTRD_Item_UID AS item_uid,
        a.MTRD_ItemApuInsumo_UID AS apu_uid,
        a.MTRD_ItemApuInsumo_Orden AS apu_order,
        a.MTRD_ItemApuInsumo_Categoria AS apu_category,
        a.MTRD_ItemApuInsumo_RecursoUID AS apu_resource_uid,
        a.MTRD_ItemApuInsumo_SubpartidaUID AS apu_subpartida_uid,
        a.MTRD_ItemApuInsumo_Descripcion AS apu_descripcion,
        a.MTRD_ItemApuInsumo_Unidad AS apu_unidad,
        a.MTRD_ItemApuInsumo_Cuadrilla AS apu_cuadrilla,
        a.MTRD_ItemApuInsumo_Cantidad AS apu_cantidad,
        a.MTRD_ItemApuInsumo_PrecioUnitario AS apu_precio_unitario
      FROM MTRD_ItemApuInsumo a
      INNER JOIN MTRD_Item i ON i.MTRD_Item_ID = a.MTRD_ItemApuInsumo_KEY_Item
      WHERE a.MTRD_ItemApuInsumo_KEY_Proyecto IN (?)
      ORDER BY
        a.MTRD_ItemApuInsumo_KEY_Proyecto ASC,
        i.MTRD_Item_Orden ASC,
        a.MTRD_ItemApuInsumo_Orden ASC
    `, [projectIds]);

    const [metradoRows] = await this.pool.query(`
      SELECT
        m.MTRD_ItemMetrado_KEY_Proyecto AS project_id,
        i.MTRD_Item_UID AS item_uid,
        m.MTRD_ItemMetrado_UID AS metrado_uid,
        m.MTRD_ItemMetrado_Orden AS metrado_order,
        m.MTRD_ItemMetrado_Descripcion AS metrado_descripcion,
        m.MTRD_ItemMetrado_Veces AS metrado_veces,
        m.MTRD_ItemMetrado_Largo AS metrado_largo,
        m.MTRD_ItemMetrado_Ancho AS metrado_ancho,
        m.MTRD_ItemMetrado_Alto AS metrado_alto,
        m.MTRD_ItemMetrado_Parcial AS metrado_parcial
      FROM MTRD_ItemMetrado m
      INNER JOIN MTRD_Item i ON i.MTRD_Item_ID = m.MTRD_ItemMetrado_KEY_Item
      WHERE m.MTRD_ItemMetrado_KEY_Proyecto IN (?)
      ORDER BY
        m.MTRD_ItemMetrado_KEY_Proyecto ASC,
        i.MTRD_Item_Orden ASC,
        m.MTRD_ItemMetrado_Orden ASC
    `, [projectIds]);

    const [unitCatalogRows] = await this.pool.query(`
      SELECT
        MTRD_UnidadCatalogo_KEY_Proyecto AS project_id,
        MTRD_UnidadCatalogo_UID AS unit_uid,
        MTRD_UnidadCatalogo_Orden AS unit_order,
        MTRD_UnidadCatalogo_Codigo AS unit_codigo,
        MTRD_UnidadCatalogo_Descripcion AS unit_descripcion
      FROM MTRD_UnidadCatalogo
      WHERE MTRD_UnidadCatalogo_KEY_Proyecto IN (?)
      ORDER BY
        MTRD_UnidadCatalogo_KEY_Proyecto ASC,
        MTRD_UnidadCatalogo_Orden ASC
    `, [projectIds]);

    const [resourceCatalogRows] = await this.pool.query(`
      SELECT
        MTRD_RecursoCatalogo_KEY_Proyecto AS project_id,
        MTRD_RecursoCatalogo_UID AS resource_uid,
        MTRD_RecursoCatalogo_Orden AS resource_order,
        MTRD_RecursoCatalogo_Categoria AS resource_category,
        MTRD_RecursoCatalogo_Descripcion AS resource_descripcion,
        MTRD_RecursoCatalogo_Unidad AS resource_unidad,
        MTRD_RecursoCatalogo_PrecioUnitario AS resource_precio_unitario,
        MTRD_RecursoCatalogo_GrupoPolinomicoUID AS resource_polynomial_group_uid
      FROM MTRD_RecursoCatalogo
      WHERE MTRD_RecursoCatalogo_KEY_Proyecto IN (?)
      ORDER BY
        MTRD_RecursoCatalogo_KEY_Proyecto ASC,
        MTRD_RecursoCatalogo_Categoria ASC,
        MTRD_RecursoCatalogo_Orden ASC
    `, [projectIds]);

    const [polynomialRows] = await this.pool.query(`
      SELECT
        MTRD_GrupoPolinomico_KEY_Proyecto AS project_id,
        MTRD_GrupoPolinomico_UID AS polynomial_uid,
        MTRD_GrupoPolinomico_Orden AS polynomial_order,
        MTRD_GrupoPolinomico_Codigo AS polynomial_codigo,
        MTRD_GrupoPolinomico_Descripcion AS polynomial_descripcion,
        MTRD_GrupoPolinomico_Indice AS polynomial_indice,
        MTRD_GrupoPolinomico_Categoria AS polynomial_categoria
      FROM MTRD_GrupoPolinomico
      WHERE MTRD_GrupoPolinomico_KEY_Proyecto IN (?)
      ORDER BY
        MTRD_GrupoPolinomico_KEY_Proyecto ASC,
        MTRD_GrupoPolinomico_Orden ASC
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
          MTRD_SnapshotItem_ReglaMetrado AS item_regla_metrado,
          MTRD_SnapshotItem_RendimientoMO AS item_rendimiento_mo,
          MTRD_SnapshotItem_RendimientoEQ AS item_rendimiento_eq
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
        MTRD_RevitExport_DocumentoUID AS document_uid,
        MTRD_RevitExport_ModeloGUID AS model_guid,
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
    const budgetConfigByProject = new Map(budgetConfigRows.map((row) => [row.project_id, row]));
    const collapsedByProject = groupRowsByKey(collapsedRows, "project_id");
    const apuItemsByItem = groupApuRowsByProjectItem(apuRows);
    const metradoItemsByItem = groupMetradoRowsByProjectItem(metradoRows);
    const unitCatalogByProject = groupRowsByKey(unitCatalogRows, "project_id");
    const resourceCatalogByProject = groupRowsByKey(resourceCatalogRows, "project_id");
    const polynomialGroupsByProject = groupRowsByKey(polynomialRows, "project_id");
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
      const projectBudgetConfig = budgetConfigByProject.get(projectRow.project_id) || null;
      const projectCollapsed = collapsedByProject.get(projectRow.project_id) || [];
      const projectUnitCatalog = unitCatalogByProject.get(projectRow.project_id) || [];
      const projectResourceCatalog = resourceCatalogByProject.get(projectRow.project_id) || [];
      const projectPolynomialGroups = polynomialGroupsByProject.get(projectRow.project_id) || [];
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
          rendimientoManoObra: normalizeDecimalString(entry.item_rendimiento_mo),
          rendimientoEquipos: normalizeDecimalString(entry.item_rendimiento_eq),
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
          rendimientoManoObra: normalizeDecimalString(entry.item_rendimiento_mo),
          rendimientoEquipos: normalizeDecimalString(entry.item_rendimiento_eq),
          apuItems: mapApuRowsToItems(apuItemsByItem.get(getApuProjectItemKey(entry.project_id, entry.item_uid)) || []),
          metradoItems: mapMetradoRowsToItems(metradoItemsByItem.get(getApuProjectItemKey(entry.project_id, entry.item_uid)) || []),
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
        budgetSettings: mapBudgetConfigRowToSettings(projectBudgetConfig),
        polynomialGroups: mapPolynomialRowsToGroups(projectPolynomialGroups),
        unitCatalogItems: mapUnitCatalogRowsToItems(projectUnitCatalog),
        resourceCatalogItems: mapResourceCatalogRowsToItems(projectResourceCatalog),
        latestRevitExport: latestRevitExport
          ? {
            id: latestRevitExport.export_id ?? latestRevitExport.id ?? null,
            uid: latestRevitExport.export_uid || latestRevitExport.uid || "",
            documentUid: latestRevitExport.document_uid || latestRevitExport.documentUid || "",
            modelGuid: latestRevitExport.model_guid || latestRevitExport.modelGuid || "",
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
        MTRD_Item_ReglaMetrado AS item_regla_metrado,
        MTRD_Item_RendimientoMO AS item_rendimiento_mo,
        MTRD_Item_RendimientoEQ AS item_rendimiento_eq
      FROM MTRD_Item
      WHERE MTRD_Item_KEY_Proyecto = ?
      ORDER BY MTRD_Item_Orden ASC
    `, [selectedProject.project_id]);

    const rows = normalizeRevitImportRows(itemRows.map((entry) => ({
      id: entry.item_uid,
      itemUid: entry.item_uid,
      level: Number(entry.item_level || 0),
      codificacion: entry.item_codificacion || "",
      descripcion: normalizeDescriptionText(entry.item_descripcion),
      unidad: entry.item_unidad || "",
      costo: normalizeDecimalString(entry.item_costo),
      metradoBim: normalizeDecimalString(entry.item_metrado_bim),
      tipoMetrado: entry.item_tipo_metrado || "",
      reglaMetrado: normalizeReglaMetrado(entry.item_tipo_metrado, entry.item_regla_metrado),
      rendimientoManoObra: normalizeDecimalString(entry.item_rendimiento_mo),
      rendimientoEquipos: normalizeDecimalString(entry.item_rendimiento_eq),
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
            ON DUPLICATE KEY UPDATE
              MTRD_Proyecto_ID = LAST_INSERT_ID(MTRD_Proyecto_ID),
              MTRD_Proyecto_Nombre = VALUES(MTRD_Proyecto_Nombre),
              MTRD_Proyecto_ActualizadoEn = VALUES(MTRD_Proyecto_ActualizadoEn),
              MTRD_Proyecto_Estado = 1
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
          DELETE FROM MTRD_ItemMetrado
          WHERE MTRD_ItemMetrado_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE FROM MTRD_ItemApuInsumo
          WHERE MTRD_ItemApuInsumo_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE FROM MTRD_UnidadCatalogo
          WHERE MTRD_UnidadCatalogo_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE FROM MTRD_RecursoCatalogo
          WHERE MTRD_RecursoCatalogo_KEY_Proyecto = ?
        `, [projectId]);
        await connection.query(`
          DELETE FROM MTRD_GrupoPolinomico
          WHERE MTRD_GrupoPolinomico_KEY_Proyecto = ?
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

        const rows = resolveIncomingBudgetRows(project.rows);
        const budgetSettings = normalizeIncomingBudgetSettings(project.budgetSettings);
        await connection.query(`
          INSERT INTO MTRD_PresupuestoConfig (
            MTRD_PresupuestoConfig_KEY_Proyecto,
            MTRD_PresupuestoConfig_GastosGeneralesPct,
            MTRD_PresupuestoConfig_UtilidadPct,
            MTRD_PresupuestoConfig_IgvPct,
            MTRD_PresupuestoConfig_IncluyeIgv
          ) VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            MTRD_PresupuestoConfig_GastosGeneralesPct = VALUES(MTRD_PresupuestoConfig_GastosGeneralesPct),
            MTRD_PresupuestoConfig_UtilidadPct = VALUES(MTRD_PresupuestoConfig_UtilidadPct),
            MTRD_PresupuestoConfig_IgvPct = VALUES(MTRD_PresupuestoConfig_IgvPct),
            MTRD_PresupuestoConfig_IncluyeIgv = VALUES(MTRD_PresupuestoConfig_IncluyeIgv)
        `, [
          projectId,
          parseDecimal(budgetSettings.gastosGeneralesPercent),
          parseDecimal(budgetSettings.utilidadPercent),
          parseDecimal(budgetSettings.igvPercent),
          budgetSettings.includeIgv ? 1 : 0,
        ]);

        const polynomialGroups = normalizeIncomingPolynomialGroups(project.polynomialGroups);
        for (let groupIndex = 0; groupIndex < polynomialGroups.length; groupIndex += 1) {
          const group = polynomialGroups[groupIndex];
          await connection.query(`
            INSERT INTO MTRD_GrupoPolinomico (
              MTRD_GrupoPolinomico_KEY_Proyecto,
              MTRD_GrupoPolinomico_UID,
              MTRD_GrupoPolinomico_Orden,
              MTRD_GrupoPolinomico_Codigo,
              MTRD_GrupoPolinomico_Descripcion,
              MTRD_GrupoPolinomico_Indice,
              MTRD_GrupoPolinomico_Categoria
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId,
            normalizeIdentifier(group.id, `poly-${groupIndex + 1}`),
            Number.parseInt(group.orden || groupIndex + 1, 10) || (groupIndex + 1),
            String(group.codigo || ""),
            normalizeDescriptionText(group.descripcion),
            normalizeDescriptionText(group.indice),
            normalizeApuCategory(group.categoria),
          ]);
        }

        const unitCatalogItems = normalizeIncomingUnitCatalogItems(project.unitCatalogItems);
        for (let unitIndex = 0; unitIndex < unitCatalogItems.length; unitIndex += 1) {
          const unit = unitCatalogItems[unitIndex];
          await connection.query(`
            INSERT INTO MTRD_UnidadCatalogo (
              MTRD_UnidadCatalogo_KEY_Proyecto,
              MTRD_UnidadCatalogo_UID,
              MTRD_UnidadCatalogo_Orden,
              MTRD_UnidadCatalogo_Codigo,
              MTRD_UnidadCatalogo_Descripcion
            ) VALUES (?, ?, ?, ?, ?)
          `, [
            projectId,
            normalizeIdentifier(unit.id, `unit-${unitIndex + 1}`),
            Number.parseInt(unit.orden || unitIndex + 1, 10) || (unitIndex + 1),
            normalizeUnitCode(unit.codigo),
            normalizeUnitDescription(unit.descripcion),
          ]);
        }
        const resourceCatalogItems = normalizeIncomingResourceCatalogItems(project.resourceCatalogItems);
        for (let resourceIndex = 0; resourceIndex < resourceCatalogItems.length; resourceIndex += 1) {
          const resource = resourceCatalogItems[resourceIndex];
          await connection.query(`
            INSERT INTO MTRD_RecursoCatalogo (
              MTRD_RecursoCatalogo_KEY_Proyecto,
              MTRD_RecursoCatalogo_UID,
              MTRD_RecursoCatalogo_Orden,
              MTRD_RecursoCatalogo_Categoria,
              MTRD_RecursoCatalogo_Descripcion,
              MTRD_RecursoCatalogo_Unidad,
              MTRD_RecursoCatalogo_PrecioUnitario,
              MTRD_RecursoCatalogo_GrupoPolinomicoUID
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId,
            normalizeIdentifier(resource.id, `resource-${resourceIndex + 1}`),
            Number.parseInt(resource.orden || resourceIndex + 1, 10) || (resourceIndex + 1),
            normalizeApuCategory(resource.category),
            normalizeDescriptionText(resource.descripcion),
            String(resource.unidad || ""),
            parseDecimal(resource.precioUnitario),
            normalizeIdentifier(resource.polynomialGroupId, "") || null,
          ]);
        }
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
          const rowMetradoItems = normalizeIncomingMetradoItems(row.metradoItems);
          const rowMetradoTradicional = rowMetradoItems.length > 0
            ? getIncomingMetradoTotal(rowMetradoItems)
            : parseDecimal(row.metradoTradicional ?? row.metrado);
          const rowApuItems = normalizeIncomingApuItems(row.apuItems, row);
          const rowCosto = rowApuItems.length > 0
            ? getIncomingApuTotal(rowApuItems, row)
            : parseDecimal(row.costo);
          incomingItemUids.add(rowUid);

          const itemValues = [
            rowIndex + 1,
            Number.parseInt(row.level || 0, 10) || 0,
            String(row.codificacion || ""),
            normalizeDescriptionText(row.descripcion),
            String(row.unidad || ""),
            rowCosto,
            rowMetradoTradicional,
            metradoBim,
            String(row.tipoMetrado || ""),
            normalizeReglaMetrado(row.tipoMetrado, row.reglaMetrado),
            parseDecimal(row.rendimientoManoObra),
            parseDecimal(row.rendimientoEquipos),
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
                MTRD_Item_RendimientoMO = ?,
                MTRD_Item_RendimientoEQ = ?,
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
                MTRD_Item_ReglaMetrado,
                MTRD_Item_RendimientoMO,
                MTRD_Item_RendimientoEQ
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const rowUid = normalizeIdentifier(row.id, `row-${projectIndex + 1}-${rowIndex + 1}`);
          const itemId = itemIdByUid.get(rowUid);
          if (!itemId) {
            continue;
          }
          const metradoItems = normalizeIncomingMetradoItems(row.metradoItems);
          for (let metradoIndex = 0; metradoIndex < metradoItems.length; metradoIndex += 1) {
            const metradoItem = metradoItems[metradoIndex];
            await connection.query(`
              INSERT INTO MTRD_ItemMetrado (
                MTRD_ItemMetrado_KEY_Proyecto,
                MTRD_ItemMetrado_KEY_Item,
                MTRD_ItemMetrado_UID,
                MTRD_ItemMetrado_Orden,
                MTRD_ItemMetrado_Descripcion,
                MTRD_ItemMetrado_Veces,
                MTRD_ItemMetrado_Largo,
                MTRD_ItemMetrado_Ancho,
                MTRD_ItemMetrado_Alto,
                MTRD_ItemMetrado_Parcial
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              projectId,
              itemId,
              normalizeIdentifier(metradoItem.id, `metrado-${rowIndex + 1}-${metradoIndex + 1}`),
              metradoIndex + 1,
              normalizeDescriptionText(metradoItem.descripcion),
              parseDecimal(metradoItem.veces || 1),
              parseDecimal(metradoItem.largo),
              parseDecimal(metradoItem.ancho),
              parseDecimal(metradoItem.alto),
              parseDecimal(metradoItem.parcial),
            ]);
          }
          const apuItems = normalizeIncomingApuItems(row.apuItems, row);
          for (let apuIndex = 0; apuIndex < apuItems.length; apuIndex += 1) {
            const apuItem = apuItems[apuIndex];
            await connection.query(`
              INSERT INTO MTRD_ItemApuInsumo (
                MTRD_ItemApuInsumo_KEY_Proyecto,
                MTRD_ItemApuInsumo_KEY_Item,
                MTRD_ItemApuInsumo_UID,
                MTRD_ItemApuInsumo_Orden,
                MTRD_ItemApuInsumo_Categoria,
                MTRD_ItemApuInsumo_RecursoUID,
                MTRD_ItemApuInsumo_SubpartidaUID,
                MTRD_ItemApuInsumo_Descripcion,
                MTRD_ItemApuInsumo_Unidad,
                MTRD_ItemApuInsumo_Cuadrilla,
                MTRD_ItemApuInsumo_Cantidad,
                MTRD_ItemApuInsumo_PrecioUnitario
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              projectId,
              itemId,
              normalizeIdentifier(apuItem.id, `apu-${rowIndex + 1}-${apuIndex + 1}`),
              apuIndex + 1,
              normalizeApuCategory(apuItem.category),
              normalizeIdentifier(apuItem.resourceId, "") || null,
              normalizeIdentifier(apuItem.subpartidaId, "") || null,
              normalizeDescriptionText(apuItem.descripcion),
              String(apuItem.unidad || ""),
              parseDecimal(apuItem.cuadrilla),
              parseDecimal(apuItem.cantidad),
              parseDecimal(apuItem.precioUnitario),
            ]);
          }
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
                MTRD_SnapshotItem_ReglaMetrado,
                MTRD_SnapshotItem_RendimientoMO,
                MTRD_SnapshotItem_RendimientoEQ
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              parseDecimal(row.rendimientoManoObra),
              parseDecimal(row.rendimientoEquipos),
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

  async createBimJob(input, context = {}) {
    await this.ensureReady();
    const project = await this.findProjectByUid(input.projectId);
    if (!project) {
      throw new Error(`No existe un proyecto activo con projectId ${input.projectId}.`);
    }

    const targetMode = normalizeBimJobTargetMode(input.targetMode);
    const commandType = normalizeBimJobCommandType(input.commandType);
    let payloadObject = normalizeJsonObject(input.payload) || {};
    const modelIdentityObject = normalizeJsonObject(input.modelIdentity) || {};
    payloadObject = await this.enrichBimJobPayloadForCommand(
      project,
      targetMode,
      commandType,
      payloadObject,
      modelIdentityObject,
    );
    const cacheKey = buildBimJobCacheKey(project.project_uid, targetMode, commandType, modelIdentityObject, payloadObject);
    const shouldReadCachedResult = Boolean(cacheKey && shouldReadBimJobCache(payloadObject, commandType));
    const shouldReuseActiveJob = Boolean(cacheKey && shouldReuseActiveBimJob(payloadObject, commandType));
    const shouldUseCreationLock = shouldReadCachedResult || shouldReuseActiveJob;

    const createInput = {
      project,
      targetMode,
      commandType,
      payloadObject,
      modelIdentityObject,
      cacheKey,
      shouldReadCachedResult,
      shouldReuseActiveJob,
    };

    if (shouldUseCreationLock) {
      return this.withBimJobCreationLock(cacheKey.hash, (connection) => (
        this.createBimJobRecord(createInput, context, connection)
      ));
    }

    return this.createBimJobRecord(createInput, context, this.pool);
  }

  async enrichBimJobPayloadForCommand(project, targetMode, commandType, payloadObject, modelIdentityObject) {
    if (targetMode !== "active-revit" || commandType !== "active-revit-preview") {
      return payloadObject;
    }
    if (Array.isArray(payloadObject.operations) && payloadObject.operations.length > 0) {
      return payloadObject;
    }

    const [budgetRows, revitRows] = await Promise.all([
      this.loadBudgetRowsForBimParameterWrites(project.project_id),
      this.loadLatestRevitExportRowsForBimParameterWrites(
        project.project_id,
        modelIdentityObject.revitExportUid || modelIdentityObject.lastExportUid || modelIdentityObject.exportUid || "",
      ),
    ]);
    const plan = createBimParameterWritePlan({
      budgetRows,
      revitRows,
      batchSize: payloadObject.batchSize,
    });

    return {
      ...payloadObject,
      operationType: "parameter-write",
      operationCount: plan.summary.operationCount,
      operations: plan.operations,
      operationSummary: plan.summary,
      operationWarnings: plan.warnings,
    };
  }

  async loadBudgetRowsForBimParameterWrites(projectId) {
    const [rows] = await this.pool.query(`
      SELECT
        MTRD_Item_UID AS item_uid,
        MTRD_Item_Nivel AS item_level,
        MTRD_Item_Codificacion AS item_codificacion,
        MTRD_Item_Descripcion AS item_descripcion,
        MTRD_Item_Unidad AS item_unidad,
        MTRD_Item_Costo AS item_costo
      FROM MTRD_Item
      WHERE MTRD_Item_KEY_Proyecto = ?
      ORDER BY MTRD_Item_Orden ASC, MTRD_Item_ID ASC
    `, [projectId]);

    return addCodigoPartidaToRows(rows.map((row) => ({
      itemUid: row.item_uid || "",
      level: Number(row.item_level || 0),
      codificacion: row.item_codificacion || "",
      descripcion: normalizeDescriptionText(row.item_descripcion),
      unidad: row.item_unidad || "",
      costo: normalizeDecimalString(row.item_costo),
    })));
  }

  async loadLatestRevitExportRowsForBimParameterWrites(projectId, requestedExportUid = "") {
    const normalizedExportUid = normalizeIdentifier(requestedExportUid, "");
    const exportParams = [projectId];
    const exportUidFilter = normalizedExportUid ? "AND MTRD_RevitExport_UID = ?" : "";
    if (normalizedExportUid) {
      exportParams.push(normalizedExportUid);
    }

    const [exportRows] = await this.pool.query(`
      SELECT
        MTRD_RevitExport_ID AS export_id
      FROM MTRD_RevitExport
      WHERE MTRD_RevitExport_KEY_Proyecto = ?
        ${exportUidFilter}
      ORDER BY MTRD_RevitExport_FechaExportacion DESC, MTRD_RevitExport_ID DESC
      LIMIT 1
    `, exportParams);
    const exportId = exportRows[0]?.export_id || null;
    if (!exportId) {
      return [];
    }

    const [rows] = await this.pool.query(`
      SELECT
        MTRD_RevitExportItem_ItemUID AS item_uid,
        MTRD_RevitExportItem_ElementId AS element_id,
        MTRD_RevitExportItem_ElementUniqueId AS element_unique_id,
        MTRD_RevitExportItem_CodigoPartida AS codigo_partida,
        MTRD_RevitExportItem_ParametrosJson AS parametros_json
      FROM MTRD_RevitExportItem
      WHERE MTRD_RevitExportItem_KEY_Export = ?
      ORDER BY MTRD_RevitExportItem_ID ASC
    `, [exportId]);

    return rows.map((row) => ({
      itemUid: row.item_uid || "",
      elementId: row.element_id,
      elementUniqueId: row.element_unique_id || "",
      codigoPartida: row.codigo_partida || "",
      parametrosJson: row.parametros_json || null,
    }));
  }

  async createBimJobRecord(input, context = {}, executor = this.pool) {
    const {
      project,
      targetMode,
      commandType,
      payloadObject,
      modelIdentityObject,
      cacheKey,
      shouldReadCachedResult,
      shouldReuseActiveJob,
    } = input;
    const jobUid = randomUUID();
    const now = new Date().toISOString();
    const cachedResult = cacheKey && shouldReadCachedResult && !shouldRefreshBimJobCache(payloadObject)
      ? await this.loadBimJobCache(project.project_id, targetMode, commandType, cacheKey.hash, executor)
      : null;
    if (!cachedResult && shouldReuseActiveJob) {
      await this.expireStaleBimJobs(BIM_JOB_STALE_MINUTES);
      const activeJob = await this.loadActiveReusableBimJob(project.project_id, targetMode, commandType, cacheKey.hash, executor);
      if (activeJob) {
        await this.insertBimJobLogByUid(
          activeJob.id,
          "info",
          `Solicitud duplicada reutilizo este job activo. Clave cache: ${cacheKey.fingerprint}.`,
          executor,
        );
        return this.loadBimJob(activeJob.id);
      }
    }
    const jobStatus = cachedResult ? "completed" : "queued";
    const jobStage = cachedResult ? "Resultado cacheado" : "En cola";
    const jobPercent = cachedResult ? 100 : 0;
    const resultObject = cachedResult
      ? {
        ...cachedResult.result,
        cache: {
          hit: true,
          sourceJobId: cachedResult.sourceJobUid,
          key: cacheKey.fingerprint,
        },
      }
      : null;
    const operationStorage = detachBimJobOperationsForStorage(payloadObject, {
      jobUid,
      source: "payload",
      pageSize: BIM_JOB_OPERATION_PAGE_SIZE,
    });
    const payloadJson = JSON.stringify(operationStorage.payloadObject);
    const modelIdentityJson = JSON.stringify(modelIdentityObject);
    const resultJson = resultObject ? JSON.stringify(resultObject) : null;
    const [insert] = await executor.query(`
      INSERT INTO MTRD_BimJob (
        MTRD_BimJob_UID,
        MTRD_BimJob_KEY_Proyecto,
        MTRD_BimJob_TargetMode,
        MTRD_BimJob_CommandType,
        MTRD_BimJob_Status,
        MTRD_BimJob_Stage,
        MTRD_BimJob_Percent,
        MTRD_BimJob_PayloadJson,
        MTRD_BimJob_ModelIdentityJson,
        MTRD_BimJob_ModelKeyHash,
        MTRD_BimJob_ResultJson,
        MTRD_BimJob_CompletedAt,
        MTRD_BimJob_CreadoPor,
        MTRD_BimJob_CreadoEn,
        MTRD_BimJob_ActualizadoEn
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      jobUid,
      project.project_id,
      targetMode,
      commandType,
      jobStatus,
      jobStage,
      jobPercent,
      payloadJson,
      modelIdentityJson,
      cacheKey ? cacheKey.hash : "",
      resultJson,
      cachedResult ? toMySqlDateTime(now) : null,
      normalizeText(context.userName, "Usuario"),
      toMySqlDateTime(now),
      toMySqlDateTime(now),
    ]);

    if (cachedResult) {
      await this.markBimJobCacheHit(cachedResult.cacheId, executor);
      await this.insertBimJobLog(insert.insertId, "info", `Job BIM completado desde cache. Resultado original: ${cachedResult.sourceJobUid || "cache"}.`, executor);
    } else {
      if (operationStorage.operations.length > 0) {
        await this.replaceBimJobOperations(insert.insertId, operationStorage.source, operationStorage.operations, executor);
      }
      const creationMessage = cacheKey
        ? "Job BIM creado desde Itemicostos con cache habilitado."
        : "Job BIM creado desde Itemicostos.";
      await this.insertBimJobLog(insert.insertId, "info", creationMessage, executor);
    }
    return this.loadBimJob(jobUid);
  }

  async withBimJobCreationLock(modelKeyHash, work) {
    const lockName = buildBimJobCreationLockName(modelKeyHash);
    const connection = await this.pool.getConnection();
    let acquired = false;
    try {
      const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS lock_result", [
        lockName,
        BIM_JOB_CREATE_LOCK_TIMEOUT_SECONDS,
      ]);
      acquired = Number(rows[0]?.lock_result || 0) === 1;
      if (!acquired) {
        throw new BimJobCreationLockError(lockName);
      }
      return await work(connection);
    } finally {
      if (acquired) {
        try {
          await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
        } catch {
          // La conexion se libera igualmente; MySQL suelta locks de sesion al cerrarla.
        }
      }
      connection.release();
    }
  }

  async retryBimJob(jobUid, context = {}) {
    const originalJob = await this.loadBimJob(jobUid);
    if (!originalJob) {
      return null;
    }
    const retryDecision = createBimJobRetryDecision(originalJob.status, {
      commandType: originalJob.commandType,
    });
    if (!retryDecision.canRetry) {
      return null;
    }
    return this.createBimJob({
      projectId: originalJob.projectId,
      targetMode: originalJob.targetMode,
      commandType: originalJob.commandType,
      payload: {
        ...originalJob.payload,
        forceRefresh: true,
        retryOf: originalJob.id,
      },
      modelIdentity: originalJob.modelIdentity,
    }, context);
  }

  async createBimApplyJobFromPreview(jobUid, context = {}) {
    return this.withBimApplyJobCreationLock(jobUid, async () => {
      const previewJob = await this.loadBimJob(jobUid);
      if (!previewJob || !canCreateBimApplyJob(previewJob)) {
        return null;
      }
      const existingApplyJob = await this.loadBimApplyJobForPreview(previewJob);
      if (existingApplyJob) {
        await this.insertBimJobLogByUid(
          existingApplyJob.id,
          "info",
          `Solicitud duplicada de aplicacion reutilizo el job ${existingApplyJob.id} del preview ${previewJob.id}.`,
        );
        return existingApplyJob;
      }

      const applyPlan = normalizeBimApplyPlan(previewJob.result?.applyPlan);
      const storedApplyOperations = applyPlan.operations.length > 0
        ? []
        : await this.loadAllBimJobOperations(jobUid, "result-apply-plan");
      const executableApplyPlan = storedApplyOperations.length > 0
        ? { ...applyPlan, operations: storedApplyOperations }
        : applyPlan;

      return this.createBimJob({
        projectId: previewJob.projectId,
        targetMode: "active-revit",
        commandType: "active-revit-apply",
        payload: {
          batchSize: resolveBimApplyJobBatchSize(previewJob.result?.applyPlan, previewJob.payload),
          mode: "confirmed-apply",
          source: "control-bim",
          sourceJobId: previewJob.id,
          sourceCommandType: previewJob.commandType,
          approvedAt: new Date().toISOString(),
          approvedBy: normalizeText(context.userName, "Usuario"),
          cacheMode: "skip",
          previewSummary: buildBimPreviewSummary(previewJob.result),
          applyPlan: executableApplyPlan,
        },
        modelIdentity: previewJob.modelIdentity,
      }, context);
    });
  }

  async withBimApplyJobCreationLock(previewJobUid, work) {
    const lockName = buildBimApplyJobCreationLockName(previewJobUid);
    const connection = await this.pool.getConnection();
    let acquired = false;
    try {
      const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS lock_result", [
        lockName,
        BIM_JOB_CREATE_LOCK_TIMEOUT_SECONDS,
      ]);
      acquired = Number(rows[0]?.lock_result || 0) === 1;
      if (!acquired) {
        throw new BimJobCreationLockError(lockName);
      }
      return await work(connection);
    } finally {
      if (acquired) {
        try {
          await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
        } catch {
          // La conexion se libera igualmente; MySQL suelta locks de sesion al cerrarla.
        }
      }
      connection.release();
    }
  }

  async loadBimApplyJobForPreview(previewJob) {
    await this.ensureReady();
    const previewJobId = normalizeIdentifier(previewJob?.id, "");
    const projectId = normalizeIdentifier(previewJob?.projectId, "");
    if (!previewJobId || !projectId) {
      return null;
    }
    const [rows] = await this.pool.query(`
      SELECT
        j.MTRD_BimJob_UID AS job_uid
      FROM MTRD_BimJob j
      INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
      WHERE p.MTRD_Proyecto_UID = ?
        AND j.MTRD_BimJob_TargetMode = 'active-revit'
        AND j.MTRD_BimJob_CommandType = 'active-revit-apply'
        AND JSON_UNQUOTE(JSON_EXTRACT(j.MTRD_BimJob_PayloadJson, '$.sourceJobId')) = ?
      ORDER BY
        FIELD(j.MTRD_BimJob_Status, 'applying', 'running', 'claimed', 'queued', 'completed', 'failed', 'cancelled') ASC,
        j.MTRD_BimJob_CreadoEn ASC,
        j.MTRD_BimJob_ID ASC
      LIMIT 1
    `, [projectId, previewJobId]);
    const row = rows[0];
    return row ? this.loadBimJob(row.job_uid) : null;
  }

  async listBimJobs(options = {}) {
    await this.ensureReady();
    await this.expireStaleBimJobs(BIM_JOB_STALE_MINUTES);
    const limit = clampInteger(options.limit, 1, 100, 25);
    const projectUid = normalizeIdentifier(options.projectId, "");
    const params = [];
    let projectFilter = "";
    if (projectUid) {
      projectFilter = "AND p.MTRD_Proyecto_UID = ?";
      params.push(projectUid);
    }
    params.push(limit);

    const [rows] = await this.pool.query(`
      SELECT ${BIM_JOB_SELECT_COLUMNS}
      FROM MTRD_BimJob j
      INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
      WHERE p.MTRD_Proyecto_Estado = 1
        ${projectFilter}
      ORDER BY j.MTRD_BimJob_CreadoEn DESC, j.MTRD_BimJob_ID DESC
      LIMIT ?
    `, params);

    return this.attachBimJobLogs(rows.map(mapBimJobRow));
  }

  async getBimJobQueueSummary(options = {}) {
    await this.ensureReady();
    await this.expireStaleBimJobs(BIM_JOB_STALE_MINUTES);
    const projectUid = normalizeIdentifier(options.projectId, "");
    if (!projectUid) {
      return createEmptyBimJobQueueSummary();
    }

    const [rows] = await this.pool.query(`
      SELECT
        j.MTRD_BimJob_Status AS status_name,
        j.MTRD_BimJob_TargetMode AS target_mode,
        COUNT(*) AS job_count,
        MIN(j.MTRD_BimJob_CreadoEn) AS oldest_created_at,
        MAX(j.MTRD_BimJob_ActualizadoEn) AS latest_updated_at,
        MAX(j.MTRD_BimJob_CompletedAt) AS latest_completed_at
      FROM MTRD_BimJob j
      INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
      WHERE p.MTRD_Proyecto_Estado = 1
        AND p.MTRD_Proyecto_UID = ?
      GROUP BY j.MTRD_BimJob_Status, j.MTRD_BimJob_TargetMode
    `, [projectUid]);

    const summary = mapBimJobQueueSummaryRows(rows);
    summary.bridgePresence = await this.getBimBridgePresenceSummary({ projectId: projectUid });
    return summary;
  }

  async saveBimBridgeHeartbeat(input = {}) {
    await this.ensureReady();
    const heartbeat = normalizeIncomingBimBridgeHeartbeat(input);
    await this.pool.query(`
      INSERT INTO MTRD_BimBridgeHeartbeat (
        MTRD_BimBridgeHeartbeat_BridgeId,
        MTRD_BimBridgeHeartbeat_ProjectUid,
        MTRD_BimBridgeHeartbeat_RequestedBy,
        MTRD_BimBridgeHeartbeat_ModelIdentityJson,
        MTRD_BimBridgeHeartbeat_LastSeenAt,
        MTRD_BimBridgeHeartbeat_CreadoEn
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        MTRD_BimBridgeHeartbeat_ModelIdentityJson = VALUES(MTRD_BimBridgeHeartbeat_ModelIdentityJson),
        MTRD_BimBridgeHeartbeat_LastSeenAt = CURRENT_TIMESTAMP
    `, [
      heartbeat.bridgeId,
      heartbeat.projectId,
      heartbeat.requestedBy,
      JSON.stringify(heartbeat.activeModelIdentity || {}),
    ]);
    return this.getBimBridgePresenceSummary({ projectId: heartbeat.projectId });
  }

  async getBimBridgePresenceSummary(options = {}) {
    await this.ensureReady();
    const projectUid = normalizeIdentifier(options.projectId, "");
    if (!projectUid) {
      return summarizeBimBridgePresence([], { ttlSeconds: BIM_BRIDGE_PRESENCE_TTL_SECONDS });
    }
    const [rows] = await this.pool.query(`
      SELECT
        MTRD_BimBridgeHeartbeat_BridgeId AS bridge_id,
        MTRD_BimBridgeHeartbeat_ProjectUid AS project_uid,
        MTRD_BimBridgeHeartbeat_RequestedBy AS requested_by,
        MTRD_BimBridgeHeartbeat_ModelIdentityJson AS model_identity_json,
        MTRD_BimBridgeHeartbeat_LastSeenAt AS last_seen_at
      FROM MTRD_BimBridgeHeartbeat
      WHERE MTRD_BimBridgeHeartbeat_ProjectUid = ?
      ORDER BY MTRD_BimBridgeHeartbeat_LastSeenAt DESC, MTRD_BimBridgeHeartbeat_ID DESC
      LIMIT 20
    `, [projectUid]);
    return summarizeBimBridgePresence(rows.map(mapBimBridgeHeartbeatRow), {
      ttlSeconds: BIM_BRIDGE_PRESENCE_TTL_SECONDS,
    });
  }

  async loadBimJob(jobUid) {
    await this.ensureReady();
    const [rows] = await this.pool.query(`
      SELECT ${BIM_JOB_SELECT_COLUMNS}
      FROM MTRD_BimJob j
      INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
      WHERE j.MTRD_BimJob_UID = ?
      LIMIT 1
    `, [normalizeIdentifier(jobUid, "")]);

    const job = rows[0] ? mapBimJobRow(rows[0]) : null;
    if (!job) {
      return null;
    }
    const [withLogs] = await this.attachBimJobLogs([job]);
    return withLogs || null;
  }

  async listBimJobOperations(jobUid, options = {}) {
    await this.ensureReady();
    const source = normalizeBimJobOperationSource(options.source, "payload");
    const offset = clampInteger(options.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = clampInteger(options.limit, 1, 5000, BIM_JOB_OPERATION_PAGE_SIZE);
    const normalizedJobUid = normalizeIdentifier(jobUid, "");
    const [countRows] = await this.pool.query(`
      SELECT COUNT(*) AS total
      FROM MTRD_BimJobOperation o
      INNER JOIN MTRD_BimJob j ON j.MTRD_BimJob_ID = o.MTRD_BimJobOperation_KEY_Job
      WHERE j.MTRD_BimJob_UID = ?
        AND o.MTRD_BimJobOperation_Source = ?
    `, [normalizedJobUid, source]);
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await this.pool.query(`
      SELECT
        o.MTRD_BimJobOperation_Orden AS operation_order,
        o.MTRD_BimJobOperation_Tipo AS operation_type,
        o.MTRD_BimJobOperation_ElementId AS element_id,
        o.MTRD_BimJobOperation_ElementUniqueId AS element_unique_id,
        o.MTRD_BimJobOperation_Parametro AS parameter_name,
        o.MTRD_BimJobOperation_ValorTexto AS value_text,
        o.MTRD_BimJobOperation_PayloadJson AS payload_json
      FROM MTRD_BimJobOperation o
      INNER JOIN MTRD_BimJob j ON j.MTRD_BimJob_ID = o.MTRD_BimJobOperation_KEY_Job
      WHERE j.MTRD_BimJob_UID = ?
        AND o.MTRD_BimJobOperation_Source = ?
      ORDER BY o.MTRD_BimJobOperation_Orden ASC
      LIMIT ? OFFSET ?
    `, [normalizedJobUid, source, limit, offset]);

    return {
      jobId: normalizedJobUid,
      source,
      offset,
      limit,
      total,
      hasMore: offset + rows.length < total,
      nextOffset: offset + rows.length < total ? offset + rows.length : null,
      operations: rows.map(mapBimJobOperationRow),
    };
  }

  async loadAllBimJobOperations(jobUid, source = "payload") {
    const operations = [];
    let offset = 0;
    while (true) {
      const page = await this.listBimJobOperations(jobUid, {
        source,
        offset,
        limit: 5000,
      });
      operations.push(...page.operations);
      if (!page.hasMore || page.nextOffset === null) {
        return operations;
      }
      offset = page.nextOffset;
    }
  }

  async saveBimJobOperationsUpload(jobUid, uploadInput = {}) {
    await this.ensureReady();
    const normalizedJobUid = normalizeIdentifier(jobUid, "");
    const source = normalizeBimJobOperationSource(uploadInput.source, "payload");
    const mode = uploadInput.mode === "append" ? "append" : "replace";
    const offset = mode === "append"
      ? clampInteger(uploadInput.offset, 0, Number.MAX_SAFE_INTEGER, 0)
      : 0;
    const operations = normalizeBimJobOperationsForStorage(uploadInput.operations);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(`
        SELECT
          MTRD_BimJob_ID AS job_id,
          MTRD_BimJob_Status AS status_name
        FROM MTRD_BimJob
        WHERE MTRD_BimJob_UID = ?
        LIMIT 1
        FOR UPDATE
      `, [normalizedJobUid]);
      const row = rows[0];
      if (!row) {
        await connection.commit();
        return {
          jobId: normalizedJobUid,
          source,
          mode,
          offset,
          count: 0,
          total: 0,
        };
      }
      if (isFinishedBimJobStatus(row.status_name)) {
        await connection.commit();
        return null;
      }

      if (mode === "replace") {
        await connection.query(`
          DELETE FROM MTRD_BimJobOperation
          WHERE MTRD_BimJobOperation_KEY_Job = ?
            AND MTRD_BimJobOperation_Source = ?
        `, [row.job_id, source]);
      }
      if (operations.length > 0) {
        await this.insertBimJobOperations(row.job_id, source, operations, offset, connection);
      }

      const total = await this.countBimJobOperations(row.job_id, source, connection);
      await connection.commit();
      return {
        jobId: normalizedJobUid,
        source,
        mode,
        offset,
        count: operations.length,
        total,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async replaceBimJobOperations(jobId, sourceInput, operationsInput, executor = this.pool) {
    const source = normalizeBimJobOperationSource(sourceInput, "payload");
    const operations = normalizeBimJobOperationsForStorage(operationsInput);
    await executor.query(`
      DELETE FROM MTRD_BimJobOperation
      WHERE MTRD_BimJobOperation_KEY_Job = ?
        AND MTRD_BimJobOperation_Source = ?
    `, [jobId, source]);
    if (operations.length === 0) {
      return;
    }

    await this.insertBimJobOperations(jobId, source, operations, 0, executor);
  }

  async countBimJobOperations(jobId, sourceInput, executor = this.pool) {
    const source = normalizeBimJobOperationSource(sourceInput, "payload");
    const [rows] = await executor.query(`
      SELECT COUNT(*) AS total
      FROM MTRD_BimJobOperation
      WHERE MTRD_BimJobOperation_KEY_Job = ?
        AND MTRD_BimJobOperation_Source = ?
    `, [jobId, source]);
    return Number(rows[0]?.total || 0);
  }

  async insertBimJobOperations(jobId, sourceInput, operationsInput, offsetInput = 0, executor = this.pool) {
    const source = normalizeBimJobOperationSource(sourceInput, "payload");
    const operations = normalizeBimJobOperationsForStorage(operationsInput);
    const offset = clampInteger(offsetInput, 0, Number.MAX_SAFE_INTEGER, 0);
    for (let index = 0; index < operations.length; index += 500) {
      const chunk = operations.slice(index, index + 500);
      await executor.query(`
        INSERT INTO MTRD_BimJobOperation (
          MTRD_BimJobOperation_KEY_Job,
          MTRD_BimJobOperation_Source,
          MTRD_BimJobOperation_Orden,
          MTRD_BimJobOperation_Tipo,
          MTRD_BimJobOperation_ElementId,
          MTRD_BimJobOperation_ElementUniqueId,
          MTRD_BimJobOperation_Parametro,
          MTRD_BimJobOperation_ValorTexto,
          MTRD_BimJobOperation_PayloadJson
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
          MTRD_BimJobOperation_Tipo = VALUES(MTRD_BimJobOperation_Tipo),
          MTRD_BimJobOperation_ElementId = VALUES(MTRD_BimJobOperation_ElementId),
          MTRD_BimJobOperation_ElementUniqueId = VALUES(MTRD_BimJobOperation_ElementUniqueId),
          MTRD_BimJobOperation_Parametro = VALUES(MTRD_BimJobOperation_Parametro),
          MTRD_BimJobOperation_ValorTexto = VALUES(MTRD_BimJobOperation_ValorTexto),
          MTRD_BimJobOperation_PayloadJson = VALUES(MTRD_BimJobOperation_PayloadJson)
      `, [chunk.map((operation, chunkIndex) => [
        jobId,
        source,
        offset + index + chunkIndex,
        operation.operationType,
        operation.elementId > 0 ? operation.elementId : null,
        operation.elementUniqueId,
        operation.parameterName,
        operation.value,
        JSON.stringify(operation),
      ])]);
    }
  }

  async cancelBimJob(jobUid, context = {}) {
    await this.ensureReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(`
        SELECT
          MTRD_BimJob_ID AS job_id,
          MTRD_BimJob_UID AS job_uid,
          MTRD_BimJob_Status AS status_name,
          MTRD_BimJob_ClaimedBy AS claimed_by
        FROM MTRD_BimJob
        WHERE MTRD_BimJob_UID = ?
        LIMIT 1
        FOR UPDATE
      `, [normalizeIdentifier(jobUid, "")]);
      const row = rows[0];
      if (!row) {
        await connection.rollback();
        return null;
      }
      const cancelTransition = createBimJobCancelTransition(row.status_name, {
        userName: context.userName,
      });
      if (cancelTransition.shouldUpdate) {
        await connection.query(`
          UPDATE MTRD_BimJob
          SET
            MTRD_BimJob_Status = ?,
            MTRD_BimJob_Stage = ?,
            MTRD_BimJob_Percent = ?,
            MTRD_BimJob_CompletedAt = CURRENT_TIMESTAMP,
            MTRD_BimJob_ActualizadoEn = CURRENT_TIMESTAMP
          WHERE MTRD_BimJob_ID = ?
        `, [
          cancelTransition.status,
          cancelTransition.stage,
          cancelTransition.percent,
          row.job_id,
        ]);
        if (cancelTransition.logMessage) {
          await connection.query(`
            INSERT INTO MTRD_BimJobLog (
              MTRD_BimJobLog_KEY_Job,
              MTRD_BimJobLog_Level,
              MTRD_BimJobLog_Message
            ) VALUES (?, ?, ?)
          `, [
            row.job_id,
            cancelTransition.logLevel,
            cancelTransition.logMessage,
          ]);
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.loadBimJob(jobUid);
  }

  async claimBimJobs(options = {}) {
    await this.ensureReady();
    await this.expireStaleBimJobs(BIM_JOB_STALE_MINUTES);
    const limit = clampInteger(options.limit, 1, 10, 1);
    const bridgeId = normalizeText(options.bridgeId, "revit-bridge");
    const requestedBy = normalizeText(options.requestedBy, "");
    const projectUid = normalizeIdentifier(options.projectId, "");
    const targetMode = normalizeBimJobTargetMode(options.targetMode || "active-revit");
    const commandType = normalizeOptionalBimJobCommandType(options.commandType);
    const activeModelIdentity = normalizeJsonObject(options.activeModelIdentity) || {};
    const allowedProjectIds = normalizeProjectIdsInput(options.allowedProjectIds, { allowWildcard: false });
    const allowAllProjects = options.allowAllProjects === true;
    const requireProjectScope = options.requireProjectScope === true;
    const shouldFilterByActiveModel = targetMode === "active-revit";
    const candidateLimit = shouldFilterByActiveModel ? 100 : limit;
    const claimedJobUids = [];

    if (requireProjectScope && !allowAllProjects && allowedProjectIds.length === 0) {
      return [];
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const params = [targetMode];
      let projectFilter = "";
      if (projectUid) {
        projectFilter = "AND p.MTRD_Proyecto_UID = ?";
        params.push(projectUid);
      }
      let projectScopeFilter = "";
      if (!allowAllProjects && allowedProjectIds.length > 0) {
        projectScopeFilter = "AND p.MTRD_Proyecto_UID IN (?)";
        params.push(allowedProjectIds);
      }
      let commandTypeFilter = "";
      if (commandType) {
        commandTypeFilter = "AND j.MTRD_BimJob_CommandType = ?";
        params.push(commandType);
      }
      params.push(candidateLimit);

      const [rows] = await connection.query(`
        SELECT
          j.MTRD_BimJob_ID AS job_id,
          j.MTRD_BimJob_UID AS job_uid,
          j.MTRD_BimJob_ModelIdentityJson AS model_identity_json
        FROM MTRD_BimJob j
        INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
        WHERE j.MTRD_BimJob_Status = 'queued'
          AND j.MTRD_BimJob_TargetMode = ?
          AND p.MTRD_Proyecto_Estado = 1
          ${projectFilter}
          ${projectScopeFilter}
          ${commandTypeFilter}
        ORDER BY j.MTRD_BimJob_CreadoEn ASC, j.MTRD_BimJob_ID ASC
        LIMIT ?
        FOR UPDATE
      `, params);

      const claimableRows = rows
        .filter((row) => canClaimBimJobForActiveModel(row.model_identity_json, activeModelIdentity, targetMode))
        .slice(0, limit);

      for (const row of claimableRows) {
        await connection.query(`
          UPDATE MTRD_BimJob
          SET
            MTRD_BimJob_Status = 'claimed',
            MTRD_BimJob_Stage = 'Tomado por Revit',
            MTRD_BimJob_Percent = GREATEST(MTRD_BimJob_Percent, 1),
            MTRD_BimJob_ClaimedBy = ?,
            MTRD_BimJob_ClaimedAt = CURRENT_TIMESTAMP,
            MTRD_BimJob_ActualizadoEn = CURRENT_TIMESTAMP
          WHERE MTRD_BimJob_ID = ?
        `, [bridgeId, row.job_id]);
        await connection.query(`
          INSERT INTO MTRD_BimJobLog (
            MTRD_BimJobLog_KEY_Job,
            MTRD_BimJobLog_Level,
            MTRD_BimJobLog_Message
          ) VALUES (?, 'info', ?)
        `, [row.job_id, requestedBy ? `Job tomado por ${bridgeId}. Usuario Revit: ${requestedBy}.` : `Job tomado por ${bridgeId}.`]);
        claimedJobUids.push(row.job_uid);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const jobs = [];
    for (const jobUid of claimedJobUids) {
      const job = await this.loadBimJob(jobUid);
      if (job) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  async updateBimJobProgress(jobUid, progress, context = {}) {
    await this.ensureReady();
    const connection = await this.pool.getConnection();
    let shouldSaveCompletedCache = false;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(`
        SELECT
          MTRD_BimJob_ID AS job_id,
          MTRD_BimJob_UID AS job_uid,
          MTRD_BimJob_Status AS status_name,
          MTRD_BimJob_ClaimedBy AS claimed_by
        FROM MTRD_BimJob
        WHERE MTRD_BimJob_UID = ?
        LIMIT 1
        FOR UPDATE
      `, [normalizeIdentifier(jobUid, "")]);
      const row = rows[0];
      if (!row) {
        await connection.rollback();
        return null;
      }
      const progressDecision = createBimJobProgressDecision(row.status_name);
      if (!progressDecision.shouldUpdate) {
        await connection.commit();
        return this.loadBimJob(jobUid);
      }
      const reporterId = normalizeText(context.bridgeId, "");
      if (!canReportBimJobProgressForClaim(row.claimed_by, reporterId)) {
        await connection.rollback();
        throw new BimJobOwnershipError(row.job_uid || jobUid, normalizeText(row.claimed_by, ""), reporterId);
      }

      const progressUpdate = normalizeIncomingBimJobProgress(progress, {
        currentStatus: progressDecision.currentStatus || "running",
      });
      const status = normalizeBimJobStatus(progressUpdate.status, row.status_name || "running");
      const percent = clampNumber(progressUpdate.percent, 0, 100, status === "completed" ? 100 : 0);
      const stage = normalizeText(progressUpdate.stage, getDefaultBimJobStage(status));
      const resultStorage = progressUpdate.result === null
        ? { payloadObject: null, operations: [], source: "result-apply-plan" }
        : detachBimJobOperationsForStorage(normalizeJsonObject(progressUpdate.result) || {}, {
          jobUid,
          source: "result-apply-plan",
          applyPlanOnly: true,
          pageSize: BIM_JOB_OPERATION_PAGE_SIZE,
        });
      const resultJson = resultStorage.payloadObject === null ? null : JSON.stringify(resultStorage.payloadObject);
      shouldSaveCompletedCache = status === "completed" && Boolean(resultJson);
      const errorMessage = normalizeText(progressUpdate.error, "");
      const completedAtSql = isFinishedBimJobStatus(status) ? "CURRENT_TIMESTAMP" : "NULL";
      await connection.query(`
        UPDATE MTRD_BimJob
        SET
          MTRD_BimJob_Status = ?,
          MTRD_BimJob_Stage = ?,
          MTRD_BimJob_Percent = ?,
          MTRD_BimJob_ResultJson = COALESCE(?, MTRD_BimJob_ResultJson),
          MTRD_BimJob_Error = ?,
          MTRD_BimJob_ClaimedBy = COALESCE(NULLIF(?, ''), MTRD_BimJob_ClaimedBy),
          MTRD_BimJob_CompletedAt = ${completedAtSql},
          MTRD_BimJob_ActualizadoEn = CURRENT_TIMESTAMP
        WHERE MTRD_BimJob_ID = ?
      `, [
        status,
        stage,
        percent,
        resultJson,
        errorMessage,
        reporterId,
        row.job_id,
      ]);
      if (resultStorage.operations.length > 0) {
        await this.replaceBimJobOperations(row.job_id, resultStorage.source, resultStorage.operations, connection);
      }

      const logMessage = normalizeText(progressUpdate.message, "");
      if (logMessage) {
        await connection.query(`
          INSERT INTO MTRD_BimJobLog (
            MTRD_BimJobLog_KEY_Job,
            MTRD_BimJobLog_Level,
            MTRD_BimJobLog_Message
          ) VALUES (?, ?, ?)
        `, [
          row.job_id,
          normalizeBimJobLogLevel(progressUpdate.level),
          logMessage,
        ]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (shouldSaveCompletedCache) {
      await this.saveCompletedBimJobCache(jobUid);
    }
    return this.loadBimJob(jobUid);
  }

  async expireStaleBimJobs(staleMinutes = BIM_JOB_STALE_MINUTES) {
    await this.ensureReady();
    const minutes = normalizeBimJobStaleMinutes(staleMinutes, BIM_JOB_STALE_MINUTES);
    const sweepNow = Date.now();
    const sweepPlan = createBimJobStaleExpirationPlan([], {
      now: sweepNow,
      staleMinutes: minutes,
    });
    const cutoff = toMySqlDateTime(sweepPlan.cutoffIso);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(`
        SELECT
          MTRD_BimJob_ID AS job_id,
          MTRD_BimJob_UID AS job_uid,
          MTRD_BimJob_Status AS status_name,
          MTRD_BimJob_ClaimedBy AS claimed_by,
          MTRD_BimJob_ActualizadoEn AS updated_at
        FROM MTRD_BimJob
        WHERE MTRD_BimJob_Status IN ('claimed', 'running', 'applying')
          AND MTRD_BimJob_ActualizadoEn < ?
        ORDER BY MTRD_BimJob_ActualizadoEn ASC, MTRD_BimJob_ID ASC
        LIMIT 100
        FOR UPDATE
      `, [cutoff]);
      const plan = createBimJobStaleExpirationPlan(rows, {
        now: sweepNow,
        staleMinutes: minutes,
      });
      if (plan.expiredCount === 0) {
        await connection.commit();
        return 0;
      }

      await connection.query(`
        UPDATE MTRD_BimJob
        SET
          MTRD_BimJob_Status = 'failed',
          MTRD_BimJob_Stage = 'Sin heartbeat',
          MTRD_BimJob_Percent = 100,
          MTRD_BimJob_Error = ?,
          MTRD_BimJob_CompletedAt = CURRENT_TIMESTAMP,
          MTRD_BimJob_ActualizadoEn = CURRENT_TIMESTAMP
        WHERE MTRD_BimJob_ID IN (?)
      `, [
        plan.errorMessage,
        plan.expiredJobIds,
      ]);

      for (const expiredJob of plan.expiredJobs) {
        await connection.query(`
          INSERT INTO MTRD_BimJobLog (
            MTRD_BimJobLog_KEY_Job,
            MTRD_BimJobLog_Level,
            MTRD_BimJobLog_Message
          ) VALUES (?, 'error', ?)
        `, [
          expiredJob.jobId,
          expiredJob.logMessage,
        ]);
      }
      await connection.commit();
      return plan.expiredCount;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async loadBimJobCache(projectId, targetMode, commandType, modelKeyHash, executor = this.pool) {
    if (!modelKeyHash) {
      return null;
    }
    const [rows] = await executor.query(`
      SELECT
        MTRD_BimJobCache_ID AS cache_id,
        MTRD_BimJobCache_ResultJson AS result_json,
        MTRD_BimJobCache_SourceJobUID AS source_job_uid,
        MTRD_BimJobCache_HitCount AS hit_count
      FROM MTRD_BimJobCache
      WHERE MTRD_BimJobCache_KEY_Proyecto = ?
        AND MTRD_BimJobCache_TargetMode = ?
        AND MTRD_BimJobCache_CommandType = ?
        AND MTRD_BimJobCache_ModelKeyHash = ?
      LIMIT 1
    `, [
      projectId,
      normalizeBimJobTargetMode(targetMode),
      normalizeBimJobCommandType(commandType),
      modelKeyHash,
    ]);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      cacheId: row.cache_id,
      result: parseJsonObject(row.result_json) || {},
      sourceJobUid: normalizeIdentifier(row.source_job_uid, ""),
      hitCount: Number(row.hit_count || 0),
    };
  }

  async loadActiveReusableBimJob(projectId, targetMode, commandType, modelKeyHash, executor = this.pool) {
    if (!modelKeyHash) {
      return null;
    }
    const [rows] = await executor.query(`
      SELECT ${BIM_JOB_SELECT_COLUMNS}
      FROM MTRD_BimJob j
      INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
      WHERE j.MTRD_BimJob_KEY_Proyecto = ?
        AND j.MTRD_BimJob_TargetMode = ?
        AND j.MTRD_BimJob_CommandType = ?
        AND j.MTRD_BimJob_ModelKeyHash = ?
        AND j.MTRD_BimJob_Status IN (?)
      ORDER BY
        FIELD(j.MTRD_BimJob_Status, 'applying', 'running', 'claimed', 'queued') ASC,
        j.MTRD_BimJob_ActualizadoEn DESC,
        j.MTRD_BimJob_CreadoEn ASC,
        j.MTRD_BimJob_ID ASC
      LIMIT 1
    `, [
      projectId,
      normalizeBimJobTargetMode(targetMode),
      normalizeBimJobCommandType(commandType),
      modelKeyHash,
      BIM_JOB_ACTIVE_REUSE_STATUSES,
    ]);
    const jobs = await this.attachBimJobLogs(rows.map(mapBimJobRow));
    return jobs[0] || null;
  }

  async markBimJobCacheHit(cacheId, executor = this.pool) {
    if (!cacheId) {
      return;
    }
    await executor.query(`
      UPDATE MTRD_BimJobCache
      SET
        MTRD_BimJobCache_HitCount = MTRD_BimJobCache_HitCount + 1,
        MTRD_BimJobCache_ActualizadoEn = CURRENT_TIMESTAMP
      WHERE MTRD_BimJobCache_ID = ?
    `, [cacheId]);
  }

  async saveCompletedBimJobCache(jobUid) {
    const [rows] = await this.pool.query(`
      SELECT
        j.MTRD_BimJob_UID AS job_uid,
        p.MTRD_Proyecto_ID AS project_id,
        p.MTRD_Proyecto_UID AS project_uid,
        j.MTRD_BimJob_TargetMode AS target_mode,
        j.MTRD_BimJob_CommandType AS command_type,
        j.MTRD_BimJob_PayloadJson AS payload_json,
        j.MTRD_BimJob_ModelIdentityJson AS model_identity_json,
        j.MTRD_BimJob_ResultJson AS result_json
      FROM MTRD_BimJob j
      INNER JOIN MTRD_Proyecto p ON p.MTRD_Proyecto_ID = j.MTRD_BimJob_KEY_Proyecto
      WHERE j.MTRD_BimJob_UID = ?
        AND j.MTRD_BimJob_Status = 'completed'
        AND j.MTRD_BimJob_ResultJson IS NOT NULL
      LIMIT 1
    `, [normalizeIdentifier(jobUid, "")]);
    const row = rows[0];
    if (!row) {
      return false;
    }

    const targetMode = normalizeBimJobTargetMode(row.target_mode);
    const commandType = normalizeBimJobCommandType(row.command_type);
    const payload = parseJsonObject(row.payload_json) || {};
    const modelIdentity = parseJsonObject(row.model_identity_json) || {};
    const result = parseJsonObject(row.result_json) || {};
    if (result.cache && typeof result.cache === "object" && result.cache.hit === true) {
      return false;
    }
    if (!shouldPersistBimJobCache(payload, commandType)) {
      return false;
    }

    const cacheKey = buildBimJobCacheKey(row.project_uid, targetMode, commandType, modelIdentity, payload);
    if (!cacheKey) {
      return false;
    }

    await this.pool.query(`
      INSERT INTO MTRD_BimJobCache (
        MTRD_BimJobCache_KEY_Proyecto,
        MTRD_BimJobCache_TargetMode,
        MTRD_BimJobCache_CommandType,
        MTRD_BimJobCache_ModelKeyHash,
        MTRD_BimJobCache_ModelIdentityJson,
        MTRD_BimJobCache_ResultJson,
        MTRD_BimJobCache_SourceJobUID,
        MTRD_BimJobCache_CreadoEn,
        MTRD_BimJobCache_ActualizadoEn
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        MTRD_BimJobCache_ModelIdentityJson = VALUES(MTRD_BimJobCache_ModelIdentityJson),
        MTRD_BimJobCache_ResultJson = VALUES(MTRD_BimJobCache_ResultJson),
        MTRD_BimJobCache_SourceJobUID = VALUES(MTRD_BimJobCache_SourceJobUID),
        MTRD_BimJobCache_ActualizadoEn = CURRENT_TIMESTAMP
    `, [
      row.project_id,
      targetMode,
      commandType,
      cacheKey.hash,
      JSON.stringify(modelIdentity),
      JSON.stringify(result),
      normalizeIdentifier(row.job_uid, ""),
    ]);
    return true;
  }

  async findProjectByUid(projectUid) {
    await this.ensureReady();
    const [rows] = await this.pool.query(`
      SELECT
        MTRD_Proyecto_ID AS project_id,
        MTRD_Proyecto_UID AS project_uid
      FROM MTRD_Proyecto
      WHERE MTRD_Proyecto_UID = ?
        AND MTRD_Proyecto_Estado = 1
      LIMIT 1
    `, [normalizeIdentifier(projectUid, "")]);
    return rows[0] || null;
  }

  async insertBimJobLog(jobId, level, message, executor = this.pool) {
    await executor.query(`
      INSERT INTO MTRD_BimJobLog (
        MTRD_BimJobLog_KEY_Job,
        MTRD_BimJobLog_Level,
        MTRD_BimJobLog_Message
      ) VALUES (?, ?, ?)
    `, [
      jobId,
      normalizeBimJobLogLevel(level),
      normalizeText(message, ""),
    ]);
  }

  async insertBimJobLogByUid(jobUid, level, message, executor = this.pool) {
    await executor.query(`
      INSERT INTO MTRD_BimJobLog (
        MTRD_BimJobLog_KEY_Job,
        MTRD_BimJobLog_Level,
        MTRD_BimJobLog_Message
      )
      SELECT
        MTRD_BimJob_ID,
        ?,
        ?
      FROM MTRD_BimJob
      WHERE MTRD_BimJob_UID = ?
      LIMIT 1
    `, [
      normalizeBimJobLogLevel(level),
      normalizeText(message, ""),
      normalizeIdentifier(jobUid, ""),
    ]);
  }

  async attachBimJobLogs(jobs) {
    if (jobs.length === 0) {
      return [];
    }
    const jobIds = jobs.map((job) => job.internalId).filter(Boolean);
    if (jobIds.length === 0) {
      return jobs.map(({ internalId, ...job }) => ({ ...job, logs: [] }));
    }
    const [logRows] = await this.pool.query(`
      SELECT
        MTRD_BimJobLog_ID AS log_id,
        MTRD_BimJobLog_KEY_Job AS job_id,
        MTRD_BimJobLog_Level AS level_name,
        MTRD_BimJobLog_Message AS message_text,
        MTRD_BimJobLog_CreadoEn AS created_at
      FROM MTRD_BimJobLog
      WHERE MTRD_BimJobLog_KEY_Job IN (?)
      ORDER BY MTRD_BimJobLog_CreadoEn ASC, MTRD_BimJobLog_ID ASC
    `, [jobIds]);
    const logsByJobId = groupRowsByKey(logRows, "job_id");
    return jobs.map(({ internalId, ...job }) => ({
      ...job,
      logs: (logsByJobId.get(internalId) || []).map((row) => ({
        id: String(row.log_id || ""),
        level: normalizeBimJobLogLevel(row.level_name),
        message: normalizeText(row.message_text, ""),
        createdAt: normalizeIsoString(row.created_at),
      })),
    }));
  }

  async listBimJobArtifacts(jobUid) {
    await this.ensureReady();
    const [rows] = await this.pool.query(`
      SELECT
        a.MTRD_BimJobArtifact_UID AS artifact_uid,
        a.MTRD_BimJobArtifact_Kind AS artifact_kind,
        a.MTRD_BimJobArtifact_Name AS artifact_name,
        a.MTRD_BimJobArtifact_ContentType AS content_type,
        a.MTRD_BimJobArtifact_StorageProvider AS storage_provider,
        a.MTRD_BimJobArtifact_StorageUri AS storage_uri,
        a.MTRD_BimJobArtifact_SizeBytes AS size_bytes,
        a.MTRD_BimJobArtifact_ChecksumSha256 AS checksum_sha256,
        a.MTRD_BimJobArtifact_MetadataJson AS metadata_json,
        a.MTRD_BimJobArtifact_CreadoEn AS created_at
      FROM MTRD_BimJobArtifact a
      INNER JOIN MTRD_BimJob j ON j.MTRD_BimJob_ID = a.MTRD_BimJobArtifact_KEY_Job
      WHERE j.MTRD_BimJob_UID = ?
      ORDER BY a.MTRD_BimJobArtifact_CreadoEn ASC, a.MTRD_BimJobArtifact_ID ASC
    `, [normalizeIdentifier(jobUid, "")]);

    return rows.map(mapBimJobArtifactRow);
  }

  async loadBimJobArtifact(jobUid, artifactUid) {
    await this.ensureReady();
    const [rows] = await this.pool.query(`
      SELECT
        a.MTRD_BimJobArtifact_UID AS artifact_uid,
        a.MTRD_BimJobArtifact_Kind AS artifact_kind,
        a.MTRD_BimJobArtifact_Name AS artifact_name,
        a.MTRD_BimJobArtifact_ContentType AS content_type,
        a.MTRD_BimJobArtifact_StorageProvider AS storage_provider,
        a.MTRD_BimJobArtifact_StorageUri AS storage_uri,
        a.MTRD_BimJobArtifact_SizeBytes AS size_bytes,
        a.MTRD_BimJobArtifact_ChecksumSha256 AS checksum_sha256,
        a.MTRD_BimJobArtifact_MetadataJson AS metadata_json,
        a.MTRD_BimJobArtifact_CreadoEn AS created_at
      FROM MTRD_BimJobArtifact a
      INNER JOIN MTRD_BimJob j ON j.MTRD_BimJob_ID = a.MTRD_BimJobArtifact_KEY_Job
      WHERE j.MTRD_BimJob_UID = ?
        AND a.MTRD_BimJobArtifact_UID = ?
      LIMIT 1
    `, [
      normalizeIdentifier(jobUid, ""),
      normalizeIdentifier(artifactUid, ""),
    ]);
    return rows[0] ? mapBimJobArtifactRow(rows[0]) : null;
  }

  async saveBimJobArtifacts(jobUid, artifactsInput, context = {}) {
    await this.ensureReady();
    const artifacts = normalizeIncomingBimArtifacts(artifactsInput);
    if (artifacts.length === 0) {
      return [];
    }

    const connection = await this.pool.getConnection();
    const savedUids = [];
    try {
      await connection.beginTransaction();
      const [jobRows] = await connection.query(`
        SELECT
          MTRD_BimJob_ID AS job_id,
          MTRD_BimJob_UID AS job_uid,
          MTRD_BimJob_ClaimedBy AS claimed_by,
          MTRD_BimJob_Status AS status_name
        FROM MTRD_BimJob
        WHERE MTRD_BimJob_UID = ?
        LIMIT 1
        FOR UPDATE
      `, [normalizeIdentifier(jobUid, "")]);
      const jobId = jobRows[0]?.job_id;
      if (!jobId) {
        await connection.rollback();
        return [];
      }
      if (isFinishedBimJobStatus(jobRows[0]?.status_name)) {
        await connection.rollback();
        return null;
      }
      const reporterId = normalizeText(context.bridgeId, "");
      if (!canWriteBimJobArtifactsForClaim(jobRows[0]?.claimed_by, reporterId)) {
        await connection.rollback();
        throw new BimJobOwnershipError(
          jobRows[0]?.job_uid || jobUid,
          normalizeText(jobRows[0]?.claimed_by, ""),
          reporterId,
        );
      }

      for (const artifact of artifacts) {
        const artifactUid = randomUUID();
        let storageProvider = artifact.storageProvider;
        let storageUri = artifact.storageUri;
        let sizeBytes = artifact.sizeBytes;
        let checksum = artifact.checksumSha256;

        if (hasBimArtifactContent(artifact)) {
          const artifactDir = path.join(BIM_ARTIFACT_STORAGE_DIR, sanitizePathSegment(jobUid));
          await fs.promises.mkdir(artifactDir, { recursive: true });
          const buffer = decodeBimArtifactContent(artifact);
          if (buffer.length > BIM_ARTIFACT_MAX_BYTES) {
            throw new Error(`El artefacto ${artifact.name} supera el maximo de ${BIM_ARTIFACT_MAX_BYTES} bytes.`);
          }
          checksum = createHash("sha256").update(buffer).digest("hex");
          const safeFileName = `${artifactUid}-${sanitizePathSegment(artifact.name) || "artifact.bin"}`;
          const absolutePath = path.join(artifactDir, safeFileName);
          await fs.promises.writeFile(absolutePath, buffer);
          storageProvider = "local";
          storageUri = `local://${path.relative(__dirname, absolutePath).replace(/\\/g, "/")}`;
          sizeBytes = buffer.length;
        } else if (!hasBimArtifactReference(artifact)) {
          continue;
        }

        const metadata = {
          ...artifact.metadata,
          uploadedBy: normalizeText(context.bridgeId, "bim-worker"),
        };

        await connection.query(`
          INSERT INTO MTRD_BimJobArtifact (
            MTRD_BimJobArtifact_UID,
            MTRD_BimJobArtifact_KEY_Job,
            MTRD_BimJobArtifact_Kind,
            MTRD_BimJobArtifact_Name,
            MTRD_BimJobArtifact_ContentType,
            MTRD_BimJobArtifact_StorageProvider,
            MTRD_BimJobArtifact_StorageUri,
            MTRD_BimJobArtifact_SizeBytes,
            MTRD_BimJobArtifact_ChecksumSha256,
            MTRD_BimJobArtifact_MetadataJson
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          artifactUid,
          jobId,
          artifact.kind,
          artifact.name,
          artifact.contentType,
          storageProvider,
          storageUri,
          sizeBytes,
          checksum,
          JSON.stringify(metadata),
        ]);
        await connection.query(`
          INSERT INTO MTRD_BimJobLog (
            MTRD_BimJobLog_KEY_Job,
            MTRD_BimJobLog_Level,
            MTRD_BimJobLog_Message
          ) VALUES (?, 'info', ?)
        `, [
          jobId,
          `Artefacto BIM guardado: ${artifact.name}.`,
        ]);
        savedUids.push(artifactUid);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const allArtifacts = await this.listBimJobArtifacts(jobUid);
    return allArtifacts.filter((artifact) => savedUids.includes(artifact.id));
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

async function authorizeBimBridgeRequest(request, response) {
  if (isAuthorizedRevitIngestRequest(request)) {
    return { apiKey: true, user: null };
  }

  const authorization = await accessControl.authorizeRequest(request, "editor");
  if (!authorization.ok) {
    respondJson(response, authorization.status, {
      ok: false,
      error: revitIngestApiKey
        ? "Bridge BIM no autorizado. Configura web.ingestApiKey con REVIT_INGEST_API_KEY."
        : authorization.error,
      accessControl: accessControl.getPublicSettings(),
    });
    return null;
  }

  return { apiKey: false, user: authorization.user };
}

async function authorizeBimBridgeClaimAccess({ bridgeAuth, targetMode, requestedBy, projectId }) {
  const requestedUser = bridgeAuth?.apiKey && targetMode === "active-revit" && requestedBy
    ? await accessControl.findUserByEmail(requestedBy)
    : null;

  return createBimBridgeClaimAccessDecision({
    accessControlEnabled: accessControl.getPublicSettings().enabled,
    apiKey: bridgeAuth?.apiKey === true,
    sessionUser: bridgeAuth?.user || null,
    requestedBy,
    requestedUser,
    targetMode,
    projectId,
  });
}

async function streamBimJobEvents(request, response, storageAdapter, jobUid) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  request.on("close", () => {
    closed = true;
  });

  const writeEvent = (event, payload) => {
    if (closed) return;
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  response.write(`retry: ${BIM_JOB_SSE_RETRY_MS}\n\n`);

  let lastSignature = "";
  const emitCurrent = async () => {
    const job = await storageAdapter.loadBimJob(jobUid);
    if (!job) {
      writeEvent("error", { ok: false, error: "No se encontro el job BIM." });
      closed = true;
      response.end();
      return;
    }
    const eventPlan = shouldEmitBimJobSseUpdate(job, lastSignature);
    if (eventPlan.shouldEmit) {
      lastSignature = eventPlan.signature;
      writeEvent("job", { ok: true, job });
    } else {
      writeEvent("ping", { ok: true, updatedAt: new Date().toISOString() });
    }
    if (isFinishedBimJobStatus(job.status)) {
      closed = true;
      response.end();
    }
  };

  await emitCurrent();
  if (closed) {
    return;
  }
  const interval = setInterval(() => {
    if (closed) {
      clearInterval(interval);
      return;
    }
    emitCurrent().catch((error) => {
      writeEvent("error", { ok: false, error: error instanceof Error ? error.message : String(error) });
      clearInterval(interval);
      response.end();
    });
  }, BIM_JOB_SSE_POLL_MS);
}

async function streamBimArtifactDownload(request, response, artifact) {
  const localPath = resolveLocalBimArtifactPath(artifact);
  if (!localPath) {
    const remoteUrl = resolveRemoteBimArtifactDownloadUrl(artifact);
    if (remoteUrl) {
      response.writeHead(302, {
        "Location": remoteUrl,
        "Cache-Control": "private, no-cache",
        "X-Itemicostos-Artifact-Id": artifact.id,
        "X-Itemicostos-Artifact-Sha256": artifact.checksumSha256 || "",
      });
      response.end();
      return;
    }
    respondJson(response, 409, {
      ok: false,
      error: "El proveedor de almacenamiento del artefacto aun no tiene descarga directa configurada.",
    });
    return;
  }

  let stat;
  try {
    stat = await fs.promises.stat(localPath);
  } catch {
    respondJson(response, 404, { ok: false, error: "No se encontro el archivo fisico del artefacto BIM." });
    return;
  }
  if (!stat.isFile()) {
    respondJson(response, 404, { ok: false, error: "El artefacto BIM no apunta a un archivo valido." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": artifact.contentType || "application/octet-stream",
    "Content-Length": String(stat.size),
    "Content-Disposition": `attachment; filename="${escapeContentDispositionFilename(artifact.name || "artifact.bin")}"`,
    "Cache-Control": "private, no-cache",
    "X-Itemicostos-Artifact-Id": artifact.id,
    "X-Itemicostos-Artifact-Sha256": artifact.checksumSha256 || "",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(localPath).pipe(response);
}

function resolveLocalBimArtifactPath(artifact) {
  if (artifact.storageProvider !== "local" || !artifact.storageUri.startsWith("local://")) {
    return "";
  }
  const relativePath = artifact.storageUri.slice("local://".length);
  const absolutePath = path.resolve(__dirname, relativePath);
  const storageRoot = path.resolve(BIM_ARTIFACT_STORAGE_DIR);
  const normalizedAbsolutePath = absolutePath.toLowerCase();
  const normalizedStorageRoot = storageRoot.toLowerCase();
  if (
    !normalizedAbsolutePath.startsWith(`${normalizedStorageRoot}${path.sep}`)
    && normalizedAbsolutePath !== normalizedStorageRoot
  ) {
    return "";
  }
  return absolutePath;
}

function resolveRemoteBimArtifactDownloadUrl(artifact) {
  return resolveRemoteBimArtifactDownloadUrlDomain(artifact, BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS);
}

function normalizeAllowedBimArtifactRedirectUrl(value) {
  return normalizeAllowedBimArtifactRedirectUrlDomain(value, BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS);
}

function isAllowedBimArtifactRedirectHost(hostname) {
  return isBimArtifactRedirectHostAllowed(hostname, BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS);
}

function escapeContentDispositionFilename(value) {
  return sanitizeBimArtifactName(value).replace(/["\\]/g, "-");
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
            displayName: "Quantiva local",
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

      if (!userCanAccessAnyProject(user)) {
        sessions.delete(token);
        await deleteSessionFromStore(token);
        return {
          ok: false,
          status: 403,
          error: "Tu cuenta no tiene proyectos asignados. Contacta al superadmin.",
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
    async findUserByEmail(emailInput) {
      if (!enabled) {
        return null;
      }

      await ensureUsersStoreSynchronized();
      const user = getUserByEmail(emailInput);
      return user ? toPublicUser(user) : null;
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
      const viewAccessByProject = normalizeViewAccessByProjectInput(
        payload?.viewAccessByProject,
        projectIds,
        requestedRole,
      );
      if (existing) {
        existing.displayName = displayName;
        existing.role = requestedRole;
        existing.active = active;
        existing.projectIds = projectIds;
        existing.viewAccessByProject = viewAccessByProject;
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
        viewAccessByProject,
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
    const viewAccessByProject = normalizeViewAccessByProjectInput(
      user.viewAccessByProject,
      role === "superadmin" ? ["*"] : projectIds,
      role,
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
      viewAccessByProject,
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
    viewAccessByProject = null,
  }) {
    const nowIso = new Date().toISOString();
    const normalizedRole = normalizeAuthRole(role, "viewer");
    const normalizedProjectIds = normalizedRole === "superadmin"
      ? ["*"]
      : normalizeProjectIdsForUser(projectIds, { allowWildcard: false });
    return {
      id: randomUUID(),
      email: normalizeAuthEmail(email),
      displayName: normalizeText(displayName, email),
      role: normalizedRole,
      active: active !== false,
      projectIds: normalizedProjectIds,
      viewAccessByProject: normalizeViewAccessByProjectInput(
        viewAccessByProject,
        normalizedProjectIds,
        normalizedRole,
      ),
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
      existingUser.viewAccessByProject = normalizeViewAccessByProjectInput(null, ["*"], "superadmin");
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
      viewAccessByProject: normalizeViewAccessByProjectInput(
        user?.viewAccessByProject,
        role === "superadmin"
          ? ["*"]
          : normalizeProjectIdsForUser(user?.projectIds, { allowWildcard: false }),
        role,
      ),
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
            viewAccessByProject: normalizeViewAccessByProjectInput(
              user.viewAccessByProject,
              normalizeAuthRole(user.role, "viewer") === "superadmin"
                ? ["*"]
                : normalizeProjectIdsForUser(user.projectIds, { allowWildcard: false }),
              normalizeAuthRole(user.role, "viewer"),
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
        existing.viewAccessByProject = normalizeViewAccessByProjectInput(null, ["*"], "superadmin");
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

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value, min, max, fallback) {
  return Math.trunc(clampNumber(value, min, max, fallback));
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

function getApuProjectItemKey(projectId, itemUid) {
  return `${String(projectId || "")}:${String(itemUid || "")}`;
}

function groupApuRowsByProjectItem(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = getApuProjectItemKey(row.project_id, row.item_uid);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  });
  return grouped;
}

function groupMetradoRowsByProjectItem(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = getApuProjectItemKey(row.project_id, row.item_uid);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  });
  return grouped;
}

function normalizeApuCategory(value) {
  const candidate = String(value || "").trim();
  return APU_CATEGORY_KEYS.includes(candidate) ? candidate : "mano-obra";
}

function mapApuRowsToItems(rows) {
  return rows.map((row, index) => ({
    id: normalizeIdentifier(row.apu_uid, `apu-${index + 1}`),
    resourceId: normalizeIdentifier(row.apu_resource_uid, ""),
    subpartidaId: normalizeIdentifier(row.apu_subpartida_uid, ""),
    category: normalizeApuCategory(row.apu_category),
    descripcion: normalizeDescriptionText(row.apu_descripcion),
    cuadrilla: normalizeDecimalString(row.apu_cuadrilla),
    unidad: String(row.apu_unidad || ""),
    cantidad: normalizeDecimalString(row.apu_cantidad),
    precioUnitario: normalizeDecimalString(row.apu_precio_unitario),
  }));
}

function mapMetradoRowsToItems(rows) {
  return rows.map((row, index) => ({
    id: normalizeIdentifier(row.metrado_uid, `metrado-${index + 1}`),
    descripcion: normalizeDescriptionText(row.metrado_descripcion),
    veces: normalizeDecimalString(row.metrado_veces),
    largo: normalizeDecimalString(row.metrado_largo),
    ancho: normalizeDecimalString(row.metrado_ancho),
    alto: normalizeDecimalString(row.metrado_alto),
    parcial: normalizeDecimalString(row.metrado_parcial),
  }));
}

function mapBudgetConfigRowToSettings(row) {
  return {
    gastosGeneralesPercent: normalizeDecimalString(row?.gastos_generales_pct),
    utilidadPercent: normalizeDecimalString(row?.utilidad_pct),
    igvPercent: normalizeDecimalString(row?.igv_pct ?? 18),
    includeIgv: row?.incluye_igv !== 0,
  };
}

function mapPolynomialRowsToGroups(rows) {
  return rows.map((row, index) => ({
    id: normalizeIdentifier(row.polynomial_uid, `poly-${index + 1}`),
    codigo: String(row.polynomial_codigo || ""),
    descripcion: normalizeDescriptionText(row.polynomial_descripcion),
    indice: normalizeDescriptionText(row.polynomial_indice),
    categoria: normalizeApuCategory(row.polynomial_categoria),
    orden: Number.parseInt(row.polynomial_order || index + 1, 10) || (index + 1),
  }));
}

function mapUnitCatalogRowsToItems(rows) {
  return rows.map((row, index) => ({
    id: normalizeIdentifier(row.unit_uid, `unit-${index + 1}`),
    codigo: normalizeUnitCode(row.unit_codigo),
    descripcion: normalizeUnitDescription(row.unit_descripcion),
    orden: Number.parseInt(row.unit_order || index + 1, 10) || (index + 1),
  })).filter((unit) => unit.codigo && unit.descripcion);
}

function mapResourceCatalogRowsToItems(rows) {
  return rows.map((row, index) => ({
    id: normalizeIdentifier(row.resource_uid, `resource-${index + 1}`),
    category: normalizeApuCategory(row.resource_category),
    descripcion: normalizeDescriptionText(row.resource_descripcion),
    unidad: String(row.resource_unidad || ""),
    precioUnitario: normalizeDecimalString(row.resource_precio_unitario),
    polynomialGroupId: normalizeIdentifier(row.resource_polynomial_group_uid, ""),
    orden: Number.parseInt(row.resource_order || index + 1, 10) || (index + 1),
  }));
}

function normalizeIncomingApuItems(itemsInput, rowInput = null) {
  return Array.isArray(itemsInput)
    ? itemsInput
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const normalizedItem = {
          id: normalizeIdentifier(item.id, `apu-${index + 1}`),
          resourceId: normalizeIdentifier(item.resourceId, ""),
          subpartidaId: normalizeIdentifier(item.subpartidaId, ""),
          category: normalizeApuCategory(item.category),
          descripcion: normalizeDescriptionText(item.descripcion),
          cuadrilla: normalizeDecimalString(item.cuadrilla),
          unidad: String(item.unidad || ""),
          cantidad: normalizeDecimalString(item.cantidad),
          precioUnitario: normalizeDecimalString(item.precioUnitario),
        };
        if (isIncomingApuCantidadCalculated(normalizedItem)) {
          normalizedItem.cantidad = getIncomingApuItemCantidad(normalizedItem, rowInput).toFixed(6);
        }
        return normalizedItem;
      })
    : [];
}

function normalizeIncomingUnitCatalogItems(itemsInput) {
  if (!Array.isArray(itemsInput)) {
    return [];
  }
  const byCode = new Map();
  itemsInput
    .filter((item) => item && typeof item === "object")
    .forEach((item, index) => {
      const unit = {
        id: normalizeIdentifier(item.id, `unit-${index + 1}`),
        codigo: normalizeUnitCode(item.codigo),
        descripcion: normalizeUnitDescription(item.descripcion),
        orden: Number.parseInt(item.orden || index + 1, 10) || (index + 1),
      };
      if (!unit.codigo || !unit.descripcion) {
        return;
      }
      byCode.set(unit.codigo.toLowerCase(), unit);
    });
  return Array.from(byCode.values()).sort((left, right) => left.orden - right.orden);
}

function normalizeIncomingMetradoItems(itemsInput) {
  return Array.isArray(itemsInput)
    ? itemsInput
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const normalizedItem = {
          id: normalizeIdentifier(item.id, `metrado-${index + 1}`),
          descripcion: normalizeDescriptionText(item.descripcion),
          veces: normalizeDecimalString(item.veces),
          largo: normalizeDecimalString(item.largo),
          ancho: normalizeDecimalString(item.ancho),
          alto: normalizeDecimalString(item.alto),
          parcial: normalizeDecimalString(item.parcial),
        };
        normalizedItem.parcial = getIncomingMetradoItemPartial(normalizedItem).toFixed(6);
        return normalizedItem;
      })
    : [];
}

function normalizeIncomingBudgetSettings(settingsInput) {
  const settings = settingsInput && typeof settingsInput === "object" ? settingsInput : {};
  return {
    gastosGeneralesPercent: normalizeDecimalString(settings.gastosGeneralesPercent),
    utilidadPercent: normalizeDecimalString(settings.utilidadPercent),
    igvPercent: normalizeDecimalString(settings.igvPercent ?? 18),
    includeIgv: settings.includeIgv !== false,
  };
}

function normalizeIncomingPolynomialGroups(itemsInput) {
  return Array.isArray(itemsInput)
    ? itemsInput
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: normalizeIdentifier(item.id, `poly-${index + 1}`),
        codigo: String(item.codigo || "").trim(),
        descripcion: normalizeDescriptionText(item.descripcion),
        indice: normalizeDescriptionText(item.indice),
        categoria: normalizeApuCategory(item.categoria),
        orden: Number.parseInt(item.orden || index + 1, 10) || (index + 1),
      }))
      .sort((left, right) => left.orden - right.orden)
    : [];
}

function normalizeIncomingResourceCatalogItems(itemsInput) {
  return Array.isArray(itemsInput)
    ? itemsInput
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: normalizeIdentifier(item.id, `resource-${index + 1}`),
        category: normalizeApuCategory(item.category),
        descripcion: normalizeDescriptionText(item.descripcion),
        unidad: String(item.unidad || ""),
        precioUnitario: normalizeDecimalString(item.precioUnitario),
        polynomialGroupId: normalizeIdentifier(item.polynomialGroupId, ""),
        orden: Number.parseInt(item.orden || index + 1, 10) || (index + 1),
      }))
      .sort((left, right) => {
        const leftCategoryIndex = APU_CATEGORY_KEYS.indexOf(left.category);
        const rightCategoryIndex = APU_CATEGORY_KEYS.indexOf(right.category);
        if (leftCategoryIndex !== rightCategoryIndex) {
          return leftCategoryIndex - rightCategoryIndex;
        }
        return left.orden - right.orden;
      })
    : [];
}

function isIncomingApuCantidadCalculated(item) {
  const category = normalizeApuCategory(item?.category);
  return category === "mano-obra" || category === "equipos";
}

function getIncomingApuItemRendimiento(item, rowInput = null) {
  const category = normalizeApuCategory(item?.category);
  if (category === "mano-obra") return parseDecimal(rowInput?.rendimientoManoObra);
  if (category === "equipos") return parseDecimal(rowInput?.rendimientoEquipos);
  return 0;
}

function getIncomingApuItemCantidad(item, rowInput = null) {
  if (!isIncomingApuCantidadCalculated(item)) return parseDecimal(item?.cantidad);
  const rendimiento = getIncomingApuItemRendimiento(item, rowInput);
  if (rendimiento <= 0) return 0;
  return (parseDecimal(item?.cuadrilla) * APU_WORKDAY_HOURS) / rendimiento;
}

function getIncomingApuTotal(items, rowInput = null) {
  return normalizeIncomingApuItems(items, rowInput).reduce((sum, item) => (
    sum + (getIncomingApuItemCantidad(item, rowInput) * parseDecimal(item.precioUnitario))
  ), 0);
}

function parseMetradoFactor(value) {
  if (value === null || value === undefined || value === "") return 1;
  return parseDecimal(value);
}

function getIncomingMetradoItemPartial(item) {
  return parseMetradoFactor(item?.veces)
    * parseMetradoFactor(item?.largo)
    * parseMetradoFactor(item?.ancho)
    * parseMetradoFactor(item?.alto);
}

function getIncomingMetradoTotal(items) {
  return normalizeIncomingMetradoItems(items).reduce((sum, item) => sum + getIncomingMetradoItemPartial(item), 0);
}

function resolveIncomingBudgetRows(rowsInput) {
  const rawRows = Array.isArray(rowsInput) ? rowsInput : [];
  const rows = rawRows.map((row, index) => ({
    ...row,
    id: normalizeIdentifier(row?.id, `row-${index + 1}`),
  }));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const memo = new Map();

  const resolveRow = (rowId, visiting = new Set()) => {
    const row = rowById.get(rowId);
    if (!row) {
      return null;
    }
    if (memo.has(rowId)) {
      return memo.get(rowId);
    }
    if (visiting.has(rowId)) {
      const cycleRow = {
        ...row,
        costo: "0.000000",
        apuItems: normalizeIncomingApuItems(row.apuItems, row),
        metradoItems: normalizeIncomingMetradoItems(row.metradoItems),
      };
      memo.set(rowId, cycleRow);
      return cycleRow;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(rowId);
    const metradoItems = normalizeIncomingMetradoItems(row.metradoItems);
    const metradoTradicional = metradoItems.length > 0
      ? getIncomingMetradoTotal(metradoItems).toFixed(6)
      : normalizeDecimalString(row.metradoTradicional ?? row.metrado);
    const apuItems = normalizeIncomingApuItems(row.apuItems, row).map((item) => {
      if (!item.subpartidaId) {
        return item;
      }
      const referenced = resolveRow(item.subpartidaId, nextVisiting);
      return {
        ...item,
        resourceId: "",
        descripcion: item.descripcion || normalizeDescriptionText(referenced?.descripcion),
        unidad: item.unidad || String(referenced?.unidad || ""),
        precioUnitario: parseDecimal(referenced?.costo).toFixed(6),
      };
    });
    const resolvedRow = {
      ...row,
      metradoTradicional,
      metradoItems,
      apuItems,
    };
    resolvedRow.costo = apuItems.length > 0
      ? getIncomingApuTotal(apuItems, resolvedRow).toFixed(6)
      : normalizeDecimalString(row.costo);
    memo.set(rowId, resolvedRow);
    return resolvedRow;
  };

  rows.forEach((row) => resolveRow(row.id));
  return rows.map((row) => memo.get(row.id) || row);
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

function normalizeProjectViewKeysInput(viewKeysInput, { defaultAll = false } = {}) {
  const rawValues = [];
  if (Array.isArray(viewKeysInput)) {
    rawValues.push(...viewKeysInput);
  } else if (typeof viewKeysInput === "string") {
    const trimmed = viewKeysInput.trim();
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

  const allowed = new Set(PROJECT_VIEW_ACCESS_KEYS);
  const unique = [];
  const seen = new Set();
  rawValues.forEach((value) => {
    const viewKey = String(value || "").trim();
    if (!allowed.has(viewKey) || seen.has(viewKey)) {
      return;
    }
    seen.add(viewKey);
    unique.push(viewKey);
  });

  if (unique.length === 0 && defaultAll) {
    return [...DEFAULT_PROJECT_VIEW_ACCESS_KEYS];
  }
  return unique;
}

function normalizeViewAccessByProjectInput(viewAccessInput, projectIdsInput, roleInput = "viewer") {
  const role = String(roleInput || "").trim().toLowerCase();
  if (role === "superadmin") {
    return {
      "*": [...DEFAULT_PROJECT_VIEW_ACCESS_KEYS],
    };
  }

  const projectIds = normalizeProjectIdsInput(projectIdsInput, { allowWildcard: false });
  const rawAccess = parseJsonObject(viewAccessInput) || {};
  const normalized = {};

  projectIds.forEach((projectId) => {
    if (Object.prototype.hasOwnProperty.call(rawAccess, projectId)) {
      normalized[projectId] = normalizeProjectViewKeysInput(rawAccess[projectId]);
    } else {
      normalized[projectId] = [...DEFAULT_PROJECT_VIEW_ACCESS_KEYS];
    }
  });

  return normalized;
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

function parseBimArtifactAllowedRedirectHosts(value) {
  return parseBimArtifactAllowedRedirectHostsDomain(value);
}

function sanitizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220);
}

function mapBimJobRow(row) {
  const status = normalizeBimJobStatus(row.status_name, "queued");
  const createdAt = normalizeIsoString(row.created_at);
  const updatedAt = normalizeIsoString(row.updated_at);
  const claimedAt = row.claimed_at ? normalizeIsoString(row.claimed_at) : "";
  const completedAt = row.completed_at ? normalizeIsoString(row.completed_at) : "";
  const now = new Date().toISOString();
  const queueEndAt = claimedAt || (status === "queued" ? now : (completedAt || updatedAt));
  const totalEndAt = completedAt || (isFinishedBimJobStatus(status) ? updatedAt : now);
  const runStartAt = status === "queued" ? "" : (claimedAt || createdAt);

  return {
    internalId: row.internal_id,
    id: normalizeIdentifier(row.job_uid, ""),
    projectId: normalizeIdentifier(row.project_uid, ""),
    targetMode: normalizeBimJobTargetMode(row.target_mode),
    commandType: normalizeBimJobCommandType(row.command_type),
    status,
    stage: normalizeText(row.stage_name, getDefaultBimJobStage(row.status_name)),
    percent: clampNumber(row.percent_value, 0, 100, 0),
    payload: parseJsonObject(row.payload_json) || {},
    modelIdentity: parseJsonObject(row.model_identity_json) || {},
    result: parseJsonObject(row.result_json) || {},
    error: normalizeText(row.error_text, ""),
    createdBy: normalizeText(row.created_by, "Usuario"),
    claimedBy: normalizeText(row.claimed_by, ""),
    claimedAt,
    createdAt,
    updatedAt,
    completedAt,
    queueWaitSeconds: diffIsoSeconds(createdAt, queueEndAt),
    runSeconds: runStartAt ? diffIsoSeconds(runStartAt, totalEndAt) : 0,
    totalSeconds: diffIsoSeconds(createdAt, totalEndAt),
    logs: [],
  };
}

function mapBimJobOperationRow(row) {
  const payload = parseJsonObject(row.payload_json) || {};
  return {
    operationType: normalizeText(payload.operationType || row.operation_type, "parameter-write"),
    elementId: normalizeNullableInteger(payload.elementId ?? row.element_id) || 0,
    elementUniqueId: normalizeIdentifier(payload.elementUniqueId || row.element_unique_id, ""),
    parameterName: normalizeText(payload.parameterName || row.parameter_name, ""),
    value: normalizeText(payload.value ?? row.value_text ?? "", ""),
  };
}

function mapBimJobArtifactRow(row) {
  return {
    id: normalizeIdentifier(row.artifact_uid, ""),
    kind: normalizeBimArtifactKind(row.artifact_kind),
    name: normalizeText(row.artifact_name, "artifact"),
    contentType: normalizeText(row.content_type, "application/octet-stream"),
    storageProvider: normalizeText(row.storage_provider, "local"),
    storageUri: normalizeText(row.storage_uri, ""),
    sizeBytes: Number(row.size_bytes || 0),
    checksumSha256: normalizeIdentifier(row.checksum_sha256, ""),
    metadata: parseJsonObject(row.metadata_json) || {},
    createdAt: normalizeIsoString(row.created_at),
  };
}

function createEmptyBimJobQueueSummary() {
  return {
    total: 0,
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    activeRevit: 0,
    activeRevitQueued: 0,
    activeRevitProcessing: 0,
    cloudModel: 0,
    cloudModelQueued: 0,
    cloudModelProcessing: 0,
    oldestQueuedAt: "",
    oldestQueuedAgeSeconds: 0,
    oldestActiveRevitQueuedAt: "",
    oldestActiveRevitQueuedAgeSeconds: 0,
    oldestActiveAt: "",
    latestCompletedAt: "",
    oldestActiveAgeSeconds: 0,
    generatedAt: new Date().toISOString(),
    bridgePresence: summarizeBimBridgePresence([], { ttlSeconds: BIM_BRIDGE_PRESENCE_TTL_SECONDS }),
  };
}

function mapBimJobQueueSummaryRows(rows) {
  const summary = createEmptyBimJobQueueSummary();
  const activeStatuses = new Set(["queued", "claimed", "running", "applying"]);

  rows.forEach((row) => {
    const status = normalizeBimJobStatus(row.status_name, "queued");
    const targetMode = normalizeBimJobTargetMode(row.target_mode);
    const count = Number(row.job_count || 0);
    summary.total += count;

    if (status === "queued") {
      summary.queued += count;
      summary.oldestQueuedAt = getEarlierIsoString(summary.oldestQueuedAt, row.oldest_created_at);
    } else if (status === "completed") {
      summary.completed += count;
      summary.latestCompletedAt = getLaterIsoString(summary.latestCompletedAt, row.latest_completed_at || row.latest_updated_at);
    } else if (status === "failed") {
      summary.failed += count;
    } else if (status === "cancelled") {
      summary.cancelled += count;
    }

    if (activeStatuses.has(status)) {
      summary.active += count;
      summary.oldestActiveAt = getEarlierIsoString(summary.oldestActiveAt, row.oldest_created_at);
      if (targetMode === "active-revit") {
        summary.activeRevit += count;
        if (status === "queued") {
          summary.activeRevitQueued += count;
          summary.oldestActiveRevitQueuedAt = getEarlierIsoString(summary.oldestActiveRevitQueuedAt, row.oldest_created_at);
        } else {
          summary.activeRevitProcessing += count;
        }
      } else if (targetMode === "cloud-model") {
        summary.cloudModel += count;
        if (status === "queued") {
          summary.cloudModelQueued += count;
        } else {
          summary.cloudModelProcessing += count;
        }
      }
    }
  });

  if (summary.oldestQueuedAt) {
    const oldestQueuedMs = new Date(summary.oldestQueuedAt).getTime();
    if (Number.isFinite(oldestQueuedMs)) {
      summary.oldestQueuedAgeSeconds = Math.max(0, Math.floor((Date.now() - oldestQueuedMs) / 1000));
    }
  }

  if (summary.oldestActiveRevitQueuedAt) {
    const oldestActiveRevitQueuedMs = new Date(summary.oldestActiveRevitQueuedAt).getTime();
    if (Number.isFinite(oldestActiveRevitQueuedMs)) {
      summary.oldestActiveRevitQueuedAgeSeconds = Math.max(0, Math.floor((Date.now() - oldestActiveRevitQueuedMs) / 1000));
    }
  }

  if (summary.oldestActiveAt) {
    const oldestActiveMs = new Date(summary.oldestActiveAt).getTime();
    if (Number.isFinite(oldestActiveMs)) {
      summary.oldestActiveAgeSeconds = Math.max(0, Math.floor((Date.now() - oldestActiveMs) / 1000));
    }
  }

  return summary;
}

function mapBimBridgeHeartbeatRow(row) {
  return {
    bridgeId: row.bridge_id || "",
    projectId: row.project_uid || "",
    requestedBy: row.requested_by || "",
    activeModelIdentity: normalizeJsonObject(row.model_identity_json) || {},
    lastSeenAt: normalizeOptionalIsoString(row.last_seen_at),
  };
}

function getEarlierIsoString(currentValue, candidateValue) {
  const candidate = normalizeOptionalIsoString(candidateValue);
  if (!candidate) {
    return currentValue || "";
  }
  if (!currentValue) {
    return candidate;
  }
  return new Date(candidate).getTime() < new Date(currentValue).getTime() ? candidate : currentValue;
}

function getLaterIsoString(currentValue, candidateValue) {
  const candidate = normalizeOptionalIsoString(candidateValue);
  if (!candidate) {
    return currentValue || "";
  }
  if (!currentValue) {
    return candidate;
  }
  return new Date(candidate).getTime() > new Date(currentValue).getTime() ? candidate : currentValue;
}

function normalizeOptionalIsoString(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function diffIsoSeconds(startIso, endIso) {
  const startMs = new Date(startIso || "").getTime();
  const endMs = new Date(endIso || "").getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return Math.floor((endMs - startMs) / 1000);
}

function buildBimJobCreationLockName(modelKeyHash) {
  const hash = normalizeIdentifier(modelKeyHash, "");
  return `mtrd:bim:create:${hash.slice(0, 48)}`;
}

function buildBimApplyJobCreationLockName(previewJobUid) {
  const hash = createHash("sha256")
    .update(normalizeIdentifier(previewJobUid, ""))
    .digest("hex");
  return `mtrd:bim:apply:${hash.slice(0, 48)}`;
}

function canCreateBimApplyJob(job) {
  return canCreateBimApplyJobFromPreviewDomain(job);
}

function buildBimPreviewSummary(resultInput) {
  const result = normalizeJsonObject(resultInput) || {};
  return {
    documentTitle: normalizeText(result.documentTitle, ""),
    modelPath: normalizeText(result.modelPath, ""),
    elementCount: Number.isFinite(Number(result.elementCount)) ? Number(result.elementCount) : 0,
    processedElements: Number.isFinite(Number(result.processedElements)) ? Number(result.processedElements) : 0,
    processedBatches: Number.isFinite(Number(result.processedBatches)) ? Number(result.processedBatches) : 0,
    commandType: normalizeBimJobCommandType(result.commandType),
  };
}

function getDefaultBimJobStage(status) {
  const normalized = normalizeBimJobStatus(status, "queued");
  if (normalized === "queued") return "En cola";
  if (normalized === "claimed") return "Tomado por Revit";
  if (normalized === "running") return "Analizando";
  if (normalized === "applying") return "Aplicando";
  if (normalized === "completed") return "Completado";
  if (normalized === "failed") return "Fallido";
  return "Cancelado";
}

function shouldRefreshBimJobCache(payload) {
  return shouldRefreshBimJobCacheDomain(payload);
}

function shouldReadBimJobCache(payload, commandType) {
  return shouldReadBimJobCacheDomain(payload, commandType);
}

function shouldPersistBimJobCache(payload, commandType) {
  return shouldPersistBimJobCacheDomain(payload, commandType);
}

function shouldReuseActiveBimJob(payload, commandType) {
  return shouldReuseActiveBimJobDomain(payload, commandType);
}

function buildBimJobCacheKey(projectUid, targetMode, commandType, modelIdentityInput, payloadInput = {}) {
  return buildBimJobCacheKeyDomain(projectUid, targetMode, commandType, modelIdentityInput, payloadInput);
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
    budgetSettings: normalizeIncomingBudgetSettings(project?.budgetSettings),
    polynomialGroups: normalizeIncomingPolynomialGroups(project?.polynomialGroups),
    unitCatalogItems: normalizeIncomingUnitCatalogItems(project?.unitCatalogItems),
    resourceCatalogItems: normalizeIncomingResourceCatalogItems(project?.resourceCatalogItems),
    collapsedIds: Array.isArray(project?.collapsedIds) ? project.collapsedIds : [],
    createdAt,
    updatedAt,
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

function normalizeUnitCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").slice(0, 30);
}

function normalizeUnitDescription(value) {
  return normalizeText(value, "").slice(0, 180);
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
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function stableJsonStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((next, key) => {
        next[key] = sortJsonValue(value[key]);
        return next;
      }, {});
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
    viewAccessByProject: accessUser
      ? normalizeViewAccessByProjectInput(
        accessUser.viewAccessByProject,
        role === "superadmin" ? ["*"] : accessUser.projectIds,
        role,
      )
      : {},
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

function resolveRequestBaseUrl(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = ["http", "https"].includes(forwardedProto) ? forwardedProto : "http";
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const requestHost = String(request.headers.host || "").trim();
  const resolvedHost = forwardedHost || requestHost || `${host}:${port}`;
  return `${protocol}://${resolvedHost.replace(/\/+$/, "")}/`;
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
    const acceptsHtmlFallback = ["GET", "HEAD"].includes(method)
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
