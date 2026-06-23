export const DEFAULT_CLOUD_BATCH_SIZE = 250;
export const DEFAULT_CLOUD_ELEMENT_COUNT = 10000;
export const MIN_CLOUD_BATCH_SIZE = 25;
export const MAX_CLOUD_BATCH_SIZE = 5000;
export const MAX_SIMULATED_ELEMENT_COUNT = 1000000;
export const DEFAULT_CLOUD_WORKER_POLL_MS = 5000;
export const DEFAULT_CLOUD_WORKER_ERROR_BACKOFF_MAX_MS = 300000;
export const CLOUD_WORKER_FLUENCY_WARNING_MS = 750;
export const CLOUD_WORKER_FLUENCY_CRITICAL_MS = 2000;

export function createCloudWorkerPlan(job, options = {}) {
  const payload = toObject(job?.payload);
  const modelIdentity = toObject(job?.modelIdentity);
  const elementCount = clampInteger(
    payload.simulatedElementCount
      ?? payload.elementCount
      ?? modelIdentity.elementCount
      ?? options.defaultElementCount,
    0,
    MAX_SIMULATED_ELEMENT_COUNT,
    DEFAULT_CLOUD_ELEMENT_COUNT,
  );
  const batchSize = clampInteger(
    payload.batchSize ?? options.defaultBatchSize,
    MIN_CLOUD_BATCH_SIZE,
    MAX_CLOUD_BATCH_SIZE,
    DEFAULT_CLOUD_BATCH_SIZE,
  );
  const batchCount = elementCount === 0 ? 0 : Math.ceil(elementCount / batchSize);

  return {
    jobId: String(job?.id || ""),
    commandType: String(job?.commandType || "cloud-model-analysis"),
    elementCount,
    batchSize,
    batchCount,
    estimatedOperations: elementCount,
    modelIdentity,
  };
}

export function createCloudProviderCheckJob(workerConfig = {}) {
  const payload = {
    simulatedElementCount: clampInteger(
      workerConfig.defaultElementCount,
      0,
      MAX_SIMULATED_ELEMENT_COUNT,
      DEFAULT_CLOUD_ELEMENT_COUNT,
    ),
    batchSize: clampInteger(
      workerConfig.defaultBatchSize,
      MIN_CLOUD_BATCH_SIZE,
      MAX_CLOUD_BATCH_SIZE,
      DEFAULT_CLOUD_BATCH_SIZE,
    ),
    apsTaskParameters: {
      checkOnly: true,
      source: "itemicostos-worker-check",
    },
  };
  const apsInputUrl = normalizeOptionalUrl(workerConfig.apsCheckInputUrl);
  const apsOutputUrl = normalizeOptionalUrl(workerConfig.apsCheckOutputUrl);
  if (apsInputUrl) {
    payload.apsInputUrl = apsInputUrl;
  }
  if (apsOutputUrl) {
    payload.apsOutputUrl = apsOutputUrl;
  }

  return {
    id: "provider-check",
    commandType: String(workerConfig.commandType || "cloud-model-analysis"),
    payload,
    modelIdentity: {
      modelGuid: "provider-check-model",
      documentVersion: "provider-check",
    },
  };
}

export function createCloudWorkerProgress(plan, batchIndex, options = {}) {
  const normalizedBatch = clampInteger(batchIndex, 0, plan.batchCount, 0);
  const processedElements = Math.min(plan.elementCount, normalizedBatch * plan.batchSize);
  const ratio = plan.elementCount === 0 ? 1 : processedElements / plan.elementCount;
  const percent = Math.max(5, Math.min(95, 5 + ratio * 90));
  const result = createCloudWorkerProgressResult(plan, {
    providerId: options.providerId,
    telemetry: options.telemetry,
    processedBatches: normalizedBatch,
    processedElements,
    yieldDelayMs: options.yieldDelayMs,
  });

  return {
    processedElements,
    percent,
    stage: options.stage || (plan.batchCount === 0 ? "Sin elementos para procesar" : "Procesando modelo cloud"),
    level: result.fluencyStatus === "ok" ? "info" : "warn",
    message: plan.batchCount === 0
      ? "No se encontraron elementos simulados para el modelo cloud."
      : `Lote cloud ${normalizedBatch}/${plan.batchCount}. ${processedElements}/${plan.elementCount} elementos.`,
    result,
  };
}

