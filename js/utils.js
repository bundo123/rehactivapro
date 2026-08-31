import { state } from './state.js';

export const ALL_HOURS = [6,7,8,9,10,11,12,13,14,15,16,17];
export const DAYS = ['Lun','Mar','Mié','Jue','Vie'];
export const COLOR_OPTIONS = [
  {id:'ca',name:'Verde',bg:'#e8f5f0',border:'#1D9E75',text:'#0d6e4e'},
  {id:'cb',name:'Azul',bg:'#e8f2fb',border:'#29ABE2',text:'#155b7a'},
  {id:'cc',name:'Naranja',bg:'#fef6e8',border:'#F5A623',text:'#7a4900'},
  {id:'cd',name:'Rosa',bg:'#fdeef4',border:'#D9508A',text:'#8a2a50'},
  {id:'ce',name:'Morado',bg:'#f0eefb',border:'#8B5CF6',text:'#4a3d9e'},
  {id:'cf',name:'Lima',bg:'#f0f8e8',border:'#84CC16',text:'#3a5a10'},
  {id:'cg',name:'Turquesa',bg:'#e6fffb',border:'#14B8A6',text:'#0f766e'},
  {id:'ch',name:'Rojo',bg:'#fef2f2',border:'#EF4444',text:'#991b1b'},
  {id:'ci',name:'Indigo',bg:'#eef2ff',border:'#6366F1',text:'#3730a3'},
  {id:'cj',name:'Ambar',bg:'#fffbeb',border:'#F59E0B',text:'#92400e'},
  {id:'ck',name:'Coral',bg:'#fff1f2',border:'#FB7185',text:'#9f1239'},
  {id:'cl',name:'Pizarra',bg:'#f1f5f9',border:'#64748B',text:'#334155'},
];
export const DOC_COLORS = ['#E24B4A','#378ADD','#7F77DD','#BA7517','#D4537E','#1D9E75','#D85A30','#639922','#5EEAD4','#FCA5A5','#FDE047','#A78BFA','#6EE7B7','#FB923C','#94A3B8'];

// ── Tipo de sesión: Fisioterapia / Terapia respiratoria ──
// Espejo EXACTO del CHECK de appointments.type. La sesión registrada HEREDA el tipo de su cita,
// así que este catálogo es la fuente única de los dos servicios que presta el centro.
// Ojo: 'Evaluación inicial' y 'Fin de episodio' NO son tipos de cita — son marcadores que solo
// existen en session_log y nunca pasan por acá (por eso no se normalizan ni se cuentan aquí).
export const TIPOS_SESION = [
  {id:'fisio', label:'Fisioterapia',        abbr:'fisio'},
  {id:'resp',  label:'Terapia respiratoria', abbr:'resp'},
];
export const TIPO_SESION_DEFAULT = TIPOS_SESION[0].label;   // 'Fisioterapia'

// Normaliza un tipo venido de la DB/DOM al catálogo: cualquier valor desconocido, vacío o nulo
// cae al default. Es lo que garantiza que el flujo manual (sin cita) y las citas viejas sin tipo
// escriban un valor que el CHECK acepta.
export function tipoSesion(v){
  const t=TIPOS_SESION.find(x=>x.label===String(v||'').trim());
  return t?t.label:TIPO_SESION_DEFAULT;
}

// Desglose de una lista de citas por tipo: {fisio, resp}. Pura, con las claves del catálogo.
export function desgloseTipos(appts){
  const out={};
  TIPOS_SESION.forEach(t=>{out[t.id]=0;});
  (appts||[]).forEach(a=>{
    const t=TIPOS_SESION.find(x=>x.label===tipoSesion(a?.type));
    out[t.id]++;
  });
  return out;
}

// Texto del desglose para el Resumen del día: "3 fisio · 2 resp". Devuelve '' cuando no hay
// ninguna respiratoria: con una sola modalidad el desglose repetiría el contador de citas que
// tiene al lado y solo agregaría ruido.
export function textoDesglose(d){
  const f=d?.fisio||0, r=d?.resp||0;
  return r?`${f} fisio · ${r} resp`:'';
}

// ── Especialidad del terapeuta ──
// Espejo del CHECK de therapists.specialty. Se elige a mano en el admin de terapeutas: NUNCA se
// deduce del nombre ni del texto libre de `spec`.
export const ESPECIALIDADES = [
  {id:'fisica',      label:'Física'},
  {id:'respiratoria',label:'Respiratoria'},
];
export const ESPECIALIDAD_DEFAULT = ESPECIALIDADES[0].id;   // 'fisica' (mismo default que la columna)

export function especialidad(v){
  return ESPECIALIDADES.some(e=>e.id===v)?v:ESPECIALIDAD_DEFAULT;
}
export function especialidadLabel(v){
  return ESPECIALIDADES.find(e=>e.id===especialidad(v)).label;
}
export const allTabs = ['agenda','pacientes','seguimiento','informes','paciente_rpt','protocolos','resumen','terapeutas','doctores','facturacion'];

