import {
  BIM_JOB_STALE_ACTIVE_STATUSES,
  normalizeBimJobStaleMinutes,
} from "./bim-job-stale-domain.mjs";
import {
  isBimArtifactRedirectHostAllowed,
  parseBimArtifactAllowedRedirectHosts,
} from "./bim-artifact-domain.mjs";

export function createBackendBimReadinessSnapshot(env = {}, context = {}) {
  const providerId = normalizeProviderId(env.BIM_WORKER_PROVIDER);
  const bridgeApiKeyConfigured = hasValue(env.REVIT_INGEST_API_KEY);
  const workerApiKeyConfigured = hasValue(env.BIM_WORKER_API_KEY) || bridgeApiKeyConfigured;
  const apsMissing = getApsMissingConfig(env);
  const artifactRedirectHosts = parseBimArtifactAllowedRedirectHosts(env.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS);
  const apsProviderCheck = summarizeApsProviderCheckContract(env, providerId, artifactRedirectHosts);
  const artifactMissing = getArtifactRedirectMissing(providerId, artifactRedirectHosts, apsProviderCheck);
  const checks = [
    createCheck({
      id: "active-revit-bridge-api-key",
      label: "API key para Revit Bridge",
      missing: bridgeApiKeyConfigured ? [] : ["REVIT_INGEST_API_KEY"],
      commands: bridgeApiKeyConfigured ? [] : ["npm run bim:setup-local -- --generate-bridge-key"],
      details: {
        configured: bridgeApiKeyConfigured,
        acceptedHeaders: ["X-Itemicostos-Key", "X-Api-Key", "Authorization: Bearer"],
      },
    }),
    createCheck({
      id: "cloud-worker-claim",
      label: "Worker cloud puede reclamar jobs",
      missing: workerApiKeyConfigured ? [] : ["BIM_WORKER_API_KEY or REVIT_INGEST_API_KEY"],
      commands: workerApiKeyConfigured ? [] : ["npm run bim:setup-local -- --generate-bridge-key"],
      details: {
        configured: workerApiKeyConfigured,
        providerId,
        commandType: normalizeCommandType(env.BIM_WORKER_COMMAND_TYPE || "cloud-model-analysis"),
        pollMs: clampInteger(env.BIM_WORKER_POLL_MS, 500, 60000, 5000),
        errorBackoffMaxMs: clampInteger(env.BIM_WORKER_ERROR_BACKOFF_MAX_MS, 500, 15 * 60 * 1000, 300000),
      },
    }),
    createCheck({
      id: "aps-design-automation",
      label: "APS Design Automation real",
      missing: apsMissing,
      optional: providerId !== "aps-design-automation",
      commands: createApsReadinessCommands(env, apsMissing),
      details: {
        providerId,
        clientIdConfigured: hasValue(env.BIM_APS_CLIENT_ID),
        clientSecretConfigured: hasValue(env.BIM_APS_CLIENT_SECRET),
        activityIdConfigured: hasValue(env.BIM_APS_ACTIVITY_ID),
        baseUrl: normalizeBaseUrl(env.BIM_APS_BASE_URL || "https://developer.api.autodesk.com/da/us-east/v3"),
        tokenUrl: String(env.BIM_APS_TOKEN_URL || "https://developer.api.autodesk.com/authentication/v2/token").trim(),
        scopesConfigured: hasValue(env.BIM_APS_SCOPES),
        pollMs: clampInteger(env.BIM_APS_POLL_MS, 2000, 600000, 10000),
        timeoutMs: clampInteger(env.BIM_APS_TIMEOUT_MS, 2000, 24 * 60 * 60 * 1000, 3600000),
      },
    }),
    createCheck({
      id: "bim-sse",
      label: "SSE progreso BIM",
      missing: [],
      details: {
        pollMs: clampInteger(env.BIM_JOB_SSE_POLL_MS, 500, 30000, 1500),
        retryMs: clampInteger(env.BIM_JOB_SSE_RETRY_MS, 1000, 60000, 3000),
        activeStatuses: ["queued", "claimed", "running", "applying"],
      },
    }),
    createCheck({
      id: "bim-stale-sweep",
      label: "Heartbeat jobs BIM",
      missing: [],
      details: {
        staleMinutes: normalizeBimJobStaleMinutes(env.BIM_JOB_STALE_MINUTES),
        sweepIntervalMs: clampInteger(env.BIM_JOB_SWEEP_INTERVAL_MS, 10000, 3600000, 60000),
        activeStatuses: BIM_JOB_STALE_ACTIVE_STATUSES,
        terminalAction: "failed",
      },
    }),
    createCheck({
      id: "bim-artifacts",
      label: "Artefactos BIM",
      missing: artifactMissing,
      optional: providerId !== "aps-design-automation",
      commands: artifactMissing.length > 0 ? createApsArtifactRedirectCommands(apsProviderCheck.details) : [],
      details: {
        storageDirConfigured: hasValue(env.BIM_ARTIFACT_STORAGE_DIR),
        maxBytes: clampInteger(env.BIM_ARTIFACT_MAX_BYTES, 1024, 50 * 1024 * 1024, 5 * 1024 * 1024),
        remoteRedirectHostsConfigured: artifactRedirectHosts.length > 0,
        allowedRedirectHostCount: artifactRedirectHosts.length,
        apsCheckOutputHost: apsProviderCheck.details.outputHost,
        apsCheckOutputHostAllowed: apsProviderCheck.details.outputHostAllowed,
      },
    }),
    createCheck({
      id: "aps-provider-check-contract",
      label: "Contrato APS input/output de preflight",
      missing: apsProviderCheck.missing,
      optional: providerId !== "aps-design-automation",
      commands: createApsProviderCheckCommands(apsProviderCheck.missing, apsProviderCheck.details),
      details: apsProviderCheck.details,
    }),
  ];
  const requiredChecks = checks.filter((check) => !check.optional);
  const blockingChecks = requiredChecks.filter((check) => check.status !== "ready");
  const missing = uniqueStrings(checks.flatMap((check) => check.missing));
  const apsLiveReady = apsMissing.length === 0;
  const activeRevitBridgeReady = bridgeApiKeyConfigured;
  const artifactDownloadsReady = artifactMissing.length === 0;
  const apsProviderCheckReady = apsProviderCheck.missing.length === 0;
  const cloudWorkerReady = workerApiKeyConfigured
    && (providerId !== "aps-design-automation" || (apsLiveReady && artifactDownloadsReady && apsProviderCheckReady));

  return {
    ok: blockingChecks.length === 0,
    status: blockingChecks.length === 0 ? "ready" : "needs-config",
    providerId,
    baseUrl: normalizeBaseUrl(context.baseUrl || resolveDefaultBackendBaseUrl(env)),
    storage: {
      kind: String(context.storageKind || "").trim(),
      label: String(context.storageLabel || "").trim(),
    },
    activeRevitBridgeReady,
    cloudWorkerReady,
    apsLiveReady,
    artifactDownloadsReady,
    apsProviderCheckReady,
    readyForRealValidation: activeRevitBridgeReady && apsLiveReady && artifactDownloadsReady && apsProviderCheckReady,
    missing,
    checks,
    nextCommands: createNextCommands(checks),
  };
}

