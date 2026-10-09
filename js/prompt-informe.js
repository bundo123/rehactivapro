// Prompt de la narrativa IA del informe del paciente (genPatientAI en ia.js). Función PURA, sin DOM
// ni state, para poder testear las reglas con node --test (ia.js importa el cliente de Supabase y no
// carga fuera de Vite). Lo que depende de state (protocolo, médico) llega ya resuelto.
import { getDisplayAge, diagParaPrompt, ctxParaPrompt, sesionesMostradas, textoPrevias } from './utils.js';
import { resumenResp } from './soap.js';

// MINI-1: sin EVA en la evaluación → "no medido" (antes "?/10", que la IA leía como dato).
export function evalTextoPrompt(evalRow) {
  if (!evalRow) return 'No hay evaluación inicial registrada';
  const eva = evalRow.pb != null ? `EVA inicial ${evalRow.pb}/10.` : 'EVA inicial: no medido.';
  return `${eva} Hallazgos: ${evalRow.note || 'sin detalle registrado'}`;
}

/**
 * @param {object} a
 * @param {object} a.p           paciente
 * @param {object[]} a.log       log del episodio (logDeEpisodio)
 * @param {string} a.epDiag      diagnóstico del episodio
 * @param {number} a.epSessions  sesiones prescritas del episodio
 * @param {number} a.epDone      sesiones hechas del episodio
 * @param {boolean} a.esActual   el episodio es el actual
 * @param {object|null} a.prot   protocolo vinculado (solo en el episodio actual)
 * @param {boolean} a.tieneMedico hay médico referente registrado
 * @param {number} [a.epPrevias] sesiones previas a RehactivaPro del episodio (EPI-2a)
 */
