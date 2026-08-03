# Handoff: Rediseño UI RehactivaPro

## Overview
Rediseño visual de la app de gestión clínica RehactivaPro (fisioterapia, Quito, Ecuador — rehactivaec.com). Cubre 6 pantallas: **Agenda, Resumen del día, Informe paciente, Protocolos, Informes y Login**. Es un rediseño 1:1 de funcionalidad — mismos controles y flujos que la app actual, con nueva capa visual.

## About the Design Files
Los archivos de este paquete son **referencias de diseño creadas en HTML** — prototipos que muestran el look & feel y comportamiento previsto, NO código de producción para copiar. La tarea es **recrear estos diseños en el codebase existente de RehactivaPro** (HTML/CSS/JS vanilla con módulos ES, sin framework — ver `js/` y `css/` del repo original) respetando su arquitectura: render por funciones `renderX()` en módulos por pantalla, estado en `state.js`, estilos por hoja CSS por pantalla.

`RehactivaPro - Final.dc.html` usa un runtime propio de plantillas (`sc-for`, `sc-if`, `{{holes}}`, `support.js`) — ignora esa mecánica; lo que importa es el markup renderizado y los estilos inline. Ábrelo en un navegador y usa el inspector como fuente de verdad.

## Fidelity
**High-fidelity (hifi).** Colores, tipografía, espaciados y estados son finales. Recrear pixel-perfect, mapeando los estilos inline a las hojas CSS existentes del proyecto (`css/rehactiva-theme.css` es el lugar natural para los tokens).

## Design Tokens
Tipografía: **Public Sans** (Google Fonts), pesos 400–800. Fallback `system-ui,sans-serif`.

Colores:
- Azul marca (primario/CTA): `#29ABE2` · hover/links: `#1d8fbf` · oscuro: `#155b7a`
- Naranja marca (badges/alertas suaves): `#F5A623` · texto sobre claro: `#a06a00`
- Crema fondo app y sidebar: `#f0e8d8` · superficies suaves: `#faf6ef` · blanco `#fff` para paneles
- Verde estado confirmado/éxito: `#1D9E75` · texto: `#17865f` · WhatsApp: `#25a05a`
- Amarillo estado pendiente: `#E0A850`
- Rojo estado no asistió: `#E24B4A` · texto: `#c33a3a`
- Doctores referentes (franja izq. de citas): Dr. Ramírez `#D4537E`, Dra. Torres `#7F77DD`
- Texto: principal `#1a1917`, secundario `#5a5a56` / `#7a7a76`, mudo `#9c9a92`
- Bordes: `rgba(41,171,226,.16–.25)` (azul translúcido) y `rgba(0,0,0,.05)` para grillas
- Fuera de horario (agenda): rayado 45° `#f0e3cc` / `#f8f1e4` en franjas de 6px

Métricas: radios 7–12px (paneles 12, botones 7–8, pills 99); headers de pantalla `padding:14px 22px` sobre blanco con borde inferior azul translúcido; título 20px/700, subtítulo 11.5px `#7a7a76`; cuerpo 11–13px.

## Screens / Views

### 1. Login
Pantalla completa fondo `#f5f0e8`, tarjeta centrada 340px, blanca, radio 14, borde azul translúcido, sombra suave. Contenido: **logo real** (`img/logo-rehactiva.png`, 240px, centrado — nunca el texto "RehactivaPro"), subtítulo "Gestión clínica · Acceso restringido", labels uppercase 11px/700, inputs fondo `#faf6ef` borde azul translúcido radio 8, botón primario azul full-width "Ingresar", link "Olvidé mi contraseña".

### 2. Shell (todas las pantallas logueadas)
- Sidebar 200px, fondo crema `#f0e8d8`, borde derecho azul translúcido. Arriba: logo (154px) + buscador de paciente. Nav con secciones uppercase 9.5px (Clínica / Pacientes / Análisis / Equipo), ítems 12.5px con ícono SVG lineal 14px (estilo Feather: calendar, check-square, users, file, activity, bar-chart, credit-card); ítem activo `background:rgba(41,171,226,.14)`, texto `#1d8fbf` 700, radio 8. Badges naranjas pill (Resumen 3, Facturación 2). Footer: email usuario, punto verde "Conectado · tiempo real", Cerrar sesión.
- Main: header blanco por pantalla + cuerpo scrolleable con `padding:14px 22px 18px`.

