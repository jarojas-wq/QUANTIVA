export function createBimJobSseSignature(jobInput) {
  const job = isPlainObject(jobInput) ? jobInput : {};
  const logs = Array.isArray(job.logs) ? job.logs : [];
  return [
    normalizeText(job.id),
    normalizeText(job.status),
    normalizeText(job.stage),
    normalizePercent(job.percent),
    normalizeText(job.updatedAt),
    normalizeText(job.completedAt),
    normalizeText(job.error),
    logs.length,
    createResultSignature(job.result),
  ].join("|");
}

export function shouldEmitBimJobSseUpdate(jobInput, lastSignature) {
  const signature = createBimJobSseSignature(jobInput);
  return {
    shouldEmit: signature !== normalizeText(lastSignature),
    signature,
  };
}

function createResultSignature(value) {
  if (!isPlainObject(value)) {
    return "";
  }
  return JSON.stringify(sortObjectKeys(value)).slice(0, 4000);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObjectKeys(value[key]);
      return result;
    }, {});
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.max(0, Math.min(100, numeric))) : "0";
}