export function escapeHtml(v){
  if(v==null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export const esc = escapeHtml;
export function escapeRegex(v){return String(v||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
// Colores que vienen de la DB e interpolan en HTML/atributos style: solo se acepta hex
// (#rgb/#rrggbb/#rrggbbaa); cualquier otro valor cae al gris neutro. Va más allá de esc():
// también bloquea payloads CSS válidos (p.ej. url(...) exfiltrante) si la RLS dejara
// escribir un color arbitrario.
export function safeColor(c, fallback='#9c9a92'){
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c||'')) ? c : fallback;
}
export function normalizeSearch(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
export function patientSearchText(p){
  return normalizeSearch([p.name,p.cedula,p.diag,p.tel,p.email].filter(Boolean).join(' '));
}
export function patientMatchesSearch(p,q){
  const nq=normalizeSearch(q);
  if(!nq)return true;
  return patientSearchText(p).includes(nq);
}
export function highlightMatch(text,query){
  const raw=String(text||'');
  const q=String(query||'').trim();
  if(!q)return esc(raw);
  const re=new RegExp('('+escapeRegex(q)+')','gi');
  return esc(raw).replace(re,'<mark class="search-hit">$1</mark>');
}
export function relativeTime(ts){
  if(!ts)return 'nunca';
  const s=Math.max(0,Math.floor((Date.now()-ts)/1000));
  if(s<10)return 'ahora';
  if(s<60)return `hace ${s} segundos`;
  const m=Math.floor(s/60);
  if(m<60)return `hace ${m} minuto${m===1?'':'s'}`;
  const h=Math.floor(m/60);
  if(h<24)return `hace ${h} hora${h===1?'':'s'}`;
  const d=Math.floor(h/24);
  return `hace ${d} dia${d===1?'':'s'}`;
}
export function fmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// Lunes (00:00) de la semana de la fecha dada; el domingo pertenece a la semana que empezó
// el lunes anterior. Pura: no muta el argumento.
export function startOfWeek(d){
  const r=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const dow=r.getDay();
  r.setDate(r.getDate()-(dow===0?6:dow-1));
  return r;
}
// Etiqueta corta de una fecha 'YYYY-MM-DD': 'Lun 12 ago'. Se parsea a mano (no `new Date(ds)`)
// porque el string ISO suelto se interpreta en UTC y en Quito (UTC-5) devolvería el día anterior.
const DIAS_CORTOS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function fmtFechaCorta(ds){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds||''));
  if(!m) return String(ds||'');
  const y=+m[1], mo=+m[2], d=+m[3];
  if(mo<1||mo>12) return String(ds);
  return `${DIAS_CORTOS[new Date(y,mo-1,d).getDay()]} ${d} ${MESES_CORTOS[mo-1]}`;
}

// Día anterior a una fecha 'YYYY-MM-DD' (misma construcción local que fmtFechaCorta: sin UTC).
export function diaAnterior(ds){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds||''));
  if(!m) return String(ds||'');
  const d=new Date(+m[1],+m[2]-1,+m[3]);
  d.setDate(d.getDate()-1);
  return fmtDate(d);
}

// Horas en memoria = decimales (10.75 = 10:45). fmtTime imprime CUALQUIER minuto conservando el
// formato de siempre para las alineadas: 9→'9:00', 9.5→'9:30', 9.75→'9:45'. Hora sin cero a la
// izquierda (como antes), minutos siempre con dos dígitos. Se redondea al minuto porque un
// input de 5 en 5 produce fracciones periódicas (10:05 → 10.0833…).
export function fmtTime(h){
  const t=Math.round((Number(h)||0)*60);
  return `${Math.floor(t/60)}:${String(((t%60)+60)%60).padStart(2,'0')}`;
}

// ── Horas exactas: helpers puros (la grilla sigue siendo de media hora) ──
const HORA_EPS = 1e-9;

// Media hora CONTENEDORA de una hora decimal: 10.75 → 10.5. Es la fila de la grilla donde se
// dibuja una cita que no arranca en :00/:30.
export function slotOf(h){ return Math.floor((Number(h)||0)*2)/2; }

// ¿Cae exacto en :00 o :30? Las alineadas usan el select de siempre; las demás, el input exacto.
export function isAlignedHour(h){
  const v=(Number(h)||0)*2;
  return Math.abs(v-Math.round(v))<HORA_EPS;
}

// Intervalo real [inicio, fin) de una cita, en horas decimales.
export function apptRange(a){
  const start=Number(a?.hour)||0;
  const dur=Number(a?.duration)||60;
  return { start, end: start+dur/60 };
}

// Slots de media hora que la cita OCUPA en la grilla. El primero es el contenedor del inicio;
// se extiende mientras el slot empiece antes del fin real: 10:45+60min → 10:30, 11:00 y 11:30.
export function apptSlots(a){
  const {start,end}=apptRange(a);
  const first=slotOf(start);
  const out=[];
  for(let s=first;s<end-HORA_EPS;s=+(s+0.5).toFixed(1)) out.push(+s.toFixed(1));
  return out.length?out:[+first.toFixed(1)];
}

// Solape REAL de intervalos (no de slots): 10:45–11:45 choca con 11:00. Tocarse en el borde
// (una termina 11:00 y la otra empieza 11:00) NO es solape.
export function apptsOverlap(a,b){
  const x=apptRange(a),y=apptRange(b);
  return x.start<y.end-HORA_EPS && y.start<x.end-HORA_EPS;
}

