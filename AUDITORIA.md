# Auditoría RehactivaPro

> **Generado:** 2026-09-04 · **Rama:** `main` @ `956d8a6` · **Solo lectura: no se tocó ni un archivo de `js/`, `css/` ni `index.html`.**
> **Método:** 32 auditores en paralelo (una dimensión por sub-ítem del encargo) → refutación adversarial de cada hallazgo (2 lentes independientes para CRÍTICO/ALTO: «¿el código dice eso?» y «¿la consecuencia es real en esta clínica?») → crítico de completitud → segunda ronda sobre los vacíos → síntesis.
> **Volumen:** 222 hallazgos brutos · 10 tumbados por los refutadores · 69 severidades corregidas a la baja · **147 sobreviven**, agrupados abajo en 61 entradas.

---

## 0. Correcciones a las premisas del encargo

Cuatro cosas que el encargo daba por ciertas y **no lo son**. Verificadas contra el repo, no supuestas.

| Premisa del encargo | Realidad medida |
|---|---|
| «8344 líneas en 19 módulos» | **9854 líneas en 36 módulos** (`wc -l js/*.js`) |
| «253 tests» | **335 tests en 21 archivos**, todos pasan (`node --test`, exit 0) |
| «28 bloques catch, dos VACÍOS» | **31 ocurrencias de `catch`.** Los dos vacíos existen: `realtime.js:290` y `realtime.js:332`. **Los dos son correctos** y no hay nada que arreglar — ver §0.1 |
| «los 6 TODO/FIXME» | **No existe ni un TODO/FIXME/XXX/HACK en todo el repo** — ver §0.2 |

### 0.1 Los dos catch vacíos: correctos, no son hallazgo

```js
// realtime.js:290
try{if(realtimeChannel)await supa.removeChannel(realtimeChannel);}catch(e){}
realtimeChannel=null;
// realtime.js:332  (idéntico, dentro de unsubscribeRealtime)
```

Los dos envuelven `removeChannel` inmediatamente antes de `realtimeChannel=null`. Es limpieza de un canal que se va a descartar en la línea siguiente: si falla, el resultado deseado (soltar el canal) se consigue igual. Tragarse el error ahí es la decisión correcta. **Bloque 1.1 cerrado en esta parte.**

Lo que sí encontraron los auditores en materia de `catch` está más abajo, y no son los vacíos: son los `catch` que **no existen** (`agenda.js:445`, `pacientes.js:153-161`) y sobre todo los errores que Supabase **no lanza** y por eso ningún `catch` puede atrapar.

### 0.2 Los 8 TODO no existen: es un falso positivo del idioma

Los 8 aciertos de `grep -rn "TODO\|FIXME\|XXX\|HACK"` son la palabra española **«TODO/TODOS»** en prosa y en prompts:

`informes.js:268` · `pacientes.js:296` · `realtime.js:174` · `word.js:212` · `css/responsive.css:964` · `ia.js:87` · `ia.js:116` · `ia.js:155`

**Bloque 3.3 cerrado, limpio.** No hay deuda marcada en comentarios; la deuda de este proyecto vive en `PROYECTO_ESTADO.md`, que es un sitio mejor.

### 0.3 Bloques que salieron limpios

- **B2.3 secretos** — no hay ninguna key indebida en el bundle. La anon de Supabase está y debe estar. `ANTHROPIC_API_KEY` solo vive server-side en `api/informe.js`. `.env` y `.env.local` están en `.gitignore` y nunca se commitearon. *(Un hallazgo menor sí quedó: la contraseña en el DOM tras el login — `auth.js:136-158`, MEDIO.)*
- **B2.4 los 4 prompts de IA** — de los cuatro, **tres están limpios**: semanal (`ia.js:86-95`), mensual (`115-132`) y anual (`154-165`) son agregados puros: totales, tasas, conteo de terapeutas. Ni un nombre, ni una cédula, ni un diagnóstico. **Solo el prompt de paciente lleva PHI**, y está cubierto abajo.
- **`api/informe.js`** resultó **más sólido** de lo que sugerían los primeros hallazgos: valida el token de Supabase, hace chequeo server-side del rol espejando `viewAI`, tiene rate-limit y tope de 20k caracteres. El hallazgo que quedó vivo es de trazabilidad, no de control de acceso.
- **B3.4 dependencias** — las cuatro de `package.json` se usan. El problema es el inverso: **Chart.js es dependencia real y NO está en `package.json`** (ver PERF-03).
- **XSS** — `esc()` se aplica con disciplina en todo el repo. `highlightMatch` escapa antes de resaltar, `cellG` escapa, `buildHistorialPrintHtml` escapa cada celda. Sin huecos. *(El XSS de `protocolos.js` que reportaba la auditoría de mayo está corregido.)*

---

## 🔴 CRÍTICO

Datos incorrectos o pérdida de datos **hoy**, en producción.

---

### DATOS-01 — La agenda puede quedarse ciega en silencio al cruzar 1000 citas
**`js/auth.js:54`** · Esfuerzo **S** · sin SQL · **verificar con Jefferson** (dato fuera del repo)

**Qué está mal.** `appointments` se carga entera, sin `.range()`, sin `.limit()`, sin ventana de fechas y **ordenada por fecha ASCENDENTE**; si el proyecto conserva el `Max rows` por defecto de Supabase (1000), lo que sobrevive al corte son las citas **más viejas**.

```js
supa.from('appointments').select('*,patients(name)').order('date').order('hour'),
```
`grep -rn "\.range(\|\.limit(" js/ api/` → **cero resultados en todo el repo.** No hay ninguna defensa.

**Consecuencia real.** El corte no es abrupto: a 1005 filas se pierden las 5 de fecha más alta — o sea, **las que la secretaria acaba de agendar para la semana que viene**. Síntoma exacto: «agendé la cita, salió el toast, y al refrescar no está». Con la agenda incompleta se caen también `renderGrid`, el Resumen del día, el Historial y `hasSession` (`auth.js:95-97`), que marca como no registradas sesiones que sí existen — y entonces Facturación cuenta mal. El propio proyecto estima ~12-13k citas/año (`PLAN_HISTORIAL.md:22`), o sea ~50/día hábil: **1000 filas son ~4 semanas de operación**, y la clínica lleva desde agosto.

**Matiz honesto de los refutadores** (por esto no es más grave de lo que ya es): si esto estuviera disparando hoy, la agenda del día estaría en blanco y sería imposible no notarlo. Lo más probable es que el `Max rows` del proyecto ya esté subido. **Pero ese valor no está fijado en ningún sitio del repo**, no hay ni un test que lo cubra, y basta un reset del dashboard, una restauración de backup o una migración de proyecto para que vuelva a 1000 y la clínica pierda la agenda sin un solo mensaje de error.

**Arreglo.** Verificar hoy mismo el valor real en *Supabase → Settings → API → Max rows* y contrastarlo con `select('*',{count:'exact',head:true})` sobre `appointments`. Luego dejar de depender de ese ajuste: ventana de fechas para la agenda (`.gte('date', hace90dias)`) y paginación en bucle con `.range()` para lo que necesite histórico completo.

---

### RT-01 — Editar la fecha de una sesión la DUPLICA en las demás pantallas
**`js/realtime.js:163-164`** · Esfuerzo **XS** · sin SQL · confianza alta

**Qué está mal.** La rama UPDATE de `_onSessionLog` empareja la fila **por `(date, normHour(hour))` en vez de por `id`** — y editar una sesión puede cambiar justamente la fecha.

```js
const idx=p.log.findIndex(s=>s.date===payload.new.date&&normHour(s.hour)===normHour(payload.new.hour));
if(idx>=0)p.log[idx]=_mapSession(payload.new);else p.log.push(_mapSession(payload.new));
```

**Consecuencia real.** El terapeuta corrige la fecha de una sesión desde el modal (`sesiones.js:292` actualiza por `id`). En **su** navegador queda bien. En **todo otro navegador abierto**, el `findIndex` busca por la fecha nueva, no la encuentra, y cae al `else` que hace `push`: **el paciente queda con la sesión duplicada**, una en la fecha vieja y otra en la nueva. `doneActual` cuenta filas de `p.log`, así que `done` y `pendientesActual` suben +1: la secretaria ve al paciente en «Listos para cobrar» **una sesión antes de tiempo y puede emitir un cobro por una sesión que nunca existió**. Dura hasta un F5; no hay TTL que lo cure.

**Arreglo.** Emparejar por `id`, que ya viene en `payload.new`: `findIndex(s => s.id!=null && String(s.id)===String(payload.new.id))`, y solo si no aparece caer al fallback por `(date,hour)`. Es la misma cirugía que `sesiones.js:298` ya hace bien.

---

### RT-02 — Borrar una sesión no se propaga: se sigue cobrando en las otras pantallas
**`js/realtime.js:154-156, 167`** · Esfuerzo **S** · **con SQL** (verificación) · confianza media

**Qué está mal.** La rama DELETE de `_onSessionLog` depende de columnas que **no son la PK** dentro de `payload.old`, y Postgres con `REPLICA IDENTITY` por defecto solo envía la clave primaria.

```js
const row=payload.new||payload.old;   // 154
const pid=row.patient_id;             // 155  → undefined en un DELETE
const p=getPatient(pid);if(!p)return; // 156  → sale por acá, en silencio
...
p.log=p.log.filter(s=>!(s.date===payload.old.date&&normHour(s.hour)===normHour(payload.old.hour))); // 167
```

**Consecuencia real.** El admin borra una sesión mal cargada. En las demás pantallas **la sesión sigue contando**: `done` y `pendientesActual` quedan inflados y se cobra una sesión que se borró precisamente porque no ocurrió. Ni toast, ni re-render, ni rastro. Es el espejo exacto de RT-01 y compone con él. Los otros cinco handlers (`:120`, `:137`, `:208`, `:230`, `:249`) filtran por `payload.old.id` y **no** tienen este problema — es específico de `session_log`.

