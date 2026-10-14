// ── MED-1: resumen para el médico (arriba de la página 1 del informe) ──
// Lo calcula esta función PURA a partir del render-model del informe (el mismo shape que el PDF,
// el Word y el snapshot guardado) — NO la IA. Una línea de identificación (solo en pantalla desde
// INF-2: en el PDF/Word ya está el bloque «Datos del paciente») y cinco líneas:
// ESTADO · MEDIDAS · ALERTAS · PEDIDO (solo con médico referente) · PRÓXIMO.
// Los umbrales son constantes exportadas (UMBRALES) para que el equipo clínico los valide.
//
// Snapshots viejos (antes de INF-UNI): no traen rom por sesión, alta, próxima cita ni pedido. Lo
// que falta no dispara reglas (undefined = desconocido, nunca "no"): el resumen sale igual, más corto.
import { dmy, ddmm, tieneEva, dolorInicial } from './utils.js';
import { romNormalizar, romPct, romMov, romValorTexto, romNormalTexto } from './rom.js';

export const UMBRALES = {
  MIN_MEDICIONES_DOLOR: 2,    // SIN DATOS: menos mediciones reales de dolor (evaluación + sesiones con EVA)
  DOLOR_EMPEORA: 2,           // EMPEORA: dolor actual ≥ base + 2
  ROM_PUNTOS: 10,             // EMPEORA / MEJORA / alerta: el ROM clave baja o sube ≥10 puntos de % del normal
  DIAS_INTERRUPCION: 14,      // INTERRUMPIDO: días sin sesión (además: sin cita futura y plan incompleto)
  ASISTENCIA_MIN: 85,         // ATENCIÓN: asistencia (continuidad) bajo este %
  SESIONES_SIN_CAMBIO: 4,     // ATENCIÓN: tantas sesiones seguidas con EVA…
  CAMBIO_MINIMO_DOLOR: 1,     // …sin moverse al menos este cambio (y con dolor > 0)
  DOLOR_MEJORA_PUNTOS: 2,     // MEJORA: el dolor baja ≥2 puntos…
  DOLOR_MEJORA_PCT: 30,       // …o ≥30 %
  ALERTA_DOLOR_SUBE: 2,       // alerta: el dolor sube ≥2 respecto de la sesión anterior
  ALERTA_DESPUES_PEOR: 2,     // alerta: "después" > "antes" en tantas sesiones seguidas
  ALERTA_INASISTENCIAS: 2,    // alerta: inasistencias en el período
  MAX_ALERTAS: 2,
  PLAN_RENOVAR_PCT: 80,       // pedido sugerido: plan ≥80 % sin MEJORA → renovar la orden
  HITOS_INFORME: [50, 100],   // próximo informe en el hito del 50 % o del 100 % del plan
};

export const ESTADOS = {
  SIN_DATOS:    { forma: '○', palabra: 'SIN DATOS' },
  EMPEORA:      { forma: '■', palabra: 'EMPEORA' },
  INTERRUMPIDO: { forma: '▲', palabra: 'INTERRUMPIDO' },
  ATENCION:     { forma: '▲', palabra: 'ATENCIÓN' },
  MEJORA:       { forma: '●', palabra: 'MEJORA' },
  EN_CURSO:     { forma: '●', palabra: 'EN CURSO' },
};

// Opciones del pedido al médico (select del modal del firmante).
export const PEDIDOS = [
  { id: 'nada', label: 'Nada por ahora' },
  { id: 'renovar', label: 'Renovar o ampliar la orden' },
  { id: 'reevaluar', label: 'Reevaluar' },
  { id: 'medicacion', label: 'Ajustar medicación/analgesia' },
  { id: 'alta', label: 'Validar el alta' },
  { id: 'interconsulta', label: 'Interconsulta' },
  { id: 'otro', label: 'Otro' },
];
export const PEDIDO_OTRO_MAX = 100;

// {tipo, n, texto} → lo que se imprime después de "Necesitamos de usted: ".
export function textoPedido(p) {
  const tipo = p?.tipo || 'nada';
  if (tipo === 'renovar') { const n = parseInt(p?.n, 10); return 'renovar o ampliar la orden' + (n > 0 ? ` (+${n} sesiones)` : ''); }
  if (tipo === 'reevaluar') return 'reevaluar al paciente';
  if (tipo === 'medicacion') return 'ajustar la medicación/analgesia';
  if (tipo === 'alta') return 'validar el alta';
  if (tipo === 'interconsulta') return 'una interconsulta';
  if (tipo === 'otro') { const t = String(p?.texto || '').trim().slice(0, PEDIDO_OTRO_MAX); return t || 'nada por ahora'; }
  return 'nada por ahora';
}

