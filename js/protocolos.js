import { state } from './state.js';
import { esc, doneActual, CTX_MAX, CTX_PLANTILLA, ctxEstado } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { dbSaveProtocol, dbDeleteProtocol } from './auth.js';
import { populateDiagSelects } from './pacientes.js';
import { validateRequired, validateMinChars, validatePositiveInt, showFieldError, clearFieldError, clearAllErrors, createDirtyTracker } from './validators.js';

const _protocolDirty = createDirtyTracker();
const _altaFn = (v) => v.trim().length === 0 ? { valid: true, error: '' } : validateMinChars(v, 15);
const _protNameFn = (v) => { const r = validateRequired(v); return r.valid ? validateMinChars(v, 3) : r; };
const _protSessionsFn = (v) => validatePositiveInt(v, { min: 1, max: 100, fieldName: 'Sesiones' });

const PROT_PAGE_SIZE = 3;

// A dónde volver después de guardar. El alta puede salir del botón "+ Nuevo" de un modal que el
// terapeuta tiene a medio llenar ('ev' = evaluación inicial, 'ne' = nuevo episodio): el diagnóstico
// recién creado tiene que quedar ELEGIDO ahí al volver, no perdido. Los dos modales coexisten
// abiertos a propósito (de ahí el z-index de #protocol-modal.open en components.css).
const RETURN_TO = {
  ev: ['ev-diag-sel', 'eval-modal'],
  ne: ['ne-diag-sel', 'nuevo-episodio-modal'],
};
let _returnTo = null;

// CTX-1: cómo estaba el contexto al abrir el modal. Todo cambio del texto exige re-validar a
// conciencia; re-guardar sin tocar nada conserva la fecha de validación original.
let _ctxOriginal = '';
let _valOriginal = { por: null, at: null };

function _fmtValidadoEl(at){
  const d=new Date(at);
  return isNaN(d)?'':d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});
}

// Contador, botón de plantilla y línea de estado del bloque de contexto (solo admin lo ve).
function _ctxRefresh(){
  const ctx=document.getElementById('prot-ctx');
  const n=ctx.value.trim().length;
  const cnt=document.getElementById('prot-ctx-count');
  cnt.textContent=`${n} / ${CTX_MAX}`;
  cnt.classList.toggle('over', n>CTX_MAX);
  document.getElementById('prot-ctx-tpl').disabled=ctx.value.trim()!=='';
  const sinCambios=ctx.value.trim()===_ctxOriginal;
  const est=sinCambios?ctxEstado({clinicalContext:_ctxOriginal,ctxValidadoAt:_valOriginal.at}):(n?'sin_validar':'vacio');
  document.getElementById('prot-ctx-estado').textContent=
    est==='validado'?`Validado por ${_valOriginal.por||'—'} el ${_fmtValidadoEl(_valOriginal.at)}`
    :est==='sin_validar'?'Sin validar':'Vacío';
}

