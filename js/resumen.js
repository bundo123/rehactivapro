import { state } from './state.js';
import { esc, fmtDate, fmtTime, getPatient, getTherapist, getDoctor, getInitials, getColor, safeColor, orderedTherapists,
         desgloseTipos, textoDesglose, waNumber } from './utils.js';
import { toastErr } from './toast.js';

// ── Filtro manual por terapeuta (chips junto al selector de fecha) ──
// Vive en el módulo, no en state: NO persiste entre visitas a la pestaña (showTab lo
// resetea con resetResumenTherapist), pero sí se conserva al navegar de fecha.
let resumenTherapist = null;

export function resetResumenTherapist() {
  resumenTherapist = null;
}

export function setResumenTherapist(id) {
  resumenTherapist = id ? String(id) : null;
  renderResumen();
}

function renderThChips() {
  const box = document.getElementById('resumen-th-chips');
  if (!box) return;
  const ths = orderedTherapists();
  if (ths.length < 2) { box.innerHTML = ''; return; }  // con 0 o 1 terapeuta el filtro no aporta
  const chip = (val, label, active) =>
    `<button type="button" class="resd-chip${active ? ' active' : ''}" aria-pressed="${active}" onclick="setResumenTherapist(${esc(JSON.stringify(val))})">${esc(label)}</button>`;
  box.innerHTML = chip('', 'Todos', !resumenTherapist)
    + ths.map(t => chip(String(t.id), t.name, resumenTherapist === String(t.id))).join('');
}

export function hasEvalInicial(p) {
  return (p.log || []).some(s => s.type === 'Evaluación inicial');
}

// Badge del sidebar: acciones pendientes de HOY (independiente de la fecha que se esté
// navegando en Agenda o en Resumen).
export function updateResumenBadge() {
  const ds = fmtDate(new Date());
  const n  = state.appointments.filter(a => a.date === ds && (a.status === 'pend' || a.status === 'noas')).length;
  const b  = document.getElementById('resumen-badge');
  if (!b) return;
  b.textContent = n; b.style.display = n > 0 ? '' : 'none';
}

// ── NUEVO 3: navegación de fecha del Resumen (estado propio: state.resumenDate) ──
export function changeResumenDay(d) {
  state.resumenDate.setDate(state.resumenDate.getDate() + d);
  renderResumen();
}

export function goToResumenDate(ds) {
  if (!ds) return;
  const p = ds.split('-');
  state.resumenDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  renderResumen();
}

export function resumenHoy() {
  state.resumenDate = new Date();
  renderResumen();
}

export function openResumenDatePicker() {
  const inp = document.getElementById('resumen-date-input');
  if (!inp) return;
  inp.value = fmtDate(state.resumenDate);
  inp.style.pointerEvents = 'auto';
  inp.showPicker ? inp.showPicker() : inp.click();
  setTimeout(() => inp.style.pointerEvents = 'none', 500);
}

// Franja de contadores: un solo panel con números grandes + barra de jornada segmentada.
function renderStrip(nConf, nPend, nNoas) {
  const total = nConf + nPend + nNoas;
  const pct = total > 0 ? Math.round(nConf / total * 100) : 0;
  const seg = (n, color) => n > 0 ? `<span style="flex:${n};background:${color}"></span>` : '';
  return `
    <div class="resd-strip">
      <div class="resd-strip-item"><span class="resd-strip-num g">${nConf}</span><span class="resd-strip-lbl">asistieron</span></div>
      <span class="resd-strip-div"></span>
      <div class="resd-strip-item"><span class="resd-strip-num y">${nPend}</span><span class="resd-strip-lbl">por confirmar</span></div>
      <span class="resd-strip-div"></span>
      <div class="resd-strip-item"><span class="resd-strip-num r">${nNoas}</span><span class="resd-strip-lbl">no asistió — requiere contacto</span></div>
      <div class="resd-journey">
        <div class="resd-journey-lbls"><span>Jornada del día</span><span><b style="color:#17865f">${pct}%</b> resuelta</span></div>
        <div class="resd-journey-bar">${seg(nConf,'#1D9E75')}${seg(nPend,'#E0A850')}${seg(nNoas,'#E24B4A')}${total===0?'<span style="flex:1;background:rgba(0,0,0,.06)"></span>':''}</div>
      </div>
    </div>`;
}

