// Tests de billingInfo — "Cobro X de Y", numeración episodio-aware (cubre I-4) — node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingInfo, doneActual, pendientesActual } from '../js/utils.js';

const ses = (date) => ({ date, type: 'Fisioterapia', status: 'asistió' });
const finEpisodio = (date) => ({ date, type: 'Fin de episodio', status: 'asistió' });

// Reproduce la etiqueta que pinta la UI (facturacion.js renderListoRow):
//   esCierre ? "✓ Cobro final" : `Cobro {cobrosRealizados+1} de {totalCobros}`
const etiquetaCobro = (info) =>
  info.esCierre ? '✓ Cobro final' : `Cobro ${info.cobrosRealizados + 1} de ${info.totalCobros}`;

test('billingInfo — primer episodio, sin cobros previos → "Cobro 1 de 2"', () => {
  const p = {
    sessions: 10,
    log: ['2026-01-05','2026-01-07','2026-01-09','2026-01-12','2026-01-14'].map(ses), // 5 asistidas
    billing: { facturas: [] },
  };
  assert.equal(doneActual(p), 5);
  assert.equal(pendientesActual(p), 5);
  const info = billingInfo(p, 5);
  assert.equal(info.cobrosRealizados, 0);
  assert.equal(info.totalCobros, 2);
  assert.equal(info.sesPend, 5);
  assert.equal(etiquetaCobro(info), 'Cobro 1 de 2');
});

test('billingInfo — segundo cobro del mismo episodio → "Cobro 2 de 2"', () => {
  const p = {
    sessions: 10,
    log: ['2026-01-05','2026-01-07','2026-01-09','2026-01-12','2026-01-14',
          '2026-01-16','2026-01-18','2026-01-20','2026-01-22','2026-01-24'].map(ses), // 10 asistidas
    billing: { facturas: [{ n: 5, fecha: '2026-01-15' }] }, // ya se cobró 1 tanda
  };
  assert.equal(doneActual(p), 10);
  assert.equal(pendientesActual(p), 5);
  const info = billingInfo(p, 5);
  assert.equal(info.cobrosRealizados, 1);
  assert.equal(etiquetaCobro(info), 'Cobro 2 de 2');
});

test('billingInfo — tras NUEVO episodio la numeración reinicia → "Cobro 1 de 2" (I-4)', () => {
  const p = {
    sessions: 10, // sesiones prescritas del episodio NUEVO
    log: [
      ses('2026-01-05'), ses('2026-01-07'),            // episodio viejo
      finEpisodio('2026-02-01'),                        // corte
      ses('2026-02-05'), ses('2026-02-07'), ses('2026-02-09'),
      ses('2026-02-11'), ses('2026-02-13'),            // 5 asistidas del episodio nuevo
    ],
    billing: { facturas: [{ n: 5, fecha: '2026-01-10' }] }, // cobro del episodio VIEJO
  };
  assert.equal(doneActual(p), 5);
  assert.equal(pendientesActual(p), 5);
  const info = billingInfo(p, 5);
  // El cobro viejo (fecha < fin) NO cuenta para el episodio actual:
  assert.equal(info.cobrosRealizados, 0);
  assert.equal(info.sesYaCobradas, 0);
  assert.equal(info.totalCobros, 2);
  assert.equal(etiquetaCobro(info), 'Cobro 1 de 2'); // <- NO "Cobro 2 de 2"
});

test('billingInfo — cobro de cierre (último parcial) → "✓ Cobro final"', () => {
  const p = {
    sessions: 12,
    log: Array.from({ length: 12 }, (_, i) =>
      ses(`2026-03-${String(i + 1).padStart(2, '0')}`)), // 12 asistidas
    billing: { facturas: [
      { n: 5, fecha: '2026-03-06' },
      { n: 5, fecha: '2026-03-11' },
    ]}, // 10 cobradas; quedan 2 (parcial < spf)
  };
  assert.equal(doneActual(p), 12);
  assert.equal(pendientesActual(p), 2);
  const info = billingInfo(p, 5);
  assert.equal(info.cobrosRealizados, 2);
  assert.equal(info.totalCobros, 3);
  assert.equal(info.esCierre, true);
  assert.equal(etiquetaCobro(info), '✓ Cobro final');
});
