# PLAN_CONTEXTO_CLINICO.md: el contexto clínico llega al informe IA

> Generado: 2026-09-23 · Base: `main` en `c44ee96` (18-sep, 419 pass / 0 fail).
> Lotes: **CTX-1** (CC, ahora) → carga de contenido (SQL, Jefferson) → **DIAG-2** (SQL, Jefferson) → **CTX-2** (CC, chico) → **CTX-3** (chat Fable, después).
> El SQL de este plan se probó en un Postgres 16 local con un mock de Supabase (`auth.uid()`, `auth.jwt()`, `is_admin()`, `is_terapeuta()` y el `audit_log.sql` real del repo). Es re-ejecutable.

---

## 1. Estado real (verificado en el código)

| Qué | Dónde | Estado |
|---|---|---|
| Catálogo cerrado de diagnósticos (tabla `protocols`, en la UI "Diagnósticos") | DIAG-1 `e7184eb` | ✅ en prod desde el 18-sep |
| El terapeuta crea el diagnóstico que le falta ("+ Nuevo") | `permissions.js:41`, RLS `admin_terapeuta_insert` | ✅ |
| Campo `clinical_context` (textarea de 3 filas) | `index.html:812` | ✅, pero **se ve y se guarda también en el alta del terapeuta** (ver ⚠️ 1) |
| El contexto va al prompt del informe IA **solo** por `protocol_id` | `ia.js:267-268` | ✅, con barrera anti-alucinación (`ia.js:276`, `:287`) |
| Tope de 1.200 caracteres | `ia.js:268` `.slice(0,1200)` | ⚠️ 2: **trunca en silencio**; la UI no avisa |
| CIE-10 del paciente en el prompt | `utils.js:455` `diagParaPrompt` | ✅ |
| Saber qué diagnósticos NO tienen contexto | tarjetas `protocolos.js:160-173` | ❌ la tarjeta no muestra nada |
| Quién validó el contexto y cuándo | nada | ❌ no existe |
| Auditoría de `protocols` | `audit_log.sql:7`, `:171` "protocols queda FUERA" | ❌ no se sabe quién creó ni quién cambió un diagnóstico |
| Pacientes legacy con texto libre (251 de 308 al 18-sep) | DIAG-2 | ❌ **sin enlazar**: su informe IA nunca recibe contexto |
| Fallback por palabra clave en conteos y adherencia | `protocolos.js:151`, `:185` | sigue en pie (se quita en CTX-2) |

**⚠️ 1, hueco real.** `openProtocolModal` (`protocolos.js:26`) muestra `#prot-ctx` a todos. `saveProtocol` (`:80`) lo manda siempre, y la RLS de INSERT acepta cualquier columna. Resultado: un terapeuta puede escribir contexto clínico sin curar al crear un diagnóstico, y ese texto va directo al prompt de la IA. Contradice la decisión de DIAG-1 de que "el admin cura el `clinical_context`".

**⚠️ 2.** Si el admin pega 1.800 caracteres, la IA recibe solo 1.200 y nadie se entera.

## 2. Objetivo y "terminado"

**Terminado =**
1. Cada diagnóstico **en uso** tiene un contexto clínico **validado** (quién y cuándo) con formato fijo.
2. Cada paciente activo está **enlazado** a un diagnóstico del catálogo.
3. El informe IA usa **solo** contexto validado.
4. La pantalla dice cuántos diagnósticos en uso faltan.

## 3. Ruta completa (quién hace qué)

