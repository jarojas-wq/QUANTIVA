import fs from "node:fs";
import path from "node:path";

export function resolveRevitBridgeSettingsPath(env = process.env) {
  const explicitPath = String(env.BIM_REVIT_SETTINGS_PATH || "").trim();
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const appData = String(env.APPDATA || "").trim();
  if (!appData) {
    return "";
  }
  return path.join(appData, "RevitModelAudit", "itemicostos-metrado-export.settings.json");
}

export function loadRevitBridgeSettings(settingsPath) {
  if (!settingsPath) {
    return {
      checked: true,
      exists: false,
      path: "",
      readError: "APPDATA no esta disponible para resolver la configuracion Revit.",
    };
  }
  if (!fs.existsSync(settingsPath)) {
    return {
      checked: true,
      exists: false,
      path: settingsPath,
    };
  }
  try {
    return {
      checked: true,
      exists: true,
      path: settingsPath,
      settings: JSON.parse(fs.readFileSync(settingsPath, "utf8").replace(/^\uFEFF/, "")),
    };
  } catch (error) {
    return {
      checked: true,
      exists: true,
      path: settingsPath,
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function loadLocalRevitBridgeSettings(env = process.env) {
  return loadRevitBridgeSettings(resolveRevitBridgeSettingsPath(env));
}
