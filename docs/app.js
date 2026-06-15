/* La Porra del Mundial — front-end. Lee datos.json y pinta las vistas. */
let D = null;
const $ = (s, e = document) => e.querySelector(s);
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

const ORDEN_FASE = ["Fase de grupos","Dieciseisavos","Octavos","Cuartos","Semifinales","3º y 4º puesto","Final"];
const SIGNO = { "1":"1", "X":"X", "2":"2" };

function marcador(p){
  if(!p) return "—";
  if(p.local!=null) return `${p.signo!=null?p.signo+" · ":""}${p.local}-${p.visitante}`;
  return p.texto || "—";
}
function fechaCorta(iso){
  if(!iso) return "";
  const d = new Date(iso+"T12:00:00");
  return d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"});
}

/* ---------------------------------------------------------------- carga */
fetch("datos.json?v="+Date.now()).then(r=>r.json()).then(d=>{
  D = d;
  $("#titulo").textContent = d.titulo;
  $("#grupo").textContent = "Porra " + d.grupo;
  $("#meta").innerHTML = `${d.resumen.n_jugadores} jugadores · <b>${d.resumen.n_jugados}</b>/${d.resumen.n_partidos} partidos jugados`
    + `<br>Actualizado: ${new Date(d.actualizado).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}`;
  pinta("clas");
}).catch(e=>{ $("#vista").innerHTML = `<div class="empty">No pude cargar los datos.<br><small>${esc(e)}</small></div>`; });

/* ---------------------------------------------------------------- nav */
document.querySelectorAll("nav button").forEach(b=>{
  b.onclick = () => {
    document.querySelectorAll("nav button").forEach(x=>x.classList.remove("activa"));
    b.classList.add("activa");
    window.dispatchEvent(new Event("apuestas:leave"));
    pinta(b.dataset.v);
    window.scrollTo(0,0);
  };
});

function pinta(v){
  const m = $("#vista");
  if(v==="clas") return vClas(m);
  if(v==="partidos") return vPartidos(m);
  if(v==="quiniela") return vQuiniela(m);
  if(v==="apuestas") return window.vApuestas(m);
  if(v==="honor") return vHonor(m);
}

/* ---------------------------------------------------------------- CLASIFICACIÓN */
function vClas(m){
  const cl = D.clasificacion;
  const max = Math.max(1, ...cl.map(x=>x.total));
  const medalla = p => p===1?"m1":p===2?"m2":p===3?"m3":"";
  const emoji = p => p===1?"🥇":p===2?"🥈":p===3?"🥉":"";
  m.innerHTML = "";
  const card = el(`<div class="card"><div class="h2">🏆 Clasificación general</div></div>`);
  cl.forEach(j=>{
    const f = el(`<div>
      <div class="fila">
        <div class="pos ${medalla(j.pos)}">${emoji(j.pos)||j.pos}</div>
        <div class="nombre">${esc(j.jugador)}
          <div class="barra"><i style="width:${Math.max(3,j.total/max*100)}%"></i></div>
        </div>
        <div class="pts">${j.total}<small>puntos</small></div>
      </div>
      <div class="desglose"></div>
    </div>`);
    const des = $(".desglose", f);
    Object.entries(j.desglose).filter(([,v])=>v>0).forEach(([k,v])=>{
      des.appendChild(el(`<div class="d">${esc(k)}: <b>${v}</b></div>`));
    });
    if(!des.children.length) des.appendChild(el(`<div class="d">Aún sin puntos — esto acaba de empezar 😉</div>`));
    $(".fila",f).onclick = () => des.classList.toggle("abierto");
    card.appendChild(f);
  });
  m.appendChild(card);
  m.appendChild(el(`<div class="sub" style="text-align:center;margin-top:-4px">Toca un jugador para ver su desglose por fases</div>`));
}

