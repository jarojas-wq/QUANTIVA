import {
  getBimApiSmokeMissingConfig,
  normalizeBimApiSmokeConfig,
} from "./bim-api-smoke-domain.mjs";
import {
  getBimBridgeE2eSmokeMissingConfig,
  normalizeBimBridgeE2eSmokeConfig,
} from "./bim-bridge-e2e-smoke-domain.mjs";
import {
  getBimBridgeSmokeMissingConfig,
  normalizeBimBridgeSmokeConfig,
} from "./bim-bridge-smoke-domain.mjs";
import {
  normalizeApsDesignAutomationConfig,
} from "./aps-design-automation-client.mjs";
import {
  isBimArtifactRedirectHostAllowed,
  parseBimArtifactAllowedRedirectHosts,
} from "../src/application/budget/bim-artifact-domain.mjs";

const REQUIRED_BIM_FLUENCY_CHECK_IDS = [
  "cloud-worker-load",
  "web-realtime-load",
  "revit-batch-plan",
  "revit-bridge-backoff",
  "revit-cancellation-probe",
  "revit-transaction-failure",
];

export function createBimReadinessReport(env = {}, context = {}) {
  const derivedEnv = createBimReadinessDerivedEnv(env, context);
  const effectiveEnv = derivedEnv.env;
  const apiSmokeConfig = normalizeBimApiSmokeConfig(effectiveEnv);
  const bridgeSmokeConfig = normalizeBimBridgeSmokeConfig(effectiveEnv);
  const bridgeE2eConfig = normalizeBimBridgeE2eSmokeConfig(effectiveEnv);
  const apsConfig = normalizeApsFromEnv(effectiveEnv);
  const apiSmokeMissing = getBimApiSmokeMissingConfig(apiSmokeConfig);
  const bridgeSmokeMissing = getBridgeSmokeReadinessMissing(bridgeSmokeConfig);
  const bridgeE2eMissing = getBimBridgeE2eSmokeMissingConfig(bridgeE2eConfig);
  const cloudWorkerMissing = getCloudWorkerMissingConfig(effectiveEnv);
  const apsMissing = getApsMissingConfig(apsConfig);
  const revitBridgeSettings = summarizeRevitBridgeLocalSettings(effectiveEnv, context.revitBridgeSettings);
  const fluencyGate = summarizeBimFluencyGate(context.fluencyReport);
  const revitBridgeMissing = revitBridgeSettings.checked ? revitBridgeSettings.missing : [];
  const providerId = normalizeProviderId(effectiveEnv.BIM_WORKER_PROVIDER);
  const artifactRedirectHosts = parseBimArtifactAllowedRedirectHosts(effectiveEnv.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS);
  const apsProviderCheck = summarizeApsProviderCheckContract(effectiveEnv, providerId, artifactRedirectHosts);
  const artifactRedirectMissing = getArtifactRedirectMissing(providerId, artifactRedirectHosts, apsProviderCheck);
  const checks = [
    createCheck({
      id: "local-probes",
      label: "Probes locales sin credenciales",
      missing: [],
      commands: [
        "npm run bim:fluency-check",
        "npm run bim:realtime-load-test",
        "npm run worker:bim:load-test",
        "npm run worker:bim:check",
      ],
      details: {
        backendRequired: false,
        revitRequired: false,
        dotnetRequiredForFullGate: true,
        apsRequired: false,
      },
    }),
    createBimFluencyGateCheck(fluencyGate),
    createCheck({
      id: "api-smoke",
      label: "Smoke web/API de cola BIM",
      missing: apiSmokeMissing,
      commands: apiSmokeMissing.length > 0
        ? ["npm run bim:prepare-smoke -- --session-cookie <cookie>"]
        : ["npm run bim:api-smoke"],
      details: {
        baseUrl: apiSmokeConfig.baseUrl,
        projectIdConfigured: Boolean(apiSmokeConfig.projectId),
        sessionCookieConfigured: Boolean(apiSmokeConfig.sessionCookie),
      },
    }),
    createCheck({
      id: "cloud-worker-claim",
      label: "Worker/bridge puede reclamar jobs",
      missing: cloudWorkerMissing,
      commands: ["npm run worker:bim:once"],
      details: {
        providerId,
        workerApiKeyConfigured: Boolean(env.BIM_WORKER_API_KEY || env.REVIT_INGEST_API_KEY),
      },
    }),
    createCheck({
      id: "bridge-smoke",
      label: "Contrato bridge con API key",
      missing: bridgeSmokeMissing,
      commands: bridgeSmokeMissing.includes("BIM_BRIDGE_SMOKE_PROJECT_ID")
        || bridgeSmokeMissing.includes("BIM_BRIDGE_SMOKE_SESSION_COOKIE")
        ? ["npm run bim:prepare-smoke -- --session-cookie <cookie>"]
        : ["npm run bim:bridge-smoke"],
      details: {
        baseUrl: bridgeSmokeConfig.baseUrl,
        projectIdConfigured: Boolean(bridgeSmokeConfig.projectId),
        sessionCookieConfigured: Boolean(bridgeSmokeConfig.sessionCookie),
        createsOwnJob: Boolean(bridgeSmokeConfig.createJob),
        queueOnlyWithoutSession: !bridgeSmokeConfig.sessionCookie && !bridgeSmokeConfig.createJob,
        targetMode: bridgeSmokeConfig.targetMode,
        commandType: bridgeSmokeConfig.commandType,
      },
    }),
    createCheck({
      id: "active-revit-e2e-smoke",
      label: "E2E Revit activo con sesion web y API key",
      missing: bridgeE2eMissing,
      commands: createBridgeE2eReadinessCommands(bridgeE2eMissing),
      details: {
        baseUrl: bridgeE2eConfig.baseUrl,
        projectIdConfigured: Boolean(bridgeE2eConfig.projectId),
        sessionCookieConfigured: Boolean(bridgeE2eConfig.sessionCookie),
        apiKeyConfigured: Boolean(bridgeE2eConfig.apiKey),
        requestedByConfigured: Boolean(bridgeE2eConfig.requestedBy),
        requestedBy: bridgeE2eConfig.requestedBy,
        modelGuid: bridgeE2eConfig.modelIdentity.modelGuid,
        documentUid: bridgeE2eConfig.modelIdentity.documentUid,
        modelPath: bridgeE2eConfig.modelIdentity.modelPath,
        documentVersion: bridgeE2eConfig.modelIdentity.documentVersion,
      },
    }),
    createCheck({
      id: "revit-bridge-local-settings",
      label: "Configuracion local Revit Bridge",
      missing: revitBridgeMissing,
      optional: !revitBridgeSettings.checked,
      commands: revitBridgeMissing.length > 0
        ? ["powershell -NoProfile -ExecutionPolicy Bypass -File ..\\REVIT-MODEL-AUDITOR\\tools\\sync-itemicostos-bridge-key.ps1"]
        : [],
      details: revitBridgeSettings.details,
    }),
    createCheck({
      id: "bim-artifact-downloads",
      label: "Descarga segura de artefactos BIM",
      missing: artifactRedirectMissing,
      optional: providerId !== "aps-design-automation",
      commands: artifactRedirectMissing.length > 0
        ? createApsArtifactRedirectCommands(apsProviderCheck.details)
        : [],
      details: {
        providerId,
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
      commands: createApsProviderCheckCommands(apsProviderCheck.missing, apsProviderCheck.details),
      optional: providerId !== "aps-design-automation",
      details: apsProviderCheck.details,
    }),
    createCheck({
      id: "aps-design-automation",
      label: "APS Design Automation real",
      missing: apsMissing,
      commands: createApsReadinessCommands(apsConfig, apsMissing),
      optional: providerId !== "aps-design-automation",
      details: {
        providerId,
        tokenUrl: apsConfig.tokenUrl,
        baseUrl: apsConfig.baseUrl,
        activityIdConfigured: Boolean(apsConfig.activityId),
        clientIdConfigured: Boolean(apsConfig.clientId),
        clientSecretConfigured: Boolean(apsConfig.clientSecret),
        pollMs: apsConfig.pollMs,
        timeoutMs: apsConfig.timeoutMs,
      },
    }),
  ];
  const requiredChecks = checks.filter((check) => !check.optional);
  const blockingChecks = requiredChecks.filter((check) => check.status !== "ready");
  const missing = uniqueStrings(checks.flatMap((check) => check.missing));
  const revitBridgeLocalSettingsReady = !revitBridgeSettings.checked || revitBridgeMissing.length === 0;
  const activeRevitE2eReady = bridgeE2eMissing.length === 0 && revitBridgeLocalSettingsReady;
  const apsLiveReady = apsMissing.length === 0;
  const artifactDownloadsReady = artifactRedirectMissing.length === 0;
  const apsProviderCheckReady = apsProviderCheck.missing.length === 0;
  const localFluencyReady = fluencyGate.ok;
  const readyForRealValidation = activeRevitE2eReady
    && apsLiveReady
    && artifactDownloadsReady
    && apsProviderCheckReady
    && localFluencyReady;

  return {
    ok: blockingChecks.length === 0,
    status: readyForRealValidation ? "ready" : "needs-config",
    baseUrl: apiSmokeConfig.baseUrl,
    providerId,
    derivedConfig: derivedEnv.summary,
    readyForRealValidation,
    activeRevitE2eReady,
    apsLiveReady,
    artifactDownloadsReady,
    apsProviderCheckReady,
    localFluencyReady,
    cloudWorkerReady: cloudWorkerMissing.length === 0,
    revitBridgeLocalSettingsReady,
    apiSmokeReady: apiSmokeMissing.length === 0,
    bridgeSmokeReady: bridgeSmokeMissing.length === 0,
    missing,
    checks,
    nextCommands: createNextCommands(checks),
  };
}

export function createBimReadinessDerivedEnv(env = {}, context = {}) {
  const effectiveEnv = { ...env };
  const settingsProjectUid = normalizeProjectId(context?.revitBridgeSettings?.settings?.projectUid);
  const bridgePresence = resolveActiveBridgePresence(context);
  const bridgeModelIdentity = bridgePresence.latestModelIdentity || {};
  const hasProjectId = Boolean(normalizeProjectId(
    effectiveEnv.BIM_SMOKE_PROJECT_ID
      || effectiveEnv.PROJECT_ID
      || effectiveEnv.BIM_BRIDGE_SMOKE_PROJECT_ID
      || effectiveEnv.BIM_BRIDGE_E2E_SMOKE_PROJECT_ID,
  ));
  const hasBridgeE2eRequestedBy = Boolean(normalizeEmail(
    effectiveEnv.BIM_BRIDGE_E2E_REQUESTED_BY
      || effectiveEnv.BIM_BRIDGE_E2E_SMOKE_REQUESTED_BY
      || effectiveEnv.BIM_BRIDGE_REQUESTED_BY
      || effectiveEnv.BIM_SMOKE_USER_EMAIL,
  ));

  if (settingsProjectUid && !hasProjectId) {
    effectiveEnv.BIM_SMOKE_PROJECT_ID = settingsProjectUid;
    effectiveEnv.BIM_BRIDGE_SMOKE_PROJECT_ID = settingsProjectUid;
    effectiveEnv.BIM_BRIDGE_E2E_SMOKE_PROJECT_ID = settingsProjectUid;
  }

  const derivedBridgeRequestedBy = bridgePresence.online && bridgePresence.latestRequestedBy && !hasBridgeE2eRequestedBy;
  if (derivedBridgeRequestedBy) {
    effectiveEnv.BIM_BRIDGE_E2E_REQUESTED_BY = bridgePresence.latestRequestedBy;
  }

  const derivedModelIdentityKeys = deriveBridgeModelIdentityEnv(effectiveEnv, bridgePresence.online ? bridgeModelIdentity : {});
  Object.entries(derivedModelIdentityKeys).forEach(([key, value]) => {
    effectiveEnv[key] = value;
  });

  return {
    env: effectiveEnv,
    summary: {
      projectId: settingsProjectUid && !hasProjectId ? settingsProjectUid : "",
      projectIdSource: settingsProjectUid && !hasProjectId ? "revit-bridge-settings.projectUid" : "",
      bridgeE2eRequestedBySource: derivedBridgeRequestedBy ? "active-revit-bridge.latestRequestedBy" : "",
      bridgeE2eModelIdentitySource: Object.keys(derivedModelIdentityKeys).length > 0
        ? "active-revit-bridge.latestModelIdentity"
        : "",
    },
  };
}

export function createBimReadinessRuntimeReport(report = {}, backendHealth = {}, options = {}) {
  const checkHealth = options.checkHealth !== false;
  const checkBridgeQueue = options.checkBridgeQueue !== false;
  const backendHealthReady = !checkHealth || backendHealth?.ok === true;
  const healthCheck = createCheck({
    id: "backend-health",
    label: "Backend Itemicostos disponible",
    missing: backendHealthReady ? [] : ["ITEMICOSTOS_BACKEND_HEALTH"],
    commands: backendHealthReady ? [] : ["npm run server"],
    details: summarizeBackendHealth(backendHealth, checkHealth),
  });
  const checks = checkHealth
      ? [...(Array.isArray(report.checks) ? report.checks : []), healthCheck]
      : (Array.isArray(report.checks) ? report.checks : []);
  const bridgeQueueCheck = checkBridgeQueue
    ? createBridgeQueueRuntimeCheck(options.bridgeQueueSummary)
    : null;
  const bridgePresenceCheck = checkBridgeQueue
    ? createBridgePresenceRuntimeCheck(options.bridgeQueueSummary)
    : null;
  const bridgeClaimCheck = checkBridgeQueue
    ? createBridgeClaimRuntimeCheck(options.bridgeQueueSummary)
    : null;
  const revitLocalSessionCheck = createRevitLocalSessionRuntimeCheck(options.revitLocalSession);
  const checksWithBridgeQueue = [
    ...checks,
    ...(revitLocalSessionCheck ? [revitLocalSessionCheck] : []),
    ...(bridgePresenceCheck ? [bridgePresenceCheck] : []),
    ...(bridgeClaimCheck ? [bridgeClaimCheck] : []),
    ...(bridgeQueueCheck ? [bridgeQueueCheck] : []),
  ];
  const missing = uniqueStrings([
    ...(Array.isArray(report.missing) ? report.missing : []),
    ...(backendHealthReady ? [] : ["ITEMICOSTOS_BACKEND_HEALTH"]),
    ...(revitLocalSessionCheck ? revitLocalSessionCheck.missing : []),
    ...(bridgePresenceCheck ? bridgePresenceCheck.missing : []),
    ...(bridgeClaimCheck ? bridgeClaimCheck.missing : []),
    ...(bridgeQueueCheck ? bridgeQueueCheck.missing : []),
  ]);
  const nextCommands = uniqueStrings([
    ...(Array.isArray(report.nextCommands) ? report.nextCommands : []),
    ...(backendHealthReady ? [] : ["npm run server"]),
    ...(revitLocalSessionCheck && revitLocalSessionCheck.status !== "ready" ? revitLocalSessionCheck.commands : []),
    ...(bridgePresenceCheck && bridgePresenceCheck.status !== "ready" ? bridgePresenceCheck.commands : []),
    ...(bridgeClaimCheck && bridgeClaimCheck.status !== "ready" ? bridgeClaimCheck.commands : []),
    ...(bridgeQueueCheck && bridgeQueueCheck.status !== "ready" ? bridgeQueueCheck.commands : []),
  ]);
  const requiredChecks = checksWithBridgeQueue.filter((check) => !check.optional);
  const blockingChecks = requiredChecks.filter((check) => check.status !== "ready");
  const readyForRealValidation = Boolean(report.readyForRealValidation)
    && backendHealthReady
    && blockingChecks.length === 0;

  return {
    ...report,
    backendHealth,
    backendHealthReady,
    ok: Boolean(report.ok) && backendHealthReady && blockingChecks.length === 0,
    status: readyForRealValidation ? "ready" : "needs-config",
    readyForRealValidation,
    missing,
    checks: checksWithBridgeQueue,
    nextCommands,
  };
}

function resolveActiveBridgePresence(context = {}) {
  const bridgeQueueSummary = context?.bridgeQueueSummary && typeof context.bridgeQueueSummary === "object"
    ? context.bridgeQueueSummary
    : {};
  const rawSummary = bridgeQueueSummary.summary && typeof bridgeQueueSummary.summary === "object"
    ? bridgeQueueSummary.summary
    : bridgeQueueSummary;
  return normalizeBridgeQueueSummary(rawSummary).bridgePresence;
}

function deriveBridgeModelIdentityEnv(env = {}, identity = {}) {
  const source = identity && typeof identity === "object" && !Array.isArray(identity) ? identity : {};
  const mappings = [
    ["BIM_BRIDGE_E2E_SMOKE_MODEL_GUID", source.modelGuid],
    ["BIM_BRIDGE_E2E_SMOKE_DOCUMENT_UID", source.documentUid],
    ["BIM_BRIDGE_E2E_SMOKE_MODEL_PATH", source.modelPath],
    ["BIM_BRIDGE_E2E_SMOKE_DOCUMENT_VERSION", source.documentVersion],
  ];
  return Object.fromEntries(
    mappings
      .filter(([key, value]) => !String(env[key] || "").trim() && String(value || "").trim())
      .map(([key, value]) => [key, String(value).trim()]),
  );
}

export function summarizeRevitBridgeLocalSettings(env = {}, input = {}) {
  const checked = Boolean(input?.checked);
  const path = String(input?.path || "").trim();
  const exists = Boolean(input?.exists);
  const readError = String(input?.readError || "").trim();
  const settings = input?.settings && typeof input.settings === "object" ? input.settings : {};
  const web = settings.web && typeof settings.web === "object" ? settings.web : {};
  const expectedApiKey = String(env.REVIT_INGEST_API_KEY || env.BIM_WORKER_API_KEY || "").trim();
  const actualApiKey = String(web.ingestApiKey || "").trim();
  const expectedBaseUrl = normalizeBaseUrl(env.BIM_WORKER_BASE_URL || env.WEB_BASE_URL || resolveDefaultBackendBaseUrl(env));
  const actualBaseUrl = normalizeBaseUrl(web.baseUrl || "");
  const autoClaimBimJobs = Boolean(web.autoClaimBimJobs);
  const bimJobPollSeconds = Number.parseInt(String(web.bimJobPollSeconds || "0"), 10);
  const projectUid = normalizeProjectId(settings.projectUid);
  const missing = [];

  if (checked && !exists) {
    missing.push("REVIT_BRIDGE_SETTINGS_FILE");
  }
  if (checked && readError) {
    missing.push("REVIT_BRIDGE_SETTINGS_JSON");
  }
  if (checked && exists && !readError && !actualApiKey) {
    missing.push("web.ingestApiKey");
  }
  if (checked && exists && !readError && expectedApiKey && actualApiKey && actualApiKey !== expectedApiKey) {
    missing.push("web.ingestApiKey matches REVIT_INGEST_API_KEY");
  }
  if (checked && exists && !readError && actualBaseUrl !== expectedBaseUrl) {
    missing.push("web.baseUrl matches backend");
  }
  if (checked && exists && !readError && !autoClaimBimJobs) {
    missing.push("web.autoClaimBimJobs");
  }

  return {
    checked,
    missing,
    details: {
      checked,
      path,
      exists,
      readError: readError ? "No se pudo leer JSON de configuracion." : "",
      expectedApiKeyConfigured: Boolean(expectedApiKey),
      apiKeyConfigured: Boolean(actualApiKey),
      apiKeyMatches: Boolean(expectedApiKey && actualApiKey && actualApiKey === expectedApiKey),
      expectedBaseUrl,
      baseUrl: actualBaseUrl,
      baseUrlMatches: actualBaseUrl === expectedBaseUrl,
      autoClaimBimJobs,
      bimJobPollSeconds: Number.isFinite(bimJobPollSeconds) ? bimJobPollSeconds : 0,
      projectUid,
      projectUidConfigured: Boolean(projectUid),
    },
  };
}

export function summarizeBimFluencyGate(input = {}) {
  const checked = input?.checked !== false;
  const path = String(input?.path || "").trim();
  const exists = Boolean(input?.exists);
  const readError = String(input?.readError || "").trim();
  const report = input?.report && typeof input.report === "object" ? input.report : {};
  const generatedAt = normalizeDateOrEmpty(report.generatedAt);
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : 0;
  const ageSeconds = generatedAtMs > 0 ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 1000)) : 0;
  const checksSummary = summarizeBimFluencyReportChecks(report.checks);
  const requiredChecksReady = checksSummary.missingRequiredCheckIds.length === 0
    && checksSummary.failedRequiredCheckIds.length === 0;
  const ok = checked && exists && !readError && report.ok === true && requiredChecksReady;
  const status = !checked
    ? "not-checked"
    : !exists
      ? "missing-report"
      : readError
        ? "invalid-report"
        : report.ok !== true
          ? "failed"
          : !requiredChecksReady
            ? "incomplete-report"
            : "ready";

  return {
    checked,
    path,
    exists,
    ok,
    status,
    missing: resolveBimFluencyGateMissing(status),
    details: {
      checked,
      path,
      exists,
      status,
      ok,
      readError: readError ? "No se pudo leer JSON de fluidez BIM." : "",
      generatedAt,
      ageSeconds,
      summary: summarizeBimFluencyReportSummary(report.summary),
      checks: checksSummary,
    },
  };
}

