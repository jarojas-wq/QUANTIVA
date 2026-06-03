import { describe, expect, it } from "vitest";
import { ROUTE_BY_VIEW, VIEW_BY_ROUTE, VIEW_CONFIGS } from "./budget-config";

describe("React workspace route mapping", () => {
  it("keeps every configured view addressable by route", () => {
    Object.values(VIEW_CONFIGS).forEach((view) => {
      expect(ROUTE_BY_VIEW[view.key]).toBeTruthy();
      expect(VIEW_BY_ROUTE[ROUTE_BY_VIEW[view.key]]).toBe(view.key);
    });
  });

  it("maps the main budget paths to React views", () => {
    expect(VIEW_BY_ROUTE["/itemizado"]).toBe("itemizado");
    expect(VIEW_BY_ROUTE["/presupuesto"]).toBe("presupuesto");
    expect(VIEW_BY_ROUTE["/control-bim"]).toBe("control-bim");
    expect(VIEW_BY_ROUTE["/auditoria"]).toBe("auditoria");
    expect(VIEW_BY_ROUTE["/usuarios"]).toBe("usuarios");
  });
});
