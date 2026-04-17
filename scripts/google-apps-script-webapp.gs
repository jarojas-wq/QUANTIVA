const ITEMICOSTOS = {
  spreadsheetId: "",
  createIfMissing: true,
  spreadsheetTitle: "Itemicostos",
  token: "",
  tables: {
    proyecto: "MTRD_Proyecto",
    item: "MTRD_Item",
    itemColapsado: "MTRD_ItemColapsado",
    auditoriaItem: "MTRD_AuditoriaItem",
    snapshot: "MTRD_Snapshot",
    snapshotItem: "MTRD_SnapshotItem",
    appMeta: "MTRD_AppMeta",
  },
  legacyTabs: {
    state: "itemicostos_state",
  },
};

const TABLE_HEADERS = {
  proyecto: [
    "MTRD_Proyecto_ID",
    "MTRD_Proyecto_UID",
    "MTRD_Proyecto_Nombre",
    "MTRD_Proyecto_CreadoEn",
    "MTRD_Proyecto_ActualizadoEn",
    "MTRD_Proyecto_Estado",
  ],
  item: [
    "MTRD_Item_ID",
    "MTRD_Item_KEY_Proyecto",
    "MTRD_Item_UID",
    "MTRD_Item_Orden",
    "MTRD_Item_Nivel",
    "MTRD_Item_Codificacion",
    "MTRD_Item_Descripcion",
    "MTRD_Item_Unidad",
    "MTRD_Item_Costo",
    "MTRD_Item_MetradoTradicional",
    "MTRD_Item_MetradoBim",
    "MTRD_Item_TipoMetrado",
    "MTRD_Item_CreadoEn",
    "MTRD_Item_ActualizadoEn",
  ],
  itemColapsado: [
    "MTRD_ItemColapsado_ID",
    "MTRD_ItemColapsado_KEY_Proyecto",
    "MTRD_ItemColapsado_KEY_Item",
    "MTRD_ItemColapsado_CreadoEn",
  ],
  auditoriaItem: [
    "MTRD_AuditoriaItem_ID",
    "MTRD_AuditoriaItem_KEY_Proyecto",
    "MTRD_AuditoriaItem_KEY_Item",
    "MTRD_AuditoriaItem_ItemUID",
    "MTRD_AuditoriaItem_Tipo",
    "MTRD_AuditoriaItem_Campo",
    "MTRD_AuditoriaItem_ValorAntes",
    "MTRD_AuditoriaItem_ValorDespues",
    "MTRD_AuditoriaItem_NivelAntes",
    "MTRD_AuditoriaItem_NivelDespues",
    "MTRD_AuditoriaItem_PartidaAntes",
    "MTRD_AuditoriaItem_PartidaDespues",
    "MTRD_AuditoriaItem_UsuarioNombre",
    "MTRD_AuditoriaItem_FechaEvento",
  ],
  snapshot: [
    "MTRD_Snapshot_ID",
    "MTRD_Snapshot_KEY_Proyecto",
    "MTRD_Snapshot_UID",
    "MTRD_Snapshot_Nombre",
    "MTRD_Snapshot_NumeroVersion",
    "MTRD_Snapshot_Tipo",
    "MTRD_Snapshot_KEY_SnapshotBase",
    "MTRD_Snapshot_UsuarioNombre",
    "MTRD_Snapshot_CreadoEn",
    "MTRD_Snapshot_RowCount",
    "MTRD_Snapshot_RootCount",
    "MTRD_Snapshot_LeafCount",
    "MTRD_Snapshot_GrandTotal",
    "MTRD_Snapshot_MetradoTradicionalTotal",
    "MTRD_Snapshot_MetradoBimTotal",
  ],
  snapshotItem: [
    "MTRD_SnapshotItem_ID",
    "MTRD_SnapshotItem_KEY_Snapshot",
    "MTRD_SnapshotItem_ItemUID",
    "MTRD_SnapshotItem_Orden",
    "MTRD_SnapshotItem_Nivel",
    "MTRD_SnapshotItem_Codificacion",
    "MTRD_SnapshotItem_Descripcion",
    "MTRD_SnapshotItem_Unidad",
    "MTRD_SnapshotItem_Costo",
    "MTRD_SnapshotItem_MetradoTradicional",
    "MTRD_SnapshotItem_MetradoBim",
    "MTRD_SnapshotItem_TipoMetrado",
  ],
  appMeta: [
    "MTRD_AppMeta_ID",
    "MTRD_AppMeta_Clave",
    "MTRD_AppMeta_Valor",
    "MTRD_AppMeta_ActualizadoEn",
  ],
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
  const tableNames = getTableNames_();
  ensureTableSheet_(spreadsheet, tableNames.proyecto, TABLE_HEADERS.proyecto);
  ensureTableSheet_(spreadsheet, tableNames.item, TABLE_HEADERS.item);
  ensureTableSheet_(spreadsheet, tableNames.itemColapsado, TABLE_HEADERS.itemColapsado);
  ensureTableSheet_(spreadsheet, tableNames.auditoriaItem, TABLE_HEADERS.auditoriaItem);
  ensureTableSheet_(spreadsheet, tableNames.snapshot, TABLE_HEADERS.snapshot);
  ensureTableSheet_(spreadsheet, tableNames.snapshotItem, TABLE_HEADERS.snapshotItem);
  ensureTableSheet_(spreadsheet, tableNames.appMeta, TABLE_HEADERS.appMeta);
}

function ensureTableSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    try {
      sheet = spreadsheet.insertSheet(sheetName);
    } catch (error) {
      const message = error && error.message ? String(error.message) : String(error);
      const alreadyExists = message.toLowerCase().indexOf("ya existe una hoja con el nombre") >= 0
        || message.toLowerCase().indexOf("already exists") >= 0;
      if (!alreadyExists) {
        throw error;
      }

      Utilities.sleep(150);
      sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        throw error;
      }
    }
  }

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasDifferentHeader = headers.some((header, index) => String(firstRow[index] || "") !== header);
  if (hasDifferentHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getSpreadsheetMeta_(spreadsheet) {
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    tabs: getTableNames_(),
  };
}

function getTableNames_() {
  return {
    proyecto: String(ITEMICOSTOS.tables.proyecto || "MTRD_Proyecto"),
    item: String(ITEMICOSTOS.tables.item || "MTRD_Item"),
    itemColapsado: String(ITEMICOSTOS.tables.itemColapsado || "MTRD_ItemColapsado"),
    auditoriaItem: String(ITEMICOSTOS.tables.auditoriaItem || "MTRD_AuditoriaItem"),
    snapshot: String(ITEMICOSTOS.tables.snapshot || "MTRD_Snapshot"),
    snapshotItem: String(ITEMICOSTOS.tables.snapshotItem || "MTRD_SnapshotItem"),
    appMeta: String(ITEMICOSTOS.tables.appMeta || "MTRD_AppMeta"),
  };
}

function loadState_(spreadsheet) {
  const fromTables = loadStateFromTables_(spreadsheet);
  if (fromTables.projects.length > 0) {
    return fromTables;
  }

  const legacyState = loadLegacyState_(spreadsheet);
  if (legacyState.projects.length > 0) {
    persistState_(spreadsheet, legacyState);
    return legacyState;
  }

  return fromTables;
}

