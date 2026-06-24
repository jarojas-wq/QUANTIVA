import { describe, expect, it } from "vitest";
import {
  createActiveRevitE2eJobPayload,
  createActiveRevitE2ePlan,
  isActiveRevitE2eSatisfied,
  normalizeActiveRevitE2eConfig,
  summarizeActiveRevitE2eJobObservation,
} from "./bim-active-revit-e2e-domain.mjs";

describe("active Revit real E2E domain", () => {
  it("builds a real active Revit plan from live bridge presence", () => {
    const config = normalizeActiveRevitE2eConfig({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_SESSION_COOKIE: "session-token",
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_ACTIVE_REVIT_E2E_TIMESTAMP: "2026-06-23T10:00:00.000Z",
    });
    const plan = createActiveRevitE2ePlan(config, {
      bridgePresence: {
        online: true,
        latestBridgeId: "revit-local",
        latestRequestedBy: "Operador@Empresa.COM",
        latestModelIdentity: {
          modelGuid: "model-live",
          documentUid: "doc-live",
          modelPath: "C:/Models/live.rvt",
          documentVersion: "file:123",
        },
      },
    });
    const payload = createActiveRevitE2eJobPayload(plan);

    expect(plan.ok).toBe(true);
    expect(plan.requestedBy).toBe("operador@empresa.com");
    expect(plan.bridgeId).toBe("revit-local");
    expect(payload).toMatchObject({
      projectId: "project-1",
      targetMode: "active-revit",
      commandType: "active-revit-preview",
      payload: {
        source: "active-revit-real-e2e",
        batchSize: 250,
        cacheMode: "skip",
        expectedBridgeId: "revit-local",
        validationMode: "claim-and-progress",
      },
      modelIdentity: {
        modelGuid: "model-live",
        documentUid: "doc-live",
        modelPath: "C:/Models/live.rvt",
        documentVersion: "file:123",
      },
    });
  });

  it("keeps the real E2E blocked when session or bridge presence is missing", () => {
    const config = normalizeActiveRevitE2eConfig({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_PROJECT_ID: "project-1",
    });
    const plan = createActiveRevitE2ePlan(config, {
      bridgePresence: {
        online: false,
      },
    });

    expect(plan.ok).toBe(false);
    expect(plan.missing).toEqual([
      "BIM_ACTIVE_REVIT_E2E_SESSION_COOKIE",
      "ACTIVE_REVIT_BRIDGE_PRESENCE",
      "ACTIVE_REVIT_BRIDGE_REQUESTED_BY",
      "ACTIVE_REVIT_MODEL_IDENTITY",
    ]);
  });

  it("requires the live Revit bridge heartbeat to include the signed-in Google user", () => {
    const config = normalizeActiveRevitE2eConfig({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_SESSION_COOKIE: "session-token",
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_USER_EMAIL: "operador@empresa.com",
    });
    const plan = createActiveRevitE2ePlan(config, {
      bridgePresence: {
        online: true,
        latestBridgeId: "revit-local",
        latestRequestedBy: "",
        latestModelIdentity: {
          modelGuid: "model-live",
          modelPath: "C:/Models/live.rvt",
        },
      },
    });

    expect(plan.ok).toBe(false);
    expect(plan.requestedBy).toBe("operador@empresa.com");
    expect(plan.missing).toEqual(["ACTIVE_REVIT_GOOGLE_SIGN_IN"]);
  });

  it("keeps the Google sign-in blocker visible when the last Revit heartbeat is stale", () => {
    const config = normalizeActiveRevitE2eConfig({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_SESSION_COOKIE: "session-token",
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_USER_EMAIL: "operador@empresa.com",
    });
    const plan = createActiveRevitE2ePlan(config, {
      bridgePresence: {
        online: false,
        latestBridgeId: "revit-local",
        latestRequestedBy: "",
        latestDiagnostic: {
          signedIn: false,
        },
        latestModelIdentity: {
          modelGuid: "model-live",
          modelPath: "C:/Models/live.rvt",
        },
      },
    });

    expect(plan.ok).toBe(false);
    expect(plan.missing).toEqual([
      "ACTIVE_REVIT_BRIDGE_PRESENCE",
      "ACTIVE_REVIT_GOOGLE_SIGN_IN",
    ]);
  });

  it("requires an active Revit model when the add-in is only on the start screen", () => {
    const config = normalizeActiveRevitE2eConfig({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_SESSION_COOKIE: "session-token",
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_USER_EMAIL: "operador@empresa.com",
    });
    const plan = createActiveRevitE2ePlan(config, {
      bridgePresence: {
        online: false,
        latestBridgeId: "revit-local",
      },
    }, {
      checked: true,
      ok: true,
      status: "ready",
      processes: [
        {
          id: 123,
          mainWindowTitle: "Autodesk Revit 2025.4 - [Inicio]",
        },
      ],
    });

    expect(plan.ok).toBe(false);
    expect(plan.localRevitSession).toMatchObject({
      ok: true,
      status: "ready",
      activeModelLikelyOpen: false,
    });
    expect(plan.missing).toEqual([
      "ACTIVE_REVIT_MODEL_OPEN",
      "ACTIVE_REVIT_BRIDGE_PRESENCE",
      "ACTIVE_REVIT_MODEL_IDENTITY",
    ]);
  });

  it("surfaces local Revit add-in build blockers before creating a real job", () => {
    const config = normalizeActiveRevitE2eConfig({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_SESSION_COOKIE: "session-token",
      BIM_SMOKE_PROJECT_ID: "project-1",
      BIM_SMOKE_USER_EMAIL: "operador@empresa.com",
    });
    const plan = createActiveRevitE2ePlan(config, {
      bridgePresence: {
        online: true,
        latestBridgeId: "revit-local",
        latestRequestedBy: "operador@empresa.com",
        latestModelIdentity: {
          modelGuid: "model-live",
          modelPath: "C:/Models/live.rvt",
        },
      },
    }, {
      checked: true,
      ok: false,
      status: "build-required",
      missing: ["REVIT_ADDIN_BUILD_REQUIRED"],
      processes: [
        {
          id: 123,
          mainWindowTitle: "Autodesk Revit 2025.4 - [live.rvt - Vista 3D]",
        },
      ],
    });

    expect(plan.ok).toBe(false);
    expect(plan.localRevitSession).toMatchObject({
      ok: false,
      status: "build-required",
      activeModelLikelyOpen: true,
    });
    expect(plan.missing).toEqual(["REVIT_ADDIN_BUILD_REQUIRED"]);
  });

  it("normalizes strict mode for final validation gates", () => {
    expect(normalizeActiveRevitE2eConfig({
      BIM_ACTIVE_REVIT_E2E_STRICT: "true",
    }).strict).toBe(true);
    expect(normalizeActiveRevitE2eConfig({
      BIM_SMOKE_STRICT: "1",
    }).strict).toBe(true);
    expect(normalizeActiveRevitE2eConfig({}).strict).toBe(false);
  });

  it("treats claimed running progress as enough unless completion is required", () => {
    const observation = summarizeActiveRevitE2eJobObservation({
      id: "job-1",
      status: "running",
      claimedBy: "revit-local",
      percent: 12,
      stage: "Analizando por lotes",
    });

    expect(observation).toMatchObject({
      claimObserved: true,
      progressObserved: true,
      terminal: false,
    });
    expect(isActiveRevitE2eSatisfied(observation, { waitForCompletion: false })).toBe(true);
    expect(isActiveRevitE2eSatisfied(observation, { waitForCompletion: true })).toBe(false);
  });
});
