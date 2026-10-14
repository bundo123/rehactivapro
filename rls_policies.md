# RLS de RehactivaPro — referencia versionada

> Exportado de Supabase (`pg_policies` + `pg_class`) el 2026-06-07.
> **La RLS es la única defensa real de la PHI** (repo público + anon key en el bundle).
> Este archivo existe para que la RLS sea revisable desde el repo (cierra el hallazgo C-1 del audit).
> Fuente de verdad = Supabase. Si cambiás una policy allá, **re-exportá y actualizá este archivo**.

## Estado de RLS por tabla — verificado

Las 14 tablas tienen **RLS activada (`relrowsecurity = true`)**. Sin esto, las policies de abajo se ignorarían:

| Tabla | RLS activa |
|---|---|
| appointments | ✅ true |
| audit_log | ✅ true |
| cobros | ✅ true |
| doctors | ✅ true |
| documentos | ✅ true *(DOC-2, `b2a_documentos.sql`, verificado en producción el 2026-10-14)* |
| episodios | ✅ true *(EPI-2a, `episodios.sql`)* |
| informes | ✅ true |
| patients | ✅ true |
| pedidos_medicos | ✅ true *(ORD-1, `b1_orden_campos.sql`, verificado en producción el 2026-10-14)* |
| profiles | ✅ true |
| protocols | ✅ true |
| session_log | ✅ true |
| therapist_blocks | ✅ true *(verificado en producción el 2026-10-14)* |
| therapists | ✅ true |

## Policies por tabla (cmd · rol · condición)

**profiles** — núcleo del modelo de roles
- SELECT `users_read_own_profile` — `auth.uid() = id` (cada uno lee su perfil)
- SELECT `admin_read_all_profiles` — `is_admin()`
- INSERT/UPDATE/DELETE — solo `is_admin()`
- ✅ **No hay escalada de rol**: un no-admin NO puede modificar su propio `role`. Esto hace confiables a `is_admin()/is_terapeuta()/is_secretaria()`.

**patients**
- SELECT `auth_users_read_patients` — `true` (⚠️ lectura abierta a todo autenticado — ver C-2)
- INSERT — `is_admin() OR is_secretaria()`
- UPDATE `staff_update_patients` — `is_admin() OR is_secretaria() OR is_terapeuta()` (**corregido el 2026-10-14**, verificado en producción: este archivo decía admin/secretaria; el terapeuta edita la ficha, espejo de `editPatient`)
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

**doctors**
- SELECT — `true`
- Resto (ALL/manage) — `is_admin() OR is_secretaria()`

**protocols** (banco de diagnósticos) — 4 policies, **verificado en producción el 2026-09-23**
- SELECT `auth_read_protocols` — `true`
- INSERT `admin_terapeuta_insert` — `is_admin() OR (is_terapeuta() AND coalesce(btrim(clinical_context),'') = '' AND ctx_validado_at IS NULL AND ctx_validado_por IS NULL)`. El terapeuta da de alta el diagnóstico que le falta a mitad de la evaluación, pero **sin** contexto clínico ni validación: eso lo cura el admin (CTX-1, `ctx_protocols.sql`).
- UPDATE `admin_update_protocols` — `USING is_admin() WITH CHECK is_admin()`
- DELETE `admin_delete_protocols` — `is_admin()`. Acá vive el `clinical_context` que consume el informe IA: se cura, no se improvisa.
- Trigger `trg_protocols_ctx_invalida` (BEFORE INSERT/UPDATE): si cambia `clinical_context` sin re-validar en el mismo UPDATE, o el texto queda vacío, `ctx_validado_por`/`ctx_validado_at` vuelven a NULL. El informe IA solo usa contexto validado (`ctxParaPrompt`, `utils.js`).
- Auditoría: `trg_audit` → `audit_log` (INSERT/UPDATE/DELETE). Antes `protocols` quedaba fuera.
- Historia: `rls_protocols_terapeuta.sql` (2026-09-18) partió el permiso espejando el front (`createProtocol` vs `editProtocol`); `ctx_protocols.sql` (2026-09-23, CTX-1) sumó las columnas de validación, la condición de contexto en la INSERT, el trigger y la auditoría.
- ⚠️ **Deriva corregida el 2026-09-23.** Producción tenía dos policies creadas **fuera del repo** (no están en ningún commit): `admin_terapeuta_insert_protocols` (INSERT, `is_admin() OR is_terapeuta()`), que por el OR entre policies permisivas **anulaba** la condición de contexto de la INSERT, y `admin_terapeuta_update_protocols` (UPDATE, `is_admin() OR is_terapeuta()`), que dejaba al terapeuta editar diagnósticos y **auto-validar** contexto vía API. Además **faltaba** `admin_update_protocols`, aunque este archivo lo daba por aplicado desde el 2026-09-18. Jefferson borró las dos y creó `admin_update_protocols`: registro en `rls_protocols_drift_2026-09-23.sql`. Lección: re-exportar `pg_policies` y compararlo con este archivo después de cada SQL manual.

