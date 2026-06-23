import { hasBimClaimModelIdentity } from "./bim-job-model-identity-domain.mjs";

const BIM_JOB_TARGET_MODES = ["active-revit", "cloud-model"];
export const BIM_DIRECT_APPLY_JOB_CREATE_MESSAGE = "Los jobs de aplicacion Revit no se crean por POST /api/bim/jobs; usa POST /api/bim/jobs/:id/apply desde un preview completado.";

export function normalizeBimApplyPlan(input) {
  const source = normalizeObject(input);
  const operations = normalizeBimApplyOperations(source.operations);
  const operationsSource = normalizeBimOperationsSource(source.operationsSource);
  const fallbackOperationCount = operations.length > 0 ? operations.length : source.elementCount;
  const operationCount = clampInteger(
    source.operationCount ?? source.changeCount ?? fallbackOperationCount,
    0,
    Number.MAX_SAFE_INTEGER,
    0,
  );
  const elementCount = clampInteger(source.elementCount ?? source.elementsCount ?? operationCount, 0, Number.MAX_SAFE_INTEGER, operationCount);
  return {
    schemaVersion: clampInteger(source.schemaVersion, 1, 100, 1),
    sourceJobId: normalizeText(source.sourceJobId, ""),
    executionMode: normalizeText(source.executionMode, "apply"),
    operationType: normalizeText(source.operationType || source.type, ""),
    operationCount,
    elementCount,
    batchSize: clampInteger(source.batchSize, 1, 5000, 250),
    plannedBatches: clampInteger(source.plannedBatches ?? source.batchCount, 0, Number.MAX_SAFE_INTEGER, 0),
    transactionMode: normalizeText(source.transactionMode, "per-batch"),
    requiresActiveModelIdentity: normalizeBoolean(source.requiresActiveModelIdentity, true),
    requiresApplyConfirmation: normalizeBoolean(source.requiresApplyConfirmation, true),
    operations,
    operationsSource,
  };
}

export function hasExecutableBimApplyPlan(input) {
  const plan = normalizeBimApplyPlan(input);
  return Boolean(
    plan.operationType
    && plan.operationCount > 0
    && plan.plannedBatches > 0
    && plan.transactionMode
    && (plan.operations.length > 0 || hasReadableOperationsSource(plan.operationsSource))
  );
}

export function isBimApplyPlanBoundToPreview(input, previewJobId) {
  const plan = normalizeBimApplyPlan(input);
  const expectedJobId = normalizeText(previewJobId, "");
  if (!expectedJobId || plan.sourceJobId !== expectedJobId) {
    return false;
  }
  if (hasReadableOperationsSource(plan.operationsSource)
      && plan.operationsSource.jobId !== expectedJobId) {
    return false;
  }
  return true;
}

export function isBimApplyCommand(commandTypeInput) {
  const commandType = normalizeBimJobCommandType(commandTypeInput);
  return commandType.endsWith("-apply") || commandType.includes(":apply");
}

export function getDirectBimApplyJobCreateIssue(input) {
  const source = normalizeObject(input);
  return isBimApplyCommand(source.commandType)
    ? BIM_DIRECT_APPLY_JOB_CREATE_MESSAGE
    : "";
}

export function resolveBimApplyJobBatchSize(applyPlanInput, fallbackPayloadInput) {
  const applyPlan = normalizeObject(applyPlanInput);
  if (hasIntegerLikeValue(applyPlan.batchSize)) {
    return clampInteger(applyPlan.batchSize, 25, 5000, 250);
  }
  const fallbackPayload = normalizeObject(fallbackPayloadInput);
  return clampInteger(fallbackPayload.batchSize, 25, 5000, 250);
}

function normalizeBimOperationsSource(input) {
  const source = normalizeObject(input);
  const operationCount = clampInteger(source.operationCount ?? source.count, 0, Number.MAX_SAFE_INTEGER, 0);
  return {
    kind: normalizeText(source.kind || source.type, ""),
    jobId: normalizeText(source.jobId || source.jobUid, ""),
    source: normalizeText(source.source, ""),
    endpoint: normalizeText(source.endpoint || source.url, ""),
    operationCount,
    pageSize: clampInteger(source.pageSize ?? source.limit, 1, 5000, 1000),
  };
}

function hasReadableOperationsSource(source) {
  return Boolean(
    source
    && source.kind
    && source.jobId
    && source.source
    && source.operationCount > 0
  );
}

function normalizeBimApplyOperations(input) {
  return Array.isArray(input)
    ? input.map(normalizeBimApplyOperation).filter(Boolean)
    : [];
}

function normalizeBimApplyOperation(input) {
  const source = normalizeObject(input);
  const operationType = normalizeText(source.operationType || source.type, "parameter-write");
  const elementId = clampInteger(source.elementId ?? source.revitElementId, 0, Number.MAX_SAFE_INTEGER, 0);
  const elementUniqueId = normalizeText(source.elementUniqueId || source.revitUniqueId || source.uniqueId, "");
  const parameterName = normalizeText(source.parameterName || source.parameter || source.targetParameter, "");
  const value = normalizeText(source.value ?? source.textValue ?? source.targetValue ?? "", "");
  if (!parameterName || (!elementId && !elementUniqueId)) {
    return null;
  }
  return {
    operationType,
    elementId,
    elementUniqueId,
    parameterName,
    value,
  };
}

export function canCreateBimApplyJobFromPreview(job) {
  if (!job || normalizeBimJobStatus(job.status, "queued") !== "completed") {
    return false;
  }
  if (normalizeBimJobTargetMode(job.targetMode) !== "active-revit") {
    return false;
  }
  const commandType = normalizeBimJobCommandType(job.commandType);
  if (commandType === "active-revit-apply" || commandType.endsWith("-apply")) {
    return false;
  }
  const result = normalizeObject(job.result);
  const hasPreviewCommand = commandType.includes("preview");
  const hasExplicitApplySignal = result.requiresApplyConfirmation === true
    || result.applyEligible === true;
  return hasPreviewCommand
    && hasExplicitApplySignal
    && hasBimClaimModelIdentity(job.modelIdentity)
    && hasExecutableBimApplyPlan(result.applyPlan)
    && isBimApplyPlanBoundToPreview(result.applyPlan, job.id);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return fallback;
}

function normalizeBimJobTargetMode(value) {
  const targetMode = String(value || "").trim();
  return BIM_JOB_TARGET_MODES.includes(targetMode) ? targetMode : "active-revit";
}

function normalizeBimJobCommandType(value) {
  const commandType = String(value || "").trim().toLowerCase();
  return commandType.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "bim-analysis";
}

function normalizeBimJobStatus(value, fallback) {
  const status = String(value || "").trim();
  return status || fallback;
}

function hasIntegerLikeValue(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric);
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}
