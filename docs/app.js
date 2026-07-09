/* La Porra del Mundial — front-end. Lee datos.json y pinta las vistas. */
let D = null;
const $ = (s, e = document) => e.querySelector(s);
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

const ORDEN_FASE = ["Fase de grupos","Dieciseisavos","Octavos","Cuartos","Semifinales","3º y 4º puesto","Final"];
const SIGNO = { "1":"1", "X":"X", "2":"2" };

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
  if(v==="apuestas") return window.vApuestas(m);
  if(v==="honor") return vHonor(m);
}

/* ---------------------------------------------------------------- bracket eliminatorio */
const KO_FASES = ["Dieciseisavos","Octavos","Cuartos","Semifinales","3º y 4º puesto","Final"];
let _flags=null, _numToPart=null;
function flagOf(team){
  if(!_flags){
    _flags={};
    D.partidos.forEach(p=>{ if(p.equipos&&p.banderas) p.equipos.forEach((e,i)=>{ if(e&&p.banderas[i]) _flags[e]=p.banderas[i]; }); });
  }
  return _flags[team]||"";
}
function numToPart(n){
  // Numera los partidos eliminatorios 73,74,… en orden de fase e id (estándar FIFA).
  if(!_numToPart){
    _numToPart={}; let mn=73;
    KO_FASES.forEach(f=>{ D.partidos.filter(p=>p.fase===f).sort((a,b)=>a.id-b.id).forEach(p=>{ _numToPart[mn++]=p; }); });
  }
  return _numToPart[n];
}
function teamsOf(s){ return String(s||"").split("-").map(x=>x.trim()).filter(Boolean); }
function ganadorReal(p){
  if(!p.jugado||!p.resultado) return null;
  if(p.resultado.ganador) return p.resultado.ganador;
  const t=teamsOf(p.codigo);
  if(p.resultado.signo==="1") return t[0];
  if(p.resultado.signo==="2") return t[1];
  return null;
}
function ganadoresPosibles(p){
  if(!p) return [];
  const g=ganadorReal(p);
  if(g) return [g];
  return ladosCruce(p).flat();
}
function perdedoresPosibles(p){
  // Para el 3º·4º puesto: los que pueden PERDER la semifinal (L101/L102).
  if(!p) return [];
  const g=ganadorReal(p);
  const todos=ladosCruce(p).flat();
  return g ? todos.filter(t=>t!==g) : todos;
}
function posiblesToken(t){
  const m=String(t||"").match(/^([WL])(\d+)$/);
  if(!m) return [t].filter(Boolean);
  const p=numToPart(+m[2]);
  return m[1]==="W" ? ganadoresPosibles(p) : perdedoresPosibles(p);
}
function ladosCruce(p){
  // [potA, potB] = equipos que aún pueden ocupar cada lado del cruce.
  const t=teamsOf(p.codigo);
  return [posiblesToken(t[0]), posiblesToken(t[1])];
}
function keyCruce(a,b){ return [a,b].slice().sort().join(" :: "); }
let _predCruce = {};
function predsCruceFase(fase){
  // {jugador: {claveCruce: predicción}} — cruces que cada jugador predijo en esa ronda,
  // en CUALQUIER casilla (el Excel puntúa el cruce esté donde esté en su cuadro).
  if(_predCruce[fase]) return _predCruce[fase];
  const m={};
  D.partidos.filter(p=>p.fase===fase).forEach(p=>{
    Object.entries(p.predicciones).forEach(([j,pr])=>{
      if(pr&&pr.duelo){ const t=teamsOf(pr.duelo); if(t.length===2) (m[j]=m[j]||{})[keyCruce(t[0],t[1])]=pr; }
    });
  });
  return _predCruce[fase]=m;
}
function elegibleCruce(p,j){
  // ¿Tiene el jugador j, en cualquier casilla de esta ronda, un cruce que pueda
  // disputarse en este hueco? Devuelve esa predicción (para mostrarla) o null.
  // (da igual el orden local/visitante y da igual en qué casilla la colocó)
  const m=predsCruceFase(p.fase)[j];
  if(!m) return null;
  const [A,B]=ladosCruce(p);
  for(const k in m){
    const pr=m[k], t=teamsOf(pr.duelo);
    if(t.length!==2) continue;
    if((A.includes(t[0])&&B.includes(t[1])) || (A.includes(t[1])&&B.includes(t[0]))) return pr;
  }
  return null;
}
const NEXT_FASE = { "Dieciseisavos":"Octavos", "Octavos":"Cuartos", "Cuartos":"Semifinales", "Semifinales":"Final" };
let _mapaEq = {};
function mapaEquipos(fase){
  // {equipo: [jugadores que lo predijeron en esa fase]} — a partir de los duelos
  if(_mapaEq[fase]) return _mapaEq[fase];
  const m={};
  D.partidos.filter(p=>p.fase===fase).forEach(p=>{
    Object.entries(p.predicciones).forEach(([j,pr])=>{
      if(pr&&pr.duelo) teamsOf(pr.duelo).forEach(t=>{ (m[t]=m[t]||new Set()).add(j); });
    });
  });
  Object.keys(m).forEach(t=>m[t]=[...m[t]]);
  return _mapaEq[fase]=m;
}
function benef(team,fase){ return mapaEquipos(fase)[team]||[]; }

