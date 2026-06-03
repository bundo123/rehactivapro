import { state } from './state.js';
import { esc, getPatient, doneActual } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { dbSaveProtocol, dbDeleteProtocol } from './auth.js';
import { validateRequired, validateMinChars, validatePositiveInt, showFieldError, clearFieldError, clearAllErrors, createDirtyTracker } from './validators.js';

const _protocolDirty = createDirtyTracker();
const _altaFn = (v) => v.trim().length === 0 ? { valid: true, error: '' } : validateMinChars(v, 15);
const _protNameFn = (v) => { const r = validateRequired(v); return r.valid ? validateMinChars(v, 3) : r; };
const _protSessionsFn = (v) => validatePositiveInt(v, { min: 1, max: 100, fieldName: 'Sesiones' });

const PROT_PAGE_SIZE = 3;

export function protocolSVG(img) {
  const svgs = {
    shoulder:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="30" r="18" fill="none" stroke="#1D9E75" stroke-width="2.5"/><circle cx="60" cy="30" r="8" fill="#1D9E75" opacity=".25"/><line x1="60" y1="48" x2="60" y2="80" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><line x1="60" y1="55" x2="38" y2="72" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><line x1="60" y1="55" x2="82" y2="72" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><line x1="60" y1="80" x2="50" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><line x1="60" y1="80" x2="70" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><path d="M42 30 Q30 30 28 45 Q40 50 60 48" fill="none" stroke="#E24B4A" stroke-width="2" stroke-dasharray="3,2"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Hombro</text></svg>`,
    hip:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="20" width="60" height="30" rx="8" fill="none" stroke="#9c9a92" stroke-width="2.5"/><circle cx="42" cy="60" r="12" fill="none" stroke="#1D9E75" stroke-width="2.5"/><circle cx="42" cy="60" r="5" fill="#1D9E75" opacity=".3"/><circle cx="78" cy="60" r="12" fill="none" stroke="#6b6a64" stroke-width="1.5" stroke-dasharray="3,2"/><line x1="42" y1="72" x2="38" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><line x1="78" y1="72" x2="82" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Cadera</text></svg>`,
    hand:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="40" y="60" width="40" height="45" rx="6" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="48" y="35" width="8" height="28" rx="4" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="58" y="30" width="8" height="32" rx="4" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="68" y="33" width="8" height="29" rx="4" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="78" y="38" width="7" height="25" rx="3.5" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="28" y="55" width="16" height="10" rx="5" fill="none" stroke="#E24B4A" stroke-width="2.5"/><path d="M28 55 Q20 52 22 45 Q30 43 44 55" fill="#E24B4A" opacity=".15"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Muñeca/Mano</text></svg>`,
    arm:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="22" r="14" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="48" y="35" width="24" height="38" rx="12" fill="none" stroke="#9c9a92" stroke-width="2.5"/><circle cx="60" cy="73" r="10" fill="none" stroke="#1D9E75" stroke-width="2.5"/><circle cx="60" cy="73" r="4" fill="#1D9E75" opacity=".3"/><rect x="50" y="82" width="20" height="30" rx="10" fill="none" stroke="#9c9a92" stroke-width="2"/><path d="M48 50 Q35 55 38 70 Q50 75 60 73" fill="#E24B4A" opacity=".15"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Brazo/Bíceps</text></svg>`,
    head:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><ellipse cx="60" cy="48" rx="32" ry="36" fill="none" stroke="#9c9a92" stroke-width="2.5"/><ellipse cx="60" cy="90" rx="16" ry="8" fill="none" stroke="#9c9a92" stroke-width="2"/><line x1="60" y1="82" x2="60" y2="98" stroke="#9c9a92" stroke-width="2.5"/><path d="M30 40 Q28 25 40 20 Q60 14 80 20 Q92 25 90 40" fill="#E24B4A" opacity=".15" stroke="#E24B4A" stroke-width="1.5"/><circle cx="48" cy="44" r="3" fill="#9c9a92"/><circle cx="72" cy="44" r="3" fill="#9c9a92"/><path d="M50 58 Q60 64 70 58" fill="none" stroke="#9c9a92" stroke-width="1.5"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Cabeza/Cuello</text></svg>`,
    elbow:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="48" y="10" width="24" height="38" rx="12" fill="none" stroke="#9c9a92" stroke-width="2.5"/><circle cx="60" cy="58" r="16" fill="none" stroke="#1D9E75" stroke-width="2.5"/><circle cx="60" cy="58" r="6" fill="#1D9E75" opacity=".25"/><path d="M76 52 Q88 48 88 42" fill="none" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round"/><rect x="48" y="74" width="24" height="36" rx="12" fill="none" stroke="#9c9a92" stroke-width="2.5"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Codo</text></svg>`,
    spine:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><line x1="60" y1="10" x2="60" y2="108" stroke="#9c9a92" stroke-width="2"/><rect x="44" y="15" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="44" y="28" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="44" y="41" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="44" y="54" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/><rect x="44" y="67" width="32" height="10" rx="3" fill="#E24B4A" opacity=".2" stroke="#E24B4A" stroke-width="2.5"/><rect x="44" y="80" width="32" height="10" rx="3" fill="#E24B4A" opacity=".2" stroke="#E24B4A" stroke-width="2.5"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Columna</text></svg>`,
    knee:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="46" y="8" width="28" height="42" rx="14" fill="none" stroke="#9c9a92" stroke-width="2.5"/><circle cx="60" cy="62" r="20" fill="none" stroke="#1D9E75" stroke-width="2.5"/><circle cx="60" cy="62" r="10" fill="none" stroke="#6b6a64" stroke-width="1.5" stroke-dasharray="4,2"/><circle cx="60" cy="56" r="7" fill="#1D9E75" opacity=".2" stroke="#1D9E75" stroke-width="1.5"/><rect x="46" y="82" width="28" height="32" rx="14" fill="none" stroke="#9c9a92" stroke-width="2.5"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Rodilla</text></svg>`,
    ankle:`<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="46" y="8" width="28" height="50" rx="14" fill="none" stroke="#9c9a92" stroke-width="2.5"/><ellipse cx="60" cy="70" rx="22" ry="16" fill="none" stroke="#1D9E75" stroke-width="2.5"/><path d="M38 80 Q30 90 35 100 Q55 112 85 108 Q95 105 90 95 Q82 85 60 86" fill="none" stroke="#9c9a92" stroke-width="2.5" stroke-linecap="round"/><path d="M42 74 Q38 90 40 98" fill="none" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round"/><text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Tobillo</text></svg>`
  };
  return svgs[img]||svgs['shoulder'];
}

