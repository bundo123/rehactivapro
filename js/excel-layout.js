// ── Plantilla del export a Excel: geometría y mapeo (PURO, sin dependencias) ─────────────────
//
// Este módulo NO conoce exceljs, ni el DOM, ni `state`: solo dice DÓNDE va cada cosa en la hoja.
// Vive aparte de js/excel.js para poder testearlo con `node --test` sin arrastrar la librería
// (~950 KB) ni el navegador — mismo criterio con el que las reglas de la agenda viven en utils.js.
//
// La geometría es una RÉPLICA del archivo histórico de la clínica (2026-08.xlsx, leído
// descomprimiéndolo y mirando xl/worksheets/*.xml, no a ojo). Una hoja por día calendario:
//
//   fila  1– 2   logo (fila 2 con alto 60)
//   fila  3      título "LUNES 03 DE AGOSTO DEL 2026"
//   fila  4      G4 y L4 — correlativo histórico de sesiones; van VACÍAS (llenado manual)
//   fila  5      nombres de terapeutas FÍSICA, mergeados de a 5 columnas, con su color
//   fila  6      headers HORA | PACIENTE | N° | LUGAR | (vacía)
//   filas 7–19   una por hora, 07:00 … 19:00
//   fila 20      =SUM() por bloque + gran total del día
//   filas 22–37  lo mismo para RESPIRATORIA (nombres 22, headers 23, horas 24–36, sumas 37)
//   filas 40–49  resumen para llenado manual (C/D vacías, E = C+D) y los grandes totales
//
// Un BLOQUE = un terapeuta = 5 columnas consecutivas. La 5ª queda vacía: es la que suman las
// filas 20/37 y su contenido todavía no está decidido (pregunta (a) del handoff).
//
// Desviación deliberada del original, la única: en el histórico J49 apuntaba a AK36 (una fila
// más arriba del gran total respiratorio, que está en AK37) y por eso mostraba 0 siempre. Acá
// apunta al gran total de verdad.

// Horas que cubre cada grilla: filas 7–19 = 07:00–19:00 (13 filas).
export const PRIMERA_HORA = 7;
export const ULTIMA_HORA = 19;
// Ancho de un bloque de terapeuta, en columnas: HORA | PACIENTE | N° | LUGAR | (vacía-con-suma).
export const COLS_BLOQUE = 5;

// Las dos grillas, en el orden en que se apilan en la hoja. Las claves son los ids de
// therapists.specialty (ESPECIALIDADES en utils.js): si algún día se agrega una tercera
// especialidad, esto es lo único que hay que extender.
export const ESPECIALIDADES_ORDEN = ['fisica', 'respiratoria'];
export const GRILLA = {
  fisica:       { filaNombres: 5,  filaHeaders: 6,  filaPrimera: 7,  filaUltima: 19, filaSumas: 20, colorTotal: 'FFFFC000' },
  respiratoria: { filaNombres: 22, filaHeaders: 23, filaPrimera: 24, filaUltima: 36, filaSumas: 37, colorTotal: 'FF00B0F0' },
};

// Bloque del resumen manual (filas 40–49 en el original).
export const RESUMEN = {
  filaHeaders: 40,
  filaPrimera: 41,
  // El original reserva 7 filas de terapeuta (41–47), TOTAL en 48 y gran total en 49. Se
  // conservan las 7 aunque el export lleve menos: así la hoja se ve igual que la de siempre.
  filasMinimas: 7,
};

// Paleta del archivo histórico, en su orden de columnas. Solo se usa como FALLBACK: el color que
// manda es el que el terapeuta tiene configurado en la app.
export const PALETA_HISTORICA = ['DAF2D0', 'CAEDFB', 'F2CEEF', 'D0D0D0', 'C0E6F5', 'FBE2D5', 'C1F0C8'];

// Estados de cita que van al Excel. Las canceladas no se exportan; hoy el modelo solo tiene estos
// tres (js/auth.js:75), así que la lista funciona además como filtro de cualquier estado futuro
// que no deba imprimirse.
export const ESTADOS_EXPORTABLES = ['conf', 'pend', 'noas'];

