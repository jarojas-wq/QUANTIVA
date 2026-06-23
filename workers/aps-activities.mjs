import fs from "node:fs";
import path from "node:path";
import {
  createApsDesignAutomationClient,
  normalizeApsDesignAutomationConfig,
} from "./aps-design-automation-client.mjs";
import {
  classifyApsActivityDiscoveryError,
  createApsActivityDiscoveryMissingConfig,
  createApsActivityDiscoveryReport,
} from "./aps-activity-discovery-domain.mjs";

loadLocalEnv(path.resolve(process.cwd(), ".env"));

const config = normalizeApsDesignAutomationConfig({
  apsClientId: process.env.BIM_APS_CLIENT_ID,
  apsClientSecret: process.env.BIM_APS_CLIENT_SECRET,
  apsActivityId: process.env.BIM_APS_ACTIVITY_ID,
  apsBaseUrl: process.env.BIM_APS_BASE_URL,
  apsTokenUrl: process.env.BIM_APS_TOKEN_URL,
  apsScopes: process.env.BIM_APS_SCOPES,
  apsPollMs: process.env.BIM_APS_POLL_MS,
  apsTimeoutMs: process.env.BIM_APS_TIMEOUT_MS,
});

const missing = createApsActivityDiscoveryMissingConfig(config);
if (missing.length > 0) {
  console.log(JSON.stringify({
    ok: false,
    status: "missing-config",
    providerId: "aps-design-automation",
    missing,
    message: `Configura ${missing.join(", ")} antes de listar activities APS.`,
  }, null, 2));
  process.exit(1);
}

try {
  const client = createApsDesignAutomationClient(config);
  const payload = await client.listActivities();
  const report = createApsActivityDiscoveryReport(payload, {
    activityId: config.activityId,
    baseUrl: config.baseUrl,
    tokenUrl: config.tokenUrl,
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  const diagnostic = classifyApsActivityDiscoveryError(error);
  console.log(JSON.stringify({
    ok: false,
    status: diagnostic.status,
    providerId: "aps-design-automation",
    baseUrl: config.baseUrl,
    tokenUrl: config.tokenUrl,
    error: diagnostic.message,
    diagnostic,
  }, null, 2));
  process.exit(1);
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      return;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) {
      return;
    }
    process.env[key] = value;
  });
}
