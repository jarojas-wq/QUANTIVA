import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type MouseEvent
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type {
  AccessUser,
  ApuCategory,
  ApuItem,
  AuditEntry,
  BimJobQueueSummary,
  BimJobRecord,
  AuditFilterKey,
  BudgetProject,
  BudgetRow,
  BudgetSettings,
  BudgetSnapshot,
  BudgetState,
  MetradoItem,
  PolynomialGroup,
  ProjectAccessOption,
  ResourceCatalogItem,
  ThemeMode,
  UnitCatalogItem,
  ViewKey
} from "../../domain/models";
import {
  BIM_JOB_REALTIME_FLUSH_MS,
  type BimReadinessReport,
  type BimReadinessTone,
  canCreateBimApplyJob,
  canRetryBimJob,
  getActiveRevitReadinessLabel,
  getActiveRevitReadinessMissingSummary,
  getBimJobCreateModelIdentityIssue,
  getBimJobBridgeWaitDiagnostic,
  getBimJobFluencyMetrics,
  getBimJobStatusLabel,
  getBimJobTargetModeLabel,
  getBimReadinessLabel,
  getBimReadinessPhaseSummary,
  getBimReadinessTone,
  hasBimApplyJobForPreview,
  isBimJobFinished,
  normalizeBimJobRecord,
  resolveActiveRevitJobModelIdentity,
  selectActiveRevitReadinessVisibleChecks,
  selectBimJobsForRealtime,
  upsertBimJobRecord
} from "../../application/budget/bim-jobs-domain";
import { useAuth } from "../auth/auth-context";
import {
  APU_CATEGORY_OPTIONS,
  AUDIT_FILTER_CONFIGS,
  DEFAULT_OPERATOR_NAME,
  DEFAULT_USER_PROJECT_VIEW_KEYS,
  EXPORT_MODE_CONFIGS,
  REMOTE_SAVE_DEBOUNCE_MS,
  ROUTE_BY_VIEW,
  THEME_MODES,
  TREE_INDENT_STEP,
  USER_PROJECT_VIEW_OPTIONS,
  USER_ROLE_OPTIONS,
  VIEW_BY_ROUTE,
  VIEW_CONFIGS,
  type ExportColumnSchema,
  type ViewColumn
} from "../../application/budget/budget-config";
import {
  applyApuTotalToRow,
  applyResourceToApuItem,
  buildBimControlReport,
  buildApuReportRows,
  buildBudgetComparison,
  buildBudgetSummaryReportRows,
  buildExportRowsForMode,
  buildMetradoReportRows,
  buildPartidaCodes,
  buildPolynomialBreakdown,
  buildResourceReportRows,
  buildSnapshotSummary,
  buildUserViewAccessByProject,
  canSessionWriteProject,
  canSessionAccessView,
  cloneRows,
  collectStructureAuditEntries,
  createBudgetSnapshot,
  createDefaultProject,
  createApuItem,
  createBudgetSettings,
  createMetradoItem,
  createPolynomialGroup,
  createResourceCatalogItem,
  createUnitCatalogItem,
  createFieldAuditEntry,
  createRow,
  findDuplicateForField,
  filterResourceCatalogItems,
  formatAmount,
  formatUnitCatalogLabel,
  formatDateTime,
  formatShortDate,
  formatSignedAmount,
  formatSignedInteger,
  formatSignedPercent,
  formatApuItemCantidad,
  getBudgetTimelineVersions,
  getBudgetTotals,
  getBudgetVersionLabel,
  getDeltaPercent,
  getDeltaToneClass,
  getApuCategorySubtotal,
  getApuItemPartial,
  getApuTotal,
  getMetradoTotal,
  getUnitCatalogCodes,
  getDisplayValueForField,
  getDuplicateFieldMessage,
  getFirstAllowedViewKey,
  getGrandTotalForRows,
  getGrupoTablasForRow,
  getMissingBimReadyLabels,
  getParentIndex,
  getProjectMembers,
  getRootExportLabel,
  getRowPartialAtIndexForRows,
  getSessionRole,
  getSessionAssignedProjects,
  getSnapshotsSortedNewestFirst,
  getUserProjectViewKeys,
  getVisibleEntries,
  hasApuItems,
  insertAtArray,
  isAuditableField,
  isApuItemCantidadCalculated,
  isHeadingRow,
  isLeafOnlyField,
  isRevitMetradoType,
  moveBranch,
  normalizeAuditEntries,
  normalizeProjectRecord,
  normalizeApuItems,
  normalizeBudgetSettings,
  normalizeMetradoItems,
  normalizePolynomialGroups,
  normalizeResourceCatalogItems,
  normalizeUnitCatalogItems,
  normalizeRows,
  normalizeSnapshots,
  parseDecimal,
  pruneCollapsedIds,
  rowHasChildren,
  sanitizeCodificacion,
  sanitizeDescripcion,
  sanitizeFieldValue,
  sanitizeFilename,
  sanitizeOperatorName,
  sanitizeProjectName,
  sanitizeUnitCode,
  sanitizeUnitDescription,
  sanitizeSnapshotName,
  sanitizeSnapshotType,
  restoreAccessUserSnapshot,
  shiftBranch,
  upsertAccessUser
} from "../../application/budget/budget-domain";
import { buildXlsxWorkbook, buildXlsxWorkbookFromSheets, downloadBlobFile } from "../../application/budget/excel-export";
import { applyBimJob, cancelBimJob, createBimJob, getBimJobEventsUrl, loadBimJobQueueSummary, loadBimJobs, loadBimReadiness, retryBimJob } from "../../infrastructure/budget/bim-jobs-repository";
import { loadBudgetState, saveBudgetState } from "../../infrastructure/budget/state-repository";
import { loadAccessUsers, saveAccessUser } from "../../infrastructure/budget/users-repository";

type SaveStatus = "idle" | "loading" | "dirty" | "saving" | "saved" | "error";

interface UsersPanelState {
  users: AccessUser[];
  projects: ProjectAccessOption[];
  selectedProjectId: string;
  loading: boolean;
  saving: boolean;
  error: string;
  info: string;
  search: string;
}

interface BimJobsPanelState {
  jobs: BimJobRecord[];
  summary: BimJobQueueSummary;
  loading: boolean;
  creating: boolean;
  error: string;
}

interface BimReadinessPanelState {
  report: BimReadinessReport | null;
  loading: boolean;
  error: string;
}

const emptyUsersState: UsersPanelState = {
  users: [],
  projects: [],
  selectedProjectId: "",
  loading: false,
  saving: false,
  error: "",
  info: "",
  search: ""
};

const emptyBimJobsState: BimJobsPanelState = {
  jobs: [],
  summary: createEmptyBimJobQueueSummary(),
  loading: false,
  creating: false,
  error: ""
};

const emptyBimReadinessState: BimReadinessPanelState = {
  report: null,
  loading: false,
  error: ""
};

const NEW_UNIT_SELECT_VALUE = "__new_unit__";

const APU_REPORT_COLUMNS: ExportColumnSchema[] = [
  { key: "codigoPartida", header: "CODIGO DE PARTIDA", width: 18, type: "text" },
  { key: "codificacion", header: "CODIFICACION", width: 22, type: "text" },
  { key: "partida", header: "PARTIDA", width: 46, type: "text" },
  { key: "categoria", header: "CATEGORIA", width: 18, type: "text" },
  { key: "recurso", header: "RECURSO", width: 42, type: "text" },
  { key: "cuadrilla", header: "CUADRILLA", width: 14, type: "number" },
  { key: "unidad", header: "UNIDAD", width: 14, type: "text" },
  { key: "cantidad", header: "CANTIDAD", width: 14, type: "number" },
  { key: "precioUnitario", header: "PRECIO UNITARIO", width: 18, type: "number" },
  { key: "parcial", header: "PARCIAL", width: 16, type: "number" },
  { key: "rendimientoMo", header: "RENDIMIENTO MO", width: 18, type: "number" },
  { key: "rendimientoEq", header: "RENDIMIENTO EQ", width: 18, type: "number" }
];

const RESOURCE_REPORT_COLUMNS: ExportColumnSchema[] = [
  { key: "categoria", header: "CATEGORIA", width: 18, type: "text" },
  { key: "recurso", header: "RECURSO", width: 44, type: "text" },
  { key: "unidad", header: "UNIDAD", width: 14, type: "text" },
  { key: "precioUnitario", header: "PRECIO UNITARIO", width: 18, type: "number" },
  { key: "grupoPolinomico", header: "GRUPO POLINOMICO", width: 22, type: "text" },
  { key: "indice", header: "INDICE", width: 24, type: "text" },
  { key: "costoUsado", header: "COSTO USADO", width: 18, type: "number" }
];

const METRADO_REPORT_COLUMNS: ExportColumnSchema[] = [
  { key: "codigoPartida", header: "CODIGO DE PARTIDA", width: 18, type: "text" },
  { key: "codificacion", header: "CODIFICACION", width: 22, type: "text" },
  { key: "partida", header: "PARTIDA", width: 44, type: "text" },
  { key: "descripcion", header: "DESCRIPCION METRADO", width: 44, type: "text" },
  { key: "veces", header: "VECES", width: 12, type: "number" },
  { key: "largo", header: "LARGO", width: 12, type: "number" },
  { key: "ancho", header: "ANCHO", width: 12, type: "number" },
  { key: "alto", header: "ALTO", width: 12, type: "number" },
  { key: "parcial", header: "PARCIAL", width: 16, type: "number" }
];

const BUDGET_SUMMARY_REPORT_COLUMNS: ExportColumnSchema[] = [
  { key: "concepto", header: "CONCEPTO", width: 26, type: "text" },
  { key: "porcentaje", header: "PORCENTAJE", width: 16, type: "number" },
  { key: "importe", header: "IMPORTE", width: 18, type: "number" }
];

const POLYNOMIAL_REPORT_COLUMNS: ExportColumnSchema[] = [
  { key: "codigo", header: "CODIGO", width: 14, type: "text" },
  { key: "descripcion", header: "GRUPO", width: 34, type: "text" },
  { key: "indice", header: "INDICE", width: 24, type: "text" },
  { key: "costo", header: "COSTO", width: 18, type: "number" },
  { key: "incidenciaPercent", header: "INCIDENCIA %", width: 16, type: "number" }
];

