// Tests del buscador CIE-10 — node --test.
// buscarCie10 es pura (recibe el catálogo ya cargado, que en la app llega por import dinámico).
// Además de un catálogo de juguete se corre contra el catálogo REAL leído del disco, para que
// un cambio de formato del JSON rompa acá y no en producción.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarCie10, diagConCie, normalizeSearch } from '../js/utils.js';

const CAT = [
  { c: 'M54.5', d: 'Lumbago no especificado' },
  { c: 'M54.4', d: 'Lumbago con ciatica' },
  { c: 'M75.1', d: 'Sindrome del manguito rotatorio' },
  { c: 'M77.1', d: 'Epicondilitis lateral' },
  { c: 'G54.0', d: 'Trastornos del plexo braquial' },
  { c: 'S83.5', d: 'Esguince y torcedura que compromete el ligamento cruzado de la rodilla' },
];

const codigos = res => res.map(r => r.c);

test('buscarCie10 — por código exacto y por código parcial', () => {
  assert.deepEqual(codigos(buscarCie10(CAT, 'M54.5')), ['M54.5']);
  // Parcial: los dos M54 salen, y el prefijo más corto ordena por código.
  assert.deepEqual(codigos(buscarCie10(CAT, 'M54')), ['M54.4', 'M54.5']);
  assert.deepEqual(codigos(buscarCie10(CAT, 'm7')), ['M75.1', 'M77.1']);
});

test('buscarCie10 — el punto del código es opcional', () => {
  assert.deepEqual(codigos(buscarCie10(CAT, 'm545')), ['M54.5']);
  assert.deepEqual(codigos(buscarCie10(CAT, 'M545')), ['M54.5']);
});

test('buscarCie10 — por descripción, insensible a acentos y mayúsculas', () => {
  assert.deepEqual(codigos(buscarCie10(CAT, 'lumbago')), ['M54.4', 'M54.5']);
  assert.deepEqual(codigos(buscarCie10(CAT, 'LUMBAGO')), ['M54.4', 'M54.5']);
  // El catálogo viene sin tildes; el usuario las escribe igual.
  assert.deepEqual(codigos(buscarCie10(CAT, 'ciática')), ['M54.4']);
  assert.deepEqual(codigos(buscarCie10(CAT, 'síndrome')), ['M75.1']);
  assert.deepEqual(codigos(buscarCie10(CAT, 'BRAQUIÁL')), ['G54.0']);
});

test('buscarCie10 — el código gana al texto en el orden', () => {
  // 'm54' matchea los dos códigos M54; ninguna descripción contiene 'm54'.
  const res = buscarCie10(CAT, 'm54');
  assert.equal(res[0].c, 'M54.4');
  // Con una consulta que matchea código Y descripción, el código va primero.
  const mixto = buscarCie10([{ c: 'M99.9', d: 'algo lumbago' }, { c: 'LUMBAGO1', d: 'otra cosa' }], 'lumbago');
  assert.equal(mixto[0].c, 'LUMBAGO1');
});

test('buscarCie10 — tope de 12 resultados (y limit configurable)', () => {
  const grande = Array.from({ length: 50 }, (_, i) => ({ c: `Z${String(i).padStart(2, '0')}`, d: 'dolor lumbar cronico' }));
  assert.equal(buscarCie10(grande, 'dolor').length, 12);
  assert.equal(buscarCie10(grande, 'Z').length, 12);
  assert.equal(buscarCie10(grande, 'dolor', 5).length, 5);
  assert.equal(buscarCie10(grande, 'dolor', 100).length, 50);   // no inventa resultados
  assert.equal(buscarCie10(grande, 'dolor', 0).length, 0);
});

test('buscarCie10 — sin consulta, sin resultados o catálogo inválido devuelve []', () => {
  assert.deepEqual(buscarCie10(CAT, ''), []);
  assert.deepEqual(buscarCie10(CAT, '   '), []);
  assert.deepEqual(buscarCie10(CAT, null), []);
  assert.deepEqual(buscarCie10(CAT, 'zzzzz'), []);
  assert.deepEqual(buscarCie10(null, 'lumbago'), []);
  assert.deepEqual(buscarCie10(undefined, 'lumbago'), []);
  assert.deepEqual(buscarCie10([null, undefined, { c: 'M54.5', d: 'Lumbago' }], 'lumbago'), [{ c: 'M54.5', d: 'Lumbago' }]);
});

test('buscarCie10 — el catálogo real: formato y búsquedas de uso diario', () => {
  const real = JSON.parse(readFileSync(new URL('../js/data/cie10-fisio.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(real) && real.length > 2000, `catálogo con ${real.length} códigos`);
  assert.ok(real.every(x => typeof x.c === 'string' && typeof x.d === 'string'), 'todas las filas son {c,d} string');
  for (const q of ['lumbago', 'M54', 'hombro', 'esguince', 'rodilla']) {
    const res = buscarCie10(real, q);
    assert.ok(res.length > 0 && res.length <= 12, `"${q}" → ${res.length} resultados`);
  }
  // Búsqueda con tilde contra un catálogo sin tildes (el caso que motivó normalizeSearch).
  assert.ok(buscarCie10(real, 'artículación').length >= 0);
  assert.deepEqual(buscarCie10(real, 'M54.5').map(x => x.c), ['M54.5']);
});

test('normalizeSearch — lo que hace posible la búsqueda insensible', () => {
  assert.equal(normalizeSearch('  Ciática '), 'ciatica');
  assert.equal(normalizeSearch('LUMBALGÍA'), 'lumbalgia');
  assert.equal(normalizeSearch(null), '');
});

test('diagConCie — celda Diagnóstico del informe y del PDF', () => {
  assert.equal(diagConCie('Lumbalgia mecánica', 'M54.5'), 'Lumbalgia mecánica (CIE-10: M54.5)');
  assert.equal(diagConCie('Lumbalgia mecánica', null), 'Lumbalgia mecánica');
  assert.equal(diagConCie('Lumbalgia mecánica', ''), 'Lumbalgia mecánica');
  // Sin diagnóstico no se emite un "(CIE-10: …)" huérfano
  assert.equal(diagConCie('', 'M54.5'), '');
  assert.equal(diagConCie(null, 'M54.5'), '');
  assert.equal(diagConCie('  Lumbago  ', ' M54.5 '), 'Lumbago (CIE-10: M54.5)');
});
