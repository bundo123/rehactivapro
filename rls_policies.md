# RLS de RehactivaPro — referencia versionada

> Exportado de Supabase (`pg_policies` + `pg_class`) el 2026-06-07.
> **La RLS es la única defensa real de la PHI** (repo público + anon key en el bundle).
> Este archivo existe para que la RLS sea revisable desde el repo (cierra el hallazgo C-1 del audit).
> Fuente de verdad = Supabase. Si cambiás una policy allá, **re-exportá y actualizá este archivo**.

## Estado de RLS por tabla — verificado

Las 10 tablas tienen **RLS activada (`relrowsecurity = true`)**. Sin esto, las policies de abajo se ignorarían:

| Tabla | RLS activa |
|---|---|
| appointments | ✅ true |
| audit_log | ✅ true |
| cobros | ✅ true |
| doctors | ✅ true |
| informes | ✅ true |
| patients | ✅ true |
| profiles | ✅ true |
| protocols | ✅ true |
| session_log | ✅ true |
| therapists | ✅ true |

## Policies por tabla (cmd · rol · condición)

**profiles** — núcleo del modelo de roles
- SELECT `users_read_own_profile` — `auth.uid() = id` (cada uno lee su perfil)
- SELECT `admin_read_all_profiles` — `is_admin()`
- INSERT/UPDATE/DELETE — solo `is_admin()`
- ✅ **No hay escalada de rol**: un no-admin NO puede modificar su propio `role`. Esto hace confiables a `is_admin()/is_terapeuta()/is_secretaria()`.

**patients**
- SELECT `auth_users_read_patients` — `true` (⚠️ lectura abierta a todo autenticado — ver C-2)
- INSERT/UPDATE — `is_admin() OR is_secretaria()`
- DELETE — `is_admin()`

**session_log**
- SELECT `auth_read_session_log` — `true` (⚠️ lectura abierta — ver C-2)
- INSERT — admin/secretaria/terapeuta
- UPDATE `admin_secretaria_terapeuta_update_session_log` — admin/secretaria/terapeuta (⚠️ **cualquiera edita cualquier sesión**, no solo las propias — ver hardening H-1)
- DELETE — `is_admin()`

**informes** (PHI clínico)
- SELECT `informes_select` — `true` (⚠️ lectura abierta — ver C-2)
- INSERT `informes_insert` — `created_by = auth.uid()` AND rol admin/terapeuta. ✅ **autoría no falsificable en el alta.**
- UPDATE `informes_update` — rol admin/terapeuta (⚠️ **un terapeuta puede editar/borrar/resucitar el informe de cualquiera**; no valida autor ni `deleted_by` — ver hardening H-2)
- (⚠️ `informes` NO tenía trigger de auditoría — se agrega en esta tanda, ver H-3)

**cobros** (facturación)
- SELECT/INSERT — `is_admin() OR is_secretaria()`
- UPDATE/DELETE — `is_admin()`
- ✅ Un terapeuta no ve ni crea cobros. Cobro fraudulento bloqueado.

**appointments**
- SELECT — `true`
- INSERT/UPDATE/DELETE — `is_admin() OR is_secretaria()`
- UPDATE `terapeuta_update_own_appointments` — terapeuta solo las citas con su `therapist_id`. ✅ acotado correctamente.

**doctors / therapists / protocols**
- SELECT — `true`
- Resto (ALL/manage) — `is_admin()` (protocols, therapists) / `is_admin() OR is_secretaria()` (doctors)

**audit_log**
- SELECT — solo admin
- Sin INSERT/UPDATE/DELETE desde cliente; inmutable por trigger (`audit_log.sql`). ✅

## Posturas y pendientes (decisiones, no bugs urgentes)

- **C-2 — "lectura abierta" de PHI:** `patients`, `session_log`, `informes` tienen `SELECT = true` → cualquier cuenta autenticada lee la historia clínica + cédula/tel/email de TODOS. No es acceso público (solo logueados) y puede ser operativamente válido en una clínica chica que se cubre entre sí, **pero bajo LOPDP requiere decisión consciente + base de licitud + (ideal) log de lecturas.** DECISIÓN PENDIENTE del equipo.
- **H-1 — `session_log` UPDATE demasiado abierto:** acotar a "sesiones propias del terapeuta + admin/secretaria". Depende de si los terapeutas se cubren entre sí (misma decisión que C-2).
- **H-2 — `informes` UPDATE entre usuarios:** acotar a autor o admin; poner `DEFAULT auth.uid()` y validar `deleted_by`. Pendiente.
- **H-3 — auditar `informes`:** agregar al trigger de `audit_log` (se hace en esta tanda). ✅ en progreso.
