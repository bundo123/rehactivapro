# PLAN_PROXIMO.md

> Generado: 2026-06-03 · **Solo análisis** (no se tocó código, DB, ni git).
> Alcance: `js/` (22 módulos), `api/informe.js`, `index.html`, `*.sql`, docs.
> Método: lectura archivo por archivo + grep de verificación + `node --check` en los 22 módulos (**22/22 OK**).
> Foco PARTE 3: lo que **no** está ya resuelto ni listado en `AUDITORIA.md`.

---

## Resumen ejecutivo (TL;DR)

- **PARTE 1** son 5 cambios chicos y localizados en `informes.js` + `ia.js`. El único con "trampa" es el de la narrativa en **PDF** (hoy el PDF copia `innerText`, pierde estilos → necesita mini-refactor para que los títulos salgan en negrita). El bug de color EVA es real **y además** revela una inconsistencia que David no vio: el número y la banda del gráfico usan cortes distintos.
- **PARTE 2** (protocolos asignables) es factible y de alto valor para el "reemplazo de Reliv", pero tiene **4 decisiones de diseño** que conviene cerrar antes de tocar nada (sobre todo: ¿protocolo por paciente o por episodio? y ¿cómo evitar que la IA invente hallazgos a partir de la plantilla?).
- **PARTE 3**: el código está sano (los refactors recientes cerraron B1 y varios de `AUDITORIA.md`). Hallazgos nuevos relevantes: **fuga de `pm-age` viejo a pacientes nuevos**, **etiquetas de facturación que no se resetean por episodio**, **todos los protocolos guardados muestran el ícono de rodilla**, y **el endpoint de IA no tiene límite de gasto**.

**Lo que ya está resuelto** (no hace falta tocar): el bug "EVA no precarga al EDITAR" (item viejo) lo arregló el commit `c1da7bc`. B1 (`done` desincronizado) quedó obsoleto al derivar `done` de `session_log`. S1 (XSS en protocolos), M1–M4 (código muerto de `app.js` y helpers) ya borrados.

---

# PARTE 1 — Ajustes finales del informe

Cada item: **archivo:línea · cambio propuesto · riesgo.** Todo en `js/informes.js` salvo la narrativa (`js/ia.js`).

## 1.1 — BUG color EVA (umbral mal calibrado)

**Dónde:** `js/informes.js:74`
```js
function evaColor(v){ return v>=6?'#E24B4A':v>=2?'#1D9E75':'#29ABE2'; }
```
→ hoy: 0–1 azul / **2–5 verde** / 6–10 rojo. Por eso el 2 y el 5 salen iguales (verde) y no se distingue dolor bajo de medio.

**Call-sites** (los 3 usan la misma función, así que con cambiar la función alcanza): tarjeta EVA inicial `:602`, tarjeta EVA actual `:604`, PDF `:705`.

**⚠️ Inconsistencia extra (bug que David no mencionó):** el gráfico de evolución pinta **bandas** con cortes DISTINTOS a `evaColor`. En `js/informes.js:670`:
```js
[[7.5,10,'rgba(226,75,74,.16)'],[4.5,7.5,'rgba(224,168,80,.15)'],[0,4.5,'rgba(29,158,117,.13)']]
// banda: 0–4 verde / 5–7 amarillo / 8–10 rojo
```
Resultado: un EVA **6** se pinta **rojo** como número (`evaColor`) pero el punto cae en la banda **amarilla** del gráfico. Se contradicen. **Hay que tocar las dos cosas juntas.**

**Investigación (escala EVA/VAS estándar):** la interpretación clínica más citada (Jensen, Collins, Serlin) es **0 sin dolor · 1–3 leve · 4–6 moderado · 7–10 severo**. Eso encaja casi con las bandas que ya tenés.

**Propuesta A (recomendada — 4 niveles, estándar clínico):**
```js
// 0 azul (sin dolor) / 1–3 verde (leve) / 4–6 amarillo (moderado) / 7–10 rojo (severo)
function evaColor(v){ return v>=7?'#E24B4A':v>=4?'#E0A850':v>=1?'#1D9E75':'#29ABE2'; }
```
Y alinear las bandas (`:670`) a los mismos cortes:
```js
[[6.5,10,'rgba(226,75,74,.16)'],[3.5,6.5,'rgba(224,168,80,.15)'],[0,3.5,'rgba(29,158,117,.13)']]
```

**Propuesta B (lo más cercano a tu "5–6 amarillo", conservando 0–1 azul):**
```js
// 0–1 azul / 2–4 verde / 5–6 amarillo / 7–10 rojo
function evaColor(v){ return v>=7?'#E24B4A':v>=5?'#E0A850':v>=2?'#1D9E75':'#29ABE2'; }
// bandas:
[[6.5,10,'rgba(226,75,74,.16)'],[4.5,6.5,'rgba(224,168,80,.15)'],[0,4.5,'rgba(29,158,117,.13)']]
```

