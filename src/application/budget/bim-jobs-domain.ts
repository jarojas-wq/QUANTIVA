import type {
  BimBridgePresenceSummary,
  BimJobQueueSummary,
  BimJobRecord,
  BimJobStatus,
  BimJobTargetMode,
  RevitExportRecord,
} from "../../domain/models";

const BIM_JOB_STATUSES: BimJobStatus[] = ["queued", "claimed", "running", "applying", "completed", "failed", "cancelled"];
const BIM_JOB_TARGET_MODES: BimJobTargetMode[] = ["active-revit", "cloud-model"];
export const BIM_JOB_REALTIME_FLUSH_MS = 120;
export const BIM_JOB_REALTIME_MAX_STREAMS = 4;
export const BIM_JOB_FLUENCY_WARNING_MS = 750;
export const BIM_JOB_FLUENCY_CRITICAL_MS = 2000;
export const BIM_ACTIVE_REVIT_QUEUE_WAIT_WARNING_SECONDS = 120;
export const BIM_ACTIVE_REVIT_QUEUE_WAIT_CRITICAL_SECONDS = 600;
export const BIM_JOB_CREATE_MODEL_IDENTITY_MESSAGE = "Para crear un preview Revit activo se requiere una identidad estable del modelo: modelGuid, documentUid o modelPath.";

export type BimReadinessTone = "ok" | "warning" | "critical";

export interface BimJobBridgeWaitDiagnostic {
  tone: BimReadinessTone;
  label: string;
  reason: "none" | "queued" | "bridge-slow" | "bridge-offline" | "model-mismatch";
  action: string;
  waitingJobCount: number;
  oldestWaitSeconds: number;
  requiresBridgeAttention: boolean;
}

export interface BimApplyPlan {
  schemaVersion: number;
  sourceJobId: string;
  executionMode: string;
  operationType: string;
  operationCount: number;
  elementCount: number;
  batchSize: number;
  plannedBatches: number;
  transactionMode: string;
  requiresActiveModelIdentity: boolean;
  requiresApplyConfirmation: boolean;
  operations: BimApplyOperation[];
  operationsSource: BimApplyOperationsSource;
}

export interface BimApplyOperation {
  operationType: string;
  elementId: number;
  elementUniqueId: string;
  parameterName: string;
  value: string;
}

export interface BimApplyOperationsSource {
  kind: string;
  jobId: string;
  source: string;
  endpoint: string;
  operationCount: number;
  pageSize: number;
}

export interface BimReadinessCheck {
  id: string;
  label: string;
  status: BimReadinessTone;
  optional: boolean;
  missing: string[];
  details: Record<string, unknown>;
}

export interface BimReadinessReport {
  ok: boolean;
  status: string;
  providerId: string;
  baseUrl: string;
  storage: {
    kind: string;
    label: string;
  };
  activeRevitBridgeReady: boolean;
  cloudWorkerReady: boolean;
  apsLiveReady: boolean;
  artifactDownloadsReady: boolean;
  apsProviderCheckReady: boolean;
  hybridBimReady: boolean;
  readyForRealValidation: boolean;
  missing: string[];
  checks: BimReadinessCheck[];
  nextCommands: string[];
  generatedAt: string;
}

export function normalizeBimReadinessReport(input: unknown): BimReadinessReport {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<BimReadinessReport> & Record<string, unknown>
    : {};
  const storage = normalizeObject(source.storage);

  return {
    ok: normalizeBoolean(source.ok),
    status: normalizeText(source.status, "unknown"),
    providerId: normalizeText(source.providerId, ""),
    baseUrl: normalizeText(source.baseUrl, ""),
    storage: {
      kind: normalizeText(storage.kind, ""),
      label: normalizeText(storage.label, normalizeText(storage.kind, ""))
    },
    activeRevitBridgeReady: normalizeBoolean(source.activeRevitBridgeReady),
    cloudWorkerReady: normalizeBoolean(source.cloudWorkerReady),
    apsLiveReady: normalizeBoolean(source.apsLiveReady),
    artifactDownloadsReady: normalizeBoolean(source.artifactDownloadsReady),
    apsProviderCheckReady: normalizeBoolean(source.apsProviderCheckReady),
    hybridBimReady: normalizeBoolean(source.hybridBimReady),
    readyForRealValidation: normalizeBoolean(source.readyForRealValidation),
    missing: normalizeTextArray(source.missing),
    checks: Array.isArray(source.checks)
      ? source.checks.map((check, index) => normalizeBimReadinessCheck(check, index))
      : [],
    nextCommands: normalizeTextArray(source.nextCommands),
    generatedAt: normalizeDate(source.generatedAt)
  };
}

export function getBimReadinessTone(report: BimReadinessReport): BimReadinessTone {
  if (report.readyForRealValidation) return "ok";
  if (report.hybridBimReady) return "ok";
  if (report.activeRevitBridgeReady || report.cloudWorkerReady || report.apsLiveReady) return "warning";
  return "critical";
}

