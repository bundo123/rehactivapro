// ── SEGUIMIENTO ──
// Auditoría de SOLO LECTURA: qué días se atendió a un paciente activo y no quedó nada escrito en
// su historia. El cruce es día a día, no de totales — ver el bloque de utils.js. Todo el cálculo
// es client-side sobre lo que loadAll ya trajo (p.log y state.appointments): esta pantalla NO
// agrega ni una query. El agregador puro (detalleSeguimiento / diasSinRegistro / filasSeguimiento)
// vive en utils.js y se testea en test/seguimiento.test.js; acá queda el render y el desplegable.
import { state } from './state.js';
import { esc, fmtDate, normalizeSearch, getTherapist, orderedTherapists, filasSeguimiento, pasaFiltroSeguimiento,
  contarSeguimiento, mesesSeguimiento, resumenDocumentacion } from './utils.js';
import { toastErr } from './toast.js';
import { canAccessTab, hasPermission } from './permissions.js';

// Una sola fila expandida a la vez: el detalle es largo y dos abiertos a la vez no dejan comparar.
let _expandedId = null;
let _segSearchTimeout = null;

export function setupSeguimientoSearch() {
  const input = document.getElementById('seg-search');
  if (!input || input.dataset.searchReady) return;
  input.dataset.searchReady = '1';
  input.addEventListener('input', () => {
    clearTimeout(_segSearchTimeout);
    if (!input.value.trim()) { renderSeguimiento(); return; }
    _segSearchTimeout = setTimeout(renderSeguimiento, 300);
  });
  // SEG-2: período y terapeuta. Mismo guard que la búsqueda: se cablea una sola vez.
  document.getElementById('seg-mes')?.addEventListener('change', e => {
    state.seguimientoMes = e.target.value || null;
    _expandedId = null;
    renderSeguimiento();
  });
  document.getElementById('seg-terapeuta')?.addEventListener('change', e => {
    _setTerapeuta(e.target.value || null);
  });
  // Resumen por terapeuta: tocar una fila filtra por ese terapeuta (mismo camino que el select);
  // tocar la del terapeuta ya filtrado quita el filtro. Delegado: el resumen se re-renderiza entero.
  const res = document.getElementById('seg-resumen');
  const elegirFila = e => {
    const tr = e.target.closest('tr[data-th]');
    if (!tr) return;
    const id = tr.dataset.th;
    _setTerapeuta(String(state.seguimientoTerapeuta) === id ? null : id);
  };
  res?.addEventListener('click', elegirFila);
  res?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    elegirFila(e);
  });
}

