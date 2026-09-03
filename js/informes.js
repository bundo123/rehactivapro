import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor, ALL_HOURS, DAYS, getDisplayAge, doneActual, doneEnLog, diagConCie, orderedTherapists, dmy, CONFIG_CLINICA, buildEvaSvg, limpiarParte, MES_LARGO, MES_CORTO, semanaRango, citasEnFechas, citasEnPrefijo, resumenCitas, hastaHoy, findBlock, ocupacionTerapeuta } from './utils.js';
import { apptSlots } from './agenda.js';
import { genSemanalAI, genMensualAI, genAnualAI, genPatientAI, getLastNarrative, clearLastNarrative, renderNarrativeHtml } from './ia.js';
import { hasPermission } from './permissions.js';
import { LOGO_DATA_URI } from './pdf-logo.js';
import { generarInformeWord } from './word.js';

export { genSemanalAI, genMensualAI, genAnualAI, genPatientAI };

// ── Helpers de informes (cálculo sobre state real) ──
// Contexto del último informe renderizado (episodio-aware) para que exportarPDF use exactamente los mismos datos que la pantalla.
let _rptCtx = null;

function _ym(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; } // m 0-based
function _prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return _ym(d.getFullYear(), d.getMonth());
}
// prefix = 'YYYY-MM' (mes) o 'YYYY' (año). Alias fino sobre los helpers de utils.js: la pantalla
// y el prompt de la IA calculan conf/noas/continuidad con la MISMA fórmula, no con dos copias.
// continuidad = null si no hubo citas decididas (sin NaN ni un 0% falso).
// hastaHoy: por acá pasan TODAS las tarjetas de mensual y anual. Un rango en curso trae conf
// futuras ya agendadas; contarlas daba una continuidad que no cuadraba con "Asistidas" (54 y 14
// mostraban 89% en vez de 79%). Un mes/año ya cerrado no se mueve: todas sus citas son <= hoy.
const _apptStats = prefix => resumenCitas(hastaHoy(citasEnPrefijo(state.appointments, prefix), new Date()));
function _nuevos(prefix) {
  return state.patients.filter(p => p.createdAt && p.createdAt.startsWith(prefix)).length;
}
// Chip de variación honesto. kind:'pct'|'abs'. goodWhenUp: si subir es bueno (verde).
// Período anterior sin datos -> '—'. % con prev===0 -> '—' (jamás dividir por cero). Nunca inventa.
// `prevHasData` y `lbl` llegan del caller (antes se derivaban de un 'YYYY-MM'): la misma tarjeta la
// pintan ahora semanal ('vs sem. anterior'), mensual ('vs jul') y anual ('vs 2025').
function _deltaChip(cur, prev, prevHasData, lbl, kind, goodWhenUp) {
  if (!prevHasData) return '<div class="stat-chg neu">—</div>';
  let txt, dir;
  if (kind === 'pct') {
    if (prev === 0) return '<div class="stat-chg neu">—</div>';
    const pct = Math.round((cur - prev) / prev * 100);
    dir = Math.sign(pct);
    txt = (pct > 0 ? '+' : '') + pct + '% ' + lbl;
  } else {
    const d = cur - prev;
    dir = Math.sign(d);
    txt = (d > 0 ? '+' : '') + d + ' ' + lbl;
  }
  const cls = dir === 0 ? 'neu' : ((dir > 0) === goodWhenUp ? 'up' : 'down');
  return `<div class="stat-chg ${cls}">${txt}</div>`;
}

// El mes seleccionado vive en state (no en un módulo) porque lo leen dos módulos: renderMensual
// para pintar y genMensualAI para acotar el rango que se le manda a la IA.
export function changeMensualMonth(ym) { state.informesMes = ym; renderMensual(); }
// Idem para el año del informe anual (null = año actual): lo leen renderAnual y genAnualAI.
export function changeAnualYear(y) { state.informesAnio = Number(y) || null; renderAnual(); }

