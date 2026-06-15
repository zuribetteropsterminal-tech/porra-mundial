#!/usr/bin/env python3
"""cuotas.py — descarga cuotas reales del Mundial 2026 (The Odds API)
y las escribe en la colección `partidos` de Firestore.

Uso:
    python3 cuotas.py              # actualiza todos los partidos con cuotas
    python3 cuotas.py --ver        # muestra los partidos sin escribir nada
"""

import sys, json, datetime, requests, firebase_admin
from firebase_admin import credentials, firestore

# ── config ────────────────────────────────────────────────────────────────────
ODDS_API_KEY  = "d725e2c88109bd1173f2d69013bf23f8"
SPORT_KEY     = "soccer_fifa_world_cup"
SERVICE_ACCT  = "serviceAccount.json"
SOLO_VER      = "--ver" in sys.argv

# Línea de goles por defecto si la API no devuelve la cuota para ese umbral
LINEA_GOLES   = 2.5

# ── banderas ──────────────────────────────────────────────────────────────────
BANDERAS = {
    "Algeria":"🇩🇿","Argentina":"🇦🇷","Australia":"🇦🇺","Belgium":"🇧🇪",
    "Bolivia":"🇧🇴","Bosnia & Herzegovina":"🇧🇦","Brazil":"🇧🇷","Cameroon":"🇨🇲",
    "Canada":"🇨🇦","Cape Verde":"🇨🇻","Chile":"🇨🇱","Colombia":"🇨🇴",
    "Costa Rica":"🇨🇷","Croatia":"🇭🇷","Czech Republic":"🇨🇿","Denmark":"🇩🇰",
    "Ecuador":"🇪🇨","Egypt":"🇪🇬","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","France":"🇫🇷",
    "Germany":"🇩🇪","Ghana":"🇬🇭","Greece":"🇬🇷","Honduras":"🇭🇳",
    "Hungary":"🇭🇺","Indonesia":"🇮🇩","Iran":"🇮🇷","Iraq":"🇮🇶",
    "Israel":"🇮🇱","Italy":"🇮🇹","Ivory Coast":"🇨🇮","Jamaica":"🇯🇲",
    "Japan":"🇯🇵","Jordan":"🇯🇴","Kenya":"🇰🇪","Malaysia":"🇲🇾",
    "Mali":"🇲🇱","Mexico":"🇲🇽","Morocco":"🇲🇦","Netherlands":"🇳🇱",
    "New Zealand":"🇳🇿","Nigeria":"🇳🇬","Norway":"🇳🇴","Pakistan":"🇵🇰",
    "Panama":"🇵🇦","Paraguay":"🇵🇾","Peru":"🇵🇪","Philippines":"🇵🇭",
    "Poland":"🇵🇱","Portugal":"🇵🇹","Qatar":"🇶🇦","Romania":"🇷🇴",
    "Saudi Arabia":"🇸🇦","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Senegal":"🇸🇳","Serbia":"🇷🇸",
    "Slovakia":"🇸🇰","Slovenia":"🇸🇮","South Africa":"🇿🇦","South Korea":"🇰🇷",
    "Spain":"🇪🇸","Sweden":"🇸🇪","Switzerland":"🇨🇭","Thailand":"🇹🇭",
    "Trinidad & Tobago":"🇹🇹","Tunisia":"🇹🇳","Turkey":"🇹🇷",
    "Ukraine":"🇺🇦","United States":"🇺🇸","Uruguay":"🇺🇾","Venezuela":"🇻🇪",
    "Vietnam":"🇻🇳","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Zambia":"🇿🇲",
}

def bandera(pais): return BANDERAS.get(pais, "🏳️")

# ── The Odds API ──────────────────────────────────────────────────────────────
def fetch_odds():
    url = f"https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/odds/"
    r = requests.get(url, params={
        "apiKey": ODDS_API_KEY,
        "regions": "eu",
        "markets": "h2h,totals",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    }, timeout=20)
    r.raise_for_status()
    remaining = r.headers.get("x-requests-remaining", "?")
    print(f"✓ API respondió — llamadas restantes este mes: {remaining}")
    return r.json()

