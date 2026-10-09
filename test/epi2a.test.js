// Tests de EPI-2a: episodios como tabla — node --test.
//  · Equivalencia: con las 4 formas reales de marcadores de producción, la tabla (armada con el
//    mismo backfill del SQL, test/_episodios.js) da los mismos cortes, doneActual, pendientesActual
//    y ordinales que la frontera por marcadores de antes (reimplementada abajo como referencia).
//  · Sesiones previas: suman en el badge, en el informe y en el prompt; NO en pendientes ni cobros.
//  · Sin filas en episodios = como hoy sin marcadores (los marcadores ya no son frontera).
//  · Selector del informe: 'current' / 'ep_N'. Validación de mover el inicio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { episodiosOrdenados, episodioActual, lastFinDate, doneActual, doneEnLog, pendientesActual,
         citaOrdinal, ordinalesDeCitas, billingInfo, logDeEpisodio, indiceEpisodio, mapEpisodioRow,
         sesionesMostradas, textoPrevias, validarInicio, fechasParaInicio, previasActual } from '../js/utils.js';
import { episodiosDePaciente, opcionesEpisodio, citasDeEpisodio, ordinalesHistorial, citasDePaciente,
         filasEpisodios } from '../js/historial-calc.js';
import { promptInformePaciente } from '../js/prompt-informe.js';
import { episodiosDesdeMarcadores, conEpisodios } from './_episodios.js';

const ses = (date, extra = {}) => ({ date, type: 'Fisioterapia', status: 'asistió', hour: '09:00:00', ...extra });
const evalIni = (date) => ({ date, type: 'Evaluación inicial', status: 'asistió', hour: '08:00:00' });
const fin = (date, n) => ({ date, type: 'Fin de episodio', status: 'asistió', hour: '00:00',
  note: `Episodio anterior: Sin diagnóstico · ${n} sesiones completadas` });
const cita = (date, status = 'conf', hour = 9) => ({ patientId: 'p1', date, hour, status });

// ── Referencia: la frontera por marcadores tal como estaba en producción (antes de EPI-2a) ──
const refFin = p => { const f = (p.log || []).filter(s => s.type === 'Fin de episodio').map(s => s.date).sort(); return f.length ? f[f.length - 1] : null; };
const refDone = p => { const f = refFin(p); return doneEnLog((p.log || []).filter(s => !f || s.date > f)); };
const refPend = p => { const f = refFin(p); const c = (p.billing.facturas || []).filter(x => !f || (x.fecha || '') > f).reduce((s, x) => s + (x.n || 0), 0); return Math.max(0, refDone(p) - c); };
const refOrd = (appts, p, a) => {
  const f = refFin(p);
  const lista = appts.filter(x => x.status !== 'noas' && (!f || x.date > f))
    .sort((x, y) => x.date.localeCompare(y.date) || x.hour - y.hour);
  const i = lista.indexOf(a); return i < 0 ? null : i + 1;
};

// Las 4 formas reales (un marcador por paciente; notas "Sin diagnóstico · N sesiones", N = 0, 21, 0, 12).
// Sesiones antes, el MISMO día del marcador, al día siguiente y después; facturas a ambos lados.
const FORMAS = [0, 21, 0, 12].map((n, k) => {
  const f = `2026-0${k + 3}-15`, sig = `2026-0${k + 3}-16`;
  return {
    n, f, sig,
    p: { id: 'p1', diag: 'Lumbalgia', sessions: 10, log: [
      evalIni('2026-01-05'), ses('2026-01-10'), ses(f), fin(f, n), ses(sig), ses(`2026-0${k + 3}-20`),
      ses(`2026-0${k + 3}-22`, { status: 'faltó' })],
      billing: { sesPerFactura: 2, facturas: [{ id: 'F1', n: 2, fecha: '2026-02-01' }, { id: 'F2', n: 1, fecha: `2026-0${k + 3}-21` }] } },
    citas: [cita('2026-01-10'), cita(f), cita(sig), cita(`2026-0${k + 3}-18`, 'noas'), cita(`2026-0${k + 3}-20`), cita('2026-09-01', 'pend')],
  };
});