// Todos los días 'YYYY-MM-DD' de un mes ('YYYY-MM') o de un año ('YYYY'). Es lo que necesita
// capacidadSlots para el denominador de la ocupación: ella misma descarta finde y futuro.
function _diasDelPrefijo(prefix) {
  const p = String(prefix || '');
  const [y, m] = p.split('-').map(Number);
  const out = [];
  const meses = m ? [m - 1] : [0,1,2,3,4,5,6,7,8,9,10,11];
  meses.forEach(mi => {
    const n = new Date(y, mi + 1, 0).getDate();
    for (let d = 1; d <= n; d++) out.push(`${y}-${String(mi + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  });
  return out;
}
// Pacientes creados dentro de una lista de fechas (el equivalente semanal de _nuevos(prefijo)).
function _nuevosEnFechas(dates) {
  const set = new Set(dates || []);
  return state.patients.filter(p => p.createdAt && set.has(String(p.createdAt).slice(0, 10))).length;
}
// '3 sep 09:14' — sello del momento en que se generó la lectura con IA.
function _fmtGen(ts) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getDate()} ${MES_CORTO[d.getMonth()].toLowerCase()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Rediseño: mapa de calor en escala de azules de marca; texto blanco desde 70%.
function hmColBlue(p){
  if(p===null||p===0) return '#f5f2ea';
  if(p<50) return 'rgba(41,171,226,.15)';
  if(p<70) return 'rgba(41,171,226,.3)';
  if(p<88) return 'rgba(41,171,226,.5)';
  if(p<95) return '#1d8fbf';
  return '#155b7a';
}
function hmTxtBlue(p){ return p>=70?'#fff':'#155b7a'; }
// Umbrales de utilización por terapeuta (rediseño): ≥80 verde / ≥60 ámbar / <60 rojo.
function utilColor(u){ return u>=80?'#1D9E75':u>=60?'#F5A623':'#E24B4A'; }
function utilText(u){ return u>=80?'#17865f':u>=60?'#a06a00':'#c33a3a'; }

// Color por umbral del % de Sesiones (progreso): ≥66 verde / 33–65 amarillo / <33 rojo.
// (Continuidad usa su propia escala 85/70, no esta.)
function pctColor(v){ return v>=66?'#1D9E75':v>=33?'#BA7517':'#E24B4A'; }
// Color del dolor EVA por valor (escala clínica estándar): 7–10 rojo (severo) / 4–6 amarillo
// (moderado) / 1–3 verde (leve) / 0 azul (sin dolor). Solo para pantalla — debe concordar con las
// bandas hardcodeadas en buildEvaSvg (utils.js), que usa su propia escala 0/3/6/10 para el PDF/Word.
function evaColor(v){ return v>=7?'#E24B4A':v>=4?'#E0A850':v>=1?'#1D9E75':'#29ABE2'; }
// Fuente ÚNICA de la semana visible (Lun–Vie) derivada de state.currentWeek.
// La usan renderSemanal y renderHeatmap para que las flechas de navegación muevan
// DATOS y rótulo de forma consistente.
function semanaVisible() {
  return semanaRango(state.currentWeek);
}

// ── Esqueleto común de las tres pestañas (FILA 1 + FILA 2) ───────────────────
// Semanal, mensual y anual son el MISMO tablero con otro rango: cuatro tarjetas, ocupación por
// terapeuta y la lectura de la IA. Antes cada render tenía su copia (semanal 3 tarjetas, mensual
// 4 con otros nombres, anual 4 con otros más) y el mismo dato salía con nombre distinto según la
// pestaña. Acá se arma una sola vez; cada render solo concatena SU fila 3.
// cfg = { citas, citasPrev, dates, labelPrev, labelPeriodo, aiId, tab, nuevos, nuevosPrev, subAsistidas }
//   · citas y citasPrev YA vienen recortadas al rango y a hasta-hoy por el caller.
//   · el período anterior "tiene datos" si trajo alguna cita: los tres rangos previos (semana, mes
//     y año anteriores) están enteros en el pasado, así que hastaHoy no los recorta.
//   · subAsistidas: línea extra bajo el chip de Asistidas (el anual mete ahí los pacientes únicos).
const _GEN_FN = { semanal: 'genSemanalAI', mensual: 'genMensualAI', anual: 'genAnualAI' };

function renderEsqueleto(cfg) {
  const cur = resumenCitas(cfg.citas);
  const prev = resumenCitas(cfg.citasPrev);
  const prevHas = cfg.citasPrev.length > 0;

  // % de inasistencia sobre DECIDIDAS, la misma base que la continuidad (son complementarias):
  // sobre el total, las pendientes sin marcar lo maquillarían hacia abajo.
  const dec = cur.conf + cur.noas;
  const pctNoas = dec > 0 ? Math.round(cur.noas / dec * 100) : null;
  const contColor = cur.continuidad == null ? '#6b6a64' : cur.continuidad >= 85 ? '#1D9E75' : cur.continuidad >= 70 ? '#BA7517' : '#E24B4A';

  const fila1 = `<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Asistidas</div><div class="stat-val">${cur.conf}</div>
      ${_deltaChip(cur.conf, prev.conf, prevHas, cfg.labelPrev, 'pct', true)}${cfg.subAsistidas ? `<div class="stat-chg neu">${esc(cfg.subAsistidas)}</div>` : ''}</div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div>
      <div class="stat-val" style="color:#E24B4A">${cur.noas}${pctNoas == null ? '' : ` <span style="font-size:13px;color:#7a7a76;font-weight:600">· ${pctNoas}%</span>`}</div>
      ${_deltaChip(cur.noas, prev.noas, prevHas, cfg.labelPrev, 'abs', false)}</div>
    <div class="stat"><div class="stat-lbl">Continuidad</div>
      <div class="stat-val" style="color:${contColor}">${cur.continuidad == null ? '—' : cur.continuidad + '%'}</div>
      <div class="stat-chg neu">Meta 85% · asistidas / decididas</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes nuevos</div><div class="stat-val">${cfg.nuevos}</div>
      ${_deltaChip(cfg.nuevos, cfg.nuevosPrev, prevHas, cfg.labelPrev, 'abs', true)}</div>
  </div>`;

  return fila1 + `<div class="inf-grid">${_panelTerapeutas(cfg)}${_panelIA(cfg)}</div>`;
}

// Panel "Por terapeuta": asistidas, faltas y ocupación real (slots usados / capacidad del rango).
// Reemplaza al panel de desempeño que solo existía en el semanal, y que además dividía
// CANTIDAD de citas entre SLOTS de capacidad.
function _panelTerapeutas(cfg) {
  const TH = 'font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#9c9a92;text-align:left;padding:4px 6px 6px 0;font-weight:700';
  const THN = TH + ';text-align:right;padding-right:14px';
  const TD = 'padding:7px 6px 7px 0;border-top:1px solid rgba(0,0,0,.05);font-size:12px;vertical-align:middle';
  const TDN = TD + ';text-align:right;padding-right:14px;font-variant-numeric:tabular-nums';
  const hoy = new Date();

  const filas = orderedTherapists().map(th => {
    const o = ocupacionTerapeuta(th, cfg.citas, cfg.dates, state.blocks, hoy);
    const c = getColor(th.colorId);
    // Sin capacidad en el rango (terapeuta sin turno, o rango sin días hábiles transcurridos) el %
    // es null: se dice '—', no un 0% que parecería un terapeuta ocioso.
    const ocup = o.pct == null
      ? '<span style="font-size:11px;color:#9c9a92">—</span>'
      : `<div style="display:flex;align-items:center;gap:8px"><div class="util-bar" style="flex:1;margin:0"><div class="util-fill" style="width:${Math.min(o.pct, 100)}%;background:${utilColor(o.pct)}"></div></div>`
        + `<b style="width:36px;text-align:right;color:${utilText(o.pct)}">${o.pct}%</b></div>`;
    return `<tr><td style="${TD};width:34px"><span class="avatar" style="background:${c.bg};color:${c.text}">${esc(th.initials)}</span></td>`
      + `<td style="${TD}"><b>${esc(th.name)}</b></td>`
      + `<td style="${TDN}">${o.asistidas}</td>`
      + `<td style="${TDN};color:#c33a3a">${o.noas}</td>`
      + `<td style="${TD};width:34%">${ocup}</td></tr>`;
  }).join('');

  return `<div class="panel">
    <div class="panel-title">Por terapeuta <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#9c9a92">ocupación = slots usados / capacidad del período</span></div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${TH}"></th><th style="${TH}">Terapeuta</th><th style="${THN}">Asistidas</th><th style="${THN}">Faltas</th><th style="${TH};width:34%">Ocupación</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>`;
}

// Panel "Lectura del período (IA)". Se pinta SIEMPRE, en tres estados (vacío / cargando / generado).
// Sin permiso viewAI no hay botón, pero el panel no desaparece: que exista explica por qué el
// resto del equipo ve un tablero sin análisis.
function _panelIA(cfg) {
  const ia = state.informesIA[cfg.tab] || {};
  const puede = hasPermission('viewAI');
  const btn = puede
    ? `<button class="ai-btn" style="padding:5px 12px" onclick="${_GEN_FN[cfg.tab]}()">${ia.text ? 'Regenerar' : 'Generar con IA'}</button>`
    : '';
  const body = ia.loading
    ? `<div class="ia-body" id="${cfg.aiId}">⏳ Generando…</div>`
    : ia.text
      ? `<div class="ia-body" id="${cfg.aiId}">${esc(ia.text)}</div>`
      : `<div class="ia-body empty" id="${cfg.aiId}">Todavía no generaste la lectura de ${esc(cfg.labelPeriodo)}.</div>`;
  const meta = ia.text && ia.at ? `Generado ${_fmtGen(ia.at)} · ${esc(ia.label || cfg.labelPeriodo)}` : '';
  return `<div class="ia-panel">
    <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px">Lectura del período${btn}</div>
    ${body}
    <div class="ia-meta"><span>${meta}</span><span>${puede ? '' : 'Solo admin'}</span></div>
  </div>`;
}

export function renderHeatmap() {
  const {dates:semDates}=semanaVisible();
  // Ocupan agenda esta semana: confirmadas + pendientes (excluye no-asistencias).
  const semAppts=state.appointments.filter(a=>semDates.includes(a.date)&&(a.status==='conf'||a.status==='pend'));
  let html=`<div class="heatmap-grid" style="grid-template-columns:50px repeat(5,1fr)"><div class="hm-hdr"></div>`;
  DAYS.forEach(d=>{html+=`<div class="hm-hdr">${d}</div>`;});
  ALL_HOURS.forEach(hr=>{
    html+=`<div class="hm-lbl">${hr}:00</div>`;
    DAYS.forEach((d,di)=>{
      const date=semDates[di];
      // Capacidad de la celda = sub-slots de 30' de los terapeutas dentro de [hr, hr+1), menos
      // los que estén bloqueados ese día. El ALMUERZO no entra acá a propósito: lunch_minutes es
      // una cantidad diaria SIN hora fija, así que baja la ocupación agregada (capacidadSlots)
      // pero no se puede ubicar en una celda hora×día sin inventar a qué hora almuerza cada uno.
      let cap=0;
      state.therapists.forEach(t=>{
        [hr, hr+0.5].forEach(h=>{
          if(h<t.startH||h>=t.endH) return;
          if(findBlock(state.blocks,{date,therapistId:t.id,hour:h,duration:30})) return;
          cap++;
        });
      });
      if(!cap){ html+=`<div class="hm-cell" style="background:#f0efe8"><span style="font-size:9px;color:#444">—</span></div>`; return; }
      // Ocupados = sub-slots de citas (conf+pend) de ese día que caen en [hr, hr+1).
      let occ=0;
      semAppts.forEach(a=>{ if(a.date!==date)return; apptSlots(a).forEach(s=>{ if(s===hr||s===hr+0.5)occ++; }); });
      const p=Math.round(occ/cap*100);
      html+=`<div class="hm-cell" style="background:${hmColBlue(p)};color:${hmTxtBlue(p)}">${p}%<div class="tooltip-val">${d} ${hr}:00 — ${occ}/${cap} · ${p}%</div></div>`;
    });
  });
  html+='</div>';
  document.getElementById('heatmap-container').innerHTML=html;
  renderHeatmapLegend();
}

// Leyenda derivada de hmColBlue() (un valor representativo por tramo) para que los swatches
// concuerden SIEMPRE con lo pintado en las celdas.
function renderHeatmapLegend() {
  const el=document.getElementById('heatmap-legend'); if(!el) return;
  const vals=[30,60,80,90,100];
  el.innerHTML='<span>0%</span>'+vals.map(v=>`<div style="width:11px;height:11px;border-radius:3px;background:${hmColBlue(v)}"></div>`).join('')+'<span>100%</span>';
}

export function changeWeek(d) {
  state.currentWeek+=d;
  renderSemanal();
}

export function updateWeekLabel() {
  const {start:s}=semanaVisible();
  const e=new Date(s);e.setDate(s.getDate()+4);
  const f=x=>`${x.getDate()} ${MES_CORTO[x.getMonth()].toLowerCase()}`;
  document.getElementById('week-lbl').textContent=`${f(s)} – ${f(e)} ${e.getFullYear()}`;
}

export function renderSemanal() {
  updateWeekLabel();
  const hoy = new Date();
  const { dates: semDates } = semanaVisible();
  const { dates: prevDates } = semanaRango(state.currentWeek - 1);
  const semAppts = state.appointments.filter(a => semDates.includes(a.date));
  // TODO lo que se muestra como tasa o acumulado se cuenta sobre lo que YA ocurrió: la semana en
  // curso trae conf futuras y, si entran, la continuidad no cuadra con "Asistidas" (que sí las
  // excluye). Lo que sigue ocupando agenda —el mapa de calor— usa semAppts, no esto.
  const semHasta = hastaHoy(semAppts, hoy);
  const prevHasta = hastaHoy(citasEnFechas(state.appointments, prevDates), hoy);
  const noas = semHasta.filter(a => a.status === 'noas');
  const f = ds => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds); return m ? `${Number(m[3])} ${MES_CORTO[Number(m[2]) - 1].toLowerCase()}` : ds; };

  const html = renderEsqueleto({
    citas: semHasta, citasPrev: prevHasta, dates: semDates,
    labelPrev: 'vs sem. anterior',
    labelPeriodo: `la semana del ${f(semDates[0])} al ${f(semDates[4])}`,
    aiId: 'ia-semanal', tab: 'semanal',
    nuevos: _nuevosEnFechas(semDates), nuevosPrev: _nuevosEnFechas(prevDates),
  })
  // FILA 3 del semanal: dónde ofrecer turnos y a quién llamar hoy. Es lo único propio de la semana.
  + `<div class="panel" style="margin-bottom:12px">
    <div class="panel-title">Mapa de calor — utilización por hora y día</div>
    <div id="heatmap-container"></div>
    <div id="heatmap-legend" style="display:flex;align-items:center;gap:5px;margin-top:10px;font-size:10px;color:#9c9a92"></div>
  </div>`
  + (function () {
    if (!noas.length) return '';
    let r = '<div class="panel"><div class="panel-title">No asistieron — requieren seguimiento</div>';
    noas.slice(0, 6).forEach(function (a) {
      var pt = getPatient(a.patientId); var th = getTherapist(a.therapistId);
      var tel = pt && pt.tel ? '593' + pt.tel.replace(/[^0-9]/g, '').slice(-9) : '';
      var waBtn = tel ? '<button onclick="window.open(\'https://wa.me/' + tel + '\',\'_blank\')" style="font-size:10px;padding:3px 10px;background:rgba(37,160,90,.12);color:#25a05a;border:none;border-radius:99px;cursor:pointer;font-weight:600;font-family:inherit">WA</button>' : '';
      r += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(226,75,74,.08)">'
        + '<div><div style="font-size:12px;font-weight:600;color:#1a1917">' + esc(pt ? pt.name : 'Paciente') + '</div>'
        + '<div style="font-size:10px;color:#9c9a92">' + a.date + (th ? ' · ' + esc(th.name) : '') + '</div></div>'
        + waBtn + '</div>';
    });
    r += '</div>'; return r;
  })();

  document.getElementById('semanal-stats').innerHTML = html;
  renderHeatmap();
}

export function showSubTab(n, btn) {
  state.informesSubTab = n;   // sub-tab visible (define el rango que analiza su propio botón de IA)
  ['semanal', 'mensual', 'anual'].forEach(t => document.getElementById('subtab-' + t).style.display = t === n ? '' : 'none');
  // Selector de período contextual: cada pestaña tiene el suyo, y siempre en el mismo lugar del header.
  const wn = document.getElementById('informes-week-nav');
  if (wn) wn.style.display = n === 'semanal' ? '' : 'none';
  const sm = document.getElementById('informes-mes'); if (sm) sm.hidden = n !== 'mensual';
  const sa = document.getElementById('informes-anio'); if (sa) sa.hidden = n !== 'anual';
  document.querySelectorAll('#tab-informes .sub-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active');
  if (n === 'semanal') renderSemanal(); if (n === 'mensual') renderMensual(); if (n === 'anual') renderAnual();
}

export function renderMensual() {
  const now = new Date();
  const curYm = _ym(now.getFullYear(), now.getMonth());
  if (!state.informesMes) state.informesMes = curYm;
  const ym = state.informesMes;
  const pym = _prevYm(ym);
  const [y, mo] = ym.split('-').map(Number);

  // Opciones del selector: meses con datos + siempre el mes actual, desc. El <select> vive en el
  // header (#informes-mes), no dentro del contenido, que se re-pinta entero en cada render.
  const sel = document.getElementById('informes-mes');
  if (sel) {
    const mset = new Set([curYm]);
    state.appointments.forEach(a => { if (a.date) mset.add(a.date.slice(0, 7)); });
    state.patients.forEach(p => { if (p.createdAt) mset.add(p.createdAt.slice(0, 7)); });
    sel.innerHTML = [...mset].filter(Boolean).sort().reverse().map(m => {
      const [yy, mm] = m.split('-').map(Number);
      return `<option value="${m}"${m === ym ? ' selected' : ''}>${MES_LARGO[mm - 1]} ${yy}</option>`;
    }).join('');
  }

  // FILA 3 del mensual ("Dejaron de venir" y "Nuevos por doctor referente"): lote 4c.
  document.getElementById('mensual-content').innerHTML = renderEsqueleto({
    citas: hastaHoy(citasEnPrefijo(state.appointments, ym), now),
    citasPrev: hastaHoy(citasEnPrefijo(state.appointments, pym), now),
    dates: _diasDelPrefijo(ym),
    labelPrev: 'vs ' + MES_CORTO[parseInt(pym.split('-')[1], 10) - 1].toLowerCase(),
    labelPeriodo: `${MES_LARGO[mo - 1]} ${y}`,
    aiId: 'ia-mensual', tab: 'mensual',
    nuevos: _nuevos(ym), nuevosPrev: _nuevos(pym),
  });
}

export function renderAnual() {
  const now = new Date();
  const year = Number(state.informesAnio) || now.getFullYear();
  const ystr = String(year);
  const enCurso = year === now.getFullYear();

  // Opciones del selector de año: años con citas + siempre el actual, desc.
  const sel = document.getElementById('informes-anio');
  if (sel) {
    const yset = new Set([String(now.getFullYear())]);
    state.appointments.forEach(a => { if (a.date) yset.add(String(a.date).slice(0, 4)); });
    sel.innerHTML = [...yset].filter(Boolean).sort().reverse()
      .map(yy => `<option value="${yy}"${yy === ystr ? ' selected' : ''}>${yy}</option>`).join('');
  }

  const citas = hastaHoy(citasEnPrefijo(state.appointments, ystr), now);
  const citasPrev = hastaHoy(citasEnPrefijo(state.appointments, String(year - 1)), now);
  // Los pacientes distintos del año son el único acumulado que no pasa por _apptStats. Ya no
  // tienen tarjeta propia: son la segunda línea de "Asistidas", que es de lo que hablan.
  const uniq = new Set(citas.map(a => a.patientId)).size;

  let html = renderEsqueleto({
    citas, citasPrev, dates: _diasDelPrefijo(ystr),
    labelPrev: `vs ${year - 1}`, labelPeriodo: ystr,
    aiId: 'ia-anual', tab: 'anual',
    nuevos: _nuevos(ystr), nuevosPrev: _nuevos(String(year - 1)),
    subAsistidas: `${uniq} paciente${uniq !== 1 ? 's' : ''} distinto${uniq !== 1 ? 's' : ''}`,
  });

  // FILA 3 del anual: la forma del año. Dos series en el MISMO gráfico —asistidas (conteo) e
  // inasistencia (%)— con su propio eje cada una; en un solo eje un 8% junto a 400 sesiones es
  // una línea pegada al piso que no se puede leer.
  const perMes = [];
  for (let m = 0; m < 12; m++) perMes.push(resumenCitas(citasEnPrefijo(citas, _ym(year, m))));
  // Mes sin citas = null, no 0: Chart.js deja el hueco. Un 0 dibujaría una caída a cero que no
  // ocurrió (diciembre "cae" solo porque todavía no llegó).
  const asisArr = perMes.map(s => s.total > 0 ? s.conf : null);
  const inasArr = perMes.map(s => { const d = s.conf + s.noas; return s.total > 0 && d > 0 ? Math.round(s.noas / d * 100) : null; });

  html += `<div class="panel" style="margin-bottom:12px">
    <div class="panel-title">Asistidas e inasistencia por mes · ${year} <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#9c9a92">¿crece? ¿qué meses caen?</span></div>
    <canvas id="anual-chart" height="80"></canvas>
  </div>`;

  // Tabla mes a mes. El Total NO es la suma de las filas: sale de _apptStats(año) entero, igual
  // que las tarjetas de arriba — la continuidad de un año no es el promedio de doce porcentajes.
  const TH = 'font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#9c9a92;text-align:left;padding:4px 6px 6px 0;font-weight:700';
  const THN = TH + ';text-align:right;padding-right:14px';
  const TD = 'padding:7px 6px 7px 0;border-top:1px solid rgba(0,0,0,.05);font-size:12px';
  const TDN = TD + ';text-align:right;padding-right:14px;font-variant-numeric:tabular-nums';
  const TOP = 'border-top:2px solid rgba(41,171,226,.3)';
  const anual = _apptStats(ystr);
  const filas = perMes.map((sm, m) => {
    const chip = enCurso && m === now.getMonth()
      ? ' <span style="font-size:9.5px;font-weight:700;color:#1d8fbf;background:rgba(41,171,226,.14);border-radius:99px;padding:1px 7px">en curso</span>' : '';
    // Mes sin ninguna cita: '—' en todo. Vale igual para un mes futuro y para uno vacío: no hubo
    // nada que medir, y un 0 se leería como "vinieron cero" en vez de "todavía no pasó".
    if (!sm.total) return `<tr><td style="${TD}">${MES_LARGO[m]}${chip}</td>`
      + `<td style="${TDN};color:#9c9a92">—</td><td style="${TDN};color:#9c9a92">—</td><td style="${TDN};color:#9c9a92">—</td><td style="${TDN};color:#9c9a92">—</td><td style="${TDN};color:#9c9a92">—</td></tr>`;
    const dec = sm.conf + sm.noas;
    const cCol = sm.continuidad == null ? '#9c9a92' : sm.continuidad >= 85 ? '#17865f' : sm.continuidad >= 70 ? '#BA7517' : '#c33a3a';
    return `<tr><td style="${TD}">${MES_LARGO[m]}${chip}</td>`
      + `<td style="${TDN}">${sm.conf}</td>`
      + `<td style="${TDN};color:#c33a3a">${sm.noas}</td>`
      + `<td style="${TDN}">${dec > 0 ? Math.round(sm.noas / dec * 100) + '%' : '—'}</td>`
      + `<td style="${TDN};color:${cCol};font-weight:700">${sm.continuidad == null ? '—' : sm.continuidad + '%'}</td>`
      + `<td style="${TDN}">${_nuevos(_ym(year, m))}</td></tr>`;
  }).join('');
  const decA = anual.conf + anual.noas;
  html += `<div class="panel">
    <div class="panel-title">Mes a mes · ${year}</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${TH}">Mes</th><th style="${THN}">Asistidas</th><th style="${THN}">Faltas</th><th style="${THN}">Inasist. %</th><th style="${THN}">Continuidad</th><th style="${THN}">Nuevos</th></tr></thead>
      <tbody>${filas}
        <tr style="font-weight:700"><td style="${TD};${TOP}">Total ${year}</td>
          <td style="${TDN};${TOP}">${anual.conf}</td>
          <td style="${TDN};${TOP};color:#c33a3a">${anual.noas}</td>
          <td style="${TDN};${TOP}">${decA > 0 ? Math.round(anual.noas / decA * 100) + '%' : '—'}</td>
          <td style="${TDN};${TOP}">${anual.continuidad == null ? '—' : anual.continuidad + '%'}</td>
          <td style="${TDN};${TOP}">${_nuevos(ystr)}</td></tr>
      </tbody>
    </table>
  </div>`;

  document.getElementById('anual-content').innerHTML = html;
  setTimeout(() => {
    const ctx = document.getElementById('anual-chart'); if (!ctx) return;
    Chart.getChart(ctx)?.destroy();   // destruir chart previo del mismo canvas (evita "Canvas already in use")
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: MES_CORTO,
        datasets: [
          { label: 'Asistidas', data: asisArr, yAxisID: 'y', borderColor: '#1D9E75', backgroundColor: '#1D9E75', tension: .3, borderWidth: 2, pointRadius: 3 },
          { label: 'Inasistencia %', data: inasArr, yAxisID: 'y1', borderColor: '#E24B4A', backgroundColor: '#E24B4A', tension: .3, borderWidth: 2, pointRadius: 3, borderDash: [5, 4] },
        ],
      },
      options: {
        responsive: true, color: '#6b6a64',
        plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, position: 'left', ticks: { color: '#6b6a64', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.05)' } },
          y1: { min: 0, max: 100, position: 'right', ticks: { color: '#6b6a64', font: { size: 10 }, callback: v => v + '%' }, grid: { display: false } },
          x: { ticks: { color: '#6b6a64' }, grid: { display: false } },
        },
      },
    });
  }, 50);
}

