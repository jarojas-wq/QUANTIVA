const ITEMICOSTOS = {
  spreadsheetId: "",
  createIfMissing: true,
  spreadsheetTitle: "Itemicostos",
  token: "",
  tabs: {
    meta: "itemicostos_meta",
    state: "itemicostos_state",
    projects: "itemicostos_projects",
  },
};

function doGet() {
  return jsonResponse_({
    ok: true,
    message: "Itemicostos bridge activo. Usa POST con action=health|loadState|persistState.",
  });
}

function doPost(event) {
  try {
    const request = parseRequest_(event);
    assertToken_(request.token);

    const action = String(request.action || "").trim();
    if (!action) {
      return jsonResponse_({ ok: false, error: "action es obligatorio." });
    }

    const spreadsheet = ensureSpreadsheet_();
    ensureTabs_(spreadsheet);

    if (action === "health") {
      return jsonResponse_({
        ok: true,
        ...getSpreadsheetMeta_(spreadsheet),
      });
    }

    if (action === "loadState") {
      return jsonResponse_({
        ok: true,
        ...getSpreadsheetMeta_(spreadsheet),
        state: loadState_(spreadsheet),
      });
    }

    if (action === "persistState") {
      const payload = normalizeState_(request.payload);
      const savedAt = persistState_(spreadsheet, payload);
      return jsonResponse_({
        ok: true,
        savedAt,
        ...getSpreadsheetMeta_(spreadsheet),
      });
    }

    return jsonResponse_({
      ok: false,
      error: "action no soportado. Usa health, loadState o persistState.",
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: "No se pudo completar la solicitud.",
      detail: error && error.message ? String(error.message) : String(error),
    });
  }
}

function parseRequest_(event) {
  const fallback = event && event.parameter ? event.parameter : {};
  if (!event || !event.postData || !event.postData.contents) {
    return fallback;
  }

  const rawBody = String(event.postData.contents || "").trim();
  if (!rawBody) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function assertToken_(incomingToken) {
  const expectedToken = String(ITEMICOSTOS.token || "").trim();
  if (!expectedToken) {
    return;
  }

  if (String(incomingToken || "").trim() !== expectedToken) {
    throw new Error("Token invalido.");
  }
}

function ensureSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = String(ITEMICOSTOS.spreadsheetId || "").trim();
  const savedId = String(properties.getProperty("ITEMICOSTOS_SPREADSHEET_ID") || "").trim();
  const candidateId = configuredId || savedId;

  let spreadsheet;
  if (candidateId) {
    spreadsheet = SpreadsheetApp.openById(candidateId);
  } else if (ITEMICOSTOS.createIfMissing !== false) {
    spreadsheet = SpreadsheetApp.create(String(ITEMICOSTOS.spreadsheetTitle || "Itemicostos"));
  } else {
    throw new Error("No hay spreadsheetId. Define ITEMICOSTOS.spreadsheetId o createIfMissing=true.");
  }

  const resolvedId = spreadsheet.getId();
  if (savedId !== resolvedId) {
    properties.setProperty("ITEMICOSTOS_SPREADSHEET_ID", resolvedId);
  }

  return spreadsheet;
}

function ensureTabs_(spreadsheet) {
  const expectedTabs = getTabs_();
  const existingTabs = new Set(
    spreadsheet.getSheets().map((sheet) => sheet.getName()),
  );

  Object.values(expectedTabs).forEach((tabName) => {
    if (!existingTabs.has(tabName)) {
      spreadsheet.insertSheet(tabName);
    }
  });
}

function getSpreadsheetMeta_(spreadsheet) {
  const spreadsheetId = spreadsheet.getId();
  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheet.getUrl(),
    tabs: getTabs_(),
  };
}

function getTabs_() {
  return {
    meta: String(ITEMICOSTOS.tabs.meta || "itemicostos_meta"),
    state: String(ITEMICOSTOS.tabs.state || "itemicostos_state"),
    projects: String(ITEMICOSTOS.tabs.projects || "itemicostos_projects"),
  };
}

function normalizeState_(inputState) {
  const state = inputState && typeof inputState === "object" ? inputState : {};
  const projects = Array.isArray(state.projects) ? state.projects : [];
  return {
    currentProjectId: state.currentProjectId || null,
    projects,
  };
}

function loadState_(spreadsheet) {
  const tabs = getTabs_();
  const stateSheet = spreadsheet.getSheetByName(tabs.state);
  const values = stateSheet.getDataRange().getValues();
  const serializedState = joinChunkedStateRows_(values);

  if (!serializedState) {
    return {
      currentProjectId: null,
      projects: [],
    };
  }

  const parsed = JSON.parse(serializedState);
  return normalizeState_(parsed);
}

