import { describe, expect, it } from "vitest";
import {
  getBimJobTargetCommandIssue,
  normalizeBimJobCommandType,
  normalizeBimJobLogLevel,
  normalizeBimJobProgressPercent,
  normalizeBimJobStatus,
  normalizeBimJobTargetMode,
  normalizeBimModelPath,
  normalizeIncomingBimClaimIdentity,
  normalizeIncomingBimJobCreate,
  normalizeIncomingBimJobProgress,
  normalizeOptionalBimJobCommandType,
  resolveBimJobProgressStatus,
} from "./bim-job-command-domain.mjs";

describe("BIM job command domain", () => {
  it("normalizes POST /api/bim/jobs payloads for the async queue", () => {
    const job = normalizeIncomingBimJobCreate({
      projectUid: " project-1 ",
      targetMode: "cloud-model",
      commandType: " Cloud Model Analysis / Full ",
      payload: { forceRefresh: true },
      modelIdentity: { modelGuid: "model-1", documentVersion: "v3" },
    });

    expect(job).toEqual({
      projectId: "project-1",
      targetMode: "cloud-model",
      commandType: "cloud-model-analysis-full",
      payload: { forceRefresh: true },
      modelIdentity: { modelGuid: "model-1", documentVersion: "v3" },
    });
    expect(normalizeIncomingBimJobCreate({
      targetMode: "desktop",
      commandType: "",
      payload: [],
      modelIdentity: "bad",
    })).toMatchObject({
      projectId: "",
      targetMode: "active-revit",
      commandType: "bim-analysis",
      payload: {},
      modelIdentity: {},
    });
  });

  it("rejects target and command family mismatches", () => {
    expect(getBimJobTargetCommandIssue({
      targetMode: "active-revit",
      commandType: "cloud-model-analysis",
    })).toContain("targetMode");
    expect(getBimJobTargetCommandIssue({
      targetMode: "cloud-model",
      commandType: "active-revit-preview",
    })).toContain("targetMode");
    expect(getBimJobTargetCommandIssue({
      targetMode: "active-revit",
      commandType: "api-smoke-active-revit-preview",
    })).toBe("");
    expect(getBimJobTargetCommandIssue({
      targetMode: "cloud-model",
      commandType: "api-smoke-cloud-model-analysis",
    })).toBe("");
    expect(getBimJobTargetCommandIssue({
      targetMode: "active-revit",
      commandType: "param-write-preview",
    })).toBe("");
  });

  it("normalizes bridge claim identity aliases without leaking path variants", () => {
    const params = new URLSearchParams({
      activeDocumentUid: " doc-1 ",
      activeModelGuid: " model-1 ",
      activeModelPath: "C:/Modelos/Obra.rvt///",
      activeDocumentVersion: " file:638000000000000000 ",
      activeDocumentTitle: " Modelo  Central ",
    });

    expect(normalizeIncomingBimClaimIdentity(params)).toEqual({
      documentUid: "doc-1",
      modelGuid: "model-1",
      modelPath: "c:\\modelos\\obra.rvt",
      documentVersion: "file:638000000000000000",
      documentTitle: "Modelo Central",
    });
    expect(normalizeIncomingBimClaimIdentity({
      documentUid: "doc-2",
      modelGuid: "model-2",
      modelPath: "C:\\Otra\\Modelo.rvt\\",
      modelVersion: " v2 ",
      documentTitle: "Otra",
    })).toMatchObject({
      documentUid: "doc-2",
      modelGuid: "model-2",
      modelPath: "c:\\otra\\modelo.rvt",
      documentVersion: "v2",
    });
  });

  it("normalizes bridge progress reports with bounded status and percent", () => {
    expect(normalizeIncomingBimJobProgress({
      status: "completed",
      stage: " Finalizando ",
      percent: 150,
      message: " Lote  listo ",
      level: "WARN",
      result: { processedElements: 250 },
      error: " ",
    })).toEqual({
      status: "completed",
      stage: "Finalizando",
      percent: 100,
      message: "Lote listo",
      level: "warn",
      result: { processedElements: 250 },
      error: "",
    });
    expect(normalizeIncomingBimJobProgress({
      status: "bad",
      percent: "bad",
      level: "debug",
      result: "bad",
    })).toMatchObject({
      status: "running",
      percent: 0,
      level: "info",
      result: null,
    });
    expect(normalizeIncomingBimJobProgress({
      percent: 40,
      message: " Lote de aplicacion ",
    }, {
      currentStatus: "applying",
    })).toMatchObject({
      status: "applying",
      percent: 40,
      message: "Lote de aplicacion",
    });
    expect(normalizeIncomingBimJobProgress({
      status: "RUNNING",
      percent: 55,
      message: " Legacy apply progress ",
    }, {
      currentStatus: "applying",
    })).toMatchObject({
      status: "applying",
      percent: 55,
      message: "Legacy apply progress",
    });
    expect(normalizeIncomingBimJobProgress({
      status: "completed",
      message: "Cierre sin porcentaje",
    })).toMatchObject({
      status: "completed",
      percent: 100,
    });
    expect(normalizeIncomingBimJobProgress({
      status: "failed",
      percent: "bad",
    })).toMatchObject({
      status: "failed",
      percent: 100,
    });
  });

  it("keeps shared BIM command primitives stable", () => {
    expect(normalizeBimJobTargetMode("cloud-model")).toBe("cloud-model");
    expect(normalizeBimJobTargetMode("bad")).toBe("active-revit");
    expect(normalizeBimJobStatus(" COMPLETED ", "queued")).toBe("completed");
    expect(normalizeBimJobStatus("cancelled", "queued")).toBe("cancelled");
    expect(normalizeBimJobStatus("bad", "running")).toBe("running");
    expect(normalizeBimJobProgressPercent("bad", "cancelled")).toBe(100);
    expect(normalizeBimJobProgressPercent("bad", "running")).toBe(0);
    expect(normalizeBimJobCommandType(" Param Write ++ Preview ")).toBe("param-write-preview");
    expect(normalizeOptionalBimJobCommandType("")).toBe("");
    expect(normalizeBimJobLogLevel("ERROR")).toBe("error");
    expect(normalizeBimModelPath("C:/A/B.rvt\\\\")).toBe("c:\\a\\b.rvt");
    expect(resolveBimJobProgressStatus("", "applying")).toBe("applying");
    expect(resolveBimJobProgressStatus("", "claimed")).toBe("running");
    expect(resolveBimJobProgressStatus("queued", "running")).toBe("running");
    expect(resolveBimJobProgressStatus("claimed", "running")).toBe("running");
    expect(resolveBimJobProgressStatus("running", "claimed")).toBe("running");
    expect(resolveBimJobProgressStatus("RUNNING", "applying")).toBe("applying");
    expect(resolveBimJobProgressStatus("completed", "applying")).toBe("completed");
  });
});
