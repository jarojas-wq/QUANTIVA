# Quantiva - Itemizado y Costos

Aplicativo web React + Vite + TypeScript para crear un itemizado jerarquico, editar presupuesto y sincronizar metrados BIM con Revit. La interfaz usa la estructura visual de ERP DECHINI WEB y el backend Node conserva los contratos MySQL/Revit existentes.

## Persistencia

La unica persistencia soportada es MySQL local/remoto. El frontend no guarda proyectos en el navegador y el backend no tiene fallback a archivos locales.

Configuracion requerida en `.env`:

```env
HOST=127.0.0.1
PORT=5500
ITEMICOSTOS_STORAGE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=mtr2
MYSQL_PASSWORD=
MYSQL_DATABASE=MTRD
REVIT_INGEST_API_KEY=
BIM_WORKER_API_KEY=
BIM_WORKER_BASE_URL=http://127.0.0.1:5500/
BIM_WORKER_ID=
BIM_WORKER_PROVIDER=simulated-aps
BIM_WORKER_COMMAND_TYPE=cloud-model-analysis
BIM_WORKER_POLL_MS=5000
BIM_WORKER_ERROR_BACKOFF_MAX_MS=300000
BIM_WORKER_SIMULATED_ELEMENTS=10000
BIM_WORKER_BATCH_DELAY_MS=10
BIM_WORKER_LOAD_TEST_SIZES=10000,50000,100000
BIM_WORKER_LOAD_TEST_BATCH_SIZE=250
BIM_APS_CLIENT_ID=
BIM_APS_CLIENT_SECRET=
BIM_APS_ACTIVITY_ID=
BIM_APS_BASE_URL=https://developer.api.autodesk.com/da/us-east/v3
BIM_APS_TOKEN_URL=https://developer.api.autodesk.com/authentication/v2/token
BIM_APS_SCOPES=code:all data:read data:write
BIM_APS_POLL_MS=10000
BIM_APS_TIMEOUT_MS=3600000
BIM_APS_CHECK_INPUT_URL=
BIM_APS_CHECK_OUTPUT_URL=
BIM_JOB_STALE_MINUTES=30
BIM_JOB_SWEEP_INTERVAL_MS=60000
BIM_JOB_CREATE_LOCK_TIMEOUT_SECONDS=8
BIM_JOB_SSE_POLL_MS=1500
BIM_JOB_SSE_RETRY_MS=3000
BIM_ARTIFACT_STORAGE_DIR=data/bim-artifacts
BIM_ARTIFACT_MAX_BYTES=5242880
BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS=
BIM_SMOKE_BASE_URL=http://127.0.0.1:5500/
BIM_SMOKE_PROJECT_ID=
BIM_SMOKE_SESSION_COOKIE=
BIM_SMOKE_STRICT=false
BIM_BRIDGE_SMOKE_BASE_URL=http://127.0.0.1:5500/
BIM_BRIDGE_SMOKE_API_KEY=
BIM_BRIDGE_SMOKE_PROJECT_ID=
BIM_BRIDGE_SMOKE_SESSION_COOKIE=
BIM_BRIDGE_SMOKE_CREATE_JOB=
BIM_BRIDGE_SMOKE_COMMAND_TYPE=api-smoke-cloud-model-analysis
BIM_BRIDGE_SMOKE_STRICT=false
BIM_BRIDGE_E2E_SMOKE_BASE_URL=http://127.0.0.1:5500/
BIM_BRIDGE_E2E_SMOKE_API_KEY=
BIM_BRIDGE_E2E_SMOKE_PROJECT_ID=
BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE=
BIM_BRIDGE_E2E_REQUESTED_BY=
BIM_BRIDGE_E2E_SMOKE_STRICT=false
BIM_READINESS_CHECK_REVIT_SETTINGS=true
BIM_REVIT_SETTINGS_PATH=
BIM_READINESS_CHECK_HEALTH=true
BIM_READINESS_STRICT=false
ACCESS_CONTROL_ENABLED=true
ACCESS_GOOGLE_AUTH_ENABLED=true
GOOGLE_AUTH_CLIENT_ID=
ACCESS_SUPERADMIN_EMAIL=rjason381@gmail.com
ACCESS_SESSION_TTL_HOURS=12
```

El backend crea o actualiza el esquema `MTRD_*` desde `sql/mysql/001_mtrd_itemicostos_real.sql` al iniciar, incluyendo `MTRD_UsuarioAcceso` y `MTRD_SesionAcceso` para acceso por lista manual y sesiones web.

## Inicio

1. Instala dependencias con `npm install`.
2. Completa las variables MySQL en `.env`.
3. Para desarrollo frontend ejecuta `npm run dev` y, en otra consola, `npm run server`.
4. Para produccion local ejecuta `npm run build` y luego `npm start`.
5. Abre `http://127.0.0.1:5500/`.

## Google login

El login web usa Google Identity Services. En Google Auth Platform se debe usar el OAuth client `mtr2` y configurar como origenes JavaScript autorizados:

- `https://mtrd-43439691593.us-central1.run.app`
- `https://mtrd-zejtguyltq-uc.a.run.app`
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5500`
- `http://127.0.0.1:5500`

El acceso es por lista manual en `MTRD_UsuarioAcceso`. El superadmin inicial es `rjason381@gmail.com`.

## Hostear desde una PC de la oficina

Para que otras PCs abran Quantiva desde la maquina host:

1. En la PC host, usar en `.env`:

```env
HOST=0.0.0.0
PORT=5500
MYSQL_HOST=127.0.0.1
```

