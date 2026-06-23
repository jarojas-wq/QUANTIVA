export function normalizeBimApiSmokeConfig(env = {}) {
  const baseUrl = normalizeBaseUrl(env.BIM_SMOKE_BASE_URL || env.BIM_WORKER_BASE_URL || env.WEB_BASE_URL || "http://127.0.0.1:5500/");
  const projectId = String(env.BIM_SMOKE_PROJECT_ID || env.PROJECT_ID || "").trim();
  const cookieName = String(env.ACCESS_COOKIE_NAME || "mtr2_session").trim() || "mtr2_session";
  const sessionCookie = normalizeSessionCookie(env.BIM_SMOKE_SESSION_COOKIE || env.ITEMICOSTOS_SESSION_COOKIE || "", cookieName);
  const strict = parseBoolean(env.BIM_SMOKE_STRICT, false);

  return {
    baseUrl,
    projectId,
    sessionCookie,
    strict,
    workerId: String(env.BIM_SMOKE_WORKER_ID || "api-smoke-worker").trim() || "api-smoke-worker",
  };
}

export function createBimApiSmokeJobPayload(config, timestamp = new Date().toISOString()) {
  return {
    projectId: config.projectId,
    targetMode: "cloud-model",
    commandType: "api-smoke-cloud-model-analysis",
    payload: {
      source: "api-smoke",
      batchSize: 250,
      simulatedElementCount: 1000,
      cacheMode: "skip",
      requestedAt: timestamp,
    },
    modelIdentity: {
      modelGuid: "api-smoke-model",
      documentVersion: `api-smoke-${timestamp}`,
      elementCount: 1000,
    },
  };
}

export function getBimApiSmokeMissingConfig(config) {
  const missing = [];
  if (!config.projectId) {
    missing.push("BIM_SMOKE_PROJECT_ID");
  }
  if (!config.sessionCookie) {
    missing.push("BIM_SMOKE_SESSION_COOKIE");
  }
  return missing;
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
