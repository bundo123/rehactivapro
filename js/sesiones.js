import { supa } from './supabase-client.js';
import { state } from './state.js';
import { getPatient, fmtDate } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { hasPermission } from './permissions.js';

export const PRO_TECNICAS = [
  'Compresa caliente','Crioterapia','Electroterapia','Magnetoterapia',
  'Laser','Ultrasonido','Masoterapia','Movilidad pasiva',
  'Movilidad activa','Fortalecimiento','Estiramientos','Reeducación postural',
  'Reeducación marcha','Propiocepción','Terapia manual','Vendaje funcional',
  'Punción seca','Tracción lumbar/cervical','Kinesioterapia','Ejercicio terapéutico'
];
let proTecnicasSel = [];
let _pendingSessionAppt = null;

export function renderProTecnicas() {
  const grid=document.getElementById('pro-tecnicas-grid');if(!grid)return;
  grid.innerHTML=PRO_TECNICAS.map(t=>{
    const sel=proTecnicasSel.includes(t);
    return`<button type="button" class="pro-tec-btn${sel?' selected':''}" onclick="toggleProTecnica(this)" data-tec="${t}" style="font-size:10px;padding:4px 8px;border-radius:99px;cursor:pointer;font-family:inherit;border:1px solid ${sel?'rgba(29,158,117,.5)':'rgba(255,255,255,.08)'};background:${sel?'rgba(29,158,117,.15)':'transparent'};color:${sel?'#1D9E75':'#6b6a64'}">${t}</button>`;
  }).join('');
}

export function toggleProTecnica(btn) {
  const t=btn.dataset.tec;
  if(proTecnicasSel.includes(t)) proTecnicasSel=proTecnicasSel.filter(x=>x!==t);
  else proTecnicasSel.push(t);
  renderProTecnicas();
}

export function renderEvaButtons(containerId, valId, cur, col) {
  const container=document.getElementById(containerId);if(!container)return;
  container.innerHTML='';
  for(let i=0;i<=10;i++){
    const btn=document.createElement('button');
    btn.type='button'; btn.textContent=i;
    const active=i===cur;
    btn.style.cssText='flex:1;padding:6px 2px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;'
      +'border:2px solid '+(active?col:'transparent')+';'
      +'background:'+(active?col+'22':'transparent')+';'
      +'color:'+(active?col:'#6b6a64');
    btn.onclick=()=>setEva(containerId,valId,i,col);
    container.appendChild(btn);
  }
}

export function setEva(containerId, valId, val, col) {
  document.getElementById(valId).textContent=val;
  renderEvaButtons(containerId,valId,val,col);
}

export function openSessionModal(appt) {
  if(!appt)return;
  if(!hasPermission('registerSession')){toastErr('No tienes permisos para registrar sesiones.');return;}
  _pendingSessionAppt=appt;
  const pt=getPatient(appt.patientId);
  const existing=pt&&pt.log?pt.log.find(s=>s.date===appt.date&&s.hour===appt.hour+':00'):null;
  document.getElementById('session-modal-title').textContent=(existing?'Editar sesión — ':'Registrar sesión — ')+(pt?pt.name.split(' ').slice(0,2).join(' '):'Paciente');
  document.getElementById('session-modal-sub').textContent=appt.type+' · '+appt.date+' · '+appt.hour+':00';
  const pb=existing?(existing.pb!=null?existing.pb:5):5;
  const pa=existing?(existing.pa!=null?existing.pa:5):5;
  renderEvaButtons('eva-before-btns','sess-eva-before-val',pb,'#E24B4A');
  renderEvaButtons('eva-after-btns','sess-eva-after-val',pa,'#1D9E75');
  if(existing&&existing.type){
    const sel=document.getElementById('sess-type');
    for(let i=0;i<sel.options.length;i++){if(sel.options[i].value===existing.type){sel.selectedIndex=i;break;}}
  }
  document.getElementById('sess-note').value=existing?(existing.note||''):'';
  proTecnicasSel=[]; document.getElementById('sess-type').value='';
  renderProTecnicas();
  document.getElementById('session-modal').classList.add('open');
}

export async function saveSession() {
  const appt=_pendingSessionAppt;if(!appt)return;
  const pb=parseInt(document.getElementById('sess-eva-before-val').textContent)||0;
  const pa=parseInt(document.getElementById('sess-eva-after-val').textContent)||0;
  const type=document.getElementById('sess-type').value;
  const note=document.getElementById('sess-note').value.trim();
  if(!note){
    document.getElementById('sess-note').style.borderColor='rgba(224,80,80,.6)';
    document.getElementById('sess-note').focus();
    toastErr('Describe brevemente qué se realizó en la sesión');
    return;
  }
  document.getElementById('sess-note').style.borderColor='';
  if(appt.id&&appt.patientId){
    const existingInDB=await supa.from('session_log').select('id').eq('patient_id',appt.patientId).eq('date',appt.date).eq('hour',appt.hour+':00').maybeSingle();
    let dbError;
    if(existingInDB.data){
      const {error}=await supa.from('session_log').update({type,pain_before:pb,pain_after:pa,note}).eq('id',existingInDB.data.id);
      dbError=error;
    } else {
      const {error}=await supa.from('session_log').insert({
        patient_id:appt.patientId,date:appt.date,type,hour:appt.hour+':00',status:'asistió',
        pain_before:pb,pain_after:pa,note,
        next_plan:document.getElementById('sess-next')?.value||''
      });
      dbError=error;
    }
    if(dbError) toastErr('Error guardando sesión: '+dbError.message);
    else toastOk('Sesión guardada correctamente ✓');
  }
  const a=state.appointments.find(x=>x.id===appt.id);
  if(a) a.hasSession=true;
  const pt2=getPatient(appt.patientId);
  if(pt2){
    if(!pt2.log) pt2.log=[];
    const hh=appt.hour+':00';
    const existIdx=pt2.log.findIndex(s=>s.date===appt.date&&s.hour===hh);
    const newEntry={date:appt.date,type,hour:hh,status:'asistió',pb,pa,note,tags:[]};
    if(existIdx>=0) pt2.log[existIdx]=newEntry;
    else pt2.log.push(newEntry);
  }
  window._app.closeModal('session-modal');
  _pendingSessionAppt=null;
  window._app.renderGrid();
  window._app.updateResumenBadge();
  toastOk('Sesión guardada en historial clínico ✓');
}

export function skipSession() {
  window._app.closeModal('session-modal');
  _pendingSessionAppt=null;
  toastInfo('Sesión omitida — puedes registrarla desde Informe paciente');
}