**therapists**
- SELECT — `true`
- INSERT/UPDATE — `is_admin() OR is_secretaria()` (la secretaria gestiona el equipo: alta, horarios, orden, color)
- DELETE — `is_admin()`. ✅ La baja, única acción irreversible de la pantalla, no se delega.
- ✅ **Aplicado y verificado en producción el 2026-08-14** con `rls_therapists_secretaria.sql` (versionado en el repo): quedan 4 policies y la `ALL = is_admin()` vieja fue eliminada. Espeja la partición del permiso de front (`createTherapist` vs `deleteTherapist`).

**therapist_blocks** (bloqueos de agenda del terapeuta) — 4 policies, **verificado en producción el 2026-10-14**
- SELECT `blocks_select` — `true`
- INSERT `admin_secretaria_insert_blocks` / UPDATE `admin_secretaria_update_blocks` / DELETE `admin_secretaria_delete_blocks` — `is_admin() OR is_secretaria()`. Espeja el permiso de front `manageBlocks`: la agenda la maneja recepción, no el terapeuta.

**episodios** (EPI-2a) — 4 policies, `episodios.sql`
- SELECT `episodios_select` — `true` (todo autenticado)
- INSERT `episodios_insert` / UPDATE `episodios_update` — `is_admin() OR is_secretaria() OR is_terapeuta()`
- DELETE `episodios_delete` — los mismos tres roles `AND desde IS NOT NULL`: el primer episodio (desde el inicio) no se borra.
- `REVOKE ALL ... FROM anon`. Auditoría: `trg_audit` → `audit_log`. `REPLICA IDENTITY FULL` + publicación realtime.
- Se crean/unen/mueven con las funciones `crear_episodio`, `unir_con_anterior`, `mover_inicio` (sin EXECUTE para anon).

**pedidos_medicos** (ORD-1, orden del médico referente) — 4 policies, `b1_orden_campos.sql` (corrido y verificado en producción el 2026-10-14: columnas, 4 policies y `trg_audit`)
- SELECT `pedidos_select` — `true` (todo autenticado; misma postura que `patients`, ver C-2)
- INSERT `pedidos_insert` — `is_admin() OR is_secretaria() OR is_terapeuta()`
- UPDATE `pedidos_update` — USING y WITH CHECK `is_admin() OR is_secretaria() OR is_terapeuta()` (el front solo la usa para poner `documento_id` al adjuntar el escaneo, DOC-2)
- DELETE `pedidos_delete` — `is_admin()`. Espeja el permiso de front `borrarOrden` (solo admin); `registrarOrden` = los tres roles.
- `REVOKE ALL ... FROM anon`. Auditoría: `trg_audit` → `audit_log` (INSERT/UPDATE/DELETE). `REPLICA IDENTITY FULL` por si B2 suma realtime (hoy sin canal).
- CHECK: `sesiones_autorizadas` 1..200 · `vigencia_hasta >= fecha` · `nota` ≤ 300. FK a `patients` ON DELETE CASCADE y a `doctors` ON DELETE SET NULL.
- `documento_id` (DOC-2, `b2a_documentos.sql`) → `documentos(id)` ON DELETE SET NULL: el escaneo de la orden.

