import { state } from './state.js';

// 'seguimiento' es de lectura para los tres roles (el terapeuta incluido): es la pantalla que
// dice qué pacientes atendidos no tienen historia cargada, y quien la carga es el terapeuta.
// 'historial' lo ven los TRES roles: son las mismas citas que ya ven en la agenda, ordenadas por
// paciente. La secretaria lo necesita para contestar el teléfono y el terapeuta para saber en qué
// sesión va; no hay dato clínico nuevo en esa pantalla.
const ROLE_TABS = {
  admin:     ['agenda','historial','resumen','pacientes','seguimiento','paciente_rpt','protocolos','informes','facturacion','terapeutas','doctores'],
  secretaria:['agenda','historial','resumen','pacientes','seguimiento','paciente_rpt','protocolos','facturacion','terapeutas','doctores'],
  terapeuta: ['agenda','historial','resumen','pacientes','seguimiento','paciente_rpt','protocolos'],
};

// 'createTherapist' = alta y edición del terapeuta; 'deleteTherapist' = baja definitiva. Van
// partidos porque la secretaria administra el equipo (agregar/editar horarios, orden, color) pero
// el borrado lo conserva el admin: es la única acción de esta pantalla que no se puede deshacer.
// 'conciliarQB' = marcar citas como pasadas a QuickBooks. Es administrativo, no clínico: lo hace
// quien factura (admin/secretaria). El terapeuta no lo ve.
// 'manageBlocks' = bloquear franjas del terapeuta (vacaciones, curso, permiso). Es agenda pura:
// la maneja quien la agenda (admin/secretaria), no el terapeuta — si cada uno se bloqueara solo,
// la recepción vendería horas que ya no existen.
// 'editAppt' = reprogramar/reasignar una cita existente (fecha, hora, paciente, terapeuta, nota).
// Es agenda pura como 'createAppt': lo hace recepción. El terapeuta cambia el ESTADO desde la
// tarjeta ('cycleStatus'); el modal de edición se le abre en solo lectura.
// 'newEpisode' = cerrar el episodio clínico e iniciar otro (marcador 'Fin de episodio' + diag
// nuevo). Es decisión clínica y resetea el conteo que alimenta facturación: admin y terapeuta.
const ROLE_ACTIONS = {
  admin:     ['createAppt','deleteAppt','cycleStatus','createPatient','editPatient','deletePatient',
              'registerSession','deleteSession','evalInicial','createTherapist','deleteTherapist',
              'createDoctor','createProtocol','emitirFactura','viewAI','deleteInforme','apptPastDate',
              'conciliarQB','manageBlocks','editAppt','newEpisode'],
  secretaria:['createAppt','deleteAppt','cycleStatus','createPatient','editPatient',
              'createTherapist','createDoctor','emitirFactura','apptPastDate','conciliarQB','manageBlocks',
              'editAppt'],
  terapeuta: ['cycleStatus','editPatient','registerSession','evalInicial','viewAI','deleteInforme',
              'newEpisode'],
};

export function hasPermission(action) {
  const role = state.currentUserRole || 'terapeuta';
  return (ROLE_ACTIONS[role] || []).includes(action);
}

export function canAccessTab(tab) {
  const role = state.currentUserRole || 'terapeuta';
  return (ROLE_TABS[role] || []).includes(tab);
}

export function applyRolePermissions() {
  const role = state.currentUserRole || 'terapeuta';
  const allowedTabs = ROLE_TABS[role] || [];

  // 1. Show/hide nav items by tab
  document.querySelectorAll('.nav-item[onclick]').forEach(el => {
    const m = (el.getAttribute('onclick') || '').match(/showTab\(['"](\w+)['"]\)/);
    if (m) el.style.display = allowedTabs.includes(m[1]) ? '' : 'none';
  });

  // 2. data-permission elements (static buttons in HTML)
  document.querySelectorAll('[data-permission]').forEach(el => {
    const perm = el.getAttribute('data-permission');
    let show = false;
    if (perm === 'admin')              show = role === 'admin';
    else if (perm === 'admin-secretaria') show = role === 'admin' || role === 'secretaria';
    else if (perm === 'admin-terapeuta')  show = role === 'admin' || role === 'terapeuta';
    else if (perm === 'all')           show = true;
    el.style.display = show ? '' : 'none';
  });

  // 3. Role badge in sidebar footer
  const profile = state.currentUserProfile;
  const roleLabel = { admin: 'Admin', secretaria: 'Secretaria', terapeuta: 'Terapeuta' }[role] || role;
  const userName = profile?.name || profile?.email || 'Usuario';
  const badge = document.getElementById('role-badge');
  if (badge) badge.textContent = `👤 ${userName} · ${roleLabel}`;
}
