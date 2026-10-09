// Tests de MINI-1: arreglos detectados en un informe real — node --test.
//  1. api/informe.js (modo informe): max_tokens 2.048 y nunca texto cortado (stop_reason ≠ end_turn → 500).
//  2. prompt-informe.js: sin AVD supuestas, sin cambiar términos clínicos, "EVA inicial: no medido".
//  3-4. avisosSesion (utils.js): nota igual a otra sesión y otra sesión el mismo día (no bloquean).
//  6. tieneEva / buildEvaSvg: la sesión con solo el "después" entra al gráfico.
//  7. textoDeltaEva: "1 punto", "sin cambio".
//  8. soap.js: primera sesión respiratoria del episodio sin "cómo llega frente a la anterior".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/informe.js';
import { promptInformePaciente, evalTextoPrompt } from '../js/prompt-informe.js';
import { avisosSesion, notaRepetida, sesionMismoDia, ddmm, tieneEva, textoDeltaEva, buildEvaSvg } from '../js/utils.js';
import { faltantesResp, notaSoapie } from '../js/soap.js';

// ── 1. informe sin cortes ─────────────────────────────────────────────────────
let uid = 0;
async function informe(anthropic) {
  const enviados = [];
  const userId = 'mini1-' + (++uid);
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: userId }) };
    if (String(url).includes('/rest/v1/profiles')) return { ok: true, json: async () => [{ role: 'admin' }] };
    enviados.push(JSON.parse(opts.body));
    return { ok: true, json: async () => anthropic };
  };
  const res = { code: 0, json: null, status(c) { this.code = c; return this; }, json(j) { this.json = j; return this; } };
  try { await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { prompt: 'Informe de prueba' } }, res); }
  finally { globalThis.fetch = fetchReal; }
  return { code: res.code, body: res.json, enviados };
}

test('informe: stop_reason max_tokens → 500 "incompleto", nunca el texto cortado', async () => {
  const r = await informe({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'RECOMENDACIONES: Se sugiere fortal' }] });
  assert.equal(r.code, 500);
  assert.deepEqual(r.body, { error: 'El informe salió incompleto. Intenta de nuevo.' });
  assert.equal(r.enviados[0].max_tokens, 2048);
});

test('informe: refusal también es 500; end_turn devuelve el texto', async () => {
  assert.equal((await informe({ stop_reason: 'refusal', content: [] })).code, 500);
  const ok = await informe({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'CONDICIÓN INICIAL: …' }] });
  assert.equal(ok.code, 200);
  assert.deepEqual(ok.body, { text: 'CONDICIÓN INICIAL: …' });
});

// ── 2. prompt del informe ─────────────────────────────────────────────────────
const pac = { id: 'p1', status: 'active', diag: 'Lumbalgia', birth_date: '1980-01-01', log: [] };
const prompt = (log, extra = {}) => promptInformePaciente({ p: pac, log, epDiag: 'Lumbalgia', epSessions: 10, epDone: 1,
  esActual: true, prot: null, tieneMedico: false, ...extra });
const evalRow = (pb) => ({ type: 'Evaluación inicial', date: '2026-09-01', pb, note: 'Dolor lumbar al flexionar' });
const ses = { type: 'Fisioterapia', date: '2026-09-02', pb: 5, pa: 3, tags: ['Masoterapia'], note: 'Masoterapia lumbar' };

test('prompt: AVD solo si aparecen en los datos; limitaciones "registradas"', () => {
  const t = prompt([evalRow(6), ses]);
  assert.ok(t.includes('Menciona actividades de la vida diaria SOLO si aparecen en los datos; no las supongas ni las deduzcas.'));
  assert.ok(t.includes('nivel de dolor y limitaciones funcionales registradas.'));
  assert.ok(!t.includes('qué no podía hacer'));
  assert.ok(!t.includes('sobre todo el impacto en las actividades de la vida diaria'));
});

test('prompt: no reemplazar términos clínicos por otros parecidos', () => {
  assert.ok(prompt([ses]).includes("No reemplaces términos clínicos por otros parecidos (por ejemplo, 'sin complicaciones' no es 'sin compensaciones')."));
});

