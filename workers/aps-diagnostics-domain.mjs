export function classifyApsAutomationError(error) {
  const message = sanitizeApsErrorMessage(error instanceof Error ? error.message : String(error || ""));
  const lower = message.toLowerCase();
  if (lower.includes("does not have access to the api product") || lower.includes("auth-001")) {
    return {
      code: "aps-api-product-access",
      status: "product-access-missing",
      message,
      nextActions: [
        "En Autodesk Platform Services, abre la app del Client ID configurado.",
        "Habilita el producto Automation API / Design Automation API para esa app.",
        "Vuelve a ejecutar npm run worker:bim:list-activities y luego configura BIM_APS_ACTIVITY_ID.",
      ],
    };
  }
  if (lower.includes("invalid credentials") || lower.includes("unauthorized") || lower.includes("401")) {
    return {
      code: "aps-invalid-credentials",
      status: "invalid-credentials",
      message,
      nextActions: [
        "Verifica que BIM_APS_CLIENT_ID y BIM_APS_CLIENT_SECRET pertenezcan a la misma app APS.",
        "Si el secret fue expuesto o rotado, genera uno nuevo y actualiza .env con bim:setup-local.",
      ],
    };
  }
  if (lower.includes("invalid_scope") || lower.includes("scope")) {
    return {
      code: "aps-invalid-scopes",
      status: "invalid-scopes",
      message,
      nextActions: [
        "Revisa BIM_APS_SCOPES; para este worker se esperan code:all data:read data:write.",
      ],
    };
  }
  return {
    code: "aps-request-failed",
    status: "request-failed",
    message,
    nextActions: [
      "Revisa conectividad, credenciales APS y permisos del producto Automation API.",
    ],
  };
}

export function sanitizeApsErrorMessage(value) {
  const text = String(value || "").trim();
  return text
    .replace(/(client_secret=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(authorization:\s*basic\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .slice(0, 1000);
}