function createBimFluencyGateCheck(fluencyGate) {
  return createCheck({
    id: "bim-fluency-gate",
    label: "Compuerta local de fluidez BIM",
    missing: fluencyGate.missing,
    optional: fluencyGate.status === "missing-report" || fluencyGate.status === "not-checked",
    commands: ["npm run bim:fluency-check"],
    details: fluencyGate.details,
  });
}

function resolveBimFluencyGateMissing(status) {
  if (status === "ready" || status === "not-checked") {
    return [];
  }
  if (status === "missing-report") {
    return ["BIM_FLUENCY_CHECK_REPORT"];
  }
  if (status === "invalid-report") {
    return ["BIM_FLUENCY_CHECK_REPORT_JSON"];
  }
  if (status === "incomplete-report") {
    return ["BIM_FLUENCY_CHECK_REQUIRED_CHECKS"];
  }
  return ["BIM_FLUENCY_CHECK_FAILED"];
}

function summarizeBimFluencyReportSummary(summary = {}) {
  const source = summary && typeof summary === "object" ? summary : {};
  return {
    checkCount: normalizeInteger(source.checkCount),
    failedCount: normalizeInteger(source.failedCount),
    totalSimulatedElements: normalizeInteger(source.totalSimulatedElements),
    realtimeEvents: normalizeInteger(source.realtimeEvents),
    realtimeRenderReductionPercent: normalizeNumber(source.realtimeRenderReductionPercent),
  };
}

