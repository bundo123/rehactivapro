// Tests de CTX-1: el contexto clínico de un diagnóstico se cura y se valida, y SOLO el validado
// llega al prompt del informe IA. node --test.
//
// Se prueba la regla pura de utils.js (ctxEstado / ctxParaPrompt / CTX_PLANTILLA); el modal y la
// lista (protocolos.js) solo la pintan. La invalidación en la base la cubre el trigger de
// ctx_protocols.sql, probado aparte contra el mock de Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX_MAX, CTX_PLANTILLA, ctxEstado, ctxParaPrompt } from '../js/utils.js';

const AT = '2026-09-23T15:00:00.000Z';

test('ctxEstado: sin texto es vacío (null, cadena vacía, solo espacios)', () => {
  assert.equal(ctxEstado(null), 'vacio');
  assert.equal(ctxEstado({ clinicalContext: null }), 'vacio');
  assert.equal(ctxEstado({ clinicalContext: '' }), 'vacio');
  assert.equal(ctxEstado({ clinicalContext: '   ' }), 'vacio');
});

test('ctxEstado: un texto vacío con fecha de validación sigue siendo vacío', () => {
  assert.equal(ctxEstado({ clinicalContext: '  ', ctxValidadoAt: AT }), 'vacio');
});

test('ctxEstado: texto sin ctxValidadoAt → sin_validar', () => {
  assert.equal(ctxEstado({ clinicalContext: 'FASE INICIAL: control del dolor' }), 'sin_validar');
  assert.equal(ctxEstado({ clinicalContext: 'FASE INICIAL: x', ctxValidadoPor: 'Giovanni', ctxValidadoAt: null }), 'sin_validar');
});

test('ctxEstado: texto con ctxValidadoAt → validado', () => {
  assert.equal(ctxEstado({ clinicalContext: 'FASE INICIAL: x', ctxValidadoPor: 'Giovanni', ctxValidadoAt: AT }), 'validado');
});

test('ctxParaPrompt: un contexto sin validar NO llega a la IA', () => {
  assert.equal(ctxParaPrompt({ clinicalContext: 'FASE INICIAL: x' }), '');
});

test('ctxParaPrompt: validado → texto con trim', () => {
  assert.equal(ctxParaPrompt({ clinicalContext: '  FASE INICIAL: x \n', ctxValidadoAt: AT }), 'FASE INICIAL: x');
});

test('ctxParaPrompt: validado con 1.500 caracteres → exactamente CTX_MAX', () => {
  const r = ctxParaPrompt({ clinicalContext: 'a'.repeat(1500), ctxValidadoAt: AT });
  assert.equal(r.length, CTX_MAX);
  assert.equal(CTX_MAX, 1200);
});

test('ctxParaPrompt: null → cadena vacía', () => {
  assert.equal(ctxParaPrompt(null), '');
  assert.equal(ctxParaPrompt(undefined), '');
});

test('CTX_PLANTILLA: trae los 7 encabezados del formato fijo y cabe en CTX_MAX', () => {
  const ENCABEZADOS = [
    'FASE INICIAL:', 'FASE INTERMEDIA:', 'FASE AVANZADA / RETORNO:', 'HITOS ESPERADOS:',
    'CRITERIOS DE ALTA:', 'PRECAUCIONES Y SIGNOS DE ALERTA:', 'MEDIDAS DE SEGUIMIENTO:',
  ];
  const lineas = CTX_PLANTILLA.split('\n');
  assert.equal(lineas.length, 7);
  ENCABEZADOS.forEach((h, i) => assert.ok(lineas[i].startsWith(h), `línea ${i + 1} debe empezar con ${h}`));
  assert.ok(CTX_PLANTILLA.length < CTX_MAX);
});
