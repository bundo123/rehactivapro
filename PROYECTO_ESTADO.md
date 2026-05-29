# RehactivaPro — Estado del Proyecto

> Generado: 2026-05-18

---

## a) Estructura de archivos

### `/` (raíz)
| Archivo | Líneas |
|---------|--------|
| `index.html` | 731 |
| `app.js` *(legacy monolítico, archivado)* | 2868 |

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
