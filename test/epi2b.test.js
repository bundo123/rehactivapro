// Tests de EPI-2b: informe por rango de sesiones o de fechas — node --test.
//  · Ordinal sobre TODAS las sesiones de tratamiento (todos los episodios), con las previas del
//    episodio actual corriendo el número de sus sesiones.
//  · Rango por ordinal, por fechas, rango que cruza dos episodios (diag/plan del de la ÚLTIMA
//    sesión) y rango vacío (rango.vacio, sin log).
//  · Citas del rango (citasDeEpisodio con opts.rango) y el valor que se guarda en informes.episodio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logDeEpisodio, sesionesNumeradas, parseRangoInforme, valorRangoInforme, textoPeriodoRango,
         mapEpisodioRow, doneEnLog } from '../js/utils.js';
import { citasDeEpisodio } from '../js/historial-calc.js';
import { promptInformePaciente } from '../js/prompt-informe.js';

const ses = (date, extra = {}) => ({ date, type: 'Fisioterapia', status: 'asistió', hour: '09:00:00', ...extra });
const evalIni = (date) => ({ date, type: 'Evaluación inicial', status: 'asistió', hour: '08:00:00', pb: 7 });
const cita = (date, status = 'conf', hour = 9) => ({ patientId: 'p1', date, hour, status });

// Dos episodios: el 1 (Lumbalgia, plan 6) hasta el 31/07; el actual (Cervicalgia, plan 10) desde el 01/08.
const pac = (previas = 0) => ({
  id: 'p1', diag: 'Cervicalgia', sessions: 10, cie10: 'M54.2',
  episodios: [
    mapEpisodioRow({ id: 'e1', desde: null, diag: 'Lumbalgia', sesiones_plan: 6, sesiones_previas: 0 }),
    mapEpisodioRow({ id: 'e2', desde: '2026-08-01', diag: null, sesiones_plan: null, sesiones_previas: previas }),
  ],
  log: [
    evalIni('2026-07-01'),
    ses('2026-07-02'), ses('2026-07-06'), ses('2026-07-09', { status: 'faltó' }), ses('2026-07-13'),
    evalIni('2026-08-01'),
    ses('2026-08-03'), ses('2026-08-05'), ses('2026-08-10'), ses('2026-08-12'),
    { date: '2026-07-31', type: 'Fin de episodio', status: 'asistió', note: 'Episodio anterior: Lumbalgia · 3 sesiones completadas' },
  ],
});

test('sesionesNumeradas — ordinal sobre todas las sesiones de tratamiento, sin evaluación, faltas ni marcadores', () => {
  const nums = sesionesNumeradas(pac());
  assert.deepEqual(nums.map(x => [x.n, x.s.date]), [
    [1, '2026-07-02'], [2, '2026-07-06'], [3, '2026-07-13'],
    [4, '2026-08-03'], [5, '2026-08-05'], [6, '2026-08-10'], [7, '2026-08-12'],
  ]);
});

test('sesionesNumeradas — las previas del episodio actual corren SOLO el número de sus sesiones', () => {
  const nums = sesionesNumeradas(pac(5));
  assert.deepEqual(nums.map(x => x.n), [1, 2, 3, 9, 10, 11, 12]);
});

test('rango por ordinal — sesiones 2 a 3 del episodio 1: log, done, diag y plan del episodio', () => {
  const p = pac();
  const r = logDeEpisodio(p, 'rango:2-3', { rango: { desdeN: 2, hastaN: 3 } });
  assert.equal(r.esActual, false);
  assert.equal(r.epDone, 2);
  assert.equal(r.epDiag, 'Lumbalgia');
  assert.equal(r.epSessions, 6);
  assert.equal(r.epPrevias, 0);
  assert.deepEqual(r.rango, { desdeN: 2, hastaN: 3, desdeFecha: '2026-07-06', hastaFecha: '2026-07-13', vacio: false });
  // La falta del 09/07 cae entre la primera y la última: entra al log, no al conteo.
  assert.deepEqual(r.log.map(s => s.date), ['2026-07-06', '2026-07-09', '2026-07-13']);
  assert.equal(doneEnLog(r.log), r.epDone);
  // Sin la evaluación: hay una sesión (la 1) entre ella y el inicio del rango.
  assert.equal(r.log.some(s => s.type === 'Evaluación inicial'), false);
});

test('rango por ordinal — si arranca en la primera sesión tras la evaluación, la evaluación entra', () => {
  const r = logDeEpisodio(pac(), 'rango:4-5', { rango: { desdeN: 4, hastaN: 5 } });
  assert.deepEqual(r.log.map(s => s.type + ' ' + s.date), ['Evaluación inicial 2026-08-01', 'Fisioterapia 2026-08-03', 'Fisioterapia 2026-08-05']);
  assert.equal(r.epDiag, 'Cervicalgia');      // la última sesión cae en el actual: el del paciente
  assert.equal(r.epSessions, 10);
  assert.equal(r.epActualUltima, true);
});

