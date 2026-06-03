import type { AccessUser, ProjectAccessOption } from "../../domain/models";
import { apiFetch } from "../../lib/http";

export interface UsersPayload {
  ok: boolean;
  users: AccessUser[];
  projects: ProjectAccessOption[];
}

export async function loadAccessUsers() {
  return apiFetch<UsersPayload>("/api/auth/users");
}

export async function saveAccessUser(user: Partial<AccessUser> & { email: string }) {
  return apiFetch<{ ok: boolean; user: AccessUser }>("/api/auth/users", {
    method: "POST",
    body: JSON.stringify(user)
  });
}
