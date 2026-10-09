// RESP-1 — Registro estructurado de la sesión (session_log.soap jsonb).
// Empieza por Terapia respiratoria. La sesión guarda cómo llega el paciente (S), los signos antes y
// después, el oxígeno y las secreciones (O), la medicación (I, junto con las técnicas de `tags`), la
// tolerancia (E) y qué sigue en la próxima sesión (P):
//   {v:1, llega, tol, inc, prox, casa, resp:{o2, sv:{sat|fc|fr|borg:[antes,después]}, nomed, sec:{cant,asp}, med:[{f,d}]}}
// El dolor (EVA) sigue en pain_before/pain_after, igual que en fisioterapia.
// La nota SOAPIE NO se guarda: notaSoapie() la arma al vuelo y SIN IA, así lo que se lee es
// exactamente lo registrado (la nota con IA de Kalmed cambió una indicación al reescribirla).
// Sin datos = NULL, nunca {} (session_log_soap_chk). Toda lectura y escritura pasa por soapNormalizar.
import { esc, lastFinDate, normHour, dmy } from './utils.js';

export const TIPO_RESP = 'Terapia respiratoria';

// Catálogo v1, a validar con las terapeutas respiratorias. Se guardan las ETIQUETAS en `tags`
// (como PRO_TECNICAS en fisio): así el detalle, el PDF, el Word y la IA las muestran sin cambios.
export const RESP_TECNICAS = [
  'Drenaje postural', 'Percusión / vibropercusión', 'Vibración manual',
  'Aumento del flujo espiratorio (AFE)', 'Espiración lenta prolongada (ELPr)',
  'Ciclo activo respiratorio (ACBT)', 'Tos asistida / dirigida', 'Aspiración de secreciones',
  'Nebulización / inhaloterapia', 'Presión espiratoria positiva (PEP)', 'Incentivómetro',
  'Respiración diafragmática', 'Labios fruncidos', 'Expansión torácica',
  'Ejercicio de miembros (MMSS/MMII)', 'Sedestación / deambulación',
];

export const LLEGA = [{ id: 'mejor', label: 'Mejor' }, { id: 'igual', label: 'Igual' }, { id: 'peor', label: 'Peor' }];
export const TOLERANCIA = [{ id: 'buena', label: 'Buena' }, { id: 'regular', label: 'Regular' }, { id: 'mala', label: 'Mala' }];
export const PROXIMA = [
  { id: 'continuar', label: 'Continuar igual' }, { id: 'progresar', label: 'Progresar' },
  { id: 'ajustar', label: 'Ajustar' }, { id: 'reevaluar', label: 'Reevaluar' }, { id: 'alta', label: 'Proponer alta' },
];
export const SEC_CANT = [
  { id: 'no', label: 'Sin secreciones' }, { id: 'escasa', label: 'Escasas' },
  { id: 'moderada', label: 'Moderadas' }, { id: 'abundante', label: 'Abundantes' },
];
export const SEC_ASP = [
  { id: 'mucoide', label: 'Mucoides' }, { id: 'mucopurulenta', label: 'Mucopurulentas' },
  { id: 'purulenta', label: 'Purulentas' }, { id: 'hemoptoica', label: 'Con sangre' },
];
export const MEDICACION = [
  { id: 'salbutamol', label: 'Salbutamol' }, { id: 'ipratropio', label: 'Bromuro de ipratropio' },
  { id: 'acetilcisteina', label: 'Acetilcisteína' }, { id: 'ssh', label: 'Solución salina hipertónica' },
  { id: 'ssn', label: 'Solución salina 0,9 %' }, { id: 'budesonida', label: 'Budesonida' },
];
// min/max = dato IMPOSIBLE (error de tipeo), no rangos clínicos ni alertas: el umbral de alerta de
// cada paciente lo fija su médico, no un rango genérico (el 92 % de Kalmed salió sin marca).
export const SIGNOS = [
  { id: 'sat', label: 'SatO₂', unidad: '%', min: 50, max: 100, dec: 0 },
  { id: 'fc', label: 'FC', unidad: 'lpm', min: 30, max: 220, dec: 0 },
  { id: 'fr', label: 'FR', unidad: 'rpm', min: 5, max: 60, dec: 0 },
  { id: 'borg', label: 'Borg disnea', unidad: '/10', min: 0, max: 10, dec: 1 },
];
export const O2_MAX = 15;                        // L/min; 0 = aire ambiente
const MAX_TXT = { inc: 140, casa: 200, nomed: 140, dosis: 30 };

