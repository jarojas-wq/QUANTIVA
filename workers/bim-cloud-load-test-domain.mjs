import {
  createCloudWorkerBatchTelemetry,
  createCloudWorkerArtifacts,
  createCloudWorkerPlan,
  createCloudWorkerProgress,
  createCloudWorkerResult,
  DEFAULT_CLOUD_BATCH_SIZE,
  recordCloudWorkerBatchTelemetry,
} from "./bim-cloud-worker-domain.mjs";

export const DEFAULT_BIM_LOAD_TEST_SIZES = [10000, 50000, 100000];

export function runBimCloudLoadTest(options = {}) {
  const sizes = normalizeLoadTestSizes(options.sizes);
  const batchSize = clampInteger(options.batchSize, 25, 5000, DEFAULT_CLOUD_BATCH_SIZE);
  const startedAt = nowMs(options);
  const cases = sizes.map((elementCount) => runBimCloudLoadTestCase(elementCount, {
    batchSize,
    now: options.now,
  }));
  const durationMs = Math.max(0, nowMs(options) - startedAt);
  const failedCases = cases.filter((entry) => !entry.ok);

  return {
    ok: failedCases.length === 0,
    providerId: "simulated-aps",
    batchSize,
    totalElements: cases.reduce((sum, entry) => sum + entry.elementCount, 0),
    totalBatches: cases.reduce((sum, entry) => sum + entry.batchCount, 0),
    durationMs,
    cases,
  };
}

export function runBimCloudLoadTestCase(elementCount, options = {}) {
  const startedAt = nowMs(options);
  const plan = createCloudWorkerPlan({
    id: `load-test-${elementCount}`,
    commandType: "cloud-model-analysis",
    payload: {
      simulatedElementCount: elementCount,
      batchSize: options.batchSize,
    },
    modelIdentity: {
      modelGuid: "load-test-model",
      documentVersion: `load-test-${elementCount}`,
      elementCount,
    },
  });

  let previousPercent = 0;
  let monotonic = true;
  let finalProgress = createCloudWorkerProgress(plan, 0);
  let telemetry = createCloudWorkerBatchTelemetry();
  for (let batchIndex = 1; batchIndex <= plan.batchCount; batchIndex += 1) {
    const batchStartedAt = nowMs(options);
    telemetry = recordCloudWorkerBatchTelemetry(telemetry, Math.max(0, nowMs(options) - batchStartedAt));
    const progress = createCloudWorkerProgress(plan, batchIndex, {
      telemetry,
      yieldDelayMs: 0,
    });
    if (progress.percent < previousPercent) {
      monotonic = false;
    }
    previousPercent = progress.percent;
    finalProgress = progress;
  }

  const durationMs = Math.max(0, nowMs(options) - startedAt);
  const artifacts = createCloudWorkerArtifacts(plan, {
    durationMs,
    telemetry,
    yieldDelayMs: 0,
    providerId: "simulated-aps",
    providerStatus: "load-test",
  });
  const result = createCloudWorkerResult(plan, {
    durationMs,
    artifacts,
    telemetry,
    yieldDelayMs: 0,
    providerId: "simulated-aps",
    providerStatus: "load-test",
  });
  const processedElements = plan.batchCount === 0 ? 0 : finalProgress.processedElements;
  const ok = monotonic
    && processedElements === plan.elementCount
    && result.batchCount === plan.batchCount
    && artifacts.length >= 2;

  return {
    ok,
    elementCount: plan.elementCount,
    batchSize: plan.batchSize,
    batchCount: plan.batchCount,
    processedElements,
    finalPercent: finalProgress.percent,
    monotonicProgress: monotonic,
    artifactCount: artifacts.length,
    fluencyStatus: result.fluencyStatus,
    recordedBatchCount: result.recordedBatchCount,
    durationMs,
  };
}

export function normalizeLoadTestSizes(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  const sizes = entries
    .map((entry) => clampInteger(entry, 0, 1000000, 0))
    .filter((entry) => entry > 0);
  return sizes.length > 0 ? Array.from(new Set(sizes)) : [...DEFAULT_BIM_LOAD_TEST_SIZES];
}

function nowMs(options) {
  return typeof options.now === "function" ? options.now() : Date.now();
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}
