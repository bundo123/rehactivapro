// Tests del agregador de Seguimiento — node --test.
// La pestaña audita, para cada paciente ACTIVO, qué DÍAS se atendió y no quedó nada escrito en su
// historia. Lo que hay que blindar son las definiciones y, sobre todo, que el cruce sea día a día
// y no de totales: "4 citas / 4 sesiones" puede esconder que una sesión se escribió dos veces el
// martes y el jueves quedó vacío.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diasSinRegistro, detalleSeguimiento, filasSeguimiento,
  contarSeguimiento, pasaFiltroSeguimiento,
} from '../js/utils.js';

const HOY = '2026-08-12';

const pac = (id, extra = {}) => ({ id, name: 'Paciente ' + id, status: 'active', log: [], ...extra });
const cita = (id, patientId, date, extra = {}) =>
  ({ id, patientId, date, hour: 9, status: 'conf', therapistId: 't1', ...extra });
const sesion = (date, extra = {}) => ({ date, type: 'Fisioterapia', hour: '09:00:00', status: 'asistió', ...extra });
const evalIni = (date) => ({ date, type: 'Evaluación inicial', hour: '00:00', status: 'asistió' });
const finEp = (date) => ({ date, type: 'Fin de episodio', hour: '00:00', status: 'asistió' });

const fechas = (dias) => dias.map(d => d.date);
const fila = (filas, id) => filas.find(f => f.id === id);

// ── diasSinRegistro: el cruce día a día ───────────────────────────────────────
test('diasSinRegistro — día atendido sin ninguna entrada: sale con su therapistId', () => {
  const p = pac('p1');
  const citas = [cita('a1', 'p1', '2026-08-10', { therapistId: 'th-ana' })];
  assert.deepEqual(diasSinRegistro(p, citas, HOY), [{ date: '2026-08-10', therapistId: 'th-ana' }]);
});

test('diasSinRegistro — día cubierto por una sesión de ESE día: no falta', () => {
  const p = pac('p1', { log: [sesion('2026-08-10')] });
  assert.deepEqual(diasSinRegistro(p, [cita('a1', 'p1', '2026-08-10')], HOY), []);
});

test('diasSinRegistro — la EVALUACIÓN INICIAL cubre su día (es entrada clínica)', () => {
  const p = pac('p1', { log: [evalIni('2026-08-10')] });
  assert.deepEqual(diasSinRegistro(p, [cita('a1', 'p1', '2026-08-10')], HOY), []);
});

test('diasSinRegistro — "Fin de episodio" NO cubre: es marcador técnico, no documentación', () => {
  const p = pac('p1', { log: [finEp('2026-08-10')] });
  assert.deepEqual(fechas(diasSinRegistro(p, [cita('a1', 'p1', '2026-08-10')], HOY)), ['2026-08-10']);
});

test('diasSinRegistro — dos citas el MISMO día se cubren con una sola entrada de ese día', () => {
  const p = pac('p1', { log: [sesion('2026-08-10')] });
  const citas = [cita('a1', 'p1', '2026-08-10', { hour: 9 }), cita('a2', 'p1', '2026-08-10', { hour: 15 })];
  assert.deepEqual(diasSinRegistro(p, citas, HOY), []);
});

test('diasSinRegistro — una entrada de OTRO día no cubre el día atendido', () => {
  // El caso que motiva toda la pantalla: los totales cuadran (1 cita / 1 sesión) y aun así falta.
  const p = pac('p1', { log: [sesion('2026-08-11')] });
  assert.deepEqual(fechas(diasSinRegistro(p, [cita('a1', 'p1', '2026-08-10')], HOY)), ['2026-08-10']);
});

test('diasSinRegistro — dos sesiones el mismo día no cubren un segundo día atendido', () => {
  const p = pac('p1', { log: [sesion('2026-08-10'), sesion('2026-08-10', { hour: '15:00:00' })] });
  const citas = [cita('a1', 'p1', '2026-08-10'), cita('a2', 'p1', '2026-08-11')];
  assert.deepEqual(fechas(diasSinRegistro(p, citas, HOY)), ['2026-08-11']);
});

