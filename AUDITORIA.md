# Auditoría RehactivaPro

> Generado: 2026-05-29 · Solo análisis (no se tocó código)
> Alcance: `js/`, `index.html`, `*.sql`. Revisión manual archivo por archivo + grep para verificar uso real.
> Nota: se excluyen los hardcodes ya resueltos de `renderMensual`/`renderAnual`.

16 hallazgos, ordenados por severidad dentro de cada categoría. Cada uno: **archivo:línea · qué · por qué importa · fix en 1 frase.**

---

## 🟠 SEGURIDAD

### S1 — [ALTA] XSS almacenado vía campo "alta" de protocolo
- **`js/protocolos.js:139`** — `Alta: ${p.alta}` se interpola **sin** `esc()`.
- `p.alta` viene del textarea `prot-alta` y se persiste en DB (`discharge_criteria`); se carga de vuelta en `auth.js:70`. Cualquiera con permiso de crear/editar protocolo puede inyectar `<img src=x onerror=...>` y el script se ejecuta para **todos** los que abran la pestaña Protocolos.
- **Fix:** `Alta: ${esc(p.alta)}`.

### S2 — [ALTA · verificar] Los permisos solo existen en el cliente
- **`js/permissions.js` (todo)** + `window.supa` expuesto en **`js/main.js:65,228`**.
- `hasPermission`/`canAccessTab` corren en el navegador: son solo UX. Con el cliente Supabase en `window`, cualquier usuario autenticado (p. ej. un terapeuta) puede ejecutar `supa.from('patients').delete()` desde la consola. La seguridad real depende **100%** de las políticas RLS de Supabase, que no están en este repo y no pude verificar.
- **Fix:** confirmar que existen políticas RLS por rol para SELECT/INSERT/UPDATE/DELETE en las 7 tablas; tratar el JS solo como UX.

### S3 — [MEDIA] Borrado en cascada desde el cliente, sin transacción
- **`js/pacientes.js:289-305`** — `deletePatient` borra `session_log`, `cobros`, `appointments` y `patients` en 4 llamadas separadas y secuenciales.
- Si una falla a media (red/RLS), quedan filas huérfanas (citas/cobros apuntando a un paciente inexistente) sin forma de rollback.
- **Fix:** mover el borrado a un RPC/función transaccional en Postgres, o declarar las FK con `ON DELETE CASCADE`.

---

## 🔴 BUGS / CORRECTITUD

### B1 — [MEDIA] `cycleStatus` puede desincronizar el contador `done`
- **`js/agenda.js:199-217`** + `checkBillingOnStatusChange` **`agenda.js:184-192`**.
- Al pasar una cita **a** `conf` con el punto de estado, se incrementa `billing.pendientes` pero **no** se incrementa `done` (ni local ni en DB). Al salir de `conf` (`conf→pend`) **sí** se decrementa `done`. Resultado asimétrico: `done` solo baja por el punto, nunca sube, y puede quedar por debajo de las sesiones realmente registradas en `session_log`.
- **Fix:** o no tocar `done` en `cycleStatus` (dejar que `saveSession` lo gestione), o incrementarlo simétricamente al entrar a `conf`.

### B2 — [MEDIA] "Cobrar todos" dispara N `alert()` bloqueantes
- **`js/facturacion.js:329-339`** → `emitirFactura:326` → `simEmailFactura:342`.
- `marcarTodosFacturados` llama a `emitirFactura` en bucle, y cada una abre un `alert()` que el usuario debe cerrar a mano. Cobrar 8 pacientes = 8 popups seguidos.
- **Fix:** omitir `simEmailFactura` en modo lote y mostrar un único resumen al final.

### B3 — [BAJA] IDs de citas recurrentes generados con `Math.random()`
- **`js/agenda.js:423`** — `id:'rec-'+fecha+'-'+Math.random()`.
- No son UUID válidos; si se edita o elimina una recurrente **antes** de recargar, el código la trata como local (`typeof id!=='string'` falla al revés: es string pero no existe en DB) y la operación nunca llega a Supabase. Recargar lo corrige, pero es confuso.
- **Fix:** capturar el `id` real del `insert().select().single()` de cada recurrente, como ya se hace con la cita base.

