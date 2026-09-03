# RehactivaPro — Estado del Proyecto

> Generado: 2026-05-18 · Última actualización: 2026-09-03

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

**Pulidos opcionales remanentes (no bloquean):** buscador de diagnóstico del modal de paciente con UX pobre; ~~`": "` suelto al inicio de "Evaluación inicial"~~ ✅ **CERRADO 2026-08-31** (`c6b714d`: `limpiarParte()` en `utils.js`, aplicada en pantalla/PDF/Word); **táctil-42 en Pacientes** — `.patient-table .pl-act-btn{min-height:42px}` le gana por especificidad al bloque `@media (pointer: coarse)`, así que los botones de acción quedan en 42px en táctil real (detectado en la sesión 2026-08-12 (b); en Seguimiento ya está corregido con regla propia); ~~**botón "Exportar PDF" huérfano en la pestaña Informes**~~ ✅ **CERRADO 2026-09-01 (b)** (LOTE INFORMES, rama `revision-informes`): se movió a la tarjeta "Documento" del informe de paciente, junto a "Exportar Word" — que es la pantalla que construye el `_rptCtx` del que depende. **Queda sin gate de permisos a propósito** (decisión de Jefferson): ver la sesión 2026-09-01 (b) más abajo.

### 🗓️ Plan a julio — meta: audit final con 0 críticos / 0 importantes (solo pulidos opcionales)
- **Semana 1** (cerrada hoy, salvo I-7): I-5 · LOTE A · I-4 · I-6 ✅. Queda **I-7** (necesita el SQL de la secuencia).
- **Semana 2:** auto-logout (15 min) · I-13 (alerts→toasts) · P-11 (CSP parcial).
- **Semana 3:** I-12 (focus-trap/Escape) · I-15 (tests `node --test`) · `npm audit fix` · decisión P-2/P-6.
- **Semana 4:** `clinical_context` de protocolos reales · papeleo LOPDP (lectura abierta + sub-encargado Anthropic) · **audit final**.

---

## 🗓️ Sesión 2026-09-03 — LOTE QB (conciliación QuickBooks) y LOTE BLOQUEOS (capacidad real)

Dos lotes, **un commit cada uno**, revisados en rama y mergeados a `main` en fast-forward; las dos
ramas (`qb-conciliacion` y `bloqueos-capacidad`) se borraron local y remota tras el merge. Tests:
**326 verdes** (+12 en `test/qb.test.js`, +21 en `test/bloqueos.test.js`). Los dos necesitaron
**SQL**, aplicado por Jefferson en producción antes del merge. Vercel verde verificado en los dos
por commit-status **y** por hashes de `dist/` contra lo servido en `rehactivaec.com`.

### Lote QB — `qb_at` es administrativo y ORTOGONAL al estado clínico (`d06ce43`)

La pregunta que responde la columna es *"¿esta cita ya se pasó a QuickBooks?"*, y no es una pregunta
clínica: **no** entra en el ciclo `conf → pend → noas` ni agrega un cuarto estado. Por eso `qb_at` es
una columna aparte y no un valor de `status`.

- **Lo único que arrastra es la baja.** Al salir de `'conf'` la cita se **desconcilia**: lo que no
  es asistencia no puede quedar pasado a QuickBooks. Eso vive en **`payloadCambioStatus()`**
  (`utils.js:728`), que devuelve `{status}` para `'conf'` y `{status, qb_at:null}` para el resto — y
  se aplica en la **MISMA escritura** que el estado, para que no exista un instante (ni una falla de
  red) con una no-asistió conciliada. Es un **invariante**, no una rama del `if`: se aplica aunque el
  rol no vea la casilla, porque un terapeuta puede pasar a `'pend'` una cita ya conciliada.
- **Solo se concilian las confirmadas** (`citasConciliables()`, `utils.js:721`): la no-asistió no se
  cobra, y una `'pend'` de un día pasado es un error de registro, así que el botón las deja intactas.
- **"Conciliar día (N)"** en la subbarra de la agenda, para `admin`/`secretaria` y solo de hoy hacia
  atrás — un día futuro no tiene nada que facturar. **N se calcula sobre TODAS las citas del día**,
  no sobre las visibles: el filtro por terapeuta es una **lente de la grilla**, no un recorte de lo
  que se pasa a QuickBooks; conciliar filtrado dejaría medio día sin conciliar sin que se note.
  Conciliado el día, el botón se queda a la vista como "Día conciliado ✓".
- **Una sola query**, filtrando por `date + status + qb_at is null` en vez de por una lista de ids:
  así alcanza también a la cita creada por otro usuario **entre el render y el click**, y repetir la
  acción es inocuo. Optimista con reversión.
- **Toggle "Pasada a QuickBooks"** en el modal de cita para la corrección individual, visible solo
  sobre una cita confirmada y para quien factura. Al **crear** una cita nunca se manda `qb_at`.
  Marcar una ya conciliada **conserva su fecha original**: no se re-timbra sin motivo.
- **`.appt-qb`** (`screens.css:47`) apaga la tarjeta a gris papel, **sin** `filter:saturate`: el
  punto de estado tiene que seguir mostrando el **estado clínico**, que es otra cosa.
- **Permiso `conciliarQB`** (admin + secretaria). Es trabajo administrativo, no clínico: lo hace
  quien factura. El terapeuta no lo ve.
- De paso, los dos toggles del modal de cita (QuickBooks y "repetir esta cita") pasaron de
  `<input type=checkbox>` a `<button aria-pressed>` con `.toggle-chip`: el blanco de un checkbox
  nativo es de ~13 px y estos se tocan con el dedo → `min-height:42px` (táctil-42). El estado **ES**
  el atributo, así que no hay una segunda fuente de verdad que se pueda desincronizar del DOM, y el
  listener va por JS (hay CSP).

**SQL:** la columna `appointments.qb_at` la aplicó Jefferson en producción.
**Tests (12):** `citasConciliables` (filtra por día, por estado y por ya-conciliadas) y
`payloadCambioStatus` (el invariante de la baja en las tres transiciones).

### Lote BLOQUEOS — regla → regla, excepción → registro (`e4f3886`)

Dos cosas que parecen la misma y **no** lo son, y por eso se modelan distinto:

- El **ALMUERZO** es una **REGLA**: `therapists.lunch_minutes` (select en el modal de terapeuta:
  0 / 30 / 45 / 60 / 90, default 60). **No hay botón diario de almuerzo** — se olvidaría un martes
  cualquiera y la métrica de ocupación quedaría inflada **en silencio**. Solo se descuenta de la
  capacidad; no se pinta en la grilla.
- La **EXCEPCIÓN** (vacaciones, curso, permiso) es un **REGISTRO**: una fila en `therapist_blocks`.
  Se pinta, no acepta citas y también baja la capacidad.

**En la agenda.** La franja bloqueada se pinta `.slot-block` (rayado gris de
`repeating-linear-gradient`, `screens.css`), **sin** el listener de `openApptModalAt`: no es un slot
libre y no puede parecerlo. El motivo se escribe **una sola vez**, en el slot que contiene la hora de
inicio — repetirlo en cada media hora convertiría un bloqueo de mañana entera en una columna de
texto. Va en **Día y Semana**; la vista Mes no se tocó. La **cita siempre manda**: si por lo que sea
ya hay una en la franja, se dibuja la cita — el bloqueo nunca tapa un dato real. Las tiras de "no
asistió" se siguen viendo encima, porque ya no ocupan el slot. Con `manageBlocks`, el click sobre la
franja pintada abre el modal en modo edición.

**El guard, en los cuatro caminos.** `findBlock()` (`utils.js`, mismo criterio de solape que las
citas: tocarse en el borde **no** es solape) se consulta en `saveAppt` (alta y edición), en el
**drop** del drag & drop —el slot bloqueado no tiene listener, pero una cita larga soltada al lado
puede meterse en el bloqueo— y en el bucle de **recurrencia**, donde las fechas bloqueadas se saltan
y se **reportan aparte** en el toast final ("N creadas · M bloqueadas"): si no, la secretaria se
queda creyendo que la serie completa quedó agendada. Se consulta **ANTES** que el conflicto de citas,
a propósito: una franja bloqueada no está *"ocupada por otro paciente"*, directamente **no existe
como oferta**, y decir lo otro mandaría a buscar una cita que no está.