export function getBimReadinessLabel(report: BimReadinessReport) {
  if (report.readyForRealValidation) return "Listo para validacion real";
  if (report.hybridBimReady) return "Hibrido local listo";
  if (report.activeRevitBridgeReady) return "Puente local listo";
  if (report.cloudWorkerReady) return "Backend BIM listo";
  return "Configuracion pendiente";
}

export function getBimReadinessMissingSummary(report: BimReadinessReport, limit = 3) {
  if (report.missing.length === 0) return "Sin pendientes";
  const visibleLimit = clampInteger(limit, 1, 8, 3);
  const visible = report.missing.slice(0, visibleLimit);
  const remaining = report.missing.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? ` +${remaining}` : ""}`;
}

export function getBimReadinessPhaseSummary(report: BimReadinessReport, limit = 2) {
  if (report.readyForRealValidation) return "Validacion real completa";
  if (report.hybridBimReady) return `APS fase 2: ${getBimReadinessMissingSummary(report, limit)}`;
  return `Pendientes: ${getBimReadinessMissingSummary(report, limit)}`;
}

export function getActiveRevitReadinessTone(report: BimReadinessReport): BimReadinessTone {
  const activeChecks = report.checks.filter(isActiveRevitReadinessCheck);
  const hasBlockingIssue = activeChecks.some((check) => check.status === "critical" && !check.optional);
  if (!report.activeRevitBridgeReady || hasBlockingIssue) return "critical";
  if (activeChecks.some((check) => check.status !== "ok")) return "warning";
  return "ok";
}

export function getActiveRevitReadinessLabel(report: BimReadinessReport) {
  const tone = getActiveRevitReadinessTone(report);
  if (tone === "ok") return "Revit activo listo";
  if (report.activeRevitBridgeReady) return "Puente local parcial";
  return "Configura puente Revit";
}

export function getActiveRevitReadinessMissingSummary(report: BimReadinessReport, limit = 3) {
  const missing = getActiveRevitReadinessMissing(report);
  if (missing.length === 0) return "Sin pendientes Revit";
  const visibleLimit = clampInteger(limit, 1, 8, 3);
  const visible = missing.slice(0, visibleLimit);
  const remaining = missing.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? ` +${remaining}` : ""}`;
}

export function selectBimReadinessVisibleChecks(report: BimReadinessReport, limit = 6): BimReadinessCheck[] {
  const visibleLimit = clampInteger(limit, 1, 12, 6);
  if (report.checks.length === 0) {
    return [
      createReadinessCheckFallback("active-revit", "Puente Revit", report.activeRevitBridgeReady),
      createReadinessCheckFallback("cloud-worker", "Worker cloud", report.cloudWorkerReady),
      createReadinessCheckFallback("aps-live", "APS live", report.apsLiveReady),
      createReadinessCheckFallback("aps-contract", "Contrato APS", report.apsProviderCheckReady),
      createReadinessCheckFallback("artifacts", "Artefactos", report.artifactDownloadsReady),
      createReadinessCheckFallback("real-validation", "Validacion real", report.readyForRealValidation),
    ].slice(0, visibleLimit);
  }

  const requiredIssues = report.checks.filter((check) => check.status !== "ok" && !check.optional);
  const optionalIssues = report.checks.filter((check) => check.status !== "ok" && check.optional);
  return uniqueReadinessChecks([
    ...requiredIssues,
    ...optionalIssues,
    ...report.checks,
  ]).slice(0, visibleLimit);
}

export function selectActiveRevitReadinessVisibleChecks(report: BimReadinessReport, limit = 6): BimReadinessCheck[] {
  const visibleLimit = clampInteger(limit, 1, 12, 6);
  const activeChecks = report.checks.filter(isActiveRevitReadinessCheck);
  if (activeChecks.length === 0) {
    return [
      createReadinessCheckFallback("backend-health", "Backend", report.ok),
      createReadinessCheckFallback("active-revit", "Puente Revit", report.activeRevitBridgeReady),
      createReadinessCheckFallback("local-fluency", "Fluidez local", true),
      createReadinessCheckFallback("real-validation", "Validacion real", report.readyForRealValidation),
    ].slice(0, visibleLimit);
  }

  const requiredIssues = activeChecks.filter((check) => check.status !== "ok" && !check.optional);
  const optionalIssues = activeChecks.filter((check) => check.status !== "ok" && check.optional);
  return uniqueReadinessChecks([
    ...requiredIssues,
    ...optionalIssues,
    ...activeChecks,
  ]).slice(0, visibleLimit);
}

