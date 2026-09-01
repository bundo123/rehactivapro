// ── HISTORIAL DE CITAS — cálculo puro ──
// Sin DOM y sin state: todo entra por parámetro (incluido `hoy`, para poder fijarlo en los tests,
// mismo patrón que therapistDeleteBlock/citasParaCierre) y todo sale como dato. La pantalla
// (js/historial.js) solo pinta lo que sale de acá; la impresión y el CSV consumen lo MISMO, para
// que las tres salidas no puedan discrepar.
//
// Vocabulario — una sola definición para las tres:
//  · ASISTENCIA = cita 'conf' con date <= hoy. Una 'conf' FUTURA no es una asistencia: es una cita
//    agendada. Motivo: checkAutoNoas (agenda.js:95-106) pasa a 'noas' toda 'pend' vencida, así que
//    una 'conf' ya pasada es, por construcción, una cita atendida. Es la misma lectura que hace
//    Seguimiento ("cita pasada = conf con fecha ≤ hoy", utils.js).
//  · EPISODIO = tramo entre marcadores 'Fin de episodio' del session_log. Frontera ESTRICTA
//    (desde < date <= hasta): la cita con la fecha EXACTA del marcador pertenece al episodio que
//    CIERRA, no al que abre. Es la misma regla de doneActual, citasNumerables y del recorte de los
//    informes; el marcador se fecha a propósito el día ANTERIOR a la cita que abre el episodio
//    nuevo (ver guardarNuevoEpisodio en pacientes.js).
import { MES_LARGO, fmtDate, fmtTime, parseFinNote, tipoSesion, TIPOS_SESION } from './utils.js';

// Orden canónico de citas: fecha y luego hora decimal. Copia EXACTA del de citasNumerables
// (utils.js) — de ahí depende que ordinalesHistorial coincida con ordinalesDeCitas.
const _porFechaHora = (a, b) =>
  String(a.date).localeCompare(String(b.date)) || (Number(a.hour) || 0) - (Number(b.hour) || 0);