// Columnas de un bloque —por posición dentro de sus 5, no por letra— que reciben el relleno ámbar
// de 'por confirmar': PACIENTE, N° y LUGAR. HORA (0) y la 5ª columna (4) van SIN relleno.
// Verificado en el archivo histórico: en MIERCOLES 5, las citas por confirmar de L7 y de Q17 dejan
// O7 y T17 con el estilo neutro (xf24, patternType="none"), no con el ámbar de sus vecinas.
// La regla vive acá, y no en el pintado, para que se pueda fijar con un test sin levantar exceljs.
export const COLS_RELLENO_PEND = [1, 2, 3];
export function llevaRellenoPend(offset) {
  return COLS_RELLENO_PEND.includes(offset);
}

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
               'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// 'YYYY-MM-DD' → Date LOCAL a mediodía. El mediodía es a propósito: construir la fecha a las 00:00
// y sumarle días cruza mal los cambios de horario, y Quito no los tiene pero el navegador del
// usuario puede estar en cualquier lado.
export function aFecha(ds) {
  const p = String(ds || '').split('-');
  if (p.length !== 3) return null;
  const d = new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}
export function aISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Todos los días CALENDARIO del rango, inclusive los dos extremos. Sábados y domingos incluidos:
// el archivo histórico los trae con citas reales, no son días muertos.
export function diasDelRango(desde, hasta) {
  const a = aFecha(desde), b = aFecha(hasta);
  if (!a || !b || a > b) return [];
  const out = [];
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.push(aISO(d));
  return out;
}

// Nombre de la pestaña: "LUNES 3" (sin cero a la izquierda), como en el histórico.
export function nombreHoja(ds) {
  const d = aFecha(ds);
  return d ? `${DIAS[d.getDay()]} ${d.getDate()}` : String(ds || '');
}

// Excel no admite dos pestañas con el mismo nombre. Dentro de un mes no puede pasar, pero un rango
// largo sí repite el par (día de semana, número): se desempata con el mes abreviado.
export function nombresHojaUnicos(dias) {
  const usados = new Set();
  return (dias || []).map(ds => {
    const base = nombreHoja(ds);
    if (!usados.has(base)) { usados.add(base); return base; }
    const d = aFecha(ds);
    let n = `${base} ${MESES_CORTO[d.getMonth()]}`;
    let i = 2;
    while (usados.has(n)) n = `${base} ${MESES_CORTO[d.getMonth()]} ${i++}`;
    usados.add(n);
    return n;
  });
}

