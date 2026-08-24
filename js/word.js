// ── Exportación de informes a Word (.docx) ──────────────────────────────────
// Segundo canal de exportación del informe de paciente, junto al PDF (buildPdfHtml en
// informes.js, que sigue intacto para el histórico). Recibe el MISMO render-model que el PDF
// (_buildRenderModel en informes.js) más el campo `firmante`, que se pide en el modal de firmante
// antes de llamar acá (abrirFirmanteModal/confirmarExportarWord en informes.js).
//
// Estilo: addendum de estilo del informe — Arial en todo el documento, tinta en escala de grises
// (1A1A1A cuerpo, 595959 etiquetas/meta, 8C8C8C pie/sublabels, D9D9D9 filetes), CERO texto de
// color. El único color del documento vive en el PNG del logo y el PNG del gráfico EVA. Tablas sin
// bordes verticales ni los 4 lados; "Datos del paciente" y "Resumen" van totalmente sin bordes.
// Membrete y pie van en el HEADER/FOOTER de sección de Word, así se repiten por página solos.
//
// La librería (docx v9) se carga por IMPORT DINÁMICO: pesa ~1 MB sin comprimir y no puede entrar
// al bundle inicial — solo la baja quien exporta un informe a Word.
import { LOGO_DATA_URI } from './pdf-logo.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { dmy, CONFIG_CLINICA, buildEvaSvg } from './utils.js';

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

