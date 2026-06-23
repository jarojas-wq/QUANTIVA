import { describe, expect, it } from "vitest";
import type { ExportColumnSchema } from "./budget-config";
import { buildXlsxWorkbookFromSheets } from "./excel-export";

const columns: ExportColumnSchema[] = [
  { key: "codigo", header: "Codigo", width: 12, type: "text" },
  { key: "total", header: "Total", width: 12, type: "number" }
];

describe("Excel budget reports", () => {
  it("builds a multi-sheet XLSX workbook for S10-style exports", async () => {
    const workbook = buildXlsxWorkbookFromSheets([
      {
        name: "Presupuesto",
        title: "Presupuesto general",
        rows: [{ codigo: "1.1", total: 25 }],
        columns
      },
      {
        name: "APU",
        title: "Analisis de costos unitarios",
        rows: [{ codigo: "2.1", total: 40 }],
        columns
      },
      {
        name: "Hoja de metrados",
        title: "Hoja de metrados",
        rows: [{ codigo: "3.1", total: 60 }],
        columns
      }
    ]);

    const payload = new TextDecoder().decode(await workbook.arrayBuffer());

    expect(workbook.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(payload).toContain("xl/worksheets/sheet3.xml");
    expect(payload).toContain("Presupuesto");
    expect(payload).toContain("APU");
    expect(payload).toContain("Hoja de metrados");
    expect(payload).toContain("<v>60</v>");
  });
});
