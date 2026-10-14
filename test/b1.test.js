// Tests del lote B1 — node --test. Lógica pura, sin DOM, con datos ficticios.
//  · ORD-1: orden médica (ordenAplicable, ordenVencida, textoOrden, validarOrden, ordenAgotada),
//    su fila en «Datos del paciente», la alerta de vencida y la regla «renovar» del pedido sugerido.
//  · CAMPOS-1: sexo, diagnósticos secundarios y registro profesional bajo la firma; prompt IA por sexo.
//  · INF-2b: «Ninguna», «(normal X°)» y «Fisioterapeuta» / «Fisioterapeutas».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenAplicable, ordenVencida, textoOrden, validarOrden, ordenAgotada } from '../js/orden-medica.js';
import { mapOrdenRow, ordenarOrdenes, agregarDiagSec, mapTherapistRow } from '../js/utils.js';
import { resumenMedico, pedidoSugerido } from '../js/resumen-medico.js';
import { buildPdfHtml, filasDatosPaciente } from '../js/informe-doc.js';
import { promptInformePaciente } from '../js/prompt-informe.js';

const HOY = '2026-10-14';
const ses = (fecha, pb, pa) => ({ fecha, pb, pa, tipo: 'Fisioterapia', terapeuta: 'Ana' });
const ORDEN = { fecha: '2026-09-05', doctor: 'Dr. Médico Demo (Traumatología)', sesiones: 12, vigenciaHasta: '2026-12-05', nota: null };
const modelo = (over = {}) => {
  const m = {
    numero: 'INF-20261014-0930-ABCD', fechaLarga: '14 de octubre de 2026', emitido: HOY,
    paciente: { nombre: 'Paciente Ficticia', cedula: '1700000000', edad: '14/05/1978 (48 años)', edadCorta: '48 años',
      diagnostico: 'Lumbalgia (CIE-10: M54.5)', diag: 'Lumbalgia', cie10: 'M54.5', cie10Desc: 'Lumbago no especificado' },
    doctor: 'Dr. Médico Demo (Traumatología)', alta: false, proximaCita: '2026-10-16', pedido: null,
    terapeutas: ['Ana'], inicio: '2026-09-01', protocolo: null, tipoTerapia: 'Fisioterapia', narrativa: [],
    firmante: 'Ana', firmanteCargo: 'Fisioterapeuta',
    evalInicial: { fecha: '2026-09-01', pb: 7, partes: [], rom: null },
    sesiones: [ses('2026-09-02', 7, 6), ses('2026-09-04', 6, 6), ses('2026-09-08', 6, 5), ses('2026-09-10', 5, 5), ses('2026-09-15', 5, 4), ses('2026-10-10', 4, 4)],
    metricas: { done: 6, sessions: 12, pct: 50, previas: 0, adh: 100, asistidas: 6, totalCitas: 6, faltas: 0, evaHas: true, evaInicial: 7, evaActual: 4 },
  };
  return { ...m, ...over, paciente: { ...m.paciente, ...(over.paciente || {}) }, metricas: { ...m.metricas, ...(over.metricas || {}) } };
};
const linea = (rm, k) => rm.lineas.find(l => l.k === k)?.t;
const claves = f => f.map(x => x.k);

// ── ORD-1: qué orden aplica ──
test('ordenAplicable — sin órdenes null; la más reciente con fecha <= fin; ignora las posteriores; desempate por createdAt', () => {
  assert.equal(ordenAplicable([], HOY), null);
  assert.equal(ordenAplicable(undefined, HOY), null);
  const ords = [
    { id: 'a', fecha: '2026-08-01', createdAt: '2026-08-01T10:00:00Z' },
    { id: 'b', fecha: '2026-09-05', createdAt: '2026-09-05T10:00:00Z' },
    { id: 'c', fecha: '2026-11-01', createdAt: '2026-11-01T10:00:00Z' },
  ];
  assert.equal(ordenAplicable(ords, HOY).id, 'b');
  assert.equal(ordenAplicable(ords, '2026-09-05').id, 'b');      // el mismo día ya vale
  assert.equal(ordenAplicable(ords, '2026-09-04').id, 'a');
  assert.equal(ordenAplicable(ords, '2026-07-31'), null);         // todas posteriores
  const mismoDia = [...ords, { id: 'd', fecha: '2026-09-05', createdAt: '2026-09-05T15:00:00Z' }];
  assert.equal(ordenAplicable(mismoDia, HOY).id, 'd');
  assert.equal(ordenAplicable([mismoDia[3], mismoDia[1]], HOY).id, 'd');   // no depende del orden de entrada
  assert.equal(ordenAplicable(ords, new Date(2026, 9, 14)).id, 'b');        // acepta Date
});