// ── Funciones puras ──────────────────────────────────────────────────────────

const _cat = (lista, v) => (lista.some(x => x.id === v) ? v : null);
const _lab = (lista, id) => lista.find(x => x.id === id)?.label || '';
const _txt = (v, max) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
// Número válido para el signo (redondeado a su precisión) o null si está vacío o es imposible.
function _num(v, s) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < s.min || n > s.max) return null;
  const f = 10 ** s.dec;
  return Math.round(n * f) / f;
}
const _n = v => String(v).replace('.', ',');
const _punto = t => (/[.!?]$/.test(t) ? t : t + '.');
const _may = t => t.replace(/^./, c => c.toUpperCase());

function _respNormalizar(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const out = {};
  const o2 = typeof r.o2 === 'number' ? r.o2 : (r.o2 === '' || r.o2 == null ? NaN : Number(r.o2));
  if (Number.isFinite(o2) && o2 >= 0 && o2 <= O2_MAX) out.o2 = Math.round(o2 * 2) / 2;
  if (r.sv && typeof r.sv === 'object' && !Array.isArray(r.sv)) {
    const sv = {};
    for (const s of SIGNOS) {
      const par = r.sv[s.id];
      if (!Array.isArray(par)) continue;
      const a = _num(par[0], s), d = _num(par[1], s);
      if (a != null || d != null) sv[s.id] = [a, d];
    }
    if (Object.keys(sv).length) out.sv = sv;
  }
  const nomed = _txt(r.nomed, MAX_TXT.nomed);
  if (nomed && !out.sv) out.nomed = nomed;          // el motivo solo tiene sentido sin ningún signo
  if (r.sec && typeof r.sec === 'object') {
    const cant = _cat(SEC_CANT, r.sec.cant);
    if (cant) {
      out.sec = { cant };
      const asp = cant !== 'no' ? _cat(SEC_ASP, r.sec.asp) : null;
      if (asp) out.sec.asp = asp;
    }
  }
  if (Array.isArray(r.med)) {
    const vistos = new Set(), med = [];
    for (const m of r.med) {
      if (!m || typeof m !== 'object') continue;
      const f = _cat(MEDICACION, m.f), d = _txt(m.d, MAX_TXT.dosis);
      if (!f || !d || vistos.has(f)) continue;     // sin dosis no se registra un fármaco
      vistos.add(f);
      med.push({ f, d });
    }
    med.sort((a, b) => MEDICACION.findIndex(x => x.id === a.f) - MEDICACION.findIndex(x => x.id === b.f));
    if (med.length) out.med = med;
  }
  return Object.keys(out).length ? out : null;
}

// Limpia el registro. Se usa AL ESCRIBIR y AL LEER de la DB: descarta en silencio lo que no encaja
// con los catálogos (datos viejos o manipulados). Nunca devuelve {} (la DB lo rechaza).
export function soapNormalizar(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out = {};
  const llega = _cat(LLEGA, x.llega); if (llega) out.llega = llega;
  const tol = _cat(TOLERANCIA, x.tol); if (tol) out.tol = tol;
  const inc = _txt(x.inc, MAX_TXT.inc); if (inc) out.inc = inc;
  const prox = _cat(PROXIMA, x.prox); if (prox) out.prox = prox;
  const casa = _txt(x.casa, MAX_TXT.casa); if (casa) out.casa = casa;
  const resp = _respNormalizar(x.resp); if (resp) out.resp = resp;
  return Object.keys(out).length ? { v: 1, ...out } : null;
}

