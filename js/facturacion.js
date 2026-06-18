import { state } from './state.js';
import { esc, getPatient, getTherapist, getDoctor, fmtDate, getInitials, pendientesActual, lastFinDate } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { dbRegistrarCobro } from './auth.js';
import { updateFacturaBadge } from './agenda.js';

// Filter state persists across realtime re-renders
let _filter = 'todos';
let _search  = '';
let _sort    = 'urgente';

function billingInfo(p, spf) {
  // Episodio-aware (I-4): solo las facturas del episodio ACTUAL (fecha posterior al último
  // 'Fin de episodio'), misma frontera que pendientesActual. Así "Cobro X de Y" y la numeración
  // de cajitas no arrastran cobros de episodios anteriores tras iniciar uno nuevo.
  const lastFin         = lastFinDate(p);
  const facturasEp      = (p.billing.facturas || []).filter(f => !lastFin || (f.fecha || '') > lastFin);
  const sesTotal        = p.sessions || 0;
  const sesYaCobradas   = facturasEp.reduce((s, f) => s + (f.n || 0), 0);
  const sesPend         = pendientesActual(p);
  const cobrosRealizados = facturasEp.length;
  const totalCobros     = Math.floor(sesTotal / spf) + (sesTotal % spf > 0 ? 1 : 0);
  const esCierre        = sesPend > 0 && sesPend < spf && (sesYaCobradas + sesPend) >= sesTotal;
  return { sesTotal, sesYaCobradas, sesPend, cobrosRealizados, totalCobros, esCierre };
}

function matchesSearch(p) {
  if (!_search.trim()) return true;
  const q = _search.toLowerCase();
  return (p.name || '').toLowerCase().includes(q) || (p.cedula || '').includes(q);
}

function applySort(list) {
  if (_sort === 'nombre')   return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (_sort === 'sesiones') return [...list].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
  return [...list].sort((a, b) => pendientesActual(b) - pendientesActual(a));
}

function renderAlertCard(count, visibleCount) {
  if (!count) return '';
  const disabled = visibleCount === 0 ? ' disabled' : '';
  return `
    <div class="fact-alert-card">
      <div class="fact-alert-head">
        <div class="fact-alert-icon">🧾</div>
        <div>
          <div class="fact-alert-title">${count} paciente${count !== 1 ? 's' : ''} listo${count !== 1 ? 's' : ''} para cobrar</div>
          <div class="fact-alert-sub">Márcalos como cobrados una vez recibido el pago.</div>
        </div>
        <button class="fact-alert-cta"${disabled} onclick="marcarTodosFacturados()">Cobrar todos ✓</button>
      </div>
    </div>`;
}

function renderFilterBar(nListos, nCurso) {
  const chips = [
    { key: 'todos',      label: 'Todos' },
    { key: 'listos',     label: 'Listos para cobrar', cnt: nListos },
    { key: 'acumulando', label: 'Acumulando',         cnt: nCurso  },
    { key: 'recientes',  label: 'Cobros recientes' },
  ];
  const chipsHtml = chips.map(c => {
    const active  = _filter === c.key ? ' active' : '';
    const cntHtml = c.cnt != null ? ` <span class="fact-chip-cnt">${c.cnt}</span>` : '';
    return `<button class="fact-chip${active}" data-filter="${c.key}">${esc(c.label)}${cntHtml}</button>`;
  }).join('');
  return `
    <div class="fact-filter-bar">
      <div class="fact-filter-chips">${chipsHtml}</div>
      <input class="fact-search-input" type="text" placeholder="Buscar paciente o cédula…" value="${esc(_search)}">
      <div class="fact-sort-wrap">Ordenar
        <select class="fact-sort-select">
          <option value="urgente" ${_sort === 'urgente'  ? 'selected' : ''}>Más urgente</option>
          <option value="nombre"  ${_sort === 'nombre'   ? 'selected' : ''}>Nombre A–Z</option>
          <option value="sesiones"${_sort === 'sesiones' ? 'selected' : ''}>Más sesiones</option>
        </select>
      </div>
    </div>`;
}

