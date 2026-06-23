export const DEFAULT_APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
export const DEFAULT_APS_DESIGN_AUTOMATION_BASE_URL = "https://developer.api.autodesk.com/da/us-east/v3";
export const DEFAULT_APS_SCOPES = "code:all data:read data:write";
export const MIN_APS_POLL_MS = 2000;

const APS_TERMINAL_STATUSES = new Set([
  "success",
  "failed",
  "cancelled",
  "canceled",
  "timeout",
  "failedinstructions",
  "failedlimitprocessingtime",
]);

export function createApsDesignAutomationClient(config = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("APS Design Automation requiere fetch disponible en Node.js.");
  }

  const normalizedConfig = normalizeApsDesignAutomationConfig(config);
  let tokenCache = null;

  async function getAccessToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
      return tokenCache.accessToken;
    }

    const credentials = Buffer.from(`${normalizedConfig.clientId}:${normalizedConfig.clientSecret}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: normalizedConfig.scopes,
    });
    const response = await fetchImpl(normalizedConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(formatApsError(payload, `APS token HTTP ${response.status}`));
    }
    const accessToken = String(payload.access_token || "").trim();
    if (!accessToken) {
      throw new Error("APS no devolvio access_token.");
    }
    const expiresIn = Math.max(60, Number(payload.expires_in || 3600));
    tokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return accessToken;
  }

  async function requestDesignAutomation(relativePath, options = {}) {
    const accessToken = await getAccessToken();
    const endpoint = new URL(relativePath.replace(/^\/+/, ""), normalizedConfig.baseUrl);
    const response = await fetchImpl(endpoint, {
      method: options.method || "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(formatApsError(payload, `APS Design Automation HTTP ${response.status}`));
    }
    return payload;
  }

  return {
    config: normalizedConfig,
    getAccessToken,
    createWorkItem(workItemPayload) {
      return requestDesignAutomation("workitems", {
        method: "POST",
        body: workItemPayload,
      });
    },
    getWorkItem(workItemId) {
      return requestDesignAutomation(`workitems/${encodeURIComponent(workItemId)}`);
    },
    cancelWorkItem(workItemId) {
      return requestDesignAutomation(`workitems/${encodeURIComponent(workItemId)}`, {
        method: "DELETE",
      });
    },
    getActivity(activityId = normalizedConfig.activityId) {
      const normalizedActivityId = String(activityId || "").trim();
      if (!normalizedActivityId) {
        throw new Error("APS activityId es obligatorio para validar la activity.");
      }
      return requestDesignAutomation(`activities/${encodeURIComponent(normalizedActivityId)}`);
    },
    listActivities() {
      return requestDesignAutomation("activities");
    },
  };
}

export function normalizeApsDesignAutomationConfig(config = {}) {
  return {
    tokenUrl: normalizeUrl(config.apsTokenUrl, DEFAULT_APS_TOKEN_URL),
    baseUrl: normalizeBaseUrl(config.apsBaseUrl, DEFAULT_APS_DESIGN_AUTOMATION_BASE_URL),
    clientId: String(config.apsClientId || "").trim(),
    clientSecret: String(config.apsClientSecret || "").trim(),
    activityId: String(config.apsActivityId || "").trim(),
    scopes: String(config.apsScopes || DEFAULT_APS_SCOPES).trim() || DEFAULT_APS_SCOPES,
    pollMs: clampInteger(config.apsPollMs, MIN_APS_POLL_MS, 600000, 10000),
    timeoutMs: clampInteger(config.apsTimeoutMs, MIN_APS_POLL_MS, 24 * 60 * 60 * 1000, 60 * 60 * 1000),
  };
}

export function buildApsWorkItemPayload(job, plan, config = {}) {
  const payload = toObject(job?.payload);
  const configuredWorkItem = toObject(payload.apsWorkItem);
  const activityId = String(configuredWorkItem.activityId || payload.apsActivityId || config.activityId || config.apsActivityId || "").trim();
  const argumentsPayload = {
    ...createApsArgumentsFromPayloadAliases(payload),
    ...normalizeApsWorkItemArguments(payload.apsArguments),
    ...normalizeApsWorkItemArguments(configuredWorkItem.arguments),
  };
  const workItemPayload = {
    ...configuredWorkItem,
    activityId,
    arguments: argumentsPayload,
  };

  if (!workItemPayload.arguments.TaskParameters && payload.apsTaskParameters !== undefined) {
    workItemPayload.arguments = {
      ...workItemPayload.arguments,
      TaskParameters: JSON.stringify(payload.apsTaskParameters),
    };
  }
  if (!workItemPayload.arguments.ItemicostosJob && !workItemPayload.arguments.TaskParameters) {
    workItemPayload.arguments = {
      ...workItemPayload.arguments,
      ItemicostosJob: JSON.stringify({
        jobId: plan.jobId,
        commandType: plan.commandType,
        modelIdentity: plan.modelIdentity,
      }),
    };
  }

  return workItemPayload;
}

export function summarizeApsWorkItemContract(workItemPayload = {}) {
  const source = toObject(workItemPayload);
  const argumentsPayload = toObject(source.arguments);
  const argumentEntries = Object.entries(argumentsPayload);
  const remoteArguments = argumentEntries
    .map(([name, value]) => summarizeApsRemoteArgument(name, value))
    .filter((entry) => entry.hasUrl);
  const inputArguments = remoteArguments.filter((entry) => entry.direction === "input");
  const outputArguments = remoteArguments.filter((entry) => entry.direction === "output");
  const metadataArgumentCount = argumentEntries.length - remoteArguments.length;
  const missing = [];
  if (!String(source.activityId || "").trim()) {
    missing.push("APS_ACTIVITY_ID");
  }
  if (inputArguments.length === 0) {
    missing.push("APS_INPUT_ARGUMENT");
  }
  if (outputArguments.length === 0) {
    missing.push("APS_OUTPUT_ARGUMENT");
  }

  return {
    activityIdConfigured: Boolean(String(source.activityId || "").trim()),
    argumentCount: argumentEntries.length,
    remoteArgumentCount: remoteArguments.length,
    inputArgumentCount: inputArguments.length,
    outputArgumentCount: outputArguments.length,
    metadataArgumentCount,
    inputArguments: inputArguments.map((entry) => entry.name),
    outputArguments: outputArguments.map((entry) => entry.name),
    readyForExecution: missing.length === 0,
    missing,
  };
}

export function normalizeApsWorkItemStatus(value) {
  const status = String(value || "").trim();
  return status || "unknown";
}

export function isTerminalApsWorkItemStatus(value) {
  return APS_TERMINAL_STATUSES.has(normalizeApsWorkItemStatus(value).toLowerCase());
}

export function isSuccessfulApsWorkItemStatus(value) {
  return normalizeApsWorkItemStatus(value).toLowerCase() === "success";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatApsError(payload, fallback) {
  const source = payload && typeof payload === "object" ? payload : {};
  const message = [
    source.error_description,
    source.developerMessage,
    source.detail,
    source.message,
    source.error,
    source.raw,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  return message ? `${fallback}: ${message.slice(0, 500)}` : fallback;
}

function normalizeUrl(value, fallback) {
  const text = String(value || fallback).trim();
  try {
    return new URL(text).toString();
  } catch {
    return fallback;
  }
}

function normalizeBaseUrl(value, fallback) {
  const text = normalizeUrl(value, fallback);
  return text.endsWith("/") ? text : `${text}/`;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeApsWorkItemArguments(value) {
  return Object.fromEntries(
    Object.entries(toObject(value)).map(([name, argument]) => [
      name,
      normalizeApsWorkItemArgument(name, argument),
    ]),
  );
}

function createApsArgumentsFromPayloadAliases(payload) {
  const source = toObject(payload);
  const argumentsPayload = {
    ...normalizeApsArgumentMap(source.apsInputs, "get"),
    ...normalizeApsArgumentMap(source.apsOutputs, "put"),
  };
  const inputArgument = firstDefined(
    source.apsInput,
    source.cloudModelInput,
    source.inputRvt,
    source.inputModel,
    source.apsInputUrl,
    source.inputRvtUrl,
    source.inputModelUrl,
    source.modelUrl,
    source.modelStorageUri,
  );
  if (inputArgument !== undefined && !argumentsPayload.inputRvt) {
    argumentsPayload.inputRvt = normalizeApsWorkItemArgument("inputRvt", inputArgument, "get");
  }
  const outputArgument = firstDefined(
    source.apsOutput,
    source.cloudModelOutput,
    source.outputZip,
    source.outputModel,
    source.apsOutputUrl,
    source.outputZipUrl,
    source.outputUrl,
    source.resultUrl,
    source.resultZipUrl,
  );
  if (outputArgument !== undefined && !argumentsPayload.resultZip) {
    argumentsPayload.resultZip = normalizeApsWorkItemArgument("resultZip", outputArgument, "put");
  }
  return argumentsPayload;
}

function normalizeApsArgumentMap(value, defaultVerb) {
  return Object.fromEntries(
    Object.entries(toObject(value)).map(([name, argument]) => [
      name,
      normalizeApsWorkItemArgument(name, argument, defaultVerb),
    ]),
  );
}

function normalizeApsWorkItemArgument(name, argument, defaultVerb = "") {
  if (typeof argument === "string") {
    const url = normalizeOptionalUrl(argument);
    if (url) {
      return {
        url,
        verb: inferApsArgumentVerb(name, defaultVerb),
      };
    }
    return argument;
  }
  if (!argument || typeof argument !== "object" || Array.isArray(argument)) {
    return argument;
  }
  const normalized = { ...argument };
  const url = normalizeOptionalUrl(
    normalized.url || normalized.href || normalized.signedUrl || normalized.storageUri,
  );
  if (url) {
    normalized.url = url;
  }
  if (!normalized.verb && url) {
    normalized.verb = inferApsArgumentVerb(name, defaultVerb);
  } else if (normalized.verb) {
    normalized.verb = String(normalized.verb).trim().toLowerCase();
  }
  return normalized;
}

function summarizeApsRemoteArgument(name, argument) {
  const value = toObject(argument);
  const url = normalizeOptionalUrl(value.url || value.href || value.signedUrl || value.storageUri || (typeof argument === "string" ? argument : ""));
  const verb = String(value.verb || inferApsArgumentVerb(name)).trim().toLowerCase();
  return {
    name,
    hasUrl: Boolean(url),
    direction: verb === "put" || verb === "post" || isLikelyApsOutputArgument(name) ? "output" : "input",
    verb,
  };
}

function inferApsArgumentVerb(name, fallback = "") {
  const normalizedFallback = String(fallback || "").trim().toLowerCase();
  if (normalizedFallback === "get" || normalizedFallback === "put" || normalizedFallback === "post") {
    return normalizedFallback;
  }
  return isLikelyApsOutputArgument(name) ? "put" : "get";
}

function isLikelyApsOutputArgument(name) {
  return /(^|[_-])(out|output|result|report|log)|zip$/i.test(String(name || ""));
}

function normalizeOptionalUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  try {
    return new URL(text).toString();
  } catch {
    return "";
  }
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}
