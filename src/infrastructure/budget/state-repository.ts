import type { BudgetState } from "../../domain/models";
import { apiFetch } from "../../lib/http";
import { normalizeProjectsPayload } from "../../application/budget/budget-domain";

export async function loadBudgetState(): Promise<BudgetState> {
  const payload = await apiFetch<unknown>("/api/state");
  return normalizeProjectsPayload(payload);
}

export async function saveBudgetState(state: BudgetState) {
  return apiFetch<{
    ok: boolean;
    savedAt: string;
    currentProjectId: string | null;
    projects: number;
    storage: string;
    storageLabel: string;
  }>("/api/state", {
    method: "PUT",
    body: JSON.stringify({
      currentProjectId: state.currentProjectId,
      projects: state.projects
    })
  });
}
