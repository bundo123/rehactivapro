import { state } from './state.js';
import { getDisplayAge, esc, doneActual, dmy, semanaRango, citasEnFechas, citasEnPrefijo,
         nuevosEnPrefijo, resumenCitas, MES_LARGO } from './utils.js';
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
  let errMsg='No se pudo generar el informe. Intenta de nuevo.';
  try {
    const res=await fetch('/api/informe',{
      method:'POST',
      headers:{'content-type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({prompt})
    });
    if(res.status===429) errMsg='Demasiadas solicitudes de IA. Espera un minuto e intenta de nuevo.';
    if(res.status===403) errMsg='Tu rol no permite generar informes con IA.';
    if(!res.ok) throw new Error('status '+res.status);
    const data=await res.json();
    const text=data&&data.text?data.text:'';
    if(!text) throw new Error('respuesta vacía');
    el.innerHTML=formatHtml?formatHtml(text)
      :'<div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);'
      +'border-radius:8px;padding:14px;font-size:13px;color:#1a1917;line-height:1.6;white-space:pre-wrap">'
      +esc(text)+'</div>';
  } catch(e) {
    toastErr(errMsg);
    el.innerHTML='<div style="background:rgba(226,75,74,.08);border:1px solid rgba(226,75,74,.25);'
      +'border-radius:8px;padding:14px;font-size:12px;color:#c33a3a">'+esc(errMsg)+'</div>';
  }
}

// ── Análisis con IA de los informes de clínica ────────────────────────────────
// Una función por sub-tab, cada una con SU rango, SU prompt y SU destino visible dentro del
// sub-tab que la disparó. Antes las tres pasaban por genSemanalAI, que mandaba el histórico
// COMPLETO de state.appointments rotulado como "la semana" y escribía en #insights (dentro del
// sub-tab semanal, invisible desde mensual/anual).
const CABECERA='Eres el asistente de gestión de Rehactiva, centro de rehabilitación y fisioterapia en Quito, Ecuador.';
const CIERRE='Responde en español, en texto plano (sin markdown ni viñetas), tono profesional y directo. No inventes datos que no estén en la lista.';

export function genSemanalAI() {
  const {dates}=semanaRango(state.currentWeek);
  const citas=citasEnFechas(state.appointments,dates);
  const r=resumenCitas(citas);
  // Terapeutas CON citas en la semana, no el tamaño del equipo: el bloque dice "todos los datos
  // de esa semana" y state.therapists.length es una plantilla total que no depende del rango.
  const thSemana=new Set(citas.filter(a=>a.therapistId).map(a=>String(a.therapistId))).size;
  const prompt=`${CABECERA}
Analiza la SEMANA del ${dmy(dates[0])} al ${dmy(dates[4])} (lunes a viernes). Estos son TODOS los datos de esa semana, nada más:
- Total de citas agendadas: ${r.total}
- Asistieron: ${r.conf}
- No asistieron: ${r.noas}
- Aún pendientes de marcar: ${r.pend}
- Tasa de asistencia: ${r.asistencia}%
- Terapeutas con citas esa semana: ${thSemana} (de ${state.therapists.length} en el equipo)

Genera un análisis ejecutivo breve (máximo 200 palabras) con: resumen del desempeño de la semana, puntos de atención y 2-3 recomendaciones concretas para la semana siguiente. Si la semana casi no tiene citas, dilo en vez de forzar conclusiones. ${CIERRE}`;
  callAI(prompt,'semanal-ai-output');
}

