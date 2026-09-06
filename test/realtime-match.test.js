// Tests del matcheo de filas de session_log que usa realtime.js (findSessionIdx) — node --test.
// RT-01: los eventos remotos se ubican en p.log POR ID; el fallback por (date,hour) es solo para
// entradas de memoria sin id, porque dos sesiones distintas pueden compartir el mismo slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSessionIdx } from '../js/utils.js';

const ses = (id, date, hour) => ({ id, date, type: 'Fisioterapia', hour, status: 'asistió' });

test('a) fila con id que existe en el log con OTRA fecha → la encuentra por id', () => {
  const log = [ses(1, '2026-03-02', '09:00'), ses(7, '2026-03-05', '11:00')];
  // La sesión 7 se movió al 10 de marzo desde otra PC: el UPDATE tiene que pisar la fila, no duplicarla.
  const idx = findSessionIdx(log, { id: 7, date: '2026-03-10', hour: '16:00:00' });
  assert.equal(idx, 1);
});

test('b) fila con id nuevo y otra sesión CON id en el mismo (date,hour) → -1 (no pisa a la vecina)', () => {
  const log = [ses(3, '2026-03-05', '11:00')];
  const idx = findSessionIdx(log, { id: 9, date: '2026-03-05', hour: '11:00:00' });
  assert.equal(idx, -1);
});

test('c) fila con id nuevo y entrada de memoria SIN id en el mismo (date,hour) → fallback legacy', () => {
  const log = [ses(3, '2026-03-02', '09:00'), { date: '2026-03-05', hour: '11:00', type: 'Fisioterapia' }];
  const idx = findSessionIdx(log, { id: 9, date: '2026-03-05', hour: '11:00:00' });
  assert.equal(idx, 1);
});

test('d) fila SIN id → matchea por (date,hour) normalizada, y -1 si no hay ninguna', () => {
  const log = [ses(3, '2026-03-02', '9:00'), ses(4, '2026-03-05', '11:00')];
  assert.equal(findSessionIdx(log, { date: '2026-03-02', hour: '09:00:00' }), 0);
  assert.equal(findSessionIdx(log, { date: '2026-03-09', hour: '09:00:00' }), -1);
});

test('el id se compara como string (uuid o bigint indistintos)', () => {
  const log = [ses('7', '2026-03-05', '11:00')];
  assert.equal(findSessionIdx(log, { id: 7, date: '2026-03-05', hour: '11:00:00' }), 0);
});

test('los segundos cuentan: dos manuales del mismo slot no se confunden entre sí', () => {
  const log = [{ date: '2026-03-05', hour: '11:00:00' }, { date: '2026-03-05', hour: '11:00:30' }];
  assert.equal(findSessionIdx(log, { date: '2026-03-05', hour: '11:00:30' }), 1);
});

test('log vacío, nulo o fila nula → -1', () => {
  assert.equal(findSessionIdx([], { id: 1, date: '2026-03-05', hour: '11:00' }), -1);
  assert.equal(findSessionIdx(null, { id: 1, date: '2026-03-05', hour: '11:00' }), -1);
  assert.equal(findSessionIdx(undefined, { id: 1, date: '2026-03-05', hour: '11:00' }), -1);
  assert.equal(findSessionIdx([ses(1, '2026-03-05', '11:00')], null), -1);
});
