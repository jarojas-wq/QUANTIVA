import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { apiFetch } from "../../lib/http";
import type { WebAuthSession } from "../../domain/models";

interface AuthContextValue {
  session: WebAuthSession | null;
  loading: boolean;
  loginWithGoogle: (credential: string) => Promise<WebAuthSession>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function emptySession(): WebAuthSession {
  return {
    enabled: true,
    configured: false,
    required: true,
    authenticated: false,
    clientId: "",
    allowedDomains: [],
    userId: "",
    userName: "",
    userEmail: "",
    pictureUrl: "",
    hostedDomain: "",
    expiresAt: "",
    role: "",
    projectIds: []
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<WebAuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const [configResult, currentSessionResult] = await Promise.allSettled([
      apiFetch<WebAuthSession>("/api/auth/web/config"),
      apiFetch<WebAuthSession>("/api/auth/web/session")
    ]);
    const config = configResult.status === "fulfilled" ? configResult.value : emptySession();
    const currentSession = currentSessionResult.status === "fulfilled" ? currentSessionResult.value : null;
    setSession({
      ...emptySession(),
      ...config,
      ...(currentSession ?? {})
    });
  }, []);

  useEffect(() => {
    void refreshSession()
      .catch(() => setSession(emptySession()))
      .finally(() => setLoading(false));
  }, [refreshSession]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const payload = await apiFetch<{ auth: WebAuthSession }>("/api/auth/web/google/login", {
      method: "POST",
      body: JSON.stringify({ credential })
    });
    setSession(payload.auth);
    return payload.auth;
  }, []);

  const logout = useCallback(async () => {
    const payload = await apiFetch<{ auth: WebAuthSession }>("/api/auth/web/logout", {
      method: "POST"
    });
    setSession(payload.auth);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    loginWithGoogle,
    logout,
    refreshSession
  }), [session, loading, loginWithGoogle, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }
  return context;
}
