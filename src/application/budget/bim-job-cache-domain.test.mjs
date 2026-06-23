import { describe, expect, it } from "vitest";
import {
  buildBimJobCacheKey,
  shouldBypassBimJobCacheRead,
  shouldReadBimJobCache,
  shouldPersistBimJobCache,
  shouldReuseActiveBimJob,
} from "./bim-job-cache-domain.mjs";

describe("BIM job cache domain", () => {
  it("builds a stable cache key from project, command, model version and semantic payload", () => {
    const left = buildBimJobCacheKey(
      "project-1",
      "cloud-model",
      "cloud-model-analysis",
      {
        documentVersion: "v1",
        modelGuid: "model-a",
      },
      {
        batchSize: 250,
        scope: { categories: ["Walls", "Floors"] },
        forceRefresh: true,
      },
    );
    const right = buildBimJobCacheKey(
      "project-1",
      "cloud-model",
      "cloud-model-analysis",
      {
        modelGuid: "model-a",
        documentVersion: "v1",
      },
      {
        forceRefresh: false,
        scope: { categories: ["Walls", "Floors"] },
        batchSize: 500,
      },
    );

    expect(left?.hash).toBe(right?.hash);
    expect(left?.identity.payload).toEqual({ scope: { categories: ["Walls", "Floors"] } });
  });

  it("requires a versioned model identity before caching heavy BIM results", () => {
    expect(buildBimJobCacheKey("project-1", "active-revit", "active-revit-preview", {}, {})).toBeNull();
    expect(buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", { modelGuid: "model-a" }, {})).toBeNull();
    expect(buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", { documentVersion: "v1" }, {})).toBeNull();
    expect(buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", {
      documentUid: "doc-1",
      modelVersion: "v1",
    }, {})).not.toBeNull();
    expect(buildBimJobCacheKey("project-1", "active-revit", "active-revit-preview", { modelPath: "C:/tmp/model.rvt" }, {})).toBeNull();
    expect(buildBimJobCacheKey("project-1", "active-revit", "active-revit-preview", {
      modelPath: "C:/tmp/model.rvt",
      exportedAt: "2026-06-22T10:00:00.000Z",
    }, {})).not.toBeNull();
  });

  it("separates cache entries when the same model has a new document version", () => {
    const v1 = buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", {
      modelGuid: "model-a",
      documentVersion: "v1",
    }, { scope: "full" });
    const v2 = buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", {
      modelGuid: "model-a",
      documentVersion: "v2",
    }, { scope: "full" });

    expect(v1?.hash).not.toBe(v2?.hash);
  });

  it("normalizes legacy path/export identities to avoid duplicate cache buckets", () => {
    const left = buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", {
      modelPath: "C:/TMP/Model.rvt/",
      exportedAt: "2026-06-22T10:00:00.000Z",
    }, { scope: "full" });
    const right = buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", {
      modelPath: "c:\\tmp\\model.rvt\\\\",
      exportedAt: "2026-06-22T10:00:00.000Z",
    }, { scope: "full" });

    expect(left?.hash).toBe(right?.hash);
    expect(left?.identity.modelPath).toBe("c:\\tmp\\model.rvt");
  });

  it("separates cache entries when semantic payload options change", () => {
    const baseIdentity = { modelGuid: "model-a", documentVersion: "v1" };
    const fullModel = buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", baseIdentity, {
      scope: "full",
    });
    const architectureOnly = buildBimJobCacheKey("project-1", "cloud-model", "cloud-model-analysis", baseIdentity, {
      scope: "architecture",
    });

    expect(fullModel?.hash).not.toBe(architectureOnly?.hash);
  });

  it("bypasses reads for refresh/skip controls but only persists reusable analysis jobs", () => {
    expect(shouldBypassBimJobCacheRead({ forceRefresh: true })).toBe(true);
    expect(shouldBypassBimJobCacheRead({ cacheMode: "refresh" })).toBe(true);
    expect(shouldBypassBimJobCacheRead({ cacheMode: "skip" })).toBe(true);
    expect(shouldBypassBimJobCacheRead({ scope: "full" })).toBe(false);

    expect(shouldReadBimJobCache({ scope: "full" }, "cloud-model-analysis")).toBe(true);
    expect(shouldReadBimJobCache({ scope: "full" }, "active-revit-preview")).toBe(false);
    expect(shouldPersistBimJobCache({ cacheMode: "refresh" }, "cloud-model-analysis")).toBe(true);
    expect(shouldPersistBimJobCache({ cacheMode: "skip" }, "cloud-model-analysis")).toBe(false);
    expect(shouldPersistBimJobCache({}, "active-revit-preview")).toBe(false);
    expect(shouldPersistBimJobCache({}, "active-revit-apply")).toBe(false);
  });

  it("reuses active jobs for non-refresh analysis commands without persisting Revit apply previews", () => {
    expect(shouldReuseActiveBimJob({ scope: "full" }, "cloud-model-analysis")).toBe(true);
    expect(shouldReuseActiveBimJob({ forceRefresh: true }, "cloud-model-analysis")).toBe(false);
    expect(shouldReuseActiveBimJob({ cacheMode: "refresh" }, "cloud-model-analysis")).toBe(false);
    expect(shouldReuseActiveBimJob({ cacheMode: "skip" }, "cloud-model-analysis")).toBe(false);
    expect(shouldReuseActiveBimJob({}, "active-revit-preview")).toBe(true);
    expect(shouldReuseActiveBimJob({}, "active-revit-apply")).toBe(false);
  });
});
