import { supa } from './supabase-client.js';
import { state } from './state.js';
import { getPatient, esc, fmtDate, fmtTime, normHour, doneActual, pendientesActual, orderedTherapists } from './utils.js';
import { toastOk, toastErr, toastInfo, showToast } from './toast.js';
import { hasPermission } from './permissions.js';
import { showFieldError, clearFieldError, clearAllErrors } from './validators.js';
import { updateFacturaBadge, showBillingAlert } from './agenda.js';

export const PRO_TECNICAS = [
  'Compresa caliente','Crioterapia','Electroterapia','Magnetoterapia',
  'Laser','Ultrasonido','Masoterapia','Movilidad pasiva',
  'Movilidad activa','Fortalecimiento','Estiramientos','Reeducación postural',
  'Reeducación marcha','Propiocepción','Terapia manual','Vendaje funcional',
  'Punción seca','Tracción lumbar/cervical','Kinesioterapia',
  'Láser de alta potencia','Ondas de choque','Presoterapia'
];
let proTecnicasSel = [];
let _pendingSessionAppt = null;
let _manualMode = false;       // true cuando el modal se abre como "sesión manual" (carga retroactiva)
let _manualPatientId = null;
let _editMode = false;         // true cuando el modal se abre para EDITAR una sesión existente
let _editRef = null;           // {patientId, date, hour} ORIGINAL — clave del UPDATE
let _savingSession = false;    // candado anti-doble-submit (todos los saves)

// Aviso "plan completo": salta SOLO en la sesión que cierra el plan (doneActual pasa de n−1 a n),
// no en cada sesión por encima — mismo criterio de umbral que showBillingAlert. No bloquea nada:
// el plan es una referencia clínica, no un tope, y seguir atendiendo es decisión del terapeuta.
// Se mide contra doneActual (episodio actual), que es lo mismo que pinta el badge X/N de la agenda.
function avisoPlanCompleto(pt, doneBefore) {
  const n = pt?.sessions || 0;
  if (!n || doneBefore !== n - 1 || doneActual(pt) !== n) return;
  showToast(`Plan de ${n} sesiones completado. Si el tratamiento continúa, ampliá el plan desde la cita en agenda; si es un problema nuevo, Nuevo episodio.`, 'info', 8000);
}

function _setSaveBtn(saving) {
  const b=document.getElementById('session-save-btn'); if(!b)return;
  b.disabled=saving; b.textContent=saving?'Guardando…':'Guardar sesión';
}

