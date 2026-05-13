import { state } from './state.js';
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor, therapistHours, ALL_HOURS, DAYS, COLOR_OPTIONS } from './utils.js';
import { genSemanalAI, genPatientAI, callAI } from './ia.js';
import { hasEvalInicial } from './resumen.js';

export { genSemanalAI, genPatientAI };

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

export function renderHeatmap() {
  let html=`<div class="heatmap-grid" style="grid-template-columns:50px repeat(5,1fr)"><div class="hm-hdr"></div>`;
  DAYS.forEach(d=>{html+=`<div class="hm-hdr">${d}</div>`;});
  ALL_HOURS.forEach(hr=>{
    html+=`<div class="hm-lbl">${hr}:00</div>`;
    DAYS.forEach(d=>{
      const av=state.therapists.filter(t=>hr>=t.startH&&hr<t.endH).length;
      if(!av){html+=`<div class="hm-cell" style="background:#f0efe8"><span style="font-size:9px;color:#444">—</span></div>`;return;}
      const occ=Math.min(av,Math.floor(hr>=9&&hr<=11?av*0.9:hr>=7&&hr<=8?av*0.75:hr===12||hr===13?av*0.4:av*0.55));
      const p=Math.round(occ/av*100);
      const tc=p>=60?'#fff':'#1a1917';
      html+=`<div class="hm-cell" style="background:${hmCol(p)};color:${tc}">${p}%<div class="tooltip-val">${d} ${hr}:00 — ${occ}/${av} · ${p}%</div></div>`;
    });
  });
  html+='</div>';document.getElementById('heatmap-container').innerHTML=html;
}

