// Tests del ordinal de cita ("X/N" en la tarjeta de agenda) — node --test.
// X = posición de la cita en la secuencia del paciente dentro de su EPISODIO ACTUAL; N = plan de
// sesiones. Es informativo de agenda: no lo toca facturación. Reglas cubiertas acá: se excluyen
// las 'no asistió' (la siguiente hereda el número), la frontera del episodio es estricta (misma
// que doneActual/tramoEpisodio) y el orden es por fecha y luego hora decimal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citaOrdinal, ordinalesDeCitas, ordinalTexto } from '../js/utils.js';

const cita = (id, date, hour, status = 'conf', patientId = 'p1') =>
  ({ id, date, hour, duration: 60, status, patientId, therapistId: 't1' });
const finEpisodio = (date) => ({ date, type: 'Fin de episodio', status: 'asistió' });

// ── Secuencia simple ──────────────────────────────────────────────────────────
test('citaOrdinal — secuencia simple: 1, 2, 3 sobre el plan del paciente', () => {
  const c1 = cita('a1', '2026-03-02', 9), c2 = cita('a2', '2026-03-04', 9), c3 = cita('a3', '2026-03-06', 9);
  const p = { id: 'p1', sessions: 10, log: [] };
  const lista = [c1, c2, c3];
  assert.deepEqual(citaOrdinal(lista, p, c1), { x: 1, n: 10 });
  assert.deepEqual(citaOrdinal(lista, p, c2), { x: 2, n: 10 });
  assert.deepEqual(citaOrdinal(lista, p, c3), { x: 3, n: 10 });
});

test('citaOrdinal — el orden de la lista no importa, manda la fecha', () => {
  const c1 = cita('a1', '2026-03-02', 9), c2 = cita('a2', '2026-03-04', 9);
  const p = { id: 'p1', sessions: 10, log: [] };
  assert.equal(citaOrdinal([c2, c1], p, c1).x, 1);   // lista desordenada
  assert.equal(citaOrdinal([c2, c1], p, c2).x, 2);
});

test('citaOrdinal — las citas de OTROS pacientes no corren la numeración', () => {
  const mia = cita('a1', '2026-03-04', 9);
  const ajena = cita('b1', '2026-03-02', 9, 'conf', 'p2');
  const p = { id: 'p1', sessions: 10, log: [] };
  assert.equal(citaOrdinal([ajena, mia], p, mia).x, 1);
});

// ── 'no asistió' ──────────────────────────────────────────────────────────────
test('citaOrdinal — una no-asistió en el medio no consume número: la siguiente hereda', () => {
  const c1 = cita('a1', '2026-03-02', 9);
  const nx = cita('a2', '2026-03-04', 9, 'noas');
  const c3 = cita('a3', '2026-03-06', 9);
  const p = { id: 'p1', sessions: 10, log: [] };
  const lista = [c1, nx, c3];
  assert.equal(citaOrdinal(lista, p, c1).x, 1);
  assert.equal(citaOrdinal(lista, p, nx), null);      // la no-asistió no lleva badge
  assert.equal(citaOrdinal(lista, p, c3).x, 2);       // hereda el 2 que habría sido de la no-asistió
});

test('citaOrdinal — varias no-asistió seguidas siguen sin consumir número', () => {
  const c1 = cita('a1', '2026-03-02', 9);
  const n1 = cita('a2', '2026-03-04', 9, 'noas'), n2 = cita('a3', '2026-03-05', 9, 'noas');
  const c4 = cita('a4', '2026-03-06', 9);
  const p = { id: 'p1', sessions: 10, log: [] };
  assert.equal(citaOrdinal([c1, n1, n2, c4], p, c4).x, 2);
});

test('citaOrdinal — la cita pendiente SÍ cuenta (solo la no-asistió se salta)', () => {
  const c1 = cita('a1', '2026-03-02', 9, 'pend'), c2 = cita('a2', '2026-03-04', 9);
  const p = { id: 'p1', sessions: 10, log: [] };
  assert.equal(citaOrdinal([c1, c2], p, c1).x, 1);
  assert.equal(citaOrdinal([c1, c2], p, c2).x, 2);
});