function _setTerapeuta(id) {
  state.seguimientoTerapeuta = id;
  _expandedId = null;
  renderSeguimiento();
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
// '2026-09' → 'septiembre 2026'
function fmtMes(ym) {
  const [y, m] = String(ym).split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} ${y}` : String(ym);
}

// Rellena los dos <select>. El mes guardado aparece aunque todavía no tenga citas (el mes actual
// el día 1), y el terapeuta guardado aunque ya no esté en la lista: el select nunca miente sobre
// el filtro que se está aplicando.
function _renderSelects(hoy) {
  const selMes = document.getElementById('seg-mes');
  if (selMes) {
    const meses = mesesSeguimiento(state.appointments, hoy);
    const mes = state.seguimientoMes;
    if (mes && !meses.includes(mes)) { meses.push(mes); meses.sort((a, b) => b.localeCompare(a)); }
    selMes.innerHTML = '<option value="">Todos los meses</option>' +
      meses.map(m => `<option value="${esc(m)}">${esc(fmtMes(m))}</option>`).join('');
    selMes.value = mes || '';
  }
  const selTh = document.getElementById('seg-terapeuta');
  if (selTh) {
    const ths = orderedTherapists();
    const th = state.seguimientoTerapeuta;
    const extra = th != null && !ths.some(t => String(t.id) === String(th))
      ? `<option value="${esc(th)}">${esc(getTherapist(th)?.name || 'Terapeuta')}</option>` : '';
    selTh.innerHTML = '<option value="">Todos los terapeutas</option>' +
      ths.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('') + extra;
    selTh.value = th != null ? String(th) : '';
  }
}

// % de días sin registro: verde ≤10, ámbar 11–30, rojo >30.
function _clasePct(pct) {
  return pct <= 10 ? 'seg-res-ok' : pct <= 30 ? 'seg-res-warn' : 'seg-res-bad';
}

// Tabla chica por terapeuta, solo para quien tiene 'verResumenEquipo' (admin). Sobre TODOS los
// pacientes del mes elegido, no sobre las filas visibles: es el número que cuadra con el SQL.
function _renderResumen(hoy) {
  const box = document.getElementById('seg-resumen');
  if (!box) return;
  if (!hasPermission('verResumenEquipo')) { box.hidden = true; box.innerHTML = ''; return; }
  const filas = resumenDocumentacion(state.patients, state.appointments, hoy, state.seguimientoMes || null);
  box.hidden = false;
  if (!filas.length) {
    box.innerHTML = '<div class="seg-res-empty">Sin días atendidos en este período.</div>';
    return;
  }
  const sel = state.seguimientoTerapeuta;
  box.innerHTML = `<table class="seg-res-table">
    <thead><tr><th>Terapeuta</th><th>Días atendidos</th><th>Sin registro</th><th>%</th></tr></thead>
    <tbody>${filas.map(r => {
      // "Sin terapeuta" no se puede elegir: el filtro null significa "todos".
      const elegible = r.therapistId != null;
      const activa = elegible && String(sel) === String(r.therapistId);
      const nombre = r.therapistId != null ? (getTherapist(r.therapistId)?.name || 'Terapeuta') : 'Sin terapeuta';
      const attrs = elegible
        ? ` data-th="${esc(r.therapistId)}" tabindex="0" role="button" aria-pressed="${activa}" title="${activa ? 'Quitar el filtro' : 'Filtrar por este terapeuta'}"`
        : '';
      return `<tr class="seg-res-row${elegible ? ' elegible' : ''}${activa ? ' activa' : ''}"${attrs}>
        <td class="seg-res-name">${esc(nombre)}</td>
        <td class="seg-res-num">${r.dias}</td>
        <td class="seg-res-num">${r.sinRegistro}</td>
        <td class="seg-res-num"><span class="seg-res-pct ${_clasePct(r.pct)}">${r.pct}%</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

export function setSeguimientoFilter(filtro) {
  state.seguimientoFilter = filtro;
  _expandedId = null;            // el detalle abierto puede no estar en el filtro nuevo
  renderSeguimiento();
}

export function toggleSeguimientoDetalle(id) {
  _expandedId = String(_expandedId) === String(id) ? null : String(id);
  renderSeguimiento();
}

// Salta al Informe del paciente. Mismo mecanismo que verInformeDeCita: showTab PRIMERO (al entrar
// a paciente_rpt se ejecuta renderPatientReportSelect, que resetea la selección) y recién después
// selectRptPatient, que es lo que la conserva.
export function verPacienteSeguimiento(id) {
  if (!canAccessTab('paciente_rpt')) { toastErr('No tienes permisos para acceder a esta sección'); return; }
  window._app.showTab('paciente_rpt');
  window._app.selectRptPatient(id);
}

// '2026-08-10' → '10/08/2026'. La fecha del log y de las citas siempre viene ISO desde la DB.
function fmtFechaCorta(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso || '');
}

function _detalleHtml(fila) {
  const filas = fila.detalle.map(d => {
    const th = d.therapistId != null ? getTherapist(d.therapistId) : null;
    const quien = th?.name || 'Sin terapeuta';
    const extra = d.citas > 1 ? ` <span class="segd-extra">· ${d.citas} citas</span>` : '';
    return `<li class="segd-item${d.registrado ? '' : ' falta'}">
      <span class="segd-fecha">${esc(fmtFechaCorta(d.date))}</span>
      <span class="segd-th">${esc(quien)}${extra}</span>
      <span class="segd-estado">${d.registrado ? '✓ Registrado' : '🔴 Sin registro'}</span>
    </li>`;
  }).join('');
  return `<tr class="seg-detalle-row"><td colspan="5">
    <div class="segd-wrap">
      <div class="segd-title">Citas pasadas, día a día</div>
      <ul class="segd-list">${filas}</ul>
    </div>
  </td></tr>`;
}

export function renderSeguimiento() {
  const tbody = document.getElementById('seg-tbody');
  if (!tbody) return;

  const hoy = fmtDate(new Date());
  _renderSelects(hoy);
  _renderResumen(hoy);
  const filtroPeriodo = { mes: state.seguimientoMes || null, therapistId: state.seguimientoTerapeuta ?? null };
  const filas  = filasSeguimiento(state.patients, state.appointments, hoy, filtroPeriodo);
  const counts = contarSeguimiento(filas);
  const filtro = state.seguimientoFilter || 'con';
  document.querySelectorAll('.seg-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filtro);
    const c = b.querySelector('.seg-count');
    if (c) c.textContent = counts[b.dataset.filter] ?? 0;
  });

  const q  = (document.getElementById('seg-search')?.value || '').trim();
  const nq = normalizeSearch(q);
  const vis = filas.filter(f => pasaFiltroSeguimiento(f, filtro) && (!nq || normalizeSearch(f.name).includes(nq)));

  if (!vis.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-patient-row">${
      nq ? `No se encontraron pacientes activos con "${esc(q)}".` : 'No hay días atendidos en este período.'
    }</td></tr>`;
    return;
  }

  // El detalle abierto se cierra solo si su paciente dejó de estar visible (filtro o búsqueda).
  if (_expandedId != null && !vis.some(f => String(f.id) === _expandedId)) _expandedId = null;

  tbody.innerHTML = vis.map(f => {
    const abierto = String(f.id) === _expandedId;
    const idJson  = esc(JSON.stringify(String(f.id)));
    const dias = f.diasSinRegistro > 0
      ? `<span class="seg-falta-badge">${f.diasSinRegistro}</span>`
      : '<span class="seg-ok">✓</span>';
    return `<tr class="seg-row${abierto ? ' abierta' : ''}" onclick="toggleSeguimientoDetalle(${idJson})" title="Ver el detalle día a día">
      <td class="pl-name"><span class="pname-row"><span class="segd-caret">${abierto ? '▾' : '▸'}</span><span class="pl-pname" title="${esc(f.name)}">${esc(f.name)}</span></span></td>
      <td class="seg-num" data-label="Sesiones">${f.sesiones}</td>
      <td class="seg-num" data-label="Citas pasadas">${f.citasPasadas}</td>
      <td class="seg-num" data-label="Días sin registro">${dias}</td>
      <td class="pl-action-cell" data-label="Acciones">
        <div class="pl-actions">
          <button class="ver-btn pl-act-btn" onclick="event.stopPropagation();verPacienteSeguimiento(${idJson})">Ver</button>
        </div>
      </td>
    </tr>${abierto ? _detalleHtml(f) : ''}`;
  }).join('');
}
