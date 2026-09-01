// Tests del RENDER de la foto de agenda (js/foto.js) — `node --test`.
//
// Se testea el constructor de HTML, que es puro: devuelve un string y no toca el DOM ni
// html-to-image. Lo que puede romperse sin que nadie lo note (la foto se mira, no se revisa) es
// que un dato salga mal DIBUJADO aunque el mapeo esté bien, así que se fija:
//  · la hora NO en punto (12:30 en la fila de las 12, con la hora real en la celda);
//  · la cita 'por confirmar' (relleno FFC000, y sin N° ni LUGAR);
//  · 'no asistió' tachado;
//  · las cuatro columnas HORA | PACIENTE | N° | LUGAR, las mismas del .xlsx;
//  · el DESBORDE: con más citas que las 13 filas de la plantilla, la foto las dibuja igual al pie
//    del bloque en vez de perderlas (que es lo que hacía antes, en silencio y sin aviso);
//  · que los bloques salgan del MISMO planificarDia() que arma el .xlsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificarDia, GRILLA } from '../js/excel-layout.js';
import { bloquesDeFoto, filasDeFoto, construirHojaFotoHTML, tituloFoto, nombreFoto,
         MAX_DIAS_FOTO, FILAS_HORARIO } from '../js/foto.js';

const TH = [
  { id: 't1', name: 'Marco Barros',   specialty: 'fisica',       colorId: 'ca' },
  { id: 't2', name: 'Axel Escobar',   specialty: 'fisica',       colorId: 'cb' },
  { id: 'r1', name: 'Mariuxi Cuesta', specialty: 'respiratoria', colorId: 'cc' },
];
// Forma de cita que produce datosExport(): ya resuelta (nombre en mayúsculas, ordinal, lugar).
const cita = (id, therapistId, hour, status = 'conf', extra = {}) => ({
  id, date: '2026-08-05', therapistId, hour, status,
  paciente: 'PACIENTE ' + id, numero: 3, lugar: 'C', ...extra,
});
const plan = citas => {
  const p = planificarDia({ fecha: '2026-08-05', citas, terapeutas: TH });
  return { ...p, titulo: tituloFoto('2026-08-05') };
};

// ── Título y nombre de archivo ──────────────────────────────────────────────────────────────
test('tituloFoto — CON tilde, a diferencia del Excel que replica el histórico sin tildes', () => {
  assert.equal(tituloFoto('2026-08-05'), 'MIÉRCOLES 05 DE AGOSTO DEL 2026');
  assert.equal(tituloFoto('2026-08-01'), 'SÁBADO 01 DE AGOSTO DEL 2026');
  assert.equal(tituloFoto('2026-08-03'), 'LUNES 03 DE AGOSTO DEL 2026');
});

test('nombreFoto — un PNG por día', () => {
  assert.equal(nombreFoto('2026-08-05'), 'agenda_2026-08-05.png');
  assert.equal(MAX_DIAS_FOTO, 7);            // una semana: el tope que hace deshabilitar "Mes"
});

// ── Bloques: solo terapeutas con citas, y fila → índice de hora ─────────────────────────────
test('bloquesDeFoto — solo los terapeutas CON citas ocupan columna', () => {
  const b = bloquesDeFoto(plan([cita('a', 't1', 9), cita('c', 'r1', 11)]));
  assert.deepEqual(b.map(x => x.terapeuta.id), ['t1', 'r1']);   // t2, sin citas, no está
  assert.deepEqual(b.map(x => x.especialidad), ['fisica', 'respiratoria']);
});

test('bloquesDeFoto — la fila de cada grilla se traduce al MISMO índice de hora (0 = 07:00)', () => {
  const b = bloquesDeFoto(plan([cita('a', 't1', 9), cita('c', 'r1', 9)]));
  // Física pone las 09:00 en la fila 9 y respiratoria en la 26; las dos son el índice 2.
  assert.equal(GRILLA.fisica.filaPrimera + 2, 9);
  assert.equal(GRILLA.respiratoria.filaPrimera + 2, 26);
  assert.equal(b[0].horas.get(2).id, 'a');
  assert.equal(b[1].horas.get(2).id, 'c');
});

test('bloquesDeFoto — un día sin ninguna cita no produce bloques (ni imagen)', () => {
  assert.deepEqual(bloquesDeFoto(plan([])), []);
  assert.equal(construirHojaFotoHTML(plan([])), null);
});

