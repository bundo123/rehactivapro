// Tests del lote B2b-1 (Expediente) — node --test. Lógica pura de js/expediente-calc.js, sin DOM,
// con datos ficticios.
//  · resumenExpediente: doctor, sexo, sin evaluación, episodio con previas, próxima cita, última sesión.
//  · proximasCitas, ordenarDocsRecientes, esImagen, textoEvaFila.
//  · sesionesEpisodioExp: orden descendente, sin marcadores ni evaluación, campos planos.
//  · canAccessTab('expediente') para los tres roles.
//  · EXP-2: pendientesExpediente (cada regla sola, su caso que no dispara, orden estable, vacío),
//    datosFaltantes y listaEpisodiosExp (actual primero; anteriores plegados solo si son más de uno).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resumenExpediente, proximasCitas, ordenarDocsRecientes, esImagen, textoEvaFila,
  sesionesEpisodioExp, pendientesExpediente, datosFaltantes, listaEpisodiosExp } from '../js/expediente-calc.js';
import { mapEpisodioRow } from '../js/utils.js';
import { state } from '../js/state.js';
import { canAccessTab } from '../js/permissions.js';

const HOY = '2026-10-15';
const DOCTORS = [{ id: 'doc-1', name: 'Dra. Ficticia', spec: 'Traumatología' }];
const TH = [{ id: 't1', name: 'Terapeuta Uno' }, { id: 't2', name: 'Terapeuta Dos' }];

const ses = (date, over = {}) => ({ id: 's-' + date + (over.hour || ''), date, hour: '10:00:00', type: 'Fisioterapia',
  status: 'asistió', pb: 6, pa: 3, tags: [], therapistId: 't1', ...over });
const cita = (date, over = {}) => ({ id: 'c-' + date, patientId: 'p1', date, hour: 10, status: 'conf', therapistId: 't1', ...over });

const paciente = (over = {}) => ({
  id: 'p1', name: 'Paciente Ficticia', diag: 'Lumbalgia mecánica', cie10: 'M54.5', sessions: 10,
  sexo: 'F', doctorId: 'doc-1', status: 'active', episodios: [],
  log: [
    ses('2026-09-01', { type: 'Evaluación inicial', pb: 7, pa: null }),
    ses('2026-09-02'), ses('2026-09-04'), ses('2026-09-08'),
  ],
  ...over,
});

// ── resumenExpediente ──
test('resumenExpediente — con doctor, sexo y CIE-10; secundarios con «; »', () => {
  const p = paciente({ diagSec: [{ c: 'M51.2', d: 'Discopatía' }, { c: 'G57.0' }] });
  const r = resumenExpediente(p, [], HOY, DOCTORS);
  assert.equal(r.doctorTxt, 'Dra. Ficticia (Traumatología)');
  assert.equal(r.sexoTxt, 'Femenino');
  assert.equal(r.diagTxt, 'Lumbalgia mecánica (CIE-10: M54.5); M51.2 — Discopatía; G57.0');
  assert.equal(r.sinEval, false);
  assert.deepEqual(r.evalInicial, { fecha: '2026-09-01', eva: 7 });
  assert.equal(r.hechas, 3);
  assert.equal(r.plan, 10);
  assert.equal(r.previas, 0);
  assert.equal(r.episodioDesde, null);
});

test('resumenExpediente — sin doctor = Independiente; sin sexo = vacío; Masculino', () => {
  const r = resumenExpediente(paciente({ doctorId: null, sexo: null }), [], HOY, DOCTORS);
  assert.equal(r.doctorTxt, 'Independiente');
  assert.equal(r.sexoTxt, '');
  // doctorId que ya no existe en la lista: también Independiente (no un id suelto)
  assert.equal(resumenExpediente(paciente({ doctorId: 'borrado' }), [], HOY, DOCTORS).doctorTxt, 'Independiente');
  assert.equal(resumenExpediente(paciente({ sexo: 'M' }), [], HOY, DOCTORS).sexoTxt, 'Masculino');
});

