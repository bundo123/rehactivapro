// Tests del RANGO de los informes — node --test. Lógica pura, sin DOM.
//
// El bug que matan: los tres análisis con IA (semanal, mensual, anual) pasaban por genSemanalAI,
// que contaba `state.appointments` ENTERO —todo el histórico de la clínica— y lo rotulaba como
// "los datos de la semana". Cada test de acá clava el borde de un rango con una cita justo afuera:
// si alguien vuelve a contar de más, falla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanaRango, citasEnFechas, citasEnPrefijo, nuevosEnPrefijo, resumenCitas, asistidasEn, hastaHoy } from '../js/utils.js';

const cita = (date, status = 'conf', extra = {}) => ({ id: date + status, date, status, ...extra });

// ── semanaRango: qué 5 fechas define "la semana visible" ──────────────────────
test('semanaRango — offset 0 desde un miércoles da Lun–Vie de esa semana', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5)); // miércoles 5 ago 2026
  assert.deepEqual(dates, ['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']);
});

test('semanaRango — el domingo pertenece a la semana que empezó el lunes anterior', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 9)); // domingo 9 ago
  assert.equal(dates[0], '2026-08-03');
  assert.equal(dates[4], '2026-08-07');
});

test('semanaRango — son SIEMPRE 5 días (Lun–Vie): el finde nunca entra', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  assert.equal(dates.length, 5);
  assert.equal(dates.includes('2026-08-08'), false); // sábado
  assert.equal(dates.includes('2026-08-09'), false); // domingo
});

test('semanaRango — el offset mueve el rango y cruza el borde de mes', () => {
  assert.equal(semanaRango(-1, new Date(2026, 7, 5)).dates[0], '2026-07-27');
  assert.equal(semanaRango(1,  new Date(2026, 7, 5)).dates[0], '2026-08-10');
});

// ── citasEnFechas: el rango semanal ───────────────────────────────────────────
test('citasEnFechas — una cita FUERA de la semana no entra en el conteo', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  const agenda = [
    cita('2026-08-04'),   // dentro
    cita('2026-08-06'),   // dentro
    cita('2026-07-31'),   // viernes de la semana ANTERIOR
    cita('2026-08-10'),   // lunes de la semana SIGUIENTE
    cita('2026-08-08'),   // sábado: ni siquiera es día hábil
    cita('2025-08-05'),   // mismo día, OTRO año
  ];
  assert.equal(citasEnFechas(agenda, dates).length, 2);
});

test('citasEnFechas — el histórico entero no se cuela: solo la semana pedida', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  // 50 citas viejas + 3 de la semana: el conteo tiene que ser 3, no 53.
  const viejas = Array.from({ length: 50 }, (_, i) => cita('2024-01-' + String((i % 28) + 1).padStart(2, '0')));
  const agenda = [...viejas, cita('2026-08-03'), cita('2026-08-05'), cita('2026-08-07')];
  assert.equal(citasEnFechas(agenda, dates).length, 3);
});

test('citasEnFechas — citas sin fecha o lista nula no rompen ni suman', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  assert.equal(citasEnFechas([{ id: 'x', status: 'conf' }, null, cita('2026-08-05')], dates).length, 1);
  assert.equal(citasEnFechas(null, dates).length, 0);
  assert.equal(citasEnFechas([cita('2026-08-05')], null).length, 0);
});

// ── citasEnPrefijo: los rangos mensual y anual ────────────────────────────────
test('citasEnPrefijo — mes: el último día del mes anterior y el primero del siguiente quedan fuera', () => {
  const agenda = [
    cita('2026-08-01'), cita('2026-08-31'),   // bordes de agosto: dentro
    cita('2026-07-31'), cita('2026-09-01'),   // bordes de fuera
  ];
  assert.equal(citasEnPrefijo(agenda, '2026-08').length, 2);
});

test('citasEnPrefijo — mes: el MISMO mes de otro año no entra', () => {
  const agenda = [cita('2026-08-05'), cita('2025-08-05'), cita('2024-08-05')];
  assert.equal(citasEnPrefijo(agenda, '2026-08').length, 1);
});

test('citasEnPrefijo — año: entran los 12 meses y nada del año vecino', () => {
  const agenda = [
    cita('2026-01-01'), cita('2026-06-15'), cita('2026-12-31'),
    cita('2025-12-31'), cita('2027-01-01'),
  ];
  assert.equal(citasEnPrefijo(agenda, '2026').length, 3);
});

