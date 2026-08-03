import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor, therapistHours, ALL_HOURS, DAYS, getDisplayAge, doneActual, safeColor, orderedTherapists } from './utils.js';
import { apptSlots } from './agenda.js';
import { genSemanalAI, genPatientAI, getLastNarrative, clearLastNarrative, renderNarrativeHtml } from './ia.js';
import { hasPermission } from './permissions.js';
import { LOGO_DATA_URI } from './pdf-logo.js';

export { genSemanalAI, genPatientAI };

// ── Helpers de informes (cálculo sobre state real) ──
// Contexto del último informe renderizado (episodio-aware) para que exportarPDF use exactamente los mismos datos que la pantalla.
let _rptCtx = null;
const MES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Datos de contacto de la clínica para el pie del PDF. Los segmentos vacíos se omiten del footer.
const CONFIG_CLINICA = {
  DIRECCION: 'Palmeras Shopping, Vía Intervalles OE-95 y primera transversal, Tumbaco',
  TELEFONO: '099 921 1258',
  EMAIL: '', // poner 'recepcion@rehactivaec.com' cuando se confirme que el buzón recibe
};

function _ym(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; } // m 0-based
function _prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return _ym(d.getFullYear(), d.getMonth());
}
// prefix = 'YYYY-MM' (mes) o 'YYYY' (año). cont = null si no hubo citas decididas (sin NaN/0 falso).
function _apptStats(prefix) {
  const ap = state.appointments.filter(a => a.date && a.date.startsWith(prefix));
  const conf = ap.filter(a => a.status === 'conf').length;
  const noas = ap.filter(a => a.status === 'noas').length;
  const dec = conf + noas;
  return { total: ap.length, conf, noas, cont: dec > 0 ? Math.round(conf / dec * 100) : null };
}
function _nuevos(prefix) {
  return state.patients.filter(p => p.createdAt && p.createdAt.startsWith(prefix)).length;
}
function _monthHasData(ym) {
  return state.appointments.some(a => a.date && a.date.startsWith(ym));
}
// Chip de variación honesto. kind:'pct'|'abs'. goodWhenUp: si subir es bueno (verde).
// Mes anterior sin datos -> '—'. % con prev===0 -> '—' (jamás dividir por cero). Nunca inventa.
function _deltaChip(cur, prev, pym, kind, goodWhenUp) {
  if (!_monthHasData(pym)) return '<div class="stat-chg neu">—</div>';
  const lbl = 'vs ' + MES_CORTO[parseInt(pym.split('-')[1], 10) - 1].toLowerCase();
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

let _mensualMonth = null; // 'YYYY-MM' seleccionado en el informe mensual
export function changeMensualMonth(ym) { _mensualMonth = ym; renderMensual(); }

export function hmCol(p){
  if(p===null||p===0) return '#f0efe8';
  if(p<30) return '#E24B4A';
  if(p<45) return '#E88B5B';
  if(p<60) return '#E0A850';
  if(p<75) return '#E0D068';
  if(p<85) return '#7DC9A6';
  if(p<95) return '#1D9E75';
  return '#0F6E56';
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
// (moderado) / 1–3 verde (leve) / 0 azul (sin dolor). Debe concordar con las bandas del gráfico (:670).
function evaColor(v){ return v>=7?'#E24B4A':v>=4?'#E0A850':v>=1?'#1D9E75':'#29ABE2'; }
// Fecha 'YYYY-MM-DD' → 'DD/MM/YYYY' (para el detalle del informe, sin hora).
function dmy(d){ const p=String(d||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(d||''); }

// Fuente ÚNICA de la semana visible (Lun–Vie) derivada de state.currentWeek.
// La usan renderSemanal, renderTherapistUtil, renderHeatmap y renderInsights para que
// las flechas de navegación muevan DATOS y rótulo de forma consistente.
function semanaVisible() {
  const base = new Date();
  const s = new Date(base);
  s.setDate(base.getDate() + state.currentWeek * 7 - (base.getDay() || 7) + 1);
  const dates = [];
  for (let i = 0; i < 5; i++) { const d = new Date(s); d.setDate(s.getDate() + i); dates.push(fmtDate(d)); }
  return { start: s, dates };
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
      // Capacidad = sub-slots de 30min cubiertos por los terapeutas en [hr, hr+1).
      let cap=0;
      state.therapists.forEach(t=>{ if(hr>=t.startH&&hr<t.endH)cap++; if(hr+0.5>=t.startH&&hr+0.5<t.endH)cap++; });
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

export function renderTherapistUtil() {
  const el=document.getElementById('th-util-report'); if(!el) return;
  const {dates:semDates}=semanaVisible();
  el.innerHTML=orderedTherapists().map(th=>{
    const ts=therapistHours(th).length*5;
    const us=state.appointments.filter(a=>a.therapistId===th.id&&semDates.includes(a.date)&&a.status==='conf').length;
    const u=ts>0?Math.round(us/ts*100):0;
    const c=getColor(th.colorId);const uc=hmCol(u);
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)">
      <div class="avatar" style="background:${c.border}22;color:${c.text};width:30px;height:30px">${esc(th.initials)}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:500;color:#1a1917">${esc(th.name)}</div>
        <div style="font-size:10px;color:#6b6a64">${th.startH}:00–${th.endH}:00</div>
        <div class="util-bar"><div class="util-fill" style="width:${u}%;background-color:${uc}"></div></div>
      </div>
      <div style="text-align:right;min-width:48px"><div style="font-size:15px;font-weight:500;color:${uc}">${u}%</div><div style="font-size:10px;color:#6b6a64">${us}/${ts}</div></div>
    </div>`;
  }).join('');
}

// renderTherapistUtil quedó sin caller: el rediseño integra la utilización en
// "Desempeño por terapeuta" dentro de renderSemanal. Se conserva exportada por compat.

export function renderInsights() {
  const el=document.getElementById('insights'); if(!el) return;
  const {dates:semDates}=semanaVisible();
  const wk=state.appointments.filter(a=>semDates.includes(a.date));
  const occ=wk.filter(a=>a.status==='conf'||a.status==='pend');
  const noas=wk.filter(a=>a.status==='noas');
  const items=[];

  // Hora con más citas agendadas (conf+pend), por hora de inicio.
  if(occ.length){
    const byHour={};
    occ.forEach(a=>{const h=Math.floor(a.hour);byHour[h]=(byHour[h]||0)+1;});
    const top=Object.entries(byHour).sort((a,b)=>b[1]-a[1])[0];
    if(top){
      const h=+top[0], n=top[1];
      items.push({bg:'rgba(29,158,117,.12)',tc:'#17865f',icon:'↑',t:`${h}:00–${h+1}:00 es la franja con más citas`,s:`${n} cita${n>1?'s':''} agendada${n>1?'s':''} en ese horario.`});
    }
  }

  // Terapeuta con más citas (iterando terapeutas para no perder el tipo del id).
  if(occ.length&&state.therapists.length){
    const top=state.therapists.map(th=>({th,n:occ.filter(a=>a.therapistId===th.id).length})).sort((a,b)=>b.n-a.n)[0];
    if(top&&top.n>0) items.push({bg:'rgba(41,171,226,.12)',tc:'#1d8fbf',icon:'i',t:`${esc(top.th.name)} lidera la agenda`,s:`${top.n} cita${top.n>1?'s':''} esta semana.`});
  }

  // Inasistencias reales de la semana.
  if(noas.length){
    const pac=new Set(noas.map(a=>a.patientId)).size;
    items.push({bg:'rgba(226,75,74,.1)',tc:'#c33a3a',icon:'✕',t:`${noas.length} inasistencia${noas.length>1?'s':''} esta semana`,s:`${pac} paciente${pac>1?'s':''} no asistió.`});
  }

  if(!items.length){
    el.innerHTML='<div style="font-size:12px;color:#9c9a92;padding:8px 0">Sin datos suficientes para generar insights esta semana.</div>';
    return;
  }
  el.innerHTML=items.map(x=>`<div class="insight-row"><div class="insight-icon" style="background:${x.bg};color:${x.tc}">${x.icon}</div><div><div class="insight-text">${x.t}</div><div class="insight-sub">${x.s}</div></div></div>`).join('');
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
  const {dates:semDates}=semanaVisible();
  const semAppts=state.appointments.filter(a=>semDates.includes(a.date));
  const conf=semAppts.filter(a=>a.status==='conf');
  const noas=semAppts.filter(a=>a.status==='noas');
  const total=semAppts.length;
  const tasaAsist=total>0?Math.round(conf.length/total*100):0;
  const patsAtendidos=new Set(conf.map(a=>a.patientId)).size;
  const patsNoas=new Set(noas.map(a=>a.patientId)).size;
  const diagCount={};
  conf.forEach(a=>{const pt=getPatient(a.patientId);if(pt&&pt.diag){const d=pt.diag.split(/[,;]/)[0].trim();diagCount[d]=(diagCount[d]||0)+1;}});
  const topDiag=Object.entries(diagCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const proxAlta=state.patients.filter(p=>p.status==='active'&&p.sessions>0&&Math.round((doneActual(p)/p.sessions)*100)>=80).slice(0,5);
  const kpi=(lbl,val,sub,color)=>`<div class="kpi"><div class="kpi-lbl">${lbl}</div><div class="kpi-val"${color?` style="color:${color}"`:''}>${val}</div><div class="kpi-sub">${sub}</div></div>`;
  const rank=(name,val,color)=>`<div class="rank-row"><span style="color:#1a1917">${name}</span><b style="color:${color}">${val}</b></div>`;

  // "Ingreso estimado" excluido a propósito (la app no maneja dinero por diseño).
  const statsHtml=`
  <div class="kpi-grid">
    ${kpi('Citas totales',total,`${semDates.length} días hábiles`)}
    ${kpi('Asistencia',tasaAsist+'%',`${conf.length} confirmadas`,tasaAsist>=80?'#17865f':tasaAsist>=60?'#a06a00':'#c33a3a')}
    ${kpi('No asistieron',noas.length,`${patsNoas} paciente${patsNoas!==1?'s':''}`,'#c33a3a')}
    ${kpi('Atendidos',patsAtendidos,'únicos')}
    ${kpi('Activos',state.patients.filter(p=>p.status==='active').length,'en tratamiento')}
  </div>
  <div class="inf-grid">
    <div class="panel">
      <div class="panel-title">Desempeño por terapeuta</div>
      <div style="display:flex;flex-direction:column;gap:10px">
      ${orderedTherapists().map(th=>{
        const thAppts=semAppts.filter(a=>a.therapistId===th.id);
        const thConf=thAppts.filter(a=>a.status==='conf').length;
        const thNoas=thAppts.filter(a=>a.status==='noas').length;
        const slots=therapistHours(th).length*5;
        const util=slots>0?Math.round(thConf/slots*100):0;
        const c=getColor(th.colorId);
        return '<div style="display:flex;align-items:center;gap:10px">'
          +'<span class="avatar" style="background:'+c.bg+';color:'+c.text+'">'+esc(th.initials)+'</span>'
          +'<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between"><span style="font-size:12px;font-weight:700;color:#1a1917">'+esc(th.name)+'</span>'
          +'<span style="font-size:11px;color:#7a7a76"><b style="color:#17865f">✓ '+thConf+'</b> · <b style="color:#c33a3a">✗ '+thNoas+'</b></span></div>'
          +'<div style="margin-top:4px;height:5px;background:#f0e8d8;border-radius:3px"><div style="height:5px;width:'+Math.min(util,100)+'%;background:'+utilColor(util)+';border-radius:3px"></div></div>'
          +'</div><span style="font-size:14px;font-weight:700;color:'+utilText(util)+';width:40px;text-align:right;flex-shrink:0">'+util+'%</span></div>';
      }).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="panel" style="flex:1">
        <div class="panel-title" style="margin-bottom:6px">Top diagnósticos</div>
        ${topDiag.length?topDiag.map(([d,n])=>rank(esc(d),n,'#1d8fbf')).join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Sin datos esta semana</div>'}
      </div>
      <div class="panel" style="flex:1">
        <div class="panel-title" style="margin-bottom:6px">Próximos a alta ≥80%</div>
        ${proxAlta.length?proxAlta.map(p=>rank(esc(p.name.split(' ').slice(0,2).join(' ')),Math.round(doneActual(p)/p.sessions*100)+'%','#a06a00')).join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Ninguno cerca del alta</div>'}
      </div>
    </div>
  </div>
  <div class="inf-grid">
    <div class="panel">
      <div class="panel-title">Mapa de calor — utilización por hora y día</div>
      <div id="heatmap-container"></div>
      <div id="heatmap-legend" style="display:flex;align-items:center;gap:5px;margin-top:10px;font-size:10px;color:#9c9a92"></div>
    </div>
    <div class="panel">
      <div class="panel-title">Insights automáticos</div>
      <div id="insights"></div>
    </div>
  </div>
  ${(function(){
    if(!noas.length)return'';
    let r='<div class="panel"><div class="panel-title">No asistieron — requieren seguimiento</div>';
    noas.slice(0,6).forEach(function(a){
      var pt=getPatient(a.patientId);var th=getTherapist(a.therapistId);
      var tel=pt&&pt.tel?'593'+pt.tel.replace(/[^0-9]/g,'').slice(-9):'';
      var waBtn=tel?'<button onclick="window.open(\'https://wa.me/'+tel+'\',\'_blank\')" style="font-size:10px;padding:3px 10px;background:rgba(37,160,90,.12);color:#25a05a;border:none;border-radius:99px;cursor:pointer;font-weight:600;font-family:inherit">WA</button>':'';
      r+='<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(226,75,74,.08)">'
        +'<div><div style="font-size:12px;font-weight:600;color:#1a1917">'+esc(pt?pt.name:'Paciente')+'</div>'
        +'<div style="font-size:10px;color:#9c9a92">'+a.date+(th?' · '+esc(th.name):'')+'</div></div>'
        +waBtn+'</div>';
    });
    r+='</div>';return r;
  })()}`;

  document.getElementById('semanal-stats').innerHTML=statsHtml;
  renderHeatmap(); renderInsights();
}

export function showSubTab(n,btn) {
  ['semanal','mensual','anual'].forEach(t=>document.getElementById('subtab-'+t).style.display=t===n?'':'none');
  document.querySelectorAll('#tab-informes .sub-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  if(n==='semanal')renderSemanal();if(n==='mensual')renderMensual();if(n==='anual')renderAnual();
}

export function renderMensual() {
  const now = new Date();
  const curYm = _ym(now.getFullYear(), now.getMonth());
  if (!_mensualMonth) _mensualMonth = curYm;
  const ym = _mensualMonth;
  const pym = _prevYm(ym);
  const ppym = _prevYm(pym);

  const cur = _apptStats(ym);
  const prev = _apptStats(pym);
  const nuevos = _nuevos(ym);
  const nuevosPrev = _nuevos(pym);

  const activos = state.patients.filter(p => p.status === 'active').length;
  const altas = state.patients.filter(p => p.status === 'alta').length;

  // Opciones del selector: meses con datos + siempre el mes actual, desc.
  const mset = new Set([curYm]);
  state.appointments.forEach(a => { if (a.date) mset.add(a.date.slice(0, 7)); });
  state.patients.forEach(p => { if (p.createdAt) mset.add(p.createdAt.slice(0, 7)); });
  const optsHtml = [...mset].filter(Boolean).sort().reverse().map(m => {
    const [y, mo] = m.split('-').map(Number);
    return `<option value="${m}"${m === ym ? ' selected' : ''}>${MES_LARGO[mo - 1]} ${y}</option>`;
  }).join('');

  const contColor = cur.cont == null ? '#6b6a64' : cur.cont >= 85 ? '#1D9E75' : cur.cont >= 70 ? '#BA7517' : '#E24B4A';
  const contTxt = cur.cont == null ? '—' : cur.cont + '%';

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <select onchange="changeMensualMonth(this.value)" style="background:#ffffff;border:1px solid rgba(29,158,117,.2);border-radius:6px;padding:7px 12px;font-size:13px;color:#1a1917">${optsHtml}</select>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis con IA</button>
  </div>`;
  html += `<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Sesiones del mes</div><div class="stat-val">${cur.conf}</div>${_deltaChip(cur.conf, prev.conf, pym, 'pct', true)}</div>
    <div class="stat"><div class="stat-lbl">Continuidad promedio</div><div class="stat-val" style="color:${contColor}">${contTxt}</div><div class="stat-chg neu">Meta: 85%</div></div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div><div class="stat-val" style="color:#E24B4A">${cur.noas}</div>${_deltaChip(cur.noas, prev.noas, pym, 'abs', false)}</div>
    <div class="stat"><div class="stat-lbl">Pacientes activos</div><div class="stat-val">${activos}</div><div class="stat-chg neu">en tratamiento</div></div>
    <div class="stat"><div class="stat-lbl">Altas médicas (total)</div><div class="stat-val">${altas}</div><div class="stat-chg neu">total</div></div>
    <div class="stat"><div class="stat-lbl">Nuevos pacientes</div><div class="stat-val">${nuevos}</div>${_deltaChip(nuevos, nuevosPrev, pym, 'abs', true)}</div>
  </div>`;
  html += `<div class="full-card"><div class="card-title">Pacientes por doctor referente</div>`;
  state.doctors.forEach(d => {
    const n = state.patients.filter(p => p.doctorId === d.id).length;
    html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)"><span style="width:10px;height:10px;border-radius:50%;background:${safeColor(d.color)};display:inline-block;flex-shrink:0"></span><div style="flex:1;font-size:12px;color:#c8c6c0">${esc(d.name)} <span style="color:#6b6a64">(${esc(d.spec)})</span></div><div style="font-size:13px;font-weight:500;color:#1a1917">${n}</div></div>`;
  });
  html += `</div><div class="full-card"><div class="card-title">Tendencia — últimos 3 meses</div><canvas id="monthly-chart" height="80"></canvas></div>`;
  document.getElementById('mensual-content').innerHTML = html;

  // Datos reales para el chart: 3 meses [ppym, pym, ym]. Meses sin datos = 0, nunca undefined.
  const chartMonths = [ppym, pym, ym];
  const cs = chartMonths.map(_apptStats);
  const chartLabels = chartMonths.map(m => MES_LARGO[parseInt(m.split('-')[1], 10) - 1]);

  setTimeout(() => {
    const ctx = document.getElementById('monthly-chart'); if (!ctx) return;
    Chart.getChart(ctx)?.destroy();   // destruir chart previo del mismo canvas (evita "Canvas already in use")
    Chart.defaults.color = '#6b6a64';
    new Chart(ctx, { type: 'bar', data: { labels: chartLabels, datasets: [
      { label: 'Sesiones', data: cs.map(s => s.conf), backgroundColor: '#1D9E75', borderRadius: 4 },
      { label: 'Continuidad %', data: cs.map(s => s.cont ?? 0), backgroundColor: '#378ADD', borderRadius: 4 },
      { label: 'Inasistencias', data: cs.map(s => s.noas), backgroundColor: '#E24B4A', borderRadius: 4 },
    ] }, options: { responsive: true, plugins: { legend: { labels: { font: { size: 11 }, color: '#9c9a92' } } }, scales: { y: { beginAtZero: true, ticks: { color: '#6b6a64', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#6b6a64' }, grid: { display: false } } } } });
  }, 50);
}

export function renderAnual() {
  const now = new Date();
  const year = now.getFullYear();
  const ystr = String(year);

  const perMes = [];
  for (let m = 0; m < 12; m++) perMes.push(_apptStats(_ym(year, m)));
  const sArr = perMes.map(s => s.conf); // sesiones (conf) por mes; sin datos = 0
  const sesAcum = sArr.reduce((a, b) => a + b, 0);
  const noasAcum = perMes.reduce((a, s) => a + s.noas, 0);
  const decAnual = sesAcum + noasAcum;
  const contAnual = decAnual > 0 ? Math.round(sesAcum / decAnual * 100) : null;
  const altas = state.patients.filter(p => p.status === 'alta').length;
  const uniq = new Set(
    state.appointments.filter(a => a.date && a.date.startsWith(ystr)).map(a => a.patientId)
  ).size;

  // Proyección run-rate sobre MESES COMPLETOS (excluye el mes actual en curso).
  // Enero (mes en curso) => 0 meses completos => '—'.
  const mesesCompletos = now.getMonth(); // 0-based = nº de meses ya cerrados este año
  const sesCompletos = sArr.slice(0, mesesCompletos).reduce((a, b) => a + b, 0);
  const proyeccion = mesesCompletos > 0 ? Math.round(sesCompletos / mesesCompletos * 12) : null;

  const contColor = contAnual == null ? '#6b6a64' : contAnual >= 85 ? '#1D9E75' : contAnual >= 70 ? '#BA7517' : '#E24B4A';

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div style="font-size:14px;font-weight:500;color:#1a1917">Informe anual ${year}</div>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis anual con IA</button>
  </div>`;
  html += `<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Sesiones acumuladas</div><div class="stat-val">${sesAcum}</div><div class="stat-chg neu">Ene–${MES_CORTO[now.getMonth()]} ${year}</div></div>
    <div class="stat"><div class="stat-lbl">Continuidad prom.</div><div class="stat-val" style="color:${contColor}">${contAnual == null ? '—' : contAnual + '%'}</div><div class="stat-chg neu">Meta: 85%</div></div>
    <div class="stat"><div class="stat-lbl">Altas médicas (total)</div><div class="stat-val" style="color:#1D9E75">${altas}</div><div class="stat-chg neu">total</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes únicos</div><div class="stat-val">${uniq}</div><div class="stat-chg neu">con cita en ${year}</div></div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div><div class="stat-val" style="color:#E24B4A">${noasAcum}</div><div class="stat-chg neu">Acumuladas</div></div>
    <div class="stat"><div class="stat-lbl">Proyección anual</div><div class="stat-val">${proyeccion != null ? proyeccion : '—'}</div><div class="stat-chg neu">${proyeccion != null ? 'estimada al ritmo actual' : 'sin meses completos'}</div></div>
  </div>`;
  html += `<div class="full-card"><div class="card-title">Sesiones por mes — ${year}</div><canvas id="anual-chart" height="80"></canvas></div>`;
  document.getElementById('anual-content').innerHTML = html;
  setTimeout(() => {
    const ctx = document.getElementById('anual-chart'); if (!ctx) return;
    Chart.getChart(ctx)?.destroy();   // destruir chart previo del mismo canvas (evita "Canvas already in use")
    Chart.defaults.color = '#6b6a64';
    new Chart(ctx, { type: 'bar', data: { labels: MES_CORTO, datasets: [{ label: 'Sesiones', data: sArr, backgroundColor: sArr.map(v => v > 0 ? '#1D9E75' : '#1a1917'), borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#6b6a64', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#6b6a64' }, grid: { display: false } } } } });
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
      epDone=log.filter(s=>s.status==='asistió').length;
    }
  }
  // Orden cronológico por fecha (estable para empates) — necesario para que las sesiones
  // retroactivas/manuales aparezcan en su posición correcta en el gráfico EVA, el detalle y las métricas.
  log=[...log].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const isCurrentEpisode=epVal==='current';
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
      ${partes.length?partes.map(x=>`<div style="font-size:11.5px;color:#3a3a36;line-height:1.6;margin-bottom:3px">${esc(x)}</div>`).join(''):'<div style="font-size:11.5px;color:#9c9a92">Sin detalle registrado</div>'}
    </div>`;
  }

  let tablaHtml='';
  if(tratRows.length){
    const thc=(t,al)=>`<th style="text-align:${al||'left'};font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#9c9a92;padding:6px 8px 5px 0">${t}</th>`;
    const showAcc=canEdit||canDelete;
    tablaHtml=`<div style="margin-top:16px"><div class="rpt-sec-title">Detalle por sesión (${tratRows.length})</div>
      <table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr>${thc('Fecha')}${thc('Terapeuta')}${thc('EVA','center')}${thc('Técnicas y observación')}${showAcc?thc('Acciones','center'):''}</tr></thead><tbody>`;
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
        const inner=(eBtn+dBtn)||'<span style="color:#c8c6c0">—</span>';
        acc=`<td style="${td};text-align:center;white-space:nowrap"><div style="display:flex;gap:5px;justify-content:center">${inner}</div></td>`;
      }
      tablaHtml+=`<tr><td style="${td};color:#1a1917;white-space:nowrap">${dmy(s.date)}</td>
        <td style="${td};color:#1a1917;white-space:nowrap">${esc(thName)}</td>
        <td style="${td};text-align:center;font-weight:700;color:${evaCol};white-space:nowrap">${eva}</td>
        <td style="${td};color:#5a5a56">${obs}</td>${acc}</tr>`;
    });
    tablaHtml+=`</tbody></table></div>`;
  } else {
    tablaHtml=`<div style="margin-top:16px;text-align:center;padding:18px 0;color:#7a7a76;font-size:12px">Sin sesiones de tratamiento registradas en este episodio.</div>`;
  }

  let html=avisoEpisodio
  +`<div class="rpt-layout">
    <div class="rpt-sheet">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #29ABE2;padding-bottom:14px;gap:16px;flex-wrap:wrap">
        <div><img src="img/logo-rehactiva.png" alt="Rehactiva" style="width:190px;display:block"><div style="font-size:10.5px;color:#7a7a76;margin-top:4px">Rehabilitación y Fisioterapia · Quito, Ecuador · rehactivaec.com</div></div>
        <div style="text-align:right;font-size:11px;color:#5a5a56;line-height:1.6;flex-shrink:0"><div style="font-size:13px;font-weight:700;color:#1a1917">Informe de evolución</div><div>N.º ${rptNo}</div><div>${fechaLarga}</div></div>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:16px;flex-wrap:wrap">
        <div style="font-size:18px;font-weight:700;color:#1a1917">${esc(p.name)}</div>${sp}
        <span style="font-size:12px;color:#7a7a76">${getDisplayAge(p)}</span>
        ${!isCurrentEpisode?'<span style="font-size:10.5px;background:rgba(245,166,35,.15);color:#a06a00;padding:1px 8px;border-radius:99px;font-weight:700">Episodio anterior</span>':''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 20px;margin-top:12px;padding:12px 14px;background:#faf6ef;border-radius:8px">
        ${cellG('Diagnóstico',epDiag||p.diag||'—')}
        ${cellG('Doctor referente',doc?doc.name+' ('+doc.spec+')':'Independiente')}
        ${cellG('Inicio',inicio==='—'?'—':dmy(inicio))}
        ${cellG('Protocolo',prot?`${prot.name} · ${prot.sessions} sesiones · ${prot.freq}×/sem`:'—',2)}
        ${cellG('Terapeuta',thHeader)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px">
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
          <button class="side-btn outline" onclick="exportarPDF()">Exportar PDF</button>
          ${hasPermission('viewAI')?`<button class="side-btn outline" id="save-informe-btn" style="display:none" onclick="guardarInforme()">💾 Guardar informe</button>`:''}
        </div>
      </div>
      <div class="side-card">
        <div class="side-title">Paciente</div>
        <div class="side-col">
          <button class="side-btn soft" onclick="agendarCitaParaPaciente('${esc(p.id)}')">+ Agendar cita</button>
          ${hasPermission('registerSession')?`<button class="side-btn soft" onclick="openSessionModalManual('${esc(p.id)}')">+ Sesión manual</button>`:''}
          ${isCurrentEpisode?`<button class="side-btn warn" onclick="nuevoEpisodio('${esc(p.id)}')">Nuevo episodio</button>`:''}
        </div>
      </div>
      <div id="informes-guardados" class="side-card"></div>
    </aside>
  </div>`;

  out.innerHTML=html;
  _rptCtx={p,log,attended,pct,adh,fp,lp,th,doc,epDiag,epDone,epSessions,inicio,rptNo,fechaLarga,thHeader,prot};
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
  const {p,log,attended,pct,adh,fp,lp,doc,inicio,rptNo,fechaLarga,thHeader,prot,epDiag,epDone,epSessions}=_rptCtx;
  // Captura del gráfico EVA ya dibujado en pantalla — evita el canvas en blanco por timing.
  const evaCanvas=document.getElementById('eva-evolution-chart');
  const evaImg=evaCanvas?evaCanvas.toDataURL('image/png'):'';
  const sesAsc=log.filter(s=>s.type!=='Fin de episodio');
  const evalRow=sesAsc.find(s=>s.type==='Evaluación inicial');
  const tratRows=sesAsc.filter(s=>s.type!=='Evaluación inicial');
  return {
    numero:rptNo,
    fechaLarga,
    paciente:{nombre:p?.name||'',cedula:p?.cedula||'',edad:getDisplayAge(p,true),diagnostico:epDiag||p?.diag||''},
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
  };
}

// PURA: gráfico EVA del PDF como SVG inline, espejando la MISMA serie que dibuja el canvas
// 'eva-evolution-chart' en pantalla (:684): arranca en el dolor inicial (metricas.evaInicial,
// capturado de fp.pb), sigue con el dolor tras cada sesión con EVA (pa, o pb si falta) y termina
// en el dolor actual (metricas.evaActual). El snapshot no guarda status, así que el espejo de
// evaSes es pb!=null (una sesión sin EVA registrado no puntúa en ninguno de los dos gráficos).
// Devuelve '' si no hay serie construible (el caller cae a evaChartImg para snapshots viejos).
function _buildEvaSvg(m) {
  const ses=(m.sesiones||[]).map((s,i)=>({...s,n:i+1})).filter(s=>s.pb!=null);
  if(!ses.length) return '';
  const met=m.metricas||{};
  const startVal=met.evaInicial!=null?met.evaInicial:ses[0].pb;
  const endVal=met.evaActual!=null?met.evaActual:ses[ses.length-1].pa;
  const mid=ses.map(s=>s.pa!=null?s.pa:s.pb);
  if(endVal!=null) mid[mid.length-1]=endVal;
  // Punto 0 = estado inicial (fechado en la evaluación inicial si existe); luego "Sesión N"
  // con el N de la tabla "Detalle por sesión" para que gráfico y tabla se lean juntos.
  const pts=[startVal,...mid].map((v,i)=>i===0
    ?{v,lbl:m.evalInicial?'Eval. inicial':'Inicio',fecha:m.evalInicial?m.evalInicial.fecha:ses[0].fecha}
    :{v,lbl:'Sesión '+ses[i-1].n,fecha:ses[i-1].fecha});
  const n=pts.length;
  const L=34,R=700,T=20,B=190;
  const y=v=>B-(v/10)*(B-T);
  const x=i=>n>1?64+i*(670-64)/(n-1):367;
  let g='';
  [0,2,4,6,8,10].forEach(v=>{
    g+='<line x1="'+L+'" y1="'+y(v)+'" x2="'+R+'" y2="'+y(v)+'" stroke="#EAEAE4" stroke-width="1"/>'
      +'<text x="'+(L-8)+'" y="'+(y(v)+3)+'" text-anchor="end" font-size="8" fill="#6B6B66">'+v+'</text>';
  });
  // Referencias clínicas de la escala EVA: 3 (leve/moderado) y 6 (moderado/severo).
  [3,6].forEach(v=>{ g+='<line x1="'+L+'" y1="'+y(v)+'" x2="'+R+'" y2="'+y(v)+'" stroke="#B8B8B0" stroke-width="1" stroke-dasharray="4 3"/>'; });
  [[1.5,'leve'],[4.5,'moderado'],[8,'severo']].forEach(z=>{
    g+='<text x="'+(R+8)+'" y="'+(y(z[0])+3)+'" font-size="8" fill="#6B6B66">'+z[1]+'</text>';
  });
  g+='<polyline points="'+pts.map((p,i)=>x(i).toFixed(1)+','+y(p.v).toFixed(1)).join(' ')+'" fill="none" stroke="#155B7A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  const step=Math.max(1,Math.ceil(n/10)); // como el autoSkip del canvas: no amontonar etiquetas
  pts.forEach((p,i)=>{
    const px=x(i).toFixed(1);
    g+='<circle cx="'+px+'" cy="'+y(p.v).toFixed(1)+'" r="3.5" fill="#155B7A"/>'
      +'<text x="'+px+'" y="'+(y(p.v)-8).toFixed(1)+'" text-anchor="middle" font-size="9" font-weight="bold" fill="#1A1A1A">'+esc(p.v)+'</text>';
    if(i%step===0||i===n-1){
      g+='<text x="'+px+'" y="204" text-anchor="middle" font-size="8" fill="#6B6B66">'+esc(p.lbl)+'</text>'
        +'<text x="'+px+'" y="214" text-anchor="middle" font-size="8" fill="#6B6B66">'+esc(dmy(p.fecha))+'</text>';
    }
  });
  return '<svg viewBox="0 0 760 240" font-family="Arial,Helvetica,sans-serif" style="width:100%;height:auto;display:block;background:#fff">'+g+'</svg>';
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

  const evaSvg=_buildEvaSvg(m);
  const chart=evaSvg
    ?'<div class="keep"><h2>Evolución del dolor (EVA)</h2>'+evaSvg+'</div>'
    :(m.evaChartImg?'<div class="keep"><h2>Evolución del dolor (EVA)</h2><img src="'+esc(m.evaChartImg)+'" style="max-width:100%;display:block"></div>':'');

  let evalBlock='';
  if(m.evalInicial){
    const partes=m.evalInicial.partes||[];
    evalBlock='<div class="keep"><h2>Evaluación inicial</h2>'
      +'<div class="eval-sub">'+esc(dmy(m.evalInicial.fecha))+' · EVA '+(m.evalInicial.pb!=null?esc(m.evalInicial.pb):'—')+'/10</div>'
      +(partes.length?partes.map(x=>'<p class="eval-p">'+esc(x)+'</p>').join(''):'<p class="eval-p mut">Sin detalle registrado</p>')
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

function openPdfWindow(html) {
  const win=window.open('','_blank');
  if(!win){window._app.toastErr('Permite ventanas emergentes para exportar PDF');return false;}
  win.document.write(html);win.document.close();
  return true;
}

export function exportarPDF() {
  if(!_rptCtx){window._app.toastErr('Abrí primero el informe de un paciente');return;}
  openPdfWindow(buildPdfHtml(_buildRenderModel()));
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
