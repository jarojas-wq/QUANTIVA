const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
};
const REMOTE_SAVE_DEBOUNCE_MS = 500;
const SERVER_STATE_ENDPOINT = "/api/state";
const ACCESS_SETTINGS_ENDPOINT = "/api/access/settings";
const AUTH_GOOGLE_ENDPOINT = "/api/auth/google";
const AUTH_ME_ENDPOINT = "/api/auth/me";
const AUTH_LOGOUT_ENDPOINT = "/api/auth/logout";
const AUTH_USERS_ENDPOINT = "/api/auth/users";

const appLayout = document.querySelector("#app-layout");
const itemTable = document.querySelector("#item-table");
const itemColgroup = document.querySelector("#item-colgroup");
const itemHead = document.querySelector("#item-head");
const body = document.querySelector("#item-body");
const itemCount = document.querySelector("#item-count");
const grandTotal = document.querySelector("#grand-total");
const depthCount = document.querySelector("#depth-count");
const rootCount = document.querySelector("#root-count");
const visibleCount = document.querySelector("#visible-count");
const visibleCountInline = document.querySelector("#visible-count-inline");
const selectedCode = document.querySelector("#selected-code");
const filterStatus = document.querySelector("#filter-status");
const saveStatus = document.querySelector("#save-status");
const saveSnapshotButton = document.querySelector("#save-snapshot-button");
const syncNowButton = document.querySelector("#sync-now-button");
const themeToggleButton = document.querySelector("#theme-toggle-button");
const accountMenu = document.querySelector("#account-menu");
const accountMenuButton = document.querySelector("#account-menu-button");
const accountMenuPanel = document.querySelector("#account-menu-panel");
const accountMenuAvatarImage = document.querySelector("#account-menu-avatar-image");
const accountMenuAvatarText = document.querySelector("#account-menu-avatar-text");
const accountMenuPanelAvatarImage = document.querySelector("#account-menu-panel-avatar-image");
const accountMenuPanelAvatarText = document.querySelector("#account-menu-panel-avatar-text");
const accountMenuName = document.querySelector("#account-menu-name");
const accountMenuMeta = document.querySelector("#account-menu-meta");
const logoutButton = document.querySelector("#logout-button");
const storageModePill = document.querySelector("#storage-mode-pill");
const appModeLabel = document.querySelector("#app-mode-label");
const searchInput = document.querySelector("#table-search-input");
const searchWrap = document.querySelector("#search-wrap");
const operatorInput = document.querySelector("#operator-name-input");
const sidebarToggleButton = document.querySelector("#sidebar-toggle-button");
const viewButtons = Array.from(document.querySelectorAll("[data-view]"));
const usersViewButton = document.querySelector('[data-view="usuarios"]');
const projectSelect = document.querySelector("#project-select");
const projectTitle = document.querySelector("#project-title");
const newProjectButton = document.querySelector("#new-project-button");
const renameProjectButton = document.querySelector("#rename-project-button");
const deleteProjectButton = document.querySelector("#delete-project-button");
const matrixTitle = document.querySelector("#matrix-title");
const helperText = document.querySelector("#helper-text");
const shortcutText = document.querySelector("#sidebar-shortcut-text");
const controlsPanel = document.querySelector("#controls-panel");
const exportPanel = document.querySelector("#export-panel");
const bimPanel = document.querySelector("#bim-panel");
const auditPanel = document.querySelector("#audit-panel");
const usersPanel = document.querySelector("#users-panel");
const snapshotPanel = document.querySelector("#snapshot-panel");
const tableWrap = document.querySelector(".table-wrap");
const toolbar = document.querySelector("#structure-toolbar");
const selectionPill = document.querySelector(".head-pill--selection");
const accessGate = document.querySelector("#access-gate");
const accessError = document.querySelector("#access-error");
const accessStatus = document.querySelector("#access-status");
const googleLoginWrap = document.querySelector("#google-login-wrap");
const googleSignInButton = document.querySelector("#google-signin-button");
const accessDivider = document.querySelector("#access-divider");
const TREE_INDENT_STEP = 16;
const DEFAULT_OPERATOR_NAME = "Usuario local";
const METRADO_TYPE_OPTIONS = ["Tradicional", "Revit"];
const DEFAULT_METRADO_RULE = "Encofrado";
const METRADO_RULE_OPTIONS = [DEFAULT_METRADO_RULE];
const UNIDAD_PARTIDA_OPTIONS = [
  "und",
  "m",
  "ml",
  "m2",
  "m3",
  "cm",
  "km",
  "kg",
  "g",
  "tn",
  "l",
  "ha",
  "h",
  "dia",
  "mes",
  "pza",
  "jgo",
  "glb",
  "lote",
  "paquete",
];
const AUDIT_FILTER_CONFIGS = {
  all: { label: "Todos" },
  today: { label: "Hoy" },
  structure: { label: "Estructura" },
  cost: { label: "Costo/Metrados" },
};
const USER_ROLE_OPTIONS = ["viewer", "editor", "admin", "superadmin"];
const USER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPORT_COLUMN_SCHEMAS = {
  rvt: [
    { key: "codificacion", header: "CODIFICACION", width: 22, type: "text" },
    { key: "codigoPartida", header: "CODIGO DE PARTIDA", width: 18, type: "text" },
    { key: "descripcion", header: "DESCRIPCION DE PARTIDA", width: 46, type: "text" },
    { key: "unidad", header: "UNIDAD DE PARTIDA", width: 20, type: "text" },
    { key: "costo", header: "COSTO", width: 14, type: "number" },
    { key: "reglaMetrado", header: "REGLA DE METRADO", width: 22, type: "text" },
    { key: "grupoTablas", header: "GRUPO TABLAS", width: 28, type: "text" },
  ],
  presupuesto: [
    { key: "codificacion", header: "CODIFICACION", width: 22, type: "text" },
    { key: "codigoPartida", header: "CODIGO DE PARTIDA", width: 18, type: "text" },
    { key: "descripcion", header: "DESCRIPCION DE PARTIDA", width: 46, type: "text" },
    { key: "unidad", header: "UNIDAD DE PARTIDA", width: 20, type: "text" },
    { key: "costo", header: "COSTO", width: 14, type: "number" },
    { key: "metradoTradicional", header: "METRADO TRADICIONAL", width: 22, type: "number" },
    { key: "metradoBim", header: "METRADO BIM", width: 16, type: "number" },
    { key: "parcial", header: "PARCIAL", width: 16, type: "number" },
    { key: "tipoMetrado", header: "TIPO DE METRADO", width: 20, type: "text" },
    { key: "reglaMetrado", header: "REGLA DE METRADO", width: 22, type: "text" },
    { key: "grupoTablas", header: "GRUPO TABLAS", width: 28, type: "text" },
  ],
};
const EXPORT_MODE_CONFIGS = {
  rvt: {
    key: "rvt",
    actionLabel: "Exportar RVT",
    emptyAlert: "No hay filas con Tipo de metrado = Revit en esta raiz.",
    fileFallbackName: "exportacion-rvt",
    columns: EXPORT_COLUMN_SCHEMAS.rvt,
  },
  presupuesto: {
    key: "presupuesto",
    actionLabel: "Exportar Presupuesto",
    emptyAlert: "No hay filas para exportar en esta raiz.",
    fileFallbackName: "exportacion-presupuesto",
    columns: EXPORT_COLUMN_SCHEMAS.presupuesto,
  },
};
const VIEW_CONFIGS = {
  itemizado: {
    key: "itemizado",
    label: "Itemizado",
    matrixTitle: "Matriz de partidas",
    contentType: "table",
    searchEnabled: true,
    helperText:
      "Usa la franja superior para crear, mover e indentar la estructura del itemizado.",
    shortcutText:
      "Selecciona una fila y usa la franja superior para crear, ordenar o indentar sin quitar foco a la matriz.",
    allowsStructureEditing: true,
    columns: [
      {
        key: "partida",
        label: "Codigo de partida",
        colClass: "col-partida",
        widthVar: "--partida-col-width",
        type: "partida",
      },
      {
        key: "codificacion",
        label: "Codificacion",
        colClass: "col-codificacion",
        widthVar: "--codificacion-col-width",
        type: "input",
        field: "codificacion",
        editable: true,
        placeholder: "Ej. ESTRUCT-001",
      },
      {
        key: "descripcion",
        label: "Descripcion de Partida",
        colClass: "col-descripcion",
        widthVar: "--descripcion-col-width",
        type: "input",
        field: "descripcion",
        editable: true,
        inputClass: "cell-field--descripcion",
        placeholder: "Describe la partida o subpartida",
      },
      {
        key: "tipoMetrado",
        label: "Tipo de metrado",
        colClass: "col-tipo-metrado",
        widthVar: "--tipo-metrado-col-width",
        type: "select",
        field: "tipoMetrado",
        editable: true,
        placeholder: "Selecciona",
        options: METRADO_TYPE_OPTIONS,
      },
      {
        key: "reglaMetrado",
        label: "Regla de metrado",
        colClass: "col-regla-metrado",
        widthVar: "--regla-metrado-col-width",
        type: "select",
        field: "reglaMetrado",
        editable: true,
        placeholder: "Selecciona",
        options: METRADO_RULE_OPTIONS,
      },
      {
        key: "unidad",
        label: "Unidad de Partida",
        colClass: "col-unidad",
        widthVar: "--unidad-col-width",
        type: "select",
        field: "unidad",
        editable: true,
        placeholder: "Selecciona",
        options: UNIDAD_PARTIDA_OPTIONS,
      },
      {
        key: "costo",
        label: "Costo",
        colClass: "col-costo",
        widthVar: "--costo-col-width",
        type: "input",
        field: "costo",
        editable: true,
        placeholder: "0.00",
        inputMode: "decimal",
      },
    ],
  },
  presupuesto: {
    key: "presupuesto",
    label: "Presupuesto",
    matrixTitle: "Presupuesto",
    contentType: "table",
    searchEnabled: true,
    helperText:
      "Aqui editas el presupuesto y revisas metrados y parciales directamente sobre la matriz.",
    shortcutText:
      "Usa el buscador superior para ubicar partidas y revisar rapidamente los importes del presupuesto.",
    allowsStructureEditing: false,
    columns: [
      {
        key: "partida",
        label: "Codigo de partida",
        colClass: "col-partida",
        widthVar: "--partida-col-width",
        type: "partida",
      },
      {
        key: "codificacion",
        label: "Codificacion",
        colClass: "col-codificacion",
        widthVar: "--codificacion-col-width",
        type: "input",
        field: "codificacion",
        editable: false,
        placeholder: "Ej. ESTRUCT-001",
      },
      {
        key: "descripcion",
        label: "Descripcion de Partida",
        colClass: "col-descripcion",
        widthVar: "--descripcion-col-width",
        type: "input",
        field: "descripcion",
        editable: false,
        inputClass: "cell-field--descripcion",
        placeholder: "Describe la partida o subpartida",
      },
      {
        key: "unidad",
        label: "Unidad de Partida",
        colClass: "col-unidad",
        widthVar: "--unidad-col-width",
        type: "select",
        field: "unidad",
        editable: false,
        placeholder: "",
        options: UNIDAD_PARTIDA_OPTIONS,
      },
      {
        key: "costo",
        label: "Costo",
        colClass: "col-costo",
        widthVar: "--costo-col-width",
        type: "input",
        field: "costo",
        editable: false,
        placeholder: "0.00",
        inputMode: "decimal",
      },
      {
        key: "metradoTradicional",
        label: "Metrado Tradicional",
        colClass: "col-metrado-tradicional",
        widthVar: "--metrado-tradicional-col-width",
        type: "input",
        field: "metradoTradicional",
        editable: true,
        placeholder: "0.00",
        inputMode: "decimal",
      },
      {
        key: "metradoBim",
        label: "Metrado BIM",
        colClass: "col-metrado-bim",
        widthVar: "--metrado-bim-col-width",
        type: "input",
        field: "metradoBim",
        editable: false,
        placeholder: "0.00",
        inputMode: "decimal",
      },
      {
        key: "reglaMetrado",
        label: "Regla de metrado",
        colClass: "col-regla-metrado",
        widthVar: "--regla-metrado-col-width",
        type: "select",
        field: "reglaMetrado",
        editable: true,
        placeholder: "Selecciona",
        options: METRADO_RULE_OPTIONS,
      },
      {
        key: "parcial",
        label: "Parcial",
        colClass: "col-parcial",
        widthVar: "--parcial-col-width",
        type: "partial",
      },
    ],
  },
  auditoria: {
    key: "auditoria",
    label: "Auditoría",
    matrixTitle: "Auditoría",
    contentType: "audit",
    searchEnabled: true,
    helperText:
      "Selecciona una fila para revisar su historial de cambios, responsable y fecha.",
    shortcutText:
      "Esta vista es solo de lectura y muestra el seguimiento completo de cada fila.",
    allowsStructureEditing: false,
    columns: [
      {
        key: "partida",
        label: "Codigo de partida",
        colClass: "col-partida",
        widthVar: "--partida-col-width",
        type: "partida",
      },
      {
        key: "codificacion",
        label: "Codificacion",
        colClass: "col-codificacion",
        widthVar: "--codificacion-col-width",
        type: "input",
        field: "codificacion",
        editable: false,
        placeholder: "",
      },
      {
        key: "descripcion",
        label: "Descripcion de Partida",
        colClass: "col-descripcion",
        widthVar: "--descripcion-col-width",
        type: "input",
        field: "descripcion",
        editable: false,
        inputClass: "cell-field--descripcion",
        placeholder: "",
      },
      {
        key: "unidad",
        label: "Unidad de Partida",
        colClass: "col-unidad",
        widthVar: "--unidad-col-width",
        type: "select",
        field: "unidad",
        editable: false,
        placeholder: "",
        options: UNIDAD_PARTIDA_OPTIONS,
      },
      {
        key: "costo",
        label: "Costo",
        colClass: "col-costo",
        widthVar: "--costo-col-width",
        type: "input",
        field: "costo",
        editable: false,
        placeholder: "",
        inputMode: "decimal",
      },
      {
        key: "metradoTradicional",
        label: "Metrado Tradicional",
        colClass: "col-metrado-tradicional",
        widthVar: "--metrado-tradicional-col-width",
        type: "input",
        field: "metradoTradicional",
        editable: false,
        placeholder: "",
        inputMode: "decimal",
      },
      {
        key: "metradoBim",
        label: "Metrado BIM",
        colClass: "col-metrado-bim",
        widthVar: "--metrado-bim-col-width",
        type: "input",
        field: "metradoBim",
        editable: false,
        placeholder: "",
        inputMode: "decimal",
      },
      {
        key: "reglaMetrado",
        label: "Regla de metrado",
        colClass: "col-regla-metrado",
        widthVar: "--regla-metrado-col-width",
        type: "select",
        field: "reglaMetrado",
        editable: false,
        placeholder: "",
        options: METRADO_RULE_OPTIONS,
      },
      {
        key: "parcial",
        label: "Parcial",
        colClass: "col-parcial",
        widthVar: "--parcial-col-width",
        type: "partial",
      },
    ],
  },
  usuarios: {
    key: "usuarios",
    label: "Usuarios",
    matrixTitle: "Proyectos y usuarios",
    contentType: "users",
    searchEnabled: false,
    helperText:
      "Selecciona un proyecto para revisar sus miembros y administrar accesos.",
    shortcutText:
      "Flujo de acceso: Proyectos -> Usuarios. Los cambios se guardan en MySQL.",
    allowsStructureEditing: false,
    columns: [],
  },
  "control-bim": {
    key: "control-bim",
    label: "Control BIM",
    matrixTitle: "Control BIM",
    contentType: "bim-control",
    searchEnabled: false,
    helperText:
      "Revisa partidas listas para Revit, codificaciones, metrados BIM recibidos y el ultimo lote importado desde el add-in.",
    shortcutText:
      "Usa esta vista antes y despues de exportar desde Revit para detectar partidas incompletas, duplicadas o sin metrado BIM.",
    allowsStructureEditing: false,
    columns: [],
  },
  "exportaciones-rvt": {
    key: "exportaciones-rvt",
    label: "Exportaciones para RVT",
    matrixTitle: "Exportaciones para RVT",
    contentType: "export",
    searchEnabled: false,
    helperText:
      "Cada boton exporta solo filas con Tipo de metrado = Revit a un archivo Excel externo de revision o intercambio.",
    shortcutText:
      "El add-in ya no usa este Excel como entrada principal; importa directo desde el proyecto activo.",
    allowsStructureEditing: false,
    exportMode: "rvt",
    columns: [],
  },
  "exportacion-presupuesto": {
    key: "exportacion-presupuesto",
    label: "Exportación Presupuesto",
    matrixTitle: "Exportación Presupuesto",
    contentType: "export",
    searchEnabled: false,
    helperText:
      "Cada boton exporta la rama completa con costo, metrados, parcial, tipo de metrado y Grupo Tablas.",
    shortcutText:
      "Usa un boton por cada raiz para generar el archivo de presupuesto listo para revision o intercambio.",
    allowsStructureEditing: false,
    exportMode: "presupuesto",
    columns: [],
  },
};

const uiState = loadUiState();
const storedProjectsState = loadProjectsState(uiState);
const state = {
  projects: storedProjectsState.projects,
  currentProjectId: storedProjectsState.currentProjectId,
  rows: [],
  auditEntries: [],
  snapshots: [],
  snapshotCompareBaseId: null,
  snapshotCompareTargetId: null,
  selectedId: null,
  pendingFocus: null,
  filterQuery: "",
  collapsedIds: new Set(),
  dragSession: null,
  editStartValues: {},
  operatorName: sanitizeOperatorName(uiState.operatorName || DEFAULT_OPERATOR_NAME),
  auditFilter: AUDIT_FILTER_CONFIGS[uiState.auditFilter] ? uiState.auditFilter : "all",
  currentView: VIEW_CONFIGS[uiState.currentView] ? uiState.currentView : "itemizado",
  sidebarCollapsed: uiState.sidebarCollapsed !== false,
  themeMode: resolveInitialThemeMode(uiState.themeMode),
  storageMode: "mysql",
  isHydratingRemote: false,
  isSavingRemote: false,
  remoteDirty: false,
  remoteSaveError: false,
  remoteChangeVersion: 0,
  lastSavedAt: null,
};

const persistence = {
  bootstrapped: false,
  remoteAvailable: false,
  saveInFlight: null,
  saveTimer: null,
  saveQueued: false,
};

const authState = {
  required: false,
  token: loadStoredAuthToken(),
  user: null,
  isAuthenticating: false,
  googleAuthEnabled: false,
  googleClientId: "",
  googleInitialized: false,
};

const usersState = {
  items: [],
  projects: [],
  loading: false,
  saving: false,
  error: "",
  info: "",
  editingEmail: "",
  selectedProjectId: "",
  addMembersMode: false,
  memberEmailInput: "",
  memberDrafts: [],
  loadedForToken: "",
  loaded: false,
};

hydrateCurrentProject(false);
pruneCollapsedIds();
state.selectedId = state.rows[0] ? state.rows[0].id : null;

applyThemeMode(state.themeMode, { persist: false });
applySidebarState();
persistUiState();
saveProjectState(false);
updateSaveStatus();
operatorInput.value = state.operatorName;
render();
updateSessionControls();

toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toolbar-action]");
  if (!button) {
    return;
  }

  handleAction(button.dataset.toolbarAction);
});

exportPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-export-root-id]");
  if (!button) {
    return;
  }

  const exportMode = String(button.dataset.exportMode || getCurrentViewConfig().exportMode || "rvt");
  exportRootBranch(button.dataset.exportRootId, exportMode);
});

bimPanel.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-bim-action]");
  if (actionButton) {
    handleBimControlAction(actionButton.dataset.bimAction);
    return;
  }

  const rowButton = event.target.closest("[data-bim-row-id]");
  if (!rowButton) {
    return;
  }

  selectRow(rowButton.dataset.bimRowId);
  switchView("itemizado");
});

auditPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-audit-filter]");
  if (!button) {
    return;
  }

  setAuditFilter(button.dataset.auditFilter);
});

snapshotPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-snapshot-action]");
  if (!button) {
    return;
  }

  handleSnapshotAction(button.dataset.snapshotAction, button.dataset.snapshotId);
});

snapshotPanel.addEventListener("change", (event) => {
  const target = event.target.closest("[data-snapshot-compare]");
  if (!target) {
    return;
  }

  updateSnapshotComparison(target.dataset.snapshotCompare, target.value);
});

body.addEventListener("pointerdown", (event) => {
  if (!getCurrentViewConfig().allowsStructureEditing) {
    return;
  }

  const dragHandle = event.target.closest("[data-drag-handle]");
  if (!dragHandle) {
    return;
  }

  event.preventDefault();
  startTreeDrag(dragHandle.dataset.dragHandle, event);
});

body.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-tree-toggle]");
  if (toggleButton) {
    event.stopPropagation();
    toggleRowCollapse(toggleButton.dataset.treeToggle);
    return;
  }

  const rowElement = event.target.closest("tr[data-row-id]");
  if (!rowElement) {
    return;
  }

  selectRow(rowElement.dataset.rowId);
});

body.addEventListener("focusin", (event) => {
  const rowElement = event.target.closest("tr[data-row-id]");
  if (!rowElement) {
    return;
  }

  selectRow(rowElement.dataset.rowId);
  captureEditStartValue(event.target, rowElement.dataset.rowId);
});

body.addEventListener("input", (event) => {
  const field = event.target.name;
  const rowElement = event.target.closest("tr[data-row-id]");

  if (!field || !rowElement) {
    return;
  }

  const row = state.rows.find((entry) => entry.id === rowElement.dataset.rowId);
  if (!row) {
    return;
  }

  event.target.setCustomValidity("");

  if (!isFieldEditable(field)) {
    event.target.value = row[field] ?? "";
    return;
  }

  if (isLeafOnlyField(field) && rowHasChildren(state.rows, getRowIndexById(row.id))) {
    event.target.value = "";
    return;
  }

  if (field === "codificacion") {
    event.target.value = sanitizeCodificacion(event.target.value);
    return;
  }

  if (field === "descripcion") {
    event.target.value = sanitizeDescripcion(event.target.value);
    return;
  }

  row[field] = event.target.value;
  saveRows(state.rows);

  if (event.target.matches("textarea")) {
    autoSizeTextarea(event.target);
  }

  if (field === "descripcion") {
    updateDescriptionColumnWidth();
  }

  updateVisiblePartialCells();
  refreshMetrics();
});

body.addEventListener("change", (event) => {
  const field = event.target.name;
  const rowElement = event.target.closest("tr[data-row-id]");

  if (!isAuditableField(field) || !rowElement) {
    return;
  }

  const row = state.rows.find((entry) => entry.id === rowElement.dataset.rowId);
  if (!row) {
    return;
  }

  event.target.setCustomValidity("");

  if (!isFieldEditable(field)) {
    event.target.value = row[field] ?? "";
    return;
  }

  if (isLeafOnlyField(field) && rowHasChildren(state.rows, getRowIndexById(row.id))) {
    event.target.value = "";
    clearEditStartValue(row.id, field);
    return;
  }

  const nextValue = sanitizeFieldValue(field, event.target.value);
  const beforeValue = getEditStartValue(row.id, field, row[field] ?? "");
  event.target.value = nextValue;

  const duplicate = findDuplicateForField(field, nextValue, row.id);

  if (duplicate) {
    event.target.value = row[field] ?? "";

    event.target.setCustomValidity(getDuplicateFieldMessage(field, duplicate.code));
    event.target.reportValidity();
    clearEditStartValue(row.id, field);
    return;
  }

  if (nextValue !== row[field]) {
    row[field] = nextValue;
  }

  if (field === "tipoMetrado") {
    row.reglaMetrado = getReglaMetradoForTipo(nextValue, row.reglaMetrado);
  }

  if (field === "reglaMetrado") {
    row.reglaMetrado = getReglaMetradoForTipo(row.tipoMetrado, nextValue);
    event.target.value = row.reglaMetrado;
  }

  saveRows(state.rows, false);

  clearEditStartValue(row.id, field);

  if (nextValue === beforeValue) {
    return;
  }

  appendAuditEntries([
    createFieldAuditEntry(row.id, field, beforeValue, nextValue),
  ]);

  if (field === "descripcion") {
    updateDescriptionColumnWidth();
  }

  if (field === "tipoMetrado") {
    render();
    return;
  }

  updateVisiblePartialCells();
  refreshMetrics();
});

searchInput.addEventListener("input", (event) => {
  state.filterQuery = event.target.value.trim();
  render();
});

