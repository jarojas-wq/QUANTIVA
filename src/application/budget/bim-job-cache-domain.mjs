import { createHash } from "node:crypto";

const BIM_JOB_TARGET_MODES = ["active-revit", "cloud-model"];
const CACHE_CONTROL_PAYLOAD_KEYS = new Set([
  "batchSize",
  "cacheMode",
  "forceRefresh",
  "requestId",
  "requestedAt",
  "retryOf",
  "sourceJobId",
  "useCache",
]);

export function shouldBypassBimJobCacheRead(payload) {
  const source = normalizeObject(payload);
  const cacheMode = normalizeText(source.cacheMode, "").toLowerCase();
  return source.forceRefresh === true
    || source.useCache === false
    || cacheMode === "refresh"
    || cacheMode === "skip"
    || cacheMode === "off";
}

export function shouldRefreshBimJobCache(payload) {
  return shouldBypassBimJobCacheRead(payload);
}

export function shouldReadBimJobCache(payload, commandType) {
  return !shouldBypassBimJobCacheRead(payload)
    && shouldPersistBimJobCache(payload, commandType);
}

export function shouldPersistBimJobCache(payload, commandType) {
  const source = normalizeObject(payload);
  const cacheMode = normalizeText(source.cacheMode, "").toLowerCase();
  const normalizedCommandType = normalizeBimJobCommandType(commandType);
  if (normalizedCommandType.startsWith("active-revit")) {
    return false;
  }
  if (normalizedCommandType.endsWith("-apply") || normalizedCommandType.includes(":apply")) {
    return false;
  }

  return source.useCache !== false
    && cacheMode !== "skip"
    && cacheMode !== "off";
}

export function shouldReuseActiveBimJob(payload, commandType) {
  return !shouldRefreshBimJobCache(payload)
    && !isBimApplyCommand(commandType);
}

export function buildBimJobCacheKey(projectUid, targetMode, commandType, modelIdentityInput, payloadInput = {}) {
  const modelIdentity = normalizeObject(modelIdentityInput);
  const payloadFingerprint = buildPayloadCacheFingerprint(payloadInput);
  const identity = {
    projectId: normalizeIdentifier(projectUid, ""),
    targetMode: normalizeBimJobTargetMode(targetMode),
    commandType: normalizeBimJobCommandType(commandType),
    modelGuid: normalizeIdentifier(modelIdentity.modelGuid, ""),
    documentUid: normalizeIdentifier(modelIdentity.documentUid, ""),
    documentVersion: normalizeText(
      modelIdentity.documentVersion
        || modelIdentity.modelVersion
        || modelIdentity.documentRevision
        || modelIdentity.revitDocumentVersion
        || modelIdentity.version
        || modelIdentity.revitExportUid
        || modelIdentity.lastExportUid
        || modelIdentity.exportUid,
      "",
    ),
    modelPath: normalizeBimModelPath(modelIdentity.modelPath || modelIdentity.path),
    exportedAt: normalizeText(modelIdentity.exportedAt || modelIdentity.lastExportedAt, ""),
    payload: payloadFingerprint,
  };
  const hasVersionedModelIdentity = Boolean(
    (identity.modelGuid || identity.documentUid)
    && identity.documentVersion
  );
  const hasLegacyExportIdentity = Boolean(identity.modelPath && identity.exportedAt);
  const hasStableModelIdentity = hasVersionedModelIdentity || hasLegacyExportIdentity;
  if (!identity.projectId || !hasStableModelIdentity) {
    return null;
  }

  const fingerprint = stableJsonStringify(identity);
  return {
    hash: createHash("sha256").update(fingerprint).digest("hex"),
    fingerprint,
    identity,
  };
}

function buildPayloadCacheFingerprint(payloadInput) {
  const payload = normalizeObject(payloadInput);
  const stablePayload = stripTransientCachePayloadFields(payload);
  return Object.keys(stablePayload).length === 0 ? null : stablePayload;
}

function stripTransientCachePayloadFields(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stripTransientCachePayloadFields(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (CACHE_CONTROL_PAYLOAD_KEYS.has(key)) {
      continue;
    }
    result[key] = stripTransientCachePayloadFields(entry);
  }
  return result;
}

function normalizeBimJobTargetMode(value) {
  const targetMode = String(value || "").trim();
  return BIM_JOB_TARGET_MODES.includes(targetMode) ? targetMode : "active-revit";
}

function normalizeBimJobCommandType(value) {
  const commandType = String(value || "").trim().toLowerCase();
  return commandType.replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80) || "bim-analysis";
}

function isBimApplyCommand(commandType) {
  const normalizedCommandType = normalizeBimJobCommandType(commandType);
  return normalizedCommandType.endsWith("-apply") || normalizedCommandType.includes(":apply");
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeBimModelPath(value) {
  return String(value || "").trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