**documentos** (DOC-2, documentos del paciente; el archivo vive en Storage) — 3 policies, `b2a_documentos.sql` (corrido y verificado en producción el 2026-10-14: bucket, 3+3 policies, `trg_audit`, `documento_id`)
- SELECT `documentos_select` — `true` (todo autenticado; misma postura que `patients`, ver C-2)
- INSERT `documentos_insert` — `(is_admin() OR is_secretaria() OR is_terapeuta()) AND subido_por = auth.uid() AND deleted = false`. ✅ autoría no falsificable y la fila nace viva.
- UPDATE `documentos_update` — USING `is_admin() OR subido_por = auth.uid()`; WITH CHECK `deleted = true AND deleted_by = auth.uid()`. El ÚNICO UPDATE posible es el **borrado lógico**, firmado por quien lo hace, y no se puede «resucitar» (lección H-2 de `informes`). Espeja `quitarDocumento` (admin) + `puedeQuitarDoc` (quien subió).
- **Sin DELETE**: nadie borra filas desde el cliente.
- `REVOKE ALL ... FROM anon`. Auditoría: `trg_audit` → `audit_log` (INSERT/UPDATE/DELETE). Sin realtime: carga perezosa al abrir el modal.
- CHECK: `tipo` ∈ {pedido_medico, consentimiento, examen, informe_externo, otro} · `nombre` 1..120 · `mime` ∈ {application/pdf, image/jpeg, image/png} · `bytes` 1..10485760 · `nota` ≤ 300 · `storage_path LIKE patient_id || '/%'` (UNIQUE) · borrado coherente (`deleted` ⇔ `deleted_at` y `deleted_by` no nulos). FK a `patients` ON DELETE CASCADE.

**storage.objects (bucket documentos)** — 3 policies, `b2a_documentos.sql`. Bucket **privado** (`public = false`), `file_size_limit` 10 MB, `allowed_mime_types` PDF/JPEG/PNG. Ruta `<patient_id>/<uuid>.<ext>`: nunca el nombre original (PII).
- SELECT `documentos_obj_select` — `bucket_id = 'documentos'` (todo autenticado; el front lee con URL firmada de 300 s)
- INSERT `documentos_obj_insert` — `bucket_id = 'documentos' AND (is_admin() OR is_secretaria() OR is_terapeuta())`
- DELETE `documentos_obj_delete` — `bucket_id = 'documentos' AND (is_admin() OR owner_id = auth.uid()::text)`: solo para limpiar el objeto si falla el INSERT de la fila. «Quitar» en la app NO borra el objeto.
- Sin UPDATE: no hay upsert ni renombrado desde el cliente (`upsert:false`).

**audit_log**
- SELECT — solo admin
- Sin INSERT/UPDATE/DELETE desde cliente; inmutable por trigger (`audit_log.sql`). ✅

## Posturas y pendientes (decisiones, no bugs urgentes)

- **C-2 — "lectura abierta" de PHI:** `patients`, `session_log`, `informes` tienen `SELECT = true` → cualquier cuenta autenticada lee la historia clínica + cédula/tel/email de TODOS. No es acceso público (solo logueados) y puede ser operativamente válido en una clínica chica que se cubre entre sí, **pero bajo LOPDP requiere decisión consciente + base de licitud + (ideal) log de lecturas.** DECISIÓN PENDIENTE del equipo.
- **H-1 — `session_log` UPDATE demasiado abierto:** acotar a "sesiones propias del terapeuta + admin/secretaria". Depende de si los terapeutas se cubren entre sí (misma decisión que C-2).
- **H-2 — `informes` UPDATE entre usuarios:** acotar a autor o admin; poner `DEFAULT auth.uid()` y validar `deleted_by`. Pendiente.
- **H-3 — auditar `informes`:** agregar al trigger de `audit_log` (se hace en esta tanda). ✅ en progreso.
