export interface WebAuthSession {
  enabled: boolean;
  configured: boolean;
  required: boolean;
  authenticated: boolean;
  clientId: string;
  allowedDomains: string[];
  userId: string;
  userName: string;
  userEmail: string;
  pictureUrl: string;
  hostedDomain: string;
  expiresAt: string;
  role: string;
  projectIds: string[];
  viewAccessByProject: Record<string, string[]>;
}

export interface AccessUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
  projectIds: string[];
  viewAccessByProject: Record<string, string[]>;
  profileImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAccessOption {
  id: string;
  name: string;
}

export type ApuCategory = "mano-obra" | "materiales" | "equipos" | "subcontratos" | "otros";

export interface UnitCatalogItem {
  id: string;
  codigo: string;
  descripcion: string;
  orden: number;
}

export interface ResourceCatalogItem {
  id: string;
  category: ApuCategory;
  descripcion: string;
  unidad: string;
  precioUnitario: string;
  polynomialGroupId: string;
  orden: number;
}

export interface ApuItem {
  id: string;
  resourceId?: string;
  subpartidaId?: string;
  category: ApuCategory;
  descripcion: string;
  cuadrilla: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
}

export interface MetradoItem {
  id: string;
  descripcion: string;
  veces: string;
  largo: string;
  ancho: string;
  alto: string;
  parcial: string;
}

export interface BudgetSettings {
  gastosGeneralesPercent: string;
  utilidadPercent: string;
  igvPercent: string;
  includeIgv: boolean;
}

export interface PolynomialGroup {
  id: string;
  codigo: string;
  descripcion: string;
  indice: string;
  categoria: ApuCategory;
  orden: number;
}

export interface BudgetRow {
  id: string;
  level: number;
  codificacion: string;
  descripcion: string;
  unidad: string;
  costo: string;
  metradoTradicional: string;
  metradoBim: string;
  tipoMetrado: string;
  reglaMetrado: string;
  rendimientoManoObra: string;
  rendimientoEquipos: string;
  apuItems: ApuItem[];
  metradoItems: MetradoItem[];
}

export interface AuditEntry {
  id: string;
  rowId: string;
  type: "field" | "structure";
  field: string;
  beforeValue: string;
  afterValue: string;
  beforeLevel: number | null;
  afterLevel: number | null;
  beforePartidaCode: string;
  afterPartidaCode: string;
  userName: string;
  timestamp: string;
}

export interface BudgetSnapshotSummary {
  rowCount: number;
  rootCount: number;
  leafCount: number;
  grandTotal: number;
  metradoTradicionalTotal: number;
  metradoBimTotal: number;
}

export interface BudgetSnapshot {
  id: string;
  name: string;
  rows: BudgetRow[];
  summary: BudgetSnapshotSummary;
  userName: string;
  createdAt: string;
  versionNumber: number;
  snapshotType: "manual" | "venta" | "meta" | "linea-base";
  baseSnapshotId: string | null;
}

export interface RevitExportRecord {
  id: string | number | null;
  uid: string;
  documentUid: string;
  modelGuid: string;
  modelPath: string;
  revitVersion: string;
  addinVersion: string;
  userName: string;
  exportedAt: string;
  createdAt: string;
  totalRows: number;
  totalQuantity: number;
  linkedItems: number;
}

export type BimJobTargetMode = "active-revit" | "cloud-model";
export type BimJobStatus = "queued" | "claimed" | "running" | "applying" | "completed" | "failed" | "cancelled";

export interface BimJobLogEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export interface BimJobRecord {
  id: string;
  projectId: string;
  targetMode: BimJobTargetMode;
  commandType: string;
  status: BimJobStatus;
  stage: string;
  percent: number;
  payload: Record<string, unknown>;
  modelIdentity: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string;
  createdBy: string;
  claimedBy: string;
  claimedAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  queueWaitSeconds: number;
  runSeconds: number;
  totalSeconds: number;
  logs: BimJobLogEntry[];
}

export interface BimBridgeDiagnostic {
  status: string;
  canClaim: boolean;
  autoClaimEnabled: boolean;
  signedIn: boolean;
  runnerBusy: boolean;
  hasIngestApiKey: boolean;
  pollSeconds: number;
  issues: string[];
}

export interface BimBridgePresenceSummary {
  online: boolean;
  onlineCount: number;
  knownCount: number;
  ttlSeconds: number;
  latestSeenAt: string;
  latestSeenAgeSeconds: number;
  latestBridgeId: string;
  latestRequestedBy: string;
  latestModelIdentity: Record<string, unknown>;
  latestDiagnostic: BimBridgeDiagnostic | null;
}

export interface BimJobQueueSummary {
  total: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  activeRevit: number;
  activeRevitQueued: number;
  activeRevitProcessing: number;
  cloudModel: number;
  cloudModelQueued: number;
  cloudModelProcessing: number;
  oldestQueuedAt: string;
  oldestQueuedAgeSeconds: number;
  oldestActiveRevitQueuedAt: string;
  oldestActiveRevitQueuedAgeSeconds: number;
  oldestActiveAt: string;
  latestCompletedAt: string;
  oldestActiveAgeSeconds: number;
  generatedAt: string;
  bridgePresence: BimBridgePresenceSummary;
}

export interface BudgetProject {
  id: string;
  name: string;
  rows: BudgetRow[];
  auditEntries: AuditEntry[];
  snapshots: BudgetSnapshot[];
  budgetSettings: BudgetSettings;
  polynomialGroups: PolynomialGroup[];
  unitCatalogItems: UnitCatalogItem[];
  resourceCatalogItems: ResourceCatalogItem[];
  latestRevitExport: RevitExportRecord | null;
  collapsedIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetState {
  currentProjectId: string | null;
  projects: BudgetProject[];
  storage?: string;
  storageLabel?: string;
}

export type ViewKey =
  | "itemizado"
  | "presupuesto"
  | "base-recursos"
  | "analisis-costos-unitarios"
  | "formula-polinomica"
  | "control-bim"
  | "auditoria"
  | "usuarios"
  | "exportaciones-rvt"
  | "exportacion-presupuesto";

export type AuditFilterKey = "all" | "today" | "structure" | "cost";

export type ThemeMode = "light" | "dark";
