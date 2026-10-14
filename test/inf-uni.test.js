// Tests de INF-UNI — node --test. Lógica pura, sin DOM.
//  · MED-1: resumenMedico (una prueba por estado, "mejoraba;", alertas, pedido sugerido, sin
//    médico → sin línea de pedido, snapshot viejo).
//  · DOC-1: N.º único, cargo por especialidad, lugar por sesión, pie legal, nombre de archivo.
//  · Prompt de la narrativa: 150–220 palabras y la regla de fechas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenMedico, UMBRALES, pedidoSugerido, textoPedido, romClave, periodoInforme, tipoTerapiaDe } from '../js/resumen-medico.js';
import { numeroInforme, cargoFirmante, lugarSesion, horaSesion, pieLegal, CONFIG_CLINICA, nombreArchivoInforme, tipoCorto } from '../js/utils.js';
import { promptInformePaciente } from '../js/prompt-informe.js';

const HOY = '2026-10-14';
const ses = (fecha, pb, pa, extra = {}) => ({ fecha, pb, pa, tipo: 'Fisioterapia', terapeuta: 'Ana', ...extra });
// Modelo base: plan 12, 6 hechas, continuidad 100 %, próxima cita agendada, con médico.
const modelo = (over = {}) => {
  const m = {
    numero: 'INF-20261014-0930-ABCD', fechaLarga: '14 de octubre de 2026', emitido: HOY,
    paciente: { nombre: 'María Ficticia', cedula: '1700000000', edad: '14/05/1978 (48 años)', edadCorta: '48 años', diagnostico: 'Lumbalgia (CIE-10: M54.5)' },
    doctor: 'Dra. Prueba (Traumatología)', alta: false, proximaCita: '2026-10-16', pedido: null,
    evalInicial: { fecha: '2026-09-01', pb: 7, partes: [], rom: null },
    sesiones: [ses('2026-09-02', 7, 6), ses('2026-09-04', 6, 6), ses('2026-09-08', 6, 5), ses('2026-09-10', 5, 5), ses('2026-09-15', 5, 4), ses('2026-10-10', 4, 4)],
    metricas: { done: 6, sessions: 12, pct: 50, previas: 0, adh: 100, asistidas: 6, totalCitas: 6, faltas: 0, evaHas: true, evaInicial: 7, evaActual: 4 },
  };
  return { ...m, ...over, metricas: { ...m.metricas, ...(over.metricas || {}) } };
};
const linea = (rm, k) => rm.lineas.find(l => l.k === k)?.t;

// ── ESTADO: una prueba por estado (gana la primera regla que se cumple) ──
test('SIN DATOS — menos de 2 mediciones reales de dolor', () => {
  const rm = resumenMedico(modelo({ evalInicial: { fecha: '2026-09-01', pb: null, partes: [] }, sesiones: [ses('2026-09-02', 5, null)],
    metricas: { done: 1, evaInicial: 5, evaActual: null } }), HOY);
  assert.equal(rm.estado.clave, 'SIN_DATOS');
  assert.match(linea(rm, 'Estado'), /^○ SIN DATOS · /);
});

test('EMPEORA — dolor actual ≥ base + 2 (y gana aunque también haya poca asistencia)', () => {
  const rm = resumenMedico(modelo({ metricas: { evaInicial: 4, evaActual: 6, adh: 60 } }), HOY);
  assert.equal(rm.estado.clave, 'EMPEORA');
  assert.match(linea(rm, 'Estado'), /^■ EMPEORA · El dolor subió de 4 a 6\/10\. · Sesión 6\/12 \(50 %\)$/);
});

test('EMPEORA — el ROM clave baja ≥10 puntos del normal', () => {
  const evalRom = [{ j: 'hombro', m: 'abd', l: 'D', v: 90 }, { j: 'hombro', m: 'flex', l: 'D', v: 170 }];   // abd 50 %, flex 94 %
  const sesiones = modelo().sesiones.map((s, i) => i === 4 ? { ...s, rom: [{ j: 'hombro', m: 'abd', l: 'D', v: 70 }] } : s);   // 39 %
  const rm = resumenMedico(modelo({ evalInicial: { fecha: '2026-09-01', pb: 5, partes: [], rom: evalRom }, sesiones, metricas: { evaInicial: 5, evaActual: 4 } }), HOY);
  assert.equal(rm.estado.clave, 'EMPEORA');
  assert.match(rm.estado.frase, /Hombro D abducción: bajó 11 puntos del normal/);
});

