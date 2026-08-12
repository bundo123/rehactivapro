// Tests de "slot liberado por no-asistió" — node --test.
// Una cita marcada 'no asistió' deja de OCUPAR la franja a efectos de agendamiento (se puede
// crear o mover otra cita encima), pero no se pierde: sigue en la lista y la cuentan igual
// resumen, informes, continuidad y facturación. Acá se cubren las dos piezas puras: el bloqueo
// (bloqueaSlot/findConflict) y el reparto visual de la franja (compactNoas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloqueaSlot, findConflict, compactNoas, occupiedSlots } from '../js/utils.js';

const cita = (id, hour, status, extra = {}) =>
  ({ id, date: '2026-08-10', therapistId: 't1', hour, duration: 60, status, ...extra });

// ── bloqueaSlot ───────────────────────────────────────────────────────────────
test('bloqueaSlot — solo la no-asistió libera la franja', () => {
  assert.equal(bloqueaSlot({ status: 'conf' }), true);
  assert.equal(bloqueaSlot({ status: 'pend' }), true);
  assert.equal(bloqueaSlot({ status: 'noas' }), false);
});

test('bloqueaSlot — sin status (datos viejos) la cita SIGUE bloqueando', () => {
  assert.equal(bloqueaSlot({}), true);
  assert.equal(bloqueaSlot(null), true);
});

// ── findConflict con no-asistió ───────────────────────────────────────────────
test('findConflict — se puede crear encima de una no-asistió', () => {
  const lista = [cita('n1', 9, 'noas')];
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: 't1', hour: 9, duration: 60 }), null);
});

test('findConflict — una cita ACTIVA sigue chocando igual que hoy', () => {
  assert.equal(findConflict([cita('a1', 9, 'conf')], { date: '2026-08-10', therapistId: 't1', hour: 9, duration: 60 })?.id, 'a1');
  assert.equal(findConflict([cita('a2', 9, 'pend')], { date: '2026-08-10', therapistId: 't1', hour: 9, duration: 60 })?.id, 'a2');
});

test('findConflict — hora exacta parcialmente solapada con una no-asistió pasa', () => {
  // 10:45–11:45 pisa a la no-asistió de 10:00–11:00: con una activa sería conflicto, acá no.
  const lista = [cita('n1', 10, 'noas')];
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 60 }), null);
  assert.equal(findConflict([cita('a1', 10, 'conf')], { date: '2026-08-10', therapistId: 't1', hour: 10.75, duration: 60 })?.id, 'a1');
});

test('findConflict — la no-asistió no tapa a una activa que también solapa', () => {
  // La no-asistió está primera en la lista: si no se saltara, sería la que devuelve el find.
  const lista = [cita('n1', 9, 'noas'), cita('a1', 9, 'conf')];
  assert.equal(findConflict(lista, { date: '2026-08-10', therapistId: 't1', hour: 9, duration: 60 })?.id, 'a1');
});

test('findConflict — caso real: no-asistió 9:00 + nueva 9:00 del mismo terapeuta conviven', () => {
  const agenda = [cita('n1', 9, 'noas', { patientId: 'p1' })];
  const nueva = { date: '2026-08-10', therapistId: 't1', hour: 9, duration: 60 };
  assert.equal(findConflict(agenda, nueva), null);
  agenda.push(cita('a1', 9, 'conf', { patientId: 'p2' }));   // lo que hace saveAppt
  // Ambas persisten; y la franja ya no admite una TERCERA porque la activa sí bloquea.
  assert.equal(agenda.length, 2);
  assert.equal(findConflict(agenda, nueva)?.id, 'a1');
});

test('findConflict — mover una cita sobre una no-asistió (drag & drop) está permitido', () => {
  const agenda = [cita('n1', 11, 'noas'), cita('a1', 9, 'conf')];
  // Se arrastra a1 desde las 9:00 hasta las 11:00, donde solo hay una no-asistió.
  assert.equal(findConflict(agenda, { date: '2026-08-10', therapistId: 't1', hour: 11, duration: 60 }, 'a1'), null);
});

