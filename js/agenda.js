import { supa } from './supabase-client.js';
import { state } from './state.js';
import { esc, fmtDate, fmtTime, getColor, getTherapist, getPatient, getDoctor, therapistHours, getAvailHours, dotColor, pendientesActual, safeColor, orderedTherapists, startOfWeek,
         apptSlots, slotOf, isAlignedHour, findConflict, compactNoas, occupiedSlots, toTimeInput, parseTimeInput,
         ordinalesDeCitas, ordinalTexto, tipoSesion, TIPO_SESION_DEFAULT,
         citasConciliables, payloadCambioStatus, dmy,
         findBlock, lunchSlots, blockedSlots, getRecDates } from './utils.js';
import { toastOk, toastErr, toastInfo } from './toast.js';
import { dbUpdateApptStatus } from './auth.js';
import { hasPermission, canAccessTab } from './permissions.js';
import { showFieldError, clearFieldError, clearAllErrors } from './validators.js';
import { setCie10Appt } from './cie10.js';
import { setPlanAppt } from './plan.js';
import { openBlockModal } from './bloqueos.js';

// ── Helpers de slots/duración ──
// apptSlots vive en utils.js (puro y testeable); se re-exporta porque informes.js lo consume
// desde acá desde antes de la migración.
export { apptSlots };

// ── Toggles del modal de cita (QuickBooks, "repetir esta cita") ──
// Son <button aria-pressed> y no <input type=checkbox>: el blanco de un checkbox nativo es
// demasiado chico para el dedo (ver .toggle-chip). El estado ES el atributo, así que no hay una
// segunda fuente de verdad que se pueda desincronizar del DOM.
const chipOn  = id => document.getElementById(id)?.getAttribute('aria-pressed')==='true';
const setChip = (id,on) => document.getElementById(id)?.setAttribute('aria-pressed', on?'true':'false');

// Solape por intervalo real, no por slots de media hora: con horas exactas una cita de
// 10:45–11:45 choca con otra de 11:00 aunque no compartan el mismo slot de inicio.
// Devuelve la cita que choca (o null) para poder decir CUÁL en el mensaje: con horas
// arbitrarias, "ya tiene una cita" sin la franja obliga a ir a buscarla a mano.
function conflictsWithExisting(date, thId, startHour, duration, excludeId) {
  return findConflict(state.appointments, { date, therapistId: thId, hour: startHour, duration }, excludeId);
}

// Bloqueo del terapeuta (vacaciones, curso, permiso) que pisa la franja propuesta, o null.
// Se consulta ANTES que el conflicto de citas: una franja bloqueada no está "ocupada por otro
// paciente", directamente no existe como oferta, y el mensaje tiene que decir eso.
function blockedAt(date, thId, startHour, duration) {
  return findBlock(state.blocks, { date, therapistId: thId, hour: startHour, duration });
}

function blockMsg(blk) {
  return `Franja bloqueada: ${blk.motivo||'sin motivo'} (${fmtTime(blk.startH)}–${fmtTime(blk.endH)}).`;
}

// ── Tira compacta de "no asistió" ──
// Alto (y paso del apilado) de la tira, en px. Vive en JS y no en CSS porque la tarjeta activa
// del mismo slot se corre hacia abajo justo esa cantidad: un solo número manda sobre las dos.
const STRIP_H = 16, STRIP_STEP = 18;

// Cita 'no asistió' que comparte franja con otra: como ya no bloquea el slot, cede el espacio y
// se queda en un alto mínimo con el nombre tachado. Sigue siendo clickeable para abrir/editar.
// Va PEGADA al tope de su media hora de inicio: cuando la no-asistió arranca a mitad de una cita
// activa larga (7:30 sobre una de 7:00–8:00), la tira queda como etiqueta superpuesta y opaca
// justo en su fila, sin manchar el texto de la tarjeta de abajo.
function buildNoasStrip(appt, i) {
  const pt=getPatient(appt.patientId);
  const el=document.createElement('div');
  el.className='appt-strip';
  el.style.top=`${i*STRIP_STEP}px`;
  el.style.height=`${STRIP_H}px`;
  const exactTag=isAlignedHour(appt.hour)?'':`<span class="strip-h">${esc(fmtTime(appt.hour))}</span>`;
  el.innerHTML=`${exactTag}<span class="strip-nm">${esc(pt?pt.name:(appt.patientName||'Sin paciente'))}</span>`;
  el.title=`No asistió · ${fmtTime(appt.hour)} — click para abrir la cita`;
  // stopPropagation: el slot que solo tiene tiras queda libre y su click crea una cita nueva.
  el.addEventListener('click',e=>{e.stopPropagation();openEditApptModal(appt.id);});
  return el;
}

// ── Badge "X/N" (ordinal de la cita) ──
// X = número de esta cita en la secuencia del paciente dentro de su episodio actual; N = su plan
// de sesiones (sin plan va solo "X"). Es un dato de agenda: no lo produce ni lo consume
// facturación, que sigue derivando de session_log. El mapa cita→ordinal lo calcula
// ordinalesDeCitas() UNA vez por render; acá solo se pinta. Las 'no asistió' no entran al mapa
// (ni como tarjeta ni como tira): un no-show no consume número.
// Ámbar cuando el ordinal se pasa del plan (11 de 10): el plan no bloquea nada, pero la agenda
// tiene que decirlo sin que haya que abrir la ficha — o se amplía el plan, o es un episodio nuevo.
function ordBadge(ord) {
  if(!ord) return '';
  const over=!!ord.n&&ord.x>ord.n;
  const title=ord.n?`Sesión ${ord.x} de ${ord.n} del episodio${over?' — supera el plan':''}`:`Sesión ${ord.x} del episodio`;
  return `<div class="appt-ord${over?' over':''}" title="${esc(title)}">${esc(ordinalTexto(ord))}</div>`;
}

function conflictMsg(clash) {
  if(!clash) return 'Conflicto: el terapeuta ya tiene una cita en ese horario.';
  const fin=(Number(clash.hour)||0)+(Number(clash.duration)||60)/60;
  const pt=getPatient(clash.patientId);
  return `Conflicto: el terapeuta ya tiene una cita ${fmtTime(clash.hour)}–${fmtTime(fin)}${pt?' ('+pt.name+')':''}.`;
}

export function renderRefLegend() {
  const el=document.getElementById('ref-legend-bar'); if(!el) return;
  const docs=state.doctors.map(d=>`<span class="leg-item"><span class="leg-stripe" style="background:${safeColor(d.color)}"></span>${esc(d.name)}</span>`).join('');
  el.innerHTML=`<span class="leg-item"><span class="leg-tint" style="background:rgba(29,158,117,.3)"></span>Centro</span>`
    +`<span class="leg-item"><span class="leg-tint" style="background:rgba(245,166,35,.35)"></span>Domicilio</span>`
    +(state.doctors.length?`<span style="margin-left:6px">Franja izq. = doctor referente:</span>${docs}`:'');
}

export function updateFacturaBadge() {
  const n=state.patients.filter(p=>p.billing&&pendientesActual(p)>=p.billing.sesPerFactura).length;
  const b=document.getElementById('factura-badge');if(!b)return;
  b.textContent=n; b.style.display=n>0?'':'none';
}

// Aviso "paciente listo para facturar". Se dispara desde las rutas de sesión (saveSession/
// saveSessionManual) SOLO al cruzar el umbral sesPerFactura (no en cada sesión por encima).
export function showBillingAlert(pt) {
  const msg=`🧾 ${pt.name} llegó a ${pt.billing.sesPerFactura} citas — ¡hora de facturar!\n\nCI: ${pt.cedula||'—'}  ·  ${pt.email||'sin correo'}\n\n¿Ir a Facturación ahora?`;
  if(confirm(msg)) window._app.showTab('facturacion');
}

// P-6: cubre también citas de días ANTERIORES que quedaron 'pend' (antes solo procesaba hoy,
// y solo si el día visible era hoy). Las fechas son 'YYYY-MM-DD', comparables como string.
export function checkAutoNoas() {
  const now=new Date();
  const todayStr=fmtDate(now);
  const nowMin=now.getHours()*60+now.getMinutes();
  state.appointments.forEach(a=>{
    if(a.status!=='pend') return;
    if(a.date<todayStr||(a.date===todayStr&&a.hour*60+30<=nowMin)){
      a.status='noas';
      dbUpdateApptStatus(a.id,'noas');
    }
  });
}

