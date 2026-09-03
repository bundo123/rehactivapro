// ── Bloqueos de terapeuta ──────────────────────────────────────────────────────────────────────
// Vacaciones, curso, permiso: la EXCEPCIÓN, y la excepción se registra. Cada bloqueo es una fila
// de therapist_blocks que la agenda pinta, que no acepta citas y que se descuenta de la capacidad
// en el informe semanal.
//
// Lo que NO vive acá es el almuerzo: ese es una REGLA (lunch_minutes por terapeuta, en el modal de
// terapeutas) y se descuenta solo. Un botón de "almuerzo" diario se olvidaría un martes cualquiera
// y la métrica de ocupación quedaría inflada sin que nadie se entere.
import { state } from './state.js';
import { esc, fmtDate, fmtTime, orderedTherapists, getTherapist, apptsOverlap,
         toTimeInput, parseTimeInput } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { dbSaveBlock, dbDeleteBlock } from './auth.js';
import { hasPermission } from './permissions.js';
import { validateMinChars, showFieldError, clearFieldError, clearAllErrors } from './validators.js';

const CAMPOS = ['bk-therapist','bk-date','bk-start','bk-end','bk-motivo'];

// Id del bloqueo en edición (null = alta). Igual que editingTherapistId, pero local al módulo:
// nadie fuera de acá lo necesita.
let editingBlockId = null;

const $ = id => document.getElementById(id);

export function getBlock(id){ return state.blocks.find(b=>String(b.id)===String(id))||null; }

// Citas que el bloqueo pisaría. Solo conf y pend: una 'no asistió' ya no ocupa la franja (mismo
// criterio que bloqueaSlot en los conflictos de agenda), así que no impide bloquear.
export function citasEnFranja(thId, ds, startH, endH){
  const dur=(endH-startH)*60;
  return state.appointments.filter(a=>
    a && a.date===ds &&
    String(a.therapistId)===String(thId) &&
    (a.status==='conf'||a.status==='pend') &&
    apptsOverlap(a,{hour:startH,duration:dur})
  );
}

function fillTherapistSelect(sel){
  const opts=orderedTherapists();
  sel.innerHTML=opts.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
}

// "Día completo" = el turno ENTERO del terapeuta elegido. No es un flag guardado: se traduce a
// start_h/end_h en el momento, porque el turno puede cambiar después y el bloqueo tiene que seguir
// diciendo qué horas se perdieron ese día, no recalcularse solo.
export function toggleBlockAllDay(){
  const on=$('bk-allday')?.checked;
  const st=$('bk-start'), en=$('bk-end');
  if(!st||!en) return;
  if(on){
    const th=getTherapist($('bk-therapist').value);
    if(th){ st.value=toTimeInput(th.startH); en.value=toTimeInput(th.endH); }
  }
  st.disabled=!!on; en.disabled=!!on;
  clearFieldError('bk-start'); clearFieldError('bk-end');
}

// Cambiar de terapeuta con "día completo" marcado tiene que re-leer SU turno: si no, el bloqueo
// del terapeuta de tarde se guardaría con el horario del de la mañana.
export function onBlockTherapistChange(){
  if($('bk-allday')?.checked) toggleBlockAllDay();
}

export function openBlockModal(thId=null, ds=null, blockId=null){
  if(!hasPermission('manageBlocks')){toastErr('No tienes permisos para bloquear franjas.');return;}
  if(!state.therapists.length){toastErr('No hay terapeutas registrados.');return;}
  const sel=$('bk-therapist');
  fillTherapistSelect(sel);
  clearAllErrors(CAMPOS);

  const blk=blockId?getBlock(blockId):null;
  editingBlockId=blk?blk.id:null;
  $('bk-modal-title').textContent=blk?'Editar bloqueo':'Bloquear franja';

  const th=getTherapist(blk?blk.therapistId:thId)||orderedTherapists()[0];
  sel.value=th.id;
  $('bk-date').value=blk?blk.date:(ds||fmtDate(state.currentDate));
  $('bk-motivo').value=blk?blk.motivo:'';

  // Alta: el caso normal es el día entero (vacaciones, curso), así que arranca marcado. En
  // edición manda lo guardado: día completo solo si cubre exactamente el turno.
  const allDay=blk?(blk.startH<=th.startH&&blk.endH>=th.endH):true;
  $('bk-allday').checked=allDay;
  $('bk-start').value=toTimeInput(blk?blk.startH:th.startH);
  $('bk-end').value=toTimeInput(blk?blk.endH:th.endH);
  $('bk-start').disabled=allDay; $('bk-end').disabled=allDay;

  $('bk-delete').style.display=blk?'':'none';
  $('block-modal').classList.add('open');
}

