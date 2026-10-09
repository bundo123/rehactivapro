// Tests de RESP-1 (registro estructurado de la sesión respiratoria) — node --test.
// Cubre las funciones puras de js/soap.js: la normalización que se aplica al escribir y al leer
// session_log.soap, lo mínimo para guardar, la línea de resumen, la nota SOAPIE armada sin IA y la
// sesión respiratoria anterior del episodio (misma frontera estricta que doneActual).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPO_RESP, RESP_TECNICAS, SIGNOS, soapNormalizar, faltantesResp, resumenResp, notaSoapie, respAnterior } from '../js/soap.js';

const completo = () => ({
  llega: 'mejor', tol: 'buena', prox: 'continuar', casa: 'Incentivómetro 3x10',
  resp: { o2: 0, sv: { sat: [92, 95], fc: [88, 80], fr: [22, 18], borg: [4, 2] }, sec: { cant: 'moderada', asp: 'mucopurulenta' },
          med: [{ f: 'salbutamol', d: '2,5 mg' }] },
});

// ── soapNormalizar ────────────────────────────────────────────────────────────
test('soapNormalizar — null, [], {}, basura o solo claves desconocidas → null (nunca {})', () => {
  for (const x of [null, undefined, [], {}, 'x', 7, { foo: 1 }, { resp: {} }, { resp: { sv: {} } }, { llega: 'flotando' }])
    assert.equal(soapNormalizar(x), null);
});

test('soapNormalizar — conserva un registro completo y le pone v:1', () => {
  const out = soapNormalizar(completo());
  assert.equal(out.v, 1);
  assert.deepEqual(out.resp.sv.sat, [92, 95]);
  assert.equal(out.resp.o2, 0);
  assert.deepEqual(out.resp.sec, { cant: 'moderada', asp: 'mucopurulenta' });
  assert.deepEqual(out.resp.med, [{ f: 'salbutamol', d: '2,5 mg' }]);
  assert.deepEqual(soapNormalizar(out), out);          // idempotente: leer lo escrito no lo cambia
});

test('soapNormalizar — valores fuera de catálogo se descartan sin romper el resto', () => {
  const out = soapNormalizar({ llega: 'excelente', tol: 'buena', prox: 'volar', resp: { sec: { cant: 'mucha' } } });
  assert.deepEqual(out, { v: 1, tol: 'buena' });
});

test('soapNormalizar — signos imposibles se descartan; el par se conserva si queda un lado', () => {
  const out = soapNormalizar({ resp: { sv: { sat: [920, 95], fc: [10, 300], fr: ['18', ''], borg: [2.26, null] } } });
  assert.deepEqual(out.resp.sv.sat, [null, 95]);       // 920 es un error de tipeo
  assert.equal(out.resp.sv.fc, undefined);             // ni antes ni después posibles
  assert.deepEqual(out.resp.sv.fr, [18, null]);        // texto numérico se acepta
  assert.deepEqual(out.resp.sv.borg, [2.3, null]);     // Borg con un decimal
});

test('soapNormalizar — oxígeno: 0 = aire ambiente, L/min de a 0,5, fuera de rango se descarta', () => {
  assert.equal(soapNormalizar({ resp: { o2: 0 } }).resp.o2, 0);
  assert.equal(soapNormalizar({ resp: { o2: 2.2 } }).resp.o2, 2);
  assert.equal(soapNormalizar({ resp: { o2: '1,5'.replace(',', '.') } }).resp.o2, 1.5);
  assert.equal(soapNormalizar({ resp: { o2: 40 } }), null);
  assert.equal(soapNormalizar({ resp: { o2: -1 } }), null);
});

test('soapNormalizar — el aspecto de las secreciones no se guarda si no hay secreciones', () => {
  assert.deepEqual(soapNormalizar({ resp: { sec: { cant: 'no', asp: 'purulenta' } } }).resp.sec, { cant: 'no' });
});

