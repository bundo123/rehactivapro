// Tests de HORAS EXACTAS — node --test.
// Las horas viven en memoria como decimales (10.75 = 10:45). Acá se cubren las tres piezas puras:
// formato (fmtTime), ubicación en la grilla de media hora (slotOf/apptSlots) y solape real
// (apptsOverlap/findConflict), con foco en horas NO alineadas a :00/:30 y en los bordes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtTime, slotOf, isAlignedHour, apptRange, apptSlots, apptsOverlap, findConflict,
  toTimeInput, parseTimeInput,
} from '../js/utils.js';

const cita = (hour, duration = 60, extra = {}) => ({ hour, duration, ...extra });

// ── fmtTime ───────────────────────────────────────────────────────────────────
test('fmtTime — conserva el formato de siempre en :00 y :30', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(7), '7:00');
  assert.equal(fmtTime(9.5), '9:30');
  assert.equal(fmtTime(13), '13:00');
  assert.equal(fmtTime(20.5), '20:30');
});

test('fmtTime — cualquier minuto, no solo :00/:30', () => {
  assert.equal(fmtTime(9.75), '9:45');
  assert.equal(fmtTime(10.25), '10:15');
  assert.equal(fmtTime(7.1), '7:06');
  assert.equal(fmtTime(23 + 59 / 60), '23:59');
});

test('fmtTime — minutos de 5 en 5 (step del input) vuelven exactos pese al decimal periódico', () => {
  // 10:05 = 10.08333…; sin redondear al minuto saldría '10:04'.
  for (let m = 0; m < 60; m += 5) {
    assert.equal(fmtTime(10 + m / 60), `10:${String(m).padStart(2, '0')}`);
  }
});

test('fmtTime — tolera nulo/NaN sin romper el render', () => {
  assert.equal(fmtTime(null), '0:00');
  assert.equal(fmtTime(undefined), '0:00');
  assert.equal(fmtTime(NaN), '0:00');
});

test('toTimeInput / parseTimeInput — ida y vuelta con el <input type="time">', () => {
  assert.equal(toTimeInput(9.75), '09:45');   // el input exige HH:MM con cero a la izquierda
  assert.equal(toTimeInput(7), '07:00');
  assert.equal(parseTimeInput('10:45'), 10.75);
  assert.equal(parseTimeInput('07:00'), 7);
  assert.equal(fmtTime(parseTimeInput('10:05')), '10:05');
  // Inválidos → null (saveAppt lo convierte en "Selecciona una hora válida")
  assert.equal(parseTimeInput(''), null);
  assert.equal(parseTimeInput('nada'), null);
  assert.equal(parseTimeInput('25:00'), null);
  assert.equal(parseTimeInput('10:75'), null);
});

// ── Ubicación en la grilla ────────────────────────────────────────────────────
test('slotOf / isAlignedHour — media hora contenedora', () => {
  assert.equal(slotOf(10), 10);
  assert.equal(slotOf(10.5), 10.5);
  assert.equal(slotOf(10.75), 10.5);   // 10:45 se dibuja en la fila de 10:30
  assert.equal(slotOf(10.25), 10);
  assert.equal(slotOf(11.99), 11.5);
  assert.equal(isAlignedHour(10), true);
  assert.equal(isAlignedHour(10.5), true);
  assert.equal(isAlignedHour(10.75), false);
  assert.equal(isAlignedHour(parseTimeInput('10:05')), false);
});

test('apptSlots — citas alineadas: mismo resultado de siempre', () => {
  assert.deepEqual(apptSlots(cita(10, 30)), [10]);
  assert.deepEqual(apptSlots(cita(10, 60)), [10, 10.5]);
  assert.deepEqual(apptSlots(cita(10, 90)), [10, 10.5, 11]);
  assert.deepEqual(apptSlots(cita(10.5, 60)), [10.5, 11]);
});

test('apptSlots — cita no alineada ocupa desde su slot contenedor hasta el del fin', () => {
  // 10:45–11:45 pisa las filas 10:30, 11:00 y 11:30
  assert.deepEqual(apptSlots(cita(10.75, 60)), [10.5, 11, 11.5]);
  // 10:45–11:15 pisa 10:30 y 11:00
  assert.deepEqual(apptSlots(cita(10.75, 30)), [10.5, 11]);
  // 10:15–11:45 pisa 10:00, 10:30, 11:00 y 11:30
  assert.deepEqual(apptSlots(cita(10.25, 90)), [10, 10.5, 11, 11.5]);
});

test('apptSlots — fin justo en el borde del slot no agrega una fila de más', () => {
  // 10:30–11:00 termina exactamente donde arranca la fila 11:00: no la ocupa.
  assert.deepEqual(apptSlots(cita(10.5, 30)), [10.5]);
  assert.deepEqual(apptSlots(cita(9, 120)), [9, 9.5, 10, 10.5]);
});

