import type { AuditFilterKey, ViewKey } from "../../domain/models";

export const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark"
} as const;

export const REMOTE_SAVE_DEBOUNCE_MS = 500;
export const DEFAULT_OPERATOR_NAME = "Usuario local";
export const TREE_INDENT_STEP = 16;

export const METRADO_TYPE_OPTIONS = ["Tradicional", "Revit"];
export const DEFAULT_METRADO_RULE = "Encofrado";
export const METRADO_RULE_OPTIONS = [DEFAULT_METRADO_RULE];
export const UNIDAD_PARTIDA_OPTIONS = [
  "und",
  "m",
  "ml",
  "m2",
  "m3",
  "cm",
  "km",
  "kg",
  "g",
  "tn",
  "l",
  "ha",
  "h",
  "dia",
  "mes",
  "pza",
  "jgo",
  "glb",
  "lote",
  "paquete"
];

export const AUDIT_FILTER_CONFIGS: Record<AuditFilterKey, { label: string }> = {
  all: { label: "Todos" },
  today: { label: "Hoy" },
  structure: { label: "Estructura" },
  cost: { label: "Costo/Metrados" }
};

export const USER_ROLE_OPTIONS = ["viewer", "editor", "admin", "superadmin"];
export const USER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USER_PROJECT_VIEW_OPTIONS: Array<{ key: ViewKey; label: string }> = [
  { key: "itemizado", label: "Itemizado" },
  { key: "presupuesto", label: "Presupuesto" },
  { key: "control-bim", label: "Control BIM" },
  { key: "auditoria", label: "Auditoria" },
  { key: "exportaciones-rvt", label: "RVT" },
  { key: "exportacion-presupuesto", label: "Presupuesto XLS" }
];

export const USER_PROJECT_VIEW_KEYS = USER_PROJECT_VIEW_OPTIONS.map((option) => option.key);
export const DEFAULT_USER_PROJECT_VIEW_KEYS = [...USER_PROJECT_VIEW_KEYS];

export interface ExportColumnSchema {
  key: string;
  header: string;
  width: number;
  type: "text" | "number";
}

export const EXPORT_COLUMN_SCHEMAS: Record<"rvt" | "presupuesto", ExportColumnSchema[]> = {
  rvt: [
    { key: "codificacion", header: "CODIFICACION", width: 22, type: "text" },
    { key: "codigoPartida", header: "CODIGO DE PARTIDA", width: 18, type: "text" },
    { key: "descripcion", header: "DESCRIPCION DE PARTIDA", width: 46, type: "text" },
    { key: "unidad", header: "UNIDAD DE PARTIDA", width: 20, type: "text" },
    { key: "costo", header: "COSTO", width: 14, type: "number" },
    { key: "reglaMetrado", header: "REGLA DE METRADO", width: 22, type: "text" },
    { key: "grupoTablas", header: "GRUPO TABLAS", width: 28, type: "text" }
  ],
  presupuesto: [
    { key: "codificacion", header: "CODIFICACION", width: 22, type: "text" },
    { key: "codigoPartida", header: "CODIGO DE PARTIDA", width: 18, type: "text" },
    { key: "descripcion", header: "DESCRIPCION DE PARTIDA", width: 46, type: "text" },
    { key: "unidad", header: "UNIDAD DE PARTIDA", width: 20, type: "text" },
    { key: "costo", header: "COSTO", width: 14, type: "number" },
    { key: "metradoTradicional", header: "METRADO TRADICIONAL", width: 22, type: "number" },
    { key: "metradoBim", header: "METRADO BIM", width: 16, type: "number" },
    { key: "parcial", header: "PARCIAL", width: 16, type: "number" },
    { key: "tipoMetrado", header: "TIPO DE METRADO", width: 20, type: "text" },
    { key: "reglaMetrado", header: "REGLA DE METRADO", width: 22, type: "text" },
    { key: "grupoTablas", header: "GRUPO TABLAS", width: 28, type: "text" }
  ]
};

export const EXPORT_MODE_CONFIGS = {
  rvt: {
    key: "rvt",
    actionLabel: "Exportar RVT",
    emptyAlert: "No hay filas con Tipo de metrado = Revit en esta raiz.",
    fileFallbackName: "exportacion-rvt",
    columns: EXPORT_COLUMN_SCHEMAS.rvt
  },
  presupuesto: {
    key: "presupuesto",
    actionLabel: "Exportar Presupuesto",
    emptyAlert: "No hay filas para exportar en esta raiz.",
    fileFallbackName: "exportacion-presupuesto",
    columns: EXPORT_COLUMN_SCHEMAS.presupuesto
  }
} as const;

export interface ViewColumn {
  key: string;
  label: string;
  colClass: string;
  widthVar: string;
  type: "partida" | "input" | "select" | "partial";
  field?: string;
  editable?: boolean;
  placeholder?: string;
  inputMode?: "decimal";
  inputClass?: string;
  options?: string[];
}

