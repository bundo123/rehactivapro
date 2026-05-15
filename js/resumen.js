import { state } from './state.js';
import { esc, fmtDate, fmtTime, getPatient, getTherapist, getDoctor } from './utils.js';

export function hasEvalInicial(p) {
  return (p.log||[]).some(s=>s.type==='Evaluación inicial');
}

export function updateResumenBadge() {
  const ds=fmtDate(state.currentDate);
  const n=state.appointments.filter(a=>a.date===ds&&(a.status==='pend'||a.status==='noas')).length;
  const b=document.getElementById('resumen-badge');
  b.textContent=n; b.style.display=n>0?'':'none';
}

export function renderResumen() {
  const ds=fmtDate(state.currentDate);
  const dn=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('resumen-day-lbl').textContent=`${dn[state.currentDate.getDay()]} ${state.currentDate.getDate()} de ${mn[state.currentDate.getMonth()]}`;
  const ta=state.appointments.filter(a=>a.date===ds);
  const noAs=ta.filter(a=>a.status==='noas');
  const pend=ta.filter(a=>a.status==='pend');
  const conf=ta.filter(a=>a.status==='conf');

  function row(a,kind) {
    const pt=getPatient(a.patientId);const th=getTherapist(a.therapistId);const doc=pt&&pt.doctorId?getDoctor(pt.doctorId):null;
    const col=kind==='noas'?'#E24B4A':kind==='pend'?'#BA7517':'#1D9E75';
    const hasSession=a.hasSession||false;
    const tieneEval=pt?hasEvalInicial(pt):true;
    const evalInicialBtn=(kind==='conf'&&!tieneEval)
      ?`<button onclick="openEvalInicial('${a.patientId}')" style="font-size:10px;padding:4px 10px;border:1px solid rgba(224,80,80,.4);border-radius:99px;cursor:pointer;font-family:inherit;font-weight:600;background:rgba(224,80,80,.08);color:#E24B4A">⚠️ Eval. inicial</button>`:'' ;
    const sessBtn=`<button onclick="openSessionModal(window._app.appointments.find(x=>x.id==='${a.id}'))" style="font-size:10px;padding:4px 12px;border:none;border-radius:99px;cursor:pointer;font-family:inherit;font-weight:600;background:${hasSession?'rgba(29,158,117,.15)':'rgba(224,168,80,.2)'};color:${hasSession?'#1D9E75':'#e0a850'}">${hasSession?'✓ Sesión ok':'📋 Completar sesión'}</button>${evalInicialBtn}`;
    const ptName=pt?pt.name:'';
    const ptTel=pt?(pt.tel||''):'';
    const ptEmail=pt?(pt.email||''):'';
    const btns=kind!=='conf'?`<div class="resumen-actions">
      <button class="resumen-btn wa" onclick="simWA('${ptName}','${ptTel}')" style='white-space:nowrap'>WA</button>
      <button class="resumen-btn em" onclick="simEmail('${ptName}','${ptEmail}')">Email</button>
      <button class="resumen-btn rep" onclick="openApptModal()">Reagendar</button>
    </div>`:`<div class="resumen-actions" style="display:flex;align-items:center;gap:6px">${sessBtn}<span style="font-size:10px;color:#1D9E75;font-weight:500">✓ Asistió</span></div>`;
    return`<div class="resumen-row">
      <div style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:#1a1917">${pt?pt.name:'Paciente'}</div>
        <div style="font-size:11px;color:#6b6a64">${fmtTime(a.hour)} · ${a.type} · ${th?th.name:''}${doc?' · Ref: '+doc.name:''}</div>
      </div>${btns}</div>`;
  }

  let html='';
  if(noAs.length) html+=`<div class="resumen-section"><div class="resumen-section-title"><span style="width:8px;height:8px;border-radius:50%;background:#E24B4A;display:inline-block"></span>No asistieron (${noAs.length})</div>${noAs.map(a=>row(a,'noas')).join('')}</div>`;
  if(pend.length) html+=`<div class="resumen-section"><div class="resumen-section-title"><span style="width:8px;height:8px;border-radius:50%;background:#BA7517;display:inline-block"></span>Pendientes de confirmar (${pend.length})</div>${pend.map(a=>row(a,'pend')).join('')}</div>`;
  if(conf.length) html+=`<div class="resumen-section"><div class="resumen-section-title"><span style="width:8px;height:8px;border-radius:50%;background:#1D9E75;display:inline-block"></span>Asistieron correctamente (${conf.length})</div>${conf.map(a=>row(a,'conf')).join('')}</div>`;
  if(!ta.length) html='<div style="color:#6b6a64;font-size:13px;padding:20px 0">No hay citas registradas para hoy.</div>';
  document.getElementById('resumen-content').innerHTML=html;
}

export function openWA(patientId) {
  const p=getPatient(patientId);
  if(!p||!p.tel){window._app.toastErr('Sin teléfono registrado');return;}
  const tel='593'+p.tel.replace(/[^0-9]/g,'').slice(-9);
  window.open('https://wa.me/'+tel,'_blank');
}

export function waPatient(encodedName) {
  const name=decodeURIComponent(encodedName);
  const pt=state.patients.find(p=>p.name===name);
  if(pt) simWA(pt.name,pt.tel||'');
}

export function simWA(nombre,tel) {
  const msg=encodeURIComponent('Hola '+nombre+', le contactamos desde Rehactiva Rehabilitación. Notamos que no pudo asistir a su cita de hoy. ¿Le ayudamos a reagendar?');
  const num=(tel?tel.replace(/[^0-9]/g,''):'593999211258');
  window.open('https://wa.me/'+num+'?text='+msg,'_blank');
}

export function simEmail(nombre,email) {
  if(email){
    window.location.href=`mailto:${email}?subject=Ausencia en cita - Rehactiva&body=Hola ${nombre},%0A%0ANotamos que no pudo asistir a su cita de hoy en Rehactiva Rehabilitación y Fisioterapia.%0A%0A¿Le podemos ayudar a reagendar? Responda este correo o llámenos.%0A%0ASaludos,%0AEquipo Rehactiva`;
  } else {
    alert(`${nombre} no tiene correo registrado. Agrégalo en su perfil.`);
  }
}

export function genResumenDiaAI() {
  const ds=fmtDate(state.currentDate);
  const hoy=state.appointments.filter(a=>a.date===ds);
  const conf=hoy.filter(a=>a.status==='conf').length;
  const noas=hoy.filter(a=>a.status==='noas').length;
  const pend=hoy.filter(a=>a.status==='pend').length;
  const prompt=`Eres el asistente de Rehactiva, centro de rehabilitación en Quito.
Datos del día ${ds}:
- Citas totales: ${hoy.length}
- Asistieron: ${conf}
- No asistieron: ${noas}
- Pendientes: ${pend}

Genera un resumen del día en máximo 150 palabras con acciones de seguimiento para los no asistidos. Español, directo y profesional.`;
  window._app.callAI(prompt,'resumen-ai-output');
}