**Decisión para David:** A o B (ver §Decisiones). Yo recomiendo **A** (más estándar; el 4 ya cuenta como moderado, que es lo correcto clínicamente).

**Riesgo:** muy bajo (solo color). El único cuidado: tocar `evaColor` **y** las bandas en el mismo cambio, o quedan en desacuerdo.

---

## 1.2 — Quitar del todo "Firma del terapeuta"

**Pantalla:** `js/informes.js:646-648` — eliminar el bloque entero:
```js
html+=`<div class="full-card" style="margin-top:14px;display:flex;justify-content:flex-end;...">
    <div style="text-align:center;min-width:200px"><div style="border-top:1px solid #1a1917;...">${esc(thFirma)}</div>
    <div style="font-size:10px;color:#9c9a92">Firma del terapeuta</div></div></div>`;
```

**PDF:** `js/informes.js:736` — eliminar:
```js
+'<div class="firma"><div class="ln">'+esc(thFirma)+'</div><div style="font-size:10px;color:#9c9a92">Firma del terapeuta</div></div>'
```
Y opcionalmente el CSS `.firma{...}` dentro del `<style>` del PDF (`:717`) queda sin uso.

**Limpieza colateral (opcional pero prolijo):** al quitar la firma, `thFirma` queda sin uso. Se calcula en `:547` (`const thFirma=...`), depende de `withThLog` (`:546`), se guarda en `_rptCtx` (`:651`) y se desestructura en `:688`. Se pueden borrar las 4 referencias. **OJO:** `thHeader` (el "Terapeuta" del encabezado, `:545`) **sí se sigue usando** (`:588` y PDF `:726`) — no lo toques.

**Riesgo:** muy bajo. Verificado por grep: `thFirma` no se usa en ningún otro lado.

---

## 1.3 — Narrativa clínica: títulos en negro/negrita fuerte + más espaciado

**Pantalla:** `js/ia.js:78` (función `sec()` dentro de `_renderPatientNarrative`). Hoy el título va verde, 11px:
```js
const sec=(h,body)=>body?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;...color:#1D9E75;margin-bottom:4px">${esc(h)}</div>...`:'';
```
**Cambio propuesto:**
```js
const sec=(h,body)=>body?`<div style="margin-bottom:18px">`
  +`<div style="font-size:12px;font-weight:800;color:#1a1917;letter-spacing:.02em;`
  +`margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,.1)">${esc(h)}</div>`
  +`<div style="font-size:13px;color:#1a1917;line-height:1.6">${fmtBody(body)}</div></div>`:'';
```
(negro fuerte `#1a1917`, `font-weight:800`, separación `margin-bottom:18px` entre secciones, fina línea inferior para jerarquía.)

**⚠️ PDF — la trampa:** el PDF **no** re-renderiza la narrativa: la copia con `aiEl.innerText` (`js/informes.js:693-696`) y la mete como `white-space:pre-wrap` (`:734`). Por eso en el PDF los títulos salen como texto plano sin negrita, **independiente de lo que hagas en pantalla.** Dos caminos:

- **Rápido (hack):** en `exportarPDF`, después de `aiText`, envolver en `<strong>` las 4 etiquetas conocidas con un regex (`Condición inicial`, `Evolución del tratamiento`, `Resultados obtenidos`, `Recomendaciones`). Frágil si cambian los títulos.
- **Robusto (recomendado):** exponer la narrativa **estructurada**. En `ia.js`, guardar dentro de `_renderPatientNarrative` un `let _lastNarrative = [{title, body}, …]` y exportarlo; en `exportarPDF` construir `'<h3 class="narr">'+esc(title)+'</h3><p>'+esc(body)+'</p>'`. Bonus: hoy el PDF muestra la narrativa como un bloque corrido plano — esto la convierte en secciones de verdad.

**Riesgo:** pantalla = bajo. PDF = bajo-medio (el robusto toca cómo se comparte el dato entre `ia.js` e `informes.js`).

---

## 1.4 — Detalle por sesión: resaltar la Evaluación inicial como bloque aparte

**Estado actual:** `js/informes.js:613-644`. La línea `:614` arma `sesLog` poniendo la 'Evaluación inicial' como **primera fila de la misma tabla** → se ve amontonada como una sesión normal.