function row(a, kind) {
  const pt     = getPatient(a.patientId);
  const th     = getTherapist(a.therapistId);
  const c      = getColor(th?.colorId || 'ca');
  const doc    = pt?.doctorId ? getDoctor(pt.doctorId) : null;
  const dcol   = doc ? safeColor(doc.color) : '';
  const refTag = doc
    ? `<span class="resd-ref-tag" style="background:${dcol}18;color:${dcol};border-color:${dcol}44">${esc(doc.name)}</span>`
    : '';
  const metaParts = [esc(a.type || ''), th ? esc(th.name) : null];
  if (kind === 'noas' && pt?.tel) metaParts.push(esc(pt.tel));
  const meta = metaParts.filter(Boolean).join(' · ');
  let actions;
  if (kind === 'conf') {
    const hasSession = a.hasSession || false;
    const tieneEval  = pt ? hasEvalInicial(pt) : true;
    const evalBtn    = !tieneEval
      ? `<button class="resd-btn-eval" onclick="openEvalInicial(${esc(JSON.stringify(a.patientId))})">Eval. inicial pendiente</button>`
      : '';
    actions = hasSession
      ? `<span class="resd-btn-sess done">✓ Sesión registrada</span>${evalBtn}`
      : `<button class="resd-btn-sess" onclick="openSessionModal(window._app.appointments.find(x=>x.id===${esc(JSON.stringify(a.id))}))">Completar sesión</button>${evalBtn}`;
  } else {
    // Sin teléfono no hay chat posible: botón deshabilitado (antes abría un número fijo de la clínica).
    const waBtn = pt?.tel
      ? `<button class="resd-btn-wa" onclick="simWA(${esc(JSON.stringify(pt.name || ''))},${esc(JSON.stringify(pt.tel))})">WhatsApp</button>`
      : `<button class="resd-btn-wa" disabled title="Sin teléfono registrado — agrégalo en el perfil del paciente" style="opacity:.45;cursor:not-allowed">WhatsApp</button>`;
    actions = `
      ${waBtn}
      <button class="resd-btn-em"  onclick="simEmail(${esc(JSON.stringify(pt?.name || ''))},${esc(JSON.stringify(pt?.email || ''))})">Email</button>
      <button class="resd-btn-rep" onclick="openApptModal()">Reagendar</button>`;
  }
  return `
    <div class="resd-row">
      <span class="resd-time">${fmtTime(a.hour)}</span>
      <span class="resd-avatar" style="background:${c.bg};color:${c.text}">${esc(getInitials(pt?.name || ''))}</span>
      <div class="resd-info">
        <div class="resd-name">${esc(pt?.name || 'Paciente')} ${refTag}</div>
        <div class="resd-meta">${meta}</div>
      </div>
      <div class="resd-actions">${actions}</div>
    </div>`;
}

export function renderResumen() {
  const d  = state.resumenDate;
  const ds = fmtDate(d);
  const dn = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const lbl = document.getElementById('resumen-day-lbl');
  if (lbl) lbl.textContent = `${dn[d.getDay()]}, ${d.getDate()} de ${mn[d.getMonth()]} ${d.getFullYear()}`;

  // Si el terapeuta filtrado dejó de existir (borrado / realtime), volver a «Todos».
  if (resumenTherapist && !state.therapists.some(t => String(t.id) === resumenTherapist)) resumenTherapist = null;
  renderThChips();
  const thSel = resumenTherapist ? state.therapists.find(t => String(t.id) === resumenTherapist) : null;

  const ta   = state.appointments
    .filter(a => a.date === ds)
    .filter(a => !resumenTherapist || String(a.therapistId) === resumenTherapist);
  const noAs = ta.filter(a => a.status === 'noas').sort((a, b) => a.hour - b.hour);
  const pend = ta.filter(a => a.status === 'pend').sort((a, b) => a.hour - b.hour);
  const conf = ta.filter(a => a.status === 'conf').sort((a, b) => a.hour - b.hour);

  let html = renderStrip(conf.length, pend.length, noAs.length);

  if (!ta.length) {
    html += `<div class="resd-empty">${thSel ? `No hay citas de ${esc(thSel.name)} para este día.` : 'No hay citas registradas para este día.'}</div>`;
    document.getElementById('resumen-content').innerHTML = html;
    return;
  }

  function section(list, kind, label, dotColor) {
    if (!list.length) return '';
    // Desglose por servicio junto al contador. textoDesglose devuelve '' cuando el bloque es todo
    // fisioterapia: ahí repetiría el número que tiene al lado y no aportaría nada.
    const desglose = textoDesglose(desgloseTipos(list));
    return `
      <div class="resd-box ${kind}">
        <div class="resd-head">
          <span class="resd-sec-dot" style="background:${dotColor}"></span>
          <span class="resd-sec-title">${label}</span>
          <span class="resd-count">${list.length} cita${list.length !== 1 ? 's' : ''}</span>
          ${desglose ? `<span class="resd-desglose">${esc(desglose)}</span>` : ''}
        </div>
        ${list.map(a => row(a, kind)).join('')}
      </div>`;
  }

  html += section(noAs, 'noas', 'No asistieron',            '#E24B4A');
  html += section(pend, 'pend', 'Pendientes de confirmar',  '#E0A850');
  html += section(conf, 'conf', 'Asistieron correctamente', '#1D9E75');

  document.getElementById('resumen-content').innerHTML = html;
}

export function simWA(nombre, tel) {
  const num = waNumber(tel);   // CORR-12: wa.me exige código de país; sin el 593 WhatsApp rechaza el link
  if (!num) { toastErr('El paciente no tiene teléfono registrado. Agrégalo en su perfil.'); return; }
  const msg = encodeURIComponent('Hola ' + nombre + ', le contactamos desde Rehactiva Rehabilitación. Notamos que no pudo asistir a su cita de hoy. ¿Le ayudamos a reagendar?');
  window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
}

export function simEmail(nombre, email) {
  if (email) {
    window.location.href = `mailto:${email}?subject=Ausencia en cita - Rehactiva&body=Hola ${nombre},%0A%0ANotamos que no pudo asistir a su cita de hoy en Rehactiva Rehabilitación y Fisioterapia.%0A%0A¿Le podemos ayudar a reagendar? Responda este correo o llámenos.%0A%0ASaludos,%0AEquipo Rehactiva`;
  } else {
    toastErr(`${nombre} no tiene correo registrado. Agrégalo en su perfil.`);
  }
}

export function genResumenDiaAI() {
  const ds   = fmtDate(state.resumenDate);
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
