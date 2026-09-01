// ── Datos del export: la fuente ÚNICA de las dos salidas ────────────────────────────────────
//
// Resuelve, de una vez, los terapeutas de un export y sus citas ya normalizadas (nombre en
// mayúsculas, ordinal del episodio, lugar C/D). La usan `generarExcel()` (js/excel.js) y
// `generarFotos()` (js/foto.js): que las dos salgan de acá es lo que garantiza que el .xlsx y la
// foto digan exactamente lo mismo, sin una sola regla duplicada.
//
// Vive en su propio archivo, y no dentro de excel.js, para que la dependencia vaya en UNA sola
// dirección: excel.js y foto.js dependen de este módulo, y foto.js no depende de excel.js. Con
// `datosExport` dentro de excel.js quedaba un ciclo excel ↔ foto que funciona pero se lee mal.
//
// El mapeo cita → (hoja, fila, bloque) NO está acá: ese es `planificarDia()` de excel-layout.js,
// y también lo comparten las dos salidas.
import { state } from './state.js';
import { getPatient, orderedTherapists, ordinalesDeCitas } from './utils.js';
import { diasDelRango, ESTADOS_EXPORTABLES } from './excel-layout.js';

// desde/hasta: 'YYYY-MM-DD' inclusive. terapeutaIds: null = todos; array = solo esos (siempre en
// el orden canónico de la agenda, no en el del array). Devuelve {dias, terapeutas, citas, unico}.
export function datosExport({ desde, hasta, terapeutaIds = null }) {
  const dias = diasDelRango(desde, hasta);
  if (!dias.length) throw new Error('El rango de fechas no es válido.');

  const todos = orderedTherapists();
  const terapeutas = terapeutaIds && terapeutaIds.length
    ? todos.filter(t => terapeutaIds.some(id => String(id) === String(t.id)))
    : todos;
  if (!terapeutas.length) throw new Error('No hay terapeutas para exportar.');

  // Ordinal "X del episodio" — el MISMO mapa que pinta el badge de la agenda, calculado una vez
  // sobre TODAS las citas (el universo del ordinal es la secuencia completa del paciente, no el
  // rango exportado).
  const ordMap = ordinalesDeCitas(state.appointments, getPatient);

  const idsOk = new Set(terapeutas.map(t => String(t.id)));
  const citas = state.appointments
    .filter(a => a && a.date >= desde && a.date <= hasta && idsOk.has(String(a.therapistId)))
    .map(a => {
      const pt = getPatient(a.patientId);
      const ord = ordMap.get(a);
      return {
        id: a.id, date: a.date, hour: a.hour, status: a.status, therapistId: a.therapistId,
        paciente: (pt ? pt.name : (a.patientName || 'Sin paciente')).toUpperCase(),
        numero: ord ? ord.x : null,
        lugar: a.location === 'domicilio' ? 'D' : 'C',
      };
    });

  const unico = terapeutaIds && terapeutaIds.length && terapeutas.length === 1 ? terapeutas[0] : null;
  return { dias, terapeutas, citas, unico };
}

// ¿Cuántas citas exportables hay en un día, con el filtro de terapeuta puesto? Lo usan las notas
// de ayuda del modal, que corren en cada cambio del formulario y no pueden pagar un datosExport()
// entero (que recalcula el mapa de ordinales de TODAS las citas).
export function citasDelDia(fecha, thId = null) {
  return state.appointments.filter(a => a && a.date === fecha &&
    ESTADOS_EXPORTABLES.includes(a.status) &&
    (!thId || String(a.therapistId) === String(thId))).length;
}
