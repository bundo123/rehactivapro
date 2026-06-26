// Tests de la FUENTE ÚNICA de sesiones (doneActual / pendientesActual) — node --test.
// Lógica pura derivada de session_log; frontera del episodio = último 'Fin de episodio'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doneActual, pendientesActual, lastFinDate } from '../js/utils.js';

const ses = (date, status = 'asistió', type = 'Fisioterapia') => ({ date, type, status });
const evalInicial = (date) => ({ date, type: 'Evaluación inicial', status: 'asistió' });
const finEpisodio = (date) => ({ date, type: 'Fin de episodio', status: 'asistió' });

test('doneActual — sin episodio previo: cuenta asistidas y excluye eval inicial', () => {
  const p = { log: [
    evalInicial('2026-01-01'),
    ses('2026-01-05'),
    ses('2026-01-07'),
    ses('2026-01-09'),
    ses('2026-01-10', 'falta'), // no asistió → no cuenta
  ]};
  assert.equal(lastFinDate(p), null);
  assert.equal(doneActual(p), 3);
});

test('doneActual — con episodio: solo cuenta sesiones posteriores al "Fin de episodio"', () => {
  const p = { log: [
    evalInicial('2026-01-01'),
    ses('2026-01-05'),
    ses('2026-01-07'),
    ses('2026-01-09'),
    finEpisodio('2026-01-15'),
    ses('2026-01-20'),
    ses('2026-01-22'),
  ]};
  assert.equal(lastFinDate(p), '2026-01-15');
  assert.equal(doneActual(p), 2); // se resetea: solo las dos del episodio nuevo
});

test('doneActual — sesión registrada el MISMO día del corte queda en el episodio anterior', () => {
  // El marcador 'Fin de episodio' usa la fecha del corte; doneActual del episodio actual usa
  // date > lastFin (estricto), así que una sesión con la MISMA fecha del corte NO cuenta como nueva.
  const p = { log: [
    ses('2026-01-10'),
    finEpisodio('2026-01-15'),
    ses('2026-01-15'),  // mismo día del corte → episodio anterior, no cuenta
    ses('2026-01-20'),  // episodio nuevo → cuenta
  ]};
  assert.equal(doneActual(p), 1);
});

test('pendientesActual — sin episodio: done menos cobradas', () => {
  const p = {
    log: [ses('2026-01-05'), ses('2026-01-07'), ses('2026-01-09')], // done = 3
    billing: { facturas: [{ n: 2, fecha: '2026-01-08' }] },          // 2 cobradas
  };
  assert.equal(doneActual(p), 3);
  assert.equal(pendientesActual(p), 1);
});

test('pendientesActual — cobros de un episodio anterior NO reducen el episodio actual (I-4)', () => {
  const p = {
    log: [
      ses('2026-01-05'), ses('2026-01-07'),
      finEpisodio('2026-02-01'),
      ses('2026-02-05'), ses('2026-02-07'), // done episodio actual = 2
    ],
    billing: { facturas: [{ n: 5, fecha: '2026-01-10' }] }, // cobro del episodio viejo
  };
  assert.equal(doneActual(p), 2);
  // La factura vieja (fecha < fin) no cuenta como cobrada del episodio actual.
  assert.equal(pendientesActual(p), 2);
});

test('pendientesActual — nunca negativo', () => {
  const p = {
    log: [ses('2026-01-05')],                                  // done = 1
    billing: { facturas: [{ n: 5, fecha: '2026-01-06' }] },    // sobre-cobrado
  };
  assert.equal(pendientesActual(p), 0);
});

test('pendientesActual — sin billing devuelve 0', () => {
  assert.equal(pendientesActual({ log: [ses('2026-01-05')] }), 0);
  assert.equal(pendientesActual(null), 0);
});
