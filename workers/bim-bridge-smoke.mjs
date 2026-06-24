import fs from "node:fs";
import path from "node:path";
import {
  buildBimBridgeSmokeClaimPath,
  createBimBridgeSmokeArtifacts,
  createBimBridgeSmokeCompletedProgress,
  createBimBridgeSmokeJobPayload,
  createBimBridgeSmokeRunningProgress,
  getBimBridgeSmokeMissingConfig,
  normalizeBimBridgeSmokeConfig,
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
const config = normalizeBimBridgeSmokeConfig(derivedEnv.env);
const missing = getBimBridgeSmokeMissingConfig(config);

const result = {
  ok: false,
  skipped: false,
  baseUrl: config.baseUrl,
  projectId: config.projectId,
  targetMode: config.targetMode,
  commandType: config.commandType,
  derivedConfig: derivedEnv.summary,
  steps: [],
  createdJobId: "",
  claimedJobId: "",
};

class SmokeFinished extends Error {}

try {
  const health = await requestJson("api/health");
  result.steps.push({ name: "health", ok: Boolean(health.ok), storage: health.storage || "" });

  if (missing.length > 0) {
    finishSkipped(
      `Bridge smoke BIM omitido. Configura ${missing.join(", ")} para reclamar jobs smoke. La API key puede venir de BIM_BRIDGE_SMOKE_API_KEY, BIM_WORKER_API_KEY o REVIT_INGEST_API_KEY.`,
    );
    throw new SmokeFinished();
  }

  if (config.createJob) {
    const created = await requestJson("api/bim/jobs", {
      method: "POST",
      body: createBimBridgeSmokeJobPayload(config),
      auth: "session",
    });
    result.createdJobId = created.job?.id || "";
    result.steps.push({ name: "create", ok: Boolean(result.createdJobId), jobId: result.createdJobId, status: created.job?.status || "" });
    assertStep(result.createdJobId, "create");
  }

  const claimed = await requestJson(buildBimBridgeSmokeClaimPath(config), { auth: "bridge" });
  const job = Array.isArray(claimed.jobs) ? claimed.jobs[0] : null;
  if (!job) {
    if (result.createdJobId) {
      throw new Error("Bridge smoke BIM creo un job, pero el bridge no pudo reclamarlo.");
    }
    finishSkipped(
      `No hay jobs ${config.commandType} en cola para ${config.targetMode}; no se reclamo ningun job real.`,
    );
    throw new SmokeFinished();
  }

  result.claimedJobId = job.id || "";
  result.steps.push({ name: "claim", ok: Boolean(result.claimedJobId), jobId: result.claimedJobId });
  assertStep(result.claimedJobId, "claim");

  const running = await reportProgress(job.id, createBimBridgeSmokeRunningProgress(config));
  result.steps.push({ name: "progress-running", ok: running.job?.status === "running", status: running.job?.status || "" });

  const artifactsPayload = createBimBridgeSmokeArtifacts(job, config);
  const artifacts = await requestJson(`api/bim/bridge/jobs/${encodeURIComponent(job.id)}/artifacts`, {
    method: "POST",
    body: {
      workerId: config.workerId,
      artifacts: artifactsPayload,
    },
  });
  const artifactCount = Array.isArray(artifacts.artifacts) ? artifacts.artifacts.length : 0;
  result.steps.push({ name: "artifacts", ok: artifactCount > 0, count: artifactCount });
  const firstArtifact = Array.isArray(artifacts.artifacts) ? artifacts.artifacts[0] : null;
  const download = await downloadArtifact(job.id, firstArtifact);
  result.steps.push({
    name: "artifact-download",
    ok: download.ok,
    artifactId: firstArtifact?.id || "",
    statusCode: download.statusCode,
    contentType: download.contentType,
  });

  const completed = await reportProgress(job.id, createBimBridgeSmokeCompletedProgress(job, config, artifactCount));
  result.steps.push({ name: "progress-completed", ok: completed.job?.status === "completed", status: completed.job?.status || "" });

  result.ok = result.steps.every((step) => step.ok);
  finish(result.ok ? 0 : 1);
} catch (error) {
  if (error instanceof SmokeFinished) {
    // finishSkipped already emitted the result.
  } else {
    result.error = error instanceof Error ? error.message : String(error);
    await cancelCreatedJobIfNeeded();
    finish(1);
  }
}

async function reportProgress(jobId, progress) {
  return requestJson(`api/bim/bridge/jobs/${encodeURIComponent(jobId)}/progress`, {
    method: "POST",
    body: progress,
    auth: "bridge",
  });
}

async function downloadArtifact(jobId, artifact) {
  if (!artifact?.id) {
    return {
      ok: false,
      statusCode: 0,
      contentType: "",
    };
  }
  const response = await requestText(
    `api/bim/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifact.id)}/download`,
    { auth: "session" },
  );
  return {
    ok: response.statusCode === 200
      && response.text.includes('"source": "bim-bridge-smoke"')
      && response.artifactId === artifact.id,
    statusCode: response.statusCode,
    contentType: response.contentType,
  };
}

async function requestJson(relativePath, options = {}) {
  const endpoint = new URL(relativePath.replace(/^\/+/, ""), config.baseUrl);
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(options.auth !== "session" ? { "X-Itemicostos-Key": config.apiKey } : {}),
      ...(options.auth === "session" ? { "Cookie": config.sessionCookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);
  }
  return payload;
}

async function requestText(relativePath, options = {}) {
  const endpoint = new URL(relativePath.replace(/^\/+/, ""), config.baseUrl);
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers: {
      "Accept": "*/*",
      ...(options.auth !== "session" ? { "X-Itemicostos-Key": config.apiKey } : {}),
      ...(options.auth === "session" ? { "Cookie": config.sessionCookie } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "",
    artifactId: response.headers.get("x-itemicostos-artifact-id") || "",
    text,
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

function finishSkipped(message) {
  result.skipped = true;
  result.message = message;
  result.ok = !config.strict;
  finish(result.ok ? 0 : 1);
}

function finish(exitCode) {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = exitCode;
}

function assertStep(value, name) {
  if (!value) {
    throw new Error(`Bridge smoke BIM fallo en ${name}: respuesta sin job id.`);
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
