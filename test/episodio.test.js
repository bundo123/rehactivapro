// Tests del CIERRE DE EPISODIO con frontera elegida — node --test.
// Al iniciar un episodio nuevo, el modal pregunta cuál fue la última cita del anterior y la FECHA
// de esa cita es la que lleva el marcador 'Fin de episodio'. Como la frontera es ESTRICTA
// (cuenta lo que tiene date > fin), todo lo posterior a ese día pertenece al episodio nuevo.
// Acá se cubren los helpers puros del selector y el efecto de la elección sobre los dos conteos
// que dependen de la frontera: doneActual (sesiones del episodio) y citaOrdinal (badge X/N).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citasParaCierre, indiceCitaCierre, fmtFechaCorta, diaAnterior,
         doneActual, citaOrdinal } from '../js/utils.js';

const HOY = '2026-08-14', AYER = '2026-08-13', MANANA = '2026-08-15';

const cita = (id, date, hour = 9, patientId = 'p1') =>
  ({ id, date, hour, duration: 60, status: 'conf', patientId, therapistId: 't1' });
const sesion = (date) => ({ date, type: 'Fisioterapia', status: 'asistió' });
const finEpisodio = (date) => ({ date, type: 'Fin de episodio', status: 'asistió' });

// ── Opciones del selector: 5 pasadas + 3 futuras ──────────────────────────────
test('citasParaCierre — las 5 pasadas más recientes y las 3 futuras más próximas', () => {
  const citas = [
    cita('v1', '2026-08-01'), cita('v2', '2026-08-04'), cita('v3', '2026-08-06'),
    cita('v4', '2026-08-08'), cita('v5', '2026-08-11'), cita('v6', AYER),
    cita('f1', MANANA), cita('f2', '2026-08-18'), cita('f3', '2026-08-20'), cita('f4', '2026-08-22'),
  ];
  const out = citasParaCierre(citas, 'p1', HOY);
  assert.deepEqual(out.map(a => a.id), ['v2', 'v3', 'v4', 'v5', 'v6', 'f1', 'f2', 'f3']);
});

test('citasParaCierre — la cita de HOY cuenta como pasada (ya se atendió)', () => {
  const out = citasParaCierre([cita('a1', AYER), cita('a2', HOY), cita('a3', MANANA)], 'p1', HOY);
  assert.deepEqual(out.map(a => a.id), ['a1', 'a2', 'a3']);
  assert.equal(indiceCitaCierre(out, HOY), 1);   // preselección: la pasada más reciente = la de hoy
});

test('citasParaCierre — orden ascendente por fecha y hora, venga como venga la lista', () => {
  const tarde = cita('t', HOY, 10.75), temprano = cita('e', HOY, 9);
  const out = citasParaCierre([tarde, temprano, cita('v', AYER)], 'p1', HOY);
  assert.deepEqual(out.map(a => a.id), ['v', 'e', 't']);
});

test('citasParaCierre — solo las citas del paciente, y nada sin fecha', () => {
  const ajena = cita('x1', AYER, 9, 'p2');
  const sinFecha = { id: 'x2', date: null, hour: 9, patientId: 'p1' };
  const mia = cita('a1', AYER);
  assert.deepEqual(citasParaCierre([ajena, sinFecha, mia], 'p1', HOY).map(a => a.id), ['a1']);
});

test('citasParaCierre — sin citas (o entradas nulas) devuelve lista vacía', () => {
  assert.deepEqual(citasParaCierre([], 'p1', HOY), []);
  assert.deepEqual(citasParaCierre(null, 'p1', HOY), []);
  assert.deepEqual(citasParaCierre([null, undefined], 'p1', HOY), []);
});

test('indiceCitaCierre — sin pasadas manda la primera futura; con lista vacía, -1', () => {
  const soloFuturas = citasParaCierre([cita('f1', MANANA), cita('f2', '2026-08-18')], 'p1', HOY);
  assert.equal(indiceCitaCierre(soloFuturas, HOY), 0);
  assert.equal(indiceCitaCierre([], HOY), -1);
});

