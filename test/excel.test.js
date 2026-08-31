// Tests del EXPORT A EXCEL — la geometría de js/excel-layout.js — con `node --test`.
//
// Lo que se cubre es el mapeo cita → (HOJA, FILA, BLOQUE), que es donde puede romperse el
// parecido con el archivo histórico de la clínica sin que nadie lo note hasta que la secretaria
// abre el .xlsx:
//  · HOJA: una por día CALENDARIO del rango, fines de semana incluidos, con el nombre "LUNES 3".
//  · FILA: la de la hora truncada (12:30 va a la fila de las 12), con la real en la celda HORA.
//  · BLOQUE: el terapeuta, en el orden de la agenda y dentro de la grilla de SU especialidad.
// Más los dos casos que el original nunca tuvo que resolver (dos citas en la misma hora, citas
// fuera de 07–19) y el filtro por terapeuta.
//
// El módulo bajo test es PURO: no importa exceljs, ni el DOM, ni `state`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRILLA, RESUMEN, PRIMERA_HORA, COLS_BLOQUE, ESTADOS_EXPORTABLES, PALETA_HISTORICA,
  COLS_RELLENO_PEND, llevaRellenoPend,
  diasDelRango, nombreHoja, nombresHojaUnicos, tituloHoja, colBloque, colGranTotal, letraCol,
  horaExcel, agruparPorEspecialidad, mapearCitasAFilas, planificarDia, nombreArchivo,
  esMesCompleto, aFecha, aISO,
} from '../js/excel-layout.js';

// Terapeutas como los deja orderedTherapists(): ya ordenados, con specialty normalizada.
const TH = [
  { id: 't1', name: 'Marco Barros',   specialty: 'fisica',       colorId: 'ca' },
  { id: 't2', name: 'Axel Escobar',   specialty: 'fisica',       colorId: 'cb' },
  { id: 't3', name: 'Josselyn Checa', specialty: 'fisica',       colorId: 'cd' },
  { id: 'r1', name: 'Mariuxi Cuesta', specialty: 'respiratoria', colorId: 'cc' },
  { id: 'r2', name: 'Karina Andrade', specialty: 'respiratoria', colorId: 'ce' },
];
const cita = (id, date, therapistId, hour, status = 'conf') =>
  ({ id, date, therapistId, hour, status, paciente: 'PACIENTE ' + id, numero: 1, lugar: 'C' });

// ── HOJA: una por día calendario ────────────────────────────────────────────────────────────
test('diasDelRango — incluye los dos extremos y NO salta sábados ni domingos', () => {
  // 2026-08-01 es sábado y 2026-08-02 domingo: el archivo histórico los trae con citas reales.
  const d = diasDelRango('2026-07-31', '2026-08-03');
  assert.deepEqual(d, ['2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03']);
});

test('diasDelRango — un solo día devuelve una hoja; rango invertido devuelve vacío', () => {
  assert.deepEqual(diasDelRango('2026-08-10', '2026-08-10'), ['2026-08-10']);
  assert.deepEqual(diasDelRango('2026-08-10', '2026-08-09'), []);
  assert.deepEqual(diasDelRango('', '2026-08-09'), []);
});

test('diasDelRango — un mes completo son 31 hojas y cruza el cambio de mes', () => {
  assert.equal(diasDelRango('2026-08-01', '2026-08-31').length, 31);
  assert.deepEqual(diasDelRango('2026-08-30', '2026-09-01'), ['2026-08-30', '2026-08-31', '2026-09-01']);
});

test('nombreHoja / tituloHoja — el formato exacto del histórico, sin tildes y sin cero a la izquierda', () => {
  assert.equal(nombreHoja('2026-08-03'), 'LUNES 3');
  assert.equal(nombreHoja('2026-08-01'), 'SABADO 1');
  assert.equal(nombreHoja('2026-08-02'), 'DOMINGO 2');
  assert.equal(nombreHoja('2026-08-05'), 'MIERCOLES 5');
  assert.equal(nombreHoja('2026-08-31'), 'LUNES 31');
  // En el título el día SÍ va con cero: "LUNES 03 DE AGOSTO DEL 2026" (celda A3 del original).
  assert.equal(tituloHoja('2026-08-03'), 'LUNES 03 DE AGOSTO DEL 2026');
  assert.equal(tituloHoja('2026-08-01'), 'SABADO 01 DE AGOSTO DEL 2026');
});

