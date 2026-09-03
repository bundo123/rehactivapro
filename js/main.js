// ── Imports ──
import { supa } from './supabase-client.js';
import { state } from './state.js';
import { allTabs, fmtDate, relativeTime } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { loadAll, doLogin, doLogout, loadProfile,
         doSendRecoveryEmail, doSetNewPassword,
         showForgotPassword, showLoginForm, cancelRecovery, startIdleLogout,
         openPasswordModal, doCambiarPassword } from './auth.js';
import { applyRolePermissions, canAccessTab, hasPermission } from './permissions.js';
import { markLocalChange, subscribeRealtime, unsubscribeRealtime } from './realtime.js';
import {
  renderGrid, renderRefLegend, cycleStatus, updateFacturaBadge, conciliarDia,
  changeDay, openApptModal, openApptModalAt, openEditApptModal, updateTimeSlots, saveAppt, delAppt,
  goToDate, goToToday, openDatePicker, agendarCitaParaPaciente, checkAutoNoas,
  toggleRecurrencia, updateRecPreview, filterApptPatient,
  setAgendaView, setTherapistFilter, verInformeDeCita, verHistorialDeCita, toggleHoraExacta,
  goToDateAndSelect, exportAgendaCSV
} from './agenda.js';
import {
  updateResumenBadge, renderResumen, simWA, simEmail,
  hasEvalInicial, genResumenDiaAI,
  changeResumenDay, goToResumenDate, resumenHoy, openResumenDatePicker,
  setResumenTherapist, resetResumenTherapist
} from './resumen.js';
import {
  renderPatients, openPatientModal, savePatient, deletePatient,
  openEditPatient, populateDiagList, nuevoEpisodio, guardarNuevoEpisodio,
  setupPatientSearch, goToPatientPage, toggleEvalFilter, setPatientStatusFilter, verPaciente,
  openEvalInicial, saveEvalInicial, initPatientValidation, onPatientProtocolChange
} from './pacientes.js';
import {
  renderSeguimiento, setSeguimientoFilter, toggleSeguimientoDetalle,
  verPacienteSeguimiento, setupSeguimientoSearch
} from './seguimiento.js';
import {
  setupHistorial, renderHistorial, irAHistorial,
  setHistorialCorte, setHistorialMes, setHistorialEstado,
  exportarHistorialPDF, exportarHistorialCSV
} from './historial.js';
import {
  openSessionModal, openSessionModalManual, editSession, deleteSession, saveSession, skipSession,
  toggleProTecnica
} from './sesiones.js';
import {
  renderSemanal, changeWeek, showSubTab, changeMensualMonth,
  renderPatientReportSelect, updateEpisodes, renderPatientReport,
  filterPatientRptSelect, selectRptPatient, rptSearchKeydown, exportarPDF,
  genSemanalAI, genMensualAI, genAnualAI, genPatientAI,
  guardarInforme, exportarInformeGuardado, verInformeGuardado, eliminarInformeGuardado,
  abrirFirmanteModal, confirmarExportarWord
} from './informes.js';
import {
  renderFacturacion, emitirFactura, marcarTodosFacturados
} from './facturacion.js';
import {
  openProtocolModal, saveProtocol, renderProtocols, deleteProtocol,
  protPage, initProtocolValidation
} from './protocolos.js';
import {
  renderTherapistList, openTherapistModal, openEditTherapist,
  selectColor, saveTherapist, deleteTherapist
} from './terapeutas.js';
import {
  renderDoctorsList, openDoctorModal, selectDocColor,
  saveDoctor, deleteDoctor, showDoctoresTab, renderNotifList, initDoctorValidation
} from './doctores.js';
import { abrirExportModal, onExportPreset, actualizarResumenExport,
         confirmarExportarExcel, confirmarExportar, cambiarFormatoExport } from './excel.js';
import { cie10Search, cie10Pick, cie10Clear } from './cie10.js';
import { planGuardarSesiones, planNuevoEpisodio } from './plan.js';
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
  updateLastLoadedLabels,
  // permissions
  applyRolePermissions, hasPermission,
  // ui helpers
  showTab, closeModal,
  // render
  renderGrid, renderRefLegend, renderResumen, renderPatients, renderSeguimiento, renderHistorial,
  renderPatientReport, renderPatientReportSelect, renderTherapistList,
  renderDoctorsList, renderFacturacion,
  // badges
  updateResumenBadge, updateFacturaBadge,
  // conciliación QuickBooks (estado administrativo de la cita)
  conciliarDia,
  // episodes
  updateEpisodes, selectRptPatient,
  // historial (agenda.js lo llama desde el modal de cita sin importarlo: evita un ciclo de módulos)
  irAHistorial,
  // session
  openSessionModal,
  // patient
  openEditPatient,
  // toast (expuesto para módulos sin import directo)
  toastOk, toastErr, toastInfo,
  // ia
  callAI,
  // informes guardados
  guardarInforme, exportarInformeGuardado, verInformeGuardado, eliminarInformeGuardado,
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
  // El botón se busca por su propio onclick, no por un índice: así agregar una pestaña al medio
  // del sidebar no corre el mapa y deja el "active" en la de al lado.
  document.querySelector(`.nav-item[onclick*="showTab('${tab}')"]`)?.classList.add('active');
  if(tab==='agenda')renderGrid();
  if(tab==='pacientes')renderPatients();
  if(tab==='seguimiento')renderSeguimiento();
  // Historial NO resetea el paciente elegido: se puede haber llegado desde una cita o desde el
  // informe, y perder la consulta al volver por el menú sería justo el peor momento.
  if(tab==='historial')renderHistorial();
  if(tab==='informes')renderSemanal();
  if(tab==='paciente_rpt')renderPatientReportSelect();
  if(tab==='terapeutas')renderTherapistList();
  // El filtro por terapeuta del Resumen es de sesión de pantalla: cada visita arranca en «Todos».
  if(tab==='resumen'){resetResumenTherapist();renderResumen();}
  if(tab==='protocolos')renderProtocols();
  if(tab==='doctores'){renderDoctorsList();renderNotifList();}
  if(tab==='facturacion')renderFacturacion();
}
window._app.showTab = showTab;

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
window._app.closeModal = closeModal;