| Paso | Quién | Qué | Depende de |
|---|---|---|---|
| 0 | Jefferson | Correr `inventario` (Anexo A, solo lectura) y pegar el resultado en el chat de planificación | — |
| 1 | Claude (chat) | Proponer fusiones de duplicados y mapeo texto viejo → diagnóstico; redactar un **borrador** de contexto por cada diagnóstico en uso (guías clínicas, plantilla §4) + hoja para la reunión | 0 |
| 2 | Reunión (Giovanni + terapeutas, 60 min) | Nombres finales · fusiones · mapeo legacy · **corregir** borradores (reaccionar a un borrador es 5× más rápido que escribir) · Giovanni valida | 1 |
| 3 | CC | **LOTE CTX-1** (§5) | nada: va **en paralelo** con 1–2 |
| 4 | Jefferson | Correr `ctx_protocols.sql` (antes del merge de CTX-1), luego `contexto_clinico_carga.sql` (lo genera Claude desde lo validado) | 2, 3 |
| 5 | Jefferson + CC | DIAG-2 por SQL (Anexo C con el mapeo final) → **LOTE CTX-2** (§7) | 2, 4 |
| 6 | Chat Fable | **CTX-3**: el prompt se arma en el servidor (§8) | 5 |

## 4. Formato fijo del contexto clínico

Máximo **1.200** caracteres (`CTX_MAX`). Es texto plano, sin datos de pacientes. Los nombres de técnica deben ser **exactos** de `PRO_TECNICAS` (`sesiones.js:10-17`), para que la IA cruce el contexto con los `tags` de cada sesión.

```
FASE INICIAL: objetivo · técnicas · duración típica
FASE INTERMEDIA: …
FASE AVANZADA / RETORNO: …
HITOS ESPERADOS: …
CRITERIOS DE ALTA: …
PRECAUCIONES Y SIGNOS DE ALERTA: …
MEDIDAS DE SEGUIMIENTO: EVA + escala específica
```

**Versionado del contenido:** `contexto-clinico/<slug>.md`, un archivo por diagnóstico, con este frontmatter:

```
---
diagnostico: <protocols.name EXACTO>
cie10_sugerido: M76.5
fuentes: <guías usadas>
borrador: Claude AAAA-MM-DD
validado_por: <nombre>
validado_el: AAAA-MM-DD
---
<texto que va a clinical_context>
```

Esos archivos entran en un commit de docs. `contexto_clinico_carga.sql` se genera desde ellos (UPDATE por `name` con dollar-quoting `$ctx$…$ctx$`).

---

## 5. LOTE CTX-1: el contexto se cura, se valida y se audita

**Rama:** `feat/ctx-1-contexto-curado` · **un commit:** `feat(diagnosticos): CTX-1 el contexto clínico se cura, se valida y se audita`
**Complejidad:** Low-Medium. Toca SQL, pero ya viene escrito y probado.

### 5.1 SQL: `ctx_protocols.sql` en la raíz (contenido literal del Anexo B)
- CC **solo lo versiona**. Jefferson lo corre en Supabase **antes** del merge.
- Qué hace:
  - Agrega `ctx_validado_por text` y `ctx_validado_at timestamptz` (nullable).
  - Trigger `trg_protocols_ctx_invalida`: si cambia el texto sin re-validar en el mismo UPDATE, o el texto queda vacío, la validación vuelve a NULL.
  - Policy `admin_terapeuta_insert`: el terapeuta inserta solo **sin** contexto y **sin** validación.
  - `trg_audit` en `protocols`.
- Pruebas hechas contra el mock:
  - El terapeuta crea sin contexto → OK.
  - El terapeuta crea con contexto → `new row violates row-level security policy`.
  - El admin valida → OK.
  - El admin cambia el texto sin re-validar → la validación vuelve a NULL.
  - El admin re-valida → queda validado.
  - El admin re-guarda sin tocar el texto → sigue validado.
  - Texto vacío → validación NULL.
  - El terapeuta intenta UPDATE → 0 filas.
  - El `audit_log` registra INSERT y UPDATE de `protocols`.

### 5.2 `js/utils.js`: lógica pura y testeable (junto a `diagParaPrompt`, `:455`)
```js
export const CTX_MAX = 1200;
export const CTX_PLANTILLA = 'FASE INICIAL: \nFASE INTERMEDIA: \nFASE AVANZADA / RETORNO: \nHITOS ESPERADOS: \nCRITERIOS DE ALTA: \nPRECAUCIONES Y SIGNOS DE ALERTA: \nMEDIDAS DE SEGUIMIENTO: EVA + ';
// 'vacio' | 'sin_validar' | 'validado'
export function ctxEstado(prot) { … }         // vacío = sin texto tras trim; validado = texto && ctxValidadoAt
export function ctxParaPrompt(prot) { … }     // '' si no está 'validado'; si lo está: trim().slice(0, CTX_MAX)
```

