export function normalizeBimRevitLocalSession(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const processes = normalizeProcesses(source.processes);
  const manifestPath = normalizeText(source.manifestPath);
  const manifestAssemblyPath = normalizeText(source.manifestAssemblyPath);
  const sourceLastWriteTime = normalizeText(source.sourceLastWriteTime);
  const assemblyIsOlderThanSource = isOlderTimestamp(source.manifestAssemblyLastWriteTime, sourceLastWriteTime);
  const loadedAddinModules = processes.flatMap((process) => process.loadedModules);
  const loadedBridgeAddin = loadedAddinModules.length > 0;
  const loadedAssemblyMatchesManifest = Boolean(
    manifestAssemblyPath
      && loadedAddinModules.some((module) => samePath(module.fileName, manifestAssemblyPath)),
  );
  const missing = resolveMissingCodes({
    revitOpen: processes.length > 0,
    manifestPath,
    manifestExists: source.manifestExists === true,
    manifestAssemblyPath,
    manifestAssemblyExists: source.manifestAssemblyExists === true,
    assemblyIsOlderThanSource,
    loadedBridgeAddin,
    loadedAssemblyMatchesManifest,
  });
  const status = resolveStatus(missing, processes.length > 0, loadedBridgeAddin, loadedAssemblyMatchesManifest);

  return {
    ok: missing.length === 0,
    status,
    version: normalizeText(source.version),
    processCount: processes.length,
    revitOpen: processes.length > 0,
    manifestPath,
    manifestExists: source.manifestExists === true,
    manifestAssemblyPath,
    manifestAssemblyExists: source.manifestAssemblyExists === true,
    manifestAssemblyLastWriteTime: normalizeText(source.manifestAssemblyLastWriteTime),
    sourceRoot: normalizeText(source.sourceRoot),
    sourceLastWriteTime,
    assemblyIsOlderThanSource,
    loadedBridgeAddin,
    loadedAssemblyMatchesManifest,
    loadedAddinModules,
    processes,
    missing,
    message: resolveMessage(status),
  };
}

function normalizeProcesses(input = []) {
  return Array.isArray(input)
    ? input.map((process) => ({
      id: normalizeInteger(process?.id),
      processName: normalizeText(process?.processName),
      mainWindowTitle: normalizeText(process?.mainWindowTitle),
      moduleReadError: normalizeText(process?.moduleReadError),
      loadedModules: normalizeModules(process?.loadedModules),
    })).filter((process) => process.id > 0 || process.processName || process.mainWindowTitle)
    : [];
}

function normalizeModules(input = []) {
  return Array.isArray(input)
    ? input.map((module) => ({
      moduleName: normalizeText(module?.moduleName),
      fileName: normalizeText(module?.fileName),
      lastWriteTime: normalizeText(module?.lastWriteTime),
    })).filter((module) => module.moduleName || module.fileName)
    : [];
}

function resolveMissingCodes(state) {
  const missing = [];
  if (!state.revitOpen) {
    missing.push("REVIT_PROCESS_OPEN");
  }
  if (!state.manifestPath || !state.manifestExists) {
    missing.push("REVIT_ADDIN_MANIFEST");
  }
  if (!state.manifestAssemblyPath || !state.manifestAssemblyExists) {
    missing.push("REVIT_ADDIN_ASSEMBLY");
  }
  if (state.manifestAssemblyExists && state.assemblyIsOlderThanSource) {
    missing.push("REVIT_ADDIN_BUILD_REQUIRED");
  }
  if (state.revitOpen && !state.loadedBridgeAddin) {
    missing.push("REVIT_ADDIN_LOADED");
  }
  if (state.revitOpen && state.loadedBridgeAddin && !state.loadedAssemblyMatchesManifest) {
    missing.push("REVIT_ADDIN_RESTART_REQUIRED");
  }
  return missing;
}

function resolveStatus(missing, revitOpen, loadedBridgeAddin, loadedAssemblyMatchesManifest) {
  if (!revitOpen) {
    return "revit-not-open";
  }
  if (missing.includes("REVIT_ADDIN_MANIFEST")) {
    return "manifest-missing";
  }
  if (missing.includes("REVIT_ADDIN_ASSEMBLY")) {
    return "assembly-missing";
  }
  if (missing.includes("REVIT_ADDIN_BUILD_REQUIRED")) {
    return "build-required";
  }
  if (!loadedBridgeAddin) {
    return "addin-not-loaded";
  }
  if (!loadedAssemblyMatchesManifest) {
    return "restart-required";
  }
  return "ready";
}

function resolveMessage(status) {
  if (status === "revit-not-open") {
    return "Revit no esta abierto.";
  }
  if (status === "manifest-missing") {
    return "No se encontro el manifiesto .addin para Revit.";
  }
  if (status === "assembly-missing") {
    return "El manifiesto apunta a una DLL que no existe.";
  }
  if (status === "build-required") {
    return "El codigo del add-in es mas nuevo que la DLL cargada; cierra Revit, compila/instala y vuelve a abrirlo.";
  }
  if (status === "addin-not-loaded") {
    return "Revit esta abierto, pero no tiene cargado RevitModelAudit.";
  }
  if (status === "restart-required") {
    return "Revit tiene cargada una DLL distinta al manifiesto actual; cierra y vuelve a abrir Revit.";
  }
  return "Revit tiene cargado el add-in esperado.";
}

function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value) {
  return normalizeText(value).replace(/\//g, "\\").toLowerCase();
}

function isOlderTimestamp(left, right) {
  const leftTime = Date.parse(normalizeText(left));
  const rightTime = Date.parse(normalizeText(right));
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime < rightTime;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeInteger(value) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
