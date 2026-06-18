import { state } from './state.js';
import { esc, fmtDate, fmtTime, getPatient, getTherapist, getDoctor, getInitials, safeColor } from './utils.js';
import { toastErr } from './toast.js';

export function hasEvalInicial(p) {
  return (p.log || []).some(s => s.type === 'Evaluación inicial');
}

export function updateResumenBadge() {
  const ds = fmtDate(state.currentDate);
  const n  = state.appointments.filter(a => a.date === ds && (a.status === 'pend' || a.status === 'noas')).length;
  const b  = document.getElementById('resumen-badge');
  b.textContent = n; b.style.display = n > 0 ? '' : 'none';
}

function renderStatsBar(nConf, nPend, nNoas) {
  return `
    <div class="resd-stats-bar">
      <div class="resd-q-stat green">
        <div class="resd-q-icon">✓</div>
        <div><div class="resd-q-num">${nConf}</div><div class="resd-q-lbl">Asistieron correctamente</div></div>
      </div>
      <div class="resd-q-stat yellow">
        <div class="resd-q-icon">⏳</div>
        <div><div class="resd-q-num">${nPend}</div><div class="resd-q-lbl">Pendientes de confirmar</div></div>
      </div>
      <div class="resd-q-stat red">
        <div class="resd-q-icon">✗</div>
        <div><div class="resd-q-num">${nNoas}</div><div class="resd-q-lbl">No asistieron — requieren contacto</div></div>
      </div>
    </div>`;
}

function row(a, kind) {
  const pt     = getPatient(a.patientId);
  const th     = getTherapist(a.therapistId);
  const doc    = pt?.doctorId ? getDoctor(pt.doctorId) : null;
  const dcol   = doc ? safeColor(doc.color) : '';
  const refTag = doc
    ? `<span class="resd-ref-tag" style="background:${dcol}22;color:${dcol};border-color:${dcol}44">${esc(doc.name)}</span>`
    : '';
  const metaParts = [fmtTime(a.hour), esc(a.type || ''), th ? esc(th.name) : null];
  if (kind === 'noas' && pt?.tel) metaParts.push(esc(pt.tel));
  const meta = metaParts.filter(Boolean).join(' · ');
  let actions;
  if (kind === 'conf') {
    const hasSession = a.hasSession || false;
    const tieneEval  = pt ? hasEvalInicial(pt) : true;
    const evalBtn    = !tieneEval
      ? `<button class="resd-btn-eval" onclick="openEvalInicial(${esc(JSON.stringify(a.patientId))})">⚠️ Eval. inicial</button>`
      : '';
    actions = `
      <button class="resd-btn-sess${hasSession ? ' done' : ''}" onclick="openSessionModal(window._app.appointments.find(x=>x.id===${esc(JSON.stringify(a.id))}))">${hasSession ? '✓ Sesión OK' : '📋 Completar sesión'}</button>
      ${evalBtn}
      <span class="resd-asistio">✓ Asistió</span>`;
  } else {
    // Sin teléfono no hay chat posible: botón deshabilitado (antes abría un número fijo de la clínica).
    const waBtn = pt?.tel
      ? `<button class="resd-btn-wa" onclick="simWA(${esc(JSON.stringify(pt.name || ''))},${esc(JSON.stringify(pt.tel))})">📱 WhatsApp</button>`
      : `<button class="resd-btn-wa" disabled title="Sin teléfono registrado — agrégalo en el perfil del paciente" style="opacity:.45;cursor:not-allowed">📱 WhatsApp</button>`;
    actions = `
      ${waBtn}
      <button class="resd-btn-em"  onclick="simEmail(${esc(JSON.stringify(pt?.name || ''))},${esc(JSON.stringify(pt?.email || ''))})">✉ Email</button>
      <button class="resd-btn-rep" onclick="openApptModal()">↻ Reagendar</button>`;
  }
  return `
    <div class="resd-row ${kind}">
      <div class="resd-time">${fmtTime(a.hour)}</div>
      <div class="resd-avatar">${esc(getInitials(pt?.name || ''))}</div>
      <div class="resd-info">
        <div class="resd-name">${esc(pt?.name || 'Paciente')} ${refTag}</div>
        <div class="resd-meta">${meta}</div>
      </div>
      <div class="resd-actions">${actions}</div>
    </div>`;
}

