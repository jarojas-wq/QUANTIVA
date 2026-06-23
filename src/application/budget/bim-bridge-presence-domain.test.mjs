import { describe, expect, it } from "vitest";
import {
  normalizeBimBridgePresenceTtlSeconds,
  normalizeIncomingBimBridgeHeartbeat,
  summarizeBimBridgePresence,
} from "./bim-bridge-presence-domain.mjs";

describe("BIM bridge presence domain", () => {
  it("normalizes active Revit bridge heartbeat data without trusting noisy values", () => {
    const heartbeat = normalizeIncomingBimBridgeHeartbeat({
      bridgeId: " bridge-1 ",
      projectUid: " project-1 ",
      requestedBy: "USER@EXAMPLE.COM ",
      activeModelIdentity: { modelGuid: "model-1" },
      diagnostic: {
        status: " Not Ready ",
        canClaim: false,
        autoClaimEnabled: true,
        signedIn: false,
        runnerBusy: false,
        hasIngestApiKey: true,
        pollSeconds: 3,
        validationIssues: [" Inicia sesion con Google "],
      },
      seenAt: "bad-date",
    });

    expect(heartbeat).toEqual({
      bridgeId: "bridge-1",
      projectId: "project-1",
      requestedBy: "user@example.com",
      activeModelIdentity: {
        modelGuid: "model-1",
        bridgeDiagnostic: {
          status: "not-ready",
          canClaim: false,
          autoClaimEnabled: true,
          signedIn: false,
          runnerBusy: false,
          hasIngestApiKey: true,
          pollSeconds: 5,
          issues: ["Inicia sesion con Google"],
        },
      },
      diagnostic: {
        status: "not-ready",
        canClaim: false,
        autoClaimEnabled: true,
        signedIn: false,
        runnerBusy: false,
        hasIngestApiKey: true,
        pollSeconds: 5,
        issues: ["Inicia sesion con Google"],
      },
      seenAt: "",
    });
  });

  it("summarizes online and stale Revit bridge heartbeats with a bounded ttl", () => {
    const now = "2026-06-23T15:30:00.000Z";
    const summary = summarizeBimBridgePresence([
      {
        bridgeId: "bridge-stale",
        projectId: "project-1",
        requestedBy: "old@example.com",
        activeModelIdentity: { modelGuid: "old" },
        lastSeenAt: "2026-06-23T15:20:00.000Z",
      },
      {
        bridgeId: "bridge-live",
        projectId: "project-1",
        requestedBy: "live@example.com",
        activeModelIdentity: {
          modelGuid: "live",
          bridgeDiagnostic: {
            status: "ready",
            canClaim: true,
            autoClaimEnabled: true,
            signedIn: true,
            runnerBusy: false,
            hasIngestApiKey: true,
            pollSeconds: 15,
            issues: [],
          },
        },
        lastSeenAt: "2026-06-23T15:29:30.000Z",
      },
    ], { now, ttlSeconds: 120 });

    expect(summary).toMatchObject({
      online: true,
      onlineCount: 1,
      knownCount: 2,
      ttlSeconds: 120,
      latestSeenAt: "2026-06-23T15:29:30.000Z",
      latestSeenAgeSeconds: 30,
      latestBridgeId: "bridge-live",
      latestRequestedBy: "live@example.com",
      latestModelIdentity: {
        modelGuid: "live",
        bridgeDiagnostic: {
          status: "ready",
          canClaim: true,
          autoClaimEnabled: true,
          signedIn: true,
          runnerBusy: false,
          hasIngestApiKey: true,
          pollSeconds: 15,
          issues: [],
        },
      },
      latestDiagnostic: {
        status: "ready",
        canClaim: true,
        autoClaimEnabled: true,
        signedIn: true,
        runnerBusy: false,
        hasIngestApiKey: true,
        pollSeconds: 15,
        issues: [],
      },
    });

    expect(normalizeBimBridgePresenceTtlSeconds(1)).toBe(15);
    expect(normalizeBimBridgePresenceTtlSeconds(999999)).toBe(3600);
  });
});