function summarizeBimFluencyReportChecks(checks = []) {
  const normalizedChecks = Array.isArray(checks)
    ? checks.map((check) => ({
      id: String(check?.id || "").trim(),
      ok: check?.ok === true,
    })).filter((check) => check.id)
    : [];
  const checkIds = normalizedChecks.map((check) => check.id);
  const missingRequiredCheckIds = REQUIRED_BIM_FLUENCY_CHECK_IDS
    .filter((id) => !checkIds.includes(id));
  const failedRequiredCheckIds = REQUIRED_BIM_FLUENCY_CHECK_IDS
    .filter((id) => normalizedChecks.some((check) => check.id === id && !check.ok));

  return {
    requiredCheckIds: [...REQUIRED_BIM_FLUENCY_CHECK_IDS],
    checkIds,
    missingRequiredCheckIds,
    failedRequiredCheckIds,
  };
}

function summarizeBackendHealth(backendHealth = {}, checked = true) {
  return {
    checked: Boolean(checked),
    attempted: Boolean(backendHealth?.attempted),
    ok: Boolean(backendHealth?.ok),
    skipped: Boolean(backendHealth?.skipped),
    endpoint: String(backendHealth?.endpoint || ""),
    statusCode: Number.isFinite(Number(backendHealth?.statusCode))
      ? Number(backendHealth.statusCode)
      : 0,
    durationMs: Number.isFinite(Number(backendHealth?.durationMs))
      ? Number(backendHealth.durationMs)
      : 0,
    storage: String(backendHealth?.storage || ""),
    error: String(backendHealth?.error || ""),
  };
}

