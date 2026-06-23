export const BIM_JOB_DETAIL_NOT_FOUND_MESSAGE = "No se encontro el job BIM.";

export function createBimJobDetailResponse(jobInput) {
  if (!isPlainObject(jobInput) || !normalizeText(jobInput.id)) {
    return {
      ok: false,
      status: 404,
      body: {
        ok: false,
        error: BIM_JOB_DETAIL_NOT_FOUND_MESSAGE,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      job: jobInput,
    },
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
