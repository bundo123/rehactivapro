// ── Export de la agenda a Excel (.xlsx) ─────────────────────────────────────────────────────
//
// Motor ÚNICO: generarExcel({desde, hasta, terapeutaIds}) emite UNA HOJA POR DÍA CALENDARIO del
// rango — sábados y domingos incluidos, que en el archivo histórico de la clínica traen citas
// reales. Un día, una semana y un mes son el mismo camino con distinto rango.
//
// El objetivo declarado por la clínica es que el archivo sea INDISTINGUIBLE del que la secretaria
// venía llenando a mano (2026-08.xlsx): misma geometría, mismos colores, mismas fórmulas, misma
// tipografía. La geometría vive en js/excel-layout.js (puro y testeado); acá está el pintado.
//
// La librería (exceljs) se carga por IMPORT DINÁMICO, igual que docx en js/word.js: son ~950 KB
// que no tienen por qué entrar al bundle inicial de nadie que nunca exporta.
//
// Lo que el original tiene y acá NO se replica, a propósito:
//  · Las franjas ALMUERZO / CAPACITACION: hoy la app no modela bloqueos ni almuerzo (es el lote
//    "BLOQUEOS/RESERVADO" de la cola). Brecha conocida, documentada en PROYECTO_ESTADO.md.
//  · G4 y L4 (el correlativo histórico de sesiones, tipo 26031): quedan VACÍAS hasta que se
//    decida qué número es. Se dejan las celdas con su formato para llenarlas a mano.
import { state } from './state.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { esc, fmtDate, getColor, getPatient, getTherapist, orderedTherapists,
         ordinalesDeCitas, startOfWeek } from './utils.js';
import { LOGO_DATA_URI } from './pdf-logo.js';
import { GRILLA, RESUMEN, ESPECIALIDADES_ORDEN, COLS_BLOQUE, PALETA_HISTORICA,
         PRIMERA_HORA, ULTIMA_HORA, ESTADOS_EXPORTABLES, llevaRellenoPend, planificarDia,
         diasDelRango, nombresHojaUnicos, colGranTotal, letraCol, horaExcel, nombreArchivo,
         aFecha } from './excel-layout.js';

const FUENTE = 'Aptos Narrow';
const NEGRO = 'FF000000';
const AMBAR = 'FFFFC000';          // 'por confirmar' y la banda de totales de FISICA
const FINO = { style: 'thin' };
const BORDES = { top: FINO, left: FINO, bottom: FINO, right: FINO };

// #rrggbb (o #rgb) del color del terapeuta en la app → ARGB de Excel. Cualquier cosa que no sea
// un hex reconocible cae al fallback histórico por posición, que es lo que pide la plantilla.
function argb(hex, i) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 'FF' + PALETA_HISTORICA[i % PALETA_HISTORICA.length];
  return 'FF' + full.toUpperCase();
}
// El color del bloque = el del terapeuta en la app (COLOR_OPTIONS.bg, el tono pastel con el que
// se lo reconoce en la agenda). Sin color configurado, la paleta del archivo viejo en su orden.
function colorBloque(th, i) {
  return argb(th && th.colorId ? getColor(th.colorId).bg : null, i);
}

// ── Descarga (idéntica a la de word.js: <a download>, nada de window.open, que Safari iPad bloquea)
function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Helpers de pintado ──────────────────────────────────────────────────────────────────────
function estilar(cell, { size = 11, bold = false, strike = false, fill = null, fmt = null,
                         h = null, v = 'middle', wrap = false, bordes = true } = {}) {
  cell.font = { name: FUENTE, size, bold, strike, color: { argb: NEGRO } };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (bordes) cell.border = BORDES;
  if (fmt) cell.numFmt = fmt;
  const al = {};
  if (h) al.horizontal = h;
  if (v) al.vertical = v;
  if (wrap) al.wrapText = true;
  if (Object.keys(al).length) cell.alignment = al;
  return cell;
}

// Cabecera de un bloque: nombre mergeado en las 5 columnas + fila de headers, las dos con el
// color del terapeuta.
function pintarBloque(ws, grilla, th, i, color) {
  const c0 = 1 + i * COLS_BLOQUE;
  ws.mergeCells(grilla.filaNombres, c0, grilla.filaNombres, c0 + COLS_BLOQUE - 1);
  for (let k = 0; k < COLS_BLOQUE; k++) {
    estilar(ws.getCell(grilla.filaNombres, c0 + k), { bold: true, fill: color, h: 'center', v: null });
  }
  ws.getCell(grilla.filaNombres, c0).value = String(th.name || '').toUpperCase();

  const headers = ['HORA ', 'PACIENTE', 'N° ', 'LUGAR', null];
  headers.forEach((txt, k) => {
    const cell = ws.getCell(grilla.filaHeaders, c0 + k);
    estilar(cell, { size: 10, bold: true, fill: color, h: 'center', wrap: k === 2 || k === 4 });
    if (txt) cell.value = txt;
  });
}