const svgsSmall = {
  shoulder:'<svg viewBox="0 0 80 80" width="72" height="72"><circle cx="40" cy="32" r="18" fill="none" stroke="#1D9E75" stroke-width="1.5"/><ellipse cx="40" cy="32" rx="8" ry="8" fill="none" stroke="#1D9E75" stroke-width="1" stroke-dasharray="3,2"/><rect x="28" y="48" width="24" height="20" rx="4" fill="none" stroke="#1D9E75" stroke-width="1"/><circle cx="40" cy="32" r="4" fill="#1D9E75" opacity=".7"/></svg>',
  hip:'<svg viewBox="0 0 80 80" width="72" height="72"><ellipse cx="40" cy="30" rx="22" ry="16" fill="none" stroke="#1D9E75" stroke-width="1.5"/><circle cx="40" cy="38" r="9" fill="none" stroke="#1D9E75" stroke-width="1.5"/><circle cx="40" cy="38" r="4" fill="#1D9E75" opacity=".7"/><line x1="32" y1="47" x2="26" y2="72" stroke="#1D9E75" stroke-width="2" stroke-linecap="round"/><line x1="48" y1="47" x2="54" y2="72" stroke="#1D9E75" stroke-width="2" stroke-linecap="round"/></svg>',
  hand:'<svg viewBox="0 0 80 80" width="72" height="72"><rect x="28" y="40" width="24" height="28" rx="6" fill="none" stroke="#1D9E75" stroke-width="1.5"/><rect x="22" y="26" width="7" height="18" rx="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/><rect x="31" y="20" width="7" height="22" rx="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/><rect x="40" y="22" width="7" height="20" rx="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/><rect x="49" y="26" width="7" height="16" rx="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/><circle cx="25" cy="22" r="3" fill="#1D9E75" opacity=".8"/></svg>',
  arm:'<svg viewBox="0 0 80 80" width="72" height="72"><rect x="32" y="10" width="16" height="60" rx="8" fill="none" stroke="#1D9E75" stroke-width="1.5"/><ellipse cx="40" cy="38" rx="12" ry="8" fill="none" stroke="#1D9E75" stroke-width="1" stroke-dasharray="3,2"/><circle cx="40" cy="38" r="4" fill="#1D9E75" opacity=".7"/></svg>',
  head:'<svg viewBox="0 0 80 80" width="72" height="72"><ellipse cx="40" cy="32" rx="22" ry="26" fill="none" stroke="#1D9E75" stroke-width="1.5"/><ellipse cx="40" cy="60" rx="10" ry="6" fill="none" stroke="#1D9E75" stroke-width="1"/><line x1="22" y1="28" x2="58" y2="28" stroke="#1D9E75" stroke-width="1" stroke-dasharray="4,3" opacity=".6"/><circle cx="32" cy="36" r="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/><circle cx="48" cy="36" r="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/></svg>',
  elbow:'<svg viewBox="0 0 80 80" width="72" height="72"><rect x="34" y="8" width="12" height="28" rx="6" fill="none" stroke="#1D9E75" stroke-width="1.5"/><circle cx="40" cy="40" r="14" fill="none" stroke="#1D9E75" stroke-width="1.5"/><circle cx="40" cy="40" r="5" fill="#1D9E75" opacity=".7"/><rect x="34" y="46" width="12" height="26" rx="6" fill="none" stroke="#1D9E75" stroke-width="1.5"/></svg>',
  spine:'<svg viewBox="0 0 80 80" width="72" height="72"><rect x="34" y="8" width="12" height="64" rx="3" fill="none" stroke="#1D9E75" stroke-width="1.5"/><rect x="26" y="12" width="28" height="8" rx="2" fill="none" stroke="#1D9E75" stroke-width="1"/><rect x="26" y="24" width="28" height="8" rx="2" fill="none" stroke="#1D9E75" stroke-width="1"/><rect x="26" y="36" width="28" height="8" rx="2" fill="none" stroke="#1D9E75" stroke-width="1"/><rect x="26" y="48" width="28" height="8" rx="2" fill="none" stroke="#1D9E75" stroke-width="1"/><rect x="26" y="60" width="28" height="8" rx="2" fill="none" stroke="#E24B4A" stroke-width="1.5"/></svg>',
  knee:'<svg viewBox="0 0 80 80" width="72" height="72"><rect x="32" y="8" width="16" height="26" rx="5" fill="none" stroke="#1D9E75" stroke-width="1.5"/><ellipse cx="40" cy="40" rx="18" ry="14" fill="none" stroke="#1D9E75" stroke-width="1.5"/><ellipse cx="40" cy="38" rx="8" ry="6" fill="none" stroke="#1D9E75" stroke-width="1" stroke-dasharray="3,2"/><circle cx="40" cy="38" r="3" fill="#1D9E75" opacity=".7"/><rect x="32" y="52" width="16" height="22" rx="5" fill="none" stroke="#1D9E75" stroke-width="1.5"/></svg>',
  ankle:'<svg viewBox="0 0 80 80" width="72" height="72"><rect x="34" y="8" width="12" height="36" rx="5" fill="none" stroke="#1D9E75" stroke-width="1.5"/><ellipse cx="40" cy="50" rx="16" ry="12" fill="none" stroke="#1D9E75" stroke-width="1.5"/><rect x="20" y="60" width="40" height="12" rx="5" fill="none" stroke="#1D9E75" stroke-width="1.5"/><line x1="34" y1="44" x2="46" y2="44" stroke="#E24B4A" stroke-width="2" stroke-linecap="round"/></svg>',
};

