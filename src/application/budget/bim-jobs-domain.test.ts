import { describe, expect, it } from "vitest";
import {
  BIM_JOB_REALTIME_FLUSH_MS,
  canCreateBimApplyJob,
  canRetryBimJob,
  getActiveRevitReadinessLabel,
  getActiveRevitReadinessMissingSummary,
  getActiveRevitReadinessTone,
  getBimJobCreateModelIdentityIssue,
  getBimJobBridgeWaitDiagnostic,
  getBimJobFluencyMetrics,
  getBimJobStatusLabel,
  getBimJobTargetModeLabel,
  getBimReadinessLabel,
  getBimReadinessMissingSummary,
  getBimReadinessTone,
  hasExecutableBimApplyPlan,
  hasBimApplyJobForPreview,
  isBimApplyPlanBoundToPreview,
  isBimJobFinished,
  normalizeBimApplyPlan,
  normalizeBimJobQueueSummary,
  normalizeBimJobFluencyStatus,
  normalizeBimJobRecord,
  normalizeBimJobRecords,
  normalizeBimReadinessReport,
  requiresBimJobCreateModelIdentity,
  resolveActiveRevitJobModelIdentity,
  planBimJobRealtimeCommits,
  planBimJobRealtimePanelCommits,
  selectActiveRevitReadinessVisibleChecks,
  selectBimReadinessVisibleChecks,
  selectBimJobsForRealtime,
  summarizeBimJobRealtimePanelLoad,
  upsertBimJobRecord
} from "./bim-jobs-domain";