// Las 13 filas de hora del bloque: el esqueleto (hora en punto + celdas vacías con borde) y
// encima las citas que le tocan.
function pintarFilasBloque(ws, grilla, bloque) {
  const c0 = bloque.colBase;
  for (let f = grilla.filaPrimera; f <= grilla.filaUltima; f++) {
    const hora = PRIMERA_HORA + (f - grilla.filaPrimera);
    const cita = bloque.filas.get(f) || null;

    // HORA: valor de tiempo real con formato 'h:mm'. Si hay cita, manda SU hora (así una de las
    // 12:30 se ve "12:30" en la fila de las 12, que es como lo hacía el archivo viejo).
    const hCell = ws.getCell(f, c0);
    estilar(hCell, { bold: true, fmt: 'h:mm', h: 'center' });
    hCell.value = horaExcel(cita ? cita.hour : hora);

    const pend = !!cita && cita.status === 'pend';
    const noas = !!cita && cita.status === 'noas';
    // El ámbar de 'por confirmar' NO baña la fila entera: en el original solo lo llevan PACIENTE,
    // N° y LUGAR (llevaRellenoPend en excel-layout.js). HORA y la 5ª columna quedan limpias.
    const fillDe = k => (pend && llevaRellenoPend(k)) ? AMBAR : null;

    const pac = ws.getCell(f, c0 + 1);
    estilar(pac, { strike: noas, fill: fillDe(1), h: 'left' });
    if (cita) pac.value = cita.paciente;

    // 'por confirmar' va con N° y LUGAR VACÍOS: la cita todavía no es un dato firme y el número de
    // sesión no se consume hasta que se confirma.
    const num = ws.getCell(f, c0 + 2);
    estilar(num, { strike: noas, fill: fillDe(2), h: 'center' });
    if (cita && !pend && cita.numero != null) num.value = cita.numero;

    const lug = ws.getCell(f, c0 + 3);
    estilar(lug, { strike: noas, fill: fillDe(3), h: 'center' });
    if (cita && !pend && cita.lugar) lug.value = cita.lugar;

    // 5ª columna: vacía a propósito (es la que suma la fila 20/37; su contenido está pendiente
    // de decisión de la clínica). Se pinta el borde para que la grilla no quede rota, pero NUNCA
    // el ámbar: fillDe(4) es null siempre.
    estilar(ws.getCell(f, c0 + 4), { fill: fillDe(4) });
  }
}

// Fila de sumas de una grilla: =SUM() de la 5ª columna de cada bloque + el gran total del día.
// Los resultados van cacheados en 0 porque la 5ª columna está vacía — exactamente como el
// original, que también trae 0 en todas sus fórmulas.
function pintarSumas(ws, grilla, nBloques) {
  const cols = [];
  for (let i = 0; i < nBloques; i++) {
    const c = 1 + i * COLS_BLOQUE + (COLS_BLOQUE - 1);
    const L = letraCol(c);
    const cell = ws.getCell(grilla.filaSumas, c);
    estilar(cell, { size: 14, bold: true, fill: grilla.colorTotal, bordes: false, v: null });
    cell.value = { formula: `SUM(${L}${grilla.filaPrimera}:${L}${grilla.filaUltima})`, result: 0 };
    cols.push(L + grilla.filaSumas);
  }
  const cGT = colGranTotal(nBloques);
  const gt = ws.getCell(grilla.filaSumas, cGT);
  estilar(gt, { size: 14, bold: true, fill: grilla.colorTotal, bordes: false, v: null });
  gt.value = { formula: '+' + cols.join('+'), result: 0 };
  return cGT;
}