// Genera y descarga el .docx del informe a partir del render-model (mismo shape que consume
// buildPdfHtml, más `firmante`). No toca state/_rptCtx/DOM — recibe todo lo que necesita en `m`.
export async function generarInformeWord(m) {
  try {
    toastInfo('Generando .docx…');
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
      Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
      convertMillimetersToTwip,
    } = await import('docx');

    // ── Tokens del addendum de estilo ──
    const INK = '1A1A1A';       // cuerpo
    const META = '595959';      // etiquetas y meta
    const SUB = '8C8C8C';       // pie y sublabels
    const FILETE = 'D9D9D9';    // bordes finos

    // `size` de un Run va en MEDIOS PUNTO (size = pt × 2). `space` de un borde va en puntos.
    const filete = { style: BorderStyle.SINGLE, size: 4, color: FILETE };
    const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    // Regla general de tabla: solo filetes horizontales, nunca verticales ni los 4 lados.
    const bordesTabla = { top: filete, bottom: filete, insideHorizontal: filete, left: sinBorde, right: sinBorde, insideVertical: sinBorde };
    const bordesInvisibles = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde, insideHorizontal: sinBorde, insideVertical: sinBorde };

    // ── Datos derivados del modelo (misma lógica que buildPdfHtml en informes.js) ──
    const met = m.metricas || {};
    const ses = m.sesiones || [];
    const narr = m.narrativa;
    // Período: evaluación inicial (o primera sesión) → última sesión; sin sesiones, la fecha de emisión.
    const periodo = ses.length
      ? dmy((m.evalInicial && m.evalInicial.fecha) || ses[0].fecha) + ' – ' + dmy(ses[ses.length - 1].fecha)
      : m.fechaLarga;
    // Todo campo vacío (o "Sin edad") se muestra como '—'.
    const val = v => { const t = v == null ? '' : String(v).trim(); return t && t !== 'Sin edad' ? t : '—'; };
    const evaVal = met.evaHas
      ? String(met.evaInicial) + ' → ' + (met.evaActual != null ? String(met.evaActual) : '?')
      : '—';

    // Gráfico EVA: mismo camino SVG→PNG que el PDF a inline SVG, acá rasterizado porque un .docx
    // no acepta SVG. Si no hay serie construible, cae al PNG ya capturado del canvas en pantalla
    // (snapshots viejos); si tampoco hay eso, se omite la sección entera.
    const evaSvg = buildEvaSvg(m);
    let evaPng = null;
    if (evaSvg) evaPng = await svgToPngDataUri(evaSvg, 760, 240);
    else if (m.evaChartImg) evaPng = m.evaChartImg;

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 22, color: INK } } },
        paragraphStyles: [
          // título membrete: 14pt bold, mayúsculas, alineado derecha
          { id: 'MembreteTitulo', name: 'Membrete Titulo', basedOn: 'Normal', quickFormat: true,
            run: { size: 28, bold: true, allCaps: true, color: INK },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { after: 40 } } },
          // meta membrete: 8pt gris, alineado derecha
          { id: 'MembreteMeta', name: 'Membrete Meta', basedOn: 'Normal', quickFormat: true,
            run: { size: 16, color: META },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { after: 0 } } },
          // sección: 9pt bold mayúsculas + tracking, filete inferior D9D9D9
          { id: 'Seccion', name: 'Seccion', basedOn: 'Normal', quickFormat: true,
            run: { size: 18, bold: true, allCaps: true, color: INK, characterSpacing: 12 },
            paragraph: { spacing: { before: 360, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE, space: 4 } } } },
          // cuerpo: 11pt, LEFT (nunca JUSTIFIED — Word no silabea en español)
          { id: 'Cuerpo', name: 'Cuerpo', basedOn: 'Normal', quickFormat: true,
            run: { size: 22, color: INK },
            paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 160, line: 276, lineRule: 'auto' } } },
          // muted: variante gris de Cuerpo, para texto secundario (observación/técnicas vacíos, notas)
          { id: 'CuerpoMuted', name: 'Cuerpo Muted', basedOn: 'Cuerpo', quickFormat: true,
            run: { color: META } },
          // subtítulo bold: 11pt bold, sin mayúsculas (narrativa IA y evaluación inicial)
          { id: 'Subtitulo', name: 'Subtitulo', basedOn: 'Normal', quickFormat: true,
            run: { size: 22, bold: true, color: INK },
            paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 120, after: 80, line: 276, lineRule: 'auto' } } },
          // etiqueta de campo: 7pt mayúsculas gris
          { id: 'EtiquetaCampo', name: 'Etiqueta Campo', basedOn: 'Normal', quickFormat: true,
            run: { size: 14, allCaps: true, color: META },
            paragraph: { spacing: { after: 20 } } },
          // valor de campo: 11pt tinta normal
          { id: 'ValorCampo', name: 'Valor Campo', basedOn: 'Normal', quickFormat: true,
            run: { size: 22, color: INK },
            paragraph: { spacing: { after: 0 } } },
          // cifra del resumen: 18pt bold
          { id: 'CifraResumen', name: 'Cifra Resumen', basedOn: 'Normal', quickFormat: true,
            run: { size: 36, bold: true, color: INK },
            paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 20, after: 20 } } },
          // sublabel del resumen: 8pt gris
          { id: 'SublabelResumen', name: 'Sublabel Resumen', basedOn: 'Normal', quickFormat: true,
            run: { size: 16, color: SUB },
            paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 0 } } },
          // celda de tabla: 9pt
          { id: 'CeldaTabla', name: 'Celda Tabla', basedOn: 'Normal', quickFormat: true,
            run: { size: 18, color: INK },
            paragraph: { spacing: { after: 0 } } },
          // celda de tabla, variante muted (técnicas/observación)
          { id: 'CeldaTablaMuted', name: 'Celda Tabla Muted', basedOn: 'CeldaTabla', quickFormat: true,
            run: { color: META } },
          // cabecera de tabla: 7pt mayúsculas gris, sin relleno
          { id: 'CabeceraTabla', name: 'Cabecera Tabla', basedOn: 'Normal', quickFormat: true,
            run: { size: 14, allCaps: true, color: META },
            paragraph: { spacing: { after: 0 } } },
          // pie: 6.5pt gris
          { id: 'Pie', name: 'Pie', basedOn: 'Normal', quickFormat: true,
            run: { size: 13, color: SUB },
            paragraph: { spacing: { after: 0 } } },
        ],
      },
      sections: [{
        properties: { page: { margin: {
          top: convertMillimetersToTwip(25), bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(25), right: convertMillimetersToTwip(25),
        } } },

        // Membrete: logo a la izquierda, título+meta a la derecha, en el HEADER de sección — se
        // repite solo en cada página (en el PDF hay que reproducirlo a mano con @page).
        headers: { default: new Header({ children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordesInvisibles,
            rows: [new TableRow({ children: [
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                borders: bordesInvisibles,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [new Paragraph({ children: [new ImageRun({
                  type: 'png', data: dataUriToBytes(LOGO_DATA_URI),
                  transformation: { width: 130, height: 37 },   // px; el logo es 562×160
                })] })],
              }),
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                borders: bordesInvisibles,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({ text: 'Informe de evolución', style: 'MembreteTitulo' }),
                  new Paragraph({ text: `N.º ${m.numero || '—'} · ${m.fechaLarga || ''}`, style: 'MembreteMeta' }),
                  new Paragraph({ text: `Período del informe: ${periodo}`, style: 'MembreteMeta' }),
                ],
              }),
            ] })],
          }),
          new Paragraph({ text: '', spacing: { before: 60, after: 0 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE, space: 4 } } }),
        ] }) },

        // Pie: filete superior + una línea 6.5pt gris, en el FOOTER de sección — se repite por página.
        footers: { default: new Footer({ children: [
          new Paragraph({ text: '', spacing: { after: 60 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: FILETE, space: 4 } } }),
          new Paragraph({ text: clinicaPie(), style: 'Pie' }),
        ] }) },

        children: [
          new Paragraph({ text: 'Datos del paciente', style: 'Seccion' }),
          // Etiqueta ENCIMA del valor, no etiqueta|valor en columnas. Fila 1 de 4 columnas, fila 2
          // de 3 — no requiere que las dos filas compartan la misma grilla de columnas.
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordesInvisibles,
            rows: [
              new TableRow({ children: [
                campoCelda('Nombre', val(m.paciente.nombre), 25, bordesInvisibles),
                campoCelda('Cédula', val(m.paciente.cedula), 25, bordesInvisibles),
                campoCelda('Edad', val(m.paciente.edad), 25, bordesInvisibles),
                campoCelda('Diagnóstico', val(m.paciente.diagnostico), 25, bordesInvisibles),
              ] }),
              new TableRow({ children: [
                campoCelda('Terapeuta', val(m.terapeuta), 34, bordesInvisibles),
                campoCelda('Doctor referente', val(m.doctor), 33, bordesInvisibles),
                campoCelda('Inicio de tratamiento', m.inicio ? dmy(m.inicio) : '—', 33, bordesInvisibles),
              ] }),
            ],
          }),

          new Paragraph({ text: 'Resumen de evolución', style: 'Seccion' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordesInvisibles,
            rows: [new TableRow({ children: [
              resumenCelda('Sesiones', `${met.done ?? 0} de ${met.sessions ?? 0}`, `${met.pct ?? 0}% del plan`, bordesInvisibles),
              resumenCelda('Continuidad', `${met.adh ?? 0}%`, `${met.asistidas ?? 0}/${met.totalCitas ?? 0} citas asistidas`, bordesInvisibles),
              resumenCelda('Dolor EVA', evaVal, met.evaHas ? 'inicial → actual' : 'sin datos registrados', bordesInvisibles),
            ] })],
          }),

          ...(evaPng ? [
            new Paragraph({ text: 'Evolución del dolor (EVA)', style: 'Seccion' }),
            new Paragraph({ spacing: { after: 60 }, children: [new ImageRun({
              type: 'png', data: dataUriToBytes(evaPng),
              transformation: { width: 600, height: 189 },   // 760×240 escalado al ancho útil
            })] }),
          ] : []),

          ...(narr && narr.length ? [
            new Paragraph({ text: 'Narrativa clínica', style: 'Seccion' }),
            ...narr.flatMap(s => [
              new Paragraph({ text: s.title, style: 'Subtitulo' }),
              ...String(s.body || '').split('\n').filter(Boolean).map(linea =>
                new Paragraph({ style: 'Cuerpo', children: [new TextRun(linea)] })),
            ]),
          ] : []),

          ...(m.evalInicial ? [
            new Paragraph({ text: 'Evaluación inicial', style: 'Seccion' }),
            new Paragraph({ text: `${dmy(m.evalInicial.fecha)} · EVA ${m.evalInicial.pb != null ? m.evalInicial.pb : '—'}/10`, style: 'Subtitulo' }),
            ...((m.evalInicial.partes || []).length
              ? m.evalInicial.partes.map(x => new Paragraph({ style: 'Cuerpo', children: [new TextRun(x)] }))
              : [new Paragraph({ style: 'CuerpoMuted', children: [new TextRun('Sin detalle registrado')] })]),
          ] : []),

          new Paragraph({ text: `Detalle por sesión (${ses.length})`, style: 'Seccion' }),
          ...(ses.length ? [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordesTabla,
            rows: [
              new TableRow({ tableHeader: true, children: [
                cabeceraCelda('Fecha', 14, bordesTabla), cabeceraCelda('Terapeuta', 20, bordesTabla),
                cabeceraCelda('EVA (antes→después)', 14, bordesTabla),
                cabeceraCelda('Técnicas', 24, bordesTabla), cabeceraCelda('Observación', 28, bordesTabla),
              ] }),
              ...ses.map(s => new TableRow({ cantSplit: true, children: [
                celdaTabla(dmy(s.fecha), bordesTabla),
                celdaTabla(s.terapeuta || '—', bordesTabla),
                celdaTabla(s.pb != null ? `${s.pb} → ${s.pa != null ? s.pa : '?'}` : '—', bordesTabla),
                celdaTabla(s.tecnicas || '—', bordesTabla, true),
                celdaTabla(s.obs || '—', bordesTabla, true),
              ] })),
            ],
          })] : [new Paragraph({ style: 'CuerpoMuted', children: [new TextRun('Sin sesiones de tratamiento registradas.')] })]),

          // Firma: línea = párrafo vacío con filete inferior (no guiones bajos, no imagen), ~6 cm
          // de ancho (indent derecho = ancho útil − 6 cm). keepNext en línea y nombre para que no
          // se separen entre páginas.
          new Paragraph({ text: 'Firma', style: 'Seccion' }),
          new Paragraph({
            keepNext: true,
            indent: { right: convertMillimetersToTwip(100) },   // 160mm útiles (A4 − 2×25mm) − 60mm = línea de 6cm
            spacing: { before: 480, after: 40 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE, space: 1 } },
            children: [],
          }),
          new Paragraph({
            keepNext: true,
            indent: { right: convertMillimetersToTwip(100) },
            children: [new TextRun({ text: m.firmante || '—', size: 22, color: INK })],
          }),
          new Paragraph({
            indent: { right: convertMillimetersToTwip(100) },
            children: [new TextRun({ text: 'Fisioterapeuta', size: 18, color: META })],
          }),
        ],
      }],
    });

    // ── Helpers de tabla (usan los estilos declarados arriba) ──
    function campoCelda(etiqueta, valor, anchoPct, bordes) {
      return new TableCell({
        width: { size: anchoPct, type: WidthType.PERCENTAGE },
        borders: bordes,
        margins: { top: 60, bottom: 60, left: 0, right: 180 },
        children: [
          new Paragraph({ text: etiqueta, style: 'EtiquetaCampo' }),
          new Paragraph({ text: valor, style: 'ValorCampo' }),
        ],
      });
    }
    function resumenCelda(etiqueta, cifra, sublabel, bordes) {
      return new TableCell({
        width: { size: 34, type: WidthType.PERCENTAGE },
        borders: bordes,
        margins: { top: 60, bottom: 60, left: 0, right: 0 },
        children: [
          new Paragraph({ text: etiqueta, style: 'EtiquetaCampo', alignment: AlignmentType.CENTER }),
          new Paragraph({ text: cifra, style: 'CifraResumen' }),
          new Paragraph({ text: sublabel, style: 'SublabelResumen' }),
        ],
      });
    }
    function cabeceraCelda(texto, anchoPct, bordes) {
      return new TableCell({
        width: { size: anchoPct, type: WidthType.PERCENTAGE },
        borders: bordes,
        margins: { top: 80, bottom: 80, left: 90, right: 90 },
        children: [new Paragraph({ text: texto, style: 'CabeceraTabla' })],
      });
    }
    function celdaTabla(texto, bordes, muted = false) {
      return new TableCell({
        borders: bordes,
        margins: { top: 80, bottom: 80, left: 90, right: 90 },
        children: [new Paragraph({ text: texto, style: muted ? 'CeldaTablaMuted' : 'CeldaTabla' })],
      });
    }
    function clinicaPie() {
      return ['Rehactiva', 'Centro de rehabilitación y fisioterapia', 'Quito, Ecuador',
        CONFIG_CLINICA.DIRECCION, CONFIG_CLINICA.TELEFONO ? 'Tel. ' + CONFIG_CLINICA.TELEFONO : '', CONFIG_CLINICA.EMAIL]
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
