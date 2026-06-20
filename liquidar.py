#!/usr/bin/env python3
"""liquidar.py — marca apuestas ganadas/perdidas y actualiza saldos en Firestore.

Uso:
    python3 liquidar.py              # liquida todo lo que se pueda
    python3 liquidar.py --ver        # muestra qué liquidaría sin tocar nada
    python3 liquidar.py --dias 5     # mira resultados de los últimos N días (default: 3)
"""

import sys, requests, firebase_admin
from firebase_admin import credentials, firestore

# ── config ────────────────────────────────────────────────────────────────────
ODDS_API_KEY = "d725e2c88109bd1173f2d69013bf23f8"
SPORT_KEY    = "soccer_fifa_world_cup"
SERVICE_ACCT = "serviceAccount.json"
SOLO_VER     = "--ver" in sys.argv
DIAS         = int(sys.argv[sys.argv.index("--dias")+1]) if "--dias" in sys.argv else 3

# ── resultados de la API ──────────────────────────────────────────────────────
def fetch_scores():
    url = f"https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/scores/"
    r = requests.get(url, params={
        "apiKey": ODDS_API_KEY,
        "daysFrom": DIAS,
        "dateFormat": "iso",
    }, timeout=20)
    r.raise_for_status()
    remaining = r.headers.get("x-requests-remaining", "?")
    print(f"✓ API respondió — llamadas restantes este mes: {remaining}")
    return {g["id"]: g for g in r.json() if g.get("completed") and g.get("scores")}

# ── lógica de resolución ──────────────────────────────────────────────────────
def resolver_seleccion(sel, partido_resultado):
    """Devuelve True si la selección fue ganadora, False si no, None si no hay datos."""
    if not partido_resultado:
        return None

    home = partido_resultado["home_team"]
    away = partido_resultado["away_team"]
    scores = {s["name"]: int(s["score"]) for s in partido_resultado["scores"]}
    goles_home = scores.get(home, 0)
    goles_away = scores.get(away, 0)
    total = goles_home + goles_away

    # k puede faltar en apuestas antiguas/caché: se deduce de la etiqueta.
    k = sel.get("k")
    if not k:
        etq = sel.get("etq", "")
        if   etq == "Empate":          k = "X"
        elif etq.startswith("Más de"):  k = "O"
        elif etq.startswith("Menos de"):k = "U"
        elif etq == home:               k = "1"
        elif etq == away:               k = "2"
    # 1X2
    if k == "1":   return goles_home > goles_away
    if k == "X":   return goles_home == goles_away
    if k == "2":   return goles_away > goles_home
    # totals
    if k == "O":   return total > 2.5
    if k == "U":   return total < 2.5
    return None  # mercado desconocido

def partido_de_sel(sel, partidos_firestore):
    """Busca el partido en Firestore que coincide con la selección del boleto."""
    nombre = sel.get("partido", "")  # ej. "Spain-Cape Verde"
    for p in partidos_firestore.values():
        clave = f"{p['local']}-{p['visitante']}"
        if clave == nombre or f"{p['visitante']}-{p['local']}" == nombre:
            return p.get("oddsId") or p.get("id")
    return None

# ── main ──────────────────────────────────────────────────────────────────────
def main():
    print("▶  Conectando con Firebase…")
    cred = credentials.Certificate(SERVICE_ACCT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print(f"▶  Descargando resultados (últimos {DIAS} días)…")
    completados = fetch_scores()
    print(f"   {len(completados)} partidos completados")

    print("▶  Leyendo apuestas pendientes…")
    apuestas = db.collection("apuestas").where("estado", "==", "pendiente").stream()
    apuestas = [a for a in apuestas]
    print(f"   {len(apuestas)} apuestas pendientes")

    print("▶  Leyendo partidos de Firestore…")
    partidos_fs = {d.id: d.to_dict() for d in db.collection("partidos").stream()}

    liquidadas = ganadas = perdidas = 0

    errores = 0
    for ap_doc in apuestas:
        ap = ap_doc.to_dict()
        sels = ap.get("sels", [])

        try:
            resultados = []
            for sel in sels:
                odds_id = partido_de_sel(sel, partidos_fs)
                resultado_partido = completados.get(odds_id) if odds_id else None
                r = resolver_seleccion(sel, resultado_partido)
                resultados.append(r)
        except Exception as e:
            errores += 1
            print(f"  ⚠️  {ap.get('jugador','?')}: no se pudo resolver ({e}); se deja pendiente")
            continue

        # Solo liquidar si todos los partidos del boleto tienen resultado
        if any(r is None for r in resultados):
            continue  # algún partido aún no ha terminado

        gano = all(resultados)
        retorno = ap["retornoPot"] if gano else 0
        estado  = "ganada" if gano else "perdida"

        desc = f"  {ap['jugador']:20s} stake={ap['stake']:5.1f}€  → {estado.upper()}"
        if gano: desc += f"  +{retorno:.2f}€"
        print(desc)

        if not SOLO_VER:
            @firestore.transactional
            def liquidar_tx(tx, ap_ref, jug_ref, estado, retorno):
                jug = jug_ref.get(transaction=tx)
                saldo_actual = jug.get("saldo") or 0
                nuevo_saldo  = round(saldo_actual + retorno, 2)
                tx.update(ap_ref,  {"estado": estado})
                tx.update(jug_ref, {"saldo": nuevo_saldo})

            tx = db.transaction()
            liquidar_tx(
                tx,
                db.collection("apuestas").document(ap_doc.id),
                db.collection("jugadores").document(ap["jugador"]),
                estado, retorno,
            )

        liquidadas += 1
        if gano: ganadas += 1
        else: perdidas += 1

    sufijo = " (simulación —ver)" if SOLO_VER else ""
    print(f"\n✅ Liquidadas: {liquidadas}  |  Ganadas: {ganadas}  |  Perdidas: {perdidas}  |  Errores: {errores}{sufijo}")
    if liquidadas == 0 and apuestas:
        print("   (los partidos de esas apuestas aún no han terminado o no coinciden)")

if __name__ == "__main__":
    main()
