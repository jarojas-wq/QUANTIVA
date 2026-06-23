export function normalizeBimBridgeSmokeConfig(env = {}) {
  const baseUrl = normalizeBaseUrl(
    env.BIM_BRIDGE_SMOKE_BASE_URL
      || env.BIM_WORKER_BASE_URL
      || env.WEB_BASE_URL
      || "http://127.0.0.1:5500/",
  );
  const commandType = normalizeCommandType(
    env.BIM_BRIDGE_SMOKE_COMMAND_TYPE || "api-smoke-cloud-model-analysis",
  );
  const cookieName = String(env.ACCESS_COOKIE_NAME || "mtr2_session").trim() || "mtr2_session";
  const sessionCookie = normalizeSessionCookie(
    env.BIM_BRIDGE_SMOKE_SESSION_COOKIE || env.BIM_SMOKE_SESSION_COOKIE || env.ITEMICOSTOS_SESSION_COOKIE || "",
    cookieName,
  );
  const timestamp = normalizeTimestamp(env.BIM_BRIDGE_SMOKE_TIMESTAMP);

  return {
    baseUrl,
    apiKey: String(env.BIM_BRIDGE_SMOKE_API_KEY || env.BIM_WORKER_API_KEY || env.REVIT_INGEST_API_KEY || "").trim(),
    projectId: String(env.BIM_BRIDGE_SMOKE_PROJECT_ID || env.BIM_SMOKE_PROJECT_ID || env.PROJECT_ID || "").trim(),
    sessionCookie,
    createJob: parseBoolean(env.BIM_BRIDGE_SMOKE_CREATE_JOB, Boolean(sessionCookie)),
    workerId: String(env.BIM_BRIDGE_SMOKE_WORKER_ID || "bridge-smoke-worker").trim() || "bridge-smoke-worker",
    targetMode: normalizeTargetMode(env.BIM_BRIDGE_SMOKE_TARGET_MODE || "cloud-model"),
    commandType,
    requestedAt: timestamp,
    strict: parseBoolean(env.BIM_BRIDGE_SMOKE_STRICT, false),
    modelIdentity: {
      modelGuid: String(env.BIM_BRIDGE_SMOKE_MODEL_GUID || "bridge-smoke-cloud-model").trim(),
      documentUid: String(env.BIM_BRIDGE_SMOKE_DOCUMENT_UID || "bridge-smoke-cloud-document").trim(),
      modelPath: String(env.BIM_BRIDGE_SMOKE_MODEL_PATH || "C:/ItemicostosSmoke/bridge-smoke-cloud.rvt").trim(),
      documentVersion: String(env.BIM_BRIDGE_SMOKE_DOCUMENT_VERSION || `bridge-smoke-${timestamp}`).trim(),
      elementCount: 1000,
    },
  };
}

export function getBimBridgeSmokeMissingConfig(config) {
  const missing = [];
  if (!config.apiKey) {
    missing.push("BIM_BRIDGE_SMOKE_API_KEY");
  }
  if (!config.projectId) {
    missing.push("BIM_BRIDGE_SMOKE_PROJECT_ID");
  }
  if (config.createJob && !config.sessionCookie) {
    missing.push("BIM_BRIDGE_SMOKE_SESSION_COOKIE");
  }
  return missing;
}

export function createBimBridgeSmokeJobPayload(config) {
  return {
    projectId: config.projectId,
    targetMode: config.targetMode,
    commandType: config.commandType,
    payload: {
      source: "bim-bridge-smoke",
      batchSize: 250,
      simulatedElementCount: 1000,
      cacheMode: "skip",
      requestedAt: config.requestedAt,
    },
    modelIdentity: config.modelIdentity,
  };
}

export function buildBimBridgeSmokeClaimPath(config) {
  const query = new URLSearchParams({
    targetMode: config.targetMode,
    workerId: config.workerId,
    commandType: config.commandType,
    limit: "1",
  });
  if (config.projectId) {
    query.set("projectId", config.projectId);
  }
  return `api/bim/bridge/commands?${query.toString()}`;
}

export function createBimBridgeSmokeRunningProgress(config) {
  return {
    bridgeId: config.workerId,
    status: "running",
    stage: "Bridge smoke en ejecucion",
    percent: 25,
    message: "El bridge BIM pudo reclamar un job smoke filtrado por commandType.",
  };
}

export function createBimBridgeSmokeOwnershipMismatchProgress(config) {
  const originalWorkerId = String(config.workerId || "bridge-smoke-worker").trim() || "bridge-smoke-worker";
  const mismatchWorkerId = `${originalWorkerId}-mismatch`;
  return {
    bridgeId: mismatchWorkerId,
    workerId: mismatchWorkerId,
    status: "running",
    stage: "Bridge smoke ownership mismatch",
    percent: 30,
    message: "Intento invalido de progreso desde un bridge distinto al que reclamo el job.",
  };
}

export function createBimBridgeSmokeArtifacts(job, config, timestamp = new Date().toISOString()) {
  return [
    {
      kind: "manifest",
      name: "bim-bridge-smoke-manifest.json",
      contentType: "application/json",
      json: {
        schemaVersion: 1,
        source: "bim-bridge-smoke",
        generatedAt: timestamp,
        jobId: String(job?.id || ""),
        commandType: config.commandType,
        targetMode: config.targetMode,
        workerId: config.workerId,
      },
      metadata: {
        role: "bridge-smoke",
        commandType: config.commandType,
      },
    },
  ];
}

export function createBimBridgeSmokeCompletedProgress(job, config, artifactCount = 0) {
  return {
    bridgeId: config.workerId,
    status: "completed",
    stage: "Bridge smoke completado",
    percent: 100,
    message: "El bridge BIM reclamo, reporto progreso y cerro un job smoke correctamente.",
    result: {
      workerMode: "bridge-smoke",
      smoke: true,
      jobId: String(job?.id || ""),
      commandType: config.commandType,
      targetMode: config.targetMode,
      artifactCount,
    },
  };
}

function normalizeBaseUrl(value) {
  const text = String(value || "http://127.0.0.1:5500/").trim();
  return text.endsWith("/") ? text : `${text}/`;
}

function normalizeTargetMode(value) {
  const text = String(value || "").trim();
  return text === "active-revit" || text === "cloud-model" ? text : "cloud-model";
}

function normalizeSessionCookie(value, cookieName) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.includes("=") ? text : `${cookieName}=${text}`;
}

function normalizeCommandType(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "api-smoke-cloud-model-analysis";
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