test('resumenExpediente — sin evaluación inicial: sinEval y evalInicial null', () => {
  const p = paciente({ log: [ses('2026-09-02')] });
  const r = resumenExpediente(p, [], HOY, DOCTORS);
  assert.equal(r.sinEval, true);
  assert.equal(r.evalInicial, null);
  assert.equal(r.hechas, 1);
});

test('resumenExpediente — episodio actual con previas: hechas suma las previas, desde del episodio', () => {
  const p = paciente({
    episodios: [
      mapEpisodioRow({ id: 'e1', patient_id: 'p1', desde: null, diag: 'Anterior', sesiones_plan: 8 }),
      mapEpisodioRow({ id: 'e2', patient_id: 'p1', desde: '2026-09-04', sesiones_previas: 5 }),
    ],
  });
  const r = resumenExpediente(p, [], HOY, DOCTORS);
  assert.equal(r.episodioDesde, '2026-09-04');
  assert.equal(r.previas, 5);
  assert.equal(r.hechas, 2 + 5);   // 04/09 y 08/09 + 5 previas
  assert.equal(r.plan, 10);
});

test('resumenExpediente — próxima cita y última sesión; sin citas', () => {
  const citas = [cita('2026-09-08'), cita('2026-10-20', { status: 'pend' }), cita('2026-10-17'), cita('2026-10-16', { status: 'noas' })];
  const r = resumenExpediente(paciente(), citas, HOY, DOCTORS);
  assert.equal(r.proximaCita, '2026-10-17');
  assert.equal(r.ultimaSesion, '2026-09-08');
  const sin = resumenExpediente(paciente({ log: [] }), [], HOY, DOCTORS);
  assert.equal(sin.proximaCita, null);
  assert.equal(sin.ultimaSesion, null);
});

test('resumenExpediente — última sesión: la más nueva entre agenda y session_log (manual sin cita)', () => {
  const p = paciente({ log: [ses('2026-09-02'), ses('2026-10-01'), ses('2026-10-20')] });   // la del 20 es futura: no cuenta
  const r = resumenExpediente(p, [cita('2026-09-20')], HOY, DOCTORS);
  assert.equal(r.ultimaSesion, '2026-10-01');
  assert.equal(resumenExpediente(null, [], HOY), null);
});

// ── proximasCitas ──
test('proximasCitas — desde hoy, sin «no asistió», por fecha y hora, hasta n', () => {
  const citas = [cita('2026-10-18', { hour: 9 }), cita('2026-10-15', { hour: 16 }), cita('2026-10-15', { hour: 8, id: 'x' }),
    cita('2026-10-16', { status: 'noas' }), cita('2026-10-01'), cita('2026-10-19')];
  const r = proximasCitas(citas, HOY, 3);
  assert.deepEqual(r.map(a => `${a.date}@${a.hour}`), ['2026-10-15@8', '2026-10-15@16', '2026-10-18@9']);
  assert.deepEqual(proximasCitas([], HOY), []);
});

// ── documentos ──
test('ordenarDocsRecientes — fechaDoc o, sin ella, la de subida; empate por subida', () => {
  const docs = [
    { id: 'a', fechaDoc: '2026-08-01', createdAt: '2026-10-10T10:00:00Z' },
    { id: 'b', fechaDoc: null, createdAt: '2026-09-15T10:00:00Z' },
    { id: 'c', fechaDoc: '2026-10-02', createdAt: '2026-10-02T09:00:00Z' },
    { id: 'd', fechaDoc: null, createdAt: '2026-10-02T18:00:00Z' },
  ];
  assert.deepEqual(ordenarDocsRecientes(docs).map(d => d.id), ['d', 'c', 'b', 'a']);
  assert.equal(docs[0].id, 'a');   // no muta la entrada
  assert.deepEqual(ordenarDocsRecientes(null), []);
});

test('esImagen — JPEG y PNG sí; PDF y otros no', () => {
  assert.equal(esImagen('image/jpeg'), true);
  assert.equal(esImagen('image/png'), true);
  assert.equal(esImagen('application/pdf'), false);
  assert.equal(esImagen('image/webp'), false);
  assert.equal(esImagen(undefined), false);
});

