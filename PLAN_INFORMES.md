# LOTE 4 — PANTALLA DE INFORMES · crítica con evidencia, propuesta y plan por lotes

**Fecha:** 2026-09-01 · **Base:** main = `8f5405f` (leído `js/informes.js`, `js/ia.js`, `css/screens.css`, `index.html:262-300`) · **Maqueta:** `LOTE4_INFORMES_MAQUETA.html` (adjunta; tres pestañas, tokens existentes) · **Capturas reales:** todavía no las tengo (paso manual 1 del handoff). La crítica sale del código, que es más exacto que la captura para lo estructural; las capturas sirven para validar densidad y legibilidad con datos reales antes del lote High.

---

## PASO 1 — CRÍTICA CON EVIDENCIA

### 1.1 Qué muestra cada pestaña hoy

| | Semanal (`renderSemanal`, `informes.js:201-286`) | Mensual (`renderMensual`, `:297-360`) | Anual (`renderAnual`, `:362-407`) |
|---|---|---|---|
| **Contenedor de tarjetas** | `.kpi-grid` (auto-fit 150px) con `.kpi` (`screens.css:218-222`, valor 21px, borde .22) | `.informe-stat-grid` (3 col fijas) con `.stat` (`:231,:250-254`, valor 24px, borde .16) | igual que Mensual |
| **Tarjetas** | Citas totales · **Asistencia** (conf/total, cuenta pend en el denominador, `:208`) · No asistieron · Atendidos únicos · **Activos** (global, `:225`) | Sesiones del mes (=conf) · **Continuidad** (conf/(conf+noas)) · Inasistencias · **Pacientes activos** (global) · **Altas médicas (total)** (global, `:311`) · Nuevos pacientes | Sesiones acumuladas · Continuidad · **Altas (total)** (global) · Pacientes únicos · Inasistencias · **Proyección anual** (run-rate, `:381-383`) |
| **Selector de período** | Flechas en el header (`index.html:275-279`) | `<select>` **dentro del contenido** (`:326-328`) | **Ninguno**: siempre el año en curso (`:363-365`) |
| **Paneles** | Desempeño por terapeuta (util = conf / (horas×5), `:235-236`) · Top diagnósticos (texto libre `pt.diag` partido por coma, `:212`) · Próximos a alta ≥80% (global, `slice(0,5)` sin ordenar, `:214`) · Mapa de calor (`renderHeatmap`, `:95-119`) · Insights automáticos (`renderInsights`, `:151-187`) · No asistieron + WA | Pacientes por doctor referente (**todo el padrón**, no el mes, `:338-341`) · Tendencia 3 meses (barras, `:342,:354-358`) | Sesiones por mes (barras 12, `:398,:404-405`) |
| **Salida IA** | `#semanal-ai-output` arriba del contenido, caja verde texto plano (`ia.js:29-32`) | idem `#mensual-ai-output` | idem `#anual-ai-output` |
| **Botón IA** | Uno solo en el header para las tres (`index.html:282`), `data-permission="admin"` | | |

### 1.2 Métricas repetidas y métricas que no son del período

- **Conf/noas/continuidad** aparecen en las tres — bien, es lo que debe repetirse. Pero con **dos fórmulas y dos nombres**: "Asistencia" (semanal, `conf/total`) vs "Continuidad" (mensual/anual, `conf/decididas`), documentado como a propósito en `utils.js:175-179`. El dueño ve 84% el viernes y 92% el día 1 del mes siguiente por la misma clínica. Es una fuente de desconfianza gratuita.
- **"Sesiones del mes"** (`:330`) cuenta citas `conf`, no filas de `session_log`. En el resto de la app "sesiones" son las registradas (`doneEnLog`). Misma palabra, dos cosas.
- **Activos, Altas (total), Pacientes por doctor referente** son números del **padrón**, no del período: valen lo mismo en agosto que en julio, y salen idénticos en Semanal, Mensual y Anual. No informan nada del rango que dice el título.
- **Próximos a alta ≥80%** es una lista operativa (de Facturación/Pacientes), y encima sale con `slice(0,5)` sin ordenar: muestra los cinco primeros del array, no los cinco más cercanos.
- **Top diagnósticos** parte `pt.diag` por coma y toma el primer trozo: con texto libre ("Lumbalgia" / "lumbalgia crónica" / "Dolor lumbar") no agrupa nada. Cuando haya cobertura de CIE-10 (ya se captura, `pacientes.js`/`cie10.js`) puede volver por código.
- **Insights automáticos** (`:151-187`): "la franja con más citas", "X lidera la agenda", "N inasistencias". La tercera ya está en la tarjeta; las dos primeras no cambian ninguna decisión.
- **Proyección anual** (`:383`): `sesiones de meses completos / meses × 12`. Ignora estacionalidad (la clínica cierra en feriados y vacaciones) y el prompt anual de la IA **prohíbe** exactamente eso ("No proyectes cifras a fin de año a partir de meses incompletos", `ia.js:126`). La pantalla hace lo que le prohibimos al modelo.

