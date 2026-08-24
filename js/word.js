// ── Exportación de informes a Word (.docx) ──────────────────────────────────
// Segundo canal de exportación del informe de paciente, junto al PDF (buildPdfHtml en
// informes.js, que sigue intacto para el histórico). Recibe el MISMO render-model que el PDF
// (_buildRenderModel en informes.js) más el campo `firmante`, que se pide en el modal de firmante
// antes de llamar acá (abrirFirmanteModal/confirmarExportarWord en informes.js).
//
// Estilo: puerto del handoff de diseño "Informe de evolución — menos líneas, más aire"
// (newdesign/…/design_handoff_informe_rehactiva). Newsreader→Georgia y Archivo→Arial porque son
// las que docx puede garantizar sin incrustar fuentes ni depender de red. El documento casi no
// tiene bordes: solo el filete bajo el membrete, el fondo del panel de métricas y de las filas
// pares de sesión, y la línea de firma. Nada de bordes verticales ni de tabla "de los 4 lados".
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

// ── Gráfico EVA — versión propia del diseño nuevo (no la de utils.js, que sigue alimentando el
// PDF con ejes/grilla/bandas). Sin ejes, sin grilla, sin leyenda. Se agregan dos líneas punteadas
// discretas en EVA 3 y 6 (corte leve/moderado/severo) SIN etiqueta de texto — punto intermedio
// acordado: nada de grilla completa, pero un médico referente conserva una referencia visual.
//
// Escala: 32px por punto EVA, fija (no autoescalada al rango 0–10), para que un cambio chico de
// dolor siga mostrando una pendiente visible en vez de aplanarse. El punto de mayor dolor de la
// serie se ancla cerca del borde superior; el resto cuelga de ahí a la misma escala.
function buildEvaSvgWord(m) {
  const ses = (m.sesiones || []).map((s, i) => ({ ...s, n: i + 1 })).filter(s => s.pb != null);
  if (!ses.length) return '';
  const met = m.metricas || {};
  const startVal = met.evaInicial != null ? met.evaInicial : ses[0].pb;
  const endVal = met.evaActual != null ? met.evaActual : ses[ses.length - 1].pa;
  const mid = ses.map(s => s.pa != null ? s.pa : s.pb);
  if (endVal != null) mid[mid.length - 1] = endVal;
  const pts = [startVal, ...mid].map((v, i) => i === 0
    ? { v, lbl: m.evalInicial ? 'Eval. inicial' : 'Inicio' }
    : { v, lbl: 'Sesión ' + ses[i - 1].n });

  const n = pts.length;
  const L = 34, R = 631;
  const x = i => n > 1 ? L + i * (R - L) / (n - 1) : (L + R) / 2;

  const PX_PER_EVA = 32, TOP_PAD = 45;
  const vals = pts.map(p => p.v);
  const vMax = Math.max(...vals), vMin = Math.min(...vals);
  const y = v => TOP_PAD + (vMax - v) * PX_PER_EVA;
  const baseline = Math.max(y(vMin) + 24, TOP_PAD + 60);
  const labelsY = baseline + 24;
  const H = labelsY + 10;

  let g = '';
  // Referencias discretas leve/moderado/severo — sin texto, se clipan solas si caen fuera de vista.
  [3, 6].forEach(v => {
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${R}" y2="${y(v).toFixed(1)}" stroke="#e2ded6" stroke-width="1" stroke-dasharray="4 3"/>`;
  });

  const areaPts = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  g += `<path d="M${areaPts.split(' ')[0]} L${areaPts.split(' ').join(' L')} L${x(n - 1).toFixed(1)},${baseline.toFixed(1)} L${x(0).toFixed(1)},${baseline.toFixed(1)} Z" fill="#145b6d" opacity="0.06"/>`;
  g += `<polyline points="${areaPts}" fill="none" stroke="#145b6d" stroke-width="2" stroke-linecap="round"/>`;

  pts.forEach((p, i) => {
    const px = x(i).toFixed(1), py = y(p.v);
    const last = i === n - 1;
    g += `<circle cx="${px}" cy="${py.toFixed(1)}" r="${last ? 6 : 4.5}" fill="#145b6d"/>`;
    g += `<text x="${px}" y="${(py - 20).toFixed(1)}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${last ? '#145b6d' : '#22201d'}">${p.v}</text>`;
    g += `<text x="${px}" y="${labelsY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#a09889">${p.lbl}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="${H}" viewBox="0 0 660 ${H}">${g}</svg>`;
}

// Genera y descarga el .docx del informe a partir del render-model (mismo shape que consume
// buildPdfHtml, más `firmante`). No toca state/_rptCtx/DOM — recibe todo lo que necesita en `m`.
export async function generarInformeWord(m) {
  try {
    toastInfo('Generando .docx…');
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
      Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign,
      convertInchesToTwip,
    } = await import('docx');

    // ── Design tokens (handoff "Informe de evolución — menos líneas, más aire") ──
    const INK = '22201D';        // tinta principal — H1, valor de dato, número de sesión (col3 sin acento)
    const PARRAFO = '3C3832';    // cuerpo de párrafo (evaluación inicial, narrativa, observación)
    const ACENTO = '145B6D';     // nombre del paciente en cursiva, cifras del panel, EVA "antes → después"
    const SECUNDARIO = '6F6A62'; // etiqueta bajo la cifra grande del panel de métricas
    const TERCIARIO = '7A746B';  // subline del título, id de documento en el membrete
    const ETIQUETA = 'A09889';   // etiquetas de dato, metadato de sesión, metadato de evaluación inicial
    const VACIO = 'B5ADA0';      // "No registrado/a"
    const SESION_NUM = 'D8D2C6'; // numeración de sesión, línea de firma
    const REGLA = 'E2DED6';      // filete del membrete, líneas de referencia del gráfico EVA
    const PANEL_BG = 'F6F4EF';   // fondo del panel de métricas y filas pares de sesión
    const FADED = '9B948A';      // parte secundaria de las cifras del panel ("/ 12", "%", "→"), pie de página

    const SERIF = 'Georgia';     // reemplaza Newsreader — garantizada en Word/Google Docs sin incrustar
    const SANS = 'Arial';        // reemplaza Archivo

    // Tamaños en medios punto (size = pt × 2).
    const SZ = {
      h1: 44, h2: 26, valorDato: 23, cuerpo: 21, subline: 19, metadato: 18,
      etqMetrica: 17, docId: 16, etqDato: 15, pie: 16, cifraPanel: 52, cifraPanelSec: 30, numSesion: 40,
    };

    const filete = { style: BorderStyle.SINGLE, size: 4, color: REGLA };
    const filaFirma = { style: BorderStyle.SINGLE, size: 4, color: SESION_NUM };
    const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const bordesInvisibles = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde, insideHorizontal: sinBorde, insideVertical: sinBorde };

    // Página A4 (default de docx), margen 0.7in en los 4 lados — el único margen que fija el diseño.
    const MARGIN = convertInchesToTwip(0.7);
    const PAGE_W = 11906; // A4, twips
    const CONTENT_W = PAGE_W - 2 * MARGIN; // 9890 twips ≈ 6.87in

    // max-width del diseño (in) → indent.right (twips) = ancho útil − max-width.
    const indentRight = inches => CONTENT_W - convertInchesToTwip(inches);
    const IND_EVAL = indentRight(5.6);   // párrafo de evaluación inicial / narrativa
    const IND_FIRMA = CONTENT_W - convertInchesToTwip(2.6); // línea de firma, 2.6in de ancho

    // px → twips a 96dpi (1px = 0.75pt = 15 twips). em·pt → characterSpacing (1/20 pt).
    const px = n => n * 15;
    const track = (em, pt) => Math.round(em * pt * 20);

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
    const camposFila1 = [
      campo('Diagnóstico', m.paciente.diagnostico, 'No registrado'),
      campo('Terapeuta', m.terapeuta, 'No registrado'),
      campo('Inicio de tratamiento', m.inicio ? dmy(m.inicio) : null, 'No registrado'),
    ];
    const camposFila2 = [
      campo('Cédula', m.paciente.cedula, 'No registrada'),
      campo('Edad', m.paciente.edad, 'No registrada'),
      campo('Doctor referente', m.doctor, 'No registrado'),
    ];

    const evaVal = met.evaHas
      ? { fig: String(met.evaInicial), sec: ' → ' + (met.evaActual != null ? String(met.evaActual) : '?'), sub: 'dolor EVA — inicial a actual' }
      : { fig: '—', sec: '', sub: 'sin datos registrados' };

    // Gráfico EVA: propio del diseño nuevo. Si no hay serie construible, cae al PNG ya capturado
    // del canvas en pantalla (snapshots viejos, con el estilo de ejes/bandas anterior); si tampoco
    // hay eso, se omite la sección entera.
    const evaSvg = buildEvaSvgWord(m);
    let evaPng = null, evaPngW = 605, evaPngH = 211;
    if (evaSvg) {
      const hMatch = /viewBox="0 0 660 (\d+(?:\.\d+)?)"/.exec(evaSvg);
      const svgH = hMatch ? parseFloat(hMatch[1]) : 230;
      evaPngW = 605; evaPngH = Math.round(evaPngW * (svgH / 660));
      evaPng = await svgToPngDataUri(evaSvg, 660, svgH);
    } else if (m.evaChartImg) { evaPng = m.evaChartImg; evaPngW = 605; evaPngH = 191; }

    // ── Estilos de párrafo ──
    const doc = new Document({
      styles: {
        default: { document: { run: { font: SANS, size: SZ.cuerpo, color: PARRAFO } } },
        paragraphStyles: [
          { id: 'Subline', name: 'Subline', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.subline, color: TERCIARIO, characterSpacing: track(0.01, 9.5) },
            paragraph: { spacing: { after: px(34) }, widowControl: true } },
          { id: 'H2', name: 'H2', basedOn: 'Normal', quickFormat: true,
            run: { font: SERIF, size: SZ.h2, color: INK, characterSpacing: track(0.005, 13) },
            paragraph: { spacing: { before: 0, after: px(14) }, keepNext: true, widowControl: true } },
          { id: 'EtiquetaDato', name: 'Etiqueta Dato', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.etqDato, allCaps: true, color: ETIQUETA, characterSpacing: track(0.11, 7.5) },
            paragraph: { spacing: { after: px(3) } } },
          { id: 'ValorDato', name: 'Valor Dato', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.valorDato, color: INK },
            paragraph: { spacing: { after: 0 } } },
          { id: 'EtiquetaMetrica', name: 'Etiqueta Metrica', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.etqMetrica, color: SECUNDARIO, characterSpacing: track(0.01, 8.5) },
            paragraph: { spacing: { after: 0 } } },
          { id: 'Cuerpo', name: 'Cuerpo', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.cuerpo, color: PARRAFO },
            paragraph: { alignment: AlignmentType.LEFT, spacing: { after: px(6), line: 384, lineRule: 'auto' }, widowControl: true } },
          { id: 'MetadatoEval', name: 'Metadato Eval', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.etqMetrica, allCaps: true, color: ETIQUETA, characterSpacing: track(0.06, 8.5) },
            paragraph: { spacing: { after: 0 } } },
          { id: 'ZonaEval', name: 'Zona Eval', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.metadato, color: ETIQUETA },
            paragraph: { spacing: { after: px(34) } } },
          { id: 'SubtituloNarr', name: 'Subtitulo Narr', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.subline, color: INK },
            paragraph: { spacing: { before: px(14), after: px(4) }, keepNext: true, widowControl: true } },
          { id: 'MetadatoSesion', name: 'Metadato Sesion', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.metadato, color: ETIQUETA, characterSpacing: track(0.04, 9) },
            paragraph: { spacing: { after: px(5) } } },
          { id: 'ObsSesion', name: 'Obs Sesion', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.cuerpo, color: PARRAFO },
            paragraph: { spacing: { after: 0, line: 372, lineRule: 'auto' }, widowControl: true } },
          { id: 'ObsSesionVacia', name: 'Obs Sesion Vacia', basedOn: 'ObsSesion', quickFormat: true,
            run: { color: VACIO } },
          { id: 'NumSesion', name: 'Num Sesion', basedOn: 'Normal', quickFormat: true,
            run: { font: SERIF, size: SZ.numSesion, color: SESION_NUM },
            paragraph: { spacing: { after: 0 } } },
          { id: 'EvaSesion', name: 'Eva Sesion', basedOn: 'Normal', quickFormat: true,
            run: { font: SERIF, size: SZ.h2, color: ACENTO },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { after: 0 } } },
          { id: 'FirmaNombre', name: 'Firma Nombre', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.cuerpo, color: INK },
            paragraph: { spacing: { before: px(6), after: px(2) } } },
          { id: 'FirmaRol', name: 'Firma Rol', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.metadato, color: ETIQUETA },
            paragraph: { spacing: { after: 0 } } },
          { id: 'DocId', name: 'Doc Id', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.docId, allCaps: true, color: TERCIARIO, characterSpacing: track(0.06, 8) },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { after: 0 } } },
          { id: 'Pie', name: 'Pie', basedOn: 'Normal', quickFormat: true,
            run: { size: SZ.pie, color: FADED },
            paragraph: { spacing: { after: 0, line: 360, lineRule: 'auto' }, indent: { right: indentRight(5.2) } } },
        ],
      },
      sections: [{
        properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },

        // Membrete: logo a la izquierda (218×62, el PNG original es 562×160) + id de documento a la
        // derecha, con la única regla horizontal del documento (aparte de la línea de firma) bajo
        // todo el bloque. Va en el HEADER de sección — se repite solo en cada página.
        headers: { default: new Header({ children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { ...bordesInvisibles, bottom: filete },
            rows: [new TableRow({ children: [
              new TableCell({
                width: { size: 40, type: WidthType.PERCENTAGE },
                borders: bordesInvisibles, verticalAlign: VerticalAlign.CENTER,
                margins: { top: 0, bottom: px(12), left: 0, right: 0 },
                children: [new Paragraph({ children: [new ImageRun({
                  type: 'png', data: dataUriToBytes(LOGO_DATA_URI),
                  transformation: { width: 218, height: 62 },
                })] })],
              }),
              new TableCell({
                width: { size: 60, type: WidthType.PERCENTAGE },
                borders: bordesInvisibles, verticalAlign: VerticalAlign.CENTER,
                margins: { top: 0, bottom: px(12), left: 0, right: 0 },
                children: [new Paragraph({ style: 'DocId', text: `Informe de evolución · ${m.numero || '—'}` })],
              }),
            ] })],
          }),
        ] }) },

        // Pie: una sola línea de dirección, sin filete (la única regla del documento es la del
        // membrete y la de la firma). Se repite por página desde el FOOTER de sección.
        footers: { default: new Footer({ children: [
          new Paragraph({ style: 'Pie', text: piePagina() }),
        ] }) },

        children: [
          // ── Título ──
          new Paragraph({
            spacing: { after: px(10), line: 274, lineRule: 'auto' },
            keepNext: true,
            children: [
              new TextRun({ text: 'Informe de evolución', font: SERIF, size: SZ.h1, color: '191C1D', characterSpacing: track(-0.015, 22) }),
              new TextRun({ text: m.paciente.nombre || '—', font: SERIF, size: SZ.h1, color: ACENTO, italics: true, characterSpacing: track(-0.015, 22), break: 1 }),
            ],
          }),
          new Paragraph({ style: 'Subline', text: `Emitido el ${emisionCorta} · Período ${periodo}` }),

          // ── Datos del paciente — grilla 3×2 sin bordes, etiqueta encima del valor ──
          datosTabla(camposFila1),
          datosTabla(camposFila2, px(34)),

          // ── Panel de métricas — 1 fila × 3 columnas, fondo F6F4EF, sin bordes ni radio ──
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordesInvisibles,
            rows: [new TableRow({ cantSplit: true, children: [
              panelCelda([{ t: `${met.done ?? 0}`, c: INK }, { t: ` / ${met.sessions ?? 0}`, c: FADED, sm: true }], `sesiones · ${met.pct ?? 0}% del plan`, true),
              panelCelda([{ t: `${met.adh ?? 0}`, c: INK }, { t: '%', c: FADED, sm: true }], `continuidad — ${met.asistidas ?? 0} de ${met.totalCitas ?? 0} citas asistidas`),
              panelCelda([{ t: evaVal.fig, c: INK }, { t: evaVal.sec, c: FADED, sm: true }], evaVal.sub, false, true),
            ] })],
          }),
          new Paragraph({ text: '', spacing: { after: px(34) } }),

          // ── Gráfico EVA ──
          ...(evaPng ? [
            new Paragraph({ style: 'H2', text: 'Evolución del dolor' }),
            new Paragraph({ spacing: { after: px(34) }, children: [new ImageRun({
              type: 'png', data: dataUriToBytes(evaPng),
              transformation: { width: evaPngW, height: evaPngH },
            })] }),
          ] : []),

          // ── Narrativa clínica — mismo patrón visual que Evaluación inicial: subtítulo chico +
          // párrafo, repetido por cada una de las 4 subsecciones (Condición inicial / Evolución del
          // tratamiento / Resultados obtenidos / Recomendaciones). Sin bordes ni fondo.
          ...(narr && narr.length ? [
            new Paragraph({ style: 'H2', text: 'Narrativa clínica' }),
            ...narr.flatMap(s => [
              new Paragraph({ style: 'SubtituloNarr', text: s.title }),
              ...String(s.body || '').split('\n').filter(Boolean).map((linea, i, arr) =>
                new Paragraph({ style: 'Cuerpo', indent: { right: IND_EVAL },
                  spacing: { after: i === arr.length - 1 ? px(14) : px(6), line: 384, lineRule: 'auto' },
                  text: linea })),
            ]),
            new Paragraph({ text: '', spacing: { after: px(20) } }),
          ] : []),

          // ── Evaluación inicial ──
          ...(m.evalInicial ? [
            new Paragraph({
              keepNext: true, spacing: { after: px(10) },
              children: [
                new TextRun({ text: 'Evaluación inicial', font: SERIF, size: SZ.h2, color: INK, characterSpacing: track(0.005, 13) }),
                new TextRun({ text: `   ${dmy(m.evalInicial.fecha)} · EVA ${m.evalInicial.pb != null ? m.evalInicial.pb : '—'}/10`, font: SANS, size: SZ.etqMetrica, allCaps: true, color: ETIQUETA, characterSpacing: track(0.06, 8.5) }),
              ],
            }),
            ...((m.evalInicial.partes || []).length
              ? m.evalInicial.partes.map(x => new Paragraph({ style: 'Cuerpo', indent: { right: IND_EVAL }, text: x }))
              : [new Paragraph({ style: 'Cuerpo', indent: { right: IND_EVAL }, children: [new TextRun({ text: 'Sin detalle registrado', size: SZ.cuerpo, color: VACIO })] })]),
            new Paragraph({ text: '', spacing: { after: px(20) } }),
          ] : []),

          // ── Detalle por sesión — tabla sin bordes, filas pares con fondo F6F4EF, cantSplit ──
          new Paragraph({ style: 'H2', text: 'Detalle por sesión' }),
          ...(ses.length ? [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [690, CONTENT_W - 690 - 1440, 1440],
            borders: bordesInvisibles,
            rows: ses.map((s, i) => filaSesion(s, i, CONTENT_W - 690 - 1440)),
          })] : [new Paragraph({ style: 'Cuerpo', children: [new TextRun({ text: 'Sin sesiones de tratamiento registradas.', color: VACIO })] })]),

          // ── Firma ──
          new Paragraph({
            keepNext: true, spacing: { before: px(18), after: px(6) },
            indent: { right: IND_FIRMA },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: SESION_NUM, space: 1 } },
            children: [],
          }),
          new Paragraph({ style: 'FirmaNombre', keepNext: true, indent: { right: IND_FIRMA }, text: m.firmante || '—' }),
          new Paragraph({ style: 'FirmaRol', indent: { right: IND_FIRMA }, text: 'Fisioterapeuta · Rehactiva' }),
        ],
      }],
    });

    // ── Helpers de tabla/celda ──

    // Fila de "Datos del paciente": 3 celdas, etiqueta (allCaps ETIQUETA) encima del valor (INK o
    // VACIO si el campo no tiene dato). gap CSS 22px/32px → spacingAfter en la fila + margen derecho
    // entre columnas.
    function datosTabla(campos, spacingAfter = 0) {
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: bordesInvisibles,
        rows: [new TableRow({ children: campos.map((c, i) => new TableCell({
          width: { size: 33.34, type: WidthType.PERCENTAGE },
          borders: bordesInvisibles,
          margins: { top: 0, bottom: spacingAfter, left: 0, right: i < campos.length - 1 ? px(32) : 0 },
          children: [
            new Paragraph({ style: 'EtiquetaDato', text: c.etiqueta }),
            new Paragraph({ style: 'ValorDato', children: [new TextRun({ text: c.texto, size: SZ.valorDato, color: c.vacio ? VACIO : INK })] }),
          ],
        })) })],
      });
    }

    // Celda del panel de métricas: cifra grande (partes con distinto tamaño/color) + etiqueta chica
    // debajo. `first`/`last` ajustan el margen exterior (padding del panel, 26px) vs el margen
    // interior entre columnas (gap 34px repartido a medias, 17px por lado).
    function panelCelda(partes, etiqueta, first = false, last = false) {
      return new TableCell({
        width: { size: 33.34, type: WidthType.PERCENTAGE },
        borders: bordesInvisibles, shading: { fill: PANEL_BG },
        margins: { top: px(22), bottom: px(22), left: first ? px(26) : px(17), right: last ? px(26) : px(17) },
        children: [
          new Paragraph({ children: partes.map(p => new TextRun({ text: p.t, font: SERIF, size: p.sm ? SZ.cifraPanelSec : SZ.cifraPanel, color: p.c })) }),
          new Paragraph({ style: 'EtiquetaMetrica', text: etiqueta }),
        ],
      });
    }

    // Fila de "Detalle por sesión": número con cero inicial / metadato+observación / EVA
    // antes→después. Filas pares (n° de sesión par) con fondo F6F4EF — sustituye por completo las
    // líneas divisorias de la versión anterior.
    function filaSesion(s, i, colMedioW) {
      const n = i + 1;
      const par = n % 2 === 0;
      const shading = par ? { fill: PANEL_BG } : undefined;
      const meta = [dmy(s.fecha), s.terapeuta || null, s.tecnicas ? s.tecnicas.toLowerCase() : null].filter(Boolean).join(' · ');
      const evaTxt = s.pb != null ? `${s.pb} → ${s.pa != null ? s.pa : '?'}` : '—';
      return new TableRow({ cantSplit: true, children: [
        new TableCell({
          width: { size: 690, type: WidthType.DXA }, borders: bordesInvisibles, shading,
          margins: { top: px(18), bottom: px(18), left: 0, right: 0 },
          children: [new Paragraph({ style: 'NumSesion', text: String(n).padStart(2, '0') })],
        }),
        new TableCell({
          width: { size: colMedioW, type: WidthType.DXA }, borders: bordesInvisibles, shading,
          margins: { top: px(18), bottom: px(18), left: px(10), right: px(10) },
          children: [
            new Paragraph({ style: 'MetadatoSesion', text: meta }),
            s.obs
              ? new Paragraph({ style: 'ObsSesion', text: s.obs })
              : new Paragraph({ style: 'ObsSesionVacia', text: 'Sin observación registrada' }),
          ],
        }),
        new TableCell({
          width: { size: 1440, type: WidthType.DXA }, borders: bordesInvisibles, shading,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: px(18), bottom: px(18), left: 0, right: 0 },
          children: [new Paragraph({ style: s.pb != null ? 'EvaSesion' : undefined, alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: evaTxt, font: s.pb != null ? SERIF : SANS, size: s.pb != null ? SZ.h2 : SZ.cuerpo, color: s.pb != null ? ACENTO : VACIO })] })],
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
