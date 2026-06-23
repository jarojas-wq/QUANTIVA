import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createCloudWorkerBatchTelemetry,
  createCloudWorkerCheckpointProgress,
  createCloudWorkerFailureProgress,
  createCloudProviderCheckJob,
  createCloudWorkerPlan,
  isTerminalBimJobStatus,
  recordCloudWorkerBatchTelemetry,
  resolveCloudWorkerPollDelayMs,
} from "./bim-cloud-worker-domain.mjs";
import { createBimCloudProvider } from "./bim-cloud-worker-providers.mjs";

loadLocalEnv(path.resolve(process.cwd(), ".env"));

const once = process.argv.includes("--once");
const checkProvider = process.argv.includes("--check-provider");
const checkProviderLive = process.argv.includes("--check-provider-live");
const config = {
  baseUrl: normalizeBaseUrl(process.env.BIM_WORKER_BASE_URL || process.env.WEB_BASE_URL || "http://127.0.0.1:5500/"),
  apiKey: String(process.env.BIM_WORKER_API_KEY || process.env.REVIT_INGEST_API_KEY || "").trim(),
  workerId: String(process.env.BIM_WORKER_ID || `cloud-worker-${os.hostname()}`).trim(),
  providerId: String(process.env.BIM_WORKER_PROVIDER || "simulated-aps").trim(),
  commandType: normalizeCommandType(process.env.BIM_WORKER_COMMAND_TYPE || "cloud-model-analysis"),
  pollMs: readInteger(process.env.BIM_WORKER_POLL_MS, 5000, 500, 60000),
  errorBackoffMaxMs: readInteger(process.env.BIM_WORKER_ERROR_BACKOFF_MAX_MS, 300000, 500, 15 * 60 * 1000),
  batchDelayMs: readInteger(process.env.BIM_WORKER_BATCH_DELAY_MS, 10, 0, 5000),
  defaultElementCount: readInteger(process.env.BIM_WORKER_SIMULATED_ELEMENTS, 10000, 0, 1000000),
  claimLimit: readInteger(process.env.BIM_WORKER_CLAIM_LIMIT, 1, 1, 5),
  apsClientId: String(process.env.BIM_APS_CLIENT_ID || "").trim(),
  apsClientSecret: String(process.env.BIM_APS_CLIENT_SECRET || "").trim(),
  apsActivityId: String(process.env.BIM_APS_ACTIVITY_ID || "").trim(),
  apsBaseUrl: String(process.env.BIM_APS_BASE_URL || "").trim(),
  apsTokenUrl: String(process.env.BIM_APS_TOKEN_URL || "").trim(),
  apsScopes: String(process.env.BIM_APS_SCOPES || "").trim(),
  apsPollMs: readInteger(process.env.BIM_APS_POLL_MS, 10000, 2000, 600000),
  apsTimeoutMs: readInteger(process.env.BIM_APS_TIMEOUT_MS, 3600000, 2000, 24 * 60 * 60 * 1000),
  apsCheckInputUrl: String(process.env.BIM_APS_CHECK_INPUT_URL || "").trim(),
  apsCheckOutputUrl: String(process.env.BIM_APS_CHECK_OUTPUT_URL || "").trim(),
};
const cloudProvider = createBimCloudProvider(config);

if (checkProvider || checkProviderLive) {
  const sampleJob = createCloudProviderCheckJob({
    ...config,
    defaultBatchSize: 250,
  });
  const samplePlan = createCloudWorkerPlan(sampleJob, {
    defaultElementCount: config.defaultElementCount,
  });
  const readiness = checkProviderLive && typeof cloudProvider.createLiveReadinessReport === "function"
    ? await cloudProvider.createLiveReadinessReport(samplePlan, sampleJob)
    : (
      cloudProvider.createReadinessReport
        ? cloudProvider.createReadinessReport(samplePlan, sampleJob)
        : { ok: true, providerId: cloudProvider.id, validationErrors: [] }
    );
  console.log(JSON.stringify(readiness, null, 2));
  process.exit(isProviderCheckReady(readiness, config) ? 0 : 1);
}

if (!config.apiKey) {
  console.error("BIM worker requiere BIM_WORKER_API_KEY o REVIT_INGEST_API_KEY para reclamar jobs cloud-model.");
  process.exit(1);
}
const providerConfigErrors = cloudProvider.validate();
if (providerConfigErrors.length > 0) {
  console.error(`Proveedor ${cloudProvider.id} incompleto. Faltan: ${providerConfigErrors.join(", ")}.`);
  process.exit(1);
}

console.log(`BIM cloud worker listo: ${config.workerId}`);
console.log(`Backend: ${config.baseUrl}`);
console.log(`Proveedor BIM cloud: ${cloudProvider.label}`);
console.log(once ? "Modo: una pasada" : `Modo: monitor cada ${config.pollMs}ms`);