2. Ejecutar `npm start` en la PC host y dejar esa ventana/proceso activo.
3. Abrir el puerto `5500` en el Firewall de Windows para la red privada.
4. Desde otra PC de la misma red, abrir `http://IP-DE-LA-PC-HOST:5500/`.
5. En el add-in de Revit de cada usuario, configurar `web.baseUrl` en `itemicostos-metrado-export.settings.json` con esa misma URL.

Ejemplo:

```json
"web": {
  "baseUrl": "http://192.168.68.120:5500/",
  "autoStartLocalServer": false,
  "timeoutSeconds": 8
}
```

No se recomienda abrir MySQL directo a internet. Para acceso fuera de la oficina, usar VPN o publicar la app por HTTPS y mantener MySQL privado.

## Relacion con REVIT-MODEL-AUDITOR

Esta carpeta trabaja junto con `../REVIT-MODEL-AUDITOR`:

- `ITEMICOSTOS` / `Quantiva` es la app web de itemizado, presupuesto, usuarios y persistencia MySQL.
- `REVIT-MODEL-AUDITOR` es el add-in de Revit que audita modelos, prepara codificacion y devuelve metrados BIM.
- La ventana `Presupuesto BIM` del add-in incrusta Quantiva mediante WebView2 apuntando a `web.baseUrl` en `itemicostos-metrado-export.settings.json`; por defecto es `http://127.0.0.1:5500/`.
- El boton `Verificar codificaciones` del add-in compara las `CODIFICACIONxx` del modelo Revit contra `MTRD_Item_Codificacion` del proyecto activo.
- El boton `Importar costos` del add-in, tanto en el ribbon como dentro de la pestana `Presupuesto`, lee el proyecto activo de esta app directamente por `GET /api/revit/import-state`; ya no requiere seleccionar un Excel para importar codigo, descripcion, unidad y costo hacia Revit.
- El boton `Crear Tablas` del add-in tambien lee el proyecto activo por `GET /api/revit/import-state`; ya no requiere seleccionar un Excel para crear/actualizar tablas de planificacion por codificacion y nivel.
- La vista `Control BIM` muestra partidas listas para Revit, codificaciones faltantes/duplicadas, metrados BIM recibidos, diferencias contra metrado tradicional y el ultimo lote Revit.
- Las exportaciones Excel de esta app quedan como salida externa de revision o intercambio; no son entrada principal del add-in.
- Google Sheets ya no forma parte del flujo activo de metrados.

Contrato compartido entre ambos aplicativos:

1. El proyecto se identifica con `project.id` en la app web y con `MTRD_Proyecto_UID` en MySQL.
2. La partida se cruza por `codificacion` en la app web y `MTRD_Item_Codificacion` en MySQL.
3. El valor BIM que vuelve desde Revit se guarda en `metradoBim` / `MTRD_Item_MetradoBim`.
4. Para llevar costos y tablas desde Quantiva hacia Revit, los comandos `Importar Costos` y `Crear Tablas` leen `GET /api/revit/import-state`, toman el proyecto activo y recorren sus `rows[]`.
5. Cada fila usada por esos comandos entrega `codigoPartida`, `codificacion`, `descripcion`, `unidad` y `costo`. `codigoPartida` se calcula en el backend con el mismo criterio visual de la grilla (`1`, `1.1`, `1.1.1`, etc.) y el add-in no lo deriva.
6. `Importar Costos` escribe codigo, descripcion, unidad y costo en los parametros del nivel Revit coincidente. `Crear Tablas` crea/actualiza tablas de planificacion por codificacion y nivel usando la misma data.
7. Para traer metrados desde Revit, el add-in lee parametros del modelo y envia el lote a `POST /api/revit/export`, cruzando cada fila por `MTRD_Item_Codificacion`.
8. La escritura MySQL de metrados BIM vive en el backend de esta app; el add-in no necesita credenciales MySQL para la exportacion activa.
9. El guardado web usa upsert por UID y conserva el `MTRD_Item_MetradoBim` existente para filas ya exportadas, de modo que una web abierta con datos antiguos no pisa un lote Revit reciente.

`GET /api/revit/import-state` es por tanto el contrato compacto para que Revit importe costos, verifique codificaciones, cree tablas y resuelva el proyecto destino antes de exportar metrado sin archivos intermedios. A diferencia de `GET /api/state`, no envia auditoria, snapshots ni otros datos de la web. Si `REVIT_INGEST_API_KEY` esta configurado, este endpoint tambien acepta la llave por header `X-Itemicostos-Key` o `X-Api-Key` para uso del add-in. La respuesta esperada mantiene esta forma:

```json
{
  "currentProjectId": "uid-del-proyecto",
  "projectId": "uid-del-proyecto",
  "projectName": "EIMI",
  "rows": [
    {
      "level": 2,
      "codigoPartida": "1.1.1",
      "codificacion": "2.2.1.1",
      "descripcion": "CONCRETO PREMEZCLADO",
      "unidad": "m3",
      "costo": "0.000000",
      "tipoMetrado": "Revit",
      "reglaMetrado": ""
    }
  ]
}
```

Regla permanente: cualquier cambio en nombres de columnas, campos JSON, tablas `MTRD_*`, endpoints, comandos o flujo de intercambio debe escribirse siempre en este README y tambien en el README de `REVIT-MODEL-AUDITOR` para que ambos lados queden sincronizados.

## Flujo S10 en presupuesto

El estado principal `GET/PUT /api/state` incluye campos adicionales para trabajar el presupuesto con un flujo tipo S10:

