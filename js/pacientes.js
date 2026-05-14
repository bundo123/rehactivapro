import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor, COLOR_OPTIONS, patientMatchesSearch, highlightMatch } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { hasEvalInicial } from './resumen.js';
import { hasPermission } from './permissions.js';

export const PATIENTS_PER_PAGE = 20;
let patientSearchTimeout = null;

export function setupPatientSearch() {
  const input=document.getElementById('patient-search');
  if(!input||input.dataset.searchReady)return;
  input.dataset.searchReady='1';
  input.addEventListener('input',()=>{
    clearTimeout(patientSearchTimeout);
    if(!input.value.trim()){
      state.patientPage=1;
      renderPatients();
      return;
    }
    patientSearchTimeout=setTimeout(()=>{
      state.patientPage=1;
      renderPatients();
    },300);
  });
}

export function goToPatientPage(page) {
  state.patientPage=Math.max(1,page);
  renderPatients();
  document.getElementById('patient-table-card')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPatientPagination(totalPages,totalRows,start,end) {
  const el=document.getElementById('patient-pagination');
  if(!el)return;
  if(!totalRows){
    el.innerHTML='';
    return;
  }
  const page=state.patientPage;
  const pages=[];
  for(let i=1;i<=totalPages;i++){
    if(i===1||i===totalPages||Math.abs(i-page)<=1)pages.push(i);
    else if(pages[pages.length-1]!=='...')pages.push('...');
  }
  const btn=(label,target,disabled=false,active=false)=>
    `<button class="pager-btn${active?' active':''}" ${disabled?'disabled':''} onclick="goToPatientPage(${target})">${label}</button>`;
  el.innerHTML=`
    <div class="pager-info">Mostrando ${start+1}-${end} de ${totalRows} pacientes</div>
    <div class="pager-controls">
      ${btn('&laquo; Anterior',page-1,page<=1)}
      ${pages.map(p=>p==='...'?'<span class="pager-ellipsis">...</span>':btn(p,p,false,p===page)).join('')}
      ${btn('Siguiente &raquo;',page+1,page>=totalPages)}
    </div>`;
}

export function populateDiagList() {
  const diags=[...new Set(state.patients.filter(p=>p.diag&&p.diag!=='Sin diagnóstico').map(p=>p.diag))];
  state.protocols.forEach(p=>p.name&&diags.push(p.name));
  const unique=[...new Set(diags)].sort();
  const dl=document.getElementById('diag-list');
  if(dl) dl.innerHTML=unique.map(d=>`<option value="${d}">`).join('');
}

export function openPatientModal() {
  document.getElementById('pm-doctor').innerHTML='<option value="">Sin doctor referente</option>'+state.doctors.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  document.getElementById('patient-modal').classList.add('open');
}

export async function savePatient() {
  if(state.editingPatientId){
    if(!hasPermission('editPatient')){toastErr('No tienes permisos para editar pacientes.');return;}
  } else {
    if(!hasPermission('createPatient')){toastErr('No tienes permisos para crear pacientes.');return;}
  }
  if(state.editingPatientId){
    const p=getPatient(state.editingPatientId);if(!p)return;
    p.name=document.getElementById('pm-name').value.trim();
    p.age=parseInt(document.getElementById('pm-age').value)||35;
    p.cedula=document.getElementById('pm-cedula').value||'';
    p.tel=document.getElementById('pm-tel').value||'';
    p.email=document.getElementById('pm-email').value||'';
    p.dir=document.getElementById('pm-dir').value||'';
    p.diag=document.getElementById('pm-diag').value||'';
    p.doctorId=document.getElementById('pm-doctor').value||null;
    p.sessions=parseInt(document.getElementById('pm-sessions').value)||10;
    p.status=document.getElementById('pm-status').value;
    window._app.closeModal('patient-modal');
    renderPatients();
    document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
    state.editingPatientId=null;
    if(typeof p.id==='string'){
      const {error}=await supa.from('patients').update({
        name:p.name,age:p.age,cedula:p.cedula,tel:p.tel,email:p.email,
        dir:p.dir,diag:p.diag,doctor_id:p.doctorId||null,sessions:p.sessions,status:p.status
      }).eq('id',p.id);
      if(error) toastErr('Error al actualizar paciente: '+error.message);
      else toastOk('Paciente actualizado correctamente');
    }
    return;
  }
  const name=document.getElementById('pm-name').value.trim();
  if(!name){alert('Ingresa el nombre.');return;}
  state.patients.push({id:++state.patCounter,name,
    age:parseInt(document.getElementById('pm-age').value)||35,
    cedula:document.getElementById('pm-cedula').value||'',
    tel:document.getElementById('pm-tel').value||'',
    email:document.getElementById('pm-email').value||'',
    dir:document.getElementById('pm-dir').value||'',
    diag:document.getElementById('pm-diag').value||'Sin diagnóstico',
    therapistId:null,
    doctorId:document.getElementById('pm-doctor').value||null,
    sessions:parseInt(document.getElementById('pm-sessions').value)||12,
    done:0,status:document.getElementById('pm-status').value,log:[],
    billing:{sesPerFactura:parseInt(document.getElementById('global-spf').value)||5,facturas:[],pendientes:parseInt(document.getElementById('pm-billing-start').value)||0}
  });
  const _p=state.patients[state.patients.length-1];
  window._app.closeModal('patient-modal');
  try {
    const {data,error}=await supa.from('patients').insert({
      name:_p.name,age:_p.age,cedula:_p.cedula,tel:_p.tel,email:_p.email,dir:_p.dir,diag:_p.diag,
      doctor_id:_p.doctorId||null,sessions:_p.sessions,done:0,status:_p.status,
      billing_ses_per_factura:_p.billing.sesPerFactura,billing_pendientes:_p.billing.pendientes
    }).select().single();
    if(error) toastErr('Error al guardar paciente: '+error.message);
    else {
      const {loadAll}=window._app;
	      await loadAll(true); renderPatients();
      toastOk('Paciente guardado correctamente');
    }
  } catch(e){toastErr('Error de conexión al guardar paciente.');}
  ['pm-name','pm-diag','pm-cedula','pm-tel','pm-email','pm-dir'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pm-billing-start').value='0';
  state.editingPatientId=null;
  document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
}

function renderPatientsOld() {
  const q=(document.getElementById('patient-search').value||'').toLowerCase();
  let f=state.patients.filter(p=>p.name.toLowerCase().includes(q)||p.diag.toLowerCase().includes(q));
  f.sort((a,b)=>{
    const aEval=hasEvalInicial(a),bEval=hasEvalInicial(b);
    if(!aEval&&bEval) return -1;if(aEval&&!bEval) return 1;
    return a.name.localeCompare(b.name);
  });
  const canDelete = hasPermission('deletePatient');
  const canEval = hasPermission('evalInicial');
  document.getElementById('patient-tbody').innerHTML=f.map(p=>{
    const doc=p.doctorId?getDoctor(p.doctorId):null;
    const pct=Math.round(p.done/p.sessions*100);
    const bc=p.status==='active'?'pg':p.status==='alta'?'pb':'pa';
    const bt=p.status==='active'?'Activo':p.status==='alta'?'Alta':'Pendiente';
    const adh=p.log.length>0?Math.round(p.log.filter(s=>s.status==='asistió').length/p.log.length*100):0;
    const ac=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
    const dc=doc
      ?`<span style="display:inline-flex;align-items:center;gap:5px;background:${doc.color}18;border:1px solid ${doc.color}44;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:500;color:${doc.color};white-space:nowrap">${esc(doc.name)}</span>`
      :'<span style="font-size:10px;color:#6b6a64;font-style:italic">Independiente</span>';
    const delBtn = canDelete ? `<button class='th-btn del' style='font-size:9px;padding:2px 6px' onclick='deletePatient("${p.id}")'>Eliminar</button>` : '';
    const evalBtn = canEval && !hasEvalInicial(p) ? `<button class='th-btn' style='font-size:9px;padding:2px 6px;background:rgba(224,80,80,.1);color:#E24B4A;border-color:rgba(224,80,80,.3)' onclick='openEvalInicial("${p.id}")'>Eval. inicial</button>` : '';
    return`<tr>
      <td style="font-weight:500;color:#1a1917">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${esc(p.name)}
          ${!hasEvalInicial(p)?'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:#fee2e2;color:#991b1b">⚠️ Sin eval.</span>':'<span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:99px;background:#dcfce7;color:#166534">✓ Eval. ok</span>'}
        </div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class='th-btn' style='font-size:9px;padding:2px 6px' onclick='openEditPatient("${p.id}")'>Editar</button>
          ${delBtn}${evalBtn}
        </div>
      </td>
      <td style="color:#6b6a64;font-size:11px">${esc(p.diag)}</td>
      <td style="font-size:11px">${dc}</td>
      <td><div style="font-size:11px;margin-bottom:3px;color:#6b6a64">${p.done}/${p.sessions} (${pct}%)</div><div class="bar-wrap prog-mini"><div class="bar-fill" style="width:${pct}%;background:#1D9E75"></div></div></td>
      <td><span style="font-size:13px;font-weight:500;color:${ac}">${adh}%</span></td>
      <td><span class="pill ${bc}">${bt}</span></td>
    </tr>`;
  }).join('');
}

export function renderPatients() {
  const q=(document.getElementById('patient-search')?.value||'').trim();
  let f=state.patients.filter(p=>patientMatchesSearch(p,q));
  f.sort((a,b)=>{
    const aEval=hasEvalInicial(a),bEval=hasEvalInicial(b);
    if(!aEval&&bEval) return -1;if(aEval&&!bEval) return 1;
    return a.name.localeCompare(b.name);
  });
  const totalRows=f.length;
  const totalPages=Math.max(1,Math.ceil(totalRows/PATIENTS_PER_PAGE));
  state.patientPage=Math.min(Math.max(1,state.patientPage||1),totalPages);
  const start=(state.patientPage-1)*PATIENTS_PER_PAGE;
  const paginated=f.slice(start,start+PATIENTS_PER_PAGE);
  const tbody=document.getElementById('patient-tbody');
  const canDelete = hasPermission('deletePatient');
  const canEval = hasPermission('evalInicial');
  if(!totalRows){
    tbody.innerHTML=`<tr><td colspan="7" class="empty-patient-row">
      No se encontraron pacientes con "${esc(q)}".
      ${hasPermission('createPatient')?'<button class="add-btn" onclick="openPatientModal()">Crear nuevo paciente</button>':''}
    </td></tr>`;
    renderPatientPagination(0,0,0,0);
    return;
  }
  tbody.innerHTML=paginated.map(p=>{
    const doc=p.doctorId?getDoctor(p.doctorId):null;
    const sessions=Math.max(1,p.sessions||0);
    const pct=Math.round((p.done||0)/sessions*100);
    const bc=p.status==='active'?'pg':p.status==='alta'?'pb':'pa';
    const bt=p.status==='active'?'Activo':p.status==='alta'?'Alta':'Pendiente';
    const log=p.log||[];
    const adh=log.length>0?Math.round(log.filter(s=>s.status==='asistiÃ³').length/log.length*100):0;
    const ac=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
    const dc=doc
      ?`<span style="display:inline-flex;align-items:center;gap:5px;background:${doc.color}18;border:1px solid ${doc.color}44;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:500;color:${doc.color};white-space:nowrap">${esc(doc.name)}</span>`
      :'<span style="font-size:10px;color:#6b6a64;font-style:italic">Independiente</span>';
    const delBtn = canDelete ? `<button class='th-btn del' style='font-size:9px;padding:2px 6px' onclick='deletePatient("${p.id}")'>Eliminar</button>` : '';
    const evalBtn = canEval && !hasEvalInicial(p) ? `<button class='th-btn' style='font-size:9px;padding:2px 6px;background:rgba(224,80,80,.1);color:#E24B4A;border-color:rgba(224,80,80,.3)' onclick='openEvalInicial("${p.id}")'>Eval. inicial</button>` : '';
    return`<tr>
      <td style="font-weight:500;color:#1a1917">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${highlightMatch(p.name,q)}
          ${!hasEvalInicial(p)?'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:#fee2e2;color:#991b1b">âš ï¸ Sin eval.</span>':'<span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:99px;background:#dcfce7;color:#166534">âœ“ Eval. ok</span>'}
        </div>
        <div class="patient-contact-line">${[p.tel,p.email].filter(Boolean).map(v=>highlightMatch(v,q)).join(' Â· ')}</div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class='th-btn' style='font-size:9px;padding:2px 6px' onclick='openEditPatient("${p.id}")'>Editar</button>
          ${delBtn}${evalBtn}
        </div>
      </td>
      <td style="color:#6b6a64;font-size:11px">${highlightMatch(p.diag,q)}</td>
      <td style="font-size:11px">${dc}</td>
      <td><div style="font-size:11px;margin-bottom:3px;color:#6b6a64">${p.done}/${p.sessions} (${pct}%)</div><div class="bar-wrap prog-mini"><div class="bar-fill" style="width:${pct}%;background:#1D9E75"></div></div></td>
      <td><span style="font-size:13px;font-weight:500;color:${ac}">${adh}%</span></td>
      <td style="font-size:11px;color:#6b6a64">${highlightMatch(p.cedula||'—',q)}</td>
      <td><span class="pill ${bc}">${bt}</span></td>
    </tr>`;
  }).join('');
  renderPatientPagination(totalPages,totalRows,start,Math.min(start+PATIENTS_PER_PAGE,totalRows));
}

export async function deletePatient(id) {
  if(!hasPermission('deletePatient')){toastErr('No tienes permisos para eliminar pacientes.');return;}
  if(!confirm('¿Eliminar este paciente? Se eliminarán también sus citas y cobros.')) return;
  state.patients=state.patients.filter(p=>p.id!==id);
  state.appointments=state.appointments.filter(a=>a.patientId!==id);
  renderPatients(); window._app.renderGrid();
  if(typeof id==='string'){
    toastInfo('Eliminando...');
    await supa.from('session_log').delete().eq('patient_id',id);
    await supa.from('cobros').delete().eq('patient_id',id);
    await supa.from('appointments').delete().eq('patient_id',id);
    const {error}=await supa.from('patients').delete().eq('id',id);
    if(error) toastErr('Error al eliminar paciente: '+error.message);
    else toastOk('Paciente eliminado correctamente');
  } else {
    toastInfo('Paciente eliminado de la sesión (no estaba guardado en la base de datos).');
  }
}

export function openEditPatient(id) {
  const p=getPatient(id);if(!p)return;
  document.getElementById('pm-doctor').innerHTML='<option value="">Independiente</option>'+state.doctors.map(d=>`<option value="${esc(d.id)}" ${d.id===p.doctorId?'selected':''}>${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  document.getElementById('pm-name').value=p.name;
  document.getElementById('pm-age').value=p.age||'';
  document.getElementById('pm-cedula').value=p.cedula||'';
  document.getElementById('pm-tel').value=p.tel||'';
  document.getElementById('pm-email').value=p.email||'';
  document.getElementById('pm-dir').value=p.dir||'';
  document.getElementById('pm-diag').value=p.diag||'';
  document.getElementById('pm-sessions').value=p.sessions||10;
  document.getElementById('pm-status').value=p.status||'active';
  document.getElementById('pm-billing-start').value=p.billing?.pendientes||0;
  state.editingPatientId=id;
  populateDiagList();
  document.querySelector('#patient-modal h3').textContent='Editar paciente';
  document.getElementById('patient-modal').classList.add('open');
}

// ── NUEVO EPISODIO ──
let _nePatientId = null;

export function nuevoEpisodio(patientId) {
  _nePatientId=patientId;
  const p=getPatient(patientId);if(!p)return;
  document.getElementById('ne-patient-name').textContent=p.name+' · Episodio anterior: '+(p.diag||'Sin diagnóstico');
  document.getElementById('ne-diag').value='';
  document.getElementById('ne-sessions').value=12;
  document.querySelector('input[name="ne-eval"][value="si"]').checked=true;
  populateDiagList();
  document.getElementById('nuevo-episodio-modal').classList.add('open');
}

export async function guardarNuevoEpisodio() {
  if(!_nePatientId)return;
  const p=getPatient(_nePatientId);if(!p)return;
  const newDiag=document.getElementById('ne-diag').value.trim();
  const newSessions=parseInt(document.getElementById('ne-sessions').value)||12;
  const abrirEval=document.querySelector('input[name="ne-eval"]:checked').value==='si';
  if(!newDiag){toastErr('Ingresa el nuevo diagnóstico');return;}
  const oldDiag=p.diag;
  await supa.from('session_log').insert({
    patient_id:_nePatientId,date:fmtDate(new Date()),type:'Fin de episodio',
    hour:'00:00',status:'asistió',pain_before:0,pain_after:0,
    note:`Episodio anterior: ${oldDiag} · ${p.done||0} sesiones completadas`
  });
  const {error}=await supa.from('patients').update({diag:newDiag,sessions:newSessions,done:0,status:'active',billing_pendientes:0}).eq('id',_nePatientId);
  if(error){toastErr('Error: '+error.message);return;}
  p.diag=newDiag; p.sessions=newSessions; p.done=0; p.status='active';
  if(p.billing) p.billing.pendientes=0;
  window._app.closeModal('nuevo-episodio-modal');
  toastOk('✓ Nuevo episodio iniciado — '+newDiag);
  renderPatients();
  window._app.renderPatientReportSelect();
  setTimeout(()=>{
    const sel=document.getElementById('patient-rpt-select');
    if(sel){sel.value=String(_nePatientId);window._app.updateEpisodes();}
  },100);
  if(abrirEval) setTimeout(()=>openEvalInicial(_nePatientId),400);
}

// ── EVALUACIÓN INICIAL ──
let _evalPatientId = null;
let _evEvaVal = 5;

export function openEvalInicial(patientId) {
  if(!hasPermission('evalInicial')){toastErr('No tienes permisos para registrar evaluaciones.');return;}
  _evalPatientId=patientId;
  const p=getPatient(patientId);
  document.getElementById('eval-modal-patient-name').textContent=p?p.name+' · '+(p.diag||'Sin diagnóstico'):'';
  ['ev-ant-fam','ev-ant-per','ev-anamnesis','ev-obs','ev-insp','ev-palp','ev-movilidad','ev-fuerza','ev-notas'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  ['ev-cervical','ev-dorsal','ev-lumbar','ev-sup','ev-inf'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.checked=false;
  });
  document.getElementById('ev-pedido-no').checked=true;
  _evEvaVal=5; renderEvEva();
  document.getElementById('eval-modal').classList.add('open');
}

export function renderEvEva() {
  const container=document.getElementById('ev-eva-btns');if(!container)return;
  const colors=['#22c55e','#4ade80','#86efac','#a3e635','#facc15','#fb923c','#f97316','#ef4444','#dc2626','#b91c1c','#991b1b'];
  container.innerHTML='';
  for(let i=0;i<=10;i++){
    const btn=document.createElement('button');
    btn.type='button'; btn.textContent=i;
    const active=i===_evEvaVal;
    btn.style.cssText='flex:1;padding:8px 2px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;transition:all .1s;'
      +'border:2px solid '+(active?colors[i]:'transparent')+';'
      +'background:'+(active?colors[i]+'33':'#1a1917')+';'
      +'color:'+(active?colors[i]:'#6b6a64');
    btn.onclick=()=>{_evEvaVal=i;document.getElementById('ev-eva-val').value=i;renderEvEva();};
    container.appendChild(btn);
  }
}

export async function saveEvalInicial() {
  if(!_evalPatientId)return;
  const anamnesis=document.getElementById('ev-anamnesis').value.trim();
  if(!anamnesis){document.getElementById('ev-anamnesis').style.borderColor='rgba(224,80,80,.6)';toastErr('La anamnesis es obligatoria');return;}
  document.getElementById('ev-anamnesis').style.borderColor='';
  const zonas=['ev-cervical','ev-dorsal','ev-lumbar','ev-sup','ev-inf']
    .filter(id=>document.getElementById(id)?.checked)
    .map(id=>({'ev-cervical':'Columna cervical','ev-dorsal':'Columna dorsal','ev-lumbar':'Columna lumbar','ev-sup':'Miembro superior','ev-inf':'Miembro inferior'})[id]).join(', ');
  const nota=[
    document.getElementById('ev-ant-fam').value?'Ant. familiares: '+document.getElementById('ev-ant-fam').value:'',
    document.getElementById('ev-ant-per').value?'Ant. personales: '+document.getElementById('ev-ant-per').value:'',
    zonas?'Zonas: '+zonas:'',
    document.getElementById('ev-obs').value?'Observación: '+document.getElementById('ev-obs').value:'',
    document.getElementById('ev-insp').value?'Inspección: '+document.getElementById('ev-insp').value:'',
    document.getElementById('ev-palp').value?'Palpación: '+document.getElementById('ev-palp').value:'',
    document.getElementById('ev-movilidad').value?'Movilidad: '+document.getElementById('ev-movilidad').value:'',
    document.getElementById('ev-fuerza').value?'Fuerza: '+document.getElementById('ev-fuerza').value:'',
    document.querySelector('input[name="ev-pedido"]:checked')?.value==='si'?'Pedido médico: SÍ':'',
    document.getElementById('ev-notas').value||''
  ].filter(Boolean).join(' | ');
  const eva=_evEvaVal;
  const {error}=await supa.from('session_log').insert({
    patient_id:_evalPatientId,date:fmtDate(new Date()),type:'Evaluación inicial',
    hour:'00:00',status:'asistió',pain_before:eva,pain_after:eva,
    note:anamnesis+(nota?' | '+nota:'')
  });
  if(error){toastErr('Error al guardar: '+error.message);return;}
  const p=getPatient(_evalPatientId);
  if(p){
    if(!p.log) p.log=[];
    p.log.unshift({date:fmtDate(new Date()),type:'Evaluación inicial',hour:'00:00',status:'asistió',pb:eva,pa:eva,note:anamnesis+(nota?' | '+nota:'')});
  }
  window._app.closeModal('eval-modal');
  renderPatients();
  window._app.renderResumen();
  toastOk('✓ Evaluación inicial guardada');
}