export function normalizeBimJobRecord(input: unknown): BimJobRecord {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<BimJobRecord> & Record<string, unknown>
    : {};
  const status = BIM_JOB_STATUSES.includes(source.status as BimJobStatus)
    ? source.status as BimJobStatus
    : "queued";
  const targetMode = BIM_JOB_TARGET_MODES.includes(source.targetMode as BimJobTargetMode)
    ? source.targetMode as BimJobTargetMode
    : "active-revit";

  return {
    id: normalizeText(source.id, ""),
    projectId: normalizeText(source.projectId, ""),
    targetMode,
    commandType: normalizeText(source.commandType, "bim-analysis"),
    status,
    stage: normalizeText(source.stage, getBimJobStatusLabel(status)),
    percent: normalizePercent(source.percent),
    payload: normalizeObject(source.payload),
    modelIdentity: normalizeObject(source.modelIdentity),
    result: normalizeObject(source.result),
    error: normalizeText(source.error, ""),
    createdBy: normalizeText(source.createdBy, "Usuario"),
    claimedBy: normalizeText(source.claimedBy, ""),
    claimedAt: normalizeText(source.claimedAt, ""),
    createdAt: normalizeDate(source.createdAt),
    updatedAt: normalizeDate(source.updatedAt),
    completedAt: normalizeText(source.completedAt, ""),
    queueWaitSeconds: normalizeInteger(source.queueWaitSeconds),
    runSeconds: normalizeInteger(source.runSeconds),
    totalSeconds: normalizeInteger(source.totalSeconds),
    logs: Array.isArray(source.logs)
      ? source.logs.map((log, index) => {
        const entry = log as unknown as Record<string, unknown>;
        const level = ["info", "warn", "error"].includes(String(entry.level || ""))
          ? String(entry.level) as "info" | "warn" | "error"
          : "info";
        return {
          id: normalizeText(entry.id, `log-${index + 1}`),
          level,
          message: normalizeText(entry.message, ""),
          createdAt: normalizeDate(entry.createdAt)
        };
      }).filter((log) => log.message)
      : []
  };
}

export function normalizeBimJobRecords(input: unknown): BimJobRecord[] {
  return Array.isArray(input)
    ? input.map((entry) => normalizeBimJobRecord(entry as Partial<BimJobRecord> & Record<string, unknown>))
    : [];
}

export function normalizeBimJobQueueSummary(input: unknown): BimJobQueueSummary {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<BimJobQueueSummary> & Record<string, unknown>
    : {};
  const activeRevit = normalizeInteger(source.activeRevit);
  const cloudModel = normalizeInteger(source.cloudModel);
  const activeRevitQueued = normalizeInteger(source.activeRevitQueued);
  const cloudModelQueued = normalizeInteger(source.cloudModelQueued);

  return {
    total: normalizeInteger(source.total),
    queued: normalizeInteger(source.queued),
    active: normalizeInteger(source.active),
    completed: normalizeInteger(source.completed),
    failed: normalizeInteger(source.failed),
    cancelled: normalizeInteger(source.cancelled),
    activeRevit,
    activeRevitQueued,
    activeRevitProcessing: normalizeIntegerWithFallback(source.activeRevitProcessing, activeRevit - activeRevitQueued),
    cloudModel,
    cloudModelQueued,
    cloudModelProcessing: normalizeIntegerWithFallback(source.cloudModelProcessing, cloudModel - cloudModelQueued),
    oldestQueuedAt: normalizeText(source.oldestQueuedAt, ""),
    oldestQueuedAgeSeconds: normalizeInteger(source.oldestQueuedAgeSeconds),
    oldestActiveRevitQueuedAt: normalizeText(source.oldestActiveRevitQueuedAt, ""),
    oldestActiveRevitQueuedAgeSeconds: normalizeInteger(source.oldestActiveRevitQueuedAgeSeconds),
    oldestActiveAt: normalizeText(source.oldestActiveAt, ""),
    latestCompletedAt: normalizeText(source.latestCompletedAt, ""),
    oldestActiveAgeSeconds: normalizeInteger(source.oldestActiveAgeSeconds),
    generatedAt: normalizeDate(source.generatedAt),
    bridgePresence: normalizeBimBridgePresenceSummary(source.bridgePresence),
  };
}

