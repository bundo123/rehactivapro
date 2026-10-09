// EPI-2a: bloque "Episodios" del panel derecho de Informe paciente (permiso newEpisode).
// Lista del más nuevo al más viejo con su rango y sesiones; "Editar" (nombre, sesiones previas,
// inicio y, en los cerrados, diagnóstico y plan) y "Unir con el anterior" (no en el primero), con
// confirmación dentro de la app. Las escrituras que mueven fronteras van por las funciones del SQL
// (mover_inicio, unir_con_anterior: atómicas y con la RLS del usuario); el resto es un UPDATE.
// Después de cada cambio se relee el paciente y sus episodios de la DB (la verdad la tiene el SQL).
import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, dmy, getPatient, mapEpisodioRow, episodiosOrdenados, validarInicio, fechasParaInicio,
         diagOptionsHtml, diagSync, textoPrevias } from './utils.js';
import { filasEpisodios } from './historial-calc.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';

const $ = id => document.getElementById(id);
let _ctx = null;   // { pid, i, ep } del episodio abierto en el modal
let _ocupado = false;

// Relee de la DB lo que las funciones de episodios cambian: el diagnóstico/plan/CIE-10 del paciente
// y sus episodios. Mismo mapeo que la carga inicial.
export async function recargarEpisodiosPaciente(pid) {
  const p = getPatient(pid); if (!p) return false;
  const [pr, eps] = await Promise.all([
    supa.from('patients').select('diag,cie10,cie10_desc,protocol_id,sessions,status').eq('id', pid).single(),
    supa.from('episodios').select('*').eq('patient_id', pid),
  ]);
  if (pr.error || eps.error) return false;
  const r = pr.data;
  p.diag = r.diag || 'Sin diagnóstico'; p.cie10 = r.cie10 || null; p.cie10Desc = r.cie10_desc || null;
  p.protocolId = r.protocol_id || null; p.sessions = r.sessions || 10; p.status = r.status || 'active';
  p.episodios = (eps.data || []).map(mapEpisodioRow);
  return true;
}

// Repinta lo que depende de los episodios (selector del informe, agenda, historial, badges).
function _repintar() {
  const a = window._app || {};
  if (state.currentTab === 'paciente_rpt') a.updateEpisodes?.();
  else if (state.currentTab === 'agenda') a.renderGrid?.();
  else if (state.currentTab === 'historial') a.renderHistorial?.();
  a.renderPatients?.();
  a.updateResumenBadge?.(); a.updateFacturaBadge?.();
}

function _rango(e) {
  const ini = e.inicio ? dmy(e.inicio) : 'Desde el inicio';
  const fin = e.actual ? 'hoy' : dmy(e.hasta);
  return `${ini} – ${fin}`;
}

// HTML del bloque (side-card). Sin permiso, nada. Sin filas en la tabla (antes del SQL) se lista
// el episodio implícito sin acciones.
export function htmlPanelEpisodios(p) {
  if (!p || !hasPermission('newEpisode')) return '';
  const filas = filasEpisodios(p);
  const reales = (p.episodios || []).length > 0;
  const items = filas.map(e => {
    const previas = e.previas ? ` (+${e.previas} previa${e.previas === 1 ? '' : 's'})` : '';
    const plan = e.plan != null ? ` de ${e.plan}` : '';
    const acc = reales && e.id ? `<div class="ep-acc">
        <button type="button" class="ep-btn" onclick="editarEpisodio('${esc(p.id)}',${e.i})">Editar</button>
        ${e.i > 0 ? `<button type="button" class="ep-btn" onclick="pedirUnirEpisodio('${esc(p.id)}',${e.i})">Unir con el anterior</button>` : ''}
      </div>` : '';
    return `<div class="ep-item${e.actual ? ' actual' : ''}">
      <div class="ep-tit">${esc(e.etiqueta)}${e.actual ? ' <span class="ep-tag">actual</span>' : ''}</div>
      <div class="ep-meta">${esc(_rango(e))}</div>
      <div class="ep-meta">${esc(`${e.hechas} ${e.hechas === 1 ? 'sesión' : 'sesiones'}${previas}${plan}`)}</div>
      ${acc}
    </div>`;
  }).join('');
  return `<div class="side-card"><div class="side-title">Episodios</div><div class="ep-list">${items}</div></div>`;
}

