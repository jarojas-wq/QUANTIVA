export const DEFAULT_BIM_ENV_KEYS = [
  "REVIT_INGEST_API_KEY",
  "BIM_WORKER_API_KEY",
  "BIM_WORKER_PROVIDER",
  "BIM_BRIDGE_SMOKE_API_KEY",
  "BIM_BRIDGE_E2E_SMOKE_API_KEY",
  "BIM_SMOKE_PROJECT_ID",
  "BIM_BRIDGE_SMOKE_PROJECT_ID",
  "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID",
  "BIM_SMOKE_SESSION_COOKIE",
  "BIM_SMOKE_USER_EMAIL",
  "BIM_BRIDGE_SMOKE_SESSION_COOKIE",
  "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE",
  "BIM_BRIDGE_E2E_REQUESTED_BY",
  "BIM_APS_CLIENT_ID",
  "BIM_APS_CLIENT_SECRET",
  "BIM_APS_ACTIVITY_ID",
  "BIM_APS_CHECK_INPUT_URL",
  "BIM_APS_CHECK_OUTPUT_URL",
  "BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS",
];

export function createBimLocalEnvPatch(input = {}) {
  const parsed = parseEnvText(input.envText || "");
  const env = {
    ...parsed.values,
    ...pickNonEmptyValues(input.runtimeEnv || {}, DEFAULT_BIM_ENV_KEYS),
  };
  const explicitEnv = pickNonEmptyValues(input.explicitEnv || {}, DEFAULT_BIM_ENV_KEYS);
  const generatedBridgeKey = String(input.generatedBridgeKey || "").trim();
  const rotateBridgeKey = Boolean(input.rotateBridgeKey);
  const previousBridgeKey = String(env.REVIT_INGEST_API_KEY || "").trim();
  const updates = {};
  const generatedKeys = [];
  const rotatedKeys = [];
  const derivedKeys = [];
  const importedKeys = [];
  const explicitKeys = [];

  DEFAULT_BIM_ENV_KEYS.forEach((key) => {
    if (hasValue(explicitEnv[key])) {
      if (parsed.values[key] !== explicitEnv[key]) {
        updates[key] = explicitEnv[key];
        env[key] = updates[key];
        explicitKeys.push(key);
      }
      return;
    }
    if (!hasValue(parsed.values[key]) && hasValue(input.runtimeEnv?.[key])) {
      updates[key] = String(input.runtimeEnv[key]).trim();
      env[key] = updates[key];
      importedKeys.push(key);
    }
  });

  if ((rotateBridgeKey || !hasValue(env.REVIT_INGEST_API_KEY)) && input.generateBridgeKey && generatedBridgeKey) {
    updates.REVIT_INGEST_API_KEY = generatedBridgeKey;
    env.REVIT_INGEST_API_KEY = generatedBridgeKey;
    if (rotateBridgeKey && previousBridgeKey) {
      rotatedKeys.push("REVIT_INGEST_API_KEY");
    } else {
      generatedKeys.push("REVIT_INGEST_API_KEY");
    }
  }

  if (rotateBridgeKey && generatedBridgeKey) {
    rotateDerivedBridgeKey({
      env,
      updates,
      targetKey: "BIM_WORKER_API_KEY",
      previousBridgeKey,
      generatedBridgeKey,
      rotatedKeys,
    });
    rotateDerivedBridgeKey({
      env,
      updates,
      targetKey: "BIM_BRIDGE_SMOKE_API_KEY",
      previousBridgeKey,
      generatedBridgeKey,
      rotatedKeys,
    });
    rotateDerivedBridgeKey({
      env,
      updates,
      targetKey: "BIM_BRIDGE_E2E_SMOKE_API_KEY",
      previousBridgeKey,
      generatedBridgeKey,
      rotatedKeys,
    });
  }

  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_WORKER_API_KEY",
    sourceKeys: ["REVIT_INGEST_API_KEY"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_SMOKE_API_KEY",
    sourceKeys: ["BIM_WORKER_API_KEY", "REVIT_INGEST_API_KEY"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_E2E_SMOKE_API_KEY",
    sourceKeys: ["BIM_BRIDGE_SMOKE_API_KEY", "BIM_WORKER_API_KEY", "REVIT_INGEST_API_KEY"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_SMOKE_PROJECT_ID",
    sourceKeys: ["BIM_SMOKE_PROJECT_ID"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_SMOKE_SESSION_COOKIE",
    sourceKeys: ["BIM_SMOKE_SESSION_COOKIE"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_E2E_SMOKE_PROJECT_ID",
    sourceKeys: ["BIM_BRIDGE_SMOKE_PROJECT_ID", "BIM_SMOKE_PROJECT_ID"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE",
    sourceKeys: ["BIM_BRIDGE_SMOKE_SESSION_COOKIE", "BIM_SMOKE_SESSION_COOKIE"],
    derivedKeys,
  });
  deriveMissingValue({
    env,
    updates,
    targetKey: "BIM_BRIDGE_E2E_REQUESTED_BY",
    sourceKeys: ["BIM_SMOKE_USER_EMAIL"],
    derivedKeys,
  });
  deriveApsOutputRedirectHost({
    env,
    updates,
    derivedKeys,
  });

  const nextText = applyEnvUpdates(parsed, updates);
  const updatedKeys = Object.keys(updates);

  return {
    changed: updatedKeys.length > 0,
    nextText,
    updatedKeys,
    generatedKeys,
    rotatedKeys,
    derivedKeys,
    importedKeys,
    explicitKeys,
    redactedSummary: {
      changed: updatedKeys.length > 0,
      updatedKeys,
      generatedKeys,
      rotatedKeys,
      derivedKeys,
      importedKeys,
      explicitKeys,
    },
  };
}

export function parseEnvText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const values = {};
  const keyLineIndexes = new Map();

  lines.forEach((line, index) => {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      return;
    }
    values[parsed.key] = parsed.value;
    keyLineIndexes.set(parsed.key, index);
  });

  return { lines, values, keyLineIndexes };
}

function applyEnvUpdates(parsed, updates) {
  const lines = [...parsed.lines];
  Object.entries(updates).forEach(([key, value]) => {
    const nextLine = `${key}=${escapeEnvValue(value)}`;
    if (parsed.keyLineIndexes.has(key)) {
      lines[parsed.keyLineIndexes.get(key)] = nextLine;
      return;
    }
    lines.push(nextLine);
  });
  return trimTrailingBlankLines(lines).join("\n") + "\n";
}

function parseEnvLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const index = trimmed.indexOf("=");
  if (index <= 0) {
    return null;
  }
  const key = trimmed.slice(0, index).trim();
  const value = unquoteEnvValue(trimmed.slice(index + 1).trim());
  return key ? { key, value } : null;
}

function deriveMissingValue({ env, updates, targetKey, sourceKeys, derivedKeys }) {
  if (hasValue(env[targetKey])) {
    return;
  }
  const sourceKey = sourceKeys.find((key) => hasValue(env[key]));
  if (!sourceKey) {
    return;
  }
  updates[targetKey] = String(env[sourceKey]).trim();
  env[targetKey] = updates[targetKey];
  derivedKeys.push(targetKey);
}

function rotateDerivedBridgeKey({ env, updates, targetKey, previousBridgeKey, generatedBridgeKey, rotatedKeys }) {
  const current = String(env[targetKey] || "").trim();
  if (current && previousBridgeKey && current !== previousBridgeKey) {
    return;
  }
  updates[targetKey] = generatedBridgeKey;
  env[targetKey] = generatedBridgeKey;
  rotatedKeys.push(targetKey);
}

function deriveApsOutputRedirectHost({ env, updates, derivedKeys }) {
  const outputHost = getHttpsHost(env.BIM_APS_CHECK_OUTPUT_URL);
  if (!outputHost) {
    return;
  }
  const current = String(env.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS || "").trim();
  const hosts = current
    .split(",")
    .map((entry) => normalizeHostEntry(entry))
    .filter(Boolean);
  if (isHostAllowedByEntries(outputHost, hosts)) {
    return;
  }
  const nextHosts = [...hosts, outputHost];
  updates.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS = nextHosts.join(",");
  env.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS = updates.BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS;
  derivedKeys.push("BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS");
}

function getHttpsHost(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

function normalizeHostEntry(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  return text.replace(/^https?:\/\//, "").split("/")[0];
}

function isHostAllowedByEntries(hostname, entries) {
  const host = String(hostname || "").trim().toLowerCase();
  return entries.some((entry) => {
    if (entry === "*") return true;
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === entry || host.endsWith(`.${entry}`);
  });
}

function pickNonEmptyValues(source, keys) {
  const values = {};
  keys.forEach((key) => {
    if (hasValue(source[key])) {
      values[key] = String(source[key]).trim();
    }
  });
  return values;
}

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function escapeEnvValue(value) {
  const text = String(value ?? "");
  if (!/[#\s"'`]/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function unquoteEnvValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function trimTrailingBlankLines(lines) {
  const next = [...lines];
  while (next.length > 0 && !String(next[next.length - 1] || "").trim()) {
    next.pop();
  }
  return next;
}