let consecutiveLoopFailures = 0;
do {
  try {
    const jobs = await claimCloudJobs();
    if (jobs.length === 0) {
      if (once) {
        console.log("No hay jobs cloud-model pendientes.");
      }
    } else {
      for (const job of jobs) {
        await processCloudJobSafely(job);
      }
    }
    consecutiveLoopFailures = 0;
  } catch (error) {
    consecutiveLoopFailures += 1;
    console.error(`BIM cloud worker fallo: ${error.message}`);
    if (once) {
      process.exitCode = 1;
      break;
    }
  }

  if (!once) {
    const delayMs = resolveCloudWorkerPollDelayMs({
      pollMs: config.pollMs,
      maxBackoffMs: config.errorBackoffMaxMs,
      consecutiveFailures: consecutiveLoopFailures,
    });
    if (consecutiveLoopFailures > 0) {
      console.error(`Siguiente intento BIM cloud en ${delayMs}ms por ${consecutiveLoopFailures} fallo(s) consecutivo(s).`);
    }
    await sleep(delayMs);
  }
} while (!once);

async function claimCloudJobs() {
  const query = new URLSearchParams({
    targetMode: "cloud-model",
    workerId: config.workerId,
    commandType: config.commandType,
    limit: String(config.claimLimit),
  });
  const payload = await requestJson(`api/bim/bridge/commands?${query.toString()}`);
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

async function processCloudJobSafely(job) {
  try {
    await processCloudJob(job);
  } catch (error) {
    console.error(`Job cloud ${job.id} fallo: ${error.message}`);
    const failureResult = await uploadFailureArtifacts(job, error);
    try {
      await reportProgress(job.id, createCloudWorkerFailureProgress(error, {
        workerId: config.workerId,
        result: failureResult,
      }));
    } catch (reportError) {
      console.error(`No se pudo reportar fallo del job ${job.id}: ${reportError.message}`);
    }
    throw error;
  }
}

async function uploadFailureArtifacts(job, error) {
  const artifacts = Array.isArray(error?.artifacts) ? error.artifacts : [];
  const resultOptions = error?.resultOptions && typeof error.resultOptions === "object" ? error.resultOptions : {};
  if (artifacts.length === 0 && Object.keys(resultOptions).length === 0) {
    return undefined;
  }

  if (artifacts.length === 0) {
    return resultOptions;
  }

  try {
    const uploadedArtifacts = await uploadBimArtifacts(job.id, artifacts);
    if (uploadedArtifacts === null) {
      return {
        ...resultOptions,
        artifactCount: 0,
        artifactUploadStatus: "job-terminal-before-upload",
      };
    }
    return {
      ...resultOptions,
      artifacts: uploadedArtifacts,
      artifactCount: uploadedArtifacts.length,
      artifactUploadStatus: "uploaded-before-failure",
    };
  } catch (artifactError) {
    const message = artifactError instanceof Error ? artifactError.message : String(artifactError || "Error desconocido");
    console.error(`No se pudieron registrar artefactos del fallo del job ${job.id}: ${message}`);
    return {
      ...resultOptions,
      artifactCount: 0,
      artifactUploadStatus: "failed",
      artifactUploadError: message,
    };
  }
}

async function processCloudJob(job) {
  const startedAt = Date.now();
  const plan = createCloudWorkerPlan(job, {
    defaultElementCount: config.defaultElementCount,
  });
  let batchTelemetry = createCloudWorkerBatchTelemetry();
  console.log(`Procesando job cloud ${job.id}: ${plan.elementCount} elementos, ${plan.batchCount} lotes.`);

  let latestJob = await reportProgress(job.id, {
    bridgeId: config.workerId,
    ...cloudProvider.createStartProgress(plan),
  });
  if (isTerminalBimJobStatus(latestJob?.status)) {
    console.log(`Job ${job.id} termino antes de procesar: ${latestJob.status}`);
    return;
  }

  if (typeof cloudProvider.execute === "function") {
    const execution = await cloudProvider.execute(plan, job, {
      reportProgress,
    });
    if (execution?.terminal || execution?.cancelled) {
      const terminalStatus = execution.status || (execution.cancelled ? "cancelled" : "terminal");
      console.log(`Job ${job.id} termino en Itemicostos durante ejecucion cloud: ${terminalStatus}.`);
      if (execution.remoteCancellation) {
        console.log(execution.remoteCancellation.ok
          ? `APS work item ${execution.remoteCancellation.workItemId} cancelado remotamente.`
          : `No se pudo cancelar remotamente APS work item ${execution.remoteCancellation.workItemId}: ${execution.remoteCancellation.error}`);
      }
      return;
    }
    latestJob = await reportProgress(job.id, createCloudWorkerCheckpointProgress({
      workerId: config.workerId,
      stage: "Preparando artefactos BIM",
      percent: 96,
      message: "Validando cancelacion antes de subir artefactos BIM.",
    }));
    if (isTerminalBimJobStatus(latestJob?.status)) {
      console.log(`Job ${job.id} termino antes de subir artefactos: ${latestJob.status}`);
      return;
    }
    const uploadedArtifacts = await uploadBimArtifacts(job.id, execution.artifacts || []);
    if (uploadedArtifacts === null) {
      console.log(`Job ${job.id} termino antes de registrar artefactos.`);
      return;
    }
    const result = cloudProvider.createResult(plan, {
      durationMs: execution.durationMs,
      artifacts: uploadedArtifacts,
      processedBatches: plan.batchCount,
      processedElements: plan.elementCount,
      ...execution.resultOptions,
    });
    latestJob = await reportProgress(job.id, {
      bridgeId: config.workerId,
      status: "completed",
      stage: "Preview cloud listo",
      percent: 100,
      message: execution.message || `Worker cloud completo ${plan.elementCount} elementos.`,
      result,
    });
    console.log(`Job cloud ${job.id} finalizado con estado ${latestJob?.status || "desconocido"}.`);
    return;
  }

  for (let batchIndex = 1; batchIndex <= plan.batchCount; batchIndex += 1) {
    const batchStartedAt = Date.now();
    if (config.batchDelayMs > 0) {
      await sleep(config.batchDelayMs);
    }
    batchTelemetry = recordCloudWorkerBatchTelemetry(batchTelemetry, Date.now() - batchStartedAt);
    const progress = cloudProvider.createBatchProgress(plan, batchIndex, {
      telemetry: batchTelemetry,
      yieldDelayMs: config.batchDelayMs,
    });
    latestJob = await reportProgress(job.id, {
      bridgeId: config.workerId,
      status: "running",
      stage: progress.stage,
      percent: progress.percent,
      level: progress.level,
      message: progress.message,
      result: progress.result,
    });
    if (isTerminalBimJobStatus(latestJob?.status)) {
      console.log(`Job ${job.id} termino durante procesamiento cloud: ${latestJob.status}.`);
      return;
    }
  }

  const durationMs = Date.now() - startedAt;
  const artifactsToUpload = cloudProvider.createArtifacts(plan, {
    durationMs,
    telemetry: batchTelemetry,
    yieldDelayMs: config.batchDelayMs,
  });
  latestJob = await reportProgress(job.id, createCloudWorkerCheckpointProgress({
    workerId: config.workerId,
    stage: "Preparando artefactos BIM",
    percent: 96,
    message: "Validando cancelacion antes de subir artefactos BIM.",
  }));
  if (isTerminalBimJobStatus(latestJob?.status)) {
    console.log(`Job ${job.id} termino antes de subir artefactos: ${latestJob.status}`);
    return;
  }
  const uploadedArtifacts = await uploadBimArtifacts(job.id, artifactsToUpload);
  if (uploadedArtifacts === null) {
    console.log(`Job ${job.id} termino antes de registrar artefactos.`);
    return;
  }
  const result = cloudProvider.createResult(plan, {
    durationMs,
    artifacts: uploadedArtifacts,
    telemetry: batchTelemetry,
    yieldDelayMs: config.batchDelayMs,
  });
  latestJob = await reportProgress(job.id, {
    bridgeId: config.workerId,
    status: "completed",
    stage: "Preview cloud listo",
    percent: 100,
    message: `Worker cloud completo ${plan.elementCount} elementos en ${plan.batchCount} lotes.`,
    result,
  });
  console.log(`Job cloud ${job.id} finalizado con estado ${latestJob?.status || "desconocido"}.`);
}

async function reportProgress(jobId, progress) {
  const payload = await requestJson(`api/bim/bridge/jobs/${encodeURIComponent(jobId)}/progress`, {
    method: "POST",
    body: progress,
  });
  return payload.job || null;
}

async function uploadBimArtifacts(jobId, artifacts) {
  let payload;
  try {
    payload = await requestJson(`api/bim/bridge/jobs/${encodeURIComponent(jobId)}/artifacts`, {
      method: "POST",
      body: {
        workerId: config.workerId,
        artifacts,
      },
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return null;
    }
    throw error;
  }
  return Array.isArray(payload.artifacts) ? payload.artifacts : [];
}

async function requestJson(relativePath, options = {}) {
  const endpoint = new URL(relativePath.replace(/^\/+/, ""), config.baseUrl);
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Itemicostos-Key": config.apiKey,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      return;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || "http://127.0.0.1:5500/").trim();
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function readInteger(value, fallback, min, max) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function normalizeCommandType(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "cloud-model-analysis";
}

function isProviderCheckReady(readiness, workerConfig) {
  if (!readiness?.ok) {
    return false;
  }
  if (String(workerConfig.providerId || "").trim().toLowerCase() !== "aps-design-automation") {
    return true;
  }
  return readiness.workItemContract?.readyForExecution === true;
}
