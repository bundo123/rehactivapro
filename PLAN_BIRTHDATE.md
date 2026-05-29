# PLAN — Fase 2: Migrar age → birth_date

## 1. Archivos a modificar

```
js/validators.js  — nueva función validateBirthDate()          (+15 líneas al final)
js/utils.js       — nueva función getDisplayAge(p, showDate)   (+15 líneas al final)
index.html        — swap input visible + agregar hidden          línea 445
js/pacientes.js   — 5 sitios CRUD + dirty tracking + toast + import  líneas 102,118,128,144,299
js/auth.js        — mapper loadAll + query insert               líneas 63, 154
js/realtime.js    — mapper realtime                             línea 79
js/ia.js          — reemplazar p.age + import                   línea 46
js/informes.js    — reemplazar p.age en 2 lugares + import      líneas 315, 413
```

---

## 2. index.html — diff exacto (línea 445)

HOY:
```html
<div class="field-row two">
  <div class="field"><label>Nombre completo</label><input type="text" id="pm-name" placeholder="María García"></div>
  <div class="field"><label>Edad</label><input type="number" id="pm-age" value="35" min="1" max="99"></div>
</div>
```

DESPUÉS:
```html
<div class="field-row two">
  <div class="field"><label>Nombre completo</label><input type="text" id="pm-name" placeholder="María García"></div>
  <div class="field"><label>Fecha de nacimiento</label><input type="date" id="pm-birth"></div>
</div>
<input type="hidden" id="pm-age">
```

`pm-age` se convierte en `hidden`. El usuario nunca lo ve ni lo edita. El JS sigue
leyendo/escribiendo su valor solo para mostrar la edad legada de pacientes viejos
que no tienen `birth_date`.

---

## 3. js/pacientes.js — funciones tocadas y cómo

**Línea 102** — update path, leer del form:
```js
// HOY:
p.age = parseInt(document.getElementById('pm-age').value) || 35;

// DESPUÉS:
p.age        = parseInt(document.getElementById('pm-age').value) || null;
p.birth_date = document.getElementById('pm-birth').value || null;
```

**Línea 118** — objeto enviado al UPDATE de Supabase:
```js
// DESPUÉS (agregar birth_date):
{ name:p.name, age:p.age, birth_date:p.birth_date, cedula:p.cedula, tel:p.tel, ... }
```

**Línea 128** — insert path, leer del form:
```js
// HOY:
age: parseInt(document.getElementById('pm-age').value) || 35,

// DESPUÉS:
age:        parseInt(document.getElementById('pm-age').value) || null,
birth_date: document.getElementById('pm-birth').value || null,
```

**Línea 144** — objeto enviado al INSERT de Supabase:
```js
// DESPUÉS (agregar birth_date):
{ name:_p.name, age:_p.age, birth_date:_p.birth_date, cedula:_p.cedula, ... }
```

**Línea 299** — openEditModal, poblar el form al abrir:
```js
// HOY:
document.getElementById('pm-age').value = p.age || '';

// DESPUÉS:
document.getElementById('pm-age').value   = p.age || '';
document.getElementById('pm-birth').value = p.birth_date || '';
```

**Dirty tracking** — donde se construye el array de campos del tracker, agregar
`'pm-birth'` junto a `'pm-cedula'`, `'pm-tel'`, `'pm-email'`.

**Validación inline** — registrar listener `change`/`blur` en `pm-birth` que llame
`validateBirthDate(value)` y use `showFieldError`/`clearFieldError`, mismo patrón
que la cédula.

**Toast de advertencia** — inmediatamente después del `toastOk('Paciente guardado')`
(en update Y en insert), agregar:
```js
if (!birth_date) toastInfo('Sin fecha de nacimiento. Algunos reportes mostrarán edad como "no registrada".');
```

**Import línea 7** — añadir `validateBirthDate`:
```js
import { validateRequired, validateCedulaEcuatoriana, validateTelefono,
         validateEmail, showFieldError, clearFieldError, clearAllErrors,
         createDirtyTracker, validateBirthDate } from './validators.js';
```

---

## 4. js/auth.js — loadAll y dbSavePatient

**Línea 63** — mapper que construye el objeto paciente al cargar de Supabase:
```js
// HOY:
age: r.age || 35,

// DESPUÉS:
age:        r.age || null,
birth_date: r.birth_date || null,
```

**Línea 154** — query INSERT al guardar paciente nuevo desde auth:
```js
// DESPUÉS (agregar al objeto):
await supa.from('patients').insert({
  name:p.name, age:p.age, birth_date:p.birth_date,
  cedula:p.cedula, tel:p.tel, email:p.email, ...
});
```

