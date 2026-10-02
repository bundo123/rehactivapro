// ROM-1 — Goniometría estructurada (session_log.rom jsonb).
// Cada medición se guarda como {j, m, l, v}:
//   j = id de articulación · m = id de movimiento · l = 'D' | 'I' | null (null en columna)
//   v = número (grados; cm en Schober)
// Los valores normales NO se guardan: viven en este catálogo. La DB solo exige array de 1..120
// elementos (session_log_rom_chk); sin mediciones se escribe null, nunca [].
import { esc, lastFinDate, normHour } from './utils.js';

// Normales AAOS según hoja de la clínica. La oposición del pulgar (regla hasta hipotenar) no tiene
// normal numérico: queda fuera de v1.
// lados:true = se mide D e I por separado.
export const ROM_CATALOGO = [
  {id:'cervical',nombre:'Columna cervical',lados:false,movs:[
    {id:'flex',nombre:'Flexión',normal:45},{id:'ext',nombre:'Extensión',normal:45},
    {id:'incl_d',nombre:'Inclinación lateral der.',normal:45},{id:'incl_i',nombre:'Inclinación lateral izq.',normal:45},
    {id:'rot_d',nombre:'Rotación der.',normal:60},{id:'rot_i',nombre:'Rotación izq.',normal:60}]},
  {id:'dorsolumbar',nombre:'Columna dorsolumbar',lados:false,movs:[
    {id:'incl_d',nombre:'Inclinación lateral der.',normal:35},{id:'incl_i',nombre:'Inclinación lateral izq.',normal:35},
    {id:'rot_d',nombre:'Rotación der.',normal:45},{id:'rot_i',nombre:'Rotación izq.',normal:45},
    {id:'schober',nombre:'Test de Schober',normal:4,unidad:'cm'}]},
  {id:'hombro',nombre:'Hombro',lados:true,movs:[
    {id:'flex',nombre:'Flexión',normal:180},{id:'ext',nombre:'Extensión',normal:60},
    {id:'abd',nombre:'Abducción',normal:180},{id:'add',nombre:'Aducción',normal:30},
    {id:'rot_ext',nombre:'Rotación externa',normal:90},{id:'rot_int',nombre:'Rotación interna',normal:70}]},
  {id:'codo',nombre:'Codo',lados:true,movs:[{id:'flex',nombre:'Flexión',normal:150},{id:'ext',nombre:'Extensión',normal:0}]},
  {id:'antebrazo',nombre:'Antebrazo',lados:true,movs:[{id:'pron',nombre:'Pronación',normal:80},{id:'sup',nombre:'Supinación',normal:80}]},
  {id:'muneca',nombre:'Muñeca (radiocarpiana)',lados:true,movs:[
    {id:'flex',nombre:'Flexión',normal:80},{id:'ext',nombre:'Extensión',normal:70},
    {id:'desv_rad',nombre:'Desviación radial',normal:20},{id:'desv_uln',nombre:'Desviación ulnar',normal:30}]},
  {id:'pulgar',nombre:'Pulgar',lados:true,movs:[
    {id:'abd',nombre:'Abducción',normal:70},{id:'add',nombre:'Aducción',normal:0},
    {id:'mcf_flex',nombre:'MCF flexión',normal:50},{id:'mcf_ext',nombre:'MCF extensión',normal:0},
    {id:'if_flex',nombre:'IF flexión',normal:80},{id:'if_ext',nombre:'IF extensión',normal:20}]},
  {id:'indice',nombre:'Dedos mano (índice)',lados:true,movs:[
    {id:'mcf_flex',nombre:'MCF flexión',normal:90},{id:'mcf_ext',nombre:'MCF extensión',normal:45},
    {id:'ifp_flex',nombre:'IFP flexión',normal:100},{id:'ifp_ext',nombre:'IFP extensión',normal:0},
    {id:'ifd_flex',nombre:'IFD flexión',normal:90},{id:'ifd_ext',nombre:'IFD extensión',normal:0}]},
  {id:'cadera',nombre:'Cadera',lados:true,movs:[
    {id:'flex',nombre:'Flexión',normal:120},{id:'ext',nombre:'Extensión',normal:30},
    {id:'abd',nombre:'Abducción',normal:45},{id:'add',nombre:'Aducción',normal:30},
    {id:'rot_int',nombre:'Rotación interna',normal:45},{id:'rot_ext',nombre:'Rotación externa',normal:45}]},
  {id:'rodilla',nombre:'Rodilla',lados:true,movs:[{id:'flex',nombre:'Flexión',normal:135},{id:'ext',nombre:'Extensión',normal:-10}]},
  {id:'tobillo',nombre:'Tobillo',lados:true,movs:[
    {id:'plantiflex',nombre:'Plantiflexión',normal:50},{id:'dorsiflex',nombre:'Dorsiflexión',normal:20},
    {id:'inv',nombre:'Inversión',normal:35},{id:'ev',nombre:'Eversión',normal:15}]},
  {id:'hallux',nombre:'Hállux',lados:true,movs:[
    {id:'mtf_flex',nombre:'MTF flexión',normal:45},{id:'mtf_ext',nombre:'MTF extensión',normal:70},
    {id:'if_flex',nombre:'IF flexión',normal:90},{id:'if_ext',nombre:'IF extensión',normal:0}]},
  {id:'dedos_pie',nombre:'Dedos pie (mínimo)',lados:true,movs:[
    {id:'mtf_flex',nombre:'MTF flexión',normal:40},{id:'mtf_ext',nombre:'MTF extensión',normal:40},
    {id:'ifp_flex',nombre:'IFP flexión',normal:35},{id:'ifp_ext',nombre:'IFP extensión',normal:0},
    {id:'ifd_flex',nombre:'IFD flexión',normal:60},{id:'ifd_ext',nombre:'IFD extensión',normal:30}]},
];

