import { describe, expect, it } from "vitest";
import {
  decodeBimArtifactContent,
  hasBimArtifactContent,
  hasBimArtifactReference,
  isBimArtifactRedirectHostAllowed,
  normalizeAllowedBimArtifactRedirectUrl,
  normalizeBimArtifactKind,
  normalizeIncomingBimArtifacts,
  parseBimArtifactAllowedRedirectHosts,
  resolveRemoteBimArtifactDownloadUrl,
  sanitizeBimArtifactName,
} from "./bim-artifact-domain.mjs";

describe("BIM artifact domain", () => {
  it("normalizes incoming worker artifacts for local content and remote references", () => {
    const artifacts = normalizeIncomingBimArtifacts([
      {
        kind: "manifest",
        fileName: "manifest<>.json",
        mimeType: "application/json",
        json: { ok: true },
        metadata: { source: "worker" },
      },
      {
        type: "report",
        name: "output.zip",
        provider: "aps",
        url: "https://storage.example.com/output.zip?sig=123",
        size: "2048",
        sha256: "A".repeat(64),
      },
      {
        name: "empty.txt",
      },
    ]);

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatchObject({
      kind: "manifest",
      name: "manifest-.json",
      contentType: "application/json",
      storageProvider: "local",
      storageUri: "",
      metadata: { source: "worker" },
    });
    expect(hasBimArtifactContent(artifacts[0])).toBe(true);
    expect(decodeBimArtifactContent(artifacts[0]).toString("utf8")).toContain('"ok": true');
    expect(artifacts[1]).toMatchObject({
      kind: "report",
      name: "output.zip",
      storageProvider: "aps",
      storageUri: "https://storage.example.com/output.zip?sig=123",
      sizeBytes: 2048,
      checksumSha256: "a".repeat(64),
    });
    expect(hasBimArtifactReference(artifacts[1])).toBe(true);
  });

  it("decodes text and base64 artifact content", () => {
    const [textArtifact, base64Artifact] = normalizeIncomingBimArtifacts([
      { name: "log.txt", text: "hola" },
      { name: "bin.txt", base64: Buffer.from("mundo").toString("base64") },
    ]);

    expect(decodeBimArtifactContent(textArtifact).toString("utf8")).toBe("hola");
    expect(decodeBimArtifactContent(base64Artifact).toString("utf8")).toBe("mundo");
    expect(sanitizeBimArtifactName("../bad:name?.zip")).toBe("..-bad-name-.zip");
  });

  it("exports artifact kind normalization for backend persistence mapping", () => {
    expect(normalizeBimArtifactKind("MANIFEST")).toBe("manifest");
    expect(normalizeBimArtifactKind("unknown-kind")).toBe("output");
  });

  it("normalizes configured redirect hosts from env text", () => {
    expect(parseBimArtifactAllowedRedirectHosts("https://storage.example.com/path, *.blob.core.windows.net"))
      .toEqual(["storage.example.com", "*.blob.core.windows.net"]);
  });

  it("allows exact hosts, subdomains and explicit wildcard subdomains", () => {
    expect(isBimArtifactRedirectHostAllowed("storage.example.com", ["storage.example.com"])).toBe(true);
    expect(isBimArtifactRedirectHostAllowed("signed.storage.example.com", ["storage.example.com"])).toBe(true);
    expect(isBimArtifactRedirectHostAllowed("model.blob.core.windows.net", ["*.blob.core.windows.net"])).toBe(true);
    expect(isBimArtifactRedirectHostAllowed("blob.core.windows.net", ["*.blob.core.windows.net"])).toBe(false);
    expect(isBimArtifactRedirectHostAllowed("storage.example.com.evil.test", ["storage.example.com"])).toBe(false);
  });

  it("only returns HTTPS redirect URLs for allowed artifact hosts", () => {
    const allowedHosts = new Set(["storage.example.com"]);

    expect(normalizeAllowedBimArtifactRedirectUrl("https://storage.example.com/output.zip?sig=123", allowedHosts))
      .toBe("https://storage.example.com/output.zip?sig=123");
    expect(normalizeAllowedBimArtifactRedirectUrl("http://storage.example.com/output.zip", allowedHosts)).toBe("");
    expect(normalizeAllowedBimArtifactRedirectUrl("https://evil.example.com/output.zip", allowedHosts)).toBe("");
  });

  it("resolves remote artifact download URLs from storage URI or metadata fallbacks", () => {
    const allowedHosts = ["storage.example.com"];
    const blockedPrimary = resolveRemoteBimArtifactDownloadUrl({
      storageProvider: "aps",
      storageUri: "https://evil.example.com/output.zip",
      metadata: {
        signedUrl: "https://storage.example.com/output.zip?sig=456",
      },
    }, allowedHosts);

    expect(blockedPrimary).toBe("https://storage.example.com/output.zip?sig=456");
    expect(resolveRemoteBimArtifactDownloadUrl({
      storageProvider: "local",
      storageUri: "https://storage.example.com/output.zip",
    }, allowedHosts)).toBe("");
  });
});
