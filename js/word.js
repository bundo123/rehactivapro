// ── Exportación de informes a Word (.docx) ──────────────────────────────────
// Segundo canal de exportación del informe de paciente, junto al PDF (buildPdfHtml en
// informes.js, que sigue intacto para el histórico). Recibe el MISMO render-model que el PDF
// (_buildRenderModel en informes.js) más el campo `firmante`, que se pide en el modal de firmante
// antes de llamar acá (abrirFirmanteModal/confirmarExportarWord en informes.js).
//
// Estilo: puerto LITERAL de newdesign/Informe-Rehactiva-VERSION-FINAL.docx (la versión definitiva
// del handoff "menos líneas, más aire" — b57c395 había portado una intermedia). Tamaños, colores,
// spacing, bordes, sombreados y anchos de tabla salen de descomprimir ese .docx y leer
// word/document.xml + styles.xml + header1.xml + footer1.xml, no del HTML ni del PDF.
//
// Dos ajustes deliberados SOBRE la referencia (no está mal leído, es a propósito):
//  · Arial en vez de Calibri en todo el documento — Arial es nativa en Word Y en Google Docs;
//    Calibri se sustituye en Docs y el documento se corre.
//  · El gráfico EVA recupera las dos líneas punteadas de referencia (EVA 3/6, sin etiqueta) que la
//    referencia había quitado, y agrega marcador hueco + tramo punteado para sesiones sin ningún
//    dato registrado (ni pb ni pa) — la referencia no tiene ese caso en su muestra.
//
// La librería (docx v9) se carga por IMPORT DINÁMICO: pesa ~1 MB sin comprimir y no puede entrar
// al bundle inicial — solo la baja quien exporta un informe a Word.
import { LOGO_DATA_URI } from './pdf-logo.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { dmy, CONFIG_CLINICA } from './utils.js';

// Data URI (base64) → Uint8Array. ImageRun no acepta el string 'data:...' con cabecera: quiere los
// bytes. atob es suficiente acá porque las imágenes (logo, gráfico EVA) ya vienen en base64.
function dataUriToBytes(uri) {
  const b64 = String(uri || '').split(',')[1] || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// SVG (string) → PNG (data URI), pasando por <img> + canvas. El SVG va por blob URL, no por data
// URI: en un data:image/svg+xml los caracteres no-ASCII (tildes, '·') obligan a encodear a mano y
// Safari es quisquilloso. Un blob del mismo origen NO contamina el canvas, así que toDataURL sigue
// funcionando. El escalado (scale 2) es para que la imagen no se vea pixelada al imprimir el .docx.
function svgToPngDataUri(svg, w, h, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = w * scale; c.height = h * scale;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El SVG no se pudo rasterizar')); };
    img.src = url;
  });
}