### 1.3 Los dos gráficos de barras

**Mensual, "Tendencia — últimos 3 meses" (`:346-358`):** tres datasets en el **mismo eje Y**: `Sesiones` (conteo, ~400), `Continuidad %` (0–100) e `Inasistencias` (conteo, ~40). La barra de continuidad mide lo mismo que una de 92 sesiones; la de inasistencias es una raya. No responde "¿mejoró?" mejor que los chips `_deltaChip` que ya están en las tarjetas de arriba (`:330-335`), y con `continuidad ?? 0` (`:356`) un mes sin datos pinta **0%**, que es exactamente lo que `resumenCitas` evita devolver. **Eliminar.**

**Anual, "Sesiones por mes" (`:398-405`):** una serie, doce barras. Es el mismo dato (conf por mes) que el otro, con más ventana. Responde una pregunta real: *"¿crece? ¿qué meses caen?"* (estacionalidad, vacaciones del equipo, feriados) — eso sí decide cosas: cuándo tomarse vacaciones, si abrir tardes, cuándo hacer pauta. **Se queda, es el único**, y se le apila `noas` para que el mes flojo se distinga del mes con muchas faltas (no es lo mismo, y la acción es distinta).

Defectos comunes a los dos que delatan de dónde vienen: `grid.color:'rgba(255,255,255,0.05)'` (`:358,:405`) — líneas blancas sobre fondo blanco, resto del tema oscuro; `Chart.defaults.color='#6b6a64'` seteado en cada render (`:353,:403`), global.

### 1.4 Por qué no se parecen — diferencias de ESTRUCTURA

1. **Dos sistemas de tarjeta** (`.kpi` vs `.stat`) con tipografía, bordes y grilla distintos. No es color: es que son componentes distintos para lo mismo.
2. **El selector de período vive en tres lugares** (header / dentro del contenido / no existe).
3. **Semanal es un tablero de 6 paneles; Mensual son 6 tarjetas + lista + gráfico; Anual son 6 tarjetas + gráfico.** No hay una fila que se repita en las tres. La vista mental del dueño se resetea en cada pestaña.
4. **La IA no tiene lugar propio**: se inyecta arriba de todo, en verde, y desplaza el contenido cuando aparece.
5. **Las tarjetas globales** (Activos, Altas) hacen que el 60% de los números de Mensual/Anual no cambien al cambiar de mes — refuerza la sensación de "esto no me dice nada".

Bugs sueltos que salieron leyendo: texto de doctores en `#c8c6c0` sobre blanco (`:340`, casi invisible); `renderTherapistUtil` sin caller (`:148-149`, código muerto); `hmCol` (paleta vieja semáforo) solo la usa el util muerto (`:56-65`); la utilización semanal divide por `therapistHours(th).length*5` (`:235`) = asume 5 días y usa `startH/endH` de agenda, no `workStart/workEnd`.

---

## PASO 2 — QUÉ NECESITA VER EL DUEÑO

Lo que mide una clínica chica de rehabilitación para **decidir** (no para decorar), cruzado con lo que esta app ya tiene y con la regla "¿qué haría distinto si cambia?":

