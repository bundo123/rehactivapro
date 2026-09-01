# LOTE 1 — HISTORIAL DE CITAS · plan, diseño y prompt para CC

**Fecha:** 2026-09-01 · **Base:** main = `8f5405f` (clonado y leído) · **Tag:** Medium · **SQL:** ninguno · **Chat:** FABLE (planeación) → CC en Sonnet ejecuta → FABLE audita.

---

## 0. Lo que encontré en el código (base técnica)

Cosas que cambian el plan respecto al prompt del handoff:

| Punto del handoff | Lo que dice el código | Consecuencia |
|---|---|---|
| "De dónde sale el N° ordinal del episodio, mira `js/excel-layout.js`" | `excel-layout.js` NO calcula ordinales: su columna "N°" del bloque es la del histórico y queda vacía/por confirmar (`excel.js:84,116`). El ordinal vive en **`utils.js:535-571`**: `citasNumerables` → `citaOrdinal` / `ordinalesDeCitas`. | Reusar la regla de `citasNumerables` (no-asistió no consume número; frontera estricta `date > fin`). |
| Ordinal "por episodio" | `ordinalesDeCitas` numera **solo el episodio actual** (filtra `date > lastFinDate`, `utils.js:536-538`). Los episodios cerrados no tienen ordinal en ningún lado. | Hace falta una función nueva que segmente TODO el histórico por episodio y numere dentro de cada uno. Ver §2.2. |
| "Reusa el combobox del informe de paciente" | El combobox (`informes.js:412-490`) está cableado a ids fijos (`#patient-rpt-search/-results/-select`) y a estado de módulo (`_rptResults`, `_rptHi`). No es reutilizable tal cual. | Extraerlo a una fábrica `crearComboPaciente({...ids, onSelect})` en un módulo nuevo. Historial la usa; el informe **no se toca** en este lote (acaba de pasar auditoría). Migrarlo queda anotado como deuda. |
| Diagnóstico del episodio cerrado | Se parsea la nota del marcador `'Fin de episodio'` con `split('Episodio anterior: ')` en **dos lugares** (`informes.js:506` y `:538`) y el N de sesiones con regex en `:539`. | Centralizar en `utils.js` → `parseFinNote(note)`; Historial la usa. (Informes podrá usarla después.) |
| Botón del modal | `#appt-goto-rpt` (`index.html:445`) es UN botón, ahora visible en todos los dispositivos (`responsive.css:919-940`), poblado por `setApptRptShortcut` (`agenda.js:380-386`) y disparado por `verInformeDeCita` (`agenda.js:388-397`). | Partirlo en dos con el MISMO `data-pid`. |
| Pestañas | `showTab` (`main.js:111-133`) recorre `allTabs` (`utils.js:86`) para mostrar/ocultar `#tab-*`. | Si `'historial'` no entra en `allTabs`, la pantalla nunca se oculta/muestra. Tres lugares: `allTabs`, `ROLE_TABS`, `showTab`. |
| Realtime | `_refreshTabAfterAppt` (`realtime.js:93-100`) re-renderiza solo agenda/resumen/facturación/seguimiento. | Agregar `historial` o la pantalla queda vieja cuando la secretaria mueve una cita desde otra PC. |
| Impresión con membrete | Ya existe el patrón: `openPdfWindow(html)` (`informes.js:902-907`, **no exportada**) + `buildPdfHtml` (pura, `:793-900`) con `LOGO_DATA_URI` y `CONFIG_CLINICA`. | Exportar `openPdfWindow` y escribir un `buildHistorialPrintHtml(model)` puro con el mismo look documental (sin verdes ni semáforos). |
| Export | `exportAgendaCSV` (`agenda.js:884-927`) ya arma CSV con BOM y descarga por blob. | Mismo patrón; no inventar otro. |
| Rendimiento | `loadAll` trae **todas** las citas sin recorte de fecha (`auth.js:54`) y todo vive en `state.appointments`. ~190 pacientes; a 5 terapeutas × ~10 citas/día son ~12–13k citas/año. Filtrar por paciente es O(n) sobre ese array: < 1 ms. | No hace falta indexar nada. Sí: calcular UNA vez por render (mismo patrón que `ordinalesDeCitas`, `agenda.js:178`) y no dentro del `.map` de filas. El costo real futuro es `loadAll` sin ventana de fechas, pero no es de este lote. |
| Recurrencia | `getRecDates` (`agenda.js:677-691`) con `semanas=1` recorre `w=0, d=0..6` y filtra `ds>baseDate`: devuelve los días elegidos que quedan en los 7 días siguientes a la base. | Agregar `<option value="1">1 semana</option>` en `index.html:552` funciona sin tocar JS. El preview (`updateRecPreview`) ya muestra las fechas. Default sigue `value="4" selected`. |