**Arreglo.** Filtrar por id: `p.log = p.log.filter(s => String(s.id)!==String(payload.old.id))`, y sacar el `patient_id` del propio `state.patients` en vez de `payload.old`. **Antes de tocar código**, verificar el supuesto: `SELECT relreplident FROM pg_class WHERE relname='session_log'` — `'d'` = solo PK (el bug es real), `'f'` = fila completa (este hallazgo se cae y solo queda RT-01).

---

## 🟠 ALTO

Falla en silencio, o hueco de permisos.

---

### CORR-01 — `commitApptChange` da por bueno un UPDATE que la base rechazó
**`js/agenda.js:386-393`** · Esfuerzo **S** · sin SQL · *confirmado por 4 auditores independientes*

Un UPDATE bloqueado por RLS devuelve **0 filas y `error: null`**. La función no pide `.select()` ni cuenta filas, así que retorna `true`. Sus tres llamadores (`cycleStatus` :395-404, el drop de drag&drop :293-295, `saveAppt` edición :731-753) **descartan el booleano** y ya mutaron el estado local.

**Consecuencia.** La RLS acota al terapeuta a sus propias citas (`rls_policies.md:58`), pero el front le deja cambiar el estado de **cualquier** cita (`permissions.js:29` le da `cycleStatus`, y el punto de estado se engancha en todas las tarjetas, `agenda.js:344`), arrastrarla y hasta guardar el modal. Sobre la cita de un colega: la tarjeta se mueve, sale «Cita actualizada», y la base nunca se enteró. **Dos personas mirando dos verdades distintas, sin ningún error a la vista.** Es exactamente el fallo que cuesta una cita perdida.

**Arreglo.** `.update(dbFields).eq('id',appt.id).select('id')` y tratar `!data||!data.length` como fallo — el patrón ya está escrito en `sesiones.js:319-322`. Devolver `false` y que los tres llamadores reviertan el estado en memoria y re-rendericen.

**Mismo defecto en `dbUpdateApptStatus` (`js/auth.js:294-299`)**, XS de esfuerzo, mismo arreglo.

---

### SEG-01 — El terapeuta puede reescribir cualquier cita: la rama de edición no tiene gate
**`js/agenda.js:699` y `695-753`** · Esfuerzo **S** · sin SQL

`saveAppt()` solo comprueba permiso en el **alta**: `if(!isEdit && !hasPermission('createAppt'))`. La rama de **edición no comprueba nada**, y `openEditApptModal()` tampoco: se abre con un click en la tarjeta (`agenda.js:343`).

**Consecuencia.** El terapeuta, que no tiene `createAppt` ni `deleteAppt`, puede reescribir paciente, fecha, hora, duración, tipo, modalidad y terapeuta de cualquier cita que vea. **No hace falta la consola: es un click.** Sobre sus propias citas la RLS lo deja pasar de verdad — puede reasignarle otro paciente a una cita suya. Sobre las de otro terapeuta se combina con CORR-01: la pantalla muestra la cita movida y recepción la sigue viendo donde estaba.

**Arreglo.** Definir la acción que falta en la matriz (`editAppt` para admin/secretaria, o un `editApptStatus` acotado para el terapeuta) y chequearla al principio de la rama `isEdit`. En `openEditApptModal`, poner los campos en readonly y ocultar el botón de guardar (hoy `index.html:612` lo renderiza siempre).

---

### CORR-02 — Las citas recurrentes viven con un id inventado que nunca se reconcilia
**`js/agenda.js:788-789`** · Esfuerzo **XS** · sin SQL · *confirmado por 5 auditores*

```js
const {error:re}=await supa.from('appointments').insert({date:fecha, ...});
if(!re){state.appointments.push({..._a, id:'rec-'+fecha+'-'+Math.random(), date:fecha, status:'pend'});creadas++;}
```
El insert **no pide `.select()`**, así que el UUID real nunca vuelve y en memoria queda un id sintético.

**Consecuencia — cuatro efectos, todos en la misma sesión y hasta el próximo F5:**
1. **Toda acción posterior sobre una cita recurrente es un no-op silencioso.** `commitApptChange` corta al ver `'rec-'` y devuelve `true`: editarla muestra «Cita actualizada» y arrastrarla la mueve en pantalla sin escribir nada.
2. **Borrarla no la borra.** `delAppt` (`agenda.js:445`) decide con `typeof id==='string'` en vez del helper `esRealApptId` que existe 63 líneas más arriba: hace `.eq('id','rec-…')`, que no matchea nada. La cita sale de la pantalla, **la fila sobrevive**, y al día siguiente reaparece: el slot que la secretaria creía libre ya estaba vendido.
3. **Cada cita de la serie queda duplicada.** El eco de realtime llega con el UUID real, no matchea el `'rec-'` y se pushea una segunda copia (`realtime.js:115-118`). Se duplican el contador «N citas hoy», los slots ocupados, el badge ordinal X/N y el «Conciliar día (N)».
4. Sin ningún test: `grep "recurrente\|rec-\|getRecDates" test/` → 0.

**Arreglo.** `.insert(...).select('id').single()` y pushear el id real, igual que la cita base en `agenda.js:764-767`. Con eso desaparecen los cuatro efectos de golpe. Y usar `esRealApptId(id)` en `delAppt`.

---

### CORR-03 — Si falla el alta de una cita recurrente, nadie se entera
**`js/agenda.js:788-799`** · Esfuerzo **XS** · sin SQL · *confirmado por 5 auditores*

El error del insert se captura en `re` pero **solo se usa para no contar la cita**: no hay `else`, no hay contador de fallidas, no hay log, no hay toast.

**Consecuencia.** La secretaria agenda lun/mié/vie × 4 semanas = 12 citas. Si fallan 5, ve «✓ 8 citas creadas» y ninguna mención de las 5 perdidas. Si fallan **todas**, `creadas=omitidas=bloqueadas=0` hace falsa la condición de la línea 791 y **no sale ningún toast de la serie**: cae directo en `toastOk('Cita guardada correctamente')` de la 799. Pidió 12, quedó 1, y nadie se lo dice hasta que el paciente se presenta un día que no estaba agendado. Es la única escritura del repo donde el error se comprueba y aun así el usuario recibe confirmación de éxito.

*Los refutadores acotaron el disparador*: no puede ser RLS (el insert base ya pasó la misma policy), ni constraint (no hay ninguna declarada). Queda el 500 transitorio o el corte de red a mitad del bucle — poco frecuente, y eso explica que no haya estallado.

**Arreglo.** `else fallidas++` y sumarlo al toast final («· N no se pudieron crear»), forzando el toast siempre que se hayan pedido recurrentes.

---

### CORR-04 — El bug de `hour` confirmado: la sesión manual se desvincula de la cita
**`js/sesiones.js:162-173`** (reloj en 164-165, se escribe en 202-206) · Esfuerzo **S** · **con SQL de limpieza** · confianza alta

**El reporte de campo se confirma.** `genUniqueHour()` escribe en `session_log.hour` la hora del reloj del navegador en formato `HH:MM:SS` — es la **única** escritura de hora por reloj de todo `js/`, y explica exactamente el `11:52:10` observado.

```js
const n=new Date();
let h=n.getHours(), m=n.getMinutes(), s=n.getSeconds();
let hour=`${pad(h)}:${pad(m)}:${pad(s)}`, guard=0;
```

**Pero el diagnóstico correcto no es el que parecía.** Es **deliberado** (comentarios en :160-161 y `PROYECTO_ESTADO.md:1444`): la sesión manual es carga retroactiva «sin crear citas», y `hour` es un id técnico para el dedup. Y la hora **nunca se muestra en pantalla**: no hay un solo `fmtTime(s.hour)` en `informes.js`, `historial.js`, `word.js` ni `excel.js`.

**El daño real** es que `session_log` y `appointments` se enlazan **solo** por `patient_id + date + hour` — no existe columna `appointment_id` en todo el repo. Cuando alguien usa «+ Sesión manual» (`informes.js:757`, que abre con fecha = HOY por defecto) para un paciente que **sí tenía cita ese día**, la fila queda huérfana:

- `hasSession` (`auth.js:96`) da `false`
- el Resumen sigue mostrando «Completar sesión» (`resumen.js:110-112`)
- al pulsarlo, `sesiones.js:355` busca por la hora de la cita, no encuentra nada e **INSERTA una segunda fila**
- `doneActual` cuenta 2 donde hubo 1 → el badge X/N se infla → `pendientesActual` dispara la alerta de facturación una sesión antes → **se factura de más**

**No afecta** Excel, Word, ocupación por slots ni conciliación con QuickBooks: todos ésos leen `appointments.hour`.

**Arreglo mínimo.** En `openSessionModalManual`/`saveSessionManual`, buscar en `state.appointments` una cita `conf` de ese paciente+fecha: si existe, usar `fmtTime(cita.hour)` y avisar en el modal («esta sesión se vinculará a la cita de las 11:00»); dejar `genUniqueHour` solo para días sin cita.

**SQL de limpieza aparte** (los datos ya escritos desde agosto): primero **listar** los duplicados (`patient_id+date` con 2+ filas de tratamiento, una con segundos) para borrar a mano la que sobra — cada duplicado ya está inflando `done` y la facturación; después, `UPDATE` de las filas manuales huérfanas (`EXTRACT(SECOND FROM hour) <> 0`) que tengan exactamente una cita del mismo `patient_id+date` sin sesión asociada, poniéndoles la hora de esa cita.

---

### CORR-05 — Mover una cita rompe el vínculo con su sesión ya registrada
**`js/agenda.js:293-295`** (arrastre) **y `731-736`** (editar cita) · Esfuerzo **M** · sin SQL

La otra mitad de CORR-04, y probablemente la otra mitad de lo que ve el cliente. Mover una cita actualiza `appointments.hour` pero **no toca la fila de `session_log`**, rompiendo la única clave que las une.

