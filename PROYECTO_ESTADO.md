# RehactivaPro — Estado del Proyecto

> Generado: 2026-05-18 · Última actualización: 2026-08-11

---

## 🔜 PRÓXIMO: cerrar el LOTE B — meta audit final con 0 críticos / 0 importantes

> Sesión 2026-06-17: cerrados **I-5, LOTE A, I-4 e I-6** — todo en prod, Vercel verde (detalle abajo). Análisis completo en `AUDITORIA_PRELANZAMIENTO.md`. La RLS está versionada (`rls_policies.md`) y la "lectura abierta" de PHI es decisión consciente (los terapeutas se cubren entre sí; la protección es el `audit_log`).
>
> **Actualización 2026-08-03:** el grueso del LOTE B y de la Fase 0 se cerró en las sesiones de julio (ver «🗓️ Sesiones 2026-07» abajo). Queda abierto: **I-7** (SQL primero), **P-2**, **CSP estricta** (P-11), **agenda táctil iOS** (R-20) y la deuda nueva del diagnóstico realtime (**RT-1…RT-4**, sesión 2026-08). **R-2 cerrado el 2026-08-07** (ver «Sesiones»).

**Abierto del LOTE B:**
- **Necesita SQL primero — I-7 (`cobro_ref` server-side):** el N° de factura se genera en memoria del cliente (`facturacion.js:318`) → dos usuarios cobrando a la vez duplican `F00X`. Fix: secuencia + trigger `BEFORE INSERT` en `cobros` (ignora el valor del cliente); luego `emitirFactura` lee el `cobro_ref` del insert.
- **JS puro:**
  - ~~**I-12** — modales sin focus-trap ni cierre con Escape~~ ✅ **CERRADO 2026-07-09** (`516088c`: Escape + click en fondo + targets táctiles `pointer:coarse`).
  - ~~**I-13** — `alert()`/`confirm()` → toasts/modales~~ ✅ **CERRADO 2026-07-09** (`516088c`).
  - ~~**I-15** — tests con `node --test`~~ ✅ **CERRADO 2026-06-26** (`54d6ec7`): 19 tests (cédula/email/teléfono, `doneActual`/`pendientesActual` con frontera de episodio, `billingInfo` "Cobro X de Y" + reinicio I-4); script `test` + paso en CI.
  - ~~**P-6** — `checkAutoNoas` solo cubre hoy~~ ✅ **CERRADO 2026-07-09** (`d6509cb`: cubre citas pendientes de días anteriores).
- **Decisiones pendientes:**
  - **P-2** — frontera de episodio `>` vs `>=` (`utils.js` vs `diagnostico_done.sql`). Hoy todo usa `>` consistente (incl. I-4); decidir y alinear el `.sql`.
  - **P-11** — CSP parcial (`script-src` sigue con `unsafe-inline` por los `onclick`). **Avance 2026-07-02:** `vercel.json` con headers de seguridad (`6c33b4a`); la CSP estricta sigue pendiente.
  - ~~**Auto-logout** — 15 min de inactividad → `doLogout()`~~ ✅ **IMPLEMENTADO 2026-07-02** (`3986a7e`; PCs compartidas de recepción).
  - ~~**Rate-limit IA** (`api/informe.js`)~~ ✅ **CERRADO 2026-07-09** (`2e0303a`: rol `viewAI` server-side + rate-limit).
  - ~~**`npm audit fix`**~~ ✅ **CERRADO 2026-07-09** (`f4b276f`: vite 8.1.4 y ws parcheados, 0 vulnerabilidades).
- **No-código (LOPDP):** documentar la decisión de "lectura abierta" de PHI (modelo "se cubren entre sí + todo auditado en `audit_log`") con base de licitud, y a Anthropic como sub-encargado.
- **Mayor valor en producción:** redactar el `clinical_context` de los protocolos reales (alimenta la calidad del informe IA — corazón del "reemplazo de Reliv").

**Pulidos opcionales remanentes (no bloquean):** buscador de diagnóstico del modal de paciente con UX pobre; `": "` suelto al inicio de "Evaluación inicial" (ya inocuo en altas nuevas por el `filter(Boolean)`).

### 🗓️ Plan a julio — meta: audit final con 0 críticos / 0 importantes (solo pulidos opcionales)
- **Semana 1** (cerrada hoy, salvo I-7): I-5 · LOTE A · I-4 · I-6 ✅. Queda **I-7** (necesita el SQL de la secuencia).
- **Semana 2:** auto-logout (15 min) · I-13 (alerts→toasts) · P-11 (CSP parcial).
- **Semana 3:** I-12 (focus-trap/Escape) · I-15 (tests `node --test`) · `npm audit fix` · decisión P-2/P-6.
- **Semana 4:** `clinical_context` de protocolos reales · papeleo LOPDP (lectura abierta + sub-encargado Anthropic) · **audit final**.

---

## 🗓️ Sesión 2026-08-03 (noche) — Hotfix logo + vistas Semana/Mes de agenda

### ✅ Enviado — 2 commits, Vercel verde verificado en cada uno (commit-status de GitHub)

- **`c6a8c0b` fix(informes): logo del membrete en producción via data URI** — el `<img>` del membrete en pantalla usaba `src="img/logo-rehactiva.png"`, que en el build de producción no existe (Vite no procesa rutas en strings de JS; solo las del HTML). Reemplazado por el `LOGO_DATA_URI` ya importado (mismo patrón que el PDF). Única referencia a `img/` en strings de JS (verificado por grep). **Regla para el futuro:** assets referenciados desde renderers JS van por data URI o import de Vite, nunca por ruta en string.
- **`17df85e` feat(agenda): vistas Semana (por terapeuta) y Mes** — reactiva el segmented completo (Día intacta). +179/−105 en 5 archivos.
  - **Arquitectura:** `renderGrid()` pasó a ser el punto de entrada ÚNICO de re-render de la agenda y despacha a la vista activa → realtime, navegación (‹ › / Hoy / datepicker) y `showTab` refrescan cualquier vista sin tocar `realtime.js`.
  - **Semana (por terapeuta):** con "Todos" no se entra (toast `Seleccioná un terapeuta para la vista semanal` sin cambiar de vista); si estando en Semana se vuelve a "Todos", toast informativo y cae a Día (decisión: la spec no cubría ese camino). Grilla Lun–Sáb × filas de 30 min (Dom solo si tiene citas esa semana); rango horario = `[work_start, work_end)` del terapeuta (fallback a `startH/endH` si son null) ∪ horas de todas sus citas — todo visible siempre, mismo criterio que Día. Slots libres → modal con **fecha + hora + terapeuta prellenados** (`openApptModalAt` extendido con fecha); tarjetas compactas (nombre + punto de estado + tinte de modalidad + franja de doctor, altura por duración), click → editar; **sin drag & drop (v1)**. Sub-barra con contadores de la semana; label `3 – 8 de agosto 2026` (variante para semanas que cruzan de mes).
  - **Mes:** funciona con terapeuta o con "Todos"; celdas con conteo de citas del filtro activo (vacía si 0) y hoy resaltado; click en un día → vista Día en esa fecha; ‹ › ±1 mes; sub-barra con total del mes.
  - **`startOfWeek()`** puro en `utils.js` (lunes 00:00; el domingo pertenece a la semana anterior; no muta el argumento), reutilizado en `exportAgendaCSV` (dedup del cálculo de lunes — avance parcial de R-32). `test/semana.test.js` con 5 casos (incl. borde de mes y domingo) → **28/28 verdes**.
  - **Verificación:** node --check · build · smoke Playwright con datos en memoria (guard, prellenado del modal, fallback a Día, domingo condicional, mes con conteos y click→Día; cero errores JS, cero writes a prod).

---

## 🗓️ Sesión 2026-08-03 (tarde) — Rediseño UI + Lote 1.5

### ✅ Enviado — 2 commits, Vercel verde verificado en cada uno (commit-status de GitHub)

- **`82952b3` feat(ui): rediseño visual según handoff (6 pantallas, orden terapeutas, selector fecha resumen)** — rediseño 1:1 de funcionalidad sobre el handoff hifi versionado en `design_handoff_rehactiva_ui/` (README = spec, `RehactivaPro - Final.dc.html` = fuente de verdad de estilos, 6 screenshots de referencia). 18 archivos de app + handoff, +778/−884.
  - **Tokens/tipografía:** `rehactiva-theme.css` reescrito (azul `#29ABE2` primario, naranja, crema `#f0e8d8`); **Public Sans** 400–800 con `display=swap` (reemplaza Outfit); botones primarios e IA en azul.
  - **Pantallas:** Login (logo real 240px, sin link "Olvidé mi contraseña" — flujo recovery por email intacto) · Shell/sidebar (logo 154px, íconos SVG Feather, headers de pantalla blancos sticky con controles integrados) · Agenda vista Día (filas 46px, tinte por terapeuta→luego por modalidad, franja izq. doctor, sub-barra con pill+contadores+leyenda; Semana/Mes y Exportar **ocultos, lógica viva**) · Resumen (franja de contadores + barra de jornada + secciones teñidas) · Informe paciente (hoja membretada + sidebar sticky 230px; ids de IA/guardar/chart preservados, **PDF formal intacto**) · Protocolos (tarjetas con cabecera 130px; foto si `img` es URL, plana si es clave de zona; **bloque continuidad oculto, no borrado**) · Informes (solo Semanal; **sin "Ingreso estimado"**; heatmap en azules; Desempeño integra la utilización → `renderTherapistUtil` quedó sin caller).
  - **Orden de terapeutas:** `orderedTherapists()` (`display_order` asc, nulls al final, luego nombre) en columnas de agenda, selects (cita/sesión manual/filtro), listado de terapeutas y Desempeño. Mappers leen `display_order`/`work_start`/`work_end` (`parseHourVal` tolera número o `time`).
  - **Selector de fecha en Resumen:** `state.resumenDate` propio (‹ › + date picker + Hoy); todo el resumen se calcula sobre esa fecha; `checkAutoNoas` sin disparos extra. **Decisión:** el badge del sidebar ahora cuenta las acciones de HOY real (antes seguía la fecha navegada de la agenda).
  - **Decisión fuera de horario (cerrada en esta sesión):** el rayado 45° del spec se implementó y luego se **eliminó a pedido** — los slots fuera de `[work_start, work_end)` se ven y comportan idéntico a los normales. Se conservan: columnas en mappers (para conteos futuros), horario bajo el nombre en el header, grilla que muestra SIEMPRE todas las citas (antes las citas fuera del horario del terapeuta ni se dibujaban) y todos los slots agendables/droppeables.
  - **Verificación:** `node --check` 11/11 · build OK (logo bundleado) · 19/19 tests · Playwright a 1280px y 1024px contra los 6 screenshots del handoff (datos de prueba inyectados en memoria vía imports dinámicos de Vite, cero writes a prod — la RLS rechazó los intentos anónimos del seed).
