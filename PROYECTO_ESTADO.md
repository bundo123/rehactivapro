# RehactivaPro — Estado del Proyecto

> Generado: 2026-05-18 · Última actualización: 2026-06-06

---

## 🔜 PRÓXIMO: I2 — Facturación por episodio + I5 cascade + limpieza

> Protocolos asignables quedó **COMPLETO** (ver sesión 2026-06-06). Resto del roadmap detallado en **`PLAN_PROXIMO.md` (PARTE 3)**.

- **I2 — Facturación por episodio:** las etiquetas y la numeración de cobro **no se resetean** al iniciar nuevo episodio. `billingInfo` (`facturacion.js:13-21`) suma **TODAS** las facturas históricas contra `p.sessions` (que sí es episodio-aware) → "Cobro X de Y" y la numeración salen inflados. Fix: que `sesYaCobradas`/`totalCobros` se calculen sobre el **episodio actual** (misma frontera que `pendientesActual`).
- **I5 — Borrado en cascada sin transacción:** `deletePatient` (`pacientes.js`) borra session_log/cobros/appointments/patients en 4 llamadas secuenciales; si una falla a media, quedan huérfanos. Fix: RPC transaccional o `ON DELETE CASCADE` en las FKs.
- **Limpieza menor:** **M-a** (código muerto `protocolSVG` + su import en `main.js`), **M-b** (`dbUpdateBillingPendientes` sin callers), **M-c** (`next_plan` write-only: surfacearlo en informe/IA o quitarlo del modal), **M-f** (`console.log` de producción en `auth.js`/`realtime.js`), **M-h** (`alert()`/`confirm()` bloqueantes → toasts/modales).

### Pendientes salidos del QA de protocolos (chicos)
- **Celda "Protocolo" no aparece en el PDF:** PR-A solo agregó la celda a la **pantalla** (`renderPatientReport`). El encabezado del PDF se arma aparte (`buildPdfHtml`, `informes.js:777-784`, bloque "Datos del paciente") desde el render-model `m`, que **no** incluye protocolo. Falta: pasar el protocolo al snapshot (`_buildRenderModel`) y agregar la fila al PDF.
- **Buscador de diagnóstico con UX pobre:** el `<input list="diag-list">` del modal de paciente es poco usable; revisar (combobox type-ahead como el del Informe Paciente, o limpiar el datalist).
- **`": "` suelto al inicio del bloque "Evaluación inicial"** del informe: el split del `note` deja un separador colgando al principio del callout; limpiar el primer elemento vacío.

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
