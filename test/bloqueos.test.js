// Tests de bloqueos de terapeuta y de la capacidad real — node --test.
//
// Las dos reglas que se prueban acá, y que son la razón del lote:
//   · ALMUERZO = regla del terapeuta (lunch_minutes). Nadie lo marca; se descuenta siempre.
//   · BLOQUEO  = excepción registrada (vacaciones, curso, permiso). Se pinta, no se agenda y
//                también se descuenta.
// Y la fórmula de capacidad que reemplaza al viejo `therapistHours(th).length*5`: solo días
// hábiles TRANSCURRIDOS, menos almuerzo, menos bloqueos, nunca negativa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBlock, blockedSlots, capacidadSlots, lunchSlots, esDiaHabil, mapBlockRow } from '../js/utils.js';

// Semana de referencia: lun 2026-08-31 … vie 2026-09-04 (sáb 2026-09-05, dom 2026-08-30).
const LUN = '2026-08-31', MAR = '2026-09-01', MIE = '2026-09-02', JUE = '2026-09-03', VIE = '2026-09-04';
const SAB = '2026-09-05', DOM = '2026-08-30';
const SEMANA = [LUN, MAR, MIE, JUE, VIE];

// Turno 7:00–13:00 → 12 slots de 30'. Con 60 min de almuerzo quedan 10 por día.
const th = (over = {}) => ({ id: 't1', startH: 7, endH: 13, lunchMinutes: 60, ...over });
const blk = (over = {}) => ({ id: 'b1', therapistId: 't1', date: LUN, startH: 9, endH: 11, motivo: 'Curso', ...over });

// ── findBlock ────────────────────────────────────────────────────────────────
test('findBlock — la cita cae dentro del bloqueo: lo devuelve', () => {
  const b = blk();
  assert.equal(findBlock([b], { date: LUN, therapistId: 't1', hour: 9.5, duration: 60 }), b);
  // Solape parcial por el final: 8:30–9:30 muerde el arranque del bloqueo.
  assert.equal(findBlock([b], { date: LUN, therapistId: 't1', hour: 8.5, duration: 60 }), b);
});

test('findBlock — tocarse en el borde NO es solape', () => {
  const b = blk();   // 9:00–11:00
  // Termina justo a las 9:00.
  assert.equal(findBlock([b], { date: LUN, therapistId: 't1', hour: 8, duration: 60 }), null);
  // Empieza justo a las 11:00.
  assert.equal(findBlock([b], { date: LUN, therapistId: 't1', hour: 11, duration: 60 }), null);
});

test('findBlock — el bloqueo es de OTRO terapeuta: no aplica', () => {
  assert.equal(findBlock([blk()], { date: LUN, therapistId: 't2', hour: 9.5, duration: 60 }), null);
});

test('findBlock — el bloqueo es de OTRA fecha: no aplica', () => {
  assert.equal(findBlock([blk()], { date: MAR, therapistId: 't1', hour: 9.5, duration: 60 }), null);
  assert.equal(findBlock([], { date: LUN, therapistId: 't1', hour: 9.5, duration: 60 }), null);
  assert.equal(findBlock(null, { date: LUN, therapistId: 't1', hour: 9.5, duration: 60 }), null);
});

test('findBlock — el id se compara como string (los optimistas son números)', () => {
  const b = blk({ therapistId: 5 });
  assert.equal(findBlock([b], { date: LUN, therapistId: '5', hour: 9.5, duration: 60 }), b);
});

// ── blockedSlots ─────────────────────────────────────────────────────────────
test('blockedSlots — bloqueo parcial: solo los sub-slots que pisa', () => {
  // 9:00–11:00 = 4 medias horas.
  assert.equal(blockedSlots(th(), LUN, [blk()]), 4);
  // Otro día del mismo terapeuta no resta nada.
  assert.equal(blockedSlots(th(), MAR, [blk()]), 0);
});

test('blockedSlots — día completo: el turno entero', () => {
  assert.equal(blockedSlots(th(), LUN, [blk({ startH: 7, endH: 13, motivo: 'Vacaciones' })]), 12);
});

test('blockedSlots — dos bloqueos SOLAPADOS no restan dos veces la misma media hora', () => {
  const bs = [
    blk({ id: 'b1', startH: 9, endH: 11 }),
    blk({ id: 'b2', startH: 10, endH: 12 }),
  ];
  // Unión 9:00–12:00 = 6 slots, no 4+4=8.
  assert.equal(blockedSlots(th(), LUN, bs), 6);
});

test('blockedSlots — lo que se sale del turno no cuenta', () => {
  // 6:00–8:00 pero el turno arranca 7:00 → solo 7:00 y 7:30.
  assert.equal(blockedSlots(th(), LUN, [blk({ startH: 6, endH: 8 })]), 2);
});

