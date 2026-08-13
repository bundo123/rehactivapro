import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, getTherapist, getColor, therapistHours, COLOR_OPTIONS, orderedTherapists,
         parseHourVal, hourValToTime, therapistDeleteBlock, textoBloqueoBorrado } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { dbDeleteTherapist, markLocalChange } from './auth.js';
import { updateFacturaBadge } from './agenda.js';
import { hasPermission } from './permissions.js';

export function renderTherapistList() {
  const q=(document.getElementById('therapist-search')?.value||'').toLowerCase();
  const filtered=orderedTherapists().filter(t=>!q||t.name.toLowerCase().includes(q)||t.spec.toLowerCase().includes(q));
  document.getElementById('therapist-list').innerHTML=filtered.map(th=>{
    const c=getColor(th.colorId);
    // Cada botón se RENDERIZA solo con su permiso (ausente, no deshabilitado): la secretaria
    // gestiona el equipo pero no ve la baja.
    const acciones=[
      hasPermission('createTherapist')?`<button class="th-btn" onclick="openEditTherapist('${th.id}')">Editar</button>`:'',
      hasPermission('deleteTherapist')?`<button class="th-btn del" onclick="deleteTherapist('${th.id}')">Eliminar</button>`:'',
    ].join('');
    return`<div class="th-manage-row">
      <div class="avatar" style="background:${c.border}22;color:${c.text};width:36px;height:36px;font-size:12px">${esc(th.initials)}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:#1a1917">${esc(th.name)}</div>
        <div style="font-size:11px;color:#6b6a64">${esc(th.spec)}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">Turno: ${th.startH}:00–${th.endH}:00 · ${therapistHours(th).length} h/día</div>
      </div>
      ${acciones?`<div class="th-actions">${acciones}</div>`:''}
    </div>`;
  }).join('')||'<div style="color:#6b6a64;font-size:13px">Sin terapeutas registrados.</div>';
}

export function renderColorPicker() {
  document.getElementById('color-picker').innerHTML=COLOR_OPTIONS.map(c=>`<div class="color-swatch${c.id===state.selectedColor?' selected':''}" style="background:${c.border}" onclick="selectColor('${c.id}')"></div>`).join('');
}

export function selectColor(id) {
  state.selectedColor=id; renderColorPicker();
}

export function openTherapistModal(ed=null) {
  state.editingTherapistId=ed||null;
  document.getElementById('th-modal-title').textContent=ed?'Editar terapeuta':'Agregar terapeuta';
  if(ed){
    const th=getTherapist(ed);
    if(!th){toastErr('No se encontró el terapeuta.');return;}
    document.getElementById('th-name').value=th.name;
    document.getElementById('th-spec').value=th.spec;
    document.getElementById('th-start').value=th.startH;
    document.getElementById('th-end').value=th.endH;
    document.getElementById('th-work-start').value=hourValToTime(th.workStart);
    document.getElementById('th-work-end').value=hourValToTime(th.workEnd);
    document.getElementById('th-order').value=th.displayOrder??'';
    state.selectedColor=th.colorId;
  } else {
    document.getElementById('th-name').value='';
    document.getElementById('th-spec').value='';
    document.getElementById('th-start').value=7;
    document.getElementById('th-end').value=13;
    document.getElementById('th-work-start').value='';
    document.getElementById('th-work-end').value='';
    document.getElementById('th-order').value='';
    state.selectedColor='ca';
  }
  renderColorPicker();
  document.getElementById('therapist-modal').classList.add('open');
}

export function openEditTherapist(id) {
  openTherapistModal(id);
}