export function renderGrid() {
  checkAutoNoas();
  // El botón de bloqueo vive fuera de #agenda-stats (ese span se reescribe entero en cada render)
  // y se resuelve acá arriba: vale para las tres vistas, incluida la de mes que retorna antes.
  const btnBlk=document.getElementById('btn-bloqueo');
  if(btnBlk) btnBlk.style.display=hasPermission('manageBlocks')?'':'none';

  // Punto de entrada ÚNICO de re-render de la agenda (lo usan realtime, navegación y showTab):
  // despacha a la vista activa para que todas se refresquen en vivo.
  const view = state.agendaView || 'day';
  if(view === 'week'){ renderWeekView(); return; }
  if(view === 'month'){ renderMonthView(); return; }

  const wrap = document.querySelector('#tab-agenda .grid-wrap');
  if(!wrap) return;
  if(!document.getElementById('schedule-grid')) wrap.innerHTML = '<div class="schedule-grid" id="schedule-grid"></div>';
  const g = document.getElementById('schedule-grid');
  if(!g) return;

  const ds=fmtDate(state.currentDate);
  const dn=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('day-lbl').textContent=`${dn[state.currentDate.getDay()]}, ${state.currentDate.getDate()} de ${mn[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;

  populateThFilter();
  const filterTh = state.agendaTherapistFilter || null;
  const allTh = orderedTherapists();
  const visTherapists = filterTh ? allTh.filter(t => t.id === filterTh) : allTh;

  const ta=state.appointments.filter(a=>a.date===ds);
  const visTa=ta.filter(a=>visTherapists.some(t=>t.id===a.therapistId));
  const conf=ta.filter(a=>a.status==='conf').length;
  const pend=ta.filter(a=>a.status==='pend').length;
  const noas=ta.filter(a=>a.status==='noas').length;
  // Capacidad REAL del día: el turno menos el almuerzo (regla) menos lo bloqueado (excepción).
  // Sin esto la barra ofrecía slots libres que el terapeuta no puede atender.
  const totalSlots=visTherapists.reduce((s,t)=>s+Math.max(0,therapistHours(t).length-lunchSlots(t)-blockedSlots(t,ds,state.blocks)),0);
  // Las no-asistió no restan: su franja se puede volver a agendar (mismo criterio que el conflicto).
  const occupied=occupiedSlots(visTa);
  const libres=Math.max(0,totalSlots-occupied);

  // Conciliación QuickBooks del día. Se calcula sobre `ta` (TODAS las citas del día) y no sobre
  // `visTa`: el filtro por terapeuta es una lente de la grilla, no un recorte de lo que se pasa a
  // QuickBooks — conciliar filtrado dejaría medio día sin conciliar sin que se note.
  const porConciliar=citasConciliables(ta, ds).length;
  // Solo hacia atrás (hoy incluido): un día futuro no tiene nada que facturar todavía.
  const mostrarQB=hasPermission('conciliarQB') && ds<=fmtDate(new Date()) && conf>0;
  const qbBtn=!mostrarQB?'':(porConciliar>0
    ? `<button id="btn-conciliar" class="btn-conciliar">Conciliar día (${porConciliar})</button>`
    : `<button id="btn-conciliar" class="btn-conciliar" disabled>Día conciliado ✓</button>`);

  const statsEl=document.getElementById('agenda-stats');
  if(statsEl) statsEl.innerHTML=`
    <span class="count-pill"><b>${ta.length}</b>&nbsp;cita${ta.length!==1?'s':''} hoy · ${libres} slots libres</span>
    <span class="count-item" style="color:#17865f"><span class="count-dot" style="background:#1D9E75"></span>${conf} confirmada${conf!==1?'s':''}</span>
    <span class="count-item" style="color:#BA7517"><span class="count-dot" style="background:#E0A850"></span>${pend} pendiente${pend!==1?'s':''}</span>
    <span class="count-item" style="color:#c33a3a"><span class="count-dot" style="background:#E24B4A"></span>${noas} no asistió</span>${qbBtn}`;
  // addEventListener y no onclick inline: hay CSP y el atributo no ejecutaría.
  if(mostrarQB&&porConciliar>0) document.getElementById('btn-conciliar')?.addEventListener('click',()=>conciliarDia(ds));

  // Filas: unión de horarios de los terapeutas visibles + horas de citas del día.
  // NUEVO 2: las citas fuera del horario son válidas y deben verse SIEMPRE.
  const hourSet=new Set(getAvailHours(visTherapists));
  visTa.forEach(a=>apptSlots(a).forEach(s=>{if(s>=0&&s<24)hourSet.add(s);}));
  let vh=[...hourSet].sort((a,b)=>a-b);
  if(vh.length){const min=vh[0],max=vh[vh.length-1];vh=[];for(let h=min;h<=max;h+=0.5)vh.push(+h.toFixed(1));}

  g.innerHTML=''; g.style.gridTemplateColumns=`60px repeat(${visTherapists.length},1fr)`;
  // --th-count deja que responsive.css calcule el min-width real de la grilla en móvil
  // (columnas de ancho usable en vez de un 600px fijo que aplasta a 4+ terapeutas).
  g.style.setProperty('--th-count', visTherapists.length);

  const eh=document.createElement('div');eh.className='grid-header';eh.textContent='Hora';g.appendChild(eh);
  visTherapists.forEach(th=>{
    const c=getColor(th.colorId);
    const h=document.createElement('div');h.className='th-header';
    h.innerHTML=`<div class="avatar" style="background:${c.bg};color:${c.text}">${esc(th.initials)}</div><div><div class="th-nm">${esc(th.name)}</div><div class="th-sp">${fmtTime(th.startH)}–${fmtTime(th.endH)}</div></div>`;
    g.appendChild(h);
  });

  // Reparto de la franja: una 'no asistió' ya no bloquea el slot, así que puede convivir con otra
  // cita. Se calcula por COLUMNA (terapeuta) porque el solape es siempre por terapeuta y día.
  const compactSet = new Set();
  visTherapists.forEach(t => {
    compactNoas(visTa.filter(a => a.therapistId === t.id)).forEach(a => compactSet.add(a));
  });

  // Ordinal "X/N" de cada tarjeta: una sola pasada sobre TODAS las citas (el universo es la
  // secuencia completa del paciente, no las del día visible), no una por tarjeta.
  const ordMap = ordinalesDeCitas(state.appointments, getPatient);

  // Build set of tail slots (slots beyond the first covered by multi-slot appts).
  // Las tiras compactas ocupan SOLO su franja: no dejan cola, y sus medias horas siguientes
  // quedan libres de verdad (clickeables y sin tapar la cita activa que empiece ahí).
  const tailSet = new Set();
  visTa.forEach(a => {
    if(compactSet.has(a)) return;
    apptSlots(a).slice(1).forEach(s => tailSet.add(`${a.therapistId}:${s}`));
  });

  vh.forEach(hr=>{
    const tc=document.createElement('div');tc.className='time-cell'+(hr%1===0.5?' half-hour':'');tc.textContent=fmtTime(hr);g.appendChild(tc);
    visTherapists.forEach(th=>{
      const key=`${th.id}:${+hr.toFixed(1)}`;

      // Fuera de horario NO se distingue visualmente (decisión 2026-08): todos los slots se ven
      // y comportan igual — cualquier franja acepta citas (click, drop y render).
      // Horas exactas: la cita se dibuja en el slot de su media hora CONTENEDORA (10:45 → fila 10:30).
      const enFranja=visTa.filter(a=>a.therapistId===th.id&&slotOf(a.hour)===hr);
      const strips=enFranja.filter(a=>compactSet.has(a));
      // Una sola tarjeta normal por franja, como siempre: la no-asistió que cede va en tira.
      const appt=enFranja.find(a=>!compactSet.has(a))||null;
      // ¿La tarjeta de una cita vecina que abarca varias franjas pisa este slot?
      const covered=tailSet.has(key);

      const slot=document.createElement('div');

      if(covered&&!enFranja.length){
        slot.className='slot slot-tail';
        g.appendChild(slot);
        return;
      }

      // ── Franja bloqueada ──
      // Gris rayada, sin listener de creación: no se agenda ahí. La CITA siempre manda: si por lo
      // que sea ya hay una en la franja (o la cola de una vecina), se dibuja la cita — el bloqueo
      // no puede tapar un dato real. Las tiras de "no asistió" sí se siguen viendo encima: ya no
      // ocupan el slot, así que conviven con el bloqueo.
      const blk=(!appt&&!covered)?findBlock(state.blocks,{date:ds,therapistId:th.id,hour:hr,duration:30}):null;
      if(blk){
        const editable=hasPermission('manageBlocks');
        slot.className='slot slot-block'+(editable?' editable':'');
        // El motivo se escribe UNA vez, en el slot que contiene la hora de inicio: repetirlo en
        // cada media hora convertiría un bloqueo de mañana entera en una columna de texto.
        if(slotOf(blk.startH)===hr) slot.innerHTML=`<span class="blk-lbl">${esc(blk.motivo||'Bloqueado')}</span>`;
        slot.title=`${blk.motivo||'Bloqueado'} · ${fmtTime(blk.startH)}–${fmtTime(blk.endH)}${editable?' — click para editar':''}`;
        strips.forEach((na,i)=>slot.appendChild(buildNoasStrip(na,i)));
        if(editable) slot.addEventListener('click',()=>openBlockModal(th.id,ds,blk.id));
        g.appendChild(slot);
        return;
      }

      // Pisado por esa tarjeta pero con tiras que mostrar (una no-asistió de 7:30 sobre una cita
      // de 7:00–8:00): el slot no puede pintar fondo ni quedarse el click — esos píxeles son de
      // la tarjeta de abajo. Solo flota la tira. Si no lo pisa nadie, con tiras sigue 'avail':
      // se puede agendar encima de una no-asistió.
      const stripOver=covered&&!appt;
      slot.className='slot'+(stripOver?' slot-strip-over':(!appt?' avail':''));

      slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('drag-over')});
      slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
      slot.addEventListener('drop',async e=>{
        e.preventDefault();slot.classList.remove('drag-over');
        if(state.dragData!=null){
          const a=state.appointments.find(x=>x.id===state.dragData);
          if(a){
            // El slot bloqueado no tiene listener de drop, pero una cita larga soltada en un
            // slot libre puede meterse en el bloqueo de al lado: se revisa el intervalo entero.
            const blkDrop=blockedAt(a.date,th.id,hr,a.duration||60);
            const clash=blkDrop?null:conflictsWithExisting(a.date,th.id,hr,a.duration||60,a.id);
            if(blkDrop) toastErr(blockMsg(blkDrop));
            else if(!clash){
              // Soltar en un slot re-alinea la cita a la media hora del slot (10:45 → 10:30):
              // el destino del gesto es la fila, y así lo que se ve es lo que queda guardado.
              const prev={therapistId:a.therapistId,hour:a.hour};
              a.therapistId=th.id;a.hour=hr;renderGrid();
              // Reubicación: commit solo persiste la nueva posición de la fila.
              const ok=await commitApptChange(a, {hour:hr, therapist_id:th.id});
              // Si la base no aceptó el UPDATE, la cita vuelve a donde estaba: lo que se ve en
              // la grilla no puede quedar por delante de lo que hay guardado.
              if(!ok){Object.assign(a,prev);renderGrid();}
            } else toastErr(conflictMsg(clash));
          }
        }
        state.dragData=null;
      });
      if(!appt&&!stripOver){
        slot.addEventListener('click',()=>openApptModalAt(th.id,hr));
      }
      strips.forEach((na,i)=>slot.appendChild(buildNoasStrip(na,i)));
      if(appt){
        const dur=appt.duration||60;
        // Alto en slots = los que realmente ocupa (una de 10:45+60min pisa 10:30, 11:00 y 11:30).
        const spans=apptSlots(appt).length;
        const pt=getPatient(appt.patientId);
        const card=document.createElement('div');
        let sc='';if(appt.status==='pend')sc=' status-pend';else if(appt.status==='noas')sc=' status-noas';
        // Ya pasada a QuickBooks: la tarjeta se apaga (trabajo administrativo cerrado). El punto
        // de estado NO se toca: sigue diciendo el estado clínico.
        if(appt.qbAt)sc+=' appt-qb';
        // Tinte de fondo por MODALIDAD (centro verde / domicilio naranja); el ESTADO pisa el
        // tinte cuando aplica (reglas .status-* posteriores en CSS).
        const locCls=appt.location==='domicilio'?'loc-domicilio':'loc-centro';
        card.className=`appt ${locCls}${sc}`;
        card.draggable=true;
        const doc=pt&&pt.doctorId?getDoctor(pt.doctorId):null;
        card.style.borderLeftColor=doc?doc.color:'rgba(0,0,0,.1)';
        const qbTag=appt.qbAt?' · QB ✓':'';
        if(doc) card.title=`Ref: ${doc.name} (${doc.spec})${appt.status==='conf'?' · Doble click para registrar sesión':''}${qbTag}`;
        else if(appt.qbAt) card.title='Pasada a QuickBooks ✓';
        const durLabel=dur!==60?` · ${dur}min`:'';
        const canDel=hasPermission('deleteAppt');
        // La cita no alineada se dibuja en la fila de su media hora: sin la hora exacta en la
        // tarjeta, un 10:45 se leería como 10:30.
        const exactTag=isAlignedHour(appt.hour)?'':`<span class="appt-exact">${esc(fmtTime(appt.hour))}</span>`;
        // La no-asistió que ocupa sola su franja se ve entera, pero la franja ya está libre: el "+"
        // agenda ahí mismo sin tener que borrarla ni buscar el hueco a mano.
        const canAdd=appt.status==='noas'&&hasPermission('createAppt');
        if(canAdd) card.classList.add('has-add');
        const ord=ordMap.get(appt)||null;
        if(ord) card.classList.add('has-ord');
        // El subtítulo ya trunca con ellipsis (.appt-sub en screens.css) y en las columnas
        // angostas 'Terapia respiratoria' no entra entero: el title deja leerlo al pasar el mouse
        // sin robarle ancho a la tarjeta. Va en el div, no en la card: la card ya usa su title
        // para el médico referente.
        const subTxt=`${appt.type||''}${durLabel}${appt.status==='pend'?' · por confirmar':''}`;
        card.innerHTML=`<div class="appt-name">${exactTag}${esc(pt?pt.name:(appt.patientName||'Sin paciente'))}</div><div class="appt-sub" title="${esc(subTxt)}">${esc(appt.type)}${durLabel}${appt.status==='pend'?' · por confirmar':''}</div><div class="appt-dot" style="background:${dotColor(appt.status)}" title="Estado: ${esc(appt.status)} — click para cambiar"></div>${canDel?'<div class="appt-del">×</div>':''}${canAdd?'<div class="appt-add" title="Agendar otra cita en esta franja">+</div>':''}${ordBadge(ord)}`;
        card.style.cursor='pointer';
        card.addEventListener('click',e=>{if(!e.target.classList.contains('appt-dot')&&!e.target.classList.contains('appt-del')&&!e.target.classList.contains('appt-add')){e.stopPropagation();openEditApptModal(appt.id);}});
        card.querySelector('.appt-dot').addEventListener('click',e=>{e.stopPropagation();cycleStatus(appt.id);});
        if(canDel) card.querySelector('.appt-del').addEventListener('click',e=>{e.stopPropagation();delAppt(appt.id,e);});
        if(canAdd) card.querySelector('.appt-add').addEventListener('click',e=>{e.stopPropagation();openApptModalAt(th.id,hr,ds);});
        card.addEventListener('dragstart',()=>{state.dragData=appt.id});
        card.addEventListener('dblclick',e=>{
          e.stopPropagation();
          if(appt.status==='conf') window._app.openSessionModal(appt);
          else if(appt.patientId){
            window._app.showTab('paciente_rpt');
            setTimeout(()=>{
              const sel=document.getElementById('patient-rpt-select');
              if(sel){sel.value=String(appt.patientId);window._app.updateEpisodes();}
            },100);
          }
        });
        // Con tiras en SU franja, la tarjeta arranca debajo de ellas para no taparlas. En una sola
        // franja el alto restante ya no da para el subtítulo: se queda con nombre y estado.
        const off=strips.length*STRIP_STEP;
        const cardTop=off||3;
        if(off){
          card.style.top=`${off}px`;
          if(spans===1) card.classList.add('appt-squeezed');
        }
        if(spans>1){
          slot.style.zIndex='2';
          card.style.bottom='auto';
          card.style.height=`calc(${spans} * 46px - ${cardTop+3}px)`;
        }
        slot.appendChild(card);
      }
      g.appendChild(slot);
    });
  });
  renderRefLegend();
  window._app?.updateResumenBadge();
}

// ¿Es un id real de DB? Excluye numéricos optimistas Y los 'rec-' (M2: no matchean ninguna fila).
const esRealApptId = id => typeof id === 'string' && !id.startsWith('rec-');

// ÚNICO punto de cambio de una cita: persiste los campos dados en la fila (solo ids reales).
// done/billing NO se tocan aquí: derivan de session_log vía doneActual/pendientesActual.
async function commitApptChange(appt, dbFields) {
  if (!esRealApptId(appt.id)) return true;   // numéricos optimistas / 'rec-': solo memoria
  try {
    // .select('id'): un UPDATE bloqueado por RLS vuelve con 0 filas y error:null. Sin contar las
    // filas afectadas, un cambio que la base rechazó se reportaría como guardado.
    const { data, error } = await supa.from('appointments').update(dbFields).eq('id', appt.id).select('id');
    if (error) { toastErr('No se pudo guardar el cambio de la cita: ' + error.message); return false; }
    if (!data || !data.length) { toastErr('No se pudo guardar (sin permiso o la cita ya no existe). Refrescá la página.'); return false; }
  } catch (e) { toastErr('Error de conexión al guardar el cambio de la cita.'); return false; }
  return true;
}

export async function cycleStatus(id) {
  const a=state.appointments.find(x=>x.id===id);if(!a)return;
  const prev={status:a.status,qbAt:a.qbAt};
  const c=['conf','pend','noas'];
  a.status=c[(c.indexOf(a.status)+1)%3];
  // El ciclo es CLÍNICO: QuickBooks no participa (no hay un cuarto estado "conciliada"). Lo único
  // que arrastra es la baja: al salir de 'conf' la cita se desconcilia, porque lo que no es
  // asistencia no puede quedar pasado a QuickBooks.
  if(a.status!=='conf') a.qbAt=null;
  renderGrid(); window._app.updateResumenBadge(); updateFacturaBadge();
  const ok=await commitApptChange(a, payloadCambioStatus(a.status));   // solo persiste la fila
  if(!ok){Object.assign(a,prev);renderGrid();window._app.updateResumenBadge();updateFacturaBadge();}
}

// ── Conciliación QuickBooks de un día ──
// Marca en UNA sola query todas las confirmadas del día que aún no se pasaron a QuickBooks. El
// filtro va en la query (date + status + qb_at is null) y no en una lista de ids: así una cita
// creada por otro usuario entre el render y el click también queda conciliada, y repetir la
// acción es inocuo.
export async function conciliarDia(ds) {
  if(!hasPermission('conciliarQB')){toastErr('No tienes permisos para conciliar con QuickBooks.');return;}
  const pendientes=citasConciliables(state.appointments, ds);
  if(!pendientes.length){toastInfo('No hay citas confirmadas pendientes de conciliar en este día.');return;}
  const n=pendientes.length;
  if(!confirm(`¿Marcar ${n} cita${n!==1?'s':''} confirmada${n!==1?'s':''} del ${dmy(ds)} como pasada${n!==1?'s':''} a QuickBooks?`)) return;

  const nowIso=new Date().toISOString();
  // Ids optimistas (numéricos / 'rec-') no existen como fila: el UPDATE no las alcanza, así que
  // tampoco se marcan en memoria — la grilla no puede mostrar un ✓ que la DB no tiene.
  const tocadas=pendientes.filter(a=>esRealApptId(a.id));
  tocadas.forEach(a=>{a.qbAt=nowIso;});
  renderGrid();

  const revertir=()=>{tocadas.forEach(a=>{a.qbAt=null;});renderGrid();};
  try {
    const {error}=await supa.from('appointments').update({qb_at:nowIso})
      .eq('date',ds).eq('status','conf').is('qb_at',null);
    if(error){revertir();toastErr('No se pudo conciliar el día: '+error.message);return;}
  } catch(e){
    revertir();toastErr('Error de conexión al conciliar el día.');return;
  }
  const m=tocadas.length;
  toastOk(`${m} cita${m!==1?'s':''} pasada${m!==1?'s':''} a QuickBooks`);
}

export async function delAppt(id,e) {
  if(e) e.stopPropagation();
  if(!hasPermission('deleteAppt')){toastErr('No tienes permisos para eliminar citas.');return;}
  if(!confirm('¿Eliminar esta cita?')) return;
  // Eliminar la cita NO altera done/billing: esos derivan de session_log (la fila clínica, si existe, persiste).
  state.appointments=state.appointments.filter(a=>a.id!==id);
  renderGrid(); updateFacturaBadge();
  if(esRealApptId(id)){
    const {error}=await supa.from('appointments').delete().eq('id',id);
    if(error) toastErr('Error al eliminar cita: '+error.message);
    else toastOk('Cita eliminada');
  }
}

export function openDatePicker() {
  const inp=document.getElementById('date-picker-input');
  inp.value=fmtDate(state.currentDate);
  inp.style.pointerEvents='auto';
  inp.showPicker?inp.showPicker():inp.click();
  setTimeout(()=>inp.style.pointerEvents='none',500);
}

export function goToDate(ds) {
  if(!ds) return;
  const parts=ds.split('-');
  state.currentDate=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  renderGrid();
}

export function goToToday() {
  state.currentDate=new Date();
  renderGrid();
}

export function changeDay(d) {
  const view = state.agendaView || 'day';
  if(view === 'week') state.currentDate.setDate(state.currentDate.getDate() + d * 7);
  else if(view === 'month') state.currentDate.setMonth(state.currentDate.getMonth() + d);
  else state.currentDate.setDate(state.currentDate.getDate() + d);
  renderGrid();
}

// Atajos del modal de cita al paciente ("Ver informe" e "Historial de citas"). El id y el [hidden]
// van en el CONTENEDOR #appt-shortcuts y no en cada botón: así los dos leen el mismo paciente y no
// pueden quedar desincronizados. Se guarda acá y no se lee #m-patient porque el usuario puede haber
// tocado el buscador de paciente antes de saltar.
function setApptRptShortcut(patientId) {
  const box = document.getElementById('appt-shortcuts');
  if (!box) return;
  const pid = patientId ? String(patientId) : '';
  box.dataset.pid = pid;
  box.hidden = !pid;
}

function _pidDeCitaAbierta() {
  return document.getElementById('appt-shortcuts')?.dataset.pid || '';
}

export function verInformeDeCita() {
  const pid = _pidDeCitaAbierta();
  if (!pid) return;
  if (!canAccessTab('paciente_rpt')) { toastErr('No tienes permisos para acceder a esta sección'); return; }
  window._app.closeModal('appt-modal');
  // showTab primero: al entrar a paciente_rpt se ejecuta renderPatientReportSelect(), que
  // resetea la selección al primer paciente. Seleccionar después es lo que la conserva.
  window._app.showTab('paciente_rpt');
  window._app.selectRptPatient(pid);
}

// Historial de citas del paciente de esta cita. A diferencia del informe no hace falta seleccionar
// después: irAHistorial deja el paciente en el state ANTES de mostrar la pestaña, y el permiso lo
// chequea ella (puerta única, js/historial.js).
export function verHistorialDeCita() {
  const pid = _pidDeCitaAbierta();
  if (!pid) return;
  window._app.closeModal('appt-modal');
  // Vía window._app y no por import directo: agenda.js ya es importado por informes.js, e importar
  // historial.js (que importa informes.js) cerraría un ciclo de módulos por una sola llamada.
  window._app.irAHistorial(pid);
}

// Los toggles son botones, así que su estado lo invierte JS. Se cablean UNA vez (el markup del
// modal es estático en index.html) y no en cada apertura: si no, cada open sumaría un listener
// más y un click terminaría alternando el chip N veces. Se llama desde las DOS puertas del modal
// —_openApptModalBase (crear) y openEditApptModal (editar), que no pasa por la primera—: quien
// solo abre citas existentes también tiene que poder tocar el chip de QuickBooks.
let _chipsWired=false;
function _wireApptChips() {
  if(_chipsWired) return;
  _chipsWired=true;
  document.getElementById('m-recurrente')?.addEventListener('click',()=>toggleRecurrencia());
  document.getElementById('m-qb')?.addEventListener('click',()=>setChip('m-qb',!chipOn('m-qb')));
}

function _openApptModalBase() {
  _wireApptChips();
  document.getElementById('m-therapist').innerHTML=orderedTherapists().map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${fmtTime(t.startH)}-${fmtTime(t.endH)})</option>`).join('');
  updateTimeSlots();
  document.getElementById('appt-modal').classList.add('open');
}