// ── Cierre de modales con Escape y tocando el fondo (I-12) ──
// El guard de pointerdown evita cerrar cuando el gesto EMPIEZA dentro del modal (p.ej. seleccionar
// texto de un input) y el dedo/mouse suelta sobre el fondo: ahí el click cae en .modal-bg pero no
// fue intención de cerrar.
let _pointerDownOnBg = false;
document.addEventListener('pointerdown', e => { _pointerDownOnBg = e.target.classList && e.target.classList.contains('modal-bg'); });
document.addEventListener('click', e => {
  if (_pointerDownOnBg && e.target.classList.contains('modal-bg') && e.target.classList.contains('open')) closeModal(e.target.id);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.modal-bg.open');
  if (open) closeModal(open.id);
});

// ── Táctil: al abrirse el teclado en pantalla, centrar el campo enfocado del modal
// para que el teclado no tape el campo ni el botón Guardar.
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  document.addEventListener('focusin', e => {
    if (e.target.closest && e.target.closest('.modal')) {
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    }
  });
}

export function updateLastLoadedLabels() {
  const txt='Última actualización: '+relativeTime(state.lastLoaded?.all);
  document.querySelectorAll('.last-updated-label').forEach(el=>{el.textContent=txt;});
}
window._app.updateLastLoadedLabels = updateLastLoadedLabels;

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
    startIdleLogout();
  }
}

// ── Exponer al window para onclick en HTML ──
Object.assign(window, {
  doLogin, doLogout, showTab, closeModal,
  openApptModal, openApptModalAt, openEditApptModal, openPatientModal, openTherapistModal, openDoctorModal,
  openProtocolModal, openEditTherapist, openEditPatient,
  openSessionModal, openSessionModalManual, editSession, deleteSession, openEvalInicial, openDatePicker,
  agendarCitaParaPaciente, nuevoEpisodio,
  saveAppt, savePatient, saveTherapist, saveDoctor, saveProtocol,
  saveSession, saveEvalInicial, guardarNuevoEpisodio,
  delAppt, deletePatient, deleteTherapist, deleteDoctor, deleteProtocol,
  cycleStatus, changeDay, changeWeek, goToDate, goToToday,
  changeResumenDay, goToResumenDate, resumenHoy, openResumenDatePicker, setResumenTherapist,
  verInformeDeCita, verHistorialDeCita,
  showSubTab, changeMensualMonth, showDoctoresTab, selectColor, selectDocColor,
  filterApptPatient, filterPatientRptSelect, selectRptPatient, rptSearchKeydown, updateEpisodes, updateTimeSlots, toggleHoraExacta,
  renderPatientReport, renderProtocols, protPage,
  toggleRecurrencia, toggleProTecnica,
  skipSession, simWA, simEmail, emitirFactura,
  marcarTodosFacturados, exportarPDF, genSemanalAI, genMensualAI, genAnualAI, genResumenDiaAI,
  genPatientAI, guardarInforme, exportarInformeGuardado, verInformeGuardado, eliminarInformeGuardado, globalSearch, selectGlobalResult,
  abrirFirmanteModal, confirmarExportarWord,
  updateRecPreview, populateDiagList,
  goToPatientPage, toggleEvalFilter, setPatientStatusFilter, verPaciente, onPatientProtocolChange,
  setSeguimientoFilter, toggleSeguimientoDetalle, verPacienteSeguimiento,
  irAHistorial, setHistorialCorte, setHistorialMes, setHistorialEstado,
  exportarHistorialPDF, exportarHistorialCSV,
  cie10Search, cie10Pick, cie10Clear,
  planGuardarSesiones, planNuevoEpisodio,
  setAgendaView, setTherapistFilter, goToDateAndSelect, exportAgendaCSV,
  abrirExportModal, onExportPreset, actualizarResumenExport, confirmarExportarExcel,
  confirmarExportar, cambiarFormatoExport,
  applyRolePermissions, hasPermission,
  doSendRecoveryEmail, doSetNewPassword, showForgotPassword, showLoginForm, cancelRecovery,
  openPasswordModal, doCambiarPassword,
});

// ── Arrancar ──
initMobileMenu();
initPatientValidation();
initDoctorValidation();
initProtocolValidation();
setupPatientSearch();
setupSeguimientoSearch();
setupHistorial();
renderGrid();
updateFacturaBadge();
initApp();
