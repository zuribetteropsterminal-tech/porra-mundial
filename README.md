# 🏆 La Porra del Mundial — web

Web interactiva para la porra del Mundial 2026, alimentada por tu Excel
(`ADMIN lMundial 2026.xlsx`). Tú actualizas el Excel como siempre; un comando
lo convierte en la web y en el mensaje del grupo de WhatsApp.

## Cómo funciona (el flujo de cada día)

1. Metes los resultados en el Excel (hoja **WORLDCUP**, columnas de goles) y **guardas**.
2. Ejecutas:
   ```bash
   ./actualizar.sh
   ```
   Eso hace tres cosas:
   - **`exportar.py`** lee el Excel y genera `docs/datos.json` (la web NO recalcula
     puntos: usa los que ya calcula tu Excel, así siempre cuadra).
   - **`mensaje.py`** crea el mensaje de WhatsApp del día → `mensaje_hoy.txt`.
   - Si el proyecto está en GitHub, publica los cambios y la web se actualiza sola.
3. Copias el mensaje de `mensaje_hoy.txt` y lo pegas en el grupo. ✅

> Importante: abre y **guarda** el Excel en Excel/LibreOffice antes de exportar,
> para que las fórmulas estén recalculadas.

## Piezas

| Archivo            | Qué hace                                                        |
|--------------------|----------------------------------------------------------------|
| `exportar.py`      | Excel → `docs/datos.json`                                       |
| `mensaje.py`       | `datos.json` → mensaje de WhatsApp (`mensaje_hoy.txt`)          |
| `actualizar.sh`    | Hace todo lo anterior + publica                                |
| `docs/`            | La web (lo que sirve GitHub Pages)                             |
| `config.json`      | La URL de la web (para el enlace del mensaje)                  |

## La web (`docs/`)

- 🏆 **Clasificación** — ranking con desglose por fases (toca un jugador).
- 📅 **Partidos** — resultado y quién acertó cada uno, con sus puntos.
- 🔮 **Quinielas** — todas las predicciones de un jugador (✓/✗).
- ⚔️ **Duelos** — dos jugadores cara a cara.
- 🏅 **Cuadro de Honor** — campeón, botas y balones.

## Verla en local

```bash
cd docs && python3 -m http.server 8753
# abre http://localhost:8753
```

## Publicarla en internet (GitHub Pages)

1. Crea un repo en GitHub y sube esta carpeta.
2. En *Settings → Pages*, elige rama `main` y carpeta `/docs`.
3. Copia la URL que te da GitHub en `config.json`.

A partir de ahí, cada `./actualizar.sh` republica la web.

## Requisitos

- Python 3 y `openpyxl`:
  ```bash
  pip3 install openpyxl
  ```