export function getBimJobBridgeWaitDiagnostic(
  summary: BimJobQueueSummary,
  warningSeconds = BIM_ACTIVE_REVIT_QUEUE_WAIT_WARNING_SECONDS,
  criticalSeconds = BIM_ACTIVE_REVIT_QUEUE_WAIT_CRITICAL_SECONDS,
): BimJobBridgeWaitDiagnostic {
  const waitingJobCount = normalizeInteger(summary.activeRevitQueued);
  const oldestWaitSeconds = normalizeInteger(summary.oldestActiveRevitQueuedAgeSeconds);
  if (waitingJobCount <= 0) {
    return {
      tone: "ok",
      label: "Sin espera Revit",
      reason: "none",
      action: "",
      waitingJobCount: 0,
      oldestWaitSeconds: 0,
      requiresBridgeAttention: false
    };
  }
  if (oldestWaitSeconds >= normalizeInteger(criticalSeconds)) {
    if (summary.bridgePresence.online) {
      return {
        tone: "critical",
        label: "Bridge activo sin tomar job",
        reason: "model-mismatch",
        action: "Abre el modelo Revit correcto o revisa modelGuid, documentUid y modelPath.",
        waitingJobCount,
        oldestWaitSeconds,
        requiresBridgeAttention: true
      };
    }
    return {
      tone: "critical",
      label: "Revit cerrado o bridge detenido",
      reason: "bridge-offline",
      action: "Abre Revit, inicia sesion en el add-in y ejecuta Jobs BIM.",
      waitingJobCount,
      oldestWaitSeconds,
      requiresBridgeAttention: true
    };
  }
  if (oldestWaitSeconds >= normalizeInteger(warningSeconds)) {
    if (summary.bridgePresence.online) {
      return {
        tone: "warning",
        label: "Bridge activo, esperando modelo",
        reason: "model-mismatch",
        action: "Verifica que el documento abierto coincida con el ultimo lote Revit del proyecto.",
        waitingJobCount,
        oldestWaitSeconds,
        requiresBridgeAttention: true
      };
    }
    return {
      tone: "warning",
      label: "Esperando Revit Bridge",
      reason: "bridge-slow",
      action: "Verifica que Revit este abierto, con sesion activa y auto-claim habilitado.",
      waitingJobCount,
      oldestWaitSeconds,
      requiresBridgeAttention: true
    };
  }
  return {
    tone: "ok",
    label: "Revit en cola",
    reason: "queued",
    action: "",
    waitingJobCount,
    oldestWaitSeconds,
    requiresBridgeAttention: false
  };
}

export function getBimJobStatusLabel(status: BimJobStatus) {
  if (status === "queued") return "En cola";
  if (status === "claimed") return "Tomado por Revit";
  if (status === "running") return "Analizando";
  if (status === "applying") return "Aplicando";
  if (status === "completed") return "Completado";
  if (status === "failed") return "Fallido";
  return "Cancelado";
}

export function isBimJobFinished(status: BimJobStatus) {
  return ["completed", "failed", "cancelled"].includes(status);
}

export function canRetryBimJob(job: BimJobRecord) {
  return isBimJobFinished(job.status) && !isBimApplyCommand(job.commandType);
}

export function requiresBimJobCreateModelIdentity(targetModeInput: unknown, commandTypeInput: unknown) {
  const targetMode = BIM_JOB_TARGET_MODES.includes(targetModeInput as BimJobTargetMode)
    ? targetModeInput as BimJobTargetMode
    : "active-revit";
  const commandType = normalizeBimJobCommandText(commandTypeInput);
  return targetMode === "active-revit"
    && (commandType.includes("preview") || isBimApplyCommand(commandType));
}

export function getBimJobCreateModelIdentityIssue(
  targetMode: BimJobTargetMode,
  commandType: string,
  modelIdentity: unknown,
) {
  if (!requiresBimJobCreateModelIdentity(targetMode, commandType)) {
    return "";
  }
  return hasStableBimModelIdentity(modelIdentity)
    ? ""
    : BIM_JOB_CREATE_MODEL_IDENTITY_MESSAGE;
}

export function resolveActiveRevitJobModelIdentity(input: {
  projectName?: unknown;
  latestRevitExport?: Partial<RevitExportRecord> | null;
  bridgePresence?: Partial<BimBridgePresenceSummary> | null;
}) {
  const projectName = normalizeText(input.projectName, "");
  const bridgePresence = normalizeObject(input.bridgePresence);
  const bridgeIdentity = normalizeObject(bridgePresence.latestModelIdentity);
  if (bridgePresence.online === true && hasStableBimModelIdentity(bridgeIdentity)) {
    return {
      source: "active-revit-bridge",
      projectName,
      modelPath: normalizeText(bridgeIdentity.modelPath, ""),
      modelGuid: normalizeText(bridgeIdentity.modelGuid, ""),
      documentUid: normalizeText(bridgeIdentity.documentUid, ""),
      documentVersion: normalizeText(
        bridgeIdentity.documentVersion
          || bridgeIdentity.modelVersion
          || bridgeIdentity.documentRevision
          || bridgeIdentity.revitDocumentVersion
          || bridgeIdentity.version,
        ""
      ),
      bridgeId: normalizeText(bridgePresence.latestBridgeId, ""),
      bridgeSeenAt: normalizeText(bridgePresence.latestSeenAt, "")
    };
  }

  const latestRevitExport = normalizeObject(input.latestRevitExport);
  return {
    source: "revit-export",
    projectName,
    modelPath: normalizeText(latestRevitExport.modelPath, ""),
    modelGuid: normalizeText(latestRevitExport.modelGuid, ""),
    documentUid: normalizeText(latestRevitExport.documentUid, ""),
    documentVersion: normalizeText(latestRevitExport.uid || latestRevitExport.exportedAt, ""),
    revitExportUid: normalizeText(latestRevitExport.uid, ""),
    exportedAt: normalizeText(latestRevitExport.exportedAt, "")
  };
}