export const ROM_MAX = 120;  // mismo tope que session_log_rom_chk (el catálogo completo son 107)
const RANGO = { grados:[-30,200], cm:[0,15] };

// ── Funciones puras ──────────────────────────────────────────────────────────

export function romMov(j, m) {
  const art = ROM_CATALOGO.find(a => a.id === j);
  const mov = art && art.movs.find(x => x.id === m);
  return mov ? { art, mov } : null;
}

// Orden estable: articulación y movimiento en orden de catálogo, luego D antes que I.
function _rank(it) {
  const ai = ROM_CATALOGO.findIndex(a => a.id === it.j);
  const mi = ROM_CATALOGO[ai].movs.findIndex(x => x.id === it.m);
  return ai * 10000 + mi * 10 + (it.l === 'I' ? 1 : 0);
}

// Limpia un array de mediciones. Se usa AL ESCRIBIR y AL LEER de la DB: descarta en silencio lo que
// no encaja con el catálogo (datos viejos o manipulados). Nunca devuelve [] (la DB lo rechaza).
export function romNormalizar(arr) {
  if (!Array.isArray(arr)) return null;
  const porClave = new Map();
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const ref = romMov(it.j, it.m);
    if (!ref) continue;
    const l = it.l == null ? null : it.l;
    if (ref.art.lados ? (l !== 'D' && l !== 'I') : l !== null) continue;
    const v = it.v;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const [min, max] = RANGO[ref.mov.unidad === 'cm' ? 'cm' : 'grados'];
    if (v < min || v > max) continue;
    const k = it.j + '|' + it.m + '|' + l;
    porClave.delete(k);                        // dedup: gana el ÚLTIMO
    porClave.set(k, { j: it.j, m: it.m, l, v });
  }
  const out = [...porClave.values()].sort((a, b) => _rank(a) - _rank(b)).slice(0, ROM_MAX);
  return out.length ? out : null;
}

// Como romNormalizar, pero cuenta cuántos items de entrada son INVÁLIDOS (fuera de rango, v no
// numérico, j/m/l desconocidos). Los duplicados (j,m,l) no cuentan: son válidos, gana el último.
// Los guardados bloquean con descartados > 0 en vez de perder mediciones en silencio.
export function romLeerItems(items) {
  const arr = Array.isArray(items) ? items : [];
  return { rom: romNormalizar(arr), descartados: arr.filter(it => !romNormalizar([it])).length };
}