describe("BIM jobs domain", () => {
  it("normalizes invalid job data with safe defaults", () => {
    const job = normalizeBimJobRecord({
      id: "job-1",
      projectId: "project-1",
      targetMode: "bad",
      status: "bad",
      percent: 150,
      commandType: "",
      logs: [{ id: "log-1", level: "error", message: "Fallo", createdAt: "2026-06-22T10:00:00.000Z" }]
    });

    expect(job.targetMode).toBe("active-revit");
    expect(job.status).toBe("queued");
    expect(job.percent).toBe(100);
    expect(job.commandType).toBe("bim-analysis");
    expect(job.logs[0].level).toBe("error");
    expect(normalizeBimJobRecord({
      id: "timed",
      claimedAt: "2026-06-22T10:01:00.000Z",
      queueWaitSeconds: 60,
      runSeconds: 300,
      totalSeconds: 360
    })).toMatchObject({
      claimedAt: "2026-06-22T10:01:00.000Z",
      queueWaitSeconds: 60,
      runSeconds: 300,
      totalSeconds: 360
    });
  });

  it("labels statuses and finished states for the UI", () => {
    expect(getBimJobStatusLabel("running")).toBe("Analizando");
    expect(getBimJobTargetModeLabel("cloud-model")).toBe("Backend BIM");
    expect(isBimJobFinished("completed")).toBe(true);
    expect(isBimJobFinished("applying")).toBe(false);
    expect(normalizeBimJobRecords([{ id: "a" }])).toHaveLength(1);
    expect(canRetryBimJob(normalizeBimJobRecord({
      id: "analysis-done",
      status: "failed",
      commandType: "cloud-model-analysis"
    }))).toBe(true);
    expect(canRetryBimJob(normalizeBimJobRecord({
      id: "apply-done",
      status: "failed",
      commandType: "active-revit-apply"
    }))).toBe(false);
    expect(canRetryBimJob(normalizeBimJobRecord({
      id: "apply-done-colon",
      status: "cancelled",
      commandType: "active-revit:apply"
    }))).toBe(false);
  });

  it("guards web-created active Revit preview jobs without stable model identity", () => {
    expect(requiresBimJobCreateModelIdentity("active-revit", "active-revit-preview")).toBe(true);
    expect(requiresBimJobCreateModelIdentity("active-revit", "active-revit-apply")).toBe(true);
    expect(requiresBimJobCreateModelIdentity("cloud-model", "cloud-model-analysis")).toBe(false);
    expect(getBimJobCreateModelIdentityIssue("active-revit", "active-revit-preview", {
      modelGuid: "model-1"
    })).toBe("");
    expect(getBimJobCreateModelIdentityIssue("active-revit", "active-revit-preview", {
      documentTitle: "Modelo sin identidad estable"
    })).toContain("modelGuid");
  });

  it("prefers the online Revit bridge identity when creating active Revit jobs", () => {
    const identity = resolveActiveRevitJobModelIdentity({
      projectName: "Proyecto BIM",
      latestRevitExport: {
        uid: "old-export",
        modelGuid: "old-model",
        documentUid: "old-document",
        modelPath: "C:/old/model.rvt",
        exportedAt: "2026-06-20T10:00:00.000Z",
      },
      bridgePresence: {
        online: true,
        latestBridgeId: "revit-local",
        latestSeenAt: "2026-06-23T21:00:00.000Z",
        latestModelIdentity: {
          modelGuid: "live-model",
          documentUid: "live-document",
          modelPath: "C:/live/model.rvt",
          documentVersion: "file:123",
          bridgeDiagnostic: { canClaim: false },
        },
      },
    });

    expect(identity).toMatchObject({
      source: "active-revit-bridge",
      projectName: "Proyecto BIM",
      modelGuid: "live-model",
      documentUid: "live-document",
      modelPath: "C:/live/model.rvt",
      documentVersion: "file:123",
      bridgeId: "revit-local",
      bridgeSeenAt: "2026-06-23T21:00:00.000Z",
    });
    expect(identity).not.toHaveProperty("bridgeDiagnostic");
    expect(getBimJobCreateModelIdentityIssue("active-revit", "active-revit-preview", identity)).toBe("");
  });

  it("falls back to the latest Revit export identity when no bridge is online", () => {
    const identity = resolveActiveRevitJobModelIdentity({
      projectName: "Proyecto BIM",
      latestRevitExport: {
        uid: "export-1",
        modelGuid: "export-model",
        documentUid: "export-document",
        modelPath: "C:/export/model.rvt",
        exportedAt: "2026-06-20T10:00:00.000Z",
      },
      bridgePresence: {
        online: false,
        latestModelIdentity: {
          modelGuid: "ignored-live-model",
        },
      },
    });

    expect(identity).toMatchObject({
      source: "revit-export",
      projectName: "Proyecto BIM",
      modelGuid: "export-model",
      documentUid: "export-document",
      modelPath: "C:/export/model.rvt",
      documentVersion: "export-1",
      revitExportUid: "export-1",
      exportedAt: "2026-06-20T10:00:00.000Z",
    });
  });

  it("allows an apply job only after a completed active Revit preview", () => {
    const applyPlan = {
      sourceJobId: "preview-1",
      operationType: "parameter-write",
      operationCount: 25,
      elementCount: 25,
      batchSize: 25,
      plannedBatches: 1,
      transactionMode: "per-batch",
      operations: [
        {
          elementId: 101,
          parameterName: "ITEMICOSTOS_TEST",
          value: "ABC"
        }
      ]
    };
    const preview = normalizeBimJobRecord({
      id: "preview-1",
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      status: "completed",
      modelIdentity: {
        modelGuid: "model-1"
      },
      result: { requiresApplyConfirmation: true, applyPlan }
    });
    const apply = normalizeBimJobRecord({
      id: "apply-1",
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-apply",
      status: "queued",
      payload: { sourceJobId: "preview-1" }
    });
    const previewWithoutSignal = normalizeBimJobRecord({
      id: "preview-no-signal",
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      status: "completed",
      result: {}
    });
    const nonPreviewWithSignal = normalizeBimJobRecord({
      id: "analysis-1",
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-analysis",
      status: "completed",
      result: { requiresApplyConfirmation: true, applyPlan }
    });
    const previewWithoutPlan = normalizeBimJobRecord({
      id: "preview-no-plan",
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      status: "completed",
      modelIdentity: {
        modelGuid: "model-1"
      },
      result: { requiresApplyConfirmation: true }
    });
    const previewWithoutModelIdentity = normalizeBimJobRecord({
      id: "preview-no-model",
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      status: "completed",
      result: { requiresApplyConfirmation: true, applyPlan: { ...applyPlan, sourceJobId: "preview-no-model" } }
    });

    expect(canCreateBimApplyJob(preview)).toBe(true);
    expect(canCreateBimApplyJob(previewWithoutModelIdentity)).toBe(false);
    expect(canCreateBimApplyJob(normalizeBimJobRecord({
      ...preview,
      result: {
        requiresApplyConfirmation: true,
        applyPlan: {
          ...applyPlan,
          sourceJobId: "another-preview"
        }
      }
    }))).toBe(false);
    expect(canCreateBimApplyJob(normalizeBimJobRecord({
      ...preview,
      result: {
        requiresApplyConfirmation: true,
        applyPlan: {
          ...applyPlan,
          sourceJobId: ""
        }
      }
    }))).toBe(false);
    expect(canCreateBimApplyJob(apply)).toBe(false);
    expect(canCreateBimApplyJob(previewWithoutSignal)).toBe(false);
    expect(canCreateBimApplyJob(previewWithoutPlan)).toBe(false);
    expect(canCreateBimApplyJob(nonPreviewWithSignal)).toBe(false);
    expect(hasBimApplyJobForPreview([preview, apply], "preview-1")).toBe(true);
  });

  it("normalizes executable BIM apply plans for preview confirmation", () => {
    const plan = normalizeBimApplyPlan({
      sourceJobId: "preview-1",
      operationType: "parameter-write",
      elementCount: "1200",
      plannedBatches: "5",
      operations: [
        {
          elementId: "101",
          parameterName: "ITEMICOSTOS_TEST",
          value: "ABC"
        }
      ]
    });

    expect(plan.operationCount).toBe(1);
    expect(plan.batchSize).toBe(250);
    expect(plan.requiresApplyConfirmation).toBe(true);
    expect(plan.operations[0].elementId).toBe(101);
    expect(hasExecutableBimApplyPlan(plan)).toBe(true);
    expect(isBimApplyPlanBoundToPreview(plan, "preview-1")).toBe(true);
    expect(isBimApplyPlanBoundToPreview({
      ...plan,
      operationsSource: {
        kind: "mysql",
        jobId: "other-preview",
        source: "result-apply-plan",
        operationCount: 25,
        pageSize: 1000
      }
    }, "preview-1")).toBe(false);
    expect(hasExecutableBimApplyPlan({ operationCount: 0, plannedBatches: 0, operationType: "parameter-write" })).toBe(false);
  });

  it("extracts Revit batch fluency metrics from job results", () => {
    const job = normalizeBimJobRecord({
      id: "job-metrics",
      targetMode: "active-revit",
      status: "running",
      result: {
        fluencyStatus: "warning",
        recordedBatchCount: 4,
        plannedBatches: 40,
        batchSize: 250,
        yieldDelayMs: 25,
        lastBatchDurationMs: 16,
        averageBatchDurationMs: 18,
        maxBatchDurationMs: 34,
        totalBatchDurationMs: 72
      }
    });

    expect(getBimJobFluencyMetrics(job)).toEqual({
      status: "warning",
      processedBatches: 4,
      plannedBatches: 40,
      batchSize: 250,
      yieldDelayMs: 25,
      lastBatchDurationMs: 16,
      averageBatchDurationMs: 18,
      maxBatchDurationMs: 34,
      totalBatchDurationMs: 72
    });
    expect(getBimJobFluencyMetrics(normalizeBimJobRecord({ id: "empty" }))).toBeNull();
    expect(normalizeBimJobFluencyStatus("", 100, 200)).toBe("ok");
    expect(normalizeBimJobFluencyStatus("", 100, 800)).toBe("warning");
    expect(normalizeBimJobFluencyStatus("", 2100, 800)).toBe("critical");
    expect(normalizeBimJobFluencyStatus("critical", 10, 10)).toBe("critical");
  });

  it("normalizes queue summaries for operational health indicators", () => {
    const summary = normalizeBimJobQueueSummary({
      total: "9",
      queued: "2",
      active: "3",
      completed: "4",
      failed: "1",
      cancelled: "0",
      activeRevit: "2",
      activeRevitQueued: "1",
      activeRevitProcessing: "1",
      cloudModel: "1",
      cloudModelQueued: "0",
      cloudModelProcessing: "1",
      oldestQueuedAgeSeconds: "130",
      oldestActiveRevitQueuedAt: "2026-06-22T09:58:00.000Z",
      oldestActiveRevitQueuedAgeSeconds: "125",
      oldestActiveAgeSeconds: "125",
      generatedAt: "2026-06-22T10:00:00.000Z"
    });

    expect(summary.total).toBe(9);
    expect(summary.active).toBe(3);
    expect(summary.activeRevit).toBe(2);
    expect(summary.activeRevitQueued).toBe(1);
    expect(summary.activeRevitProcessing).toBe(1);
    expect(summary.cloudModel).toBe(1);
    expect(summary.cloudModelQueued).toBe(0);
    expect(summary.cloudModelProcessing).toBe(1);
    expect(summary.oldestQueuedAgeSeconds).toBe(130);
    expect(summary.oldestActiveRevitQueuedAt).toBe("2026-06-22T09:58:00.000Z");
    expect(summary.oldestActiveRevitQueuedAgeSeconds).toBe(125);
    expect(summary.oldestActiveAgeSeconds).toBe(125);
  });

  it("flags active Revit jobs that wait too long for the bridge", () => {
    const fresh = normalizeBimJobQueueSummary({
      activeRevit: 1,
      activeRevitQueued: 1,
      oldestActiveRevitQueuedAgeSeconds: 30
    });
    const waiting = normalizeBimJobQueueSummary({
      activeRevit: 1,
      activeRevitQueued: 1,
      oldestActiveRevitQueuedAgeSeconds: 180
    });
    const stale = normalizeBimJobQueueSummary({
      activeRevit: 2,
      activeRevitQueued: 2,
      oldestActiveRevitQueuedAgeSeconds: 620
    });
    const modelMismatch = normalizeBimJobQueueSummary({
      activeRevit: 1,
      activeRevitQueued: 1,
      oldestActiveRevitQueuedAgeSeconds: 620,
      bridgePresence: {
        online: true,
        onlineCount: 1,
        knownCount: 1,
        latestBridgeId: "bridge-live",
        latestSeenAt: "2026-06-22T10:00:00.000Z"
      }
    });
    const idle = normalizeBimJobQueueSummary({ activeRevit: 0 });

    expect(getBimJobBridgeWaitDiagnostic(idle)).toMatchObject({
      tone: "ok",
      requiresBridgeAttention: false
    });
    expect(getBimJobBridgeWaitDiagnostic(fresh)).toMatchObject({
      tone: "ok",
      label: "Revit en cola",
      requiresBridgeAttention: false
    });
    expect(getBimJobBridgeWaitDiagnostic(waiting)).toMatchObject({
      tone: "warning",
      label: "Esperando Revit Bridge",
      reason: "bridge-slow",
      action: "Verifica que Revit este abierto, con sesion activa y auto-claim habilitado.",
      requiresBridgeAttention: true
    });
    expect(getBimJobBridgeWaitDiagnostic(stale)).toMatchObject({
      tone: "critical",
      label: "Revit cerrado o bridge detenido",
      reason: "bridge-offline",
      action: "Abre Revit, inicia sesion en el add-in y ejecuta Jobs BIM.",
      waitingJobCount: 2,
      oldestWaitSeconds: 620,
      requiresBridgeAttention: true
    });
    expect(getBimJobBridgeWaitDiagnostic(modelMismatch)).toMatchObject({
      tone: "critical",
      label: "Bridge activo sin tomar job",
      reason: "model-mismatch",
      action: "Abre el modelo Revit correcto o revisa modelGuid, documentUid y modelPath.",
      waitingJobCount: 1,
      oldestWaitSeconds: 620,
      requiresBridgeAttention: true
    });
  });

  it("normalizes BIM readiness reports for the control panel", () => {
    const report = normalizeBimReadinessReport({
      ok: true,
      status: "ready",
      providerId: "simulated-aps",
      storage: { kind: "mysql", label: "MySQL" },
      activeRevitBridgeReady: true,
      cloudWorkerReady: true,
      apsLiveReady: false,
      artifactDownloadsReady: true,
      apsProviderCheckReady: false,
      readyForRealValidation: false,
      missing: ["BIM_APS_ACTIVITY_ID", "", "BIM_SMOKE_PROJECT_ID"],
      checks: [
        { id: "backend", label: "Backend", status: "ready", missing: [] },
        { id: "smoke", label: "Smoke", status: "missing-config", missing: ["BIM_SMOKE_PROJECT_ID"] },
        { id: "aps", label: "APS live", status: "optional-missing-config", missing: ["BIM_APS_ACTIVITY_ID"] }
      ],
      nextCommands: ["npm run bim:readiness"]
    });

    expect(report.storage.label).toBe("MySQL");
    expect(report.apsProviderCheckReady).toBe(false);
    expect(report.checks[0]).toMatchObject({ id: "backend", status: "ok" });
    expect(report.checks[1]).toMatchObject({ id: "smoke", status: "critical" });
    expect(report.checks[2]).toMatchObject({ id: "aps", status: "warning" });
    expect(getBimReadinessTone(report)).toBe("warning");
    expect(getBimReadinessLabel(report)).toBe("Puente local listo");
    expect(getBimReadinessMissingSummary(report, 1)).toBe("BIM_APS_ACTIVITY_ID +1");
  });

  it("selects Revit-oriented readiness checks for the BIM control panel", () => {
    const report = normalizeBimReadinessReport({
      activeRevitBridgeReady: true,
      cloudWorkerReady: true,
      apsLiveReady: true,
      artifactDownloadsReady: false,
      apsProviderCheckReady: false,
      checks: [
        { id: "local-probes", label: "Probes", status: "ready", missing: [] },
        { id: "bim-fluency-gate", label: "Fluidez", status: "ready", missing: [] },
        { id: "api-smoke", label: "API", status: "missing-config", missing: ["BIM_SMOKE_SESSION_COOKIE"] },
        { id: "cloud-worker-claim", label: "Worker", status: "missing-config", missing: ["BIM_WORKER_API_KEY"] },
        { id: "bridge-smoke", label: "Bridge", status: "ready", missing: [] },
        { id: "active-revit-e2e-smoke", label: "Revit E2E", status: "missing-config", missing: ["BIM_BRIDGE_E2E_REQUESTED_BY"] },
        { id: "aps-provider-check-contract", label: "Contrato APS", status: "missing-config", missing: ["BIM_APS_CHECK_INPUT_URL"] },
        { id: "revit-bridge-local-settings", label: "Revit Bridge", status: "ready", missing: [] },
        { id: "active-revit-queue-runtime", label: "Cola Revit", status: "ready", missing: [] },
      ]
    });

    const visible = selectActiveRevitReadinessVisibleChecks(report, 6);

    expect(visible.map((check) => check.id)).toEqual([
      "api-smoke",
      "active-revit-e2e-smoke",
      "local-probes",
      "bim-fluency-gate",
      "bridge-smoke",
      "revit-bridge-local-settings",
    ]);
    expect(visible.some((check) => check.id.includes("cloud") || check.id.includes("aps"))).toBe(false);
  });

  it("summarizes Control BIM readiness from the active Revit requirements only", () => {
    const report = normalizeBimReadinessReport({
      activeRevitBridgeReady: true,
      cloudWorkerReady: true,
      apsLiveReady: false,
      artifactDownloadsReady: false,
      apsProviderCheckReady: false,
      readyForRealValidation: false,
      missing: [
        "BIM_APS_CLIENT_ID",
        "BIM_APS_CLIENT_SECRET",
        "BIM_APS_ACTIVITY_ID",
      ],
      checks: [
        { id: "active-revit-bridge-api-key", label: "API key Revit", status: "ready", missing: [] },
        { id: "bim-sse", label: "SSE", status: "ready", missing: [] },
        { id: "bim-stale-sweep", label: "Heartbeat", status: "ready", missing: [] },
        { id: "cloud-worker-claim", label: "Worker", status: "ready", missing: [] },
        { id: "aps-design-automation", label: "APS", status: "optional-missing-config", optional: true, missing: ["BIM_APS_ACTIVITY_ID"] },
        { id: "aps-provider-check-contract", label: "Contrato APS", status: "optional-missing-config", optional: true, missing: ["BIM_APS_CHECK_INPUT_URL"] },
      ]
    });

    const visible = selectActiveRevitReadinessVisibleChecks(report, 6);

    expect(getBimReadinessTone(report)).toBe("warning");
    expect(getActiveRevitReadinessTone(report)).toBe("ok");
    expect(getActiveRevitReadinessLabel(report)).toBe("Revit activo listo");
    expect(getActiveRevitReadinessMissingSummary(report)).toBe("Sin pendientes Revit");
    expect(visible.map((check) => check.id)).toEqual([
      "active-revit-bridge-api-key",
      "bim-sse",
      "bim-stale-sweep",
    ]);
  });

  it("prioritizes failing readiness checks for the BIM control panel", () => {
    const report = normalizeBimReadinessReport({
      activeRevitBridgeReady: true,
      cloudWorkerReady: true,
      apsLiveReady: true,
      artifactDownloadsReady: false,
      apsProviderCheckReady: false,
      checks: [
        { id: "local-probes", label: "Probes", status: "ready", missing: [] },
        { id: "bim-fluency-gate", label: "Fluidez", status: "ready", missing: [] },
        { id: "api-smoke", label: "API", status: "ready", missing: [] },
        { id: "cloud-worker-claim", label: "Worker", status: "ready", missing: [] },
        { id: "bridge-smoke", label: "Bridge", status: "ready", missing: [] },
        { id: "active-revit-e2e-smoke", label: "Revit E2E", status: "ready", missing: [] },
        { id: "bim-artifact-downloads", label: "Artefactos", status: "missing-config", missing: ["BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS"] },
        { id: "aps-provider-check-contract", label: "Contrato APS", status: "missing-config", missing: ["BIM_APS_CHECK_INPUT_URL"] },
      ]
    });

    const visible = selectBimReadinessVisibleChecks(report, 6);

    expect(visible.map((check) => check.id)).toEqual([
      "bim-artifact-downloads",
      "aps-provider-check-contract",
      "local-probes",
      "bim-fluency-gate",
      "api-smoke",
      "cloud-worker-claim",
    ]);
  });

  it("keeps realtime BIM job updates within a UI-friendly commit budget", () => {
    const baseJob = normalizeBimJobRecord({
      id: "job-1",
      projectId: "project-1",
      targetMode: "cloud-model",
      commandType: "cloud-model-analysis",
      status: "running",
      createdAt: "2026-06-22T10:00:00.000Z"
    });
    const events = Array.from({ length: 400 }, (_, index) => ({
      elapsedMs: index * 10,
      job: normalizeBimJobRecord({
        ...baseJob,
        percent: Math.min(95, index / 4),
        updatedAt: new Date(Date.UTC(2026, 5, 22, 10, 0, 0, index * 10)).toISOString()
      })
    }));
    events.push({
      elapsedMs: 4010,
      job: normalizeBimJobRecord({
        ...baseJob,
        status: "completed",
        percent: 100,
        updatedAt: "2026-06-22T10:00:04.010Z"
      })
    });

    const commits = planBimJobRealtimeCommits(events);
    const lastCommit = commits[commits.length - 1];

    expect(BIM_JOB_REALTIME_FLUSH_MS).toBe(120);
    expect(commits.length).toBeLessThanOrEqual(36);
    expect(lastCommit?.reason).toBe("terminal");
    expect(lastCommit?.job.status).toBe("completed");
  });

  it("keeps four simultaneous realtime BIM streams inside a bounded panel commit budget", () => {
    const events = ["job-a", "job-b", "job-c", "job-d"].flatMap((jobId, jobIndex) => {
      const baseJob = normalizeBimJobRecord({
        id: jobId,
        projectId: "project-1",
        targetMode: jobIndex % 2 === 0 ? "cloud-model" : "active-revit",
        commandType: jobIndex % 2 === 0 ? "cloud-model-analysis" : "active-revit-preview",
        status: "running",
        createdAt: "2026-06-22T10:00:00.000Z"
      });
      const runningEvents = Array.from({ length: 400 }, (_, index) => ({
        elapsedMs: index * 10,
        job: normalizeBimJobRecord({
          ...baseJob,
          percent: Math.min(95, index / 4),
          updatedAt: new Date(Date.UTC(2026, 5, 22, 10, 0, 0, index * 10)).toISOString()
        })
      }));
      return [
        ...runningEvents,
        {
          elapsedMs: 4010 + jobIndex,
          job: normalizeBimJobRecord({
            ...baseJob,
            status: "completed",
            percent: 100,
            updatedAt: new Date(Date.UTC(2026, 5, 22, 10, 0, 4, 10 + jobIndex)).toISOString()
          })
        }
      ];
    });

    const commits = planBimJobRealtimePanelCommits(events);
    const terminalCommits = commits.filter((commit) => commit.reason === "terminal");
    const committedJobIds = new Set(commits.map((commit) => commit.jobId));

    expect(commits.length).toBeLessThanOrEqual(144);
    expect(committedJobIds).toEqual(new Set(["job-a", "job-b", "job-c", "job-d"]));
    expect(terminalCommits).toHaveLength(4);
    expect(terminalCommits.every((commit) => commit.job.status === "completed")).toBe(true);
  });

  it("measures long BIM realtime streams without exceeding the UI commit budget", () => {
    const baseJobs = ["load-a", "load-b", "load-c", "load-d"].map((jobId, index) => normalizeBimJobRecord({
      id: jobId,
      projectId: "project-1",
      targetMode: index % 2 === 0 ? "cloud-model" : "active-revit",
      commandType: index % 2 === 0 ? "cloud-model-analysis" : "active-revit-preview",
      status: "running",
      createdAt: "2026-06-22T10:00:00.000Z",
      result: {
        plannedBatches: 2500,
        recordedBatchCount: 1,
        batchSize: 250,
        averageBatchDurationMs: 10,
        maxBatchDurationMs: 10,
        fluencyStatus: "ok"
      }
    }));
    const events = baseJobs.flatMap((job, jobIndex) => {
      const runningEvents = Array.from({ length: 2500 }, (_, index) => ({
        elapsedMs: index * 5,
        job,
      }));
      return [
        ...runningEvents,
        {
          elapsedMs: 12525 + jobIndex,
          job: normalizeBimJobRecord({
            ...job,
            status: "completed",
            percent: 100,
            result: {
              ...job.result,
              recordedBatchCount: 2500,
              processedBatches: 2500,
            }
          })
        }
      ];
    });

    const summary = summarizeBimJobRealtimePanelLoad(events);

    expect(summary.eventCount).toBe(10004);
    expect(summary.jobCount).toBe(4);
    expect(summary.terminalCommitCount).toBe(4);
    expect(summary.withinCommitBudget).toBe(true);
    expect(summary.commitCount).toBeLessThanOrEqual(summary.commitBudget);
    expect(summary.eventReductionRatio).toBeGreaterThan(20);
    expect(summary.renderReductionPercent).toBeGreaterThan(95);
    expect(summary.maxCommitsPerSecond).toBeLessThanOrEqual(40);
  });

  it("selects multiple active BIM jobs for realtime streams without following finished jobs", () => {
    const jobs = [
      normalizeBimJobRecord({ id: "queued-old", status: "queued", updatedAt: "2026-06-22T10:00:00.000Z" }),
      normalizeBimJobRecord({ id: "completed", status: "completed", updatedAt: "2026-06-22T10:05:00.000Z" }),
      normalizeBimJobRecord({ id: "claimed", status: "claimed", updatedAt: "2026-06-22T10:01:00.000Z" }),
      normalizeBimJobRecord({ id: "running-new", status: "running", updatedAt: "2026-06-22T10:04:00.000Z" }),
      normalizeBimJobRecord({ id: "applying", status: "applying", updatedAt: "2026-06-22T10:03:00.000Z" }),
      normalizeBimJobRecord({ id: "failed", status: "failed", updatedAt: "2026-06-22T10:06:00.000Z" }),
    ];

    const selected = selectBimJobsForRealtime(jobs, 3);

    expect(selected.map((job) => job.id)).toEqual(["running-new", "applying", "claimed"]);
  });

  it("upserts BIM jobs without growing the panel unbounded", () => {
    const jobs = Array.from({ length: 30 }, (_, index) => normalizeBimJobRecord({
      id: `job-${index}`,
      createdAt: new Date(Date.UTC(2026, 5, 22, 10, 0, index)).toISOString()
    }));
    const updated = normalizeBimJobRecord({
      ...jobs[10],
      status: "running",
      updatedAt: "2026-06-22T10:05:00.000Z"
    });

    const nextJobs = upsertBimJobRecord(jobs, updated, 25);

    expect(nextJobs).toHaveLength(25);
    expect(nextJobs.filter((job) => job.id === updated.id)).toHaveLength(1);
    expect(nextJobs.some((job) => job.id === "job-0")).toBe(false);
  });
});
