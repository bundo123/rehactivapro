// Tests de DIAG-1: el diagnóstico deja de ser texto libre y pasa a ser un catálogo cerrado
// (la tabla `protocols`, que en la UI se llama "Diagnósticos"). node --test.
//
// Lo que se prueba acá es la REGLA, no el DOM: populateDiagSelects (pacientes.js) solo inyecta el
// HTML que devuelve diagOptionsHtml y escribe lo que devuelve diagSync, y las dos son puras.
// pacientes.js no se puede importar en node (arrastra supabase-client.js, que usa import.meta.env).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagOptions, diagOptionsHtml, diagSync, diagParaPrompt } from '../js/utils.js';
import { state } from '../js/state.js';
import { hasPermission } from '../js/permissions.js';

const CAT = [
  { id: 'u-3', name: 'Tendinitis rotuliana' },
  { id: 'u-1', name: 'Lumbalgia mecánica crónica' },
  { id: 'u-2', name: 'Esguince de tobillo grado II' },
];

// ── El selector: orden, opción vacía y catálogo vacío ────────────────────────
test('diagOptions — ordena por nombre, no por orden de carga ni por id', () => {
  assert.deepEqual(diagOptions(CAT).map(p => p.name), [
    'Esguince de tobillo grado II',
    'Lumbalgia mecánica crónica',
    'Tendinitis rotuliana',
  ]);
});

test('diagOptions — no muta el array original (state.protocols se usa en otras pantallas)', () => {
  const copia = CAT.slice();
  diagOptions(CAT);
  assert.deepEqual(CAT, copia);
});

test('diagOptions — descarta filas sin nombre: no se puede elegir lo que no se ve', () => {
  const sucio = [{ id: 'a', name: '' }, { id: 'b', name: '   ' }, null, { id: 'c', name: 'Cervicalgia' }];
  assert.deepEqual(diagOptions(sucio).map(p => p.id), ['c']);
});

test('diagOptionsHtml — la opción vacía va SIEMPRE primera', () => {
  const html = diagOptionsHtml(CAT);
  assert.ok(html.startsWith('<option value="">— Sin diagnóstico —</option>'));
  // y el primer diagnóstico real es el que ordena alfabéticamente, no el primero del array
  const primero = html.indexOf('<option value="u-2">');
  assert.ok(primero > 0);
  assert.ok(primero < html.indexOf('<option value="u-1">'));
});

test('diagOptionsHtml — con el catálogo vacío no rompe: queda solo la opción vacía', () => {
  for (const vacio of [[], null, undefined]) {
    assert.equal(diagOptionsHtml(vacio), '<option value="">— Sin diagnóstico —</option>');
  }
});

test('diagOptionsHtml — el nombre va escapado (el catálogo lo escribe un usuario)', () => {
  const html = diagOptionsHtml([{ id: 'x', name: '<img src=x onerror=alert(1)>' }]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

// ── Sincronía patients.diag ↔ protocols.name ─────────────────────────────────
test('diagSync — elegir un diagnóstico deja diag = protocols.name y protocolId = protocols.id', () => {
  const r = diagSync(CAT, 'u-1', 'TENDENITIS PATELAR');
  assert.equal(r.protocolId, 'u-1');
  assert.equal(r.diag, 'Lumbalgia mecánica crónica');
});

test('diagSync — el id llega como string desde el <option> y se guarda el id REAL de la fila', () => {
  // Protocolo optimista (id numérico, todavía sin fila en la DB): el === contra protocols.id que
  // hacen ia.js e informes.js tiene que seguir funcionando, así que no puede guardarse el string.
  const r = diagSync([{ id: 7, name: 'Bursitis de hombro' }], '7', '');
  assert.equal(r.protocolId, 7);
  assert.equal(r.diag, 'Bursitis de hombro');
});

test('diagSync — elegir vacío deja protocolId null y NO pisa el diag legacy del paciente', () => {
  const r = diagSync(CAT, '', 'BURSISTIS');
  assert.equal(r.protocolId, null);
  assert.equal(r.diag, 'BURSISTIS');   // los 251 pacientes con texto libre conservan lo que decía su ficha
});

test('diagSync — alta nueva sin elegir: diag vacío, nunca el falso dato "Sin diagnóstico"', () => {
  const r = diagSync(CAT, '', '');
  assert.equal(r.protocolId, null);
  assert.equal(r.diag, '');
});

test('diagSync — id que ya no está en el catálogo (borrado) no inventa diagnóstico', () => {
  const r = diagSync(CAT, 'u-borrado', 'HOMBRO DERECHO');
  assert.equal(r.protocolId, null);
  assert.equal(r.diag, 'HOMBRO DERECHO');
});

// ── Permisos partidos: el terapeuta crea, el admin cura ──────────────────────
test('permisos — el terapeuta CREA diagnósticos pero no los edita ni los borra', () => {
  const antes = state.currentUserRole;
  state.currentUserRole = 'terapeuta';
  assert.equal(hasPermission('createProtocol'), true);
  assert.equal(hasPermission('editProtocol'), false);
  state.currentUserRole = 'admin';
  assert.equal(hasPermission('createProtocol'), true);
  assert.equal(hasPermission('editProtocol'), true);
  state.currentUserRole = 'secretaria';
  assert.equal(hasPermission('createProtocol'), false);
  assert.equal(hasPermission('editProtocol'), false);
  state.currentUserRole = antes;
});

// ── El CIE-10 llega al prompt de la IA ───────────────────────────────────────
test('diagParaPrompt — con CIE-10 y descripción', () => {
  assert.equal(
    diagParaPrompt({ diag: 'Lumbalgia mecánica crónica', cie10: 'M54.5', cie10Desc: 'Lumbago no especificado' }),
    'Lumbalgia mecánica crónica (CIE-10 M54.5 — Lumbago no especificado)');
});

test('diagParaPrompt — con código pero sin descripción: no queda el guion suelto', () => {
  assert.equal(diagParaPrompt({ diag: 'Cervicalgia', cie10: 'M54.2' }),
    'Cervicalgia (CIE-10 M54.2)');
});

test('diagParaPrompt — sin CIE-10 la línea queda idéntica a como era antes de DIAG-1', () => {
  assert.equal(diagParaPrompt({ diag: 'Cervicalgia' }), 'Cervicalgia');
  assert.equal(diagParaPrompt({ diag: '', cie10: null }), 'No especificado');
  assert.equal(diagParaPrompt({}), 'No especificado');
  assert.equal(diagParaPrompt(null), 'No especificado');
});