function loadStateFromTables_(spreadsheet) {
  const tables = getTableNames_();

  const projectRows = readTableRecords_(spreadsheet, tables.proyecto)
    .filter((row) => parseIntSafe_(row.MTRD_Proyecto_Estado, 1) === 1)
    .sort((left, right) => compareText_(left.MTRD_Proyecto_CreadoEn, right.MTRD_Proyecto_CreadoEn)
      || compareText_(left.MTRD_Proyecto_Nombre, right.MTRD_Proyecto_Nombre));

  if (projectRows.length === 0) {
    return {
      currentProjectId: null,
      projects: [],
    };
  }

  const projectIdSet = new Set(projectRows.map((row) => String(row.MTRD_Proyecto_ID || "")));
  const itemRows = readTableRecords_(spreadsheet, tables.item)
    .filter((row) => projectIdSet.has(String(row.MTRD_Item_KEY_Proyecto || "")))
    .sort((left, right) => compareNumber_(left.MTRD_Item_KEY_Proyecto, right.MTRD_Item_KEY_Proyecto)
      || compareNumber_(left.MTRD_Item_Orden, right.MTRD_Item_Orden));

  const itemUidById = new Map();
  itemRows.forEach((row) => {
    itemUidById.set(String(row.MTRD_Item_ID || ""), String(row.MTRD_Item_UID || ""));
  });

  const collapsedRows = readTableRecords_(spreadsheet, tables.itemColapsado)
    .filter((row) => projectIdSet.has(String(row.MTRD_ItemColapsado_KEY_Proyecto || "")))
    .sort((left, right) => compareNumber_(left.MTRD_ItemColapsado_KEY_Proyecto, right.MTRD_ItemColapsado_KEY_Proyecto)
      || compareNumber_(left.MTRD_ItemColapsado_ID, right.MTRD_ItemColapsado_ID));

  const auditRows = readTableRecords_(spreadsheet, tables.auditoriaItem)
    .filter((row) => projectIdSet.has(String(row.MTRD_AuditoriaItem_KEY_Proyecto || "")))
    .sort((left, right) => compareNumber_(left.MTRD_AuditoriaItem_KEY_Proyecto, right.MTRD_AuditoriaItem_KEY_Proyecto)
      || compareText_(left.MTRD_AuditoriaItem_FechaEvento, right.MTRD_AuditoriaItem_FechaEvento)
      || compareNumber_(left.MTRD_AuditoriaItem_ID, right.MTRD_AuditoriaItem_ID));

  const snapshotRows = readTableRecords_(spreadsheet, tables.snapshot)
    .filter((row) => projectIdSet.has(String(row.MTRD_Snapshot_KEY_Proyecto || "")))
    .sort((left, right) => compareNumber_(left.MTRD_Snapshot_KEY_Proyecto, right.MTRD_Snapshot_KEY_Proyecto)
      || compareText_(left.MTRD_Snapshot_CreadoEn, right.MTRD_Snapshot_CreadoEn)
      || compareNumber_(left.MTRD_Snapshot_ID, right.MTRD_Snapshot_ID));

  const snapshotIdSet = new Set(snapshotRows.map((row) => String(row.MTRD_Snapshot_ID || "")));
  const snapshotItemRows = readTableRecords_(spreadsheet, tables.snapshotItem)
    .filter((row) => snapshotIdSet.has(String(row.MTRD_SnapshotItem_KEY_Snapshot || "")))
    .sort((left, right) => compareNumber_(left.MTRD_SnapshotItem_KEY_Snapshot, right.MTRD_SnapshotItem_KEY_Snapshot)
      || compareNumber_(left.MTRD_SnapshotItem_Orden, right.MTRD_SnapshotItem_Orden));

  const itemsByProject = groupRowsByKey_(itemRows, "MTRD_Item_KEY_Proyecto");
  const collapsedByProject = groupRowsByKey_(collapsedRows, "MTRD_ItemColapsado_KEY_Proyecto");
  const auditsByProject = groupRowsByKey_(auditRows, "MTRD_AuditoriaItem_KEY_Proyecto");
  const snapshotsByProject = groupRowsByKey_(snapshotRows, "MTRD_Snapshot_KEY_Proyecto");
  const snapshotItemsBySnapshot = groupRowsByKey_(snapshotItemRows, "MTRD_SnapshotItem_KEY_Snapshot");

  const projects = projectRows.map((projectRow) => {
    const projectId = String(projectRow.MTRD_Proyecto_ID || "");
    const projectItems = itemsByProject.get(projectId) || [];
    const projectCollapsed = collapsedByProject.get(projectId) || [];
    const projectAudits = auditsByProject.get(projectId) || [];
    const projectSnapshots = snapshotsByProject.get(projectId) || [];

    const snapshotUidById = new Map();
    projectSnapshots.forEach((snapshot) => {
      snapshotUidById.set(
        String(snapshot.MTRD_Snapshot_ID || ""),
        String(snapshot.MTRD_Snapshot_UID || ""),
      );
    });

    const snapshots = projectSnapshots.map((snapshot) => {
      const snapshotId = String(snapshot.MTRD_Snapshot_ID || "");
      const rows = (snapshotItemsBySnapshot.get(snapshotId) || []).map((entry) => ({
        id: String(entry.MTRD_SnapshotItem_ItemUID || ""),
        level: parseIntSafe_(entry.MTRD_SnapshotItem_Nivel, 0),
        codificacion: String(entry.MTRD_SnapshotItem_Codificacion || ""),
        descripcion: String(entry.MTRD_SnapshotItem_Descripcion || ""),
        unidad: String(entry.MTRD_SnapshotItem_Unidad || ""),
        costo: normalizeDecimalString_(entry.MTRD_SnapshotItem_Costo),
        metradoTradicional: normalizeDecimalString_(entry.MTRD_SnapshotItem_MetradoTradicional),
        metradoBim: normalizeDecimalString_(entry.MTRD_SnapshotItem_MetradoBim),
        tipoMetrado: String(entry.MTRD_SnapshotItem_TipoMetrado || ""),
      }));

      const baseKey = String(snapshot.MTRD_Snapshot_KEY_SnapshotBase || "");
      return {
        id: String(snapshot.MTRD_Snapshot_UID || ""),
        name: String(snapshot.MTRD_Snapshot_Nombre || "Foto"),
        rows,
        summary: {
          rowCount: parseIntSafe_(snapshot.MTRD_Snapshot_RowCount, 0),
          rootCount: parseIntSafe_(snapshot.MTRD_Snapshot_RootCount, 0),
          leafCount: parseIntSafe_(snapshot.MTRD_Snapshot_LeafCount, 0),
          grandTotal: parseNumberSafe_(snapshot.MTRD_Snapshot_GrandTotal, 0),
          metradoTradicionalTotal: parseNumberSafe_(snapshot.MTRD_Snapshot_MetradoTradicionalTotal, 0),
          metradoBimTotal: parseNumberSafe_(snapshot.MTRD_Snapshot_MetradoBimTotal, 0),
        },
        userName: String(snapshot.MTRD_Snapshot_UsuarioNombre || "Operador"),
        createdAt: toIsoString_(snapshot.MTRD_Snapshot_CreadoEn),
        versionNumber: parseIntSafe_(snapshot.MTRD_Snapshot_NumeroVersion, 1),
        snapshotType: String(snapshot.MTRD_Snapshot_Tipo || "manual"),
        baseSnapshotId: baseKey ? (snapshotUidById.get(baseKey) || null) : null,
      };
    });

    return {
      id: String(projectRow.MTRD_Proyecto_UID || ""),
      name: String(projectRow.MTRD_Proyecto_Nombre || "Proyecto"),
      rows: projectItems.map((entry) => ({
        id: String(entry.MTRD_Item_UID || ""),
        level: parseIntSafe_(entry.MTRD_Item_Nivel, 0),
        codificacion: String(entry.MTRD_Item_Codificacion || ""),
        descripcion: String(entry.MTRD_Item_Descripcion || ""),
        unidad: String(entry.MTRD_Item_Unidad || ""),
        costo: normalizeDecimalString_(entry.MTRD_Item_Costo),
        metradoTradicional: normalizeDecimalString_(entry.MTRD_Item_MetradoTradicional),
        metradoBim: normalizeDecimalString_(entry.MTRD_Item_MetradoBim),
        tipoMetrado: String(entry.MTRD_Item_TipoMetrado || ""),
      })),
      auditEntries: projectAudits.map((entry) => ({
        id: `audit-${String(entry.MTRD_AuditoriaItem_ID || "")}`,
        rowId: String(entry.MTRD_AuditoriaItem_ItemUID || ""),
        type: String(entry.MTRD_AuditoriaItem_Tipo || "field"),
        field: String(entry.MTRD_AuditoriaItem_Campo || ""),
        beforeValue: entry.MTRD_AuditoriaItem_ValorAntes != null ? entry.MTRD_AuditoriaItem_ValorAntes : "",
        afterValue: entry.MTRD_AuditoriaItem_ValorDespues != null ? entry.MTRD_AuditoriaItem_ValorDespues : "",
        beforeLevel: nullableInt_(entry.MTRD_AuditoriaItem_NivelAntes),
        afterLevel: nullableInt_(entry.MTRD_AuditoriaItem_NivelDespues),
        beforePartidaCode: entry.MTRD_AuditoriaItem_PartidaAntes != null ? String(entry.MTRD_AuditoriaItem_PartidaAntes) : "",
        afterPartidaCode: entry.MTRD_AuditoriaItem_PartidaDespues != null ? String(entry.MTRD_AuditoriaItem_PartidaDespues) : "",
        userName: String(entry.MTRD_AuditoriaItem_UsuarioNombre || "Operador"),
        timestamp: toIsoString_(entry.MTRD_AuditoriaItem_FechaEvento),
      })),
      snapshots,
      collapsedIds: projectCollapsed
        .map((entry) => itemUidById.get(String(entry.MTRD_ItemColapsado_KEY_Item || "")) || "")
        .filter(Boolean),
      createdAt: toIsoString_(projectRow.MTRD_Proyecto_CreadoEn),
      updatedAt: toIsoString_(projectRow.MTRD_Proyecto_ActualizadoEn),
    };
  });

  const metaRows = readTableRecords_(spreadsheet, tables.appMeta);
  const currentProjectMeta = metaRows.find((row) => String(row.MTRD_AppMeta_Clave || "") === "currentProjectId");
  const storedCurrentProjectId = currentProjectMeta ? String(currentProjectMeta.MTRD_AppMeta_Valor || "") : "";

  const currentProjectId = projects.some((project) => project.id === storedCurrentProjectId)
    ? storedCurrentProjectId
    : (projects[0] ? projects[0].id : null);

  return {
    currentProjectId,
    projects,
  };
}

