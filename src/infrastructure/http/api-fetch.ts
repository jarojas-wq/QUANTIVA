const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {})
      },
      ...options
    });
  } catch {
    throw new Error("No se pudo conectar con MTR2. Verifica el servidor e intenta nuevamente.");
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }

  return payload as T;
}