---

## 5. js/realtime.js — mapper de eventos realtime

**Línea 79** — mapper que convierte rows de realtime al mismo formato de estado:
```js
// HOY:
age: r.age || 35,

// DESPUÉS:
age:        r.age || null,
birth_date: r.birth_date || null,
```

---

## 6. js/informes.js y js/ia.js — reemplazos de p.age

**ia.js línea 46:**
```js
// HOY:
`- Edad: ${p.age || 'No registrada'} años`

// DESPUÉS:
`- Edad: ${getDisplayAge(p)}`
```
`getDisplayAge` ya devuelve `"45 años"` o `"Sin edad"` — sin concatenar `" años"` aparte.

**ia.js import línea 2** — agregar `getDisplayAge`:
```js
import { getTherapist, getDoctor, getPatient, getDisplayAge } from './utils.js';
```

**informes.js línea 315** — tarjeta de episodio en informe:
```js
// HOY:
${p.age || '?'} años

// DESPUÉS:
${getDisplayAge(p)}
```

**informes.js línea 413** — ficha completa del paciente (showDate=true):
```js
// HOY:
+ (p?.age || '—') + ' años'

// DESPUÉS:
+ getDisplayAge(p, true)
```
Con `showDate=true` el output es `"12/05/1980 (45 años)"` si hay `birth_date`,
o `"45 años"` si solo hay `age`, o `"Sin edad"`.

**informes.js import línea 2** — agregar `getDisplayAge`:
```js
import { esc, fmtDate, getPatient, getTherapist, getDoctor, getColor,
         therapistHours, ALL_HOURS, DAYS, COLOR_OPTIONS, getDisplayAge } from './utils.js';
```

---

## 7. js/utils.js — función getDisplayAge(p, showDate)

```js
export function getDisplayAge(p, showDate = false) {
  if (p.birth_date) {
    const bd    = new Date(p.birth_date);
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    if (showDate) {
      const dd = bd.getDate().toString().padStart(2, '0');
      const mm = (bd.getMonth() + 1).toString().padStart(2, '0');
      return `${dd}/${mm}/${bd.getFullYear()} (${age} años)`;
    }
    return `${age} años`;
  }
  if (p.age) return `${p.age} años`;
  return 'Sin edad';
}
```

Lógica rama a rama:
- `p.birth_date` existe → edad exacta calculada al día. Con `showDate=true`: `"12/05/1980 (45 años)"`. Con `showDate=false`: `"45 años"`.
- Solo `p.age` (paciente viejo sin birth_date) → `"45 años"` — compatibilidad total, sin tocar datos.
- Ninguno → `"Sin edad"`.

---

## 8. js/validators.js — función validateBirthDate(value)

```js
export function validateBirthDate(value) {
  if (!value) return { valid: true, error: '' };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { valid: false, error: 'Fecha inválida' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d > today) return { valid: false, error: 'Fecha no puede ser futura' };
  const minDate = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  if (d < minDate) return { valid: false, error: 'Fecha demasiado antigua' };
  return { valid: true, error: '' };
}
```

Reglas:
- Vacío → `valid: true` (campo opcional, nunca bloquea el save).
- Parse falla → `"Fecha inválida"`.
- Fecha > hoy → `"Fecha no puede ser futura"`.
- Fecha < hoy − 120 años → `"Fecha demasiado antigua"`.
- Retorna `{ valid: boolean, error: string }` — mismo contrato que `validateCedulaEcuatoriana`, `validateEmail`, etc.

---

## 9. Escenarios de testing manual

| # | Escenario | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Paciente nuevo **con** fecha | Ingresar fecha válida → guardar | Guarda OK · lista/ficha muestra edad calculada |
| 2 | Paciente nuevo **sin** fecha | Dejar pm-birth vacío → guardar | Guarda OK · toast de advertencia |
| 3 | Paciente viejo (sin birth_date) | Abrir ficha solo a ver | Muestra `p.age` viejo · sin crash |
| 4 | Paciente viejo → agregar fecha | Abrir ficha · poner birth_date · guardar | A partir de ahí usa birth_date · `p.age` ignorado |
| 5 | Fecha futura | Poner fecha de mañana → salir del campo | Error inline: "Fecha no puede ser futura" |
| 6 | Fecha hace 200 años | Poner 1800-01-01 → salir del campo | Error inline: "Fecha demasiado antigua" |

---

## Resumen cuantitativo

8 archivos · ~35 líneas de cambio neto · 2 funciones nuevas · sin ALTER TABLE · sin migración automática de datos.
