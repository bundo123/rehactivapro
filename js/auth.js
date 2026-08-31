import { supa } from './supabase-client.js';
import { state } from './state.js';
import { fmtDate, fmtTime, normHour, mapTherapistRow, tipoSesion, validarPassNueva } from './utils.js';
import { toastErr, toastOk } from './toast.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadProfile() {
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return false;
  state.currentUserId = user.id;
  const { data, error } = await supa.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (error || !data || !data.role) {
    toastErr('Tu cuenta no tiene rol asignado. Contacta al administrador.');
    await supa.auth.signOut();
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loading-overlay').style.display = 'none';
    state.currentUserRole = null; state.currentUserProfile = null;
    return false;
  }
  state.currentUserRole = data.role;
  state.currentUserProfile = { name: data.full_name || user.email, email: user.email, role: data.role };
  return true;
}

export const DEFAULT_PROTOCOLS = [
  {id:'p1',name:'POP Manguito de los Rotadores Hombro Derecho',diag:'manguito,rotadores,hombro derecho,POP hombro derecho',sessions:20,freq:5,alta:'Rango articular completo, fuerza 80% lado contralateral, EVA 0-1',def:'Postoperatorio de reparación quirúrgica del manguito rotador.',img:'shoulder'},
  {id:'p2',name:'Coxartrosis Derecha',diag:'coxartrosis,artrosis cadera,cadera derecha',sessions:15,freq:3,alta:'Marcha sin dolor, mejora de rangos articulares, funcionalidad en AVD',def:'Desgaste del cartílago de la articulación coxofemoral derecha.',img:'hip'},
  {id:'p3',name:'Tendinitis de Quervain Bilateral',diag:'quervain,tendinitis quervain,bilateral quervain',sessions:12,freq:3,alta:'Sin dolor en maniobra de Finkelstein, retorno a actividades manuales',def:'Inflamación de los tendones abductores del pulgar.',img:'hand'},
  {id:'p4',name:'Tendinitis Bíceps Izquierdo',diag:'tendinitis biceps,biceps izquierdo,bicipital',sessions:10,freq:3,alta:'EVA 0-1, fuerza simétrica, retorno deportivo o laboral',def:'Inflamación del tendón del bíceps braquial.',img:'arm'},
  {id:'p5',name:'Cefalea Tensional',diag:'cefalea,tensional,cefalea tensional,cervicogénica',sessions:8,freq:2,alta:'Reducción de frecuencia e intensidad de episodios en 70%, control postural',def:'Dolor de cabeza de origen muscular y postural.',img:'head'},
  {id:'p6',name:'Epicondilitis Lateral Izquierda',diag:'epicondilitis,codo de tenista,epicóndilo,lateral izquierda',sessions:12,freq:3,alta:'Sin dolor en prueba de Cozen, fuerza de agarre simétrica',def:'Inflamación de los extensores del carpo en su inserción epicondílea.',img:'elbow'},
  {id:'p7',name:'Lesión Manguito Rotadores Hombro Izquierdo',diag:'manguito rotadores,hombro izquierdo,lesión manguito',sessions:18,freq:4,alta:'Arco de movimiento completo sin dolor, fuerza 85% contralateral',def:'Desgarro parcial o total de los tendones del manguito rotador.',img:'shoulder'},
  {id:'p8',name:'Discopatía L4-S1',diag:'discopatía,L4,S1,lumbar,disco lumbar',sessions:15,freq:3,alta:'EVA 0-2, retorno laboral, control motor lumbo-pélvico',def:'Degeneración o herniación discal en segmento lumbar bajo.',img:'spine'},
  {id:'p9',name:'Artrosis de Cadera Derecha',diag:'artrosis cadera,coxartrosis derecha,osteoartritis cadera',sessions:15,freq:3,alta:'Mejora funcional en escaleras y marcha, dolor controlado',def:'Degeneración articular de la cadera derecha.',img:'hip'},
  {id:'p10',name:'Rotura Tendón de Aquiles Derecho',diag:'aquiles,tendón aquiles,rotura aquiles',sessions:25,freq:5,alta:'Marcha simétrica, fuerza gemelar 90%, retorno deportivo gradual',def:'Ruptura total o parcial del tendón de Aquiles.',img:'ankle'},
  {id:'p11',name:'Prótesis Hombro Izquierdo',diag:'prótesis hombro,artroplastia hombro,hombro izquierdo prótesis',sessions:24,freq:5,alta:'Movilidad funcional, independencia en AVD, fuerza progresiva',def:'Rehabilitación post-artroplastia de hombro.',img:'shoulder'},
  {id:'p12',name:'Radiculopatía + Ciática Izquierda',diag:'radiculopatía,ciática,ciática izquierda,radicular',sessions:12,freq:3,alta:'Abolición de dolor irradiado, test neurológicos negativos',def:'Compresión o irritación de raíces nerviosas lumbares.',img:'spine'},
  {id:'p13',name:'Meniscectomía Rodilla Derecha',diag:'meniscectomía,menisco derecho,rodilla derecha menisco',sessions:20,freq:5,alta:'Cuádriceps simétrico, propiocepción completa, retorno deportivo',def:'Post-quirúrgico de extracción meniscal.',img:'knee'},
  {id:'p14',name:'POP Menisco Derecho',diag:'POP menisco,postoperatorio menisco,menisco derecho POP',sessions:18,freq:4,alta:'ROM completo, sin derrame, funcionalidad deportiva',def:'Postoperatorio de reparación meniscal.',img:'knee'},
  {id:'p15',name:'Condromalacia Rotuliana Bilateral',diag:'condromalacia,rotuliana,bilateral,condromalacia rotuliana',sessions:14,freq:3,alta:'Sin dolor en escaleras, cuádriceps simétrico, retorno deportivo',def:'Degeneración del cartílago rotuliano.',img:'knee'},
];