test('citasEnPrefijo — sin prefijo devuelve VACÍO, nunca el histórico completo', () => {
  const agenda = [cita('2026-08-05'), cita('2025-01-01')];
  assert.equal(citasEnPrefijo(agenda, null).length, 0);
  assert.equal(citasEnPrefijo(agenda, '').length, 0);
  assert.equal(citasEnPrefijo(agenda, undefined).length, 0);
});

test('citasEnPrefijo — el mes acota más que el año (mismos datos, dos rangos)', () => {
  const agenda = [cita('2026-03-10'), cita('2026-08-10'), cita('2026-08-20')];
  assert.equal(citasEnPrefijo(agenda, '2026').length, 3);
  assert.equal(citasEnPrefijo(agenda, '2026-08').length, 2);
});

// ── nuevosEnPrefijo: pacientes nuevos del mes ─────────────────────────────────
test('nuevosEnPrefijo — solo los creados dentro del mes; created_at con hora incluido', () => {
  const pacientes = [
    { id: 1, createdAt: '2026-08-02T14:30:00.000Z' },   // dentro
    { id: 2, createdAt: '2026-08-31T23:59:00.000Z' },   // dentro
    { id: 3, createdAt: '2026-07-31T23:59:00.000Z' },   // mes anterior
    { id: 4, createdAt: '2025-08-02T00:00:00.000Z' },   // otro año
    { id: 5, createdAt: null },                          // sin fecha
  ];
  assert.equal(nuevosEnPrefijo(pacientes, '2026-08'), 2);
  assert.equal(nuevosEnPrefijo(pacientes, '2026'), 3);
  assert.equal(nuevosEnPrefijo(pacientes, null), 0);
  assert.equal(nuevosEnPrefijo(null, '2026-08'), 0);
});

// ── resumenCitas: los conteos que van dentro del prompt ───────────────────────
test('resumenCitas — cuenta por estado y calcula las dos tasas', () => {
  const r = resumenCitas([
    cita('2026-08-03', 'conf'), cita('2026-08-04', 'conf'), cita('2026-08-05', 'conf'),
    cita('2026-08-06', 'noas'), cita('2026-08-07', 'pend'),
  ]);
  assert.equal(r.total, 5);
  assert.equal(r.conf, 3);
  assert.equal(r.noas, 1);
  assert.equal(r.pend, 1);
  assert.equal(r.asistencia, 60);    // 3/5 — incluye la pendiente en el total
  assert.equal(r.continuidad, 75);   // 3/4 — solo las decididas (conf+noas)
});

test('resumenCitas — sin citas: 0 y null, jamás NaN ni un 0% inventado', () => {
  const r = resumenCitas([]);
  assert.equal(r.total, 0);
  assert.equal(r.asistencia, 0);
  assert.equal(r.continuidad, null);
  assert.equal(Number.isNaN(r.asistencia), false);
});

test('resumenCitas — todas pendientes: no hay continuidad que calcular', () => {
  const r = resumenCitas([cita('2026-08-03', 'pend'), cita('2026-08-04', 'pend')]);
  assert.equal(r.continuidad, null);
  assert.equal(r.asistencia, 0);
});

test('resumenCitas — lista nula no rompe', () => {
  assert.equal(resumenCitas(null).total, 0);
});

// ── Integración de los tres rangos sobre UNA misma agenda ─────────────────────
// La prueba de fuego del bug: la misma agenda leída con los tres rangos tiene que dar tres
// números distintos. Si alguno vuelve a contar el histórico, los tres se igualan y esto falla.
test('los tres rangos leen la MISMA agenda y dan conteos distintos', () => {
  const agenda = [
    cita('2026-08-03', 'conf'), cita('2026-08-05', 'conf'),   // semana visible
    cita('2026-08-20', 'conf'),                                // mismo mes, otra semana
    cita('2026-02-10', 'conf'),                                // mismo año, otro mes
    cita('2019-05-05', 'conf'), cita('2020-01-01', 'conf'),    // histórico viejo
  ];
  const { dates } = semanaRango(0, new Date(2026, 7, 5));

  assert.equal(resumenCitas(citasEnFechas(agenda, dates)).conf, 2);        // semanal
  assert.equal(resumenCitas(citasEnPrefijo(agenda, '2026-08')).conf, 3);   // mensual
  assert.equal(resumenCitas(citasEnPrefijo(agenda, '2026')).conf, 4);      // anual
  assert.equal(agenda.length, 6);                                          // el histórico: lo que YA NO se manda
});

