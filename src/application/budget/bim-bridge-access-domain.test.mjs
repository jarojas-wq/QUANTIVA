import { describe, expect, it } from "vitest";
import {
  canBimBridgeUserAccessProject,
  createBimBridgeClaimAccessDecision,
  createBimBridgeUserProjectScope,
  normalizeBimBridgeRequestedBy,
} from "./bim-bridge-access-domain.mjs";

describe("bim bridge access domain", () => {
  it("normalizes requestedBy as the signed-in Revit user email", () => {
    expect(normalizeBimBridgeRequestedBy("  Operador@Empresa.COM  ")).toBe("operador@empresa.com");
  });

  it("requires the signed-in Revit user when an API-key bridge claims active Revit jobs", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: true,
      targetMode: "active-revit",
    });

    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(401);
    expect(decision.code).toBe("BIM_BRIDGE_SIGNED_USER_REQUIRED");
  });

  it("rejects API-key active Revit claims when requestedBy is not an authorized user", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: true,
      targetMode: "active-revit",
      requestedBy: "operador@empresa.com",
      requestedUser: null,
    });

    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.code).toBe("BIM_BRIDGE_USER_NOT_AUTHORIZED");
  });

  it("rejects active Revit claims for projects outside the signed-in user's scope", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: true,
      targetMode: "active-revit",
      requestedBy: "operador@empresa.com",
      requestedUser: {
        email: "operador@empresa.com",
        role: "editor",
        active: true,
        projectIds: ["proyecto-a"],
      },
      projectId: "proyecto-b",
    });

    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.code).toBe("BIM_BRIDGE_PROJECT_FORBIDDEN");
  });

  it("allows authorized active Revit claims and returns a project scope for SQL filtering", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: true,
      targetMode: "active-revit",
      requestedBy: "operador@empresa.com",
      requestedUser: {
        email: "operador@empresa.com",
        role: "editor",
        active: true,
        projectIds: ["proyecto-a", "proyecto-b"],
      },
      projectId: "proyecto-b",
    });

    expect(decision.ok).toBe(true);
    expect(decision.requestedByEmail).toBe("operador@empresa.com");
    expect(decision.projectScope).toEqual({
      allProjects: false,
      projectIds: ["proyecto-a", "proyecto-b"],
      required: true,
    });
  });

  it("scopes session-authenticated bridge claims to the user's assigned projects", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: false,
      targetMode: "active-revit",
      requestedBy: "editor@empresa.com",
      sessionUser: {
        email: "editor@empresa.com",
        role: "editor",
        active: true,
        projectIds: ["proyecto-c"],
      },
    });

    expect(decision.ok).toBe(true);
    expect(decision.projectScope).toEqual({
      allProjects: false,
      projectIds: ["proyecto-c"],
      required: true,
    });
  });

  it("rejects session-authenticated active Revit claims when requestedBy differs from the session user", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: false,
      targetMode: "active-revit",
      requestedBy: "otro@empresa.com",
      sessionUser: {
        email: "editor@empresa.com",
        role: "editor",
        active: true,
        projectIds: ["proyecto-c"],
      },
    });

    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.code).toBe("BIM_BRIDGE_SESSION_USER_MISMATCH");
  });

  it("keeps cloud workers with API key unscoped by user because they are service workers", () => {
    const decision = createBimBridgeClaimAccessDecision({
      apiKey: true,
      targetMode: "cloud-model",
      requestedBy: "",
    });

    expect(decision.ok).toBe(true);
    expect(decision.projectScope).toEqual({
      allProjects: true,
      projectIds: [],
      required: false,
    });
  });

  it("treats superadmin users as all-project bridge operators", () => {
    const user = {
      email: "super@empresa.com",
      role: "superadmin",
      active: true,
      projectIds: [],
    };

    expect(createBimBridgeUserProjectScope(user)).toEqual({
      allProjects: true,
      projectIds: [],
    });
    expect(canBimBridgeUserAccessProject(user, "cualquier-proyecto")).toBe(true);
  });
});