test('nombresHojaUnicos — Excel no admite pestañas repetidas: un rango largo se desempata por mes', () => {
  // 2026-02-02 y 2026-03-02 son los dos lunes 2.
  const dias = ['2026-02-02', '2026-03-02'];
  assert.deepEqual(nombresHojaUnicos(dias), ['LUNES 2', 'LUNES 2 MAR']);
  // Dentro de un mismo mes nunca se repite: los nombres quedan idénticos a los del histórico.
  const agosto = nombresHojaUnicos(diasDelRango('2026-08-01', '2026-08-31'));
  assert.equal(new Set(agosto).size, 31);
  assert.equal(agosto[2], 'LUNES 3');
});

test('aFecha / aISO — ida y vuelta sin correrse de día (se construye al mediodía local)', () => {
  assert.equal(aISO(aFecha('2026-08-03')), '2026-08-03');
  assert.equal(aISO(aFecha('2026-01-01')), '2026-01-01');
  assert.equal(aFecha('no-es-fecha'), null);
});

// ── BLOQUE: columnas del terapeuta ──────────────────────────────────────────────────────────
test('colBloque — bloques de 5 columnas: A, F, K, P, U, Z, AE (los del original)', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(colBloque), [1, 6, 11, 16, 21, 26, 31]);
  assert.deepEqual([1, 6, 11, 16, 21, 26, 31].map(letraCol), ['A', 'F', 'K', 'P', 'U', 'Z', 'AE']);
  assert.equal(COLS_BLOQUE, 5);
});

test('colGranTotal — con los 7 bloques del histórico cae en AK, dejando AJ de aire', () => {
  assert.equal(letraCol(colGranTotal(7)), 'AK');
  // La 5ª columna del último bloque es AI; el gran total NO va pegado, va una más allá.
  assert.equal(letraCol(colBloque(6) + COLS_BLOQUE - 1), 'AI');
  assert.equal(letraCol(colGranTotal(1)), 'G');
});

test('agruparPorEspecialidad — conserva el orden de la agenda y manda lo desconocido a física', () => {
  const g = agruparPorEspecialidad([...TH, { id: 'x', name: 'Sin espec.', specialty: null }]);
  assert.deepEqual(g.fisica.map(t => t.id), ['t1', 't2', 't3', 'x']);
  assert.deepEqual(g.respiratoria.map(t => t.id), ['r1', 'r2']);
});

// ── FILA: la hora ───────────────────────────────────────────────────────────────────────────
test('horaExcel — fracción de día, que es como Excel guarda una hora de verdad', () => {
  assert.equal(horaExcel(7), 7 / 24);          // 0.29166… — el A7 del original
  assert.equal(horaExcel(12.5), 12.5 / 24);    // 12:30
  assert.equal(horaExcel(null), 0);
});

test('mapearCitasAFilas — la hora en punto va a su fila (07:00 → 7, 19:00 → 19)', () => {
  const g = GRILLA.fisica;
  const { filas } = mapearCitasAFilas([cita('a', '2026-08-03', 't1', 7), cita('b', '2026-08-03', 't1', 19)], g);
  assert.equal(filas.get(7).id, 'a');
  assert.equal(filas.get(19).id, 'b');
  assert.equal(g.filaPrimera, 7);
  assert.equal(g.filaUltima, 19);
});

test('mapearCitasAFilas — hora NO en punto: fila de la hora truncada, la real queda en la cita', () => {
  // Es literalmente el caso A12='12:30:00' del archivo viejo: la fila es la de las 12.
  const { filas } = mapearCitasAFilas([cita('a', '2026-08-03', 't1', 12.5)], GRILLA.fisica);
  assert.equal(filas.get(12).id, 'a');
  assert.equal(filas.get(12).hour, 12.5);      // la hora real no se redondea: la pinta la celda HORA
  assert.equal(filas.size, 1);
});

test('mapearCitasAFilas — dos citas en la misma hora no se pisan: la segunda baja una fila', () => {
  const { filas, sobrantes } = mapearCitasAFilas([
    cita('b', '2026-08-03', 't1', 7.5),
    cita('a', '2026-08-03', 't1', 7),
  ], GRILLA.fisica);
  assert.equal(filas.get(7).id, 'a');          // 07:00 primero, aunque llegó segunda en la lista
  assert.equal(filas.get(8).id, 'b');          // 07:30 baja, y su celda HORA seguirá diciendo 7:30
  assert.equal(sobrantes.length, 0);
});

test('mapearCitasAFilas — fuera de 07:00–19:59 se ancla al extremo en vez de perderse', () => {
  const { filas, sobrantes } = mapearCitasAFilas([
    cita('temprano', '2026-08-03', 't1', 6),
    cita('tarde', '2026-08-03', 't1', 21),
  ], GRILLA.fisica);
  assert.equal(filas.get(7).id, 'temprano');
  assert.equal(filas.get(19).id, 'tarde');
  assert.equal(sobrantes.length, 0);
});

