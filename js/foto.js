// ── Foto de la agenda (PNG) para compartir por WhatsApp ─────────────────────────────────────
//
// Segunda salida del motor de export, junto al .xlsx. El caso de uso es concreto: la secretaria
// manda la agenda del día al grupo de WhatsApp del equipo. Un .xlsx ahí no sirve — nadie lo abre
// desde el teléfono; una imagen se ve en la conversación.
//
// CERO lógica duplicada: los datos salen de datosExport() y el mapeo cita → (fila, bloque) de
// planificarDia(), los mismos que produce el Excel. Este módulo solo decide cómo se DIBUJA.
//
// La librería (html-to-image) se carga por IMPORT DINÁMICO, igual que exceljs y docx.
//
// Cuatro decisiones de legibilidad que apartan la foto del .xlsx, a propósito — el .xlsx es un
// archivo de trabajo y la foto se mira en un teléfono:
//  1. Una IMAGEN POR DÍA. Una semana apilada en un solo PNG da una tira larguísima que WhatsApp
//     recomprime hasta volverla ilegible; siete imágenes se ven bien y se pasan de a una.
//  2. Solo los terapeutas CON citas ese día tienen columna. En el Excel están todos siempre
//     (es la plantilla); en una foto de 300 px por bloque, una columna vacía es ancho tirado.
//  3. Sin columna N°: HORA | PACIENTE | LUGAR. El ordinal del episodio es dato de gestión, no de
//     "quién atiende a quién hoy", que es lo que se manda al grupo.
//  3. El título lleva TILDE ("MIÉRCOLES 05 DE AGOSTO DEL 2026"). El Excel replica el histórico,
//     que las escribe sin tilde; una imagen nueva no tiene por qué heredar esa errata.
//  4. La grilla NO tiene el límite de papel de la plantilla. El Excel tiene 13 filas y punto
//     (07:00–19:00), así que una cita que no entra se reporta como sobrante; una imagen se
//     estira, así que las sobrantes se dibujan igual, al pie del bloque. Ver bloquesDeFoto().
// Lo demás sí imita la plantilla: bloque por terapeuta con su color, las 13 filas de 07:00 a
// 19:00, columnas HORA | PACIENTE | N° | LUGAR, 'por confirmar' en FFC000 y 'no asistió' tachado.
import { toastOk, toastErr, toastInfo } from './toast.js';
import { esc, fmtTime, getColor } from './utils.js';
import { LOGO_DATA_URI } from './pdf-logo.js';
import { datosExport, citasDelDia } from './export-datos.js';
import { GRILLA, ESPECIALIDADES_ORDEN, PALETA_HISTORICA, PRIMERA_HORA,
         planificarDia, diasDelRango, aFecha } from './excel-layout.js';

// Rango máximo de la foto: una semana. Más que eso son demasiadas imágenes para mandar por
// WhatsApp de a una, y es la razón por la que "Mes completo" queda deshabilitado en el modal.
export const MAX_DIAS_FOTO = 7;

// Filas de la franja horaria de la plantilla: 07:00 … 19:00. Los índices por ENCIMA de este tope
// son el desborde (ver bloquesDeFoto), que en el papel no existía pero en una imagen sí cabe.
export const FILAS_HORARIO = GRILLA.fisica.filaUltima - GRILLA.fisica.filaPrimera + 1;

const AMBAR = '#FFC000';
// Sin webfonts a propósito: html-to-image va con skipFonts, así que la tipografía tiene que ser
// una que el sistema ya tenga. Si intentara embeber Public Sans (Google Fonts, otro origen), el
// render dependería de una descarga que puede fallar y salir con la fuente de reemplazo.
//
// SIN COMILLAS en la lista, y no es cosmético: estos estilos van EN LÍNEA dentro de
// style="...", y una familia entre comillas dobles cierra el atributo ahí mismo. El HTML queda
// roto, y como html-to-image serializa el nodo dentro de un <foreignObject> —que sí se parsea
// como XML estricto— el render entero falla con un Event pelado, sin mensaje. Arial cubre
// Windows/Android, Helvetica iOS/macOS, y sans-serif el resto: ninguna necesita comillas.
const FUENTE = 'Arial, Helvetica, sans-serif';

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
               'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// Título de la foto, CON tildes (a diferencia de tituloHoja() del Excel, que replica el histórico).