export async function loadAll(force=false) {
  const last=state.lastLoaded?.all||0;
  if(!force&&state.dataLoaded&&Date.now()-last<CACHE_TTL_MS){
    return {cached:true};
  }
  try {
    const [th,doc,pat,appt,prot,cob,inf] = await Promise.all([
      supa.from('therapists').select('*').order('created_at'),
      supa.from('doctors').select('*').order('created_at'),
      supa.from('patients').select('*,session_log(*)').order('created_at'),
      supa.from('appointments').select('*,patients(name)').order('date').order('hour'),
      supa.from('protocols').select('*').order('created_at'),
      supa.from('cobros').select('*').order('created_at'),
      supa.from('informes').select('*').eq('deleted',false).order('created_at',{ascending:false}),
    ]);
    for(const q of [th,doc,pat,appt,prot,cob,inf]){ if(q.error) throw q.error; }
    state.therapists = (th.data||[]).map(mapTherapistRow);
    state.doctors = (doc.data||[]).map(r=>({id:r.id,name:r.name,spec:r.spec||'',email:r.email||'',tel:r.tel||'',color:r.color||'#E24B4A'}));
    const cobData = cob.data||[];
    state.patients = (pat.data||[]).map(r=>({
      id:r.id,createdAt:r.created_at||null,name:r.name,age:r.age||null,birth_date:r.birth_date||null,cedula:r.cedula||'',tel:r.tel||'',email:r.email||'',dir:r.dir||'',
      diag:r.diag||'Sin diagnóstico',cie10:r.cie10||null,cie10Desc:r.cie10_desc||null,
      therapistId:r.therapist_id,doctorId:r.doctor_id,
      sessions:r.sessions||10,status:r.status||'active',protocolId:r.protocol_id||null,
      log:(r.session_log||[]).map(s=>({id:s.id,date:s.date,type:s.type,hour:s.hour,status:s.status,pb:s.pain_before,pa:s.pain_after,note:s.note||'',tags:s.tags||[],therapistId:s.therapist_id||null})),
      // done/pendientes NO se leen de columnas (vestigiales): derivan de session_log vía doneActual/pendientesActual.
      billing:{sesPerFactura:r.billing_ses_per_factura||5,
        facturas:cobData.filter(c=>c.patient_id===r.id).map(c=>({id:c.cobro_ref,n:c.n_sessions,fecha:c.date,estado:'cobrada'}))}
    }));
    state.protocols = (prot.data||[]).map(r=>({id:r.id,name:r.name,diag:r.diag_keywords||'',sessions:r.sessions||20,freq:r.freq||3,alta:r.discharge_criteria||'',
      img:r.img||'',def:r.definition||'',clinicalContext:r.clinical_context||''}));
    state.appointments = (appt.data||[]).map(r=>({id:r.id,date:r.date,therapistId:r.therapist_id,patientId:r.patient_id,patientName:(r.patients&&r.patients.name)||null,hour:r.hour,duration:r.duration||60,type:tipoSesion(r.type),status:r.status||'pend',note:r.note||'',location:r.location||'centro'}));
    state.informes = (inf.data||[]).map(r=>({id:r.id,patientId:r.patient_id,createdAt:r.created_at,createdBy:r.created_by,numero:r.numero,episodio:r.episodio,fechaEmision:r.fecha_emision,narrativa:r.narrativa||[],snapshot:r.snapshot||{}}));
    if(!state.protocols.length) state.protocols = [...DEFAULT_PROTOCOLS];

    let maxFact = 0;
    cobData.forEach(c=>{
      const m = String(c.cobro_ref||'').match(/^F(\d+)$/);
      if(m){const n=parseInt(m[1],10);if(n>maxFact)maxFact=n;}
    });
    state.facturaCounter = maxFact;

    // normHour en construcción Y consulta: el hour de session_log llega 'HH:MM:SS' desde DB
    // y fmtTime(a.hour) produce 'H:MM' — sin normalizar, hasSession nunca matchea tras recargar.
    const sessionDates = new Set();
    state.patients.forEach(p=>{
      (p.log||[]).forEach(s=>{sessionDates.add(p.id+'|'+s.date+'|'+normHour(s.hour));});
    });
    state.appointments.forEach(a=>{
      a.hasSession = sessionDates.has(String(a.patientId)+'|'+a.date+'|'+normHour(fmtTime(a.hour)));
    });
    const now=Date.now();
    state.dataLoaded=true;
    state.lastLoaded={all:now,therapists:now,doctors:now,patients:now,appointments:now,protocols:now,cobros:now};
    window._app?.updateLastLoadedLabels?.();
    return {cached:false};
  } catch(e) {
    console.warn('Error cargando datos:', e.message);
    toastErr('Error de conexión con la base de datos. Verifica tu internet.');
    return {cached:false,error:e};
  }
}