**Consecuencia.** Si la cita ya tenía sesión y luego se mueve: `hasSession` pasa a `false` en el siguiente refresh, la cita reaparece como «Completar sesión», y `openSessionModal` la abre **en blanco** (EVA 5/5, sin nota, sin técnicas). Si el terapeuta la vuelve a llenar, `sesiones.js:355` no encuentra fila con la hora nueva e inserta una segunda → **sesión clínica duplicada, `done` +1 y facturación +1**, en silencio.

Es especialmente fácil de disparar porque **el drop realinea la hora al medio slot** (comentario en :291-292: 10:45 → 10:30): soltar una cita de las 10:45 sobre su propia fila ya rompe el vínculo sin que nada cambie a la vista.

*Mitigación que sí existe*: Seguimiento cruza por fecha sola, así que ahí el día sigue apareciendo cubierto. El hueco es el botón de Resumen/Agenda.

**Arreglo.** El de fondo cierra CORR-04 y CORR-05 de una vez: **añadir `session_log.appointment_id`** (FK a `appointments`, `ON DELETE SET NULL`) y usarla como clave de enlace en vez de la terna. Mientras tanto, que `saveAppt` y el drop actualicen la fila de `session_log` cuando la cita movida tenga sesión.

---

### CORR-06 — Un SELECT fallido duplica la sesión clínica en vez de abortar
**`js/sesiones.js:355-361`** · Esfuerzo **XS** · sin SQL · confianza alta

```js
const existingInDB = await supa.from('session_log').select('id')...maybeSingle();
let dbError;
if(existingInDB.data){ /* UPDATE */ } else { /* INSERT */ }
```
**`existingInDB.error` nunca se comprueba.** Cualquier error se interpreta como «no existe» y dispara un INSERT.

**Consecuencia.** Verificado en `node_modules/@supabase/postgrest-js`: cuando `maybeSingle()` recibe >1 fila devuelve `{data:null, error:PGRST116}`. Como la línea 357 solo mira `.data`, **en cuanto existan dos filas para (paciente, fecha, hora), cada nuevo «Completar sesión» inserta una tercera, una cuarta…** El duplicado no se estabiliza: crece. Y `doneActual` cuenta filas, así que cada fila extra es una sesión más para cobrar. Lo mismo con un error transitorio de red.

**Arreglo.** `const {data:ex, error:exErr} = await ...maybeSingle()`; si `exErr`, abortar con toast («No se pudo verificar la sesión, reintentá») en vez de caer al INSERT. Es el arreglo de mejor relación valor/coste de toda la auditoría: **una línea**, y es la única de esta familia que no necesita tocar Supabase.

---

### SEG-02 — El terapeuta ve toast verde al guardar datos clínicos que no se guardaron
**`js/pacientes.js:131-161`, `js/permissions.js:29`** · Esfuerzo **M** · **con SQL** · **verificar con Jefferson**

`ROLE_ACTIONS` le da `editPatient` al terapeuta, pero `rls_policies.md:35` dice que `patients` INSERT/UPDATE es `is_admin() OR is_secretaria()`. Y **ninguno de los cuatro writes a `patients` verifica filas afectadas**.

**Consecuencia (si la RLS documentada sigue vigente).** Cada vez que un terapeuta edita la ficha (`savePatient`), pone un CIE-10 (`cie10.js:107`) o cambia el plan de sesiones (`plan.js:58`): la UI muta el objeto en memoria, muestra «Paciente actualizado correctamente» / «CIE-10 guardado» / «Plan actualizado», y **la base no cambia**. El dato vive hasta el próximo `loadAll` y desaparece. **Un diagnóstico o un CIE-10 corregido por el terapeuta se pierde sin que nadie se entere.**

Además la rama de edición **no toma snapshot**: con un error real ni siquiera se puede revertir, porque los valores viejos ya no están en memoria.

**Arreglo.** Dos cosas independientes. (1) `.select('id')` en los cuatro updates y tratar 0 filas como fallo. (2) **Decidir la fila real de la matriz**: o se amplía la policy de `patients` UPDATE al terapeuta, o se le quita `editPatient` del rol. `rls_policies.md` está exportado el 2026-06-07 y no se puede resolver desde el repo — **esta decisión es de Jefferson.** Y añadir snapshot + `Object.assign(p, prev)` en el fallo, como ya hacen `terapeutas.js:106-108` y `cie10.js:102-113`.

---

### SEG-03 — Cerrar un episodio clínico no tiene ningún control de rol
**`js/pacientes.js:382-394` y `408-426`** · Esfuerzo **S** · sin SQL · confianza alta

`nuevoEpisodio()` y `guardarNuevoEpisodio()` **no llaman a `hasPermission()` en ningún punto**, y sus tres botones de entrada tampoco tienen gate (`informes.js:631`, `informes.js:758`, `index.html:561` — este último fuera del div que sí está gateado). **Es la única acción clínica destructiva de la app sin guard de rol.**

**Consecuencia.** Una secretaria —que no tiene `registerSession` ni `deleteSession`— puede insertar una fila `Fin de episodio` en `session_log` y cambiar diag/sessions/status del paciente. Esa fila **es** la frontera de episodio: a partir de ella `doneActual()` cuenta desde cero, o sea que **resetea el conteo que alimenta facturación y el informe del paciente**, y no hay forma de deshacerlo desde la app (borrar sesiones es solo-admin).

Peor, se combina con SEG-02: si el terapeuta lo hace, el INSERT del marcador **sí** pasa (la RLS de `session_log` INSERT incluye al terapeuta) pero el UPDATE de `patients` **no**, y como no llega error **ni siquiera entra por la rama de rollback**. Queda un episodio cortado con el diagnóstico y el plan viejos.

**Arreglo.** Guard `hasPermission(...)` al inicio de **ambas** funciones (la segunda es invocable desde `window`), y envolver los tres puntos de render en el mismo chequeo. Además, invertir el orden: hacer el UPDATE de `patients` con `.select()` **primero** y solo insertar el marcador si tocó 1 fila.

---

### CORR-07 — Cerrar un episodio borra silenciosamente las sesiones pendientes de cobro
**`js/pacientes.js:408-426`** · Esfuerzo **S** · sin SQL · confianza alta

`guardarNuevoEpisodio` inserta el marcador sin comprobar ni avisar que el paciente tiene sesiones sin cobrar.

**Consecuencia.** Al abrir episodio nuevo, `doneActual`/`pendientesActual` solo cuentan filas con `date > fin` (`utils.js:645-656`): las sesiones del episodio viejo que quedaron sin cobrar **pasan a 0 y el paciente desaparece de «Listos para cobrar» para siempre**, sin toast ni registro. Ninguna pantalla vuelve a mostrarlas. Y el remate: el toast de plan completo (`sesiones.js:34`) le sugiere al terapeuta «Nuevo episodio» **en el momento exacto** en que hay un cobro de cierre pendiente.

**Arreglo.** Antes del insert, calcular `pendientesActual(p)` y si es >0 pedir confirmación explícita: «Este paciente tiene N sesiones sin cobrar; al iniciar el episodio nuevo dejarán de aparecer en Facturación».

---

### CORR-08 — El informe que va al médico mezcla episodios
**`js/ia.js:252`** · Esfuerzo **S** · sin SQL · confianza alta

El corte por episodio está escrito **dos veces**: `informes.js:578-591` recorta el log al episodio seleccionado, y `genPatientAI` arma su propio log **sin esa frontera**.

**Consecuencia.** En un paciente con al menos un «Fin de episodio», la narrativa clínica que la IA escribe —y que se imprime en el PDF/Word **que va al médico referente**— se redacta sobre **todas** las sesiones históricas, mientras la tabla, el gráfico EVA y el contador «X de N» del mismo documento muestran solo el episodio elegido. **El informe describe un tratamiento anterior como si fuera el actual.** El prompt ya es incoherente consigo mismo: la línea «Sesiones realizadas/prescritas» usa `doneActual(p)` (episodio actual) y el «HISTORIAL POR SESIÓN» de abajo lista todos los episodios.

**Arreglo.** Extraer el recorte a una función pura en `utils.js` (`logDeEpisodio(patient, epVal)`) y llamarla desde los dos sitios. Mínimo: que `genPatientAI` lea el `log` que ya calculó la pantalla (está en `_rptCtx`).

---

### CORR-09 — El .docx puede salir sin la narrativa clínica y decir que salió bien
**`js/realtime.js:142`** · Esfuerzo **S** · sin SQL · confianza alta

`_onPatient` repinta el informe ante el UPDATE de **cualquier** paciente, sin comprobar que sea el que está en pantalla — a diferencia de `_onSessionLog:171`, que sí compara el `pid`.

**Secuencia real y alcanzable:** (1) el terapeuta genera la narrativa IA y la ve; (2) pulsa «Exportar Word» y se abre `#firmante-modal`, un overlay opaco a pantalla completa — **no ve nada de lo que pasa detrás**; (3) en otra PC la secretaria edita un paciente cualquiera; (4) `realtime.js:142` → `renderPatientReport()` → `informes.js:568` arranca con `clearLastNarrative()` y `_lastNarrative` queda en `[]`; (5) el terapeuta exporta: `word.js:473` evalúa `narr && narr.length` en falso y **omite la sección entera**. Se manda al médico referente un informe de evolución **sin narrativa clínica**, y el toast dice «✓ .docx generado».

**Arreglo.** Cualquiera de los dos corta la secuencia: (a) comparar el id del paciente actualizado con el del selector antes de repintar, como ya hace la línea 171; (b) no repintar mientras haya un modal abierto.

---

### CORR-10 — Al reconectar, lo que se escriba durante el hueco se pierde para siempre
**`js/realtime.js:290-302`** · Esfuerzo **S** · sin SQL · confianza alta

`_doReconnect` hace el backfill **antes** de resuscribir: quita el canal (290), `await loadAll(true)` (294), y recién al final `subscribeRealtime()` (302).