### B4 — [BAJA] Editar cita permite moverla a una fecha pasada
- **`js/agenda.js:383-400`** (rama edición) vs **`:403`** (guard `ds<today`).
- El guard que bloquea fechas pasadas solo aplica a citas nuevas; la rama de edición retorna antes de llegar a él.
- **Fix:** aplicar el mismo guard en edición si el bloqueo de pasados también debe regir ahí (o documentar que es intencional).

---

## 🟡 CÓDIGO MUERTO (verificado por grep)

### M1 — `app.js` en la raíz (~2868 líneas)
- **`app.js`** — monolito viejo. `index.html:594` solo carga `/js/main.js`; ningún `<script>` referencia `app.js`. Contiene copias desactualizadas de casi todo (`dbSaveAppt`, `openWA`, `getProtocolRows`, etc.).
- **Fix:** eliminar el archivo.

### M2 — `renderPatientsOld()`
- **`js/pacientes.js:177-217`** — definida pero sin ninguna llamada (la activa es `renderPatients`, `:227`).
- **Fix:** eliminar la función.

### M3 — Helpers DB de guardado nunca usados
- **`js/auth.js:212` (`dbSaveAppt`), `:218` (`dbDeleteAppt`), `:225` (`dbSavePatient`), `:229` (`dbSaveTherapist`), `:242` (`dbSaveDoctor`)** — exportadas pero nunca importadas; el código activo hace los `insert`/`upsert` inline en cada módulo.
- **Fix:** eliminar estas 5 (conservar `dbDelete*`, `dbUpdateApptStatus`, `dbUpdateBillingPendientes`, `dbRegistrarCobro`, `dbSaveProtocol`, que **sí** se usan).

### M4 — `openWA` / `waPatient`
- **`js/resumen.js:112-123`** — bindeadas a `window` (`main.js:209`) pero sin `onclick` en `index.html` ni otra llamada; las filas del resumen usan `simWA`/`simEmail` directamente.
- **Fix:** verificar que no haya un caller dinámico y eliminarlas junto con su binding.

---

## 🔵 MEJORAS

### J1 — `<link rel="icon">` y `<title>` duplicados
- **`index.html:590-591`** — repiten lo que ya está en el `<head>` (líneas 15/17).
- **Fix:** quitar los duplicados.

### J2 — `console.log` de producción
- **`js/auth.js:92`** — `console.log('Datos cargados desde Supabase')` queda en cada carga.
- **Fix:** quitarlo o condicionarlo a un flag de debug.

### J3 — `alert()`/`confirm()` bloqueantes en todo el flujo
- Facturación, pacientes, agenda, terapeutas… usan diálogos nativos que no se pueden estilar ni encolar.
- **Fix:** migrar a modales/toasts no bloqueantes (ya existe el sistema `toast.js`).

### J4 — `loadAll` trae todo sin paginar
- **`js/auth.js:50-57`** — en cada login carga todas las filas de las 7 tablas (incl. `session_log` anidado).
- Funciona bien para una clínica pequeña, pero no escala a miles de pacientes/sesiones.
- **Fix:** paginar o limitar por rango de fechas cuando crezca el volumen.

### J5 — `checkAutoNoas` solo cubre el día actual y al renderizar
- **`js/agenda.js:36-51`** — solo marca inasistencias del día visible y únicamente cuando se dibuja la grilla; las citas pendientes de días pasados nunca se auto-marcan como `noas`.
- **Fix:** barrer pendientes vencidas al cargar (o vía job) si se quiere que el estado refleje el pasado.

---

## Notas de verificación (posibles falsos positivos descartados)

- **`resumen.js:48,51,56,57`** — el patrón `esc(JSON.stringify(...))` dentro de atributos `onclick` **es seguro**: `JSON.stringify` escapa comillas internas y `esc` neutraliza el resto antes de entrar al atributo. No es hallazgo.
- **`doctores.js:116-117` (`n.label`/`n.desc`/`n.icon` sin `esc`)** — provienen de `state.notifSettings`, que es config **hardcodeada** (`state.js:7-13`), no input de usuario. Seguro.
- **`protocolos.js:137` (`${p.def}` sin `esc`)** — `def` solo existe en `DEFAULT_PROTOCOLS` (hardcodeado); los protocolos de DB no traen `def` (`auth.js:70`), así que la rama nunca renderiza dato de usuario. Seguro.
- **`audit_log.sql`** — revisado en su implementación; inmutabilidad de 3 capas correcta. Sin hallazgos.
