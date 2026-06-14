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
    pinta(b.dataset.v);
    window.scrollTo(0,0);
  };
});

function pinta(v){
  const m = $("#vista");
  if(v==="clas") return vClas(m);
  if(v==="partidos") return vPartidos(m);
  if(v==="quiniela") return vQuiniela(m);
  if(v==="duelos") return vDuelos(m);
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

/* ---------------------------------------------------------------- EL PIQUE
   Liga paralela de duelos forzados. Cada ronda (J1, J2, J3 y cada fase
   eliminatoria) la máquina empareja a los jugadores con un round-robin
   determinista: nadie elige rival y todos se cruzan con todos.
   Puntos del duelo = puntos de porra en los partidos de esa ronda.
   Victoria 3 pts de pique, empate 1. */

const RONDAS = ["J1","J2","J3","Dieciseisavos","Octavos","Cuartos","Semifinales","3º y 4º puesto","Final"];

function rondaDe(p){ return p.fase==="Fase de grupos" ? p.jornada : p.fase; }

function hashStr(s){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))>>>0; return h; }

/* round-robin clásico (método del círculo): fijo el primero, roto el resto */
function parejasDeRonda(idx){
  const js = D.jugadores.slice();
  if(js.length%2) js.push(null);                  // si son impares, uno libra
  const n = js.length, rest = js.slice(1), k = idx % rest.length;
  const rot = rest.slice(k).concat(rest.slice(0,k));
  const arr = [js[0], ...rot];
  const pares = [];
  for(let i=0;i<n/2;i++) pares.push([arr[i], arr[n-1-i]]);
  return pares;
}

/* estado de un duelo en una ronda */
function duelo(ronda, a, b){
  const ps = D.partidos.filter(p=>rondaDe(p)===ronda);
  const jug = ps.filter(p=>p.jugado);
  const pts = j => jug.reduce((s,p)=>s+(p.predicciones[j]?.puntos||0), 0);
  const pa = pts(a), pb = pts(b);
  const estado = !ps.length ? "sin" : jug.length===ps.length ? "cerrado" : jug.length ? "vivo" : "pendiente";
  return { a, b, pa, pb, estado, total: ps.length, jugados: jug.length };
}

/* frases de vacile — deterministas para que todos vean la misma */
const FRASES = {
  paliza: [
    (g,p,d)=>`${g} le ha metido un repaso de ${d} puntos a ${p}. ${p}, de esta se habla en el grupo.`,
    (g,p,d)=>`Paliza histórica. ${p}, hoy los cafés los pagas tú.`,
    (g,p,d)=>`${p} vino a ver el fútbol; ${g} vino a jugarlo.`,
    (g,p,d)=>`Comunicado oficial: ${g} intratable, ${p} en paradero desconocido.`,
    (g,p,d)=>`${d} puntos de diferencia. ${p}, eso ya no es mala suerte, es currículum.`,
  ],
  normal: [
    (g,p,d)=>`${g} se lleva el duelo con autoridad. ${p}, toca aguantar memes.`,
    (g,p,d)=>`Victoria seria de ${g}. ${p}, la próxima ronda no perdona.`,
    (g,p,d)=>`${g} gana y pasea. ${p}, apunta el nombre, que hay revancha.`,
    (g,p,d)=>`${g} cumple, ${p} promete. Prometer no puntúa.`,
  ],
  ajustada: [
    (g,p,d)=>`${g} gana por la mínima. ${p}, se te escapó vivo… esta vez.`,
    (g,p,d)=>`Photo finish: ${d} puntito${d===1?"":"s"} de nada. ${p}, así duele más.`,
    (g,p,d)=>`${g} lo gana en el descuento. ${p}, mándale la factura al VAR.`,
  ],
  empate: [
    (a,b)=>`${a} y ${b} firman tablas. Par de gallinas pactando.`,
    (a,b)=>`Empate. Ni pa ti ni pa mí: aburridísimos los dos.`,
    (a,b)=>`Tablas entre ${a} y ${b}. El pique queda en deuda, se paga con intereses.`,
  ],
  vivo: [
    (a,b)=>`Duelo al rojo vivo. Cada gol puede cambiar el café de alguien.`,
    (a,b)=>`Esto está abierto. ${a} y ${b}, ojito al marcador.`,
    (a,b)=>`Quedan partidos y ganas de vacilar. Tensión máxima.`,
  ],
  pendiente: [
    (a,b)=>`El bombo ha hablado: ${a} contra ${b}. Que corra el salseo.`,
    (a,b)=>`${a} vs ${b}. Sin elegir, sin excusas, sin piedad.`,
    (a,b)=>`Cruce oficial. ${a} y ${b}, id calentando el dedito de WhatsApp.`,
  ],
};
function frase(tipo, ronda, x, y, d){
  const fs = FRASES[tipo];
  return fs[hashStr(ronda+x+y) % fs.length](x, y, d);
}

