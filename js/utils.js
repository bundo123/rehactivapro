import { state } from './state.js';

export const ALL_HOURS = [6,7,8,9,10,11,12,13,14,15,16,17];
export const DAYS = ['Lun','Mar','Mié','Jue','Vie'];
export const COLOR_OPTIONS = [
  {id:'ca',bg:'#e8f5f0',border:'#1D9E75',text:'#0d6e4e'},
  {id:'cb',bg:'#e8f2fb',border:'#378ADD',text:'#1a4a8a'},
  {id:'cc',bg:'#fef6e8',border:'#BA7517',text:'#7a4a00'},
  {id:'cd',bg:'#fdeef4',border:'#D4537E',text:'#8a2a50'},
  {id:'ce',bg:'#f0eefb',border:'#7F77DD',text:'#4a3d9e'},
  {id:'cf',bg:'#f0f8e8',border:'#639922',text:'#3a5a10'},
];
export const DOC_COLORS = ['#E24B4A','#378ADD','#7F77DD','#BA7517','#D4537E','#1D9E75','#D85A30','#639922'];
export const allTabs = ['agenda','pacientes','informes','paciente_rpt','protocolos','resumen','terapeutas','doctores','facturacion'];

export function escapeHtml(v){
  if(v==null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export const esc = escapeHtml;
export function fmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
export function getColor(id){return COLOR_OPTIONS.find(c=>c.id===id)||COLOR_OPTIONS[0]}
export function getTherapist(id){return state.therapists.find(t=>t.id===id)}
export function getPatient(id){return state.patients.find(p=>p.id===id)}
export function getDoctor(id){return state.doctors.find(d=>d.id===id)}
export function therapistHours(th){const h=[];for(let i=th.startH;i<th.endH;i++)h.push(i);return h;}
export function getAvailHours(){const s=new Set();state.therapists.forEach(t=>therapistHours(t).forEach(h=>s.add(h)));return[...s].sort((a,b)=>a-b);}
export function dotColor(s){return s==='conf'?'#1D9E75':s==='pend'?'#BA7517':'#E24B4A';}
