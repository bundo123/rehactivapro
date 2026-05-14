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
export function getColor(id){return COLOR_OPTIONS.find(c=>c.id===id)||COLOR_OPTIONS[0]}
export function getTherapist(id){return state.therapists.find(t=>t.id===id)}
export function getPatient(id){return state.patients.find(p=>p.id===id)}
export function getDoctor(id){return state.doctors.find(d=>d.id===id)}
export function therapistHours(th){const h=[];for(let i=th.startH;i<th.endH;i++)h.push(i);return h;}
export function getAvailHours(){const s=new Set();state.therapists.forEach(t=>therapistHours(t).forEach(h=>s.add(h)));return[...s].sort((a,b)=>a-b);}
export function dotColor(s){return s==='conf'?'#1D9E75':s==='pend'?'#BA7517':'#E24B4A';}
