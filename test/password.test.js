// Tests de validarPassNueva() — la regla de contraseña nueva compartida por los DOS caminos:
// el modo recuperación (doSetNewPassword, sin sesión, entrando desde el email) y el cambio con
// sesión activa (doCambiarPassword, desde el menú de usuario).
//
// Vive en utils.js justamente para poder testearla: auth.js arrastra el cliente de Supabase.
// Lo que NO se cubre acá (necesita navegador/red, no `node --test`): la reautenticación con
// signInWithPassword previa al updateUser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarPassNueva, PASS_MIN_LEN } from '../js/utils.js';

test('contraseña válida → null (sin error)', () => {
  assert.equal(validarPassNueva('abcd1234', 'abcd1234'), null);
});

test('el mínimo es PASS_MIN_LEN, y el límite exacto pasa', () => {
  const justa = 'a'.repeat(PASS_MIN_LEN);
  assert.equal(validarPassNueva(justa, justa), null);
  const corta = 'a'.repeat(PASS_MIN_LEN - 1);
  assert.equal(validarPassNueva(corta, corta), `Mínimo ${PASS_MIN_LEN} caracteres.`);
});

test('la longitud se valida ANTES que la coincidencia: una corta no dice "no coinciden"', () => {
  assert.equal(validarPassNueva('123', 'otra'), `Mínimo ${PASS_MIN_LEN} caracteres.`);
});

test('largas pero distintas → no coinciden', () => {
  assert.equal(validarPassNueva('abcd1234', 'abcd12345'), 'Las contraseñas no coinciden.');
});

test('vacío, null y undefined caen en el mínimo (no revientan)', () => {
  assert.equal(validarPassNueva('', ''), `Mínimo ${PASS_MIN_LEN} caracteres.`);
  assert.equal(validarPassNueva(null, null), `Mínimo ${PASS_MIN_LEN} caracteres.`);
  assert.equal(validarPassNueva(undefined, undefined), `Mínimo ${PASS_MIN_LEN} caracteres.`);
});

test('los espacios cuentan como caracteres y la comparación es exacta', () => {
  assert.equal(validarPassNueva('        ', '        '), null);
  assert.equal(validarPassNueva('abcd1234 ', 'abcd1234'), 'Las contraseñas no coinciden.');
});
