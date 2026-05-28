import { describe, expect, it } from "vitest";
import { getLegacyViewForPath, LEGACY_ROUTE_BY_VIEW } from "./legacy-routes";

describe("legacy route mapping", () => {
  it("maps public React routes to the preserved MTR2 views", () => {
    expect(getLegacyViewForPath("/itemizado")).toBe("itemizado");
    expect(getLegacyViewForPath("/presupuesto")).toBe("presupuesto");
    expect(getLegacyViewForPath("/control-bim")).toBe("control-bim");
    expect(getLegacyViewForPath("/auditoria")).toBe("auditoria");
    expect(getLegacyViewForPath("/usuarios")).toBe("usuarios");
    expect(getLegacyViewForPath("/exportaciones-rvt")).toBe("exportaciones-rvt");
    expect(getLegacyViewForPath("/exportacion-presupuesto")).toBe("exportacion-presupuesto");
  });

  it("falls back to itemizado for unknown paths", () => {
    expect(getLegacyViewForPath("/")).toBe("itemizado");
    expect(getLegacyViewForPath("/no-existe")).toBe("itemizado");
  });

  it("keeps reverse mapping available for legacy navigation clicks", () => {
    expect(LEGACY_ROUTE_BY_VIEW["control-bim"]).toBe("/control-bim");
    expect(LEGACY_ROUTE_BY_VIEW.presupuesto).toBe("/presupuesto");
  });
});