test('mes con datos vs mes anterior vacío — la comparación mensual no arrastra el histórico', () => {
  const agenda = [cita('2026-08-10', 'conf'), cita('2019-07-10', 'conf')];
  assert.equal(resumenCitas(citasEnPrefijo(agenda, '2026-08')).conf, 1);
  assert.equal(resumenCitas(citasEnPrefijo(agenda, '2026-07')).total, 0);   // julio 2026 vacío, pese al 2019
});

// ── _apptStats (informes.js) delega en estos helpers: una sola fórmula ────────
// _apptStats es privada de informes.js y ese módulo no se puede importar en node (registra
// listeners de `document` al evaluarse). Así que acá va la fórmula HISTÓRICA de la pantalla,
// copiada del código que _apptStats tenía antes de delegar, y se exige que dé exactamente lo
// mismo que resumenCitas(citasEnPrefijo(...)). Si alguien toca resumenCitas y los KPIs del
// informe mensual/anual dejan de cuadrar con lo que ve la clínica, falla acá.
const apptStatsLegacy = (appts, prefix) => {
  const ap = appts.filter(a => a.date && a.date.startsWith(prefix));
  const conf = ap.filter(a => a.status === 'conf').length;
  const noas = ap.filter(a => a.status === 'noas').length;
  const dec = conf + noas;
  return { total: ap.length, conf, noas, cont: dec > 0 ? Math.round(conf / dec * 100) : null };
};

const AGENDAS = {
  'mezcla de estados': [
    cita('2026-08-03','conf'), cita('2026-08-04','conf'), cita('2026-08-05','noas'),
    cita('2026-08-06','pend'), cita('2026-07-30','conf'), cita('2019-05-05','noas'),
  ],
  'solo asistidas': [cita('2026-08-03','conf'), cita('2026-08-10','conf')],
  'solo inasistencias': [cita('2026-08-03','noas'), cita('2026-08-10','noas')],
  'division no exacta (2/3)': [cita('2026-08-03','conf'), cita('2026-08-04','conf'), cita('2026-08-05','noas')],
  'mes sin ninguna cita': [cita('2019-05-05','conf')],
  'mes solo con pendientes': [cita('2026-08-03','pend'), cita('2026-08-04','pend')],
};

for (const [nombre, agenda] of Object.entries(AGENDAS)) {
  test(`_apptStats vs resumenCitas — ${nombre}: idéntico total/conf/noas/continuidad`, () => {
    for (const prefix of ['2026-08', '2026', '2019']) {
      const viejo = apptStatsLegacy(agenda, prefix);
      const nuevo = resumenCitas(citasEnPrefijo(agenda, prefix));
      assert.equal(nuevo.total, viejo.total, `total en ${prefix}`);
      assert.equal(nuevo.conf, viejo.conf, `conf en ${prefix}`);
      assert.equal(nuevo.noas, viejo.noas, `noas en ${prefix}`);
      assert.equal(nuevo.continuidad, viejo.cont, `continuidad en ${prefix}`);
    }
  });
}

test('_apptStats vs resumenCitas — sin citas decididas la continuidad es null en ambos (no 0%)', () => {
  const soloPend = [cita('2026-08-03','pend'), cita('2026-08-04','pend')];
  const viejo = apptStatsLegacy(soloPend, '2026-08');
  const nuevo = resumenCitas(citasEnPrefijo(soloPend, '2026-08'));
  assert.equal(viejo.cont, null);
  assert.equal(nuevo.continuidad, null);
  assert.equal(nuevo.total, 2);          // las pendientes sí cuentan en el total
});

test('_apptStats vs resumenCitas — mes vacío: continuidad null y ceros, nunca NaN', () => {
  const viejo = apptStatsLegacy([cita('2019-05-05','conf')], '2026-08');
  const nuevo = resumenCitas(citasEnPrefijo([cita('2019-05-05','conf')], '2026-08'));
  assert.equal(nuevo.continuidad, viejo.cont);
  assert.equal(nuevo.continuidad, null);
  assert.equal(nuevo.total, 0);
  assert.equal(nuevo.conf, 0);
});

test('la continuidad NO es la asistencia: con pendientes en el rango difieren', () => {
  // 2 conf, 1 noas, 1 pend → continuidad 2/3 = 67%, asistencia 2/4 = 50%.
  const r = resumenCitas([cita('2026-08-03','conf'), cita('2026-08-04','conf'),
                          cita('2026-08-05','noas'), cita('2026-08-06','pend')]);
  assert.equal(r.continuidad, 67);
  assert.equal(r.asistencia, 50);
});