function createBridgeQueueRuntimeCheck(input = {}) {
  const summary = normalizeBridgeQueueSummary(input?.summary);
  const attempted = Boolean(input?.attempted);
  const skipped = Boolean(input?.skipped);
  const ok = Boolean(input?.ok);
  const wait = createBridgeQueueWaitDiagnostic(summary);
  const missing = [];
  if (attempted && !ok) {
    missing.push("ITEMICOSTOS_BRIDGE_QUEUE_SUMMARY");
  }
  if (attempted && ok && wait.requiresBridgeAttention) {
    missing.push(resolveBridgeQueueMissingCode(wait.reason));
  }

  return createCheck({
    id: "active-revit-queue-runtime",
    label: "Cola Revit activa",
    missing,
    optional: skipped,
    commands: wait.action
      ? [wait.action]
      : [],
    details: {
      checked: !skipped,
      attempted,
      skipped,
      ok,
      endpoint: String(input?.endpoint || ""),
      statusCode: normalizeInteger(input?.statusCode),
      error: String(input?.error || ""),
      projectId: String(input?.projectId || ""),
      activeRevitQueued: summary.activeRevitQueued,
      oldestActiveRevitQueuedAgeSeconds: summary.oldestActiveRevitQueuedAgeSeconds,
      bridgePresence: summary.bridgePresence,
      diagnostic: wait,
    },
  });
}

