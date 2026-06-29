/* La Casa — casa de apuestas con dinero ficticio.
   Backend: Firebase Firestore (compat SDK).
   La interfaz es idéntica a la versión mock; solo cambia el objeto Store. */

const SALDO_INICIAL = 50;
const MAX_APUESTA   = 20;   // importe máximo por boleto (€ ficticios)

/* ¿Ya ha empezado el partido? (fecha+hora en horario peninsular).
   Una vez empezado, no se puede apostar a ese partido. */
function haEmpezado(p){
  if(!p.fecha || !p.hora) return false;
  const inicio = new Date(`${p.fecha}T${p.hora}:00`);
  if(isNaN(inicio)) return false;
  return Date.now() >= inicio.getTime();
}

const MOCK_JUGADORES = ["Juanlu","WILLY","Mesa","TERRY","Velasco","Rino","Mini","Moi","RAFA NAVARRETE","John"];

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
    // Los partidos los pone cuotas.py con cuotas reales. NO sembramos partidos
    // de prueba: si se colaran, la peña podría apostar a partidos inexistentes.
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
  [["apostar","📋 Apostar"],["ranking","💰 Ranking"],["mias","🧾 Mis apuestas"],["pena","👥 La peña"]].forEach(([k,t]) => {
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
  else if(bTab === "pena") await vPena(m);
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

  /* orden cronológico */
  partidos.sort((a,b) =>
    `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`));

  /* purga del boleto cualquier selección de un partido ya empezado */
  const empezados = new Set(partidos.filter(haEmpezado).map(p => p.id));
  Object.keys(boleto).forEach(c => { if(empezados.has(boleto[c].matchId)) delete boleto[c]; });

  const abiertos = partidos.filter(p => !haEmpezado(p));
  if(!abiertos.length){
    m.appendChild(el(`<div class="empty">No hay partidos abiertos para apostar ahora mismo.</div>`));
  }

  partidos.forEach(p => {
    const cerrado = haEmpezado(p);
    const card = el(`<div class="card bet-match ${cerrado?"bm-cerrado":""}">
      <div class="bm-top"><span class="bm-when">${esc(fechaCorta(p.fecha))} · ${esc(p.hora)}</span>${cerrado?`<span class="bm-lock">🔒 Cerrado</span>`:""}</div>
      <div class="bm-teams"><span>${p.flLocal} ${esc(p.local)}</span><span class="bm-vs">vs</span><span>${esc(p.visitante)} ${p.flVis}</span></div>
    </div>`);
    if(cerrado){ m.appendChild(card); return; }
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
      <input class="bet-stake slip-stake" type="number" inputmode="decimal" min="0.5" max="${MAX_APUESTA}" step="0.5" placeholder="Importe € (máx ${MAX_APUESTA})">
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
    if(stake > MAX_APUESTA){ err.textContent = `Máximo ${fmt(MAX_APUESTA)} por apuesta.`; return; }
    if(stake > saldo){ err.textContent = `Saldo insuficiente: solo ${fmt(saldo)}.`; return; }
    go.disabled = true; go.textContent = "Enviando…";
    try {
      const id = "b" + Date.now();
      await Store.crearApuesta({
        id, jugador: bUser, stake, cuotaTotal: +cuotaTotal.toFixed(4),
        retornoPot: +(stake * cuotaTotal).toFixed(2),
        estado: "pendiente",
        sels: sels.map(s => ({ partido:s.partido, mkId:s.marketId, mkNombre:s.mkNombre, k:s.sel.k, etq:s.sel.etq, cuota:s.sel.cuota })),
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

/* ---------------------------------------------------------------- la peña */
async function vPena(m){
  let aps;
  try { aps = await Store.apuestas(); }
  catch(e){ m.appendChild(el(`<div class="empty">Error cargando apuestas.</div>`)); return; }

  const card = el(`<div class="card"><div class="h2">👥 Apuestas de la peña</div>
    <div class="sub" style="margin-bottom:8px">Todas las apuestas de todos, de la más reciente a la más antigua.</div></div>`);
  if(!aps.length){
    card.appendChild(el(`<div class="empty">Todavía no ha apostado nadie.</div>`));
    m.appendChild(card); return;
  }
  aps.forEach(a => {
    const est = a.estado==="ganada"?"win":a.estado==="perdida"?"lose":"pend";
    const etiq = a.estado==="ganada"?`✅ Ganada +${fmt(a.retornoPot)}`:a.estado==="perdida"?`❌ Perdida −${fmt(a.stake)}`:"⏳ Pendiente";
    const t = el(`<div class="ticket ticket-${est}">
      <div class="tk-top"><span class="tk-est"><b>${esc(a.jugador)}</b> · ${etiq}</span><span class="tk-cuota">×${(+a.cuotaTotal).toFixed(2)}</span></div>
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