test('mapearCitasAFilas — más de 13 citas en un día: se llenan las filas y el resto se reporta', () => {
  const muchas = [];
  for (let i = 0; i < 15; i++) muchas.push(cita('c' + i, '2026-08-03', 't1', 7 + i * 0.25));
  const { filas, sobrantes } = mapearCitasAFilas(muchas, GRILLA.fisica);
  assert.equal(filas.size, 13);                // 7..19
  assert.equal(sobrantes.length, 2);           // nunca se pierden en silencio
});

test('mapearCitasAFilas — la grilla respiratoria usa sus propias filas (24–36)', () => {
  const g = GRILLA.respiratoria;
  const { filas } = mapearCitasAFilas([cita('a', '2026-08-03', 'r1', 7), cita('b', '2026-08-03', 'r1', 12.5)], g);
  assert.equal(filas.get(24).id, 'a');
  assert.equal(filas.get(29).id, 'b');         // 24 + (12 - 7)
  assert.equal(g.filaSumas, 37);
});

// ── El plan completo: hoja + fila + bloque a la vez ─────────────────────────────────────────
test('planificarDia — cada cita cae en la hoja, la fila y el bloque que le tocan', () => {
  const citas = [
    cita('a', '2026-08-03', 't1', 7),      // Marco, bloque 0 (col A), fila 7
    cita('b', '2026-08-03', 't3', 12.5),   // Josselyn, bloque 2 (col K), fila 12
    cita('c', '2026-08-03', 'r2', 9),      // Karina Andrade, bloque 1 resp (col F), fila 26
    cita('z', '2026-08-04', 't1', 7),      // otro día: no entra en esta hoja
  ];
  const p = planificarDia({ fecha: '2026-08-03', citas, terapeutas: TH });
  assert.equal(p.hoja, 'LUNES 3');
  assert.equal(p.titulo, 'LUNES 03 DE AGOSTO DEL 2026');

  const [b0, b1, b2] = p.rejillas.fisica;
  assert.equal(b0.colBase, 1);  assert.equal(letraCol(b0.colBase), 'A');
  assert.equal(b1.colBase, 6);  assert.equal(letraCol(b1.colBase), 'F');
  assert.equal(b2.colBase, 11); assert.equal(letraCol(b2.colBase), 'K');
  assert.equal(b0.filas.get(7).id, 'a');
  assert.equal(b1.filas.size, 0);                 // Axel no tiene citas: su bloque va vacío igual
  assert.equal(b2.filas.get(12).id, 'b');

  const [r0, r1] = p.rejillas.respiratoria;
  assert.equal(r0.filas.size, 0);
  assert.equal(letraCol(r1.colBase), 'F');
  assert.equal(r1.filas.get(26).id, 'c');         // 24 + (9 - 7)
});

test('planificarDia — todos los terapeutas tienen bloque aunque el día esté vacío', () => {
  const p = planificarDia({ fecha: '2026-08-02', citas: [], terapeutas: TH });
  assert.equal(p.hoja, 'DOMINGO 2');
  assert.equal(p.rejillas.fisica.length, 3);
  assert.equal(p.rejillas.respiratoria.length, 2);
  assert.ok(p.rejillas.fisica.every(b => b.filas.size === 0));
});

test('planificarDia — las canceladas (cualquier estado fuera del catálogo) no se exportan', () => {
  assert.deepEqual(ESTADOS_EXPORTABLES, ['conf', 'pend', 'noas']);
  const citas = [
    cita('ok', '2026-08-03', 't1', 8, 'conf'),
    cita('pc', '2026-08-03', 't1', 9, 'pend'),
    cita('na', '2026-08-03', 't1', 10, 'noas'),
    cita('xx', '2026-08-03', 't1', 11, 'cancelada'),
  ];
  const p = planificarDia({ fecha: '2026-08-03', citas, terapeutas: TH });
  const ids = [...p.rejillas.fisica[0].filas.values()].map(c => c.id);
  assert.deepEqual(ids.sort(), ['na', 'ok', 'pc']);
});

test('planificarDia — filtro por terapeuta: solo su bloque, y solo en SU grilla', () => {
  const citas = [cita('a', '2026-08-03', 't3', 9), cita('c', '2026-08-03', 'r1', 9)];
  // El modal pasa la lista ya filtrada, como hace generarExcel().
  const p = planificarDia({ fecha: '2026-08-03', citas, terapeutas: TH.filter(t => t.id === 't3') });
  assert.equal(p.rejillas.fisica.length, 1);
  assert.equal(p.rejillas.respiratoria.length, 0);
  assert.equal(letraCol(p.rejillas.fisica[0].colBase), 'A');   // pasa a ser el PRIMER bloque
  assert.equal(p.rejillas.fisica[0].filas.get(9).id, 'a');
  // Con un solo bloque el gran total del día se corre a G, no deja de existir.
  assert.equal(letraCol(colGranTotal(1)), 'G');
});