- **`4a08ef4` feat(agenda): modalidad centro/domicilio por cita + guard de cédula duplicada** (Lote 1.5; la columna `appointments.location` `'centro'|'domicilio'` default `'centro'` ya estaba en DB — SQL primero).
  - **Centro/Domicilio:** selector "Modalidad" en el modal de cita (crear resetea a centro, editar carga el valor); `location` persistido en los 3 caminos de escritura (insert, update de edición, recurrentes) y en los mappers de `auth.js`/`realtime.js` con fallback `'centro'`. El **tinte** de la tarjeta lo define la modalidad (centro verde `.13` / domicilio naranja `.15`); el **estado** lo pisa cuando aplica (punto, punteado ámbar de pend, rojizo tachado de noas). Leyenda con chips Centro/Domicilio (alpha .30/.35 para legibilidad — más marcado que el tinte real de las tarjetas). El tinte por color de terapeuta en tarjetas desaparece; el avatar de columna lo conserva.
  - **Cédula duplicada:** `findCedulaDuplicate(patients, cedula, excludeId)` puro en `utils.js` (trim bilateral, vacía nunca duplica, excluye al editado); `savePatient` aborta con toast `Ya existe un paciente con esta cédula: {nombre}` en crear y editar, antes de tocar estado/DB. `test/cedula.test.js` con 4 tests → **23/23 verdes**.

---

## 🗓️ Sesión 2026-08-02/03

### ✅ Enviado — 3 commits, Vercel verde verificado en cada uno (commit-status de GitHub)
- **`084d6a3` fix(realtime): reconectar al volver a la pestaña (visibilitychange)** — cierra el hueco principal del realtime intermitente: al congelarse la pestaña (cambio de pestaña, laptop dormida) el WebSocket muere **en silencio** sin disparar ningún estado de error, y la reconexión por estados nunca se activaba → sin cambios hasta F5. Listener nuevo al final de `realtime.js`: guarda `_hiddenAt` al ocultarse; al volver a `visible`, si estuvo oculta **>10 s** O `_connState!=='connected'` → `_doReconnect(500)` (reutiliza el ciclo existente: `removeChannel` + `loadAll(true)` + re-render + resubscribe). Guard `!state.dataLoaded` para no disparar en login/recovery.
  - **Probado con Playwright** (localhost, instrumentando `supa.removeChannel` y `window._app.loadAll` con contadores): guard sin sesión OK (0 ciclos) · vistazo de 3 s no recarga · oculta 12 s → punto amarillo → **exactamente 1** teardown + 1 `loadAll(force)` → verde en ~4 s. El `CLOSED` del canal viejo encola un timer de 5 s que el `SUBSCRIBED` cancela (`realtime.js:279`) — **no corre segundo ciclo en paralelo** (verificado con ventana de silencio de 9 s).
- **`f36d629` fix(agenda): redibujar la agenda al entrar a la sección** — `showTab` (`main.js`) renderizaba todas las secciones al entrar **menos agenda**: una cita llegada por realtime estando en otra sección no se veía al volver hasta que otro evento forzara el redibujo. +1 línea: `if(tab==='agenda')renderGrid();`. Complementa el fix de visibilitychange (refresh al volver a la pestaña **y** al volver a la sección).
- **`2786f06` chore: favicon con isotipo Rehactiva** — reemplazados los dos `<link>` data-URI (símbolo médico verde) por `img/favicon.ico` + `favicon-32/192.png` + `apple-touch-icon.png` con rutas relativas; verificado en `npm run build` que Vite los emite hasheados a `dist/assets/` y reescribe los links. No existe `meta theme-color` en el proyecto (el paso previsto de cambiarlo a blanco no aplicó). `favicon-512.png` quedó commiteado **sin referencia** — es para un futuro `manifest.json` PWA (R-23).

### 🔬 Diagnóstico realtime completo (previo al fix) — deuda que quedó SIN arreglar
Análisis a fondo de `js/realtime.js` (supabase-js `^2.104.1`). Se arregló solo visibilitychange (la causa principal); queda documentado para cuando se retome:
- **RT-1 (el más valioso):** supabase-js reconecta el socket y re-une el canal **por su cuenta** (backoff interno); ese rejoin re-dispara `SUBSCRIBED`, que **no hace re-sync** y además **cancela** (`realtime.js:279`) un `_doReconnect` pendiente que sí lo haría → los eventos de la ventana muerta se pierden sin backfill (UI desactualizada con punto verde). Fix propuesto: flag `_needsResync` marcado en **cualquier** desconexión + `loadAll(true)` al llegar `SUBSCRIBED` si está marcado — gane quien gane la carrera.
- **RT-2:** `_onNetworkBack` (`realtime.js:297`) hace `if(_connState==='connected') return;` con estado **stale** tras despertar (el heartbeat aún no detectó el socket muerto) → el evento `online` no reconecta justo en el caso que debía cubrir. Fix: chequear `supa.realtime.isConnected()` en vez de `_connState`.
- **RT-3:** reintento con delay **fijo** (5 s), sin backoff ni jitter; en caída larga cada ciclo fallido repite `loadAll` completo (7 queries).
- **RT-4 (menor):** el `removeChannel` propio emite `CLOSED` que reprograma un ciclo extra (hoy lo salva la cancelación en `SUBSCRIBED`; correría de más solo si el subscribe tarda >5 s). En el flujo `PASSWORD_RECOVERY` (sin reload) puede resuscribir zombie. Fix barato: guard de identidad de canal (`ch!==realtimeChannel → return`) en el callback.
- **Opcional (hardening):** `createClient(..., {realtime:{worker:true}})` — heartbeat en Web Worker inmune al throttling de pestañas ocultas (soportado en la versión actual; probar aparte).

### 🧪 Nota de proceso — e2e
**No hay credenciales de prueba utilizables** en el repo ni en su historia (solo `tera@test` con `<pass>` placeholder en `AUDITORIA_PRELANZAMIENTO.md`) → los e2e con login/datos reales requieren que David provea un usuario de prueba o los corra él. Workaround validado para probar mecánica sin sesión: import dinámico de los módulos singleton de Vite desde Playwright (`await import('/js/state.js')`) + fake de `document.visibilityState`.

---

## 🗓️ Sesión 2026-08-07

Cuatro commits, todos en prod con Vercel verde verificado por hash de bundle (el build local y
el que sirve `rehactivaec.com` coinciden). Tests: 28 → **63 verdes**.

- **`576d68a` feat(resumen,agenda): filtro por terapeuta + salto cita → informe.**
  Chips "Todos / <terapeuta>" junto al selector de fecha del Resumen (orden de `orderedTherapists`);
  recalculan secciones, contadores y barra de jornada. El estado vive en el módulo, no en `state`:
  cada visita a la pestaña arranca en "Todos" y navegar de fecha lo conserva. En móvil scrollean
  en horizontal; en escritorio envuelven. Además, botón **"Ver informe del paciente"** en el modal
  de cita **solo bajo `@media (pointer: coarse)`**: en celular llegar al informe costaba 3 toques.
  Llama `showTab` **antes** de `selectRptPatient` porque entrar a la pestaña resetea la selección.

- **`d6b516a` fix: R-2 — el informe de un episodio pasado contaba la eval como sesión.**
  Salía "11 de 10 · 110%" en el PDF al médico. Fix por **fuente única**: la regla de qué fila del
  `session_log` cuenta como sesión hecha se extrae a **`doneEnLog()`** (`utils.js`) y la usan tanto
  `epDone` (`informes.js`) como `doneActual` — el episodio actual y los pasados ya no pueden
  divergir en la definición. `doneActual` queda equivalente (solo cambia el orden de los filtros);
  `pendientesActual`/`billingInfo` sin tocar. **Cierra la Fase 0.**

- **`22d541a` feat(agenda): hora exacta (no solo :00/:30).**
  La hora ya persistía como decimal (10.75 = 10:45); faltaba poder cargarla, verla y validarla —
  sin SQL. Toggle "Hora exacta" que reemplaza el select por `<input type="time" step="300">`;
  crear arranca en select, editar una cita no alineada abre directo en exacto. `fmtTime`
  generalizada a cualquier minuto conservando el formato de siempre. La cita se dibuja en el slot
  de su **media hora contenedora** (`slotOf`) con la hora exacta en la tarjeta, y su alto sale de
  `apptSlots()`, que ahora deriva del intervalo real. **Solapes por intervalo, no por slots:**
  10:45–11:45 choca con 11:00 y tocarse en el borde no es conflicto. De paso, `findConflict`
  compara ids como string — editar una cita podía chocar consigo misma.

- **`c616417` feat(cie10): diagnóstico CIE-10 del paciente.**
  Catálogo real de 2470 códigos en `js/data/cie10-fisio.json`, cargado con `import()` **al primer
  uso**: chunk aparte de 182 KB que no entra en el bundle inicial (el principal sube 5 KB).
  Buscador con autocompletado en el modal de cita — rotulado como **dato de la ficha, no de la
  cita**, con escritura optimista + rollback — y en el modal de paciente, donde la selección queda
  pendiente y la escribe `savePatient`. Búsqueda por código o descripción, insensible a acentos,
  punto opcional (`m545` → `M54.5`), máx. 12 resultados. El informe y el PDF muestran
  `"{diag} (CIE-10: {código})"` **solo en el episodio actual**: en uno cerrado el diagnóstico es el
  de entonces y etiquetarlo con el código de hoy mentiría.

**Deuda que deja la sesión:** el "Análisis con IA" del Resumen ignora el filtro por terapeuta
(manda el día completo); los inputs de los modales miden 37 px de alto en móvil (afecta a toda la
app, no solo a lo de hoy); el `step="300"` de la hora exacta permite minutos como :05.

---

## 🗓️ Sesión 2026-08-11 — La cita "no asistió" libera el slot

Un commit, en prod con Vercel verde verificado por hash de bundle (el build local y el que sirve
`rehactivaec.com` coinciden). Tests: 63 → **85 verdes**.