### 5.3 Mappers: `js/auth.js`
- `:83`: el mapper de protocolos suma `ctxValidadoPor: r.ctx_validado_por||null` y `ctxValidadoAt: r.ctx_validado_at||null`.
- `:333-338` `dbSaveProtocol`: suma `ctx_validado_por: p.ctxValidadoPor||null` y `ctx_validado_at: p.ctxValidadoAt||null`.

### 5.4 IA: `js/ia.js:267-268`
- `const protCtx = prot ? ctxParaPrompt(prot) : '';`
- El resto del prompt **no se toca**: barrera, secciones y extensión quedan igual.
- **Efecto buscado:** un contexto sin validar ya **no** llega a la IA.

### 5.5 Modal: `index.html:812` + `js/protocolos.js`
- **Markup:** reemplazar el `.field` de `#prot-ctx` por un bloque `#prot-ctx-block` con `data-permission="admin"`. El terapeuta no lo ve y su alta sale sin contexto. El bloque contiene:
  - Etiqueta "Contexto clínico (para la IA)" y botón `#prot-ctx-tpl` "Insertar plantilla", habilitado solo si el textarea está vacío.
  - `<textarea id="prot-ctx" rows="10">` **sin** `maxlength`: un pegado largo se ve y se corrige, no se corta.
  - Contador `#prot-ctx-count` "N / 1200", en rojo si pasa `CTX_MAX`.
  - Checkbox `#prot-ctx-ok` "Contexto validado por" + input `#prot-ctx-por`.
  - Línea `#prot-ctx-estado`: "Validado por X el dd/mm/aaaa" / "Sin validar" / "Vacío".
- **Nada de `onclick` inline nuevo.** Los listeners van en `initProtocolValidation()` (`protocolos.js:119`), con `addEventListener`, siguiendo el camino de la CSP estricta.
- `openProtocolModal` (`:26`):
  - Limpia o llena los campos nuevos.
  - Guarda en variables de módulo `_ctxOriginal` y `_valOriginal` (`{por, at}`), para detectar cambios.
- **Listener `input` de `#prot-ctx`:**
  - Actualiza el contador.
  - Si el texto ≠ `_ctxOriginal`, **desmarca** `#prot-ctx-ok`: todo cambio exige re-validar a conciencia.
- `saveProtocol` (`:54`):
  - Sin `editProtocol` (terapeuta, alta): `clinicalContext=''`, `ctxValidadoPor=null`, `ctxValidadoAt=null`.
  - Con `editProtocol` (admin):
    - `clinicalContext.length > CTX_MAX` → `showFieldError('prot-ctx', 'Máximo 1200 caracteres (tiene N)')` y no guarda.
    - `#prot-ctx-ok` marcado exige texto no vacío y `#prot-ctx-por` de 3+ caracteres. Si falta, `showFieldError`.
    - Si está marcado y el texto, el `por` y el estado de validación son los originales (re-guardar sin cambios), **se conserva** `_valOriginal.at`. Si no, `ctxValidadoAt = new Date().toISOString()` y `ctxValidadoPor = por.trim()`.
    - Si no está marcado: `ctxValidadoPor = null` y `ctxValidadoAt = null`.
  - El `Object.assign` optimista y el rollback existentes **no cambian**.