// ── sesiones del episodio ──
test('textoEvaFila — antes→después, sin después, solo después, sin medir', () => {
  assert.equal(textoEvaFila({ pb: 7, pa: 3 }), '7→3');
  assert.equal(textoEvaFila({ pb: 0, pa: null }), '0→?');
  assert.equal(textoEvaFila({ pb: null, pa: 2 }), '—→2');
  assert.equal(textoEvaFila({}), '—');
});

test('sesionesEpisodioExp — descendente, sin evaluación ni marcadores, campos planos', () => {
  const p = paciente({
    log: [
      ses('2026-09-01', { type: 'Evaluación inicial' }),
      ses('2026-09-02', { tags: ['TENS', 'Masaje'], therapistId: 't2' }),
      ses('2026-09-08', { hour: '08:30:00', pb: null, pa: null }),
      ses('2026-09-08', { hour: '17:00:00', status: 'no asistió' }),
      ses('2026-09-05', { type: 'Fin de episodio', note: 'Episodio anterior: X · 3 sesiones' }),
    ],
  });
  const citas = [cita('2026-09-02', { location: 'domicilio' })];
  const r = sesionesEpisodioExp(p, { citas, therapists: TH });
  assert.deepEqual(r.map(s => `${s.fecha} ${s.hora}`), ['2026-09-08 17:00', '2026-09-08 08:30', '2026-09-02 10:00']);
  assert.deepEqual(r[2], { id: 's-2026-09-02', fecha: '2026-09-02', hora: '10:00', tipo: 'Fisioterapia', lugar: 'Domicilio',
    eva: '6→3', terapeuta: 'Terapeuta Dos', tecnicas: 'TENS, Masaje', asistio: true });
  assert.equal(r[0].asistio, false);
  assert.equal(r[1].eva, '—');
  assert.equal(r[1].lugar, '—');   // sin cita ese día
});

test('sesionesEpisodioExp — solo el episodio actual', () => {
  const p = paciente({
    episodios: [
      mapEpisodioRow({ id: 'e1', patient_id: 'p1', desde: null }),
      mapEpisodioRow({ id: 'e2', patient_id: 'p1', desde: '2026-09-05' }),
    ],
  });
  assert.deepEqual(sesionesEpisodioExp(p, { therapists: TH }).map(s => s.fecha), ['2026-09-08']);
  assert.deepEqual(sesionesEpisodioExp(null), []);
});

// ── pestaña ──
const _rol = state.currentUserRole;
after(() => { state.currentUserRole = _rol; });
test('canAccessTab(expediente) — los tres roles', () => {
  for (const rol of ['admin', 'secretaria', 'terapeuta']) {
    state.currentUserRole = rol;
    assert.equal(canAccessTab('expediente'), true, rol);
  }
  state.currentUserRole = 'contador';
  assert.equal(canAccessTab('expediente'), false);
});

// ── EXP-2: pendientes ──
// Paciente «al día»: evaluación, diagnóstico del catálogo, orden vigente y con sesiones, plan a medias,
// próxima cita agendada y sin faltas. Cada prueba rompe UNA cosa.
const alDia = (over = {}) => paciente({
  protocolId: 'prot-1',
  ordenes: [{ id: 'o1', doctorId: 'doc-1', fecha: '2026-09-01', sesiones: 20, vigenciaHasta: '2026-12-31', createdAt: 'a' }],
  ...over,
});
const CITA_FUTURA = [cita('2026-10-20')];
const claves = (p, citas = CITA_FUTURA, ctx) => pendientesExpediente(p, citas, HOY, ctx).map(x => x.clave);

test('pendientesExpediente — paciente al día: vacío', () => {
  assert.deepEqual(pendientesExpediente(alDia(), CITA_FUTURA, HOY), []);
  assert.deepEqual(pendientesExpediente(null, [], HOY), []);
});

