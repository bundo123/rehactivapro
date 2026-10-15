// ── B2b-1: Expediente del paciente — cálculo PURO (sin DOM; se prueba en node) ──
// La UI (js/expediente.js) solo pinta lo que sale de acá. Todo se deriva de lo que ya está en
// memoria (patients con log/episodios/ordenes, appointments); los documentos llegan aparte, con
// carga perezosa, y acá solo se ordenan.
import { getFullAge, diagConCie, episodioActual, logDeEpisodio, sesionesMostradas, fmtDate,
         lugarSesion, horaSesion } from './utils.js';
import { resumenHistorial } from './historial-calc.js';

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