test('rango por fechas — toma las sesiones con fecha dentro (bordes incluidos) y normaliza el orden', () => {
  const p = pac();
  const r = logDeEpisodio(p, '', { rango: { desdeFecha: '2026-08-12', hastaFecha: '2026-08-05' } });
  assert.equal(r.epDone, 3);
  assert.deepEqual(r.rango, { desdeN: 5, hastaN: 7, desdeFecha: '2026-08-05', hastaFecha: '2026-08-12', vacio: false });
});

test('rango que cruza dos episodios — diag y plan del episodio de la ÚLTIMA sesión', () => {
  const p = pac();
  const r = logDeEpisodio(p, 'rango:3-5', { rango: { desdeN: 3, hastaN: 5 } });
  assert.equal(r.epDone, 3);
  assert.equal(r.epDiag, 'Cervicalgia');
  assert.equal(r.epSessions, 10);
  // Al revés: si termina en el episodio 1, manda la foto del episodio 1.
  // La evaluación del episodio 2 cae a mitad del rango: no entra (no es el punto de partida).
  assert.equal(r.log.some(s => s.type === 'Evaluación inicial'), false);
  const r2 = logDeEpisodio(p, '', { rango: { desdeFecha: '2026-07-01', hastaFecha: '2026-07-31' } });
  assert.equal(r2.epDiag, 'Lumbalgia');
  assert.equal(r2.epSessions, 6);
  assert.equal(r2.epActualUltima, false);
});

test('rango vacío — sin sesiones de tratamiento: rango.vacio, log vacío y sin citas', () => {
  const p = pac();
  const porN = logDeEpisodio(p, 'rango:20-30', { rango: { desdeN: 20, hastaN: 30 } });
  assert.equal(porN.rango.vacio, true);
  assert.deepEqual(porN.log, []);
  assert.equal(porN.epDone, 0);
  const porF = logDeEpisodio(p, '', { rango: { desdeFecha: '2026-07-20', hastaFecha: '2026-07-30' } });
  assert.equal(porF.rango.vacio, true);
  assert.deepEqual(citasDeEpisodio([cita('2026-07-25')], p, '', { rango: { desdeFecha: '2026-07-20', hastaFecha: '2026-07-30' } }), []);
});

test('citasDeEpisodio con rango — las citas entre la primera y la última sesión del rango', () => {
  const p = pac();
  const citas = [cita('2026-07-02'), cita('2026-07-06'), cita('2026-07-09', 'noas'), cita('2026-07-13'), cita('2026-08-03'), cita('2026-08-04', 'noas')];
  const r = citasDeEpisodio(citas, p, 'rango:2-4', { rango: { desdeN: 2, hastaN: 4 } });
  assert.deepEqual(r.map(c => c.date), ['2026-07-06', '2026-07-09', '2026-07-13', '2026-08-03']);
});

test('sin rango — logDeEpisodio y citasDeEpisodio se comportan como antes', () => {
  const p = pac();
  const a = logDeEpisodio(p, 'current'), b = logDeEpisodio(p, 'current', undefined);
  assert.deepEqual(a, b);
  assert.equal(a.esActual, true);
  assert.equal(a.rango, undefined);
});

test('valor del selector / informes.episodio — ida y vuelta de los dos formatos', () => {
  assert.equal(valorRangoInforme({ desdeN: 3, hastaN: 8 }), 'rango:3-8');
  assert.equal(valorRangoInforme({ desdeFecha: '2026-08-01', hastaFecha: '2026-09-15' }), 'rango:2026-08-01-2026-09-15');
  assert.deepEqual(parseRangoInforme('rango:3-8'), { desdeN: 3, hastaN: 8 });
  assert.deepEqual(parseRangoInforme('rango:2026-08-01-2026-09-15'), { desdeFecha: '2026-08-01', hastaFecha: '2026-09-15' });
  for (const v of ['current', 'ep_0', 'rango', 'rango:', 'rango:a-b', null, undefined]) assert.equal(parseRangoInforme(v), null);
});

test('encabezado — "Período del informe: dd/mm – dd/mm · sesiones N a M"', () => {
  const r = logDeEpisodio(pac(), 'rango:2-5', { rango: { desdeN: 2, hastaN: 5 } }).rango;
  assert.equal(textoPeriodoRango(r), 'Período del informe: 06/07 – 05/08 · sesiones 2 a 5');
  assert.equal(textoPeriodoRango({ vacio: true }), '');
});

test('prompt IA — el rango lo dice el estado y solo van las sesiones del rango', () => {
  const p = pac();
  const r = logDeEpisodio(p, 'rango:5-6', { rango: { desdeN: 5, hastaN: 6 } });
  const t = promptInformePaciente({ p, log: r.log, epDiag: r.epDiag, epSessions: r.epSessions, epDone: r.epDone,
    esActual: r.esActual || r.epActualUltima, prot: null, tieneMedico: false, epPrevias: r.epPrevias, rango: r.rango });
  assert.match(t, /Estado actual: Informe parcial: sesiones 5 a 6 \(del 05\/08\/2026 al 10\/08\/2026\)/);
  assert.match(t, /- 2026-08-05:/);
  assert.match(t, /- 2026-08-10:/);
  assert.doesNotMatch(t, /- 2026-08-03:/);
  assert.match(t, /Sesiones realizadas\/prescritas: 2\/10/);
});