export function renderTherapistUtil() {
  const semStart=new Date(state.currentDate);
  semStart.setDate(semStart.getDate()-semStart.getDay()+1);
  const semDates=[];
  for(let i=0;i<5;i++){const d=new Date(semStart);d.setDate(semStart.getDate()+i);semDates.push(fmtDate(d));}
  document.getElementById('th-util-report').innerHTML=state.therapists.map(th=>{
    const ts=therapistHours(th).length*5;
    const us=state.appointments.filter(a=>a.therapistId===th.id&&semDates.includes(a.date)&&a.status==='conf').length;
    const u=ts>0?Math.round(us/ts*100):0;
    const c=getColor(th.colorId);const uc=u>=80?'#1D9E75':u>=60?'#BA7517':'#E24B4A';
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)">
      <div class="avatar" style="background:${c.border}22;color:${c.text};width:30px;height:30px">${esc(th.initials)}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:500;color:#1a1917">${esc(th.name)}</div>
        <div style="font-size:10px;color:#6b6a64">${th.startH}:00–${th.endH}:00</div>
        <div class="util-bar"><div class="util-fill" style="width:${u}%;background:${uc}"></div></div>
      </div>
      <div style="text-align:right;min-width:48px"><div style="font-size:15px;font-weight:500;color:${uc}">${u}%</div><div style="font-size:10px;color:#6b6a64">${us}/${ts}</div></div>
    </div>`;
  }).join('');
}

export function renderInsights() {
  const items=[
    {bg:'#271d0e',tc:'#e0a850',icon:'!',t:'12:00-13:00 bajo el 40%',s:'Mediodía con baja ocupación.'},
    {bg:'#0d2a21',tc:'#5ecfa0',icon:'↑',t:'09:00-11:00 al 90%+',s:'Mayor demanda. Evalúa otro terapeuta.'},
    {bg:'#2b0f0f',tc:'#f07070',icon:'✕',t:'2 inasistencias sin aviso',s:'Lucía Herrera y Carlos Mendoza.'},
    {bg:'#0d1e2e',tc:'#7ab8e8',icon:'i',t:'Turno mañana más ocupado',s:'Mixtos tienen más horas libres.'},
  ];
  document.getElementById('insights').innerHTML=items.map(x=>`<div class="insight-row"><div class="insight-icon" style="background:${x.bg};color:${x.tc}">${x.icon}</div><div><div class="insight-text">${x.t}</div><div class="insight-sub">${x.s}</div></div></div>`).join('');
}

export function changeWeek(d) {
  state.currentWeek+=d;
  updateWeekLabel(); renderHeatmap(); renderTherapistUtil();
}

export function updateWeekLabel() {
  const base=new Date();
  const s=new Date(base);
  s.setDate(base.getDate()+state.currentWeek*7-(base.getDay()||7)+1);
  const e=new Date(s);e.setDate(s.getDate()+4);
  const f=x=>`${x.getDate()}/${x.getMonth()+1}`;
  document.getElementById('week-lbl').textContent=`Semana ${f(s)} – ${f(e)} ${e.getFullYear()}`;
}

export function renderSemanal() {
  updateWeekLabel();
  const semStart=new Date(state.currentDate);
  semStart.setDate(semStart.getDate()-semStart.getDay()+1);
  const semEnd=new Date(semStart);semEnd.setDate(semStart.getDate()+4);
  const semDates=[];
  for(let i=0;i<5;i++){const d=new Date(semStart);d.setDate(semStart.getDate()+i);semDates.push(fmtDate(d));}
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
  const proxAlta=state.patients.filter(p=>p.status==='active'&&p.sessions>0&&Math.round((p.done/p.sessions)*100)>=80).slice(0,5);

  const statsHtml=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div><div style="font-size:11px;color:#6b6a64;text-transform:uppercase;letter-spacing:.05em">Semana del</div><div style="font-size:14px;font-weight:600;color:#1a1917">${semLabel}</div></div>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis con IA ↗</button>
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
      ${proxAlta.length?proxAlta.map(p=>{const pct=Math.round(p.done/p.sessions*100);return'<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.05)"><span style="font-size:11px;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">'+p.name.split(' ').slice(0,2).join(' ')+'</span><span style="font-size:11px;font-weight:700;color:#BA7517;background:rgba(186,117,23,.1);padding:1px 7px;border-radius:99px;flex-shrink:0">'+pct+'%</span></div>';}).join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Ninguno cerca del alta</div>'}
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
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <select style="background:#ffffff;border:1px solid rgba(29,158,117,.2);border-radius:6px;padding:7px 12px;font-size:13px;color:#1a1917"><option>Marzo 2026</option><option>Febrero 2026</option><option>Enero 2026</option></select>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis con IA ↗</button>
  </div>`;
  html+=`<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Sesiones del mes</div><div class="stat-val">38</div><div class="stat-chg down">-12% vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Continuidad promedio</div><div class="stat-val" style="color:#BA7517">81%</div><div class="stat-chg neu">Meta: 85%</div></div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div><div class="stat-val" style="color:#E24B4A">7</div><div class="stat-chg down">+2 vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes activos</div><div class="stat-val">${state.patients.filter(p=>p.status==='active').length}</div><div class="stat-chg up">+1 vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Altas médicas</div><div class="stat-val">${state.patients.filter(p=>p.status==='alta').length}</div><div class="stat-chg up">+1 vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Nuevos pacientes</div><div class="stat-val">3</div><div class="stat-chg up">+1 vs feb</div></div>
  </div>`;
  html+=`<div class="full-card"><div class="card-title">Pacientes por doctor referente</div>`;
  state.doctors.forEach(d=>{
    const n=state.patients.filter(p=>p.doctorId===d.id).length;
    html+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)"><span style="width:10px;height:10px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0"></span><div style="flex:1;font-size:12px;color:#c8c6c0">${esc(d.name)} <span style="color:#6b6a64">(${esc(d.spec)})</span></div><div style="font-size:13px;font-weight:500;color:#1a1917">${n}</div></div>`;
  });
  html+=`</div><div class="full-card"><div class="card-title">Tendencia — últimos 3 meses</div><canvas id="monthly-chart" height="80"></canvas></div>`;
  document.getElementById('mensual-content').innerHTML=html;
  setTimeout(()=>{
    const ctx=document.getElementById('monthly-chart');if(!ctx)return;
    Chart.defaults.color='#6b6a64';
    new Chart(ctx,{type:'bar',data:{labels:['Enero','Febrero','Marzo'],datasets:[
      {label:'Sesiones',data:[30,42,38],backgroundColor:'#1D9E75',borderRadius:4},
      {label:'Continuidad %',data:[78,84,81],backgroundColor:'#378ADD',borderRadius:4},
      {label:'Inasistencias',data:[8,5,7],backgroundColor:'#E24B4A',borderRadius:4},
    ]},options:{responsive:true,plugins:{legend:{labels:{font:{size:11},color:'#9c9a92'}}},scales:{y:{beginAtZero:true,ticks:{color:'#6b6a64',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}},x:{ticks:{color:'#6b6a64'},grid:{display:false}}}}});
  },50);
}