**Definición de "asistencia" que voy a usar (y que hay que fijar en el código):** cita con `status === 'conf'` y `date <= hoy`. Motivo: `checkAutoNoas` (`agenda.js:95-106`) pasa a `noas` toda `pend` vencida, así que una `conf` pasada es una cita atendida; una `conf` futura es una cita agendada, no una asistencia. Es la misma lectura que hace Seguimiento ("cita pasada = conf con fecha ≤ hoy", `utils.js:611-612`).

---

## 1. Qué es la pantalla

**Historial de citas.** Pantalla propia en el nav, sección "Clínica", debajo de Agenda. La ven los tres roles. Responde en segundos: *"¿cuántas veces ha venido?"*.

Patrón visual: el de **Seguimiento** (`index.html:233-260`, `seguimiento.js`): `main-header` + `main-body` con `search-row` (buscador + pills) + tarjeta con `.patient-table`. Así hereda gratis el apilado móvil de `responsive.css:160-244` y el tema.

---

## 2. Diseño

### 2.1 Layout (desktop; móvil apila solo)

```
┌ main-header ───────────────────────────────────────────────────────────────┐
│ Historial de citas                     [🔍 Buscar y elegir paciente…   ▾]  │
│ Cuántas veces ha venido cada paciente                                      │
└────────────────────────────────────────────────────────────────────────────┘
┌ main-body ─────────────────────────────────────────────────────────────────┐
│ ┌ cabecera del paciente ───────────────────────────────────────────────┐   │
│ │ MARÍA GARCÍA · 54 años · Lumbalgia (M54.5) · Dr. Cueva               │   │
│ │                                                  [Ver informe] [+ Cita]│   │
│ │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │   │
│ │ │ ASISTENCIAS│ │ Inasist.   │ │ Próximas   │ │ Última vez │          │   │
│ │ │    38      │ │  4 · 10%   │ │     2      │ │ hace 3 días│          │   │
│ │ │ histórico  │ │            │ │ mié 3 sep  │ │ 29/08/2026 │          │   │
│ │ └────────────┘ └────────────┘ └────────────┘ └────────────┘          │   │
│ └──────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ Corte: (Histórico) (Episodio actual · 12/15) (Episodio 1 · 20)             │
│ Mes: [Todos ▾]   Estado: (Todas) (Asistió) (No asistió) (Pendiente)        │
│                                                  [Imprimir] [Exportar CSV] │
│ ┌ .patient-table ──────────────────────────────────────────────────────┐   │
│ │ FECHA      HORA  TERAPEUTA     TIPO   MOD  ESTADO       N°           │   │
│ │ ▸ Septiembre 2026 — 1 asistencia · 0 inasistencias · 2 próximas      │   │
│ │ mié 03 sep 10:00 Marco Barros  Fisio  C    ● Pendiente   —            │   │
│ │ lun 01 sep 09:00 Marco Barros  Fisio  C    ✓ Asistió     12/15        │   │
│ │ ▸ Agosto 2026 — 8 asistencias · 1 inasistencia                        │   │
│ │ vie 29 ago 09:00 Marco Barros  Fisio  C    ✓ Asistió     11/15        │   │
│ │ mié 27 ago 09:00 Axel Escobar  Fisio  D    ✗ No asistió  —            │   │
│ │ …                                                                     │   │
│ │ ▸ Junio 2026 — 6 asistencias · 0 inasistencias      [Episodio 1]      │   │
│ └──────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

Reglas:

- **El número grande es ASISTENCIAS** (`.stat-val` 24px, mismo `.stat` que mensual/anual, `screens.css:250-254`). Los otros tres son secundarios. Cambia con el **corte**: "histórico" muestra el total; "Episodio actual" muestra `X` y el sub-texto `de N del plan` (N = `p.sessions`, igual que el badge `X/N` de agenda, `agenda.js:58-63`); un episodio cerrado muestra sus asistencias y `de N` con el N parseado de la nota de fin.
- **Inasistencias** con % = `noas / (conf pasadas + noas)` — es la fórmula de **continuidad** invertida (`resumenCitas`, `utils.js:180-190`), no una tercera fórmula. Mostrar `—` si no hay decididas.
- **Próximas** = citas con `date > hoy` (conf o pend); sub-texto = la más cercana en `fmtFechaCorta`.
- **Última vez** = última asistencia; sub-texto = `relativeTime`-like en días ("hace 3 días" / "hace 2 meses").
- **Corte** = chips `.filter-pill`: `Histórico` (default) + un chip por episodio, del más nuevo al más viejo: `Episodio actual · 12/15`, `Episodio 1 · 20`, … (el número que va en el chip = asistencias del episodio; así se contesta "por episodio" sin abrir nada).
- **Mes** = `<select class="hdr-select">` con los meses que tienen citas de ese paciente (desc) + "Todos". **Estado** = pills.
- La tabla lista **todas** las citas del corte/filtro, más nueva arriba, **agrupadas por mes** con fila de subtotal (`<tr class="hist-mes">`, colspan 7). Cuando el corte es "Histórico", la fila de mes dice además a qué episodio pertenece si cambia dentro de la vista (etiqueta `Episodio 1`), para que se vea el corte sin abrir el chip.
- Columnas: `Fecha` (`fmtFechaCorta`: "vie 29 ago"), `Hora` (`fmtTime`), `Terapeuta` (`getTherapist(...)?.name ?? '—'`), `Tipo` (abreviado: `TIPOS_SESION[].abbr` → "fisio"/"resp"), `Mod` ("C"/"D" con `title` "Centro"/"Domicilio"), `Estado` (punto `dotColor` + texto: Asistió / No asistió / Pendiente / **Agendada** para conf futura), `N°` (ordinal del episodio: `12/15`, `12` sin plan, `—` en no-asistió/pendiente — mismo texto que `ordinalTexto`).
- Click en una fila → `openEditApptModal(id)` (la cita existe en `state`, el modal ya sabe abrir cualquiera). Con `hasPermission('createAppt')` se ve además el botón `+ Cita` en la cabecera → `agendarCitaParaPaciente(id)` (ya existe).
- **Vacío**: sin paciente elegido → "Buscá un paciente para ver su historial". Paciente sin citas → "Sin citas registradas".

### 2.2 Cálculo (puro, testeable, sin DOM) — módulo nuevo `js/historial-calc.js`

Todo lo de abajo son funciones puras que reciben `(appointments, patient, hoy)`; `hoy` se inyecta para testear (mismo patrón que `therapistDeleteBlock`, `citasParaCierre`).

```js
// Episodios del paciente a partir de los marcadores 'Fin de episodio' del log.
// Devuelve del MÁS VIEJO al más nuevo; el último es el actual (hasta: null).
//   [{ idx:1, desde:null,        hasta:'2026-06-30', diag:'Cervicalgia', plan:20, actual:false },
//    { idx:2, desde:'2026-06-30', hasta:null,        diag:p.diag,        plan:p.sessions, actual:true }]
// Frontera ESTRICTA, la misma de doneActual/citasNumerables/renderPatientReport:
// una cita pertenece al episodio k si  desde_k < date <= hasta_k  (desde null = -∞, hasta null = +∞).
export function episodiosDePaciente(patient)