**Consecuencia.** Entre que las 8 consultas devuelven y el canal nuevo llega a `SUBSCRIBED` **no hay ni socket viejo ni socket nuevo**: todo lo que se escriba en esa ventana se pierde, porque el próximo backfill solo ocurre en el siguiente resync. Y se pierde **con el punto en verde** «Tiempo real activo». Caso concreto: la pestaña de sala vuelve del foco, dispara el ciclo, y justo ahí recepción mueve una cita de 15:00 a 16:00 — el terapeuta se queda con la cita a las 15:00 indefinidamente.

**Arreglo.** Invertir el orden: `subscribeRealtime()` primero y `loadAll(true)` dentro del callback de `SUBSCRIBED`. Encaja con el flag `_needsResync` ya propuesto como RT-1 en `PROYECTO_ESTADO.md:1153`.

---

### CORR-11 — Se puede exportar al médico un informe que otro ya retiró
**`js/realtime.js:309-315`** · Esfuerzo **M** · **con SQL** (`alter publication`) · confianza alta

La tabla `informes` —PHI clínico— **no tiene suscripción realtime**: ni INSERT ni el UPDATE del borrado lógico. Se suscriben 7 tablas y ésta no está.

**Consecuencia.** En un segundo navegador: (a) no ve el informe que otro acaba de guardar, así que la tarjeta «Informes guardados» miente y se puede regenerar el mismo informe gastando créditos de IA; (b) **sigue viendo un informe que otro ya borró**, y «PDF» lo exporta igual, porque `exportarInformeGuardado` arma el PDF desde el snapshot local sin tocar la DB: **se entrega al médico referente un informe clínico retirado**. Los tres roles llegan a esa pantalla. No se cura con el TTL: dura hasta un F5 o hasta que la pestaña se oculte >10 s. Una pestaña de sala en un segundo monitor puede quedar así toda la jornada.

**Arreglo.** Suscribir `informes` con un handler que trate INSERT como unshift y UPDATE con `deleted=true` como remoción. Mínimo aceptable si no se cablea: que `exportarInformeGuardado` revalide contra la DB antes de abrir el PDF.

---

### SEG-04 — Sacar la historia clínica de la clínica no deja ningún rastro
**`js/informes.js:992-999`** (y `informes.js:968`, `excel.js:405`, `foto.js:358`) · Esfuerzo **L** · **con SQL** · confianza alta

`audit_log` solo se dispara con DML de Postgres (verificado: `audit_log.sql:170-185` engancha un trigger AFTER INSERT/UPDATE/DELETE en 8 tablas). **Una exportación no escribe nada, así que no genera ni una fila.**

**Consecuencia.** La rendición de cuentas LOPDP de esta app **es** `audit_log` — es el argumento con el que se justificó dejar el SELECT abierto entre roles. Pero el acto que de verdad saca los datos de la clínica —un `.docx` con cédula, diagnóstico, CIE-10, notas clínicas y narrativa IA; un `.xlsx`/PNG con hasta ~90 nombres— **no deja huella**. Hoy, si un terapeuta que renuncia se lleva el informe de 40 pacientes en Word, no hay forma de saberlo ni de probarlo. Guardar el informe (INSERT en `informes`) sí queda auditado; **exportar, que es lo que produce la copia que sale, no.**

**Arreglo.** Un helper único `registrarExport({tipo, patientId|rango, n})` llamado desde los cuatro puntos de salida. Más barato aún: **agregar la tabla nueva al array de `audit_log.sql:177`** y dejar que el trigger ya escrito haga el resto — no hay que escribir función nueva.

*(Hermano de este: **`api/informe.js:89-109`** — el envío a Anthropic tampoco deja entrada en `audit_log`. MEDIO, mismo arreglo.)*

---

### SEG-05 — Cualquier terapeuta puede reescribir o resucitar el informe firmado por otro
**`rls_policies.md:47`** · Esfuerzo **L** · **con SQL** · confianza alta

La policy de UPDATE de `informes` valida **solo el rol**, no la autoría ni el campo `deleted_by` — y el cliente manda `deleted_by` desde `state.currentUserId` (`informes.js:1081`), un valor elegido por el cliente.

**Consecuencia.** Con una llamada directa al REST, un terapeuta puede reescribir la `narrativa` y el `snapshot` del informe de otro, marcarlo `deleted=true`, **resucitar uno ya borrado** poniendo `deleted=false`, y **atribuir el borrado a otra persona**. Es PHI bajo LOPDP y el campo de autoría deja de ser confiable. `audit_log` sí lo registra (está en el array de `audit_log.sql:177`), así que es reconstruible — pero no está prevenido. Documentado como hardening H-2 desde junio.

**Arreglo.** Acotar `informes_update` a `created_by = auth.uid() OR is_admin()`, con `WITH CHECK` que fuerce `deleted_by = auth.uid()` y no permita pasar de `deleted=true` a `false` salvo admin. `created_by` con `DEFAULT auth.uid()`.

---

### CORR-12 — El botón de WhatsApp del no-show no funciona
**`js/resumen.js:188-191`** · Esfuerzo **XS** · sin SQL · confianza alta

```js
const num = (tel || '').replace(/[^0-9]/g, '');
window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
```
Sin el código de país 593.

**Consecuencia.** El botón «WhatsApp» de «No asistieron» —**la acción diaria de la secretaria para recuperar un no-show**— abre `wa.me/0991234567`, que WhatsApp rechaza con «el número compartido por url no es válido». Desde la app parece que funcionó (se abre pestaña nueva), así que **falla en silencio**. Afecta a prácticamente todos los pacientes: el placeholder del campo (`index.html:627`) es `0991234567` y así se cargan en Ecuador.

**Arreglo.** Normalizar igual que ya hace `informes.js:294`: `'593' + String(tel||'').replace(/[^0-9]/g,'').slice(-9)`. Mejor: extraer a un helper en `utils.js` y usarlo en los dos sitios.

---

### DATOS-02 — No hay ninguna detección de truncamiento en todo el repo
**`js/auth.js:60`** · Esfuerzo **XS** · sin SQL · confianza alta

```js
for(const q of [th,doc,pat,appt,prot,cob,inf,blk]){ if(q.error) throw q.error; }
```
Es el **único** chequeo sobre las 8 respuestas. Una respuesta truncada por `max-rows` llega con HTTP 200 y `error: null`.

**Consecuencia.** El día que cualquiera de las 8 tablas cruce el techo, la app pierde filas sin un toast, sin un warn y sin un test que lo agarre. Confirmado por grep: **cero** ocurrencias de `.range(`, `.limit(`, `count:`, `head:` o `Content-Range` en `js/` y `api/`, y ninguno de los 21 tests menciona `loadAll`. La clínica se enteraría solo por el síntoma —una cita que se evapora— y lo más probable es que se lo atribuya a un error humano de recepción.

**Arreglo.** `select('*,patients(name)', {count:'exact'})` y comparar `count` contra `data.length`; si difieren, `console.warn` + `toastErr`. **Son ~4 líneas dentro del try de `loadAll` y no cambia ningún render.** Es el seguro barato para DATOS-01.

---

### Invariantes de base de datos que el cliente asume y el repo no puede probar

El único `create table` de todo el repo es el de `audit_log`. **No hay ni una FK, ni un `ON DELETE CASCADE`, ni un `UNIQUE` versionado.** Estos cuatro son ALTO porque el cliente ya depende de ellos:

| ID | Archivo | Invariante asumido | Qué pasa si no existe |
|---|---|---|---|
| **DB-01** | `js/facturacion.js:309` | `cobros.cobro_ref` UNIQUE | El nº de factura se genera en memoria del cliente (`'F'+(++state.facturaCounter)`). Dos pestañas con la misma carga generan el mismo `F00X`. **Sin UNIQUE** ambos inserts pasan: dos cobros con la misma etiqueta, la contabilidad externa no los distingue, y la app diverge (realtime deduplica por `cobro_ref` y descarta el segundo; al recargar los mapea los dos y `pendientesActual` resta el doble). Ya está identificado como I-7 en `PROYECTO_ESTADO.md:14`. |
| **DB-02** | `js/sesiones.js:355` | `session_log` UNIQUE en `(patient_id, date, hour)` | Cuatro puntos del código lo tratan como identidad. La única defensa es `_savingSession`, una variable de módulo: protege contra dos clics en la misma pestaña, **no protege nada entre dos navegadores**. Dos personas completando la misma cita crean dos filas → `doneActual` cuenta de más → se sobre-factura. **⚠️ Aviso para quien lo arregle: un UNIQUE plano ROMPERÍA la app** — «Fin de episodio» (`pacientes.js:415`) y «Evaluación inicial» (`pacientes.js:524`) se insertan ambos con `hour='00:00'` y pueden caer el mismo día para el mismo paciente. El índice tiene que ser parcial. |
| **DB-03** | `js/pacientes.js:303-305` | 4 FK con `ON DELETE CASCADE` | Solo afirmado en prosa (`PROYECTO_ESTADO.md:1365`). Dos de las cuatro sí están probadas de rebote (el embedding de PostgREST en `auth.js:53-54` no funcionaría sin FK); **de `cobros` e `informes` no hay ninguna prueba**. Si falta el cascade: (a) el delete falla, pero el estado ya se mutó y no se revierte → «paciente eliminado» y al recargar reaparece entero; (b) sin FK, quedan filas de cobros/informes huérfanas, invisibles para siempre, y **el borrado LOPDP queda incompleto**. |
| **DB-04** | `js/auth.js:57` | `informes.deleted` NOT NULL DEFAULT false | El insert nunca lo escribe y la carga filtra con `.eq('deleted',false)`. Si fuera nullable sin default, la fila nace con `deleted=NULL`, que **no matchea `= false`** en Postgres: el informe se ve bien en la sesión y **desaparece del histórico en la siguiente recarga**. Es PHI que el usuario cree tener guardada. La tabla `informes` se corrió a mano y no está versionada — lo admite `PROYECTO_ESTADO.md:1411`. |

**Arreglo común:** volcar el esquema real (`pg_dump --schema-only`) a un `.sql` versionado y re-exportar `pg_policies`. Es un lote propio y va antes que cualquier arreglo que dependa de estos invariantes.