// ── Resumen manual (filas 40–49) ────────────────────────────────────────────────────────────
// C y D quedan VACÍAS: las llena la secretaria a mano (citas en centro / a domicilio). E es la
// suma de las dos, y la última fila trae el gran total del día que ya calculó la grilla.
function pintarResumen(ws, grupos, granTotalCol) {
  const filas = Math.max(RESUMEN.filasMinimas,
    ...ESPECIALIDADES_ORDEN.map(e => grupos[e].length));
  const filaTotal = RESUMEN.filaPrimera + filas;
  const filaGran = filaTotal + 1;

  // Un lado del resumen = 4 columnas: NOMBRE | C | D | TOTAL. FISICA arranca en B, RESPIRATORIA en G.
  const lados = [
    { esp: 'fisica',       cNom: 2, titulo: 'FISICA',       color: GRILLA.fisica.colorTotal },
    { esp: 'respiratoria', cNom: 7, titulo: 'RESPIRATORIA', color: GRILLA.respiratoria.colorTotal },
  ];

  lados.forEach(({ esp, cNom, titulo, color }) => {
    const cC = cNom + 1, cD = cNom + 2, cT = cNom + 3;
    const LT = letraCol(cT), LC = letraCol(cC), LD = letraCol(cD);

    estilar(ws.getCell(RESUMEN.filaHeaders, cNom), { bold: true, h: 'center', bordes: false }).value = titulo;
    estilar(ws.getCell(RESUMEN.filaHeaders, cC), { bold: true, h: 'center', bordes: false }).value = 'C';
    estilar(ws.getCell(RESUMEN.filaHeaders, cD), { bold: true, h: 'center', bordes: false }).value = 'D';
    estilar(ws.getCell(RESUMEN.filaHeaders, cT), { bold: true, h: 'center', fill: color, bordes: false }).value = 'TOTAL';

    for (let k = 0; k < filas; k++) {
      const f = RESUMEN.filaPrimera + k;
      const th = grupos[esp][k];
      estilar(ws.getCell(f, cNom), { bordes: false, v: null }).value = th ? th.name : null;
      estilar(ws.getCell(f, cC), { bordes: false, h: 'center' });   // llenado manual
      estilar(ws.getCell(f, cD), { bordes: false, h: 'center' });   // llenado manual
      const t = estilar(ws.getCell(f, cT), { fill: color, bordes: false, h: 'center' });
      t.value = { formula: `+${LC}${f}+${LD}${f}`, result: 0 };
    }

    const tot = estilar(ws.getCell(filaTotal, cT), { size: 14, bold: true, fill: color, bordes: false, h: 'center', v: null });
    tot.value = { formula: `SUM(${LT}${RESUMEN.filaPrimera}:${LT}${filaTotal - 1})`, result: 0 };
    estilar(ws.getCell(filaTotal, cNom), { bordes: false, v: null }).value = 'TOTAL';

    // Gran total del día: apunta a la celda de la grilla. En el histórico el lado respiratorio
    // apuntaba a AK36 (una fila más arriba de su total, AK37) y por eso quedaba siempre en 0;
    // acá se corrige — es la ÚNICA desviación deliberada respecto del archivo original.
    const gran = estilar(ws.getCell(filaGran, cT), { size: 14, bold: true, fill: color, bordes: false, h: 'center' });
    const ref = granTotalCol[esp];
    gran.value = ref
      ? { formula: `+${letraCol(ref)}${GRILLA[esp].filaSumas}`, result: 0 }
      : 0;
  });

  ws.getRow(filaTotal).height = 18.75;
  ws.getRow(filaGran).height = 18.75;
}

// ── Una hoja = un día ───────────────────────────────────────────────────────────────────────
function construirHoja(wb, nombre, plan, logoId) {
  // zoomScale 89: el mismo con el que la clínica abre el archivo de siempre (la hoja completa
  // entra en una pantalla). Las líneas de cuadrícula quedan VISIBLES, como en el original.
  const ws = wb.addWorksheet(nombre, { views: [{ zoomScale: 89, zoomScaleNormal: 89 }] });

  // Anchos: HORA / N° / LUGAR / 5ª = 7.57, PACIENTE = 25.57 (los del archivo histórico).
  const nMax = Math.max(...ESPECIALIDADES_ORDEN.map(e => plan.rejillas[e].length));
  for (let i = 0; i < nMax; i++) {
    const c0 = 1 + i * COLS_BLOQUE;
    for (let k = 0; k < COLS_BLOQUE; k++) ws.getColumn(c0 + k).width = k === 1 ? 25.57 : 7.57;
  }

  ws.getRow(2).height = 60;    // el aire del logo
  ws.getRow(3).height = 21;
  ws.getRow(4).height = 34.5;

  const tit = ws.getCell('A3');
  tit.font = { name: FUENTE, size: 16, bold: true, color: { argb: NEGRO } };
  tit.alignment = { horizontal: 'left', vertical: 'middle' };
  tit.value = plan.titulo;

  // G4 / L4: el correlativo histórico de sesiones. Formato listo, valor VACÍO (llenado manual).
  ['G4', 'L4'].forEach(ref => {
    ws.getCell(ref).font = { name: FUENTE, size: 26, bold: true, color: { argb: NEGRO } };
  });

  if (logoId != null) {
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 323, height: 92 } });
  }

  const granTotalCol = {};
  ESPECIALIDADES_ORDEN.forEach(esp => {
    const grilla = GRILLA[esp];
    const bloques = plan.rejillas[esp];
    if (!bloques.length) { granTotalCol[esp] = null; return; }
    ws.getRow(grilla.filaNombres).height = 26.45;
    ws.getRow(grilla.filaHeaders).height = 26.65;
    ws.getRow(grilla.filaSumas).height = 18.75;
    bloques.forEach(b => {
      pintarBloque(ws, grilla, b.terapeuta, b.indice, colorBloque(b.terapeuta, b.indice));
      pintarFilasBloque(ws, grilla, b);
    });
    granTotalCol[esp] = pintarSumas(ws, grilla, bloques.length);
  });

  const grupos = {};
  ESPECIALIDADES_ORDEN.forEach(e => { grupos[e] = plan.rejillas[e].map(b => b.terapeuta); });
  pintarResumen(ws, grupos, granTotalCol);
  return ws;
}

