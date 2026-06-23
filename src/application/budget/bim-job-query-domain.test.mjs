import { describe, expect, it } from "vitest";
import {
  BIM_JOB_DETAIL_NOT_FOUND_MESSAGE,
  createBimJobDetailResponse,
} from "./bim-job-query-domain.mjs";

describe("BIM job query domain", () => {
  it("creates the stable detail payload for an existing BIM job", () => {
    const job = {
      id: "job-1",
      projectId: "project-1",
      status: "running",
      percent: 45,
      logs: [{ id: "log-1", message: "Procesando" }],
      result: { stage: "analisis" },
    };

    expect(createBimJobDetailResponse(job)).toEqual({
      ok: true,
      status: 200,
      body: {
        ok: true,
        job,
      },
    });
  });

  it("returns the same not-found contract for missing or invalid jobs", () => {
    expect(createBimJobDetailResponse(null)).toEqual({
      ok: false,
      status: 404,
      body: {
        ok: false,
        error: BIM_JOB_DETAIL_NOT_FOUND_MESSAGE,
      },
    });
    expect(createBimJobDetailResponse({ id: " " })).toMatchObject({
      ok: false,
      status: 404,
      body: {
        error: BIM_JOB_DETAIL_NOT_FOUND_MESSAGE,
      },
    });
  });
});
