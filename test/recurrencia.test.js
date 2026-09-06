// Tests de getRecDates — las fechas de una serie de citas recurrentes. node --test.
// Pura: vive en utils.js justamente para poder importarla acá (agenda.js arrastra Supabase y DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRecDates } from '../js/utils.js';

// 2026-09-07 es lunes. dias: 1=lun, 3=mié, 5=vie.
test('getRecDates — base lunes, L/M/V por 2 semanas: 5 fechas (la base no cuenta)', () => {
  const f = getRecDates('2026-09-07', [1, 3, 5], 2);
  assert.deepEqual(f, ['2026-09-09', '2026-09-11', '2026-09-14', '2026-09-16', '2026-09-18']);
});

test('getRecDates — el resultado viene ordenado y sin repetidos', () => {
  const f = getRecDates('2026-09-07', [5, 1, 3], 2);
  assert.deepEqual(f, [...f].sort(), 'debe venir ordenado ascendente');
  assert.equal(new Set(f).size, f.length, 'no debe repetir fechas');
});

test('getRecDates — sin días seleccionados devuelve lista vacía', () => {
  assert.deepEqual(getRecDates('2026-09-07', [], 1), []);
});

test('getRecDates — la fecha base nunca aparece en el resultado', () => {
  // 2026-09-07 es lunes y 1 (lunes) está pedido: aun así la base queda fuera.
  const f = getRecDates('2026-09-07', [1], 3);
  assert.ok(!f.includes('2026-09-07'), 'la cita base ya se creó aparte');
  assert.deepEqual(f, ['2026-09-14', '2026-09-21']);
});

test('getRecDates — cruce de mes: la serie sigue en el mes siguiente', () => {
  // 2026-09-28 es lunes; 3=miércoles → 2026-09-30 y 2026-10-07.
  const f = getRecDates('2026-09-28', [3], 2);
  assert.deepEqual(f, ['2026-09-30', '2026-10-07']);
});