test('soapNormalizar — un fármaco sin dosis o fuera de catálogo no se registra; sin duplicados', () => {
  const out = soapNormalizar({ resp: { med: [{ f: 'acetilcisteina', d: '3 ml' }, { f: 'salbutamol', d: ' ' }, { f: 'morfina', d: '1 mg' },
                                              { f: 'ipratropio', d: '500 mcg' }, { f: 'acetilcisteina', d: 'otra' }] } });
  assert.deepEqual(out.resp.med, [{ f: 'ipratropio', d: '500 mcg' }, { f: 'acetilcisteina', d: '3 ml' }]);   // orden de catálogo
});

test('soapNormalizar — el motivo de "no se pudieron tomar" solo vale si no hay ningún signo', () => {
  assert.equal(soapNormalizar({ resp: { nomed: 'Paciente dormido' } }).resp.nomed, 'Paciente dormido');
  assert.equal(soapNormalizar({ resp: { nomed: 'x', sv: { sat: [93, null] } } }).resp.nomed, undefined);
});

test('soapNormalizar — textos recortados al máximo y con espacios colapsados', () => {
  const out = soapNormalizar({ casa: '  caminar   10  min  ', inc: 'x'.repeat(500) });
  assert.equal(out.casa, 'caminar 10 min');
  assert.equal(out.inc.length, 140);
});

// ── faltantesResp ─────────────────────────────────────────────────────────────
test('faltantesResp — un registro completo con técnica no pide nada', () => {
  assert.deepEqual(faltantesResp(completo(), ['Drenaje postural']), []);
});

test('faltantesResp — vacío: pide cómo llega, signos, técnica, tolerancia y próxima, en orden', () => {
  assert.deepEqual(faltantesResp(null, []).map(f => f.k), ['llega', 'signos', 'tec', 'tol', 'prox']);
});

test('faltantesResp — "no se pudieron tomar" con motivo reemplaza a los signos', () => {
  const s = { ...completo(), resp: { nomed: 'Se negó a la oximetría' } };
  assert.deepEqual(faltantesResp(s, ['Drenaje postural']), []);
});

test('faltantesResp — tolerancia mala exige contar qué pasó', () => {
  const s = { ...completo(), tol: 'mala' };
  assert.deepEqual(faltantesResp(s, ['Drenaje postural']).map(f => f.k), ['tol']);
  assert.deepEqual(faltantesResp({ ...s, inc: 'Desaturó a 85 % con la tos' }, ['Drenaje postural']), []);
});

// ── resumenResp ───────────────────────────────────────────────────────────────
test('resumenResp — una línea con signos antes→después, oxígeno, secreciones, medicación, tolerancia y próxima', () => {
  assert.equal(resumenResp(completo()),
    'SatO₂ 92→95 % · FC 88→80 · FR 22→18 · Borg 4→2 · aire ambiente · secreciones moderadas, mucopurulentas'
    + ' · medicación: salbutamol 2,5 mg · tolerancia buena · próxima: continuar igual');
  assert.equal(resumenResp(null), '');
});

test('resumenResp — signo con un solo lado muestra "—" del lado que falta', () => {
  assert.equal(resumenResp({ resp: { sv: { sat: [null, 94] }, o2: 2 } }), 'SatO₂ —→94 % · O₂ 2 L/min');
});

// ── notaSoapie ────────────────────────────────────────────────────────────────
const fila = (extra = {}) => ({ date: '2026-10-06', hour: '08:00', pb: 0, pa: 0, tags: ['Drenaje postural', 'Incentivómetro'], soap: completo(), ...extra });

test('notaSoapie — sin registro devuelve [] (fisio y sesiones viejas no inventan nada)', () => {
  assert.deepEqual(notaSoapie({ date: '2026-10-06', pb: 5, pa: 3, tags: ['Masoterapia'], soap: null }, null), []);
});

