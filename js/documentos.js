// ── DOC-2: documentos del paciente (tabla public.documentos + bucket privado `documentos`) ──
// B2b-1: pestaña «Documentos» del Expediente (ya no hay modal). El paciente es state.expedienteId.
// Carga PEREZOSA: la lista se pide al abrir la pestaña; no va en el select de pacientes ni en realtime.
// Arriba, la barra de subida de una línea (arrastrar o tocar); debajo, la LISTA (EXP-2: filas, no
// tarjetas) con miniatura de 40 px. Las miniaturas de las fotos salen de UNA llamada
// createSignedUrls (300 s); si falla, queda el ícono del tipo.
// «Ver» abre el visor dentro de la app (#doc-visor) con la URL firmada de 300 s: <img> para fotos,
// <iframe> para PDF (la CSP tiene frame-src del host de Supabase solo para esto).
// «Quitar» es borrado LÓGICO (la RLS solo deja eso): el objeto queda en Storage y el cambio en la
// bitácora. La lógica pura vive en documento.js y expediente-calc.js.
// Nunca se loguean nombres de archivo ni de pacientes.
import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, dmy } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { TIPOS_DOC, MIMES_DOC, labelTipoDoc, validarArchivo, rutaDocumento, textoBytes, mapDocumentoRow, puedeQuitarDoc } from './documento.js';
import { ordenarDocsRecientes, esImagen } from './expediente-calc.js';

const BUCKET = 'documentos';
// Una línea. En el celular no se arrastra: el CSS cambia el texto por «Toca para elegir…» y acorta el pie.
const DROP_HTML = '<span class="exp-drop-pc">Arrastra aquí un PDF o foto, o toca para elegir</span>'
  + '<span class="exp-drop-movil">Toca para elegir un PDF o foto</span>'
  + '<span class="exp-drop-sub"> · <span class="exp-drop-tipos">PDF, JPG o PNG · </span>máx. 10 MB</span>';
let _pid = null;      // paciente de la pestaña abierta
let _docs = [];       // documentos visibles (deleted=false) del paciente, el más reciente primero
let _subiendo = false;
let _pend = null;     // archivo elegido/soltado, esperando «Subir»
let _visor = null;    // { path, nombre } del documento abierto en el visor
let _visorFoco = null;

const $ = id => document.getElementById(id);
const _fechaDoc = d => d.fechaDoc || String(d.createdAt || '').slice(0, 10);
// Sin mime en la fila (no debería pasar: es NOT NULL) se deduce de la extensión de la ruta.
const _mimeDe = (mime, path) => mime || (/\.pdf$/i.test(path || '') ? 'application/pdf' : /\.png$/i.test(path || '') ? 'image/png' : 'image/jpeg');

// ── Pestaña ──
export function htmlDocumentos() {
  const zona = hasPermission('subirDocumento') ? `
    <div id="exp-drop" class="exp-drop" role="button" tabindex="0" aria-label="Subir un documento: PDF, JPG o PNG, máximo 10 MB">
      <span id="exp-drop-txt" class="exp-drop-txt">${DROP_HTML}</span>
    </div>
    <input type="file" id="exp-doc-file" accept="application/pdf,image/jpeg,image/png" hidden>
    <div id="exp-doc-pend" class="exp-doc-pend" hidden>
      <div class="exp-doc-pend-nombre" id="exp-doc-pend-nombre"></div>
      <div class="field"><label for="exp-doc-tipo">Tipo</label><select id="exp-doc-tipo">${TIPOS_DOC.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="exp-doc-fecha">Fecha <span class="ep-opc">(opcional)</span></label><input type="date" id="exp-doc-fecha"></div>
      <div class="field exp-doc-pend-nota"><label for="exp-doc-nota">Nota <span class="ep-opc">(opcional)</span></label><input type="text" id="exp-doc-nota" maxlength="300" placeholder="Ej. Resonancia de rodilla derecha"></div>
      <div class="exp-form-acc">
        <button type="button" class="btn-cancel" id="exp-doc-cancelar" onclick="cancelarSubidaDoc()">Cancelar</button>
        <button type="button" class="btn-save" id="exp-doc-subir" onclick="subirDocPendiente()">Subir</button>
      </div>
    </div>` : '';
  return `${zona}<div id="exp-doc-lista" class="orden-list exp-doc-lista" aria-live="polite"></div>`;
}