### 3. Agenda
Header: título + nav de día (‹ fecha › + botón calendario + "Hoy", botones 32px borde azul), y a la derecha: select "Todos los terapeutas", segmented Día/Semana/Mes (activo = fondo azul, texto blanco; contenedor `#faf6ef` radio 9), botón "Exportar" con ícono download, botón primario "+ Nueva cita".
Subheader (fila blanca): pill "9 citas hoy · 44 slots libres", contadores con punto de color (6 confirmadas / 2 pendientes / 1 no asistió), y leyenda derecha: franjas de doctor referente + muestra del rayado "Fuera de horario".
Grilla: panel blanco radio 12; columna de horas 60px fondo `#faf6ef` (horas en punto 600, medias horas mudas); columnas por terapeuta con header (avatar circular con iniciales en color del terapeuta + nombre + horario); filas de 46px cada 30 min.
Celdas: fuera de horario = rayado crema; libres = blancas; cita = tarjeta radio 8 con fondo translúcido del color del terapeuta (MR azul, CV naranja, AS ámbar), **franja izquierda 4px** del color del doctor referente (o `rgba(0,0,0,.1)` si no tiene), nombre 11.5px/700, tipo 10px, **punto de estado** 9px arriba-derecha (verde/amarillo/rojo). Pendiente = borde punteado ámbar + fondo ámbar + opacidad .88. No asistió = fondo rojizo + nombre tachado. Citas de 90 min abarcan 2 filas (altura `2*46-6`).

### 4. Resumen del día
Header: título + **misma navegación de día que Agenda** + botón "Análisis con IA" (primario, derecha).
Franja de contadores (un solo panel blanco, sin cajas separadas): números grandes 26px/800 en color de estado ("6 asistieron", "2 por confirmar", "1 no asistió — requiere contacto") separados por divisores 1px, y a la derecha barra de progreso segmentada verde/amarillo/rojo con label "Jornada del día — 67% resuelta".
Tres secciones apiladas (paneles blancos radio 12, borde y header teñidos del color de estado, con punto + título + contador): **No asistieron** → filas con botones [WhatsApp verde sólido] [Email azul suave] [Reagendar neutro]; **Pendientes de confirmar** → mismos botones; **Asistieron correctamente** → botón "Completar sesión" (azul sólido) o chip "✓ Sesión registrada" (verde suave); si falta evaluación inicial, botón extra ámbar "Eval. inicial pendiente". Cada fila: hora 12px/700, avatar 34px, nombre 13px/700 + pill del doctor referente si aplica, meta 11px (tipo · terapeuta · teléfono en no-asistidos). Secciones no comprimibles (`flex-shrink:0`), lista con scroll.

### 5. Informe paciente
Header: título + buscador de paciente (250px, con lupa) + select de episodio.
Cuerpo en 2 columnas: **hoja membretada** (flex:1, blanca, radio 4, sombra `0 4px 18px rgba(0,0,0,.08)`, padding 30/34) + **sidebar de acciones** 230px sticky.
Hoja: membrete con logo 190px + "Rehabilitación y Fisioterapia · Quito, Ecuador · rehactivaec.com", a la derecha "Informe de evolución / N.º INF-AAAAMMDD-0001 / fecha", separado por **línea azul 2px**. Luego: nombre 18px/700 + pill "En tratamiento" + edad; grid 3 col de datos sobre `#faf6ef` radio 8 (Diagnóstico, Doctor referente, Inicio, Protocolo, Terapeuta — labels uppercase 9.5px); 3 tarjetas KPI (Sesiones 8/12 con barra azul, Continuidad 89% con nota "✓ sobre la meta", Dolor EVA 7→3); gráfico EVA como SVG lineal naranja `#F5A623` con **bandas de fondo** rojo/ámbar/verde (10-6.5 / 6.5-3.5 / 3.5-0); bloque "Evaluación inicial" con borde izq. 4px naranja; tabla "Detalle por sesión (8)" (Fecha / Terapeuta / EVA con color por mejora / Técnicas y observación).
Sidebar: 3 tarjetas — "Documento" (Informe clínico con IA primario, Exportar PDF outline), "Paciente" (+ Agendar cita, + Sesión manual azul suave; Nuevo episodio naranja suave), "Informes guardados" (empty state).
Nota: el usuario aún no cierra esta pantalla — tratarla como dirección aprobada provisionalmente.

