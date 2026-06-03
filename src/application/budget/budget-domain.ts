import type {
  AccessUser,
  AuditEntry,
  BudgetProject,
  BudgetRow,
  BudgetSnapshot,
  BudgetSnapshotSummary,
  RevitExportRecord,
  ViewKey,
  WebAuthSession
} from "../../domain/models";
import {
  DEFAULT_METRADO_RULE,
  DEFAULT_OPERATOR_NAME,
  DEFAULT_USER_PROJECT_VIEW_KEYS,
  USER_PROJECT_VIEW_KEYS
} from "./budget-config";

type RowInput = Partial<BudgetRow> & Record<string, unknown>;
type ProjectInput = Partial<BudgetProject> & Record<string, unknown>;
type SnapshotInput = Partial<BudgetSnapshot> & Record<string, unknown>;
type AuditInput = Partial<AuditEntry> & Record<string, unknown>;

export interface VisibleBudgetEntry {
  row: BudgetRow;
  index: number;
  code: string;
}

export interface DuplicateMatch {
  row: BudgetRow;
  index: number;
  code: string;
}

export interface BimControlReport {
  leafEntries: VisibleBudgetEntry[];
  revitEntries: VisibleBudgetEntry[];
  readyEntries: VisibleBudgetEntry[];
  incompleteEntries: Array<VisibleBudgetEntry & { missingLabels: string[] }>;
  missingCodificationEntries: VisibleBudgetEntry[];
  duplicateCodificationKeys: string[];
  duplicateCodificationEntries: VisibleBudgetEntry[];
  metradoReceivedEntries: VisibleBudgetEntry[];
  differenceEntries: Array<VisibleBudgetEntry & {
    traditional: number;
    bim: number;
    difference: number;
  }>;
  totalMetradoBim: number;
  totalDifference: number;
  latestRevitExport: RevitExportRecord | null;
}

export interface BudgetComparison {
  baseSummary: BudgetSnapshotSummary;
  targetSummary: BudgetSnapshotSummary;
  deltas: BudgetSnapshotSummary;
  deltaPercent: number;
  counts: {
    added: number;
    removed: number;
    updated: number;
  };
  changes: Array<{
    type: "added" | "removed" | "updated";
    title: string;
    meta: string;
    detail: string;
  }>;
}

export interface BudgetVersion {
  id: string;
  name: string;
  rows: BudgetRow[];
  summary: BudgetSnapshotSummary;
  userName: string;
  createdAt: string;
  versionNumber: number;
  snapshotType: "manual" | "current";
  baseSnapshotId: string | null;
}

export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createRow(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: createId("row"),
    level: 0,
    codificacion: "",
    descripcion: "",
    unidad: "",
    costo: "",
    metradoTradicional: "",
    metradoBim: "",
    tipoMetrado: "",
    reglaMetrado: "",
    ...overrides
  };
}

export function createDefaultProject(name = "Proyecto 1"): BudgetProject {
  const now = new Date().toISOString();
  return normalizeProjectRecord({
    id: createId("project"),
    name,
    rows: [createRow()],
    auditEntries: [],
    snapshots: [],
    collapsedIds: [],
    createdAt: now,
    updatedAt: now
  });
}

export function normalizeProjectRecord(projectInput: Partial<BudgetProject> | Record<string, unknown> | null | undefined, index = 0): BudgetProject {
  const project = (projectInput ?? {}) as ProjectInput;
  const rows = cloneRows(asArray<RowInput>(project.rows));
  const normalizedRows = rows.length > 0 ? rows : [createRow()];
  const createdAt = normalizeIsoString(project.createdAt);
  return {
    id: sanitizeIdentifier(project.id, createId("project")),
    name: sanitizeProjectName(project.name) || `Proyecto ${index + 1}`,
    rows: normalizedRows,
    auditEntries: normalizeAuditEntries(asArray<AuditInput>(project.auditEntries)),
    snapshots: normalizeSnapshots(asArray<SnapshotInput>(project.snapshots)),
    latestRevitExport: normalizeRevitExportRecord(project.latestRevitExport),
    collapsedIds: asArray<unknown>(project.collapsedIds).filter(isString),
    createdAt,
    updatedAt: normalizeIsoString(project.updatedAt || createdAt)
  };
}

export function normalizeProjectsPayload(payload: unknown) {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const projects = asArray<ProjectInput>(data.projects).map((project, index) => normalizeProjectRecord(project, index));
  if (projects.length === 0) {
    const project = createDefaultProject();
    return {
      currentProjectId: project.id,
      projects: [project],
      storage: "mysql",
      storageLabel: "MySQL"
    };
  }
  const requestedId = typeof data.currentProjectId === "string" ? data.currentProjectId : "";
  const currentProjectId = projects.some((project) => project.id === requestedId)
    ? requestedId
    : projects[0].id;
  return {
    currentProjectId,
    projects,
    storage: typeof data.storage === "string" ? data.storage : "mysql",
    storageLabel: typeof data.storageLabel === "string" ? data.storageLabel : "MySQL"
  };
}

export function serializeProject(project: BudgetProject): BudgetProject {
  return normalizeProjectRecord(project);
}

export function cloneRows(rowsInput: Array<RowInput | BudgetRow> | unknown): BudgetRow[] {
  return normalizeRows(
    asArray<RowInput>(rowsInput).map((row) => {
      const tipoMetrado = sanitizeTipoMetrado(row.tipoMetrado ?? "");
      return {
        ...createRow(),
        ...row,
        id: sanitizeIdentifier(row.id, createId("row")),
        codificacion: sanitizeCodificacion(row.codificacion),
        descripcion: sanitizeDescripcion(row.descripcion),
        unidad: sanitizeUnidadPartida(row.unidad),
        costo: normalizeDecimalString(row.costo),
        metradoTradicional: normalizeDecimalString(row.metradoTradicional ?? row.metrado),
        metradoBim: normalizeDecimalString(row.metradoBim),
        tipoMetrado,
        reglaMetrado: getReglaMetradoForTipo(tipoMetrado, row.reglaMetrado)
      };
    })
  );
}

