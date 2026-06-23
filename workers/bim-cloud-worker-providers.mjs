import { setTimeout as sleep } from "node:timers/promises";
import {
  buildApsWorkItemPayload,
  createApsDesignAutomationClient,
  isSuccessfulApsWorkItemStatus,
  isTerminalApsWorkItemStatus,
  normalizeApsDesignAutomationConfig,
  normalizeApsWorkItemStatus,
  summarizeApsWorkItemContract,
} from "./aps-design-automation-client.mjs";
import {
  createCloudWorkerArtifacts,
  createCloudWorkerProgress,
  createCloudWorkerResult,
  createCloudWorkerRemoteStopDecision,
} from "./bim-cloud-worker-domain.mjs";
import { classifyApsAutomationError } from "./aps-diagnostics-domain.mjs";

export const BIM_CLOUD_PROVIDER_IDS = ["simulated-aps", "aps-design-automation"];

export function createBimCloudProvider(config = {}) {
  const providerId = normalizeBimCloudProviderId(config.providerId);
  if (providerId === "aps-design-automation") {
    return createApsDesignAutomationProvider(config);
  }
  return createSimulatedApsProvider(config);
}

export function normalizeBimCloudProviderId(value) {
  const providerId = String(value || "").trim().toLowerCase();
  return BIM_CLOUD_PROVIDER_IDS.includes(providerId) ? providerId : "simulated-aps";
}

function createSimulatedApsProvider(config = {}) {
  return {
    id: "simulated-aps",
    label: "APS simulado",
    mode: "simulated",
    validate() {
      return [];
    },
    createReadinessReport(plan) {
      return {
        ok: true,
        providerId: "simulated-aps",
        mode: "simulated",
        validationErrors: [],
        plan: {
          elementCount: plan.elementCount,
          batchSize: plan.batchSize,
          batchCount: plan.batchCount,
        },
      };
    },
    async createLiveReadinessReport(plan) {
      return {
        ...this.createReadinessReport(plan),
        live: {
          attempted: false,
          skipped: true,
          ok: true,
          reason: "Proveedor simulado; no se contacto APS real.",
        },
      };
    },
    createStartProgress(plan) {
      return {
        status: "running",
        stage: "Preparando worker cloud",
        percent: 2,
        message: `Worker ${config.workerId || "cloud-worker"} preparo ${plan.batchCount} lotes simulados.`,
      };
    },
    createBatchProgress(plan, batchIndex, options = {}) {
      return createCloudWorkerProgress(plan, batchIndex, {
        ...options,
        providerId: "simulated-aps",
      });
    },
    createArtifacts(plan, timings = {}) {
      return createCloudWorkerArtifacts(plan, {
        ...timings,
        providerId: "simulated-aps",
        providerStatus: "simulated",
      });
    },
    createResult(plan, timings = {}) {
      return createCloudWorkerResult(plan, {
        ...timings,
        providerId: "simulated-aps",
        providerStatus: "simulated",
      });
    },
  };
}

