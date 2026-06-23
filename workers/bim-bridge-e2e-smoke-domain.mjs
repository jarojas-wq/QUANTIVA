export function normalizeBimBridgeE2eSmokeConfig(env = {}) {
  const baseUrl = normalizeBaseUrl(
    env.BIM_BRIDGE_E2E_SMOKE_BASE_URL
      || env.BIM_BRIDGE_SMOKE_BASE_URL
      || env.BIM_SMOKE_BASE_URL
      || env.BIM_WORKER_BASE_URL
      || env.WEB_BASE_URL
      || "http://127.0.0.1:5500/",
  );
  const cookieName = String(env.ACCESS_COOKIE_NAME || "mtr2_session").trim() || "mtr2_session";
  const commandType = normalizeCommandType(
    env.BIM_BRIDGE_E2E_SMOKE_COMMAND_TYPE || "api-smoke-active-revit-preview",
  );
  const timestamp = normalizeTimestamp(env.BIM_BRIDGE_E2E_SMOKE_TIMESTAMP);

  return {
    baseUrl,
    apiKey: String(env.BIM_BRIDGE_E2E_SMOKE_API_KEY || env.BIM_BRIDGE_SMOKE_API_KEY || env.BIM_WORKER_API_KEY || env.REVIT_INGEST_API_KEY || "").trim(),
    projectId: String(env.BIM_BRIDGE_E2E_SMOKE_PROJECT_ID || env.BIM_SMOKE_PROJECT_ID || env.PROJECT_ID || "").trim(),
    sessionCookie: normalizeSessionCookie(env.BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE || env.BIM_SMOKE_SESSION_COOKIE || env.ITEMICOSTOS_SESSION_COOKIE || "", cookieName),
    strict: parseBoolean(env.BIM_BRIDGE_E2E_SMOKE_STRICT ?? env.BIM_SMOKE_STRICT, false),
    workerId: String(env.BIM_BRIDGE_E2E_SMOKE_WORKER_ID || "bridge-e2e-smoke-worker").trim() || "bridge-e2e-smoke-worker",
    requestedBy: normalizeEmail(
      env.BIM_BRIDGE_E2E_REQUESTED_BY
        || env.BIM_BRIDGE_E2E_SMOKE_REQUESTED_BY
        || env.BIM_BRIDGE_REQUESTED_BY
        || env.BIM_SMOKE_USER_EMAIL
        || "",
    ),
    targetMode: "active-revit",
    commandType,
    requestedAt: timestamp,
    modelIdentity: {
      modelGuid: String(env.BIM_BRIDGE_E2E_SMOKE_MODEL_GUID || "bridge-e2e-smoke-model").trim(),
      documentUid: String(env.BIM_BRIDGE_E2E_SMOKE_DOCUMENT_UID || "bridge-e2e-smoke-document").trim(),
      modelPath: String(env.BIM_BRIDGE_E2E_SMOKE_MODEL_PATH || "C:/ItemicostosSmoke/bridge-e2e-smoke.rvt").trim(),
      documentVersion: String(env.BIM_BRIDGE_E2E_SMOKE_DOCUMENT_VERSION || `bridge-e2e-smoke-${timestamp}`).trim(),
      elementCount: 1000,
    },
  };
}

export function getBimBridgeE2eSmokeMissingConfig(config) {
  const missing = [];
  if (!config.projectId) {
    missing.push("BIM_BRIDGE_E2E_SMOKE_PROJECT_ID");
  }
  if (!config.sessionCookie) {
    missing.push("BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE");
  }
  if (!config.apiKey) {
    missing.push("BIM_BRIDGE_E2E_SMOKE_API_KEY");
  }
  if (!config.requestedBy) {
    missing.push("BIM_BRIDGE_E2E_REQUESTED_BY");
  }
  return missing;
}

export function createBimBridgeE2eSmokeJobPayload(config) {
  return {
    projectId: config.projectId,
    targetMode: config.targetMode,
    commandType: config.commandType,
    payload: {
      source: "bridge-e2e-smoke",
      batchSize: 250,
      cacheMode: "skip",
      requestedAt: config.requestedAt,
    },
    modelIdentity: config.modelIdentity,
  };
}

export function createBimBridgeE2eSmokeDocumentVersionMismatchConfig(config) {
  const currentVersion = String(config?.modelIdentity?.documentVersion || "missing-document-version").trim()
    || "missing-document-version";
  return {
    ...config,
    modelIdentity: {
      ...(config?.modelIdentity || {}),
      documentVersion: `${currentVersion}-mismatch`,
    },
  };
}

export function createBimBridgeE2eSmokeMissingRequestedByConfig(config) {
  return {
    ...config,
    requestedBy: "",
  };
}

export function buildBimBridgeE2eSmokeClaimPath(config) {
  const query = new URLSearchParams({
    targetMode: config.targetMode,
    bridgeId: config.workerId,
    commandType: config.commandType,
    projectId: config.projectId,
    limit: "1",
    modelGuid: String(config.modelIdentity.modelGuid || ""),
    documentUid: String(config.modelIdentity.documentUid || ""),
    modelPath: String(config.modelIdentity.modelPath || ""),
    documentVersion: String(config.modelIdentity.documentVersion || ""),
    requestedBy: String(config.requestedBy || ""),
  });
  return `api/bim/bridge/commands?${query.toString()}`;
}

function normalizeSessionCookie(value, cookieName) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.includes("=") ? text : `${cookieName}=${text}`;
}

function normalizeBaseUrl(value) {
  const text = String(value || "http://127.0.0.1:5500/").trim();
  return text.endsWith("/") ? text : `${text}/`;
}

function normalizeCommandType(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "api-smoke-active-revit-preview";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTimestamp(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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
