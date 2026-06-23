const MAX_REVIT_COST_LEVEL = 11;
const DEFAULT_BATCH_SIZE = 250;

export function createBimParameterWritePlan(input = {}) {
  const budgetRows = normalizeBudgetRows(input.budgetRows);
  const revitRows = normalizeRevitRows(input.revitRows);
  const batchSize = clampInteger(input.batchSize, 1, 5000, DEFAULT_BATCH_SIZE);
  const budgetIndex = createBudgetIndex(budgetRows);
  const operations = [];
  const operationKeys = new Set();
  const fieldCounts = {
    codigoPartida: 0,
    descripcion: 0,
    unidad: 0,
    costo: 0,
  };
  const skipped = {
    missingElement: 0,
    unmatchedBudget: 0,
    duplicateBudgetCodification: 0,
    missingLevel: 0,
    emptyValue: 0,
  };

  for (const revitRow of revitRows) {
    if (!revitRow.elementId && !revitRow.elementUniqueId) {
      skipped.missingElement += 1;
      continue;
    }

    const match = resolveBudgetRowForRevitRow(revitRow, budgetIndex);
    if (match.status === "duplicate-codification") {
      skipped.duplicateBudgetCodification += 1;
      continue;
    }
    if (!match.row) {
      skipped.unmatchedBudget += 1;
      continue;
    }

    const levelNumber = resolveRevitCostLevelNumber(revitRow, match.row);
    const parameterNames = createRevitCostLevelParameterNames(levelNumber);
    if (!parameterNames) {
      skipped.missingLevel += 1;
      continue;
    }

    const writeFields = [
      {
        field: "codigoPartida",
        parameterName: parameterNames.partidaCode,
        value: match.row.codigoPartida,
      },
      {
        field: "descripcion",
        parameterName: parameterNames.description,
        value: match.row.descripcion,
      },
      {
        field: "unidad",
        parameterName: parameterNames.unit,
        value: match.row.unidad,
      },
      {
        field: "costo",
        parameterName: parameterNames.cost,
        value: normalizeDecimalText(match.row.costo),
      },
    ];

    for (const writeField of writeFields) {
      const value = normalizeText(writeField.value, "");
      if (!value) {
        skipped.emptyValue += 1;
        continue;
      }

      const operation = {
        operationType: "parameter-write",
        elementId: revitRow.elementId,
        elementUniqueId: revitRow.elementUniqueId,
        parameterName: writeField.parameterName,
        value,
      };
      const operationKey = buildOperationKey(operation);
      if (operationKeys.has(operationKey)) {
        continue;
      }

      operationKeys.add(operationKey);
      operations.push(operation);
      fieldCounts[writeField.field] += 1;
    }
  }

  const summary = {
    source: "latest-revit-export",
    budgetRows: budgetRows.length,
    revitRows: revitRows.length,
    matchedRevitRows: countMatchedRevitRows(revitRows, budgetIndex),
    operationType: "parameter-write",
    operationCount: operations.length,
    batchSize,
    plannedBatches: operations.length > 0 ? Math.ceil(operations.length / batchSize) : 0,
    fieldCounts,
    skipped,
    duplicateBudgetCodifications: budgetIndex.duplicateCodificationKeys,
  };

  return {
    operations,
    summary,
    warnings: buildWarnings(summary),
  };
}

export function createRevitCostLevelParameterNames(levelNumberInput) {
  const levelNumber = clampInteger(levelNumberInput, 1, MAX_REVIT_COST_LEVEL, 0);
  if (!levelNumber) {
    return null;
  }

  const prefixIndex = ((levelNumber - 1) * 6) + 1;
  const levelCode = String(levelNumber).padStart(2, "0");
  return {
    codification: `02_${String(prefixIndex).padStart(2, "0")}_CODIFICACION${levelCode}`,
    partidaCode: `02_${String(prefixIndex + 1).padStart(2, "0")}_CODIGOPARTIDA${levelCode}`,
    description: `02_${String(prefixIndex + 2).padStart(2, "0")}_DESCRIPCIONPARTIDA${levelCode}`,
    unit: `02_${String(prefixIndex + 3).padStart(2, "0")}_UNIDADPARTIDA${levelCode}`,
    metrado: `02_${String(prefixIndex + 4).padStart(2, "0")}_METRADO${levelCode}`,
    cost: `02_${String(prefixIndex + 5).padStart(2, "0")}_COSTOPARTIDA${levelCode}`,
  };
}

function normalizeBudgetRows(input) {
  return Array.isArray(input)
    ? input.map(normalizeBudgetRow).filter((row) => row.itemUid || row.codificacion)
    : [];
}

function normalizeBudgetRow(input) {
  const source = normalizeObject(input);
  return {
    itemUid: normalizeText(source.itemUid || source.item_uid || source.id || source.uid, ""),
    level: clampInteger(source.level ?? source.item_level, 0, MAX_REVIT_COST_LEVEL - 1, 0),
    codificacion: normalizeText(source.codificacion ?? source.item_codificacion, ""),
    codigoPartida: normalizeText(source.codigoPartida ?? source.partidaCode ?? source.item_codigo_partida, ""),
    descripcion: normalizeText(source.descripcion ?? source.description ?? source.item_descripcion, ""),
    unidad: normalizeText(source.unidad ?? source.unit ?? source.item_unidad, ""),
    costo: normalizeText(source.costo ?? source.cost ?? source.item_costo, ""),
  };
}