// % del normal. Solo con normal > 0: en las extensiones con normal 0 o negativo el % no significa
// nada, ahí se muestran valor y normal.
export function romPct(item) {
  const ref = item && romMov(item.j, item.m);
  if (!ref || !(ref.mov.normal > 0) || typeof item.v !== 'number' || !Number.isFinite(item.v)) return null;
  return Math.round(item.v / ref.mov.normal * 100);
}

const _num = v => String(v);
export function romValorTexto(mov, v) { return mov.unidad === 'cm' ? `${_num(v)} cm` : `${_num(v)}°`; }
export function romNormalTexto(mov) { return mov.unidad === 'cm' ? `≥${_num(mov.normal)} cm` : `${_num(mov.normal)}°`; }

// 'Hombro D · Flexión 120° / 180° (67%)'. Texto plano: quien lo pinte en HTML lo pasa por esc().
export function romTexto(item) {
  const ref = item && romMov(item.j, item.m);
  if (!ref) return '';
  const { art, mov } = ref;
  const pct = romPct(item);
  return `${art.nombre}${item.l ? ' ' + item.l : ''} · ${mov.nombre} ${romValorTexto(mov, item.v)} / ${romNormalTexto(mov)}`
    + (pct != null ? ` (${pct}%)` : '');
}

// Filas para la tabla de goniometría del informe exportado (PDF y Word): una por (articulación,
// movimiento) en orden de catálogo, con D e I juntos en la misma celda. Texto plano: quien lo pinte
// en HTML lo pasa por esc(). Sin mediciones válidas → [].
export function romTablaFilas(rom) {
  const items = romNormalizar(rom);
  if (!items) return [];
  const filas = [];
  const porMov = new Map();
  for (const it of items) {            // ya vienen en orden de catálogo (romNormalizar)
    const k = it.j + '|' + it.m;
    if (!porMov.has(k)) { const f = { j: it.j, m: it.m, v: {} }; porMov.set(k, f); filas.push(f); }
    porMov.get(k).v[it.l || '-'] = it.v;
  }
  return filas.map(f => {
    const { art, mov } = romMov(f.j, f.m);
    const txt = v => v == null ? '—' : romValorTexto(mov, v);
    return {
      articulacion: art.nombre,
      movimiento: mov.nombre,
      medicion: art.lados ? `D ${txt(f.v.D)} · I ${txt(f.v.I)}` : txt(f.v['-']),
      normal: romNormalTexto(mov),
    };
  });
}

// Fila del log MÁS RECIENTE del episodio actual con mediciones válidas (incluye la Evaluación
// inicial). Frontera estricta date > último 'Fin de episodio', igual que doneActual.
export function ultimaMedicion(patient) {
  const fin = lastFinDate(patient);
  const filas = (patient?.log || []).filter(s => s && (!fin || s.date > fin) && romNormalizar(s.rom));
  if (!filas.length) return null;
  filas.sort((a, b) => String(b.date).localeCompare(String(a.date)) || normHour(b.hour).localeCompare(normHour(a.hour)));
  return filas[0];
}

// ── Editor (DOM) — una sola implementación para Evaluación inicial y Sesión ─────

function _tramo(pct) { return pct >= 90 ? 'ok' : pct >= 50 ? 'medio' : 'bajo'; }

function _pintarPct(input) {
  const out = input.parentElement?.querySelector('.rom-pct');
  if (!out) return;
  const raw = input.value.trim();
  input.classList.remove('rom-input--fuera');
  out.className = 'rom-pct'; out.textContent = '';
  if (raw === '') return;
  const item = { j: input.dataset.j, m: input.dataset.m, l: input.dataset.l || null, v: Number(raw) };
  if (!romNormalizar([item])) { input.classList.add('rom-input--fuera'); out.textContent = 'fuera de rango'; return; }
  const pct = romPct(item);
  if (pct == null) return;
  out.classList.add('rom-pct--' + _tramo(pct));
  out.textContent = pct + '%';
}

