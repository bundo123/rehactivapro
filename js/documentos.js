// ── DOC-2: modal de documentos del paciente (tabla public.documentos + bucket privado `documentos`) ──
// Carga PEREZOSA: la lista se pide al abrir el modal; no va en el select de pacientes ni en realtime.
// «Quitar» es borrado LÓGICO (la RLS solo deja eso): el objeto queda en Storage y el cambio en la
// bitácora. «Ver» = URL firmada de 300 s en pestaña nueva. La lógica pura vive en documento.js.
// Nunca se loguean nombres de archivo ni de pacientes.
import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, getPatient, dmy } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { showFieldError, clearAllErrors } from './validators.js';
import { TIPOS_DOC, labelTipoDoc, validarArchivo, rutaDocumento, textoBytes, mapDocumentoRow, puedeQuitarDoc } from './documento.js';

const BUCKET = 'documentos';
const CAMPOS = ['doc-archivo', 'doc-fecha', 'doc-nota'];
let _pid = null;      // paciente del modal abierto
let _docs = [];       // documentos visibles (deleted=false) del paciente abierto
let _subiendo = false;

const $ = id => document.getElementById(id);

function _pintarLista() {
  const box = $('doc-list'); if (!box) return;
  const ctx = { esAdmin: hasPermission('quitarDocumento'), userId: state.currentUserId };
  box.innerHTML = _docs.length ? _docs.map(d => `<div class="doc-item">
      <div class="doc-txt"><span class="doc-tipo">${esc(labelTipoDoc(d.tipo))}</span> <span class="doc-nombre">${esc(d.nombre)}</span>
        <div class="doc-meta">${esc(dmy(d.fechaDoc || String(d.createdAt || '').slice(0, 10)))} · ${esc(textoBytes(d.bytes))}</div>
        ${d.nota ? `<div class="orden-nota">${esc(d.nota)}</div>` : ''}</div>
      <div class="doc-acc">
        <button class="th-btn" onclick='abrirDocumento(${esc(JSON.stringify(d.storagePath))})'>Ver</button>
        ${puedeQuitarDoc(d, ctx) ? `<button class="th-btn del" onclick='quitarDocumento(${esc(JSON.stringify(d.id))})'>Quitar</button>` : ''}
      </div>
    </div>`).join('')
    : '<div class="orden-empty">Sin documentos.</div>';
}

async function _cargar(pid) {
  const box = $('doc-list');
  if (box) box.innerHTML = '<div class="orden-empty">Cargando…</div>';
  try {
    const { data, error } = await supa.from('documentos').select('*')
      .eq('patient_id', pid).eq('deleted', false).order('created_at');
    if (pid !== _pid) return;   // se cerró/cambió el modal mientras cargaba
    if (error) { _docs = []; if (box) box.innerHTML = '<div class="orden-empty">No se pudieron cargar los documentos.</div>'; return; }
    _docs = (data || []).map(mapDocumentoRow);
    _pintarLista();
  } catch (e) {
    if (pid === _pid && box) box.innerHTML = '<div class="orden-empty">Error de conexión al cargar los documentos.</div>';
  }
}

export function abrirDocumentos(id) {
  if (!hasPermission('subirDocumento')) { toastErr('No tienes permisos para ver documentos.'); return; }
  const p = getPatient(id); if (!p) return;
  if (typeof p.id !== 'string') { toastErr('Guarda primero el paciente.'); return; }
  _pid = p.id; _docs = [];
  clearAllErrors(CAMPOS);
  $('docs-modal-title').textContent = `Documentos · ${p.name}`;
  $('doc-tipo-sel').innerHTML = TIPOS_DOC.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
  $('doc-tipo-sel').value = 'otro';
  $('doc-fecha').value = ''; $('doc-nota').value = ''; $('doc-archivo').value = '';
  $('doc-modal').classList.add('open');
  _cargar(p.id);
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

export async function subirDocumentoModal() {
  if (_subiendo || !_pid) return;
  clearAllErrors(CAMPOS);
  const file = $('doc-archivo').files?.[0] || null;
  const err = validarArchivo(file);
  if (err) { showFieldError('doc-archivo', err); return; }
  const btn = $('doc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
  const pid = _pid;
  try {
    const doc = await subirDocumento(pid, file, {
      tipo: $('doc-tipo-sel').value, fechaDoc: $('doc-fecha').value || null, nota: $('doc-nota').value.trim(),
    });
    if (!doc) return;
    if (pid === _pid) {
      _docs.push(doc);
      $('doc-archivo').value = ''; $('doc-nota').value = ''; $('doc-fecha').value = '';
      _pintarLista();
    }
    toastOk('Documento subido');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Subir'; }
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
    toastOk('Documento quitado');
    _pintarLista();
  } catch (e) {
    toastErr('Error de conexión al quitar el documento.');
  }
}

// La pestaña se abre ANTES de cualquier await: abierta después, el navegador la bloquea como popup.
// getPath() resuelve la ruta del objeto (directa, o buscada por id para la orden médica).
async function _abrir(getPath) {
  const w = window.open('about:blank', '_blank');
  try {
    const path = await getPath();
    if (!path) { w?.close(); return; }
    const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { w?.close(); toastErr('No se pudo abrir el documento.'); return; }
    if (!w) { toastErr('El navegador bloqueó la pestaña nueva; permite ventanas emergentes para este sitio.'); return; }
    w.opener = null;
    w.location.href = data.signedUrl;
  } catch (e) {
    w?.close();
    toastErr('Error de conexión al abrir el documento.');
  }
}

export function abrirDocumento(storagePath) {
  return _abrir(async () => storagePath);
}

// «Ver orden»: el escaneo de la orden se busca por id (pedidos_medicos.documento_id). Si fue quitado
// desde Documentos, no se abre: quitar = deja de verse en la app.
export function verDocumentoPorId(docId) {
  return _abrir(async () => {
    const { data, error } = await supa.from('documentos').select('storage_path,deleted').eq('id', docId).single();
    if (error || !data) { toastErr('No se encontró el archivo de la orden.'); return null; }
    if (data.deleted) { toastErr('El archivo de esta orden fue quitado de la app.'); return null; }
    return data.storage_path;
  });
}