**Cambio propuesto (pantalla):** separar la eval del resto y renderizarla como **callout destacado** ANTES de la tabla:
```js
const sesAsc = log.filter(s=>s.type!=='Fin de episodio');
const evalRow = sesAsc.find(s=>s.type==='Evaluación inicial');
const tratRows = sesAsc.filter(s=>s.type!=='Evaluación inicial');

// Bloque destacado (solo si hay eval):
if(evalRow){
  // el note viene como "anamnesis | Ant. familiares: … | Zonas: … | Inspección: …"
  const partes = (evalRow.note||'').split(' | ').filter(Boolean);
  html += `<div class="full-card" style="margin-bottom:14px;border-left:4px solid #1D9E75;background:rgba(29,158,117,.05)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:#1a1917">📋 Evaluación inicial — ${dmy(evalRow.date)}</div>
      <div style="font-size:13px;font-weight:700;color:${evaColor(evalRow.pb)}">EVA ${evalRow.pb??'—'}/10</div>
    </div>
    ${partes.map(p=>`<div style="font-size:12px;color:#3a3a36;line-height:1.55;margin-bottom:3px">${esc(p)}</div>`).join('')}
  </div>`;
}
```
Luego la tabla "Detalle por sesión" usa **`tratRows`** (y su título cuenta `tratRows.length`, no `sesLog.length`).

**PDF:** espejo en `js/informes.js:701-715` — mismo split; el bloque eval como `<div>` resaltado antes de la `<table>`.

**Detalles a cuidar:**
- Si no hay eval inicial → no mostrar el bloque (no romper).
- El conteo del título "Detalle por sesión (N)" pasa a ser el de tratamiento.
- Hoy la columna "Acciones" de la eval permite **Editar** pero no **Eliminar** (`:631`); si la eval sale de la tabla, decidí si el bloque destacado lleva un botoncito "Editar" (mismo `editSession('${p.id}','${evalRow.id}')`).

**Riesgo:** medio (toca pantalla y PDF; varios bordes: sin-eval, conteo, botón editar).

---

## 1.5 — Quitar los círculos de iniciales del Informe Paciente

**(a) Círculo del buscador/combobox** — `js/informes.js:421` (cada fila del desplegable de resultados):
```js
<div style="width:32px;height:32px;border-radius:50%;background:#e8f5f0;color:#1D9E75;...">${esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
```
Quitar ese `<div>`. La fila usa `display:flex;align-items:center;gap:10px` → al sacar el avatar, queda el bloque de texto; eventualmente bajar el `gap`.

**(b) Círculo grande junto al nombre** — `js/informes.js:576`:
```js
<div class="avatar" style="background:${thC.border}22;color:${thC.text};width:52px;height:52px;font-size:18px;flex-shrink:0">${esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
```
Quitar ese `<div>`. El header es `display:flex;align-items:center;gap:14px` → queda nombre + botones. Tras quitarlo, `thC` (`:539`) queda sin uso (solo se usaba acá) → se puede borrar la declaración. **No** borres la **clase** `.avatar` (la usan agenda/terapeutas/resumen).

**Consistencia (opcional, no lo pediste):** el buscador **global** del top-bar (`js/search.js:26`) también dibuja un círculo de iniciales. Si querés la app 100% plana como Pacientes, se quita igual. Lo dejo como Idea.

**Riesgo:** bajo. Solo ajustar el layout para que el texto no quede descolgado.

---

# PARTE 2 — Protocolos asignables al paciente (feature grande) · PLAN v2 FINALIZADO

> **Estado:** plan cerrado (decisiones D2–D5 tomadas, ver §2.4). Se ejecuta en 2 commits:
> **PR-A** "asignar protocolo al paciente + arreglar íconos (img y def)" — sin IA.
> **PR-B** "contexto del protocolo → IA" — con barrera anti-alucinación y tope de tope de contexto.
> El **SQL lo corre David** en Supabase ANTES de aplicar PR-A (las escrituras 404ean sin las columnas).

## 2.1 — Cómo está hoy (estructura real)

**Tabla `protocols`** (de `auth.js:72` y `auth.js:235`): columnas `id, name, diag_keywords, sessions, freq, discharge_criteria` (+ `created_at`). En memoria: `{id, name, diag, sessions, freq, alta}`.

**Importante:** los campos `img` (ícono de zona corporal) y `def` (descripción breve) **solo existen en `DEFAULT_PROTOCOLS`** (`auth.js:26-42`, hardcodeados). **No se mapean desde la DB ni se guardan** (`dbSaveProtocol`, `auth.js:235-240`, no los escribe). Doble consecuencia ya visible en producción:
- **I3 (`img`):** todo protocolo creado/editado en la app cae al fallback `svgsSmall[p.img]||svgsSmall.knee` (`protocolos.js:132`) → se ve como **Rodilla**.
- **Bug gemelo de `def` (D5):** `renderProtocols` (`protocolos.js:137`) muestra `p.def` pero, al no mapearse ni guardarse, **la definición nunca aparece** para protocolos reales (solo para los DEFAULT). Mismo patrón que `img`; se arregla junto en PR-A.