// ── Auto-logout por inactividad ──
// 15 min sin interacción → cierre de sesión (datos clínicos en pantallas compartidas de recepción).
// Solo corre con sesión iniciada: se arranca en cada entrada (login, restore, recovery) y se
// detiene en el logout manual.
const IDLE_LOGOUT_MS = 15 * 60 * 1000;
const IDLE_EVENTS = ['pointerdown','keydown','touchstart'];
let _idleTimer = null;

function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => doLogout(), IDLE_LOGOUT_MS);
}

export function startIdleLogout() {
  stopIdleLogout();
  IDLE_EVENTS.forEach(ev => document.addEventListener(ev, _resetIdleTimer, { passive: true }));
  _resetIdleTimer();
}

export function stopIdleLogout() {
  IDLE_EVENTS.forEach(ev => document.removeEventListener(ev, _resetIdleTimer));
  clearTimeout(_idleTimer);
  _idleTimer = null;
}

export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  if(!email||!pass){err.textContent='Ingresa tu correo y contraseña.';return;}
  btn.disabled=true; btn.textContent='Ingresando...'; err.textContent='';
  const {error} = await supa.auth.signInWithPassword({email,password:pass});
  if(error){
    err.textContent='Correo o contraseña incorrectos.';
    btn.disabled=false; btn.textContent='Ingresar';
  } else {
    document.getElementById('login-screen').style.display='none';
    document.getElementById('loading-overlay').style.display='flex';
    const profileOk = await loadProfile();
    if (!profileOk) { btn.disabled=false; btn.textContent='Ingresar'; return; }
    await loadAll();
    document.getElementById('loading-overlay').style.display='none';
    const {renderGrid,updateResumenBadge,updateFacturaBadge,subscribeRealtime,applyRolePermissions} = window._app;
    renderGrid(); updateResumenBadge(); updateFacturaBadge();
    applyRolePermissions();
    subscribeRealtime();
    startIdleLogout();
  }
}

