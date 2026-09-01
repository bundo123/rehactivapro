// Tests del Historial de citas — node --test.
// La pantalla contesta "¿cuántas veces ha venido?" y corta por episodio. Lo que hay que blindar es
// el vocabulario, porque tres salidas distintas (pantalla, impresión y CSV) dependen de él:
//   · una 'conf' FUTURA no es una asistencia;
//   · la frontera del episodio es ESTRICTA (date > fin), la misma de doneActual/citasNumerables;
//   · una 'no asistió' no consume número de sesión;
//   · y, sobre todo, que el ordinal por episodio COINCIDA con el de la agenda en el episodio
//     actual: ordinalesDeCitas no se refactorizó, se ató con un test de invariante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordinalesDeCitas, parseFinNote } from '../js/utils.js';
import {
  episodiosDePaciente, citasDePaciente, episodioDeCita, ordinalesHistorial,
  estadoHistorial, resumenHistorial, filtrarHistorial, agruparPorMes,
  filasCsvHistorial, tipoAbbr,
} from '../js/historial-calc.js';

const HOY = '2026-09-01';

const cita = (id, date, hour = 9, status = 'conf', extra = {}) =>
  ({ id, date, hour, duration: 60, status, patientId: 'p1', therapistId: 't1', type: 'Fisioterapia', location: 'centro', ...extra });
const finEp = (date, note) => ({ date, type: 'Fin de episodio', hour: '00:00', status: 'asistió', note });
const notaFin = (diag, n) => `Episodio anterior: ${diag} · ${n} sesiones completadas`;
const pac = (extra = {}) => ({ id: 'p1', name: 'María García', diag: 'Lumbalgia', sessions: 15, log: [], ...extra });

// Mapa cita → idx de episodio, que es lo que la pantalla calcula una vez por render.
const mapaEps = (citas, eps) => new Map(citas.map(c => [c, episodioDeCita(c, eps)]));

// ── parseFinNote: una sola lectura de la nota del marcador ────────────────────
test('parseFinNote — formato que escribe guardarNuevoEpisodio', () => {
  assert.deepEqual(parseFinNote(notaFin('Cervicalgia', 20)), { diag: 'Cervicalgia', plan: 20 });
});

test('parseFinNote — sin nota o sin formato: fallbacks, nunca undefined', () => {
  assert.deepEqual(parseFinNote(null), { diag: 'Tratamiento anterior', plan: null });
  assert.deepEqual(parseFinNote('texto suelto'), { diag: 'Tratamiento anterior', plan: null });
});

test('parseFinNote — diagnóstico con varias palabras y separador intacto', () => {
  const r = parseFinNote(notaFin('Esguince de tobillo grado II', 8));
  assert.equal(r.diag, 'Esguince de tobillo grado II');
  assert.equal(r.plan, 8);
});

// ── Episodios ─────────────────────────────────────────────────────────────────
test('episodiosDePaciente — paciente SIN log: un solo episodio, el actual, abierto por los dos lados', () => {
  const eps = episodiosDePaciente(pac());
  assert.equal(eps.length, 1);
  assert.deepEqual(eps[0], { idx: 1, desde: null, hasta: null, diag: 'Lumbalgia', plan: 15, actual: true });
});

test('episodiosDePaciente — un marcador parte el histórico en dos; el actual es el último', () => {
  const p = pac({ log: [finEp('2026-06-30', notaFin('Cervicalgia', 20))] });
  const eps = episodiosDePaciente(p);
  assert.equal(eps.length, 2);
  assert.deepEqual(eps[0], { idx: 1, desde: null, hasta: '2026-06-30', diag: 'Cervicalgia', plan: 20, actual: false });
  assert.deepEqual(eps[1], { idx: 2, desde: '2026-06-30', hasta: null, diag: 'Lumbalgia', plan: 15, actual: true });
});

test('episodiosDePaciente — marcadores desordenados en el log: salen del más viejo al más nuevo', () => {
  const p = pac({ log: [finEp('2026-06-30', notaFin('B', 8)), finEp('2026-02-10', notaFin('A', 5))] });
  const eps = episodiosDePaciente(p);
  assert.deepEqual(eps.map(e => [e.idx, e.desde, e.hasta]), [
    [1, null, '2026-02-10'],
    [2, '2026-02-10', '2026-06-30'],
    [3, '2026-06-30', null],
  ]);
});

