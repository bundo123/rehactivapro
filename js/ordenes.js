// ── ORD-1: modal de órdenes médicas (tabla public.pedidos_medicos) ──
// Lista las órdenes del paciente y registra una nueva. Borrar es solo de admin (espejo de la RLS).
// Sin realtime para esta tabla: la lista en memoria (p.ordenes) se actualiza al escribir acá y se
// recarga entera en el próximo loadAll. La lógica (qué orden aplica, vencida, texto, validación)
// vive en orden-medica.js, que es pura y se prueba en node.
import { state } from './state.js';
import { supa } from './supabase-client.js';
import { esc, fmtDate, getPatient, mapOrdenRow, ordenarOrdenes } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { showFieldError, clearAllErrors } from './validators.js';
import { textoOrden, ordenVencida, validarOrden } from './orden-medica.js';

const CAMPOS = { fecha: 'or-fecha', sesiones: 'or-sesiones', vigencia: 'or-vigencia', nota: 'or-nota' };
let _pid = null;      // paciente del modal abierto
let _guardando = false;

const $ = id => document.getElementById(id);

function _doctorTxt(id) {
  const d = id ? state.doctors.find(x => x.id === id) : null;
  return d ? `${d.name} (${d.spec})` : null;
}

function _pintarLista(p) {
  const box = $('orden-list'); if (!box) return;
  const hoy = fmtDate(new Date());
  const lista = ordenarOrdenes(p.ordenes).reverse();   // la más reciente arriba
  const puedeBorrar = hasPermission('borrarOrden');
  box.innerHTML = lista.length ? lista.map(o => `<div class="orden-item">
      <div class="orden-txt">${esc(textoOrden({ ...o, doctor: _doctorTxt(o.doctorId) }))}${ordenVencida(o, hoy) ? '<span class="orden-venc">VENCIDA</span>' : ''}
        ${o.nota ? `<div class="orden-nota">${esc(o.nota)}</div>` : ''}</div>
      ${puedeBorrar ? `<button class="th-btn del" onclick='borrarOrden(${esc(JSON.stringify(o.id))})'>Eliminar</button>` : ''}
    </div>`).join('')
    : '<div class="orden-empty">Sin órdenes registradas.</div>';
}

// Tras escribir: la orden entra en la fila «Orden médica» del informe y en el pedido sugerido.
function _refrescar() {
  if (state.currentTab === 'paciente_rpt') window._app?.refrescarResumenMedico?.();
}

export function abrirOrdenes(id) {
  if (!hasPermission('registrarOrden')) { toastErr('No tienes permisos para registrar órdenes médicas.'); return; }
  const p = getPatient(id); if (!p) return;
  if (typeof p.id !== 'string') { toastErr('Guarda primero el paciente.'); return; }
  if (!Array.isArray(p.ordenes)) p.ordenes = [];
  _pid = p.id;
  clearAllErrors(Object.values(CAMPOS));
  $('orden-modal-title').textContent = `Órdenes médicas · ${p.name}`;
  $('or-doctor').innerHTML = '<option value="">Sin médico</option>'
    + state.doctors.map(d => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  $('or-doctor').value = p.doctorId && state.doctors.some(d => d.id === p.doctorId) ? p.doctorId : '';
  $('or-fecha').value = fmtDate(new Date());
  $('or-sesiones').value = String(p.sessions || 10);
  $('or-vigencia').value = '';
  $('or-nota').value = '';
  _pintarLista(p);
  $('orden-modal').classList.add('open');
}

export async function guardarOrden() {
  if (_guardando) return;
  if (!hasPermission('registrarOrden')) { toastErr('No tienes permisos para registrar órdenes médicas.'); return; }
  const p = getPatient(_pid); if (!p) return;
  const f = {
    fecha: $('or-fecha').value, sesiones: $('or-sesiones').value.trim(),
    vigenciaHasta: $('or-vigencia').value || null, nota: $('or-nota').value.trim(),
  };
  clearAllErrors(Object.values(CAMPOS));
  const err = validarOrden(f);
  if (Object.keys(err).length) { Object.entries(err).forEach(([k, msg]) => showFieldError(CAMPOS[k], msg)); return; }
  _guardando = true;
  const btn = $('or-save-btn'); if (btn) btn.disabled = true;
  try {
    const { data, error } = await supa.from('pedidos_medicos').insert({
      patient_id: p.id, doctor_id: $('or-doctor').value || null, fecha: f.fecha,
      sesiones_autorizadas: parseInt(f.sesiones, 10), vigencia_hasta: f.vigenciaHasta, nota: f.nota || null,
    }).select().single();
    if (error) { toastErr('No se pudo registrar la orden: ' + error.message); return; }
    p.ordenes = ordenarOrdenes([...(p.ordenes || []), mapOrdenRow(data)]);
    toastOk('Orden médica registrada');
    $('or-vigencia').value = ''; $('or-nota').value = '';
    _pintarLista(p);
    _refrescar();
  } catch (e) {
    toastErr('Error de conexión al registrar la orden.');
  } finally {
    _guardando = false;
    if (btn) btn.disabled = false;
  }
}

export async function borrarOrden(ordenId) {
  if (!hasPermission('borrarOrden')) { toastErr('Solo el administrador puede eliminar órdenes médicas.'); return; }
  const p = getPatient(_pid); if (!p) return;
  if (!confirm('⚠️ Vas a eliminar esta orden médica. Esta acción es IRREVERSIBLE y no se puede deshacer.\n\n¿Eliminar definitivamente?')) return;
  const { error } = await supa.from('pedidos_medicos').delete().eq('id', ordenId);
  if (error) { toastErr('No se pudo eliminar la orden: ' + error.message); return; }
  p.ordenes = (p.ordenes || []).filter(o => o.id !== ordenId);
  toastOk('Orden médica eliminada');
  _pintarLista(p);
  _refrescar();
}
