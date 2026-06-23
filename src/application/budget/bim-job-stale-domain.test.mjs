import { describe, expect, it } from "vitest";
import {
  BIM_JOB_STALE_ACTIVE_STATUSES,
  buildBimJobStaleExpirationError,
  buildBimJobStaleExpirationLogMessage,
  createBimJobStaleExpirationPlan,
  normalizeBimJobStaleMinutes,
  resolveBimJobStaleCutoff,
} from "./bim-job-stale-domain.mjs";

describe("BIM job stale domain", () => {
  it("normalizes stale heartbeat windows inside operational bounds", () => {
    expect(BIM_JOB_STALE_ACTIVE_STATUSES).toEqual(["claimed", "running", "applying"]);
    expect(normalizeBimJobStaleMinutes("2")).toBe(5);
    expect(normalizeBimJobStaleMinutes("60")).toBe(60);
    expect(normalizeBimJobStaleMinutes("9999")).toBe(1440);
    expect(normalizeBimJobStaleMinutes("", 45)).toBe(45);
  });

  it("creates a deterministic cutoff for MySQL stale sweeps", () => {
    const cutoff = resolveBimJobStaleCutoff({
      now: "2026-06-23T15:00:00.000Z",
      staleMinutes: 30,
    });

    expect(cutoff.staleMinutes).toBe(30);
    expect(cutoff.cutoffIso).toBe("2026-06-23T14:30:00.000Z");
  });

  it("selects only active jobs older than the heartbeat lease", () => {
    const plan = createBimJobStaleExpirationPlan([
      {
        job_id: 1,
        job_uid: "claimed-old",
        status_name: "claimed",
        claimed_by: "revit-a",
        updated_at: "2026-06-23T14:20:00.000Z",
      },
      {
        job_id: 2,
        job_uid: "running-recent",
        status_name: "running",
        claimed_by: "revit-b",
        updated_at: "2026-06-23T14:45:00.000Z",
      },
      {
        job_id: 3,
        job_uid: "queued-old",
        status_name: "queued",
        updated_at: "2026-06-23T13:00:00.000Z",
      },
      {
        job_id: 4,
        job_uid: "applying-old",
        status_name: "applying",
        claimed_by: "worker-c",
        updated_at: "2026-06-23T14:00:00.000Z",
      },
      {
        job_id: 5,
        job_uid: "completed-old",
        status_name: "completed",
        updated_at: "2026-06-23T13:00:00.000Z",
      },
    ], {
      now: "2026-06-23T15:00:00.000Z",
      staleMinutes: 30,
    });

    expect(plan.expiredJobIds).toEqual([1, 4]);
    expect(plan.expiredCount).toBe(2);
    expect(plan.expiredJobs[0]).toMatchObject({
      jobUid: "claimed-old",
      status: "claimed",
      claimedBy: "revit-a",
      staleForSeconds: 2400,
    });
    expect(plan.errorMessage).toBe("Job marcado como fallido por falta de heartbeat durante 30 minutos.");
    expect(plan.expiredJobs[0].logMessage).toContain("Ejecutor: revit-a.");
  });

  it("builds stable operator-facing stale messages", () => {
    expect(buildBimJobStaleExpirationError(15)).toBe(
      "Job marcado como fallido por falta de heartbeat durante 15 minutos.",
    );
    expect(buildBimJobStaleExpirationLogMessage({
      status: "applying",
      claimedBy: "bridge-1",
    }, 15)).toBe(
      "Job expirado desde estado applying por falta de heartbeat durante 15 minutos. Ejecutor: bridge-1.",
    );
  });
});
