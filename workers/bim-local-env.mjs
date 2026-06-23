import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createBimReadinessReport } from "./bim-readiness-domain.mjs";
import { createBimLocalEnvPatch } from "./bim-local-env-domain.mjs";

const argv = process.argv.slice(2);
const args = new Set(argv);
const dryRun = args.has("--dry-run");
const generateBridgeKey = args.has("--generate-bridge-key");
const rotateBridgeKey = args.has("--rotate-bridge-key");
const explicitEnv = parseExplicitEnvArgs(argv);
const envPath = path.resolve(process.cwd(), ".env");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const patch = createBimLocalEnvPatch({
  envText,
  runtimeEnv: process.env,
  explicitEnv,
  generateBridgeKey: generateBridgeKey || rotateBridgeKey,
  rotateBridgeKey,
  generatedBridgeKey: generateBridgeKey || rotateBridgeKey ? createSecretKey() : "",
});

if (patch.changed && !dryRun) {
  fs.writeFileSync(envPath, patch.nextText, "utf8");
}

const nextEnv = {
  ...process.env,
  ...parseEnvTextForReport(patch.nextText),
};
const readiness = createBimReadinessReport(nextEnv);

console.log(JSON.stringify({
  ok: true,
  dryRun,
  envPath,
  wroteFile: patch.changed && !dryRun,
  ...patch.redactedSummary,
  readyForRealValidation: readiness.readyForRealValidation,
  activeRevitE2eReady: readiness.activeRevitE2eReady,
  apsLiveReady: readiness.apsLiveReady,
  artifactDownloadsReady: readiness.artifactDownloadsReady,
  missing: readiness.missing,
  nextCommands: readiness.nextCommands,
}, null, 2));

function createSecretKey() {
  return `ik_${crypto.randomBytes(32).toString("base64url")}`;
}

function parseExplicitEnvArgs(argv) {
  const explicit = {};
  const flagMap = new Map([
    ["--aps-client-id", "BIM_APS_CLIENT_ID"],
    ["--aps-client-secret", "BIM_APS_CLIENT_SECRET"],
    ["--aps-activity-id", "BIM_APS_ACTIVITY_ID"],
    ["--aps-check-input-url", "BIM_APS_CHECK_INPUT_URL"],
    ["--aps-check-output-url", "BIM_APS_CHECK_OUTPUT_URL"],
    ["--artifact-redirect-hosts", "BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS"],
    ["--worker-provider", "BIM_WORKER_PROVIDER"],
    ["--smoke-project-id", "BIM_SMOKE_PROJECT_ID"],
    ["--smoke-session-cookie", "BIM_SMOKE_SESSION_COOKIE"],
    ["--smoke-user-email", "BIM_SMOKE_USER_EMAIL"],
    ["--bridge-smoke-project-id", "BIM_BRIDGE_SMOKE_PROJECT_ID"],
    ["--bridge-smoke-session-cookie", "BIM_BRIDGE_SMOKE_SESSION_COOKIE"],
    ["--bridge-e2e-project-id", "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID"],
    ["--bridge-e2e-session-cookie", "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE"],
    ["--bridge-e2e-requested-by", "BIM_BRIDGE_E2E_REQUESTED_BY"],
  ]);

  argv.forEach((entry, index) => {
    if (entry === "--enable-aps") {
      explicit.BIM_WORKER_PROVIDER = "aps-design-automation";
      return;
    }
    if (entry === "--use-simulated-aps") {
      explicit.BIM_WORKER_PROVIDER = "simulated-aps";
      return;
    }
    const [flag, inlineValue] = splitFlagValue(entry);
    const envKey = flagMap.get(flag);
    if (!envKey) {
      return;
    }
    const value = inlineValue !== null ? inlineValue : argv[index + 1];
    if (!value || String(value).startsWith("--")) {
      throw new Error(`${flag} requiere un valor.`);
    }
    explicit[envKey] = String(value).trim();
  });

  return explicit;
}

function splitFlagValue(entry) {
  const text = String(entry || "");
  const index = text.indexOf("=");
  if (index < 0) {
    return [text, null];
  }
  return [text.slice(0, index), text.slice(index + 1)];
}

function parseEnvTextForReport(text) {
  const values = {};
  String(text || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      return;
    }
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  });
  return values;
}