// Lo mínimo para guardar una sesión respiratoria, en el orden del formulario. [] = completa.
// Es lo que pide la aseguradora (qué se hizo, con qué medición, cómo respondió) y lo que lee el médico.
// hayPrevio: hay una sesión respiratoria anterior en el episodio (respAnterior). En la primera,
// "cómo llega frente a la sesión anterior" no tiene contra qué compararse y no se pide (MINI-1).
export function faltantesResp(soap, tags, hayPrevio = true) {
  const s = soapNormalizar(soap) || {};
  const r = s.resp || {};
  const f = [];
  if (hayPrevio && !s.llega) f.push({ k: 'llega', msg: 'Marca cómo llega el paciente' });
  if (!r.sv && !r.nomed) f.push({ k: 'signos', msg: 'Anota al menos un signo (SatO₂, FC, FR o Borg) o explica por qué no se pudieron tomar' });
  if (!Array.isArray(tags) || !tags.length) f.push({ k: 'tec', msg: 'Marca al menos una técnica' });
  if (!s.tol) f.push({ k: 'tol', msg: 'Marca la tolerancia a la sesión' });
  else if (s.tol === 'mala' && !s.inc) f.push({ k: 'tol', msg: 'Tolerancia mala: cuenta en una línea qué pasó' });
  if (!s.prox) f.push({ k: 'prox', msg: 'Marca qué sigue en la próxima sesión' });
  return f;
}

const _o2Texto = o2 => (o2 === 0 ? 'aire ambiente' : `O₂ ${_n(o2)} L/min`);
function _secTexto(sec) {
  if (sec.cant === 'no') return 'sin secreciones';
  return `secreciones ${_lab(SEC_CANT, sec.cant).toLowerCase()}` + (sec.asp ? `, ${_lab(SEC_ASP, sec.asp).toLowerCase()}` : '');
}
// Signos OBJETIVOS (SatO₂, FC, FR) de la columna i (0 = antes, 1 = después): 'SatO₂ 92 %, FC 88 lpm'.
function _objetivos(sv, i) {
  return SIGNOS.filter(s => s.id !== 'borg' && sv[s.id]?.[i] != null)
    .map(s => `${s.label} ${_n(sv[s.id][i])} ${s.unidad}`).join(', ');
}
function _delta(a, d) {
  const x = Math.round((d - a) * 10) / 10;
  return x > 0 ? `+${_n(x)}` : x < 0 ? `−${_n(-x)}` : 'sin cambio';
}
const _par = (par, u) => `${par[0] != null ? _n(par[0]) : '—'}→${par[1] != null ? _n(par[1]) : '—'}${u ? ' ' + u : ''}`;

// Una línea para la tabla del informe y para la IA:
// 'SatO₂ 92→95 % · FC 88→80 · FR 22→18 · Borg 4→2 · aire ambiente · secreciones moderadas, mucopurulentas · tolerancia buena · próxima: continuar igual'
export function resumenResp(soap) {
  const s = soapNormalizar(soap);
  if (!s) return '';
  const r = s.resp || {}, sv = r.sv || {}, partes = [];
  for (const x of SIGNOS) if (sv[x.id]) partes.push(`${x.id === 'borg' ? 'Borg' : x.label} ${_par(sv[x.id], x.id === 'sat' ? '%' : '')}`);
  if (r.nomed) partes.push(`signos no tomados (${r.nomed})`);
  if (r.o2 != null) partes.push(_o2Texto(r.o2));
  if (r.sec) partes.push(_secTexto(r.sec));
  if (r.med) partes.push('medicación: ' + r.med.map(m => `${_lab(MEDICACION, m.f).toLowerCase()} ${m.d}`).join(', '));
  if (s.tol) partes.push(`tolerancia ${_lab(TOLERANCIA, s.tol).toLowerCase()}` + (s.inc ? ` (${s.inc})` : ''));
  if (s.prox) partes.push(`próxima: ${_lab(PROXIMA, s.prox).toLowerCase()}`);
  return partes.join(' · ');
}