test('ordenVencida — vigencia anterior a hoy; el último día todavía vale; sin vigencia nunca vence', () => {
  assert.equal(ordenVencida({ vigenciaHasta: '2026-10-13' }, HOY), true);
  assert.equal(ordenVencida({ vigenciaHasta: '2026-10-14' }, HOY), false);
  assert.equal(ordenVencida({ vigenciaHasta: null }, HOY), false);
  assert.equal(ordenVencida(null, HOY), false);
  assert.equal(ordenVencida({ vigenciaHasta: '2026-10-13' }, new Date(2026, 9, 14)), true);
});

test('textoOrden — completa, sin médico, sin vigencia, singular; sin orden vacío', () => {
  assert.equal(textoOrden(ORDEN), 'del 05/09/2026 · Dr. Médico Demo (Traumatología) · 12 sesiones autorizadas · vigente hasta 05/12/2026');
  assert.equal(textoOrden({ ...ORDEN, doctor: null }), 'del 05/09/2026 · 12 sesiones autorizadas · vigente hasta 05/12/2026');
  assert.equal(textoOrden({ ...ORDEN, vigenciaHasta: null }), 'del 05/09/2026 · Dr. Médico Demo (Traumatología) · 12 sesiones autorizadas');
  assert.equal(textoOrden({ fecha: '2026-09-05', sesiones: 1 }), 'del 05/09/2026 · 1 sesión autorizada');
  assert.equal(textoOrden(null), '');
  assert.equal(textoOrden(undefined), '');
});

test('validarOrden — espejo de los CHECK: fecha, sesiones 1..200, vigencia >= fecha, nota <= 300', () => {
  assert.deepEqual(validarOrden({ fecha: '2026-09-05', sesiones: '12', vigenciaHasta: '2026-12-05', nota: '' }), {});
  assert.deepEqual(validarOrden({ fecha: '2026-09-05', sesiones: 12, vigenciaHasta: '2026-09-05' }), {});
  assert.deepEqual(Object.keys(validarOrden({ fecha: '', sesiones: '12' })), ['fecha']);
  for (const s of ['0', '201', '1.5', '', 'x']) assert.ok(validarOrden({ fecha: '2026-09-05', sesiones: s }).sesiones, `sesiones ${s}`);
  assert.ok(validarOrden({ fecha: '2026-09-05', sesiones: '200' }).sesiones === undefined);
  assert.ok(validarOrden({ fecha: '2026-09-05', sesiones: '12', vigenciaHasta: '2026-09-04' }).vigencia);
  assert.ok(validarOrden({ fecha: '2026-09-05', sesiones: '12', nota: 'x'.repeat(301) }).nota);
  assert.equal(validarOrden({ fecha: '2026-09-05', sesiones: '12', nota: 'x'.repeat(300) }).nota, undefined);
});

test('ordenAgotada — usa las sesiones desde la orden (usadas) y, si no vienen, el done del período', () => {
  assert.equal(ordenAgotada({ sesiones: 12 }, 12), true);
  assert.equal(ordenAgotada({ sesiones: 12 }, 11), false);
  assert.equal(ordenAgotada({ sesiones: 10, usadas: 3 }, 25), false);   // orden renovada: lo de antes no cuenta
  assert.equal(ordenAgotada({ sesiones: 10, usadas: 10 }, 3), true);
  assert.equal(ordenAgotada(null, 99), false);
});

