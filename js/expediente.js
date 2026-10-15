// ── B2b-1: EXPEDIENTE del paciente — una pantalla con todo lo suyo ──
// Encabezado plano (datos, diagnóstico, episodio, sesiones, próxima cita) + sub-pestañas Resumen ·
// Órdenes · Documentos · Sesiones. Sin tarjetas ni paneles por sección: títulos .rpt-sec-title y
// filas separadas por línea fina; las únicas tarjetas son las miniaturas de documentos.
// El cálculo vive en expediente-calc.js (puro, probado en node); acá solo se pinta. Órdenes y
// documentos se pintan con sus propios módulos (ordenes.js, documentos.js): ya no hay modales.
// Puerta de entrada: abrirExpediente(id) (lista de Pacientes, Informe paciente) o el buscador.
import { state } from './state.js';
import { esc, dmy, fmtDate, fmtTime, getTherapist, waNumber, tipoSesion } from './utils.js';
import { citasDePaciente, estadoHistorial } from './historial-calc.js';
import { resumenExpediente, proximasCitas, sesionesEpisodioExp } from './expediente-calc.js';
import { crearComboPaciente } from './patient-combo.js';
import { canAccessTab, hasPermission } from './permissions.js';
import { toastErr } from './toast.js';
import { htmlPanelEpisodios } from './episodios.js';
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

function _htmlResumen(p) {
  const citas = citasDePaciente(state.appointments, p.id);
  const hoy = fmtDate(new Date());
  const r = resumenExpediente(p, citas, hoy, state.doctors);
  // Episodios: el bloque del informe tal cual (htmlPanelEpisodios); el CSS de .exp-eps le quita la caja.
  const eps = htmlPanelEpisodios(p);
  const epsHtml = eps ? `<section class="exp-sec exp-eps">${eps}
      ${hasPermission('newEpisode') ? `<button type="button" class="th-btn exp-eps-nuevo" onclick='nuevoEpisodio(${_js(p.id)})'>Nuevo episodio</button>` : ''}
    </section>` : '';

  const ev = r.evalInicial
    ? `<div class="exp-fila">${esc(r.evalInicial.fecha ? dmy(r.evalInicial.fecha) : '—')} · EVA ${r.evalInicial.eva != null ? esc(String(r.evalInicial.eva)) + '/10' : 'sin medir'}</div>`
    : `<div class="exp-fila exp-mute">Sin evaluación inicial.${hasPermission('evalInicial')
      ? ` <button type="button" class="th-btn" onclick='openEvalInicial(${_js(p.id)})'>Registrar evaluación inicial</button>` : ''}</div>`;

  const ult = sesionesEpisodioExp(p, { citas, therapists: state.therapists }).slice(0, 5);
  const ultHtml = ult.length ? `<div class="exp-filas">${ult.map(s => `<div class="exp-fila">
      <span class="exp-f-fecha">${esc(dmy(s.fecha))}</span><span>${esc(s.tipo)}</span>
      <span class="exp-f-eva">EVA ${esc(s.eva)}</span><span class="exp-mute">${esc(s.terapeuta)}</span></div>`).join('')}</div>`
    : '<div class="orden-empty">Sin sesiones en el episodio actual.</div>';

  const prox = proximasCitas(citas, hoy, 3);
  const proxHtml = prox.length ? `<div class="exp-filas">${prox.map(a => `<div class="exp-fila">
      <span class="exp-f-fecha">${esc(dmy(a.date))}</span><span>${esc(fmtTime(a.hour))}</span>
      <span>${esc(getTherapist(a.therapistId)?.name || '—')}</span><span class="exp-mute">${esc(tipoSesion(a.type))} · ${esc(estadoHistorial(a, hoy).label)}</span></div>`).join('')}</div>`
    : '<div class="orden-empty">Sin citas próximas.</div>';

  return epsHtml
    + _sec('Evaluación inicial', '', ev)
    + _sec('Últimas sesiones', hasPermission('registerSession')
      ? `<button type="button" class="th-btn" onclick='openSessionModalManual(${_js(p.id)})'>+ Sesión manual</button>` : '', ultHtml)
    + _sec('Próximas citas', `<button type="button" class="th-btn" onclick='irAHistorial(${_js(p.id)})'>Historial de citas</button>`, proxHtml);
}

function _htmlSesiones(p) {
  const citas = citasDePaciente(state.appointments, p.id);
  const filas = sesionesEpisodioExp(p, { citas, therapists: state.therapists });
  const acc = `<button type="button" class="th-btn" onclick='irAHistorial(${_js(p.id)})'>Historial de citas</button>
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