test('pendientesExpediente — sin_eval con «Registrar»; sin permiso, sin acción', () => {
  const p = alDia({ log: [ses('2026-09-02')] });
  assert.deepEqual(pendientesExpediente(p, CITA_FUTURA, HOY),
    [{ clave: 'sin_eval', texto: 'Sin evaluación inicial', accion: { tipo: 'evalInicial', label: 'Registrar' } }]);
  assert.equal(pendientesExpediente(p, CITA_FUTURA, HOY, { puede: perm => perm !== 'evalInicial' })[0].accion, null);
});

test('pendientesExpediente — orden_vencida; el último día de vigencia todavía vale', () => {
  const o = v => [{ id: 'o1', fecha: '2026-09-01', sesiones: 20, vigenciaHasta: v, createdAt: 'a' }];
  const r = pendientesExpediente(alDia({ ordenes: o('2026-10-01') }), CITA_FUTURA, HOY);
  assert.deepEqual(r, [{ clave: 'orden_vencida', texto: 'Orden médica vencida el 01/10/2026', accion: { tipo: 'ordenes', label: 'Ver órdenes' } }]);
  assert.deepEqual(claves(alDia({ ordenes: o(HOY) })), []);
});

test('pendientesExpediente — orden_agotada cuenta las sesiones desde la fecha de la orden', () => {
  const o = n => [{ id: 'o1', fecha: '2026-09-01', sesiones: n, vigenciaHasta: null, createdAt: 'a' }];
  // 3 sesiones asistidas desde el 01/09 (la evaluación no cuenta)
  assert.deepEqual(pendientesExpediente(alDia({ ordenes: o(3) }), CITA_FUTURA, HOY).map(x => x.texto), ['Orden médica agotada (3 de 3 sesiones)']);
  assert.deepEqual(claves(alDia({ ordenes: o(4) })), []);
});

test('pendientesExpediente — sin_orden solo si tiene médico referente', () => {
  assert.deepEqual(claves(alDia({ ordenes: [] })), ['sin_orden']);
  assert.deepEqual(claves(alDia({ ordenes: [], doctorId: null })), []);
});

test('pendientesExpediente — plan_sin_alta (con «Editar»); con alta no', () => {
  const r = pendientesExpediente(alDia({ sessions: 3 }), CITA_FUTURA, HOY);
  assert.deepEqual(r, [{ clave: 'plan_sin_alta', texto: 'Plan completo (3 de 3) sin alta registrada', accion: { tipo: 'editar', label: 'Editar' } }]);
  assert.deepEqual(claves(alDia({ sessions: 3, status: 'alta' })), []);
});

test('pendientesExpediente — inasistencias desde 2 en el episodio actual', () => {
  const dos = [...CITA_FUTURA, cita('2026-09-10', { status: 'noas' }), cita('2026-09-12', { status: 'noas' })];
  assert.deepEqual(pendientesExpediente(alDia(), dos, HOY).map(x => [x.clave, x.texto]), [['inasistencias', '2 inasistencias en este episodio']]);
  assert.deepEqual(claves(alDia(), dos.slice(0, 2)), []);
  // una falta de un episodio ANTERIOR no cuenta
  const eps = [mapEpisodioRow({ id: 'e1', patient_id: 'p1', desde: null }), mapEpisodioRow({ id: 'e2', patient_id: 'p1', desde: '2026-09-11' })];
  assert.deepEqual(claves(alDia({ episodios: eps, log: [ses('2026-09-11', { type: 'Evaluación inicial' }), ses('2026-09-12')] }), dos), []);
});

test('pendientesExpediente — sin_cita: activo, plan incompleto y nada agendado', () => {
  assert.deepEqual(pendientesExpediente(alDia(), [], HOY).map(x => [x.clave, x.accion?.tipo]), [['sin_cita', 'agendar']]);
  assert.deepEqual(claves(alDia({ status: 'pend' }), []), []);
  assert.equal(pendientesExpediente(alDia(), [], HOY, { puede: () => false })[0].accion, null);
});