export function canCreateBimApplyJob(job: BimJobRecord) {
  if (job.status !== "completed" || job.targetMode !== "active-revit") {
    return false;
  }
  const commandType = job.commandType.trim().toLowerCase();
  if (isBimApplyCommand(commandType)) {
    return false;
  }
  const hasPreviewCommand = commandType.includes("preview");
  const hasExplicitApplySignal = job.result.requiresApplyConfirmation === true
    || job.result.applyEligible === true;
  return hasPreviewCommand
    && hasExplicitApplySignal
    && hasStableBimModelIdentity(job.modelIdentity)
    && hasExecutableBimApplyPlan(job.result.applyPlan)
    && isBimApplyPlanBoundToPreview(job.result.applyPlan, job.id);
}

function isBimApplyCommand(commandType: string) {
  const normalized = normalizeBimJobCommandText(commandType);
  return normalized.endsWith("-apply") || normalized.includes(":apply");
}

function normalizeBimJobCommandText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function hasStableBimModelIdentity(identityInput: unknown) {
  const identity = normalizeObject(identityInput);
  return Boolean(
    normalizeText(identity.modelGuid, "")
    || normalizeText(identity.documentUid, "")
    || normalizeBimModelPath(identity.modelPath)
  );
}

function normalizeBimModelPath(value: unknown) {
  return String(value || "").trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

export function normalizeBimApplyPlan(input: unknown): BimApplyPlan {
  const source = normalizeObject(input);
  const operations = normalizeBimApplyOperations(source.operations);
  const operationsSource = normalizeBimApplyOperationsSource(source.operationsSource);
  const fallbackOperationCount = operations.length > 0 ? operations.length : source.elementCount;
  const operationCount = clampInteger(
    source.operationCount ?? source.changeCount ?? fallbackOperationCount,
    0,
    Number.MAX_SAFE_INTEGER,
    0
  );
  const elementCount = clampInteger(
    source.elementCount ?? source.elementsCount ?? operationCount,
    0,
    Number.MAX_SAFE_INTEGER,
    operationCount
  );
  return {
    schemaVersion: clampInteger(source.schemaVersion, 1, 100, 1),
    sourceJobId: normalizeText(source.sourceJobId, ""),
    executionMode: normalizeText(source.executionMode, "apply"),
    operationType: normalizeText(source.operationType || source.type, ""),
    operationCount,
    elementCount,
    batchSize: clampInteger(source.batchSize, 1, 5000, 250),
    plannedBatches: clampInteger(source.plannedBatches ?? source.batchCount, 0, Number.MAX_SAFE_INTEGER, 0),
    transactionMode: normalizeText(source.transactionMode, "per-batch"),
    requiresActiveModelIdentity: normalizeBooleanWithFallback(source.requiresActiveModelIdentity, true),
    requiresApplyConfirmation: normalizeBooleanWithFallback(source.requiresApplyConfirmation, true),
    operations,
    operationsSource
  };
}

export function hasExecutableBimApplyPlan(input: unknown) {
  const plan = normalizeBimApplyPlan(input);
  return Boolean(
    plan.operationType
    && plan.operationCount > 0
    && plan.plannedBatches > 0
    && plan.transactionMode
    && (plan.operations.length > 0 || hasReadableBimApplyOperationsSource(plan.operationsSource))
  );
}

export function isBimApplyPlanBoundToPreview(input: unknown, previewJobId: string) {
  const plan = normalizeBimApplyPlan(input);
  const expectedJobId = normalizeText(previewJobId, "");
  if (!expectedJobId || plan.sourceJobId !== expectedJobId) {
    return false;
  }
  if (hasReadableBimApplyOperationsSource(plan.operationsSource)
      && plan.operationsSource.jobId !== expectedJobId) {
    return false;
  }
  return true;
}

function normalizeBimApplyOperationsSource(input: unknown): BimApplyOperationsSource {
  const source = normalizeObject(input);
  return {
    kind: normalizeText(source.kind || source.type, ""),
    jobId: normalizeText(source.jobId || source.jobUid, ""),
    source: normalizeText(source.source, ""),
    endpoint: normalizeText(source.endpoint || source.url, ""),
    operationCount: clampInteger(source.operationCount ?? source.count, 0, Number.MAX_SAFE_INTEGER, 0),
    pageSize: clampInteger(source.pageSize ?? source.limit, 1, 5000, 1000)
  };
}

function hasReadableBimApplyOperationsSource(source: BimApplyOperationsSource) {
  return Boolean(source.kind && source.jobId && source.source && source.operationCount > 0);
}

function normalizeBimApplyOperations(input: unknown): BimApplyOperation[] {
  return Array.isArray(input)
    ? input.map(normalizeBimApplyOperation).filter((operation): operation is BimApplyOperation => operation !== null)
    : [];
}

function normalizeBimApplyOperation(input: unknown): BimApplyOperation | null {
  const source = normalizeObject(input);
  const elementId = normalizeInteger(source.elementId ?? source.revitElementId);
  const elementUniqueId = normalizeText(source.elementUniqueId || source.revitUniqueId || source.uniqueId, "");
  const parameterName = normalizeText(source.parameterName || source.parameter || source.targetParameter, "");
  if (!parameterName || (!elementId && !elementUniqueId)) {
    return null;
  }
  return {
    operationType: normalizeText(source.operationType || source.type, "parameter-write"),
    elementId,
    elementUniqueId,
    parameterName,
    value: normalizeText(source.value ?? source.textValue ?? source.targetValue ?? "", "")
  };
}

export function hasBimApplyJobForPreview(jobs: BimJobRecord[], previewJobId: string) {
  return jobs.some((job) => (
    String(job.payload.sourceJobId || "") === previewJobId
    && job.commandType.trim().toLowerCase() === "active-revit-apply"
  ));
}

export interface BimJobFluencyMetrics {
  status: "ok" | "warning" | "critical";
  processedBatches: number;
  plannedBatches: number;
  batchSize: number;
  yieldDelayMs: number;
  lastBatchDurationMs: number;
  averageBatchDurationMs: number;
  maxBatchDurationMs: number;
  totalBatchDurationMs: number;
}

export function getBimJobFluencyMetrics(job: BimJobRecord): BimJobFluencyMetrics | null {
  const result = normalizeObject(job.result);
  const processedBatches = normalizeIntegerWithFallback(result.processedBatches, result.recordedBatchCount);
  const metrics: BimJobFluencyMetrics = {
    status: normalizeBimJobFluencyStatus(
      result.fluencyStatus,
      normalizeInteger(result.averageBatchDurationMs),
      normalizeInteger(result.maxBatchDurationMs),
    ),
    processedBatches,
    plannedBatches: normalizeInteger(result.plannedBatches),
    batchSize: normalizeInteger(result.batchSize),
    yieldDelayMs: normalizeInteger(result.yieldDelayMs),
    lastBatchDurationMs: normalizeInteger(result.lastBatchDurationMs),
    averageBatchDurationMs: normalizeInteger(result.averageBatchDurationMs),
    maxBatchDurationMs: normalizeInteger(result.maxBatchDurationMs),
    totalBatchDurationMs: normalizeInteger(result.totalBatchDurationMs)
  };
  const hasFluencySignal = metrics.processedBatches > 0
    || metrics.plannedBatches > 0
    || metrics.batchSize > 0
    || metrics.averageBatchDurationMs > 0
    || metrics.maxBatchDurationMs > 0;
  return hasFluencySignal ? metrics : null;
}

export function normalizeBimJobFluencyStatus(
  value: unknown,
  averageBatchDurationMs = 0,
  maxBatchDurationMs = 0,
): "ok" | "warning" | "critical" {
  const text = normalizeText(value, "").toLowerCase();
  if (text === "critical" || text === "warning" || text === "ok") {
    return text;
  }
  if (maxBatchDurationMs >= BIM_JOB_FLUENCY_CRITICAL_MS || averageBatchDurationMs >= BIM_JOB_FLUENCY_CRITICAL_MS) {
    return "critical";
  }
  if (maxBatchDurationMs >= BIM_JOB_FLUENCY_WARNING_MS || averageBatchDurationMs >= BIM_JOB_FLUENCY_WARNING_MS) {
    return "warning";
  }
  return "ok";
}

export function selectBimJobsForRealtime(jobs: BimJobRecord[], limit = BIM_JOB_REALTIME_MAX_STREAMS) {
  return jobs
    .filter((job) => job.id && !isBimJobFinished(job.status))
    .sort((left, right) => {
      const priorityDelta = getRealtimeStatusPriority(left.status) - getRealtimeStatusPriority(right.status);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, clampInteger(limit, 1, 12, BIM_JOB_REALTIME_MAX_STREAMS));
}

export function upsertBimJobRecord(jobs: BimJobRecord[], job: BimJobRecord, limit = 25) {
  const nextJobs = [job, ...jobs.filter((entry) => entry.id !== job.id)];
  return nextJobs
    .sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))
    .slice(0, clampInteger(limit, 1, 100, 25));
}

