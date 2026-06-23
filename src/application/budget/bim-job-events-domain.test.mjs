import { describe, expect, it } from "vitest";
import {
  createBimJobSseSignature,
  shouldEmitBimJobSseUpdate,
} from "./bim-job-events-domain.mjs";

describe("BIM job events domain", () => {
  it("emits realtime updates when percent changes inside the same database timestamp", () => {
    const baseJob = {
      id: "job-1",
      status: "running",
      stage: "Analizando por lotes",
      percent: 10,
      updatedAt: "2026-06-23T18:00:00.000Z",
      logs: [],
    };
    const first = shouldEmitBimJobSseUpdate(baseJob, "");
    const next = shouldEmitBimJobSseUpdate({
      ...baseJob,
      percent: 12,
    }, first.signature);

    expect(first.shouldEmit).toBe(true);
    expect(next.shouldEmit).toBe(true);
  });

  it("keeps result signature stable for equivalent object key order", () => {
    const left = createBimJobSseSignature({
      id: "job-1",
      status: "running",
      result: {
        plannedBatches: 4,
        fluencyStatus: "ok",
      },
    });
    const right = createBimJobSseSignature({
      id: "job-1",
      status: "running",
      result: {
        fluencyStatus: "ok",
        plannedBatches: 4,
      },
    });

    expect(right).toBe(left);
  });

  it("suppresses duplicate realtime payloads without hiding terminal changes", () => {
    const running = {
      id: "job-1",
      status: "running",
      percent: 95,
      updatedAt: "2026-06-23T18:00:01.000Z",
      logs: [{ id: "log-1" }],
    };
    const runningSignature = createBimJobSseSignature(running);

    expect(shouldEmitBimJobSseUpdate(running, runningSignature)).toEqual({
      shouldEmit: false,
      signature: runningSignature,
    });
    expect(shouldEmitBimJobSseUpdate({
      ...running,
      status: "completed",
      completedAt: "2026-06-23T18:00:02.000Z",
      percent: 100,
    }, runningSignature).shouldEmit).toBe(true);
  });
});