// ── asistidasEn: "asistidas" no es lo mismo que "confirmadas" ─────────────────
// El semanal contaba TODAS las conf de la semana visible. Un lunes, las conf del jueves y el
// viernes todavía no ocurrieron: el número arrancaba inflado y se "corregía" solo al cerrar la
// semana. Asistidas = conf con fecha <= hoy, y nada más.
test('asistidasEn — una conf FUTURA de la semana en curso no cuenta como asistida', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));   // lun 3 – vie 7 ago 2026
  const agenda = [
    cita('2026-08-03', 'conf'), cita('2026-08-04', 'conf'), cita('2026-08-05', 'conf'), // ya pasaron
    cita('2026-08-06', 'conf'), cita('2026-08-07', 'conf'),                              // jue y vie: futuras
    cita('2026-08-04', 'noas'), cita('2026-08-05', 'pend'),                              // ni noas ni pend suman
    cita('2026-08-12', 'conf'),                                                          // otra semana
  ];
  const sem = citasEnFechas(agenda, dates);
  assert.equal(asistidasEn(sem, '2026-08-05'), 3);            // miércoles: solo lo que ya ocurrió
  assert.equal(resumenCitas(sem).conf, 5);                    // conf a secas sí las cuenta: por eso hace falta
  assert.equal(asistidasEn(sem, new Date(2026, 7, 5)), 3);    // acepta Date, no solo 'YYYY-MM-DD'
});

test('asistidasEn — el día de hoy SÍ entra y la semana cerrada las cuenta todas', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  const sem = citasEnFechas([
    cita('2026-08-03', 'conf'), cita('2026-08-05', 'conf'), cita('2026-08-07', 'conf'),
  ], dates);
  assert.equal(asistidasEn(sem, '2026-08-05'), 2);   // el borde (hoy) cuenta
  assert.equal(asistidasEn(sem, '2026-08-09'), 3);   // domingo: la semana ya cerró
  assert.equal(asistidasEn(sem, '2026-08-02'), 0);   // antes del lunes: ninguna
});

test('asistidasEn — lista nula, cita sin fecha o `hoy` vacío no rompen ni suman', () => {
  assert.equal(asistidasEn(null, '2026-08-05'), 0);
  assert.equal(asistidasEn([{ id: 'x', status: 'conf' }], '2026-08-05'), 0);
  assert.equal(asistidasEn([cita('2026-08-03', 'conf')], null), 0);
  assert.equal(asistidasEn([cita('2026-08-03', 'conf')], ''), 0);
});

// ── Una sola fórmula: la tarjeta del semanal ya no calcula su propia tasa ─────
// El semanal mostraba "Asistencia" = conf/total (las pendientes en el denominador) y el mensual
// "Continuidad" = conf/decididas. La misma clínica daba 84% el viernes y 92% el día 1. Ahora los
// tres rangos leen resumenCitas().continuidad; si alguien vuelve a meter conf/total, falla acá.
test('la continuidad semanal es resumenCitas().continuidad — la MISMA fórmula que mensual/anual', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  const agenda = [
    cita('2026-08-03', 'conf'), cita('2026-08-04', 'conf'), cita('2026-08-05', 'conf'),
    cita('2026-08-06', 'noas'), cita('2026-08-07', 'pend'),   // la pend NO entra en la tasa
    cita('2026-08-20', 'conf'), cita('2026-08-21', 'noas'),   // mismo mes, fuera de la semana
  ];
  const sem = resumenCitas(citasEnFechas(agenda, dates));
  const mes = resumenCitas(citasEnPrefijo(agenda, '2026-08'));

  const formula = r => Math.round(r.conf / (r.conf + r.noas) * 100);
  assert.equal(sem.continuidad, formula(sem));   // semanal
  assert.equal(mes.continuidad, formula(mes));   // mensual: la misma cuenta, otro rango
  assert.equal(sem.continuidad, 75);             // 3/4
  assert.equal(sem.asistencia, 60);              // la vieja "Asistencia" (3/5) daba OTRO número
  assert.notEqual(sem.continuidad, sem.asistencia);
});

test('la continuidad semanal es null (no 0%) en una semana sin citas decididas', () => {
  const { dates } = semanaRango(0, new Date(2026, 7, 5));
  const sem = resumenCitas(citasEnFechas([cita('2026-08-03', 'pend'), cita('2026-08-04', 'pend')], dates));
  assert.equal(sem.continuidad, null);   // la tarjeta pinta '—'
  assert.equal(asistidasEn(citasEnFechas([cita('2026-08-03', 'pend')], dates), '2026-08-05'), 0);
});

