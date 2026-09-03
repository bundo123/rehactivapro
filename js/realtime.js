import { supa } from './supabase-client.js';
import { state } from './state.js';
import { getPatient, fmtTime, normHour, mapTherapistRow, tipoSesion } from './utils.js';
import { toastInfo } from './toast.js';

// ── Anti-eco por tabla (ventana 3 s) ──
const ANTI_ECHO_MS = 3000;
const TRACKED_TABLES = new Set(['appointments','patients','session_log','cobros','therapists','doctors']);
const _lastLocalChangeByTable = new Map();

export function markLocalChange(table) {
  if(table){_lastLocalChangeByTable.set(table,Date.now());return;}
  const now=Date.now();
  TRACKED_TABLES.forEach(t=>_lastLocalChangeByTable.set(t,now));
}

export function isLocalEcho(table) {
  const ts=_lastLocalChangeByTable.get(table)||0;
  return(Date.now()-ts)<ANTI_ECHO_MS;
}

function touchLoaded(table) {
  const now=Date.now();
  state.lastLoaded.all=now;
  if(table)state.lastLoaded[table]=now;
  window._app?.updateLastLoadedLabels?.();
}

// ── Wrapper sobre supa.from ──
const _supaFromOrig = supa.from.bind(supa);
supa.from = function(table) {
  const builder=_supaFromOrig(table);
  if(TRACKED_TABLES.has(table)){
    ['insert','update','upsert','delete'].forEach(method=>{
      const orig=builder[method];
      if(typeof orig==='function'){
        builder[method]=function(...args){markLocalChange(table);return orig.apply(builder,args);};
      }
    });
  }
  return builder;
};

// ── Toasts agrupados ──
let _toastFlushTimer = null;
const _pendingToasts = new Map();
const _TOAST_PLURAL = {
  appointments:'Cambios en agenda',patients:'Pacientes actualizados',
  session_log:'Sesiones actualizadas',cobros:'Cobros registrados',
  therapists:'Terapeutas actualizados',doctors:'Doctores actualizados',
};

export function queueRemoteToast(table,msg) {
  if(isLocalEcho(table))return;
  const cur=_pendingToasts.get(table)||{count:0,lastMsg:msg};
  cur.count+=1;cur.lastMsg=msg;
  _pendingToasts.set(table,cur);
  if(_toastFlushTimer)clearTimeout(_toastFlushTimer);
  _toastFlushTimer=setTimeout(_flushRemoteToasts,600);
}

function _flushRemoteToasts() {
  _toastFlushTimer=null;
  for(const [table,info] of _pendingToasts){
    const msg=info.count===1?info.lastMsg:`${_TOAST_PLURAL[table]||'Cambios remotos'} (${info.count})`;
    toastInfo(msg);
  }
  _pendingToasts.clear();
}

// ── Mappers DB row → in-memory ──
function _mapAppt(r) {
  const pt=getPatient(r.patient_id);
  // qbAt: conciliación con QuickBooks. Estado ADMINISTRATIVO, ortogonal al clínico (status).
  return{id:r.id,date:r.date,therapistId:r.therapist_id,patientId:r.patient_id,patientName:pt?pt.name:null,hour:r.hour,duration:r.duration||60,type:tipoSesion(r.type),status:r.status||'pend',note:r.note||'',location:r.location||'centro',qbAt:r.qb_at||null};
}
function _mapPatient(r) {
  const existing=state.patients.find(p=>p.id===r.id);
  return{
    id:r.id,createdAt:r.created_at||null,name:r.name,age:r.age||null,birth_date:r.birth_date||null,cedula:r.cedula||'',tel:r.tel||'',email:r.email||'',dir:r.dir||'',
    diag:r.diag||'Sin diagnóstico',cie10:r.cie10||null,cie10Desc:r.cie10_desc||null,
    therapistId:r.therapist_id,doctorId:r.doctor_id,
    sessions:r.sessions||10,status:r.status||'active',protocolId:r.protocol_id||null,
    log:existing?existing.log:[],
    // done/pendientes NO se leen de columnas (vestigiales): derivan de session_log vía doneActual/pendientesActual.
    billing:{sesPerFactura:r.billing_ses_per_factura||5,
      facturas:existing&&existing.billing?existing.billing.facturas:[]}
  };
}
const _mapTherapist = mapTherapistRow;   // misma fila → mismo objeto que la carga inicial (utils.js)
function _mapDoctor(r){return{id:r.id,name:r.name,spec:r.spec||'',email:r.email||'',tel:r.tel||'',color:r.color||'#E24B4A'};}
function _mapSession(s){return{id:s.id,date:s.date,type:s.type,hour:s.hour,status:s.status,pb:s.pain_before,pa:s.pain_after,note:s.note||'',tags:s.tags||[],therapistId:s.therapist_id||null};}