**Asociación protocolo↔paciente: hoy NO existe de forma explícita.** Es **implícita y frágil**: `getProtocolRows()` (`protocolos.js:155-168`) recorre pacientes × protocolos y los matchea por **substring** del `diag` del paciente contra las `diag_keywords` del protocolo. Eso solo alimenta el widget de "Adherencia a protocolos". Un paciente puede matchear 0, 1 o varios protocolos. **Bug latente:** una `diag_keyword` vacía (`''`) hace `includes('')===true` → matchea a todos; se corrige con guard `k&&` en PR-A.

**Tabla `patients`** (`pacientes.js`): no tiene ninguna columna que apunte a un protocolo.

## 2.2 — La idea: contexto rico (markdown) para que la IA escriba mejor (PR-B)

El informe IA (`ia.js:genPatientAI`) hoy arma el prompt **solo** con datos del paciente (edad, diagnóstico, eval inicial, historial de sesiones). No sabe nada del "protocolo esperado". Si cada protocolo llevara un **contexto clínico** (objetivos por fase, técnicas típicas, hitos esperados, criterios de alta, señales de alarma), la IA podría:
- contrastar la evolución real contra los hitos esperados del protocolo,
- redactar recomendaciones alineadas a la fase del tratamiento,
- usar terminología y criterios de alta consistentes.

⚠️ Riesgo central de PR-B: que la IA **redacte la plantilla como si le hubiera pasado al paciente**. Mitigación = barrera anti-alucinación reforzada + marcar el bloque como **referencia, no historia clínica** + tope duro de **1.200 caracteres** (D4) sobre el contexto inyectado.

## 2.3 — Plan de implementación

### A. Migración DB (Supabase SQL editor) — **la corre David, ANTES de PR-A**

```sql
alter table public.protocols add column if not exists clinical_context text;  -- markdown (PR-B)
alter table public.protocols add column if not exists img text;               -- zona corporal (arregla I3)
alter table public.protocols add column if not exists definition text;        -- descripción breve (arregla bug def, D5)
alter table public.patients  add column if not exists protocol_id uuid
     references public.protocols(id) on delete set null;
```
> 4 columnas, todas aditivas/nullable. Las **lecturas** (mappers `select('*')`) son seguras aun sin correr el SQL (las columnas inexistentes llegan `undefined`). Las **escrituras** (`dbSaveProtocol`, insert/update de `patients`) **fallan con 404 hasta que existan** → por eso PR-A no se pushea hasta "SQL listo".

---

### PR-A — asignar protocolo al paciente + arreglar íconos (img y def) · SIN IA

**B. Mappers leen columnas nuevas:**
- `auth.js:72` (protocolos): agregar `img:r.img||''`, `def:r.definition||''`, `clinicalContext:r.clinical_context||''`. *(el `clinicalContext` se mapea ya en PR-A aunque solo lo use PR-B — es lectura inocua).*
- `auth.js:63-71` (pacientes): agregar `protocolId:r.protocol_id||null`.
- `realtime.js:_mapPatient` (`:78-86`): agregar `protocolId:r.protocol_id||null`. **NO** agregar mapper de protocolo: realtime no trackea `protocols`.

**C. `auth.js dbSaveProtocol` (`:237`):** persistir las 3 columnas nuevas en el upsert:
```js
const d={name:p.name,diag_keywords:p.diag,sessions:p.sessions,freq:p.freq,discharge_criteria:p.alta,
  img:p.img||null,definition:p.def||null,clinical_context:p.clinicalContext||null};
```

**D. Modal de protocolo (`index.html` `#protocol-modal`, tras `:575`) + `protocolos.js`:**
- `#prot-img` = `<select>` de zona corporal, valores = claves de `svgsSmall` (shoulder/hip/hand/arm/head/elbow/spine/knee/ankle). **Default `knee` `selected`** (alineado con el fallback de la tarjeta, así editar un protocolo viejo no le cambia el ícono solo).
- `#prot-def` = `<input>` de definición breve.
- `#prot-ctx` = `<textarea>` "Contexto clínico (para la IA)" → `clinicalContext` (se persiste en PR-A; se inyecta a la IA recién en PR-B).
- `openProtocolModal` (`:42-61`): reset → `prot-img='knee'`, `prot-def=''`, `prot-ctx=''`; rama edición → `prot-img=p.img||'knee'`, `prot-def=p.def||''`, `prot-ctx=p.clinicalContext||''`.
- `saveProtocol` (`:82`): leer los 3 campos al objeto (`img`, `def`, `clinicalContext`).

