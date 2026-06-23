export { classifyApsAutomationError as classifyApsActivityDiscoveryError } from "./aps-diagnostics-domain.mjs";

export function createApsActivityDiscoveryReport(payload, options = {}) {
  const activities = normalizeApsActivityEntries(payload);
  const configuredActivityId = String(options.activityId || "").trim();
  const matchingConfiguredActivity = configuredActivityId
    ? activities.find((activity) => activity.id === configuredActivityId) || null
    : null;

  return {
    ok: true,
    status: activities.length > 0 ? "ready" : "empty",
    providerId: "aps-design-automation",
    baseUrl: normalizeBaseUrl(options.baseUrl || ""),
    tokenUrl: String(options.tokenUrl || "").trim(),
    configuredActivityId,
    configuredActivityFound: Boolean(matchingConfiguredActivity),
    activityCount: activities.length,
    activities,
    nextCommands: createApsActivityNextCommands(activities, configuredActivityId),
  };
}

export function createApsActivityDiscoveryMissingConfig(config = {}) {
  const missing = [];
  if (!String(config.clientId || "").trim()) {
    missing.push("BIM_APS_CLIENT_ID");
  }
  if (!String(config.clientSecret || "").trim()) {
    missing.push("BIM_APS_CLIENT_SECRET");
  }
  return missing;
}

export function createApsActivityNextCommands(activities, configuredActivityId = "") {
  if (configuredActivityId || activities.length !== 1) {
    return [];
  }

  return [
    `npm run bim:setup-local -- --enable-aps --aps-activity-id ${quoteCommandArgument(activities[0].id)}`,
  ];
}

export function normalizeApsActivityEntries(payload) {
  const sourceEntries = extractApsActivitySourceEntries(payload);
  const activities = sourceEntries
    .map(normalizeApsActivityEntry)
    .filter((activity) => activity.id);
  const byId = new Map();
  activities.forEach((activity) => {
    if (!byId.has(activity.id)) {
      byId.set(activity.id, activity);
    }
  });
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function extractApsActivitySourceEntries(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const key of ["data", "value", "items", "activities", "results"]) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  if (typeof payload.id === "string" || typeof payload.activityId === "string") {
    return [payload];
  }

  return [];
}

function normalizeApsActivityEntry(entry) {
  if (typeof entry === "string") {
    return normalizeApsActivityId(entry);
  }
  const source = entry && typeof entry === "object" ? entry : {};
  const id = String(source.id || source.activityId || source.name || "").trim();
  return {
    ...normalizeApsActivityId(id),
    nickname: String(source.nickname || "").trim(),
    version: String(source.version || "").trim(),
    engine: String(source.engine || "").trim(),
    appbundles: Array.isArray(source.appbundles)
      ? source.appbundles.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    parameters: source.parameters && typeof source.parameters === "object"
      ? Object.keys(source.parameters).sort()
      : [],
  };
}

function normalizeApsActivityId(value) {
  const id = String(value || "").trim();
  const [ownerAndName, alias = ""] = id.split("+");
  const segments = ownerAndName.split(".");
  return {
    id,
    owner: segments.length > 1 ? segments[0] : "",
    name: segments.length > 1 ? segments.slice(1).join(".") : ownerAndName,
    alias,
    nickname: "",
    version: "",
    engine: "",
    appbundles: [],
    parameters: [],
  };
}

function quoteCommandArgument(value) {
  const text = String(value || "").trim();
  return /[\s"`'$&|<>]/.test(text) ? JSON.stringify(text) : text;
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  return text.endsWith("/") ? text : (text ? `${text}/` : "");
}
