// ── DOC-2: documentos del paciente (tabla public.documentos + bucket privado `documentos`) ──
// PURO: sin DOM ni state (se prueba en node). La UI y el acceso a Storage viven en documentos.js.
// Los límites espejan el bucket y los CHECK de la tabla (b2a_documentos.sql): PDF/JPEG/PNG,
// 1 byte..10 MB, nombre 1..120, nota <= 300, ruta '<patient_id>/<uuid>.<ext>'.

export const TIPOS_DOC = [
  { id: 'pedido_medico', label: 'Orden médica' },
  { id: 'consentimiento', label: 'Consentimiento informado' },
  { id: 'examen', label: 'Examen / imagen' },
  { id: 'informe_externo', label: 'Informe externo' },
  { id: 'otro', label: 'Otro' },
];

export function labelTipoDoc(id) {
  return (TIPOS_DOC.find(t => t.id === id) || TIPOS_DOC[TIPOS_DOC.length - 1]).label;
}

export const MIMES_DOC = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const DOC_MAX_BYTES = 10485760;

// 340 KB · 1,2 MB (coma decimal, es-EC). Bajo 1 KB, en bytes.
export function textoBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024 && Math.round(b / 1024) < 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`;
}

// File (o {name,type,size}) → mensaje de error, o null si se puede subir. HEIC/WebP se rechazan:
// el iPhone convierte a JPEG solo si el <input> no los acepta.
export function validarArchivo(f) {
  if (!f) return 'Elige un archivo.';
  if (!MIMES_DOC[f.type]) return 'Solo PDF, JPG o PNG.';
  const size = Number(f.size) || 0;
  if (size <= 0) return 'El archivo está vacío.';
  if (size > DOC_MAX_BYTES) return `Máximo 10 MB; este pesa ${textoBytes(size)}.`;
  if (!String(f.name || '').trim()) return 'El archivo no tiene nombre.';
  return null;
}

// Ruta del objeto en el bucket. NUNCA lleva el nombre original (es PII: "Rx rodilla Juan Pérez.pdf").
export function rutaDocumento(patientId, mime, uuid) {
  const ext = MIMES_DOC[mime];
  if (!patientId || !ext || !uuid) return null;
  return `${patientId}/${uuid}.${ext}`;
}

// Fila de la DB → objeto en memoria.
export function mapDocumentoRow(r) {
  return {
    id: r.id, patientId: r.patient_id, tipo: r.tipo, nombre: r.nombre || '',
    storagePath: r.storage_path, mime: r.mime, bytes: Number(r.bytes) || 0,
    fechaDoc: r.fecha_doc || null, nota: r.nota || '', subidoPor: r.subido_por || null,
    createdAt: r.created_at || null, deleted: !!r.deleted,
  };
}

// Espejo de la RLS UPDATE (USING is_admin() OR subido_por = auth.uid()).
export function puedeQuitarDoc(doc, { esAdmin, userId } = {}) {
  return !!esAdmin || (!!userId && doc?.subidoPor === userId);
}