test('diasSinRegistro — paciente SIN citas pasadas: no falta nada', () => {
  assert.deepEqual(diasSinRegistro(pac('p1'), [], HOY), []);
  assert.deepEqual(diasSinRegistro(pac('p1'), [cita('a1', 'p1', '2026-09-30')], HOY), []);   // futura
});

test('diasSinRegistro — solo cuentan las conf con fecha ≤ hoy', () => {
  const p = pac('p1');
  const citas = [
    cita('a1', 'p1', '2026-08-05'),                      // conf pasada          → falta
    cita('a2', 'p1', HOY),                               // conf de hoy          → falta
    cita('a3', 'p1', '2026-08-06', { status: 'pend' }),  // pendiente            → no
    cita('a4', 'p1', '2026-08-07', { status: 'noas' }),  // no asistió           → no
    cita('a5', 'p1', '2026-09-01'),                      // conf futura          → no
  ];
  assert.deepEqual(fechas(diasSinRegistro(p, citas, HOY)), ['2026-08-05', HOY]);
});

test('diasSinRegistro — las citas de OTROS pacientes no entran', () => {
  const p = pac('p1');
  const citas = [cita('a1', 'p1', '2026-08-10'), cita('b1', 'p2', '2026-08-05')];
  assert.deepEqual(fechas(diasSinRegistro(p, citas, HOY)), ['2026-08-10']);
});

test('diasSinRegistro — ordenado por fecha, sin importar el orden del array', () => {
  const p = pac('p1');
  const citas = [cita('a3', 'p1', '2026-08-11'), cita('a1', 'p1', '2026-07-02'), cita('a2', 'p1', '2026-08-03')];
  assert.deepEqual(fechas(diasSinRegistro(p, citas, HOY)), ['2026-07-02', '2026-08-03', '2026-08-11']);
});

test('diasSinRegistro — el responsable del día es el terapeuta de la cita MÁS TEMPRANA', () => {
  const p = pac('p1');
  // El orden del array no debe cambiar quién queda como responsable.
  const tarde = cita('a2', 'p1', '2026-08-10', { hour: 16, therapistId: 'th-tarde' });
  const temprano = cita('a1', 'p1', '2026-08-10', { hour: 8, therapistId: 'th-manana' });
  assert.equal(diasSinRegistro(p, [tarde, temprano], HOY)[0].therapistId, 'th-manana');
  assert.equal(diasSinRegistro(p, [temprano, tarde], HOY)[0].therapistId, 'th-manana');
});

test('diasSinRegistro — cita sin terapeuta: therapistId null, no revienta', () => {
  const p = pac('p1');
  assert.deepEqual(diasSinRegistro(p, [cita('a1', 'p1', '2026-08-10', { therapistId: null })], HOY),
                   [{ date: '2026-08-10', therapistId: null }]);
});

test('diasSinRegistro — NO recorta por episodio: audita todo lo atendido', () => {
  const p = pac('p1', { log: [finEp('2026-07-30'), sesion('2026-08-10')] });
  const citas = [cita('a1', 'p1', '2026-06-15'), cita('a2', 'p1', '2026-08-10')];
  assert.deepEqual(fechas(diasSinRegistro(p, citas, HOY)), ['2026-06-15']);
});

test('diasSinRegistro — entradas nulas no explotan', () => {
  assert.deepEqual(diasSinRegistro(null, null, HOY), []);
  assert.deepEqual(diasSinRegistro(pac('p1'), [null, undefined, {}], HOY), []);
  assert.deepEqual(diasSinRegistro(pac('p1'), [cita('a1', 'p1', null)], HOY), []);
});

