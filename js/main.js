// ── Imports ──
import { supa } from './supabase-client.js';
import { state } from './state.js';
import { allTabs, fmtDate, relativeTime } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { loadAll, doLogin, doLogout, loadProfile,
         doSendRecoveryEmail, doSetNewPassword,
         showForgotPassword, showLoginForm, cancelRecovery } from './auth.js';
import { applyRolePermissions, canAccessTab, hasPermission } from './permissions.js';
import { markLocalChange, subscribeRealtime, unsubscribeRealtime } from './realtime.js';
import {
  renderGrid, renderRefLegend, cycleStatus, updateFacturaBadge,
  changeDay, openApptModal, openApptModalAt, openEditApptModal, updateTimeSlots, saveAppt, delAppt,
  goToDate, openDatePicker, agendarCitaParaPaciente, checkAutoNoas,
  toggleRecurrencia, updateRecPreview, getRecDates, filterApptPatient,
  updateGlobalSPF,
  setAgendaView, setTherapistFilter, renderWeekView, renderMonthView,
  goToDateAndSelect, exportAgendaCSV
} from './agenda.js';
import {
  updateResumenBadge, renderResumen, simWA, simEmail,
  hasEvalInicial, genResumenDiaAI
} from './resumen.js';
import {
  renderPatients, openPatientModal, savePatient, deletePatient,
  openEditPatient, populateDiagList, nuevoEpisodio, guardarNuevoEpisodio,
  setupPatientSearch, goToPatientPage, toggleEvalFilter, setPatientStatusFilter, verPaciente,
  openEvalInicial, renderEvEva, saveEvalInicial, initPatientValidation
} from './pacientes.js';
import {
  openSessionModal, openSessionModalManual, saveSession, skipSession,
  renderProTecnicas, toggleProTecnica, renderEvaButtons, setEva
} from './sesiones.js';
import {
  renderSemanal, renderHeatmap, renderTherapistUtil, renderInsights,
  changeWeek, updateWeekLabel, showSubTab, renderMensual, renderAnual,
  changeMensualMonth,
  renderPatientReportSelect, updateEpisodes, renderPatientReport,
  filterPatientRptSelect, exportarPDF, genSemanalAI, genPatientAI
} from './informes.js';
import {
  renderFacturacion, emitirFactura, marcarTodosFacturados, simEmailFactura
} from './facturacion.js';
import {
  openProtocolModal, saveProtocol, renderProtocols, deleteProtocol,
  protPage, renderProtocolAdherence, protocolSVG, initProtocolValidation
} from './protocolos.js';
import {
  renderTherapistList, openTherapistModal, openEditTherapist,
  renderColorPicker, selectColor, saveTherapist, deleteTherapist
} from './terapeutas.js';
import {
  renderDoctorsList, openDoctorModal, renderDocColorPicker, selectDocColor,
  saveDoctor, deleteDoctor, showDoctoresTab, renderNotifList, toggleNotif, initDoctorValidation
} from './doctores.js';
import { callAI } from './ia.js';
import { globalSearch, selectGlobalResult, checkCitasPendientes } from './search.js';
import { initMobileMenu } from './mobile-menu.js';

