// Tests del número de WhatsApp para wa.me (CORR-12) — lógica pura, node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waNumber } from '../js/utils.js';

test('waNumber — formato nacional: descarta el 0 y antepone 593', () => {
  assert.equal(waNumber('0991234567'), '593991234567');
});

test('waNumber — internacional con separadores: limpia y no duplica el 593', () => {
  assert.equal(waNumber('+593 99 123 4567'), '593991234567');
});

test('waNumber — ya normalizado: idempotente', () => {
  assert.equal(waNumber('593991234567'), '593991234567');
});

test('waNumber — vacío devuelve cadena vacía', () => {
  assert.equal(waNumber(''), '');
});

test('waNumber — null/undefined devuelve cadena vacía', () => {
  assert.equal(waNumber(null), '');
  assert.equal(waNumber(undefined), '');
});

test('waNumber — menos de 9 dígitos devuelve cadena vacía', () => {
  assert.equal(waNumber('12345'), '');
});