export function renderResumen() {
  const ds = fmtDate(state.currentDate);
  const dn = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('resumen-day-lbl').textContent =
    `${dn[state.currentDate.getDay()]} ${state.currentDate.getDate()} de ${mn[state.currentDate.getMonth()]} · Acciones de seguimiento de la jornada`;

  const ta   = state.appointments.filter(a => a.date === ds);
  const noAs = ta.filter(a => a.status === 'noas').sort((a, b) => a.hour - b.hour);
  const pend = ta.filter(a => a.status === 'pend').sort((a, b) => a.hour - b.hour);
  const conf = ta.filter(a => a.status === 'conf').sort((a, b) => a.hour - b.hour);

  let html = renderStatsBar(conf.length, pend.length, noAs.length);

  if (!ta.length) {
    html += `<div class="resd-empty">No hay citas registradas para hoy.</div>`;
    document.getElementById('resumen-content').innerHTML = html;
    return;
  }

  function section(list, kind, label, dotColor) {
    if (!list.length) return '';
    return `
      <div class="resd-section">
        <div class="resd-section-title">
          <span class="resd-sec-dot" style="background:${dotColor}"></span>
          ${label}
          <span class="resd-count">${list.length} cita${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${list.map(a => row(a, kind)).join('')}
      </div>`;
  }

  html += section(noAs, 'noas', 'No asistieron',            '#E24B4A');
  html += section(pend, 'pend', 'Pendientes de confirmar',  '#BA7517');
  html += section(conf, 'conf', 'Asistieron correctamente', '#1D9E75');

  document.getElementById('resumen-content').innerHTML = html;
}

export function simWA(nombre, tel) {
  const num = (tel || '').replace(/[^0-9]/g, '');
  if (!num) { toastErr('El paciente no tiene teléfono registrado. Agrégalo en su perfil.'); return; }
  const msg = encodeURIComponent('Hola ' + nombre + ', le contactamos desde Rehactiva Rehabilitación. Notamos que no pudo asistir a su cita de hoy. ¿Le ayudamos a reagendar?');
  window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
}

export function simEmail(nombre, email) {
  if (email) {
    window.location.href = `mailto:${email}?subject=Ausencia en cita - Rehactiva&body=Hola ${nombre},%0A%0ANotamos que no pudo asistir a su cita de hoy en Rehactiva Rehabilitación y Fisioterapia.%0A%0A¿Le podemos ayudar a reagendar? Responda este correo o llámenos.%0A%0ASaludos,%0AEquipo Rehactiva`;
  } else {
    alert(`${nombre} no tiene correo registrado. Agrégalo en su perfil.`);
  }
}

export function genResumenDiaAI() {
  const ds   = fmtDate(state.currentDate);
  const hoy  = state.appointments.filter(a => a.date === ds);
  const conf = hoy.filter(a => a.status === 'conf').length;
  const noas = hoy.filter(a => a.status === 'noas').length;
  const pend = hoy.filter(a => a.status === 'pend').length;
  const prompt = `Eres el asistente de Rehactiva, centro de rehabilitación en Quito.
Datos del día ${ds}:
- Citas totales: ${hoy.length}
- Asistieron: ${conf}
- No asistieron: ${noas}
- Pendientes: ${pend}

Genera un resumen del día en máximo 150 palabras con acciones de seguimiento para los no asistidos. Español, directo y profesional.`;
  window._app.callAI(prompt, 'resumen-ai-output');
}