export function tituloFoto(ds) {
  const d = aFecha(ds);
  if (!d) return String(ds || '');
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} DE ${MESES[d.getMonth()]} DEL ${d.getFullYear()}`;
}

export function nombreFoto(ds) {
  return `agenda_${ds}.png`;
}

// Color del bloque: el del terapeuta en la app, con la paleta histórica de fallback por posición.
// Misma regla que el Excel (colorBloque en js/excel.js), en hex CSS en vez de ARGB.
function colorBloque(th, i) {
  const c = th && th.colorId ? getColor(th.colorId) : null;
  return c ? { fondo: c.bg, texto: c.text } : { fondo: '#' + PALETA_HISTORICA[i % PALETA_HISTORICA.length], texto: '#1a1917' };
}

// ── Plan del día → bloques dibujables ───────────────────────────────────────────────────────
// Aplana las dos rejillas de planificarDia() (física y respiratoria) en una sola tira de bloques
// y convierte el número de FILA de cada grilla en el ÍNDICE DE HORA común (0 = 07:00 … 12 = 19:00).
// Se queda solo con los terapeutas que tienen citas.
//
// Y RECUPERA LAS SOBRANTES. planificarDia() reparte las citas en las 13 filas de la plantilla y
// devuelve en `sobrantes` las que no entraron — con 15 citas de media hora, un terapeuta tiene 13
// filas y 2 afuera. El .xlsx no puede hacer más que reportarlas (la hoja tiene esas 13 filas y la
// suma de la 20 depende de eso), pero una IMAGEN se estira: acá se dibujan igual, en índices por
// encima de FILAS_HORARIO, ordenadas por hora entre ellas y con su hora real en la celda HORA.
// Perder pacientes en silencio en la foto que se manda al grupo es peor que una imagen más larga.
// Pura: es la que testea test/foto.test.js.
export function bloquesDeFoto(plan) {
  const out = [];
  ESPECIALIDADES_ORDEN.forEach(esp => {
    (plan.rejillas[esp] || []).forEach(b => {
      const sobrantes = [...(b.sobrantes || [])]
        .sort((x, y) => (Number(x.hour) || 0) - (Number(y.hour) || 0) || String(x.id).localeCompare(String(y.id)));
      if (!b.filas.size && !sobrantes.length) return;  // terapeuta sin citas: no ocupa columna
      const horas = new Map();
      b.filas.forEach((cita, fila) => horas.set(fila - GRILLA[esp].filaPrimera, cita));
      sobrantes.forEach((cita, j) => horas.set(FILAS_HORARIO + j, cita));
      out.push({ terapeuta: b.terapeuta, especialidad: esp, horas, desborde: sobrantes.length });
    });
  });
  return out;
}

// Cuántas filas dibuja la tabla: las 13 de la plantilla, o más si algún bloque desbordó. Los
// bloques que no desbordaron dejan esas filas de más en blanco.
export function filasDeFoto(bloques) {
  return (bloques || []).reduce(
    (max, b) => Math.max(max, ...[...b.horas.keys()].map(k => k + 1)), FILAS_HORARIO);
}

// ── HTML de una hoja ────────────────────────────────────────────────────────────────────────
// Devuelve un string: no toca el DOM. Así se puede fijar con un test (`node --test`) sin
// navegador y sin html-to-image. Todo va con estilos EN LÍNEA porque html-to-image serializa el
// nodo con sus estilos computados: depender de css/*.css lo haría frágil.
export function construirHojaFotoHTML(plan) {
  const bloques = bloquesDeFoto(plan);
  if (!bloques.length) return null;                   // día sin una sola cita: no se genera imagen

  const cel = (txt, est) => `<td style="${est}">${txt}</td>`;
  const bordeF = '1px solid #c9c6c0';

  // Fila 1: nombre del terapeuta, ocupando sus 4 columnas, con su color.
  const nombres = bloques.map((b, i) => {
    const c = colorBloque(b.terapeuta, i);
    return `<td colspan="4" style="background:${c.fondo};color:${c.texto};font-weight:700;font-size:15px;`
      + `text-align:center;padding:7px 6px;border:${bordeF};white-space:nowrap">${esc(String(b.terapeuta.name || '').toUpperCase())}</td>`;
  }).join('');

  // Fila 2: headers, con el mismo color del bloque. Las mismas columnas del .xlsx: el N° es el
  // ordinal de la cita en su episodio, y los terapeutas lo leen en la captura de siempre.
  const headers = bloques.map((b, i) => {
    const c = colorBloque(b.terapeuta, i);
    const h = (t, w) => `<td style="background:${c.fondo};color:#1a1917;font-weight:700;font-size:12px;`
      + `text-align:center;padding:5px 4px;border:${bordeF};width:${w}px">${t}</td>`;
    return h('HORA', 58) + h('PACIENTE', 190) + h('N°', 40) + h('LUGAR', 46);
  }).join('');

  // Filas 3..N: las 13 horas de la plantilla, más las de desborde si algún bloque las tiene.
  const nFilas = filasDeFoto(bloques);
  const filas = [];
  for (let k = 0; k < nFilas; k++) {
    const celdas = bloques.map(b => {
      const cita = b.horas.get(k) || null;
      const pend = !!cita && cita.status === 'pend';
      const noas = !!cita && cita.status === 'noas';
      // El ámbar de 'por confirmar' NO baña la fila: solo PACIENTE, N° y LUGAR (la hora es del
      // esqueleto de la grilla, no de la cita). Mismo criterio que el .xlsx.
      const fondo = pend ? `background:${AMBAR};` : '';
      const tachado = noas ? 'text-decoration:line-through;' : '';
      const base = `border:${bordeF};font-size:14px;padding:5px 6px;height:26px;`;
      // La celda HORA muestra la hora REAL de la cita (12:30 en la fila de las 12), como en el
      // histórico. Sin cita: la hora en punto de la fila si es del horario, y VACÍA si es una
      // fila de desborde — ahí no hay hora de plantilla que mostrar.
      const hora = cita ? fmtTime(cita.hour) : (k < FILAS_HORARIO ? fmtTime(PRIMERA_HORA + k) : '');
      return cel(esc(hora), base + 'text-align:center;font-weight:700;color:#1a1917;white-space:nowrap')
        + cel(cita ? esc(cita.paciente) : '', base + fondo + tachado + 'color:#1a1917;white-space:nowrap;overflow:hidden')
        // 'por confirmar' va sin N° ni LUGAR, igual que en el Excel: todavía no es un dato firme.
        + cel(cita && !pend && cita.numero != null ? esc(cita.numero) : '', base + fondo + tachado + 'text-align:center;color:#1a1917')
        + cel(cita && !pend && cita.lugar ? esc(cita.lugar) : '', base + fondo + tachado + 'text-align:center;color:#1a1917');
    }).join('');
    filas.push(`<tr>${celdas}</tr>`);
  }

  const nCitas = bloques.reduce((s, b) => s + b.horas.size, 0);
  return `<div style="font-family:${FUENTE};background:#ffffff;padding:22px 24px 18px;display:inline-block">
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">
    <img src="${LOGO_DATA_URI}" style="height:46px;display:block" alt="">
    <div>
      <div style="font-size:24px;font-weight:700;color:#1a1917;letter-spacing:-.01em">${esc(plan.titulo)}</div>
      <div style="font-size:13px;color:#6b6a64;margin-top:2px">${nCitas} cita${nCitas !== 1 ? 's' : ''} · ${bloques.length} terapeuta${bloques.length !== 1 ? 's' : ''}</div>
    </div>
  </div>
  <table style="border-collapse:collapse;border-spacing:0"><tbody>
    <tr>${nombres}</tr>
    <tr>${headers}</tr>
    ${filas.join('\n    ')}
  </tbody></table>
  <div style="font-size:12px;color:#9c9a92;margin-top:10px;display:flex;gap:14px">
    <span><span style="display:inline-block;width:11px;height:11px;background:${AMBAR};border:1px solid #c9c6c0;vertical-align:-1px"></span> por confirmar</span>
    <span><span style="text-decoration:line-through">tachado</span> = no asistió</span>
    <span>N° = sesión del episodio · C = centro · D = domicilio</span>
    ${nFilas > FILAS_HORARIO ? '<span>las filas al pie son citas que no entran en la grilla de 07:00–19:00</span>' : ''}
  </div>
</div>`;
}

