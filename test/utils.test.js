// Tests de la FUENTE ÚNICA de sesiones (doneActual / pendientesActual) — node --test.
// Lógica pura derivada de session_log; frontera del episodio = último 'Fin de episodio'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doneActual, doneEnLog, pendientesActual, lastFinDate } from '../js/utils.js';

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

// ── R-2: informe de un EPISODIO PASADO ──
// El selector de episodio recorta el log entre dos marcadores 'Fin de episodio' y de ese tramo
// sale el "X de Y · %" del PDF que se manda al médico. Antes se contaba `status==='asistió'`
// a secas, así que la Evaluación inicial sumaba una sesión de más ("11 de 10 · 110%").

// Mismo recorte que renderPatientReport() para un episodio pasado: filas entre el fin anterior
// (excluido) y el fin del episodio (incluido), sin los marcadores 'Fin de episodio'.
const tramoEpisodio = (log, finStart, finEnd) => log.filter(s => {
  if (s.type === 'Fin de episodio') return false;
  if (finStart && s.date <= finStart) return false;
  if (finEnd && s.date > finEnd) return false;
  return true;
});

test('doneEnLog — episodio pasado con eval inicial + N sesiones cuenta N, no N+1 (R-2)', () => {
  const log = [
    evalInicial('2026-01-02'),                                  // no es sesión de tratamiento
    ses('2026-01-05'), ses('2026-01-07'), ses('2026-01-09'),     // N = 3 asistidas
    ses('2026-01-12', 'falta'),                                 // no asistió → no cuenta
    finEpisodio('2026-01-15'),
    evalInicial('2026-02-01'), ses('2026-02-05'),                // episodio siguiente: fuera del tramo
  ];
  const tramo = tramoEpisodio(log, null, '2026-01-15');
  assert.equal(doneEnLog(tramo), 3);
  // Un plan de 3 sesiones cierra en 100%, no en 133%.
  assert.equal(Math.round(doneEnLog(tramo) / 3 * 100), 100);
});

test('doneEnLog — tramo intermedio: no arrastra la eval ni las sesiones de otros episodios (R-2)', () => {
  const log = [
    evalInicial('2026-01-02'), ses('2026-01-05'),
    finEpisodio('2026-01-15'),
    evalInicial('2026-02-01'),                                  // eval del 2.º episodio
    ses('2026-02-05'), ses('2026-02-07'),                       // N = 2
    finEpisodio('2026-02-20'),
    ses('2026-03-01'),                                          // episodio actual
  ];
  assert.equal(doneEnLog(tramoEpisodio(log, '2026-01-15', '2026-02-20')), 2);
  assert.equal(doneActual({ log }), 1);                         // el actual sigue intacto
});

test('doneEnLog — sesión con la fecha del corte queda en el episodio que cierra', () => {
  const log = [ses('2026-01-05'), ses('2026-01-15'), finEpisodio('2026-01-15'), ses('2026-01-20')];
  assert.equal(doneEnLog(tramoEpisodio(log, null, '2026-01-15')), 2);
  assert.equal(doneActual({ log }), 1);   // misma frontera estricta (date > lastFin) que P-2
});

test('doneEnLog — log vacío o nulo devuelve 0', () => {
  assert.equal(doneEnLog([]), 0);
  assert.equal(doneEnLog(null), 0);
  assert.equal(doneEnLog(undefined), 0);
});