export function createCloudWorkerResult(plan, timings = {}) {
  const artifacts = Array.isArray(timings.artifacts) ? timings.artifacts : [];
  const providerId = normalizeProviderId(timings.providerId);
  const providerStatus = String(timings.providerStatus || "simulated").trim() || "simulated";
  return {
    ...createCloudWorkerProgressResult(plan, {
      providerId,
      telemetry: timings.telemetry,
      processedBatches: timings.processedBatches ?? plan.batchCount,
      processedElements: timings.processedElements ?? plan.elementCount,
      yieldDelayMs: timings.yieldDelayMs,
    }),
    workerMode: providerId,
    commandType: plan.commandType,
    elementCount: plan.elementCount,
    processedElements: plan.elementCount,
    batchSize: plan.batchSize,
    batchCount: plan.batchCount,
    durationMs: Math.max(0, Number(timings.durationMs || 0)),
    modelIdentity: plan.modelIdentity,
    artifacts,
    aps: {
      provider: "Autodesk Platform Services Design Automation",
      status: providerStatus,
    },
  };
}

export function createCloudWorkerArtifacts(plan, timings = {}) {
  const generatedAt = new Date(timings.generatedAt || Date.now()).toISOString();
  const providerId = normalizeProviderId(timings.providerId);
  const providerStatus = String(timings.providerStatus || "simulated").trim() || "simulated";
  const summary = {
    ...createCloudWorkerProgressResult(plan, {
      providerId,
      telemetry: timings.telemetry,
      processedBatches: timings.processedBatches ?? plan.batchCount,
      processedElements: timings.processedElements ?? plan.elementCount,
      yieldDelayMs: timings.yieldDelayMs,
    }),
    jobId: plan.jobId,
    commandType: plan.commandType,
    generatedAt,
    elementCount: plan.elementCount,
    processedElements: plan.elementCount,
    batchSize: plan.batchSize,
    batchCount: plan.batchCount,
    durationMs: Math.max(0, Number(timings.durationMs || 0)),
    modelIdentity: plan.modelIdentity,
    aps: {
      provider: "Autodesk Platform Services Design Automation",
      status: providerStatus,
    },
  };

  return [
    {
      kind: "manifest",
      name: "bim-cloud-manifest.json",
      contentType: "application/json",
      json: {
        schemaVersion: 1,
        storageMode: "local-cloud-adapter",
        generatedAt,
        jobId: plan.jobId,
        commandType: plan.commandType,
        artifacts: [
          { name: "bim-cloud-summary.json", kind: "report" },
        ],
      },
      metadata: {
        role: "manifest",
        workerMode: providerId,
      },
    },
    {
      kind: "report",
      name: "bim-cloud-summary.json",
      contentType: "application/json",
      json: summary,
      metadata: {
        role: "summary",
        workerMode: providerId,
      },
    },
  ];
}

export function createCloudWorkerBatchTelemetry(input = {}) {
  const source = toObject(input);
  const recordedBatchCount = clampInteger(source.recordedBatchCount, 0, MAX_SIMULATED_ELEMENT_COUNT, 0);
  const totalBatchDurationMs = clampInteger(source.totalBatchDurationMs, 0, Number.MAX_SAFE_INTEGER, 0);
  const averageBatchDurationMs = recordedBatchCount > 0
    ? clampInteger(
      source.averageBatchDurationMs,
      0,
      Number.MAX_SAFE_INTEGER,
      Math.round(totalBatchDurationMs / recordedBatchCount),
    )
    : 0;
  const maxBatchDurationMs = clampInteger(source.maxBatchDurationMs, 0, Number.MAX_SAFE_INTEGER, 0);
  const lastBatchDurationMs = clampInteger(source.lastBatchDurationMs, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    recordedBatchCount,
    lastBatchDurationMs,
    averageBatchDurationMs,
    maxBatchDurationMs,
    totalBatchDurationMs,
    fluencyStatus: resolveCloudWorkerFluencyStatus(averageBatchDurationMs, maxBatchDurationMs),
  };
}

export function recordCloudWorkerBatchTelemetry(input = {}, batchDurationMs = 0) {
  const current = createCloudWorkerBatchTelemetry(input);
  const lastBatchDurationMs = clampInteger(batchDurationMs, 0, Number.MAX_SAFE_INTEGER, 0);
  const recordedBatchCount = current.recordedBatchCount + 1;
  const totalBatchDurationMs = current.totalBatchDurationMs + lastBatchDurationMs;
  const averageBatchDurationMs = Math.round(totalBatchDurationMs / recordedBatchCount);
  const maxBatchDurationMs = Math.max(current.maxBatchDurationMs, lastBatchDurationMs);

  return {
    recordedBatchCount,
    lastBatchDurationMs,
    averageBatchDurationMs,
    maxBatchDurationMs,
    totalBatchDurationMs,
    fluencyStatus: resolveCloudWorkerFluencyStatus(averageBatchDurationMs, maxBatchDurationMs),
  };
}

