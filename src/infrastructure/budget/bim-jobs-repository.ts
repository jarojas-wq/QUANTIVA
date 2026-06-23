import type { BimJobQueueSummary, BimJobRecord, BimJobTargetMode } from "../../domain/models";
import {
  normalizeBimJobQueueSummary,
  normalizeBimJobRecord,
  normalizeBimJobRecords,
  normalizeBimReadinessReport
} from "../../application/budget/bim-jobs-domain";
import { apiFetch } from "../../lib/http";

export interface CreateBimJobInput {
  projectId: string;
  targetMode: BimJobTargetMode;
  commandType: string;
  payload?: Record<string, unknown>;
  modelIdentity?: Record<string, unknown>;
}

export async function loadBimJobs(projectId: string) {
  const payload = await apiFetch<{ ok: boolean; jobs: unknown[] }>(
    `/api/bim/jobs?projectId=${encodeURIComponent(projectId)}`
  );
  return normalizeBimJobRecords(payload.jobs);
}

export async function loadBimJobQueueSummary(projectId: string): Promise<BimJobQueueSummary> {
  const payload = await apiFetch<{ ok: boolean; summary: unknown }>(
    `/api/bim/jobs/summary?projectId=${encodeURIComponent(projectId)}`
  );
  return normalizeBimJobQueueSummary(payload.summary);
}

export async function loadBimJob(jobId: string) {
  const payload = await apiFetch<{ ok: boolean; job: unknown }>(`/api/bim/jobs/${encodeURIComponent(jobId)}`);
  return normalizeBimJobRecord(payload.job);
}

export async function loadBimReadiness() {
  const payload = await apiFetch<{ ok?: boolean; readiness?: unknown } | unknown>("/api/bim/readiness");
  const source = payload && typeof payload === "object" && !Array.isArray(payload) && "readiness" in payload
    ? payload.readiness
    : payload;
  return normalizeBimReadinessReport(source);
}

export async function createBimJob(input: CreateBimJobInput) {
  const payload = await apiFetch<{ ok: boolean; job: unknown }>("/api/bim/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return normalizeBimJobRecord(payload.job);
}

export async function cancelBimJob(jobId: string) {
  const payload = await apiFetch<{ ok: boolean; job: unknown }>(`/api/bim/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return normalizeBimJobRecord(payload.job);
}

export async function retryBimJob(jobId: string) {
  const payload = await apiFetch<{ ok: boolean; job: unknown }>(`/api/bim/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return normalizeBimJobRecord(payload.job);
}

export async function applyBimJob(jobId: string) {
  const payload = await apiFetch<{ ok: boolean; job: unknown }>(`/api/bim/jobs/${encodeURIComponent(jobId)}/apply`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return normalizeBimJobRecord(payload.job);
}

export function getBimJobEventsUrl(jobId: string) {
  return `/api/bim/jobs/${encodeURIComponent(jobId)}/events`;
}