function createRevitLocalSessionRuntimeCheck(input) {
  if (!input || input.checked === false) {
    return null;
  }
  const attempted = input.attempted !== false;
  const skipped = Boolean(input.skipped);
  const ok = input.ok === true;
  const missing = attempted && !skipped
    ? uniqueStrings(input.missing || (ok ? [] : ["REVIT_LOCAL_SESSION_READY"]))
    : [];
  const status = String(input.status || "");

  return createCheck({
    id: "revit-local-session-runtime",
    label: "Sesion local Revit",
    missing,
    optional: skipped,
    commands: createRevitLocalSessionCommands(status, missing, input.version),
    details: {
      checked: !skipped,
      attempted,
      skipped,
      ok,
      status,
      version: String(input.version || ""),
      processCount: normalizeInteger(input.processCount),
      revitOpen: input.revitOpen === true,
      manifestPath: String(input.manifestPath || ""),
      manifestExists: input.manifestExists === true,
      manifestAssemblyPath: String(input.manifestAssemblyPath || ""),
      manifestAssemblyExists: input.manifestAssemblyExists === true,
      manifestAssemblyLastWriteTime: String(input.manifestAssemblyLastWriteTime || ""),
      loadedBridgeAddin: input.loadedBridgeAddin === true,
      loadedAssemblyMatchesManifest: input.loadedAssemblyMatchesManifest === true,
      loadedAddinModules: Array.isArray(input.loadedAddinModules) ? input.loadedAddinModules : [],
      message: String(input.message || ""),
      error: String(input.error || ""),
    },
  });
}