---

## 🟡 MEDIO — 94 hallazgos

Deuda que va a doler. Agrupados por tema; cada línea es un hallazgo con su `archivo:línea`.

### Escrituras optimistas sin rollback *(el lote R-7 quedó a medias)*

`terapeutas.js` y `cie10.js` **sí** tienen el patrón correcto (snapshot + `Object.assign` de vuelta). Estos módulos quedaron fuera:

- **`js/doctores.js:77-91`** (S) — `saveDoctor` no revierte ni en `if(error)` ni en el catch. El doctor fantasma queda en el `<select>` con id numérico; asignarlo manda `doctor_id:"7"` a una columna uuid y **rompe el guardado del paciente**.
- **`js/doctores.js:97-106`** (S) — `deleteDoctor` **no aborta** si falla el UPDATE que desasocia pacientes: toastea y borra el doctor igual. En memoria los pacientes quedan «Independiente», en la base conservan el referente.
- **`js/protocolos.js:63-77`** (S) — mismo patrón; protocolo fantasma asignable con id numérico.
- **`js/protocolos.js:139-143`** (XS) — `deleteProtocol` lanza el borrado **sin `await`** y sin rollback.
- **`js/bloqueos.js:165-169`** (S) — `deleteBlock` llama a `dbDeleteBlock` **sin `await`**. Si falla, la franja de vacaciones desaparece de la agenda y **la app deja agendar ahí**: se vende una hora en la que el terapeuta no está.
- **`js/terapeutas.js:157-161`** (S) — `deleteTherapist` borra de memoria antes; su catch es **código muerto** porque `dbDeleteTherapist` (`auth.js:307-311`) ya se traga el error y devuelve void.
- **`js/pacientes.js:297-307`** (S) — `deletePatient` saca de memoria paciente + todas sus citas + todos sus informes antes del DELETE; con RLS o red caída **el terapeuta no ve al paciente que tiene que atender**.
- **`js/agenda.js:289-296`** (XS) — el drop no guarda la posición anterior. Slot viejo aparece libre → **dos pacientes citados a la misma hora**.
- **`js/agenda.js:395-404`** (XS) — `cycleStatus` no revierte; de ahí cuelgan el badge de facturación y la conciliación QuickBooks.
- **`js/agenda.js:443-449`** (XS) — `delAppt` no repone la cita; además **no tiene try/catch**: con la red caída el await se rechaza sin handler y no sale ni toast de éxito ni de error.
- **`js/agenda.js:731-753`** (S) — la rama de edición de `saveAppt` pisa 9 campos sin copia previa.
- **`js/pacientes.js:413-422`** (S) — `guardarNuevoEpisodio` hace dos escrituras no atómicas: si la segunda falla, el marcador queda huérfano y **no se borra**.

### Realtime y re-renders

- **`js/realtime.js:97`** (S) — **sin coalescing**: `conciliarDia` hace un UPDATE que toca todas las confirmadas del día → un evento por fila → **~20-30 `renderGrid()` seguidos** en cada navegador abierto.
- **`js/realtime.js:180-195`** (S) — `_onCobro` es el **único** de los 7 handlers con una sola rama (INSERT). Como la app no tiene UI para corregir un cobro, las correcciones se hacen desde Supabase Studio — y **nunca llegan** a las otras pantallas.
- **`js/realtime.js:309-315`** (S) — `protocols` tampoco está suscrito.
- **`js/realtime.js:349-357`** (S) — cada vuelta al foco tras 10 s oculta re-descarga **las 8 tablas enteras** saltándose el TTL. En un PC que alterna con WhatsApp todo el día, es el multiplicador que convierte los problemas de payload en dolor diario.
- **`js/realtime.js:37`** (XS) — el eco local se marca **antes** de la escritura y nada lo limpia si falla.
- **`js/agenda.js:130`** (S) — **`renderGrid()` no es un render**: arranca llamando a `checkAutoNoas()`, que muta el estado y dispara UPDATEs. En una cita pasada, el click en el punto salta de `conf` directo a `noas` porque el render la re-muta antes de que `cycleStatus` lea el estado.
- **`js/agenda.js:116-127`** (S) — `checkAutoNoas` recorre **todas** las citas del state y marca `noas` desde cualquier rol, incluido el terapeuta, que por RLS solo puede escribir las suyas.
- **`js/agenda.js:865`** (XS) — `populateThFilter` memoiza sobre el **número** de terapeutas: cambiar un nombre nunca llega al desplegable.

### El foco que se pierde mientras se escribe *(los tres son el mismo síntoma)*

- **`js/facturacion.js:195`** (S) — el `input` del buscador re-renderiza el contenedor **que lo contiene**: se destruye y recrea en cada tecla. La segunda letra no llega a ningún lado. **El buscador de la pantalla de cobros es inusable.**
- **`js/historial.js:168`** (XS) — `renderHistorial()` reescribe `#hist-search` con el nombre del paciente ya cargado, y se dispara desde realtime: **borra lo que la secretaria está tecleando**.
- **`js/patient-combo.js:112`** (S) — `setValue()` pisa el input sin comprobar si tiene el foco; `historial.js:167` lo llama en cada render.

### Dinero

- **`js/agenda.js:101-104`** (XS) — el badge del sidebar **no cuenta el cobro de cierre** que la pantalla de Facturación sí lista. Con planes de 12/8/18/24 sesiones (la mayoría de los protocolos por defecto) **la última factura de cada paciente es invisible desde el menú**.
- **`js/facturacion.js:205, 328`** (S) — Facturación usa un umbral **global** (input oculto, valor 5) mientras el badge y el aviso de sesión usan el **por paciente** (`billing_ses_per_factura`). Para cualquier paciente con umbral distinto de 5, los dos caminos se contradicen.
- **`js/facturacion.js:308`** (XS) — `emitirFactura` **no valida `n>0`**: un doble clic en «Cobrar todos» escribe filas con `n_sessions=0` y `cobro_ref` duplicado.
- **`js/utils.js:656`** (M) — **R-9 sigue vivo**: `Math.max(0,...)` esconde el sobre-cobro. Un paciente cobrado de más desaparece de Facturación y **sigue desaparecido** hasta acumular tantas sesiones nuevas como las cobradas de más. Ningún sitio del código avisa.
- **`js/sesiones.js:222, 400`** (XS) — `showBillingAlert` se dispara sin comprobar el rol: al terapeuta, que no tiene la pestaña, se le planta un `confirm()` bloqueante; si dice que sí, lo rebotan a la agenda.

### Fechas y zona horaria (UTC-5)

- **`js/word.js:232`** (XS) — **la única excepción del repo**: `new Date().toISOString().slice(0,10)` en UTC. **Desde las 19:00 hora de Quito el `.docx` sale fechado con el día siguiente**, mientras el PDF y la pantalla usan hora local. El mismo informe lleva dos fechas distintas, y va firmado al médico referente.
- **`js/informes.js:30`** (S) — `created_at` llega en UTC y se filtra por prefijo de string. Un paciente registrado el 31 de agosto a las 19:30 **no cuenta en agosto y cuenta de más en septiembre**, y el prompt de la IA recibe el mismo error.
- **`js/agenda.js:475`** (XS) — `setMonth(getMonth()+d)` sobre una fecha que conserva el día: parado en un 31, el botón «›» **salta de agosto a octubre**. Septiembre nunca se muestra.
- **`js/state.js:19-20`** (M) — `currentDate` se fija con `new Date()` al cargar el módulo y **nada lo revalida nunca**. El PC de recepción deja la pestaña abierta toda la noche; a la mañana la agenda sigue mostrando el día anterior, y el modal de cita precarga la fecha vieja sin que salte el guard de fecha pasada.

### Fórmulas duplicadas *(el patrón que ya causó el bug de continuidad)*

- **`js/agenda.js:102` vs `js/facturacion.js:207-219`** (S) — «listo para cobrar» escrito dos veces con **umbral distinto** → CORR/dinero, ya listado arriba.
- **`js/protocolos.js:149` vs `js/informes.js:614`** (M) — «adherencia/continuidad» sobre **universos distintos**. Además, como todas las escrituras de `session_log` ponen `status:'asistió'`, numerador = denominador y **las dos dan 100% fijo siempre**.
- **`js/informes.js:560` y `592`** (S) — la nota de «Fin de episodio» se parsea a mano en dos sitios **pese a que `utils.js:619` ya tiene `parseFinNote()` testeada** y `historial-calc.js` sí la usa. El desplegable y el encabezado pueden mostrar diagnósticos distintos para el mismo episodio.
- **`js/informes.js:131, 390, 417, 430`** (S) — el % de inasistencia escrito **cinco veces**, siendo el complemento exacto de `resumenCitas().continuidad`, que sí está factorizada.
- **`js/informes.js:577` y `596`** (XS) · **`js/informes.js:30`** (XS) · **`js/seguimiento.js:48-51`** (XS, **colisiona de nombre** con la `fmtFechaCorta` de `utils.js:213`, que devuelve otro formato — trampa cargada) · **`js/sesiones.js:210-214` y `377-388`** (XS) · **`js/search.js:28`** (XS, iniciales en 4 sitios) · **`js/agenda.js:165`** (XS, capacidad en slots) · **`js/agenda.js:150, 921, 1028`** (S, meses y días hardcodeados en 6 y 5 sitios).

### Rendimiento

