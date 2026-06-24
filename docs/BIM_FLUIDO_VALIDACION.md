# Validacion BIM Fluido

Esta guia deja el corte reproducible para el flujo hibrido Web + Revit Bridge + Cloud Worker.
No debe contener cookies, tokens, API keys ni secretos.

## Estado actual

- Plataforma web/API: implementada en Node.js + TypeScript/React/Vite.
- Bridge Revit: implementado en C# .NET con `ExternalEvent`.
- Jobs BIM: persistidos en MySQL con estados `queued`, `claimed`, `running`, `applying`, `completed`, `failed` y `cancelled`.
- Worker cloud: disponible con proveedor `simulated-aps` y contrato preparado para APS Design Automation.
- Backend local validado en `http://127.0.0.1:5500`.
- Revit live E2E pendiente porque requiere Revit 2025 abierto y sesion web editor activa.

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

- `npm.cmd test`: 194 tests OK.
- `npm.cmd run build`: OK.
- `node --check server.js`: OK.
- `npm.cmd run bim:fluency-check`: OK con 10k, 50k y 100k elementos simulados, lotes de 250 y reduccion de renders SSE mayor a 95%.
- `dotnet build`: 0 errores; solo warnings de nulabilidad/conflictos de referencias Revit/.NET.
- `worker:bim:check`: proveedor `simulated-aps` OK.
- `worker:bim:once`: backend OK; no habia jobs `cloud-model` pendientes.
- `bim:readiness`: backend MySQL, worker cloud, settings locales Revit Bridge y cola Revit consultable OK.
- `bim:api-smoke`: health OK; omitido sin crear datos porque falta `BIM_SMOKE_SESSION_COOKIE`.
- `bim:bridge-smoke`: health OK; no reclamo jobs ajenos.
- `bim:bridge-e2e-smoke`: health OK; omitido porque faltan `BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE` y `BIM_BRIDGE_E2E_REQUESTED_BY`.
- `bim:revit-session`: manifiesto y DLL existen; Revit no esta abierto.

## Cierre pendiente para validar en vivo

Para declarar el objetivo completo como validado, ejecutar con Revit abierto:

1. Abrir Revit 2025 con el add-in cargado.
2. Iniciar sesion web en Itemicostos con un usuario editor/admin.
3. Preparar `.env` sin imprimir la cookie:

```powershell
npm.cmd run bim:prepare-smoke -- --session-cookie "<cookie>"
```

4. Confirmar readiness:

```powershell
npm.cmd run bim:readiness
```

Debe quedar listo o, como minimo, sin faltantes de:

- `BIM_SMOKE_SESSION_COOKIE`
- `BIM_BRIDGE_SMOKE_SESSION_COOKIE`
- `BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE`
- `BIM_BRIDGE_E2E_REQUESTED_BY`
- `REVIT_PROCESS_OPEN`
- `ACTIVE_REVIT_BRIDGE_PRESENCE`

5. Ejecutar smokes autenticados:

```powershell
npm.cmd run bim:api-smoke
npm.cmd run bim:bridge-smoke
npm.cmd run bim:bridge-e2e-smoke
npm.cmd run bim:active-revit-e2e
```

6. Verificar que:

- La web crea jobs y responde inmediatamente con `jobId`.
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

