export function normalizeActiveRevitE2eConfig(env = {}) {
  const cookieName = normalizeText(env.ACCESS_COOKIE_NAME, "mtr2_session");
  const requestedAt = normalizeTimestamp(env.BIM_ACTIVE_REVIT_E2E_TIMESTAMP);
  return {
    baseUrl: normalizeBaseUrl(
      env.BIM_ACTIVE_REVIT_E2E_BASE_URL
        || env.BIM_BRIDGE_E2E_SMOKE_BASE_URL
        || env.BIM_SMOKE_BASE_URL
        || env.BIM_WORKER_BASE_URL
        || env.WEB_BASE_URL
        || "http://127.0.0.1:5500/",
    ),
    apiKey: normalizeText(
      env.BIM_ACTIVE_REVIT_E2E_API_KEY
        || env.BIM_BRIDGE_E2E_SMOKE_API_KEY
        || env.BIM_BRIDGE_SMOKE_API_KEY
        || env.BIM_WORKER_API_KEY
        || env.REVIT_INGEST_API_KEY,
      "",
    ),
    sessionCookie: normalizeSessionCookie(
      env.BIM_ACTIVE_REVIT_E2E_SESSION_COOKIE
        || env.BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE
        || env.BIM_SMOKE_SESSION_COOKIE
        || env.ITEMICOSTOS_SESSION_COOKIE
        || "",
      cookieName,
    ),
    projectId: normalizeText(
      env.BIM_ACTIVE_REVIT_E2E_PROJECT_ID
        || env.BIM_BRIDGE_E2E_SMOKE_PROJECT_ID
        || env.BIM_SMOKE_PROJECT_ID
        || env.PROJECT_ID,
      "",
    ),
    requestedBy: normalizeEmail(
      env.BIM_ACTIVE_REVIT_E2E_REQUESTED_BY
        || env.BIM_BRIDGE_E2E_REQUESTED_BY
        || env.BIM_BRIDGE_E2E_SMOKE_REQUESTED_BY
        || env.BIM_SMOKE_USER_EMAIL,
    ),
    commandType: normalizeCommandType(env.BIM_ACTIVE_REVIT_E2E_COMMAND_TYPE || "active-revit-preview"),
    requestedAt,
    batchSize: normalizeInteger(env.BIM_ACTIVE_REVIT_E2E_BATCH_SIZE, 250, 1, 5000),
    pollMs: normalizeInteger(env.BIM_ACTIVE_REVIT_E2E_POLL_MS, 2000, 500, 60000),
    timeoutMs: normalizeInteger(env.BIM_ACTIVE_REVIT_E2E_TIMEOUT_MS, 120000, 10000, 3600000),
    strict: parseBoolean(env.BIM_ACTIVE_REVIT_E2E_STRICT ?? env.BIM_SMOKE_STRICT, false),
    waitForCompletion: parseBoolean(env.BIM_ACTIVE_REVIT_E2E_WAIT_FOR_COMPLETION, false),
    cancelAfterProgress: parseBoolean(env.BIM_ACTIVE_REVIT_E2E_CANCEL_AFTER_PROGRESS, true),
    modelIdentity: normalizeModelIdentity({
      modelGuid: env.BIM_ACTIVE_REVIT_E2E_MODEL_GUID || env.BIM_BRIDGE_E2E_SMOKE_MODEL_GUID,
      documentUid: env.BIM_ACTIVE_REVIT_E2E_DOCUMENT_UID || env.BIM_BRIDGE_E2E_SMOKE_DOCUMENT_UID,
      modelPath: env.BIM_ACTIVE_REVIT_E2E_MODEL_PATH || env.BIM_BRIDGE_E2E_SMOKE_MODEL_PATH,
      documentVersion: env.BIM_ACTIVE_REVIT_E2E_DOCUMENT_VERSION || env.BIM_BRIDGE_E2E_SMOKE_DOCUMENT_VERSION,
    }),
  };
}

