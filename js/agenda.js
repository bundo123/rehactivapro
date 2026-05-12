import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, fmtDate, getColor, getTherapist, getPatient, getDoctor, therapistHours, getAvailHours, dotColor } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { dbUpdateApptStatus, dbUpdateBillingPendientes, dbRegistrarCobro } from './auth.js';

export function renderRefLegend() {
  if(!state.doctors.length){document.getElementById('ref-legend-bar').innerHTML='';return;}
  const items=state.doctors.map(d=>`<span class="ref-legend-item"><span class="ref-stripe" style="background:${d.color}"></span>${esc(d.name)}<span style="color:#7a7a76;font-size:10px;margin-left:3px">(${esc(d.spec)})</span></span>`).join('');
  document.getElementById('ref-legend-bar').innerHTML=`<div class="ref-legend"><span class="ref-legend-lbl">Borde = doctor ref.:</span>${items}</div>`;
}

export function updateFacturaBadge() {
  const n=state.patients.filter(p=>p.billing&&p.billing.pendientes>=p.billing.sesPerFactura).length;
  const b=document.getElementById('factura-badge');if(!b)return;
  b.textContent=n; b.style.display=n>0?'':'none';
}

export function checkAutoNoas() {
  const ds=fmtDate(state.currentDate);
  const now=new Date();
  const isToday=ds===fmtDate(now);
  if(!isToday) return;
  const currentHour=now.getHours();
  const currentMin=now.getMinutes();
  state.appointments.forEach(a=>{
    if(a.date===ds&&a.status==='pend'){
      if(a.hour<currentHour||(a.hour===currentHour&&currentMin>=30)){
        a.status='noas';
        dbUpdateApptStatus(a.id,'noas');
      }
    }
  });
}

