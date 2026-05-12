import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, getTherapist, getColor, therapistHours, COLOR_OPTIONS } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { dbDeleteTherapist } from './auth.js';
import { updateFacturaBadge } from './agenda.js';

export function renderTherapistList() {
  const q=(document.getElementById('therapist-search')?.value||'').toLowerCase();
  const filtered=state.therapists.filter(t=>!q||t.name.toLowerCase().includes(q)||t.spec.toLowerCase().includes(q));
  document.getElementById('therapist-list').innerHTML=filtered.map(th=>{
    const c=getColor(th.colorId);
    return`<div class="th-manage-row">
      <div class="avatar" style="background:${c.border}22;color:${c.text};width:36px;height:36px;font-size:12px">${esc(th.initials)}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:#1a1917">${esc(th.name)}</div>
        <div style="font-size:11px;color:#6b6a64">${esc(th.spec)}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">Turno: ${th.startH}:00–${th.endH}:00 · ${therapistHours(th).length} h/día</div>
      </div>
      <div class="th-actions">
        <button class="th-btn" onclick="openEditTherapist('${th.id}')">Editar</button>
        <button class="th-btn del" onclick="deleteTherapist('${th.id}')">Eliminar</button>
      </div>
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
    state.selectedColor=th.colorId;
  } else {
    document.getElementById('th-name').value='';
    document.getElementById('th-spec').value='';
    document.getElementById('th-start').value=7;
    document.getElementById('th-end').value=13;
    state.selectedColor='ca';
  }
  renderColorPicker();
  document.getElementById('therapist-modal').classList.add('open');
}

export function openEditTherapist(id) {
  openTherapistModal(id);
}

export async function saveTherapist() {
  const name=document.getElementById('th-name').value.trim();if(!name){alert('Ingresa el nombre.');return;}
  const s=parseInt(document.getElementById('th-start').value),e=parseInt(document.getElementById('th-end').value);
  if(e<=s){alert('La hora de fin debe ser mayor.');return;}
  const init=name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  if(state.editingTherapistId){
    const t=getTherapist(state.editingTherapistId);
    t.name=name;t.spec=document.getElementById('th-spec').value;t.startH=s;t.endH=e;t.colorId=state.selectedColor;t.initials=init;
  } else {
    state.therapists.push({id:++state.thCounter,name,initials:init,spec:document.getElementById('th-spec').value,startH:s,endH:e,colorId:state.selectedColor});
  }
  const _th=state.editingTherapistId?getTherapist(state.editingTherapistId):state.therapists[state.therapists.length-1];
  window._app.closeModal('therapist-modal'); renderTherapistList(); window._app.renderGrid();
  try {
    const payload={name:_th.name,initials:_th.initials,spec:_th.spec,start_h:_th.startH,end_h:_th.endH,color_id:_th.colorId};
    if(typeof _th.id==='string') payload.id=_th.id;
    const {data,error}=await supa.from('therapists').upsert(payload).select().single();
    if(error) toastErr('Error al guardar terapeuta: '+error.message);
    else {
      if(!state.editingTherapistId) _th.id=data.id;
      renderTherapistList(); window._app.renderGrid();
      toastOk((state.editingTherapistId?'Terapeuta actualizado':'Terapeuta guardado')+' correctamente');
    }
  } catch(e){toastErr('Error de conexión al guardar terapeuta.');}
  updateFacturaBadge();
}

export async function deleteTherapist(id) {
  if(!confirm('¿Eliminar este terapeuta? Se borrarán también todas sus citas.'))return;
  state.therapists=state.therapists.filter(t=>t.id!==id);
  state.appointments=state.appointments.filter(a=>a.therapistId!==id);
  renderTherapistList(); window._app.renderGrid();
  try {
    if(typeof id==='string'){
      const {error:e1}=await supa.from('appointments').delete().eq('therapist_id',id);
      if(e1) toastErr('Error al borrar citas del terapeuta: '+e1.message);
    }
    await dbDeleteTherapist(id);
  } catch(e){toastErr('Error de conexión al eliminar terapeuta.');}
  updateFacturaBadge();
}