function createRevitLocalSessionCommands(status, missing, version) {
  if (missing.includes("REVIT_PROCESS_OPEN")) {
    return [`Abre Revit ${String(version || "2025")}.`];
  }
  if (missing.includes("REVIT_ADDIN_RESTART_REQUIRED")) {
    return [`Cierra y vuelve a abrir Revit ${String(version || "2025")}.`];
  }
  if (missing.includes("REVIT_ADDIN_MANIFEST") || missing.includes("REVIT_ADDIN_ASSEMBLY")) {
    return [`powershell -NoProfile -ExecutionPolicy Bypass -File ..\\REVIT-MODEL-AUDITOR\\installer\\install.ps1 -RevitVersion ${String(version || "2025")} -Configuration Debug -Scope CurrentUser`];
  }
  if (status && status !== "ready") {
    return ["npm run bim:revit-session"];
  }
  return [];
}

function createBridgePresenceRuntimeCheck(input = {}) {
  const summary = normalizeBridgeQueueSummary(input?.summary);
  const presence = summary.bridgePresence;
  const attempted = Boolean(input?.attempted);
  const skipped = Boolean(input?.skipped);
  const ok = Boolean(input?.ok);
  const missing = [];

  if (attempted && !ok) {
    missing.push("ITEMICOSTOS_BRIDGE_QUEUE_SUMMARY");
  }
  if (attempted && ok && !presence.online) {
    missing.push("ACTIVE_REVIT_BRIDGE_PRESENCE");
  }

  return createCheck({
    id: "active-revit-bridge-presence-runtime",
    label: "Presencia Revit Bridge",
    missing,
    optional: skipped,
    commands: [],
    details: {
      checked: !skipped,
      attempted,
      skipped,
      ok,
      endpoint: String(input?.endpoint || ""),
      statusCode: normalizeInteger(input?.statusCode),
      error: String(input?.error || ""),
      projectId: String(input?.projectId || ""),
      online: presence.online,
      onlineCount: presence.onlineCount,
      knownCount: presence.knownCount,
      ttlSeconds: presence.ttlSeconds,
      latestSeenAt: presence.latestSeenAt,
      latestSeenAgeSeconds: presence.latestSeenAgeSeconds,
      latestBridgeId: presence.latestBridgeId,
      latestRequestedBy: presence.latestRequestedBy,
      latestModelIdentity: presence.latestModelIdentity,
      latestDiagnostic: presence.latestDiagnostic,
    },
  });
}

function createBridgeClaimRuntimeCheck(input = {}) {
  const summary = normalizeBridgeQueueSummary(input?.summary);
  const presence = summary.bridgePresence;
  const diagnostic = presence.latestDiagnostic;
  const attempted = Boolean(input?.attempted);
  const skipped = Boolean(input?.skipped);
  const ok = Boolean(input?.ok);
  const missing = [];

  if (attempted && !ok) {
    missing.push("ITEMICOSTOS_BRIDGE_QUEUE_SUMMARY");
  }
  if (attempted && ok && presence.online && !diagnostic && !presence.latestRequestedBy) {
    missing.push("ACTIVE_REVIT_BRIDGE_CLAIM_DIAGNOSTIC");
  }
  if (attempted && ok && presence.online && diagnostic && !diagnostic.canClaim) {
    missing.push(...resolveBridgeClaimMissingCodes(diagnostic));
  }

  return createCheck({
    id: "active-revit-bridge-claim-runtime",
    label: "Revit puede reclamar jobs",
    missing,
    optional: skipped || !presence.online,
    commands: createBridgeClaimCommands(missing),
    details: {
      checked: !skipped,
      attempted,
      skipped,
      ok,
      projectId: String(input?.projectId || ""),
      bridgeOnline: presence.online,
      latestBridgeId: presence.latestBridgeId,
      latestRequestedBy: presence.latestRequestedBy,
      diagnostic,
    },
  });
}

