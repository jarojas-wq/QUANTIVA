export const BIM_BRIDGE_PRESENCE_DEFAULT_TTL_SECONDS = 180;
export const BIM_BRIDGE_PRESENCE_MIN_TTL_SECONDS = 15;
export const BIM_BRIDGE_PRESENCE_MAX_TTL_SECONDS = 3600;

export function normalizeBimBridgePresenceTtlSeconds(value) {
  return clampInteger(
    value,
    BIM_BRIDGE_PRESENCE_MIN_TTL_SECONDS,
    BIM_BRIDGE_PRESENCE_MAX_TTL_SECONDS,
    BIM_BRIDGE_PRESENCE_DEFAULT_TTL_SECONDS,
  );
}

export function normalizeIncomingBimBridgeHeartbeat(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const activeModelIdentity = normalizePlainObject(source.activeModelIdentity || source.modelIdentity);
  const diagnostic = normalizeBimBridgeDiagnostic(source.diagnostic || source.bridgeDiagnostic);
  return {
    bridgeId: normalizeText(source.bridgeId || source.workerId, "revit-bridge"),
    projectId: normalizeIdentifier(source.projectId || source.projectUid, ""),
    requestedBy: normalizeEmail(source.requestedBy || source.userEmail),
    activeModelIdentity: diagnostic
      ? { ...activeModelIdentity, bridgeDiagnostic: diagnostic }
      : activeModelIdentity,
    diagnostic,
    seenAt: normalizeIsoDate(source.seenAt),
  };
}

export function summarizeBimBridgePresence(rows = [], options = {}) {
  const ttlSeconds = normalizeBimBridgePresenceTtlSeconds(options.ttlSeconds);
  const nowMs = normalizeNowMs(options.now);
  const normalizedRows = Array.isArray(rows)
    ? rows.map(normalizeBridgePresenceRow).filter((row) => row.bridgeId && row.lastSeenAt)
    : [];
  const orderedRows = normalizedRows.sort((left, right) => (
    new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
  ));
  const onlineRows = orderedRows.filter((row) => {
    const lastSeenMs = new Date(row.lastSeenAt).getTime();
    return Number.isFinite(lastSeenMs) && Math.max(0, Math.floor((nowMs - lastSeenMs) / 1000)) <= ttlSeconds;
  });
  const latest = orderedRows[0] || null;
  const latestSeenAgeSeconds = latest
    ? Math.max(0, Math.floor((nowMs - new Date(latest.lastSeenAt).getTime()) / 1000))
    : 0;

  return {
    online: onlineRows.length > 0,
    onlineCount: onlineRows.length,
    knownCount: orderedRows.length,
    ttlSeconds,
    latestSeenAt: latest?.lastSeenAt || "",
    latestSeenAgeSeconds,
    latestBridgeId: latest?.bridgeId || "",
    latestRequestedBy: latest?.requestedBy || "",
    latestModelIdentity: latest?.activeModelIdentity || {},
    latestDiagnostic: normalizeBimBridgeDiagnostic(latest?.activeModelIdentity?.bridgeDiagnostic) || null,
  };
}

export function normalizeBimBridgeDiagnostic(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const hasAnyValue = Object.keys(source).length > 0;
  if (!hasAnyValue) {
    return null;
  }
  const canClaim = normalizeBoolean(source.canClaim);
  const status = normalizeText(source.status, canClaim ? "ready" : "not-ready")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .slice(0, 80);
  return {
    status: status || (canClaim ? "ready" : "not-ready"),
    canClaim,
    autoClaimEnabled: normalizeBoolean(source.autoClaimEnabled),
    signedIn: normalizeBoolean(source.signedIn),
    runnerBusy: normalizeBoolean(source.runnerBusy),
    hasIngestApiKey: normalizeBoolean(source.hasIngestApiKey),
    pollSeconds: clampInteger(source.pollSeconds, 5, 600, 15),
    issues: normalizeTextList(source.issues || source.validationIssues).slice(0, 10),
  };
}

function normalizeBridgePresenceRow(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    bridgeId: normalizeText(source.bridgeId || source.bridge_id, ""),
    projectId: normalizeIdentifier(source.projectId || source.project_uid, ""),
    requestedBy: normalizeEmail(source.requestedBy || source.requested_by),
    activeModelIdentity: normalizePlainObject(source.activeModelIdentity || source.model_identity_json),
    lastSeenAt: normalizeIsoDate(source.lastSeenAt || source.last_seen_at),
  };
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeIdentifier(value, fallback = "") {
  return normalizeText(value, fallback).slice(0, 80);
}

function normalizeEmail(value) {
  return normalizeText(value, "").toLowerCase().slice(0, 180);
}

function normalizePlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTextList(value) {
  const values = Array.isArray(value) ? value : [];
  return values
    .map((entry) => normalizeText(entry, ""))
    .filter(Boolean);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "si", "ready", "ok"].includes(text);
}

function normalizeIsoDate(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeNowMs(value) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  const dateMs = date.getTime();
  return Number.isFinite(dateMs) ? dateMs : Date.now();
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