- **`js/utils.js:505-528`** (S) — `capacidadSlots` es O(días × slots × terapeutas × bloqueos). **Medido con node**: ~40 ms hoy, **267 ms con 800 bloqueos, 358 ms con 1500**. Una laptop de recepción es 2-4× más lenta. Abrir Informes → Anual va a congelar el navegador en 2-3 años. Arreglo: un `Map` fecha→bloqueos construido una vez antes del reduce.
- **`js/utils.js:692-706`** (S) — `ordinalesDeCitas` re-ordena **todas** las citas históricas en cada render de la agenda, aunque se pinten ~50 tarjetas. Medido: 12,3 ms por render hoy.
- **`js/auth.js:73`** (XS) — `cobData.filter()` sobre todos los cobros por cada paciente: O(pacientes × cobros). 1,9 ms hoy; los dos factores crecen.
- **`js/agenda.js:782-790`** (S) — **el único N+1 del repo**: un `await insert` secuencial dentro del bucle de recurrencia, hasta 84 requests. Arreglo: un solo `insert(filas).select()`.
- **`js/auth.js:53`** (M) — `patients.select('*,session_log(*)')` embebe **todo el histórico clínico** de los 190 pacientes en una request: ~2.500 filas hoy, ~10k/año, y se re-descarga entera en cada refoco.
- **`js/auth.js:57`** (S) — `informes.select('*')` trae `narrativa` + `snapshot` de todos los informes en cada carga, **y el snapshot lleva un PNG en base64 del gráfico EVA**. Arreglo: seleccionar solo las 7 columnas que consume la lista.
- **`index.html:823`** (S) — **Chart.js 4.4.0 (~200 kB) se carga desde cdnjs en toda carga**, con `<script>` clásico **bloqueante**, aunque solo lo usa Informes. No estaba contado en los 494 kB.
- **`js/pdf-logo.js:3`** (M) — el logo en base64 son **26,9 kB crudos / 20,6 kB gzip = el 13,4%** del JS que descarga todo el mundo, para una imagen que solo se usa al exportar. Y Vite **ya emite el mismo PNG como asset aparte**: la misma imagen viaja dos veces.
- **`js/main.js:68-69`** (M) — toda la cadena de exportación (`excel` + `foto` + `excel-layout` + `export-datos` ≈ 21 kB) y `word.js` (~16 kB) entran **estáticos**, aunque su puerta de entrada está gateada a admin/secretaria.

### Accesibilidad *(la secretaria usa esto 8 horas al día)*

- **`js/agenda.js:301-302, 310, 343-344`** (M) — la tarjeta de cita, el punto de estado y el slot vacío son `<div>` con listener de click, **sin `tabindex`, sin `role` y sin teclado**. Los pasos 2 y 3 del flujo diario son **imposibles sin ratón**: la agenda entera es un agujero negro para el tabulador.
- **`js/main.js:152-154, 166-170`** (M) — al abrir un modal **no se mueve el foco, no hay focus trap y al cerrarlo no se devuelve**. Con el fondo al 75 % de opacidad, Tab lleva el foco a controles invisibles de detrás: las pulsaciones caen en botones que no se ven.
- **`js/search.js:22-25`** (S) — los resultados del buscador global son `<div>` sin teclado. **Es el paso 1 del flujo diario**: la secretaria escribe el nombre con las dos manos y tiene que soltar para agarrar el ratón.
- **`js/cie10.js:75`** (S) — los resultados CIE-10 usan `onmousedown` sobre un `<div>`: con teclado **no hay forma de elegir un diagnóstico**.
- **`css/layout.css:48, 51`** (S) — varios inputs y selects llevan `outline:none` **sin ninguna regla `:focus` que lo sustituya**, y no existe `:focus-visible` en las 2213 líneas de CSS.
- **`css/layout.css:16, 32`** (XS) — la badge de contadores es blanco sobre naranja = **2,03:1 a 9,5 px**. Es justamente el número que dice «N citas pendientes de registrar». Las flechas de día: 2,62:1.
- **`css/screens.css:33, 47-48`** (XS) — `opacity:.8` a 10 px baja el subtítulo de la cita a 3,5-3,7:1; en la cita ya pasada a QuickBooks, **2,33:1**.
- **`css/screens.css:49`** (XS) — el punto que cambia el estado mide **9×9 px** en escritorio, y errar el clic **abre el modal de edición** en vez de no hacer nada.

### Otros MEDIO

- **`js/auth.js:136-158`** (XS, seguridad) — tras el login, `#login-pass` **nunca se limpia**: la contraseña en texto plano queda viva en el DOM toda la sesión. En la PC compartida de recepción —el modelo de amenaza que el propio código declara en `auth.js:268-269`— cualquiera la lee desde DevTools. **Una línea.**
- **`index.html:823`** (XS, seguridad) — Chart.js desde cdnjs **sin SRI ni `crossorigin`**, en el mismo origen donde vive la sesión de Supabase.
- **`index.html:418` y `:438`** (XS, **funcionalidad rota**) — los buscadores de Terapeutas y Doctores llaman por `oninput` a `renderTherapistList()`/`renderDoctorsList()`, pero `main.js` solo las pone en `window._app`, **nunca en `window`**: el handler lanza `ReferenceError` y **el filtro nunca corre**. Escribir no filtra nada y no avisa nada.
- **`js/ia.js:255-263, 283-284`** (M, LOPDP) — los tres campos de texto libre que van al prompt de paciente salen **sin ningún filtro**. El prompt se rotula «anonimizado» e instruye al modelo a no usar el nombre, pero **eso no anonimiza la entrada**: si el terapeuta escribió «Mariana refiere dolor al cargar a su hijo», ese identificador sale a EE.UU. igual.
- **`js/word.js:588`** (XS, LOPDP) — el nombre del paciente viaja **en el nombre del archivo**: `informe-juan-perez-1234.docx`. Se lee en la lista de adjuntos del correo y en la notificación de WhatsApp **antes de abrir nada**.
- **`js/informes.js:637`** (S) — el nº de informe no incluye el episodio: dos informes del mismo paciente el mismo día salen con **el mismo número y el mismo nombre de archivo**.
- **`js/export-datos.js:33`** (M) — reexportar un mes pasado después de que el paciente abrió episodio nuevo deja **la columna N° vacía**.
- **`js/validators.js:11`** (S) — el campo se rotula «Cédula / RUC» pero el validador exige **exactamente 10 dígitos**: un RUC o el pasaporte de un paciente extranjero se rechazan y bloquean el guardado.
- **`js/validators.js:30`** (XS) — `validateTelefono` solo hace `trim()`: pegar «+593 99 123 4567» desde WhatsApp **se rechaza**.
- **`js/resumen.js:203-207`** (XS) — `genResumenDiaAI` ignora el filtro por terapeuta: la pantalla dice 6 citas y la IA habla de 34.
- **`js/patient-combo.js:58-61`** (S) — el combo busca con `toLowerCase()` plano, **sin quitar tildes y sin buscar por cédula**, al revés que el resto de la app. En el Historial, «maria», «rodriguez» y «munoz» no encuentran nada.
- **`js/historial-calc.js:34-40`** (L) — para un episodio cerrado el `plan` sale de `parseFinNote`, que devuelve las sesiones **hechas**, no las prescritas: el chip muestra «3/8» con numerador y denominador de fuentes distintas.
- **`js/informes.js:463-544`** (S) — 82 líneas que **son una copia** del combo ya factorizado en `patient-combo.js`; el propio módulo lo documenta como deuda.
- **`js/main.js:218-222`** (S) — `initApp` descarta el retorno de `loadAll()`: si la carga inicial falla, se oculta el overlay y se pinta sobre un state vacío.
- **`js/realtime.js:292-301`** (S) — el resync ignora el `{error}` de `loadAll(true)` y su catch solo hace `console.warn`; el punto vuelve a **verde** con la agenda de antes.
- **`js/agenda.js:776-778`** (S) — la config de recurrencia se lee del DOM **después** del await, con el modal ya cerrado: si el usuario abre otra cita en ese lapso, **la serie nunca se crea**.
- **`js/agenda.js:109-112`** (S, alerts) — `showBillingAlert` usa `confirm()` como **notificación** y ofrece navegar a una pestaña que el terapeuta no puede abrir.
- **`js/agenda.js:441`** (M, alerts) — **no existe ningún helper de confirmación propia**: las 10 acciones destructivas dependen del `confirm()` nativo. Todas fallan cerradas (correcto), pero la rama del «no» no da ningún feedback.
- **`js/auth.js:70` y `:78`** (M, nombres) — **`hour` designa dos tipos incompatibles**: en `appointments` es decimal (9.5 = 9:30), en `session_log` es string (`'09:00:00'`). Ya causó un bug en producción (R-5). Cualquier código nuevo que cruce las dos listas rompe en silencio.
- **`js/permissions.js:33`** (L) — `profiles.role` es un enum de facto sin CHECK: un `'Secretaria'` con mayúscula deja al usuario logueado y **sin nada**.
- **`js/agenda.js:722` / `:764-767`** (L) — el control de solape es **solo cliente**, contra un state que puede tener 5 minutos: dos puestos agendando a la vez dejan al terapeuta con dos pacientes a la misma hora, **y la grilla ni lo muestra**.
- **`js/pacientes.js:129`** (L) — la detección de cédula duplicada también es solo en memoria.
- **`js/terapeutas.js:154-160`** (M) — el guard de borrado solo mira `appointments`: un terapeuta con sesiones históricas o bloqueos **pasa el guard**.
- **`rls_policies.md:3` y `:10-23`** (XS-L) — el documento que el repo llama «fuente de verdad revisable» está congelado el 2026-06-07: **no incluye `therapist_blocks`** (creada en septiembre) ni las policies de `informes`, corridas a mano.
- **`rls_policies.md:41`** (L) — el UPDATE de `session_log` está abierto a los tres roles **sin restricción de autor**: cualquier terapeuta puede reescribir la nota clínica y el `therapist_id` de una sesión atendida por otro.
- **`audit_log.sql:176-178`** (M) — **`therapist_blocks` no está en el array del trigger**: borrar un bloqueo no deja rastro, y es justo lo que descuenta capacidad.
- **`PROYECTO_ESTADO.md:1349`** y **`js/informes.js:1074-1090`** (S-L, LOPDP) — no existe política de retención ni vía de purga: un informe «eliminado» vive indefinidamente, y como `informes` está en el trigger de auditoría, **un borrado lógico multiplica el PHI por tres** (fila viva + `old_data` + `new_data`), cada copia arrastrando el PNG del snapshot.

