export const BIM_JOB_STALE_MINUTES_MIN = 5;
export const BIM_JOB_STALE_MINUTES_MAX = 1440;
export const BIM_JOB_STALE_MINUTES_DEFAULT = 30;
export const BIM_JOB_STALE_ACTIVE_STATUSES = ["claimed", "running", "applying"];

const ACTIVE_STATUS_SET = new Set(BIM_JOB_STALE_ACTIVE_STATUSES);

export function normalizeBimJobStaleMinutes(value, fallback = BIM_JOB_STALE_MINUTES_DEFAULT) {
  const normalizedFallback = clampInteger(
    fallback,
    BIM_JOB_STALE_MINUTES_MIN,
    BIM_JOB_STALE_MINUTES_MAX,
    BIM_JOB_STALE_MINUTES_DEFAULT,
  );
  return clampInteger(value, BIM_JOB_STALE_MINUTES_MIN, BIM_JOB_STALE_MINUTES_MAX, normalizedFallback);
}

export function resolveBimJobStaleCutoff(options = {}) {
  const staleMinutes = normalizeBimJobStaleMinutes(options.staleMinutes);
  const nowMs = normalizeTimestampMs(options.now, Date.now());
  const cutoffMs = nowMs - staleMinutes * 60 * 1000;
  return {
    staleMinutes,
    nowMs,
    cutoffMs,
    cutoffIso: new Date(cutoffMs).toISOString(),
  };
}

export function createBimJobStaleExpirationPlan(rows, options = {}) {
  const cutoff = resolveBimJobStaleCutoff(options);
  const candidates = Array.isArray(rows) ? rows : [];
  const expiredJobs = candidates
    .map((row) => normalizeStaleCandidate(row, cutoff))
    .filter(Boolean);

  return {
    staleMinutes: cutoff.staleMinutes,
    cutoffIso: cutoff.cutoffIso,
    cutoffMs: cutoff.cutoffMs,
    expiredCount: expiredJobs.length,
    expiredJobIds: expiredJobs.map((job) => job.jobId).filter((jobId) => jobId > 0),
    expiredJobs,
    errorMessage: buildBimJobStaleExpirationError(cutoff.staleMinutes),
  };
}

export function buildBimJobStaleExpirationError(staleMinutes) {
  const minutes = normalizeBimJobStaleMinutes(staleMinutes);
  return `Job marcado como fallido por falta de heartbeat durante ${minutes} minutos.`;
}

export function buildBimJobStaleExpirationLogMessage(job, staleMinutes) {
  const minutes = normalizeBimJobStaleMinutes(staleMinutes);
  const status = normalizeBimJobStatus(job?.status, "running");
  const claimedBy = normalizeText(job?.claimedBy, "");
  const executorNote = claimedBy ? ` Ejecutor: ${claimedBy}.` : "";
  return `Job expirado desde estado ${status} por falta de heartbeat durante ${minutes} minutos.${executorNote}`;
}

function normalizeStaleCandidate(row, cutoff) {
  const source = row && typeof row === "object" && !Array.isArray(row) ? row : {};
  const status = normalizeBimJobStatus(source.status_name ?? source.status, "");
  if (!ACTIVE_STATUS_SET.has(status)) {
    return null;
  }

  const updatedAtMs = normalizeTimestampMs(source.updated_at ?? source.updatedAt, Number.NaN);
  if (!Number.isFinite(updatedAtMs) || updatedAtMs >= cutoff.cutoffMs) {
    return null;
  }

  const job = {
    jobId: normalizeInteger(source.job_id ?? source.jobId ?? source.id),
    jobUid: normalizeText(source.job_uid ?? source.jobUid, ""),
    status,
    claimedBy: normalizeText(source.claimed_by ?? source.claimedBy, ""),
    updatedAtMs,
    staleForSeconds: Math.max(0, Math.floor((cutoff.nowMs - updatedAtMs) / 1000)),
  };
  return {
    ...job,
    logMessage: buildBimJobStaleExpirationLogMessage(job, cutoff.staleMinutes),
  };
}

function normalizeBimJobStatus(value, fallback) {
  const status = normalizeText(value, "").toLowerCase();
  return ACTIVE_STATUS_SET.has(status) ? status : fallback;
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeTimestampMs(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeInteger(value) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