// Nota SOAPIE de UNA sesión, armada solo con lo registrado: [{k:'S'|'O'|'A'|'P'|'I'|'E', t}] en ese
// orden, sin las letras vacías. Cada dato aparece una sola vez: O = cómo llegó, E = cómo terminó,
// A = SOLO comparaciones calculadas (en la sesión y frente a la sesión anterior) y avisos; el juicio
// clínico explícito es la decisión de la P, que elige el terapeuta.
//   fila = sesión {date, pb, pa, tags, soap} · prev = sesión respiratoria anterior del episodio o null
//   ctx  = {n, total} para "Sesión n de total" (opcional)
export function notaSoapie(fila, prev, ctx = {}) {
  const s = soapNormalizar(fila?.soap);
  if (!s) return [];
  const r = s.resp || {}, sv = r.sv || {};
  const out = [];
  const add = (k, frases) => { const t = frases.filter(Boolean).join(' '); if (t) out.push({ k, t }); };

  add('S', [
    // Sin sesión anterior no hay con qué comparar: no se escribe (MINI-1).
    s.llega && prev ? `Llega ${_lab(LLEGA, s.llega).toLowerCase()} que en la sesión anterior.` : null,
    fila.pb != null ? `Dolor ${fila.pb}/10.` : null,
    sv.borg?.[0] != null ? `Disnea (Borg) ${_n(sv.borg[0])}/10.` : null,
  ]);

  const antes = _objetivos(sv, 0);
  const o2 = r.o2 != null ? _o2Texto(r.o2) : '';
  add('O', [
    antes ? `${antes}${o2 ? ` (${o2})` : ''}.` : (o2 ? `Durante la sesión: ${o2}.` : null),
    r.nomed ? `Signos no tomados: ${_punto(_may(r.nomed))}` : null,
    r.sec ? _punto(_may(_secTexto(r.sec))) : null,
  ]);

  const enSesion = SIGNOS.filter(x => sv[x.id]?.[0] != null && sv[x.id]?.[1] != null)
    .map(x => `${x.id === 'borg' ? 'Borg' : x.label} ${_delta(sv[x.id][0], sv[x.id][1])}`);
  const psv = soapNormalizar(prev?.soap)?.resp?.sv || {};
  const frente = SIGNOS.filter(x => x.id !== 'borg' && psv[x.id]?.[0] != null && sv[x.id]?.[0] != null)
    .map(x => `${x.label} ${_n(psv[x.id][0])} → ${_n(sv[x.id][0])} ${x.unidad}`);
  const avisos = [s.llega === 'peor' ? 'llega peor' : null, s.tol === 'mala' ? 'tolerancia mala' : null].filter(Boolean);
  add('A', [
    enSesion.length ? `En la sesión: ${enSesion.join(', ')}.` : null,
    frente.length ? `Al llegar, frente a la sesión del ${dmy(prev.date)}: ${frente.join(', ')}.` : null,
    ctx.n && ctx.total ? `Sesión ${ctx.n} de ${ctx.total}.` : null,
    avisos.length ? `Atención: ${avisos.join(' y ')}.` : null,
  ]);

  add('P', [
    s.prox ? `Próxima sesión: ${_lab(PROXIMA, s.prox).toLowerCase()}.` : null,
    s.casa ? `Para casa: ${_punto(_may(s.casa))}` : null,
  ]);

  const tags = Array.isArray(fila.tags) ? fila.tags.filter(Boolean) : [];
  add('I', [
    tags.length ? `${tags.join(', ')}.` : null,
    r.med ? `Medicación: ${r.med.map(m => `${_lab(MEDICACION, m.f)} ${m.d}`).join(', ')}.` : null,
  ]);

  const despues = _objetivos(sv, 1);
  add('E', [
    despues ? `Al terminar: ${despues}.` : null,
    sv.borg?.[1] != null ? `Disnea (Borg) ${_n(sv.borg[1])}/10.` : null,
    fila.pa != null ? `Dolor ${fila.pa}/10.` : null,
    s.tol ? `Tolerancia ${_lab(TOLERANCIA, s.tol).toLowerCase()}.` : null,
    s.inc ? _punto(_may(s.inc)) : null,
  ]);
  return out;
}

