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

export function createActiveRevitE2ePlan(config = {}, bridgeSummary = {}, localRevitSession = null) {
  const presence = normalizeBridgePresence(bridgeSummary);
  const localSession = normalizeLocalRevitSession(localRevitSession);
  const modelIdentity = hasStableModelIdentity(config.modelIdentity)
    ? normalizeModelIdentity(config.modelIdentity)
    : normalizeModelIdentity(presence.latestModelIdentity);
  const requestedBy = normalizeEmail(config.requestedBy || presence.latestRequestedBy);
  const missing = [];

  if (!config.projectId) {
    pushMissing(missing, "BIM_ACTIVE_REVIT_E2E_PROJECT_ID");
  }
  if (!config.sessionCookie) {
    pushMissing(missing, "BIM_ACTIVE_REVIT_E2E_SESSION_COOKIE");
  }
  if (!config.apiKey) {
    pushMissing(missing, "BIM_ACTIVE_REVIT_E2E_API_KEY");
  }
  if (localSession.checked && !localSession.ok) {
    const localMissing = localSession.missing.length > 0
      ? localSession.missing
      : ["REVIT_LOCAL_SESSION_READY"];
    localMissing.forEach((code) => pushMissing(missing, code));
  }
  if (localSession.checked && localSession.ok && !localSession.activeModelLikelyOpen) {
    pushMissing(missing, "ACTIVE_REVIT_MODEL_OPEN");
  }
  if (!presence.online) {
    pushMissing(missing, "ACTIVE_REVIT_BRIDGE_PRESENCE");
  }
  if (!presence.latestRequestedBy && (presence.online || presence.latestDiagnostic.signedIn === false)) {
    pushMissing(missing, "ACTIVE_REVIT_GOOGLE_SIGN_IN");
  }
  if (!requestedBy) {
    pushMissing(missing, "ACTIVE_REVIT_BRIDGE_REQUESTED_BY");
  }
  if (!hasStableModelIdentity(modelIdentity)) {
    pushMissing(missing, "ACTIVE_REVIT_MODEL_IDENTITY");
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
    localRevitSession: localSession.checked
      ? {
        ok: localSession.ok,
        status: localSession.status,
        activeModelLikelyOpen: localSession.activeModelLikelyOpen,
        activeModelWindowTitle: localSession.activeModelWindowTitle,
      }
      : null,
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
    latestDiagnostic: normalizeBridgeDiagnostic(
      presence.latestDiagnostic
        || presence.latestModelIdentity?.bridgeDiagnostic
        || {},
    ),
  };
}

function normalizeBridgeDiagnostic(diagnostic = {}) {
  const source = diagnostic && typeof diagnostic === "object" && !Array.isArray(diagnostic) ? diagnostic : {};
  return {
    signedIn: typeof source.signedIn === "boolean" ? source.signedIn : undefined,
  };
}

function normalizeLocalRevitSession(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      checked: false,
      ok: false,
      status: "",
      missing: [],
      activeModelLikelyOpen: false,
      activeModelWindowTitle: "",
    };
  }

  const processes = Array.isArray(input.processes) ? input.processes : [];
  const activeModelWindowTitle = processes
    .map((process) => normalizeText(process?.mainWindowTitle, ""))
    .find(isLikelyActiveModelWindowTitle) || "";
  return {
    checked: input.checked !== false,
    ok: input.ok === true,
    status: normalizeText(input.status, ""),
    missing: uniqueStrings(Array.isArray(input.missing) ? input.missing : []),
    activeModelLikelyOpen: Boolean(activeModelWindowTitle),
    activeModelWindowTitle,
  };
}

function isLikelyActiveModelWindowTitle(title) {
  const text = normalizeText(title, "");
  if (!text) {
    return false;
  }
  if (/\[\s*inicio\s*\]/i.test(text)) {
    return false;
  }
  return /\[[^\]]+\]/.test(text);
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

function pushMissing(missing, code) {
  const text = normalizeText(code, "");
  if (text && !missing.includes(text)) {
    missing.push(text);
  }
}

function uniqueStrings(values) {
  return Array.from(new Set(
    values
      .map((value) => normalizeText(value, ""))
      .filter(Boolean),
  ));
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