export function promptInformePaciente({ p, log, epDiag, epSessions, epDone, esActual, prot, tieneMedico, epPrevias = 0 }) {
  const evalRow = log.find(s => s.type === 'Evaluación inicial');
  const evalText = evalTextoPrompt(evalRow);
  const trat = log.filter(s => s.type !== 'Evaluación inicial');
  const sesiones = trat.length ? trat.map(s => {
    const eva = (s.pb != null ? s.pb : '?') + '→' + (s.pa != null ? s.pa : '?');
    const tec = (s.tags && s.tags.length) ? s.tags.join(', ') : 'sin técnicas registradas';
    const obs = s.note ? s.note : 'sin observación';
    // RESP-1: lo registrado en la sesión respiratoria (signos antes→después, O₂, secreciones, tolerancia).
    const resp = s.soap ? resumenResp(s.soap) : '';
    return `- ${s.date}: EVA ${eva}; técnicas: ${tec};${resp ? ` registro respiratorio: ${resp};` : ''} observación: ${obs}`;
  }).join('\n') : 'Sin sesiones de tratamiento registradas aún';
  const estado = !esActual ? 'Episodio cerrado'
    : p.status === 'active' ? 'En tratamiento' : p.status === 'alta' ? 'Alta médica' : 'Inactivo';
  // El CIE-10 es del paciente HOY (misma regla que el informe): en un episodio cerrado va solo el
  // diagnóstico de entonces, leído de la nota del marcador.
  const diagPrompt = esActual ? diagParaPrompt(p) : (epDiag || p.diag || 'No especificado');
  // PR-B: contexto del protocolo SOLO por link explícito (protocol_id), tope duro de 1.200 caracteres (D4).
  const protCtx = prot ? ctxParaPrompt(prot) : '';
  // Sin médico registrado no hay "médico que refirió": la IA no debe inventarlo.
  const destinatario = tieneMedico ? 'dirigido al médico que refirió al paciente y que también puede leer el propio paciente'
    : 'dirigido al paciente y a su equipo de salud';
  return `Eres un fisioterapeuta colegiado redactando un informe de evolución clínica en Ecuador, ${destinatario}. Escribe con tono formal y profesional, pero claro. RESPETA estas reglas de redacción de forma estricta:
- TEXTO PLANO: prohibido markdown, asteriscos, numerales (#), guiones de viñeta o cualquier símbolo de formato. Solo prosa en párrafos.
- NO repitas cifras crudas que ya están en las tablas y el gráfico del informe (no listes los valores EVA de cada sesión ni el número de sesiones). En su lugar, INTERPRÉTALOS clínicamente.
- Sé específico y concreto. Prohibidas frases vagas o de relleno como 'respuesta favorable', 'abordaje multimodal', 'evolución satisfactoria', 'se recomienda continuar el tratamiento'. Cada oración debe aportar información clínica real y verificable.
- Enfócate en la FUNCIÓN: dolor, rango de movimiento y fuerza.
- Menciona actividades de la vida diaria SOLO si aparecen en los datos; no las supongas ni las deduzcas.
- No reemplaces términos clínicos por otros parecidos (por ejemplo, 'sin complicaciones' no es 'sin compensaciones').
- Refiérete siempre al 'paciente', nunca con nombre propio.${tieneMedico ? '' : `
- No menciones a ningún médico referente: este paciente no tiene uno registrado.`}
- Basa todo en los datos provistos (evaluación inicial, técnicas aplicadas, observaciones, EVA). No inventes hallazgos que no estén en los datos.${protCtx ? `
- BARRERA: más abajo se incluye un CONTEXTO DEL PROTOCOLO. Es una PLANTILLA DE REFERENCIA (objetivos e hitos típicos de este tipo de tratamiento), NO la historia clínica de este paciente. Jamás afirmes que algo de esa plantilla se le aplicó, se le encontró o le ocurrió al paciente: SOLO lo listado en DATOS CLÍNICOS ocurrió realmente. Úsala únicamente para enmarcar objetivos y recomendaciones.` : ''}

DATOS CLÍNICOS (anonimizado):
- Edad: ${getDisplayAge(p)}
- Diagnóstico: ${diagPrompt}
- Estado actual: ${estado}
- Sesiones realizadas/prescritas: ${sesionesMostradas(epDone, epPrevias)}/${epSessions || 0}${epPrevias ? ` (${textoPrevias(epPrevias)})` : ''}
- EVALUACIÓN INICIAL (anamnesis, inspección, palpación, movilidad, fuerza): ${evalText}
- HISTORIAL POR SESIÓN (fecha; EVA antes→después; técnicas aplicadas; observación):
${sesiones}${protCtx ? `

CONTEXTO DEL PROTOCOLO (plantilla de referencia, NO son hallazgos de este paciente; úsalo solo para enmarcar objetivos y recomendaciones, jamás como algo que se le hizo o registró):
${protCtx}` : ''}

Redacta el informe en EXACTAMENTE estas cuatro secciones, cada una empezando con su etiqueta en MAYÚSCULAS seguida de dos puntos, separadas por una línea en blanco:

CONDICIÓN INICIAL: Resume el estado del paciente al iniciar el tratamiento según la evaluación inicial: diagnóstico, hallazgos físicos relevantes, nivel de dolor y limitaciones funcionales registradas.

EVOLUCIÓN DEL TRATAMIENTO: Describe el progreso a lo largo de las sesiones. Relaciona las técnicas aplicadas con la respuesta del paciente. Explica cómo evolucionaron el dolor, la movilidad y la fuerza, y en qué momento se dieron los cambios más relevantes.

RESULTADOS OBTENIDOS: Compara el estado funcional ACTUAL con el inicial. Detalla concretamente qué mejoró (rango articular recuperado, reducción del dolor, funciones registradas que el paciente ya puede realizar). Sé específico.

RECOMENDACIONES: Plan a seguir de forma concreta: tipo de ejercicios o fortalecimiento sugerido, continuidad del tratamiento, manejo o cuidados en casa, y signos de alerta a vigilar si aplica. Adapta las recomendaciones al diagnóstico, y a la ocupación o actividad del paciente solo si aparecen en los datos.

Extensión total del informe: entre 280 y 380 palabras (completo, que llene aproximadamente dos páginas con el resto del documento, pero SIN relleno). Cada sección de 2 a 4 frases sustanciales.`;
}
