import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor, COLOR_OPTIONS, patientMatchesSearch, highlightMatch, getFullAge, doneActual, pendientesActual } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { hasEvalInicial } from './resumen.js';
import { hasPermission } from './permissions.js';
import { validateRequired, validateMinChars, validatePositiveInt, validateCedulaEcuatoriana, validateTelefono, validateEmail, showFieldError, clearFieldError, clearAllErrors, createDirtyTracker, validateBirthDate } from './validators.js';

const _patientDirty = createDirtyTracker();
const _patNameFn = (v) => { const r = validateRequired(v); return r.valid ? validateMinChars(v, 3) : r; };
const _patSessionsFn = (v) => validatePositiveInt(v, { min: 1, max: 100, fieldName: 'Sesiones' });

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
  _patientDirty.reset();
  clearAllErrors(['pm-name', 'pm-cedula', 'pm-tel', 'pm-email', 'pm-birth', 'pm-sessions']);
  // pm-age (hidden, retrocompat) DEBE limpiarse: si no, queda la edad del último paciente editado
  // y savePatient la escribiría al paciente nuevo (fuga de datos entre pacientes).
  ['pm-name','pm-diag','pm-cedula','pm-tel','pm-email','pm-dir','pm-age','pm-protocol'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pm-birth').value='';
  document.getElementById('pm-sessions').value='12';
  document.getElementById('pm-status').value='active';
  document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
  state.editingPatientId=null;
  document.getElementById('pm-doctor').innerHTML='<option value="">Sin doctor referente</option>'+state.doctors.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  document.getElementById('pm-protocol').innerHTML='<option value="">Sin protocolo</option>'+state.protocols.map(pr=>`<option value="${esc(pr.id)}">${esc(pr.name)}</option>`).join('');
  document.getElementById('patient-modal').classList.add('open');
}

// Auto-relleno al elegir protocolo (D2): precarga diagnóstico desde el NOMBRE del protocolo y
// sesiones desde el protocolo, SOLO si están vacíos ('12' = default de sesiones). Queda editable.
export function onPatientProtocolChange() {
  const sel=document.getElementById('pm-protocol');
  const prot=state.protocols.find(x=>String(x.id)===sel.value);
  if(!prot)return;
  const diagEl=document.getElementById('pm-diag');
  if(!diagEl.value.trim()) diagEl.value=prot.name;
  const sesEl=document.getElementById('pm-sessions');
  if(!sesEl.value.trim()||sesEl.value==='12') sesEl.value=prot.sessions;
}

