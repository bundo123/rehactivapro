// ── Exportación de informes a Word (.docx) ──────────────────────────────────
// INF-UNI: el Word es una COPIA EDITABLE del PDF (buildPdfHtml en informe-doc.js), con el mismo
// contenido, el mismo orden y el mismo lenguaje visual: Arial, tinta negra 1A1A1A, etiquetas en gris
// 6B6B66, filetes finos y tablas compactas — sin cajas tintadas ni colores semáforo. Antes tenía un
// diseño propio (el de newdesign/…VERSION-FINAL.docx, serif y paneles sombreados) y el médico
// recibía dos documentos distintos según el botón. El pie lo dice: «Copia editable · el documento
// oficial es el PDF».
//
// Recibe el MISMO render-model que el PDF (_buildRenderModel en informes.js), con firmante y pedido
// ya elegidos en el modal del firmante. Orden (INF-2, compartido con el PDF vía seccionesInforme en
// informe-doc.js): encabezado · 1. Datos del paciente · 2. Resumen para el médico · 3. Evolución del
// dolor · 4. Evaluación inicial y goniometría · 5. Narrativa · 6. Detalle por sesión · firma. En
// cada página: «CONFIDENCIAL · Historia clínica» + N.º arriba y el pie legal abajo.
//
// La librería (docx v9) se carga por IMPORT DINÁMICO: pesa ~1 MB sin comprimir y no puede entrar
// al bundle inicial — solo la baja quien exporta un informe a Word.
import { LOGO_DATA_URI } from './pdf-logo.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { dmy, limpiarParte, textoPeriodoRango, buildEvaSvg, pieLegal, tipoCorto, nombreArchivoInforme } from './utils.js';
import { romGrupos } from './rom.js';
import { periodoInforme } from './resumen-medico.js';
import { filasDatosPaciente, renglonesDatosPaciente, seccionesInforme, resumenDelModelo } from './informe-doc.js';

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