// ── Informe Paciente — combobox unificado (buscar + elegir en un solo control) ──
// #patient-rpt-select es un <input type="hidden"> cuyo .value = id del paciente (contrato preservado
// para verPaciente/selectGlobalResult/agenda/ia/realtime). El texto visible vive en #patient-rpt-search.
let _rptResults = [];   // pacientes listados ahora (para navegación con ↑/↓/Enter)
let _rptHi = -1;        // índice resaltado en la lista

export function renderPatientReportSelect() {
  const first=state.patients[0];
  const hidden=document.getElementById('patient-rpt-select');
  if(hidden) hidden.value=first?String(first.id):'';
  syncRptSearchInput(); hideRptResults(); updateEpisodes();
}

export function filterPatientRptSelect() {
  const inp=document.getElementById('patient-rpt-search');
  const res=document.getElementById('patient-rpt-results');
  if(!inp||!res) return;
  const q=(inp.value||'').toLowerCase().trim();
  let list=q ? state.patients.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.diag||'').toLowerCase().includes(q)) : state.patients;
  list=[...list].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,50);
  _rptResults=list; _rptHi=-1;
  if(!list.length){
    res.style.display='block';
    res.innerHTML='<div style="padding:12px;font-size:12px;color:#9c9a92;text-align:center">Sin resultados</div>';
    return;
  }
  res.style.display='block';
  res.innerHTML=list.map((p,i)=>{
    const th=getTherapist(p.therapistId);
    return `<div data-i="${i}" onmousedown="selectRptPatient('${esc(String(p.id))}')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center">
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
      <div style="font-size:10px;color:#9c9a92">${esc(p.diag||'Sin diagnóstico')}${th?' · '+esc(th.name):''}</div></div>
    </div>`;
  }).join('');
}

