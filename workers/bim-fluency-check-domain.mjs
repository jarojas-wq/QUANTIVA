export function createBimFluencyCheckReport(input = {}) {
  const cloud = normalizeCheck("cloud-worker-load", input.cloud, {
    label: "Worker cloud 10k/50k/100k",
  });
  const realtime = normalizeCheck("web-realtime-load", input.realtime, {
    label: "UI realtime SSE",
  });
  const revit = normalizeCheck("revit-batch-plan", normalizeRevitBatchPlanProbe(input.revit), {
    label: "Revit batch planner C#",
  });
  const revitBackoff = normalizeCheck("revit-bridge-backoff", normalizeRevitBridgeBackoffProbe(input.revitBackoff), {
    label: "Revit bridge claim backoff C#",
  });
  const revitCancellationProbe = normalizeCheck(
    "revit-cancellation-probe",
    normalizeRevitCancellationProbe(input.revitCancellationProbe),
    {
      label: "Revit cancellation/network probe C#",
    },
  );
  const revitTransactionFailureProbe = normalizeCheck(
    "revit-transaction-failure",
    normalizeRevitTransactionFailureProbe(input.revitTransactionFailureProbe),
    {
      label: "Revit transaction failure probe C#",
    },
  );
  const checks = [cloud, realtime, revit, revitBackoff, revitCancellationProbe, revitTransactionFailureProbe];
  const failed = checks.filter((check) => !check.ok);

  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? "ready" : "failed",
    generatedAt: normalizeDate(input.generatedAt),
    summary: {
      checkCount: checks.length,
      failedCount: failed.length,
      totalSimulatedElements: normalizeInteger(cloud.details.totalElements)
        + normalizeInteger(revit.details.totalElements),
      realtimeEvents: normalizeInteger(realtime.details.eventCount),
      realtimeRenderReductionPercent: normalizeNumber(realtime.details.renderReductionPercent),
    },
    checks,
  };
}

export function normalizeRevitBatchPlanProbe(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cases = Array.isArray(source.cases)
    ? source.cases.map(normalizeRevitBatchPlanCase)
    : [];
  const failedCases = cases.filter((entry) => !entry.ok);

  return {
    ok: source.ok === true && failedCases.length === 0 && cases.length > 0,
    details: {
      batchSize: normalizeInteger(source.batchSize),
      totalElements: cases.reduce((sum, entry) => sum + entry.elementCount, 0),
      totalBatches: cases.reduce((sum, entry) => sum + entry.batchCount, 0),
      exitCode: normalizeInteger(source.exitCode),
      error: normalizeText(source.error, ""),
      cases,
    },
  };
}

export function normalizeRevitBridgeBackoffProbe(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cases = Array.isArray(source.cases)
    ? source.cases.map(normalizeRevitBridgeBackoffCase)
    : [];
  const failedCases = cases.filter((entry) => !entry.ok);
  const minSeconds = normalizeInteger(source.minSeconds);
  const maxSeconds = normalizeInteger(source.maxSeconds);

  return {
    ok: source.ok === true
      && failedCases.length === 0
      && cases.length > 0
      && minSeconds === 15
      && maxSeconds === 300,
    details: {
      minSeconds,
      maxSeconds,
      exitCode: normalizeInteger(source.exitCode),
      error: normalizeText(source.error, ""),
      cases,
    },
  };
}

export function normalizeRevitCancellationProbe(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cases = Array.isArray(source.cases)
    ? source.cases.map(normalizeRevitCancellationProbeCase)
    : [];
  const remoteStopCases = Array.isArray(source.remoteStopCases)
    ? source.remoteStopCases.map(normalizeRevitRemoteStopProbeCase)
    : [];
  const progressReportCases = Array.isArray(source.progressReportCases)
    ? source.progressReportCases.map(normalizeRevitProgressReportProbeCase)
    : [];
  const operationPageCases = Array.isArray(source.operationPageCases)
    ? source.operationPageCases.map(normalizeRevitOperationPageProbeCase)
    : [];
  const failedCases = cases.filter((entry) => !entry.ok);
  const failedRemoteStopCases = remoteStopCases.filter((entry) => !entry.ok);
  const failedProgressReportCases = progressReportCases.filter((entry) => !entry.ok);
  const failedOperationPageCases = operationPageCases.filter((entry) => !entry.ok);
  const applyAbortFailureThreshold = normalizeInteger(source.applyAbortFailureThreshold);

  return {
    ok: source.ok === true
      && failedCases.length === 0
      && failedRemoteStopCases.length === 0
      && failedProgressReportCases.length === 0
      && failedOperationPageCases.length === 0
      && cases.length > 0
      && remoteStopCases.length > 0
      && progressReportCases.length > 0
      && operationPageCases.length > 0
      && applyAbortFailureThreshold === 3,
    details: {
      applyAbortFailureThreshold,
      exitCode: normalizeInteger(source.exitCode),
      error: normalizeText(source.error, ""),
      cases,
      remoteStopCases,
      progressReportCases,
      operationPageCases,
    },
  };
}

export function normalizeRevitTransactionFailureProbe(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cases = Array.isArray(source.cases)
    ? source.cases.map(normalizeRevitTransactionFailureProbeCase)
    : [];
  const failedCases = cases.filter((entry) => !entry.ok);
  const stage = normalizeText(source.stage, "");
  const failureType = normalizeText(source.failureType, "");

  return {
    ok: source.ok === true
      && failedCases.length === 0
      && cases.length > 0
      && stage === "Error de transaccion"
      && failureType === "apply-transaction-failure",
    details: {
      stage,
      failureType,
      exitCode: normalizeInteger(source.exitCode),
      error: normalizeText(source.error, ""),
      cases,
    },
  };
}

function normalizeRevitBatchPlanCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const elementCount = normalizeInteger(source.elementCount);
  const batchSize = normalizeInteger(source.batchSize);
  const batchCount = normalizeInteger(source.batchCount);
  const observedBatches = normalizeInteger(source.observedBatches);
  const cancellationProbeCount = normalizeInteger(source.cancellationProbeCount);
  const yieldCount = normalizeInteger(source.yieldCount);
  const yieldDelayMs = normalizeInteger(source.yieldDelayMs);
  const ok = source.ok === true
    && elementCount > 0
    && batchSize > 0
    && batchCount > 0
    && observedBatches === batchCount
    && cancellationProbeCount === batchCount
    && yieldCount === batchCount
    && yieldDelayMs > 0;

  return {
    ok,
    elementCount,
    batchSize,
    batchCount,
    observedBatches,
    cancellationProbeCount,
    yieldCount,
    yieldDelayMs,
  };
}

function normalizeRevitTransactionFailureProbeCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const stage = normalizeText(source.stage, "");
  const failureType = normalizeText(source.failureType, "");
  const message = normalizeText(source.message, "");
  const batchNumber = normalizeInteger(source.batchNumber);
  const startIndex = normalizeInteger(source.startIndex);
  const endIndex = normalizeInteger(source.endIndex);
  const failedOperationCount = normalizeInteger(source.failedOperationCount);
  const committedApplyBatches = normalizeInteger(source.committedApplyBatches);
  const shouldStopJob = source.shouldStopJob === true;
  const ok = source.ok === true
    && stage === "Error de transaccion"
    && failureType === "apply-transaction-failure"
    && message.includes(`lote ${batchNumber}`)
    && batchNumber >= 1
    && endIndex >= startIndex
    && failedOperationCount === endIndex - startIndex
    && shouldStopJob;

  return {
    ok,
    stage,
    failureType,
    message,
    batchNumber,
    startIndex,
    endIndex,
    failedOperationCount,
    committedApplyBatches,
    shouldStopJob,
  };
}

function normalizeRevitCancellationProbeCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const jobKind = normalizeText(source.jobKind, "");
  const failureCount = normalizeInteger(source.failureCount);
  const shouldContinue = source.shouldContinue === true;
  const shouldWarn = source.shouldWarn === true;
  const shouldAbortBeforeNextBatch = source.shouldAbortBeforeNextBatch === true;
  const expectedAbort = jobKind === "apply" && failureCount >= 3;
  const ok = source.ok === true
    && (jobKind === "preview" || jobKind === "apply")
    && shouldAbortBeforeNextBatch === expectedAbort
    && shouldContinue === !expectedAbort
    && shouldWarn === (failureCount > 0);

  return {
    ok,
    jobKind,
    failureCount,
    shouldContinue,
    shouldWarn,
    shouldAbortBeforeNextBatch,
  };
}

function normalizeRevitRemoteStopProbeCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const status = normalizeText(source.status, "");
  const shouldStop = source.shouldStop === true;
  const expectedStop = ["cancelled", "failed", "completed"].includes(status);
  const stage = normalizeText(source.stage, "");
  const ok = source.ok === true
    && shouldStop === expectedStop
    && (!expectedStop || stage.length > 0);

  return {
    ok,
    status,
    shouldStop,
    stage,
  };
}

function normalizeRevitProgressReportProbeCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const requestedStatus = normalizeText(source.requestedStatus, "");
  const reportedStatus = normalizeText(source.reportedStatus, "");
  const shouldStop = source.shouldStop === true;
  const terminalStatuses = ["cancelled", "failed", "completed"];
  const expectedStop = terminalStatuses.includes(reportedStatus)
    && requestedStatus !== reportedStatus;
  const ok = source.ok === true
    && shouldStop === expectedStop
    && requestedStatus.length > 0
    && reportedStatus.length > 0;

  return {
    ok,
    requestedStatus,
    reportedStatus,
    shouldStop,
  };
}

function normalizeRevitOperationPageProbeCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const operationCount = normalizeInteger(source.operationCount);
  const pageSize = normalizeInteger(source.pageSize);
  const pageCount = normalizeInteger(source.pageCount);
  const lastOffset = normalizeInteger(source.lastOffset);
  const expectedPageCount = operationCount === 0 ? 0 : Math.ceil(operationCount / Math.max(1, pageSize));
  const expectedLastOffset = pageCount === 0 ? 0 : (pageCount - 1) * pageSize;
  const ok = source.ok === true
    && pageSize === 1000
    && pageCount === expectedPageCount
    && lastOffset === expectedLastOffset;

  return {
    ok,
    operationCount,
    pageSize,
    pageCount,
    lastOffset,
  };
}

function normalizeRevitBridgeBackoffCase(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const failureCount = normalizeInteger(source.failureCount);
  const backoffSeconds = normalizeInteger(source.backoffSeconds);
  const expectedBackoffSeconds = normalizeInteger(source.expectedBackoffSeconds);
  const ok = source.ok === true
    && backoffSeconds === expectedBackoffSeconds
    && expectedBackoffSeconds <= 300;

  return {
    ok,
    failureCount,
    backoffSeconds,
    expectedBackoffSeconds,
  };
}

function normalizeCheck(id, input = {}, defaults = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    id,
    label: defaults.label || id,
    ok: source.ok === true,
    details: normalizeObject(source.details || source),
  };
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeDate(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeInteger(value) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