def cuota_media(outcomes, key_fn):
    """Promedia las cuotas de todos los bookmakers para un outcome dado."""
    vals = [o["price"] for o in outcomes if key_fn(o)]
    return round(sum(vals) / len(vals), 2) if vals else None

def partido_a_firestore(g):
    """Convierte un evento de the-odds-api al formato que espera la web."""
    home = g["home_team"]
    away = g["away_team"]
    dt   = datetime.datetime.fromisoformat(g["commence_time"].replace("Z", "+00:00"))
    dt_local = dt.astimezone(datetime.timezone(datetime.timedelta(hours=2)))  # CEST

    mercados = []

    # — 1X2 —
    h2h_outcomes = []
    for bm in g.get("bookmakers", []):
        for mkt in bm.get("markets", []):
            if mkt["key"] == "h2h":
                h2h_outcomes += mkt["outcomes"]

    if h2h_outcomes:
        c1 = cuota_media(h2h_outcomes, lambda o: o["name"] == home)
        cX = cuota_media(h2h_outcomes, lambda o: o["name"] == "Draw")
        c2 = cuota_media(h2h_outcomes, lambda o: o["name"] == away)
        if c1 and cX and c2:
            mercados.append({
                "id": "1x2", "nombre": "Ganador del partido",
                "sel": [
                    {"k":"1", "etq": home, "cuota": c1},
                    {"k":"X", "etq": "Empate", "cuota": cX},
                    {"k":"2", "etq": away,  "cuota": c2},
                ]
            })

    # — Totals (más/menos 2.5) —
    tot_outcomes = []
    for bm in g.get("bookmakers", []):
        for mkt in bm.get("markets", []):
            if mkt["key"] == "totals":
                for o in mkt["outcomes"]:
                    if abs(float(o.get("point", 0)) - LINEA_GOLES) < 0.01:
                        tot_outcomes.append(o)

    if tot_outcomes:
        cO = cuota_media(tot_outcomes, lambda o: o["name"] == "Over")
        cU = cuota_media(tot_outcomes, lambda o: o["name"] == "Under")
        if cO and cU:
            mercados.append({
                "id": "ou25", "nombre": f"Total de goles {LINEA_GOLES}",
                "sel": [
                    {"k":"O", "etq": f"Más de {LINEA_GOLES}", "cuota": cO},
                    {"k":"U", "etq": f"Menos de {LINEA_GOLES}", "cuota": cU},
                ]
            })

    if not mercados:
        return None  # partido sin cuotas disponibles aún

    return {
        "id":       g["id"],
        "oddsId":   g["id"],
        "fecha":    dt_local.strftime("%Y-%m-%d"),
        "hora":     dt_local.strftime("%H:%M"),
        "local":    home,
        "visitante": away,
        "flLocal":  bandera(home),
        "flVis":    bandera(away),
        "mercados": mercados,
        "actualizado": datetime.datetime.utcnow().isoformat(),
    }

# ── main ──────────────────────────────────────────────────────────────────────
def main():
    print("▶  Descargando cuotas del Mundial 2026…")
    eventos = fetch_odds()
    partidos = [partido_a_firestore(g) for g in eventos]
    partidos = [p for p in partidos if p]
    print(f"   {len(partidos)} partidos con cuotas disponibles")

    if SOLO_VER:
        for p in partidos[:5]:
            print(f"\n  {p['fecha']} {p['hora']} — {p['local']} vs {p['visitante']}")
            for m in p["mercados"]:
                print(f"    [{m['id']}] {m['nombre']}")
                for s in m["sel"]: print(f"      {s['etq']}: {s['cuota']}")
        if len(partidos) > 5: print(f"  … y {len(partidos)-5} más")
        print("\n(Modo --ver: nada escrito en Firestore)")
        return

    print("▶  Conectando con Firebase…")
    cred = credentials.Certificate(SERVICE_ACCT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("▶  Escribiendo en Firestore…")
    col = db.collection("partidos")
    batch = db.batch()
    for p in partidos:
        batch.set(col.document(p["id"]), p)
    batch.commit()
    print(f"✅ {len(partidos)} partidos escritos en Firestore.")

if __name__ == "__main__":
    main()