### Tests que faltan, ordenados por daño

- **`js/permissions.js:32-40`** (XS) — `hasPermission`/`canAccessTab`, **la única compuerta de rol del cliente, no tiene ni un test.** Mover una acción al array equivocado pasa los 335 tests. → `test/permissions.test.js` con la matriz como tabla literal.
- **`js/utils.js:336-339`** (XS) — `normHour` es la **clave de join** entre cita y sesión en cuatro sitios y no tiene test. Si se rompe, se rompen a la vez `hasSession`, la deduplicación y el realtime.
- **`js/agenda.js:845-859`** (XS) — `getRecDates` es pura, exportada y sin test, siendo el generador de fechas de toda serie recurrente.
- **`js/ia.js:194-220`** (S) — `_parseNarrative`, de donde sale literalmente el cuerpo del informe que va al médico, no está exportado ni testeado.
- **`js/utils.js:563-582`** (XS) — `getDisplayAge`/`getFullAge` leen `new Date()` por dentro: **no son testeables de forma determinista**, y alimentan la ficha, el PDF, el `.docx` y el prompt de la IA.
- **`test/utils.test.js:90-96`** (M) — **el test del recorte por episodio no importa la lógica de producción: la re-implementa** en un helper local. Verifica la copia, no el original. Mismo patrón en otro test.

---

## 🔵 BAJO — 39 hallazgos

**Código muerto confirmado** (todo verificado uno por uno, no por grep a secas):
`js/agenda.js:1065-1108` `exportAgendaCSV` — 44 líneas sin caller desde el rediseño `82952b3`; ojo, `PROYECTO_ESTADO.md:1756` la lista como viva · `js/informes.js:99` `pctColor()` — la única función privada sin uso de las 9854 líneas · `js/informes.js:3` y `js/main.js:22` — dos imports sin uso · `js/main.js:78-115` — 10 claves de `window._app` que nadie consume · `js/utils.js:88` — 30 símbolos con `export` innecesario (bloquean el tree-shaking) · `index.html:104` — 7 ids huérfanos.

**CSS muerto** (~81 líneas, verificado contra Día **y** Semana como pedía el encargo):
`css/rehactiva-theme.css:68-81` — las 12 clases `.ca`–`.cl` de color de terapeuta están muertas (los colores van por `style` inline), **y es una trampa activa**: los ids de `COLOR_OPTIONS` son literalmente `'ca'…'cl'`, así que el bloque *parece* el sitio donde se cambian · `css/responsive.css` (6 bloques, ~56 líneas) · `css/screens.css` (4 bloques, ~17 líneas) · `css/components.css:13-14, 20` (3 líneas).
⚠️ Al borrar `css/rehactiva-theme.css:104`: el selector es compartido y `.bar-fill` **sí** está vivo — se quita el token `.prog-fill,`, no la línea.

**Resto:** `js/excel.js:269` catch vacío que descarta el logo del `.xlsx` sin avisar · `js/foto.js:65-67` la foto ignora el filtro por terapeuta en el nombre del archivo · `js/agenda.js:182` la píldora dice «hoy» esté donde esté la agenda · `js/agenda.js:299` `dragData` sin `dragend` · `js/sesiones.js:166` error de SELECT ignorado en `genUniqueHour` · `js/ia.js:262` se envía la fecha calendario exacta de cada sesión (cuasi-identificador) · `js/doctores.js:96` y `js/protocolos.js:139-144` confirmaciones que no dicen cuántos registros · `package.json:8` no hay `vite.config.js`, así que supabase-js (48,9 kB gzip, el 32 % del inicial) **se re-descarga en cada deploy** · `index.html:482-484` 51 labels sin `for` (clic en la etiqueta no enfoca el campo) · `js/state.js:7, 23-29` el prefijo `informes` cubre dos features distintas · y 15 más de nomenclatura y comentarios desactualizados.

---

## ⚫ Los 10 hallazgos que los refutadores TUMBARON

Se listan porque saber qué **no** está roto vale tanto como saber qué sí, y porque estas cinco son las trampas en las que caería cualquiera que audite este repo sin leer las librerías.

| Afirmaba | Por qué se cae |
|---|---|
| `pacientes.js:414-421` — sin try/catch, la promesa se rechaza sin handler | **supabase-js v2 no lanza** en errores de red: devuelve `{error}`. No hay promesa rechazada, y el fallo no es silencioso. |
| `pacientes.js:153-161` — el UPDATE de edición no está en try/catch | La observación estructural es cierta (el único `try` del archivo cubre solo el alta), pero **la consecuencia es falsa**, por lo mismo. |
| `realtime.js:290` — catch vacío que pierde la referencia al canal | El texto es literal, pero `removeChannel` de la librería **no puede dejar el canal colgado**, y `realtimeChannel=null` en la línea siguiente es el comportamiento deseado. |
| `pacientes.js:202-206` — el catch del alta cubre el `else` post-insert | `loadAll` **no puede lanzar**: todo su cuerpo va dentro de su propio try. |
| `utils.js:760-874` — el bloque de Seguimiento debería salir a su módulo | La descripción es exacta pero la dependencia hace que el corte no compense; se descarta. |
| `utils.js:650` — «pendientes» nombra dos cosas en el mismo archivo | Los dos sentidos **no conviven en ningún archivo**: `pendBefore` *es* `pendientesActual`. |
| `historial-calc.js:129` — dos definiciones de `pend` en el mismo módulo | Los hechos son literales pero **no son un defecto**: son dos vistas deliberadas del mismo estado. |
| `pacientes.js:296` — el confirm promete borrado total y `audit_log` conserva la fila | Las citas son exactas pero el confirm es una **guarda de UI**, no una declaración legal de retención. Lo real de esto está en el MEDIO de retención. |
| `informes.js:1080-1082` — un informe borrado sigue legible por la RLS abierta | La RLS de SELECT abierta es **decisión tomada** y estaba excluida del encargo. |
| `informes.js:1055-1058` — no hay forma de retirar un informe guardado | **El botón ya existe**, 16 líneas más abajo de donde miró el auditor. |

**Tres quedaron «dudosos»** (un refutador los tumbó y otro no) y se reportan con esa etiqueta, no como hechos: `agenda.js:445-449`, `pacientes.js:394-421`, `api/informe.js:80-101`.

---

# A) Los 5 que arreglaría primero

No están elegidos por severidad nominal. El criterio es **daño actual × frecuencia real × coste de arreglarlo × coste de esperar**.

### 1. CORR-06 — el SELECT sin chequear error de `sesiones.js:355-361`
**Una línea.** Es lo primero porque es la única pieza de la familia «sesión duplicada» que **se arregla sin tocar Supabase y sin decidir nada con nadie**, y porque el daño que evita es acumulativo y creciente: en cuanto haya dos filas para un slot, cada nuevo «Completar sesión» inserta una más. No se estabiliza. Cada día que pasa hay más filas malas que limpiar después, y cada fila mala es una sesión que se cobra.

### 2. CORR-04 + el SQL de limpieza — el bug de `hour`
Es el que el cliente **ya sospecha** y el que está corrompiendo datos hoy. Va segundo y no primero solo porque el arreglo de código sin la limpieza de datos deja el problema a medias: los duplicados ya escritos desde agosto siguen inflando `done` y la facturación. **El orden importa: primero listar los duplicados existentes, borrarlos a mano, y después arreglar el código** — al revés, se arregla la causa y se convive con el efecto sin saber cuánto es.

### 3. DATOS-02 — las 4 líneas de detección de truncamiento en `auth.js:60`
Cuesta cuatro líneas, no cambia ningún render, y es el **seguro** de DATOS-01. Va antes que el arreglo de paginación en sí porque hoy no sabemos si el techo de 1000 está activo: esto lo convierte en algo que la app *dice*, en vez de algo que hay que ir a mirar al dashboard. Un problema que grita deja de ser crítico; uno que calla, no. Y si resulta que el techo ya está subido, este arreglo sigue valiendo para el día en que alguien restaure un backup.

### 4. CORR-01 — `.select()` en `commitApptChange`
Es el fallo silencioso de **la pantalla que más se usa**, confirmado por cuatro auditores independientes, y su arreglo es el mismo patrón repetido tres veces. Está por encima de SEG-01 (el gate de permiso que falta) porque el gate solo tapa el caso del terapeuta, mientras que verificar filas afectadas tapa **también** el fallo de red y el de RLS futura — y porque sin este arreglo, poner el gate haría el problema *menos* visible, no más.

### 5. CORR-02 — `.select('id').single()` en el bucle de recurrentes
**XS de esfuerzo y cierra cuatro efectos de un golpe**: el no-op silencioso al editar, el borrado que no borra, la duplicación por realtime y los contadores inflados. Ningún otro arreglo de la lista tiene esta relación entre una línea de código y cuatro modos de fallo distintos. Y toca el flujo de «agendar una serie», que es cómo se agenda un tratamiento entero.

**Por qué no están los otros.** DATOS-01 (paginación) es más grave sobre el papel, pero necesita primero el dato del dashboard: arreglarlo a ciegas es escribir paginación que quizá no hace falta. RT-01/RT-02 son CRÍTICOS pero **RT-02 depende de una verificación en Supabase** (`relreplident`) y RT-01, aunque es XS y va en el mismo lote, requiere dos navegadores para probarlo. SEG-02 y SEG-03 son huecos de permisos reales, pero **SEG-02 es una decisión de Jefferson, no un arreglo**: hasta saber si el terapeuta debe o no poder editar pacientes, cualquier código que se escriba puede ser el equivocado.

---

# B) Lotes ejecutables

Cada lote entra en **un commit auditable de un vistazo**. Ordenados; las dependencias están marcadas.

