// Tests de TURNO Y FUERA DE TURNO — node --test.
// El turno del terapeuta es start_h/end_h y NADA MÁS: la jornada que se ve en la cabecera de su
// columna, en la lista de Terapeutas y en su modal. work_start/work_end quedó dormido en la base y
// no participa. Con el turno se decide qué se pinta distinto en la agenda: la CITA CONFIRMADA que
// asoma fuera del turno y la FRANJA vacía fuera del turno. Es criterio de color: nada acá bloquea,
// valida ni impide agendar. Piezas puras, sin DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnoDe, esExtra, slotFueraDeTurno } from '../js/utils.js';

const cita = (hour, duration = 60) => ({ hour, duration });

// ── turnoDe ───────────────────────────────────────────────────────────────────
test('turnoDe — el turno es start_h/end_h', () => {
  assert.deepEqual(turnoDe({ startH: 7, endH: 20 }), { ws: 7, we: 20 });
  assert.deepEqual(turnoDe({ startH: 8, endH: 17 }), { ws: 8, we: 17 });
  assert.deepEqual(turnoDe({ workStart: null, workEnd: null, startH: 7, endH: 20 }), { ws: 7, we: 20 });
});

// El punto del lote TURNO-1b: la fila que TIENE work_start/work_end cargado se comporta igual que
// la que no. Ese par ya no se puede editar desde la app, así que si mandara, el color obedecería a
// un dato invisible e incorregible.
test('turnoDe — IGNORA work_start/work_end aunque estén cargados', () => {
  assert.deepEqual(turnoDe({ workStart: 9, workEnd: 18, startH: 7, endH: 20 }), { ws: 7, we: 20 });
  assert.deepEqual(turnoDe({ workStart: 9, workEnd: null, startH: 7, endH: 20 }), { ws: 7, we: 20 });
  assert.deepEqual(turnoDe({ workStart: null, workEnd: 16, startH: 7, endH: 20 }), { ws: 7, we: 20 });
  assert.equal(turnoDe({ workStart: 9, workEnd: 18 }), null);   // sin start_h/end_h no hay turno
});

test('turnoDe — sin turno afirmable devuelve null', () => {
  assert.equal(turnoDe(null), null);
  assert.equal(turnoDe(undefined), null);
  assert.equal(turnoDe({}), null);                                  // ficha sin ninguna hora
  assert.equal(turnoDe({ startH: 8, endH: 8 }), null);              // we === ws
  assert.equal(turnoDe({ startH: 18, endH: 9 }), null);             // we < ws, dato corrupto
  assert.equal(turnoDe({ startH: '8', endH: '17' }), null);         // texto, no decimales
});

// ── esExtra ───────────────────────────────────────────────────────────────────
const th = { startH: 8, endH: 17 };   // turno 8:00–17:00

test('esExtra — cita entera dentro del turno: no es extra', () => {
  assert.equal(esExtra(cita(10), th), false);
  assert.equal(esExtra(cita(8.5, 30), th), false);
  assert.equal(esExtra(cita(14, 90), th), false);
});

test('esExtra — empieza antes de ws: extra aunque termine dentro', () => {
  assert.equal(esExtra(cita(7), th), true);
  assert.equal(esExtra(cita(7.5, 60), th), true);   // 7:30–8:30
});

test('esExtra — termina después de we: extra aunque empiece dentro', () => {
  assert.equal(esExtra(cita(16.5, 60), th), true);    // 16:30–17:30
  assert.equal(esExtra(cita(16.75, 30), th), true);   // 16:45–17:15
  assert.equal(esExtra(cita(16.75, 60), th), true);   // 16:45–17:45
  assert.equal(esExtra(cita(18), th), true);          // arranca con el turno ya cerrado
});

test('esExtra — el borde exacto es estar dentro: [ws, we] cerrado para la cita', () => {
  assert.equal(esExtra(cita(8, 60), th), false);        // empieza justo en ws
  assert.equal(esExtra(cita(16, 60), th), false);       // termina justo en we
  assert.equal(esExtra(cita(16.5, 30), th), false);     // 16:30–17:00, pega el final
  assert.equal(esExtra(cita(8, 9 * 60), th), false);    // el turno entero, 8:00–17:00
});

test('esExtra — sin duration se asume media hora, como en el resto de la agenda', () => {
  assert.equal(esExtra({ hour: 16.5 }, th), false);   // 16:30–17:00
  assert.equal(esExtra({ hour: 16.75 }, th), true);   // 16:45–17:15
});

test('esExtra — terapeuta sin horas o cita nula: false, no se afirma nada', () => {
  assert.equal(esExtra(cita(22), {}), false);
  assert.equal(esExtra(cita(22), { workStart: 8, workEnd: 17 }), false);   // solo el par dormido
  assert.equal(esExtra(cita(22), { workStart: null, workEnd: null }), false);
  assert.equal(esExtra(cita(22), null), false);
  assert.equal(esExtra(null, th), false);
  assert.equal(esExtra(undefined, th), false);
});

// El ALMUERZO es duración (lunch_minutes), no posición: no hay hora contra la cual comparar, así
// que la cita del mediodía es tan de turno como cualquier otra.
test('esExtra — el almuerzo no vuelve extra a la cita del mediodía', () => {
  assert.equal(esExtra(cita(12, 60), { startH: 8, endH: 17, lunchMinutes: 60 }), false);
});

// ── Casos reales de la clínica ────────────────────────────────────────────────
test('esExtra — Karina Obando 7–10: una cita a las 11:00 es fuera de turno', () => {
  const karina = { name: 'Karina Obando', startH: 7, endH: 10 };
  assert.equal(esExtra(cita(11), karina), true);
  assert.equal(esExtra(cita(9, 60), karina), false);   // 9:00–10:00, justo hasta el final
});

test('esExtra — Giovanni Berdejo 7–20: una cita a las 18:00 NO es fuera de turno', () => {
  const giovanni = { name: 'Giovanni Berdejo', startH: 7, endH: 20 };
  assert.equal(esExtra(cita(18), giovanni), false);
  assert.equal(esExtra(cita(19.5, 60), giovanni), true);   // 19:30–20:30, se pasa media hora
});

// ── slotFueraDeTurno ──────────────────────────────────────────────────────────
// La franja es [ws, we): la que EMPIEZA en we ya es de después del turno.
test('slotFueraDeTurno — antes de ws está fuera', () => {
  assert.equal(slotFueraDeTurno(7.5, th), true);
  assert.equal(slotFueraDeTurno(0, th), true);
});

test('slotFueraDeTurno — la franja que empieza en ws está dentro', () => {
  assert.equal(slotFueraDeTurno(8, th), false);
  assert.equal(slotFueraDeTurno(16.5, th), false);   // última media hora del turno
});

test('slotFueraDeTurno — la franja que empieza en we ya está fuera', () => {
  assert.equal(slotFueraDeTurno(17, th), true);
  assert.equal(slotFueraDeTurno(20, th), true);
});

test('slotFueraDeTurno — sin turno afirmable o sin hora válida: false', () => {
  assert.equal(slotFueraDeTurno(22, {}), false);
  assert.equal(slotFueraDeTurno(22, null), false);
  assert.equal(slotFueraDeTurno(null, th), false);
  assert.equal(slotFueraDeTurno(undefined, th), false);
});