// ── Registro central de funciones para módulos cross-cutting ──
window._app = {
  // data
  get appointments(){ return state.appointments; },
  get patients(){ return state.patients; },
  supa,
  fmtDate,
  // auth/realtime
  loadAll, subscribeRealtime, unsubscribeRealtime, markLocalChange,
  refreshData, updateLastLoadedLabels,
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

export function updateLastLoadedLabels() {
  const txt='Última actualización: '+relativeTime(state.lastLoaded?.all);
  document.querySelectorAll('.last-updated-label').forEach(el=>{el.textContent=txt;});
}
window._app.updateLastLoadedLabels = updateLastLoadedLabels;

function renderRefreshControls() {
  document.querySelectorAll('.main-header').forEach(header=>{
    if(header.querySelector('.refresh-meta'))return;
    const meta=document.createElement('div');
    meta.className='refresh-meta';
    meta.innerHTML='<button class="refresh-btn" onclick="refreshData()">Actualizar</button><span class="last-updated-label">Última actualización: nunca</span>';
    header.appendChild(meta);
  });
  updateLastLoadedLabels();
}

export async function refreshData() {
  const result=await loadAll(true);
  if(result?.error)return;
  if(state.currentTab==='agenda'){
    const v=state.agendaView||'day';
    if(v==='week')renderWeekView();else if(v==='month')renderMonthView();else renderGrid();
  }
  else if(state.currentTab==='pacientes')renderPatients();
  else if(state.currentTab==='paciente_rpt')renderPatientReportSelect();
  else if(state.currentTab==='informes')renderSemanal();
  else if(state.currentTab==='resumen')renderResumen();
  else if(state.currentTab==='protocolos')renderProtocols();
  else if(state.currentTab==='terapeutas')renderTherapistList();
  else if(state.currentTab==='doctores'){renderDoctorsList();renderNotifList();}
  else if(state.currentTab==='facturacion')renderFacturacion();
  updateResumenBadge(); updateFacturaBadge(); applyRolePermissions();
  toastOk('Datos actualizados');
}
window._app.refreshData = refreshData;

// ── initApp ──
async function initApp() {
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('loading-overlay').style.display='none';

  // Registrar ANTES de getSession para no perder el evento PASSWORD_RECOVERY
  supa.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      if (state.dataLoaded) {
        window._app.unsubscribeRealtime();
        state.dataLoaded = false;
      }
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('recovery-screen').style.display = 'flex';
      document.getElementById('rec-pass').value = '';
      document.getElementById('rec-pass2').value = '';
      document.getElementById('rec-error').textContent = '';
    } else if (event === 'SIGNED_OUT' && state.dataLoaded) {
      location.reload();
    }
  });

  const {data:{session}}=await supa.auth.getSession();
  if (!session && window.location.hash.includes('type=recovery')) {
    window.history.replaceState(null, '', window.location.pathname);
    setTimeout(() => toastInfo('El enlace de recuperación expiró o ya fue usado. Solicita uno nuevo.'), 200);
  }
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
  openApptModal, openApptModalAt, openEditApptModal, openPatientModal, openTherapistModal, openDoctorModal,
  openProtocolModal, openEditTherapist, openEditPatient,
  openSessionModal, openSessionModalManual, openEvalInicial, openDatePicker,
  agendarCitaParaPaciente, nuevoEpisodio,
  saveAppt, savePatient, saveTherapist, saveDoctor, saveProtocol,
  saveSession, saveEvalInicial, guardarNuevoEpisodio,
  delAppt, deletePatient, deleteTherapist, deleteDoctor, deleteProtocol,
  cycleStatus, changeDay, changeWeek, goToDate,
  showSubTab, changeMensualMonth, showDoctoresTab, selectColor, selectDocColor,
  filterApptPatient, filterPatientRptSelect, updateEpisodes, updateTimeSlots,
  renderPatientReport, renderProtocols, protPage,
  toggleNotif, toggleRecurrencia, toggleProTecnica,
  skipSession, simWA, simEmail, emitirFactura,
  marcarTodosFacturados, exportarPDF, genSemanalAI, genResumenDiaAI,
  genPatientAI, globalSearch, selectGlobalResult,
  updateGlobalSPF, updateRecPreview, populateDiagList,
  goToPatientPage, refreshData, toggleEvalFilter, setPatientStatusFilter, verPaciente,
  setAgendaView, setTherapistFilter, goToDateAndSelect, exportAgendaCSV,
  applyRolePermissions, hasPermission,
  // referencias a datos accesibles desde HTML (onclick strings)
  get appointments(){ return state.appointments; },
  get patients(){ return state.patients; },
  supa, getPatient: (id)=>state.patients.find(p=>p.id===id),
  hasEvalInicial,
  openSessionModal,
  doSendRecoveryEmail, doSetNewPassword, showForgotPassword, showLoginForm, cancelRecovery,
});

// ── Arrancar ──
initMobileMenu();
initPatientValidation();
initDoctorValidation();
initProtocolValidation();
renderRefreshControls();
setupPatientSearch();
setInterval(updateLastLoadedLabels,30000);
renderGrid();
updateFacturaBadge();
initApp();
