// ── B2b-1: Expediente del paciente — cálculo PURO (sin DOM; se prueba en node) ──
// La UI (js/expediente.js) solo pinta lo que sale de acá. Todo se deriva de lo que ya está en
// memoria (patients con log/episodios/ordenes, appointments); los documentos llegan aparte, con
// carga perezosa, y acá solo se ordenan.
// EXP-2: el Resumen son pendientes + datos por completar + episodios (pendientesExpediente,
// datosFaltantes, listaEpisodiosExp).
import { getFullAge, diagConCie, episodioActual, logDeEpisodio, sesionesMostradas, fmtDate,
         lugarSesion, horaSesion, doneEnLog, dmy } from './utils.js';
import { resumenHistorial, citasDeEpisodio, filasEpisodios } from './historial-calc.js';
import { ordenAplicable, ordenVencida, ordenAgotada } from './orden-medica.js';

const SEXO = { F: 'Femenino', M: 'Masculino' };

// Misma regla que hasEvalInicial (resumen.js), sin importar ese módulo de UI.
const _evalRow = p => (p?.log || []).find(s => s && s.type === 'Evaluación inicial') || null;

// Secundarios con el formato del informe (informe-doc.js): «C — descripción», separados por «; ».
function _diagSecTxt(lista) {
  return (Array.isArray(lista) ? lista : []).filter(x => x?.c)
    .map(x => `${x.c} — ${x.d || ''}`.replace(/ — $/, '')).join('; ');
}

// Última sesión de TRATAMIENTO asistida hasta hoy en session_log (una sesión manual o histórica
// no tiene cita, y la agenda sola la perdería).
function _ultimaEnLog(p, hoy) {
  return (p?.log || []).filter(s => s && s.date && s.status === 'asistió' && String(s.date) <= hoy
    && s.type !== 'Evaluación inicial' && s.type !== 'Fin de episodio')
    .map(s => String(s.date)).sort().pop() || null;
}

// Encabezado del expediente. `citas` = citasDePaciente(state.appointments, p.id); `doctors` =
// state.doctors (se pasa para que la función no lea el state).
// hechas = lo que se MUESTRA (RehactivaPro + previas del episodio actual, como el badge X/N);
// plan = sesiones del plan del paciente. proximaCita/ultimaSesion = 'YYYY-MM-DD' o null.
export function resumenExpediente(p, citas, hoy = fmtDate(new Date()), doctors = []) {
  if (!p) return null;
  const doc = p.doctorId ? (doctors || []).find(d => String(d.id) === String(p.doctorId)) : null;
  const sec = _diagSecTxt(p.diagSec);
  const principal = diagConCie(p.diag || '', p.cie10);
  const { epDone, epPrevias, epSessions } = logDeEpisodio(p, 'current');
  const rh = resumenHistorial(citas, hoy);
  const enLog = _ultimaEnLog(p, hoy);
  const ultima = [rh.ultima, enLog].filter(Boolean).sort().pop() || null;
  const ev = _evalRow(p);
  return {
    edad: getFullAge(p),
    sexoTxt: SEXO[p.sexo] || '',
    diagTxt: [principal || 'Sin diagnóstico', sec].filter(Boolean).join('; '),
    doctorTxt: doc ? `${doc.name}${doc.spec ? ` (${doc.spec})` : ''}` : 'Independiente',
    episodioDesde: episodioActual(p)?.desde || null,
    hechas: sesionesMostradas(epDone, epPrevias),
    plan: Number(epSessions) || 0,
    previas: epPrevias || 0,
    proximaCita: rh.proxima,
    ultimaSesion: ultima,
    sinEval: !ev,
    evalInicial: ev ? { fecha: ev.date || null, eva: ev.pb ?? null } : null,
  };
}

// Próximas citas (de hoy en adelante, sin las que no asistió), la más cercana primero.
export function proximasCitas(citas, hoy = fmtDate(new Date()), n = 3) {
  return (citas || []).filter(a => a && a.date && String(a.date) >= hoy && a.status !== 'noas')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Number(a.hour) || 0) - (Number(b.hour) || 0))
    .slice(0, n);
}

