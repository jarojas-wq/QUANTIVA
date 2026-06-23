import { describe, expect, it } from "vitest";
import {
  classifyApsActivityDiscoveryError,
  createApsActivityDiscoveryMissingConfig,
  createApsActivityDiscoveryReport,
  createApsActivityNextCommands,
  normalizeApsActivityEntries,
} from "./aps-activity-discovery-domain.mjs";

describe("APS activity discovery domain", () => {
  it("normalizes APS activity list shapes and deduplicates ids", () => {
    const activities = normalizeApsActivityEntries({
      data: [
        "owner.itemicostos+prod",
        "owner.itemicostos+prod",
        {
          id: "owner.audit+dev",
          engine: "Autodesk.Revit+2025",
          parameters: {
            InputFile: {},
            Result: {},
          },
        },
      ],
    });

    expect(activities.map((activity) => activity.id)).toEqual([
      "owner.audit+dev",
      "owner.itemicostos+prod",
    ]);
    expect(activities[0]).toMatchObject({
      owner: "owner",
      name: "audit",
      alias: "dev",
      engine: "Autodesk.Revit+2025",
      parameters: ["InputFile", "Result"],
    });
  });

  it("reports next setup command only when one activity is discoverable and none is configured", () => {
    const report = createApsActivityDiscoveryReport(["owner.itemicostos+prod"], {
      baseUrl: "https://developer.api.autodesk.com/da/us-east/v3",
      tokenUrl: "https://developer.api.autodesk.com/authentication/v2/token",
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.activityCount).toBe(1);
    expect(report.nextCommands).toEqual([
      "npm run bim:setup-local -- --enable-aps --aps-activity-id owner.itemicostos+prod",
    ]);
    expect(createApsActivityNextCommands(report.activities, "owner.itemicostos+prod")).toEqual([]);
  });

  it("requires client id and secret before making live discovery calls", () => {
    expect(createApsActivityDiscoveryMissingConfig({})).toEqual([
      "BIM_APS_CLIENT_ID",
      "BIM_APS_CLIENT_SECRET",
    ]);
    expect(createApsActivityDiscoveryMissingConfig({
      clientId: "client-id",
      clientSecret: "client-secret",
    })).toEqual([]);
  });

  it("classifies APS product access failures into actionable diagnostics", () => {
    const diagnostic = classifyApsActivityDiscoveryError(
      new Error("APS token HTTP 403: The client_id specified does not have access to the api product"),
    );

    expect(diagnostic).toMatchObject({
      code: "aps-api-product-access",
      status: "product-access-missing",
    });
    expect(diagnostic.nextActions.join(" ")).toContain("Automation API");
  });

  it("classifies invalid credentials and redacts obvious secret fragments", () => {
    const diagnostic = classifyApsActivityDiscoveryError(
      "APS token HTTP 401: invalid credentials client_secret=super-secret-value",
    );

    expect(diagnostic).toMatchObject({
      code: "aps-invalid-credentials",
      status: "invalid-credentials",
    });
    expect(diagnostic.message).not.toContain("super-secret-value");
    expect(diagnostic.message).toContain("[redacted]");
  });
});