function _dia(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function _diasEntre(a, b) {
  const x = _dia(a), y = _dia(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
}
const _valorSesion = s => (s.pa != null ? s.pa : s.pb);

// "48 años" desde "14/05/1978 (48 años)" (getDisplayAge con fecha) o tal cual.
function _edadCorta(pac) {
  if (pac?.edadCorta) return pac.edadCorta;
  const e = String(pac?.edad || '').trim();
  if (!e || e === 'Sin edad') return '';
  const m = /\(([^)]+)\)\s*$/.exec(e);
  return m ? m[1] : e;
}

// Período: rango del informe, o evaluación inicial (o primera sesión) → última sesión.
export function periodoInforme(m) {
  if (m?.rango && !m.rango.vacio) return `${dmy(m.rango.desdeFecha)} – ${dmy(m.rango.hastaFecha)}`;
  const ses = m?.sesiones || [];
  const ini = (m?.evalInicial && m.evalInicial.fecha) || (ses[0] && ses[0].fecha) || null;
  const fin = ses.length ? ses[ses.length - 1].fecha : null;
  if (!ini) return '';
  return fin && fin !== ini ? `${dmy(ini)} – ${dmy(fin)}` : dmy(ini);
}

// Tipo de terapia del período: 'Fisioterapia', 'Terapia respiratoria' o las dos.
export function tipoTerapiaDe(sesiones) {
  const tipos = [...new Set((sesiones || []).map(s => s?.tipo).filter(Boolean))];
  if (!tipos.length) return '';
  return tipos.length === 1 ? tipos[0] : 'Fisioterapia y terapia respiratoria';
}

// ROM clave: el movimiento con MENOR % del normal en la evaluación inicial (solo los que tienen %),
// contra su última medición del mismo lado en las sesiones. null sin goniometría con %.
export function romClave(evalRom, sesiones) {
  const base = (romNormalizar(evalRom) || []).map(it => ({ it, pct: romPct(it) })).filter(x => x.pct != null);
  if (!base.length) return null;
  const peor = base.reduce((a, b) => (b.pct < a.pct ? b : a));
  const { art, mov } = romMov(peor.it.j, peor.it.m);
  let ultima = null;
  (sesiones || []).forEach(s => {
    const it = (romNormalizar(s?.rom) || []).find(x => x.j === peor.it.j && x.m === peor.it.m && x.l === peor.it.l);
    if (it) ultima = { v: it.v, pct: romPct(it), fecha: s.fecha };
  });
  const nombre = `${art.nombre}${peor.it.l ? ' ' + peor.it.l : ''} ${mov.nombre.toLowerCase()}`;
  return {
    nombre, base: { v: peor.it.v, pct: peor.pct }, ultima,
    delta: ultima ? ultima.pct - peor.pct : null,
    baseTxt: romValorTexto(mov, peor.it.v), ultimaTxt: ultima ? romValorTexto(mov, ultima.v) : null,
    normalTxt: romNormalTexto(mov),
  };
}

function _hitoInforme(done, plan) {
  if (!(plan > 0)) return null;
  for (const h of UMBRALES.HITOS_INFORME) {
    const k = Math.ceil(plan * h / 100);
    if (done < k) return `próximo informe al ${h} % del plan (sesión ${k})`;
  }
  return 'próximo informe al alta';
}

function _signo(d) { return d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : 'sin cambio'; }
function _minus(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

// Sugerencia automática del pedido: EMPEORA → reevaluar; plan completo → validar el alta; plan
// ≥80 % sin MEJORA ("sin meta") → renovar la orden; si no, nada.
export function pedidoSugerido(clave, met) {
  const done = Number(met?.done) || 0, plan = Number(met?.sessions) || 0;
  if (clave === 'EMPEORA') return { tipo: 'reevaluar' };
  if (plan > 0 && done >= plan) return { tipo: 'alta' };
  if (plan > 0 && done / plan * 100 >= UMBRALES.PLAN_RENOVAR_PCT && clave !== 'MEJORA') return { tipo: 'renovar' };
  return { tipo: 'nada' };
}

/**
 * @param {object} m    render-model del informe (o snapshot guardado)
 * @param {Date|string} hoy  fecha de emisión (para los días sin sesión)
 * @returns {object|null}  null si el modelo no trae lo mínimo (sesiones y métricas)
 */
export function resumenMedico(m, hoy = new Date()) {
  if (!m || !m.metricas || !Array.isArray(m.sesiones)) return null;
  const U = UMBRALES;
  const met = m.metricas;
  const ses = m.sesiones;
  const done = Number(met.done) || 0, plan = Number(met.sessions) || 0;
  const pct = met.pct != null ? met.pct : (plan > 0 ? Math.round(done / plan * 100) : 0);

  // ── Dolor ──
  const conEva = ses.filter(tieneEva);
  const mediciones = (m.evalInicial && m.evalInicial.pb != null ? 1 : 0) + conEva.length;
  const base = met.evaInicial != null ? met.evaInicial : (dolorInicial(m.evalInicial, ses)?.valor ?? null);
  const actual = met.evaActual != null ? met.evaActual : (conEva.length ? _valorSesion(conEva[conEva.length - 1]) : null);
  const hayDolor = base != null && actual != null;
  const dDolor = hayDolor ? actual - base : null;

  // ── ROM clave ──
  const rom = romClave(m.evalInicial?.rom, ses);
  const dRom = rom?.delta ?? null;

  // ── Reglas ──
  const ultimaFecha = ses.length ? ses[ses.length - 1].fecha : null;
  const diasSin = ultimaFecha ? _diasEntre(ultimaFecha, hoy) : null;
  const planCompleto = plan > 0 && done >= plan;
  const planIncompleto = plan > 0 && done < plan;
  const ultimas = conEva.slice(-U.SESIONES_SIN_CAMBIO).map(_valorSesion);
  const estancado = ultimas.length >= U.SESIONES_SIN_CAMBIO
    && Math.max(...ultimas) - Math.min(...ultimas) < U.CAMBIO_MINIMO_DOLOR && ultimas[ultimas.length - 1] > 0;
  const dolorMejora = hayDolor && (dDolor <= -U.DOLOR_MEJORA_PUNTOS || (base > 0 && (base - actual) / base * 100 >= U.DOLOR_MEJORA_PCT));
  const romMejora = dRom != null && dRom >= U.ROM_PUNTOS;
  const mejora = dolorMejora || romMejora;
  const dolorEmpeora = hayDolor && actual >= base + U.DOLOR_EMPEORA;
  const romEmpeora = dRom != null && dRom <= -U.ROM_PUNTOS;
  const interrumpido = diasSin != null && diasSin >= U.DIAS_INTERRUPCION && m.proximaCita === null && planIncompleto;
  const asistBaja = met.adh != null && met.adh < U.ASISTENCIA_MIN;
  const sinAlta = planCompleto && m.alta === false;
  const prefijo = t => (mejora ? 'Mejoraba; ' + _minus(t) : t);

  let clave, frase;
  if (mediciones < U.MIN_MEDICIONES_DOLOR || !hayDolor) {
    clave = 'SIN_DATOS'; frase = `Menos de ${U.MIN_MEDICIONES_DOLOR} mediciones de dolor: no alcanza para valorar la evolución.`;
  } else if (dolorEmpeora || romEmpeora) {
    clave = 'EMPEORA';
    frase = dolorEmpeora ? `El dolor subió de ${base} a ${actual}/10.` : `${rom.nombre}: bajó ${Math.abs(dRom)} puntos del normal.`;
  } else if (interrumpido) {
    clave = 'INTERRUMPIDO'; frase = prefijo(`Sin sesiones desde el ${dmy(ultimaFecha)} y sin cita agendada.`);
  } else if (asistBaja || sinAlta || estancado) {
    clave = 'ATENCION';
    frase = prefijo(asistBaja ? `Asistencia del ${met.adh} % (meta ${U.ASISTENCIA_MIN} %).`
      : sinAlta ? 'Completó el plan y no tiene alta registrada.'
      : `Dolor sin cambio en las últimas ${U.SESIONES_SIN_CAMBIO} sesiones.`);
  } else if (mejora) {
    clave = 'MEJORA';
    frase = dolorMejora ? `El dolor bajó de ${base} a ${actual}/10.` : `${rom.nombre}: subió ${dRom} puntos del normal.`;
  } else {
    clave = 'EN_CURSO'; frase = 'Sin cambios que superen los umbrales por ahora.';
  }
  const est = ESTADOS[clave];
  // INF-2: "Sesiones del plan" y "Asistencia a citas": sesiones y citas no se confunden.
  const sesionTxt = plan > 0 ? `Sesiones del plan: ${done} de ${plan} (${pct} %)` : `Sesiones realizadas: ${done}`;

  // ── Medidas ──
  const medDolor = hayDolor ? `Dolor ${base} → ${actual}/10 (${_signo(dDolor)})` : 'Dolor: sin mediciones suficientes';
  const medRom = !rom ? 'sin goniometría'
    : rom.ultima ? `ROM clave: ${rom.nombre} ${rom.baseTxt} → ${rom.ultimaTxt} / ${rom.normalTxt}`
    : `ROM clave: ${rom.nombre} ${rom.baseTxt} / ${rom.normalTxt} (sin re-medición)`;
  const nFaltas = Number(met.faltas) || 0;
  const medAsis = met.adh == null && met.faltas !== undefined ? 'Asistencia: sin citas pasadas'
    : `Asistencia a citas: ${met.asistidas ?? 0} de ${met.totalCitas ?? 0}` + (nFaltas > 0 ? ` (${nFaltas} falta${nFaltas === 1 ? '' : 's'})` : '');

  // ── Alertas (solo reglas; máximo MAX_ALERTAS) ──
  const alertas = [];
  if (conEva.length >= 2) {
    const a = _valorSesion(conEva[conEva.length - 2]), b = _valorSesion(conEva[conEva.length - 1]);
    if (b - a >= U.ALERTA_DOLOR_SUBE) alertas.push(`dolor subió de ${a} a ${b} en la última sesión (${ddmm(conEva[conEva.length - 1].fecha)})`);
  }
  {
    let racha = [];
    let ultimaRacha = null;
    ses.forEach(s => {
      if (s.pb != null && s.pa != null && s.pa > s.pb) { racha.push(s); if (racha.length >= U.ALERTA_DESPUES_PEOR) ultimaRacha = racha.slice(-U.ALERTA_DESPUES_PEOR); }
      else racha = [];
    });
    if (ultimaRacha) alertas.push(`"después" peor que "antes" en ${U.ALERTA_DESPUES_PEOR} sesiones seguidas (${ultimaRacha.map(s => ddmm(s.fecha)).join(' y ')})`);
  }
  if (romEmpeora) alertas.push(`${rom.nombre} bajó ${Math.abs(dRom)} puntos del normal`);
  if ((Number(met.faltas) || 0) >= U.ALERTA_INASISTENCIAS) alertas.push(`${met.faltas} inasistencias`);
  if (sinAlta) alertas.push('plan completo sin alta registrada');
  if ((Number(met.previas) || 0) > 0) alertas.push(`incluye ${met.previas} sesiones previas a RehactivaPro`);
  const alertasTxt = alertas.length ? alertas.slice(0, U.MAX_ALERTAS).join(' · ') : 'ninguna regla disparada';

  // ── Pedido (solo con médico referente) ──
  const sugerido = pedidoSugerido(clave, { done, sessions: plan });
  const pedido = m.pedido && m.pedido.tipo ? m.pedido : sugerido;

  // ── Próximo ──
  const prox = [];
  if (m.proximaCita) prox.push(`Próxima cita: ${dmy(m.proximaCita)}`);
  else if (m.proximaCita === null) prox.push('Sin cita agendada');
  const hito = _hitoInforme(done, plan);
  if (hito) prox.push(hito);
  prox.push('se medirá dolor y movilidad');

  const identificacion = [m.paciente?.nombre, _edadCorta(m.paciente), m.paciente?.diagnostico,
    m.tipoTerapia || tipoTerapiaDe(ses), periodoInforme(m), m.numero].map(x => String(x || '').trim()).filter(Boolean).join(' · ');

  const lineas = [
    { k: 'Estado', t: `${est.forma} ${est.palabra} · ${frase} · ${sesionTxt}` },
    { k: 'Medidas', t: [medDolor, medRom, medAsis].join(' · ') },
    { k: 'Alertas', t: alertasTxt },
  ];
  if (m.doctor) lineas.push({ k: 'Pedido', t: `Necesitamos de usted: ${textoPedido(pedido)}` });
  lineas.push({ k: 'Próximo', t: prox.join(' · ') });

  return {
    identificacion, lineas,
    estado: { clave, forma: est.forma, palabra: est.palabra, frase, sesion: sesionTxt },
    alertas, pedido, pedidoSugerido: sugerido,
  };
}
