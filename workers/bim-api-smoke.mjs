import fs from "node:fs";
import path from "node:path";
import {
  createBimApiSmokeJobPayload,
  getBimApiSmokeMissingConfig,
  normalizeBimApiSmokeConfig,
} from "./bim-api-smoke-domain.mjs";
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
const config = normalizeBimApiSmokeConfig(derivedEnv.env);
const missing = getBimApiSmokeMissingConfig(config);

const result = {
  ok: false,
  skipped: false,
  baseUrl: config.baseUrl,
  projectId: config.projectId,
  derivedConfig: derivedEnv.summary,
  steps: [],
  createdJobId: "",
  retriedJobId: "",
};

try {
  const health = await requestJson("api/health");
  result.steps.push({ name: "health", ok: Boolean(health.ok), storage: health.storage || "" });

  if (missing.length > 0) {
    result.skipped = true;
    result.missing = missing;
    result.message = `Smoke BIM omitido. Configura ${missing.join(", ")} para crear/cancelar/reintentar jobs.`;
    result.ok = !config.strict;
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  const createPayload = createBimApiSmokeJobPayload(config);
  const created = await requestJson("api/bim/jobs", {
    method: "POST",
    body: createPayload,
    cookie: config.sessionCookie,
  });
  result.createdJobId = created.job?.id || "";
  assertStep(result.createdJobId, "create");
  result.steps.push({ name: "create", ok: true, jobId: result.createdJobId, status: created.job?.status || "" });

  const event = await requestFirstSseJobEvent(result.createdJobId, {
    cookie: config.sessionCookie,
  });
  const eventJob = event.data?.job || {};
  const hasTiming = Number.isFinite(Number(eventJob.queueWaitSeconds))
    && Number.isFinite(Number(eventJob.runSeconds))
    && Number.isFinite(Number(eventJob.totalSeconds));
  result.steps.push({
    name: "events",
    ok: event.event === "job" && eventJob.id === result.createdJobId && event.hasRetry && hasTiming,
    event: event.event,
    retry: event.hasRetry,
    timing: hasTiming,
  });

  const loaded = await requestJson(`api/bim/jobs/${encodeURIComponent(result.createdJobId)}`, {
    cookie: config.sessionCookie,
  });
  result.steps.push({ name: "get", ok: loaded.job?.id === result.createdJobId, status: loaded.job?.status || "" });

  const summary = await requestJson(`api/bim/jobs/summary?projectId=${encodeURIComponent(config.projectId)}`, {
    cookie: config.sessionCookie,
  });
  result.steps.push({ name: "summary", ok: Boolean(summary.summary), queued: summary.summary?.queued ?? 0 });

  const cancelled = await requestJson(`api/bim/jobs/${encodeURIComponent(result.createdJobId)}/cancel`, {
    method: "POST",
    body: {},
    cookie: config.sessionCookie,
  });
  result.steps.push({ name: "cancel", ok: cancelled.job?.status === "cancelled", status: cancelled.job?.status || "" });

  const retried = await requestJson(`api/bim/jobs/${encodeURIComponent(result.createdJobId)}/retry`, {
    method: "POST",
    body: {},
    cookie: config.sessionCookie,
  });
  result.retriedJobId = retried.job?.id || "";
  assertStep(result.retriedJobId, "retry");
  result.steps.push({ name: "retry", ok: true, jobId: result.retriedJobId, status: retried.job?.status || "" });

  const cleanup = await requestJson(`api/bim/jobs/${encodeURIComponent(result.retriedJobId)}/cancel`, {
    method: "POST",
    body: {},
    cookie: config.sessionCookie,
  });
  result.steps.push({ name: "cleanup-retry", ok: cleanup.job?.status === "cancelled", status: cleanup.job?.status || "" });

  result.ok = result.steps.every((step) => step.ok);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

async function requestJson(relativePath, options = {}) {
  const endpoint = new URL(relativePath.replace(/^\/+/, ""), config.baseUrl);
  const headers = {
    "Accept": "application/json",
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.cookie ? { "Cookie": options.cookie } : {}),
  };
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);
  }
  return payload;
}

async function requestFirstSseJobEvent(jobId, options = {}) {
  const endpoint = new URL(`api/bim/jobs/${encodeURIComponent(jobId)}/events`, config.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let reader = null;
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        ...(options.cookie ? { "Cookie": options.cookie } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error("Smoke BIM fallo en events: respuesta SSE sin body.");
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      text += decoder.decode(chunk.value, { stream: true });
      const event = parseFirstSseEvent(text);
      if (event) {
        return event;
      }
      if (text.length > 64 * 1024) {
        throw new Error("Smoke BIM fallo en events: stream SSE demasiado grande sin evento job.");
      }
    }
    throw new Error("Smoke BIM fallo en events: el stream termino sin evento job.");
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Smoke BIM fallo en events: timeout esperando evento job.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // El abort/cierre del stream puede cancelar primero; no afecta el smoke.
      }
    }
    controller.abort();
  }
}

function parseFirstSseEvent(text) {
  const hasRetry = /^retry:/m.test(text);
  const blocks = text.split(/\r?\n\r?\n/);
  const completeBlocks = text.endsWith("\n\n") || text.endsWith("\r\n\r\n")
    ? blocks
    : blocks.slice(0, -1);

  for (const block of completeBlocks) {
    let eventName = "message";
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (eventName === "job" && dataLines.length > 0) {
      return {
        event: eventName,
        data: JSON.parse(dataLines.join("\n")),
        hasRetry,
      };
    }
  }
  return null;
}

function assertStep(value, name) {
  if (!value) {
    throw new Error(`Smoke BIM fallo en ${name}: respuesta sin job id.`);
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