test('INTERRUMPIDO — ≥14 días sin sesión, sin cita futura y plan incompleto; "mejoraba;" si además mejoraba', () => {
  const sesiones = modelo().sesiones.slice(0, 5);   // última sesión 15/09 → 29 días
  const rm = resumenMedico(modelo({ sesiones, proximaCita: null, metricas: { evaInicial: 7, evaActual: 4 } }), HOY);
  assert.equal(rm.estado.clave, 'INTERRUMPIDO');
  assert.equal(rm.estado.frase, 'Mejoraba; sin sesiones desde el 15/09/2026 y sin cita agendada.');
  assert.match(linea(rm, 'Estado'), /^▲ INTERRUMPIDO · /);
  // Con cita futura no está interrumpido; con cita desconocida (snapshot viejo) tampoco.
  assert.notEqual(resumenMedico(modelo({ sesiones, metricas: { evaInicial: 7, evaActual: 6 } }), HOY).estado.clave, 'INTERRUMPIDO');
  assert.notEqual(resumenMedico(modelo({ sesiones, proximaCita: undefined, metricas: { evaInicial: 7, evaActual: 6 } }), HOY).estado.clave, 'INTERRUMPIDO');
});

test('ATENCIÓN — asistencia < 85 %, plan completo sin alta, o 4 sesiones seguidas sin cambio', () => {
  const asis = resumenMedico(modelo({ metricas: { adh: 80, evaInicial: 7, evaActual: 6 } }), HOY);
  assert.equal(asis.estado.clave, 'ATENCION');
  assert.equal(asis.estado.frase, `Asistencia del 80 % (meta ${UMBRALES.ASISTENCIA_MIN} %).`);
  assert.match(linea(asis, 'Estado'), /^▲ ATENCIÓN · /);
  const sinAlta = resumenMedico(modelo({ metricas: { done: 12, pct: 100, evaInicial: 7, evaActual: 6 } }), HOY);
  assert.equal(sinAlta.estado.clave, 'ATENCION');
  assert.match(sinAlta.estado.frase, /Completó el plan y no tiene alta registrada/);
  const plano = modelo({ sesiones: [ses('2026-10-01', 5, 5), ses('2026-10-03', 5, 5), ses('2026-10-06', 5, 5), ses('2026-10-08', 5, 5)],
    evalInicial: { fecha: '2026-09-30', pb: 6, partes: [] }, metricas: { done: 4, evaInicial: 6, evaActual: 5 } });
  assert.equal(resumenMedico(plano, HOY).estado.frase, 'Dolor sin cambio en las últimas 4 sesiones.');
  // Con mejora a la vez, la frase lo dice.
  const mejoraba = resumenMedico(modelo({ metricas: { adh: 70 } }), HOY);
  assert.equal(mejoraba.estado.clave, 'ATENCION');
  assert.match(mejoraba.estado.frase, /^Mejoraba; asistencia del 70 %/);
});

test('MEJORA — el dolor baja ≥2 puntos o ≥30 %', () => {
  const rm = resumenMedico(modelo(), HOY);
  assert.equal(rm.estado.clave, 'MEJORA');
  assert.equal(linea(rm, 'Estado'), '● MEJORA · El dolor bajó de 7 a 4/10. · Sesión 6/12 (50 %)');
  // 3 → 2 es 1 punto pero 33 %: también mejora.
  assert.equal(resumenMedico(modelo({ metricas: { evaInicial: 3, evaActual: 2 } }), HOY).estado.clave, 'MEJORA');
});

test('EN CURSO — nada supera los umbrales', () => {
  const rm = resumenMedico(modelo({ metricas: { evaInicial: 7, evaActual: 6 } }), HOY);
  assert.equal(rm.estado.clave, 'EN_CURSO');
  assert.match(linea(rm, 'Estado'), /^● EN CURSO · /);
});

