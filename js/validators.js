// ── Pure validators — all return { valid: boolean, error: string } ──

export function validateRequired(value) {
  const valid = value.trim() !== '';
  return { valid, error: valid ? '' : 'Campo obligatorio' };
}

export function validateCedulaEcuatoriana(value) {
  const v = value.replace(/[\s\-]/g, '');
  if (!v) return { valid: true, error: '' };
  if (!/^\d{10}$/.test(v)) return { valid: false, error: 'Cédula ecuatoriana inválida' };
  const prov = parseInt(v.slice(0, 2), 10);
  if (prov < 1 || prov > 24) return { valid: false, error: 'Cédula ecuatoriana inválida' };
  if (parseInt(v[2], 10) > 5)  return { valid: false, error: 'Cédula ecuatoriana inválida' };
  const coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = parseInt(v[i], 10) * coefs[i];
    if (p >= 10) p -= 9;
    sum += p;
  }
  const verif = (10 - (sum % 10)) % 10;
  const valid  = verif === parseInt(v[9], 10);
  return { valid, error: valid ? '' : 'Cédula ecuatoriana inválida' };
}

export function validateTelefono(value) {
  const v = value.trim();
  if (!v) return { valid: true, error: '' };
  const valid = /^\+\d{7,15}$/.test(v) || /^0\d{8,9}$/.test(v);
  return { valid, error: valid ? '' : 'Teléfono inválido (10 dígitos o formato internacional con +)' };
}

export function validateEmail(value) {
  const v = value.trim();
  if (!v) return { valid: true, error: '' };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return { valid, error: valid ? '' : 'Email inválido' };
}

export function validateMinChars(value, min) {
  const valid = value.trim().length >= min;
  return { valid, error: valid ? '' : `Mínimo ${min} caracteres` };
}

// ── DOM helpers ──

export function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  let span = el.nextElementSibling;
  if (!span || !span.classList.contains('input-error-msg')) {
    span = document.createElement('span');
    span.className = 'input-error-msg';
    el.parentNode.insertBefore(span, el.nextSibling);
  }
  span.textContent = msg;
}

export function clearFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('input-error');
  const span = el.nextElementSibling;
  if (span && span.classList.contains('input-error-msg')) span.remove();
}

export function clearAllErrors(ids) {
  ids.forEach(clearFieldError);
}

// ── Dirty tracker factory ──

export function createDirtyTracker() {
  const dirty = new Set();
  return {
    mark:  (id) => dirty.add(id),
    has:   (id) => dirty.has(id),
    reset: ()   => dirty.clear(),
  };
}