function createApsDesignAutomationProvider(config = {}) {
  const apsConfig = normalizeApsDesignAutomationConfig(config);
  const client = createApsDesignAutomationClient(apsConfig, config.fetchImpl || globalThis.fetch);

  return {
    id: "aps-design-automation",
    label: "APS Design Automation",
    mode: "aps-design-automation",
    validate() {
      const missing = [];
      [
        ["BIM_APS_CLIENT_ID", apsConfig.clientId],
        ["BIM_APS_CLIENT_SECRET", apsConfig.clientSecret],
        ["BIM_APS_ACTIVITY_ID", apsConfig.activityId],
      ].forEach(([name, value]) => {
        if (!String(value || "").trim()) {
          missing.push(name);
        }
      });
      return missing;
    },
    createReadinessReport(plan, job) {
      const validationErrors = this.validate();
      const workItemPayload = buildApsWorkItemPayload(job, plan, apsConfig);
      const workItemContract = summarizeApsWorkItemContract(workItemPayload);
      if (!workItemPayload.activityId) {
        validationErrors.push("BIM_APS_ACTIVITY_ID");
      }
      return {
        ok: validationErrors.length === 0,
        providerId: "aps-design-automation",
        mode: "aps-design-automation",
        validationErrors: Array.from(new Set(validationErrors)),
        endpoints: {
          tokenUrl: apsConfig.tokenUrl,
          baseUrl: apsConfig.baseUrl,
        },
        polling: {
          pollMs: apsConfig.pollMs,
          timeoutMs: apsConfig.timeoutMs,
        },
        scopes: apsConfig.scopes,
        workItemPreview: sanitizeWorkItemPreview(workItemPayload),
        workItemContract,
      };
    },
    async createLiveReadinessReport(plan, job) {
      const readiness = this.createReadinessReport(plan, job);
      if (!readiness.ok) {
        return {
          ...readiness,
          live: {
            attempted: false,
            ok: false,
            reason: "Configura credenciales APS antes de validar en vivo.",
          },
        };
      }

      const startedAt = Date.now();
      try {
        await client.getAccessToken();
        const activity = await client.getActivity(readiness.workItemPreview.activityId);
        return {
          ...readiness,
          live: {
            attempted: true,
            ok: true,
            durationMs: Date.now() - startedAt,
            auth: { ok: true },
            activity: summarizeApsActivity(activity),
          },
        };
      } catch (error) {
        const diagnostic = classifyApsAutomationError(error);
        return {
          ...readiness,
          ok: false,
          live: {
            attempted: true,
            ok: false,
            status: diagnostic.status,
            durationMs: Date.now() - startedAt,
            error: diagnostic.message,
            diagnostic,
          },
        };
      }
    },
    createStartProgress() {
      return {
        status: "running",
        stage: "Preparando APS Design Automation",
        percent: 2,
        message: "Preparando contrato para ejecutar work item en APS Design Automation.",
      };
    },
    async execute(plan, job, context = {}) {
      const startedAt = Date.now();
      const workItemPayload = buildApsWorkItemPayload(job, plan, apsConfig);
      const contract = summarizeApsWorkItemContract(workItemPayload);
      if (!contract.readyForExecution) {
        throw new Error(`APS work item incompleto. Faltan: ${formatApsWorkItemContractMissing(contract.missing)}.`);
      }
      const created = await client.createWorkItem(workItemPayload);
      const workItemId = normalizeWorkItemId(created);
      if (!workItemId) {
        throw new Error("APS Design Automation no devolvio id del work item.");
      }
      let latestJob = await context.reportProgress?.(job.id, {
        bridgeId: config.workerId,
        status: "running",
        stage: "APS work item enviado",
        percent: 10,
        message: `APS recibio el work item ${workItemId}.`,
      });
      const initialRemoteStop = await resolveApsRemoteStop(latestJob, client, workItemId);
      if (initialRemoteStop) {
        return initialRemoteStop;
      }

      let currentStatus = created;
      while (!isTerminalApsWorkItemStatus(currentStatus.status)) {
        if (Date.now() - startedAt > apsConfig.timeoutMs) {
          throw createApsWorkItemFailedError({
            plan,
            workItemId,
            workItemStatus: {
              ...currentStatus,
              status: "timeout",
              lastKnownStatus: currentStatus,
            },
            durationMs: Date.now() - startedAt,
            message: `APS work item ${workItemId} supero el timeout configurado.`,
          });
        }
        await sleep(apsConfig.pollMs);
        currentStatus = await client.getWorkItem(workItemId);
        const status = normalizeApsWorkItemStatus(currentStatus.status);
        const elapsedRatio = Math.min(1, (Date.now() - startedAt) / apsConfig.timeoutMs);
        latestJob = await context.reportProgress?.(job.id, {
          bridgeId: config.workerId,
          status: "running",
          stage: "APS Design Automation",
          percent: Math.min(95, Math.max(15, 15 + elapsedRatio * 80)),
          message: `APS work item ${workItemId}: ${status}.`,
        });
        const pollingRemoteStop = await resolveApsRemoteStop(latestJob, client, workItemId);
        if (pollingRemoteStop) {
          return pollingRemoteStop;
        }
      }

      if (!isSuccessfulApsWorkItemStatus(currentStatus.status)) {
        throw createApsWorkItemFailedError({
          plan,
          workItemId,
          workItemStatus: currentStatus,
          durationMs: Date.now() - startedAt,
        });
      }

      const durationMs = Date.now() - startedAt;
      return {
        durationMs,
        artifacts: createApsExecutionArtifacts(plan, currentStatus, { durationMs, workItemId }),
        resultOptions: {
          providerStatus: "success",
          apsWorkItem: {
            id: workItemId,
            status: normalizeApsWorkItemStatus(currentStatus.status),
            reportUrl: String(currentStatus.reportUrl || ""),
          },
        },
        message: `APS completo el work item ${workItemId}.`,
      };
    },
    createBatchProgress(plan, batchIndex, options = {}) {
      return createCloudWorkerProgress(plan, batchIndex, {
        ...options,
        providerId: "aps-design-automation",
        stage: "Esperando APS Design Automation",
      });
    },
    createArtifacts(plan, timings = {}) {
      return createCloudWorkerArtifacts(plan, {
        ...timings,
        providerId: "aps-design-automation",
        providerStatus: "adapter-ready",
      });
    },
    createResult(plan, timings = {}) {
      return createCloudWorkerResult(plan, {
        ...timings,
        providerId: "aps-design-automation",
        providerStatus: timings.providerStatus || "adapter-ready",
      });
    },
  };
}