// ── Editar ──
export function editarEpisodio(pid, i) {
  if (!hasPermission('newEpisode')) { toastErr('No tienes permisos para editar episodios.'); return; }
  const p = getPatient(pid); if (!p) return;
  const eps = episodiosOrdenados(p);
  const ep = eps[i]; if (!ep?.id) return;
  const actual = i === eps.length - 1;
  _ctx = { pid, i, ep };
  const fila = filasEpisodios(p).find(f => f.i === i);
  const fechas = i > 0 ? fechasParaInicio(p, state.appointments, i) : [];
  const diagActual = actual ? p.diag : (ep.diag || 'Tratamiento anterior');
  const diagSel = diagOptionsHtml(state.protocols)
    .replace('— Sin diagnóstico —', `— Sin cambiar: ${esc(diagActual)} —`);
  $('episodio-modal-title').textContent = 'Editar episodio';
  $('episodio-modal-body').innerHTML = `
    <div class="ep-sub">${esc(fila?.etiqueta || '')} · ${esc(fila ? _rango(fila) : '')}</div>
    <div class="field"><label>Nombre del episodio <span class="ep-opc">(opcional)</span></label>
      <input type="text" id="ep-nombre" maxlength="80" value="${esc(ep.nombre || '')}" placeholder="${esc(diagActual)}"></div>
    <div class="field"><label>Sesiones previas a RehactivaPro</label>
      <input type="number" id="ep-previas" min="0" max="200" step="1" inputmode="numeric" value="${esc(String(ep.sesionesPrevias || 0))}">
      <div class="ne-note">Se suman solo en lo que se muestra (agenda e informe). No se cobran.</div></div>
    ${i > 0 ? `<div class="field"><label>Empieza el</label>
      <select id="ep-desde">${fechas.map(d => `<option value="${esc(d)}"${d === ep.desde ? ' selected' : ''}>${esc(dmy(d))}</option>`).join('')}</select>
      <div class="ne-note">Fechas con sesiones o citas entre el episodio anterior y el siguiente.</div></div>`
    : '<div class="ne-note">Es el primer episodio: empieza desde el inicio.</div>'}
    ${actual ? '<div class="ne-note">Episodio actual: el diagnóstico y el plan se editan en la ficha del paciente.</div>' : `
    <div class="field"><label>Diagnóstico</label><select id="ep-diag">${diagSel}</select></div>
    <div class="field"><label>Sesiones del plan</label>
      <input type="number" id="ep-plan" min="0" max="200" step="1" inputmode="numeric" value="${ep.sesionesPlan != null ? esc(String(ep.sesionesPlan)) : ''}"></div>`}
    <div id="ep-error" class="ep-error" role="alert" style="display:none"></div>`;
  if (!actual && ep.protocolId) { const s = $('ep-diag'); if (s) s.value = String(ep.protocolId); }
  $('episodio-modal-ok').textContent = 'Guardar';
  $('episodio-modal-ok').className = 'btn-save';
  $('episodio-modal-ok').onclick = guardarEpisodio;
  $('episodio-modal').classList.add('open');
}

function _error(msg) {
  const el = $('ep-error'); if (!el) { toastErr(msg); return; }
  el.textContent = msg; el.style.display = msg ? '' : 'none';
}

function _entero(v, min, max) {
  const t = String(v ?? '').trim();
  if (t === '') return { vacio: true };
  const n = Number(t);
  return Number.isInteger(n) && n >= min && n <= max ? { n } : { malo: true };
}