export function openApptModalAt(thId, hr, ds) {
  openApptModal();
  setTimeout(()=>{
    if(ds){const de=document.getElementById('m-date');if(de) de.value=ds;}
    const thSel=document.getElementById('m-therapist');
    if(thSel){thSel.value=String(thId);updateTimeSlots();}
    // hr viene de un slot de la grilla, siempre alineado → modo select.
    setHoraExacta(false, hr);
  },0);
}

export function openApptModal() {
  if(!state.therapists.length){toastErr('Primero agrega al menos un terapeuta.');window._app.showTab('terapeutas');return;}
  if(!state.patients.length){toastErr('Primero agrega al menos un paciente.');window._app.showTab('pacientes');return;}
  clearAllErrors(['m-date','m-patient-search','m-therapist','m-time','m-time-exact']);
  document.getElementById('m-editing-id').value='';
  document.getElementById('appt-modal-title').textContent='Nueva cita';
  document.getElementById('appt-modal-save-btn').textContent='Guardar cita';
  document.getElementById('appt-modal-del-btn').style.display='none';
  document.getElementById('m-date').value=fmtDate(state.currentDate);
  document.getElementById('m-patient-search').value='';
  document.getElementById('m-patient').value='';
  const durSel=document.getElementById('m-duration');
  if(durSel) durSel.value='60';
  const locSel=document.getElementById('m-location');
  if(locSel) locSel.value='centro';
  document.getElementById('m-note').value='';
  // "Nueva cita" arranca SIEMPRE en el default: sin este reset el select se queda con el tipo de
  // la última cita editada y una respiratoria se propagaría sola a la siguiente que se agende.
  document.getElementById('m-type').value=TIPO_SESION_DEFAULT;
  document.getElementById('m-status').value='conf';
  // Una cita que todavía no existe no puede estar conciliada: el toggle QB no se ofrece al crear.
  const qbNew=document.getElementById('m-qb');
  if(qbNew) qbNew.hidden=true;
  setChip('m-qb',false);
  setChip('m-recurrente',false);
  document.getElementById('recurrencia-panel').style.display='none';
  setApptRptShortcut(null);
  setCie10Appt(null);   // "Nueva cita": el CIE-10 se carga desde la ficha, no al agendar
  setPlanAppt(null);    // idem el plan: sin cita guardada todavía no hay paciente del que hablar
  filterApptPatient();
  _openApptModalBase();
  setHoraExacta(false);   // crear siempre arranca en el select de medias horas
}