// Sesión RESPIRATORIA más reciente con registro del episodio actual, anterior a (date, hour) si se
// pasa `antesDe`. Misma frontera estricta que doneActual: date > lastFinDate.
export function respAnterior(patient, antesDe) {
  const fin = lastFinDate(patient);
  const clave = s => String(s.date) + 'T' + normHour(s.hour);
  const lim = antesDe ? clave(antesDe) : null;
  const filas = (patient?.log || []).filter(s => s && s.type === TIPO_RESP && (!fin || s.date > fin)
    && soapNormalizar(s.soap)?.resp && (!lim || clave(s) < lim));
  filas.sort((a, b) => clave(b).localeCompare(clave(a)));
  return filas[0] || null;
}

// ── Editor (DOM) — bloque respiratorio del modal de sesión ───────────────────
// Un solo formulario, sin pasos: chips en vez de texto libre y "Igual que la última" para lo que
// se repite entre sesiones (técnicas, oxígeno, medicación, indicaciones para casa). Lo OBSERVADO
// (signos, secreciones, cómo llega, tolerancia) nunca se copia: se mide de nuevo.

const _uno = (root, g) => root.querySelector(`.resp-chips[data-grupo="${g}"] .resp-chip[aria-pressed="true"]`)?.dataset.v || null;
const _varios = (root, g) => [...root.querySelectorAll(`.resp-chips[data-grupo="${g}"] .resp-chip[aria-pressed="true"]`)].map(c => c.dataset.v);
function _marcar(root, g, ids) {
  root.querySelectorAll(`.resp-chips[data-grupo="${g}"] .resp-chip`)
    .forEach(c => c.setAttribute('aria-pressed', String(ids.includes(c.dataset.v))));
}

// Muestra u oculta lo que depende de otra elección (L/min, aspecto, qué pasó, dosis, motivo).
function _sync(root) {
  const lpm = root.querySelector('.resp-lpm');
  if (lpm) lpm.hidden = _uno(root, 'o2') !== 'o2';
  const cant = _uno(root, 'cant');
  const asp = root.querySelector('.resp-chips[data-grupo="asp"]');
  if (asp) {
    asp.hidden = !cant || cant === 'no';
    if (asp.hidden) _marcar(root, 'asp', []);
  }
  const tol = _uno(root, 'tol');
  const inc = root.querySelector('[data-inc]');
  if (inc) inc.hidden = tol !== 'regular' && tol !== 'mala';
  const meds = _varios(root, 'med');
  root.querySelectorAll('.resp-dosis').forEach(l => { l.hidden = !meds.includes(l.dataset.med); });
  const nomed = !!root.querySelector('[data-nomed-chk]')?.checked;
  root.querySelectorAll('input[data-sv]').forEach(i => { i.disabled = nomed; });
  const motivo = root.querySelector('[data-nomed]');
  if (motivo) motivo.hidden = !nomed;
}

