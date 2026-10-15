// ── ORD-1: órdenes médicas (tabla public.pedidos_medicos) — pestaña «Órdenes» del Expediente ──
// Lista las órdenes del paciente y registra una nueva. Borrar es solo de admin (espejo de la RLS).
// Sin realtime para esta tabla: la lista en memoria (p.ordenes) se actualiza al escribir acá y se
// recarga entera en el próximo loadAll. La lógica (qué orden aplica, vencida, texto, validación)
// vive en orden-medica.js, que es pura y se prueba en node. DOC-2: cada orden puede llevar su escaneo
// (pedidos_medicos.documento_id → documentos); se sube con subirDocumento de documentos.js.
// B2b-1: ya no hay modal. El paciente es el del Expediente (state.expedienteId); el formulario se
// despliega bajo «+ Nueva orden» con los mismos ids or-* de siempre.
import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, fmtDate, mapOrdenRow, ordenarOrdenes, dmy } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { showFieldError, clearAllErrors } from './validators.js';
import { textoOrden, ordenVencida, validarOrden } from './orden-medica.js';
import { validarArchivo } from './documento.js';
import { subirDocumento } from './documentos.js';

const CAMPOS = { fecha: 'or-fecha', sesiones: 'or-sesiones', vigencia: 'or-vigencia', nota: 'or-nota', archivo: 'or-archivo' };
let _guardando = false;
let _adjOrden = null; // orden que recibe el archivo de «Adjuntar» (#or-archivo-adj)

const $ = id => document.getElementById(id);
const _paciente = () => state.expedienteId == null ? null
  : state.patients.find(p => String(p.id) === String(state.expedienteId)) || null;
const _opc = '<span class="ep-opc">(opcional)</span>';

function _doctorTxt(id) {
  const d = id ? state.doctors.find(x => x.id === id) : null;
  return d ? `${d.name} (${d.spec})` : null;
}

// HTML de la pestaña: botón, formulario plegado y el contenedor de la lista (lo llena pintarOrdenes).
// Los límites espejan los CHECK de la base: sesiones 1..200, vigencia >= fecha, nota <= 300.
export function htmlOrdenes() {
  const form = hasPermission('registrarOrden') ? `
    <button type="button" class="add-btn exp-nueva" id="or-toggle" onclick="nuevaOrdenToggle()" aria-expanded="false" aria-controls="exp-orden-form">+ Nueva orden</button>
    <div id="exp-orden-form" class="exp-form" hidden>
      <div class="field-row two">
        <div class="field"><label for="or-fecha">Fecha de la orden</label><input type="date" id="or-fecha"></div>
        <div class="field"><label for="or-doctor">Médico</label><select id="or-doctor"><option value="">Sin médico</option></select></div>
      </div>
      <div class="field-row two">
        <div class="field"><label for="or-sesiones">Sesiones autorizadas</label><input type="number" id="or-sesiones" min="1" max="200" value="10" inputmode="numeric"></div>
        <div class="field"><label for="or-vigencia">Vigente hasta ${_opc}</label><input type="date" id="or-vigencia"></div>
      </div>
      <!-- DOC-2: el escaneo sube a Storage como documento tipo pedido_medico. Sin capture: el iPhone
           ofrece cámara y archivos y convierte HEIC a JPEG. -->
      <div class="field"><label for="or-archivo">Adjuntar la orden ${_opc}</label><input type="file" id="or-archivo" class="doc-file" accept="application/pdf,image/jpeg,image/png"></div>
      <div class="field"><label for="or-nota">Nota ${_opc}</label><input type="text" id="or-nota" maxlength="300" placeholder="Ej. Orden escaneada en la carpeta física"></div>
      <div class="exp-form-acc">
        <button type="button" class="btn-cancel" onclick="nuevaOrdenToggle(false)">Cancelar</button>
        <button type="button" class="btn-save" id="or-save-btn" onclick="guardarOrden()">Registrar orden</button>
      </div>
    </div>` : '';
  return `${form}<div id="exp-ordenes-lista" class="orden-list exp-lista"></div>`;
}

