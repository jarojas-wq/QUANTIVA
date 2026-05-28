# MTR2 - Itemizado y Costos

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

Para que otras PCs abran ITEMICOSTOS desde la maquina host:

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

- `ITEMICOSTOS` / `MTR2` es la app web de itemizado, presupuesto, usuarios y persistencia MySQL.
- `REVIT-MODEL-AUDITOR` es el add-in de Revit que audita modelos, prepara codificacion y devuelve metrados BIM.
- La ventana `Presupuesto BIM` del add-in incrusta `ITEMICOSTOS` mediante WebView2 apuntando a `web.baseUrl` en `itemicostos-metrado-export.settings.json`; por defecto es `http://127.0.0.1:5500/`.
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
4. Para llevar costos y tablas desde Itemicostos hacia Revit, los comandos `Importar Costos` y `Crear Tablas` leen `GET /api/revit/import-state`, toman el proyecto activo y recorren sus `rows[]`.
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

## Recepcion de metrado Revit

Este endpoint es el flujo activo de recepcion de metrados BIM desde el add-in. `Exportar Itemicostos` envia los metrados a esta API y el backend escribe en MySQL.

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

Si `REVIT_INGEST_API_KEY` esta definido en `.env`, el add-in debe enviar el mismo valor en `web.ingestApiKey` para autorizar la carga. Si no hay llave, el endpoint usa la sesion de Itemicostos y permisos de proyecto.