| Métrica | Qué decide | ¿Se puede hoy? | Veredicto |
|---|---|---|---|
| **Visitas asistidas** del período (y vs período anterior) | Ritmo del negocio; si cae, marketing/referentes; si sube, capacidad | Sí (`conf` con fecha ≤ hoy) | **Fila 1, las tres pestañas** |
| **Inasistencias** (n y %) | Recordatorios, política de confirmación, a quién llamar | Sí | **Fila 1** |
| **Continuidad** vs meta 85% | Es la meta declarada de la clínica | Sí (`resumenCitas`) | **Fila 1**, con **una sola fórmula** en las tres |
| **Pacientes nuevos** (y altas del período) | Flujo de entrada vs salida: si entran más de los que salen, hay que abrir horas | Sí (`createdAt`; altas: `status='alta'` sin fecha → ver nota) | **Fila 1** |
| **Ocupación por terapeuta** | A quién derivar los nuevos, quién tiene agenda muerta, si contratar | Sí, corrigiendo el denominador (días hábiles del rango × horario) | **Fila 2** |
| **Pacientes que dejaron de venir** (activos, última asistencia > 21 días, sin cita futura) | Llamar hoy. Un paciente que falta una vez tiene el doble de probabilidad de abandonar (Net Health) | Sí, todo en `state` | **Mensual, panel nuevo** — el más accionable |
| **Nuevos por doctor referente** del período | A qué médico agradecer/visitar; de quién depende la clínica | Sí (`doctorId` + `createdAt`) | **Mensual/Anual**, reemplaza la lista global |
| **Ocupación por hora y día** | Dónde ofrecer los turnos nuevos | Ya existe (heatmap) | **Semanal, se queda** |
| **No asistieron esta semana** + WA | Recuperar la cita | Ya existe | **Semanal, se queda**, con "2ª falta" / "sin próxima cita" |
| Visitas por paciente nuevo / cumplimiento del plan | Si los planes se completan (benchmark 10–12 visitas por caso) | A medias (`sessions` vs `doneActual`) | **No en este lote**: es del Informe de paciente / Seguimiento |
| Ingresos, costo por visita | — | La app no maneja dinero **por diseño** (`:218`) | Fuera |
| Satisfacción | — | No hay captura | Fuera |

Nota sobre **altas del período**: `patients.status='alta'` no tiene fecha (hay una "Nota futura — columna `discharge_date`" en PROYECTO_ESTADO:1209). Sin ella, "altas en el mes" se aproxima con la fecha del último `'Fin de episodio'` o del último `updated_at`. Para el lote Low se muestra como texto secundario ("9 altas en el mes") solo si la aproximación es defendible; si no, se deja el total y se agenda la columna. **No inventar precisión.**

