import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, fmtDate, fmtTime, getColor, getTherapist, getPatient, getDoctor, therapistHours, getAvailHours, dotColor, pendientesActual, safeColor, orderedTherapists } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { dbUpdateApptStatus } from './auth.js';
import { hasPermission } from './permissions.js';
import { showFieldError, clearAllErrors } from './validators.js';

// ── Helpers de slots/duración ──
export function apptSlots(a) {
  const spans = Math.max(1, Math.round((a.duration || 60) / 30));
  const slots = [];
  for (let i = 0; i < spans; i++) slots.push(+(a.hour + i * 0.5).toFixed(1));
  return slots;
}

function conflictsWithExisting(date, thId, startHour, duration, excludeId) {
  const newSlots = new Set(apptSlots({ hour: startHour, duration }));
  return state.appointments.some(a =>
    a.id !== excludeId && a.date === date && a.therapistId === thId &&
    apptSlots(a).some(s => newSlots.has(s))
  );
}

export function renderRefLegend() {
  const el=document.getElementById('ref-legend-bar'); if(!el) return;
  const docs=state.doctors.map(d=>`<span class="leg-item"><span class="leg-stripe" style="background:${safeColor(d.color)}"></span>${esc(d.name)}</span>`).join('');
  el.innerHTML=`<span class="leg-item"><span class="leg-tint" style="background:rgba(29,158,117,.3)"></span>Centro</span>`
    +`<span class="leg-item"><span class="leg-tint" style="background:rgba(245,166,35,.35)"></span>Domicilio</span>`
    +(state.doctors.length?`<span style="margin-left:6px">Franja izq. = doctor referente:</span>${docs}`:'');
}

export function updateFacturaBadge() {
  const n=state.patients.filter(p=>p.billing&&pendientesActual(p)>=p.billing.sesPerFactura).length;
  const b=document.getElementById('factura-badge');if(!b)return;
  b.textContent=n; b.style.display=n>0?'':'none';
}

// Aviso "paciente listo para facturar". Se dispara desde las rutas de sesión (saveSession/
// saveSessionManual) SOLO al cruzar el umbral sesPerFactura (no en cada sesión por encima).
export function showBillingAlert(pt) {
  const msg=`🧾 ${pt.name} llegó a ${pt.billing.sesPerFactura} citas — ¡hora de facturar!\n\nCI: ${pt.cedula||'—'}  ·  ${pt.email||'sin correo'}\n\n¿Ir a Facturación ahora?`;
  if(confirm(msg)) window._app.showTab('facturacion');
}

// P-6: cubre también citas de días ANTERIORES que quedaron 'pend' (antes solo procesaba hoy,
// y solo si el día visible era hoy). Las fechas son 'YYYY-MM-DD', comparables como string.
export function checkAutoNoas() {
  const now=new Date();
  const todayStr=fmtDate(now);
  const nowMin=now.getHours()*60+now.getMinutes();
  state.appointments.forEach(a=>{
    if(a.status!=='pend') return;
    if(a.date<todayStr||(a.date===todayStr&&a.hour*60+30<=nowMin)){
      a.status='noas';
      dbUpdateApptStatus(a.id,'noas');
    }
  });
}