- `project.budgetSettings`: porcentajes de gastos generales, utilidad, IGV y bandera `includeIgv`.
- `project.polynomialGroups`: grupos/indices para formula polinomica.
- `project.resourceCatalogItems[].polynomialGroupId`: grupo polinomico asignado a cada recurso.
- `row.metradoItems[]`: lineas de hoja de metrado por partida con `descripcion`, `veces`, `largo`, `ancho`, `alto` y `parcial`.
- `row.apuItems[].subpartidaId`: referencia opcional a otra partida/subpartida usada como insumo APU.
- `snapshot.snapshotType`: `manual`, `venta`, `meta` o `linea-base`.

La persistencia MySQL agrega `MTRD_PresupuestoConfig`, `MTRD_ItemMetrado`, `MTRD_GrupoPolinomico`, `MTRD_RecursoCatalogo_GrupoPolinomicoUID` y `MTRD_ItemApuInsumo_SubpartidaUID`. El backend recalcula metrados desde las lineas, resuelve subpartidas APU y conserva el contrato compacto de Revit.

`GET /api/revit/import-state` no cambia para el add-in: sigue entregando `codigoPartida`, `codificacion`, `descripcion`, `unidad` y `costo` por fila. Los reportes Excel de presupuesto ahora pueden incluir hojas de Presupuesto, APU, Recursos, Metrados, Pie y Formula Polinomica como salida de revision.

## Jobs BIM fluidos

Para procesos BIM pesados, `ITEMICOSTOS` expone una cola asincrona en MySQL. En la UI operativa de Control BIM el usuario crea jobs solo para `Revit activo`; `cloud-model` queda como capacidad backend/worker reservada para pruebas, automatizaciones o fase cloud.

- `POST /api/bim/jobs`: crea un job con `projectId`, `targetMode`, `commandType`, `payload` y `modelIdentity`. Rechaza comandos `*-apply`/`:apply` y combinaciones contradictorias entre `targetMode` y `commandType`; la aplicacion Revit solo se crea desde `POST /api/bim/jobs/:id/apply` despues de un preview completado.
- `GET /api/bim/jobs?projectId=...`: lista jobs recientes del proyecto.
- `GET /api/bim/jobs/summary?projectId=...`: resume la cola por estado, destino, fallos y antiguedad del activo mas viejo.
- `GET /api/bim/jobs/:id`: consulta un job.
- `GET /api/bim/jobs/:id/events`: envia progreso por SSE para la web.
- `POST /api/bim/jobs/:id/cancel`: cancela jobs no finalizados.
- `POST /api/bim/jobs/:id/retry`: crea un nuevo job desde un job finalizado y fuerza reproceso, salvo jobs de aplicacion `*-apply`/`:apply`; para aplicar cambios otra vez se debe volver al preview y confirmar una nueva aplicacion.
- `POST /api/bim/jobs/:id/apply`: crea un job `active-revit-apply` desde un preview Revit completado para aplicar cambios confirmados por el usuario.
- `GET /api/bim/readiness`: expone un readiness redactado del backend BIM para web, bridge o diagnostico. Acepta sesion de usuario o la API key del bridge; informa si `REVIT_INGEST_API_KEY`, worker cloud, SSE, artefactos y APS estan configurados sin devolver secretos.
- `GET /api/bim/jobs/:id/artifacts`: lista artefactos persistidos del job.
- `GET /api/bim/jobs/:id/artifacts/:artifactId/download`: descarga un artefacto del job con validacion de sesion y acceso al proyecto.
- `GET /api/bim/bridge/summary?projectId=...`: resume la cola del proyecto y la presencia reciente del bridge para diagnostico usando la API key, sin requerir cookie web. `npm run bim:readiness` lo usa para detectar jobs `active-revit` esperando porque Revit no esta reclamando o porque el modelo abierto no coincide.
- `GET /api/bim/bridge/commands`: el bridge de Revit o worker reclama jobs en cola. Por defecto usa `targetMode=active-revit`; un worker cloud usa `targetMode=cloud-model` y puede enviar `workerId`. Tambien acepta `commandType` para que probes o workers especializados reclamen solo una clase de comando. Cada consulta `active-revit` registra un heartbeat liviano en `MTRD_BimBridgeHeartbeat`, con TTL configurable por `BIM_BRIDGE_PRESENCE_TTL_SECONDS`, para que la UI sepa si Revit esta abierto aunque no haya job tomado. El bridge Revit envia `modelGuid`, `documentUid`, `modelPath` y `requestedBy` del usuario Google activo para que el backend no entregue jobs de otro modelo, valide el alcance del usuario y el log conserve quien tomo el trabajo. Si un claim `active-revit` no trae `modelGuid`, `documentUid` ni `modelPath`, el backend responde `400` en vez de devolver una cola ambigua.
- `POST /api/bim/bridge/jobs/:id/progress`: Revit o un worker reporta `bridgeId`/`workerId`, `status`, `stage`, `percent`, `message`, `result` y `error`. Si el job ya fue tomado por otro bridge/worker, el backend responde `409 BIM_JOB_OWNERSHIP_MISMATCH` y no modifica el job.
- `POST /api/bim/bridge/jobs/:id/artifacts`: Revit o un worker registra artefactos de entrada/salida. Puede subir contenido embebido para guardarlo como `local://` o registrar referencias `cloud-storage`/`aps` mediante `storageProvider`, `storageUri`, `sizeBytes` y `checksumSha256`. Requiere que el job ya haya sido reclamado por ese mismo `bridgeId`/`workerId`; si el job no fue tomado o fue tomado por otro ejecutor, responde `409 BIM_JOB_OWNERSHIP_MISMATCH`.
- `GET|POST /api/bim/bridge/jobs/:id/operations`: el bridge pagina operaciones pesadas de `applyPlan` en MySQL para no cerrar un preview con un JSON gigante. Usa el mismo ownership por `bridgeId`/`workerId`; si el job ya esta `completed`, `failed` o `cancelled`, el backend responde `409` y no acepta operaciones tardias.