**E. Modal de paciente (`index.html`) + `pacientes.js`:**
- Insertar `<select id="pm-protocol" onchange="onPatientProtocolChange()">` entre Diagnóstico (cierra `:496`) y Doctor referente (`:497`), con opción `""` = "Sin protocolo".
- Poblarlo en `openPatientModal` (`:72-85`, junto a `pm-doctor` y sumarlo al array de reset `:77`) y en `openEditPatient` (`:276-294`, preseleccionando `p.protocolId`).
- **Auto-relleno `onchange` (D2):** `onPatientProtocolChange()` precarga `pm-diag` desde **`protocol.name`** (D2: el nombre, no las keywords) y `pm-sessions` desde `protocol.sessions`, **solo si están vacíos** (tratando `'12'` como default de sesiones). **Editable** después.
- `savePatient`: escribir `protocol_id` en el **insert** (`:157-160`, vía `_p.protocolId`) y en el **update** (`:130-133`); sumar `'pm-protocol'` al reset post-guardado (`:172`).
- `main.js`: exponer `onPatientProtocolChange` (import desde `pacientes.js` + `Object.assign(window,…)`).

**F. `protocolos.js getProtocolRows` (`:155`):** preferir el link explícito (`p.protocolId` → solo ese protocolo, sin fallback); si el paciente no tiene link, fallback al match por keyword **con guard `k&&`** (no matchear con keyword vacía). Retrocompat con pacientes ya cargados.

**G. `informes.js renderPatientReport` (`:586-589`):** mostrar el protocolo asignado como celda `Protocolo` en la grilla del encabezado (condicional: solo si `p.protocolId` resuelve). **Incluido en PR-A** (decidido).

**Cierre PR-A:** un commit `feat: protocolo asignable al paciente + fix íconos img/def`. `node --check` en los archivos editados. Verificar Vercel verde vía GitHub commit-status API.

---

### PR-B — contexto del protocolo → IA (commit aparte, después de PR-A)

**`ia.js genPatientAI`:** si el paciente tiene `protocolId` con `clinicalContext`, inyectar como **contexto de referencia** (D3: SOLO por link explícito `protocol_id`, **sin** fallback por keyword), truncado a **1.200 caracteres** (D4), con barrera reforzada:
```
CONTEXTO DEL PROTOCOLO (plantilla de referencia, NO son hallazgos de este paciente;
úsalo solo para enmarcar objetivos y recomendaciones, jamás como algo que se le hizo/registró): {clinicalContext[:1200]}
```
Probar la barrera antes de soltar (que la IA no narre la plantilla como historia real).

## 2.4 — Decisiones cerradas

1. **Protocolo por paciente o por episodio →** ✅ **por paciente (v1 simple)**: `patients.protocol_id` = protocolo del **episodio actual**. Al iniciar nuevo episodio (`nuevoEpisodio`, `pacientes.js:300`) se vuelve a elegir/limpiar. Se acepta perder el historial de "qué protocolo tuvo el episodio anterior".

2. **D2 — Auto-relleno del diagnóstico →** ✅ se precarga `pm-diag` desde el **NOMBRE del protocolo** (`protocol.name`), no desde las keywords. Editable. `pm-sessions` desde `protocol.sessions`. Ambos **solo si el campo está vacío** (`'12'` cuenta como default de sesiones).

3. **D3 — Contexto de IA →** ✅ se inyecta **SOLO por link explícito** (`protocol_id`). **Sin** fallback por keyword para la IA (el fallback por keyword queda solo para el widget de adherencia, §2.3-F).

4. **D4 — Tope del contexto inyectado →** ✅ **1.200 caracteres** del `clinicalContext` al prompt. Es plantilla (no PII) → fuera del `audit_log` (los protocolos ya están fuera, `audit_log.sql:7`).

5. **D5 — Bug gemelo de `def` →** ✅ se arregla **dentro de PR-A**, mismo patrón que `img` (columna `definition`, mapper `def:r.definition||''`, persistencia en `dbSaveProtocol`, input `#prot-def` en el modal).

6. **Adherencia: convivir con keyword →** ✅ link explícito con fallback a keyword (guard `k&&`). Los pacientes existentes (sin `protocol_id`) siguen matcheando por keyword hasta que se les asigne protocolo.

**Notas menores:** `protocols` **no** está en realtime (`realtime.js`), así que editar un protocolo no se sincroniza en vivo (requiere recargar) — aceptable, es plantilla. `createProtocol` es **solo admin** (`permissions.js:12`); asignar a paciente cae bajo `editPatient` (admin/secretaria/terapeuta) — coherente.

**Riesgo global:** medio. La migración es aditiva (columnas nullable). El grueso del riesgo está en PR-B (que la IA no invente), por eso va en commit aparte con la barrera probada.

---

# PARTE 3 — Auditoría general fresca

> Solo hallazgos **nuevos** o aún **abiertos**. Reconciliación con `AUDITORIA.md` al final.