// El título va acá y no en construirHojaFotoHTML porque planificarDia() devuelve el título del
// Excel (sin tildes): la foto lo reemplaza por el suyo antes de dibujar.
function planParaFoto(fecha, citas, terapeutas) {
  const plan = planificarDia({ fecha, citas, terapeutas });
  return { ...plan, titulo: tituloFoto(fecha) };
}

// ── Render ──────────────────────────────────────────────────────────────────────────────────
// Contenedor fuera de pantalla: `position:fixed` a la izquierda del viewport, NO `display:none`
// — html-to-image necesita que el nodo tenga layout real para medirlo.
function montarFueraDePantalla(html) {
  const cont = document.createElement('div');
  cont.setAttribute('aria-hidden', 'true');
  cont.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;pointer-events:none;background:#fff';
  cont.innerHTML = html;
  document.body.appendChild(cont);
  return cont;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Genera un PNG por día CON citas. Devuelve [{fecha, nombre, blob, citas}].
// pixelRatio 2: WhatsApp recomprime lo que se le manda, así que el texto tiene que llegar con el
// doble de píxeles para que sobreviva legible.
export async function generarFotos({ desde, hasta, terapeutaIds = null }) {
  const { dias, terapeutas, citas } = datosExport({ desde, hasta, terapeutaIds });
  if (dias.length > MAX_DIAS_FOTO) {
    throw new Error(`La foto admite hasta ${MAX_DIAS_FOTO} días; elegiste ${dias.length}.`);
  }

  const { toBlob } = await import('html-to-image');
  const fotos = [];
  let vacios = 0;
  for (const fecha of dias) {
    const plan = planParaFoto(fecha, citas, terapeutas);
    const html = construirHojaFotoHTML(plan);
    if (!html) { vacios++; continue; }               // día sin citas: no se genera imagen
    const cont = montarFueraDePantalla(html);
    try {
      const blob = await toBlob(cont.firstElementChild, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        // skipFonts: la tipografía es de sistema (ver FUENTE). Sin esto html-to-image sale a
        // buscar el CSS de Google Fonts y el render queda a merced de esa descarga.
        skipFonts: true,
        // NADA de cacheBust: le agrega '?t=…' a la URL de cada imagen, y sobre el data URI del
        // logo eso lo rompe — el <img> falla y toBlob rechaza con un Event pelado, sin mensaje.
        // Acá no hay nada que cachear: el logo va embebido y no se pide por red.
      });
      if (blob) {
        const nCitas = bloquesDeFoto(plan).reduce((s, b) => s + b.horas.size, 0);
        fotos.push({ fecha, nombre: nombreFoto(fecha), blob, citas: nCitas });
      }
    } finally {
      cont.remove();
    }
  }
  return { fotos, vacios, dias: dias.length };
}