function _refreshTabAfterAppt() {
  const {renderGrid,renderResumen,renderFacturacion,renderSeguimiento,renderHistorial,updateResumenBadge,updateFacturaBadge}=window._app;
  if(state.currentTab==='agenda')renderGrid();
  else if(state.currentTab==='resumen')renderResumen();
  else if(state.currentTab==='facturacion')renderFacturacion();
  else if(state.currentTab==='seguimiento')renderSeguimiento();
  // El Historial se arma sobre las citas: si la secretaria mueve una desde otra PC, la pantalla
  // abierta acá tiene que reflejarlo (si no, se contesta el teléfono con un conteo viejo).
  else if(state.currentTab==='historial')renderHistorial();
  updateResumenBadge();updateFacturaBadge();
}

function _onAppt(payload) {
  touchLoaded('appointments');
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!state.appointments.find(a=>a.id===payload.new.id)){state.appointments.push(_mapAppt(payload.new));queueRemoteToast('appointments','Nueva cita agregada');}
  } else if(ev==='UPDATE'){
    const i=state.appointments.findIndex(a=>a.id===payload.new.id);
    const mapped=_mapAppt(payload.new);
    if(i>=0){mapped.hasSession=state.appointments[i].hasSession;state.appointments[i]=mapped;}
    else state.appointments.push(mapped);
    queueRemoteToast('appointments','Cita actualizada');
  } else if(ev==='DELETE'){
    const before=state.appointments.length;
    state.appointments=state.appointments.filter(a=>a.id!==payload.old.id);
    if(state.appointments.length<before)queueRemoteToast('appointments','Cita eliminada');
  }
  _refreshTabAfterAppt();
}

function _onPatient(payload) {
  touchLoaded('patients');
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!state.patients.find(p=>p.id===payload.new.id)){state.patients.push(_mapPatient(payload.new));queueRemoteToast('patients','Paciente agregado');}
  } else if(ev==='UPDATE'){
    const i=state.patients.findIndex(p=>p.id===payload.new.id);
    if(i>=0)state.patients[i]=_mapPatient(payload.new);else state.patients.push(_mapPatient(payload.new));
    queueRemoteToast('patients','Paciente actualizado');
  } else if(ev==='DELETE'){
    const before=state.patients.length;
    state.patients=state.patients.filter(p=>p.id!==payload.old.id);
    if(state.patients.length<before)queueRemoteToast('patients','Paciente eliminado');
  }
  const {renderPatients,renderPatientReport,renderFacturacion,renderSeguimiento,renderHistorial,updateFacturaBadge}=window._app;
  if(state.currentTab==='pacientes')renderPatients();
  else if(state.currentTab==='paciente_rpt'){const sel=document.getElementById('patient-rpt-select')?.value;if(sel)renderPatientReport();}
  else if(state.currentTab==='facturacion')renderFacturacion();
  else if(state.currentTab==='seguimiento')renderSeguimiento();
  // La cabecera del Historial muestra diagnóstico, plan y terapeuta del paciente: si los editan en
  // otra PC, hay que repintar.
  else if(state.currentTab==='historial')renderHistorial();
  updateFacturaBadge();
}