export function renderAnual() {
  const mn=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const s=[30,42,38,0,0,0,0,0,0,0,0,0];
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div style="font-size:14px;font-weight:500;color:#1a1917">Informe anual 2026</div>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis anual con IA ↗</button>
  </div>`;
  html+=`<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Sesiones acumuladas</div><div class="stat-val">110</div><div class="stat-chg neu">Ene-Mar 2026</div></div>
    <div class="stat"><div class="stat-lbl">Continuidad prom.</div><div class="stat-val" style="color:#BA7517">81%</div><div class="stat-chg neu">Meta: 85%</div></div>
    <div class="stat"><div class="stat-lbl">Altas médicas</div><div class="stat-val" style="color:#1D9E75">4</div><div class="stat-chg up">Acumulado</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes únicos</div><div class="stat-val">${state.patients.length}</div><div class="stat-chg neu">Año hasta hoy</div></div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div><div class="stat-val" style="color:#E24B4A">20</div><div class="stat-chg neu">Acumuladas</div></div>
    <div class="stat"><div class="stat-lbl">Proyección anual</div><div class="stat-val">440</div><div class="stat-chg up">Sesiones est.</div></div>
  </div>`;
  html+=`<div class="full-card"><div class="card-title">Sesiones por mes — 2026</div><canvas id="anual-chart" height="80"></canvas></div>`;
  document.getElementById('anual-content').innerHTML=html;
  setTimeout(()=>{
    const ctx=document.getElementById('anual-chart');if(!ctx)return;
    Chart.defaults.color='#6b6a64';
    new Chart(ctx,{type:'bar',data:{labels:mn,datasets:[{label:'Sesiones',data:s,backgroundColor:s.map(v=>v>0?'#1D9E75':'#1a1917'),borderRadius:4}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{color:'#6b6a64',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}},x:{ticks:{color:'#6b6a64'},grid:{display:false}}}}});
  },50);
}

// ── Informe Paciente ──
export function renderPatientReportSelect() {
  const sel=document.getElementById('patient-rpt-select');
  sel.innerHTML=state.patients.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(state.patients.length>0) sel.value=String(state.patients[0].id);
  updateEpisodes();
}

export function filterPatientRptSelect() {
  const q=(document.getElementById('patient-rpt-search').value||'').toLowerCase();
  const sel=document.getElementById('patient-rpt-select');
  sel.innerHTML=state.patients.filter(p=>p.name.toLowerCase().includes(q)||p.diag.toLowerCase().includes(q))
    .map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(sel.options.length>0) updateEpisodes();
}

export function updateEpisodes() {
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
  let log,epDiag=p.diag,epSessions=p.sessions,epDone=p.done;
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
  const isCurrentEpisode=epVal==='current';
  const th=getTherapist(p.therapistId);
  const doc=p.doctorId?getDoctor(p.doctorId):null;
  const attended=log.filter(s=>s.status==='asistió');
  const adh=log.length>0?Math.round(attended.length/log.length*100):0;
  const pct=epSessions>0?Math.round(epDone/epSessions*100):0;
  const lp=attended.slice(-1)[0];const fp=attended[0];
  const thC=th?getColor(th.colorId):COLOR_OPTIONS[0];
  const citasConf=state.appointments.filter(a=>String(a.patientId)===String(p.id)&&a.status==='conf').length;
  const sesCompletas=(p.done||0)>=(p.sessions||1)&&p.sessions>0;
  let sp='';
  if(p.status==='alta'||sesCompletas) sp='<span class="pill pb">Alta médica</span>';
  else if(citasConf>=1||(p.done||0)>=1) sp='<span class="pill pg">En tratamiento</span>';
  const ac=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
  const avisoEpisodio=sesCompletas&&p.status!=='alta'
    ?`<div style="background:#fef3c7;border:1px solid rgba(186,117,23,.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><div style="font-size:12px;font-weight:600;color:#BA7517">✓ Tratamiento completado</div><div style="font-size:11px;color:#6b6a64;margin-top:2px">${esc(p.name)} completó sus ${p.sessions} sesiones. ¿Viene por algo nuevo?</div></div>
        <button onclick="nuevoEpisodio('${esc(p.id)}')" style="padding:6px 12px;background:#BA7517;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">Nuevo episodio</button>
      </div>`:'' ;

  let html=avisoEpisodio+`<div class="full-card" style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
    <div class="avatar" style="background:${thC.border}22;color:${thC.text};width:48px;height:48px;font-size:16px;flex-shrink:0">${esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
    <div style="flex:1">
      <div style="font-size:15px;font-weight:600;color:#1a1917;margin-bottom:3px">${esc(p.name)} ${sp}</div>
      <div style="font-size:12px;color:#6b6a64">${esc(epDiag||p.diag||'Sin diagnóstico')} · ${p.age||'?'} años${!isCurrentEpisode?' <span style="font-size:10px;background:#fef3c7;color:#BA7517;padding:1px 7px;border-radius:99px;margin-left:4px">Episodio anterior</span>':''}</div>
      ${doc?`<div style="font-size:11px;color:#5a5a56;margin-top:2px">Ref: ${esc(doc.name)} (${esc(doc.spec)})</div>`:''}
      ${p.cedula?`<div style="font-size:11px;color:#6b6a64;margin-top:1px">CI: ${esc(p.cedula)}${p.tel?' · '+esc(p.tel):''}${p.email?' · '+esc(p.email):''}</div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
      <button class="ai-btn" onclick="genPatientAI()">Informe IA ↗</button>
      <button onclick="agendarCitaParaPaciente('${esc(p.id)}')" style="padding:6px 14px;background:rgba(29,158,117,.12);color:#1D9E75;border:1px solid rgba(29,158,117,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">+ Agendar cita</button>
      ${isCurrentEpisode?`<button onclick="nuevoEpisodio('${esc(p.id)}')" style="padding:6px 14px;background:rgba(186,117,23,.1);color:#BA7517;border:1px solid rgba(186,117,23,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">🔄 Nuevo episodio</button>`:''}
    </div>
  </div>`;

  html+=`<div class="three-col" style="margin-bottom:14px">
    <div class="card"><div class="card-title">Progreso</div>
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:600;color:#1D9E75">${pct}%</div>
        <div style="font-size:11px;color:#6b6a64;margin:3px 0 8px">${epDone} de ${epSessions} sesiones</div>
        <div class="bar-wrap" style="height:6px"><div class="bar-fill" style="width:${pct}%;background:#1D9E75"></div></div>
      </div>
    </div>
    <div class="card"><div class="card-title">Continuidad</div>
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:600;color:${ac}">${adh}%</div>
        <div style="font-size:11px;color:#6b6a64;margin:3px 0 8px">${attended.length} asist. / ${log.length} citas</div>
        <div style="display:flex;justify-content:center;gap:16px">
          <div><div style="font-size:15px;font-weight:600;color:#1D9E75">${attended.length}</div><div style="font-size:10px;color:#6b6a64">Asistidas</div></div>
          <div><div style="font-size:15px;font-weight:600;color:#E24B4A">${log.length-attended.length}</div><div style="font-size:10px;color:#6b6a64">Ausencias</div></div>
        </div>
      </div>
    </div>
    <div class="card"><div class="card-title">Evolución EVA</div>
      <div style="text-align:center">${fp&&lp&&fp.pb!=null?`
        <div style="display:flex;justify-content:center;align-items:center;gap:14px">
          <div><div style="font-size:26px;font-weight:600;color:#E24B4A">${fp.pb}</div><div style="font-size:10px;color:#6b6a64">Inicio</div></div>
          <div style="color:#6b6a64;font-size:18px">→</div>
          <div><div style="font-size:26px;font-weight:600;color:#1D9E75">${lp.pa!=null?lp.pa:'?'}</div><div style="font-size:10px;color:#6b6a64">Última</div></div>
        </div>`:'<div style="font-size:13px;color:#6b6a64;padding:16px 0">Sin datos EVA</div>'}</div>
    </div>
  </div>`;

  // Historial de sesiones
  const sesLog=[...log].reverse().filter(s=>s.type!=='Fin de episodio');
  if(sesLog.length){
    html+=`<div class="full-card"><div class="card-title" style="margin-bottom:10px">Historial de sesiones (${sesLog.length})</div>`;
    sesLog.forEach(s=>{
      const evaBefore=s.pb!=null?s.pb:'?';const evaAfter=s.pa!=null?s.pa:'?';
      const evaCol=s.pb!=null&&s.pa!=null&&s.pa<s.pb?'#1D9E75':'#E24B4A';
      html+=`<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(29,158,117,.08)">
        <div style="flex-shrink:0;text-align:right;min-width:80px"><div style="font-size:11px;font-weight:500;color:#1a1917">${s.date}</div><div style="font-size:10px;color:#6b6a64">${s.hour||''}</div></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
            <span style="font-size:11px;font-weight:600;color:#1a1917">${esc(s.type||'Sesión')}</span>
            ${s.pb!=null?`<span style="font-size:10px;background:rgba(29,158,117,.1);color:${evaCol};border-radius:99px;padding:1px 7px">EVA ${evaBefore}→${evaAfter}</span>`:''}
            <span class="pill ${s.status==='asistió'?'pg':'pr'}" style="font-size:9px">${esc(s.status||'')}</span>
          </div>
          ${s.note?`<div style="font-size:11px;color:#6b6a64;line-height:1.5">${esc(s.note)}</div>`:''}
        </div>
      </div>`;
    });
    html+=`</div>`;
  } else {
    html+=`<div class="full-card" style="text-align:center;padding:24px 0"><div style="font-size:13px;color:#6b6a64">Sin sesiones registradas en este episodio.</div></div>`;
  }

  html+=`<div id="patient-rpt-ai-output" style="display:none;margin-top:14px"></div>`;
  out.innerHTML=html;
}

export function exportarPDF() {
  const id=document.getElementById('patient-rpt-select')?.value;
  const p=id?state.patients.find(x=>String(x.id)===String(id)):null;
  const win=window.open('','_blank');
  if(!win){window._app.toastErr('Permite ventanas emergentes para exportar PDF');return;}
  const log=(p?.log||[]).filter(s=>s&&s.date&&s.type!=='Fin de episodio');
  const attended=log.filter(s=>s.status==='asistió');
  const pct=p&&p.sessions>0?Math.round((p.done||0)/p.sessions*100):0;
  const adh=log.length>0?Math.round(attended.length/log.length*100):0;
  const fp=attended[0],lp=attended.slice(-1)[0];
  const doc=p&&p.doctorId?getDoctor(p.doctorId):null;
  const today=new Date().toLocaleDateString('es-EC',{day:'2-digit',month:'long',year:'numeric'});
  let filasTabla='';
  if(log.length){
    filasTabla=[...log].reverse().map(function(s){
      const evaTxt=s.pb!=null?s.pb+'→'+(s.pa!=null?s.pa:'?'):'—';
      const estadoCls=s.status==='asistió'?'pg':'pr';
      return'<tr><td>'+s.date+'</td><td>'+(s.hour||'—')+'</td><td>'+(s.type||'—')+'</td><td style="text-align:center">'+evaTxt+'</td><td><span class="pill '+estadoCls+'">'+(s.status||'—')+'</span></td><td style="font-size:10px;color:#6b6a64">'+(s.note||'—')+'</td></tr>';
    }).join('');
  }
  const tablaHTML=log.length?'<table><thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>EVA antes/después</th><th>Estado</th><th>Nota clínica</th></tr></thead><tbody>'+filasTabla+'</tbody></table>':'<div style="color:#6b6a64;padding:12px 0">Sin sesiones registradas.</div>';
  const evaCol=fp&&lp&&(fp.pb-(lp.pa||0))>0?'#1D9E75':'#6b6a64';
  const evaTxt=fp&&lp&&fp.pb!=null?(fp.pb+'→'+(lp.pa!=null?lp.pa:'?')):'—';
  const evaLbl=fp&&lp&&fp.pb!=null?((fp.pb-(lp.pa||0))>0?'↓ Mejoró':'Sin cambio EVA'):'Sin datos';
  const adhCol=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
  const html='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe — '+(p?p.name:'Paciente')+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1917;padding:30px;max-width:800px;margin:0 auto}h1{font-size:20px;color:#1D9E75;margin-bottom:4px}h2{font-size:13px;font-weight:600;color:#1D9E75;margin:18px 0 8px;border-bottom:1px solid #e0efe8;padding-bottom:4px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}.logo{font-size:18px;font-weight:700}.logo span{color:#1D9E75}.fecha{font-size:10px;color:#6b6a64}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.stat-box{background:#f5f5f0;border-radius:8px;padding:10px 12px;text-align:center}.stat-num{font-size:24px;font-weight:700;color:#1D9E75}.stat-lbl{font-size:10px;color:#6b6a64;text-transform:uppercase;letter-spacing:.05em}.info-row{display:flex;gap:6px;margin-bottom:4px}.info-lbl{font-size:10px;font-weight:600;color:#6b6a64;text-transform:uppercase;min-width:100px}.info-val{font-size:12px;color:#1a1917}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f0f0e8;padding:7px 10px;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;color:#6b6a64}td{padding:7px 10px;border-bottom:1px solid #f0efe8;font-size:11px;color:#1a1917}.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600}.pg{background:#dcfce7;color:#166534}.pr{background:#fee2e2;color:#991b1b}@media print{body{padding:15px}button{display:none}}</style></head><body>'
    +'<div class="header"><div><div class="logo">Reha<span>activa</span></div><div style="font-size:10px;color:#6b6a64">Centro de Rehabilitación y Fisioterapia</div></div><div style="text-align:right"><div style="font-size:14px;font-weight:700">INFORME CLÍNICO</div><div class="fecha">'+today+'</div><button onclick="window.print()" style="margin-top:8px;padding:6px 14px;background:#1D9E75;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">🖨️ Imprimir / Guardar PDF</button></div></div>'
    +'<h2>Datos del paciente</h2>'
    +'<div class="info-row"><span class="info-lbl">Nombre</span><span class="info-val">'+(p?.name||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Cédula</span><span class="info-val">'+(p?.cedula||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Edad</span><span class="info-val">'+(p?.age||'—')+' años</span></div>'
    +'<div class="info-row"><span class="info-lbl">Teléfono</span><span class="info-val">'+(p?.tel||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Correo</span><span class="info-val">'+(p?.email||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Diagnóstico</span><span class="info-val">'+(p?.diag||'—')+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">Doctor ref.</span><span class="info-val">'+(doc?doc.name+' ('+doc.spec+')':'Independiente')+'</span></div>'
    +'<h2>Resumen de evolución</h2>'
    +'<div class="grid3"><div class="stat-box"><div class="stat-num">'+pct+'%</div><div class="stat-lbl">Progreso</div><div style="font-size:10px;color:#6b6a64">'+(p?.done||0)+' de '+(p?.sessions||0)+' sesiones</div></div>'
    +'<div class="stat-box"><div class="stat-num" style="color:'+adhCol+'">'+adh+'%</div><div class="stat-lbl">Continuidad</div><div style="font-size:10px;color:#6b6a64">'+attended.length+' asist. / '+log.length+' citas</div></div>'
    +'<div class="stat-box"><div class="stat-num">'+evaTxt+'</div><div class="stat-lbl">Evolución EVA</div><div style="font-size:10px;color:'+evaCol+'">'+evaLbl+'</div></div></div>'
    +'<h2>Historial de sesiones ('+log.length+' registros)</h2>'+tablaHTML
    +'<div style="margin-top:30px;padding-top:16px;border-top:1px solid #e0efe8;display:flex;justify-content:space-between;font-size:10px;color:#9c9a92"><span>Rehactiva Rehabilitación y Fisioterapia · Quito, Ecuador</span><span>Generado el '+today+'</span></div>'
    +'</body></html>';
  win.document.write(html);win.document.close();
}