function _inputHtml(art, mov, l, valor, previo) {
  const [min, max] = RANGO[mov.unidad === 'cm' ? 'cm' : 'grados'];
  const label = `${art.nombre}${l ? ' ' + l : ''} ${mov.nombre}`;
  return `<td><input type="number" inputmode="decimal" step="1" min="${min}" max="${max}" class="rom-input"
    data-j="${esc(art.id)}" data-m="${esc(mov.id)}" data-l="${l || ''}" aria-label="${esc(label)}"
    value="${valor != null ? esc(String(valor)) : ''}" placeholder="${previo != null ? esc('antes ' + previo) : ''}"><span class="rom-pct"></span></td>`;
}

function _bloqueHtml(art, abierto, valMap, prevMap) {
  const lados = art.lados ? ['D', 'I'] : [null];
  const head = art.lados ? '<th>D</th><th>I</th>' : '<th>Valor</th>';
  const filas = art.movs.map(mov => {
    const celdas = lados.map(l => {
      const k = art.id + '|' + mov.id + '|' + l;
      return _inputHtml(art, mov, l, valMap.get(k), prevMap.get(k));
    }).join('');
    return `<tr><th scope="row">${esc(mov.nombre)}</th>${celdas}<td class="rom-normal">${esc(romNormalTexto(mov))}</td></tr>`;
  }).join('');
  return `<div class="rom-block" data-j="${esc(art.id)}"${abierto ? '' : ' hidden'}>
    <div class="rom-block-title">${esc(art.nombre)}</div>
    <table class="rom-table${art.lados ? '' : ' rom-table--uno'}"><thead><tr><th>Movimiento</th>${head}<th>Normal</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

// valores = mediciones que PRECARGAN los inputs (editar). previos = mediciones que solo se muestran
// como placeholder "antes N" y abren esas articulaciones (sesión nueva). Los bloques cerrados quedan
// en el DOM con [hidden] (reabrir un chip recupera lo tipeado) pero leerRom los ignora.
export function renderRomEditor(containerId, { valores, previos } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const vals = romNormalizar(valores) || [], prevs = romNormalizar(previos) || [];
  const clave = it => it.j + '|' + it.m + '|' + it.l;
  const valMap = new Map(vals.map(it => [clave(it), it.v]));
  const prevMap = new Map(prevs.map(it => [clave(it), it.v]));
  const abiertas = new Set([...vals, ...prevs].map(it => it.j));
  el.innerHTML = `<div class="rom-chips" role="group" aria-label="Articulaciones">${ROM_CATALOGO.map(a =>
      `<button type="button" class="rom-chip" data-j="${esc(a.id)}" aria-pressed="${abiertas.has(a.id)}">${esc(a.nombre)}</button>`).join('')}</div>`
    + `<div class="rom-blocks">${ROM_CATALOGO.map(a => _bloqueHtml(a, abiertas.has(a.id), valMap, prevMap)).join('')}</div>`;
  el.querySelectorAll('.rom-input').forEach(_pintarPct);
  // Listeners directos sobre el contenedor recién pintado (sin onclick inline: CSP).
  el.querySelectorAll('.rom-chip').forEach(chip => chip.addEventListener('click', () => {
    const bloque = el.querySelector(`.rom-block[data-j="${chip.dataset.j}"]`);
    if (!bloque) return;
    const abrir = bloque.hidden;
    bloque.hidden = !abrir;
    chip.setAttribute('aria-pressed', String(abrir));
  }));
  el.querySelectorAll('.rom-input').forEach(inp => inp.addEventListener('input', () => _pintarPct(inp)));
}

export function leerRomDetalle(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return { rom: null, descartados: 0 };
  const items = [];
  el.querySelectorAll('.rom-block:not([hidden]) .rom-input').forEach(inp => {
    const raw = inp.value.trim();
    if (raw === '') return;
    items.push({ j: inp.dataset.j, m: inp.dataset.m, l: inp.dataset.l || null, v: Number(raw) });
  });
  return romLeerItems(items);
}

export function leerRom(containerId) { return leerRomDetalle(containerId).rom; }