export function renderGrid() {
  checkAutoNoas();
  const ds=fmtDate(state.currentDate);
  const dn=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('day-lbl').textContent=`${dn[state.currentDate.getDay()]}, ${state.currentDate.getDate()} de ${mn[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;

  const ta=state.appointments.filter(a=>a.date===ds);
  const slots=state.therapists.reduce((s,t)=>s+therapistHours(t).length,0);
  const conf=ta.filter(a=>a.status==='conf').length;
  const pend=ta.filter(a=>a.status==='pend').length;
  const noas=ta.filter(a=>a.status==='noas').length;
  const util=slots>0?Math.round(ta.length/slots*100):0;

  document.getElementById('agenda-stats').innerHTML=`
    <div class="stat"><div class="stat-lbl">Citas hoy</div><div class="stat-val">${ta.length}</div><div class="stat-chg neu">${slots} slots disponibles</div></div>
    <div class="stat"><div class="stat-lbl">Confirmadas</div><div class="stat-val" style="color:#1D9E75">${conf}</div><div class="stat-chg up">Listas</div></div>
    <div class="stat"><div class="stat-lbl">Pendientes</div><div class="stat-val" style="color:#BA7517">${pend}</div><div class="stat-chg neu">Por confirmar</div></div>
    <div class="stat"><div class="stat-lbl">No asistieron</div><div class="stat-val" style="color:#E24B4A">${noas}</div><div class="stat-chg down">Seguimiento</div></div>`;

  const vh=getAvailHours();
  const g=document.getElementById('schedule-grid');
  g.innerHTML=''; g.style.gridTemplateColumns=`60px repeat(${state.therapists.length},1fr)`;

  const eh=document.createElement('div');eh.className='grid-header';eh.textContent='Hora';g.appendChild(eh);
  state.therapists.forEach(th=>{
    const c=getColor(th.colorId);
    const h=document.createElement('div');h.className='th-header';
    h.innerHTML=`<div class="avatar" style="background:${c.border}22;color:${c.text}">${esc(th.initials)}</div><div><div class="th-nm">${esc(th.name)}</div><div class="th-sp">${th.startH}:00-${th.endH}:00</div></div>`;
    g.appendChild(h);
  });

  vh.forEach(hr=>{
    const tc=document.createElement('div');tc.className='time-cell';tc.textContent=hr+':00';g.appendChild(tc);
    state.therapists.forEach(th=>{
      const avail=hr>=th.startH&&hr<th.endH;
      const slot=document.createElement('div');
      slot.className='slot'+(avail?'':' blocked');
      if(avail){
        slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('drag-over')});
        slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
        slot.addEventListener('drop',e=>{
          e.preventDefault();slot.classList.remove('drag-over');
          if(state.dragData!=null){
            const a=state.appointments.find(x=>x.id===state.dragData);
            if(a){
              const ex=state.appointments.find(x=>x.id!==a.id&&x.date===a.date&&x.therapistId===th.id&&x.hour===hr);
              if(!ex){a.therapistId=th.id;a.hour=hr;renderGrid();}else alert('Slot ocupado.');
            }
          }
          state.dragData=null;
        });
      }
      const appt=ta.find(a=>a.therapistId===th.id&&a.hour===hr);
      if(appt&&avail){
        const pt=getPatient(appt.patientId);
        const card=document.createElement('div');
        let sc='';if(appt.status==='pend')sc=' status-pend';else if(appt.status==='noas')sc=' status-noas';
        card.className=`appt ${th.colorId}${sc}`;
        card.draggable=true;
        const doc=pt&&pt.doctorId?getDoctor(pt.doctorId):null;
        if(doc){card.style.borderLeftColor=doc.color;card.title=`Ref: ${doc.name} (${doc.spec})${appt.status==='conf'?' · Doble click para registrar sesión':''}`;}
        card.innerHTML=`<div class="appt-name" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px" title="Ver/editar paciente">${esc(pt?pt.name:(appt.patientName||'Sin paciente'))}</div><div class="appt-sub">${esc(appt.type)}</div><div class="appt-dot" style="background:${dotColor(appt.status)}" title="Estado: ${esc(appt.status)} — click para cambiar"></div><div class="appt-del">×</div>`;
        card.querySelector('.appt-name').addEventListener('click',e=>{e.stopPropagation();window._app.openEditPatient(appt.patientId);});
        card.querySelector('.appt-dot').addEventListener('click',e=>{e.stopPropagation();cycleStatus(appt.id);});
        card.querySelector('.appt-del').addEventListener('click',e=>{e.stopPropagation();delAppt(appt.id,e);});
        card.addEventListener('dragstart',()=>{state.dragData=appt.id});
        card.addEventListener('dblclick',e=>{
          e.stopPropagation();
          if(appt.status==='conf') window._app.openSessionModal(appt);
          else if(appt.patientId){
            window._app.showTab('paciente_rpt');
            setTimeout(()=>{
              const sel=document.getElementById('patient-rpt-select');
              if(sel){sel.value=String(appt.patientId);window._app.updateEpisodes();}
            },100);
          }
        });
        slot.appendChild(card);
      }
      g.appendChild(slot);
    });
  });
  renderRefLegend();
  window._app?.updateResumenBadge();
}

export function checkBillingOnStatusChange(appt,prevStatus) {
  const pt=getPatient(appt.patientId);if(!pt||!pt.billing)return;
  if(appt.status==='conf'&&prevStatus!=='conf'){
    pt.billing.pendientes=(pt.billing.pendientes||0)+1;
    if(pt.billing.pendientes>=pt.billing.sesPerFactura) showBillingAlert(pt);
  } else if(appt.status!=='conf'&&prevStatus==='conf'){
    pt.billing.pendientes=Math.max(0,(pt.billing.pendientes||1)-1);
  }
}

export function showBillingAlert(pt) {
  const msg=`🧾 ${pt.name} llegó a ${pt.billing.sesPerFactura} citas — ¡hora de facturar!\n\nCI: ${pt.cedula||'—'}  ·  ${pt.email||'sin correo'}\n\n¿Ir a Facturación ahora?`;
  if(confirm(msg)) window._app.showTab('facturacion');
}

export async function cycleStatus(id) {
  const a=state.appointments.find(x=>x.id===id);if(!a)return;
  const prevStatus=a.status;
  const c=['conf','pend','noas'];
  a.status=c[(c.indexOf(a.status)+1)%3];
  checkBillingOnStatusChange(a,prevStatus);
  renderGrid(); window._app.updateResumenBadge(); updateFacturaBadge();
  dbUpdateApptStatus(a.id,a.status);
  if(a.status!=='conf'&&prevStatus==='conf'){
    const pt=getPatient(a.patientId);
    if(pt){
      if(pt.billing) dbUpdateBillingPendientes(a.patientId,pt.billing.pendientes);
      const newDone=Math.max(0,(pt.done||0)-1);
      await supa.from('patients').update({done:newDone}).eq('id',a.patientId);
      pt.done=newDone;
    }
  }
}

