# RehactivaPro — Estado del Proyecto

> Generado: 2026-05-18 · Última actualización: 2026-05-31

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

### `/` (raíz)
| Archivo | Líneas |
|---------|--------|
| `index.html` | 731 |
| ~~`app.js`~~ *(legacy monolítico — **BORRADO** en `efd7471`, 2026-05-30)* | — |

### `/js/` — Módulos activos
| Archivo | Líneas |
|---------|--------|
| `supabase-client.js` | 4 |
| `toast.js` | 16 |
| `state.js` | 38 |
| `permissions.js` | 55 |
| `search.js` | 63 |
| `utils.js` | 66 |
| `ia.js` | 60 |
| `resumen.js` | 99 |
| `terapeutas.js` | 102 |
| `doctores.js` | 114 |
| `sesiones.js` | 129 |
| `facturacion.js` | 131 |
| `protocolos.js` | 138 |
| `auth.js` | 185 |
| `main.js` | 213 |
| `realtime.js` | 264 |
| `pacientes.js` | 405 |
| `informes.js` | 426 |
| `agenda.js` | 671 |
| **Total JS activo** | **~3173** |

### `/css/`
| Archivo | Líneas |
|---------|--------|
| `base.css` | 22 |
| `layout.css` | 28 |
| `components.css` | 87 |
| `rehactiva-theme.css` | 144 |
| `screens.css` | 147 |
| `responsive.css` | 321 *(sin commitear)* |

### `/src/` *(scaffolding Vite, no en producción)*
| Archivo | Líneas |
|---------|--------|
| `counter.js` | 9 |
| `main.js` | 60 |
| `style.css` | 296 |

### SQL
No se detectaron archivos `.sql` en el repo (schema probablemente gestionado desde Supabase dashboard).

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
| `agenda.js` | Calendario de citas (vistas día/semana/mes/por-terapeuta), CRUD de citas, export CSV |
| `pacientes.js` | CRUD de pacientes, episodios, evaluación inicial, paginación |
| `sesiones.js` | Registro de sesiones clínicas (EVA, técnicas) |
| `facturacion.js` | Workflow de facturación y cobros |
| `informes.js` | Reportes semanales/mensuales/anuales/paciente, PDF export |
| `terapeutas.js` | CRUD de terapeutas y horarios |
| `doctores.js` | CRUD de médicos derivadores y preferencias de notificación |
| `protocolos.js` | Plantillas de protocolos de tratamiento |
| `resumen.js` | Dashboard diario con overview de citas |
| `search.js` | Búsqueda global de pacientes (sobre estado en memoria) |
| `ia.js` | Integración con Claude.ai para insights de informes |
| `utils.js` | Constantes, formateadores, getters compartidos |
| `toast.js` | Notificaciones toast (ok/error/info) |

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
| `realtime.js` | `appointments`, `patients`, `session_log`, `cobros`, `therapists`, `doctors` |
| `resumen.js`, `informes.js`, `search.js` | *(solo leen de `state`, sin queries directas)* |

### Dependencias entre módulos (qué importa qué)

```
supabase-client ← auth, agenda, pacientes, sesiones, terapeutas, doctores, realtime
state           ← todos los módulos
utils           ← agenda, pacientes, sesiones, facturacion, informes, search, doctores, terapeutas, resumen, ia
toast           ← agenda, pacientes, sesiones, facturacion, terapeutas, doctores, search, ia, auth
permissions     ← agenda, pacientes, sesiones, facturacion, terapeutas, doctores, protocolos
auth.js         ← agenda (dbUpdateApptStatus, dbRegistrarCobro), facturacion (dbRegistrarCobro),
                   terapeutas (dbDeleteTherapist), doctores (dbDeleteDoctor), protocolos (dbSaveProtocol, dbDeleteProtocol)
resumen.js      ← pacientes (hasEvalInicial), informes (hasEvalInicial), search (hasEvalInicial)
agenda.js       ← facturacion (updateFacturaBadge), terapeutas (updateFacturaBadge)
ia.js           ← informes (genSemanalAI, genPatientAI, callAI)
main.js         ← importa todos los módulos anteriores
```