function _onSessionLog(payload) {
  touchLoaded('patients');
  const ev=payload.eventType;
  const row=payload.new||payload.old;if(!row)return;
  const pid=row.patient_id;
  const p=getPatient(pid);if(!p)return;
  if(!p.log)p.log=[];
  if(ev==='INSERT'){
    if(!p.log.find(s=>s.date===payload.new.date&&normHour(s.hour)===normHour(payload.new.hour))){p.log.push(_mapSession(payload.new));queueRemoteToast('session_log','Sesión clínica registrada');}
    const a=state.appointments.find(x=>x.patientId===pid&&x.date===payload.new.date&&normHour(fmtTime(x.hour))===normHour(payload.new.hour));
    if(a)a.hasSession=true;
  } else if(ev==='UPDATE'){
    const idx=p.log.findIndex(s=>s.date===payload.new.date&&normHour(s.hour)===normHour(payload.new.hour));
    if(idx>=0)p.log[idx]=_mapSession(payload.new);else p.log.push(_mapSession(payload.new));
    queueRemoteToast('session_log','Sesión actualizada');
  } else if(ev==='DELETE'){
    p.log=p.log.filter(s=>!(s.date===payload.old.date&&normHour(s.hour)===normHour(payload.old.hour)));
    queueRemoteToast('session_log','Sesión eliminada');
  }
  const {renderPatientReport,renderGrid,renderSeguimiento,renderHistorial}=window._app;
  if(state.currentTab==='paciente_rpt'){const sel=document.getElementById('patient-rpt-select')?.value;if(String(sel)===String(pid))renderPatientReport();}
  if(state.currentTab==='agenda')renderGrid();
  if(state.currentTab==='seguimiento')renderSeguimiento();
  // Un 'Fin de episodio' nuevo mueve la frontera y con ella TODOS los cortes y ordinales de la
  // pantalla, así que el Historial se repinta aunque el paciente abierto sea otro (barato: es un
  // render sobre datos que ya están en memoria).
  if(state.currentTab==='historial')renderHistorial();
}

function _onCobro(payload) {
  touchLoaded('cobros');
  const ev=payload.eventType;
  if(ev==='INSERT'){
    const r=payload.new;const p=getPatient(r.patient_id);
    if(p&&p.billing){
      if(!p.billing.facturas.find(f=>f.id===r.cobro_ref)){p.billing.facturas.push({id:r.cobro_ref,n:r.n_sessions,fecha:r.date,estado:'cobrada'});}
      const m=String(r.cobro_ref||'').match(/^F(\d+)$/);
      if(m){const n=parseInt(m[1],10);if(n>state.facturaCounter)state.facturaCounter=n;}
    }
    queueRemoteToast('cobros','Cobro registrado');
  }
  const {renderFacturacion,updateFacturaBadge}=window._app;
  if(state.currentTab==='facturacion')renderFacturacion();
  updateFacturaBadge();
}

function _onTherapist(payload) {
  touchLoaded('therapists');
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!state.therapists.find(t=>t.id===payload.new.id)){state.therapists.push(_mapTherapist(payload.new));queueRemoteToast('therapists','Terapeuta agregado');}
  } else if(ev==='UPDATE'){
    const i=state.therapists.findIndex(t=>t.id===payload.new.id);
    if(i>=0)state.therapists[i]=_mapTherapist(payload.new);else state.therapists.push(_mapTherapist(payload.new));
    queueRemoteToast('therapists','Terapeuta actualizado');
  } else if(ev==='DELETE'){
    const before=state.therapists.length;
    state.therapists=state.therapists.filter(t=>t.id!==payload.old.id);
    if(state.therapists.length<before)queueRemoteToast('therapists','Terapeuta eliminado');
  }
  const {renderTherapistList,renderGrid}=window._app;
  if(state.currentTab==='terapeutas')renderTherapistList();
  if(state.currentTab==='agenda')renderGrid();
}

function _onDoctor(payload) {
  touchLoaded('doctors');
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!state.doctors.find(d=>d.id===payload.new.id)){state.doctors.push(_mapDoctor(payload.new));queueRemoteToast('doctors','Doctor agregado');}
  } else if(ev==='UPDATE'){
    const i=state.doctors.findIndex(d=>d.id===payload.new.id);
    if(i>=0)state.doctors[i]=_mapDoctor(payload.new);else state.doctors.push(_mapDoctor(payload.new));
    queueRemoteToast('doctors','Doctor actualizado');
  } else if(ev==='DELETE'){
    const before=state.doctors.length;
    state.doctors=state.doctors.filter(d=>d.id!==payload.old.id);
    if(state.doctors.length<before)queueRemoteToast('doctors','Doctor eliminado');
  }
  const {renderRefLegend,renderDoctorsList,renderGrid}=window._app;
  renderRefLegend();
  if(state.currentTab==='doctores')renderDoctorsList();
  if(state.currentTab==='agenda')renderGrid();
}

let realtimeChannel = null;
let realtimeReconnectTimer = null;
let _connState = 'disconnected';
let _disconnectedSinceTimer = null;