export function normalizeRows(rows: BudgetRow[]): BudgetRow[] {
  let previousLevel = 0;
  return rows.map((row, index) => {
    const normalized = {
      ...row,
      level: sanitizeLevel(row.level)
    };
    if (index === 0) {
      normalized.level = 0;
    } else {
      normalized.level = Math.min(normalized.level, previousLevel + 1);
    }
    previousLevel = normalized.level;
    return normalized;
  });
}

export function normalizeAuditEntries(entriesInput: Array<AuditInput | AuditEntry> | unknown): AuditEntry[] {
  return asArray<AuditInput>(entriesInput)
    .filter((entry) => entry && typeof entry === "object" && typeof entry.rowId === "string")
    .map((entry) => ({
      id: sanitizeIdentifier(entry.id, createId("audit")),
      rowId: String(entry.rowId),
      type: entry.type === "structure" ? "structure" : "field",
      field: String(entry.field || ""),
      beforeValue: String(entry.beforeValue ?? ""),
      afterValue: String(entry.afterValue ?? ""),
      beforeLevel: entry.beforeLevel === null || entry.beforeLevel === undefined ? null : Number(entry.beforeLevel),
      afterLevel: entry.afterLevel === null || entry.afterLevel === undefined ? null : Number(entry.afterLevel),
      beforePartidaCode: String(entry.beforePartidaCode || ""),
      afterPartidaCode: String(entry.afterPartidaCode || ""),
      userName: sanitizeOperatorName(entry.userName || DEFAULT_OPERATOR_NAME),
      timestamp: normalizeIsoString(entry.timestamp)
    }));
}

export function normalizeSnapshots(entriesInput: Array<SnapshotInput | BudgetSnapshot> | unknown): BudgetSnapshot[] {
  const normalized = asArray<SnapshotInput>(entriesInput)
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const rows = cloneRows(entry.rows);
      const normalizedRows = rows.length > 0 ? rows : [createRow()];
      const parsedVersion = Number.parseInt(String(entry.versionNumber ?? ""), 10);
      return {
        id: sanitizeIdentifier(entry.id, createId("snapshot")),
        name: sanitizeSnapshotName(entry.name) || `Foto ${index + 1}`,
        rows: normalizedRows,
        summary: buildSnapshotSummary(normalizedRows),
        userName: sanitizeOperatorName(entry.userName || DEFAULT_OPERATOR_NAME),
        createdAt: normalizeIsoString(entry.createdAt),
        versionNumber: Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : 0,
        snapshotType: "manual" as const,
        baseSnapshotId: typeof entry.baseSnapshotId === "string" ? entry.baseSnapshotId : null
      };
    });
  assignMissingSnapshotVersionNumbers(normalized);
  return normalized;
}

export function normalizeRevitExportRecord(entryInput: unknown): RevitExportRecord | null {
  if (!entryInput || typeof entryInput !== "object") {
    return null;
  }
  const entry = entryInput as Record<string, unknown>;
  return {
    id: (typeof entry.id === "string" || typeof entry.id === "number") ? entry.id : null,
    uid: String(entry.uid || ""),
    modelPath: String(entry.modelPath || ""),
    revitVersion: String(entry.revitVersion || ""),
    addinVersion: String(entry.addinVersion || ""),
    userName: sanitizeOperatorName(entry.userName || "Revit Addin"),
    exportedAt: String(entry.exportedAt || entry.createdAt || ""),
    createdAt: String(entry.createdAt || entry.exportedAt || ""),
    totalRows: Number.parseInt(String(entry.totalRows || 0), 10) || 0,
    totalQuantity: parseDecimal(entry.totalQuantity),
    linkedItems: Number.parseInt(String(entry.linkedItems || 0), 10) || 0
  };
}

export function assignMissingSnapshotVersionNumbers(snapshots: BudgetSnapshot[]) {
  const usedVersions = new Set<number>();
  snapshots.forEach((snapshot) => {
    if (Number.isInteger(snapshot.versionNumber) && snapshot.versionNumber > 0 && !usedVersions.has(snapshot.versionNumber)) {
      usedVersions.add(snapshot.versionNumber);
      return;
    }
    snapshot.versionNumber = 0;
  });

  let nextVersion = 1;
  snapshots
    .filter((snapshot) => snapshot.versionNumber === 0)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .forEach((snapshot) => {
      while (usedVersions.has(nextVersion)) {
        nextVersion += 1;
      }
      snapshot.versionNumber = nextVersion;
      usedVersions.add(nextVersion);
      nextVersion += 1;
    });
}

export function buildPartidaCodes(rows: BudgetRow[]) {
  const counters: number[] = [];
  return rows.map((row) => {
    counters[row.level] = (counters[row.level] || 0) + 1;
    counters.length = row.level + 1;
    return counters.join(".");
  });
}

export function rowHasChildren(rows: BudgetRow[], index: number) {
  return index < rows.length - 1 && rows[index + 1].level > rows[index].level;
}

export function getParentIndex(rows: BudgetRow[], index: number) {
  const currentRow = rows[index];
  const level = currentRow ? currentRow.level : 0;
  if (level === 0) return -1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (rows[cursor].level === level - 1) return cursor;
  }
  return -1;
}

export function getSiblingStarts(rows: BudgetRow[], index: number) {
  const parentIndex = getParentIndex(rows, index);
  const level = rows[index]?.level ?? 0;
  const starts: number[] = [];
  rows.forEach((row, cursor) => {
    if (row.level === level && getParentIndex(rows, cursor) === parentIndex) {
      starts.push(cursor);
    }
  });
  return starts;
}

