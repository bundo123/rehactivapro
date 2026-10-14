// Tests del lote B2a (DOC-2) — node --test. Lógica pura, sin DOM ni Storage, con datos ficticios.
//  · documento.js: validarArchivo, rutaDocumento, textoBytes, mapDocumentoRow, labelTipoDoc, puedeQuitarDoc.
//  · mapOrdenRow con pedidos_medicos.documento_id.
//  · permissions: subirDocumento (los tres roles) y quitarDocumento (solo admin).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_DOC, labelTipoDoc, MIMES_DOC, DOC_MAX_BYTES, validarArchivo, rutaDocumento, textoBytes,
  mapDocumentoRow, puedeQuitarDoc } from '../js/documento.js';
import { mapOrdenRow } from '../js/utils.js';
import { state } from '../js/state.js';
import { hasPermission } from '../js/permissions.js';

const PID = '11111111-2222-3333-4444-555555555555';
const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const arch = (over = {}) => ({ name: 'Orden ficticia.pdf', type: 'application/pdf', size: 340 * 1024, ...over });

// ── validarArchivo ──
test('validarArchivo — PDF, JPG y PNG válidos', () => {
  assert.equal(validarArchivo(arch()), null);
  assert.equal(validarArchivo(arch({ name: 'foto.jpg', type: 'image/jpeg' })), null);
  assert.equal(validarArchivo(arch({ name: 'captura.png', type: 'image/png' })), null);
});

test('validarArchivo — WebP y HEIC rechazados; sin archivo', () => {
  assert.equal(validarArchivo(arch({ name: 'x.webp', type: 'image/webp' })), 'Solo PDF, JPG o PNG.');
  assert.equal(validarArchivo(arch({ name: 'IMG_0001.HEIC', type: 'image/heic' })), 'Solo PDF, JPG o PNG.');
  assert.equal(validarArchivo(arch({ type: '' })), 'Solo PDF, JPG o PNG.');
  assert.equal(validarArchivo(null), 'Elige un archivo.');
});

test('validarArchivo — 0 bytes; 10 MB exacto pasa y 10 MB + 1 no', () => {
  assert.equal(validarArchivo(arch({ size: 0 })), 'El archivo está vacío.');
  assert.equal(DOC_MAX_BYTES, 10485760);
  assert.equal(validarArchivo(arch({ size: DOC_MAX_BYTES })), null);
  assert.match(validarArchivo(arch({ size: DOC_MAX_BYTES + 1 })), /^Máximo 10 MB; este pesa 10 MB\.$/);
  assert.equal(validarArchivo(arch({ size: 11 * 1048576 })), 'Máximo 10 MB; este pesa 11 MB.');
});

test('validarArchivo — nombre vacío', () => {
  assert.equal(validarArchivo(arch({ name: '' })), 'El archivo no tiene nombre.');
  assert.equal(validarArchivo(arch({ name: '   ' })), 'El archivo no tiene nombre.');
});

// ── rutaDocumento ──
test('rutaDocumento — <patientId>/<uuid>.<ext>, extensión por mime, uuid tal cual', () => {
  assert.equal(rutaDocumento(PID, 'application/pdf', UUID), `${PID}/${UUID}.pdf`);
  assert.equal(rutaDocumento(PID, 'image/jpeg', UUID), `${PID}/${UUID}.jpg`);
  assert.equal(rutaDocumento(PID, 'image/png', UUID), `${PID}/${UUID}.png`);
  assert.ok(rutaDocumento(PID, 'image/png', UUID).startsWith(PID + '/'));
  assert.equal(rutaDocumento(PID, 'image/webp', UUID), null);
  assert.deepEqual(Object.keys(MIMES_DOC), ['application/pdf', 'image/jpeg', 'image/png']);
});

test('rutaDocumento — nunca contiene el nombre original del archivo (PII)', () => {
  const f = arch({ name: 'Rx rodilla Paciente Ficticia.pdf' });
  const ruta = rutaDocumento(PID, f.type, UUID);
  assert.ok(!ruta.includes('Rx'));
  assert.ok(!ruta.includes('Ficticia'));
  assert.ok(!ruta.includes(' '));
  assert.match(ruta, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/);
});

