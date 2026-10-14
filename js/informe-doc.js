// ── Documento del informe de evolución (PDF y Word) — lógica PURA ──
// INF-2: lo que comparten el PDF (buildPdfHtml, acá) y el Word (word.js): las filas de «Datos del
// paciente» y el ORDEN de las secciones, así los dos documentos no pueden quedar distintos. Sin DOM
// ni state: se prueba con node --test (informes.js importa el cliente de Supabase y no carga fuera
// de Vite). La pantalla (renderPatientReport) tiene su propio diseño y no pasa por acá, salvo el
// HTML del resumen para el médico (htmlResumenMedico).
//
// Orden: encabezado · 1. Datos del paciente · 2. Resumen para el médico · 3. Evolución del dolor
// (EVA) · 4. Evaluación inicial (+ goniometría) · 5. Narrativa clínica · 6. Detalle por sesión ·
// firma. Los números se asignan en orden entre las secciones PRESENTES (sin gráfico, la evaluación
// inicial pasa a ser la 3).
import { esc, dmy, buildEvaSvg, limpiarParte, textoPrevias, textoPeriodoRango, pieLegal, tipoCorto } from './utils.js';
import { romGrupos } from './rom.js';
import { resumenMedico, periodoInforme, tipoTerapiaDe } from './resumen-medico.js';
import { textoOrden } from './orden-medica.js';
import { LOGO_DATA_URI } from './pdf-logo.js';

