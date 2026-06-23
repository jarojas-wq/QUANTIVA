export const BIM_JOB_OWNERSHIP_MISMATCH = "BIM_JOB_OWNERSHIP_MISMATCH";

export class BimJobOwnershipError extends Error {
  constructor(jobUid, claimedBy, reporterId) {
    const normalizedClaimedBy = normalizeText(claimedBy, "");
    const normalizedReporterId = normalizeText(reporterId, "");
    const ownerMessage = normalizedClaimedBy
      ? `fue tomado por ${normalizedClaimedBy}`
      : "todavia no fue tomado por ningun bridge/worker";
    super(`El job BIM ${normalizeText(jobUid, "")} ${ownerMessage} y no acepta reportes de ${normalizedReporterId || "bridge desconocido"}.`);
    this.name = "BimJobOwnershipError";
    this.code = BIM_JOB_OWNERSHIP_MISMATCH;
    this.statusCode = 409;
    this.jobUid = normalizeText(jobUid, "");
    this.claimedBy = normalizedClaimedBy;
    this.reporterId = normalizedReporterId;
  }
}

export function canReportBimJobProgressForClaim(claimedByInput, reporterIdInput) {
  const claimedBy = normalizeText(claimedByInput, "");
  if (!claimedBy) {
    return true;
  }
  const reporterId = normalizeText(reporterIdInput, "");
  return Boolean(reporterId) && claimedBy === reporterId;
}

export function canWriteBimJobArtifactsForClaim(claimedByInput, reporterIdInput) {
  const claimedBy = normalizeText(claimedByInput, "");
  const reporterId = normalizeText(reporterIdInput, "");
  return Boolean(claimedBy && reporterId && claimedBy === reporterId);
}

export function canAccessBimJobOperationsForClaim(claimedByInput, reporterIdInput) {
  return canWriteBimJobArtifactsForClaim(claimedByInput, reporterIdInput);
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}