function persistState_(spreadsheet, state) {
  const tabs = getTabs_();
  const metaSheet = spreadsheet.getSheetByName(tabs.meta);
  const stateSheet = spreadsheet.getSheetByName(tabs.state);
  const projectsSheet = spreadsheet.getSheetByName(tabs.projects);

  const savedAt = new Date().toISOString();
  const serializedState = JSON.stringify(state);
  const stateRows = [["chunkIndex", "jsonChunk"]];
  chunkText_(serializedState, 40000).forEach((chunk, index) => {
    stateRows.push([String(index + 1), chunk]);
  });

  const metaRows = [
    ["key", "value"],
    ["savedAt", savedAt],
    ["currentProjectId", state.currentProjectId || ""],
    ["projectCount", String(state.projects.length)],
    ["storage", "google-apps-script"],
  ];
  const projectSummaryRows = buildProjectSummaryRows_(state.projects);

  writeRows_(metaSheet, metaRows);
  writeRows_(stateSheet, stateRows);
  writeRows_(projectsSheet, projectSummaryRows);

  return savedAt;
}

function writeRows_(sheet, rows) {
  sheet.clearContents();
  if (!rows.length) {
    return;
  }

  const maxColumns = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const clone = row.slice();
    while (clone.length < maxColumns) {
      clone.push("");
    }
    return clone;
  });
  sheet.getRange(1, 1, normalizedRows.length, maxColumns).setValues(normalizedRows);
}

function joinChunkedStateRows_(rows) {
  if (!rows || rows.length <= 1) {
    return "";
  }

  return rows
    .slice(1)
    .map((row) => ({
      index: Number(row[0]) || 0,
      chunk: row[1] || "",
    }))
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.chunk)
    .join("");
}

function chunkText_(text, chunkSize) {
  const source = String(text || "");
  if (!source) {
    return [""];
  }

  const chunks = [];
  for (let cursor = 0; cursor < source.length; cursor += chunkSize) {
    chunks.push(source.slice(cursor, cursor + chunkSize));
  }
  return chunks;
}

function buildProjectSummaryRows_(projects) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const rows = [[
    "projectId",
    "name",
    "updatedAt",
    "rows",
    "auditEntries",
    "snapshots",
    "grandTotal",
  ]];

  safeProjects.forEach((project) => {
    const projectRows = Array.isArray(project.rows) ? project.rows : [];
    const auditEntries = Array.isArray(project.auditEntries) ? project.auditEntries : [];
    const snapshots = Array.isArray(project.snapshots) ? project.snapshots : [];
    const grandTotal = computeGrandTotal_(projectRows);
    rows.push([
      project.id || "",
      project.name || "",
      project.updatedAt || "",
      String(projectRows.length),
      String(auditEntries.length),
      String(snapshots.length),
      grandTotal.toFixed(2),
    ]);
  });

  return rows;
}

function computeGrandTotal_(rows) {
  let total = 0;
  rows.forEach((row, index) => {
    if (Number(row.level || 0) === 0) {
      total += getRowPartialAtIndex_(rows, index);
    }
  });
  return total;
}

function getRowPartialAtIndex_(rows, rowIndex) {
  const row = rows[rowIndex];
  if (!row) {
    return 0;
  }

  if (!rowHasChildren_(rows, rowIndex)) {
    return getLeafRowPartial_(row);
  }

  const branchEnd = getBranchEnd_(rows, rowIndex);
  let subtotal = 0;
  for (let cursor = rowIndex + 1; cursor <= branchEnd; cursor += 1) {
    if (!rowHasChildren_(rows, cursor)) {
      subtotal += getLeafRowPartial_(rows[cursor]);
    }
  }

  return subtotal;
}

function rowHasChildren_(rows, index) {
  if (index >= rows.length - 1) {
    return false;
  }
  return Number(rows[index + 1].level || 0) > Number(rows[index].level || 0);
}

function getBranchEnd_(rows, index) {
  const currentLevel = Number(rows[index].level || 0);
  let cursor = index + 1;
  while (cursor < rows.length && Number(rows[cursor].level || 0) > currentLevel) {
    cursor += 1;
  }
  return cursor - 1;
}

function getLeafRowPartial_(row) {
  const costo = parseDecimal_(row.costo);
  const metradoTradicional = parseDecimal_(row.metradoTradicional != null ? row.metradoTradicional : row.metrado);
  const metradoBim = parseDecimal_(row.metradoBim);
  return costo * (metradoTradicional + metradoBim);
}

function parseDecimal_(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