test('equivalencia — los cortes de la tabla (desde − 1 día) son las fechas de los marcadores', () => {
  for (const { p, f, sig } of FORMAS) {
    const eps = episodiosDesdeMarcadores(p.log);
    assert.deepEqual(eps.map(e => e.desde), [null, sig]);
    assert.equal(lastFinDate({ ...p, episodios: eps }), f);
    assert.equal(lastFinDate({ ...p, episodios: eps }), refFin(p));
  }
});

test('equivalencia — doneActual, pendientesActual y citaOrdinal: tabla = marcadores', () => {
  for (const { p, citas } of FORMAS) {
    const conTabla = conEpisodios({ ...p, log: [...p.log] });
    assert.equal(doneActual(conTabla), refDone(p));
    assert.equal(pendientesActual(conTabla), refPend(p));
    for (const a of citas) assert.equal(citaOrdinal(citas, conTabla, a)?.x ?? null, refOrd(citas, p, a), a.date);
  }
});

test('equivalencia — el episodio cerrado conserva la foto de la nota (diag y "de N")', () => {
  for (const { p, n } of FORMAS) {
    const r = logDeEpisodio(conEpisodios({ ...p }), 'ep_0');
    assert.equal(r.epDiag, 'Sin diagnóstico');
    assert.equal(r.epSessions, n);
    assert.equal(r.esActual, false);
  }
});

// ── Sin filas en la tabla ─────────────────────────────────────────────────────
test('sin filas en episodios: un episodio implícito desde el inicio, igual que hoy sin marcadores', () => {
  const p = { id: 'p1', sessions: 10, log: [ses('2026-01-02'), ses('2026-02-02')], billing: { facturas: [] } };
  assert.deepEqual(episodiosOrdenados(p).map(e => e.desde), [null]);
  assert.equal(episodioActual(p).implicito, true);
  assert.equal(lastFinDate(p), null);
  assert.equal(doneActual(p), 2);
  assert.equal(episodiosDePaciente({ ...p, diag: 'X' }).length, 1);
});

test('los marcadores ya no son frontera: sin filas, un "Fin de episodio" en el log no corta nada', () => {
  const p = { id: 'p1', sessions: 10, log: [ses('2026-01-02'), fin('2026-01-10', 1), ses('2026-02-02')], billing: { facturas: [] } };
  assert.equal(lastFinDate(p), null);
  assert.equal(doneActual(p), 2);                       // el marcador sigue fuera del conteo
  assert.equal(logDeEpisodio(p, 'current').log.length, 2);
});

// ── Orden y episodio actual ───────────────────────────────────────────────────
test('episodiosOrdenados: desde null primero, luego por fecha; actual = el de mayor desde', () => {
  const p = { episodios: [
    mapEpisodioRow({ id: 'c', desde: '2026-05-01' }), mapEpisodioRow({ id: 'a', desde: null }),
    mapEpisodioRow({ id: 'b', desde: '2026-02-01' })] };
  assert.deepEqual(episodiosOrdenados(p).map(e => e.id), ['a', 'b', 'c']);
  assert.equal(episodioActual(p).id, 'c');
  assert.equal(lastFinDate(p), '2026-04-30');
});

test('mapEpisodioRow: columnas → memoria (previas numérica, nulls en vez de vacíos)', () => {
  assert.deepEqual(mapEpisodioRow({ id: 'e1', patient_id: 'p1', desde: '2026-03-01', nombre: 'Rodilla', diag: null,
    cie10: null, cie10_desc: null, protocol_id: null, sesiones_plan: 12, sesiones_previas: 4, created_at: 't' }), {
    id: 'e1', patientId: 'p1', desde: '2026-03-01', nombre: 'Rodilla', diag: null, cie10: null, cie10Desc: null,
    protocolId: null, sesionesPlan: 12, sesionesPrevias: 4, createdAt: 't' });
  assert.equal(mapEpisodioRow({ id: 'e', sesiones_plan: 0 }).sesionesPlan, 0);
});