| # | Lote | Tag | SQL | Archivos | Hallazgos |
|---|---|---|---|---|---|
| **0** | **Verificaciones en Supabase (cero código)** | — | consulta | ninguno | Max rows · `relreplident` de `session_log` · UNIQUE de `cobros.cobro_ref` y `session_log` · las 4 FK de `patients` · `informes.deleted` · policy real de `patients` UPDATE |
| **1** | **Sesión duplicada: el SELECT que no aborta** | Low | no | `sesiones.js` | CORR-06 |
| **2** | **Bug de `hour` — código** | Medium | no | `sesiones.js`, `informes.js` | CORR-04 |
| **2b** | **Bug de `hour` — limpieza de datos** | High | **sí** | ninguno (solo SQL) | duplicados existentes + huérfanas. **Va antes que 2** |
| **3** | **Truncamiento detectado** | Low | no | `auth.js` | DATOS-02 |
| **4** | **Escrituras que mienten: filas afectadas** | Medium | no | `agenda.js`, `auth.js` | CORR-01 + `dbUpdateApptStatus` + rollback en los 3 callers |
| **5** | **Citas recurrentes** | Medium | no | `agenda.js`, `test/recurrencia.test.js` | CORR-02 · CORR-03 · `esRealApptId` en `delAppt` · el N+1 del bucle |
| **6** | **Realtime: emparejar por id** | Medium | no | `realtime.js` | RT-01 · RT-02 · `_onPatient` por id (CORR-09) · ramas UPDATE/DELETE en `_onCobro` · coalescing. **Depende del lote 0** |
| **7** | **Realtime: orden y cobertura** | Medium | **sí** | `realtime.js` | CORR-10 (invertir orden) · CORR-11 (suscribir `informes`) · `protocols` |
| **8** | **Permisos que faltan** | Medium | no | `agenda.js`, `pacientes.js`, `informes.js`, `permissions.js`, `test/permissions.test.js` | SEG-01 · SEG-03 · el export gateado solo en HTML · **el test de la matriz** |
| **9** | **Paciente: la decisión de Jefferson** | High | **sí** | `pacientes.js`, `cie10.js`, `plan.js`, `permissions.js` | SEG-02. **Bloqueado hasta el lote 0** |
| **10** | **Esquema versionado** | High | **sí** | `.sql` nuevos | DB-01 · DB-02 (índice **parcial**) · DB-03 · DB-04 · `therapist_blocks` en el trigger · re-exportar `rls_policies.md` |
| **11** | **Rollbacks pendientes (R-7 fase 2)** | Low | no | `doctores.js`, `protocolos.js`, `bloqueos.js` | 5 hallazgos de optimismo sin rollback, todos con el patrón ya escrito en `terapeutas.js` |
| **12** | **Rollbacks de agenda y pacientes** | Medium | no | `agenda.js`, `pacientes.js` | 5 más. Separado del 11 porque toca los dos archivos calientes |
| **13** | **El foco que se pierde** | Low | no | `facturacion.js`, `historial.js`, `patient-combo.js` | 3 hallazgos, el mismo síntoma |
| **14** | **Fechas UTC** | Low | no | `word.js`, `informes.js`, `agenda.js`, `state.js` | 4 hallazgos + test de `word.js:232` |
| **15** | **Fórmulas duplicadas** | Medium | no | `utils.js` + los consumidores | `listoParaCobrar` · `parseFinNote` · continuidad · corte de episodio de `ia.js` (CORR-08) |
| **16** | **Dinero: umbral y cierre** | Medium | no | `agenda.js`, `facturacion.js`, `sesiones.js`, `utils.js` | badge sin cierre · umbral global vs por paciente · `n>0` · el excedente de R-9 |
| **17** | **Bundle** | Low | no | `index.html`, `package.json`, `main.js`, `informes.js` | Chart.js a npm + lazy · `pdf-logo` diferido · export lazy · `vite.config.js` con `manualChunks` |
| **18** | **Teclado y contraste** | Low | no | `agenda.js`, `main.js`, `search.js`, `cie10.js`, `css/` | 8 hallazgos de a11y |
| **19** | **Código y CSS muerto** | Low | no | varios + `css/` | ~81 líneas de CSS + los exports y `window._app` sin uso |
| **20** | **Rastro de exportación (LOPDP)** | Medium | **sí** | `informes.js`, `excel.js`, `foto.js`, `api/informe.js` | SEG-04 |
| **21** | **RLS de informes** | Medium | **sí** | solo SQL | SEG-05 (H-2) |
| **22** | **Cosas rotas y baratas** | Low | no | `main.js`, `resumen.js`, `validators.js`, `auth.js`, `patient-combo.js` | los buscadores con `ReferenceError` · CORR-12 (WhatsApp) · RUC/pasaporte · teléfono con espacios · la contraseña en el DOM · búsqueda sin tildes |

**Orden recomendado:** 0 → 2b → 1 → 2 → 3 → 4 → 5 → 6 → 8 → 22 → 10 → 9 → 7 → 15 → 16 → 12 → 11 → 13 → 14 → 20 → 21 → 17 → 18 → 19.

El lote 0 no produce commit, pero **desbloquea los lotes 6, 9 y 10** y puede tumbar tres hallazgos enteros. Es media hora en el dashboard y vale más que cualquier línea de código de esta lista.

---

# C) Lo que NO vale la pena arreglar

Sección obligatoria. Una auditoría que no descarta nada, infla.

**Los 10 tumbados y los 3 dudosos.** Ya están arriba con su motivo. Los tres dudosos no son «arréglalos por si acaso»: son «no hay evidencia suficiente, no gastes un lote en esto».

**Los dos catch vacíos.** Son correctos. El encargo los daba por bugs y no lo son. **No los toques**: envolverlos en un `console.warn` añade ruido a un camino que se ejecuta en cada reconexión.

**Buscar TODOs.** No hay ninguno. La deuda de este proyecto está en `PROYECTO_ESTADO.md`, que es mejor sitio que un comentario. No introduzcas la convención ahora.

**Renombrar por consistencia.** `patient`/`paciente`/`pat`, `appointment`/`appt`/`cita`, es/en mezclado. Es real y es feo, y **arreglarlo no vale nada**: rompe el `git blame` de 9854 líneas, genera un diff inauditable y no evita ni un bug. **Las dos excepciones que sí valen** están en el MEDIO y son bugs disfrazados de nomenclatura: `hour` con dos tipos incompatibles (`auth.js:70`/`:78`) y `fmtFechaCorta` colisionando con la de `utils.js` (`seguimiento.js:48`). Esas dos sí; el resto no.

**Sacar Seguimiento de `utils.js` a su módulo.** Un refutador lo tumbó y tenía razón: la descripción del corte era exacta, pero mover 115 líneas sin desacoplarlas solo cambia el problema de sitio.

**`exportAgendaCSV` (44 líneas muertas).** Borrarla es correcto, pero **antes hay que decidir si se quiere la función**, porque `PROYECTO_ESTADO.md:1756` la lista como viva: alguien creyó que existía el botón. Borrarla en silencio cierra una funcionalidad que quizá se quería. Es una pregunta, no una tarea.

**Migrar los 14 `alert()`/`confirm()` a modales propios.** El encargo los llamaba inconsistencia visual y lo son. Pero **funcionalmente están bien**: todos fallan cerrados (`if(!confirm(...)) return`), que es exactamente lo correcto para un borrado, y ser bloqueante es una **virtud** ahí. Migrarlos a un modal con Promise es un lote entero de riesgo medio para ganar estética. **Los dos que sí valen** ya están en el MEDIO y no son cosméticos: el `confirm()` de facturación que se le planta al terapeuta interrumpiendo el registro clínico, y la falta de aviso al pulsar «no». El resto: déjalos.

**Los cortes de módulo de `informes.js` / `agenda.js` / `utils.js`.** Se propusieron seis con líneas exactas. Solo **dos** valen: el combo duplicado de `informes.js:463-544` (se borra y se consume `patient-combo.js`, ya existente) y el import de `informes.js:4` que arrastra todo `agenda.js` al mismo chunk por **un único símbolo puro**. Los otros cuatro —modal de cita, capa PDF, `exportAgendaCSV`, Seguimiento— son mover código sin desacoplarlo. Este proyecto trabaja por lotes pequeños y auditables: un corte de 250 líneas destruye esa propiedad a cambio de nada medible.

**Perseguir el warning de chunk >500 kB.** El bundle inicial son **155 kB gzip**, que para una app que se abre una vez al día en un PC de recepción **es perfectamente aceptable**. El lote 17 vale la pena por otras razones concretas (Chart.js bloquea el parser, el logo viaja dos veces, sin `manualChunks` supabase-js se re-descarga en cada deploy y el repo despliega varias veces al día), no por bajar de 500 kB. **No subas `chunkSizeWarningLimit` para callar el aviso**, pero tampoco trates el número como un problema.

**Las O(n²) que no lo son.** `auth.js:73` son 1,9 ms hoy. `ordinalesDeCitas` son 12,3 ms. Con 190 pacientes un navegador ni se entera. La **única** que hay que arreglar antes de dos años es `capacidadSlots` (`utils.js:505`), porque está medida en 267 ms con 800 bloqueos y crece con el producto de cuatro factores. Las otras: anotadas y a otra cosa.

**Los 51 labels sin `for` de golpe.** 51 campos es un lote grande de riesgo bajo pero revisión tediosa. El valor real está concentrado en los campos del modal de cita y del de paciente, que son los que se llenan a diario. Hacer esos y dejar el resto es la decisión correcta; hacer los 51 es gastar una revisión entera en pantallas que se abren una vez al mes.

**Perseguir la RLS de SELECT.** Excluida por el encargo, y con razón. Dos hallazgos intentaron colarse por ahí (informe borrado legible, historial visible entre terapeutas) y **los dos fueron tumbados** por apoyarse en esa decisión ya tomada.

---

*Auditoría generada con 32 auditores en paralelo, 344 agentes en total y refutación adversarial de cada hallazgo. 10 hallazgos tumbados y 69 severidades corregidas a la baja por los refutadores. Los hallazgos marcados «verificar con Jefferson» dependen de datos que no están en el repo y no deben tratarse como hechos hasta comprobarlos.*