// Documentos del más reciente al más viejo: por fecha del documento o, sin ella, la de subida;
// empate → el último subido arriba.
export function ordenarDocsRecientes(docs) {
  const f = d => String(d?.fechaDoc || String(d?.createdAt || '').slice(0, 10));
  return [...(docs || [])].sort((a, b) => f(b).localeCompare(f(a))
    || String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
}

export function esImagen(mime) {
  return mime === 'image/jpeg' || mime === 'image/png';
}

// EVA de una fila del log como en el detalle del informe: «7→3», «7→?», «—→3» o «—».
export function textoEvaFila(s) {
  if (s?.pb != null) return `${s.pb}→${s.pa != null ? s.pa : '?'}`;
  if (s?.pa != null) return `—→${s.pa}`;
  return '—';
}

// Sesiones del episodio ACTUAL para la tabla de la pestaña Sesiones, de la más reciente a la más
// vieja, sin la Evaluación inicial ni los marcadores. Campos planos: la UI no calcula nada.
// opts.citas = citas del paciente (para el lugar); opts.therapists = state.therapists.
export function sesionesEpisodioExp(p, { citas = [], therapists = [] } = {}) {
  if (!p) return [];
  const { log } = logDeEpisodio(p, 'current');
  const thName = id => (therapists || []).find(t => String(t.id) === String(id))?.name || '—';
  return log.filter(s => s.type !== 'Evaluación inicial' && s.type !== 'Fin de episodio')
    .map(s => ({
      id: s.id ?? null,
      fecha: s.date,
      hora: horaSesion(s.hour),
      tipo: s.type || '—',
      lugar: lugarSesion(s, citas) || '—',
      eva: textoEvaFila(s),
      terapeuta: thName(s.therapistId),
      tecnicas: (s.tags || []).join(', '),
      asistio: s.status === 'asistió',
    }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.hora).localeCompare(String(a.hora)));
}

// ── EXP-2: Resumen ──
// Acción de cada pendiente: `tipo` lo traduce la UI a su botón/enlace; `permiso` es el de ROLE_ACTIONS
// (null = lo ve todo el que entra al Expediente). ctx.puede(permiso) filtra: sin permiso, el
// pendiente se lista igual pero sin acción.
const ACCIONES = {
  evalInicial: { tipo: 'evalInicial', label: 'Registrar', permiso: 'evalInicial' },
  ordenes: { tipo: 'ordenes', label: 'Ver órdenes', permiso: null },
  editar: { tipo: 'editar', label: 'Editar', permiso: 'editPatient' },
  historial: { tipo: 'historial', label: 'Historial de citas', permiso: null },
  agendar: { tipo: 'agendar', label: 'Agendar', permiso: 'createAppt' },
};

// Pendientes del paciente, en este orden fijo: sin_eval, orden_vencida, orden_agotada, sin_orden,
// plan_sin_alta, inasistencias, sin_cita, sin_diagnostico. `citas` = citasDePaciente(...).
// La orden que se mira es la que rige hoy (ordenAplicable); `usadas` = sesiones asistidas desde su
// fecha hasta hoy, como en el informe. hechas/plan = los del encabezado (con las previas).
export function pendientesExpediente(p, citas, hoy = fmtDate(new Date()), ctx = {}) {
  if (!p) return [];
  const puede = typeof ctx.puede === 'function' ? ctx.puede : () => true;
  const out = [];
  const add = (clave, texto, a) => out.push({ clave, texto, accion: a && (!a.permiso || puede(a.permiso)) ? { tipo: a.tipo, label: a.label } : null });

  if (!_evalRow(p)) add('sin_eval', 'Sin evaluación inicial', ACCIONES.evalInicial);

  const ordenes = Array.isArray(p.ordenes) ? p.ordenes : [];
  const o = ordenAplicable(ordenes, hoy);
  if (o && ordenVencida(o, hoy)) add('orden_vencida', `Orden médica vencida el ${dmy(o.vigenciaHasta)}`, ACCIONES.ordenes);
  if (o) {
    const usadas = doneEnLog((p.log || []).filter(s => s && s.date >= o.fecha && s.date <= hoy));
    if (ordenAgotada({ ...o, usadas }, usadas)) add('orden_agotada', `Orden médica agotada (${usadas} de ${Number(o.sesiones) || 0} sesiones)`, ACCIONES.ordenes);
  }
  if (p.doctorId && !ordenes.length) add('sin_orden', 'Sin orden médica registrada', ACCIONES.ordenes);

  const { epDone, epPrevias, epSessions } = logDeEpisodio(p, 'current');
  const hechas = sesionesMostradas(epDone, epPrevias);
  const plan = Number(epSessions) || 0;
  if (plan > 0 && hechas >= plan && p.status !== 'alta') add('plan_sin_alta', `Plan completo (${hechas} de ${plan}) sin alta registrada`, ACCIONES.editar);

  const noas = citasDeEpisodio(citas, p, 'current').filter(c => c.status === 'noas').length;
  if (noas >= 2) add('inasistencias', `${noas} inasistencias en este episodio`, ACCIONES.historial);

  if (p.status === 'active' && !(plan > 0 && hechas >= plan) && resumenHistorial(citas, hoy).proxima === null) {
    add('sin_cita', 'Sin próxima cita agendada', ACCIONES.agendar);
  }

  const diag = String(p.diag || '').trim();
  if (!p.protocolId && (!diag || diag === 'Sin diagnóstico')) add('sin_diagnostico', 'Sin diagnóstico', ACCIONES.editar);
  return out;
}

// Datos de la ficha que faltan, en el orden del formulario. El médico referente se lista como dato
// (no como pendiente): hay pacientes independientes.
export function datosFaltantes(p) {
  if (!p) return [];
  const vacio = v => !String(v ?? '').trim();
  return [
    ['fecha de nacimiento', p.birth_date], ['sexo', p.sexo], ['cédula', p.cedula],
    ['teléfono', p.tel], ['correo', p.email], ['médico referente', p.doctorId],
  ].filter(([, v]) => vacio(v)).map(([k]) => k);
}

// Episodios para el Resumen (todos los roles): el actual primero y los anteriores del más nuevo al
// más viejo. Con más de un anterior van plegados («Ver episodios anteriores (N)»); con uno solo, a la
// vista. titulo = nombre del episodio o «Episodio N»; hechas = con las previas (como el encabezado).
export function listaEpisodiosExp(p) {
  const filas = filasEpisodios(p).map(e => ({
    ...e,
    titulo: e.nombre || `Episodio ${e.idx}`,
    hechasMostradas: sesionesMostradas(e.hechas, e.previas),
  }));
  const actual = filas.find(e => e.actual) || null;
  const anteriores = filas.filter(e => !e.actual);
  return { actual, anteriores, plegar: anteriores.length > 1 };
}
