import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, getDoctor, DOC_COLORS } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { dbDeleteDoctor } from './auth.js';

export function renderDoctorsList() {
  const q=(document.getElementById('doctor-search')?.value||'').toLowerCase();
  const filtDocs=state.doctors.filter(d=>!q||d.name.toLowerCase().includes(q)||d.spec.toLowerCase().includes(q));
  document.getElementById('doctors-list').innerHTML=`<div class="full-card">${filtDocs.map(d=>`
    <div class="th-manage-row">
      <div style="width:36px;height:36px;border-radius:50%;background:${d.color}22;border:1px solid ${d.color}44;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:${d.color};flex-shrink:0">${esc(d.name.split(' ').pop()[0])}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:#1a1917">${esc(d.name)}</div>
        <div style="font-size:11px;color:#6b6a64">${esc(d.spec)}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">${esc(d.email||'')}${d.tel?' · '+esc(d.tel):''}</div>
      </div>
      <div class="th-actions">
        <button class="th-btn" onclick="openDoctorModal('${d.id}')">Editar</button>
        <button class="th-btn del" onclick="deleteDoctor('${d.id}')">Eliminar</button>
      </div>
    </div>`).join('')||'<div style="color:#6b6a64;font-size:13px">Sin doctores registrados.</div>'}</div>`;
}

export function renderDocColorPicker() {
  document.getElementById('doc-color-picker').innerHTML=DOC_COLORS.map(c=>`<div class="color-swatch${c===state.selectedDocColor?' selected':''}" style="background:${c}" onclick="selectDocColor('${c}')"></div>`).join('');
}

export function selectDocColor(c) {
  state.selectedDocColor=c; renderDocColorPicker();
}

export function openDoctorModal(eid=null) {
  state.editingDocId=eid;
  document.getElementById('doc-modal-title').textContent=eid?'Editar doctor':'Agregar doctor referente';
  if(eid){
    const d=getDoctor(eid);
    document.getElementById('doc-name').value=d.name;
    document.getElementById('doc-spec').value=d.spec;
    document.getElementById('doc-email').value=d.email||'';
    document.getElementById('doc-tel').value=d.tel||'';
    state.selectedDocColor=d.color;
  } else {
    ['doc-name','doc-spec','doc-email','doc-tel'].forEach(id=>document.getElementById(id).value='');
    state.selectedDocColor=DOC_COLORS[0];
  }
  renderDocColorPicker();
  document.getElementById('doctor-modal').classList.add('open');
}

export async function saveDoctor() {
  if(!hasPermission('createDoctor')){toastErr('No tienes permisos para gestionar doctores.');return;}
  const name=document.getElementById('doc-name').value.trim();if(!name){alert('Ingresa el nombre.');return;}
  const d={name,spec:document.getElementById('doc-spec').value,email:document.getElementById('doc-email').value,tel:document.getElementById('doc-tel').value,color:state.selectedDocColor};
  if(state.editingDocId) Object.assign(getDoctor(state.editingDocId),d);
  else state.doctors.push({id:++state.docCounter,...d});
  const _d=state.editingDocId?getDoctor(state.editingDocId):state.doctors[state.doctors.length-1];
  window._app.closeModal('doctor-modal'); renderDoctorsList(); window._app.renderRefLegend();
  try {
    const payload={name:_d.name,spec:_d.spec,email:_d.email,tel:_d.tel,color:_d.color};
    if(typeof _d.id==='string') payload.id=_d.id;
    const {data,error}=await supa.from('doctors').upsert(payload).select().single();
    if(error) toastErr('Error al guardar doctor: '+error.message);
    else {
      if(!state.editingDocId) _d.id=data.id;
      renderDoctorsList(); window._app.renderRefLegend();
      toastOk((state.editingDocId?'Doctor actualizado':'Doctor guardado')+' correctamente');
    }
  } catch(e){toastErr('Error de conexión al guardar doctor.');}
}

export async function deleteDoctor(id) {
  if(!hasPermission('createDoctor')){toastErr('No tienes permisos para eliminar doctores.');return;}
  if(!confirm('¿Eliminar este doctor? Sus pacientes quedarán como independientes.'))return;
  state.doctors=state.doctors.filter(d=>d.id!==id);
  state.patients.forEach(p=>{if(p.doctorId===id) p.doctorId=null;});
  renderDoctorsList(); window._app.renderRefLegend();
  try {
    if(typeof id==='string'){
      const {error:e1}=await supa.from('patients').update({doctor_id:null}).eq('doctor_id',id);
      if(e1) toastErr('Error al desasociar pacientes: '+e1.message);
    }
    await dbDeleteDoctor(id);
  } catch(e){toastErr('Error de conexión al eliminar doctor.');}
}

export function renderNotifList() {
  document.getElementById('notif-list').innerHTML=state.notifSettings.map(n=>`
    <div class="notif-row">
      <label class="toggle-wrap">
        <input type="checkbox" ${n.on?'checked':''} onchange="toggleNotif('${n.id}',this.checked)">
        <div class="toggle-track"></div>
        <div class="toggle-thumb"></div>
      </label>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:#1a1917">${n.icon} ${n.label}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">${n.desc}</div>
        <span class="pill ${n.on?'pg':'pgr'}" style="margin-top:5px">${n.on?'Activo':'Inactivo'}</span>
      </div>
    </div>`).join('');
}

export function toggleNotif(id,v) {
  const n=state.notifSettings.find(x=>x.id===id);
  if(n){n.on=v;renderNotifList();}
}

export function showDoctoresTab(n,btn) {
  document.getElementById('config-doctores').style.display=n==='referentes'?'':'none';
  document.getElementById('config-notificaciones').style.display=n==='notificaciones'?'':'none';
  document.querySelectorAll('#tab-doctores .sub-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  if(n==='referentes')renderDoctorsList();if(n==='notificaciones')renderNotifList();
}