test('prompt: evaluación sin EVA → "EVA inicial: no medido", nunca "?/10"', () => {
  assert.equal(evalTextoPrompt(evalRow(null)), 'EVA inicial: no medido. Hallazgos: Dolor lumbar al flexionar');
  assert.equal(evalTextoPrompt(evalRow(7)), 'EVA inicial 7/10. Hallazgos: Dolor lumbar al flexionar');
  assert.equal(evalTextoPrompt(evalRow(0)), 'EVA inicial 0/10. Hallazgos: Dolor lumbar al flexionar');
  assert.equal(evalTextoPrompt(null), 'No hay evaluación inicial registrada');
  const t = prompt([evalRow(null), ses]);
  assert.ok(t.includes('EVA inicial: no medido.'));
  assert.ok(!t.includes('?/10'));
});

// ── 3-4. avisos del guardado ──────────────────────────────────────────────────
const log = [
  { id: 1, date: '2026-10-01', hour: '09:00:00', type: 'Fisioterapia', note: 'Masoterapia lumbar 10 min' },
  { id: 2, date: '2026-10-03', hour: '09:00:00', type: 'Fisioterapia', note: '  MASOTERAPIA lumbar 10 min ' },
  { id: 3, date: '2026-10-05', hour: '10:00:00', type: 'Evaluación inicial', note: 'Anamnesis' },
  { id: 4, date: '2026-10-06', hour: '10:00:00', type: 'Fin de episodio', note: 'Episodio anterior: X · 2 sesiones completadas' },
];

test('nota repetida: trim y sin distinguir mayúsculas → aviso con la fecha más reciente', () => {
  assert.deepEqual(avisosSesion({ log, note: 'masoterapia LUMBAR 10 min', date: '2026-10-08' }),
    ['Esta nota es igual a la del 03/10. Si la sesión fue distinta, descríbela.']);
});

test('nota repetida: la propia sesión (por id o por fecha+hora) no cuenta; nota vacía o distinta no avisa', () => {
  assert.equal(notaRepetida(log, 'Masoterapia lumbar 10 min', { id: 2 })?.id, 1);
  assert.equal(notaRepetida([log[0]], 'Masoterapia lumbar 10 min', { id: 1 }), null);
  assert.equal(notaRepetida([log[0]], 'Masoterapia lumbar 10 min', { date: '2026-10-01', hour: '9:00' }), null);
  assert.equal(notaRepetida(log, '   ', null), null);
  assert.equal(notaRepetida(log, 'Masoterapia lumbar 15 min', null), null);
  // El texto de un "Fin de episodio" no es una nota de sesión.
  assert.equal(notaRepetida(log, 'Episodio anterior: X · 2 sesiones completadas', null), null);
});

test('mismo día: solo sesiones de tratamiento, solo si se pide (sesión manual)', () => {
  assert.deepEqual(avisosSesion({ log, note: 'Otra cosa', date: '2026-10-03', mismoDia: true }),
    ['Ya hay una sesión registrada el 03/10. ¿Es otra sesión distinta?']);
  assert.deepEqual(avisosSesion({ log, note: 'Otra cosa', date: '2026-10-03' }), []);
  assert.equal(sesionMismoDia(log, '2026-10-05'), null);   // evaluación inicial
  assert.equal(sesionMismoDia(log, '2026-10-06'), null);   // fin de episodio
  assert.equal(sesionMismoDia(log, '2026-10-07'), null);
});

test('los dos avisos juntos, en orden', () => {
  assert.deepEqual(avisosSesion({ log, note: 'Masoterapia lumbar 10 min', date: '2026-10-01', mismoDia: true }), [
    'Esta nota es igual a la del 03/10. Si la sesión fue distinta, descríbela.',
    'Ya hay una sesión registrada el 01/10. ¿Es otra sesión distinta?',
  ]);
  assert.equal(ddmm('2026-10-08'), '08/10');
});

// ── 6. gráfico EVA ────────────────────────────────────────────────────────────
const circulos = svg => (svg.match(/<circle /g) || []).length;