// ── MEDIDAS ──
test('MEDIDAS — dolor base → actual con cambio, ROM clave base → última / normal, asistencia A de B', () => {
  const evalRom = [{ j: 'hombro', m: 'abd', l: 'D', v: 80 }, { j: 'hombro', m: 'flex', l: 'D', v: 150 }, { j: 'hombro', m: 'ext', l: 'D', v: 50 }];
  const sesiones = modelo().sesiones.map((s, i) => i === 2 ? { ...s, rom: [{ j: 'hombro', m: 'abd', l: 'D', v: 100 }] }
    : i === 4 ? { ...s, rom: [{ j: 'hombro', m: 'abd', l: 'D', v: 125 }, { j: 'hombro', m: 'abd', l: 'I', v: 60 }] } : s);
  const rm = resumenMedico(modelo({ evalInicial: { fecha: '2026-09-01', pb: 7, partes: [], rom: evalRom }, sesiones, metricas: { asistidas: 6, totalCitas: 7 } }), HOY);
  assert.equal(linea(rm, 'Medidas'), 'Dolor 7 → 4/10 (−3) · ROM clave: Hombro D abducción 80° → 125° / 180° · Asistencia: 6 de 7 citas');
  assert.equal(romClave(evalRom, []).ultima, null);
  assert.match(linea(resumenMedico(modelo({ evalInicial: { fecha: '2026-09-01', pb: 7, partes: [], rom: evalRom } }), HOY), 'Medidas'), /80° \/ 180° \(sin re-medición\)/);
  assert.match(linea(resumenMedico(modelo(), HOY), 'Medidas'), / · sin goniometría · /);
});

// ── ALERTAS ──
test('ALERTAS — solo por reglas, máximo 2, y siempre cierran con los signos de alarma', () => {
  assert.equal(linea(resumenMedico(modelo(), HOY), 'Alertas'), 'ninguna regla disparada · Signos de alarma: sin registro estructurado');
  // "después" > "antes" en las 3; entre sesiones el dolor sube de a 1 (5 → 6): esa alerta no salta.
  const sesiones = [ses('2026-09-02', 3, 4), ses('2026-09-04', 4, 5), ses('2026-09-08', 3, 6)];
  const rm = resumenMedico(modelo({ sesiones, metricas: { done: 3, faltas: 3, previas: 2, evaInicial: 3, evaActual: 6 } }), HOY);
  assert.equal(rm.alertas.length, 3);
  assert.equal(linea(rm, 'Alertas'), '"después" peor que "antes" en 2 sesiones seguidas (04/09 y 08/09) · 3 inasistencias · Signos de alarma: sin registro estructurado');
  // El dolor sube ≥2 respecto de la sesión anterior.
  const sube = resumenMedico(modelo({ sesiones: [ses('2026-09-02', 5, 3), ses('2026-09-04', 5, 5)], metricas: { done: 2, evaInicial: 5, evaActual: 5 } }), HOY);
  assert.match(linea(sube, 'Alertas'), /^dolor subió de 3 a 5 en la última sesión \(04\/09\)/);
  // Sesiones previas a RehactivaPro: aviso.
  assert.match(linea(resumenMedico(modelo({ metricas: { previas: 4 } }), HOY), 'Alertas'), /incluye 4 sesiones previas a RehactivaPro/);
});

// ── PEDIDO ──
test('PEDIDO — sugerencia automática: EMPEORA → reevaluar; plan completo → validar el alta; ≥80 % sin meta → renovar', () => {
  assert.deepEqual(pedidoSugerido('EMPEORA', { done: 3, sessions: 10 }), { tipo: 'reevaluar' });
  assert.deepEqual(pedidoSugerido('ATENCION', { done: 10, sessions: 10 }), { tipo: 'alta' });
  assert.deepEqual(pedidoSugerido('EN_CURSO', { done: 8, sessions: 10 }), { tipo: 'renovar' });
  assert.deepEqual(pedidoSugerido('MEJORA', { done: 8, sessions: 10 }), { tipo: 'nada' });
  assert.deepEqual(pedidoSugerido('EN_CURSO', { done: 5, sessions: 10 }), { tipo: 'nada' });
  const rm = resumenMedico(modelo({ metricas: { done: 10, pct: 83, evaInicial: 7, evaActual: 6 } }), HOY);
  assert.equal(linea(rm, 'Pedido'), 'Necesitamos de usted: renovar o ampliar la orden');
  // Lo elegido en el modal manda sobre la sugerencia.
  const elegido = resumenMedico(modelo({ pedido: { tipo: 'renovar', n: 6 } }), HOY);
  assert.equal(linea(elegido, 'Pedido'), 'Necesitamos de usted: renovar o ampliar la orden (+6 sesiones)');
  assert.equal(textoPedido({ tipo: 'otro', texto: 'x'.repeat(150) }).length, 100);
  assert.equal(textoPedido({ tipo: 'interconsulta' }), 'una interconsulta');
});