test('mapOrdenRow / ordenarOrdenes — fila de pedidos_medicos → memoria; por fecha y alta asc', () => {
  const r = { id: 'u1', patient_id: 'p1', doctor_id: null, fecha: '2026-09-05', sesiones_autorizadas: 12, vigencia_hasta: null, nota: null, created_at: '2026-09-05T10:00:00Z' };
  assert.deepEqual(mapOrdenRow(r), { id: 'u1', doctorId: null, fecha: '2026-09-05', sesiones: 12, vigenciaHasta: null, nota: '', createdAt: '2026-09-05T10:00:00Z' });
  const l = ordenarOrdenes([{ id: 3, fecha: '2026-10-01', createdAt: 'b' }, { id: 1, fecha: '2026-09-01', createdAt: 'z' }, { id: 2, fecha: '2026-10-01', createdAt: 'a' }]);
  assert.deepEqual(l.map(x => x.id), [1, 2, 3]);
  assert.deepEqual(ordenarOrdenes(undefined), []);
});

// ── CAMPOS-1 ──
test('agregarDiagSec — suma sin repetidos, distinto del principal, máximo 5', () => {
  const it = c => ({ c, d: 'Desc ' + c });
  let r = agregarDiagSec(null, it('M54.5'), 'M51.1');
  assert.deepEqual(r, { lista: [{ c: 'M54.5', d: 'Desc M54.5' }], error: null });
  assert.match(agregarDiagSec(r.lista, it('M54.5'), 'M51.1').error, /ya está en la lista/);
  assert.match(agregarDiagSec(r.lista, it('M51.1'), 'M51.1').error, /diagnóstico principal/);
  let lista = [];
  for (const c of ['A1', 'A2', 'A3', 'A4', 'A5']) lista = agregarDiagSec(lista, it(c), null).lista;
  assert.equal(lista.length, 5);
  r = agregarDiagSec(lista, it('A6'), null);
  assert.match(r.error, /Máximo 5/);
  assert.equal(r.lista.length, 5);
});

test('mapTherapistRow — registro profesional ("" sin dato)', () => {
  assert.equal(mapTherapistRow({ id: 't', name: 'Ana Demo', registro: '1234-56-7890' }).registro, '1234-56-7890');
  assert.equal(mapTherapistRow({ id: 't', name: 'Ana Demo' }).registro, '');
});

// ── Datos del paciente ──
test('Datos del paciente — Sexo después de la fecha de nacimiento (F/M); sin sexo no hay fila', () => {
  const f = filasDatosPaciente(modelo({ paciente: { sexo: 'F' } }));
  assert.deepEqual(claves(f).slice(2, 5), ['Fecha de nacimiento', 'Sexo', 'Diagnóstico principal']);
  assert.equal(f.find(x => x.k === 'Sexo').v, 'Femenino');
  assert.equal(filasDatosPaciente(modelo({ paciente: { sexo: 'M' } })).find(x => x.k === 'Sexo').v, 'Masculino');
  assert.equal(claves(filasDatosPaciente(modelo())).includes('Sexo'), false);
  assert.equal(claves(filasDatosPaciente(modelo({ paciente: { sexo: null } }))).includes('Sexo'), false);
});

test('Datos del paciente — diagnósticos secundarios a lo ancho, separados por «; »; con null no sale', () => {
  const f = filasDatosPaciente(modelo({ paciente: { diagSec: [{ c: 'M54.2', d: 'Cervicalgia' }, { c: 'M25.5', d: 'Dolor en articulación' }] } }));
  const i = claves(f).indexOf('Diagnósticos secundarios');
  assert.equal(claves(f)[i - 1], 'Diagnóstico principal');
  assert.equal(f[i].v, 'M54.2 — Cervicalgia; M25.5 — Dolor en articulación');
  assert.equal(f[i].ancho, true);
  assert.equal(claves(filasDatosPaciente(modelo({ paciente: { diagSec: null } }))).includes('Diagnósticos secundarios'), false);
});