// Diagnóstico y plan del episodio cerrado, desde la nota del marcador.
// Formato que escribe guardarNuevoEpisodio: "… Episodio anterior: <diag> · <N> sesiones …"
// (hoy parseado en informes.js:506 y :538-540). Devuelve { diag, plan } con fallbacks
// ('Tratamiento anterior', null). Vive en utils.js para que informes.js pueda migrar a ella.
export function parseFinNote(note)

// Citas del paciente, ascendentes por fecha y hora. Mismo orden que citasNumerables.
export function citasDePaciente(appointments, patientId)

// Índice de episodio de una cita (1-based) según la lista de episodiosDePaciente.
export function episodioDeCita(cita, episodios)

// Ordinal por episodio: Map cita → { x, n, ep }. Numera SOLO las no-'noas' (un no-show no consume
// número — regla de utils.js:532-533), reinicia en cada episodio, n = plan del episodio.
// INVARIANTE (test obligatorio): para el episodio actual, x coincide EXACTAMENTE con
// ordinalesDeCitas(appointments, getPatient).get(cita).x para cada cita.
export function ordinalesHistorial(citas, episodios)

// Resumen de un conjunto de citas ya filtrado por corte: asistencias (conf && date<=hoy),
// inasistencias (noas), pendientes (pend), proximas (date>hoy, conf|pend), pctInasistencia
// (noas/(asistencias+noas) o null), ultima (fecha de la última asistencia o null),
// proxima (fecha de la próxima o null).
export function resumenHistorial(citas, hoy)

