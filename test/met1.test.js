// Tests de MET-1: métricas honestas en el informe del paciente — node --test.
//  · citasDeEpisodio (historial-calc.js): las citas del episodio elegido, misma frontera que
//    logDeEpisodio. De ahí sale la continuidad REAL (resumenCitas(hastaHoy(...)).continuidad), que
//    antes era asistió/filas de session_log = 100 % por construcción.
//  · leerEva (utils.js): '—' = sin medir → null; el 0 es un valor.
//  · dolorInicial (utils.js): UNA regla para pantalla, PDF, Word y gráficos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citasDeEpisodio as _citasDeEpisodio } from '../js/historial-calc.js';
import { resumenCitas, hastaHoy, leerEva, dolorInicial, rotuloDolorInicial, inicioDesdeEval, textoCitas, logDeEpisodio as _logDeEpisodio, buildEvaSvg } from '../js/utils.js';

// EPI-2a: los marcadores 'Fin de episodio' de estos fixtures se convierten en filas de
// episodios con el mismo backfill del SQL (test/_episodios.js): mismos resultados = equivalencia.
import { conEpisodios } from './_episodios.js';
const citasDeEpisodio = (as, p, ep) => _citasDeEpisodio(as, conEpisodios(p), ep);
const logDeEpisodio = (p, ep) => _logDeEpisodio(conEpisodios(p), ep);

const HOY = '2026-10-08';
const cita = (date, status = 'conf', patientId = 'p1', hour = 9) => ({ date, status, patientId, hour });
const fin = (date) => ({ date, type: 'Fin de episodio', status: 'asistió', note: 'Episodio anterior: X · 2 sesiones completadas' });
const fechas = (cs) => cs.map(c => c.date);

// ── citasDeEpisodio ──────────────────────────────────────────────────────────
test('citasDeEpisodio: sin marcadores, el actual son todas las citas del paciente (y solo las suyas)', () => {
  const p = { id: 'p1', log: [] };
  const appts = [cita('2026-03-02'), cita('2026-01-05'), cita('2026-02-01', 'conf', 'p2'), cita('2026-04-01', 'noas')];
  assert.deepEqual(fechas(citasDeEpisodio(appts, p, 'current')), ['2026-01-05', '2026-03-02', '2026-04-01']);
  // Un ep_N residual sin marcadores también es el actual.
  assert.deepEqual(fechas(citasDeEpisodio(appts, p, 'ep_0')), ['2026-01-05', '2026-03-02', '2026-04-01']);
});

const p2 = { id: 'p1', log: [fin('2026-03-10'), fin('2026-01-10')] };   // desordenados a propósito
const appts2 = [
  cita('2026-01-05'), cita('2026-01-10'),                     // ep_0 (la del 10 = fecha del marcador)
  cita('2026-01-11'), cita('2026-02-20', 'noas'), cita('2026-03-10'), // ep_1
  cita('2026-03-11'), cita('2026-04-02', 'pend'),             // actual
];

test('citasDeEpisodio: episodio actual con marcador = solo lo posterior al último marcador', () => {
  assert.deepEqual(fechas(citasDeEpisodio(appts2, p2, 'current')), ['2026-03-11', '2026-04-02']);
});

test('citasDeEpisodio: ep_0 / ep_1 y frontera en la fecha del marcador (queda en el que cierra)', () => {
  assert.deepEqual(fechas(citasDeEpisodio(appts2, p2, 'ep_0')), ['2026-01-05', '2026-01-10']);
  assert.deepEqual(fechas(citasDeEpisodio(appts2, p2, 'ep_1')), ['2026-01-11', '2026-02-20', '2026-03-10']);
});

test('citasDeEpisodio: misma frontera que logDeEpisodio', () => {
  const ses = (date) => ({ date, type: 'Fisioterapia', status: 'asistió' });
  const p = { ...p2, log: [...p2.log, ...appts2.map(c => ses(c.date))] };
  for (const ep of ['ep_0', 'ep_1', 'current']) {
    assert.deepEqual(fechas(citasDeEpisodio(appts2, p, ep)), fechas(logDeEpisodio(p, ep).log), ep);
  }
});

test('citasDeEpisodio: sin paciente → []', () => {
  assert.deepEqual(citasDeEpisodio(appts2, null, 'current'), []);
});

// ── continuidad ──────────────────────────────────────────────────────────────
const continuidad = (appts, p, ep) => resumenCitas(hastaHoy(citasDeEpisodio(appts, p, ep), HOY));

test('continuidad: null si no hay citas decididas (sin citas, o solo pendientes)', () => {
  const p = { id: 'p1', log: [] };
  assert.equal(continuidad([], p, 'current').continuidad, null);
  assert.equal(continuidad([cita('2026-10-01', 'pend')], p, 'current').continuidad, null);
});

test('continuidad: las citas futuras no cuentan', () => {
  const p = { id: 'p1', log: [] };
  const r = continuidad([cita('2026-10-01'), cita('2026-10-09'), cita('2026-10-20', 'pend')], p, 'current');
  assert.equal(r.conf, 1);
  assert.equal(r.noas, 0);
  assert.equal(r.continuidad, 100);
  // Solo futuras → null, no 100 %.
  assert.equal(continuidad([cita('2026-10-09'), cita('2026-10-10')], p, 'current').continuidad, null);
});

