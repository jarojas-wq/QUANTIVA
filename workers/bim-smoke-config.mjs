import fs from "node:fs";
import path from "node:path";
import {
  createBimLocalEnvPatch,
  parseEnvText,
} from "./bim-local-env-domain.mjs";
import {
  createBimSmokeConfigPlan,
  normalizeBimSmokeConfigInput,
} from "./bim-smoke-config-domain.mjs";
import {
  createBimReadinessDerivedEnv,
} from "./bim-readiness-domain.mjs";
import {
  loadLocalRevitBridgeSettings,
} from "./bim-local-revit-settings.mjs";

loadLocalEnv(path.resolve(process.cwd(), ".env"));

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const explicitEnv = parseExplicitArgs(argv);
const envPath = path.resolve(process.cwd(), ".env");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const currentEnv = {
  ...parseEnvText(envText).values,
  ...process.env,
  ...explicitEnv,
};
const derivedEnv = createBimReadinessDerivedEnv(currentEnv, {
  revitBridgeSettings: loadLocalRevitBridgeSettings(currentEnv),
});
const config = normalizeBimSmokeConfigInput(derivedEnv.env);

const result = await prepareSmokeConfig(config, envText, explicitEnv, derivedEnv);

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}

async function prepareSmokeConfig(configInput, currentEnvText, explicitValues, derivedConfig) {
  if (!configInput.sessionCookie) {
    return createSkippedResult(configInput, ["BIM_SMOKE_SESSION_COOKIE"], null, derivedConfig);
  }

  const sessionResult = await requestJson(configInput.baseUrl, "api/auth/web/session", configInput.sessionCookie);
  if (!sessionResult.ok) {
    return createSkippedResult(configInput, ["AUTHENTICATED_SESSION"], sessionResult, derivedConfig);
  }

  const stateResult = await requestJson(configInput.baseUrl, "api/state", configInput.sessionCookie);
  if (!stateResult.ok) {
    return createSkippedResult(configInput, ["BIM_SMOKE_PROJECT_ID"], stateResult, derivedConfig);
  }

  const plan = createBimSmokeConfigPlan(configInput, sessionResult.json, stateResult.json);
  if (!plan.ok) {
    return {
      ok: false,
      status: plan.status,
      dryRun,
      wroteFile: false,
      baseUrl: configInput.baseUrl,
      derivedConfig: derivedConfig.summary,
      missing: plan.missing,
      warnings: plan.warnings,
      selectedProject: plan.selectedProject,
      requestedBy: plan.requestedBy,
      session: plan.session,
      nextCommand: buildSetupCommand(plan),
    };
  }

  const patch = createBimLocalEnvPatch({
    envText: currentEnvText,
    runtimeEnv: derivedConfig.env,
    explicitEnv: {
      ...explicitValues,
      ...plan.explicitEnv,
    },
  });
  if (patch.changed && !dryRun) {
    fs.writeFileSync(envPath, patch.nextText, "utf8");
  }

  return {
    ok: true,
    status: "ready",
    dryRun,
    envPath,
    wroteFile: patch.changed && !dryRun,
    baseUrl: configInput.baseUrl,
    derivedConfig: derivedConfig.summary,
    selectedProject: plan.selectedProject,
    requestedBy: plan.requestedBy,
    session: plan.session,
    updatedKeys: patch.redactedSummary.updatedKeys,
    derivedKeys: patch.redactedSummary.derivedKeys,
    explicitKeys: patch.redactedSummary.explicitKeys,
    nextCommands: [
      "npm run bim:api-smoke",
      "npm run bim:bridge-smoke",
      "npm run bim:bridge-e2e-smoke",
      "npm run bim:active-revit-e2e",
      "npm run bim:readiness",
    ],
  };
}

async function requestJson(baseUrl, relativePath, cookieHeader) {
  const endpoint = new URL(relativePath, baseUrl);
  try {
    const response = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "Cookie": cookieHeader,
      },
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return {
      ok: response.ok,
      statusCode: response.status,
      endpoint: endpoint.toString(),
      json,
      error: response.ok ? "" : String(json.error || json.raw || `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      endpoint: endpoint.toString(),
      json: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createSkippedResult(configInput, missing, requestResult = null, derivedConfig = { summary: {} }) {
  return {
    ok: false,
    status: "needs-config",
    dryRun,
    wroteFile: false,
    baseUrl: configInput.baseUrl,
    derivedConfig: derivedConfig.summary,
    missing,
    request: requestResult
      ? {
        endpoint: requestResult.endpoint,
        statusCode: requestResult.statusCode,
        error: requestResult.error,
      }
      : null,
    nextCommand: buildSetupCommand({
      selectedProject: configInput.projectId ? { id: configInput.projectId } : null,
      requestedBy: configInput.requestedBy,
    }),
  };
}

function buildSetupCommand(plan) {
  const projectArg = plan.selectedProject?.id || "<projectId>";
  const requestedByArg = plan.requestedBy || "<email>";
  return `npm run bim:setup-local -- --smoke-project-id ${projectArg} --smoke-session-cookie <cookie> --smoke-user-email ${requestedByArg}`;
}

function parseExplicitArgs(argvInput) {
  const explicit = {};
  const flagMap = new Map([
    ["--base-url", "BIM_SMOKE_BASE_URL"],
    ["--session-cookie", "BIM_SMOKE_SESSION_COOKIE"],
    ["--project-id", "BIM_SMOKE_PROJECT_ID"],
    ["--requested-by", "BIM_SMOKE_USER_EMAIL"],
  ]);
  argvInput.forEach((entry, index) => {
    const [flag, inlineValue] = splitFlagValue(entry);
    const envKey = flagMap.get(flag);
    if (!envKey) {
      return;
    }
    const value = inlineValue !== null ? inlineValue : argvInput[index + 1];
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

function loadLocalEnv(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return;
  }
  const content = fs.readFileSync(envFilePath, "utf8");
  const parsed = parseEnvText(content);
  Object.entries(parsed.values).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}