// Agrupación para la tabla: [{ ym:'2026-08', label:'Agosto 2026', episodios:[2], resumen, citas:[...desc] }]
// ordenada del mes más nuevo al más viejo; dentro de cada mes, citas desc por fecha y hora.
export function agruparPorMes(citas, episodiosPorCita, hoy)

// Filtro compuesto de la pantalla: { corte:'all'|<idx>, mes:'all'|'YYYY-MM', estado:'all'|'asistio'|'noas'|'pend' }
export function filtrarHistorial(citas, episodiosPorCita, filtro, hoy)

// Filas del CSV (misma forma que exportAgendaCSV: array de arrays con cabecera).
export function filasCsvHistorial(citas, episodiosPorCita, ordinales, getTherapistFn)
```

Nota de diseño: **no** reescribir `citasNumerables`/`ordinalesDeCitas` para "unificar". Están en producción, tienen 177 tests (`test/ordinal.test.js`) y la agenda depende de ellas. La unificación se hace por **test de invariante**, no por refactor.

### 2.3 Estado

En `state.js`: `historialPatientId: null`, `historialFiltro: { corte:'all', mes:'all', estado:'all' }`. El filtro se **resetea** al cambiar de paciente (el corte de un paciente no significa nada en otro). `showTab('historial')` NO resetea el paciente: si venías de una cita, tiene que quedarse en ese paciente.

### 2.4 Puertas de entrada — UNA implementación, varias puertas

Función única exportada por `js/historial.js`:

```js
export function irAHistorial(patientId) {
  if (!canAccessTab('historial')) { toastErr('No tienes permisos para acceder a esta sección'); return; }
  state.historialPatientId = patientId != null ? String(patientId) : state.historialPatientId;
  state.historialFiltro = { corte:'all', mes:'all', estado:'all' };
  window._app.showTab('historial');      // showTab → renderHistorial()
}
```

| Puerta | Dónde | Cambio |
|---|---|---|
| Nav | `index.html:96-98` (después de Agenda) | `<button class="nav-item" onclick="showTab('historial')">…Historial de citas</button>` |
| Modal de cita | `index.html:445` | Partir en dos botones hermanos dentro de un `<div id="appt-shortcuts" hidden>`: `#appt-goto-rpt` "Ver informe" y `#appt-goto-hist` "Historial de citas". `setApptRptShortcut` (`agenda.js:380-386`) pone el `data-pid` en el contenedor y el `hidden` en el contenedor, no en cada botón. `verHistorialDeCita()` lee ese `pid` → `closeModal('appt-modal')` → `irAHistorial(pid)`. El CSS de `responsive.css:919-940` pasa a aplicar a `#appt-shortcuts button` (dos botones en fila, `display:flex;gap:8px`). |
| Informe de paciente | `informes.js:698-705` (side-card "Paciente") | Agregar `<button class="side-btn soft" onclick="irAHistorial('${esc(p.id)}')">Historial de citas</button>`. |
| Buscador global | `search.js:18-33` | Cada fila sigue abriendo el informe al click (no cambiar lo que la gente ya usa). Se agrega a la derecha un chip pequeño `Citas` (stopPropagation) → `irAHistorial(p.id)`. |
| Historial → informe | cabecera de la pantalla | `Ver informe` → `verPacienteSeguimiento(id)` ya hace exactamente eso (`seguimiento.js:41-45`); reusar tal cual. |

