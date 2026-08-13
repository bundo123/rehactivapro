// Tests del guard de borrado de terapeuta y de los campos nuevos del modal — node --test.
// El borrado de terapeuta ya NO arrastra citas en cascada: con UNA sola cita (pasada o futura) se
// bloquea y hay que reasignarlas antes. Solo se elimina un terapeuta con cero citas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { therapistDeleteBlock, textoBloqueoBorrado, hourValToTime, parseHourVal } from '../js/utils.js';

const cita = (id, date, therapistId = 't1') => ({ id, date, hour: 9, therapistId, patientId: 'p1' });
const HOY = '2026-08-13';

// ── therapistDeleteBlock ─────────────────────────────────────────────────────
test('therapistDeleteBlock — sin citas: null (el único caso que se puede eliminar)', () => {
  assert.equal(therapistDeleteBlock([], 't1', HOY), null);
  assert.equal(therapistDeleteBlock(null, 't1', HOY), null);
  assert.equal(therapistDeleteBlock([cita('a1', '2026-08-01', 't2')], 't1', HOY), null);
});

test('therapistDeleteBlock — una sola cita PASADA ya bloquea', () => {
  const b = therapistDeleteBlock([cita('a1', '2026-01-10')], 't1', HOY);
  assert.deepEqual(b, { total: 1, futuras: 0 });
});

test('therapistDeleteBlock — cuenta total y separa las futuras', () => {
  const citas = [
    cita('a1', '2026-01-10'), cita('a2', '2026-07-30'),      // pasadas
    cita('a3', '2026-09-01'), cita('a4', '2026-12-24'),      // futuras
  ];
  assert.deepEqual(therapistDeleteBlock(citas, 't1', HOY), { total: 4, futuras: 2 });
});

test('therapistDeleteBlock — la cita de HOY cuenta como futura (todavía se atiende)', () => {
  assert.deepEqual(therapistDeleteBlock([cita('a1', HOY)], 't1', HOY), { total: 1, futuras: 1 });
});

test('therapistDeleteBlock — las citas de otros terapeutas no cuentan', () => {
  const citas = [cita('a1', '2026-09-01'), cita('b1', '2026-09-02', 't2'), cita('b2', '2026-01-01', 't2')];
  assert.deepEqual(therapistDeleteBlock(citas, 't1', HOY), { total: 1, futuras: 1 });
  assert.deepEqual(therapistDeleteBlock(citas, 't2', HOY), { total: 2, futuras: 1 });
});

test('therapistDeleteBlock — ids numéricos vs string (optimista local): comparan igual', () => {
  assert.deepEqual(therapistDeleteBlock([cita('a1', '2026-09-01', 7)], '7', HOY), { total: 1, futuras: 1 });
  assert.deepEqual(therapistDeleteBlock([cita('a1', '2026-09-01', '7')], 7, HOY), { total: 1, futuras: 1 });
});

test('therapistDeleteBlock — entradas nulas no explotan ni emparejan por accidente', () => {
  assert.equal(therapistDeleteBlock([cita('a1', '2026-09-01')], null, HOY), null);
  const huerfana = { id: 'x', date: '2026-09-01', therapistId: null };
  assert.equal(therapistDeleteBlock([huerfana, null], null, HOY), null);
  assert.equal(therapistDeleteBlock([huerfana, null], 't1', HOY), null);
});

test('therapistDeleteBlock — cita sin fecha cuenta en el total, no en futuras', () => {
  const sinFecha = { id: 'x', therapistId: 't1' };
  assert.deepEqual(therapistDeleteBlock([sinFecha], 't1', HOY), { total: 1, futuras: 0 });
});

// ── Mensaje del bloqueo ──────────────────────────────────────────────────────
test('textoBloqueoBorrado — dice cuántas hay y qué hacer', () => {
  assert.equal(textoBloqueoBorrado({ total: 4, futuras: 2 }),
    'No se puede eliminar: tiene 4 citas (2 futuras). Reasigná sus citas primero.');
  assert.equal(textoBloqueoBorrado({ total: 1, futuras: 1 }),
    'No se puede eliminar: tiene 1 cita (1 futura). Reasigná sus citas primero.');
  assert.equal(textoBloqueoBorrado({ total: 3, futuras: 0 }),
    'No se puede eliminar: tiene 3 citas (0 futuras). Reasigná sus citas primero.');
  assert.equal(textoBloqueoBorrado(null), '');   // sin bloqueo, sin mensaje
});

// ── Horario del modal: hourValToTime ⇄ parseHourVal ──────────────────────────
test('hourValToTime — horas float a HH:MM para el <input type="time">', () => {
  assert.equal(hourValToTime(7), '07:00');
  assert.equal(hourValToTime(7.5), '07:30');
  assert.equal(hourValToTime(13), '13:00');
  assert.equal(hourValToTime(0), '00:00');
});

test('hourValToTime — sin horario definido: input vacío', () => {
  assert.equal(hourValToTime(null), '');
  assert.equal(hourValToTime(undefined), '');
  assert.equal(hourValToTime(''), '');
  assert.equal(hourValToTime('abc'), '');
  assert.equal(hourValToTime(-1), '');
});

test('hourValToTime + parseHourVal — ida y vuelta estable (media hora es la resolución)', () => {
  [7, 7.5, 12, 13.5, 19].forEach(h => {
    assert.equal(parseHourVal(hourValToTime(h)), h);
  });
  ['07:00', '07:30', '13:00'].forEach(t => {
    assert.equal(hourValToTime(parseHourVal(t)), t);
  });
});