export async function delAppt(id,e) {
  if(e) e.stopPropagation();
  if(!confirm('¿Eliminar esta cita?')) return;
  const cita=state.appointments.find(a=>a.id===id);
  if(cita&&cita.status==='conf'&&cita.patientId){
    const pt=getPatient(cita.patientId);
    if(pt){
      const newDone=Math.max(0,(pt.done||0)-1);
      pt.done=newDone;
      if(typeof cita.patientId==='string') await supa.from('patients').update({done:newDone}).eq('id',cita.patientId);
      if(pt.billing&&pt.billing.pendientes>0){
        pt.billing.pendientes=Math.max(0,pt.billing.pendientes-1);
        if(typeof cita.patientId==='string') dbUpdateBillingPendientes(cita.patientId,pt.billing.pendientes);
      }
    }
  }
  state.appointments=state.appointments.filter(a=>a.id!==id);
  renderGrid(); updateFacturaBadge();
  if(typeof id==='string'){
    const {error}=await supa.from('appointments').delete().eq('id',id);
    if(error) toastErr('Error al eliminar cita: '+error.message);
    else toastOk('Cita eliminada');
  }
}

export function openDatePicker() {
  const inp=document.getElementById('date-picker-input');
  inp.value=fmtDate(state.currentDate);
  inp.style.pointerEvents='auto';
  inp.showPicker?inp.showPicker():inp.click();
  setTimeout(()=>inp.style.pointerEvents='none',500);
}

export function goToDate(ds) {
  if(!ds) return;
  const parts=ds.split('-');
  state.currentDate=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  renderGrid();
}

export function changeDay(d) {
  state.currentDate.setDate(state.currentDate.getDate()+d);
  renderGrid();
}