export function createActiveRevitE2ePlan(config = {}, bridgeSummary = {}) {
  const presence = normalizeBridgePresence(bridgeSummary);
  const modelIdentity = hasStableModelIdentity(config.modelIdentity)
    ? normalizeModelIdentity(config.modelIdentity)
    : normalizeModelIdentity(presence.latestModelIdentity);
  const requestedBy = normalizeEmail(config.requestedBy || presence.latestRequestedBy);
  const missing = [];

  if (!config.projectId) {
    missing.push("BIM_ACTIVE_REVIT_E2E_PROJECT_ID");
  }
  if (!config.sessionCookie) {
    missing.push("BIM_ACTIVE_REVIT_E2E_SESSION_COOKIE");
  }
  if (!config.apiKey) {
    missing.push("BIM_ACTIVE_REVIT_E2E_API_KEY");
  }
  if (!presence.online) {
    missing.push("ACTIVE_REVIT_BRIDGE_PRESENCE");
  }
  if (presence.online && !presence.latestRequestedBy) {
    missing.push("ACTIVE_REVIT_GOOGLE_SIGN_IN");
  }
  if (!requestedBy) {
    missing.push("ACTIVE_REVIT_BRIDGE_REQUESTED_BY");
  }
  if (!hasStableModelIdentity(modelIdentity)) {
    missing.push("ACTIVE_REVIT_MODEL_IDENTITY");
  }

  return {
    ok: missing.length === 0,
    missing,
    baseUrl: config.baseUrl,
    projectId: config.projectId,
    commandType: config.commandType,
    requestedBy,
    bridgeId: presence.latestBridgeId,
    bridgeSeenAt: presence.latestSeenAt,
    modelIdentity,
    batchSize: config.batchSize,
    requestedAt: config.requestedAt,
  };
}

export function createActiveRevitE2eJobPayload(plan = {}) {
  return {
    projectId: normalizeText(plan.projectId, ""),
    targetMode: "active-revit",
    commandType: normalizeCommandType(plan.commandType || "active-revit-preview"),
    payload: {
      source: "active-revit-real-e2e",
      batchSize: normalizeInteger(plan.batchSize, 250, 1, 5000),
      cacheMode: "skip",
      requestedAt: normalizeTimestamp(plan.requestedAt),
      expectedBridgeId: normalizeText(plan.bridgeId, ""),
      validationMode: "claim-and-progress",
    },
    modelIdentity: normalizeModelIdentity(plan.modelIdentity),
  };
}

export function summarizeActiveRevitE2eJobObservation(job = {}) {
  const status = normalizeText(job.status, "").toLowerCase();
  const claimedBy = normalizeText(job.claimedBy || job.workerId || job.bridgeId, "");
  const percent = normalizeNumber(job.percent ?? job.progressPercent ?? job.progress);
  const stage = normalizeText(job.stage || job.currentStage, "");
  const terminal = ["completed", "failed", "cancelled"].includes(status);
  const progressObserved = ["running", "applying", "completed"].includes(status) || percent > 0;
  return {
    id: normalizeText(job.id || job.jobId, ""),
    status,
    claimedBy,
    percent,
    stage,
    terminal,
    failed: status === "failed",
    cancelled: status === "cancelled",
    completed: status === "completed",
    claimObserved: Boolean(claimedBy) || ["claimed", "running", "applying", "completed"].includes(status),
    progressObserved,
  };
}

export function isActiveRevitE2eSatisfied(observation = {}, config = {}) {
  if (config.waitForCompletion) {
    return observation.completed === true;
  }
  return observation.claimObserved === true && observation.progressObserved === true && observation.failed !== true;
}

function normalizeBridgePresence(input = {}) {
  const source = input?.summary?.bridgePresence && typeof input.summary.bridgePresence === "object"
    ? input.summary.bridgePresence
    : input?.bridgePresence && typeof input.bridgePresence === "object"
      ? input.bridgePresence
      : input;
  const presence = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    online: presence.online === true,
    latestBridgeId: normalizeText(presence.latestBridgeId, ""),
    latestSeenAt: normalizeText(presence.latestSeenAt, ""),
    latestRequestedBy: normalizeEmail(presence.latestRequestedBy),
    latestModelIdentity: normalizeModelIdentity(presence.latestModelIdentity),
  };
}

function hasStableModelIdentity(identity = {}) {
  const source = normalizeModelIdentity(identity);
  return Boolean(source.modelGuid || source.documentUid || source.modelPath);
}

function normalizeModelIdentity(identity = {}) {
  const source = identity && typeof identity === "object" && !Array.isArray(identity) ? identity : {};
  return {
    modelGuid: normalizeText(source.modelGuid, ""),
    documentUid: normalizeText(source.documentUid, ""),
    modelPath: normalizeText(source.modelPath, ""),
    documentVersion: normalizeText(source.documentVersion || source.modelVersion || source.version, ""),
  };
}

function normalizeSessionCookie(value, cookieName) {
  const text = normalizeText(value, "");
  if (!text) {
    return "";
  }
  return text.includes("=") ? text : `${cookieName}=${text}`;
}

function normalizeBaseUrl(value) {
  const text = normalizeText(value, "http://127.0.0.1:5500/");
  return text.endsWith("/") ? text : `${text}/`;
}

function normalizeCommandType(value) {
  const text = normalizeText(value, "active-revit-preview").toLowerCase();
  return text.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "active-revit-preview";
}

function normalizeTimestamp(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeEmail(value) {
  return normalizeText(value, "").toLowerCase();
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeInteger(value, fallback, min, max) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

function parseBoolean(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "si", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(text)) {
    return false;
  }
  return fallback;
}