- **`219ed02` feat(agenda): la cita "no asistió" libera el slot sin perderse.**
  El paciente no vino, la franja quedó libre de hecho, pero la agenda la seguía dando por ocupada —
  y borrar la cita para reagendar habría falseado el historial. Ahora una cita en `noas` deja de
  OCUPAR la franja **solo a efectos de agendamiento**: sigue existiendo y contando exactamente igual
  en resumen, informes, continuidad y facturación.

  - **Criterio único `bloqueaSlot()` (`utils.js`).** Lo consumen `findConflict` — así crear, editar,
    drag & drop y el loop de recurrentes heredan el comportamiento de una sola vez — y
    `occupiedSlots()`, que alimenta el contador "slots libres" de la cabecera. Dos citas **activas**
    siguen chocando igual, incluso con horas exactas parcialmente solapadas; una cita sin `status`
    (datos viejos) sigue bloqueando.
  - **Reparto de la franja (`compactNoas()`, puro y testeable).** Si la no-asistió comparte fila o
    solapa con otra cita, cede el espacio y se dibuja como **tira compacta** (16 px, fondo opaco,
    inset lateral, pegada al tope de su media hora, nombre tachado en una línea con ellipsis,
    clickeable para abrir/editar); la activa se lleva el espacio normal. Sola, se ve como siempre.
    Varias en la misma franja apilan tiras. Igual en vista Día y Semana.
  - **Lo que costó más de lo que parecía: el apilado.** Una tira que arranca a mitad de una cita
    larga (no-asistió 7:30 sobre una de 7:00–8:00) necesita z-index propio para verse, pero eso
    también sube el **fondo blanco** del slot y tapa la tarjeta de abajo — que es justo por lo que
    existe `.slot-tail`. De ahí **`.slot-strip-over`**: transparente y `pointer-events:none` como el
    tail, pero **por encima** (z-index 4) y con `pointer-events:auto` solo en la tira. Esos píxeles
    siguen siendo de la cita activa (su click, su drop); lo único que flota y responde es la tira.
    Además las tiras **no dejan slots de cola**: las medias horas siguientes quedan libres de verdad
    y ya no tapan a la cita activa que empiece ahí.
  - **Agendar rápido.** La no-asistió que ocupa sola su franja lleva un **"+"** que abre el modal con
    terapeuta, fecha y hora prellenados; el resto de la tarjeta sigue abriendo su edición. Solo con
    permiso `createAppt`. En móvil se va a la esquina inferior **izquierda**: su área de toque de
    44 px y la del punto de estado ocupan toda la altura de la tarjeta, así que solo entra una por
    lado sin pisarse.
  - **Intocado a propósito:** `cycleStatus`, secciones del resumen, métricas de continuidad,
    informes y facturación — cero cambios de conteo.

**Deuda que deja la sesión:** el render no tiene tests (no hay jsdom en el proyecto) — la lógica de
reparto y el contador son puros y sí están cubiertos, pero `.slot-strip-over` y el "+" táctil se
verificaron a ojo en dev. Y como `cycleStatus` **no** chequea conflictos, devolver a `conf` una
no-asistió sobre cuya franja ya se agendó deja dos citas activas solapadas: hoy es aceptable (la
reactivación es un gesto deliberado del usuario), pero es el caso a vigilar.

---

## 🗓️ Sesiones 2026-07 (reconstruido del git log — no se documentaron en su momento)

Todo en prod. Cierran la mayor parte de la **Fase 0** y del **LOTE B**:
- **2026-07-01:** `8b26869` R-1 ("Cobrar todos" episodio-aware) · `6b343cb` R-3 (chequear error del insert 'Fin de episodio') · `03b2224` R-4/R-5 (`normHour` para no pisar sesiones) · `c8fbca0` R-6 (solape en recurrentes) · `6841492` R-7 (rollback de inserciones optimistas).
- **2026-07-02:** `3986a7e` auto-logout 15 min · `6c33b4a` `vercel.json` con headers de seguridad.
- **2026-07-09:** `2e0303a` R-24 (rol `viewAI` server-side + rate-limit IA) · `f4b276f` npm audit → 0 vulnerabilidades · `516088c` I-12 + I-13 (modales Escape/fondo, alerts→toasts, táctil `pointer:coarse`) · `d6509cb` P-6 (`checkAutoNoas` días anteriores).
- **2026-07-31:** `82e387f` feat(informes): PDF con formato de documento formal (marca, SVG EVA, paginación).

~~De la Fase 0 queda **R-2** sin commit visible que lo cierre~~ ✅ **R-2 CERRADO 2026-08-07**: seguía abierto (no lo tocó `82e387f`). El `epDone` del episodio pasado (`informes.js`) contaba `status==='asistió'` a secas; ahora usa `doneEnLog()` (`utils.js`), la misma regla que `doneActual`, que excluye `Evaluación inicial` y `Fin de episodio`. 4 tests nuevos (32 en total). **Fase 0 completa.**

---

## 🗓️ Sesión 2026-06-26

### ✅ Enviado hoy — 3 commits lógicos, Vercel verde en cada uno
- **`95dc477` chore: código muerto + cableado** — quitado import sin uso `pendientesActual` (`pacientes.js`); eliminada `refreshData()` (cero callers; su UI "última actualización" ya no existe en el HTML) + imports `renderWeekView`/`renderMonthView` que quedaban huérfanos; quitada la exposición **duplicada** de `openSessionModal` y el bloque "referencias a datos accesibles desde HTML" en `window` (`appointments`/`patients`/`supa`/`getPatient`/`hasEvalInicial`) que ningún `onclick` referencia (verificado en HTML + handlers dinámicos + `window.*`).
- **`73a4662` fix(notificaciones): dejar de fingir envíos automáticos** — `simEmailFactura` (alert que mentía "con backend se enviaría automáticamente") **eliminado**; el cobro confirma con toast limpio `Cobrado · Factura {fId} · {n} sesiones`. Toggles de notificaciones etiquetados **"Próximamente (requiere backend)"** y **deshabilitados** (banner + pill), conservados como roadmap visible; handler huérfano `toggleNotif` eliminado. `simWA`/`simEmail` (resumen) intactos (abren WhatsApp/mailto manual).
- **`54d6ec7` test: node --test + SMOKE_TEST + CI** → **cierra I-15.** `billingInfo` movida a `utils.js` (pura, testeable — `facturacion.js` no es importable en node por `import.meta.env`). 19 tests verdes; `npm test` + paso en CI; `SMOKE_TEST.md` (checklist manual para iPad).

### 🔬 Revisión integral (multi-agente) — diagnóstico para "pulir y revender"
> **Procedencia:** 7/8 revisores especialistas + cross-check manual contra el código. El revisor de UX/iPad se colgó (esa dimensión la cubrió Claude a mano leyendo `index.html`/`render*`); la fase de verificación adversarial no llegó a correr. Los hallazgos 🔴 fueron confirmados leyendo el código; los marcados *(dep.)* dependen de confirmar algo (p. ej. tipo de columna).

**Veredicto:** muy buena **app clínica** artesanal; núcleo clínico sólido. Dos huecos grandes: como **negocio** no maneja **dinero** (cuenta sesiones, no plata); como **producto** es **single-tenant de raíz**. Madurez de arquitectura ≈ **5/10**.

**✅ Fortalezas (no tocar):** fuente única `done/pendientes/billing` (utils.js, pura, episodio-aware, con tests); seguridad madura (RLS real + `audit_log` inmutable + API key server-side + XSS críticos cerrados); realtime robusto (anti-eco/reconexión); flujo de recepción real ("Resumen del día", "Listos para cobrar"); médico referente de primera clase.

**🔴 Bugs P0 (arreglar antes de seguir en serio):**
- **R-1** `business`/high — "Cobrar todos" NO episodio-aware: `marcarTodosFacturados` suma **todas** las facturas históricas (`facturacion.js:~340-348`) vs `billingInfo` de la pantalla → cobra pacientes a mitad de tratamiento. *(3 revisores).* Fix: usar `billingInfo(p,spf).esCierre`.
- ~~**R-2** `data`/high — Informe de **episodio pasado** cuenta la Evaluación inicial como sesión → "11 de 10 · 110%" en el PDF al médico (`informes.js:524`). Fix: `epDone` excluyendo `Evaluación inicial`/`Fin de episodio`.~~ ✅ **CERRADO 2026-08-07** (`doneEnLog` en `utils.js`, usada por `epDone` y por `doneActual`).
- **R-3** `data`/high — `guardarNuevoEpisodio` no chequea el `.error` del insert de "Fin de episodio" (`pacientes.js:341`) → corte solo en memoria si falla; al recargar, facturación inflada. Fix: chequear error/RPC transaccional.
- **R-4** `data`/high — Reabrir una sesión ya registrada la **sobrescribe**: `openSessionModal` detecta "existing" con hora **cruda** (`sesiones.js:82`), no `normHour` → tras recargar abre en blanco y pisa EVA/nota/técnicas. Fix: `normHour()` ambos lados.
- **R-5** `ux`/med *(dep. tipo de `session_log.hour`)* — `hasSession` arma la clave con hora cruda vs `fmtTime` (`auth.js:90`, `realtime.js:149`) → citas hechas vuelven a "Completar sesión" tras recargar. Fix: `normHour` ambos lados (seguro igual).
- **R-6** `business`/med — Citas **recurrentes sin chequeo de solape** (`agenda.js:406`) → doble-booking del terapeuta. Fix: `conflictsWithExisting` por fecha, saltar+reportar.
- **R-7** `data`/med — Inserciones optimistas **sin rollback** en error (`agenda.js:397`, `pacientes.js:178`, `terapeutas.js:78`; solo `emitirFactura` revierte) → fila fantasma con id numérico. Fix: quitar la entidad del `state` en el `catch`.

**🟠 Concurrencia/datos (medios):**
- **R-8** `data` — Colisión dedup `'00:00'`: "Evaluación inicial" y "Fin de episodio" comparten hora; el flujo "Nuevo episodio" abre la eval el mismo día → entre clientes se pierde la eval o la **frontera** (`realtime.js:148`). Fix: deduplicar por `id` real del payload.
- **R-9** `data` — Doble-cobro **enmascarado** por `Math.max(0,…)` en `pendientesActual` (`utils.js:152`). Fix: avisar si `cobradasEp > doneActual`; cerrar I-7 (cobro_ref server-side).
- **R-10** = **P-2** (frontera `>` estricto vs `>=` del SQL, `utils.js:139,151`): una sesión/cobro el día del corte cae en el episodio anterior → riesgo de re-cobro. Decidir y unificar utils + `.sql` + test.

**🏥 Falta (negocio real — clínica Quito):**
- **R-11** high — El cobro **no registra monto** (`auth.js:252` solo `{cobro_ref,n_sessions,date}`) → el dueño no sabe cuánto cobró. *Hueco #1.*
- **R-12** high — Cobro rígido "cada 5": `global-spf` es `<input hidden value="5">` (`index.html:380`); el `billing_ses_per_factura` por paciente existe en DB pero la UI lo ignora. Sin precios, paquetes prepagados ni pago por sesión.
- **R-13** med — "Ingreso estimado" inventado: `$25/sesión` hardcodeado (`informes.js:206`).
- **R-14** high — Sin **control de caja**: ni forma de pago ni cierre diario.
- **R-15** high — **Recordatorios automáticos no existen** (toggles "Próximamente"); el no-show, principal fuga de ingresos, se gestiona a mano. Conectar 24h WhatsApp/email (Twilio/Resend).
- **R-16** med — Sin **consentimiento informado** (tratamiento + datos LOPDP).
- **R-17** med — Sin seguros/convenios, sin **comisión/liquidación por terapeuta**, sin **recibo/nota de venta** imprimible.
- **R-18** med — No se registra la **gestión del no-show** (¿contactado? ¿reagendó? ¿se perdió?).
- **R-19** med — Historia clínica **aplanada** en un texto con ` | ` (`pacientes.js:434`, re-parseado en `informes.js`); sin reevaluaciones estructuradas.