export interface BimJobRealtimeEvent {
  elapsedMs: number;
  job: BimJobRecord;
}

export interface BimJobRealtimeCommit extends BimJobRealtimeEvent {
  reason: "frame" | "terminal" | "trailing";
}

export interface BimJobRealtimePanelCommit extends BimJobRealtimeCommit {
  jobId: string;
}

export interface BimJobRealtimePanelLoadSummary {
  eventCount: number;
  commitCount: number;
  jobCount: number;
  terminalCommitCount: number;
  durationMs: number;
  flushMs: number;
  commitBudget: number;
  maxCommitsPerSecond: number;
  eventReductionRatio: number;
  renderReductionPercent: number;
  withinCommitBudget: boolean;
}

export function planBimJobRealtimeCommits(
  events: BimJobRealtimeEvent[],
  flushMs = BIM_JOB_REALTIME_FLUSH_MS,
): BimJobRealtimeCommit[] {
  const orderedEvents = events
    .filter((event) => Number.isFinite(event.elapsedMs))
    .sort((left, right) => left.elapsedMs - right.elapsedMs);
  const windowMs = clampInteger(flushMs, 16, 1000, BIM_JOB_REALTIME_FLUSH_MS);
  const commits: BimJobRealtimeCommit[] = [];
  let nextFrameAt = Number.NEGATIVE_INFINITY;
  let pending: BimJobRealtimeEvent | null = null;

  for (const event of orderedEvents) {
    pending = event;
    const terminal = isBimJobFinished(event.job.status);
    if (commits.length === 0 || event.elapsedMs >= nextFrameAt || terminal) {
      commits.push({
        ...event,
        reason: terminal ? "terminal" : "frame"
      });
      pending = null;
      nextFrameAt = event.elapsedMs + windowMs;
    }
  }

  if (pending) {
    commits.push({
      ...pending,
      reason: "trailing"
    });
  }

  return commits;
}