function stakesUpcoming(p, cont){
  // Vista por jugador de un partido por venir: qué puede puntuar cada uno aquí.
  // 🎯 resultado (si acertó el cruce, reorientado al local/visitante real) y
  // 🔜 +1 punto «Equipos» según qué equipo se clasifique a la siguiente ronda.
  const [potA,potB] = ladosCruce(p);
  const resolved = potA.length===1 && potB.length===1;   // cruce ya definido (aunque el código siga siendo Wnn-Wnn)
  const real = resolved ? [potA[0],potB[0]] : teamsOf(p.codigo);
  const nf = NEXT_FASE[p.fase];

  const rows = D.jugadores.map(j=>{
    const raw = elegibleCruce(p,j);
    const pr = raw && resolved ? reorientar(real,raw) : raw;
    const eq = [];
    if(resolved){
      if(p.fase==="Semifinales"){
        real.forEach(t=>{
          if(benef(t,"Final").includes(j)) eq.push(`+1 si ${flagOf(t)} ${esc(t)} <b>gana</b> (final)`);
          if(benef(t,"3º y 4º puesto").includes(j)) eq.push(`+1 si ${flagOf(t)} ${esc(t)} <b>pierde</b> (3º·4º)`);
        });
      } else if(nf){
        const suyos = real.filter(t=>benef(t,nf).includes(j));
        if(suyos.length===2) eq.push(`+1 pase quien pase`);
        else if(suyos.length===1) eq.push(`+1 si pasa ${flagOf(suyos[0])} ${esc(suyos[0])}`);
      }
    }
    return {j, pr, raw, eq};
  });
  rows.sort((a,b)=>((b.pr?2:0)+(b.eq.length?1:0))-((a.pr?2:0)+(a.eq.length?1:0)));
  const con = rows.filter(r=>r.pr||r.eq.length);
  const sin = rows.filter(r=>!r.pr&&!r.eq.length);

  cont.appendChild(el(`<div class="preds-nota">Qué se juega cada uno · <span class="nk-res">🎯 resultado</span> (acertó el cruce) · <span class="nk-eq">🔜 +1 «Equipos»</span> por clasificado</div>`));
  if(!con.length){ cont.appendChild(el(`<div class="pred-empty">Nadie puede puntuar en este partido.</div>`)); }
  con.forEach(r=>{
    const b = [];
    if(r.pr) b.push(`<span class="stk-res"><span class="signo-badge s${r.pr.signo}">${r.pr.signo}</span>${r.pr.local}-${r.pr.visitante}${resolved?"":` <small>${esc(r.raw.duelo)}</small>`}</span>`);
    r.eq.forEach(t=>b.push(`<span class="stk-eq">🔜 ${t}</span>`));
    cont.appendChild(el(`<div class="stk"><span class="stk-nom">${esc(r.j)}</span><span class="stk-b">${b.join("")}</span></div>`));
  });
  if(sin.length) cont.appendChild(el(`<div class="stk-fuera">Sin opciones aquí: ${sin.map(r=>esc(r.j)).join(" · ")}</div>`));
}
function reorientar(real,pr){
  // Orienta la predicción al local/visitante del cruce real (par de equipos ya conocido).
  if(!real || real.length!==2 || !pr || !pr.duelo) return pr;
  const dt=teamsOf(pr.duelo);
  if(dt.length!==2) return pr;
  if(dt[0]===real[1] && dt[1]===real[0]){
    const flip={"1":"2","2":"1","X":"X"};
    return {...pr, signo:flip[pr.signo]||pr.signo, local:pr.visitante, visitante:pr.local};
  }
  return pr;
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
  const esKO = p.fase!=="Fase de grupos";
  const filtraElegibles = esKO && !p.jugado;   // solo quien puede puntuar el cruce
  let teams;
  if(p.equipos) teams = p.equipos;
  else if(/^[WL]\d+-[WL]\d+$/.test(p.codigo)){ const [SA,SB]=ladosCruce(p); teams=[SA.join("/"),SB.join("/")]; }
  else teams = teamsOf(p.codigo);
  const fl = p.banderas || teams.map(t=>flagOf(t));
  const pen = p.resultado?.penaltis ? `<small>pen. ${p.resultado.penaltis.local}-${p.resultado.penaltis.visitante}</small>` : "";
  const res = p.jugado
    ? `<div class="res">${p.resultado.local}-${p.resultado.visitante}${pen}</div>`
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
  if(filtraElegibles){ stakesUpcoming(p, cont); return c; }
  const entradas = Object.entries(p.predicciones);
  if(!entradas.length){ cont.appendChild(el(`<span class="sub">Sin predicciones</span>`)); return c; }

  const grupos = {"1":[], "X":[], "2":[]};
  entradas.forEach(([nom,pr])=>{ if(grupos[pr.signo]) grupos[pr.signo].push([nom,pr]); });

  const colHdr = {"1": teams[0]||"1", "X": "Empate", "2": teams[1]||"2"};
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