function normalizeRevitRows(input) {
  return Array.isArray(input)
    ? input.map(normalizeRevitRow)
    : [];
}

function normalizeRevitRow(input) {
  const source = normalizeObject(input);
  const parameters = parseJsonObject(source.parametrosJson ?? source.parameters ?? source.parametros);
  return {
    itemUid: normalizeText(source.itemUid || source.item_uid || source.rowId || source.itemId, ""),
    elementId: clampInteger(source.elementId ?? source.element_id ?? source.revitElementId, 0, Number.MAX_SAFE_INTEGER, 0),
    elementUniqueId: normalizeText(source.elementUniqueId || source.element_unique_id || source.revitUniqueId || source.uniqueId, ""),
    codigoPartida: normalizeText(source.codigoPartida ?? source.codigo_partida ?? source.codificacion ?? source.partida, ""),
    level: source.level ?? source.levelCode ?? parameters.level,
    parameters,
  };
}

function createBudgetIndex(rows) {
  const byItemUid = new Map();
  const codificationBuckets = new Map();

  for (const row of rows) {
    if (row.itemUid && !byItemUid.has(row.itemUid)) {
      byItemUid.set(row.itemUid, row);
    }

    const codificationKey = normalizeCodificationKey(row.codificacion);
    if (!codificationKey) {
      continue;
    }

    const bucket = codificationBuckets.get(codificationKey) || [];
    bucket.push(row);
    codificationBuckets.set(codificationKey, bucket);
  }

  const byCodification = new Map();
  const duplicateCodificationKeys = [];
  for (const [key, bucket] of codificationBuckets.entries()) {
    if (bucket.length === 1) {
      byCodification.set(key, bucket[0]);
    } else {
      duplicateCodificationKeys.push(key);
    }
  }

  return {
    byItemUid,
    byCodification,
    duplicateCodificationKeys,
    duplicateCodificationSet: new Set(duplicateCodificationKeys),
  };
}

function resolveBudgetRowForRevitRow(revitRow, budgetIndex) {
  if (revitRow.itemUid && budgetIndex.byItemUid.has(revitRow.itemUid)) {
    return { row: budgetIndex.byItemUid.get(revitRow.itemUid), status: "matched-item" };
  }

  const codificationKey = normalizeCodificationKey(revitRow.codigoPartida);
  if (!codificationKey) {
    return { row: null, status: "missing-codification" };
  }
  if (budgetIndex.duplicateCodificationSet.has(codificationKey)) {
    return { row: null, status: "duplicate-codification" };
  }

  return {
    row: budgetIndex.byCodification.get(codificationKey) || null,
    status: budgetIndex.byCodification.has(codificationKey) ? "matched-codification" : "unmatched",
  };
}

function resolveRevitCostLevelNumber(revitRow, budgetRow) {
  const explicitLevel = clampInteger(revitRow.level, 1, MAX_REVIT_COST_LEVEL, 0);
  if (explicitLevel) {
    return explicitLevel;
  }

  return clampInteger((budgetRow.level || 0) + 1, 1, MAX_REVIT_COST_LEVEL, 0);
}

function countMatchedRevitRows(revitRows, budgetIndex) {
  return revitRows.reduce((count, revitRow) => (
    resolveBudgetRowForRevitRow(revitRow, budgetIndex).row ? count + 1 : count
  ), 0);
}

function buildWarnings(summary) {
  const warnings = [];
  if (summary.operationCount === 0) {
    warnings.push("No se generaron operaciones parameter-write para Revit activo.");
  }
  if (summary.skipped.unmatchedBudget > 0) {
    warnings.push(`${summary.skipped.unmatchedBudget} fila(s) Revit no tienen partida de presupuesto vinculada.`);
  }
  if (summary.skipped.duplicateBudgetCodification > 0) {
    warnings.push(`${summary.skipped.duplicateBudgetCodification} fila(s) Revit se omitieron por CODIFICACION duplicada en presupuesto.`);
  }
  if (summary.skipped.missingLevel > 0) {
    warnings.push(`${summary.skipped.missingLevel} fila(s) Revit no tienen nivel de parametro valido.`);
  }
  return warnings;
}

function buildOperationKey(operation) {
  return [
    operation.elementUniqueId || operation.elementId,
    operation.parameterName,
  ].join("|");
}

function normalizeCodificationKey(value) {
  return normalizeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeDecimalText(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  const text = normalizeText(value, "");
  if (!text) {
    return "";
  }

  const withoutSpaces = text.replace(/\s+/g, "");
  if (withoutSpaces.includes(",") && !withoutSpaces.includes(".")) {
    return withoutSpaces.replace(",", ".");
  }
  return withoutSpaces;
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}
