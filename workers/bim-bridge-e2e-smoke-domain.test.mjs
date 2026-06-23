import { describe, expect, it } from "vitest";
import {
  buildBimBridgeE2eSmokeClaimPath,
  createBimBridgeE2eSmokeMissingRequestedByConfig,
  normalizeBimBridgeE2eSmokeConfig,
} from "./bim-bridge-e2e-smoke-domain.mjs";

describe("BIM bridge E2E smoke domain", () => {
  it("can build an unauthorized active Revit claim without requestedBy", () => {
    const config = normalizeBimBridgeE2eSmokeConfig({
      BIM_BRIDGE_E2E_REQUESTED_BY: "Operador@Empresa.COM",
      BIM_BRIDGE_E2E_SMOKE_PROJECT_ID: "project-1",
      BIM_BRIDGE_E2E_SMOKE_API_KEY: "bridge-key",
      BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE: "session-cookie",
    });
    const missingUserConfig = createBimBridgeE2eSmokeMissingRequestedByConfig(config);
    const path = buildBimBridgeE2eSmokeClaimPath(missingUserConfig);
    const query = new URL(`http://localhost/${path}`).searchParams;

    expect(config.requestedBy).toBe("operador@empresa.com");
    expect(missingUserConfig.requestedBy).toBe("");
    expect(query.get("targetMode")).toBe("active-revit");
    expect(query.get("requestedBy")).toBe("");
  });
});