// Título de la fila 3: "LUNES 03 DE AGOSTO DEL 2026" (acá el día SÍ va con cero).
export function tituloHoja(ds) {
  const d = aFecha(ds);
  if (!d) return String(ds || '');
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} DE ${MESES[d.getMonth()]} DEL ${d.getFullYear()}`;
}

// Primera columna (1-based) del bloque i de una grilla: A, F, K, P, U, Z, AE…
export function colBloque(i) {
  return 1 + i * COLS_BLOQUE;
}
// Columna del gran total de la grilla. En el original, con 7 bloques, es AK (37): queda UNA
// columna de aire después del último bloque (AJ), que es como se lee en el archivo.
export function colGranTotal(nBloques) {
  return colBloque(nBloques) + 1;
}
// Letra(s) de columna de Excel a partir del índice 1-based (1→A, 27→AA).
export function letraCol(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

// Hora decimal (7.5 = 07:30) → fracción de día, que es como Excel guarda una hora. Con numFmt
// 'h:mm' la celda queda como valor de tiempo REAL, no como texto: se puede ordenar y restar.
export function horaExcel(hora) {
  const h = Number(hora);
  return isFinite(h) ? h / 24 : 0;
}

// Terapeutas partidos por especialidad, conservando el orden en que llegan (que es el de la
// agenda: orderedTherapists()). Una especialidad desconocida cae en 'fisica', igual que
// especialidad() en utils.js.
export function agruparPorEspecialidad(terapeutas) {
  const out = {};
  ESPECIALIDADES_ORDEN.forEach(e => { out[e] = []; });
  (terapeutas || []).forEach(t => {
    const e = ESPECIALIDADES_ORDEN.includes(t?.specialty) ? t.specialty : 'fisica';
    out[e].push(t);
  });
  return out;
}

// ── Mapeo citas → filas de un bloque ────────────────────────────────────────────────────────
// Regla del histórico: la cita va en la fila de su hora TRUNCADA (12:30 → fila de las 12) y la
// celda HORA muestra la hora real. Dos consecuencias que el original no tenía que resolver y acá
// sí, porque la app permite medias horas y horarios fuera de 07–19:
//  · Dos citas en la misma hora (07:00 y 07:30) compiten por la misma fila: la segunda baja a la
//    primera fila libre. Nunca se pisan y el orden por hora se conserva.
//  · Una cita fuera de 07:00–19:59 se ancla a la fila extrema más cercana. Se prefiere correrla a
//    perderla: su celda HORA sigue diciendo la hora real.
// Devuelve un Map fila→cita y las que no entraron (más de 13 citas en el día para un terapeuta).
export function mapearCitasAFilas(citas, grilla) {
  const { filaPrimera, filaUltima } = grilla;
  const orden = [...(citas || [])].sort((a, b) =>
    (Number(a.hour) || 0) - (Number(b.hour) || 0) || String(a.id).localeCompare(String(b.id)));
  const filas = new Map();
  const sobrantes = [];
  orden.forEach(c => {
    const cruda = filaPrimera + (Math.floor(Number(c.hour) || 0) - PRIMERA_HORA);
    const objetivo = Math.min(filaUltima, Math.max(filaPrimera, cruda));
    let f = objetivo;
    while (f <= filaUltima && filas.has(f)) f++;
    if (f > filaUltima) {                    // sin lugar hacia abajo: se busca hacia arriba
      f = objetivo - 1;
      while (f >= filaPrimera && filas.has(f)) f--;
    }
    if (f < filaPrimera) { sobrantes.push(c); return; }
    filas.set(f, c);
  });
  return { filas, sobrantes };
}

// ── Plan de una hoja (un día) ───────────────────────────────────────────────────────────────
// Junta las tres decisiones del mapeo — HOJA (qué día), FILA (qué hora) y BLOQUE (qué terapeuta) —
// en una sola estructura, que es lo que consume el generador y lo que testea test/excel.test.js.
// Los terapeutas llegan YA filtrados y ordenados; todos van a la hoja tengan citas o no, igual que
// en el histórico (las columnas están siempre, aunque el día esté vacío).
export function planificarDia({ fecha, citas, terapeutas }) {
  const grupos = agruparPorEspecialidad(terapeutas);
  const delDia = (citas || []).filter(c => c && c.date === fecha && ESTADOS_EXPORTABLES.includes(c.status));
  const rejillas = {};
  ESPECIALIDADES_ORDEN.forEach(esp => {
    const g = GRILLA[esp];
    rejillas[esp] = grupos[esp].map((th, i) => {
      const suyas = delDia.filter(c => String(c.therapistId) === String(th.id));
      const { filas, sobrantes } = mapearCitasAFilas(suyas, g);
      return { terapeuta: th, indice: i, colBase: colBloque(i), filas, sobrantes };
    });
  });
  return { fecha, hoja: nombreHoja(fecha), titulo: tituloHoja(fecha), rejillas };
}

// ── Nombre del archivo ──────────────────────────────────────────────────────────────────────
// Un mes completo conserva EXACTAMENTE el nombre del histórico ({YYYY}-{MM}.xlsx) para que siga
// cayendo en la misma carpeta de la clínica sin renombrar nada.
function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function esMesCompleto(desde, hasta) {
  const a = aFecha(desde), b = aFecha(hasta);
  if (!a || !b) return false;
  const ultimo = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
         a.getDate() === 1 && b.getDate() === ultimo;
}
export function nombreArchivo(desde, hasta, nombreTerapeuta) {
  const suf = nombreTerapeuta ? '_' + slug(nombreTerapeuta) : '';
  if (esMesCompleto(desde, hasta)) {
    const a = aFecha(desde);
    return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}${suf}.xlsx`;
  }
  if (desde === hasta) return `agenda_${desde}${suf}.xlsx`;
  return `agenda_${desde}_a_${hasta}${suf}.xlsx`;
}
