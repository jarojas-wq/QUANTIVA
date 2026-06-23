const BIM_ARTIFACT_STORAGE_PROVIDERS = ["local", "cloud-storage", "aps"];
const BIM_ARTIFACT_KINDS = ["input", "output", "report", "log", "manifest"];

export function normalizeIncomingBimArtifacts(input) {
  const entries = Array.isArray(input) ? input : [];
  return entries
    .map((entry, index) => {
      const source = normalizeObject(entry) || {};
      const name = sanitizeBimArtifactName(source.name || source.fileName || `artifact-${index + 1}.json`);
      const contentType = normalizeText(source.contentType || source.mimeType, "application/json");
      const storageUri = normalizeBimArtifactStorageUri(source.storageUri || source.uri || source.url);
      const storageProvider = normalizeBimArtifactStorageProvider(
        source.storageProvider || source.provider || (storageUri ? "cloud-storage" : "local"),
      );
      return {
        kind: normalizeBimArtifactKind(source.kind || source.type),
        name,
        contentType,
        storageProvider,
        storageUri,
        sizeBytes: clampInteger(source.sizeBytes || source.size, 0, Number.MAX_SAFE_INTEGER, 0),
        checksumSha256: normalizeBimArtifactChecksum(source.checksumSha256 || source.sha256 || source.checksum),
        encoding: normalizeText(source.encoding, ""),
        text: source.text,
        contentBase64: source.contentBase64 || source.base64,
        json: source.json,
        metadata: normalizeObject(source.metadata) || {},
      };
    })
    .filter((artifact) => artifact.name && (hasBimArtifactContent(artifact) || hasBimArtifactReference(artifact)));
}

export function hasBimArtifactContent(artifact) {
  return artifact?.text !== undefined || artifact?.contentBase64 !== undefined || artifact?.json !== undefined;
}

export function hasBimArtifactReference(artifact) {
  return artifact?.storageProvider !== "local" && Boolean(artifact?.storageUri);
}

export function decodeBimArtifactContent(artifact) {
  if (artifact?.contentBase64 !== undefined) {
    return Buffer.from(String(artifact.contentBase64 || ""), "base64");
  }
  if (artifact?.json !== undefined) {
    return Buffer.from(JSON.stringify(artifact.json, null, 2), "utf8");
  }
  return Buffer.from(String(artifact?.text ?? ""), "utf8");
}

export function sanitizeBimArtifactName(value) {
  const text = normalizeText(value, "artifact").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  return text.slice(0, 180) || "artifact";
}

export function parseBimArtifactAllowedRedirectHosts(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .map((entry) => entry.replace(/^https?:\/\//, "").split("/")[0])
    .filter(Boolean);
}

export function resolveRemoteBimArtifactDownloadUrl(artifact, allowedHosts = []) {
  if (!artifact || artifact.storageProvider === "local") {
    return "";
  }
  const metadata = artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
  const candidates = [
    artifact.storageUri,
    metadata.downloadUrl,
    metadata.signedUrl,
  ];

  for (const candidate of candidates) {
    const remoteUrl = normalizeAllowedBimArtifactRedirectUrl(candidate, allowedHosts);
    if (remoteUrl) {
      return remoteUrl;
    }
  }
  return "";
}

export function normalizeAllowedBimArtifactRedirectUrl(value, allowedHosts = []) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:") {
    return "";
  }
  if (!isBimArtifactRedirectHostAllowed(parsed.hostname, allowedHosts)) {
    return "";
  }
  return parsed.toString();
}

export function isBimArtifactRedirectHostAllowed(hostname, allowedHosts = []) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) {
    return false;
  }
  for (const allowedHost of normalizeAllowedHosts(allowedHosts)) {
    if (allowedHost === "*") {
      return true;
    }
    if (allowedHost.startsWith("*.")) {
      const suffix = allowedHost.slice(1);
      if (host.endsWith(suffix) && host.length > suffix.length) {
        return true;
      }
      continue;
    }
    if (host === allowedHost || host.endsWith(`.${allowedHost}`)) {
      return true;
    }
  }
  return false;
}

function normalizeAllowedHosts(allowedHosts) {
  const entries = allowedHosts instanceof Set ? Array.from(allowedHosts) : allowedHosts;
  return Array.isArray(entries)
    ? entries.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function normalizeBimArtifactKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return BIM_ARTIFACT_KINDS.includes(kind) ? kind : "output";
}

function normalizeBimArtifactStorageProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return BIM_ARTIFACT_STORAGE_PROVIDERS.includes(provider) ? provider : "local";
}

function normalizeBimArtifactStorageUri(value) {
  return String(value || "").trim().slice(0, 600);
}

function normalizeBimArtifactChecksum(value) {
  const checksum = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(checksum) ? checksum : "";
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function normalizeText(value, fallback) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value, min, max, fallback) {
  return Math.trunc(clampNumber(value, min, max, fallback));
}
