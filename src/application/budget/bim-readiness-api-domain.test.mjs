import { describe, expect, it } from "vitest";
import { createBackendBimReadinessSnapshot } from "./bim-readiness-api-domain.mjs";

describe("backend BIM readiness API domain", () => {
  it("summarizes backend BIM readiness without exposing secret values", () => {
    const report = createBackendBimReadinessSnapshot({
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_API_KEY: "worker-secret-key",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_WORKER_COMMAND_TYPE: "Cloud Model Analysis",
      BIM_APS_CLIENT_ID: "client-secret-id",
      BIM_APS_CLIENT_SECRET: "client-secret-value",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_APS_SCOPES: "code:all data:read data:write",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://storage.example.com/output.zip?sig=output-secret",
      BIM_JOB_SSE_POLL_MS: "1500",
      BIM_JOB_SSE_RETRY_MS: "3000",
      BIM_JOB_STALE_MINUTES: "45",
      BIM_JOB_SWEEP_INTERVAL_MS: "65000",
    }, {
      baseUrl: "http://127.0.0.1:5500",
      storageKind: "mysql",
      storageLabel: "MySQL",
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.activeRevitBridgeReady).toBe(true);
    expect(report.cloudWorkerReady).toBe(true);
    expect(report.apsLiveReady).toBe(true);
    expect(report.artifactDownloadsReady).toBe(true);
    expect(report.apsProviderCheckReady).toBe(true);
    expect(report.readyForRealValidation).toBe(true);
    expect(report.baseUrl).toBe("http://127.0.0.1:5500/");
    expect(report.storage.kind).toBe("mysql");
    expect(report.missing).toEqual([]);
    expect(report.checks.find((check) => check.id === "bim-stale-sweep")?.details).toMatchObject({
      staleMinutes: 45,
      sweepIntervalMs: 65000,
      activeStatuses: ["claimed", "running", "applying"],
      terminalAction: "failed",
    });
    expect(JSON.stringify(report)).not.toContain("bridge-secret-key");
    expect(JSON.stringify(report)).not.toContain("worker-secret-key");
    expect(JSON.stringify(report)).not.toContain("client-secret");
    expect(JSON.stringify(report)).not.toContain("input-secret");
    expect(JSON.stringify(report)).not.toContain("output-secret");
  });

  it("keeps APS optional for simulated workers but reports missing production credentials", () => {
    const report = createBackendBimReadinessSnapshot({
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_PROVIDER: "simulated-aps",
    });

    expect(report.ok).toBe(true);
    expect(report.cloudWorkerReady).toBe(true);
    expect(report.apsLiveReady).toBe(false);
    expect(report.readyForRealValidation).toBe(false);
    expect(report.missing).toEqual(expect.arrayContaining([
      "BIM_APS_CLIENT_ID",
      "BIM_APS_CLIENT_SECRET",
      "BIM_APS_ACTIVITY_ID",
    ]));
    expect(report.checks.find((check) => check.id === "aps-design-automation")?.status)
      .toBe("optional-missing-config");
  });

  it("requires remote artifact redirect hosts when APS workers are enabled", () => {
    const report = createBackendBimReadinessSnapshot({
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_API_KEY: "worker-secret-key",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_APS_CLIENT_ID: "client-id",
      BIM_APS_CLIENT_SECRET: "client-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
    });

    expect(report.ok).toBe(false);
    expect(report.cloudWorkerReady).toBe(false);
    expect(report.apsLiveReady).toBe(true);
    expect(report.artifactDownloadsReady).toBe(false);
    expect(report.readyForRealValidation).toBe(false);
    expect(report.missing).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS");
    expect(report.checks.find((check) => check.id === "bim-artifacts")?.status)
      .toBe("missing-config");
    expect(report.nextCommands).toContain("npm run bim:setup-local -- --artifact-redirect-hosts <host>");
  });

  it("requires APS check input/output and validates the output artifact host", () => {
    const missingUrls = createBackendBimReadinessSnapshot({
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_API_KEY: "worker-secret-key",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_APS_CLIENT_ID: "client-id",
      BIM_APS_CLIENT_SECRET: "client-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
    });
    const mismatchedHost = createBackendBimReadinessSnapshot({
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_API_KEY: "worker-secret-key",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_APS_CLIENT_ID: "client-id",
      BIM_APS_CLIENT_SECRET: "client-secret",
      BIM_APS_ACTIVITY_ID: "owner.itemicostos+prod",
      BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS: "storage.example.com",
      BIM_APS_CHECK_INPUT_URL: "https://storage.example.com/input.rvt?sig=input-secret",
      BIM_APS_CHECK_OUTPUT_URL: "https://other-storage.example.com/output.zip?sig=output-secret",
    });

    expect(missingUrls.ok).toBe(false);
    expect(missingUrls.apsProviderCheckReady).toBe(false);
    expect(missingUrls.missing).toEqual(expect.arrayContaining([
      "BIM_APS_CHECK_INPUT_URL",
      "BIM_APS_CHECK_OUTPUT_URL",
    ]));
    expect(missingUrls.nextCommands).toContain("npm --silent run bim:setup-local -- --aps-check-input-url <inputUrl> --aps-check-output-url <outputUrl>");
    expect(mismatchedHost.ok).toBe(false);
    expect(mismatchedHost.artifactDownloadsReady).toBe(false);
    expect(mismatchedHost.apsProviderCheckReady).toBe(false);
    expect(mismatchedHost.missing).toContain("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS includes BIM_APS_CHECK_OUTPUT_URL host");
    expect(mismatchedHost.nextCommands).toContain("npm run bim:setup-local -- --artifact-redirect-hosts other-storage.example.com");
    expect(mismatchedHost.checks.find((check) => check.id === "bim-artifacts")?.details).toMatchObject({
      apsCheckOutputHost: "other-storage.example.com",
      apsCheckOutputHostAllowed: false,
    });
    expect(JSON.stringify(mismatchedHost)).not.toContain("output-secret");
  });

  it("suggests listing APS activities when credentials exist but activity id is missing", () => {
    const report = createBackendBimReadinessSnapshot({
      REVIT_INGEST_API_KEY: "bridge-secret-key",
      BIM_WORKER_PROVIDER: "aps-design-automation",
      BIM_APS_CLIENT_ID: "client-id",
      BIM_APS_CLIENT_SECRET: "client-secret",
    });

    expect(report.apsLiveReady).toBe(false);
    expect(report.missing).toContain("BIM_APS_ACTIVITY_ID");
    expect(report.nextCommands).toContain("npm run worker:bim:list-activities");
    expect(JSON.stringify(report)).not.toContain("client-secret");
  });

  it("blocks backend readiness when the bridge key is missing", () => {
    const report = createBackendBimReadinessSnapshot({});

    expect(report.ok).toBe(false);
    expect(report.activeRevitBridgeReady).toBe(false);
    expect(report.missing).toEqual(expect.arrayContaining([
      "REVIT_INGEST_API_KEY",
      "BIM_WORKER_API_KEY or REVIT_INGEST_API_KEY",
    ]));
    expect(report.nextCommands).toContain("npm run bim:setup-local -- --generate-bridge-key");
  });
});