test('PEDIDO — sin médico referente la línea no se imprime', () => {
  const rm = resumenMedico(modelo({ doctor: null }), HOY);
  assert.equal(linea(rm, 'Pedido'), undefined);
  assert.deepEqual(rm.lineas.map(l => l.k), ['Estado', 'Medidas', 'Alertas', 'Próximo']);
});

// ── PRÓXIMO e identificación ──
test('PRÓXIMO — próxima cita o "sin cita agendada", hito del 50 % / 100 % y qué se medirá', () => {
  assert.equal(linea(resumenMedico(modelo({ metricas: { done: 4 } }), HOY), 'Próximo'),
    'Próxima cita: 16/10/2026 · próximo informe al 50 % del plan (sesión 6) · se medirá dolor y movilidad');
  assert.equal(linea(resumenMedico(modelo({ proximaCita: null }), HOY), 'Próximo'),
    'Sin cita agendada · próximo informe al 100 % del plan (sesión 12) · se medirá dolor y movilidad');
});

test('identificación — nombre · edad · diagnóstico con CIE-10 · tipo de terapia · período · N.º', () => {
  const rm = resumenMedico(modelo(), HOY);
  assert.equal(rm.identificacion, 'María Ficticia · 48 años · Lumbalgia (CIE-10: M54.5) · Fisioterapia · 01/09/2026 – 10/10/2026 · INF-20261014-0930-ABCD');
  assert.equal(tipoTerapiaDe([{ tipo: 'Fisioterapia' }, { tipo: 'Terapia respiratoria' }]), 'Fisioterapia y terapia respiratoria');
  assert.equal(periodoInforme({ rango: { desdeFecha: '2026-09-02', hastaFecha: '2026-09-10' } }), '02/09/2026 – 10/09/2026');
});

test('snapshot viejo (antes de INF-UNI) — se calcula igual, sin las reglas que no tienen dato', () => {
  const viejo = {
    numero: 'INF-20260901-1234', fechaLarga: '01 de septiembre de 2026',
    paciente: { nombre: 'Paciente Viejo', cedula: '', edad: '01/01/1980 (46 años)', diagnostico: 'Cervicalgia' },
    terapeuta: 'Ana', doctor: 'Dr. X', protocolo: null, inicio: '2026-07-01',
    metricas: { pct: 100, done: 10, sessions: 10, adh: 100, asistidas: 10, totalCitas: 10, evaHas: true, evaInicial: 6, evaActual: 2 },
    evalInicial: { fecha: '2026-07-01', pb: 6, partes: ['Dolor cervical'] },
    sesiones: [{ fecha: '2026-07-02', terapeuta: 'Ana', pb: 6, pa: 5, tecnicas: null, obs: null }, { fecha: '2026-08-20', terapeuta: 'Ana', pb: 3, pa: 2, tecnicas: null, obs: null }],
    narrativa: [],
  };
  const rm = resumenMedico(viejo, '2026-09-01');
  assert.equal(rm.estado.clave, 'MEJORA');                 // plan completo pero sin dato de alta: no es ATENCIÓN
  assert.equal(rm.identificacion, 'Paciente Viejo · 46 años · Cervicalgia · 01/07/2026 – 20/08/2026 · INF-20260901-1234');
  assert.match(linea(rm, 'Medidas'), /Asistencia: 10 de 10 citas/);
  assert.equal(linea(rm, 'Próximo'), 'próximo informe al alta · se medirá dolor y movilidad');   // sin dato de cita: no se inventa
  assert.equal(resumenMedico({ numero: 'X' }, HOY), null);   // sin sesiones ni métricas: se omite
});