Estados permitidos: `queued`, `claimed`, `running`, `applying`, `completed`, `failed`, `cancelled`. La persistencia usa `MTRD_BimJob`, `MTRD_BimJobLog`, `MTRD_BimJobCache` y `MTRD_BimBridgeHeartbeat`. Los endpoints del bridge usan la misma llave `REVIT_INGEST_API_KEY` por `X-Itemicostos-Key`; el add-in Revit debe configurar `web.ingestApiKey` con ese valor para reclamar/reportar jobs. La sesion Google del add-in habilita comandos locales y, para claims `active-revit` hechos con API key, el backend valida que `requestedBy` exista como usuario activo y tenga acceso al proyecto del job.

En el add-in, los comandos BIM solo reclaman jobs si hay sesion Google valida. El correo se envia como `requestedBy` al reclamar el job y queda en `MTRD_BimJobLog` junto al `bridgeId`; si el bridge no envia `projectId`, el backend igualmente filtra la cola por los proyectos asignados a ese usuario para que Revit no reciba comandos de otro alcance.

Cada job expone `createdAt`, `claimedAt`, `updatedAt`, `completedAt` y metricas derivadas `queueWaitSeconds`, `runSeconds` y `totalSeconds`. La UI las muestra para distinguir si un flujo esta lento por espera en cola, procesamiento Revit/worker o carga de artefactos.

El job `active-revit-preview` es procesado por el add-in mediante `ExternalEvent`, fuera del click del ribbon, en lotes pequenos. La web y `POST /api/bim/jobs` solo crean previews `active-revit` cuando `modelIdentity` conserva una identidad estable del modelo (`modelGuid`, `documentUid` o `modelPath`); si el proyecto aun no tiene esa identidad desde Revit, el backend responde `400` y no ensucia la cola. Si `web.autoClaimBimJobs=true` en `REVIT-MODEL-AUDITOR`, el add-in reclama jobs automaticamente desde `Idling` cada `web.bimJobPollSeconds`; el reclamo HTTP ocurre fuera del hilo UI, exige `web.ingestApiKey`, y el trabajo sobre el modelo siempre entra por `ExternalEvent`. Si el backend o la red fallan durante el reclamo automatico, Revit aplica backoff exponencial de 15s hasta 300s y el boton manual `Jobs BIM` sigue disponible para diagnostico inmediato. El payload puede incluir `batchSize`; la web envia 250 por defecto y el add-in lo limita entre 25 y 5000. Entre lotes, el runner espera 25 ms y levanta otro `ExternalEvent`, por eso Revit recupera el hilo UI y consulta el estado del job antes de cada lote para respetar una cancelacion hecha desde la web. Cuando el preview termina y su resultado declara `requiresApplyConfirmation=true` o `applyEligible=true`, la web muestra `Aplicar en Revit`; esa confirmacion crea un segundo job `active-revit-apply`, tambien asincrono y por lotes, para separar analizar de aplicar. El modo `cloud-model` queda encolado para la fase worker/APS.

El job `active-revit-apply` solo se crea desde un preview completado que conserve identidad estable del modelo (`modelGuid`, `documentUid` o `modelPath`) y confirma cada lote dentro de una `Transaction` independiente de Revit. La creacion usa un lock por `previewJobId`; si llega una solicitud duplicada desde el mismo preview, el backend devuelve el apply ya existente en vez de insertar otro. Si una transaccion no inicia, no confirma o falla, el bridge marca el job como `failed` con etapa `Error de transaccion`; si termina correctamente, el `result` reporta `applyTransactionMode="per-batch"`, `committedApplyBatches`, `plannedBatches`, `plannedCancellationChecks`, `yieldDelayMs`, `averageBatchDurationMs`, `maxBatchDurationMs`, `totalBatchDurationMs` y `fluencyStatus`. La web muestra la fluidez como `ok`, `warning` o `critical`; por defecto un lote mayor o igual a 750 ms dispara alerta y uno mayor o igual a 2000 ms dispara estado critico.

Antes de entregar un job `active-revit`, el backend compara la identidad esperada (`modelGuid`, `documentUid` y `modelPath`) con el documento activo que reporta el bridge. Si no hay coincidencia comparable, el job queda en cola para el Revit correcto. Como segunda barrera, antes de procesar un job, el add-in vuelve a comparar la identidad y, si no coincide, reporta `failed` con etapa `Modelo incorrecto` sin recorrer ni aplicar elementos.

El cache de resultados BIM se activa cuando `modelIdentity` trae una identidad estable del modelo (`modelGuid`, `documentUid`, `documentVersion`, `revitExportUid` o `modelPath` + `exportedAt`). La clave combina proyecto, destino, comando, version del modelo y opciones semanticas del `payload`; campos de control como `batchSize`, `forceRefresh`, `retryOf` y `cacheMode` no cambian la clave. Si se envia `payload.forceRefresh`, `payload.useCache=false` o `payload.cacheMode="refresh"`, el backend omite la lectura del cache y crea un job nuevo; `cacheMode="refresh"` vuelve a escribir el resultado para comandos cacheables, mientras `cacheMode="skip"`, `cacheMode="off"` y los jobs `*-apply` no se persisten en cache. Los resultados completados de `active-revit-*` tampoco se persisten como cache terminado, porque un preview puede traer un `applyPlan` atado al job original; para ese caso solo se reutiliza un job activo equivalente que todavia este en cola o proceso.