// Descarga del blob que devuelve Packer. Con <a download> — nada de window.open, que en Safari iPad
// es justo lo que bloquea el popup del PDF (R-22).
function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Gráfico EVA — versión propia (no la de utils.js, que sigue alimentando el PDF con
// ejes/grilla/bandas). Lienzo lógico fijo 605×211 (proporción 1210×422 de la referencia,
// rasterizado 2x más abajo). Sin ejes, sin grilla, sin leyenda.
//
// Recorre TODAS las sesiones de tratamiento (no solo las que tienen pb) para que la posición de
// cada punto coincida con su número de fila en "Detalle por sesión". Una sesión sin pb NI pa (sin
// ningún dato registrado) no se omite: hereda el último valor conocido para no cortar la línea, se
// dibuja con marcador hueco, y los dos tramos que tocan ese punto van punteados — mismo lenguaje
// visual que el "5 → —" del detalle por sesión.
function buildEvaSvgWord(m) {
  const met = m.metricas || {};
  const rows = m.sesiones || [];
  const startVal = met.evaInicial != null ? met.evaInicial : (rows.find(s => s.pb != null || s.pa != null)?.pb ?? null);
  if (startVal == null) return '';

  const pts = [{ v: startVal, lbl: m.evalInicial ? 'Eval. inicial' : 'Inicio', hollow: false }];
  let last = startVal;
  rows.forEach((s, i) => {
    const real = s.pb != null || s.pa != null;
    const v = real ? (s.pa != null ? s.pa : s.pb) : last;
    last = v;
    pts.push({ v, lbl: 'Sesión ' + (i + 1), hollow: !real });
  });
  if (met.evaActual != null) pts[pts.length - 1].v = met.evaActual;

  const W = 605, H = 130;
  const L = 26, R = W - 10;
  const n = pts.length;
  const x = i => n > 1 ? L + i * (R - L) / (n - 1) : (L + R) / 2;

  const vals = pts.map(p => p.v);
  const vMax = Math.max(...vals, 6), vMin = Math.min(...vals, 3); // 3/6 quedan visibles si hay dato cerca
  const TOP = 22, LABEL_Y = H - 9, BASE = LABEL_Y - 11;
  // Colchón entre el valor más bajo de la serie y la base del área: sin esto, un EVA 0 (o el
  // mínimo de la serie) cae justo sobre el borde inferior del área sombreada y se confunde con
  // él. El área sigue apoyada en BASE — el colchón solo empuja el MAPEO de valores, no la forma.
  const CUSHION = 10;
  const range = Math.max(1, vMax - vMin);
  const pxPerEva = (BASE - CUSHION - TOP) / range;
  const y = v => BASE - CUSHION - (v - vMin) * pxPerEva;

  let g = '';
  // Referencias leve/moderado/severo — discretas, sin etiqueta (ajuste sobre la referencia, que
  // las había quitado; color D8D2C6 tal como pide el handoff).
  [3, 6].forEach(v => {
    if (v < vMin - 0.5 || v > vMax + 0.5) return;
    const yy = y(v).toFixed(1);
    g += `<line x1="${L}" y1="${yy}" x2="${R}" y2="${yy}" stroke="#d8d2c6" stroke-width="1" stroke-dasharray="4 3"/>`;
  });

  const areaPts = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  g += `<path d="M${areaPts.split(' ')[0]} L${areaPts.split(' ').join(' L')} L${x(n - 1).toFixed(1)},${BASE.toFixed(1)} L${x(0).toFixed(1)},${BASE.toFixed(1)} Z" fill="#145b6d" opacity="0.06"/>`;

  for (let i = 1; i < n; i++) {
    const dashed = pts[i].hollow || pts[i - 1].hollow;
    g += `<line x1="${x(i - 1).toFixed(1)}" y1="${y(pts[i - 1].v).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${y(pts[i].v).toFixed(1)}" stroke="#145b6d" stroke-width="2" stroke-linecap="round"${dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
  }

  // Con muchos puntos las etiquetas del eje X se pisan: por arriba de ~8 se muestra una cada
  // `step` (siempre la primera y la última), nunca todas. Los extremos además cambian de anchor
  // (start/end en vez de middle) para que el texto no se salga del viewBox por ninguno de los dos
  // lados — a la primera le sobra ancho a la derecha, a la última a la izquierda.
  const step = n > 8 ? Math.ceil((n - 1) / 7) : 1;
  pts.forEach((p, i) => {
    const xi = x(i);
    const px_ = xi.toFixed(1), py = y(p.v);
    const last_ = i === n - 1;
    const r = last_ ? 6 : 4.5;
    g += p.hollow
      ? `<circle cx="${px_}" cy="${py.toFixed(1)}" r="${r}" fill="#ffffff" stroke="#145b6d" stroke-width="2"/>`
      : `<circle cx="${px_}" cy="${py.toFixed(1)}" r="${r}" fill="#145b6d"/>`;
    if (!p.hollow) {
      g += `<text x="${px_}" y="${(py - 11).toFixed(1)}" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${last_ ? '#145b6d' : '#22201d'}">${p.v}</text>`;
    }
    if (i === 0 || last_ || i % step === 0) {
      const anchor = i === 0 ? 'start' : (last_ ? 'end' : 'middle');
      g += `<text x="${px_}" y="${LABEL_Y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="10" fill="#a09889">${p.lbl}</text>`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// "Esguince de tobillo grado II (CIE-10: S93.4)" (diagConCie en utils.js, texto único compartido
// con el PDF) → { diag, cie }. El diseño nuevo pone el código en su propia línea chica; el modelo
// no lo trae aparte, así que se separa acá nomás para Word, sin tocar utils.js/informes.js.
function splitDiagCie(texto) {
  const s = String(texto || '');
  const m = /^(.*?)\s*\(CIE-10:\s*([^)]+)\)\s*$/.exec(s);
  return m ? { diag: m[1].trim(), cie: m[2].trim() } : { diag: s, cie: null };
}

// "Ant. familiares: … | Zonas: Miembro inferior | Inspección: …" (evalRow.note, partido por
// ' | ' en informes.js → m.evalInicial.partes) → separa la parte "Zonas: …" del resto. NO es un
// campo inventado: sale del mismo formulario de evaluación inicial (pacientes.js saveEvalInicial),
// solo que viaja mezclado en `partes` en vez de aparte.
function extraerZona(partes) {
  const list = partes || [];
  const idx = list.findIndex(p => /^Zonas:\s*/i.test(p));
  if (idx === -1) return { zona: null, resto: list };
  return { zona: list[idx].replace(/^Zonas:\s*/i, '').trim(), resto: list.slice(0, idx).concat(list.slice(idx + 1)) };
}

// Genera y descarga el .docx del informe a partir del render-model (mismo shape que consume
// buildPdfHtml, más `firmante`). No toca state/_rptCtx/DOM — recibe todo lo que necesita en `m`.
export async function generarInformeWord(m) {
  try {
    toastInfo('Generando .docx…');
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
      Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign,
    } = await import('docx');

    // ── Design tokens (word/styles.xml + document.xml de la referencia, valores tal cual) ──
    const TITULO = '191C1D';     // primera línea del H1 ("Informe de evolución")
    const INK = '22201D';        // H2 de sección, valor de dato, nombre del firmante
    const PARRAFO = '3C3832';    // cuerpo de párrafo — también el color/tamaño por defecto del doc
    const ACENTO = '145B6D';     // nombre del paciente en cursiva, cifras del panel, EVA "antes → después"
    const SECUNDARIO = '6F6A62'; // etiqueta bajo la cifra grande del panel de métricas
    const TERCIARIO = '7A746B';  // subline del título, id de documento en el membrete
    const ETIQUETA = 'A09889';   // etiquetas de dato, CIE-10, metadato de sesión/evaluación inicial
    const VACIO = 'B5ADA0';      // "No registrado/a", sesión sin ningún dato registrado
    const SESION_NUM = 'D8D2C6'; // numeración de sesión, línea de firma
    const REGLA = 'E2DED6';      // filete del membrete y de los H2 de sección
    const PANEL_BG = 'F6F4EF';   // fondo del panel de métricas, caja de evaluación inicial, filas pares
    const FADED = '9B948A';      // parte secundaria de las cifras del panel ("/ 12", "%"), pie de página

    const SERIF = 'Georgia';     // reemplaza Newsreader — garantizada en Word/Google Docs sin incrustar
    const SANS = 'Arial';        // reemplaza Calibri (ajuste sobre la referencia — ver cabecera del archivo)

    // Tamaños en medios punto (size = pt × 2). Un nombre por cada tamaño distinto visto en el XML.
    const SZ = {
      h1: 44, subline: 19, etiquetaDato: 16, valorDato: 23, cie10: 18, h2: 26,
      cifraPanel: 52, cifraPanelSec: 30, etqMetrica: 17, cuerpo: 21, zonaEval: 18,
      subtituloNarr: 17, metadatoSesion: 18, numSesion: 40, evaSesion: 26,
      firmaNombre: 21, firmaRol: 18, docId: 16, pie: 16,
    };
    const TRACK_CAPS = 24; // characterSpacing de TODO run en versalitas (únicos con letter-spacing en el doc)

    const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const bordesInvisibles = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde, insideHorizontal: sinBorde, insideVertical: sinBorde };
    const FILETE_H2 = { style: BorderStyle.SINGLE, size: 6, color: REGLA, space: 14 };
    const FILETE_HEADER = { style: BorderStyle.SINGLE, size: 6, color: REGLA, space: 6 };
    const FILETE_FIRMA = { style: BorderStyle.SINGLE, size: 6, color: SESION_NUM, space: 1 };

    // Página carta (12240×15840 twips) con los márgenes exactos de sectPr — no A4, no 0.7in parejo.
    const PAGE_W = 12240, PAGE_H = 15840;
    const MARGIN = { top: 1800, bottom: 1440, left: 1008, right: 1008, header: 720, footer: 576, gutter: 0 };
    const IND_FIRMA = 6100; // ind.right de la línea de firma (twips) — acorta el filete, no lo mueve

    // ── Datos derivados del modelo ──
    const met = m.metricas || {};
    const ses = m.sesiones || [];
    const narr = m.narrativa;

    // Un solo formato de fecha en todo el documento (DD/MM/YYYY vía dmy) — la fecha de emisión se
    // calcula acá mismo en vez de usar m.fechaLarga (que viene pre-formateada en prosa larga).
    const emisionCorta = dmy(new Date().toISOString().slice(0, 10));
    const periodoInicio = (m.evalInicial && m.evalInicial.fecha) || (ses[0] && ses[0].fecha) || null;
    const periodoFin = ses.length ? ses[ses.length - 1].fecha : null;
    const periodo = !periodoInicio ? emisionCorta
      : (periodoFin && periodoFin !== periodoInicio) ? `${dmy(periodoInicio)} – ${dmy(periodoFin)}` : dmy(periodoInicio);

    // Campo vacío: nunca se oculta ni se pone '—' — "No registrada/o" en VACIO, con la concordancia
    // de género de cada etiqueta (tal como lo fija el diseño para Cédula/Edad/Doctor referente).
    function campo(etiqueta, valor, vacioTexto) {
      const t = valor == null ? '' : String(valor).trim();
      const ok = t && t !== 'Sin edad';
      return { etiqueta, texto: ok ? t : vacioTexto, vacio: !ok };
    }
    const { diag, cie } = splitDiagCie(m.paciente.diagnostico);
    const campoDiag = campo('Diagnóstico', diag, 'No registrado');
    if (!campoDiag.vacio && cie) campoDiag.cie10 = cie;
    // Orden de campos tal cual el diseño: Diagnóstico, Terapeuta, Inicio de tratamiento / Edad,
    // Cédula, Doctor referente (la fila 2 invierte Edad↔Cédula respecto al orden PDF/pantalla).
    const camposFila1 = [
      campoDiag,
      campo('Terapeuta', m.terapeuta, 'No registrado'),
      campo('Inicio de tratamiento', m.inicio ? dmy(m.inicio) : null, 'No registrado'),
    ];
    const camposFila2 = [
      campo('Edad', m.paciente.edad, 'No registrada'),
      campo('Cédula', m.paciente.cedula, 'No registrada'),
      campo('Doctor referente', m.doctor, 'No registrado'),
    ];

    // Cifra del panel de métricas — solo la celda EVA es un único run grande (sin sufijo chico):
    // "7 → 4" completo en ACENTO, o VACIO si no hay serie.
    const evaFig = met.evaHas ? `${met.evaInicial} → ${met.evaActual != null ? met.evaActual : '—'}` : '—';
    const evaSub = met.evaHas ? 'dolor EVA · inicial a actual' : 'sin datos registrados';

    // Gráfico EVA: propio del diseño nuevo. Si no hay serie construible, cae al PNG ya capturado
    // del canvas en pantalla (snapshots viejos, con el estilo de ejes/bandas anterior); si tampoco
    // hay eso, se omite la sección entera.
    const evaSvg = buildEvaSvgWord(m);
    let evaPng = null, evaPngW = 605, evaPngH = 130;
    if (evaSvg) {
      // 1210×260 rasterizado (2x de 605×130) — sigue bajando (1210×422 -> 1210×300 -> 1210×260)
      // para dejar más margen a la caja de "Evaluación inicial" en lo que queda de página 1.
      evaPng = await svgToPngDataUri(evaSvg, 605, 130, 2);
    } else if (m.evaChartImg) { evaPng = m.evaChartImg; evaPngW = 605; evaPngH = 191; }

    // ── Estilos de párrafo ──
    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: SANS, size: SZ.cuerpo, color: PARRAFO }, paragraph: { spacing: { after: 120, line: 276, lineRule: 'auto' } } },
        },
        paragraphStyles: [
          { id: 'Subline', name: 'Subline', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.subline, color: TERCIARIO },
            paragraph: { spacing: { before: 0, after: 400, line: 240, lineRule: 'auto' } } },
          { id: 'H2', name: 'H2', basedOn: 'Normal', quickFormat: true,
            run: { font: SERIF, size: SZ.h2, color: INK },
            // keepNext (no está en la referencia, es un ajuste: "Detalle por sesión" quedaba solo
            // al pie de página) — pega el título con lo que sigue, sea imagen, tabla o párrafo.
            paragraph: { border: { top: FILETE_H2 }, spacing: { before: 320, after: 140, line: 240, lineRule: 'auto' }, keepNext: true } },
          { id: 'EtiquetaDato', name: 'Etiqueta Dato', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.etiquetaDato, allCaps: true, color: ETIQUETA, characterSpacing: TRACK_CAPS },
            paragraph: { spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' } } },
          { id: 'ValorDato', name: 'Valor Dato', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.valorDato, bold: true, color: INK },
            paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'Cie10Line', name: 'Cie10 Line', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.cie10, color: ETIQUETA },
            paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'MetricLabel', name: 'Metric Label', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.etqMetrica, color: SECUNDARIO },
            paragraph: { spacing: { before: 0, after: 60, line: 240, lineRule: 'auto' } } },
          { id: 'Cuerpo', name: 'Cuerpo', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.cuerpo, color: PARRAFO },
            paragraph: { spacing: { before: 0, after: 0, line: 340, lineRule: 'auto' } } },
          { id: 'ZonaEval', name: 'Zona Eval', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.zonaEval, color: ETIQUETA },
            paragraph: { spacing: { before: 140, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'SubtituloNarr', name: 'Subtitulo Narr', basedOn: 'Normal', quickFormat: true,
            run: { bold: true, allCaps: true, size: SZ.subtituloNarr, color: ACENTO, characterSpacing: TRACK_CAPS },
            paragraph: { spacing: { before: 280, after: 60, line: 240, lineRule: 'auto' } } },
          { id: 'MetadatoSesion', name: 'Metadato Sesion', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.metadatoSesion, color: ETIQUETA },
            paragraph: { spacing: { before: 0, after: 60, line: 240, lineRule: 'auto' } } },
          { id: 'ObsSesion', name: 'Obs Sesion', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.cuerpo, color: PARRAFO },
            paragraph: { spacing: { before: 0, after: 0, line: 300, lineRule: 'auto' } } },
          { id: 'ObsSesionVacia', name: 'Obs Sesion Vacia', basedOn: 'ObsSesion', quickFormat: true,
            run: { color: VACIO } },
          { id: 'NumSesion', name: 'Num Sesion', basedOn: 'Normal', quickFormat: true,
            run: { font: SERIF, size: SZ.numSesion, color: SESION_NUM },
            paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'EvaSesion', name: 'Eva Sesion', basedOn: 'Normal', quickFormat: true,
            run: { font: SERIF, size: SZ.evaSesion, color: ACENTO },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'FirmaNombre', name: 'Firma Nombre', basedOn: 'Normal', quickFormat: true,
            run: { bold: true, size: SZ.firmaNombre, color: INK },
            paragraph: { spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' } } },
          { id: 'FirmaRol', name: 'Firma Rol', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.firmaRol, color: ETIQUETA },
            paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'DocId', name: 'Doc Id', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.docId, allCaps: true, color: TERCIARIO, characterSpacing: TRACK_CAPS },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } } },
          { id: 'Pie', name: 'Pie', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.pie, color: FADED },
            paragraph: { spacing: { before: 0, after: 0, line: 260, lineRule: 'auto' } } },
        ],
      },
      sections: [{
        properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: MARGIN } },

        // Membrete: logo (218×62, PNG original 562×160) a la izquierda + id de documento a la
        // derecha en una tabla de 2 celdas (5200/4700 dxa, tal como header1.xml), con el filete
        // E2DED6 en un párrafo VACÍO aparte debajo — no un borde de tabla. Se repite por página.
        headers: { default: new Header({ children: [
          new Table({
            width: { size: 9900, type: WidthType.DXA },
            columnWidths: [5200, 4700],
            borders: bordesInvisibles,
            rows: [new TableRow({ cantSplit: true, children: [
              new TableCell({
                width: { size: 5200, type: WidthType.DXA },
                borders: bordesInvisibles, verticalAlign: VerticalAlign.TOP,
                margins: { top: 0, bottom: 0, left: 0, right: 140 },
                children: [new Paragraph({ spacing: { before: 0, after: 120, line: 240, lineRule: 'auto' }, children: [new ImageRun({
                  type: 'png', data: dataUriToBytes(LOGO_DATA_URI),
                  transformation: { width: 218, height: 62 },
                })] })],
              }),
              new TableCell({
                width: { size: 4700, type: WidthType.DXA },
                borders: bordesInvisibles, verticalAlign: VerticalAlign.TOP,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [new Paragraph({ style: 'DocId', text: `Informe de evolución · ${m.numero || '—'}` })],
              }),
            ] })],
          }),
          new Paragraph({ border: { bottom: FILETE_HEADER }, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [] }),
        ] }) },

        // Pie: una sola línea de dirección, sin filete propio. Se repite por página.
        footers: { default: new Footer({ children: [
          new Paragraph({ style: 'Pie', text: piePagina() }),
        ] }) },

        children: [
          // ── Título — dos párrafos separados (no un salto de línea dentro de uno solo), tal
          // como los arma la referencia ──
          new Paragraph({
            spacing: { before: 0, after: 0, line: 260, lineRule: 'auto' },
            children: [new TextRun({ text: 'Informe de evolución', font: SERIF, size: SZ.h1, color: TITULO })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 140, line: 260, lineRule: 'auto' },
            children: [new TextRun({ text: m.paciente.nombre || '—', font: SERIF, size: SZ.h1, color: ACENTO, italics: true })],
          }),
          new Paragraph({ style: 'Subline', text: `Emitido el ${emisionCorta} · Período ${periodo}` }),

          // ── Datos del paciente — una sola tabla 2×3 sin bordes, etiqueta encima del valor
          // (+ tercera línea CIE-10 en la celda Diagnóstico cuando hay código) ──
          new Table({
            width: { size: 10200, type: WidthType.DXA },
            columnWidths: [3400, 3400, 3400],
            borders: bordesInvisibles,
            rows: [
              new TableRow({ cantSplit: true, children: camposFila1.map(campoCelda) }),
              new TableRow({ cantSplit: true, children: camposFila2.map(campoCelda) }),
            ],
          }),
          new Paragraph({ spacing: { before: 0, after: 220, line: 240, lineRule: 'auto' }, children: [] }),

          // ── Panel de métricas — 1 fila × 3 columnas, fondo F6F4EF, sin bordes ──
          new Table({
            width: { size: 10200, type: WidthType.DXA },
            columnWidths: [3400, 3400, 3400],
            borders: bordesInvisibles,
            rows: [new TableRow({ cantSplit: true, children: [
              panelCelda([
                new TextRun({ text: `${met.done ?? 0}`, font: SERIF, size: SZ.cifraPanel, color: ACENTO }),
                new TextRun({ text: ` / ${met.sessions ?? 0}`, font: SERIF, size: SZ.cifraPanelSec, color: FADED }),
              ], `sesiones · ${met.pct ?? 0}% del plan`),
              panelCelda([
                new TextRun({ text: `${met.adh ?? 0}`, font: SERIF, size: SZ.cifraPanel, color: ACENTO }),
                new TextRun({ text: '%', font: SERIF, size: SZ.cifraPanelSec, color: FADED }),
              ], `continuidad · ${met.asistidas ?? 0} de ${met.totalCitas ?? 0} citas`),
              panelCelda([
                new TextRun({ text: evaFig, font: SERIF, size: SZ.cifraPanel, color: met.evaHas ? ACENTO : VACIO }),
              ], evaSub),
            ] })],
          }),

          // ── Gráfico EVA ──
          ...(evaPng ? [
            new Paragraph({ style: 'H2', text: 'Evolución del dolor' }),
            new Paragraph({ spacing: { before: 0, after: 120, line: 240, lineRule: 'auto' }, children: [new ImageRun({
              type: 'png', data: dataUriToBytes(evaPng),
              transformation: { width: evaPngW, height: evaPngH },
            })] }),
            new Paragraph({ spacing: { before: 0, after: 180, line: 240, lineRule: 'auto' }, children: [] }),
          ] : []),

          // ── Evaluación inicial — caja sombreada F6F4EF (mismo tratamiento que el panel de
          // métricas), título+metadato en una línea, cuerpo, y "Zona evaluada" si el formulario
          // trajo una parte "Zonas: …" ──
          ...(m.evalInicial ? [(() => {
            const { zona, resto } = extraerZona(m.evalInicial.partes);
            return new Table({
              width: { size: 9900, type: WidthType.DXA },
              columnWidths: [9900],
              borders: bordesInvisibles,
              // cantSplit false a propósito (a diferencia del resto de tablas del documento): si
              // no cabe entera en lo que deja el gráfico, que continúe en la página siguiente en
              // vez de saltar la caja completa y dejar un hueco grande al pie de la página 1.
              rows: [new TableRow({ cantSplit: false, children: [new TableCell({
                width: { size: 9900, type: WidthType.DXA },
                borders: bordesInvisibles, shading: { fill: PANEL_BG }, verticalAlign: VerticalAlign.TOP,
                margins: { top: 260, bottom: 260, left: 260, right: 140 },
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 120, line: 240, lineRule: 'auto' },
                    children: [
                      new TextRun({ text: 'Evaluación inicial  ', font: SERIF, size: SZ.h2, color: INK }),
                      new TextRun({ text: `${dmy(m.evalInicial.fecha)} · EVA ${m.evalInicial.pb != null ? m.evalInicial.pb : '—'}/10`, allCaps: true, size: SZ.etqMetrica, color: ETIQUETA, characterSpacing: TRACK_CAPS }),
                    ],
                  }),
                  // keepNext en el ÚLTIMO párrafo de cuerpo (el penúltimo de la caja) cuando hay
                  // "Zona evaluada": la pega a esa línea para que nunca arranque sola una página —
                  // cantSplit:false de la tabla sigue permitiendo partir ANTES de ese punto.
                  ...(resto.length
                    ? resto.map((x, i) => new Paragraph({ style: 'Cuerpo', text: x, keepNext: !!zona && i === resto.length - 1 }))
                    : [new Paragraph({ style: 'Cuerpo', keepNext: !!zona, children: [new TextRun({ text: 'Sin detalle registrado', size: SZ.cuerpo, color: VACIO })] })]),
                  ...(zona ? [new Paragraph({ style: 'ZonaEval', text: `Zona evaluada: ${zona.toLowerCase()}` })] : []),
                ],
              })] })],
            });
          })(), new Paragraph({ spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [] })] : []),

          // ── Narrativa clínica — subtítulo (versalitas, ACENTO) + párrafo, repetido por cada
          // una de las subsecciones (Condición inicial / Evolución del tratamiento / Resultados
          // obtenidos / Recomendaciones). Sin bordes ni fondo. ──
          ...(narr && narr.length ? [
            new Paragraph({ style: 'H2', text: 'Narrativa clínica' }),
            ...narr.flatMap(s => [
              new Paragraph({ style: 'SubtituloNarr', text: s.title }),
              ...String(s.body || '').split('\n').filter(Boolean).map((linea, i, arr) =>
                new Paragraph({ style: 'Cuerpo', spacing: { before: 0, after: i === arr.length - 1 ? 0 : 60, line: 340, lineRule: 'auto' }, text: linea })),
            ]),
          ] : []),

          // ── Detalle por sesión — tabla sin bordes, filas pares con fondo F6F4EF ──
          new Paragraph({ style: 'H2', text: 'Detalle por sesión' }),
          ...(ses.length ? [(() => {
            let carryEva = met.evaInicial;
            const filas = ses.map((s, i) => {
              const row = filaSesion(s, i, carryEva);
              if (s.pb != null) carryEva = s.pa != null ? s.pa : s.pb;
              return row;
            });
            return new Table({
              width: { size: 9900, type: WidthType.DXA },
              columnWidths: [700, 7800, 1400],
              borders: bordesInvisibles,
              rows: filas,
            });
          })()] : [new Paragraph({ style: 'Cuerpo', children: [new TextRun({ text: 'Sin sesiones de tratamiento registradas.', color: VACIO })] })]),

          // ── Firma ──
          new Paragraph({ spacing: { before: 0, after: 700, line: 240, lineRule: 'auto' }, children: [] }),
          new Paragraph({ indent: { right: IND_FIRMA }, border: { bottom: FILETE_FIRMA }, spacing: { before: 0, after: 140, line: 240, lineRule: 'auto' }, children: [] }),
          new Paragraph({ style: 'FirmaNombre', text: m.firmante || '—' }),
          new Paragraph({ style: 'FirmaRol', text: 'Fisioterapeuta · Rehactiva' }),
        ],
      }],
    });

    // ── Helpers de tabla/celda ──

    // Celda de "Datos del paciente": etiqueta (allCaps ETIQUETA) + valor (INK o VACIO) + tercera
    // línea CIE-10 (ETIQUETA, chica) cuando el campo la trae. Márgenes uniformes (tblCellMar de la
    // referencia no distingue primera/última columna).
    function campoCelda(c) {
      const children = [
        new Paragraph({ style: 'EtiquetaDato', text: c.etiqueta }),
        new Paragraph({ style: 'ValorDato', children: [new TextRun({ text: c.texto, size: SZ.valorDato, bold: true, color: c.vacio ? VACIO : INK })] }),
      ];
      if (c.cie10) children.push(new Paragraph({ style: 'Cie10Line', text: `CIE-10 ${c.cie10}` }));
      return new TableCell({
        width: { size: 3400, type: WidthType.DXA },
        borders: bordesInvisibles, verticalAlign: VerticalAlign.TOP,
        margins: { top: 140, bottom: 140, left: 0, right: 140 },
        children,
      });
    }

    // Celda del panel de métricas / evaluación inicial: cifra grande (runs con distinto
    // tamaño/color) + etiqueta chica debajo. Márgenes uniformes (200/200/200/140, tal como
    // tblCellMar del panel — no hay variante primera/última).
    function panelCelda(runs, etiqueta) {
      return new TableCell({
        width: { size: 3400, type: WidthType.DXA },
        borders: bordesInvisibles, shading: { fill: PANEL_BG }, verticalAlign: VerticalAlign.TOP,
        margins: { top: 200, bottom: 200, left: 200, right: 140 },
        children: [
          new Paragraph({ spacing: { before: 60, after: 20, line: 240, lineRule: 'auto' }, children: runs }),
          new Paragraph({ style: 'MetricLabel', text: etiqueta }),
        ],
      });
    }

    // Fila de "Detalle por sesión": número con cero inicial / metadato+observación / EVA
    // antes→después. Filas pares con fondo F6F4EF. Una sesión sin pb (ningún dato registrado)
    // hereda el último EVA conocido (`carryEva`) para el lado izquierdo de la flecha y muestra
    // "—" del lado derecho, todo en VACIO — igual criterio que el gráfico.
    function filaSesion(s, i, carryEva) {
      const n = i + 1;
      const par = n % 2 === 0;
      const shading = par ? { fill: PANEL_BG } : undefined;
      const meta = [dmy(s.fecha), s.terapeuta || null, s.tecnicas ? s.tecnicas.toLowerCase() : null].filter(Boolean).join(' · ');
      const registrada = s.pb != null;
      const evaTxt = registrada ? `${s.pb} → ${s.pa != null ? s.pa : '?'}` : (carryEva != null ? `${carryEva} → —` : '—');
      // Sin observación: el texto depende de si HAY técnicas registradas o no — una sesión con
      // técnicas (ej. "kinesiotape, electroterapia") pero sin nota no es lo mismo que una sesión
      // sin ningún dato. La frase larga es solo para el caso "nada registrado".
      const obsTexto = s.tecnicas ? 'Sin observación registrada.' : 'Sesión sin observación ni técnicas registradas.';
      return new TableRow({ cantSplit: true, children: [
        new TableCell({
          width: { size: 700, type: WidthType.DXA }, borders: bordesInvisibles, shading, verticalAlign: VerticalAlign.TOP,
          margins: { top: 180, bottom: 180, left: 0, right: 140 },
          children: [new Paragraph({ style: 'NumSesion', text: String(n).padStart(2, '0') })],
        }),
        new TableCell({
          width: { size: 7800, type: WidthType.DXA }, borders: bordesInvisibles, shading, verticalAlign: VerticalAlign.TOP,
          margins: { top: 180, bottom: 180, left: 0, right: 140 },
          children: [
            new Paragraph({ style: 'MetadatoSesion', text: meta }),
            s.obs
              ? new Paragraph({ style: 'ObsSesion', text: s.obs })
              : new Paragraph({ style: 'ObsSesionVacia', text: obsTexto }),
          ],
        }),
        new TableCell({
          width: { size: 1400, type: WidthType.DXA }, borders: bordesInvisibles, shading, verticalAlign: VerticalAlign.TOP,
          margins: { top: 180, bottom: 180, left: 0, right: 140 },
          children: [new Paragraph({ style: 'EvaSesion', children: [new TextRun({ text: evaTxt, font: SERIF, size: SZ.evaSesion, color: registrada ? ACENTO : VACIO })] })],
        }),
      ] });
    }

    function piePagina() {
      return ['Rehactiva', 'Centro de rehabilitación y fisioterapia', CONFIG_CLINICA.DIRECCION,
        CONFIG_CLINICA.TELEFONO ? 'Tel. ' + CONFIG_CLINICA.TELEFONO : '', CONFIG_CLINICA.EMAIL]
        .filter(Boolean).join(' · ');
    }

    const blob = await Packer.toBlob(doc);
    const nombreArchivo = `informe-${(m.paciente?.nombre || 'paciente').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'paciente'}-${m.numero || ''}.docx`;
    descargar(blob, nombreArchivo);
    toastOk(`✓ .docx generado (${Math.round(blob.size / 1024)} KB)`);
  } catch (e) {
    console.error('[word]', e);
    toastErr('Falló la generación del .docx: ' + (e?.message || e));
  }
}