function persistState_(spreadsheet, inputState) {
  const state = normalizeState_(inputState);
  const nowIso = new Date().toISOString();
  const tables = getTableNames_();

  const proyectoRecords = [];
  const itemRecords = [];
  const itemColapsadoRecords = [];
  const auditoriaRecords = [];
  const snapshotRecords = [];
  const snapshotItemRecords = [];
  const appMetaRecords = [];

  const counters = {
    projectId: 1,
    itemId: 1,
    collapsedId: 1,
    auditId: 1,
    snapshotId: 1,
    snapshotItemId: 1,
    metaId: 1,
  };

  state.projects.forEach((project, projectIndex) => {
    const projectUid = normalizeIdentifier_(project.id, `project-${projectIndex + 1}`);
    const createdAt = toIsoString_(project.createdAt || nowIso);
    const updatedAt = toIsoString_(project.updatedAt || createdAt);
    const projectId = counters.projectId;
    counters.projectId += 1;

    proyectoRecords.push({
      MTRD_Proyecto_ID: projectId,
      MTRD_Proyecto_UID: projectUid,
      MTRD_Proyecto_Nombre: normalizeText_(project.name, `Proyecto ${projectIndex + 1}`),
      MTRD_Proyecto_CreadoEn: createdAt,
      MTRD_Proyecto_ActualizadoEn: updatedAt,
      MTRD_Proyecto_Estado: 1,
    });

    const rows = Array.isArray(project.rows) ? project.rows : [];
    const itemIdByUid = new Map();

    rows.forEach((row, rowIndex) => {
      const rowUid = normalizeIdentifier_(row.id, `row-${projectIndex + 1}-${rowIndex + 1}`);
      const itemId = counters.itemId;
      counters.itemId += 1;

      itemIdByUid.set(rowUid, itemId);
      itemRecords.push({
        MTRD_Item_ID: itemId,
        MTRD_Item_KEY_Proyecto: projectId,
        MTRD_Item_UID: rowUid,
        MTRD_Item_Orden: rowIndex + 1,
        MTRD_Item_Nivel: parseIntSafe_(row.level, 0),
        MTRD_Item_Codificacion: String(row.codificacion || ""),
        MTRD_Item_Descripcion: String(row.descripcion || ""),
        MTRD_Item_Unidad: String(row.unidad || ""),
        MTRD_Item_Costo: parseDecimal_(row.costo),
        MTRD_Item_MetradoTradicional: parseDecimal_(row.metradoTradicional != null ? row.metradoTradicional : row.metrado),
        MTRD_Item_MetradoBim: parseDecimal_(row.metradoBim),
        MTRD_Item_TipoMetrado: String(row.tipoMetrado || ""),
        MTRD_Item_CreadoEn: createdAt,
        MTRD_Item_ActualizadoEn: updatedAt,
      });
    });

    const collapsedIds = Array.isArray(project.collapsedIds) ? project.collapsedIds : [];
    collapsedIds.forEach((itemUid) => {
      const resolvedItemId = itemIdByUid.get(String(itemUid || "").trim());
      if (!resolvedItemId) {
        return;
      }

      itemColapsadoRecords.push({
        MTRD_ItemColapsado_ID: counters.collapsedId,
        MTRD_ItemColapsado_KEY_Proyecto: projectId,
        MTRD_ItemColapsado_KEY_Item: resolvedItemId,
        MTRD_ItemColapsado_CreadoEn: nowIso,
      });
      counters.collapsedId += 1;
    });

    const auditEntries = Array.isArray(project.auditEntries) ? project.auditEntries : [];
    auditEntries.forEach((audit) => {
      const itemUid = normalizeIdentifier_(audit.rowId, "");
      const itemKey = itemUid ? (itemIdByUid.get(itemUid) || "") : "";

      auditoriaRecords.push({
        MTRD_AuditoriaItem_ID: counters.auditId,
        MTRD_AuditoriaItem_KEY_Proyecto: projectId,
        MTRD_AuditoriaItem_KEY_Item: itemKey || "",
        MTRD_AuditoriaItem_ItemUID: itemUid,
        MTRD_AuditoriaItem_Tipo: String(audit.type || "field"),
        MTRD_AuditoriaItem_Campo: String(audit.field || ""),
        MTRD_AuditoriaItem_ValorAntes: audit.beforeValue != null ? audit.beforeValue : "",
        MTRD_AuditoriaItem_ValorDespues: audit.afterValue != null ? audit.afterValue : "",
        MTRD_AuditoriaItem_NivelAntes: audit.beforeLevel != null ? parseIntSafe_(audit.beforeLevel, 0) : "",
        MTRD_AuditoriaItem_NivelDespues: audit.afterLevel != null ? parseIntSafe_(audit.afterLevel, 0) : "",
        MTRD_AuditoriaItem_PartidaAntes: audit.beforePartidaCode != null ? String(audit.beforePartidaCode) : "",
        MTRD_AuditoriaItem_PartidaDespues: audit.afterPartidaCode != null ? String(audit.afterPartidaCode) : "",
        MTRD_AuditoriaItem_UsuarioNombre: String(audit.userName || "Operador"),
        MTRD_AuditoriaItem_FechaEvento: toIsoString_(audit.timestamp || nowIso),
      });
      counters.auditId += 1;
    });

    const snapshots = Array.isArray(project.snapshots) ? project.snapshots : [];
    const snapshotIdByUid = new Map();
    const pendingBaseLinks = [];

    snapshots.forEach((snapshot, snapshotIndex) => {
      const snapshotUid = normalizeIdentifier_(snapshot.id, `snapshot-${projectIndex + 1}-${snapshotIndex + 1}`);
      const snapshotId = counters.snapshotId;
      counters.snapshotId += 1;

      const snapshotRows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
      const summary = snapshot.summary && typeof snapshot.summary === "object"
        ? snapshot.summary
        : buildSnapshotSummary_(snapshotRows);

      snapshotRecords.push({
        MTRD_Snapshot_ID: snapshotId,
        MTRD_Snapshot_KEY_Proyecto: projectId,
        MTRD_Snapshot_UID: snapshotUid,
        MTRD_Snapshot_Nombre: String(snapshot.name || `Foto ${snapshotIndex + 1}`),
        MTRD_Snapshot_NumeroVersion: parseIntSafe_(snapshot.versionNumber || (snapshotIndex + 1), snapshotIndex + 1),
        MTRD_Snapshot_Tipo: String(snapshot.snapshotType || "manual"),
        MTRD_Snapshot_KEY_SnapshotBase: "",
        MTRD_Snapshot_UsuarioNombre: String(snapshot.userName || "Operador"),
        MTRD_Snapshot_CreadoEn: toIsoString_(snapshot.createdAt || nowIso),
        MTRD_Snapshot_RowCount: parseIntSafe_(summary.rowCount, 0),
        MTRD_Snapshot_RootCount: parseIntSafe_(summary.rootCount, 0),
        MTRD_Snapshot_LeafCount: parseIntSafe_(summary.leafCount, 0),
        MTRD_Snapshot_GrandTotal: parseNumberSafe_(summary.grandTotal, 0),
        MTRD_Snapshot_MetradoTradicionalTotal: parseNumberSafe_(summary.metradoTradicionalTotal, 0),
        MTRD_Snapshot_MetradoBimTotal: parseNumberSafe_(summary.metradoBimTotal, 0),
      });
      snapshotIdByUid.set(snapshotUid, snapshotId);

      const baseSnapshotUid = typeof snapshot.baseSnapshotId === "string"
        ? snapshot.baseSnapshotId.trim()
        : "";
      if (baseSnapshotUid) {
        pendingBaseLinks.push({
          snapshotId,
          baseSnapshotUid,
        });
      }

      snapshotRows.forEach((row, snapshotRowIndex) => {
        snapshotItemRecords.push({
          MTRD_SnapshotItem_ID: counters.snapshotItemId,
          MTRD_SnapshotItem_KEY_Snapshot: snapshotId,
          MTRD_SnapshotItem_ItemUID: normalizeIdentifier_(row.id, `snapshot-row-${snapshotRowIndex + 1}`),
          MTRD_SnapshotItem_Orden: snapshotRowIndex + 1,
          MTRD_SnapshotItem_Nivel: parseIntSafe_(row.level, 0),
          MTRD_SnapshotItem_Codificacion: String(row.codificacion || ""),
          MTRD_SnapshotItem_Descripcion: String(row.descripcion || ""),
          MTRD_SnapshotItem_Unidad: String(row.unidad || ""),
          MTRD_SnapshotItem_Costo: parseDecimal_(row.costo),
          MTRD_SnapshotItem_MetradoTradicional: parseDecimal_(row.metradoTradicional != null ? row.metradoTradicional : row.metrado),
          MTRD_SnapshotItem_MetradoBim: parseDecimal_(row.metradoBim),
          MTRD_SnapshotItem_TipoMetrado: String(row.tipoMetrado || ""),
        });
        counters.snapshotItemId += 1;
      });
    });

    pendingBaseLinks.forEach((pending) => {
      const baseId = snapshotIdByUid.get(pending.baseSnapshotUid);
      if (!baseId) {
        return;
      }

      const target = snapshotRecords.find((record) => record.MTRD_Snapshot_ID === pending.snapshotId);
      if (target) {
        target.MTRD_Snapshot_KEY_SnapshotBase = baseId;
      }
    });
  });

  if (state.currentProjectId) {
    appMetaRecords.push({
      MTRD_AppMeta_ID: counters.metaId,
      MTRD_AppMeta_Clave: "currentProjectId",
      MTRD_AppMeta_Valor: String(state.currentProjectId),
      MTRD_AppMeta_ActualizadoEn: nowIso,
    });
  }

  writeTableRecords_(spreadsheet, tables.proyecto, TABLE_HEADERS.proyecto, proyectoRecords);
  writeTableRecords_(spreadsheet, tables.item, TABLE_HEADERS.item, itemRecords);
  writeTableRecords_(spreadsheet, tables.itemColapsado, TABLE_HEADERS.itemColapsado, itemColapsadoRecords);
  writeTableRecords_(spreadsheet, tables.auditoriaItem, TABLE_HEADERS.auditoriaItem, auditoriaRecords);
  writeTableRecords_(spreadsheet, tables.snapshot, TABLE_HEADERS.snapshot, snapshotRecords);
  writeTableRecords_(spreadsheet, tables.snapshotItem, TABLE_HEADERS.snapshotItem, snapshotItemRecords);
  writeTableRecords_(spreadsheet, tables.appMeta, TABLE_HEADERS.appMeta, appMetaRecords);

  return nowIso;
}