## 🔴 CRÍTICO
*(Ninguno nuevo de pérdida de datos/seguridad grave. El borrado en cascada sin transacción — S3 — sigue abierto, ver Importante.)*

## 🟠 IMPORTANTE

### I1 — Fuga de `pm-age` viejo a pacientes nuevos (integridad de datos)
- **`js/pacientes.js:72-84` (openPatientModal)** limpia `pm-name, pm-diag, pm-cedula, pm-tel, pm-email, pm-dir, pm-birth, pm-sessions, pm-status, pm-billing-start` pero **NO** `pm-age` (campo `<input type="hidden" id="pm-age">`, `index.html:475`).
- `openEditPatient` (`:281`) **sí** setea `pm-age = p.age`. Entonces: editás un paciente con edad → abrís "Nuevo paciente" → el `pm-age` viejo queda cargado → `savePatient` (`:140`) lo escribe a DB (`age:parseInt(pm-age)`). El paciente nuevo nace con la **edad del paciente anterior**.
- **Fix:** agregar `pm-age` a la lista de limpieza en `openPatientModal`, o (mejor) dejar de leer/escribir `age` y usar solo `birth_date` (el campo `age` es retrocompat según CLAUDE.md).

### I2 — Las etiquetas de facturación no se resetean por episodio
- **`js/facturacion.js:13-21` (billingInfo)** calcula `sesYaCobradas` sumando **TODAS** las facturas históricas, mientras `p.sessions` se **resetea** al iniciar nuevo episodio. `pendientesActual` sí es episodio-aware (`utils.js:139`), pero `billingInfo` no.
- Efecto tras un nuevo episodio: `esCierre` (`:19`), el rótulo "Cobro X de Y" (`:84,133`) y la numeración de las cajitas (`sesYaCobradas+i+1`, `:86,118`) salen **inflados/incorrectos** (cuentan cobros de episodios anteriores contra las sesiones del episodio nuevo).
- **Fix:** que `sesYaCobradas` y `totalCobros` se calculen sobre el **episodio actual** (mismo criterio de frontera que `pendientesActual`: facturas con `fecha > último 'Fin de episodio'`).

### I3 — Todos los protocolos guardados muestran el ícono de rodilla
- **`js/protocolos.js:132`** `const svg=svgsSmall[p.img]||svgsSmall.knee;` — pero `p.img` **no se mapea desde DB** (`auth.js:71`) ni **se guarda** (`auth.js:235`). Solo los `DEFAULT_PROTOCOLS` tienen `img`. Cualquier protocolo creado/editado en la app cae al `||svgsSmall.knee`.
- **Fix:** se resuelve junto con **PARTE 2.D** (columna `img` + selector en el modal). Hasta entonces, todo protocolo real se ve como "Rodilla".

### I4 — `/api/informe` sin límite de gasto ni tamaño de prompt
- **`api/informe.js:30-47`** valida el token Supabase (bien), pero **cualquier usuario autenticado** (incluido `terapeuta`) puede llamar en bucle o mandar un `prompt` arbitrariamente grande. `max_tokens:1024` capa la salida, pero la **entrada no tiene tope** y no hay rate-limit. Una cuenta comprometida o un bucle accidental puede **quemar la API key paga** de Anthropic.
- **Fix barato:** (a) cap server-side de longitud del `prompt` (p.ej. rechazar > ~8–12k chars con 413); (b) rate-limit simple por usuario/minuto (Vercel KV o un mapa en memoria del edge). Opcional: chequear rol (`viewAI` = admin/terapeuta, no secretaria) leyendo `profiles`.

### I5 — Borrado en cascada desde el cliente, sin transacción (S3, **sigue abierto**)
- **`js/pacientes.js:264-267`** borra `session_log`, `cobros`, `appointments` y `patients` en 4 llamadas secuenciales. Si una falla a media (red/RLS), quedan filas huérfanas sin rollback.
- **Fix:** RPC transaccional en Postgres, o `ON DELETE CASCADE` en las FKs. (Ya estaba en `AUDITORIA.md`/roadmap; lo reafirmo porque sigue presente.)

## 🟡 MENOR

### M-a — Código muerto: `protocolSVG` (los SVG grandes)
- **`js/protocolos.js:15-28`** (~13 SVG detallados) está **exportado** e **importado** en `main.js:46`, pero **nunca se llama** (grep: solo definición + import). `renderProtocols` usa `svgsSmall`, no `protocolSVG`.
- **Fix:** eliminar la función y su import. (O reutilizarla como ícono grande en el detalle del protocolo, si se quiere.)

### M-b — Código muerto: `dbUpdateBillingPendientes`
- **`js/auth.js:255-261`** definida pero **sin callers** (grep). Quedó huérfana tras el refactor "done/pendientes como fuente única" (`ffb3de5`). `AUDITORIA.md` M3 la listaba como "sí se usa" — **ya no**.
- **Fix:** eliminar.

