/* La Casa — casa de apuestas con dinero ficticio.
   Backend: Firebase Firestore (compat SDK).
   La interfaz es idéntica a la versión mock; solo cambia el objeto Store. */

const SALDO_INICIAL = 50;

const MOCK_JUGADORES = ["Juanlu","WILLY","Mesa","TERRY","Velasco","Rino","Mini","Moi","RAFA NAVARRETE","John"];

/* Partidos de ejemplo con cuotas. Cuando conectes cuotas.py + The Odds API,
   esta tabla vendrá de Firestore (los scripts la rellenarán). */
const MOCK_PARTIDOS = [
  {
    id: "m1", fecha: "2026-06-16", hora: "21:00",
    local: "España", visitante: "Uruguay", flLocal: "🇪🇸", flVis: "🇺🇾",
    mercados: [
      { id: "1x2", nombre: "Ganador del partido",
        sel: [{k:"1",etq:"España",cuota:1.85},{k:"X",etq:"Empate",cuota:3.40},{k:"2",etq:"Uruguay",cuota:4.20}] },
      { id: "dc", nombre: "Doble oportunidad",
        sel: [{k:"1X",etq:"España o Empate",cuota:1.22},{k:"12",etq:"España o Uruguay",cuota:1.28},{k:"X2",etq:"Empate o Uruguay",cuota:1.90}] },
      { id: "ou25", nombre: "Total de goles 2.5",
        sel: [{k:"O",etq:"Más de 2.5",cuota:2.05},{k:"U",etq:"Menos de 2.5",cuota:1.75}] },
      { id: "btts", nombre: "Ambos equipos marcan",
        sel: [{k:"S",etq:"Sí",cuota:1.95},{k:"N",etq:"No",cuota:1.80}] },
      { id: "exact", nombre: "Resultado exacto",
        sel: [{k:"1-0",etq:"1-0",cuota:6.5},{k:"2-0",etq:"2-0",cuota:8.0},{k:"2-1",etq:"2-1",cuota:8.5},{k:"1-1",etq:"1-1",cuota:6.0},{k:"0-0",etq:"0-0",cuota:9.0},{k:"0-1",etq:"0-1",cuota:13.0}] },
    ],
  },
  {
    id: "m2", fecha: "2026-06-17", hora: "18:00",
    local: "Argentina", visitante: "Nigeria", flLocal: "🇦🇷", flVis: "🇳🇬",
    mercados: [
      { id: "1x2", nombre: "Ganador del partido",
        sel: [{k:"1",etq:"Argentina",cuota:1.50},{k:"X",etq:"Empate",cuota:4.00},{k:"2",etq:"Nigeria",cuota:6.50}] },
      { id: "dc", nombre: "Doble oportunidad",
        sel: [{k:"1X",etq:"Argentina o Empate",cuota:1.12},{k:"12",etq:"Argentina o Nigeria",cuota:1.20},{k:"X2",etq:"Empate o Nigeria",cuota:2.45}] },
      { id: "ou25", nombre: "Total de goles 2.5",
        sel: [{k:"O",etq:"Más de 2.5",cuota:1.90},{k:"U",etq:"Menos de 2.5",cuota:1.90}] },
      { id: "btts", nombre: "Ambos equipos marcan",
        sel: [{k:"S",etq:"Sí",cuota:2.10},{k:"N",etq:"No",cuota:1.68}] },
    ],
  },
  {
    id: "m3", fecha: "2026-06-17", hora: "21:00",
    local: "Francia", visitante: "Croacia", flLocal: "🇫🇷", flVis: "🇭🇷",
    mercados: [
      { id: "1x2", nombre: "Ganador del partido",
        sel: [{k:"1",etq:"Francia",cuota:1.70},{k:"X",etq:"Empate",cuota:3.60},{k:"2",etq:"Croacia",cuota:4.80}] },
      { id: "ou25", nombre: "Total de goles 2.5",
        sel: [{k:"O",etq:"Más de 2.5",cuota:1.95},{k:"U",etq:"Menos de 2.5",cuota:1.85}] },
      { id: "btts", nombre: "Ambos equipos marcan",
        sel: [{k:"S",etq:"Sí",cuota:1.85},{k:"N",etq:"No",cuota:1.90}] },
    ],
  },
];

/* ================================================================ Store
   Todas las lecturas/escrituras de datos pasan por aquí.
   La UI no toca Firebase directamente. */
