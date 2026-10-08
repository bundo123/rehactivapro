// PULIR-1: botón "✨ Pulir redacción" bajo la nota del modal de sesión (fisio y respiratoria).
// El servidor corrige la redacción (api/informe.js, mode 'pulir', prompt fijo en lib/pulir.js) y acá
// se muestra lado a lado con lo que escribió el terapeuta, que decide. La nota original se conserva:
// noteOriginal guarda el PRIMER texto antes de la primera versión aceptada y noteIaAt cuándo se
// aceptó. Los dos viajan a session_log solo si la nota fue pulida (ver _leerSesion en sesiones.js).
import { supa } from './supabase-client.js';
import { esc } from './utils.js';
import { toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { verificarPulido, PULIR_MIN, PULIR_MAX } from '../lib/pulir.js';

let _orig = null;        // noteOriginal: el texto del terapeuta antes de la primera versión aceptada
let _iaAt = null;        // noteIaAt: ISO de cuándo se aceptó
let _cargado = false;    // la fila ya traía note_original (para limpiarla con "Volver a mi texto")
let _propuesta = null;   // {antes, pulido} mientras el panel está abierto
let _puliendo = false;
let _listo = false;      // listener del textarea ya enganchado

const $ = id => document.getElementById(id);

function _nota() { return $('sess-note'); }

function _syncBoton() {
  const b = $('sess-pulir-btn'); if (!b) return;
  const n = (_nota()?.value || '').trim().length;
  b.disabled = _puliendo || n < PULIR_MIN || n > PULIR_MAX;
  b.textContent = _puliendo ? 'Puliendo…' : '✨ Pulir redacción';
  b.title = n > PULIR_MAX ? `La nota supera los ${PULIR_MAX.toLocaleString('es')} caracteres` : '';
  const v = $('sess-pulir-volver'); if (v) v.style.display = _orig != null ? '' : 'none';
}

function _cerrarPanel() {
  _propuesta = null;
  const p = $('sess-pulir-panel'); if (p) { p.style.display = 'none'; p.innerHTML = ''; }
}

// Al abrir el modal: estado desde la fila guardada (editar / re-registrar) o vacío (sesión nueva).
// La secretaria no tiene viewAI: no ve el botón.
export function resetPulir(row) {
  _orig = row?.noteOriginal || null;
  _iaAt = _orig ? (row?.noteIaAt || null) : null;
  _cargado = !!_orig;
  _puliendo = false;
  _cerrarPanel();
  const w = $('sess-pulir'); if (w) w.style.display = hasPermission('viewAI') ? '' : 'none';
  const n = _nota();
  if (n && !_listo) {
    _listo = true;
    // Si el texto cambia con el panel abierto, la propuesta ya no corresponde a lo escrito.
    n.addEventListener('input', () => { if (_propuesta) _cerrarPanel(); _syncBoton(); });
  }
  _syncBoton();
}

// Lo que se guarda. columnas=null: la nota no se pulió y la fila nunca lo estuvo → no se mandan
// las columnas (así se puede guardar aunque el SQL de PULIR-1 todavía no se haya corrido).
// Si la fila venía pulida y se volvió al texto propio, se mandan en null para limpiarla.
export function estadoPulir() {
  if (_orig != null) return { noteOriginal: _orig, noteIaAt: _iaAt, columnas: { note_original: _orig, note_ia_at: _iaAt } };
  return { noteOriginal: null, noteIaAt: null, columnas: _cargado ? { note_original: null, note_ia_at: null } : null };
}

export async function pulirNota() {
  if (_puliendo || !hasPermission('viewAI')) return;
  const antes = (_nota()?.value || '').trim();
  if (antes.length < PULIR_MIN || antes.length > PULIR_MAX) return;
  const { data: { session } } = await supa.auth.getSession();
  if (!session?.access_token) { toastErr('Tu sesión expiró. Vuelve a iniciar sesión.'); return; }
  _puliendo = true; _cerrarPanel(); _syncBoton();
  let msg = 'No se pudo pulir la nota. Intenta de nuevo.';
  try {
    const res = await fetch('/api/informe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ mode: 'pulir', texto: antes })
    });
    if (res.status === 429) msg = 'Demasiadas solicitudes de IA. Espera un minuto e intenta de nuevo.';
    if (res.status === 403) msg = 'Tu rol no permite usar la IA.';
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    const pulido = (data && typeof data.text === 'string') ? data.text.trim() : '';
    if (!pulido) throw new Error('respuesta vacía');
    // Si mientras tanto se cerró el modal o cambió el texto, la respuesta ya no aplica.
    if (!$('session-modal')?.classList.contains('open') || (_nota()?.value || '').trim() !== antes) return;
    _mostrar(antes, pulido);
  } catch (e) {
    toastErr(msg);
  } finally {
    _puliendo = false; _syncBoton();
  }
}

function _mostrar(antes, pulido) {
  _propuesta = { antes, pulido };
  const p = $('sess-pulir-panel'); if (!p) return;
  const avisos = antes === pulido ? [] : verificarPulido(antes, pulido);
  p.innerHTML =
    '<div class="pulir-aviso-fijo">No escribas nombres de pacientes en la nota.</div>'
    + '<div class="pulir-cols">'
    + `<div><div class="pulir-lbl">Tu texto</div><div class="pulir-txt">${esc(antes)}</div></div>`
    + `<div><div class="pulir-lbl">Versión IA</div><div class="pulir-txt pulir-ia">${esc(pulido)}</div></div>`
    + '</div>'
    + (antes === pulido ? '<div class="pulir-igual">La IA no encontró nada que corregir.</div>' : '')
    + avisos.map(a => `<div class="pulir-revisa">⚠️ ${esc(a)}</div>`).join('')
    + '<div class="pulir-acc">'
    + '<button type="button" class="btn-cancel" onclick="descartarPulido()">Descartar</button>'
    + '<button type="button" class="add-btn" onclick="usarPulido()">Usar esta versión</button>'
    + '</div>';
  p.style.display = '';
}

export function usarPulido() {
  if (!_propuesta) return;
  const n = _nota(); if (!n) return;
  if (_orig == null) _orig = _propuesta.antes;   // se conserva el PRIMER original
  _iaAt = new Date().toISOString();
  n.value = _propuesta.pulido;
  _cerrarPanel(); _syncBoton();
}

export function descartarPulido() {
  _cerrarPanel(); _syncBoton();
}

export function volverNotaOriginal() {
  if (_orig == null) return;
  const n = _nota(); if (n) n.value = _orig;
  _orig = null; _iaAt = null;
  _cerrarPanel(); _syncBoton();
}
