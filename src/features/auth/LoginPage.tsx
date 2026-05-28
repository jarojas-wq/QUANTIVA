import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { loadGoogleIdentityScript } from "./google-identity";

export function LoginPage() {
  const { session, loading, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  useEffect(() => {
    if (!loading && session?.authenticated && !signingIn) {
      navigate("/itemizado", { replace: true });
    }
  }, [loading, navigate, session?.authenticated, signingIn]);

  useEffect(() => {
    if (!session?.configured || !googleButtonRef.current) return;
    void loadGoogleIdentityScript()
      .then(() => {
        if (!window.google?.accounts?.id || !googleButtonRef.current || !session.clientId) return;
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: session.clientId,
          callback: (response) => {
            setError("");
            setSigningIn(true);
            void loginWithGoogle(response.credential || "")
              .then(() => navigate("/itemizado", { replace: true }))
              .catch((reason: Error) => setError(reason.message))
              .finally(() => setSigningIn(false));
          }
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: 320
        });
      })
      .catch((reason: Error) => setError(reason.message));
  }, [loginWithGoogle, navigate, session?.clientId, session?.configured]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">DECHINI SUITE</p>
        <h1>MTR2</h1>
        <p className="muted">
          Ingresa con Google para trabajar con itemizados, costos y metrados BIM.
        </p>
        {loading && <p className="muted">Preparando sesion...</p>}
        {!loading && !session?.configured && (
          <div className="inline-message warning">
            Falta configurar <code>GOOGLE_AUTH_CLIENT_ID</code> en el backend.
          </div>
        )}
        {!loading && session?.configured && isLocalhost && (
          <div className="inline-message info">
            Si Google muestra origen no registrado, agrega <code>{window.location.origin}</code> en el OAuth Client.
          </div>
        )}
        <div ref={googleButtonRef} />
        {signingIn && <p className="muted">Validando cuenta...</p>}
        {error && <div className="inline-message danger">{error}</div>}
      </div>
    </div>
  );
}
