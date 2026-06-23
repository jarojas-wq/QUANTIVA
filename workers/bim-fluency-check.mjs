import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBimCloudLoadTest } from "./bim-cloud-load-test-domain.mjs";
import { createBimFluencyCheckReport } from "./bim-fluency-check-domain.mjs";
import { runBimRealtimeLoadTest } from "./bim-realtime-load-test-domain.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultReportPath = path.join(repoRoot, "data", "bim-fluency-check.json");
const revitBenchmarkProject = path.resolve(
  repoRoot,
  "..",
  "REVIT-MODEL-AUDITOR",
  "src",
  "RevitModelAudit.Benchmarks",
);

const cloud = runBimCloudLoadTest({
  sizes: process.env.BIM_WORKER_LOAD_TEST_SIZES || "10000,50000,100000",
  batchSize: process.env.BIM_WORKER_LOAD_TEST_BATCH_SIZE || 250,
});

const realtime = runBimRealtimeLoadTest({
  jobCount: process.env.BIM_REALTIME_LOAD_TEST_JOBS || 4,
  eventsPerJob: process.env.BIM_REALTIME_LOAD_TEST_EVENTS_PER_JOB || 2500,
  eventIntervalMs: process.env.BIM_REALTIME_LOAD_TEST_EVENT_INTERVAL_MS || 5,
  flushMs: process.env.BIM_REALTIME_LOAD_TEST_FLUSH_MS || 120,
  minRenderReductionPercent: process.env.BIM_REALTIME_LOAD_TEST_MIN_RENDER_REDUCTION_PERCENT || 95,
});

const revit = runRevitBatchPlanProbe({
  projectPath: revitBenchmarkProject,
  sizes: process.env.BIM_REVIT_BATCH_PLAN_SIZES || process.env.BIM_WORKER_LOAD_TEST_SIZES || "10000,50000,100000",
  batchSize: process.env.BIM_REVIT_BATCH_PLAN_BATCH_SIZE || process.env.BIM_WORKER_LOAD_TEST_BATCH_SIZE || 250,
});

const revitBackoff = runRevitBridgeBackoffProbe({
  projectPath: revitBenchmarkProject,
});

const revitCancellationProbe = runRevitCancellationProbe({
  projectPath: revitBenchmarkProject,
});

const revitTransactionFailureProbe = runRevitTransactionFailureProbe({
  projectPath: revitBenchmarkProject,
});

const report = createBimFluencyCheckReport({
  cloud,
  realtime,
  revit,
  revitBackoff,
  revitCancellationProbe,
  revitTransactionFailureProbe,
});

writeReport(process.env.BIM_FLUENCY_REPORT_PATH || defaultReportPath, report);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  process.exitCode = 1;
}

function writeReport(reportPath, reportPayload) {
  const targetPath = path.resolve(String(reportPath || defaultReportPath));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(reportPayload, null, 2)}\n`, "utf8");
}

function runRevitBatchPlanProbe(options) {
  const args = [
    "run",
    "--project",
    options.projectPath,
    "--",
    "--bim-batch-plan",
    "--json",
    "--bim-batch-sizes",
    String(options.sizes || ""),
    "--bim-batch-size",
    String(options.batchSize || ""),
  ];
  const result = spawnSync("dotnet", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      error: result.error.message,
      cases: [],
    };
  }

  const parsed = parseJsonObjectFromOutput(result.stdout);
  if (!parsed || result.status !== 0) {
    return {
      ok: false,
      exitCode: result.status ?? 1,
      error: normalizeProbeError(result.stderr || result.stdout),
      cases: [],
    };
  }

  return {
    ...parsed,
    exitCode: result.status ?? 0,
  };
}

function runRevitBridgeBackoffProbe(options) {
  const args = [
    "run",
    "--project",
    options.projectPath,
    "--",
    "--bim-bridge-backoff",
    "--json",
  ];
  const result = spawnSync("dotnet", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      error: result.error.message,
      cases: [],
    };
  }

  const parsed = parseJsonObjectFromOutput(result.stdout);
  if (!parsed || result.status !== 0) {
    return {
      ok: false,
      exitCode: result.status ?? 1,
      error: normalizeProbeError(result.stderr || result.stdout),
      cases: [],
    };
  }

  return {
    ...parsed,
    exitCode: result.status ?? 0,
  };
}

function runRevitCancellationProbe(options) {
  const args = [
    "run",
    "--project",
    options.projectPath,
    "--",
    "--bim-cancellation-probe",
    "--json",
  ];
  const result = spawnSync("dotnet", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      error: result.error.message,
      cases: [],
    };
  }

  const parsed = parseJsonObjectFromOutput(result.stdout);
  if (!parsed || result.status !== 0) {
    return {
      ok: false,
      exitCode: result.status ?? 1,
      error: normalizeProbeError(result.stderr || result.stdout),
      cases: [],
    };
  }

  return {
    ...parsed,
    exitCode: result.status ?? 0,
  };
}

function runRevitTransactionFailureProbe(options) {
  const args = [
    "run",
    "--project",
    options.projectPath,
    "--",
    "--bim-transaction-failure",
    "--json",
  ];
  const result = spawnSync("dotnet", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      error: result.error.message,
      cases: [],
    };
  }

  const parsed = parseJsonObjectFromOutput(result.stdout);
  if (!parsed || result.status !== 0) {
    return {
      ok: false,
      exitCode: result.status ?? 1,
      error: normalizeProbeError(result.stderr || result.stdout),
      cases: [],
    };
  }

  return {
    ...parsed,
    exitCode: result.status ?? 0,
  };
}

function parseJsonObjectFromOutput(output) {
  const text = String(output || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeProbeError(output) {
  const text = String(output || "").trim();
  if (!text) {
    return "No se pudo ejecutar el probe C# de lotes BIM.";
  }
  return text.split(/\r?\n/).slice(0, 6).join("\n");
}
