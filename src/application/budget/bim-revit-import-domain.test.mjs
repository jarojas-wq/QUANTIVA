import { describe, expect, it } from "vitest";
import {
  REVIT_IMPORT_ROW_FIELDS,
  buildRevitImportStateFromProject,
  buildRevitImportStateFromState,
  normalizeRevitImportRows,
} from "./bim-revit-import-domain.mjs";

describe("BIM Revit import domain", () => {
  it("builds the compact legacy import-state contract for the selected project", () => {
    const compact = buildRevitImportStateFromState(
      {
        currentProjectId: "project-a",
        projects: [
          {
            id: "project-a",
            name: "Proyecto A",
            rows: [{ id: "ignored", level: 0, codificacion: "A", descripcion: "Ignorado" }],
          },
          {
            id: "project-b",
            name: " Proyecto  B ",
            rows: [
              {
                id: "row-root",
                level: 0,
                codificacion: "02",
                descripcion: " CONCRETO  ARMADO ",
                unidad: "m3",
                costo: 125.5,
                metradoBim: "10",
                tipoMetrado: "Revit",
                reglaMetrado: "Encofrado",
                rendimientoManoObra: "8",
                rendimientoEquipos: "12",
                apuItems: [{ id: "extra" }],
                metradoItems: [{ id: "metrado-extra" }],
                budgetSettings: { overheadPercent: 10 },
              },
              {
                itemUid: "row-child",
                level: 1,
                codigo: "02.01",
                description: "CIMIENTO",
                unit: "m2",
                cost: "30.00",
                metrado: "3.5",
              },
            ],
          },
        ],
      },
      new URLSearchParams("projectUid=project-b"),
    );

    expect(compact).toMatchObject({
      currentProjectId: "project-b",
      projectId: "project-b",
      projectName: "Proyecto B",
      project: {
        id: "project-b",
        name: "Proyecto B",
      },
    });
    expect(compact.rows).toHaveLength(2);
    for (const field of REVIT_IMPORT_ROW_FIELDS) {
      expect(compact.rows[0]).toHaveProperty(field);
    }
    expect(compact.rows[0]).toMatchObject({
      id: "row-root",
      itemUid: "row-root",
      level: 0,
      codigoPartida: "1",
      codificacion: "02",
      descripcion: "CONCRETO ARMADO",
      unidad: "m3",
      costo: "125.5",
      metradoBim: "10",
      tipoMetrado: "Revit",
      reglaMetrado: "Encofrado",
      rendimientoManoObra: "8",
      rendimientoEquipos: "12",
    });
    expect(Object.keys(compact.rows[0]).sort()).toEqual([...REVIT_IMPORT_ROW_FIELDS].sort());
    expect(compact.rows[0]).not.toHaveProperty("apuItems");
    expect(compact.rows[0]).not.toHaveProperty("metradoItems");
    expect(compact.rows[0]).not.toHaveProperty("budgetSettings");
    expect(compact.rows[1]).toMatchObject({
      id: "row-child",
      itemUid: "row-child",
      level: 1,
      codigoPartida: "1.1",
      codificacion: "02.01",
      descripcion: "CIMIENTO",
      unidad: "m2",
      costo: "30.00",
      metradoBim: "3.5",
    });
  });

  it("supports MySQL-like project aliases and keeps the rows mirrored at project level", () => {
    const compact = buildRevitImportStateFromProject({
      project_uid: "project-mysql",
      project_name: "MySQL",
      rows: [
        { id: "root", level: 0, codificacion: "01" },
        { id: "child-a", level: 1, codificacion: "01.01" },
        { id: "child-b", level: 1, codificacion: "01.02" },
      ],
    });

    expect(compact.projectId).toBe("project-mysql");
    expect(compact.rows.map((row) => row.codigoPartida)).toEqual(["1", "1.1", "1.2"]);
    expect(compact.project?.rows).toBe(compact.rows);
  });

  it("returns an empty import-state when no project is available", () => {
    expect(buildRevitImportStateFromState({ projects: [] })).toEqual({
      currentProjectId: null,
      projectId: null,
      projectName: "",
      project: null,
      rows: [],
    });
    expect(normalizeRevitImportRows(null)).toEqual([]);
  });
});