const Store = {
  _db: null,
  _ready: false,
  _readyCallbacks: [],

  async init(){
    const auth = firebase.auth();
    await auth.signInAnonymously();
    this._db = firebase.firestore();
    await this._sembrarSiVacio();
    this._ready = true;
    this._readyCallbacks.forEach(fn => fn());
  },

  async _sembrarSiVacio(){
    const snap = await this._db.collection("jugadores").limit(1).get();
    if(!snap.empty) return;
    const batch = this._db.batch();
    MOCK_JUGADORES.forEach(j => {
      batch.set(this._db.doc(`jugadores/${j}`), { saldo: SALDO_INICIAL });
    });
    MOCK_PARTIDOS.forEach(p => {
      batch.set(this._db.doc(`partidos/${p.id}`), p);
    });
    await batch.commit();
  },

  async jugadores(){ return MOCK_JUGADORES.slice(); },

  async partidos(){
    const snap = await this._db.collection("partidos").get();
    return snap.docs.map(d => d.data());
  },

  async pin(nombre){
    const doc = await this._db.doc(`jugadores/${nombre}`).get();
    return doc.exists ? (doc.data().pin || null) : null;
  },

  async fijarPin(nombre, pin){
    await this._db.doc(`jugadores/${nombre}`).update({ pin });
  },

  async saldo(nombre){
    const doc = await this._db.doc(`jugadores/${nombre}`).get();
    return doc.exists ? (doc.data().saldo ?? SALDO_INICIAL) : SALDO_INICIAL;
  },

  async apuestas(nombre){
    const snap = await this._db.collection("apuestas")
      .orderBy("timestamp", "desc").get();
    const all = snap.docs.map(d => d.data());
    return nombre ? all.filter(a => a.jugador === nombre) : all;
  },

  async crearApuesta(ap){
    const jugRef = this._db.doc(`jugadores/${ap.jugador}`);
    const apRef  = this._db.collection("apuestas").doc();
    await this._db.runTransaction(async tx => {
      const jugDoc = await tx.get(jugRef);
      const saldoActual = jugDoc.data().saldo ?? SALDO_INICIAL;
      if(ap.stake > saldoActual) throw new Error("Saldo insuficiente");
      tx.update(jugRef, { saldo: saldoActual - ap.stake });
      tx.set(apRef, {
        ...ap, id: apRef.id,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  },

  async ranking(){
    const snap = await this._db.collection("jugadores").get();
    return snap.docs
      .map(d => ({ jugador: d.id, saldo: d.data().saldo ?? SALDO_INICIAL }))
      .sort((a,b) => b.saldo - a.saldo || a.jugador.localeCompare(b.jugador));
  },
};

/* ================================================================ UI */
let bUser = null;          // nombre del jugador logado
let bTab  = "apostar";     // sub-pestaña activa
let boleto = {};           // selecciones del boleto
let bMsg  = null;          // mensaje de confirmación

const fmt = n => "€" + Number(n).toFixed(2).replace(/\.00$/, "");

/* ---------------------------------------------------------------- entrada */
async function vApuestas(m){
  m.innerHTML = "";
  if(!Store._ready){
    m.appendChild(el(`<div class="empty">Conectando con La Casa…</div>`));
    Store._readyCallbacks.push(() => vApuestas(m));
    return;
  }
  if(!bUser){ return vLogin(m); }

  const saldo = await Store.saldo(bUser);

  /* barra de saldo */
  m.appendChild(el(`<div class="card bet-bar">
    <div class="bb-l"><div class="bb-hi">Hola, ${esc(bUser)}</div><div class="bb-sub">Casa de Apuestas · dinero ficticio</div></div>
    <div class="bb-r"><div class="bb-saldo">${fmt(saldo)}</div><button class="bb-out">Salir</button></div>
  </div>`));
  $(".bb-out", m).onclick = () => { bUser = null; bTab = "apostar"; boleto = {}; vApuestas(m); };

  /* sub-pestañas */
  const tabs = el(`<div class="filtros bet-subtabs"></div>`);
  [["apostar","📋 Apostar"],["ranking","💰 Ranking"],["mias","🧾 Mis apuestas"]].forEach(([k,t]) => {
    const b = el(`<button class="${k===bTab?"activa":""}">${t}</button>`);
    b.onclick = () => { bTab = k; vApuestas(m); };
    tabs.appendChild(b);
  });
  m.appendChild(tabs);

  if(bMsg){
    m.appendChild(el(`<div class="bet-toast">${esc(bMsg)}</div>`));
    bMsg = null;
  }

  if(bTab === "apostar")  await vApostar(m, saldo);
  else if(bTab === "ranking") await vRanking(m);
  else await vMias(m);
}

/* ---------------------------------------------------------------- login */
function vLogin(m){
  const card = el(`<div class="card bet-login">
    <div class="h2">💰 La Casa</div>
    <div class="sub" style="margin-bottom:14px">Entra con tu nombre y un PIN de 4 dígitos. La primera vez, el PIN que pongas queda guardado.</div>
    <label class="bl-lab">Jugador</label>
    <select id="bl-nom"></select>
    <label class="bl-lab" style="margin-top:10px">PIN (4 dígitos)</label>
    <input id="bl-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="bet-stake">
    <div id="bl-err" class="bet-err"></div>
    <button id="bl-go" class="btn-primary" style="margin-top:12px">Entrar</button>
  </div>`);
  const sel = $("#bl-nom", card);
  MOCK_JUGADORES.forEach(j => sel.appendChild(el(`<option>${esc(j)}</option>`)));
  $("#bl-go", card).onclick = async () => {
    const nom = sel.value, pin = $("#bl-pin", card).value.trim();
    const err = $("#bl-err", card);
    const go  = $("#bl-go", card);
    if(!/^\d{4}$/.test(pin)){ err.textContent = "El PIN debe tener 4 dígitos."; return; }
    go.disabled = true; go.textContent = "Comprobando…";
    try {
      const guardado = await Store.pin(nom);
      if(guardado === null){ await Store.fijarPin(nom, pin); }
      else if(guardado !== pin){ err.textContent = "PIN incorrecto."; go.disabled=false; go.textContent="Entrar"; return; }
      bUser = nom;
      vApuestas(m);
    } catch(e){ err.textContent = "Error de conexión. Reintenta."; go.disabled=false; go.textContent="Entrar"; }
  };
  m.appendChild(card);
}

/* ---------------------------------------------------------------- apostar */
async function vApostar(m, saldo){
  let partidos;
  try { partidos = await Store.partidos(); }
  catch(e){ m.appendChild(el(`<div class="empty">Error cargando partidos.</div>`)); return; }

  partidos.forEach(p => {
    const card = el(`<div class="card bet-match">
      <div class="bm-top"><span class="bm-when">${esc(fechaCorta(p.fecha))} · ${esc(p.hora)}</span></div>
      <div class="bm-teams"><span>${p.flLocal} ${esc(p.local)}</span><span class="bm-vs">vs</span><span>${esc(p.visitante)} ${p.flVis}</span></div>
    </div>`);
    p.mercados.forEach(mk => {
      const mkBox = el(`<div class="mkt"><div class="mkt-t">${esc(mk.nombre)}</div><div class="odds ${mk.id==="exact"?"odds-grid":""}"></div></div>`);
      const grid = $(".odds", mkBox);
      mk.sel.forEach(s => {
        const clave  = `${p.id}:${mk.id}`;
        const activa = boleto[clave] && boleto[clave].sel.k === s.k;
        const b = el(`<button class="odd ${activa?"odd-on":""}">
          <span class="odd-etq">${esc(s.etq)}</span><span class="odd-c">${s.cuota.toFixed(2)}</span>
        </button>`);
        b.onclick = () => {
          if(boleto[clave] && boleto[clave].sel.k === s.k) delete boleto[clave];
          else boleto[clave] = { matchId:p.id, marketId:mk.id, mkNombre:mk.nombre, partido:`${p.local}-${p.visitante}`, sel:s };
          vApuestas(m);
        };
        grid.appendChild(b);
      });
      card.appendChild(mkBox);
    });
    m.appendChild(card);
  });
  pintarBoleto(saldo, m);
}

/* boleto flotante */
function pintarBoleto(saldo, m){
  const old = $(".slip"); if(old) old.remove();
  const sels = Object.values(boleto);
  if(!sels.length) return;
  const cuotaTotal = sels.reduce((a,s) => a * s.sel.cuota, 1);
  const slip = el(`<div class="slip">
    <div class="slip-hd"><span>🧾 Boleto · ${sels.length} ${sels.length===1?"apuesta":"combinada"}</span><span class="slip-cuota">×${cuotaTotal.toFixed(2)}</span></div>
    <div class="slip-lines"></div>
    <div class="slip-foot">
      <input class="bet-stake slip-stake" type="number" inputmode="decimal" min="0.5" step="0.5" placeholder="Importe €">
      <div class="slip-ret">Ganarías <b>—</b></div>
      <button class="btn-primary slip-go">Apostar</button>
    </div>
    <div class="slip-err"></div>
  </div>`);
  const lines = $(".slip-lines", slip);
  sels.forEach(s => {
    const ln = el(`<div class="slip-ln">
      <span class="sl-x">✕</span>
      <div class="sl-txt"><b>${esc(s.sel.etq)}</b><small>${esc(s.mkNombre)} · ${esc(s.partido)}</small></div>
      <span class="sl-c">${s.sel.cuota.toFixed(2)}</span>
    </div>`);
    $(".sl-x", ln).onclick = () => { delete boleto[`${s.matchId}:${s.marketId}`]; vApuestas(m || $("#vista")); };
    lines.appendChild(ln);
  });
  const inp = $(".slip-stake", slip), ret = $(".slip-ret b", slip), err = $(".slip-err", slip);
  inp.oninput = () => { const v = parseFloat(inp.value)||0; ret.textContent = v>0 ? fmt(v*cuotaTotal) : "—"; };
  $(".slip-go", slip).onclick = async () => {
    const stake = parseFloat(inp.value);
    const go = $(".slip-go", slip);
    if(!stake || stake <= 0){ err.textContent = "Pon un importe."; return; }
    if(stake > saldo){ err.textContent = `Saldo insuficiente: solo ${fmt(saldo)}.`; return; }
    go.disabled = true; go.textContent = "Enviando…";
    try {
      const id = "b" + Date.now();
      await Store.crearApuesta({
        id, jugador: bUser, stake, cuotaTotal: +cuotaTotal.toFixed(4),
        retornoPot: +(stake * cuotaTotal).toFixed(2),
        estado: "pendiente",
        sels: sels.map(s => ({ partido:s.partido, mkNombre:s.mkNombre, etq:s.sel.etq, cuota:s.sel.cuota })),
      });
      boleto = {};
      bMsg = `✅ Apuesta de ${fmt(stake)} aceptada. Retorno potencial ${fmt(stake*cuotaTotal)}.`;
      vApuestas($("#vista"));
    } catch(e){
      err.textContent = e.message || "Error al procesar la apuesta.";
      go.disabled = false; go.textContent = "Apostar";
    }
  };
  document.body.appendChild(slip);
}

/* ---------------------------------------------------------------- ranking */
async function vRanking(m){
  let r;
  try { r = await Store.ranking(); }
  catch(e){ m.appendChild(el(`<div class="empty">Error cargando ranking.</div>`)); return; }

  const card = el(`<div class="card"><div class="h2">💰 Ranking de saldos</div>
    <div class="sub" style="margin-bottom:8px">Todos empezáis con ${fmt(SALDO_INICIAL)}. El que más acumule, manda.</div>
    <div class="bet-rank"></div></div>`);
  const cont = $(".bet-rank", card);
  r.forEach((t, i) => {
    const med = i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)+"º";
    const dif = t.saldo - SALDO_INICIAL;
    const cls = dif>0?"up":dif<0?"down":"";
    cont.appendChild(el(`<div class="rank-row ${t.jugador===bUser?"rank-me":""}">
      <span class="rank-pos">${med}</span>
      <span class="rank-nom">${esc(t.jugador)}</span>
      <span class="rank-dif ${cls}">${dif>0?"+":""}${dif!==0?fmt(dif):""}</span>
      <span class="rank-sal">${fmt(t.saldo)}</span>
    </div>`));
  });
  m.appendChild(card);
}

/* ---------------------------------------------------------------- mis apuestas */
async function vMias(m){
  let aps;
  try { aps = await Store.apuestas(bUser); }
  catch(e){ m.appendChild(el(`<div class="empty">Error cargando apuestas.</div>`)); return; }

  const card = el(`<div class="card"><div class="h2">🧾 Mis apuestas</div></div>`);
  if(!aps.length){
    card.appendChild(el(`<div class="empty">Aún no has apostado nada. Ve a 📋 Apostar.</div>`));
    m.appendChild(card); return;
  }
  aps.forEach(a => {
    const est = a.estado==="ganada"?"win":a.estado==="perdida"?"lose":"pend";
    const etiq = a.estado==="ganada"?`✅ Ganada +${fmt(a.retornoPot)}`:a.estado==="perdida"?`❌ Perdida −${fmt(a.stake)}`:"⏳ Pendiente";
    const t = el(`<div class="ticket ticket-${est}">
      <div class="tk-top"><span class="tk-est">${etiq}</span><span class="tk-cuota">×${(+a.cuotaTotal).toFixed(2)}</span></div>
      <div class="tk-sels"></div>
      <div class="tk-foot"><span>Importe ${fmt(a.stake)}</span><span>Retorno pot. ${fmt(a.retornoPot)}</span></div>
    </div>`);
    const sc = $(".tk-sels", t);
    a.sels.forEach(s => sc.appendChild(el(`<div class="tk-sel"><b>${esc(s.etq)}</b> <small>${esc(s.mkNombre)} · ${esc(s.partido)} · ${(+s.cuota).toFixed(2)}</small></div>`)));
    card.appendChild(t);
  });
  m.appendChild(card);
}

/* limpiar boleto al salir de la pestaña */
window.addEventListener("apuestas:leave", () => { const s = $(".slip"); if(s) s.remove(); });

window.vApuestas = vApuestas;

/* arrancar conexión Firebase */
Store.init().catch(e => console.error("Firebase init error:", e));