test('pendientesExpediente — sin_diagnostico: sin protocolo y diag vacío o «Sin diagnóstico»', () => {
  assert.deepEqual(claves(alDia({ protocolId: null, diag: 'Sin diagnóstico' })), ['sin_diagnostico']);
  assert.deepEqual(claves(alDia({ protocolId: null, diag: '' })), ['sin_diagnostico']);
  assert.deepEqual(claves(alDia({ protocolId: null })), []);   // diag del catálogo con texto
});

test('pendientesExpediente — orden de salida estable con todo pendiente', () => {
  const p = alDia({
    log: [ses('2026-09-02'), ses('2026-09-04'), ses('2026-09-08')], sessions: 3, protocolId: null, diag: '',
    ordenes: [{ id: 'o1', fecha: '2026-09-01', sesiones: 2, vigenciaHasta: '2026-10-01', createdAt: 'a' }],
  });
  const citas = [cita('2026-09-03', { status: 'noas' }), cita('2026-09-05', { status: 'noas' })];
  assert.deepEqual(claves(p, citas), ['sin_eval', 'orden_vencida', 'orden_agotada', 'plan_sin_alta', 'inasistencias', 'sin_diagnostico']);
  // sin_orden y sin_cita, en su lugar
  assert.deepEqual(claves(alDia({ log: [ses('2026-09-02')], ordenes: [], protocolId: null, diag: '' }), []), ['sin_eval', 'sin_orden', 'sin_cita', 'sin_diagnostico']);
});

// ── EXP-2: datos por completar ──
test('datosFaltantes — completo: []', () => {
  assert.deepEqual(datosFaltantes(paciente({ birth_date: '1990-05-10', cedula: '1700000000', tel: '0991234567', email: 'x@example.com' })), []);
  assert.deepEqual(datosFaltantes(null), []);
});

test('datosFaltantes — faltan 3: esas, en el orden de la ficha', () => {
  const p = paciente({ birth_date: null, sexo: null, cedula: '1700000000', tel: '  ', email: 'x@example.com' });
  assert.deepEqual(datosFaltantes(p), ['fecha de nacimiento', 'sexo', 'teléfono']);
  assert.deepEqual(datosFaltantes({ id: 'p9' }), ['fecha de nacimiento', 'sexo', 'cédula', 'teléfono', 'correo', 'médico referente']);
});

// ── EXP-2: lista de episodios ──
test('listaEpisodiosExp — un episodio, o uno anterior: nada plegado', () => {
  const uno = listaEpisodiosExp(paciente());
  assert.equal(uno.actual.actual, true);
  assert.equal(uno.actual.titulo, 'Episodio 1');
  assert.deepEqual([uno.anteriores.length, uno.plegar], [0, false]);
  const dos = listaEpisodiosExp(paciente({ episodios: [
    mapEpisodioRow({ id: 'e1', patient_id: 'p1', desde: null, diag: 'Anterior' }),
    mapEpisodioRow({ id: 'e2', patient_id: 'p1', desde: '2026-09-04', nombre: 'Rodilla', sesiones_previas: 2 }),
  ] }));
  assert.equal(dos.actual.titulo, 'Rodilla');
  assert.equal(dos.actual.hechasMostradas, 2 + 2);
  assert.deepEqual([dos.anteriores.length, dos.plegar], [1, false]);
});

test('listaEpisodiosExp — actual primero; dos o más anteriores, del más nuevo al más viejo y plegados', () => {
  const r = listaEpisodiosExp(paciente({ episodios: [
    mapEpisodioRow({ id: 'e1', patient_id: 'p1', desde: null, diag: 'Primero' }),
    mapEpisodioRow({ id: 'e2', patient_id: 'p1', desde: '2026-09-03', diag: 'Segundo' }),
    mapEpisodioRow({ id: 'e3', patient_id: 'p1', desde: '2026-09-06' }),
  ] }));
  assert.equal(r.actual.titulo, 'Episodio 3');
  assert.deepEqual(r.anteriores.map(e => [e.titulo, e.diag]), [['Episodio 2', 'Segundo'], ['Episodio 1', 'Primero']]);
  assert.equal(r.plegar, true);
});