// ── detalleSeguimiento: lo que muestra la fila desplegable ────────────────────
test('detalleSeguimiento — una línea POR DÍA (no por cita), con estado y cuántas citas hubo', () => {
  const p = pac('p1', { log: [sesion('2026-08-10')] });
  const citas = [
    cita('a1', 'p1', '2026-08-10', { hour: 9 }),
    cita('a2', 'p1', '2026-08-10', { hour: 15, therapistId: 'th-otro' }),
    cita('a3', 'p1', '2026-08-11', { therapistId: 'th-b' }),
  ];
  assert.deepEqual(detalleSeguimiento(p, citas, HOY), [
    { date: '2026-08-10', therapistId: 't1',   registrado: true,  citas: 2 },
    { date: '2026-08-11', therapistId: 'th-b', registrado: false, citas: 1 },
  ]);
});

test('detalleSeguimiento — diasSinRegistro es exactamente su subconjunto no registrado', () => {
  const p = pac('p1', { log: [sesion('2026-08-05')] });
  const citas = [cita('a1', 'p1', '2026-08-05'), cita('a2', 'p1', '2026-08-07'), cita('a3', 'p1', '2026-08-09')];
  const det = detalleSeguimiento(p, citas, HOY);
  assert.deepEqual(
    det.filter(d => !d.registrado).map(({ date, therapistId }) => ({ date, therapistId })),
    diasSinRegistro(p, citas, HOY));
});

// ── filasSeguimiento: columnas, universo y orden ──────────────────────────────
test('filasSeguimiento — columnas: sesiones, citas pasadas y días sin registro', () => {
  // 3 citas pasadas en 2 días; el log tiene eval + 2 sesiones, pero una es de un día sin cita.
  const p = pac('p1', { log: [evalIni('2026-08-03'), sesion('2026-08-05'), sesion('2026-08-20')] });
  const citas = [
    cita('a1', 'p1', '2026-08-05', { hour: 9 }), cita('a2', 'p1', '2026-08-05', { hour: 15 }),
    cita('a3', 'p1', '2026-08-07'),
  ];
  const f = fila(filasSeguimiento([p], citas, HOY), 'p1');
  assert.equal(f.sesiones, 2);          // la eval no es sesión
  assert.equal(f.citasPasadas, 3);      // citas, no días
  assert.equal(f.diasSinRegistro, 1);   // el 07 quedó descubierto
  assert.equal(f.entradas, 3);          // eval + 2 sesiones
  assert.equal(f.detalle.length, 2);    // 2 días con cita pasada
});

test('filasSeguimiento — "Fin de episodio" no cuenta como sesión ni como entrada', () => {
  const f = fila(filasSeguimiento([pac('p1', { log: [finEp('2026-08-01')] })], [], HOY), 'p1');
  assert.equal(f.sesiones, 0);
  assert.equal(f.entradas, 0);
});

test('filasSeguimiento — solo pacientes ACTIVOS (alta médica e inactivos quedan fuera)', () => {
  const filas = filasSeguimiento(
    [pac('p1'), pac('p2', { status: 'alta' }), pac('p3', { status: 'inactive' })], [], HOY);
  assert.deepEqual(filas.map(f => f.id), ['p1']);
});

test('filasSeguimiento — orden: días faltantes desc, luego citas desc, luego nombre', () => {
  const a = pac('p1', { name: 'Uno' });                          // 2 días faltantes, 2 citas
  const b = pac('p2', { name: 'Dos' });                          // 1 día faltante, 3 citas
  const c = pac('p3', { name: 'Zeta', log: [sesion('2026-08-01')] });  // 0 faltantes, 1 cita
  const d = pac('p4', { name: 'Alfa', log: [sesion('2026-08-01')] });  // 0 faltantes, 1 cita
  const citas = [
    cita('a1', 'p1', '2026-08-01'), cita('a2', 'p1', '2026-08-02'),
    cita('b1', 'p2', '2026-08-03', { hour: 9 }), cita('b2', 'p2', '2026-08-03', { hour: 11 }), cita('b3', 'p2', '2026-08-03', { hour: 15 }),
    cita('c1', 'p3', '2026-08-01'), cita('d1', 'p4', '2026-08-01'),
  ];
  //  p1 (2 faltantes) → p2 (1 faltante) → empate en 0: p4 "Alfa" antes que p3 "Zeta"
  assert.deepEqual(filasSeguimiento([c, b, a, d], citas, HOY).map(f => f.id), ['p1', 'p2', 'p4', 'p3']);
});

