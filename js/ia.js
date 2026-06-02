import { state } from './state.js';
import { getPatient, getDisplayAge, esc } from './utils.js';
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
// Quita un encabezado/etiqueta al inicio de un párrafo (la app pone su propio título).
function _stripLabel(s) {
  return String(s||'').replace(/^\s*(Evolución general|Evolución|Conclusión y recomendaciones|Conclusión)\s*:?\s*/i,'').trim();
}
// Render de la narrativa: 2 párrafos bajo encabezados con estilo propio de la app.
function _renderPatientNarrative(text) {
  const clean=_cleanAIMarkdown(text);
  let parts=clean.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
  if(parts.length<2){                            // sin línea en blanco: partir por salto simple
    const lines=clean.split(/\n/).map(s=>s.trim()).filter(Boolean);
    if(lines.length>=2) parts=[lines[0],lines.slice(1).join(' ')];
  }
  const p1=_stripLabel(parts[0]||clean||'');
  const p2=_stripLabel(parts[1]||'');
  const sec=(h,body)=>body?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#1D9E75;margin-bottom:4px">${h}</div><div style="font-size:13px;color:#1a1917;line-height:1.6">${esc(body)}</div></div>`:'';
  return `<div style="background:rgba(29,158,117,.06);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:14px">${sec('Evolución',p1)}${sec('Conclusión y recomendaciones',p2)}</div>`;
}

export function genPatientAI() {
  const selEl=document.getElementById('patient-rpt-select');if(!selEl)return;
  const id=selEl.value;
  const p=state.patients.find(x=>x.id===id||String(x.id)===id);
  if(!p){toastErr('Selecciona un paciente primero');return;}
  const sesLog=(p.log||[]).filter(s=>s.type!=='Fin de episodio');
  const sesiones=sesLog.length?sesLog.map(s=>{
    const eva=(s.pb!=null?s.pb:'?')+'→'+(s.pa!=null?s.pa:'?');
    const tec=(s.tags&&s.tags.length)?s.tags.join(', '):'sin técnicas registradas';
    const obs=s.note?s.note:'sin observación';
    return `- ${s.date}: EVA ${eva}; técnicas: ${tec}; observación: ${obs}`;
  }).join('\n'):'Sin sesiones registradas aún';
  const estado=p.status==='active'?'En tratamiento':p.status==='alta'?'Alta médica':'Inactivo';
  const prompt=`Eres un fisioterapeuta redactando la narrativa de un informe clínico de evolución para Ecuador. Va dirigido principalmente al médico referente, y también puede leerlo el paciente. Tono formal y profesional, pero claro y comprensible.

DATOS CLÍNICOS (anonimizado, sin nombres):
- Edad: ${getDisplayAge(p)}
- Diagnóstico: ${p.diag||'No especificado'}
- Sesiones realizadas/prescritas: ${p.done||0}/${p.sessions||0}
- Estado: ${estado}
HISTORIAL POR SESIÓN (fecha, EVA antes→después, técnicas aplicadas, observación):
${sesiones}

REGLAS DE REDACCIÓN:
- TEXTO PLANO. Prohibido markdown, asteriscos, numerales (#), viñetas o títulos. Solo prosa.
- NO repitas las cifras crudas (valores EVA, nº de sesiones): ya están en las tablas y el gráfico. En su lugar, INTERPRÉTALAS clínicamente.
- Sé específico. Prohibidas frases vagas o de relleno como 'respuesta favorable', 'abordaje multimodal', 'es fundamental mantener la consistencia'. Cada oración debe aportar info clínica real.
- Enfócate en la FUNCIÓN: movilidad, dolor, actividades cotidianas, limitaciones. Menciona las técnicas aplicadas y cómo respondió el paciente.
- Refiérete siempre al 'paciente', sin nombres.

Devuelve EXACTAMENTE dos párrafos en texto plano, separados por una línea en blanco, máximo ~130 palabras en total, SIN títulos:
Párrafo 1: evolución e interpretación de la respuesta al tratamiento.
Párrafo 2: estado funcional actual y recomendaciones concretas para las próximas sesiones.`;
  const outputEl=document.getElementById('patient-rpt-ai-output');
  if(outputEl){outputEl.style.display='block';callAI(prompt,'patient-rpt-ai-output',_renderPatientNarrative);}
}