export function selectRptPatient(id) {
  const hidden=document.getElementById('patient-rpt-select');
  if(hidden) hidden.value=String(id);
  syncRptSearchInput(); hideRptResults(); updateEpisodes();
}

function syncRptSearchInput() {
  const inp=document.getElementById('patient-rpt-search');
  const hidden=document.getElementById('patient-rpt-select');
  if(!inp||!hidden) return;
  const p=state.patients.find(x=>String(x.id)===String(hidden.value));
  inp.value=p?p.name:'';
}

function hideRptResults() {
  const r=document.getElementById('patient-rpt-results');
  if(r) r.style.display='none';
  _rptHi=-1;
}

function _paintRptHi() {
  const res=document.getElementById('patient-rpt-results');
  if(!res) return;
  res.querySelectorAll('[data-i]').forEach(el=>{
    const on=parseInt(el.getAttribute('data-i'),10)===_rptHi;
    el.style.background=on?'#f5f5f0':'';
    if(on) el.scrollIntoView({block:'nearest'});
  });
}

export function rptSearchKeydown(e) {
  const res=document.getElementById('patient-rpt-results');
  const open=res&&res.style.display!=='none';
  if(e.key==='ArrowDown'){ if(!open){filterPatientRptSelect();return;} _rptHi=Math.min(_rptHi+1,_rptResults.length-1); _paintRptHi(); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ _rptHi=Math.max(_rptHi-1,0); _paintRptHi(); e.preventDefault(); }
  else if(e.key==='Enter'){ if(open&&_rptResults[_rptHi]){ selectRptPatient(String(_rptResults[_rptHi].id)); e.preventDefault(); } }
  else if(e.key==='Escape'){ hideRptResults(); }
}

// Cerrar el desplegable al hacer click fuera del combo (espejo de search.js)
document.addEventListener('click',function(e){
  if(!e.target.closest('#patient-rpt-combo')){
    const r=document.getElementById('patient-rpt-results');
    if(r) r.style.display='none';
  }
});

export function updateEpisodes() {
  syncRptSearchInput();
  const id=document.getElementById('patient-rpt-select').value;
  const p=state.patients.find(x=>String(x.id)===String(id));
  const ep=document.getElementById('patient-rpt-episode');
  if(!p){ep.innerHTML='<option value="0">Episodio actual</option>';renderPatientReport();return;}
  const log=p.log||[];
  const finEpisodios=log.filter(s=>s.type==='Fin de episodio').sort((a,b)=>a.date>b.date?1:-1);
  let options='';
  if(finEpisodios.length===0){
    options=`<option value="current">Episodio actual — ${esc(p.diag||'Sin diagnóstico')}</option>`;
  } else {
    options=`<option value="current">Episodio actual — ${esc(p.diag||'Sin diagnóstico')}</option>`;
    finEpisodios.forEach((fin,i)=>{
      const diagAnterior=fin.note?fin.note.split('Episodio anterior: ')[1]?.split(' · ')[0]||'Tratamiento anterior':'Tratamiento anterior';
      options+=`<option value="ep_${i}">Episodio ${i+1} — ${esc(diagAnterior)} (${esc(fin.date)})</option>`;
    });
  }
  ep.innerHTML=options;
  renderPatientReport();
}

