// ── HISTORIAL DE CITAS ──
// Pantalla de SOLO LECTURA que contesta en segundos "¿cuántas veces ha venido este paciente?".
// Todo el cálculo vive en js/historial-calc.js (puro y testeado); acá quedan el render, los
// controles y las dos salidas (imprimir con membrete y CSV), que consumen EXACTAMENTE el mismo
// modelo que la tabla — por eso no pueden discrepar entre sí.
//
// No agrega ni una query: loadAll ya trajo todas las citas y el log de cada paciente. Filtrar por
// paciente es O(n) sobre state.appointments (~13k citas/año → menos de 1 ms), y los mapas caros
// (episodio por cita, ordinal por cita) se calculan UNA vez por render y no dentro del .map de las
// filas, igual que hace la agenda con ordinalesDeCitas.
import { state } from './state.js';
import {
  esc, fmtTime, fmtFechaCorta, dmy, getTherapist, getDoctor, normalizeSearch,
  getDisplayAge, diagConCie, dotColor, fmtDate, MES_LARGO, CONFIG_CLINICA,
} from './utils.js';
import {
  episodiosDePaciente, citasDePaciente, episodioDeCita, ordinalesHistorial,
  estadoHistorial, resumenHistorial, filtrarHistorial, agruparPorMes,
  filasCsvHistorial, tipoAbbr,
} from './historial-calc.js';
import { crearComboPaciente } from './patient-combo.js';
import { canAccessTab, hasPermission } from './permissions.js';
import { toastErr } from './toast.js';
import { openPdfWindow } from './informes.js';
import { LOGO_DATA_URI } from './pdf-logo.js';

const FILTRO_LIMPIO = { corte: 'all', mes: 'all', estado: 'all' };
let _combo = null;

// ── Puerta ÚNICA de entrada ──
// La usan el modal de cita, el side-card del informe y el chip del buscador global. El nav entra
// por showTab('historial') a secas, que conserva el paciente que ya estaba (§2.3): si venías de una
// cita y volvés por el menú, no se te borra la consulta.
export function irAHistorial(patientId) {
  if (!canAccessTab('historial')) { toastErr('No tienes permisos para acceder a esta sección'); return; }
  state.historialPatientId = patientId != null ? String(patientId) : state.historialPatientId;
  state.historialFiltro = { ...FILTRO_LIMPIO };   // el corte de un paciente no significa nada en otro
  window._app.showTab('historial');               // showTab → renderHistorial()
}

// Se llama una vez al arrancar (main.js), junto a setupSeguimientoSearch: el combo se cablea sobre
// elementos que ya están en el HTML y sobrevive a los re-render, que solo tocan #hist-content.
export function setupHistorial() {
  _combo = crearComboPaciente({
    inputId: 'hist-search',
    resultsId: 'hist-results',
    hiddenId: 'hist-select',
    onSelect: (id) => {
      state.historialPatientId = String(id);
      state.historialFiltro = { ...FILTRO_LIMPIO };
      renderHistorial();
    },
  });
}

function _pacienteActual() {
  const pid = state.historialPatientId;
  if (pid == null) return null;
  // Comparación por String: los ids del state mezclan números y uuids según de dónde vengan.
  return state.patients.find(x => String(x.id) === String(pid)) || null;
}

// ── Controles ──
export function setHistorialCorte(corte) {
  const f = state.historialFiltro || { ...FILTRO_LIMPIO };
  f.corte = corte === 'all' ? 'all' : parseInt(corte, 10);
  // El mes elegido puede no existir dentro del corte nuevo, y ahí la tabla quedaría vacía sin que
  // se entienda por qué. Se conserva solo si sigue teniendo citas; si no, vuelve a "Todos".
  const p = _pacienteActual();
  if (p && f.mes !== 'all') {
    const citas = citasDePaciente(state.appointments, p.id);
    const eps = episodiosDePaciente(p);
    const mapa = new Map(citas.map(c => [c, episodioDeCita(c, eps)]));
    if (!filtrarHistorial(citas, mapa, { corte: f.corte, mes: f.mes, estado: 'all' }).length) f.mes = 'all';
  }
  state.historialFiltro = f;
  renderHistorial();
}