// Una línea por orden, la más reciente arriba; filas separadas por línea fina (.orden-item).
function _pintarLista(p) {
  const box = $('exp-ordenes-lista'); if (!box || !p) return;
  const hoy = fmtDate(new Date());
  const lista = ordenarOrdenes(p.ordenes).reverse();
  const puedeBorrar = hasPermission('borrarOrden');
  const puedeAdj = hasPermission('registrarOrden');
  box.innerHTML = lista.length ? lista.map(o => `<div class="orden-item">
      <div class="orden-txt">${esc(textoOrden({ ...o, doctor: _doctorTxt(o.doctorId) }))}${ordenVencida(o, hoy) ? '<span class="orden-venc">VENCIDA</span>' : ''}
        ${o.nota ? `<div class="orden-nota">${esc(o.nota)}</div>` : ''}</div>
      <div class="doc-acc">
        ${o.documentoId ? `<button type="button" class="th-btn" onclick='verDocumentoPorId(${esc(JSON.stringify(o.documentoId))})'>Ver escaneo</button>`
          : puedeAdj ? `<button type="button" class="th-btn" onclick='adjuntarOrden(${esc(JSON.stringify(o.id))})'>Adjuntar</button>` : ''}
        ${puedeBorrar ? `<button type="button" class="th-btn del" onclick='borrarOrden(${esc(JSON.stringify(o.id))})'>Eliminar</button>` : ''}
      </div>
    </div>`).join('')
    : '<div class="orden-empty">Sin órdenes registradas.</div>';
}

export function pintarOrdenes() {
  const p = _paciente();
  if (p && !Array.isArray(p.ordenes)) p.ordenes = [];
  _pintarLista(p);
}

// Tras escribir: el encabezado del Expediente se repinta, y la orden entra en la fila «Orden
// médica» del informe y en el pedido sugerido si ese informe es lo que está en pantalla.
function _refrescar() {
  window._app?.refrescarExpediente?.();
  if (state.currentTab === 'paciente_rpt') window._app?.refrescarResumenMedico?.();
}

