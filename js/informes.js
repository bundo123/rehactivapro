import { state } from './state.js';
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor, therapistHours, ALL_HOURS, DAYS, COLOR_OPTIONS, getDisplayAge, doneActual } from './utils.js';
import { apptSlots } from './agenda.js';
import { genSemanalAI, genPatientAI, callAI } from './ia.js';
import { hasEvalInicial } from './resumen.js';
import { hasPermission } from './permissions.js';

export { genSemanalAI, genPatientAI };

// ── Helpers de informes (cálculo sobre state real) ──
// Contexto del último informe renderizado (episodio-aware) para que exportarPDF use exactamente los mismos datos que la pantalla.
let _rptCtx = null;
const MES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

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

// Color por umbral del % de Sesiones (progreso): ≥66 verde / 33–65 amarillo / <33 rojo.
// (Continuidad usa su propia escala 85/70, no esta.)
function pctColor(v){ return v>=66?'#1D9E75':v>=33?'#BA7517':'#E24B4A'; }
// Color del dolor EVA por valor: 6–10 rojo / 2–5 verde / 0–1 azul.
function evaColor(v){ return v>=6?'#E24B4A':v>=2?'#1D9E75':'#29ABE2'; }
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
      const tc=p>=60?'#fff':'#1a1917';
      html+=`<div class="hm-cell" style="background:${hmCol(p)};color:${tc}">${p}%<div class="tooltip-val">${d} ${hr}:00 — ${occ}/${cap} · ${p}%</div></div>`;
    });
  });
  html+='</div>';
  document.getElementById('heatmap-container').innerHTML=html;
  renderHeatmapLegend();
}

// Leyenda derivada de hmCol() (un valor representativo por tramo) para que los swatches
// concuerden SIEMPRE con lo pintado en las celdas.
function renderHeatmapLegend() {
  const el=document.getElementById('heatmap-legend'); if(!el) return;
  const vals=[20,40,55,70,80,90,100];
  el.innerHTML='<span>0%</span>'+vals.map(v=>`<div style="width:10px;height:10px;border-radius:2px;background:${hmCol(v)}"></div>`).join('')+'<span>100%</span>';
}

export function renderTherapistUtil() {
  const {dates:semDates}=semanaVisible();
  document.getElementById('th-util-report').innerHTML=state.therapists.map(th=>{
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
      items.push({bg:'#0d2a21',tc:'#1D9E75',icon:'↑',t:`${h}:00–${h+1}:00 es la franja con más citas`,s:`${n} cita${n>1?'s':''} agendada${n>1?'s':''} en ese horario.`});
    }
  }

  // Terapeuta con más citas (iterando terapeutas para no perder el tipo del id).
  if(occ.length&&state.therapists.length){
    const top=state.therapists.map(th=>({th,n:occ.filter(a=>a.therapistId===th.id).length})).sort((a,b)=>b.n-a.n)[0];
    if(top&&top.n>0) items.push({bg:'#0d1e2e',tc:'#7ab8e8',icon:'i',t:`${esc(top.th.name)} lidera la agenda`,s:`${top.n} cita${top.n>1?'s':''} esta semana.`});
  }

  // Inasistencias reales de la semana.
  if(noas.length){
    const pac=new Set(noas.map(a=>a.patientId)).size;
    items.push({bg:'#2b0f0f',tc:'#E24B4A',icon:'✕',t:`${noas.length} inasistencia${noas.length>1?'s':''} esta semana`,s:`${pac} paciente${pac>1?'s':''} no asistió.`});
  }

  if(!items.length){
    el.innerHTML='<div style="font-size:12px;color:#9c9a92;padding:8px 0">Sin datos suficientes para generar insights esta semana.</div>';
    return;
  }
  el.innerHTML=items.map(x=>`<div class="insight-row"><div class="insight-icon" style="background:${x.bg};color:${x.tc}">${x.icon}</div><div><div class="insight-text">${x.t}</div><div class="insight-sub">${x.s}</div></div></div>`).join('');
}

export function changeWeek(d) {
  state.currentWeek+=d;
  updateWeekLabel(); renderHeatmap(); renderTherapistUtil(); renderInsights();
}

export function updateWeekLabel() {
  const {start:s}=semanaVisible();
  const e=new Date(s);e.setDate(s.getDate()+4);
  const f=x=>`${x.getDate()}/${x.getMonth()+1}`;
  document.getElementById('week-lbl').textContent=`Semana ${f(s)} – ${f(e)} ${e.getFullYear()}`;
}