test('notaSoapie — letras en orden SOAPIE y cada dato una sola vez (O = al llegar, E = al terminar)', () => {
  // Con una sesión anterior (sin signos que comparar): "Llega mejor que en la sesión anterior".
  const n = notaSoapie(fila(), { date: '2026-10-05', soap: { resp: { o2: 0 } } }, { n: 3, total: 10 });
  assert.deepEqual(n.map(l => l.k), ['S', 'O', 'A', 'P', 'I', 'E']);
  const t = Object.fromEntries(n.map(l => [l.k, l.t]));
  assert.equal(t.S, 'Llega mejor que en la sesión anterior. Dolor 0/10. Disnea (Borg) 4/10.');
  assert.equal(t.O, 'SatO₂ 92 %, FC 88 lpm, FR 22 rpm (aire ambiente). Secreciones moderadas, mucopurulentas.');
  assert.equal(t.A, 'En la sesión: SatO₂ +3, FC −8, FR −4, Borg −2. Sesión 3 de 10.');
  assert.equal(t.P, 'Próxima sesión: continuar igual. Para casa: Incentivómetro 3x10.');
  assert.equal(t.I, 'Drenaje postural, Incentivómetro. Medicación: Salbutamol 2,5 mg.');
  assert.equal(t.E, 'Al terminar: SatO₂ 95 %, FC 80 lpm, FR 18 rpm. Disnea (Borg) 2/10. Dolor 0/10. Tolerancia buena.');
});

test('notaSoapie — el Análisis compara con la sesión anterior al llegar y avisa si llega peor o tolera mal', () => {
  const prev = { date: '2026-10-05', soap: { resp: { sv: { sat: [90, 93], fr: [24, 20] } } } };
  const s = fila({ soap: { ...completo(), llega: 'peor', tol: 'mala', inc: 'tos persistente' } });
  const A = notaSoapie(s, prev).find(l => l.k === 'A').t;
  assert.match(A, /Al llegar, frente a la sesión del 05\/10\/2026: SatO₂ 90 → 92 %, FR 24 → 22 rpm\./);
  assert.match(A, /Atención: llega peor y tolerancia mala\./);
  assert.equal(notaSoapie(s, prev).find(l => l.k === 'E').t.endsWith('Tolerancia mala. Tos persistente.'), true);
});

test('notaSoapie — no muestra lo que no se registró (sin EVA, sin signos: motivo en O, sin letra A)', () => {
  const n = notaSoapie({ date: '2026-10-06', pb: null, pa: null, tags: ['Drenaje postural'],
                         soap: { llega: 'igual', tol: 'buena', prox: 'ajustar', resp: { nomed: 'Sin oxímetro' } } },
                       { date: '2026-10-05', soap: { resp: { o2: 0 } } });   // MINI-1: "que en la anterior" pide una anterior
  const t = Object.fromEntries(n.map(l => [l.k, l.t]));
  assert.equal(t.S, 'Llega igual que en la sesión anterior.');
  assert.equal(t.O, 'Signos no tomados: Sin oxímetro.');
  assert.equal(t.A, undefined);
  assert.equal(t.E, 'Tolerancia buena.');
});

// ── respAnterior ──────────────────────────────────────────────────────────────
test('respAnterior — la sesión respiratoria con registro más reciente del episodio actual', () => {
  const p = { log: [
    { date: '2026-09-01', hour: '08:00', type: TIPO_RESP, soap: { resp: { o2: 0 } } },
    { date: '2026-09-02', hour: '08:00', type: 'Fin de episodio' },
    { date: '2026-10-04', hour: '08:00', type: TIPO_RESP, soap: { resp: { o2: 1 } } },
    { date: '2026-10-05', hour: '17:00', type: TIPO_RESP, soap: { resp: { o2: 2 } } },
    { date: '2026-10-05', hour: '18:00', type: 'Fisioterapia', soap: null },
    { date: '2026-10-06', hour: '08:00', type: TIPO_RESP, soap: null },
  ] };
  assert.equal(respAnterior(p).date, '2026-10-05');
  assert.equal(respAnterior(p, { date: '2026-10-05', hour: '17:00' }).date, '2026-10-04');
  assert.equal(respAnterior(p, { date: '2026-10-04', hour: '08:00' }), null);     // no cruza el Fin de episodio
  assert.equal(respAnterior({ log: [] }), null);
});

// ── Catálogos ─────────────────────────────────────────────────────────────────
test('catálogos — técnicas sin duplicados y signos con límites coherentes', () => {
  assert.equal(new Set(RESP_TECNICAS).size, RESP_TECNICAS.length);
  for (const s of SIGNOS) assert.ok(s.min < s.max, s.id);
});
