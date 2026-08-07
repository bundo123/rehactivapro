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
export const allTabs = ['agenda','pacientes','informes','paciente_rpt','protocolos','resumen','terapeutas','doctores','facturacion'];

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

// Primera cita del mismo terapeuta y día que solapa con la propuesta (null si no hay).
// Los ids se comparan como string: los optimistas son números y el editingId del modal es string.
export function findConflict(appointments,{date,therapistId,hour,duration},excludeId=null){
  return (appointments||[]).find(a=>
    String(a.id)!==String(excludeId) &&
    a.date===date &&
    String(a.therapistId)===String(therapistId) &&
    apptsOverlap(a,{hour,duration})
  )||null;
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
