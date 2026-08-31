// Tests del TIPO DE SESIÓN (Fisioterapia / Terapia respiratoria) y de la ESPECIALIDAD del
// terapeuta — node --test.
//
// El centro presta dos servicios y la cita dice cuál es. La sesión registrada YA NO fija
// 'Fisioterapia': hereda appt.type, y el flujo manual (carga retroactiva, sin cita) cae al
// default. Lo que se cubre acá:
//  · tipoSesion() normaliza contra el catálogo (espejo del CHECK de appointments.type).
//  · La herencia: una sesión registrada desde una cita respiratoria queda 'Terapia respiratoria'.
//  · Que el tipo NO cambia ningún conteo: doneActual y el ordinal X/N cuentan igual con los dos.
//  · Los marcadores 'Evaluación inicial' y 'Fin de episodio' siguen fuera del conteo con
//    cualquier mezcla de tipos (son de session_log, no son tipos de cita).
//  · El desglose "X fisio · Y resp" del Resumen del día.
//  · mapTherapistRow(): specialty con default 'fisica' cuando la fila no la trae.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_SESION, TIPO_SESION_DEFAULT, tipoSesion, desgloseTipos, textoDesglose,
         ESPECIALIDADES, ESPECIALIDAD_DEFAULT, especialidad, especialidadLabel, mapTherapistRow,
         doneActual, citaOrdinal, ordinalesDeCitas, ordinalTexto } from '../js/utils.js';

const FISIO = 'Fisioterapia', RESP = 'Terapia respiratoria';

const cita = (id, date, type = FISIO, hour = 9) =>
  ({ id, date, hour, duration: 60, status: 'conf', patientId: 'p1', therapistId: 't1', type });
const sesion = (date, type = FISIO) => ({ date, type, status: 'asistió' });

// Espejo de saveSession() (js/sesiones.js): el tipo de la fila de session_log sale de la cita.
const registrarSesion = (appt) => ({ date: appt.date, type: tipoSesion(appt.type), status: 'asistió' });

// ── Catálogo y normalización ─────────────────────────────────────────────────
test('TIPOS_SESION — exactamente los dos servicios del CHECK, Fisioterapia por default', () => {
  assert.deepEqual(TIPOS_SESION.map(t => t.label), [FISIO, RESP]);
  assert.equal(TIPO_SESION_DEFAULT, FISIO);
});

test('tipoSesion — deja pasar los dos tipos válidos tal cual', () => {
  assert.equal(tipoSesion(FISIO), FISIO);
  assert.equal(tipoSesion(RESP), RESP);
});

test('tipoSesion — vacío, nulo o desconocido cae al default (nunca escribe algo que el CHECK rechace)', () => {
  [null, undefined, '', '   ', 'Kinesioterapia', 'Masoterapia', 42].forEach(v => {
    assert.equal(tipoSesion(v), FISIO);
  });
});

// ── Herencia del tipo: cita → sesión registrada ──────────────────────────────
test('herencia — la sesión registrada desde una cita RESPIRATORIA queda Terapia respiratoria', () => {
  const s = registrarSesion(cita('a1', '2026-08-20', RESP));
  assert.equal(s.type, RESP);
});

test('herencia — desde una cita de fisioterapia queda Fisioterapia', () => {
  assert.equal(registrarSesion(cita('a1', '2026-08-20', FISIO)).type, FISIO);
});

test('herencia — cita vieja SIN tipo: la sesión se guarda con el default, no con ""', () => {
  const sinTipo = { id: 'a1', date: '2026-08-20', hour: 9, status: 'conf', patientId: 'p1' };
  assert.equal(registrarSesion(sinTipo).type, FISIO);
});

// ── El tipo NO toca los conteos ──────────────────────────────────────────────
test('doneActual — cuenta igual con sesiones de fisio, de respiratoria o mezcladas', () => {
  const soloFisio = { id: 'p1', log: [sesion('2026-08-01'), sesion('2026-08-03'), sesion('2026-08-05')] };
  const soloResp  = { id: 'p1', log: [sesion('2026-08-01', RESP), sesion('2026-08-03', RESP), sesion('2026-08-05', RESP)] };
  const mezcla    = { id: 'p1', log: [sesion('2026-08-01'), sesion('2026-08-03', RESP), sesion('2026-08-05')] };
  assert.equal(doneActual(soloFisio), 3);
  assert.equal(doneActual(soloResp), 3);
  assert.equal(doneActual(mezcla), 3);
});

test('doneActual — con tipos mezclados los marcadores siguen sin contar (R-2)', () => {
  const pt = { id: 'p1', log: [
    { date: '2026-07-01', type: 'Evaluación inicial', status: 'asistió' },
    sesion('2026-07-05', RESP),
    sesion('2026-07-08'),
    { date: '2026-07-10', type: 'Fin de episodio', status: 'asistió' },
    { date: '2026-07-11', type: 'Evaluación inicial', status: 'asistió' },
    sesion('2026-07-12', RESP),
    sesion('2026-07-14'),
    sesion('2026-07-16', RESP),
  ] };
  // Episodio actual = lo posterior al 'Fin de episodio': 3 sesiones, sin la evaluación inicial.
  assert.equal(doneActual(pt), 3);
});

test('doneActual — una sesión respiratoria que no se asistió tampoco cuenta', () => {
  const pt = { id: 'p1', log: [sesion('2026-08-01', RESP), { date: '2026-08-03', type: RESP, status: 'noas' }] };
  assert.equal(doneActual(pt), 1);
});

