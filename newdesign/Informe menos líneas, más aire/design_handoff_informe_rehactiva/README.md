# Handoff: Informe de evolución — Rehactiva

## Overview
Documento imprimible (1–2 páginas) que resume la evolución de un paciente en tratamiento
de fisioterapia: datos del paciente, métricas de adherencia, curva de dolor EVA,
evaluación inicial, detalle por sesión y firma del terapeuta.
Reemplaza el informe anterior, que era muy "tabular" (bordes y líneas en todos lados).
El objetivo del rediseño: **menos líneas, más aire, jerarquía tipográfica**.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML** — prototipos que
muestran la apariencia y el comportamiento buscados, **no código de producción para copiar
tal cual**. La tarea es **recrear este diseño en el entorno del codebase destino**
(React, Vue, Blade, un generador de PDF server-side, etc.) usando sus patrones y librerías
existentes. Si no hay entorno todavía, elegir el más adecuado e implementarlo ahí.

Como el entregable real es un PDF, la ruta más directa suele ser: plantilla HTML/CSS +
motor de impresión (Chromium headless / Puppeteer / wkhtmltopdf / Playwright).

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografías, tamaños y espaciados son los definitivos.
Recrear con precisión; los valores exactos están en "Design Tokens".

## Screens / Views

### 1. Informe de evolución (documento único, flujo continuo)
- **Purpose**: entregar al paciente / médico referente un resumen del avance del tratamiento.
- **Paper**: tamaño de papel del usuario (no fijado en CSS). Margen imprimible **0.7in**
  en los cuatro lados. Sin encabezado/pie del navegador.
- **Layout**: una sola columna. Bloques verticales separados por **34px**
  (`display:flex; flex-direction:column; gap:34px`), con `padding-top:26px` bajo el encabezado.

#### Encabezado corrido (se repite en cada página impresa)
- `display:flex; align-items:center; justify-content:space-between; gap:24px`
- Izquierda: **logo Rehactiva** PNG transparente, `height:62px; width:auto`.
- Derecha: `INFORME DE EVOLUCIÓN · INF-20260824-4117` — 8pt, mayúsculas,
  `letter-spacing:.06em`, color `#7a746b`.
- Regla inferior: `1px solid #e2ded6`, `padding-bottom:12px`. **Es la única línea horizontal
  del documento** (aparte de la línea de firma).

#### Pie corrido (se repite en cada página impresa)
- Texto legal/dirección en una línea: 7.8pt, `line-height:1.5`, color `#9b948a`,
  `max-width:5.2in`, `padding-top:10px`.
- Contenido: `Rehactiva · Centro de rehabilitación y fisioterapia · Palmeras Shopping,
  Vía Intervalles OE-95 y primera transversal, Tumbaco, Quito · Tel. 099 921 1258`

#### Bloque de título
- H1 en **Newsreader 400, 22pt**, `line-height:1.14`, `letter-spacing:-.015em`, color `#191c1d`.
  Dos líneas: `Informe de evolución` + salto + nombre del paciente en **cursiva**, color `#145b6d`.
- Subline: `Emitido el 24 de agosto de 2026 · Período 05/06/2026 – 05/06/2026`
  — Archivo 9.5pt, color `#7a746b`.

#### Datos del paciente (sin bordes, sin tabla)
- `display:grid; grid-template-columns:repeat(3,1fr); gap:22px 32px`
- Cada celda: etiqueta 7.5pt mayúsculas `letter-spacing:.11em` color `#a09889`;
  valor 11.5pt weight 500 color `#22201d`.
- Campos, en este orden: Diagnóstico, Terapeuta, Inicio de tratamiento, Cédula, Edad,
  Doctor referente.
- **Campo vacío**: no se oculta ni se pone `—`; se escribe `No registrada` / `No registrado`
  en color `#b5ada0` (mismo tamaño y peso). Es el único estado "vacío" del diseño.

#### Panel de métricas
- Fondo `#f6f4ef`, `border-radius:3px`, `padding:22px 26px`,
  `grid-template-columns:repeat(3,1fr); gap:34px`, `break-inside:avoid`.
- Número grande: Newsreader 400 **26pt**, `line-height:1`, color `#145b6d`;
  la parte secundaria (`/ 12`, `%`, `→`) a 15pt en `#9b948a`.
- Etiqueta bajo el número: Archivo 8.5pt, color `#6f6a62`.
- Las tres métricas: `3 / 12` → “sesiones · 25% del plan”; `100%` → “continuidad · 4 de 4
  citas asistidas”; `7 → 4` → “dolor EVA · inicial a actual”.

#### Evolución del dolor (gráfico)
- Título de sección: Newsreader 500, 13pt.
- SVG `viewBox="0 0 660 230"`, `width:100%`, `max-width:6.3in`, `break-inside:avoid`.
- **Sin ejes, sin grilla, sin leyenda.** Solo: área rellena `#145b6d` al 6% de opacidad,
  polilínea `#145b6d` `stroke-width:2` `linecap:round`, y un punto por medición
  (`r:4.5`; el último punto `r:6`).
- Valor EVA sobre cada punto: Newsreader 20px, `#22201d`; el último en `#145b6d`.
- Etiqueta bajo cada punto: Archivo 12px, `#a09889` (“Eval. inicial”, “Sesión 1…n”).
- **Escala usada**: x equiespaciada (34 → 631); y mapeada de forma que 1 punto EVA = 32px
  (EVA 7 → y 62, EVA 4 → y 158); base del área en y 196. Al generalizar: mantener una
  pendiente visible — si el rango EVA es pequeño, no dibujar la línea casi horizontal.

