// Espejo en JS del backfill de episodios.sql (e1 + e2), solo para las pruebas.
// Toma un paciente con marcadores 'Fin de episodio' en p.log (la forma de antes de EPI-2a) y le arma
// p.episodios como lo deja el SQL: uno "desde el inicio" y, por cada marcador ordenado por fecha,
// la foto del que cierra (diag de la nota; plan = el N de "N sesiones") y uno nuevo con
// desde = fecha del marcador + 1 día. Los marcadores quedan en el log, inertes.
// Así cada prueba vieja con marcadores es también una prueba de EQUIVALENCIA: mismo resultado con
// la tabla que el que daba la frontera por marcadores.
import { mapEpisodioRow } from '../js/utils.js';

function diaSiguiente(ds) {
  const [y, m, d] = String(ds).split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + 1));
  return f.toISOString().slice(0, 10);
}

export function episodiosDesdeMarcadores(log) {
  const fins = (log || []).filter(s => s && s.type === 'Fin de episodio' && s.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const filas = [{ desde: null, diag: null, sesiones_plan: null, sesiones_previas: 0 }];
  for (const fin of fins) {
    const desde = diaSiguiente(fin.date);
    if (filas.some(e => e.desde === desde)) continue;           // mismo día: ya migrado
    const cierra = filas.filter(e => !e.desde || e.desde <= fin.date)
      .sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')))[0];
    const note = String(fin.note || '');
    const diag = (note.split('Episodio anterior: ')[1] || '').split(' · ')[0].trim();
    const n = note.match(/(\d+) sesiones/);
    cierra.diag = diag || 'Tratamiento anterior';
    cierra.sesiones_plan = n ? parseInt(n[1], 10) : null;
    filas.push({ desde, diag: null, sesiones_plan: null, sesiones_previas: 0 });
  }
  return filas.map((f, i) => mapEpisodioRow({ id: 'ep' + i, ...f }));
}

// Devuelve el MISMO objeto con p.episodios armado (las pruebas comparan por identidad).
export function conEpisodios(p) {
  if (p) p.episodios = episodiosDesdeMarcadores(p.log);
  return p;
}
