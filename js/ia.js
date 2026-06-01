import { state } from './state.js';
import { getPatient, getDisplayAge, esc } from './utils.js';
import { toastErr } from './toast.js';
import { supa } from './supabase-client.js';

export async function callAI(prompt, targetId) {
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
    el.innerHTML='<div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);'
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

export function genPatientAI() {
  const selEl=document.getElementById('patient-rpt-select');if(!selEl)return;
  const id=selEl.value;
  const p=state.patients.find(x=>x.id===id||String(x.id)===id);
  if(!p){toastErr('Selecciona un paciente primero');return;}
  const sesiones=p.log&&p.log.length>0?p.log.map(s=>`- ${s.date}: EVA ${s.pb||'?'}→${s.pa||'?'}, ${s.type||s.status||''}, ${s.note||''}`.trim()).join('\n'):'Sin sesiones registradas aún';
  const prompt=`Eres un fisioterapeuta redactando un informe clínico profesional para Ecuador.

DATOS CLÍNICOS DEL PACIENTE (anonimizado, sin datos personales):
- Edad: ${getDisplayAge(p)}
- Diagnóstico: ${p.diag||'No especificado'}
- Sesiones prescritas: ${p.sessions||0}
- Sesiones realizadas: ${p.done||0}
- Estado: ${p.status==='active'?'En tratamiento':p.status==='alta'?'Alta médica':'Inactivo'}

HISTORIAL DE SESIONES (EVA dolor antes→después):
${sesiones}

Redacta SOLO dos secciones cortas, en español, tono clínico profesional, máximo 150 palabras EN TOTAL. Refiérete siempre al "paciente", sin nombres propios. Usa exactamente estos encabezados y nada más:

Evolución general:
(2-3 frases sobre la respuesta al tratamiento y la evolución del dolor EVA)

Conclusión y recomendaciones:
(2-3 frases con el estado actual y los próximos pasos sugeridos)`;
  const outputEl=document.getElementById('patient-rpt-ai-output');
  if(outputEl){outputEl.style.display='block';callAI(prompt,'patient-rpt-ai-output');}
}