export function renderProTecnicas() {
  const grid=document.getElementById('pro-tecnicas-grid');if(!grid)return;
  grid.innerHTML=PRO_TECNICAS.map(t=>{
    const sel=proTecnicasSel.includes(t);
    return`<button type="button" class="pro-tec-btn${sel?' selected':''}" onclick="toggleProTecnica(this)" data-tec="${t}" style="font-size:13px;padding:9px 8px;min-height:42px;border-radius:9px;cursor:pointer;font-family:inherit;font-weight:500;line-height:1.25;display:flex;align-items:center;justify-content:center;text-align:center;border:1.5px solid ${sel?'rgba(29,158,117,.55)':'rgba(41,171,226,.22)'};background:${sel?'rgba(29,158,117,.15)':'#fff'};color:${sel?'#1D9E75':'#5a5a56'}">${t}</button>`;
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
  const valEl=document.getElementById(valId); if(valEl) valEl.textContent=cur;
  container.innerHTML='';
  for(let i=0;i<=10;i++){
    const btn=document.createElement('button');
    btn.type='button'; btn.textContent=i;
    const active=i===cur;
    btn.style.cssText='flex:1;padding:0;min-height:44px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;'
      +'border:2px solid '+(active?col:'rgba(41,171,226,.22)')+';'
      +'background:'+(active?col+'22':'#fff')+';'
      +'color:'+(active?col:'#5a5a56');
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
  clearAllErrors(['sess-manual-date','sess-therapist','sess-note']);
  _pendingSessionAppt=appt;
  _manualMode=false; _manualPatientId=null;
  _editMode=false; _editRef=null;
  const _df=document.getElementById('sess-manual-date-field');
  if(_df) _df.style.display='none';
  const _thf=document.getElementById('sess-therapist-field');
  if(_thf) _thf.style.display='none';   // el terapeuta sale de la cita, no se pide aquí
  const _cancel=document.getElementById('session-cancel-btn');
  if(_cancel) _cancel.textContent='Omitir';
  const pt=getPatient(appt.patientId);
  const apptHour=fmtTime(appt.hour);
  // normHour en ambos lados: la hora del log recargado desde DB es 'HH:MM:SS' y apptHour es 'H:MM'.
  // Sin normalizar, el modal abre en blanco y al guardar pisa la sesión real (EVA/nota/técnicas).
  const existing=pt&&pt.log?pt.log.find(s=>s.date===appt.date&&normHour(s.hour)===normHour(apptHour)):null;
  document.getElementById('session-modal-title').textContent=(existing?'Editar sesión — ':'Registrar sesión — ')+(pt?pt.name.split(' ').slice(0,2).join(' '):'Paciente');
  document.getElementById('session-modal-sub').textContent=appt.type+' · '+appt.date+' · '+apptHour;
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

// ── Sesión manual (carga histórica/retroactiva) ──
// Abre el mismo modal de sesión en "modo manual": muestra el campo Fecha (editable, ≤ hoy)
// y no depende de una cita. La hora es un identificador técnico autogenerado (no se pide al usuario).
export function openSessionModalManual(patientId) {
  if(!hasPermission('registerSession')){toastErr('No tienes permisos para registrar sesiones.');return;}
  const pt=getPatient(patientId);
  if(!pt){toastErr('Paciente no encontrado.');return;}
  clearAllErrors(['sess-manual-date','sess-therapist','sess-note']);
  _manualMode=true; _manualPatientId=patientId; _pendingSessionAppt=null;
  _editMode=false; _editRef=null;
  document.getElementById('session-modal-title').textContent='Registrar sesión manual — '+pt.name.split(' ').slice(0,2).join(' ');
  document.getElementById('session-modal-sub').textContent='Carga retroactiva — elegí la fecha de la sesión';
  const di=document.getElementById('sess-manual-date');
  const df=document.getElementById('sess-manual-date-field');
  const today=fmtDate(new Date());
  if(di){ di.max=today; di.value=today; }
  if(df) df.style.display='';
  // Selector de terapeuta (modo manual): no hay cita, así que se elige a mano.
  // Default = terapeuta de la última sesión registrada con dato (continuidad).
  const thSel=document.getElementById('sess-therapist');
  const thf=document.getElementById('sess-therapist-field');
  if(thSel){
    thSel.innerHTML=orderedTherapists().map(t=>`<option value="${esc(String(t.id))}">${esc(t.name)}</option>`).join('');
    const withTh=(pt.log||[]).filter(s=>s.therapistId);
    withTh.sort((a,b)=>{const ka=a.date+'T'+normHour(a.hour),kb=b.date+'T'+normHour(b.hour);return ka<kb?1:ka>kb?-1:0;});
    const lastTh=withTh.length?withTh[0].therapistId:null;
    if(lastTh) thSel.value=String(lastTh);
  }
  if(thf) thf.style.display='';
  const cancelBtn=document.getElementById('session-cancel-btn');
  if(cancelBtn) cancelBtn.textContent='Cancelar';
  renderEvaButtons('eva-before-btns','sess-eva-before-val',5,'#E24B4A');
  renderEvaButtons('eva-after-btns','sess-eva-after-val',5,'#1D9E75');
  document.getElementById('sess-note').value='';
  document.getElementById('sess-type').value='';
  proTecnicasSel=[];
  renderProTecnicas();
  document.getElementById('session-modal').classList.add('open');
}

// Hora autogenerada (HH:MM:SS) que garantiza la unicidad del dedup (patient_id+date+hour).
// Usa la hora actual; si ya existe una sesión con esa hora ese día, incrementa los segundos.
async function genUniqueHour(patientId, date) {
  const pad=n=>String(n).padStart(2,'0');
  const n=new Date();
  let h=n.getHours(), m=n.getMinutes(), s=n.getSeconds();
  const {data}=await supa.from('session_log').select('hour').eq('patient_id',patientId).eq('date',date);
  const taken=new Set((data||[]).map(r=>r.hour));
  let hour=`${pad(h)}:${pad(m)}:${pad(s)}`, guard=0;
  while(taken.has(hour)&&guard<86400){
    s++; if(s>59){s=0;m++;} if(m>59){m=0;h=(h+1)%24;}
    hour=`${pad(h)}:${pad(m)}:${pad(s)}`; guard++;
  }
  return hour;
}

async function saveSessionManual() {
  if(_savingSession) return;                 // candado: ignora re-entradas mientras guarda
  const pt=getPatient(_manualPatientId);
  if(!pt){toastErr('Paciente no encontrado.');return;}
  const date=document.getElementById('sess-manual-date').value;
  const today=fmtDate(new Date());
  if(!date){showFieldError('sess-manual-date','Elegí la fecha de la sesión');toastErr('Elegí la fecha de la sesión');return;}
  if(date>today){showFieldError('sess-manual-date','La fecha no puede ser futura');toastErr('La fecha no puede ser futura');return;}
  clearFieldError('sess-manual-date');
  const pb=parseInt(document.getElementById('sess-eva-before-val').textContent)||0;
  const pa=parseInt(document.getElementById('sess-eva-after-val').textContent)||0;
  const type='Fisioterapia';                              // I1: tipo fijo (las técnicas van en tags)
  const therapistId=document.getElementById('sess-therapist')?.value||'';
  const note=document.getElementById('sess-note').value.trim();
  if(!therapistId){showFieldError('sess-therapist','Elegí el terapeuta que atendió la sesión');toastErr('Elegí el terapeuta que atendió la sesión');return;}
  clearFieldError('sess-therapist');
  if(!note){
    showFieldError('sess-note','Describe brevemente qué se realizó en la sesión');
    document.getElementById('sess-note').focus();
    toastErr('Describe brevemente qué se realizó en la sesión');
    return;
  }
  clearFieldError('sess-note');
  _savingSession=true; _setSaveBtn(true);
  try {
    const hour=await genUniqueHour(pt.id,date);
    const {data:ins,error}=await supa.from('session_log').insert({
      patient_id:pt.id,date,type,hour,status:'asistió',therapist_id:therapistId,
      pain_before:pb,pain_after:pa,note,tags:proTecnicasSel
    }).select('id').single();
    if(error){toastErr('No se pudo guardar la sesión. Intenta de nuevo.');return;}
    // La fila en session_log ES el dato: doneActual/pendientesActual la cuentan sin contadores aparte.
    if(!pt.log) pt.log=[];
    const spf=pt.billing?.sesPerFactura||0;
    const pendBefore=pendientesActual(pt);                // umbral: medir antes de agregar la fila
    const doneBefore=doneActual(pt);                      // idem el plan
    pt.log.push({id:ins?.id??null,date,type,hour,status:'asistió',pb,pa,note,tags:[...proTecnicasSel],therapistId});
    const crossed=spf>0&&pendBefore<spf&&pendientesActual(pt)>=spf;
    window._app.closeModal('session-modal');
    _manualMode=false; _manualPatientId=null;
    window._app.renderPatientReport?.();
    window._app.updateResumenBadge();
    updateFacturaBadge();
    toastOk('Sesión manual guardada en historial clínico ✓');
    avisoPlanCompleto(pt,doneBefore);
    if(crossed) showBillingAlert(pt);   // va último: showBillingAlert abre un confirm() bloqueante
  } finally { _savingSession=false; _setSaveBtn(false); }
}

// ── Editar sesión existente (desde la tabla Detalle del Informe Paciente) ──
export function editSession(patientId, id) {
  if(!hasPermission('registerSession')){toastErr('No tienes permisos para editar sesiones.');return;}
  const pt=getPatient(patientId);
  // El id del onclick llega como string; en memoria puede ser entero -> comparar coercionando.
  const s=pt&&pt.log?pt.log.find(x=>x.id!=null&&String(x.id)===String(id)):null;
  if(!s){toastErr('Sesión no encontrada.');return;}
  clearAllErrors(['sess-manual-date','sess-therapist','sess-note']);
  _editMode=true; _editRef={patientId,id:s.id,date:s.date,hour:s.hour}; _manualMode=false; _pendingSessionAppt=null;
  document.getElementById('session-modal-title').textContent='Editar sesión — '+pt.name.split(' ').slice(0,2).join(' ');
  document.getElementById('session-modal-sub').textContent='Corregí los datos de la sesión';
  const di=document.getElementById('sess-manual-date');
  const df=document.getElementById('sess-manual-date-field');
  const today=fmtDate(new Date());
  if(di){ di.max=today; di.value=s.date; }
  if(df) df.style.display='';
  const thf=document.getElementById('sess-therapist-field');
  if(thf) thf.style.display='none';     // al editar se conserva el terapeuta original de la sesión
  const cancelBtn=document.getElementById('session-cancel-btn');
  if(cancelBtn) cancelBtn.textContent='Cancelar';
  renderEvaButtons('eva-before-btns','sess-eva-before-val',s.pb!=null?s.pb:5,'#E24B4A');
  renderEvaButtons('eva-after-btns','sess-eva-after-val',s.pa!=null?s.pa:5,'#1D9E75');
  document.getElementById('sess-note').value=s.note||'';
  document.getElementById('sess-type').value=s.type||'';
  proTecnicasSel=Array.isArray(s.tags)?[...s.tags]:[];
  renderProTecnicas();
  document.getElementById('session-modal').classList.add('open');
}

async function saveSessionEdit() {
  if(_savingSession) return;
  const ref=_editRef;
  const pt=ref?getPatient(ref.patientId):null;
  if(!ref||!pt){toastErr('Sesión no encontrada.');return;}
  const newDate=document.getElementById('sess-manual-date').value;
  const today=fmtDate(new Date());
  if(!newDate){showFieldError('sess-manual-date','Elegí la fecha de la sesión');toastErr('Elegí la fecha de la sesión');return;}
  if(newDate>today){showFieldError('sess-manual-date','La fecha no puede ser futura');toastErr('La fecha no puede ser futura');return;}
  clearFieldError('sess-manual-date');
  const note=document.getElementById('sess-note').value.trim();
  if(!note){
    showFieldError('sess-note','Describe brevemente qué se realizó en la sesión');
    document.getElementById('sess-note').focus();
    toastErr('Describe brevemente qué se realizó en la sesión');
    return;
  }
  clearFieldError('sess-note');
  // GUARDA del edge de fecha: si mover la fecha cambia la pertenencia al episodio actual, abortar
  // (done debe quedar exacto; mover entre episodios = eliminar y recrear).
  if(newDate!==ref.date){
    const finDates=(pt.log||[]).filter(x=>x.type==='Fin de episodio').map(x=>x.date).sort();
    const lastFin=finDates.length?finDates[finDates.length-1]:null;
    const wasCurrent =!lastFin||ref.date>lastFin;
    const willCurrent=!lastFin||newDate>lastFin;
    if(wasCurrent!==willCurrent){
      toastErr('Para mover la sesión a otro episodio, eliminála y creála de nuevo');
      return;
    }
  }
  const pb=parseInt(document.getElementById('sess-eva-before-val').textContent)||0;
  const pa=parseInt(document.getElementById('sess-eva-after-val').textContent)||0;
  const type=document.getElementById('sess-type').value;
  _savingSession=true; _setSaveBtn(true);
  try {
    const {data:upd,error}=await supa.from('session_log')
      .update({date:newDate,type,pain_before:pb,pain_after:pa,note,tags:proTecnicasSel})
      .eq('id',ref.id).select();
    if(error){toastErr('No se pudo guardar el cambio. Intenta de nuevo.');return;}
    if(!upd||!upd.length){toastErr('No se pudo editar (sin permiso o la sesión ya cambió). Refrescá la página.');return;}
    // memoria: actualizar la entrada por su id. done NO se toca (sigue siendo la misma sesión).
    const i=pt.log.findIndex(x=>x.id!=null&&String(x.id)===String(ref.id));
    if(i>=0) pt.log[i]={...pt.log[i],date:newDate,type,pb,pa,note,tags:[...proTecnicasSel]};
    window._app.closeModal('session-modal');
    _editMode=false; _editRef=null;
    window._app.renderPatientReport?.();
    window._app.updateResumenBadge();
    updateFacturaBadge();
    toastOk('Sesión actualizada ✓');
  } finally { _savingSession=false; _setSaveBtn(false); }
}

// ── Eliminar sesión (solo admin) ──
export async function deleteSession(patientId, id) {
  if(!hasPermission('deleteSession')){toastErr('No tienes permisos para eliminar sesiones.');return;}
  const pt=getPatient(patientId);
  const idx=pt&&pt.log?pt.log.findIndex(x=>x.id!=null&&String(x.id)===String(id)):-1;
  if(idx<0){toastErr('Sesión no encontrada.');return;}
  const s=pt.log[idx];
  if(s.type==='Evaluación inicial'){toastErr('La evaluación inicial no se elimina desde aquí.');return;}
  if(!confirm('¿Eliminar esta sesión del historial clínico? No se puede deshacer.')) return;
  // DELETE con verificación de filas afectadas: un delete bloqueado por RLS devuelve 0 filas SIN error.
  const {data:del,error}=await supa.from('session_log').delete()
    .eq('id',id).select();
  if(error){toastErr('No se pudo eliminar la sesión. Intenta de nuevo.');return;}
  if(!del||!del.length){toastErr('No se pudo eliminar (sin permiso o ya no existe). Refrescá la página.');return;}
  // Quitar la fila del log basta: doneActual/pendientesActual se recalculan solos (fuente única).
  pt.log.splice(idx,1);
  window._app.renderPatientReport?.();
  window._app.updateResumenBadge();
  updateFacturaBadge();
  toastOk('Sesión eliminada del historial ✓');
}

export async function saveSession() {
  if(_editMode) return saveSessionEdit();
  if(_manualMode) return saveSessionManual();
  if(_savingSession) return;                 // candado: ignora re-entradas mientras guarda
  const appt=_pendingSessionAppt;if(!appt)return;
  const pb=parseInt(document.getElementById('sess-eva-before-val').textContent)||0;
  const pa=parseInt(document.getElementById('sess-eva-after-val').textContent)||0;
  const type='Fisioterapia';                              // I1: tipo fijo (las técnicas van en tags)
  const therapistId=appt.therapistId||null;               // I3: quién atendió = terapeuta de la cita
  const note=document.getElementById('sess-note').value.trim();
  if(!note){
    showFieldError('sess-note','Describe brevemente qué se realizó en la sesión');
    document.getElementById('sess-note').focus();
    toastErr('Describe brevemente qué se realizó en la sesión');
    return;
  }
  clearFieldError('sess-note');
  _savingSession=true; _setSaveBtn(true);
  try {
    let savedId=null;                                        // id real de la fila (para llevarlo a memoria)
    if(appt.id&&appt.patientId){
      const apptHourFmt=fmtTime(appt.hour);
      const existingInDB=await supa.from('session_log').select('id').eq('patient_id',appt.patientId).eq('date',appt.date).eq('hour',apptHourFmt).maybeSingle();
      let dbError;
      if(existingInDB.data){
        savedId=existingInDB.data.id;
        const {error}=await supa.from('session_log').update({type,pain_before:pb,pain_after:pa,note,tags:proTecnicasSel,therapist_id:therapistId}).eq('id',existingInDB.data.id);
        dbError=error;
      } else {
        const {data:ins,error}=await supa.from('session_log').insert({
          patient_id:appt.patientId,date:appt.date,type,hour:apptHourFmt,status:'asistió',therapist_id:therapistId,
          pain_before:pb,pain_after:pa,note,tags:proTecnicasSel
        }).select('id').single();
        savedId=ins?.id??null;
        dbError=error;
      }
      if(dbError){toastErr('No se pudo guardar la sesión. Intenta de nuevo.');return;}
    }
    const a=state.appointments.find(x=>x.id===appt.id);
    if(a) a.hasSession=true;
    const pt2=getPatient(appt.patientId);
    let crossed=false, doneBefore=0;
    if(pt2){
      if(!pt2.log) pt2.log=[];
      const spf=pt2.billing?.sesPerFactura||0;
      const pendBefore=pendientesActual(pt2);             // umbral: medir antes de tocar el log
      doneBefore=doneActual(pt2);                         // idem el plan
      const hh=fmtTime(appt.hour);
      // normHour: la hora recargada desde DB es 'HH:MM:SS' y hh es 'H:MM' -> comparar normalizado
      // para que el re-registro REEMPLACE la fila existente en vez de duplicarla.
      const existIdx=pt2.log.findIndex(s=>s.date===appt.date&&normHour(s.hour)===normHour(hh));
      const keepId=existIdx>=0?pt2.log[existIdx].id:null;  // conservar id si reemplazamos
      const newEntry={id:savedId??keepId,date:appt.date,type,hour:hh,status:'asistió',pb,pa,note,tags:[...proTecnicasSel],therapistId};
      if(existIdx>=0) pt2.log[existIdx]=newEntry;          // re-registro: doneActual no cambia -> no cruza
      else pt2.log.push(newEntry);
      crossed=spf>0&&pendBefore<spf&&pendientesActual(pt2)>=spf;
    }
    window._app.closeModal('session-modal');
    _pendingSessionAppt=null;
    // Redibujar la pantalla desde la que se abrió el modal: el botón "Completar sesión" debe pasar
    // a "✓ Sesión OK" al instante en el Resumen del día; en Agenda se refresca la grilla.
    if(state.currentTab==='resumen') window._app.renderResumen?.();
    else window._app.renderGrid();
    window._app.updateResumenBadge();
    updateFacturaBadge();
    toastOk('Sesión guardada en historial clínico ✓');
    if(pt2) avisoPlanCompleto(pt2,doneBefore);
    if(crossed) showBillingAlert(pt2);   // va último: showBillingAlert abre un confirm() bloqueante
  } finally { _savingSession=false; _setSaveBtn(false); }
}

export function skipSession() {
  window._app.closeModal('session-modal');
  _pendingSessionAppt=null;
  if(_editMode){ _editMode=false; _editRef=null; return; }
  if(_manualMode){ _manualMode=false; _manualPatientId=null; return; }
  toastInfo('Sesión omitida — puedes registrarla desde Informe paciente');
}
