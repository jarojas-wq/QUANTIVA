import { describe, expect, it } from "vitest";
import {
  createBimFluencyCheckReport,
  normalizeRevitCancellationProbe,
  normalizeRevitBridgeBackoffProbe,
  normalizeRevitBatchPlanProbe,
  normalizeRevitTransactionFailureProbe,
} from "./bim-fluency-check-domain.mjs";

describe("BIM fluency check domain", () => {
  it("combines cloud worker, realtime UI and Revit C# probes", () => {
    const report = createBimFluencyCheckReport({
      generatedAt: "2026-06-23T15:00:00.000Z",
      cloud: {
        ok: true,
        totalElements: 160000,
        totalBatches: 640,
      },
      realtime: {
        ok: true,
        eventCount: 10004,
        renderReductionPercent: 95.7,
      },
      revit: {
        ok: true,
        batchSize: 250,
        cases: [
          createRevitCase(10000, 40),
          createRevitCase(50000, 200),
          createRevitCase(100000, 400),
        ],
      },
      revitBackoff: createBackoffProbe(),
      revitCancellationProbe: createCancellationProbe(),
      revitTransactionFailureProbe: createTransactionFailureProbe(),
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.generatedAt).toBe("2026-06-23T15:00:00.000Z");
    expect(report.summary).toMatchObject({
      checkCount: 6,
      failedCount: 0,
      totalSimulatedElements: 320000,
      realtimeEvents: 10004,
      realtimeRenderReductionPercent: 95.7,
    });
    expect(report.checks.map((check) => check.id)).toEqual([
      "cloud-worker-load",
      "web-realtime-load",
      "revit-batch-plan",
      "revit-bridge-backoff",
      "revit-cancellation-probe",
      "revit-transaction-failure",
    ]);
  });

  it("fails when any probe misses its fluency contract", () => {
    const report = createBimFluencyCheckReport({
      cloud: { ok: true, totalElements: 160000 },
      realtime: { ok: false, eventCount: 10004, renderReductionPercent: 80 },
      revit: {
        ok: true,
        cases: [
          {
            ...createRevitCase(10000, 40),
            yieldCount: 39,
          },
        ],
      },
      revitBackoff: createBackoffProbe(),
      revitCancellationProbe: createCancellationProbe(),
      revitTransactionFailureProbe: createTransactionFailureProbe(),
    });

    expect(report.ok).toBe(false);
    expect(report.status).toBe("failed");
    expect(report.summary.failedCount).toBe(2);
    expect(report.checks.find((check) => check.id === "web-realtime-load")?.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "revit-batch-plan")?.ok).toBe(false);
  });

  it("normalizes Revit batch plan JSON from the C# benchmark", () => {
    const probe = normalizeRevitBatchPlanProbe({
      ok: true,
      batchSize: 250,
      exitCode: 0,
      cases: [
        createRevitCase(10000, 40),
        createRevitCase(50000, 200),
      ],
    });

    expect(probe.ok).toBe(true);
    expect(probe.details.totalElements).toBe(60000);
    expect(probe.details.totalBatches).toBe(240);
    expect(probe.details.cases[0]).toMatchObject({
      ok: true,
      cancellationProbeCount: 40,
      yieldCount: 40,
      yieldDelayMs: 25,
    });
  });

  it("normalizes Revit bridge backoff JSON from the C# benchmark", () => {
    const probe = normalizeRevitBridgeBackoffProbe(createBackoffProbe());

    expect(probe.ok).toBe(true);
    expect(probe.details).toMatchObject({
      minSeconds: 15,
      maxSeconds: 300,
    });
    expect(probe.details.cases.map((entry) => entry.backoffSeconds)).toEqual([
      0,
      15,
      30,
      60,
      120,
      240,
      300,
      300,
      300,
    ]);
  });

  it("normalizes Revit cancellation probe JSON from the C# benchmark", () => {
    const probe = normalizeRevitCancellationProbe(createCancellationProbe());

    expect(probe.ok).toBe(true);
    expect(probe.details.applyAbortFailureThreshold).toBe(3);
    expect(probe.details.cases).toEqual([
      createCancellationCase("preview", 0, true, false, false),
      createCancellationCase("preview", 5, true, true, false),
      createCancellationCase("apply", 1, true, true, false),
      createCancellationCase("apply", 2, true, true, false),
      createCancellationCase("apply", 3, false, true, true),
      createCancellationCase("apply", 5, false, true, true),
    ]);
    expect(probe.details.remoteStopCases).toEqual([
      createRemoteStopCase("queued", false, ""),
      createRemoteStopCase("running", false, ""),
      createRemoteStopCase("applying", false, ""),
      createRemoteStopCase("cancelled", true, "Cancelado en Itemicostos"),
      createRemoteStopCase("failed", true, "Finalizado en Itemicostos"),
      createRemoteStopCase("completed", true, "Finalizado en Itemicostos"),
    ]);
    expect(probe.details.progressReportCases).toEqual([
      createProgressReportCase("running", "running", false),
      createProgressReportCase("running", "cancelled", true),
      createProgressReportCase("applying", "completed", true),
      createProgressReportCase("completed", "completed", false),
      createProgressReportCase("completed", "cancelled", true),
      createProgressReportCase("failed", "failed", false),
    ]);
    expect(probe.details.operationPageCases).toEqual([
      createOperationPageCase(0, 0, 0),
      createOperationPageCase(1, 1, 0),
      createOperationPageCase(1000, 1, 0),
      createOperationPageCase(1001, 2, 1000),
      createOperationPageCase(100000, 100, 99000),
    ]);
  });

  it("normalizes Revit transaction failure probe JSON from the C# benchmark", () => {
    const probe = normalizeRevitTransactionFailureProbe(createTransactionFailureProbe());

    expect(probe.ok).toBe(true);
    expect(probe.details).toMatchObject({
      stage: "Error de transaccion",
      failureType: "apply-transaction-failure",
    });
    expect(probe.details.cases[0]).toMatchObject({
      batchNumber: 3,
      failedOperationCount: 250,
      committedApplyBatches: 2,
      shouldStopJob: true,
    });
  });
});

