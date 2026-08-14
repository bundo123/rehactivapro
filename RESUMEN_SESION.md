# RehactivaPro — Historial de sesiones de desarrollo

> **Período:** 2026-03-31 → 2026-08-14 · **171 entregas** en **37 jornadas de trabajo**
> **Última actualización:** 2026-08-14

---

## Cómo leer este documento (y cómo verificarlo)

Este historial está **generado desde el repositorio Git**, no redactado de memoria. Cada línea es
comprobable: los códigos tipo `29ec147` son identificadores de commit y cualquiera con acceso al
repo (`github.com/bundo123/rehactivapro`) puede auditar el contenido exacto de cada entrega con:

```bash
git show 29ec147              # ver los cambios de una entrega concreta
git log --oneline --reverse   # ver la lista completa en orden cronológico
```

**Alcance y límites de estas cifras — importante para evitar malentendidos:**

- Una **«jornada»** es un día calendario con entregas registradas en el repositorio. Es una medida
  de *entregas*, no de horas trabajadas: **este documento no es una hoja de horas.**
- El trabajo **sin commit no aparece acá**: análisis, diagnóstico de errores reportados, pruebas
  manuales, reuniones, configuración de Supabase/Vercel y sesiones que terminaron en descartes.
- Las líneas de código (`+`/`−`) son un indicador de volumen, **no de valor ni de esfuerzo**. Una
  corrección de una línea puede costar más que una pantalla nueva de 400 (varias de las de abajo lo
  fueron). Se incluyen por transparencia, no como métrica de facturación.
- Los borrados grandes son **saneamiento deliberado** (eliminar código muerto o duplicado), no
  pérdida de trabajo: ver 2026-05-18, 2026-05-29 y 2026-06-17.

---

## Resumen ejecutivo

| Fase | Período | Jornadas | Entregas | Qué se logró |
|---|---|---:|---:|---|
| **0 · Prototipo** | 03-31 → 04-19 | 4 | 31 | Maqueta funcional en un solo archivo HTML |
| **1 · Profesionalización** | 05-11 → 05-18 | 6 | 31 | Base técnica real: Vite, módulos, roles, seguridad, marca |
| **2 · Producto clínico** | 05-21 → 06-06 | 13 | 59 | Historia clínica, informes con IA, protocolos, bitácora legal |
| **3 · Endurecimiento** | 06-17 → 07-09 | 5 | 21 | Auditoría pre-lanzamiento: corrección de fallos y pruebas |
| **4 · Producción** | 07-31 → 08-14 | 9 | 29 | App en uso real: agenda avanzada, móvil, CIE-10, seguimiento |

**Estado al cierre:** aplicación en producción en `rehactivaec.com`, con despliegue automático
verificado, **154 pruebas automatizadas** en verde y bitácora de auditoría inmutable conforme a
LOPDP.

---

## Tabla de jornadas