export function renderGrid() {
  checkAutoNoas();
  const view = state.agendaView || 'day';
  if(view === 'week' || view === 'month') return;

  const g = document.getElementById('schedule-grid');
  if(!g) return;

  const ds=fmtDate(state.currentDate);
  const dn=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('day-lbl').textContent=`${dn[state.currentDate.getDay()]}, ${state.currentDate.getDate()} de ${mn[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;

  populateThFilter();
  const filterTh = state.agendaTherapistFilter || null;
  const allTh = orderedTherapists();
  const visTherapists = filterTh ? allTh.filter(t => t.id === filterTh) : allTh;

  const ta=state.appointments.filter(a=>a.date===ds);
  const visTa=ta.filter(a=>visTherapists.some(t=>t.id===a.therapistId));
  const conf=ta.filter(a=>a.status==='conf').length;
  const pend=ta.filter(a=>a.status==='pend').length;
  const noas=ta.filter(a=>a.status==='noas').length;
  const totalSlots=visTherapists.reduce((s,t)=>s+therapistHours(t).length,0);
  const occupied=visTa.reduce((s,a)=>s+apptSlots(a).length,0);
  const libres=Math.max(0,totalSlots-occupied);

  const statsEl=document.getElementById('agenda-stats');
  if(statsEl) statsEl.innerHTML=`
    <span class="count-pill"><b>${ta.length}</b>&nbsp;cita${ta.length!==1?'s':''} hoy · ${libres} slots libres</span>
    <span class="count-item" style="color:#17865f"><span class="count-dot" style="background:#1D9E75"></span>${conf} confirmada${conf!==1?'s':''}</span>
    <span class="count-item" style="color:#BA7517"><span class="count-dot" style="background:#E0A850"></span>${pend} pendiente${pend!==1?'s':''}</span>
    <span class="count-item" style="color:#c33a3a"><span class="count-dot" style="background:#E24B4A"></span>${noas} no asistió</span>`;

  // Filas: unión de horarios de los terapeutas visibles + horas de citas del día.
  // NUEVO 2: las citas fuera del horario son válidas y deben verse SIEMPRE.
  const hourSet=new Set(getAvailHours(visTherapists));
  visTa.forEach(a=>apptSlots(a).forEach(s=>{if(s>=0&&s<24)hourSet.add(s);}));
  let vh=[...hourSet].sort((a,b)=>a-b);
  if(vh.length){const min=vh[0],max=vh[vh.length-1];vh=[];for(let h=min;h<=max;h+=0.5)vh.push(+h.toFixed(1));}

  g.innerHTML=''; g.style.gridTemplateColumns=`60px repeat(${visTherapists.length},1fr)`;

  const eh=document.createElement('div');eh.className='grid-header';eh.textContent='Hora';g.appendChild(eh);
  visTherapists.forEach(th=>{
    const c=getColor(th.colorId);
    const h=document.createElement('div');h.className='th-header';
    h.innerHTML=`<div class="avatar" style="background:${c.bg};color:${c.text}">${esc(th.initials)}</div><div><div class="th-nm">${esc(th.name)}</div><div class="th-sp">${fmtTime(th.startH)}–${fmtTime(th.endH)}</div></div>`;
    g.appendChild(h);
  });

  // Build set of tail slots (slots beyond the first covered by multi-slot appts)
  const tailSet = new Set();
  visTa.forEach(a => {
    apptSlots(a).slice(1).forEach(s => tailSet.add(`${a.therapistId}:${s}`));
  });

  vh.forEach(hr=>{
    const tc=document.createElement('div');tc.className='time-cell'+(hr%1===0.5?' half-hour':'');tc.textContent=fmtTime(hr);g.appendChild(tc);
    visTherapists.forEach(th=>{
      const key=`${th.id}:${+hr.toFixed(1)}`;
      const isTail=tailSet.has(key);

      const slot=document.createElement('div');

      if(isTail){
        slot.className='slot slot-tail';
        g.appendChild(slot);
        return;
      }

      // Fuera de horario NO se distingue visualmente (decisión 2026-08): todos los slots se ven
      // y comportan igual — cualquier franja acepta citas (click, drop y render).
      const appt=visTa.find(a=>a.therapistId===th.id&&a.hour===hr);
      slot.className='slot'+(!appt?' avail':'');

      slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('drag-over')});
      slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
      slot.addEventListener('drop',async e=>{
        e.preventDefault();slot.classList.remove('drag-over');
        if(state.dragData!=null){
          const a=state.appointments.find(x=>x.id===state.dragData);
          if(a){
            if(!conflictsWithExisting(a.date,th.id,hr,a.duration||60,a.id)){
              a.therapistId=th.id;a.hour=hr;renderGrid();
              // Reubicación: commit solo persiste la nueva posición de la fila.
              await commitApptChange(a, {hour:hr, therapist_id:th.id});
            } else toastErr('Conflicto: el terapeuta ya tiene una cita en ese horario.');
          }
        }
        state.dragData=null;
      });
      if(!appt){
        slot.addEventListener('click',()=>openApptModalAt(th.id,hr));
      }
      if(appt){
        const dur=appt.duration||60;
        const spans=Math.max(1,Math.round(dur/30));
        const pt=getPatient(appt.patientId);
        const card=document.createElement('div');
        let sc='';if(appt.status==='pend')sc=' status-pend';else if(appt.status==='noas')sc=' status-noas';
        // Tinte de fondo por MODALIDAD (centro verde / domicilio naranja); el ESTADO pisa el
        // tinte cuando aplica (reglas .status-* posteriores en CSS).
        const locCls=appt.location==='domicilio'?'loc-domicilio':'loc-centro';
        card.className=`appt ${locCls}${sc}`;
        card.draggable=true;
        const doc=pt&&pt.doctorId?getDoctor(pt.doctorId):null;
        card.style.borderLeftColor=doc?doc.color:'rgba(0,0,0,.1)';
        if(doc) card.title=`Ref: ${doc.name} (${doc.spec})${appt.status==='conf'?' · Doble click para registrar sesión':''}`;
        const durLabel=dur!==60?` · ${dur}min`:'';
        const canDel=hasPermission('deleteAppt');
        card.innerHTML=`<div class="appt-name">${esc(pt?pt.name:(appt.patientName||'Sin paciente'))}</div><div class="appt-sub">${esc(appt.type)}${durLabel}${appt.status==='pend'?' · por confirmar':''}</div><div class="appt-dot" style="background:${dotColor(appt.status)}" title="Estado: ${esc(appt.status)} — click para cambiar"></div>${canDel?'<div class="appt-del">×</div>':''}`;
        card.style.cursor='pointer';
        card.addEventListener('click',e=>{if(!e.target.classList.contains('appt-dot')&&!e.target.classList.contains('appt-del')){e.stopPropagation();openEditApptModal(appt.id);}});
        card.querySelector('.appt-dot').addEventListener('click',e=>{e.stopPropagation();cycleStatus(appt.id);});
        if(canDel) card.querySelector('.appt-del').addEventListener('click',e=>{e.stopPropagation();delAppt(appt.id,e);});
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
        if(spans>1){
          slot.style.zIndex='2';
          card.style.bottom='auto';
          card.style.height=`calc(${spans} * 46px - 6px)`;
        }
        slot.appendChild(card);
      }
      g.appendChild(slot);
    });
  });
  renderRefLegend();
  window._app?.updateResumenBadge();
}

// ¿Es un id real de DB? Excluye numéricos optimistas Y los 'rec-' (M2: no matchean ninguna fila).
const esRealApptId = id => typeof id === 'string' && !id.startsWith('rec-');

// ÚNICO punto de cambio de una cita: persiste los campos dados en la fila (solo ids reales).
// done/billing NO se tocan aquí: derivan de session_log vía doneActual/pendientesActual.
async function commitApptChange(appt, dbFields) {
  if (!esRealApptId(appt.id)) return true;   // numéricos optimistas / 'rec-': solo memoria
  try {
    const { error } = await supa.from('appointments').update(dbFields).eq('id', appt.id);
    if (error) { toastErr('No se pudo guardar el cambio de la cita: ' + error.message); return false; }
  } catch (e) { toastErr('Error de conexión al guardar el cambio de la cita.'); return false; }
  return true;
}

export async function cycleStatus(id) {
  const a=state.appointments.find(x=>x.id===id);if(!a)return;
  const c=['conf','pend','noas'];
  a.status=c[(c.indexOf(a.status)+1)%3];
  renderGrid(); window._app.updateResumenBadge(); updateFacturaBadge();
  await commitApptChange(a, {status:a.status});   // solo persiste la fila
}

export async function delAppt(id,e) {
  if(e) e.stopPropagation();
  if(!hasPermission('deleteAppt')){toastErr('No tienes permisos para eliminar citas.');return;}
  if(!confirm('¿Eliminar esta cita?')) return;
  // Eliminar la cita NO altera done/billing: esos derivan de session_log (la fila clínica, si existe, persiste).
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

export function goToToday() {
  state.currentDate=new Date();
  const view=state.agendaView||'day';
  if(view==='week') renderWeekView();
  else if(view==='month') renderMonthView();
  else renderGrid();
}

export function changeDay(d) {
  const view = state.agendaView || 'day';
  if(view === 'week'){
    state.currentDate.setDate(state.currentDate.getDate() + d * 7);
    renderWeekView();
  } else if(view === 'month'){
    state.currentDate.setMonth(state.currentDate.getMonth() + d);
    renderMonthView();
  } else {
    state.currentDate.setDate(state.currentDate.getDate() + d);
    renderGrid();
  }
}

function _openApptModalBase() {
  document.getElementById('m-therapist').innerHTML=orderedTherapists().map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${fmtTime(t.startH)}-${fmtTime(t.endH)})</option>`).join('');
  updateTimeSlots();
  document.getElementById('appt-modal').classList.add('open');
}

