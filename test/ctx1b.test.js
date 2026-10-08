// Tests de CTX-1b: recorte de session_log al episodio elegido — node --test.
// logDeEpisodio (utils.js) es la fuente única del corte que usan el informe del paciente
// (pantalla/PDF/Word, renderPatientReport) y la narrativa de la IA (genPatientAI). Antes vivía
// dentro de renderPatientReport y la IA mandaba todo p.log con el diagnóstico/sesiones de hoy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logDeEpisodio, doneEnLog, doneActual } from '../js/utils.js';

const ses = (date, extra = {}) => ({ date, type: 'Fisioterapia', status: 'asistió', ...extra });
const evalIni = (date) => ({ date, type: 'Evaluación inicial', status: 'asistió' });
const fin = (date, diag, n) => ({ date, type: 'Fin de episodio', status: 'asistió',
  note: `Episodio anterior: ${diag} · ${n} sesiones completadas` });
const fechas = (log) => log.map(s => s.date);

test('sin marcadores: todo el log menos los Fin de episodio, y es el episodio actual', () => {
  const p = { diag: 'Lumbalgia', sessions: 10,
    log: [evalIni('2026-01-01'), ses('2026-01-02'), ses('2026-01-03'), { type: 'Fisioterapia' }] };
  const r = logDeEpisodio(p, 'current');
  assert.deepEqual(fechas(r.log), ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.equal(r.esActual, true);
  assert.equal(r.epDiag, 'Lumbalgia');
  assert.equal(r.epSessions, 10);
  assert.equal(r.epDone, 2);
});

test('sin marcadores, un ep_N residual se trata como episodio actual', () => {
  const p = { diag: 'Lumbalgia', sessions: 10, log: [ses('2026-01-02')] };
  const r = logDeEpisodio(p, 'ep_0');
  assert.equal(r.esActual, true);
  assert.deepEqual(fechas(r.log), ['2026-01-02']);
});

test('episodio actual con 1 marcador: solo lo posterior al marcador', () => {
  const p = { diag: 'Hombro doloroso', sessions: 8, log: [
    ses('2026-01-02'), ses('2026-01-10'), fin('2026-01-10', 'Lumbalgia', 2),
    evalIni('2026-02-01'), ses('2026-02-02'), ses('2026-02-03', { status: 'faltó' })] };
  const r = logDeEpisodio(p, 'current');
  assert.deepEqual(fechas(r.log), ['2026-02-01', '2026-02-02', '2026-02-03']);
  assert.equal(r.esActual, true);
  assert.equal(r.epDiag, 'Hombro doloroso');
  assert.equal(r.epSessions, 8);
  assert.equal(r.epDone, doneActual(p));
  assert.equal(r.epDone, 1);
});

// Dos marcadores → tres episodios. La fecha del marcador queda en el episodio que CIERRA
// (s.date <= finEnd.date) y fuera del siguiente (s.date > finStart.date).
const p3 = { diag: 'Rodilla', sessions: 12, log: [
  ses('2026-01-05'), ses('2026-01-10'),                                     // ep_0
  fin('2026-01-10', 'Lumbalgia', 2),
  evalIni('2026-02-01'), ses('2026-02-02'), ses('2026-03-01'), ses('2026-03-02'), // ep_1
  fin('2026-03-02', 'Cervicalgia', 9),
  ses('2026-04-01'),                                                        // actual
] };

test('ep_0 y ep_1 con 2 marcadores: límites correctos', () => {
  assert.deepEqual(fechas(logDeEpisodio(p3, 'ep_0').log), ['2026-01-05', '2026-01-10']);
  assert.deepEqual(fechas(logDeEpisodio(p3, 'ep_1').log), ['2026-02-01', '2026-02-02', '2026-03-01', '2026-03-02']);
  assert.deepEqual(fechas(logDeEpisodio(p3, 'current').log), ['2026-04-01']);
});

test('episodio cerrado: diagnóstico y sesiones de la nota del marcador; epDone = doneEnLog', () => {
  const e0 = logDeEpisodio(p3, 'ep_0');
  assert.equal(e0.epDiag, 'Lumbalgia');
  assert.equal(e0.epSessions, 2);
  assert.equal(e0.epDone, doneEnLog(e0.log));
  assert.equal(e0.epDone, 2);
  const e1 = logDeEpisodio(p3, 'ep_1');
  assert.equal(e1.epDiag, 'Cervicalgia');
  assert.equal(e1.epSessions, 9);
  assert.equal(e1.epDone, doneEnLog(e1.log));
  assert.equal(e1.epDone, 3); // la evaluación inicial no cuenta
  assert.notEqual(e1.epDone, doneActual(p3));
});

test('episodio cerrado con marcador sin nota: diagnóstico/sesiones/done del paciente hoy', () => {
  const p = { diag: 'Rodilla', sessions: 12, log: [
    ses('2026-01-05'), { date: '2026-01-10', type: 'Fin de episodio', status: 'asistió' }, ses('2026-02-01')] };
  const r = logDeEpisodio(p, 'ep_0');
  assert.deepEqual(fechas(r.log), ['2026-01-05']);
  assert.equal(r.esActual, false);
  assert.equal(r.epDiag, 'Rodilla');
  assert.equal(r.epSessions, 12);
  assert.equal(r.epDone, doneActual(p));
});

test('orden por fecha aunque p.log venga desordenado (marcadores incluidos), estable en empates', () => {
  const a = ses('2026-02-05', { note: 'a' }), b = ses('2026-02-05', { note: 'b' });
  const p = { diag: 'X', sessions: 5, log: [
    ses('2026-03-01'), fin('2026-03-02', 'Y', 4), ses('2026-02-10'), fin('2026-01-31', 'Z', 1),
    a, ses('2026-01-15'), b, ses('2026-04-01')] };
  const e1 = logDeEpisodio(p, 'ep_1');
  assert.deepEqual(fechas(e1.log), ['2026-02-05', '2026-02-05', '2026-02-10', '2026-03-01']);
  assert.deepEqual(e1.log.slice(0, 2).map(s => s.note), ['a', 'b']);
  assert.equal(e1.epDiag, 'Y');
  assert.deepEqual(fechas(logDeEpisodio(p, 'ep_0').log), ['2026-01-15']);
  assert.deepEqual(fechas(logDeEpisodio(p, 'current').log), ['2026-04-01']);
});

test('esActual: true en current, false en ep_N con marcadores', () => {
  assert.equal(logDeEpisodio(p3, 'current').esActual, true);
  assert.equal(logDeEpisodio(p3, 'ep_0').esActual, false);
  assert.equal(logDeEpisodio(p3, 'ep_1').esActual, false);
});

test('no muta p.log', () => {
  const log = [ses('2026-03-01'), ses('2026-01-01')];
  const p = { diag: 'X', sessions: 2, log };
  logDeEpisodio(p, 'current');
  assert.deepEqual(fechas(p.log), ['2026-03-01', '2026-01-01']);
});
