import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLOUD_WORKER_FLUENCY_CRITICAL_MS,
  CLOUD_WORKER_FLUENCY_WARNING_MS,
  createCloudProviderCheckJob,
  createCloudWorkerBatchTelemetry,
  createCloudWorkerArtifacts,
  createCloudWorkerCheckpointProgress,
  createCloudWorkerFailureProgress,
  createCloudWorkerPlan,
  createCloudWorkerProgress,
  createCloudWorkerResult,
  createCloudWorkerRemoteStopDecision,
  isTerminalBimJobStatus,
  recordCloudWorkerBatchTelemetry,
  resolveCloudWorkerPollDelayMs,
  resolveCloudWorkerFluencyStatus,
} from "./bim-cloud-worker-domain.mjs";
import {
  createBimCloudProvider,
  extractApsRemoteOutputArtifacts,
  normalizeBimCloudProviderId,
} from "./bim-cloud-worker-providers.mjs";
import {
  buildApsWorkItemPayload,
  createApsDesignAutomationClient,
  isTerminalApsWorkItemStatus,
  normalizeApsDesignAutomationConfig,
  summarizeApsWorkItemContract,
} from "./aps-design-automation-client.mjs";
import {
  normalizeLoadTestSizes,
  runBimCloudLoadTest,
} from "./bim-cloud-load-test-domain.mjs";
import {
  runBimRealtimeLoadTest,
  summarizeBimRealtimeLoad,
} from "./bim-realtime-load-test-domain.mjs";
import {
  createBimReadinessReport,
  createBimReadinessRuntimeReport,
  summarizeBimFluencyGate,
  summarizeRevitBridgeLocalSettings,
} from "./bim-readiness-domain.mjs";
import {
  createBimLocalEnvPatch,
} from "./bim-local-env-domain.mjs";
import {
  createBimApiSmokeJobPayload,
  getBimApiSmokeMissingConfig,
  normalizeBimApiSmokeConfig,
} from "./bim-api-smoke-domain.mjs";
import {
  buildBimBridgeSmokeClaimPath,
  createBimBridgeSmokeArtifacts,
  createBimBridgeSmokeCompletedProgress,
  createBimBridgeSmokeJobPayload,
  createBimBridgeSmokeOwnershipMismatchProgress,
  createBimBridgeSmokeRunningProgress,
  getBimBridgeSmokeMissingConfig,
  normalizeBimBridgeSmokeConfig,
} from "./bim-bridge-smoke-domain.mjs";
import {
  buildBimBridgeE2eSmokeClaimPath,
  createBimBridgeE2eSmokeDocumentVersionMismatchConfig,
  createBimBridgeE2eSmokeJobPayload,
  getBimBridgeE2eSmokeMissingConfig,
  normalizeBimBridgeE2eSmokeConfig,
} from "./bim-bridge-e2e-smoke-domain.mjs";

