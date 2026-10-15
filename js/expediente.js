// ── B2b-1: EXPEDIENTE del paciente — una pantalla con todo lo suyo ──
// Encabezado plano (datos, diagnóstico, episodio, sesiones, próxima cita) + sub-pestañas Resumen ·
// Órdenes · Documentos · Sesiones. Sin tarjetas ni paneles por sección: títulos .rpt-sec-title y
// filas separadas por línea fina (EXP-2: también los documentos, sin tarjetas).
// El cálculo vive en expediente-calc.js (puro, probado en node); acá solo se pinta. Órdenes y
// documentos se pintan con sus propios módulos (ordenes.js, documentos.js): ya no hay modales.
// EXP-2: Resumen = Pendientes + Datos por completar + Episodios (para todos los roles).
// Puerta de entrada: abrirExpediente(id) (lista de Pacientes, Informe paciente) o el buscador.
import { state } from './state.js';
import { esc, dmy, fmtDate, waNumber } from './utils.js';
import { citasDePaciente } from './historial-calc.js';
import { resumenExpediente, sesionesEpisodioExp, pendientesExpediente, datosFaltantes } from './expediente-calc.js';
import { crearComboPaciente } from './patient-combo.js';
import { canAccessTab, hasPermission } from './permissions.js';
import { toastErr } from './toast.js';
import { htmlListaEpisodios } from './episodios.js';
import { htmlOrdenes, pintarOrdenes } from './ordenes.js';
import { htmlDocumentos, pintarDocumentos } from './documentos.js';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'ordenes', label: 'Órdenes' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'sesiones', label: 'Sesiones' },
];
let _combo = null;

const $ = id => document.getElementById(id);
const _js = v => esc(JSON.stringify(v));   // id seguro dentro de onclick='…'
const _paciente = () => state.expedienteId == null ? null
  : state.patients.find(p => String(p.id) === String(state.expedienteId)) || null;

// Una vez al arrancar (main.js), como setupHistorial: el combo vive en el main-header y sobrevive
// a los re-render, que solo tocan #exp-content.
export function setupExpediente() {
  _combo = crearComboPaciente({
    inputId: 'exp-search', resultsId: 'exp-results', hiddenId: 'exp-select',
    onSelect: id => _fijarPaciente(id) && renderExpediente(),
  });
}

// true si cambió de paciente. Un paciente nuevo arranca en Resumen.
function _fijarPaciente(id) {
  const nuevo = id != null ? String(id) : null;
  if (nuevo === state.expedienteId) return false;
  state.expedienteId = nuevo;
  state.expedienteTab = 'resumen';
  return true;
}

export function abrirExpediente(id) {
  if (!canAccessTab('expediente')) { toastErr('No tienes permisos para acceder a esta sección'); return; }
  _fijarPaciente(id);
  window._app.showTab('expediente');   // showTab → renderExpediente()
}

export function renderExpediente() {
  const out = $('exp-content'); if (!out) return;
  const p = _paciente();
  _combo?.setValue(p ? p.id : '');
  if (!p) {
    out.innerHTML = '<div class="exp-vacio">Busca un paciente o ábrelo desde la lista de Pacientes.</div>';
    return;
  }
  const tab = TABS.some(t => t.id === state.expedienteTab) ? state.expedienteTab : 'resumen';
  out.innerHTML = `<div id="exp-head" class="exp-head"></div>
    <div class="sub-tabs exp-tabs" role="tablist" aria-label="Secciones del expediente">${TABS.map(t =>
      `<button type="button" class="sub-tab${t.id === tab ? ' active' : ''}" role="tab" aria-selected="${t.id === tab}" onclick="cambiarTabExpediente('${t.id}')">${t.label}</button>`).join('')}</div>
    <div id="exp-body" class="exp-body"></div>`;
  _pintarEncabezado(p);
  _pintarCuerpo(p, tab);
}

export function cambiarTabExpediente(tab) {
  if (!TABS.some(t => t.id === tab)) return;
  state.expedienteTab = tab;
  const p = _paciente(); if (!p) return;
  document.querySelectorAll('#exp-content .exp-tabs .sub-tab').forEach((b, i) => {
    const on = TABS[i].id === tab;
    b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
  });
  _pintarCuerpo(p, tab);
}