### 5.6 Lista: `js/protocolos.js:143` `renderProtocols` + `index.html:365`
- **Badge por tarjeta** según `ctxEstado(p)`: `Vacío` (rojo `#E24B4A`) · `Sin validar` (ámbar `#BA7517`) · `Validado` (verde `#1D9E75`). Lo ven todos los roles.
- **Resumen** en un `<div id="prot-ctx-resumen" data-permission="admin">` estático junto a `#protocol-search`: "N diagnósticos en uso sin contexto validado". En uso = `countPts(p) > 0`.
- **Filtro** `<label data-permission="admin"><input type="checkbox" id="prot-solo-pend"> Solo pendientes</label>`, con listener en init que re-renderiza. Pendiente = en uso y `ctxEstado !== 'validado'`.
- **CSS:** `.prot-ctx-badge` con sus variantes en `css/screens.css`, junto a `.prot-card` (`:266`).

### 5.7 Informe: `js/informes.js:740`
Debajo del botón "Informe clínico con IA", solo si `hasPermission('viewAI')`, una línea de 11 px que usa el `prot` que ya existe en `:640`:
- Validado → "La IA usará el contexto clínico validado de «{name}»."
- Con diagnóstico pero sin validar o vacío → "Sin contexto clínico validado: la IA redactará solo con los datos del paciente."
- Sin `protocol_id` → "Paciente sin diagnóstico del catálogo."

Todo con `esc()`.

### 5.8 Docs y SQL versionado
- **`audit_log.sql`:** comentarios de `:7` y `:171` ("protocols queda FUERA" → "protocols entra en CTX-1") + `'protocols'` en el array de tablas, para que el archivo siga siendo la fuente de verdad.
- **`rls_policies.md`:** la fila de `protocols` con la INSERT nueva, el trigger de validación y la auditoría.
- **`PLAN_CONTEXTO_CLINICO.md`:** este archivo, en la raíz y dentro del commit (precedente: `PLAN_*.md`).

### 5.9 Tests: `test/contexto.test.js` (nuevo)
- **`ctxEstado`:**
  - `null` → `'vacio'`.
  - `''` → `'vacio'`.
  - `'   '` → `'vacio'`.
  - Texto sin `ctxValidadoAt` → `'sin_validar'`.
  - Texto con `ctxValidadoAt` → `'validado'`.
- **`ctxParaPrompt`:**
  - Sin validar → `''`.
  - Validado → texto con trim.
  - Validado con 1.500 caracteres → exactamente `CTX_MAX`.
  - `null` → `''`.
- **`CTX_PLANTILLA`:** trae los 7 encabezados de §4 y su largo es < `CTX_MAX`.
- **`permissions.test.js`:** sin cambios; la matriz `editProtocol` ya existe.
- **Meta:** 419 + N pass / 0 fail; `npx vite build` OK.

### 5.10 Aceptación (smoke manual de Jefferson después del SQL y el deploy)
1. **Terapeuta:** "+ Nuevo" en la evaluación inicial → el modal **no** muestra contexto → guarda OK y vuelve al modal de evaluación con el diagnóstico elegido. DIAG-1 no debe romperse.
2. **Admin:**
   - Las tarjetas muestran el badge y el resumen cuenta bien.
   - "Solo pendientes" filtra.
   - Pegar más de 1.200 caracteres → el contador se pone rojo y no deja guardar.
   - Validar → badge verde.
   - Editar una coma → el check se desmarca solo; guardar así → "Sin validar".
3. **Informe de un paciente enlazado:** la línea bajo el botón dice validado o sin validar según corresponda.

### 5.11 Fuera de alcance de CTX-1
- Enlazar legacy (DIAG-2).
- Quitar el fallback por palabra clave (CTX-2).
- Prompt en el servidor (CTX-3).
- `protocols` en Realtime: otro cliente ve la validación al recargar o cuando vence el caché de 5 min (`auth.js:6`). Aceptable.
- CIE-10 por diagnóstico y lateralidad (DIAG-3).

---

## 6. Carga del contenido (después de la reunión)

1. Claude genera `contexto-clinico/*.md` (validados) y `contexto_clinico_carga.sql`, con un UPDATE por diagnóstico que fija `clinical_context`, `ctx_validado_por` y `ctx_validado_at` en la misma sentencia, para que el trigger no lo invalide.
2. Jefferson lo corre en Supabase.
3. Verificación:
   ```sql
   SELECT name, length(clinical_context), ctx_validado_por FROM protocols ORDER BY name;
   ```

