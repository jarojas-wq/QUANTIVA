export const BIM_JOB_FINISHED_STATUSES = ["completed", "failed", "cancelled"];

const BIM_JOB_FINISHED_STATUS_SET = new Set(BIM_JOB_FINISHED_STATUSES);

export function isFinishedBimJobStatus(value) {
  return BIM_JOB_FINISHED_STATUS_SET.has(normalizeBimJobStatusText(value));
}

export function canCancelBimJobStatus(value) {
  return !isFinishedBimJobStatus(value);
}

export function canRetryBimJobStatus(value) {
  return isFinishedBimJobStatus(value);
}

export function canRetryBimJobCommand(commandType) {
  return !isBimApplyCommand(commandType);
}

export function createBimJobProgressDecision(currentStatus) {
  const normalizedStatus = normalizeBimJobStatusText(currentStatus);
  const shouldUpdate = !isFinishedBimJobStatus(normalizedStatus);
  return {
    shouldUpdate,
    currentStatus: normalizedStatus,
    reason: shouldUpdate ? "" : "El job BIM ya esta finalizado; se ignora el progreso tardio.",
  };
}

export function createBimJobCancelTransition(status, context = {}) {
  const shouldUpdate = canCancelBimJobStatus(status);
  const userName = normalizeText(context.userName, "Usuario");
  return {
    shouldUpdate,
    status: "cancelled",
    stage: "Cancelado",
    percent: 100,
    logLevel: "warn",
    logMessage: shouldUpdate ? `Job cancelado por ${userName}.` : "",
  };
}

export function createBimJobRetryDecision(status, context = {}) {
  const canRetry = canRetryBimJobStatus(status);
  if (canRetry && !canRetryBimJobCommand(context.commandType)) {
    return {
      canRetry: false,
      reason: "Los jobs BIM de aplicacion no se reintentan; vuelve al preview y confirma una nueva aplicacion.",
    };
  }
  return {
    canRetry,
    reason: canRetry ? "" : "Solo se pueden reintentar jobs BIM finalizados.",
  };
}

function normalizeBimJobStatusText(value) {
  return String(value || "").trim().toLowerCase();
}

function isBimApplyCommand(commandType) {
  const normalized = String(commandType || "").trim().toLowerCase();
  return normalized.endsWith("-apply") || normalized.includes(":apply");
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}