// Repinta tras un cambio del paciente abierto (sesión, ficha, episodio, orden, realtime). No toca
// las pestañas con formulario a medio llenar: en Órdenes solo la lista; en Documentos, nada.
export function refrescarExpediente(pid) {
  if (state.currentTab !== 'expediente') return;
  if (pid != null && String(pid) !== String(state.expedienteId)) return;
  const p = _paciente();
  if (!p || !$('exp-head')) { renderExpediente(); return; }
  _pintarEncabezado(p);
  const tab = state.expedienteTab;
  if (tab === 'resumen' || tab === 'sesiones') _pintarCuerpo(p, tab);
  else if (tab === 'ordenes') pintarOrdenes();
}

// ── Encabezado ──
function _pintarEncabezado(p) {
  const box = $('exp-head'); if (!box) return;
  const citas = citasDePaciente(state.appointments, p.id);
  const r = resumenExpediente(p, citas, fmtDate(new Date()), state.doctors);
  const estado = p.status === 'alta' ? '<span class="pill pgr">Alta médica</span>'
    : p.status !== 'active' ? '<span class="pill pa">Pendiente</span>' : '';
  const tel = waNumber(p.tel);
  const telHtml = p.tel ? (tel
    ? `<a href="https://wa.me/${tel}" target="_blank" rel="noopener" title="Escribir por WhatsApp">${esc(p.tel)}</a>`
    : esc(p.tel)) : '';
  const linea1 = [r.edad !== 'Sin edad' ? esc(r.edad) : '', esc(r.sexoTxt), p.cedula ? `C.I. ${esc(p.cedula)}` : '',
    telHtml, p.email ? esc(p.email) : ''].filter(Boolean);
  const sesiones = r.plan ? `Sesiones ${r.hechas} de ${r.plan}` : `Sesiones ${r.hechas}`;
  const linea2 = [
    `<span class="exp-dato"><span class="rpt-lbl">Diagnóstico</span> ${esc(r.diagTxt)}</span>`,
    `<span class="exp-dato"><span class="rpt-lbl">Médico</span> ${esc(r.doctorTxt)}</span>`,
    `<span class="exp-dato"><span class="rpt-lbl">Episodio actual</span> ${r.episodioDesde ? `desde ${esc(dmy(r.episodioDesde))}` : 'desde el inicio'}</span>`,
    `<span class="exp-dato">${esc(sesiones)}${r.previas ? ` <span class="exp-mute">(incl. ${r.previas} previa${r.previas === 1 ? '' : 's'})</span>` : ''}</span>`,
    `<span class="exp-dato"><span class="rpt-lbl">Próxima cita</span> ${r.proximaCita ? esc(dmy(r.proximaCita)) : '—'}</span>`,
    `<span class="exp-dato"><span class="rpt-lbl">Última sesión</span> ${r.ultimaSesion ? esc(dmy(r.ultimaSesion)) : '—'}</span>`,
  ];
  const acc = [
    hasPermission('editPatient') ? `<button type="button" class="side-btn outline" onclick='openEditPatient(${_js(p.id)})'>Editar</button>` : '',
    `<button type="button" class="side-btn outline" onclick='verPaciente(${_js(p.id)})'>Informe</button>`,
    hasPermission('createAppt') ? `<button type="button" class="side-btn primary" onclick='agendarCitaParaPaciente(${_js(p.id)})'>Agendar cita</button>` : '',
  ].join('');
  box.innerHTML = `<div class="exp-head-txt">
      <div class="exp-nombre-row"><h2 class="exp-nombre">${esc(p.name)}</h2>${estado}${r.sinEval ? '<span class="pill pa">Sin eval.</span>' : ''}</div>
      ${linea1.length ? `<div class="exp-linea">${linea1.join('<span class="exp-sep">·</span>')}</div>` : ''}
      <div class="exp-linea exp-linea2">${linea2.join('')}</div>
    </div>
    <div class="exp-acts">${acc}</div>`;
}

// ── Cuerpo por sub-pestaña ──
function _pintarCuerpo(p, tab) {
  const body = $('exp-body'); if (!body) return;
  if (tab === 'ordenes') { body.innerHTML = htmlOrdenes(); pintarOrdenes(); return; }
  if (tab === 'documentos') { body.innerHTML = htmlDocumentos(); pintarDocumentos(); return; }
  body.innerHTML = tab === 'sesiones' ? _htmlSesiones(p) : _htmlResumen(p);
}

