// ── SPIKE de exportación a Word (.docx) ──────────────────────────────────────
// VALIDACIÓN, no producción: esto NO reemplaza nada del pipeline de PDF (informes.js sigue
// intacto). El objetivo es probar en el navegador real las cuatro cosas que un informe clínico
// necesita y que hoy solo sabemos hacer en HTML→imprimir:
//   1. membrete con el logo (LOGO_DATA_URI → ImageRun) repetido en cada página,
//   2. tipografía y espaciado entre secciones controlados desde el documento,
//   3. tabla con bordes finos,
//   4. el gráfico EVA, que en el PDF es SVG inline, metido como imagen (SVG→canvas→PNG→ImageRun).
// Márgenes de página: 2.5 cm por lado.
//
// La librería (docx v9) se carga por IMPORT DINÁMICO: pesa ~1 MB sin comprimir y no puede entrar
// al bundle inicial — solo la baja quien pulsa el botón. Ver el reporte del spike para las cifras.
import { LOGO_DATA_URI } from './pdf-logo.js';
import { toastOk, toastErr, toastInfo } from './toast.js';

// Data URI (base64) → Uint8Array. ImageRun no acepta el string 'data:...' con cabecera: quiere los
// bytes. atob es suficiente acá porque las dos imágenes son nuestras y ya vienen en base64.
function dataUriToBytes(uri) {
  const b64 = String(uri || '').split(',')[1] || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// SVG (string) → PNG (data URI), pasando por <img> + canvas.
// El SVG va por blob URL, no por data URI: en un data:image/svg+xml los caracteres no-ASCII
// (tildes, '·') obligan a encodear a mano y Safari es quisquilloso. Un blob del mismo origen NO
// contamina el canvas, así que toDataURL sigue funcionando.
// El escalado (scale 2) es para que la imagen no se vea pixelada al imprimir el .docx.
function svgToPngDataUri(svg, w, h, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = w * scale; c.height = h * scale;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // sin fondo, el PNG sale transparente
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El SVG no se pudo rasterizar')); };
    img.src = url;
  });
}