test('episodiosDePaciente — sin paciente: lista vacía (la pantalla sin selección no inventa episodios)', () => {
  assert.deepEqual(episodiosDePaciente(null), []);
});

// ── Frontera ESTRICTA (date > fin) ────────────────────────────────────────────
test('episodioDeCita — la cita en la fecha EXACTA del marcador es del episodio que CIERRA', () => {
  const p = pac({ log: [finEp('2026-06-30', notaFin('Cervicalgia', 20))] });
  const eps = episodiosDePaciente(p);
  assert.equal(episodioDeCita(cita('a1', '2026-06-30'), eps), 1, 'la del día del corte queda en el viejo');
  assert.equal(episodioDeCita(cita('a2', '2026-07-01'), eps), 2, 'la del día siguiente ya es del nuevo');
  assert.equal(episodioDeCita(cita('a0', '2026-06-29'), eps), 1);
});

test('episodioDeCita — sin fecha no hay episodio', () => {
  assert.equal(episodioDeCita({ date: '' }, episodiosDePaciente(pac())), null);
});

// ── Citas del paciente ────────────────────────────────────────────────────────
test('citasDePaciente — solo las suyas, ascendentes por fecha y luego hora', () => {
  const lista = [
    cita('a3', '2026-08-10', 10.75),
    cita('otra', '2026-08-01', 9, 'conf', { patientId: 'p2' }),
    cita('a1', '2026-08-05', 9),
    cita('a2', '2026-08-10', 10.5),
  ];
  assert.deepEqual(citasDePaciente(lista, 'p1').map(a => a.id), ['a1', 'a2', 'a3']);
});

test('citasDePaciente — paciente SIN citas: array vacío, no explota', () => {
  assert.deepEqual(citasDePaciente([cita('x', '2026-08-01', 9, 'conf', { patientId: 'p9' })], 'p1'), []);
  assert.deepEqual(citasDePaciente(null, 'p1'), []);
});

// ── Ordinal por episodio ──────────────────────────────────────────────────────
test('ordinalesHistorial — la NO ASISTIÓ no consume número: la siguiente hereda el suyo', () => {
  const c1 = cita('a1', '2026-08-03'), no = cita('a2', '2026-08-05', 9, 'noas'), c3 = cita('a3', '2026-08-07');
  const p = pac();
  const eps = episodiosDePaciente(p);
  const ord = ordinalesHistorial([c1, no, c3], eps);
  assert.equal(ord.get(c1).x, 1);
  assert.equal(ord.has(no), false, 'la no-asistió no entra al mapa');
  assert.equal(ord.get(c3).x, 2, 'hereda el 2 que habría tenido la no-asistió');
});

test('ordinalesHistorial — reinicia en cada episodio y usa el plan de ESE episodio', () => {
  const p = pac({ log: [finEp('2026-06-30', notaFin('Cervicalgia', 20))] });
  const eps = episodiosDePaciente(p);
  const v1 = cita('v1', '2026-06-10'), v2 = cita('v2', '2026-06-20');
  const n1 = cita('n1', '2026-07-05'), n2 = cita('n2', '2026-07-08');
  const ord = ordinalesHistorial([v1, v2, n1, n2], eps);
  assert.deepEqual(ord.get(v1), { x: 1, n: 20, ep: 1 });
  assert.deepEqual(ord.get(v2), { x: 2, n: 20, ep: 1 });
  assert.deepEqual(ord.get(n1), { x: 1, n: 15, ep: 2 }, 'el episodio nuevo vuelve a empezar en 1');
  assert.deepEqual(ord.get(n2), { x: 2, n: 15, ep: 2 });
});

test('ordinalesHistorial — sin plan de sesiones, n es null (en pantalla va solo "X")', () => {
  const c1 = cita('a1', '2026-08-03');
  const ord = ordinalesHistorial([c1], episodiosDePaciente(pac({ sessions: null })));
  assert.deepEqual(ord.get(c1), { x: 1, n: null, ep: 1 });
});