export function renderPatientReport() {
  clearLastNarrative(); // el informe se redibuja con la narrativa en blanco; el PDF no debe arrastrar la previa
  const id=document.getElementById('patient-rpt-select').value;
  const p=state.patients.find(x=>String(x.id)===String(id));
  const out=document.getElementById('patient-report-content');
  if(!p){out.innerHTML='<div style="color:#6b6a64;padding:20px;text-align:center">Selecciona un paciente del buscador</div>';return;}
  const epVal=document.getElementById('patient-rpt-episode')?.value||'current';
  const fullLog=(p.log||[]).filter(s=>s&&s.date);
  const finMarkers=fullLog.filter(s=>s.type==='Fin de episodio').sort((a,b)=>a.date>b.date?1:-1);
  let log,epDiag=p.diag,epSessions=p.sessions,epDone=doneActual(p);
  if(epVal==='current'||finMarkers.length===0){
    const lastFin=finMarkers.slice(-1)[0];
    log=lastFin?fullLog.filter(s=>s.date>lastFin.date&&s.type!=='Fin de episodio'):fullLog.filter(s=>s.type!=='Fin de episodio');
  } else {
    const epIdx=parseInt(epVal.replace('ep_',''));
    const finStart=epIdx>0?finMarkers[epIdx-1]:null;
    const finEnd=finMarkers[epIdx];
    log=fullLog.filter(s=>{
      if(s.type==='Fin de episodio')return false;
      if(finStart&&s.date<=finStart.date)return false;
      if(finEnd&&s.date>finEnd.date)return false;
      return true;
    });
    if(finEnd&&finEnd.note){
      epDiag=finEnd.note.split('Episodio anterior: ')[1]?.split(' ·')[0]||p.diag;
      const sesStr=finEnd.note.match(/(\d+) sesiones/);
      epSessions=sesStr?parseInt(sesStr[1]):p.sessions;
      // R-2: la 'Evaluación inicial' no es una sesión de tratamiento. Contarla daba "11 de 10 · 110%"
      // en el informe del episodio pasado. Misma regla que doneActual (fuente única, utils.js).
      epDone=doneEnLog(log);
    }
  }
  // Orden cronológico por fecha (estable para empates) — necesario para que las sesiones
  // retroactivas/manuales aparezcan en su posición correcta en el gráfico EVA, el detalle y las métricas.
  log=[...log].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const isCurrentEpisode=epVal==='current';
  // El CIE-10 es del paciente HOY: se agrega solo al episodio actual. En un episodio cerrado el
  // diagnóstico que se muestra es el de entonces, y etiquetarlo con el código de ahora mentiría.
  const cieRpt=isCurrentEpisode?(p.cie10||null):null;
  const diagDisplay=diagConCie(epDiag||p.diag||'—',cieRpt);
  const th=getTherapist(p.therapistId);
  const doc=p.doctorId?getDoctor(p.doctorId):null;
  const attended=log.filter(s=>s.status==='asistió');
  // Solo sesiones de TRATAMIENTO para EVA (fp/lp/gráfico): la 'Evaluación inicial' no es una sesión
  // y, si se carga con fecha posterior a las sesiones, distorsionaría la curva y el "dolor actual".
  const attendedTrat=attended.filter(s=>s.type!=='Evaluación inicial');
  const adh=log.length>0?Math.round(attended.length/log.length*100):0;
  const pct=epSessions>0?Math.round(epDone/epSessions*100):0;
  const lp=attendedTrat.slice(-1)[0];const fp=attendedTrat[0];
  const citasConf=state.appointments.filter(a=>String(a.patientId)===String(p.id)&&a.status==='conf').length;
  const doneNow=doneActual(p);
  // Terapeuta(s) del episodio: modelo POR-SESIÓN (patient.therapistId no se usa en este app).
  // Encabezado: único nombre / 'Varios' / '—'.
  const epThIds=[...new Set(log.filter(s=>s.therapistId).map(s=>String(s.therapistId)))];
  const thHeader=epThIds.length===0?'—':epThIds.length===1?(getTherapist(epThIds[0])?.name||'—'):'Varios';
  const sesCompletas=doneNow>=(p.sessions||1)&&p.sessions>0;
  let sp='';
  if(p.status==='alta'||sesCompletas) sp='<span class="pill pb">Alta médica</span>';
  else if(citasConf>=1||doneNow>=1) sp='<span class="pill pg">En tratamiento</span>';
  const ac=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
  const avisoEpisodio=sesCompletas&&p.status!=='alta'
    ?`<div style="background:#fef3c7;border:1px solid rgba(186,117,23,.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><div style="font-size:12px;font-weight:600;color:#BA7517">✓ Tratamiento completado</div><div style="font-size:11px;color:#6b6a64;margin-top:2px">${esc(p.name)} completó sus ${p.sessions} sesiones. ¿Viene por algo nuevo?</div></div>
        <button onclick="nuevoEpisodio('${esc(p.id)}')" style="padding:6px 12px;background:#BA7517;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">Nuevo episodio</button>
      </div>`:'' ;

  const inicio=(attended[0]&&attended[0].date)?attended[0].date:(log[0]&&log[0].date?log[0].date:'—');
  const now=new Date();
  const ymd=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const rptNo=`INF-${ymd}-${(String(p.id).replace(/\D/g,'').slice(-4)||'0000').padStart(4,'0')}`;
  const fechaLarga=now.toLocaleDateString('es-EC',{day:'2-digit',month:'long',year:'numeric'});
  const evaSes=attendedTrat.filter(s=>s.pb!=null);
  const prot=p.protocolId?state.protocols.find(x=>x.id===p.protocolId):null;
  const cellG=(lbl,val,span)=>`<div${span?` style="grid-column:span ${span}"`:''}><div class="rpt-lbl">${lbl}</div><div class="rpt-val">${esc(val)}</div></div>`;
  const evaDelta=(fp&&lp&&fp.pb!=null&&lp.pa!=null)?lp.pa-fp.pb:null;

  // La 'Evaluación inicial' se muestra como bloque destacado ANTES de la tabla (punto de partida);
  // la tabla "Detalle por sesión" lista solo las sesiones de TRATAMIENTO, en orden ascendente.
  const sesAsc=log.filter(s=>s.type!=='Fin de episodio');
  const evalRow=sesAsc.find(s=>s.type==='Evaluación inicial');
  const tratRows=sesAsc.filter(s=>s.type!=='Evaluación inicial');
  const canEdit=hasPermission('registerSession');
  const canDelete=hasPermission('deleteSession');

  // Bloque destacado de la Evaluación inicial (solo si existe). El note viene como
  // "anamnesis | Ant. familiares: … | Zonas: … | Inspección: …" → una línea por parte.
  let evalBlockHtml='';
  if(evalRow){
    const partes=(evalRow.note||'').split(' | ').filter(Boolean);
    const editBtn=canEdit?`<button onclick="editSession('${esc(p.id)}','${esc(evalRow.id)}')" style="font-size:10px;padding:3px 9px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600;border:1px solid rgba(41,171,226,.3);background:rgba(41,171,226,.1);color:#155b7a">Editar</button>`:'';
    evalBlockHtml=`<div style="margin-top:14px;border:1px solid rgba(245,166,35,.5);border-left:4px solid #F5A623;border-radius:8px;padding:12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:5px">
        <span style="font-size:11px;font-weight:700;color:#1a1917;text-transform:uppercase;letter-spacing:.05em">Evaluación inicial · ${dmy(evalRow.date)}</span>
        <span style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span style="font-size:12px;font-weight:700;color:${evaColor(evalRow.pb)}">EVA ${evalRow.pb!=null?evalRow.pb:'—'}/10</span>${editBtn}
        </span>
      </div>
      ${partes.length?partes.map(x=>`<div style="font-size:11.5px;color:#3a3a36;line-height:1.6;margin-bottom:3px">${esc(limpiarParte(x))}</div>`).join(''):'<div style="font-size:11.5px;color:#9c9a92">Sin detalle registrado</div>'}
    </div>`;
  }

  let tablaHtml='';
  if(tratRows.length){
    const thc=(t,al)=>`<th style="text-align:${al||'left'};font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#9c9a92;padding:6px 8px 5px 0">${t}</th>`;
    const showAcc=canEdit||canDelete;
    tablaHtml=`<div style="margin-top:16px"><div class="rpt-sec-title">Detalle por sesión (${tratRows.length})</div>
      <div class="rpt-table-wrap"><table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr>${thc('Fecha')}${thc('Terapeuta')}${thc('EVA','center')}${thc('Técnicas y observación')}${showAcc?thc('Acciones','center'):''}</tr></thead><tbody>`;
    tratRows.forEach(s=>{
      const eva=s.pb!=null?`${s.pb}→${s.pa!=null?s.pa:'?'}`:'—';
      // Color del EVA por mejora dentro de la sesión (verde si bajó el dolor, ámbar si no).
      const evaCol=(s.pb!=null&&s.pa!=null&&s.pa<s.pb)?'#17865f':'#BA7517';
      const tec=(s.tags&&s.tags.length)?s.tags.join(', '):null;
      const thName=getTherapist(s.therapistId)?.name||'—';
      const td='padding:6px 8px 6px 0;border-top:1px solid rgba(0,0,0,.06);font-size:11px;vertical-align:top';
      const obs=[tec?`<b style="color:#1a1917">${esc(tec)}</b>`:null,s.note?esc(s.note):null].filter(Boolean).join(' — ')||'—';
      let acc='';
      if(showAcc){
        const btn='font-size:10px;padding:3px 9px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600;border:1px solid';
        const eBtn=canEdit?`<button onclick="editSession('${esc(p.id)}','${esc(s.id)}')" style="${btn} rgba(41,171,226,.3);background:rgba(41,171,226,.1);color:#155b7a">Editar</button>`:'';
        const dBtn=canDelete?`<button onclick="deleteSession('${esc(p.id)}','${esc(s.id)}')" style="${btn} rgba(224,75,74,.3);background:rgba(224,75,74,.08);color:#E24B4A">Eliminar</button>`:'';
        const inner=(eBtn+dBtn)||'<span style="color:var(--rh-ink)">—</span>';
        acc=`<td style="${td};text-align:center;white-space:nowrap"><div style="display:flex;gap:5px;justify-content:center">${inner}</div></td>`;
      }
      tablaHtml+=`<tr><td style="${td};color:#1a1917;white-space:nowrap">${dmy(s.date)}</td>
        <td style="${td};color:#1a1917;white-space:nowrap">${esc(thName)}</td>
        <td style="${td};text-align:center;font-weight:700;color:${evaCol};white-space:nowrap">${eva}</td>
        <td style="${td};color:#5a5a56">${obs}</td>${acc}</tr>`;
    });
    tablaHtml+=`</tbody></table></div></div>`;
  } else {
    tablaHtml=`<div style="margin-top:16px;text-align:center;padding:18px 0;color:#7a7a76;font-size:12px">Sin sesiones de tratamiento registradas en este episodio.</div>`;
  }

  let html=avisoEpisodio
  +`<div class="rpt-layout">
    <div class="rpt-sheet">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #29ABE2;padding-bottom:14px;gap:16px;flex-wrap:wrap">
        <div><img src="${LOGO_DATA_URI}" alt="Rehactiva" style="width:190px;display:block"><div style="font-size:10.5px;color:#7a7a76;margin-top:4px">Rehabilitación y Fisioterapia · Quito, Ecuador · rehactivaec.com</div></div>
        <div style="text-align:right;font-size:11px;color:#5a5a56;line-height:1.6;flex-shrink:0"><div style="font-size:13px;font-weight:700;color:#1a1917">Informe de evolución</div><div>N.º ${rptNo}</div><div>${fechaLarga}</div></div>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:16px;flex-wrap:wrap">
        <div style="font-size:18px;font-weight:700;color:#1a1917">${esc(p.name)}</div>${sp}
        <span style="font-size:12px;color:#7a7a76">${getDisplayAge(p)}</span>
        ${!isCurrentEpisode?'<span style="font-size:10.5px;background:rgba(245,166,35,.15);color:#a06a00;padding:1px 8px;border-radius:99px;font-weight:700">Episodio anterior</span>':''}
      </div>
      <div class="rpt-meta-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 20px;margin-top:12px;padding:12px 14px;background:#faf6ef;border-radius:8px">
        ${cellG('Diagnóstico',diagDisplay)}
        ${cellG('Doctor referente',doc?doc.name+' ('+doc.spec+')':'Independiente')}
        ${cellG('Inicio',inicio==='—'?'—':dmy(inicio))}
        ${cellG('Protocolo',prot?`${prot.name} · ${prot.sessions} sesiones · ${prot.freq}×/sem`:'—',2)}
        ${cellG('Terapeuta',thHeader)}
      </div>
      <div class="rpt-kpi-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px">
        <div class="rpt-kpi"><div class="rpt-lbl">Sesiones completadas</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:3px"><span style="font-size:22px;font-weight:700;color:#1d8fbf">${epDone}<span style="font-size:13px;color:#9c9a92">/${epSessions}</span></span><span style="font-size:11px;color:#7a7a76">${pct}% del plan</span></div>
          <div style="margin-top:6px;height:5px;background:#f0e8d8;border-radius:3px"><div style="width:${Math.min(pct,100)}%;height:5px;background:#29ABE2;border-radius:3px"></div></div></div>
        <div class="rpt-kpi"><div class="rpt-lbl">Continuidad</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:3px"><span style="font-size:22px;font-weight:700;color:${ac}">${adh}%</span><span style="font-size:11px;color:#7a7a76">${attended.length} asistencias / ${log.length} citas</span></div>
          <div style="font-size:10.5px;color:${adh>=85?'#17865f':'#a06a00'};margin-top:8px">${adh>=85?'✓ Sobre la meta (85%)':'Bajo la meta (85%)'}</div></div>
        <div class="rpt-kpi"><div class="rpt-lbl">Dolor EVA</div>
          ${fp&&lp&&fp.pb!=null?`<div style="display:flex;align-items:center;gap:10px;margin-top:3px"><span style="font-size:22px;font-weight:700;color:${evaColor(fp.pb)}">${fp.pb}</span><span style="color:#9c9a92">→</span><span style="font-size:22px;font-weight:700;color:${lp.pa!=null?evaColor(lp.pa):'#7a7a76'}">${lp.pa!=null?lp.pa:'?'}</span>${evaDelta!=null?`<span style="font-size:11px;color:#7a7a76;line-height:1.3">${evaDelta>0?'+':'−'}${Math.abs(evaDelta)} puntos<br>desde el inicio</span>`:''}</div>`:'<div style="font-size:13px;color:#7a7a76;padding:8px 0">Sin datos EVA</div>'}</div>
      </div>
      ${evaSes.length?`<div style="margin-top:16px"><div class="rpt-sec-title">Evolución del dolor (EVA)</div><canvas id="eva-evolution-chart" height="90" style="margin-top:8px"></canvas></div>`:''}
      ${evalBlockHtml}
      <div style="margin-top:16px"><div class="rpt-sec-title">Narrativa clínica (IA)</div>
        <div id="patient-rpt-ai-output" style="font-size:12px;color:#5a5a56;margin-top:8px">— <span style="font-size:11px">(usá «Informe clínico con IA» para generar la evolución)</span></div></div>
      ${tablaHtml}
    </div>
    <aside class="rpt-side">
      <div class="side-card">
        <div class="side-title">Documento</div>
        <div class="side-col">
          ${hasPermission('viewAI')?`<button class="side-btn primary" onclick="genPatientAI()">Informe clínico con IA</button>`:''}
          <button class="side-btn outline" onclick="abrirFirmanteModal()">Exportar Word</button>
          <!-- SIN gate de permisos A PROPÓSITO (decisión de Jefferson, lote informes 2026-09-01).
               Este botón vivía en el header de Informes, pestaña admin-only y con
               data-permission="admin"; al moverlo acá lo ganan también secretaria y terapeuta.
               Es deliberado: paridad con "Exportar Word", que ya estaba sin gate y saca los
               MISMOS datos, en una pantalla que esos dos roles ya ven completa. No le pongas
               data-permission creyendo que se coló. -->
          <button class="side-btn outline" onclick="exportarPDF()">Exportar PDF</button>
          ${hasPermission('viewAI')?`<button class="side-btn outline" id="save-informe-btn" style="display:none" onclick="guardarInforme()">💾 Guardar informe</button>`:''}
        </div>
      </div>
      <div class="side-card">
        <div class="side-title">Paciente</div>
        <div class="side-col">
          <button class="side-btn soft" onclick="agendarCitaParaPaciente('${esc(p.id)}')">+ Agendar cita</button>
          <button class="side-btn soft" onclick="irAHistorial('${esc(p.id)}')">Historial de citas</button>
          ${hasPermission('registerSession')?`<button class="side-btn soft" onclick="openSessionModalManual('${esc(p.id)}')">+ Sesión manual</button>`:''}
          ${isCurrentEpisode?`<button class="side-btn warn" onclick="nuevoEpisodio('${esc(p.id)}')">Nuevo episodio</button>`:''}
        </div>
      </div>
      <div id="informes-guardados" class="side-card"></div>
    </aside>
  </div>`;

  out.innerHTML=html;
  _rptCtx={p,log,attended,pct,adh,fp,lp,th,doc,epDiag,epDone,epSessions,inicio,rptNo,fechaLarga,thHeader,prot,cieRpt};
  renderInformesGuardados();

  if(evaSes.length){
    setTimeout(()=>{
      const ctx=document.getElementById('eva-evolution-chart'); if(!ctx) return;
      Chart.getChart(ctx)?.destroy();   // destruir chart previo del mismo canvas (evita "Canvas already in use")
      const ddmm=d=>String(d||'').slice(8,10)+'/'+String(d||'').slice(5,7);
      // Línea ÚNICA consistente con la tarjeta "Dolor EVA inicial→actual":
      // inicia en el dolor inicial (fp.pb) y termina en el dolor actual (lp.pa); en medio, el dolor tras cada sesión.
      const startVal=(fp&&fp.pb!=null)?fp.pb:evaSes[0].pb;
      const endVal=(lp&&lp.pa!=null)?lp.pa:evaSes[evaSes.length-1].pa;
      const mid=evaSes.map(s=>s.pa!=null?s.pa:s.pb);
      if(endVal!=null&&mid.length) mid[mid.length-1]=endVal;
      const evaData=[startVal,...mid];
      const evaLabels=['Inicio',...evaSes.map(s=>ddmm(s.date))];
      // Bandas de referencia alineadas con evaColor (:74): leve (0–3.5) / moderado (3.5–6.5) /
      // severo (6.5–10), para que cada punto caiga en la banda del color de su número. Alpha más
      // marcado (~.13-.16) para que el terapeuta las distinga, sin tapar la curva coral (2px saturada).
      const evaBands={id:'evaBands',beforeDraw(c){
        const a=c.chartArea, y=c.scales.y; if(!a) return;
        [[6.5,10,'rgba(226,75,74,.16)'],[3.5,6.5,'rgba(224,168,80,.15)'],[0,3.5,'rgba(29,158,117,.13)']].forEach(b=>{
          const yHi=y.getPixelForValue(b[1]),yLo=y.getPixelForValue(b[0]);
          c.ctx.save();c.ctx.fillStyle=b[2];c.ctx.fillRect(a.left,yHi,a.right-a.left,yLo-yHi);c.ctx.restore();
        });
      }};
      new Chart(ctx,{type:'line',
        data:{labels:evaLabels,datasets:[{label:'Dolor EVA',data:evaData,borderColor:'#F5A623',pointBackgroundColor:'#F5A623',pointRadius:3.5,pointHoverRadius:4.5,borderWidth:2.5,tension:.25,fill:false,spanGaps:true}]},
        options:{responsive:true,animation:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:it=>'EVA '+it.parsed.y}}},
          scales:{y:{min:0,max:10,ticks:{stepSize:2,color:'#6b6a64',font:{size:10}},grid:{color:'rgba(0,0,0,.04)'}},
            x:{ticks:{color:'#6b6a64',font:{size:9},maxRotation:0,autoSkip:true,maxTicksLimit:8},grid:{display:false}}}},
        plugins:[evaBands]});
    },50);
  }
}