function createRevitCase(elementCount, batchCount) {
  return {
    ok: true,
    elementCount,
    batchSize: 250,
    batchCount,
    observedBatches: batchCount,
    cancellationProbeCount: batchCount,
    yieldCount: batchCount,
    yieldDelayMs: 25,
  };
}

function createBackoffProbe() {
  return {
    ok: true,
    minSeconds: 15,
    maxSeconds: 300,
    exitCode: 0,
    cases: [
      createBackoffCase(0, 0),
      createBackoffCase(1, 15),
      createBackoffCase(2, 30),
      createBackoffCase(3, 60),
      createBackoffCase(4, 120),
      createBackoffCase(5, 240),
      createBackoffCase(6, 300),
      createBackoffCase(7, 300),
      createBackoffCase(16, 300),
    ],
  };
}

function createBackoffCase(failureCount, seconds) {
  return {
    ok: true,
    failureCount,
    backoffSeconds: seconds,
    expectedBackoffSeconds: seconds,
  };
}

function createCancellationProbe() {
  return {
    ok: true,
    applyAbortFailureThreshold: 3,
    exitCode: 0,
    cases: [
      createCancellationCase("preview", 0, true, false, false),
      createCancellationCase("preview", 5, true, true, false),
      createCancellationCase("apply", 1, true, true, false),
      createCancellationCase("apply", 2, true, true, false),
      createCancellationCase("apply", 3, false, true, true),
      createCancellationCase("apply", 5, false, true, true),
    ],
    remoteStopCases: [
      createRemoteStopCase("queued", false, ""),
      createRemoteStopCase("running", false, ""),
      createRemoteStopCase("applying", false, ""),
      createRemoteStopCase("cancelled", true, "Cancelado en Itemicostos"),
      createRemoteStopCase("failed", true, "Finalizado en Itemicostos"),
      createRemoteStopCase("completed", true, "Finalizado en Itemicostos"),
    ],
    progressReportCases: [
      createProgressReportCase("running", "running", false),
      createProgressReportCase("running", "cancelled", true),
      createProgressReportCase("applying", "completed", true),
      createProgressReportCase("completed", "completed", false),
      createProgressReportCase("completed", "cancelled", true),
      createProgressReportCase("failed", "failed", false),
    ],
    operationPageCases: [
      createOperationPageCase(0, 0, 0),
      createOperationPageCase(1, 1, 0),
      createOperationPageCase(1000, 1, 0),
      createOperationPageCase(1001, 2, 1000),
      createOperationPageCase(100000, 100, 99000),
    ],
  };
}

function createRemoteStopCase(status, shouldStop, stage) {
  return {
    ok: true,
    status,
    shouldStop,
    stage,
  };
}

function createProgressReportCase(requestedStatus, reportedStatus, shouldStop) {
  return {
    ok: true,
    requestedStatus,
    reportedStatus,
    shouldStop,
  };
}

function createOperationPageCase(operationCount, pageCount, lastOffset) {
  return {
    ok: true,
    operationCount,
    pageSize: 1000,
    pageCount,
    lastOffset,
  };
}

function createTransactionFailureProbe() {
  return {
    ok: true,
    stage: "Error de transaccion",
    failureType: "apply-transaction-failure",
    exitCode: 0,
    cases: [
      {
        ok: true,
        stage: "Error de transaccion",
        failureType: "apply-transaction-failure",
        message: "Fallo la transaccion del lote 3: Parameter is read-only.",
        batchNumber: 3,
        startIndex: 500,
        endIndex: 750,
        failedOperationCount: 250,
        committedApplyBatches: 2,
        shouldStopJob: true,
      },
    ],
  };
}

function createCancellationCase(jobKind, failureCount, shouldContinue, shouldWarn, shouldAbortBeforeNextBatch) {
  return {
    ok: true,
    jobKind,
    failureCount,
    shouldContinue,
    shouldWarn,
    shouldAbortBeforeNextBatch,
  };
}