export function QuantivaWorkspace() {
  const { session, logout, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedView = VIEW_BY_ROUTE[location.pathname] || "itemizado";
  const [budgetState, setBudgetState] = useState<BudgetState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [auditFilter, setAuditFilter] = useState<AuditFilterKey>("all");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedApuIds, setExpandedApuIds] = useState<Set<string>>(new Set());
  const [expandedMetradoIds, setExpandedMetradoIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialThemeMode());
  const [accountOpen, setAccountOpen] = useState(false);
  const [usersPanel, setUsersPanel] = useState<UsersPanelState>(emptyUsersState);
  const [bimJobsPanel, setBimJobsPanel] = useState<BimJobsPanelState>(emptyBimJobsState);
  const [bimReadinessPanel, setBimReadinessPanel] = useState<BimReadinessPanelState>(emptyBimReadinessState);
  const [snapshotCompareBaseId, setSnapshotCompareBaseId] = useState<string>("");
  const [snapshotCompareTargetId, setSnapshotCompareTargetId] = useState<string>("current");
  const [accessProjectId, setAccessProjectId] = useState("");
  const stateRef = useRef<BudgetState | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const bootstrappedRef = useRef(false);
  const editStartValuesRef = useRef<Record<string, string>>({});
  const userSaveSequenceByEmailRef = useRef<Record<string, number>>({});

  const operatorName = sanitizeOperatorName(session?.userName || session?.userEmail || DEFAULT_OPERATOR_NAME);

  const applyLoadedBudgetState = useCallback((payload: BudgetState, preferredProjectId = "") => {
    const selectedProject = payload.projects.find((project) => project.id === preferredProjectId)
      || payload.projects.find((project) => project.id === payload.currentProjectId)
      || payload.projects[0];
    const nextState = {
      ...payload,
      currentProjectId: selectedProject?.id || payload.currentProjectId || null
    };
    setBudgetState(nextState);
    stateRef.current = nextState;
    setLoadError("");
    setSelectedId(selectedProject?.rows[0]?.id || null);
    setCollapsedIds(new Set(selectedProject?.collapsedIds || []));
    setExpandedApuIds(new Set());
    setExpandedMetradoIds(new Set());
    setUsersPanel((current) => ({
      ...current,
      selectedProjectId: selectedProject?.id || ""
    }));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;
    setSaveStatus("loading");
    void loadBudgetState()
      .then((payload) => {
        if (cancelled) return;
        applyLoadedBudgetState(payload);
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        bootstrappedRef.current = true;
      })
      .catch((reason: Error) => {
        if (cancelled) return;
        setLoadError(reason.message);
        if (session?.required) {
          setBudgetState(null);
          stateRef.current = null;
          setSelectedId(null);
          setSaveStatus("error");
          void refreshSession();
          return;
        }
        const fallbackProject = createDefaultProject();
        const fallbackState: BudgetState = {
          currentProjectId: fallbackProject.id,
          projects: [fallbackProject],
          storage: "mysql",
          storageLabel: "MySQL"
        };
        setBudgetState(fallbackState);
        stateRef.current = fallbackState;
      setSelectedId(fallbackProject.rows[0]?.id || null);
      setExpandedMetradoIds(new Set());
      setSaveStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyLoadedBudgetState, refreshSession, session?.required]);

  useEffect(() => {
    if (!budgetState) return;
    const currentProject = getCurrentProjectFromState(budgetState);
    if (!canSessionAccessView(session, currentProject?.id || null, requestedView)) {
      const firstAllowed = getFirstAllowedViewKey(session, currentProject?.id || null);
      navigate(ROUTE_BY_VIEW[firstAllowed], { replace: true });
    }
  }, [budgetState, navigate, requestedView, session]);

  useEffect(() => {
    const onDocumentClick = () => setAccountOpen(false);
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, []);

  const currentProject = useMemo(() => (
    budgetState ? getCurrentProjectFromState(budgetState) : null
  ), [budgetState]);
  const rows = currentProject?.rows || [];
  const unitCatalogItems = currentProject?.unitCatalogItems || [];
  const resourceCatalogItems = currentProject?.resourceCatalogItems || [];
  const viewConfig = VIEW_CONFIGS[requestedView] || VIEW_CONFIGS.itemizado;
  const canWriteWorkspace = canSessionWriteProject(session);
  const allowsStructureEditing = viewConfig.allowsStructureEditing && canWriteWorkspace;
  const viewColumns = useMemo(() => (
    canWriteWorkspace
      ? viewConfig.columns
      : viewConfig.columns.map((column) => column.editable ? { ...column, editable: false } : column)
  ), [canWriteWorkspace, viewConfig.columns]);
  const effectiveCollapsedIds = useMemo(() => pruneCollapsedIds(rows, collapsedIds), [collapsedIds, rows]);
  const codes = useMemo(() => buildPartidaCodes(rows), [rows]);
  const visibleEntries = useMemo(() => {
    const query = viewConfig.contentType === "table" || viewConfig.contentType === "audit"
      ? filterQuery
      : "";
    return getVisibleEntries(rows, codes, query, {
      respectCollapsed: viewConfig.allowsStructureEditing || Boolean(viewConfig.supportsApuExpansion),
      collapsedIds: effectiveCollapsedIds
    });
  }, [codes, effectiveCollapsedIds, filterQuery, rows, viewConfig.allowsStructureEditing, viewConfig.contentType, viewConfig.supportsApuExpansion]);
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : null;
  const activeBimJob = bimJobsPanel.jobs.find((job) => !isBimJobFinished(job.status)) || bimJobsPanel.jobs[0] || null;
  const realtimeBimJobIdsKey = useMemo(() => (
    selectBimJobsForRealtime(bimJobsPanel.jobs)
      .map((job) => job.id)
      .join("|")
  ), [bimJobsPanel.jobs]);

  const refreshBimJobs = useCallback(() => {
    if (!currentProject?.id) {
      setBimJobsPanel(emptyBimJobsState);
      return;
    }
    setBimJobsPanel((current) => ({ ...current, loading: true, error: "" }));
    void Promise.all([
      loadBimJobs(currentProject.id),
      loadBimJobQueueSummary(currentProject.id)
    ])
      .then(([jobs, summary]) => {
        setBimJobsPanel((current) => ({ ...current, jobs, summary, loading: false, error: "" }));
      })
      .catch((reason: Error) => {
        setBimJobsPanel((current) => ({ ...current, loading: false, error: reason.message }));
      });
  }, [currentProject?.id]);

  const refreshBimReadiness = useCallback(() => {
    setBimReadinessPanel((current) => ({ ...current, loading: true, error: "" }));
    void loadBimReadiness()
      .then((report) => {
        setBimReadinessPanel({ report, loading: false, error: "" });
      })
      .catch((reason: Error) => {
        setBimReadinessPanel((current) => ({ ...current, loading: false, error: reason.message }));
      });
  }, []);

  useEffect(() => {
    refreshBimJobs();
  }, [refreshBimJobs]);

  useEffect(() => {
    if (requestedView !== "control-bim") return;
    refreshBimReadiness();
  }, [refreshBimReadiness, requestedView]);

  useEffect(() => {
    if (requestedView !== "control-bim" || !currentProject?.id) return;
    const interval = window.setInterval(refreshBimJobs, 10000);
    return () => window.clearInterval(interval);
  }, [currentProject?.id, refreshBimJobs, requestedView]);

  useEffect(() => {
    const realtimeJobIds = realtimeBimJobIdsKey.split("|").filter(Boolean);
    if (realtimeJobIds.length === 0) return;

    const sources: EventSource[] = [];
    const flushTimers = new Map<string, number>();
    const pendingJobs = new Map<string, BimJobRecord>();
    const flushPendingJob = (jobId: string) => {
      const timer = flushTimers.get(jobId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        flushTimers.delete(jobId);
      }
      const nextJob = pendingJobs.get(jobId);
      pendingJobs.delete(jobId);
      if (!nextJob) return;
      setBimJobsPanel((current) => ({
        ...current,
        jobs: upsertBimJobRecord(current.jobs, nextJob)
      }));
    };

    realtimeJobIds.forEach((jobId) => {
      const source = new EventSource(getBimJobEventsUrl(jobId));
      sources.push(source);
      source.addEventListener("job", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { job?: BimJobRecord };
        if (!payload.job) return;
        const nextJob = normalizeBimJobRecord(payload.job);
        pendingJobs.set(jobId, nextJob);
        if (isBimJobFinished(nextJob.status)) {
          flushPendingJob(jobId);
          return;
        }
        if (!flushTimers.has(jobId)) {
          flushTimers.set(jobId, window.setTimeout(() => flushPendingJob(jobId), BIM_JOB_REALTIME_FLUSH_MS));
        }
      });
      source.addEventListener("ping", () => undefined);
      source.addEventListener("error", (event) => {
        const data = (event as MessageEvent).data;
        if (!data) {
          return;
        }
        try {
          const payload = JSON.parse(data) as { error?: string };
          if (payload.error) {
            setBimJobsPanel((current) => ({ ...current, error: payload.error || current.error }));
          }
        } catch {
          setBimJobsPanel((current) => ({ ...current, error: "Se perdio la transmision del job BIM." }));
        }
        source.close();
      });
    });

    return () => {
      sources.forEach((source) => source.close());
      flushTimers.forEach((timer) => window.clearTimeout(timer));
      flushTimers.clear();
      pendingJobs.clear();
    };
  }, [realtimeBimJobIdsKey]);

  const handleCreateActiveRevitJob = useCallback(() => {
    if (!currentProject?.id) return;
    const targetMode = "active-revit";
    const commandType = "active-revit-preview";
    const modelIdentity = resolveActiveRevitJobModelIdentity({
      projectName: currentProject.name,
      latestRevitExport: currentProject.latestRevitExport,
      bridgePresence: bimJobsPanel.summary.bridgePresence,
    });
    const identityIssue = getBimJobCreateModelIdentityIssue(targetMode, commandType, modelIdentity);
    if (identityIssue) {
      setBimJobsPanel((current) => ({ ...current, creating: false, error: identityIssue }));
      return;
    }
    setBimJobsPanel((current) => ({ ...current, creating: true, error: "" }));
    void createBimJob({
      projectId: currentProject.id,
      targetMode,
      commandType,
      payload: {
        batchSize: 250,
        mode: "analyze-before-apply",
        source: "control-bim"
      },
      modelIdentity
    })
      .then((job) => {
        setBimJobsPanel((current) => ({
          ...current,
          creating: false,
          jobs: upsertBimJobRecord(current.jobs, job)
        }));
        void refreshBimJobs();
      })
      .catch((reason: Error) => {
        setBimJobsPanel((current) => ({ ...current, creating: false, error: reason.message }));
      });
  }, [bimJobsPanel.summary.bridgePresence, currentProject?.id, currentProject?.latestRevitExport, currentProject?.name, refreshBimJobs]);

  const handleCancelBimJob = useCallback((jobId: string) => {
    setBimJobsPanel((current) => ({ ...current, error: "" }));
    void cancelBimJob(jobId)
      .then((job) => {
        setBimJobsPanel((current) => ({
          ...current,
          jobs: upsertBimJobRecord(current.jobs, job)
        }));
        void refreshBimJobs();
      })
      .catch((reason: Error) => {
        setBimJobsPanel((current) => ({ ...current, error: reason.message }));
      });
  }, [refreshBimJobs]);

  const handleRetryBimJob = useCallback((jobId: string) => {
    setBimJobsPanel((current) => ({ ...current, creating: true, error: "" }));
    void retryBimJob(jobId)
      .then((job) => {
        setBimJobsPanel((current) => ({
          ...current,
          creating: false,
          jobs: upsertBimJobRecord(current.jobs, job)
        }));
        void refreshBimJobs();
      })
      .catch((reason: Error) => {
        setBimJobsPanel((current) => ({ ...current, creating: false, error: reason.message }));
      });
  }, [refreshBimJobs]);

  const handleApplyBimJob = useCallback((jobId: string) => {
    if (!window.confirm("Se creara un job de aplicacion en Revit desde este preview completado. Revit lo tomara por lotes y seguira reportando progreso. Deseas continuar?")) {
      return;
    }
    setBimJobsPanel((current) => ({ ...current, creating: true, error: "" }));
    void applyBimJob(jobId)
      .then((job) => {
        setBimJobsPanel((current) => ({
          ...current,
          creating: false,
          jobs: upsertBimJobRecord(current.jobs, job)
        }));
        void refreshBimJobs();
      })
      .catch((reason: Error) => {
        setBimJobsPanel((current) => ({ ...current, creating: false, error: reason.message }));
      });
  }, [refreshBimJobs]);

  useEffect(() => {
    setExpandedApuIds((current) => {
      const leafIds = new Set(rows.filter((_, index) => !rowHasChildren(rows, index)).map((row) => row.id));
      const nextIds = Array.from(current).filter((rowId) => leafIds.has(rowId));
      return nextIds.length === current.size ? current : new Set(nextIds);
    });
    setExpandedMetradoIds((current) => {
      const leafIds = new Set(rows.filter((_, index) => !rowHasChildren(rows, index)).map((row) => row.id));
      const nextIds = Array.from(current).filter((rowId) => leafIds.has(rowId));
      return nextIds.length === current.size ? current : new Set(nextIds);
    });
  }, [rows]);

  useEffect(() => {
    if (rows.length === 0) return;
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  const queueSave = useCallback((nextState: BudgetState) => {
    stateRef.current = nextState;
    if (!bootstrappedRef.current) return;
    if (!canWriteWorkspace) {
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("dirty");
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      const payload = stateRef.current;
      if (!payload) return;
      setSaveStatus("saving");
      void saveBudgetState(payload)
        .then((result) => {
          setSaveStatus("saved");
          setLoadError("");
          setLastSavedAt(result.savedAt ? new Date(result.savedAt) : new Date());
          if (result.storage || result.storageLabel) {
            setBudgetState((current) => current
              ? { ...current, storage: result.storage, storageLabel: result.storageLabel }
              : current);
          }
        })
        .catch((reason: Error) => {
          setSaveStatus("error");
          setLoadError(reason.message);
          if (reason.message.toLowerCase().includes("sesion")) {
            void refreshSession();
          }
        });
    }, REMOTE_SAVE_DEBOUNCE_MS);
  }, [canWriteWorkspace, refreshSession]);

  const updateBudget = useCallback((updater: (current: BudgetState) => BudgetState, markSaved = true) => {
    setBudgetState((current) => {
      if (!current) return current;
      const next = updater(current);
      stateRef.current = next;
      if (markSaved) {
        queueSave(next);
      }
      return next;
    });
  }, [queueSave]);

  const updateCurrentProject = useCallback((projectUpdater: (project: BudgetProject) => BudgetProject, markSaved = true) => {
    updateBudget((current) => {
      const currentProjectId = current.currentProjectId || current.projects[0]?.id || null;
      const projects = current.projects.map((project) => (
        project.id === currentProjectId
          ? normalizeProjectRecord(projectUpdater(project))
          : project
      ));
      return { ...current, projects };
    }, markSaved);
  }, [updateBudget]);

  const persistCollapsedIds = useCallback((nextCollapsedIds: Set<string>) => {
    setCollapsedIds(nextCollapsedIds);
    updateCurrentProject((project) => ({
      ...project,
      collapsedIds: Array.from(nextCollapsedIds),
      updatedAt: new Date().toISOString()
    }));
  }, [updateCurrentProject]);

  const commitRows = useCallback((nextRowsInput: BudgetRow[], nextSelectedId: string | null, focusField = "") => {
    const previousRows = cloneRows(rows);
    const nextRows = normalizeRows(nextRowsInput);
    const structureEntries = collectStructureAuditEntries(previousRows, nextRows, operatorName);
    updateCurrentProject((project) => ({
      ...project,
      rows: nextRows,
      auditEntries: normalizeAuditEntries([...project.auditEntries, ...structureEntries]),
      collapsedIds: Array.from(pruneCollapsedIds(nextRows, effectiveCollapsedIds)),
      updatedAt: new Date().toISOString()
    }));
    setCollapsedIds(pruneCollapsedIds(nextRows, effectiveCollapsedIds));
    setSelectedId(nextSelectedId);
    if (focusField) {
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-row-id="${nextSelectedId}"] [name="${focusField}"]`
        )?.focus();
      }, 0);
    }
  }, [effectiveCollapsedIds, operatorName, rows, updateCurrentProject]);

  const handleToolbarAction = useCallback((action: string) => {
    if (!allowsStructureEditing) return;
    switch (action) {
      case "add-root": {
        const nextRows = [...rows, createRow({ level: 0 })];
        const newRow = nextRows[nextRows.length - 1];
        commitRows(nextRows, newRow.id, "codificacion");
        return;
      }
      case "add-below": {
        if (selectedIndex === -1) return;
        const insertAt = getBranchEndLocal(rows, selectedIndex) + 1;
        const source = rows[selectedIndex];
        const newRow = createRow({ level: source.level });
        commitRows(insertAtArray(rows, insertAt, newRow), newRow.id, "codificacion");
        return;
      }
      case "add-child": {
        if (selectedIndex === -1) return;
        const insertAt = getBranchEndLocal(rows, selectedIndex) + 1;
        const parent = rows[selectedIndex];
        const newRow = createRow({ level: parent.level + 1 });
        commitRows(insertAtArray(rows, insertAt, newRow), newRow.id, "codificacion");
        return;
      }
      case "move-up": {
        if (selectedIndex === -1) return;
        const nextRows = moveBranch(rows, selectedIndex, -1);
        if (nextRows) commitRows(nextRows, rows[selectedIndex].id);
        return;
      }
      case "move-down": {
        if (selectedIndex === -1) return;
        const nextRows = moveBranch(rows, selectedIndex, 1);
        if (nextRows) commitRows(nextRows, rows[selectedIndex].id);
        return;
      }
      case "indent": {
        if (selectedIndex <= 0) return;
        const nextRows = shiftBranch(rows, selectedIndex, 1);
        if (nextRows) commitRows(nextRows, rows[selectedIndex].id);
        return;
      }
      case "outdent": {
        if (selectedIndex === -1) return;
        const nextRows = shiftBranch(rows, selectedIndex, -1);
        if (nextRows) commitRows(nextRows, rows[selectedIndex].id);
        return;
      }
      case "delete": {
        if (selectedIndex === -1) return;
        const branchEnd = getBranchEndLocal(rows, selectedIndex);
        const remaining = rows.filter((_, index) => index < selectedIndex || index > branchEnd);
        const nextRows = remaining.length > 0 ? remaining : [createRow()];
        const replacement = nextRows[Math.min(selectedIndex, nextRows.length - 1)];
        commitRows(nextRows, replacement.id);
      }
    }
  }, [allowsStructureEditing, commitRows, rows, selectedIndex]);

  const handleFieldFocus = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>, rowId: string) => {
    const field = event.currentTarget.name;
    if (!isAuditableField(field)) return;
    const key = `${rowId}:${field}`;
    if (key in editStartValuesRef.current) return;
    const row = rows.find((entry) => entry.id === rowId);
    editStartValuesRef.current[key] = row ? String((row as unknown as Record<string, unknown>)[field] ?? "") : "";
  };

  const updateRowField = (rowId: string, fieldName: string, value: string, auditNow = false) => {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1) return;
    const row = rows[rowIndex];
    const editable = isFieldEditable(viewColumns, rows, rowIndex, fieldName);
    if (!editable) return;
    if (isLeafOnlyField(fieldName) && rowHasChildren(rows, rowIndex)) return;

    const liveValue = fieldName === "codificacion"
      ? sanitizeCodificacion(value)
      : fieldName === "descripcion"
        ? sanitizeDescripcion(value)
        : value;
    const nextRows = rows.map((entry) => (
      entry.id === rowId ? { ...entry, [fieldName]: liveValue } : entry
    ));
    updateCurrentProject((project) => ({
      ...project,
      rows: cloneRows(nextRows),
      updatedAt: new Date().toISOString()
    }));
    if (auditNow) {
      finalizeRowField(rowId, fieldName, liveValue);
    }
  };

  const finalizeRowField = (rowId: string, fieldName: string, currentValue?: string) => {
    if (!isAuditableField(fieldName)) return;
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1) return;
    const row = rows[rowIndex];
    if (!isFieldEditable(viewColumns, rows, rowIndex, fieldName)) return;

    const key = `${rowId}:${fieldName}`;
    const beforeValue = editStartValuesRef.current[key] ?? String((row as unknown as Record<string, unknown>)[fieldName] ?? "");
    const rawValue = currentValue ?? String((row as unknown as Record<string, unknown>)[fieldName] ?? "");
    const nextValue = sanitizeFieldValue(fieldName, rawValue);
    const duplicate = findDuplicateForField(rows, fieldName, nextValue, rowId);

    if (duplicate) {
      window.alert(getDuplicateFieldMessage(fieldName, duplicate.code));
      const revertedRows = rows.map((entry) => (
        entry.id === rowId ? { ...entry, [fieldName]: beforeValue } : entry
      ));
      updateCurrentProject((project) => ({
        ...project,
        rows: cloneRows(revertedRows),
        updatedAt: new Date().toISOString()
      }));
      delete editStartValuesRef.current[key];
      return;
    }

    let patchedRow: BudgetRow = { ...row, [fieldName]: nextValue };
    if (fieldName === "tipoMetrado") {
      patchedRow = {
        ...patchedRow,
        reglaMetrado: isRevitMetradoType(nextValue) ? "Encofrado" : ""
      };
    }
    if (fieldName === "reglaMetrado" && !isRevitMetradoType(patchedRow.tipoMetrado)) {
      patchedRow.reglaMetrado = "";
    }

    const afterValue = String((patchedRow as unknown as Record<string, unknown>)[fieldName] ?? "");
    const auditEntries = afterValue !== beforeValue
      ? [createFieldAuditEntry(rowId, fieldName, beforeValue, afterValue, operatorName)]
      : [];
    const nextRows = rows.map((entry) => entry.id === rowId ? patchedRow : entry);
    updateCurrentProject((project) => ({
      ...project,
      rows: cloneRows(nextRows),
      auditEntries: normalizeAuditEntries([...project.auditEntries, ...auditEntries]),
      updatedAt: new Date().toISOString()
    }));
    delete editStartValuesRef.current[key];
  };

  const updateApuItemsForRow = useCallback((rowId: string, updater: (items: ApuItem[]) => ApuItem[]) => {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1 || rowHasChildren(rows, rowIndex)) return;
    const nextRows = rows.map((entry) => {
      if (entry.id !== rowId) return entry;
      const nextApuItems = normalizeApuItems(updater(entry.apuItems || []));
      return applyApuTotalToRow({
        ...entry,
        apuItems: nextApuItems
      });
    });
    updateCurrentProject((project) => ({
      ...project,
      rows: cloneRows(nextRows),
      updatedAt: new Date().toISOString()
    }));
  }, [rows, updateCurrentProject]);

  const toggleApuExpansion = useCallback((rowId: string) => {
    setExpandedApuIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const addApuItem = useCallback((rowId: string, category: ApuCategory) => {
    updateApuItemsForRow(rowId, (items) => [
      ...items,
      createApuItem({ category })
    ]);
    setExpandedApuIds((current) => {
      const next = new Set(current);
      next.add(rowId);
      return next;
    });
  }, [updateApuItemsForRow]);

  const updateApuItem = useCallback((rowId: string, itemId: string, fieldName: keyof ApuItem, value: string) => {
    updateApuItemsForRow(rowId, (items) => items.map((item) => (
      item.id === itemId
        ? {
          ...item,
          [fieldName]: value,
          resourceId: fieldName === "cantidad" || fieldName === "cuadrilla" || fieldName === "resourceId" ? item.resourceId : "",
          subpartidaId: fieldName === "subpartidaId"
            ? value
            : fieldName === "cantidad" || fieldName === "cuadrilla"
              ? item.subpartidaId
              : ""
        }
        : item
    )));
  }, [updateApuItemsForRow]);

  const selectApuResource = useCallback((rowId: string, itemId: string, resourceId: string) => {
    const resource = resourceCatalogItems.find((item) => item.id === resourceId);
    if (!resource) return;
    updateApuItemsForRow(rowId, (items) => items.map((item) => (
      item.id === itemId ? applyResourceToApuItem(item, resource) : item
    )));
  }, [resourceCatalogItems, updateApuItemsForRow]);

  const removeApuItem = useCallback((rowId: string, itemId: string) => {
    updateApuItemsForRow(rowId, (items) => items.filter((item) => item.id !== itemId));
  }, [updateApuItemsForRow]);

  const updateMetradoItemsForRow = useCallback((rowId: string, updater: (items: MetradoItem[]) => MetradoItem[]) => {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1 || rowHasChildren(rows, rowIndex)) return;
    const nextRows = rows.map((entry) => {
      if (entry.id !== rowId) return entry;
      return {
        ...entry,
        metradoItems: normalizeMetradoItems(updater(entry.metradoItems || []))
      };
    });
    updateCurrentProject((project) => ({
      ...project,
      rows: cloneRows(nextRows),
      updatedAt: new Date().toISOString()
    }));
  }, [rows, updateCurrentProject]);

  const toggleMetradoExpansion = useCallback((rowId: string) => {
    setExpandedMetradoIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const addMetradoItem = useCallback((rowId: string) => {
    updateMetradoItemsForRow(rowId, (items) => [
      ...items,
      createMetradoItem({ veces: "1" })
    ]);
    setExpandedMetradoIds((current) => {
      const next = new Set(current);
      next.add(rowId);
      return next;
    });
  }, [updateMetradoItemsForRow]);

  const updateMetradoItem = useCallback((rowId: string, itemId: string, fieldName: keyof MetradoItem, value: string) => {
    updateMetradoItemsForRow(rowId, (items) => items.map((item) => (
      item.id === itemId ? { ...item, [fieldName]: value } : item
    )));
  }, [updateMetradoItemsForRow]);

  const removeMetradoItem = useCallback((rowId: string, itemId: string) => {
    updateMetradoItemsForRow(rowId, (items) => items.filter((item) => item.id !== itemId));
  }, [updateMetradoItemsForRow]);

  const updateBudgetSettings = useCallback((settings: BudgetSettings) => {
    updateCurrentProject((project) => ({
      ...project,
      budgetSettings: normalizeBudgetSettings(settings),
      updatedAt: new Date().toISOString()
    }));
  }, [updateCurrentProject]);

  const addPolynomialGroup = useCallback(() => {
    updateCurrentProject((project) => {
      const groups = normalizePolynomialGroups(project.polynomialGroups);
      const nextOrder = groups.reduce((max, group) => Math.max(max, group.orden), 0) + 1;
      return {
        ...project,
        polynomialGroups: normalizePolynomialGroups([
          ...groups,
          createPolynomialGroup({ codigo: `G${nextOrder}`, descripcion: `Grupo ${nextOrder}`, orden: nextOrder })
        ]),
        updatedAt: new Date().toISOString()
      };
    });
  }, [updateCurrentProject]);

  const updatePolynomialGroup = useCallback((groupId: string, fieldName: keyof PolynomialGroup, value: string) => {
    updateCurrentProject((project) => ({
      ...project,
      polynomialGroups: normalizePolynomialGroups(project.polynomialGroups).map((group) => (
        group.id === groupId
          ? normalizePolynomialGroups([{ ...group, [fieldName]: value }])[0]
          : group
      )),
      updatedAt: new Date().toISOString()
    }));
  }, [updateCurrentProject]);

  const removePolynomialGroup = useCallback((groupId: string) => {
    updateCurrentProject((project) => ({
      ...project,
      polynomialGroups: normalizePolynomialGroups(project.polynomialGroups).filter((group) => group.id !== groupId),
      resourceCatalogItems: normalizeResourceCatalogItems(project.resourceCatalogItems).map((resource) => (
        resource.polynomialGroupId === groupId ? { ...resource, polynomialGroupId: "" } : resource
      )),
      updatedAt: new Date().toISOString()
    }));
  }, [updateCurrentProject]);

  const addResourceCatalogItem = useCallback((category: ApuCategory) => {
    updateCurrentProject((project) => {
      const currentItems = normalizeResourceCatalogItems(project.resourceCatalogItems);
      const categoryItems = currentItems.filter((item) => item.category === category);
      const nextOrder = categoryItems.reduce((max, item) => Math.max(max, item.orden), 0) + 1;
      return {
        ...project,
        resourceCatalogItems: normalizeResourceCatalogItems([
          ...currentItems,
          createResourceCatalogItem({ category, orden: nextOrder })
        ]),
        updatedAt: new Date().toISOString()
      };
    });
  }, [updateCurrentProject]);

  const updateResourceCatalogItem = useCallback((resourceId: string, fieldName: keyof ResourceCatalogItem, value: string) => {
    updateCurrentProject((project) => {
      const nextItems = normalizeResourceCatalogItems(project.resourceCatalogItems).map((item) => (
        item.id === resourceId
          ? normalizeResourceCatalogItems([{ ...item, [fieldName]: value }])[0]
          : item
      ));
      return {
        ...project,
        resourceCatalogItems: normalizeResourceCatalogItems(nextItems),
        updatedAt: new Date().toISOString()
      };
    });
  }, [updateCurrentProject]);

  const removeResourceCatalogItem = useCallback((resourceId: string) => {
    updateCurrentProject((project) => ({
      ...project,
      resourceCatalogItems: normalizeResourceCatalogItems(project.resourceCatalogItems)
        .filter((item) => item.id !== resourceId),
      updatedAt: new Date().toISOString()
    }));
  }, [updateCurrentProject]);

  const createUnitFromPrompt = useCallback(() => {
    const codigo = sanitizeUnitCode(window.prompt("Abreviatura de la unidad. Ejemplo: h", "") || "");
    if (!codigo) {
      window.alert("Ingresa una abreviatura valida para la unidad.");
      return "";
    }
    const descripcion = sanitizeUnitDescription(window.prompt(`Que significa "${codigo}"?`, "") || "");
    if (!descripcion) {
      window.alert("Para crear una unidad debes indicar que significa.");
      return "";
    }
    const currentItems = normalizeUnitCatalogItems(currentProject?.unitCatalogItems);
    if (currentItems.some((item) => item.codigo.trim().toLowerCase() === codigo.toLowerCase())) {
      window.alert(`La unidad "${codigo}" ya existe.`);
      return "";
    }
    const nextOrder = currentItems.reduce((max, item) => Math.max(max, item.orden), 0) + 1;
    const unit = createUnitCatalogItem({ codigo, descripcion, orden: nextOrder });
    updateCurrentProject((project) => {
      return {
        ...project,
        unitCatalogItems: normalizeUnitCatalogItems([
          ...project.unitCatalogItems,
          unit
        ]),
        updatedAt: new Date().toISOString()
      };
    });
    return unit.codigo;
  }, [currentProject?.unitCatalogItems, updateCurrentProject]);

  const switchProject = (projectId: string) => {
    if (!budgetState || projectId === budgetState.currentProjectId) return;
    const nextProject = budgetState.projects.find((project) => project.id === projectId);
    if (!nextProject) return;
    setSelectedId(nextProject.rows[0]?.id || null);
    setCollapsedIds(new Set(nextProject.collapsedIds || []));
    setExpandedApuIds(new Set());
    setExpandedMetradoIds(new Set());
    setFilterQuery("");
    setUsersPanel((current) => ({ ...current, selectedProjectId: projectId }));
    updateBudget((current) => ({
      ...current,
      currentProjectId: projectId
    }));
  };

  const createProject = () => {
    if (getSessionRole(session) !== "superadmin") {
      window.alert("Solo superadmin puede crear proyectos.");
      return;
    }
    const input = window.prompt("Nombre del nuevo proyecto", getNextProjectName(budgetState?.projects || []));
    if (input === null) return;
    const name = ensureUniqueProjectName(input, budgetState?.projects || []);
    if (!name) {
      window.alert("Ingresa un nombre valido para el proyecto.");
      return;
    }
    const project = createDefaultProject(name);
    setSelectedId(project.rows[0]?.id || null);
    setCollapsedIds(new Set());
    setExpandedApuIds(new Set());
    setExpandedMetradoIds(new Set());
    setAccessProjectId(project.id);
    setUsersPanel((current) => ({
      ...current,
      selectedProjectId: project.id,
      projects: [
        ...current.projects.filter((entry) => entry.id !== project.id),
        { id: project.id, name: project.name }
      ]
    }));
    updateBudget((current) => ({
      ...current,
      currentProjectId: project.id,
      projects: [...current.projects, project]
    }));
  };

  const renameProject = () => {
    if (!currentProject || !budgetState) return;
    const input = window.prompt("Nuevo nombre del proyecto", currentProject.name);
    if (input === null) return;
    const name = ensureUniqueProjectName(input, budgetState.projects, currentProject.id);
    if (!name) {
      window.alert("Ingresa un nombre valido para el proyecto.");
      return;
    }
    updateCurrentProject((project) => ({ ...project, name, updatedAt: new Date().toISOString() }));
  };

  const deleteProject = () => {
    if (!budgetState || !currentProject) return;
    if (budgetState.projects.length <= 1) {
      window.alert("Debe existir al menos un proyecto.");
      return;
    }
    if (!window.confirm(`Se eliminara el proyecto "${currentProject.name}". Esta accion no se puede deshacer.`)) {
      return;
    }
    const currentIndex = budgetState.projects.findIndex((project) => project.id === currentProject.id);
    const nextProjects = budgetState.projects.filter((project) => project.id !== currentProject.id);
    const nextProject = nextProjects[Math.min(currentIndex, nextProjects.length - 1)] || nextProjects[0];
    setSelectedId(nextProject.rows[0]?.id || null);
    setCollapsedIds(new Set(nextProject.collapsedIds || []));
    setExpandedApuIds(new Set());
    setExpandedMetradoIds(new Set());
    updateBudget(() => ({
      ...budgetState,
      currentProjectId: nextProject.id,
      projects: nextProjects
    }));
  };

  const createSnapshot = (snapshotType: BudgetSnapshot["snapshotType"] = "manual") => {
    if (!canWriteWorkspace || !currentProject) return;
    const normalizedType = sanitizeSnapshotType(snapshotType);
    const typeLabel = getSnapshotTypeLabel(normalizedType);
    const suggestedName = `${typeLabel} ${new Date().toLocaleDateString("es-PE")}`;
    const input = window.prompt(`Nombre de la version ${typeLabel.toLowerCase()}`, suggestedName);
    if (input === null) return;
    const snapshot = createBudgetSnapshot(
      rows,
      currentProject.snapshots,
      sanitizeSnapshotName(input) || suggestedName,
      operatorName,
      normalizedType
    );
    updateCurrentProject((project) => ({
      ...project,
      snapshots: normalizeSnapshots([snapshot, ...project.snapshots]),
      updatedAt: new Date().toISOString()
    }));
    setSnapshotCompareBaseId(snapshot.id);
    setSnapshotCompareTargetId("current");
  };

  const manualSync = async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    try {
      if (!canWriteWorkspace) {
        const payload = await loadBudgetState();
        applyLoadedBudgetState(payload, currentProject?.id || "");
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        return;
      }
      const payload = stateRef.current;
      if (!payload) {
        setSaveStatus("saved");
        return;
      }
      const result = await saveBudgetState(payload);
      setSaveStatus("saved");
      setLoadError("");
      setLastSavedAt(result.savedAt ? new Date(result.savedAt) : new Date());
    } catch (reason) {
      setSaveStatus("error");
      setLoadError(reason instanceof Error ? reason.message : "No se pudo sincronizar.");
    }
  };

  const loadUsers = useCallback(async (forceProjectId = "") => {
    setUsersPanel((current) => ({ ...current, loading: true, error: "", info: "" }));
    try {
      const payload = await loadAccessUsers();
      const selectedProjectId = forceProjectId
        || usersPanel.selectedProjectId
        || currentProject?.id
        || payload.projects[0]?.id
        || "";
      setUsersPanel((current) => ({
        ...current,
        users: payload.users || [],
        projects: payload.projects || [],
        selectedProjectId,
        loading: false
      }));
    } catch (reason) {
      setUsersPanel((current) => ({
        ...current,
        loading: false,
        error: reason instanceof Error ? reason.message : "No se pudo cargar usuarios."
      }));
    }
  }, [currentProject?.id, usersPanel.selectedProjectId]);

  useEffect(() => {
    if (requestedView === "usuarios" && getSessionRole(session) === "superadmin") {
      void loadUsers();
    }
  }, [loadUsers, requestedView, session]);

  if (!budgetState) {
    return <div className="page-state">{loadError || "Cargando Quantiva..."}</div>;
  }

  if (!VIEW_BY_ROUTE[location.pathname]) {
    return <Navigate to="/itemizado" replace />;
  }

  const metrics = buildMetrics(rows, visibleEntries, selectedRow, selectedIndex, codes, viewConfig.contentType, filterQuery);
  const storageModeLabel = budgetState.storageLabel || "MySQL";
  const isUsersWorkspace = viewConfig.contentType === "users";
  const assignedProjects = getSessionAssignedProjects(budgetState.projects, session);
  const topbarSelectedProject = isUsersWorkspace
    ? assignedProjects.find((project) => project.id === accessProjectId) || null
    : currentProject;
  const appLayoutClass = `app-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`;

  return (
    <div className="quantiva-app">
      <div className={appLayoutClass} id="app-layout">
        <Sidebar
          activeView={requestedView}
          currentProject={currentProject}
          isCollapsed={sidebarCollapsed}
          saveStatusLabel={getSaveStatusLabel(saveStatus, lastSavedAt, storageModeLabel)}
          session={session}
          shortcutText={viewConfig.shortcutText}
          onNavigate={(view) => navigate(ROUTE_BY_VIEW[view])}
          onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
        />

        <section className="workspace">
          <header className="topbar">
            <TopbarProjectSwitcher
              canCreateProject={getSessionRole(session) === "superadmin"}
              currentProject={topbarSelectedProject}
              projects={assignedProjects}
              placeholder="Seleccionar proyecto"
              totalProjectCount={budgetState.projects.length}
              onCreateProject={createProject}
              onSwitchProject={(projectId) => {
                if (isUsersWorkspace) {
                  setAccessProjectId(projectId);
                  setUsersPanel((current) => ({ ...current, selectedProjectId: projectId }));
                  return;
                }
                switchProject(projectId);
              }}
            />

            {viewConfig.searchEnabled && (
              <div id="search-wrap" className="search-wrap">
                <input
                  id="table-search-input"
                  type="text"
                  value={filterQuery}
                  placeholder={viewConfig.contentType === "resources"
                    ? "Buscar recurso, unidad o precio"
                    : "Buscar por codigo, codificacion o descripcion"}
                  onChange={(event) => setFilterQuery(event.target.value.trimStart())}
                />
              </div>
            )}

            <div className="topbar-actions">
              {requestedView === "presupuesto" && canWriteWorkspace && (
                <button id="save-snapshot-button" type="button" className="topbar-button" onClick={() => createSnapshot()}>
                  Guardar foto
                </button>
              )}
              {requestedView === "presupuesto" && canWriteWorkspace && (
                <>
                  <button type="button" className="topbar-button" onClick={() => createSnapshot("linea-base")}>Linea base</button>
                  <button type="button" className="topbar-button" onClick={() => createSnapshot("meta")}>Meta</button>
                  <button type="button" className="topbar-button" onClick={() => createSnapshot("venta")}>Venta</button>
                </>
              )}
              <button
                id="sync-now-button"
                type="button"
                className="topbar-button sync-now-button"
                aria-label="Sincronizar"
                title="Sincronizar"
                onClick={() => void manualSync()}
              >
                <svg className="sync-now-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M21 2v6h-6"></path>
                  <path d="M3 22v-6h6"></path>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8"></path>
                  <path d="M3.51 15A9 9 0 0 0 18.36 18.36L21 16"></path>
                </svg>
                <span className="sr-only">Sincronizar</span>
              </button>
              <button
                id="theme-toggle-button"
                type="button"
                className="topbar-button theme-toggle-button"
                aria-label={themeMode === THEME_MODES.DARK ? "Volver al modo claro" : "Activar modo oscuro"}
                title={themeMode === THEME_MODES.DARK ? "Volver al modo claro" : "Activar modo oscuro"}
                aria-pressed={themeMode === THEME_MODES.DARK}
                onClick={() => setThemeMode((current) => current === THEME_MODES.DARK ? THEME_MODES.LIGHT : THEME_MODES.DARK)}
              >
                <span className="theme-toggle-icon theme-toggle-icon--moon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"></path>
                  </svg>
                </span>
                <span className="theme-toggle-icon theme-toggle-icon--sun" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="4"></circle>
                    <path d="M12 2v2"></path>
                    <path d="M12 20v2"></path>
                    <path d="M4.93 4.93l1.41 1.41"></path>
                    <path d="M17.66 17.66l1.41 1.41"></path>
                    <path d="M2 12h2"></path>
                    <path d="M20 12h2"></path>
                    <path d="M4.93 19.07l1.41-1.41"></path>
                    <path d="M17.66 6.34l1.41-1.41"></path>
                  </svg>
                </span>
              </button>
              <AccountMenu
                open={accountOpen}
                session={session}
                onLogout={() => void logout().then(() => navigate("/login", { replace: true }))}
                onToggle={(event) => {
                  event.stopPropagation();
                  setAccountOpen((current) => !current);
                }}
              />
            </div>
          </header>

          <main className="workspace-main">
            {!isUsersWorkspace && (
              <section className="workspace-head">
                <div className="workspace-title">
                  <p className="view-label">Proyecto activo</p>
                  <h1 id="project-title">{currentProject?.name || "Proyecto"}</h1>
                </div>
                <div className="workspace-pills">
                  <MetricPill label="Partidas" value={metrics.rowCount} />
                  <MetricPill label="Raices" value={metrics.rootCount} />
                  <MetricPill label="Niveles" value={metrics.maxDepth} />
                  <MetricPill label="Total" value={metrics.grandTotal} />
                  {metrics.selectionVisible && (
                    <span className="head-pill head-pill--selection">
                      <span className="head-pill-label">Seleccion</span>
                      <strong id="selected-code">{metrics.selectedLabel}</strong>
                    </span>
                  )}
                </div>
              </section>
            )}

            {allowsStructureEditing && (
              <section id="controls-panel" className="panel panel--controls">
                <div className="toolbar-row">
                  <Toolbar
                    rows={rows}
                    selectedIndex={selectedIndex}
                    onAction={handleToolbarAction}
                  />
                  <div className="controls-meta">
                    <span className="table-meta-pill"><strong id="visible-count">{metrics.visibleRows}</strong> visibles</span>
                    <span className="table-meta-pill"><strong id="visible-count-inline">{metrics.visibleRows}</strong> en tabla</span>
                    <span className="table-meta-pill" id="filter-status">{metrics.filterStatus}</span>
                  </div>
                </div>
                <p id="helper-text" className="helper-text">{viewConfig.helperText}</p>
              </section>
            )}

            {loadError && (
              <div className="inline-message danger">{loadError}</div>
            )}

            <section className="panel panel--table">
              <div className="table-panel-head table-panel-head--compact">
                <div>
                  <h2 id="matrix-title">{viewConfig.matrixTitle}</h2>
                </div>
              </div>

              {viewConfig.contentType === "table" || viewConfig.contentType === "audit" ? (
                <>
                  {requestedView === "presupuesto" && currentProject && (
                    <BudgetSummaryPanel
                      canEdit={canWriteWorkspace}
                      settings={currentProject.budgetSettings}
                      totals={getBudgetTotals(rows, currentProject.budgetSettings)}
                      onChange={updateBudgetSettings}
                    />
                  )}
                  <BudgetTable
                    collapsedIds={effectiveCollapsedIds}
                    codes={codes}
                    canEditApu={canWriteWorkspace}
                    expandedApuIds={expandedApuIds}
                    expandedMetradoIds={expandedMetradoIds}
                    resourceCatalogItems={resourceCatalogItems}
                    rows={rows}
                    selectedId={selectedId}
                    supportsApuExpansion={Boolean(viewConfig.supportsApuExpansion)}
                    supportsMetradoExpansion={Boolean(viewConfig.supportsMetradoExpansion)}
                    unitCatalogItems={unitCatalogItems}
                    viewColumns={viewColumns}
                    visibleEntries={visibleEntries}
                    allowsStructureEditing={allowsStructureEditing}
                    onAddApuItem={addApuItem}
                    onAddMetradoItem={addMetradoItem}
                    onFieldBlur={(rowId, fieldName) => finalizeRowField(rowId, fieldName)}
                    onFieldChange={updateRowField}
                    onFieldFocus={handleFieldFocus}
                    onRemoveMetradoItem={removeMetradoItem}
                    onRemoveApuItem={removeApuItem}
                    onSelectRow={setSelectedId}
                    onSelectApuResource={selectApuResource}
                    onCreateUnit={createUnitFromPrompt}
                    onToggleApu={toggleApuExpansion}
                    onToggleMetrado={toggleMetradoExpansion}
                    onToggleCollapse={(rowId) => {
                      const next = new Set(effectiveCollapsedIds);
                      if (next.has(rowId)) next.delete(rowId);
                      else next.add(rowId);
                      persistCollapsedIds(next);
                    }}
                    onUpdateApuItem={updateApuItem}
                    onUpdateMetradoItem={updateMetradoItem}
                  />
                  {viewConfig.contentType === "audit" && (
                    <AuditPanel
                      auditEntries={currentProject?.auditEntries || []}
                      auditFilter={auditFilter}
                      codes={codes}
                      selectedIndex={selectedIndex}
                      selectedRow={selectedRow}
                      onFilter={setAuditFilter}
                    />
                  )}
                  {requestedView === "presupuesto" && currentProject && (
                    <SnapshotPanel
                      baseId={snapshotCompareBaseId}
                      project={currentProject}
                      rows={rows}
                      targetId={snapshotCompareTargetId}
                      operatorName={operatorName}
                      onDelete={(snapshotId) => {
                        updateCurrentProject((project) => ({
                          ...project,
                          snapshots: project.snapshots.filter((snapshot) => snapshot.id !== snapshotId),
                          updatedAt: new Date().toISOString()
                        }));
                      }}
                      onDownload={(snapshot) => downloadSnapshotJson(currentProject, snapshot)}
                      onSetBase={setSnapshotCompareBaseId}
                      onSetTarget={setSnapshotCompareTargetId}
                    />
                  )}
                </>
              ) : null}

              {viewConfig.contentType === "resources" && currentProject && (
                <ResourceCatalogPanel
                  canEdit={canWriteWorkspace}
                  filterQuery={filterQuery}
                  items={resourceCatalogItems}
                  polynomialGroups={currentProject.polynomialGroups}
                  unitCatalogItems={unitCatalogItems}
                  onAddItem={addResourceCatalogItem}
                  onCreateUnit={createUnitFromPrompt}
                  onRemoveItem={removeResourceCatalogItem}
                  onUpdateItem={updateResourceCatalogItem}
                />
              )}

              {viewConfig.contentType === "polynomial" && currentProject && (
                <PolynomialPanel
                  canEdit={canWriteWorkspace}
                  currentProject={currentProject}
                  onAddGroup={addPolynomialGroup}
                  onRemoveGroup={removePolynomialGroup}
                  onUpdateGroup={updatePolynomialGroup}
                />
              )}

              {viewConfig.contentType === "export" && currentProject && (
                <ExportPanel
                  codes={codes}
                  currentProject={currentProject}
                  exportMode={viewConfig.exportMode || "rvt"}
                />
              )}

              {viewConfig.contentType === "bim-control" && currentProject && (
                <BimControlPanel
                  currentProject={currentProject}
                  rows={rows}
                  codes={codes}
                  jobsState={bimJobsPanel}
                  readinessState={bimReadinessPanel}
                  canCreateJob={canWriteWorkspace}
                  onCancelJob={handleCancelBimJob}
                  onCreateJob={handleCreateActiveRevitJob}
                  onApplyJob={handleApplyBimJob}
                  onRefreshJobs={refreshBimJobs}
                  onRefreshReadiness={refreshBimReadiness}
                  onRetryJob={handleRetryBimJob}
                  onOpenRvtExport={() => navigate(ROUTE_BY_VIEW["exportaciones-rvt"])}
                  onSelectRow={(rowId) => {
                    setSelectedId(rowId);
                    navigate(ROUTE_BY_VIEW.itemizado);
                  }}
                />
              )}

              {viewConfig.contentType === "users" && (
                <UsersPanel
                  state={usersPanel}
                  activeProjectId={accessProjectId}
                  currentProjectId={currentProject?.id || ""}
                  budgetProjects={budgetState.projects}
                  canCreateProject={getSessionRole(session) === "superadmin"}
                  onChangeSelectedProject={(projectId) => {
                    setAccessProjectId(projectId);
                    setUsersPanel((current) => ({ ...current, selectedProjectId: projectId }));
                  }}
                  onCreateProject={createProject}
                  onRefresh={() => void loadUsers()}
                  onSaveUser={async (payload) => {
                    const saveEmail = String(payload.email || "").trim().toLowerCase();
                    const saveSequence = (userSaveSequenceByEmailRef.current[saveEmail] || 0) + 1;
                    userSaveSequenceByEmailRef.current[saveEmail] = saveSequence;
                    const previousUser = usersPanel.users.find((user) => user.email.trim().toLowerCase() === saveEmail) || null;
                    const isLatestUserSave = () => userSaveSequenceByEmailRef.current[saveEmail] === saveSequence;
                    setUsersPanel((current) => ({
                      ...current,
                      users: upsertAccessUser(current.users, payload),
                      saving: true,
                      error: "",
                      info: ""
                    }));
                    try {
                      const result = await saveAccessUser(payload);
                      if (!isLatestUserSave()) return;
                      setUsersPanel((current) => ({
                        ...current,
                        users: upsertAccessUser(current.users, result.user || payload),
                        saving: false,
                        info: "Usuario actualizado."
                      }));
                    } catch (reason) {
                      if (!isLatestUserSave()) return;
                      setUsersPanel((current) => ({
                        ...current,
                        users: restoreAccessUserSnapshot(current.users, saveEmail, previousUser),
                        saving: false,
                        error: reason instanceof Error ? reason.message : "No se pudo guardar usuario."
                      }));
                    }
                  }}
                  onSearch={(search) => setUsersPanel((current) => ({ ...current, search }))}
                />
              )}
            </section>
          </main>
        </section>
      </div>
    </div>
  );
}

function Sidebar(props: {
  activeView: ViewKey;
  currentProject: BudgetProject | null;
  isCollapsed: boolean;
  saveStatusLabel: string;
  session: ReturnType<typeof useAuth>["session"];
  shortcutText: string;
  onNavigate: (view: ViewKey) => void;
  onToggleSidebar: () => void;
}) {
  const productViews = getSidebarProductViews(props.activeView);

  return (
    <aside className="sidebar" aria-label="Panel lateral">
      <div className="sidebar-header">
        <SidebarProductSwitcher
          activeView={props.activeView}
          isCollapsed={props.isCollapsed}
          session={props.session}
          onNavigate={props.onNavigate}
        />
        <button
          id="sidebar-toggle-button"
          className="icon-button sidebar-panel-toggle"
          type="button"
          aria-label={props.isCollapsed ? "Abrir panel lateral" : "Ocultar panel lateral"}
          title={props.isCollapsed ? "Abrir panel lateral" : "Ocultar panel lateral"}
          aria-expanded={!props.isCollapsed}
          onClick={props.onToggleSidebar}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d={props.isCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"}></path>
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Secciones">
        <div className="sidebar-nav-group-toggle" aria-hidden="true">
          <span className="sidebar-section-label">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M3 9h18"></path>
              <path d="M9 21V9"></path>
            </svg>
            <span>Modulos</span>
          </span>
        </div>
        {productViews.map((view) => {
          if (!canSessionAccessView(props.session, props.currentProject?.id || null, view.key)) {
            return null;
          }
          return (
            <button
              key={view.key}
              type="button"
              className={`nav-item${props.activeView === view.key ? " nav-item--active" : ""}`}
              aria-label={getNavLabel(view.key)}
              aria-current={props.activeView === view.key ? "page" : undefined}
              title={getNavLabel(view.key)}
              onClick={() => props.onNavigate(view.key)}
            >
              <NavIcon view={view.key} />
              <span>{getNavLabel(view.key)}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-body">
        <section className="sidebar-section">
          <p className="section-kicker">Atajo</p>
          <div className="sidebar-card sidebar-card--compact">
            <p id="sidebar-shortcut-text" className="sidebar-copy">{props.shortcutText}</p>
          </div>
        </section>
      </div>

      <div className="sidebar-footer">
        <span className="save-dot" aria-hidden="true"></span>
        <p id="save-status" className="save-status">{props.saveStatusLabel}</p>
      </div>
    </aside>
  );
}

function TopbarProjectSwitcher(props: {
  canCreateProject: boolean;
  currentProject: BudgetProject | null;
  placeholder?: string;
  projects: BudgetProject[];
  totalProjectCount: number;
  onCreateProject: () => void;
  onSwitchProject: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projects = props.projects.length > 0
    ? props.projects
    : props.currentProject
      ? [props.currentProject]
      : [];
  const visibleProjects = projects.filter((project) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${project.name} ${project.id}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const selectProject = (projectId: string) => {
    props.onSwitchProject(projectId);
    setOpen(false);
    setSearch("");
  };

  const createProject = () => {
    setOpen(false);
    setSearch("");
    props.onCreateProject();
  };

  return (
    <div className="topbar-project-switcher" ref={menuRef}>
      <button
        type="button"
        className="topbar-project-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="topbar-project-icon" aria-hidden="true"></span>
        <span className="topbar-project-copy">
          <strong>{props.currentProject?.name || props.placeholder || "Selecciona un proyecto"}</strong>
          <small>{projects.length} proyectos asignados</small>
        </span>
        <span className="topbar-project-caret" aria-hidden="true"></span>
      </button>
      {open && (
        <div className="topbar-project-menu" role="menu">
          <label className="topbar-project-search">
            <span aria-hidden="true"></span>
            <input
              type="search"
              placeholder="Buscar proyectos por nombre o numero..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="topbar-project-tabs" role="tablist" aria-label="Selector de proyectos">
            <button type="button" className="is-active" role="tab" aria-selected="true">Proyectos</button>
            <button type="button" role="tab" aria-selected="false" disabled>Plantillas</button>
          </div>
          <div className="topbar-project-count">
            <strong>{projects.length} Proyectos</strong>
            {props.canCreateProject ? (
              <button type="button" onClick={createProject}>Crear proyecto</button>
            ) : (
              <span>{props.totalProjectCount > projects.length ? "Asignados" : "Todos"}</span>
            )}
          </div>
          <div className="topbar-project-list">
            {visibleProjects.map((project) => {
              const isActive = project.id === props.currentProject?.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`topbar-project-row${isActive ? " is-active" : ""}`}
                  role="menuitem"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => selectProject(project.id)}
                >
                  <span className="topbar-project-thumb" aria-hidden="true"></span>
                  <span className="topbar-project-row-copy">
                    <strong>{project.name}</strong>
                    <small>{getProjectNumber(project.id)} - {getProjectHubLabel(project)}</small>
                  </span>
                </button>
              );
            })}
            {visibleProjects.length === 0 && (
              <div className="topbar-project-empty">
                <strong>Sin proyectos</strong>
                <span>No hay coincidencias para la busqueda actual.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetTable(props: {
  allowsStructureEditing: boolean;
  canEditApu: boolean;
  collapsedIds: Set<string>;
  codes: string[];
  expandedApuIds: Set<string>;
  expandedMetradoIds: Set<string>;
  resourceCatalogItems: ResourceCatalogItem[];
  rows: BudgetRow[];
  selectedId: string | null;
  supportsApuExpansion: boolean;
  supportsMetradoExpansion: boolean;
  unitCatalogItems: UnitCatalogItem[];
  viewColumns: ViewColumn[];
  visibleEntries: Array<{ row: BudgetRow; index: number; code: string }>;
  onAddApuItem: (rowId: string, category: ApuCategory) => void;
  onAddMetradoItem: (rowId: string) => void;
  onFieldBlur: (rowId: string, fieldName: string) => void;
  onFieldChange: (rowId: string, fieldName: string, value: string, auditNow?: boolean) => void;
  onFieldFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>, rowId: string) => void;
  onRemoveMetradoItem: (rowId: string, itemId: string) => void;
  onRemoveApuItem: (rowId: string, itemId: string) => void;
  onSelectRow: (rowId: string) => void;
  onSelectApuResource: (rowId: string, itemId: string, resourceId: string) => void;
  onCreateUnit: () => string;
  onToggleApu: (rowId: string) => void;
  onToggleMetrado: (rowId: string) => void;
  onToggleCollapse: (rowId: string) => void;
  onUpdateApuItem: (rowId: string, itemId: string, fieldName: keyof ApuItem, value: string) => void;
  onUpdateMetradoItem: (rowId: string, itemId: string, fieldName: keyof MetradoItem, value: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table id="item-table" className="item-table">
        <colgroup id="item-colgroup">
          {props.viewColumns.map((column) => (
            <col key={column.key} className={column.colClass} />
          ))}
        </colgroup>
        <thead id="item-head">
          <tr>
            {props.viewColumns.map((column) => (
              <th key={column.key} scope="col">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody id="item-body">
          {props.visibleEntries.length === 0 ? (
            <tr className="empty-state-row">
              <td colSpan={props.viewColumns.length}>
                <div className="empty-state">
                  <strong>No se encontraron partidas</strong>
                  <p>Ajusta el filtro para volver a mostrar filas de la matriz.</p>
                </div>
              </td>
            </tr>
          ) : props.visibleEntries.map(({ row, index, code }) => {
            const classes = [
              row.id === props.selectedId ? "is-selected" : "",
              isHeadingRow(props.rows, row, index) ? `is-heading-row is-heading-level-${Math.min(row.level, 4)}` : ""
            ].filter(Boolean).join(" ");
            const isLeaf = !rowHasChildren(props.rows, index);
            const isApuExpanded = props.supportsApuExpansion && isLeaf && props.expandedApuIds.has(row.id);
            const isMetradoExpanded = props.supportsMetradoExpansion && isLeaf && props.expandedMetradoIds.has(row.id);
            return (
              <Fragment key={row.id}>
                <tr
                  data-row-id={row.id}
                  className={classes}
                  title={row.codificacion.trim() || "Sin codificacion"}
                  onClick={() => props.onSelectRow(row.id)}
                >
                  {props.viewColumns.map((column) => (
                    <BudgetCell
                      key={column.key}
                      allowsStructureEditing={props.allowsStructureEditing}
                      code={code}
                      collapsedIds={props.collapsedIds}
                      column={column}
                      expandedApuIds={props.expandedApuIds}
                      expandedMetradoIds={props.expandedMetradoIds}
                      row={row}
                      rowIndex={index}
                      rows={props.rows}
                      supportsApuExpansion={props.supportsApuExpansion}
                      supportsMetradoExpansion={props.supportsMetradoExpansion}
                      unitCatalogItems={props.unitCatalogItems}
                      onFieldBlur={props.onFieldBlur}
                      onFieldChange={props.onFieldChange}
                      onFieldFocus={props.onFieldFocus}
                      onToggleApu={props.onToggleApu}
                      onToggleMetrado={props.onToggleMetrado}
                      onToggleCollapse={props.onToggleCollapse}
                    />
                  ))}
                </tr>
                {isMetradoExpanded && (
                  <MetradoDetailRow
                    canEdit={props.canEditApu}
                    code={code}
                    colSpan={props.viewColumns.length}
                    row={row}
                    onAddItem={props.onAddMetradoItem}
                    onRemoveItem={props.onRemoveMetradoItem}
                    onUpdateItem={props.onUpdateMetradoItem}
                  />
                )}
                {isApuExpanded && (
                  <ApuDetailRow
                    canEdit={props.canEditApu}
                    code={code}
                    colSpan={props.viewColumns.length}
                    resourceCatalogItems={props.resourceCatalogItems}
                    row={row}
                    rows={props.rows}
                    unitCatalogItems={props.unitCatalogItems}
                    onAddItem={props.onAddApuItem}
                    onRemoveItem={props.onRemoveApuItem}
                    onCreateUnit={props.onCreateUnit}
                    onSelectResource={props.onSelectApuResource}
                    onFieldBlur={props.onFieldBlur}
                    onFieldChange={props.onFieldChange}
                    onFieldFocus={props.onFieldFocus}
                    onUpdateItem={props.onUpdateApuItem}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BudgetCell(props: {
  allowsStructureEditing: boolean;
  code: string;
  collapsedIds: Set<string>;
  column: ViewColumn;
  expandedApuIds: Set<string>;
  expandedMetradoIds: Set<string>;
  row: BudgetRow;
  rowIndex: number;
  rows: BudgetRow[];
  supportsApuExpansion: boolean;
  supportsMetradoExpansion: boolean;
  unitCatalogItems: UnitCatalogItem[];
  onFieldBlur: (rowId: string, fieldName: string) => void;
  onFieldChange: (rowId: string, fieldName: string, value: string, auditNow?: boolean) => void;
  onFieldFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>, rowId: string) => void;
  onToggleApu: (rowId: string) => void;
  onToggleMetrado: (rowId: string) => void;
  onToggleCollapse: (rowId: string) => void;
}) {
  if (props.column.type === "partida") {
    const hasChildren = rowHasChildren(props.rows, props.rowIndex);
    const canToggleBranch = hasChildren && (props.allowsStructureEditing || props.supportsApuExpansion);
    const canToggleApu = props.supportsApuExpansion && !hasChildren;
    const canToggleMetrado = props.supportsMetradoExpansion && !hasChildren;
    const isCollapsed = hasChildren
      ? props.collapsedIds.has(props.row.id)
      : canToggleMetrado
        ? !props.expandedMetradoIds.has(props.row.id)
        : !props.expandedApuIds.has(props.row.id);
    const toggleLabel = hasChildren
      ? (isCollapsed ? "Expandir subpartidas" : "Contraer subpartidas")
      : canToggleMetrado
        ? (isCollapsed ? "Mostrar hoja de metrado" : "Ocultar hoja de metrado")
        : (isCollapsed ? "Mostrar APU" : "Ocultar APU");
    return (
      <td className="partida-cell">
        <div className="partida-chip" style={{ "--depth": props.row.level } as CSSProperties}>
          {props.allowsStructureEditing && <span className="drag-handle" aria-hidden="true"></span>}
          {canToggleBranch || canToggleApu || canToggleMetrado ? (
            <button
              type="button"
              className={`tree-toggle${isCollapsed ? " is-collapsed" : ""}`}
              aria-label={toggleLabel}
              aria-expanded={!isCollapsed}
              title={toggleLabel}
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) props.onToggleCollapse(props.row.id);
                else if (canToggleMetrado) props.onToggleMetrado(props.row.id);
                else props.onToggleApu(props.row.id);
              }}
            ></button>
          ) : (
            <span className="tree-toggle-spacer" aria-hidden="true"></span>
          )}
          <span className="partida-label">{props.code}</span>
          <span className="partida-meta">Nivel {props.row.level + 1}</span>
        </div>
      </td>
    );
  }

  if (props.column.type === "partial") {
    const partial = getRowPartialAtIndexForRows(props.rows, props.rowIndex);
    const isSubtotal = rowHasChildren(props.rows, props.rowIndex);
    return (
      <td className={`partial-cell ${partial === 0 ? "is-empty" : ""} ${isSubtotal ? "partial-cell--subtotal" : ""}`}>
        {formatAmount(partial)}
      </td>
    );
  }

  const fieldName = props.column.field || "";
  const isEditable = isFieldEditable([props.column], props.rows, props.rowIndex, fieldName);
  const displayValue = getDisplayValueForField(props.rows, props.row, props.rowIndex, fieldName);
  const classes = [
    "cell-field",
    props.column.inputClass || "",
    !isEditable ? "cell-field--readonly" : "",
    props.column.type === "select" && isEditable ? "cell-field--select" : "",
    props.column.type === "select" && !isEditable ? "cell-field--display" : ""
  ].filter(Boolean).join(" ");

  if (props.column.type === "select") {
    const options = props.column.field === "unidad"
      ? getUnitCatalogCodes(props.unitCatalogItems)
      : props.column.options || [];
    const renderedOptions = displayValue && !options.includes(displayValue)
      ? [displayValue, ...options]
      : options;
    if (!isEditable) {
      return <td><div className={classes}>{displayValue}</div></td>;
    }
    return (
      <td>
        <select
          className={classes}
          name={fieldName}
          aria-label={props.column.label}
          value={displayValue}
          onFocus={(event) => props.onFieldFocus(event, props.row.id)}
          onChange={(event) => props.onFieldChange(props.row.id, fieldName, event.target.value, true)}
        >
          <option value="">{props.column.placeholder || "Selecciona"}</option>
          {renderedOptions.map((option) => (
            <option key={option} value={option}>
              {props.column.field === "unidad" ? formatUnitCatalogLabel(option, props.unitCatalogItems) : option}
            </option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <td>
      <input
        className={classes}
        type="text"
        inputMode={props.column.inputMode}
        name={fieldName}
        value={displayValue}
        placeholder={isLeafOnlyField(fieldName) && rowHasChildren(props.rows, props.rowIndex) ? "" : props.column.placeholder || ""}
        readOnly={!isEditable}
        tabIndex={!isEditable ? -1 : undefined}
        aria-readonly={!isEditable}
        onFocus={(event) => props.onFieldFocus(event, props.row.id)}
        onChange={(event) => props.onFieldChange(props.row.id, fieldName, event.target.value)}
        onBlur={() => props.onFieldBlur(props.row.id, fieldName)}
      />
    </td>
  );
}

function BudgetSummaryPanel(props: {
  canEdit: boolean;
  settings: BudgetSettings;
  totals: ReturnType<typeof getBudgetTotals>;
  onChange: (settings: BudgetSettings) => void;
}) {
  const settings = createBudgetSettings(props.settings);
  const update = (patch: Partial<BudgetSettings>) => props.onChange(createBudgetSettings({
    ...settings,
    ...patch
  }));
  return (
    <section className="budget-summary-panel" aria-label="Pie de presupuesto">
      <div className="budget-summary-grid">
        <BudgetSummaryMetric label="Costo directo" value={formatAmount(props.totals.costoDirecto)} />
        <BudgetSummaryMetric label="Gastos generales" value={formatAmount(props.totals.gastosGenerales)} />
        <BudgetSummaryMetric label="Utilidad" value={formatAmount(props.totals.utilidad)} />
        <BudgetSummaryMetric label="Subtotal" value={formatAmount(props.totals.subtotal)} />
        <BudgetSummaryMetric label="IGV" value={formatAmount(props.totals.igv)} />
        <BudgetSummaryMetric label="Total" value={formatAmount(props.totals.total)} strong />
      </div>
      <div className="budget-settings-row">
        <label className="budget-setting-field">
          <span>GG %</span>
          <input
            className="cell-field"
            type="text"
            inputMode="decimal"
            value={settings.gastosGeneralesPercent}
            readOnly={!props.canEdit}
            placeholder="0.00"
            onChange={(event) => update({ gastosGeneralesPercent: event.target.value })}
          />
        </label>
        <label className="budget-setting-field">
          <span>Utilidad %</span>
          <input
            className="cell-field"
            type="text"
            inputMode="decimal"
            value={settings.utilidadPercent}
            readOnly={!props.canEdit}
            placeholder="0.00"
            onChange={(event) => update({ utilidadPercent: event.target.value })}
          />
        </label>
        <label className="budget-setting-field">
          <span>IGV %</span>
          <input
            className="cell-field"
            type="text"
            inputMode="decimal"
            value={settings.igvPercent}
            readOnly={!props.canEdit}
            placeholder="18.00"
            onChange={(event) => update({ igvPercent: event.target.value })}
          />
        </label>
        <label className="budget-setting-toggle">
          <input
            type="checkbox"
            checked={settings.includeIgv}
            disabled={!props.canEdit}
            onChange={(event) => update({ includeIgv: event.target.checked })}
          />
          <span>Incluir IGV</span>
        </label>
      </div>
    </section>
  );
}

function BudgetSummaryMetric(props: { label: string; value: string; strong?: boolean }) {
  return (
    <span className={`budget-summary-metric${props.strong ? " is-strong" : ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </span>
  );
}

function MetradoDetailRow(props: {
  canEdit: boolean;
  code: string;
  colSpan: number;
  row: BudgetRow;
  onAddItem: (rowId: string) => void;
  onRemoveItem: (rowId: string, itemId: string) => void;
  onUpdateItem: (rowId: string, itemId: string, fieldName: keyof MetradoItem, value: string) => void;
}) {
  const items = normalizeMetradoItems(props.row.metradoItems);
  const title = props.row.descripcion.trim() || props.row.codificacion.trim() || `Partida ${props.code}`;
  return (
    <tr className="metrado-detail-row" onClick={(event) => event.stopPropagation()}>
      <td colSpan={props.colSpan}>
        <div className="metrado-panel">
          <div className="metrado-panel-head">
            <div className="metrado-panel-title">
              <span className="apu-eyebrow">Hoja de metrado</span>
              <strong>{props.code} | {title}</strong>
            </div>
            <span className="apu-total">
              <span>Total metrado</span>
              <strong>{formatAmount(getMetradoTotal(items))}</strong>
            </span>
          </div>
          {props.canEdit && (
            <div className="apu-actions">
              <button type="button" className="apu-add-button" onClick={() => props.onAddItem(props.row.id)}>
                + Linea de metrado
              </button>
            </div>
          )}
          <div className="apu-table-wrap">
            <table className="metrado-table">
              <thead>
                <tr>
                  <th>Descripcion</th>
                  <th>Veces</th>
                  <th>Largo</th>
                  <th>Ancho</th>
                  <th>Alto</th>
                  <th>Parcial</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr className="apu-empty-row">
                    <td colSpan={7}>
                      {props.canEdit ? "Agrega una linea para calcular el metrado tradicional." : "Sin hoja de metrado registrada."}
                    </td>
                  </tr>
                ) : items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        className="cell-field apu-field apu-field--description"
                        type="text"
                        value={item.descripcion}
                        readOnly={!props.canEdit}
                        placeholder="Descripcion"
                        onChange={(event) => props.onUpdateItem(props.row.id, item.id, "descripcion", event.target.value)}
                      />
                    </td>
                    {(["veces", "largo", "ancho", "alto"] as Array<keyof MetradoItem>).map((fieldName) => (
                      <td key={fieldName}>
                        <input
                          className="cell-field apu-field"
                          type="text"
                          inputMode="decimal"
                          value={String(item[fieldName] || "")}
                          readOnly={!props.canEdit}
                          placeholder={fieldName === "veces" ? "1" : ""}
                          onChange={(event) => props.onUpdateItem(props.row.id, item.id, fieldName, event.target.value)}
                        />
                      </td>
                    ))}
                    <td className="apu-partial-cell">{formatAmount(parseDecimal(item.parcial))}</td>
                    <td>
                      {props.canEdit ? (
                        <button type="button" className="apu-remove-button" onClick={() => props.onRemoveItem(props.row.id, item.id)}>
                          Eliminar
                        </button>
                      ) : (
                        <span className="apu-readonly-mark">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ApuDetailRow(props: {
  canEdit: boolean;
  code: string;
  colSpan: number;
  resourceCatalogItems: ResourceCatalogItem[];
  row: BudgetRow;
  rows: BudgetRow[];
  unitCatalogItems: UnitCatalogItem[];
  onAddItem: (rowId: string, category: ApuCategory) => void;
  onRemoveItem: (rowId: string, itemId: string) => void;
  onCreateUnit: () => string;
  onFieldBlur: (rowId: string, fieldName: string) => void;
  onFieldChange: (rowId: string, fieldName: string, value: string, auditNow?: boolean) => void;
  onFieldFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>, rowId: string) => void;
  onSelectResource: (rowId: string, itemId: string, resourceId: string) => void;
  onUpdateItem: (rowId: string, itemId: string, fieldName: keyof ApuItem, value: string) => void;
}) {
  const items = normalizeApuItems(props.row.apuItems);
  const catalogItems = normalizeResourceCatalogItems(props.resourceCatalogItems);
  const unitOptions = getUnitCatalogCodes(props.unitCatalogItems);
  const total = getApuTotal(items, props.row);
  const subpartidaCodes = buildPartidaCodes(props.rows);
  const subpartidaOptions = props.rows
    .map((row, index) => ({ row, index, code: subpartidaCodes[index] || "" }))
    .filter((entry) => entry.row.id !== props.row.id && !rowHasChildren(props.rows, entry.index));
  const title = props.row.descripcion.trim() || props.row.codificacion.trim() || `Partida ${props.code}`;
  return (
    <tr className="apu-detail-row" onClick={(event) => event.stopPropagation()}>
      <td colSpan={props.colSpan}>
        <div className="apu-panel">
          <div className="apu-panel-head">
            <div className="apu-panel-title">
              <span className="apu-eyebrow">Analisis de costo unitario</span>
              <strong>{props.code} | {title}</strong>
            </div>
            <div className="apu-performance-fields" aria-label="Rendimientos APU">
              <label className="apu-performance-field">
                <span>Rendimiento MO</span>
                <input
                  className="cell-field apu-field apu-performance-input"
                  name="rendimientoManoObra"
                  type="text"
                  inputMode="decimal"
                  value={props.row.rendimientoManoObra}
                  readOnly={!props.canEdit}
                  placeholder="0.00"
                  onFocus={(event) => props.onFieldFocus(event, props.row.id)}
                  onChange={(event) => props.onFieldChange(props.row.id, "rendimientoManoObra", event.target.value)}
                  onBlur={() => props.onFieldBlur(props.row.id, "rendimientoManoObra")}
                />
              </label>
              <label className="apu-performance-field">
                <span>Rendimiento EQ</span>
                <input
                  className="cell-field apu-field apu-performance-input"
                  name="rendimientoEquipos"
                  type="text"
                  inputMode="decimal"
                  value={props.row.rendimientoEquipos}
                  readOnly={!props.canEdit}
                  placeholder="0.00"
                  onFocus={(event) => props.onFieldFocus(event, props.row.id)}
                  onChange={(event) => props.onFieldChange(props.row.id, "rendimientoEquipos", event.target.value)}
                  onBlur={() => props.onFieldBlur(props.row.id, "rendimientoEquipos")}
                />
              </label>
            </div>
            <span className="apu-total">
              <span>Total APU</span>
              <strong>{formatAmount(total)}</strong>
            </span>
          </div>

          {props.canEdit && (
            <div className="apu-actions" aria-label="Agregar insumos APU">
              {APU_CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  className="apu-add-button"
                  onClick={() => props.onAddItem(props.row.id, category.key)}
                >
                  + {category.label}
                </button>
              ))}
            </div>
          )}

          <div className="apu-table-wrap">
            <table className="apu-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Recurso / descripcion</th>
                  <th>Cuadrilla</th>
                  <th>Unidad</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Parcial</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr className="apu-empty-row">
                    <td colSpan={8}>
                      {props.canEdit
                        ? "Agrega un insumo para que el APU calcule el costo unitario."
                        : "Sin APU registrado para esta partida."}
                    </td>
                  </tr>
                ) : APU_CATEGORY_OPTIONS.map((category) => {
                  const categoryItems = items.filter((item) => item.category === category.key);
                  if (categoryItems.length === 0) return null;
                  return (
                    <Fragment key={category.key}>
                      <tr className="apu-category-row">
                        <td colSpan={6}>{category.label}</td>
                        <td>{formatAmount(getApuCategorySubtotal(items, category.key, props.row))}</td>
                        <td></td>
                      </tr>
                      {categoryItems.map((item) => {
                        const categoryResources = catalogItems.filter((resource) => resource.category === item.category);
                        const listId = `apu-resource-list-${props.row.id}-${item.id}`;
                        const linkedResource = item.resourceId
                          ? catalogItems.find((resource) => resource.id === item.resourceId)
                          : null;
                        const renderedUnitOptions = item.unidad && !unitOptions.includes(item.unidad)
                          ? [item.unidad, ...unitOptions]
                          : unitOptions;
                        const cantidadCalculada = isApuItemCantidadCalculated(item);
                        const cantidadValue = formatApuItemCantidad(item, props.row);
                        const cantidadTitle = cantidadCalculada
                          ? "Cantidad calculada: Cuadrilla x 8 / Rendimiento"
                          : "Cantidad manual";
                        return (
                          <tr key={item.id}>
                            <td>
                              <select
                                className="cell-field cell-field--select apu-field"
                                value={item.category}
                                disabled={!props.canEdit}
                                onChange={(event) => props.onUpdateItem(props.row.id, item.id, "category", event.target.value)}
                              >
                                {APU_CATEGORY_OPTIONS.map((option) => (
                                  <option key={option.key} value={option.key}>{option.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="cell-field apu-field apu-field--description"
                                type="text"
                                list={props.canEdit ? listId : undefined}
                                value={item.descripcion}
                                readOnly={!props.canEdit}
                                placeholder="Recurso o insumo"
                                title={linkedResource ? `Desde base: ${formatUnitCatalogLabel(linkedResource.unidad, props.unitCatalogItems)} | ${linkedResource.precioUnitario}` : "Recurso manual"}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  const selectedResource = categoryResources.find((resource) => (
                                    resource.descripcion.trim().toLowerCase() === value.trim().toLowerCase()
                                  ));
                                  if (selectedResource) {
                                    props.onSelectResource(props.row.id, item.id, selectedResource.id);
                                    return;
                                  }
                                  props.onUpdateItem(props.row.id, item.id, "descripcion", value);
                                }}
                              />
                              {props.canEdit && (
                                <datalist id={listId}>
                                  {categoryResources.map((resource) => (
                                    <option
                                      key={resource.id}
                                      value={resource.descripcion}
                                      label={`${formatUnitCatalogLabel(resource.unidad, props.unitCatalogItems) || "sin unidad"} | ${resource.precioUnitario || "0.00"}`}
                                    />
                                  ))}
                                </datalist>
                              )}
                              <select
                                className="cell-field cell-field--select apu-field apu-subpartida-select"
                                value={item.subpartidaId || ""}
                                disabled={!props.canEdit}
                                title="Subpartida"
                                onChange={(event) => props.onUpdateItem(props.row.id, item.id, "subpartidaId", event.target.value)}
                              >
                                <option value="">Sin subpartida</option>
                                {subpartidaOptions.map((entry) => (
                                  <option key={entry.row.id} value={entry.row.id}>
                                    {`${entry.code} | ${entry.row.descripcion || entry.row.codificacion || "Subpartida"}`}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="cell-field apu-field apu-field--crew"
                                type="text"
                                inputMode="decimal"
                                value={item.cuadrilla}
                                readOnly={!props.canEdit}
                                placeholder="0.00"
                                onChange={(event) => props.onUpdateItem(props.row.id, item.id, "cuadrilla", event.target.value)}
                              />
                            </td>
                            <td>
                              <select
                                className="cell-field cell-field--select apu-field"
                                value={item.unidad}
                                disabled={!props.canEdit}
                                onChange={(event) => {
                                  if (event.target.value === NEW_UNIT_SELECT_VALUE) {
                                    const newUnitCode = props.onCreateUnit();
                                    if (newUnitCode) props.onUpdateItem(props.row.id, item.id, "unidad", newUnitCode);
                                    return;
                                  }
                                  props.onUpdateItem(props.row.id, item.id, "unidad", event.target.value);
                                }}
                              >
                                <option value="">Selecciona</option>
                                {renderedUnitOptions.map((option) => (
                                  <option key={option} value={option}>{formatUnitCatalogLabel(option, props.unitCatalogItems)}</option>
                                ))}
                                {props.canEdit && <option value={NEW_UNIT_SELECT_VALUE}>+ Nueva unidad de medida</option>}
                              </select>
                            </td>
                            <td>
                              <input
                                className={`cell-field apu-field${cantidadCalculada ? " apu-field--calculated" : ""}`}
                                type="text"
                                inputMode="decimal"
                                value={cantidadValue}
                                readOnly={!props.canEdit || cantidadCalculada}
                                aria-readonly={!props.canEdit || cantidadCalculada}
                                placeholder="0.00"
                                title={cantidadTitle}
                                onChange={(event) => {
                                  if (!cantidadCalculada) props.onUpdateItem(props.row.id, item.id, "cantidad", event.target.value);
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className={`cell-field apu-field${item.subpartidaId ? " apu-field--calculated" : ""}`}
                                type="text"
                                inputMode="decimal"
                                value={item.precioUnitario}
                                readOnly={!props.canEdit || Boolean(item.subpartidaId)}
                                placeholder="0.00"
                                title={item.subpartidaId ? "Precio desde subpartida" : "Precio unitario"}
                                onChange={(event) => {
                                  if (!item.subpartidaId) props.onUpdateItem(props.row.id, item.id, "precioUnitario", event.target.value);
                                }}
                              />
                            </td>
                            <td className="apu-partial-cell">{formatAmount(getApuItemPartial(item, props.row))}</td>
                            <td>
                              {props.canEdit ? (
                                <button
                                  type="button"
                                  className="apu-remove-button"
                                  onClick={() => props.onRemoveItem(props.row.id, item.id)}
                                >
                                  Eliminar
                                </button>
                              ) : (
                                <span className="apu-readonly-mark">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ResourceCatalogPanel(props: {
  canEdit: boolean;
  filterQuery: string;
  items: ResourceCatalogItem[];
  polynomialGroups: PolynomialGroup[];
  unitCatalogItems: UnitCatalogItem[];
  onAddItem: (category: ApuCategory) => void;
  onCreateUnit: () => string;
  onRemoveItem: (resourceId: string) => void;
  onUpdateItem: (resourceId: string, fieldName: keyof ResourceCatalogItem, value: string) => void;
}) {
  const normalizedItems = normalizeResourceCatalogItems(props.items);
  const filteredItems = filterResourceCatalogItems(normalizedItems, props.filterQuery, props.unitCatalogItems);
  const polynomialGroups = normalizePolynomialGroups(props.polynomialGroups);
  const unitOptions = getUnitCatalogCodes(props.unitCatalogItems);
  return (
    <div className="resources-panel">
      <div className="resources-summary">
        {APU_CATEGORY_OPTIONS.map((category) => (
          <span key={category.key} className="resources-summary-pill">
            <span>{category.label}</span>
            <strong>{normalizedItems.filter((item) => item.category === category.key).length}</strong>
          </span>
        ))}
      </div>

      <div className="resources-sections">
        {APU_CATEGORY_OPTIONS.map((category) => {
          const categoryItems = filteredItems.filter((item) => item.category === category.key);
          return (
            <section key={category.key} className="resources-section">
              <div className="resources-section-head">
                <div>
                  <strong>{category.label}</strong>
                  <span>{categoryItems.length} recursos visibles</span>
                </div>
                {props.canEdit && (
                  <button
                    type="button"
                    className="apu-add-button"
                    onClick={() => props.onAddItem(category.key)}
                  >
                    + Agregar
                  </button>
                )}
              </div>

              <div className="resources-table-wrap">
                <table className="resources-table">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Recurso / Descripcion</th>
                      <th>Unidad</th>
                      <th>Precio unitario</th>
                      <th>Grupo polinomico</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryItems.length === 0 ? (
                      <tr className="resources-empty-row">
                        <td colSpan={6}>
                          {props.filterQuery
                            ? "Sin recursos para esta busqueda."
                            : "Agrega recursos para usarlos desde el APU."}
                        </td>
                      </tr>
                    ) : categoryItems.map((item) => {
                      const renderedUnitOptions = item.unidad && !unitOptions.includes(item.unidad)
                        ? [item.unidad, ...unitOptions]
                        : unitOptions;
                      return (
                        <tr key={item.id}>
                          <td>
                            <select
                              className="cell-field cell-field--select resource-field"
                              value={item.category}
                              disabled={!props.canEdit}
                              onChange={(event) => props.onUpdateItem(item.id, "category", event.target.value)}
                            >
                              {APU_CATEGORY_OPTIONS.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="cell-field resource-field resource-field--description"
                              type="text"
                              value={item.descripcion}
                              readOnly={!props.canEdit}
                              placeholder="Nombre del recurso"
                              onChange={(event) => props.onUpdateItem(item.id, "descripcion", event.target.value)}
                            />
                          </td>
                          <td>
                            <select
                              className="cell-field cell-field--select resource-field"
                              value={item.unidad}
                              disabled={!props.canEdit}
                              onChange={(event) => {
                                if (event.target.value === NEW_UNIT_SELECT_VALUE) {
                                  const newUnitCode = props.onCreateUnit();
                                  if (newUnitCode) props.onUpdateItem(item.id, "unidad", newUnitCode);
                                  return;
                                }
                                props.onUpdateItem(item.id, "unidad", event.target.value);
                              }}
                            >
                              <option value="">Selecciona</option>
                              {renderedUnitOptions.map((option) => (
                                <option key={option} value={option}>{formatUnitCatalogLabel(option, props.unitCatalogItems)}</option>
                              ))}
                              {props.canEdit && <option value={NEW_UNIT_SELECT_VALUE}>+ Nueva unidad de medida</option>}
                            </select>
                          </td>
                          <td>
                            <input
                              className="cell-field resource-field"
                              type="text"
                              inputMode="decimal"
                              value={item.precioUnitario}
                              readOnly={!props.canEdit}
                              placeholder="0.00"
                              onChange={(event) => props.onUpdateItem(item.id, "precioUnitario", event.target.value)}
                            />
                          </td>
                          <td>
                            <select
                              className="cell-field cell-field--select resource-field"
                              value={item.polynomialGroupId}
                              disabled={!props.canEdit}
                              onChange={(event) => props.onUpdateItem(item.id, "polynomialGroupId", event.target.value)}
                            >
                              <option value="">Sin grupo</option>
                              {polynomialGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {`${group.codigo || group.descripcion || "Grupo"}${group.indice ? ` | ${group.indice}` : ""}`}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {props.canEdit ? (
                              <button
                                type="button"
                                className="apu-remove-button"
                                onClick={() => props.onRemoveItem(item.id)}
                              >
                                Eliminar
                              </button>
                            ) : (
                              <span className="apu-readonly-mark">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PolynomialPanel(props: {
  canEdit: boolean;
  currentProject: BudgetProject;
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onUpdateGroup: (groupId: string, fieldName: keyof PolynomialGroup, value: string) => void;
}) {
  const groups = normalizePolynomialGroups(props.currentProject.polynomialGroups);
  const breakdown = buildPolynomialBreakdown(
    props.currentProject.rows,
    groups,
    props.currentProject.resourceCatalogItems
  );
  const costoDirecto = getGrandTotalForRows(props.currentProject.rows);
  return (
    <div className="polynomial-panel">
      <div className="polynomial-head">
        <div className="budget-summary-grid">
          <BudgetSummaryMetric label="Costo directo" value={formatAmount(costoDirecto)} />
          <BudgetSummaryMetric label="Grupos" value={String(groups.length)} />
          <BudgetSummaryMetric label="Incidencia asignada" value={`${formatAmount(breakdown.reduce((sum, item) => sum + item.incidenciaPercent, 0))}%`} strong />
        </div>
        {props.canEdit && (
          <button type="button" className="apu-add-button" onClick={props.onAddGroup}>
            + Grupo polinomico
          </button>
        )}
      </div>
      <div className="polynomial-grid">
        <section className="polynomial-section">
          <div className="resources-section-head">
            <div>
              <strong>Grupos e indices</strong>
              <span>{groups.length} grupos configurados</span>
            </div>
          </div>
          <div className="resources-table-wrap">
            <table className="resources-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Descripcion</th>
                  <th>Indice</th>
                  <th>Categoria</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr className="resources-empty-row">
                    <td colSpan={5}>Crea grupos para asignarlos desde Base de Recursos.</td>
                  </tr>
                ) : groups.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <input
                        className="cell-field resource-field"
                        type="text"
                        value={group.codigo}
                        readOnly={!props.canEdit}
                        placeholder="J"
                        onChange={(event) => props.onUpdateGroup(group.id, "codigo", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-field resource-field resource-field--description"
                        type="text"
                        value={group.descripcion}
                        readOnly={!props.canEdit}
                        placeholder="Cemento Portland"
                        onChange={(event) => props.onUpdateGroup(group.id, "descripcion", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-field resource-field"
                        type="text"
                        value={group.indice}
                        readOnly={!props.canEdit}
                        placeholder="Indice INEI"
                        onChange={(event) => props.onUpdateGroup(group.id, "indice", event.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="cell-field cell-field--select resource-field"
                        value={group.categoria}
                        disabled={!props.canEdit}
                        onChange={(event) => props.onUpdateGroup(group.id, "categoria", event.target.value)}
                      >
                        {APU_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {props.canEdit ? (
                        <button type="button" className="apu-remove-button" onClick={() => props.onRemoveGroup(group.id)}>
                          Eliminar
                        </button>
                      ) : (
                        <span className="apu-readonly-mark">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="polynomial-section">
          <div className="resources-section-head">
            <div>
              <strong>Incidencias</strong>
              <span>Calculadas desde APUs y metrados</span>
            </div>
          </div>
          <div className="resources-table-wrap">
            <table className="resources-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Grupo</th>
                  <th>Indice</th>
                  <th>Costo</th>
                  <th>Incidencia</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.length === 0 ? (
                  <tr className="resources-empty-row">
                    <td colSpan={5}>Aun no hay recursos APU con costo para consolidar.</td>
                  </tr>
                ) : breakdown.map((item) => (
                  <tr key={item.groupId}>
                    <td>{item.codigo}</td>
                    <td>{item.descripcion}</td>
                    <td>{item.indice}</td>
                    <td className="apu-partial-cell">{formatAmount(item.costo)}</td>
                    <td className="apu-partial-cell">{formatAmount(item.incidenciaPercent)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Toolbar(props: {
  rows: BudgetRow[];
  selectedIndex: number;
  onAction: (action: string) => void;
}) {
  const disabled = (action: string) => {
    if (props.selectedIndex === -1 && action !== "add-root") return true;
    if (props.selectedIndex === -1) return false;
    if (action === "move-up") return !moveBranch(props.rows, props.selectedIndex, -1);
    if (action === "move-down") return !moveBranch(props.rows, props.selectedIndex, 1);
    if (action === "indent") return props.selectedIndex <= 0 || !shiftBranch(props.rows, props.selectedIndex, 1);
    if (action === "outdent") return !shiftBranch(props.rows, props.selectedIndex, -1);
    return false;
  };
  const actions = [
    ["add-root", "Nueva raiz", "toolbar-button toolbar-button--primary"],
    ["add-below", "Nueva debajo", "toolbar-button"],
    ["add-child", "Nueva hija", "toolbar-button"],
    ["move-up", "Subir", "toolbar-button"],
    ["move-down", "Bajar", "toolbar-button"],
    ["indent", "Indentar", "toolbar-button"],
    ["outdent", "Desindentar", "toolbar-button"],
    ["delete", "Eliminar", "toolbar-button toolbar-button--danger"]
  ] as const;
  return (
    <div id="structure-toolbar" className="toolbar" role="toolbar" aria-label="Acciones del itemizado">
      {actions.map(([action, label, className]) => (
        <button
          key={action}
          type="button"
          className={className}
          disabled={disabled(action)}
          onClick={() => props.onAction(action)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ExportPanel(props: {
  currentProject: BudgetProject;
  codes: string[];
  exportMode: "rvt" | "presupuesto";
}) {
  const rows = props.currentProject.rows;
  const modeConfig = EXPORT_MODE_CONFIGS[props.exportMode];
  const rootEntries = rows
    .map((row, index) => ({ row, index, code: props.codes[index] }))
    .filter((entry) => entry.row.level === 0);

  if (rootEntries.length === 0) {
    return (
      <div className="empty-state">
        <strong>No hay raices para exportar</strong>
        <p>Crea al menos una partida raiz en Itemizado para generar archivos Excel externos.</p>
      </div>
    );
  }

  return (
    <div id="export-panel" className="export-panel">
      {props.exportMode === "presupuesto" && (
        <BudgetSummaryPanel
          canEdit={false}
          settings={props.currentProject.budgetSettings}
          totals={getBudgetTotals(rows, props.currentProject.budgetSettings)}
          onChange={() => undefined}
        />
      )}
      <div className="export-grid">
        {rootEntries.map(({ row, index, code }) => {
          const branchSize = getBranchEndLocal(rows, index) - index + 1;
          const title = getRootExportLabel(row, code);
          const partidaLabel = branchSize === 1 ? "1 partida" : `${branchSize} partidas`;
          return (
            <button
              key={row.id}
              type="button"
              className="export-root-button"
              title={`${modeConfig.actionLabel}: ${title}`}
              onClick={() => {
                const exportRows = buildExportRowsForMode(rows, index, props.codes, modeConfig.key);
                if (exportRows.length === 0) {
                  window.alert(modeConfig.emptyAlert);
                  return;
                }
                const fileName = sanitizeFilename(`${props.currentProject.name} - ${title}`) || modeConfig.fileFallbackName;
                const workbook = props.exportMode === "presupuesto"
                  ? buildS10BudgetWorkbook(props.currentProject, title, rows, index, props.codes)
                  : buildXlsxWorkbook(title, exportRows, modeConfig.columns);
                downloadBlobFile(`${fileName}.xlsx`, workbook);
              }}
            >
              <span className="export-root-button__title">{title}</span>
              <span className="export-root-button__meta">{code} - {partidaLabel}</span>
              <span className="export-root-button__action">{modeConfig.actionLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildS10BudgetWorkbook(project: BudgetProject, title: string, rows: BudgetRow[], rootIndex: number, codes: string[]) {
  const branchEnd = getBranchEndLocal(rows, rootIndex);
  const scopedRows = cloneRows(rows.slice(rootIndex, branchEnd + 1));
  const scopedCodes = codes.slice(rootIndex, branchEnd + 1);
  const scopedProject = {
    ...project,
    rows: scopedRows
  };
  const polynomialRows = buildPolynomialBreakdown(
    scopedRows,
    project.polynomialGroups,
    project.resourceCatalogItems
  ).map((item) => ({
    codigo: item.codigo,
    descripcion: item.descripcion,
    indice: item.indice,
    costo: item.costo,
    incidenciaPercent: item.incidenciaPercent
  }));
  return buildXlsxWorkbookFromSheets([
    {
      name: "Presupuesto",
      title,
      rows: buildExportRowsForMode(rows, rootIndex, codes, "presupuesto"),
      columns: EXPORT_MODE_CONFIGS.presupuesto.columns
    },
    {
      name: "APU",
      title: `${title} - APU`,
      rows: buildApuReportRows(scopedRows, scopedCodes),
      columns: APU_REPORT_COLUMNS
    },
    {
      name: "Recursos",
      title: `${title} - Recursos`,
      rows: buildResourceReportRows(scopedProject),
      columns: RESOURCE_REPORT_COLUMNS
    },
    {
      name: "Metrados",
      title: `${title} - Metrados`,
      rows: buildMetradoReportRows(scopedRows, scopedCodes),
      columns: METRADO_REPORT_COLUMNS
    },
    {
      name: "Pie",
      title: `${title} - Pie`,
      rows: buildBudgetSummaryReportRows(scopedRows, project.budgetSettings),
      columns: BUDGET_SUMMARY_REPORT_COLUMNS
    },
    {
      name: "Formula",
      title: `${title} - Formula Polinomica`,
      rows: polynomialRows,
      columns: POLYNOMIAL_REPORT_COLUMNS
    }
  ]);
}

function BimControlPanel(props: {
  currentProject: BudgetProject;
  rows: BudgetRow[];
  codes: string[];
  jobsState: BimJobsPanelState;
  readinessState: BimReadinessPanelState;
  canCreateJob: boolean;
  onCancelJob: (jobId: string) => void;
  onCreateJob: () => void;
  onApplyJob: (jobId: string) => void;
  onRefreshJobs: () => void;
  onRefreshReadiness: () => void;
  onRetryJob: (jobId: string) => void;
  onOpenRvtExport: () => void;
  onSelectRow: (rowId: string) => void;
}) {
  const report = buildBimControlReport(props.rows, props.currentProject, props.codes);
  return (
    <div id="bim-panel" className="bim-panel">
      <div className="bim-dashboard">
        <div className="bim-summary-grid">
          <BimMetric label="Listas para Revit" value={report.readyEntries.length} detail={`${report.revitEntries.length} marcadas como Revit`} tone="ready" />
          <BimMetric label="Codif. faltantes" value={report.missingCodificationEntries.length} detail="Requieren CODIFICACION" tone={report.missingCodificationEntries.length > 0 ? "warn" : "ok"} />
          <BimMetric label="Codif. duplicadas" value={report.duplicateCodificationEntries.length} detail={`${report.duplicateCodificationKeys.length} codigos repetidos`} tone={report.duplicateCodificationEntries.length > 0 ? "warn" : "ok"} />
          <BimMetric label="Metrados recibidos" value={report.metradoReceivedEntries.length} detail={formatAmount(report.totalMetradoBim)} tone="received" />
          <BimMetric label="Diferencias" value={report.differenceEntries.length} detail={`BIM - Trad.: ${formatSignedAmount(report.totalDifference)}`} tone={report.differenceEntries.length > 0 ? "warn" : "ok"} />
        </div>
        <section className="bim-section">
          <div className="bim-section-head">
            <div>
              <strong>Ultimo lote Revit</strong>
              <span>{report.latestRevitExport ? formatRevitExportMeta(report.latestRevitExport) : "Aun no hay lotes recibidos desde Revit."}</span>
            </div>
            <button type="button" className="toolbar-button" onClick={props.onOpenRvtExport}>Exportaciones RVT</button>
          </div>
          <LatestRevitExport latestExport={report.latestRevitExport} />
        </section>
        <section className="bim-section">
          <div className="bim-section-head">
            <div>
              <strong>Preparacion BIM</strong>
              <span>Estado del backend, puente Revit y credenciales locales sin exponer secretos.</span>
            </div>
            <button type="button" className="toolbar-button" onClick={props.onRefreshReadiness}>Verificar</button>
          </div>
          <BimReadinessPanel state={props.readinessState} />
        </section>
        <section className="bim-section">
          <div className="bim-section-head">
            <div>
              <strong>Jobs BIM Revit</strong>
              <span>La web crea trabajos asincronos y Revit reporta progreso sin bloquear la pantalla.</span>
            </div>
            <div className="bim-job-actions">
              <button
                type="button"
                className="toolbar-button toolbar-button--primary"
                disabled={!props.canCreateJob || props.jobsState.creating}
                onClick={props.onCreateJob}
              >
                Revit activo
              </button>
              <button type="button" className="toolbar-button" onClick={props.onRefreshJobs}>Actualizar</button>
            </div>
          </div>
          <BimJobQueueSummaryStrip summary={props.jobsState.summary} />
          <BimJobsList
            jobs={props.jobsState.jobs}
            loading={props.jobsState.loading}
            error={props.jobsState.error}
            onApplyJob={props.onApplyJob}
            onCancelJob={props.onCancelJob}
            onRetryJob={props.onRetryJob}
          />
        </section>
        <section className="bim-section">
          <div className="bim-section-head">
            <div>
              <strong>Partidas listas para Revit</strong>
              <span>Filas hoja con Tipo de metrado = Revit, datos completos y codificacion unica.</span>
            </div>
            <button type="button" className="toolbar-button toolbar-button--primary" onClick={props.onOpenRvtExport}>Ver salida RVT</button>
          </div>
          <BimReadyTable entries={report.readyEntries} onSelectRow={props.onSelectRow} />
        </section>
        <div className="bim-section-grid">
          <section className="bim-section">
            <div className="bim-section-head">
              <div>
                <strong>Alertas de codificacion</strong>
                <span>Prioriza esto antes de importar o exportar.</span>
              </div>
            </div>
            <BimIssueList
              items={[
                ...report.missingCodificationEntries.map((entry) => ({
                  rowId: entry.row.id,
                  title: `${entry.code} sin codificacion`,
                  detail: entry.row.descripcion || "Partida sin descripcion"
                })),
                ...report.duplicateCodificationEntries.map((entry) => ({
                  rowId: entry.row.id,
                  title: `${entry.row.codificacion} duplicada`,
                  detail: `${entry.code} - ${entry.row.descripcion || "Sin descripcion"}`
                })),
                ...report.incompleteEntries.map((entry) => ({
                  rowId: entry.row.id,
                  title: `${entry.code} incompleta`,
                  detail: getMissingBimReadyLabels(entry.row).join(", ")
                }))
              ]}
              onSelectRow={props.onSelectRow}
            />
          </section>
          <section className="bim-section">
            <div className="bim-section-head">
              <div>
                <strong>Diferencias de metrado</strong>
                <span>Compara metrado tradicional contra metrado BIM recibido.</span>
              </div>
            </div>
            <BimDifferenceList entries={report.differenceEntries} onSelectRow={props.onSelectRow} />
          </section>
        </div>
      </div>
    </div>
  );
}

function BimReadinessPanel(props: { state: BimReadinessPanelState }) {
  if (props.state.error) {
    return (
      <div className="bim-job-empty">
        <strong>No se pudo verificar BIM</strong>
        <span>{props.state.error}</span>
      </div>
    );
  }
  if (props.state.loading && !props.state.report) {
    return (
      <div className="bim-job-empty">
        <strong>Verificando BIM</strong>
        <span>Consultando readiness del backend.</span>
      </div>
    );
  }
  if (!props.state.report) {
    return (
      <div className="bim-job-empty">
        <strong>Readiness sin consultar</strong>
        <span>Usa Verificar para revisar la preparacion BIM.</span>
      </div>
    );
  }

  const report = props.state.report;
  const tone = getBimReadinessTone(report);
  const visibleChecks = selectActiveRevitReadinessVisibleChecks(report);

  return (
    <div className={`bim-readiness-card bim-readiness-card--${tone}`}>
      <div className="bim-readiness-head">
        <div>
          <strong>{getBimReadinessLabel(report)}</strong>
          <span>{`${getActiveRevitReadinessLabel(report)} | Backend BIM | ${report.storage.label || report.storage.kind || "storage sin declarar"}`}</span>
        </div>
        <span className={`bim-readiness-badge bim-readiness-badge--${tone}`}>
          {formatBimReadinessTone(tone)}
        </span>
      </div>
      <div className="bim-readiness-check-grid">
        {visibleChecks.map((check) => (
          <span key={check.id} className={`bim-readiness-check bim-readiness-check--${check.status}`}>
            <small>{check.label}</small>
            <strong>{formatBimReadinessTone(check.status)}</strong>
          </span>
        ))}
      </div>
      <div className="bim-readiness-foot">
        <span>{`Revit: ${getActiveRevitReadinessMissingSummary(report)}`}</span>
        <span>{getBimReadinessPhaseSummary(report)}</span>
        {props.state.loading && <span>Actualizando...</span>}
      </div>
    </div>
  );
}

function BimJobQueueSummaryStrip(props: { summary: BimJobQueueSummary }) {
  const summary = props.summary;
  const bridgeWait = getBimJobBridgeWaitDiagnostic(summary);
  const bridgePresence = summary.bridgePresence;
  const bridgeDiagnosticIssue = formatBimBridgeDiagnosticIssue(bridgePresence.latestDiagnostic);
  return (
    <div className="bim-job-summary-stack">
      <div className="bim-job-summary-grid" aria-label="Resumen operativo de jobs BIM">
        <span className={`bim-job-summary-pill${summary.queued > 0 ? " is-warn" : ""}`}>
          <small>En cola</small>
          <strong>{summary.queued}</strong>
        </span>
        <span className={`bim-job-summary-pill${summary.active > 0 ? " is-active" : ""}`}>
          <small>Activos</small>
          <strong>{summary.active}</strong>
        </span>
        <span className={`bim-job-summary-pill${summary.failed > 0 ? " is-warn" : ""}`}>
          <small>Fallidos</small>
          <strong>{summary.failed}</strong>
        </span>
        <span className={`bim-job-summary-pill${bridgePresence.online ? " is-active" : summary.activeRevitQueued > 0 ? " is-warn" : ""}`}>
          <small>Bridge</small>
          <strong>{bridgePresence.online ? "Abierto" : "Sin senal"}</strong>
        </span>
        <span className={`bim-job-summary-pill${summary.activeRevitQueued > 0 ? " is-warn" : ""}`}>
          <small>Revit cola</small>
          <strong>{summary.activeRevitQueued}</strong>
        </span>
        <span className="bim-job-summary-pill">
          <small>Revit proc.</small>
          <strong>{summary.activeRevitProcessing}</strong>
        </span>
        <span className="bim-job-summary-pill">
          <small>Espera Revit</small>
          <strong>{formatBimJobAge(summary.oldestActiveRevitQueuedAgeSeconds)}</strong>
        </span>
      </div>
      {bridgeWait.tone !== "ok" && (
        <div className={`bim-job-bridge-wait bim-job-bridge-wait--${bridgeWait.tone}`}>
          <strong>{bridgeWait.label}</strong>
          <span>
            {`${bridgeWait.waitingJobCount} job${bridgeWait.waitingJobCount === 1 ? "" : "s"} active-revit en cola hace ${formatBimJobAge(bridgeWait.oldestWaitSeconds)}.`}
          </span>
          {bridgeWait.action && <em>{bridgeWait.action}</em>}
        </div>
      )}
      {bridgeDiagnosticIssue && (
        <div className="bim-job-bridge-wait bim-job-bridge-wait--warning">
          <strong>Bridge abierto no listo</strong>
          <em>{bridgeDiagnosticIssue}</em>
        </div>
      )}
    </div>
  );
}

function BimJobsList(props: {
  jobs: BimJobRecord[];
  loading: boolean;
  error: string;
  onApplyJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}) {
  if (props.error) {
    return (
      <div className="bim-job-empty">
        <strong>No se pudieron cargar jobs BIM</strong>
        <span>{props.error}</span>
      </div>
    );
  }
  if (props.loading && props.jobs.length === 0) {
    return (
      <div className="bim-job-empty">
        <strong>Cargando jobs BIM</strong>
        <span>Consultando la cola asincrona.</span>
      </div>
    );
  }
  if (props.jobs.length === 0) {
    return (
      <div className="bim-job-empty">
        <strong>Sin jobs BIM</strong>
        <span>Crea un job para que Revit activo lo procese cuando el modelo este abierto.</span>
      </div>
    );
  }

  return (
    <div className="bim-job-list">
      {props.jobs.map((job) => {
        const artifacts = getBimJobArtifacts(job);
        const timingText = formatBimJobTiming(job);
        const fluencyMetrics = getBimJobFluencyMetrics(job);

        return (
          <article key={job.id} className={`bim-job-card bim-job-card--${job.status}`}>
            <div className="bim-job-card-head">
              <div>
                <strong>{job.commandType}</strong>
                <span>{`${getBimJobTargetModeLabel(job.targetMode)} - ${getBimJobStatusLabel(job.status)} - ${formatDateTime(job.updatedAt)}`}</span>
              </div>
              <div className="bim-job-card-actions">
                {!isBimJobFinished(job.status) && (
                  <button type="button" className="toolbar-button" onClick={() => props.onCancelJob(job.id)}>Cancelar</button>
                )}
                {canCreateBimApplyJob(job) && !hasBimApplyJobForPreview(props.jobs, job.id) && (
                  <button type="button" className="toolbar-button toolbar-button--primary" onClick={() => props.onApplyJob(job.id)}>Aplicar en Revit</button>
                )}
                {canRetryBimJob(job) && (
                  <button type="button" className="toolbar-button" onClick={() => props.onRetryJob(job.id)}>Reintentar</button>
                )}
              </div>
            </div>
            <div className="bim-job-progress" aria-label={`Progreso ${Math.round(job.percent)}%`}>
              <span style={{ width: `${Math.max(0, Math.min(100, job.percent))}%` }} />
            </div>
            <div className="bim-job-meta">
              <span>{job.stage}</span>
              <span className="bim-job-timing">{timingText}</span>
              <strong>{`${Math.round(job.percent)}%`}</strong>
            </div>
            {fluencyMetrics && (
              <div className={`bim-job-fluency bim-job-fluency--${fluencyMetrics.status}`} aria-label="Metrica de fluidez BIM">
                <span>{formatBimJobFluencyMetrics(fluencyMetrics)}</span>
              </div>
            )}
            {artifacts.length > 0 && (
              <div className="bim-job-artifacts">
                <span>{`${artifacts.length} artefacto${artifacts.length === 1 ? "" : "s"} BIM guardado${artifacts.length === 1 ? "" : "s"}`}</span>
                <div className="bim-job-artifact-links">
                  {artifacts.slice(0, 3).map((artifact) => (
                    <a
                      key={artifact.id}
                      className="bim-job-artifact-link"
                      href={getBimArtifactDownloadUrl(job.id, artifact.id)}
                      title={artifact.kind}
                    >
                      {artifact.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {job.logs.length > 0 && (
              <div className="bim-job-log">
                {job.logs.slice(-3).map((log) => (
                  <span key={log.id} className={`bim-job-log__line bim-job-log__line--${log.level}`}>
                    {`${formatDateTime(log.createdAt)} - ${log.message}`}
                  </span>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function AuditPanel(props: {
  auditEntries: AuditEntry[];
  auditFilter: AuditFilterKey;
  codes: string[];
  selectedIndex: number;
  selectedRow: BudgetRow | null;
  onFilter: (filter: AuditFilterKey) => void;
}) {
  if (!props.selectedRow) {
    return (
      <div id="audit-panel" className="audit-panel">
        <div className="audit-entry-empty">
          <strong>Selecciona una fila</strong>
          <p>Elige una partida de la matriz para ver su seguimiento.</p>
        </div>
      </div>
    );
  }
  const selectedPartidaCode = props.selectedIndex >= 0 ? props.codes[props.selectedIndex] : "";
  const entries = props.auditEntries
    .filter((entry) => entry.rowId === props.selectedRow?.id)
    .filter((entry) => doesAuditEntryMatchFilter(entry, props.auditFilter))
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  const title = props.selectedRow.descripcion.trim() || props.selectedRow.codificacion.trim() || selectedPartidaCode;
  return (
    <div id="audit-panel" className="audit-panel">
      <div className="audit-panel-head">
        <div className="audit-panel-title">
          <strong>{title}</strong>
          <span>{selectedPartidaCode}{props.selectedRow.codificacion ? ` | ${props.selectedRow.codificacion}` : ""}</span>
        </div>
        <div className="audit-filter-row" role="group" aria-label="Filtros de auditoria">
          {Object.entries(AUDIT_FILTER_CONFIGS).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`audit-filter-button${key === props.auditFilter ? " is-active" : ""}`}
              onClick={() => props.onFilter(key as AuditFilterKey)}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="audit-entry-empty">
          <strong>{props.auditFilter === "all" ? "Sin cambios auditados" : "Sin cambios para este filtro"}</strong>
          <p>Esta fila todavia no registra movimientos ni ediciones en el historial.</p>
        </div>
      ) : (
        <div className="audit-entry-list">
          {entries.map((entry) => (
            <article key={entry.id} className="audit-entry-card">
              <strong>{getAuditEntryTitle(entry)}</strong>
              <span className="audit-entry-meta">{`${entry.userName} - ${formatDateTime(entry.timestamp)}`}</span>
              <p className="audit-entry-detail">{getAuditEntryDetail(entry)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotPanel(props: {
  baseId: string;
  project: BudgetProject;
  rows: BudgetRow[];
  targetId: string;
  operatorName: string;
  onDelete: (snapshotId: string) => void;
  onDownload: (snapshot: BudgetSnapshot) => void;
  onSetBase: (snapshotId: string) => void;
  onSetTarget: (snapshotId: string) => void;
}) {
  const snapshots = getSnapshotsSortedNewestFirst(props.project.snapshots);
  const versions = getBudgetTimelineVersions(props.rows, props.project.snapshots, props.operatorName);
  const options = versions;
  const baseId = props.baseId || snapshots[0]?.id || "";
  const targetId = props.targetId || "current";
  const baseVersion = versions.find((version) => version.id === baseId);
  const targetVersion = versions.find((version) => version.id === targetId);
  const comparison = baseVersion && targetVersion && baseVersion.id !== targetVersion.id
    ? buildBudgetComparison(baseVersion, targetVersion)
    : null;

  return (
    <div id="snapshot-panel" className="snapshot-panel">
      <div className="snapshot-panel-head">
        <div className="snapshot-panel-title">
          <strong>Historial de fotos del presupuesto</strong>
          <span>Las fotos quedan guardadas en MySQL para comparar versiones y seguir su evolucion.</span>
        </div>
        <span className="table-meta-pill"><strong>{snapshots.length}</strong> fotos</span>
      </div>
      {versions.length > 0 && <SnapshotTimeline versions={versions} />}
      <section className="snapshot-section snapshot-section--compare">
        <div className="snapshot-section-head">
          <strong>Comparacion de versiones</strong>
          <span>{comparison ? `${getBudgetVersionLabel(baseVersion!)} -> ${getBudgetVersionLabel(targetVersion!)}` : "Elige dos versiones distintas."}</span>
        </div>
        {options.length >= 2 && (
          <div className="snapshot-compare-controls">
            <label className="snapshot-compare-field">
              <span>Base</span>
              <select className="snapshot-compare-select" value={baseId} onChange={(event) => props.onSetBase(event.target.value)}>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>{getBudgetVersionLabel(option)}</option>
                ))}
              </select>
            </label>
            <label className="snapshot-compare-field">
              <span>Objetivo</span>
              <select className="snapshot-compare-select" value={targetId} onChange={(event) => props.onSetTarget(event.target.value)}>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>{getBudgetVersionLabel(option)}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {comparison && (
          <>
            <div className="snapshot-card-stats">
              <ComparisonPill label="Delta total" value={formatSignedAmount(comparison.deltas.grandTotal)} delta={comparison.deltas.grandTotal} />
              <ComparisonPill label="Variacion" value={formatSignedPercent(getDeltaPercent(comparison.baseSummary.grandTotal, comparison.targetSummary.grandTotal))} delta={comparison.deltaPercent} />
              <ComparisonPill label="Metrado trad." value={formatSignedAmount(comparison.deltas.metradoTradicionalTotal)} delta={comparison.deltas.metradoTradicionalTotal} />
              <ComparisonPill label="Metrado BIM" value={formatSignedAmount(comparison.deltas.metradoBimTotal)} delta={comparison.deltas.metradoBimTotal} />
              <ComparisonPill label="Partidas" value={formatSignedInteger(comparison.deltas.rowCount)} delta={comparison.deltas.rowCount} />
            </div>
            <div className="snapshot-compare-summary">
              <span className="snapshot-summary-pill">Agregadas: <strong>{comparison.counts.added}</strong></span>
              <span className="snapshot-summary-pill">Eliminadas: <strong>{comparison.counts.removed}</strong></span>
              <span className="snapshot-summary-pill">Editadas: <strong>{comparison.counts.updated}</strong></span>
              <span className="snapshot-summary-pill">Total base: <strong>{formatAmount(comparison.baseSummary.grandTotal)}</strong></span>
              <span className="snapshot-summary-pill">Total objetivo: <strong>{formatAmount(comparison.targetSummary.grandTotal)}</strong></span>
            </div>
            <div className="snapshot-change-list">
              {comparison.changes.slice(0, 8).map((change, index) => (
                <article key={`${change.type}-${index}`} className="snapshot-change-card">
                  <strong>{change.title}</strong>
                  <span className="audit-entry-meta">{change.meta}</span>
                  <p className="audit-entry-detail">{change.detail}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {snapshots.length === 0 ? (
        <div className="audit-entry-empty">
          <strong>Aun no hay fotos guardadas</strong>
          <p>Usa Guardar foto para congelar una version historica del presupuesto actual.</p>
        </div>
      ) : (
        <div className="snapshot-grid">
          {snapshots.map((snapshot) => {
            const summary = snapshot.summary || buildSnapshotSummary(snapshot.rows);
            return (
              <article key={snapshot.id} className="snapshot-card">
                <div className="snapshot-card-head">
                  <div className="snapshot-card-title">
                    <strong>{snapshot.name}</strong>
                    <span>{`V${snapshot.versionNumber} - ${getSnapshotTypeLabel(snapshot.snapshotType)} - ${snapshot.userName}`}</span>
                  </div>
                  <span className="snapshot-card-date">{formatDateTime(snapshot.createdAt)}</span>
                </div>
                <div className="snapshot-card-stats">
                  <SnapshotStat label="Total" value={formatAmount(summary.grandTotal)} />
                  <SnapshotStat label="Partidas" value={summary.rowCount} />
                  <SnapshotStat label="Raices" value={summary.rootCount} />
                  <SnapshotStat label="Metrado trad." value={formatAmount(summary.metradoTradicionalTotal)} />
                </div>
                <div className="snapshot-card-actions">
                  <button type="button" className="topbar-button" onClick={() => props.onSetBase(snapshot.id)}>Comparar con actual</button>
                  <button type="button" className="topbar-button" onClick={() => props.onDownload(snapshot)}>Descargar JSON</button>
                  <button type="button" className="topbar-button topbar-button--danger" onClick={() => props.onDelete(snapshot.id)}>Eliminar</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsersPanel(props: {
  activeProjectId: string;
  currentProjectId: string;
  budgetProjects: BudgetProject[];
  canCreateProject: boolean;
  state: UsersPanelState;
  onChangeSelectedProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRefresh: () => void;
  onSaveUser: (user: Partial<AccessUser> & { email: string }) => Promise<void>;
  onSearch: (search: string) => void;
}) {
  const [membersProjectId, setMembersProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState("viewer");
  const budgetProjectById = useMemo(() => new Map(props.budgetProjects.map((project) => [project.id, project])), [props.budgetProjects]);
  const accessProjects = useMemo<ProjectAccessOption[]>(() => {
    const projectById = new Map<string, ProjectAccessOption>();
    props.budgetProjects.forEach((project) => {
      projectById.set(project.id, { id: project.id, name: project.name });
    });
    props.state.projects.forEach((project) => {
      projectById.set(project.id, {
        ...project,
        name: project.name || projectById.get(project.id)?.name || project.id
      });
    });
    return Array.from(projectById.values());
  }, [props.budgetProjects, props.state.projects]);
  const selectedProjectId = membersProjectId || props.state.selectedProjectId || props.currentProjectId || accessProjects[0]?.id || "";
  const selectedProject = accessProjects.find((project) => project.id === selectedProjectId) || accessProjects[0];
  const selectedProjectMembers = membersProjectId ? getProjectMembers(props.state.users, membersProjectId) : [];
  const members = selectedProjectMembers
    .filter((user) => {
      const query = props.state.search.trim().toLowerCase();
      if (!query) return true;
      return `${user.email} ${user.displayName} ${user.role}`.toLowerCase().includes(query);
    });
  const visibleProjects = accessProjects
    .map((project) => ({
      accessProject: project,
      budgetProject: budgetProjectById.get(project.id) || null,
      members: getProjectMembers(props.state.users, project.id)
    }))
    .filter(({ accessProject }) => {
      const query = projectSearch.trim().toLowerCase();
      if (!query) return true;
      return `${accessProject.name} ${accessProject.id}`.toLowerCase().includes(query);
    });

  const resetMemberDrafts = useCallback(() => {
    props.onSearch("");
    setDraftEmail("");
    setDraftName("");
    setDraftRole("viewer");
    setAddMembersOpen(false);
  }, [props.onSearch]);

  useEffect(() => {
    if (!props.activeProjectId || membersProjectId === props.activeProjectId) return;
    resetMemberDrafts();
    setMembersProjectId(props.activeProjectId);
  }, [membersProjectId, props.activeProjectId, resetMemberDrafts]);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    const email = draftEmail.trim().toLowerCase();
    if (!email || !selectedProject) return;
    const existing = props.state.users.find((user) => user.email === email) || null;
    const projectIds = draftRole === "superadmin"
      ? ["*"]
      : Array.from(new Set([...(existing?.projectIds || []), selectedProject.id]));
    await props.onSaveUser({
      ...(existing || {}),
      email,
      displayName: draftName.trim() || existing?.displayName || email,
      role: draftRole,
      active: existing?.active ?? true,
      projectIds,
      viewAccessByProject: buildUserViewAccessByProject(existing, projectIds, draftRole, selectedProject.id, DEFAULT_USER_PROJECT_VIEW_KEYS)
    });
    setDraftEmail("");
    setDraftName("");
    setDraftRole("viewer");
    setAddMembersOpen(false);
  };

  const openMembers = (projectId: string) => {
    props.onChangeSelectedProject(projectId);
    resetMemberDrafts();
    setMembersProjectId(projectId);
  };

  const backToProjects = () => {
    props.onChangeSelectedProject("");
    resetMemberDrafts();
    setMembersProjectId("");
  };

  return (
    <div id="users-panel" className="users-panel">
      <div className={`users-shell users-acc-shell${membersProjectId ? " is-members-view" : ""}`}>
        {!membersProjectId ? (
          <section className="users-acc-page users-acc-projects">
            <div className="users-acc-title">
              <div>
                <h2>Proyectos</h2>
                <span>Selecciona un proyecto para administrar sus miembros y permisos.</span>
              </div>
            </div>
            <div className="users-acc-toolbar">
              <button type="button" className="users-btn users-btn-primary" disabled={!props.canCreateProject} onClick={props.onCreateProject}>
                Crear proyecto
              </button>
              <button type="button" className="users-btn users-btn-primary" disabled={props.state.loading} onClick={props.onRefresh}>
                {props.state.loading ? "Cargando" : "Actualizar"}
              </button>
              <div className="users-acc-toolbar-spacer"></div>
              <label className="users-search-box">
                <span aria-hidden="true"></span>
                <input
                  type="search"
                  placeholder="Buscar proyectos por nombre o numero"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                />
              </label>
              <button type="button" className="users-btn users-btn-icon-only" title="Filtros" aria-label="Filtros">
                <span className="users-filter-icon" aria-hidden="true"></span>
              </button>
            </div>
            {props.state.loading && <div className="users-feedback users-feedback--info">Cargando usuarios...</div>}
            {props.state.error && <div className="users-feedback users-feedback--error">{props.state.error}</div>}
            {props.state.info && <div className="users-feedback users-feedback--info">{props.state.info}</div>}
            <div className="users-table-wrap users-table-wrap--acc">
              <table className="users-table users-project-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Nombre</th>
                    <th>Numero</th>
                    <th>Acceso por defecto</th>
                    <th>Centro</th>
                    <th>Miembros</th>
                    <th>Creado el</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.map(({ accessProject, budgetProject, members: projectMembers }) => (
                    <tr key={accessProject.id} className="users-project-row" onClick={() => openMembers(accessProject.id)}>
                      <td><span className="users-acc-project-mark" aria-hidden="true"></span></td>
                      <td>
                        <span className="users-project-name-copy">
                          <strong>{accessProject.name}</strong>
                          <small>{getProjectSubtitle(accessProject.name)}</small>
                        </span>
                      </td>
                      <td>{getProjectNumber(accessProject.id)}</td>
                      <td>
                        <span className="users-default-access">
                          <span className="users-default-access-icon" aria-hidden="true"></span>
                          <span>Build</span>
                        </span>
                      </td>
                      <td>{getProjectHubLabel(budgetProject)}</td>
                      <td>{projectMembers.length}</td>
                      <td>{formatShortDate(budgetProject?.createdAt || "")}</td>
                    </tr>
                  ))}
                  {visibleProjects.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <strong>Sin proyectos</strong>
                          <p>No hay coincidencias para la busqueda actual.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="users-pagination-info">
              Mostrando {visibleProjects.length} de {accessProjects.length}
            </div>
          </section>
        ) : (
          <section className="users-acc-page users-acc-members">
            <div className="users-acc-title users-acc-title--members">
              <div>
                <div className="users-breadcrumb">
                  <button type="button" onClick={backToProjects}>Proyectos</button>
                  <span>/</span>
                  <span>{selectedProject?.name || "Proyecto"}</span>
                </div>
                <h2>Miembros</h2>
                <span>{selectedProject?.name || "Proyecto"} | {selectedProjectMembers.length} miembros</span>
              </div>
            </div>
            <div className="users-acc-toolbar">
              <div className="users-btn-group">
                <button type="button" className="users-btn users-btn-primary" onClick={() => setAddMembersOpen((current) => !current)}>
                  Anadir miembros
                </button>
                <button type="button" className="users-btn users-btn-primary users-btn-icon-only" onClick={() => setAddMembersOpen((current) => !current)} aria-label="Opciones de anadir miembros">
                  <span className="users-caret-down" aria-hidden="true"></span>
                </button>
              </div>
              <div className="users-acc-toolbar-spacer"></div>
              <button type="button" className="users-btn users-btn-secondary">Exportar ({selectedProjectMembers.length})</button>
              <label className="users-search-box">
                <span aria-hidden="true"></span>
                <input
                  type="search"
                  placeholder="Buscar miembros por nombre o correo"
                  value={props.state.search}
                  onChange={(event) => props.onSearch(event.target.value)}
                />
              </label>
              <button type="button" className="users-btn users-btn-secondary">Filtros (0)</button>
            </div>
            {props.state.loading && <div className="users-feedback users-feedback--info">Cargando usuarios...</div>}
            {props.state.error && <div className="users-feedback users-feedback--error">{props.state.error}</div>}
            {props.state.info && <div className="users-feedback users-feedback--info">{props.state.info}</div>}
            {addMembersOpen && (
              <form className="users-form users-form--inline users-add-strip" onSubmit={(event) => void addMember(event)}>
                <label className="users-field">
                  <span>Correo electronico</span>
                  <input type="email" placeholder="correo@empresa.com" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} />
                </label>
                <label className="users-field">
                  <span>Nombre</span>
                  <input type="text" placeholder="Nombre visible" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                </label>
                <label className="users-field users-field--role">
                  <span>Nivel de acceso</span>
                  <select value={draftRole} onChange={(event) => setDraftRole(event.target.value)}>
                    {USER_ROLE_OPTIONS.map((roleOption) => <option key={roleOption} value={roleOption}>{getRoleLabel(roleOption)}</option>)}
                  </select>
                </label>
                <button type="submit" className="users-btn users-btn-primary" disabled={props.state.saving || !selectedProject}>
                  {props.state.saving ? "Guardando" : "Agregar"}
                </button>
              </form>
            )}
            <div className="users-table-wrap users-table-wrap--acc users-table-wrap--members">
              <table className="users-table users-members-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo electronico</th>
                    <th>Telefono</th>
                    <th>Estado</th>
                    <th>Empresa</th>
                    <th>Funcion</th>
                    <th>Nivel de acceso</th>
                    <th>Anadido el</th>
                    {USER_PROJECT_VIEW_OPTIONS.map((option) => <th key={option.key} className="users-module-head">{option.label}</th>)}
                    <th className="users-settings-head" aria-label="Acciones">...</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((user) => (
                    <UserMemberRow
                      key={user.email}
                      projectId={membersProjectId}
                      user={user}
                      onSaveUser={props.onSaveUser}
                    />
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={9 + USER_PROJECT_VIEW_OPTIONS.length}>
                        <div className="empty-state">
                          <strong>Sin miembros</strong>
                          <p>Agrega correos autorizados para este proyecto.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="users-pagination-info">
              Mostrando {members.length} de {selectedProjectMembers.length}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SidebarProductSwitcher(props: {
  activeView: ViewKey;
  isCollapsed: boolean;
  session: ReturnType<typeof useAuth>["session"];
  onNavigate: (view: ViewKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeProductLabel = getWorkspaceProductLabel(props.activeView);
  const canOpenAccessControl = getSessionRole(props.session) === "superadmin";

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const openItemizado = () => {
    setOpen(false);
    props.onNavigate("itemizado");
  };

  const openAccessControl = () => {
    setOpen(false);
    props.onNavigate("usuarios");
  };

  return (
    <div className="sidebar-product-switcher" ref={menuRef}>
      <button
        type="button"
        className="sidebar-product-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Producto activo: ${activeProductLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="brand-mark">Q</span>
        <span className="sidebar-product-copy">
          <span className="brand-caption">Quantiva</span>
          <strong className="brand-title">{activeProductLabel}</strong>
        </span>
        {!props.isCollapsed && <span className="sidebar-product-caret" aria-hidden="true"></span>}
      </button>
      {open && (
        <div className="sidebar-product-menu" role="menu">
          <button type="button" className="sidebar-product-menu-home" role="menuitem" onClick={() => setOpen(false)}>
            <span className="sidebar-product-menu-icon"><NavIcon view="itemizado" /></span>
            <span>My Home</span>
          </button>
          <div className="sidebar-product-menu-label">Disponible en Quantiva</div>
          <button
            type="button"
            className={`sidebar-product-menu-item${activeProductLabel === "Itemizado" ? " is-active" : ""}`}
            role="menuitem"
            aria-current={activeProductLabel === "Itemizado" ? "page" : undefined}
            onClick={openItemizado}
          >
            <span className="sidebar-product-menu-icon"><NavIcon view="itemizado" /></span>
            <span>Itemizado</span>
          </button>
          {canOpenAccessControl && (
            <button
              type="button"
              className={`sidebar-product-menu-item${activeProductLabel === "Control de Accesos" ? " is-active" : ""}`}
              role="menuitem"
              aria-current={activeProductLabel === "Control de Accesos" ? "page" : undefined}
              onClick={openAccessControl}
            >
              <span className="sidebar-product-menu-icon"><NavIcon view="usuarios" /></span>
              <span>Control de Accesos</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UserMemberRow(props: {
  projectId: string;
  user: AccessUser;
  onSaveUser: (user: Partial<AccessUser> & { email: string }) => Promise<void>;
}) {
  const updateUser = (patch: Partial<AccessUser>) => props.onSaveUser({ ...props.user, ...patch });
  const viewKeys = getUserProjectViewKeys(props.user, props.projectId);
  const role = props.user.role.trim().toLowerCase();
  const isSuperAdmin = role === "superadmin";
  const updateRole = (nextRoleInput: string) => {
    const nextRole = nextRoleInput.trim().toLowerCase();
    const projectIds = nextRole === "superadmin"
      ? ["*"]
      : props.user.projectIds.includes("*")
        ? [props.projectId]
        : props.user.projectIds.length > 0
          ? props.user.projectIds
          : [props.projectId];
    return props.onSaveUser({
      ...props.user,
      role: nextRole,
      projectIds,
      viewAccessByProject: buildUserViewAccessByProject(
        props.user,
        projectIds,
        nextRole,
        props.projectId,
        viewKeys.length > 0 ? viewKeys : DEFAULT_USER_PROJECT_VIEW_KEYS
      )
    });
  };
  const toggleView = (viewKey: ViewKey, enabled: boolean) => {
    const projectIds = props.user.projectIds.includes("*") ? [props.projectId] : props.user.projectIds;
    const nextKeys = enabled
      ? Array.from(new Set([...viewKeys, viewKey]))
      : viewKeys.filter((key) => key !== viewKey);
    return updateUser({
      viewAccessByProject: buildUserViewAccessByProject(props.user, projectIds, props.user.role, props.projectId, nextKeys)
    });
  };
  const removeFromProject = () => {
    if (isSuperAdmin) {
      window.alert("No se puede retirar un superadmin desde un proyecto.");
      return;
    }
    const nextProjectIds = props.user.projectIds.filter((projectId) => projectId !== props.projectId);
    void updateUser({
      projectIds: nextProjectIds,
      viewAccessByProject: buildUserViewAccessByProject(
        props.user,
        nextProjectIds,
        props.user.role,
        props.projectId,
        []
      )
    });
  };
  const displayName = props.user.displayName || props.user.email;
  const addedLabel = formatShortDate(props.user.createdAt || props.user.updatedAt);
  const companyLabel = getCompanyLabel(props.user.email);
  return (
    <tr className={props.user.active ? "" : "is-muted"}>
      <td>
        <div className="users-member-cell">
          {props.user.profileImageUrl ? (
            <img className="users-member-avatar users-member-avatar-image" alt="" src={props.user.profileImageUrl} />
          ) : (
            <span className="users-member-avatar" aria-hidden="true">{getInitials(displayName)}</span>
          )}
          <span>
            <strong>{displayName}</strong>
            <small>{getRoleLabel(props.user.role)}</small>
          </span>
        </div>
      </td>
      <td className="users-email-cell">{props.user.email}</td>
      <td>-</td>
      <td>
        <label className={`users-status-toggle${props.user.active ? " is-active" : " is-inactive"}`}>
          <input type="checkbox" checked={props.user.active} onChange={(event) => void updateUser({ active: event.target.checked })} />
          <span>{props.user.active ? "Activo" : "Inactivo"}</span>
        </label>
      </td>
      <td>{companyLabel}</td>
      <td>{getRoleFunctionLabel(props.user.role)}</td>
      <td>
        <select className={`users-role-select ${getRoleToneClass(props.user.role)}`} value={props.user.role} onChange={(event) => void updateRole(event.target.value)}>
          {USER_ROLE_OPTIONS.map((roleOption) => <option key={roleOption} value={roleOption}>{getRoleLabel(roleOption)}</option>)}
        </select>
      </td>
      <td>
        <span className="users-date">{addedLabel}</span>
      </td>
      {USER_PROJECT_VIEW_OPTIONS.map((option) => {
        const checked = viewKeys.includes(option.key);
        return (
          <td key={option.key} className="users-module-cell">
            <label className="users-module-toggle" title={option.label}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isSuperAdmin}
                onChange={(event) => void toggleView(option.key, event.target.checked)}
              />
              <span aria-hidden="true"></span>
            </label>
          </td>
        );
      })}
      <td>
        <button type="button" className="users-row-menu-button" disabled={isSuperAdmin} onClick={removeFromProject} aria-label="Retirar miembro" title="Retirar miembro">
          <span aria-hidden="true"></span>
        </button>
      </td>
    </tr>
  );
}

function AccountMenu(props: {
  open: boolean;
  session: ReturnType<typeof useAuth>["session"];
  onLogout: () => void;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const initials = getInitials(props.session?.userName || props.session?.userEmail || "U");
  return (
    <div id="account-menu" className="account-menu">
      <button
        id="account-menu-button"
        type="button"
        className="account-menu-button"
        aria-label="Abrir menu de cuenta"
        title="Cuenta"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {props.session?.pictureUrl ? (
          <img id="account-menu-avatar-image" className="account-menu-avatar-image" alt="" src={props.session.pictureUrl} />
        ) : (
          <span id="account-menu-avatar-text" className="account-menu-avatar-text" aria-hidden="true">{initials}</span>
        )}
      </button>
      {props.open && (
        <div id="account-menu-panel" className="account-menu-panel" onClick={(event) => event.stopPropagation()}>
          <div className="account-menu-head">
            <div className="account-menu-avatar" aria-hidden="true">
              {props.session?.pictureUrl ? (
                <img id="account-menu-panel-avatar-image" className="account-menu-avatar-image" alt="" src={props.session.pictureUrl} />
              ) : (
                <span id="account-menu-panel-avatar-text">{initials}</span>
              )}
            </div>
            <div className="account-menu-copy">
              <strong id="account-menu-name">{props.session?.userName || "Usuario"}</strong>
              <span id="account-menu-meta">{props.session?.userEmail || "usuario@correo.com"} ({props.session?.role || "USER"})</span>
            </div>
          </div>
          <button id="logout-button" type="button" className="topbar-button account-menu-logout" onClick={props.onLogout}>
            Cerrar sesion
          </button>
        </div>
      )}
    </div>
  );
}

function MetricPill(props: { label: string; value: string | number }) {
  return (
    <span className="head-pill">
      <span className="head-pill-label">{props.label}</span>
      <strong>{props.value}</strong>
    </span>
  );
}

function BimMetric(props: { label: string; value: string | number; detail: string; tone: string }) {
  return (
    <article className={`bim-metric-card bim-metric-card--${props.tone}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </article>
  );
}

function LatestRevitExport(props: { latestExport: BudgetProject["latestRevitExport"] }) {
  if (!props.latestExport) {
    return (
      <div className="bim-empty-block">
        <strong>Sin metrado BIM recibido</strong>
        <p>Cuando el add-in exporte por la API, este bloque mostrara lote, usuario, filas y cantidad total.</p>
      </div>
    );
  }
  const modelLabel = props.latestExport.modelPath
    ? props.latestExport.modelPath.split(/[\\/]/).pop()
    : "Modelo Revit";
  return (
    <div className="bim-latest-grid">
      <span><strong>{props.latestExport.totalRows || 0}</strong> filas</span>
      <span><strong>{formatAmount(props.latestExport.totalQuantity || 0)}</strong> cantidad</span>
      <span><strong>{props.latestExport.linkedItems || 0}</strong> partidas vinculadas</span>
      <span><strong>{modelLabel}</strong> modelo</span>
    </div>
  );
}

function BimReadyTable(props: {
  entries: Array<{ row: BudgetRow; code: string }>;
  onSelectRow: (rowId: string) => void;
}) {
  if (props.entries.length === 0) {
    return (
      <div className="bim-empty-block">
        <strong>No hay partidas listas</strong>
        <p>Completa Tipo de metrado, codificacion, descripcion, unidad, costo y regla de metrado en filas hoja.</p>
      </div>
    );
  }
  return (
    <div className="bim-table-wrap">
      <table className="bim-table">
        <thead>
          <tr>
            <th>Partida</th>
            <th>Codificacion</th>
            <th>Descripcion</th>
            <th>Unidad</th>
            <th>Metrado BIM</th>
          </tr>
        </thead>
        <tbody>
          {props.entries.slice(0, 40).map((entry) => (
            <tr key={entry.row.id}>
              <td><button type="button" className="bim-row-link" onClick={() => props.onSelectRow(entry.row.id)}>{entry.code}</button></td>
              <td>{entry.row.codificacion}</td>
              <td>{entry.row.descripcion}</td>
              <td>{entry.row.unidad}</td>
              <td>{formatAmount(parseDecimal(entry.row.metradoBim))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.entries.length > 40 && <p className="bim-more-note">Se muestran 40 de {props.entries.length} partidas listas.</p>}
    </div>
  );
}

function BimIssueList(props: {
  items: Array<{ rowId: string; title: string; detail: string }>;
  onSelectRow: (rowId: string) => void;
}) {
  if (props.items.length === 0) {
    return (
      <div className="bim-empty-block">
        <strong>Sin alertas criticas</strong>
        <p>Las codificaciones Revit visibles estan completas y sin duplicados.</p>
      </div>
    );
  }
  return (
    <div className="bim-issue-list">
      {props.items.slice(0, 12).map((item) => (
        <button key={`${item.rowId}-${item.title}`} type="button" className="bim-issue-card" onClick={() => props.onSelectRow(item.rowId)}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </button>
      ))}
      {props.items.length > 12 && <p className="bim-more-note">Quedan {props.items.length - 12} alertas adicionales.</p>}
    </div>
  );
}

function BimDifferenceList(props: {
  entries: Array<{ row: BudgetRow; code: string; traditional: number; bim: number; difference: number }>;
  onSelectRow: (rowId: string) => void;
}) {
  if (props.entries.length === 0) {
    return (
      <div className="bim-empty-block">
        <strong>Sin diferencias relevantes</strong>
        <p>No hay partidas Revit con metrado tradicional y BIM distintos.</p>
      </div>
    );
  }
  return (
    <div className="bim-issue-list">
      {props.entries.slice(0, 12).map((entry) => (
        <button key={entry.row.id} type="button" className="bim-issue-card" onClick={() => props.onSelectRow(entry.row.id)}>
          <strong>{entry.code} - {entry.row.codificacion || "Sin codificacion"}</strong>
          <span>Trad. {formatAmount(entry.traditional)} | BIM {formatAmount(entry.bim)} | Dif. {formatSignedAmount(entry.difference)}</span>
        </button>
      ))}
      {props.entries.length > 12 && <p className="bim-more-note">Quedan {props.entries.length - 12} diferencias adicionales.</p>}
    </div>
  );
}

function SnapshotTimeline(props: { versions: ReturnType<typeof getBudgetTimelineVersions> }) {
  const maxTotal = props.versions.reduce((max, version) => Math.max(max, version.summary.grandTotal), 0);
  return (
    <section className="snapshot-section">
      <div className="snapshot-section-head">
        <strong>Serie historica local</strong>
        <span>Cada version queda lista para graficar el crecimiento del presupuesto en el tiempo.</span>
      </div>
      <div className="snapshot-history-list">
        {props.versions.map((version, index) => {
          const previous = props.versions[index - 1] || null;
          const delta = previous ? version.summary.grandTotal - previous.summary.grandTotal : null;
          const width = maxTotal > 0 ? Math.max(6, (version.summary.grandTotal / maxTotal) * 100) : 6;
          return (
            <article key={version.id} className={`snapshot-history-item${version.id === "current" ? " is-current" : ""}`}>
              <div className="snapshot-history-row">
                <div className="snapshot-history-copy">
                  <strong>{getBudgetVersionLabel(version)}</strong>
                  <span>{formatDateTime(version.createdAt)}</span>
                </div>
                <div className="snapshot-history-total">
                  <strong>{formatAmount(version.summary.grandTotal)}</strong>
                  <span className={getDeltaToneClass(delta)}>{delta === null ? "Punto inicial" : formatSignedAmount(delta)}</span>
                </div>
              </div>
              <div className="snapshot-history-bar">
                <span style={{ width: `${Math.min(width, 100).toFixed(2)}%` }}></span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SnapshotStat(props: { label: string; value: string | number }) {
  return (
    <span className="snapshot-stat-pill">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </span>
  );
}

function ComparisonPill(props: { label: string; value: string; delta: number }) {
  return (
    <span className={`snapshot-stat-pill ${getDeltaToneClass(props.delta)}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </span>
  );
}

function NavIcon(props: { view: ViewKey }) {
  switch (props.view) {
    case "presupuesto":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path d="M8 6h8"></path><path d="M8 10h.01"></path><path d="M12 10h.01"></path><path d="M16 10h.01"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path></svg>;
    case "base-recursos":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 4h16v5H4z"></path><path d="M4 15h16v5H4z"></path><path d="M8 9v6"></path><path d="M16 9v6"></path></svg>;
    case "control-bim":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 2l8 4v12l-8 4-8-4V6z"></path><path d="M12 22V12"></path><path d="M20 6l-8 6-8-6"></path></svg>;
    case "auditoria":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M9 15l2 2 4-4"></path></svg>;
    case "usuarios":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
    case "exportaciones-rvt":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>;
    case "exportacion-presupuesto":
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path></svg>;
    default:
      return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>;
  }
}

function getCurrentProjectFromState(state: BudgetState) {
  return state.projects.find((project) => project.id === state.currentProjectId) || state.projects[0] || null;
}

function buildMetrics(
  rows: BudgetRow[],
  visibleEntries: Array<{ row: BudgetRow }>,
  selectedRow: BudgetRow | null,
  selectedIndex: number,
  codes: string[],
  contentType: string,
  filterQuery: string
) {
  const rowCount = rows.length;
  const rootCount = rows.filter((row) => row.level === 0).length;
  const maxDepth = rowCount === 0 ? 0 : rows.reduce((max, row) => Math.max(max, row.level + 1), 0);
  const grandTotal = formatAmount(getGrandTotalForRows(rows));
  const visibleRows = visibleEntries.length;
  let selectedLabel = "Ninguna";
  if (contentType === "export" || contentType === "users" || contentType === "bim-control" || contentType === "resources" || contentType === "polynomial") {
    selectedLabel = "No aplica";
  } else if (selectedRow && selectedIndex >= 0) {
    const code = codes[selectedIndex];
    selectedLabel = selectedRow.codificacion.trim()
      ? `${code} | ${selectedRow.codificacion.trim()}`
      : `${code} | Nivel ${selectedRow.level + 1}`;
  } else if (filterQuery) {
    selectedLabel = "Sin coincidencias";
  }
  const filterStatus = !filterQuery
    ? "Mostrando todas las filas"
    : visibleRows > 0
      ? `${visibleRows} de ${rowCount} visibles`
      : "Sin resultados";
  return {
    rowCount,
    rootCount,
    maxDepth,
    grandTotal,
    visibleRows,
    selectedLabel,
    filterStatus,
    selectionVisible: !(contentType === "export" || contentType === "users" || contentType === "bim-control" || contentType === "resources" || contentType === "polynomial")
  };
}

function isFieldEditable(columns: ViewColumn[], rows: BudgetRow[], rowIndex: number, fieldName: string) {
  if (fieldName === "rendimientoManoObra" || fieldName === "rendimientoEquipos") {
    return rowIndex >= 0 && rowIndex < rows.length && !rowHasChildren(rows, rowIndex);
  }
  const column = columns.find((entry) => entry.field === fieldName);
  if (!column || !["input", "select"].includes(column.type) || column.editable === false) return false;
  if (column.field === "reglaMetrado" && !isRevitMetradoType(rows[rowIndex]?.tipoMetrado)) return false;
  if (column.field === "costo" && hasApuItems(rows[rowIndex])) return false;
  if (column.field === "metradoTradicional" && normalizeMetradoItems(rows[rowIndex]?.metradoItems).length > 0) return false;
  if (!isLeafOnlyField(column.field)) return true;
  return !rowHasChildren(rows, rowIndex);
}

function getBranchEndLocal(rows: BudgetRow[], startIndex: number) {
  const rootLevel = rows[startIndex]?.level ?? 0;
  let cursor = startIndex + 1;
  while (cursor < rows.length && rows[cursor].level > rootLevel) cursor += 1;
  return cursor - 1;
}

function doesAuditEntryMatchFilter(entry: AuditEntry, filter: AuditFilterKey) {
  if (filter === "today") {
    const entryDate = new Date(entry.timestamp);
    const now = new Date();
    return entryDate.getFullYear() === now.getFullYear()
      && entryDate.getMonth() === now.getMonth()
      && entryDate.getDate() === now.getDate();
  }
  if (filter === "structure") return entry.type === "structure";
  if (filter === "cost") {
    return [
      "costo",
      "metradoTradicional",
      "metradoBim",
      "tipoMetrado",
      "reglaMetrado",
      "rendimientoManoObra",
      "rendimientoEquipos"
    ].includes(entry.field);
  }
  return true;
}

function getAuditEntryTitle(entry: AuditEntry) {
  if (entry.type === "structure") return "Cambio de estructura";
  const labels: Record<string, string> = {
    codificacion: "Codificacion",
    descripcion: "Descripcion de partida",
    unidad: "Unidad de partida",
    costo: "Costo",
    metradoTradicional: "Metrado tradicional",
    metradoBim: "Metrado BIM",
    tipoMetrado: "Tipo de metrado",
    reglaMetrado: "Regla de metrado",
    rendimientoManoObra: "Rendimiento MO",
    rendimientoEquipos: "Rendimiento EQ"
  };
  return labels[entry.field] || entry.field;
}

function getAuditEntryDetail(entry: AuditEntry) {
  if (entry.type === "structure") {
    return `Nivel ${entry.beforeLevel} / ${entry.beforePartidaCode} -> Nivel ${entry.afterLevel} / ${entry.afterPartidaCode}`;
  }
  return `${entry.beforeValue || "Vacio"} -> ${entry.afterValue || "Vacio"}`;
}

function getSnapshotTypeLabel(snapshotType: BudgetSnapshot["snapshotType"]) {
  if (snapshotType === "venta") return "Venta";
  if (snapshotType === "meta") return "Meta";
  if (snapshotType === "linea-base") return "Linea base";
  return "Manual";
}

function formatRevitExportMeta(record: NonNullable<BudgetProject["latestRevitExport"]>) {
  const version = record.revitVersion ? ` - ${record.revitVersion}` : "";
  return `${formatDateTime(record.exportedAt || record.createdAt)} - ${record.userName || "Revit Addin"}${version}`;
}

function createEmptyBimJobQueueSummary(): BimJobQueueSummary {
  return {
    total: 0,
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    activeRevit: 0,
    activeRevitQueued: 0,
    activeRevitProcessing: 0,
    cloudModel: 0,
    cloudModelQueued: 0,
    cloudModelProcessing: 0,
    oldestQueuedAt: "",
    oldestQueuedAgeSeconds: 0,
    oldestActiveRevitQueuedAt: "",
    oldestActiveRevitQueuedAgeSeconds: 0,
    oldestActiveAt: "",
    latestCompletedAt: "",
    oldestActiveAgeSeconds: 0,
    generatedAt: new Date().toISOString(),
    bridgePresence: {
      online: false,
      onlineCount: 0,
      knownCount: 0,
      ttlSeconds: 180,
      latestSeenAt: "",
      latestSeenAgeSeconds: 0,
      latestBridgeId: "",
      latestRequestedBy: "",
      latestModelIdentity: {},
      latestDiagnostic: null,
    },
  };
}

function formatBimBridgeDiagnosticIssue(diagnostic: BimJobQueueSummary["bridgePresence"]["latestDiagnostic"]) {
  if (!diagnostic || diagnostic.canClaim) {
    return "";
  }
  if (diagnostic.issues.length > 0) {
    return diagnostic.issues.slice(0, 2).join(" ");
  }
  if (!diagnostic.signedIn) {
    return "Inicia sesion con Google en el add-in de Revit.";
  }
  if (!diagnostic.hasIngestApiKey) {
    return "Configura web.ingestApiKey con la llave REVIT_INGEST_API_KEY.";
  }
  if (diagnostic.runnerBusy) {
    return "Revit esta procesando otro job BIM.";
  }
  if (!diagnostic.autoClaimEnabled) {
    return "Activa web.autoClaimBimJobs o usa el boton Jobs BIM en Revit.";
  }
  return diagnostic.status ? `Estado bridge: ${diagnostic.status}.` : "";
}

function formatBimJobAge(seconds: number) {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return `${hours}h ${remainderMinutes}m`;
}

function formatBimJobTiming(job: BimJobRecord) {
  const queue = formatBimJobAge(job.queueWaitSeconds);
  const total = formatBimJobAge(job.totalSeconds);
  if (job.status === "queued") {
    return `Cola ${queue} · total ${total}`;
  }
  return `Cola ${queue} · ejec. ${formatBimJobAge(job.runSeconds)} · total ${total}`;
}

function formatBimJobFluencyMetrics(metrics: NonNullable<ReturnType<typeof getBimJobFluencyMetrics>>) {
  const planned = metrics.plannedBatches > 0 ? metrics.plannedBatches : "?";
  const size = metrics.batchSize > 0 ? ` - lote ${metrics.batchSize}` : "";
  const yieldText = metrics.yieldDelayMs > 0 ? ` - pausa ${metrics.yieldDelayMs}ms` : "";
  const average = formatBimJobDurationMs(metrics.averageBatchDurationMs);
  const max = formatBimJobDurationMs(metrics.maxBatchDurationMs);
  return `Fluidez ${getBimJobFluencyLabel(metrics.status)} - lotes ${metrics.processedBatches}/${planned}${size} - prom ${average} - max ${max}${yieldText}`;
}

function getBimJobFluencyLabel(status: NonNullable<ReturnType<typeof getBimJobFluencyMetrics>>["status"]) {
  if (status === "critical") return "critica";
  if (status === "warning") return "alerta";
  return "ok";
}

function formatBimReadinessTone(tone: BimReadinessTone) {
  if (tone === "ok") return "Listo";
  if (tone === "critical") return "Pendiente";
  return "Parcial";
}

function formatBimJobDurationMs(milliseconds: number) {
  const value = Math.max(0, Math.round(milliseconds));
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
}

interface BimJobArtifactLink {
  id: string;
  name: string;
  kind: string;
}

function getBimJobArtifacts(job: BimJobRecord): BimJobArtifactLink[] {
  const artifacts = job.result.artifacts;
  if (!Array.isArray(artifacts)) {
    return [];
  }
  return artifacts.flatMap((artifact) => {
    if (!artifact || typeof artifact !== "object") {
      return [];
    }
    const source = artifact as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    if (!id) {
      return [];
    }
    const rawName = typeof source.name === "string" ? source.name.trim() : "";
    const rawKind = typeof source.kind === "string" ? source.kind.trim() : "";
    return [{
      id,
      name: rawName || id,
      kind: rawKind || "artefacto",
    }];
  });
}

function getBimArtifactDownloadUrl(jobId: string, artifactId: string) {
  return `/api/bim/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/download`;
}

function getNavLabel(view: ViewKey) {
  if (view === "itemizado") return "Resumen";
  if (view === "presupuesto") return "Presupuestos";
  if (view === "base-recursos") return "Base de Recursos";
  if (view === "analisis-costos-unitarios") return "Analisis Costos Unitarios";
  if (view === "formula-polinomica") return "Formula Polinomica";
  if (view === "control-bim") return "Control BIM";
  if (view === "auditoria") return "Auditoria";
  if (view === "usuarios") return "Usuarios";
  if (view === "exportaciones-rvt") return "Exportaciones RVT";
  return "Exportacion presupuesto";
}

function getWorkspaceProductLabel(view: ViewKey) {
  return view === "usuarios" ? "Control de Accesos" : "Itemizado";
}

function getSidebarProductViews(activeView: ViewKey) {
  const views = Object.values(VIEW_CONFIGS);
  if (getWorkspaceProductLabel(activeView) === "Control de Accesos") {
    return views.filter((view) => view.key === "usuarios");
  }
  return views.filter((view) => view.key !== "usuarios");
}

function resolveInitialThemeMode(): ThemeMode {
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return THEME_MODES.DARK;
    }
  } catch {
    // Browser media query support is optional.
  }
  return THEME_MODES.LIGHT;
}

function getSaveStatusLabel(saveStatus: SaveStatus, lastSavedAt: Date | null, storageLabel: string) {
  if (saveStatus === "loading") return "Cargando estado";
  if (saveStatus === "saving") return `Sincronizando ${storageLabel}`;
  if (saveStatus === "dirty") return `Cambios pendientes en ${storageLabel}`;
  if (saveStatus === "error") return "Error de sincronizacion";
  if (lastSavedAt) {
    return `${storageLabel} sincronizado ${lastSavedAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `${storageLabel} activo`;
}

function getStorageModeAppLabel(storageLabel: string, saveStatus: SaveStatus) {
  if (saveStatus === "saving") return `Sincronizando con ${storageLabel}`;
  if (saveStatus === "error") return `Error en ${storageLabel}`;
  return `Conectado a ${storageLabel}`;
}

function ensureUniqueProjectName(nameInput: string, projects: BudgetProject[], excludedProjectId = "") {
  const baseName = sanitizeProjectName(nameInput);
  if (!baseName) return "";
  const existing = new Set(
    projects
      .filter((project) => project.id !== excludedProjectId)
      .map((project) => project.name.trim().toLowerCase())
  );
  if (!existing.has(baseName.toLowerCase())) return baseName;
  let suffix = 2;
  while (existing.has(`${baseName} ${suffix}`.toLowerCase())) suffix += 1;
  return `${baseName} ${suffix}`;
}

function getNextProjectName(projects: BudgetProject[]) {
  return ensureUniqueProjectName(`Proyecto ${projects.length + 1}`, projects) || "Proyecto";
}

function getInitials(value: string) {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function getProjectSubtitle(name: string) {
  const parts = name
    .split(/\s+-\s+|\s{2,}/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" - ") : "Proyecto de Quantiva";
}

function getProjectNumber(projectId: string) {
  const compact = projectId.trim();
  if (!compact) return "-";
  if (compact.length <= 14) return compact;
  return `${compact.slice(0, 8)}...${compact.slice(-4)}`;
}

function getProjectHubLabel(project: BudgetProject | null) {
  if (!project) return "Dechini";
  const latestExportUser = project.latestRevitExport?.userName?.trim();
  if (latestExportUser) return latestExportUser;
  return "Dechini";
}

function getCompanyLabel(email: string) {
  const domain = email.split("@")[1]?.trim().toLowerCase() || "";
  if (!domain) return "-";
  return domain
    .split(".")[0]
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`)
    .join(" ") || domain;
}

function getRoleLabel(role: string) {
  const normalized = role.trim().toLowerCase();
  if (normalized === "superadmin") return "Superadmin";
  if (normalized === "admin") return "Admin";
  if (normalized === "editor") return "Editor";
  if (normalized === "viewer") return "Viewer";
  return role || "Rol";
}

function getRoleFunctionLabel(role: string) {
  const normalized = role.trim().toLowerCase();
  if (normalized === "superadmin") return "Administrador global";
  if (normalized === "admin") return "Administrador";
  if (normalized === "editor") return "Editor";
  if (normalized === "viewer") return "Miembro";
  return "Miembro";
}

function getRoleToneClass(role: string) {
  const normalized = role.trim().toLowerCase();
  if (normalized === "superadmin") return "is-superadmin";
  if (normalized === "admin") return "is-admin";
  if (normalized === "editor") return "is-editor";
  return "is-viewer";
}

function downloadSnapshotJson(project: BudgetProject, snapshot: BudgetSnapshot) {
  const blob = new Blob([
    JSON.stringify({ project: { id: project.id, name: project.name }, snapshot }, null, 2)
  ], { type: "application/json;charset=utf-8" });
  downloadBlobFile(`${sanitizeFilename(`${project.name} - ${snapshot.name}`) || "snapshot"}.json`, blob);
}