const _sec = (titulo, acc, cuerpo) => `<section class="exp-sec">
    <div class="rpt-sec-title exp-sec-head"><span>${titulo}</span>${acc ? `<span class="exp-sec-acc">${acc}</span>` : ''}</div>
    ${cuerpo}
  </section>`;

// Acción de un pendiente (tipo de pendientesExpediente) → botón o enlace. El permiso ya lo filtró
// expediente-calc (ctx.puede): una acción null es solo texto.
function _accionPendiente(p, a) {
  if (!a) return '';
  const id = _js(p.id);
  const on = {
    evalInicial: `openEvalInicial(${id})`, editar: `openEditPatient(${id})`, agendar: `agendarCitaParaPaciente(${id})`,
    historial: `irAHistorial(${id})`, ordenes: `cambiarTabExpediente("ordenes")`,
  }[a.tipo];
  if (!on) return '';
  const enlace = a.tipo === 'ordenes' || a.tipo === 'historial';
  return `<button type="button" class="${enlace ? 'exp-link' : 'th-btn'}" onclick='${on}'>${esc(a.label)}</button>`;
}

function _htmlResumen(p) {
  const citas = citasDePaciente(state.appointments, p.id);
  const pend = pendientesExpediente(p, citas, fmtDate(new Date()), { puede: hasPermission });
  const pendHtml = pend.length ? `<div class="exp-filas">${pend.map(x => `<div class="exp-fila exp-pend" data-clave="${esc(x.clave)}">
      <span class="exp-pend-txt">${esc(x.texto)}</span>${_accionPendiente(p, x.accion)}</div>`).join('')}</div>`
    : '<div class="orden-empty">Nada pendiente.</div>';

  const faltan = datosFaltantes(p);
  const datosHtml = faltan.length ? _sec('Datos por completar', '', `<div class="exp-fila exp-pend">
      <span class="exp-pend-txt">Datos por completar: ${esc(faltan.join(', '))}</span>
      ${hasPermission('editPatient') ? `<button type="button" class="th-btn" onclick='openEditPatient(${_js(p.id)})'>Editar</button>` : ''}</div>`) : '';

  const nuevoEp = hasPermission('newEpisode')
    ? `<button type="button" class="th-btn" onclick='nuevoEpisodio(${_js(p.id)})'>Nuevo episodio</button>` : '';
  return _sec('Pendientes', '', pendHtml)
    + datosHtml
    + _sec('Episodios', nuevoEp, htmlListaEpisodios(p, { acciones: true }));
}

function _htmlSesiones(p) {
  const citas = citasDePaciente(state.appointments, p.id);
  const filas = sesionesEpisodioExp(p, { citas, therapists: state.therapists });
  // EXP-2: «+ Sesión manual» vivía en «Últimas sesiones» del Resumen, que ya no existe.
  const acc = `${hasPermission('registerSession') ? `<button type="button" class="th-btn" onclick='openSessionModalManual(${_js(p.id)})'>+ Sesión manual</button>` : ''}
    <button type="button" class="th-btn" onclick='irAHistorial(${_js(p.id)})'>Historial de citas</button>
    <button type="button" class="th-btn" onclick='verPaciente(${_js(p.id)})'>Informe</button>`;
  const tabla = filas.length ? `<div class="rpt-table-wrap"><table class="exp-tabla">
      <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Lugar</th><th>EVA</th><th>Terapeuta</th><th>Técnicas</th></tr></thead>
      <tbody>${filas.map(s => `<tr${s.asistio ? '' : ' class="exp-mute"'}>
        <td class="exp-nw">${esc(dmy(s.fecha))}</td><td class="exp-nw">${esc(s.hora || '—')}</td><td>${esc(s.tipo)}</td>
        <td>${esc(s.lugar)}</td><td class="exp-nw">${esc(s.eva)}</td><td>${esc(s.terapeuta)}</td>
        <td class="exp-tec"${s.tecnicas ? ` title="${esc(s.tecnicas)}"` : ''}>${esc(s.tecnicas || '—')}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="orden-empty">Sin sesiones en el episodio actual.</div>';
  return _sec(`Sesiones del episodio actual (${filas.length})`, acc, tabla);
}