function createBridgeQueueWaitDiagnostic(summary) {
  const waitingJobCount = normalizeInteger(summary.activeRevitQueued);
  const oldestWaitSeconds = normalizeInteger(summary.oldestActiveRevitQueuedAgeSeconds);
  const bridgeOnline = Boolean(summary.bridgePresence?.online);
  if (waitingJobCount <= 0) {
    return {
      tone: "ok",
      label: "Sin espera Revit",
      reason: "none",
      action: "",
      waitingJobCount: 0,
      oldestWaitSeconds: 0,
      requiresBridgeAttention: false,
    };
  }
  if (oldestWaitSeconds >= 600) {
    if (bridgeOnline) {
      return {
        tone: "critical",
        label: "Bridge activo sin tomar job",
        reason: "model-mismatch",
        action: "Abre el modelo Revit correcto o revisa modelGuid, documentUid y modelPath.",
        waitingJobCount,
        oldestWaitSeconds,
        requiresBridgeAttention: true,
      };
    }
    return {
      tone: "critical",
      label: "Revit cerrado o bridge detenido",
      reason: "bridge-offline",
      action: "Abre Revit, inicia sesion en el add-in y ejecuta Jobs BIM.",
      waitingJobCount,
      oldestWaitSeconds,
      requiresBridgeAttention: true,
    };
  }
  if (oldestWaitSeconds >= 120) {
    if (bridgeOnline) {
      return {
        tone: "warning",
        label: "Bridge activo, esperando modelo",
        reason: "model-mismatch",
        action: "Verifica que el documento abierto coincida con el ultimo lote Revit del proyecto.",
        waitingJobCount,
        oldestWaitSeconds,
        requiresBridgeAttention: true,
      };
    }
    return {
      tone: "warning",
      label: "Esperando Revit Bridge",
      reason: "bridge-slow",
      action: "Verifica que Revit este abierto, con sesion activa y auto-claim habilitado.",
      waitingJobCount,
      oldestWaitSeconds,
      requiresBridgeAttention: true,
    };
  }
  return {
    tone: "ok",
    label: "Revit en cola",
    reason: "queued",
    action: "",
    waitingJobCount,
    oldestWaitSeconds,
    requiresBridgeAttention: false,
  };
}

function normalizeBridgeQueueSummary(summary = {}) {
  const source = summary && typeof summary === "object" ? summary : {};
  return {
    activeRevitQueued: normalizeInteger(source.activeRevitQueued),
    oldestActiveRevitQueuedAgeSeconds: normalizeInteger(source.oldestActiveRevitQueuedAgeSeconds),
    bridgePresence: normalizeBridgePresenceSummary(source.bridgePresence),
  };
}

function normalizeBridgePresenceSummary(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const latestModelIdentity = source.latestModelIdentity && typeof source.latestModelIdentity === "object"
    ? source.latestModelIdentity
    : {};
  return {
    online: source.online === true,
    onlineCount: normalizeInteger(source.onlineCount),
    knownCount: normalizeInteger(source.knownCount),
    ttlSeconds: normalizeInteger(source.ttlSeconds),
    latestSeenAt: String(source.latestSeenAt || ""),
    latestSeenAgeSeconds: normalizeInteger(source.latestSeenAgeSeconds),
    latestBridgeId: String(source.latestBridgeId || ""),
    latestRequestedBy: String(source.latestRequestedBy || ""),
    latestModelIdentity,
    latestDiagnostic: normalizeBridgeDiagnostic(source.latestDiagnostic || latestModelIdentity.bridgeDiagnostic),
  };
}

function normalizeBridgeDiagnostic(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (Object.keys(source).length === 0) {
    return null;
  }

  return {
    status: String(source.status || "").trim(),
    canClaim: source.canClaim === true,
    autoClaimEnabled: source.autoClaimEnabled === true,
    signedIn: source.signedIn === true,
    runnerBusy: source.runnerBusy === true,
    hasIngestApiKey: source.hasIngestApiKey === true,
    pollSeconds: normalizeInteger(source.pollSeconds),
    issues: uniqueStrings(Array.isArray(source.issues)
      ? source.issues
      : (Array.isArray(source.validationIssues) ? source.validationIssues : [])),
  };
}

function resolveBridgeClaimMissingCodes(diagnostic) {
  const missing = [];
  if (!diagnostic.signedIn) {
    missing.push("ACTIVE_REVIT_GOOGLE_SIGN_IN");
  }
  if (!diagnostic.hasIngestApiKey) {
    missing.push("ACTIVE_REVIT_BRIDGE_API_KEY");
  }
  if (!diagnostic.autoClaimEnabled) {
    missing.push("ACTIVE_REVIT_AUTO_CLAIM_DISABLED");
  }
  if (diagnostic.runnerBusy) {
    missing.push("ACTIVE_REVIT_BRIDGE_BUSY");
  }
  if (missing.length === 0) {
    missing.push("ACTIVE_REVIT_BRIDGE_NOT_READY");
  }
  return missing;
}