// ── DOC-1 ──
test('N.º único — mismo minuto, distinto paciente → distinto número; formato INF-AAAAMMDD-HHMM-XXXX', () => {
  const t = new Date(2026, 9, 14, 9, 5);
  const a = numeroInforme(t, '3f2a9c1e-0000-4000-8000-00000000ab12');
  const b = numeroInforme(t, '3f2a9c1e-0000-4000-8000-00000000cd34');
  assert.equal(a, 'INF-20261014-0905-AB12');
  assert.notEqual(a, b);
  assert.equal(numeroInforme(t, 7), 'INF-20261014-0905-0007');
  assert.notEqual(numeroInforme(new Date(2026, 9, 14, 9, 6), '…ab12'), a);   // otro minuto, mismo paciente
});

test('cargo del firmante según especialidad', () => {
  assert.equal(cargoFirmante('fisica'), 'Fisioterapeuta');
  assert.equal(cargoFirmante('respiratoria'), 'Terapeuta respiratorio/a');
  assert.equal(cargoFirmante(undefined), 'Fisioterapeuta');
});

test('lugar por sesión — el de la cita del mismo día; "—" (null) si no hay cita', () => {
  const citas = [{ date: '2026-09-02', hour: 9, location: 'domicilio' }, { date: '2026-09-04', hour: 8, location: 'centro' }, { date: '2026-09-04', hour: 16, location: 'domicilio' }];
  assert.equal(lugarSesion({ date: '2026-09-02', hour: '09:00:00' }, citas), 'Domicilio');
  assert.equal(lugarSesion({ date: '2026-09-04', hour: '15:30:00' }, citas), 'Domicilio');   // la de hora más cercana
  assert.equal(lugarSesion({ date: '2026-09-04', hour: '08:00:00' }, citas), 'Centro');
  assert.equal(lugarSesion({ date: '2026-09-05', hour: '09:00:00' }, citas), null);
  assert.equal(horaSesion('09:30:00'), '09:30');
  assert.equal(horaSesion(null), '');
  assert.equal(tipoCorto('Terapia respiratoria'), 'Respiratoria');
  assert.equal(tipoCorto(undefined), '—');
});

test('pie legal — razón social, RUC y dirección corregida; el permiso ACESS vacío no se imprime', () => {
  const pie = pieLegal();
  assert.match(pie, /^REHACTIVA REHABILITACION Y FISIOTERAPIA S\.A\. · RUC 1793033970001 · Mia Plaza \(antes Palmeras Shopping\), Vía Intervalles Oe-95 y Primera Transversal, Cumbayá · Tel\. /);
  assert.doesNotMatch(pie, /ACESS/);
  assert.match(pieLegal({ ...CONFIG_CLINICA, PERMISO_ACESS: 'ACESS-123' }), /Permiso ACESS ACESS-123/);
});

test('nombre del archivo — "Informe INF-….docx", sin el nombre del paciente', () => {
  assert.equal(nombreArchivoInforme('INF-20261014-0905-AB12', 'docx'), 'Informe INF-20261014-0905-AB12.docx');
  assert.equal(nombreArchivoInforme('INF-20261014-0905-AB12', 'pdf'), 'Informe INF-20261014-0905-AB12.pdf');
});

// ── Narrativa IA ──
test('prompt — 150 a 220 palabras y fechas del HISTORIAL POR SESIÓN', () => {
  const t = promptInformePaciente({ p: { name: 'X', status: 'active', diag: 'Lumbalgia', sessions: 10 }, log: [], epDiag: 'Lumbalgia',
    epSessions: 10, epDone: 0, esActual: true, prot: null, tieneMedico: true });
  assert.match(t, /entre 150 y 220 palabras/);
  assert.doesNotMatch(t, /280 y 380/);
  assert.match(t, /Las fechas y el orden de los eventos salen del HISTORIAL POR SESIÓN; no digas 'segunda semana' si el dato dice día 4\./);
});