test('planificarDia — un terapeuta respiratorio filtrado deja la grilla física vacía', () => {
  const p = planificarDia({ fecha: '2026-08-03', citas: [], terapeutas: TH.filter(t => t.id === 'r1') });
  assert.equal(p.rejillas.fisica.length, 0);
  assert.equal(p.rejillas.respiratoria.length, 1);
});

// ── Relleno de 'por confirmar' ──────────────────────────────────────────────────────────────
test("'por confirmar' NO pinta la 5ª columna del bloque (ni la de HORA)", () => {
  // En el archivo histórico el ámbar no baña la fila: en MIERCOLES 5, la cita por confirmar de L7
  // deja O7 —la 5ª columna— con el estilo neutro (xf24, patternType="none"), y lo mismo Q17 con
  // T17. Si esto se rompe, la columna que suman las filas 20/37 aparece teñida en toda la grilla.
  assert.deepEqual(COLS_RELLENO_PEND, [1, 2, 3]);          // PACIENTE, N°, LUGAR
  assert.equal(llevaRellenoPend(0), false);                // HORA
  assert.equal(llevaRellenoPend(1), true);                 // PACIENTE
  assert.equal(llevaRellenoPend(2), true);                 // N°
  assert.equal(llevaRellenoPend(3), true);                 // LUGAR
  assert.equal(llevaRellenoPend(4), false);                // 5ª columna: la de las sumas
  // El bloque tiene 5 columnas y solo 3 se rellenan: las otras dos son las de los extremos.
  assert.equal(COLS_BLOQUE - COLS_RELLENO_PEND.length, 2);
});

// ── Nombre del archivo ──────────────────────────────────────────────────────────────────────
test('esMesCompleto — solo del día 1 al último del MISMO mes', () => {
  assert.equal(esMesCompleto('2026-08-01', '2026-08-31'), true);
  assert.equal(esMesCompleto('2026-02-01', '2026-02-28'), true);   // 2026 no es bisiesto
  assert.equal(esMesCompleto('2026-08-01', '2026-08-30'), false);
  assert.equal(esMesCompleto('2026-08-02', '2026-08-31'), false);
  assert.equal(esMesCompleto('2026-08-01', '2026-09-30'), false);
});

test('nombreArchivo — el mes completo conserva EXACTAMENTE el nombre del histórico', () => {
  assert.equal(nombreArchivo('2026-08-01', '2026-08-31'), '2026-08.xlsx');
  assert.equal(nombreArchivo('2026-08-03', '2026-08-03'), 'agenda_2026-08-03.xlsx');
  assert.equal(nombreArchivo('2026-08-03', '2026-08-09'), 'agenda_2026-08-03_a_2026-08-09.xlsx');
});

test('nombreArchivo — con filtro por terapeuta, sufijo con el nombre en slug (sin tildes)', () => {
  assert.equal(nombreArchivo('2026-08-01', '2026-08-31', 'Josselyn Checa'), '2026-08_josselyn-checa.xlsx');
  assert.equal(nombreArchivo('2026-08-03', '2026-08-03', 'Antonio Solís'), 'agenda_2026-08-03_antonio-solis.xlsx');
});

// ── Constantes que tienen que seguir siendo las del original ────────────────────────────────
test('la geometría es la del archivo histórico (filas 5/6/7–19/20 y 22/23/24–36/37)', () => {
  assert.deepEqual(GRILLA.fisica, { filaNombres: 5, filaHeaders: 6, filaPrimera: 7, filaUltima: 19, filaSumas: 20, colorTotal: 'FFFFC000' });
  assert.deepEqual(GRILLA.respiratoria, { filaNombres: 22, filaHeaders: 23, filaPrimera: 24, filaUltima: 36, filaSumas: 37, colorTotal: 'FF00B0F0' });
  assert.equal(RESUMEN.filaHeaders, 40);
  assert.equal(RESUMEN.filaPrimera, 41);
  // 7 filas de terapeuta ⇒ TOTAL en 48 y gran total en 49, como en el original.
  assert.equal(RESUMEN.filaPrimera + RESUMEN.filasMinimas, 48);
  assert.equal(PRIMERA_HORA, 7);
  assert.deepEqual(PALETA_HISTORICA, ['DAF2D0', 'CAEDFB', 'F2CEEF', 'D0D0D0', 'C0E6F5', 'FBE2D5', 'C1F0C8']);
});