function formatApsWorkItemContractMissing(missing) {
  return (Array.isArray(missing) ? missing : [])
    .map((item) => {
      if (item === "APS_INPUT_ARGUMENT") return "input HTTPS con verb GET";
      if (item === "APS_OUTPUT_ARGUMENT") return "output HTTPS con verb PUT";
      if (item === "APS_ACTIVITY_ID") return "activityId";
      return String(item || "").trim();
    })
    .filter(Boolean)
    .join(", ") || "contrato APS ejecutable";
}

async function cancelApsWorkItemSafely(client, workItemId) {
  try {
    await client.cancelWorkItem(workItemId);
    return {
      ok: true,
      workItemId,
    };
  } catch (error) {
    return {
      ok: false,
      workItemId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveApsRemoteStop(latestJob, client, workItemId) {
  const decision = createCloudWorkerRemoteStopDecision(latestJob);
  if (!decision.shouldStop) {
    return null;
  }
  return {
    terminal: true,
    cancelled: decision.cancelled,
    status: decision.status,
    remoteCancellation: decision.shouldCancelRemoteWorkItem
      ? await cancelApsWorkItemSafely(client, workItemId)
      : null,
  };
}

function createApsExecutionArtifacts(plan, workItemStatus, timings = {}) {
  const artifacts = createCloudWorkerArtifacts(plan, {
    ...timings,
    providerId: "aps-design-automation",
    providerStatus: String(timings.providerStatus || "success"),
  });
  const remoteOutputArtifacts = extractApsRemoteOutputArtifacts(workItemStatus);
  artifacts.push({
    kind: "manifest",
    name: "aps-workitem-status.json",
    contentType: "application/json",
    json: {
      schemaVersion: 1,
      workItemId: timings.workItemId,
      status: normalizeApsWorkItemStatus(workItemStatus.status),
      reportUrl: String(workItemStatus.reportUrl || ""),
      raw: workItemStatus,
    },
    metadata: {
      role: "aps-workitem-status",
      workerMode: "aps-design-automation",
    },
  });
  artifacts.push(...remoteOutputArtifacts);
  if (workItemStatus.reportUrl) {
    artifacts.push({
      kind: "log",
      name: "aps-workitem-report.txt",
      contentType: "text/plain",
      storageProvider: "aps",
      storageUri: String(workItemStatus.reportUrl),
      metadata: {
        role: "aps-report",
        workerMode: "aps-design-automation",
      },
    });
  }
  return artifacts;
}

function createApsWorkItemFailedError({ plan, workItemId, workItemStatus, durationMs, message }) {
  const status = normalizeApsWorkItemStatus(workItemStatus?.status);
  const error = new Error(message || `APS work item ${workItemId} termino con estado ${status}.`);
  error.apsWorkItemId = workItemId;
  error.apsStatus = status;
  error.artifacts = createApsExecutionArtifacts(plan, workItemStatus, {
    durationMs,
    workItemId,
    providerStatus: status || "failed",
  });
  error.resultOptions = {
    providerStatus: status || "failed",
    apsWorkItem: {
      id: workItemId,
      status,
      reportUrl: String(workItemStatus?.reportUrl || ""),
    },
  };
  return error;
}

export function extractApsRemoteOutputArtifacts(workItemStatus) {
  const args = workItemStatus && typeof workItemStatus === "object" && workItemStatus.arguments && typeof workItemStatus.arguments === "object"
    ? workItemStatus.arguments
    : {};
  return Object.entries(args)
    .flatMap(([argumentName, argumentValue]) => normalizeApsRemoteOutputArtifact(argumentName, argumentValue))
    .filter(Boolean);
}

function normalizeApsRemoteOutputArtifact(argumentName, argumentValue) {
  const value = argumentValue && typeof argumentValue === "object" ? argumentValue : {};
  const url = normalizeHttpsUrl(value.url || value.href || value.signedUrl || value.storageUri || (typeof argumentValue === "string" ? argumentValue : ""));
  if (!url) {
    return [];
  }
  const name = sanitizeArtifactName(value.name || value.fileName || `${argumentName}.bin`);
  return [{
    kind: "output",
    name,
    contentType: String(value.contentType || value.mimeType || "application/octet-stream").trim(),
    storageProvider: "aps",
    storageUri: url,
    sizeBytes: Number.isFinite(Number(value.sizeBytes || value.size)) ? Number(value.sizeBytes || value.size) : 0,
    checksumSha256: normalizeSha256(value.checksumSha256 || value.sha256 || value.checksum),
    metadata: {
      role: "aps-output",
      argumentName,
      workerMode: "aps-design-automation",
    },
  }];
}

function normalizeHttpsUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function sanitizeArtifactName(value) {
  const text = String(value || "artifact.bin").trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  return text.slice(0, 180) || "artifact.bin";
}

function normalizeWorkItemId(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  return String(value.id || value.workItemId || value.workitemId || value.uuid || "").trim();
}

function sanitizeWorkItemPreview(value) {
  return sanitizePreviewValue(value, "");
}

function sanitizePreviewValue(value, key) {
  if (isSensitivePreviewKey(key)) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    return sanitizePreviewString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePreviewValue(entry, key));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizePreviewValue(entryValue, entryKey),
    ]),
  );
}

function isSensitivePreviewKey(key) {
  return /token|secret|password|signature|authorization|credential|accesskey|sas|sig/i.test(String(key || ""));
}

function sanitizePreviewString(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") {
      return text;
    }
    const hasSensitiveSuffix = Boolean(url.search || url.hash);
    url.search = "";
    url.hash = "";
    return hasSensitiveSuffix ? `${url.toString()}[signed-query-redacted]` : url.toString();
  } catch {
    return text;
  }
}

function summarizeApsActivity(activity) {
  const source = activity && typeof activity === "object" ? activity : {};
  return {
    ok: true,
    id: String(source.id || source.activityId || ""),
    nickname: String(source.nickname || ""),
    version: String(source.version || ""),
    commandLine: Array.isArray(source.commandLine)
      ? source.commandLine.length
      : (source.commandLine ? 1 : 0),
    parameters: source.parameters && typeof source.parameters === "object"
      ? Object.keys(source.parameters)
      : [],
  };
}