export function genMensualAI() {
  const now=new Date();
  const ym=state.informesMes||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [y,m]=ym.split('-').map(Number);
  const prevD=new Date(y,m-2,1);
  const pym=`${prevD.getFullYear()}-${String(prevD.getMonth()+1).padStart(2,'0')}`;
  const cur=resumenCitas(citasEnPrefijo(state.appointments,ym));
  const prev=resumenCitas(citasEnPrefijo(state.appointments,pym));
  const nuevos=nuevosEnPrefijo(state.patients,ym);
  const nuevosPrev=nuevosEnPrefijo(state.patients,pym);
  const nom=x=>`${MES_LARGO[parseInt(x.split('-')[1],10)-1]} ${x.split('-')[0]}`;
  const cont=v=>v==null?'sin citas decididas':v+'%';
  const prompt=`${CABECERA}
Analiza el MES de ${nom(ym)} y compáralo con ${nom(pym)}. Estos son TODOS los datos de esos dos meses, nada más:

${nom(ym)} (mes analizado):
- Sesiones realizadas: ${cur.conf}
- Inasistencias: ${cur.noas}
- Continuidad (asistidas sobre citas decididas): ${cont(cur.continuidad)}
- Pacientes nuevos: ${nuevos}

${nom(pym)} (mes anterior, solo para comparar):
- Sesiones realizadas: ${prev.conf}
- Inasistencias: ${prev.noas}
- Continuidad: ${cont(prev.continuidad)}
- Pacientes nuevos: ${nuevosPrev}

Contexto de la clínica hoy: ${state.patients.filter(p=>p.status==='active').length} pacientes en tratamiento y ${state.therapists.length} terapeutas activos.

Genera un análisis mensual (máximo 250 palabras) con: qué cambió respecto al mes anterior y por qué importa, el estado de la continuidad frente a la meta del 85%, y 2-3 acciones concretas para el mes siguiente. Si el mes anterior no tiene datos, dilo y analiza el mes solo. ${CIERRE}`;
  callAI(prompt,'mensual-ai-output');
}

export function genAnualAI() {
  const now=new Date();
  const year=now.getFullYear();
  const r=resumenCitas(citasEnPrefijo(state.appointments,String(year)));
  // Mes a mes del año en curso: es lo que da la lectura de tendencia (el acumulado solo, no).
  const porMes=[];
  for(let m=0;m<12;m++){
    const ym=`${year}-${String(m+1).padStart(2,'0')}`;
    const s=resumenCitas(citasEnPrefijo(state.appointments,ym));
    if(s.total>0) porMes.push(`- ${MES_LARGO[m]}: ${s.conf} sesiones, ${s.noas} inasistencias`);
  }
  const mesesCompletos=now.getMonth();   // meses ya cerrados este año
  const altas=state.patients.filter(p=>p.status==='alta').length;
  const unicos=new Set(citasEnPrefijo(state.appointments,String(year)).map(a=>a.patientId)).size;
  const prompt=`${CABECERA}
Analiza el AÑO ${year} en curso (datos de enero a la fecha, con ${mesesCompletos} ${mesesCompletos===1?'mes cerrado':'meses cerrados'}). Estos son TODOS los datos del año, nada más:
- Sesiones acumuladas: ${r.conf}
- Inasistencias acumuladas: ${r.noas}
- Continuidad del año (asistidas sobre citas decididas): ${r.continuidad==null?'sin citas decididas':r.continuidad+'%'}
- Pacientes únicos con al menos una cita en ${year}: ${unicos}
- Altas médicas registradas (total histórico): ${altas}

Desglose por mes (solo los meses con actividad):
${porMes.length?porMes.join('\n'):'- Sin actividad registrada en el año'}

Genera un análisis anual (máximo 250 palabras) con: la tendencia a lo largo del año y sus meses fuertes y flojos, el estado de la continuidad frente a la meta del 85%, y 2-3 prioridades concretas para lo que queda del año. No proyectes cifras a fin de año a partir de meses incompletos. ${CIERRE}`;
  callAI(prompt,'anual-ai-output');
}