test('Datos del paciente — «Orden médica» después de «Médico referente», a lo ancho; sin orden no sale', () => {
  const f = filasDatosPaciente(modelo({ orden: ORDEN }));
  const i = claves(f).indexOf('Orden médica');
  assert.equal(claves(f)[i - 1], 'Médico referente');
  assert.equal(f[i].v, 'del 05/09/2026 · Dr. Médico Demo (Traumatología) · 12 sesiones autorizadas · vigente hasta 05/12/2026');
  assert.equal(f[i].ancho, true);
  assert.equal(claves(filasDatosPaciente(modelo())).includes('Orden médica'), false);
  assert.equal(claves(filasDatosPaciente(modelo({ orden: null }))).includes('Orden médica'), false);
});

test('Datos del paciente — «Fisioterapeuta» con uno, «Fisioterapeutas» con varios (INF-2b)', () => {
  assert.equal(filasDatosPaciente(modelo()).find(x => /^Fisioterapeuta/.test(x.k)).k, 'Fisioterapeuta');
  const f = filasDatosPaciente(modelo({ terapeutas: ['Ana', 'Luis'] }));
  assert.deepEqual(f.find(x => /^Fisioterapeuta/.test(x.k)), { k: 'Fisioterapeutas', v: 'Ana, Luis', ancho: false });
});

test('PDF — «Registro profesional: …» bajo la firma con firmanteRegistro; sin él, nada', () => {
  const con = buildPdfHtml(modelo({ firmanteRegistro: '1234-56-7890 (ACESS)' }), { hoy: HOY });
  assert.match(con, /<div class="firma-cargo">Fisioterapeuta · Rehactiva<\/div><div class="firma-cargo">Registro profesional: 1234-56-7890 \(ACESS\)<\/div>/);
  assert.doesNotMatch(buildPdfHtml(modelo(), { hoy: HOY }), /Registro profesional/);
  // Las filas nuevas llegan al PDF.
  const pdf = buildPdfHtml(modelo({ orden: ORDEN, paciente: { sexo: 'F', diagSec: [{ c: 'M54.2', d: 'Cervicalgia' }] } }), { hoy: HOY });
  assert.match(pdf, /<div class="ficha-f"><b>Sexo:<\/b> Femenino<\/div>/);
  assert.match(pdf, /<div class="ficha-f ancho"><b>Diagnósticos secundarios:<\/b> M54\.2 — Cervicalgia<\/div>/);
  assert.match(pdf, /<div class="ficha-f ancho"><b>Orden médica:<\/b> del 05\/09\/2026 · Dr\. Médico Demo \(Traumatología\) · 12 sesiones autorizadas/);
});

// ── Resumen para el médico ──
test('ALERTAS — «orden médica vencida el dd/mm/aaaa»; «Ninguna» sin alertas', () => {
  assert.equal(linea(resumenMedico(modelo(), HOY), 'Alertas'), 'Ninguna');
  assert.equal(linea(resumenMedico(modelo({ orden: ORDEN }), HOY), 'Alertas'), 'Ninguna');
  const rm = resumenMedico(modelo({ orden: { ...ORDEN, vigenciaHasta: '2026-10-01' } }), HOY);
  assert.equal(linea(rm, 'Alertas'), 'orden médica vencida el 01/10/2026');
  // Va antes de las inasistencias y cuenta para el máximo de 2.
  const rm2 = resumenMedico(modelo({ orden: { ...ORDEN, vigenciaHasta: '2026-10-01' }, metricas: { faltas: 3, previas: 2 } }), HOY);
  assert.equal(linea(rm2, 'Alertas'), 'orden médica vencida el 01/10/2026 · 3 inasistencias');
});