test('ordinalesHistorial — la lista puede venir desordenada: manda la fecha y luego la hora', () => {
  const c1 = cita('a1', '2026-08-03', 9), c2 = cita('a2', '2026-08-03', 10.75), c3 = cita('a3', '2026-08-04', 8);
  const ord = ordinalesHistorial([c3, c2, c1], episodiosDePaciente(pac()));
  assert.deepEqual([ord.get(c1).x, ord.get(c2).x, ord.get(c3).x], [1, 2, 3]);
});

// ── INVARIANTE: el ordinal del episodio ACTUAL es el mismo que pinta la agenda ─
// citasNumerables/ordinalesDeCitas NO se tocaron (están en producción y la agenda depende de
// ellas): la unificación se prueba acá. El caso lleva no-asistió intercaladas a propósito, que es
// donde las dos numeraciones podrían separarse.
test('INVARIANTE — ordinalesHistorial == ordinalesDeCitas en el episodio actual (con noas intercaladas)', () => {
  const p = pac({ log: [finEp('2026-06-30', notaFin('Cervicalgia', 20))] });
  const citas = [
    cita('v1', '2026-05-10'), cita('v2', '2026-06-30'),          // episodio cerrado (la del corte incluida)
    cita('a1', '2026-07-01'), cita('a2', '2026-07-03', 9, 'noas'),
    cita('a3', '2026-07-05'), cita('a4', '2026-07-08', 9, 'noas'),
    cita('a5', '2026-07-10', 10.75), cita('a6', '2026-07-10', 9),
    cita('a7', '2026-09-20', 9, 'pend'),                          // futura: numerada igual que en agenda
  ];
  const eps = episodiosDePaciente(p);
  const mio = ordinalesHistorial(citas, eps);
  const agenda = ordinalesDeCitas(citas, () => p);
  const actual = eps[eps.length - 1].idx;

  const delActual = citas.filter(c => episodioDeCita(c, eps) === actual && c.status !== 'noas');
  assert.equal(delActual.length, 5, 'el caso tiene que ejercitar varias citas del episodio actual');
  delActual.forEach(c => {
    assert.equal(mio.get(c).x, agenda.get(c).x, `x distinto en ${c.id}`);
    assert.equal(mio.get(c).n, agenda.get(c).n, `n distinto en ${c.id}`);
  });
  // Y al revés: la agenda no numera nada del episodio cerrado, el historial sí.
  citas.filter(c => episodioDeCita(c, eps) === 1 && c.status !== 'noas').forEach(c => {
    assert.equal(agenda.has(c), false, 'la agenda no numera episodios cerrados');
    assert.ok(mio.get(c).x >= 1, 'el historial sí los numera');
  });
});

test('INVARIANTE — paciente sin marcadores: todo el histórico es el episodio actual y coincide entero', () => {
  const p = pac();
  const citas = [cita('a1', '2026-08-03'), cita('a2', '2026-08-05', 9, 'noas'), cita('a3', '2026-08-07')];
  const mio = ordinalesHistorial(citas, episodiosDePaciente(p));
  const agenda = ordinalesDeCitas(citas, () => p);
  citas.filter(c => c.status !== 'noas').forEach(c => assert.equal(mio.get(c).x, agenda.get(c).x));
});

// ── Estado: la 'conf' futura NO es una asistencia ─────────────────────────────
test('estadoHistorial — conf pasada = Asistió; conf futura = Agendada (y NO suma asistencia)', () => {
  assert.deepEqual(estadoHistorial(cita('a', '2026-08-30'), HOY), { key: 'asistio', label: 'Asistió' });
  assert.deepEqual(estadoHistorial(cita('b', HOY), HOY), { key: 'asistio', label: 'Asistió' }, 'la de HOY ya cuenta');
  assert.deepEqual(estadoHistorial(cita('c', '2026-09-03'), HOY), { key: 'pend', label: 'Agendada' });
  assert.deepEqual(estadoHistorial(cita('d', '2026-09-03', 9, 'pend'), HOY), { key: 'pend', label: 'Pendiente' });
  assert.deepEqual(estadoHistorial(cita('e', '2026-08-20', 9, 'noas'), HOY), { key: 'noas', label: 'No asistió' });
});

