import { describe, expect, it } from "vitest";
import {
  BIM_JOB_OWNERSHIP_MISMATCH,
  BimJobOwnershipError,
  canAccessBimJobOperationsForClaim,
  canReportBimJobProgressForClaim,
  canWriteBimJobArtifactsForClaim,
} from "./bim-job-ownership-domain.mjs";

describe("BIM job ownership domain", () => {
  it("allows progress before claim but rejects mismatched claimed executors", () => {
    expect(canReportBimJobProgressForClaim("", "bridge-1")).toBe(true);
    expect(canReportBimJobProgressForClaim("bridge-1", "bridge-1")).toBe(true);
    expect(canReportBimJobProgressForClaim("bridge-1", "bridge-2")).toBe(false);
    expect(canReportBimJobProgressForClaim("bridge-1", "")).toBe(false);
  });

  it("allows artifacts and operations only from the claimed bridge or worker", () => {
    expect(canWriteBimJobArtifactsForClaim("", "bridge-1")).toBe(false);
    expect(canWriteBimJobArtifactsForClaim("bridge-1", "bridge-1")).toBe(true);
    expect(canWriteBimJobArtifactsForClaim("bridge-1", "bridge-2")).toBe(false);
    expect(canAccessBimJobOperationsForClaim("", "bridge-1")).toBe(false);
    expect(canAccessBimJobOperationsForClaim("bridge-1", "bridge-1")).toBe(true);
    expect(canAccessBimJobOperationsForClaim("bridge-1", "bridge-2")).toBe(false);
  });

  it("builds the stable 409 ownership mismatch error", () => {
    const error = new BimJobOwnershipError(" job-1 ", " bridge-a ", " bridge-b ");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BimJobOwnershipError");
    expect(error.code).toBe(BIM_JOB_OWNERSHIP_MISMATCH);
    expect(error.statusCode).toBe(409);
    expect(error.jobUid).toBe("job-1");
    expect(error.claimedBy).toBe("bridge-a");
    expect(error.reporterId).toBe("bridge-b");
    expect(error.message).toContain("fue tomado por bridge-a");
    expect(error.message).toContain("no acepta reportes de bridge-b");
  });
});
