import fs from "node:fs";
import path from "node:path";
import {
  buildBimBridgeE2eSmokeClaimPath,
  createBimBridgeE2eSmokeDocumentVersionMismatchConfig,
  createBimBridgeE2eSmokeMissingRequestedByConfig,
  createBimBridgeE2eSmokeJobPayload,
  getBimBridgeE2eSmokeMissingConfig,
  normalizeBimBridgeE2eSmokeConfig,
} from "./bim-bridge-e2e-smoke-domain.mjs";
import {
  createBimBridgeSmokeArtifacts,
  createBimBridgeSmokeCompletedProgress,
  createBimBridgeSmokeOwnershipMismatchProgress,
  createBimBridgeSmokeRunningProgress,
} from "./bim-bridge-smoke-domain.mjs";
import {
  createBimReadinessDerivedEnv,
} from "./bim-readiness-domain.mjs";
import {
  loadLocalRevitBridgeSettings,
} from "./bim-local-revit-settings.mjs";

loadLocalEnv(path.resolve(process.cwd(), ".env"));

const derivedEnv = createBimReadinessDerivedEnv(process.env, {
  revitBridgeSettings: loadLocalRevitBridgeSettings(process.env),
});
const config = normalizeBimBridgeE2eSmokeConfig(derivedEnv.env);
const missing = getBimBridgeE2eSmokeMissingConfig(config);

const result = {
  ok: false,
  skipped: false,
  baseUrl: config.baseUrl,
  projectId: config.projectId,
  targetMode: config.targetMode,
  commandType: config.commandType,
  requestedBy: config.requestedBy,
  derivedConfig: derivedEnv.summary,
  bridgePresence: null,
  steps: [],
  createdJobId: "",
  claimedJobId: "",
};