Con esa misma clave semantica, el backend reutiliza un job activo equivalente antes de insertar otro registro: si ya existe un `queued`, `claimed`, `running` o `applying` del mismo proyecto/modelo/comando, la nueva solicitud devuelve ese job y agrega un log de reutilizacion. Esto evita duplicar analisis BIM pesados por doble click o reintentos de UI tanto para `cloud-model` como para `active-revit-preview`; para reprocesar de verdad se usa `forceRefresh` o `cacheMode="refresh"`. La creacion se serializa con `GET_LOCK` de MySQL por hash semantico durante `BIM_JOB_CREATE_LOCK_TIMEOUT_SECONDS` segundos para cerrar carreras de solicitudes simultaneas sin bloquear la tabla completa.

Si Revit pierde conexion al reportar progreso, el runner detiene el job localmente e intenta marcarlo como `failed` con etapa `Perdida de red`. Si ni siquiera puede enviar ese fallo, muestra el aviso local y deja que el backend lo resuelva por heartbeat. El backend barre jobs activos sin heartbeat (`claimed`, `running`, `applying`) y los marca `failed` para evitar procesos colgados por perdida de red, cierre inesperado de Revit o caida del worker. La regla vive en dominio (`bim-job-stale-domain.mjs`), registra en el log que bridge/worker tenia tomado el job y aparece en `/api/bim/readiness`. El umbral se controla con `BIM_JOB_STALE_MINUTES` y la frecuencia con `BIM_JOB_SWEEP_INTERVAL_MS`. Los jobs `queued` no expiran: se quedan esperando a que Revit o el worker esten disponibles.

El resumen `GET /api/bim/jobs/summary` separa los `active-revit` en cola de los que ya estan `claimed`, `running` o `applying` y adjunta `bridgePresence`. La UI muestra `Bridge`, `Revit cola`, `Revit proc.` y `Espera Revit`; si un job `active-revit` lleva mas de 2 minutos sin ser reclamado avisa `Esperando Revit Bridge`, y despues de 10 minutos lo eleva a `Revit cerrado o bridge detenido`. Si `bridgePresence.online=true`, el aviso cambia a revisar el modelo/identidad activa, porque Revit esta abierto pero no puede tomar ese job. Esto permite distinguir un job que fallo de uno que simplemente espera a que Revit este abierto con el bridge autenticado.

Ademas del barrido por heartbeat, el worker cloud reporta `failed` inmediatamente si un job reclamado falla durante procesamiento o carga de artefactos. Asi la UI ve el error real sin esperar el timeout de stale jobs.

Antes de subir artefactos o marcar `completed`, el worker envia un checkpoint `running` de cierre. Si el usuario cancelo el job en esa ventana, el backend devuelve el estado final y el worker se detiene sin publicar artefactos ni completar el job. Cualquier progreso tardio reportado sobre un job `completed`, `failed` o `cancelled` se ignora y devuelve el estado actual; como defensa adicional, `POST /api/bim/bridge/jobs/:id/artifacts` y `POST /api/bim/bridge/jobs/:id/operations` rechazan con `409` cualquier intento de registrar datos tardios cuando el job ya esta finalizado.

La UI sigue por SSE hasta 4 jobs BIM activos en paralelo y coalescea eventos de progreso por job cada `120ms`, con flush inmediato cuando un job termina, falla o se cancela. Esto evita renders por cada lote cuando Revit o un worker reportan cientos de avances, pero mantiene la percepcion de progreso en vivo incluso con jobs `active-revit` y `cloud-model` coexistiendo. La capa de aplicacion mide esa carga con `summarizeBimJobRealtimePanelLoad`: cuenta eventos crudos, commits reales, reduccion de renders, maximo de commits por segundo y si el panel queda dentro del presupuesto de fluidez. El backend emite `ping` cuando el job no cambia y anuncia `retry` para reconexion del navegador; `BIM_JOB_SSE_POLL_MS` controla la frecuencia de consulta y `BIM_JOB_SSE_RETRY_MS` el backoff inicial del `EventSource`.

Los artefactos de jobs BIM se guardan en `MTRD_BimJobArtifact` y en disco local bajo `BIM_ARTIFACT_STORAGE_DIR` cuando llegan con contenido embebido. Cada registro incluye proveedor, URI, tamano, SHA-256 y metadata. La UI descarga los archivos mediante el endpoint seguro de artefactos, no mediante la ruta `local://`. Si un worker APS registra un `storageUri` HTTPS firmado para `cloud-storage` o `aps`, el backend solo redirige la descarga cuando el host esta incluido en `BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS`. En produccion, esta capa debe apuntar a Cloud Storage y conservar el mismo contrato de API para que la UI y los workers no cambien.

### Worker BIM cloud

Primera version local/simulable del worker cloud:

```powershell
npm run worker:bim:check
npm run worker:bim:check-live
npm run worker:bim:list-activities
npm run bim:fluency-check
npm run worker:bim:load-test
npm run bim:setup-local -- --generate-bridge-key
npm run bim:prepare-smoke -- --session-cookie <cookie>
npm run bim:readiness
npm run bim:revit-session
npm run bim:realtime-load-test
npm run bim:api-smoke
npm run bim:bridge-smoke
npm run bim:bridge-e2e-smoke
npm run worker:bim:once
npm run worker:bim
```