// «+ Nueva orden»: despliega/pliega el formulario. Sin argumento alterna; true/false fuerzan.
// Al abrirse arranca limpio: hoy, el médico referente del paciente y su plan de sesiones.
export function nuevaOrdenToggle(abrir) {
  const f = $('exp-orden-form'); if (!f) return;
  const on = typeof abrir === 'boolean' ? abrir : f.hidden;
  if (on) {
    if (!hasPermission('registrarOrden')) { toastErr('No tienes permisos para registrar órdenes médicas.'); return; }
    const p = _paciente(); if (!p) return;
    if (typeof p.id !== 'string') { toastErr('Guarda primero el paciente.'); return; }
    clearAllErrors(Object.values(CAMPOS));
    $('or-doctor').innerHTML = '<option value="">Sin médico</option>'
      + state.doctors.map(d => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.spec)})</option>`).join('');
    $('or-doctor').value = p.doctorId && state.doctors.some(d => d.id === p.doctorId) ? p.doctorId : '';
    $('or-fecha').value = fmtDate(new Date());
    $('or-sesiones').value = String(p.sessions || 10);
    $('or-vigencia').value = '';
    $('or-nota').value = '';
    $('or-archivo').value = '';
  }
  f.hidden = !on;
  $('or-toggle')?.setAttribute('aria-expanded', String(on));
  if (on) $('or-fecha')?.focus();
}

export async function guardarOrden() {
  if (_guardando) return;
  if (!hasPermission('registrarOrden')) { toastErr('No tienes permisos para registrar órdenes médicas.'); return; }
  const p = _paciente(); if (!p) return;
  const f = {
    fecha: $('or-fecha').value, sesiones: $('or-sesiones').value.trim(),
    vigenciaHasta: $('or-vigencia').value || null, nota: $('or-nota').value.trim(),
  };
  clearAllErrors(Object.values(CAMPOS));
  const err = validarOrden(f);
  // DOC-2: el adjunto se valida ANTES de registrar la orden, para no dejarla a medias por un WebP.
  const file = $('or-archivo').files?.[0] || null;
  const errArch = file ? validarArchivo(file) : null;
  if (errArch) err.archivo = errArch;
  if (Object.keys(err).length) { Object.entries(err).forEach(([k, msg]) => showFieldError(CAMPOS[k], msg)); return; }
  _guardando = true;
  const btn = $('or-save-btn'); if (btn) btn.disabled = true;
  try {
    const { data, error } = await supa.from('pedidos_medicos').insert({
      patient_id: p.id, doctor_id: $('or-doctor').value || null, fecha: f.fecha,
      sesiones_autorizadas: parseInt(f.sesiones, 10), vigencia_hasta: f.vigenciaHasta, nota: f.nota || null,
    }).select().single();
    if (error) { toastErr('No se pudo registrar la orden: ' + error.message); return; }
    const o = mapOrdenRow(data);
    p.ordenes = ordenarOrdenes([...(p.ordenes || []), o]);
    // El adjunto va después: si falla, la orden ya quedó y se adjunta desde la lista.
    if (file && btn) btn.textContent = 'Subiendo…';
    if (file && !(await _vincular(p, o, file))) {
      toastErr('La orden quedó registrada; el archivo no se pudo subir. Puedes adjuntarlo desde la lista.');
    } else toastOk('Orden médica registrada');
    nuevaOrdenToggle(false);
    _pintarLista(p);
    _refrescar();
  } catch (e) {
    toastErr('Error de conexión al registrar la orden.');
  } finally {
    _guardando = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar orden'; }
  }
}

// Sube el escaneo como documento tipo pedido_medico y lo apunta desde la orden. true si quedó vinculado;
// si falla el UPDATE, el documento queda igual en «Documentos» del paciente, sin vínculo.
async function _vincular(p, o, file) {
  const doc = await subirDocumento(p.id, file, {
    tipo: 'pedido_medico', fechaDoc: o.fecha, nota: 'Orden médica del ' + dmy(o.fecha),
  });
  if (!doc) return false;
  const { error } = await supa.from('pedidos_medicos').update({ documento_id: doc.id }).eq('id', o.id);
  if (error) return false;
  o.documentoId = doc.id;
  return true;
}

// «Adjuntar» a una orden ya registrada: abre el selector oculto; el archivo llega a onArchivoOrdenAdj.
export function adjuntarOrden(ordenId) {
  if (!hasPermission('registrarOrden')) { toastErr('No tienes permisos para registrar órdenes médicas.'); return; }
  const inp = $('or-archivo-adj'); if (!inp) return;
  _adjOrden = ordenId;
  inp.value = '';
  inp.click();
}

export async function onArchivoOrdenAdj(input) {
  const file = input?.files?.[0] || null;
  const ordenId = _adjOrden; _adjOrden = null;
  if (!file || !ordenId || _guardando) { if (input) input.value = ''; return; }
  if (input) input.value = '';
  const p = _paciente(); if (!p) return;
  const o = (p.ordenes || []).find(x => x.id === ordenId); if (!o) return;
  const err = validarArchivo(file);
  if (err) { toastErr(err); return; }
  _guardando = true;
  try {
    if (await _vincular(p, o, file)) { toastOk('Archivo adjuntado a la orden'); _pintarLista(p); }
    else toastErr('No se pudo adjuntar el archivo a la orden.');
  } catch (e) {
    toastErr('Error de conexión al adjuntar el archivo.');
  } finally {
    _guardando = false;
  }
}

export async function borrarOrden(ordenId) {
  if (!hasPermission('borrarOrden')) { toastErr('Solo el administrador puede eliminar órdenes médicas.'); return; }
  const p = _paciente(); if (!p) return;
  if (!confirm('⚠️ Vas a eliminar esta orden médica. Esta acción es IRREVERSIBLE y no se puede deshacer.\n\n¿Eliminar definitivamente?')) return;
  const { error } = await supa.from('pedidos_medicos').delete().eq('id', ordenId);
  if (error) { toastErr('No se pudo eliminar la orden: ' + error.message); return; }
  p.ordenes = (p.ordenes || []).filter(o => o.id !== ordenId);
  toastOk('Orden médica eliminada');
  _pintarLista(p);
  _refrescar();
}