// ── Sesiones previas ──────────────────────────────────────────────────────────
const conPrevias = (previas) => ({
  id: 'p1', diag: 'Hombro', sessions: 10,
  episodios: [mapEpisodioRow({ id: 'e0', desde: null, diag: 'Lumbalgia', sesiones_plan: 8 }),
              mapEpisodioRow({ id: 'e1', desde: '2026-03-01', nombre: 'Hombro der.', sesiones_previas: previas })],
  log: [ses('2026-02-01'), ses('2026-03-01'), ses('2026-03-05')],
  billing: { sesPerFactura: 2, facturas: [{ id: 'F1', n: 1, fecha: '2026-03-02' }] },
});

test('previas: corren el badge X/N de la agenda (citaOrdinal y ordinalesDeCitas)', () => {
  const p = conPrevias(3);
  const citas = [cita('2026-03-01'), cita('2026-03-05')];
  assert.deepEqual(citaOrdinal(citas, p, citas[0]), { x: 4, n: 10 });
  assert.deepEqual(citaOrdinal(citas, p, citas[1]), { x: 5, n: 10 });
  const m = ordinalesDeCitas(citas, () => p);
  assert.equal(m.get(citas[1]).x, 5);
  assert.equal(previasActual(p), 3);
  // El Historial numera igual que la agenda.
  const eps = episodiosDePaciente(p);
  const h = ordinalesHistorial(citasDePaciente(citas, 'p1'), eps);
  assert.equal(h.get(citas[1]).x, 5);
});

test('previas: suman en el informe y en el prompt de la IA, con la aclaración', () => {
  const p = conPrevias(3);
  const r = logDeEpisodio(p, 'current');
  assert.equal(r.epDone, 2);                            // solo RehactivaPro
  assert.equal(r.epPrevias, 3);
  assert.equal(r.epNombre, 'Hombro der.');
  assert.equal(sesionesMostradas(r.epDone, r.epPrevias), 5);
  assert.equal(textoPrevias(3), 'incluye 3 previas a RehactivaPro');
  assert.equal(textoPrevias(1), 'incluye 1 previa a RehactivaPro');
  assert.equal(textoPrevias(0), '');
  const t = promptInformePaciente({ p, log: r.log, epDiag: r.epDiag, epSessions: r.epSessions, epDone: r.epDone,
    esActual: true, prot: null, tieneMedico: false, epPrevias: r.epPrevias });
  assert.ok(t.includes('- Sesiones realizadas/prescritas: 5/10 (incluye 3 previas a RehactivaPro)'));
  const sin = promptInformePaciente({ p, log: r.log, epDiag: r.epDiag, epSessions: r.epSessions, epDone: r.epDone,
    esActual: true, prot: null, tieneMedico: false });
  assert.ok(sin.includes('- Sesiones realizadas/prescritas: 2/10\n'));
});

test('previas: NO entran en doneActual, pendientesActual ni en la facturación', () => {
  const con = conPrevias(7), sin = conPrevias(0);
  assert.equal(doneActual(con), doneActual(sin));
  assert.equal(pendientesActual(con), pendientesActual(sin));
  assert.equal(pendientesActual(con), 1);               // 2 hechas − 1 cobrada
  assert.deepEqual(billingInfo(con, 2), billingInfo(sin, 2));
});

// ── Selector del informe ──────────────────────────────────────────────────────
test('selector: "current" y "ep_N" (N entre los cerrados, del más viejo); etiqueta = nombre || diag', () => {
  const p = { id: 'p1', diag: 'Hombro', sessions: 10, log: [],
    episodios: [mapEpisodioRow({ id: 'a', desde: null, diag: 'Lumbalgia', sesiones_plan: 8 }),
                mapEpisodioRow({ id: 'b', desde: '2026-02-01', nombre: 'Rodilla post-op', diag: 'Gonartrosis' }),
                mapEpisodioRow({ id: 'c', desde: '2026-05-01' })] };
  const ops = opcionesEpisodio(episodiosDePaciente(p));
  assert.deepEqual(ops.map(o => o.value), ['current', 'ep_0', 'ep_1']);
  assert.equal(ops[0].label, 'Episodio actual — Hombro');
  assert.equal(ops[1].label, 'Episodio 1 — Lumbalgia (2026-01-31)');
  assert.equal(ops[2].label, 'Episodio 2 — Rodilla post-op (2026-04-30)');
  const eps = episodiosOrdenados(p);
  assert.equal(indiceEpisodio(eps, 'current'), 2);
  assert.equal(indiceEpisodio(eps, 'ep_0'), 0);
  assert.equal(indiceEpisodio(eps, 'ep_1'), 1);
  assert.equal(indiceEpisodio(eps, 'ep_2'), 2);         // fuera de rango → el actual
  assert.equal(indiceEpisodio(eps, '0'), 2);
  assert.equal(logDeEpisodio(p, 'ep_1').epDiag, 'Gonartrosis');
});