operatorInput.addEventListener("change", (event) => {
  state.operatorName = sanitizeOperatorName(event.target.value || DEFAULT_OPERATOR_NAME);
  event.target.value = state.operatorName;
  persistUiState();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

projectSelect.addEventListener("change", (event) => {
  switchProject(event.target.value);
});

newProjectButton.addEventListener("click", () => {
  createProject();
});

renameProjectButton.addEventListener("click", () => {
  renameCurrentProject();
});

deleteProjectButton.addEventListener("click", () => {
  deleteCurrentProject();
});

saveSnapshotButton.addEventListener("click", () => {
  createBudgetSnapshot();
});

if (syncNowButton) {
  syncNowButton.addEventListener("click", async () => {
    await handleManualSyncRequest();
  });
}

if (themeToggleButton) {
  themeToggleButton.addEventListener("click", () => {
    const nextTheme = state.themeMode === THEME_MODES.DARK
      ? THEME_MODES.LIGHT
      : THEME_MODES.DARK;
    applyThemeMode(nextTheme);
  });
}

sidebarToggleButton.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  persistUiState();
  applySidebarState();
});

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await handleLogoutRequest();
  });
}

if (accountMenuButton) {
  accountMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAccountMenu();
  });
}

if (accountMenuPanel) {
  accountMenuPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

document.addEventListener("click", (event) => {
  if (!accountMenu || accountMenu.hidden) {
    return;
  }
  if (accountMenu.contains(event.target)) {
    return;
  }
  closeAccountMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAccountMenu();
  }
});

if (usersPanel) {
  usersPanel.addEventListener("submit", async (event) => {
    const projectMemberForm = event.target.closest("[data-users-project-member-form]");
    if (projectMemberForm) {
      event.preventDefault();
      await handleProjectMemberFormSubmit(projectMemberForm);
      return;
    }

    const form = event.target.closest("[data-users-form]");
    if (!form) {
      return;
    }

    event.preventDefault();
    await handleUsersFormSubmit(form);
  });

  usersPanel.addEventListener("click", async (event) => {
    const actionElement = event.target.closest("[data-users-action]");
    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.usersAction;
    if (action === "refresh") {
      await loadUsersForPanel({ force: true });
      return;
    }

    if (action === "select-project") {
      selectUsersProject(actionElement.dataset.projectId);
      return;
    }

    if (action === "back-projects") {
      usersState.selectedProjectId = "";
      usersState.editingEmail = "";
      resetUsersAddMembersState();
      usersState.error = "";
      usersState.info = "";
      renderUsersPanel();
      return;
    }

    if (action === "new") {
      usersState.editingEmail = "";
      usersState.info = "Formulario listo para nuevo usuario.";
      usersState.error = "";
      renderUsersPanel();
      return;
    }

    if (action === "new-member") {
      openUsersAddMembersFlow();
      return;
    }

    if (action === "cancel-add-members") {
      closeUsersAddMembersFlow();
      return;
    }

    if (action === "process-member-emails") {
      processUsersAddMemberEmails();
      return;
    }

    if (action === "remove-member-draft") {
      removeUsersMemberDraft(actionElement.dataset.draftId);
      return;
    }

    if (action === "save-member-drafts") {
      await saveUsersMemberDrafts();
      return;
    }

    if (action === "edit") {
      const email = String(actionElement.dataset.userEmail || "").trim().toLowerCase();
      startUsersEdit(email);
      return;
    }

    if (action === "remove-project-member") {
      const email = String(actionElement.dataset.userEmail || "").trim().toLowerCase();
      await removeUserFromSelectedProject(email);
    }
  });

  usersPanel.addEventListener("input", (event) => {
    handleUsersDraftInputEvent(event);
  });

  usersPanel.addEventListener("change", (event) => {
    handleUsersDraftInputEvent(event);
  });
}

window.addEventListener("resize", () => {
  updateDescriptionColumnWidth();

  if (state.dragSession && state.dragSession.started) {
    updateTreeDragTarget(state.dragSession.lastX, state.dragSession.lastY);
    applyTreeDragFeedback();
  }
});

bootstrapAuthAndServerPersistence();

function handleAction(action) {
  if (!getCurrentViewConfig().allowsStructureEditing) {
    return;
  }

  const selectedIndex = getSelectedIndex();

  switch (action) {
    case "add-root": {
      const nextRows = [...state.rows, createRow({ level: 0 })];
      const newRow = nextRows[nextRows.length - 1];
      commit(nextRows, newRow.id, "codificacion");
      return;
    }
    case "add-below": {
      if (selectedIndex === -1) {
        return;
      }

      const insertAt = getBranchEnd(state.rows, selectedIndex) + 1;
      const source = state.rows[selectedIndex];
      const newRow = createRow({ level: source.level });
      const nextRows = insertAtArray(state.rows, insertAt, newRow);
      commit(nextRows, newRow.id, "codificacion");
      return;
    }
    case "add-child": {
      if (selectedIndex === -1) {
        return;
      }

      const insertAt = getBranchEnd(state.rows, selectedIndex) + 1;
      const parent = state.rows[selectedIndex];
      const newRow = createRow({ level: parent.level + 1 });
      const nextRows = insertAtArray(state.rows, insertAt, newRow);
      commit(nextRows, newRow.id, "codificacion");
      return;
    }
    case "move-up": {
      if (selectedIndex === -1) {
        return;
      }

      const nextRows = moveBranch(state.rows, selectedIndex, -1);
      if (nextRows) {
        commit(nextRows, state.rows[selectedIndex].id);
      }
      return;
    }
    case "move-down": {
      if (selectedIndex === -1) {
        return;
      }

      const nextRows = moveBranch(state.rows, selectedIndex, 1);
      if (nextRows) {
        commit(nextRows, state.rows[selectedIndex].id);
      }
      return;
    }
    case "indent": {
      if (selectedIndex <= 0) {
        return;
      }

      const nextRows = shiftBranch(state.rows, selectedIndex, 1);
      if (nextRows) {
        commit(nextRows, state.rows[selectedIndex].id);
      }
      return;
    }
    case "outdent": {
      if (selectedIndex === -1) {
        return;
      }

      const nextRows = shiftBranch(state.rows, selectedIndex, -1);
      if (nextRows) {
        commit(nextRows, state.rows[selectedIndex].id);
      }
      return;
    }
    case "delete": {
      if (selectedIndex === -1) {
        return;
      }

      const branchEnd = getBranchEnd(state.rows, selectedIndex);
      const remaining = state.rows.filter(
        (_, index) => index < selectedIndex || index > branchEnd,
      );
      const nextRows = remaining.length > 0 ? remaining : [createRow()];
      const replacement = nextRows[Math.min(selectedIndex, nextRows.length - 1)];
      commit(nextRows, replacement.id);
      return;
    }
    default:
      return;
  }
}

function commit(rows, selectedId, focusField) {
  const previousRows = cloneRows(state.rows);
  const nextRows = normalizeRows(rows);
  const structureEntries = collectStructureAuditEntries(previousRows, nextRows);

  state.rows = nextRows;
  pruneCollapsedIds();
  state.selectedId = selectedId;
  state.pendingFocus = focusField ? { id: selectedId, field: focusField } : null;
  persistUiState();
  saveRows(state.rows, structureEntries.length === 0);

  if (structureEntries.length > 0) {
    appendAuditEntries(structureEntries);
  }

  render();
}

function getCurrentViewConfig() {
  return VIEW_CONFIGS[state.currentView] || VIEW_CONFIGS.itemizado;
}

function setAuditFilter(filterKey) {
  if (!AUDIT_FILTER_CONFIGS[filterKey] || filterKey === state.auditFilter) {
    return;
  }

  state.auditFilter = filterKey;
  persistUiState();

  if (getCurrentViewConfig().contentType === "audit") {
    renderAuditPanel(buildPartidaCodes(state.rows));
  }
}

function switchView(view) {
  if (!VIEW_CONFIGS[view] || view === state.currentView) {
    updateViewUi();
    return;
  }

  if (view === "usuarios" && !isUsersViewAllowed()) {
    usersState.error = "Solo superadmin puede abrir el panel de usuarios.";
    usersState.info = "";
    updateViewUi();
    return;
  }

  state.currentView = view;
  state.pendingFocus = null;
  persistUiState();
  render();
}

function render() {
  const viewConfig = getCurrentViewConfig();
  const filterQuery =
    viewConfig.contentType === "table" || viewConfig.contentType === "audit"
      ? state.filterQuery
      : "";
  const partidaCodes = buildPartidaCodes(state.rows);
  const visibleEntries = getVisibleEntries(
    state.rows,
    partidaCodes,
    filterQuery,
    { respectCollapsed: viewConfig.allowsStructureEditing },
  );

  syncSelectedRowWithVisibleEntries(visibleEntries);

  if (viewConfig.contentType === "export") {
    tableWrap.hidden = true;
    exportPanel.hidden = false;
    bimPanel.hidden = true;
    auditPanel.hidden = true;
    usersPanel.hidden = true;
    snapshotPanel.hidden = true;
    renderExportPanel(partidaCodes, viewConfig.exportMode || "rvt");
  } else if (viewConfig.contentType === "bim-control") {
    tableWrap.hidden = true;
    exportPanel.hidden = true;
    bimPanel.hidden = false;
    auditPanel.hidden = true;
    usersPanel.hidden = true;
    snapshotPanel.hidden = true;
    renderBimControlPanel(partidaCodes);
  } else if (viewConfig.contentType === "users") {
    tableWrap.hidden = true;
    exportPanel.hidden = true;
    bimPanel.hidden = true;
    auditPanel.hidden = true;
    usersPanel.hidden = false;
    snapshotPanel.hidden = true;
    renderUsersPanel();
    if (isUsersViewAllowed()) {
      void loadUsersForPanel();
    }
  } else {
    exportPanel.hidden = true;
    bimPanel.hidden = true;
    tableWrap.hidden = false;
    auditPanel.hidden = viewConfig.contentType !== "audit";
    usersPanel.hidden = true;
    snapshotPanel.hidden = true;
    renderTableStructure(viewConfig);

    if (visibleEntries.length === 0) {
      body.innerHTML = `
        <tr class="empty-state-row">
          <td colspan="${viewConfig.columns.length}">
            <div class="empty-state">
              <strong>No se encontraron partidas</strong>
              <p>Ajusta el filtro para volver a mostrar filas de la matriz.</p>
            </div>
          </td>
        </tr>
      `;
    } else {
      body.innerHTML = visibleEntries
        .map(({ row, index, code }) => {
          const isSelected = row.id === state.selectedId;
          const rowClasses = [];
          if (isSelected) {
            rowClasses.push("is-selected");
          }
          if (isHeadingRow(row, index)) {
            rowClasses.push("is-heading-row", `is-heading-level-${Math.min(row.level, 4)}`);
          }
          const codificacion = row.codificacion.trim();
          const selectedLabel = codificacion || "Sin codificacion";

          return `
            <tr data-row-id="${row.id}" class="${rowClasses.join(" ")}" title="${escapeHtml(selectedLabel)}">
              ${renderRowCells(viewConfig, { row, index, code, codes: partidaCodes })}
            </tr>
          `;
        })
        .join("");
    }

    if (viewConfig.contentType === "audit") {
      renderAuditPanel(partidaCodes);
    }
  }

  updateProjectUi();
  updateViewUi(viewConfig);
  if (viewConfig.contentType === "table" || viewConfig.contentType === "audit") {
    updateDescriptionColumnWidth(visibleEntries);
  }
  refreshMetrics(partidaCodes, visibleEntries);
  if (viewConfig.contentType === "table" || viewConfig.contentType === "audit") {
    updateSelectionUi();
  }
  updateToolbarState();
  if (viewConfig.contentType === "table" || viewConfig.contentType === "audit") {
    restoreFocus();
  }
}

function renderTableStructure(viewConfig) {
  itemColgroup.innerHTML = viewConfig.columns
    .map((column) => `<col class="${column.colClass}" />`)
    .join("");
  itemHead.innerHTML = `
    <tr>
      ${viewConfig.columns
        .map((column) => `<th scope="col">${column.label}</th>`)
        .join("")}
    </tr>
  `;
  updateTableMinWidth(viewConfig);
}

function renderRowCells(viewConfig, context) {
  return viewConfig.columns
    .map((column) => renderColumnCell(column, context, viewConfig))
    .join("");
}

function renderColumnCell(column, context, viewConfig) {
  const { row, index, code } = context;

  switch (column.type) {
    case "partida":
      return renderPartidaCell(row, index, code, viewConfig);
    case "partial":
      return renderPartialCell(row, index);
    case "input":
      return renderInputCell(row, column, index, context);
    case "select":
      return renderSelectCell(row, column, index, context);
    default:
      return "<td></td>";
  }
}

function isHeadingRow(row, index) {
  if (rowHasChildren(state.rows, index)) {
    return true;
  }

  return row.level <= 1
    && !String(row.unidad || "").trim()
    && !String(row.tipoMetrado || "").trim()
    && !String(row.reglaMetrado || "").trim()
    && parseDecimal(row.costo) === 0
    && parseDecimal(row.metradoTradicional ?? row.metrado) === 0
    && parseDecimal(row.metradoBim) === 0;
}

function renderPartidaCell(row, index, code, viewConfig) {
  const hasChildren = rowHasChildren(state.rows, index);
  const isCollapsed = state.collapsedIds.has(row.id);
  const dragHandle = viewConfig.allowsStructureEditing
    ? `
        <button
          type="button"
          class="drag-handle"
          data-drag-handle="${row.id}"
          aria-label="Mantener presionado para mover o indentar la partida"
          title="Arrastra para mover o indentar"
        ></button>
      `
    : "";
  const treeControl = viewConfig.allowsStructureEditing && hasChildren
    ? `
        <button
          type="button"
          class="tree-toggle ${isCollapsed ? "is-collapsed" : ""}"
          data-tree-toggle="${row.id}"
          aria-label="${isCollapsed ? "Expandir subpartidas" : "Contraer subpartidas"}"
          aria-expanded="${String(!isCollapsed)}"
          title="${isCollapsed ? "Expandir subpartidas" : "Contraer subpartidas"}"
        ></button>
      `
    : `<span class="tree-toggle-spacer" aria-hidden="true"></span>`;

  return `
    <td class="partida-cell">
      <div class="partida-chip" style="--depth: ${row.level}">
        ${dragHandle}
        ${treeControl}
        <span class="partida-label">${code}</span>
        <span class="partida-meta">Nivel ${row.level + 1}</span>
      </div>
    </td>
  `;
}

function renderInputCell(row, column, rowIndex, context = {}) {
  const classes = ["cell-field"];
  if (column.inputClass) {
    classes.push(column.inputClass);
  }

  const isEditable = isCellEditable(row, rowIndex, column);
  if (!isEditable) {
    classes.push("cell-field--readonly");
  }

  const inputMode = column.inputMode
    ? ` inputmode="${column.inputMode}"`
    : "";
  const displayValue = getDisplayValueForCell(row, rowIndex, column, context.codes);
  const value = escapeHtml(displayValue);
  const placeholder = escapeHtml(getPlaceholderForCell(rowIndex, column));
  const readOnlyAttributes = isEditable
    ? ""
    : ' readonly tabindex="-1" aria-readonly="true"';

  return `
    <td>
      <input
        class="${classes.join(" ")}"
        type="text"${inputMode}${readOnlyAttributes}
        name="${column.field}"
        value="${value}"
        placeholder="${placeholder}"
      />
    </td>
  `;
}

function renderSelectCell(row, column, rowIndex, context = {}) {
  const classes = ["cell-field"];
  const isEditable = isCellEditable(row, rowIndex, column);
  const displayValue = getDisplayValueForCell(row, rowIndex, column, context.codes);
  const options = Array.isArray(column.options) ? column.options : [];
  const shouldRenderCustomValue = Boolean(displayValue) && !options.includes(displayValue);
  const renderedOptions = [
    ...(shouldRenderCustomValue ? [displayValue] : []),
    ...options,
  ];

  if (!isEditable) {
    classes.push("cell-field--readonly", "cell-field--display");

    return `
      <td>
        <div class="${classes.join(" ")}">${escapeHtml(displayValue)}</div>
      </td>
    `;
  }

  classes.push("cell-field--select");

  return `
    <td>
      <select
        class="${classes.join(" ")}"
        name="${column.field}"
        aria-label="${escapeHtml(column.label)}"
      >
        <option value="">${escapeHtml(column.placeholder || "Selecciona")}</option>
        ${renderedOptions
          .map((option) => {
            const selected = option === displayValue ? " selected" : "";
            return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
          })
          .join("")}
      </select>
    </td>
  `;
}

function renderPartialCell(row, rowIndex) {
  const partial = getRowPartialAtIndex(rowIndex);
  const isSubtotal = rowHasChildren(state.rows, rowIndex);

  return `
    <td class="partial-cell ${partial === 0 ? "is-empty" : ""} ${isSubtotal ? "partial-cell--subtotal" : ""}">
      ${formatAmount(partial)}
    </td>
  `;
}

function getExportModeConfig(exportMode) {
  return EXPORT_MODE_CONFIGS[exportMode] || EXPORT_MODE_CONFIGS.rvt;
}

