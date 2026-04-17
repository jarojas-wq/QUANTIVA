# Itemizado y Costos

Aplicativo web local para crear un itemizado jerarquico y editar presupuesto.

## Inicio

1. Instala dependencias con `npm install`.
2. Si vas a usar Google Sheets o MySQL, copia `.env.example` y completa variables.
3. Ejecuta `npm start`.
4. Abre `http://127.0.0.1:5500/`.

## Persistencia

- Sin configuracion extra, la app usa SQLite local en `data/itemicostos.sqlite`.
- Si defines `ITEMICOSTOS_STORAGE=google-sheets`, el backend guarda el estado completo en Google Sheets.
- Si defines `ITEMICOSTOS_STORAGE=mysql`, el backend guarda y lee estado en MySQL/Cloud SQL.
- Si existian datos en `localStorage`, la app los migra al abrirse contra el servidor local.

## Google Sheets

- Define `GOOGLE_SHEETS_SPREADSHEET_ID` con el ID del spreadsheet destino.
- Autentica con `GOOGLE_APPLICATION_CREDENTIALS` o con `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Si prefieres crear el spreadsheet automaticamente, usa `GOOGLE_SHEETS_CREATE_IF_MISSING=true`.
- La hoja guarda el estado completo en pestanas `itemicostos_meta`, `itemicostos_state` e `itemicostos_projects`.

## MySQL / Cloud SQL (MTRD)

1. Configura variables en `.env`:
   - `ITEMICOSTOS_STORAGE=mysql`
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` (usa `MTRD`)
   - Opcional para addin Revit: `REVIT_INGEST_API_KEY`
   - Opcional: `MYSQL_SOCKET_PATH`, `MYSQL_SSL_CA_PATH`
2. Ejecuta migracion completa desde SQLite:
   - `npm run db:mysql:full-migrate`
3. Inicia la app:
   - `npm start`

La migracion crea el esquema `MTRD_*` con nomenclatura y descripciones por columna, crea llaves foraneas e inserta proyectos desde `data/itemicostos.sqlite`.

## Exportacion Revit via addin

- Endpoint: `POST /api/revit/export`
- Seguridad opcional: header `x-itemicostos-key` o `Authorization: Bearer <key>` si definiste `REVIT_INGEST_API_KEY`.
- El backend cruza cada fila por `projectId + codificacion` (campo `codigoPartida`) y actualiza `MTRD_Item_MetradoBim`.
- Si la fila trae `itemUid`, tiene prioridad sobre la codificacion.

Payload minimo:

```json
{
  "projectId": "uid-del-proyecto",
  "exportUid": "uuid-del-lote",
  "rows": [
    {
      "codigoPartida": "01.01.001",
      "cantidad": 12.45,
      "unidad": "m3"
    }
  ]
}
```