// ── textoBytes ──
test('textoBytes — KB redondeado y MB con coma decimal (es-EC)', () => {
  assert.equal(textoBytes(1024), '1 KB');
  assert.equal(textoBytes(340 * 1024), '340 KB');
  assert.equal(textoBytes(1258291), '1,2 MB');
  assert.equal(textoBytes(10485760), '10 MB');
  assert.equal(textoBytes(512), '512 B');
});

// ── mapDocumentoRow / labelTipoDoc ──
test('mapDocumentoRow — fila de documentos → memoria', () => {
  const r = { id: 'd1', patient_id: PID, tipo: 'examen', nombre: 'Resonancia.pdf', storage_path: `${PID}/${UUID}.pdf`,
    mime: 'application/pdf', bytes: 2048, fecha_doc: '2026-10-01', nota: null, subido_por: 'u1',
    created_at: '2026-10-14T15:00:00Z', deleted: false, deleted_at: null, deleted_by: null };
  assert.deepEqual(mapDocumentoRow(r), { id: 'd1', patientId: PID, tipo: 'examen', nombre: 'Resonancia.pdf',
    storagePath: `${PID}/${UUID}.pdf`, mime: 'application/pdf', bytes: 2048, fechaDoc: '2026-10-01', nota: '',
    subidoPor: 'u1', createdAt: '2026-10-14T15:00:00Z', deleted: false });
});

test('labelTipoDoc — los 5 tipos del CHECK; desconocido → «Otro»', () => {
  assert.deepEqual(TIPOS_DOC.map(t => t.id), ['pedido_medico', 'consentimiento', 'examen', 'informe_externo', 'otro']);
  assert.equal(labelTipoDoc('pedido_medico'), 'Orden médica');
  assert.equal(labelTipoDoc('consentimiento'), 'Consentimiento informado');
  assert.equal(labelTipoDoc('xyz'), 'Otro');
  assert.equal(labelTipoDoc(undefined), 'Otro');
});

// ── puedeQuitarDoc (espejo de la RLS UPDATE) ──
test('puedeQuitarDoc — admin sí; quien subió sí; otro no', () => {
  const doc = { id: 'd1', subidoPor: 'u-sube' };
  assert.equal(puedeQuitarDoc(doc, { esAdmin: true, userId: 'u-admin' }), true);
  assert.equal(puedeQuitarDoc(doc, { esAdmin: false, userId: 'u-sube' }), true);
  assert.equal(puedeQuitarDoc(doc, { esAdmin: false, userId: 'u-otro' }), false);
  assert.equal(puedeQuitarDoc({ id: 'd2', subidoPor: null }, { esAdmin: false, userId: null }), false);
});

// ── mapOrdenRow + documento_id ──
test('mapOrdenRow — documento_id presente y ausente', () => {
  const r = { id: 'o1', doctor_id: null, fecha: '2026-09-05', sesiones_autorizadas: 12, vigencia_hasta: null, nota: null, created_at: 'x' };
  assert.equal(mapOrdenRow({ ...r, documento_id: 'd1' }).documentoId, 'd1');
  assert.equal(mapOrdenRow(r).documentoId, null);
  assert.equal(mapOrdenRow({ ...r, documento_id: null }).documentoId, null);
});

// ── permissions ──
const _roleAntes = state.currentUserRole;
after(() => { state.currentUserRole = _roleAntes; });

test('permissions — subirDocumento: admin, secretaria y terapeuta', () => {
  for (const rol of ['admin', 'secretaria', 'terapeuta']) {
    state.currentUserRole = rol;
    assert.equal(hasPermission('subirDocumento'), true, rol);
  }
});

test('permissions — quitarDocumento: solo admin', () => {
  const esperado = { admin: true, secretaria: false, terapeuta: false };
  for (const [rol, v] of Object.entries(esperado)) {
    state.currentUserRole = rol;
    assert.equal(hasPermission('quitarDocumento'), v, rol);
  }
});