### M-c — Datos write-only: `next_plan` / `sess-next`
- **`js/sesiones.js:180` y `:334`** guardan `next_plan` en `session_log` desde `#sess-next` (`index.html:653`), pero **nunca se lee ni se muestra** en ningún informe. Al **editar** una sesión, el input se limpia (`:131,:223`) y el update (`:263-265`) no lo incluye → el plan queda invisible y los edits no lo tocan.
- **Fix:** o **surfacearlo** (mostrar "Plan siguiente" en el detalle/PDF y/o pasarlo a la IA — encaja con PARTE 2), o **quitarlo** del modal. Hoy es una feature a medio cablear.

### M-d — `simWA` con número hardcodeado de fallback
- **`js/resumen.js:114`** `const num = (tel ? … : '593999211258');` — si el paciente no tiene teléfono, el botón WhatsApp abre un chat a ese número fijo con un mensaje dirigido al paciente. Confuso (probablemente es el número de la clínica).
- **Fix:** si no hay `tel`, deshabilitar el botón o avisar "sin teléfono", en vez de abrir un número fijo.

### M-e — `billing_pendientes` se sigue escribiendo en el INSERT de paciente
- **`js/pacientes.js:159`** escribe `billing_pendientes:_p.billing.pendientes` aunque la columna es **vestigial** (los comentarios en `auth.js:251` y `realtime.js:83` dicen que ya no se usa). Inofensivo pero inconsistente.
- **Fix:** quitarlo del payload (o documentar por qué se conserva).

### M-f — `console.log` de producción
- **`js/auth.js:93`** `console.log('Datos cargados desde Supabase')` + **`js/realtime.js:278`** `console.log('[Realtime] conectado')`. (J2 reafirmado + uno nuevo.)
- **Fix:** quitar o condicionar a un flag debug.

### M-g — Editar cita permite fecha pasada (B4, abierto) + `Math.random()` en recurrentes (B3, abierto)
- **`js/agenda.js:381`** el guard `ds<today` está **después** del `return` de la rama edición (`:377`) → editar mueve a días pasados. **`js/agenda.js:401`** `id:'rec-'+fecha+'-'+Math.random()` no es UUID. Ambos ya en `AUDITORIA.md`, siguen presentes.

### M-h — `alert()`/`confirm()` bloqueantes (J3, abierto y extendido)
- Persisten en agenda (`:140,:351,:358`), facturación (`simEmailFactura :347`, y **B2**: "Cobrar todos" dispara N `alert()` en bucle vía `:342→:327→:347`), pacientes (`:258`), sesiones (`:288`), resumen (`:122`). Ya existe `toast.js`/modales.
- **Fix:** migrar a modales/toasts no bloqueantes; en lote (B2) un solo resumen final.

### M-i — `openApptModal` no resetea `m-type`
- **`js/agenda.js:274-292`** setea status/note/etc. pero no `m-type`; queda el valor previo. Menor (casi siempre 'Fisioterapia').

## 🔵 IDEA / MEJORA

### Higiene del repo
- **Directorio basura `~/`** en la raíz (contiene solo `~/.claude`). Nació de un comando que expandió `~` literal en vez del home. No está trackeado, pero ensucia. **Borrar.**
- **`dist/`** en disco es un build viejo (gitignored). Puede confundir un `vite preview`. Limpiar si no se usa.
- **`package.json:name` = "temp-vite"** — cosmético; renombrar a `rehactivapro`.
- **J1 (abierto):** `index.html` duplica `<link rel="icon">` (líneas **15 y 591**) y `<title>` (**17 y 592**). Quitar los de la segunda mitad.

### Producto / datos
- **Columna `discharge_date` en `patients`** (ya anotado en PROYECTO_ESTADO): sin ella, "altas del mes" y retención no se calculan con honestidad y hoy se ocultan/relabelan en los informes. Setearla al pasar `status → 'alta'`.
- **Guardar informes generados en DB** (historial de informes) — está en tu roadmap; encaja con el reemplazo de Reliv.
- **Protocolos fuera de realtime y de audit_log** — al sumar `clinical_context` (PARTE 2) tener presente que no se sincroniza en vivo (ok, es plantilla).

### LOPDP (relevante para "reemplazo de Reliv = historia clínica")
- **Transferencia internacional de datos de salud:** el prompt de IA está **anonimizado** (sin nombre/cédula/terapeuta — bien), pero **sí** se envían a Anthropic el **diagnóstico**, la **anamnesis** y las **observaciones** de cada sesión (texto libre que puede contener identificadores). Bajo LOPDP esto es tratamiento de **dato sensible** por un sub-encargado en el exterior. Recomendado: (a) dejar constancia del sub-encargado (Anthropic) y base de licitud/consentimiento; (b) considerar un *scrub* de texto libre antes de enviar; (c) documentarlo en la política de privacidad. **No bloquea**, pero conviene tenerlo escrito antes de usarlo con pacientes reales.
- **Auditoría de lecturas** está marcada como "fase posterior" (`audit_log.sql:5`). Para una clínica bajo LOPDP, registrar **quién vio qué historia clínica** es lo siguiente lógico tras el log de escrituras.