test('ordinal X/N — la posición no depende del tipo de la cita', () => {
  const pt = { id: 'p1', sessions: 10, log: [] };
  const citas = [
    cita('a1', '2026-08-01', FISIO),
    cita('a2', '2026-08-03', RESP),
    cita('a3', '2026-08-05', RESP),
    cita('a4', '2026-08-07', FISIO),
  ];
  assert.deepEqual(citaOrdinal(citas, pt, citas[0]), { x: 1, n: 10 });
  assert.deepEqual(citaOrdinal(citas, pt, citas[1]), { x: 2, n: 10 });
  assert.deepEqual(citaOrdinal(citas, pt, citas[2]), { x: 3, n: 10 });
  assert.deepEqual(citaOrdinal(citas, pt, citas[3]), { x: 4, n: 10 });
  assert.equal(ordinalTexto(citaOrdinal(citas, pt, citas[2])), '3/10');
});

test('ordinalesDeCitas — mismo mapa con citas respiratorias intercaladas', () => {
  const pt = { id: 'p1', sessions: 4, log: [] };
  const citas = [cita('a1', '2026-08-01', RESP), cita('a2', '2026-08-03', FISIO), cita('a3', '2026-08-05', RESP)];
  const mapa = ordinalesDeCitas(citas, () => pt);
  assert.deepEqual([...mapa.values()], [{ x: 1, n: 4 }, { x: 2, n: 4 }, { x: 3, n: 4 }]);
});

// ── Desglose del Resumen del día ─────────────────────────────────────────────
test('desgloseTipos — cuenta por servicio', () => {
  const citas = [cita('a1', '2026-08-01', FISIO), cita('a2', '2026-08-01', RESP), cita('a3', '2026-08-01', RESP)];
  assert.deepEqual(desgloseTipos(citas), { fisio: 1, resp: 2 });
  assert.deepEqual(desgloseTipos([]), { fisio: 0, resp: 0 });
  assert.deepEqual(desgloseTipos(null), { fisio: 0, resp: 0 });
});

test('desgloseTipos — una cita sin tipo (o con uno viejo) cuenta como fisio', () => {
  const citas = [{ id: 'a1', date: '2026-08-01' }, { id: 'a2', date: '2026-08-01', type: 'Kinesioterapia' }];
  assert.deepEqual(desgloseTipos(citas), { fisio: 2, resp: 0 });
});

test('textoDesglose — solo aparece cuando hay respiratoria', () => {
  assert.equal(textoDesglose({ fisio: 3, resp: 2 }), '3 fisio · 2 resp');
  assert.equal(textoDesglose({ fisio: 0, resp: 4 }), '0 fisio · 4 resp');
  assert.equal(textoDesglose({ fisio: 5, resp: 0 }), '');   // día 100% fisio: repetiría el contador
  assert.equal(textoDesglose({ fisio: 0, resp: 0 }), '');
  assert.equal(textoDesglose(null), '');
});

// ── Especialidad del terapeuta ───────────────────────────────────────────────
test('ESPECIALIDADES — los dos valores del CHECK, "fisica" por default', () => {
  assert.deepEqual(ESPECIALIDADES.map(e => e.id), ['fisica', 'respiratoria']);
  assert.equal(ESPECIALIDAD_DEFAULT, 'fisica');
});

test('especialidad — normaliza al catálogo y cae al default', () => {
  assert.equal(especialidad('fisica'), 'fisica');
  assert.equal(especialidad('respiratoria'), 'respiratoria');
  [null, undefined, '', 'Respiratoria', 'otra', 7].forEach(v => assert.equal(especialidad(v), 'fisica'));
});

test('especialidadLabel — etiqueta legible, nunca vacía', () => {
  assert.equal(especialidadLabel('fisica'), 'Física');
  assert.equal(especialidadLabel('respiratoria'), 'Respiratoria');
  assert.equal(especialidadLabel(null), 'Física');
});

test('mapTherapistRow — specialty con default fisica cuando la fila no la trae', () => {
  const th = mapTherapistRow({ id: 't1', name: 'Ana Pérez', start_h: 7, end_h: 13 });
  assert.equal(th.specialty, 'fisica');
  assert.equal(th.initials, 'AP');
  assert.equal(th.spec, '');
  assert.equal(th.colorId, 'ca');
  assert.equal(th.displayOrder, null);
});

test('mapTherapistRow — respeta la especialidad guardada y no la confunde con `spec`', () => {
  const th = mapTherapistRow({ id: 't2', name: 'Luis Mora', spec: 'Fisioterapeuta deportivo',
                              specialty: 'respiratoria', start_h: 8, end_h: 14, color_id: 'cb', display_order: 2 });
  assert.equal(th.specialty, 'respiratoria');
  assert.equal(th.spec, 'Fisioterapeuta deportivo');
  assert.equal(th.displayOrder, 2);
});

test('mapTherapistRow — una specialty basura no rompe el CHECK: cae a fisica', () => {
  assert.equal(mapTherapistRow({ id: 't3', name: 'X Y', specialty: 'pulmonar' }).specialty, 'fisica');
});

test('mapTherapistRow — horario: work_start/work_end en time pasan a horas float', () => {
  const th = mapTherapistRow({ id: 't4', name: 'Ana Ruiz', work_start: '07:30:00', work_end: '13:00:00' });
  assert.equal(th.workStart, 7.5);
  assert.equal(th.workEnd, 13);
});
