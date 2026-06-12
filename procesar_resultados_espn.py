#!/usr/bin/env python3
"""
Procesa todos los partidos pendientes que ya pueden tener resultado en ESPN.

Pensado para cron:
    python3 procesar_resultados_espn.py --publicar

No envia WhatsApp. Si registra algo, actualizar_desde_espn.py regenera la web y
publica mediante actualizar.sh.
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from zoneinfo import ZoneInfo


AQUI = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(AQUI, "docs", "datos.json")
MADRID = ZoneInfo("Europe/Madrid")


def cargar_partidos():
    with open(DATOS, encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("partidos", [])


def candidatos(partidos, hasta):
    for partido in partidos:
        if partido.get("jugado"):
            continue
        equipos = partido.get("equipos")
        fecha = partido.get("fecha")
        if not equipos or len(equipos) != 2 or not fecha:
            continue
        try:
            fecha_partido = dt.date.fromisoformat(fecha)
        except ValueError:
            continue
        if fecha_partido <= hasta:
            yield partido


def ejecutar(partido, publicar):
    local, visitante = partido["equipos"]
    cmd = [
        "python3",
        "actualizar_desde_espn.py",
        f"{local}-{visitante}",
        "--fecha",
        partido["fecha"],
    ]
    cmd.append("--publicar" if publicar else "--no-publicar")
    print(f"CONSULTA: {local}-{visitante} ({partido['fecha']})", flush=True)
    proc = subprocess.run(cmd, cwd=AQUI)
    if proc.returncode == 0:
        print(f"ACTUALIZADO: {local}-{visitante}", flush=True)
        return "actualizado"
    if proc.returncode == 2:
        print(f"PENDIENTE: {local}-{visitante}", flush=True)
        return "pendiente"
    print(f"ERROR: {local}-{visitante} salio con codigo {proc.returncode}", flush=True)
    return "error"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publicar", action="store_true")
    parser.add_argument("--no-publicar", action="store_true")
    parser.add_argument("--hasta", help="Fecha limite local YYYY-MM-DD; por defecto hoy en Madrid.")
    ns = parser.parse_args()

    if ns.publicar and ns.no_publicar:
        raise SystemExit("Usa solo una opcion: --publicar o --no-publicar.")

    hasta = dt.date.fromisoformat(ns.hasta) if ns.hasta else dt.datetime.now(MADRID).date()
    partidos = list(candidatos(cargar_partidos(), hasta))
    if not partidos:
        print("SIN_CANDIDATOS")
        return 0

    resumen = {"actualizado": 0, "pendiente": 0, "error": 0}
    for partido in partidos:
        estado = ejecutar(partido, publicar=ns.publicar)
        resumen[estado] += 1

    print(
        "RESUMEN: "
        f"actualizados={resumen['actualizado']} "
        f"pendientes={resumen['pendiente']} "
        f"errores={resumen['error']}"
    )
    return 1 if resumen["error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