function renderListoRow(p, info) {
  const initials = getInitials(p.name);
  const th       = getTherapist(p.therapistId);
  const doc      = p.doctorId ? getDoctor(p.doctorId) : null;
  const nCita    = info.sesPend;
  const tag      = info.esCierre
    ? `<span class="fact-fp-tag green">✓ Cobro final</span>`
    : `<span class="fact-fp-tag green">Cobro ${info.cobrosRealizados + 1} de ${info.totalCobros}</span>`;
  const cajitas  = Array.from({ length: nCita }, (_, i) =>
    `<div class="fact-fp-box paid">${info.sesYaCobradas + i + 1}</div>`
  ).join('');
  const meta = [
    p.cedula ? `CI: ${esc(p.cedula)}` : null,
    p.email  ? esc(p.email)           : null,
    th       ? esc(th.name)           : null,
    doc      ? `Ref: ${esc(doc.name)}`: null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="fact-fp-row${info.esCierre ? ' final' : ''}">
      <div class="fact-avatar">${esc(initials)}</div>
      <div class="fact-fp-info">
        <div class="fact-fp-name">${esc(p.name)} ${tag}</div>
        <div class="fact-fp-meta">${meta}</div>
        <div class="fact-fp-boxes">
          ${cajitas}
          <span class="fact-progress-lbl">${nCita} sesión${nCita !== 1 ? 'es' : ''} este cobro · ${info.sesTotal} totales prescritas</span>
        </div>
      </div>
      <div class="fact-fp-actions">
        <button class="fact-mark-btn" onclick="emitirFactura('${esc(String(p.id))}')">✓ Cobrado</button>
      </div>
    </div>`;
}

function renderCursoRow(p, info, spf) {
  const initials = getInitials(p.name);
  const th       = getTherapist(p.therapistId);
  const pend     = info.sesPend;
  const faltan   = spf - pend;
  const near     = pend >= spf - 1;
  const cajitas  = Array.from({ length: spf }, (_, i) =>
    `<div class="fact-fp-box${i < pend ? ' paid' : ' pending'}">${info.sesYaCobradas + i + 1}</div>`
  ).join('');
  const miniDots = Array.from({ length: spf }, (_, i) =>
    `<span class="fact-d${i < pend ? ' on' : ''}"></span>`
  ).join('');
  const meta = [
    p.cedula ? `CI: ${esc(p.cedula)}` : null,
    th       ? esc(th.name)           : null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="fact-curso-row">
      <div class="fact-avatar fact-avatar-sm">${esc(initials)}</div>
      <div class="fact-fp-info">
        <div class="fact-fp-name" style="font-size:12.5px">
          ${esc(p.name)}
          <span class="fact-fp-tag blue" style="text-transform:none;letter-spacing:0;font-weight:500">cobro ${info.cobrosRealizados + 1} de ${info.totalCobros}</span>
        </div>
        <div class="fact-fp-meta">${meta}</div>
        <div class="fact-fp-boxes fact-fp-boxes-sm">
          ${cajitas}
          <span class="fact-progress-lbl">Falta${faltan !== 1 ? 'n' : ''} ${faltan}</span>
        </div>
      </div>
      <div class="fact-curso-progress">
        <div class="fact-curso-num${near ? ' near' : ''}">${pend}/${spf}</div>
        <div class="fact-curso-rest">${info.sesTotal} prescritas</div>
        <div class="fact-curso-mini">${miniDots}</div>
      </div>
    </div>`;
}

function renderCobrosRecientes() {
  // Cobros are embedded in state.patients[].billing.facturas (no state.cobros array exists)
  // Schema: { id: cobro_ref, n: n_sessions, fecha: 'YYYY-MM-DD', estado: 'cobrada' }
  const months     = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fullMonths = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const now      = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // 'YYYY-MM'
  const mesNombre = fullMonths[now.getMonth()];

  const cobrosMes = state.patients
    .flatMap(p => (p.billing?.facturas || []).map(f => ({
      fecha: f.fecha || '',
      name:  p.name,
      n:     f.n || 0,
    })))
    .filter(c => c.fecha.startsWith(monthKey))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)); // reciente primero

  if (!cobrosMes.length) {
    return `<div class="fact-empty">
      <div class="fact-empty-icon">📋</div>
      <div class="fact-empty-title">No hay cobros en ${esc(mesNombre)}</div>
      <div class="fact-empty-sub">Aparecerán aquí los cobros que emitas este mes.</div>
    </div>`;
  }

  const totalN  = cobrosMes.reduce((s, c) => s + c.n, 0);
  const items   = cobrosMes.map(c => {
    const [, mon, day] = (c.fecha || '--').split('-');
    const fechaDisplay = mon
      ? `${parseInt(day, 10)} ${months[parseInt(mon, 10) - 1]}`
      : '—';
    return `<div class="fact-hi">
      <span class="fact-hi-date">${fechaDisplay}</span>
      <span class="fact-hi-name">${esc(c.name)}</span>
      <span class="fact-hi-sessions">${c.n} ses.</span>
    </div>`;
  }).join('');

  return `
    <div class="fact-history-card">
      <div class="fact-history-head">
        <span class="fact-sec-dot" style="background:var(--rh-green)"></span>
        <div class="fact-history-title">Cobros recientes</div>
        <div class="fact-history-sub">Cobros de ${esc(mesNombre)} · ${cobrosMes.length} cobro${cobrosMes.length !== 1 ? 's' : ''} · ${totalN} sesiones</div>
      </div>
      <div class="fact-history-list">${items}</div>
    </div>`;
}