// Genera y descarga el .docx del informe a partir del render-model. No toca state/_rptCtx/DOM.
export async function generarInformeWord(m) {
  try {
    toastInfo('Generando .docx…');
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
      Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign, HeightRule,
    } = await import('docx');

    // ── Tokens: los del PDF (buildPdfHtml) ──
    const INK = '1A1A1A', MUT = '6B6B66', REGLA = 'D8D8D2', FILA = 'EAEAE4', RESERVA = '9A9A94';
    const NARANJA = 'F09028', CELESTE = '28A8C8';
    const SANS = 'Arial';
    // Tamaños en medios puntos (px del PDF × 0,75 × 2).
    const SZ = { cuerpo: 18, chico: 16, tabla: 15, etiqueta: 14, h2: 17, titulo: 24, mini: 12 };

    const PAGE_W = 12240, PAGE_H = 15840;   // carta
    const MARGIN = { top: 1300, bottom: 1150, left: 850, right: 850, header: 500, footer: 450, gutter: 0 };
    const ANCHO = PAGE_W - MARGIN.left - MARGIN.right;   // 10540

    const nada = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const sinBordes = { top: nada, bottom: nada, left: nada, right: nada, insideHorizontal: nada, insideVertical: nada };
    const linea = (color, size = 4) => ({ style: BorderStyle.SINGLE, size, color });

    const ses = m.sesiones || [];
    const narr = m.narrativa;
    const gonio = m.evalInicial ? romGrupos(m.evalInicial.rom) : [];
    const rm = resumenDelModelo(m);
    const periodo = m.rango ? textoPeriodoRango(m.rango) : `Período del informe: ${periodoInforme(m) || m.fechaLarga || ''}`;

    const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: SANS, size: o.size || SZ.cuerpo, color: o.color || INK, bold: o.bold, allCaps: o.caps, characterSpacing: o.caps ? 16 : undefined, italics: o.italics });
    const par = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align,
      spacing: { before: o.before ?? 0, after: o.after ?? 60, line: o.line ?? 260, lineRule: 'auto' }, keepNext: o.keepNext, keepLines: o.keepLines, border: o.border, indent: o.indent });
    const h2 = text => par(run(text, { size: SZ.h2, bold: true, caps: true }), { before: 340, after: 140, keepNext: true, border: { bottom: { ...linea(REGLA), space: 4 } } });
    const celda = (children, w, o = {}) => new TableCell({
      width: { size: w, type: WidthType.DXA }, columnSpan: o.span, verticalAlign: o.vAlign || VerticalAlign.TOP,
      borders: { top: o.top || nada, bottom: o.bottom || nada, left: nada, right: nada },
      shading: o.fill ? { fill: o.fill } : undefined,
      margins: { top: o.mt ?? 70, bottom: o.mb ?? 70, left: o.ml ?? 0, right: o.mr ?? 120 },
      children: Array.isArray(children) ? children : [children],
    });
    const tabla = (anchos, rows) => new Table({ width: { size: anchos.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: anchos, borders: sinBordes, rows });

    // ── Gráfico EVA: el MISMO SVG del PDF (buildEvaSvg, 760×240), rasterizado; si no hay serie, la
    // imagen del canvas que traen los snapshots viejos.
    const evaSvg = buildEvaSvg(m);
    let evaPng = null, evaW = 640, evaH = 202;
    if (evaSvg) evaPng = await svgToPngDataUri(evaSvg, 760, 240, 2);
    else if (m.evaChartImg) { evaPng = m.evaChartImg; evaH = 190; }

    const body = [];

    // ── Encabezado de la primera página: logo + título, N.º, fecha y período ──
    body.push(tabla([5270, 5270], [new TableRow({ cantSplit: true, children: [
      celda(par(new ImageRun({ type: 'png', data: dataUriToBytes(LOGO_DATA_URI), transformation: { width: 155, height: 44 } }), { after: 0 }), 5270, { mt: 0 }),
      celda([
        par(run('Informe de evolución', { size: SZ.titulo, bold: true, caps: true }), { align: AlignmentType.RIGHT, after: 40 }),
        par(run(`N.º ${m.numero || ''} · ${m.fechaLarga || ''}`, { size: SZ.chico, color: MUT }), { align: AlignmentType.RIGHT, after: 20 }),
        par(run(periodo, { size: SZ.chico, color: MUT }), { align: AlignmentType.RIGHT, after: 0 }),
      ], 5270, { mt: 0, mr: 0 }),
    ] })]));
    // Filete naranja + celeste (el .rule del PDF)
    body.push(tabla([1000, ANCHO - 1000], [new TableRow({ height: { value: 50, rule: HeightRule.EXACT }, children: [
      celda(par(run('', { size: 2 }), { after: 0, line: 40 }), 1000, { fill: NARANJA, mt: 0, mb: 0, mr: 0 }),
      celda(par(run('', { size: 2 }), { after: 0, line: 40 }), ANCHO - 1000, { fill: CELESTE, mt: 0, mb: 0, mr: 0 }),
    ] })]));

    // ── Secciones en el orden y con el número de seccionesInforme (informe-doc.js), el MISMO que
    // usa el PDF: 1. Datos del paciente · 2. Resumen para el médico · 3. Evolución del dolor ·
    // 4. Evaluación inicial · 5. Narrativa clínica · 6. Detalle por sesión. Luego la firma.
    const MITAD = Math.floor(ANCHO / 2);
    const fichaPar = f => par([run(f.k + ': ', { size: SZ.chico, bold: true }), run(f.v, { size: SZ.chico })], { after: 0 });
    const constructores = {
      // Ficha de dos columnas sin bordes: etiqueta en negrita y valor en la misma línea.
      paciente: () => [tabla([MITAD, ANCHO - MITAD], renglonesDatosPaciente(filasDatosPaciente(m)).map(r => new TableRow({ cantSplit: true,
        children: r.length === 1 && r[0].ancho
          ? [celda(fichaPar(r[0]), ANCHO, { span: 2, mt: 30, mb: 30, mr: 0 })]
          : [celda(fichaPar(r[0]), MITAD, { mt: 30, mb: 30, mr: 240 }), celda(r[1] ? fichaPar(r[1]) : par(run(''), { after: 0 }), ANCHO - MITAD, { mt: 30, mb: 30, mr: 0 })] })))],
      // Sin la línea de identificación: ya está en «Datos del paciente».
      resumen: () => [tabla([1300, ANCHO - 1300], rm.lineas.map(l => new TableRow({ cantSplit: true, children: [
        celda(par(run(l.k, { size: SZ.etiqueta, bold: true, caps: true, color: MUT }), { after: 0 }), 1300, { bottom: linea(FILA) }),
        celda(par(run(l.t, { size: SZ.chico }), { after: 0 }), ANCHO - 1300, { bottom: linea(FILA), mr: 0 }),
      ] })))],
      dolor: () => [par(new ImageRun({ type: 'png', data: dataUriToBytes(evaPng), transformation: { width: evaW, height: evaH } }), { after: 60 })],
      evaluacion: () => {
        const out = [par(run(`${dmy(m.evalInicial.fecha)}${m.evalInicial.pb != null ? ` · EVA ${m.evalInicial.pb}/10` : ''}`, { bold: true }), { after: 80, keepNext: true })];
        (m.evalInicial.partes || []).forEach(x => out.push(par(run(limpiarParte(x)), { after: 50 })));
        if (gonio.length) {
          const GC = [4200, 1300, 1300];
          out.push(par(run('Goniometría (AAOS)', { bold: true }), { before: 200, after: 60, keepNext: true }));
          out.push(tabla(GC, [
            new TableRow({ tableHeader: true, cantSplit: true, children: ['Movimiento', 'Der.', 'Izq.'].map((t, c) =>
              celda(par(run(t, { size: SZ.etiqueta, bold: true, caps: true, color: MUT }), { after: 0, align: c ? AlignmentType.CENTER : undefined }), GC[c], { bottom: linea(INK) })) }),
            ...gonio.flatMap(g => [
              new TableRow({ cantSplit: true, children: [celda(par(run(g.articulacion, { bold: true, size: SZ.chico }), { after: 0, keepNext: true }), GC[0] + GC[1] + GC[2], { span: 3, bottom: linea(REGLA), mt: 120 })] }),
              ...g.filas.map((f, k) => {
                const keepNext = k < g.filas.length - 1;
                const v = t => par(run(t, { size: SZ.chico }), { after: 0, align: AlignmentType.CENTER, keepNext });
                return new TableRow({ cantSplit: true, children: [
                  celda(par(run(f.movimiento, { size: SZ.chico }), { after: 0, keepNext }), GC[0], { bottom: linea(FILA), mt: 40, mb: 40 }),
                  ...(g.lados
                    ? [celda(v(f.d), GC[1], { bottom: linea(FILA), mt: 40, mb: 40 }), celda(v(f.i), GC[2], { bottom: linea(FILA), mt: 40, mb: 40 })]
                    : [celda(v(f.valor), GC[1] + GC[2], { span: 2, bottom: linea(FILA), mt: 40, mb: 40 })]),
                ] });
              }),
            ]),
          ]));
        }
        return out;
      },
      narrativa: () => narr.flatMap(s => [
        par(run(s.title, { bold: true }), { before: 120, after: 40, keepNext: true }),
        ...String(s.body || '').split('\n').filter(Boolean).map(l => par(run(l), { after: 60, line: 300 })),
      ]),
      // DOC-1: tabla por sesión para aseguradoras.
      detalle: () => {
        if (!ses.length) return [par(run('Sin sesiones de tratamiento registradas.', { color: MUT }))];
        const SC = [1000, 620, 1050, 900, 1150, 900, 2200, 2720];
        const cab = ['Fecha', 'Hora', 'Tipo', 'Lugar', 'Terapeuta', 'Dolor (antes→después)', 'Técnicas', 'Observación'];
        const t = (txt, o = {}) => par(run(txt, { size: SZ.tabla, color: o.color }), { after: 0, align: o.align });
        return [tabla(SC, [
          new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((c, i) =>
            celda(par(run(c, { size: SZ.mini, bold: true, caps: true, color: MUT }), { after: 0, align: i === 5 ? AlignmentType.CENTER : undefined }), SC[i], { bottom: linea(INK), mr: 80 })) }),
          ...ses.map(s => {
            const eva = s.pb != null ? `${s.pb}→${s.pa != null ? s.pa : '?'}` : s.pa != null ? `—→${s.pa}` : '—';
            const obs = [...(s.soapie || []).map(l => `${l.k} ${l.t}`), ...(s.obs ? [s.obs] : [])];
            const o = { bottom: linea(FILA), mr: 80 };
            return new TableRow({ cantSplit: true, children: [
              celda(t(dmy(s.fecha)), SC[0], o), celda(t(s.hora || '—'), SC[1], o), celda(t(tipoCorto(s.tipo)), SC[2], o),
              celda(t(s.lugar || '—'), SC[3], o), celda(t(s.terapeuta || '—'), SC[4], o),
              celda(t(eva, { align: AlignmentType.CENTER }), SC[5], o),
              celda(t(s.tecnicas || '—', { color: MUT }), SC[6], o),
              celda(obs.length ? obs.map(x => t(x, { color: MUT })) : t('—', { color: MUT }), SC[7], { ...o, mr: 0 }),
            ] });
          }),
        ])];
      },
    };
    seccionesInforme(m, rm).forEach(s => {
      // El gráfico: la sección existe si hay SVG o imagen vieja; si la rasterización falló, se omite.
      if (s.id === 'dolor' && !evaPng) return;
      body.push(h2(s.rotulo), ...constructores[s.id]());
    });

    // ── Firma ──
    body.push(par(run(''), { before: 500, after: 0, keepNext: true }));
    body.push(par(run(''), { after: 80, keepNext: true, border: { top: linea(INK, 6) }, indent: { right: ANCHO - 4300 } }));
    if (m.firmante) body.push(par(run(m.firmante, { bold: true }), { after: 20, keepNext: true }));
    body.push(par(run([m.firmante ? (m.firmanteCargo || 'Fisioterapeuta') : '', 'Rehactiva'].filter(Boolean).join(' · '), { size: SZ.chico, color: MUT }), { after: 20, keepNext: true }));
    body.push(par(run(`Emitido el ${m.fechaLarga || ''}`, { size: SZ.chico, color: MUT }), { after: 140, keepNext: true }));
    const punteado = { style: BorderStyle.DASHED, size: 4, color: 'B8B8B0', space: 4 };
    body.push(par([run('Firmado electrónicamente con FirmaEC ', { size: SZ.etiqueta, color: RESERVA }), run('(espacio reservado)', { size: SZ.mini, color: RESERVA })],
      { after: 0, border: { top: punteado, bottom: punteado, left: punteado, right: punteado }, indent: { right: ANCHO - 4300 } }));

    const doc = new Document({
      styles: { default: { document: { run: { font: SANS, size: SZ.cuerpo, color: INK } } } },
      sections: [{
        properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: MARGIN } },
        headers: { default: new Header({ children: [
          tabla([5270, 5270], [new TableRow({ cantSplit: true, children: [
            celda(par(run('Confidencial · Historia clínica', { size: SZ.mini, bold: true, caps: true, color: MUT }), { after: 0 }), 5270, { bottom: linea(REGLA), mb: 90 }),
            celda(par(run(`Informe de evolución · N.º ${m.numero || ''}`, { size: SZ.mini, bold: true, caps: true, color: MUT }), { after: 0, align: AlignmentType.RIGHT }), 5270, { bottom: linea(REGLA), mb: 90, mr: 0 }),
          ] })]),
        ] }) },
        footers: { default: new Footer({ children: [
          par(run(pieLegal(), { size: SZ.mini, color: MUT }), { after: 20, border: { top: { ...linea(REGLA), space: 4 } } }),
          par(run('Copia editable · el documento oficial es el PDF · Generado por RehactivaPro', { size: SZ.mini, color: MUT }), { after: 0 }),
        ] }) },
        children: body,
      }],
    });

    const blob = await Packer.toBlob(doc);
    descargar(blob, nombreArchivoInforme(m.numero, 'docx'));
    toastOk(`✓ .docx generado (${Math.round(blob.size / 1024)} KB)`);
  } catch (e) {
    console.error('[word]', e);
    toastErr('Falló la generación del .docx: ' + (e?.message || e));
  }
}