// Se llama con el HTML de htmlDocumentos ya en el DOM: cablea la zona y carga la lista.
export function pintarDocumentos() {
  const pid = state.expedienteId;
  const p = pid == null ? null : state.patients.find(x => String(x.id) === String(pid));
  const box = $('exp-doc-lista'); if (!box || !p) return;
  if (!hasPermission('subirDocumento')) { box.innerHTML = '<div class="orden-empty">No tienes permisos para ver documentos.</div>'; return; }
  if (typeof p.id !== 'string') { box.innerHTML = '<div class="orden-empty">Guarda primero el paciente.</div>'; return; }
  if (_pid !== p.id) { _pid = p.id; _docs = []; }
  _pend = null;
  _cablearZona();
  _cargar(p.id);
}

function _cablearZona() {
  const zona = $('exp-drop'), inp = $('exp-doc-file');
  if (!zona || !inp) return;
  const elegir = () => { if (!_subiendo) { inp.value = ''; inp.click(); } };
  zona.addEventListener('click', elegir);
  zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
  zona.addEventListener('dragover', e => { e.preventDefault(); if (!_subiendo) zona.classList.add('sobre'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
  zona.addEventListener('drop', e => {
    e.preventDefault(); zona.classList.remove('sobre');
    if (!_subiendo) _elegido(e.dataTransfer?.files?.[0] || null);
  });
  inp.addEventListener('change', () => _elegido(inp.files?.[0] || null));
}

// Archivo elegido o soltado: se valida YA (un WebP no llega a pedir tipo ni nota) y aparece la fila.
function _elegido(file) {
  if (!file) return;
  const err = validarArchivo(file);
  if (err) { toastErr(err); return; }
  _pend = file;
  $('exp-doc-pend-nombre').textContent = `${file.name} · ${textoBytes(file.size)}`;
  $('exp-doc-tipo').value = 'otro';
  $('exp-doc-fecha').value = ''; $('exp-doc-nota').value = '';
  $('exp-doc-pend').hidden = false;
  $('exp-doc-tipo').focus();
}

export function cancelarSubidaDoc() {
  if (_subiendo) return;
  _pend = null;
  const f = $('exp-doc-pend'); if (f) f.hidden = true;
  const inp = $('exp-doc-file'); if (inp) inp.value = '';
}

function _zonaOcupada(on) {
  const zona = $('exp-drop'), btn = $('exp-doc-subir'), canc = $('exp-doc-cancelar');
  if (zona) { zona.classList.toggle('ocupada', on); zona.setAttribute('aria-disabled', String(on)); }
  const t = $('exp-drop-txt'); if (t) { if (on) t.textContent = 'Subiendo…'; else t.innerHTML = DROP_HTML; }
  if (btn) { btn.disabled = on; btn.textContent = on ? 'Subiendo…' : 'Subir'; }
  if (canc) canc.disabled = on;
}

export async function subirDocPendiente() {
  if (_subiendo || !_pend || !_pid) return;
  const pid = _pid, file = _pend;
  _zonaOcupada(true);
  let doc = null;
  try {
    doc = await subirDocumento(pid, file, {
      tipo: $('exp-doc-tipo')?.value || 'otro', fechaDoc: $('exp-doc-fecha')?.value || null, nota: ($('exp-doc-nota')?.value || '').trim(),
    });
  } finally { _zonaOcupada(false); }
  if (!doc) return;
  toastOk('Documento subido');
  if (pid !== _pid) return;
  cancelarSubidaDoc();
  _docs = ordenarDocsRecientes([..._docs, doc]);
  _pintarLista();
}

async function _cargar(pid) {
  const box = $('exp-doc-lista');
  if (box && !_docs.length) box.innerHTML = '<div class="orden-empty">Cargando…</div>';
  try {
    const { data, error } = await supa.from('documentos').select('*')
      .eq('patient_id', pid).eq('deleted', false).order('created_at');
    if (pid !== _pid) return;   // se cambió de paciente mientras cargaba
    if (error) { _docs = []; if (box) box.innerHTML = '<div class="orden-empty">No se pudieron cargar los documentos.</div>'; return; }
    _docs = ordenarDocsRecientes((data || []).map(mapDocumentoRow));
    _pintarLista();
  } catch (e) {
    if (pid === _pid && box) box.innerHTML = '<div class="orden-empty">Error de conexión al cargar los documentos.</div>';
  }
}

// Una fila por documento (como .orden-item): miniatura de 40 px (ícono del tipo hasta que llegue la
// foto firmada) · nombre · tipo · fecha y peso · Ver/Descargar/Quitar a la derecha.
function _pintarLista() {
  const box = $('exp-doc-lista'); if (!box) return;
  const ctx = { esAdmin: hasPermission('quitarDocumento'), userId: state.currentUserId };
  const id = d => esc(JSON.stringify(d.id));
  box.innerHTML = _docs.length ? _docs.map(d => `<div class="exp-doc-row"${d.nota ? ` title="${esc(d.nota)}"` : ''}>
      <button type="button" class="exp-doc-thumb"${esImagen(d.mime) ? ` data-thumb="${esc(d.storagePath)}"` : ''} onclick='verDocumento(${id(d)})' aria-label="Ver ${esc(d.nombre)}">
        <span class="exp-doc-ico">${esc((MIMES_DOC[d.mime] || 'doc').toUpperCase())}</span></button>
      <span class="exp-doc-nombre" title="${esc(d.nombre)}">${esc(d.nombre)}</span>
      <span class="exp-doc-sub"><span class="pill pgr">${esc(labelTipoDoc(d.tipo))}</span>
        <span class="exp-mute">${esc(dmy(_fechaDoc(d)))} · ${esc(textoBytes(d.bytes))}</span></span>
      <span class="exp-doc-acts">
        <button type="button" class="exp-doc-act" onclick='verDocumento(${id(d)})'>Ver</button>
        <button type="button" class="exp-doc-act" onclick='descargarDocumento(${id(d)})'>Descargar</button>
        ${puedeQuitarDoc(d, ctx) ? `<button type="button" class="exp-doc-act del" onclick='quitarDocumento(${id(d)})'>Quitar</button>` : ''}
      </span>
    </div>`).join('')
    : '<div class="orden-empty">Sin documentos.</div>';
  _firmarMiniaturas();
}

async function _firmarMiniaturas() {
  const fotos = _docs.filter(d => esImagen(d.mime));
  if (!fotos.length) return;
  const pid = _pid;
  try {
    const { data, error } = await supa.storage.from(BUCKET).createSignedUrls(fotos.map(d => d.storagePath), 300);
    if (error || !Array.isArray(data) || pid !== _pid) return;
    const porRuta = new Map(data.filter(r => r && !r.error && r.signedUrl).map(r => [r.path, r.signedUrl]));
    document.querySelectorAll('#exp-doc-lista .exp-doc-thumb[data-thumb]').forEach(el => {
      const url = porRuta.get(el.getAttribute('data-thumb'));
      if (!url) return;
      const img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy'; img.src = url;
      img.addEventListener('load', () => el.classList.add('con-foto'));
      img.addEventListener('error', () => { img.remove(); el.classList.remove('con-foto'); });   // vuelve a verse el ícono
      el.appendChild(img);
    });
  } catch (e) { /* sin miniaturas: quedan los íconos */ }
}

// Sube el archivo y registra su fila. Devuelve la fila mapeada, o null (ya avisó con toast).
// La reutiliza ordenes.js para el escaneo de la orden médica.
export async function subirDocumento(patientId, file, { tipo, fechaDoc, nota } = {}) {
  if (!hasPermission('subirDocumento')) { toastErr('No tienes permisos para subir documentos.'); return null; }
  const err = validarArchivo(file);
  if (err) { toastErr(err); return null; }
  if (_subiendo) return null;
  _subiendo = true;
  try {
    const path = rutaDocumento(patientId, file.type, crypto.randomUUID());
    const up = await supa.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (up.error) { toastErr('El servidor rechazó el archivo (tipo o tamaño).'); return null; }
    const { data, error } = await supa.from('documentos').insert({
      patient_id: patientId, tipo, nombre: file.name.trim().slice(0, 120), storage_path: path,
      mime: file.type, bytes: file.size, fecha_doc: fechaDoc || null, nota: nota || null,
    }).select().single();
    if (error) {
      // Sin fila el objeto queda huérfano: se intenta borrar (la RLS deja a quien lo subió). Mejor esfuerzo.
      try { await supa.storage.from(BUCKET).remove([path]); } catch (e) { /* queda huérfano en el bucket */ }
      toastErr('No se pudo registrar el documento: ' + error.message);
      return null;
    }
    return mapDocumentoRow(data);
  } catch (e) {
    toastErr('Error de conexión al subir el documento.');
    return null;
  } finally {
    _subiendo = false;
  }
}

export async function quitarDocumento(docId) {
  const doc = _docs.find(d => d.id === docId); if (!doc) return;
  if (!puedeQuitarDoc(doc, { esAdmin: hasPermission('quitarDocumento'), userId: state.currentUserId })) {
    toastErr('Solo el administrador o quien lo subió puede quitar este documento.'); return;
  }
  if (!confirm('⚠️ Vas a quitar este documento. El archivo deja de verse en la app; queda guardado y registrado en la bitácora.\n\n¿Quitar el documento?')) return;
  try {
    const { error } = await supa.from('documentos').update({
      deleted: true, deleted_at: new Date().toISOString(), deleted_by: state.currentUserId,
    }).eq('id', doc.id);
    if (error) { toastErr('No se pudo quitar el documento: ' + error.message); return; }
    _docs = _docs.filter(d => d.id !== doc.id);
    if (_visor?.path === doc.storagePath) cerrarVisor();
    toastOk('Documento quitado');
    _pintarLista();
  } catch (e) {
    toastErr('Error de conexión al quitar el documento.');
  }
}

// ── Visor dentro de la app ──
// Se abre en «Cargando…» antes del await (el toque se nota al instante) y recibe la URL firmada.
async function _abrirVisor(getDoc) {
  const v = $('doc-visor'), cuerpo = $('doc-visor-cuerpo'); if (!v || !cuerpo) return;
  _visorFoco = document.activeElement;
  _visor = null;
  $('doc-visor-nombre').textContent = 'Cargando…';
  cuerpo.innerHTML = '<div class="exp-visor-msg">Cargando…</div>';
  v.hidden = false;
  document.body.classList.add('exp-visor-abierto');
  $('doc-visor-cerrar')?.focus();
  try {
    const d = await getDoc();
    if (!d) { cerrarVisor(); return; }
    const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(d.path, 300);
    if (v.hidden) return;   // lo cerraron mientras firmaba
    if (error || !data?.signedUrl) { cerrarVisor(); toastErr('No se pudo abrir el documento.'); return; }
    _visor = { path: d.path, nombre: d.nombre };
    $('doc-visor-nombre').textContent = d.nombre || 'Documento';
    cuerpo.innerHTML = '';
    const el = document.createElement(esImagen(_mimeDe(d.mime, d.path)) ? 'img' : 'iframe');
    if (el.tagName === 'IMG') el.alt = d.nombre || 'Documento';
    else el.title = d.nombre || 'Documento';
    el.src = data.signedUrl;
    cuerpo.appendChild(el);
  } catch (e) {
    cerrarVisor();
    toastErr('Error de conexión al abrir el documento.');
  }
}

export function cerrarVisor() {
  const v = $('doc-visor'); if (!v || v.hidden) return;
  v.hidden = true;
  const cuerpo = $('doc-visor-cuerpo'); if (cuerpo) cuerpo.innerHTML = '';   // corta la carga del PDF
  document.body.classList.remove('exp-visor-abierto');
  _visor = null;
  try { _visorFoco?.focus?.(); } catch (e) { /* el elemento ya no está */ }
  _visorFoco = null;
}

export function verDocumento(docId) {
  const d = _docs.find(x => x.id === docId); if (!d) return;
  return _abrirVisor(async () => ({ path: d.storagePath, nombre: d.nombre, mime: d.mime }));
}

// «Ver escaneo» de una orden: el archivo se busca por id (pedidos_medicos.documento_id). Si fue
// quitado desde Documentos, no se abre: quitar = deja de verse en la app.
export function verDocumentoPorId(docId) {
  return _abrirVisor(async () => {
    const { data, error } = await supa.from('documentos').select('storage_path,deleted,nombre,mime').eq('id', docId).single();
    if (error || !data) { toastErr('No se encontró el archivo de la orden.'); return null; }
    if (data.deleted) { toastErr('El archivo de esta orden fue quitado de la app.'); return null; }
    return { path: data.storage_path, nombre: data.nombre || 'Orden médica', mime: data.mime };
  });
}

// ── Descargar ──
// La URL firmada con { download } hace que Storage mande Content-Disposition: attachment con el
// nombre original: el navegador descarga y la app no se mueve.
async function _descargar(path, nombre) {
  try {
    const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(path, 300, { download: nombre || true });
    if (error || !data?.signedUrl) { toastErr('No se pudo descargar el documento.'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl; a.download = nombre || ''; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {
    toastErr('Error de conexión al descargar el documento.');
  }
}

export function descargarDocumento(docId) {
  const d = _docs.find(x => x.id === docId); if (!d) return;
  return _descargar(d.storagePath, d.nombre);
}

export function descargarVisor() {
  if (_visor) return _descargar(_visor.path, _visor.nombre);
}