export async function guardarEpisodio() {
  if (_ocupado || !_ctx) return;
  const { pid, i, ep } = _ctx;
  const p = getPatient(pid); if (!p) return;
  const eps = episodiosOrdenados(p);
  const actual = i === eps.length - 1;
  const nombre = ($('ep-nombre')?.value || '').trim();
  const previas = _entero($('ep-previas')?.value, 0, 200);
  if (previas.malo) { _error('Sesiones previas: un número entero de 0 a 200.'); return; }
  const cambios = { nombre: nombre || null, sesiones_previas: previas.vacio ? 0 : previas.n };
  if (!actual) {
    const plan = _entero($('ep-plan')?.value, 0, 200);
    if (plan.malo) { _error('Sesiones del plan: un número entero de 0 a 200, o vacío.'); return; }
    cambios.sesiones_plan = plan.vacio ? null : plan.n;
    const protId = $('ep-diag')?.value || '';
    if (protId && String(protId) !== String(ep.protocolId || '')) {
      const d = diagSync(state.protocols, protId, ep.diag || '');
      // El CIE-10 de la foto era del diagnóstico anterior: no se arrastra al nuevo.
      Object.assign(cambios, { diag: d.diag, protocol_id: d.protocolId, cie10: null, cie10_desc: null });
    }
  }
  const nuevoDesde = i > 0 ? ($('ep-desde')?.value || ep.desde) : null;
  if (i > 0 && nuevoDesde !== ep.desde) {
    const err = validarInicio(eps, i, nuevoDesde);
    if (err) { _error(err); return; }
  }
  _ocupado = true; _error('');
  try {
    if (i > 0 && nuevoDesde !== ep.desde) {
      const { error } = await supa.rpc('mover_inicio', { p_episodio: ep.id, p_desde: nuevoDesde });
      if (error) { _error('No se pudo mover el inicio: ' + error.message); return; }
    }
    const { data, error } = await supa.from('episodios').update(cambios).eq('id', ep.id).select('id');
    if (error || !data?.length) { _error('No se pudo guardar el episodio' + (error ? ': ' + error.message : ' (sin permiso).')); await recargarEpisodiosPaciente(pid); _repintar(); return; }
    await recargarEpisodiosPaciente(pid);
    window._app?.closeModal?.('episodio-modal');
    _ctx = null;
    toastOk('Episodio actualizado ✓');
    _repintar();
  } finally { _ocupado = false; }
}

// ── Unir con el anterior ──
export function pedirUnirEpisodio(pid, i) {
  if (!hasPermission('newEpisode')) { toastErr('No tienes permisos para editar episodios.'); return; }
  const p = getPatient(pid); if (!p) return;
  const eps = episodiosOrdenados(p);
  const ep = eps[i]; if (!ep?.id || i < 1) return;
  const filas = filasEpisodios(p);
  const este = filas.find(f => f.i === i), ant = filas.find(f => f.i === i - 1);
  const actual = i === eps.length - 1;
  _ctx = { pid, i, ep };
  $('episodio-modal-title').textContent = 'Unir con el episodio anterior';
  $('episodio-modal-body').innerHTML = `
    <p class="ep-confirm">«${esc(este?.etiqueta || '')}» (${esc(este ? _rango(este) : '')}) se une con «${esc(ant?.etiqueta || '')}» (${esc(ant ? _rango(ant) : '')}).
      Sus sesiones y citas pasan a ese episodio.</p>
    ${actual ? `<p class="ep-confirm">Como es el episodio actual, el paciente vuelve al diagnóstico y al plan del anterior:
      <b>${esc(ant?.diag || '')}</b>${ant?.plan != null ? ` · ${esc(String(ant.plan))} sesiones` : ''}.</p>` : ''}
    ${(ep.nombre || ep.sesionesPrevias) ? `<p class="ep-confirm">Se descartan el nombre${ep.sesionesPrevias ? ` y las sesiones previas (${esc(textoPrevias(ep.sesionesPrevias).replace('incluye ', ''))})` : ''} de este episodio.</p>` : ''}
    <div id="ep-error" class="ep-error" role="alert" style="display:none"></div>`;
  $('episodio-modal-ok').textContent = 'Unir episodios';
  $('episodio-modal-ok').className = 'btn-save ep-danger';
  $('episodio-modal-ok').onclick = confirmarUnirEpisodio;
  $('episodio-modal').classList.add('open');
}

export async function confirmarUnirEpisodio() {
  if (_ocupado || !_ctx) return;
  const { pid, ep } = _ctx;
  _ocupado = true; _error('');
  try {
    const { error } = await supa.rpc('unir_con_anterior', { p_episodio: ep.id });
    if (error) { _error('No se pudo unir: ' + error.message); return; }
    await recargarEpisodiosPaciente(pid);
    window._app?.closeModal?.('episodio-modal');
    _ctx = null;
    toastOk('Episodios unidos ✓');
    _repintar();
  } finally { _ocupado = false; }
}