export function setHistorialMes(mes) {
  state.historialFiltro = { ...(state.historialFiltro || FILTRO_LIMPIO), mes: mes || 'all' };
  renderHistorial();
}

export function setHistorialEstado(estado) {
  state.historialFiltro = { ...(state.historialFiltro || FILTRO_LIMPIO), estado: estado || 'all' };
  renderHistorial();
}

// ── Helpers de presentación ──

// Días enteros entre dos fechas 'YYYY-MM-DD'. Se construyen como fechas LOCALES (no `new Date(iso)`,
// que se interpreta en UTC y en Quito devolvería el día anterior) — misma precaución que fmtFechaCorta.
function _diasEntre(desde, hasta) {
  const a = String(desde).split('-').map(Number);
  const b = String(hasta).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3) return null;
  return Math.round((new Date(b[0], b[1] - 1, b[2]) - new Date(a[0], a[1] - 1, a[2])) / 86400000);
}

// "hoy" / "ayer" / "hace 3 días" / "hace 2 meses". relativeTime (utils.js) trabaja sobre timestamps
// y acá lo que hay son fechas sueltas, así que el texto se arma en días.
function _haceCuanto(fecha, hoy) {
  const d = _diasEntre(fecha, hoy);
  if (d == null) return '—';
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 31) return `hace ${d} días`;
  const m = Math.round(d / 30);
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.round(d / 365)} año${d >= 730 ? 's' : ''}`;
}

const _etiquetaEp = (ep) => (ep?.actual ? 'Episodio actual' : `Episodio ${ep?.idx ?? '?'}`);
const _labelMes = (ym) => `${MES_LARGO[parseInt(ym.slice(5, 7), 10) - 1] || ym} ${ym.slice(0, 4)}`;
const _plural = (n, sing, plur) => `${n} ${n === 1 ? sing : plur}`;

// Texto del N° de una fila. En un mes donde el corte de episodio cayó al medio, las citas del
// episodio VIEJO llevan el prefijo (E1·7/20) y las del actual van limpias (12/15): así se ve de un
// vistazo que los dos números no cuentan la misma serie.
function _textoOrdinal(ord, mezclado, epActualIdx) {
  if (!ord) return '—';
  const base = ord.n ? `${ord.x}/${ord.n}` : String(ord.x);
  return mezclado && ord.ep !== epActualIdx ? `E${ord.ep}·${base}` : base;
}

// ── Modelo de la pantalla (impuro: lee state) ──
// Una sola construcción para la tabla, la impresión y el CSV.
function _modelo() {
  const p = _pacienteActual();
  if (!p) return null;
  const hoy = fmtDate(new Date());
  const citas = citasDePaciente(state.appointments, p.id);
  const eps = episodiosDePaciente(p);
  const epsPorCita = new Map(citas.map(c => [c, episodioDeCita(c, eps)]));
  // Los ordinales se calculan sobre TODAS las citas, no sobre las filtradas: el número de sesión de
  // una cita no puede cambiar porque el usuario haya filtrado por mes.
  const ordinales = ordinalesHistorial(citas, eps);
  const filtro = state.historialFiltro || { ...FILTRO_LIMPIO };

  // Las tarjetas responden al CORTE (el episodio elegido), no a los filtros de mes/estado: el
  // número grande contesta "cuántas veces vino", no "cuántas filas estoy viendo".
  const delCorte = filtrarHistorial(citas, epsPorCita, { ...FILTRO_LIMPIO, corte: filtro.corte }, hoy);
  const visibles = filtrarHistorial(citas, epsPorCita, filtro, hoy);

  return {
    p, hoy, citas, eps, epsPorCita, ordinales, filtro,
    delCorte, visibles,
    resumen: resumenHistorial(delCorte, hoy),
    grupos: agruparPorMes(visibles, epsPorCita, hoy),
    meses: [...new Set(delCorte.map(c => String(c.date).slice(0, 7)))].sort().reverse(),
    epActual: eps[eps.length - 1] || null,
  };
}

// ── Render ──
export function renderHistorial() {
  const out = document.getElementById('hist-content');
  if (!out) return;
  const m = _modelo();
  if (!m) {
    _combo?.setValue('');
    out.innerHTML = '<div class="hist-empty">Buscá un paciente para ver su historial.</div>';
    return;
  }
  // El combo se sincroniza en cada render porque a esta pantalla se puede llegar sin tocarlo
  // (desde una cita, desde el informe, desde el buscador global).
  _combo?.setValue(m.p.id);
  out.innerHTML = _cabeceraHtml(m) + _controlesHtml(m) + _tablaHtml(m);
}

function _cabeceraHtml(m) {
  const { p, resumen: r, filtro, eps } = m;
  const th = getTherapist(p.therapistId);
  const doc = p.doctorId ? getDoctor(p.doctorId) : null;
  const meta = [getDisplayAge(p), diagConCie(p.diag || 'Sin diagnóstico', p.cie10), th?.name, doc ? `Dr. ${doc.name}` : '']
    .filter(Boolean).map(esc).join(' · ');
  const pidJs = esc(JSON.stringify(p.id));

  // Sub-texto del número grande: en un corte por episodio dice contra qué plan se está midiendo.
  const epCorte = filtro.corte === 'all' ? null : eps.find(e => e.idx === filtro.corte);
  const subAsist = !epCorte ? 'histórico'
    : (epCorte.plan ? `de ${epCorte.plan} del plan` : 'del episodio');

  const stat = (lbl, val, chg) =>
    `<div class="stat"><div class="stat-lbl">${lbl}</div><div class="stat-val">${val}</div><div class="stat-chg neu">${chg}</div></div>`;

  return `<div class="hist-head">
    <div class="hist-head-top">
      <div class="hist-ident">
        <div class="hist-pname">${esc(p.name || 'Paciente')}</div>
        <div class="hist-pmeta">${meta}</div>
      </div>
      <div class="hist-head-actions">
        <button class="exp-btn" onclick="verPacienteSeguimiento(${pidJs})">Ver informe</button>
        ${hasPermission('createAppt') ? `<button class="add-btn" onclick="agendarCitaParaPaciente(${pidJs})">+ Cita</button>` : ''}
      </div>
    </div>
    <div class="stats-row hist-stats">
      ${stat('Asistencias', r.asistencias, esc(subAsist))}
      ${stat('Inasistencias', r.inasistencias, r.pctInasistencia == null ? '—' : `${r.pctInasistencia}% de las decididas`)}
      ${stat('Próximas', r.proximas, r.proxima ? esc(fmtFechaCorta(r.proxima)) : '—')}
      ${stat('Última vez', r.ultima ? esc(_haceCuanto(r.ultima, m.hoy)) : '—', r.ultima ? esc(dmy(r.ultima)) : 'sin asistencias')}
    </div>
  </div>`;
}

function _controlesHtml(m) {
  const { eps, epsPorCita, citas, filtro, meses, hoy } = m;
  // Un chip por episodio, del más nuevo al más viejo, con sus asistencias adentro: así el "por
  // episodio" se contesta sin abrir nada. El diagnóstico va en el title.
  const chipsCorte = [...eps].reverse().map(e => {
    const suyas = citas.filter(c => epsPorCita.get(c) === e.idx);
    const asist = resumenHistorial(suyas, hoy).asistencias;
    const n = e.plan ? `${asist}/${e.plan}` : String(asist);
    const on = filtro.corte === e.idx ? ' active' : '';
    return `<button class="filter-pill${on}" title="${esc(e.diag || '')}" onclick="setHistorialCorte(${e.idx})">${esc(_etiquetaEp(e))} · ${esc(n)}</button>`;
  }).join('');

  const opsMes = ['<option value="all">Todos los meses</option>']
    .concat(meses.map(ym => `<option value="${esc(ym)}"${filtro.mes === ym ? ' selected' : ''}>${esc(_labelMes(ym))}</option>`))
    .join('');

  const pillEstado = (val, txt) =>
    `<button class="filter-pill${filtro.estado === val ? ' active' : ''}" onclick="setHistorialEstado('${val}')">${txt}</button>`;

  return `<div class="hist-controls">
    <div class="hist-ctl-row">
      <span class="hist-ctl-lbl">Corte</span>
      <div class="filter-pill-group">
        <button class="filter-pill${filtro.corte === 'all' ? ' active' : ''}" onclick="setHistorialCorte('all')">Histórico</button>
        ${chipsCorte}
      </div>
    </div>
    <div class="hist-ctl-row">
      <span class="hist-ctl-lbl">Mes</span>
      <select class="hdr-select" onchange="setHistorialMes(this.value)">${opsMes}</select>
      <span class="hist-ctl-lbl">Estado</span>
      <div class="filter-pill-group">
        ${pillEstado('all', 'Todas')}${pillEstado('asistio', 'Asistió')}${pillEstado('noas', 'No asistió')}${pillEstado('pend', 'Pendiente')}
      </div>
      <div class="hist-exports">
        <button class="exp-btn" onclick="exportarHistorialPDF()">Imprimir</button>
        <button class="exp-btn" onclick="exportarHistorialCSV()">Exportar CSV</button>
      </div>
    </div>
  </div>`;
}

function _tablaHtml(m) {
  const { grupos, ordinales, filtro, eps, citas, hoy } = m;
  const epActualIdx = m.epActual?.idx ?? null;
  const cabecera = `<thead><tr>
    <th style="width:17%">Fecha</th><th style="width:9%">Hora</th><th style="width:24%">Terapeuta</th>
    <th style="width:12%">Tipo</th><th style="width:8%">Mod</th><th style="width:19%">Estado</th><th style="width:11%">N°</th>
  </tr></thead>`;

  if (!grupos.length) {
    const vacio = citas.length ? 'No hay citas con estos filtros.' : 'Sin citas registradas.';
    return `<div class="hist-table-card"><table class="patient-table hist-table">${cabecera}
      <tbody><tr><td colspan="7" class="empty-patient-row">${vacio}</td></tr></tbody></table></div>`;
  }

  // Etiqueta de episodio en la fila de mes: solo en "Histórico" (en un corte ya se sabe cuál es) y
  // solo cuando cambia respecto del mes de arriba, para no repetirla en cada fila.
  let epPrevio = null;
  const filas = grupos.map(g => {
    const mezclado = g.episodios.length > 1;
    let etiqueta = '';
    if (filtro.corte === 'all' && eps.length > 1) {
      if (mezclado) etiqueta = g.episodios.map(i => _etiquetaEp(eps.find(e => e.idx === i))).join(' → ');
      else if (g.episodios.length === 1 && g.episodios[0] !== epPrevio) etiqueta = _etiquetaEp(eps.find(e => e.idx === g.episodios[0]));
    }
    epPrevio = g.episodios.length ? g.episodios[0] : epPrevio;

    const sub = [
      _plural(g.resumen.asistencias, 'asistencia', 'asistencias'),
      _plural(g.resumen.inasistencias, 'inasistencia', 'inasistencias'),
    ].concat(g.resumen.proximas ? [_plural(g.resumen.proximas, 'próxima', 'próximas')] : []).join(' · ');

    const filaMes = `<tr class="hist-mes"><td colspan="7">
      <span class="hist-mes-lbl">${esc(g.label)}</span>
      <span class="hist-mes-sub">${esc(sub)}</span>
      ${etiqueta ? `<span class="hist-mes-ep">${esc(etiqueta)}</span>` : ''}
    </td></tr>`;

    const filasCitas = g.citas.map(a => {
      const th = getTherapist(a.therapistId);
      const est = estadoHistorial(a, hoy);
      const ord = ordinales.get(a);
      const dom = a.location === 'domicilio';
      // JSON.stringify y no String(): openEditApptModal busca la cita con === y los ids mezclan
      // números (optimistas) con uuids, así que hay que conservar el tipo.
      return `<tr class="hist-row" onclick="openEditApptModal(${esc(JSON.stringify(a.id))})" title="Abrir la cita">
        <td class="hist-fecha">${esc(fmtFechaCorta(a.date))}</td>
        <td data-label="Hora" class="hist-num">${esc(fmtTime(a.hour))}</td>
        <td data-label="Terapeuta">${esc(th?.name || '—')}</td>
        <td data-label="Tipo" class="hist-tipo">${esc(tipoAbbr(a.type))}</td>
        <td data-label="Modalidad" class="hist-num"><span title="${dom ? 'Domicilio' : 'Centro'}">${dom ? 'D' : 'C'}</span></td>
        <td data-label="Estado"><span class="hist-dot" style="background:${dotColor(a.status)}"></span>${esc(est.label)}</td>
        <td data-label="N°" class="hist-num">${esc(_textoOrdinal(ord, mezclado, epActualIdx))}</td>
      </tr>`;
    }).join('');

    return filaMes + filasCitas;
  }).join('');

  return `<div class="hist-table-card"><table class="patient-table hist-table">${cabecera}<tbody>${filas}</tbody></table></div>`;
}

// ── Salidas: imprimir con membrete y CSV ──

// Etiqueta del corte, compartida por la impresión y el nombre del archivo.
function _corteLabel(m) {
  if (m.filtro.corte === 'all') return 'Histórico completo';
  const e = m.eps.find(x => x.idx === m.filtro.corte);
  return e ? `${_etiquetaEp(e)} — ${e.diag}` : 'Histórico completo';
}

// Modelo PLANO para la impresión: filas ya resueltas a texto, sin Maps ni objetos de state, para
// que buildHistorialPrintHtml pueda ser pura (y el día de mañana, testeable sin DOM).
function _modeloImpresion(m) {
  const epActualIdx = m.epActual?.idx ?? null;
  const filtros = [
    m.filtro.mes !== 'all' ? `Mes: ${_labelMes(m.filtro.mes)}` : '',
    m.filtro.estado !== 'all' ? `Estado: ${{ asistio: 'Asistió', noas: 'No asistió', pend: 'Pendiente' }[m.filtro.estado]}` : '',
  ].filter(Boolean).join(' · ');
  return {
    paciente: {
      nombre: m.p.name || '—',
      cedula: m.p.cedula || '',
      edad: getDisplayAge(m.p),
      diagnostico: diagConCie(m.p.diag || '—', m.p.cie10),
    },
    terapeuta: getTherapist(m.p.therapistId)?.name || '—',
    corte: _corteLabel(m),
    filtros,
    fechaLarga: new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }),
    resumen: m.resumen,
    totalFilas: m.visibles.length,
    grupos: m.grupos.map(g => ({
      label: g.label,
      sub: `${_plural(g.resumen.asistencias, 'asistencia', 'asistencias')} · ${_plural(g.resumen.inasistencias, 'inasistencia', 'inasistencias')}`,
      filas: g.citas.map(a => ({
        fecha: dmy(a.date),
        hora: fmtTime(a.hour),
        terapeuta: getTherapist(a.therapistId)?.name || '—',
        tipo: tipoAbbr(a.type),
        mod: a.location === 'domicilio' ? 'Domicilio' : 'Centro',
        estado: estadoHistorial(a, m.hoy).label,
        ord: _textoOrdinal(m.ordinales.get(a), g.episodios.length > 1, epActualIdx),
      })),
    })),
  };
}

// PURA: modelo → HTML del documento imprimible. Mismo look documental que buildPdfHtml
// (informes.js): logo, regla naranja/celeste, gris #1A1A1A/#6B6B66 y pie con CONFIG_CLINICA.
// Sin verdes ni semáforos: eso es lenguaje de pantalla, no de un papel que se entrega.
export function buildHistorialPrintHtml(m) {
  const val = v => { const t = v == null ? '' : String(v).trim(); return t && t !== 'Sin edad' ? esc(t) : '—'; };
  const cell = (lbl, v) => `<div><div class="pd-lbl">${lbl}</div><div class="pd-val">${val(v)}</div></div>`;
  const datos = '<div class="pd-grid">'
    + cell('Nombre', m.paciente.nombre) + cell('Cédula', m.paciente.cedula)
    + cell('Edad', m.paciente.edad) + cell('Diagnóstico', m.paciente.diagnostico)
    + cell('Terapeuta', m.terapeuta) + cell('Corte', m.corte)
    + (m.filtros ? cell('Filtros', m.filtros) : '')
    + '</div>';

  const sumCol = (lbl, v, sub) => `<div><div class="pd-lbl">${lbl}</div><div class="sum-val">${esc(v)}</div><div class="sum-sub">${esc(sub)}</div></div>`;
  const r = m.resumen;
  const resumen = '<div class="sum">'
    + sumCol('Asistencias', r.asistencias, 'citas atendidas')
    + sumCol('Inasistencias', r.inasistencias, r.pctInasistencia == null ? 'sin citas decididas' : `${r.pctInasistencia}% de las decididas`)
    + sumCol('Próximas', r.proximas, r.proxima ? dmy(r.proxima) : 'ninguna agendada')
    + '</div>';

  const cuerpo = m.grupos.map(g =>
    `<tr class="mes"><td colspan="7">${esc(g.label)} — ${esc(g.sub)}</td></tr>`
    + g.filas.map(f => `<tr>
        <td class="nw">${esc(f.fecha)}</td><td class="nw">${esc(f.hora)}</td><td>${esc(f.terapeuta)}</td>
        <td>${esc(f.tipo)}</td><td class="ctr">${esc(f.mod)}</td><td>${esc(f.estado)}</td><td class="ctr">${esc(f.ord)}</td>
      </tr>`).join('')
  ).join('');

  const tabla = m.grupos.length
    ? `<table><thead><tr><th>Fecha</th><th>Hora</th><th>Terapeuta</th><th>Tipo</th><th class="ctr">Modalidad</th><th>Estado</th><th class="ctr">N.º</th></tr></thead><tbody>${cuerpo}</tbody></table>`
    : '<div class="mut" style="padding:10px 0;font-size:11px">Sin citas en este corte.</div>';

  const clinica = ['Rehactiva', 'Centro de rehabilitación y fisioterapia', 'Quito, Ecuador',
    CONFIG_CLINICA.DIRECCION, CONFIG_CLINICA.TELEFONO ? 'Tel. ' + CONFIG_CLINICA.TELEFONO : '', CONFIG_CLINICA.EMAIL]
    .filter(Boolean).map(esc).join(' · ');

  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Historial de citas — ' + esc(m.paciente.nombre) + '</title>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + '@page{margin:15mm}'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1A1A1A;background:#fff;padding:32px;max-width:800px;margin:0 auto}'
    + 'h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1A1A1A;margin:22px 0 10px;padding-bottom:5px;border-bottom:1px solid #D8D8D2;break-after:avoid;page-break-after:avoid}'
    + '.mut{color:#6B6B66}.nw{white-space:nowrap}.ctr{text-align:center}'
    + '.header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}'
    + '.h-right{text-align:right;flex-shrink:0}'
    + '.h-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#1A1A1A}'
    + '.h-meta{font-size:10px;color:#6B6B66;margin-top:4px}'
    + '.rule{display:flex;height:3px;margin-top:12px}.rule-a{width:64px;background:#F09028}.rule-b{flex:1;background:#28A8C8}'
    + '.pd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 18px}'
    + '.pd-lbl{font-size:9px;font-weight:700;color:#6B6B66;text-transform:uppercase;letter-spacing:.06em}'
    + '.pd-val{font-size:12px;color:#1A1A1A;margin-top:2px}'
    + '.sum{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;border-top:1px solid #D8D8D2;border-bottom:1px solid #D8D8D2;padding:12px 0}'
    + '.sum-val{font-size:22px;font-weight:700;color:#1A1A1A;margin:4px 0 2px}'
    + '.sum-sub{font-size:9px;color:#6B6B66}'
    + 'table{width:100%;border-collapse:collapse;margin-top:4px}'
    + 'thead{display:table-header-group}'
    + 'tr{break-inside:avoid;page-break-inside:avoid}'
    + 'th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6B6B66;text-align:left;padding:6px 8px;border-bottom:1px solid #1A1A1A}'
    + 'td{font-size:11px;color:#1A1A1A;padding:6px 8px;border-bottom:1px solid #EAEAE4;vertical-align:top}'
    + 'tr.mes td{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6B6B66;background:#F5F5F0;padding:5px 8px}'
    + '.footer{display:flex;justify-content:space-between;gap:12px;margin-top:28px;padding-top:8px;border-top:1px solid #D8D8D2;font-size:8px;color:#6B6B66}'
    + '.print-btn{margin-top:10px;padding:6px 14px;background:#1A1A1A;color:#fff;border:none;cursor:pointer;font-size:11px;font-family:inherit}'
    + '@media print{body{padding:0;max-width:none}button{display:none}}'
    + '</style></head><body>'
    + '<div class="header"><div><img src="' + LOGO_DATA_URI + '" alt="Rehactiva" style="height:44px;display:block"></div>'
    + '<div class="h-right"><div class="h-title">Historial de citas</div>'
    + '<div class="h-meta">' + esc(m.paciente.nombre) + (m.paciente.cedula ? ' · CI ' + esc(m.paciente.cedula) : '') + '</div>'
    + '<div class="h-meta">' + esc(m.corte) + ' · ' + esc(String(r.asistencias)) + (r.asistencias === 1 ? ' asistencia' : ' asistencias') + '</div>'
    + '<div class="h-meta">Emitido el ' + esc(m.fechaLarga) + '</div>'
    + '<button class="print-btn" onclick="window.print()">Imprimir / Guardar PDF</button></div></div>'
    + '<div class="rule"><div class="rule-a"></div><div class="rule-b"></div></div>'
    + '<h2>Datos del paciente</h2>' + datos
    + '<h2>Resumen</h2>' + resumen
    + '<h2>Detalle de citas (' + m.totalFilas + ')</h2>' + tabla
    + '<div class="footer"><div>' + clinica + '</div><div>Generado por RehactivaPro</div></div>'
    + '</body></html>';
}

export function exportarHistorialPDF() {
  const m = _modelo();
  if (!m) { toastErr('Elegí primero un paciente'); return; }
  openPdfWindow(buildHistorialPrintHtml(_modeloImpresion(m)));
}

// Mismo cuerpo que exportAgendaCSV (agenda.js): BOM para que Excel abra los acentos, comillas
// dobladas, saltos \r\n y descarga por blob. No se inventa otro formato.
export function exportarHistorialCSV() {
  const m = _modelo();
  if (!m) { toastErr('Elegí primero un paciente'); return; }
  const rows = filasCsvHistorial(m.visibles, m.epsPorCita, m.ordinales, getTherapist, m.hoy);
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  // Apellido = última palabra del nombre (en Ecuador el orden es nombres + apellidos). Se pasa por
  // normalizeSearch (utils.js) para sacarle tildes y mayúsculas: es la misma normalización que usa
  // el buscador, y así el nombre del archivo no depende de cómo esté escrito el paciente.
  const apellido = normalizeSearch(String(m.p.name || '').trim().split(/\s+/).pop())
    .replace(/[^a-z0-9]/g, '') || 'paciente';
  link.href = url; link.download = `historial-${apellido}-${m.hoy}.csv`;
  link.click(); URL.revokeObjectURL(url);
}