// ── Compartir ───────────────────────────────────────────────────────────────────────────────
// navigator.share con archivos abre la hoja del sistema, que es el camino corto al grupo de
// WhatsApp. Dos cosas que hay que respetar y que son la razón de este código:
//  · canShare({files}) es la ÚNICA forma fiable de saber si el navegador acepta compartir
//    archivos: `navigator.share` existe en sitios donde compartir un File igual falla.
//  · share() exige "activación transitoria": el gesto del usuario caduca (~5 s en Safari). Si el
//    render tardó, share() tira NotAllowedError. Por eso el fallo NO es un error: se cae a la
//    descarga, que siempre funciona. AbortError es el usuario cerrando la hoja: no es un fallo.
export async function compartirFotos(fotos) {
  const files = fotos.map(f => new File([f.blob], f.nombre, { type: 'image/png' }));
  const datos = { files, title: 'Agenda Rehactiva', text: 'Agenda Rehactiva' };

  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share(datos);
      return 'compartido';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado';
      console.warn('navigator.share falló, se descarga:', e);
    }
  }
  // Fallback: descarga. Con varios archivos se espacian los clicks — Chrome bloquea las descargas
  // múltiples disparadas en la misma vuelta del event loop.
  for (let i = 0; i < fotos.length; i++) {
    descargar(fotos[i].blob, fotos[i].nombre);
    if (i < fotos.length - 1) await new Promise(r => setTimeout(r, 350));
  }
  return 'descargado';
}

// ── UI ──────────────────────────────────────────────────────────────────────────────────────
// El formato vive en un input oculto y no en una variable de módulo para que el estado del modal
// sea legible desde el DOM (mismo criterio que el resto de los modales de la app).
export function formatoExport() {
  const el = document.getElementById('xl-formato');
  return el && el.value === 'foto' ? 'foto' : 'excel';
}