// Construye el render-model del PDF desde el informe en pantalla (_rptCtx + narrativa IA + canvas EVA).
// Es el MISMO shape que se persiste como snapshot, para que el PDF guardado salga idéntico sin re-llamar a la IA.
function _buildRenderModel() {
  const {p,log,attended,pct,adh,fp,lp,doc,inicio,rptNo,fechaLarga,thHeader,prot,epDiag,epDone,epSessions,cieRpt,firmante}=_rptCtx;
  // Captura del gráfico EVA ya dibujado en pantalla — evita el canvas en blanco por timing.
  const evaCanvas=document.getElementById('eva-evolution-chart');
  const evaImg=evaCanvas?evaCanvas.toDataURL('image/png'):'';
  const sesAsc=log.filter(s=>s.type!=='Fin de episodio');
  const evalRow=sesAsc.find(s=>s.type==='Evaluación inicial');
  const tratRows=sesAsc.filter(s=>s.type!=='Evaluación inicial');
  return {
    numero:rptNo,
    fechaLarga,
    // Mismo texto que la pantalla: el PDF que va al médico lleva el CIE-10 en la celda Diagnóstico.
    paciente:{nombre:p?.name||'',cedula:p?.cedula||'',edad:getDisplayAge(p,true),diagnostico:diagConCie(epDiag||p?.diag||'',cieRpt)},
    terapeuta:thHeader,
    doctor:doc?doc.name+' ('+doc.spec+')':null,
    protocolo:prot?.name||null,
    inicio,
    metricas:{
      pct,done:epDone,sessions:epSessions||0,
      adh,asistidas:attended.length,totalCitas:log.length,
      evaHas:!!(fp&&lp&&fp.pb!=null),
      evaInicial:(fp&&fp.pb!=null)?fp.pb:null,
      evaActual:(lp&&lp.pa!=null)?lp.pa:null,
    },
    evalInicial:evalRow?{fecha:evalRow.date,pb:evalRow.pb,partes:(evalRow.note||'').split(' | ').filter(Boolean)}:null,
    sesiones:tratRows.map(s=>({
      fecha:s.date,terapeuta:getTherapist(s.therapistId)?.name||'—',
      pb:s.pb,pa:s.pa,
      tecnicas:(s.tags&&s.tags.length)?s.tags.join(', '):null,
      obs:s.note||null,
    })),
    evaChartImg:evaImg,
    // Narrativa IA ESTRUCTURADA ([{title,body}], compartida por ia.js): títulos en negrita y secciones separadas.
    narrativa:getLastNarrative(),
    // Quién firma el documento — se pide en el modal de firmante antes de exportar a Word (null si
    // todavía no se confirmó ninguno para este informe en pantalla).
    firmante:firmante||null,
  };
}