export async function saveTherapist() {
  if(!hasPermission('createTherapist')){toastErr('No tienes permisos para gestionar terapeutas.');return;}
  const name=document.getElementById('th-name').value.trim();if(!name){toastErr('Ingresa el nombre.');return;}
  const s=parseInt(document.getElementById('th-start').value),e=parseInt(document.getElementById('th-end').value);
  if(e<=s){toastErr('La hora de fin debe ser mayor.');return;}
  // Horario laboral: opcional y completo o vacío (un solo extremo no define un rango).
  const ws=document.getElementById('th-work-start').value.trim();
  const we=document.getElementById('th-work-end').value.trim();
  if(!!ws!==!!we){toastErr('Completá las dos horas del horario, o dejá ambas vacías.');return;}
  if(ws&&we&&we<=ws){toastErr('La hora de fin del horario debe ser mayor.');return;}
  const ordRaw=String(document.getElementById('th-order').value).trim();
  if(ordRaw!==''&&!/^\d+$/.test(ordRaw)){toastErr('El orden en agenda debe ser un número entero.');return;}
  const ord=ordRaw===''?null:parseInt(ordRaw,10);
  const init=name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  const spec=document.getElementById('th-spec').value;
  // Se congela acá: si el usuario reabre el modal mientras el upsert está en vuelo, el rollback
  // de abajo tiene que seguir hablando de ESTE guardado, no del que quedó abierto.
  const editing=state.editingTherapistId;
  // Snapshot para el rollback de la edición (en creación se saca la fila fantasma y listo).
  let prev=null;
  if(editing){
    const t=getTherapist(editing);
    if(!t){toastErr('No se encontró el terapeuta.');return;}
    prev={name:t.name,spec:t.spec,startH:t.startH,endH:t.endH,colorId:t.colorId,initials:t.initials,
          displayOrder:t.displayOrder,workStart:t.workStart,workEnd:t.workEnd};
    t.name=name;t.spec=spec;t.startH=s;t.endH=e;t.colorId=state.selectedColor;t.initials=init;
    t.displayOrder=ord;t.workStart=parseHourVal(ws);t.workEnd=parseHourVal(we);
  } else {
    state.therapists.push({id:++state.thCounter,name,initials:init,spec,startH:s,endH:e,colorId:state.selectedColor,
      displayOrder:ord,workStart:parseHourVal(ws),workEnd:parseHourVal(we)});
  }
  const _th=editing?getTherapist(editing):state.therapists[state.therapists.length-1];
  window._app.closeModal('therapist-modal'); renderTherapistList(); window._app.renderGrid();
  const tempId=_th.id;
  try {
    const payload={name:_th.name,initials:_th.initials,spec:_th.spec,start_h:_th.startH,end_h:_th.endH,color_id:_th.colorId,
      display_order:_th.displayOrder,work_start:ws||null,work_end:we||null};
    if(typeof _th.id==='string') payload.id=_th.id;
    markLocalChange('therapists');
    const {data,error}=await supa.from('therapists').upsert(payload).select().single();
    if(error){
      if(editing) Object.assign(_th,prev);
      else state.therapists=state.therapists.filter(x=>x.id!==_th.id);
      renderTherapistList(); window._app.renderGrid();
      toastErr('Error al guardar terapeuta: '+error.message);
    }
    else {
      if(!editing) _th.id=data.id;
      renderTherapistList(); window._app.renderGrid();
      toastOk((editing?'Terapeuta actualizado':'Terapeuta guardado')+' correctamente');
    }
  } catch(e){
    if(editing){
      Object.assign(_th,prev);
      renderTherapistList(); window._app.renderGrid();
    } else if(_th.id===tempId){
      state.therapists=state.therapists.filter(x=>x.id!==tempId);
      renderTherapistList(); window._app.renderGrid();
    }
    toastErr('Error de conexión al guardar terapeuta.');
  }
  updateFacturaBadge();
}

// Ya NO borra citas en cascada: perder la agenda histórica de un terapeuta al darlo de baja
// destruía facturación y seguimiento. Con una sola cita (pasada o futura) el borrado se bloquea y
// hay que reasignarlas primero; el confirm queda solo para el caso limpio de cero citas.
export async function deleteTherapist(id) {
  if(!hasPermission('deleteTherapist')){toastErr('No tienes permisos para eliminar terapeutas.');return;}
  const bloqueo=therapistDeleteBlock(state.appointments,id);
  if(bloqueo){toastErr(textoBloqueoBorrado(bloqueo));return;}
  if(!confirm('¿Eliminar este terapeuta? No tiene citas registradas.'))return;
  state.therapists=state.therapists.filter(t=>t.id!==id);
  renderTherapistList(); window._app.renderGrid();
  try {
    await dbDeleteTherapist(id);
  } catch(e){toastErr('Error de conexión al eliminar terapeuta.');}
  updateFacturaBadge();
}