---

## c) Estado de funcionalidades

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Auth + login | ✅ | Supabase Auth, carga perfil en login |
| Roles (admin/secretaria/terapeuta) | ✅ | `permissions.js` + `state.currentUserRole` |
| RLS en Supabase | 🟡 | Depende de config en dashboard, no verificable en código |
| Pacientes — CRUD | ✅ | Crear, editar, eliminar con confirmación |
| Pacientes — búsqueda | ✅ | Búsqueda global en memoria con highlight |
| Pacientes — paginación | ✅ | Paginación por página en `pacientes.js` |
| Pacientes — episodios | ✅ | Alta y gestión de episodios clínicos |
| Agenda — vista día | ✅ | Grid por terapeuta y hora |
| Agenda — vista semana | ✅ | |
| Agenda — vista mes | ✅ | |
| Agenda — vista por terapeuta | ✅ | |
| Agenda — crear/editar cita | ✅ | Modal completo |
| Agenda — conflictos de horario | 🟡 | Validación básica, no exhaustiva |
| Agenda — citas recurrentes | 🟡 | Código presente, no confirmado completo |
| Agenda — drag & drop | 🟡 | Mencionado en agenda.js, no verificado |
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
| Integración IA (Claude) | ✅ | Informes semanales y por paciente |
| Notificaciones a médicos | 🟡 | Preferencias guardadas, envío no verificado |
| Protocolos de tratamiento | ✅ | CRUD + adherencia |

---

## d) Deuda técnica

### TODOs / FIXMEs
Ninguno encontrado en el código activo.

### Archivos con código duplicado / riesgo
- **`app.js` (2868 líneas)** — monolítico legacy. Si sigue siendo referenciado desde `index.html` en paralelo con los módulos `/js/`, hay riesgo de comportamiento duplicado. Verificar si puede eliminarse.
- **`src/`** — scaffolding de Vite sin uso productivo. Puede confundir si se hace `vite build`.

### Funciones largas (>100 líneas)
| Función | Archivo | Líneas aprox. |
|---------|---------|---------------|
| `renderPatientReport()` | `js/informes.js:262` | ~119 |
| `renderGrid()` | `js/agenda.js:53` | ~130 |

Otras funciones rozando el límite: `renderSemanal()` (~81), `savePatient()`, `saveAppt()`.

### Validaciones faltantes
- Conflictos de agenda no se validan completamente al guardar cita (solo UI-side)
- No hay validación de formato en campos de hora/fecha en formularios
- `supabase-client.js` expone la anon key en texto plano (normal para Supabase, pero depende de RLS correctamente configurado)

### Manejo de errores
- La mayoría de operaciones Supabase tienen `.catch` con `toastErr` — correcto
- `loadAll()` en `auth.js` no tiene manejo granular: un fallo en cualquier tabla aborta toda la carga
- `realtime.js`: si la suscripción cae, no hay reconexión automática explícita

### Otros
- No hay tests (unitarios ni e2e)
- No hay archivo de variables de entorno (`.env`): la URL y key de Supabase están hardcodeadas en `supabase-client.js`

---

## e) Últimos 10 commits

| Hash | Descripción |
|------|-------------|
| `7e78bf1` | fix: color del borde izquierdo de cita refleja médico derivador (no terapeuta) |
| `57e7f83` | fix: slots vacíos de agenda más visibles y clickeables entre citas |
| `49f5a11` | fix: eliminar chars de encoding rotos en badges de pacientes |
| `0fdbba4` | chore: correcciones menores de consistencia UI |
| `7e9dc23` | fix: las citas ocupan visualmente toda su duración |
| `751bd82` | fix: ocultar divisores de slot bajo citas multi-slot |
| `e50028a` | fix: mejorar filtro "sin evaluación inicial" en vista de pacientes |
| `aedb236` | refactor: click en cita abre directamente modal de edición |
| `3c0c862` | feat: selector combinado de vista de agenda (todas/por-terapeuta × día/semana/mes) |
| `cd17d97` | feat: modos de vista de agenda (día/semana/mes/por-terapeuta) + export CSV |