/* ---------------------------------------------------------------- PARTIDOS */
let filtroPart = "próximos";
function vPartidos(m){
  m.innerHTML = "";
  const jornadas = [...new Set(D.partidos.filter(p=>p.jornada).map(p=>p.jornada))];
  const fases = ORDEN_FASE.filter(f=>f!=="Fase de grupos" && D.partidos.some(p=>p.fase===f));
  const opciones = ["próximos","jugados","todos", ...jornadas, ...fases];

  const fil = el(`<div class="filtros"></div>`);
  opciones.forEach(o=>{
    const b = el(`<button class="${o===filtroPart?"activa":""}">${esc(cap(o))}</button>`);
    b.onclick = () => { filtroPart = o; vPartidos(m); };
    fil.appendChild(b);
  });
  m.appendChild(fil);

  let lista = D.partidos.slice();
  if(filtroPart==="jugados") lista = lista.filter(p=>p.jugado);
  else if(filtroPart==="próximos") lista = lista.filter(p=>!p.jugado);
  else if(filtroPart.startsWith("J")) lista = lista.filter(p=>p.jornada===filtroPart);
  else if(ORDEN_FASE.includes(filtroPart)) lista = lista.filter(p=>p.fase===filtroPart);

  if(filtroPart==="próximos"){
    lista.sort((a,b)=>(a.fecha||"9").localeCompare(b.fecha||"9"));
    lista = lista.slice(0,16);
  }
  if(filtroPart==="jugados"){
    lista.sort((a,b)=>(b.fecha||"0").localeCompare(a.fecha||"0"));
  }
  if(!lista.length){ m.appendChild(el(`<div class="empty">No hay partidos en este filtro.</div>`)); return; }
  lista.forEach(p=>m.appendChild(matchCard(p)));
}

function matchCard(p){
  const teams = p.equipos || p.codigo.split("-");
  const fl = p.banderas || ["",""];
  const res = p.jugado
    ? `<div class="res">${p.resultado.local}-${p.resultado.visitante}</div>`
    : `<div class="res pend">por jugar</div>`;
  const c = el(`<div class="match">
    <div class="top">
      <span class="badge">${esc(p.fase==="Fase de grupos"?("Grupo "+p.grupo+" · "+p.jornada):p.fase)}</span>
      <span>${esc(fechaCorta(p.fecha))}${p.hora ? " · " + p.hora : ""}</span>
    </div>
    <div class="teams">
      <div class="tm loc">${esc(teams[0])} <span class="fl">${fl[0]||""}</span></div>
      ${res}
      <div class="tm"><span class="fl">${fl[1]||""}</span> ${esc(teams[1])}</div>
    </div>
    <div class="preds"></div>
  </div>`);
  const cont = $(".preds", c);
  const entradas = Object.entries(p.predicciones);
  if(!entradas.length){ cont.appendChild(el(`<span class="sub">Sin predicciones</span>`)); return c; }

  const grupos = {"1":[], "X":[], "2":[]};
  entradas.forEach(([nom,pr])=>{ if(grupos[pr.signo]) grupos[pr.signo].push([nom,pr]); });

  const colHdr = {"1": p.equipos?p.equipos[0]:"1", "X": "Empate", "2": p.equipos?p.equipos[1]:"2"};
  const cols = el(`<div class="pred-cols"></div>`);
  ["1","X","2"].forEach(signo=>{
    const col = el(`<div class="pred-col"></div>`);
    const hdr = el(`<div class="pred-col-hdr"><span class="signo-badge s${signo}">${signo}</span><span class="col-team">${esc(colHdr[signo])}</span></div>`);
    col.appendChild(hdr);
    const lista = grupos[signo];
    if(!lista.length){ col.appendChild(el(`<div class="pred-empty">—</div>`)); }
    else {
      if(p.jugado) lista.sort((a,b)=>(b[1].puntos||0)-(a[1].puntos||0));
      lista.forEach(([nom,pr])=>{
        const pts = pr.puntos||0;
        const hit = p.jugado && pts>0;
        const cls = p.jugado ? (hit?"hit":"miss") : "";
        const ptHtml = p.jugado ? `<span class="pt ${pts>0?"":"z"}">+${pts}</span>` : "";
        col.appendChild(el(`<div class="pred ${cls}">
          <span class="who">${esc(nom)}</span>
          <span class="val">${esc(`${pr.local??""}-${pr.visitante??""}`)}</span>${ptHtml}
        </div>`));
      });
    }
    cols.appendChild(col);
  });
  cont.appendChild(cols);
  return c;
}

