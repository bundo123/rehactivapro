// Tests de ROM-1 (goniometría estructurada) — node --test.
// Cubre el catálogo AAOS y las funciones puras de js/rom.js: la normalización que se aplica al
// escribir y al leer session_log.rom, el % del normal, el texto de vista y la última medición del
// episodio actual (misma frontera estricta que doneActual).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROM_CATALOGO, ROM_MAX, romMov, romNormalizar, romLeerItems, romPct, romTexto, ultimaMedicion } from '../js/rom.js';

const it_ = (j, m, l, v) => ({ j, m, l, v });

// ── Catálogo ──────────────────────────────────────────────────────────────────
test('catálogo — 13 articulaciones, sin ids duplicados (j global, m por articulación)', () => {
  assert.equal(ROM_CATALOGO.length, 13);
  const js = ROM_CATALOGO.map(a => a.id);
  assert.equal(new Set(js).size, js.length);
  for (const a of ROM_CATALOGO) {
    const ms = a.movs.map(m => m.id);
    assert.equal(new Set(ms).size, ms.length, `movimiento duplicado en ${a.id}`);
    for (const m of a.movs) assert.equal(typeof m.normal, 'number');
  }
});

test('romMov — encuentra articulación y movimiento; null si no existe', () => {
  const r = romMov('hombro', 'flex');
  assert.equal(r.art.nombre, 'Hombro');
  assert.equal(r.mov.normal, 180);
  assert.equal(romMov('hombro', 'pron'), null);
  assert.equal(romMov('rodillo', 'flex'), null);
});

// ── romNormalizar ─────────────────────────────────────────────────────────────
test('romNormalizar — descarta articulación o movimiento desconocidos', () => {
  const out = romNormalizar([it_('rodillo', 'flex', 'D', 90), it_('hombro', 'volar', 'D', 90), it_('hombro', 'flex', 'D', 120)]);
  assert.deepEqual(out, [it_('hombro', 'flex', 'D', 120)]);
});

test('romNormalizar — lado inválido: l en columna y l null en articulación con lados', () => {
  assert.equal(romNormalizar([it_('cervical', 'flex', 'D', 40)]), null);
  assert.equal(romNormalizar([it_('hombro', 'flex', null, 120)]), null);
  assert.equal(romNormalizar([it_('hombro', 'flex', 'X', 120)]), null);
  assert.deepEqual(romNormalizar([it_('cervical', 'flex', null, 40)]), [it_('cervical', 'flex', null, 40)]);
  // l ausente en columna cuenta como null
  assert.deepEqual(romNormalizar([{ j: 'cervical', m: 'ext', v: 30 }]), [it_('cervical', 'ext', null, 30)]);
});

test('romNormalizar — v no numérico, NaN, Infinity o fuera de rango se descartan', () => {
  assert.equal(romNormalizar([it_('hombro', 'flex', 'D', NaN)]), null);
  assert.equal(romNormalizar([it_('hombro', 'flex', 'D', Infinity)]), null);
  assert.equal(romNormalizar([it_('hombro', 'flex', 'D', '120')]), null);
  assert.equal(romNormalizar([it_('hombro', 'flex', 'D', 201)]), null);
  assert.equal(romNormalizar([it_('rodilla', 'ext', 'D', -31)]), null);
  assert.equal(romNormalizar([it_('dorsolumbar', 'schober', null, 16)]), null);
  assert.equal(romNormalizar([it_('dorsolumbar', 'schober', null, -1)]), null);
  // bordes incluidos
  assert.equal(romNormalizar([it_('hombro', 'flex', 'D', 200), it_('rodilla', 'ext', 'I', -30),
    it_('dorsolumbar', 'schober', null, 0)]).length, 3);
});

test('romNormalizar — dedup por (j,m,l) quedándose con el ÚLTIMO', () => {
  const out = romNormalizar([it_('hombro', 'flex', 'D', 100), it_('hombro', 'flex', 'I', 150), it_('hombro', 'flex', 'D', 120)]);
  assert.deepEqual(out, [it_('hombro', 'flex', 'D', 120), it_('hombro', 'flex', 'I', 150)]);
});