export function planBimJobRealtimePanelCommits(
  events: BimJobRealtimeEvent[],
  flushMs = BIM_JOB_REALTIME_FLUSH_MS,
): BimJobRealtimePanelCommit[] {
  const eventsByJobId = new Map<string, BimJobRealtimeEvent[]>();

  events.forEach((event) => {
    const jobId = event.job.id;
    if (!jobId) return;
    const current = eventsByJobId.get(jobId) || [];
    current.push(event);
    eventsByJobId.set(jobId, current);
  });

  return Array.from(eventsByJobId.entries())
    .flatMap(([jobId, jobEvents]) => (
      planBimJobRealtimeCommits(jobEvents, flushMs).map((commit) => ({
        ...commit,
        jobId,
      }))
    ))
    .sort((left, right) => {
      const timeDelta = left.elapsedMs - right.elapsedMs;
      if (timeDelta !== 0) return timeDelta;
      return left.jobId.localeCompare(right.jobId);
    });
}

export function summarizeBimJobRealtimePanelLoad(
  events: BimJobRealtimeEvent[],
  flushMs = BIM_JOB_REALTIME_FLUSH_MS,
): BimJobRealtimePanelLoadSummary {
  const windowMs = clampInteger(flushMs, 16, 1000, BIM_JOB_REALTIME_FLUSH_MS);
  const orderedEvents = events
    .filter((event) => Number.isFinite(event.elapsedMs))
    .sort((left, right) => left.elapsedMs - right.elapsedMs);
  const commits = planBimJobRealtimePanelCommits(orderedEvents, windowMs);
  const jobEvents = new Map<string, BimJobRealtimeEvent[]>();

  orderedEvents.forEach((event) => {
    const jobId = event.job.id;
    if (!jobId) return;
    const current = jobEvents.get(jobId) || [];
    current.push(event);
    jobEvents.set(jobId, current);
  });

  const commitBudget = Array.from(jobEvents.values()).reduce((sum, entries) => {
    const first = entries[0]?.elapsedMs ?? 0;
    const last = entries[entries.length - 1]?.elapsedMs ?? first;
    const duration = Math.max(0, last - first);
    return sum + Math.ceil((duration + 1) / windowMs) + 2;
  }, 0);
  const firstEventAt = orderedEvents[0]?.elapsedMs ?? 0;
  const lastEventAt = orderedEvents[orderedEvents.length - 1]?.elapsedMs ?? firstEventAt;
  const commitsBySecond = new Map<number, number>();

  commits.forEach((commit) => {
    const second = Math.floor(Math.max(0, commit.elapsedMs) / 1000);
    commitsBySecond.set(second, (commitsBySecond.get(second) || 0) + 1);
  });

  const eventCount = orderedEvents.length;
  const commitCount = commits.length;
  const eventReductionRatio = commitCount > 0 ? eventCount / commitCount : eventCount;
  const renderReductionPercent = eventCount > 0
    ? ((eventCount - commitCount) / eventCount) * 100
    : 0;

  return {
    eventCount,
    commitCount,
    jobCount: jobEvents.size,
    terminalCommitCount: commits.filter((commit) => commit.reason === "terminal").length,
    durationMs: Math.max(0, lastEventAt - firstEventAt),
    flushMs: windowMs,
    commitBudget,
    maxCommitsPerSecond: Math.max(0, ...commitsBySecond.values()),
    eventReductionRatio,
    renderReductionPercent,
    withinCommitBudget: commitCount <= commitBudget,
  };
}

