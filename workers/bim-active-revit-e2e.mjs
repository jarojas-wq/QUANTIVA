import fs from "node:fs";
import path from "node:path";
import {
  createActiveRevitE2eJobPayload,
  createActiveRevitE2ePlan,
  isActiveRevitE2eSatisfied,
  normalizeActiveRevitE2eConfig,
  summarizeActiveRevitE2eJobObservation,
} from "./bim-active-revit-e2e-domain.mjs";
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
const config = normalizeActiveRevitE2eConfig(derivedEnv.env);
const result = {
  ok: false,
  skipped: false,
  status: "starting",
  baseUrl: config.baseUrl,
  projectId: config.projectId,
  commandType: config.commandType,
  strict: config.strict,
  derivedConfig: derivedEnv.summary,
  bridgePresence: null,
  plan: null,
  createdJobId: "",
  finalObservation: null,
  steps: [],
};

class ActiveRevitE2eSkipped extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

try {
  const health = await requestJson(config, "api/health", { auth: "none" });
  result.steps.push({ name: "health", ok: Boolean(health.ok), storage: health.storage || "" });

  const bridgeSummary = await loadBridgeSummary(config);
  result.bridgePresence = bridgeSummary.summary?.bridgePresence || null;
  result.steps.push({
    name: "bridge-summary",
    ok: result.bridgePresence?.online === true,
    latestBridgeId: result.bridgePresence?.latestBridgeId || "",
    latestRequestedBy: result.bridgePresence?.latestRequestedBy || "",
  });

  const plan = createActiveRevitE2ePlan(config, bridgeSummary.summary || {});
  result.plan = redactPlan(plan);
  if (!plan.ok) {
    finishSkipped(
      `E2E Revit activo omitido. Falta configurar/verificar: ${plan.missing.join(", ")}.`,
      plan.missing,
    );
  }

  const createPayload = createActiveRevitE2eJobPayload(plan);
  const created = await requestJson(config, "api/bim/jobs", {
    method: "POST",
    body: createPayload,
    auth: "session",
  });
  result.createdJobId = created.job?.id || "";
  assertStep(result.createdJobId, "create");
  result.steps.push({
    name: "create",
    ok: true,
    jobId: result.createdJobId,
    status: created.job?.status || "",
  });

  const observation = await waitForActiveRevitProgress(result.createdJobId);
  result.finalObservation = observation;
  if (
    config.cancelAfterProgress
    && !config.waitForCompletion
    && observation.progressObserved
    && !observation.terminal
  ) {
    await cancelJob(result.createdJobId, "cleanup-cancel-after-progress");
  }

  result.ok = isActiveRevitE2eSatisfied(observation, config);
  result.status = result.ok ? "ready" : "failed";
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  if (error instanceof ActiveRevitE2eSkipped) {
    process.exitCode = error.exitCode;
  } else {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    await cancelCreatedJobIfNeeded();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}

async function loadBridgeSummary(activeConfig) {
  const missing = [];
  if (!activeConfig.projectId) {
    missing.push("BIM_ACTIVE_REVIT_E2E_PROJECT_ID");
  }
  if (!activeConfig.apiKey) {
    missing.push("BIM_ACTIVE_REVIT_E2E_API_KEY");
  }
  if (missing.length > 0) {
    return {
      summary: {},
      missing,
    };
  }
  return requestJson(activeConfig, `api/bim/bridge/summary?projectId=${encodeURIComponent(activeConfig.projectId)}`, {
    auth: "bridge",
  });
}

async function waitForActiveRevitProgress(jobId) {
  const deadline = Date.now() + config.timeoutMs;
  let lastObservation = null;
  let lastStepStatus = "";
  while (Date.now() <= deadline) {
    const loaded = await requestJson(config, `api/bim/jobs/${encodeURIComponent(jobId)}`, { auth: "session" });
    const observation = summarizeActiveRevitE2eJobObservation(loaded.job || {});
    lastObservation = observation;
    if (observation.status !== lastStepStatus) {
      result.steps.push({
        name: "poll",
        ok: true,
        status: observation.status,
        claimedBy: observation.claimedBy,
        percent: observation.percent,
        stage: observation.stage,
      });
      lastStepStatus = observation.status;
    }
    if (isActiveRevitE2eSatisfied(observation, config) || observation.failed || observation.cancelled) {
      return observation;
    }
    await sleep(config.pollMs);
  }

  result.steps.push({
    name: "timeout",
    ok: false,
    timeoutMs: config.timeoutMs,
    lastStatus: lastObservation?.status || "",
    lastPercent: lastObservation?.percent || 0,
  });
  return lastObservation || summarizeActiveRevitE2eJobObservation({});
}

async function cancelCreatedJobIfNeeded() {
  if (!result.createdJobId) {
    return;
  }
  await cancelJob(result.createdJobId, "cleanup-cancel-on-failure");
}

async function cancelJob(jobId, stepName) {
  try {
    const cancelled = await requestJson(config, `api/bim/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      body: {},
      auth: "session",
    });
    result.steps.push({
      name: stepName,
      ok: true,
      status: cancelled.job?.status || "",
    });
  } catch (error) {
    result.steps.push({
      name: stepName,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function requestJson(activeConfig, relativePath, options = {}) {
  const endpoint = new URL(relativePath.replace(/^\/+/, ""), activeConfig.baseUrl);
  const headers = {
    "Accept": "application/json",
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.auth === "bridge" ? { "X-Itemicostos-Key": activeConfig.apiKey } : {}),
    ...(options.auth === "session" ? { "Cookie": activeConfig.sessionCookie } : {}),
  };
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || payload.raw || `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.code = payload.code || "";
    throw error;
  }
  return payload;
}

function finishSkipped(message, missing) {
  result.skipped = true;
  result.status = "needs-config";
  result.message = message;
  result.missing = missing;
  console.log(JSON.stringify(result, null, 2));
  throw new ActiveRevitE2eSkipped(message, config.strict ? 1 : 0);
}

function redactPlan(plan = {}) {
  return {
    ok: plan.ok === true,
    missing: Array.isArray(plan.missing) ? plan.missing : [],
    projectId: plan.projectId || "",
    commandType: plan.commandType || "",
    requestedBy: plan.requestedBy || "",
    bridgeId: plan.bridgeId || "",
    bridgeSeenAt: plan.bridgeSeenAt || "",
    modelIdentity: plan.modelIdentity || {},
    batchSize: plan.batchSize || 0,
  };
}

function assertStep(value, name) {
  if (!value) {
    throw new Error(`E2E Revit activo fallo en ${name}.`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
