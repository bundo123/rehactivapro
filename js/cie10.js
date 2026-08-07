// ── CIE-10: catálogo lazy + buscador con autocompletado ──
// El catálogo son 2470 códigos (~180 KB): se carga con import() al PRIMER uso, no en el arranque,
// para no meterlo en el bundle inicial que abre el terapeuta en el celular.
// El dato es del PACIENTE (patients.cie10 / cie10_desc), no de la cita: por eso el mismo campo
// vive en el modal de paciente y en el de editar cita, y en este último se guarda al instante.
import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, buscarCie10 } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';

let _cat = null;      // catálogo ya cargado
let _loading = null;  // promesa en vuelo (evita dos imports si el usuario teclea rápido)

export function loadCie10() {
  if (_cat) return Promise.resolve(_cat);
  if (!_loading) {
    _loading = import('./data/cie10-fisio.json')
      .then(m => { _cat = m.default || m; return _cat; })
      .catch(e => { _loading = null; throw e; });   // permite reintentar en el próximo tecleo
  }
  return _loading;
}

// Dos usos del mismo componente:
//  - 'appt': modal de editar cita. Persiste al instante en la ficha del paciente.
//  - 'pm'  : modal de paciente. Queda pendiente y lo escribe savePatient (el paciente nuevo
//            todavía no tiene fila).
const SCOPES = {
  appt: { search: 'cie-appt-search', results: 'cie-appt-results', current: 'cie-appt-current', persist: true },
  pm:   { search: 'pm-cie10-search', results: 'pm-cie10-results', current: 'pm-cie10-current', persist: false },
};

let _apptPatientId = null;          // paciente de la cita abierta
let _pmSel = { c: null, d: null };  // selección pendiente del modal de paciente

const $ = id => document.getElementById(id);

// Valor mostrado en cada scope: el de la ficha (appt) o el pendiente del formulario (pm).
function currentValue(scope) {
  if (scope === 'pm') return _pmSel;
  const p = state.patients.find(x => String(x.id) === String(_apptPatientId));
  return { c: p?.cie10 || null, d: p?.cie10Desc || null };
}

function renderCurrent(scope) {
  const cfg = SCOPES[scope]; if (!cfg) return;
  const box = $(cfg.current); if (!box) return;
  const { c, d } = currentValue(scope);
  box.innerHTML = c
    ? `<span class="cie-code">${esc(c)}</span><span class="cie-desc">${esc(d || '')}</span>`
      + `<button type="button" class="cie-clear" title="Quitar el CIE-10" onclick="cie10Clear('${esc(scope)}')">✕</button>`
    : `<span class="cie-empty">Sin código asignado</span>`;
}

function hideResults(scope) {
  const el = $(SCOPES[scope]?.results);
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

// oninput/onfocus del buscador. Async por el import lazy del catálogo.
export async function cie10Search(scope) {
  const cfg = SCOPES[scope]; if (!cfg) return;
  const inp = $(cfg.search), box = $(cfg.results);
  if (!inp || !box) return;
  const q = inp.value.trim();
  if (q.length < 2) { hideResults(scope); return; }   // con 1 carácter el resultado no dice nada
  let cat;
  try { cat = await loadCie10(); }
  catch { box.style.display = 'block'; box.innerHTML = '<div class="cie-msg">No se pudo cargar el catálogo CIE-10.</div>'; return; }
  if (inp.value.trim() !== q) return;                  // llegó tarde: ya hay otra búsqueda
  const res = buscarCie10(cat, q, 12);
  box.style.display = 'block';
  box.innerHTML = res.length
    ? res.map(it => `<div class="cie-item" onmousedown="cie10Pick('${esc(scope)}','${esc(it.c)}')">`
        + `<span class="cie-code">${esc(it.c)}</span><span class="cie-desc">${esc(it.d)}</span></div>`).join('')
    : '<div class="cie-msg">Sin resultados</div>';
}

export async function cie10Pick(scope, code) {
  const cfg = SCOPES[scope]; if (!cfg) return;
  const cat = await loadCie10().catch(() => null);
  const it = (cat || []).find(x => x.c === code);
  if (!it) return;
  const inp = $(cfg.search); if (inp) inp.value = '';
  hideResults(scope);
  if (cfg.persist) await persistCie(it.c, it.d);
  else { _pmSel = { c: it.c, d: it.d }; renderCurrent('pm'); }
}

export async function cie10Clear(scope) {
  if (!SCOPES[scope]) return;
  if (SCOPES[scope].persist) await persistCie(null, null);
  else { _pmSel = { c: null, d: null }; renderCurrent('pm'); }
}

// Escritura optimista + rollback si la DB rechaza (mismo patrón que commitApptChange).
async function persistCie(code, desc) {
  const p = state.patients.find(x => String(x.id) === String(_apptPatientId));
  if (!p) return;
  if (!hasPermission('editPatient')) { toastErr('No tienes permisos para editar la ficha del paciente.'); return; }
  const prev = { c: p.cie10 || null, d: p.cie10Desc || null };
  p.cie10 = code; p.cie10Desc = desc;
  renderCurrent('appt');
  if (typeof p.id !== 'string') return;   // paciente optimista todavía sin fila: solo memoria
  window._app?.markLocalChange?.('patients');
  const { error } = await supa.from('patients').update({ cie10: code, cie10_desc: desc }).eq('id', p.id);
  if (error) {
    p.cie10 = prev.c; p.cie10Desc = prev.d;
    renderCurrent('appt');
    toastErr('No se pudo guardar el CIE-10: ' + error.message);
    return;
  }
  toastOk(code ? `CIE-10 ${code} guardado en la ficha de ${p.name}` : 'CIE-10 quitado de la ficha');
  if (state.currentTab === 'pacientes') window._app?.renderPatients?.();
  if (state.currentTab === 'paciente_rpt') window._app?.renderPatientReport?.();
}

// ── Enganches de los modales ──

// Modal de editar cita: sin paciente asignado la sección no se muestra (el dato es del paciente).
export function setCie10Appt(patientId) {
  _apptPatientId = patientId || null;
  const sec = $('cie-appt-section');
  const inp = $('cie-appt-search');
  if (inp) inp.value = '';
  hideResults('appt');
  if (sec) sec.hidden = !_apptPatientId;
  if (_apptPatientId) renderCurrent('appt');
}

// Modal de paciente: prefill al editar, limpio al crear.
export function resetCie10Pm(p) {
  _pmSel = { c: p?.cie10 || null, d: p?.cie10Desc || null };
  const inp = $('pm-cie10-search');
  if (inp) inp.value = '';
  hideResults('pm');
  renderCurrent('pm');
}

// Lo que savePatient escribe en la fila.
export function getCie10Pm() {
  return { cie10: _pmSel.c || null, cie10Desc: _pmSel.d || null };
}

// Cerrar el desplegable al hacer click fuera del combo (espejo de informes.js/search.js).
document.addEventListener('click', e => {
  if (!e.target.closest('#cie-appt-combo')) hideResults('appt');
  if (!e.target.closest('#pm-cie10-combo')) hideResults('pm');
});
