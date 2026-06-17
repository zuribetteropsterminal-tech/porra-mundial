#!/bin/zsh
# Refresco automático de cuotas de La Casa. Lo ejecuta cron cada mañana.
# Registra la salida en cuotas.log dentro del proyecto.
cd "/Users/zuri/Zuri/Porra Mundial/porra-web" || exit 1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> cuotas.log
/usr/bin/python3 cuotas.py >> cuotas.log 2>&1
echo "" >> cuotas.log