### QA / proceso
- **Sin tests.** Como mínimo, un check de sintaxis en CI (corrí `node --check` en los 22 módulos: **22/22 OK**) y un smoke test manual antes de soltar a la clínica.
- **`loadAll` sin paginar** (J4) — ok para esta escala; vigilar cuando crezcan sesiones/citas.
- **`checkAutoNoas` solo cubre hoy** (J5) — citas pendientes vencidas de días pasados nunca pasan a `noas`.

---

## Reconciliación con `AUDITORIA.md` (qué cambió desde 2026-05-29)

| Item viejo | Estado hoy |
|---|---|
| S1 — XSS en `alta` de protocolo | ✅ Resuelto (`esc()` en `protocolos.js:139`, commit `d134c3e`) |
| S2 — permisos solo en cliente | 🟡 Sigue (decisión consciente; RLS es la seguridad real) |
| S3 — borrado en cascada sin transacción | 🟠 **Abierto** → I5 |
| B1 — `cycleStatus` desincroniza `done` | ✅ Obsoleto (`done` deriva de `session_log`, `cycleStatus` solo persiste status) |
| B2 — "Cobrar todos" N `alert()` | 🟡 **Abierto** → M-h |
| B3 — recurrentes con `Math.random()` | 🟡 **Abierto** → M-g |
| B4 — editar cita a fecha pasada | 🟡 **Abierto** → M-g |
| M1–M4 — código muerto (`app.js`, etc.) | ✅ Borrados (`efd7471`) |
| J1 — `<title>`/icon duplicados | 🔵 **Abierto** (líneas 15/591, 17/592) |
| J2 — `console.log` producción | 🟡 **Abierto** → M-f |
| J3/J4/J5 | 🟡 Abiertos (M-h, QA, checkAutoNoas) |
| "EVA no precarga al editar" (PROYECTO_ESTADO item 1) | ✅ Resuelto (`c1da7bc`) |

---

## Decisiones para David (cerrar antes de codear)

1. **Color EVA:** ✅ **DECIDIDO — Propuesta A** (0 azul / 1–3 verde / 4–6 amarillo / 7–10 rojo, estándar clínico). Bandas del gráfico a `0–3.5 / 3.5–6.5 / 6.5–10`.
   ```js
   // informes.js:74
   function evaColor(v){ return v>=7?'#E24B4A':v>=4?'#E0A850':v>=1?'#1D9E75':'#29ABE2'; }
   // informes.js:670 (bandas)
   [[6.5,10,'rgba(226,75,74,.16)'],[3.5,6.5,'rgba(224,168,80,.15)'],[0,3.5,'rgba(29,158,117,.13)']]
   ```
2. **Protocolo:** ✅ **DECIDIDO — por paciente (v1 simple)**: columna `patients.protocol_id` = protocolo del episodio actual; al iniciar nuevo episodio se vuelve a elegir/limpiar. Ver PARTE 2.3/2.4 opción (v1 simple).
3. **Narrativa en PDF:** pendiente — ¿hack regex (rápido) o narrativa estructurada compartida (robusto)? → recomiendo robusto.
4. **IA + contexto de protocolo:** pendiente — confirmar el refuerzo anti-alucinación y el tope de tokens antes de inyectar plantilla.
5. **`age` de paciente:** pendiente — ¿lo arreglamos (limpiar `pm-age`) o lo retiramos definitivamente en favor de `birth_date`?

---

## Orden de ataque sugerido (rápido → lento)

1. **PARTE 1 completa** (1.1–1.5) — chico, visible, bajo riesgo. Cierra los pedidos del informe.
2. **I1 (`pm-age`)** y **J1/higiene** — fixes de 1 línea, alto valor/riesgo nulo.
3. **I3 + PARTE 2.A–E** (asignar protocolo + arreglar ícono, sin IA) — PR-A.
4. **PARTE 2.F (IA + contexto)** — PR-B, con la barrera anti-alucinación probada.
5. **I2 (facturación por episodio)** y **I5 (cascade)** — correctitud de datos.
6. **Limpieza menor** (M-a, M-b, M-c, M-f) y **M-h** (alerts → toasts).

> Nota final: no toqué código, DB ni git. Todo lo de arriba es propuesta. Las "pruebas" corridas fueron read-only: `node --check` (22/22 OK) y grep de verificación de call-sites/código muerto.