### 2.5 Combobox de paciente — fábrica

Módulo nuevo `js/patient-combo.js`:

```js
// Crea un combobox buscar+elegir sobre tres elementos que YA existen en el HTML.
// Copia fiel del comportamiento de informes.js:412-490 (lista ordenada, 50 máx., ↑/↓/Enter/Esc,
// cierre al click afuera, onmousedown para ganarle al blur) pero sin ids fijos ni estado de módulo.
export function crearComboPaciente({ inputId, resultsId, hiddenId, onSelect, getPatients = () => state.patients })
// devuelve { setValue(id), getValue(), refresh() }
```

`historial.js` lo instancia una vez en `setupHistorial()` (llamado desde `main.js` junto a `setupSeguimientoSearch()`, `main.js:254`). **`informes.js` no se toca.** Se anota en PROYECTO_ESTADO como deuda: "migrar el combobox del informe a `patient-combo.js` y borrar `_rptResults/_rptHi/filterPatientRptSelect/rptSearchKeydown`".

### 2.6 Imprimir y exportar

- **Imprimir**: `exportarHistorialPDF()` → `openPdfWindow(buildHistorialPrintHtml(model))`. Exportar `openPdfWindow` desde `informes.js` (hoy `function openPdfWindow`, `:902`). `buildHistorialPrintHtml` es **pura** (recibe el modelo, no lee `state`), vive en `historial.js`, copia el header/rule/footer de `buildPdfHtml` (`informes.js:852-899`: logo, `h-title`, `rule-a/rule-b`, `.footer` con `CONFIG_CLINICA`) y su CSS de impresión (`@page{margin:15mm}`, `thead{display:table-header-group}`, `tr{break-inside:avoid}`). Título: "Historial de citas"; sub: nombre · cédula · corte elegido · "N asistencias". Tabla igual a la de pantalla, en gris documental (`#1A1A1A`/`#6B6B66`), sin colores semáforo.
- **Exportar CSV**: `exportarHistorialCSV()` con el mismo cuerpo que `exportAgendaCSV` (`agenda.js:921-926`: BOM, comillas dobladas, `\r\n`, blob). Cabecera: `Fecha,Hora,Terapeuta,Tipo,Modalidad,Estado,Episodio,N_episodio,Notas`. Nombre: `historial-<apellido-slug>-<YYYY-MM-DD>.csv`.
- No hay export a Excel formateado acá: el .xlsx es la agenda de la clínica, otro formato. Si algún día lo piden, es otro lote.

### 2.7 Permisos

- `ROLE_TABS` (`permissions.js:5-9`): agregar `'historial'` a los **tres** roles, después de `'agenda'`.
- No hay acciones nuevas en `ROLE_ACTIONS`: `+ Cita` se muestra con `createAppt` (admin/secretaria); imprimir/exportar los ven los tres (son los mismos datos que ya ven en agenda).
- **Nada de RLS**: no hay tabla nueva ni query nueva.

### 2.8 Varios episodios — cómo se ve el corte

- Chips de corte listan cada episodio con su diagnóstico en `title` y sus asistencias en el chip.
- En "Histórico", las filas de mes llevan la etiqueta del episodio cuando el mes contiene citas de un episodio distinto al de la fila de mes anterior (arriba). Si un mes tiene citas de dos episodios (el corte cayó a mitad de mes), la fila de mes dice `Episodio 1 → Episodio actual` y cada cita lleva su `N°` con el prefijo del episodio (`E1·7/20` vs `12/15`) **solo en ese mes**. Fuera de ese caso el N° va limpio.
- La frontera es la misma que en todos lados (`date > fin`): la cita con la fecha exacta del marcador pertenece al episodio que cierra. Test obligatorio.

