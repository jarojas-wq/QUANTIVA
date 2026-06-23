import { describe, expect, it } from "vitest";
import {
  detachBimJobOperationsForStorage,
  normalizeBimJobOperationSource,
  normalizeBimJobOperationsUpload,
  normalizeBimJobOperationsForStorage,
  planBimJobOperationUploadPages,
} from "./bim-job-operations-domain.mjs";

describe("BIM job operations domain", () => {
  it("detaches 100k inline parameter writes from the persisted payload", () => {
    const operations = Array.from({ length: 100000 }, (_, index) => ({
      operationType: "parameter-write",
      elementId: index + 1,
      parameterName: "ITEMICOSTOS_CODIGO",
      value: `P-${index + 1}`,
    }));

    const result = detachBimJobOperationsForStorage({
      command: "active-revit-preview",
      batchSize: 250,
      operations,
    }, {
      jobUid: "job-large-100k",
      source: "payload",
      pageSize: 1000,
    });

    expect(result.source).toBe("payload");
    expect(result.operations).toHaveLength(100000);
    expect(result.operations[99999]).toMatchObject({
      operationType: "parameter-write",
      elementId: 100000,
      parameterName: "ITEMICOSTOS_CODIGO",
      value: "P-100000",
    });
    expect(result.payloadObject.operations).toBeUndefined();
    expect(result.payloadObject.operationsSource).toMatchObject({
      kind: "mysql",
      jobId: "job-large-100k",
      source: "payload",
      endpoint: "/api/bim/bridge/jobs/job-large-100k/operations",
      operationCount: 100000,
      pageSize: 1000,
      batchSize: 250,
    });
    expect(JSON.stringify(result.payloadObject).length).toBeLessThan(500);
  });

  it("detaches apply plan operations without duplicating top-level payload writes", () => {
    const topLevelOperations = [{
      elementId: 10,
      parameterName: "IGNORED_TOP_LEVEL",
      value: "old",
    }];
    const applyOperations = [{
      type: "write-parameter",
      revitElementId: "42",
      targetParameter: "ITEMICOSTOS_COSTO",
      targetValue: "123.45",
    }];

    const result = detachBimJobOperationsForStorage({
      operations: topLevelOperations,
      applyPlan: {
        operationType: "parameter-write",
        plannedBatches: 1,
        batchSize: 50,
        parameterWrites: applyOperations,
      },
    }, {
      jobUid: "preview-1",
      source: "result-apply-plan",
      applyPlanOnly: true,
      pageSize: 2500,
    });

    expect(result.operations).toEqual([{
      operationType: "parameter-write",
      elementId: 42,
      elementUniqueId: "",
      parameterName: "ITEMICOSTOS_COSTO",
      value: "123.45",
    }]);
    expect(result.payloadObject.operations).toBe(topLevelOperations);
    expect(result.payloadObject.applyPlan.parameterWrites).toBeUndefined();
    expect(result.payloadObject.applyPlan.operationsSource).toMatchObject({
      kind: "mysql",
      jobId: "preview-1",
      source: "result-apply-plan",
      operationCount: 1,
      pageSize: 2500,
      batchSize: 50,
    });
  });

  it("normalizes only executable parameter write operations and known storage sources", () => {
    expect(normalizeBimJobOperationSource("RESULT-APPLY-PLAN")).toBe("result-apply-plan");
    expect(normalizeBimJobOperationSource("bad-source", "payload")).toBe("payload");
    expect(normalizeBimJobOperationsForStorage([
      { type: "write-parameter", uniqueId: "abc", parameter: "A", textValue: "1" },
      { operationType: "delete", elementId: 1, parameterName: "B", value: "2" },
      { operationType: "parameter-write", elementId: 0, parameterName: "C", value: "3" },
      { operationType: "parameter-write", elementId: 2, parameterName: "", value: "4" },
    ])).toEqual([{
      operationType: "parameter-write",
      elementId: 0,
      elementUniqueId: "abc",
      parameterName: "A",
      value: "1",
    }]);
  });

  it("normalizes bridge operation upload requests without trusting invalid offsets or sources", () => {
    const upload = normalizeBimJobOperationsUpload({
      source: "bad-source",
      mode: "replace",
      offset: 500,
      operations: [
        { elementId: "11", parameterName: "A", value: "ok" },
        { elementId: "", parameterName: "B", value: "ignored" },
      ],
    });

    expect(upload).toEqual({
      source: "payload",
      mode: "replace",
      offset: 0,
      operations: [{
        operationType: "parameter-write",
        elementId: 11,
        elementUniqueId: "",
        parameterName: "A",
        value: "ok",
      }],
    });

    expect(normalizeBimJobOperationsUpload({
      source: "result-apply-plan",
      mode: "append",
      offset: "2000",
      operations: [],
    })).toMatchObject({
      source: "result-apply-plan",
      mode: "append",
      offset: 2000,
      operations: [],
    });
  });

  it("plans 100k applicable operations as deterministic bridge upload pages", () => {
    const operations = Array.from({ length: 100000 }, (_, index) => ({
      elementId: index + 1,
      parameterName: "ITEMICOSTOS_CODIGO",
      value: String(index + 1),
    }));

    const plan = planBimJobOperationUploadPages(operations, {
      source: "result-apply-plan",
      pageSize: 1000,
    });

    expect(plan).toMatchObject({
      source: "result-apply-plan",
      pageSize: 1000,
      operationCount: 100000,
      pageCount: 100,
    });
    expect(plan.pages[0]).toMatchObject({
      mode: "replace",
      offset: 0,
      pageIndex: 0,
    });
    expect(plan.pages[0].operations).toHaveLength(1000);
    expect(plan.pages[99]).toMatchObject({
      mode: "append",
      offset: 99000,
      pageIndex: 99,
    });
    expect(plan.pages[99].operations[999]).toMatchObject({
      elementId: 100000,
      parameterName: "ITEMICOSTOS_CODIGO",
      value: "100000",
    });
  });
});