| # | Fecha | Entregas | Archivos | +líneas | −líneas | Titular de la jornada |
|--:|---|--:|--:|--:|--:|---|
| 1 | 2026-03-31 | 1 | 1 | 1.597 | 0 | Carga inicial del prototipo |
| 2 | 2026-04-03 | 2 | 2 | 382 | 288 | Iteración del prototipo |
| 3 | 2026-04-17 | 12 | 11 | 993 | 243 | Iteración del prototipo |
| 4 | 2026-04-19 | 16 | 15 | 1.526 | 536 | Iteración del prototipo |
| 5 | 2026-05-11 | 4 | 16 | 4.437 | 2.565 | Migración a Vite + tiempo real + fallos críticos |
| 6 | 2026-05-12 | 4 | 37 | 2.893 | 287 | Modularización (17 módulos) + permisos por rol |
| 7 | 2026-05-13 | 2 | 8 | 163 | 18 | Identidad visual Rehactiva |
| 8 | 2026-05-14 | 8 | 29 | 707 | 109 | Vistas de agenda + exportación CSV |
| 9 | 2026-05-16 | 7 | 16 | 69 | 37 | Pulido visual de la agenda |
| 10 | 2026-05-18 | 6 | 18 | 2.493 | 3.049 | Responsive + rediseño Facturación y Resumen |
| 11 | 2026-05-21 | 3 | 12 | 296 | 25 | Menú móvil + validaciones de datos |
| 12 | 2026-05-25 | 3 | 11 | 68 | 20 | Fecha de nacimiento (reemplaza edad) |
| 13 | 2026-05-26 | 6 | 18 | 417 | 68 | Recuperación de contraseña + reconexión |
| 14 | 2026-05-28 | 1 | 4 | 3.332 | 0 | Documentación de plan y estado |
| 15 | 2026-05-29 | 5 | 10 | 378 | 2.994 | **Bitácora LOPDP** + limpieza de código muerto |
| 16 | 2026-05-30 | 1 | 1 | 31 | 0 | Convenciones del proyecto |
| 17 | 2026-05-31 | 1 | 9 | 250 | 56 | Rediseño de Pacientes |
| 18 | 2026-06-01 | 8 | 26 | 615 | 215 | **Informes con IA** + carga histórica |
| 19 | 2026-06-02 | 13 | 35 | 628 | 336 | Informe clínico de evolución + métricas reales |
| 20 | 2026-06-03 | 3 | 8 | 138 | 85 | Corrección de identidad de sesiones |
| 21 | 2026-06-04 | 4 | 8 | 821 | 33 | Correcciones de facturación |
| 22 | 2026-06-05 | 8 | 21 | 373 | 117 | Histórico de informes + protocolos clínicos |
| 23 | 2026-06-06 | 3 | 8 | 315 | 21 | **Auditoría de seguridad** + RLS versionada |
| 24 | 2026-06-17 | 6 | 28 | 185 | 520 | Borrado atómico + facturación por episodio |
| 25 | 2026-06-26 | 4 | 15 | 443 | 70 | **Pruebas automatizadas** + honestidad de notificaciones |
| 26 | 2026-07-01 | 5 | 9 | 66 | 20 | 7 correcciones de robustez (R-1…R-7) |
| 27 | 2026-07-02 | 2 | 3 | 44 | 1 | Cierre de sesión por inactividad |
| 28 | 2026-07-09 | 4 | 10 | 247 | 139 | Seguridad del endpoint IA + accesibilidad |
| 29 | 2026-07-31 | 1 | 3 | 154 | 40 | PDF con formato de documento formal |
| 30 | 2026-08-03 | 9 | 54 | 4.855 | 1.010 | **Rediseño de 6 pantallas** + vistas Semana/Mes |
| 31 | 2026-08-04 | 2 | 3 | 20 | 4 | Citas en fechas pasadas |
| 32 | 2026-08-05 | 1 | 3 | 370 | 5 | Pasada móvil (flujo del terapeuta) |
| 33 | 2026-08-07 | 5 | 31 | 977 | 68 | **CIE-10** + hora exacta + filtro por terapeuta |
| 34 | 2026-08-11 | 3 | 7 | 529 | 121 | «No asistió» libera el turno |
| 35 | 2026-08-12 | 4 | 16 | 1.018 | 19 | Ordinal de cita + **pestaña Seguimiento** |
| 36 | 2026-08-13 | 1 | 7 | 237 | 31 | Secretaría gestiona el equipo + borrado que no arrastra citas |
| 37 | 2026-08-14 | 3 | 14 | 520 | 56 | Plan de sesiones en la cita + cierre de episodio por la cita real |

**Totales:** 171 entregas · 527 archivos modificados · **32.587 líneas añadidas** · **13.206 retiradas**.

*Nota de lectura:* en 2026-04-17 y 2026-04-19 hay una entrega cada día que no registró cambio de
contenido, por eso «Entregas» supera a «Archivos» esos dos días. Las imágenes y demás binarios
cuentan como archivo modificado pero aportan 0 líneas.

---

# Detalle por fase

## Fase 0 — Prototipo (2026-03-31 → 2026-04-19) · 4 jornadas · 31 entregas

Maqueta funcional construida como **un único archivo `index.html`**, editado directamente desde la
interfaz web de GitHub (los mensajes «Update index.html» son los que genera esa herramienta). Sirvió
para validar el concepto con la clínica antes de invertir en arquitectura.

Al no haber mensajes descriptivos en estas entregas, el detalle de cada iteración solo es
reconstruible abriendo los cambios uno por uno; se registra el volumen y no se atribuye contenido
que no conste en el repositorio.

---

## Fase 1 — Profesionalización (2026-05-11 → 2026-05-18) · 6 jornadas · 31 entregas

Punto de inflexión: el prototipo se convierte en una aplicación mantenible y segura.

