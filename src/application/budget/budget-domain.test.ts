import { describe, expect, it } from "vitest";
import {
  applyApuTotalToRow,
  buildPolynomialBreakdown,
  applyResourceToApuItem,
  canRowUseApu,
  cloneRows,
  createBudgetSettings,
  createBudgetSnapshot,
  createPolynomialGroup,
  createResourceCatalogItem,
  createUnitCatalogItem,
  createRow,
  formatApuItemCantidad,
  formatUnitCatalogLabel,
  getApuItemCantidad,
  getApuItemPartial,
  getApuTotal,
  getApuSubpartidaCycleIds,
  getBudgetTotals,
  getMetradoTotal,
  getUnitCatalogCodes,
  normalizeMetradoItems,
  normalizeApuItems,
  normalizeResourceCatalogItems,
  normalizeUnitCatalogItems
} from "./budget-domain";

describe("budget APU domain", () => {
  it("normalizes APU items with safe defaults", () => {
    const [item] = normalizeApuItems([{
      id: "apu-1",
      category: "categoria-invalida",
      descripcion: "  Cemento Portland  ",
      cuadrilla: "1,25",
      unidad: "kg",
      cantidad: "2,5",
      precioUnitario: "10"
    }]);

    expect(item.category).toBe("mano-obra");
    expect(item.descripcion).toBe("Cemento Portland");
    expect(item.cuadrilla).toBe("1,25");
    expect(item.unidad).toBe("kg");
    expect(item.cantidad).toBe("2,5");
    expect(item.precioUnitario).toBe("10");
  });

  it("calculates APU item partials and totals", () => {
    const items = normalizeApuItems([
      { category: "materiales", descripcion: "Cemento", cantidad: "2", precioUnitario: "10.5" },
      { category: "equipos", descripcion: "Mezcladora", cantidad: "3", precioUnitario: "4" }
    ]);

    expect(getApuItemPartial(items[0])).toBe(21);
    expect(getApuTotal(items)).toBe(33);
  });

  it("calculates labor and equipment quantities from crew and performance", () => {
    const row = createRow({
      rendimientoManoObra: "25",
      rendimientoEquipos: "40",
      apuItems: normalizeApuItems([
        { category: "mano-obra", descripcion: "Operario", cuadrilla: "2", precioUnitario: "10" },
        { category: "equipos", descripcion: "Mezcladora", cuadrilla: "1", precioUnitario: "100" },
        { category: "materiales", descripcion: "Cemento", cantidad: "3", precioUnitario: "20" }
      ])
    });

    expect(getApuItemCantidad(row.apuItems[0], row)).toBeCloseTo(0.64);
    expect(formatApuItemCantidad(row.apuItems[0], row)).toBe("0.640000");
    expect(getApuItemPartial(row.apuItems[0], row)).toBeCloseTo(6.4);
    expect(getApuItemPartial(row.apuItems[1], row)).toBeCloseTo(20);
    expect(getApuTotal(row.apuItems, row)).toBeCloseTo(86.4);
    expect(row.costo).toBe("86.400000");
  });

  it("updates row cost from APU total when items exist", () => {
    const row = createRow({
      costo: "999",
      rendimientoManoObra: "12,50",
      rendimientoEquipos: "8",
      apuItems: normalizeApuItems([
        { category: "materiales", descripcion: "Arena", cantidad: "4", precioUnitario: "2.5" }
      ])
    });

    expect(applyApuTotalToRow(row).costo).toBe("10.000000");
    expect(row.rendimientoManoObra).toBe("12,50");
    expect(row.rendimientoEquipos).toBe("8");
  });

  it("keeps APU restricted to leaf rows", () => {
    const rows = [
      createRow({ id: "parent", level: 0 }),
      createRow({ id: "child", level: 1 })
    ];

    expect(canRowUseApu(rows, 0)).toBe(false);
    expect(canRowUseApu(rows, 1)).toBe(true);
  });

  it("normalizes resource catalog items by category and order", () => {
    const items = normalizeResourceCatalogItems([
      { id: "r2", category: "equipos", descripcion: "  Mezcladora  ", unidad: "h", precioUnitario: "35", orden: 2 },
      { id: "r1", category: "materiales", descripcion: "Cemento", unidad: "bol", precioUnitario: "28.5", orden: 1 }
    ]);

    expect(items.map((item) => item.id)).toEqual(["r1", "r2"]);
    expect(items[0].descripcion).toBe("Cemento");
    expect(items[0].precioUnitario).toBe("28.5");
  });

  it("copies catalog resource data into an APU item", () => {
    const resource = createResourceCatalogItem({
      id: "resource-1",
      category: "materiales",
      descripcion: "Acero corrugado",
      unidad: "kg",
      precioUnitario: "4.2"
    });
    const item = applyResourceToApuItem({
      id: "apu-1",
      category: "mano-obra",
      descripcion: "Manual",
      cuadrilla: "2",
      cantidad: "3",
      precioUnitario: "1"
    }, resource);

    expect(item.resourceId).toBe("resource-1");
    expect(item.category).toBe("materiales");
    expect(item.descripcion).toBe("Acero corrugado");
    expect(item.cuadrilla).toBe("2");
    expect(item.unidad).toBe("kg");
    expect(item.precioUnitario).toBe("4.2");
    expect(getApuTotal([item])).toBeCloseTo(12.6);
  });

  it("preserves manual APU entries without a resource link", () => {
    const [item] = normalizeApuItems([{
      id: "apu-manual",
      category: "otros",
      descripcion: "Flete especial",
      unidad: "glb",
      cantidad: "1",
      precioUnitario: "120"
    }]);

    expect(item.resourceId).toBe("");
    expect(item.descripcion).toBe("Flete especial");
    expect(getApuTotal([item])).toBe(120);
  });

  it("formats default unit labels with their meaning", () => {
    const units = normalizeUnitCatalogItems([]);

    expect(formatUnitCatalogLabel("h", units)).toBe("h (Horas)");
    expect(getUnitCatalogCodes(units)).toContain("h");
  });

  it("normalizes custom units only when they have code and meaning", () => {
    const units = normalizeUnitCatalogItems([
      createUnitCatalogItem({ codigo: "hh", descripcion: "Horas hombre", orden: 40 }),
      createUnitCatalogItem({ codigo: "bad", descripcion: "", orden: 41 })
    ]);

    expect(formatUnitCatalogLabel("hh", units)).toBe("hh (Horas hombre)");
    expect(getUnitCatalogCodes(units)).toContain("hh");
    expect(getUnitCatalogCodes(units)).not.toContain("bad");
  });

  it("calculates metrado detail lines and feeds traditional quantity", () => {
    const row = createRow({
      metradoItems: normalizeMetradoItems([
        { descripcion: "Muro A", veces: "2", largo: "3", ancho: "0.20", alto: "2.5" },
        { descripcion: "Muro B", veces: "1", largo: "4", ancho: "0.25", alto: "3" }
      ])
    });

    expect(getMetradoTotal(row.metradoItems)).toBeCloseTo(6);
    expect(row.metradoTradicional).toBe("6.000000");
    expect(row.metradoItems[0].parcial).toBe("3.000000");
  });

  it("calculates budget footer with and without IGV", () => {
    const rows = [
      createRow({ level: 0, costo: "10", metradoTradicional: "10" })
    ];
    const totals = getBudgetTotals(rows, createBudgetSettings({
      gastosGeneralesPercent: "10",
      utilidadPercent: "5",
      igvPercent: "18",
      includeIgv: true
    }));

    expect(totals.costoDirecto).toBe(100);
    expect(totals.gastosGenerales).toBe(10);
    expect(totals.utilidad).toBe(5);
    expect(totals.igv).toBeCloseTo(20.7);
    expect(getBudgetTotals(rows, { includeIgv: false }).igv).toBe(0);
  });

  it("uses subpartida cost inside an APU and detects direct cycles", () => {
    const subpartida = createRow({
      id: "sub",
      descripcion: "Subpartida concreto",
      costo: "20",
      metradoTradicional: "1"
    });
    const parent = createRow({
      id: "parent",
      apuItems: normalizeApuItems([
        { category: "otros", subpartidaId: "sub", descripcion: "Subpartida", cantidad: "2" }
      ])
    });
    const normalized = cloneRows([subpartida, parent]);

    expect(normalized.length).toBe(2);
    expect(normalized[1].apuItems[0].precioUnitario).toBe("20.000000");
    expect(normalized[1].costo).toBe("40.000000");

    const cyclic = cloneRows([
      createRow({ id: "a", apuItems: normalizeApuItems([{ category: "otros", subpartidaId: "b", cantidad: "1" }]) }),
      createRow({ id: "b", apuItems: normalizeApuItems([{ category: "otros", subpartidaId: "a", cantidad: "1" }]) })
    ]);
    expect(getApuSubpartidaCycleIds(cyclic).sort()).toEqual(["a", "b"]);
  });

  it("calculates polynomial incidences from grouped resources", () => {
    const group = createPolynomialGroup({ id: "grp-cem", codigo: "J", descripcion: "Cemento", indice: "Cemento", categoria: "materiales" });
    const resource = createResourceCatalogItem({
      id: "res-cem",
      category: "materiales",
      descripcion: "Cemento",
      unidad: "bol",
      precioUnitario: "10",
      polynomialGroupId: "grp-cem"
    });
    const rows = [
      createRow({
        costo: "10",
        metradoTradicional: "3",
        apuItems: normalizeApuItems([
          { category: "materiales", resourceId: "res-cem", descripcion: "Cemento", cantidad: "1", precioUnitario: "10" }
        ])
      })
    ];
    const breakdown = buildPolynomialBreakdown(rows, [group], [resource]);

    expect(breakdown[0].groupId).toBe("grp-cem");
    expect(breakdown[0].costo).toBe(30);
    expect(breakdown[0].incidenciaPercent).toBe(100);
  });

  it("creates typed budget snapshots for venta, meta and linea base", () => {
    const rows = [
      createRow({ id: "row-1", codificacion: "1.1", descripcion: "Partida", metradoTradicional: "2", costo: "10" })
    ];

    expect(createBudgetSnapshot(rows, [], "Venta", "Usuario", "venta").snapshotType).toBe("venta");
    expect(createBudgetSnapshot(rows, [], "Meta", "Usuario", "meta").snapshotType).toBe("meta");
    expect(createBudgetSnapshot(rows, [], "Linea base", "Usuario", "linea-base").snapshotType).toBe("linea-base");
    expect(createBudgetSnapshot(rows, [], "Manual", "Usuario", "manual").rows[0].costo).toBe("10");
  });
});
