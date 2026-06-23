const DEFAULT_OPERATION_PAGE_SIZE = 1000;
const BIM_JOB_OPERATION_SOURCES = ["payload", "result-apply-plan"];

export function detachBimJobOperationsForStorage(payloadInput, options = {}) {
  const source = normalizeBimJobOperationSource(options.source, "payload");
  if (payloadInput === null) {
    return {
      payloadObject: null,
      operations: [],
      source,
    };
  }

  const jobUid = normalizeIdentifier(options.jobUid, "");
  const pageSize = clampInteger(options.pageSize, 1, 5000, DEFAULT_OPERATION_PAGE_SIZE);
  const payloadObject = normalizeObject(payloadInput);
  const result = { ...payloadObject };
  const operations = [];

  if (!options.applyPlanOnly) {
    const topLevelOperations = extractInlineBimOperations(result);
    if (topLevelOperations.length > 0) {
      operations.push(...topLevelOperations);
      removeInlineBimOperationKeys(result);
      result.operationCount = clampInteger(
        result.operationCount ?? topLevelOperations.length,
        0,
        Number.MAX_SAFE_INTEGER,
        topLevelOperations.length,
      );
      result.operationsSource = buildBimJobOperationsSource({
        jobUid,
        source,
        operationCount: topLevelOperations.length,
        batchSize: result.batchSize,
        pageSize,
      });
    }
  }

  const applyPlan = normalizeObjectOrNull(result.applyPlan);
  if (applyPlan) {
    const applyPlanOperations = extractInlineBimOperations(applyPlan);
    if (applyPlanOperations.length > 0) {
      operations.length = 0;
      operations.push(...applyPlanOperations);
      const nextApplyPlan = { ...applyPlan };
      removeInlineBimOperationKeys(nextApplyPlan);
      nextApplyPlan.operationCount = clampInteger(
        nextApplyPlan.operationCount ?? applyPlanOperations.length,
        0,
        Number.MAX_SAFE_INTEGER,
        applyPlanOperations.length,
      );
      nextApplyPlan.operationsSource = buildBimJobOperationsSource({
        jobUid,
        source,
        operationCount: applyPlanOperations.length,
        batchSize: nextApplyPlan.batchSize,
        pageSize,
      });
      result.applyPlan = nextApplyPlan;
    }
  }

  return {
    payloadObject: result,
    operations,
    source,
  };
}

export function normalizeBimJobOperationsForStorage(input) {
  return Array.isArray(input)
    ? input.map(normalizeBimJobOperationForStorage).filter(Boolean)
    : [];
}

export function normalizeBimJobOperationsUpload(input) {
  const source = normalizeObject(input);
  const mode = normalizeText(source.mode, "replace").toLowerCase() === "append"
    ? "append"
    : "replace";
  return {
    source: normalizeBimJobOperationSource(source.source, "payload"),
    mode,
    offset: mode === "append"
      ? clampInteger(source.offset, 0, Number.MAX_SAFE_INTEGER, 0)
      : 0,
    operations: normalizeBimJobOperationsForStorage(source.operations),
  };
}

export function planBimJobOperationUploadPages(operationsInput, options = {}) {
  const operations = normalizeBimJobOperationsForStorage(operationsInput);
  const pageSize = clampInteger(options.pageSize, 1, 5000, DEFAULT_OPERATION_PAGE_SIZE);
  const source = normalizeBimJobOperationSource(options.source, "result-apply-plan");
  const firstMode = normalizeText(options.firstMode, "replace").toLowerCase() === "append"
    ? "append"
    : "replace";
  const startOffset = firstMode === "append"
    ? clampInteger(options.startOffset, 0, Number.MAX_SAFE_INTEGER, 0)
    : 0;
  const pages = [];
  for (let offset = 0; offset < operations.length; offset += pageSize) {
    pages.push({
      source,
      mode: pages.length === 0 ? firstMode : "append",
      offset: startOffset + offset,
      pageSize,
      pageIndex: pages.length,
      operations: operations.slice(offset, offset + pageSize),
    });
  }
  return {
    source,
    pageSize,
    operationCount: operations.length,
    pageCount: pages.length,
    pages,
  };
}

export function normalizeBimJobOperationSource(value, fallback = "payload") {
  const source = normalizeText(value, fallback).toLowerCase();
  return BIM_JOB_OPERATION_SOURCES.includes(source) ? source : fallback;
}

function extractInlineBimOperations(source) {
  for (const key of ["operations", "applyOperations", "parameterOperations", "parameterWrites"]) {
    const operations = normalizeBimJobOperationsForStorage(source?.[key]);
    if (operations.length > 0) {
      return operations;
    }
  }
  return [];
}

function removeInlineBimOperationKeys(target) {
  delete target.operations;
  delete target.applyOperations;
  delete target.parameterOperations;
  delete target.parameterWrites;
}

function buildBimJobOperationsSource({ jobUid, source, operationCount, batchSize, pageSize }) {
  return {
    kind: "mysql",
    jobId: jobUid,
    source,
    endpoint: `/api/bim/bridge/jobs/${encodeURIComponent(jobUid)}/operations`,
    operationCount,
    pageSize,
    batchSize: clampInteger(batchSize, 1, 5000, 250),
  };
}

function normalizeBimJobOperationForStorage(input) {
  const source = normalizeObjectOrNull(input);
  if (!source) {
    return null;
  }
  const operationType = normalizeText(source.operationType || source.type, "parameter-write");
  if (operationType !== "parameter-write" && operationType !== "write-parameter") {
    return null;
  }
  const elementId = normalizeNullableInteger(source.elementId ?? source.revitElementId) || 0;
  const elementUniqueId = normalizeIdentifier(source.elementUniqueId || source.revitUniqueId || source.uniqueId, "");
  const parameterName = normalizeText(source.parameterName || source.parameter || source.targetParameter, "");
  if (!parameterName || (!elementId && !elementUniqueId)) {
    return null;
  }
  return {
    operationType: "parameter-write",
    elementId,
    elementUniqueId,
    parameterName,
    value: normalizeText(source.value ?? source.textValue ?? source.targetValue ?? "", ""),
  };
}

function normalizeObject(value) {
  return normalizeObjectOrNull(value) || {};
}

function normalizeObjectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
