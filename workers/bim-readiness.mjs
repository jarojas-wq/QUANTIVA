import fs from "node:fs";
import path from "node:path";
import {
  createBimReadinessReport,
  createBimReadinessRuntimeReport,
} from "./bim-readiness-domain.mjs";
import {
  loadRevitBridgeSettings,
  resolveRevitBridgeSettingsPath,
} from "./bim-local-revit-settings.mjs";
import {
  probeBimRevitLocalSession,
} from "./bim-revit-local-session.mjs";

loadLocalEnv(path.resolve(process.cwd(), ".env"));

const strict = parseBoolean(process.env.BIM_READINESS_STRICT, false);
const checkHealth = parseBoolean(process.env.BIM_READINESS_CHECK_HEALTH, true);
const checkBridgeQueue = parseBoolean(process.env.BIM_READINESS_CHECK_BRIDGE_QUEUE, true);
const checkRevitSettings = parseBoolean(process.env.BIM_READINESS_CHECK_REVIT_SETTINGS, true);
const checkRevitSession = parseBoolean(process.env.BIM_READINESS_CHECK_REVIT_SESSION, process.platform === "win32");
const checkFluencyReport = parseBoolean(process.env.BIM_READINESS_CHECK_FLUENCY_REPORT, true);
const revitBridgeSettings = checkRevitSettings
  ? loadRevitBridgeSettings(resolveRevitBridgeSettingsPath(process.env))
  : { checked: false };
const fluencyReport = checkFluencyReport
  ? loadBimFluencyReport(resolveBimFluencyReportPath(process.env))
  : { checked: false };
const revitLocalSession = checkRevitSession
  ? loadRevitLocalSession(process.env)
  : { checked: false };
let report = createBimReadinessReport(process.env, { revitBridgeSettings, fluencyReport });
const backendHealth = checkHealth
  ? await checkBackendHealth(report.baseUrl)
  : { attempted: false, ok: true, skipped: true };
const bridgeQueueSummary = checkBridgeQueue
  ? await checkBridgeQueueRuntime(report.baseUrl, report, process.env)
  : { attempted: false, ok: true, skipped: true };
if (checkBridgeQueue && bridgeQueueSummary?.summary?.bridgePresence) {
  report = createBimReadinessReport(process.env, {
    revitBridgeSettings,
    fluencyReport,
    bridgeQueueSummary,
  });
}
const result = createBimReadinessRuntimeReport(report, backendHealth, {
  checkHealth,
  checkBridgeQueue,
  bridgeQueueSummary,
  revitLocalSession,
});

console.log(JSON.stringify(result, null, 2));
if (strict && !result.ok) {
  process.exitCode = 1;
}

async function checkBackendHealth(baseUrl) {
  const endpoint = new URL("api/health", baseUrl);
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      headers: { "Accept": "application/json" },
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    return {
      attempted: true,
      ok: response.ok,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      storage: String(payload.storage || ""),
      endpoint: endpoint.toString(),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      durationMs: Date.now() - startedAt,
      endpoint: endpoint.toString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkBridgeQueueRuntime(baseUrl, readinessReport, env) {
  const projectId = String(readinessReport?.derivedConfig?.projectId || env.BIM_SMOKE_PROJECT_ID || env.PROJECT_ID || "").trim();
  const apiKey = String(env.REVIT_INGEST_API_KEY || env.BIM_WORKER_API_KEY || "").trim();
  if (!projectId || !apiKey) {
    return {
      attempted: false,
      skipped: true,
      ok: true,
      projectId,
      missing: [
        ...(!projectId ? ["BIM_SMOKE_PROJECT_ID or Revit projectUid"] : []),
        ...(!apiKey ? ["REVIT_INGEST_API_KEY or BIM_WORKER_API_KEY"] : []),
      ],
    };
  }

  const endpoint = new URL("api/bim/bridge/summary", baseUrl);
  endpoint.searchParams.set("projectId", projectId);
  try {
    const response = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "X-Itemicostos-Key": apiKey,
      },
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    return {
      attempted: true,
      skipped: false,
      ok: response.ok,
      endpoint: endpoint.toString(),
      statusCode: response.status,
      projectId,
      summary: payload.summary || {},
      error: response.ok ? "" : String(payload.error || payload.raw || `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      attempted: true,
      skipped: false,
      ok: false,
      endpoint: endpoint.toString(),
      projectId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveBimFluencyReportPath(env) {
  const explicitPath = String(env.BIM_FLUENCY_REPORT_PATH || "").trim();
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  return path.resolve(process.cwd(), "data", "bim-fluency-check.json");
}

function loadBimFluencyReport(reportPath) {
  if (!reportPath) {
    return {
      checked: true,
      exists: false,
      path: "",
    };
  }
  if (!fs.existsSync(reportPath)) {
    return {
      checked: true,
      exists: false,
      path: reportPath,
    };
  }
  try {
    return {
      checked: true,
      exists: true,
      path: reportPath,
      report: JSON.parse(fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "")),
    };
  } catch (error) {
    return {
      checked: true,
      exists: true,
      path: reportPath,
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}

function loadRevitLocalSession(env) {
  try {
    return {
      checked: true,
      attempted: true,
      ...probeBimRevitLocalSession({
        version: String(env.BIM_REVIT_VERSION || "2025").trim() || "2025",
      }),
    };
  } catch (error) {
    return {
      checked: true,
      attempted: true,
      ok: false,
      status: "probe-failed",
      version: String(env.BIM_REVIT_VERSION || "2025").trim() || "2025",
      missing: ["REVIT_LOCAL_SESSION_PROBE"],
      error: error instanceof Error ? error.message : String(error),
    };
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

function parseBoolean(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "si", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(text)) {
    return false;
  }
  return fallback;
}
