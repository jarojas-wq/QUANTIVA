export const REVIT_IMPORT_ROW_FIELDS = [
  "id",
  "itemUid",
  "level",
  "codigoPartida",
  "codificacion",
  "descripcion",
  "unidad",
  "costo",
  "metradoBim",
  "tipoMetrado",
  "reglaMetrado",
  "rendimientoManoObra",
  "rendimientoEquipos",
];

export function buildRevitImportStateFromState(statePayload, searchParams = new URLSearchParams()) {
  const projects = Array.isArray(statePayload?.projects) ? statePayload.projects : [];
  const requestedProjectUid = normalizeIdentifier(
    readSearchParam(searchParams, "projectId") || readSearchParam(searchParams, "projectUid"),
    "",
  );
  const currentProjectId = normalizeIdentifier(statePayload?.currentProjectId, "");
  const projectUid = resolveExistingProjectUid(projects, requestedProjectUid || currentProjectId);
  const project = projects.find((candidate) => (
    normalizeProjectUid(candidate) === projectUid
  )) || projects[0] || null;

  return buildRevitImportStateFromProject(project);
}

export function buildRevitImportStateFromProject(projectInput) {
  if (!projectInput || typeof projectInput !== "object" || Array.isArray(projectInput)) {
    return createEmptyRevitImportState();
  }

  const projectId = normalizeProjectUid(projectInput);
  if (!projectId) {
    return createEmptyRevitImportState();
  }

  const projectName = normalizeText(projectInput.name || projectInput.projectName || projectInput.project_name, "");
  const rows = normalizeRevitImportRows(projectInput.rows);
  const project = {
    id: projectId,
    name: projectName,
    rows,
  };

  return {
    currentProjectId: projectId,
    projectId,
    projectName,
    project,
    rows,
  };
}

export function normalizeRevitImportRows(rowsInput) {
  const rows = Array.isArray(rowsInput) ? rowsInput : [];
  const counters = [];

  return rows.map((row, index) => normalizeRevitImportRow(row, index, counters));
}

export function normalizeRevitImportRow(rowInput, index = 0, countersInput = []) {
  const source = rowInput && typeof rowInput === "object" && !Array.isArray(rowInput)
    ? rowInput
    : {};
  const level = Math.max(0, Number.parseInt(source.level || 0, 10) || 0);
  const codigoPartida = getNextCodigoPartida(level, countersInput);
  const itemUid = normalizeIdentifier(source.itemUid || source.id || source.rowId, "");

  return {
    id: normalizeIdentifier(source.id || source.itemUid || source.rowId, ""),
    itemUid,
    level,
    codigoPartida,
    codificacion: normalizeText(source.codificacion || source.codigo || source.code, ""),
    descripcion: normalizeText(source.descripcion || source.description, ""),
    unidad: normalizeText(source.unidad || source.unit, ""),
    costo: normalizeDecimalString(source.costo ?? source.cost),
    metradoBim: normalizeDecimalString(source.metradoBim ?? source.metrado),
    tipoMetrado: normalizeText(source.tipoMetrado || source.metradoType, ""),
    reglaMetrado: normalizeText(source.reglaMetrado || source.metradoRule, ""),
    rendimientoManoObra: normalizeDecimalString(source.rendimientoManoObra),
    rendimientoEquipos: normalizeDecimalString(source.rendimientoEquipos),
  };
}

function createEmptyRevitImportState() {
  return {
    currentProjectId: null,
    projectId: null,
    projectName: "",
    project: null,
    rows: [],
  };
}

function resolveExistingProjectUid(projects, projectUid) {
  const normalized = normalizeIdentifier(projectUid, "");
  if (!normalized) {
    return "";
  }

  const project = projects.find((candidate) => (
    normalizeProjectUid(candidate) === normalized
  ));
  return project
    ? normalizeProjectUid(project)
    : "";
}

function normalizeProjectUid(project) {
  return normalizeIdentifier(project?.id || project?.projectId || project?.projectUid || project?.project_uid, "");
}

function readSearchParam(searchParams, key) {
  if (!searchParams) {
    return "";
  }
  if (typeof searchParams.get === "function") {
    return searchParams.get(key) || "";
  }
  if (typeof searchParams === "object" && !Array.isArray(searchParams)) {
    return searchParams[key] || "";
  }
  return "";
}

function getNextCodigoPartida(level, counters) {
  counters[level] = (counters[level] || 0) + 1;
  counters.length = level + 1;
  return counters.join(".");
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeDecimalString(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value);
}
