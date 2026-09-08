// Tests del scrub de PII del informe IA (SEC-2) — node --test.
// Dos mitades igual de importantes: que TACHE la PII real (cédula, correo, celular en sus
// variantes) y que NO TOQUE las cifras clínicas del prompt, que son casi todos números cortos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubPII } from '../lib/informe-scrub.js';

// ── Lo que sí se tacha ────────────────────────────────────────────────────────
test('cédula — 10 dígitos seguidos se tachan', () => {
  assert.equal(scrubPII('Paciente con cédula 1712345678 refiere dolor'),
    'Paciente con cédula [redactado] refiere dolor');
});

test('email — se tacha aunque venga pegado a puntuación', () => {
  assert.equal(scrubPII('Contacto: juan.perez@gmail.com.'),
    'Contacto: [redactado].');
});

test('teléfono +593 con espacios — se tacha', () => {
  assert.equal(scrubPII('Celular +593 98 765 4321 para agendar'),
    'Celular [redactado] para agendar');
  assert.equal(scrubPII('Celular +593987654321'), 'Celular [redactado]');
  assert.equal(scrubPII('Celular +593-98-765-4321'), 'Celular [redactado]');
});

test('teléfono 09xxxxxxxx — se tacha con y sin espacios', () => {
  assert.equal(scrubPII('Llamar al 0987654321'), 'Llamar al [redactado]');
  assert.equal(scrubPII('Llamar al 09 8765 4321'), 'Llamar al [redactado]');
  assert.equal(scrubPII('Llamar al 098 765 4321'), 'Llamar al [redactado]');
});

// ── Lo que NO se puede tocar: las cifras clínicas del prompt ──────────────────
test('"12 sesiones" queda intacto', () => {
  assert.equal(scrubPII('Sesiones realizadas/prescritas: 12/20'),
    'Sesiones realizadas/prescritas: 12/20');
  assert.equal(scrubPII('Lleva 12 sesiones de tratamiento'),
    'Lleva 12 sesiones de tratamiento');
});

test('"45 años" y demás números de 1-8 dígitos quedan intactos', () => {
  assert.equal(scrubPII('Edad: 45 años; EVA 8 → 3; hace 3 semanas; flexión 120 grados'),
    'Edad: 45 años; EVA 8 → 3; hace 3 semanas; flexión 120 grados');
  assert.equal(scrubPII('Fecha 2026-09-08, control a las 09:30'),
    'Fecha 2026-09-08, control a las 09:30');
  assert.equal(scrubPII('Protocolo 12345678'), 'Protocolo 12345678');
});

test('fecha con guiones seguida de una cifra no es un celular', () => {
  // Regresión: con '.' y '-' de separadores, "09-12-2025 12" leía 09 + 8 dígitos y se tachaba.
  assert.equal(scrubPII('sesión 09-12-2025 12 sesiones'), 'sesión 09-12-2025 12 sesiones');
});

// ── Bordes ────────────────────────────────────────────────────────────────────
test('varias PII en el mismo texto se tachan todas', () => {
  assert.equal(
    scrubPII('CI 1712345678, mail ana@clinica.ec, cel 0998877665'),
    'CI [redactado], mail [redactado], cel [redactado]'
  );
});

test('entradas no string o vacías devuelven cadena vacía', () => {
  assert.equal(scrubPII(''), '');
  assert.equal(scrubPII(null), '');
  assert.equal(scrubPII(undefined), '');
  assert.equal(scrubPII(12345), '');
});

test('texto clínico sin PII vuelve byte a byte igual', () => {
  const t = 'Se aplicó terapia manual y ejercicio excéntrico; EVA 7 → 4 tras 6 sesiones.';
  assert.equal(scrubPII(t), t);
});