export function getBranchEnd(rows: BudgetRow[], startIndex: number) {
  const rootLevel = rows[startIndex]?.level ?? 0;
  let cursor = startIndex + 1;
  while (cursor < rows.length && rows[cursor].level > rootLevel) {
    cursor += 1;
  }
  return cursor - 1;
}

export function insertAtArray<T>(items: T[], index: number, item: T) {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

export function moveBranch(rowsInput: BudgetRow[], startIndex: number, direction: -1 | 1) {
  const rows = cloneRows(rowsInput);
  if (startIndex < 0 || startIndex >= rows.length) return null;
  const branchEnd = getBranchEnd(rows, startIndex);
  const branch = rows.slice(startIndex, branchEnd + 1);

  if (direction < 0) {
    const siblings = getSiblingStarts(rows, startIndex);
    const currentSiblingPosition = siblings.indexOf(startIndex);
    if (currentSiblingPosition <= 0) return null;
    const previousStart = siblings[currentSiblingPosition - 1];
    const beforePrevious = rows.slice(0, previousStart);
    const previousBranch = rows.slice(previousStart, startIndex);
    const after = rows.slice(branchEnd + 1);
    return normalizeRows([...beforePrevious, ...branch, ...previousBranch, ...after]);
  }

  const siblings = getSiblingStarts(rows, startIndex);
  const currentSiblingPosition = siblings.indexOf(startIndex);
  if (currentSiblingPosition === -1 || currentSiblingPosition >= siblings.length - 1) return null;
  const nextStart = siblings[currentSiblingPosition + 1];
  const nextEnd = getBranchEnd(rows, nextStart);
  const before = rows.slice(0, startIndex);
  const nextBranch = rows.slice(nextStart, nextEnd + 1);
  const after = rows.slice(nextEnd + 1);
  return normalizeRows([...before, ...nextBranch, ...branch, ...after]);
}

export function shiftBranch(rowsInput: BudgetRow[], startIndex: number, delta: -1 | 1) {
  const rows = cloneRows(rowsInput);
  if (startIndex < 0 || startIndex >= rows.length) return null;
  if (delta < 0 && rows[startIndex].level === 0) return null;
  if (delta > 0 && startIndex === 0) return null;
  if (delta > 0 && rows[startIndex].level > rows[startIndex - 1].level) return null;

  const branchEnd = getBranchEnd(rows, startIndex);
  const nextRows = rows.map((row, index) => (
    index >= startIndex && index <= branchEnd
      ? { ...row, level: Math.max(0, row.level + delta) }
      : row
  ));
  return normalizeRows(nextRows);
}

export function getVisibleEntries(
  rows: BudgetRow[],
  codes = buildPartidaCodes(rows),
  filterQuery = "",
  options: { respectCollapsed?: boolean; collapsedIds?: Set<string> } = {}
): VisibleBudgetEntry[] {
  const query = normalizeText(filterQuery).trim();
  const collapsedIds = options.collapsedIds ?? new Set<string>();
  return rows.reduce<VisibleBudgetEntry[]>((entries, row, index) => {
    if (options.respectCollapsed && isHiddenByCollapsedAncestor(rows, index, collapsedIds)) {
      return entries;
    }
    const code = codes[index] || "";
    if (!query) {
      entries.push({ row, index, code });
      return entries;
    }
    const searchable = normalizeText([
      code,
      row.codificacion,
      row.descripcion,
      row.unidad,
      row.tipoMetrado,
      row.reglaMetrado
    ].join(" "));
    if (searchable.includes(query)) {
      entries.push({ row, index, code });
    }
    return entries;
  }, []);
}

export function isHiddenByCollapsedAncestor(rows: BudgetRow[], index: number, collapsedIds: Set<string>) {
  const row = rows[index];
  if (!row) return false;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = rows[cursor];
    if (candidate.level < row.level && collapsedIds.has(candidate.id)) {
      return true;
    }
  }
  return false;
}

export function pruneCollapsedIds(rows: BudgetRow[], collapsedIds: Set<string>) {
  const collapsibleIds = new Set(
    rows.filter((_, index) => rowHasChildren(rows, index)).map((row) => row.id)
  );
  return new Set(Array.from(collapsedIds).filter((id) => collapsibleIds.has(id)));
}

export function collectStructureAuditEntries(
  previousRows: BudgetRow[],
  nextRows: BudgetRow[],
  operatorName: string
) {
  const previousCodes = buildPartidaCodes(previousRows);
  const nextCodes = buildPartidaCodes(nextRows);
  return nextRows.reduce<AuditEntry[]>((entries, row, index) => {
    const previousIndex = previousRows.findIndex((entry) => entry.id === row.id);
    if (previousIndex === -1) return entries;
    const previousRow = previousRows[previousIndex];
    const previousCode = previousCodes[previousIndex] || "";
    const nextCode = nextCodes[index] || "";
    const previousLevel = previousRow.level + 1;
    const nextLevel = row.level + 1;
    if (previousLevel === nextLevel && previousCode === nextCode) return entries;
    entries.push(createStructureAuditEntry(row.id, previousLevel, nextLevel, previousCode, nextCode, operatorName));
    return entries;
  }, []);
}

export function createFieldAuditEntry(
  rowId: string,
  field: string,
  beforeValue: string,
  afterValue: string,
  operatorName: string
): AuditEntry {
  return {
    id: createId("audit"),
    rowId,
    type: "field",
    field,
    beforeValue,
    afterValue,
    beforeLevel: null,
    afterLevel: null,
    beforePartidaCode: "",
    afterPartidaCode: "",
    userName: sanitizeOperatorName(operatorName),
    timestamp: new Date().toISOString()
  };
}

export function createStructureAuditEntry(
  rowId: string,
  beforeLevel: number,
  afterLevel: number,
  beforeCode: string,
  afterCode: string,
  operatorName: string
): AuditEntry {
  return {
    id: createId("audit"),
    rowId,
    type: "structure",
    field: "estructura",
    beforeValue: "",
    afterValue: "",
    beforeLevel,
    afterLevel,
    beforePartidaCode: beforeCode,
    afterPartidaCode: afterCode,
    userName: sanitizeOperatorName(operatorName),
    timestamp: new Date().toISOString()
  };
}