// PURA: render-model → HTML del PDF con formato de documento médico formal (sin look dashboard:
// nada de verdes, cajas tintadas ni colores semáforo — esos siguen solo en pantalla). No toca
// state/_rptCtx/DOM. La usan el export vivo y el guardado.
function buildPdfHtml(m) {
  const met=m.metricas||{};
  const ses=m.sesiones||[];
  const narr=m.narrativa;
  const aiHTML=(narr&&narr.length)
    ?narr.map(s=>'<div class="narr-sec"><h3 class="narr">'+esc(s.title)+'</h3><div class="narr-body">'+esc(s.body).replace(/\n/g,'<br>')+'</div></div>').join('')
    :'';

  // Período: evaluación inicial (o primera sesión) → última sesión; sin sesiones, la fecha de emisión.
  const periodo=ses.length
    ?dmy((m.evalInicial&&m.evalInicial.fecha)||ses[0].fecha)+' – '+dmy(ses[ses.length-1].fecha)
    :m.fechaLarga;

  // Datos del paciente: todo campo vacío (o "Sin edad") se muestra como '—'.
  const val=v=>{const t=v==null?'':String(v).trim();return t&&t!=='Sin edad'?esc(t):'—';};
  const cell=(lbl,v)=>'<div><div class="pd-lbl">'+lbl+'</div><div class="pd-val">'+val(v)+'</div></div>';
  const datos='<div class="pd-grid">'
    +cell('Nombre',m.paciente.nombre)+cell('Cédula',m.paciente.cedula)+cell('Edad',m.paciente.edad)+cell('Diagnóstico',m.paciente.diagnostico)
    +cell('Terapeuta',m.terapeuta)+cell('Doctor referente',m.doctor)+cell('Inicio de tratamiento',dmy(m.inicio))
    +(m.protocolo&&m.protocolo!==m.paciente.diagnostico?cell('Protocolo',m.protocolo):'')
    +'</div>';

  const sumCol=(lbl,valHtml,sub)=>'<div><div class="pd-lbl">'+lbl+'</div><div class="sum-val">'+valHtml+'</div><div class="sum-sub">'+sub+'</div></div>';
  const evaVal=met.evaHas
    ?esc(met.evaInicial)+' <span class="sum-arrow">→</span> '+(met.evaActual!=null?esc(met.evaActual):'?')
    :'—';
  const resumen='<div class="sum">'
    +sumCol('Sesiones',esc(met.done)+' de '+esc(met.sessions),esc(met.pct)+'% del plan')
    +sumCol('Continuidad',esc(met.adh)+'%',esc(met.asistidas)+'/'+esc(met.totalCitas)+' citas asistidas')
    +sumCol('Dolor EVA',evaVal,met.evaHas?'inicial → actual':'sin datos registrados')
    +'</div>';

  const evaSvg=buildEvaSvg(m);
  const chart=evaSvg
    ?'<div class="keep"><h2>Evolución del dolor (EVA)</h2>'+evaSvg+'</div>'
    :(m.evaChartImg?'<div class="keep"><h2>Evolución del dolor (EVA)</h2><img src="'+esc(m.evaChartImg)+'" style="max-width:100%;display:block"></div>':'');

  let evalBlock='';
  if(m.evalInicial){
    const partes=m.evalInicial.partes||[];
    evalBlock='<div class="keep"><h2>Evaluación inicial</h2>'
      +'<div class="eval-sub">'+esc(dmy(m.evalInicial.fecha))+' · EVA '+(m.evalInicial.pb!=null?esc(m.evalInicial.pb):'—')+'/10</div>'
      +(partes.length?partes.map(x=>'<p class="eval-p">'+esc(limpiarParte(x))+'</p>').join(''):'<p class="eval-p mut">Sin detalle registrado</p>')
      +'</div>';
  }

  let filas='';
  ses.forEach(function(s){
    const eva=s.pb!=null?s.pb+'→'+(s.pa!=null?s.pa:'?'):'—';
    filas+='<tr><td class="nw">'+esc(dmy(s.fecha))+'</td><td class="nw">'+esc(s.terapeuta||'—')+'</td><td class="ctr">'+esc(eva)+'</td><td class="mut">'+(s.tecnicas?esc(s.tecnicas):'—')+'</td><td class="mut">'+(s.obs?esc(s.obs):'—')+'</td></tr>';
  });
  const tabla=ses.length
    ?'<table><thead><tr><th>Fecha</th><th>Terapeuta</th><th class="ctr">EVA (antes→después)</th><th>Técnicas</th><th>Observación</th></tr></thead><tbody>'+filas+'</tbody></table>'
    :'<div class="mut" style="padding:10px 0;font-size:11px">Sin sesiones de tratamiento registradas.</div>';

  const clinica=['Rehactiva','Centro de rehabilitación y fisioterapia','Quito, Ecuador',
    CONFIG_CLINICA.DIRECCION,CONFIG_CLINICA.TELEFONO?'Tel. '+CONFIG_CLINICA.TELEFONO:'',CONFIG_CLINICA.EMAIL]
    .filter(Boolean).map(esc).join(' · ');

  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe — '+esc(m.paciente.nombre||'Paciente')+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{margin:15mm}'
    +'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1A1A1A;background:#fff;padding:32px;max-width:800px;margin:0 auto}'
    +'h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1A1A1A;margin:22px 0 10px;padding-bottom:5px;border-bottom:1px solid #D8D8D2;break-after:avoid;page-break-after:avoid}'
    +'.mut{color:#6B6B66}.nw{white-space:nowrap}.ctr{text-align:center}'
    +'.keep{break-inside:avoid;page-break-inside:avoid}'
    +'.header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}'
    +'.h-right{text-align:right;flex-shrink:0}'
    +'.h-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#1A1A1A}'
    +'.h-meta{font-size:10px;color:#6B6B66;margin-top:4px}'
    +'.rule{display:flex;height:3px;margin-top:12px}.rule-a{width:64px;background:#F09028}.rule-b{flex:1;background:#28A8C8}'
    +'.pd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 18px}'
    +'.pd-lbl{font-size:9px;font-weight:700;color:#6B6B66;text-transform:uppercase;letter-spacing:.06em}'
    +'.pd-val{font-size:12px;color:#1A1A1A;margin-top:2px}'
    +'.sum{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;border-top:1px solid #D8D8D2;border-bottom:1px solid #D8D8D2;padding:12px 0}'
    +'.sum-val{font-size:22px;font-weight:700;color:#1A1A1A;margin:4px 0 2px}'
    +'.sum-arrow{font-size:15px;font-weight:400;color:#6B6B66}'
    +'.sum-sub{font-size:9px;color:#6B6B66}'
    +'h3.narr{font-size:12px;font-weight:700;color:#1A1A1A;margin:10px 0 4px;letter-spacing:.02em}'
    +'.narr-body{font-size:11px;line-height:1.6;color:#1A1A1A;margin-bottom:6px}'
    +'.narr-sec{break-inside:avoid;page-break-inside:avoid}'
    +'.eval-sub{font-size:12px;font-weight:700;color:#1A1A1A;margin-bottom:6px}'
    +'.eval-p{font-size:11px;line-height:1.55;margin-bottom:3px}'
    +'table{width:100%;border-collapse:collapse;margin-top:4px}'
    +'thead{display:table-header-group}'
    +'tr{break-inside:avoid;page-break-inside:avoid}'
    +'th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6B6B66;text-align:left;padding:6px 8px;border-bottom:1px solid #1A1A1A}'
    +'td{font-size:11px;color:#1A1A1A;padding:7px 8px;border-bottom:1px solid #EAEAE4;vertical-align:top}'
    +'.footer{display:flex;justify-content:space-between;gap:12px;margin-top:28px;padding-top:8px;border-top:1px solid #D8D8D2;font-size:8px;color:#6B6B66}'
    +'.print-btn{margin-top:10px;padding:6px 14px;background:#1A1A1A;color:#fff;border:none;cursor:pointer;font-size:11px;font-family:inherit}'
    +'@media print{body{padding:0;max-width:none}button{display:none}}'
    +'</style></head><body>'
    +'<div class="header"><div><img src="'+LOGO_DATA_URI+'" alt="Rehactiva" style="height:44px;display:block"></div>'
    +'<div class="h-right"><div class="h-title">Informe de evolución</div>'
    +'<div class="h-meta">N.º '+esc(m.numero)+' · '+esc(m.fechaLarga)+'</div>'
    +'<div class="h-meta">Período del informe: '+esc(periodo)+'</div>'
    +'<button class="print-btn" onclick="window.print()">Imprimir / Guardar PDF</button></div></div>'
    +'<div class="rule"><div class="rule-a"></div><div class="rule-b"></div></div>'
    +'<h2>Datos del paciente</h2>'+datos
    +'<h2>Resumen de evolución</h2>'+resumen
    +chart
    +(aiHTML?'<h2>Narrativa clínica</h2>'+aiHTML:'')
    +evalBlock
    +'<h2>Detalle por sesión ('+ses.length+')</h2>'+tabla
    +'<div class="footer"><div>'+clinica+'</div><div>Generado por RehactivaPro</div></div>'
    +'</body></html>';
}

