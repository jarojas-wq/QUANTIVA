import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getLegacyViewForPath, LEGACY_ROUTE_BY_VIEW } from "./legacy-routes";

let legacyScriptPromise: Promise<void> | null = null;

function loadLegacyScript() {
  if (legacyScriptPromise) return legacyScriptPromise;
  legacyScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-legacy-app="mtr2"]');
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "/legacy-app.js";
    script.defer = true;
    script.dataset.legacyApp = "mtr2";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el motor de MTR2."));
    document.body.appendChild(script);
  });
  return legacyScriptPromise;
}

export function LegacyAppHost() {
  const [markup, setMarkup] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void fetch("/legacy-shell.html", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((html) => {
        if (!cancelled) setMarkup(html);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!markup || !hostRef.current) return;
    void loadLegacyScript()
      .then(() => {
        const activeView = getLegacyViewForPath(location.pathname);
        const button = document.querySelector<HTMLButtonElement>(`[data-view="${activeView}"]`);
        button?.click();
      })
      .catch((error: Error) => {
        console.error(error);
      });
  }, [markup, location.pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-view]")
        : null;
      const view = target?.dataset.view || "";
      const route = LEGACY_ROUTE_BY_VIEW[view];
      if (route && route !== location.pathname) {
        navigate(route, { replace: false });
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [location.pathname, navigate]);

  if (!markup) {
    return <div className="page-state">Cargando MTR2...</div>;
  }

  return (
    <div
      ref={hostRef}
      className="legacy-app-host"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