function createCheck(input) {
  const missing = uniqueStrings(input.missing);
  const optional = Boolean(input.optional);
  return {
    id: input.id,
    label: input.label,
    status: missing.length === 0 ? "ready" : (optional ? "optional-missing-config" : "missing-config"),
    optional,
    missing,
    commands: Array.isArray(input.commands) ? input.commands : [],
    details: input.details && typeof input.details === "object" ? input.details : {},
  };
}

function createNextCommands(checks) {
  return checks
    .filter((check) => check.status !== "ready")
    .flatMap((check) => check.commands)
    .filter(Boolean)
    .filter((command, index, commands) => commands.indexOf(command) === index);
}

function createApsReadinessCommands(env, missing) {
  const clientIdConfigured = hasValue(env.BIM_APS_CLIENT_ID);
  const clientSecretConfigured = hasValue(env.BIM_APS_CLIENT_SECRET);
  if (missing.includes("BIM_APS_ACTIVITY_ID") && clientIdConfigured && clientSecretConfigured) {
    return ["npm run worker:bim:list-activities"];
  }
  return [];
}

function createApsProviderCheckCommands(missing, details = {}) {
  if (!Array.isArray(missing) || missing.length === 0) {
    return ["npm run worker:bim:check"];
  }
  if (
    missing.includes("BIM_APS_CHECK_INPUT_URL")
    || missing.includes("BIM_APS_CHECK_INPUT_URL_HTTPS")
    || missing.includes("BIM_APS_CHECK_OUTPUT_URL")
    || missing.includes("BIM_APS_CHECK_OUTPUT_URL_HTTPS")
  ) {
    return ["npm --silent run bim:setup-local -- --aps-check-input-url <inputUrl> --aps-check-output-url <outputUrl>"];
  }
  if (missing.includes("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS includes BIM_APS_CHECK_OUTPUT_URL host")) {
    return createApsArtifactRedirectCommands(details);
  }
  return ["npm run worker:bim:check"];
}