// ── Frontera del episodio ─────────────────────────────────────────────────────
test('citaOrdinal — el episodio nuevo reinicia la numeración en 1', () => {
  const viejo1 = cita('v1', '2026-01-05', 9), viejo2 = cita('v2', '2026-01-10', 9);
  const nuevo1 = cita('n1', '2026-01-20', 9), nuevo2 = cita('n2', '2026-01-22', 9);
  const p = { id: 'p1', sessions: 8, log: [finEpisodio('2026-01-15')] };
  const lista = [viejo1, viejo2, nuevo1, nuevo2];
  assert.deepEqual(citaOrdinal(lista, p, nuevo1), { x: 1, n: 8 });
  assert.deepEqual(citaOrdinal(lista, p, nuevo2), { x: 2, n: 8 });
});

test('citaOrdinal — frontera ESTRICTA: la cita con la fecha del fin queda en el episodio que cierra', () => {
  // Misma frontera (date > fin) que doneActual y que el recorte de tramoEpisodio: la cita del
  // 15 pertenece al episodio anterior, así que no es la "1" del nuevo ni lleva badge.
  const enElCorte = cita('c0', '2026-01-15', 9);
  const nuevo1 = cita('n1', '2026-01-20', 9);
  const p = { id: 'p1', sessions: 8, log: [finEpisodio('2026-01-15')] };
  const lista = [enElCorte, nuevo1];
  assert.equal(citaOrdinal(lista, p, enElCorte), null);
  assert.equal(citaOrdinal(lista, p, nuevo1).x, 1);
});

test('citaOrdinal — con varios "Fin de episodio" manda el ÚLTIMO', () => {
  const p = { id: 'p1', sessions: 8, log: [finEpisodio('2026-01-15'), finEpisodio('2026-03-01')] };
  const c1 = cita('a1', '2026-02-10', 9);   // episodio intermedio, ya cerrado
  const c2 = cita('a2', '2026-03-05', 9);   // episodio actual
  assert.equal(citaOrdinal([c1, c2], p, c1), null);
  assert.equal(citaOrdinal([c1, c2], p, c2).x, 1);
});

test('citaOrdinal — sin marcadores en el log entran TODAS las citas', () => {
  const c1 = cita('a1', '2026-01-05', 9), c2 = cita('a2', '2026-06-05', 9);
  assert.equal(citaOrdinal([c1, c2], { id: 'p1', sessions: 10, log: [] }, c2).x, 2);
  assert.equal(citaOrdinal([c1, c2], { id: 'p1', sessions: 10 }, c2).x, 2);   // sin log siquiera
});

// ── Mismo día: ordena por hora exacta ─────────────────────────────────────────
test('citaOrdinal — dos citas el mismo día se ordenan por hora (decimales incluidos)', () => {
  const tarde = cita('a2', '2026-03-02', 10.75);   // 10:45
  const temprano = cita('a1', '2026-03-02', 10.5); // 10:30
  const p = { id: 'p1', sessions: 10, log: [] };
  assert.equal(citaOrdinal([tarde, temprano], p, temprano).x, 1);
  assert.equal(citaOrdinal([tarde, temprano], p, tarde).x, 2);
});

// ── Paciente sin plan ─────────────────────────────────────────────────────────
test('citaOrdinal — paciente sin plan: n es null (la agenda muestra solo "X")', () => {
  const c1 = cita('a1', '2026-03-02', 9), c2 = cita('a2', '2026-03-04', 9);
  assert.deepEqual(citaOrdinal([c1, c2], { id: 'p1', log: [] }, c2), { x: 2, n: null });
  assert.deepEqual(citaOrdinal([c1, c2], { id: 'p1', sessions: 0, log: [] }, c2), { x: 2, n: null });
  assert.equal(ordinalTexto({ x: 2, n: null }), '2');
  assert.equal(ordinalTexto({ x: 2, n: 10 }), '2/10');
  assert.equal(ordinalTexto(null), '');
});