// Gráfico EVA de prueba con la misma pinta que el del PDF (_buildEvaSvg en informes.js), pero con
// datos fijos: acá se valida el CAMINO SVG→PNG, no la serie. width/height explícitos y sin CSS
// externo, que es lo que <img> necesita para rasterizar un SVG.
function evaSvgDemo() {
  const pts = [[0, 8], [1, 7], [2, 6], [3, 6], [4, 4], [5, 3], [6, 2]];
  const L = 34, R = 700, T = 20, B = 190;
  const y = v => B - (v / 10) * (B - T);
  const x = i => 64 + i * (670 - 64) / (pts.length - 1);
  let g = '';
  [0, 2, 4, 6, 8, 10].forEach(v => {
    g += `<line x1="${L}" y1="${y(v)}" x2="${R}" y2="${y(v)}" stroke="#EAEAE4" stroke-width="1"/>`
       + `<text x="${L - 8}" y="${y(v) + 3}" text-anchor="end" font-size="8" fill="#6B6B66">${v}</text>`;
  });
  [3, 6].forEach(v => { g += `<line x1="${L}" y1="${y(v)}" x2="${R}" y2="${y(v)}" stroke="#B8B8B0" stroke-width="1" stroke-dasharray="4 3"/>`; });
  [[1.5, 'leve'], [4.5, 'moderado'], [8, 'severo']].forEach(z => {
    g += `<text x="${R + 8}" y="${y(z[0]) + 3}" font-size="8" fill="#6B6B66">${z[1]}</text>`;
  });
  g += `<polyline points="${pts.map(p => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="#155B7A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach(p => {
    const px = x(p[0]).toFixed(1);
    g += `<circle cx="${px}" cy="${y(p[1]).toFixed(1)}" r="3.5" fill="#155B7A"/>`
       + `<text x="${px}" y="${(y(p[1]) - 8).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="bold" fill="#1A1A1A">${p[1]}</text>`
       + `<text x="${px}" y="204" text-anchor="middle" font-size="8" fill="#6B6B66">${p[0] === 0 ? 'Eval. inicial' : 'Sesión ' + p[0]}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="240" viewBox="0 0 760 240" `
       + `font-family="Arial,Helvetica,sans-serif"><rect width="760" height="240" fill="#fff"/>${g}</svg>`;
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

export async function wordTest() {
  try {
    toastInfo('Generando .docx de prueba…');
    // Import DINÁMICO: Vite parte docx a su propio chunk y no entra al bundle inicial.
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header,
      Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
      convertMillimetersToTwip,
    } = await import('docx');

    const evaPng = await svgToPngDataUri(evaSvgDemo(), 760, 240);

    // Bordes finos: `size` va en OCTAVOS de punto → 4 = 0.5 pt. `space` en puntos.
    const fino = { style: BorderStyle.SINGLE, size: 4, color: 'C9C9C2' };
    const bordes = { top: fino, bottom: fino, left: fino, right: fino };
    const celda = (txt, { bold = false, fill = null } = {}) => new TableCell({
      borders: bordes,
      shading: fill ? { fill } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },   // twips
      children: [new Paragraph({ children: [new TextRun({ text: txt, bold, size: 18, font: 'Calibri' })] })],
    });

    const doc = new Document({
      // Estilos del documento: lo que en el PDF es CSS, acá se declara una vez y lo respeta Word.
      // `size` va en MEDIOS puntos (22 = 11 pt) y `spacing` en twips (20 twips = 1 pt).
      styles: {
        default: { document: { run: { font: 'Calibri', size: 22, color: '1A1A1A' } } },
        paragraphStyles: [
          { id: 'TituloDoc', name: 'Titulo Doc', basedOn: 'Normal', quickFormat: true,
            run: { size: 32, bold: true, color: '155B7A' },
            paragraph: { spacing: { before: 240, after: 120 } } },
          { id: 'SecTitulo', name: 'Seccion Titulo', basedOn: 'Normal', quickFormat: true,
            run: { size: 22, bold: true, allCaps: true, color: '155B7A' },
            paragraph: { spacing: { before: 360, after: 100 } } },
          { id: 'Cuerpo', name: 'Cuerpo', basedOn: 'Normal', quickFormat: true,
            run: { size: 22 },
            paragraph: { spacing: { after: 160, line: 300 }, alignment: AlignmentType.JUSTIFIED } },
        ],
      },
      sections: [{
        properties: { page: { margin: {
          top: convertMillimetersToTwip(25), bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(25), right: convertMillimetersToTwip(25),
        } } },
        // Membrete: va en el HEADER de la sección, así se repite solo en cada página (en el PDF
        // hay que reproducirlo a mano con @page).
        headers: { default: new Header({ children: [
          new Paragraph({ children: [new ImageRun({
            type: 'png', data: dataUriToBytes(LOGO_DATA_URI),
            transformation: { width: 150, height: 43 },   // px; el logo es 562×160
          })] }),
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '155B7A', space: 6 } },
            spacing: { after: 240 },
            children: [new TextRun({ text: 'Rehactiva · Centro de Fisioterapia y Rehabilitación · Tumbaco, Quito', size: 15, color: '6B6B66' })],
          }),
        ] }) },
        children: [
          new Paragraph({ text: 'Informe de prueba — spike Word', style: 'TituloDoc' }),
          new Paragraph({ style: 'Cuerpo', children: [new TextRun(
            'Este documento se generó desde el navegador con la librería docx, sin servidor y sin pasar '
            + 'por el diálogo de impresión. Sirve para verificar tres cosas: que el membrete con el logo se '
            + 'repite en cada página, que los estilos y el espaciado entre secciones se respetan al abrirlo, '
            + 'y que las imágenes y tablas sobreviven el viaje a Word y a Google Docs.')] }),
          new Paragraph({ style: 'Cuerpo', children: [
            new TextRun('Segundo párrafo con formato mixto: '),
            new TextRun({ text: 'negrita', bold: true }),
            new TextRun(', '),
            new TextRun({ text: 'cursiva', italics: true }),
            new TextRun(', '),
            new TextRun({ text: 'subrayado', underline: {} }),
            new TextRun(' y un acento clínico en color. Los márgenes de página son de 2,5 cm por lado.'),
          ] }),

          new Paragraph({ text: 'Datos del paciente', style: 'SecTitulo' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: bordes,
            rows: [
              new TableRow({ tableHeader: true, children: [
                celda('Campo', { bold: true, fill: 'F2F2EE' }), celda('Valor', { bold: true, fill: 'F2F2EE' }),
              ] }),
              new TableRow({ children: [celda('Nombre'), celda('Paciente de Prueba')] }),
              new TableRow({ children: [celda('Diagnóstico'), celda('Lumbalgia mecánica (M54.5)')] }),
              new TableRow({ children: [celda('Sesiones'), celda('6 de 12')] }),
              new TableRow({ children: [celda('Terapeuta'), celda('—')] }),
            ],
          }),

          new Paragraph({ text: 'Evolución del dolor (EVA)', style: 'SecTitulo' }),
          new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({
            type: 'png', data: dataUriToBytes(evaPng),
            transformation: { width: 600, height: 189 },   // 760×240 escalado al ancho útil
          })] }),
          new Paragraph({ children: [new TextRun({
            text: 'Gráfico generado como SVG y rasterizado a PNG en el navegador (canvas 2×).',
            size: 16, italics: true, color: '6B6B66' })] }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    descargar(blob, 'rehactiva-word-test.docx');
    toastOk(`✓ .docx generado (${Math.round(blob.size / 1024)} KB)`);
  } catch (e) {
    console.error('[word spike]', e);
    toastErr('Falló la generación del .docx: ' + (e?.message || e));
  }
}