// ── Motor ───────────────────────────────────────────────────────────────────────────────────
// desde/hasta: 'YYYY-MM-DD' inclusive. terapeutaIds: null = todos; array = solo esos (en el orden
// canónico de la agenda). Devuelve {blob, nombre, hojas, citas, sobrantes}.
export async function generarExcel({ desde, hasta, terapeutaIds = null }) {
  const dias = diasDelRango(desde, hasta);
  if (!dias.length) throw new Error('El rango de fechas no es válido.');

  const todos = orderedTherapists();
  const terapeutas = terapeutaIds && terapeutaIds.length
    ? todos.filter(t => terapeutaIds.some(id => String(id) === String(t.id)))
    : todos;
  if (!terapeutas.length) throw new Error('No hay terapeutas para exportar.');

  // Ordinal "X del episodio" — el MISMO mapa que pinta el badge de la agenda, calculado una vez
  // sobre TODAS las citas (el universo del ordinal es la secuencia completa del paciente, no el
  // rango exportado).
  const ordMap = ordinalesDeCitas(state.appointments, getPatient);

  const idsOk = new Set(terapeutas.map(t => String(t.id)));
  const citas = state.appointments
    .filter(a => a && a.date >= desde && a.date <= hasta && idsOk.has(String(a.therapistId)))
    .map(a => {
      const pt = getPatient(a.patientId);
      const ord = ordMap.get(a);
      return {
        id: a.id, date: a.date, hour: a.hour, status: a.status, therapistId: a.therapistId,
        paciente: (pt ? pt.name : (a.patientName || 'Sin paciente')).toUpperCase(),
        numero: ord ? ord.x : null,
        lugar: a.location === 'domicilio' ? 'D' : 'C',
      };
    });

  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RehactivaPro';
  wb.created = new Date();

  let logoId = null;
  try { logoId = wb.addImage({ base64: LOGO_DATA_URI, extension: 'png' }); } catch { logoId = null; }

  const nombres = nombresHojaUnicos(dias);
  let sobrantes = 0, pintadas = 0;
  dias.forEach((fecha, i) => {
    const plan = planificarDia({ fecha, citas, terapeutas });
    construirHoja(wb, nombres[i], plan, logoId);
    ESPECIALIDADES_ORDEN.forEach(e => plan.rejillas[e].forEach(b => {
      pintadas += b.filas.size; sobrantes += b.sobrantes.length;
    }));
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const unica = terapeutas.length === 1 && terapeutaIds && terapeutaIds.length;
  return {
    blob,
    nombre: nombreArchivo(desde, hasta, unica ? terapeutas[0].name : null),
    hojas: dias.length,
    citas: pintadas,
    sobrantes,
  };
}

// ── UI: modal "Exportar" ────────────────────────────────────────────────────────────────────
// Accesible desde las tres vistas de la agenda (Día, Semana, Mes) y precargado con el rango de la
// vista activa. El selector de rango tiene además "personalizado" para cualquier par de fechas.

// Rango que corresponde a la vista de la agenda que se está mirando.
export function rangoDeVista(vista, fecha) {
  const d = fecha instanceof Date ? fecha : (aFecha(fecha) || new Date());
  if (vista === 'week') {
    const lun = startOfWeek(d);
    const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    return { desde: fmtDate(lun), hasta: fmtDate(dom) };
  }
  if (vista === 'month') {
    const a = new Date(d.getFullYear(), d.getMonth(), 1);
    const b = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { desde: fmtDate(a), hasta: fmtDate(b) };
  }
  const ds = fmtDate(d);
  return { desde: ds, hasta: ds };
}

// Preset del modal → vista de la agenda, que es lo que entiende rangoDeVista().
const PRESET_VISTA = { dia: 'day', semana: 'week', mes: 'month' };

export function onExportPreset() {
  const preset = document.getElementById('xl-preset').value;
  const vista = PRESET_VISTA[preset];
  // "personalizado" no toca las fechas: deja las que ya estaban y muestra los dos inputs.
  document.getElementById('xl-fechas').style.display = vista ? 'none' : '';
  if (vista) {
    const { desde, hasta } = rangoDeVista(vista, state.currentDate || new Date());
    document.getElementById('xl-desde').value = desde;
    document.getElementById('xl-hasta').value = hasta;
  }
  actualizarResumenExport();
}

// Línea de ayuda del modal: cuántos días y cuántas citas saldrían con lo elegido. Es barato
// (filtra un array que ya está en memoria) y evita el "exporté el mes equivocado".
export function actualizarResumenExport() {
  const el = document.getElementById('xl-nota');
  if (!el) return;
  const desde = document.getElementById('xl-desde').value;
  const hasta = document.getElementById('xl-hasta').value;
  const thId = document.getElementById('xl-terapeuta').value;
  const dias = diasDelRango(desde, hasta);
  if (!dias.length) { el.innerHTML = '<span style="color:#c33a3a">Revisá las fechas: "hasta" no puede ser anterior a "desde".</span>'; return; }
  const n = state.appointments.filter(a => a && a.date >= desde && a.date <= hasta &&
    (!thId || String(a.therapistId) === String(thId)) &&
    ESTADOS_EXPORTABLES.includes(a.status)).length;
  const th = thId ? getTherapist(thId) : null;
  el.innerHTML = `${dias.length} hoja${dias.length !== 1 ? 's' : ''} (una por día) · ${n} cita${n !== 1 ? 's' : ''}`
    + (th ? ` · solo ${esc(th.name)}` : '') + ` · <b>${esc(nombreArchivo(desde, hasta, th ? th.name : null))}</b>`;
}

export function abrirExportModal() {
  const vista = state.agendaView || 'day';
  const sel = document.getElementById('xl-preset');
  sel.value = { day: 'dia', week: 'semana', month: 'mes' }[vista] || 'dia';

  const th = document.getElementById('xl-terapeuta');
  th.innerHTML = '<option value="">Todos los terapeutas</option>' +
    orderedTherapists().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  // Si la agenda ya está filtrada por un terapeuta, el modal arranca con ese mismo filtro.
  th.value = state.agendaTherapistFilter ? String(state.agendaTherapistFilter) : '';

  onExportPreset();
  document.getElementById('export-modal').classList.add('open');
}

export async function confirmarExportarExcel() {
  const desde = document.getElementById('xl-desde').value;
  const hasta = document.getElementById('xl-hasta').value;
  const thId = document.getElementById('xl-terapeuta').value;
  if (!desde || !hasta) { toastErr('Elegí las dos fechas del rango.'); return; }
  if (hasta < desde) { toastErr('La fecha "hasta" no puede ser anterior a "desde".'); return; }
  if (diasDelRango(desde, hasta).length > 62) {
    if (!confirm(`Vas a generar ${diasDelRango(desde, hasta).length} hojas. Puede tardar un rato. ¿Seguimos?`)) return;
  }

  const btn = document.getElementById('xl-btn');
  const txt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    toastInfo('Generando el Excel…');
    const r = await generarExcel({ desde, hasta, terapeutaIds: thId ? [thId] : null });
    descargar(r.blob, r.nombre);
    document.getElementById('export-modal').classList.remove('open');
    toastOk(`${r.nombre} — ${r.hojas} hoja${r.hojas !== 1 ? 's' : ''}, ${r.citas} cita${r.citas !== 1 ? 's' : ''}.`);
    if (r.sobrantes) toastErr(`${r.sobrantes} cita(s) no entraron: un terapeuta superó las ${ULTIMA_HORA - PRIMERA_HORA + 1} filas de un día.`);
  } catch (e) {
    console.error(e);
    toastErr('No se pudo generar el Excel: ' + (e && e.message ? e.message : 'error inesperado'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = txt; }
  }
}
