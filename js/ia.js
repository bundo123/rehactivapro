import { state } from './state.js';
import { getTherapist, getDoctor, getPatient, getDisplayAge } from './utils.js';
import { toastErr } from './toast.js';

export function callAI(prompt, targetId) {
  const el=document.getElementById(targetId);if(!el)return;
  el.style.display='block';
  const encoded=encodeURIComponent(prompt);
  const url='https://claude.ai/new?q='+encoded;
  window.open(url,'_blank');
  el.innerHTML='<div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:14px;font-size:12px;color:#6b6a64;line-height:1.6">'
    +'<div style="font-weight:600;color:#1D9E75;margin-bottom:6px">✓ Claude.ai abierto en nueva pestaña</div>'
    +'El informe se está generando en Claude.ai. Copia el resultado y pégalo aquí si lo necesitas.<br><br>'
    +'<textarea style="width:100%;background:#f8f8f4;border:1px solid rgba(29,158,117,.25);border-radius:6px;padding:8px;font-size:12px;color:#1a1917;font-family:inherit;resize:vertical;min-height:80px" placeholder="Pega aquí el informe generado por Claude..."></textarea>'
    +'</div>';
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
  const th=getTherapist(p.therapistId);
  const doc=p.doctorId?getDoctor(p.doctorId):null;
  const sesiones=p.log&&p.log.length>0?p.log.map(s=>`- ${s.date}: EVA ${s.pb||'?'}→${s.pa||'?'}, ${s.type||s.status||''}, ${s.note||''}`.trim()).join('\n'):'Sin sesiones registradas aún';
  const prompt=`Eres un fisioterapeuta redactando un informe clínico profesional para Ecuador.

DATOS DEL PACIENTE:
- Nombre: ${p.name}
- Edad: ${getDisplayAge(p)}
- Diagnóstico: ${p.diag||'No especificado'}
- Terapeuta: ${th?th.name:'No asignado'}
- Doctor referente: ${doc?doc.name+' ('+doc.spec+')':'Independiente'}
- Sesiones prescritas: ${p.sessions||0}
- Sesiones realizadas: ${p.done||0}
- Estado: ${p.status==='active'?'En tratamiento':p.status==='alta'?'Alta médica':'Inactivo'}

HISTORIAL DE SESIONES:
${sesiones}

Redacta un informe clínico de evolución en español, formato profesional médico, máximo 300 palabras. Incluye: estado actual, evolución del dolor (EVA), respuesta al tratamiento y recomendaciones.`;
  const outputEl=document.getElementById('patient-rpt-ai-output');
  if(outputEl){outputEl.style.display='block';callAI(prompt,'patient-rpt-ai-output');}
}
