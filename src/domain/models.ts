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
  snapshotType: "manual";
  baseSnapshotId: string | null;
}

export interface RevitExportRecord {
  id: string | number | null;
  uid: string;
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

export interface BudgetProject {
  id: string;
  name: string;
  rows: BudgetRow[];
  auditEntries: AuditEntry[];
  snapshots: BudgetSnapshot[];
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
  | "control-bim"
  | "auditoria"
  | "usuarios"
  | "exportaciones-rvt"
  | "exportacion-presupuesto";

export type AuditFilterKey = "all" | "today" | "structure" | "cost";

export type ThemeMode = "light" | "dark";