---

## 3. Riesgos y decisiones

1. **Nombre de pestaña `'historial'`** y `#tab-historial`: verificar que no choque con nada (`grep -rn "historial" js css index.html` da 0 usos como id de tab hoy).
2. **`allTabs`** (`utils.js:86`): si CC agrega el tab y olvida `allTabs`, la pantalla queda visible encima de otra. El test de humo lo detecta: entrar a Historial y luego a Agenda, la de Historial tiene que desaparecer.
3. **Móvil**: hereda el apilado de `.patient-table` — pero las filas de mes (`colspan=7`) apiladas se ven raras. Regla: `.hist-mes td{display:block}` + `::before` vacío en el bloque `@media (max-width:768px)` de `responsive.css` (donde ya está el patrón `:160-244`). Historial NO es prioritario en móvil (decisión del handoff: el teléfono es "Mi día"), pero no debe romperse.
4. **Deuda anotada, no hecha en este lote**: migrar combobox de informes a la fábrica; `informes.js:506/538` a `parseFinNote`.
5. **Realtime**: `_refreshTabAfterAppt` y `_onPatient` (`realtime.js:93-100`, `:135-140`) → agregar `historial`. `_onSessionLog` también: un 'Fin de episodio' nuevo cambia los cortes.

---

## 4. Orden de trabajo para CC (un solo commit al final)

1. `utils.js`: `parseFinNote`. Tests.
2. `js/historial-calc.js`: las 8 funciones puras. `test/historial.test.js` con casos: frontera estricta; invariante con `ordinalesDeCitas`; no-asistió sin número; mes con dos episodios; paciente sin log; paciente sin citas; asistencia = conf pasada (una conf futura NO suma); `pctInasistencia` null sin decididas.
3. `js/patient-combo.js` (fábrica) — sin tocar informes.js.
4. `index.html`: nav, `#tab-historial`, partir `#appt-goto-rpt`, opción "1 semana".
5. `js/historial.js`: `setupHistorial`, `renderHistorial`, `irAHistorial`, `setHistorialCorte/Mes/Estado`, `exportarHistorialPDF`, `exportarHistorialCSV`, `buildHistorialPrintHtml`.
6. Cableado: `state.js`, `permissions.js` (ROLE_TABS), `utils.js` (`allTabs`), `main.js` (import, `showTab`, `window.*`, `setupHistorial()`), `agenda.js` (`setApptRptShortcut` + `verHistorialDeCita`), `informes.js` (export `openPdfWindow`, botón side-card), `search.js` (chip), `realtime.js` (3 refrescos), `css/screens.css` (bloque `/* ===== HISTORIAL ===== */`), `css/responsive.css` (fila de mes apilada).
7. `npm test` verde, `npm run build` sin errores nuevos (el warning de chunk >500 kB ya existe en main, no es de este lote).
8. Commit único → `git push -f origin HEAD:revision-historial` (rama local se llama `revision-historial`).

---

## 5. PROMPT PARA CC (copiar tal cual, con este archivo adjunto)