El worker reclama jobs `cloud-model` con `commandType=cloud-model-analysis` por defecto, procesa lotes simulados, sube un manifiesto/reporte como artefactos del job y reporta progreso por la misma API del bridge. Cada lote cloud actualiza `processedBatches`, `plannedBatches`, `recordedBatchCount`, `lastBatchDurationMs`, `averageBatchDurationMs`, `maxBatchDurationMs`, `totalBatchDurationMs`, `yieldDelayMs` y `fluencyStatus`; la UI usa el mismo semaforo de Revit (`ok`, `warning`, `critical`) con alerta desde 750 ms y critico desde 2000 ms. Usa `BIM_WORKER_API_KEY` o `REVIT_INGEST_API_KEY`; para pruebas de carga se puede ajustar `BIM_WORKER_SIMULATED_ELEMENTS` a `10000`, `50000` o `100000`. Si se necesita un worker especializado, `BIM_WORKER_COMMAND_TYPE` permite filtrar otra clase de comando. Si el backend o la red fallan en el loop del worker, el polling aplica backoff exponencial desde `BIM_WORKER_POLL_MS` hasta `BIM_WORKER_ERROR_BACKOFF_MAX_MS` y vuelve al intervalo normal cuando un ciclo responde correctamente. Esta capa representa el punto donde luego se conectara Autodesk Platform Services Design Automation y Cloud Storage.

`BIM_WORKER_PROVIDER=simulated-aps` es el proveedor operativo local. El proveedor `aps-design-automation` usa OAuth v2, crea work items en `BIM_APS_BASE_URL`, consulta su estado respetando un minimo de polling de 2 segundos y registra como artefactos el manifiesto, estado del work item y `reportUrl` cuando APS lo devuelve. Si Itemicostos devuelve un estado terminal (`cancelled`, `failed` o `completed`) mientras se monitorea un work item, el worker se detiene sin subir artefactos ni marcar `completed` tarde; solo cuando el estado remoto es `cancelled` intenta cancelar remotamente APS con `DELETE workitems/:id` de forma best-effort. Para ejecutar APS real se debe configurar `BIM_APS_CLIENT_ID`, `BIM_APS_CLIENT_SECRET`, `BIM_APS_ACTIVITY_ID`, `BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS`, URLs/scopes y enviar `payload.apsArguments` o `payload.apsWorkItem.arguments` compatibles con la activity publicada.

Para jobs reales `cloud-model` en APS, el worker normaliza alias comunes del payload: `apsInputUrl`, `inputRvtUrl`, `inputModelUrl` o `modelUrl` se convierten en `inputRvt` con `verb="get"`; `apsOutputUrl`, `outputZipUrl`, `outputUrl`, `resultUrl` o `resultZipUrl` se convierten en `resultZip` con `verb="put"`. Tambien acepta mapas `apsInputs` y `apsOutputs`, o el contrato completo en `apsArguments`/`apsWorkItem.arguments`. Antes de crear el work item real, valida que exista al menos un input HTTPS y un output HTTPS; si faltan, falla temprano con un mensaje claro y no consume APS.

Para que `npm run worker:bim:check` valide el contrato ejecutable de APS sin crear work items, configura `BIM_APS_CHECK_INPUT_URL` y `BIM_APS_CHECK_OUTPUT_URL` con URLs HTTPS firmadas de prueba. El JSON de readiness muestra `workItemContract.readyForExecution`, nombres de argumentos y el `workItemPreview` con queries/headers sensibles redactados; en modo `aps-design-automation`, el comando sale con codigo distinto de cero si falta input u output.

Antes de reclamar jobs reales, `npm run worker:bim:check` valida el proveedor configurado sin conectarse a la cola ni a APS. En modo APS imprime un JSON con endpoints, polling, scopes y un preview del work item con tokens/secretos redactados; si faltan credenciales o activity, termina con codigo distinto de cero.

`npm run worker:bim:check-live` es el preflight con red para APS real: solicita token OAuth y lee la activity configurada, pero no crea work items ni consume modelos. Usalo antes de poner `BIM_WORKER_PROVIDER=aps-design-automation` en un worker que reclame jobs reales. Si APS responde que el `client_id` no tiene acceso al producto API, el reporte devuelve `product-access-missing` y las mismas acciones de habilitacion de Automation API / Design Automation API.

`npm run worker:bim:list-activities` solicita token OAuth y lista las activities APS disponibles para la app, sin crear work items ni imprimir secretos. Usalo cuando ya tienes `BIM_APS_CLIENT_ID` y `BIM_APS_CLIENT_SECRET`, pero falta `BIM_APS_ACTIVITY_ID`; si solo encuentra una activity, devuelve el comando `npm run bim:setup-local -- --enable-aps --aps-activity-id ...` sugerido para completar `.env`. Si APS responde `The client_id specified does not have access to the api product`, habilita Automation API / Design Automation API en la app del Client ID dentro de Autodesk Platform Services y vuelve a ejecutar el comando.