test('selector: los valores son los mismos que con marcadores (informes guardados)', () => {
  const p = conEpisodios({ id: 'p1', diag: 'X', sessions: 5, log: [fin('2026-01-10', 2), fin('2026-03-02', 9)] });
  assert.deepEqual(opcionesEpisodio(episodiosDePaciente(p)).map(o => o.value), ['current', 'ep_0', 'ep_1']);
  const citas = [cita('2026-01-10'), cita('2026-01-11'), cita('2026-03-03')];
  assert.deepEqual(citasDeEpisodio(citas, p, 'ep_0').map(c => c.date), ['2026-01-10']);
  assert.deepEqual(citasDeEpisodio(citas, p, 'ep_1').map(c => c.date), ['2026-01-11']);
  assert.deepEqual(citasDeEpisodio(citas, p, 'current').map(c => c.date), ['2026-03-03']);
});

// ── Mover el inicio ───────────────────────────────────────────────────────────
const tres = { id: 'p1', log: [], episodios: [
  mapEpisodioRow({ id: 'a', desde: null }), mapEpisodioRow({ id: 'b', desde: '2026-03-01' }), mapEpisodioRow({ id: 'c', desde: '2026-06-01' })] };

test('validarInicio: estrictamente entre los vecinos; el primero no se mueve', () => {
  const eps = episodiosOrdenados(tres);
  assert.match(validarInicio(eps, 0, '2026-01-01'), /primer episodio/);
  assert.equal(validarInicio(eps, 1, '2026-01-01'), null);          // el anterior empieza "desde el inicio"
  assert.equal(validarInicio(eps, 1, '2026-05-31'), null);
  assert.match(validarInicio(eps, 1, '2026-06-01'), /antes del 01\/06\/2026/);
  assert.equal(validarInicio(eps, 2, '2026-03-02'), null);
  assert.match(validarInicio(eps, 2, '2026-03-01'), /después del 01\/03\/2026/);
  assert.match(validarInicio(eps, 2, ''), /Elegí una fecha/);
  assert.match(validarInicio(eps, 5, '2026-03-02'), /no encontrado/);
});

test('fechasParaInicio: fechas de sesiones y citas (sin no asistió) entre los vecinos, más la actual', () => {
  const p = { ...tres, log: [ses('2026-02-10'), ses('2026-04-02'), fin('2026-04-03', 1), ses('2026-07-01')] };
  const citas = [cita('2026-05-10'), cita('2026-05-12', 'noas'), cita('2026-06-01'), { patientId: 'p2', date: '2026-04-20', status: 'conf' }];
  assert.deepEqual(fechasParaInicio(p, citas, 1), ['2026-02-10', '2026-03-01', '2026-04-02', '2026-05-10']);
  // El último no tiene siguiente: vale cualquier fecha posterior al inicio del anterior.
  assert.deepEqual(fechasParaInicio(p, citas, 2), ['2026-04-02', '2026-05-10', '2026-06-01', '2026-07-01']);
  assert.deepEqual(fechasParaInicio(p, citas, 0), []);
});

// ── Bloque "Episodios" del informe ────────────────────────────────────────────
test('filasEpisodios: del más nuevo al más viejo, con hechas, previas, plan y valor del selector', () => {
  const p = conPrevias(3);
  const f = filasEpisodios(p);
  assert.deepEqual(f.map(e => [e.value, e.etiqueta, e.hechas, e.previas, e.plan, e.actual]), [
    ['current', 'Hombro der.', 2, 3, 10, true],
    ['ep_0', 'Lumbalgia', 1, 0, 8, false],
  ]);
  assert.equal(f[0].inicio, '2026-03-01');
  assert.equal(f[1].hasta, '2026-02-28');
});