function readTableRecords_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return [];
  }

  const range = sheet.getDataRange();
  if (!range || range.getNumRows() < 2) {
    return [];
  }

  const values = range.getValues();
  const headers = values[0].map((header) => String(header || "").trim());
  const rows = values.slice(1);

  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    });
}

function writeTableRecords_(spreadsheet, sheetName, headers, records) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const rows = [headers];
  records.forEach((record) => {
    rows.push(headers.map((header) => (record[header] !== undefined ? record[header] : "")));
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
}

function groupRowsByKey_(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => {
    const rowKey = String(row[key] || "");
    if (!grouped.has(rowKey)) {
      grouped.set(rowKey, []);
    }
    grouped.get(rowKey).push(row);
  });
  return grouped;
}

function loadLegacyState_(spreadsheet) {
  const legacyStateTab = String(ITEMICOSTOS.legacyTabs.state || "itemicostos_state");
  const legacySheet = spreadsheet.getSheetByName(legacyStateTab);
  if (!legacySheet) {
    return {
      currentProjectId: null,
      projects: [],
    };
  }

  const values = legacySheet.getDataRange().getValues();
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

function normalizeState_(inputState) {
  const state = inputState && typeof inputState === "object" ? inputState : {};
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const normalizedProjects = projects.map((project, index) => normalizeProject_(project, index));

  const requestedCurrentId = String(state.currentProjectId || "").trim();
  const currentProjectId = normalizedProjects.some((project) => project.id === requestedCurrentId)
    ? requestedCurrentId
    : (normalizedProjects[0] ? normalizedProjects[0].id : null);

  return {
    currentProjectId,
    projects: normalizedProjects,
  };
}

function normalizeProject_(project, index) {
  const source = project && typeof project === "object" ? project : {};
  const createdAt = toIsoString_(source.createdAt || new Date().toISOString());
  const updatedAt = toIsoString_(source.updatedAt || createdAt);

  return {
    id: normalizeIdentifier_(source.id, `project-${index + 1}`),
    name: normalizeText_(source.name, `Proyecto ${index + 1}`),
    rows: Array.isArray(source.rows) ? source.rows : [],
    auditEntries: Array.isArray(source.auditEntries) ? source.auditEntries : [],
    snapshots: Array.isArray(source.snapshots) ? source.snapshots : [],
    collapsedIds: Array.isArray(source.collapsedIds) ? source.collapsedIds : [],
    createdAt,
    updatedAt,
  };
}

function normalizeIdentifier_(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText_(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function compareText_(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareNumber_(left, right) {
  const a = parseNumberSafe_(left, 0);
  const b = parseNumberSafe_(right, 0);
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function parseIntSafe_(value, fallback) {
  const parsed = Number.parseInt(String(value != null ? value : ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumberSafe_(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableInt_(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDecimalString_(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return String(value);
}

function toIsoString_(value) {
  const candidate = new Date(value || Date.now());
  return Number.isNaN(candidate.getTime())
    ? new Date().toISOString()
    : candidate.toISOString();
}

function parseDecimal_(value) {
  return parseNumberSafe_(value, 0);
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

function buildSnapshotSummary_(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const rootCount = safeRows.filter((row) => Number(row.level || 0) === 0).length;
  const leafCount = safeRows.filter((row, index) => !rowHasChildren_(safeRows, index)).length;

  let metradoTradicionalTotal = 0;
  let metradoBimTotal = 0;
  safeRows.forEach((row, index) => {
    if (!rowHasChildren_(safeRows, index)) {
      metradoTradicionalTotal += parseDecimal_(row.metradoTradicional != null ? row.metradoTradicional : row.metrado);
      metradoBimTotal += parseDecimal_(row.metradoBim);
    }
  });

  return {
    rowCount: safeRows.length,
    rootCount,
    leafCount,
    grandTotal: computeGrandTotal_(safeRows),
    metradoTradicionalTotal,
    metradoBimTotal,
  };
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

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
