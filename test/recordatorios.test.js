// Tests de REC-0: recordatorios de citas por WhatsApp (wa.me) — node --test. Lógica pura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeRecordatorio, filasRecordatorio, citasRecordatorio, fechaRecordatorioDefault,
         waCelular, horaHHMM, cuandoRecordatorio } from '../js/recordatorios.js';

const HOY = new Date(2026, 9, 14, 10, 0);   // miércoles 14/10/2026
const pac = { id: 'p1', name: 'María José Ficticia', tel: '0991234567', diag: 'Lumbalgia', cie10: 'M54.5' };
const ter = { id: 't1', name: 'Ana Ejemplo' };
const cita = (id, date, hour, extra = {}) => ({ id, date, hour, patientId: 'p1', therapistId: 't1', status: 'conf', type: 'Fisioterapia', ...extra });

test('mensajeRecordatorio — primer nombre, tipo, "mañana" con día y fecha, hora hh:mm y terapeuta', () => {
  assert.equal(mensajeRecordatorio(cita('c1', '2026-10-15', 9.5), pac, ter, HOY),
    'Hola María, le recordamos su cita de fisioterapia en Rehactiva mañana jueves 15/10 a las 09:30 con Ana Ejemplo. '
    + 'Si no puede asistir, avísenos por este medio. ¡Gracias!');
});

test('mensajeRecordatorio — terapia respiratoria, hora con minutos exactos y otro día ("el lunes")', () => {
  const t = mensajeRecordatorio(cita('c1', '2026-10-19', 14.75, { type: 'Terapia respiratoria' }), pac, ter, HOY);
  assert.match(t, /su cita de terapia respiratoria en Rehactiva el lunes 19\/10 a las 14:45 con Ana Ejemplo\./);
});

test('mensajeRecordatorio — sin datos clínicos (ni diagnóstico ni CIE-10) y sin terapeuta no inventa uno', () => {
  const t = mensajeRecordatorio(cita('c1', '2026-10-15', 8), pac, null, HOY);
  assert.doesNotMatch(t, /Lumbalgia|M54/);
  assert.match(t, /a las 08:00\. Si no puede/);
});

test('waCelular / filas — teléfono inválido o fijo → sin link (botón deshabilitado)', () => {
  assert.equal(waCelular('0991234567'), '593991234567');
  assert.equal(waCelular('+593 99 123 4567'), '593991234567');
  assert.equal(waCelular(''), '');
  assert.equal(waCelular('12345'), '');
  assert.equal(waCelular('02 234 5678'), '');   // fijo de Quito: wa.me no lo abre
  const pacs = { p1: pac, p2: { id: 'p2', name: 'Sin Celular', tel: '' }, p3: { id: 'p3', name: 'Con Fijo', tel: '022345678' } };
  const citas = [cita('a', '2026-10-15', 9), cita('b', '2026-10-15', 10, { patientId: 'p2' }), cita('c', '2026-10-15', 11, { patientId: 'p3' })];
  const filas = filasRecordatorio(citas, '2026-10-15', id => pacs[id], () => ter, HOY);
  assert.match(filas[0].url, /^https:\/\/wa\.me\/593991234567\?text=Hola%20Mar%C3%ADa%2C/);
  assert.equal(filas[1].url, null);
  assert.equal(filas[2].url, null);
});

test('citasRecordatorio — solo el día elegido, conf o pend, ordenadas por hora', () => {
  const citas = [cita('a', '2026-10-15', 15), cita('b', '2026-10-15', 8, { status: 'pend' }), cita('c', '2026-10-15', 9, { status: 'noas' }),
    cita('d', '2026-10-16', 7), cita('e', '2026-10-15', 10.5)];
  assert.deepEqual(citasRecordatorio(citas, '2026-10-15').map(a => a.id), ['b', 'e', 'a']);
  assert.deepEqual(citasRecordatorio(citas, '2026-10-18'), []);   // domingo sin citas → lista vacía
});

test('fechaRecordatorioDefault — mañana; si hoy es sábado, el lunes', () => {
  assert.equal(fechaRecordatorioDefault(new Date(2026, 9, 14)), '2026-10-15');   // miércoles → jueves
  assert.equal(fechaRecordatorioDefault(new Date(2026, 9, 16)), '2026-10-17');   // viernes → sábado
  assert.equal(fechaRecordatorioDefault(new Date(2026, 9, 17)), '2026-10-19');   // sábado → lunes
  assert.equal(fechaRecordatorioDefault(new Date(2026, 9, 18)), '2026-10-19');   // domingo → lunes
  assert.equal(fechaRecordatorioDefault(new Date(2026, 11, 31)), '2027-01-01');  // cruza el año
});

test('horaHHMM / cuandoRecordatorio — formato y "mañana" solo para el día siguiente', () => {
  assert.equal(horaHHMM(9), '09:00');
  assert.equal(horaHHMM(10.0833333), '10:05');
  assert.equal(cuandoRecordatorio('2026-10-15', HOY), 'mañana jueves 15/10');
  assert.equal(cuandoRecordatorio('2026-10-14', HOY), 'el miércoles 14/10');
});