function createBridgeClaimCommands(missing) {
  if (missing.includes("ACTIVE_REVIT_GOOGLE_SIGN_IN")) {
    return ["Inicia sesion con Google en el add-in de Revit."];
  }
  if (missing.includes("ACTIVE_REVIT_BRIDGE_API_KEY")) {
    return ["powershell -NoProfile -ExecutionPolicy Bypass -File ..\\REVIT-MODEL-AUDITOR\\tools\\sync-itemicostos-bridge-key.ps1"];
  }
  if (missing.includes("ACTIVE_REVIT_AUTO_CLAIM_DISABLED")) {
    return ["Activa web.autoClaimBimJobs en la configuracion del add-in."];
  }
  if (missing.includes("ACTIVE_REVIT_BRIDGE_BUSY")) {
    return ["Espera a que termine el job BIM actual o cancelalo desde Itemicostos."];
  }
  return [];
}

function resolveBridgeQueueMissingCode(reason) {
  if (reason === "bridge-offline") {
    return "ACTIVE_REVIT_BRIDGE_OFFLINE";
  }
  if (reason === "model-mismatch") {
    return "ACTIVE_REVIT_MODEL_IDENTITY_MISMATCH";
  }
  return "ACTIVE_REVIT_BRIDGE_NOT_CLAIMING";
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
    .flatMap((check) => (
      check.status === "ready"
        ? check.commands
        : check.commands.filter(isReadinessRepairCommand)
    ))
    .filter((command, index, commands) => commands.indexOf(command) === index);
}

function isReadinessRepairCommand(command) {
  return String(command || "").includes("bim:setup-local")
    || String(command || "").includes("bim:prepare-smoke")
    || String(command || "").includes("sync-itemicostos-bridge-key")
    || String(command || "").includes("worker:bim:list-activities");
}

function createApsReadinessCommands(config, missing) {
  const commands = [];
  const canListActivities = Boolean(config.clientId && config.clientSecret);
  if (missing.includes("BIM_APS_ACTIVITY_ID") && canListActivities) {
    commands.push("npm run worker:bim:list-activities");
  }
  if (missing.length === 0) {
    commands.push("npm run worker:bim:check-live");
  }
  return commands;
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

function createBridgeE2eReadinessCommands(missing) {
  if (!Array.isArray(missing) || missing.length === 0) {
    return ["npm run bim:bridge-e2e-smoke", "npm run bim:active-revit-e2e"];
  }
  if (
    missing.includes("BIM_BRIDGE_E2E_SMOKE_PROJECT_ID")
    || missing.includes("BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE")
    || missing.includes("BIM_BRIDGE_E2E_REQUESTED_BY")
  ) {
    return ["npm run bim:prepare-smoke -- --session-cookie <cookie>"];
  }

  const args = [];
  if (missing.includes("BIM_BRIDGE_E2E_SMOKE_PROJECT_ID")) {
    args.push("--bridge-e2e-project-id <projectId>");
  }
  if (missing.includes("BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE")) {
    args.push("--bridge-e2e-session-cookie <cookie>");
  }
  if (missing.includes("BIM_BRIDGE_E2E_REQUESTED_BY")) {
    args.push("--bridge-e2e-requested-by <email>");
  }

  return args.length > 0
    ? [`npm run bim:setup-local -- ${args.join(" ")}`]
    : [];
}

function normalizeApsFromEnv(env) {
  return normalizeApsDesignAutomationConfig({
    apsClientId: env.BIM_APS_CLIENT_ID,
    apsClientSecret: env.BIM_APS_CLIENT_SECRET,
    apsActivityId: env.BIM_APS_ACTIVITY_ID,
    apsBaseUrl: env.BIM_APS_BASE_URL,
    apsTokenUrl: env.BIM_APS_TOKEN_URL,
    apsScopes: env.BIM_APS_SCOPES,
    apsPollMs: env.BIM_APS_POLL_MS,
    apsTimeoutMs: env.BIM_APS_TIMEOUT_MS,
  });
}

function getApsMissingConfig(config) {
  const missing = [];
  if (!config.clientId) {
    missing.push("BIM_APS_CLIENT_ID");
  }
  if (!config.clientSecret) {
    missing.push("BIM_APS_CLIENT_SECRET");
  }
  if (!config.activityId) {
    missing.push("BIM_APS_ACTIVITY_ID");
  }
  return missing;
}

function getBridgeSmokeReadinessMissing(config) {
  const missing = getBimBridgeSmokeMissingConfig(config);
  if (!config.sessionCookie && !missing.includes("BIM_BRIDGE_SMOKE_SESSION_COOKIE")) {
    missing.push("BIM_BRIDGE_SMOKE_SESSION_COOKIE");
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
  const configured = String(value || "").trim().length > 0;
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

function getCloudWorkerMissingConfig(env) {
  return String(env.BIM_WORKER_API_KEY || env.REVIT_INGEST_API_KEY || "").trim()
    ? []
    : ["BIM_WORKER_API_KEY or REVIT_INGEST_API_KEY"];
}

function normalizeProviderId(value) {
  const providerId = String(value || "simulated-aps").trim().toLowerCase();
  return providerId === "aps-design-automation" ? providerId : "simulated-aps";
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

function normalizeProjectId(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDateOrEmpty(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeInteger(value) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function uniqueStrings(values) {
  return Array.from(new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}
