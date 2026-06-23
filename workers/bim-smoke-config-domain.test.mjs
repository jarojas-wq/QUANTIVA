import { describe, expect, it } from "vitest";
import {
  createBimSmokeConfigPlan,
  normalizeBimSmokeConfigInput,
} from "./bim-smoke-config-domain.mjs";

describe("BIM smoke config domain", () => {
  it("normalizes cookie, base URL and requested user inputs", () => {
    const config = normalizeBimSmokeConfigInput({
      BIM_SMOKE_BASE_URL: "http://127.0.0.1:5500",
      BIM_SMOKE_SESSION_COOKIE: "abc123",
      ACCESS_COOKIE_NAME: "custom_session",
      BIM_SMOKE_USER_EMAIL: "Operador@Empresa.COM",
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:5500/");
    expect(config.sessionCookie).toBe("custom_session=abc123");
    expect(config.requestedBy).toBe("operador@empresa.com");
  });

  it("selects an accessible project and prepares redaction-safe env values", () => {
    const config = normalizeBimSmokeConfigInput({
      BIM_SMOKE_SESSION_COOKIE: "mtr2_session=session-secret",
      BIM_SMOKE_PROJECT_ID: "project-2",
    });
    const plan = createBimSmokeConfigPlan(config, {
      authenticated: true,
      role: "editor",
      userEmail: "operador@empresa.com",
      userName: "Operador",
    }, {
      currentProjectId: "project-1",
      projects: [
        { id: "project-1", name: "Proyecto 1" },
        { id: "project-2", name: "Proyecto 2" },
      ],
    });

    expect(plan.ok).toBe(true);
    expect(plan.selectedProject).toEqual({ id: "project-2", name: "Proyecto 2" });
    expect(plan.requestedBy).toBe("operador@empresa.com");
    expect(plan.explicitEnv).toEqual({
      BIM_SMOKE_PROJECT_ID: "project-2",
      BIM_SMOKE_SESSION_COOKIE: "mtr2_session=session-secret",
      BIM_SMOKE_USER_EMAIL: "operador@empresa.com",
    });
  });

  it("requires an authenticated editor session and an accessible project", () => {
    const missingSession = createBimSmokeConfigPlan(
      normalizeBimSmokeConfigInput({}),
      { authenticated: false },
      { projects: [] },
    );
    const viewer = createBimSmokeConfigPlan(
      normalizeBimSmokeConfigInput({ BIM_SMOKE_SESSION_COOKIE: "session-secret" }),
      { authenticated: true, role: "viewer", userEmail: "viewer@empresa.com" },
      { projects: [{ id: "project-1", name: "Proyecto 1" }] },
    );
    const wrongProject = createBimSmokeConfigPlan(
      normalizeBimSmokeConfigInput({
        BIM_SMOKE_SESSION_COOKIE: "session-secret",
        BIM_SMOKE_PROJECT_ID: "project-404",
      }),
      { authenticated: true, role: "editor", userEmail: "operador@empresa.com" },
      { projects: [{ id: "project-1", name: "Proyecto 1" }] },
    );

    expect(missingSession.ok).toBe(false);
    expect(missingSession.missing).toEqual(expect.arrayContaining([
      "BIM_SMOKE_SESSION_COOKIE",
      "AUTHENTICATED_SESSION",
      "EDITOR_SESSION",
      "BIM_SMOKE_USER_EMAIL",
      "BIM_SMOKE_PROJECT_ID",
    ]));
    expect(viewer.missing).toContain("EDITOR_SESSION");
    expect(wrongProject.missing).toContain("BIM_SMOKE_PROJECT_ID_ACCESS");
  });
});
