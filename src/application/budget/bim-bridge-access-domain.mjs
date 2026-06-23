const ACTIVE_REVIT_TARGET_MODE = "active-revit";

export function normalizeBimBridgeRequestedBy(value) {
  return String(value || "").trim().toLowerCase();
}

export function createBimBridgeClaimAccessDecision(input = {}) {
  const accessControlEnabled = input.accessControlEnabled !== false;
  const targetMode = normalizeBimBridgeTargetMode(input.targetMode);
  const apiKey = input.apiKey === true;
  const requestedByEmail = normalizeBimBridgeRequestedBy(input.requestedBy);
  const projectId = normalizeBimBridgeProjectId(input.projectId);

  if (!accessControlEnabled) {
    return allowBimBridgeClaim({
      requestedByEmail,
      user: null,
      allProjects: true,
      projectIds: [],
      requiresProjectScope: false,
    });
  }

  const sessionUser = normalizeBimBridgeUser(input.sessionUser);
  if (sessionUser) {
    if (
      targetMode === ACTIVE_REVIT_TARGET_MODE
      && requestedByEmail
      && sessionUser.email !== requestedByEmail
    ) {
      return rejectBimBridgeClaim(
        403,
        "BIM_BRIDGE_SESSION_USER_MISMATCH",
        "El usuario Revit solicitado no coincide con la sesion web activa.",
      );
    }
    return decideBimBridgeUserScope(sessionUser, projectId, requestedByEmail);
  }

  if (apiKey && targetMode === ACTIVE_REVIT_TARGET_MODE) {
    if (!requestedByEmail) {
      return rejectBimBridgeClaim(
        401,
        "BIM_BRIDGE_SIGNED_USER_REQUIRED",
        "El bridge Revit debe enviar el correo del usuario Google activo en requestedBy.",
      );
    }

    const requestedUser = normalizeBimBridgeUser(input.requestedUser);
    if (!requestedUser || requestedUser.email !== requestedByEmail) {
      return rejectBimBridgeClaim(
        403,
        "BIM_BRIDGE_USER_NOT_AUTHORIZED",
        "El usuario Revit no esta autorizado para reclamar jobs BIM.",
      );
    }

    return decideBimBridgeUserScope(requestedUser, projectId, requestedByEmail);
  }

  return allowBimBridgeClaim({
    requestedByEmail,
    user: null,
    allProjects: true,
    projectIds: [],
    requiresProjectScope: false,
  });
}

export function canBimBridgeUserAccessProject(userInput, projectIdInput) {
  const user = normalizeBimBridgeUser(userInput);
  const projectId = normalizeBimBridgeProjectId(projectIdInput);
  if (!user || !projectId || user.active === false) {
    return false;
  }
  const scope = createBimBridgeUserProjectScope(user);
  return scope.allProjects || scope.projectIds.includes(projectId);
}

export function createBimBridgeUserProjectScope(userInput) {
  const user = normalizeBimBridgeUser(userInput);
  if (!user || user.active === false) {
    return {
      allProjects: false,
      projectIds: [],
    };
  }

  if (user.role === "superadmin" || user.projectIds.includes("*")) {
    return {
      allProjects: true,
      projectIds: [],
    };
  }

  return {
    allProjects: false,
    projectIds: user.projectIds.filter((projectId) => projectId !== "*"),
  };
}

function decideBimBridgeUserScope(user, projectId, requestedByEmail) {
  if (user.active === false) {
    return rejectBimBridgeClaim(
      403,
      "BIM_BRIDGE_USER_INACTIVE",
      "El usuario Revit no esta activo en Itemicostos.",
    );
  }

  const scope = createBimBridgeUserProjectScope(user);
  if (!scope.allProjects && scope.projectIds.length === 0) {
    return rejectBimBridgeClaim(
      403,
      "BIM_BRIDGE_USER_WITHOUT_PROJECTS",
      "El usuario Revit no tiene proyectos asignados para reclamar jobs BIM.",
    );
  }

  if (projectId && !canBimBridgeUserAccessProject(user, projectId)) {
    return rejectBimBridgeClaim(
      403,
      "BIM_BRIDGE_PROJECT_FORBIDDEN",
      "El usuario Revit no tiene acceso al proyecto solicitado.",
    );
  }

  return allowBimBridgeClaim({
    requestedByEmail: requestedByEmail || user.email,
    user,
    allProjects: scope.allProjects,
    projectIds: scope.projectIds,
    requiresProjectScope: true,
  });
}

function allowBimBridgeClaim({ requestedByEmail, user, allProjects, projectIds, requiresProjectScope }) {
  return {
    ok: true,
    status: 200,
    code: "",
    error: "",
    requestedByEmail: normalizeBimBridgeRequestedBy(requestedByEmail),
    user,
    projectScope: {
      allProjects: allProjects === true,
      projectIds: Array.isArray(projectIds) ? projectIds : [],
      required: requiresProjectScope === true,
    },
  };
}

function rejectBimBridgeClaim(status, code, error) {
  return {
    ok: false,
    status,
    code,
    error,
    requestedByEmail: "",
    user: null,
    projectScope: {
      allProjects: false,
      projectIds: [],
      required: false,
    },
  };
}

function normalizeBimBridgeUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const email = normalizeBimBridgeRequestedBy(user.email);
  if (!email) {
    return null;
  }

  const role = String(user.role || "").trim().toLowerCase();
  const projectIds = Array.isArray(user.projectIds)
    ? user.projectIds
      .map((projectId) => normalizeBimBridgeProjectId(projectId))
      .filter(Boolean)
    : [];

  return {
    ...user,
    email,
    role,
    active: user.active !== false,
    projectIds: role === "superadmin" ? ["*"] : uniqueValues(projectIds),
  };
}

function normalizeBimBridgeTargetMode(value) {
  const mode = String(value || "").trim();
  return mode || ACTIVE_REVIT_TARGET_MODE;
}

function normalizeBimBridgeProjectId(value) {
  return String(value || "").trim();
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
