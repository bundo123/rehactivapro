# SMOKE_TEST — RehactivaPro (prueba manual en iPad)

Checklist corta de los flujos core, para correr a mano en el dispositivo real (Safari iPad)
antes de cada lanzamiento. Marcá cada paso; si algo no da el resultado esperado, anotalo.

> **Preparación**
> - [ ] Abrí la app en Safari (iPad) e inicié sesión como **admin**.
> - [ ] Existe al menos **1 terapeuta** (Config → Terapeutas). *(La agenda y las citas lo requieren.)*
> - [ ] Tip: para exportar PDF, Safari debe **permitir ventanas emergentes** para el sitio.

---

## 1. Registrar paciente
**Hacer:** Pacientes → **+ Nuevo paciente**. Nombre (≥3 letras), Sesiones = 12. Dejá cédula/correo vacíos a propósito. Guardar.
**Esperar:**
- [ ] Toast verde **"Paciente guardado correctamente"**.
- [ ] Aviso (toast info) de que **sin cédula** no se pueden emitir facturas electrónicas.
- [ ] Aviso (toast info) de que **sin fecha de nacimiento** algunos reportes mostrarán "edad no registrada".
- [ ] El paciente aparece en la lista con la insignia **"Sin eval."**.
- [ ] **Validación:** intentá guardar con nombre de 1 letra → muestra error y **no** guarda.

## 2. Evaluación inicial
**Hacer:** En la fila del paciente → **Eval. inicial** (o desde Resumen del día). Completá **Anamnesis** (obligatoria), elegí un valor de **EVA**, guardá.
**Esperar:**
- [ ] Si dejás la anamnesis vacía → error **"La anamnesis es obligatoria"**, no guarda.
- [ ] Al guardar: toast **"✓ Evaluación inicial guardada"**.
- [ ] La insignia **"Sin eval." desaparece** del paciente en la lista.

## 3. Registrar sesión (con EVA)
**Pre:** el paciente necesita una **cita confirmada** hoy (Agenda → + Nueva cita, estado *Confirmada*).
**Hacer:** Resumen del día → en la cita confirmada tocá **"📋 Completar sesión"**. Ajustá **EVA antes** y **EVA después**, escribí una observación (obligatoria), guardá.
**Esperar:**
- [ ] Sin observación → error **"Describe brevemente qué se realizó en la sesión"**, no guarda.
- [ ] Al guardar: toast **"Sesión guardada en historial clínico ✓"**.
- [ ] El botón pasa a **"✓ Sesión OK"** al instante.
- [ ] (Alternativa) En Informe paciente → **"+ Sesión manual"** permite cargar una sesión retroactiva con fecha ≤ hoy.

## 4. Resumen del día
**Hacer:** Pestaña **Resumen**.
**Esperar:**
- [ ] Barra superior con conteo **Asistieron / Pendientes de confirmar / No asistieron**.
- [ ] En un **no asistido** con teléfono: botón **WhatsApp** abre `wa.me` con mensaje pre-cargado (envío manual).
- [ ] Botón **Email** abre el cliente de correo (mailto) con el mensaje listo (envío manual).
- [ ] No asistido **sin teléfono**: el botón WhatsApp aparece **deshabilitado** (no abre un número genérico).

## 5. Informe de paciente (IA)
**Hacer:** Pestaña **Informe paciente** → buscá y seleccioná el paciente. Tocá **"Informe IA"**. Luego **"Exportar PDF"**.
**Esperar:**
- [ ] Aparece **"⏳ Generando informe…"** y luego la **narrativa en 4 secciones** (Condición inicial, Evolución, Resultados, Recomendaciones). *(Requiere backend `/api/informe` activo; si falla, sale toast de error — no pantalla rota.)*
- [ ] Tarjetas **Sesiones %**, **Continuidad %**, **Dolor EVA inicial→actual** y, si hay datos, el **gráfico EVA**.
- [ ] **Exportar PDF** abre una ventana nueva imprimible (permitir popups).
- [ ] Tras generar la narrativa, **"💾 Guardar informe"** la persiste; reaparece en **"Informes guardados"** con Ver / Exportar / Eliminar.

## 6. Cobro de una sesión
**Pre:** un paciente con **sesiones pendientes ≥ "sesiones por factura"** (default 5) aparece en *Listos para cobrar*.
**Hacer:** Pestaña **Facturación** → en el paciente, tocá **"✓ Cobrado"**.
**Esperar:**
- [ ] Toast verde **"Cobrado · Factura F0XX · N sesiones"** *(confirmación limpia — ya NO aparece el alert que prometía envío automático)*.
- [ ] El paciente sale de *Listos para cobrar* y el cobro aparece en **"Cobros recientes"** del mes.
- [ ] La etiqueta del cobro dice **"Cobro X de Y"** coherente.
- [ ] **Reinicio por episodio (I-4):** si el paciente tuvo un **nuevo episodio**, la numeración vuelve a **"Cobro 1 de Y"** (no arrastra cobros del episodio anterior).

## 7. Informe financiero / gerencial
**Hacer:** Pestaña **Facturación** (tarjetas superiores) y pestaña **Informes** → sub-tabs **Mensual** / **Anual**.
**Esperar:**
- [ ] Facturación muestra **Por cobrar ahora**, **Acumulando**, **Total cobros hechos**, **Sesiones cobradas**.
- [ ] Informes **Mensual**: sesiones del mes, continuidad, inasistencias, nuevos pacientes y **gráfico de 3 meses**; el selector de mes cambia los datos.
- [ ] Informes **Anual**: acumulados del año y **gráfico de sesiones por mes**.
- [ ] Los **chips de variación** (vs mes anterior) muestran **"—"** cuando no hay datos del mes previo (no inventan %).

---

## Extra — Notificaciones (cambiadas en esta pasada)
**Hacer:** Doctores → sub-tab **Notificaciones**.
**Esperar:**
- [ ] Banner **"🔧 Próximamente (requiere backend)"** y los toggles aparecen **deshabilitados** con la etiqueta **"Próximamente"** (nadie debe creer que están activos).