**2026-05-11 — Migración a Vite, tiempo real y fallos críticos** (`3f280e1`, `a594621`, `8f1e148`, `e70cca0`)
- Migración a Vite con separación HTML/JS y credenciales fuera del código.
- **Sincronización en tiempo real**: lo que un usuario cambia aparece al instante en las demás
  pantallas, con control de eco por tabla y agrupación de avisos para no saturar.
- Corrección de fallos **críticos**: vulnerabilidad XSS, sesiones duplicadas, contador de facturas
  y borrados en cascada.

**2026-05-12 — Modularización y permisos** (`c62711a`, `28adec3`, `b53a95c`, `e446398`)
- El archivo monolítico se divide en **17 módulos** y el CSS en 4 hojas. Es lo que permite que
  todo el trabajo posterior sea rápido y de bajo riesgo.
- **Permisos por rol** (admin / secretaria / terapeuta) aplicados a la interfaz.

**2026-05-13 — Identidad visual** (`e03f67a`, `d4d43d6`) · Tema de marca Rehactiva (azul/naranja/crema).

**2026-05-14 — Agenda avanzada** (8 entregas)
- Vistas **día / semana / mes / por terapeuta** y **exportación a CSV**.
- Corrección de duración y validación de solapamiento de citas; alineación visual por posición
  absoluta.

**2026-05-16 — Pulido de agenda** (7 entregas) · Citas que ocupan visualmente su duración real,
huecos libres más visibles y clicables, color del borde según médico referente.

**2026-05-18 — Responsive y rediseño** (`1885b0d`, `71af576`, `dd6b092`, `8095987`, `dde23e8`, `59d98c9`)
- Primera hoja **responsive** (móvil/tablet) y eliminación del archivo legacy monolítico.
- Rediseño de **Facturación** y **Resumen del día**.

---

## Fase 2 — Producto clínico (2026-05-21 → 2026-06-06) · 13 jornadas · 59 entregas

La aplicación pasa de «agenda con pacientes» a **herramienta clínica**.

**2026-05-21 — Móvil y validaciones** (`ac12a65`, `e83c289`, `e3d670d`) · Menú hamburguesa;
validación de **cédula ecuatoriana** (con dígito verificador), teléfono, email y protocolos.

**2026-05-25 — Fecha de nacimiento** (`3a52cdb`, `a7eeb2c`, `70a797a`) · Se reemplaza la edad fija
por fecha de nacimiento (la edad quedaba desactualizada), manteniendo compatibilidad con los
registros ya cargados.

**2026-05-26 — Recuperación de contraseña y reconexión** (`337a357`, `5e78508`, `4401d6c`, `9a92022`, `0f154d6`)
- **Recuperación de contraseña** por email vía Supabase Auth, con mensaje neutro que no revela si
  un correo está registrado, y manejo de enlaces vencidos.
- **Reconexión automática** del tiempo real con indicador visual de estado.
- Los fallos de base de datos dejan de ser silenciosos y avisan al usuario.

**2026-05-29 — Bitácora legal LOPDP** (`39b9014`, `3b5f7ca`, `d134c3e`, `c5fdfb5`, `efd7471`)
- **`audit_log`: bitácora append-only e inmutable sobre 7 tablas.** Requisito de la Ley Orgánica de
  Protección de Datos Personales: queda registro de quién tocó qué y cuándo, sin posibilidad de
  alterarlo.
- Informes mensual/anual calculan **métricas reales** (antes había valores fijos de maqueta).
- Retirada de ~3.000 líneas de código muerto.

**2026-05-31 — Rediseño de Pacientes** (`9ab1053`) · Layout plano, columna Edad y acción «Ver».

**2026-06-01 — Informes con IA** (8 entregas: `ca2da27`, `d965d65`, `f393c67`, `36c4be8`…)
- **Generación de informes con IA** mediante función serverless con autenticación (la clave del
  proveedor nunca viaja al navegador).
- **Informe de evolución** del paciente en pantalla y en PDF.
- **Carga histórica**: registro retroactivo de sesiones, para volcar el historial en papel.
- Edición y borrado de sesiones, con bloqueo anti-doble-envío.

**2026-06-02 — Informe clínico y métricas** (13 entregas) · Narrativa clínica en 4 secciones,
mapa de calor real por franjas de 30 min, buscador unificado de paciente, branding del informe.
Se establece que **`done`/pendientes derivan siempre de `session_log`**, eliminando contadores
frágiles que se desincronizaban.

**2026-06-03 / 06-04 — Correcciones** (`c1da7bc`, `5535d08`, `467693a`, `a80259f`) · Las sesiones
pasan a identificarse por id único (arreglaba edición de EVA y duplicados); se corrige una **fuga de
datos entre pacientes** al reabrir el modal; se repara el cobro individual.

