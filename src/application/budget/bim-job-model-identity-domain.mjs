import {
  normalizeBimJobCommandType,
  normalizeBimJobTargetMode,
  normalizeBimModelPath,
} from "./bim-job-command-domain.mjs";

export const BIM_JOB_CREATE_MODEL_IDENTITY_MESSAGE = "Para crear un job Revit activo de preview o aplicacion se requiere una identidad estable del modelo: modelGuid, documentUid o modelPath.";
export const BIM_ACTIVE_REVIT_CLAIM_MODEL_IDENTITY_MESSAGE = "El bridge Revit debe enviar una identidad estable del modelo activo: modelGuid, documentUid o modelPath.";

export function hasBimClaimModelIdentity(identityInput) {
  const identity = normalizeObject(identityInput) || {};
  return Boolean(
    normalizeIdentifier(identity.modelGuid, "")
    || normalizeIdentifier(identity.documentUid, "")
    || normalizeBimModelPath(identity.modelPath)
  );
}

export function requiresBimJobCreateModelIdentity(targetModeInput, commandTypeInput) {
  const targetMode = normalizeBimJobTargetMode(targetModeInput);
  const commandType = normalizeBimJobCommandType(commandTypeInput);
  return targetMode === "active-revit"
    && (commandType.includes("preview") || commandType.endsWith("-apply") || commandType.includes(":apply"));
}

export function getBimJobCreateModelIdentityIssue(input) {
  const source = normalizeObject(input) || {};
  if (!requiresBimJobCreateModelIdentity(source.targetMode, source.commandType)) {
    return "";
  }
  return hasBimClaimModelIdentity(source.modelIdentity)
    ? ""
    : BIM_JOB_CREATE_MODEL_IDENTITY_MESSAGE;
}

export function getBimBridgeClaimModelIdentityIssue(targetModeInput, activeIdentityInput) {
  return normalizeBimJobTargetMode(targetModeInput) === "active-revit"
    && !hasBimClaimModelIdentity(activeIdentityInput)
    ? BIM_ACTIVE_REVIT_CLAIM_MODEL_IDENTITY_MESSAGE
    : "";
}

export function canClaimBimJobForActiveModel(modelIdentityInput, activeIdentityInput, targetMode) {
  if (normalizeBimJobTargetMode(targetMode) !== "active-revit") {
    return true;
  }

  const expected = parseJsonObject(modelIdentityInput) || normalizeObject(modelIdentityInput) || {};
  if (!hasBimClaimModelIdentity(expected)) {
    return true;
  }

  const active = normalizeObject(activeIdentityInput) || {};
  if (!hasBimClaimModelIdentity(active)) {
    return false;
  }

  let comparableKeys = 0;
  const expectedModelGuid = normalizeIdentifier(expected.modelGuid, "").toLowerCase();
  const activeModelGuid = normalizeIdentifier(active.modelGuid, "").toLowerCase();
  if (expectedModelGuid && activeModelGuid) {
    comparableKeys += 1;
    if (expectedModelGuid !== activeModelGuid) {
      return false;
    }
  }

  const expectedDocumentUid = normalizeIdentifier(expected.documentUid, "").toLowerCase();
  const activeDocumentUid = normalizeIdentifier(active.documentUid, "").toLowerCase();
  if (expectedDocumentUid && activeDocumentUid) {
    comparableKeys += 1;
    if (expectedDocumentUid !== activeDocumentUid) {
      return false;
    }
  }

  const expectedModelPath = normalizeBimModelPath(expected.modelPath);
  const activeModelPath = normalizeBimModelPath(active.modelPath);
  if (expectedModelPath && activeModelPath) {
    comparableKeys += 1;
    if (expectedModelPath !== activeModelPath) {
      return false;
    }
  }

  const expectedDocumentVersion = normalizeDocumentVersion(expected);
  const activeDocumentVersion = normalizeDocumentVersion(active);
  if (expectedDocumentVersion && activeDocumentVersion) {
    comparableKeys += 1;
    if (expectedDocumentVersion !== activeDocumentVersion) {
      return false;
    }
  }

  return comparableKeys > 0;
}

function parseJsonObject(value) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return normalizeObject(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function normalizeIdentifier(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeDocumentVersion(identity) {
  return normalizeIdentifier(
    identity.documentVersion
      || identity.modelVersion
      || identity.documentRevision
      || identity.revitDocumentVersion
      || identity.version,
    "",
  ).toLowerCase();
}