**📱 UX / iPad (análisis directo):**
- **R-20** high — **Drag-and-drop para reagendar NO funciona en iPad** (`agenda.js` usa HTML5 DnD, no soportado por touch en Safari iOS). Cubierto por el modal de edición al tocar, pero confunde. Fix: polyfill táctil o quitar la afordancia.
- **R-21** = **I-13** — `alert()`/`confirm()` nativos por todos lados (bloqueantes/sin estilo en iPad).
- **R-22** med — Exportar PDF usa `window.open` (`informes.js`) → Safari iPad puede **bloquear el popup**. Probar en dispositivo real.
- **R-23** low — Sin **PWA/offline**: la carga inicial necesita red (el realtime sí reconecta).

**🔐 Seguridad / LOPDP (endurecimientos):**
- **R-24** med (amplía "Rate-limit IA") — `/api/informe` valida JWT pero **no rol ni rate-limit**, y usa el `prompt` del cliente verbatim (`api/informe.js:30`) → cualquier autenticado quema el presupuesto de Anthropic. Fix: rol server-side + rate-limit + construir prompt en el server.
- **R-25** med — Texto clínico libre a Anthropic (EE.UU.) con anonimización **parcial** (`ia.js:151`). DPA + scrubbing del texto libre.
- **R-26** med — `informes.snapshot` re-expone **cédula + informe** en tabla de **lectura abierta** (`informes.js:716`); acotar RLS SELECT de `informes`.
- **R-27** low/med — Falta auto-logout (decidido), 2FA admins, `vercel.json` (headers anti-clickjacking/CSP/HSTS), política de contraseña (hoy 6 chars).

**🧹 Código basura / 🏗️ arquitectura:**
- **R-28** high — **Mappers DB→memoria duplicados** (`auth.js:60-75` vs `realtime.js:72-90`) → drift: dato bien al cargar, mal por realtime. Extraer `mappers.js`.
- **R-29** med — `patient.therapistId` **vestigial**: 4 vistas lo leen, la app nunca lo escribe → el terapeuta nunca aparece en Facturación/búsqueda.
- **R-30** low — `done:0` write-only (`pacientes.js:167,175`); quitar y `DROP` columna.
- **R-31** low — ~17 `export` sin importador + exposiciones `window` redundantes + permiso `cycleStatus` muerto (definido en 3 roles, nunca chequeado).
- **R-32** low — Meses/días duplicados en 5 archivos; "lunes de la semana" reimplementado 3 veces → centralizar (clave para i18n).
- **R-33** low — `terapeutas.js` usa `alert()` y no `validators.js` (único formulario fuera del patrón).
- **R-34** low — Default de sesiones inconsistente (10 vs 12) entre mappers y alta.
- **R-35** high `arch` — Bus global `window._app` (83 refs en 13 archivos) sin verificación en build → fallos silenciosos sobre PHI.
- **R-36** med `arch` — Cableado UI por strings (~60 fns en `window` + 62 `onclick`); migrar a delegación de eventos (`data-action`/`data-id`) → habilita CSP estricta.
- **R-37** med `arch` — Reactividad `tab→render` duplicada en 4+ sitios (18 `currentTab===`); un solo `rerenderCurrentTab()`.
- **R-38** med `arch` — `informes.js` god-module (896 LOC, 24 exports); dividir (PDF puro = testeable, cubre clase de bug I-6).
- **R-39** med `arch` — Sin tipos ni linter; TS incremental (`checkJs` + JSDoc + `tsc --noEmit` en CI) + ESLint.
- **R-40** med — Tests solo de lógica pura; faltan mappers/permisos/escape XSS/e2e (Playwright WebKit por el target Safari).
- **R-41** med — Build sin disciplina: `package.json` = `temp-vite` v0.0.0, sin `vite.config.js`, Chart.js por **CDN** (rompe offline, bloquea CSP). Renombrar+versionar, bundlear, `vercel.json`.
- **R-42** low — i18n inexistente (strings es incrustados en lógica/HTML/prompts).
- **R-43** low — Logging sin abstracción (`console.*` en prod, `catch{}` vacíos); logger central + reporte de errores.

**🚀 Productización → SaaS revendible (multi-tenant). Modelo recomendado: DB compartida + RLS por tenant.**
- **S-1** 🔴 crítico — **Cero multi-tenancy**: `grep org_id|tenant_id|clinic` = 0. Añadir `organizations` + `memberships(org_id,user_id,role)` (rol pasa a ser **por org**) + `org_id` en las 8 tablas + `audit_log` (forzado por trigger).
- **S-2** 🔴 crítico — RLS `SELECT = true` → **brecha cross-clínica el día que entra el 2º cliente**. Reescribir TODAS las policies a `org_id = current_org()` **antes** de cargar la 2ª clínica.
- **S-3** high — Roles globales (`is_admin()`) no por org; reescalar a `is_admin_of(org)`.
- **S-4** high — Sin **onboarding self-service** (cero `signUp`/invite; alta = manual en Supabase). Edge Functions con `service_role` (crear clínica, invitar, wizard, seed).
- **S-5** high — Branding "Rehactiva" hardcodeado (HTML, prompts IA, plantillas WhatsApp, informes) → sin white-label. Mover a `organizations.{brand,logo,color,subdomain}`.
- **S-6** med — Config de clínica hardcodeada (spf, tipos de cita, horarios, técnicas, protocolos) → `org_settings`.
- **S-7** med — Sin capa de **planes/suscripción** para cobrar a las clínicas (gating por plan además de por rol).
- **S-8** high — Key de IA **compartida sin cuota por tenant** (`api/informe.js`): una clínica quema el presupuesto de todas. Medir/limitar por org.
- **S-9** med — Localización clavada a EC/español/USD (cédula con dígito verificador); abstraer país/moneda/documento/locale.
- **S-10** med — Operación artesanal: migraciones a mano en el SQL editor, una sola base/Vercel sin staging. Migraciones versionadas + staging + backups/PITR + observabilidad.
- **S-11** med — Realtime es canal global sin filtro (`realtime.js:269`) → fuga cross-tenant si no se cierra la RLS; canal por org.
- **S-12** med — `audit_log` sin `org_id` → mezcla bitácoras de clínicas distintas; acotar y permitir export por clínica.
- **S-13** med — Vacío legal: al revender, el dueño es **encargado** de datos de salud de terceros → DPA por clínica, sub-encargados (Supabase/Vercel/Anthropic), retención/borrado, notificación de brechas.

### 🗺️ Plan por fases (orden recomendado para "pulir y revender")
- **Fase 0 — Estabilizar:** R-1, R-2, R-3, R-4, R-5, R-6, R-7 + auto-logout + `vercel.json` + R-24 (rate-limit IA). *(Deja la app actual confiable.)*
- **Fase 1 — "Muy buena app clínica" (negocio):** R-11 (dinero), R-12 (precios/paquetes/spf por paciente), R-14 (caja), R-13 (ingresos reales), R-17 (recibo), R-15 (recordatorios 24h), R-16 (consentimiento).
- **Fase 2 — Andamiaje (calidad):** R-28 (mappers.js), R-36 (delegación de eventos), R-37 (re-render central), R-38 (dividir informes.js), R-39 (TS+ESLint), R-42 (i18n strings), R-41 (versionado/vite.config), R-40 (más tests + e2e).
- **Fase 3 — SaaS multi-tenant:** S-1→S-13 (empezando por S-1/S-2; RLS por org **antes** del 2º cliente).

---

## 🗓️ Sesión 2026-06-17

### ✅ Cerrado hoy — todo en producción (push a `origin/main`, Vercel verde verificado por commit-status)

Revisión pre-lanzamiento completa (ingeniero senior + atacante) cruzada contra `AUDITORIA_PRELANZAMIENTO.md`, `PLAN_PROXIMO.md` y `rls_policies.md`. Se cerraron 4 grupos, cada uno verificado verde en Vercel de forma aislada:

- **I-5 — Borrado de paciente atómico (`81946ed`):** SQL `ON DELETE CASCADE` en las **4 FK que dependen de `patients`** (`session_log`, `cobros`, `appointments`, `informes`) aplicado en Supabase por David (**SQL primero**). `deletePatient` (`pacientes.js`) ahora hace **solo** `delete from patients` (los 3 deletes manuales previos sobraban) → borrado atómico sin huérfanos. `confirm()` **reforzado** con advertencia de que borra al paciente y TODO su historial (sesiones, cobros, citas, informes) e **irreversibilidad**; el delete **chequea `.error`** y avisa por toast. Limpieza de `state.informes` en memoria al borrar.
- **LOTE A — Limpieza pre-lanzamiento (`fa1515e` código+CI, `0a1de8a` scaffolding):**
  - **Código muerto:** `protocolSVG` (+import), `dbUpdateBillingPendientes`, `next_plan`/`#sess-next`, `updateGlobalSPF`, `billing_pendientes`, ~15 imports sin uso en `main.js`.
  - **Logs de prod:** `console.log` en `auth.js`/`realtime.js`.
  - **Endurecimiento XSS (defensa en profundidad):** `safeColor()` (nuevo en `utils.js`, valida hex) en colores de doctor (`agenda`/`doctores`/`pacientes`/`resumen`/`informes`) + `esc()` en los valores del PDF.
  - **Fixes UX/bugs:** celda **"Protocolo" en el PDF** (`_buildRenderModel`+`buildPdfHtml` — cierra el pendiente del QA de protocolos), `populateDiagList` al **crear** paciente con `esc()` (I-11), **validadores cableados** en cita (`agenda.saveAppt`) y sesión, `<title>`/icono duplicados en `index.html`, botón **WhatsApp deshabilitado sin teléfono**.
  - **Endpoint IA:** tope de **20k chars → 413** en `api/informe.js` (la key paga no se quema con prompts gigantes).
  - **CI:** `.github/workflows/ci.yml` corre `node --check js/*.js api/*.js` en push/PR (22/22 OK).
  - **Repo:** eliminado el scaffolding **no usado** de Vite (`src/`, `public/`) — verificado que nada lo referencia y que `npm run build` pasa (72 módulos, `dist/` ok); commit aparte para aislar Vercel (quedó verde, sin revert).
- **I-4 — Facturación por episodio (`5cb5725`):** `billingInfo` cuenta **solo las facturas del episodio actual** (`fecha > último 'Fin de episodio'`, vía `lastFinDate` ahora exportada — **fuente única** con `pendientesActual`). `sesYaCobradas` (numeración de cajitas) y `cobrosRealizados` (rótulo "Cobro X de Y") dejan de inflarse tras un nuevo episodio. Las stats de cabecera "Total cobros hechos / Sesiones cobradas" quedan **sin tocar a propósito** (rotuladas "Histórico"). Sin regresión en el primer episodio (`lastFin=null` incluye todo).
- **I-6 — PDF de episodio pasado (`3402608`):** `_buildRenderModel` usa `epDiag`/`epDone`/`epSessions` (ya estaban en `_rptCtx`) en vez de `p.diag`/`doneActual(p)`/`p.sessions` → diagnóstico, "X de Y" y % (ya episodio-aware) **concuerdan** al exportar un episodio anterior. La celda Protocolo queda al nivel del paciente (no hay historial de protocolo por episodio, §2.4).