**2026-06-05 — Histórico de informes y protocolos** (8 entregas) · Los informes IA se **guardan con
snapshot reproducible**, se ven en línea y se borran de forma lógica. **Protocolos clínicos**
asignables al paciente, y su contexto alimenta al informe IA como barrera anti-alucinación.

**2026-06-06 — Auditoría de seguridad** (`1a996d8`, `a6d98ca`, `a8d8950`) · Corrección de XSS en
informe semanal, **RLS versionada** en `rls_policies.md` y documento de auditoría pre-lanzamiento.

---

## Fase 3 — Endurecimiento pre-lanzamiento (2026-06-17 → 2026-07-09) · 5 jornadas · 21 entregas

Trabajo de calidad guiado por la auditoría: se numeran los hallazgos (I-x, R-x, P-x) y se cierran.

**2026-06-17** (`81946ed`, `5cb5725`, `3402608`, `fa1515e`, `0a1de8a`) · Borrado de paciente
**atómico** vía `ON DELETE CASCADE` (antes podían quedar datos huérfanos); facturación e informes
pasan a ser **conscientes del episodio**, para que un tratamiento nuevo no arrastre cobros ni
sesiones del anterior.

**2026-06-26** (`95dc477`, `73a4662`, `54d6ec7`, `46a51e0`)
- **Suite de pruebas automatizadas** con `node --test` sobre la lógica crítica, más guion de prueba
  manual.
- **Se dejó de fingir envíos automáticos**: la pantalla de notificaciones simulaba envíos de
  WhatsApp/email que no ocurrían. Se corrigió para no dar por hecho algo que el sistema no hace.

**2026-07-01** (`8b26869`, `6b343cb`, `03b2224`, `c8fbca0`, `6841492`) · Siete correcciones de
robustez: «Cobrar todos» por episodio, verificación de errores al cerrar episodio, comparación
normalizada de horas, solapamiento en citas recurrentes y **reversión de inserciones fallidas**.

**2026-07-02** (`3986a7e`, `6c33b4a`) · **Cierre de sesión por inactividad (15 min)** —los equipos de
recepción son compartidos— y cabeceras de seguridad en el despliegue.

**2026-07-09** (`2e0303a`, `f4b276f`, `516088c`, `d6509cb`) · Verificación de rol **en el servidor**
y límite de uso en el endpoint de IA; **0 vulnerabilidades** en dependencias; modales cerrables con
Escape y áreas táctiles adecuadas; citas pendientes de días anteriores dejan de quedar colgadas.

---

## Fase 4 — Producción y refinamiento (2026-07-31 → 2026-08-14) · 9 jornadas · 29 entregas

La app ya está en uso; el trabajo pasa a ser el que pide la operación diaria.

**2026-07-31** (`82e387f`) · **PDF con formato de documento formal**: membrete, gráfico EVA en SVG y
paginación. Es el documento que se entrega al médico referente.

**2026-08-03 — Jornada mayor: rediseño de 6 pantallas** (9 entregas, 54 archivos)
- Rediseño visual completo según handoff (`82952b3`), orden de terapeutas y selector de fecha.
- **Vistas Semana (por terapeuta) y Mes** con navegación compartida y tiempo real (`17df85e`).
- **Modalidad centro/domicilio** por cita y control de cédula duplicada (`4a08ef4`).
- Correcciones de tiempo real al volver a la pestaña (`084d6a3`) y del logo en producción
  (`c6a8c0b`).

**2026-08-04 / 08-05** (`a7fe9ce`, `bc8b276`) · Secretaría puede agendar en fechas pasadas (carga de
lo ya ocurrido); pasada móvil centrada en el flujo del terapeuta.

**2026-08-07 — CIE-10 y precisión de agenda** (`576d68a`, `d6b516a`, `22d541a`, `c616417`)
- **Diagnóstico CIE-10** en modal de cita, ficha e informe: codificación estándar internacional,
  requisito para la interlocución con médicos y aseguradoras.
- **Hora exacta** en las citas (antes solo :00 y :30).
- Filtro manual por terapeuta y salto de cita a informe en táctil.
- Corrección **R-2**: el informe de un episodio pasado ya no contaba la evaluación inicial como
  sesión (mostraba «11 de 10 · 110 %» en el PDF al médico).