// El botón "Análisis con IA" del header de Informes actúa sobre la sub-pestaña visible.
export function genInformeAI() {
  const n=state.informesSubTab;
  if(n==='mensual') return genMensualAI();
  if(n==='anual')   return genAnualAI();
  return genSemanalAI();
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
// Parsea el texto crudo de la IA en secciones estructuradas [{title, body}] en orden canónico.
// El cuerpo de cada etiqueta va desde el fin de su etiqueta hasta la etiqueta siguiente. Si la IA
// no emite etiquetas reconocibles (o ninguna tiene cuerpo), cae a una única sección con todo el texto.
function _parseNarrative(text) {
  const clean=_cleanAIMarkdown(text);
  const hits=_NARR_SECTIONS.map(s=>{
    const m=s.re.exec(clean);
    return m?{key:s.key,title:s.title,start:m.index,end:m.index+m[0].length}:null;
  }).filter(Boolean).sort((a,b)=>a.start-b.start);

  let secs=[];
  if(hits.length){
    const bodies={};
    hits.forEach((h,i)=>{
      const to=i+1<hits.length?hits[i+1].start:clean.length;
      bodies[h.key]=_stripLabel(clean.slice(h.end,to).replace(/^\s*:\s*/,'').trim());
    });
    // Orden canónico; descarta las secciones sin cuerpo.
    secs=_NARR_SECTIONS.map(s=>({title:s.title,body:bodies[s.key]||''})).filter(s=>s.body);
  }
  if(!secs.length){
    const whole=_stripLabel(clean);
    secs=whole?[{title:'Informe de evolución',body:whole}]:[];
  }
  return secs;
}

// Última narrativa parseada (estructurada) — la consume informes.js para el PDF (títulos en
// negrita y secciones separadas, sin depender de copiar el innerText de la pantalla).
let _lastNarrative=[];
export function getLastNarrative(){ return _lastNarrative; }
// Se llama al re-renderizar el informe (cambio de paciente/episodio) para que el PDF no arrastre
// la narrativa del paciente anterior cuando no se generó una nueva.
export function clearLastNarrative(){ _lastNarrative=[]; }

// Renderizador PURO de la narrativa estructurada ([{title,body}]) → HTML on-screen. Lo reusa el
// "Ver inline" de un informe guardado (informes.js) para mostrar la misma maqueta sin re-llamar a la IA.
export function renderNarrativeHtml(sections) {
  const fmtBody=b=>esc(b).replace(/\s*\n\s*\n\s*/g,'<br><br>').replace(/\s*\n\s*/g,' ');
  const sec=(h,body)=>body?`<div style="margin-bottom:18px">`
    +`<div style="font-size:12px;font-weight:800;color:#1a1917;letter-spacing:.02em;`
    +`margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,.1)">${esc(h)}</div>`
    +`<div style="font-size:13px;color:#1a1917;line-height:1.6">${fmtBody(body)}</div></div>`:'';
  const wrap=inner=>`<div style="background:rgba(29,158,117,.06);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:14px">${inner}</div>`;
  return wrap((sections||[]).map(s=>sec(s.title,s.body)).join(''));
}

// Render en pantalla: secciones bajo encabezados negros/negrita con separación clara entre ellas.
function _renderPatientNarrative(text) {
  _lastNarrative=_parseNarrative(text);
  // Revela el botón "Guardar informe" recién cuando hay narrativa generada (PR-A).
  const _sb=document.getElementById('save-informe-btn');
  if(_sb) _sb.style.display=_lastNarrative.length?'':'none';
  return renderNarrativeHtml(_lastNarrative);
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
  // PR-B: contexto del protocolo SOLO por link explícito (protocol_id), sin fallback por keyword (D3).
  // Plantilla de referencia (no PII, no historia clínica) → tope duro de 1.200 caracteres (D4).
  const prot=p.protocolId?state.protocols.find(x=>x.id===p.protocolId):null;
  const protCtx=(prot&&prot.clinicalContext)?prot.clinicalContext.trim().slice(0,1200):'';
  const prompt=`Eres un fisioterapeuta colegiado redactando un informe de evolución clínica en Ecuador, dirigido al médico que refirió al paciente y que también puede leer el propio paciente. Escribe con tono formal y profesional, pero claro. RESPETA estas reglas de redacción de forma estricta:
- TEXTO PLANO: prohibido markdown, asteriscos, numerales (#), guiones de viñeta o cualquier símbolo de formato. Solo prosa en párrafos.
- NO repitas cifras crudas que ya están en las tablas y el gráfico del informe (no listes los valores EVA de cada sesión ni el número de sesiones). En su lugar, INTERPRÉTALOS clínicamente.
- Sé específico y concreto. Prohibidas frases vagas o de relleno como 'respuesta favorable', 'abordaje multimodal', 'evolución satisfactoria', 'se recomienda continuar el tratamiento'. Cada oración debe aportar información clínica real y verificable.
- Enfócate en la FUNCIÓN: dolor, rango de movimiento, fuerza, y sobre todo el impacto en las actividades de la vida diaria del paciente.
- Refiérete siempre al 'paciente', nunca con nombre propio.
- Basa todo en los datos provistos (evaluación inicial, técnicas aplicadas, observaciones, EVA). No inventes hallazgos que no estén en los datos.${protCtx?`
- BARRERA: más abajo se incluye un CONTEXTO DEL PROTOCOLO. Es una PLANTILLA DE REFERENCIA (objetivos e hitos típicos de este tipo de tratamiento), NO la historia clínica de este paciente. Jamás afirmes que algo de esa plantilla se le aplicó, se le encontró o le ocurrió al paciente: SOLO lo listado en DATOS CLÍNICOS ocurrió realmente. Úsala únicamente para enmarcar objetivos y recomendaciones.`:''}

DATOS CLÍNICOS (anonimizado):
- Edad: ${getDisplayAge(p)}
- Diagnóstico: ${p.diag||'No especificado'}
- Estado actual: ${estado}
- Sesiones realizadas/prescritas: ${doneActual(p)}/${p.sessions||0}
- EVALUACIÓN INICIAL (anamnesis, inspección, palpación, movilidad, fuerza): ${evalText}
- HISTORIAL POR SESIÓN (fecha; EVA antes→después; técnicas aplicadas; observación):
${sesiones}${protCtx?`

CONTEXTO DEL PROTOCOLO (plantilla de referencia, NO son hallazgos de este paciente; úsalo solo para enmarcar objetivos y recomendaciones, jamás como algo que se le hizo o registró):
${protCtx}`:''}

Redacta el informe en EXACTAMENTE estas cuatro secciones, cada una empezando con su etiqueta en MAYÚSCULAS seguida de dos puntos, separadas por una línea en blanco:

CONDICIÓN INICIAL: Resume el estado del paciente al iniciar el tratamiento según la evaluación inicial: diagnóstico, hallazgos físicos relevantes, nivel de dolor y limitaciones funcionales de partida (qué no podía hacer).

EVOLUCIÓN DEL TRATAMIENTO: Describe el progreso a lo largo de las sesiones. Relaciona las técnicas aplicadas con la respuesta del paciente. Explica cómo evolucionaron el dolor, la movilidad y la fuerza, y en qué momento se dieron los cambios más relevantes.

RESULTADOS OBTENIDOS: Compara el estado funcional ACTUAL con el inicial. Detalla concretamente qué mejoró (rango articular recuperado, reducción del dolor, funciones que el paciente ya puede realizar). Sé específico.

RECOMENDACIONES: Plan a seguir de forma concreta: tipo de ejercicios o fortalecimiento sugerido, continuidad del tratamiento, manejo o cuidados en casa, y signos de alerta a vigilar si aplica. Adapta las recomendaciones al diagnóstico y la ocupación/actividad del paciente.

Extensión total del informe: entre 280 y 380 palabras (completo, que llene aproximadamente dos páginas con el resto del documento, pero SIN relleno). Cada sección de 2 a 4 frases sustanciales.`;
  const outputEl=document.getElementById('patient-rpt-ai-output');
  if(outputEl){outputEl.style.display='block';callAI(prompt,'patient-rpt-ai-output',_renderPatientNarrative);}
}