// Cambia el formato del modal. No llama a actualizarResumenExport() directamente (vive en
// excel.js, que ya importa a este módulo): lo dispara por el `onchange` del select o lo llama
// excel.js después. Devuelve true si además tuvo que corregir el rango.
export function setExportFormato(f) {
  const foto = f === 'foto';
  const el = document.getElementById('xl-formato');
  if (el) el.value = foto ? 'foto' : 'excel';
  document.getElementById('xl-fmt-excel').classList.toggle('active', !foto);
  document.getElementById('xl-fmt-foto').classList.toggle('active', foto);
  document.getElementById('xl-btn').textContent = foto ? 'Exportar foto' : 'Exportar Excel';
  document.getElementById('xl-desc').textContent = foto
    ? 'Una imagen por día, lista para mandar al grupo de WhatsApp.'
    : 'Genera el Excel con el formato de siempre: una hoja por día, un bloque por terapeuta.';

  // "Mes completo" no existe para la foto: 28–31 imágenes no se mandan por WhatsApp. Si estaba
  // elegido, se baja a "Semana" en vez de dejar el modal en un estado imposible.
  const preset = document.getElementById('xl-preset');
  const optMes = preset.querySelector('option[value="mes"]');
  optMes.disabled = foto;
  optMes.title = foto ? 'muy grande para imagen' : '';
  if (foto && preset.value === 'mes') {
    preset.value = 'semana';
    toastInfo('El mes completo es muy grande para una imagen: se cambió a Semana.');
    return true;
  }
  return false;
}

// Nota del modal cuando el formato es foto: cuántas imágenes salen, o por qué el rango no sirve.
// Devuelve null si el formato activo es Excel — esa nota la arma js/excel.js.
export function notaFoto(desde, hasta, thId) {
  if (formatoExport() !== 'foto') return null;
  const dias = diasDelRango(desde, hasta);
  if (!dias.length) return { error: true, html: '<span style="color:#c33a3a">Revisá las fechas: "hasta" no puede ser anterior a "desde".</span>' };
  if (dias.length > MAX_DIAS_FOTO) {
    return { error: true, html: `<span style="color:#c33a3a">La foto admite hasta ${MAX_DIAS_FOTO} días y elegiste ${dias.length}. Para un rango largo, usá el Excel.</span>` };
  }
  const conCitas = dias.filter(d => citasDelDia(d, thId) > 0);
  if (!conCitas.length) return { error: true, html: '<span style="color:#c33a3a">No hay citas en ese rango: no habría nada que fotografiar.</span>' };
  const omitidos = dias.length - conCitas.length;
  return {
    error: false,
    html: `${conCitas.length} imagen${conCitas.length !== 1 ? 'es' : ''} a 2× (una por día con citas`
      + `${omitidos ? `; ${omitidos} día${omitidos !== 1 ? 's' : ''} sin citas se omite${omitidos !== 1 ? 'n' : ''}` : ''})`
      + ` · <b>${esc(nombreFoto(conCitas[0]))}</b>${conCitas.length > 1 ? ' …' : ''}`,
  };
}

export async function confirmarExportarFoto() {
  const desde = document.getElementById('xl-desde').value;
  const hasta = document.getElementById('xl-hasta').value;
  const thId = document.getElementById('xl-terapeuta').value;
  if (!desde || !hasta) { toastErr('Elegí las dos fechas del rango.'); return; }
  if (hasta < desde) { toastErr('La fecha "hasta" no puede ser anterior a "desde".'); return; }
  if (diasDelRango(desde, hasta).length > MAX_DIAS_FOTO) {
    toastErr(`La foto admite hasta ${MAX_DIAS_FOTO} días. Para un mes completo, usá el Excel.`);
    return;
  }

  const btn = document.getElementById('xl-btn');
  const txt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    toastInfo('Generando la foto…');
    const { fotos, vacios } = await generarFotos({ desde, hasta, terapeutaIds: thId ? [thId] : null });
    if (!fotos.length) { toastErr('No hay citas en ese rango: no se generó ninguna imagen.'); return; }

    const r = await compartirFotos(fotos);
    document.getElementById('export-modal').classList.remove('open');
    const n = fotos.length;
    const cuantas = `${n} imagen${n !== 1 ? 'es' : ''}`;
    if (r === 'compartido') toastOk(`${cuantas} compartida${n !== 1 ? 's' : ''}.`);
    else if (r === 'cancelado') toastInfo('Compartir cancelado. Las imágenes ya estaban listas.');
    else toastOk(`${cuantas} descargada${n !== 1 ? 's' : ''}.`);
    if (vacios) toastInfo(`${vacios} día(s) del rango no tenían citas y se omitieron.`);
  } catch (e) {
    console.error(e);
    toastErr('No se pudo generar la foto: ' + (e && e.message ? e.message : 'error inesperado'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = txt; }
  }
}