`npm run bim:readiness` concentra el preflight de produccion BIM: lee `.env`, consulta `/api/health`, revisa la ultima evidencia de `npm run bim:fluency-check` guardada en `data/bim-fluency-check.json`, si hay API key para worker/bridge, si existen cookie/proyecto/correo de usuario para los smokes web y Revit, si el JSON local de Revit tiene `web.ingestApiKey` sincronizado con `REVIT_INGEST_API_KEY`, si la sesion local de Revit cargo la misma DLL indicada por el manifiesto `.addin`, y si APS tiene `BIM_APS_CLIENT_ID`, `BIM_APS_CLIENT_SECRET`, `BIM_APS_ACTIVITY_ID` y hosts permitidos para redirigir artefactos remotos. La evidencia de fluidez debe incluir los checks `cloud-worker-load`, `web-realtime-load`, `revit-batch-plan`, `revit-bridge-backoff`, `revit-cancellation-probe` y `revit-transaction-failure`; un JSON antiguo sin alguno de ellos queda como `BIM_FLUENCY_CHECK_REQUIRED_CHECKS`. Devuelve `readyForRealValidation`, `backendHealthReady`, `localFluencyReady`, `activeRevitE2eReady`, `apsLiveReady`, `artifactDownloadsReady`, `revitBridgeLocalSettingsReady`, `missing` y `nextCommands`; si `/api/health` no responde, agrega `ITEMICOSTOS_BACKEND_HEALTH` y sugiere `npm run server`; si la sesion Revit cargo una DLL antigua, agrega `REVIT_ADDIN_RESTART_REQUIRED` y sugiere cerrar/abrir Revit; si falta la descarga de artefactos APS, sugiere `npm run bim:setup-local -- --artifact-redirect-hosts <host>`. Por defecto no falla el proceso si faltan secretos; usa `BIM_READINESS_STRICT=true` para hacerlo obligatorio en CI. Si el settings de Revit vive en otra ruta, usa `BIM_REVIT_SETTINGS_PATH`; si el reporte de fluidez vive en otra ruta, usa `BIM_FLUENCY_REPORT_PATH`; para omitir el chequeo de settings local, usa `BIM_READINESS_CHECK_REVIT_SETTINGS=false`; para omitir la inspeccion de la sesion Revit, usa `BIM_READINESS_CHECK_REVIT_SESSION=false`; para omitir el reporte de fluidez, usa `BIM_READINESS_CHECK_FLUENCY_REPORT=false`; para omitir `/api/health`, usa `BIM_READINESS_CHECK_HEALTH=false`.

`npm run bim:revit-session` inspecciona la sesion local de Revit en Windows: verifica si `Revit.exe` esta abierto, lee el manifiesto `%AppData%\Autodesk\Revit\Addins\<version>\RevitModelAudit.addin`, valida que la DLL indicada exista y compara esa ruta con la DLL `RevitModelAudit` que el proceso Revit ya tiene cargada. Si el manifiesto fue actualizado mientras Revit seguia abierto, devuelve `restart-required` y `REVIT_ADDIN_RESTART_REQUIRED`; en ese caso hay que cerrar y abrir Revit para que el bridge nuevo empiece a enviar heartbeat. Usa `BIM_REVIT_VERSION=2025` para cambiar version y `BIM_REVIT_SESSION_STRICT=true` para fallar el comando cuando el estado no sea `ready`.

`npm run bim:setup-local -- --generate-bridge-key` prepara `.env` para pruebas reales sin imprimir secretos: genera `REVIT_INGEST_API_KEY` si falta, deriva `BIM_WORKER_API_KEY`, `BIM_BRIDGE_SMOKE_API_KEY` y `BIM_BRIDGE_E2E_SMOKE_API_KEY`, y sincroniza proyecto/cookie/correo smoke hacia el bridge y el E2E cuando ya existen. Si necesitas invalidar la llave local anterior, usa `npm run bim:setup-local -- --rotate-bridge-key`; el resumen solo muestra nombres de variables rotadas. Para smokes reales, puedes cargar la sesion de un usuario editor con `--smoke-project-id`, `--smoke-session-cookie` y `--smoke-user-email`; si bridge/E2E estan vacios, se derivan desde esos valores. Tambien existen flags mas especificos: `--bridge-smoke-project-id`, `--bridge-smoke-session-cookie`, `--bridge-e2e-project-id`, `--bridge-e2e-session-cookie` y `--bridge-e2e-requested-by`. Si se pasan `BIM_APS_CLIENT_ID`, `BIM_APS_CLIENT_SECRET` o `BIM_APS_ACTIVITY_ID` como variables de entorno del proceso, las escribe en `.env` y el resumen solo muestra nombres de variables actualizadas. Tambien puedes configurar APS real con flags: `npm --silent run bim:setup-local -- --enable-aps --aps-activity-id owner.app+activity --aps-check-input-url https://.../input.rvt --aps-check-output-url https://.../output.zip` o, si necesitas reemplazar credenciales, `--aps-client-id`, `--aps-client-secret` y `--worker-provider aps-design-automation`; usa `npm --silent` cuando pases URLs firmadas por argumentos porque npm normal imprime la linea del comando antes de ejecutar. Cuando se configura `--aps-check-output-url`, el host HTTPS del output se agrega a `BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS` si no estaba cubierto. El resumen sigue redactado. Usa `--dry-run` para ver el resumen sin escribir el archivo.

`npm run bim:prepare-smoke -- --session-cookie <cookie>` valida una cookie real contra `/api/auth/web/session`, consulta `/api/state`, elige un proyecto accesible y escribe en `.env` `BIM_SMOKE_PROJECT_ID`, `BIM_SMOKE_SESSION_COOKIE`, `BIM_SMOKE_USER_EMAIL` y sus derivados bridge/E2E sin imprimir la cookie. Acepta `--project-id <uid>`, `--requested-by <email>`, `--base-url <url>` y `--dry-run`. La sesion debe pertenecer a un usuario `editor`, `admin` o `superadmin` porque los smokes crean jobs.

`npm run bim:fluency-check` es la compuerta local recomendada para fluidez BIM: ejecuta la prueba 10k/50k/100k del worker cloud, la carga realtime de la UI, el probe C# de `BimJobBatchPlanner`, el probe C# de backoff del bridge, el probe de cancelacion/red y el probe de fallo parcial de transaccion sin abrir Revit. Devuelve un JSON unico con `ok`, `status`, `summary` y `checks`, lo guarda en `data/bim-fluency-check.json` para que `bim:readiness` lo lea, y falla si cualquiera de las capas rompe su presupuesto.

