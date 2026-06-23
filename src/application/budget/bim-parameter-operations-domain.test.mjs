import { describe, expect, it } from "vitest";
import {
  createBimParameterWritePlan,
  createRevitCostLevelParameterNames,
} from "./bim-parameter-operations-domain.mjs";

describe("BIM parameter operations domain", () => {
  it("creates Revit parameter-write operations from the latest export and budget rows", () => {
    const plan = createBimParameterWritePlan({
      batchSize: 2,
      budgetRows: [
        {
          itemUid: "item-1",
          level: 2,
          codificacion: "CIM-001",
          codigoPartida: "2.1.3",
          descripcion: "Concreto premezclado f'c 140",
          unidad: "m3",
          costo: "150.000000",
        },
      ],
      revitRows: [
        {
          itemUid: "item-1",
          elementId: 101,
          elementUniqueId: "uid-101",
          codigoPartida: "CIM-001",
          parametrosJson: JSON.stringify({ level: "03" }),
        },
      ],
    });

    expect(plan.summary).toMatchObject({
      source: "latest-revit-export",
      budgetRows: 1,
      revitRows: 1,
      matchedRevitRows: 1,
      operationType: "parameter-write",
      operationCount: 4,
      batchSize: 2,
      plannedBatches: 2,
      fieldCounts: {
        codigoPartida: 1,
        descripcion: 1,
        unidad: 1,
        costo: 1,
      },
    });
    expect(plan.operations).toEqual([
      {
        operationType: "parameter-write",
        elementId: 101,
        elementUniqueId: "uid-101",
        parameterName: "02_14_CODIGOPARTIDA03",
        value: "2.1.3",
      },
      {
        operationType: "parameter-write",
        elementId: 101,
        elementUniqueId: "uid-101",
        parameterName: "02_15_DESCRIPCIONPARTIDA03",
        value: "Concreto premezclado f'c 140",
      },
      {
        operationType: "parameter-write",
        elementId: 101,
        elementUniqueId: "uid-101",
        parameterName: "02_16_UNIDADPARTIDA03",
        value: "m3",
      },
      {
        operationType: "parameter-write",
        elementId: 101,
        elementUniqueId: "uid-101",
        parameterName: "02_18_COSTOPARTIDA03",
        value: "150.000000",
      },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("skips ambiguous codification matches unless the export row carries an item UID", () => {
    const plan = createBimParameterWritePlan({
      budgetRows: [
        {
          itemUid: "item-a",
          level: 1,
          codificacion: "DUP-01",
          codigoPartida: "1.1",
          descripcion: "A",
          unidad: "m2",
          costo: "10",
        },
        {
          itemUid: "item-b",
          level: 1,
          codificacion: "DUP-01",
          codigoPartida: "1.2",
          descripcion: "B",
          unidad: "m2",
          costo: "20",
        },
      ],
      revitRows: [
        {
          elementId: 201,
          codigoPartida: "DUP-01",
          parametrosJson: { level: "02" },
        },
        {
          itemUid: "item-b",
          elementId: 202,
          codigoPartida: "DUP-01",
          parametrosJson: { level: "02" },
        },
      ],
    });

    expect(plan.summary.operationCount).toBe(4);
    expect(plan.summary.skipped.duplicateBudgetCodification).toBe(1);
    expect(plan.summary.duplicateBudgetCodifications).toEqual(["DUP-01"]);
    expect(plan.operations[0]).toMatchObject({
      elementId: 202,
      parameterName: "02_08_CODIGOPARTIDA02",
      value: "1.2",
    });
  });

  it("falls back to the budget row level when the Revit export has no level metadata", () => {
    const plan = createBimParameterWritePlan({
      budgetRows: [
        {
          itemUid: "item-3",
          level: 0,
          codificacion: "ROOT",
          codigoPartida: "1",
          descripcion: "Raiz",
          unidad: "glb",
          costo: "0",
        },
      ],
      revitRows: [
        {
          elementUniqueId: "uid-root",
          codigoPartida: "ROOT",
        },
      ],
    });

    expect(createRevitCostLevelParameterNames(1)?.partidaCode).toBe("02_02_CODIGOPARTIDA01");
    expect(plan.summary.operationCount).toBe(4);
    expect(plan.operations.map((operation) => operation.parameterName)).toContain("02_02_CODIGOPARTIDA01");
  });
});