export function openApptModal() {
  if(!state.therapists.length){toastErr('Primero agrega al menos un terapeuta.');window._app.showTab('terapeutas');return;}
  if(!state.patients.length){toastErr('Primero agrega al menos un paciente.');window._app.showTab('pacientes');return;}
  document.getElementById('m-date').value=fmtDate(state.currentDate);
  document.getElementById('m-patient-search').value='';
  document.getElementById('m-patient').value='';
  filterApptPatient();
  document.getElementById('m-therapist').innerHTML=state.therapists.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${t.startH}:00-${t.endH}:00)</option>`).join('');
  updateTimeSlots();
  document.getElementById('appt-modal').classList.add('open');
}

export function updateTimeSlots() {
  const th=getTherapist(document.getElementById('m-therapist').value);
  if(!th) return;
  const allH=[];for(let h=7;h<=20;h++) allH.push(h);
  document.getElementById('m-time').innerHTML=allH.map(h=>`<option value="${h}">${h}:00</option>`).join('');
  document.getElementById('m-time').value=th.startH||7;
}

export function filterApptPatient() {
  const q=(document.getElementById('m-patient-search').value||'').toLowerCase();
  const dl=document.getElementById('m-patient-list');
  const match=state.patients.filter(p=>p.name.toLowerCase().includes(q)||(p.cedula&&p.cedula.includes(q)));
  dl.innerHTML=match.slice(0,10).map(p=>`<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}${p.cedula?' · '+esc(p.cedula):''}</option>`).join('');
  const exact=state.patients.find(p=>p.name.toLowerCase()===q);
  if(exact) document.getElementById('m-patient').value=exact.id;
  else {
    const opt=[...dl.options].find(o=>o.value===document.getElementById('m-patient-search').value);
    if(opt) document.getElementById('m-patient').value=opt.getAttribute('data-id')||'';
  }
}

export async function saveAppt() {
  const thId=document.getElementById('m-therapist').value;
  const hr=parseInt(document.getElementById('m-time').value);
  let patId=document.getElementById('m-patient').value;
  if(!thId){alert('Selecciona un terapeuta.');return;}
  if(!patId){
    const searchVal=document.getElementById('m-patient-search').value.trim().toLowerCase();
    const found=state.patients.find(p=>p.name.toLowerCase()===searchVal);
    if(found){patId=found.id;document.getElementById('m-patient').value=found.id;}
    else{toastErr('Selecciona un paciente de la lista.');return;}
  }
  if(isNaN(hr)){alert('Selecciona una hora válida.');return;}
  const dateVal=document.getElementById('m-date').value;
  const ds=dateVal||fmtDate(state.currentDate);
  const today=fmtDate(new Date());
  if(ds<today){toastErr('No se pueden agendar citas en días pasados.');return;}
  if(state.appointments.find(a=>a.date===ds&&a.therapistId===thId&&a.hour===hr)){alert('Ese slot ya está ocupado.');return;}
  const _a={id:++state.apptCounter,date:ds,therapistId:thId,hour:hr,patientId:document.getElementById('m-patient').value,type:document.getElementById('m-type').value,status:document.getElementById('m-status').value,note:document.getElementById('m-note').value};
  state.appointments.push(_a);
  window._app.closeModal('appt-modal'); renderGrid();
  try {
    const {data,error}=await supa.from('appointments').insert({
      date:_a.date,therapist_id:_a.therapistId,patient_id:_a.patientId,
      hour:_a.hour,type:_a.type,status:_a.status,note:_a.note||''
    }).select().single();
    if(error){toastErr('Error al guardar cita: '+error.message);}
    else {
      _a.id=data.id;
      if(document.getElementById('m-recurrente')?.checked){
        const dias=[...document.querySelectorAll('.rec-day:checked')].map(c=>parseInt(c.value));
        const semanas=parseInt(document.getElementById('m-rec-semanas')?.value||'4');
        if(dias.length){
          const fechas=getRecDates(_a.date,dias,semanas);
          let creadas=0;
          for(const fecha of fechas){
            const {error:re}=await supa.from('appointments').insert({date:fecha,therapist_id:_a.therapistId,patient_id:_a.patientId,hour:_a.hour,type:_a.type,status:'pend',note:_a.note||''});
            if(!re){state.appointments.push({..._a,id:'rec-'+fecha+'-'+Math.random(),date:fecha,status:'pend'});creadas++;}
          }
          if(creadas>0) toastOk('✓ '+(creadas+1)+' citas creadas (recurrentes)');
        }
      }
      renderGrid(); toastOk('Cita guardada correctamente');
    }
  } catch(e){toastErr('Error de conexión al guardar cita.');}
  updateFacturaBadge();
}

export function agendarCitaParaPaciente(patientId) {
  window._app.showTab('agenda');
  setTimeout(()=>{
    openApptModal();
    const p=getPatient(patientId);
    if(p){
      const searchEl=document.getElementById('m-patient-search');
      const hiddenEl=document.getElementById('m-patient');
      if(searchEl) searchEl.value=p.name;
      if(hiddenEl) hiddenEl.value=p.id;
    }
  },200);
}

export function updateGlobalSPF(v) {
  const n=parseInt(v)||5;
  state.patients.forEach(p=>{if(p.billing) p.billing.sesPerFactura=n;});
  if(document.getElementById('facturacion-content').children.length>0) window._app.renderFacturacion();
  updateFacturaBadge();
}

export function toggleRecurrencia() {
  const on=document.getElementById('m-recurrente').checked;
  document.getElementById('recurrencia-panel').style.display=on?'block':'none';
  if(on) updateRecPreview();
}

export function updateRecPreview() {
  const dias=[...document.querySelectorAll('.rec-day:checked')].map(c=>parseInt(c.value));
  const semanas=parseInt(document.getElementById('m-rec-semanas').value);
  const dateVal=document.getElementById('m-date').value||fmtDate(state.currentDate);
  if(!dias.length){document.getElementById('rec-preview').textContent='Selecciona al menos un día';return;}
  const fechas=getRecDates(dateVal,dias,semanas);
  document.getElementById('rec-preview').textContent=`Se crearán ${fechas.length} citas: ${fechas.slice(0,3).join(', ')}${fechas.length>3?'... y '+(fechas.length-3)+' más':''}`;
}

export function getRecDates(baseDate,dias,semanas) {
  const fechas=[];
  const start=new Date(baseDate+'T12:00:00');
  for(let w=0;w<semanas;w++){
    for(let d=0;d<7;d++){
      const fecha=new Date(start);
      fecha.setDate(start.getDate()+w*7+d);
      if(dias.includes(fecha.getDay())){
        const ds=fmtDate(fecha);
        if(ds>baseDate) fechas.push(ds);
      }
    }
  }
  return [...new Set(fechas)].sort();
}