### 6. Protocolos
Header: título + buscador + "+ Nuevo protocolo" primario.
Solo tarjetas (el bloque de continuidad fue eliminado adrede): grid `auto-fill minmax(300px,1fr)`; cada tarjeta blanca radio 12 con **foto superior 130px** (en el prototipo es un slot drag-and-drop `image-slot`; en producción, campo de imagen del protocolo — pendiente de fotos reales de la clínica) + badge pill blanco "N pacientes" arriba-derecha; debajo: nombre 13px/700, descripción 11px, "12 sesiones · 3×/semana", "Alta: …" mudo, botones Editar (azul suave) / Eliminar (rojo suave).

### 7. Informes
Header: título + segmented Semanal/Mensual/Anual + nav de semana ‹ 27 jul – 31 jul 2026 › + "Análisis con IA" + "Exportar PDF".
Cuerpo: fila de 6 KPI (Citas totales 156, Asistencia 88% verde, No asistieron 8 rojo, Ingreso estimado $3450 verde, Atendidos 42, Activos 28 — valor 21px/700); grid 1.5fr/1fr con "Desempeño por terapeuta" (avatar + ✓/✗ + barra de utilización coloreada por umbral ≥80 verde / ≥60 ámbar / <60 rojo + %) y columna con "Top diagnósticos" y "Próximos a alta ≥80%"; segunda fila con **mapa de calor** (grid 5 días × horas, celdas 26px radio 5, escala de azules `rgba(41,171,226,…)`→`#155b7a`, texto blanco desde 70%, leyenda 0–100%) e "Insights automáticos" (ícono cuadrado 26px teñido + título 12px/600 + detalle 10.5px).

## Interactions & Behavior
- Sidebar: click navega entre pantallas (SPA por tabs, como `showTab()` actual); "Cerrar sesión" → Login.
- Agenda: click en punto de estado cicla confirmada→pendiente→no asistió (comportamiento actual); × elimina cita; slots libres abren "Nueva cita". Filtro de terapeuta oculta columnas. Día/Semana/Mes cambia vista (solo Día está rediseñada; Semana/Mes siguen patrón actual con esta paleta).
- Resumen: WhatsApp abre wa.me con el teléfono; Completar sesión abre el modal de sesión existente (EVA, técnicas, observación).
- Informe paciente: "Informe clínico con IA" y "Exportar PDF" conectan a los flujos existentes (`informes.js`).
- Hovers: botones primarios oscurecen ~8%; ítems de nav no activos `background:rgba(41,171,226,.07)`.
- No hay animaciones nuevas; transiciones CSS suaves (~120ms) en hovers es suficiente.

## State Management
Sin cambios: reutilizar `state.js` y los renderers existentes. El rediseño no agrega estado nuevo salvo el filtro/nav ya existentes. Datos de los prototipos son ficticios (3 terapeutas MR/CV/AS, 9 citas).

## Assets
- `img/logo-rehactiva.png` — logo real de la clínica (ya está en el repo original). Se usa en: sidebar (154px), login (240px), membrete del informe (190px).
- Íconos: SVG inline estilo Feather (stroke 2, linecap round), 13–17px. No hay librería nueva.
- Fotos de protocolos: pendientes (cliente las proveerá).
- Public Sans vía Google Fonts.

## Screenshots
Capturas de referencia de cada pantalla en `screenshots/`: 01-agenda, 02-resumen-del-dia, 03-informe-paciente, 04-protocolos, 05-informes, 06-login. Úsalas para comparar visualmente el resultado implementado.

## Files
- `RehactivaPro - Final.dc.html` — **fuente de verdad**: las 6 pantallas navegables (sidebar funcional).
- `assets/img/logo-rehactiva.png` — logo.
- `assets/image-slot.js` — solo mecánica del prototipo para soltar fotos; no portar.
- `RehactivaPro - Actual.dc.html`, `RehactivaPro - Rediseño.dc.html` — historia del proceso (réplica de la app actual y exploraciones); no implementar.