// ── hastaHoy: el rango EN CURSO no se cuenta entero ───────────────────────────
// El bug que matan: "Asistidas" excluía las conf futuras y la "Continuidad" no. La pantalla
// mostraba Asistidas 54, No asistieron 14 y Continuidad 89% — 54/(54+14) es 79%. El 89% salía de
// contar también las 59 conf ya agendadas para el resto de la semana.
test('hastaHoy — recorta el rango a lo que YA ocurrió; lo futuro queda afuera', () => {
  const agenda = [
    cita('2026-09-01', 'conf'), cita('2026-09-01', 'noas'), cita('2026-09-01', 'pend'),
    cita('2026-09-02', 'conf'),   // hoy: entra (el borde cuenta)
    cita('2026-09-03', 'conf'), cita('2026-09-04', 'pend'),   // futuras: fuera
  ];
  assert.equal(hastaHoy(agenda, '2026-09-02').length, 4);
  assert.equal(hastaHoy(agenda, new Date(2026, 8, 2)).length, 4);   // acepta Date
  assert.equal(hastaHoy(agenda, '2026-09-30').length, 6);           // rango cerrado: no recorta nada
  assert.equal(hastaHoy(agenda, '2026-08-31').length, 0);
  assert.equal(hastaHoy(null, '2026-09-02').length, 0);
  assert.equal(hastaHoy(agenda, null).length, 0);                   // sin fecha, VACÍO, no el rango entero
  assert.equal(hastaHoy([{ id: 'x', status: 'conf' }], '2026-09-02').length, 0);   // cita sin fecha
});

test('la continuidad de una semana EN CURSO no cuenta las conf futuras (79%, no 89%)', () => {
  // Martes 1 sep 2026: 54 asistidas + 14 inasistencias ya ocurridas, y 59 conf agendadas mié–vie.
  const { dates } = semanaRango(0, new Date(2026, 8, 1));   // lun 31 ago – vie 4 sep
  const agenda = [
    ...Array.from({ length: 54 }, (_, i) => cita('2026-08-31', 'conf', { id: 'c' + i })),
    ...Array.from({ length: 14 }, (_, i) => cita('2026-09-01', 'noas', { id: 'n' + i })),
    ...Array.from({ length: 59 }, (_, i) => cita('2026-09-03', 'conf', { id: 'f' + i })),   // futuras
  ];
  const sem = citasEnFechas(agenda, dates);

  assert.equal(resumenCitas(sem).continuidad, 89);                        // lo que se veía: 113/127
  assert.equal(resumenCitas(hastaHoy(sem, '2026-09-01')).continuidad, 79); // lo correcto: 54/68
  assert.equal(asistidasEn(sem, '2026-09-01'), 54);                        // la tarjeta ya decía 54
});

test('asistidasEn(rango) === resumenCitas(hastaHoy(rango)).conf — por construcción', () => {
  const { dates } = semanaRango(0, new Date(2026, 8, 1));
  const agenda = [
    cita('2026-08-31', 'conf'), cita('2026-09-01', 'conf'), cita('2026-09-01', 'noas'),
    cita('2026-09-02', 'conf'), cita('2026-09-03', 'conf'), cita('2026-09-04', 'pend'),
  ];
  for (const hoy of ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-03', '2026-09-09']) {
    const rango = citasEnFechas(agenda, dates);
    assert.equal(asistidasEn(rango, hoy), resumenCitas(hastaHoy(rango, hoy)).conf, 'semana al ' + hoy);
    // y lo mismo para el rango mensual y el anual, que es de donde salen las tarjetas de esas pestañas
    for (const prefix of ['2026-09', '2026']) {
      const r = citasEnPrefijo(agenda, prefix);
      assert.equal(asistidasEn(r, hoy), resumenCitas(hastaHoy(r, hoy)).conf, prefix + ' al ' + hoy);
    }
  }
});

test('un rango ya CERRADO da lo mismo con y sin hastaHoy', () => {
  // Agosto visto desde septiembre: no hay nada futuro que recortar. Si esto falla, hastaHoy está
  // comiéndose citas pasadas.
  const agosto = citasEnPrefijo([
    cita('2026-08-03', 'conf'), cita('2026-08-20', 'conf'), cita('2026-08-25', 'noas'),
    cita('2026-09-10', 'conf'),
  ], '2026-08');
  assert.deepEqual(resumenCitas(hastaHoy(agosto, '2026-09-01')), resumenCitas(agosto));
  assert.equal(resumenCitas(agosto).continuidad, 67);
});