function attachFilterListeners() {
  document.querySelectorAll('.fact-chip').forEach(btn => {
    btn.addEventListener('click', () => { _filter = btn.dataset.filter; renderFacturacion(); });
  });
  const searchInput = document.querySelector('.fact-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => { _search = e.target.value; renderFacturacion(); });
  }
  const sortSelect = document.querySelector('.fact-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', e => { _sort = e.target.value; renderFacturacion(); });
  }
}

export function renderFacturacion() {
  updateFacturaBadge();
  const spf = parseInt(document.getElementById('global-spf').value) || 5;

  const listos = state.patients.filter(p => p.billing && pendientesActual(p) >= spf);
  const cierre = state.patients.filter(p => {
    const pend = pendientesActual(p);
    if (!p.billing || pend <= 0 || pend >= spf) return false;
    return billingInfo(p, spf).esCierre;
  });
  const enCurso = state.patients.filter(p => {
    const pend = pendientesActual(p);
    if (!p.billing || pend <= 0 || pend >= spf) return false;
    return !billingInfo(p, spf).esCierre;
  });

  const nListos = listos.length + cierre.length;
  const nCurso  = enCurso.length;
  const totalCobrosHechos = state.patients.reduce((s, p) => s + (p.billing?.facturas?.length || 0), 0);
  const totalSes = state.patients.reduce((s, p) => s + (p.billing?.facturas?.reduce((a, f) => a + f.n, 0) || 0), 0);

  const fListos = applySort([...listos, ...cierre].filter(matchesSearch));
  const fCurso  = applySort(enCurso.filter(matchesSearch));

  const showListos    = _filter === 'todos' || _filter === 'listos';
  const showCurso     = _filter === 'todos' || _filter === 'acumulando';
  const showRecientes = _filter === 'todos' || _filter === 'recientes';
  const searchActive  = _search.trim().length > 0;

  let html = `
    <div class="stats-row">
      <div class="stat">
        <div class="stat-lbl">Por cobrar ahora</div>
        <div class="stat-val" style="color:${nListos ? 'var(--rh-blue-d)' : 'var(--rh-green)'}">${nListos}</div>
        <div class="stat-chg neu">Pacientes listos</div>
      </div>
      <div class="stat">
        <div class="stat-lbl">Acumulando citas</div>
        <div class="stat-val">${nCurso}</div>
        <div class="stat-chg neu">En curso</div>
      </div>
      <div class="stat green">
        <div class="stat-lbl">Total cobros hechos</div>
        <div class="stat-val" style="color:var(--rh-green-d)">${totalCobrosHechos}</div>
        <div class="stat-chg up">Histórico</div>
      </div>
      <div class="stat green">
        <div class="stat-lbl">Sesiones cobradas</div>
        <div class="stat-val" style="color:var(--rh-green-d)">${totalSes}</div>
        <div class="stat-chg up">Histórico</div>
      </div>
    </div>`;

  if (nListos && showListos) html += renderAlertCard(nListos, fListos.length);
  html += renderFilterBar(nListos, nCurso);

  const listosSection = showListos && fListos.length
    ? `<div class="fact-sec listos">
        <div class="fact-sec-title">
          <span class="fact-sec-dot" style="background:var(--rh-green)"></span>
          Listos para cobrar
          <span class="fact-count">${fListos.length} paciente${fListos.length !== 1 ? 's' : ''}</span>
        </div>
        ${fListos.map(p => renderListoRow(p, billingInfo(p, spf))).join('')}
      </div>` : '';

  const cursoSection = showCurso && fCurso.length
    ? `<div class="fact-sec curso">
        <div class="fact-sec-title">
          <span class="fact-sec-dot" style="background:var(--rh-blue)"></span>
          Acumulando citas
          <span class="fact-count">${fCurso.length} paciente${fCurso.length !== 1 ? 's' : ''}</span>
        </div>
        ${fCurso.map(p => renderCursoRow(p, billingInfo(p, spf), spf)).join('')}
      </div>` : '';

  const recientesSection = showRecientes ? renderCobrosRecientes() : '';

  const hasContent = listosSection || cursoSection || recientesSection;

  if (!hasContent) {
    if (searchActive) {
      html += `<div class="fact-empty">
        <div class="fact-empty-icon">🔍</div>
        <div class="fact-empty-title">No hay pacientes que coincidan con la búsqueda.</div>
      </div>`;
    } else if (!nListos && !nCurso) {
      html += `<div class="fact-empty">
        <div class="fact-empty-icon">✓</div>
        <div class="fact-empty-title">Todo al día</div>
        <div class="fact-empty-sub">No hay cobros pendientes en este momento.</div>
      </div>`;
    }
  } else {
    html += listosSection + cursoSection + recientesSection;
  }

  document.getElementById('facturacion-content').innerHTML = html;
  attachFilterListeners();
}