export function openProtocolModal(eid=null) {
  _protocolDirty.reset();
  clearAllErrors(['prot-name', 'prot-diag', 'prot-alta', 'prot-sessions']);
  ['prot-name','prot-diag','prot-alta'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('prot-sessions').value=20;
  document.getElementById('prot-freq').value=3;
  state.editingProtocolId=null;
  document.querySelector('#protocol-modal h3').textContent='Nuevo protocolo';
  if(eid){
    const p=state.protocols.find(x=>x.id===eid);
    document.getElementById('prot-name').value=p.name;
    document.getElementById('prot-diag').value=p.diag;
    document.getElementById('prot-sessions').value=p.sessions;
    document.getElementById('prot-freq').value=p.freq;
    document.getElementById('prot-alta').value=p.alta;
    state.editingProtocolId=eid;
    document.querySelector('#protocol-modal h3').textContent='Editar protocolo';
  }
  document.getElementById('protocol-modal').classList.add('open');
}

export async function saveProtocol() {
  const _toValidate = [
    { id: 'prot-name',     fn: _protNameFn,     always: true },
    { id: 'prot-diag',     fn: validateRequired, always: true },
    { id: 'prot-sessions', fn: _protSessionsFn, always: true },
    { id: 'prot-alta',     fn: _altaFn,          always: false },
  ];
  let _hasErrors = false;
  _toValidate.forEach(({ id, fn, always }) => {
    if (always || _protocolDirty.has(id)) {
      const r = fn(document.getElementById(id).value);
      if (!r.valid) { showFieldError(id, r.error); _hasErrors = true; }
      else clearFieldError(id);
    }
  });
  if (_hasErrors) return;
  if(!hasPermission('createProtocol')){toastErr('No tienes permisos para guardar protocolos.');return;}
  const diag=document.getElementById('prot-diag').value.trim();
  const name=document.getElementById('prot-name').value.trim();
  const d={diag,name,sessions:parseInt(document.getElementById('prot-sessions').value),freq:parseInt(document.getElementById('prot-freq').value),alta:document.getElementById('prot-alta').value};
  const _isNew=!state.editingProtocolId;
  if(state.editingProtocolId) Object.assign(state.protocols.find(p=>p.id===state.editingProtocolId),d);
  else state.protocols.push({id:++state.protCounter,...d});
  const _pr=state.editingProtocolId?state.protocols.find(p=>p.id===state.editingProtocolId):state.protocols[state.protocols.length-1];
  state.editingProtocolId=null;
  window._app.closeModal('protocol-modal'); renderProtocols();
  try {
    const {data,error}=await dbSaveProtocol(_pr);
    if(error) toastErr('Error al guardar protocolo: '+error.message);
    else {
      if(_isNew && data) _pr.id=data.id;
      renderProtocols();
      toastOk('Protocolo guardado correctamente');
    }
  } catch(e){toastErr('Error de conexión al guardar protocolo.');}
}

export function initProtocolValidation() {
  const fields = [
    { id: 'prot-name',     fn: _protNameFn,     req: true },
    { id: 'prot-diag',     fn: validateRequired, req: true },
    { id: 'prot-sessions', fn: _protSessionsFn, req: true },
    { id: 'prot-alta',     fn: _altaFn,          req: false },
  ];
  fields.forEach(({ id, fn, req }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      if (req || _protocolDirty.has(id)) {
        const r = fn(el.value);
        if (!r.valid) showFieldError(id, r.error);
        else clearFieldError(id);
      }
    });
    el.addEventListener('input', () => {
      _protocolDirty.mark(id);
      if (el.classList.contains('input-error') && fn(el.value).valid) clearFieldError(id);
    });
  });
}

