#!/usr/bin/env python3
"""
Consulta ESPN y, si el partido esta finalizado, actualiza la porra.

Uso:
    python3 actualizar_desde_espn.py "Canada-Bosnia y Herzegovina" --fecha 2026-06-12 --publicar
    python3 actualizar_desde_espn.py "Corea del Sur" "Republica Checa" --no-publicar

Codigos de salida:
    0 -> resultado registrado o ya estaba igual
    2 -> ESPN encontro el partido, pero aun no esta finalizado
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import unicodedata
import urllib.request
from zoneinfo import ZoneInfo


AQUI = os.path.dirname(os.path.abspath(__file__))
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates={date}"
MADRID = ZoneInfo("Europe/Madrid")

ALIASES = {
    "alemania": {"germany"},
    "arabia saudita": {"saudi arabia", "saudi arabia"},
    "argelia": {"algeria"},
    "argentina": {"argentina"},
    "australia": {"australia"},
    "austria": {"austria"},
    "belgica": {"belgium"},
    "bosnia y herzegovina": {"bosnia-herzegovina", "bosnia and herzegovina", "bosnia & herzegovina"},
    "brasil": {"brazil"},
    "cabo verde": {"cape verde"},
    "canada": {"canada"},
    "catar": {"qatar"},
    "colombia": {"colombia"},
    "corea del sur": {"south korea", "korea republic"},
    "costa de marfil": {"ivory coast", "cote d'ivoire", "cote divoire"},
    "croacia": {"croatia"},
    "curazao": {"curacao", "curacao"},
    "ecuador": {"ecuador"},
    "egipto": {"egypt"},
    "escocia": {"scotland"},
    "espana": {"spain"},
    "estados unidos": {"united states", "usa", "usmnt"},
    "francia": {"france"},
    "ghana": {"ghana"},
    "haiti": {"haiti"},
    "inglaterra": {"england"},
    "irak": {"iraq"},
    "iran": {"iran"},
    "japon": {"japan"},
    "jordania": {"jordan"},
    "marruecos": {"morocco"},
    "mexico": {"mexico"},
    "noruega": {"norway"},
    "nueva zelanda": {"new zealand"},
    "paises bajos": {"netherlands", "holland"},
    "panama": {"panama"},
    "paraguay": {"paraguay"},
    "portugal": {"portugal"},
    "rd congo": {"congo dr", "dr congo", "congo democratic republic", "democratic republic of congo"},
    "republica checa": {"czechia", "czech republic"},
    "senegal": {"senegal"},
    "sudafrica": {"south africa"},
    "suecia": {"sweden"},
    "suiza": {"switzerland"},
    "tunez": {"tunisia"},
    "turquia": {"turkey", "turkiye"},
    "uruguay": {"uruguay"},
    "uzbekistan": {"uzbekistan"},
}


def normaliza(texto):
    texto = str(texto or "").strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.replace("–", "-").replace("—", "-")
    return " ".join(texto.split())


def equivalentes(nombre):
    base = normaliza(nombre)
    out = {base}
    out.update(normaliza(a) for a in ALIASES.get(base, set()))
    return out


def partir_partido(args):
    if len(args) == 1:
        partes = [p.strip() for p in args[0].split("-", 1)]
        if len(partes) != 2 or not partes[0] or not partes[1]:
            raise SystemExit("El partido debe tener formato 'Local-Visitante'.")
        return partes[0], partes[1]
    if len(args) == 2:
        return args[0], args[1]
    raise SystemExit("Uso: actualizar_desde_espn.py 'Local-Visitante' [opciones]")


def fechas_a_consultar(fecha):
    if fecha:
        base = dt.date.fromisoformat(fecha)
    else:
        base = dt.datetime.now(MADRID).date()
    return [base + dt.timedelta(days=d) for d in (-1, 0, 1)]


def lee_scoreboard(fecha):
    url = ESPN_URL.format(date=fecha.strftime("%Y%m%d"))
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def competidores_evento(evento):
    competidores = {}
    for comp in evento["competitions"][0]["competitors"]:
        nombre = comp["team"].get("displayName") or comp["team"].get("name")
        competidores[normaliza(nombre)] = {
            "nombre": nombre,
            "score": int(comp.get("score") or 0),
            "homeAway": comp.get("homeAway"),
        }
    return competidores


def busca_evento(local, visitante, fechas):
    local_alias = equivalentes(local)
    visitante_alias = equivalentes(visitante)
    vistos = []

    for fecha in fechas:
        data = lee_scoreboard(fecha)
        for evento in data.get("events", []):
            comps = competidores_evento(evento)
            nombres = set(comps)
            vistos.append(evento.get("name", "sin nombre"))
            local_match = nombres & local_alias
            visitante_match = nombres & visitante_alias
            if local_match and visitante_match:
                local_key = next(iter(local_match))
                visitante_key = next(iter(visitante_match))
                return evento, comps[local_key], comps[visitante_key]

    raise SystemExit(
        "No encuentro en ESPN el partido "
        f"{local}-{visitante}. Eventos vistos: {', '.join(vistos) or 'ninguno'}"
    )


def fecha_madrid_evento(evento):
    raw = evento.get("date")
    if not raw:
        return dt.datetime.now(MADRID).date().isoformat()
    instante = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return instante.astimezone(MADRID).date().isoformat()


def run(cmd):
    print("+ " + " ".join(cmd))
    subprocess.run(cmd, cwd=AQUI, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("partido", nargs="+")
    parser.add_argument("--fecha", help="Fecha local aproximada del partido, YYYY-MM-DD.")
    parser.add_argument("--publicar", action="store_true", help="Hace commit y push mediante actualizar.sh.")
    parser.add_argument("--no-publicar", action="store_true", help="Regenera datos sin commit ni push.")
    parser.add_argument("--force", action="store_true", help="Sobrescribe si el Excel tiene otro resultado.")
    ns = parser.parse_args()

    if ns.publicar and ns.no_publicar:
        raise SystemExit("Usa solo una opcion: --publicar o --no-publicar.")

    local, visitante = partir_partido(ns.partido)
    evento, comp_local, comp_visitante = busca_evento(local, visitante, fechas_a_consultar(ns.fecha))
    estado = evento.get("status", {}).get("type", {})
    if not estado.get("completed"):
        print(
            "PENDIENTE: ESPN aun no marca finalizado "
            f"{local}-{visitante}. Estado: {estado.get('name')} / {estado.get('detail')}"
        )
        return 2

    goles_local = comp_local["score"]
    goles_visitante = comp_visitante["score"]
    fecha_msg = fecha_madrid_evento(evento)
    print(
        "FINAL ESPN: "
        f"{local} {goles_local}-{goles_visitante} {visitante} "
        f"({estado.get('name')})"
    )

    registrar = ["python3", "registrar_resultado.py", f"{local}-{visitante}", str(goles_local), str(goles_visitante)]
    if ns.force:
        registrar.append("--force")
    run(registrar)

    actualizar = ["./actualizar.sh"]
    if not ns.publicar:
        actualizar.append("--no-publicar")
    actualizar.append(fecha_msg)
    run(actualizar)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