function _updateConnectionDot(s) {
  const dot=document.getElementById('conn-dot');
  const lbl=document.getElementById('conn-label');
  if(!dot||!lbl) return;
  const cfg={
    connected:    {bg:'var(--rh-green)',  label:'Tiempo real activo',  title:'Conectado en tiempo real',    anim:''},
    reconnecting: {bg:'var(--rh-yellow)', label:'Reconectando...',     title:'Reconectando...',             anim:'conn-pulse 1s infinite'},
    disconnected: {bg:'#9c9a92',          label:'Sin conexión',        title:'Sin conexión con el servidor', anim:''},
  };
  const c=cfg[s]||cfg.disconnected;
  dot.style.background=c.bg; dot.style.animation=c.anim; dot.title=c.title; lbl.textContent=c.label;
}

function _setConnState(s) {
  if(_connState===s) return;
  _connState=s;
  _updateConnectionDot(s);
  if(_disconnectedSinceTimer){clearTimeout(_disconnectedSinceTimer);_disconnectedSinceTimer=null;}
  if(s==='disconnected'||s==='reconnecting'){
    _disconnectedSinceTimer=setTimeout(()=>toastInfo('Conexión perdida. Reintentando automáticamente...'),30000);
  }
}

async function _doReconnect(delay=5000) {
  if(realtimeReconnectTimer) return;
  realtimeReconnectTimer=setTimeout(async()=>{
    realtimeReconnectTimer=null;
    try{if(realtimeChannel)await supa.removeChannel(realtimeChannel);}catch(e){}
    realtimeChannel=null;
    try{
      const{loadAll,renderGrid,renderPatients,renderResumen,renderFacturacion,renderSeguimiento,updateResumenBadge,updateFacturaBadge}=window._app;
      await loadAll(true);
      if(state.currentTab==='agenda')renderGrid();
      else if(state.currentTab==='pacientes')renderPatients();
      else if(state.currentTab==='resumen')renderResumen();
      else if(state.currentTab==='facturacion')renderFacturacion();
      else if(state.currentTab==='seguimiento')renderSeguimiento();
      updateResumenBadge();updateFacturaBadge();
    }catch(e){console.warn('[Realtime] resync falló:',e);}
    subscribeRealtime();
  },delay);
}

export function subscribeRealtime() {
  if(realtimeChannel)return;
  realtimeChannel=supa.channel('rehactiva-realtime')
    .on('postgres_changes',{event:'*',schema:'public',table:'appointments'},_onAppt)
    .on('postgres_changes',{event:'*',schema:'public',table:'patients'},_onPatient)
    .on('postgres_changes',{event:'*',schema:'public',table:'session_log'},_onSessionLog)
    .on('postgres_changes',{event:'*',schema:'public',table:'cobros'},_onCobro)
    .on('postgres_changes',{event:'*',schema:'public',table:'therapists'},_onTherapist)
    .on('postgres_changes',{event:'*',schema:'public',table:'doctors'},_onDoctor)
    .subscribe(status=>{
      if(status==='SUBSCRIBED'){
        _setConnState('connected');
        if(realtimeReconnectTimer){clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;}
      } else if(status==='CHANNEL_ERROR'||status==='CLOSED'||status==='TIMED_OUT'){
        console.warn('[Realtime] estado:',status,'— reintento en 5s');
        _setConnState('reconnecting');
        _doReconnect(5000);
      }
    });
}

export async function unsubscribeRealtime() {
  _setConnState('disconnected');
  if(realtimeReconnectTimer){clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;}
  if(realtimeChannel){
    try{await supa.removeChannel(realtimeChannel);}catch(e){}
    realtimeChannel=null;
  }
}

function _onNetworkBack() {
  if(_connState==='connected') return;
  _setConnState('reconnecting');
  _doReconnect(1500);
}

// ── Visibilidad: al volver a la pestaña el WebSocket puede haber muerto en silencio
// (pestaña congelada / laptop dormida) sin disparar ningún estado de error del canal,
// así que la reconexión por estados nunca se activa. Se fuerza el ciclo completo
// (_doReconnect: removeChannel + loadAll(true) + resubscribe) al volver.
let _hiddenAt = 0;

function _onVisibilityChange() {
  if(document.visibilityState==='hidden'){_hiddenAt=Date.now();return;}
  if(!state.dataLoaded) return;                    // sin sesión iniciada: nada que reconectar
  const hiddenMs=_hiddenAt?Date.now()-_hiddenAt:0;
  if(hiddenMs>10000||_connState!=='connected'){
    _setConnState('reconnecting');
    _doReconnect(500);
  }
}

window.addEventListener('online',  _onNetworkBack);
window.addEventListener('offline', ()=>_setConnState('disconnected'));
document.addEventListener('visibilitychange', _onVisibilityChange);