`npm run worker:bim:load-test` ejecuta una prueba local sin backend ni Revit para los tamanos `BIM_WORKER_LOAD_TEST_SIZES` (`10000,50000,100000` por defecto) y valida lotes, progreso monotono, artefactos simulados y resultado final. Sirve como prueba rapida de fluidez del worker antes de pasar a jobs reales.

`npm run bim:realtime-load-test` ejecuta una prueba local sin backend ni navegador para la carga de eventos de la UI BIM. Por defecto simula 4 jobs, 2500 eventos por job, eventos cada 5 ms y flush de 120 ms; reporta `eventCount`, `commitCount`, `renderReductionPercent`, `maxCommitsPerSecond` y `withinCommitBudget`. Sirve para validar que el panel conserve fluidez aunque Revit y cloud reporten miles de avances.

Para validar la capa C# del add-in sin abrir Revit, `REVIT-MODEL-AUDITOR` incluye un probe de planificacion de lotes:

```powershell
npm run revit:bim-batch-plan
```

Ese comando usa el mismo `BimJobBatchPlanner` que ejecuta el bridge y valida 10k, 50k y 100k elementos con lote 250, `yieldDelayMs=25`, un punto de cancelacion por lote y un `ExternalEvent`/yield por lote.

Tambien se puede validar solo el backoff del reclamo automatico del bridge:

```powershell
npm run revit:bim-bridge-backoff
```

Ese comando usa `BimJobBridgeBackoffPlanner` desde Core y verifica que los fallos de reclamo suban de 15s hasta el tope de 300s.

Cuando APS devuelve argumentos de salida con URL HTTPS (`url`, `href`, `signedUrl` o `storageUri`), el worker los registra como artefactos remotos `aps`. La descarga sigue pasando por `GET /api/bim/jobs/:id/artifacts/:artifactId/download`; para redirigir a esas URLs firmadas el host debe estar incluido en `BIM_ARTIFACT_ALLOWED_REDIRECT_HOSTS`.

`npm run bim:api-smoke` prueba contra el backend local el flujo web de cola: health, crear job `cloud-model` con `commandType=api-smoke-cloud-model-analysis`, abrir `/events` y verificar el primer evento SSE con `retry` y metricas de tiempo, consultar job, resumen, cancelar, reintentar y cancelar el retry. Requiere `BIM_SMOKE_PROJECT_ID` y `BIM_SMOKE_SESSION_COOKIE` de un usuario editor; si faltan, se omite sin modificar datos salvo que `BIM_SMOKE_STRICT=true`.

`npm run bim:bridge-smoke` prueba el contrato del bridge/worker con API key y filtro de proyecto: health, reclamar un job `api-smoke-cloud-model-analysis`, reportar progreso, registrar un artefacto pequeno y marcarlo completado. Requiere `BIM_BRIDGE_SMOKE_API_KEY` o `BIM_WORKER_API_KEY`, ademas de `BIM_BRIDGE_SMOKE_PROJECT_ID` para no reclamar jobs de otro proyecto. Si tambien configuras `BIM_BRIDGE_SMOKE_SESSION_COOKIE`, el smoke crea su propio job cloud-model de prueba antes de reclamarlo; sin cookie, solo intenta reclamar un job smoke ya existente en cola. Si no hay llave, proyecto o job smoke en cola, se omite sin tocar jobs reales salvo que `BIM_BRIDGE_SMOKE_STRICT=true`.

`npm run bim:bridge-e2e-smoke` prueba el flujo completo web + bridge para `active-revit`: crea un job smoke con sesion editor, lo reclama con API key y `requestedBy`, verifica que otro bridge reciba `409 BIM_JOB_OWNERSHIP_MISMATCH`, reporta progreso valido, sube artefacto, lo marca completado y verifica el estado final. Requiere `BIM_BRIDGE_E2E_SMOKE_PROJECT_ID`, `BIM_BRIDGE_E2E_SMOKE_SESSION_COOKIE`, `BIM_BRIDGE_E2E_SMOKE_API_KEY` y `BIM_BRIDGE_E2E_REQUESTED_BY`; si faltan, se omite sin tocar datos salvo que `BIM_BRIDGE_E2E_SMOKE_STRICT=true`.

## Recepcion de metrado Revit

Este endpoint es el flujo activo de recepcion de metrados BIM desde el add-in. `Exportar Quantiva` envia los metrados a esta API y el backend escribe en MySQL.

Endpoint: `POST /api/revit/export`

Payload minimo:

```json
{
  "projectId": "uid-del-proyecto",
  "exportUid": "uuid-del-lote",
  "rows": [
    {
      "codificacion": "2.2.1.1",
      "codigoPartida": "2.2.1.1",
      "elementId": 123456,
      "elementUniqueId": "unique-id-revit",
      "categoria": "Muros",
      "familia": "Muro basico",
      "tipo": "Concreto 15cm",
      "cantidad": 12.45,
      "unidad": "m3",
      "parametros": {
        "source": "Modelo Revit",
        "sourceRow": 5
      }
    }
  ],
  "options": {
    "syncItemMetradoBim": true
  }
}
```

Si `REVIT_INGEST_API_KEY` esta definido en `.env`, el add-in debe enviar el mismo valor en `web.ingestApiKey` para autorizar la carga. Si no hay llave, el endpoint usa la sesion de Quantiva y permisos de proyecto.
