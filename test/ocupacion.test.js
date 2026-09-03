// Tests de la ocupación por terapeuta que muestran las tres pestañas de Informes — node --test.
//
// El bug que matan (P1 anotado en el lote 4a): el % de ocupación dividía CANTIDAD de citas entre
// SLOTS de 30' de capacidad. Una cita de 60' ocupa dos slots pero contaba como una, así que el
// terapeuta que atendía sesiones largas salía con la mitad de la ocupación que tenía de verdad.
// ocupacionTerapeuta suma apptSlots() en el numerador, la misma unidad que el denominador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ocupacionTerapeuta } from '../js/utils.js';

// Semana de referencia: lun 2026-08-31 … vie 2026-09-04. "Hoy" es el miércoles.
const LUN = '2026-08-31', MAR = '2026-09-01', MIE = '2026-09-02', JUE = '2026-09-03', VIE = '2026-09-04';
const SEMANA = [LUN, MAR, MIE, JUE, VIE];
const HOY = MIE;

// Turno 7:00–13:00 → 12 slots de 30'; con 60 min de almuerzo quedan 10 por día hábil transcurrido.
const th = (over = {}) => ({ id: 't1', startH: 7, endH: 13, lunchMinutes: 60, ...over });
const cita = (date, hour, duration, status = 'conf', therapistId = 't1') =>
  ({ id: date + hour + status, date, hour, duration, status, therapistId });

test('ocupación — una cita de 60 min cuenta 2 slots usados y 1 asistida', () => {
  const o = ocupacionTerapeuta(th(), [cita(LUN, 9, 60)], SEMANA, [], HOY);
  assert.equal(o.asistidas, 1);
  assert.equal(o.slotsUsados, 2);      // el numerador viejo era 1 y el % salía a la mitad
  assert.equal(o.capacidad, 30);       // 3 días transcurridos × 10 slots
  assert.equal(o.pct, Math.round(2 / 30 * 100));
});

test('ocupación — una cita de 30 min cuenta 1 slot; dos de 30 cuentan lo mismo que una de 60', () => {
  const corta = ocupacionTerapeuta(th(), [cita(LUN, 9, 30)], SEMANA, [], HOY);
  assert.equal(corta.slotsUsados, 1);
  const dos = ocupacionTerapeuta(th(), [cita(LUN, 9, 30), cita(MAR, 9, 30)], SEMANA, [], HOY);
  const larga = ocupacionTerapeuta(th(), [cita(LUN, 9, 60)], SEMANA, [], HOY);
  assert.equal(dos.slotsUsados, larga.slotsUsados);
  assert.equal(dos.asistidas, 2);      // …aunque sean DOS pacientes y no uno
  assert.equal(larga.asistidas, 1);
});

test('ocupación — una conf FUTURA no suma ni en asistidas ni en slots usados', () => {
  const citas = [cita(LUN, 9, 60), cita(VIE, 9, 60)];   // el viernes todavía no ocurrió
  const o = ocupacionTerapeuta(th(), citas, SEMANA, [], HOY);
  assert.equal(o.asistidas, 1);
  assert.equal(o.slotsUsados, 2);
});

test('ocupación — las faltas se cuentan aparte y no ocupan slots', () => {
  const citas = [cita(LUN, 9, 60), cita(MAR, 9, 60, 'noas'), cita(MAR, 11, 30, 'pend')];
  const o = ocupacionTerapeuta(th(), citas, SEMANA, [], HOY);
  assert.equal(o.asistidas, 1);
  assert.equal(o.noas, 1);
  assert.equal(o.slotsUsados, 2);      // la 'noas' liberó el slot y la 'pend' no decidió nada
});

test('ocupación — las citas de OTRO terapeuta no entran', () => {
  const citas = [cita(LUN, 9, 60), cita(LUN, 11, 60, 'conf', 't2')];
  const o = ocupacionTerapeuta(th(), citas, SEMANA, [], HOY);
  assert.equal(o.asistidas, 1);
  assert.equal(o.slotsUsados, 2);
});

test('ocupación — capacidad 0 da pct null, jamás 0%', () => {
  // Rango entero en el futuro: no hay ni un día hábil transcurrido.
  const o = ocupacionTerapeuta(th(), [], SEMANA, [], '2026-08-28');
  assert.equal(o.capacidad, 0);
  assert.equal(o.pct, null);
});

test('ocupación — un bloqueo de día completo baja la capacidad y nunca la deja negativa', () => {
  const bloqueoDia = [{ id: 'b1', therapistId: 't1', date: LUN, startH: 7, endH: 13 }];
  const o = ocupacionTerapeuta(th(), [], SEMANA, bloqueoDia, HOY);
  assert.equal(o.capacidad, 20);       // lunes queda en 0, no en -2 (12 bloqueados − 10 disponibles)
  const sinBloqueo = ocupacionTerapeuta(th(), [], SEMANA, [], HOY);
  assert.equal(sinBloqueo.capacidad - o.capacidad, 10);
});

test('ocupación — un bloqueo parcial resta solo los slots que pisaba', () => {
  const bloqueo = [{ id: 'b1', therapistId: 't1', date: LUN, startH: 9, endH: 11 }];  // 4 slots
  const o = ocupacionTerapeuta(th(), [], SEMANA, bloqueo, HOY);
  assert.equal(o.capacidad, 26);       // 30 − 4
});

test('ocupación — sin terapeuta devuelve ceros y pct null (no revienta)', () => {
  const o = ocupacionTerapeuta(null, [cita(LUN, 9, 60)], SEMANA, [], HOY);
  assert.deepEqual(o, { asistidas: 0, noas: 0, slotsUsados: 0, capacidad: 0, pct: null });
});
