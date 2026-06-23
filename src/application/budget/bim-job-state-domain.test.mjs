import { describe, expect, it } from "vitest";
import {
  canCancelBimJobStatus,
  createBimJobProgressDecision,
  canRetryBimJobCommand,
  canRetryBimJobStatus,
  createBimJobCancelTransition,
  createBimJobRetryDecision,
  isFinishedBimJobStatus,
} from "./bim-job-state-domain.mjs";

describe("BIM job state domain", () => {
  it("classifies terminal statuses consistently", () => {
    expect(isFinishedBimJobStatus("completed")).toBe(true);
    expect(isFinishedBimJobStatus(" failed ")).toBe(true);
    expect(isFinishedBimJobStatus("cancelled")).toBe(true);
    expect(isFinishedBimJobStatus("running")).toBe(false);
    expect(isFinishedBimJobStatus("queued")).toBe(false);
  });

  it("allows cancelling only non-finished jobs", () => {
    expect(canCancelBimJobStatus("queued")).toBe(true);
    expect(canCancelBimJobStatus("applying")).toBe(true);
    expect(canCancelBimJobStatus("completed")).toBe(false);
    expect(createBimJobCancelTransition("claimed", { userName: " Operador  BIM " })).toEqual({
      shouldUpdate: true,
      status: "cancelled",
      stage: "Cancelado",
      percent: 100,
      logLevel: "warn",
      logMessage: "Job cancelado por Operador BIM.",
    });
    expect(createBimJobCancelTransition("failed").shouldUpdate).toBe(false);
    expect(createBimJobCancelTransition("failed").logMessage).toBe("");
  });

  it("allows retrying only finished jobs", () => {
    expect(canRetryBimJobStatus("completed")).toBe(true);
    expect(canRetryBimJobStatus("failed")).toBe(true);
    expect(canRetryBimJobStatus("cancelled")).toBe(true);
    expect(canRetryBimJobStatus("running")).toBe(false);
    expect(canRetryBimJobCommand("cloud-model-analysis")).toBe(true);
    expect(canRetryBimJobCommand("active-revit-preview")).toBe(true);
    expect(canRetryBimJobCommand("active-revit-apply")).toBe(false);
    expect(canRetryBimJobCommand("active-revit:apply")).toBe(false);
    expect(createBimJobRetryDecision("failed")).toEqual({
      canRetry: true,
      reason: "",
    });
    expect(createBimJobRetryDecision("queued")).toEqual({
      canRetry: false,
      reason: "Solo se pueden reintentar jobs BIM finalizados.",
    });
    expect(createBimJobRetryDecision("failed", { commandType: "active-revit-apply" })).toEqual({
      canRetry: false,
      reason: "Los jobs BIM de aplicacion no se reintentan; vuelve al preview y confirma una nueva aplicacion.",
    });
  });

  it("ignores late progress for terminal jobs", () => {
    expect(createBimJobProgressDecision("applying")).toEqual({
      shouldUpdate: true,
      currentStatus: "applying",
      reason: "",
    });
    expect(createBimJobProgressDecision("cancelled")).toEqual({
      shouldUpdate: false,
      currentStatus: "cancelled",
      reason: "El job BIM ya esta finalizado; se ignora el progreso tardio.",
    });
    expect(createBimJobProgressDecision(" completed ")).toMatchObject({
      shouldUpdate: false,
      currentStatus: "completed",
    });
  });
});