export function openApptModalAt(thId, hr) {
  openApptModal();
  setTimeout(()=>{
    const thSel=document.getElementById('m-therapist');
    if(thSel){thSel.value=String(thId);updateTimeSlots();}
    const timeSel=document.getElementById('m-time');
    if(timeSel) timeSel.value=String(hr);
  },0);
}

export function openApptModal() {
  if(!state.therapists.length){toastErr('Primero agrega al menos un terapeuta.');window._app.showTab('terapeutas');return;}
  if(!state.patients.length){toastErr('Primero agrega al menos un paciente.');window._app.showTab('pacientes');return;}
  clearAllErrors(['m-date','m-patient-search','m-therapist','m-time']);
  document.getElementById('m-editing-id').value='';
  document.getElementById('appt-modal-title').textContent='Nueva cita';
  document.getElementById('appt-modal-save-btn').textContent='Guardar cita';
  document.getElementById('appt-modal-del-btn').style.display='none';
  document.getElementById('m-date').value=fmtDate(state.currentDate);
  document.getElementById('m-patient-search').value='';
  document.getElementById('m-patient').value='';
  const durSel=document.getElementById('m-duration');
  if(durSel) durSel.value='60';
  const locSel=document.getElementById('m-location');
  if(locSel) locSel.value='centro';
  document.getElementById('m-note').value='';
  document.getElementById('m-status').value='conf';
  document.getElementById('m-recurrente').checked=false;
  document.getElementById('recurrencia-panel').style.display='none';
  filterApptPatient();
  _openApptModalBase();
}