export function renderProtocols() {
  const fl={7:'Diaria',5:'5×/sem',3:'3×/sem',2:'2×/sem',1:'1×/sem'};
  const qp=(document.getElementById('protocol-search')?.value||'').toLowerCase();
  const filtProts=qp?state.protocols.filter(p=>p.name.toLowerCase().includes(qp)||p.diag.toLowerCase().includes(qp)):state.protocols;
  if(!filtProts.length){
    document.getElementById('protocols-list').innerHTML=`<div style="color:#5a5a56;font-size:13px;padding:20px 0;text-align:center">No hay protocolos. Carga los predefinidos o crea uno nuevo.</div>`;
  } else {
    document.getElementById('protocols-list').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:14px">`+filtProts.map(p=>{
      const svg=svgsSmall[p.img]||svgsSmall.knee;
      return`<div class="protocol-card" style="display:flex;gap:14px;align-items:flex-start">
        <div style="flex-shrink:0;background:#f8f8f4;border-radius:8px;padding:8px;border:1px solid rgba(29,158,117,.12)">${svg}</div>
        <div style="flex:1;min-width:0">
          <div class="protocol-diag">${esc(p.name)}</div>
          ${p.def?`<div style="font-size:11px;color:#6b6a64;margin-top:4px;line-height:1.5">${esc(p.def)}</div>`:''}
          <div class="protocol-meta" style="margin-top:6px">${p.sessions} sesiones · ${fl[p.freq]||p.freq+'×/sem'}</div>
          ${p.alta?`<div style="font-size:10px;color:#7a7a76;margin-top:3px">Alta: ${esc(p.alta)}</div>`:''}
          ${hasPermission('createProtocol')?`<div style="display:flex;gap:6px;margin-top:8px"><button class="th-btn" onclick="openProtocolModal('${p.id}')">Editar</button><button class="th-btn del" onclick="deleteProtocol('${p.id}')">Eliminar</button></div>`:''}
        </div>
      </div>`;
    }).join('')+`</div>`;
  }
  state.protCurrentPage=0; renderProtocolAdherence();
}

