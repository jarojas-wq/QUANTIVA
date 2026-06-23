export function normalizeBimSmokeConfigInput(env = {}) {
  const cookieName = normalizeText(env.ACCESS_COOKIE_NAME, "mtr2_session");
  const sessionCookie = normalizeSessionCookie(
    env.BIM_SMOKE_SESSION_COOKIE || env.ITEMICOSTOS_SESSION_COOKIE || "",
    cookieName,
  );

  return {
    baseUrl: normalizeBaseUrl(env.BIM_SMOKE_BASE_URL || env.BIM_WORKER_BASE_URL || env.WEB_BASE_URL || "http://127.0.0.1:5500/"),
    sessionCookie,
    projectId: normalizeText(env.BIM_SMOKE_PROJECT_ID || env.PROJECT_ID, ""),
    requestedBy: normalizeEmail(env.BIM_SMOKE_USER_EMAIL || env.BIM_BRIDGE_E2E_REQUESTED_BY || ""),
    cookieName,
  };
}

export function createBimSmokeConfigPlan(config = {}, sessionPayload = {}, statePayload = {}) {
  const session = normalizeSessionPayload(sessionPayload);
  const projects = normalizeStateProjects(statePayload);
  const selectedProject = selectSmokeProject(projects, config.projectId);
  const requestedBy = normalizeEmail(config.requestedBy || session.userEmail);
  const missing = [];
  const warnings = [];

  if (!config.sessionCookie) {
    missing.push("BIM_SMOKE_SESSION_COOKIE");
  }
  if (!session.authenticated) {
    missing.push("AUTHENTICATED_SESSION");
  }
  if (!isSmokeEditorRole(session.role)) {
    missing.push("EDITOR_SESSION");
  }
  if (!requestedBy) {
    missing.push("BIM_SMOKE_USER_EMAIL");
  }
  if (!selectedProject) {
    missing.push(config.projectId ? "BIM_SMOKE_PROJECT_ID_ACCESS" : "BIM_SMOKE_PROJECT_ID");
  }
  if (config.projectId && selectedProject && selectedProject.id !== config.projectId) {
    warnings.push("El proyecto solicitado no coincide con el proyecto seleccionado.");
  }

  const ok = missing.length === 0;
  return {
    ok,
    status: ok ? "ready" : "needs-config",
    missing: uniqueStrings(missing),
    warnings,
    selectedProject: selectedProject
      ? { id: selectedProject.id, name: selectedProject.name }
      : null,
    requestedBy,
    session: {
      authenticated: session.authenticated,
      role: session.role,
      userEmail: session.userEmail,
      userName: session.userName,
      projectCount: projects.length,
    },
    explicitEnv: ok
      ? {
        BIM_SMOKE_PROJECT_ID: selectedProject.id,
        BIM_SMOKE_SESSION_COOKIE: config.sessionCookie,
        BIM_SMOKE_USER_EMAIL: requestedBy,
      }
      : {},
  };
}

function selectSmokeProject(projects, requestedProjectId) {
  if (!Array.isArray(projects) || projects.length === 0) {
    return null;
  }
  const requested = normalizeText(requestedProjectId, "");
  if (requested) {
    return projects.find((project) => project.id === requested) || null;
  }
  return projects[0] || null;
}

function normalizeSessionPayload(payload = {}) {
  const source = payload?.auth && typeof payload.auth === "object" ? payload.auth : payload;
  return {
    authenticated: source?.authenticated === true,
    role: normalizeText(source?.role, ""),
    userEmail: normalizeEmail(source?.userEmail),
    userName: normalizeText(source?.userName, ""),
  };
}

function normalizeStateProjects(payload = {}) {
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  return projects
    .map((project) => ({
      id: normalizeText(project?.id, ""),
      name: normalizeText(project?.name, "Proyecto"),
    }))
    .filter((project) => project.id);
}

function isSmokeEditorRole(roleInput) {
  return ["editor", "admin", "superadmin"].includes(normalizeText(roleInput, "").toLowerCase());
}

function normalizeSessionCookie(value, cookieName) {
  const text = normalizeText(value, "");
  if (!text) {
    return "";
  }
  return text.includes("=") ? text : `${cookieName}=${text}`;
}

function normalizeBaseUrl(value) {
  const text = normalizeText(value, "http://127.0.0.1:5500/");
  return text.endsWith("/") ? text : `${text}/`;
}

function normalizeEmail(value) {
  return normalizeText(value, "").toLowerCase();
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => normalizeText(value, "")).filter(Boolean)));
}