### 📌 Nota de proceso
- Cadencia estricta: cada grupo en su(s) propio(s) commit(s), pusheados por separado y verificados en Vercel uno por uno (commit-status de GitHub `state: success`). El commit del LOTE A se hizo con **`npm run build` previo**; el de `src/`/`public/` se **aisló** para poder revertir si Vercel quedaba rojo (quedó verde).
- El SQL del CASCADE (I-5) lo corrió David en Supabase **antes** del cambio de código (regla "SQL primero").
- De arrastre se pusheó también `a8d8950` (docs: RLS versionada + `informes` en `audit_log` — solo docs/SQL, sin código de app), que estaba commiteado local pero sin pushear.

---

## 🗓️ Sesión 2026-06-06

### ✅ Cerrado — todo en producción (push a `origin/main`, Vercel verde verificado)

- **★ Feature grande — Protocolos asignables al paciente (COMPLETA: PR-A `a24789d` + PR-B `0b30b41`).** Cubre el gap de "reemplazo de Reliv" del lado del protocolo de tratamiento. Migración **aditiva** (4 columnas nullable) corrida a mano en Supabase por David: `protocols.clinical_context`, `protocols.img`, `protocols.definition`, `patients.protocol_id` (FK `on delete set null`).
  - **PR-A (asignar protocolo + fix íconos, sin IA):** mappers leen las columnas nuevas (`auth.js`: protocolos → `img`/`def`/`clinicalContext`, pacientes → `protocolId`; `realtime.js` `_mapPatient` → `protocolId`, **sin** mapper de protocolo porque `protocols` no está en realtime); `dbSaveProtocol` persiste `img`/`definition`/`clinical_context`. Modal de protocolo: selector de zona (`#prot-img`, default **knee** alineado al fallback de la tarjeta), definición (`#prot-def`) y contexto clínico (`#prot-ctx`). Modal de paciente: `<select id="pm-protocol">` con **auto-relleno** (D2: diagnóstico desde el **NOMBRE** del protocolo + sesiones, solo si están vacíos; `'12'` = default). `getProtocolRows` prefiere el **link explícito** (`protocol_id`) y deja el match por keyword como **fallback con guard `k&&`** (no matchea con keyword vacía). Celda "Protocolo" en el encabezado del informe **(pantalla)**. **Arregla I3** (todos los protocolos se veían como rodilla) y el **bug gemelo de `def`** (D5: nunca se mostraba en protocolos reales, mismo patrón que `img`).
  - **PR-B (contexto → IA):** `genPatientAI` inyecta el `clinicalContext` del protocolo **solo por link explícito** (D3, sin fallback por keyword), truncado a **1.200 caracteres** (D4), marcado como **plantilla de referencia** + regla-barrera anti-alucinación reforzada para que la IA no narre la plantilla como hallazgos del paciente. Si el paciente no tiene protocolo enlazado o el protocolo no tiene contexto → prompt **idéntico al previo** (regresión cero). Solo `ia.js`, sin SQL nuevo.
  - **QA validado (3/3 + control negativo):** trampa de alucinación (protocolo con técnicas/hitos que el paciente **no** recibió) → la IA enmarcó objetivos/recomendaciones según el protocolo **sin** narrar la plantilla como algo aplicado/encontrado; el control negativo (paciente sin protocolo) salió como antes de PR-B. Barrera anti-alucinación **validada**.
  - **Docs:** `89fa330` reescribió la PARTE 2 de `PLAN_PROXIMO.md` (plan v2, SQL a 4 columnas, decisiones **D2–D5 cerradas**); `54e300a` sincronizó la sección "Decisiones para David".
- **Fix EVA en sesiones (`3d04527`):** `renderEvaButtons` (`sesiones.js:44`) resaltaba el botón según `cur` pero **no** actualizaba el label numérico (solo `setEva` lo hacía). Como el guardado lee el label (`:162-163`), abrir/resetear/editar una sesión podía **grabar un EVA distinto** al botón mostrado. Fix de 1 línea: el label se fija a `cur` al re-render (corrige abrir, sesión manual y editar).

### ⚠️ Pendientes salidos del QA (detalle en el bloque 🔜 PRÓXIMO)
- Celda "Protocolo" falta en el **PDF** (el encabezado del PDF se arma aparte, `informes.js:777-784`).
- Buscador de diagnóstico (modal de paciente) con UX pobre.
- `": "` suelto al inicio del bloque "Evaluación inicial" del informe.

---

## 🗓️ Sesión 2026-06-04 / 05

### ✅ Cerrado — todo en producción (push a `origin/main`, Vercel verde verificado)

- **Quita el campo "pendientes al iniciar" (`467693a`):** el input `pm-billing-start` quedó huérfano tras el refactor de fuente única (la facturación deriva de `pendientesActual`/`session_log`, ya no lee `billing.pendientes`). Se eliminó del modal de paciente y de los 4 puntos en `pacientes.js`; el insert ahora fija `billing_pendientes:0` (columna vestigial). Layout del modal reacomodado (Sesiones prescritas a ancho completo).
- **Fixes de facturación (`a80259f`):**
  - **Cobrar individual roto:** el botón "✓ Cobrado" usaba `onclick="emitirFactura(${JSON.stringify(p.id)})"` → con IDs UUID (string), las comillas dobles anidadas rompían el atributo HTML y el botón no disparaba ("Cobrar todos" sí andaba porque llama desde JS). Ahora `emitirFactura('${esc(String(p.id))}')`.
  - **Cobros recientes por mes:** `renderCobrosRecientes` mostraba los últimos 8 de todos los tiempos; ahora filtra por **mes en curso**, subtítulo "Cobros de [mes]", estado vacío y orden reciente primero.
- **★ Feature grande — Guardar informes IA en histórico (PR-A `cbec1ea` + PR-B `4026b82`):** resuelve el "error fatal" (la narrativa IA vivía solo en memoria → exportar el PDF sin regenerar salía sin narrativa, y regenerar malgastaba créditos). Decisión de David: **histórico** (varios por paciente, ~uno por episodio), con **ver inline / exportar / eliminar**.
  - **DB:** tabla nueva **`informes`** (`id` uuid, `patient_id` FK `on delete cascade`, `created_by`, `numero`, `episodio`, `fecha_emision`, **`narrativa` jsonb** = `[{title,body}]`, **`snapshot` jsonb** = render-model completo, `deleted`/`deleted_at`/`deleted_by`). RLS estilo resto: **lectura abierta** a autenticados, **insert/update solo admin+terapeuta** (chequeo `profiles.role`); **DELETE físico revocado → borrado lógico**. Auditada vía el trigger genérico `audit_trigger_fn` (dato clínico). **Corrida a mano en el SQL Editor de Supabase** (no versionada en el repo todavía).
  - **PR-A (guardar + exportar reproducible):** `state.informes` + fetch en `loadAll` (`deleted=false`, reciente primero). Refactor de `exportarPDF` → **`buildPdfHtml(model)` pura** (render-model → HTML, sin tocar state/`_rptCtx`/canvas) + `openPdfWindow`; `_buildRenderModel` arma el snapshot (métricas, eval inicial, filas de sesión, **`evaChartImg` base64**, nombres ya resueltos). `guardarInforme()` persiste (gated por `viewAI`); botón **"💾 Guardar informe"** visible recién al generar narrativa; card **"Informes guardados"** tras la narrativa; `exportarInformeGuardado(id)` rearma el PDF **idéntico desde el snapshot, sin IA**.
  - **PR-B (ver inline + eliminar):** `permissions.js` nueva acción **`deleteInforme`** (admin+terapeuta). `renderNarrativeHtml` extraído como renderizador puro en `ia.js`. **`verInformeGuardado(id)`** inyecta la narrativa guardada en el bloque on-screen (sin re-llamar IA, sin tocar `_lastNarrative`/`_rptCtx` → export vivo intacto). **`eliminarInformeGuardado(id)`** = borrado lógico (`deleted=true,…`) con confirmación, gated por `deleteInforme`. Lista con **Ver · Exportar PDF · Eliminar** (este último según permiso).

### ⚠️ Pendiente / notas
- **`informes` no está versionada en el repo:** el SQL se corrió en Supabase pero falta agregar un `.sql` de la tabla al repo y sumar `'informes'` al array canónico de tablas auditadas en `audit_log.sql` (hoy el trigger está enganchado en la DB, pero no documentado en git).
- **Realtime de `informes`:** no cableado (fase posterior). Hoy la lista se llena al guardar localmente y al recargar; no sincroniza entre sesiones en vivo.
- **UX menor:** tras guardar, la narrativa sigue en pantalla; si se cambia de paciente/episodio se limpia (esperado). "Ver inline" la recupera desde el histórico.

---

## 🗓️ Sesión 2026-06-03

### ✅ Cerrado hoy — todo en producción (push a `origin/main`, Vercel verde verificado)

- **Fix de raíz — sesiones identificadas por `id` único, no por fecha/hora (`c1da7bc`):** al editar una sesión, el EVA antes/después y **todos los campos** mostraban los de otra sesión (p.ej. editar "4→3" abría "8→7"). Causa: las sesiones se matcheaban por fecha/hora (colisionaban). Ahora se **captura el `id` en los 4 puntos de creación** y se identifica por `id` → arregla EVA y campos al editar **y elimina los duplicados en memoria**.
- **PARTE 1 del informe (`0eb443f`)** — los 5 ajustes pedidos (detalle de verificación en `VERIFICACION.md`):
  - **Color EVA escala A** (estándar clínico): 7–10 rojo / 4–6 amarillo / 1–3 verde / 0 azul, con el **número y las bandas del gráfico alineados** a los mismos cortes (0–3.5 / 3.5–6.5 / 6.5–10) → ya no discrepan (cerró un bug que no se había notado: un EVA 6 salía rojo como número pero caía en banda amarilla).
  - **Quitada la "Firma del terapeuta"** de pantalla y PDF (limpieza de `thFirma`/`withThLog`/CSS `.firma`; `thHeader` del encabezado intacto).
  - **Narrativa clínica con títulos en negrita** (negro `#1a1917`, peso 800, más espaciado) + **PDF por camino robusto**: narrativa **estructurada compartida** (`getLastNarrative` en `ia.js`) en vez del hack `innerText` → los títulos salen en negrita de verdad y las secciones bien separadas. Incluye **`clearLastNarrative`** al re-render del informe para **no arrastrar la narrativa entre pacientes/episodios** (buena cazada: sin esto, exportar el PDF de un paciente B tras generar la IA de A habría incluido la de A).
  - **Evaluación inicial como callout** destacado **fuera de la tabla** (bloque verde con sus partes anamnesis/antecedentes/zonas/inspección + botón Editar), tanto en pantalla como en PDF; el conteo "Detalle por sesión (N)" cuenta solo las de tratamiento.
  - **Quitados los círculos de iniciales** (el del buscador/combobox y el grande junto al nombre); limpieza de `thC` y del import `COLOR_OPTIONS`. La clase `.avatar` se conserva (la usan otras pantallas).
