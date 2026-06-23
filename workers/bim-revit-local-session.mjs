import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeBimRevitLocalSession,
} from "./bim-revit-local-session-domain.mjs";

if (isMainModule()) {
  const strict = parseBoolean(process.env.BIM_REVIT_SESSION_STRICT, false);
  const version = String(process.env.BIM_REVIT_VERSION || "2025").trim() || "2025";

  try {
    const result = probeBimRevitLocalSession({ version });
    console.log(JSON.stringify(result, null, 2));
    if (strict && !result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      status: "probe-failed",
      version,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    if (strict) {
      process.exitCode = 1;
    }
  }
}

export function probeBimRevitLocalSession(input = {}) {
  const version = String(input.version || process.env.BIM_REVIT_VERSION || "2025").trim() || "2025";
  return normalizeBimRevitLocalSession(collectLocalRevitSession(version));
}

export function collectLocalRevitSession(revitVersion) {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$version = '${escapePowerShellSingleQuoted(revitVersion)}'
$manifestPath = Join-Path $env:APPDATA "Autodesk\\Revit\\Addins\\$version\\RevitModelAudit.addin"
$manifestExists = Test-Path -LiteralPath $manifestPath
$manifestAssemblyPath = ""
if ($manifestExists) {
  try {
    [xml]$manifestXml = Get-Content -LiteralPath $manifestPath -Raw
    $manifestAssemblyPath = [string]$manifestXml.RevitAddIns.AddIn.Assembly
  } catch {
    $manifestAssemblyPath = ""
  }
}
$manifestAssemblyExists = $false
$manifestAssemblyLastWriteTime = ""
if ($manifestAssemblyPath) {
  $assemblyItem = Get-Item -LiteralPath $manifestAssemblyPath -ErrorAction SilentlyContinue
  if ($assemblyItem) {
    $manifestAssemblyExists = $true
    $manifestAssemblyLastWriteTime = $assemblyItem.LastWriteTime.ToString("o")
  }
}
$processes = @()
Get-Process -Name Revit -ErrorAction SilentlyContinue | ForEach-Object {
  $moduleReadError = ""
  $loadedModules = @()
  try {
    $loadedModules = @($_.Modules | Where-Object {
      $_.ModuleName -like "RevitModelAudit*" -or $_.FileName -like "*RevitModelAudit*"
    } | ForEach-Object {
      $moduleItem = Get-Item -LiteralPath $_.FileName -ErrorAction SilentlyContinue
      [pscustomobject]@{
        moduleName = $_.ModuleName
        fileName = $_.FileName
        lastWriteTime = if ($moduleItem) { $moduleItem.LastWriteTime.ToString("o") } else { "" }
      }
    })
  } catch {
    $moduleReadError = $_.Exception.Message
  }
  $processes += [pscustomobject]@{
    id = $_.Id
    processName = $_.ProcessName
    mainWindowTitle = $_.MainWindowTitle
    moduleReadError = $moduleReadError
    loadedModules = $loadedModules
  }
}
[pscustomobject]@{
  version = $version
  manifestPath = $manifestPath
  manifestExists = $manifestExists
  manifestAssemblyPath = $manifestAssemblyPath
  manifestAssemblyExists = $manifestAssemblyExists
  manifestAssemblyLastWriteTime = $manifestAssemblyLastWriteTime
  processes = $processes
} | ConvertTo-Json -Depth 8
`;
  const stdout = execFileSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  return JSON.parse(stdout);
}

function escapePowerShellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function parseBoolean(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "si", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(text)) {
    return false;
  }
  return fallback;
}

function isMainModule() {
  const currentPath = fileURLToPath(import.meta.url);
  const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return Boolean(entryPath) && currentPath.toLowerCase() === entryPath.toLowerCase();
}