// ── Sin badge ─────────────────────────────────────────────────────────────────
test('citaOrdinal — cita sin paciente no lleva badge', () => {
  const sinPac = { id: 'x1', date: '2026-03-02', hour: 9, status: 'conf', patientId: null };
  assert.equal(citaOrdinal([sinPac], { id: 'p1', sessions: 10, log: [] }, sinPac), null);
});

test('citaOrdinal — entradas nulas no explotan', () => {
  assert.equal(citaOrdinal(null, null, null), null);
  assert.equal(citaOrdinal([], null, cita('a1', '2026-03-02', 9)), null);   // no está en la lista
});

// ── ordinalesDeCitas: el mapa que usa el render (una pasada por render) ───────
test('ordinalesDeCitas — mismos números que citaOrdinal, por cita y por paciente', () => {
  const a1 = cita('a1', '2026-03-02', 9), a2 = cita('a2', '2026-03-04', 9, 'noas'), a3 = cita('a3', '2026-03-06', 9);
  const b1 = cita('b1', '2026-03-03', 9, 'conf', 'p2'), b2 = cita('b2', '2026-03-05', 9, 'conf', 'p2');
  const pacientes = {
    p1: { id: 'p1', sessions: 10, log: [] },
    p2: { id: 'p2', log: [] },                    // sin plan
  };
  const map = ordinalesDeCitas([a1, a2, b1, a3, b2], id => pacientes[id]);
  assert.deepEqual(map.get(a1), { x: 1, n: 10 });
  assert.equal(map.get(a2), undefined);           // la no-asistió no entra al mapa
  assert.deepEqual(map.get(a3), { x: 2, n: 10 });
  assert.deepEqual(map.get(b1), { x: 1, n: null });
  assert.deepEqual(map.get(b2), { x: 2, n: null });
});

test('ordinalesDeCitas — respeta la frontera de episodio de CADA paciente', () => {
  const a1 = cita('a1', '2026-01-10', 9), a2 = cita('a2', '2026-01-20', 9);
  const b1 = cita('b1', '2026-01-10', 9, 'conf', 'p2'), b2 = cita('b2', '2026-01-20', 9, 'conf', 'p2');
  const pacientes = {
    p1: { id: 'p1', sessions: 5, log: [finEpisodio('2026-01-15')] },
    p2: { id: 'p2', sessions: 5, log: [] },
  };
  const map = ordinalesDeCitas([a1, a2, b1, b2], id => pacientes[id]);
  assert.equal(map.get(a1), undefined);           // episodio cerrado
  assert.deepEqual(map.get(a2), { x: 1, n: 5 });  // reinicia
  assert.deepEqual(map.get(b1), { x: 1, n: 5 });  // p2 no cerró episodio
  assert.deepEqual(map.get(b2), { x: 2, n: 5 });
});

test('ordinalesDeCitas — paciente que no está en el catálogo: numera igual, sin plan', () => {
  const a1 = cita('a1', '2026-03-02', 9), a2 = cita('a2', '2026-03-04', 9);
  const map = ordinalesDeCitas([a1, a2], () => null);
  assert.deepEqual(map.get(a2), { x: 2, n: null });
});

test('ordinalesDeCitas — citas sin paciente quedan fuera del mapa', () => {
  const sinPac = { id: 'x1', date: '2026-03-02', hour: 9, status: 'conf', patientId: null };
  const a1 = cita('a1', '2026-03-04', 9);
  const map = ordinalesDeCitas([sinPac, a1], () => ({ id: 'p1', sessions: 10, log: [] }));
  assert.equal(map.get(sinPac), undefined);
  assert.deepEqual(map.get(a1), { x: 1, n: 10 });
});

test('ordinalesDeCitas — lista vacía o nula', () => {
  assert.equal(ordinalesDeCitas([], () => null).size, 0);
  assert.equal(ordinalesDeCitas(null, () => null).size, 0);
});