- **Bug `pm-age` (`5535d08`):** `openPatientModal` no limpiaba el `pm-age` (input hidden, retrocompat) → tras editar un paciente con edad y abrir "Nuevo paciente", el alta nueva **heredaba la edad del anterior**. Se agrega `pm-age` a la limpieza de `openPatientModal` **y** al reset post-guardado de `savePatient` → el paciente nuevo ya no hereda edad.

### 📄 Docs
- Se sumaron al repo (`d35882a`): **`PLAN_PROXIMO.md`** (análisis de las 3 partes y el plan de protocolos), **`AUDITORIA.md`**, **`VERIFICACION.md`** (verificación estática de la PARTE 1 + checklist manual pendiente de navegador/PDF) y **`diagnostico_done.sql`**.

---

## 🗓️ Sesión 2026-06-02

### ✅ Cerrado hoy — en producción (push a `origin/main`, Vercel verde verificado)

- **Carga histórica:** botón **"Registrar sesión manual"** (sesiones retroactivas) en el Informe Paciente → alimenta gráfico EVA, detalle y contador, **sin crear citas**. **Candado anti-doble-submit** en los 3 saves (`saveSession`/`saveSessionManual`/`saveSessionEdit`).
- **Editar/Eliminar sesiones** desde el Informe Paciente: **editar** = `registerSession` (admin+terapeuta, UPDATE); **eliminar** = **solo admin** (DELETE). Evaluación inicial editable pero **no** eliminable. `done −1` solo si la sesión era **manual**. RLS de UPDATE de `session_log` ampliada a terapeuta.
- **Fix charts a prueba de re-render** (`Chart.getChart(ctx)?.destroy()`) en los 3 gráficos + **dedup robusto** de sesiones por hora normalizada (`normHour` en `utils.js`).
- **Migración:** `session_log.next_plan` (columna nueva) — desbloqueó el guardado de sesiones.
- **Informe IA mejorado:** prompt nuevo (interpreta, no repite cifras, sin markdown, dirigido al médico referente), historial con **técnicas + observación**, modelo **Haiku → Sonnet 4.6**, render en 2 secciones con estilo de la app.
- **Buscador del Informe Paciente unificado:** combobox type-ahead (el `<input hidden>` conserva el contrato `.value` para los 5 lectores externos).
- **Estética del informe:** wordmark **"Rehactiva" verde → azul** de marca; gráfico EVA a **1 línea limpia (coral)** consistente con la tarjeta inicial→actual + bandas leve/moderado/severo; botón **"Actualizar" eliminado** de todas las pantallas.

### 🛣️ Pendiente / Roadmap
- **Mapa de calor (informes) roto** — fix concreto.
- Campo **`type` de sesión sale vacío** — decidir default / obligatorio / quitar.
- **Repaso manual de pantallas** (errores pendejos) antes de soltar a la clínica.
- Mejora futura: **enviar PDF al médico referente** (con cuidado LOPDP) · **protocolos asignables** a paciente · **objetivos de tratamiento** en el informe · **guardar informes en DB** (historial).

---

## 🗓️ Sesión 2026-06-01

### ✅ Cerrado hoy — todo pusheado a `origin/main`, deploy Vercel **verde verificado**
Tres commits a producción (push `9ab1053..d006757`):

1. **`ca2da27` — `feat: informes con IA vía API real (serverless) + auth Supabase`** — la **killer feature** de IA real dentro de la app.
   - **Antes:** `callAI` (`ia.js`) abría `claude.ai` en pestaña nueva y pedía copiar/pegar el resultado.
   - **Ahora:** nueva función serverless **`api/informe.js`** (Vercel, ESM, `fetch` nativo Node 18+, **cero dependencias nuevas**) que hace de proxy a Anthropic (`claude-haiku-4-5-20251001`). La **`ANTHROPIC_API_KEY` vive solo server-side**, nunca en el frontend; sin `console.log` (los datos clínicos no quedan en logs de Vercel).
   - **Auth del endpoint:** valida el `Authorization: Bearer <token>` contra Supabase `/auth/v1/user` **antes** de leer el prompt y **antes** de llamar a Anthropic → `401` si falta/inválido/expirado, para que **solo usuarios autenticados gasten la key paga**. `callAI` adjunta el `access_token` de la sesión (`supa.auth.getSession()`); sin sesión, `toastErr` y no llama.
   - **Anonimización LOPDP:** el prompt de `genPatientAI` ya **no** envía nombre, cédula, terapeuta ni doctor — solo datos clínicos. `genSemanalAI`/`genResumenDiaAI` ya eran solo agregados.
   - Output escapado en el DOM, estado "Generando…", `toastErr` si falla. Quitada la ↗ de los **7** botones de IA. `.env.example` con `ANTHROPIC_API_KEY=`.

2. **`d965d65` — `feat: Informe Paciente en formato de evolución (pantalla + PDF) con narrativa IA y técnicas`**.
   - **`renderPatientReport`** (`informes.js`) rediseñado al formato objetivo: encabezado de marca + "Informe de evolución" + N.º (derivado) + fecha · bloque paciente visual (avatar + nombre + cuadrícula diagnóstico/terapeuta/doctor/inicio) · métricas (Sesiones, Continuidad %, Dolor EVA inicial→actual) · **nuevo gráfico de evolución EVA (Chart.js line, `animation:false`)** · sección **narrativa clínica (IA)** con placeholder "—" · **tabla detalle por sesión** `Fecha | EVA (antes→después) | Técnicas | Observación` · pie "Generado por RehactivaPro" + línea de firma.
   - **`exportarPDF`** alineado al mismo formato; embebe el gráfico EVA capturado de pantalla con **`canvas.toDataURL`** (antes de abrir la ventana, sin re-render → evita el canvas en blanco por timing); inserta la narrativa IA leída del DOM. Usa un contexto compartido **`_rptCtx`** para que PDF y pantalla muestren **exactamente** los mismos datos episodio-aware (incluido el filtro `sesLogPDF` de 'Fin de episodio' y el conteo).
   - **`genPatientAI`** (`ia.js`): prompt acotado a SOLO 2 secciones cortas (Evolución general + Conclusión y recomendaciones), ≤150 palabras, anonimizado.
   - **Fix de persistencia:** `saveSession` (`sesiones.js`) ahora guarda las técnicas seleccionadas (`proTecnicasSel`) en **`session_log.tags`** (INSERT y UPDATE) y en el log en memoria. **Requiere la columna `tags text[]`** — ya creada en Supabase (`alter table public.session_log add column if not exists tags text[] default '{}';`).
   - ⚠️ Las sesiones guardadas **antes** de este fix tienen `tags` vacío → muestran "—" en la columna Técnicas (no recuperable).

3. **`d006757` — `feat: agrandar modales Registrar sesión y Evaluación inicial (cómodos al dedo en tablet)`**.
   - Técnicas como **chips tocables** (13px, `min-height:42px`) en vez de texto de 10px; botones **EVA 0-10** más grandes (15px, `min-height:44px`) con borde visible en inactivos; labels/inputs/textareas a tamaño legible vía **CSS scopeada a `#session-modal`/`#eval-modal`** (no afecta otros formularios); checkboxes de zona afectada más grandes. **Solo escala/CSS**, sin tocar lógica ni campos; respeta el responsive existente.

### ⚠️ Pendiente operativo
- **`ANTHROPIC_API_KEY` en Vercel:** confirmar que esté cargada en **Settings → Environment Variables** (scope Production). Sin ella, el informe y el PDF funcionan, pero la **narrativa IA** responde error. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ya estaban y se usan también server-side para validar el token.

### 🛠️ Nota de proceso
- El push a Vercel se **verificó verde** vía el commit status de GitHub (`context: Vercel`, `state: success`) — ya no quedó "sin verificar" como en sesiones previas (este entorno sí pudo consultar la API de GitHub aunque no tenga Vercel CLI).

---

## 🗓️ Sesión 2026-05-31

### ✅ Cerrado hoy — en producción
- **S2 verificado:** la RLS restringe **escrituras** e **INSERTs** por rol; las **lecturas** quedan abiertas entre usuarios autenticados (decisión consciente, OK para el tamaño de la clínica).
- **Rediseño pantalla Pacientes:** layout plano estilo Reliv (sin avatar), columnas **Paciente / Edad / Cédula / Email / Doctor / Acciones**. Columna **Edad** con años/meses/días derivados de `birth_date` (`getFullAge` en `utils.js`). Filtros **Todos / Activos / Inactivos**. Botón **"Ver"** → Informe Paciente (reemplaza el "consultar" de Reliv). Estado vacío **"Sin datos"** en gris. Responsive móvil (tarjetas apiladas). Todo en un commit.
- **CLAUDE.md** (proyecto + global `~/.claude`) configurados.

### 📝 Nota — la app aún NO está en uso
- Los `0%` / "Sin datos" son **esperados, no bugs**. El plan es ir comparando contra Reliv y completar manualmente `birth_date` de los pacientes activos.

### 🛣️ Roadmap restante
- **Errores pendejos / QA:** arreglar mapa de calor (informes), **S3 borrado en cascada** (`ON DELETE CASCADE` en FKs), repaso manual de pantallas.
- **Killer feature — informes con IA:** usar tier **PAGO** + **anonimizar datos** (no free tier, entrena con datos médicos = riesgo LOPDP). Base ya en `ia.js`.
- **2FA admins** · **notificaciones a médicos** · rediseño de otras pantallas.
- **Futuro / opcional:** minimización LOPDP (terapeuta ve solo sus pacientes) · recálculo `done` (no-op hoy, se enciende con el uso) · skill de migraciones Supabase.

---

## 🗓️ Sesión 2026-05-30

### ✅ Cerrado hoy — todo pusheado a `origin/main` (deploy Vercel SIN verificar, ver abajo)
Cuatro commits llevados a producción (push `3b5f7ca..efd7471`):