**2026-08-11** (`219ed02`) · Una cita marcada **«no asistió» libera el turno** sin borrarse: el
terapeuta puede reasignar esa franja y la cita sigue contando en resumen, informes y facturación.

**2026-08-12 — Dos entregas**
- **Ordinal de cita «X/N»** (`85e7af7`): cada tarjeta de la agenda muestra en qué punto del
  tratamiento va el paciente sin abrir su ficha.
- **Pestaña «Seguimiento»** (`29ec147`): auditoría **día a día** que cruza lo atendido en agenda
  contra lo registrado en la historia clínica, y señala **qué días se atendió sin dejar registro**.
  Detecta el caso que los totales esconden: «1 cita / 1 sesión» cuadra y aun así falta el registro,
  si la sesión se escribió otro día. Incluye detalle desplegable con el terapeuta responsable de
  cada día. **131 pruebas en verde.**

**2026-08-13 — Gestión del equipo para secretaría** (`a95f7fc`)
- **La secretaria ya administra el equipo** (alta, edición, horarios, orden en agenda y color) sin
  depender del administrador. La **baja definitiva sigue siendo solo del administrador**: es la
  única acción irreversible de esa pantalla.
- **Se eliminó un borrado peligroso, para todos los roles.** Dar de baja a un terapeuta borraba
  **todas sus citas**, es decir la agenda histórica de la que salen la facturación y el seguimiento,
  sin aviso y sin vuelta atrás. Ahora el sistema **bloquea la baja** mientras el terapeuta tenga
  citas e indica cuántas son, para reasignarlas primero.
- **Horario y orden en agenda pasan a editarse desde la pantalla**: hasta entonces solo se cambiaban
  tocando la base de datos a mano.
- El permiso se replicó **también en la base de datos**, no solo en la interfaz: es la base la que
  garantiza que la baja siga siendo del administrador.

**2026-08-14 — Plan de sesiones en la cita y cierre de episodio por la cita real** (`05682bd`)
- **El plan del paciente se consulta y se amplía desde la propia cita.** Al abrir una cita se ve
  «Lleva X de N sesiones» y se puede **ampliar el plan ahí mismo**, sin salir de la agenda ni entrar
  al informe del paciente. Cambiarlo requiere permiso de edición de pacientes.
- **El cierre de un episodio ahora pregunta cuál fue la última cita del tratamiento anterior.**
  Antes el corte se fechaba **siempre el día en que uno se acordaba de registrarlo**: cerrar el
  lunes un tratamiento que terminó el jueves anterior metía todo lo del viernes al lunes en el
  tratamiento viejo, y el conteo de sesiones del nuevo arrancaba mal. Ahora el corte cae **donde
  realmente estuvo**, eligiéndolo de una lista de las citas del paciente.
- **Aviso cuando el plan se completa** al guardar la sesión que lo cierra, y **el contador «X/N» de
  la agenda se pone en ámbar** cuando se pasa del plan. Ninguna de las dos cosas bloquea nada:
  seguir atendiendo es decisión del terapeuta, el sistema solo lo hace visible.
- **De arrastre:** el botón «Ver informe del paciente» de la cita, que solo aparecía en tablet y
  celular, ahora **también está en computadora**; y **Presoterapia** se suma a las técnicas
  registrables en la sesión.
- **154 pruebas en verde.**

---

## Anexo — Prácticas de trabajo aplicadas

Constan en el repositorio y explican parte del esfuerzo que no se ve en la interfaz:

- **Revisión por rama antes de producción.** Las funcionalidades sensibles se publican primero en
  una rama de revisión y solo pasan a producción con aprobación explícita.
- **Verificación de despliegue en cada entrega.** Se confirma que el despliegue quedó en verde y que
  lo servido en `rehactivaec.com` es exactamente el código compilado, comparando las huellas de los
  archivos publicados.
- **Pruebas automatizadas crecientes:** 19 pruebas (2026-06-26) → 104 (2026-08-12) → 131 (2026-08-13)
  → **154** al cierre. Se ejecutan en cada cambio.
- **Documentación de estado continua.** `PROYECTO_ESTADO.md` registra cada sesión con sus
  decisiones y su deuda técnica pendiente; `AUDITORIA_PRELANZAMIENTO.md` y `rls_policies.md`
  documentan seguridad y permisos de base de datos.
- **Deuda técnica declarada, no ocultada.** Los puntos abiertos (I-7, P-2, CSP estricta, entre
  otros) están listados por escrito con su motivo y su plan.
