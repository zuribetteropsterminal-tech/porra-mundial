#!/bin/zsh
# Liquidación automática de La Casa. Lo ejecuta cron cada noche.
# Registra la salida en liquidar.log dentro del proyecto.
cd "/Users/zuri/Zuri/Porra Mundial/porra-web" || exit 1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> liquidar.log
/usr/bin/python3 liquidar.py >> liquidar.log 2>&1
echo "" >> liquidar.log