export function openProtocolModal(eid=null, returnTo=null) {
  _returnTo = returnTo;
  _protocolDirty.reset();
  clearAllErrors(['prot-name', 'prot-diag', 'prot-alta', 'prot-sessions', 'prot-ctx', 'prot-ctx-por']);
  ['prot-name','prot-diag','prot-alta'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('prot-sessions').value=20;
  document.getElementById('prot-freq').value=3;
  document.getElementById('prot-img').value='knee';
  document.getElementById('prot-def').value='';
  document.getElementById('prot-ctx').value='';
  document.getElementById('prot-ctx-ok').checked=false;
  document.getElementById('prot-ctx-por').value='';
  _ctxOriginal=''; _valOriginal={por:null,at:null};
  state.editingProtocolId=null;
  document.querySelector('#protocol-modal h3').textContent='Nuevo diagnóstico';
  if(eid){
    const p=state.protocols.find(x=>x.id===eid);
    document.getElementById('prot-name').value=p.name;
    document.getElementById('prot-diag').value=p.diag;
    document.getElementById('prot-sessions').value=p.sessions;
    document.getElementById('prot-freq').value=p.freq;
    document.getElementById('prot-alta').value=p.alta;
    document.getElementById('prot-img').value=p.img||'knee';
    document.getElementById('prot-def').value=p.def||'';
    document.getElementById('prot-ctx').value=p.clinicalContext||'';
    _ctxOriginal=(p.clinicalContext||'').trim();
    _valOriginal={por:p.ctxValidadoPor||null,at:p.ctxValidadoAt||null};
    document.getElementById('prot-ctx-ok').checked=ctxEstado(p)==='validado';
    document.getElementById('prot-ctx-por').value=p.ctxValidadoPor||'';
    state.editingProtocolId=eid;
    document.querySelector('#protocol-modal h3').textContent='Editar diagnóstico';
  }
  _ctxRefresh();
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
  // El permiso está partido como en la RLS: el terapeuta da de ALTA el diagnóstico que le falta,
  // pero editar uno existente (y con él el contexto clínico que usa la IA) es del admin.
  if(state.editingProtocolId){
    if(!hasPermission('editProtocol')){toastErr('No tienes permisos para editar diagnósticos.');return;}
  } else {
    if(!hasPermission('createProtocol')){toastErr('No tienes permisos para crear diagnósticos.');return;}
  }
  // CTX-1: el contexto clínico lo cura el admin. Sin editProtocol (el alta del terapeuta) sale
  // vacío y sin validar, como exige la RLS de INSERT (ctx_protocols.sql).
  let ctx={clinicalContext:'',ctxValidadoPor:null,ctxValidadoAt:null};
  if(hasPermission('editProtocol')){
    const txt=document.getElementById('prot-ctx').value.trim();
    const ok=document.getElementById('prot-ctx-ok').checked;
    const por=document.getElementById('prot-ctx-por').value.trim();
    if(txt.length>CTX_MAX){ showFieldError('prot-ctx', `Máximo ${CTX_MAX} caracteres (tiene ${txt.length})`); return; }
    clearFieldError('prot-ctx');
    if(ok && !txt){ showFieldError('prot-ctx', 'No se puede validar un contexto vacío'); return; }
    if(ok && por.length<3){ showFieldError('prot-ctx-por', 'Indica quién valida (mínimo 3 caracteres)'); return; }
    clearFieldError('prot-ctx-por');
    if(ok){
      // Re-guardar sin cambios (mismo texto, mismo "por", ya validado) conserva la fecha original.
      const sinCambios=txt===_ctxOriginal && por===(_valOriginal.por||'') && !!_valOriginal.at;
      ctx={clinicalContext:txt,ctxValidadoPor:por,ctxValidadoAt:sinCambios?_valOriginal.at:new Date().toISOString()};
    } else {
      ctx={clinicalContext:txt,ctxValidadoPor:null,ctxValidadoAt:null};
    }
  }
  const diag=document.getElementById('prot-diag').value.trim();
  const name=document.getElementById('prot-name').value.trim();
  const d={diag,name,sessions:parseInt(document.getElementById('prot-sessions').value),freq:parseInt(document.getElementById('prot-freq').value),alta:document.getElementById('prot-alta').value,
    img:document.getElementById('prot-img').value,def:document.getElementById('prot-def').value.trim(),...ctx};
  const _isNew=!state.editingProtocolId;
  if(state.editingProtocolId) Object.assign(state.protocols.find(p=>p.id===state.editingProtocolId),d);
  else state.protocols.push({id:++state.protCounter,...d});
  const _pr=state.editingProtocolId?state.protocols.find(p=>p.id===state.editingProtocolId):state.protocols[state.protocols.length-1];
  state.editingProtocolId=null;
  window._app.closeModal('protocol-modal'); renderProtocols();
  // Si la DB rechaza un ALTA, el diagnóstico optimista se retira del catálogo: los ids reales son
  // UUID (auth.js:337) y los optimistas números, así que el fantasma nunca chocaría con uno real —
  // pero seguir ofreciéndolo en los selectores hace que el paciente falle al guardar (protocol_id
  // inexistente) y deja al terapeuta eligiendo algo que no está en ninguna parte.
  let _ok=true;
  try {
    const {data,error}=await dbSaveProtocol(_pr);
    if(error){ _ok=false; toastErr('Error al guardar diagnóstico: '+error.message); }
    else {
      if(_isNew && data) _pr.id=data.id;
      renderProtocols();
      toastOk('Diagnóstico guardado correctamente');
    }
  } catch(e){ _ok=false; toastErr('Error de conexión al guardar diagnóstico.'); }
  if(!_ok && _isNew){
    state.protocols=state.protocols.filter(p=>p!==_pr);
    renderProtocols();
  }
  // El catálogo cambió: los tres selectores se repueblan — DESPUÉS del rollback, para que el
  // fantasma no alcance a aparecer en ninguno. Si el alta salió del "+ Nuevo" de otro modal y se
  // guardó bien, el diagnóstico queda ELEGIDO ahí y ese modal vuelve al frente para terminarlo.
  populateDiagSelects();
  const _vuelta=_ok?RETURN_TO[_returnTo]:null;
  if(_vuelta){
    const [selId,modalId]=_vuelta;
    const sel=document.getElementById(selId);
    if(sel) sel.value=String(_pr.id);
    document.getElementById(modalId)?.classList.add('open');
  }
  _returnTo=null;
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
  // CTX-1: listeners del bloque de contexto clínico (sin onclick inline, camino de la CSP estricta).
  const ctx = document.getElementById('prot-ctx');
  if (ctx) {
    ctx.addEventListener('input', () => {
      // Todo cambio del texto desmarca la validación: hay que re-validar a conciencia.
      if (ctx.value.trim() !== _ctxOriginal) document.getElementById('prot-ctx-ok').checked = false;
      if (ctx.classList.contains('input-error') && ctx.value.trim().length <= CTX_MAX) clearFieldError('prot-ctx');
      _ctxRefresh();
    });
    document.getElementById('prot-ctx-tpl')?.addEventListener('click', () => {
      if (ctx.value.trim() !== '') return;
      ctx.value = CTX_PLANTILLA;
      ctx.dispatchEvent(new Event('input'));
      ctx.focus();
    });
  }
  document.getElementById('prot-ctx-por')?.addEventListener('input', () => clearFieldError('prot-ctx-por'));
  document.getElementById('prot-solo-pend')?.addEventListener('change', () => renderProtocols());
}

export function renderProtocols() {
  const fl={7:'Diaria',5:'5×',3:'3×',2:'2×',1:'1×'};
  const qp=(document.getElementById('protocol-search')?.value||'').toLowerCase();
  let filtProts=qp?state.protocols.filter(p=>p.name.toLowerCase().includes(qp)||p.diag.toLowerCase().includes(qp)):state.protocols;
  // ¿p.img es una foto real? (URL/data/ruta). Los valores legacy son claves de zona ('knee', 'hip'…)
  // → cabecera plana de color suave, sin call-to-action (las fotos reales las proveerá la clínica).
  const isUrl=v=>/^(https?:\/\/|data:|\.?\/)/.test(String(v||''));
  // Pacientes por protocolo: link explícito, o keyword como fallback (misma lógica que getProtocolRows).
  const countPts=prot=>state.patients.filter(pt=>{
    if(pt.status==='alta') return false;
    if(pt.protocolId) return pt.protocolId===prot.id;
    const kw=(prot.diag||'').toLowerCase().split(',').map(k=>k.trim());
    return kw.some(k=>k&&(pt.diag||'').toLowerCase().includes(k));
  }).length;
  // CTX-1: pendiente = en uso (algún paciente activo) y sin contexto validado. El resumen cuenta
  // sobre todo el catálogo, no sobre lo filtrado por la búsqueda.
  const esPendiente=p=>ctxEstado(p)!=='validado'&&countPts(p)>0;
  const nPend=state.protocols.filter(esPendiente).length;
  const resumen=document.getElementById('prot-ctx-resumen');
  if(resumen){
    resumen.textContent=nPend
      ?`${nPend} diagnóstico${nPend!==1?'s':''} en uso sin contexto validado`
      :'Todos los diagnósticos en uso tienen contexto validado';
    resumen.classList.toggle('ok', !nPend);
  }
  const soloPend=hasPermission('editProtocol')&&document.getElementById('prot-solo-pend')?.checked;
  if(soloPend) filtProts=filtProts.filter(esPendiente);
  const CTX_BADGE={vacio:['vacio','Vacío'],sin_validar:['sin-validar','Sin validar'],validado:['validado','Validado']};
  if(!filtProts.length){
    document.getElementById('protocols-list').innerHTML=soloPend
      ?`<div style="color:#5a5a56;font-size:13px;padding:20px 0;text-align:center">No hay diagnósticos en uso pendientes de validar.</div>`
      :`<div style="color:#5a5a56;font-size:13px;padding:20px 0;text-align:center">No hay diagnósticos. Carga los predefinidos o crea uno nuevo.</div>`;
  } else {
    document.getElementById('protocols-list').innerHTML=`<div class="prot-grid">`+filtProts.map(p=>{
      const n=countPts(p);
      const photo=isUrl(p.img)?`<img src="${esc(p.img)}" alt="" loading="lazy">`:'';
      const [bCls,bTxt]=CTX_BADGE[ctxEstado(p)];
      return`<div class="prot-card">
        <div class="prot-photo">${photo}<span class="prot-pts">${n} paciente${n!==1?'s':''}</span></div>
        <div class="prot-body">
          <div class="prot-name">${esc(p.name)}</div>
          <span class="prot-ctx-badge ${bCls}" title="Contexto clínico para la IA">${esc(bTxt)}</span>
          ${p.def?`<div class="prot-def">${esc(p.def)}</div>`:''}
          <div class="prot-meta"><span><b style="color:#1a1917">${p.sessions}</b> sesiones</span><span><b style="color:#1a1917">${fl[p.freq]||p.freq+'×'}</b>/semana</span></div>
          ${p.alta?`<div class="prot-alta">Alta: ${esc(p.alta)}</div>`:''}
          ${hasPermission('editProtocol')?`<div class="prot-btns"><button class="prot-btn edit" onclick="openProtocolModal(${esc(JSON.stringify(p.id))})">Editar</button><button class="prot-btn del" onclick="deleteProtocol(${esc(JSON.stringify(p.id))})">Eliminar</button></div>`:''}
        </div>
      </div>`;
    }).join('')+`</div>`;
  }
  state.protCurrentPage=0; renderProtocolAdherence();
}

export function deleteProtocol(id) {
  if(!hasPermission('editProtocol')){toastErr('No tienes permisos para eliminar diagnósticos.');return;}
  if(!confirm('¿Eliminar este diagnóstico?'))return;
  state.protocols=state.protocols.filter(p=>p.id!==id);
  renderProtocols(); populateDiagSelects(); dbDeleteProtocol(id);
}

export function getProtocolRows() {
  const rows=[];const fl={7:'Diaria',5:'5×/sem',3:'3×/sem',2:'2×/sem',1:'1×/sem'};
  const mkRow=(p,prot)=>{
    const adh=p.log.length>0?Math.round(p.log.filter(s=>s.status==='asistió').length/p.log.length*100):0;
    const exp=Math.min(100,Math.round((doneActual(p)/prot.sessions)*100));
    rows.push({p,prot,adh,exp,fl});
  };
  state.patients.forEach(p=>{
    if(p.status==='alta')return;
    if(p.protocolId){
      // Link explícito: solo el protocolo asignado, sin fallback por keyword.
      const prot=state.protocols.find(x=>x.id===p.protocolId);
      if(prot) mkRow(p,prot);
      return;
    }
    // Retrocompat: pacientes sin link → match por keyword (guard k&& evita matchear con keyword vacía).
    state.protocols.forEach(prot=>{
      const kw=prot.diag.toLowerCase().split(',').map(k=>k.trim());
      if(!kw.some(k=>k&&p.diag.toLowerCase().includes(k)))return;
      mkRow(p,prot);
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
  if(!rows.length){document.getElementById('protocol-adherence-list').innerHTML='<div style="color:#6b6a64;font-size:13px;padding:8px 0">No hay pacientes con diagnóstico activo.</div>';document.getElementById('prot-page-lbl').textContent='';return;}
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
