// ── ORD-1: orden del médico referente (tabla public.pedidos_medicos) ──
// PURO: sin DOM ni state (se prueba en node). La orden NO se vincula a un episodio: el informe cita
// la más reciente con fecha <= fin del período. Las fechas son 'YYYY-MM-DD' y se comparan como texto.
// Forma en memoria (mapOrdenRow, utils.js): {id, doctorId, fecha, sesiones, vigenciaHasta, nota, createdAt}.
// Forma en el render-model del informe: {fecha, doctor:'Nombre (spec)'|null, sesiones, vigenciaHasta,
// nota, usadas} — `usadas` = sesiones asistidas desde la fecha de la orden hasta el fin del período.

function _iso(v) {
  if (v instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || ''));
  return m ? m[1] : '';
}
function _dmy(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// La orden que rige al cierre del período: la de mayor fecha con fecha <= fin (mismo día: la
// cargada después). null sin órdenes o si todas son posteriores a fin.
export function ordenAplicable(ordenes, fin) {
  const f = _iso(fin);
  if (!f || !Array.isArray(ordenes)) return null;
  let mejor = null;
  for (const o of ordenes) {
    if (!o?.fecha || o.fecha > f) continue;
    if (!mejor || o.fecha > mejor.fecha
      || (o.fecha === mejor.fecha && String(o.createdAt || '') > String(mejor.createdAt || ''))) mejor = o;
  }
  return mejor;
}

// Vencida = tiene vigencia y la vigencia ya pasó (el último día de vigencia todavía vale).
export function ordenVencida(orden, hoy) {
  return !!orden?.vigenciaHasta && orden.vigenciaHasta < _iso(hoy);
}

// "del 05/09/2026 · Dr. Médico Demo (Traumatología) · 12 sesiones autorizadas · vigente hasta 05/12/2026".
// Sin médico o sin vigencia, esa parte no sale. '' sin orden.
export function textoOrden(o) {
  if (!o?.fecha) return '';
  const n = Number(o.sesiones) || 0;
  return [
    `del ${_dmy(o.fecha)}`,
    o.doctor || '',
    n > 0 ? `${n} ${n === 1 ? 'sesión autorizada' : 'sesiones autorizadas'}` : '',
    o.vigenciaHasta ? `vigente hasta ${_dmy(o.vigenciaHasta)}` : '',
  ].filter(Boolean).join(' · ');
}

// Validación del formulario (espejo de los CHECK de pedidos_medicos). Devuelve {campo: mensaje};
// vacío = válida. Campos: fecha, sesiones, vigencia, nota.
export const ORDEN_SESIONES_MAX = 200;
export const ORDEN_NOTA_MAX = 300;
export function validarOrden({ fecha, sesiones, vigenciaHasta, nota } = {}) {
  const err = {};
  if (!_iso(fecha)) err.fecha = 'Ingresa la fecha de la orden';
  const n = Number(sesiones);
  if (!Number.isInteger(n) || n < 1 || n > ORDEN_SESIONES_MAX) err.sesiones = `Entre 1 y ${ORDEN_SESIONES_MAX} sesiones`;
  if (vigenciaHasta && _iso(fecha) && _iso(vigenciaHasta) < _iso(fecha)) err.vigencia = 'No puede ser anterior a la fecha de la orden';
  if (String(nota || '').length > ORDEN_NOTA_MAX) err.nota = `Máximo ${ORDEN_NOTA_MAX} caracteres`;
  return err;
}

// Orden agotada: ya se usaron todas las sesiones autorizadas. `usadas` viaja en el render-model;
// si falta (modelo armado a mano), se usa el `done` del período.
export function ordenAgotada(orden, done) {
  const n = Number(orden?.sesiones) || 0;
  if (!(n > 0)) return false;
  const usadas = orden.usadas != null ? Number(orden.usadas) || 0 : Number(done) || 0;
  return usadas >= n;
}
