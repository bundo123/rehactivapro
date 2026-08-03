// Tests de startOfWeek (vista semanal de agenda) — node --test. Lógica pura de fechas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOfWeek, fmtDate } from '../js/utils.js';

test('startOfWeek — un lunes devuelve el mismo día', () => {
  assert.equal(fmtDate(startOfWeek(new Date(2026, 7, 3))), '2026-08-03'); // lunes
});

test('startOfWeek — mitad de semana vuelve al lunes', () => {
  assert.equal(fmtDate(startOfWeek(new Date(2026, 7, 5))), '2026-08-03'); // miércoles
  assert.equal(fmtDate(startOfWeek(new Date(2026, 7, 8))), '2026-08-03'); // sábado
});

test('startOfWeek — el domingo pertenece a la semana del lunes ANTERIOR', () => {
  assert.equal(fmtDate(startOfWeek(new Date(2026, 7, 9))), '2026-08-03'); // domingo
});

test('startOfWeek — cruza el borde de mes', () => {
  assert.equal(fmtDate(startOfWeek(new Date(2026, 7, 1))), '2026-07-27'); // sáb 1 ago → lun 27 jul
});

test('startOfWeek — no muta el argumento y normaliza a medianoche', () => {
  const d = new Date(2026, 7, 5, 15, 30);
  const r = startOfWeek(d);
  assert.equal(fmtDate(d), '2026-08-05');
  assert.equal(r.getHours(), 0);
  assert.equal(r.getMinutes(), 0);
});