1. **`3b5f7ca`** — refactor de informes (venía de la sesión anterior, *quedaba sin pushear*; hoy se pusheó). **Pendiente todavía:** prueba en navegador con datos reales (mensual/anual/cambio de mes/meses vacíos).
2. **`d134c3e` — `fix: escapar XSS en render de protocolos`** (S1). `renderProtocols()` en `js/protocolos.js` interpolaba `p.def` y `p.alta` crudos en `innerHTML`. Se envolvieron en `esc()`. `def` no es editable por el usuario hoy (no está en el form ni se mapea desde DB) y es texto plano, pero se escapó igual por consistencia y blindaje futuro. Verificado por grep: eran las únicas 2 interpolaciones crudas de esos campos.
3. **`c5fdfb5` — `fix: sincronizar contador done en cambio de estado`** (B1). En `cycleStatus()` (`js/agenda.js`) `done` solo se **decrementaba** al *salir* de `conf`; faltaba la rama espejo al *entrar* a `conf`. Se agregó `else if(a.status==='conf'&&prevStatus!=='conf')` con `+1`, persistencia a DB idéntica a la rama de decremento, guarda `if(pt.billing)`, y sin doble llamada a `checkBillingOnStatusChange`. **Bonus:** la rama nueva también persiste `pendientes` al entrar a conf (antes solo se mutaba en memoria).
4. **`efd7471` — `chore: eliminar código muerto (app.js legacy + helpers y handlers sin uso)`**. −2948 líneas. Borrados (cada uno re-verificado por grep, 0 referencias en `*.js`/`*.html`):
   - `app.js` (monolito legacy, 2868 líneas; `index.html` solo carga `/js/main.js`).
   - `renderPatientsOld()` en `js/pacientes.js`.
   - `dbSaveAppt`, `dbDeleteAppt`, `dbSavePatient`, `dbSaveTherapist`, `dbSaveDoctor` en `js/auth.js` (se **conservan** `dbSaveProtocol`/`dbDeleteProtocol` y los demás `dbDelete*`/`dbUpdate*`).
   - `openWA` / `waPatient` en `js/resumen.js` (restos de WhatsApp, sin callers). Edición **quirúrgica** en `main.js` L21/L209: se quitaron solo esos dos símbolos, dejando intactos `simWA`/`simEmail` (sí usados en los botones del resumen).
   - Validación: `node --check` OK en los 4 archivos editados.

### 🧪 Pendiente de PROBAR / DECIDIR — recálculo histórico de `done`
- El bug B1 implica que los datos en prod quedaron **subcontados** (`done` nunca subió). El fix solo corrige de aquí en adelante.
- Se creó **`diagnostico_done.sql`** (raíz, **READ-ONLY**, sin trackear en git): compara por paciente, **por episodio**, `done_stored` vs `conf_episodio_actual` (citas `status='conf'` con `date >= inicio_episodio_actual`) vs `asistio_clinico`. La frontera del episodio actual es `MAX(date)` de `session_log type='Fin de episodio'`. **Borde `>=` inclusive** (ojo: `informes.js:375` usa `>` estricto — divergencia anotada).
- **Falta:** correr la diagnóstico en Supabase → con los números, definir la "verdad" de `done` y escribir el `UPDATE` correctivo (a revisar antes de ejecutar; **nada corrido sobre prod**).

### ⚠️ Deploy Vercel — SIN verificar
- El push a `origin/main` (GitHub `bundo123/rehactivapro`) se confirmó, pero **no se pudo verificar el estado del deploy de Vercel**: este entorno no tiene Vercel CLI, `gh`, `vercel.json`/`.vercel` ni token de API.
- **Falta:** confirmar en el dashboard de Vercel que `efd7471` quedó *Ready*.

---

## 🗓️ Sesión 2026-05-29

### ✅ Cerrado hoy — Audit log LOPDP (en producción)
- Nuevo archivo **`audit_log.sql`** (commit `39b9014`): tabla `audit_log` append-only / inmutable para cumplimiento LOPDP Ecuador. **Corrido y verificado en producción** (SQL editor de Supabase).
- Audita escrituras (INSERT/UPDATE/DELETE) en **7 tablas**: `patients`, `session_log`, `appointments`, `cobros`, `profiles`, `therapists`, `doctors`. `protocols` queda fuera por decisión de FASE 1.
- Inmutabilidad en 3 capas: RLS (SELECT solo admin) + `REVOKE UPDATE/DELETE/TRUNCATE` + triggers bloqueadores (`RAISE EXCEPTION` para todos, incluido el owner).
- `audit_trigger_fn()` es `SECURITY DEFINER` con `search_path=''`; resuelve el actor desde `profiles` con fallback `'system'`.
- ⚠️ La sección **a) → SQL** de este doc ("No se detectaron archivos `.sql`") quedó **desactualizada**: ya existe `audit_log.sql`.

### 🧪 Pendiente de PROBAR — Refactor de informes (commit `3b5f7ca`, sin pushear)
- `renderMensual()` y `renderAnual()` en `js/informes.js`: se reemplazaron **todos** los valores hardcodeados por cálculos reales desde `state`.
- Regla dura aplicada: **cero números inventados**; si una métrica no se puede calcular con honestidad, muestra "—" o se oculta.
- Selector de mes funcional (`changeMensualMonth`); continuidad = `conf/(conf+noas)` con guarda de división por cero (`null` → "—"); proyección anual por run-rate sobre meses completos; pacientes únicos vía `Set`.
- **Falta:** probar en navegador con datos reales (mensual, anual, cambio de mes, meses sin datos) y luego pushear.

### 📝 Nota futura — Columna `discharge_date`
- Hoy no existe fecha de alta explícita en `patients`; por eso algunas métricas de informes (altas reales del mes, pacientes activos vs. mes anterior) no se pueden calcular con honestidad y se relabelaron/ocultaron en el refactor.
- Cuando se quiera medir altas y retención reales: agregar columna `discharge_date` en `patients`, setearla al pasar `status` → `alta`, y derivar las métricas de ahí.

### 🛣️ Roadmap restante
- **2FA para admins** — segundo factor en cuentas con rol admin.
- **Reemplazo de Reliv** — el gap a cubrir es **historia clínica + informe**; **no** requiere integración SRI (la facturación electrónica con clave 593 se hace aparte).
- **Rediseño de la pestaña Pacientes.**
- **Notificaciones a médicos derivadores** — hoy las preferencias se guardan (`state.notifSettings`) pero el envío no está implementado.
- Ver **`AUDITORIA.md`** (generado hoy) para hallazgos de seguridad/bugs/código muerto priorizados.

---

## a) Estructura de archivos

> Recuento **verificado con `wc -l` el 2026-08-11**. La tabla anterior era del corte de mayo:
> el JS activo pasó de ~3.173 a **5.709** líneas, y hay 4 módulos nuevos (`validators`, `cie10`,
> `mobile-menu`, `pdf-logo`) más las carpetas `/test/`, `/api/` y `/js/data/`.

### `/` (raíz)
| Archivo | Líneas |
|---------|--------|
| `index.html` | 822 |
| ~~`app.js`~~ *(legacy monolítico — **BORRADO** en `efd7471`, 2026-05-30)* | — |
| ~~`/src/`~~ *(scaffolding de Vite — **BORRADO**, ya no existe en el repo)* | — |

### `/js/` — 23 módulos activos
| Archivo | Líneas | |
|---------|--------|---|
| `pdf-logo.js` | 3 | logo del membrete como data URI (assets de JS nunca por ruta en string) |
| `supabase-client.js` | 10 | lee `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` |
| `toast.js` | 16 | |
| `mobile-menu.js` | 38 | |
| `state.js` | 41 | |
| `permissions.js` | 55 | |
| `search.js` | 63 | |
| `validators.js` | 105 | cédula EC, email, teléfono, errores de campo |
| `terapeutas.js` | 116 | |
| `cie10.js` | 150 | |
| `doctores.js` | 161 | |
| `ia.js` | 188 | |
| `protocolos.js` | 207 | |
| `resumen.js` | 212 | |
| `main.js` | 239 | |
| `auth.js` | 288 | |
| `realtime.js` | 322 | |
| `facturacion.js` | 339 | |
| `utils.js` | 348 | |
| `sesiones.js` | 382 | |
| `pacientes.js` | 484 | |
| `agenda.js` | 888 | |
| `informes.js` | 1054 | |
| **Total JS activo** | **5709** | |

**`/js/data/cie10-fisio.json`** — 182 KB, 2470 códigos. **No** entra en el bundle inicial: `cie10.js`
lo carga con `import()` al primer uso (chunk aparte).

### `/css/` — 1.934 líneas
| Archivo | Líneas |
|---------|--------|
| `base.css` | 23 |
| `layout.css` | 59 |
| `resumen.css` | 68 |
| `rehactiva-theme.css` | 109 |
| `components.css` | 132 |
| `screens.css` | 229 |
| `facturacion.css` | 450 |
| `responsive.css` | 864 |

### `/test/` — `node --test`, **85 verdes**
| Archivo | Tests sobre |
|---------|-------------|
| `cedula.test.js` · `validators.test.js` | cédula ecuatoriana, email, teléfono |
| `utils.test.js` · `billing.test.js` | `doneActual`/`doneEnLog`/`pendientesActual`, frontera de episodio, "Cobro X de Y" |
| `horas.test.js` | horas exactas: `fmtTime`, `slotOf`/`apptSlots`, `apptsOverlap`/`findConflict` |
| `semana.test.js` | `startOfWeek` (vista semanal) |
| `cie10.test.js` | búsqueda del catálogo (acentos, punto opcional) |
| `noas.test.js` | slot liberado por no-asistió: `bloqueaSlot`, `compactNoas`, `occupiedSlots` |

### `/api/` — serverless de Vercel
| `informe.js` | 114 líneas | informe IA con rol `viewAI` y rate-limit **server-side** (`2e0303a`) |

### SQL y políticas versionados en el repo
- `audit_log.sql` — bitácora append-only e **inmutable** en 7 tablas (LOPDP). No tocar.
- `diagnostico_done.sql` — recálculo histórico de `done`; sigue pendiente de decisión (ver **P-2**).
- `rls_policies.md` — las políticas RLS versionadas (no es `.sql`, pero es la fuente de verdad).

---

## b) Arquitectura

### Qué hace cada módulo JS

| Módulo | Responsabilidad |
|--------|----------------|
| `supabase-client.js` | Inicializa y exporta el cliente Supabase |
| `state.js` | Estado global en memoria (caché de todas las entidades) |
| `auth.js` | Autenticación, carga masiva de datos, helpers de DB (delete/update cross-módulo) |
| `main.js` | Bootstrap de la app, routing por tabs, registro global `window._app` |
| `permissions.js` | Control de acceso por rol (admin / secretaria / terapeuta) |
| `realtime.js` | Suscripciones PostgREST para sync en tiempo real |
| `agenda.js` | Calendario de citas (vistas día/semana/mes + filtro por terapeuta), CRUD de citas, horas exactas, conflictos de solape, drag & drop, export CSV |
| `pacientes.js` | CRUD de pacientes, episodios, evaluación inicial, paginación |
| `sesiones.js` | Registro de sesiones clínicas (EVA, técnicas) |
| `facturacion.js` | Workflow de facturación y cobros |
| `informes.js` | Reportes semanales/mensuales/anuales/paciente, PDF export |
| `terapeutas.js` | CRUD de terapeutas y horarios |
| `doctores.js` | CRUD de médicos derivadores y preferencias de notificación |
| `protocolos.js` | Plantillas de protocolos de tratamiento |
| `resumen.js` | Dashboard diario con overview de citas |
| `search.js` | Búsqueda global de pacientes (sobre estado en memoria) |
| `ia.js` | Integración con Claude para insights de informes (vía `/api/informe.js`) |
| `utils.js` | Constantes, formateadores, getters compartidos y **la lógica pura testeable**: `doneEnLog`/`doneActual`/`pendientesActual`, horas exactas (`slotOf`/`apptSlots`/`apptsOverlap`/`findConflict`) y slot liberado por no-asistió (`bloqueaSlot`/`compactNoas`/`occupiedSlots`) |
| `toast.js` | Notificaciones toast (ok/error/info) |
| `validators.js` | Validación de cédula EC / email / teléfono + pintado de errores por campo |
| `cie10.js` | Diagnóstico CIE-10: catálogo de 2470 códigos con `import()` diferido, buscador y escritura en la ficha |
| `mobile-menu.js` | Menú lateral en móvil |
| `pdf-logo.js` | Logo del membrete como data URI (pantalla y PDF) |

