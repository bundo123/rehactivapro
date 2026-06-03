import { state } from './state.js';
import { getPatient, getDisplayAge, esc, doneActual } from './utils.js';
import { toastErr } from './toast.js';
import { supa } from './supabase-client.js';

// formatHtml: opcional. Si se pasa, recibe el texto crudo de la IA y devuelve el HTML a inyectar
// (usado por la narrativa del informe paciente para mostrar 2 párrafos bajo encabezados propios).
export async function callAI(prompt, targetId, formatHtml) {
  const el=document.getElementById(targetId);if(!el)return;
  const { data:{ session } }=await supa.auth.getSession();
  if(!session?.access_token){toastErr('Tu sesión expiró. Vuelve a iniciar sesión.');return;}
  el.style.display='block';
  el.innerHTML='<div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);'
    +'border-radius:8px;padding:14px;font-size:12px;color:#6b6a64">⏳ Generando informe…</div>';
  try {
    const res=await fetch('/api/informe',{
      method:'POST',
      headers:{'content-type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({prompt})
    });
    if(!res.ok) throw new Error('status '+res.status);
    const data=await res.json();
    const text=data&&data.text?data.text:'';
    if(!text) throw new Error('respuesta vacía');
    el.innerHTML=formatHtml?formatHtml(text)
      :'<div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);'
      +'border-radius:8px;padding:14px;font-size:13px;color:#1a1917;line-height:1.6;white-space:pre-wrap">'
      +esc(text)+'</div>';
  } catch(e) {
    toastErr('No se pudo generar el informe. Intenta de nuevo.');
    el.innerHTML='<div style="background:rgba(226,75,74,.08);border:1px solid rgba(226,75,74,.25);'
      +'border-radius:8px;padding:14px;font-size:12px;color:#c33a3a">No se pudo generar el informe.</div>';
  }
}

export function genSemanalAI() {
  const conf=state.appointments.filter(a=>a.status==='conf').length;
  const noas=state.appointments.filter(a=>a.status==='noas').length;
  const total=state.appointments.length;
  const prompt=`Eres el asistente de gestión de Rehactiva, centro de rehabilitación y fisioterapia en Quito, Ecuador.
Analiza estos datos de la semana:
- Total de citas: ${total}
- Confirmadas/asistidas: ${conf}
- No asistieron: ${noas}
- Terapeutas activos: ${state.therapists.length}
- Tasa de asistencia: ${total>0?Math.round(conf/total*100):0}%

Genera un análisis ejecutivo breve (máximo 200 palabras) con: resumen del desempeño, puntos de atención y 2-3 recomendaciones concretas. Responde en español, tono profesional y directo.`;
  callAI(prompt,'insights');
}

// Limpia cualquier markdown que la IA pudiera devolver pese a las instrucciones (texto plano).
function _cleanAIMarkdown(t) {
  return String(t||'')
    .replace(/^#{1,6}\s*/gm,'')                 // títulos #
    .replace(/\*\*/g,'').replace(/__/g,'')      // negrita ** __
    .replace(/^\s*[-*•]\s+/gm,'')               // viñetas
    .replace(/\*/g,'')                          // asteriscos sueltos
    .trim();
}
// Las 4 secciones del informe de evolución (orden canónico). re = etiqueta como la emite la IA
// (MAYÚSCULAS, con/sin acento); title = encabezado que pinta la app.
const _NARR_SECTIONS=[
  {key:'condicion',  title:'Condición inicial',         re:/CONDICI[ÓO]N\s+INICIAL/i},
  {key:'evolucion',  title:'Evolución del tratamiento', re:/EVOLUCI[ÓO]N\s+DEL\s+TRATAMIENTO/i},
  {key:'resultados', title:'Resultados obtenidos',      re:/RESULTADOS\s+OBTENIDOS/i},
  {key:'recomend',   title:'Recomendaciones',           re:/RECOMENDACIONES/i},
];
// Quita un encabezado/etiqueta al inicio de un párrafo (la app pone su propio título).
function _stripLabel(s) {
  return String(s||'').replace(/^\s*(CONDICI[ÓO]N\s+INICIAL|EVOLUCI[ÓO]N\s+DEL\s+TRATAMIENTO|RESULTADOS\s+OBTENIDOS|RECOMENDACIONES|Evolución general|Evolución|Conclusión y recomendaciones|Conclusión)\s*:?\s*/i,'').trim();
}
// Render de la narrativa: hasta 4 secciones bajo encabezados con estilo propio de la app.
// Parte el texto por las etiquetas; si la IA no las emite, cae a un bloque único sin romper.
function _renderPatientNarrative(text) {
  const clean=_cleanAIMarkdown(text);
  const fmtBody=b=>esc(b).replace(/\s*\n\s*\n\s*/g,'<br><br>').replace(/\s*\n\s*/g,' ');
  const sec=(h,body)=>body?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#1D9E75;margin-bottom:4px">${esc(h)}</div><div style="font-size:13px;color:#1a1917;line-height:1.6">${fmtBody(body)}</div></div>`:'';
  const wrap=inner=>`<div style="background:rgba(29,158,117,.06);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:14px">${inner}</div>`;

  // Localizar cada etiqueta; el cuerpo va desde el fin de su etiqueta hasta la etiqueta siguiente.
  const hits=_NARR_SECTIONS.map(s=>{
    const m=s.re.exec(clean);
    return m?{key:s.key,title:s.title,start:m.index,end:m.index+m[0].length}:null;
  }).filter(Boolean).sort((a,b)=>a.start-b.start);

  if(hits.length){
    const bodies={};
    hits.forEach((h,i)=>{
      const to=i+1<hits.length?hits[i+1].start:clean.length;
      bodies[h.key]=_stripLabel(clean.slice(h.end,to).replace(/^\s*:\s*/,'').trim());
    });
    // Render SIEMPRE en orden canónico; sec() omite las secciones sin cuerpo.
    const inner=_NARR_SECTIONS.map(s=>sec(s.title,bodies[s.key]||'')).join('');
    return wrap(inner||sec('Informe de evolución',_stripLabel(clean)));
  }

  // Fallback: sin etiquetas reconocibles → mostrar el texto tal cual (sin etiquetas crudas, sin romper).
  return wrap(sec('Informe de evolución',_stripLabel(clean)));
}

export function genPatientAI() {
  const selEl=document.getElementById('patient-rpt-select');if(!selEl)return;
  const id=selEl.value;
  const p=state.patients.find(x=>x.id===id||String(x.id)===id);
  if(!p){toastErr('Selecciona un paciente primero');return;}
  const log=(p.log||[]).filter(s=>s.type!=='Fin de episodio');
  const evalRow=log.find(s=>s.type==='Evaluación inicial');
  const evalText=evalRow
    ?`EVA inicial ${evalRow.pb!=null?evalRow.pb:'?'}/10. Hallazgos: ${evalRow.note||'sin detalle registrado'}`
    :'No hay evaluación inicial registrada';
  const trat=log.filter(s=>s.type!=='Evaluación inicial');
  const sesiones=trat.length?trat.map(s=>{
    const eva=(s.pb!=null?s.pb:'?')+'→'+(s.pa!=null?s.pa:'?');
    const tec=(s.tags&&s.tags.length)?s.tags.join(', '):'sin técnicas registradas';
    const obs=s.note?s.note:'sin observación';
    return `- ${s.date}: EVA ${eva}; técnicas: ${tec}; observación: ${obs}`;
  }).join('\n'):'Sin sesiones de tratamiento registradas aún';
  const estado=p.status==='active'?'En tratamiento':p.status==='alta'?'Alta médica':'Inactivo';
  const prompt=`Eres un fisioterapeuta colegiado redactando un informe de evolución clínica en Ecuador, dirigido al médico que refirió al paciente y que también puede leer el propio paciente. Escribe con tono formal y profesional, pero claro. RESPETA estas reglas de redacción de forma estricta:
- TEXTO PLANO: prohibido markdown, asteriscos, numerales (#), guiones de viñeta o cualquier símbolo de formato. Solo prosa en párrafos.
- NO repitas cifras crudas que ya están en las tablas y el gráfico del informe (no listes los valores EVA de cada sesión ni el número de sesiones). En su lugar, INTERPRÉTALOS clínicamente.
- Sé específico y concreto. Prohibidas frases vagas o de relleno como 'respuesta favorable', 'abordaje multimodal', 'evolución satisfactoria', 'se recomienda continuar el tratamiento'. Cada oración debe aportar información clínica real y verificable.
- Enfócate en la FUNCIÓN: dolor, rango de movimiento, fuerza, y sobre todo el impacto en las actividades de la vida diaria del paciente.
- Refiérete siempre al 'paciente', nunca con nombre propio.
- Basa todo en los datos provistos (evaluación inicial, técnicas aplicadas, observaciones, EVA). No inventes hallazgos que no estén en los datos.

DATOS CLÍNICOS (anonimizado):
- Edad: ${getDisplayAge(p)}
- Diagnóstico: ${p.diag||'No especificado'}
- Estado actual: ${estado}
- Sesiones realizadas/prescritas: ${doneActual(p)}/${p.sessions||0}
- EVALUACIÓN INICIAL (anamnesis, inspección, palpación, movilidad, fuerza): ${evalText}
- HISTORIAL POR SESIÓN (fecha; EVA antes→después; técnicas aplicadas; observación):
${sesiones}

Redacta el informe en EXACTAMENTE estas cuatro secciones, cada una empezando con su etiqueta en MAYÚSCULAS seguida de dos puntos, separadas por una línea en blanco:

CONDICIÓN INICIAL: Resume el estado del paciente al iniciar el tratamiento según la evaluación inicial: diagnóstico, hallazgos físicos relevantes, nivel de dolor y limitaciones funcionales de partida (qué no podía hacer).

EVOLUCIÓN DEL TRATAMIENTO: Describe el progreso a lo largo de las sesiones. Relaciona las técnicas aplicadas con la respuesta del paciente. Explica cómo evolucionaron el dolor, la movilidad y la fuerza, y en qué momento se dieron los cambios más relevantes.

RESULTADOS OBTENIDOS: Compara el estado funcional ACTUAL con el inicial. Detalla concretamente qué mejoró (rango articular recuperado, reducción del dolor, funciones que el paciente ya puede realizar). Sé específico.

RECOMENDACIONES: Plan a seguir de forma concreta: tipo de ejercicios o fortalecimiento sugerido, continuidad del tratamiento, manejo o cuidados en casa, y signos de alerta a vigilar si aplica. Adapta las recomendaciones al diagnóstico y la ocupación/actividad del paciente.

Extensión total del informe: entre 280 y 380 palabras (completo, que llene aproximadamente dos páginas con el resto del documento, pero SIN relleno). Cada sección de 2 a 4 frases sustanciales.`;
  const outputEl=document.getElementById('patient-rpt-ai-output');
  if(outputEl){outputEl.style.display='block';callAI(prompt,'patient-rpt-ai-output',_renderPatientNarrative);}
}