export function isHeadingRow(rows: BudgetRow[], row: BudgetRow, index: number) {
  if (rowHasChildren(rows, index)) return true;
  return row.level <= 1
    && !String(row.unidad || "").trim()
    && !String(row.tipoMetrado || "").trim()
    && !String(row.reglaMetrado || "").trim()
    && parseDecimal(row.costo) === 0
    && parseDecimal(row.metradoTradicional) === 0
    && parseDecimal(row.metradoBim) === 0;
}

export function isLeafOnlyField(fieldName: string | undefined) {
  return ["costo", "metradoTradicional", "metradoBim", "tipoMetrado", "reglaMetrado"].includes(String(fieldName || ""));
}

export function isLeafValueField(fieldName: string | undefined) {
  return ["costo", "metradoTradicional", "metradoBim"].includes(String(fieldName || ""));
}

export function isAuditableField(fieldName: string | undefined) {
  return [
    "codificacion",
    "descripcion",
    "unidad",
    "costo",
    "metradoTradicional",
    "metradoBim",
    "tipoMetrado",
    "reglaMetrado"
  ].includes(String(fieldName || ""));
}

export function sanitizeFieldValue(fieldName: string, value: unknown) {
  if (fieldName === "codificacion") return sanitizeCodificacion(value);
  if (fieldName === "descripcion") return sanitizeDescripcion(value);
  if (fieldName === "unidad") return sanitizeUnidadPartida(value);
  if (fieldName === "tipoMetrado") return sanitizeTipoMetrado(value);
  if (fieldName === "reglaMetrado") return sanitizeReglaMetrado(value);
  return String(value ?? "");
}

export function getDisplayValueForField(rows: BudgetRow[], row: BudgetRow, rowIndex: number, fieldName = "") {
  if (isLeafOnlyField(fieldName) && rowHasChildren(rows, rowIndex)) {
    return "";
  }
  if (fieldName === "reglaMetrado") {
    return getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado);
  }
  return String((row as unknown as Record<string, unknown>)[fieldName] ?? "");
}

export function getGrupoTablasForRow(rows: BudgetRow[], rowIndex: number, codes = buildPartidaCodes(rows)) {
  if (rowIndex < 0 || rowIndex >= rows.length) return "";
  const parentIndex = getParentIndex(rows, rowIndex);
  if (parentIndex < 0) return "";
  const parentCode = String(codes[parentIndex] || "").trim();
  const parentDescription = sanitizeDescripcion(rows[parentIndex]?.descripcion || "").trim().toUpperCase();
  return [parentCode, parentDescription].filter(Boolean).join(" ").trim();
}

export function getRowPartialAtIndexForRows(rows: BudgetRow[], rowIndex: number): number {
  const row = rows[rowIndex];
  if (!row) return 0;
  if (!rowHasChildren(rows, rowIndex)) {
    return getLeafRowPartial(row);
  }
  const branchEnd = getBranchEnd(rows, rowIndex);
  return rows.reduce((sum, entry, index) => {
    if (index <= rowIndex || index > branchEnd || rowHasChildren(rows, index)) {
      return sum;
    }
    return sum + getLeafRowPartial(entry);
  }, 0);
}

export function getLeafRowPartial(row: BudgetRow) {
  const costo = parseDecimal(row.costo);
  const metradoTradicional = parseDecimal(row.metradoTradicional);
  const metradoBim = parseDecimal(row.metradoBim);
  return costo * (metradoTradicional + metradoBim);
}

export function getGrandTotalForRows(rows: BudgetRow[]) {
  return rows.reduce((sum, row, index) => (
    row.level === 0 ? sum + getRowPartialAtIndexForRows(rows, index) : sum
  ), 0);
}

export function buildSnapshotSummary(rowsInput: BudgetRow[]): BudgetSnapshotSummary {
  const safeRows = cloneRows(rowsInput);
  const rowCount = safeRows.length;
  const rootCount = safeRows.filter((row) => row.level === 0).length;
  return safeRows.reduce<BudgetSnapshotSummary>(
    (summary, row, index) => {
      if (!rowHasChildren(safeRows, index)) {
        summary.leafCount += 1;
        summary.metradoTradicionalTotal += parseDecimal(row.metradoTradicional);
        summary.metradoBimTotal += parseDecimal(row.metradoBim);
      }
      return summary;
    },
    {
      rowCount,
      rootCount,
      leafCount: 0,
      grandTotal: getGrandTotalForRows(safeRows),
      metradoTradicionalTotal: 0,
      metradoBimTotal: 0
    }
  );
}

export function createBudgetSnapshot(
  rows: BudgetRow[],
  snapshots: BudgetSnapshot[],
  name: string,
  operatorName: string
): BudgetSnapshot {
  const snapshotRows = cloneRows(rows);
  const previousSnapshot = getLatestSnapshot(snapshots);
  return {
    id: createId("snapshot"),
    versionNumber: getNextSnapshotVersionNumber(snapshots),
    name: sanitizeSnapshotName(name) || getDefaultSnapshotName(),
    rows: snapshotRows,
    summary: buildSnapshotSummary(snapshotRows),
    snapshotType: "manual",
    baseSnapshotId: previousSnapshot ? previousSnapshot.id : null,
    userName: sanitizeOperatorName(operatorName),
    createdAt: new Date().toISOString()
  };
}