/* liga del pique: solo computan rondas cerradas */
function ligaPique(){
  const tabla = {};
  D.jugadores.forEach(j=>tabla[j]={j, v:0, e:0, d:0, pf:0});
  RONDAS.forEach((r,i)=>{
    parejasDeRonda(i).forEach(([a,b])=>{
      if(!a||!b) return;
      const du = duelo(r,a,b);
      if(du.estado!=="cerrado") return;
      tabla[a].pf += du.pa; tabla[b].pf += du.pb;
      if(du.pa>du.pb){ tabla[a].v++; tabla[b].d++; }
      else if(du.pb>du.pa){ tabla[b].v++; tabla[a].d++; }
      else { tabla[a].e++; tabla[b].e++; }
    });
  });
  return Object.values(tabla)
    .map(t=>({...t, pts:t.v*3+t.e}))
    .sort((x,y)=>y.pts-x.pts || y.pf-x.pf || x.j.localeCompare(y.j));
}

let rondaSel = null;
function vDuelos(m){
  m.innerHTML = "";
  // ronda activa por defecto: la primera no cerrada con partidos por delante
  if(!rondaSel){
    rondaSel = RONDAS.find(r=>{
      const ps = D.partidos.filter(p=>rondaDe(p)===r);
      return ps.length && ps.some(p=>!p.jugado);
    }) || RONDAS[0];
  }

  m.appendChild(el(`<div class="card pique-head">
    <div class="h2">🔥 El Pique</div>
    <div class="sub">Cada ronda, la máquina te asigna un rival. Nadie elige, nadie se libra:
    al final del Mundial os habréis cruzado todos con todos. Tus puntos de porra en los
    partidos de la ronda son tu arma. Victoria = 3 pts de pique, empate = 1.</div>
  </div>`));

  // selector de ronda
  const fil = el(`<div class="filtros"></div>`);
  RONDAS.forEach(r=>{
    const b = el(`<button class="${r===rondaSel?"activa":""}">${esc(r)}</button>`);
    b.onclick = () => { rondaSel = r; vDuelos(m); };
    fil.appendChild(b);
  });
  m.appendChild(fil);

  // duelos de la ronda
  const idx = RONDAS.indexOf(rondaSel);
  parejasDeRonda(idx).forEach(([a,b])=>{
    if(!a||!b){
      const libre = a||b;
      m.appendChild(el(`<div class="card pq"><div class="pq-libra">😴 ${esc(libre)} libra esta ronda. Se libra del pique… cobarde.</div></div>`));
      return;
    }
    const du = duelo(rondaSel, a, b);
    const diff = Math.abs(du.pa-du.pb);
    let estadoTxt, fraseTxt, gana=null;
    if(du.estado==="cerrado"){
      if(du.pa===du.pb){ estadoTxt="empate"; fraseTxt=frase("empate",rondaSel,a,b); }
      else {
        gana = du.pa>du.pb ? a : b;
        const pierde = gana===a ? b : a;
        const tipo = diff>=5 ? "paliza" : diff<=2 ? "ajustada" : "normal";
        estadoTxt = "finalizado";
        fraseTxt = frase(tipo, rondaSel, gana, pierde, diff);
      }
    } else if(du.estado==="vivo"){
      estadoTxt = `en juego · ${du.jugados}/${du.total} partidos`;
      fraseTxt = frase("vivo", rondaSel, a, b);
      if(du.pa!==du.pb) gana = du.pa>du.pb ? a : b;
    } else {
      estadoTxt = "por empezar";
      fraseTxt = frase("pendiente", rondaSel, a, b);
    }
    const card = el(`<div class="card pq">
      <div class="pq-top"><span class="badge">${esc(estadoTxt)}</span></div>
      <div class="pq-vs">
        <div class="pq-j ${gana===a?"lead":""}">${esc(a)}<div class="pq-pts">${du.pa}</div></div>
        <div class="pq-dash">⚔️</div>
        <div class="pq-j ${gana===b?"lead":""}">${esc(b)}<div class="pq-pts">${du.pb}</div></div>
      </div>
      <div class="pq-frase">${esc(fraseTxt)}</div>
    </div>`);
    m.appendChild(card);
  });

  // liga del pique
  const liga = ligaPique();
  const algunCerrado = liga.some(t=>t.v+t.e+t.d>0);
  const card = el(`<div class="card"><div class="h2">🏆 Liga del Pique</div>
    <div class="sub" style="margin-bottom:8px">La otra clasificación: la que de verdad da derecho a vacilar.</div>
    <div class="pq-tabla">
      <div class="pq-row pq-hdr"><span>#</span><span>Jugador</span><span>V</span><span>E</span><span>D</span><span>PTS</span></div>
    </div></div>`);
  const cont = $(".pq-tabla", card);
  liga.forEach((t,i)=>{
    cont.appendChild(el(`<div class="pq-row ${i===0&&algunCerrado?"pq-lider":""}">
      <span>${i+1}</span><span class="pq-nom">${esc(t.j)}${i===0&&algunCerrado?" 👑":""}${i===liga.length-1&&algunCerrado?" 🐔":""}</span>
      <span>${t.v}</span><span>${t.e}</span><span>${t.d}</span><span class="pq-p">${t.pts}</span>
    </div>`));
  });
  if(!algunCerrado) cont.appendChild(el(`<div class="sub" style="padding:8px 2px">Aún no se ha cerrado ninguna ronda. El 👑 y el 🐔 están en juego…</div>`));
  m.appendChild(card);
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