// valores = registro guardado (editar / re-registrar) · pb, pa = EVA guardado · tags = técnicas
// guardadas · previo = sesión respiratoria anterior del episodio (placeholders "últ." y "Igual que la última").
// Sin previo (primera sesión respiratoria del episodio) "¿Cómo llega hoy?" se oculta, salvo que la fila
// ya traiga ese dato (MINI-1).
export function renderRespEditor(containerId, { valores = null, pb = null, pa = null, tags = [], previo = null } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const s = soapNormalizar(valores) || {};
  const r = s.resp || {}, sv = r.sv || {};
  const ps = soapNormalizar(previo?.soap) || {};
  const psv = ps.resp?.sv || {};
  const tagSel = Array.isArray(tags) ? tags : [];
  const chips = (grupo, lista, sel, modo = 'uno') =>
    `<div class="resp-chips" data-grupo="${grupo}" data-modo="${modo}" role="group">${lista.map(x =>
      `<button type="button" class="resp-chip" data-v="${esc(x.id)}" aria-pressed="${sel(x.id)}">${esc(x.label)}</button>`).join('')}</div>`;
  // Técnicas fuera del catálogo (sesión vieja o catálogo cambiado): se muestran marcadas para que se
  // vean y se puedan quitar, en vez de perderse en silencio al guardar.
  const tecLista = RESP_TECNICAS.concat(tagSel.filter(t => !RESP_TECNICAS.includes(t))).map(t => ({ id: t, label: t }));
  const celda = (x, i) => {
    const v = sv[x.id]?.[i], p = psv[x.id]?.[i];
    return `<td><input type="number" inputmode="${x.dec ? 'decimal' : 'numeric'}" step="${x.dec ? '0.5' : '1'}" min="${x.min}" max="${x.max}"
      class="resp-in" data-sv="${x.id}" data-i="${i}" aria-label="${esc(`${x.label} ${i ? 'después' : 'antes'}`)}"
      value="${v != null ? esc(String(v)) : ''}" placeholder="${p != null ? esc('últ. ' + _n(p)) : ''}"></td>`;
  };
  const evaCelda = (k, v) => `<td><input type="number" inputmode="numeric" step="1" min="0" max="10" class="resp-in"
      data-eva="${k}" aria-label="Dolor EVA ${k === 'pb' ? 'antes' : 'después'}" value="${v != null ? esc(String(v)) : ''}"></td>`;
  const medSel = (r.med || []).map(m => m.f);
  const dosis = Object.fromEntries((r.med || []).map(m => [m.f, m.d]));
  const puedeCopiar = previo && (ps.resp || (previo.tags && previo.tags.length));

  el.innerHTML = `<div class="resp">
    <div class="resp-top">
      <span class="resp-titulo">Terapia respiratoria</span>
      ${puedeCopiar ? `<button type="button" class="resp-copiar" data-copiar>↺ Igual que la última (${esc(dmy(previo.date))})</button>` : ''}
    </div>
    <div class="resp-sec" data-sec="llega"${!previo && !s.llega ? ' style="display:none"' : ''}>
      <div class="resp-lbl">¿Cómo llega hoy? <span class="req">*</span> <span class="resp-hint">frente a la sesión anterior</span></div>
      ${chips('llega', LLEGA, id => s.llega === id)}
    </div>
    <div class="resp-sec" data-sec="signos">
      <div class="resp-lbl">Signos <span class="req">*</span> <span class="resp-hint">al menos uno</span></div>
      <table class="resp-sv"><thead><tr><th></th><th>Antes</th><th>Después</th></tr></thead><tbody>
        ${SIGNOS.map(x => `<tr><th scope="row">${esc(x.label)} <small>${esc(x.unidad)}</small></th>${celda(x, 0)}${celda(x, 1)}</tr>`).join('')}
        <tr><th scope="row">Dolor EVA <small>/10</small></th>${evaCelda('pb', pb)}${evaCelda('pa', pa)}</tr>
      </tbody></table>
      <div class="resp-o2">
        <span class="resp-hint">Oxígeno:</span>
        ${chips('o2', [{ id: 'aa', label: 'Aire ambiente' }, { id: 'o2', label: 'Con oxígeno' }], id => (id === 'aa' ? r.o2 === 0 : r.o2 > 0))}
        <label class="resp-lpm"><input type="number" inputmode="decimal" step="0.5" min="0.5" max="${O2_MAX}" class="resp-in"
          data-o2-lpm aria-label="Oxígeno en litros por minuto" value="${r.o2 > 0 ? esc(String(r.o2)) : ''}"> L/min</label>
      </div>
      <label class="resp-nomed"><input type="checkbox" data-nomed-chk${r.nomed ? ' checked' : ''}> No se pudieron tomar los signos</label>
      <input type="text" class="resp-txt" data-nomed maxlength="${MAX_TXT.nomed}" placeholder="¿Por qué? (obligatorio si no hay signos)" value="${esc(r.nomed || '')}">
    </div>
    <div class="resp-sec" data-sec="tec">
      <div class="resp-lbl">Técnicas <span class="req">*</span></div>
      ${chips('tec', tecLista, id => tagSel.includes(id), 'varios')}
    </div>
    <div class="resp-sec" data-sec="sec">
      <div class="resp-lbl">Secreciones</div>
      ${chips('cant', SEC_CANT, id => r.sec?.cant === id)}
      ${chips('asp', SEC_ASP, id => r.sec?.asp === id)}
    </div>
    <details class="resp-med"${medSel.length ? ' open' : ''}>
      <summary>💊 Medicación administrada <span class="resp-hint">opcional · según prescripción</span></summary>
      <div>
        ${chips('med', MEDICACION, id => medSel.includes(id), 'varios')}
        ${MEDICACION.map(m => `<label class="resp-dosis" data-med="${esc(m.id)}"><span>${esc(m.label)}</span>
          <input type="text" class="resp-txt" data-dosis="${esc(m.id)}" maxlength="${MAX_TXT.dosis}" placeholder="Dosis y unidad" value="${esc(dosis[m.id] || '')}"></label>`).join('')}
      </div>
    </details>
    <div class="resp-sec" data-sec="tol">
      <div class="resp-lbl">Tolerancia <span class="req">*</span></div>
      ${chips('tol', TOLERANCIA, id => s.tol === id)}
      <input type="text" class="resp-txt" data-inc maxlength="${MAX_TXT.inc}" placeholder="¿Qué pasó? Ej.: mareo, desaturación, tos persistente" value="${esc(s.inc || '')}">
    </div>
    <div class="resp-sec" data-sec="prox">
      <div class="resp-lbl">Próxima sesión <span class="req">*</span></div>
      ${chips('prox', PROXIMA, id => s.prox === id)}
    </div>
    <div class="resp-sec" data-sec="casa">
      <div class="resp-lbl">Para casa / familia <span class="resp-hint">opcional</span></div>
      <input type="text" class="resp-txt" data-casa maxlength="${MAX_TXT.casa}" placeholder="Indicaciones para el paciente o el cuidador" value="${esc(s.casa || '')}">
    </div>
  </div>`;

  const root = el.querySelector('.resp');
  _sync(root);
  // Listeners sobre el bloque recién pintado (sin onclick inline: CSP). Cada render crea un .resp
  // nuevo, así que no se acumulan entre aperturas del modal.
  root.addEventListener('click', ev => {
    const chip = ev.target.closest('.resp-chip');
    if (!chip || !root.contains(chip)) return;
    const grupo = chip.parentElement;
    const on = chip.getAttribute('aria-pressed') !== 'true';
    if (grupo.dataset.modo === 'uno') grupo.querySelectorAll('.resp-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(on));
    chip.closest('.resp-sec')?.classList.remove('resp-sec--falta');
    _sync(root);
  });
  root.addEventListener('input', ev => {
    ev.target.closest('.resp-sec')?.classList.remove('resp-sec--falta');
    if (ev.target.matches('[data-nomed-chk]')) _sync(root);
  });
  root.addEventListener('change', ev => { if (ev.target.matches('[data-nomed-chk]')) _sync(root); });
  const copiar = root.querySelector('[data-copiar]');
  if (copiar) copiar.addEventListener('click', () => {
    const pr = ps.resp || {};
    _marcar(root, 'tec', Array.isArray(previo.tags) ? previo.tags : []);
    if (pr.o2 != null) {
      _marcar(root, 'o2', [pr.o2 === 0 ? 'aa' : 'o2']);
      if (pr.o2 > 0) root.querySelector('[data-o2-lpm]').value = String(pr.o2);
    }
    _marcar(root, 'med', (pr.med || []).map(m => m.f));
    (pr.med || []).forEach(m => { const i = root.querySelector(`[data-dosis="${m.f}"]`); if (i) i.value = m.d; });
    if (pr.med && pr.med.length) root.querySelector('.resp-med').open = true;
    if (ps.casa) root.querySelector('[data-casa]').value = ps.casa;
    root.querySelector('.resp-sec[data-sec="tec"]')?.classList.remove('resp-sec--falta');
    _sync(root);
    copiar.textContent = `✓ Copiado de la sesión del ${dmy(previo.date)}`;
  });
}

// Lee el bloque. invalidos = mensajes de lo que está mal escrito (bloquea el guardado en vez de
// perder el dato en silencio, igual que la goniometría).
export function leerRespDetalle(containerId) {
  const root = document.getElementById(containerId)?.querySelector('.resp');
  if (!root) return { soap: null, tags: [], pb: null, pa: null, invalidos: [] };
  const invalidos = [];
  const nomedChk = !!root.querySelector('[data-nomed-chk]')?.checked;
  const sv = {};
  if (!nomedChk) for (const x of SIGNOS) {
    const par = [0, 1].map(i => {
      const raw = root.querySelector(`input[data-sv="${x.id}"][data-i="${i}"]`)?.value.trim() ?? '';
      if (raw === '') return null;
      const n = _num(raw, x);
      if (n == null) invalidos.push(`${x.label} ${i ? 'después' : 'antes'}: ${raw} no es posible (${x.min}–${x.max} ${x.unidad})`);
      return n;
    });
    if (par[0] != null || par[1] != null) sv[x.id] = par;
  }
  const eva = k => {
    const raw = root.querySelector(`input[data-eva="${k}"]`)?.value.trim() ?? '';
    if (raw === '') return null;
    const n = Number(raw.replace(',', '.'));
    if (!Number.isInteger(n) || n < 0 || n > 10) { invalidos.push(`Dolor EVA ${k === 'pb' ? 'antes' : 'después'}: entero de 0 a 10`); return null; }
    return n;
  };
  const pb = eva('pb'), pa = eva('pa');
  let o2 = null;
  const o2modo = _uno(root, 'o2');
  if (o2modo === 'aa') o2 = 0;
  else if (o2modo === 'o2') {
    const raw = root.querySelector('[data-o2-lpm]')?.value.trim() ?? '';
    const n = Number(raw.replace(',', '.'));
    if (raw === '' || !Number.isFinite(n) || n <= 0 || n > O2_MAX) invalidos.push(`Oxígeno: anota los L/min (0,5 a ${O2_MAX})`);
    else o2 = n;
  }
  const med = _varios(root, 'med').map(f => {
    const d = root.querySelector(`[data-dosis="${f}"]`)?.value.trim() || '';
    if (!d) invalidos.push(`Falta la dosis de ${_lab(MEDICACION, f)}`);
    return { f, d };
  });
  const tol = _uno(root, 'tol');
  const crudo = {
    llega: _uno(root, 'llega'), tol, prox: _uno(root, 'prox'),
    inc: tol === 'regular' || tol === 'mala' ? root.querySelector('[data-inc]')?.value : null,
    casa: root.querySelector('[data-casa]')?.value,
    resp: { o2, sv, nomed: nomedChk ? root.querySelector('[data-nomed]')?.value : null,
            sec: { cant: _uno(root, 'cant'), asp: _uno(root, 'asp') }, med },
  };
  // Técnicas en orden de catálogo; las que no están en el catálogo, al final.
  const tec = _varios(root, 'tec');
  const tags = RESP_TECNICAS.filter(t => tec.includes(t)).concat(tec.filter(t => !RESP_TECNICAS.includes(t)));
  return { soap: soapNormalizar(crudo), tags, pb, pa, invalidos };
}

// Resalta las secciones que faltan y lleva la vista a la primera.
export function marcarFaltantes(containerId, faltan) {
  const root = document.getElementById(containerId)?.querySelector('.resp');
  if (!root) return;
  const secs = faltan.map(f => root.querySelector(`.resp-sec[data-sec="${f.k}"]`)).filter(Boolean);
  secs.forEach(x => x.classList.add('resp-sec--falta'));
  secs[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
