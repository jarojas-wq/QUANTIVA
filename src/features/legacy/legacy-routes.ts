export const LEGACY_VIEW_ROUTES: Record<string, string> = {
  "/itemizado": "itemizado",
  "/presupuesto": "presupuesto",
  "/control-bim": "control-bim",
  "/auditoria": "auditoria",
  "/usuarios": "usuarios",
  "/exportaciones-rvt": "exportaciones-rvt",
  "/exportacion-presupuesto": "exportacion-presupuesto"
};

export const LEGACY_ROUTE_BY_VIEW = Object.fromEntries(
  Object.entries(LEGACY_VIEW_ROUTES).map(([route, view]) => [view, route])
) as Record<string, string>;

export function getLegacyViewForPath(pathname: string) {
  return LEGACY_VIEW_ROUTES[pathname] || "itemizado";
}
