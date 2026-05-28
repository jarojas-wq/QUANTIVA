import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/auth-context";
import { LoginPage } from "../features/auth/LoginPage";
import { LegacyAppHost } from "../features/legacy/LegacyAppHost";

function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) {
    return <div className="page-state">Cargando sesion...</div>;
  }
  if (session?.required && !session.authenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/itemizado" element={<LegacyAppHost />} />
          <Route path="/presupuesto" element={<LegacyAppHost />} />
          <Route path="/control-bim" element={<LegacyAppHost />} />
          <Route path="/auditoria" element={<LegacyAppHost />} />
          <Route path="/usuarios" element={<LegacyAppHost />} />
          <Route path="/exportaciones-rvt" element={<LegacyAppHost />} />
          <Route path="/exportacion-presupuesto" element={<LegacyAppHost />} />
        </Route>
        <Route path="*" element={<Navigate to="/itemizado" replace />} />
      </Routes>
    </AuthProvider>
  );
}