export interface ViewConfig {
  key: ViewKey;
  label: string;
  matrixTitle: string;
  contentType: "table" | "audit" | "users" | "bim-control" | "export";
  searchEnabled: boolean;
  helperText: string;
  shortcutText: string;
  allowsStructureEditing: boolean;
  exportMode?: "rvt" | "presupuesto";
  columns: ViewColumn[];
}

export const VIEW_CONFIGS: Record<ViewKey, ViewConfig> = {
  itemizado: {
    key: "itemizado",
    label: "Itemizado",
    matrixTitle: "Matriz de partidas",
    contentType: "table",
    searchEnabled: true,
    helperText: "Usa la franja superior para crear, mover e indentar la estructura del itemizado.",
    shortcutText: "Selecciona una fila y usa la franja superior para crear, ordenar o indentar sin quitar foco a la matriz.",
    allowsStructureEditing: true,
    columns: [
      { key: "partida", label: "Codigo de partida", colClass: "col-partida", widthVar: "--partida-col-width", type: "partida" },
      { key: "codificacion", label: "Codificacion", colClass: "col-codificacion", widthVar: "--codificacion-col-width", type: "input", field: "codificacion", editable: true, placeholder: "Ej. ESTRUCT-001" },
      { key: "descripcion", label: "Descripcion de Partida", colClass: "col-descripcion", widthVar: "--descripcion-col-width", type: "input", field: "descripcion", editable: true, inputClass: "cell-field--descripcion", placeholder: "Describe la partida o subpartida" },
      { key: "tipoMetrado", label: "Tipo de metrado", colClass: "col-tipo-metrado", widthVar: "--tipo-metrado-col-width", type: "select", field: "tipoMetrado", editable: true, placeholder: "Selecciona", options: METRADO_TYPE_OPTIONS },
      { key: "reglaMetrado", label: "Regla de metrado", colClass: "col-regla-metrado", widthVar: "--regla-metrado-col-width", type: "select", field: "reglaMetrado", editable: true, placeholder: "Selecciona", options: METRADO_RULE_OPTIONS },
      { key: "unidad", label: "Unidad de Partida", colClass: "col-unidad", widthVar: "--unidad-col-width", type: "select", field: "unidad", editable: true, placeholder: "Selecciona", options: UNIDAD_PARTIDA_OPTIONS },
      { key: "costo", label: "Costo", colClass: "col-costo", widthVar: "--costo-col-width", type: "input", field: "costo", editable: true, placeholder: "0.00", inputMode: "decimal" }
    ]
  },
  presupuesto: {
    key: "presupuesto",
    label: "Presupuesto",
    matrixTitle: "Presupuesto",
    contentType: "table",
    searchEnabled: true,
    helperText: "Aqui editas el presupuesto y revisas metrados y parciales directamente sobre la matriz.",
    shortcutText: "Usa el buscador superior para ubicar partidas y revisar rapidamente los importes del presupuesto.",
    allowsStructureEditing: false,
    columns: [
      { key: "partida", label: "Codigo de partida", colClass: "col-partida", widthVar: "--partida-col-width", type: "partida" },
      { key: "codificacion", label: "Codificacion", colClass: "col-codificacion", widthVar: "--codificacion-col-width", type: "input", field: "codificacion", editable: false },
      { key: "descripcion", label: "Descripcion de Partida", colClass: "col-descripcion", widthVar: "--descripcion-col-width", type: "input", field: "descripcion", editable: false, inputClass: "cell-field--descripcion" },
      { key: "unidad", label: "Unidad de Partida", colClass: "col-unidad", widthVar: "--unidad-col-width", type: "select", field: "unidad", editable: false, options: UNIDAD_PARTIDA_OPTIONS },
      { key: "costo", label: "Costo", colClass: "col-costo", widthVar: "--costo-col-width", type: "input", field: "costo", editable: false, inputMode: "decimal" },
      { key: "metradoTradicional", label: "Metrado Tradicional", colClass: "col-metrado-tradicional", widthVar: "--metrado-tradicional-col-width", type: "input", field: "metradoTradicional", editable: true, placeholder: "0.00", inputMode: "decimal" },
      { key: "metradoBim", label: "Metrado BIM", colClass: "col-metrado-bim", widthVar: "--metrado-bim-col-width", type: "input", field: "metradoBim", editable: false, inputMode: "decimal" },
      { key: "reglaMetrado", label: "Regla de metrado", colClass: "col-regla-metrado", widthVar: "--regla-metrado-col-width", type: "select", field: "reglaMetrado", editable: true, placeholder: "Selecciona", options: METRADO_RULE_OPTIONS },
      { key: "parcial", label: "Parcial", colClass: "col-parcial", widthVar: "--parcial-col-width", type: "partial" }
    ]
  },
  "control-bim": {
    key: "control-bim",
    label: "Control BIM",
    matrixTitle: "Control BIM",
    contentType: "bim-control",
    searchEnabled: false,
    helperText: "Revisa partidas listas para Revit, codificaciones, metrados BIM recibidos y el ultimo lote importado desde el add-in.",
    shortcutText: "Usa esta vista antes y despues de exportar desde Revit para detectar partidas incompletas, duplicadas o sin metrado BIM.",
    allowsStructureEditing: false,
    columns: []
  },
  auditoria: {
    key: "auditoria",
    label: "Auditoria",
    matrixTitle: "Auditoria",
    contentType: "audit",
    searchEnabled: true,
    helperText: "Selecciona una fila para revisar su historial de cambios, responsable y fecha.",
    shortcutText: "Esta vista es solo de lectura y muestra el seguimiento completo de cada fila.",
    allowsStructureEditing: false,
    columns: [
      { key: "partida", label: "Codigo de partida", colClass: "col-partida", widthVar: "--partida-col-width", type: "partida" },
      { key: "codificacion", label: "Codificacion", colClass: "col-codificacion", widthVar: "--codificacion-col-width", type: "input", field: "codificacion", editable: false },
      { key: "descripcion", label: "Descripcion de Partida", colClass: "col-descripcion", widthVar: "--descripcion-col-width", type: "input", field: "descripcion", editable: false, inputClass: "cell-field--descripcion" },
      { key: "unidad", label: "Unidad de Partida", colClass: "col-unidad", widthVar: "--unidad-col-width", type: "select", field: "unidad", editable: false, options: UNIDAD_PARTIDA_OPTIONS },
      { key: "costo", label: "Costo", colClass: "col-costo", widthVar: "--costo-col-width", type: "input", field: "costo", editable: false, inputMode: "decimal" },
      { key: "metradoTradicional", label: "Metrado Tradicional", colClass: "col-metrado-tradicional", widthVar: "--metrado-tradicional-col-width", type: "input", field: "metradoTradicional", editable: false, inputMode: "decimal" },
      { key: "metradoBim", label: "Metrado BIM", colClass: "col-metrado-bim", widthVar: "--metrado-bim-col-width", type: "input", field: "metradoBim", editable: false, inputMode: "decimal" },
      { key: "reglaMetrado", label: "Regla de metrado", colClass: "col-regla-metrado", widthVar: "--regla-metrado-col-width", type: "select", field: "reglaMetrado", editable: false, options: METRADO_RULE_OPTIONS },
      { key: "parcial", label: "Parcial", colClass: "col-parcial", widthVar: "--parcial-col-width", type: "partial" }
    ]
  },
  usuarios: {
    key: "usuarios",
    label: "Usuarios",
    matrixTitle: "Proyectos y usuarios",
    contentType: "users",
    searchEnabled: false,
    helperText: "Selecciona un proyecto para revisar sus miembros y administrar accesos.",
    shortcutText: "Flujo de acceso: Proyectos -> Usuarios. Los cambios se guardan en MySQL.",
    allowsStructureEditing: false,
    columns: []
  },
  "exportaciones-rvt": {
    key: "exportaciones-rvt",
    label: "Exportaciones para RVT",
    matrixTitle: "Exportaciones para RVT",
    contentType: "export",
    searchEnabled: false,
    helperText: "Cada boton exporta solo filas con Tipo de metrado = Revit a un archivo Excel externo de revision o intercambio.",
    shortcutText: "El add-in ya no usa este Excel como entrada principal; importa directo desde el proyecto activo.",
    allowsStructureEditing: false,
    exportMode: "rvt",
    columns: []
  },
  "exportacion-presupuesto": {
    key: "exportacion-presupuesto",
    label: "Exportacion Presupuesto",
    matrixTitle: "Exportacion Presupuesto",
    contentType: "export",
    searchEnabled: false,
    helperText: "Cada boton exporta la rama completa con costo, metrados, parcial, tipo de metrado y Grupo Tablas.",
    shortcutText: "Usa un boton por cada raiz para generar el archivo de presupuesto listo para revision o intercambio.",
    allowsStructureEditing: false,
    exportMode: "presupuesto",
    columns: []
  }
};

export const ROUTE_BY_VIEW: Record<ViewKey, string> = {
  itemizado: "/itemizado",
  presupuesto: "/presupuesto",
  "control-bim": "/control-bim",
  auditoria: "/auditoria",
  usuarios: "/usuarios",
  "exportaciones-rvt": "/exportaciones-rvt",
  "exportacion-presupuesto": "/exportacion-presupuesto"
};

export const VIEW_BY_ROUTE = Object.fromEntries(
  Object.entries(ROUTE_BY_VIEW).map(([view, route]) => [route, view])
) as Record<string, ViewKey>;