// ── Efecto de la elección sobre los conteos ───────────────────────────────────
test('elegir la cita de AYER — la de hoy es la 1 del episodio nuevo y doneActual arranca en 0', () => {
  // Episodio anterior: dos sesiones, la última ayer. Se cierra eligiendo la cita de ayer.
  const p = { id: 'p1', sessions: 10, log: [sesion('2026-08-11'), sesion(AYER), finEpisodio(AYER)] };
  const citaAyer = cita('a1', AYER), citaHoy = cita('a2', HOY);
  assert.equal(doneActual(p), 0);                              // nada posterior a la frontera
  assert.equal(citaOrdinal([citaAyer, citaHoy], p, citaAyer), null);   // quedó en el episodio cerrado
  assert.deepEqual(citaOrdinal([citaAyer, citaHoy], p, citaHoy), { x: 1, n: 10 });
  // Y la sesión que se registre hoy ya cuenta en el episodio nuevo.
  p.log.push(sesion(HOY));
  assert.equal(doneActual(p), 1);
});

test('elegir la cita de HOY — la entrada de hoy queda en el episodio VIEJO', () => {
  // Misma situación, pero el cierre se registra con la cita de hoy: la sesión de hoy es la última
  // del episodio que termina, no la primera del nuevo.
  const p = { id: 'p1', sessions: 10, log: [sesion(AYER), sesion(HOY), finEpisodio(HOY)] };
  assert.equal(doneActual(p), 0);
  const citaHoy = cita('a1', HOY), citaManana = cita('a2', MANANA);
  assert.equal(citaOrdinal([citaHoy, citaManana], p, citaHoy), null);
  assert.deepEqual(citaOrdinal([citaHoy, citaManana], p, citaManana), { x: 1, n: 10 });
  // La de mañana sí abre el episodio nuevo.
  p.log.push(sesion(MANANA));
  assert.equal(doneActual(p), 1);
});

test('sin citas — el marcador se fecha AYER y lo de hoy ya cuenta en el episodio nuevo', () => {
  assert.equal(diaAnterior(HOY), AYER);
  const p = { id: 'p1', sessions: 10, log: [sesion('2026-08-10'), finEpisodio(diaAnterior(HOY))] };
  assert.equal(doneActual(p), 0);
  p.log.push(sesion(HOY));
  assert.equal(doneActual(p), 1);
  assert.deepEqual(citaOrdinal([cita('a1', HOY)], p, cita('a1', HOY)), null);   // no está en la lista
  const citaHoy = cita('a1', HOY);
  assert.deepEqual(citaOrdinal([citaHoy], p, citaHoy), { x: 1, n: 10 });
});

// ── Etiquetas del selector ────────────────────────────────────────────────────
test('fmtFechaCorta — "Lun 12 ago", sin corrimiento por zona horaria', () => {
  assert.equal(fmtFechaCorta('2026-01-05'), 'Lun 5 ene');
  assert.equal(fmtFechaCorta('2026-08-12'), 'Mié 12 ago');
  assert.equal(fmtFechaCorta('2026-12-31'), 'Jue 31 dic');
  assert.equal(fmtFechaCorta(''), '');
  assert.equal(fmtFechaCorta('no-es-fecha'), 'no-es-fecha');
  assert.equal(fmtFechaCorta('2026-13-01'), '2026-13-01');   // mes inválido: se devuelve tal cual
});

test('diaAnterior — cruza mes y año, y aguanta basura', () => {
  assert.equal(diaAnterior('2026-08-01'), '2026-07-31');
  assert.equal(diaAnterior('2026-01-01'), '2025-12-31');
  assert.equal(diaAnterior('2026-03-01'), '2026-02-28');
  assert.equal(diaAnterior(''), '');
  assert.equal(diaAnterior(null), '');
});