// ── Slot liberado por "no asistió" ──
// Una cita marcada 'no asistió' deja de OCUPAR la franja a efectos de agendamiento: el terapeuta
// puede recibir otra cita ahí sin borrarla. La cita sigue existiendo y contando exactamente igual
// en resumen, informes, continuidad y facturación; lo único que pierde es el bloqueo del slot.
export function bloqueaSlot(a){ return (a?.status)!=='noas'; }

// Primera cita del mismo terapeuta y día que solapa con la propuesta (null si no hay).
// Las 'no asistió' se saltan (ver bloqueaSlot); dos citas ACTIVAS siguen chocando igual.
// Los ids se comparan como string: los optimistas son números y el editingId del modal es string.
export function findConflict(appointments,{date,therapistId,hour,duration},excludeId=null){
  return (appointments||[]).find(a=>
    String(a.id)!==String(excludeId) &&
    bloqueaSlot(a) &&
    a.date===date &&
    String(a.therapistId)===String(therapistId) &&
    apptsOverlap(a,{hour,duration})
  )||null;
}

// Citas 'no asistió' que la grilla debe dibujar como TIRA COMPACTA en vez de tarjeta completa:
// las que comparten franja o se solapan con otra cita de la misma columna. La que cede el espacio
// es siempre la no-asistió, porque es la que ya no bloquea el slot. Una no-asistió a la que no la
// toca nadie se sigue viendo como hoy (tarjeta completa).
// `colAppts` es la columna ya filtrada de la grilla: mismo terapeuta y día en vista Día, mismo día
// (de un solo terapeuta) en vista Semana. Devuelve un Set de las citas MISMAS, no de ids: los ids
// mezclan números optimistas, uuids y 'rec-...'.
export function compactNoas(colAppts){
  const list=colAppts||[];
  const out=new Set();
  list.forEach(a=>{
    if(bloqueaSlot(a)) return;
    if(list.some(b=>b!==a&&(apptsOverlap(a,b)||slotOf(b.hour)===slotOf(a.hour)))) out.add(a);
  });
  return out;
}

// Medias horas realmente OCUPADAS por una lista de citas — lo que la agenda resta para decir
// cuántos slots quedan libres. Mismo criterio que findConflict (bloqueaSlot): una franja cuyo
// único ocupante es una no-asistió está libre, porque se puede agendar ahí.
export function occupiedSlots(appts){
  return (appts||[]).filter(bloqueaSlot).reduce((n,a)=>n+apptSlots(a).length,0);
}

