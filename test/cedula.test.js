// Tests del helper de cédula duplicada (guard de savePatient) — node --test. Lógica pura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCedulaDuplicate } from '../js/utils.js';

const pts = [
  { id: 'p1', name: 'María García', cedula: '0912345678' },
  { id: 'p2', name: 'Luis Andrade', cedula: ' 0998877665 ' },
  { id: 'p3', name: 'Sin Cédula', cedula: '' },
];

test('findCedulaDuplicate — detecta otro paciente con la misma cédula', () => {
  const dup = findCedulaDuplicate(pts, '0912345678', null);
  assert.equal(dup?.name, 'María García');
});

test('findCedulaDuplicate — al editar, el propio paciente no cuenta como duplicado', () => {
  assert.equal(findCedulaDuplicate(pts, '0912345678', 'p1'), null);
  assert.equal(findCedulaDuplicate(pts, '0912345678', 'p2')?.name, 'María García');
});

test('findCedulaDuplicate — compara con trim en ambos lados', () => {
  assert.equal(findCedulaDuplicate(pts, '  0998877665 ', null)?.name, 'Luis Andrade');
});

test('findCedulaDuplicate — cédula vacía nunca duplica (aunque haya otros sin cédula)', () => {
  assert.equal(findCedulaDuplicate(pts, '', null), null);
  assert.equal(findCedulaDuplicate(pts, '   ', null), null);
  assert.equal(findCedulaDuplicate(pts, null, null), null);
});