// ── lunchSlots / esDiaHabil ──────────────────────────────────────────────────
test('lunchSlots — minutos → slots de 30, con 60 por defecto', () => {
  assert.equal(lunchSlots(th()), 2);
  assert.equal(lunchSlots(th({ lunchMinutes: 0 })), 0);
  assert.equal(lunchSlots(th({ lunchMinutes: 30 })), 1);
  assert.equal(lunchSlots(th({ lunchMinutes: 45 })), 2);   // se redondea al slot
  assert.equal(lunchSlots(th({ lunchMinutes: 90 })), 3);
  assert.equal(lunchSlots({ id: 't1' }), 2);               // sin la columna: 60 min
});

test('esDiaHabil — lun–vie sí, sábado y domingo no', () => {
  SEMANA.forEach(d => assert.equal(esDiaHabil(d), true, d));
  assert.equal(esDiaHabil(SAB), false);
  assert.equal(esDiaHabil(DOM), false);
});

// ── capacidadSlots ───────────────────────────────────────────────────────────
test('capacidadSlots — el almuerzo de 60 min descuenta 2 slots por día', () => {
  // Semana cerrada (hoy = sábado): 5 días × (12 − 2) = 50.
  assert.equal(capacidadSlots(th(), SEMANA, [], SAB), 50);
  // Sin almuerzo: 5 × 12 = 60, el viejo `turno*5`.
  assert.equal(capacidadSlots(th({ lunchMinutes: 0 }), SEMANA, [], SAB), 60);
});

test('capacidadSlots — sábado y domingo NO suman capacidad', () => {
  assert.equal(capacidadSlots(th(), [SAB, DOM], [], '2026-09-30'), 0);
  assert.equal(capacidadSlots(th(), [...SEMANA, SAB, DOM], [], SAB), 50);
});

test('capacidadSlots — los días FUTUROS no entran (denominador hasta hoy)', () => {
  // Miércoles: solo lun, mar y mié han ocurrido → 3 × 10 = 30, no 50.
  assert.equal(capacidadSlots(th(), SEMANA, [], MIE), 30);
  // El día de hoy SÍ cuenta (es el que se está atendiendo).
  assert.equal(capacidadSlots(th(), [LUN], [], LUN), 10);
  // Antes de que empiece la semana, cero.
  assert.equal(capacidadSlots(th(), SEMANA, [], '2026-08-28'), 0);
});

test('capacidadSlots — un bloqueo de día completo deja ese día en 0', () => {
  const bs = [blk({ startH: 7, endH: 13, date: MAR, motivo: 'Vacaciones' })];
  // Martes en 0; los otros cuatro días siguen dando 10.
  assert.equal(capacidadSlots(th(), SEMANA, bs, SAB), 40);
});

test('capacidadSlots — un bloqueo parcial descuenta solo lo suyo', () => {
  assert.equal(capacidadSlots(th(), SEMANA, [blk()], SAB), 46);   // 50 − 4
});

test('capacidadSlots — nunca negativa: almuerzo + bloqueo mayores que el turno dan 0', () => {
  const gordo = th({ lunchMinutes: 180 });                       // 6 slots de almuerzo
  const bs = [blk({ startH: 7, endH: 13 })];                     // y el día entero bloqueado
  assert.equal(capacidadSlots(gordo, [LUN], bs, SAB), 0);
  // El día en 0 no le resta a los otros: martes intacto (12 − 6 = 6).
  assert.equal(capacidadSlots(gordo, [LUN, MAR], bs, SAB), 6);
});

test('capacidadSlots — defensiva: sin terapeuta o sin fechas, 0', () => {
  assert.equal(capacidadSlots(null, SEMANA, [], SAB), 0);
  assert.equal(capacidadSlots(th(), [], [], SAB), 0);
  assert.equal(capacidadSlots(th(), null, [], SAB), 0);
});

test('capacidadSlots — acepta Date además de string en `hoy`', () => {
  assert.equal(capacidadSlots(th(), SEMANA, [], new Date(2026, 8, 2)), 30);   // mié 2026-09-02
});

// ── mapBlockRow ──────────────────────────────────────────────────────────────
test('mapBlockRow — fila de DB → bloqueo en memoria', () => {
  assert.deepEqual(mapBlockRow({
    id: 'uuid-1', therapist_id: 'th-9', date: LUN, start_h: 9, end_h: 11, motivo: 'Curso',
  }), { id: 'uuid-1', therapistId: 'th-9', date: LUN, startH: 9, endH: 11, motivo: 'Curso' });
});

test('mapBlockRow — numeric que llega como string se normaliza a number; motivo nulo → vacío', () => {
  const b = mapBlockRow({ id: 'u2', therapist_id: 't1', date: LUN, start_h: '9.5', end_h: '11.5', motivo: null });
  assert.equal(b.startH, 9.5);
  assert.equal(b.endH, 11.5);
  assert.equal(b.motivo, '');
  // Y el objeto mapeado sirve tal cual para findBlock/blockedSlots.
  assert.equal(blockedSlots(th(), LUN, [b]), 4);
});