// Hora decimal → 'HH:MM' con cero a la izquierda (formato que exige <input type="time">).
export function toTimeInput(h){
  const t=Math.round((Number(h)||0)*60);
  return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(((t%60)+60)%60).padStart(2,'0')}`;
}

// 'HH:MM' de un <input type="time"> → hora decimal (null si está vacío o es inválido).
// Se redondea a 6 decimales para que 10:05 vuelva a dar '10:05' al pasar por fmtTime.
export function parseTimeInput(v){
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(v||'').trim());
  if(!m) return null;
  const hh=parseInt(m[1],10),mm=parseInt(m[2],10);
  if(hh>23||mm>59) return null;
  return +(hh+mm/60).toFixed(6);
}
// Normaliza una hora a 'HH:MM:SS' para comparar de forma robusta el valor en memoria ('9:00','00:00')
// contra el de la DB ('09:00:00' si la columna es time). Conserva segundos (id técnico de sesiones manuales).
export function normHour(h){
  const p=String(h||'').split(':');
  return `${String(parseInt(p[0]||'0',10)).padStart(2,'0')}:${(p[1]||'00').padStart(2,'0')}:${(p[2]||'00').padStart(2,'0')}`;
}
// ── CIE-10: helpers puros (el catálogo se carga lazy desde cie10.js) ──

// Busca en el catálogo CIE-10 (array de {c,d}) por código o descripción. Pura: recibe el
// catálogo ya cargado. Insensible a acentos y mayúsculas vía normalizeSearch (el catálogo viene
// sin tildes, así que sin esto "lumbalgía" no encontraría nada). Ordena por utilidad — código
// exacto, código que empieza igual, descripción, y por último código que contiene — y corta en
// `limit` (12 en la UI: la lista tiene que caber sin scroll sobre el modal). El punto es
// opcional: 'm545' encuentra 'M54.5'.
export function buscarCie10(cat, q, limit=12){
  const nq=normalizeSearch(q);
  if(!nq||!Array.isArray(cat)) return [];
  const nqCode=nq.replace(/\./g,'');
  const hits=[];
  for(const it of cat){
    if(!it) continue;
    const codeFlat=normalizeSearch(it.c).replace(/\./g,'');
    const desc=normalizeSearch(it.d);
    let rank=-1;
    if(codeFlat===nqCode)             rank=0;
    else if(codeFlat.startsWith(nqCode)) rank=1;
    else if(desc.includes(nq))        rank=2;
    else if(codeFlat.includes(nqCode))rank=3;
    if(rank>=0) hits.push({it,rank});
  }
  hits.sort((a,b)=>a.rank-b.rank||String(a.it.c).localeCompare(String(b.it.c)));
  return hits.slice(0,Math.max(0,limit)).map(h=>h.it);
}

// Texto de diagnóstico para informe/PDF: agrega el CIE-10 solo si hay ambos datos
// (un "(CIE-10: M54.5)" suelto, sin diagnóstico delante, no dice nada).
export function diagConCie(diag, cie){
  const base=String(diag??'').trim();
  const c=String(cie??'').trim();
  return c&&base?`${base} (CIE-10: ${c})`:base;
}

// Defecto viejo: algunas evaluaciones iniciales tienen una parte de evalInicial.partes guardada
// con un ":" huérfano al inicio (p.ej. ": Inversión forzada del tobillo…"), de un formato de nota
// anterior a como saveEvalInicial() (pacientes.js) arma `note` hoy. El dato histórico sigue en
// session_log — se limpia acá, en la salida, en vez de tocar la nota guardada. Compartida por
// pantalla y PDF (informes.js) y Word (word.js) para no triplicar la regla.
export function limpiarParte(texto){
  return String(texto||'').replace(/^[:·]\s*/,'').trim();
}

export function getColor(id){return COLOR_OPTIONS.find(c=>c.id===id)||COLOR_OPTIONS[0]}
export function getTherapist(id){return state.therapists.find(t=>t.id===id)}
// NUEVO 1: orden canónico de terapeutas = display_order asc (nulls al final) y luego nombre.
// Usar SIEMPRE que se listen terapeutas (columnas de agenda, selects, listados).
export function orderedTherapists(list){
  return [...(list||state.therapists)].sort((a,b)=>{
    const ao=a.displayOrder??Infinity, bo=b.displayOrder??Infinity;
    if(ao!==bo) return ao-bo;
    return (a.name||'').localeCompare(b.name||'');
  });
}
// work_start/work_end pueden venir como número (7, 13.5) o como time 'HH:MM(:SS)' → horas float.
export function parseHourVal(v){
  if(v==null||v==='') return null;
  if(typeof v==='number') return v;
  const p=String(v).split(':');
  const h=parseInt(p[0],10);
  if(isNaN(h)) return null;
  return h+(parseInt(p[1]||'0',10)>=30?0.5:0);
}
// Fila de `therapists` (DB) → terapeuta en memoria. Vive acá porque la usan DOS caminos que antes
// la tenían duplicada palabra por palabra: la carga inicial (auth.js) y el realtime (realtime.js).
// Si se agrega una columna y solo se toca una de las dos copias, el terapeuta que llega por
// realtime queda distinto del que llegó al cargar — justo lo que pasaba con `specialty`.
export function mapTherapistRow(r){
  return {
    id:r.id,
    name:r.name,
    initials:r.initials||String(r.name||'').split(' ').map(n=>n[0]||'').join('').slice(0,2).toUpperCase(),
    spec:r.spec||'',
    specialty:especialidad(r.specialty),
    startH:r.start_h,
    endH:r.end_h,
    colorId:r.color_id||'ca',
    displayOrder:r.display_order??null,
    workStart:parseHourVal(r.work_start),
    workEnd:parseHourVal(r.work_end),
  };
}
// Inverso de parseHourVal: horas float → 'HH:MM' para los <input type="time"> del modal de
// terapeuta. Vacío ⇄ null, que es como se guarda "sin horario definido".
export function hourValToTime(v){
  if(v==null||v==='') return '';
  const n=Number(v);
  if(!isFinite(n)||n<0) return '';
  const h=Math.floor(n);
  return String(h).padStart(2,'0')+':'+((n-h)>=0.5?'30':'00');
}
// Guard de borrado de terapeuta: NUNCA se borran citas en cascada. Devuelve null si el terapeuta
// se puede eliminar (cero citas, pasadas o futuras) o {total, futuras} para bloquear el borrado.
// "Futura" incluye hoy: la cita de hoy todavía se atiende. Pura: `hoy` se inyecta en los tests.
export function therapistDeleteBlock(appointments, therapistId, hoy = fmtDate(new Date())){
  if(therapistId==null) return null;
  const suyas=(appointments||[]).filter(a=>a&&a.therapistId!=null&&String(a.therapistId)===String(therapistId));
  if(!suyas.length) return null;
  return {total:suyas.length, futuras:suyas.filter(a=>String(a.date||'')>=String(hoy)).length};
}
export function textoBloqueoBorrado(b){
  if(!b) return '';
  const c=n=>n===1?'cita':'citas', f=n=>n===1?'futura':'futuras';
  return `No se puede eliminar: tiene ${b.total} ${c(b.total)} (${b.futuras} ${f(b.futuras)}). Reasigná sus citas primero.`;
}
export function getPatient(id){return state.patients.find(p=>p.id===id)}
export function getDoctor(id){return state.doctors.find(d=>d.id===id)}
export function therapistHours(th){const h=[];for(let i=th.startH;i<th.endH;i+=0.5)h.push(i);return h;}
export function getAvailHours(ths){const s=new Set();(ths||state.therapists).forEach(t=>therapistHours(t).forEach(h=>s.add(h)));return[...s].sort((a,b)=>a-b);}
export function dotColor(s){return s==='conf'?'#1D9E75':s==='pend'?'#E0A850':'#E24B4A';}
export function getInitials(name){return(name||'').trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'??';}

// Duplicado de cédula al guardar paciente: devuelve OTRO paciente (id ≠ excludeId) con la misma
// cédula (comparación con trim). Cédula vacía nunca duplica. Pura y testeable.
export function findCedulaDuplicate(patients, cedula, excludeId=null){
  const c=String(cedula||'').trim();
  if(!c) return null;
  return (patients||[]).find(p=>String(p.id)!==String(excludeId)&&String(p.cedula||'').trim()===c)||null;
}

export function getDisplayAge(p, showDate = false) {
  if (!p) return 'Sin edad';
  if (p.birth_date) {
    const [by, bm, bdd] = p.birth_date.split('-').map(Number);
    const bd = new Date(by, bm - 1, bdd);
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const mo = today.getMonth() - bd.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < bd.getDate())) age--;
    if (showDate) {
      const dd = bdd.toString().padStart(2, '0');
      const mm = bm.toString().padStart(2, '0');
      return `${dd}/${mm}/${by} (${age} años)`;
    }
    return `${age} años`;
  }
  if (p.age) return `${p.age} años`;
  return 'Sin edad';
}

export function getFullAge(p) {
  if (!p) return 'Sin edad';
  if (p.birth_date) {
    const [by, bm, bdd] = p.birth_date.split('-').map(Number);
    const today = new Date();
    let y = today.getFullYear() - by;
    let m = today.getMonth() - (bm - 1);
    let d = today.getDate() - bdd;
    if (d < 0) { m--; d += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    if (y < 0) return 'Sin edad';
    const parts = [`${y} año${y === 1 ? '' : 's'}`];
    if (m > 0) parts.push(`${m} ${m === 1 ? 'mes' : 'meses'}`);
    if (d > 0) parts.push(`${d} día${d === 1 ? '' : 's'}`);
    return parts.join(' ');
  }
  if (p.age) return `${p.age} año${p.age === 1 ? '' : 's'}`;
  return 'Sin edad';
}

// ── FUENTE ÚNICA de done/pendientes (derivados de session_log, nunca de columnas almacenadas) ──
// Frontera del episodio actual = fecha del último 'Fin de episodio' en session_log (null si no hay).
export function lastFinDate(p) {
  const fins = (p?.log || []).filter(s => s.type === 'Fin de episodio').map(s => s.date).sort();
  return fins.length ? fins[fins.length - 1] : null;
}

// Sesiones realizadas dentro de un tramo YA RECORTADO de session_log. Define, en un solo lugar,
// qué fila del log cuenta como "sesión hecha": status 'asistió' y ninguno de los dos marcadores.
// La 'Evaluación inicial' no es una sesión de tratamiento (R-2: el informe de un episodio pasado
// la contaba y salía "11 de 10 · 110%" en el PDF al médico).
export function doneEnLog(log) {
  return (log || []).filter(s =>
    s.status === 'asistió' &&
    s.type !== 'Evaluación inicial' &&
    s.type !== 'Fin de episodio'
  ).length;
}

// Sesiones realizadas en el episodio ACTUAL. Función pura, fuente única = session_log.
// = doneEnLog() sobre las filas con date posterior al último 'Fin de episodio'.
export function doneActual(p) {
  if (!p) return 0;
  const lastFin = lastFinDate(p);
  return doneEnLog((p.log || []).filter(s => !lastFin || s.date > lastFin));
}

// Sesiones del episodio actual pendientes de cobro. Función pura, derivada.
// = max(0, doneActual − sesiones ya cobradas en el episodio actual).
// "Cobradas del episodio" = facturas cuya fecha cae después del último 'Fin de episodio'.
export function pendientesActual(p) {
  if (!p || !p.billing) return 0;
  const lastFin = lastFinDate(p);
  const cobradasEp = (p.billing.facturas || [])
    .filter(f => !lastFin || (f.fecha || '') > lastFin)
    .reduce((s, f) => s + (f.n || 0), 0);
  return Math.max(0, doneActual(p) - cobradasEp);
}

// ── Ordinal de cita en la agenda ("X/N") ──
// X = posición de la cita en la secuencia del paciente DENTRO de su episodio actual; N = plan de
// sesiones (p.sessions). Es informativo de agenda: no toca facturación ni sus conteos, que siguen
// derivando de session_log (doneActual/pendientesActual).
//
// Universo y reglas (una sola definición, la comparten citaOrdinal y ordinalesDeCitas):
//  · Solo citas del MISMO paciente posteriores al último 'Fin de episodio' — frontera ESTRICTA
//    (date > fin), la misma que doneActual y que el recorte de episodio de los informes: una cita
//    con la fecha del corte pertenece al episodio que cierra, no al nuevo.
//  · Se EXCLUYEN las 'no asistió': un no-show no consume número, así que la siguiente cita hereda
//    el ordinal que aquélla habría tenido.
//  · Orden por fecha y luego hora (decimal, así que una hora exacta 10:45 va después de 10:30).
function citasNumerables(appts, patient) {
  const fin = lastFinDate(patient);
  return (appts || [])
    .filter(a => a && a.patientId != null && a.status !== 'noas' && (!fin || String(a.date) > fin))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Number(a.hour) || 0) - (Number(b.hour) || 0));
}

// Ordinal de UNA cita: { x, n } — n es null si el paciente no tiene plan (se muestra solo "X").
// Devuelve null cuando la cita no lleva badge: sin paciente, 'no asistió', o de un episodio ya
// cerrado (queda fuera del universo, así que no tiene posición en la secuencia actual).
// Pura: recibe la lista de citas y el paciente, no lee state.
export function citaOrdinal(appointments, patient, appt) {
  if (!appt || appt.patientId == null || appt.status === 'noas') return null;
  const mismas = (appointments || []).filter(a => a && String(a.patientId) === String(appt.patientId));
  const i = citasNumerables(mismas, patient).indexOf(appt);
  return i < 0 ? null : { x: i + 1, n: patient?.sessions || null };
}

// Mapa cita → { x, n } de TODA la lista, en una pasada: la agenda lo calcula una vez por render
// en vez de recorrer las citas del paciente por cada tarjeta. La clave es la cita MISMA, no su id
// (los ids mezclan números optimistas, uuids y 'rec-...'). Las citas sin badge no entran al mapa.
export function ordinalesDeCitas(appointments, getPacienteFn) {
  const porPaciente = new Map();
  (appointments || []).forEach(a => {
    if (!a || a.patientId == null) return;
    const k = String(a.patientId);
    if (!porPaciente.has(k)) porPaciente.set(k, []);
    porPaciente.get(k).push(a);
  });
  const out = new Map();
  porPaciente.forEach(lista => {
    const p = getPacienteFn ? getPacienteFn(lista[0].patientId) : null;
    const n = p?.sessions || null;
    citasNumerables(lista, p).forEach((a, i) => out.set(a, { x: i + 1, n }));
  });
  return out;
}

// ── Frontera de episodio: ¿con qué cita EMPIEZA el episodio nuevo? ──
// Opciones del selector del modal "Nuevo episodio". Universo: las citas del paciente — las 5
// PASADAS más recientes (hoy incluido: la cita de hoy ya se atendió) y las 3 FUTURAS más próximas,
// en orden ascendente por fecha y hora, como se leen en la agenda. Se ofrecen pasadas porque el
// episodio nuevo suele arrancar en una cita ya atendida, y futuras porque a veces se abre desde la
// próxima ya agendada.
// El marcador 'Fin de episodio' se fecha el DÍA ANTERIOR a la elegida, y como la frontera es
// estricta (date > fin), lo registrado en la cita elegida y en adelante cuenta en el episodio nuevo.
// Pura: `hoy` se inyecta en los tests.
export function citasParaCierre(appointments, patientId, hoy = fmtDate(new Date())) {
  const suyas = (appointments || [])
    .filter(a => a && a.patientId != null && a.date && String(a.patientId) === String(patientId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Number(a.hour) || 0) - (Number(b.hour) || 0));
  const pasadas = suyas.filter(a => String(a.date) <= String(hoy));
  const futuras = suyas.filter(a => String(a.date) > String(hoy));
  return [...pasadas.slice(-5), ...futuras.slice(0, 3)];
}

// Índice de la opción preseleccionada en esa lista: la PASADA más reciente (la última con fecha
// ≤ hoy). Sin pasadas manda la primera futura; con la lista vacía, -1.
export function indiceCitaCierre(citas, hoy = fmtDate(new Date())) {
  const lista = citas || [];
  let idx = -1;
  lista.forEach((a, i) => { if (String(a.date) <= String(hoy)) idx = i; });
  return idx >= 0 ? idx : (lista.length ? 0 : -1);
}

// Texto del badge: "3/10" con plan, "3" sin plan.
export function ordinalTexto(ord) {
  if (!ord) return '';
  return ord.n ? `${ord.x}/${ord.n}` : String(ord.x);
}

// ── Seguimiento: auditoría día a día de lo atendido contra lo registrado ──
// La pestaña es de SOLO LECTURA y responde una pregunta concreta: de los pacientes ACTIVOS, qué
// DÍAS se atendió y no quedó nada escrito en la historia. Todo se deriva de lo que ya está en
// memoria (p.log y las citas): no hay una sola query nueva.
//
// Vocabulario (una sola definición, la comparten el detalle, las filas y los filtros):
//  · Cita pasada = status 'conf' (atendida) con fecha ≤ hoy. Las 'pend'/'noas' no cuentan: la
//    pregunta es "esto se atendió y no quedó escrito", no "esto está agendado".
//  · Entrada clínica = cualquier fila del log salvo 'Fin de episodio' (marcador técnico, no es
//    documentación). Por eso un día cubierto solo por la evaluación inicial SÍ está registrado.
//  · Sesión = entrada del log que no es ninguno de los dos marcadores NI la evaluación inicial.
//    Es la columna "Sesiones"; a diferencia de doneEnLog no filtra por status, porque acá interesa
//    si quedó registro, no si el paciente asistió.
// El cruce es DÍA A DÍA, no de totales: dos citas el mismo día se cubren con una sola entrada de
// ese día, y una entrada de otro día no cubre nada. Es la única forma de que "4 citas / 4 sesiones"
// no tape que una sesión se escribió dos veces el martes y el jueves quedó vacío.
// Ojo: a diferencia de doneActual, esto NO recorta por episodio — la auditoría es sobre todo lo
// que el paciente lleva atendido en la app.

// Días (YYYY-MM-DD) en los que el paciente tiene al menos una entrada clínica escrita.
function _diasConRegistro(patient) {
  const out = new Set();
  (patient?.log || []).forEach(s => {
    if (s && s.date && s.type !== 'Fin de episodio') out.add(String(s.date));
  });
  return out;
}

// Detalle día a día de las citas pasadas del paciente: una fila POR DÍA, no por cita.
//   [{ date, therapistId, registrado, citas }]  ordenado por fecha ascendente.
// `therapistId` es el responsable del día = el de la cita más temprana (el orden del array de
// entrada no debe cambiar el resultado). `citas` es cuántas citas pasadas hubo ese día.
// Pura: `hoy` se puede inyectar para testear; por defecto es la fecha de sistema.
export function detalleSeguimiento(patient, appointments, hoy = fmtDate(new Date())) {
  const pid = String(patient?.id ?? '');
  const porDia = new Map();
  (appointments || []).forEach(a => {
    if (!a || a.patientId == null || a.status !== 'conf' || !a.date) return;
    if (String(a.patientId) !== pid) return;
    if (String(a.date) > String(hoy)) return;
    const d = String(a.date);
    const prev = porDia.get(d);
    const hora = Number(a.hour) || 0;
    if (!prev) porDia.set(d, { therapistId: a.therapistId ?? null, hora, citas: 1 });
    else {
      prev.citas++;
      if (hora < prev.hora) { prev.hora = hora; prev.therapistId = a.therapistId ?? null; }
    }
  });
  const conRegistro = _diasConRegistro(patient);
  return [...porDia.entries()]
    .map(([date, v]) => ({ date, therapistId: v.therapistId, registrado: conRegistro.has(date), citas: v.citas }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Los días que quedaron descubiertos: [{date, therapistId}] ordenado por fecha.
export function diasSinRegistro(patient, appointments, hoy = fmtDate(new Date())) {
  return detalleSeguimiento(patient, appointments, hoy)
    .filter(d => !d.registrado)
    .map(({ date, therapistId }) => ({ date, therapistId }));
}

// Filas de la tabla. Agrupa las citas por paciente en UNA pasada y recién después arma las filas
// (mismo patrón que ordinalesDeCitas): sin esto sería recorrer todas las citas una vez por
// paciente. Orden: días faltantes desc (lo que hay que atender primero), luego citas desc.
export function filasSeguimiento(patients, appointments, hoy = fmtDate(new Date())) {
  const citasPorPaciente = new Map();
  (appointments || []).forEach(a => {
    if (!a || a.patientId == null) return;
    const k = String(a.patientId);
    if (!citasPorPaciente.has(k)) citasPorPaciente.set(k, []);
    citasPorPaciente.get(k).push(a);
  });
  return (patients || [])
    .filter(p => p && p.status === 'active')
    .map(p => {
      const log = (p.log || []).filter(Boolean);
      const detalle = detalleSeguimiento(p, citasPorPaciente.get(String(p.id)) || [], hoy);
      const faltantes = detalle.filter(d => !d.registrado);
      return {
        id: p.id,
        name: p.name || '',
        sesiones: log.filter(s => s.type !== 'Evaluación inicial' && s.type !== 'Fin de episodio').length,
        citasPasadas: detalle.reduce((n, d) => n + d.citas, 0),
        diasSinRegistro: faltantes.length,
        entradas: log.filter(s => s.type !== 'Fin de episodio').length,
        detalle,
      };
    })
    .sort((a, b) =>
      b.diasSinRegistro - a.diasSinRegistro ||
      b.citasPasadas - a.citasPasadas ||
      a.name.localeCompare(b.name));
}

// Los tres filtros de la barra. NO son categorías excluyentes y el contador de cada uno cuenta las
// filas que lo cumplen: un paciente con historia cargada y un día suelto sin registro suma en
// «Con seguimiento» y en «Con días faltantes» a la vez, que es justo lo que se quiere ver.
export const FILTROS_SEGUIMIENTO = {
  con:       f => f.entradas > 0,
  faltantes: f => f.diasSinRegistro > 0,
  all:       () => true,
};

export function pasaFiltroSeguimiento(fila, filtro) {
  return (FILTROS_SEGUIMIENTO[filtro] || FILTROS_SEGUIMIENTO.all)(fila);
}

export function contarSeguimiento(filas) {
  const out = { con: 0, faltantes: 0, all: 0 };
  (filas || []).forEach(f => {
    Object.keys(out).forEach(k => { if (FILTROS_SEGUIMIENTO[k](f)) out[k]++; });
  });
  return out;
}

// Datos de facturación del episodio ACTUAL (I-4): "Cobro X de Y", cajitas y cierre.
// Pura y episodio-aware (misma frontera que pendientesActual): solo cuenta las facturas con fecha
// posterior al último 'Fin de episodio', para que al iniciar un episodio nuevo la numeración de
// cobros vuelva a empezar y no arrastre cobros de episodios anteriores. spf = sesiones por factura.
export function billingInfo(p, spf) {
  const lastFin          = lastFinDate(p);
  const facturasEp       = (p.billing.facturas || []).filter(f => !lastFin || (f.fecha || '') > lastFin);
  const sesTotal         = p.sessions || 0;
  const sesYaCobradas    = facturasEp.reduce((s, f) => s + (f.n || 0), 0);
  const sesPend          = pendientesActual(p);
  const cobrosRealizados = facturasEp.length;
  const totalCobros      = Math.floor(sesTotal / spf) + (sesTotal % spf > 0 ? 1 : 0);
  const esCierre         = sesPend > 0 && sesPend < spf && (sesYaCobradas + sesPend) >= sesTotal;
  return { sesTotal, sesYaCobradas, sesPend, cobrosRealizados, totalCobros, esCierre };
}

// Fecha 'YYYY-MM-DD' → 'DD/MM/YYYY' (para el detalle de informes, sin hora). Compartida entre el
// export a PDF (informes.js) y el export a Word (word.js).
export function dmy(d){ const p=String(d||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(d||''); }

// Datos de contacto de la clínica para el pie de los informes (PDF y Word). Los segmentos vacíos
// se omiten del footer.
export const CONFIG_CLINICA = {
  DIRECCION: 'Palmeras Shopping, Vía Intervalles OE-95 y primera transversal, Tumbaco',
  TELEFONO: '099 921 1258',
  EMAIL: '', // poner 'recepcion@rehactivaec.com' cuando se confirme que el buzón recibe
};

// PURA: render-model de informe (ver _buildRenderModel en informes.js) → SVG del gráfico EVA.
// Arranca en el dolor inicial (metricas.evaInicial, capturado de fp.pb), sigue con el dolor tras
// cada sesión con EVA (pa, o pb si falta) y termina en el dolor actual (metricas.evaActual). El
// snapshot no guarda status, así que el espejo de evaSes es pb!=null (una sesión sin EVA registrado
// no puntúa). Devuelve '' si no hay serie construible (el caller cae a evaChartImg para snapshots
// viejos). Compartida por el PDF (embebido inline) y el Word (rasterizado a PNG vía svgToPngDataUri
// en word.js — por eso lleva xmlns/width/height explícitos, que un <img> necesita para rasterizar).
export function buildEvaSvg(m) {
  const ses=(m.sesiones||[]).map((s,i)=>({...s,n:i+1})).filter(s=>s.pb!=null);
  if(!ses.length) return '';
  const met=m.metricas||{};
  const startVal=met.evaInicial!=null?met.evaInicial:ses[0].pb;
  const endVal=met.evaActual!=null?met.evaActual:ses[ses.length-1].pa;
  const mid=ses.map(s=>s.pa!=null?s.pa:s.pb);
  if(endVal!=null) mid[mid.length-1]=endVal;
  // Punto 0 = estado inicial (fechado en la evaluación inicial si existe); luego "Sesión N"
  // con el N de la tabla "Detalle por sesión" para que gráfico y tabla se lean juntos.
  const pts=[startVal,...mid].map((v,i)=>i===0
    ?{v,lbl:m.evalInicial?'Eval. inicial':'Inicio',fecha:m.evalInicial?m.evalInicial.fecha:ses[0].fecha}
    :{v,lbl:'Sesión '+ses[i-1].n,fecha:ses[i-1].fecha});
  const n=pts.length;
  const L=34,R=700,T=20,B=190;
  const y=v=>B-(v/10)*(B-T);
  const x=i=>n>1?64+i*(670-64)/(n-1):367;
  let g='';
  [0,2,4,6,8,10].forEach(v=>{
    g+='<line x1="'+L+'" y1="'+y(v)+'" x2="'+R+'" y2="'+y(v)+'" stroke="#EAEAE4" stroke-width="1"/>'
      +'<text x="'+(L-8)+'" y="'+(y(v)+3)+'" text-anchor="end" font-size="8" fill="#6B6B66">'+v+'</text>';
  });
  // Referencias clínicas de la escala EVA: 3 (leve/moderado) y 6 (moderado/severo).
  [3,6].forEach(v=>{ g+='<line x1="'+L+'" y1="'+y(v)+'" x2="'+R+'" y2="'+y(v)+'" stroke="#B8B8B0" stroke-width="1" stroke-dasharray="4 3"/>'; });
  [[1.5,'leve'],[4.5,'moderado'],[8,'severo']].forEach(z=>{
    g+='<text x="'+(R+8)+'" y="'+(y(z[0])+3)+'" font-size="8" fill="#6B6B66">'+z[1]+'</text>';
  });
  g+='<polyline points="'+pts.map((p,i)=>x(i).toFixed(1)+','+y(p.v).toFixed(1)).join(' ')+'" fill="none" stroke="#155B7A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  const step=Math.max(1,Math.ceil(n/10)); // como el autoSkip del canvas: no amontonar etiquetas
  pts.forEach((p,i)=>{
    const px=x(i).toFixed(1);
    g+='<circle cx="'+px+'" cy="'+y(p.v).toFixed(1)+'" r="3.5" fill="#155B7A"/>'
      +'<text x="'+px+'" y="'+(y(p.v)-8).toFixed(1)+'" text-anchor="middle" font-size="9" font-weight="bold" fill="#1A1A1A">'+esc(p.v)+'</text>';
    if(i%step===0||i===n-1){
      g+='<text x="'+px+'" y="204" text-anchor="middle" font-size="8" fill="#6B6B66">'+esc(p.lbl)+'</text>'
        +'<text x="'+px+'" y="214" text-anchor="middle" font-size="8" fill="#6B6B66">'+esc(dmy(p.fecha))+'</text>';
    }
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="240" viewBox="0 0 760 240" font-family="Arial,Helvetica,sans-serif" style="width:100%;height:auto;display:block;background:#fff">'+g+'</svg>';
}
