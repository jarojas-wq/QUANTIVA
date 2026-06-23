import { describe, expect, it } from "vitest";
import {
  canCreateBimApplyJobFromPreview,
  getDirectBimApplyJobCreateIssue,
  hasExecutableBimApplyPlan,
  isBimApplyCommand,
  isBimApplyPlanBoundToPreview,
  normalizeBimApplyPlan,
  resolveBimApplyJobBatchSize,
} from "./bim-apply-plan-domain.mjs";

describe("BIM apply plan domain", () => {
  it("normalizes compact Revit preview apply plans", () => {
    const plan = normalizeBimApplyPlan({
      schemaVersion: "1",
      sourceJobId: "preview-1",
      executionMode: "apply",
      operationType: "parameter-write",
      elementCount: "1200",
      batchSize: "250",
      plannedBatches: "5",
      transactionMode: "per-batch",
      operations: [
        {
          elementId: "101",
          parameterName: "ITEMICOSTOS_TEST",
          value: "ABC",
        },
      ],
    });

    expect(plan).toMatchObject({
      schemaVersion: 1,
      sourceJobId: "preview-1",
      operationType: "parameter-write",
      operationCount: 1,
      elementCount: 1200,
      batchSize: 250,
      plannedBatches: 5,
      transactionMode: "per-batch",
      requiresActiveModelIdentity: true,
      requiresApplyConfirmation: true,
    });
    expect(plan.operations[0]).toMatchObject({
      operationType: "parameter-write",
      elementId: 101,
      parameterName: "ITEMICOSTOS_TEST",
      value: "ABC",
    });
    expect(hasExecutableBimApplyPlan(plan)).toBe(true);
  });

  it("rejects previews without executable operations", () => {
    const emptyPlan = {
      operationType: "parameter-write",
      operationCount: 0,
      plannedBatches: 0,
    };
    const missingOperationType = {
      operationCount: 25,
      plannedBatches: 1,
    };

    expect(hasExecutableBimApplyPlan(emptyPlan)).toBe(false);
    expect(hasExecutableBimApplyPlan(missingOperationType)).toBe(false);
  });

  it("treats paged operation sources as executable apply plans", () => {
    const plan = normalizeBimApplyPlan({
      operationType: "parameter-write",
      sourceJobId: "job-1",
      operationCount: 5000,
      plannedBatches: 20,
      transactionMode: "per-batch",
      operationsSource: {
        kind: "mysql",
        jobId: "job-1",
        source: "result-apply-plan",
        operationCount: 5000,
        pageSize: 1000,
      },
    });

    expect(plan.operations).toHaveLength(0);
    expect(plan.operationsSource).toMatchObject({
      kind: "mysql",
      jobId: "job-1",
      source: "result-apply-plan",
      operationCount: 5000,
      pageSize: 1000,
    });
    expect(hasExecutableBimApplyPlan(plan)).toBe(true);
    expect(isBimApplyPlanBoundToPreview(plan, "job-1")).toBe(true);
    expect(isBimApplyPlanBoundToPreview({
      ...plan,
      operationsSource: { ...plan.operationsSource, jobId: "another-preview" },
    }, "job-1")).toBe(false);
  });

  it("blocks direct apply job creation from the generic jobs endpoint", () => {
    expect(isBimApplyCommand("active-revit-apply")).toBe(true);
    expect(isBimApplyCommand("active-revit:apply")).toBe(true);
    expect(isBimApplyCommand("active-revit-preview")).toBe(false);
    expect(getDirectBimApplyJobCreateIssue({
      commandType: "active-revit-apply",
      modelIdentity: {
        modelGuid: "model-1",
      },
    })).toContain("/api/bim/jobs/:id/apply");
    expect(getDirectBimApplyJobCreateIssue({
      commandType: "active-revit-preview",
    })).toBe("");
  });

  it("resolves apply batch size from the apply plan before falling back to preview payload", () => {
    expect(resolveBimApplyJobBatchSize({ batchSize: 125 }, { batchSize: 500 })).toBe(125);
    expect(resolveBimApplyJobBatchSize({ batchSize: 1 }, { batchSize: 500 })).toBe(25);
    expect(resolveBimApplyJobBatchSize({ batchSize: 999999 }, { batchSize: 500 })).toBe(5000);
    expect(resolveBimApplyJobBatchSize({}, { batchSize: 400 })).toBe(400);
    expect(resolveBimApplyJobBatchSize({}, {})).toBe(250);
  });

  it("allows apply creation only from completed active Revit previews with an apply plan", () => {
    const applyPlan = {
      sourceJobId: "preview-1",
      operationType: "active-revit-batch-apply",
      operationCount: 25,
      elementCount: 25,
      batchSize: 25,
      plannedBatches: 1,
      transactionMode: "per-batch",
      operations: [
        {
          elementId: 101,
          parameterName: "ITEMICOSTOS_TEST",
          value: "ABC",
        },
      ],
    };
    const preview = {
      id: "preview-1",
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      status: "completed",
      modelIdentity: {
        modelGuid: "model-1",
      },
      result: {
        requiresApplyConfirmation: true,
        applyPlan,
      },
    };

    expect(canCreateBimApplyJobFromPreview(preview)).toBe(true);
    expect(canCreateBimApplyJobFromPreview({
      ...preview,
      modelIdentity: {},
    })).toBe(false);
    expect(canCreateBimApplyJobFromPreview({
      ...preview,
      result: {
        requiresApplyConfirmation: true,
        applyPlan: { ...applyPlan, sourceJobId: "other-preview" },
      },
    })).toBe(false);
    expect(canCreateBimApplyJobFromPreview({
      ...preview,
      result: {
        requiresApplyConfirmation: true,
        applyPlan: { ...applyPlan, sourceJobId: "" },
      },
    })).toBe(false);
    expect(canCreateBimApplyJobFromPreview({
      ...preview,
      result: { requiresApplyConfirmation: true },
    })).toBe(false);
    expect(canCreateBimApplyJobFromPreview({
      ...preview,
      commandType: "active-revit-apply",
    })).toBe(false);
    expect(canCreateBimApplyJobFromPreview({
      ...preview,
      targetMode: "cloud-model",
    })).toBe(false);
  });
});
