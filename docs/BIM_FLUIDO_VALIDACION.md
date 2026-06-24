# Validacion BIM Fluido

Esta guia deja el corte reproducible para el flujo hibrido Web + Revit Bridge + Cloud Worker.
No debe contener cookies, tokens, API keys ni secretos.

## Estado actual

- Plataforma web/API: implementada en Node.js + TypeScript/React/Vite.
- Bridge Revit: implementado en C# .NET con `ExternalEvent`.
- Jobs BIM: persistidos en MySQL con estados `queued`, `claimed`, `running`, `applying`, `completed`, `failed` y `cancelled`.
- Worker cloud: disponible con proveedor `simulated-aps` y contrato preparado para APS Design Automation.
- Readiness hibrido local: `hybridBimReady=true` cuando Web/API, Revit Bridge, worker contractual y compuertas de fluidez estan listos.
- Backend local validado en `http://127.0.0.1:5500`.
- Revit live E2E validado con Revit 2025 abierto, add-in actualizado, modelo activo y sesion Google del add-in.

## Evidencia local verificada

Ejecutado el 2026-06-24:

```powershell
npm.cmd test
npm.cmd run build
node --check server.js
npm.cmd run bim:fluency-check
dotnet build ..\REVIT-MODEL-AUDITOR\RevitModelAudit.sln
npm.cmd run worker:bim:check
npm.cmd run worker:bim:once
npm.cmd run bim:readiness
npm.cmd run bim:api-smoke
npm.cmd run bim:bridge-smoke
npm.cmd run bim:bridge-e2e-smoke
npm.cmd run bim:revit-session
```

Resultado observado:

- `npm.cmd test`: 205 tests OK.
- `npm.cmd run build`: OK.
- `node --check server.js`: OK.
- `npm.cmd run bim:fluency-check`: OK con 10k, 50k y 100k elementos simulados, lotes de 250 y reduccion de renders SSE mayor a 95%.
- `dotnet build`: 0 errores; solo warnings de nulabilidad/conflictos de referencias Revit/.NET.
- `worker:bim:check`: proveedor `simulated-aps` OK.
- `worker:bim:once`: backend OK.
- `bim:readiness`: backend MySQL, fluidez local, Revit local, Revit Bridge activo y cola Revit OK; `hybridBimReady=true`; solo APS live queda en fase 2 por `BIM_APS_ACTIVITY_ID`.
- `bim:api-smoke`: crea, consulta, cancela y reintenta jobs OK.
- `bim:bridge-smoke`: claim, progreso, artefactos y completion OK.
- `bim:bridge-e2e-smoke`: contrato active-revit simulado OK, incluyendo rechazo de usuario ausente, mismatch de propiedad y paginas de operaciones.
- `bim:active-revit-e2e`: crea job real `active-revit`, Revit lo reclama con `revit-DESKTOP-SE7TJ8Q-2025`, reporta progreso y el smoke lo cancela limpio despues de observar progreso.
- `bim:revit-session`: manifiesto, DLL, source freshness y modulo cargado en Revit 2025 OK.

## Revalidacion en vivo

Para repetir la validacion local/web/Revit:

1. Abrir Revit 2025 con el add-in cargado.
2. Abrir el modelo objetivo.
3. Iniciar sesion con Google desde `RevitModelAudit > Iniciar Sesion`.
4. Iniciar sesion web en Itemicostos con un usuario editor/admin.
5. Preparar `.env` sin imprimir la cookie:

```powershell
npm.cmd run bim:prepare-smoke -- --session-cookie "<cookie>"
```

6. Confirmar readiness:

```powershell
npm.cmd run bim:readiness
```

Debe quedar sin faltantes de:

- `BIM_SMOKE_SESSION_COOKIE`
- `BIM_BRIDGE_SMOKE_SESSION_COOKIE`
- `BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE`
- `BIM_BRIDGE_E2E_REQUESTED_BY`
- `REVIT_PROCESS_OPEN`
- `REVIT_ADDIN_LOADED`
- `REVIT_ADDIN_RESTART_REQUIRED`
- `REVIT_ADDIN_BUILD_REQUIRED`
- `ACTIVE_REVIT_MODEL_OPEN`
- `ACTIVE_REVIT_BRIDGE_PRESENCE`
- `ACTIVE_REVIT_GOOGLE_SIGN_IN`
- `ACTIVE_REVIT_BRIDGE_ID_MISMATCH`

7. Ejecutar smokes autenticados:

```powershell
npm.cmd run bim:api-smoke
npm.cmd run bim:bridge-smoke
npm.cmd run bim:bridge-e2e-smoke
npm.cmd run bim:active-revit-e2e
```

8. Verificar que:

- La web crea jobs y responde inmediatamente con `jobId`.
- Readiness muestra el hibrido local listo aunque `readyForRealValidation` siga reservado para APS live completo.
- SSE entrega progreso con `retry` y metricas de tiempo.
- El bridge solo reclama jobs con API key, usuario Google activo y modelo compatible.
- Un bridge distinto recibe `409 BIM_JOB_OWNERSHIP_MISMATCH`.
- Los jobs pueden cancelarse antes de finalizar.
- El job `active-revit` corre por lotes y reporta progreso.
- La aplicacion en Revit ocurre despues de preview/confirmacion y por transacciones por lote.
- La UI no queda bloqueada durante eventos masivos.

## APS real

APS Design Automation sigue como fase 2 operativa. Para pasar de `simulated-aps` a APS real se requiere:

- `BIM_WORKER_PROVIDER=aps-design-automation`
- `BIM_APS_CLIENT_ID`
- `BIM_APS_CLIENT_SECRET`
- `BIM_APS_ACTIVITY_ID`
- URLs HTTPS firmadas de entrada/salida para `BIM_APS_CHECK_INPUT_URL` y `BIM_APS_CHECK_OUTPUT_URL`
- `BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS` cubriendo el host de salida

Validar sin crear work items:

```powershell
npm.cmd run worker:bim:check
```

Validar contra APS vivo:

```powershell
npm.cmd run worker:bim:check-live
```

Si `npm.cmd run worker:bim:list-activities` devuelve `product-access-missing` con mensaje de `client_id` sin acceso al producto API, la app configurada en Autodesk Platform Services aun no tiene habilitado Automation API / Design Automation API. Habilitar ese producto en la app, volver a listar activities y configurar `BIM_APS_ACTIVITY_ID` con la activity publicada.