export async function doLogout() {
  stopIdleLogout();
  const {unsubscribeRealtime} = window._app;
  await unsubscribeRealtime();
  await supa.auth.signOut();
  location.reload();
}

// ── Password recovery ──
export function showForgotPassword() {
  document.getElementById('ls-login').style.display = 'none';
  document.getElementById('ls-forgot').style.display = '';
  document.getElementById('forgot-email').value = document.getElementById('login-email').value;
  const msg = document.getElementById('forgot-msg');
  msg.textContent = ''; msg.style.color = '';
  document.getElementById('login-subtitle').textContent = 'Recuperación de contraseña';
}

export function showLoginForm() {
  document.getElementById('ls-forgot').style.display = 'none';
  document.getElementById('ls-login').style.display = '';
  document.getElementById('login-subtitle').textContent = 'Gestión clínica · Acceso restringido';
}

export async function doSendRecoveryEmail() {
  const email = document.getElementById('forgot-email').value.trim();
  const btn = document.getElementById('forgot-btn');
  const msg = document.getElementById('forgot-msg');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.style.color = ''; msg.textContent = 'Ingresa un email válido.'; return;
  }
  btn.disabled = true; btn.textContent = 'Enviando...'; msg.textContent = '';
  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) console.warn('[Recovery] resetPasswordForEmail:', error.message);
  btn.disabled = false; btn.textContent = 'Enviar instrucciones';
  msg.style.color = '#1D9E75';
  msg.textContent = 'Si el email existe, recibirás instrucciones en breve.';
}

export async function doSetNewPassword() {
  const pass = document.getElementById('rec-pass').value;
  const pass2 = document.getElementById('rec-pass2').value;
  const btn = document.getElementById('rec-btn');
  const err = document.getElementById('rec-error');
  const invalida = validarPassNueva(pass, pass2);
  if (invalida) { err.textContent = invalida; return; }
  btn.disabled = true; btn.textContent = 'Guardando...'; err.textContent = '';
  const { error } = await supa.auth.updateUser({ password: pass });
  if (error) {
    btn.disabled = false; btn.textContent = 'Guardar contraseña';
    const isExpired = error.status === 401 || (error.message || '').toLowerCase().includes('expir');
    err.textContent = isExpired
      ? 'El enlace expiró. Solicita uno nuevo.'
      : 'Error de conexión. Intenta de nuevo.';
    return;
  }
  window.history.replaceState(null, '', window.location.pathname);
  document.getElementById('recovery-screen').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'flex';
  const profileOk = await loadProfile();
  if (!profileOk) return;
  await loadAll();
  document.getElementById('loading-overlay').style.display = 'none';
  const { renderGrid, updateResumenBadge, updateFacturaBadge, subscribeRealtime, applyRolePermissions } = window._app;
  renderGrid(); updateResumenBadge(); updateFacturaBadge();
  applyRolePermissions(); subscribeRealtime();
  startIdleLogout();
  toastOk('Contraseña actualizada correctamente.');
}

export async function cancelRecovery() {
  await supa.auth.signOut();
  window.history.replaceState(null, '', window.location.pathname);
  document.getElementById('recovery-screen').style.display = 'none';
  document.getElementById('rec-pass').value = '';
  document.getElementById('rec-pass2').value = '';
  document.getElementById('rec-error').textContent = '';
  document.getElementById('login-screen').style.display = 'flex';
}