// Exportada: el Historial de citas abre su hoja imprimible con esta MISMA ventana (mismo aviso de
// pop-ups bloqueados, mismo document.write) en vez de duplicar la mecánica.
export function openPdfWindow(html) {
  const win=window.open('','_blank');
  if(!win){window._app.toastErr('Permite ventanas emergentes para exportar PDF');return false;}
  win.document.write(html);win.document.close();
  return true;
}

export function exportarPDF() {
  if(!_rptCtx){window._app.toastErr('Abrí primero el informe de un paciente');return;}
  openPdfWindow(buildPdfHtml(_buildRenderModel()));
}

// Modal de firmante: se pide SIEMPRE antes de exportar a Word (no se cachea entre informes) porque
// 'Terapeuta' en el encabezado puede ser "Varios" cuando el episodio tuvo más de un terapeuta — el
// firmante es una persona concreta, no el agregado de la ficha. Precarga con el terapeuta único del
// episodio si lo hay, o con el último firmante confirmado en pantalla.
//
// Select cerrado, no datalist: el firmante de un documento clínico tiene que ser un terapeuta real
// del equipo, no texto libre (el datalist anterior aceptaba cualquier cosa tipeada).
export function abrirFirmanteModal() {
  if(!_rptCtx){window._app.toastErr('Abrí primero el informe de un paciente');return;}
  const sel=document.getElementById('fw-nombre');
  if(sel){
    const nombres=orderedTherapists().map(t=>t.name);
    sel.innerHTML='<option value="">Seleccioná un terapeuta…</option>'+nombres.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const preferido=_rptCtx.firmante||_rptCtx.th?.name||'';
    sel.value=nombres.includes(preferido)?preferido:'';
  }
  document.getElementById('firmante-modal').classList.add('open');
}

// Confirma el firmante, lo deja en _rptCtx (así 'Guardar informe' lo persiste en el snapshot con el
// resto del modelo) y dispara la generación del .docx real en word.js.
export async function confirmarExportarWord() {
  if(!_rptCtx){window._app.toastErr('Abrí primero el informe de un paciente');return;}
  const nombre=(document.getElementById('fw-nombre')?.value||'').trim();
  if(!nombre){window._app.toastErr('Ingresá el nombre de quien firma');return;}
  _rptCtx.firmante=nombre;
  window._app.closeModal('firmante-modal');
  await generarInformeWord(_buildRenderModel());
}

// Card "Informes guardados" del paciente actual (no-deleted, reciente primero). Se re-pinta sola
// tras guardar sin tocar el resto del informe (no borra la narrativa en pantalla).
export function renderInformesGuardados() {
  const cont=document.getElementById('informes-guardados');
  if(!cont) return;
  const id=document.getElementById('patient-rpt-select')?.value;
  const lista=(state.informes||[]).filter(x=>String(x.patientId)===String(id));
  let inner=`<div class="side-title" style="margin-bottom:8px">Informes guardados</div>`;
  if(lista.length){
    const btnBase='padding:4px 10px;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap';
    inner+=lista.map(inf=>{
      const fecha=inf.fechaEmision||(inf.createdAt?String(inf.createdAt).slice(0,10):'—');
      const idEsc=esc(String(inf.id));
      const verBtn=`<button onclick="verInformeGuardado('${idEsc}')" style="${btnBase};background:rgba(41,171,226,.1);color:#155b7a;border:1px solid rgba(41,171,226,.3)">Ver</button>`;
      const expBtn=`<button onclick="exportarInformeGuardado('${idEsc}')" style="${btnBase};background:#fff;color:#1d8fbf;border:1px solid rgba(41,171,226,.35)">PDF</button>`;
      const delBtn=hasPermission('deleteInforme')?`<button onclick="eliminarInformeGuardado('${idEsc}')" style="${btnBase};background:rgba(224,75,74,.08);color:#E24B4A;border:1px solid rgba(224,75,74,.3)">Eliminar</button>`:'';
      return `<div style="padding:8px 0;border-bottom:1px solid rgba(41,171,226,.1)">
        <div style="font-size:12px;font-weight:700;color:#1a1917">${esc(inf.numero||'INF')}</div>
        <div style="font-size:10px;color:#7a7a76;margin:1px 0 6px">${esc(fecha)}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${verBtn}${expBtn}${delBtn}</div>
      </div>`;
    }).join('');
  } else {
    inner+=`<div style="font-size:11px;color:#9c9a92">Sin informes guardados de este paciente.</div>`;
  }
  cont.innerHTML=inner;
}

// Persiste el informe (narrativa IA + snapshot completo) en el histórico. Gated por viewAI.
export async function guardarInforme() {
  if(!hasPermission('viewAI')){window._app.toastErr('No tienes permisos para guardar informes.');return;}
  if(!_rptCtx){window._app.toastErr('Abrí primero el informe de un paciente');return;}
  const model=_buildRenderModel();
  if(!model.narrativa||!model.narrativa.length){window._app.toastErr('Generá la narrativa IA antes de guardar.');return;}
  const {narrativa,...snapshot}=model;
  const epVal=document.getElementById('patient-rpt-episode')?.value||'current';
  const pid=_rptCtx.p?.id;
  try{
    const {data,error}=await supa.from('informes').insert({
      patient_id:pid,created_by:state.currentUserId||null,
      numero:model.numero,episodio:epVal,narrativa,snapshot,
    }).select().single();
    if(error){window._app.toastErr('Error al guardar el informe: '+error.message);return;}
    if(data){
      state.informes.unshift({id:data.id,patientId:data.patient_id,createdAt:data.created_at,createdBy:data.created_by,
        numero:data.numero,episodio:data.episodio,fechaEmision:data.fecha_emision,
        narrativa:data.narrativa||[],snapshot:data.snapshot||{}});
    }
    window._app.toastOk('Informe guardado en el histórico');
    renderInformesGuardados();   // refresca solo la lista; mantiene la narrativa en pantalla
  }catch(e){window._app.toastErr('Error de conexión al guardar el informe.');}
}

// Exporta un informe del histórico desde su snapshot + narrativa guardados — idéntico, sin IA ni state vivo.
export function exportarInformeGuardado(id) {
  const inf=(state.informes||[]).find(x=>String(x.id)===String(id));
  if(!inf){window._app.toastErr('No se encontró el informe guardado');return;}
  openPdfWindow(buildPdfHtml({...inf.snapshot,narrativa:inf.narrativa}));
}

// Ver inline: inyecta la narrativa guardada en el bloque on-screen para leerla sin abrir el PDF.
// NO re-llama a la IA y NO toca _lastNarrative/_rptCtx → el export vivo queda intacto.
export function verInformeGuardado(id) {
  const inf=(state.informes||[]).find(x=>String(x.id)===String(id));
  if(!inf){window._app.toastErr('No se encontró el informe guardado');return;}
  const el=document.getElementById('patient-rpt-ai-output');
  if(!el) return;
  el.style.display='block';
  el.innerHTML=renderNarrativeHtml(inf.narrativa||[]);
}

// Borrado LÓGICO (deleted=true). Gated por deleteInforme (admin/terapeuta), con confirmación.
// La RLS de informes solo permite UPDATE a admin/terapeuta → coincide con el gate del cliente.
export async function eliminarInformeGuardado(id) {
  if(!hasPermission('deleteInforme')){window._app.toastErr('No tienes permisos para eliminar informes.');return;}
  const inf=(state.informes||[]).find(x=>String(x.id)===String(id));
  if(!inf){window._app.toastErr('No se encontró el informe guardado');return;}
  if(!confirm('¿Eliminar este informe guardado del histórico?'))return;
  try{
    const {error}=await supa.from('informes').update({
      deleted:true,deleted_at:new Date().toISOString(),deleted_by:state.currentUserId||null,
    }).eq('id',inf.id);
    if(error){window._app.toastErr('Error al eliminar el informe: '+error.message);return;}
    state.informes=state.informes.filter(x=>String(x.id)!==String(inf.id));
    window._app.toastOk('Informe eliminado');
    renderInformesGuardados();
  }catch(e){window._app.toastErr('Error de conexión al eliminar el informe.');}
}