export function getSnapshotsSortedNewestFirst(snapshots: BudgetSnapshot[]) {
  return [...snapshots].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getSnapshotsSortedOldestFirst(snapshots: BudgetSnapshot[]) {
  return [...snapshots].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function getLatestSnapshot(snapshots: BudgetSnapshot[]) {
  return getSnapshotsSortedNewestFirst(snapshots)[0] || null;
}

export function getPreviousSnapshot(snapshots: BudgetSnapshot[], snapshotId: string) {
  const sorted = getSnapshotsSortedOldestFirst(snapshots);
  const index = sorted.findIndex((snapshot) => snapshot.id === snapshotId);
  return index > 0 ? sorted[index - 1] : null;
}

export function getNextSnapshotVersionNumber(snapshots: BudgetSnapshot[]) {
  return snapshots.reduce((max, snapshot) => Math.max(max, snapshot.versionNumber || 0), 0) + 1;
}

export function getDefaultSnapshotName() {
  return `Foto ${new Date().toLocaleDateString("es-PE")}`;
}

export function getBudgetTimelineVersions(rows: BudgetRow[], snapshots: BudgetSnapshot[], operatorName: string): BudgetVersion[] {
  return [
    ...getSnapshotsSortedOldestFirst(snapshots).map<BudgetVersion>((snapshot) => ({
      ...snapshot,
      snapshotType: "manual"
    })),
    {
      id: "current",
      name: "Actual",
      rows: cloneRows(rows),
      summary: buildSnapshotSummary(rows),
      userName: sanitizeOperatorName(operatorName),
      createdAt: new Date().toISOString(),
      versionNumber: getNextSnapshotVersionNumber(snapshots),
      snapshotType: "current",
      baseSnapshotId: getLatestSnapshot(snapshots)?.id || null
    }
  ];
}

export function getBudgetVersionLabel(version: BudgetVersion) {
  if (version.id === "current") return "Actual";
  return `V${version.versionNumber} - ${version.name}`;
}

export function buildBudgetComparison(baseVersion: BudgetVersion, targetVersion: BudgetVersion): BudgetComparison {
  const baseSummary = baseVersion.summary || buildSnapshotSummary(baseVersion.rows);
  const targetSummary = targetVersion.summary || buildSnapshotSummary(targetVersion.rows);
  const baseMap = buildComparableBudgetMap(baseVersion.rows);
  const targetMap = buildComparableBudgetMap(targetVersion.rows);
  const changes: BudgetComparison["changes"] = [];

  targetMap.forEach((targetItem, key) => {
    const baseItem = baseMap.get(key);
    if (!baseItem) {
      changes.push({
        type: "added",
        title: `Agregada ${targetItem.codigoPartida}`,
        meta: targetItem.descripcion || targetItem.codificacion || "Sin descripcion",
        detail: `Parcial ${formatAmount(targetItem.parcial)}`
      });
      return;
    }
    if (didComparableBudgetItemChange(baseItem, targetItem)) {
      changes.push({
        type: "updated",
        title: `Editada ${targetItem.codigoPartida}`,
        meta: targetItem.descripcion || targetItem.codificacion || "Sin descripcion",
        detail: describeComparableBudgetChange(baseItem, targetItem)
      });
    }
  });

  baseMap.forEach((baseItem, key) => {
    if (!targetMap.has(key)) {
      changes.push({
        type: "removed",
        title: `Eliminada ${baseItem.codigoPartida}`,
        meta: baseItem.descripcion || baseItem.codificacion || "Sin descripcion",
        detail: `Parcial ${formatAmount(baseItem.parcial)}`
      });
    }
  });

  const deltas: BudgetSnapshotSummary = {
    rowCount: targetSummary.rowCount - baseSummary.rowCount,
    rootCount: targetSummary.rootCount - baseSummary.rootCount,
    leafCount: targetSummary.leafCount - baseSummary.leafCount,
    grandTotal: targetSummary.grandTotal - baseSummary.grandTotal,
    metradoTradicionalTotal: targetSummary.metradoTradicionalTotal - baseSummary.metradoTradicionalTotal,
    metradoBimTotal: targetSummary.metradoBimTotal - baseSummary.metradoBimTotal
  };
  return {
    baseSummary,
    targetSummary,
    deltas,
    deltaPercent: getDeltaPercent(baseSummary.grandTotal, targetSummary.grandTotal),
    counts: {
      added: changes.filter((change) => change.type === "added").length,
      removed: changes.filter((change) => change.type === "removed").length,
      updated: changes.filter((change) => change.type === "updated").length
    },
    changes
  };
}

export function buildComparableBudgetMap(rowsInput: BudgetRow[]) {
  const rows = cloneRows(rowsInput);
  const codes = buildPartidaCodes(rows);
  return rows.reduce<Map<string, {
    key: string;
    codigoPartida: string;
    codificacion: string;
    descripcion: string;
    unidad: string;
    costo: number;
    metradoTradicional: number;
    metradoBim: number;
    parcial: number;
  }>>((map, row, index) => {
    const key = normalizeCodificacionKey(row.codificacion) || `${codes[index]}:${normalizeDescripcionKey(row.descripcion)}`;
    map.set(key, {
      key,
      codigoPartida: codes[index] || "",
      codificacion: row.codificacion,
      descripcion: row.descripcion,
      unidad: row.unidad,
      costo: parseDecimal(row.costo),
      metradoTradicional: parseDecimal(row.metradoTradicional),
      metradoBim: parseDecimal(row.metradoBim),
      parcial: getRowPartialAtIndexForRows(rows, index)
    });
    return map;
  }, new Map());
}

function didComparableBudgetItemChange(
  baseItem: ReturnType<typeof buildComparableBudgetMap> extends Map<string, infer Item> ? Item : never,
  targetItem: ReturnType<typeof buildComparableBudgetMap> extends Map<string, infer Item> ? Item : never
) {
  return baseItem.descripcion !== targetItem.descripcion
    || baseItem.unidad !== targetItem.unidad
    || !areAmountsEqual(baseItem.costo, targetItem.costo)
    || !areAmountsEqual(baseItem.metradoTradicional, targetItem.metradoTradicional)
    || !areAmountsEqual(baseItem.metradoBim, targetItem.metradoBim)
    || !areAmountsEqual(baseItem.parcial, targetItem.parcial);
}

function describeComparableBudgetChange(
  baseItem: ReturnType<typeof buildComparableBudgetMap> extends Map<string, infer Item> ? Item : never,
  targetItem: ReturnType<typeof buildComparableBudgetMap> extends Map<string, infer Item> ? Item : never
) {
  const changes = [];
  if (!areAmountsEqual(baseItem.parcial, targetItem.parcial)) {
    changes.push(`Parcial ${formatAmount(baseItem.parcial)} -> ${formatAmount(targetItem.parcial)}`);
  }
  if (!areAmountsEqual(baseItem.costo, targetItem.costo)) {
    changes.push(`Costo ${formatAmount(baseItem.costo)} -> ${formatAmount(targetItem.costo)}`);
  }
  if (!areAmountsEqual(baseItem.metradoTradicional, targetItem.metradoTradicional)) {
    changes.push(`Metrado trad. ${formatAmount(baseItem.metradoTradicional)} -> ${formatAmount(targetItem.metradoTradicional)}`);
  }
  if (!areAmountsEqual(baseItem.metradoBim, targetItem.metradoBim)) {
    changes.push(`Metrado BIM ${formatAmount(baseItem.metradoBim)} -> ${formatAmount(targetItem.metradoBim)}`);
  }
  if (baseItem.descripcion !== targetItem.descripcion) {
    changes.push("Descripcion editada");
  }
  return changes.join(" | ") || "Datos actualizados";
}

export function buildBimControlReport(rows: BudgetRow[], project: BudgetProject | null, codes = buildPartidaCodes(rows)): BimControlReport {
  const leafEntries = rows
    .map((row, index) => ({ row, index, code: codes[index] || "" }))
    .filter((entry) => !rowHasChildren(rows, entry.index));
  const revitEntries = leafEntries.filter((entry) => isRevitMetradoType(entry.row.tipoMetrado));
  const codificationGroups = new Map<string, VisibleBudgetEntry[]>();

  revitEntries.forEach((entry) => {
    const key = normalizeText(entry.row.codificacion).trim();
    if (!key) return;
    const group = codificationGroups.get(key) || [];
    group.push(entry);
    codificationGroups.set(key, group);
  });

  const duplicateCodificationKeys = Array.from(codificationGroups.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([key]) => key);
  const duplicateKeySet = new Set(duplicateCodificationKeys);
  const duplicateCodificationEntries = revitEntries.filter((entry) => {
    const key = normalizeText(entry.row.codificacion).trim();
    return Boolean(key && duplicateKeySet.has(key));
  });
  const incompleteEntries = revitEntries
    .map((entry) => ({ ...entry, missingLabels: getMissingBimReadyLabels(entry.row) }))
    .filter((entry) => entry.missingLabels.length > 0);
  const incompleteIds = new Set(incompleteEntries.map((entry) => entry.row.id));
  const duplicateIds = new Set(duplicateCodificationEntries.map((entry) => entry.row.id));
  const readyEntries = revitEntries.filter((entry) => !incompleteIds.has(entry.row.id) && !duplicateIds.has(entry.row.id));
  const missingCodificationEntries = revitEntries.filter((entry) => !String(entry.row.codificacion || "").trim());
  const metradoReceivedEntries = revitEntries.filter((entry) => parseDecimal(entry.row.metradoBim) > 0);
  const differenceEntries = revitEntries
    .map((entry) => {
      const traditional = parseDecimal(entry.row.metradoTradicional);
      const bim = parseDecimal(entry.row.metradoBim);
      return {
        ...entry,
        traditional,
        bim,
        difference: bim - traditional
      };
    })
    .filter((entry) => Math.abs(entry.difference) > 0.000001);

  return {
    leafEntries,
    revitEntries,
    readyEntries,
    incompleteEntries,
    missingCodificationEntries,
    duplicateCodificationKeys,
    duplicateCodificationEntries,
    metradoReceivedEntries,
    differenceEntries,
    totalMetradoBim: revitEntries.reduce((sum, entry) => sum + parseDecimal(entry.row.metradoBim), 0),
    totalDifference: differenceEntries.reduce((sum, entry) => sum + entry.difference, 0),
    latestRevitExport: project?.latestRevitExport || null
  };
}

export function getMissingBimReadyLabels(row: BudgetRow) {
  const missing = [];
  if (!String(row.codificacion || "").trim()) missing.push("Codificacion");
  if (!String(row.descripcion || "").trim()) missing.push("Descripcion");
  if (!String(row.unidad || "").trim()) missing.push("Unidad");
  if (!String(row.costo ?? "").trim()) missing.push("Costo");
  if (!String(getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado) || "").trim()) missing.push("Regla de metrado");
  return missing;
}

export function buildExportRowsForMode(rows: BudgetRow[], rootIndex: number, codes: string[], exportMode: "rvt" | "presupuesto") {
  const branchEnd = getBranchEnd(rows, rootIndex);
  const scopedRows = rows.slice(rootIndex, branchEnd + 1);
  if (exportMode === "presupuesto") {
    return scopedRows.map((row, offset) => {
      const absoluteIndex = rootIndex + offset;
      const metradoTradicional = parseDecimal(row.metradoTradicional);
      const metradoBim = parseDecimal(row.metradoBim);
      return {
        codificacion: row.codificacion || "",
        codigoPartida: codes[absoluteIndex] || "",
        descripcion: row.descripcion || "",
        unidad: row.unidad || "",
        costo: parseDecimal(row.costo),
        metradoTradicional,
        metradoBim,
        parcial: getRowPartialAtIndexForRows(rows, absoluteIndex),
        tipoMetrado: row.tipoMetrado || "",
        reglaMetrado: getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado),
        grupoTablas: getGrupoTablasForRow(rows, absoluteIndex, codes)
      };
    });
  }

  return scopedRows.reduce<Array<Record<string, string | number>>>((exportRows, row, offset) => {
    if (!isRevitMetradoType(row.tipoMetrado)) return exportRows;
    const absoluteIndex = rootIndex + offset;
    exportRows.push({
      codificacion: row.codificacion || "",
      codigoPartida: codes[absoluteIndex] || "",
      descripcion: row.descripcion || "",
      unidad: row.unidad || "",
      costo: parseDecimal(row.costo),
      reglaMetrado: getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado),
      grupoTablas: getGrupoTablasForRow(rows, absoluteIndex, codes)
    });
    return exportRows;
  }, []);
}

