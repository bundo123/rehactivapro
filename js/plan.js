// ── Plan de sesiones en el modal de cita ──
// Mismo criterio que el CIE-10 (cie10.js): el plan es un dato del PACIENTE (patients.sessions),
// no de la cita, y por eso se guarda al instante en su ficha en vez de esperar a "Guardar cambios".
// Existe acá porque la pregunta "¿cuántas lleva?" aparece justo cuando se está agendando la
// siguiente: sin esto hay que salir de la agenda, entrar al informe del paciente y volver.
//
// Lo que muestra es lo MISMO que la agenda pinta en el badge X/N (doneActual + p.sessions): una
// sola fuente, session_log, sin contadores paralelos.
import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, doneActual } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { nuevoEpisodio } from './pacientes.js';

let _planPatientId = null;   // paciente de la cita abierta (null = sección oculta)

const $ = id => document.getElementById(id);

function paciente() {
  return state.patients.find(x => String(x.id) === String(_planPatientId)) || null;
}

function renderPlan() {
  const p = paciente();
  const box = $('plan-appt-current');
  if (!box || !p) return;
  const x = doneActual(p), n = p.sessions || 0;
  // Sin plan definido el conteo sigue siendo útil (es lo que la agenda muestra como "X" a secas).
  const over = n > 0 && x > n;
  box.innerHTML = n
    ? `<span class="plan-count${over ? ' plan-over' : ''}">Lleva <b>${esc(String(x))}</b> de <b>${esc(String(n))}</b> sesiones</span>`
      + (over ? '<span class="plan-hint">Supera el plan — ampliálo o iniciá un episodio nuevo</span>' : '')
    : `<span class="plan-count">Lleva <b>${esc(String(x))}</b> sesiones · sin plan definido</span>`;
  const inp = $('plan-appt-sessions');
  if (inp) inp.value = n ? String(n) : '';
}

// Escritura optimista + rollback si la DB rechaza (mismo patrón que persistCie/commitApptChange).
export async function planGuardarSesiones() {
  const p = paciente();
  if (!p) return;
  if (!hasPermission('editPatient')) { toastErr('No tienes permisos para editar la ficha del paciente.'); return; }
  const inp = $('plan-appt-sessions');
  const n = parseInt(inp?.value, 10);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    toastErr('El plan tiene que ser un número entre 1 y 99.');
    renderPlan();   // devuelve el input al valor real de la ficha
    return;
  }
  const prev = p.sessions;
  if (n === prev) return;
  p.sessions = n;
  renderPlan();
  window._app?.renderGrid?.();   // el badge X/N de la agenda se calcula con p.sessions
  if (typeof p.id !== 'string') return;   // paciente optimista todavía sin fila: solo memoria
  window._app?.markLocalChange?.('patients');
  const { error } = await supa.from('patients').update({ sessions: n }).eq('id', p.id);
  if (error) {
    p.sessions = prev;
    renderPlan();
    window._app?.renderGrid?.();
    toastErr('No se pudo guardar el plan: ' + error.message);
    return;
  }
  toastOk(`Plan actualizado: ${n} sesiones para ${p.name}`);
  if (state.currentTab === 'pacientes') window._app?.renderPatients?.();
  if (state.currentTab === 'paciente_rpt') window._app?.renderPatientReport?.();
}

// Cierre de episodio desde la cita: abre el modal de siempre (pacientes.js), que es el que pide
// diagnóstico nuevo, plan y la última cita del episodio anterior.
export function planNuevoEpisodio() {
  const p = paciente();
  if (!p) return;
  window._app?.closeModal?.('appt-modal');
  nuevoEpisodio(p.id);
}

// Enganche del modal de cita: sin paciente asignado la sección no se muestra (el dato es del
// paciente). El editor rápido de N se oculta sin permiso 'editPatient'; el conteo se ve igual.
export function setPlanAppt(patientId) {
  _planPatientId = patientId || null;
  const sec = $('plan-appt-section');
  if (sec) sec.hidden = !_planPatientId;
  const edit = $('plan-appt-edit');
  if (edit) edit.hidden = !hasPermission('editPatient');
  if (_planPatientId) renderPlan();
}
