import { describe, expect, it } from "vitest";
import {
  normalizeBimRevitLocalSession,
} from "./bim-revit-local-session-domain.mjs";

describe("BIM Revit local session domain", () => {
  it("requires Revit to be open", () => {
    const result = normalizeBimRevitLocalSession({
      version: "2025",
      manifestPath: "C:/Users/me/AppData/Roaming/Autodesk/Revit/Addins/2025/RevitModelAudit.addin",
      manifestExists: true,
      manifestAssemblyPath: "C:/repo/RevitModelAudit.Revit.dll",
      manifestAssemblyExists: true,
      processes: [],
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("revit-not-open");
    expect(result.missing).toContain("REVIT_PROCESS_OPEN");
  });

  it("requires restart when Revit has a stale add-in DLL loaded", () => {
    const result = normalizeBimRevitLocalSession({
      version: "2025",
      manifestPath: "C:/Users/me/AppData/Roaming/Autodesk/Revit/Addins/2025/RevitModelAudit.addin",
      manifestExists: true,
      manifestAssemblyPath: "C:/repo/bin/Debug/net8.0-windows/RevitModelAudit.Revit.dll",
      manifestAssemblyExists: true,
      manifestAssemblyLastWriteTime: "2026-06-23T20:30:00.000Z",
      processes: [
        {
          id: 123,
          processName: "Revit",
          mainWindowTitle: "Autodesk Revit 2025",
          loadedModules: [
            {
              moduleName: "RevitModelAudit.Revit.dll",
              fileName: "C:/Users/me/AppData/Roaming/RevitModelAudit/Addins/2025/RevitModelAudit.Revit.dll",
              lastWriteTime: "2026-06-09T15:00:00.000Z",
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("restart-required");
    expect(result.loadedBridgeAddin).toBe(true);
    expect(result.loadedAssemblyMatchesManifest).toBe(false);
    expect(result.missing).toContain("REVIT_ADDIN_RESTART_REQUIRED");
  });

  it("passes when Revit loads the DLL targeted by the manifest", () => {
    const assemblyPath = "C:/repo/bin/Debug/net8.0-windows/RevitModelAudit.Revit.dll";
    const result = normalizeBimRevitLocalSession({
      version: "2025",
      manifestPath: "C:/Users/me/AppData/Roaming/Autodesk/Revit/Addins/2025/RevitModelAudit.addin",
      manifestExists: true,
      manifestAssemblyPath: assemblyPath,
      manifestAssemblyExists: true,
      processes: [
        {
          id: 123,
          processName: "Revit",
          loadedModules: [
            {
              moduleName: "RevitModelAudit.Revit.dll",
              fileName: assemblyPath.replace(/\//g, "\\"),
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.loadedBridgeAddin).toBe(true);
    expect(result.loadedAssemblyMatchesManifest).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