export function deleteProtocol(id) {
  if(!hasPermission('createProtocol')){toastErr('No tienes permisos para eliminar protocolos.');return;}
  if(!confirm('¿Eliminar?'))return;
  state.protocols=state.protocols.filter(p=>p.id!==id);
  renderProtocols(); dbDeleteProtocol(id);
}

export function getProtocolRows() {
  const rows=[];const fl={7:'Diaria',5:'5×/sem',3:'3×/sem',2:'2×/sem',1:'1×/sem'};
  state.patients.forEach(p=>{
    if(p.status==='alta')return;
    state.protocols.forEach(prot=>{
      const kw=prot.diag.toLowerCase().split(',').map(k=>k.trim());
      if(!kw.some(k=>p.diag.toLowerCase().includes(k)))return;
      const adh=p.log.length>0?Math.round(p.log.filter(s=>s.status==='asistió').length/p.log.length*100):0;
      const exp=Math.min(100,Math.round((doneActual(p)/prot.sessions)*100));
      rows.push({p,prot,adh,exp,fl});
    });
  });
  return rows;
}

export function protPage(dir) {
  const rows=getProtocolRows();
  const pages=Math.ceil(rows.length/PROT_PAGE_SIZE);
  state.protCurrentPage=Math.max(0,Math.min(pages-1,state.protCurrentPage+dir));
  renderProtocolAdherence();
}

export function renderProtocolAdherence() {
  const rows=getProtocolRows();
  if(!rows.length){document.getElementById('protocol-adherence-list').innerHTML='<div style="color:#6b6a64;font-size:13px;padding:8px 0">No hay pacientes con protocolos activos.</div>';document.getElementById('prot-page-lbl').textContent='';return;}
  const pages=Math.max(1,Math.ceil(rows.length/PROT_PAGE_SIZE));
  state.protCurrentPage=Math.min(state.protCurrentPage,pages-1);
  const page=rows.slice(state.protCurrentPage*PROT_PAGE_SIZE,(state.protCurrentPage+1)*PROT_PAGE_SIZE);
  document.getElementById('prot-page-lbl').textContent=`${state.protCurrentPage+1}/${pages}`;
  document.getElementById('prot-prev').disabled=state.protCurrentPage===0;
  document.getElementById('prot-next').disabled=state.protCurrentPage>=pages-1;
  const fl={7:'Diaria',5:'5×/sem',3:'3×/sem',2:'2×/sem',1:'1×/sem'};
  document.getElementById('protocol-adherence-list').innerHTML=page.map(({p,prot,adh,exp})=>{
    const ac=adh>=85?'#1D9E75':adh>=75?'#BA7517':'#E24B4A';
    const alrt=adh<75;
    return`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(29,158,117,.1)">
      <span style="font-size:14px;flex-shrink:0">${alrt?'⚠':'✓'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:#1a1917">${esc(p.name)}</div>
        <div style="font-size:11px;color:#6b6a64">${esc(p.diag)} — ${esc(prot.name)}</div>
        <div style="font-size:10px;color:#6b6a64;margin-top:1px">Esperado: ${fl[prot.freq]||prot.freq+'×/sem'} · ${prot.sessions} sesiones</div>
        <div style="margin-top:5px;position:relative">
          <div class="bar-wrap" style="height:6px"><div class="bar-fill" style="width:${adh}%;background:${ac}"></div></div>
          <div style="position:absolute;top:-2px;left:${exp}%;width:2px;height:10px;background:rgba(255,255,255,0.3);border-radius:1px" title="Meta"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#6b6a64;margin-top:3px">
          <span>Real: <b style="color:${ac}">${adh}%</b></span><span>Meta: ${exp}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
