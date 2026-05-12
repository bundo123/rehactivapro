// ── Imports ──
import { supa } from './supabase-client.js';
import { state } from './state.js';
import { allTabs, fmtDate } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { loadAll, doLogin, doLogout, loadProfile } from './auth.js';
import { applyRolePermissions, canAccessTab, hasPermission } from './permissions.js';
import { markLocalChange, subscribeRealtime, unsubscribeRealtime } from './realtime.js';
import {
  renderGrid, renderRefLegend, cycleStatus, updateFacturaBadge,
  changeDay, openApptModal, updateTimeSlots, saveAppt, delAppt,
  goToDate, openDatePicker, agendarCitaParaPaciente, checkAutoNoas,
  toggleRecurrencia, updateRecPreview, getRecDates, filterApptPatient,
  updateGlobalSPF
} from './agenda.js';
import {
  updateResumenBadge, renderResumen, openWA, waPatient, simWA, simEmail,
  hasEvalInicial, genResumenDiaAI
} from './resumen.js';
import {
  renderPatients, openPatientModal, savePatient, deletePatient,
  openEditPatient, populateDiagList, nuevoEpisodio, guardarNuevoEpisodio,
  openEvalInicial, renderEvEva, saveEvalInicial
} from './pacientes.js';
import {
  openSessionModal, saveSession, skipSession,
  renderProTecnicas, toggleProTecnica, renderEvaButtons, setEva
} from './sesiones.js';
import {
  renderSemanal, renderHeatmap, renderTherapistUtil, renderInsights,
  changeWeek, updateWeekLabel, showSubTab, renderMensual, renderAnual,
  renderPatientReportSelect, updateEpisodes, renderPatientReport,
  filterPatientRptSelect, exportarPDF, genSemanalAI, genPatientAI
} from './informes.js';
import {
  renderFacturacion, emitirFactura, marcarTodosFacturados, simEmailFactura
} from './facturacion.js';
import {
  openProtocolModal, saveProtocol, renderProtocols, deleteProtocol,
  protPage, renderProtocolAdherence, protocolSVG
} from './protocolos.js';
import {
  renderTherapistList, openTherapistModal, openEditTherapist,
  renderColorPicker, selectColor, saveTherapist, deleteTherapist
} from './terapeutas.js';
import {
  renderDoctorsList, openDoctorModal, renderDocColorPicker, selectDocColor,
  saveDoctor, deleteDoctor, showDoctoresTab, renderNotifList, toggleNotif
} from './doctores.js';
import { callAI } from './ia.js';
import { globalSearch, selectGlobalResult, checkCitasPendientes } from './search.js';

// ── Registro central de funciones para módulos cross-cutting ──
window._app = {
  // data
  get appointments(){ return state.appointments; },
  get patients(){ return state.patients; },
  supa,
  fmtDate,
  // auth/realtime
  loadAll, subscribeRealtime, unsubscribeRealtime, markLocalChange,
  // permissions
  applyRolePermissions, hasPermission,
  // ui helpers
  showTab, closeModal,
  // render
  renderGrid, renderRefLegend, renderResumen, renderPatients,
  renderPatientReport, renderPatientReportSelect, renderTherapistList,
  renderDoctorsList, renderFacturacion,
  // badges
  updateResumenBadge, updateFacturaBadge,
  // episodes
  updateEpisodes,
  // session
  openSessionModal,
  // patient
  openEditPatient,
  // toast (expuesto para módulos sin import directo)
  toastOk, toastErr, toastInfo,
  // ia
  callAI,
};

// ── Listener: citas recurrentes ──
document.addEventListener('change', function(e) {
  if(e.target.classList.contains('rec-day')||e.target.id==='m-rec-semanas') updateRecPreview();
});

// ── showTab ──
export function showTab(tab) {
  if (!canAccessTab(tab)) {
    toastErr('No tienes permisos para acceder a esta sección');
    tab = 'agenda';
  }
  state.currentTab=tab;
  allTabs.forEach(t=>document.getElementById('tab-'+t).style.display=t===tab?'':'none');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const navMap={'agenda':0,'resumen':1,'pacientes':2,'paciente_rpt':3,'protocolos':4,'informes':5,'facturacion':6,'terapeutas':7,'doctores':8};
  const navItems=document.querySelectorAll('.nav-item');
  if(navItems[navMap[tab]])navItems[navMap[tab]].classList.add('active');
  if(tab==='pacientes')renderPatients();
  if(tab==='informes')renderSemanal();
  if(tab==='paciente_rpt')renderPatientReportSelect();
  if(tab==='terapeutas')renderTherapistList();
  if(tab==='resumen')renderResumen();
  if(tab==='protocolos')renderProtocols();
  if(tab==='doctores'){renderDoctorsList();renderNotifList();}
  if(tab==='facturacion')renderFacturacion();
}
window._app.showTab = showTab;

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
window._app.closeModal = closeModal;

// ── initApp ──
async function initApp() {
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('loading-overlay').style.display='none';
  const {data:{session}}=await supa.auth.getSession();
  if(session){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('loading-overlay').style.display='flex';
    const profileOk = await loadProfile();
    if (!profileOk) return;
    await loadAll();
    document.getElementById('loading-overlay').style.display='none';
    checkAutoNoas(); renderGrid(); updateResumenBadge(); updateFacturaBadge();
    applyRolePermissions();
    checkCitasPendientes();
    subscribeRealtime();
  }
}

// ── Exponer al window para onclick en HTML ──
Object.assign(window, {
  doLogin, doLogout, showTab, closeModal,
  openApptModal, openPatientModal, openTherapistModal, openDoctorModal,
  openProtocolModal, openEditTherapist, openEditPatient,
  openSessionModal, openEvalInicial, openDatePicker,
  openWA, waPatient, agendarCitaParaPaciente, nuevoEpisodio,
  saveAppt, savePatient, saveTherapist, saveDoctor, saveProtocol,
  saveSession, saveEvalInicial, guardarNuevoEpisodio,
  delAppt, deletePatient, deleteTherapist, deleteDoctor, deleteProtocol,
  cycleStatus, changeDay, changeWeek, goToDate,
  showSubTab, showDoctoresTab, selectColor, selectDocColor,
  filterApptPatient, filterPatientRptSelect, updateEpisodes, updateTimeSlots,
  renderPatientReport, renderProtocols, protPage,
  toggleNotif, toggleRecurrencia, toggleProTecnica,
  skipSession, simWA, simEmail, emitirFactura,
  marcarTodosFacturados, exportarPDF, genSemanalAI, genResumenDiaAI,
  genPatientAI, globalSearch, selectGlobalResult,
  updateGlobalSPF, updateRecPreview, populateDiagList,
  applyRolePermissions, hasPermission,
  // referencias a datos accesibles desde HTML (onclick strings)
  get appointments(){ return state.appointments; },
  get patients(){ return state.patients; },
  supa, getPatient: (id)=>state.patients.find(p=>p.id===id),
  hasEvalInicial,
  openSessionModal,
});

// ── Arrancar ──
renderGrid();
updateFacturaBadge();
initApp();