export function openEditApptModal(id) {
  const a=state.appointments.find(x=>x.id===id);
  if(!a){toastErr('Cita no encontrada.');return;}
  clearAllErrors(['m-date','m-patient-search','m-therapist','m-time']);
  const pt=getPatient(a.patientId);
  document.getElementById('m-editing-id').value=String(id);
  document.getElementById('appt-modal-title').textContent='Editar cita';
  document.getElementById('appt-modal-save-btn').textContent='Guardar cambios';
  const canDel=hasPermission('deleteAppt');
  document.getElementById('appt-modal-del-btn').style.display=canDel?'':'none';
  document.getElementById('m-date').value=a.date;
  document.getElementById('m-patient-search').value=pt?pt.name:(a.patientName||'');
  document.getElementById('m-patient').value=String(a.patientId||'');
  const durSel=document.getElementById('m-duration');
  if(durSel) durSel.value=String(a.duration||60);
  const locSel=document.getElementById('m-location');
  if(locSel) locSel.value=a.location||'centro';
  document.getElementById('m-note').value=a.note||'';
  document.getElementById('m-status').value=a.status||'conf';
  document.getElementById('m-recurrente').checked=false;
  document.getElementById('recurrencia-panel').style.display='none';
  filterApptPatient();
  document.getElementById('m-therapist').innerHTML=orderedTherapists().map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${fmtTime(t.startH)}-${fmtTime(t.endH)})</option>`).join('');
  document.getElementById('m-therapist').value=String(a.therapistId);
  document.getElementById('m-type').value=a.type||'Fisioterapia';
  updateTimeSlots();
  document.getElementById('m-time').value=String(a.hour);
  document.getElementById('appt-modal').classList.add('open');
}

export function updateTimeSlots() {
  const th=getTherapist(document.getElementById('m-therapist').value);
  if(!th) return;
  const opts=[];for(let h=6;h<=20;h+=0.5) opts.push(`<option value="${h}">${fmtTime(h)}</option>`);
  document.getElementById('m-time').innerHTML=opts.join('');
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
  const editingId=document.getElementById('m-editing-id').value;
  const isEdit=!!editingId;

  if(!isEdit&&!hasPermission('createAppt')){toastErr('No tienes permisos para crear citas.');return;}
  clearAllErrors(['m-date','m-patient-search','m-therapist','m-time']);
  const thId=document.getElementById('m-therapist').value;
  const hr=parseFloat(document.getElementById('m-time').value);
  const dur=parseInt(document.getElementById('m-duration')?.value||'60');
  const loc=document.getElementById('m-location')?.value==='domicilio'?'domicilio':'centro';
  let patId=document.getElementById('m-patient').value;
  if(!thId){showFieldError('m-therapist','Selecciona un terapeuta');toastErr('Selecciona un terapeuta.');return;}
  if(!patId){
    const searchVal=document.getElementById('m-patient-search').value.trim().toLowerCase();
    const found=state.patients.find(p=>p.name.toLowerCase()===searchVal);
    if(found){patId=found.id;document.getElementById('m-patient').value=found.id;}
    else{showFieldError('m-patient-search','Selecciona un paciente de la lista');toastErr('Selecciona un paciente de la lista.');return;}
  }
  if(isNaN(hr)||hr<0||hr>24){showFieldError('m-time','Selecciona una hora válida');toastErr('Selecciona una hora válida.');return;}
  const dateVal=document.getElementById('m-date').value;
  if(!dateVal){showFieldError('m-date','Elegí la fecha de la cita');toastErr('Elegí la fecha de la cita.');return;}
  const ds=dateVal;
  const excludeId=isEdit?editingId:null;
  if(conflictsWithExisting(ds,thId,hr,dur,excludeId)){toastErr('Conflicto: el terapeuta ya tiene una cita en ese horario.');return;}

  if(isEdit){
    const existing=state.appointments.find(a=>String(a.id)===editingId);
    if(!existing){toastErr('Cita no encontrada.');return;}
    const today=fmtDate(new Date());
    if(ds<today && ds!==existing.date){toastErr('No se pueden mover citas a días pasados.');return;}
    existing.therapistId=thId;existing.hour=hr;existing.duration=dur;existing.location=loc;
    existing.patientId=patId;existing.type=document.getElementById('m-type').value;
    existing.status=document.getElementById('m-status').value;existing.note=document.getElementById('m-note').value;existing.date=ds;
    window._app.closeModal('appt-modal'); renderGrid();
    const ok=await commitApptChange(existing, {
      date:ds,therapist_id:thId,patient_id:patId,hour:hr,duration:dur,
      type:existing.type,status:existing.status,note:existing.note||'',location:loc
    });
    if(ok) toastOk('Cita actualizada');
    updateFacturaBadge();
    return;
  }

  const today=fmtDate(new Date());
  if(ds<today){toastErr('No se pueden agendar citas en días pasados.');return;}
  const _a={id:++state.apptCounter,date:ds,therapistId:thId,hour:hr,duration:dur,location:loc,patientId:patId,type:document.getElementById('m-type').value,status:document.getElementById('m-status').value,note:document.getElementById('m-note').value};
  state.appointments.push(_a);
  window._app.closeModal('appt-modal'); renderGrid();
  const tempId=_a.id;
  try {
    const {data,error}=await supa.from('appointments').insert({
      date:_a.date,therapist_id:_a.therapistId,patient_id:_a.patientId,
      hour:_a.hour,duration:_a.duration,type:_a.type,status:_a.status,note:_a.note||'',location:_a.location
    }).select().single();
    if(error){
      // Rollback del push optimista (mismo patrón que emitirFactura): la cita no existe en DB.
      state.appointments=state.appointments.filter(x=>x.id!==_a.id);
      renderGrid();
      toastErr('Error al guardar cita: '+error.message);
    }
    else {
      _a.id=data.id;
      if(document.getElementById('m-recurrente')?.checked){
        const dias=[...document.querySelectorAll('.rec-day:checked')].map(c=>parseInt(c.value));
        const semanas=parseInt(document.getElementById('m-rec-semanas')?.value||'4');
        if(dias.length){
          const fechas=getRecDates(_a.date,dias,semanas);
          let creadas=0,omitidas=0;
          for(const fecha of fechas){
            if(conflictsWithExisting(fecha,_a.therapistId,_a.hour,_a.duration,null)){omitidas++;continue;}
            const {error:re}=await supa.from('appointments').insert({date:fecha,therapist_id:_a.therapistId,patient_id:_a.patientId,hour:_a.hour,duration:_a.duration,type:_a.type,status:'pend',note:_a.note||'',location:_a.location});
            if(!re){state.appointments.push({..._a,id:'rec-'+fecha+'-'+Math.random(),date:fecha,status:'pend'});creadas++;}
          }
          if(creadas>0||omitidas>0){
            const tot=creadas+1;
            toastOk('✓ '+tot+' cita'+(tot!==1?'s':'')+' creada'+(tot!==1?'s':'')+
              (omitidas>0?' · '+omitidas+' omitida'+(omitidas!==1?'s':'')+' por conflicto de horario':''));
          }
        }
      }
      renderGrid(); toastOk('Cita guardada correctamente');
    }
  } catch(e){
    // Rollback solo si _a sigue con el id temporal: si el insert base ya asignó el UUID real
    // (excepción posterior, p.ej. en el loop de recurrentes), la cita SÍ existe en DB.
    if(_a.id===tempId){
      state.appointments=state.appointments.filter(x=>x.id!==tempId);
      renderGrid();
    }
    toastErr('Error de conexión al guardar cita.');
  }
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

// ── Modos de vista ──

function populateThFilter() {
  const sel = document.getElementById('agenda-th-filter');
  if(!sel || sel.dataset.populated === String(state.therapists.length)) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los terapeutas</option>' +
    orderedTherapists().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  if(cur) sel.value = cur;
  sel.dataset.populated = String(state.therapists.length);
}

export function setAgendaView(mode) {
  state.agendaView = mode;
  ['day','week','month'].forEach(m => {
    const btn = document.getElementById('vbtn-'+m);
    if(btn) btn.classList.toggle('active', m === mode);
  });
  populateThFilter();
  const wrap = document.querySelector('#tab-agenda .grid-wrap');
  if(!wrap) return;
  if(mode === 'day'){
    if(!document.getElementById('schedule-grid')){
      wrap.innerHTML = '<div class="schedule-grid" id="schedule-grid"></div>';
    }
    renderGrid();
  } else if(mode === 'week'){
    renderWeekView();
  } else if(mode === 'month'){
    renderMonthView();
  }
}

export function setTherapistFilter(val) {
  state.agendaTherapistFilter = val || null;
  const view = state.agendaView || 'day';
  if(view === 'week') renderWeekView();
  else if(view === 'month') renderMonthView();
  else renderGrid();
}

export function renderWeekView() {
  const wrap = document.querySelector('#tab-agenda .grid-wrap');
  if(!wrap) return;
  populateThFilter();
  const filterTh = state.agendaTherapistFilter || null;
  const base = new Date(state.currentDate);
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (dow === 0 ? 6 : dow - 1));
  const days = [];
  for(let i = 0; i < 7; i++){
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    days.push(d);
  }
  const dn = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const mn = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const todayStr = fmtDate(new Date());

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;min-width:700px;padding:12px">';
  days.forEach(d => {
    const ds = fmtDate(d);
    let dayAppts = state.appointments.filter(a => a.date === ds);
    if(filterTh) dayAppts = dayAppts.filter(a => a.therapistId === filterTh);
    dayAppts = dayAppts.sort((a,b) => a.hour - b.hour);
    const isToday = ds === todayStr;
    html += `<div style="border:1px solid rgba(29,158,117,${isToday?'.4':'.14'});border-radius:8px;padding:8px;min-height:80px;background:${isToday?'rgba(29,158,117,.04)':'#fff'}">
      <div style="font-size:10px;font-weight:600;color:${isToday?'#1D9E75':'#5a5a56'};margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;cursor:pointer" onclick="goToDateAndSelect('${ds}')">${dn[d.getDay()]} ${d.getDate()} ${mn[d.getMonth()]}</div>`;
    if(!dayAppts.length){
      html += `<div style="font-size:10px;color:#b0ada8">Sin citas</div>`;
    } else {
      dayAppts.forEach(a => {
        const pt = getPatient(a.patientId);
        const th = getTherapist(a.therapistId);
        const c = getColor(th?.colorId||'ca');
        const doc = pt&&pt.doctorId?getDoctor(pt.doctorId):null;
        const borderColor = doc ? safeColor(doc.color) : 'rgba(0,0,0,.1)';
        const dot = dotColor(a.status);
        html += `<div style="background:${c.bg};border-left:2px solid ${borderColor};border-radius:4px;padding:4px 6px;margin-bottom:4px;font-size:10px;cursor:pointer" onclick="goToDateAndSelect('${ds}')">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dot};margin-right:3px;vertical-align:middle;flex-shrink:0"></span>
          <b>${fmtTime(a.hour)}</b> ${esc(pt?pt.name:(a.patientName||'?'))}
        </div>`;
      });
    }
    html += '</div>';
  });
  html += '</div>';
  wrap.innerHTML = html;
  document.getElementById('day-lbl').textContent = `Semana del ${monday.getDate()} ${mn[monday.getMonth()]}`;
}

export function renderMonthView() {
  const wrap = document.querySelector('#tab-agenda .grid-wrap');
  if(!wrap) return;
  populateThFilter();
  const filterTh = state.agendaTherapistFilter || null;
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const mn = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const todayStr = fmtDate(new Date());
  const startDow = firstDay.getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;

  document.getElementById('day-lbl').textContent = `${mn[month]} ${year}`;

  let html = `<div style="padding:12px">
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px;text-align:center">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<div style="font-size:10px;font-weight:600;color:#7a7a76;padding:4px 0">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">`;

  for(let i = 0; i < offset; i++) html += '<div></div>';

  for(let day = 1; day <= lastDay.getDate(); day++){
    const d = new Date(year, month, day);
    const ds = fmtDate(d);
    let dayAppts = state.appointments.filter(a => a.date === ds);
    if(filterTh) dayAppts = dayAppts.filter(a => a.therapistId === filterTh);
    const isToday = ds === todayStr;
    const dotColors = [...new Set(dayAppts.map(a => {
      const th = getTherapist(a.therapistId);
      return getColor(th?.colorId||'ca').border;
    }))].slice(0,5);

    html += `<div onclick="goToDateAndSelect('${ds}')" style="border:1px solid rgba(29,158,117,${isToday?'.4':'.1'});border-radius:8px;padding:6px;min-height:52px;cursor:pointer;background:${isToday?'rgba(29,158,117,.06)':'#fff'};transition:background .12s" onmouseover="this.style.background='rgba(29,158,117,.06)'" onmouseout="this.style.background='${isToday?'rgba(29,158,117,.06)':'#fff'}'">
      <div style="font-size:11px;font-weight:${isToday?'700':'500'};color:${isToday?'#1D9E75':'#1a1917'};margin-bottom:3px">${day}</div>
      <div style="display:flex;gap:2px;flex-wrap:wrap;align-items:center">
        ${dotColors.map(c=>`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c}"></span>`).join('')}
        ${dayAppts.length>0?`<span style="font-size:9px;color:#7a7a76;line-height:8px">${dayAppts.length}</span>`:''}
      </div>
    </div>`;
  }
  html += '</div></div>';
  wrap.innerHTML = html;
}

export function goToDateAndSelect(ds) {
  goToDate(ds);
  setAgendaView('day');
}

export function exportAgendaCSV() {
  const view = state.agendaView || 'day';
  let appts = [];
  if(view === 'month'){
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
    appts = state.appointments.filter(a => a.date.startsWith(prefix));
  } else if(view === 'week'){
    const base = new Date(state.currentDate);
    const dow = base.getDay();
    const monday = new Date(base);
    monday.setDate(base.getDate() - (dow === 0 ? 6 : dow - 1));
    const dates = new Set();
    for(let i = 0; i < 7; i++){
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      dates.add(fmtDate(d));
    }
    appts = state.appointments.filter(a => dates.has(a.date));
  } else {
    appts = state.appointments.filter(a => a.date === fmtDate(state.currentDate));
  }
  const filterTh = state.agendaTherapistFilter;
  if(filterTh) appts = appts.filter(a => a.therapistId === filterTh);
  appts = appts.sort((a,b) => a.date.localeCompare(b.date)||a.hour-b.hour);

  const rows = [['Fecha','Hora','Paciente','Terapeuta','Estado','Duracion_min','Tipo','Notas']];
  appts.forEach(a => {
    const pt = getPatient(a.patientId);
    const th = getTherapist(a.therapistId);
    rows.push([
      a.date, fmtTime(a.hour),
      pt?pt.name:(a.patientName||''),
      th?th.name:'',
      a.status, a.duration||60,
      a.type||'',
      (a.note||'').replace(/[\n\r,]/g,' ')
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `agenda-${view}-${fmtDate(state.currentDate)}.csv`;
  link.click(); URL.revokeObjectURL(url);
}
