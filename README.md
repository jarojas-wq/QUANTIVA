# Itemizado y Costos

Aplicativo web estático para crear un itemizado jerárquico con numeración automática.

## Uso

1. Abre `index.html` en tu navegador.
2. Selecciona una fila.
3. Usa la barra superior para:
   - Crear partidas raíz.
   - Crear partidas debajo de la fila actual.
   - Crear hijas y subpartidas.
   - Subir, bajar, indentar o desindentar.
4. Completa `Codificación`, `Descripción de Partida`, `Unidad de Partida`, `Costo` y `Metrado`.

## Comportamiento

- El `Código de partida` se recalcula automáticamente.
- Los cambios se guardan en `localStorage` del navegador.
- El total estimado se calcula como `Costo x Metrado`.
