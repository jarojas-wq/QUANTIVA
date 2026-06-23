import { randomUUID } from "node:crypto";

export function normalizeIncomingRevitExport(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
  const model = source.model && typeof source.model === "object" && !Array.isArray(source.model)
    ? source.model
    : {};
  const options = source.options && typeof source.options === "object" && !Array.isArray(source.options)
    ? source.options
    : {};
  const rawRows = Array.isArray(source.rows)
    ? source.rows
    : (Array.isArray(source.items) ? source.items : []);

  return {
    projectId: normalizeIdentifier(source.projectId || source.projectUid, ""),
    exportUid: normalizeIdentifier(source.exportUid || source.uid, randomUUID()),
    documentUid: normalizeIdentifier(model.documentUid || source.documentUid, ""),
    modelGuid: normalizeIdentifier(model.modelGuid || source.modelGuid, ""),
    modelPath: normalizeText(model.modelPath || source.modelPath, ""),
    revitVersion: normalizeText(model.revitVersion || source.revitVersion, ""),
    addinVersion: normalizeText(model.addinVersion || source.addinVersion, ""),
    exportedBy: normalizeText(source.exportedBy || model.exportedBy || source.userName, "Revit Addin"),
    exportedAt: normalizeIsoString(source.exportedAt || model.exportedAt || Date.now()),
    rows: rawRows.map(normalizeIncomingRevitExportRow),
    options: {
      syncItemMetradoBim: options.syncItemMetradoBim !== false,
    },
  };
}

export function normalizeIncomingRevitExportRow(row) {
  const source = row && typeof row === "object" && !Array.isArray(row)
    ? row
    : {};
  return {
    itemUid: normalizeIdentifier(source.itemUid || source.rowId || source.itemId, ""),
    elementId: normalizeNullableInteger(source.elementId ?? source.revitElementId),
    elementUniqueId: normalizeIdentifier(
      source.elementUniqueId || source.revitUniqueId || source.uniqueId,
      "",
    ),
    categoria: normalizeText(source.categoria || source.category, ""),
    familia: normalizeText(source.familia || source.family, ""),
    tipo: normalizeText(source.tipo || source.type, ""),
    codigoPartida: normalizeText(source.codigoPartida || source.codificacion || source.partida, ""),
    descripcion: normalizeDescriptionText(source.descripcion || source.description),
    unidad: normalizeText(source.unidad || source.unit, ""),
    cantidad: parseDecimal(source.cantidad ?? source.quantity ?? source.metradoBim ?? source.metrado ?? 0),
    parametrosJson: normalizeJsonObject(source.parametros ?? source.parameters),
  };
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeDescriptionText(value, fallback = "") {
  const text = repairKnownEncodingArtifacts(String(value || "").trim().replace(/\s+/g, " "));
  return text || fallback;
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

function normalizeIsoString(value) {
  const candidate = new Date(value || Date.now());
  return Number.isNaN(candidate.getTime())
    ? new Date().toISOString()
    : candidate.toISOString();
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
