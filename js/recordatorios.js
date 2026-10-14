// ── REC-0: recordatorios de citas por WhatsApp en un clic (wa.me) desde el Resumen del día ──
// La recepción abre el modal, ve las citas del día elegido (por defecto mañana) y por cada una
// abre WhatsApp con el mensaje ya escrito. No se envía nada solo: wa.me abre el chat y la persona
// toca «Enviar». La marca «✓ enviado» vive en memoria (se pierde al recargar); la persistencia es
// del Bloque B.
//
// Lo de arriba es PURO (sin DOM ni state) para poder probarlo con node --test; lo de abajo pinta.
import { state } from './state.js';
import { esc, fmtDate, getPatient, getTherapist, tipoSesion, waNumber, fmtFechaCorta } from './utils.js';
import { hasPermission } from './permissions.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function _fecha(ds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function _sumarDias(ds, n) {
  const d = _fecha(ds);
  if (!d) return '';
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

// Fecha que abre el modal: mañana; si hoy es sábado, el lunes (el domingo no se atiende).
export function fechaRecordatorioDefault(hoy = new Date()) {
  const ds = fmtDate(hoy);
  return _sumarDias(ds, hoy.getDay() === 6 ? 2 : 1);
}

// Citas a recordar de un día: confirmadas o pendientes (la 'no asistió' no), por hora.
export function citasRecordatorio(appointments, ds) {
  return (appointments || [])
    .filter(a => a && a.date === ds && (a.status === 'conf' || a.status === 'pend'))
    .sort((a, b) => (Number(a.hour) || 0) - (Number(b.hour) || 0));
}

// Número de celular para wa.me (593 + 9 dígitos que empiezan con 9), o '' si el teléfono no es un
// celular de Ecuador: un fijo ('02 234 5678') pasa waNumber pero WhatsApp no lo abre.
export function waCelular(tel) {
  const n = waNumber(tel);
  return /^5939\d{8}$/.test(n) ? n : '';
}

// '9:30' → '09:30'.
export function horaHHMM(h) {
  const t = Math.round((Number(h) || 0) * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(((t % 60) + 60) % 60).padStart(2, '0')}`;
}

// "mañana martes 15/10" si la cita es mañana respecto de `hoy`; si no, "el lunes 19/10".
export function cuandoRecordatorio(ds, hoy = new Date()) {
  const d = _fecha(ds);
  if (!d) return '';
  const dia = `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return ds === _sumarDias(fmtDate(hoy), 1) ? `mañana ${dia}` : `el ${dia}`;
}

// El mensaje. Sin datos clínicos: nombre de pila, tipo de servicio, día, hora y terapeuta.
export function mensajeRecordatorio(cita, paciente, terapeuta, hoy = new Date()) {
  const nombre = String(paciente?.name || '').trim().split(/\s+/)[0] || '';
  const tipo = tipoSesion(cita?.type).toLowerCase();
  const con = terapeuta?.name ? ` con ${terapeuta.name}` : '';
  return `Hola${nombre ? ' ' + nombre : ''}, le recordamos su cita de ${tipo} en Rehactiva ${cuandoRecordatorio(cita?.date, hoy)} `
    + `a las ${horaHHMM(cita?.hour)}${con}. Si no puede asistir, avísenos por este medio. ¡Gracias!`;
}

// Filas del modal: una por cita, con el link de wa.me o url null (sin celular → botón deshabilitado).
export function filasRecordatorio(appointments, ds, getPacienteFn, getTerapeutaFn, hoy = new Date()) {
  return citasRecordatorio(appointments, ds).map(a => {
    const p = getPacienteFn ? getPacienteFn(a.patientId) : null;
    const t = getTerapeutaFn ? getTerapeutaFn(a.therapistId) : null;
    const num = waCelular(p?.tel);
    return {
      cita: a,
      hora: horaHHMM(a.hour),
      paciente: p?.name || a.patientName || 'Paciente',
      terapeuta: t?.name || '—',
      tipo: tipoSesion(a.type),
      url: num ? `https://wa.me/${num}?text=${encodeURIComponent(mensajeRecordatorio(a, p, t, hoy))}` : null,
    };
  });
}

// ── Pantalla ──
const _enviados = new Set();   // ids de cita ya abiertos en WhatsApp (solo en memoria)
let _fechaSel = null;

export function abrirRecordatorios() {
  if (!hasPermission('createAppt')) { window._app.toastErr('No tienes permisos para enviar recordatorios.'); return; }
  _fechaSel = fechaRecordatorioDefault(new Date());
  const inp = document.getElementById('rec-fecha');
  if (inp) inp.value = _fechaSel;
  renderRecordatorios();
  document.getElementById('recordatorios-modal')?.classList.add('open');
}

export function cambiarFechaRecordatorios(ds) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ds || ''))) return;
  _fechaSel = ds;
  renderRecordatorios();
}

export function renderRecordatorios() {
  const box = document.getElementById('rec-lista');
  if (!box || !_fechaSel) return;
  const hoy = new Date();
  const esManana = _fechaSel === _sumarDias(fmtDate(hoy), 1);
  const filas = filasRecordatorio(state.appointments, _fechaSel, getPatient, getTherapist, hoy);
  const tit = document.getElementById('rec-titulo');
  if (tit) tit.textContent = esManana ? 'Recordatorios de mañana' : `Recordatorios del ${fmtFechaCorta(_fechaSel)}`;
  if (!filas.length) {
    box.innerHTML = `<div class="rec-vacio">No hay citas para ${esManana ? 'mañana' : 'el ' + esc(fmtFechaCorta(_fechaSel))}.</div>`;
    return;
  }
  box.innerHTML = filas.map(f => {
    const id = esc(JSON.stringify(String(f.cita.id)));
    const enviado = _enviados.has(String(f.cita.id));
    const btn = f.url
      ? `<button type="button" class="resd-btn-wa" onclick="enviarRecordatorio(${id})">WhatsApp</button>`
      : `<button type="button" class="resd-btn-wa" disabled title="Sin celular" aria-label="WhatsApp: sin celular" style="opacity:.45;cursor:not-allowed">WhatsApp</button>`;
    return `<div class="rec-fila${enviado ? ' rec-enviado' : ''}">
      <span class="rec-hora">${esc(f.hora)}</span>
      <div class="rec-info"><div class="rec-pac">${esc(f.paciente)}</div>
        <div class="rec-meta">${esc(f.terapeuta)} · ${esc(f.tipo)}</div></div>
      <div class="rec-acc">${enviado ? '<span class="rec-ok">✓ enviado</span>' : ''}${btn}</div>
    </div>`;
  }).join('');
}

export function enviarRecordatorio(citaId) {
  const f = filasRecordatorio(state.appointments, _fechaSel, getPatient, getTherapist, new Date())
    .find(x => String(x.cita.id) === String(citaId));
  if (!f || !f.url) return;
  window.open(f.url, '_blank');
  _enviados.add(String(citaId));
  renderRecordatorios();
}