## 7. DIAG-2 por SQL (sin pantalla) + LOTE CTX-2

- **DIAG-2 (Jefferson, SQL):** usar la plantilla del Anexo C, con el `VALUES` que salga de la reunión.
  - Guarda el texto viejo en `patients.diag_legacy` (columna nueva) y enlaza `protocol_id` + `diag = protocols.name`, así se respeta la sincronía de DIAG-1.
  - Lo ambiguo ("HOMBRO DERECHO") **no** se mapea: queda para el botón "Sin diagnóstico" del resumen, caso por caso.
  - `patients` está auditado, así que cada enlace queda en el `audit_log`.
  - Probado contra el mock.
- **LOTE CTX-2 (CC, Low):**
  - Versionar `diag2_enlace.sql` con el mapeo final.
  - Quitar el fallback por palabra clave de `countPts` (`protocolos.js:151-156`) y `getProtocolRows` (`:185+`). Queda solo el link explícito, igual que `ia.js`.
  - Ajustar tests.
  - Rama `feat/ctx-2-sin-fallback`.

## 8. Después: CTX-3 (chat Fable, Medium-High)

- El cliente manda `{patient_id, tipo}`.
- `api/informe.js`:
  - Lee paciente, sesiones y diagnóstico **con el token del usuario** (la RLS decide).
  - Arma el prompt en el servidor (se mueve de `ia.js` a `lib/prompt-informe.js`).
  - Aplica `ctxParaPrompt`.
  - Agrega system prompt y `temperature: 0.3`.