test('apptSlots — duración ausente o cero: al menos el slot contenedor', () => {
  assert.deepEqual(apptSlots({ hour: 10.75 }), [10.5, 11, 11.5]);   // default 60 min
  assert.deepEqual(apptSlots({ hour: 10.75, duration: 0 }), [10.5, 11, 11.5]);
  assert.deepEqual(apptSlots({ hour: 8, duration: 1 }), [8]);        // 1 min: solo su slot
});

test('apptRange — intervalo real en horas decimales', () => {
  assert.deepEqual(apptRange(cita(10.75, 60)), { start: 10.75, end: 11.75 });
  assert.deepEqual(apptRange(cita(9, 30)), { start: 9, end: 9.5 });
});

// ── Solapes ───────────────────────────────────────────────────────────────────
test('apptsOverlap — el caso que motivó la feature: 10:45–11:45 choca con 11:00', () => {
  assert.equal(apptsOverlap(cita(10.75, 60), cita(11, 60)), true);
  assert.equal(apptsOverlap(cita(11, 60), cita(10.75, 60)), true);   // simétrico
});

test('apptsOverlap — bordes: tocarse NO es solapar', () => {
  assert.equal(apptsOverlap(cita(10, 60), cita(11, 60)), false);       // 10:00–11:00 vs 11:00–12:00
  assert.equal(apptsOverlap(cita(10.75, 30), cita(11.25, 60)), false); // 10:45–11:15 vs 11:15–12:15
  assert.equal(apptsOverlap(cita(9, 30), cita(9.5, 30)), false);       // 9:00–9:30 vs 9:30–10:00
});

test('apptsOverlap — un minuto de invasión ya es conflicto', () => {
  const unMin = 1 / 60;
  assert.equal(apptsOverlap(cita(10, 60), cita(11 - unMin, 30)), true);
  assert.equal(apptsOverlap(cita(10, 60), cita(11 + unMin, 30)), false);
});

test('apptsOverlap — contención total y arranque idéntico', () => {
  assert.equal(apptsOverlap(cita(10, 90), cita(10.75, 30)), true);   // 10:45–11:15 dentro de 10:00–11:30
  assert.equal(apptsOverlap(cita(10.75, 60), cita(10.75, 30)), true);
});

test('apptsOverlap — el slot de media hora NO alcanza como criterio (regresión)', () => {
  // Comparten la fila 10:30 pero no se pisan: el criterio viejo (intersección de slots) las
  // habría dado por conflictivas.
  assert.equal(apptsOverlap(cita(10.5, 15), cita(10.75, 15)), false);
});

// ── findConflict (lo que usa la agenda) ──────────────────────────────────────
const AGENDA = [
  { id: 'a1', date: '2026-08-10', therapistId: 't1', hour: 11,    duration: 60 },
  { id: 'a2', date: '2026-08-10', therapistId: 't2', hour: 11,    duration: 60 },
  { id: 'a3', date: '2026-08-11', therapistId: 't1', hour: 10.75, duration: 60 },
];

test('findConflict — mismo terapeuta y día: 10:45–11:45 choca con la de 11:00', () => {
  const c = findConflict(AGENDA, { date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 60 });
  assert.equal(c?.id, 'a1');
});

test('findConflict — otro terapeuta u otro día no chocan', () => {
  assert.equal(findConflict(AGENDA, { date: '2026-08-10', therapistId: 't3', hour: 10.75, duration: 60 }), null);
  assert.equal(findConflict(AGENDA, { date: '2026-08-12', therapistId: 't1', hour: 10.75, duration: 60 }), null);
});

test('findConflict — hueco exacto entre dos citas: 10:00–11:00 contra una de 11:00', () => {
  assert.equal(findConflict(AGENDA, { date: '2026-08-10', therapistId: 't1', hour: 10, duration: 60 }), null);
});

test('findConflict — editar la misma cita no choca consigo misma (excludeId, id numérico o string)', () => {
  const lista = [{ id: 42, date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 60 }];
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 90 }, '42'), null);
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 90 }, 42), null);
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 90 }, null)?.id, 42);
});

test('findConflict — therapistId numérico vs string (datos optimistas)', () => {
  const lista = [{ id: 'x', date: '2026-08-10', therapistId: 7, hour: 11, duration: 60 }];
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: '7', hour: 10.75, duration: 60 })?.id, 'x');
});

test('findConflict — lista vacía o nula', () => {
  assert.equal(findConflict([], { date: '2026-08-10', therapistId: 't1', hour: 10, duration: 60 }), null);
  assert.equal(findConflict(null, { date: '2026-08-10', therapistId: 't1', hour: 10, duration: 60 }), null);
});