export function renderSemanal() {
  updateWeekLabel();
  const {start:semStart,dates:semDates}=semanaVisible();
  const semEnd=new Date(semStart);semEnd.setDate(semStart.getDate()+4);
  const semAppts=state.appointments.filter(a=>semDates.includes(a.date));
  const conf=semAppts.filter(a=>a.status==='conf');
  const noas=semAppts.filter(a=>a.status==='noas');
  const pend=semAppts.filter(a=>a.status==='pend');
  const total=semAppts.length;
  const tasaAsist=total>0?Math.round(conf.length/total*100):0;
  const patsAtendidos=new Set(conf.map(a=>a.patientId)).size;
  const patsNoas=new Set(noas.map(a=>a.patientId)).size;
  const ingresosEst=conf.length*25;
  const semLabel=fmtDate(semStart)+' al '+fmtDate(semEnd);
  const diagCount={};
  conf.forEach(a=>{const pt=getPatient(a.patientId);if(pt&&pt.diag){const d=pt.diag.split(/[,;]/)[0].trim();diagCount[d]=(diagCount[d]||0)+1;}});
  const topDiag=Object.entries(diagCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const proxAlta=state.patients.filter(p=>p.status==='active'&&p.sessions>0&&Math.round((doneActual(p)/p.sessions)*100)>=80).slice(0,5);

  const statsHtml=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div><div style="font-size:11px;color:#6b6a64;text-transform:uppercase;letter-spacing:.05em">Semana del</div><div style="font-size:14px;font-weight:600;color:#1a1917">${semLabel}</div></div>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis con IA</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div class="stat"><div class="stat-lbl">Citas totales</div><div class="stat-val">${total}</div><div style="font-size:10px;color:#6b6a64">${semDates.length} días hábiles</div></div>
    <div class="stat"><div class="stat-lbl">Asistencia</div><div class="stat-val" style="color:${tasaAsist>=80?'#1D9E75':tasaAsist>=60?'#BA7517':'#E24B4A'}">${tasaAsist}%</div><div style="font-size:10px;color:#6b6a64">${conf.length} confirmadas</div></div>
    <div class="stat"><div class="stat-lbl">No asistieron</div><div class="stat-val" style="color:#E24B4A">${noas.length}</div><div style="font-size:10px;color:#6b6a64">${patsNoas} pacientes</div></div>
    <div class="stat"><div class="stat-lbl">Ingreso estimado</div><div class="stat-val" style="color:#1D9E75">$${ingresosEst}</div><div style="font-size:10px;color:#6b6a64">a $25/sesión</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes atendidos</div><div class="stat-val">${patsAtendidos}</div><div style="font-size:10px;color:#6b6a64">únicos</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes activos</div><div class="stat-val">${state.patients.filter(p=>p.status==='active').length}</div><div style="font-size:10px;color:#6b6a64">en tratamiento</div></div>
  </div>
  <div class="full-card" style="margin-bottom:12px">
    <div class="card-title" style="margin-bottom:10px">Desempeño por terapeuta</div>
    ${state.therapists.map(th=>{
      const thAppts=semAppts.filter(a=>a.therapistId===th.id);
      const thConf=thAppts.filter(a=>a.status==='conf').length;
      const thNoas=thAppts.filter(a=>a.status==='noas').length;
      const slots=therapistHours(th).length*5;
      const util=slots>0?Math.round(thConf/slots*100):0;
      const c=getColor(th.colorId);
      const uc=util>=80?'#1D9E75':util>=60?'#BA7517':'#E24B4A';
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.06)">'
        +'<div class="avatar" style="background:'+c.border+'22;color:'+c.text+';width:32px;height:32px;font-size:11px;flex-shrink:0">'+th.initials+'</div>'
        +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#1a1917">'+th.name+'</div>'
        +'<div style="display:flex;gap:10px;margin-top:2px"><span style="font-size:11px;color:#1D9E75">✓ '+thConf+'</span><span style="font-size:11px;color:#E24B4A">✗ '+thNoas+'</span></div>'
        +'<div style="margin-top:4px;height:4px;background:#f0efe8;border-radius:2px"><div style="height:4px;width:'+Math.min(util,100)+'%;background:'+uc+';border-radius:2px"></div></div>'
        +'</div><div style="font-size:15px;font-weight:700;color:'+uc+';flex-shrink:0">'+util+'%</div></div>';
    }).join('')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Top diagnósticos</div>
      ${topDiag.length?topDiag.map(([d,n])=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.05)"><span style="font-size:11px;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">'+d+'</span><span style="font-size:11px;font-weight:700;color:#1D9E75;background:rgba(29,158,117,.1);padding:1px 7px;border-radius:99px;flex-shrink:0">'+n+'</span></div>').join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Sin datos esta semana</div>'}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Próximos a alta ≥80%</div>
      ${proxAlta.length?proxAlta.map(p=>{const pct=Math.round(doneActual(p)/p.sessions*100);return'<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.05)"><span style="font-size:11px;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">'+p.name.split(' ').slice(0,2).join(' ')+'</span><span style="font-size:11px;font-weight:700;color:#BA7517;background:rgba(186,117,23,.1);padding:1px 7px;border-radius:99px;flex-shrink:0">'+pct+'%</span></div>';}).join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Ninguno cerca del alta</div>'}
    </div>
  </div>
  ${(function(){
    if(!noas.length)return'';
    let r='<div class="full-card"><div class="card-title" style="margin-bottom:10px">No asistieron — requieren seguimiento</div>';
    noas.slice(0,6).forEach(function(a){
      var pt=getPatient(a.patientId);var th=getTherapist(a.therapistId);
      var tel=pt&&pt.tel?'593'+pt.tel.replace(/[^0-9]/g,'').slice(-9):'';
      var waBtn=tel?'<button onclick="window.open(\'https://wa.me/'+tel+'\',\'_blank\')" style="font-size:10px;padding:3px 10px;background:rgba(37,211,102,.12);color:#25d366;border:none;border-radius:99px;cursor:pointer;font-weight:600">WA</button>':'';
      r+='<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(224,80,80,.08)">'
        +'<div><div style="font-size:12px;font-weight:500;color:#1a1917">'+(pt?pt.name:'Paciente')+'</div>'
        +'<div style="font-size:10px;color:#9c9a92">'+a.date+(th?' · '+th.name:'')+'</div></div>'
        +waBtn+'</div>';
    });
    r+='</div>';return r;
  })()}`;

  document.getElementById('semanal-stats').innerHTML=statsHtml;
  renderHeatmap(); renderTherapistUtil(); renderInsights();
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
    html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)"><span style="width:10px;height:10px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0"></span><div style="flex:1;font-size:12px;color:#c8c6c0">${esc(d.name)} <span style="color:#6b6a64">(${esc(d.spec)})</span></div><div style="font-size:13px;font-weight:500;color:#1a1917">${n}</div></div>`;
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
    return `<div data-i="${i}" onmousedown="selectRptPatient('${esc(String(p.id))}')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;border-radius:50%;background:#e8f5f0;color:#1D9E75;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">${esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
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
  const thC=th?getColor(th.colorId):COLOR_OPTIONS[0];
  const citasConf=state.appointments.filter(a=>String(a.patientId)===String(p.id)&&a.status==='conf').length;
  const doneNow=doneActual(p);
  // Terapeuta(s) del episodio: modelo POR-SESIÓN (patient.therapistId no se usa en este app).
  // Encabezado: único nombre / 'Varios' / '—'. Firma: terapeuta de la última sesión con dato.
  const epThIds=[...new Set(log.filter(s=>s.therapistId).map(s=>String(s.therapistId)))];
  const thHeader=epThIds.length===0?'—':epThIds.length===1?(getTherapist(epThIds[0])?.name||'—'):'Varios';
  const withThLog=log.filter(s=>s.therapistId);
  const thFirma=withThLog.length?(getTherapist(withThLog[withThLog.length-1].therapistId)?.name||''):'';
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
  const cell=(lbl,val)=>`<div><div style="font-size:10px;font-weight:600;color:#6b6a64;text-transform:uppercase;letter-spacing:.04em">${lbl}</div><div style="font-size:13px;color:#1a1917;margin-top:1px">${esc(val)}</div></div>`;

  let html=avisoEpisodio
  +`<div class="full-card" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px">
      <div><div class="logo-text"><span class="w">Rehactiva</span><span class="g">Pro</span></div>
      <div style="font-size:11px;color:#6b6a64;margin-top:3px">Rehabilitación y Fisioterapia · Quito, Ecuador</div>
      <div style="font-size:13px;font-weight:600;color:#1a1917;margin-top:6px">Informe de evolución</div></div>
      <div style="text-align:right;flex-shrink:0;font-size:11px;color:#6b6a64"><div>N.º ${rptNo}</div><div>${fechaLarga}</div></div>
    </div>`
  +`<div class="full-card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
        <div class="avatar" style="background:${thC.border}22;color:${thC.text};width:52px;height:52px;font-size:18px;flex-shrink:0">${esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
        <div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:600;color:#1a1917">${esc(p.name)} ${sp}</div>
        <div style="font-size:12px;color:#6b6a64;margin-top:2px">${getDisplayAge(p)}${!isCurrentEpisode?' · <span style="font-size:10px;background:#fef3c7;color:#BA7517;padding:1px 7px;border-radius:99px">Episodio anterior</span>':''}</div></div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="ai-btn" onclick="genPatientAI()">Informe IA</button>
          <button class="exp-btn" onclick="exportarPDF()">Exportar PDF</button>
          <button onclick="agendarCitaParaPaciente('${esc(p.id)}')" style="padding:6px 14px;background:rgba(29,158,117,.12);color:#1D9E75;border:1px solid rgba(29,158,117,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">+ Agendar cita</button>
          ${hasPermission('registerSession')?`<button onclick="openSessionModalManual('${esc(p.id)}')" style="padding:6px 14px;background:rgba(41,171,226,.1);color:#155b7a;border:1px solid rgba(41,171,226,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">+ Sesión manual</button>`:''}
          ${isCurrentEpisode?`<button onclick="nuevoEpisodio('${esc(p.id)}')" style="padding:6px 14px;background:rgba(186,117,23,.1);color:#BA7517;border:1px solid rgba(186,117,23,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">🔄 Nuevo episodio</button>`:''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;border-top:1px solid rgba(29,158,117,.1);padding-top:12px">
        ${cell('Diagnóstico',epDiag||p.diag||'—')}${cell('Terapeuta',thHeader)}
        ${cell('Doctor referente',doc?doc.name+' ('+doc.spec+')':'Independiente')}${cell('Inicio de tratamiento',inicio)}
      </div>
    </div>`
  +`<div class="three-col" style="margin-bottom:14px">
      <div class="card"><div class="card-title">Sesiones</div><div style="text-align:center">
        <div style="font-size:28px;font-weight:600;color:${pctColor(pct)}">${pct}%</div>
        <div style="font-size:11px;color:#6b6a64;margin:3px 0 8px">${epDone} de ${epSessions} sesiones</div>
        <div class="bar-wrap" style="height:6px"><div class="bar-fill" style="width:${pct}%;background:${pctColor(pct)}"></div></div></div></div>
      <div class="card"><div class="card-title">Continuidad</div><div style="text-align:center">
        <div style="font-size:28px;font-weight:600;color:${ac}">${adh}%</div>
        <div style="font-size:11px;color:#6b6a64;margin:3px 0 8px">${attended.length} asist. / ${log.length} citas</div></div></div>
      <div class="card"><div class="card-title">Dolor EVA</div><div style="text-align:center">${fp&&lp&&fp.pb!=null?`
        <div style="display:flex;justify-content:center;align-items:center;gap:14px;padding:6px 0">
          <div><div style="font-size:26px;font-weight:600;color:${evaColor(fp.pb)}">${fp.pb}</div><div style="font-size:10px;color:#6b6a64">Inicial</div></div>
          <div style="color:#6b6a64;font-size:18px">→</div>
          <div><div style="font-size:26px;font-weight:600;color:${lp.pa!=null?evaColor(lp.pa):'#6b6a64'}">${lp.pa!=null?lp.pa:'?'}</div><div style="font-size:10px;color:#6b6a64">Actual</div></div>
        </div>`:'<div style="font-size:13px;color:#6b6a64;padding:16px 0">Sin datos EVA</div>'}</div></div>
    </div>`
  +(evaSes.length?`<div class="full-card" style="margin-bottom:14px"><div class="card-title" style="margin-bottom:8px">Evolución del dolor (EVA)</div><canvas id="eva-evolution-chart" height="90"></canvas></div>`:'')
  +`<div class="full-card" style="margin-bottom:14px"><div class="card-title" style="margin-bottom:8px">Narrativa clínica (IA)</div>
      <div id="patient-rpt-ai-output" style="font-size:13px;color:#6b6a64">— <span style="font-size:11px">(usá «Informe IA» para generar la evolución)</span></div></div>`;

  // Orden del detalle: 'Evaluación inicial' SIEMPRE primero (punto de partida), luego el resto
  // cronológico ascendente (log ya viene ordenado por fecha). Sin reverse.
  const sesAsc=log.filter(s=>s.type!=='Fin de episodio');
  const sesLog=[...sesAsc.filter(s=>s.type==='Evaluación inicial'),...sesAsc.filter(s=>s.type!=='Evaluación inicial')];
  if(sesLog.length){
    const thc=(t,al)=>`<th style="text-align:${al||'left'};font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b6a64;padding:6px 8px;border-bottom:1px solid rgba(29,158,117,.15)">${t}</th>`;
    const canEdit=hasPermission('registerSession');
    const canDelete=hasPermission('deleteSession');
    const showAcc=canEdit||canDelete;
    html+=`<div class="full-card"><div class="card-title" style="margin-bottom:10px">Detalle por sesión (${sesLog.length})</div>
      <table style="width:100%;border-collapse:collapse"><thead><tr>${thc('Fecha')}${thc('Terapeuta')}${thc('EVA','center')}${thc('Técnicas')}${thc('Observación')}${showAcc?thc('Acciones','center'):''}</tr></thead><tbody>`;
    sesLog.forEach(s=>{
      const eva=s.pb!=null?`${s.pb}→${s.pa!=null?s.pa:'?'}`:'—';
      const tec=(s.tags&&s.tags.length)?s.tags.join(', '):'—';
      const thName=getTherapist(s.therapistId)?.name||'—';
      const td='padding:7px 8px;border-bottom:1px solid rgba(29,158,117,.07);font-size:11px';
      let acc='';
      if(showAcc){
        const btn='font-size:10px;padding:3px 9px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600;border:1px solid';
        const eBtn=canEdit?`<button onclick="editSession('${esc(p.id)}','${esc(s.id)}')" style="${btn} rgba(41,171,226,.3);background:rgba(41,171,226,.1);color:#155b7a">Editar</button>`:'';
        const dBtn=(canDelete&&s.type!=='Evaluación inicial')?`<button onclick="deleteSession('${esc(p.id)}','${esc(s.id)}')" style="${btn} rgba(224,75,74,.3);background:rgba(224,75,74,.08);color:#E24B4A">Eliminar</button>`:'';
        const inner=(eBtn+dBtn)||'<span style="color:#c8c6c0">—</span>';
        acc=`<td style="${td};text-align:center;white-space:nowrap"><div style="display:flex;gap:5px;justify-content:center">${inner}</div></td>`;
      }
      html+=`<tr><td style="${td};color:#1a1917;white-space:nowrap">${dmy(s.date)}</td>
        <td style="${td};color:#1a1917;white-space:nowrap">${esc(thName)}</td>
        <td style="${td};text-align:center;color:#1a1917">${eva}</td>
        <td style="${td};color:#6b6a64">${esc(tec)}</td>
        <td style="${td};color:#6b6a64">${s.note?esc(s.note):'—'}</td>${acc}</tr>`;
    });
    html+=`</tbody></table></div>`;
  } else {
    html+=`<div class="full-card" style="text-align:center;padding:24px 0"><div style="font-size:13px;color:#6b6a64">Sin sesiones registradas en este episodio.</div></div>`;
  }

  html+=`<div class="full-card" style="margin-top:14px;display:flex;justify-content:flex-end;align-items:flex-end;gap:20px;flex-wrap:wrap">
      <div style="text-align:center;min-width:200px"><div style="border-top:1px solid #1a1917;padding-top:4px;font-size:11px;color:#6b6a64">${esc(thFirma)}</div>
      <div style="font-size:10px;color:#9c9a92">Firma del terapeuta</div></div></div>`;

  out.innerHTML=html;
  _rptCtx={p,log,attended,pct,adh,fp,lp,th,doc,epDiag,epDone,epSessions,inicio,rptNo,fechaLarga,thHeader,thFirma};

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
      // Bandas de referencia: leve (0-4) / moderado (5-7) / severo (8-10). Alpha más marcado
      // (~.13-.16) para que el terapeuta las distinga, sin tapar la curva coral (2px saturada).
      const evaBands={id:'evaBands',beforeDraw(c){
        const a=c.chartArea, y=c.scales.y; if(!a) return;
        [[7.5,10,'rgba(226,75,74,.16)'],[4.5,7.5,'rgba(224,168,80,.15)'],[0,4.5,'rgba(29,158,117,.13)']].forEach(b=>{
          const yHi=y.getPixelForValue(b[1]),yLo=y.getPixelForValue(b[0]);
          c.ctx.save();c.ctx.fillStyle=b[2];c.ctx.fillRect(a.left,yHi,a.right-a.left,yLo-yHi);c.ctx.restore();
        });
      }};
      new Chart(ctx,{type:'line',
        data:{labels:evaLabels,datasets:[{label:'Dolor EVA',data:evaData,borderColor:'#D85A30',pointBackgroundColor:'#D85A30',pointRadius:3,pointHoverRadius:4,borderWidth:2,tension:.25,fill:false,spanGaps:true}]},
        options:{responsive:true,animation:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:it=>'EVA '+it.parsed.y}}},
          scales:{y:{min:0,max:10,ticks:{stepSize:2,color:'#6b6a64',font:{size:10}},grid:{color:'rgba(0,0,0,.04)'}},
            x:{ticks:{color:'#6b6a64',font:{size:9},maxRotation:0,autoSkip:true,maxTicksLimit:8},grid:{display:false}}}},
        plugins:[evaBands]});
    },50);
  }
}

export function exportarPDF() {
  if(!_rptCtx){window._app.toastErr('Abrí primero el informe de un paciente');return;}
  const {p,log,attended,pct,adh,fp,lp,th,doc,inicio,rptNo,fechaLarga,thHeader,thFirma}=_rptCtx;
  // Captura del gráfico EVA ya dibujado en pantalla (antes de abrir la ventana) — evita el canvas en blanco por timing
  const evaCanvas=document.getElementById('eva-evolution-chart');
  const evaImg=evaCanvas?evaCanvas.toDataURL('image/png'):'';
  // Narrativa IA generada (si existe) — leída del DOM
  const aiEl=document.getElementById('patient-rpt-ai-output');
  let aiText=aiEl?aiEl.innerText.trim():'';
  if(aiText.startsWith('—')) aiText='';
  const aiHTML=aiText?esc(aiText).replace(/\n/g,'<br>'):'';

  const win=window.open('','_blank');
  if(!win){window._app.toastErr('Permite ventanas emergentes para exportar PDF');return;}
  // Mismo orden que la pantalla: 'Evaluación inicial' primero, luego el resto ascendente. Sin reverse.
  const sesAscPDF=log.filter(s=>s.type!=='Fin de episodio');
  const sesLogPDF=[...sesAscPDF.filter(s=>s.type==='Evaluación inicial'),...sesAscPDF.filter(s=>s.type!=='Evaluación inicial')];
  // Dolor EVA con cada número coloreado por valor (6-10 rojo / 2-5 verde / 0-1 azul).
  const evaTxt=fp&&lp&&fp.pb!=null
    ?'<span style="color:'+evaColor(fp.pb)+'">'+fp.pb+'</span><span style="color:#6b6a64">→</span><span style="color:'+(lp.pa!=null?evaColor(lp.pa):'#6b6a64')+'">'+(lp.pa!=null?lp.pa:'?')+'</span>'
    :'—';
  const adhCol=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
  let filas='';
  sesLogPDF.forEach(function(s){
    const eva=s.pb!=null?s.pb+'→'+(s.pa!=null?s.pa:'?'):'—';
    const tec=(s.tags&&s.tags.length)?esc(s.tags.join(', ')):'—';
    const thName=getTherapist(s.therapistId)?.name||'—';
    filas+='<tr><td>'+dmy(s.date)+'</td><td>'+esc(thName)+'</td><td style="text-align:center">'+eva+'</td><td>'+tec+'</td><td style="font-size:10px;color:#6b6a64">'+(s.note?esc(s.note):'—')+'</td></tr>';
  });
  const tabla=sesLogPDF.length?'<table><thead><tr><th>Fecha</th><th>Terapeuta</th><th>EVA (antes→después)</th><th>Técnicas</th><th>Observación</th></tr></thead><tbody>'+filas+'</tbody></table>':'<div style="color:#6b6a64;padding:12px 0">Sin sesiones registradas.</div>';
  const html='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe — '+esc(p?.name||'Paciente')+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1917;padding:30px;max-width:800px;margin:0 auto}h2{font-size:13px;font-weight:600;color:#1a1917;margin:18px 0 8px;border-bottom:1px solid #d8d8d2;padding-bottom:4px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}.logo{font-size:18px;font-weight:700}.logo span{color:#29ABE2}.fecha{font-size:10px;color:#6b6a64}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.stat-box{background:#f5f5f0;border-radius:8px;padding:10px 12px;text-align:center}.stat-num{font-size:24px;font-weight:700;color:#1D9E75}.stat-lbl{font-size:10px;color:#6b6a64;text-transform:uppercase;letter-spacing:.05em}.info-row{display:flex;gap:6px;margin-bottom:4px}.info-lbl{font-size:10px;font-weight:600;color:#6b6a64;text-transform:uppercase;min-width:120px}.info-val{font-size:12px;color:#1a1917}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f0f0e8;padding:7px 10px;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;color:#6b6a64}td{padding:7px 10px;border-bottom:1px solid #f0efe8;font-size:11px;color:#1a1917}.firma{margin-top:40px;text-align:center;width:240px;margin-left:auto}.firma .ln{border-top:1px solid #1a1917;padding-top:4px;font-size:11px;color:#6b6a64}@media print{body{padding:15px}button{display:none}}</style></head><body>'
    +'<div class="header"><div><div class="logo"><span style="color:#29ABE2">Rehactiva</span> <span style="font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#F5A623;background:rgba(245,166,35,.14);padding:2px 7px;border-radius:5px;line-height:1">PRO</span></div><div style="font-size:10px;color:#6b6a64;margin-top:3px">Rehabilitación y Fisioterapia · Quito, Ecuador</div></div>'
    +'<div style="text-align:right"><div style="font-size:14px;font-weight:700">Informe de evolución</div><div class="fecha">N.º '+rptNo+' · '+fechaLarga+'</div>'
    +'<button onclick="window.print()" style="margin-top:8px;padding:6px 14px;background:#1D9E75;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">🖨️ Imprimir / Guardar PDF</button></div></div>'
    +'<h2>Datos del paciente</h2>'
    +'<div class="info-row"><span class="info-lbl">Nombre</span><span class="info-val">'+esc(p?.name||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Cédula</span><span class="info-val">'+esc(p?.cedula||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Edad</span><span class="info-val">'+getDisplayAge(p, true)+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Diagnóstico</span><span class="info-val">'+esc(p?.diag||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Terapeuta</span><span class="info-val">'+esc(thHeader)+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Doctor referente</span><span class="info-val">'+(doc?esc(doc.name+' ('+doc.spec+')'):'Independiente')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Inicio de tratamiento</span><span class="info-val">'+inicio+'</span></div>'
    +'<h2>Resumen de evolución</h2>'
    +'<div class="grid3"><div class="stat-box"><div class="stat-num" style="color:'+pctColor(pct)+'">'+pct+'%</div><div class="stat-lbl">Sesiones</div><div style="font-size:10px;color:#6b6a64">'+doneActual(p)+' de '+(p?.sessions||0)+'</div></div>'
    +'<div class="stat-box"><div class="stat-num" style="color:'+adhCol+'">'+adh+'%</div><div class="stat-lbl">Continuidad</div><div style="font-size:10px;color:#6b6a64">'+attended.length+' / '+log.length+'</div></div>'
    +'<div class="stat-box"><div class="stat-num">'+evaTxt+'</div><div class="stat-lbl">Dolor EVA</div><div style="font-size:10px;color:#6b6a64">inicial → actual</div></div></div>'
    +(evaImg?'<h2>Evolución del dolor (EVA)</h2><img src="'+evaImg+'" style="max-width:100%;border:1px solid #eee;border-radius:6px">':'')
    +(aiHTML?'<h2>Narrativa clínica</h2><div style="font-size:11px;line-height:1.6;white-space:pre-wrap">'+aiHTML+'</div>':'')
    +'<h2>Detalle por sesión ('+sesLogPDF.length+')</h2>'+tabla
    +'<div class="firma"><div class="ln">'+esc(thFirma)+'</div><div style="font-size:10px;color:#9c9a92">Firma del terapeuta</div></div>'
    +'</body></html>';
  win.document.write(html);win.document.close();
}
