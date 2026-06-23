import { describe, expect, it } from "vitest";
import {
  createBimReadinessReport,
  createBimReadinessRuntimeReport,
} from "./bim-readiness-domain.mjs";

describe("BIM readiness runtime domain", () => {
  it("derives active Revit E2E user and model identity from live bridge presence", () => {
    const report = createBimReadinessReport({
      REVIT_INGEST_API_KEY: "bridge-key",
      BIM_SMOKE_SESSION_COOKIE: "mtr2_session=session-value",
    }, {
      revitBridgeSettings: {
        checked: true,
        exists: true,
        settings: {
          projectUid: "project-1",
          web: {
            ingestApiKey: "bridge-key",
            baseUrl: "http://127.0.0.1:5500/",
            autoClaimBimJobs: true,
          },
        },
      },
      fluencyReport: { checked: false },
      bridgeQueueSummary: {
        summary: {
          bridgePresence: {
            online: true,
            latestRequestedBy: "Operador@Empresa.COM",
            latestModelIdentity: {
              modelGuid: "model-live",
              documentUid: "doc-live",
              modelPath: "C:/Models/live.rvt",
              documentVersion: "file:123",
            },
          },
        },
      },
    });
    const e2eCheck = report.checks.find((check) => check.id === "active-revit-e2e-smoke");

    expect(report.missing).not.toContain("BIM_BRIDGE_E2E_REQUESTED_BY");
    expect(e2eCheck?.details).toMatchObject({
      requestedByConfigured: true,
      requestedBy: "operador@empresa.com",
      modelGuid: "model-live",
      documentUid: "doc-live",
      modelPath: "C:/Models/live.rvt",
      documentVersion: "file:123",
    });
    expect(report.derivedConfig).toMatchObject({
      bridgeE2eRequestedBySource: "active-revit-bridge.latestRequestedBy",
      bridgeE2eModelIdentitySource: "active-revit-bridge.latestModelIdentity",
    });
  });

  it("separates open Revit queue health from live bridge presence", () => {
    const baseReport = {
      ok: true,
      readyForRealValidation: true,
      missing: [],
      checks: [],
      nextCommands: [],
    };
    const runtimeReport = createBimReadinessRuntimeReport(baseReport, { attempted: true, ok: true }, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        endpoint: "http://127.0.0.1:5500/api/bim/bridge/summary?projectId=project-1",
        statusCode: 200,
        projectId: "project-1",
        summary: {
          activeRevitQueued: 0,
          oldestActiveRevitQueuedAgeSeconds: 0,
          bridgePresence: {
            online: false,
            onlineCount: 0,
            knownCount: 0,
            ttlSeconds: 180,
          },
        },
      },
    });
    const presenceCheck = runtimeReport.checks.find((check) => check.id === "active-revit-bridge-presence-runtime");
    const queueCheck = runtimeReport.checks.find((check) => check.id === "active-revit-queue-runtime");

    expect(runtimeReport.ok).toBe(false);
    expect(runtimeReport.missing).toContain("ACTIVE_REVIT_BRIDGE_PRESENCE");
    expect(presenceCheck?.status).toBe("missing-config");
    expect(presenceCheck?.details).toMatchObject({
      online: false,
      onlineCount: 0,
      knownCount: 0,
      ttlSeconds: 180,
    });
    expect(queueCheck?.status).toBe("ready");
    expect(queueCheck?.details.diagnostic).toMatchObject({
      tone: "ok",
      reason: "none",
      waitingJobCount: 0,
    });
  });

  it("blocks readiness when Revit is open with a stale add-in DLL", () => {
    const baseReport = {
      ok: true,
      readyForRealValidation: true,
      missing: [],
      checks: [],
      nextCommands: [],
    };
    const runtimeReport = createBimReadinessRuntimeReport(baseReport, { attempted: true, ok: true }, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        summary: {
          activeRevitQueued: 0,
          bridgePresence: { online: true, onlineCount: 1 },
        },
      },
      revitLocalSession: {
        checked: true,
        attempted: true,
        ok: false,
        status: "restart-required",
        version: "2025",
        revitOpen: true,
        loadedBridgeAddin: true,
        loadedAssemblyMatchesManifest: false,
        missing: ["REVIT_ADDIN_RESTART_REQUIRED"],
      },
    });
    const localSessionCheck = runtimeReport.checks.find((check) => check.id === "revit-local-session-runtime");

    expect(runtimeReport.ok).toBe(false);
    expect(runtimeReport.missing).toContain("REVIT_ADDIN_RESTART_REQUIRED");
    expect(runtimeReport.nextCommands).toContain("Cierra y vuelve a abrir Revit 2025.");
    expect(localSessionCheck?.status).toBe("missing-config");
    expect(localSessionCheck?.details).toMatchObject({
      status: "restart-required",
      revitOpen: true,
      loadedBridgeAddin: true,
      loadedAssemblyMatchesManifest: false,
    });
  });

  it("reports live Revit presence separately from signed-in claim readiness", () => {
    const baseReport = {
      ok: true,
      readyForRealValidation: true,
      missing: [],
      checks: [],
      nextCommands: [],
    };
    const runtimeReport = createBimReadinessRuntimeReport(baseReport, { attempted: true, ok: true }, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        projectId: "project-1",
        summary: {
          activeRevitQueued: 0,
          oldestActiveRevitQueuedAgeSeconds: 0,
          bridgePresence: {
            online: true,
            onlineCount: 1,
            knownCount: 1,
            latestBridgeId: "revit-local",
            latestModelIdentity: {
              modelGuid: "model-1",
              bridgeDiagnostic: {
                status: "not-ready",
                canClaim: false,
                signedIn: false,
                hasIngestApiKey: true,
                autoClaimEnabled: true,
                runnerBusy: false,
                pollSeconds: 15,
                issues: ["Inicia sesion con Google para que Revit pueda reclamar jobs active-revit."],
              },
            },
          },
        },
      },
    });
    const presenceCheck = runtimeReport.checks.find((check) => check.id === "active-revit-bridge-presence-runtime");
    const claimCheck = runtimeReport.checks.find((check) => check.id === "active-revit-bridge-claim-runtime");

    expect(runtimeReport.ok).toBe(false);
    expect(runtimeReport.missing).not.toContain("ACTIVE_REVIT_BRIDGE_PRESENCE");
    expect(runtimeReport.missing).toContain("ACTIVE_REVIT_GOOGLE_SIGN_IN");
    expect(runtimeReport.nextCommands).toContain("Inicia sesion con Google en el add-in de Revit.");
    expect(presenceCheck?.status).toBe("ready");
    expect(presenceCheck?.details.latestDiagnostic).toMatchObject({
      status: "not-ready",
      canClaim: false,
      signedIn: false,
    });
    expect(claimCheck?.status).toBe("missing-config");
    expect(claimCheck?.details).toMatchObject({
      bridgeOnline: true,
      latestBridgeId: "revit-local",
      diagnostic: {
        canClaim: false,
        signedIn: false,
        hasIngestApiKey: true,
      },
    });
  });

  it("treats a signed command heartbeat as active Revit claim-ready", () => {
    const baseReport = {
      ok: true,
      readyForRealValidation: true,
      missing: [],
      checks: [],
      nextCommands: [],
    };
    const runtimeReport = createBimReadinessRuntimeReport(baseReport, { attempted: true, ok: true }, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        projectId: "project-1",
        summary: {
          activeRevitQueued: 0,
          oldestActiveRevitQueuedAgeSeconds: 0,
          bridgePresence: {
            online: true,
            onlineCount: 1,
            knownCount: 1,
            latestBridgeId: "revit-local",
            latestRequestedBy: "user@example.com",
            latestModelIdentity: {
              modelGuid: "model-1",
              documentUid: "document-1",
            },
          },
        },
      },
    });
    const claimCheck = runtimeReport.checks.find((check) => check.id === "active-revit-bridge-claim-runtime");

    expect(runtimeReport.ok).toBe(true);
    expect(runtimeReport.missing).not.toContain("ACTIVE_REVIT_BRIDGE_CLAIM_DIAGNOSTIC");
    expect(claimCheck?.status).toBe("ready");
    expect(claimCheck?.details).toMatchObject({
      bridgeOnline: true,
      latestBridgeId: "revit-local",
      latestRequestedBy: "user@example.com",
      diagnostic: null,
    });
  });

  it("classifies active Revit queue waits as operator-actionable bridge runtime issues", () => {
    const baseReport = {
      ok: true,
      readyForRealValidation: true,
      missing: [],
      checks: [],
      nextCommands: [],
    };
    const backendHealth = { attempted: true, ok: true };

    const warning = createBimReadinessRuntimeReport(baseReport, backendHealth, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        summary: {
          activeRevitQueued: 1,
          oldestActiveRevitQueuedAgeSeconds: 180,
        },
      },
    });
    const warningCheck = warning.checks.find((check) => check.id === "active-revit-queue-runtime");

    expect(warning.ok).toBe(false);
    expect(warning.missing).toContain("ACTIVE_REVIT_BRIDGE_NOT_CLAIMING");
    expect(warningCheck.details.diagnostic).toMatchObject({
      tone: "warning",
      reason: "bridge-slow",
      action: "Verifica que Revit este abierto, con sesion activa y auto-claim habilitado.",
      requiresBridgeAttention: true,
    });

    const critical = createBimReadinessRuntimeReport(baseReport, backendHealth, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        summary: {
          activeRevitQueued: 2,
          oldestActiveRevitQueuedAgeSeconds: 620,
        },
      },
    });
    const criticalCheck = critical.checks.find((check) => check.id === "active-revit-queue-runtime");

    expect(critical.ok).toBe(false);
    expect(critical.missing).toContain("ACTIVE_REVIT_BRIDGE_OFFLINE");
    expect(critical.nextCommands).toContain("Abre Revit, inicia sesion en el add-in y ejecuta Jobs BIM.");
    expect(criticalCheck.details.diagnostic).toMatchObject({
      tone: "critical",
      label: "Revit cerrado o bridge detenido",
      reason: "bridge-offline",
      waitingJobCount: 2,
      oldestWaitSeconds: 620,
      requiresBridgeAttention: true,
    });

    const onlineButStale = createBimReadinessRuntimeReport(baseReport, backendHealth, {
      bridgeQueueSummary: {
        attempted: true,
        ok: true,
        summary: {
          activeRevitQueued: 1,
          oldestActiveRevitQueuedAgeSeconds: 620,
          bridgePresence: {
            online: true,
            onlineCount: 1,
            latestBridgeId: "bridge-live",
          },
        },
      },
    });
    const onlineButStaleCheck = onlineButStale.checks.find((check) => check.id === "active-revit-queue-runtime");

    expect(onlineButStale.ok).toBe(false);
    expect(onlineButStale.missing).toContain("ACTIVE_REVIT_MODEL_IDENTITY_MISMATCH");
    expect(onlineButStale.nextCommands).toContain("Abre el modelo Revit correcto o revisa modelGuid, documentUid y modelPath.");
    expect(onlineButStaleCheck.details.diagnostic).toMatchObject({
      tone: "critical",
      label: "Bridge activo sin tomar job",
      reason: "model-mismatch",
      requiresBridgeAttention: true,
    });
  });
});