/* ---------------------------------------------------------------- QUINIELA jugador */
let jugSel = null;
function vQuiniela(m){
  if(!jugSel) jugSel = D.jugadores[0];
  m.innerHTML = "";
  const sel = el(`<div class="card"><div class="selrow">
    <div class="sel"><label>Ver la quiniela de…</label>
      <select id="js">${D.jugadores.map(j=>`<option ${j===jugSel?"selected":""}>${esc(j)}</option>`).join("")}</select>
    </div></div><div id="qbody"></div></div>`);
  m.appendChild(sel);
  $("#js",sel).onchange = e => { jugSel = e.target.value; vQuiniela(m); };
  const body = $("#qbody", sel);

  const clas = D.clasificacion.find(x=>x.jugador===jugSel);
  body.appendChild(el(`<div class="scoreboard">
    <div><div class="big">${clas?clas.total:0}</div><div class="nm">puntos · ${ordinal(clas?clas.pos:"-")} puesto</div></div>
  </div>`));

  ORDEN_FASE.forEach(fase=>{
    const ps = D.partidos.filter(p=>p.fase===fase && p.predicciones[jugSel]);
    if(!ps.length) return;
    body.appendChild(el(`<div class="h2" style="font-size:.95rem;margin-top:14px">${esc(fase)}</div>`));
    ps.forEach(p=>{
      const pr = p.predicciones[jugSel];
      const teams = p.equipos || p.codigo.split("-");
      const tag = p.jugado ? (pr.puntos>0?`<span class="tag ok">✓ ${pr.puntos}</span>`:`<span class="tag no">✗</span>`) : "";
      const real = p.jugado ? `${p.resultado.local}-${p.resultado.visitante}` : "—";
      body.appendChild(el(`<div class="qline">
        <div class="ql-m">${esc(teams[0])} - ${esc(teams[1])}<small>${esc(fechaCorta(p.fecha))}${p.duelo?"":""}</small></div>
        <div class="ql-p">${esc(marcador(pr))}${tag}</div>
        <div class="ql-r">real<br>${real}</div>
      </div>`));
    });
  });

  // cuadro de honor del jugador
  const hon = D.cuadro_honor.filter(h=>h.predicciones[jugSel]);
  if(hon.length){
    body.appendChild(el(`<div class="h2" style="font-size:.95rem;margin-top:14px">🏅 Cuadro de Honor</div>`));
    hon.forEach(h=>{
      const pr = h.predicciones[jugSel];
      const tag = h.resultado ? (pr.puntos>0?`<span class="tag ok">✓ ${pr.puntos}</span>`:`<span class="tag no">✗</span>`) : "";
      body.appendChild(el(`<div class="qline"><div class="ql-m">${esc(h.concepto)}</div>
        <div class="ql-p">${esc(pr.texto)}${tag}</div></div>`));
    });
  }
}

/* ---------------------------------------------------------------- CUADRO DE HONOR */
function vHonor(m){
  m.innerHTML = "";
  const card = el(`<div class="card"><div class="h2">🏅 Cuadro de Honor</div>
    <div class="sub" style="margin-bottom:8px">Campeón, botas y balones — las apuestas gordas de la porra.</div></div>`);
  D.cuadro_honor.forEach(h=>{
    const real = h.resultado ? `<span class="real">${h.bandera||""} ${esc(h.resultado)} ✓</span>` : `<span class="sub">por decidir</span>`;
    const row = el(`<div class="honor">
      <div class="cc">${esc(h.concepto)}<br>${real}</div>
      <div class="picks"></div>
    </div>`);
    const picks = $(".picks",row);
    Object.entries(h.predicciones).forEach(([nom,pr])=>{
      const hit = h.resultado && pr.puntos>0;
      picks.appendChild(el(`<div class="pk" style="${hit?"border-color:var(--good)":""}">
        <span class="w">${esc(nom)}:</span> ${esc(pr.texto)}${hit?` <b style="color:var(--good)">+${pr.puntos}</b>`:""}</div>`));
    });
    card.appendChild(row);
  });
  m.appendChild(card);
}

/* ---------------------------------------------------------------- utils */
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function ordinal(n){ return (typeof n==="number")?n+"º":n; }