### Tablas Supabase por módulo

| Módulo | Tablas |
|--------|--------|
| `auth.js` | `profiles`, `therapists`, `doctors`, `patients`, `appointments`, `protocols`, `cobros`, `session_log` |
| `agenda.js` | `appointments`, `patients` |
| `pacientes.js` | `patients`, `session_log`, `cobros`, `appointments` |
| `sesiones.js` | `session_log` |
| `facturacion.js` | `cobros`, `patients` |
| `terapeutas.js` | `therapists`, `appointments` |
| `doctores.js` | `doctors`, `patients` |
| `protocolos.js` | `protocols` |
| `cie10.js` | `patients` *(el CIE-10 es dato de la ficha, no de la cita)* |
| `realtime.js` | `appointments`, `patients`, `session_log`, `cobros`, `therapists`, `doctors` |
| `resumen.js`, `informes.js`, `search.js` | *(solo leen de `state`, sin queries directas)* |

### Dependencias entre módulos (qué importa qué)

*(verificado por grep el 2026-08-11; "X ← a, b" = a y b importan X)*

```
supabase-client ← auth, agenda, pacientes, sesiones, terapeutas, doctores, realtime, cie10
state           ← todos los módulos
utils           ← agenda, auth, cie10, doctores, facturacion, ia, informes, main, pacientes,
                   protocolos, realtime, resumen, search, sesiones, terapeutas, toast
toast           ← agenda, auth, cie10, doctores, facturacion, ia, main, pacientes, protocolos,
                   realtime, resumen, search, sesiones, terapeutas
permissions     ← agenda, cie10, doctores, facturacion, informes, main, pacientes, protocolos,
                   sesiones, terapeutas
validators      ← agenda, doctores, pacientes, protocolos, sesiones
cie10           ← agenda (modal de cita), pacientes (ficha), main
pdf-logo        ← informes (membrete en pantalla y PDF)
mobile-menu     ← main
auth.js         ← agenda (dbUpdateApptStatus, dbRegistrarCobro), facturacion (dbRegistrarCobro),
                   terapeutas (dbDeleteTherapist), doctores (dbDeleteDoctor), protocolos (dbSaveProtocol, dbDeleteProtocol)
resumen.js      ← pacientes (hasEvalInicial), informes (hasEvalInicial), search (hasEvalInicial)
agenda.js       ← facturacion (updateFacturaBadge), terapeutas (updateFacturaBadge),
                   informes (apptSlots, re-exportado desde utils por retrocompatibilidad)
ia.js           ← informes (genSemanalAI, genPatientAI, callAI)
main.js         ← importa todos los módulos anteriores
```

---

## c) Estado de funcionalidades

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Auth + login | ✅ | Supabase Auth, carga perfil en login |
| Auto-logout por inactividad | ✅ | 15 min (`3986a7e`) — PCs compartidas de recepción |
| Roles (admin/secretaria/terapeuta) | ✅ | `permissions.js` + `state.currentUserRole` |
| RLS en Supabase | ✅ | Versionada en `rls_policies.md`. La "lectura abierta" de PHI es decisión consciente, cubierta por `audit_log` |
| Audit log LOPDP | ✅ | Append-only e inmutable en 7 tablas (`audit_log.sql`) |
| Pacientes — CRUD | ✅ | Crear, editar, eliminar con confirmación |
| Pacientes — búsqueda | ✅ | Búsqueda global en memoria con highlight |
| Pacientes — paginación | ✅ | Paginación por página en `pacientes.js` |
| Pacientes — episodios | ✅ | Alta y gestión de episodios clínicos |
| Agenda — vista día | ✅ | Grid por terapeuta y hora |
| Agenda — vista semana | ✅ | Por terapeuta, Lun–Sáb (Dom solo si tiene citas) — `17df85e` |
| Agenda — vista mes | ✅ | `17df85e` |
| Agenda — filtro por terapeuta | ✅ | Manual, se resetea al entrar a la pestaña — `576d68a` |
| Agenda — crear/editar cita | ✅ | Modal completo |
| Agenda — hora exacta (no solo :00/:30) | ✅ | Toggle con `<input type="time">`; la cita se dibuja en su media hora contenedora — `22d541a` |
| Agenda — conflictos de horario | ✅ | Solape por **intervalo real**, no por slots (`findConflict`); mensaje que dice cuál cita choca; cubre recurrentes (`c8fbca0`) y edición de sí misma |
| Agenda — slot liberado por "no asistió" | ✅ | La franja se puede reagendar sin borrar la cita; tira compacta + "+" para agendar — `219ed02` |
| Agenda — citas recurrentes | ✅ | Con chequeo de solape por fecha; reporta las omitidas |
| Agenda — drag & drop | ✅ | Re-alinea a la media hora del slot destino y persiste |
| Agenda — citas en fechas pasadas | ✅ | Solo admin/secretaria (`apptPastDate`) — `a7fe9ce` |
| Diagnóstico CIE-10 | ✅ | 2470 códigos, carga diferida; en ficha, modal de cita, informe y PDF — `c616417` |
| Evaluación inicial | ✅ | Modal en pacientes, `hasEvalInicial()` |
| Sesión clínica | ✅ | EVA, técnicas, registro en `session_log` |
| Facturación / Cobros | ✅ | Registro de cobros, badge de pendientes |
| Reportes semanales | ✅ | Heatmaps, estadísticas |
| Reportes mensuales/anuales | ✅ | |
| Reporte por paciente | ✅ | Historial, progreso, export PDF |
| Realtime sync | ✅ | PostgREST subscriptions en todos los recursos |
| Permisos UI por rol | ✅ | `hasPermission()` en todos los módulos de escritura |
| Export CSV agenda | ✅ | `exportAgendaCSV()` en agenda.js |
| Export PDF | ✅ | `exportarPDF()` en informes.js |
| Integración IA (Claude) | ✅ | Informes semanales y por paciente, vía `/api/informe.js` con rol `viewAI` + rate-limit server-side |
| Notificaciones a médicos | 🟡 | Preferencias guardadas, **envío no implementado** — sigue en el roadmap |
| Protocolos de tratamiento | ✅ | CRUD + adherencia |
| Responsive / móvil | ✅ | Pasada con foco en el flujo del terapeuta (`bc8b276`); targets táctiles de 44 px |
| Tests automatizados | ✅ | 85 verdes con `node --test` (`npm test`), sobre la lógica pura |

---

## d) Deuda técnica

> Revisada contra el código el **2026-08-11**. La lista viva de lo abierto está arriba, en
> «🔜 PRÓXIMO», y el análisis completo en `AUDITORIA_PRELANZAMIENTO.md`.

### Ya no aplica *(la versión anterior de esta sección era de mayo)*
- ~~`app.js` monolítico~~ — borrado en `efd7471`; `index.html` solo carga los módulos de `/js/`.
- ~~`src/` scaffolding de Vite~~ — borrado, ya no existe.
- ~~No hay tests~~ — **85 verdes** con `node --test` (`npm test`), y el CI los corre.
- ~~URL y anon key hardcodeadas~~ — `supabase-client.js` lee `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` y avisa por consola si faltan. La anon key es **pública por diseño**;
  la seguridad real es la RLS.
- ~~Conflictos de agenda "solo UI-side" / sin validar~~ — `findConflict` por intervalo real, con
  tests; cubre crear, editar, drag & drop y recurrentes.
- ~~Sin validación de formato en formularios~~ — `validators.js` (cédula EC con dígito verificador,
  email, teléfono) + `parseTimeInput` para la hora.
- ~~`realtime.js` sin reconexión~~ — maneja `CHANNEL_ERROR`/`CLOSED`/`TIMED_OUT`, reintenta y
  muestra el estado de conexión; además re-sincroniza en `visibilitychange`.

### Funciones largas (>100 líneas) — medido el 2026-08-11
| Función | Archivo | Líneas aprox. |
|---------|---------|---------------|
| `renderSemanal()` | `js/informes.js:530` | ~229 |
| `renderGrid()` | `js/agenda.js:91` | ~199 |
| `renderPatientReport()` | `js/informes.js:846` | ~109 |
| `renderWeekView()` | `js/agenda.js:695` | ~105 |
| `saveAppt()` | `js/agenda.js:517` | ~97 |

Los renders grandes son plantillas HTML, no lógica: la parte con reglas de negocio se fue
extrayendo a `utils.js` (puro y testeado) — `doneEnLog`, `findConflict`, `compactNoas`,
`occupiedSlots`. Ese es el camino a seguir si hay que tocarlos.

### Sigue abierto
- **`loadAll()` (`auth.js:44`)** — un `Promise.all` sin manejo granular: si falla una tabla,
  aborta toda la carga.
- **Render sin tests** — no hay jsdom en el proyecto; lo puramente visual (apilado de la agenda,
  targets táctiles) se verifica a ojo en dev.
- **`cycleStatus` no chequea conflictos** — reactivar a `conf` una no-asistió sobre cuya franja ya
  se agendó deja dos citas activas solapadas.
- **Lo formal:** I-7 (`cobro_ref` server-side, necesita SQL), P-2 (frontera `>` vs `>=`), CSP
  estricta (P-11), agenda táctil en iOS (R-20) y la deuda de realtime RT-1…RT-4.

---

## e) Últimos commits *(al 2026-08-11; la tabla anterior se quedó en mayo)*

| Hash | Descripción |
|------|-------------|
| `219ed02` | feat(agenda): la cita "no asistió" libera el slot sin perderse |
| `abd3e2a` | docs(estado): sesión 2026-08-07 |
| `c616417` | feat(cie10): diagnóstico CIE-10 en modal de cita, ficha e informe |
| `22d541a` | feat(agenda): hora exacta en el modal de cita (no solo :00/:30) |
| `d6b516a` | fix(informes): el informe de un episodio pasado ya no cuenta la eval como sesión (R-2) |
| `576d68a` | feat(resumen,agenda): filtro manual por terapeuta y salto cita → informe en táctil |
| `bc8b276` | feat(responsive): pasada móvil con foco en el flujo del terapeuta |
| `a7fe9ce` | feat(agenda): permitir a secretaria/admin agendar citas en fechas pasadas |
| `17df85e` | feat(agenda): vistas Semana y Mes con navegación compartida y realtime |
| `c6a8c0b` | fix(informes): logo del membrete en producción vía data URI |

*(el commit de docs de cada sesión no se lista aparte; el detalle está en las secciones «🗓️ Sesión».)*
