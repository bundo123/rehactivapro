// Tests de planResumen (SES-1) — node --test.
// El modal de la cita muestra DOS medidas distintas que comparten N (p.sessions):
//  · x = sesiones REGISTRADAS del episodio actual (session_log: doneActual + previas) → manda `over`.
//  · cita = N.º de orden de la cita abierta en el episodio (citaOrdinal, lo que pinta el badge X/N).
// Datos ficticios; mismas formas de p.log y de cita que test/ordinal.test.js y test/epi2a.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planResumen } from '../js/utils.js';

const cita = (id, date, hour, status = 'conf', patientId = 'p1') =>
  ({ id, date, hour, duration: 60, status, patientId, therapistId: 't1' });
const ses = (date, extra = {}) => ({ date, type: 'Fisioterapia', status: 'asistió', hour: '09:00:00', ...extra });

// 8 citas en marzo (lun/mié/vie), la última es la que se abre.
const ochoCitas = () => ['02', '04', '06', '09', '11', '13', '16', '18']
  .map((d, i) => cita('a' + (i + 1), `2026-03-${d}`, 9));

test('planResumen — 4 registradas, plan 10, 8.ª cita: las dos medidas por separado', () => {
  const citas = ochoCitas();
  const p = { id: 'p1', sessions: 10, log: [ses('2026-03-02'), ses('2026-03-04'), ses('2026-03-06'), ses('2026-03-09')] };
  assert.deepEqual(planResumen(p, citas[7], citas), { x: 4, n: 10, over: false, cita: { x: 8, n: 10 } });
});

test('planResumen — sin plan: n 0, over false y la cita sin N', () => {
  const citas = ochoCitas();
  const p = { id: 'p1', sessions: 0, log: [ses('2026-03-02'), ses('2026-03-04')] };
  const r = planResumen(p, citas[2], citas);
  assert.equal(r.x, 2);
  assert.equal(r.n, 0);
  assert.equal(r.over, false);
  assert.deepEqual(r.cita, { x: 3, n: null });
});

test('planResumen — 11 registradas con plan 10: over por sesiones registradas', () => {
  const log = Array.from({ length: 11 }, (_, i) => ses(`2026-04-${String(i + 1).padStart(2, '0')}`));
  const p = { id: 'p1', sessions: 10, log };
  const citas = ochoCitas();
  const r = planResumen(p, citas[0], citas);
  assert.equal(r.x, 11);
  assert.equal(r.over, true);
  assert.deepEqual(r.cita, { x: 1, n: 10 });   // la cita en sí no supera el plan
});

test('planResumen — solo cuenta lo registrado como asistió (faltó y evaluación inicial no)', () => {
  const p = { id: 'p1', sessions: 10, log: [
    { date: '2026-03-01', type: 'Evaluación inicial', status: 'asistió', hour: '08:00:00' },
    ses('2026-03-02'), ses('2026-03-04', { status: 'faltó' })] };
  assert.equal(planResumen(p, null, []).x, 1);
});

test('planResumen — cita no-asistió → cita null; sin cita → cita null', () => {
  const c1 = cita('a1', '2026-03-02', 9), nx = cita('a2', '2026-03-04', 9, 'noas');
  const p = { id: 'p1', sessions: 10, log: [ses('2026-03-02')] };
  assert.deepEqual(planResumen(p, nx, [c1, nx]), { x: 1, n: 10, over: false, cita: null });
  assert.equal(planResumen(p, null, [c1, nx]).cita, null);
});

test('planResumen — sin paciente: ceros', () => {
  assert.deepEqual(planResumen(null, cita('a1', '2026-03-02', 9), []), { x: 0, n: 0, over: false, cita: null });
  assert.deepEqual(planResumen(undefined), { x: 0, n: 0, over: false, cita: null });
});