test('romNormalizar — orden estable: catálogo, movimiento, D antes que I', () => {
  const out = romNormalizar([
    it_('rodilla', 'flex', 'I', 120), it_('hombro', 'abd', 'D', 170), it_('rodilla', 'flex', 'D', 110),
    it_('cervical', 'rot_i', null, 50), it_('hombro', 'flex', 'I', 160), it_('cervical', 'flex', null, 40),
  ]);
  assert.deepEqual(out.map(x => `${x.j}.${x.m}.${x.l}`), [
    'cervical.flex.null', 'cervical.rot_i.null', 'hombro.flex.I', 'hombro.abd.D', 'rodilla.flex.D', 'rodilla.flex.I',
  ]);
});

test('romNormalizar — [] y no-array → null (nunca [])', () => {
  assert.equal(romNormalizar([]), null);
  assert.equal(romNormalizar(null), null);
  assert.equal(romNormalizar(undefined), null);
  assert.equal(romNormalizar({ j: 'hombro', m: 'flex', l: 'D', v: 1 }), null);
  assert.equal(romNormalizar('[]'), null);
  assert.equal(romNormalizar([null, 3, 'x']), null);
});

// El catálogo completo con todos los lados: lo máximo que el editor puede producir.
const catalogoCompleto = () => {
  const todo = [];
  for (const a of ROM_CATALOGO) for (const m of a.movs)
    for (const l of a.lados ? ['D', 'I'] : [null]) todo.push(it_(a.id, m.id, l, m.unidad === 'cm' ? 4 : 10));
  return todo;
};

test('romNormalizar — tope 120 (el CHECK de la DB): el catálogo completo (107) entra entero', () => {
  assert.equal(ROM_MAX, 120);
  const todo = catalogoCompleto();
  assert.equal(todo.length, 107);
  const out = romNormalizar([...todo, ...todo]);   // duplicados no inflan el resultado
  assert.equal(out.length, 107);
  assert.ok(out.length <= ROM_MAX);
  assert.deepEqual(out.at(-1), it_('dedos_pie', 'ifd_ext', 'I', 10));   // no se corta nada del final
});

test('romNormalizar — no arrastra propiedades extra', () => {
  assert.deepEqual(romNormalizar([{ j: 'codo', m: 'flex', l: 'D', v: 140, normal: 999, x: 1 }]), [it_('codo', 'flex', 'D', 140)]);
});

// ── romLeerItems (lo que usan los guardados para bloquear) ────────────────────
test('romLeerItems — todo válido → 0 descartados', () => {
  const r = romLeerItems([it_('hombro', 'flex', 'D', 120), it_('dorsolumbar', 'schober', null, 4)]);
  assert.equal(r.descartados, 0);
  assert.equal(r.rom.length, 2);
});

test('romLeerItems — un 250 en grados y un 20 en Schober → 2 descartados', () => {
  const r = romLeerItems([it_('hombro', 'flex', 'D', 250), it_('dorsolumbar', 'schober', null, 20), it_('codo', 'flex', 'I', 140)]);
  assert.equal(r.descartados, 2);
  assert.deepEqual(r.rom, [it_('codo', 'flex', 'I', 140)]);
});

test('romLeerItems — cuenta también NaN y j/m/l inválidos', () => {
  const r = romLeerItems([it_('hombro', 'flex', 'D', NaN), it_('hombro', 'volar', 'D', 90), it_('cervical', 'flex', 'D', 40)]);
  assert.deepEqual(r, { rom: null, descartados: 3 });
});

test('romLeerItems — un duplicado válido NO es descartado', () => {
  const r = romLeerItems([it_('hombro', 'flex', 'D', 100), it_('hombro', 'flex', 'D', 120)]);
  assert.equal(r.descartados, 0);
  assert.deepEqual(r.rom, [it_('hombro', 'flex', 'D', 120)]);
});

test('romLeerItems — entrada vacía → {rom:null, descartados:0}', () => {
  assert.deepEqual(romLeerItems([]), { rom: null, descartados: 0 });
  assert.deepEqual(romLeerItems(null), { rom: null, descartados: 0 });
});