export function openEditApptModal(id) {
  const a=state.appointments.find(x=>x.id===id);
  if(!a){toastErr('Cita no encontrada.');return;}
  _wireApptChips();
  clearAllErrors(['m-date','m-patient-search','m-therapist','m-time','m-time-exact']);
  const pt=getPatient(a.patientId);
  document.getElementById('m-editing-id').value=String(id);
  document.getElementById('appt-modal-title').textContent='Editar cita';
  document.getElementById('appt-modal-save-btn').textContent='Guardar cambios';
  const canDel=hasPermission('deleteAppt');
  document.getElementById('appt-modal-del-btn').style.display=canDel?'':'none';
  document.getElementById('m-date').value=a.date;
  document.getElementById('m-patient-search').value=pt?pt.name:(a.patientName||'');
  document.getElementById('m-patient').value=String(a.patientId||'');
  const durSel=document.getElementById('m-duration');
  if(durSel) durSel.value=String(a.duration||60);
  const locSel=document.getElementById('m-location');
  if(locSel) locSel.value=a.location||'centro';
  document.getElementById('m-note').value=a.note||'';
  document.getElementById('m-status').value=a.status||'conf';
  // El toggle QB solo aparece para quien factura y solo sobre una cita CONFIRMADA: es la única
  // que se concilia. Su visibilidad al abrir es lo que saveAppt lee para saber si tocar qb_at.
  const qbEl=document.getElementById('m-qb');
  if(qbEl) qbEl.hidden=!(hasPermission('conciliarQB')&&a.status==='conf');
  setChip('m-qb', !!a.qbAt);
  setChip('m-recurrente',false);
  document.getElementById('recurrencia-panel').style.display='none';
  setApptRptShortcut(pt ? a.patientId : null);
  setCie10Appt(pt ? a.patientId : null);   // dato del paciente: sin paciente, no hay sección
  setPlanAppt(pt ? a.patientId : null);
  filterApptPatient();
  document.getElementById('m-therapist').innerHTML=orderedTherapists().map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${fmtTime(t.startH)}-${fmtTime(t.endH)})</option>`).join('');
  document.getElementById('m-therapist').value=String(a.therapistId);
  // tipoSesion(): un tipo que ya no está en el select (o vacío) dejaría el campo en blanco.
  document.getElementById('m-type').value=tipoSesion(a.type);
  updateTimeSlots();
  // Una cita fuera de :00/:30 no existe como opción del select: abre directo en modo exacto.
  setHoraExacta(!isAlignedHour(a.hour), a.hour);
  document.getElementById('appt-modal').classList.add('open');
}

export function updateTimeSlots() {
  const th=getTherapist(document.getElementById('m-therapist').value);
  if(!th) return;
  const opts=[];for(let h=6;h<=20;h+=0.5) opts.push(`<option value="${h}">${fmtTime(h)}</option>`);
  document.getElementById('m-time').innerHTML=opts.join('');
  document.getElementById('m-time').value=th.startH||7;
}

// ── Hora exacta: el select de medias horas y el <input type="time"> son EXCLUYENTES ──
// El select cubre el 99% de los casos (y evita tipear); el input existe para la cita que
// realmente empieza 10:45. Cuál está activo lo dice el checkbox, y de ahí lee saveAppt.
export function setHoraExacta(on, hourValue) {
  const chk=document.getElementById('m-time-exact-tgl');
  const sel=document.getElementById('m-time');
  const inp=document.getElementById('m-time-exact');
  if(!sel||!inp) return;
  if(chk) chk.checked=!!on;
  // display explícito además de [hidden]: si alguna regla futura le diera display al campo,
  // el atributo solo no alcanzaría para ocultarlo.
  sel.hidden=!!on;  sel.style.display=on?'none':'';
  inp.hidden=!on;   inp.style.display=on?'':'none';
  if(on){
    const h=hourValue!=null?hourValue:parseFloat(sel.value);
    inp.value=toTimeInput(isNaN(h)?7:h);
  } else if(hourValue!=null){
    sel.value=String(hourValue);
  } else {
    // Al volver al select se cae a la media hora contenedora de lo que había en el input
    // (10:45 → 10:30): así no se guarda en silencio una hora distinta de la que se ve.
    const h=parseTimeInput(inp.value);
    if(h!=null){
      const snap=slotOf(h);
      if([...sel.options].some(o=>parseFloat(o.value)===snap)) sel.value=String(snap);
    }
  }
  clearFieldError('m-time'); clearFieldError('m-time-exact');
}

// Handler del checkbox (onchange en el HTML).
export function toggleHoraExacta(on) {
  setHoraExacta(!!on);
}

// Hora que se va a guardar, leída del control ACTIVO. NaN si el input exacto está vacío/inválido.
function readApptHour() {
  if(document.getElementById('m-time-exact-tgl')?.checked){
    const h=parseTimeInput(document.getElementById('m-time-exact').value);
    return h==null?NaN:h;
  }
  return parseFloat(document.getElementById('m-time').value);
}

// Id del control de hora visible: los errores tienen que pintarse sobre el que ve el usuario.
function apptHourFieldId() {
  return document.getElementById('m-time-exact-tgl')?.checked ? 'm-time-exact' : 'm-time';
}

export function filterApptPatient() {
  const q=(document.getElementById('m-patient-search').value||'').toLowerCase();
  const dl=document.getElementById('m-patient-list');
  const match=state.patients.filter(p=>p.name.toLowerCase().includes(q)||(p.cedula&&p.cedula.includes(q)));
  dl.innerHTML=match.slice(0,10).map(p=>`<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}${p.cedula?' · '+esc(p.cedula):''}</option>`).join('');
  const exact=state.patients.find(p=>p.name.toLowerCase()===q);
  if(exact) document.getElementById('m-patient').value=exact.id;
  else {
    const opt=[...dl.options].find(o=>o.value===document.getElementById('m-patient-search').value);
    if(opt) document.getElementById('m-patient').value=opt.getAttribute('data-id')||'';
  }
}

export async function saveAppt() {
  const editingId=document.getElementById('m-editing-id').value;
  const isEdit=!!editingId;

  if(!isEdit&&!hasPermission('createAppt')){toastErr('No tienes permisos para crear citas.');return;}
  clearAllErrors(['m-date','m-patient-search','m-therapist','m-time','m-time-exact']);
  const thId=document.getElementById('m-therapist').value;
  const hr=readApptHour();
  const dur=parseInt(document.getElementById('m-duration')?.value||'60');
  const loc=document.getElementById('m-location')?.value==='domicilio'?'domicilio':'centro';
  let patId=document.getElementById('m-patient').value;
  if(!thId){showFieldError('m-therapist','Selecciona un terapeuta');toastErr('Selecciona un terapeuta.');return;}
  if(!patId){
    const searchVal=document.getElementById('m-patient-search').value.trim().toLowerCase();
    const found=state.patients.find(p=>p.name.toLowerCase()===searchVal);
    if(found){patId=found.id;document.getElementById('m-patient').value=found.id;}
    else{showFieldError('m-patient-search','Selecciona un paciente de la lista');toastErr('Selecciona un paciente de la lista.');return;}
  }
  if(isNaN(hr)||hr<0||hr>24){showFieldError(apptHourFieldId(),'Selecciona una hora válida');toastErr('Selecciona una hora válida.');return;}
  const dateVal=document.getElementById('m-date').value;
  if(!dateVal){showFieldError('m-date','Elegí la fecha de la cita');toastErr('Elegí la fecha de la cita.');return;}
  const ds=dateVal;
  const excludeId=isEdit?editingId:null;
  // El bloqueo se consulta primero: si la franja no existe como oferta, decir "el terapeuta ya
  // tiene una cita" sería mentira y mandaría a buscar una cita que no está.
  const blk=blockedAt(ds,thId,hr,dur);
  if(blk){toastErr(blockMsg(blk));return;}
  const clash=conflictsWithExisting(ds,thId,hr,dur,excludeId);
  if(clash){toastErr(conflictMsg(clash));return;}

  if(isEdit){
    const existing=state.appointments.find(a=>String(a.id)===editingId);
    if(!existing){toastErr('Cita no encontrada.');return;}
    const today=fmtDate(new Date());
    // Registro retroactivo: admin/secretaria pueden mover a días pasados (apptPastDate).
    if(ds<today && ds!==existing.date && !hasPermission('apptPastDate')){toastErr('No se pueden mover citas a días pasados.');return;}
    const prev={...existing};
    existing.therapistId=thId;existing.hour=hr;existing.duration=dur;existing.location=loc;
    existing.patientId=patId;existing.type=document.getElementById('m-type').value;
    existing.status=document.getElementById('m-status').value;existing.note=document.getElementById('m-note').value;existing.date=ds;
    const dbFields={
      date:ds,therapist_id:thId,patient_id:patId,hour:hr,duration:dur,
      type:existing.type,status:existing.status,note:existing.note||'',location:loc
    };
    // Invariante, SIEMPRE (aunque el rol no vea la casilla): si el estado nuevo no es 'conf', la
    // cita se desconcilia — un terapeuta puede pasar a 'pend' una cita ya conciliada.
    Object.assign(dbFields, payloadCambioStatus(existing.status));
    if(existing.status!=='conf') existing.qbAt=null;
    // El toggle solo se lee si estaba a la vista (permiso + cita confirmada al abrir el modal).
    // Marcar una ya conciliada conserva su fecha original: no se re-timbra sin motivo.
    const qbEd=document.getElementById('m-qb');
    if(qbEd&&!qbEd.hidden&&existing.status==='conf'){
      existing.qbAt=chipOn('m-qb')?(existing.qbAt||new Date().toISOString()):null;
      dbFields.qb_at=existing.qbAt;
    }
    window._app.closeModal('appt-modal'); renderGrid();
    const ok=await commitApptChange(existing, dbFields);
    if(ok) toastOk('Cita actualizada');
    else {Object.assign(existing,prev);renderGrid();}
    updateFacturaBadge();
    return;
  }

  const today=fmtDate(new Date());
  // Registro retroactivo: admin/secretaria pueden agendar en días pasados (apptPastDate).
  if(ds<today && !hasPermission('apptPastDate')){toastErr('No se pueden agendar citas en días pasados.');return;}
  const _a={id:++state.apptCounter,date:ds,therapistId:thId,hour:hr,duration:dur,location:loc,patientId:patId,type:document.getElementById('m-type').value,status:document.getElementById('m-status').value,note:document.getElementById('m-note').value};
  state.appointments.push(_a);
  // La config de recurrencia se lee ANTES de cerrar el modal: leerla después del await del insert
  // base es leer un DOM que ya se cerró (y que openApptModal puede haber reseteado).
  const recOn=chipOn('m-recurrente');
  const recDias=recOn?[...document.querySelectorAll('.rec-day:checked')].map(c=>parseInt(c.value)):[];
  const recSemanas=parseInt(document.getElementById('m-rec-semanas')?.value||'4');
  window._app.closeModal('appt-modal'); renderGrid();
  const tempId=_a.id;
  try {
    const {data,error}=await supa.from('appointments').insert({
      date:_a.date,therapist_id:_a.therapistId,patient_id:_a.patientId,
      hour:_a.hour,duration:_a.duration,type:_a.type,status:_a.status,note:_a.note||'',location:_a.location
    }).select().single();
    if(error){
      // Rollback del push optimista (mismo patrón que emitirFactura): la cita no existe en DB.
      state.appointments=state.appointments.filter(x=>x.id!==_a.id);
      renderGrid();
      toastErr('Error al guardar cita: '+error.message);
    }
    else {
      _a.id=data.id;
      if(recOn&&recDias.length){
        const fechas=getRecDates(_a.date,recDias,recSemanas);
        const filas=[];
        let creadas=0,fallidas=0,omitidas=0,bloqueadas=0;
        for(const fecha of fechas){
          // Las fechas bloqueadas se saltan, pero se cuentan aparte: el toast final tiene que
          // decir cuántas de las pedidas NO se crearon y por qué — si no, la secretaria se
          // queda creyendo que la serie completa quedó agendada.
          if(blockedAt(fecha,_a.therapistId,_a.hour,_a.duration)){bloqueadas++;continue;}
          if(conflictsWithExisting(fecha,_a.therapistId,_a.hour,_a.duration,null)){omitidas++;continue;}
          filas.push({date:fecha,therapist_id:_a.therapistId,patient_id:_a.patientId,hour:_a.hour,duration:_a.duration,type:_a.type,status:'pend',note:_a.note||'',location:_a.location});
        }
        if(filas.length){
          // UN insert en lote (era el único N+1 del repo: hasta 84 awaits secuenciales). El
          // .select() devuelve el UUID REAL de cada fila: antes se inventaba un id 'rec-…' que no
          // matcheaba nada, así que editar o borrar una recurrente no escribía en la base y el eco
          // de realtime la duplicaba en pantalla.
          const {data:recData,error:recErr}=await supa.from('appointments').insert(filas).select('id,date');
          // Un insert en lote es atómico: si falla, no se creó ninguna de las filas.
          if(recErr||!recData){ fallidas=filas.length; }
          else {
            recData.forEach(r=>state.appointments.push({..._a,id:r.id,date:r.date,status:'pend'}));
            creadas=recData.length; fallidas=filas.length-creadas;
          }
        }
        // El toast sale SIEMPRE que se pidió una serie, aunque no se haya creado ninguna: antes,
        // si fallaban todas, la condición era falsa y el único mensaje era "Cita guardada".
        const tot=creadas+1;
        const msg='✓ '+tot+' cita'+(tot!==1?'s':'')+' creada'+(tot!==1?'s':'')+
          (omitidas>0?' · '+omitidas+' omitida'+(omitidas!==1?'s':'')+' por conflicto de horario':'')+
          (bloqueadas>0?' · '+bloqueadas+' bloqueada'+(bloqueadas!==1?'s':''):'')+
          (fallidas>0?' · '+fallidas+' no se '+(fallidas===1?'pudo':'pudieron')+' crear — revisá la agenda':'');
        (fallidas>0?toastErr:toastOk)(msg);
      }
      renderGrid(); toastOk('Cita guardada correctamente');
    }
  } catch(e){
    // Rollback solo si _a sigue con el id temporal: si el insert base ya asignó el UUID real
    // (excepción posterior, p.ej. en el loop de recurrentes), la cita SÍ existe en DB.
    if(_a.id===tempId){
      state.appointments=state.appointments.filter(x=>x.id!==tempId);
      renderGrid();
    }
    toastErr('Error de conexión al guardar cita.');
  }
  updateFacturaBadge();
}

export function agendarCitaParaPaciente(patientId) {
  window._app.showTab('agenda');
  setTimeout(()=>{
    openApptModal();
    const p=getPatient(patientId);
    if(p){
      const searchEl=document.getElementById('m-patient-search');
      const hiddenEl=document.getElementById('m-patient');
      if(searchEl) searchEl.value=p.name;
      if(hiddenEl) hiddenEl.value=p.id;
    }
  },200);
}

export function toggleRecurrencia() {
  // El click no cambia el atributo por sí solo (es un <button>, no un checkbox): lo invierte acá,
  // que es el único lugar que lo hace, y el panel se abre según el valor NUEVO.
  const on=!chipOn('m-recurrente');
  setChip('m-recurrente',on);
  document.getElementById('recurrencia-panel').style.display=on?'block':'none';
  if(on) updateRecPreview();
}

export function updateRecPreview() {
  const dias=[...document.querySelectorAll('.rec-day:checked')].map(c=>parseInt(c.value));
  const semanas=parseInt(document.getElementById('m-rec-semanas').value);
  const dateVal=document.getElementById('m-date').value||fmtDate(state.currentDate);
  if(!dias.length){document.getElementById('rec-preview').textContent='Selecciona al menos un día';return;}
  const fechas=getRecDates(dateVal,dias,semanas);
  document.getElementById('rec-preview').textContent=`Se crearán ${fechas.length} citas: ${fechas.slice(0,3).join(', ')}${fechas.length>3?'... y '+(fechas.length-3)+' más':''}`;
}

// getRecDates vive en utils.js (pura y testeable); se re-exporta acá por compatibilidad.
export { getRecDates };

// ── Modos de vista ──

function populateThFilter() {
  const sel = document.getElementById('agenda-th-filter');
  if(!sel || sel.dataset.populated === String(state.therapists.length)) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los terapeutas</option>' +
    orderedTherapists().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  if(cur) sel.value = cur;
  sel.dataset.populated = String(state.therapists.length);
}

export function setAgendaView(mode) {
  // La vista semanal es POR terapeuta: con "Todos" no se cambia de vista.
  if(mode === 'week' && !state.agendaTherapistFilter){
    toastErr('Seleccioná un terapeuta para la vista semanal');
    return;
  }
  state.agendaView = mode;
  ['day','week','month'].forEach(m => {
    const btn = document.getElementById('vbtn-'+m);
    if(btn) btn.classList.toggle('active', m === mode);
  });
  renderGrid();
}

export function setTherapistFilter(val) {
  state.agendaTherapistFilter = val || null;
  if((state.agendaView || 'day') === 'week' && !state.agendaTherapistFilter){
    toastInfo('La vista semanal necesita un terapeuta — volviendo a la vista Día');
    setAgendaView('day');
    return;
  }
  renderGrid();
}

export function renderWeekView() {
  const wrap = document.querySelector('#tab-agenda .grid-wrap');
  if(!wrap) return;
  populateThFilter();
  const th = getTherapist(state.agendaTherapistFilter);
  if(!th){ setAgendaView('day'); return; }   // defensivo: setAgendaView ya impide llegar sin terapeuta

  const monday = startOfWeek(state.currentDate);
  const days = [];
  for(let i = 0; i < 7; i++){ const d = new Date(monday); d.setDate(monday.getDate() + i); days.push(d); }
  const dayStrs = days.map(d => fmtDate(d));
  const wkAppts = state.appointments.filter(a => a.therapistId === th.id && dayStrs.includes(a.date));
  // Lun–Sáb siempre; Dom solo si tiene citas esa semana.
  const visDays = wkAppts.some(a => a.date === dayStrs[6]) ? days : days.slice(0, 6);

  // Rango horario: [work_start, work_end] del terapeuta (fallback: su horario de agenda)
  // ∪ horas de todas sus citas de la semana — todo visible siempre, mismo criterio que Día.
  const ws = th.workStart ?? th.startH, we = th.workEnd ?? th.endH;
  const hourSet = new Set();
  for(let h = ws; h < we; h += 0.5) hourSet.add(+h.toFixed(1));
  wkAppts.forEach(a => apptSlots(a).forEach(s => { if(s >= 0 && s < 24) hourSet.add(s); }));
  let vh = [...hourSet].sort((a, b) => a - b);
  if(vh.length){ const min = vh[0], max = vh[vh.length - 1]; vh = []; for(let h = min; h <= max; h += 0.5) vh.push(+h.toFixed(1)); }

  const mn = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const first = visDays[0], last = visDays[visDays.length - 1];
  document.getElementById('day-lbl').textContent = first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} de ${mn[last.getMonth()]} ${last.getFullYear()}`
    : `${first.getDate()} de ${mn[first.getMonth()]} – ${last.getDate()} de ${mn[last.getMonth()]} ${last.getFullYear()}`;

  const conf = wkAppts.filter(a => a.status === 'conf').length;
  const pend = wkAppts.filter(a => a.status === 'pend').length;
  const noas = wkAppts.filter(a => a.status === 'noas').length;
  const statsEl = document.getElementById('agenda-stats');
  if(statsEl) statsEl.innerHTML = `
    <span class="count-pill"><b>${wkAppts.length}</b>&nbsp;cita${wkAppts.length !== 1 ? 's' : ''} esta semana · ${esc(th.name)}</span>
    <span class="count-item" style="color:#17865f"><span class="count-dot" style="background:#1D9E75"></span>${conf} confirmada${conf !== 1 ? 's' : ''}</span>
    <span class="count-item" style="color:#BA7517"><span class="count-dot" style="background:#E0A850"></span>${pend} pendiente${pend !== 1 ? 's' : ''}</span>
    <span class="count-item" style="color:#c33a3a"><span class="count-dot" style="background:#E24B4A"></span>${noas} no asistió</span>`;

  wrap.innerHTML = '<div class="schedule-grid" id="schedule-grid"></div>';
  const g = document.getElementById('schedule-grid');
  g.style.gridTemplateColumns = `60px repeat(${visDays.length},1fr)`;
  g.style.setProperty('--th-count', visDays.length);

  const dnCorto = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const todayStr = fmtDate(new Date());
  const eh = document.createElement('div'); eh.className = 'grid-header'; eh.textContent = 'Hora'; g.appendChild(eh);
  visDays.forEach(d => {
    const ds = fmtDate(d);
    const h = document.createElement('div'); h.className = 'th-header' + (ds === todayStr ? ' wk-today' : '');
    h.innerHTML = `<div><div class="th-nm">${dnCorto[d.getDay()]} ${d.getDate()}</div><div class="th-sp">${ds === todayStr ? 'Hoy' : mn[d.getMonth()].slice(0, 3)}</div></div>`;
    g.appendChild(h);
  });

  // Mismo reparto que en la vista Día, pero la columna acá es el DÍA (el terapeuta ya es único).
  const compactSet = new Set();
  dayStrs.forEach(ds => compactNoas(wkAppts.filter(a => a.date === ds)).forEach(a => compactSet.add(a)));

  const tailSet = new Set();
  wkAppts.forEach(a => { if(compactSet.has(a)) return; apptSlots(a).slice(1).forEach(s => tailSet.add(`${a.date}:${s}`)); });

  // Mismo mapa de ordinales que en Día: una pasada sobre todas las citas, no una por tarjeta.
  const ordMap = ordinalesDeCitas(state.appointments, getPatient);

  vh.forEach(hr => {
    const tc = document.createElement('div'); tc.className = 'time-cell' + (hr % 1 === 0.5 ? ' half-hour' : ''); tc.textContent = fmtTime(hr); g.appendChild(tc);
    visDays.forEach(d => {
      const ds = fmtDate(d);
      const slot = document.createElement('div');
      const enFranja = wkAppts.filter(a => a.date === ds && slotOf(a.hour) === hr);
      const covered = tailSet.has(`${ds}:${+hr.toFixed(1)}`);
      if(covered && !enFranja.length){ slot.className = 'slot slot-tail'; g.appendChild(slot); return; }
      const strips = enFranja.filter(a => compactSet.has(a));
      const appt = enFranja.find(a => !compactSet.has(a)) || null;
      // Misma regla que en la vista Día, compacta: acá la columna es el DÍA y el terapeuta es uno.
      const blkWk = (!appt && !covered) ? findBlock(state.blocks, {date: ds, therapistId: th.id, hour: hr, duration: 30}) : null;
      if(blkWk){
        const editableWk = hasPermission('manageBlocks');
        slot.className = 'slot slot-block' + (editableWk ? ' editable' : '');
        if(slotOf(blkWk.startH) === hr) slot.innerHTML = `<span class="blk-lbl">${esc(blkWk.motivo || 'Bloqueado')}</span>`;
        slot.title = `${blkWk.motivo || 'Bloqueado'} · ${fmtTime(blkWk.startH)}–${fmtTime(blkWk.endH)}${editableWk ? ' — click para editar' : ''}`;
        strips.forEach((na, i) => slot.appendChild(buildNoasStrip(na, i)));
        if(editableWk) slot.addEventListener('click', () => openBlockModal(th.id, ds, blkWk.id));
        g.appendChild(slot);
        return;
      }
      const stripOver = covered && !appt;   // pisado por la tarjeta vecina: solo flota la tira
      slot.className = 'slot' + (stripOver ? ' slot-strip-over' : (!appt ? ' avail' : ''));
      strips.forEach((na, i) => slot.appendChild(buildNoasStrip(na, i)));
      if(!appt){
        if(!stripOver) slot.addEventListener('click', () => openApptModalAt(th.id, hr, ds));
      } else {
        // Tarjeta compacta: nombre + punto de estado + tinte de modalidad. Sin drag & drop (v1).
        const spans = apptSlots(appt).length;
        const pt = getPatient(appt.patientId);
        const doc = pt && pt.doctorId ? getDoctor(pt.doctorId) : null;
        const card = document.createElement('div');
        let sc = ''; if(appt.status === 'pend') sc = ' status-pend'; else if(appt.status === 'noas') sc = ' status-noas';
        if(appt.qbAt) sc += ' appt-qb';   // mismo apagado que en la vista Día
        const locCls = appt.location === 'domicilio' ? 'loc-domicilio' : 'loc-centro';
        card.className = `appt ${locCls}${sc}`;
        card.style.borderLeftColor = doc ? doc.color : 'rgba(0,0,0,.1)';
        const exactTagWk = isAlignedHour(appt.hour) ? '' : `<span class="appt-exact">${esc(fmtTime(appt.hour))}</span>`;
        const canAddWk = appt.status === 'noas' && hasPermission('createAppt');
        if(canAddWk) card.classList.add('has-add');
        const ordWk = ordMap.get(appt) || null;
        if(ordWk) card.classList.add('has-ord');
        card.innerHTML = `<div class="appt-name">${exactTagWk}${esc(pt ? pt.name : (appt.patientName || 'Sin paciente'))}</div><div class="appt-dot" style="background:${dotColor(appt.status)}" title="Estado: ${esc(appt.status)}${appt.qbAt ? ' · QB ✓' : ''}"></div>${canAddWk ? '<div class="appt-add" title="Agendar otra cita en esta franja">+</div>' : ''}${ordBadge(ordWk)}`;
        card.addEventListener('click', e => { if(e.target.classList.contains('appt-add')) return; e.stopPropagation(); openEditApptModal(appt.id); });
        if(canAddWk) card.querySelector('.appt-add').addEventListener('click', e => { e.stopPropagation(); openApptModalAt(th.id, hr, ds); });
        const off = strips.length * STRIP_STEP;
        const cardTop = off || 3;
        if(off){ card.style.top = `${off}px`; if(spans === 1) card.classList.add('appt-squeezed'); }
        if(spans > 1){ slot.style.zIndex = '2'; card.style.bottom = 'auto'; card.style.height = `calc(${spans} * 46px - ${cardTop + 3}px)`; }
        slot.appendChild(card);
      }
      g.appendChild(slot);
    });
  });
  renderRefLegend();
}

