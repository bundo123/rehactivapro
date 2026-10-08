// Modelo de IA y lectura de la respuesta de Anthropic, compartido por los dos modos de
// api/informe.js (informe y pulir). Funciones puras: el entorno se pasa como argumento.

// Claude Sonnet 5.5: USD 2/10 por MTok (antes Sonnet 4.6 a 3/15). Se cambia con ANTHROPIC_MODEL
// en Vercel + redeploy, sin tocar código.
export const MODELO_IA_DEFECTO = 'claude-sonnet-5-5';

/** @param {Record<string,string|undefined>} env  process.env en el servidor */
export function modeloIA(env) {
  const m = String(env?.ANTHROPIC_MODEL || '').trim();
  return m || MODELO_IA_DEFECTO;
}

// Thinking. Sonnet 5.5 y Sonnet 5 piensan por defecto (adaptativo), y ese pensamiento sale del
// mismo max_tokens: con 600 o 1.024 tokens puede cortar la respuesta. Los dos modos son una sola
// llamada sin herramientas, así que se apaga el pensamiento previo y se mantiene lo de Sonnet 4.6
// (que sin el parámetro no pensaba). Cada modelo tiene su propio valor, y el de uno da 400 en el
// otro: Sonnet 5.5 rechaza 'disabled' y pide 'between_tools'. Un modelo que no está en la lista va
// sin el parámetro (su comportamiento por defecto): textoDeRespuesta igual ignora los bloques de
// thinking.
const THINKING_OFF = {
  'claude-sonnet-5-5': { type: 'between_tools' },
  'claude-sonnet-5': { type: 'disabled' },
};
export function opcionesThinking(model) {
  const t = THINKING_OFF[model];
  return t ? { thinking: { ...t } } : {};
}

// El texto de la respuesta: TODOS los bloques 'text', en orden. Antes se leía content[0].text,
// que con un modelo que piensa es un bloque 'thinking' (sin .text) y el informe salía vacío.
export function textoDeRespuesta(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text).join('').trim();
}