// Episodios del paciente, del MÁS VIEJO al más nuevo; el último es siempre el ACTUAL (hasta:null).
// Un paciente sin marcadores tiene UN episodio, el actual, abierto por los dos lados.
// El diag/plan de un episodio CERRADO sale de la nota de su marcador (parseFinNote); el del actual
// es el del paciente hoy.
export function episodiosDePaciente(patient) {
  if (!patient) return [];
  const fins = (patient.log || [])
    .filter(s => s && s.type === 'Fin de episodio' && s.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const eps = fins.map((fin, i) => {
    const { diag, plan } = parseFinNote(fin.note);
    return {
      idx: i + 1,
      desde: i > 0 ? String(fins[i - 1].date) : null,
      hasta: String(fin.date),
      diag,
      plan,
      actual: false,
    };
  });
  eps.push({
    idx: fins.length + 1,
    desde: fins.length ? String(fins[fins.length - 1].date) : null,
    hasta: null,
    diag: patient.diag || 'Sin diagnóstico',
    plan: patient.sessions || null,
    actual: true,
  });
  return eps;
}

// Citas del paciente, ASCENDENTES por fecha y hora. Se quedan TODAS (también las 'no asistió' y las
// futuras): la tabla las lista; el que numera y el que cuenta filtran después.
export function citasDePaciente(appointments, patientId) {
  const pid = String(patientId ?? '');
  return (appointments || [])
    .filter(a => a && a.date && a.patientId != null && String(a.patientId) === pid)
    .sort(_porFechaHora);
}

// Índice (1-based) del episodio al que pertenece una cita, o null si no encaja en ninguno.
// Frontera estricta: `desde < date <= hasta`, con desde null = −∞ y hasta null = +∞.
export function episodioDeCita(cita, episodios) {
  const d = String(cita?.date || '');
  if (!d) return null;
  const ep = (episodios || []).find(e => (!e.desde || d > e.desde) && (!e.hasta || d <= e.hasta));
  return ep ? ep.idx : null;
}

// Mapa cita → { x, n, ep }: el ordinal DENTRO de su episodio. La clave es la cita MISMA, no su id
// (los ids mezclan números optimistas, uuids y 'rec-...' — mismo motivo que ordinalesDeCitas).
// Reglas idénticas a las de citasNumerables: una 'no asistió' NO consume número (no entra al mapa,
// y la siguiente hereda el ordinal que aquélla habría tenido) y el contador REINICIA en cada
// episodio. n = plan de ESE episodio, no el del paciente hoy.
// INVARIANTE (test/historial.test.js): para el episodio actual, x coincide exactamente con
// ordinalesDeCitas(...).get(cita).x — la unificación con la agenda se hace por test, no por
// refactor de una función que ya está en producción con los tests de ordinal encima.
export function ordinalesHistorial(citas, episodios) {
  const planDe = new Map((episodios || []).map(e => [e.idx, e.plan || null]));
  const cuenta = new Map();
  const out = new Map();
  [...(citas || [])].sort(_porFechaHora).forEach(c => {
    if (!c || c.status === 'noas') return;
    const ep = episodioDeCita(c, episodios);
    if (ep == null) return;
    const x = (cuenta.get(ep) || 0) + 1;
    cuenta.set(ep, x);
    out.set(c, { x, n: planDe.get(ep) ?? null, ep });
  });
  return out;
}

// Estado de UNA cita tal como se lee en esta pantalla. Es la ÚNICA definición: la usan la tabla, el
// filtro por estado, el CSV y la impresión. `key` agrupa; `label` es lo que se muestra.
// 'conf' futura → "Agendada": ya está confirmada en la agenda, pero todavía no ocurrió, así que no
// puede contar como asistencia. Cae en la clave 'pend' para que los tres filtros de estado sean una
// PARTICIÓN de las citas (asistió + no asistió + pendiente = todas) y ninguna fila quede sin pill.
export function estadoHistorial(cita, hoy = fmtDate(new Date())) {
  const st = cita?.status;
  if (st === 'noas') return { key: 'noas', label: 'No asistió' };
  if (st === 'conf') {
    return String(cita.date) <= String(hoy)
      ? { key: 'asistio', label: 'Asistió' }
      : { key: 'pend', label: 'Agendada' };
  }
  return { key: 'pend', label: 'Pendiente' };
}

// Resumen de un conjunto de citas YA filtrado por el corte: es lo que alimenta las 4 tarjetas.
// pctInasistencia es la continuidad invertida de resumenCitas (utils.js) — noas sobre las citas ya
// DECIDIDAS — y es null si no hay ninguna decidida: en pantalla va '—', nunca un 0% inventado.
export function resumenHistorial(citas, hoy = fmtDate(new Date())) {
  const list = (citas || []).filter(Boolean);
  const asistidas = list.filter(a => a.status === 'conf' && String(a.date) <= String(hoy));
  const noas = list.filter(a => a.status === 'noas');
  const pend = list.filter(a => a.status === 'pend');
  const futuras = list
    .filter(a => String(a.date) > String(hoy) && (a.status === 'conf' || a.status === 'pend'))
    .sort(_porFechaHora);
  const dec = asistidas.length + noas.length;
  const ult = [...asistidas].sort(_porFechaHora).slice(-1)[0];
  return {
    total: list.length,
    asistencias: asistidas.length,
    inasistencias: noas.length,
    pendientes: pend.length,
    proximas: futuras.length,
    pctInasistencia: dec > 0 ? Math.round(noas.length / dec * 100) : null,
    ultima: ult ? String(ult.date) : null,
    proxima: futuras.length ? String(futuras[0].date) : null,
  };
}

// Los tres filtros de estado. Ver estadoHistorial: son una partición, así que 'Todas' = la suma.
const _pasaEstado = (cita, estado, hoy) =>
  estado === 'all' || estadoHistorial(cita, hoy).key === estado;

// Filtro compuesto de la pantalla. `episodiosPorCita` es el Map cita → idx de episodio (se calcula
// UNA vez por render, igual que el mapa de ordinales, y no dentro del .map de las filas).
export function filtrarHistorial(citas, episodiosPorCita, filtro, hoy = fmtDate(new Date())) {
  const f = filtro || {};
  const corte = f.corte ?? 'all';
  const mes = f.mes ?? 'all';
  const estado = f.estado ?? 'all';
  return (citas || []).filter(c => {
    if (corte !== 'all' && String(episodiosPorCita?.get(c) ?? '') !== String(corte)) return false;
    if (mes !== 'all' && String(c.date).slice(0, 7) !== String(mes)) return false;
    return _pasaEstado(c, estado, hoy);
  });
}

// Agrupación para la tabla: el mes más NUEVO arriba y, dentro de cada mes, la cita más nueva arriba.
// `episodios` de cada mes son los índices de episodio presentes en él, ascendentes: con más de uno,
// el corte cayó a mitad de mes y la fila de mes lo dice.
export function agruparPorMes(citas, episodiosPorCita, hoy = fmtDate(new Date())) {
  const porMes = new Map();
  (citas || []).forEach(c => {
    const ym = String(c.date).slice(0, 7);
    if (!porMes.has(ym)) porMes.set(ym, []);
    porMes.get(ym).push(c);
  });
  return [...porMes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([ym, lista]) => {
      const mes = parseInt(ym.slice(5, 7), 10);
      const eps = [...new Set(lista.map(c => episodiosPorCita?.get(c)).filter(v => v != null))]
        .sort((a, b) => a - b);
      return {
        ym,
        label: `${MES_LARGO[mes - 1] || ym} ${ym.slice(0, 4)}`,
        episodios: eps,
        resumen: resumenHistorial(lista, hoy),
        citas: [...lista].sort((a, b) => -_porFechaHora(a, b)),
      };
    });
}

// Abreviatura del tipo de sesión ('fisio'/'resp'), normalizando por el catálogo: una cita vieja sin
// tipo cae al default, igual que en toda la app.
export function tipoAbbr(type) {
  const label = tipoSesion(type);
  return (TIPOS_SESION.find(t => t.label === label) || TIPOS_SESION[0]).abbr;
}

// Filas del CSV, con cabecera, en el mismo orden en que se ven en pantalla. Misma forma que
// exportAgendaCSV (array de arrays); quien escribe el archivo es historial.js.
// `hoy` va al final y con default para no cambiar la firma del plan: hace falta porque el texto del
// estado ("Asistió" vs "Agendada") depende de la fecha.
export function filasCsvHistorial(citas, episodiosPorCita, ordinales, getTherapistFn, hoy = fmtDate(new Date())) {
  const rows = [['Fecha', 'Hora', 'Terapeuta', 'Tipo', 'Modalidad', 'Estado', 'Episodio', 'N_episodio', 'Notas']];
  (citas || []).forEach(a => {
    const th = getTherapistFn ? getTherapistFn(a.therapistId) : null;
    const ord = ordinales?.get(a);
    const ep = episodiosPorCita?.get(a);
    rows.push([
      a.date,
      fmtTime(a.hour),
      th?.name || '',
      tipoAbbr(a.type),
      a.location === 'domicilio' ? 'Domicilio' : 'Centro',
      estadoHistorial(a, hoy).label,
      ep != null ? ep : '',
      ord ? (ord.n ? `${ord.x}/${ord.n}` : String(ord.x)) : '',
      String(a.note || '').replace(/[\n\r,]/g, ' '),
    ]);
  });
  return rows;
}
