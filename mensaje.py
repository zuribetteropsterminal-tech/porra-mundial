#!/usr/bin/env python3
"""
Generador del mensaje diario para WhatsApp.

Lee docs/datos.json y escribe un mensaje listo para COPIAR Y PEGAR en el grupo:
clasificación, resultados del día anterior (con quién acertó) y partidos de hoy.

Uso:
    python3 mensaje.py                 # para hoy
    python3 mensaje.py 2026-06-15      # para una fecha concreta

El mensaje se imprime por pantalla y se guarda en  mensaje_hoy.txt
"""
import sys, os, json, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(AQUI, "docs", "datos.json")
CONFIG = os.path.join(AQUI, "config.json")
SALIDA = os.path.join(AQUI, "mensaje_hoy.txt")

DIAS = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]
MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"]

def fecha_larga(d):
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month-1]}"

def num(x):
    """20.0 -> '20', 2.5 -> '2.5'"""
    return str(int(x)) if float(x).is_integer() else str(round(float(x), 2))

def marcador(p):
    if p and p.get("local") is not None:
        return f"{p['local']}-{p['visitante']}"
    return p.get("texto","") if p else ""

def main():
    d = json.load(open(DATOS, encoding="utf-8"))
    cfg = json.load(open(CONFIG, encoding="utf-8")) if os.path.exists(CONFIG) else {}
    url = cfg.get("url", "")

    hoy = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today()
    ayer = hoy - datetime.timedelta(days=1)

    L = []
    L.append(f"🏆 *PORRA {d['grupo'].upper()}* · Mundial 2026")
    L.append(f"📅 {fecha_larga(hoy).capitalize()}")
    L.append("")

    # ---- clasificación (top 5 + colista) ----
    cl = d["clasificacion"]
    jugados = d["resumen"]["n_jugados"]
    if jugados == 0:
        L.append("👋 ¡Arranca el Mundial y arranca la porra!")
        L.append("Todos a *0 puntos*. Que empiece el espectáculo. 🍿")
    else:
        L.append(f"📊 *CLASIFICACIÓN* ({jugados} partidos)")
        medallas = ["🥇","🥈","🥉"]
        for i, j in enumerate(cl[:5]):
            m = medallas[j["pos"]-1] if j["pos"] <= 3 else f"{j['pos']}."
            L.append(f"{m} {j['jugador']} — *{num(j['total'])}* pts")
        if len(cl) > 5:
            col = cl[-1]
            L.append(f"   ⬇️ Farolillo rojo: {col['jugador']} ({num(col['total'])})")
    L.append("")

    # ---- resultados de ayer ----
    res_ayer = [p for p in d["partidos"] if p["jugado"] and p["fecha"] == ayer.isoformat()]
    if res_ayer:
        L.append(f"✅ *RESULTADOS DE AYER*")
        for p in res_ayer:
            t = p["equipos"] or p["codigo"].split("-")
            fl = p.get("banderas") or ["",""]
            L.append(f"{fl[0]} {t[0]} *{p['resultado']['local']}-{p['resultado']['visitante']}* {t[1]} {fl[1]}")
            # quién sacó más puntos
            mejores = sorted(p["predicciones"].items(), key=lambda kv: -(kv[1].get("puntos",0)))
            top = [(n, pr.get("puntos",0)) for n, pr in mejores if pr.get("puntos",0) > 0]
            if top:
                maxp = top[0][1]
                clavaron = [n for n, pt in top if pt == maxp]
                L.append(f"   🎯 +{num(maxp)}: {', '.join(clavaron)}")
            else:
                L.append("   😬 ¡Nadie puntuó!")
        L.append("")

    # ---- partidos de hoy ----
    hoy_part = [p for p in d["partidos"] if p["fecha"] == hoy.isoformat() and not p["jugado"]]
    if hoy_part:
        L.append("🔥 *HOY SE JUEGA*")
        for p in hoy_part:
            t = p["equipos"] or p["codigo"].split("-")
            fl = p.get("banderas") or ["",""]
            etq = f"Grupo {p['grupo']}" if p["grupo"] else p["fase"]
            L.append(f"{fl[0]} {t[0]} - {t[1]} {fl[1]}  _({etq})_")
        L.append("")
    elif jugados > 0:
        L.append("😴 Hoy no hay partidos. Día de descanso.")
        L.append("")

    if url:
        L.append(f"👉 Mira cómo va todo: {url}")

    texto = "\n".join(L).strip() + "\n"
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write(texto)

    print("="*46)
    print(texto)
    print("="*46)
    print(f"💾 Guardado en {SALIDA} — cópialo y pégalo en WhatsApp.")

if __name__ == "__main__":
    main()