test('MEDIDAS — ROM clave con «(normal X°)» (INF-2b)', () => {
  const evalRom = [{ j: 'tobillo', m: 'dorsiflex', l: 'D', v: 10 }];
  const sesiones = modelo().sesiones.map((s, i) => i === 4 ? { ...s, rom: [{ j: 'tobillo', m: 'dorsiflex', l: 'D', v: 15 }] } : s);
  const ev = { fecha: '2026-09-01', pb: 7, partes: [], rom: evalRom };
  assert.match(linea(resumenMedico(modelo({ evalInicial: ev, sesiones }), HOY), 'Medidas'), /ROM clave: Tobillo D dorsiflexión 10° → 15° \(normal 20°\)/);
  assert.match(linea(resumenMedico(modelo({ evalInicial: ev }), HOY), 'Medidas'), /ROM clave: Tobillo D dorsiflexión 10° \(normal 20°; sin re-medición\)/);
});

test('pedidoSugerido — «renovar» con la orden agotada o vencida y el plan incompleto; alta y reevaluar siguen ganando', () => {
  const met = { done: 6, sessions: 12 };
  assert.deepEqual(pedidoSugerido('EN_CURSO', met, { sesiones: 6 }, HOY), { tipo: 'renovar' });            // agotada (done ≥ sesiones)
  assert.deepEqual(pedidoSugerido('MEJORA', met, { sesiones: 6 }, HOY), { tipo: 'renovar' });              // aunque mejore
  assert.deepEqual(pedidoSugerido('EN_CURSO', met, { sesiones: 12, vigenciaHasta: '2026-12-05' }, HOY), { tipo: 'nada' });   // vigente, plan 50 %
  assert.deepEqual(pedidoSugerido('EN_CURSO', met, { sesiones: 12, vigenciaHasta: '2026-10-01' }, HOY), { tipo: 'renovar' }); // vencida
  assert.deepEqual(pedidoSugerido('EN_CURSO', met, { sesiones: 4, usadas: 2 }, HOY), { tipo: 'nada' });   // renovada: quedan 2
  assert.deepEqual(pedidoSugerido('EN_CURSO', { done: 12, sessions: 12 }, { sesiones: 6 }, HOY), { tipo: 'alta' });
  assert.deepEqual(pedidoSugerido('EMPEORA', met, { sesiones: 6 }, HOY), { tipo: 'reevaluar' });
  assert.deepEqual(pedidoSugerido('EN_CURSO', met), { tipo: 'nada' });                                     // sin orden: como antes
  // Desde el render-model: el resumen usa m.orden.
  const rm = resumenMedico(modelo({ orden: { ...ORDEN, sesiones: 6, usadas: 6 } }), HOY);
  assert.deepEqual(rm.pedidoSugerido, { tipo: 'renovar' });
  assert.match(linea(rm, 'Pedido'), /renovar o ampliar la orden/);
  assert.deepEqual(resumenMedico(modelo({ orden: ORDEN }), HOY).pedidoSugerido, { tipo: 'nada' });
});

// ── Prompt IA por sexo ──
test('prompt — F: «la paciente» con concordancia femenina; M: «el paciente»; sin sexo, el texto de siempre', () => {
  const args = sexo => ({ p: { name: 'X', status: 'active', diag: 'Lumbalgia', sessions: 10, sexo }, log: [], epDiag: 'Lumbalgia',
    epSessions: 10, epDone: 0, esActual: true, prot: null, tieneMedico: true });
  const f = promptInformePaciente(args('F'));
  assert.match(f, /- La paciente es mujer: escribe siempre 'la paciente' y usa concordancia femenina en todo el texto \(ingresó, fue evaluada, …\), nunca su nombre\./);
  assert.match(f, /dirigido al médico que refirió a la paciente/);
  assert.doesNotMatch(f, /Refiérete siempre al 'paciente'/);
  const m = promptInformePaciente(args('M'));
  assert.match(m, /- El paciente es hombre: escribe siempre 'el paciente', nunca su nombre\./);
  assert.doesNotMatch(m, /la paciente/);
  const n = promptInformePaciente(args(null));
  assert.match(n, /- Refiérete siempre al 'paciente', nunca con nombre propio\./);
  assert.match(n, /dirigido al médico que refirió al paciente y que también puede leer el propio paciente/);
  assert.equal(n, promptInformePaciente(args(undefined)));
  assert.doesNotMatch(n, /es mujer|es hombre/);
});
