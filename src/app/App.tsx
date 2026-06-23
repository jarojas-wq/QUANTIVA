import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../features/auth/auth-context";
import { LoginPage } from "../features/auth/LoginPage";
import { QuantivaWorkspace } from "../features/workspace/QuantivaWorkspace";

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
          <Route path="/itemizado" element={<QuantivaWorkspace />} />
          <Route path="/presupuesto" element={<QuantivaWorkspace />} />
          <Route path="/base-recursos" element={<QuantivaWorkspace />} />
          <Route path="/analisis-costos-unitarios" element={<QuantivaWorkspace />} />
          <Route path="/formula-polinomica" element={<QuantivaWorkspace />} />
          <Route path="/control-bim" element={<QuantivaWorkspace />} />
          <Route path="/auditoria" element={<QuantivaWorkspace />} />
          <Route path="/usuarios" element={<QuantivaWorkspace />} />
          <Route path="/exportaciones-rvt" element={<QuantivaWorkspace />} />
          <Route path="/exportacion-presupuesto" element={<QuantivaWorkspace />} />
        </Route>
        <Route path="*" element={<Navigate to="/itemizado" replace />} />
      </Routes>
    </AuthProvider>
  );
}