// ── Resumen ───────────────────────────────────────────────────────────────────
test('resumenHistorial — ASISTENCIA = conf con fecha <= hoy: la conf futura no suma', () => {
  const r = resumenHistorial([
    cita('a1', '2026-08-20'), cita('a2', '2026-08-27'),
    cita('a3', '2026-09-03'),                         // conf FUTURA
  ], HOY);
  assert.equal(r.asistencias, 2);
  assert.equal(r.proximas, 1);
  assert.equal(r.proxima, '2026-09-03');
  assert.equal(r.ultima, '2026-08-27');
});

test('resumenHistorial — inasistencias sobre citas DECIDIDAS (continuidad invertida)', () => {
  const r = resumenHistorial([
    cita('a1', '2026-08-03'), cita('a2', '2026-08-05'), cita('a3', '2026-08-07'),
    cita('a4', '2026-08-10', 9, 'noas'),
    cita('a5', '2026-09-10', 9, 'pend'),              // pendiente: no entra en el denominador
  ], HOY);
  assert.equal(r.inasistencias, 1);
  assert.equal(r.pctInasistencia, 25, '1 noas / (3 asistidas + 1 noas)');
  assert.equal(r.pendientes, 1);
});

test('resumenHistorial — sin citas decididas, pctInasistencia es null (en pantalla "—", nunca 0%)', () => {
  const r = resumenHistorial([cita('a1', '2026-09-10', 9, 'pend'), cita('a2', '2026-09-12')], HOY);
  assert.equal(r.pctInasistencia, null);
  assert.equal(r.asistencias, 0);
  assert.equal(r.ultima, null);
});

test('resumenHistorial — paciente SIN citas: todo en cero y sin fechas', () => {
  const r = resumenHistorial([], HOY);
  assert.deepEqual(r, {
    total: 0, asistencias: 0, inasistencias: 0, pendientes: 0, proximas: 0,
    pctInasistencia: null, ultima: null, proxima: null,
  });
});

// ── Filtros ───────────────────────────────────────────────────────────────────
test('filtrarHistorial — corte por episodio: solo las citas de ese tramo', () => {
  const p = pac({ log: [finEp('2026-06-30', notaFin('Cervicalgia', 20))] });
  const eps = episodiosDePaciente(p);
  const citas = [cita('v1', '2026-06-10'), cita('v2', '2026-06-30'), cita('n1', '2026-07-05')];
  const mapa = mapaEps(citas, eps);
  assert.deepEqual(filtrarHistorial(citas, mapa, { corte: 1 }, HOY).map(c => c.id), ['v1', 'v2']);
  assert.deepEqual(filtrarHistorial(citas, mapa, { corte: 2 }, HOY).map(c => c.id), ['n1']);
  assert.deepEqual(filtrarHistorial(citas, mapa, { corte: 'all' }, HOY).map(c => c.id), ['v1', 'v2', 'n1']);
});

test('filtrarHistorial — mes y estado se combinan con el corte', () => {
  const citas = [
    cita('a1', '2026-08-03'), cita('a2', '2026-08-05', 9, 'noas'),
    cita('a3', '2026-07-20'), cita('a4', '2026-09-10', 9, 'pend'),
  ];
  const mapa = mapaEps(citas, episodiosDePaciente(pac()));
  assert.deepEqual(filtrarHistorial(citas, mapa, { mes: '2026-08' }, HOY).map(c => c.id), ['a1', 'a2']);
  assert.deepEqual(filtrarHistorial(citas, mapa, { estado: 'noas' }, HOY).map(c => c.id), ['a2']);
  assert.deepEqual(filtrarHistorial(citas, mapa, { mes: '2026-08', estado: 'asistio' }, HOY).map(c => c.id), ['a1']);
});

test('filtrarHistorial — los tres estados son una PARTICIÓN: suman el total', () => {
  const citas = [
    cita('a1', '2026-08-03'), cita('a2', '2026-08-05', 9, 'noas'),
    cita('a3', '2026-09-10', 9, 'pend'), cita('a4', '2026-09-12'),   // conf futura ("Agendada")
  ];
  const mapa = mapaEps(citas, episodiosDePaciente(pac()));
  const n = e => filtrarHistorial(citas, mapa, { estado: e }, HOY).length;
  assert.equal(n('asistio') + n('noas') + n('pend'), citas.length);
  assert.equal(n('pend'), 2, 'la conf futura cae en "Pendiente": ninguna fila queda sin pill');
});

