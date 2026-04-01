const LEGACY_ROWS_STORAGE_KEY = "itemicostos.rows.v1";
const PROJECTS_STORAGE_KEY = "itemicostos.projects.v2";
const UI_STORAGE_KEY = "itemicostos.ui.v1";

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
const searchInput = document.querySelector("#table-search-input");
const searchWrap = document.querySelector("#search-wrap");
const sidebarToggleButton = document.querySelector("#sidebar-toggle-button");
const viewButtons = Array.from(document.querySelectorAll("[data-view]"));
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
const tableWrap = document.querySelector(".table-wrap");
const toolbar = document.querySelector("#structure-toolbar");
const selectionPill = document.querySelector(".head-pill--selection");
const TREE_INDENT_STEP = 16;
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
        key: "unidad",
        label: "Unidad de Partida",
        colClass: "col-unidad",
        widthVar: "--unidad-col-width",
        type: "input",
        field: "unidad",
        editable: true,
        placeholder: "m2, ml, und...",
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
      "Aqui editas solo el metrado tradicional sin alterar la estructura del itemizado.",
    shortcutText:
      "En esta vista solo editas el metrado tradicional; el resto queda fijo.",
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
        type: "input",
        field: "unidad",
        editable: false,
        placeholder: "m2, ml, und...",
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
        key: "parcial",
        label: "Parcial",
        colClass: "col-parcial",
        widthVar: "--parcial-col-width",
        type: "partial",
      },
    ],
  },
  "exportaciones-rvt": {
    key: "exportaciones-rvt",
    label: "Exportaciones para RVT",
    matrixTitle: "Exportaciones para RVT",
    contentType: "export",
    searchEnabled: false,
    helperText:
      "Cada boton exporta una raiz completa a un archivo Excel con codificacion, codigo, descripcion, unidad y costo.",
    shortcutText:
      "Usa un boton por cada raiz para generar su archivo Excel listo para revision o intercambio.",
    allowsStructureEditing: false,
    columns: [],
  },
};

const uiState = loadUiState();
const storedProjectsState = loadProjectsState(uiState);
const state = {
  projects: storedProjectsState.projects,
  currentProjectId: storedProjectsState.currentProjectId,
  rows: [],
  selectedId: null,
  pendingFocus: null,
  filterQuery: "",
  collapsedIds: new Set(),
  dragSession: null,
  currentView: VIEW_CONFIGS[uiState.currentView] ? uiState.currentView : "itemizado",
  sidebarCollapsed: uiState.sidebarCollapsed !== false,
  lastSavedAt: null,
};

hydrateCurrentProject(false);
pruneCollapsedIds();
state.selectedId = state.rows[0] ? state.rows[0].id : null;

applySidebarState();
persistUiState();
saveProjectState(false);
updateSaveStatus();
render();

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

  exportRootBranch(button.dataset.exportRootId);
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

  updatePartialCell(row.id);
  refreshMetrics();
});

body.addEventListener("change", (event) => {
  const field = event.target.name;
  const rowElement = event.target.closest("tr[data-row-id]");

  if (!["codificacion", "descripcion"].includes(field) || !rowElement) {
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

  const nextValue =
    field === "codificacion"
      ? sanitizeCodificacion(event.target.value)
      : sanitizeDescripcion(event.target.value);
  event.target.value = nextValue;

  const duplicate =
    field === "codificacion"
      ? findDuplicateCodificacion(nextValue, row.id)
      : findDuplicateDescripcion(nextValue, row.id);

  if (duplicate) {
    event.target.value = row.codificacion ?? "";
    if (field === "descripcion") {
      event.target.value = row.descripcion ?? "";
    }

    event.target.setCustomValidity(getDuplicateFieldMessage(field, duplicate.code));
    event.target.reportValidity();
    return;
  }

  if (nextValue === row[field]) {
    return;
  }

  row[field] = nextValue;
  saveRows(state.rows);

  if (field === "descripcion") {
    updateDescriptionColumnWidth();
  }

  refreshMetrics();
});

searchInput.addEventListener("input", (event) => {
  state.filterQuery = event.target.value.trim();
  render();
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

sidebarToggleButton.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  persistUiState();
  applySidebarState();
});

window.addEventListener("resize", () => {
  updateDescriptionColumnWidth();

  if (state.dragSession && state.dragSession.started) {
    updateTreeDragTarget(state.dragSession.lastX, state.dragSession.lastY);
    applyTreeDragFeedback();
  }
});

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
  state.rows = normalizeRows(rows);
  pruneCollapsedIds();
  state.selectedId = selectedId;
  state.pendingFocus = focusField ? { id: selectedId, field: focusField } : null;
  persistUiState();
  saveRows(state.rows);
  render();
}

function getCurrentViewConfig() {
  return VIEW_CONFIGS[state.currentView] || VIEW_CONFIGS.itemizado;
}

