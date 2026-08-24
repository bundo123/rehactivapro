// Tests de la FRONTERA DE EPISODIO — node --test.
// Al iniciar un episodio nuevo, el modal pregunta con qué cita EMPIEZA el nuevo y el marcador
// 'Fin de episodio' se fecha el DÍA ANTERIOR a esa cita. Como la frontera es ESTRICTA (cuenta lo
// que tiene date > fin), lo registrado en la cita elegida y en adelante pertenece al episodio
// nuevo. Acá se cubren los helpers puros del selector, el cálculo de la fecha del marcador y el
// efecto de la elección sobre los dos conteos que dependen de la frontera: doneActual (sesiones
// del episodio) y citaOrdinal (badge X/N).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citasParaCierre, indiceCitaCierre, fmtFechaCorta, diaAnterior,
         doneActual, citaOrdinal } from '../js/utils.js';

const HOY = '2026-08-14', AYER = '2026-08-13', MANANA = '2026-08-15';

const cita = (id, date, hour = 9, patientId = 'p1') =>
  ({ id, date, hour, duration: 60, status: 'conf', patientId, therapistId: 't1' });
const sesion = (date) => ({ date, type: 'Fisioterapia', status: 'asistió' });
const finEpisodio = (date) => ({ date, type: 'Fin de episodio', status: 'asistió' });

// Espejo de la línea de guardarNuevoEpisodio (js/pacientes.js): la fecha del marcador sale de la
// cita elegida en el selector, o de `hoy` cuando el paciente no tiene citas que ofrecer.
const fechaMarcador = (citaElegida, hoy = HOY) =>
  citaElegida ? diaAnterior(String(citaElegida.date)) : diaAnterior(hoy);

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

// ── Fecha del marcador: el DÍA ANTERIOR a la cita elegida ─────────────────────
test('la cita elegida abre el episodio nuevo — el marcador va un día antes', () => {
  assert.equal(fechaMarcador(cita('a1', '2026-08-21')), '2026-08-20');
  assert.equal(fechaMarcador(cita('a1', HOY)), AYER);
  assert.equal(fechaMarcador(cita('a1', MANANA)), HOY);
  assert.equal(fechaMarcador(cita('a1', '2026-09-01')), '2026-08-31');   // cruza de mes
});

test('sin citas que elegir — el marcador se fecha AYER (el episodio nuevo arranca hoy)', () => {
  assert.equal(fechaMarcador(null, HOY), AYER);
  assert.equal(fechaMarcador(null, '2026-01-01'), '2025-12-31');
  const p = { id: 'p1', sessions: 10, log: [sesion('2026-08-10'), finEpisodio(fechaMarcador(null, HOY))] };
  assert.equal(doneActual(p), 0);
  p.log.push(sesion(HOY));
  assert.equal(doneActual(p), 1);
  const citaHoy = cita('a1', HOY);
  assert.deepEqual(citaOrdinal([citaHoy], p, citaHoy), { x: 1, n: 10 });
});

// ── Efecto de la elección sobre los conteos ───────────────────────────────────
test('elegir la cita de HOY — la sesión de hoy es la 1 del episodio nuevo', () => {
  // Episodio anterior: dos sesiones, la última ayer. Se abre el nuevo con la cita de hoy, así que
  // el marcador queda en AYER y la sesión que se registre hoy ya cuenta en el episodio nuevo.
  const p = { id: 'p1', sessions: 10,
              log: [sesion('2026-08-11'), sesion(AYER), finEpisodio(fechaMarcador(cita('a2', HOY)))] };
  const citaAyer = cita('a1', AYER), citaHoy = cita('a2', HOY);
  assert.equal(doneActual(p), 0);                              // nada posterior a la frontera
  assert.equal(citaOrdinal([citaAyer, citaHoy], p, citaAyer), null);   // quedó en el episodio cerrado
  assert.deepEqual(citaOrdinal([citaAyer, citaHoy], p, citaHoy), { x: 1, n: 10 });
  p.log.push(sesion(HOY));
  assert.equal(doneActual(p), 1);
});

test('elegir la cita de MAÑANA — lo de hoy queda en el episodio VIEJO', () => {
  // El episodio nuevo arranca en la próxima cita agendada: marcador HOY, la sesión de hoy es la
  // última del episodio que termina.
  const p = { id: 'p1', sessions: 10,
              log: [sesion(AYER), sesion(HOY), finEpisodio(fechaMarcador(cita('a2', MANANA)))] };
  assert.equal(doneActual(p), 0);
  const citaHoy = cita('a1', HOY), citaManana = cita('a2', MANANA);
  assert.equal(citaOrdinal([citaHoy, citaManana], p, citaHoy), null);
  assert.deepEqual(citaOrdinal([citaHoy, citaManana], p, citaManana), { x: 1, n: 10 });
  p.log.push(sesion(MANANA));
  assert.equal(doneActual(p), 1);
});

// ── Regresión del caso real de producción (agosto 2026) ───────────────────────
// La terapeuta eligió la cita del 21-ago pensando "con esta empieza el episodio nuevo", pero el
// modal preguntaba por la ÚLTIMA del anterior: el marcador tomó el 2026-08-21 y la sesión de ese
// mismo día quedó archivada en el episodio viejo (date == fin no es > fin), dejando el episodio
// nuevo vacío. Con la pregunta invertida el marcador va al 20-ago y esa sesión cuenta en el nuevo.
test('regresión — la sesión del día de la cita elegida cae DENTRO del episodio nuevo', () => {
  const citaElegida = cita('a1', '2026-08-21');
  const fin = fechaMarcador(citaElegida, '2026-08-21');
  assert.equal(fin, '2026-08-20');
  const p = { id: 'p1', sessions: 10,
              log: [sesion('2026-08-14'), finEpisodio(fin), sesion('2026-08-21')] };
  assert.equal(doneActual(p), 1);                               // antes del fix: 0
  assert.deepEqual(citaOrdinal([citaElegida], p, citaElegida), { x: 1, n: 10 });
  // Y lo del episodio viejo sigue afuera.
  const citaVieja = cita('a0', '2026-08-14');
  assert.equal(citaOrdinal([citaVieja, citaElegida], p, citaVieja), null);
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