function createApsArtifactRedirectCommands(details = {}) {
  const host = String(details.outputHost || "").trim();
  return [`npm run bim:setup-local -- --artifact-redirect-hosts ${host || "<host>"}`];
}

function getApsMissingConfig(env) {
  const missing = [];
  if (!hasValue(env.BIM_APS_CLIENT_ID)) {
    missing.push("BIM_APS_CLIENT_ID");
  }
  if (!hasValue(env.BIM_APS_CLIENT_SECRET)) {
    missing.push("BIM_APS_CLIENT_SECRET");
  }
  if (!hasValue(env.BIM_APS_ACTIVITY_ID)) {
    missing.push("BIM_APS_ACTIVITY_ID");
  }
  return missing;
}

function summarizeApsProviderCheckContract(env, providerId, artifactRedirectHosts) {
  const required = providerId === "aps-design-automation";
  const input = summarizeApsCheckUrl(env.BIM_APS_CHECK_INPUT_URL);
  const output = summarizeApsCheckUrl(env.BIM_APS_CHECK_OUTPUT_URL);
  const outputHostAllowed = Boolean(output.host && isBimArtifactRedirectHostAllowed(output.host, artifactRedirectHosts));
  const missing = [];

  if (required) {
    if (!input.configured) {
      missing.push("BIM_APS_CHECK_INPUT_URL");
    } else if (!input.https) {
      missing.push("BIM_APS_CHECK_INPUT_URL_HTTPS");
    }
    if (!output.configured) {
      missing.push("BIM_APS_CHECK_OUTPUT_URL");
    } else if (!output.https) {
      missing.push("BIM_APS_CHECK_OUTPUT_URL_HTTPS");
    }
    if (output.https && artifactRedirectHosts.length > 0 && !outputHostAllowed) {
      missing.push("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS includes BIM_APS_CHECK_OUTPUT_URL host");
    }
  }

  return {
    missing,
    details: {
      providerId,
      inputUrlConfigured: input.configured,
      inputUrlHttps: input.https,
      inputHost: input.host,
      outputUrlConfigured: output.configured,
      outputUrlHttps: output.https,
      outputHost: output.host,
      outputHostAllowed,
    },
  };
}

function getArtifactRedirectMissing(providerId, artifactRedirectHosts, apsProviderCheck) {
  if (providerId !== "aps-design-automation") {
    return [];
  }
  if (artifactRedirectHosts.length === 0) {
    return ["BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS"];
  }
  return apsProviderCheck.missing.includes("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS includes BIM_APS_CHECK_OUTPUT_URL host")
    ? ["BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS includes BIM_APS_CHECK_OUTPUT_URL host"]
    : [];
}

function summarizeApsCheckUrl(value) {
  const configured = hasValue(value);
  if (!configured) {
    return {
      configured: false,
      https: false,
      host: "",
    };
  }
  try {
    const url = new URL(String(value).trim());
    return {
      configured: true,
      https: url.protocol === "https:",
      host: url.protocol === "https:" ? url.hostname.toLowerCase() : "",
    };
  } catch {
    return {
      configured: true,
      https: false,
      host: "",
    };
  }
}

function normalizeProviderId(value) {
  const providerId = String(value || "simulated-aps").trim().toLowerCase();
  return providerId === "aps-design-automation" ? providerId : "simulated-aps";
}

function normalizeCommandType(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "cloud-model-analysis";
}

function resolveDefaultBackendBaseUrl(env) {
  const port = String(env.PORT || "5500").trim() || "5500";
  return `http://127.0.0.1:${port}/`;
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.endsWith("/") ? text : `${text}/`;
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function uniqueStrings(values) {
  return Array.from(new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}
