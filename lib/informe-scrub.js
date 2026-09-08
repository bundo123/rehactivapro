// Red de seguridad PII para el prompt del informe IA (SEC-2).
// El prompt clínico ya se arma anonimizado (js/ia.js: sin nombre propio, solo edad y diagnóstico),
// pero el texto libre de las sesiones (observación, evaluación inicial) lo escribe una persona y
// ahí sí puede colarse una cédula, un correo o un celular. Esto lo tacha antes de salir a Anthropic.
//
// Regla de oro: NO tocar números de 1 a 8 dígitos. El prompt está lleno de cifras clínicas
// ("12 sesiones", "45 años", "3 semanas", EVA, fechas) y redactarlas rompería el informe.

const REDACTED = '[redactado]';

// Correos. Se hace primero: un correo puede llevar dígitos que confundirían a las otras reglas.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Celular internacional: +593 y 9 dígitos, con espacios/puntos/guiones opcionales entre medio
// (+593987654321, +593 98 765 4321, +593-98-765-4321). El "+593" ancla el patrón, así que los
// separadores sueltos no arrastran cifras ajenas.
const TEL_INTL = /\+593(?:[\s.-]?\d){9}/g;

// Celular nacional: 09 y 8 dígitos más (0987654321, 098 765 4321, 09 8765 4321).
// Solo el espacio vale de separador, y uno solo entre dígitos. Admitir "." o "-" tachaba fechas
// escritas a mano en las observaciones: "09-12-2025 12" también son 09 + 8 dígitos y caía entera.
const TEL_NAC = /\b09(?:\s?\d){8}\b/g;

// Cédula ecuatoriana: exactamente 10 dígitos seguidos, sin separadores.
// Los \b evitan morder tramos de números más largos (que ya no son cédula).
const CEDULA = /\b\d{10}\b/g;

/**
 * Tacha PII evidente de un texto libre antes de mandarlo al proveedor de IA.
 * @param {string} text
 * @returns {string} el mismo texto con cédulas, correos y teléfonos reemplazados por "[redactado]".
 */
export function scrubPII(text) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(EMAIL, REDACTED)
    .replace(TEL_INTL, REDACTED)
    .replace(TEL_NAC, REDACTED)
    .replace(CEDULA, REDACTED);
}