export function renderMonthView() {
  const wrap = document.querySelector('#tab-agenda .grid-wrap');
  if(!wrap) return;
  populateThFilter();
  const filterTh = state.agendaTherapistFilter || null;
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const lastDay = new Date(year, month + 1, 0);
  const mn = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const todayStr = fmtDate(new Date());
  const startDow = new Date(year, month, 1).getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;

  document.getElementById('day-lbl').textContent = `${mn[month]} ${year}`;

  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  let moAppts = state.appointments.filter(a => a.date && a.date.startsWith(prefix));
  if(filterTh) moAppts = moAppts.filter(a => a.therapistId === filterTh);
  const byDate = {};
  moAppts.forEach(a => { byDate[a.date] = (byDate[a.date] || 0) + 1; });

  const thName = filterTh ? (getTherapist(filterTh)?.name || null) : null;
  const statsEl = document.getElementById('agenda-stats');
  if(statsEl) statsEl.innerHTML = `<span class="count-pill"><b>${moAppts.length}</b>&nbsp;cita${moAppts.length !== 1 ? 's' : ''} en ${mn[month].toLowerCase()}${thName ? ' · ' + esc(thName) : ''}</span>`;

  let html = `<div class="mv-wrap"><div class="mv-hd">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => `<div>${d}</div>`).join('')}</div><div class="mv-grid">`;
  for(let i = 0; i < offset; i++) html += '<div></div>';
  for(let day = 1; day <= lastDay.getDate(); day++){
    const ds = `${prefix}-${String(day).padStart(2, '0')}`;
    const n = byDate[ds] || 0;
    html += `<div class="mv-day${ds === todayStr ? ' today' : ''}" onclick="goToDateAndSelect('${ds}')">
      <div class="mv-num">${day}</div>
      ${n ? `<span class="mv-count">${n} cita${n !== 1 ? 's' : ''}</span>` : ''}
    </div>`;
  }
  html += '</div></div>';
  wrap.innerHTML = html;
  renderRefLegend();
}