// ── Cambio de contraseña CON sesión activa ──
// Camino distinto al de recuperación: acá no hay email de por medio, el usuario ya está dentro.
export function openPasswordModal() {
  ['pw-current','pw-new','pw-new2'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pw-error').textContent = '';
  const btn = document.getElementById('pw-btn');
  btn.disabled = false; btn.textContent = 'Guardar contraseña';
  document.getElementById('password-modal').classList.add('open');
  document.getElementById('pw-current').focus();
}

export async function doCambiarPassword() {
  const actual = document.getElementById('pw-current').value;
  const pass   = document.getElementById('pw-new').value;
  const pass2  = document.getElementById('pw-new2').value;
  const btn = document.getElementById('pw-btn');
  const err = document.getElementById('pw-error');
  const email = state.currentUserProfile?.email || '';
  if (!actual) { err.textContent = 'Ingresa tu contraseña actual.'; return; }
  const invalida = validarPassNueva(pass, pass2);   // misma regla que el modo recuperación
  if (invalida) { err.textContent = invalida; return; }
  if (pass === actual) { err.textContent = 'La nueva contraseña debe ser distinta de la actual.'; return; }
  if (!email) { err.textContent = 'No se pudo leer tu sesión. Cierra sesión y vuelve a entrar.'; return; }
  btn.disabled = true; btn.textContent = 'Guardando...'; err.textContent = '';
  // Reautenticación ANTES del updateUser: updateUser NO pide la contraseña actual, así que con
  // solo encontrar la sesión abierta —y esto corre en la PC compartida de recepción— cualquiera
  // se apropiaría de la cuenta. signInWithPassword con el email de la sesión es la verificación.
  const { error: reauthErr } = await supa.auth.signInWithPassword({ email, password: actual });
  if (reauthErr) {
    btn.disabled = false; btn.textContent = 'Guardar contraseña';
    err.textContent = 'La contraseña actual no es correcta.';
    return;
  }
  const { error } = await supa.auth.updateUser({ password: pass });
  if (error) {
    btn.disabled = false; btn.textContent = 'Guardar contraseña';
    err.textContent = 'No se pudo cambiar la contraseña. Intenta de nuevo.';
    toastErr('No se pudo cambiar la contraseña: ' + (error.message || 'error desconocido'));
    return;
  }
  window._app.closeModal('password-modal');
  ['pw-current','pw-new','pw-new2'].forEach(id => { document.getElementById(id).value = ''; });
  toastOk('Contraseña actualizada correctamente.');
}

// ── DB helpers ──
export function markLocalChange(table){
  // Delegado a realtime.js a través de window._app
  window._app?.markLocalChange(table);
}

export async function dbUpdateApptStatus(id,status){
  if(typeof id!=='string') return;
  markLocalChange('appointments');
  const {error}=await supa.from('appointments').update({status}).eq('id',id);
  if(error) toastErr('No se pudo guardar el estado de la cita.');
}
export async function dbDeleteTherapist(id){
  markLocalChange('therapists');
  if(typeof id!=='string') return;
  try{const{error}=await supa.from('therapists').delete().eq('id',id);
    if(error) toastErr('No se pudo eliminar el terapeuta. Verifica tu conexión.');}
  catch(e){toastErr('No se pudo eliminar. Verifica tu conexión.');}
}
export async function dbDeleteDoctor(id){
  markLocalChange('doctors');
  if(typeof id!=='string') return;
  try{const{error}=await supa.from('doctors').delete().eq('id',id);
    if(error) toastErr('No se pudo eliminar el doctor. Verifica tu conexión.');}
  catch(e){toastErr('No se pudo eliminar. Verifica tu conexión.');}
}
export async function dbSaveProtocol(p){
  markLocalChange('protocols');
  const d={name:p.name,diag_keywords:p.diag,sessions:p.sessions,freq:p.freq,discharge_criteria:p.alta,
    img:p.img||null,definition:p.def||null,clinical_context:p.clinicalContext||null};
  if(typeof p.id==='string') d.id=p.id;
  return supa.from('protocols').upsert(d).select().single();
}
export async function dbDeleteProtocol(id){
  markLocalChange('protocols');
  if(typeof id!=='string') return;
  try{const{error}=await supa.from('protocols').delete().eq('id',id);
    if(error) toastErr('No se pudo eliminar el protocolo. Verifica tu conexión.');}
  catch(e){toastErr('No se pudo eliminar. Verifica tu conexión.');}
}
export async function dbRegistrarCobro(patientId,nSessions,cobroRef){
  markLocalChange('cobros');
  try{
    const{error:e1}=await supa.from('cobros').insert({cobro_ref:cobroRef,patient_id:patientId,n_sessions:nSessions,date:fmtDate(new Date())});
    if(e1) return{error:e1};
    // billing_pendientes ya no se escribe: pendientes deriva de session_log/cobros (pendientesActual).
    return{error:null};
  }catch(e){return{error:e};}
}