test('filasSeguimiento — entradas nulas o incompletas no explotan', () => {
  assert.deepEqual(filasSeguimiento(null, null, HOY), []);
  assert.deepEqual(filasSeguimiento([null, undefined], [null], HOY), []);
  const f = fila(filasSeguimiento([{ id: 'p1', status: 'active' }], [{ patientId: null }, {}], HOY), 'p1');
  assert.equal(f.name, '');            // paciente sin nombre: string vacío, no undefined
  assert.equal(f.citasPasadas, 0);
  assert.equal(f.diasSinRegistro, 0);
  assert.deepEqual(f.detalle, []);
});

// ── Filtros y contadores ──────────────────────────────────────────────────────
test('pasaFiltroSeguimiento — "con" es ≥1 entrada clínica; "faltantes" es ≥1 día descubierto', () => {
  const citas = [cita('a1', 'p1', '2026-08-10')];
  const sinNada = fila(filasSeguimiento([pac('p1')], citas, HOY), 'p1');
  assert.equal(pasaFiltroSeguimiento(sinNada, 'con'), false);
  assert.equal(pasaFiltroSeguimiento(sinNada, 'faltantes'), true);

  const alDia = fila(filasSeguimiento([pac('p1', { log: [sesion('2026-08-10')] })], citas, HOY), 'p1');
  assert.equal(pasaFiltroSeguimiento(alDia, 'con'), true);
  assert.equal(pasaFiltroSeguimiento(alDia, 'faltantes'), false);
});

test('pasaFiltroSeguimiento — no son excluyentes: con historia Y con un día suelto sin registro', () => {
  const p = pac('p1', { log: [sesion('2026-08-05')] });
  const citas = [cita('a1', 'p1', '2026-08-05'), cita('a2', 'p1', '2026-08-07')];
  const f = fila(filasSeguimiento([p], citas, HOY), 'p1');
  assert.equal(pasaFiltroSeguimiento(f, 'con'), true);
  assert.equal(pasaFiltroSeguimiento(f, 'faltantes'), true);
});

test('pasaFiltroSeguimiento — un filtro desconocido no esconde filas (cae a "todos")', () => {
  const f = fila(filasSeguimiento([pac('p1')], [], HOY), 'p1');
  assert.equal(pasaFiltroSeguimiento(f, 'inventado'), true);
  assert.equal(pasaFiltroSeguimiento(f, undefined), true);
});

test('contarSeguimiento — cuenta cada filtro por separado', () => {
  const pacientes = [
    pac('p1'),                                                    // sin nada: solo faltantes
    pac('p2', { log: [sesion('2026-08-10')] }),                   // al día: solo con
    pac('p3', { log: [sesion('2026-08-05')] }),                   // con historia + 1 día suelto
    pac('p4', { log: [evalIni('2026-08-01')] }),                  // con historia, sin citas
  ];
  const citas = [
    cita('a1', 'p1', '2026-08-10'),
    cita('a2', 'p2', '2026-08-10'),
    cita('a3', 'p3', '2026-08-05'), cita('a4', 'p3', '2026-08-07'),
  ];
  assert.deepEqual(contarSeguimiento(filasSeguimiento(pacientes, citas, HOY)),
                   { con: 3, faltantes: 2, all: 4 });
});

test('contarSeguimiento — sin pacientes, todo en cero', () => {
  assert.deepEqual(contarSeguimiento([]), { con: 0, faltantes: 0, all: 0 });
  assert.deepEqual(contarSeguimiento(null), { con: 0, faltantes: 0, all: 0 });
});