describe("BIM cloud worker simulation", () => {
  it.each([
    [10000, 40],
    [50000, 200],
    [100000, 400],
  ])("plans %i simulated elements in 250-element batches", (elementCount, expectedBatches) => {
    const plan = createCloudWorkerPlan({
      id: "job-1",
      commandType: "cloud-model-analysis",
      payload: { simulatedElementCount: elementCount, batchSize: 250 },
      modelIdentity: { modelGuid: "model-a", documentVersion: "v1" },
    });

    expect(plan.elementCount).toBe(elementCount);
    expect(plan.batchSize).toBe(250);
    expect(plan.batchCount).toBe(expectedBatches);
  });

  it("creates monotonic progress and a final simulated APS result", () => {
    const plan = createCloudWorkerPlan({
      id: "job-2",
      payload: { simulatedElementCount: 1000, batchSize: 250 },
      modelIdentity: { modelGuid: "model-b" },
    });

    let telemetry = createCloudWorkerBatchTelemetry();
    telemetry = recordCloudWorkerBatchTelemetry(telemetry, 100);
    const first = createCloudWorkerProgress(plan, 1, { telemetry, yieldDelayMs: 10 });
    telemetry = recordCloudWorkerBatchTelemetry(telemetry, 800);
    telemetry = recordCloudWorkerBatchTelemetry(telemetry, 100);
    telemetry = recordCloudWorkerBatchTelemetry(telemetry, 100);
    const last = createCloudWorkerProgress(plan, 4, { telemetry, yieldDelayMs: 10 });
    const artifacts = createCloudWorkerArtifacts(plan, {
      durationMs: 1234,
      generatedAt: "2026-06-22T10:00:00.000Z",
      telemetry,
      yieldDelayMs: 10,
    });
    const result = createCloudWorkerResult(plan, {
      durationMs: 1234,
      artifacts: [{ id: "artifact-1" }],
      telemetry,
      yieldDelayMs: 10,
    });

    expect(first.percent).toBeGreaterThan(5);
    expect(first.result.processedBatches).toBe(1);
    expect(first.result.recordedBatchCount).toBe(1);
    expect(first.result.fluencyStatus).toBe("ok");
    expect(last.percent).toBe(95);
    expect(last.result.processedBatches).toBe(4);
    expect(last.result.recordedBatchCount).toBe(4);
    expect(last.result.fluencyStatus).toBe("warning");
    expect(result.workerMode).toBe("simulated-aps");
    expect(result.batchCount).toBe(4);
    expect(result.plannedBatches).toBe(4);
    expect(result.processedBatches).toBe(4);
    expect(result.recordedBatchCount).toBe(4);
    expect(result.averageBatchDurationMs).toBe(275);
    expect(result.maxBatchDurationMs).toBe(800);
    expect(result.fluencyStatus).toBe("warning");
    expect(result.yieldDelayMs).toBe(10);
    expect(result.artifacts).toHaveLength(1);
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(["manifest", "report"]);
    expect(artifacts[0].json.artifacts[0].name).toBe("bim-cloud-summary.json");
    expect(artifacts[1].json.fluencyStatus).toBe("warning");
    expect(isTerminalBimJobStatus("cancelled")).toBe(true);
    expect(isTerminalBimJobStatus(" Failed ")).toBe(true);
    expect(isTerminalBimJobStatus("COMPLETED")).toBe(true);
    expect(isTerminalBimJobStatus("running")).toBe(false);
    expect(createCloudWorkerRemoteStopDecision({ status: "cancelled" })).toMatchObject({
      shouldStop: true,
      terminal: true,
      status: "cancelled",
      cancelled: true,
      shouldCancelRemoteWorkItem: true,
    });
    expect(createCloudWorkerRemoteStopDecision("failed")).toMatchObject({
      shouldStop: true,
      terminal: true,
      status: "failed",
      cancelled: false,
      shouldCancelRemoteWorkItem: false,
    });
  });

  it("classifies cloud batch fluency with the same warning and critical thresholds", () => {
    let telemetry = createCloudWorkerBatchTelemetry();
    telemetry = recordCloudWorkerBatchTelemetry(telemetry, CLOUD_WORKER_FLUENCY_WARNING_MS - 1);
    expect(telemetry.fluencyStatus).toBe("ok");

    telemetry = recordCloudWorkerBatchTelemetry(telemetry, CLOUD_WORKER_FLUENCY_WARNING_MS);
    expect(telemetry.fluencyStatus).toBe("warning");

    telemetry = recordCloudWorkerBatchTelemetry(telemetry, CLOUD_WORKER_FLUENCY_CRITICAL_MS);
    expect(telemetry.fluencyStatus).toBe("critical");
    expect(resolveCloudWorkerFluencyStatus(0, CLOUD_WORKER_FLUENCY_CRITICAL_MS)).toBe("critical");
    expect(resolveCloudWorkerFluencyStatus(CLOUD_WORKER_FLUENCY_WARNING_MS, 0)).toBe("warning");
  });

  it("builds immediate failed progress payloads for worker exceptions", () => {
    const progress = createCloudWorkerFailureProgress(new Error("network down"), {
      workerId: "worker-a",
      result: {
        artifactCount: 2,
        providerStatus: "failed",
      },
    });

    expect(progress.bridgeId).toBe("worker-a");
    expect(progress.status).toBe("failed");
    expect(progress.percent).toBe(100);
    expect(progress.level).toBe("error");
    expect(progress.error).toBe("network down");
    expect(progress.result).toMatchObject({
      artifactCount: 2,
      providerStatus: "failed",
    });
  });

  it("builds pre-upload checkpoints without completing the job", () => {
    const progress = createCloudWorkerCheckpointProgress({
      workerId: "worker-a",
      percent: 150,
    });

    expect(progress.bridgeId).toBe("worker-a");
    expect(progress.status).toBe("running");
    expect(progress.percent).toBe(99);
    expect(progress.stage).toBe("Finalizando worker cloud");
  });

  it("backs off cloud worker polling after repeated loop failures", () => {
    const options = {
      pollMs: 5000,
      maxBackoffMs: 30000,
    };

    expect(resolveCloudWorkerPollDelayMs({ ...options, consecutiveFailures: 0 })).toBe(5000);
    expect(resolveCloudWorkerPollDelayMs({ ...options, consecutiveFailures: 1 })).toBe(5000);
    expect(resolveCloudWorkerPollDelayMs({ ...options, consecutiveFailures: 2 })).toBe(10000);
    expect(resolveCloudWorkerPollDelayMs({ ...options, consecutiveFailures: 3 })).toBe(20000);
    expect(resolveCloudWorkerPollDelayMs({ ...options, consecutiveFailures: 8 })).toBe(30000);
  });

  it("selects a simulated provider by default and validates the APS contract separately", () => {
    const simulated = createBimCloudProvider({ workerId: "worker-a" });
    const aps = createBimCloudProvider({ providerId: "aps-design-automation" });
    const plan = createCloudWorkerPlan({
      id: "job-3",
      payload: { simulatedElementCount: 250, batchSize: 250 },
    });

    expect(normalizeBimCloudProviderId("bad-provider")).toBe("simulated-aps");
    expect(simulated.id).toBe("simulated-aps");
    expect(simulated.validate()).toEqual([]);
    expect(simulated.createStartProgress(plan).stage).toBe("Preparando worker cloud");
    expect(simulated.createBatchProgress(plan, 1, {
      telemetry: recordCloudWorkerBatchTelemetry(createCloudWorkerBatchTelemetry(), 25),
      yieldDelayMs: 10,
    }).result.recordedBatchCount).toBe(1);
    expect(simulated.createReadinessReport(plan).ok).toBe(true);
    expect(aps.id).toBe("aps-design-automation");
    expect(aps.validate()).toEqual([
      "BIM_APS_CLIENT_ID",
      "BIM_APS_CLIENT_SECRET",
      "BIM_APS_ACTIVITY_ID",
    ]);
    expect(aps.createReadinessReport(plan, { payload: {} }).ok).toBe(false);
  });

  it("builds APS provider check jobs with optional redacted input/output contract", () => {
    const missingContractJob = createCloudProviderCheckJob({
      commandType: "cloud-model-analysis",
      defaultElementCount: 5000,
    });
    const executableContractJob = createCloudProviderCheckJob({
      commandType: "cloud-model-analysis",
      defaultElementCount: 5000,
      apsCheckInputUrl: "https://storage.example.com/check-input.rvt?sig=input-secret",
      apsCheckOutputUrl: "https://storage.example.com/check-output.zip?sig=output-secret",
    });
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
    });
    const missingReport = provider.createReadinessReport(
      createCloudWorkerPlan(missingContractJob),
      missingContractJob,
    );
    const executableReport = provider.createReadinessReport(
      createCloudWorkerPlan(executableContractJob),
      executableContractJob,
    );

    expect(missingReport.ok).toBe(true);
    expect(missingReport.workItemContract.readyForExecution).toBe(false);
    expect(missingReport.workItemContract.missing).toEqual(expect.arrayContaining([
      "APS_INPUT_ARGUMENT",
      "APS_OUTPUT_ARGUMENT",
    ]));
    expect(executableReport.workItemContract).toMatchObject({
      readyForExecution: true,
      inputArguments: ["inputRvt"],
      outputArguments: ["resultZip"],
    });
    expect(executableReport.workItemPreview.arguments.inputRvt.url)
      .toBe("https://storage.example.com/check-input.rvt[signed-query-redacted]");
    expect(executableReport.workItemPreview.arguments.resultZip.url)
      .toBe("https://storage.example.com/check-output.zip[signed-query-redacted]");
    expect(JSON.stringify(executableReport)).not.toContain("input-secret");
    expect(JSON.stringify(executableReport)).not.toContain("output-secret");
  });

  it("marks live readiness as skipped for the simulated provider", async () => {
    const simulated = createBimCloudProvider({ workerId: "worker-a" });
    const plan = createCloudWorkerPlan({
      id: "job-sim-live",
      payload: { simulatedElementCount: 250, batchSize: 250 },
    });

    const report = await simulated.createLiveReadinessReport(plan);

    expect(report.ok).toBe(true);
    expect(report.live.skipped).toBe(true);
    expect(report.live.reason).toContain("simulado");
  });

  it("builds APS work item payloads and uses OAuth v2 bearer requests including cancellation and discovery", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/authentication/v2/token")) {
        return jsonResponse({ access_token: "token-123", expires_in: 3600 });
      }
      return jsonResponse({ id: "workitem-1", status: "pending" });
    };
    const config = normalizeApsDesignAutomationConfig({
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      apsPollMs: 1,
    });
    const client = createApsDesignAutomationClient(config, fakeFetch);
    const plan = createCloudWorkerPlan({
      id: "job-4",
      commandType: "cloud-model-analysis",
      payload: {
        apsArguments: {
          inputRvt: { url: "https://storage.example.com/input.rvt" },
        },
      },
      modelIdentity: { modelGuid: "model-c" },
    });
    const workItem = buildApsWorkItemPayload({ payload: plan.modelIdentity }, plan, config);
    const workItemWithArgs = buildApsWorkItemPayload({
      payload: {
        apsArguments: {
          inputRvt: { url: "https://storage.example.com/input.rvt" },
          resultZip: { url: "https://storage.example.com/output.zip" },
        },
      },
    }, plan, config);

    expect(config.pollMs).toBe(2000);
    expect(workItem.activityId).toBe("owner.itemicostos+prod");
    expect(workItem.arguments.ItemicostosJob).toContain("job-4");
    expect(summarizeApsWorkItemContract(workItem).readyForExecution).toBe(false);
    expect(workItemWithArgs.arguments.inputRvt.url).toContain("input.rvt");
    expect(workItemWithArgs.arguments.inputRvt.verb).toBe("get");
    expect(workItemWithArgs.arguments.resultZip.verb).toBe("put");
    expect(summarizeApsWorkItemContract(workItemWithArgs)).toMatchObject({
      readyForExecution: true,
      inputArgumentCount: 1,
      outputArgumentCount: 1,
    });
    expect(isTerminalApsWorkItemStatus("success")).toBe(true);

    const created = await client.createWorkItem(workItemWithArgs);
    expect(created.id).toBe("workitem-1");
    await client.cancelWorkItem("workitem-1");
    await client.listActivities();
    expect(calls[0].options.headers.Authorization).toMatch(/^Basic /);
    expect(calls[1].options.headers.Authorization).toBe("Bearer token-123");
    expect(calls[1].url).toBe("https://developer.api.autodesk.com/da/us-east/v3/workitems");
    expect(calls[2].options.method).toBe("DELETE");
    expect(calls[2].url).toBe("https://developer.api.autodesk.com/da/us-east/v3/workitems/workitem-1");
    expect(calls[3].url).toBe("https://developer.api.autodesk.com/da/us-east/v3/activities");
  });

  it("best-effort cancels APS work items when Itemicostos cancels the job", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/authentication/v2/token")) {
        return jsonResponse({ access_token: "token-123", expires_in: 3600 });
      }
      if (options?.method === "POST" && String(url).endsWith("/workitems")) {
        return jsonResponse({ id: "workitem-cancel", status: "pending" });
      }
      if (options?.method === "DELETE") {
        return jsonResponse({});
      }
      return jsonResponse({ id: "workitem-cancel", status: "pending" });
    };
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      fetchImpl: fakeFetch,
    });
    const apsExecutableJob = {
      id: "job-cancel-aps",
      commandType: "cloud-model-analysis",
      payload: {
        simulatedElementCount: 1,
        apsInputUrl: "https://storage.example.com/input.rvt",
        apsOutputUrl: "https://storage.example.com/output.zip",
      },
    };
    const plan = createCloudWorkerPlan(apsExecutableJob);
    const execution = await provider.execute(plan, apsExecutableJob, {
      reportProgress: async () => ({ status: "cancelled" }),
    });

    expect(execution.cancelled).toBe(true);
    expect(execution.terminal).toBe(true);
    expect(execution.status).toBe("cancelled");
    expect(execution.remoteCancellation.ok).toBe(true);
    expect(calls.some((call) => call.options?.method === "DELETE" && call.url.endsWith("/workitems/workitem-cancel"))).toBe(true);
  });

  it("stops APS execution without cancelling remote work when Itemicostos job is terminal", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/authentication/v2/token")) {
        return jsonResponse({ access_token: "token-123", expires_in: 3600 });
      }
      if (options?.method === "POST" && String(url).endsWith("/workitems")) {
        return jsonResponse({ id: "workitem-terminal", status: "pending" });
      }
      if (options?.method === "DELETE") {
        return jsonResponse({});
      }
      return jsonResponse({ id: "workitem-terminal", status: "pending" });
    };
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      fetchImpl: fakeFetch,
    });
    const job = {
      id: "job-terminal-aps",
      commandType: "cloud-model-analysis",
      payload: {
        simulatedElementCount: 1,
        apsInputUrl: "https://storage.example.com/input.rvt",
        apsOutputUrl: "https://storage.example.com/output.zip",
      },
    };
    const plan = createCloudWorkerPlan(job);

    const execution = await provider.execute(plan, job, {
      reportProgress: async () => ({ status: "failed" }),
    });

    expect(execution).toMatchObject({
      terminal: true,
      cancelled: false,
      status: "failed",
    });
    expect(execution.remoteCancellation).toBeNull();
    expect(calls.some((call) => call.options?.method === "DELETE")).toBe(false);
  });

  it("preserves APS failed work item evidence as artifacts", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/authentication/v2/token")) {
        return jsonResponse({ access_token: "token-123", expires_in: 3600 });
      }
      if (options?.method === "POST" && String(url).endsWith("/workitems")) {
        return jsonResponse({
          id: "workitem-failed",
          status: "failed",
          reportUrl: "https://storage.example.com/aps-report.txt",
          arguments: {
            resultZip: {
              url: "https://storage.example.com/output.zip",
              fileName: "failed-output.zip",
              contentType: "application/zip",
            },
          },
        });
      }
      return jsonResponse({ id: "workitem-failed", status: "failed" });
    };
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      fetchImpl: fakeFetch,
    });
    const job = {
      id: "job-aps-failed",
      commandType: "cloud-model-analysis",
      payload: {
        simulatedElementCount: 1,
        apsInputUrl: "https://storage.example.com/input.rvt",
        apsOutputUrl: "https://storage.example.com/output.zip",
      },
    };
    const plan = createCloudWorkerPlan(job);

    let thrown;
    try {
      await provider.execute(plan, job, {
        reportProgress: async () => ({ status: "running" }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain("termino con estado failed");
    expect(thrown.resultOptions).toMatchObject({
      providerStatus: "failed",
      apsWorkItem: {
        id: "workitem-failed",
        status: "failed",
        reportUrl: "https://storage.example.com/aps-report.txt",
      },
    });
    expect(thrown.artifacts.map((artifact) => artifact.name)).toEqual(expect.arrayContaining([
      "aps-workitem-status.json",
      "aps-workitem-report.txt",
      "failed-output.zip",
    ]));
    expect(thrown.artifacts.find((artifact) => artifact.name === "aps-workitem-status.json").json.status).toBe("failed");
    expect(thrown.artifacts.find((artifact) => artifact.name === "aps-workitem-report.txt").storageUri).toBe("https://storage.example.com/aps-report.txt");
    expect(calls.some((call) => String(call.url).includes("/workitems/workitem-failed"))).toBe(false);
  });

  it("checks APS credentials and activity without creating a work item", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/authentication/v2/token")) {
        return jsonResponse({ access_token: "token-123", expires_in: 3600 });
      }
      return jsonResponse({
        id: "owner.itemicostos+prod",
        nickname: "prod",
        version: 1,
        parameters: { inputRvt: {}, outputZip: {} },
      });
    };
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      fetchImpl: fakeFetch,
    });
    const plan = createCloudWorkerPlan({
      id: "job-live-check",
      payload: { simulatedElementCount: 1 },
    });

    const report = await provider.createLiveReadinessReport(plan, { payload: {} });

    expect(report.ok).toBe(true);
    expect(report.live.ok).toBe(true);
    expect(report.live.activity.id).toBe("owner.itemicostos+prod");
    expect(report.live.activity.parameters).toEqual(["inputRvt", "outputZip"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/authentication/v2/token");
    expect(calls[1].url).toContain("/activities/owner.itemicostos%2Bprod");
    expect(calls.some((call) => call.url.includes("/workitems"))).toBe(false);
  });

  it("classifies APS live readiness product access failures", async () => {
    const fakeFetch = async () => jsonResponse({
      error: "Auth-001",
      developerMessage: "The client_id specified does not have access to the api product",
    }, false, 403);
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      fetchImpl: fakeFetch,
    });
    const plan = createCloudWorkerPlan({
      id: "job-live-check-denied",
      payload: { simulatedElementCount: 1 },
    });

    const report = await provider.createLiveReadinessReport(plan, { payload: {} });

    expect(report.ok).toBe(false);
    expect(report.live.ok).toBe(false);
    expect(report.live.status).toBe("product-access-missing");
    expect(report.live.diagnostic.code).toBe("aps-api-product-access");
    expect(report.live.diagnostic.nextActions.join(" ")).toContain("Automation API");
  });

  it("redacts sensitive work item arguments in APS readiness reports", () => {
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
    });
    const plan = createCloudWorkerPlan({
      id: "job-5",
      payload: { simulatedElementCount: 1 },
    });
    const report = provider.createReadinessReport(plan, {
      payload: {
        apsArguments: {
          inputRvt: {
            url: "https://storage.example.com/input.rvt?sig=super-secret-signature",
            headers: {
              Authorization: "Bearer nested-secret",
            },
          },
          PersonalAccessToken: "secret-token",
        },
      },
    });

    expect(report.ok).toBe(true);
    expect(report.workItemPreview.arguments.PersonalAccessToken).toBe("[redacted]");
    expect(report.workItemPreview.arguments.inputRvt.headers.Authorization).toBe("[redacted]");
    expect(report.workItemPreview.arguments.inputRvt.url).toBe("https://storage.example.com/input.rvt[signed-query-redacted]");
    expect(JSON.stringify(report.workItemPreview)).not.toContain("super-secret-signature");
    expect(JSON.stringify(report.workItemPreview)).not.toContain("nested-secret");
  });

  it("normalizes APS input/output aliases and rejects non-executable work items before creating them", async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ id: "workitem-should-not-be-created", status: "pending" });
    };
    const config = normalizeApsDesignAutomationConfig({
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
    });
    const plan = createCloudWorkerPlan({
      id: "job-aps-aliases",
      commandType: "cloud-model-analysis",
      payload: { simulatedElementCount: 1 },
    });
    const executableWorkItem = buildApsWorkItemPayload({
      payload: {
        apsInputUrl: "https://storage.example.com/model.rvt?sig=input-secret",
        apsOutputUrl: "https://storage.example.com/result.zip?sig=output-secret",
      },
    }, plan, config);
    const provider = createBimCloudProvider({
      providerId: "aps-design-automation",
      apsClientId: "client-id",
      apsClientSecret: "client-secret",
      apsActivityId: "owner.itemicostos+prod",
      fetchImpl: fakeFetch,
    });

    expect(executableWorkItem.arguments.inputRvt).toMatchObject({
      verb: "get",
      url: "https://storage.example.com/model.rvt?sig=input-secret",
    });
    expect(executableWorkItem.arguments.resultZip).toMatchObject({
      verb: "put",
      url: "https://storage.example.com/result.zip?sig=output-secret",
    });
    expect(summarizeApsWorkItemContract(executableWorkItem)).toMatchObject({
      readyForExecution: true,
      inputArguments: ["inputRvt"],
      outputArguments: ["resultZip"],
    });

    await expect(provider.execute(plan, {
      id: "job-aps-aliases",
      payload: {},
    })).rejects.toThrow(/input HTTPS.*output HTTPS/);
    expect(calls).toHaveLength(0);
  });

  it("runs local load probes for 10k, 50k and 100k elements", () => {
    const result = runBimCloudLoadTest({
      sizes: [10000, 50000, 100000],
      batchSize: 250,
      now: () => 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.totalElements).toBe(160000);
    expect(result.totalBatches).toBe(640);
    expect(result.cases.map((entry) => entry.batchCount)).toEqual([40, 200, 400]);
    expect(result.cases.every((entry) => entry.finalPercent === 95)).toBe(true);
    expect(result.cases.every((entry) => entry.fluencyStatus === "ok")).toBe(true);
    expect(result.cases.map((entry) => entry.recordedBatchCount)).toEqual([40, 200, 400]);
    expect(normalizeLoadTestSizes("10000, 50000, bad, 10000")).toEqual([10000, 50000]);
  });

  it("runs a realtime UI load probe with bounded render commits", () => {
    const result = runBimRealtimeLoadTest({
      jobCount: 4,
      eventsPerJob: 2500,
      eventIntervalMs: 5,
      flushMs: 120,
    });

    expect(result.ok).toBe(true);
    expect(result.eventCount).toBe(10004);
    expect(result.jobCount).toBe(4);
    expect(result.terminalCommitCount).toBe(4);
    expect(result.withinCommitBudget).toBe(true);
    expect(result.renderReductionPercent).toBeGreaterThan(95);
    expect(result.eventReductionRatio).toBeGreaterThan(20);
  });

  it("flushes realtime UI commits immediately for normalized terminal statuses", () => {
    const summary = summarizeBimRealtimeLoad([
      { elapsedMs: 0, jobId: "job-normalized-terminal", status: "running", percent: 10 },
      { elapsedMs: 20, jobId: "job-normalized-terminal", status: " FAILED ", percent: 100 },
    ], { flushMs: 120 });

    expect(summary.eventCount).toBe(2);
    expect(summary.commitCount).toBe(2);
    expect(summary.terminalCommitCount).toBe(1);
  });

  it("summarizes BIM readiness gaps for real Revit and APS validation", () => {
    const empty = createBimReadinessReport({});
    const ready = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://storage.example.com/output.zip?sig=output-secret",
    }, {
      fluencyReport: createReadyFluencyReport(),
    });

    expect(empty.status).toBe("needs-config");
    expect(empty.readyForRealValidation).toBe(false);
    expect(empty.missing).toEqual(expect.arrayContaining([
      "BIM_SMOKE_PROJECT_ID",
      "BIM_SMOKE_SESSION_COOKIE",
      "BIM_WORKER_API_KEY or REVIT_INGEST_API_KEY",
      "BIM_BRIDGE_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_SMOKE_API_KEY",
      "BIM_BRIDGE_E2E_REQUESTED_BY",
      "BIM_APS_CLIENT_ID",
      "BIM_APS_CLIENT_SECRET",
      "BIM_APS_ACTIVITY_ID",
      "BIM_FLUENCY_CHECK_REPORT",
    ]));
    expect(empty.nextCommands).toEqual(expect.arrayContaining([
      "npm run bim:fluency-check",
      "npm run bim:realtime-load-test",
      "npm run worker:bim:load-test",
      "npm run worker:bim:check",
      "npm run bim:prepare-smoke -- --session-cookie <cookie>",
    ]));
    expect(ready.status).toBe("ready");
    expect(ready.ok).toBe(true);
    expect(ready.readyForRealValidation).toBe(true);
    expect(ready.activeRevitE2eReady).toBe(true);
    expect(ready.apsLiveReady).toBe(true);
    expect(ready.artifactDownloadsReady).toBe(true);
    expect(ready.apsProviderCheckReady).toBe(true);
    expect(ready.localFluencyReady).toBe(true);
    expect(ready.missing).toEqual([]);
    expect(ready.nextCommands).toEqual(expect.arrayContaining([
      "npm run bim:api-smoke",
      "npm run bim:bridge-smoke",
      "npm run bim:bridge-e2e-smoke",
      "npm run worker:bim:check-live",
    ]));
  });

  it("derives smoke project ids from local Revit bridge settings when env project ids are missing", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
    }, {
      fluencyReport: createReadyFluencyReport(),
      revitBridgeSettings: {
        checked: true,
        exists: true,
        path: "settings.json",
        settings: {
          projectUid: "project-from-revit",
          web: {
            baseUrl: "http://127.0.0.1:5500/",
            ingestApiKey: "bridge-key",
            autoClaimBimJobs: true,
          },
        },
      },
    });

    expect(report.derivedConfig).toMatchObject({
      projectId: "project-from-revit",
      projectIdSource: "revit-bridge-settings.projectUid",
    });
    expect(report.derivedConfig.bridgeE2eRequestedBySource).toBe("");
    expect(report.derivedConfig.bridgeE2eModelIdentitySource).toBe("");
    expect(report.missing).not.toContain("BIM_SMOKE_PROJECT_ID");
    expect(report.missing).not.toContain("BIM_BRIDGE_SMOKE_PROJECT_ID");
    expect(report.missing).not.toContain("BIM_BRIDGE_E2E_SMOKE_PROJECT_ID");
    expect(report.checks.find((check) => check.id === "api-smoke")?.details.projectIdConfigured).toBe(true);
    expect(report.checks.find((check) => check.id === "bridge-smoke")?.details.projectIdConfigured).toBe(true);
    expect(report.checks.find((check) => check.id === "active-revit-e2e-smoke")?.details.projectIdConfigured).toBe(true);
    expect(report.checks.find((check) => check.id === "revit-bridge-local-settings")?.details.projectUid)
      .toBe("project-from-revit");
  });

  it("does not mark bridge smoke ready when it cannot create or claim a deterministic smoke job", () => {
    const report = createBimReadinessReport({
      REVIT_INGEST_API_KEY: "bridge-key",
    }, {
      fluencyReport: createReadyFluencyReport(),
      revitBridgeSettings: {
        checked: true,
        exists: true,
        path: "settings.json",
        settings: {
          projectUid: "project-from-revit",
          web: {
            baseUrl: "http://127.0.0.1:5500/",
            ingestApiKey: "bridge-key",
            autoClaimBimJobs: true,
          },
        },
      },
    });
    const bridgeSmoke = report.checks.find((check) => check.id === "bridge-smoke");

    expect(bridgeSmoke?.status).toBe("missing-config");
    expect(bridgeSmoke?.missing).toContain("BIM_BRIDGE_SMOKE_SESSION_COOKIE");
    expect(bridgeSmoke?.details).toMatchObject({
      projectIdConfigured: true,
      sessionCookieConfigured: false,
      createsOwnJob: false,
      queueOnlyWithoutSession: true,
    });
    expect(report.bridgeSmokeReady).toBe(false);
  });

  it("uses the same Revit project derivation in executable smoke scripts", () => {
    const prepareSmoke = readWorkerFile("./bim-smoke-config.mjs");
    const apiSmoke = readWorkerFile("./bim-api-smoke.mjs");
    const bridgeSmoke = readWorkerFile("./bim-bridge-smoke.mjs");
    const bridgeE2eSmoke = readWorkerFile("./bim-bridge-e2e-smoke.mjs");

    for (const script of [prepareSmoke, apiSmoke, bridgeSmoke, bridgeE2eSmoke]) {
      expect(script).toContain("createBimReadinessDerivedEnv");
      expect(script).toContain("loadLocalRevitBridgeSettings");
      expect(script).toContain("derivedEnv.env");
      expect(script).toContain("derivedConfig");
    }
  });

  it("keeps production BIM readiness blocked when the backend health check fails", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://storage.example.com/output.zip?sig=output-secret",
    }, {
      fluencyReport: createReadyFluencyReport(),
    });
    const runtimeReport = createBimReadinessRuntimeReport(report, {
      attempted: true,
      ok: false,
      endpoint: "http://127.0.0.1:5500/api/health",
      error: "fetch failed",
    });

    expect(report.status).toBe("ready");
    expect(runtimeReport.ok).toBe(false);
    expect(runtimeReport.status).toBe("needs-config");
    expect(runtimeReport.readyForRealValidation).toBe(false);
    expect(runtimeReport.backendHealthReady).toBe(false);
    expect(runtimeReport.missing).toContain("ITEMICOSTOS_BACKEND_HEALTH");
    expect(runtimeReport.nextCommands).toContain("npm run server");
    expect(runtimeReport.checks.find((check) => check.id === "backend-health")?.status)
      .toBe("missing-config");
  });

  it("blocks real validation when active Revit jobs wait too long for the bridge", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://storage.example.com/output.zip?sig=output-secret",
    }, {
      fluencyReport: createReadyFluencyReport(),
    });
    const runtimeReport = createBimReadinessRuntimeReport(report, {
      attempted: true,
      ok: true,
      endpoint: "http://127.0.0.1:5500/api/health",
      storage: "mysql",
    }, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        endpoint: "http://127.0.0.1:5500/api/bim/bridge/summary?projectId=project-1",
        statusCode: 200,
        projectId: "project-1",
        summary: {
          activeRevitQueued: 2,
          oldestActiveRevitQueuedAgeSeconds: 620,
        },
      },
    });
    const queueCheck = runtimeReport.checks.find((check) => check.id === "active-revit-queue-runtime");

    expect(runtimeReport.ok).toBe(false);
    expect(runtimeReport.readyForRealValidation).toBe(false);
    expect(runtimeReport.missing).toContain("ACTIVE_REVIT_BRIDGE_OFFLINE");
    expect(queueCheck?.status).toBe("missing-config");
    expect(queueCheck?.details.diagnostic).toMatchObject({
      tone: "critical",
      label: "Revit cerrado o bridge detenido",
      reason: "bridge-offline",
      waitingJobCount: 2,
      oldestWaitSeconds: 620,
      requiresBridgeAttention: true,
    });
    expect(runtimeReport.nextCommands).toContain("Abre Revit, inicia sesion en el add-in y ejecuta Jobs BIM.");
  });

  it("summarizes the last local BIM fluency gate for readiness", () => {
    const missing = summarizeBimFluencyGate({
      checked: true,
      exists: false,
      path: "data/bim-fluency-check.json",
    });
    const ready = summarizeBimFluencyGate(createReadyFluencyReport());
    const failed = summarizeBimFluencyGate({
      checked: true,
      exists: true,
      report: {
        ok: false,
        generatedAt: "2026-06-23T15:00:00.000Z",
        summary: { checkCount: 6, failedCount: 1 },
      },
    });
    const oldReport = summarizeBimFluencyGate({
      checked: true,
      exists: true,
      path: "data/bim-fluency-check.json",
      report: {
        ok: true,
        generatedAt: "2026-06-23T15:00:00.000Z",
        summary: { checkCount: 3, failedCount: 0 },
        checks: createReadyFluencyChecks().filter((check) => check.id !== "revit-bridge-backoff"),
      },
    });

    expect(missing.status).toBe("missing-report");
    expect(missing.missing).toEqual(["BIM_FLUENCY_CHECK_REPORT"]);
    expect(ready.ok).toBe(true);
    expect(ready.status).toBe("ready");
    expect(ready.details.summary).toMatchObject({
      checkCount: 6,
      failedCount: 0,
      totalSimulatedElements: 320000,
      realtimeEvents: 10004,
    });
    expect(ready.details.checks.missingRequiredCheckIds).toEqual([]);
    expect(oldReport.ok).toBe(false);
    expect(oldReport.status).toBe("incomplete-report");
    expect(oldReport.missing).toEqual(["BIM_FLUENCY_CHECK_REQUIRED_CHECKS"]);
    expect(oldReport.details.checks.missingRequiredCheckIds).toEqual(["revit-bridge-backoff"]);
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe("failed");
    expect(failed.missing).toEqual(["BIM_FLUENCY_CHECK_FAILED"]);
  });

  it("requires allowed artifact redirect hosts for APS production readiness", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://storage.example.com/output.zip?sig=output-secret",
    });

    expect(report.ok).toBe(false);
    expect(report.apsLiveReady).toBe(true);
    expect(report.artifactDownloadsReady).toBe(false);
    expect(report.readyForRealValidation).toBe(false);
    expect(report.missing).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS");
    expect(report.checks.find((check) => check.id === "bim-artifact-downloads")?.status)
      .toBe("missing-config");
    expect(report.nextCommands).toContain("npm run bim:setup-local -- --artifact-redirect-hosts storage.example.com");
  });

  it("blocks APS readiness when the check output host is not allowed for artifact downloads", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://other-storage.example.com/output.zip?sig=output-secret",
    }, {
      fluencyReport: createReadyFluencyReport(),
    });

    expect(report.ok).toBe(false);
    expect(report.readyForRealValidation).toBe(false);
    expect(report.artifactDownloadsReady).toBe(false);
    expect(report.apsProviderCheckReady).toBe(false);
    expect(report.missing).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS includes BIM_APS_CHECK_OUTPUT_URL host");
    expect(report.nextCommands).toContain("npm run bim:setup-local -- --artifact-redirect-hosts other-storage.example.com");
    expect(report.checks.find((check) => check.id === "aps-provider-check-contract")?.details).toMatchObject({
      outputHost: "other-storage.example.com",
      outputHostAllowed: false,
    });
    expect(JSON.stringify(report)).not.toContain("output-secret");
  });

  it("suggests setup-local placeholders when APS preflight input/output URLs are missing", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
    }, {
      fluencyReport: createReadyFluencyReport(),
    });

    expect(report.apsProviderCheckReady).toBe(false);
    expect(report.nextCommands).toContain("npm --silent run bim:setup-local -- --aps-check-input-url <inputUrl> --aps-check-output-url <outputUrl>");
  });

  it("suggests APS activity discovery when credentials are present but activity id is missing", () => {
    const report = createBimReadinessReport({
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "session-123",
      BIM_WORKER_API_KEY: "bridge-key",
      BIM_BRIDGE_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      BIM_APS_CLIENT_ID: "aps-client",
      BIM_APS_CLIENT_SECRET: "aps-secret",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
    });

    expect(report.apsLiveReady).toBe(false);
    expect(report.readyForRealValidation).toBe(false);
    expect(report.missing).toContain("BIM_APS_ACTIVITY_ID");
    expect(report.nextCommands).toContain("npm run worker:bim:list-activities");
    expect(JSON.stringify(report)).not.toContain("aps-secret");
  });

  it("checks local Revit bridge settings without exposing the bridge key", () => {
    const env = {
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_BASE_URL: "http://127.0.0.1:5500",
    };
    const ready = summarizeRevitBridgeLocalSettings(env, {
      checked: true,
      exists: true,
      path: "C:/Users/Test/AppData/Roaming/RevitModelAudit/itemicostos-metrado-export.settings.json",
      settings: {
        projectUid: "project-1",
        web: {
          baseUrl: "http://127.0.0.1:5500/",
          ingestApiKey: "bridge-secret-key",
          autoClaimBimJobs: true,
          bimJobPollSeconds: 15,
        },
      },
    });
    const mismatch = summarizeRevitBridgeLocalSettings(env, {
      checked: true,
      exists: true,
      path: "settings.json",
      settings: {
        web: {
          baseUrl: "http://127.0.0.1:9999/",
          ingestApiKey: "other-secret-key",
          autoClaimBimJobs: false,
        },
      },
    });
    const report = createBimReadinessReport(env, {
      revitBridgeSettings: {
        checked: true,
        exists: true,
        path: "settings.json",
        settings: {
          web: {
            baseUrl: "http://127.0.0.1:5500/",
            ingestApiKey: "bridge-secret-key",
            autoClaimBimJobs: true,
            bimJobPollSeconds: 15,
          },
        },
      },
    });

    expect(ready.missing).toEqual([]);
    expect(ready.details.apiKeyConfigured).toBe(true);
    expect(ready.details.apiKeyMatches).toBe(true);
    expect(JSON.stringify(ready)).not.toContain("bridge-secret-key");
    expect(mismatch.missing).toEqual(expect.arrayContaining([
      "web.ingestApiKey matches REVIT_INGEST_API_KEY",
      "web.baseUrl matches backend",
      "web.autoClaimBimJobs",
    ]));
    expect(JSON.stringify(mismatch)).not.toContain("other-secret-key");
    expect(report.revitBridgeLocalSettingsReady).toBe(true);
    expect(report.checks.find((check) => check.id === "revit-bridge-local-settings")?.status).toBe("ready");
  });

  it("bootstraps local BIM env values without exposing secret values in the summary", () => {
    const patch = createBimLocalEnvPatch({
      envText: [
        "HOST=127.0.0.1",
        "REVIT_INGEST_API_KEY=",
        "BIM_WORKER_API_KEY=",
        "BIM_BRIDGE_SMOKE_API_KEY=",
        "BIM_BRIDGE_E2E_SMOKE_API_KEY=",
        "BIM_BRIDGE_SMOKE_PROJECT_ID=",
        "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID=",
        "BIM_BRIDGE_SMOKE_SESSION_COOKIE=",
        "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE=",
        "BIM_BRIDGE_E2E_REQUESTED_BY=",
        "BIM_APS_CLIENT_ID=",
        "BIM_APS_CLIENT_SECRET=",
        "BIM_APS_ACTIVITY_ID=",
      ].join("\n"),
      runtimeEnv: {
        BIM_SMOKE_PROJECT_ID: "project-1",
        BIM_SMOKE_SESSION_COOKIE: "session-secret",
        BIM_SMOKE_USER_EMAIL: "operador@empresa.com",
        BIM_APS_CLIENT_ID: "client-secret-id",
      },
      generateBridgeKey: true,
      generatedBridgeKey: "bridge-secret-key",
    });

    expect(patch.changed).toBe(true);
    expect(patch.nextText).toContain("REVIT_INGEST_API_KEY=bridge-secret-key");
    expect(patch.nextText).toContain("BIM_WORKER_API_KEY=bridge-secret-key");
    expect(patch.nextText).toContain("BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE=session-secret");
    expect(patch.nextText).toContain("BIM_BRIDGE_E2E_REQUESTED_BY=operador@empresa.com");
    expect(patch.nextText).toContain("BIM_APS_CLIENT_ID=client-secret-id");
    expect(patch.generatedKeys).toEqual(["REVIT_INGEST_API_KEY"]);
    expect(patch.derivedKeys).toEqual(expect.arrayContaining([
      "BIM_WORKER_API_KEY",
      "BIM_BRIDGE_SMOKE_API_KEY",
      "BIM_BRIDGE_E2E_SMOKE_API_KEY",
      "BIM_BRIDGE_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_REQUESTED_BY",
    ]));
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("bridge-secret-key");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("session-secret");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("client-secret-id");
  });

  it("rotates the local bridge key and redacts rotated values", () => {
    const patch = createBimLocalEnvPatch({
      envText: [
        "REVIT_INGEST_API_KEY=old-secret-key",
        "BIM_WORKER_API_KEY=old-secret-key",
        "BIM_BRIDGE_SMOKE_API_KEY=old-secret-key",
        "BIM_BRIDGE_E2E_SMOKE_API_KEY=custom-secret-key",
      ].join("\n"),
      rotateBridgeKey: true,
      generateBridgeKey: true,
      generatedBridgeKey: "new-secret-key",
    });

    expect(patch.changed).toBe(true);
    expect(patch.nextText).toContain("REVIT_INGEST_API_KEY=new-secret-key");
    expect(patch.nextText).toContain("BIM_WORKER_API_KEY=new-secret-key");
    expect(patch.nextText).toContain("BIM_BRIDGE_SMOKE_API_KEY=new-secret-key");
    expect(patch.nextText).toContain("BIM_BRIDGE_E2E_SMOKE_API_KEY=custom-secret-key");
    expect(patch.rotatedKeys).toEqual(expect.arrayContaining([
      "REVIT_INGEST_API_KEY",
      "BIM_WORKER_API_KEY",
      "BIM_BRIDGE_SMOKE_API_KEY",
    ]));
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("new-secret-key");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("old-secret-key");
  });

  it("applies explicit APS setup values without exposing them in the summary", () => {
    const patch = createBimLocalEnvPatch({
      envText: [
        "BIM_WORKER_PROVIDER=simulated-aps",
        "BIM_APS_CLIENT_ID=old-client",
        "BIM_APS_CLIENT_SECRET=old-secret",
        "BIM_APS_ACTIVITY_ID=",
        "BIM_APS_CHECK_INPUT_URL=",
        "BIM_APS_CHECK_OUTPUT_URL=",
        "BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS=",
      ].join("\n"),
      explicitEnv: {
        BIM_WORKER_PROVIDER: "aps-design-automation",
        BIM_APS_CLIENT_ID: "new-client",
        BIM_APS_CLIENT_SECRET: "new-secret",
        BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
        BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
        BIM_APS_CHECK_OUTPUT_URL: "https://outputs.example.com/output.zip?sig=output-secret",
      },
    });

    expect(patch.changed).toBe(true);
    expect(patch.nextText).toContain("BIM_WORKER_PROVIDER=aps-design-automation");
    expect(patch.nextText).toContain("BIM_APS_CLIENT_ID=new-client");
    expect(patch.nextText).toContain("BIM_APS_CLIENT_SECRET=new-secret");
    expect(patch.nextText).toContain("BIM_APS_ACTIVITY_ID=owner.itemicostos+prod");
    expect(patch.nextText).toContain("BIM_APS_CHECK_INPUT_URL=https://storage.example.com/input.rvt?sig=input-secret");
    expect(patch.nextText).toContain("BIM_APS_CHECK_OUTPUT_URL=https://outputs.example.com/output.zip?sig=output-secret");
    expect(patch.nextText).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS=outputs.example.com");
    expect(patch.explicitKeys).toEqual(expect.arrayContaining([
      "BIM_WORKER_PROVIDER",
      "BIM_APS_CLIENT_ID",
      "BIM_APS_CLIENT_SECRET",
      "BIM_APS_ACTIVITY_ID",
      "BIM_APS_CHECK_INPUT_URL",
      "BIM_APS_CHECK_OUTPUT_URL",
    ]));
    expect(patch.derivedKeys).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("new-secret");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("owner.itemicostos+prod");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("input-secret");
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("output-secret");
  });

  it("does not duplicate APS output redirect hosts already covered by a wildcard", () => {
    const patch = createBimLocalEnvPatch({
      envText: [
        "BIM_APS_CHECK_OUTPUT_URL=",
        "BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS=*.example.com",
      ].join("\n"),
      explicitEnv: {
        BIM_APS_CHECK_OUTPUT_URL: "https://outputs.example.com/output.zip?sig=output-secret",
      },
    });

    expect(patch.changed).toBe(true);
    expect(patch.nextText).toContain("BIM_APS_CHECK_OUTPUT_URL=https://outputs.example.com/output.zip?sig=output-secret");
    expect(patch.nextText).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS=*.example.com");
    expect(patch.derivedKeys).not.toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS");
  });

  it("applies explicit smoke project and session values while deriving bridge smoke config", () => {
    const patch = createBimLocalEnvPatch({
      envText: [
        "BIM_SMOKE_PROJECT_ID=",
        "BIM_SMOKE_SESSION_COOKIE=",
        "BIM_BRIDGE_SMOKE_PROJECT_ID=",
        "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID=",
        "BIM_BRIDGE_SMOKE_SESSION_COOKIE=",
        "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE=",
        "BIM_BRIDGE_E2E_REQUESTED_BY=",
      ].join("\n"),
      explicitEnv: {
        BIM_SMOKE_PROJECT_ID: "project-real-1",
        BIM_SMOKE_SESSION_COOKIE: "itemicostos-session-secret",
        BIM_BRIDGE_E2E_REQUESTED_BY: "operador@empresa.com",
      },
    });

    expect(patch.changed).toBe(true);
    expect(patch.nextText).toContain("BIM_SMOKE_PROJECT_ID=project-real-1");
    expect(patch.nextText).toContain("BIM_BRIDGE_SMOKE_PROJECT_ID=project-real-1");
    expect(patch.nextText).toContain("BIM_BRIDGE_E2E_SMOKE_PROJECT_ID=project-real-1");
    expect(patch.nextText).toContain("BIM_BRIDGE_SMOKE_SESSION_COOKIE=itemicostos-session-secret");
    expect(patch.nextText).toContain("BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE=itemicostos-session-secret");
    expect(patch.nextText).toContain("BIM_BRIDGE_E2E_REQUESTED_BY=operador@empresa.com");
    expect(patch.explicitKeys).toEqual(expect.arrayContaining([
      "BIM_SMOKE_PROJECT_ID",
      "BIM_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_REQUESTED_BY",
    ]));
    expect(patch.derivedKeys).toEqual(expect.arrayContaining([
      "BIM_BRIDGE_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE",
    ]));
    expect(JSON.stringify(patch.redactedSummary)).not.toContain("itemicostos-session-secret");
  });

  it("maps APS HTTPS output arguments to downloadable remote artifacts", () => {
    const artifacts = extractApsRemoteOutputArtifacts({
      arguments: {
        resultZip: {
          url: "https://storage.example.com/output.zip?sig=123",
          fileName: "resultado.zip",
          contentType: "application/zip",
          sizeBytes: 2048,
          checksumSha256: "a".repeat(64),
        },
        unsafeHttp: {
          url: "http://storage.example.com/not-allowed.txt",
        },
      },
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].storageProvider).toBe("aps");
    expect(artifacts[0].storageUri).toContain("https://storage.example.com/output.zip");
    expect(artifacts[0].metadata.argumentName).toBe("resultZip");
    expect(artifacts[0].checksumSha256).toBe("a".repeat(64));
  });

  it("normalizes API smoke configuration and payloads", () => {
    const config = normalizeBimApiSmokeConfig({
      BIM_WORKER_BASE_URL: "http://127.0.0.1:5500",
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_SESSION_COOKIE: "abc123",
      ACCESS_COOKIE_NAME: "custom_session",
      BIM_SMOKE_STRICT: "true",
    });
    const payload = createBimApiSmokeJobPayload(config, "2026-06-22T10:00:00.000Z");

    expect(config.baseUrl).toBe("http://127.0.0.1:5500/");
    expect(config.sessionCookie).toBe("custom_session=abc123");
    expect(config.strict).toBe(true);
    expect(getBimApiSmokeMissingConfig(config)).toEqual([]);
    expect(payload.commandType).toBe("api-smoke-cloud-model-analysis");
    expect(payload.projectId).toBe("project-1");
    expect(payload.payload.source).toBe("api-smoke");
    expect(payload.modelIdentity.documentVersion).toContain("api-smoke-2026");
    expect(getBimApiSmokeMissingConfig(normalizeBimApiSmokeConfig({}))).toEqual([
      "BIM_SMOKE_PROJECT_ID",
      "BIM_SMOKE_SESSION_COOKIE",
    ]);
  });

  it("builds safe bridge smoke requests filtered by command type", () => {
    const config = normalizeBimBridgeSmokeConfig({
      BIM_WORKER_BASE_URL: "http://127.0.0.1:5500",
      BIM_BRIDGE_SMOKE_API_KEY: "secret-key",
      BIM_BRIDGE_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_SMOKE_SESSION_COOKIE: "session-123",
      ACCESS_COOKIE_NAME: "custom_session",
      BIM_BRIDGE_SMOKE_COMMAND_TYPE: "API Smoke Cloud Model Analysis",
      BIM_BRIDGE_SMOKE_STRICT: "true",
      BIM_BRIDGE_SMOKE_TIMESTAMP: "2026-06-22T10:00:00.000Z",
    });
    const claimPath = buildBimBridgeSmokeClaimPath(config);
    const payload = createBimBridgeSmokeJobPayload(config);
    const running = createBimBridgeSmokeRunningProgress(config);
    const mismatch = createBimBridgeSmokeOwnershipMismatchProgress(config);
    const artifacts = createBimBridgeSmokeArtifacts({ id: "job-1" }, config, "2026-06-22T10:00:00.000Z");
    const completed = createBimBridgeSmokeCompletedProgress({ id: "job-1" }, config, artifacts.length);

    expect(config.baseUrl).toBe("http://127.0.0.1:5500/");
    expect(config.strict).toBe(true);
    expect(config.commandType).toBe("api-smoke-cloud-model-analysis");
    expect(config.sessionCookie).toBe("custom_session=session-123");
    expect(config.createJob).toBe(true);
    expect(getBimBridgeSmokeMissingConfig(config)).toEqual([]);
    expect(payload.projectId).toBe("project-1");
    expect(payload.targetMode).toBe("cloud-model");
    expect(payload.payload.source).toBe("bim-bridge-smoke");
    expect(payload.modelIdentity.documentVersion).toContain("bridge-smoke-2026");
    expect(buildBimBridgeSmokeClaimPath(normalizeBimBridgeSmokeConfig({}))).toContain("commandType=api-smoke-cloud-model-analysis");
    expect(getBimBridgeSmokeMissingConfig(normalizeBimBridgeSmokeConfig({}))).toEqual([
      "BIM_BRIDGE_SMOKE_API_KEY",
      "BIM_BRIDGE_SMOKE_PROJECT_ID",
    ]);
    expect(getBimBridgeSmokeMissingConfig(normalizeBimBridgeSmokeConfig({
      BIM_BRIDGE_SMOKE_API_KEY: "secret-key",
      BIM_BRIDGE_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_SMOKE_CREATE_JOB: "true",
    }))).toEqual(["BIM_BRIDGE_SMOKE_SESSION_COOKIE"]);
    expect(claimPath).toContain("targetMode=cloud-model");
    expect(claimPath).toContain("projectId=project-1");
    expect(claimPath).toContain("commandType=api-smoke-cloud-model-analysis");
    expect(running.status).toBe("running");
    expect(mismatch.bridgeId).toBe(`${config.workerId}-mismatch`);
    expect(mismatch.bridgeId).not.toBe(running.bridgeId);
    expect(artifacts[0].json.jobId).toBe("job-1");
    expect(completed.status).toBe("completed");
    expect(completed.result.artifactCount).toBe(1);
  });

  it("builds an active Revit bridge E2E smoke that creates and claims the same job", () => {
    const config = normalizeBimBridgeE2eSmokeConfig({
      BIM_WORKER_BASE_URL: "http://127.0.0.1:5500",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "secret-key",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-123",
      BIM_BRIDGE_E2E_REQUESTED_BY: "Operador@Empresa.COM",
      ACCESS_COOKIE_NAME: "custom_session",
      BIM_BRIDGE_E2E_SMOKE_TIMESTAMP: "2026-06-22T10:00:00.000Z",
    });
    const payload = createBimBridgeE2eSmokeJobPayload(config);
    const claimPath = buildBimBridgeE2eSmokeClaimPath(config);
    const mismatchConfig = createBimBridgeE2eSmokeDocumentVersionMismatchConfig(config);
    const mismatchClaimPath = buildBimBridgeE2eSmokeClaimPath(mismatchConfig);

    expect(config.baseUrl).toBe("http://127.0.0.1:5500/");
    expect(config.sessionCookie).toBe("custom_session=session-123");
    expect(config.requestedBy).toBe("operador@empresa.com");
    expect(getBimBridgeE2eSmokeMissingConfig(config)).toEqual([]);
    expect(getBimBridgeE2eSmokeMissingConfig(normalizeBimBridgeE2eSmokeConfig({}))).toEqual([
      "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID",
      "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE",
      "BIM_BRIDGE_E2E_SMOKE_API_KEY",
      "BIM_BRIDGE_E2E_REQUESTED_BY",
    ]);
    expect(payload.targetMode).toBe("active-revit");
    expect(payload.commandType).toBe("api-smoke-active-revit-preview");
    expect(payload.payload.source).toBe("bridge-e2e-smoke");
    expect(claimPath).toContain("targetMode=active-revit");
    expect(claimPath).toContain("commandType=api-smoke-active-revit-preview");
    expect(claimPath).toContain("requestedBy=operador%40empresa.com");
    expect(claimPath).toContain("modelGuid=bridge-e2e-smoke-model");
    expect(claimPath).toContain("documentUid=bridge-e2e-smoke-document");
    expect(claimPath).toContain("documentVersion=bridge-e2e-smoke-2026-06-22T10%3A00%3A00.000Z");
    expect(mismatchConfig.modelIdentity.documentVersion).toBe("bridge-e2e-smoke-2026-06-22T10:00:00.000Z-mismatch");
    expect(mismatchClaimPath).toContain("modelGuid=bridge-e2e-smoke-model");
    expect(mismatchClaimPath).toContain("documentVersion=bridge-e2e-smoke-2026-06-22T10%3A00%3A00.000Z-mismatch");
  });
});

function createReadyFluencyReport() {
  return {
    checked: true,
    exists: true,
    path: "data/bim-fluency-check.json",
    report: {
      ok: true,
      status: "ready",
      generatedAt: "2026-06-23T15:00:00.000Z",
      summary: {
        checkCount: 6,
        failedCount: 0,
        totalSimulatedElements: 320000,
        realtimeEvents: 10004,
        realtimeRenderReductionPercent: 95.76,
      },
      checks: createReadyFluencyChecks(),
    },
  };
}

function createReadyFluencyChecks() {
  return [
    { id: "cloud-worker-load", ok: true },
    { id: "web-realtime-load", ok: true },
    { id: "revit-batch-plan", ok: true },
    { id: "revit-bridge-backoff", ok: true },
    { id: "revit-cancellation-probe", ok: true },
    { id: "revit-transaction-failure", ok: true },
  ];
}

function readWorkerFile(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function jsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}