// ── Agrupación por mes ────────────────────────────────────────────────────────
test('agruparPorMes — meses desc, citas desc dentro del mes, subtotales por mes', () => {
  const citas = [
    cita('a1', '2026-07-20'), cita('a2', '2026-08-03'), cita('a3', '2026-08-10'),
    cita('a4', '2026-08-12', 9, 'noas'),
  ];
  const grupos = agruparPorMes(citas, mapaEps(citas, episodiosDePaciente(pac())), HOY);
  assert.deepEqual(grupos.map(g => g.ym), ['2026-08', '2026-07']);
  assert.equal(grupos[0].label, 'Agosto 2026');
  assert.deepEqual(grupos[0].citas.map(c => c.id), ['a4', 'a3', 'a2'], 'la más nueva arriba');
  assert.equal(grupos[0].resumen.asistencias, 2);
  assert.equal(grupos[0].resumen.inasistencias, 1);
});

test('agruparPorMes — mes con DOS episodios: la fila de mes los lista ascendentes', () => {
  // El corte cae a mitad de agosto: el marcador del 2026-08-15 cierra el episodio 1, y la cita de
  // ese mismo día todavía es del episodio 1 (frontera estricta).
  const p = pac({ log: [finEp('2026-08-15', notaFin('Cervicalgia', 20))] });
  const eps = episodiosDePaciente(p);
  const citas = [cita('a1', '2026-08-10'), cita('a2', '2026-08-15'), cita('a3', '2026-08-20')];
  const grupos = agruparPorMes(citas, mapaEps(citas, eps), HOY);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].episodios, [1, 2]);
  assert.deepEqual(citas.map(c => episodioDeCita(c, eps)), [1, 1, 2]);
});

test('agruparPorMes — un solo episodio: la fila de mes no tiene nada que aclarar', () => {
  const citas = [cita('a1', '2026-08-10')];
  const grupos = agruparPorMes(citas, mapaEps(citas, episodiosDePaciente(pac())), HOY);
  assert.deepEqual(grupos[0].episodios, [1]);
});

// ── CSV ───────────────────────────────────────────────────────────────────────
test('filasCsvHistorial — cabecera fija y una fila por cita, con episodio y ordinal', () => {
  const p = pac();
  const eps = episodiosDePaciente(p);
  const citas = [cita('a1', '2026-08-03', 9.5), cita('a2', '2026-08-05', 9, 'noas')];
  const rows = filasCsvHistorial(citas, mapaEps(citas, eps), ordinalesHistorial(citas, eps),
    () => ({ name: 'Marco Barros' }), HOY);
  assert.deepEqual(rows[0], ['Fecha', 'Hora', 'Terapeuta', 'Tipo', 'Modalidad', 'Estado', 'Episodio', 'N_episodio', 'Notas']);
  assert.deepEqual(rows[1], ['2026-08-03', '9:30', 'Marco Barros', 'fisio', 'Centro', 'Asistió', 1, '1/15', '']);
  assert.deepEqual(rows[2], ['2026-08-05', '9:00', 'Marco Barros', 'fisio', 'Centro', 'No asistió', 1, '', ''],
    'la no-asistió va sin ordinal');
});

test('filasCsvHistorial — la nota no puede romper el CSV: sin saltos de línea ni comas', () => {
  const c = cita('a1', '2026-08-03', 9, 'conf', { note: 'linea1\nlinea2, con coma', location: 'domicilio' });
  const rows = filasCsvHistorial([c], new Map([[c, 1]]), new Map(), () => null, HOY);
  assert.equal(rows[1][8], 'linea1 linea2  con coma');
  assert.equal(rows[1][4], 'Domicilio');
  assert.equal(rows[1][2], '', 'sin terapeuta la celda va vacía, no "undefined"');
});

test('tipoAbbr — normaliza por el catálogo: lo desconocido cae al default', () => {
  assert.equal(tipoAbbr('Terapia respiratoria'), 'resp');
  assert.equal(tipoAbbr('Fisioterapia'), 'fisio');
  assert.equal(tipoAbbr(null), 'fisio');
  assert.equal(tipoAbbr('Cualquier cosa'), 'fisio');
});
