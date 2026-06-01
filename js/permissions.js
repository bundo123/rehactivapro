import { state } from './state.js';

const ROLE_TABS = {
  admin:     ['agenda','resumen','pacientes','paciente_rpt','protocolos','informes','facturacion','terapeutas','doctores'],
  secretaria:['agenda','resumen','pacientes','paciente_rpt','protocolos','facturacion','doctores'],
  terapeuta: ['agenda','resumen','pacientes','paciente_rpt','protocolos'],
};

const ROLE_ACTIONS = {
  admin:     ['createAppt','deleteAppt','cycleStatus','createPatient','editPatient','deletePatient',
              'registerSession','deleteSession','evalInicial','createTherapist','createDoctor','createProtocol',
              'emitirFactura','viewAI'],
  secretaria:['createAppt','deleteAppt','cycleStatus','createPatient','editPatient',
              'createDoctor','emitirFactura'],
  terapeuta: ['cycleStatus','editPatient','registerSession','evalInicial','viewAI'],
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
