import { state } from './state.js';
import { esc, getTherapist, patientMatchesSearch } from './utils.js';
import { toastErr } from './toast.js';
import { hasEvalInicial } from './resumen.js';

export function globalSearch(q) {
  const res=document.getElementById('global-search-results');
  if(!q||q.length<2){res.style.display='none';return;}
  const matches=state.patients.filter(p=>patientMatchesSearch(p,q))
    .sort((a,b)=>a.name.localeCompare(b.name))
    .slice(0,8);
  if(!matches.length){
    res.style.display='block';
    res.innerHTML='<div style="padding:12px;font-size:12px;color:#9c9a92;text-align:center">Sin resultados</div>';
    return;
  }
  res.style.display='block';res.innerHTML='';
  matches.forEach(p=>{
    const th=getTherapist(p.therapistId);
    const evalOk=hasEvalInicial(p);
    const div=document.createElement('div');
    div.style.cssText='padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center;gap:10px';
    div.onmouseover=()=>div.style.background='#f5f5f0';
    div.onmouseout=()=>div.style.background='';
    div.onclick=()=>selectGlobalResult(p.id);
    div.innerHTML='<div style="width:32px;height:32px;border-radius:50%;background:#e8f5f0;color:#1D9E75;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">'
      +esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:600;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.name)+(evalOk?'':' ⚠️')+'</div>'
      +'<div style="font-size:10px;color:#9c9a92">'+esc(p.diag||'Sin diagnóstico')+(th?' · '+esc(th.name):'')+'</div>'
      +'</div>';
    res.appendChild(div);
  });
}

export function selectGlobalResult(patientId) {
  document.getElementById('global-search').value='';
  document.getElementById('global-search-results').style.display='none';
  window._app.showTab('paciente_rpt');
  setTimeout(()=>{
    const sel=document.getElementById('patient-rpt-select');
    if(sel){sel.value=String(patientId);window._app.updateEpisodes();}
  },100);
}

export function checkCitasPendientes() {
  const n=new Date();
  const todayStr=window._app.fmtDate(n);
  const ayer=new Date(n);ayer.setDate(n.getDate()-1);
  const ayerStr=window._app.fmtDate(ayer);
  const sinConf=state.appointments.filter(a=>a.date===ayerStr&&a.status==='pend');
  if(sinConf.length>0) toastErr(`⚠️ ${sinConf.length} cita${sinConf.length>1?'s':''} de ayer sin confirmar`);
  const hoyPend=state.appointments.filter(a=>a.date===todayStr&&a.status==='pend'&&a.hour<n.getHours());
  if(hoyPend.length>0) setTimeout(()=>toastErr(`📋 ${hoyPend.length} cita${hoyPend.length>1?'s':''} de hoy sin registrar`),2000);
}

// Listener: cerrar buscador al hacer click fuera
document.addEventListener('click',function(e){
  if(!e.target.closest('#global-search')&&!e.target.closest('#global-search-results')){
    const res=document.getElementById('global-search-results');
    if(res) res.style.display='none';
  }
});