test('continuidad: 9 conf + 1 noas → 90 %, "9 de 10 citas · 1 falta"', () => {
  const p = { id: 'p1', log: [] };
  const appts = [...Array.from({ length: 9 }, (_, i) => cita(`2026-09-${String(i + 10)}`)), cita('2026-09-25', 'noas')];
  const r = continuidad(appts, p, 'current');
  assert.equal(r.continuidad, 90);
  assert.equal(textoCitas(r.conf, r.conf + r.noas, r.noas), '9 de 10 citas · 1 falta');
});

test('textoCitas: sin faltas no agrega nada; plural', () => {
  assert.equal(textoCitas(5, 5, 0), '5 de 5 citas');
  assert.equal(textoCitas(8, 10, 2), '8 de 10 citas · 2 faltas');
});

// ── lectura del EVA ──────────────────────────────────────────────────────────
test('leerEva: "—" y vacío → null; "0" → 0; "7" → 7', () => {
  assert.equal(leerEva('—'), null);
  assert.equal(leerEva(''), null);
  assert.equal(leerEva(' — '), null);
  assert.equal(leerEva(null), null);
  assert.equal(leerEva('0'), 0);
  assert.equal(leerEva('7'), 7);
  assert.equal(leerEva('10'), 10);
  assert.equal(leerEva('11'), null);
});

// ── dolor inicial ────────────────────────────────────────────────────────────
const ev = (pb) => ({ date: '2026-09-01', type: 'Evaluación inicial', pb, pa: pb });
const s = (date, pb, pa) => ({ date, type: 'Fisioterapia', pb, pa });

test('dolorInicial: con evaluación medida → el EVA de la evaluación, rótulo "Eval. inicial"', () => {
  const d = dolorInicial(ev(8), [s('2026-09-02', 6, 4)]);
  assert.deepEqual(d, { valor: 8, fuente: 'eval', fecha: '2026-09-01' });
  assert.equal(rotuloDolorInicial(d.fuente), 'Eval. inicial');
  // El 0 medido en la evaluación es un valor, no "sin medir".
  assert.equal(dolorInicial(ev(0), [s('2026-09-02', 6, 4)]).valor, 0);
});

test('dolorInicial: evaluación sin medir → primer "antes" medido de una sesión, rótulo "Inicio"', () => {
  const d = dolorInicial(ev(null), [s('2026-09-02', null, 3), s('2026-09-04', 6, 4), s('2026-09-06', 5, 3)]);
  assert.deepEqual(d, { valor: 6, fuente: 'sesion', fecha: '2026-09-04' });
  assert.equal(rotuloDolorInicial(d.fuente), 'Inicio');
});

test('dolorInicial: sin evaluación → primer "antes" medido; sin nada medido → null', () => {
  assert.deepEqual(dolorInicial(undefined, [s('2026-09-04', 7, 5)]), { valor: 7, fuente: 'sesion', fecha: '2026-09-04' });
  assert.equal(dolorInicial(null, [s('2026-09-04', null, null)]), null);
  assert.equal(dolorInicial(null, []), null);
  // Filas del render-model (fecha en vez de date).
  assert.deepEqual(dolorInicial({ fecha: '2026-09-01', pb: 4 }, []), { valor: 4, fuente: 'eval', fecha: '2026-09-01' });
});

// ── gráfico del PDF: el rótulo sigue a la fuente; los snapshots viejos no cambian ──
const modelo = (metricas, evalInicial) => ({
  metricas, evalInicial,
  sesiones: [{ fecha: '2026-09-04', pb: 6, pa: 4 }, { fecha: '2026-09-06', pb: 5, pa: 3 }],
});

test('buildEvaSvg: fuente "sesion" con evaluación sin medir → "Inicio", no "Eval. inicial"', () => {
  const m = modelo({ evaInicial: 6, evaInicialFuente: 'sesion', evaActual: 3 }, { fecha: '2026-09-01', pb: null });
  assert.equal(inicioDesdeEval(m), false);
  const svg = buildEvaSvg(m);
  assert.match(svg, />Inicio</);
  assert.doesNotMatch(svg, /Eval\. inicial/);
});

test('buildEvaSvg: fuente "eval" → "Eval. inicial" con el valor de la evaluación', () => {
  const m = modelo({ evaInicial: 8, evaInicialFuente: 'eval', evaActual: 3 }, { fecha: '2026-09-01', pb: 8 });
  assert.equal(inicioDesdeEval(m), true);
  const svg = buildEvaSvg(m);
  assert.match(svg, /Eval\. inicial/);
  assert.match(svg, />8</);
});

test('buildEvaSvg: snapshot viejo (sin evaInicialFuente) se dibuja como antes', () => {
  const conEval = modelo({ evaInicial: 6, evaActual: 3 }, { fecha: '2026-09-01', pb: 5 });
  assert.equal(inicioDesdeEval(conEval), true);
  assert.match(buildEvaSvg(conEval), /Eval\. inicial/);
  const sinEval = modelo({ evaInicial: 6, evaActual: 3 }, null);
  assert.equal(inicioDesdeEval(sinEval), false);
  assert.match(buildEvaSvg(sinEval), />Inicio</);
});