export function getRootExportLabel(row: BudgetRow, code: string) {
  return String(row.descripcion || "").trim()
    || String(row.codificacion || "").trim()
    || `Partida ${code}`;
}

export function getFirstAllowedViewKey(session: WebAuthSession | null, projectId: string | null) {
  const firstProjectView = USER_PROJECT_VIEW_KEYS.find((viewKey) => canSessionAccessView(session, projectId, viewKey));
  if (firstProjectView) return firstProjectView;
  return canSessionAccessView(session, projectId, "usuarios") ? "usuarios" : "itemizado";
}

export function canSessionAccessView(session: WebAuthSession | null, projectId: string | null, viewKey: ViewKey) {
  if (viewKey === "usuarios") {
    return getSessionRole(session) === "superadmin";
  }
  if (!USER_PROJECT_VIEW_KEYS.includes(viewKey)) {
    return true;
  }
  return getSessionProjectViewKeys(session, projectId).includes(viewKey);
}

export function getSessionProjectViewKeys(session: WebAuthSession | null, projectId: string | null) {
  if (!session?.required || !session.authenticated) {
    return [...DEFAULT_USER_PROJECT_VIEW_KEYS];
  }
  if (getSessionRole(session) === "superadmin") {
    return [...DEFAULT_USER_PROJECT_VIEW_KEYS];
  }
  if (!projectId) return [];
  const access = session.viewAccessByProject || {};
  const keys = access[projectId] || [];
  return keys.filter((key): key is ViewKey => USER_PROJECT_VIEW_KEYS.includes(key as ViewKey));
}