test('tieneEva: antes o después medido', () => {
  assert.equal(tieneEva({ pb: 5, pa: null }), true);
  assert.equal(tieneEva({ pb: null, pa: 3 }), true);
  assert.equal(tieneEva({ pb: 0, pa: null }), true);
  assert.equal(tieneEva({ pb: null, pa: null }), false);
  assert.equal(tieneEva(null), false);
});

test('buildEvaSvg: la sesión con solo el "después" puntúa con ese valor', () => {
  const m = { metricas: { evaInicial: 7, evaInicialFuente: 'eval', evaActual: 2 }, evalInicial: { fecha: '2026-09-01', pb: 7 },
    sesiones: [{ fecha: '2026-09-02', pb: 6, pa: 5 }, { fecha: '2026-09-04', pb: null, pa: 4 }, { fecha: '2026-09-06', pb: 3, pa: 2 }] };
  const svg = buildEvaSvg(m);
  assert.equal(circulos(svg), 4);                       // inicio + 3 sesiones (antes: inicio + 2)
  assert.match(svg, />Sesión 2</);
  assert.match(svg, />4</);
});

test('buildEvaSvg: sin dolor inicial conocido, la serie arranca en la primera sesión (sin punto 0 en el piso)', () => {
  const m = { metricas: { evaInicial: null, evaActual: 3 }, sesiones: [{ fecha: '2026-09-02', pb: null, pa: 4 }, { fecha: '2026-09-04', pb: null, pa: 3 }] };
  const svg = buildEvaSvg(m);
  assert.equal(circulos(svg), 2);
  assert.doesNotMatch(svg, />Inicio</);
});

test('buildEvaSvg: snapshot viejo (todas con "antes") da el mismo gráfico que antes', () => {
  const m = { metricas: { evaInicial: 6, evaActual: 3 }, evalInicial: null,
    sesiones: [{ fecha: '2026-09-04', pb: 6, pa: 4 }, { fecha: '2026-09-06', pb: null, pa: null }, { fecha: '2026-09-08', pb: 5, pa: 3 }] };
  const svg = buildEvaSvg(m);
  assert.equal(circulos(svg), 3);                       // inicio + las 2 con EVA; la vacía no puntúa
  assert.match(svg, />Sesión 3</);
  assert.doesNotMatch(svg, />Sesión 2</);
});

// ── 7. tarjeta "Dolor EVA" ────────────────────────────────────────────────────
test('textoDeltaEva: singular, plural y "sin cambio"', () => {
  assert.equal(textoDeltaEva(-1), '−1 punto');
  assert.equal(textoDeltaEva(1), '+1 punto');
  assert.equal(textoDeltaEva(-3), '−3 puntos');
  assert.equal(textoDeltaEva(2), '+2 puntos');
  assert.equal(textoDeltaEva(0), 'sin cambio');
  assert.equal(textoDeltaEva(null), '');
});

// ── 8. primera sesión respiratoria ────────────────────────────────────────────
const soapSinLlega = { tol: 'buena', prox: 'continuar', resp: { o2: 0, sv: { sat: [92, 95] } } };

test('faltantesResp: sin sesión anterior no pide "cómo llega"; con anterior sí', () => {
  assert.deepEqual(faltantesResp(soapSinLlega, ['Drenaje postural'], false), []);
  assert.deepEqual(faltantesResp(soapSinLlega, ['Drenaje postural'], true).map(f => f.k), ['llega']);
  assert.deepEqual(faltantesResp(soapSinLlega, ['Drenaje postural']).map(f => f.k), ['llega']);   // por defecto: como antes
});

test('notaSoapie: sin sesión anterior no escribe "que en la sesión anterior"', () => {
  const fila = { date: '2026-10-06', hour: '08:00', pb: 2, pa: 1, tags: ['Drenaje postural'], soap: { ...soapSinLlega, llega: 'mejor' } };
  const S = notaSoapie(fila, null).find(l => l.k === 'S').t;
  assert.equal(S, 'Dolor 2/10.');
  const prev = { date: '2026-10-05', soap: { resp: { o2: 0 } } };
  assert.equal(notaSoapie(fila, prev).find(l => l.k === 'S').t, 'Llega mejor que en la sesión anterior. Dolor 2/10.');
});
