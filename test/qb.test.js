// Tests de conciliación con QuickBooks — node --test.
// `qbAt` responde "¿esta cita ya se pasó a QuickBooks?": es estado ADMINISTRATIVO y ortogonal al
// clínico (`status`). Acá se cubren las dos piezas puras: a quién alcanza el botón "Conciliar día"
// (citasConciliables) y la regla de que salir de 'conf' desconcilia (payloadCambioStatus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citasConciliables, payloadCambioStatus } from '../js/utils.js';

const cita = (id, status, extra = {}) =>
  ({ id, date: '2026-08-10', therapistId: 't1', hour: 9, duration: 60, status, qbAt: null, ...extra });

// ── citasConciliables ─────────────────────────────────────────────────────────
test('citasConciliables — la confirmada sin conciliar es la que entra', () => {
  const a = cita('a1', 'conf');
  assert.deepEqual(citasConciliables([a], '2026-08-10'), [a]);
});

test('citasConciliables — excluye las pendientes', () => {
  // Una 'pend' de un día pasado es un error de registro, no una asistencia: no se cobra.
  assert.deepEqual(citasConciliables([cita('p1', 'pend')], '2026-08-10'), []);
});

test('citasConciliables — excluye las no-asistió', () => {
  assert.deepEqual(citasConciliables([cita('n1', 'noas')], '2026-08-10'), []);
});

test('citasConciliables — excluye la confirmada que YA tiene qbAt (idempotencia)', () => {
  const ya = cita('a1', 'conf', { qbAt: '2026-08-11T14:00:00.000Z' });
  assert.deepEqual(citasConciliables([ya], '2026-08-10'), []);
});

test('citasConciliables — respeta la fecha: solo el día pedido', () => {
  const hoy = cita('a1', 'conf');
  const otro = cita('a2', 'conf', { date: '2026-08-11' });
  const r = citasConciliables([hoy, otro], '2026-08-10');
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'a1');
});

test('citasConciliables — mezcla del día: solo las conf sin conciliar', () => {
  const dia = [
    cita('a1', 'conf'),
    cita('a2', 'conf', { qbAt: '2026-08-11T14:00:00.000Z' }),
    cita('p1', 'pend'),
    cita('n1', 'noas'),
    cita('a3', 'conf'),
    cita('a4', 'conf', { date: '2026-08-09' }),
  ];
  assert.deepEqual(citasConciliables(dia, '2026-08-10').map(a => a.id), ['a1', 'a3']);
});

test('citasConciliables — lista vacía, nula y con huecos', () => {
  assert.deepEqual(citasConciliables([], '2026-08-10'), []);
  assert.deepEqual(citasConciliables(null, '2026-08-10'), []);
  assert.deepEqual(citasConciliables([null, undefined], '2026-08-10'), []);
});

test('citasConciliables — sin status (datos viejos) NO se concilia', () => {
  // Solo lo explícitamente confirmado se cobra: un dato incompleto no entra al lote.
  assert.deepEqual(citasConciliables([{ date: '2026-08-10' }], '2026-08-10'), []);
});

// ── payloadCambioStatus ───────────────────────────────────────────────────────
test('payloadCambioStatus — pasar a conf no toca qb_at', () => {
  // Confirmar no concilia: eso lo decide el botón del día o la casilla del modal.
  assert.deepEqual(payloadCambioStatus('conf'), { status: 'conf' });
  assert.equal('qb_at' in payloadCambioStatus('conf'), false);
});

test('payloadCambioStatus — pasar a pend desconcilia', () => {
  assert.deepEqual(payloadCambioStatus('pend'), { status: 'pend', qb_at: null });
});

test('payloadCambioStatus — pasar a noas desconcilia', () => {
  // Lo que no es asistencia no puede quedar pasado a QuickBooks.
  assert.deepEqual(payloadCambioStatus('noas'), { status: 'noas', qb_at: null });
});

test('payloadCambioStatus — el ciclo completo conf→pend→noas→conf deja el qb_at coherente', () => {
  const ciclo = ['pend', 'noas', 'conf'].map(payloadCambioStatus);
  assert.deepEqual(ciclo.map(p => p.qb_at), [null, null, undefined]);
});
