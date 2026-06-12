#!/usr/bin/env bash
# Un solo comando para actualizar todo después de tocar el Excel.
#   1) convierte el Excel a datos.json
#   2) genera el mensaje de WhatsApp de hoy
#   3) (si el repo está en git) publica los cambios -> GitHub Pages se actualiza solo
#
# Uso:   ./actualizar.sh                 (mensaje de hoy + publica si hay cambios)
#        ./actualizar.sh 2026-06-15      (mensaje de una fecha + publica si hay cambios)
#        ./actualizar.sh --no-publicar 2026-06-15
set -e
cd "$(dirname "$0")"

NO_PUBLICAR=0
if [ "${1:-}" = "--no-publicar" ]; then
  NO_PUBLICAR=1
  shift
fi

echo "▶  Convirtiendo el Excel…"
python3 exportar.py

echo
echo "▶  Generando el mensaje de WhatsApp…"
python3 mensaje.py "$@"

# publicar si esto es un repositorio git con remoto configurado
if [ "$NO_PUBLICAR" -eq 1 ]; then
  echo
  echo "ℹ  Modo prueba: no se hace commit ni push."
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet -- docs/datos.json 2>/dev/null; then
    echo
    echo "▶  Publicando en internet…"
    git add docs/datos.json
    git commit -m "Resultados $(date +%Y-%m-%d)" >/dev/null
    git push
    echo "✅ Publicado. La web se actualiza en ~1 minuto."
  else
    echo "ℹ  Sin cambios en los datos; no hay nada que publicar."
  fi
fi

echo
echo "✅ Listo. El mensaje está arriba y en mensaje_hoy.txt para copiar al grupo."