export function getSessionRole(session: WebAuthSession | null) {
  return String(session?.role || "").trim().toLowerCase();
}

export function canSessionWriteProject(session: WebAuthSession | null) {
  if (!session?.required || !session.authenticated) return true;
  return ["editor", "admin", "superadmin"].includes(getSessionRole(session));
}

export function getSessionAssignedProjects(projects: BudgetProject[], session: WebAuthSession | null) {
  if (!session?.required || !session.authenticated) return projects;
  if (getSessionRole(session) === "superadmin") return projects;
  const allowedIds = new Set((session.projectIds || []).map((projectId) => String(projectId).trim()).filter(Boolean));
  if (allowedIds.has("*")) return projects;
  return projects.filter((project) => allowedIds.has(project.id));
}

export function getUserProjectViewKeys(user: AccessUser | null | undefined, projectId: string) {
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "superadmin") return [...DEFAULT_USER_PROJECT_VIEW_KEYS];
  return (user?.viewAccessByProject?.[projectId] || []).filter((key): key is ViewKey => (
    USER_PROJECT_VIEW_KEYS.includes(key as ViewKey)
  ));
}

export function getProjectMembers(users: AccessUser[], projectId: string) {
  return users.filter((user) => (
    user.projectIds.includes("*") || user.projectIds.includes(projectId)
  ));
}

export function upsertAccessUser(users: AccessUser[], patch: Partial<AccessUser> & { email: string }) {
  const email = String(patch.email || "").trim().toLowerCase();
  if (!email) return users;

  const now = new Date().toISOString();
  const buildNextUser = (user?: AccessUser): AccessUser => ({
    id: patch.id ?? user?.id ?? email,
    email,
    displayName: patch.displayName ?? user?.displayName ?? email,
    role: patch.role ?? user?.role ?? "viewer",
    active: patch.active ?? user?.active ?? true,
    projectIds: patch.projectIds ?? user?.projectIds ?? [],
    viewAccessByProject: patch.viewAccessByProject ?? user?.viewAccessByProject ?? {},
    profileImageUrl: patch.profileImageUrl ?? user?.profileImageUrl,
    createdAt: patch.createdAt ?? user?.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now
  });

  let wasUpdated = false;
  const nextUsers = users.map((user) => {
    if (user.email.trim().toLowerCase() !== email) return user;
    wasUpdated = true;
    return buildNextUser(user);
  });

  return wasUpdated ? nextUsers : [buildNextUser(), ...nextUsers];
}

export function restoreAccessUserSnapshot(users: AccessUser[], emailInput: string, snapshot: AccessUser | null) {
  const email = String(emailInput || "").trim().toLowerCase();
  if (!email) return users;
  if (!snapshot) return users.filter((user) => user.email.trim().toLowerCase() !== email);
  return upsertAccessUser(users, snapshot);
}

export function buildUserViewAccessByProject(
  user: AccessUser | null,
  projectIds: string[],
  role: string,
  projectId: string,
  viewKeys: string[]
) {
  if (role === "superadmin") {
    return { "*": [...DEFAULT_USER_PROJECT_VIEW_KEYS] };
  }
  const nextAccess: Record<string, string[]> = {};
  projectIds.forEach((id) => {
    const existing = user?.viewAccessByProject?.[id] || DEFAULT_USER_PROJECT_VIEW_KEYS;
    nextAccess[id] = id === projectId
      ? viewKeys.filter((key) => USER_PROJECT_VIEW_KEYS.includes(key as ViewKey))
      : [...existing];
  });
  return nextAccess;
}

export function parseDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeDecimalString(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}