export async function saveBlock(){
  if(!hasPermission('manageBlocks')){toastErr('No tienes permisos para bloquear franjas.');return;}
  clearAllErrors(CAMPOS);

  const thId=$('bk-therapist').value;
  const ds=$('bk-date').value;
  const motivo=$('bk-motivo').value.trim();
  const startH=parseTimeInput($('bk-start').value);
  const endH=parseTimeInput($('bk-end').value);

  if(!thId){showFieldError('bk-therapist','Selecciona un terapeuta');toastErr('Selecciona un terapeuta.');return;}
  if(!ds){showFieldError('bk-date','Elegí la fecha');toastErr('Elegí la fecha del bloqueo.');return;}
  if(startH==null){showFieldError('bk-start','Hora inválida');toastErr('Hora de inicio inválida.');return;}
  if(endH==null){showFieldError('bk-end','Hora inválida');toastErr('Hora de fin inválida.');return;}
  if(endH<=startH){showFieldError('bk-end','Debe ser mayor que el inicio');toastErr('La hora de fin debe ser mayor que la de inicio.');return;}
  const mot=validateMinChars(motivo,3);
  if(!mot.valid){showFieldError('bk-motivo',mot.error);toastErr('Escribí el motivo del bloqueo (mínimo 3 caracteres).');return;}

  // El sistema NUNCA borra ni mueve citas para hacerle lugar a un bloqueo: si la franja ya está
  // vendida, se reagenda primero y después se bloquea. Es la única decisión que no puede tomar
  // sola la app — atrás de cada cita hay un paciente al que hay que avisarle.
  const choque=citasEnFranja(thId,ds,startH,endH);
  if(choque.length){
    toastErr(`El bloqueo choca con ${choque.length} cita${choque.length!==1?'s':''}. Reagendalas primero.`);
    return;
  }

  const editing=editingBlockId;
  const prev=editing?{...getBlock(editing)}:null;
  const d={therapistId:thId,date:ds,startH,endH,motivo};

  let _b;
  if(editing){
    _b=getBlock(editing);
    if(!_b){toastErr('No se encontró el bloqueo.');return;}
    Object.assign(_b,d);
  } else {
    _b={id:'blk-tmp-'+Date.now(),...d};
    state.blocks.push(_b);
  }
  const tempId=_b.id;
  editingBlockId=null;
  window._app.closeModal('block-modal');
  refresh();

  try {
    const {data,error}=await dbSaveBlock(editing?_b:{...d});
    if(error){
      // Rollback: en edición vuelve el bloqueo anterior; en alta se saca la fila fantasma.
      if(editing) Object.assign(_b,prev);
      else state.blocks=state.blocks.filter(x=>x.id!==tempId);
      refresh();
      toastErr('Error al guardar el bloqueo: '+error.message);
      return;
    }
    if(!editing&&data) _b.id=data.id;
    refresh();
    toastOk(editing?'Bloqueo actualizado':'Franja bloqueada');
  } catch(e){
    if(editing) Object.assign(_b,prev);
    else state.blocks=state.blocks.filter(x=>x.id!==tempId);
    refresh();
    toastErr('Error de conexión al guardar el bloqueo.');
  }
}

export function deleteBlock(id){
  if(!hasPermission('manageBlocks')){toastErr('No tienes permisos para eliminar bloqueos.');return;}
  const b=getBlock(id??editingBlockId);
  if(!b){toastErr('No se encontró el bloqueo.');return;}
  const th=getTherapist(b.therapistId);
  if(!confirm(`¿Quitar el bloqueo de ${th?th.name:'este terapeuta'} del ${b.date} (${fmtTime(b.startH)}–${fmtTime(b.endH)})?`)) return;
  state.blocks=state.blocks.filter(x=>String(x.id)!==String(b.id));
  editingBlockId=null;
  window._app.closeModal('block-modal');
  refresh();
  dbDeleteBlock(b.id);
}

// Botón "Eliminar" del modal: siempre opera sobre el bloqueo abierto.
export function deleteBlockFromModal(){ deleteBlock(editingBlockId); }

// Lo que un bloqueo cambia en pantalla: la grilla (donde se pinta) y el informe semanal (donde
// entra en la capacidad). Nada más — el bloqueo no toca pacientes, sesiones ni facturación.
function refresh(){
  window._app.renderGrid();
  if(state.currentTab==='informes'&&state.informesSubTab==='semanal') window._app.renderSemanal();
}
