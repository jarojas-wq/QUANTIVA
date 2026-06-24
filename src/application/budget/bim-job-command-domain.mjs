const BIM_JOB_STATUSES = ["queued", "claimed", "running", "applying", "completed", "failed", "cancelled"];
const BIM_JOB_TARGET_MODES = ["active-revit", "cloud-model"];
const BIM_JOB_LOG_LEVELS = ["info", "warn", "error"];
export const BIM_JOB_TARGET_COMMAND_MISMATCH_MESSAGE = "targetMode y commandType no coinciden: usa active-revit para comandos active-revit y cloud-model para comandos cloud-model.";

export function normalizeIncomingBimJobCreate(payload) {
  const source = normalizeObject(payload) || {};
  return {
    projectId: normalizeIdentifier(source.projectId || source.projectUid, ""),
    targetMode: normalizeBimJobTargetMode(source.targetMode),
    commandType: normalizeBimJobCommandType(source.commandType),
    payload: normalizeObject(source.payload) || {},
    modelIdentity: normalizeObject(source.modelIdentity) || {},
  };
}

export function getBimJobTargetCommandIssue(input) {
  const source = normalizeObject(input) || {};
  const targetMode = normalizeBimJobTargetMode(source.targetMode);
  const commandType = normalizeBimJobCommandType(source.commandType);
  if (targetMode === "active-revit" && isCloudModelCommand(commandType)) {
    return BIM_JOB_TARGET_COMMAND_MISMATCH_MESSAGE;
  }
  if (targetMode === "cloud-model" && isActiveRevitCommand(commandType)) {
    return BIM_JOB_TARGET_COMMAND_MISMATCH_MESSAGE;
  }
  return "";
}

export function normalizeIncomingBimClaimIdentity(searchParams) {
  return {
    documentUid: normalizeIdentifier(
      getSearchParam(searchParams, "documentUid") || getSearchParam(searchParams, "activeDocumentUid"),
      "",
    ),
    modelGuid: normalizeIdentifier(
      getSearchParam(searchParams, "modelGuid") || getSearchParam(searchParams, "activeModelGuid"),
      "",
    ),
    modelPath: normalizeBimModelPath(
      getSearchParam(searchParams, "modelPath") || getSearchParam(searchParams, "activeModelPath"),
    ),
    documentVersion: normalizeText(
      getSearchParam(searchParams, "documentVersion")
        || getSearchParam(searchParams, "activeDocumentVersion")
        || getSearchParam(searchParams, "modelVersion")
        || getSearchParam(searchParams, "activeModelVersion")
        || getSearchParam(searchParams, "revitDocumentVersion"),
      "",
    ),
    documentTitle: normalizeText(
      getSearchParam(searchParams, "documentTitle") || getSearchParam(searchParams, "activeDocumentTitle"),
      "",
    ),
  };
}

export function normalizeIncomingBimJobProgress(payload, options = {}) {
  const source = normalizeObject(payload) || {};
  const status = resolveBimJobProgressStatus(source.status, options.currentStatus);
  return {
    status,
    stage: normalizeText(source.stage, ""),
    percent: normalizeBimJobProgressPercent(source.percent, status),
    message: normalizeText(source.message, ""),
    level: normalizeBimJobLogLevel(source.level),
    result: source.result === undefined ? null : normalizeObject(source.result),
    error: normalizeText(source.error, ""),
  };
}

export function normalizeIncomingBimBridgeReporterId(sourceInput, fallback = "") {
  const bridgeId = getInputValue(sourceInput, "bridgeId")
    || getInputValue(sourceInput, "workerId")
    || getInputValue(sourceInput, "BridgeId")
    || getInputValue(sourceInput, "WorkerId");
  return normalizeIdentifier(bridgeId, fallback);
}

export function normalizeBimJobProgressPercent(value, status = "running") {
  return clampNumber(value, 0, 100, isTerminalBimJobStatus(status) ? 100 : 0);
}

export function resolveBimJobProgressStatus(value, currentStatus = "running") {
  const current = normalizeBimJobStatus(currentStatus, "running");
  const status = normalizeBimJobStatus(value, "");
  if (status) {
    if (isTerminalBimJobStatus(status)) {
      return status;
    }
    if (
      isActiveBimJobStatus(current)
      && isActiveBimJobStatus(status)
      && getActiveBimJobStatusRank(status) < getActiveBimJobStatusRank(current)
    ) {
      return current;
    }
    return status;
  }

  return current === "applying" ? "applying" : "running";
}

export function normalizeBimJobTargetMode(value) {
  const targetMode = String(value || "").trim();
  return BIM_JOB_TARGET_MODES.includes(targetMode) ? targetMode : "active-revit";
}

export function normalizeBimJobStatus(value, fallback = "queued") {
  const status = String(value || "").trim().toLowerCase();
  return BIM_JOB_STATUSES.includes(status) ? status : fallback;
}

function isTerminalBimJobStatus(status) {
  return ["completed", "failed", "cancelled"].includes(status);
}

function isActiveBimJobStatus(status) {
  return ["queued", "claimed", "running", "applying"].includes(status);
}

function getActiveBimJobStatusRank(status) {
  if (status === "applying") return 3;
  if (status === "running") return 2;
  if (status === "claimed") return 1;
  return 0;
}

export function normalizeBimJobCommandType(value) {
  const commandType = String(value || "").trim().toLowerCase();
  return commandType.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "bim-analysis";
}

export function normalizeOptionalBimJobCommandType(value) {
  const text = String(value || "").trim();
  return text ? normalizeBimJobCommandType(text) : "";
}

export function normalizeBimJobLogLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  return BIM_JOB_LOG_LEVELS.includes(level) ? level : "info";
}

export function normalizeBimModelPath(value) {
  return String(value || "").trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

function isActiveRevitCommand(commandType) {
  const tokens = commandType.split(/[:._-]+/g);
  return commandType.includes("active-revit")
    || (tokens.includes("active") && tokens.includes("revit"));
}

function isCloudModelCommand(commandType) {
  const tokens = commandType.split(/[:._-]+/g);
  return commandType.includes("cloud-model")
    || (tokens.includes("cloud") && tokens.includes("model"));
}

function getSearchParam(searchParams, key) {
  return getInputValue(searchParams, key);
}

function getInputValue(source, key) {
  if (source && typeof source.get === "function") {
    return source.get(key);
  }
  if (source && typeof source === "object") {
    return source[key];
  }
  return "";
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}