function switchView(view) {
  if (!VIEW_CONFIGS[view] || view === state.currentView) {
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
  const filterQuery = viewConfig.contentType === "table" ? state.filterQuery : "";
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
    renderExportPanel(partidaCodes);
  } else {
    exportPanel.hidden = true;
    tableWrap.hidden = false;
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
          const codificacion = row.codificacion.trim();
          const selectedLabel = codificacion || "Sin codificacion";

          return `
            <tr data-row-id="${row.id}" class="${isSelected ? "is-selected" : ""}" title="${escapeHtml(selectedLabel)}">
              ${renderRowCells(viewConfig, { row, index, code })}
            </tr>
          `;
        })
        .join("");
    }
  }

  updateProjectUi();
  updateViewUi(viewConfig);
  if (viewConfig.contentType === "table") {
    updateDescriptionColumnWidth(visibleEntries);
  }
  refreshMetrics(partidaCodes, visibleEntries);
  if (viewConfig.contentType === "table") {
    updateSelectionUi();
  }
  updateToolbarState();
  if (viewConfig.contentType === "table") {
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
      return renderPartialCell(row);
    case "input":
      return renderInputCell(row, column);
    default:
      return "<td></td>";
  }
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

function renderInputCell(row, column) {
  const classes = ["cell-field"];
  if (column.inputClass) {
    classes.push(column.inputClass);
  }

  const isEditable = isColumnEditable(column);
  if (!isEditable) {
    classes.push("cell-field--readonly");
  }

  const inputMode = column.inputMode
    ? ` inputmode="${column.inputMode}"`
    : "";
  const value = escapeHtml(row[column.field] ?? "");
  const placeholder = escapeHtml(column.placeholder || "");
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

function renderPartialCell(row) {
  const partial = getRowPartial(row);

  return `
    <td class="partial-cell ${partial === 0 ? "is-empty" : ""}">
      ${formatAmount(partial)}
    </td>
  `;
}

function renderExportPanel(codes) {
  const rootEntries = state.rows
    .map((row, index) => ({ row, index, code: codes[index] }))
    .filter((entry) => entry.row.level === 0);

  if (rootEntries.length === 0) {
    exportPanel.innerHTML = `
      <div class="empty-state">
        <strong>No hay raices para exportar</strong>
        <p>Crea al menos una partida raiz en Itemizado para generar archivos Excel.</p>
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
              title="Exportar ${escapeHtml(title)} a Excel"
            >
              <span class="export-root-button__title">${escapeHtml(title)}</span>
              <span class="export-root-button__meta">${code} · ${partidaLabel}</span>
              <span class="export-root-button__action">Exportar Excel</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function isColumnEditable(column) {
  return column.type === "input" && column.editable !== false;
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
  grandTotal.textContent = formatAmount(
    state.rows.reduce((sum, row) => sum + getRowPartial(row), 0),
  );
  depthCount.textContent = String(maxDepth);
  rootCount.textContent = String(rootRows);
  visibleCount.textContent = String(visibleRows);
  visibleCountInline.textContent = String(visibleRows);

  if (viewConfig.contentType === "export") {
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

function hydrateCurrentProject(resetSelection) {
  let currentProject = getCurrentProject();

  if (!currentProject) {
    const fallbackProject = normalizeProjectRecord({
      id: createId(),
      name: "Proyecto 1",
      rows: [createRow()],
      collapsedIds: [],
    });
    state.projects = [fallbackProject];
    state.currentProjectId = fallbackProject.id;
    currentProject = fallbackProject;
  }

  state.rows = cloneRows(currentProject.rows);
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
  projectTitle.textContent = currentProject ? currentProject.name : "Proyecto";

  projectSelect.innerHTML = state.projects
    .map((project) => {
      const selected = project.id === state.currentProjectId ? " selected" : "";
      return `<option value="${project.id}"${selected}>${escapeHtml(project.name)}</option>`;
    })
    .join("");

  projectSelect.value = state.currentProjectId || "";
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
  selectionPill.hidden = viewConfig.contentType === "export";
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
        entry.row.unidad,
        entry.row.costo,
        entry.row.metrado,
        entry.row.metradoTradicional,
        entry.row.metradoBim,
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
    (Array.isArray(rows) ? rows : []).map((row) => ({
      ...createRow(),
      ...row,
      id: row.id || createId(),
      codificacion: sanitizeCodificacion(row.codificacion || ""),
      descripcion: sanitizeDescripcion(row.descripcion || ""),
      metradoTradicional: row.metradoTradicional ?? row.metrado ?? "",
      metradoBim: row.metradoBim ?? "",
    })),
  );
}

function normalizeProjectRecord(project, index = 0) {
  const rows = cloneRows(project.rows);
  const normalizedRows = rows.length > 0 ? rows : [createRow()];

  return {
    id: project.id || createId(),
    name: sanitizeProjectName(project.name) || `Proyecto ${index + 1}`,
    rows: normalizedRows,
    collapsedIds: Array.isArray(project.collapsedIds)
      ? project.collapsedIds.filter((id) => typeof id === "string")
      : [],
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || new Date().toISOString(),
  };
}

function loadProjectsState(uiStateValue) {
  try {
    const saved = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const projects = Array.isArray(parsed.projects)
        ? parsed.projects.map((project, index) => normalizeProjectRecord(project, index))
        : [];

      if (projects.length > 0) {
        const currentProjectId = projects.some(
          (project) => project.id === parsed.currentProjectId,
        )
          ? parsed.currentProjectId
          : projects[0].id;

        return { projects, currentProjectId };
      }
    }
  } catch {
    // Use legacy storage fallback below.
  }

  const legacyRows = loadRows();
  const migratedProject = normalizeProjectRecord(
    {
      id: createId(),
      name: "Proyecto 1",
      rows: legacyRows.length > 0 ? legacyRows : [createRow()],
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

function loadRows() {
  try {
    const saved = window.localStorage.getItem(LEGACY_ROWS_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return cloneRows(parsed);
  } catch {
    return [];
  }
}

function saveRows(rows) {
  state.rows = cloneRows(rows);
  saveProjectState();
}

function loadUiState() {
  try {
    const saved = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!saved) {
      return {};
    }

    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveUiState(value) {
  const current = loadUiState();
  window.localStorage.setItem(
    UI_STORAGE_KEY,
    JSON.stringify({ ...current, ...value }),
  );
}

function persistUiState() {
  saveUiState({
    currentView: state.currentView,
    sidebarCollapsed: state.sidebarCollapsed,
  });
}

function saveProjectState(markSaved = true) {
  syncCurrentProjectState();
  window.localStorage.setItem(
    PROJECTS_STORAGE_KEY,
    JSON.stringify({
      currentProjectId: state.currentProjectId,
      projects: state.projects,
    }),
  );

  if (markSaved) {
    state.lastSavedAt = new Date();
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

function updateSaveStatus() {
  if (!saveStatus) {
    return;
  }

  if (!state.lastSavedAt) {
    saveStatus.textContent = "Guardado local activo";
    return;
  }

  const time = state.lastSavedAt.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  saveStatus.textContent = `Guardado local ${time}`;
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

function exportRootBranch(rootId) {
  const rootIndex = state.rows.findIndex((row) => row.id === rootId);
  if (rootIndex === -1) {
    return;
  }

  const rootRow = state.rows[rootIndex];
  if (rootRow.level !== 0) {
    return;
  }

  const codes = buildPartidaCodes(state.rows);
  const branchEnd = getBranchEnd(state.rows, rootIndex);
  const exportRows = state.rows.slice(rootIndex, branchEnd + 1).map((row, offset) => {
    const absoluteIndex = rootIndex + offset;
    return {
      codificacion: row.codificacion || "",
      codigoPartida: codes[absoluteIndex] || "",
      descripcion: row.descripcion || "",
      unidad: row.unidad || "",
      costo: parseDecimal(row.costo),
    };
  });

  const label = getRootExportLabel(rootRow, codes[rootIndex]);
  const fileName = sanitizeFilename(`${projectTitle.textContent} - ${label}`) || "exportacion-rvt";
  const workbook = buildXlsxWorkbook(label, exportRows);
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

function buildXlsxWorkbook(title, rows) {
  const headers = [
    "CODIFICACI\u00D3N",
    "CODIGO DE PARTIDA",
    "DESCRIPCI\u00D3N DE PARTIDA",
    "UNIDAD DE PARTIDA",
    "COSTO",
  ];
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
      return `
      <row r="${excelRow}">
        ${buildInlineStringCell(getExcelCellRef(0, excelRow), row.codificacion, 0)}
        ${buildInlineStringCell(getExcelCellRef(1, excelRow), row.codigoPartida, 0)}
        ${buildInlineStringCell(getExcelCellRef(2, excelRow), row.descripcion, 0)}
        ${buildInlineStringCell(getExcelCellRef(3, excelRow), row.unidad, 0)}
        ${buildNumberCell(getExcelCellRef(4, excelRow), row.costo, 2)}
      </row>
    `;
    }),
  ].join("");

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E${Math.max(rows.length + 1, 1)}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="3" width="46" customWidth="1"/>
    <col min="4" max="4" width="20" customWidth="1"/>
    <col min="5" max="5" width="14" customWidth="1"/>
  </cols>
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
  <Application>Itemizados</Application>
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
  <dc:creator>Itemizados</dc:creator>
  <cp:lastModifiedBy>Itemizados</cp:lastModifiedBy>
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
  return sanitizeSingleLine(value).trim().replace(/\s+/g, " ");
}

function normalizeCodificacionKey(value) {
  return normalizeText(sanitizeCodificacion(value)).trim();
}

function findDuplicateCodificacion(value, excludedRowId) {
  return findDuplicateByField(value, excludedRowId, "codificacion", normalizeCodificacionKey);
}

function normalizeDescripcionKey(value) {
  return normalizeText(sanitizeDescripcion(value)).trim();
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

function updatePartialCell(rowId) {
  const row = state.rows.find((entry) => entry.id === rowId);
  const partialCell = body.querySelector(
    `tr[data-row-id="${rowId}"] .partial-cell`,
  );

  if (!row || !partialCell) {
    return;
  }

  const partial = getRowPartial(row);
  partialCell.textContent = formatAmount(partial);
  partialCell.classList.toggle("is-empty", partial === 0);
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