export async function savePatient() {
  const _cedula = document.getElementById('pm-cedula').value.trim();
  const _toValidate = [
    { id: 'pm-name',     fn: _patNameFn,              always: true },
    { id: 'pm-cedula',   fn: validateCedulaEcuatoriana, always: false },
    { id: 'pm-tel',      fn: validateTelefono,        always: false },
    { id: 'pm-email',    fn: validateEmail,           always: false },
    { id: 'pm-birth',    fn: validateBirthDate,       always: false },
    { id: 'pm-sessions', fn: _patSessionsFn,          always: true },
  ];
  let _hasErrors = false;
  _toValidate.forEach(({ id, fn, always }) => {
    if (always || _patientDirty.has(id)) {
      const r = fn(document.getElementById(id).value);
      if (!r.valid) { showFieldError(id, r.error); _hasErrors = true; }
      else clearFieldError(id);
    }
  });
  if (_hasErrors) return;
  if(state.editingPatientId){
    if(!hasPermission('editPatient')){toastErr('No tienes permisos para editar pacientes.');return;}
  } else {
    if(!hasPermission('createPatient')){toastErr('No tienes permisos para crear pacientes.');return;}
  }
  if(state.editingPatientId){
    const p=getPatient(state.editingPatientId);if(!p)return;
    p.name=document.getElementById('pm-name').value.trim();
    p.age=parseInt(document.getElementById('pm-age').value)||null;
    p.birth_date=document.getElementById('pm-birth').value||null;
    p.cedula=document.getElementById('pm-cedula').value||'';
    p.tel=document.getElementById('pm-tel').value||'';
    p.email=document.getElementById('pm-email').value||'';
    p.dir=document.getElementById('pm-dir').value||'';
    p.diag=document.getElementById('pm-diag').value||'';
    p.doctorId=document.getElementById('pm-doctor').value||null;
    p.protocolId=document.getElementById('pm-protocol').value||null;
    p.sessions=parseInt(document.getElementById('pm-sessions').value)||10;
    p.status=document.getElementById('pm-status').value;
    window._app.closeModal('patient-modal');
    if (!_cedula) toastInfo('Paciente guardado sin cédula. No podrás emitir facturas electrónicas hasta agregarla.');
    renderPatients();
    document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
    state.editingPatientId=null;
    if(typeof p.id==='string'){
      const {error}=await supa.from('patients').update({
        name:p.name,age:p.age,birth_date:p.birth_date,cedula:p.cedula,tel:p.tel,email:p.email,
        dir:p.dir,diag:p.diag,doctor_id:p.doctorId||null,protocol_id:p.protocolId||null,sessions:p.sessions,status:p.status
      }).eq('id',p.id);
      if(error) toastErr('Error al actualizar paciente: '+error.message);
      else { toastOk('Paciente actualizado correctamente'); if(!p.birth_date) toastInfo('Sin fecha de nacimiento. Algunos reportes mostrarán edad como "no registrada".'); }
    }
    return;
  }
  const name=document.getElementById('pm-name').value.trim();
  state.patients.push({id:++state.patCounter,name,
    age:parseInt(document.getElementById('pm-age').value)||null,
    birth_date:document.getElementById('pm-birth').value||null,
    cedula:document.getElementById('pm-cedula').value||'',
    tel:document.getElementById('pm-tel').value||'',
    email:document.getElementById('pm-email').value||'',
    dir:document.getElementById('pm-dir').value||'',
    diag:document.getElementById('pm-diag').value||'Sin diagnóstico',
    therapistId:null,
    doctorId:document.getElementById('pm-doctor').value||null,
    protocolId:document.getElementById('pm-protocol').value||null,
    sessions:parseInt(document.getElementById('pm-sessions').value)||12,
    done:0,status:document.getElementById('pm-status').value,log:[],
    billing:{sesPerFactura:parseInt(document.getElementById('global-spf').value)||5,facturas:[]}
  });
  const _p=state.patients[state.patients.length-1];
  window._app.closeModal('patient-modal');
  try {
    const {data,error}=await supa.from('patients').insert({
      name:_p.name,age:_p.age,birth_date:_p.birth_date,cedula:_p.cedula,tel:_p.tel,email:_p.email,dir:_p.dir,diag:_p.diag,
      doctor_id:_p.doctorId||null,protocol_id:_p.protocolId||null,sessions:_p.sessions,done:0,status:_p.status,
      billing_ses_per_factura:_p.billing.sesPerFactura,billing_pendientes:0
    }).select().single();
    if(error) toastErr('Error al guardar paciente: '+error.message);
    else {
      const {loadAll}=window._app;
	      await loadAll(true); renderPatients();
      toastOk('Paciente guardado correctamente');
      if (!_cedula) toastInfo('Paciente guardado sin cédula. No podrás emitir facturas electrónicas hasta agregarla.');
      if (!_p.birth_date) toastInfo('Sin fecha de nacimiento. Algunos reportes mostrarán edad como "no registrada".');
    }
  } catch(e){toastErr('Error de conexión al guardar paciente.');}
  // Incluye pm-age para que el reset post-guardado no deje la edad pegada al siguiente alta.
  ['pm-name','pm-diag','pm-cedula','pm-tel','pm-email','pm-dir','pm-age','pm-protocol'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pm-birth').value='';
  state.editingPatientId=null;
  document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
}

export function toggleEvalFilter() {
  state.patientEvalFilter = !state.patientEvalFilter;
  state.patientPage = 1;
  const btn = document.getElementById('eval-filter-btn');
  if(btn) btn.classList.toggle('active', state.patientEvalFilter);
  renderPatients();
}

export function setPatientStatusFilter(filter) {
  state.patientStatusFilter = filter;
  state.patientPage = 1;
  document.querySelectorAll('.pat-status-filter').forEach(b=>b.classList.toggle('active', b.dataset.filter===filter));
  renderPatients();
}

export function verPaciente(id) {
  window._app.showTab('paciente_rpt');
  const sel=document.getElementById('patient-rpt-select');
  if(sel){ sel.value=String(id); window._app.updateEpisodes(); }
}

export function renderPatients() {
  const q=(document.getElementById('patient-search')?.value||'').trim();
  let f=state.patients.filter(p=>patientMatchesSearch(p,q));
  if(state.patientEvalFilter) f=f.filter(p=>!hasEvalInicial(p));
  const sf=state.patientStatusFilter||'all';
  if(sf==='active') f=f.filter(p=>p.status==='active');
  else if(sf==='inactive') f=f.filter(p=>p.status!=='active');
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
    tbody.innerHTML=`<tr><td colspan="6" class="empty-patient-row">
      No se encontraron pacientes con "${esc(q)}".
      ${hasPermission('createPatient')?'<button class="add-btn" onclick="openPatientModal()">Crear nuevo paciente</button>':''}
    </td></tr>`;
    renderPatientPagination(0,0,0,0);
    return;
  }
  tbody.innerHTML=paginated.map(p=>{
    const doc=p.doctorId?getDoctor(p.doctorId):null;
    const statusBadge=p.status==='active'?''
      :p.status==='alta'?'<span class="pill pgr pl-badge">Alta médica</span>'
      :'<span class="pill pa pl-badge">Pendiente</span>';
    const evalBadge=!hasEvalInicial(p)?'<span class="pill pa pl-badge">Sin eval.</span>':'';
    const dc=doc
      ?`<span class="doc-pill" title="${esc(doc.name)}" style="background:${doc.color}18;border-color:${doc.color}44;color:${doc.color}">${esc(doc.name)}</span>`
      :'<span class="pl-indep">Independiente</span>';
    const ageStr=getFullAge(p);
    const ageCell=ageStr==='Sin edad'?'<span class="pl-muted">Sin edad</span>':esc(ageStr);
    const emailCell=p.email?highlightMatch(p.email,q):'<span class="pl-muted">—</span>';
    const delBtn = canDelete ? `<button class='th-btn del pl-act-btn' onclick='deletePatient("${p.id}")'>Eliminar</button>` : '';
    const evalBtn = canEval && !hasEvalInicial(p) ? `<button class='th-btn pl-act-btn' onclick='openEvalInicial("${p.id}")'>Eval. inicial</button>` : '';
    return`<tr>
      <td class="pl-name"><span class="pname-row"><span class="pl-pname" title="${esc(p.name)}">${highlightMatch(p.name,q)}</span>${statusBadge}${evalBadge}</span></td>
      <td class="pl-age" data-label="Edad">${ageCell}</td>
      <td class="pl-ced" data-label="Cédula">${highlightMatch(p.cedula||'—',q)}</td>
      <td class="pl-email" data-label="Email"${p.email?` title="${esc(p.email)}"`:''}>${emailCell}</td>
      <td class="pl-doc" data-label="Doctor">${dc}</td>
      <td class="pl-action-cell" data-label="Acciones">
        <div class="pl-actions">
          <button class='th-btn pl-act-btn' onclick='openEditPatient("${p.id}")'>Editar</button>${delBtn}${evalBtn}<button class="ver-btn pl-act-btn" onclick='verPaciente("${p.id}")'>Ver</button>
        </div>
      </td>
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
  _patientDirty.reset();
  clearAllErrors(['pm-name', 'pm-cedula', 'pm-tel', 'pm-email', 'pm-birth', 'pm-sessions']);
  const p=getPatient(id);if(!p)return;
  document.getElementById('pm-doctor').innerHTML='<option value="">Independiente</option>'+state.doctors.map(d=>`<option value="${esc(d.id)}" ${d.id===p.doctorId?'selected':''}>${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  document.getElementById('pm-protocol').innerHTML='<option value="">Sin protocolo</option>'+state.protocols.map(pr=>`<option value="${esc(pr.id)}" ${pr.id===p.protocolId?'selected':''}>${esc(pr.name)}</option>`).join('');
  document.getElementById('pm-name').value=p.name;
  document.getElementById('pm-age').value=p.age||'';
  document.getElementById('pm-birth').value=p.birth_date||'';
  document.getElementById('pm-cedula').value=p.cedula||'';
  document.getElementById('pm-tel').value=p.tel||'';
  document.getElementById('pm-email').value=p.email||'';
  document.getElementById('pm-dir').value=p.dir||'';
  document.getElementById('pm-diag').value=p.diag||'';
  document.getElementById('pm-sessions').value=p.sessions||10;
  document.getElementById('pm-status').value=p.status||'active';
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
  const hoy=fmtDate(new Date());
  const finNote=`Episodio anterior: ${oldDiag} · ${doneActual(p)} sesiones completadas`;
  // El marcador 'Fin de episodio' en session_log ES la frontera del episodio: a partir de su fecha,
  // doneActual/pendientesActual cuentan desde cero. No hace falta resetear columnas en memoria/DB.
  const {data:insFin}=await supa.from('session_log').insert({
    patient_id:_nePatientId,date:hoy,type:'Fin de episodio',
    hour:'00:00',status:'asistió',pain_before:0,pain_after:0,note:finNote
  }).select('id').single();
  const {error}=await supa.from('patients').update({diag:newDiag,sessions:newSessions,status:'active'}).eq('id',_nePatientId);
  if(error){toastErr('Error: '+error.message);return;}
  p.diag=newDiag; p.sessions=newSessions; p.status='active';
  // El log en memoria aún no tiene la fila recién insertada (el wrapper supa anti-eco no la reenvía).
  // Agregarla para que doneActual/pendientesActual reflejen el corte de inmediato (sin esperar recarga).
  if(!p.log) p.log=[];
  p.log.push({id:insFin?.id??null,date:hoy,type:'Fin de episodio',hour:'00:00',status:'asistió',pb:0,pa:0,note:finNote});
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

export function initPatientValidation() {
  const fields = [
    { id: 'pm-name',     fn: _patNameFn,              req: true },
    { id: 'pm-cedula',   fn: validateCedulaEcuatoriana, req: false },
    { id: 'pm-tel',      fn: validateTelefono,        req: false },
    { id: 'pm-email',    fn: validateEmail,           req: false },
    { id: 'pm-birth',    fn: validateBirthDate,       req: false },
    { id: 'pm-sessions', fn: _patSessionsFn,          req: true },
  ];
  fields.forEach(({ id, fn, req }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      if (req || _patientDirty.has(id)) {
        const r = fn(el.value);
        if (!r.valid) showFieldError(id, r.error);
        else clearFieldError(id);
      }
    });
    el.addEventListener('input', () => {
      _patientDirty.mark(id);
      if (el.classList.contains('input-error') && fn(el.value).valid) clearFieldError(id);
    });
  });
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
  const {data:ins,error}=await supa.from('session_log').insert({
    patient_id:_evalPatientId,date:fmtDate(new Date()),type:'Evaluación inicial',
    hour:'00:00',status:'asistió',pain_before:eva,pain_after:eva,
    note:anamnesis+(nota?' | '+nota:'')
  }).select('id').single();
  if(error){toastErr('Error al guardar: '+error.message);return;}
  const p=getPatient(_evalPatientId);
  if(p){
    if(!p.log) p.log=[];
    p.log.unshift({id:ins?.id??null,date:fmtDate(new Date()),type:'Evaluación inicial',hour:'00:00',status:'asistió',pb:eva,pa:eva,note:anamnesis+(nota?' | '+nota:'')});
  }
  window._app.closeModal('eval-modal');
  renderPatients();
  window._app.renderResumen();
  toastOk('✓ Evaluación inicial guardada');
}