// ── compactNoas (reparto visual de la franja) ─────────────────────────────────
test('compactNoas — una no-asistió sola se sigue viendo como tarjeta completa', () => {
  const n1 = cita('n1', 9, 'noas');
  assert.equal(compactNoas([n1]).size, 0);
});

test('compactNoas — no-asistió + activa en la misma franja: se compacta la no-asistió', () => {
  const n1 = cita('n1', 9, 'noas'), a1 = cita('a1', 9, 'conf');
  const set = compactNoas([n1, a1]);
  assert.equal(set.has(n1), true);
  assert.equal(set.has(a1), false);   // la activa nunca cede el espacio
});

test('compactNoas — la activa puede arrancar en OTRA franja y solapar igual', () => {
  // no-asistió 9:00–10:00 (filas 9:00 y 9:30) y activa 9:30: se solapan.
  const n1 = cita('n1', 9, 'noas'), a1 = cita('a1', 9.5, 'conf');
  assert.equal(compactNoas([n1, a1]).has(n1), true);
});

test('compactNoas — tocarse en el borde NO compacta (9:00–10:00 y 10:00)', () => {
  const n1 = cita('n1', 9, 'noas'), a1 = cita('a1', 10, 'conf');
  assert.equal(compactNoas([n1, a1]).size, 0);
});

test('compactNoas — varias no-asistió en la misma franja apilan tiras', () => {
  const n1 = cita('n1', 9, 'noas'), n2 = cita('n2', 9, 'noas');
  const set = compactNoas([n1, n2]);
  assert.equal(set.has(n1), true);
  assert.equal(set.has(n2), true);
});

test('compactNoas — dos no-asistió solapadas en franjas distintas también se compactan', () => {
  // 9:00–10:00 y 9:30–10:30: sin compactar, las dos tarjetas se pisarían.
  const n1 = cita('n1', 9, 'noas'), n2 = cita('n2', 9.5, 'noas');
  assert.equal(compactNoas([n1, n2]).size, 2);
});

test('compactNoas — hora exacta: 9:45 comparte la fila de 9:30 aunque no solape', () => {
  // Ambas caen en la media hora contenedora 9:30 → una celda, dos citas: la no-asistió cede.
  const n1 = cita('n1', 9.75, 'noas', { duration: 15 });
  const a1 = cita('a1', 9.5, 'conf', { duration: 15 });
  assert.equal(compactNoas([n1, a1]).has(n1), true);
});

test('compactNoas — dos activas solapadas no se compactan (eso lo impide el conflicto)', () => {
  const a1 = cita('a1', 9, 'conf'), a2 = cita('a2', 9, 'pend');
  assert.equal(compactNoas([a1, a2]).size, 0);
});

test('compactNoas — lista vacía o nula', () => {
  assert.equal(compactNoas([]).size, 0);
  assert.equal(compactNoas(null).size, 0);
});

// ── occupiedSlots (el contador "slots libres" de la agenda) ───────────────────
test('occupiedSlots — una franja cuyo único ocupante es una no-asistió cuenta como LIBRE', () => {
  assert.equal(occupiedSlots([cita('n1', 9, 'noas')]), 0);
});

test('occupiedSlots — las activas ocupan todas sus medias horas', () => {
  assert.equal(occupiedSlots([cita('a1', 9, 'conf')]), 2);                          // 9:00–10:00
  assert.equal(occupiedSlots([cita('a1', 9, 'pend', { duration: 30 })]), 1);
  assert.equal(occupiedSlots([cita('a1', 10.75, 'conf')]), 3);                      // 10:45–11:45
});

test('occupiedSlots — mezcla: solo restan las activas', () => {
  const dia = [cita('n1', 9, 'noas'), cita('a1', 9, 'conf'), cita('n2', 11, 'noas'), cita('a2', 15, 'pend', { duration: 30 })];
  assert.equal(occupiedSlots(dia), 3);   // 2 de a1 + 1 de a2
});

test('occupiedSlots — sin status (datos viejos) la cita sigue ocupando', () => {
  assert.equal(occupiedSlots([{ hour: 9, duration: 60 }]), 2);
});

test('occupiedSlots — lista vacía o nula', () => {
  assert.equal(occupiedSlots([]), 0);
  assert.equal(occupiedSlots(null), 0);
});