```
LOTE HISTORIAL DE CITAS — ejecución. Medium. SIN SQL. Sin subagentes. Un solo commit al final.
Adjunto LOTE1_HISTORIAL_CITAS_PLAN.md: es la spec. Leelo entero antes de tocar nada. Si algo del
plan no cuadra con el código que ves, PARÁ y decímelo antes de improvisar.

Base: main = 8f5405f. Creá la rama local `revision-historial` desde main.

QUÉ VAS A CONSTRUIR
Pantalla nueva "Historial de citas" (tab 'historial') para los tres roles: buscador de paciente,
número grande = ASISTENCIAS (conf con fecha <= hoy), cortes por episodio, filtros de mes y estado,
tabla agrupada por mes con subtotales, imprimir con membrete y exportar CSV. Detalle en §2 del plan.

REGLAS DURAS
- Cálculo puro en js/historial-calc.js (sin DOM, sin state) + parseFinNote en utils.js. Tests en
  test/historial.test.js con node --test (npm test). NO uses vitest.
- NO modifiques citasNumerables / citaOrdinal / ordinalesDeCitas (utils.js:535-571). Tu
  ordinalesHistorial tiene que coincidir con ordinalesDeCitas para el episodio actual, y eso se
  prueba con un test, no cambiando la función vieja.
- Frontera de episodio ESTRICTA: date > fin. Es la misma regla de doneActual y citasNumerables.
- Combobox: creá js/patient-combo.js (fábrica crearComboPaciente) copiando el comportamiento de
  informes.js:412-490. NO toques el combobox de informes.js.
- Una sola implementación de la pantalla, varias puertas: irAHistorial(patientId) es la ÚNICA
  entrada. La usan: nav, modal de cita (partir #appt-goto-rpt en dos botones dentro de un
  contenedor #appt-shortcuts con el data-pid), side-card "Paciente" del informe, chip "Citas" en el
  buscador global.
- Imprimir: exportá openPdfWindow desde informes.js y usalo. buildHistorialPrintHtml es pura y copia
  el look documental de buildPdfHtml (logo, rule, footer con CONFIG_CLINICA, sin colores semáforo).
- CSV: mismo patrón que exportAgendaCSV (BOM, comillas, \r\n, blob).
- Tres lugares obligatorios para que la pestaña exista: allTabs (utils.js:86), ROLE_TABS
  (permissions.js:5-9, los tres roles) y showTab (main.js:111-133). Realtime: agregá 'historial' a
  _refreshTabAfterAppt, _onPatient y _onSessionLog.
- De paso: opción "1 semana" en el select de recurrencia (index.html:552, value="1"), el default
  sigue en 4. No toques getRecDates.
- CSS: bloque nuevo /* ===== HISTORIAL ===== */ en css/screens.css reusando .patient-table, .stat,
  .filter-pill, .hdr-select, .search-row. Nada de sistema visual nuevo. En responsive.css, la fila
  de mes (.hist-mes) apilada en móvil no debe verse rota.
- Comentarios en el código explicando POR QUÉ (como el resto del repo), no qué.

AL TERMINAR REPORTÁ
1) npm test: total de tests y cuántos son nuevos. 2) npm run build: salida (el warning de chunk
>500 kB es preexistente). 3) Lista de archivos tocados con una línea por archivo. 4) Los tres
lugares de la pestaña (allTabs / ROLE_TABS / showTab) con número de línea. 5) El hash del commit
y confirmación de `git push -f origin HEAD:revision-historial`. 6) Qué NO pudiste verificar
(la pantalla real la pruebo yo en localhost:5173).

NO hagas push a main. NO borres ramas. NO toques PROYECTO_ESTADO.md todavía: eso va después de la
auditoría.
```

---

## 6. Qué voy a auditar yo (checklist para el chat FABLE al recibir la rama)

- [ ] Clonar `revision-historial`, `npm test` (node --test) verde, contar tests nuevos.
- [ ] `git diff main...revision-historial --stat`: que no toque `citasNumerables`/`ordinalesDeCitas` ni el combobox de informes.
- [ ] Test de invariante presente y con al menos un caso con no-asistió intercalada.
- [ ] Frontera estricta testeada con una cita en la fecha exacta del marcador.
- [ ] `allTabs`/`ROLE_TABS`/`showTab` los tres.
- [ ] `irAHistorial` es la única entrada (grep `showTab('historial')` solo en el nav).
- [ ] `openPdfWindow` exportada y sin duplicar.
- [ ] Que "asistencia" no cuente `conf` futuras.
- [ ] Manual (Jefferson, localhost): nav → elegir paciente → cortes → imprimir (abre ventana, membrete) → CSV → desde modal de cita → desde informe → desde buscador global → cambiar a Agenda y que Historial desaparezca.
- [ ] Cierre: ff-only a main, hashes contra rehactivaec.com, string positivo `Historial de citas` en el bundle, negativo `Ver informe del paciente` (texto viejo del botón único) ausente.