export function resolveCloudWorkerFluencyStatus(averageBatchDurationMs = 0, maxBatchDurationMs = 0) {
  const average = Math.max(0, Number(averageBatchDurationMs) || 0);
  const max = Math.max(0, Number(maxBatchDurationMs) || 0);
  if (average >= CLOUD_WORKER_FLUENCY_CRITICAL_MS || max >= CLOUD_WORKER_FLUENCY_CRITICAL_MS) {
    return "critical";
  }
  if (average >= CLOUD_WORKER_FLUENCY_WARNING_MS || max >= CLOUD_WORKER_FLUENCY_WARNING_MS) {
    return "warning";
  }
  return "ok";
}

export function createCloudWorkerProgressResult(plan, options = {}) {
  const providerId = normalizeProviderId(options.providerId);
  const telemetry = createCloudWorkerBatchTelemetry(options.telemetry);
  const processedBatches = clampInteger(
    options.processedBatches ?? telemetry.recordedBatchCount,
    0,
    plan.batchCount,
    telemetry.recordedBatchCount,
  );
  const processedElements = clampInteger(
    options.processedElements ?? processedBatches * plan.batchSize,
    0,
    plan.elementCount,
    Math.min(plan.elementCount, processedBatches * plan.batchSize),
  );

  return {
    workerMode: providerId,
    commandType: plan.commandType,
    elementCount: plan.elementCount,
    processedElements,
    batchSize: plan.batchSize,
    batchCount: plan.batchCount,
    processedBatches,
    plannedBatches: plan.batchCount,
    plannedCancellationChecks: plan.batchCount,
    plannedYieldCount: plan.batchCount,
    yieldDelayMs: clampInteger(options.yieldDelayMs, 0, 600000, 0),
    recordedBatchCount: telemetry.recordedBatchCount,
    lastBatchDurationMs: telemetry.lastBatchDurationMs,
    averageBatchDurationMs: telemetry.averageBatchDurationMs,
    maxBatchDurationMs: telemetry.maxBatchDurationMs,
    totalBatchDurationMs: telemetry.totalBatchDurationMs,
    fluencyStatus: telemetry.fluencyStatus,
  };
}

export function isTerminalBimJobStatus(status) {
  return ["completed", "failed", "cancelled"].includes(normalizeBimJobStatusForRemoteStop(status));
}

export function createCloudWorkerRemoteStopDecision(jobOrStatus) {
  const status = typeof jobOrStatus === "object" && jobOrStatus !== null
    ? normalizeBimJobStatusForRemoteStop(jobOrStatus.status)
    : normalizeBimJobStatusForRemoteStop(jobOrStatus);
  const shouldStop = isTerminalBimJobStatus(status);
  return {
    shouldStop,
    terminal: shouldStop,
    status,
    cancelled: status === "cancelled",
    shouldCancelRemoteWorkItem: status === "cancelled",
  };
}

export function createCloudWorkerFailureProgress(error, options = {}) {
  const message = error instanceof Error ? error.message : String(error || "Error desconocido");
  const result = toObject(options.result);
  return {
    bridgeId: String(options.workerId || "cloud-worker"),
    status: "failed",
    stage: String(options.stage || "Worker cloud fallido"),
    percent: 100,
    level: "error",
    message: `Worker cloud fallo: ${message}`,
    error: message,
    ...(Object.keys(result).length > 0 ? { result } : {}),
  };
}

export function createCloudWorkerCheckpointProgress(options = {}) {
  return {
    bridgeId: String(options.workerId || "cloud-worker"),
    status: "running",
    stage: String(options.stage || "Finalizando worker cloud"),
    percent: clampInteger(options.percent, 0, 99, 96),
    level: "info",
    message: String(options.message || "Validando estado del job antes de continuar."),
  };
}

export function resolveCloudWorkerPollDelayMs(options = {}) {
  const pollMs = clampInteger(options.pollMs, 500, 60000, DEFAULT_CLOUD_WORKER_POLL_MS);
  const maxBackoffMs = Math.max(
    pollMs,
    clampInteger(
      options.maxBackoffMs,
      pollMs,
      15 * 60 * 1000,
      DEFAULT_CLOUD_WORKER_ERROR_BACKOFF_MAX_MS,
    ),
  );
  const consecutiveFailures = clampInteger(options.consecutiveFailures, 0, 20, 0);
  if (consecutiveFailures <= 0) {
    return pollMs;
  }

  const exponent = Math.min(consecutiveFailures - 1, 8);
  return Math.min(maxBackoffMs, pollMs * (2 ** exponent));
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function normalizeProviderId(value) {
  const providerId = String(value || "").trim().toLowerCase();
  return providerId || "simulated-aps";
}

function normalizeBimJobStatusForRemoteStop(status) {
  return String(status || "").trim().toLowerCase();
}

function normalizeOptionalUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  try {
    return new URL(text).toString();
  } catch {
    return "";
  }
}