// «Fecha de nacimiento: dd/mm/aaaa (34 años)» si getDisplayAge trajo la fecha; «Edad: 34 años» con
// la edad legacy; nada si no hay ninguna. Sale de paciente.edad (getDisplayAge(p,true)), que también
// traen los snapshots viejos.
function _filaEdad(edad) {
  const e = String(edad || '').trim();
  if (!e || e === 'Sin edad') return null;
  return /^\d{2}\/\d{2}\/\d{4} \(/.test(e) ? { k: 'Fecha de nacimiento', v: e } : { k: 'Edad', v: e };
}

// «Lumbalgia (CIE-10 M54.5 — Lumbago no especificado)». Modelos nuevos traen el diagnóstico y el
// código por separado; los snapshots viejos solo el texto combinado de diagConCie, que va tal cual.
function _diagnostico(pac) {
  if (pac?.diag == null) return String(pac?.diagnostico || '').trim();
  const base = String(pac.diag || '').trim();
  if (!base || !pac.cie10) return base;
  return `${base} (CIE-10 ${pac.cie10}${pac.cie10Desc ? ' — ' + pac.cie10Desc : ''})`;
}

// Filas del bloque «Datos del paciente»: [{k, v, ancho}] (ancho = ocupa las dos columnas). Regla
// DOC-1: el dato que falta no se imprime (ni «No registrado» ni «—»). Sin dirección, teléfono ni correo.
// B1: sexo, diagnósticos secundarios (CAMPOS-1) y orden médica (ORD-1); los snapshots viejos no los
// traen y esas filas no salen.
export function filasDatosPaciente(m) {
  const pac = m?.paciente || {};
  const met = m?.metricas || {};
  const ter = (m?.terapeutas && m.terapeutas.length) ? m.terapeutas.join(', ')
    : (m?.terapeuta && m.terapeuta !== 'Varios' && m.terapeuta !== '—' ? m.terapeuta : '');
  const plan = Number(met.sessions) || 0;
  const sesiones = plan > 0
    ? `${met.done ?? 0} de ${plan} (${met.pct ?? 0} %)` + (Number(met.previas) > 0 ? ` · ${textoPrevias(met.previas)}` : '')
    : '';
  const varios = (m?.terapeutas?.length || 0) > 1;
  const diagSec = Array.isArray(pac.diagSec) ? pac.diagSec.filter(x => x?.c).map(x => `${x.c} — ${x.d || ''}`.replace(/ — $/, '')).join('; ') : '';
  const filas = [
    { k: 'Nombre completo', v: pac.nombre },
    { k: 'Identificación', v: pac.cedula },
    _filaEdad(pac.edad),
    { k: 'Sexo', v: pac.sexo === 'F' ? 'Femenino' : pac.sexo === 'M' ? 'Masculino' : '' },
    { k: 'Diagnóstico principal', v: _diagnostico(pac), ancho: true },
    { k: 'Diagnósticos secundarios', v: diagSec, ancho: true },
    { k: varios ? 'Fisioterapeutas' : 'Fisioterapeuta', v: ter },
    { k: 'Médico referente', v: m?.doctor },
    { k: 'Orden médica', v: textoOrden(m?.orden), ancho: true },
    { k: 'Inicio del tratamiento', v: m?.inicio && m.inicio !== '—' ? dmy(m.inicio) : '' },
    { k: 'Sesiones del plan', v: sesiones },
    { k: 'Protocolo', v: m?.protocolo },
    { k: 'Tipo de terapia', v: m?.tipoTerapia || tipoTerapiaDe(m?.sesiones) },
  ];
  return filas.filter(f => f && String(f.v ?? '').trim()).map(f => ({ k: f.k, v: String(f.v).trim(), ancho: !!f.ancho }));
}

// Las filas en renglones de dos columnas (Word y PDF): una fila «ancho» va sola en su renglón.
export function renglonesDatosPaciente(filas) {
  const out = [];
  let par = [];
  (filas || []).forEach(f => {
    if (f.ancho) { if (par.length) out.push(par); out.push([f]); par = []; return; }
    par.push(f);
    if (par.length === 2) { out.push(par); par = []; }
  });
  if (par.length) out.push(par);
  return out;
}

// Secciones del documento, en orden, solo las presentes, con su número. id: paciente · resumen ·
// dolor · evaluacion · narrativa · detalle. rm: el resumen ya calculado (null = no hay).
export function seccionesInforme(m, rm) {
  const ses = m?.sesiones || [];
  const lista = [
    { id: 'paciente', titulo: 'Datos del paciente' },
    rm ? { id: 'resumen', titulo: 'Resumen para el médico' } : null,
    (buildEvaSvg(m || {}) || m?.evaChartImg) ? { id: 'dolor', titulo: 'Evolución del dolor (EVA)' } : null,
    m?.evalInicial ? { id: 'evaluacion', titulo: 'Evaluación inicial' } : null,
    (m?.narrativa && m.narrativa.length) ? { id: 'narrativa', titulo: 'Narrativa clínica' } : null,
    { id: 'detalle', titulo: `Detalle por sesión (${ses.length})` },
  ].filter(Boolean);
  return lista.map((s, i) => ({ ...s, n: i + 1, rotulo: `${i + 1}. ${s.titulo}` }));
}

// Resumen del render-model: el guardado, o calculado al vuelo para un snapshot previo a INF-UNI.
export function resumenDelModelo(m, hoy) {
  return m?.resumenMedico || resumenMedico(m, hoy || m?.emitido || new Date());
}

// HTML del resumen para el médico (pantalla y PDF): una fila por línea. o.identificacion: la línea
// en negrita de arriba (solo pantalla desde INF-2). o.sugerido: marca el pedido como sugerencia.
export function htmlResumenMedico(rm, o = {}) {
  return (o.identificacion ? '<div class="rm-id">' + esc(rm.identificacion) + '</div>' : '') + '<table class="rm"><tbody>'
    + rm.lineas.map(l => '<tr><th>' + esc(l.k) + '</th><td>' + esc(l.t)
      + (o.sugerido && l.k === 'Pedido' ? ' <span class="rm-sug">(sugerido; se elige al exportar)</span>' : '') + '</td></tr>').join('')
    + '</tbody></table>';
}

// PURA: render-model → HTML del PDF con formato de documento médico formal (sin look dashboard:
// nada de verdes, cajas tintadas ni colores semáforo). La usan el export vivo y el guardado.
// Encabezado ("CONFIDENCIAL · Historia clínica" + N.º) y pie legal se repiten en cada página: van
// en el thead/tfoot de una tabla que envuelve todo (Chrome los repite al imprimir). @page sin
// margen = el navegador no imprime about:blank ni la fecha; los márgenes los ponen el padding del
// body (laterales) y el alto del thead/tfoot (arriba y abajo de cada página).
// opts.hoy: fecha de referencia del resumen de un snapshot viejo que no lo trae (su emisión).
export function buildPdfHtml(m, opts) {
  const ses = m.sesiones || [];
  const narr = m.narrativa;
  const periodo = periodoInforme(m) || m.fechaLarga;
  const rm = resumenDelModelo(m, opts?.hoy);
  const secs = seccionesInforme(m, rm);
  const h2 = id => { const s = secs.find(x => x.id === id); return s ? '<h2>' + esc(s.rotulo) + '</h2>' : ''; };

  // 1. Datos del paciente: ficha de dos columnas, etiqueta en negrita y valor en la misma línea.
  const datos = '<div class="ficha">' + filasDatosPaciente(m).map(f =>
    '<div class="ficha-f' + (f.ancho ? ' ancho' : '') + '"><b>' + esc(f.k) + ':</b> ' + esc(f.v) + '</div>').join('') + '</div>';

  const evaSvg = buildEvaSvg(m);
  const chart = evaSvg
    ? '<div class="keep">' + h2('dolor') + evaSvg + '</div>'
    : (m.evaChartImg ? '<div class="keep">' + h2('dolor') + '<img src="' + esc(m.evaChartImg) + '" style="max-width:100%;display:block"></div>' : '');

  let evalBlock = '';
  if (m.evalInicial) {
    const partes = m.evalInicial.partes || [];
    evalBlock = '<div class="keep">' + h2('evaluacion')
      + '<div class="eval-sub">' + esc(dmy(m.evalInicial.fecha)) + (m.evalInicial.pb != null ? ' · EVA ' + esc(m.evalInicial.pb) + '/10' : '') + '</div>'
      + partes.map(x => '<p class="eval-p">' + esc(limpiarParte(x)) + '</p>').join('')
      + '</div>';
    // Goniometría FUERA del .keep: con muchas medidas la tabla tiene que poder partirse entre páginas
    // (thead se repite), pero solo ENTRE articulaciones — cada una va en su propio tbody que no se
    // parte. Solo valores medidos, sin normal ni %. Snapshots previos a ROM-2a no traen rom → nada.
    const gonio = romGrupos(m.evalInicial.rom);
    if (gonio.length) {
      evalBlock += '<h3 class="gonio">Goniometría (AAOS)</h3>'
        + '<table class="gonio"><thead><tr><th>Movimiento</th><th class="ctr">Der.</th><th class="ctr">Izq.</th></tr></thead>'
        + gonio.map(g => '<tbody><tr class="gonio-art"><td colspan="3">' + esc(g.articulacion) + '</td></tr>'
          + g.filas.map(f => '<tr><td>' + esc(f.movimiento) + '</td>'
            + (g.lados ? '<td class="ctr nw">' + esc(f.d) + '</td><td class="ctr nw">' + esc(f.i) + '</td>' : '<td class="ctr nw" colspan="2">' + esc(f.valor) + '</td>')
            + '</tr>').join('')
          + '</tbody>').join('')
        + '</table>';
    }
  }

  const aiHTML = (narr && narr.length)
    ? h2('narrativa') + narr.map(s => '<div class="narr-sec"><h3 class="narr">' + esc(s.title) + '</h3><div class="narr-body">' + esc(s.body).replace(/\n/g, '<br>') + '</div></div>').join('')
    : '';

  // DOC-1: tabla por sesión para aseguradoras. Hora/tipo/lugar no existen en snapshots viejos: '—'.
  let filas = '';
  ses.forEach(function (s) {
    const eva = s.pb != null ? s.pb + '→' + (s.pa != null ? s.pa : '?') : s.pa != null ? '—→' + s.pa : '—';
    const soap = (s.soapie || []).map(l => '<div class="soap-l"><b>' + esc(l.k) + '</b> ' + esc(l.t) + '</div>').join('');
    const obsHtml = soap + (s.obs ? (soap ? '<div class="soap-l">' + esc(s.obs) + '</div>' : esc(s.obs)) : '');
    filas += '<tr><td class="nw">' + esc(dmy(s.fecha)) + '</td><td class="nw">' + esc(s.hora || '—') + '</td><td>' + esc(tipoCorto(s.tipo)) + '</td>'
      + '<td>' + esc(s.lugar || '—') + '</td><td>' + esc(s.terapeuta || '—') + '</td><td class="ctr nw">' + esc(eva) + '</td>'
      + '<td class="mut">' + (s.tecnicas ? esc(s.tecnicas) : '—') + '</td><td class="mut">' + (obsHtml || '—') + '</td></tr>';
  });
  const tabla = ses.length
    ? '<table class="ses"><thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Lugar</th><th>Terapeuta</th><th class="ctr">Dolor (antes→después)</th><th>Técnicas</th><th>Observación</th></tr></thead><tbody>' + filas + '</tbody></table>'
    : '<div class="mut" style="padding:10px 0;font-size:11px">Sin sesiones de tratamiento registradas.</div>';

  const firma = '<div class="firma keep"><div class="firma-linea"></div>'
    + (m.firmante ? '<div class="firma-nombre">' + esc(m.firmante) + '</div>' : '')
    + '<div class="firma-cargo">' + esc([m.firmante ? (m.firmanteCargo || 'Fisioterapeuta') : '', 'Rehactiva'].filter(Boolean).join(' · ')) + '</div>'
    + (m.firmanteRegistro ? '<div class="firma-cargo">Registro profesional: ' + esc(m.firmanteRegistro) + '</div>' : '')
    + '<div class="firma-cargo">Emitido el ' + esc(m.fechaLarga) + '</div>'
    + '<div class="firma-ec">Firmado electrónicamente con FirmaEC <span>(espacio reservado)</span></div></div>';

  const titulo = 'Informe ' + (m.numero || '');
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + esc(titulo) + '</title>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + '@page{margin:0}'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1A1A1A;background:#fff;padding:32px;max-width:800px;margin:0 auto}'
    + 'h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1A1A1A;margin:22px 0 10px;padding-bottom:5px;border-bottom:1px solid #D8D8D2;break-after:avoid;page-break-after:avoid}'
    + '.mut{color:#6B6B66}.nw{white-space:nowrap}.ctr{text-align:center}'
    + '.keep{break-inside:avoid;page-break-inside:avoid}'
    + 'table.pg{width:100%;margin:0;border-collapse:collapse}'
    + 'table.pg>thead>tr>td,table.pg>tbody>tr>td,table.pg>tfoot>tr>td{padding:0;border:0;font-size:12px;vertical-align:top}'
    + 'table.pg>tbody>tr{break-inside:auto;page-break-inside:auto}'
    + 'tfoot{display:table-footer-group}'
    + '.run-h{display:flex;justify-content:space-between;gap:12px;font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6B6B66;padding-bottom:6px;margin-bottom:14px;border-bottom:1px solid #D8D8D2}'
    + '.run-f{display:flex;justify-content:space-between;gap:12px;margin-top:22px;padding-top:6px;border-top:1px solid #D8D8D2;font-size:8px;color:#6B6B66}'
    + '.header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}'
    + '.h-right{text-align:right;flex-shrink:0}'
    + '.h-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#1A1A1A}'
    + '.h-meta{font-size:10px;color:#6B6B66;margin-top:4px}'
    + '.rule{display:flex;height:3px;margin-top:12px}.rule-a{width:64px;background:#F09028}.rule-b{flex:1;background:#28A8C8}'
    + '.ficha{display:grid;grid-template-columns:1fr 1fr;gap:5px 24px}.ficha-f{font-size:11.5px;line-height:1.45}.ficha-f.ancho{grid-column:1/-1}'
    + 'table.rm{width:100%;margin:0}table.rm th{width:84px;font-size:9px;padding:5px 8px 5px 0;border-bottom:1px solid #EAEAE4;vertical-align:top}'
    + 'table.rm td{font-size:11px;padding:5px 0;border-bottom:1px solid #EAEAE4;line-height:1.45}'
    + '.rm-sug{color:#6B6B66}'
    + 'h3.narr{font-size:12px;font-weight:700;color:#1A1A1A;margin:10px 0 4px;letter-spacing:.02em}'
    + '.narr-body{font-size:11px;line-height:1.6;color:#1A1A1A;margin-bottom:6px}'
    + '.narr-sec{break-inside:avoid;page-break-inside:avoid}'
    + '.eval-sub{font-size:12px;font-weight:700;color:#1A1A1A;margin-bottom:6px}'
    + '.eval-p{font-size:11px;line-height:1.55;margin-bottom:3px}'
    + '.soap-l{margin-bottom:2px}.soap-l b{display:inline-block;width:12px;color:#1A1A1A}'
    + 'h3.gonio{font-size:11px;font-weight:700;color:#1A1A1A;margin:14px 0 4px;break-after:avoid;page-break-after:avoid}'
    + 'table.gonio{width:auto;min-width:60%}table.gonio tbody{break-inside:avoid;page-break-inside:avoid}'
    + 'table.gonio td{padding:3px 8px}table.gonio th:first-child{min-width:220px}table.gonio th.ctr{min-width:80px}'
    + 'tr.gonio-art td{font-weight:700;padding-top:8px;border-bottom:1px solid #D8D8D2}'
    + 'table{width:100%;border-collapse:collapse;margin-top:4px}'
    + 'thead{display:table-header-group}'
    + 'tr{break-inside:avoid;page-break-inside:avoid}'
    + 'th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6B6B66;text-align:left;padding:6px 8px;border-bottom:1px solid #1A1A1A}'
    + 'td{font-size:11px;color:#1A1A1A;padding:7px 8px;border-bottom:1px solid #EAEAE4;vertical-align:top}'
    + 'table.ses th{font-size:8.5px;padding:5px 5px;letter-spacing:.03em}table.ses td{font-size:10px;padding:6px 5px}'
    + '.firma{margin-top:36px;width:300px}.firma-linea{border-top:1px solid #1A1A1A;margin-bottom:6px}'
    + '.firma-nombre{font-size:12px;font-weight:700;color:#1A1A1A}.firma-cargo{font-size:10px;color:#6B6B66;margin-top:2px}'
    + '.firma-ec{margin-top:10px;padding:6px 8px;border:1px dashed #B8B8B0;font-size:9px;color:#9A9A94}.firma-ec span{font-size:8px}'
    + '.print-btn{margin-top:10px;padding:6px 14px;background:#1A1A1A;color:#fff;border:none;cursor:pointer;font-size:11px;font-family:inherit}'
    + '@media print{body{padding:0 15mm;max-width:none}button{display:none}.run-h{margin-top:12mm}.run-f{margin-bottom:10mm}}'
    + '</style></head><body>'
    + '<table class="pg"><thead><tr><td><div class="run-h"><span>Confidencial · Historia clínica</span><span>Informe de evolución · N.º ' + esc(m.numero) + '</span></div></td></tr></thead>'
    + '<tfoot><tr><td><div class="run-f"><div>' + esc(pieLegal()) + '</div><div class="nw">Generado por RehactivaPro</div></div></td></tr></tfoot>'
    + '<tbody><tr><td>'
    + '<div class="header"><div><img src="' + LOGO_DATA_URI + '" alt="Rehactiva" style="height:44px;display:block"></div>'
    + '<div class="h-right"><div class="h-title">Informe de evolución</div>'
    + '<div class="h-meta">N.º ' + esc(m.numero) + ' · ' + esc(m.fechaLarga) + '</div>'
    + '<div class="h-meta">' + (m.rango ? esc(textoPeriodoRango(m.rango)) : 'Período del informe: ' + esc(periodo)) + '</div>'
    + '<button class="print-btn" onclick="window.print()">Imprimir / Guardar PDF</button></div></div>'
    + '<div class="rule"><div class="rule-a"></div><div class="rule-b"></div></div>'
    + h2('paciente') + datos
    + (rm ? h2('resumen') + htmlResumenMedico(rm) : '')
    + chart
    + evalBlock
    + aiHTML
    + h2('detalle') + tabla
    + firma
    + '</td></tr></tbody></table>'
    + '</body></html>';
}