export async function emitirFactura(patientId) {
  if (!hasPermission('emitirFactura')) { toastErr('No tienes permisos para emitir cobros.'); return; }
  const p = getPatient(patientId); if (!p || !p.billing) return;
  const n = pendientesActual(p);
  const fId = 'F' + (++state.facturaCounter).toString().padStart(3, '0');
  const today = fmtDate(new Date());
  // Registrar el cobro mueve pendientesActual a 0 por sí solo (cobradas del episodio += n).
  p.billing.facturas.push({ id: fId, n, fecha: today, estado: 'cobrada' });
  updateFacturaBadge(); renderFacturacion();
  const { error } = await dbRegistrarCobro(p.id, n, fId);
  if (error) {
    p.billing.facturas = p.billing.facturas.filter(f => f.id !== fId);
    state.facturaCounter--;
    updateFacturaBadge(); renderFacturacion();
    toastErr('Error al registrar el cobro. Refresca la página.');
    return;
  }
  toastOk(`Cobro ${fId} registrado — ${n} sesiones de ${p.name}`);
  simEmailFactura(p.name, p.email || '', fId, n);
}

export async function marcarTodosFacturados() {
  if (!hasPermission('emitirFactura')) { toastErr('No tienes permisos para emitir cobros.'); return; }
  const spf = parseInt(document.getElementById('global-spf').value) || 5;
  const listos = state.patients.filter(p => {
    if (!p.billing) return false;
    const pend = pendientesActual(p);
    return pend >= spf ||
      (pend > 0 && (p.billing.facturas.reduce((s, f) => s + f.n, 0) + pend) >= p.sessions);
  });
  const paracobrar = listos.filter(matchesSearch);
  if (!paracobrar.length) return;
  if (!confirm(`¿Cobrar a ${paracobrar.length} paciente${paracobrar.length !== 1 ? 's' : ''}?`)) return;
  for (const p of paracobrar) { await emitirFactura(p.id); }
}

export function simEmailFactura(nombre, email, fId = '', n = 5) {
  const correo = email ? `📧 ${email}` : '📧 Sin correo registrado — agrégalo en el perfil';
  alert(`✅ ${nombre} marcado como cobrado\n\nFactura ${fId}  ·  ${n} sesiones\n${correo}\n\n💡 Con backend: genera XML/SRI y envía comprobante automáticamente.`);
}