// ── El HTML dibujado ────────────────────────────────────────────────────────────────────────
test('render — hora NO en punto: va en la fila de las 12 mostrando 12:30', () => {
  const html = construirHojaFotoHTML(plan([cita('a', 't1', 12.5)]));
  const filas = html.match(/<tr>[\s\S]*?<\/tr>/g);
  // 0 = nombres, 1 = headers, 2.. = las 13 horas. 12:00 es el índice de hora 5 → fila 7.
  const filaDeLas12 = filas[2 + (12 - 7)];
  assert.match(filaDeLas12, />12:30</, 'la celda HORA muestra la hora real, no 12:00');
  assert.match(filaDeLas12, /PACIENTE a/, 'el paciente va en esa misma fila');
  // Y no aparece en ninguna otra: la cita ocupa UNA fila.
  assert.equal(filas.filter(f => /PACIENTE a/.test(f)).length, 1);
  assert.equal(filas.length, 2 + 13);
});

test("render — 'por confirmar': ámbar en PACIENTE, y sin N° ni LUGAR", () => {
  const html = construirHojaFotoHTML(plan([cita('p', 't1', 9, 'pend')]));
  const fila = html.match(/<tr>[\s\S]*?<\/tr>/g)[2 + (9 - 7)];
  const celdas = fila.match(/<td[\s\S]*?<\/td>/g);
  assert.equal(celdas.length, 4);                                  // HORA | PACIENTE | N° | LUGAR
  assert.doesNotMatch(celdas[0], /FFC000/, 'la celda HORA es del esqueleto: no se tiñe');
  assert.match(celdas[1], /background:#FFC000/, 'PACIENTE va en ámbar');
  assert.match(celdas[1], /PACIENTE p/);
  assert.match(celdas[2], /background:#FFC000/, 'N° va en ámbar…');
  assert.doesNotMatch(celdas[2], />3</, '…pero VACÍA: por confirmar no consume número');
  assert.match(celdas[3], /background:#FFC000/, 'LUGAR va en ámbar…');
  assert.doesNotMatch(celdas[3], />C</, '…pero VACÍA: por confirmar no lleva lugar');
});

test("render — 'no asistió': el nombre sale tachado y conserva su lugar", () => {
  const html = construirHojaFotoHTML(plan([cita('n', 't1', 10, 'noas')]));
  const celdas = html.match(/<tr>[\s\S]*?<\/tr>/g)[2 + (10 - 7)].match(/<td[\s\S]*?<\/td>/g);
  assert.match(celdas[1], /line-through/);
  assert.match(celdas[1], /PACIENTE n/);
  assert.match(celdas[3], /line-through/);
  assert.doesNotMatch(celdas[1], /FFC000/, 'no asistió no es por confirmar: sin ámbar');
});

test('render — el día con hora no-en-punto Y cita por confirmar, juntos', () => {
  const html = construirHojaFotoHTML(plan([
    cita('x', 't1', 12.5),                        // 12:30 → fila de las 12
    cita('p', 't1', 15.25, 'pend'),               // 15:15 por confirmar → fila de las 15
  ]));
  const filas = html.match(/<tr>[\s\S]*?<\/tr>/g);
  assert.match(filas[2 + 5], />12:30</);
  const pend = filas[2 + 8];
  assert.match(pend, />15:15</, 'la hora real también en la cita por confirmar');
  assert.match(pend, /background:#FFC000/);
  assert.equal(html.includes('MIÉRCOLES 05 DE AGOSTO DEL 2026'), true);
});

test('render — cabecera: título, color del terapeuta y conteo de citas', () => {
  const html = construirHojaFotoHTML(plan([cita('a', 't1', 9), cita('b', 't2', 9)]));
  assert.match(html, /MIÉRCOLES 05 DE AGOSTO DEL 2026/);
  assert.match(html, /2 citas · 2 terapeutas/);
  assert.match(html, /MARCO BARROS/);            // el nombre va en mayúsculas, como en el Excel
  assert.match(html, /background:#e8f5f0/);      // COLOR_OPTIONS 'ca' (verde) del terapeuta
  assert.match(html, /background:#e8f2fb/);      // COLOR_OPTIONS 'cb' (azul)
});

test('render — el nombre del paciente se escapa (no se inyecta HTML en la imagen)', () => {
  const html = construirHojaFotoHTML(plan([cita('a', 't1', 9, 'conf', { paciente: '<img src=x> & "CO"' })]));
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt; &amp; &quot;CO&quot;/);
});

test('render — las cuatro columnas del Excel: HORA | PACIENTE | N° | LUGAR', () => {
  const html = construirHojaFotoHTML(plan([cita('a', 't1', 9)]));
  const headers = html.match(/<tr>[\s\S]*?<\/tr>/g)[1].match(/<td[\s\S]*?<\/td>/g);
  assert.deepEqual(headers.map(h => h.match(/>([^<]*)<\/td>/)[1]), ['HORA', 'PACIENTE', 'N°', 'LUGAR']);
  assert.match(headers[0], /width:58px/);
  assert.match(headers[2], /width:40px/);
  // El N° es el ordinal del episodio que trae la cita, el mismo que el .xlsx y el badge X/N.
  const celdas = html.match(/<tr>[\s\S]*?<\/tr>/g)[2 + (9 - 7)].match(/<td[\s\S]*?<\/td>/g);
  assert.match(celdas[2], />3</);
  assert.match(celdas[2], /text-align:center/);
});

// ── Desborde: la foto no tiene el límite de 13 filas del papel ──────────────────────────────
test('render — 15 citas en un día: las 15 salen en la imagen, ninguna se pierde', () => {
  // Media hora entre citas: planificarDia() llena las 13 filas de la plantilla y deja 2 fuera.
  // En el .xlsx esas 2 son `sobrantes` (se reportan por toast); en la foto TIENEN que dibujarse.
  const citas = [];
  for (let i = 0; i < 15; i++) citas.push(cita('c' + String(i).padStart(2, '0'), 't1', 7 + i * 0.5));
  const p = plan(citas);

  assert.equal(p.rejillas.fisica[0].filas.size, 13, 'la plantilla solo tiene 13 filas…');
  assert.equal(p.rejillas.fisica[0].sobrantes.length, 2, '…y deja 2 citas afuera');

  const b = bloquesDeFoto(p);
  assert.equal(b[0].horas.size, 15, 'el bloque de la foto recupera las 15');
  assert.equal(b[0].desborde, 2);
  assert.equal(filasDeFoto(b), FILAS_HORARIO + 2, 'la tabla crece a 15 filas');

  const html = construirHojaFotoHTML(p);
  const filas = html.match(/<tr>[\s\S]*?<\/tr>/g);
  assert.equal(filas.length, 2 + FILAS_HORARIO + 2, '2 de cabecera + 13 de horario + 2 de desborde');
  // Las 15, cada una una sola vez y ninguna perdida.
  for (let i = 0; i < 15; i++) {
    const nombre = 'PACIENTE c' + String(i).padStart(2, '0');
    assert.equal(filas.filter(f => f.includes(nombre + '<')).length, 1, `falta ${nombre}`);
  }
  assert.match(html, /15 citas · 1 terapeuta/);
  assert.match(html, /no entran en la grilla de 07:00–19:00/, 'la leyenda explica las filas del pie');
});

test('render — las citas de desborde van ordenadas por hora y con su hora real', () => {
  const citas = [];
  for (let i = 0; i < 13; i++) citas.push(cita('lleno' + i, 't1', 7 + i * 0.5));
  citas.push(cita('tarde', 't1', 18.75));      // 18:45
  citas.push(cita('medio', 't1', 13.25));      // 13:15 — llega antes en hora, va primero abajo
  const filas = construirHojaFotoHTML(plan(citas)).match(/<tr>[\s\S]*?<\/tr>/g);

  const d1 = filas[2 + FILAS_HORARIO], d2 = filas[2 + FILAS_HORARIO + 1];
  assert.match(d1, /PACIENTE medio/);
  assert.match(d1, />13:15</, 'la fila de desborde muestra la hora real');
  assert.match(d2, /PACIENTE tarde/);
  assert.match(d2, />18:45</);
});

test('render — sin desborde no hay filas de más ni leyenda de desborde', () => {
  const html = construirHojaFotoHTML(plan([cita('a', 't1', 9)]));
  assert.equal(html.match(/<tr>[\s\S]*?<\/tr>/g).length, 2 + FILAS_HORARIO);
  assert.doesNotMatch(html, /no entran en la grilla/);
});

test('render — el bloque que NO desbordó deja en blanco las filas de desborde del vecino', () => {
  const citas = [];
  for (let i = 0; i < 14; i++) citas.push(cita('c' + i, 't1', 7 + i * 0.5));
  citas.push(cita('solo', 't2', 9));
  const filas = construirHojaFotoHTML(plan(citas)).match(/<tr>[\s\S]*?<\/tr>/g);
  const desborde = filas[2 + FILAS_HORARIO].match(/<td[\s\S]*?<\/td>/g);
  assert.equal(desborde.length, 8, 'dos bloques × 4 columnas');
  assert.match(desborde[1], /PACIENTE c/, 'el bloque que desbordó trae su cita');
  // El vecino: cuatro celdas vacías, sin hora inventada.
  assert.deepEqual(desborde.slice(4).map(c => c.match(/>([^<]*)<\/td>/)[1]), ['', '', '', '']);
});