function renderExportPanel(codes, exportMode = "rvt") {
  const modeConfig = getExportModeConfig(exportMode);
  const rootEntries = state.rows
    .map((row, index) => ({ row, index, code: codes[index] }))
    .filter((entry) => entry.row.level === 0);

  if (rootEntries.length === 0) {
    exportPanel.innerHTML = `
      <div class="empty-state">
        <strong>No hay raices para exportar</strong>
        <p>Crea al menos una partida raiz en Itemizado para generar archivos Excel externos.</p>
      </div>
    `;
    return;
  }

  exportPanel.innerHTML = `
    <div class="export-grid">
      ${rootEntries
        .map(({ row, index, code }) => {
          const branchSize = getBranchEnd(state.rows, index) - index + 1;
          const title = getRootExportLabel(row, code);
          const partidaLabel = branchSize === 1 ? "1 partida" : `${branchSize} partidas`;

          return `
            <button
              type="button"
              class="export-root-button"
              data-export-root-id="${row.id}"
              data-export-mode="${modeConfig.key}"
              title="${escapeHtml(modeConfig.actionLabel)}: ${escapeHtml(title)}"
            >
              <span class="export-root-button__title">${escapeHtml(title)}</span>
              <span class="export-root-button__meta">${code} - ${partidaLabel}</span>
              <span class="export-root-button__action">${escapeHtml(modeConfig.actionLabel)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderBimControlPanel(codes) {
  const report = buildBimControlReport(codes);
  const latestExport = report.latestRevitExport;

  bimPanel.innerHTML = `
    <div class="bim-dashboard">
      <div class="bim-summary-grid">
        ${renderBimMetricCard("Listas para Revit", report.readyEntries.length, `${report.revitEntries.length} marcadas como Revit`, "ready")}
        ${renderBimMetricCard("Codif. faltantes", report.missingCodificationEntries.length, "Requieren CODIFICACION", report.missingCodificationEntries.length > 0 ? "warn" : "ok")}
        ${renderBimMetricCard("Codif. duplicadas", report.duplicateCodificationEntries.length, `${report.duplicateCodificationKeys.length} codigos repetidos`, report.duplicateCodificationEntries.length > 0 ? "warn" : "ok")}
        ${renderBimMetricCard("Metrados recibidos", report.metradoReceivedEntries.length, formatAmount(report.totalMetradoBim), "received")}
        ${renderBimMetricCard("Diferencias", report.differenceEntries.length, `BIM - Trad.: ${formatSignedAmount(report.totalDifference)}`, report.differenceEntries.length > 0 ? "warn" : "ok")}
      </div>

      <section class="bim-section">
        <div class="bim-section-head">
          <div>
            <strong>Ultimo lote Revit</strong>
            <span>${latestExport ? escapeHtml(formatRevitExportMeta(latestExport)) : "Aun no hay lotes recibidos desde Revit."}</span>
          </div>
          <button type="button" class="toolbar-button" data-bim-action="open-rvt-export">
            Exportaciones RVT
          </button>
        </div>
        ${renderLatestRevitExport(latestExport)}
      </section>

      <section class="bim-section">
        <div class="bim-section-head">
          <div>
            <strong>Partidas listas para Revit</strong>
            <span>Filas hoja con Tipo de metrado = Revit, datos completos y codificacion unica.</span>
          </div>
          <button type="button" class="toolbar-button toolbar-button--primary" data-bim-action="open-rvt-export">
            Ver salida RVT
          </button>
        </div>
        ${renderBimReadyTable(report.readyEntries)}
      </section>

      <div class="bim-section-grid">
        <section class="bim-section">
          <div class="bim-section-head">
            <div>
              <strong>Alertas de codificacion</strong>
              <span>Prioriza esto antes de importar o exportar.</span>
            </div>
          </div>
          ${renderBimIssueList([
            ...report.missingCodificationEntries.map((entry) => ({
              rowId: entry.row.id,
              title: `${entry.code} sin codificacion`,
              detail: entry.row.descripcion || "Partida sin descripcion",
            })),
            ...report.duplicateCodificationEntries.map((entry) => ({
              rowId: entry.row.id,
              title: `${entry.row.codificacion} duplicada`,
              detail: `${entry.code} - ${entry.row.descripcion || "Sin descripcion"}`,
            })),
            ...report.incompleteEntries.map((entry) => ({
              rowId: entry.row.id,
              title: `${entry.code} incompleta`,
              detail: entry.missingLabels.join(", "),
            })),
          ])}
        </section>

        <section class="bim-section">
          <div class="bim-section-head">
            <div>
              <strong>Diferencias de metrado</strong>
              <span>Compara metrado tradicional contra metrado BIM recibido.</span>
            </div>
          </div>
          ${renderBimDifferenceList(report.differenceEntries)}
        </section>
      </div>
    </div>
  `;
}

function renderBimMetricCard(label, value, detail, tone) {
  return `
    <article class="bim-metric-card bim-metric-card--${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderLatestRevitExport(latestExport) {
  if (!latestExport) {
    return `
      <div class="bim-empty-block">
        <strong>Sin metrado BIM recibido</strong>
        <p>Cuando el add-in exporte por la API, este bloque mostrara lote, usuario, filas y cantidad total.</p>
      </div>
    `;
  }

  const modelLabel = latestExport.modelPath
    ? latestExport.modelPath.split(/[\\/]/).pop()
    : "Modelo Revit";

  return `
    <div class="bim-latest-grid">
      <span><strong>${escapeHtml(String(latestExport.totalRows || 0))}</strong> filas</span>
      <span><strong>${escapeHtml(formatAmount(latestExport.totalQuantity || 0))}</strong> cantidad</span>
      <span><strong>${escapeHtml(String(latestExport.linkedItems || 0))}</strong> partidas vinculadas</span>
      <span><strong>${escapeHtml(modelLabel)}</strong> modelo</span>
    </div>
  `;
}

function renderBimReadyTable(entries) {
  if (entries.length === 0) {
    return `
      <div class="bim-empty-block">
        <strong>No hay partidas listas</strong>
        <p>Completa Tipo de metrado, codificacion, descripcion, unidad, costo y regla de metrado en filas hoja.</p>
      </div>
    `;
  }

  return `
    <div class="bim-table-wrap">
      <table class="bim-table">
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
          ${entries.slice(0, 40).map((entry) => `
            <tr>
              <td>
                <button type="button" class="bim-row-link" data-bim-row-id="${escapeHtml(entry.row.id)}">
                  ${escapeHtml(entry.code)}
                </button>
              </td>
              <td>${escapeHtml(entry.row.codificacion)}</td>
              <td>${escapeHtml(entry.row.descripcion)}</td>
              <td>${escapeHtml(entry.row.unidad)}</td>
              <td>${escapeHtml(formatAmount(parseDecimal(entry.row.metradoBim)))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${entries.length > 40 ? `<p class="bim-more-note">Se muestran 40 de ${entries.length} partidas listas.</p>` : ""}
    </div>
  `;
}

function renderBimIssueList(items) {
  if (items.length === 0) {
    return `
      <div class="bim-empty-block">
        <strong>Sin alertas criticas</strong>
        <p>Las codificaciones Revit visibles estan completas y sin duplicados.</p>
      </div>
    `;
  }

  return `
    <div class="bim-issue-list">
      ${items.slice(0, 12).map((item) => `
        <button type="button" class="bim-issue-card" data-bim-row-id="${escapeHtml(item.rowId)}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail)}</span>
        </button>
      `).join("")}
      ${items.length > 12 ? `<p class="bim-more-note">Quedan ${items.length - 12} alertas adicionales.</p>` : ""}
    </div>
  `;
}

function renderBimDifferenceList(entries) {
  if (entries.length === 0) {
    return `
      <div class="bim-empty-block">
        <strong>Sin diferencias relevantes</strong>
        <p>No hay partidas Revit con metrado tradicional y BIM distintos.</p>
      </div>
    `;
  }

  return `
    <div class="bim-issue-list">
      ${entries.slice(0, 12).map((entry) => `
        <button type="button" class="bim-issue-card" data-bim-row-id="${escapeHtml(entry.row.id)}">
          <strong>${escapeHtml(entry.code)} - ${escapeHtml(entry.row.codificacion || "Sin codificacion")}</strong>
          <span>Trad. ${escapeHtml(formatAmount(entry.traditional))} | BIM ${escapeHtml(formatAmount(entry.bim))} | Dif. ${escapeHtml(formatSignedAmount(entry.difference))}</span>
        </button>
      `).join("")}
      ${entries.length > 12 ? `<p class="bim-more-note">Quedan ${entries.length - 12} diferencias adicionales.</p>` : ""}
    </div>
  `;
}

function buildBimControlReport(codes) {
  const leafEntries = state.rows
    .map((row, index) => ({ row, index, code: codes[index] || "" }))
    .filter((entry) => !rowHasChildren(state.rows, entry.index));
  const revitEntries = leafEntries.filter((entry) => isRevitMetradoType(entry.row.tipoMetrado));
  const codificationGroups = new Map();

  revitEntries.forEach((entry) => {
    const key = normalizeText(entry.row.codificacion).trim();
    if (!key) {
      return;
    }

    if (!codificationGroups.has(key)) {
      codificationGroups.set(key, []);
    }
    codificationGroups.get(key).push(entry);
  });

  const duplicateCodificationKeys = Array.from(codificationGroups.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([key]) => key);
  const duplicateKeySet = new Set(duplicateCodificationKeys);
  const duplicateCodificationEntries = revitEntries.filter((entry) => {
    const key = normalizeText(entry.row.codificacion).trim();
    return key && duplicateKeySet.has(key);
  });

  const incompleteEntries = revitEntries
    .map((entry) => ({
      ...entry,
      missingLabels: getMissingBimReadyLabels(entry.row),
    }))
    .filter((entry) => entry.missingLabels.length > 0);
  const incompleteIds = new Set(incompleteEntries.map((entry) => entry.row.id));
  const duplicateIds = new Set(duplicateCodificationEntries.map((entry) => entry.row.id));
  const readyEntries = revitEntries.filter((entry) => (
    !incompleteIds.has(entry.row.id)
    && !duplicateIds.has(entry.row.id)
  ));
  const missingCodificationEntries = revitEntries.filter((entry) => !String(entry.row.codificacion || "").trim());
  const metradoReceivedEntries = revitEntries.filter((entry) => parseDecimal(entry.row.metradoBim) > 0);
  const differenceEntries = revitEntries
    .map((entry) => {
      const traditional = parseDecimal(entry.row.metradoTradicional ?? entry.row.metrado);
      const bim = parseDecimal(entry.row.metradoBim);
      return {
        ...entry,
        traditional,
        bim,
        difference: bim - traditional,
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
    latestRevitExport: getCurrentProject()?.latestRevitExport || null,
  };
}

function getMissingBimReadyLabels(row) {
  const missing = [];
  if (!String(row.codificacion || "").trim()) {
    missing.push("Codificacion");
  }
  if (!String(row.descripcion || "").trim()) {
    missing.push("Descripcion");
  }
  if (!String(row.unidad || "").trim()) {
    missing.push("Unidad");
  }
  if (!String(row.costo ?? "").trim()) {
    missing.push("Costo");
  }
  if (!String(getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado) || "").trim()) {
    missing.push("Regla de metrado");
  }
  return missing;
}

function handleBimControlAction(action) {
  if (action === "open-rvt-export") {
    switchView("exportaciones-rvt");
  }
}

function formatRevitExportMeta(exportRecord) {
  const exportedAt = formatDateTime(exportRecord.exportedAt || exportRecord.createdAt);
  const user = exportRecord.userName || "Revit Addin";
  const version = exportRecord.revitVersion ? ` - ${exportRecord.revitVersion}` : "";
  return `${exportedAt} - ${user}${version}`;
}

function resetUsersState() {
  usersState.items = [];
  usersState.projects = [];
  usersState.loading = false;
  usersState.saving = false;
  usersState.error = "";
  usersState.info = "";
  usersState.editingEmail = "";
  usersState.selectedProjectId = "";
  resetUsersAddMembersState();
  usersState.loadedForToken = "";
  usersState.loaded = false;
}

function getCurrentUserRole() {
  return String(authState.user?.role || "").trim().toLowerCase();
}

function isUsersViewAllowed() {
  return getCurrentUserRole() === "superadmin";
}

function isProjectCreationAllowed() {
  if (!authState.required) {
    return true;
  }
  return getCurrentUserRole() === "superadmin";
}

function applyUsersViewAccess() {
  const canAccessUsers = isUsersViewAllowed();
  if (usersViewButton) {
    usersViewButton.hidden = !canAccessUsers;
  }

  if (!canAccessUsers && state.currentView === "usuarios") {
    state.currentView = "itemizado";
    persistUiState();
    render();
  }
}

function normalizeUserRole(roleInput) {
  const role = String(roleInput || "").trim().toLowerCase();
  return USER_ROLE_OPTIONS.includes(role) ? role : "viewer";
}

function normalizeUsersProjectIds(projectIdsInput, { allowWildcard = false } = {}) {
  const rawValues = [];
  if (Array.isArray(projectIdsInput)) {
    rawValues.push(...projectIdsInput);
  } else if (typeof projectIdsInput === "string") {
    const trimmed = projectIdsInput.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          rawValues.push(...parsed);
        } else {
          rawValues.push(...trimmed.split(/[;,]/g));
        }
      } catch {
        rawValues.push(...trimmed.split(/[;,]/g));
      }
    }
  }

  const normalized = [];
  const seen = new Set();
  rawValues.forEach((value) => {
    const projectId = String(value || "").trim();
    if (!projectId) {
      return;
    }
    if (!allowWildcard && projectId === "*") {
      return;
    }
    if (seen.has(projectId)) {
      return;
    }
    seen.add(projectId);
    normalized.push(projectId);
  });

  if (allowWildcard && normalized.includes("*")) {
    return ["*"];
  }
  return normalized;
}

function normalizeUsersProjectOptions(projectsInput) {
  const projects = Array.isArray(projectsInput) ? projectsInput : [];
  const uniqueById = new Map();
  projects.forEach((entry) => {
    const id = String(entry?.id || "").trim();
    if (!id || uniqueById.has(id)) {
      return;
    }
    uniqueById.set(id, {
      id,
      name: String(entry?.name || "Proyecto").trim() || "Proyecto",
    });
  });
  return [...uniqueById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function resolveUserProjectScopeLabel(entry, projectNameMap) {
  const role = normalizeUserRole(entry?.role);
  if (role === "superadmin") {
    return "Todos";
  }

  const projectIds = normalizeUsersProjectIds(entry?.projectIds, { allowWildcard: true });
  if (projectIds.includes("*")) {
    return "Todos";
  }
  if (projectIds.length === 0) {
    return "Sin asignar";
  }
  return projectIds
    .map((projectId) => projectNameMap.get(projectId) || projectId)
    .join(", ");
}

function getUserRoleLabel(roleInput) {
  const role = normalizeUserRole(roleInput);
  if (role === "superadmin") {
    return "Superadmin";
  }
  if (role === "admin") {
    return "Admin";
  }
  if (role === "editor") {
    return "Editor";
  }
  return "Viewer";
}

function getUsersSelectedProject() {
  const selectedProjectId = String(usersState.selectedProjectId || "").trim();
  if (!selectedProjectId) {
    return null;
  }
  return usersState.projects.find((project) => project.id === selectedProjectId) || null;
}

function getUsersProjectIdsForEntry(entry, options = {}) {
  const role = normalizeUserRole(entry?.role);
  return normalizeUsersProjectIds(entry?.projectIds, {
    allowWildcard: options.allowWildcard || role === "superadmin",
  });
}

function userHasAccessToProject(entry, projectId) {
  const role = normalizeUserRole(entry?.role);
  if (role === "superadmin") {
    return true;
  }

  const projectIds = getUsersProjectIdsForEntry(entry, { allowWildcard: true });
  return projectIds.includes("*") || projectIds.includes(projectId);
}

function userHasDirectProjectAccess(entry, projectId) {
  if (normalizeUserRole(entry?.role) === "superadmin") {
    return false;
  }
  return getUsersProjectIdsForEntry(entry).includes(projectId);
}

function getProjectMembers(projectId) {
  return usersState.items
    .filter((entry) => userHasAccessToProject(entry, projectId))
    .sort((left, right) => {
      const leftRole = normalizeUserRole(left?.role);
      const rightRole = normalizeUserRole(right?.role);
      if (leftRole === "superadmin" && rightRole !== "superadmin") {
        return -1;
      }
      if (leftRole !== "superadmin" && rightRole === "superadmin") {
        return 1;
      }
      return String(left?.email || "").localeCompare(String(right?.email || ""));
    });
}

function getUsersDisplayName(entry) {
  const displayName = String(entry?.displayName || "").trim();
  if (displayName) {
    return displayName;
  }

  const email = String(entry?.email || "").trim();
  return email ? email.split("@")[0] : "Usuario";
}

function getProjectMembershipSummary(projectId) {
  const members = getProjectMembers(projectId);
  const directMembers = members.filter((entry) => userHasDirectProjectAccess(entry, projectId));
  const activeMembers = members.filter((entry) => entry?.active !== false);
  const superadmins = members.filter((entry) => normalizeUserRole(entry?.role) === "superadmin");
  return {
    total: members.length,
    direct: directMembers.length,
    active: activeMembers.length,
    superadmins: superadmins.length,
  };
}

function selectUsersProject(projectIdInput) {
  const projectId = String(projectIdInput || "").trim();
  const exists = usersState.projects.some((project) => project.id === projectId);
  if (!exists) {
    usersState.error = "No se encontro el proyecto seleccionado.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.selectedProjectId = projectId;
  usersState.editingEmail = "";
  resetUsersAddMembersState();
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();
}

function resetUsersAddMembersState() {
  usersState.addMembersMode = false;
  usersState.memberEmailInput = "";
  usersState.memberDrafts = [];
}

function openUsersAddMembersFlow() {
  if (!getUsersSelectedProject()) {
    usersState.error = "Selecciona un proyecto antes de anadir miembros.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.addMembersMode = true;
  usersState.editingEmail = "";
  usersState.memberEmailInput = "";
  usersState.memberDrafts = [];
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();
}

function closeUsersAddMembersFlow() {
  usersState.editingEmail = "";
  resetUsersAddMembersState();
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();
}

function isValidUsersEmail(emailInput) {
  return USER_EMAIL_PATTERN.test(String(emailInput || "").trim().toLowerCase());
}

function parseUsersEmailList(emailInput) {
  const rawValues = String(emailInput || "")
    .split(/[\s,;]+/g)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const emails = [];
  const invalid = [];
  const seen = new Set();

  rawValues.forEach((email) => {
    if (!isValidUsersEmail(email)) {
      invalid.push(email);
      return;
    }
    if (seen.has(email)) {
      return;
    }
    seen.add(email);
    emails.push(email);
  });

  return { emails, invalid };
}

function getCompanyFromUsersEmail(emailInput) {
  const domain = String(emailInput || "").split("@")[1] || "";
  const company = domain.split(".")[0] || "";
  return company ? company.toUpperCase() : "";
}

function splitUsersDisplayName(displayNameInput, emailInput) {
  const displayName = String(displayNameInput || "").trim();
  if (!displayName) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = displayName.split(/\s+/g).filter(Boolean);
  if (parts.length <= 1) {
    return {
      firstName: parts[0] || "",
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
  };
}

function getUsersDraftDisplayName(draft) {
  return [draft?.firstName, draft?.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function createUsersMemberDraft(emailInput, existingUser = null) {
  const email = String(emailInput || "").trim().toLowerCase();
  const splitName = splitUsersDisplayName(existingUser?.displayName, email);
  return {
    id: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    email,
    firstName: splitName.firstName,
    lastName: splitName.lastName,
    company: getCompanyFromUsersEmail(email),
    role: normalizeUserRole(existingUser?.role || "viewer"),
    active: existingUser ? existingUser.active !== false : true,
    existing: Boolean(existingUser),
  };
}

function processUsersAddMemberEmails() {
  const inputElement = usersPanel?.querySelector("[data-users-member-email-input]");
  usersState.memberEmailInput = inputElement
    ? String(inputElement.value || "")
    : String(usersState.memberEmailInput || "");

  const { emails, invalid } = parseUsersEmailList(usersState.memberEmailInput);
  if (invalid.length > 0) {
    usersState.error = `Revisa estos correos: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "..." : ""}`;
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  if (emails.length === 0) {
    usersState.error = "Ingresa al menos un correo valido.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  const currentDraftEmails = new Set(usersState.memberDrafts.map((draft) => draft.email));
  const nextDrafts = [];
  emails.forEach((email) => {
    if (currentDraftEmails.has(email)) {
      return;
    }
    const existingUser = usersState.items.find((entry) => entry.email === email) || null;
    nextDrafts.push(createUsersMemberDraft(email, existingUser));
  });

  if (nextDrafts.length === 0) {
    usersState.error = "Esos correos ya estan en la lista de borradores.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.memberDrafts = [...usersState.memberDrafts, ...nextDrafts].slice(0, 100);
  usersState.memberEmailInput = "";
  usersState.error = "";
  usersState.info = `${nextDrafts.length} correo${nextDrafts.length === 1 ? "" : "s"} listo${nextDrafts.length === 1 ? "" : "s"} para completar.`;
  renderUsersPanel();
}

function removeUsersMemberDraft(draftIdInput) {
  const draftId = String(draftIdInput || "");
  usersState.memberDrafts = usersState.memberDrafts.filter((draft) => draft.id !== draftId);
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();
}

function handleUsersDraftInputEvent(event) {
  const emailInput = event.target.closest("[data-users-member-email-input]");
  if (emailInput) {
    usersState.memberEmailInput = String(emailInput.value || "");
    return;
  }

  const fieldElement = event.target.closest("[data-users-draft-field]");
  if (!fieldElement) {
    return;
  }

  const row = fieldElement.closest("[data-users-draft-row]");
  const draftId = String(row?.dataset.usersDraftRow || "");
  const field = String(fieldElement.dataset.usersDraftField || "");
  const draft = usersState.memberDrafts.find((entry) => entry.id === draftId);
  if (!draft || !field) {
    return;
  }

  if (field === "active") {
    draft.active = Boolean(fieldElement.checked);
    return;
  }

  if (field === "role") {
    draft.role = normalizeUserRole(fieldElement.value);
    return;
  }

  draft[field] = String(fieldElement.value || "");
}

function syncUsersMemberDraftsFromDom() {
  if (!usersPanel) {
    return;
  }

  const rows = usersPanel.querySelectorAll("[data-users-draft-row]");
  rows.forEach((row) => {
    const draftId = String(row.dataset.usersDraftRow || "");
    const draft = usersState.memberDrafts.find((entry) => entry.id === draftId);
    if (!draft) {
      return;
    }

    row.querySelectorAll("[data-users-draft-field]").forEach((fieldElement) => {
      const field = String(fieldElement.dataset.usersDraftField || "");
      if (field === "active") {
        draft.active = Boolean(fieldElement.checked);
      } else if (field === "role") {
        draft.role = normalizeUserRole(fieldElement.value);
      } else if (field) {
        draft[field] = String(fieldElement.value || "");
      }
    });
  });
}

function getUsersEditingRecord() {
  const targetEmail = String(usersState.editingEmail || "").trim().toLowerCase();
  if (!targetEmail) {
    return null;
  }

  return (
    usersState.items.find((entry) => String(entry?.email || "").trim().toLowerCase() === targetEmail)
    || null
  );
}

function formatUsersDate(timestampInput) {
  const timestamp = new Date(timestampInput);
  if (Number.isNaN(timestamp.getTime())) {
    return "-";
  }

  return timestamp.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderUsersPanel() {
  if (!usersPanel) {
    return;
  }

  if (!isUsersViewAllowed()) {
    usersPanel.innerHTML = `
      <div class="empty-state">
        <strong>Panel solo para superadmin</strong>
        <p>Inicia sesion con una cuenta superadmin para gestionar usuarios.</p>
      </div>
    `;
    return;
  }

  const availableProjects = usersState.projects;
  const projectNameMap = new Map(availableProjects.map((project) => [project.id, project.name]));
  const feedback = usersState.error
    ? `<p class="users-feedback users-feedback--error">${escapeHtml(usersState.error)}</p>`
    : usersState.info
      ? `<p class="users-feedback users-feedback--info">${escapeHtml(usersState.info)}</p>`
      : "";

  const selectedProject = getUsersSelectedProject();
  if (usersState.selectedProjectId && !selectedProject) {
    usersState.selectedProjectId = "";
  }

  if (selectedProject) {
    if (usersState.addMembersMode) {
      renderUsersAddMembersPanel(selectedProject, feedback);
      return;
    }
    renderUsersProjectMembersPanel(selectedProject, projectNameMap, feedback);
    return;
  }

  renderUsersProjectsPanel(feedback);
}

function renderUsersProjectsPanel(feedback) {
  const rows = usersState.projects
    .map((project) => {
      const summary = getProjectMembershipSummary(project.id);
      return `
        <tr class="users-project-row" data-users-action="select-project" data-project-id="${escapeHtml(project.id)}">
          <td class="users-project-name-cell">
            <span class="users-project-icon">Q</span>
            <span class="users-project-name-copy">
              <strong>${escapeHtml(project.name)}</strong>
              <small>${escapeHtml(project.id)}</small>
            </span>
          </td>
          <td><span class="users-project-type-pill">Proyecto</span></td>
          <td>
            <div class="users-project-access-copy">
              <strong>Lista manual</strong>
              <span>Por miembros asignados</span>
            </div>
          </td>
          <td>${summary.direct}</td>
          <td>${summary.superadmins}</td>
          <td><span class="users-status users-status--is-active">Activo</span></td>
          <td>
            <button type="button" class="topbar-button" data-users-action="select-project" data-project-id="${escapeHtml(project.id)}">
              Administrar
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  usersPanel.innerHTML = `
    <div class="users-admin-view">
      <div class="users-page-header">
        <div>
          <span class="users-kicker">Control de accesos</span>
          <h2>Proyectos</h2>
          <p>Selecciona un proyecto para revisar sus miembros y administrar accesos.</p>
        </div>
        <button type="button" class="topbar-button" data-users-action="refresh" ${usersState.loading ? "disabled" : ""}>
          Actualizar
        </button>
      </div>

      ${feedback}

      <div class="users-toolbar">
        <div class="users-toolbar-summary">
          <strong>${usersState.projects.length}</strong>
          <span>proyectos disponibles</span>
        </div>
        <div class="users-toolbar-summary">
          <strong>${usersState.items.length}</strong>
          <span>usuarios registrados</span>
        </div>
      </div>

      ${
        usersState.loading && !usersState.loaded
          ? `
            <div class="empty-state">
              <strong>Cargando proyectos...</strong>
              <p>Sincronizando usuarios y proyectos desde MySQL.</p>
            </div>
          `
          : usersState.projects.length === 0
            ? `
              <div class="empty-state">
                <strong>No hay proyectos disponibles</strong>
                <p>Crea un proyecto primero para poder asignar miembros.</p>
              </div>
            `
            : `
              <div class="users-table-wrap users-project-table-wrap">
                <table class="users-table users-project-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Acceso</th>
                      <th>Miembros</th>
                      <th>Superadmins</th>
                      <th>Estado</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            `
      }
    </div>
  `;
}

function renderUsersAddMembersPanel(project, feedback) {
  const draftRows = usersState.memberDrafts
    .map((draft, index) => {
      const role = normalizeUserRole(draft.role);
      return `
        <tr data-users-draft-row="${escapeHtml(draft.id)}">
          <td><input type="checkbox" checked aria-label="Seleccionar ${escapeHtml(draft.email)}" /></td>
          <td>
            <input
              type="text"
              class="users-input users-input--readonly"
              value="${escapeHtml(draft.email)}"
              readonly
              title="${escapeHtml(draft.email)}"
            />
          </td>
          <td>
            <input
              type="text"
              class="users-input"
              data-users-draft-field="firstName"
              value="${escapeHtml(draft.firstName)}"
              placeholder="Nombre"
              maxlength="80"
            />
          </td>
          <td>
            <input
              type="text"
              class="users-input"
              data-users-draft-field="lastName"
              value="${escapeHtml(draft.lastName)}"
              placeholder="Apellidos"
              maxlength="100"
            />
          </td>
          <td>
            <input
              type="text"
              class="users-input"
              data-users-draft-field="company"
              value="${escapeHtml(draft.company)}"
              placeholder="Empresa"
              maxlength="120"
            />
          </td>
          <td>
            <select class="users-select" data-users-draft-field="role">
              ${USER_ROLE_OPTIONS
                .map((option) => {
                  const selected = option === role ? " selected" : "";
                  return `<option value="${option}"${selected}>${escapeHtml(getUserRoleLabel(option))}</option>`;
                })
                .join("")}
            </select>
          </td>
          <td>
            <label class="users-draft-active">
              <input type="checkbox" data-users-draft-field="active" ${draft.active ? "checked" : ""} />
              <span>${draft.active ? "Activo" : "Inactivo"}</span>
            </label>
          </td>
          <td>
            <button
              type="button"
              class="users-btn-icon-subtle"
              data-users-action="remove-member-draft"
              data-draft-id="${escapeHtml(draft.id)}"
              aria-label="Quitar borrador ${index + 1}"
            >
              x
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  usersPanel.innerHTML = `
    <div class="users-admin-view users-admin-view--add-members">
      <div class="users-page-header">
        <div>
          <div class="users-breadcrumb">
            <button type="button" data-users-action="back-projects">Proyectos</button>
            <span>/</span>
            <button type="button" data-users-action="cancel-add-members">${escapeHtml(project.name)}</button>
            <span>/</span>
          </div>
          <h2>Anadir miembros al proyecto</h2>
          <p>${escapeHtml(project.name)}</p>
        </div>
      </div>

      ${feedback}

      <div class="users-add-members-box">
        <label for="users-bulk-email-input">
          Numero maximo de 100 direcciones de correo electronico <span class="users-required">*</span>
        </label>
        <div class="users-bulk-input-container">
          <textarea
            id="users-bulk-email-input"
            data-users-member-email-input
            placeholder="persona@empresa.com, otra@empresa.com..."
          >${escapeHtml(usersState.memberEmailInput)}</textarea>
          <button
            type="button"
            class="topbar-button"
            data-users-action="process-member-emails"
            ${usersState.saving ? "disabled" : ""}
          >
            Intro
          </button>
        </div>

        <div class="users-manual-entry-panel">
          <div>
            <strong>Ingreso manual</strong>
            <span>Agrega correos y completa nombre, empresa, estado y rol antes de guardar.</span>
          </div>
        </div>
      </div>

      ${
        usersState.memberDrafts.length > 0
          ? `
            <div class="users-table-wrap users-drafts-table-wrap">
              <table class="users-table users-drafts-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Correo electronico</th>
                    <th>Nombre</th>
                    <th>Apellidos</th>
                    <th>Empresa</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${draftRows}</tbody>
              </table>
            </div>
          `
          : ""
      }

      <div class="users-footer-actions">
        <button type="button" class="topbar-button" data-users-action="cancel-add-members" ${usersState.saving ? "disabled" : ""}>
          Cancelar
        </button>
        <button
          type="button"
          class="topbar-button topbar-button--primary"
          data-users-action="save-member-drafts"
          ${usersState.memberDrafts.length === 0 || usersState.saving ? "disabled" : ""}
        >
          ${usersState.saving ? "Anadiendo..." : `Anadir ${usersState.memberDrafts.length || ""} miembros`}
        </button>
      </div>
    </div>
  `;
}

function renderUsersProjectMembersPanel(project, projectNameMap, feedback) {
  const members = getProjectMembers(project.id);
  const summary = getProjectMembershipSummary(project.id);

  const memberRows = members
    .map((entry) => {
      const rowEmail = String(entry.email || "").trim().toLowerCase();
      const isEditing = rowEmail === String(usersState.editingEmail || "").trim().toLowerCase();
      const entryRole = normalizeUserRole(entry.role);
      const projectScopeLabel = resolveUserProjectScopeLabel(entry, projectNameMap);
      const activeLabel = entry.active !== false ? "Activo" : "Inactivo";
      const activeClass = entry.active !== false ? "is-active" : "is-inactive";
      const scopeLabel = entryRole === "superadmin" ? "Acceso total" : "Miembro directo";
      const canRemove = entryRole !== "superadmin" && userHasDirectProjectAccess(entry, project.id);

      return `
        <tr class="${isEditing ? "is-selected" : ""}">
          <td>
            <div class="users-member-cell">
              <span class="users-member-avatar">${escapeHtml(getUserInitials(entry))}</span>
              <span>
                <strong>${escapeHtml(getUsersDisplayName(entry))}</strong>
                <small>${escapeHtml(entry.email || "")}</small>
              </span>
            </div>
          </td>
          <td><span class="users-role-pill">${escapeHtml(getUserRoleLabel(entryRole))}</span></td>
          <td><span class="users-status users-status--${activeClass}">${activeLabel}</span></td>
          <td class="users-project-scope-cell" title="${escapeHtml(projectScopeLabel)}">${escapeHtml(scopeLabel)}</td>
          <td>${escapeHtml(formatUsersDate(entry.updatedAt || entry.createdAt))}</td>
          <td>
            <div class="users-row-actions">
              ${
                canRemove
                  ? `
                    <button
                      type="button"
                      class="topbar-button"
                      data-users-action="edit"
                      data-user-email="${escapeHtml(entry.email || "")}"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="topbar-button topbar-button--danger"
                      data-users-action="remove-project-member"
                      data-user-email="${escapeHtml(entry.email || "")}"
                      ${usersState.saving ? "disabled" : ""}
                    >
                      Quitar
                    </button>
                  `
                  : `<span class="users-action-muted">Acceso total</span>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  usersPanel.innerHTML = `
    <div class="users-admin-view users-admin-view--members">
      <div class="users-page-header">
        <div>
          <div class="users-breadcrumb">
            <button type="button" data-users-action="back-projects">Proyectos</button>
            <span>/</span>
            <strong>${escapeHtml(project.name)}</strong>
          </div>
          <h2>Miembros del proyecto</h2>
          <p>Administra quienes pueden ver o editar este proyecto dentro de Quantiva.</p>
        </div>
        <button type="button" class="topbar-button" data-users-action="refresh" ${usersState.loading ? "disabled" : ""}>
          Actualizar
        </button>
      </div>

      ${feedback}

      <div class="users-toolbar">
        <button type="button" class="topbar-button topbar-button--primary" data-users-action="new-member">
          Anadir miembros
        </button>
        <div class="users-toolbar-summary">
          <strong>${summary.active}</strong>
          <span>miembros activos</span>
        </div>
        <div class="users-toolbar-summary">
          <strong>${summary.direct}</strong>
          <span>asignados directo</span>
        </div>
      </div>

      <section class="users-card users-member-list-card users-member-list-card--full">
        <div class="users-card-head">
          <strong>${escapeHtml(project.name)}</strong>
          <span class="users-count-pill">${members.length}</span>
        </div>
        ${
          usersState.loading && !usersState.loaded
            ? `
              <div class="empty-state">
                <strong>Cargando miembros...</strong>
                <p>Sincronizando la lista desde MySQL.</p>
              </div>
            `
            : members.length === 0
              ? `
                <div class="empty-state">
                  <strong>Sin miembros directos</strong>
                  <p>Anade el primer miembro para habilitar acceso a este proyecto.</p>
                </div>
              `
              : `
                <div class="users-table-wrap">
                  <table class="users-table users-members-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Alcance</th>
                        <th>Actualizado</th>
                        <th>Accion</th>
                      </tr>
                    </thead>
                    <tbody>${memberRows}</tbody>
                  </table>
                </div>
              `
        }
      </section>
    </div>
  `;
}

function startUsersEdit(emailInput) {
  const email = String(emailInput || "").trim().toLowerCase();
  if (!email) {
    return;
  }

  const user = usersState.items.find((entry) => entry.email === email) || null;
  if (!user) {
    usersState.error = "No se encontro el usuario seleccionado.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.editingEmail = email;
  usersState.addMembersMode = true;
  usersState.memberEmailInput = "";
  usersState.memberDrafts = [createUsersMemberDraft(email, user)];
  usersState.error = "";
  usersState.info = `Editando ${email}`;
  renderUsersPanel();
}

async function loadUsersForPanel({ force = false } = {}) {
  if (!isUsersViewAllowed()) {
    return;
  }

  if (usersState.loading) {
    return;
  }

  if (
    !force
    && usersState.loadedForToken === authState.token
    && usersState.loaded
  ) {
    return;
  }

  usersState.loading = true;
  usersState.error = "";
  if (state.currentView === "usuarios") {
    renderUsersPanel();
  }

  try {
    const response = await window.fetch(AUTH_USERS_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    });

    if (response.status === 401) {
      handleUnauthorizedAccess("Tu sesion vencio. Vuelve a iniciar sesion.");
      return;
    }

    const payload = await response.json().catch(() => ({}));
    if (response.status === 403) {
      usersState.error = payload?.error || "Solo superadmin puede gestionar usuarios.";
      usersState.items = [];
      usersState.projects = [];
      return;
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Error ${response.status}`);
    }

    usersState.items = Array.isArray(payload.users)
      ? payload.users
        .map((entry) => ({
          ...entry,
          email: String(entry?.email || "").trim().toLowerCase(),
          displayName: String(entry?.displayName || "").trim(),
          role: normalizeUserRole(entry?.role),
          active: entry?.active !== false,
          projectIds: normalizeUserRole(entry?.role) === "superadmin"
            ? ["*"]
            : normalizeUsersProjectIds(entry?.projectIds, { allowWildcard: false }),
        }))
        .sort((left, right) => left.email.localeCompare(right.email))
      : [];
    usersState.projects = normalizeUsersProjectOptions(payload?.projects);
    usersState.loadedForToken = authState.token;
    usersState.loaded = true;

    if (
      usersState.selectedProjectId
      && !usersState.projects.some((project) => project.id === usersState.selectedProjectId)
    ) {
      usersState.selectedProjectId = "";
    }

    if (usersState.editingEmail) {
      const stillExists = usersState.items.some((entry) => entry.email === usersState.editingEmail);
      if (!stillExists) {
        usersState.editingEmail = "";
      }
    }
  } catch (error) {
    usersState.error =
      error instanceof Error
        ? error.message
        : "No se pudo cargar la lista de usuarios.";
  } finally {
    usersState.loading = false;
    if (state.currentView === "usuarios") {
      renderUsersPanel();
    }
  }
}

async function handleUsersFormSubmit(formElement) {
  if (!isUsersViewAllowed() || usersState.saving) {
    return;
  }

  const formData = new FormData(formElement);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") || "").trim();
  const role = normalizeUserRole(formData.get("role"));
  const projectIds = role === "superadmin"
    ? ["*"]
    : normalizeUsersProjectIds(formData.getAll("projectIds"), { allowWildcard: false });
  const active = formData.get("active") === "on";
  const wasEditing = Boolean(usersState.editingEmail);

  if (!email || !displayName) {
    usersState.error = "Debes completar nombre y correo.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  if (role !== "superadmin" && active && usersState.projects.length > 0 && projectIds.length === 0) {
    usersState.error = "Debes asignar al menos un proyecto al usuario activo.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.saving = true;
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();

  try {
    const payload = {
      email,
      displayName,
      role,
      projectIds,
      active,
    };

    const response = await window.fetch(AUTH_USERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      handleUnauthorizedAccess("Tu sesion vencio. Vuelve a iniciar sesion.");
      return;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Error ${response.status}`);
    }

    const savedEmail = String(result?.user?.email || email).trim().toLowerCase();
    usersState.editingEmail = savedEmail;
    usersState.info = wasEditing
      ? "Usuario actualizado correctamente."
      : "Usuario creado correctamente.";

    await loadUsersForPanel({ force: true });
  } catch (error) {
    usersState.error =
      error instanceof Error
        ? error.message
        : "No se pudo guardar el usuario.";
  } finally {
    usersState.saving = false;
    if (state.currentView === "usuarios") {
      renderUsersPanel();
    }
  }
}

async function saveUsersMemberDrafts() {
  if (!isUsersViewAllowed() || usersState.saving) {
    return;
  }

  syncUsersMemberDraftsFromDom();

  const selectedProject = getUsersSelectedProject();
  if (!selectedProject) {
    usersState.error = "Selecciona un proyecto valido para asignar miembros.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  if (usersState.memberDrafts.length === 0) {
    usersState.error = "Agrega al menos un correo antes de guardar.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  const invalidDraft = usersState.memberDrafts.find((draft) => !isValidUsersEmail(draft.email));
  if (invalidDraft) {
    usersState.error = `Revisa el correo ${invalidDraft.email}.`;
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  const missingNameDraft = usersState.memberDrafts.find((draft) => !String(draft.firstName || "").trim());
  if (missingNameDraft) {
    usersState.error = `Completa el nombre para ${missingNameDraft.email}.`;
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.saving = true;
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();

  try {
    for (const draft of usersState.memberDrafts) {
      const email = String(draft.email || "").trim().toLowerCase();
      const existingUser = usersState.items.find((entry) => entry.email === email) || null;
      const existingRole = normalizeUserRole(existingUser?.role);
      const requestedRole = normalizeUserRole(draft.role);
      const displayName = getUsersDraftDisplayName(draft);
      const active = draft.active !== false;

      if (existingRole === "superadmin" && requestedRole !== "superadmin") {
        throw new Error(`El usuario ${email} ya es superadmin y tiene acceso total.`);
      }

      const projectIds = requestedRole === "superadmin"
        ? ["*"]
        : normalizeUsersProjectIds([
          ...normalizeUsersProjectIds(existingUser?.projectIds, { allowWildcard: false }),
          selectedProject.id,
        ], { allowWildcard: false });

      const response = await window.fetch(AUTH_USERS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          email,
          displayName,
          role: requestedRole,
          projectIds,
          active,
        }),
      });

      if (response.status === 401) {
        handleUnauthorizedAccess("Tu sesion vencio. Vuelve a iniciar sesion.");
        return;
      }

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || `No se pudo guardar ${email}.`);
      }
    }

    const savedCount = usersState.memberDrafts.length;
    resetUsersAddMembersState();
    usersState.editingEmail = "";
    usersState.info = `${savedCount} miembro${savedCount === 1 ? "" : "s"} actualizado${savedCount === 1 ? "" : "s"} en ${selectedProject.name}.`;
    await loadUsersForPanel({ force: true });
  } catch (error) {
    usersState.error =
      error instanceof Error
        ? error.message
        : "No se pudieron guardar los miembros.";
  } finally {
    usersState.saving = false;
    if (state.currentView === "usuarios") {
      renderUsersPanel();
    }
  }
}

async function handleProjectMemberFormSubmit(formElement) {
  if (!isUsersViewAllowed() || usersState.saving) {
    return;
  }

  const formData = new FormData(formElement);
  const projectId = String(formData.get("projectId") || usersState.selectedProjectId || "").trim();
  const selectedProject = usersState.projects.find((project) => project.id === projectId);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") || "").trim();
  const requestedRole = normalizeUserRole(formData.get("role"));
  const active = formData.get("active") === "on";
  const existingUser = usersState.items.find((entry) => entry.email === email) || null;
  const existingRole = normalizeUserRole(existingUser?.role);
  const wasEditing = Boolean(usersState.editingEmail);

  if (!selectedProject) {
    usersState.error = "Selecciona un proyecto valido para asignar el miembro.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  if (!email || !displayName) {
    usersState.error = "Debes completar nombre y correo.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  if (existingRole === "superadmin" && requestedRole !== "superadmin") {
    usersState.error = "Este usuario ya es superadmin y tiene acceso total. Cambia su rol desde un flujo global antes de limitarlo.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  const projectIds = requestedRole === "superadmin"
    ? ["*"]
    : normalizeUsersProjectIds([
      ...normalizeUsersProjectIds(existingUser?.projectIds, { allowWildcard: false }),
      selectedProject.id,
    ], { allowWildcard: false });

  if (requestedRole !== "superadmin" && active && projectIds.length === 0) {
    usersState.error = "Debes asignar al menos un proyecto al usuario activo.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  usersState.saving = true;
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();

  try {
    const response = await window.fetch(AUTH_USERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        email,
        displayName,
        role: requestedRole,
        projectIds,
        active,
      }),
    });

    if (response.status === 401) {
      handleUnauthorizedAccess("Tu sesion vencio. Vuelve a iniciar sesion.");
      return;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Error ${response.status}`);
    }

    usersState.editingEmail = "";
    usersState.info = wasEditing
      ? "Miembro actualizado correctamente."
      : `Miembro agregado a ${selectedProject.name}.`;

    await loadUsersForPanel({ force: true });
  } catch (error) {
    usersState.error =
      error instanceof Error
        ? error.message
        : "No se pudo guardar el miembro.";
  } finally {
    usersState.saving = false;
    if (state.currentView === "usuarios") {
      renderUsersPanel();
    }
  }
}

async function removeUserFromSelectedProject(emailInput) {
  if (!isUsersViewAllowed() || usersState.saving) {
    return;
  }

  const selectedProject = getUsersSelectedProject();
  const email = String(emailInput || "").trim().toLowerCase();
  const user = usersState.items.find((entry) => entry.email === email) || null;

  if (!selectedProject || !user) {
    usersState.error = "No se encontro el miembro seleccionado.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  const role = normalizeUserRole(user.role);
  const currentProjectIds = getUsersProjectIdsForEntry(user, { allowWildcard: true });
  if (role === "superadmin" || currentProjectIds.includes("*")) {
    usersState.error = "No puedes quitar un superadmin desde un proyecto porque tiene acceso total.";
    usersState.info = "";
    renderUsersPanel();
    return;
  }

  const nextProjectIds = currentProjectIds.filter((projectId) => projectId !== selectedProject.id);
  const nextActive = nextProjectIds.length > 0 && user.active !== false;

  usersState.saving = true;
  usersState.error = "";
  usersState.info = "";
  renderUsersPanel();

  try {
    const response = await window.fetch(AUTH_USERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        email: user.email,
        displayName: getUsersDisplayName(user),
        role,
        projectIds: nextProjectIds,
        active: nextActive,
      }),
    });

    if (response.status === 401) {
      handleUnauthorizedAccess("Tu sesion vencio. Vuelve a iniciar sesion.");
      return;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Error ${response.status}`);
    }

    usersState.editingEmail = "";
    usersState.info = `${user.email} fue quitado de ${selectedProject.name}.`;
    await loadUsersForPanel({ force: true });
  } catch (error) {
    usersState.error =
      error instanceof Error
        ? error.message
        : "No se pudo quitar el miembro del proyecto.";
  } finally {
    usersState.saving = false;
    if (state.currentView === "usuarios") {
      renderUsersPanel();
    }
  }
}

function renderAuditPanel(codes) {
  const selectedIndex = getSelectedIndex();
  const selectedRow = state.rows[selectedIndex];
  const selectedPartidaCode = selectedIndex >= 0 ? codes[selectedIndex] : "";

  if (!selectedRow) {
    auditPanel.innerHTML = `
      <div class="audit-entry-empty">
        <strong>Selecciona una fila</strong>
        <p>Elige una partida de la matriz para ver su seguimiento.</p>
      </div>
    `;
    return;
  }

  const entries = state.auditEntries
    .filter((entry) => entry.rowId === selectedRow.id)
    .filter((entry) => doesAuditEntryMatchFilter(entry, state.auditFilter))
    .slice()
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  const title = selectedRow.descripcion.trim() || selectedRow.codificacion.trim() || selectedPartidaCode;

  auditPanel.innerHTML = `
    <div class="audit-panel-head">
      <div class="audit-panel-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(selectedPartidaCode)}${selectedRow.codificacion ? ` | ${escapeHtml(selectedRow.codificacion)}` : ""}</span>
      </div>
      <div class="audit-filter-row" role="group" aria-label="Filtros de auditoria">
        ${renderAuditFilterButtons()}
      </div>
    </div>
    ${
      entries.length === 0
        ? `
          <div class="audit-entry-empty">
            <strong>${getAuditEmptyTitle()}</strong>
            <p>Esta fila todavía no registra movimientos ni ediciones en el historial.</p>
          </div>
        `
        : `
          <div class="audit-entry-list">
            ${entries.map((entry) => renderAuditEntry(entry)).join("")}
          </div>
        `
    }
  `;
}

function renderAuditFilterButtons() {
  return Object.entries(AUDIT_FILTER_CONFIGS)
    .map(([key, config]) => {
      const activeClass = key === state.auditFilter ? " is-active" : "";
      return `
        <button
          type="button"
          class="audit-filter-button${activeClass}"
          data-audit-filter="${key}"
        >
          ${escapeHtml(config.label)}
        </button>
      `;
    })
    .join("");
}

function getAuditEmptyTitle() {
  return state.auditFilter === "all"
    ? "Sin cambios auditados"
    : "Sin cambios para este filtro";
}

function doesAuditEntryMatchFilter(entry, filterKey) {
  if (filterKey === "today") {
    return isTimestampToday(entry.timestamp);
  }

  if (filterKey === "structure") {
    return entry.type === "structure";
  }

  if (filterKey === "cost") {
    return ["costo", "metradoTradicional", "metradoBim", "tipoMetrado", "reglaMetrado"].includes(entry.field);
  }

  return true;
}

function isTimestampToday(timestamp) {
  const entryDate = new Date(timestamp);
  const now = new Date();

  return (
    entryDate.getFullYear() === now.getFullYear()
    && entryDate.getMonth() === now.getMonth()
    && entryDate.getDate() === now.getDate()
  );
}

function renderAuditEntry(entry) {
  return `
    <article class="audit-entry-card">
      <strong>${escapeHtml(getAuditEntryTitle(entry))}</strong>
      <span class="audit-entry-meta">${escapeHtml(formatAuditEntryMeta(entry))}</span>
      <p class="audit-entry-detail">${escapeHtml(getAuditEntryDetail(entry))}</p>
    </article>
  `;
}

function renderSnapshotPanel() {
  const snapshots = state.snapshots
    .slice()
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  snapshotPanel.innerHTML = `
    <div class="snapshot-panel-head">
      <div class="snapshot-panel-title">
        <strong>Historial de fotos del presupuesto</strong>
        <span>Las fotos quedan guardadas en la base local del proyecto para comparar versiones y seguir su evolucion.</span>
      </div>
      <span class="table-meta-pill">
        <strong>${snapshots.length}</strong> fotos
      </span>
    </div>
    ${renderSnapshotChartSection()}
    ${renderSnapshotTimelineSection()}
    ${renderSnapshotComparisonSection()}
    ${
      snapshots.length === 0
        ? `
          <div class="audit-entry-empty">
            <strong>Aun no hay fotos guardadas</strong>
            <p>Usa el boton Guardar foto para congelar una version historica del presupuesto actual y habilitar la curva de evolucion.</p>
          </div>
        `
        : `
          <div class="snapshot-grid">
            ${snapshots.map((snapshot) => renderSnapshotCard(snapshot)).join("")}
          </div>
        `
    }
  `;
}

function renderSnapshotCard(snapshot) {
  const summary = snapshot.summary || buildSnapshotSummary(snapshot.rows);
  const previousSnapshot = getPreviousSnapshot(snapshot.id);
  const previousSummary = previousSnapshot
    ? previousSnapshot.summary || buildSnapshotSummary(previousSnapshot.rows)
    : null;
  const totalDelta = previousSummary
    ? summary.grandTotal - previousSummary.grandTotal
    : null;

  return `
    <article class="snapshot-card">
      <div class="snapshot-card-head">
        <div class="snapshot-card-title">
          <strong>${escapeHtml(snapshot.name)}</strong>
          <span>${escapeHtml(formatSnapshotMeta(snapshot))}</span>
        </div>
        <span class="snapshot-card-date">${escapeHtml(formatSnapshotDate(snapshot.createdAt))}</span>
      </div>
      <div class="snapshot-card-stats">
        <span class="snapshot-stat-pill">
          <span>Total</span>
          <strong>${escapeHtml(formatAmount(summary.grandTotal))}</strong>
        </span>
        <span class="snapshot-stat-pill">
          <span>Partidas</span>
          <strong>${summary.rowCount}</strong>
        </span>
        <span class="snapshot-stat-pill">
          <span>Raices</span>
          <strong>${summary.rootCount}</strong>
        </span>
        <span class="snapshot-stat-pill">
          <span>Metrado trad.</span>
          <strong>${escapeHtml(formatAmount(summary.metradoTradicionalTotal))}</strong>
        </span>
        <span class="snapshot-stat-pill ${getDeltaToneClass(totalDelta)}">
          <span>Vs anterior</span>
          <strong>${escapeHtml(totalDelta === null ? "Base" : formatSignedAmount(totalDelta))}</strong>
        </span>
      </div>
      <div class="snapshot-card-actions">
        <button
          type="button"
          class="topbar-button"
          data-snapshot-action="compare-current"
          data-snapshot-id="${snapshot.id}"
        >
          Comparar con actual
        </button>
        <button
          type="button"
          class="topbar-button"
          data-snapshot-action="download"
          data-snapshot-id="${snapshot.id}"
        >
          Descargar JSON
        </button>
        <button
          type="button"
          class="topbar-button topbar-button--danger"
          data-snapshot-action="delete"
          data-snapshot-id="${snapshot.id}"
        >
          Eliminar
        </button>
      </div>
    </article>
  `;
}

function renderSnapshotChartSection() {
  const versions = getBudgetTimelineVersions();
  if (versions.length === 0) {
    return "";
  }

  if (versions.length < 2) {
    const currentVersion = versions[0];

    return `
      <section class="snapshot-section snapshot-section--chart">
        <div class="snapshot-section-head">
          <strong>Grafico de evolucion</strong>
          <span>El grafico aparece en cuanto tengas al menos una foto guardada para compararla contra el presupuesto actual.</span>
        </div>
        <div class="snapshot-chart-empty">
          <strong>Aun no hay suficientes versiones para trazar la curva</strong>
          <p>Presiona <strong>Guardar foto</strong> en Presupuesto y la evolucion se dibujara aqui automaticamente.</p>
          <span class="snapshot-summary-pill">
            <strong>Actual</strong>
            ${escapeHtml(formatAmount(currentVersion.summary.grandTotal))}
          </span>
        </div>
      </section>
    `;
  }

  const geometry = buildSnapshotChartGeometry(versions);

  return `
    <section class="snapshot-section snapshot-section--chart">
      <div class="snapshot-section-head">
        <strong>Grafico de evolucion</strong>
        <span>La curva usa las fotos guardadas y el presupuesto actual para mostrar como crece o baja el total.</span>
      </div>
      <div class="snapshot-chart-wrap">
        <svg class="snapshot-chart" viewBox="0 0 ${geometry.width} ${geometry.height}" role="img" aria-label="Grafico historico del presupuesto">
          ${geometry.gridLines
            .map((gridLine) => `
              <line
                x1="${gridLine.x1}"
                y1="${gridLine.y1}"
                x2="${gridLine.x2}"
                y2="${gridLine.y2}"
                class="snapshot-chart-grid"
              ></line>
            `)
            .join("")}
          <path class="snapshot-chart-area" d="${geometry.areaPath}"></path>
          <path class="snapshot-chart-line" d="${geometry.linePath}"></path>
          ${geometry.points
            .map((point) => `
              <g class="snapshot-chart-point${point.isCurrent ? " is-current" : ""}">
                <circle cx="${point.x}" cy="${point.y}" r="4.5"></circle>
                <title>${escapeHtml(point.label)} | ${escapeHtml(point.dateLabel)} | ${escapeHtml(formatAmount(point.total))}</title>
              </g>
            `)
            .join("")}
        </svg>
      </div>
      <div class="snapshot-chart-legend">
        ${geometry.points
          .map((point) => `
            <span class="snapshot-summary-pill">
              <strong>${escapeHtml(point.shortLabel)}</strong>
              ${escapeHtml(formatAmount(point.total))}
            </span>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderSnapshotTimelineSection() {
  const versions = getBudgetTimelineVersions();
  if (versions.length === 0) {
    return "";
  }

  const maxTotal = versions.reduce((max, version) => {
    return Math.max(max, version.summary.grandTotal);
  }, 0);

  return `
    <section class="snapshot-section">
      <div class="snapshot-section-head">
        <strong>Serie historica local</strong>
        <span>Cada version queda lista para graficar el crecimiento del presupuesto en el tiempo.</span>
      </div>
      <div class="snapshot-history-list">
        ${versions
          .map((version, index) => {
            const previous = versions[index - 1] || null;
            const delta = previous
              ? version.summary.grandTotal - previous.summary.grandTotal
              : null;
            const width = maxTotal > 0
              ? Math.max(6, (version.summary.grandTotal / maxTotal) * 100)
              : 6;

            return renderSnapshotTimelineItem(version, delta, width);
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderSnapshotTimelineItem(version, delta, width) {
  return `
    <article class="snapshot-history-item${version.id === "current" ? " is-current" : ""}">
      <div class="snapshot-history-row">
        <div class="snapshot-history-copy">
          <strong>${escapeHtml(getBudgetVersionLabel(version))}</strong>
          <span>${escapeHtml(formatSnapshotDate(version.createdAt))}</span>
        </div>
        <div class="snapshot-history-total">
          <strong>${escapeHtml(formatAmount(version.summary.grandTotal))}</strong>
          <span class="${getDeltaToneClass(delta)}">${escapeHtml(delta === null ? "Punto inicial" : formatSignedAmount(delta))}</span>
        </div>
      </div>
      <div class="snapshot-history-bar">
        <span style="width: ${Math.min(width, 100).toFixed(2)}%"></span>
      </div>
    </article>
  `;
}

function buildSnapshotChartGeometry(versions) {
  const width = 760;
  const height = 240;
  const padding = {
    top: 20,
    right: 24,
    bottom: 32,
    left: 24,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const totals = versions.map((version) => version.summary.grandTotal);
  const maxTotal = Math.max(...totals, 1);
  const pointCount = Math.max(versions.length - 1, 1);

  const points = versions.map((version, index) => {
    const x = padding.left + (plotWidth * index) / pointCount;
    const y = padding.top + plotHeight - ((version.summary.grandTotal / maxTotal) * plotHeight);
    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      total: version.summary.grandTotal,
      label: getBudgetVersionLabel(version),
      shortLabel: version.id === "current" ? "Actual" : `V${version.versionNumber}`,
      dateLabel: formatSnapshotDate(version.createdAt),
      isCurrent: version.id === "current",
    };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + plotHeight - (plotHeight * ratio);
    return {
      x1: padding.left,
      y1: Number(y.toFixed(2)),
      x2: width - padding.right,
      y2: Number(y.toFixed(2)),
    };
  });

  return {
    width,
    height,
    linePath,
    areaPath,
    gridLines,
    points,
  };
}

function renderSnapshotComparisonSection() {
  const options = getBudgetVersionOptions();
  if (options.length < 2) {
    return `
      <section class="snapshot-section">
        <div class="snapshot-section-head">
          <strong>Comparacion de versiones</strong>
          <span>Guarda al menos una foto para habilitar comparacion contra el presupuesto actual.</span>
        </div>
      </section>
    `;
  }

  ensureSnapshotComparisonSelection();

  const baseVersion = findBudgetVersionById(state.snapshotCompareBaseId);
  const targetVersion = findBudgetVersionById(state.snapshotCompareTargetId);

  if (!baseVersion || !targetVersion || baseVersion.id === targetVersion.id) {
    return `
      <section class="snapshot-section">
        <div class="snapshot-section-head">
          <strong>Comparacion de versiones</strong>
          <span>Elige dos versiones distintas para revisar diferencias.</span>
        </div>
      </section>
    `;
  }

  const comparison = buildBudgetComparison(baseVersion, targetVersion);
  const visibleChanges = comparison.changes.slice(0, 8);
  const hiddenChangesCount = Math.max(comparison.changes.length - visibleChanges.length, 0);

  return `
    <section class="snapshot-section snapshot-section--compare">
      <div class="snapshot-section-head">
        <strong>Comparacion de versiones</strong>
        <span>${escapeHtml(getBudgetVersionLabel(baseVersion))} -> ${escapeHtml(getBudgetVersionLabel(targetVersion))}</span>
      </div>
      <div class="snapshot-compare-controls">
        <label class="snapshot-compare-field">
          <span>Base</span>
          <select class="snapshot-compare-select" data-snapshot-compare="base">
            ${renderBudgetVersionOptions(options, state.snapshotCompareBaseId)}
          </select>
        </label>
        <label class="snapshot-compare-field">
          <span>Objetivo</span>
          <select class="snapshot-compare-select" data-snapshot-compare="target">
            ${renderBudgetVersionOptions(options, state.snapshotCompareTargetId)}
          </select>
        </label>
      </div>
      <div class="snapshot-card-stats">
        ${renderComparisonStatPill("Delta total", formatSignedAmount(comparison.deltas.grandTotal), comparison.deltas.grandTotal)}
        ${renderComparisonStatPill("Variacion", formatSignedPercent(comparison.deltaPercent), comparison.deltaPercent)}
        ${renderComparisonStatPill("Metrado trad.", formatSignedAmount(comparison.deltas.metradoTradicionalTotal), comparison.deltas.metradoTradicionalTotal)}
        ${renderComparisonStatPill("Metrado BIM", formatSignedAmount(comparison.deltas.metradoBimTotal), comparison.deltas.metradoBimTotal)}
        ${renderComparisonStatPill("Partidas", formatSignedInteger(comparison.deltas.rowCount), comparison.deltas.rowCount)}
      </div>
      <div class="snapshot-compare-summary">
        <span class="snapshot-summary-pill">Agregadas: <strong>${comparison.counts.added}</strong></span>
        <span class="snapshot-summary-pill">Eliminadas: <strong>${comparison.counts.removed}</strong></span>
        <span class="snapshot-summary-pill">Editadas: <strong>${comparison.counts.updated}</strong></span>
        <span class="snapshot-summary-pill">Total base: <strong>${escapeHtml(formatAmount(comparison.baseSummary.grandTotal))}</strong></span>
        <span class="snapshot-summary-pill">Total objetivo: <strong>${escapeHtml(formatAmount(comparison.targetSummary.grandTotal))}</strong></span>
      </div>
      ${
        visibleChanges.length === 0
          ? `
            <div class="audit-entry-empty">
              <strong>Sin cambios directos detectados</strong>
              <p>No hay partidas agregadas, eliminadas ni editadas entre estas dos versiones.</p>
            </div>
          `
          : `
            <div class="snapshot-change-list">
              ${visibleChanges.map((change) => renderSnapshotChangeCard(change)).join("")}
            </div>
            ${
              hiddenChangesCount > 0
                ? `<p class="snapshot-more-note">Quedan ${hiddenChangesCount} cambios adicionales fuera del resumen rapido.</p>`
                : ""
            }
          `
      }
    </section>
  `;
}

function renderBudgetVersionOptions(options, selectedId) {
  return options
    .map((option) => {
      const selected = option.id === selectedId ? " selected" : "";
      return `<option value="${option.id}"${selected}>${escapeHtml(getBudgetVersionLabel(option))}</option>`;
    })
    .join("");
}

function renderComparisonStatPill(label, value, deltaValue) {
  return `
    <span class="snapshot-stat-pill ${getDeltaToneClass(deltaValue)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </span>
  `;
}

function renderSnapshotChangeCard(change) {
  return `
    <article class="snapshot-change-card">
      <strong>${escapeHtml(change.title)}</strong>
      <span class="audit-entry-meta">${escapeHtml(change.meta)}</span>
      <p class="audit-entry-detail">${escapeHtml(change.detail)}</p>
    </article>
  `;
}

function getAuditEntryTitle(entry) {
  if (entry.type === "structure") {
    return "Cambio de estructura";
  }

  return getFieldLabel(entry.field);
}

function getAuditEntryDetail(entry) {
  if (entry.type === "structure") {
    return `Nivel ${entry.beforeLevel} / ${entry.beforePartidaCode} -> Nivel ${entry.afterLevel} / ${entry.afterPartidaCode}`;
  }

  return `${formatAuditValue(entry.beforeValue)} -> ${formatAuditValue(entry.afterValue)}`;
}

function formatAuditEntryMeta(entry) {
  const timestamp = new Date(entry.timestamp);
  const dateLabel = timestamp.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${entry.userName} · ${dateLabel}`;
}

function formatSnapshotDate(timestamp) {
  return new Date(timestamp).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Sin fecha";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSnapshotMeta(snapshot) {
  const versionLabel = snapshot.versionNumber ? `V${snapshot.versionNumber}` : "Version";
  return `${versionLabel} - ${snapshot.userName}`;
}

function formatAuditValue(value) {
  const text = String(value ?? "").trim();
  return text || "Vacío";
}

function isColumnEditable(column) {
  return ["input", "select"].includes(column.type) && column.editable !== false;
}

function isCellEditable(row, rowIndex, column) {
  if (!isColumnEditable(column)) {
    return false;
  }

  if (column.field === "reglaMetrado" && !isRevitMetradoType(row.tipoMetrado)) {
    return false;
  }

  if (!isLeafOnlyField(column.field)) {
    return true;
  }

  return !rowHasChildren(state.rows, rowIndex);
}

function getDisplayValueForCell(row, rowIndex, column, codes = null) {
  if (isLeafOnlyField(column.field) && rowHasChildren(state.rows, rowIndex)) {
    return "";
  }

  if (column.field === "reglaMetrado") {
    return getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado);
  }

  return row[column.field] ?? "";
}

function getGrupoTablasForRow(rows, rowIndex, codes = null) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (rowIndex < 0 || rowIndex >= safeRows.length) {
    return "";
  }

  const parentIndex = getParentIndex(safeRows, rowIndex);
  if (parentIndex < 0) {
    return "";
  }

  const resolvedCodes = Array.isArray(codes) ? codes : buildPartidaCodes(safeRows);
  const parentCode = String(resolvedCodes[parentIndex] || "").trim();
  const parentDescription = sanitizeDescripcion(safeRows[parentIndex]?.descripcion || "")
    .trim()
    .toUpperCase();

  return [parentCode, parentDescription].filter(Boolean).join(" ").trim();
}

function getPlaceholderForCell(rowIndex, column) {
  if (isLeafOnlyField(column.field) && rowHasChildren(state.rows, rowIndex)) {
    return "";
  }

  return column.placeholder || "";
}

function isAuditableField(fieldName) {
  return [
    "codificacion",
    "descripcion",
    "unidad",
    "costo",
    "metradoTradicional",
    "metradoBim",
    "tipoMetrado",
    "reglaMetrado",
  ].includes(fieldName);
}

function captureEditStartValue(target, rowId) {
  if (!target || !target.name || !isAuditableField(target.name)) {
    return;
  }

  const row = state.rows.find((entry) => entry.id === rowId);
  if (!row) {
    return;
  }

  const key = getEditStartKey(rowId, target.name);
  if (!(key in state.editStartValues)) {
    state.editStartValues[key] = row[target.name] ?? "";
  }
}

function getEditStartValue(rowId, fieldName, fallbackValue = "") {
  const key = getEditStartKey(rowId, fieldName);
  return key in state.editStartValues ? state.editStartValues[key] : fallbackValue;
}

function clearEditStartValue(rowId, fieldName) {
  delete state.editStartValues[getEditStartKey(rowId, fieldName)];
}

function getEditStartKey(rowId, fieldName) {
  return `${rowId}:${fieldName}`;
}

function sanitizeFieldValue(fieldName, value) {
  if (fieldName === "codificacion") {
    return sanitizeCodificacion(value);
  }

  if (fieldName === "descripcion") {
    return sanitizeDescripcion(value);
  }

  if (fieldName === "unidad") {
    return sanitizeUnidadPartida(value);
  }

  if (fieldName === "tipoMetrado") {
    return sanitizeTipoMetrado(value);
  }

  if (fieldName === "reglaMetrado") {
    return sanitizeReglaMetrado(value);
  }

  return String(value ?? "");
}

function findDuplicateForField(fieldName, value, excludedRowId) {
  if (fieldName === "codificacion") {
    return findDuplicateCodificacion(value, excludedRowId);
  }

  if (fieldName === "descripcion") {
    return findDuplicateDescripcion(value, excludedRowId);
  }

  return null;
}

function getFieldLabel(fieldName) {
  const labels = {
    codificacion: "Codificación",
    descripcion: "Descripción de partida",
    unidad: "Unidad de partida",
    costo: "Costo",
    metradoTradicional: "Metrado tradicional",
    metradoBim: "Metrado BIM",
    tipoMetrado: "Tipo de metrado",
    reglaMetrado: "Regla de metrado",
  };

  return labels[fieldName] || fieldName;
}

function isFieldEditable(fieldName, viewConfig = getCurrentViewConfig()) {
  const column = viewConfig.columns.find((entry) => entry.field === fieldName);
  return Boolean(column && isColumnEditable(column));
}

function refreshMetrics(
  codes = buildPartidaCodes(state.rows),
  visibleEntries = getVisibleEntries(state.rows, codes, state.filterQuery, {
    respectCollapsed: getCurrentViewConfig().allowsStructureEditing,
  }),
) {
  const viewConfig = getCurrentViewConfig();
  const rowCount = state.rows.length;
  const rootRows = state.rows.filter((row) => row.level === 0).length;
  const maxDepth =
    rowCount === 0
      ? 0
      : state.rows.reduce((max, row) => Math.max(max, row.level + 1), 0);
  const visibleRows = visibleEntries.length;
  const selectedIndex = getSelectedIndex();
  const selectedRow = state.rows[selectedIndex];

  itemCount.textContent = String(rowCount);
  grandTotal.textContent = formatAmount(getGrandTotalForRows(state.rows));
  depthCount.textContent = String(maxDepth);
  rootCount.textContent = String(rootRows);
  visibleCount.textContent = String(visibleRows);
  visibleCountInline.textContent = String(visibleRows);

  if (viewConfig.contentType === "export"
      || viewConfig.contentType === "users"
      || viewConfig.contentType === "bim-control") {
    selectedCode.textContent = "No aplica";
  } else if (selectedIndex >= 0 && selectedRow) {
    const code = codes[selectedIndex];
    const label = selectedRow.codificacion.trim();
    selectedCode.textContent = label
      ? `${code} | ${label}`
      : `${code} | Nivel ${selectedRow.level + 1}`;
  } else if (state.filterQuery) {
    selectedCode.textContent = "Sin coincidencias";
  } else {
    selectedCode.textContent = "Ninguna";
  }

  if (viewConfig.contentType === "users") {
    filterStatus.textContent = "Gestionando usuarios por proyecto";
    return;
  }

  if (viewConfig.contentType === "export" || !state.filterQuery) {
    filterStatus.textContent = "Mostrando todas las filas";
    return;
  }

  filterStatus.textContent =
    visibleRows > 0
      ? `${visibleRows} de ${rowCount} visibles`
      : "Sin resultados";
}

function updateToolbarState() {
  const viewConfig = getCurrentViewConfig();
  const selectedIndex = getSelectedIndex();
  const buttons = toolbar.querySelectorAll("[data-toolbar-action]");

  toolbar.hidden = !viewConfig.allowsStructureEditing;

  if (!viewConfig.allowsStructureEditing) {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  buttons.forEach((button) => {
    const action = button.dataset.toolbarAction;
    if (selectedIndex === -1 && action !== "add-root") {
      button.disabled = true;
      return;
    }

    if (selectedIndex === -1) {
      button.disabled = false;
      return;
    }

    switch (action) {
      case "move-up":
        button.disabled = !moveBranch(state.rows, selectedIndex, -1);
        break;
      case "move-down":
        button.disabled = !moveBranch(state.rows, selectedIndex, 1);
        break;
      case "indent":
        button.disabled =
          selectedIndex <= 0 || !shiftBranch(state.rows, selectedIndex, 1);
        break;
      case "outdent":
        button.disabled = !shiftBranch(state.rows, selectedIndex, -1);
        break;
      default:
        button.disabled = false;
        break;
    }
  });
}

function restoreFocus() {
  if (!state.pendingFocus) {
    return;
  }

  const selector = `tr[data-row-id="${state.pendingFocus.id}"] [name="${state.pendingFocus.field}"]`;
  const field = body.querySelector(selector);

  state.pendingFocus = null;

  if (!field) {
    return;
  }

  field.focus();

  if ("select" in field) {
    field.select();
  }
}

function selectRow(rowId) {
  if (rowId === state.selectedId) {
    return;
  }

  state.selectedId = rowId;
  updateSelectionUi();
  refreshMetrics();
  updateToolbarState();

  if (getCurrentViewConfig().contentType === "audit") {
    renderAuditPanel(buildPartidaCodes(state.rows));
  }
}

function switchProject(projectId) {
  if (!projectId || projectId === state.currentProjectId) {
    updateProjectUi();
    return;
  }

  saveProjectState(false);
  state.currentProjectId = projectId;
  state.filterQuery = "";
  state.pendingFocus = null;
  searchInput.value = "";
  hydrateCurrentProject(true);
  persistUiState();
  saveProjectState(false);
  render();
}

function createProject() {
  if (!isProjectCreationAllowed()) {
    window.alert("Solo superadmin puede crear proyectos.");
    return;
  }

  const proposedName = getNextProjectName();
  const input = window.prompt("Nombre del nuevo proyecto", proposedName);
  if (input === null) {
    return;
  }

  const name = ensureUniqueProjectName(input.trim(), null);
  if (!name) {
    window.alert("Ingresa un nombre valido para el proyecto.");
    return;
  }

  saveProjectState(false);

  const project = normalizeProjectRecord({
    id: createId(),
    name,
    rows: [createRow()],
    auditEntries: [],
    collapsedIds: [],
  });

  state.projects = [...state.projects, project];
  state.currentProjectId = project.id;
  state.filterQuery = "";
  state.pendingFocus = null;
  searchInput.value = "";
  hydrateCurrentProject(true);
  saveProjectState();
  render();
}

function renameCurrentProject() {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    return;
  }

  const input = window.prompt("Nuevo nombre del proyecto", currentProject.name);
  if (input === null) {
    return;
  }

  const name = ensureUniqueProjectName(input.trim(), currentProject.id);
  if (!name) {
    window.alert("Ingresa un nombre valido para el proyecto.");
    return;
  }

  const currentIndex = getCurrentProjectIndex();
  state.projects[currentIndex] = {
    ...state.projects[currentIndex],
    name,
    updatedAt: new Date().toISOString(),
  };
  saveProjectState();
  render();
}

function deleteCurrentProject() {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    return;
  }

  if (state.projects.length <= 1) {
    window.alert("Debe existir al menos un proyecto.");
    return;
  }

  const confirmed = window.confirm(
    `Se eliminara el proyecto "${currentProject.name}". Esta accion no se puede deshacer.`,
  );
  if (!confirmed) {
    return;
  }

  const currentIndex = getCurrentProjectIndex();
  const nextProjects = state.projects.filter(
    (project) => project.id !== currentProject.id,
  );
  const nextProject =
    nextProjects[Math.min(currentIndex, nextProjects.length - 1)] ||
    nextProjects[0];

  state.projects = nextProjects;
  state.currentProjectId = nextProject.id;
  state.filterQuery = "";
  state.pendingFocus = null;
  searchInput.value = "";
  hydrateCurrentProject(true);
  saveProjectState();
  render();
}

function createBudgetSnapshot() {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    return;
  }

  const suggestedName = getDefaultSnapshotName();
  const input = window.prompt("Nombre de la foto del presupuesto", suggestedName);
  if (input === null) {
    return;
  }

  const name = sanitizeSnapshotName(input) || suggestedName;
  const rows = cloneRows(state.rows);
  const previousSnapshot = getLatestSnapshot();
  const snapshot = {
    id: createId(),
    versionNumber: getNextSnapshotVersionNumber(),
    name,
    rows,
    summary: buildSnapshotSummary(rows),
    snapshotType: "manual",
    baseSnapshotId: previousSnapshot ? previousSnapshot.id : null,
    userName: state.operatorName,
    createdAt: new Date().toISOString(),
  };

  state.snapshots = normalizeSnapshots([snapshot, ...state.snapshots]);
  ensureSnapshotComparisonSelection();
  saveProjectState();

  if (state.currentView === "presupuesto") {
    render();
  }
}

function handleSnapshotAction(action, snapshotId) {
  if (!action || !snapshotId) {
    return;
  }

  if (action === "download") {
    downloadSnapshot(snapshotId);
    return;
  }

  if (action === "compare-current") {
    setSnapshotComparison(snapshotId, "current");
    return;
  }

  if (action === "delete") {
    deleteSnapshot(snapshotId);
  }
}

function downloadSnapshot(snapshotId) {
  const snapshot = state.snapshots.find((entry) => entry.id === snapshotId);
  const currentProject = getCurrentProject();
  if (!snapshot || !currentProject) {
    return;
  }

  const payload = {
    projectId: currentProject.id,
    projectName: currentProject.name,
    snapshotId: snapshot.id,
    snapshotName: snapshot.name,
    versionNumber: snapshot.versionNumber || null,
    baseSnapshotId: snapshot.baseSnapshotId || null,
    createdAt: snapshot.createdAt,
    userName: snapshot.userName,
    summary: snapshot.summary || buildSnapshotSummary(snapshot.rows),
    rows: cloneRows(snapshot.rows),
  };
  const fileLabel = sanitizeFilename(
    `${currentProject.name} - ${snapshot.name}`,
  ) || "foto-presupuesto";

  downloadTextFile(
    `${fileLabel}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
}

function deleteSnapshot(snapshotId) {
  const snapshot = state.snapshots.find((entry) => entry.id === snapshotId);
  if (!snapshot) {
    return;
  }

  const confirmed = window.confirm(
    `Se eliminara la foto "${snapshot.name}" del historial. Esta accion no se puede deshacer.`,
  );
  if (!confirmed) {
    return;
  }

  state.snapshots = state.snapshots.filter((entry) => entry.id !== snapshotId);
  ensureSnapshotComparisonSelection();
  saveProjectState();
  render();
}

function hydrateCurrentProject(resetSelection) {
  let currentProject = getCurrentProject();

  if (!currentProject) {
    const fallbackProject = normalizeProjectRecord({
      id: createId(),
      name: "Proyecto 1",
      rows: [createRow()],
      auditEntries: [],
      collapsedIds: [],
    });
    state.projects = [fallbackProject];
    state.currentProjectId = fallbackProject.id;
    currentProject = fallbackProject;
  }

  state.rows = cloneRows(currentProject.rows);
  state.auditEntries = normalizeAuditEntries(currentProject.auditEntries);
  state.snapshots = normalizeSnapshots(currentProject.snapshots);
  ensureSnapshotComparisonSelection();
  state.editStartValues = {};
  if (state.rows.length === 0) {
    state.rows = [createRow()];
  }

  state.collapsedIds = new Set(currentProject.collapsedIds || []);
  pruneCollapsedIds();

  const hasCurrentSelection = state.rows.some((row) => row.id === state.selectedId);
  if (resetSelection || !hasCurrentSelection) {
    state.selectedId = state.rows[0] ? state.rows[0].id : null;
  }
}

function updateProjectUi() {
  const currentProject = getCurrentProject();
  const canCreateProject = isProjectCreationAllowed();
  projectTitle.textContent = currentProject ? currentProject.name : "Proyecto";

  projectSelect.innerHTML = state.projects
    .map((project) => {
      const selected = project.id === state.currentProjectId ? " selected" : "";
      return `<option value="${project.id}"${selected}>${escapeHtml(project.name)}</option>`;
    })
    .join("");

  projectSelect.value = state.currentProjectId || "";
  newProjectButton.disabled = !canCreateProject;
  newProjectButton.title = canCreateProject ? "" : "Solo superadmin puede crear proyectos";
  renameProjectButton.disabled = !currentProject;
  deleteProjectButton.disabled = state.projects.length <= 1;
}

function updateViewUi(viewConfig = getCurrentViewConfig()) {
  viewButtons.forEach((button) => {
    const isActive = button.dataset.view === viewConfig.key;
    button.classList.toggle("nav-item--active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  controlsPanel.hidden = !viewConfig.allowsStructureEditing;
  searchWrap.hidden = !viewConfig.searchEnabled;
  searchInput.disabled = !viewConfig.searchEnabled;
  selectionPill.hidden = viewConfig.contentType === "export"
    || viewConfig.contentType === "users"
    || viewConfig.contentType === "bim-control";
  saveSnapshotButton.hidden = true;
  matrixTitle.textContent = viewConfig.matrixTitle;
  helperText.textContent = viewConfig.helperText;
  shortcutText.textContent = viewConfig.shortcutText;
}

function startTreeDrag(rowId, event) {
  const rowIndex = state.rows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) {
    return;
  }

  state.dragSession = {
    pointerId: event.pointerId,
    rowId,
    branchIds: new Set([rowId]),
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    started: false,
    anchorRowId: null,
    dropPosition: "after",
    requestedLevel: state.rows[rowIndex].level,
    targetLevel: state.rows[rowIndex].level,
  };

  window.addEventListener("pointermove", onTreeDragMove);
  window.addEventListener("pointerup", onTreeDragEnd);
  window.addEventListener("pointercancel", onTreeDragCancel);

  selectRow(rowId);
}

function onTreeDragMove(event) {
  const session = state.dragSession;
  if (!session || event.pointerId !== session.pointerId) {
    return;
  }

  session.lastX = event.clientX;
  session.lastY = event.clientY;

  if (!session.started) {
    const distance =
      Math.abs(event.clientX - session.startX) +
      Math.abs(event.clientY - session.startY);

    if (distance < 6) {
      return;
    }

    session.started = true;
  }

  updateTreeDragTarget(event.clientX, event.clientY);
  applyTreeDragFeedback();
}

function onTreeDragEnd(event) {
  const session = state.dragSession;
  if (!session || event.pointerId !== session.pointerId) {
    return;
  }

  if (session.started) {
    const nextRows = buildRowsAfterTreeDrag(session);
    clearTreeDragSession();

    if (nextRows) {
      commit(nextRows, session.rowId);
      return;
    }
  } else {
    clearTreeDragSession();
  }

  render();
}

function onTreeDragCancel(event) {
  const session = state.dragSession;
  if (!session || event.pointerId !== session.pointerId) {
    return;
  }

  clearTreeDragSession();
  render();
}

function toggleRowCollapse(rowId) {
  const rowIndex = state.rows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1 || !rowHasChildren(state.rows, rowIndex)) {
    return;
  }

  if (state.collapsedIds.has(rowId)) {
    state.collapsedIds.delete(rowId);
  } else {
    state.collapsedIds.add(rowId);
  }

  state.selectedId = rowId;
  persistUiState();
  render();
}

function applySidebarState() {
  appLayout.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  sidebarToggleButton.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
}

function updateTreeDragTarget(clientX, clientY) {
  const session = state.dragSession;
  if (!session) {
    return;
  }

  const remainingRows = state.rows.filter((row) => !session.branchIds.has(row.id));
  const rowElements = Array.from(body.querySelectorAll("tr[data-row-id]")).filter(
    (rowElement) => !session.branchIds.has(rowElement.dataset.rowId),
  );

  let anchorRowId = null;
  let dropPosition = "after";

  if (rowElements.length > 0) {
    for (const rowElement of rowElements) {
      const rect = rowElement.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (clientY < midpoint) {
        anchorRowId = rowElement.dataset.rowId;
        dropPosition = "before";
        break;
      }

      anchorRowId = rowElement.dataset.rowId;
      dropPosition = "after";
    }
  }

  const insertAt = computeInsertAtFromAnchor(remainingRows, anchorRowId, dropPosition);
  const requestedLevel = computeRequestedDragLevel(clientX);
  const targetLevel = resolveInsertLevel(remainingRows, insertAt, requestedLevel);

  session.anchorRowId = anchorRowId;
  session.dropPosition = dropPosition;
  session.requestedLevel = requestedLevel;
  session.targetLevel = targetLevel;
}

function applyTreeDragFeedback() {
  clearTreeDragFeedback();

  const session = state.dragSession;
  if (!session || !session.started) {
    return;
  }

  document.body.classList.add("is-tree-dragging");

  body.querySelectorAll("tr[data-row-id]").forEach((rowElement) => {
    if (session.branchIds.has(rowElement.dataset.rowId)) {
      rowElement.classList.add("is-branch-dragging");
    }
  });

  if (!session.anchorRowId) {
    tableWrap.classList.add("is-drop-at-end");
    tableWrap.style.setProperty("--drop-level", String(session.targetLevel));
    return;
  }

  const anchorRow = body.querySelector(
    `tr[data-row-id="${session.anchorRowId}"]`,
  );

  if (!anchorRow) {
    return;
  }

  anchorRow.classList.add(
    session.dropPosition === "before" ? "is-drop-before" : "is-drop-after",
  );
  anchorRow.style.setProperty("--drop-level", String(session.targetLevel));
}

function clearTreeDragFeedback() {
  document.body.classList.remove("is-tree-dragging");
  tableWrap.classList.remove("is-drop-at-end");
  tableWrap.style.removeProperty("--drop-level");

  body.querySelectorAll(".is-branch-dragging").forEach((rowElement) => {
    rowElement.classList.remove("is-branch-dragging");
  });

  body.querySelectorAll(".is-drop-before, .is-drop-after").forEach((rowElement) => {
    rowElement.classList.remove("is-drop-before", "is-drop-after");
    rowElement.style.removeProperty("--drop-level");
  });
}

function clearTreeDragSession() {
  window.removeEventListener("pointermove", onTreeDragMove);
  window.removeEventListener("pointerup", onTreeDragEnd);
  window.removeEventListener("pointercancel", onTreeDragCancel);
  clearTreeDragFeedback();
  state.dragSession = null;
}

function syncSelectedRowWithVisibleEntries(visibleEntries) {
  if (visibleEntries.length === 0) {
    state.selectedId = null;
    return;
  }

  const hasVisibleSelection = visibleEntries.some(
    (entry) => entry.row.id === state.selectedId,
  );

  if (!hasVisibleSelection) {
    state.selectedId = visibleEntries[0].row.id;
  }
}

function getVisibleEntries(rows, codes, filterQuery, options = {}) {
  const { respectCollapsed = true } = options;
  const query = normalizeText(filterQuery).trim();
  const entries = rows.map((row, index) => ({
    row,
    index,
    code: codes[index],
  }));

  if (!query) {
    return respectCollapsed
      ? entries.filter((entry) => !isHiddenByCollapsedAncestor(rows, entry.index))
      : entries;
  }

  const visibleIndices = new Set();

  entries.forEach((entry) => {
    const haystack = normalizeText(
      [
        entry.code,
        entry.row.codificacion,
        entry.row.descripcion,
        getGrupoTablasForRow(rows, entry.index, codes),
        entry.row.unidad,
        entry.row.costo,
        entry.row.metrado,
        entry.row.metradoTradicional,
        entry.row.metradoBim,
        entry.row.tipoMetrado,
        entry.row.reglaMetrado,
      ].join(" "),
    );

    if (!haystack.includes(query)) {
      return;
    }

    visibleIndices.add(entry.index);

    let parentIndex = getParentIndex(rows, entry.index);
    while (parentIndex >= 0) {
      visibleIndices.add(parentIndex);
      parentIndex = getParentIndex(rows, parentIndex);
    }

    const branchEnd = getBranchEnd(rows, entry.index);
    for (let cursor = entry.index + 1; cursor <= branchEnd; cursor += 1) {
      visibleIndices.add(cursor);
    }
  });

  return entries.filter((entry) => visibleIndices.has(entry.index));
}

function buildRowsAfterTreeDrag(session) {
  const startIndex = state.rows.findIndex((row) => row.id === session.rowId);
  if (startIndex === -1) {
    return null;
  }

  const branch = [{ ...state.rows[startIndex] }];
  const remainingRows = state.rows.filter((row) => !session.branchIds.has(row.id));
  const insertAt = computeInsertAtFromAnchor(
    remainingRows,
    session.anchorRowId,
    session.dropPosition,
  );
  const targetLevel = resolveInsertLevel(
    remainingRows,
    insertAt,
    session.requestedLevel,
  );
  const delta = targetLevel - branch[0].level;
  const movedBranch = branch.map((row) => ({
    ...row,
    level: row.level + delta,
  }));
  const nextRows = normalizeRows([
    ...remainingRows.slice(0, insertAt),
    ...movedBranch,
    ...remainingRows.slice(insertAt),
  ]);

  return areRowsEquivalent(state.rows, nextRows) ? null : nextRows;
}

function computeInsertAtFromAnchor(rows, anchorRowId, dropPosition) {
  if (!anchorRowId) {
    return rows.length;
  }

  const anchorIndex = rows.findIndex((row) => row.id === anchorRowId);
  if (anchorIndex === -1) {
    return rows.length;
  }

  if (dropPosition === "before") {
    return anchorIndex;
  }

  return getBranchEnd(rows, anchorIndex) + 1;
}

function computeRequestedDragLevel(clientX) {
  const firstCell = body.querySelector("tr[data-row-id] .partida-cell");
  const rect = firstCell
    ? firstCell.getBoundingClientRect()
    : tableWrap.getBoundingClientRect();
  const baseLeft = rect.left + 18;
  const offset = clientX - baseLeft;
  return Math.max(0, Math.floor((offset + TREE_INDENT_STEP / 2) / TREE_INDENT_STEP));
}

function resolveInsertLevel(rows, insertAt, requestedLevel) {
  if (insertAt <= 0) {
    return 0;
  }

  const previousRow = rows[insertAt - 1];
  const maxAllowed = previousRow.level + 1;
  return Math.max(0, Math.min(requestedLevel, maxAllowed));
}

function areRowsEquivalent(leftRows, rightRows) {
  if (leftRows.length !== rightRows.length) {
    return false;
  }

  return leftRows.every((row, index) => {
    const candidate = rightRows[index];
    return candidate && candidate.id === row.id && candidate.level === row.level;
  });
}

function createRow(overrides = {}) {
  return {
    id: createId(),
    level: 0,
    codificacion: "",
    descripcion: "",
    unidad: "",
    costo: "",
    metradoTradicional: "",
    metradoBim: "",
    tipoMetrado: "",
    reglaMetrado: "",
    ...overrides,
  };
}

function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneRows(rows) {
  return normalizeRows(
    (Array.isArray(rows) ? rows : []).map((row) => {
      const tipoMetrado = sanitizeTipoMetrado(row.tipoMetrado ?? "");

      return {
        ...createRow(),
        ...row,
        id: row.id || createId(),
        codificacion: sanitizeCodificacion(row.codificacion || ""),
        descripcion: sanitizeDescripcion(row.descripcion || ""),
        unidad: sanitizeUnidadPartida(row.unidad || ""),
        metradoTradicional: row.metradoTradicional ?? row.metrado ?? "",
        metradoBim: row.metradoBim ?? "",
        tipoMetrado,
        reglaMetrado: getReglaMetradoForTipo(tipoMetrado, row.reglaMetrado),
      };
    }),
  );
}

function normalizeAuditEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object" && entry.rowId)
    .map((entry) => ({
      id: entry.id || createId(),
      rowId: entry.rowId,
      type: entry.type || "field",
      field: entry.field || "",
      beforeValue: entry.beforeValue ?? "",
      afterValue: entry.afterValue ?? "",
      beforeLevel: entry.beforeLevel ?? null,
      afterLevel: entry.afterLevel ?? null,
      beforePartidaCode: entry.beforePartidaCode ?? "",
      afterPartidaCode: entry.afterPartidaCode ?? "",
      userName: sanitizeOperatorName(entry.userName || DEFAULT_OPERATOR_NAME),
      timestamp: entry.timestamp || new Date().toISOString(),
    }));
}

function normalizeSnapshots(entries) {
  const normalized = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const rows = cloneRows(entry.rows);
      const normalizedRows = rows.length > 0 ? rows : [createRow()];
      const parsedVersion = Number.parseInt(entry.versionNumber, 10);

      return {
        id: entry.id || createId(),
        name: sanitizeSnapshotName(entry.name) || `Foto ${index + 1}`,
        rows: normalizedRows,
        summary: buildSnapshotSummary(normalizedRows),
        userName: sanitizeOperatorName(entry.userName || DEFAULT_OPERATOR_NAME),
        createdAt: entry.createdAt || new Date().toISOString(),
        versionNumber: Number.isInteger(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : null,
        snapshotType: entry.snapshotType === "manual" ? "manual" : "manual",
        baseSnapshotId: typeof entry.baseSnapshotId === "string"
          ? entry.baseSnapshotId
          : null,
      };
    });

  assignMissingSnapshotVersionNumbers(normalized);
  return normalized;
}

function normalizeRevitExportRecord(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    id: entry.id ?? null,
    uid: String(entry.uid || ""),
    modelPath: String(entry.modelPath || ""),
    revitVersion: String(entry.revitVersion || ""),
    addinVersion: String(entry.addinVersion || ""),
    userName: sanitizeOperatorName(entry.userName || "Revit Addin"),
    exportedAt: entry.exportedAt || entry.createdAt || "",
    createdAt: entry.createdAt || entry.exportedAt || "",
    totalRows: Number.parseInt(entry.totalRows || 0, 10) || 0,
    totalQuantity: parseDecimal(entry.totalQuantity),
    linkedItems: Number.parseInt(entry.linkedItems || 0, 10) || 0,
  };
}

function assignMissingSnapshotVersionNumbers(snapshots) {
  const usedVersions = new Set();

  snapshots.forEach((snapshot) => {
    if (
      Number.isInteger(snapshot.versionNumber)
      && snapshot.versionNumber > 0
      && !usedVersions.has(snapshot.versionNumber)
    ) {
      usedVersions.add(snapshot.versionNumber);
      return;
    }

    snapshot.versionNumber = null;
  });

  let nextVersion = 1;
  snapshots
    .filter((snapshot) => snapshot.versionNumber === null)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
    .forEach((snapshot) => {
      while (usedVersions.has(nextVersion)) {
        nextVersion += 1;
      }

      snapshot.versionNumber = nextVersion;
      usedVersions.add(nextVersion);
      nextVersion += 1;
    });
}

function normalizeProjectRecord(project, index = 0) {
  const rows = cloneRows(project.rows);
  const normalizedRows = rows.length > 0 ? rows : [createRow()];

  return {
    id: project.id || createId(),
    name: sanitizeProjectName(project.name) || `Proyecto ${index + 1}`,
    rows: normalizedRows,
    auditEntries: normalizeAuditEntries(project.auditEntries),
    snapshots: normalizeSnapshots(project.snapshots),
    latestRevitExport: normalizeRevitExportRecord(project.latestRevitExport),
    collapsedIds: Array.isArray(project.collapsedIds)
      ? project.collapsedIds.filter((id) => typeof id === "string")
      : [],
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || new Date().toISOString(),
  };
}

function loadProjectsState(uiStateValue) {
  const migratedProject = normalizeProjectRecord(
    {
      id: createId(),
      name: "Proyecto 1",
      rows: [createRow()],
      collapsedIds: Array.isArray(uiStateValue.collapsedIds)
        ? uiStateValue.collapsedIds
        : [],
    },
    0,
  );

  return {
    projects: [migratedProject],
    currentProjectId: migratedProject.id,
  };
}

function saveRows(rows, markSaved = true) {
  state.rows = cloneRows(rows);
  saveProjectState(markSaved);
}

function appendAuditEntries(entries, markSaved = true) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  state.auditEntries = normalizeAuditEntries([...state.auditEntries, ...entries]);
  saveProjectState(markSaved);
}

function createFieldAuditEntry(rowId, field, beforeValue, afterValue) {
  return {
    id: createId(),
    rowId,
    type: "field",
    field,
    beforeValue,
    afterValue,
    userName: state.operatorName,
    timestamp: new Date().toISOString(),
  };
}

function createStructureAuditEntry(rowId, beforeLevel, afterLevel, beforeCode, afterCode) {
  return {
    id: createId(),
    rowId,
    type: "structure",
    field: "estructura",
    beforeLevel,
    afterLevel,
    beforePartidaCode: beforeCode,
    afterPartidaCode: afterCode,
    userName: state.operatorName,
    timestamp: new Date().toISOString(),
  };
}

function collectStructureAuditEntries(previousRows, nextRows) {
  const previousCodes = buildPartidaCodes(previousRows);
  const nextCodes = buildPartidaCodes(nextRows);

  return nextRows.reduce((entries, row, index) => {
    const previousIndex = previousRows.findIndex((entry) => entry.id === row.id);
    if (previousIndex === -1) {
      return entries;
    }

    const previousRow = previousRows[previousIndex];
    const previousCode = previousCodes[previousIndex] || "";
    const nextCode = nextCodes[index] || "";
    const previousLevel = previousRow.level + 1;
    const nextLevel = row.level + 1;

    if (previousLevel === nextLevel && previousCode === nextCode) {
      return entries;
    }

    entries.push(
      createStructureAuditEntry(row.id, previousLevel, nextLevel, previousCode, nextCode),
    );
    return entries;
  }, []);
}

function loadUiState() {
  return {};
}

function saveUiState(value) {
  void value;
}

function resolveInitialThemeMode(storedThemeMode) {
  const normalizedThemeMode = String(storedThemeMode || "").trim().toLowerCase();
  if (normalizedThemeMode === THEME_MODES.DARK || normalizedThemeMode === THEME_MODES.LIGHT) {
    return normalizedThemeMode;
  }

  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return THEME_MODES.DARK;
    }
  } catch {
    // Keep default theme if media query is not available.
  }

  return THEME_MODES.LIGHT;
}

function applyThemeMode(themeMode, options = {}) {
  const { persist = true } = options;
  const nextThemeMode = themeMode === THEME_MODES.DARK ? THEME_MODES.DARK : THEME_MODES.LIGHT;

  state.themeMode = nextThemeMode;
  document.documentElement.setAttribute("data-theme", nextThemeMode);
  updateThemeToggleUi();

  if (persist) {
    persistUiState();
  }
}

function updateThemeToggleUi() {
  if (!themeToggleButton) {
    return;
  }

  const isDarkTheme = state.themeMode === THEME_MODES.DARK;
  const label = isDarkTheme ? "Volver al modo claro" : "Activar modo oscuro";
  themeToggleButton.setAttribute("aria-label", label);
  themeToggleButton.setAttribute("title", label);
  themeToggleButton.setAttribute("aria-pressed", isDarkTheme ? "true" : "false");
}

function persistUiState() {
  saveUiState({
    currentView: state.currentView,
    operatorName: state.operatorName,
    auditFilter: state.auditFilter,
    sidebarCollapsed: state.sidebarCollapsed,
    themeMode: state.themeMode,
  });
}

function saveProjectState(markSaved = true) {
  syncCurrentProjectState();

  if (persistence.bootstrapped && persistence.remoteAvailable) {
    if (markSaved) {
      state.remoteDirty = true;
      state.remoteSaveError = false;
      state.remoteChangeVersion += 1;
      updateSaveStatus();
      scheduleRemoteSave();
    }
    return;
  }

  if (markSaved) {
    state.remoteDirty = true;
    state.remoteSaveError = true;
    state.remoteChangeVersion += 1;
    updateSaveStatus();
  }
}

function serializeProjectsState() {
  return {
    currentProjectId: state.currentProjectId,
    projects: state.projects.map((project, index) => normalizeProjectRecord(project, index)),
  };
}

function applyStoredProjectsState(payload, options = {}) {
  const { resetSelection = false } = options;
  const projects = Array.isArray(payload?.projects)
    ? payload.projects.map((project, index) => normalizeProjectRecord(project, index))
    : [];

  if (projects.length === 0) {
    return false;
  }

  const currentProjectId = projects.some((project) => project.id === payload?.currentProjectId)
    ? payload.currentProjectId
    : projects[0].id;
  const previousSelectedId = state.selectedId;

  state.projects = projects;
  state.currentProjectId = currentProjectId;
  hydrateCurrentProject(resetSelection);
  pruneCollapsedIds();

  if (!resetSelection && state.rows.some((row) => row.id === previousSelectedId)) {
    state.selectedId = previousSelectedId;
  } else {
    state.selectedId = state.rows[0] ? state.rows[0].id : null;
  }

  return true;
}

function loadStoredAuthToken() {
  return "";
}

function storeAuthToken(token) {
  const safeToken = String(token || "").trim();
  authState.token = safeToken;
}

function clearAuthSession() {
  authState.user = null;
  storeAuthToken("");
  resetUsersState();
  updateSessionControls();
}

function getAuthHeaders() {
  if (!authState.token) {
    return {};
  }

  return {
    Authorization: `Bearer ${authState.token}`,
  };
}

function showAccessGate(message = "") {
  configureAccessGate();

  if (accessGate) {
    accessGate.hidden = false;
  }

  if (accessError) {
    const text = String(message || "").trim();
    const googleEnabled =
      authState.required
      && authState.googleAuthEnabled
      && Boolean(String(authState.googleClientId || "").trim());
    const fallbackText = googleEnabled
      ? ""
      : "Inicio con Google no disponible. Configura GOOGLE_AUTH_CLIENT_ID en el backend.";
    accessError.textContent = text || fallbackText;
    accessError.hidden = !(text || fallbackText);
  }

}

function setAccessStatus(message = "", { busy = false } = {}) {
  if (accessStatus) {
    const text = String(message || "").trim();
    accessStatus.textContent = text;
    accessStatus.hidden = !text;
    accessStatus.classList.toggle("is-busy", Boolean(text) && busy);
  }

  if (googleLoginWrap) {
    googleLoginWrap.classList.toggle("is-authenticating", busy);
  }
}

function hideAccessGate() {
  if (accessGate) {
    accessGate.hidden = true;
  }

  if (accessError) {
    accessError.textContent = "";
    accessError.hidden = true;
  }

  setAccessStatus("", { busy: false });
}

function configureAccessGate() {
  const googleEnabled =
    authState.required
    && authState.googleAuthEnabled
    && Boolean(String(authState.googleClientId || "").trim());

  if (googleLoginWrap) {
    googleLoginWrap.hidden = !googleEnabled;
  }

  if (accessDivider) {
    accessDivider.hidden = true;
  }

  if (googleEnabled) {
    void initializeGoogleSignInIfNeeded();
  }
}

function getUserInitials(user) {
  const fullName = String(user?.displayName || "").trim();
  const parts = fullName
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length > 0) {
    return parts.map((part) => part.charAt(0).toUpperCase()).join("");
  }

  const email = String(user?.email || "").trim();
  return email ? email.charAt(0).toUpperCase() : "U";
}

function closeAccountMenu() {
  if (accountMenuPanel) {
    accountMenuPanel.hidden = true;
  }
  if (accountMenuButton) {
    accountMenuButton.setAttribute("aria-expanded", "false");
  }
}

function toggleAccountMenu() {
  if (!accountMenuPanel || !accountMenuButton || accountMenuButton.hidden) {
    return;
  }

  const nextOpen = accountMenuPanel.hidden;
  accountMenuPanel.hidden = !nextOpen;
  accountMenuButton.setAttribute("aria-expanded", nextOpen ? "true" : "false");
}

function getUserProfileImageUrl(user) {
  const raw = String(user?.profileImageUrl || user?.picture || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function updateSessionControls() {
  const user = authState.user;
  const loggedIn = Boolean(user && user.email);

  if (accountMenu) {
    accountMenu.hidden = !loggedIn || !authState.required;
  }

  if (logoutButton) {
    logoutButton.hidden = !loggedIn || !authState.required;
  }

  if (!loggedIn || !authState.required) {
    closeAccountMenu();
    if (accountMenuAvatarImage) {
      accountMenuAvatarImage.hidden = true;
      accountMenuAvatarImage.removeAttribute("src");
    }
    if (accountMenuPanelAvatarImage) {
      accountMenuPanelAvatarImage.hidden = true;
      accountMenuPanelAvatarImage.removeAttribute("src");
    }
    if (accountMenuAvatarText) {
      accountMenuAvatarText.hidden = false;
      accountMenuAvatarText.textContent = "U";
    }
    if (accountMenuPanelAvatarText) {
      accountMenuPanelAvatarText.hidden = false;
      accountMenuPanelAvatarText.textContent = "U";
    }
  } else {
    const role = user.role ? String(user.role).toUpperCase() : "USER";
    const nameText = sanitizeOperatorName(user.displayName || user.email);
    const metaText = `${user.email} (${role})`;
    const initials = getUserInitials(user);
    const profileImageUrl = getUserProfileImageUrl(user);

    if (accountMenuName) {
      accountMenuName.textContent = nameText;
    }
    if (accountMenuMeta) {
      accountMenuMeta.textContent = metaText;
    }
    if (accountMenuAvatarText) {
      accountMenuAvatarText.textContent = initials;
    }
    if (accountMenuPanelAvatarText) {
      accountMenuPanelAvatarText.textContent = initials;
    }

    if (profileImageUrl) {
      if (accountMenuAvatarImage) {
        accountMenuAvatarImage.src = profileImageUrl;
        accountMenuAvatarImage.hidden = false;
      }
      if (accountMenuPanelAvatarImage) {
        accountMenuPanelAvatarImage.src = profileImageUrl;
        accountMenuPanelAvatarImage.hidden = false;
      }
      if (accountMenuAvatarText) {
        accountMenuAvatarText.hidden = true;
      }
      if (accountMenuPanelAvatarText) {
        accountMenuPanelAvatarText.hidden = true;
      }
    } else {
      if (accountMenuAvatarImage) {
        accountMenuAvatarImage.hidden = true;
        accountMenuAvatarImage.removeAttribute("src");
      }
      if (accountMenuPanelAvatarImage) {
        accountMenuPanelAvatarImage.hidden = true;
        accountMenuPanelAvatarImage.removeAttribute("src");
      }
      if (accountMenuAvatarText) {
        accountMenuAvatarText.hidden = false;
      }
      if (accountMenuPanelAvatarText) {
        accountMenuPanelAvatarText.hidden = false;
      }
    }
  }

  if (operatorInput) {
    if (loggedIn) {
      const operatorLabel = sanitizeOperatorName(user.displayName || user.email);
      state.operatorName = operatorLabel;
      operatorInput.value = operatorLabel;
      operatorInput.disabled = true;
    } else {
      operatorInput.disabled = false;
      operatorInput.value = state.operatorName;
    }
  }

  applyUsersViewAccess();
  updateProjectUi();
}

async function bootstrapAuthAndServerPersistence() {
  await resolveAccessControlRequirement();

  if (!authState.required) {
    hideAccessGate();
    updateSessionControls();
    bootstrapServerPersistence();
    return;
  }

  const restored = await tryRestoreSession();
  if (!restored) {
    showAccessGate("Inicia sesion para continuar.");
    updateSessionControls();
    updateSaveStatus();
    return;
  }

  hideAccessGate();
  updateSessionControls();
  bootstrapServerPersistence();
}

async function resolveAccessControlRequirement() {
  try {
    const response = await window.fetch(ACCESS_SETTINGS_ENDPOINT, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    authState.required = Boolean(payload?.accessControl?.enabled);
    authState.googleAuthEnabled = Boolean(payload?.accessControl?.googleAuthEnabled);
    authState.googleClientId = String(payload?.accessControl?.googleClientId || "").trim();
    authState.googleInitialized = false;
    configureAccessGate();
  } catch {
    authState.required = false;
    authState.googleAuthEnabled = false;
    authState.googleClientId = "";
    authState.googleInitialized = false;
  }
}

async function initializeGoogleSignInIfNeeded() {
  if (authState.googleInitialized) {
    return;
  }

  if (!googleSignInButton) {
    return;
  }

  const clientId = String(authState.googleClientId || "").trim();
  if (!clientId) {
    return;
  }

  const loaded = await waitForGoogleIdentityScript();
  if (!loaded || !window.google?.accounts?.id) {
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (credentialResponse) => {
      await handleGoogleCredentialResponse(credentialResponse);
    },
    cancel_on_tap_outside: true,
  });

  googleSignInButton.innerHTML = "";
  window.google.accounts.id.renderButton(googleSignInButton, {
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "pill",
    width: 280,
  });

  authState.googleInitialized = true;
}

function waitForGoogleIdentityScript(timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      if (window.google?.accounts?.id) {
        resolve(true);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }

      window.setTimeout(check, 120);
    }

    check();
  });
}

async function handleGoogleCredentialResponse(credentialResponse) {
  if (authState.isAuthenticating) {
    return;
  }

  const idToken = String(credentialResponse?.credential || "").trim();
  if (!idToken) {
    setAccessStatus("", { busy: false });
    showAccessGate("Google no devolvio credenciales validas.");
    return;
  }

  authState.isAuthenticating = true;
  setAccessStatus("Autenticando con Google...", { busy: true });
  if (accessError) {
    accessError.textContent = "";
    accessError.hidden = true;
  }

  try {
    const response = await window.fetch(AUTH_GOOGLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ idToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Error ${response.status}`);
    }

    setAccessStatus("Sesion validada. Cargando datos...", { busy: true });
    storeAuthToken(payload.token || "");
    authState.user = payload.user || null;
    hideAccessGate();
    updateSessionControls();

    if (!persistence.bootstrapped) {
      bootstrapServerPersistence();
    } else {
      await bootstrapServerPersistence();
    }
  } catch (error) {
    setAccessStatus("", { busy: false });
    showAccessGate(
      error instanceof Error
        ? error.message
        : "No se pudo iniciar sesion con Google.",
    );
  } finally {
    authState.isAuthenticating = false;
    setAccessStatus("", { busy: false });
  }
}

async function tryRestoreSession() {
  if (!authState.required) {
    return true;
  }

  try {
    const response = await window.fetch(AUTH_ME_ENDPOINT, {
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    });

    if (!response.ok) {
      clearAuthSession();
      return false;
    }

    const payload = await response.json();
    authState.user = payload?.user || null;
    return Boolean(authState.user && authState.user.email);
  } catch {
    clearAuthSession();
    return false;
  }
}

async function handleLogoutRequest() {
  try {
    await window.fetch(AUTH_LOGOUT_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    });
  } catch {
    // ignore
  }

  clearAuthSession();
  closeAccountMenu();
  persistence.remoteAvailable = false;
  persistence.bootstrapped = false;
  state.storageMode = "mysql";
  state.remoteDirty = false;
  state.remoteSaveError = true;
  updateSaveStatus();
  showAccessGate("Sesion cerrada.");
}

function handleUnauthorizedAccess(message = "Sesion expirada o invalida.") {
  clearAuthSession();
  persistence.remoteAvailable = false;
  state.remoteDirty = false;
  state.remoteSaveError = true;
  showAccessGate(message);
  updateSaveStatus();
}

async function handleManualSyncRequest() {
  if (state.storageMode !== "mysql") {
    return;
  }
  if (!persistence.remoteAvailable) {
    return;
  }
  if (state.isHydratingRemote || state.isSavingRemote) {
    return;
  }
  if (!state.remoteDirty && !state.remoteSaveError) {
    return;
  }

  await persistProjectsToServer(true);
}

function scheduleRemoteSave(delayMs = REMOTE_SAVE_DEBOUNCE_MS) {
  if (!persistence.remoteAvailable || state.storageMode !== "mysql") {
    return;
  }

  if (persistence.saveTimer) {
    window.clearTimeout(persistence.saveTimer);
  }

  persistence.saveTimer = window.setTimeout(() => {
    persistence.saveTimer = null;
    void persistProjectsToServer(true);
  }, delayMs);
}

async function persistProjectsToServer(markSaved = true) {
  if (!persistence.remoteAvailable) {
    return false;
  }

  if (persistence.saveInFlight) {
    persistence.saveQueued = true;
    return false;
  }

  const payload = serializeProjectsState();
  const saveVersion = state.remoteChangeVersion;
  state.isSavingRemote = true;
  state.remoteSaveError = false;
  updateSaveStatus();

  try {
    persistence.saveInFlight = window.fetch(SERVER_STATE_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    const response = await persistence.saveInFlight;

    if (response.status === 401 || response.status === 403) {
      handleUnauthorizedAccess("Tu sesion vencio. Vuelve a iniciar sesion.");
      return false;
    }

    if (!response.ok) {
      throw new Error(`Error ${response.status}`);
    }

    const result = await response.json();
    state.storageMode = normalizeStorageMode(result.storage);

    if (markSaved) {
      state.lastSavedAt = new Date();
    }
    if (state.remoteChangeVersion === saveVersion) {
      state.remoteDirty = false;
    }
    state.remoteSaveError = false;
    if (state.remoteDirty) {
      scheduleRemoteSave();
    }
    return true;
  } catch {
    state.remoteSaveError = true;
    return false;
  } finally {
    persistence.saveInFlight = null;
    state.isSavingRemote = false;
    if (persistence.saveQueued) {
      persistence.saveQueued = false;
      scheduleRemoteSave(0);
    }
    updateSaveStatus();
  }
}

async function bootstrapServerPersistence() {
  state.isHydratingRemote = true;
  updateSaveStatus();

  try {
    const response = await window.fetch(SERVER_STATE_ENDPOINT, {
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    });

    if (response.status === 401 || response.status === 403) {
      handleUnauthorizedAccess("Inicia sesion para conectar con el servidor.");
      return;
    }

    if (!response.ok) {
      throw new Error(`Error ${response.status}`);
    }

    const payload = await response.json();
    persistence.remoteAvailable = true;
    state.storageMode = normalizeStorageMode(payload.storage);
    state.remoteDirty = false;
    state.remoteSaveError = false;

    if (Array.isArray(payload.projects) && payload.projects.length > 0) {
      applyStoredProjectsState(payload);
      render();
    } else {
      state.remoteDirty = state.projects.length > 0;
      if (state.remoteDirty) {
        state.remoteChangeVersion += 1;
        scheduleRemoteSave();
      }
    }
  } catch {
    persistence.remoteAvailable = false;
    state.storageMode = "mysql";
    state.remoteDirty = false;
    state.remoteSaveError = true;
  } finally {
    persistence.bootstrapped = true;
    state.isHydratingRemote = false;
    updateSaveStatus();
  }
}

function syncCurrentProjectState() {
  const currentIndex = getCurrentProjectIndex();
  if (currentIndex === -1) {
    return;
  }

  const currentProject = state.projects[currentIndex];
  state.projects[currentIndex] = {
    ...currentProject,
    rows: cloneRows(state.rows),
    auditEntries: normalizeAuditEntries(state.auditEntries),
    snapshots: normalizeSnapshots(state.snapshots),
    collapsedIds: Array.from(state.collapsedIds),
    updatedAt: new Date().toISOString(),
  };
}

function getCurrentProjectIndex() {
  return state.projects.findIndex(
    (project) => project.id === state.currentProjectId,
  );
}

function getCurrentProject() {
  const currentIndex = getCurrentProjectIndex();
  return currentIndex >= 0 ? state.projects[currentIndex] : null;
}

function sanitizeProjectName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sanitizeSnapshotName(value) {
  return sanitizeProjectName(value);
}

function sanitizeOperatorName(value) {
  const sanitized = String(value || "").trim().replace(/\s+/g, " ");
  return sanitized || DEFAULT_OPERATOR_NAME;
}

function sanitizeTipoMetrado(value) {
  const sanitized = String(value || "").trim();
  return METRADO_TYPE_OPTIONS.includes(sanitized) ? sanitized : "";
}

function sanitizeReglaMetrado(value) {
  const sanitized = String(value || "").trim();
  return METRADO_RULE_OPTIONS.includes(sanitized) ? sanitized : "";
}

function isRevitMetradoType(value) {
  return normalizeText(value).trim() === "revit";
}

function getReglaMetradoForTipo(tipoMetrado, value) {
  if (!isRevitMetradoType(tipoMetrado)) {
    return "";
  }

  return sanitizeReglaMetrado(value);
}

function sanitizeUnidadPartida(value) {
  const sanitized = sanitizeSingleLine(value).trim();
  return UNIDAD_PARTIDA_OPTIONS.includes(sanitized) ? sanitized : sanitized;
}

function ensureUniqueProjectName(name, excludedProjectId) {
  const sanitized = sanitizeProjectName(name);
  if (!sanitized) {
    return "";
  }

  const existingNames = new Set(
    state.projects
      .filter((project) => project.id !== excludedProjectId)
      .map((project) => project.name.toLowerCase()),
  );

  if (!existingNames.has(sanitized.toLowerCase())) {
    return sanitized;
  }

  let suffix = 2;
  let candidate = `${sanitized} (${suffix})`;

  while (existingNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${sanitized} (${suffix})`;
  }

  return candidate;
}

function getNextProjectName() {
  return ensureUniqueProjectName(`Proyecto ${state.projects.length + 1}`, null);
}

function getDefaultSnapshotName() {
  return `Foto ${formatSnapshotDate(new Date().toISOString())}`;
}

function getSnapshotsSortedNewestFirst(snapshots = state.snapshots) {
  return snapshots
    .slice()
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function getSnapshotsSortedOldestFirst(snapshots = state.snapshots) {
  return snapshots
    .slice()
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function getLatestSnapshot() {
  return getSnapshotsSortedNewestFirst()[0] || null;
}

function getPreviousSnapshot(snapshotId) {
  const snapshots = getSnapshotsSortedOldestFirst();
  const index = snapshots.findIndex((snapshot) => snapshot.id === snapshotId);
  return index > 0 ? snapshots[index - 1] : null;
}

function getNextSnapshotVersionNumber() {
  return state.snapshots.reduce((max, snapshot) => {
    return Math.max(max, snapshot.versionNumber || 0);
  }, 0) + 1;
}

function getCurrentBudgetVersion() {
  const currentProject = getCurrentProject();
  const rows = cloneRows(state.rows);

  return {
    id: "current",
    name: "Presupuesto actual",
    rows,
    summary: buildSnapshotSummary(rows),
    userName: state.operatorName,
    createdAt: currentProject ? currentProject.updatedAt : new Date().toISOString(),
    versionNumber: null,
  };
}

function getBudgetVersionOptions() {
  return [getCurrentBudgetVersion(), ...getSnapshotsSortedNewestFirst()];
}

function getBudgetTimelineVersions() {
  return [...getSnapshotsSortedOldestFirst(), getCurrentBudgetVersion()];
}

function findBudgetVersionById(versionId) {
  if (versionId === "current") {
    return getCurrentBudgetVersion();
  }

  return state.snapshots.find((snapshot) => snapshot.id === versionId) || null;
}

function getBudgetVersionLabel(version) {
  if (!version) {
    return "Version";
  }

  if (version.id === "current") {
    return "Presupuesto actual";
  }

  return `V${version.versionNumber} - ${version.name}`;
}

function ensureSnapshotComparisonSelection() {
  const options = getBudgetVersionOptions();
  if (options.length === 0) {
    state.snapshotCompareBaseId = null;
    state.snapshotCompareTargetId = null;
    return;
  }

  if (options.length === 1) {
    state.snapshotCompareBaseId = options[0].id;
    state.snapshotCompareTargetId = null;
    return;
  }

  const allowedIds = new Set(options.map((option) => option.id));
  let baseId = allowedIds.has(state.snapshotCompareBaseId)
    ? state.snapshotCompareBaseId
    : null;
  let targetId = allowedIds.has(state.snapshotCompareTargetId)
    ? state.snapshotCompareTargetId
    : null;

  if (!baseId) {
    baseId = getLatestSnapshot() ? getLatestSnapshot().id : options[0].id;
  }

  if (!targetId) {
    targetId = "current";
  }

  if (baseId === targetId) {
    const fallback = options.find((option) => option.id !== baseId);
    targetId = fallback ? fallback.id : null;
  }

  state.snapshotCompareBaseId = baseId;
  state.snapshotCompareTargetId = targetId;
}

function updateSnapshotComparison(role, versionId) {
  if (role === "base") {
    state.snapshotCompareBaseId = versionId;
  } else if (role === "target") {
    state.snapshotCompareTargetId = versionId;
  } else {
    return;
  }

  ensureSnapshotComparisonSelection();

  if (state.snapshotCompareBaseId === state.snapshotCompareTargetId) {
    const fallback = getBudgetVersionOptions().find((option) => {
      return option.id !== state.snapshotCompareBaseId;
    });

    if (role === "base") {
      state.snapshotCompareTargetId = fallback ? fallback.id : null;
    } else {
      state.snapshotCompareBaseId = fallback ? fallback.id : null;
    }
  }

  render();
}

function setSnapshotComparison(baseId, targetId) {
  state.snapshotCompareBaseId = baseId;
  state.snapshotCompareTargetId = targetId;
  ensureSnapshotComparisonSelection();
  render();
}

function buildBudgetComparison(baseVersion, targetVersion) {
  const baseSummary = baseVersion.summary || buildSnapshotSummary(baseVersion.rows);
  const targetSummary = targetVersion.summary || buildSnapshotSummary(targetVersion.rows);
  const baseMap = buildComparableBudgetMap(baseVersion.rows);
  const targetMap = buildComparableBudgetMap(targetVersion.rows);
  const allIds = new Set([...baseMap.keys(), ...targetMap.keys()]);
  const changes = [];
  const counts = {
    added: 0,
    removed: 0,
    updated: 0,
  };

  allIds.forEach((rowId) => {
    const baseItem = baseMap.get(rowId) || null;
    const targetItem = targetMap.get(rowId) || null;

    if (!baseItem && targetItem) {
      counts.added += 1;
      changes.push({
        kind: "added",
        title: targetItem.title,
        meta: `Agregada | ${targetItem.code || "Sin codigo"}`,
        detail: `Nueva partida en el objetivo. Parcial ${formatAmount(targetItem.partial)}.`,
        deltaPartial: targetItem.partial,
      });
      return;
    }

    if (baseItem && !targetItem) {
      counts.removed += 1;
      changes.push({
        kind: "removed",
        title: baseItem.title,
        meta: `Eliminada | ${baseItem.code || "Sin codigo"}`,
        detail: `La partida ya no existe en el objetivo. Parcial base ${formatAmount(baseItem.partial)}.`,
        deltaPartial: -baseItem.partial,
      });
      return;
    }

    if (baseItem && targetItem && didComparableBudgetItemChange(baseItem, targetItem)) {
      counts.updated += 1;
      changes.push({
        kind: "updated",
        title: targetItem.title || baseItem.title,
        meta: `Editada | ${targetItem.code || baseItem.code || "Sin codigo"}`,
        detail: describeComparableBudgetChange(baseItem, targetItem),
        deltaPartial: targetItem.partial - baseItem.partial,
      });
    }
  });

  changes.sort((left, right) => Math.abs(right.deltaPartial) - Math.abs(left.deltaPartial));

  return {
    baseSummary,
    targetSummary,
    deltas: {
      grandTotal: targetSummary.grandTotal - baseSummary.grandTotal,
      rowCount: targetSummary.rowCount - baseSummary.rowCount,
      rootCount: targetSummary.rootCount - baseSummary.rootCount,
      leafCount: targetSummary.leafCount - baseSummary.leafCount,
      metradoTradicionalTotal:
        targetSummary.metradoTradicionalTotal - baseSummary.metradoTradicionalTotal,
      metradoBimTotal: targetSummary.metradoBimTotal - baseSummary.metradoBimTotal,
    },
    deltaPercent: getDeltaPercent(baseSummary.grandTotal, targetSummary.grandTotal),
    counts,
    changes,
  };
}

function buildComparableBudgetMap(rows) {
  const safeRows = cloneRows(rows);
  const codes = buildPartidaCodes(safeRows);

  return safeRows.reduce((map, row, index) => {
    map.set(row.id, {
      id: row.id,
      code: codes[index] || "",
      level: row.level,
      codificacion: sanitizeCodificacion(row.codificacion || ""),
      descripcion: sanitizeDescripcion(row.descripcion || "").trim(),
      grupoTablas: getGrupoTablasForRow(safeRows, index, codes),
      unidad: String(row.unidad || "").trim(),
      reglaMetrado: getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado),
      costo: parseDecimal(row.costo),
      metradoTradicional: parseDecimal(row.metradoTradicional ?? row.metrado),
      metradoBim: parseDecimal(row.metradoBim),
      partial: getRowPartialAtIndexForRows(safeRows, index),
      title:
        sanitizeDescripcion(row.descripcion || "").trim()
        || sanitizeCodificacion(row.codificacion || "")
        || codes[index]
        || `Fila ${index + 1}`,
    });
    return map;
  }, new Map());
}

function didComparableBudgetItemChange(baseItem, targetItem) {
  return (
    baseItem.level !== targetItem.level
    || baseItem.codificacion !== targetItem.codificacion
    || baseItem.descripcion !== targetItem.descripcion
    || baseItem.grupoTablas !== targetItem.grupoTablas
    || baseItem.unidad !== targetItem.unidad
    || baseItem.reglaMetrado !== targetItem.reglaMetrado
    || !areAmountsEqual(baseItem.costo, targetItem.costo)
    || !areAmountsEqual(baseItem.metradoTradicional, targetItem.metradoTradicional)
    || !areAmountsEqual(baseItem.metradoBim, targetItem.metradoBim)
  );
}

function describeComparableBudgetChange(baseItem, targetItem) {
  const details = [];

  if (baseItem.level !== targetItem.level) {
    details.push(`Nivel ${baseItem.level + 1} -> ${targetItem.level + 1}`);
  }

  if (baseItem.codificacion !== targetItem.codificacion) {
    details.push(
      `Codificacion ${formatComparisonText(baseItem.codificacion)} -> ${formatComparisonText(targetItem.codificacion)}`,
    );
  }

  if (baseItem.descripcion !== targetItem.descripcion) {
    details.push(
      `Descripcion ${formatComparisonText(baseItem.descripcion)} -> ${formatComparisonText(targetItem.descripcion)}`,
    );
  }

  if (baseItem.grupoTablas !== targetItem.grupoTablas) {
    details.push(
      `Grupo Tablas ${formatComparisonText(baseItem.grupoTablas)} -> ${formatComparisonText(targetItem.grupoTablas)}`,
    );
  }

  if (baseItem.unidad !== targetItem.unidad) {
    details.push(
      `Unidad ${formatComparisonText(baseItem.unidad)} -> ${formatComparisonText(targetItem.unidad)}`,
    );
  }

  if (baseItem.reglaMetrado !== targetItem.reglaMetrado) {
    details.push(
      `Regla de metrado ${formatComparisonText(baseItem.reglaMetrado)} -> ${formatComparisonText(targetItem.reglaMetrado)}`,
    );
  }

  if (!areAmountsEqual(baseItem.costo, targetItem.costo)) {
    details.push(`Costo ${formatAmount(baseItem.costo)} -> ${formatAmount(targetItem.costo)}`);
  }

  if (!areAmountsEqual(baseItem.metradoTradicional, targetItem.metradoTradicional)) {
    details.push(
      `Metrado trad. ${formatAmount(baseItem.metradoTradicional)} -> ${formatAmount(targetItem.metradoTradicional)}`,
    );
  }

  if (!areAmountsEqual(baseItem.metradoBim, targetItem.metradoBim)) {
    details.push(
      `Metrado BIM ${formatAmount(baseItem.metradoBim)} -> ${formatAmount(targetItem.metradoBim)}`,
    );
  }

  details.push(`Parcial ${formatAmount(baseItem.partial)} -> ${formatAmount(targetItem.partial)}`);

  return details.slice(0, 4).join(" | ");
}

function formatComparisonText(value) {
  const text = String(value || "").trim();
  return text || "vacio";
}

function areAmountsEqual(left, right) {
  return Math.abs(left - right) < 0.000001;
}

function getDeltaPercent(baseValue, targetValue) {
  if (!baseValue) {
    return targetValue === 0 ? 0 : null;
  }

  return ((targetValue - baseValue) / baseValue) * 100;
}

function formatSignedAmount(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatAmount(Math.abs(value))}`;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatAmount(Math.abs(value))}%`;
}

function formatSignedInteger(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  if (value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function getDeltaToneClass(value) {
  if (value === null || value === undefined) {
    return "is-neutral";
  }

  if (value > 0) {
    return "is-positive";
  }

  if (value < 0) {
    return "is-negative";
  }

  return "is-neutral";
}

function updateSaveStatus() {
  if (!saveStatus) {
    return;
  }

  const remoteMode = state.storageMode === "mysql";
  const authBlocked = authState.required && !authState.user;

  if (storageModePill) {
    storageModePill.textContent = getStorageModePillLabel(state.storageMode);
  }

  if (appModeLabel) {
    appModeLabel.textContent = getStorageModeAppLabel(state.storageMode);
  }

  if (syncNowButton) {
    syncNowButton.hidden = !remoteMode;
    syncNowButton.classList.toggle("is-syncing", state.isSavingRemote);
    syncNowButton.setAttribute("aria-label", state.isSavingRemote ? "Sincronizando" : "Sincronizar");
    syncNowButton.setAttribute("title", state.isSavingRemote ? "Sincronizando..." : "Sincronizar");
    syncNowButton.setAttribute("aria-busy", state.isSavingRemote ? "true" : "false");
    const canSyncNow =
      remoteMode
      && persistence.remoteAvailable
      && !authBlocked
      && !state.isHydratingRemote
      && !state.isSavingRemote
      && (state.remoteDirty || state.remoteSaveError);
    syncNowButton.disabled = !canSyncNow;
  }

  if (authBlocked) {
    saveStatus.textContent = "Sesion requerida para sincronizar";
    return;
  }

  if (state.isHydratingRemote) {
    saveStatus.textContent = `Conectando a ${getStorageModeTargetLabel(state.storageMode)}...`;
    return;
  }

  if (state.isSavingRemote) {
    saveStatus.textContent = `Sincronizando con ${getStorageModeTargetLabel(state.storageMode)}...`;
    return;
  }

  if (remoteMode && state.remoteSaveError) {
    saveStatus.textContent = `${getStorageModeShortLabel(state.storageMode)} con error de sincronizacion`;
    return;
  }

  if (remoteMode && state.remoteDirty) {
    saveStatus.textContent = "Cambios locales pendientes. Pulsa Sincronizar.";
    return;
  }

  if (remoteMode && !state.lastSavedAt) {
    saveStatus.textContent = `${getStorageModeShortLabel(state.storageMode)} listo para sincronizar`;
    return;
  }

  if (!state.lastSavedAt) {
    saveStatus.textContent = `${getStorageModeShortLabel(state.storageMode)} activo`;
    return;
  }

  const time = state.lastSavedAt.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  saveStatus.textContent = `${getStorageModeShortLabel(state.storageMode)} sincronizado ${time}`;
}

function normalizeStorageMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "mysql" || normalized === "cloud-sql" ? "mysql" : "mysql";
}

function getStorageModePillLabel(storageMode) {
  if (storageMode === "mysql") {
    return "MySQL conectado";
  }

  return "MySQL conectado";
}

function getStorageModeAppLabel(storageMode) {
  if (storageMode === "mysql") {
    return "Conectado a MySQL";
  }

  return "Conectado a MySQL";
}

function getStorageModeShortLabel(storageMode) {
  if (storageMode === "mysql") {
    return "MySQL";
  }

  return "MySQL";
}

function getStorageModeTargetLabel(storageMode) {
  if (storageMode === "mysql") {
    return "MySQL";
  }

  return "MySQL";
}

function normalizeRows(rows) {
  let previousLevel = 0;

  return rows.map((row, index) => {
    const normalized = {
      ...row,
      level: sanitizeLevel(row.level),
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

function pruneCollapsedIds() {
  const collapsibleIds = new Set(
    state.rows
      .filter((_, index) => rowHasChildren(state.rows, index))
      .map((row) => row.id),
  );

  state.collapsedIds = new Set(
    Array.from(state.collapsedIds).filter((id) => collapsibleIds.has(id)),
  );
}

function sanitizeLevel(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
}

function buildPartidaCodes(rows) {
  const counters = [];

  return rows.map((row) => {
    counters[row.level] = (counters[row.level] || 0) + 1;
    counters.length = row.level + 1;
    return counters.join(".");
  });
}

function rowHasChildren(rows, index) {
  return index < rows.length - 1 && rows[index + 1].level > rows[index].level;
}

function getRowIndexById(rowId) {
  return state.rows.findIndex((row) => row.id === rowId);
}

function isLeafOnlyField(fieldName) {
  return ["costo", "metradoTradicional", "metradoBim", "tipoMetrado", "reglaMetrado"].includes(fieldName);
}

function isLeafValueField(fieldName) {
  return ["costo", "metradoTradicional", "metradoBim"].includes(fieldName);
}

function getSelectedIndex() {
  return state.rows.findIndex((row) => row.id === state.selectedId);
}

function getParentIndex(rows, index) {
  const currentRow = rows[index];
  const level = currentRow ? currentRow.level : 0;

  if (level === 0) {
    return -1;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (rows[cursor].level === level - 1) {
      return cursor;
    }
  }

  return -1;
}

function getSiblingStarts(rows, index) {
  const parentIndex = getParentIndex(rows, index);
  const level = rows[index].level;
  const starts = [];

  rows.forEach((row, cursor) => {
    if (row.level !== level) {
      return;
    }

    if (getParentIndex(rows, cursor) !== parentIndex) {
      return;
    }

    starts.push(cursor);
  });

  return starts;
}

function getBranchEnd(rows, startIndex) {
  const rootLevel = rows[startIndex].level;
  let cursor = startIndex + 1;

  while (cursor < rows.length && rows[cursor].level > rootLevel) {
    cursor += 1;
  }

  return cursor - 1;
}

function buildExportRowsForMode(rootIndex, codes, exportMode) {
  const branchEnd = getBranchEnd(state.rows, rootIndex);
  const scopedRows = state.rows.slice(rootIndex, branchEnd + 1);

  if (exportMode === "presupuesto") {
    return scopedRows.map((row, offset) => {
      const absoluteIndex = rootIndex + offset;
      const metradoTradicional = parseDecimal(row.metradoTradicional ?? row.metrado);
      const metradoBim = parseDecimal(row.metradoBim);
      return {
        codificacion: row.codificacion || "",
        codigoPartida: codes[absoluteIndex] || "",
        descripcion: row.descripcion || "",
        unidad: row.unidad || "",
        costo: parseDecimal(row.costo),
        metradoTradicional,
        metradoBim,
        parcial: getRowPartialAtIndex(absoluteIndex),
        tipoMetrado: row.tipoMetrado || "",
        reglaMetrado: getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado),
        grupoTablas: getGrupoTablasForRow(state.rows, absoluteIndex, codes),
      };
    });
  }

  return scopedRows.reduce((rows, row, offset) => {
    if (normalizeText(row.tipoMetrado).trim() !== "revit") {
      return rows;
    }

    const absoluteIndex = rootIndex + offset;
    rows.push({
      codificacion: row.codificacion || "",
      codigoPartida: codes[absoluteIndex] || "",
      descripcion: row.descripcion || "",
      unidad: row.unidad || "",
      costo: parseDecimal(row.costo),
      reglaMetrado: getReglaMetradoForTipo(row.tipoMetrado, row.reglaMetrado),
      grupoTablas: getGrupoTablasForRow(state.rows, absoluteIndex, codes),
    });
    return rows;
  }, []);
}

function exportRootBranch(rootId, exportMode = "rvt") {
  const modeConfig = getExportModeConfig(exportMode);
  const rootIndex = state.rows.findIndex((row) => row.id === rootId);
  if (rootIndex === -1) {
    return;
  }

  const rootRow = state.rows[rootIndex];
  if (rootRow.level !== 0) {
    return;
  }

  const codes = buildPartidaCodes(state.rows);
  const exportRows = buildExportRowsForMode(rootIndex, codes, modeConfig.key);

  if (exportRows.length === 0) {
    window.alert(modeConfig.emptyAlert);
    return;
  }

  const label = getRootExportLabel(rootRow, codes[rootIndex]);
  const fileName = sanitizeFilename(`${projectTitle.textContent} - ${label}`) || modeConfig.fileFallbackName;
  const workbook = buildXlsxWorkbook(label, exportRows, modeConfig.columns);
  downloadBlobFile(`${fileName}.xlsx`, workbook);
}

function getRootExportLabel(row, code) {
  return (
    String(row.descripcion || "").trim() ||
    String(row.codificacion || "").trim() ||
    `Partida ${code}`
  );
}

function buildExcelWorkbook(title, rows) {
  const headers = [
    "CODIFICACIÓN",
    "CODIGO DE PARTIDA",
    "DESCRIPCIÓN DE PARTIDA",
    "UNIDAD DE PARTIDA",
    "COSTO",
    "GRUPO TABLAS",
  ];

  const tableRows = rows
    .map((row) => {
      return `
        <tr>
          <td>${escapeHtml(row.codificacion)}</td>
          <td>${escapeHtml(row.codigoPartida)}</td>
          <td>${escapeHtml(row.descripcion)}</td>
          <td>${escapeHtml(row.unidad)}</td>
          <td>${escapeHtml(row.costo)}</td>
          <td>${escapeHtml(row.grupoTablas || "")}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: Segoe UI, Calibri, Arial, sans-serif;
            font-size: 12px;
            color: #1b2735;
          }

          table {
            border-collapse: collapse;
            width: 100%;
          }

          th,
          td {
            border: 1px solid #c8d1dc;
            padding: 6px 8px;
            text-align: left;
            vertical-align: middle;
          }

          th {
            background: #eef2f6;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              ${headers.map((header) => `<th>${header}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob(["\ufeff", content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 0);
}

function buildXlsxWorkbook(title, rows, columns = EXPORT_COLUMN_SCHEMAS.rvt) {
  const activeColumns = Array.isArray(columns) && columns.length > 0
    ? columns
    : EXPORT_COLUMN_SCHEMAS.rvt;
  const headers = activeColumns.map((column) => String(column.header || "").trim() || column.key);
  const timestamp = new Date().toISOString();
  const worksheetRows = [
    `
      <row r="1">
        ${headers
          .map((header, index) => buildInlineStringCell(getExcelCellRef(index, 1), header, 1))
          .join("")}
      </row>
    `,
    ...rows.map((row, index) => {
      const excelRow = index + 2;
      const dataCells = activeColumns
        .map((column, columnIndex) => {
          const cellRef = getExcelCellRef(columnIndex, excelRow);
          if (column.type === "number") {
            return buildNumberCell(cellRef, parseDecimal(row[column.key]), 2);
          }
          return buildInlineStringCell(cellRef, row[column.key] || "", 0);
        })
        .join("");
      return `
      <row r="${excelRow}">
        ${dataCells}
      </row>
    `;
    }),
  ].join("");
  const lastColumnRef = getExcelCellRef(Math.max(activeColumns.length - 1, 0), 1).replace(/[0-9]+$/g, "");
  const colsXml = activeColumns
    .map((column, index) => {
      const width = Number.isFinite(column.width) ? column.width : 20;
      const columnNumber = index + 1;
      return `<col min="${columnNumber}" max="${columnNumber}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumnRef}${Math.max(rows.length + 1, 1)}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colsXml}</cols>
  <sheetData>${worksheetRows}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Exportacion" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="2">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FFEEF2F6"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="2">
    <border>
      <left/><right/><top/><bottom/><diagonal/>
    </border>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Quantiva</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>Exportacion</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
</Properties>`;

  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeHtml(title)}</dc:title>
  <dc:creator>Quantiva</dc:creator>
  <cp:lastModifiedBy>Quantiva</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;

  return createZipBlob(
    [
      { path: "[Content_Types].xml", data: contentTypesXml },
      { path: "_rels/.rels", data: rootRelsXml },
      { path: "docProps/app.xml", data: appXml },
      { path: "docProps/core.xml", data: coreXml },
      { path: "xl/workbook.xml", data: workbookXml },
      { path: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
      { path: "xl/styles.xml", data: stylesXml },
      { path: "xl/worksheets/sheet1.xml", data: worksheetXml },
    ],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

function buildInlineStringCell(cellRef, value, styleIndex = 0) {
  return `<c r="${cellRef}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeHtml(value)}</t></is></c>`;
}

function buildNumberCell(cellRef, value, styleIndex = 0) {
  const numericValue = Number.isFinite(value) ? value : 0;
  return `<c r="${cellRef}" s="${styleIndex}"><v>${numericValue}</v></c>`;
}

function getExcelCellRef(columnIndex, rowNumber) {
  let index = columnIndex;
  let columnName = "";

  while (index >= 0) {
    columnName = String.fromCharCode((index % 26) + 65) + columnName;
    index = Math.floor(index / 26) - 1;
  }

  return `${columnName}${rowNumber}`;
}

function downloadBlobFile(fileName, blob) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 0);
}

function createZipBlob(entries, mimeType) {
  const zipParts = [];
  const centralDirectoryParts = [];
  let localOffset = 0;
  let centralDirectoryLength = 0;

  entries.forEach((entry) => {
    const fileNameBytes = encodeUtf8(entry.path);
    const dataBytes = encodeUtf8(entry.data);
    const checksum = crc32(dataBytes);
    const { date, time } = getZipDosDateTime();
    const localHeader = createZipLocalHeader(
      checksum,
      dataBytes.length,
      fileNameBytes.length,
      date,
      time,
    );
    const centralHeader = createZipCentralDirectoryHeader(
      checksum,
      dataBytes.length,
      fileNameBytes.length,
      date,
      time,
      localOffset,
    );

    zipParts.push(localHeader, fileNameBytes, dataBytes);
    centralDirectoryParts.push(centralHeader, fileNameBytes);

    localOffset += localHeader.length + fileNameBytes.length + dataBytes.length;
    centralDirectoryLength += centralHeader.length + fileNameBytes.length;
  });

  const endRecord = createZipEndRecord(
    entries.length,
    centralDirectoryLength,
    localOffset,
  );

  return new Blob(
    [...zipParts, ...centralDirectoryParts, endRecord],
    { type: mimeType },
  );
}

function encodeUtf8(value) {
  return new TextEncoder().encode(String(value));
}

function createZipLocalHeader(crc, size, fileNameLength, dosDate, dosTime) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, fileNameLength, true);
  view.setUint16(28, 0, true);

  return bytes;
}

function createZipCentralDirectoryHeader(
  crc,
  size,
  fileNameLength,
  dosDate,
  dosTime,
  localOffset,
) {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, fileNameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);

  return bytes;
}

function createZipEndRecord(entryCount, centralDirectoryLength, centralDirectoryOffset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectoryLength, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return bytes;
}

function getZipDosDateTime(dateValue = new Date()) {
  const year = Math.max(dateValue.getFullYear(), 1980);
  const month = dateValue.getMonth() + 1;
  const date = dateValue.getDate();
  const hours = dateValue.getHours();
  const minutes = dateValue.getMinutes();
  const seconds = Math.floor(dateValue.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | date,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function crc32(bytes) {
  const table = getCrc32Table();
  let checksum = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    checksum =
      table[(checksum ^ bytes[index]) & 0xff] ^ (checksum >>> 8);
  }

  return (checksum ^ 0xffffffff) >>> 0;
}

function getCrc32Table() {
  if (getCrc32Table.table) {
    return getCrc32Table.table;
  }

  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  getCrc32Table.table = table;
  return table;
}

function isHiddenByCollapsedAncestor(rows, index) {
  let parentIndex = getParentIndex(rows, index);

  while (parentIndex >= 0) {
    if (state.collapsedIds.has(rows[parentIndex].id)) {
      return true;
    }

    parentIndex = getParentIndex(rows, parentIndex);
  }

  return false;
}

function moveBranch(rows, startIndex, direction) {
  const siblingStarts = getSiblingStarts(rows, startIndex);
  const siblingPosition = siblingStarts.indexOf(startIndex);
  const targetPosition = siblingPosition + direction;

  if (
    siblingPosition === -1 ||
    targetPosition < 0 ||
    targetPosition >= siblingStarts.length
  ) {
    return null;
  }

  const currentStart = startIndex;
  const currentEnd = getBranchEnd(rows, currentStart);
  const targetStart = siblingStarts[targetPosition];
  const targetEnd = getBranchEnd(rows, targetStart);

  if (direction < 0) {
    return [
      ...rows.slice(0, targetStart),
      ...rows.slice(currentStart, currentEnd + 1),
      ...rows.slice(targetEnd + 1, currentStart),
      ...rows.slice(targetStart, targetEnd + 1),
      ...rows.slice(currentEnd + 1),
    ];
  }

  return [
    ...rows.slice(0, currentStart),
    ...rows.slice(targetStart, targetEnd + 1),
    ...rows.slice(currentEnd + 1, targetStart),
    ...rows.slice(currentStart, currentEnd + 1),
    ...rows.slice(targetEnd + 1),
  ];
}

function shiftBranch(rows, startIndex, delta) {
  const branchEnd = getBranchEnd(rows, startIndex);
  const startLevel = rows[startIndex].level;
  let nextLevel = startLevel + delta;

  if (delta > 0) {
    const previousLevel = rows[startIndex - 1] ? rows[startIndex - 1].level : 0;
    nextLevel = Math.min(nextLevel, previousLevel + 1);
  }

  if (nextLevel < 0 || nextLevel === startLevel) {
    return null;
  }

  return rows.map((row, index) => {
    if (index < startIndex || index > branchEnd) {
      return row;
    }

    return {
      ...row,
      level: row.level + (nextLevel - startLevel),
    };
  });
}

function insertAtArray(rows, index, row) {
  return [...rows.slice(0, index), row, ...rows.slice(index)];
}

function getRowPartial(row) {
  const rowIndex = getRowIndexById(row.id);
  return getRowPartialAtIndex(rowIndex);
}

function getRowPartialAtIndex(rowIndex) {
  return getRowPartialAtIndexForRows(state.rows, rowIndex);
}

function getRowPartialAtIndexForRows(rows, rowIndex) {
  const row = rows[rowIndex];
  if (!row) {
    return 0;
  }

  if (!rowHasChildren(rows, rowIndex)) {
    return getLeafRowPartial(row);
  }

  const branchEnd = getBranchEnd(rows, rowIndex);
  let subtotal = 0;

  for (let cursor = rowIndex + 1; cursor <= branchEnd; cursor += 1) {
    if (!rowHasChildren(rows, cursor)) {
      subtotal += getLeafRowPartial(rows[cursor]);
    }
  }

  return subtotal;
}

function getLeafRowPartial(row) {
  const costo = parseDecimal(row.costo);
  const metradoTradicional = parseDecimal(row.metradoTradicional ?? row.metrado);
  const metradoBim = parseDecimal(row.metradoBim);
  return costo * (metradoTradicional + metradoBim);
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatAmount(value) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getGrandTotalForRows(rows) {
  return rows.reduce((sum, row, index) => {
    return row.level === 0 ? sum + getRowPartialAtIndexForRows(rows, index) : sum;
  }, 0);
}

function buildSnapshotSummary(rows) {
  const safeRows = cloneRows(rows);
  const rowCount = safeRows.length;
  const rootCount = safeRows.filter((row) => row.level === 0).length;

  return safeRows.reduce(
    (summary, row, index) => {
      if (!rowHasChildren(safeRows, index)) {
        summary.leafCount += 1;
        summary.metradoTradicionalTotal += parseDecimal(row.metradoTradicional ?? row.metrado);
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
      metradoBimTotal: 0,
    },
  );
}

function updateTableMinWidth(viewConfig = getCurrentViewConfig()) {
  const minWidth = viewConfig.columns.reduce((sum, column) => {
    return sum + getCssVariablePixels(column.widthVar);
  }, 0);

  itemTable.style.minWidth = `${Math.max(minWidth, 720)}px`;
}

function getCssVariablePixels(variableName) {
  const rootStyle = window.getComputedStyle(document.documentElement);
  return Number.parseFloat(rootStyle.getPropertyValue(variableName) || "0");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sanitizeCodificacion(value) {
  return sanitizeSingleLine(value).trim().replace(/\s+/g, " ");
}

function sanitizeDescripcion(value) {
  return repairKnownEncodingArtifacts(sanitizeSingleLine(value));
}

function repairKnownEncodingArtifacts(value) {
  const replacement = "\uFFFD";
  return String(value || "")
    .replaceAll(`HABILITACI${replacement}N`, "HABILITACI\u00D3N")
    .replaceAll(`COLOCACI${replacement}N`, "COLOCACI\u00D3N")
    .replaceAll(`INSTALACI${replacement}N`, "INSTALACI\u00D3N")
    .replaceAll(`CIMENTACI${replacement}N`, "CIMENTACI\u00D3N")
    .replaceAll(`ASF${replacement}LTICA`, "ASF\u00C1LTICA")
    .replaceAll(`S${replacement}TANO`, "S\u00D3TANO")
    .replaceAll(`MOVILIZACI${replacement}N`, "MOVILIZACI\u00D3N")
    .replaceAll(`DESMOVILIZACI${replacement}N`, "DESMOVILIZACI\u00D3N")
    .replaceAll(`ALBA${replacement}ILER${replacement}A`, "ALBA\u00D1ILER\u00CDA")
    .replaceAll(`ALBA${replacement}ILERIA`, "ALBA\u00D1ILERIA")
    .replaceAll(`GRADER${replacement}AS`, "GRADER\u00CDAS")
    .replaceAll(`PERIM${replacement}TRICA`, "PERIM\u00C9TRICA")
    .replaceAll(`CONTRACCI${replacement}N`, "CONTRACCI\u00D3N")
    .replaceAll(`PA${replacement}OS`, "PA\u00D1OS")
    .replaceAll(`PASES EN MURO ANCLADO ${replacement} 6"`, "PASES EN MURO ANCLADO \u00D8 6\"")
    .replaceAll(`PA${replacement}ETEO`, "PA\u00D1ETEO")
    .replaceAll(`PESTA${replacement}AS`, "PESTA\u00D1AS")
    .replaceAll(`M${replacement}NIMO`, "M\u00CDNIMO")
    .replaceAll(`EXCAVACI${replacement}N`, "EXCAVACI\u00D3N");
}

function normalizeCodificacionKey(value) {
  return normalizeText(sanitizeCodificacion(value)).trim();
}

function findDuplicateCodificacion(value, excludedRowId) {
  return findDuplicateByField(value, excludedRowId, "codificacion", normalizeCodificacionKey);
}

function normalizeDescripcionKey(value) {
  return normalizeText(sanitizeSingleLine(value)).trim().replace(/\s+/g, " ");
}

function findDuplicateDescripcion(value, excludedRowId) {
  return findDuplicateByField(value, excludedRowId, "descripcion", normalizeDescripcionKey);
}

function findDuplicateByField(value, excludedRowId, fieldName, normalizer) {
  const candidateKey = normalizer(value);
  if (!candidateKey) {
    return null;
  }

  const partidaCodes = buildPartidaCodes(state.rows);
  const index = state.rows.findIndex((row) => {
    return row.id !== excludedRowId && normalizer(row[fieldName]) === candidateKey;
  });

  if (index === -1) {
    return null;
  }

  return {
    row: state.rows[index],
    index,
    code: partidaCodes[index] || "",
  };
}

function getDuplicateFieldMessage(fieldName, partidaCode) {
  const label =
    fieldName === "descripcion"
      ? "La descripci\u00F3n de partida"
      : "La codificaci\u00F3n";

  return `${label} ya existe en la partida ${partidaCode}.`;
}

function sanitizeSingleLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ");
}

function sanitizeFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function updateSelectionUi() {
  body.querySelectorAll("tr[data-row-id]").forEach((rowElement) => {
    rowElement.classList.toggle(
      "is-selected",
      rowElement.dataset.rowId === state.selectedId,
    );
  });
}

function updateVisiblePartialCells() {
  body.querySelectorAll("tr[data-row-id]").forEach((rowElement) => {
    const rowId = rowElement.dataset.rowId;
    const rowIndex = getRowIndexById(rowId);
    const partialCell = rowElement.querySelector(".partial-cell");

    if (rowIndex === -1 || !partialCell) {
      return;
    }

    const partial = getRowPartialAtIndex(rowIndex);
    partialCell.textContent = formatAmount(partial);
    partialCell.classList.toggle("is-empty", partial === 0);
    partialCell.classList.toggle(
      "partial-cell--subtotal",
      rowHasChildren(state.rows, rowIndex),
    );
  });
}

function autoSizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateDescriptionColumnWidth(visibleEntries) {
  const viewConfig = getCurrentViewConfig();
  const entries =
    visibleEntries ||
    getVisibleEntries(
      state.rows,
      buildPartidaCodes(state.rows),
      state.filterQuery,
      { respectCollapsed: viewConfig.allowsStructureEditing },
    );

  const referenceField =
    body.querySelector(".cell-field--descripcion") ||
    document.querySelector(".cell-field");
  const referenceStyle = referenceField
    ? window.getComputedStyle(referenceField)
    : window.getComputedStyle(document.body);
  const font = [
    referenceStyle.fontStyle,
    referenceStyle.fontVariant,
    referenceStyle.fontWeight,
    referenceStyle.fontSize,
    referenceStyle.lineHeight === "normal" ? "" : `/${referenceStyle.lineHeight}`,
    referenceStyle.fontFamily,
  ]
    .filter(Boolean)
    .join(" ");
  const padding =
    Number.parseFloat(referenceStyle.paddingLeft || "0") +
    Number.parseFloat(referenceStyle.paddingRight || "0") +
    42;
  const fixedWidth = viewConfig.columns.reduce((sum, column) => {
    if (column.key === "descripcion") {
      return sum;
    }

    return sum + getCssVariablePixels(column.widthVar);
  }, 0);
  const canvas = updateDescriptionColumnWidth.canvas ||
    (updateDescriptionColumnWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.font = font;

  const widestText = entries.reduce((maxWidth, entry) => {
    const text = entry.row.descripcion.trim() || "Describe la partida o subpartida";
    return Math.max(maxWidth, context.measureText(text).width);
  }, context.measureText("Describe la partida o subpartida").width);

  const measuredWidth = Math.ceil(widestText + padding);
  const availableWidth = tableWrap
    ? Math.max(tableWrap.clientWidth - fixedWidth - 24, 0)
    : 0;
  const preferredWidth = Math.max(availableWidth - 120, 0);
  const width = Math.max(measuredWidth, preferredWidth, 260);
  document.documentElement.style.setProperty(
    "--descripcion-col-width",
    `${width}px`,
  );
  updateTableMinWidth(viewConfig);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