- Cierra el hallazgo "prompt del cliente reenviado tal cual" (benchmark #6) y hace que el contexto curado no se pueda saltar desde el navegador.

## 9. Decisiones para la reunión (Jefferson + Giovanni)

1. **Lateralidad:**
   - Recomendado: nombres **sin lado** ("Epicondilitis lateral", no "… izquierda"). El contexto clínico es el mismo para los dos lados.
   - El lado queda en la evaluación inicial hasta DIAG-3.
   - Si ya hay pares derecho/izquierdo, se fusionan: primero se re-apunta `protocol_id` y luego se borra el duplicado. El SQL lo prepara Claude.
2. **Tope:** si los borradores no caben en 1.200 caracteres, se sube `CTX_MAX` a 1.500 en **un** solo lugar (`utils.js`). No se sube "por si acaso": más contexto ≠ mejor informe.
3. **Regla desde ahora:** cuando un terapeuta crea un diagnóstico nuevo, su contexto se valida en ≤ 7 días. El resumen del paso 5.6 lo hace visible.

---

## Anexo A: inventario (solo lectura; Paso 0)

```sql
-- INVENTARIO DE DIAGNÓSTICOS — solo lectura, no modifica nada.
-- tipo = catálogo: cada diagnóstico del banco, cuántos pacientes lo usan y cuántos
--   caracteres de contexto clínico tiene (0 = vacío).
-- tipo = texto viejo: diagnósticos escritos a mano ANTES de DIAG-1 sin enlazar.
SELECT 'catálogo' AS tipo,
       pr.name AS diagnostico,
       pr.created_at::date AS creado,
       count(pa.id) FILTER (WHERE pa.status <> 'alta') AS activos,
       count(pa.id) AS total,
       coalesce(length(btrim(pr.clinical_context)), 0) AS ctx_chars
FROM public.protocols pr
LEFT JOIN public.patients pa ON pa.protocol_id = pr.id
GROUP BY pr.id, pr.name, pr.created_at
UNION ALL
SELECT 'texto viejo',
       coalesce(nullif(btrim(pa.diag), ''), '(vacío)'),
       NULL,
       count(*) FILTER (WHERE pa.status <> 'alta'),
       count(*),
       NULL
FROM public.patients pa
WHERE pa.protocol_id IS NULL
GROUP BY coalesce(nullif(btrim(pa.diag), ''), '(vacío)')
ORDER BY 1, 4 DESC, 2;
```

## Anexo B: `ctx_protocols.sql` (probado; va literal en la raíz)

```sql
-- =====================================================================
-- CTX-1 — El contexto clínico se CURA: solo el admin lo escribe, queda
-- VALIDADO (quién y cuándo) y todo cambio en `protocols` va al audit_log.
--
-- Correr UNA vez en el SQL editor de Supabase ANTES de mergear el código
-- de CTX-1. Re-ejecutable (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- =====================================================================
BEGIN;

-- 1. Validación del contexto clínico (nullable: nada existente se rompe).
ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS ctx_validado_por text,
  ADD COLUMN IF NOT EXISTS ctx_validado_at  timestamptz;

-- 2. La validación se cae sola si:
--    a) en un UPDATE cambia el texto y NO se re-valida en ese mismo UPDATE, o
--    b) el texto queda vacío.
--    Así ningún texto editado llega a la IA con un "validado" viejo.
CREATE OR REPLACE FUNCTION public.protocols_ctx_invalida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.clinical_context IS DISTINCT FROM OLD.clinical_context
     AND NEW.ctx_validado_at IS NOT DISTINCT FROM OLD.ctx_validado_at THEN
    NEW.ctx_validado_at  := NULL;
    NEW.ctx_validado_por := NULL;
  END IF;
  IF coalesce(btrim(NEW.clinical_context), '') = '' THEN
    NEW.ctx_validado_at  := NULL;
    NEW.ctx_validado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protocols_ctx_invalida() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protocols_ctx_invalida ON public.protocols;
CREATE TRIGGER trg_protocols_ctx_invalida
  BEFORE INSERT OR UPDATE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.protocols_ctx_invalida();

-- 3. El terapeuta sigue pudiendo dar de ALTA un diagnóstico a mitad de la
--    evaluación, pero SIN contexto clínico ni validación: eso lo cura el admin.
DROP POLICY IF EXISTS admin_terapeuta_insert ON public.protocols;
CREATE POLICY admin_terapeuta_insert ON public.protocols
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (is_terapeuta()
        AND coalesce(btrim(clinical_context), '') = ''
        AND ctx_validado_at  IS NULL
        AND ctx_validado_por IS NULL)
  );

-- 4. `protocols` entra al audit_log (antes quedaba FUERA): desde hoy queda
--    registrado quién crea un diagnóstico y quién cambia su contexto clínico.
DROP TRIGGER IF EXISTS trg_audit ON public.protocols;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

COMMIT;

-- Verificación (4 policies; INSERT con la condición nueva; 2 triggers propios):
-- SELECT policyname, cmd, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='protocols' ORDER BY cmd, policyname;
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid='public.protocols'::regclass AND NOT tgisinternal ORDER BY tgname;
```

## Anexo C: plantilla DIAG-2 (probada; el `VALUES` sale de la reunión)

```sql
BEGIN;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS diag_legacy text;
-- 1. Guardar el texto viejo antes de tocarlo (trazabilidad; el audit_log también lo registra).
UPDATE public.patients
   SET diag_legacy = diag
 WHERE protocol_id IS NULL AND diag_legacy IS NULL AND coalesce(btrim(diag), '') <> '';
-- 2. Enlazar por mapeo exacto (mayúsculas/espacios no importan). Lo ambiguo NO va acá.
WITH mapa(texto_viejo, diagnostico) AS (
  VALUES
    ('TEXTO VIEJO EXACTO', 'Nombre exacto en protocols.name')
)
UPDATE public.patients pa
   SET protocol_id = pr.id,
       diag        = pr.name
  FROM mapa m
  JOIN public.protocols pr ON pr.name = m.diagnostico
 WHERE pa.protocol_id IS NULL
   AND upper(btrim(pa.diag)) = upper(btrim(m.texto_viejo));
COMMIT;
```