export function formatAmount(value: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDateTime(timestamp: string) {
  if (!timestamp) return "Sin fecha";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatShortDate(timestamp: string) {
  if (!timestamp) return "Sin fecha";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function formatSignedAmount(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatAmount(value)}`;
}

export function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatAmount(value)}%`;
}

export function formatSignedInteger(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number.isFinite(value) ? Math.trunc(value) : 0}`;
}

export function getDeltaPercent(baseValue: number, targetValue: number) {
  if (Math.abs(baseValue) < 0.000001) {
    return Math.abs(targetValue) < 0.000001 ? 0 : 100;
  }
  return ((targetValue - baseValue) / Math.abs(baseValue)) * 100;
}

export function getDeltaToneClass(value: number | null) {
  if (value === null || Math.abs(value) < 0.000001) return "is-neutral";
  return value > 0 ? "is-positive" : "is-negative";
}

export function areAmountsEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.000001;
}

export function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function sanitizeCodificacion(value: unknown) {
  return sanitizeSingleLine(value).trim().replace(/\s+/g, " ");
}

export function sanitizeDescripcion(value: unknown) {
  return repairKnownEncodingArtifacts(sanitizeSingleLine(value));
}

export function repairKnownEncodingArtifacts(value: unknown) {
  const replacement = "\uFFFD";
  return String(value || "")
    .split(`HABILITACI${replacement}N`).join("HABILITACI\u00D3N")
    .split(`COLOCACI${replacement}N`).join("COLOCACI\u00D3N")
    .split(`INSTALACI${replacement}N`).join("INSTALACI\u00D3N")
    .split(`CIMENTACI${replacement}N`).join("CIMENTACI\u00D3N")
    .split(`ASF${replacement}LTICA`).join("ASF\u00C1LTICA")
    .split(`S${replacement}TANO`).join("S\u00D3TANO")
    .split(`MOVILIZACI${replacement}N`).join("MOVILIZACI\u00D3N")
    .split(`DESMOVILIZACI${replacement}N`).join("DESMOVILIZACI\u00D3N")
    .split(`ALBA${replacement}ILER${replacement}A`).join("ALBA\u00D1ILER\u00CDA")
    .split(`ALBA${replacement}ILERIA`).join("ALBA\u00D1ILERIA")
    .split(`GRADER${replacement}AS`).join("GRADER\u00CDAS")
    .split(`PERIM${replacement}TRICA`).join("PERIM\u00C9TRICA")
    .split(`CONTRACCI${replacement}N`).join("CONTRACCI\u00D3N")
    .split(`PA${replacement}OS`).join("PA\u00D1OS")
    .split(`PASES EN MURO ANCLADO ${replacement} 6"`).join("PASES EN MURO ANCLADO \u00D8 6\"")
    .split(`PA${replacement}ETEO`).join("PA\u00D1ETEO")
    .split(`PESTA${replacement}AS`).join("PESTA\u00D1AS")
    .split(`M${replacement}NIMO`).join("M\u00CDNIMO")
    .split(`EXCAVACI${replacement}N`).join("EXCAVACI\u00D3N");
}

export function normalizeCodificacionKey(value: unknown) {
  return normalizeText(sanitizeCodificacion(value)).trim();
}

export function normalizeDescripcionKey(value: unknown) {
  return normalizeText(sanitizeSingleLine(value)).trim().replace(/\s+/g, " ");
}

export function findDuplicateForField(rows: BudgetRow[], fieldName: string, value: unknown, excludedRowId: string): DuplicateMatch | null {
  const normalizer = fieldName === "descripcion" ? normalizeDescripcionKey : normalizeCodificacionKey;
  if (fieldName !== "descripcion" && fieldName !== "codificacion") return null;
  const candidateKey = normalizer(value);
  if (!candidateKey) return null;
  const partidaCodes = buildPartidaCodes(rows);
  const index = rows.findIndex((row) => row.id !== excludedRowId && normalizer((row as unknown as Record<string, unknown>)[fieldName]) === candidateKey);
  if (index === -1) return null;
  return { row: rows[index], index, code: partidaCodes[index] || "" };
}

export function getDuplicateFieldMessage(fieldName: string, partidaCode: string) {
  const label = fieldName === "descripcion"
    ? "La descripcion de partida"
    : "La codificacion";
  return `${label} ya existe en la partida ${partidaCode}.`;
}

export function sanitizeSingleLine(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ");
}

export function sanitizeFilename(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function sanitizeProjectName(value: unknown) {
  return sanitizeSingleLine(value).trim().replace(/\s+/g, " ").slice(0, 180);
}

export function sanitizeSnapshotName(value: unknown) {
  return sanitizeSingleLine(value).trim().replace(/\s+/g, " ").slice(0, 180);
}

export function sanitizeOperatorName(value: unknown) {
  return sanitizeSingleLine(value).trim().replace(/\s+/g, " ").slice(0, 120) || DEFAULT_OPERATOR_NAME;
}

export function sanitizeTipoMetrado(value: unknown) {
  const normalized = normalizeText(value).trim();
  if (normalized === "revit") return "Revit";
  if (normalized === "tradicional") return "Tradicional";
  return "";
}

export function sanitizeReglaMetrado(value: unknown) {
  const text = sanitizeSingleLine(value).trim();
  return text === DEFAULT_METRADO_RULE ? DEFAULT_METRADO_RULE : "";
}

export function isRevitMetradoType(value: unknown) {
  return normalizeText(value).trim() === "revit";
}

export function getReglaMetradoForTipo(tipoMetrado: unknown, value: unknown) {
  if (!isRevitMetradoType(tipoMetrado)) return "";
  return sanitizeReglaMetrado(value) || DEFAULT_METRADO_RULE;
}

export function sanitizeUnidadPartida(value: unknown) {
  return sanitizeSingleLine(value).trim();
}

export function sanitizeLevel(value: unknown) {
  const numeric = Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

export function sanitizeIdentifier(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return text || fallback;
}

export function normalizeIsoString(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
