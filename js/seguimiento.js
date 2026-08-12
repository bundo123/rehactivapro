// ── SEGUIMIENTO ──
// Auditoría de SOLO LECTURA: qué días se atendió a un paciente activo y no quedó nada escrito en
// su historia. El cruce es día a día, no de totales — ver el bloque de utils.js. Todo el cálculo
// es client-side sobre lo que loadAll ya trajo (p.log y state.appointments): esta pantalla NO
// agrega ni una query. El agregador puro (detalleSeguimiento / diasSinRegistro / filasSeguimiento)
// vive en utils.js y se testea en test/seguimiento.test.js; acá queda el render y el desplegable.
import { state } from './state.js';
import { esc, fmtDate, normalizeSearch, getTherapist, filasSeguimiento, pasaFiltroSeguimiento, contarSeguimiento } from './utils.js';
import { toastErr } from './toast.js';
import { canAccessTab } from './permissions.js';

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

  const filas  = filasSeguimiento(state.patients, state.appointments, fmtDate(new Date()));
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
      nq ? `No se encontraron pacientes activos con "${esc(q)}".` : 'No hay pacientes activos en este filtro.'
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