// ── romPct ────────────────────────────────────────────────────────────────────
test('romPct — normal > 0 redondea; normal 0 o negativo → null; Schober 5/4 → 125', () => {
  assert.equal(romPct(it_('hombro', 'flex', 'D', 120)), 67);
  assert.equal(romPct(it_('hombro', 'flex', 'D', 90)), 50);
  assert.equal(romPct(it_('codo', 'ext', 'D', -5)), null);       // normal 0
  assert.equal(romPct(it_('rodilla', 'ext', 'I', -5)), null);    // normal −10
  assert.equal(romPct(it_('dorsolumbar', 'schober', null, 5)), 125);
  assert.equal(romPct(it_('nada', 'flex', 'D', 5)), null);
});

// ── romTexto ──────────────────────────────────────────────────────────────────
test('romTexto — con %, sin % (normal ≤ 0), columna y Schober', () => {
  assert.equal(romTexto(it_('hombro', 'flex', 'D', 120)), 'Hombro D · Flexión 120° / 180° (67%)');
  assert.equal(romTexto(it_('rodilla', 'ext', 'I', -5)), 'Rodilla I · Extensión -5° / -10°');
  assert.equal(romTexto(it_('cervical', 'rot_d', null, 30)), 'Columna cervical · Rotación der. 30° / 60° (50%)');
  assert.equal(romTexto(it_('dorsolumbar', 'schober', null, 3)), 'Columna dorsolumbar · Test de Schober 3 cm / ≥4 cm (75%)');
});

// ── ultimaMedicion ────────────────────────────────────────────────────────────
const fila = (date, hour, type, rom) => ({ id: date + hour, date, hour, type, status: 'asistió', rom });
const R = v => [it_('hombro', 'flex', 'D', v)];

test('ultimaMedicion — respeta la frontera ESTRICTA del Fin de episodio', () => {
  const p = { log: [
    fila('2026-08-01', '09:00:00', 'Fisioterapia', R(90)),
    fila('2026-08-10', '00:00', 'Fin de episodio', null),
    fila('2026-08-10', '10:00:00', 'Fisioterapia', R(95)),   // mismo día que el fin → episodio cerrado
  ] };
  assert.equal(ultimaMedicion(p), null);
  p.log.push(fila('2026-08-11', '10:00:00', 'Fisioterapia', R(100)));
  assert.equal(ultimaMedicion(p).rom[0].v, 100);
});

test('ultimaMedicion — incluye la Evaluación inicial', () => {
  const p = { log: [
    fila('2026-08-01', '00:00', 'Evaluación inicial', R(80)),
    fila('2026-08-03', '09:00:00', 'Fisioterapia', null),
  ] };
  assert.equal(ultimaMedicion(p).type, 'Evaluación inicial');
});

test('ultimaMedicion — la más reciente por fecha y luego por hora (hora normalizada)', () => {
  const p = { log: [
    fila('2026-08-05', '17:00:00', 'Fisioterapia', R(110)),
    fila('2026-08-06', '9:00', 'Fisioterapia', R(120)),
    fila('2026-08-06', '00:00', 'Evaluación inicial', R(100)),
    fila('2026-08-06', '10:30:00', 'Fisioterapia', R(130)),
    fila('2026-08-04', '18:00:00', 'Fisioterapia', R(90)),
  ] };
  assert.equal(ultimaMedicion(p).rom[0].v, 130);
});

test('ultimaMedicion — ignora filas con rom inválido; null sin mediciones', () => {
  const p = { log: [
    fila('2026-08-01', '09:00:00', 'Fisioterapia', R(90)),
    fila('2026-08-02', '09:00:00', 'Fisioterapia', []),
    fila('2026-08-03', '09:00:00', 'Fisioterapia', [it_('hombro', 'flex', null, 90)]),
    fila('2026-08-04', '09:00:00', 'Fisioterapia', 'basura'),
  ] };
  assert.equal(ultimaMedicion(p).date, '2026-08-01');
  assert.equal(ultimaMedicion({ log: [fila('2026-08-01', '09:00:00', 'Fisioterapia', null)] }), null);
  assert.equal(ultimaMedicion({}), null);
  assert.equal(ultimaMedicion(null), null);
});
