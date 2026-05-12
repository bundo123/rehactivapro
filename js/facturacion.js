import { state } from './state.js';
import { esc, getPatient, getTherapist, getDoctor, fmtDate } from './utils.js';
import { toastOk, toastErr } from './toast.js';
import { hasPermission } from './permissions.js';
import { dbRegistrarCobro } from './auth.js';
import { updateFacturaBadge } from './agenda.js';

export function renderFacturacion() {
  updateFacturaBadge();
  const spf=parseInt(document.getElementById('global-spf').value)||5;

  function billingInfo(p){
    const sesTotal=p.sessions||0;
    const sesYaCobradas=p.billing.facturas.reduce((s,f)=>s+f.n,0);
    const sesPend=p.billing.pendientes||0;
    const cobrosRealizados=p.billing.facturas.length;
    const totalCobros=Math.floor(sesTotal/spf)+(sesTotal%spf>0?1:0);
    const cobrosRestantes=totalCobros-cobrosRealizados;
    const esCierre=sesPend>0&&sesPend<spf&&(sesYaCobradas+sesPend)>=sesTotal;
    return{sesTotal,sesYaCobradas,sesPend,cobrosRealizados,totalCobros,cobrosRestantes,esCierre};
  }

  const listos=state.patients.filter(p=>p.billing&&p.billing.pendientes>=spf);
  const cierre=state.patients.filter(p=>{
    if(!p.billing||p.billing.pendientes<=0||p.billing.pendientes>=spf)return false;
    return billingInfo(p).esCierre;
  });
  const enCurso=state.patients.filter(p=>{
    if(!p.billing||p.billing.pendientes<=0||p.billing.pendientes>=spf)return false;
    return !billingInfo(p).esCierre;
  });
  const totalCobros=state.patients.reduce((s,p)=>s+(p.billing&&p.billing.facturas?p.billing.facturas.length:0),0);
  const totalSes=state.patients.reduce((s,p)=>s+(p.billing&&p.billing.facturas?p.billing.facturas.reduce((a,f)=>a+f.n,0):0),0);

  let html=`<div class="stats-row">
    <div class="stat"><div class="stat-lbl">Por cobrar ahora</div><div class="stat-val" style="color:${(listos.length+cierre.length)?'#e0a850':'#1D9E75'}">${listos.length+cierre.length}</div><div class="stat-chg neu">Pacientes</div></div>
    <div class="stat"><div class="stat-lbl">Acumulando citas</div><div class="stat-val">${enCurso.length}</div><div class="stat-chg neu">En curso</div></div>
    <div class="stat"><div class="stat-lbl">Total cobros hechos</div><div class="stat-val" style="color:#1D9E75">${totalCobros}</div><div class="stat-chg up">Histórico</div></div>
    <div class="stat"><div class="stat-lbl">Total sesiones cobradas</div><div class="stat-val" style="color:#1D9E75">${totalSes}</div><div class="stat-chg up">Histórico</div></div>
  </div>`;

  const paracobrar=[...listos,...cierre];
  if(paracobrar.length){
    html+=`<div class="full-card" style="border:1px solid rgba(224,168,80,.25);background:#fdf8ed">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="font-size:20px">🧾</div>
        <div><div style="font-size:13px;font-weight:600;color:#e0a850">${paracobrar.length} paciente${paracobrar.length>1?'s':''} listo${paracobrar.length>1?'s':''} para cobrar</div>
          <div style="font-size:11px;color:#5a5a56;margin-top:2px">Márcalos como cobrados una vez recibido el pago.</div>
        </div>
        <button class="add-btn" style="margin-left:auto;background:#e0a850;color:#111;font-weight:600" onclick="marcarTodosFacturados()">Cobrar todos</button>
      </div>`;
    paracobrar.forEach(p=>{
      const info=billingInfo(p);
      const th=getTherapist(p.therapistId);
      const doc=p.doctorId?getDoctor(p.doctorId):null;
      const esFinal=info.esCierre;
      const nCita=info.sesPend;
      const cajitas=Array.from({length:nCita},(_,i)=>`<div style="width:22px;height:22px;border-radius:5px;background:${esFinal?'#378ADD':'#1D9E75'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${info.sesYaCobradas+i+1}</div>`).join('');
      const tagLabel=esFinal
        ?`<span style="font-size:10px;font-weight:600;color:#7ab8e8;background:#e8f2fc;border:1px solid rgba(55,138,221,.3);border-radius:99px;padding:1px 8px;margin-left:6px">Cobro final</span>`
        :`<span style="font-size:10px;font-weight:600;color:#e0a850;background:#fefaf0;border:1px solid rgba(224,168,80,.3);border-radius:99px;padding:1px 8px;margin-left:6px">Cobro ${info.cobrosRealizados+1} de ${info.totalCobros}</span>`;
      html+=`<div class="resumen-row" style="border-color:rgba(224,168,80,.2);background:#fefaf0;margin-bottom:6px;align-items:flex-start">
        <div style="width:9px;height:9px;border-radius:50%;background:${esFinal?'#378ADD':'#e0a850'};flex-shrink:0;margin-top:5px"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px"><span style="font-size:13px;font-weight:600;color:#1a1917">${esc(p.name)}</span>${tagLabel}</div>
          <div style="font-size:11px;color:#6b6a64;margin-top:3px">CI: ${esc(p.cedula||'—')} · ${esc(p.email||'sin correo')}${th?' · '+esc(th.name):''}${doc?' · Ref: '+esc(doc.name):''}</div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:3px;flex-wrap:wrap">${cajitas}<span style="font-size:11px;color:#6b6a64;margin-left:6px">${nCita} cita${nCita>1?'s':''} este cobro · ${info.sesTotal} totales prescritas</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;margin-left:10px">
          <button class="resumen-btn" style="border-color:rgba(224,168,80,.5);color:#e0a850;font-size:11px;padding:5px 14px;font-weight:600" onclick="emitirFactura(${JSON.stringify(p.id)})">✓ Cobrado</button>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  if(enCurso.length){
    html+=`<div class="full-card"><div class="card-title">Acumulando citas</div>`;
    enCurso.forEach(p=>{
      const info=billingInfo(p);const pend=info.sesPend;const faltan=spf-pend;
      const cajitas=Array.from({length:spf},(_,i)=>`<div style="width:18px;height:18px;border-radius:4px;background:${i<pend?'#1D9E75':'rgba(255,255,255,0.06)'};border:1px solid ${i<pend?'rgba(29,158,117,.4)':'rgba(255,255,255,.06)'};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;color:${i<pend?'#fff':'#333'}">${info.sesYaCobradas+i+1}</div>`).join('');
      html+=`<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(29,158,117,.1)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:#1a1917">${esc(p.name)}<span style="font-size:10px;font-weight:400;color:#5a5a56;margin-left:6px">cobro ${info.cobrosRealizados+1} de ${info.totalCobros}</span></div>
          <div style="font-size:10px;color:#5a5a56;margin-top:2px">CI: ${esc(p.cedula||'—')} · ${esc(p.email||'sin correo')}</div>
          <div style="display:flex;align-items:center;gap:2px;margin-top:7px;flex-wrap:wrap">${cajitas}<span style="font-size:11px;color:#5a5a56;margin-left:8px">Faltan ${faltan}</span></div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:22px;font-weight:700;color:${pend>=spf*0.8?'#e0a850':'#5a5a56'}">${pend}/${spf}</div>
          <div style="font-size:10px;color:#7a7a76">${info.sesTotal} prescritas</div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  if(!paracobrar.length&&!enCurso.length){
    html+=`<div class="full-card" style="text-align:center;padding:32px">
      <div style="font-size:32px;margin-bottom:8px">✓</div>
      <div style="font-size:14px;font-weight:600;color:#1D9E75">Todo al día</div>
      <div style="font-size:12px;color:#5a5a56;margin-top:4px">No hay cobros pendientes en este momento.</div>
    </div>`;
  }
  document.getElementById('facturacion-content').innerHTML=html;
}

export function emitirFactura(patientId) {
  if(!hasPermission('emitirFactura')){toastErr('No tienes permisos para emitir cobros.');return;}
  const p=getPatient(patientId);if(!p||!p.billing)return;
  const n=p.billing.pendientes;
  const fId='F'+(++state.facturaCounter).toString().padStart(3,'0');
  const today=fmtDate(new Date());
  p.billing.facturas.push({id:fId,n,fecha:today,estado:'cobrada'});
  p.billing.pendientes=0;
  updateFacturaBadge(); renderFacturacion();
  dbRegistrarCobro(p.id,n,fId);
  toastOk(`Cobro ${fId} registrado — ${n} sesiones de ${p.name}`);
  simEmailFactura(p.name,p.email||'',fId,n);
}

export function marcarTodosFacturados() {
  if(!hasPermission('emitirFactura')){toastErr('No tienes permisos para emitir cobros.');return;}
  const spf=parseInt(document.getElementById('global-spf').value)||5;
  const paracobrar=state.patients.filter(p=>p.billing&&(p.billing.pendientes>=spf||(p.billing.pendientes>0&&(p.billing.facturas.reduce((s,f)=>s+f.n,0)+p.billing.pendientes)>=p.sessions)));
  paracobrar.forEach(p=>emitirFactura(p.id));
}

export function simEmailFactura(nombre,email,fId='',n=5) {
  const correo=email?`📧 ${email}`:'📧 Sin correo registrado — agrégalo en el perfil';
  alert(`✅ ${nombre} marcado como cobrado\n\nFactura ${fId}  ·  ${n} sesiones\n${correo}\n\n💡 Con backend: genera XML/SRI y envía comprobante automáticamente.`);
}