#### Evaluación inicial
- Título Newsreader 500 13pt + metadato en línea (`05/06/2026 · EVA 7/10`) en Archivo 8.5pt
  mayúsculas `letter-spacing:.06em` color `#a09889`.
- Párrafo 10.5pt, `line-height:1.6`, `max-width:5.6in`, color `#3c3832`, `text-wrap:pretty`.
- Línea final: `Zona evaluada: miembro inferior` — 9pt color `#a09889`.

#### Detalle por sesión
- Una fila por sesión: `display:grid; grid-template-columns:46px 1fr 96px; gap:0 20px;
  padding:18px 0; break-inside:avoid`.
- Col 1: número de sesión con cero inicial (`01`) en Newsreader 20pt color `#d8d2c6`.
- Col 2: metadato (fecha · terapeuta · técnicas en minúsculas) 9pt `#a09889`;
  debajo la observación 10.5pt `line-height:1.55`.
- Col 3: `7 → 6` (EVA antes → después) Newsreader 13pt `#145b6d`, alineado a la derecha.
- **Alternancia**: filas pares con fondo `#f6f4ef` (sin bordes). Impares sin fondo.
  Esto sustituye por completo las líneas divisorias de la versión anterior.

#### Firma
- Espacio de firma: caja de `2.6in` de ancho, `height:34px`, con
  `border-bottom:1px solid #d8d2c6`.
- Debajo: nombre 10.5pt weight 500; rol `Fisioterapeuta · Rehactiva` 9pt `#a09889`.

## Interactions & Behavior
Documento estático imprimible: sin hover, sin navegación, sin estados de carga.
Comportamientos que sí importan:
- **Paginación**: flujo continuo; el motor de impresión pagina. Encabezado y pie se repiten
  en cada página. Nada de saltos de página manuales.
- **break-inside: avoid** en: panel de métricas, bloque del gráfico, evaluación inicial,
  cada fila de sesión y el bloque de firma.
- `orphans:3; widows:3` en párrafos y listas.
- Responsivo: no aplica (documento de papel). No usar unidades de viewport.

## State Management
Sin estado de UI. Datos de entrada por informe:

- `numeroInforme`, `fechaEmision`, `periodoInicio`, `periodoFin`
- `paciente`: nombre, cédula, edad
- `diagnostico`, `terapeuta`, `doctorReferente`, `inicioTratamiento`
- `sesionesRealizadas`, `sesionesPlan` (→ % del plan), `citasAsistidas`, `citasAgendadas`
- `evaInicial`, `evaActual`
- `evaluacionInicial`: fecha, eva, texto, zonas[]
- `sesiones[]`: fecha, terapeuta, evaAntes, evaDespues, tecnicas[], observacion
- `serieEva[]` para el gráfico = `[evaluación inicial, ...sesiones.evaDespues]`

Reglas de contenido: los campos sin dato se imprimen como “No registrado/a” en `#b5ada0`;
las técnicas se muestran en minúsculas separadas por coma.

## Design Tokens

Colores
- Tinta principal `#22201d`; texto de párrafo `#3c3832`
- Acento (marca/datos) `#145b6d`; acento hover/oscuro `#0d3f4c`
- Texto secundario `#6f6a62`; terciario `#7a746b`
- Etiquetas / metadatos `#a09889`; vacío `#b5ada0`
- Numeración de sesión `#d8d2c6`; regla `#e2ded6`
- Fondo tenue de panel y filas alternas `#f6f4ef`

Tipografía
- Títulos y cifras: **Newsreader** (serif variable), pesos 400/500; cursiva para el nombre del paciente
- Texto y datos: **Archivo**, pesos 400/500
- Escala: 22pt H1 · 13pt H2 · 11.5pt valor de dato · 10.5pt cuerpo · 9.5pt subline ·
  9pt metadato · 8.5pt etiqueta de métrica · 8pt id de documento · 7.5pt etiqueta de dato ·
  7.8pt pie
- Cifras grandes del panel: 26pt (secundario 15pt); numeración de sesión 20pt

Espaciado
- Margen de página 0.7in · gap entre secciones 34px · grid de datos 22px/32px ·
  padding de panel 22px 26px · padding de fila de sesión 18px 0 · gap interno de bloque 3–10px

Radios / sombras / bordes
- Radio: 3px (solo el panel de métricas). Sin sombras. Bordes: solo la regla del encabezado
  y la línea de firma, ambos `1px solid` (`#e2ded6` / `#d8d2c6`).

## Assets
- `rehactiva-logo.png` — logo oficial entregado por el cliente, PNG con transparencia
  (562×160). **No está suelto en este paquete** (falló la copia binaria); está **incrustado
  en base64 dentro de `Informe-Rehactiva-standalone.html`** y el original lo tiene el cliente.
  Se usa a `height:62px`, ancho automático.
- Fuentes: Newsreader y Archivo desde Google Fonts. Para PDF server-side, empaquetar los
  archivos de fuente localmente (no depender de la red al renderizar).
- Sin iconos ni ilustraciones. El gráfico es SVG generado a partir de los datos.

## Files
- `Informe de Evolución.dc.html` — el diseño (fuente de verdad de estilos y contenido).
- `doc-page.js` — shell de documento imprimible usado por el prototipo: pagina el flujo,
  repite encabezado/pie, quita el cromo de impresión del navegador. **Es andamiaje del
  prototipo**, no hay que portarlo: su equivalente en producción es el CSS de impresión
  (`@page { margin:0 }` + padding en la hoja) o la configuración del generador de PDF.
- `Informe-Rehactiva-standalone.html` — un solo archivo, abre sin internet, con el logo y
  las fuentes incrustadas. Sirve como referencia visual y para imprimir a PDF (Ctrl/Cmd+P).