try {
  const health = await requestJson("api/health", { auth: "none" });
  result.steps.push({ name: "health", ok: Boolean(health.ok), storage: health.storage || "" });

  if (missing.length > 0) {
    finishSkipped(
      `Bridge E2E smoke BIM omitido. Configura ${missing.join(", ")} para crear, reclamar y completar un job active-revit de prueba.`,
    );
  }

  await expectMissingRequestedByRejected();

  const createPayload = createBimBridgeE2eSmokeJobPayload(config);
  const created = await requestJson("api/bim/jobs", {
    method: "POST",
    body: createPayload,
    auth: "session",
  });
  result.createdJobId = created.job?.id || "";
  assertStep(result.createdJobId, "create");
  result.steps.push({ name: "create", ok: true, jobId: result.createdJobId, status: created.job?.status || "" });

  await expectArtifactBeforeClaimRejected(created.job);
  await expectOperationsBeforeClaimRejected(created.job);
  await expectDocumentVersionMismatchDoesNotClaimCreatedJob();

  const claimed = await requestJson(buildBimBridgeE2eSmokeClaimPath(config), { auth: "bridge" });
  assertBridgePresence(claimed, "bridge-presence-claim");
  const job = Array.isArray(claimed.jobs) ? claimed.jobs[0] : null;
  result.claimedJobId = job?.id || "";
  result.steps.push({
    name: "claim",
    ok: result.claimedJobId === result.createdJobId,
    jobId: result.claimedJobId,
  });
  assertStep(result.claimedJobId === result.createdJobId, "claim-created-job");

  await expectBridgeSummaryReportsPresence();

  await expectOwnershipMismatchRejected(job.id);
  await expectArtifactOwnershipMismatchRejected(job);
  await expectOperationsOwnershipMismatchRejected(job);

  const operations = await uploadOperations(job.id, config.workerId);
  result.steps.push({ name: "operations-upload", ok: operations.count === 1, count: operations.count });
  const operationsPage = await loadOperations(job.id, config.workerId);
  result.steps.push({
    name: "operations-page",
    ok: Array.isArray(operationsPage.operations) && operationsPage.operations.length === 1,
    count: Array.isArray(operationsPage.operations) ? operationsPage.operations.length : 0,
  });

  const running = await reportProgress(job.id, createBimBridgeSmokeRunningProgress(config));
  result.steps.push({ name: "progress-running", ok: running.job?.status === "running", status: running.job?.status || "" });

  const artifactsPayload = createBimBridgeSmokeArtifacts(job, config);
  const artifacts = await requestJson(`api/bim/bridge/jobs/${encodeURIComponent(job.id)}/artifacts`, {
    method: "POST",
    body: {
      workerId: config.workerId,
      artifacts: artifactsPayload,
    },
    auth: "bridge",
  });
  const artifactCount = Array.isArray(artifacts.artifacts) ? artifacts.artifacts.length : 0;
  result.steps.push({ name: "artifacts", ok: artifactCount > 0, count: artifactCount });

  const completed = await reportProgress(job.id, createBimBridgeSmokeCompletedProgress(job, config, artifactCount));
  result.steps.push({ name: "progress-completed", ok: completed.job?.status === "completed", status: completed.job?.status || "" });

  const loaded = await requestJson(`api/bim/jobs/${encodeURIComponent(job.id)}`, { auth: "session" });
  result.steps.push({ name: "get-final", ok: loaded.job?.status === "completed", status: loaded.job?.status || "" });

  result.ok = result.steps.every((step) => step.ok);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
  await cancelCreatedJobIfNeeded();
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

async function reportProgress(jobId, progress) {
  return requestJson(`api/bim/bridge/jobs/${encodeURIComponent(jobId)}/progress`, {
    method: "POST",
    body: progress,
    auth: "bridge",
  });
}

async function expectArtifactBeforeClaimRejected(job) {
  let mismatchError = null;
  try {
    await requestJson(`api/bim/bridge/jobs/${encodeURIComponent(job.id)}/artifacts`, {
      method: "POST",
      body: {
        workerId: config.workerId,
        artifacts: createBimBridgeSmokeArtifacts(job, config),
      },
      auth: "bridge",
    });
  } catch (error) {
    mismatchError = error;
  }

  const ok = mismatchError?.statusCode === 409 && mismatchError?.code === "BIM_JOB_OWNERSHIP_MISMATCH";
  result.steps.push({
    name: "artifact-before-claim",
    ok,
    statusCode: mismatchError?.statusCode || 0,
    code: mismatchError?.code || "",
    error: mismatchError instanceof Error ? mismatchError.message : "",
  });

  if (!ok) {
    throw mismatchError || new Error("Bridge E2E smoke BIM acepto artefactos antes de reclamar el job.");
  }
}

async function expectOperationsBeforeClaimRejected(job) {
  let mismatchError = null;
  try {
    await uploadOperations(job.id, config.workerId);
  } catch (error) {
    mismatchError = error;
  }

  const ok = mismatchError?.statusCode === 409 && mismatchError?.code === "BIM_JOB_OWNERSHIP_MISMATCH";
  result.steps.push({
    name: "operations-before-claim",
    ok,
    statusCode: mismatchError?.statusCode || 0,
    code: mismatchError?.code || "",
    error: mismatchError instanceof Error ? mismatchError.message : "",
  });

  if (!ok) {
    throw mismatchError || new Error("Bridge E2E smoke BIM acepto operaciones antes de reclamar el job.");
  }
}

async function expectMissingRequestedByRejected() {
  const missingUserConfig = createBimBridgeE2eSmokeMissingRequestedByConfig(config);
  let accessError = null;
  try {
    await requestJson(buildBimBridgeE2eSmokeClaimPath(missingUserConfig), { auth: "bridge" });
  } catch (error) {
    accessError = error;
  }

  const ok = accessError?.statusCode === 401 && accessError?.code === "BIM_BRIDGE_SIGNED_USER_REQUIRED";
  result.steps.push({
    name: "missing-requested-by-rejected",
    ok,
    statusCode: accessError?.statusCode || 0,
    code: accessError?.code || "",
    error: accessError instanceof Error ? accessError.message : "",
  });

  if (!ok) {
    throw accessError || new Error("Bridge E2E smoke BIM acepto reclamar active-revit sin requestedBy.");
  }
}

async function expectDocumentVersionMismatchDoesNotClaimCreatedJob() {
  const mismatchConfig = createBimBridgeE2eSmokeDocumentVersionMismatchConfig(config);
  const claimed = await requestJson(buildBimBridgeE2eSmokeClaimPath(mismatchConfig), { auth: "bridge" });
  assertBridgePresence(claimed, "bridge-presence-mismatch");
  const jobs = Array.isArray(claimed.jobs) ? claimed.jobs : [];
  const claimedCreatedJob = jobs.some((entry) => entry?.id === result.createdJobId);
  const ok = !claimedCreatedJob;
  result.steps.push({
    name: "document-version-mismatch",
    ok,
    returnedJobCount: jobs.length,
    claimedCreatedJob,
    documentVersion: mismatchConfig.modelIdentity.documentVersion,
  });

  if (!ok) {
    throw new Error("Bridge E2E smoke BIM reclamo el job creado con documentVersion incorrecto.");
  }
}

async function expectBridgeSummaryReportsPresence() {
  const payload = await requestJson(`api/bim/bridge/summary?projectId=${encodeURIComponent(config.projectId)}`, {
    auth: "bridge",
  });
  const presence = payload.summary?.bridgePresence || {};
  const ok = presence.online === true && presence.latestBridgeId === config.workerId;
  result.steps.push({
    name: "bridge-summary-presence",
    ok,
    online: presence.online === true,
    latestBridgeId: presence.latestBridgeId || "",
    onlineCount: Number(presence.onlineCount || 0),
  });
  if (!ok) {
    throw new Error("Bridge E2E smoke BIM no encontro presencia activa del bridge en /api/bim/bridge/summary.");
  }
}

function assertBridgePresence(payload, stepName) {
  const presence = payload?.bridgePresence || {};
  const ok = presence.online === true && presence.latestBridgeId === config.workerId;
  result.bridgePresence = presence;
  result.steps.push({
    name: stepName,
    ok,
    online: presence.online === true,
    latestBridgeId: presence.latestBridgeId || "",
    onlineCount: Number(presence.onlineCount || 0),
  });
  if (!ok) {
    throw new Error(`Bridge E2E smoke BIM no recibio bridgePresence online en ${stepName}.`);
  }
}

async function expectOwnershipMismatchRejected(jobId) {
  let mismatchError = null;
  try {
    await reportProgress(jobId, createBimBridgeSmokeOwnershipMismatchProgress(config));
  } catch (error) {
    mismatchError = error;
  }

  const ok = mismatchError?.statusCode === 409 && mismatchError?.code === "BIM_JOB_OWNERSHIP_MISMATCH";
  result.steps.push({
    name: "ownership-mismatch",
    ok,
    statusCode: mismatchError?.statusCode || 0,
    code: mismatchError?.code || "",
    error: mismatchError instanceof Error ? mismatchError.message : "",
  });

  if (!ok) {
    throw mismatchError || new Error("Bridge E2E smoke BIM acepto progreso de un bridge distinto al que reclamo el job.");
  }
}

async function expectArtifactOwnershipMismatchRejected(job) {
  const mismatchWorkerId = `${config.workerId}-mismatch`;
  let mismatchError = null;
  try {
    await requestJson(`api/bim/bridge/jobs/${encodeURIComponent(job.id)}/artifacts`, {
      method: "POST",
      body: {
        workerId: mismatchWorkerId,
        artifacts: createBimBridgeSmokeArtifacts(job, {
          ...config,
          workerId: mismatchWorkerId,
        }),
      },
      auth: "bridge",
    });
  } catch (error) {
    mismatchError = error;
  }

  const ok = mismatchError?.statusCode === 409 && mismatchError?.code === "BIM_JOB_OWNERSHIP_MISMATCH";
  result.steps.push({
    name: "artifact-ownership-mismatch",
    ok,
    statusCode: mismatchError?.statusCode || 0,
    code: mismatchError?.code || "",
    error: mismatchError instanceof Error ? mismatchError.message : "",
  });

  if (!ok) {
    throw mismatchError || new Error("Bridge E2E smoke BIM acepto artefactos de un bridge distinto al que reclamo el job.");
  }
}

async function expectOperationsOwnershipMismatchRejected(job) {
  const mismatchWorkerId = `${config.workerId}-mismatch`;
  let mismatchError = null;
  try {
    await loadOperations(job.id, mismatchWorkerId);
  } catch (error) {
    mismatchError = error;
  }

  const ok = mismatchError?.statusCode === 409 && mismatchError?.code === "BIM_JOB_OWNERSHIP_MISMATCH";
  result.steps.push({
    name: "operations-ownership-mismatch",
    ok,
    statusCode: mismatchError?.statusCode || 0,
    code: mismatchError?.code || "",
    error: mismatchError instanceof Error ? mismatchError.message : "",
  });

  if (!ok) {
    throw mismatchError || new Error("Bridge E2E smoke BIM acepto operaciones de un bridge distinto al que reclamo el job.");
  }
}

async function uploadOperations(jobId, workerId) {
  return requestJson(buildOperationsPath(jobId, workerId), {
    method: "POST",
    body: createSmokeOperationsUpload(workerId),
    auth: "bridge",
  });
}

async function loadOperations(jobId, workerId) {
  return requestJson(`${buildOperationsPath(jobId, workerId)}&source=payload&offset=0&limit=10`, {
    auth: "bridge",
  });
}

function buildOperationsPath(jobId, workerId) {
  return `api/bim/bridge/jobs/${encodeURIComponent(jobId)}/operations?workerId=${encodeURIComponent(workerId)}`;
}

function createSmokeOperationsUpload(workerId) {
  return {
    source: "payload",
    mode: "replace",
    operations: [
      {
        operationType: "parameter-write",
        elementId: 101,
        parameterName: "ITEMICOSTOS_SMOKE",
        value: String(workerId || "bridge-smoke-worker"),
      },
    ],
  };
}

async function cancelCreatedJobIfNeeded() {
  if (!result.createdJobId || result.steps.some((step) => step.name === "progress-completed" && step.ok)) {
    return;
  }
  try {
    await requestJson(`api/bim/jobs/${encodeURIComponent(result.createdJobId)}/cancel`, {
      method: "POST",
      body: {},
      auth: "session",
    });
    result.steps.push({ name: "cleanup-cancel", ok: true, jobId: result.createdJobId });
  } catch (cleanupError) {
    result.steps.push({
      name: "cleanup-cancel",
      ok: false,
      error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }
}

async function requestJson(relativePath, options = {}) {
  const endpoint = new URL(relativePath.replace(/^\/+/, ""), config.baseUrl);
  const headers = {
    "Accept": "application/json",
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.auth === "bridge" ? { "X-Itemicostos-Key": config.apiKey } : {}),
    ...(options.auth === "session" ? { "Cookie": config.sessionCookie } : {}),
  };
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.code = payload.code || "";
    error.payload = payload;
    throw error;
  }
  return payload;
}

function finishSkipped(message) {
  result.skipped = true;
  result.message = message;
  result.ok = !config.strict;
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function assertStep(value, name) {
  if (!value) {
    throw new Error(`Bridge E2E smoke BIM fallo en ${name}.`);
  }
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
