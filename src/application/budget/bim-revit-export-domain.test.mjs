import { describe, expect, it } from "vitest";
import {
  normalizeIncomingRevitExport,
  normalizeIncomingRevitExportRow,
} from "./bim-revit-export-domain.mjs";

describe("BIM Revit export domain", () => {
  it("normalizes the active Revit metrado export contract", () => {
    const exportPayload = normalizeIncomingRevitExport({
      projectId: " project-1 ",
      exportUid: " export-1 ",
      model: {
        documentUid: "doc-1",
        modelGuid: "model-1",
        modelPath: " C:/Modelos/obra.rvt ",
        revitVersion: "2025",
        addinVersion: "1.2.3",
        exportedBy: "operador@empresa.com",
        exportedAt: "2026-06-23T10:00:00.000-05:00",
      },
      rows: [
        {
          itemUid: "row-1",
          elementId: "101",
          elementUniqueId: "unique-101",
          category: " Structural Framing ",
          family: " Viga  25x50 ",
          type: " Tipo A ",
          codificacion: "02.01.01",
          description: " CONCRETO  PREMEZCLADO ",
          unit: "m3",
          quantity: "1,25",
          parameters: { CODIFICACION01: "02.01.01" },
        },
      ],
      options: {
        syncItemMetradoBim: false,
      },
    });

    expect(exportPayload).toMatchObject({
      projectId: "project-1",
      exportUid: "export-1",
      documentUid: "doc-1",
      modelGuid: "model-1",
      modelPath: "C:/Modelos/obra.rvt",
      revitVersion: "2025",
      addinVersion: "1.2.3",
      exportedBy: "operador@empresa.com",
      exportedAt: "2026-06-23T15:00:00.000Z",
      options: { syncItemMetradoBim: false },
    });
    expect(exportPayload.rows).toEqual([
      {
        itemUid: "row-1",
        elementId: 101,
        elementUniqueId: "unique-101",
        categoria: "Structural Framing",
        familia: "Viga 25x50",
        tipo: "Tipo A",
        codigoPartida: "02.01.01",
        descripcion: "CONCRETO PREMEZCLADO",
        unidad: "m3",
        cantidad: 1.25,
        parametrosJson: { CODIFICACION01: "02.01.01" },
      },
    ]);
  });

  it("keeps legacy add-in aliases for /api/revit/export", () => {
    const exportPayload = normalizeIncomingRevitExport({
      projectUid: "project-legacy",
      uid: "export-legacy",
      documentUid: "doc-legacy",
      modelGuid: "model-legacy",
      modelPath: "central.rvt",
      revitVersion: "2024",
      addinVersion: "legacy",
      userName: "Revit Addin",
      exportedAt: "not-a-date",
      items: [
        {
          rowId: "row-legacy",
          revitElementId: "202",
          revitUniqueId: "unique-202",
          categoria: "Muros",
          familia: "Muro",
          tipo: "Generico",
          partida: "03.02",
          descripcion: "HABILITACI\uFFFdN",
          unidad: "m2",
          metradoBim: "2.50",
          parametros: { source: "legacy" },
        },
      ],
    });

    expect(exportPayload.projectId).toBe("project-legacy");
    expect(exportPayload.exportUid).toBe("export-legacy");
    expect(exportPayload.documentUid).toBe("doc-legacy");
    expect(exportPayload.options.syncItemMetradoBim).toBe(true);
    expect(exportPayload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(exportPayload.rows[0]).toMatchObject({
      itemUid: "row-legacy",
      elementId: 202,
      elementUniqueId: "unique-202",
      codigoPartida: "03.02",
      descripcion: "HABILITACI\u00D3N",
      cantidad: 2.5,
      parametrosJson: { source: "legacy" },
    });
  });

  it("normalizes invalid row shapes without throwing", () => {
    expect(normalizeIncomingRevitExportRow(null)).toMatchObject({
      itemUid: "",
      elementId: null,
      cantidad: 0,
      parametrosJson: null,
    });
    expect(normalizeIncomingRevitExport({ rows: ["bad"] }).rows[0]).toMatchObject({
      itemUid: "",
      cantidad: 0,
    });
  });
});