export function getBimJobTargetModeLabel(targetMode: BimJobTargetMode) {
  return targetMode === "cloud-model" ? "Backend BIM" : "Revit activo";
}

function normalizeBimReadinessCheck(input: unknown, index: number): BimReadinessCheck {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<BimReadinessCheck> & Record<string, unknown>
    : {};

  return {
    id: normalizeText(source.id, `check-${index + 1}`),
    label: normalizeText(source.label, `Chequeo ${index + 1}`),
    status: normalizeBimReadinessCheckTone(source.status),
    optional: normalizeBoolean(source.optional),
    missing: normalizeTextArray(source.missing),
    details: normalizeObject(source.details)
  };
}

function normalizeBimBridgePresenceSummary(input: unknown) {
  const source = normalizeObject(input);
  return {
    online: normalizeBoolean(source.online),
    onlineCount: normalizeInteger(source.onlineCount),
    knownCount: normalizeInteger(source.knownCount),
    ttlSeconds: normalizeIntegerWithFallback(source.ttlSeconds, 180),
    latestSeenAt: normalizeText(source.latestSeenAt, ""),
    latestSeenAgeSeconds: normalizeInteger(source.latestSeenAgeSeconds),
    latestBridgeId: normalizeText(source.latestBridgeId, ""),
    latestRequestedBy: normalizeText(source.latestRequestedBy, ""),
    latestModelIdentity: normalizeObject(source.latestModelIdentity),
    latestDiagnostic: normalizeBimBridgeDiagnostic(source.latestDiagnostic),
  };
}

function normalizeBimBridgeDiagnostic(input: unknown) {
  const source = normalizeObject(input);
  if (Object.keys(source).length === 0) {
    return null;
  }

  return {
    status: normalizeText(source.status, ""),
    canClaim: normalizeBoolean(source.canClaim),
    autoClaimEnabled: normalizeBoolean(source.autoClaimEnabled),
    signedIn: normalizeBoolean(source.signedIn),
    runnerBusy: normalizeBoolean(source.runnerBusy),
    hasIngestApiKey: normalizeBoolean(source.hasIngestApiKey),
    pollSeconds: normalizeIntegerWithFallback(source.pollSeconds, 15),
    issues: normalizeTextArray(source.issues)
  };
}

function isActiveRevitReadinessCheck(check: BimReadinessCheck) {
  const id = check.id.trim().toLowerCase();
  if (id.includes("cloud") || id.includes("aps")) return false;
  return [
    "active-revit-bridge-api-key",
    "bim-sse",
    "bim-stale-sweep",
    "local-probes",
    "bim-fluency-gate",
    "api-smoke",
    "bridge-smoke",
    "active-revit-e2e-smoke",
    "revit-bridge-local-settings",
    "backend-health",
    "revit-local-session-runtime",
    "active-revit-bridge-presence-runtime",
    "active-revit-bridge-claim-runtime",
    "active-revit-queue-runtime",
  ].includes(id);
}

function getActiveRevitReadinessMissing(report: BimReadinessReport) {
  const activeChecks = report.checks.filter(isActiveRevitReadinessCheck);
  const missing = uniqueTextArray(activeChecks.flatMap((check) => (
    check.status === "ok" ? [] : check.missing
  )));
  if (missing.length === 0 && !report.activeRevitBridgeReady) {
    return ["REVIT_INGEST_API_KEY"];
  }
  return missing;
}

function normalizeBimReadinessCheckTone(value: unknown): BimReadinessTone {
  const status = String(value || "").trim().toLowerCase();
  if (status === "ok" || status === "ready") return "ok";
  if (status === "critical" || status === "missing-config" || status === "missing") return "critical";
  return "warning";
}

function createReadinessCheckFallback(id: string, label: string, ready: boolean): BimReadinessCheck {
  return {
    id,
    label,
    status: ready ? "ok" : "warning",
    optional: false,
    missing: [],
    details: {}
  };
}

function uniqueReadinessChecks(checks: BimReadinessCheck[]) {
  const seen = new Set<string>();
  return checks.filter((check) => {
    if (seen.has(check.id)) {
      return false;
    }
    seen.add(check.id);
    return true;
  });
}

function normalizeText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? uniqueTextArray(value)
    : [];
}

function uniqueTextArray(value: unknown[]) {
  return Array.from(new Set(
    value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
  ));
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeBooleanWithFallback(value: unknown, fallback: boolean) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function normalizePercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function normalizeInteger(value: unknown) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function normalizeIntegerWithFallback(value: unknown, fallback: unknown) {
  const normalized = normalizeInteger(value);
  return normalized > 0 ? normalized : normalizeInteger(fallback);
}

function getRealtimeStatusPriority(status: BimJobStatus) {
  if (status === "running" || status === "applying") return 0;
  if (status === "claimed") return 1;
  if (status === "queued") return 2;
  return 3;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