Fuentes consultadas para la tabla (métricas estándar de consultorios de fisioterapia; ninguna es normativa, sirven para no inventar KPIs): [PT Pintcast — 7 KPIs](https://www.ptpintcast.com/the-7-kpis-every-physical-therapy-practice-owner-needs-to-run-a-smarter-clinic/) (visitas, nuevos, FTE), [HelloNote — Super 7 KPIs](https://hellonote.com/blogs/super-7-kpis-you-should-be-tracking-in-your-therapy-practice/) (arrival rate, visitas por paciente nuevo 10–12), [Net Health — missed visits](https://www.nethealth.com/blog/reduce-rehab-therapy-no-shows-why-missed-visits/) (1 de 4 falta; una falta duplica el abandono), [SPRY — KPIs](https://www.sprypt.com/blog/measuring-what-matters-key-performance-indicators-modern-therapy-clinics), [PatientStudio — 12 KPIs](https://patientstudio.com/blog/key-performance-indicators-kpis-for-physical-therapy).

---

## PASO 3 — DISEÑO

### 3.1 El esqueleto (idéntico en las tres; ver maqueta)

```
HEADER   Informes · [Semanal|Mensual|Anual] · <selector de período contextual, siempre a la derecha>
FILA 1   4 tarjetas .stat (informe-stat-grid a 4 col): Asistidas · Inasistencias (n · %) · Continuidad (vs 85%) · Pacientes nuevos
         cada una con su chip vs período anterior (_deltaChip generalizado a semana/mes/año)
         + aviso ámbar si hay citas pasadas todavía 'pend' (dato sucio que distorsiona todo lo demás)
FILA 2   inf-grid 1.5fr/1fr:  [Por terapeuta: asistidas · inasist. · ocupación]   [Lectura del período (IA)]
FILA 3   lo único que cambia por pestaña:
           Semanal → [Ocupación por hora y día (heatmap)] [No asistieron esta semana + WA]
           Mensual → [Dejaron de venir]                    [Nuevos por doctor referente]
           Anual   → [Asistidas e inasistencias por mes (Chart.js, apilado)]  ancho completo
```

Requisitos duros cumplidos: mismo `.stat`, `.informe-stat-grid`, `.panel`, `.inf-grid`, `.util-bar`, `.avatar`, `.hdr-select`, `.seg`, `.week-nav` que ya existen; tokens `--rh-*` sin uno nuevo; Chart.js solo para el anual. CSS nuevo: **tres reglas** (`.ia-panel`, `.ia-body`, `.data-warn`) y un cambio de `informe-stat-grid` a 4 columnas (hoy 3, `screens.css:231`) — que no afecta a nadie más porque solo la usan Mensual/Anual.

### 3.2 Una sola fórmula, un solo nombre

- **Continuidad** = `conf / (conf + noas)` (la de `resumenCitas`) en las tres pestañas. "Asistencia" (semanal) desaparece.
- **Asistidas** = `conf` con `date <= hoy`. Las `conf` futuras de la semana en curso no son asistencias (hoy el semanal las suma, `:205`).
- **Pendientes** no entran en ninguna tasa: se muestran como **aviso** ("4 citas pasadas siguen pendientes") porque son un error de carga, no un dato.
- **Ocupación** = asistidas / (slots del horario del terapeuta × días hábiles del rango que ya pasaron). Con `workStart/workEnd` si existen, si no `startH/endH`. Días hábiles = Lun–Vie menos nada más (los bloqueos de vacaciones del lote 2 se restan cuando exista la tabla — anotar el gancho).

### 3.3 La salida de IA como parte de la pantalla

- Panel `.ia-panel` en Fila 2 derecha, siempre presente, con tres estados: **vacío** (texto gris + botón "Generar con IA"), **cargando** (skeleton en la misma caja), **generado** (texto en `--rh-ink`, 12.5px/1.65, párrafos; pie con "Generado 1 sep 09:14 · Agosto vs julio"; botón pasa a "Regenerar" outline).
- El botón del header (`index.html:282`) **se elimina**: el botón vive en el panel, en la pestaña a la que aplica. `genInformeAI` (`ia.js:131-136`) deja de hacer falta; cada panel llama a su `gen*AI`. `callAI` (`ia.js:9-38`) recibe el `targetId` del cuerpo del panel; la caja verde inline de `:29-32` se reemplaza por clases.
- Permiso: igual que hoy (`viewAI` / `data-permission="admin"`): para quien no puede, el panel muestra "Solo admin" y sin botón, no desaparece (el esqueleto no cambia por rol).
- El prompt no cambia en este lote. Pero como la pantalla ahora muestra "Por terapeuta" y "Dejaron de venir", en un lote posterior conviene pasarle esas dos listas al modelo — hoy el mensual solo recibe cuatro números (`ia.js:80-97`).

### 3.4 Lo que se ELIMINA y por qué (importa tanto como lo que se agrega)

| Elemento | Dónde | Por qué se va |
|---|---|---|
| Gráfico "Tendencia — últimos 3 meses" | `informes.js:342,346-358` | Mezcla conteos con % en un eje; duplica los chips de variación; pinta 0% donde no hay dato. |
| Tarjeta **Activos** (semanal) y **Pacientes activos** (mensual) | `:225,:333` | Número del padrón, no del período. Vive en Pacientes. |
| Tarjeta **Altas médicas (total)** (mensual y anual) | `:334,:393` | Total histórico sin fecha; no cambia con el rango. Vuelve como "altas del período" cuando exista `discharge_date`. |
| Tarjeta **Proyección anual** | `:383,:396` | Run-rate sin estacionalidad; contradice la instrucción que le damos a la IA. |
| Tarjeta **Atendidos únicos** (semanal) | `:224` | En una semana ≈ asistidas/2.5, no decide nada. En anual se conserva como texto secundario ("186 pacientes distintos"). |
| Tarjeta **Citas totales** (semanal) | `:221` | Reemplazada por Asistidas; el total con pendientes no es un dato. |
| Panel **Top diagnósticos** | `:249-251` | Texto libre partido por coma, no agrupa. Vuelve por CIE-10 cuando la cobertura lo permita. |
| Panel **Próximos a alta ≥80%** | `:252-255` | Lista operativa de Facturación/Pacientes; además `slice(0,5)` sin ordenar. |
| Panel **Insights automáticos** | `:151-187, :264-267` | Trivia. Ninguno cambia una decisión. |
| Lista **Pacientes por doctor referente** (global) | `:337-341` | Reemplazada por "Nuevos por doctor referente" **del período**. De paso se va el `#c8c6c0` ilegible. |
| Botón **Análisis con IA** del header | `index.html:282` | El botón vive en el panel de cada pestaña. |
| `renderTherapistUtil`, `hmCol` | `:129-146, :56-65` | Código muerto (sin caller / solo lo usa el muerto). |
| "Asistencia" como métrica | `:208,:222` | Una sola fórmula: continuidad. |

Lo que **se queda tal cual**: `renderHeatmap` + leyenda (`:95-127`), lista de No asistieron con WA (`:269-282`), `_deltaChip` (`:34-50`, generalizado), `resumenCitas`/`semanaRango`/`citasEnPrefijo` (utils, con sus tests).

### 3.5 Lo que se AGREGA

1. **Por terapeuta** (tabla, las tres pestañas) — evolución del "Desempeño por terapeuta" del semanal, con el denominador corregido.
2. **Dejaron de venir** (mensual) — activos con última asistencia > 21 días y sin cita futura; columnas: paciente, última asistencia, sesiones `X/N`, terapeuta, WA. Ordenado por sesiones restantes ascendente (el que está a una del alta primero).
3. **Nuevos por doctor referente** (mensual/anual).
4. **Aviso de datos** (fila 1) cuando hay `pend` con fecha pasada en el rango.
5. **Chip de variación** también en Semanal (vs semana anterior) y en Anual (vs mismo período del año anterior, si hay datos; si no, `—`).
6. **Selector de año** en Anual (hoy no existe): años con datos.

---

## PLAN POR LOTES

### Lote 4a — "Quitar lo que sobra" · **Low** · sin SQL · ~1 sesión de CC
Barato y ya mejora la pantalla. Sin tocar el esqueleto todavía.
- Eliminar: chart 3 meses, tarjetas Activos/Altas/Proyección/Atendidos/Citas totales, paneles Top diagnósticos / Próximos a alta / Insights, lista global por doctor, `renderTherapistUtil`, `hmCol`, botón IA del header (mover el botón dentro de cada `subtab-*` como paso intermedio).
- Unificar fórmula: semanal pasa a Continuidad (`resumenCitas`) y Asistidas = conf pasadas.
- Arreglar `grid.color` blanco del chart anual, `#c8c6c0`.
- Tests: `informes-rango.test.js` se extiende con "asistidas no cuenta conf futuras".
- Strings negativas para el cierre: `Proyección anual`, `Insights automáticos`, `Top diagnósticos`, `Próximos a alta`.

### Lote 4b — "Esqueleto común" · **Medium** · sin SQL
- Una función `renderInforme(rango)` que arma Fila 1 y Fila 2 para los tres rangos a partir de un objeto `{ citas, citasPrev, patients, therapists, diasHabiles }`; `renderSemanal/Mensual/Anual` solo construyen el rango y la Fila 3.
- `.stat` 4 columnas; selector de período en el header para las tres (mensual sale del contenido; anual gana select de año).
- `.ia-panel` con sus tres estados; `callAI` sin la caja verde inline.
- Funciones puras nuevas en `utils.js` con tests: `asistidasEn(appts, hoy)`, `ocupacionTerapeuta(th, appts, rango, hoy)`, `diasHabilesPasados(rango, hoy)`, `deltaPeriodo(cur, prev)`.
- Necesita las **capturas reales** antes de cerrar: validar densidad de la Fila 2 con 5–7 terapeutas.

### Lote 4c — "Agregar lo nuevo" · **Medium/High** (toca cómo se leen los pacientes, no la base)
- `Dejaron de venir` (`pacientesQueDejaronDeVenir(patients, appts, hoy, dias=21)`, pura, testeada con el caso "tiene cita futura → no aparece").
- `Nuevos por doctor referente` del período.
- Chart anual apilado (conf + noas) con línea de promedio.
- Aviso de `pend` pasadas.
- Pasarle a la IA las dos listas nuevas (prompt mensual).

### Fuera de estos lotes (anotar)
- `discharge_date` para "altas del período" (SQL).
- Restar bloqueos (lote 2) del denominador de ocupación.
- Top diagnósticos por CIE-10 cuando la cobertura del campo pase del ~50%.

---

## Qué necesito de vos antes del 4b
1. Las capturas de Mensual y Anual con datos reales (paso manual 1).
2. Confirmar la definición de **Asistidas = conf con fecha ≤ hoy** en la Fila 1 (es lo que rompe la paridad con el número "Citas totales" que el dueño ve hoy).
3. Decir si "Dejaron de venir" con 21 días es el umbral que usa la clínica o si es 14/30.
