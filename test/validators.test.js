// Tests de lógica pura de validación (sin DOM, sin Supabase) — node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCedulaEcuatoriana,
  validateEmail,
  validateTelefono,
} from '../js/validators.js';

test('cédula ecuatoriana — válida (dígito verificador correcto)', () => {
  // 1710034065: provincia 17, tercer dígito 1 (<6), verificador calculado = 5.
  assert.equal(validateCedulaEcuatoriana('1710034065').valid, true);
  // Acepta separadores (espacios/guiones) porque los normaliza antes de validar.
  assert.equal(validateCedulaEcuatoriana('171003-4065').valid, true);
  assert.equal(validateCedulaEcuatoriana('1710 034 065').valid, true);
});

test('cédula ecuatoriana — inválida por dígito verificador', () => {
  // Mismo número con el último dígito cambiado (5 -> 4): rompe el verificador.
  assert.equal(validateCedulaEcuatoriana('1710034064').valid, false);
  assert.equal(validateCedulaEcuatoriana('1710034064').error, 'Cédula ecuatoriana inválida');
});

test('cédula ecuatoriana — inválida por provincia y por tercer dígito', () => {
  assert.equal(validateCedulaEcuatoriana('2510034065').valid, false); // provincia 25 (>24)
  assert.equal(validateCedulaEcuatoriana('0010034065').valid, false); // provincia 00 (<1)
  assert.equal(validateCedulaEcuatoriana('1760034065').valid, false); // tercer dígito 6 (>5)
});

test('cédula ecuatoriana — inválida por longitud / no numérica', () => {
  assert.equal(validateCedulaEcuatoriana('12345').valid, false);
  assert.equal(validateCedulaEcuatoriana('17100340651').valid, false); // 11 dígitos
  assert.equal(validateCedulaEcuatoriana('17100abc65').valid, false);
});

test('cédula ecuatoriana — vacía es válida (campo opcional)', () => {
  assert.equal(validateCedulaEcuatoriana('').valid, true);
  assert.equal(validateCedulaEcuatoriana('   ').valid, true);
});

test('email — válidos e inválidos', () => {
  assert.equal(validateEmail('paciente@rehactivaec.com').valid, true);
  assert.equal(validateEmail('a.b-c@sub.example.co').valid, true);
  assert.equal(validateEmail('').valid, true); // opcional

  assert.equal(validateEmail('noesunmail').valid, false);
  assert.equal(validateEmail('a@b').valid, false);        // sin punto/dominio
  assert.equal(validateEmail('a @b.com').valid, false);   // espacio
  assert.equal(validateEmail('@b.com').valid, false);
});

test('teléfono — válidos (nacional 0… e internacional +…)', () => {
  assert.equal(validateTelefono('0991234567').valid, true);  // celular EC (10 díg.)
  assert.equal(validateTelefono('022345678').valid, true);   // fijo Quito (9 díg.)
  assert.equal(validateTelefono('+593991234567').valid, true);
  assert.equal(validateTelefono('').valid, true); // opcional
});

test('teléfono — inválidos', () => {
  assert.equal(validateTelefono('12345').valid, false);
  assert.equal(validateTelefono('abc').valid, false);
  assert.equal(validateTelefono('+59').valid, false);       // muy corto para internacional
  assert.equal(validateTelefono('1991234567').valid, false); // nacional debe empezar en 0
});