export function goToDateAndSelect(ds) {
  goToDate(ds);
  setAgendaView('day');
}

export function exportAgendaCSV() {
  const view = state.agendaView || 'day';
  let appts = [];
  if(view === 'month'){
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
    appts = state.appointments.filter(a => a.date.startsWith(prefix));
  } else if(view === 'week'){
    const monday = startOfWeek(state.currentDate);
    const dates = new Set();
    for(let i = 0; i < 7; i++){
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      dates.add(fmtDate(d));
    }
    appts = state.appointments.filter(a => dates.has(a.date));
  } else {
    appts = state.appointments.filter(a => a.date === fmtDate(state.currentDate));
  }
  const filterTh = state.agendaTherapistFilter;
  if(filterTh) appts = appts.filter(a => a.therapistId === filterTh);
  appts = appts.sort((a,b) => a.date.localeCompare(b.date)||a.hour-b.hour);

  const rows = [['Fecha','Hora','Paciente','Terapeuta','Estado','Duracion_min','Tipo','Notas']];
  appts.forEach(a => {
    const pt = getPatient(a.patientId);
    const th = getTherapist(a.therapistId);
    rows.push([
      a.date, fmtTime(a.hour),
      pt?pt.name:(a.patientName||''),
      th?th.name:'',
      a.status, a.duration||60,
      a.type||'',
      (a.note||'').replace(/[\n\r,]/g,' ')
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `agenda-${view}-${fmtDate(state.currentDate)}.csv`;
  link.click(); URL.revokeObjectURL(url);
}