**El sistema NUNCA borra citas para hacerle lugar a un bloqueo.** Si la franja ya está vendida, el
guardado se rechaza con el número de citas que choca ("El bloqueo choca con N cita(s). Reagendalas
primero.") y hay que reagendarlas antes. Es la única decisión que no puede tomar sola la app: atrás
de cada cita hay un paciente al que hay que avisarle. Las `noas` **no** cuentan como choque — ya no
ocupan la franja, mismo criterio que `bloqueaSlot`.

**Capacidad — lo que justifica el lote.** `capacidadSlots(th, dates, blocks, hoy)` (`utils.js`, pura,
`hoy` inyectable) reemplaza al **`therapistHours(th).length*5`** hardcodeado del "Desempeño por
terapeuta": suma **solo días hábiles**, **solo fechas ya transcurridas** (`<= hoy`), y por día resta
almuerzo y bloqueos, **nunca por debajo de 0** (un bloqueo de día completo deja ese día en 0, no en
−2). Cierra la deuda del denominador del lote 4a (sesión 2026-09-01 (e), más abajo): el % ya no se hunde
a mitad de semana. El contador de **"slots libres"** de la agenda usa la misma capacidad real, así
que dejó de ofrecer horas que el terapeuta no puede atender.

**El mapa de calor descuenta los bloqueos pero NO el almuerzo, a propósito.** `lunch_minutes` es una
cantidad **diaria sin hora fija**: baja la ocupación agregada, pero no se puede ubicar en una celda
hora×día sin inventar a qué hora almuerza cada uno. Queda comentado en `informes.js`.

**Permiso `manageBlocks`** (admin + secretaria). Es agenda pura, la maneja quien la agenda: si cada
terapeuta se bloqueara solo, la recepción vendería horas que ya no existen.

**`mapBlockRow()` es la ÚNICA copia del mapeo DB→memoria** (carga inicial en `auth.js` + realtime),
misma lección que `mapTherapistRow`: con dos copias, el bloqueo que llega por realtime termina
distinto del que llegó al cargar. Realtime suscrito a `therapist_blocks` (INSERT/UPDATE/DELETE +
anti-eco): re-renderiza la agenda y, si está abierto, el informe semanal — un bloqueo creado en otra
PC cambia el % de utilización que hay en esta pantalla.

**SQL (aplicado por Jefferson):** `therapists.lunch_minutes int not null default 60` con
`check (0..180)`; tabla `therapist_blocks` (`therapist_id`, `date`, `start_h`, `end_h`, `motivo`,
`created_by`, `check (end_h > start_h)`) + índice `(date, therapist_id)`; RLS con SELECT abierto a
`authenticated` e INSERT/UPDATE/DELETE para admin+secretaria (misma expresión de rol que
`rls_therapists_secretaria.sql`); `alter publication supabase_realtime add table therapist_blocks`.

**Tests (21):** `findBlock` (dentro, borde que no solapa, otro terapeuta, otra fecha, id comparado
como string), `blockedSlots` (parcial, día completo, **dos bloqueos solapados sin doble conteo**, lo
que se sale del turno no cuenta), `capacidadSlots` (almuerzo −2/día, fin de semana fuera, futuro
fuera, día completo → 0, nunca negativa, acepta `Date` o string), `lunchSlots`, `esDiaHabil` y
`mapBlockRow`.

### 🔧 Tareas manuales que deja la sesión

- **Revisar el `lunch_minutes` de los terapeutas que NO almuercen 60 min.** La columna entró con
  default 60 **para todos**; el que tenga 30, 45, 90 o ninguno hay que corregirlo a mano en
  Terapeutas → Editar. Mientras tanto su capacidad —y por lo tanto su % de utilización— sale
  desviada, y en silencio.

---

## 🗓️ Sesión 2026-09-01 (e) — LOTE INFORMES 4a: quitar lo que sobra

Un commit (**`4000edd`**), revisado en la rama `revision-informes-4a` (auditoría + prueba manual de
Jefferson, que encontró el bug de más abajo) y mergeado a `main` en fast-forward; la rama se borró
local y remota. Tests: **293 verdes** (+9 en `test/informes-rango.test.js`). Sin SQL, sin cambios de
esquema, sin RLS nueva. **Lote de RESTA**: no agrega paneles ni toca el esqueleto — eso es el 4b.

La spec quedó versionada en **`PLAN_INFORMES.md`** (crítica con evidencia, el diseño y el plan por
lotes) y la maqueta del esqueleto en **`mockups/informes-esqueleto-2026-09.html`**. Los dos son la
spec del **4b** y el **4c**: no son documentación de lo hecho, son el pliego de lo que falta.

### Lo que se eliminó y por qué *(tabla §3.4 de `PLAN_INFORMES.md`)*

| Elemento | Por qué se fue |
|---|---|
| Gráfico "Tendencia — últimos 3 meses" (mensual) | Tres datasets en el **mismo eje Y**: sesiones (~400), continuidad (0–100) e inasistencias (~40). La barra de continuidad medía lo mismo que una de 92 sesiones. Duplicaba los chips de variación que ya están arriba, y con `continuidad ?? 0` pintaba **0%** justo donde `resumenCitas` devuelve `null` a propósito. |
| Tarjetas **Citas totales**, **Atendidos** y **Activos** (semanal) | "Citas totales" incluía las pendientes (no es un dato, es carga sin cerrar); "Atendidos" en una semana ≈ asistidas/2.5; "Activos" es el **padrón**, no la semana. |
| **Pacientes activos** y **Altas médicas (total)** (mensual), **Altas médicas (total)** (anual) | Números del padrón: valían lo mismo en agosto que en julio y salían idénticos en las tres pestañas. `patients.status='alta'` **no tiene fecha**, así que "altas del período" no se puede calcular todavía → vuelve cuando exista `discharge_date`. |
| Tarjeta **Proyección anual** | Run-rate (`sesiones de meses completos / meses × 12`) sin estacionalidad — la clínica cierra en feriados y vacaciones. Y el prompt anual le **prohíbe exactamente eso** al modelo ("No proyectes cifras a fin de año a partir de meses incompletos", `ia.js`): la pantalla hacía lo que le prohibimos a la IA. |
| Panel **Top diagnósticos** (semanal) | Partía `pt.diag` (texto libre) por coma y agrupaba el primer trozo: "Lumbalgia", "lumbalgia crónica" y "Dolor lumbar" contaban como tres cosas distintas. Vuelve **por código CIE-10** cuando la cobertura del campo lo permita. |
| Panel **Próximos a alta ≥80%** (semanal) | Lista operativa (vive en Facturación/Pacientes), y encima con `slice(0,5)` **sin ordenar**: mostraba los cinco primeros del array, no los cinco más cercanos al alta. |
| Panel **Insights automáticos** (semanal) | Trivia: "la franja con más citas", "X lidera la agenda" y "N inasistencias". La tercera ya estaba en una tarjeta; las otras dos no cambian ninguna decisión. |
| Lista **Pacientes por doctor referente** (mensual) | Contaba **todo el padrón**, no el mes. De paso se fue su texto en `#c8c6c0` (gris de tema oscuro sobre fondo claro, casi invisible). La reemplaza "Nuevos por doctor referente **del período**" en el 4c. |
| `renderTherapistUtil`, `hmCol` | Código muerto: la primera sin caller desde el rediseño, la segunda (paleta semáforo vieja) solo la usaba la primera. |
| Botón **Análisis con IA** del header, `genInformeAI` | Ver más abajo. |

El **mapa de calor** y la lista de **No asistieron + WA** se quedaron **tal cual**. Al irse los
paneles que los acompañaban, los que sobreviven pasan a ancho completo: `.inf-grid` es `1.5fr 1fr`
y con un solo hijo dejaba un 40% de hueco a la derecha.

### Una sola fórmula y un solo nombre

Antes la misma clínica veía **84% el viernes** (semanal, "Asistencia" = `conf/total`, con las
pendientes en el denominador) y **92% el día 1** del mes siguiente (mensual, "Continuidad" =
`conf/(conf+noas)`). Dos nombres y dos fórmulas para la misma pregunta: desconfianza gratuita.

- **Continuidad = `resumenCitas(...).continuidad`** en las **tres** pestañas, con los mismos
  umbrales de color (85/70) y `'—'` cuando no hay citas decididas — nunca un 0% inventado.
- La vieja **"Asistencia" (`conf/total`) ya no se pinta en ninguna tarjeta**. El campo
  `asistencia` sobrevive en `resumenCitas` porque **el prompt semanal lo nombra** (`ia.js`), y eso
  no se tocó en este lote; el comentario de `utils.js` lo dice explícitamente para que nadie lo
  vuelva a subir a la pantalla.
- **Asistidas = `conf` con `date <= hoy`** (`asistidasEn(appts, hoy)`, pura, en `utils.js`) —
  tarjeta nueva del semanal, y la misma lectura que ya usan Historial y Seguimiento. Es lo único
  que este lote **agrega**.
- Los tres sub-tabs usan `.informe-stat-grid` + `.stat`; el semanal deja de usar `.kpi-grid`/`.kpi`,
  que se borraron del CSS junto con `.rank-row` (huérfana al irse los dos rankings). `.rpt-kpi-grid`
  del informe de paciente es **otra clase** y queda.

### ⚠️ El bug que encontró la prueba manual — un rango EN CURSO contaba las conf FUTURAS

Semanal mostraba **Asistidas 54 · No asistieron 14 · Continuidad 89%**, pero 54/(54+14) = **79%**.
El 89% salía de las **59 conf ya agendadas** para el resto de la semana (era martes): `asistidasEn`
las excluía, `resumenCitas` no. Mismo error en el anual ("700 acumuladas Ene–Sep" incluía
septiembre futuro) y en los **tres bloques de datos que recibe la IA**.

El fix es **`hastaHoy(appts, hoy)`** (`utils.js`, pura, acepta `Date` o `'YYYY-MM-DD'`): recorta un
rango a lo que **ya ocurrió**. `resumenCitas` **no se tocó** — el recorte va en el llamador, no en
la fórmula.

- **Pantalla:** todo lo que se muestra como **tasa o acumulado** se calcula sobre `hastaHoy(rango)`
  en las tres pestañas — continuidad, `conf`/"sesiones", inasistencias, pacientes únicos y los
  ✓/✗ por terapeuta. En mensual y anual entra por `_apptStats` (`informes.js`), que es la puerta
  por la que pasan **todas** sus tarjetas y las barras del chart anual.
- **IA:** las tres `gen*AI` pasan `hastaHoy(rango)` a `resumenCitas` y al desglose por mes. Único
  cambio de texto en los prompts: `", contados hasta hoy (DD/MM/YYYY)"` detrás de "Estos son TODOS
  los datos de esa semana / esos dos meses / del año". Nada más del prompt cambió.
- **Invariante testeada:** `asistidasEn(rango) === resumenCitas(hastaHoy(rango)).conf`, sobre los
  tres rangos y cinco fechas de corte. `asistidasEn` está **definida sobre `hastaHoy`**, así que
  vale por construcción y no por coincidencia. Hay test del caso real (54/14/59 → **79%, no 89%**)
  y de que un rango **ya cerrado** da exactamente lo mismo con y sin recorte.
- **El mapa de calor NO se recorta, a propósito:** mide **agenda ocupada** (`conf`+`pend`), y ahí lo
  futuro **sí** cuenta — es justamente la pregunta "¿qué franjas tengo libres?". Usa `semAppts`, no
  `semHasta`.
- ~~**Efecto lateral aceptado:** el % de utilización por terapeuta **baja a mitad de semana**, porque
  el numerador ya es hasta-hoy y el denominador sigue siendo los slots de los cinco días. El
  denominador correcto (días hábiles **transcurridos** del rango) es del 4b — anotado en la deuda.~~
  ✅ **CERRADA 2026-09-03** (`e4f3886`): `capacidadSlots()` en `utils.js` reemplazó al
  `therapistHours(th).length*5` hardcodeado — días hábiles **transcurridos**, menos almuerzo, menos
  bloqueos. El numerador quedó con su propia deuda (P1, ver «Deuda técnica»).

### El botón de IA vive en la pestaña que analiza

El header tenía **un** botón para las tres pestañas, que despachaba por `state.informesSubTab` vía
`genInformeAI` (`ia.js`). Ahora hay **un botón por sub-tab**, arriba de su propia salida, llamando
directo a `genSemanalAI` / `genMensualAI` / `genAnualAI`, con el mismo `data-permission="admin"`.
`genInformeAI` quedó sin caller y se borró de `ia.js`, `informes.js` y `main.js`.
`state.informesSubTab` **se conserva**: la lee el 4b para el panel de IA del esqueleto nuevo.

### Arreglos sueltos

- `grid.color` del chart anual: `rgba(255,255,255,0.05)` → `rgba(0,0,0,.05)`. Eran líneas
  **blancas sobre fondo blanco**, resto del tema oscuro del que viene el componente.
- `Chart.defaults.color` (que se seteaba **global** en cada render) → `options.color` del propio
  chart. Ya no contamina los demás charts de la app.
- `#c8c6c0` fuera de `informes.js`.
- `.informe-stat-grid` pasa de `repeat(3,1fr)` a **`repeat(auto-fit, minmax(170px, 1fr))`**: hoy el
  semanal tiene 3 tarjetas y mensual/anual 4 — con 4 fijas el semanal deja hueco y con 3 la cuarta
  queda huérfana; además en móvil cae a 2 columnas solo (la clase no tenía regla responsive). El
  4b lo fija en 4 cuando las tres pestañas tengan las mismas cuatro tarjetas.

---

## 🗓️ Sesión 2026-09-01 (d) — LOTE HISTORIAL DE CITAS

Un commit (**`bcf2acc`**), revisado en la rama `revision-historial` (auditoría OK + prueba manual
de Jefferson) y mergeado a `main` en fast-forward; la rama de revisión se borró local y remota.
Tests: **284 verdes** (+31 en `test/historial.test.js`). Sin SQL, sin cambios de esquema, sin RLS
nueva. La spec del lote quedó versionada en `PLAN_HISTORIAL.md`, igual que `PLAN_BIRTHDATE.md`.

**Qué es la pantalla.** Pestaña `historial` en el nav (sección "Clínica", debajo de Agenda), para
los **tres roles**. Contesta en segundos *"¿cuántas veces ha venido este paciente?"* sin abrir el
informe clínico: buscador de paciente, cuatro tarjetas (el número grande son las **asistencias**),
chips de corte por episodio, filtros de mes y estado, tabla agrupada por mes con subtotales,
**Imprimir** con membrete y **Exportar CSV**. No agrega **ni una query**: todo se deriva de lo que
`loadAll` ya trajo (`state.appointments` y `p.log`); filtrar por paciente es O(n) sobre ~13k citas
al año (<1 ms) y los mapas caros —episodio por cita, ordinal por cita— se calculan **una vez por
render**, no dentro del `.map` de las filas (mismo patrón que `ordinalesDeCitas` en la agenda).

- **Una implementación, cuatro puertas.** `irAHistorial(patientId)` (`historial.js:34`) es la
  **entrada única** —chequea el permiso, fija `state.historialPatientId`, resetea el filtro y llama
  a `showTab`—, y la usan: **(1)** el modal de cita, **(2)** el side-card "Paciente" del informe,
  **(3)** el chip "Citas" del buscador global, **(4)** el nav, que entra por `showTab('historial')`
  a secas porque **no** debe resetear el paciente (si venís de una cita y volvés por el menú, la
  consulta se conserva). `agenda.js` la llama vía `window._app` y no por `import`: `informes.js` ya
  importa `agenda.js`, e importar `historial.js` cerraría un ciclo de módulos por una sola llamada.
- **`#appt-goto-rpt` se partió en dos.** El botón único del modal de cita ("Ver informe del
  paciente") ahora son dos hermanos, "Ver informe" e "Historial de citas", dentro de un contenedor
  `#appt-shortcuts` que es **quien lleva el `data-pid` y el `[hidden]`**: así los dos leen el mismo
  paciente y no pueden quedar desincronizados. El bloque de `responsive.css` que lo pintaba pasa a
  aplicar a los dos, envolviendo en modal angosto.
- **ASISTENCIA = cita `conf` con `date <= hoy`.** Una `conf` **futura no suma**: es una cita
  agendada, y en la tabla se lee "Agendada". El motivo es `checkAutoNoas` (`agenda.js:95-106`), que
  pasa a `noas` toda `pend` vencida — así que una `conf` ya pasada es, **por construcción**, una
  cita atendida. Es la misma lectura que hace Seguimiento ("cita pasada = conf con fecha ≤ hoy").
  Hay test: la `conf` futura no entra en el contador y la de **hoy** sí.
- **Frontera de episodio ESTRICTA (`desde < date <= hasta`)** — la misma de `doneActual`,
  `citasNumerables` y del recorte de los informes: la cita con la fecha **exacta** del marcador
  pertenece al episodio que **cierra**, no al que abre (por eso `guardarNuevoEpisodio` fecha el
  marcador el día **anterior** a la cita que abre el episodio nuevo). Testeada con una cita en la
  fecha exacta del corte.
- **El ordinal se unificó con un test, no con un refactor.** `ordinalesHistorial` numera **por
  episodio** (reinicia en cada uno, la `no asistió` no consume número, `n` = plan de *ese*
  episodio). `citasNumerables` / `citaOrdinal` / `ordinalesDeCitas` **no se tocaron**: están en
  producción y la agenda depende de ellas. Lo que las ata es un **test de invariante** que exige
  que, para el episodio **actual**, `ordinalesHistorial(...).get(cita).x` coincida exactamente con
  `ordinalesDeCitas(...).get(cita).x`, con `noas` intercaladas —que es donde las dos numeraciones
  podrían separarse— y verificando además que la agenda **no** numera los episodios cerrados y el
  historial **sí**.
- **`parseFinNote` (`utils.js`) — fuente única de la nota del marcador.** El formato
  `"Episodio anterior: <diag> · <N> sesiones completadas"` se parseaba **a mano en dos lugares** de
  `informes.js` (`:506` con separador `' · '` y `:538` con `' ·'`), que es exactamente lo que se
  rompe solo cuando cambia el formato. Ahora hay una definición, con fallbacks
  (`'Tratamiento anterior'`, `null`) y tests. **Deuda:** migrar `informes.js:506` y `:538` a ella.
- **`js/patient-combo.js` — el combobox de paciente es ahora una fábrica.** `crearComboPaciente`
  copia fiel el comportamiento de `informes.js:412-490` (lista ordenada, tope de 50, ↑/↓/Enter/Esc,
  cierre al click afuera, selección por `mousedown` para ganarle al blur) pero **sin ids fijos ni
  estado de módulo**: cada combo se lleva el suyo en el closure, así que pueden convivir dos en la
  misma página. **El combobox de `informes.js` no se tocó** (acababa de pasar auditoría).
  **Deuda:** migrarlo a la fábrica y borrar `_rptResults` / `_rptHi` / `filterPatientRptSelect` /
  `rptSearchKeydown`.
- **De paso: opción "1 semana" en el select de recurrencia** (`index.html`, `value="1"`, primera de
  la lista; el default sigue en 4). `getRecDates` **no se tocó**: ya soportaba `semanas=1` —recorre
  los 7 días siguientes a la base y filtra `ds > baseDate`—, lo único que faltaba era la opción.
- **Cálculo puro y separado.** `js/historial-calc.js` (sin DOM, sin `state`) tiene las ocho
  funciones del plan más `estadoHistorial`, y `buildHistorialPrintHtml` es pura (recibe un modelo
  plano). Imprimir reusa **`openPdfWindow`**, ahora exportada de `informes.js` en vez de duplicar
  la mecánica de `window.open`; el CSV usa el patrón de `exportAgendaCSV` (BOM, comillas dobladas,
  `\r\n`, blob). Pantalla, impresión y CSV consumen **el mismo modelo**: no pueden discrepar.

### ⚠️ Decisión — la `conf` futura ("Agendada") cae dentro del pill "Pendiente"

La tabla muestra **cinco** textos de estado (Asistió / No asistió / Pendiente / **Agendada** para
la `conf` futura) pero los pills de filtro son **cuatro** (Todas / Asistió / No asistió /
Pendiente). Si "Pendiente" filtrara solo `status === 'pend'`, las "Agendada" quedarían **sin
ningún pill que las muestre**. Por eso `estadoHistorial` las devuelve con la clave `pend`: así los
tres pills son una **partición** de las citas (asistió + no asistió + pendiente = todas) y ninguna
fila queda inalcanzable. Hay un test que asserta esa suma.

---

## 🗓️ Sesión 2026-08-31 (c) — LOTE LOGIN: enlace de recuperación restaurado · cambio de contraseña con sesión activa

Un commit (`f60028d`), revisado en rama `revision-login` (auditoría + pruebas manuales de Jefferson:
enlace visible, recuperación completa por correo, y cambio con sesión activa incluyendo el rechazo
de la contraseña actual incorrecta **sin perder la sesión**) y mergeado a `main` en fast-forward.
Tests: **183 verdes** (+6 en `test/password.test.js`). Vercel verde por hashes: los **9** assets
servidos por rehactivaec.com son byte a byte idénticos al `dist/` local (`index-CK7HtLn4.js`
`8E3E7142…0D0D`, `index-kkG_r4Km.css` `917284D2…2DFB`, más los 5 estáticos y los 2 chunks lazy).
Rama `revision-login` borrada del remoto.

- **El enlace de recuperación estaba perdido, no la función.** `#ls-forgot`, `showForgotPassword()`,
  `doSendRecoveryEmail()` y `doSetNewPassword()` ya existían completos y expuestos en `window`: lo
  que se cayó en el rediseño del login fue el **único elemento que los abre**. Vuelve como
  `.login-link` debajo del error de `#ls-login` ("¿Olvidaste tu contraseña?"). La recuperación
  llevaba desde el rediseño inalcanzable desde la UI.
- **Cambio de contraseña con sesión activa** (🔑 en el pie del sidebar, junto a "Cerrar sesión") →
  `#password-modal`. El primer campo es la contraseña **actual** y es obligatorio: antes de tocar
  `updateUser` se **reautentica** con `signInWithPassword({email de la sesión, actual})`, y si eso
  falla no se llama a `updateUser`. Motivo: `supa.auth.updateUser()` **no pide la contraseña
  vigente**, así que en la PC compartida de recepción cualquiera que encontrara la sesión abierta se
  apropiaba de la cuenta. El email sale de `state.currentUserProfile` (lo llena `loadProfile()`
  desde `supa.auth.getUser()`), nunca de un input.
- **Validación compartida.** La regla de contraseña nueva estaba pegada a `doSetNewPassword`: se
  extrae a `validarPassNueva()` / `PASS_MIN_LEN` en `utils.js` — pura y testeable, que es
  justamente por qué no vive en `auth.js` (arrastra el cliente de Supabase) — y la usan los dos
  caminos. El mínimo se unifica **6 → 8** (el camino de recuperación pedía 6); no invalida
  contraseñas existentes, solo aplica a las nuevas.
- `.login-link` pasa a `min-height:42px` con centrado flex: son los tres enlaces del login
  (recuperar, volver, cancelar) y 12px de texto no era un objetivo táctil alcanzable.

**Deuda que deja este lote:**
- **(a) El error de red se disfraza de contraseña incorrecta.** Si `signInWithPassword` de la
  reautenticación falla por conexión (no por credenciales), el modal igual muestra "La contraseña
  actual no es correcta". Distinguir el fallo de red del rechazo real.
- **(b) SMTP por defecto de Supabase.** Límite de envío bajo (sirve para pruebas, no para el
  centro) y plantilla del correo de recuperación **en inglés y sin marca**. Pendiente: SMTP propio
  del dominio + plantilla en español con el logo de Rehactiva.
- **(c) Al migrar a `app.rehactivaec.com` hay que agregar esa URL a *Redirect URLs*** en el
  dashboard de Supabase, o la recuperación se rompe: `doSendRecoveryEmail` arma el `redirectTo` en
  runtime con `window.location.origin + window.location.pathname` (`auth.js`), sin constante ni
  variable de entorno — hoy resuelve a `https://rehactivaec.com/`.

---

## 🗓️ Sesión 2026-09-01 (b) — LOTE INFORMES: rangos correctos en la IA + rescate de mensual y anual

Un commit (**`a4a861a`**), revisado en la rama `revision-informes` (auditoría OK) y mergeado a
`main` en fast-forward; la rama de revisión se borró local y remota. Tests: **253 verdes**
(+29 en `test/informes-rango.test.js`). Sin SQL, sin cambios de esquema.

**El bug de fondo.** Los tres botones "Análisis con IA" de Informes pasaban por `genSemanalAI`,
que contaba `state.appointments` **entero** —todo el histórico de la clínica— y se lo mandaba al
modelo rotulado como *"estos datos de la semana"*. El mensual y el anual, además, escribían la
respuesta en `#insights`, que vive dentro del sub-tab semanal: desde mensual o anual el análisis
se generaba, se cobraba el token y no se veía nunca.

- **`ia.js`**: `genSemanalAI` / `genMensualAI` / `genAnualAI`, una por sub-tab, cada una con su
  rango, su prompt y su destino (`#semanal-ai-output` / `#mensual-ai-output` / `#anual-ai-output`,
  hermanos del contenedor que se re-renderiza, así que cambiar de semana o de mes no borra el
  análisis). `genInformeAI()` despacha según la sub-pestaña visible (`state.informesSubTab`).
- **`utils.js`**: `semanaRango` / `citasEnFechas` / `citasEnPrefijo` / `nuevosEnPrefijo` /
  `resumenCitas` como **fuente única de rangos y conteos**, puras y testeables. `semanaVisible()`
  y `_apptStats()` de `informes.js` delegan en ellas: la pantalla y el prompt calculan
  conf/noas/continuidad con la misma fórmula **por construcción**, no por coincidencia.
  `MES_LARGO`/`MES_CORTO` subieron a `utils.js` (ya los usaban dos módulos).
- **Mensual y Anual reabiertos.** Estaban con `display:none` desde **`82952b3`** (el rediseño de
  UI), no por código roto: el render estaba completo y se verificó en el navegador con datos
  sembrados (KPIs, selector de meses, pacientes por doctor y ambos charts, 0 errores de consola).
  Las flechas ‹ › de semana se ocultan fuera del sub-tab semanal.

### ⚠️ Decisión consciente — "Exportar PDF" del informe de paciente queda SIN gate de permisos

Cierra el pulido remanente del botón huérfano (ver arriba). El botón vivía en el header de
**Informes** —pestaña admin-only *y* con `data-permission="admin"`— pero `exportarPDF()` opera
sobre `_rptCtx`, que solo construye `renderPatientReport()`: desde esa pestaña siempre tiraba el
toast "Abrí primero el informe de un paciente". Se **movió** a la tarjeta "Documento" del informe
de paciente, junto a "Exportar Word" (ocultarlo no era opción: era el **único** punto de entrada
de `exportarPDF()` en toda la app, esconderlo borraba la única forma de exportar en PDF el informe
vivo).

**Efecto colateral aceptado:** al moverlo, **secretaria y terapeuta también pueden exportar el
PDF**. Es **deliberado — decisión de Jefferson**, por paridad con "Exportar Word", que ya estaba
sin gate y saca **los mismos datos**, en una pantalla que esos dos roles ya ven completa. Hay un
comentario junto al botón en `informes.js` para que nadie le ponga `data-permission` después
creyendo que se coló por descuido.

---

## 🗓️ Sesión 2026-09-01 — LOTE FOTO DE AGENDA: PNG para compartir por WhatsApp

Un commit (**`24a3b6e`**), revisado en la rama `revision-foto` (auditoría OK) y mergeado a `main`
en fast-forward. Tests: **225 verdes** (+16 en `test/foto.test.js`). `npm audit` **sin cambios**:
html-to-image no tiene dependencias, así que las 4 vulnerabilidades siguen siendo las mismas de
antes (nanoid/postcss de vite·docx, uuid de exceljs).

Vercel verde **por hashes**: los **12** archivos servidos por rehactivaec.com son byte a byte
idénticos al `dist/` local (`index-GXH4fmCd.js` `C2C9E987…890F`, `index-whLoBmtt.css`
`4BBE9018…B347`, `index.html` `7AB0D4B7…976D` tras quitar los CR sueltos de la copia local, los 5
estáticos y los 4 chunks lazy — entre ellos `es-3XpW1dxY.js` `02B83D31…6E0D`, que es html-to-image).
Confirmado en el **bundle servido**: `"Exportar foto"`, `"Generando la foto"`, `"no entran en la
grilla"`, `"Compartir cancelado"`, `"muy grande para imagen"` y `"Agenda Rehactiva"` en el JS;
`cambiarFormatoExport` y `xl-fmt-foto` en el HTML. El chunk de html-to-image entra por
`import('./es-3XpW1dxY.js')`, sirve **HTTP 200 (13 kB)** con la firma `foreignObject` adentro, y el
HTML de entrada **no lo menciona**: la carga sigue siendo diferida.
**Prueba negativa OK:** el `title="Todavía no disponible"` del botón Foto —que en el lote anterior
era un hueco deshabilitado— **ya no está** en el HTML servido, y el `<button id="xl-fmt-foto">`
llega **sin `disabled`**. Rama `revision-foto` borrada del remoto.

La revisión pidió y se aplicaron **dos correcciones antes del merge** (amend sobre `2fec981`): las
citas sobrantes ya no se pierden y la columna N° volvió (las dos, abajo).

**Lo que entrega.** Segunda salida del mismo motor de export: el modal «Exportar» de la agenda
ahora tiene un segmentado **Excel (.xlsx) / Foto (PNG)**. La foto genera **una imagen por día** y
la manda por `navigator.share`, que abre la hoja del sistema — el camino corto al grupo de
WhatsApp del equipo. Caso de uso real: un `.xlsx` no se abre desde el teléfono, una imagen se ve
en la conversación.

**Cero lógica duplicada, que era el punto del lote.** Los datos salen de `datosExport()` y el
mapeo cita → (fila, bloque) de `planificarDia()` — los mismos que produce el `.xlsx`. Para que la
dependencia fuera en UNA dirección (`foto.js` → datos, y no `excel.js` ↔ `foto.js`), `datosExport()`
se movió de `js/excel.js` a **`js/export-datos.js`**. `js/foto.js` solo decide cómo se DIBUJA.

**Cuatro diferencias deliberadas con el `.xlsx`** — el Excel es archivo de trabajo, la foto se mira
en un teléfono:
1. **Una imagen por día, no una tira apilada.** Una semana en un solo PNG da una imagen larguísima
   que WhatsApp recomprime hasta volverla ilegible. Los días **sin citas se omiten** (una semana
   con 3 días ocupados manda 3 imágenes, no 7) y el modal lo dice antes de generar.
2. **Solo los terapeutas CON citas ese día tienen columna.** En el Excel están todos siempre (es la
   plantilla); en una foto, una columna vacía son ~330 px de ancho tirados.
3. **El título lleva tilde** («MIÉRCOLES 05 DE AGOSTO DEL 2026»). El Excel replica el histórico, que
   las escribe sin tilde; una imagen nueva no tiene por qué heredar esa errata.
4. **La grilla NO tiene el límite de papel de la plantilla.** La hoja de Excel tiene 13 filas y
   punto, así que una cita que no entra se reporta como sobrante; una imagen se estira, así que se
   dibuja igual (ver abajo).

Lo demás sí imita la plantilla: bloque por terapeuta con **su color de la app** (paleta histórica de
fallback), las 13 filas de 07:00 a 19:00, las mismas cuatro columnas **HORA | PACIENTE | N° |
LUGAR**, la hora real en la celda de su hora truncada (12:30 en la fila de las 12), **'por confirmar'
en FFC000 y sin N° ni LUGAR**, **'no asistió' tachado**, canceladas fuera. Lleva el logo, un
subtítulo con el conteo y una leyenda al pie (ámbar / tachado / N° / C-D).

**Rango: día o semana.** «Mes completo» queda **deshabilitado** con `title="muy grande para imagen"`
cuando el formato es foto, y si estaba elegido baja solo a «Semana» avisando por toast. El tope real
es `MAX_DIAS_FOTO = 7`, así que un rango personalizado más largo apaga el botón con el motivo escrito
en la nota, en vez de dejar que se toque y contestar con un error.

**Compartir.** `navigator.canShare({files})` → `navigator.share` con los PNG. Tres caídas cubiertas,
verificadas una por una en Chromium con `navigator` falseado:
`AbortError` (el usuario cerró la hoja) **no es un fallo**; `NotAllowedError` — el gesto del usuario
caduca (~5 s en Safari) y si el render tardó, `share()` lo rechaza — **cae a descarga**; y un
navegador sin compartir archivos (escritorio) descarga directo, espaciando los clicks 350 ms porque
Chrome bloquea las descargas múltiples disparadas en la misma vuelta del event loop.

**Peso.** `html-to-image` va por import dinámico como exceljs y docx, y es chico: chunk propio de
**12.85 kB (gzip 5.10 kB)** — sale como `es-*.js` porque su entrada `module` es `es/index.js`. El
bundle principal pasa de 450.31 kB a **458.91 kB** (gzip 141.82 → 144.29): +8.6 kB de `foto.js` +
`export-datos.js`. Una foto de un día con 6 terapeutas: **4174 × 1066 px, 374 kB** (creció respecto
de los 3694 px de la primera versión: es la columna N° restaurada, ~40 px por bloque).

**Por qué 2×.** WhatsApp recomprime lo que se le manda a ~1600 px de lado largo. Renderizando a 2×,
el layout lógico es de 2087 px, así que después de esa recompresión la imagen llega **cerca de 1:1
con lo que se ve en pantalla**. A 1× llegaría a la mitad.

**Las citas sobrantes ya no se pierden (lo pidió la auditoría, y era bloqueante).** La primera
versión de `bloquesDeFoto()` ignoraba `b.sobrantes` de `planificarDia()`: con 15 citas de media hora,
un terapeuta salía en la foto con 13 pacientes **y ningún aviso**. El `.xlsx` no puede hacer más que
reportarlas por toast —la hoja tiene esas 13 filas y la suma de la fila 20 depende de eso— pero una
imagen se estira. Ahora las sobrantes se dibujan al pie del bloque, ordenadas por hora entre ellas y
con su hora real en la celda HORA, la tabla crece a `max(13, filas del bloque más largo)`, los
bloques que no desbordaron dejan esas filas en blanco (sin hora inventada) y la leyenda lo explica.
Perder pacientes en silencio en la foto que se manda al grupo es peor que una imagen más larga.
Fijado con cuatro tests, incluido el caso exacto: **15 citas → 15 pacientes en el HTML, 0 perdidas**.

**Un bug real, encontrado renderizando de verdad y no leyendo el código.** El font stack era
`Arial, Helvetica, "Liberation Sans", sans-serif`, y esos estilos van **en línea** dentro de
`style="…"`: las comillas dobles cerraban el atributo ahí mismo. html-to-image serializa el nodo
dentro de un `<foreignObject>`, que **sí se parsea como XML estricto**, y el render entero fallaba
con un `Event` pelado y sin mensaje (`Specification mandates value for attribute sans`). No era un
caso borde: **fallaba todo export**. Ahora la familia va sin comillas. Segundo hallazgo del mismo
camino: `cacheBust: true` le agrega `?t=…` a cada imagen y sobre el **data URI del logo** eso lo
rompe — va desactivado, y acá no hay nada que cachear porque el logo va embebido.

**Verificación.** `test/foto.test.js` fija el render sobre el HTML (que es puro): hora no en punto,
'por confirmar' con ámbar y sin N° ni lugar, 'no asistió' tachado, los dos juntos, las cuatro
columnas, el desborde (15 citas → 15 pacientes), escapado del nombre del paciente, y que los bloques
salgan del mismo `planificarDia()`. Y en **Chromium con Playwright**, con
`state` sembrado por imports dinámicos (no hay usuario de prueba con contraseña): render real del PNG,
día y semana, un día con desborde de verdad (15 citas en un solo terapeuta), las notas del modal, el
segmentado, «Mes» deshabilitado y las cuatro ramas de compartir. Cero errores de consola.

**Lo que NO se verificó:** **Android y iPhone reales**. No hay dispositivos en el entorno de CC, y
`navigator.share` con archivos es justo lo que no se puede emular — en headless no existe la hoja del
sistema. Lo que sí está probado es la lógica de decisión (las cuatro ramas) y que el `File` que se le
pasa a `share()` es un PNG válido con su nombre y tamaño. **La prueba en los dos teléfonos queda
pendiente y es la que puede tumbar el flujo**: el riesgo concreto es iOS Safari rechazando `share()`
por gesto vencido si el render tarda — está cubierto con la caída a descarga, pero hay que verlo.
**Sigue abierta al cerrar esta entrada**: la feature está en producción sin que nadie haya
compartido todavía una foto desde un teléfono. Es lo único del lote sin verificación propia.

---

## 🗓️ Sesión 2026-08-31 (e) — LOTE EXPORT EXCEL: motor por rango con réplica de la plantilla histórica

Un commit (**`95eaea5`**), revisado en la rama `revision-excel` (auditoría OK) y mergeado a `main`
en fast-forward. Tests: **209 verdes** (+26 en `test/excel.test.js`). Vercel verde **por hashes**:
los **11** archivos servidos por rehactivaec.com son byte a byte idénticos al `dist/` local
(`index-C1YK_qv7.js` `AF1DF82A…E321`, `index-whLoBmtt.css` `4BBE9018…B347`, `index.html`
`FFCBE0E3…B03F` tras normalizar los CR sueltos de la copia local, los 5 estáticos y los 3 chunks
lazy — entre ellos `exceljs.min-UTGBYhkj.js` `C1C17C92…1A17`). Confirmado además en el **bundle
servido**: `"Generando el Excel"`, `"Aptos Narrow"` y `"agenda_"` en el JS, `"Exportar agenda"`,
`"xl-preset"` y `"admin-secretaria"` en el HTML, y el `import('./exceljs.min-UTGBYhkj.js')` **como
import dinámico** — el HTML de entrada no menciona exceljs, así que la carga sigue siendo diferida.
**Prueba negativa: no aplica** — el lote solo agrega, no reemplazó ningún string, así que no hay
texto viejo que deba haber desaparecido (control: `"+ Nueva cita"` sigue presente e intacto).
Rama `revision-excel` borrada del remoto.

La revisión pidió y se aplicaron **dos correcciones antes del merge** (amend sobre `d143db8`):
el relleno ámbar de 'por confirmar' **no alcanza la 5ª columna** (ver abajo) y el botón «Exportar»
va con `data-permission`.

**Lo que entrega.** `generarExcel({desde, hasta, terapeutaIds})` (`js/excel.js`) emite **una hoja por
día calendario** del rango — sábados y domingos incluidos, que en el archivo histórico traen citas
reales. Día, semana, mes y rango libre son el mismo camino con distinto rango: no hay tres motores.
Se llega desde el botón **«Exportar»** de la cabecera de la agenda (visible en las tres vistas), que
abre `#export-modal` precargado con el rango de la vista activa y con el filtro de terapeuta que ya
estuviera puesto en la agenda. El botón va con `data-permission="admin-secretaria"`: exportar la
agenda del centro es tarea de recepción, no del terapeuta (el mismo criterio con el que se cierran
«+ Nueva cita» y «Exportar PDF», este último aún más estricto — solo `admin`).

**La plantilla no se dedujo del handoff: se leyó del archivo.** `~/Downloads/2026-08.xlsx` se
descomprimió como zip y se leyeron `xl/worksheets/sheetN.xml` + `styles.xml` + `workbook.xml`
(mismo método con el que `word.js` portó `VERSION-FINAL.docx`). De ahí salen, verificadas contra el
XML y no a ojo:

- **Geometría.** Física: nombres fila 5, headers 6, horas 7–19 (07:00–19:00), sumas 20.
  Respiratoria: 22 / 23 / 24–36 / 37. Bloque de terapeuta = **5 columnas** (`HORA | PACIENTE | N° |
  LUGAR | vacía`), nombre mergeado `A5:E5`, `F5:J5`… Anchos 7.57 / 25.57 / 7.57 / 7.57 / 7.57;
  altos de fila 60 / 21 / 34.5 / 26.45 / 26.65 / 18.75. Fuente **Aptos Narrow** 11 datos, 10 bold
  headers, 16 bold título, 26 bold G4/L4, 14 bold totales. Bordes finos. Logo de Rehactiva en las
  filas 1–2 (reusa `LOGO_DATA_URI` de `pdf-logo.js`, una sola copia para todas las hojas).
- **Fórmulas, idénticas celda por celda.** `E20 =SUM(E7:E19)` por bloque y `AK20
  =+E20+J20+O20+T20+Y20+AD20+AI20`; `E37 =SUM(E24:E36)` y su gran total; resumen `E41 =+C41+D41`,
  `E48 =SUM(E41:E47)`, `E49 =+AK20`. Todas cachean `0`, igual que el original (la 5ª columna está
  vacía). El gran total del día queda **una columna después** del último bloque (con 7 bloques, en
  `AK`, dejando `AJ` de aire) — así está en el archivo, y así se replicó.
- **Celda de cita.** `PACIENTE` = nombre en mayúsculas, `N°` = el **mismo ordinal del episodio** que
  pinta el badge «X/N» de la agenda (`ordinalesDeCitas()`, un solo mapa por export), `LUGAR` = C/D.
  Estados: `pend` («por confirmar») → relleno `FFC000` **con N° y LUGAR vacíos**; `noas` → nombre
  **tachado**; cualquier estado fuera de `conf|pend|noas` (las canceladas) **no se exporta**.
  El ámbar **no baña la fila**: lo llevan solo PACIENTE, N° y LUGAR — HORA y la 5ª columna quedan
  limpias, como en el original (en MIERCOLES 5, las citas por confirmar de `L7` y `Q17` dejan `O7`
  y `T17` con el estilo neutro `xf24`, `patternType="none"`). La regla vive en `excel-layout.js`
  (`llevaRellenoPend`) para poder fijarla con un test sin levantar exceljs.
- **Hora como valor de tiempo real**, no como texto: fracción de día con `numFmt 'h:mm'`. Una cita
  que no cae en punto va en la fila de su **hora truncada** mostrando la hora real — literalmente el
  caso `A12='12:30:00'` del archivo viejo.
- **Colores.** Manda el color que el terapeuta tiene en la app (`COLOR_OPTIONS.bg`); la paleta
  histórica (`DAF2D0, CAEDFB, F2CEEF, D0D0D0, C0E6F5, FBE2D5, C1F0C8`) queda de fallback por posición.
- **Nombres de archivo.** Mes completo → `{YYYY}-{MM}.xlsx`, **idéntico al histórico**, para que caiga
  en la misma carpeta sin renombrar. Día → `agenda_{YYYY-MM-DD}.xlsx`; rango → `agenda_{desde}_a_{hasta}.xlsx`;
  con filtro, sufijo `_{terapeuta-en-slug}`.

**Dos casos que el original nunca tuvo que resolver** (la planilla se llenaba a mano; la app no):
dos citas dentro de la misma hora (07:00 y 07:30 con el mismo terapeuta) compiten por una sola fila
→ la segunda **baja a la primera libre** y su celda HORA sigue diciendo la hora real; y una cita
fuera de 07:00–19:59 se **ancla a la fila extrema** en vez de perderse. Si un terapeuta supera las
13 filas de un día, lo que no entra se cuenta y se avisa por toast: **nunca se descarta en silencio**.

**La única desviación deliberada del "idéntico".** En el histórico `J49` apuntaba a `AK36` — una
fila **más arriba** del gran total respiratorio, que vive en `AK37` — y por eso mostraba 0 siempre.
Acá apunta al gran total de verdad. Todo lo demás replica el original, incluidos sus defectos de
forma (`'HORA '` y `'N° '` con el espacio final, `G4`/`L4` vacías).

**Brecha conocida, documentada a propósito:** las franjas **ALMUERZO** y **CAPACITACION** del
archivo original **no se replican** — la app todavía no modela bloqueos ni almuerzo. Salen con el
lote «BLOQUEOS/RESERVADO» de la cola; hasta entonces esas franjas quedan como filas de hora vacías.
Tampoco se llenan `G4`/`L4` (el correlativo tipo `26031`): siguen siendo la pregunta (c) abierta de
Jefferson, así que van con formato listo y valor vacío para llenado manual. Igual que la 5ª columna
de cada bloque (pregunta (a)).

**Arquitectura.** La geometría vive en `js/excel-layout.js`, **puro y sin dependencias** (ni exceljs,
ni DOM, ni `state`): es lo que testea `test/excel.test.js` con `node --test`, cubriendo el mapeo
cita → (hoja, fila, bloque) — hora no en punto, colisión de hora, fuera de rango, fin de semana,
filtro por terapeuta, nombres de archivo y qué columnas reciben el ámbar de 'por confirmar'.
`js/excel.js` es el pintado + la UI.

**Peso.** `exceljs` va por **import dinámico** (patrón `word.js`): sale en su propio chunk de
**929.89 kB (gzip 256.47 kB)** y **no entra al bundle inicial** — solo lo baja quien exporta. El
bundle principal pasa de 437.23 kB a 450.31 kB (gzip 136.76 → 141.82 kB): +13 kB de código propio.
Un mes completo (31 hojas) sale en ~1 s y pesa ~200 kB.

**`npm audit`: 4 vulnerabilidades, 2 de ellas nuevas por este lote — leerlas antes de aprobar.**
`nanoid` y `postcss` (2 high) vienen de `vite`/`docx` y son **anteriores** a este lote (advisories
publicados después del `npm audit fix` de julio); `uuid@8.3.2` (1 moderate, GHSA-w5hq-g745-h8pq,
*missing buffer bounds check* en v3/v5/v6 cuando se pasa `buf`) **lo trae exceljs** y su único fix
es bajar a `exceljs@3.4.0`, que es breaking. La ruta vulnerable **no se alcanza**: exceljs solo usa
`uuid` v4 y nunca pasa `buf`. Queda como deuda declarada, no como algo silenciado.

**Lo que NO se verificó en esta máquina:** abrir el `.xlsx` en **Excel real** y en **Google Sheets**.
No hay ninguno de los dos en el entorno de CC. Lo que sí se hizo: descomprimir el archivo generado y
comparar su XML contra el del histórico celda por celda (fórmulas, fills, fuentes, merges, anchos,
altos, `numFmt`) y releerlo con exceljs. La prueba de apertura queda para Jefferson, con dos archivos
de muestra generados por el mismo motor. **Sigue abierta al cerrar esta entrada**: la feature está en
producción sin que nadie haya abierto todavía un `.xlsx` real en Excel ni en Sheets. Es lo único del
lote que no tiene verificación propia; si algo falla ahí, se sabrá al primer export de la secretaria.

---

## 🗓️ Sesión 2026-08-31 (d) — LOTE LEGIBILIDAD AGENDA: horas y separadores más oscuros (pedido de recepción)

Un commit (`19a7510`), solo CSS, mergeado a `main` en fast-forward. Pedido explícito de la
secretaria: la vista diaria de la agenda se leía muy clara — franjas horarias grises y bordes casi
invisibles. Tests: **183 verdes** (no tocan CSS, se corrieron igual como red de seguridad). Vercel
verde por hashes: los **10** archivos servidos por rehactivaec.com son byte a byte idénticos al
`dist/` local (`index-DoeomwX7.js` `8E3E7142…0D0D`, `index-ChE2OwKO.css` `C9B3D3B3…FA3DE`, `index.html`
`2742F58B…4577` tras normalizar CRLF→LF de la copia local, más los 5 estáticos y los 2 chunks lazy).
Verificado además que el CSS minificado servido lleva el valor nuevo: `rgba(0,0,0,.12)` sale como
`#0000001f` (0.12×255≈31=0x1F) en `.time-cell` y `.slot`, y el gris viejo de las medias horas
(`#b0ada8`) no aparece en ningún archivo servido. Rama `revision-agenda` borrada (local y remoto).

- **4 selectores tocados en `css/screens.css`:** `.th-sp` (nombre de terapeuta en la cabecera),
  `.time-cell` y `.time-cell.half-hour` (columna de horas), `.slot` (celdas de la grilla) — todos a
  `color:var(--rh-ink)` y bordes de `rgba(0,0,0,.05)/.04` a `rgba(0,0,0,.12)`. Las medias horas
  quedan **igual de negras** que las horas en punto (antes `#b0ada8` más claro) — así lo pidió
  recepción explícitamente, no es un descuido de contraste. `.th-header.wk-today .th-sp` (el azul del
  día actual resaltado) no se tocó.
- **El cambio también alcanza la vista Semana**, aunque el pedido fue sobre la vista Día: son los
  mismos selectores (`.th-sp`, `.time-cell`, `.slot`) compartidos entre ambas vistas, no hay CSS
  duplicado por vista.
- **La aceptación final la da la secretaria** en su propia pantalla — el pedido nació de una
  observación suya de uso diario, no de una revisión de diseño; los hashes confirman que el CSS
  correcto está en producción, pero el criterio de "ya se lee bien" es de ella.

---

## 🗓️ Sesión 2026-08-31 (b) — Tipo de sesión (Fisioterapia / Terapia respiratoria) heredado · especialidad de terapeuta

Un commit (`40880fa`), revisado en rama `revision-tipo` y pusheado a `main` con el OK de la
auditoría. Tests: **177 verdes** (+21 nuevos en `test/tipo-sesion.test.js`). Vercel verde por
hashes: `assets/index-Ba8FvHMP.js` y `assets/index-DNWycmKp.css` servidos por rehactivaec.com son
byte a byte idénticos al `dist/` local (SHA-256 `997DDF32…F607` y `02DA1DFB…0F1B`), y el bundle
servido contiene `"Terapia respiratoria"` y el HTML el campo `"Descripción"` (`#th-specialty`),
sin rastro de los tipos viejos (`Kinesioterapia`, `Electroterapia`). Ramas de revisión borradas del
remoto: `revision-tipo`, `revision-frontera` y `revision-word` (las dos últimas ya mergeadas).

- **El centro presta dos servicios y la agenda ahora lo dice.** `#m-type` queda con `Fisioterapia`
  (default) y `Terapia respiratoria`, espejo exacto del CHECK de `appointments.type`. Las técnicas
  concretas (kinesioterapia, electroterapia, masoterapia…) siguen siendo **tags de la sesión**, no
  tipos de cita — por eso salen del select.
- **La sesión registrada hereda `appt.type`** en vez de fijar `'Fisioterapia'` a mano. El flujo
  manual (carga retroactiva, sin cita) cae al default. Los marcadores `Evaluación inicial` y
  `Fin de episodio` no se tocan: en modo edición el tipo **no** se normaliza contra el catálogo,
  justo para no pisarlos — pisarlos rompería `doneActual` y el recorte de episodio.
- **Catálogo único en `utils.js`** (`TIPOS_SESION` / `tipoSesion()` / `ESPECIALIDADES` /
  `especialidad()`): nada se deduce del nombre del terapeuta ni de su texto libre. `tipoSesion()`
  normaliza lo que venga de la DB o del DOM, así que una cita vieja sin tipo no escribe `''` en el
  historial.
- **Admin de terapeutas:** select `Especialidad` (Física / Respiratoria) → `therapists.specialty`;
  el texto libre de siempre se relabela a **"Descripción"** para no tener dos campos con el mismo
  nombre. El buscador del listado también matchea por especialidad.
- **`mapTherapistRow()` unifica el mapeo duplicado** entre la carga inicial (`auth.js`) y el
  realtime (`realtime.js`), que eran la misma línea copiada palabra por palabra — sin esto
  `specialty` habría llegado distinta según el camino. De paso **se va un `TypeError` latente**: el
  mapeo viejo hacía `r.name.split(' ').map(n=>n[0])` sin guarda, así que un `therapists.name` en
  `NULL` reventaba la carga entera del equipo (y un nombre con doble espacio metía `"undefined"` en
  las iniciales); ahora es `String(r.name||'').split(' ').map(n=>n[0]||'')`. Mismo caso en el filtro
  del listado, que llamaba `t.spec.toLowerCase()` directo.
- **Agenda:** el subtítulo de la tarjeta lleva `title` para leer `Terapia respiratoria` entero
  (ya truncaba con ellipsis; el `title` va en el div porque la card usa el suyo para el médico
  referente). "Nueva cita" resetea el tipo al default: sin eso el select se quedaba con el de la
  última cita editada y una respiratoria se propagaba sola.
- **Resumen del día:** desglose "X fisio · Y resp" junto al contador de citas de cada bloque. Solo
  aparece cuando hay alguna respiratoria — en un día 100% fisio repetiría el número de al lado.

---

## 🗓️ Sesión 2026-08-31 — Firmante como select cerrado · `limpiarParte()` compartida · merge `revision-word` → `main`

Un commit (`c6b714d`) + merge fast-forward de `revision-word` a `main` (`dd98984..c6b714d`, 13
commits, sin conflicto — nunca fueron ramas divergentes: todo el trabajo se hizo directo sobre
`main` local y se pusheó a `revision-word` con refspec explícito commit a commit). Pusheado a
`origin/main`. Tests: **156 verdes** (sin cambios — `word.js`/`informes.js` son renderers, no
lógica pura testeable con `node --test`).

- **`0d9639b` fix(informes,word): firmante como select cerrado.** `#fw-nombre` era un `<input>`
  con `<datalist id="firmante-list">`: sugiere, pero acepta texto libre — probado en producción con
  "ssss", lo aceptó como firmante de un documento clínico. Pasa a `<select>` cerrado, poblado en
  `abrirFirmanteModal()` (`informes.js`) con `orderedTherapists()`, mismo patrón que el resto de
  selects de terapeuta de la app. El precargado (firmante anterior o terapeuta único del episodio)
  solo se aplica si sigue existiendo en la lista; si no, queda el placeholder en vez de forzar un
  valor inválido. `<datalist id="firmante-list">` eliminada del HTML.
- **`0d9639b` fix(word): `":"` huérfano en Evaluación inicial.** Reportado en la prueba real: la
  caja salía con `": Inversión forzada del tobillo derecho…"`. Defecto viejo (datos históricos de
  `session_log` con un formato de nota anterior al `saveEvalInicial()` actual), no del rediseño.
- **`c6b714d` fix(informes): el mismo `limpiarParte()` en pantalla y PDF.** El fix anterior solo
  cubría Word; `evalBlockHtml` (pantalla) y `buildPdfHtml` (PDF) tenían el mismo patrón sin limpiar.
  `limpiarParte()` se mueve de `word.js` a `utils.js` (junto a `dmy`/`diagConCie`) para que los tres
  puntos de render usen la misma regla en vez de triplicarla.
- **Auditoría pre-merge (a pedido, antes de tocar `main`):** `git diff --stat origin/main
  origin/revision-word`, `grep -c "Calibri" js/word.js` (3 — las tres son comentarios explicando el
  ajuste Arial-sobre-Calibri, ningún run con la fuente vieja) y confirmación de que
  `index.html:272` (`Exportar PDF`) **no** es ni el botón del informe de paciente ni el del
  histórico de informes guardados (`exportarInformeGuardado`, otro código) — es un tercer botón,
  en el header del tab **semanal**, cuyo handler (`exportarPDF()`) opera sobre el contexto del
  **informe de paciente** (`_rptCtx`). Ver "Pulidos opcionales remanentes" arriba — queda anotado,
  no se toca en este lote.
- **Confirmado, no es bug:** "Narrativa clínica" se omite a propósito en el `.docx` cuando
  `getLastNarrative()` (`ia.js`) no tiene nada generado (arranca en `[]`, solo se llena tras
  "Informe clínico con IA") — es el comportamiento esperado, coincide con lo visto en la prueba real
  sin narrativa generada.

---

## 🗓️ Sesión 2026-08-28 — Migrar `word.js` a la especificación literal de `VERSION-FINAL.docx`

Seis commits en `revision-word` (ver sesión siguiente para el merge a `main`). Tests: **156
verdes** en todos, sin cambios de lógica pura. Verificación real en cada commit: `.docx` generado
vía Playwright contra el dev server (import dinámico de `word.js`, sin login) con datos de prueba
que incluyen a propósito sesiones sin registro y valores EVA extremos, abierto con **Word 16 real
vía COM** (`New-Object -ComObject Word.Application`) — sin diálogo de reparación en ningún commit.

- **`f7f6e2d` / `5afa4f1` — housekeeping previo.** `newdesign/` (referencia de diseño, incl.
  `Informe-Rehactiva-VERSION-FINAL.docx`) commiteada; `~/` (directorio literal creado por un `cp`
  con path Windows sin expandir) agregado al `.gitignore` sin borrar su contenido.
- **`6b02e76` feat(word): migración literal.** `b57c395` (2026-08-24) había portado el rediseño
  **intermedio** del handoff visual; este commit lee `VERSION-FINAL.docx` **como zip**
  (`word/document.xml`, `styles.xml`, `header1.xml`, `footer1.xml` descomprimidos y
  pretty-printeados) y copia tamaños/colores/spacing/bordes/anchos de tabla tal cual — no deducidos
  del HTML ni del PDF. Cambios estructurales: orden gráfico EVA → Evaluación inicial → Narrativa
  clínica → Detalle por sesión; Evaluación inicial pasa a caja sombreada F6F4EF; filete E2DED6 en
  los H2 de sección; subtítulos de narrativa en versalitas 145B6D; CIE-10 en su propia línea bajo
  Diagnóstico (`splitDiagCie` separa el string combinado que ya arma `diagConCie`, sin tocar el
  PDF); orden de campos Edad antes que Cédula; separador "·" en el panel de métricas; página **carta**
  con el `sectPr` real (12240×15840, márgenes 1800/1440/1008/1008, header 720, footer 576) en vez
  de la aproximación A4/0.7in del rediseño intermedio. Una sesión sin NINGÚN dato (ni `pb` ni `pa`)
  ya no corta la serie del gráfico: hereda el último EVA conocido y se muestra con marcador hueco +
  tramo punteado, igual criterio que el "N → —" del detalle por sesión (antes se saltaba del todo,
  también en `buildEvaSvg` del PDF, sin tocar ahí). Dos ajustes deliberados sobre la referencia:
  Arial en vez de Calibri (Calibri se sustituye en Google Docs), y se recuperan las dos líneas de
  referencia D8D2C6 en EVA 3/6 que la `VERSION-FINAL` había quitado. "Zona evaluada" no se inventó:
  `evalInicial.partes` ya trae una entrada `"Zonas: …"` del formulario de evaluación inicial
  (`pacientes.js`), extraída con `extraerZona()`.
- **`95717ad` fix: paginación y gráfico EVA (ronda 1).** Hueco grande al pie de página 1 (la caja
  de Evaluación inicial no cabía y saltaba entera por su `cantSplit`) — gráfico bajado a 1210×300 +
  `cantSplit:false` en esa tabla. Etiquetas del eje X pisadas con 14 sesiones — por encima de ~8
  puntos se muestra una cada N (siempre primera y última), con anchor start/end en los extremos.
  "Detalle por sesión" quedaba huérfano al pie de página — `keepNext` en el estilo H2. Texto de
  sesión sin observación unificado.
- **`4bca075` fix: unificación incompleta.** La sesión con **técnicas mías** (ej. "kinesiotape,
  electroterapia") pero sin nota mostraba la misma frase larga que una sesión sin ningún dato — el
  criterio pasa a ser `s.tecnicas`, no la presencia de EVA: sin técnicas → "Sesión sin observación
  ni técnicas registradas.", con técnicas y sin nota → "Sin observación registrada.".
- **`dce56af` fix: paginación y gráfico EVA (ronda 2).** El fix de la ronda 1 abrió un caso peor:
  "Zona evaluada: …" podía quedar sola arrancando la página 2. `keepNext` en el último párrafo de
  cuerpo de la caja (antes de esa línea) + gráfico bajado otra vez a 1210×260, sin tocar
  `cantSplit:false`. Colchón de 10px en el mapeo de `y` del gráfico para que EVA 0 no quedara pegado
  al borde del área — **matemáticamente correcto pero visualmente inútil** (ver commit siguiente).
- **`bfb1504` fix: el colchón de la ronda 2 no se veía.** Medido en píxeles reales del PNG generado
  (no solo el código, a pedido explícito): el marcador de EVA 0 terminaba a ~10px del borde del
  área, relleno con una tinta al 6% de opacidad — indistinguible de "tocando". Causa: el borde del
  área (`BASE`) se derivaba de `LABEL_Y`, así que cada baja de altura del gráfico por paginación
  (211→150→130) achicaba el colchón con él. Se desacopla en `AREA_FLOOR` (fijo, cerca del piso del
  viewBox, sin relación con `LABEL_Y`) y `CUSHION` sube de 10 a 14px sobre esa base fija. Verificado
  esta vez con captura y zoom del PNG real, no solo cálculo.

---

## 🗓️ Sesión 2026-08-24 (b) — Exportar informe a Word (.docx): spike → producción → rediseño intermedio

Tres commits, en prod. Tests: **156 verdes** (sin cambios de lógica pura).

- **`dbbb9a4` spike(word): validación con `docx` v9.** Primer prototipo (membrete en header,
  tabla con bordes finos, gráfico EVA rasterizado a PNG, márgenes 2.5cm), cargado por **import
  dinámico** (chunk aparte de ~373 KB que no entra al bundle inicial). Verificado con Playwright +
  Word real vía COM. No tocaba nada en producción — botón temporal "Word test", solo admin.
- **`e4ef52b` feat(informes): el spike pasa a producción.** `generarInformeWord` reemplaza el botón
  "Exportar PDF" del informe de paciente por "Exportar Word". Modal de firmante nuevo (`js/informes.js`,
  `abrirFirmanteModal`/`confirmarExportarWord`) — se pide **siempre** antes de exportar, porque
  "Terapeuta" en el encabezado puede ser "Varios" cuando el episodio tuvo más de un terapeuta y la
  firma necesita una persona concreta. `dmy`/`CONFIG_CLINICA`/`buildEvaSvg` movidos a `utils.js`
  para evitar import circular `informes.js`↔`word.js`. El histórico de informes guardados
  (`exportarInformeGuardado`) sigue exportando en PDF, sin tocar.
- **`b57c395` feat(word): rediseño visual "menos líneas, más aire".** Puerto del handoff de diseño
  (`newdesign/…/design_handoff_informe_rehactiva`): Georgia+Arial, paleta tinta/acento, header/footer
  de sección, gráfico EVA propio (sin ejes/grilla/leyenda, con líneas de referencia leve/moderado/
  severo discretas), narrativa clínica IA en su propia sección, detalle por sesión con zebra
  striping. **Reemplazado el 2026-08-28** por la migración a `VERSION-FINAL.docx` (ver sesión de
  arriba) — este era un rediseño intermedio, no la especificación definitiva.

---

## 🗓️ Sesión 2026-08-24 — Episodios: el modal pregunta por la cita que ABRE el episodio nuevo

Un commit (`de0d855`), en prod. Tests: 154 → **156 verdes**.

- **`de0d855` feat(episodios): la pregunta del selector cambia de sentido.** La frontera de episodio
  es estricta (`date > fecha del marcador 'Fin de episodio'`). El modal preguntaba "¿cuál fue la
  ÚLTIMA cita del episodio anterior?", pero el terapeuta piensa "¿con qué cita EMPIEZA el nuevo?" —
  en producción una terapeuta eligió la cita que era la PRIMERA sesión del episodio nuevo, el
  marcador tomó esa misma fecha y la sesión quedó archivada en el episodio viejo (`date == fin` no
  es `> fin`), dejando el nuevo vacío. Ahora el selector pregunta con qué cita **empieza** el
  episodio nuevo y `guardarNuevoEpisodio` fecha el marcador el **día anterior** a la elegida, con un
  hint dinámico bajo el selector ("El episodio anterior se cierra el X. Todo lo registrado desde el
  Y cuenta en el episodio nuevo."). `citasParaCierre`/`indiceCitaCierre` no cambian (el universo de
  5 pasadas + 3 futuras y la preselección siguen siendo correctos bajo la pregunta nueva); solo se
  actualizaron sus comentarios. Marcadores ya existentes en DB: **no se migra nada**, su fecha
  almacenada sigue significando lo mismo — solo cambia cómo se calcula la de los nuevos.

---

## 🗓️ Sesión 2026-08-14 (c) — `Kinesiotape` en el catálogo de técnicas · vacuna de legado

Un commit (`7610565`), en prod con Vercel verde verificado por hash de bundle
(`index-4_VF0M3I.js` / `index-CRJ3JNvN.css`: el build local y el que sirve `rehactivaec.com`
coinciden). Tests: **154 verdes**, sin cambios.

- **`PRO_TECNICAS`** (`js/sesiones.js`): `'Kinesioterapia'` pasa a llamarse **`'Kinesiotape'`**.
  `'Vendaje funcional'` queda como está y `'Presoterapia'` ya venía del lote anterior.
- **No se migran datos.** Las sesiones viejas conservan `'Kinesioterapia'` en `tags`.
- **Vacuna de legado en `renderProTecnicas()`:** por cada técnica de la sesión que ya **no** esté en
  el catálogo, el grid pinta un botón extra atenuado (borde punteado), marcado como seleccionado y
  toggleable. Así lo histórico se **ve** al editar y se puede quitar, en vez de quedar invisible
  y volver a guardarse a ciegas. Su texto viene de la DB, así que va por `esc()`; el parser
  devuelve el valor decodificado en `dataset.tec`, con lo que el toggle sigue casando el string
  exacto de la fila.
- **El `select` de tipo de cita (`m-type`) NO se tocó:** ahí `Kinesioterapia` es un *tipo de
  sesión*, otra cosa. Verificado en prod: el bundle servido tiene `Kinesiotape` y el HTML servido
  sigue teniendo `Kinesioterapia` en `m-type`.

---

## 🗓️ Sesión 2026-08-14 (b) — Ficha del plan en la cita · cierre de episodio con frontera elegida

Un commit, revisado en rama (`revision-plan`, ya borrada) antes de tocar `main`. En prod con Vercel
verde verificado por hash de bundle (`index-G5meI1wk.js` / `index-CRJ3JNvN.css`: el build local y el
que sirve `rehactivaec.com` coinciden; en el JS servido están los strings de la feature, en el CSS
las reglas nuevas y en el HTML la sección del plan y el selector de última cita). Tests: 143 →
**154 verdes**.

- **`05682bd` feat(plan): ficha del plan en la cita y cierre de episodio con frontera elegida.**
  Dos huecos del mismo flujo: el plan de sesiones **se lee y se amplía sin salir de la agenda**, y el
  episodio **se cierra por la cita que realmente lo cerró**, no por la fecha en que uno se acordó de
  registrarlo.

  - **Sección «Plan de sesiones» en el modal de editar cita (`js/plan.js`, módulo nuevo).** Mismo
    patrón que el CIE-10: es dato del **paciente** (`patients.sessions`), no de la cita, así que se
    guarda al instante en su ficha y **sin paciente asignado la sección no aparece**. Muestra "Lleva
    X de N sesiones" con **exactamente lo mismo** que pinta el badge X/N de la agenda —`doneActual`
    (episodio actual, derivado de `session_log`) y `p.sessions`—, sin contadores paralelos. Edición
    rápida de N (input 1-99) **optimista con rollback** y `markLocalChange('patients')`, y acceso
    directo a Nuevo episodio. Doble gate en el write path: el editor se **oculta** sin permiso
    `editPatient` y `planGuardarSesiones` lo vuelve a chequear antes de escribir. Al guardar se
    redibuja la agenda, así que el badge se recalcula en el acto.
  - **Selector "¿cuál fue la última cita del episodio anterior?" en Nuevo episodio.** **El porqué:**
    el marcador `Fin de episodio` se fechaba **siempre HOY**, y como la frontera es estricta
    (`date > fin`), cerrar el lunes un episodio que terminó el jueves pasado metía en el episodio
    viejo todo lo del viernes al lunes. Ahora el marcador toma **la fecha de la cita elegida** y la
    frontera cae donde de verdad estuvo. Se ofrecen las **5 pasadas más recientes y las 3 futuras**
    (hoy cuenta como pasada; futuras porque el cierre se suele registrar con la última cita ya
    agendada), preseleccionada la pasada más reciente, en formato `Lun 12 ago · 9:00 · Marco`. El
    `value` de cada opción es el **índice, no la fecha**: dos citas del mismo día son opciones
    distintas y hay que seleccionar la que el usuario eligió. Sin citas, el marcador va **AYER** —
    con la fecha de hoy, lo que se registre hoy caería en el episodio viejo.
  - **No se tocó ninguna función de conteo.** `doneActual`, `pendientesActual`, `citaOrdinal` y el
    recorte de episodio de los informes siguen igual: la frontera estricta ya hacía todo el trabajo,
    lo único que cambió es **qué fecha se le pasa**. Los helpers nuevos (`citasParaCierre`,
    `indiceCitaCierre`, `fmtFechaCorta`, `diaAnterior`) son puros y viven en `utils.js`.
    `fmtFechaCorta` parsea la fecha **a mano**: `new Date('2026-08-12')` se lee en UTC y en Quito
    (UTC-5) devolvería el día anterior.
  - **Badge X/N en ámbar cuando el ordinal supera el plan** (11/10), en vistas Día y Semana, con el
    tooltip diciéndolo. El plan no bloquea nada; la agenda solo tiene que avisarlo sin obligar a
    abrir la ficha.
  - **Aviso de plan completo** al guardar la sesión que lo cierra, en las dos rutas (`saveSession` y
    `saveSessionManual`). Salta **solo al cruzar** de n−1 a n, no en cada sesión por encima — mismo
    criterio de umbral que `showBillingAlert`, y va **antes** que él porque ese abre un `confirm()`
    bloqueante. No frena nada: seguir atendiendo es decisión del terapeuta.
  - **De arrastre:** el botón "Ver informe del paciente" del modal de cita sale del
    `@media (pointer: coarse)` y **se ve en todos los dispositivos** (verificado en el CSS servido:
    la regla quedó a nivel global) — mirar la historia del paciente que se está agendando es la
    misma consulta con dedo que con mouse. Y **`Presoterapia`** se suma a `PRO_TECNICAS`.
  - **Tests (`test/episodio.test.js`, 11 nuevos):** opciones y preselección del selector (5+3, orden
    fecha→hora, hoy como pasada, solo las citas del paciente) y el efecto de la frontera elegida
    sobre `doneActual` y el ordinal en los tres escenarios — elegir **ayer** (la cita de hoy es la 1
    del episodio nuevo y `doneActual` arranca en 0), elegir **hoy** (la entrada de hoy queda en el
    viejo) y **sin citas** (marcador ayer, y lo de hoy ya cuenta en el nuevo).

---

## 🗓️ Sesión 2026-08-14 — Terapeutas: la secretaria gestiona el equipo · el borrado deja de arrastrar citas

Un commit, revisado en rama (`revision-equipo`, ya borrada) antes de tocar `main`. En prod con
Vercel verde verificado por hash de bundle (`index-DM59wvkf.js` / `index-BqTaJimk.css`: el build
local y el que sirve `rehactivaec.com` coinciden; en el JS servido están los strings del guard y en
el HTML los campos nuevos del modal y el `data-permission="admin-secretaria"`). Tests: 131 →
**143 verdes**.

- **`a95f7fc` feat(terapeutas): la secretaria gestiona el equipo y el borrado deja de arrastrar citas.**

  - **Permiso partido en dos (`permissions.js`).** `createTherapist` = alta + edición ·
    `deleteTherapist` = baja. Admin recibe los dos; **secretaria solo el primero**, más la pestaña
    `terapeutas` en sus tabs. La baja es la única acción irreversible de la pantalla y no se delega.
    En el listado cada botón se **renderiza** con su permiso — **ausente, no deshabilitado**: la
    secretaria no ve "Eliminar", y si un rol no tiene ninguno de los dos tampoco se dibuja el
    contenedor `.th-actions`.
  - **Endurecimiento del borrado, para TODOS los roles: se eliminó el borrado en cascada de citas.**
    Dar de baja a un terapeuta borraba todas sus citas (`delete().eq('therapist_id')`) — o sea que
    destruía la agenda histórica de la que salen facturación y Seguimiento, sin vuelta atrás y sin
    aviso. Ahora `therapistDeleteBlock()` (`utils.js`, pura y con `hoy` inyectable) corre **antes
    del confirm**: con **cualquier** cita, pasada o futura, bloquea con toast *"No se puede
    eliminar: tiene N citas (X futuras). Reasigná sus citas primero."* — la de hoy cuenta como
    futura, porque todavía se atiende. Solo se elimina con **cero citas**, y el confirm queda para
    ese caso. Reasignar primero es ahora el único camino.
  - **Modal de terapeuta: Horario (`work_start`/`work_end`) y Orden en agenda (`display_order`).**
    Hasta ahora solo se editaban **por SQL**, aunque los mappers de `auth.js`/`realtime.js` ya los
    leían y la agenda ya los usaba (`orderedTherapists`, rango horario de la vista Semana). Inputs
    `time` opcionales — o los dos o ninguno, un solo extremo no define un rango — y entero para el
    orden (vacío = al final). `hourValToTime()` es el inverso exacto de `parseHourVal` (ida y vuelta
    testeada; la resolución es la media hora). `extra_rate` sin tocar.
  - **Persistencia optimista con rollback, ahora también en la edición** (antes solo la creación lo
    tenía: si el upsert fallaba editando, la UI se quedaba mostrando datos que la DB nunca aceptó).
    Snapshot previo + `Object.assign` para revertir, `markLocalChange('therapists')` explícito, y
    `editing` **congelado al inicio** de `saveTherapist` para que reabrir el modal mientras el upsert
    está en vuelo no desvíe el rollback al terapeuta equivocado.
  - **RLS espejada en la base (`rls_therapists_secretaria.sql`, versionado).** La tabla estaba en
    `ALL = is_admin()`: sin este SQL la secretaria veía el botón y chocaba contra *"new row violates
    row-level security policy"* al guardar. Aplicado y verificado en prod por David: **4 policies —
    SELECT `true` intacta, INSERT y UPDATE `is_admin() OR is_secretaria()`, DELETE `is_admin()`**, la
    `ALL` vieja eliminada. El front es solo la UI; el que la baja siga siendo de admin lo garantiza
    la RLS. `rls_policies.md` actualizado con la tabla `therapists` como bloque propio.

---

## 🗓️ Sesión 2026-08-12 (b) — Pestaña «Seguimiento»: auditoría día a día

Un commit, revisado en rama (`revision-seguimiento`, ya borrada) antes de tocar `main`. En prod con
Vercel verde verificado por hash de bundle (`index-BwYx7ALE.js` / `index-BqTaJimk.css`: el build
local y el que sirve `rehactivaec.com` coinciden; en el JS servido están los strings de la feature
y en el HTML el `tab-seguimiento` y sus filtros). Tests: 104 → **131 verdes**.

- **`29ec147` feat(seguimiento): auditoría día a día de lo atendido contra lo registrado.**
  Pestaña nueva en la sección PACIENTES, **de solo lectura**, visible para los tres roles —
  terapeuta incluido, porque es la pantalla que dice qué falta cargar y quien lo carga es él.
  Responde una sola pregunta: de los pacientes **activos**, qué **días** se atendió y no quedó nada
  escrito en la historia.

  - **El cruce es día a día, no de totales, y esa es toda la gracia.** "1 cita / 1 sesión" cuadra en
    los totales y aun así puede faltar el registro, si la sesión se escribió otro día. Dos citas el
    mismo día se cubren con **una sola** entrada de ese día; una entrada de otro día no cubre nada.
  - **Definiciones únicas en `utils.js`, puras y testeadas.** *Cita pasada* = `conf` con fecha ≤ hoy
    (`pend`/`noas` no cuentan). *Entrada clínica* = todo el log salvo `Fin de episodio`, que es
    marcador técnico y no documentación → un día cubierto **solo por la evaluación inicial sí
    cuenta**. *Responsable del día* = terapeuta de la cita **más temprana**, para que el orden del
    array no cambie el resultado. A diferencia de `doneActual`, **no recorta por episodio**: audita
    todo lo atendido. `detalleSeguimiento` es la base y `diasSinRegistro` sale de filtrarlo — una
    definición para la tabla y para el desplegable, con un test que ata las dos.
  - **UI.** Tabla Paciente · Sesiones · Citas pasadas · Días sin registro (badge rojo con el número,
    o ✓ verde) · **Ver**, que salta al Informe del paciente con el mismo mecanismo de
    `verInformeDeCita` (`showTab` **primero**, `selectRptPatient` después — al entrar a
    `paciente_rpt` se ejecuta `renderPatientReportSelect`, que resetea la selección). Click en la
    fila despliega el detalle día a día (fecha · terapeuta · ✓ Registrado / 🔴 Sin registro), uno a
    la vez. Filtros con contador: **Con seguimiento** (default) / Con días faltantes / Todos; no son
    excluyentes a propósito.
  - **Sin queries nuevas.** Todo sale de lo que `loadAll` ya trajo (`p.log` y las citas), con las
    citas agrupadas por paciente en **una pasada por render**, mismo patrón que `ordinalesDeCitas`.

- **Por qué murió el chip App/Reliv (rework del primer diseño).** El lote salió a revisión con un
  chip *Fuente* App↔Reliv por paciente, editable y persistido en `patients.seguimiento`: servía para
  marcar a mano a quienes se llevan en Reliv y que no aparecieran como pendientes. La regla del
  diseño nuevo —**≥1 evolución = aparece**— lo volvió innecesario: un paciente que se lleva en Reliv
  simplemente no tiene entradas clínicas, así que no entra nunca en «Con seguimiento» sin que nadie
  lo marque. El flag manual era mantenimiento puro para reproducir algo que el propio dato ya dice.
  Se eliminaron el chip, su toggle, su write path y los filtros Reliv/Pendientes; con ellos se fue
  la única escritura de la pestaña, que quedó **100% solo lectura**. **La columna
  `patients.seguimiento` queda en la DB sin usar** — no se lee ni en los mappers de `auth.js` y
  `realtime.js`. Si se confirma que no vuelve, toca `DROP COLUMN` en su momento.

- **Fix colateral:** `showTab` ya no resuelve el botón del sidebar por índice (`navMap`) sino por su
  propio `onclick`. Con un índice fijo, insertar una pestaña al medio corría el mapa y dejaba el
  "active" en la de al lado — verificadas las 10 pestañas.

- **Deuda nueva detectada (no bloqueante):** los botones de acción de **Pacientes** (`.pl-act-btn`:
  Editar/Eliminar/Eval./Ver) miden **42px en táctil real**, no 44. La regla `.patient-table
  .pl-act-btn{min-height:42px}` del media query de 768px le gana por **especificidad** a la del
  bloque `@media (pointer: coarse)`, que sí pide 44 — así que en un iPad o teléfono real quedan en
  42. En Seguimiento se corrigió con una regla propia (`#tab-seguimiento .pl-act-btn`); **en
  Pacientes sigue abierto** y conviene alinearlo (subir el 42 a 44, o scopear igual).

---

## 🗓️ Sesión 2026-08-12 — Ordinal de cita ("X/N") en la agenda

Un commit, revisado en rama (`revision-ordinal`, ya borrada) antes de tocar `main`. En prod con
Vercel verde verificado por hash de bundle (`index-C_QHkc8l.js` / `index-Dj557gWQ.css`: el build
local y el que sirve `rehactivaec.com` coinciden, y las reglas `.appt-ord` están en el CSS servido).
Tests: 85 → **104 verdes**.

- **`85e7af7` feat(agenda): badge "X/N" con el ordinal de la cita en su episodio.**
  Mirando la agenda no se sabía en qué punto del tratamiento va cada paciente: había que abrir su
  ficha. Ahora cada tarjeta (Día y Semana) lleva abajo a la derecha un badge gris **"X/N"** — X =
  posición de esa cita en la secuencia del paciente, N = su plan (`p.sessions`); sin plan, solo "X".
  Es un dato **informativo de agenda**: facturación y sus conteos siguen derivando de `session_log`,
  intactos.

  - **Definición única (`citasNumerables`, `utils.js`), puros y testeables.** Universo = citas del
    MISMO paciente **posteriores al último `Fin de episodio`** — frontera **estricta** (`date > fin`),
    la misma que `doneActual` y que el recorte de episodio de los informes: la cita con la fecha del
    corte queda en el episodio que cierra. Se **excluyen las `noas`**: un no-show no consume número,
    así que la siguiente hereda el ordinal. Orden por fecha y luego **hora decimal** (10:45 va después
    de 10:30). Episodio nuevo → la numeración reinicia en 1.
  - **Rendimiento: mapa por render, no por tarjeta.** `ordinalesDeCitas()` agrupa por paciente en una
    pasada y devuelve `Map<cita, {x,n}>`; el render solo hace `get`. La clave es **la cita misma, no
    su id** (los ids mezclan numéricos optimistas, uuids y `rec-…`) — mismo criterio que `compactNoas`.
  - **Sin badge:** cita sin paciente, `noas` (ni tarjeta ni tira compacta) y cita de un **episodio ya
    cerrado**, que no tiene posición en la secuencia actual.
  - **Reparto de esquinas (lo delicado del render).** El badge va absoluto → no rompe el `nowrap` ni
    el ellipsis del nombre, y con `pointer-events:none` no le roba el click a la tarjeta ni al slot.
    Arriba a la derecha manda el punto de estado; el "+" solo existe en las no-asistió, que nunca
    llevan badge; la hora exacta vive dentro del nombre. El único que comparte esquina es la **"×"** de
    borrar, que asoma en hover: el badge se corre 22 px a su izquierda. En Día el subtítulo reserva
    28 px para cortar antes; en la tarjeta **aplastada por una tira** se oculta porque ya no cabe (en
    una franja de 40 px útiles el nombre centrado llega a ~27 px y el badge arranca en ~29).
  - **Intocado a propósito:** facturación, `billingInfo`, resumen, informes y continuidad — cero
    cambios de conteo.

**Deuda que deja la sesión:** el render sigue sin tests (no hay jsdom ni Playwright instalados) — la
lógica de numeración está cubierta por `test/ordinal.test.js` (19 casos), pero el encaje visual del
badge se calculó sobre las métricas de `.appt` y se revisó a ojo, sobre todo en **vista Semana**, donde
las columnas son angostas y los nombres largos. La decisión a vigilar es la del **episodio cerrado sin
badge**: si algún día se quiere ver el ordinal de una cita pasada, habría que numerarla dentro de su
propio episodio en vez de dejarla fuera del universo.

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

> Recuento **verificado con `wc -l` el 2026-08-14**. La tabla anterior era del corte de mayo:
> el JS activo pasó de ~3.173 a **6.288** líneas, y hay 6 módulos nuevos (`validators`, `cie10`,
> `mobile-menu`, `pdf-logo`, `seguimiento`, `plan`) más las carpetas `/test/`, `/api/` y
> `/js/data/`.

### `/` (raíz)
| Archivo | Líneas |
|---------|--------|
| `index.html` | 886 |
| ~~`app.js`~~ *(legacy monolítico — **BORRADO** en `efd7471`, 2026-05-30)* | — |
| ~~`/src/`~~ *(scaffolding de Vite — **BORRADO**, ya no existe en el repo)* | — |

### `/js/` — 25 módulos activos *(recontado el 2026-08-14)*
| Archivo | Líneas | |
|---------|--------|---|
| `pdf-logo.js` | 3 | logo del membrete como data URI (assets de JS nunca por ruta en string) |
| `supabase-client.js` | 10 | lee `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` |
| `toast.js` | 16 | |
| `mobile-menu.js` | 38 | |
| `state.js` | 42 | |
| `permissions.js` | 60 | |
| `search.js` | 63 | |
| `plan.js` | 89 | plan de sesiones en el modal de cita (dato del paciente, como `cie10.js`) |
| `validators.js` | 105 | cédula EC, email, teléfono, errores de campo |
| `seguimiento.js` | 117 | pestaña de auditoría día a día (solo lectura) |
| `cie10.js` | 150 | |
| `terapeutas.js` | 151 | |
| `doctores.js` | 161 | |
| `ia.js` | 188 | |
| `protocolos.js` | 207 | |
| `resumen.js` | 212 | |
| `main.js` | 248 | |
| `auth.js` | 288 | |
| `realtime.js` | 326 | |
| `facturacion.js` | 339 | |
| `sesiones.js` | 396 | |
| `pacientes.js` | 517 | |
| `utils.js` | 590 | lógica pura y testeada: conteos, episodios, conflictos, ordinal |
| `agenda.js` | 918 | |
| `informes.js` | 1054 | |
| **Total JS activo** | **6288** | |

**`/js/data/cie10-fisio.json`** — 182 KB, 2470 códigos. **No** entra en el bundle inicial: `cie10.js`
lo carga con `import()` al primer uso (chunk aparte).

### `/css/` — 2.078 líneas *(recontado el 2026-08-14)*
| Archivo | Líneas |
|---------|--------|
| `base.css` | 23 |
| `layout.css` | 59 |
| `resumen.css` | 68 |
| `rehactiva-theme.css` | 109 |
| `components.css` | 155 |
| `screens.css` | 274 |
| `facturacion.css` | 450 |
| `responsive.css` | 940 |

### `/test/` — `node --test`, **154 verdes**
| Archivo | Tests sobre |
|---------|-------------|
| `cedula.test.js` · `validators.test.js` | cédula ecuatoriana, email, teléfono |
| `utils.test.js` · `billing.test.js` | `doneActual`/`doneEnLog`/`pendientesActual`, frontera de episodio, "Cobro X de Y" |
| `horas.test.js` | horas exactas: `fmtTime`, `slotOf`/`apptSlots`, `apptsOverlap`/`findConflict` |
| `semana.test.js` | `startOfWeek` (vista semanal) |
| `cie10.test.js` | búsqueda del catálogo (acentos, punto opcional) |
| `noas.test.js` | slot liberado por no-asistió: `bloqueaSlot`, `compactNoas`, `occupiedSlots` |
| `ordinal.test.js` | badge X/N: `citaOrdinal`/`ordinalesDeCitas`, frontera de episodio, no-asistió |
| `seguimiento.test.js` | auditoría día a día: `detalleSeguimiento`, `diasSinRegistro`, filtros |
| `terapeutas.test.js` | guard de borrado (`therapistDeleteBlock`) y `parseHourVal`/`hourValToTime` |
| `episodio.test.js` | cierre con frontera elegida: `citasParaCierre`/`indiceCitaCierre`, `fmtFechaCorta`/`diaAnterior` |

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
| `search.js` | Búsqueda global de pacientes (sobre estado en memoria) + chip "Citas" al historial |
| `historial.js` | Pantalla Historial de citas: render, controles, imprimir con membrete y CSV. `irAHistorial()` es la entrada única de las cuatro puertas |
| `historial-calc.js` | **Lógica pura del historial** (sin DOM ni `state`): episodios, ordinal por episodio, estado de la cita, resumen, filtros, agrupación por mes y filas del CSV |
| `patient-combo.js` | Fábrica `crearComboPaciente` — combobox buscar+elegir reutilizable, sin ids fijos ni estado de módulo |
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
| `resumen.js`, `informes.js`, `search.js`, `historial.js` | *(solo leen de `state`, sin queries directas)* |

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
| Historial de citas por paciente | ✅ | Pestaña `historial` para los tres roles: asistencias, cortes por episodio, imprimir y CSV — `bcf2acc` |
| Realtime sync | ✅ | PostgREST subscriptions en todos los recursos |
| Permisos UI por rol | ✅ | `hasPermission()` en todos los módulos de escritura |
| Export CSV agenda | ✅ | `exportAgendaCSV()` en agenda.js |
| Export PDF | ✅ | `exportarPDF()` en informes.js |
| Integración IA (Claude) | ✅ | Informes semanales y por paciente, vía `/api/informe.js` con rol `viewAI` + rate-limit server-side |
| Notificaciones a médicos | 🟡 | Preferencias guardadas, **envío no implementado** — sigue en el roadmap |
| Protocolos de tratamiento | ✅ | CRUD + adherencia |
| Responsive / móvil | ✅ | Pasada con foco en el flujo del terapeuta (`bc8b276`); targets táctiles de 44 px |
| Tests automatizados | ✅ | 326 verdes con `node --test` (`npm test`), sobre la lógica pura |

---

## d) Deuda técnica

> Revisada contra el código el **2026-08-11**. La lista viva de lo abierto está arriba, en
> «🔜 PRÓXIMO», y el análisis completo en `AUDITORIA_PRELANZAMIENTO.md`.

### Ya no aplica *(la versión anterior de esta sección era de mayo)*
- ~~`app.js` monolítico~~ — borrado en `efd7471`; `index.html` solo carga los módulos de `/js/`.
- ~~`src/` scaffolding de Vite~~ — borrado, ya no existe.
- ~~No hay tests~~ — **326 verdes** con `node --test` (`npm test`), y el CI los corre.
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
- **P1 — INFORMES 4b: el NUMERADOR de la ocupación semanal está en otra unidad que el denominador**
  (`informes.js:172-178`). `thConf` cuenta **citas** (`.filter(...).length`) y `capacidadSlots()`
  devuelve **slots de 30'**: una cita de 60 min ocupa 2 slots pero suma 1, así que el % sale
  **subestimado** —hasta a la mitad si el grueso de la agenda es de una hora—. Fix: el numerador
  pasa a `Σ apptSlots(a).length` sobre las `conf`, que es exactamente la unidad del denominador y
  ya es la función que usa la grilla. **El denominador ya está bien** desde `e4f3886`
  (`capacidadSlots`, ver sesión 2026-09-03).
- **Resto de INFORMES 4b** *(spec: `PLAN_INFORMES.md` + `mockups/informes-esqueleto-2026-09.html`)*
  — esqueleto común a las tres pestañas (`renderInforme(rango)`; hoy cada `render*` arma el suyo);
  **selector de período en el header** para las tres (hoy: flechas en el header el semanal, un
  `<select>` dentro del contenido el mensual, y el anual **no tiene**); y la **lectura de IA como
  sección de hoja, NO como tarjeta** *(decisión de Jefferson, 2026-09-01)*.
- **P2 — `dbUpdateApptStatus()` (`auth.js:294`) escribe solo `{status}`**, salteándose
  `payloadCambioStatus()`. Es la **única** escritura de estado que no pasa por el invariante de la
  baja de QuickBooks. Hoy no rompe nada porque su único caller es `checkAutoNoas`
  (`agenda.js:124`), que mueve `pend → noas` y una `'pend'` nunca está conciliada — pero es un
  agujero latente: el segundo caller que llegue con otra transición deja una no-asistió con
  `qb_at`. Fix de una línea: `update(payloadCambioStatus(status))`.
- **P2 — mover una cita conciliada CONSERVA su `qb_at`** *(decisión documentada, no bug)*. Cambiar
  fecha, hora o terapeuta de una `'conf'` ya pasada a QuickBooks no la desconcilia: lo que se
  facturó fue **la sesión**, no la franja, y re-timbrarla obligaría a revisarla de nuevo en
  QuickBooks sin motivo. Queda anotado porque es contraintuitivo al leer el código: el único
  disparador de la desconciliación es el **cambio de estado**, no el de posición.
- **P2 — `parseTimeInput()` no redondea a la media hora.** El `step="1800"` de los `<input
  type="time">` del modal de bloqueo (y el `step="300"` de la hora exacta de la cita) es una
  **pista del navegador, no una restricción**: una hora tecleada a mano entra sin redondear. Si el
  `CHECK` de la columna la rechaza, el error de Postgres sube **crudo** al toast
  (`'Error al guardar el bloqueo: ' + error.message`), que no es un mensaje para recepción. Fix:
  redondear en `parseTimeInput` o validar antes de escribir, y traducir el error.
- **Follow-up — columna QB en el export a Excel.** El export por rango (`excel.js`, sesión
  2026-08-31 (e)) no lleva `qb_at`, así que la conciliación no se puede cruzar fuera de la app;
  es justo el archivo que se usa para revisar contra QuickBooks.
- **SEMÁNTICA DE LA NOTA DE FIN DE EPISODIO** *(hallazgo del LOTE HISTORIAL, 2026-09-01 (d))* —
  `guardarNuevoEpisodio` (`pacientes.js:410`) escribe `doneActual(p)` = sesiones **HECHAS** al
  cerrar, e `informes.js:539` lo lee como el **PLAN** del episodio cerrado → el informe de un
  episodio cerrado dice siempre "N de N · 100%". `parseFinNote` (`utils.js`) conserva esa lectura a
  propósito para que Historial e Informe digan lo mismo. Fix: escribir también el plan en la nota
  ("… · X sesiones completadas de M") y parsear M; toca los dos lectores y necesita decidir qué
  hacer con las notas viejas.
- **Migrar los dos parseos a mano de la nota de fin** (`informes.js:506` y `:538`) a
  `parseFinNote()`, que ya es la fuente única y está testeada.
- **Migrar el combobox de `informes.js` a la fábrica `patient-combo.js`** y borrar `_rptResults`,
  `_rptHi`, `filterPatientRptSelect` y `rptSearchKeydown`.
- **`loadAll()` (`auth.js:44`)** — un `Promise.all` sin manejo granular: si falla una tabla,
  aborta toda la carga. Además trae **todas** las citas sin ventana de fechas: hoy no molesta
  (~13k/año), pero es el costo real que crece, no el filtrado en memoria del Historial.
- **Render sin tests** — no hay jsdom en el proyecto; lo puramente visual (apilado de la agenda,
  targets táctiles) se verifica a ojo en dev.
- **`cycleStatus` no chequea conflictos** — reactivar a `conf` una no-asistió sobre cuya franja ya
  se agendó deja dos citas activas solapadas.
- **Lo formal:** I-7 (`cobro_ref` server-side, necesita SQL), P-2 (frontera `>` vs `>=`), CSP
  estricta (P-11), agenda táctil en iOS (R-20) y la deuda de realtime RT-1…RT-4.

---

## e) Últimos commits *(al 2026-08-12; la tabla anterior se quedó en mayo)*

| Hash | Descripción |
|------|-------------|
| `85e7af7` | feat(agenda): badge "X/N" con el ordinal de la cita en su episodio |
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
