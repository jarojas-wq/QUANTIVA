import { describe, expect, it } from "vitest";
import {
  canClaimBimJobForActiveModel,
  getBimBridgeClaimModelIdentityIssue,
  getBimJobCreateModelIdentityIssue,
  hasBimClaimModelIdentity,
  requiresBimJobCreateModelIdentity,
} from "./bim-job-model-identity-domain.mjs";

describe("BIM job model identity domain", () => {
  it("detects usable Revit model identity from guid, document uid, or path", () => {
    expect(hasBimClaimModelIdentity({ modelGuid: " model-1 " })).toBe(true);
    expect(hasBimClaimModelIdentity({ documentUid: " doc-1 " })).toBe(true);
    expect(hasBimClaimModelIdentity({ modelPath: "C:/Obra/Modelo.rvt/" })).toBe(true);
    expect(hasBimClaimModelIdentity({ documentTitle: "Modelo sin identidad estable" })).toBe(false);
    expect(hasBimClaimModelIdentity("bad")).toBe(false);
  });

  it("allows cloud jobs and legacy active Revit jobs without expected identity", () => {
    expect(canClaimBimJobForActiveModel(
      { modelGuid: "expected" },
      { modelGuid: "active" },
      "cloud-model",
    )).toBe(true);
    expect(canClaimBimJobForActiveModel({}, { modelGuid: "active" }, "active-revit")).toBe(true);
    expect(canClaimBimJobForActiveModel(
      { documentUid: "expected" },
      { modelPath: "C:/Obra/Modelo.rvt" },
      "active-revit",
    )).toBe(false);
  });

  it("requires stable model identity before creating active Revit preview or apply jobs", () => {
    expect(requiresBimJobCreateModelIdentity("active-revit", "active-revit-preview")).toBe(true);
    expect(requiresBimJobCreateModelIdentity("active-revit", "active-revit-apply")).toBe(true);
    expect(requiresBimJobCreateModelIdentity("active-revit", "active-revit:apply")).toBe(true);
    expect(requiresBimJobCreateModelIdentity("cloud-model", "cloud-model-analysis")).toBe(false);
    expect(requiresBimJobCreateModelIdentity("active-revit", "active-revit-analysis")).toBe(false);
    expect(getBimJobCreateModelIdentityIssue({
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      modelIdentity: {
        modelGuid: "model-1",
      },
    })).toBe("");
    expect(getBimJobCreateModelIdentityIssue({
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      modelIdentity: {
        documentTitle: "Solo titulo inestable",
      },
    })).toContain("modelGuid");
  });

  it("blocks active Revit claims when a job expects identity but the bridge sends none", () => {
    expect(canClaimBimJobForActiveModel(
      { modelGuid: "expected-model" },
      {},
      "active-revit",
    )).toBe(false);
    expect(canClaimBimJobForActiveModel(
      JSON.stringify({ documentUid: "expected-document" }),
      { documentTitle: "Solo titulo inestable" },
      "active-revit",
    )).toBe(false);
  });

  it("requires the bridge to identify the active model before claiming active Revit jobs", () => {
    expect(getBimBridgeClaimModelIdentityIssue("active-revit", {
      documentTitle: "Solo titulo inestable",
    })).toContain("modelGuid");
    expect(getBimBridgeClaimModelIdentityIssue("active-revit", {
      modelPath: "C:/Obra/Modelo.rvt",
    })).toBe("");
    expect(getBimBridgeClaimModelIdentityIssue("cloud-model", {})).toBe("");
  });

  it("accepts active Revit claims only when every comparable identity key matches", () => {
    const expectedJson = JSON.stringify({
      modelGuid: "MODEL-1",
      documentUid: "doc-1",
      modelPath: "C:/Obra/Modelo.rvt/",
      documentVersion: "file:100",
    });

    expect(canClaimBimJobForActiveModel(expectedJson, {
      modelGuid: "model-1",
      documentUid: "DOC-1",
      modelPath: "c:\\obra\\modelo.rvt",
      documentVersion: "FILE:100",
    }, "active-revit")).toBe(true);
    expect(canClaimBimJobForActiveModel(expectedJson, {
      modelGuid: "model-2",
      documentUid: "DOC-1",
      modelPath: "c:\\obra\\modelo.rvt",
      documentVersion: "FILE:100",
    }, "active-revit")).toBe(false);
    expect(canClaimBimJobForActiveModel(expectedJson, {
      modelGuid: "model-1",
      documentUid: "DOC-2",
      modelPath: "c:\\obra\\modelo.rvt",
      documentVersion: "FILE:100",
    }, "active-revit")).toBe(false);
    expect(canClaimBimJobForActiveModel(expectedJson, {
      modelGuid: "model-1",
      documentUid: "DOC-1",
      modelPath: "c:\\otra\\modelo.rvt",
      documentVersion: "FILE:100",
    }, "active-revit")).toBe(false);
    expect(canClaimBimJobForActiveModel(expectedJson, {
      modelGuid: "model-1",
      documentUid: "DOC-1",
      modelPath: "c:\\obra\\modelo.rvt",
      documentVersion: "file:200",
    }, "active-revit")).toBe(false);
  });
});
