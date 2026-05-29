
import { createClient } from '@supabase/supabase-js';
const _SURL=import.meta.env.VITE_SUPABASE_URL;
const _SKEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supa=createClient(_SURL,_SKEY);

// ── AUTH ──
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const btn=document.getElementById('login-btn');
  const err=document.getElementById('login-error');
  if(!email||!pass){err.textContent='Ingresa tu correo y contraseña.';return;}
  btn.disabled=true;btn.textContent='Ingresando...';err.textContent='';
  const {error}=await supa.auth.signInWithPassword({email,password:pass});
  if(error){
    err.textContent='Correo o contraseña incorrectos.';
    btn.disabled=false;btn.textContent='Ingresar';
  } else {
    document.getElementById('login-screen').style.display='none';
    document.getElementById('loading-overlay').style.display='flex';
    await loadAll();
    document.getElementById('loading-overlay').style.display='none';
    renderGrid();updateResumenBadge();updateFacturaBadge();
    subscribeRealtime();
  }
}
async function doLogout(){
  await unsubscribeRealtime();
  await supa.auth.signOut();location.reload();
}

// ── CARGAR DATOS ──
async function loadAll(){
  try{
    const [th,doc,pat,appt,prot,cob]=await Promise.all([
      supa.from('therapists').select('*').order('created_at'),
      supa.from('doctors').select('*').order('created_at'),
      supa.from('patients').select('*,session_log(*)').order('created_at'),
      supa.from('appointments').select('*,patients(name)').order('date').order('hour'),
      supa.from('protocols').select('*').order('created_at'),
      supa.from('cobros').select('*').order('created_at'),
    ]);
    if(th.error)throw th.error;
    therapists=(th.data||[]).map(r=>({id:r.id,name:r.name,initials:r.initials||r.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(),spec:r.spec||'',startH:r.start_h,endH:r.end_h,colorId:r.color_id||'ca'}));
    doctors=(doc.data||[]).map(r=>({id:r.id,name:r.name,spec:r.spec||'',email:r.email||'',tel:r.tel||'',color:r.color||'#E24B4A'}));
    const cobData=cob.data||[];
    patients=(pat.data||[]).map(r=>({
      id:r.id,name:r.name,age:r.age||35,cedula:r.cedula||'',tel:r.tel||'',email:r.email||'',dir:r.dir||'',
      diag:r.diag||'Sin diagnóstico',therapistId:r.therapist_id,doctorId:r.doctor_id,
      sessions:r.sessions||10,done:r.done||0,status:r.status||'active',
      log:(r.session_log||[]).map(s=>({date:s.date,type:s.type,hour:s.hour,status:s.status,pb:s.pain_before,pa:s.pain_after,note:s.note||'',tags:s.tags||[]})),
      billing:{sesPerFactura:r.billing_ses_per_factura||5,pendientes:r.billing_pendientes||0,
        facturas:cobData.filter(c=>c.patient_id===r.id).map(c=>({'id':c.cobro_ref,'n':c.n_sessions,'fecha':c.date,'estado':'cobrada'}))}
    }));
    protocols=(prot.data||[]).map(r=>({id:r.id,name:r.name,diag:r.diag_keywords||'',sessions:r.sessions||20,freq:r.freq||3,alta:r.discharge_criteria||''}));
    appointments=(appt.data||[]).map(r=>({id:r.id,date:r.date,therapistId:r.therapist_id,patientId:r.patient_id,patientName:(r.patients&&r.patients.name)||null,hour:r.hour,type:r.type||'Fisioterapia',status:r.status||'pend',note:r.note||''}));
    if(!protocols.length) protocols=[...DEFAULT_PROTOCOLS];
    // Inicializar contador de facturas desde el mayor F### ya emitido (persistente entre recargas)
    let maxFact = 0;
    cobData.forEach(c => {
      const m = String(c.cobro_ref || '').match(/^F(\d+)$/);
      if (m) { const n = parseInt(m[1], 10); if (n > maxFact) maxFact = n; }
    });
    facturaCounter = maxFact;
    // Marcar citas que ya tienen sesión registrada
    const sessionDates=new Set();
    patients.forEach(p=>{
      (p.log||[]).forEach(s=>{
        sessionDates.add(p.id+'|'+s.date+'|'+(s.hour||'').split(':')[0]);
      });
    });
    appointments.forEach(a=>{
      a.hasSession=sessionDates.has(String(a.patientId)+'|'+a.date+'|'+String(a.hour));
    });
    console.log('Datos cargados desde Supabase');
  }catch(e){console.warn('Error cargando datos:',e.message);toastErr('Error de conexión con la base de datos. Verifica tu internet.');}
}

// ── GUARDAR / BORRAR ──
async function dbSaveAppt(a){
  markLocalChange();
  const payload={date:a.date,therapist_id:a.therapistId,patient_id:a.patientId,hour:a.hour,type:a.type,status:a.status,note:a.note||''};
  if(typeof a.id==='string')payload.id=a.id;
  await supa.from('appointments').upsert(payload);
}
async function dbDeleteAppt(id){markLocalChange();if(typeof id==='string')await supa.from('appointments').delete().eq('id',id);}
async function dbUpdateApptStatus(id,status){
  if(typeof id!=='string')return;
  markLocalChange();
  const {error}=await supa.from('appointments').update({status}).eq('id',id);
  if(error)toastErr('No se pudo guardar el estado de la cita.');
}
async function dbSavePatient(p){
  markLocalChange();
  await supa.from('patients').insert({name:p.name,age:p.age,cedula:p.cedula,tel:p.tel,email:p.email,dir:p.dir,diag:p.diag,therapist_id:p.therapistId||null,doctor_id:p.doctorId||null,sessions:p.sessions,done:0,status:p.status,billing_ses_per_factura:p.billing.sesPerFactura,billing_pendientes:p.billing.pendientes});
}
async function dbSaveTherapist(th){
  markLocalChange();
  const d={name:th.name,initials:th.initials,spec:th.spec,start_h:th.startH,end_h:th.endH,color_id:th.colorId};
  if(typeof th.id==='string')d.id=th.id;
  await supa.from('therapists').upsert(d);
}
async function dbDeleteTherapist(id){markLocalChange();if(typeof id==='string')await supa.from('therapists').delete().eq('id',id);}
async function dbSaveDoctor(d){
  markLocalChange();
  const p={name:d.name,spec:d.spec,email:d.email,tel:d.tel,color:d.color};
  if(typeof d.id==='string')p.id=d.id;
  await supa.from('doctors').upsert(p);
}
async function dbDeleteDoctor(id){markLocalChange();if(typeof id==='string')await supa.from('doctors').delete().eq('id',id);}
async function dbSaveProtocol(p){
  markLocalChange();
  const d={name:p.name,diag_keywords:p.diag,sessions:p.sessions,freq:p.freq,discharge_criteria:p.alta};
  if(typeof p.id==='string')d.id=p.id;
  await supa.from('protocols').upsert(d);
}
async function dbDeleteProtocol(id){markLocalChange();if(typeof id==='string')await supa.from('protocols').delete().eq('id',id);}
async function dbRegistrarCobro(patientId,nSessions,cobroRef){
  markLocalChange();
  await supa.from('cobros').insert({cobro_ref:cobroRef,patient_id:patientId,n_sessions:nSessions,date:fmtDate(new Date())});
  await supa.from('patients').update({billing_pendientes:0}).eq('id',patientId);
}
async function dbUpdateBillingPendientes(patientId,pendientes){
  markLocalChange();
  if(typeof patientId==='string')await supa.from('patients').update({billing_pendientes:pendientes}).eq('id',patientId);
}


function protocolSVG(img) {
  const svgs = {
    shoulder: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="30" r="18" fill="none" stroke="#1D9E75" stroke-width="2.5"/>
      <circle cx="60" cy="30" r="8" fill="#1D9E75" opacity=".25"/>
      <line x1="60" y1="48" x2="60" y2="80" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <line x1="60" y1="55" x2="38" y2="72" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <line x1="60" y1="55" x2="82" y2="72" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <line x1="60" y1="80" x2="50" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <line x1="60" y1="80" x2="70" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <path d="M42 30 Q30 30 28 45 Q40 50 60 48" fill="none" stroke="#E24B4A" stroke-width="2" stroke-dasharray="3,2"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Hombro</text>
    </svg>`,
    hip: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="20" width="60" height="30" rx="8" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <circle cx="42" cy="60" r="12" fill="none" stroke="#1D9E75" stroke-width="2.5"/>
      <circle cx="42" cy="60" r="5" fill="#1D9E75" opacity=".3"/>
      <circle cx="78" cy="60" r="12" fill="none" stroke="#6b6a64" stroke-width="1.5" stroke-dasharray="3,2"/>
      <line x1="42" y1="72" x2="38" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <line x1="78" y1="72" x2="82" y2="105" stroke="#9c9a92" stroke-width="3" stroke-linecap="round"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Cadera</text>
    </svg>`,
    hand: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="60" width="40" height="45" rx="6" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="48" y="35" width="8" height="28" rx="4" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="58" y="30" width="8" height="32" rx="4" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="68" y="33" width="8" height="29" rx="4" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="78" y="38" width="7" height="25" rx="3.5" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="28" y="55" width="16" height="10" rx="5" fill="none" stroke="#E24B4A" stroke-width="2.5"/>
      <path d="M28 55 Q20 52 22 45 Q30 43 44 55" fill="#E24B4A" opacity=".15"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Muñeca/Mano</text>
    </svg>`,
    arm: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="22" r="14" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="48" y="35" width="24" height="38" rx="12" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <circle cx="60" cy="73" r="10" fill="none" stroke="#1D9E75" stroke-width="2.5"/>
      <circle cx="60" cy="73" r="4" fill="#1D9E75" opacity=".3"/>
      <rect x="50" y="82" width="20" height="30" rx="10" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <path d="M48 50 Q35 55 38 70 Q50 75 60 73" fill="#E24B4A" opacity=".15"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Brazo/Bíceps</text>
    </svg>`,
    head: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="48" rx="32" ry="36" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <ellipse cx="60" cy="90" rx="16" ry="8" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <line x1="60" y1="82" x2="60" y2="98" stroke="#9c9a92" stroke-width="2.5"/>
      <path d="M30 40 Q28 25 40 20 Q60 14 80 20 Q92 25 90 40" fill="#E24B4A" opacity=".15" stroke="#E24B4A" stroke-width="1.5"/>
      <circle cx="48" cy="44" r="3" fill="#9c9a92"/>
      <circle cx="72" cy="44" r="3" fill="#9c9a92"/>
      <path d="M50 58 Q60 64 70 58" fill="none" stroke="#9c9a92" stroke-width="1.5"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Cabeza/Cuello</text>
    </svg>`,
    elbow: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="48" y="10" width="24" height="38" rx="12" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <circle cx="60" cy="58" r="16" fill="none" stroke="#1D9E75" stroke-width="2.5"/>
      <circle cx="60" cy="58" r="6" fill="#1D9E75" opacity=".25"/>
      <path d="M76 52 Q88 48 88 42" fill="none" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="48" y="74" width="24" height="36" rx="12" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Codo</text>
    </svg>`,
    spine: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <line x1="60" y1="10" x2="60" y2="108" stroke="#9c9a92" stroke-width="2"/>
      <rect x="44" y="15" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="44" y="28" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="44" y="41" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="44" y="54" width="32" height="10" rx="3" fill="none" stroke="#9c9a92" stroke-width="2"/>
      <rect x="44" y="67" width="32" height="10" rx="3" fill="#E24B4A" opacity=".2" stroke="#E24B4A" stroke-width="2.5"/>
      <rect x="44" y="80" width="32" height="10" rx="3" fill="#E24B4A" opacity=".2" stroke="#E24B4A" stroke-width="2.5"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Columna</text>
    </svg>`,
    knee: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="46" y="8" width="28" height="42" rx="14" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <circle cx="60" cy="62" r="20" fill="none" stroke="#1D9E75" stroke-width="2.5"/>
      <circle cx="60" cy="62" r="10" fill="none" stroke="#6b6a64" stroke-width="1.5" stroke-dasharray="4,2"/>
      <circle cx="60" cy="56" r="7" fill="#1D9E75" opacity=".2" stroke="#1D9E75" stroke-width="1.5"/>
      <rect x="46" y="82" width="28" height="32" rx="14" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Rodilla</text>
    </svg>`,
    ankle: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="46" y="8" width="28" height="50" rx="14" fill="none" stroke="#9c9a92" stroke-width="2.5"/>
      <ellipse cx="60" cy="70" rx="22" ry="16" fill="none" stroke="#1D9E75" stroke-width="2.5"/>
      <path d="M38 80 Q30 90 35 100 Q55 112 85 108 Q95 105 90 95 Q82 85 60 86" fill="none" stroke="#9c9a92" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M42 74 Q38 90 40 98" fill="none" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round"/>
      <text x="60" y="118" text-anchor="middle" font-size="9" fill="#6b6a64" font-family="sans-serif">Tobillo</text>
    </svg>`
  };
  return svgs[img] || svgs['shoulder'];
}

const ALL_HOURS=[6,7,8,9,10,11,12,13,14,15,16,17];
const DAYS=['Lun','Mar','Mié','Jue','Vie'];
const COLOR_OPTIONS=[
  {id:'ca',bg:'#e8f5f0',border:'#1D9E75',text:'#0d6e4e'},   // Giovanni — verde
  {id:'cb',bg:'#e8f2fb',border:'#378ADD',text:'#1a4a8a'},   // Marco — azul
  {id:'cc',bg:'#fef6e8',border:'#BA7517',text:'#7a4a00'},   // Josselyn — naranja
  {id:'cd',bg:'#fdeef4',border:'#D4537E',text:'#8a2a50'},   // Karina — rosa
  {id:'ce',bg:'#f0eefb',border:'#7F77DD',text:'#4a3d9e'},   // Axel — morado
  {id:'cf',bg:'#f0f8e8',border:'#639922',text:'#3a5a10'},   // extra — verde lima
];
const DOC_COLORS=['#E24B4A','#378ADD','#7F77DD','#BA7517','#D4537E','#1D9E75','#D85A30','#639922'];

let therapists=[];
let thCounter=10;

let doctors=[];
let docCounter=10;
let selectedDocColor='#E24B4A';
let editingDocId=null;

let protocols=[];

const DEFAULT_PROTOCOLS = [
  {
    id:'p1', name:'POP Manguito de los Rotadores Hombro Derecho',
    diag:'manguito,rotadores,hombro derecho,POP hombro derecho',
    sessions:20, freq:5, alta:'Rango articular completo, fuerza 80% lado contralateral, EVA 0-1',
    def:'Postoperatorio de reparación quirúrgica del manguito rotador. Requiere rehabilitación intensiva para recuperar movilidad y fuerza del hombro.',
    img:'shoulder'
  },
  {
    id:'p2', name:'Coxartrosis Derecha',
    diag:'coxartrosis,artrosis cadera,cadera derecha',
    sessions:15, freq:3, alta:'Marcha sin dolor, mejora de rangos articulares, funcionalidad en AVD',
    def:'Desgaste del cartílago de la articulación coxofemoral derecha. Objetivos: alivio del dolor, mejora de movilidad y fortalecimiento muscular periarticular.',
    img:'hip'
  },
  {
    id:'p3', name:'Tendinitis de Quervain Bilateral',
    diag:'quervain,tendinitis quervain,bilateral quervain',
    sessions:12, freq:3, alta:'Sin dolor en maniobra de Finkelstein, retorno a actividades manuales',
    def:'Inflamación de los tendones abductores del pulgar. Tratamiento: reposo relativo, ultrasonido, iontoforesis y ejercicios de deslizamiento tendinoso.',
    img:'hand'
  },
  {
    id:'p4', name:'Tendinitis Bíceps Izquierdo',
    diag:'tendinitis biceps,biceps izquierdo,bicipital',
    sessions:10, freq:3, alta:'EVA 0-1, fuerza simétrica, retorno deportivo o laboral',
    def:'Inflamación del tendón del bíceps braquial. Protocolo con electroterapia, técnica de Cyriax y fortalecimiento excéntrico progresivo.',
    img:'arm'
  },
  {
    id:'p5', name:'Cefalea Tensional',
    diag:'cefalea,tensional,cefalea tensional,cervicogénica',
    sessions:8, freq:2, alta:'Reducción de frecuencia e intensidad de episodios en 70%, control postural',
    def:'Dolor de cabeza de origen muscular y postural. Tratamiento: liberación suboccipital, corrección postural cervical y técnicas de relajación.',
    img:'head'
  },
  {
    id:'p6', name:'Epicondilitis Lateral Izquierda',
    diag:'epicondilitis,codo de tenista,epicóndilo,lateral izquierda',
    sessions:12, freq:3, alta:'Sin dolor en prueba de Cozen, fuerza de agarre simétrica',
    def:'Inflamación de los extensores del carpo en su inserción epicondílea. Protocolo: ultrasonido, masaje transverso profundo y ejercicios excéntricos de Tyler.',
    img:'elbow'
  },
  {
    id:'p7', name:'Lesión Manguito Rotadores Hombro Izquierdo',
    diag:'manguito rotadores,hombro izquierdo,lesión manguito',
    sessions:18, freq:4, alta:'Arco de movimiento completo sin dolor, fuerza 85% contralateral',
    def:'Desgarro parcial o total de los tendones del manguito rotador. Tratamiento conservador con fortalecimiento progresivo del complejo escapulohumeral.',
    img:'shoulder'
  },
  {
    id:'p8', name:'Discopatía L4-S1',
    diag:'discopatía,L4,S1,lumbar,disco lumbar',
    sessions:15, freq:3, alta:'EVA 0-2, retorno laboral, control motor lumbo-pélvico',
    def:'Degeneración o herniación discal en segmento lumbar bajo. Protocolo McKenzie, estabilización lumbar y reeducación postural global.',
    img:'spine'
  },
  {
    id:'p9', name:'Artrosis de Cadera Derecha',
    diag:'artrosis cadera,coxartrosis derecha,osteoartritis cadera',
    sessions:15, freq:3, alta:'Mejora funcional en escaleras y marcha, dolor controlado',
    def:'Degeneración articular de la cadera derecha. Hidroterapia cuando disponible, fortalecimiento de glúteos y cuádriceps, corrección de la marcha.',
    img:'hip'
  },
  {
    id:'p10', name:'Rotura Tendón de Aquiles Derecho',
    diag:'aquiles,tendón aquiles,rotura aquiles',
    sessions:25, freq:5, alta:'Marcha simétrica, fuerza gemelar 90%, retorno deportivo gradual',
    def:'Ruptura total o parcial del tendón de Aquiles. Rehabilitación por fases: inmovilización, movilización progresiva, fortalecimiento excéntrico y propiocepción.',
    img:'ankle'
  },
  {
    id:'p11', name:'Prótesis Hombro Izquierdo',
    diag:'prótesis hombro,artroplastia hombro,hombro izquierdo prótesis',
    sessions:24, freq:5, alta:'Movilidad funcional, independencia en AVD, fuerza progresiva',
    def:'Rehabilitación post-artroplastia de hombro. Fases: péndulos y movilidad pasiva, activo-asistido, fortalecimiento y funcional.',
    img:'shoulder'
  },
  {
    id:'p12', name:'Radiculopatía + Ciática Izquierda',
    diag:'radiculopatía,ciática,ciática izquierda,radicular',
    sessions:12, freq:3, alta:'Abolición de dolor irradiado, test neurológicos negativos',
    def:'Compresión o irritación de raíces nerviosas lumbares con irradiación al miembro inferior. Tracción lumbar, neurodinámia y estabilización core.',
    img:'spine'
  },
  {
    id:'p13', name:'Meniscectomía Rodilla Derecha',
    diag:'meniscectomía,menisco derecho,rodilla derecha menisco',
    sessions:20, freq:5, alta:'Cuádriceps simétrico, propiocepción completa, retorno deportivo',
    def:'Post-quirúrgico de extracción meniscal. Protocolo acelerado: crioterapia, movilización temprana, fortalecimiento isométrico e isotónico progresivo.',
    img:'knee'
  },
  {
    id:'p14', name:'POP Menisco Derecho',
    diag:'POP menisco,postoperatorio menisco,menisco derecho POP',
    sessions:18, freq:4, alta:'ROM completo, sin derrame, funcionalidad deportiva',
    def:'Postoperatorio de reparación meniscal. Rehabilitación más conservadora que meniscectomía, con carga progresiva y fortalecimiento en cadena cinética cerrada.',
    img:'knee'
  },
  {
    id:'p15', name:'Condromalacia Rotuliana Bilateral',
    diag:'condromalacia,rotuliana,bilateral,condromalacia rotuliana',
    sessions:14, freq:3, alta:'Sin dolor en escaleras, cuádriceps simétrico, retorno deportivo',
    def:'Degeneración del cartílago rotuliano. VMO, vendaje rotuliano, fortalecimiento excéntrico de cuádriceps y corrección biomecánica de la marcha.',
    img:'knee'
  }
];

let protCounter=10;
let protCurrentPage=0;
const PROT_PAGE_SIZE=3;

let patients=[];
let patCounter=10;

let appointments=[];
let apptCounter=20;

let notifSettings=[
  {id:'wa_rec',label:'Recordatorio WhatsApp 24h antes',desc:'Envía mensaje automático al paciente 24h antes de su cita.',icon:'📱',on:true},
  {id:'email_th',label:'Email al terapeuta al asignar cita',desc:'Notifica al terapeuta cuando se le agenda una nueva cita.',icon:'✉️',on:true},
  {id:'wa_noas',label:'Mensaje automático de inasistencia',desc:'Si el paciente no asistió, le envía mensaje para reprogramar.',icon:'📱',on:false},
  {id:'resumen',label:'Resumen diario al administrador',desc:'Al finalizar el día, envía resumen con asistencias e inasistencias.',icon:'📊',on:true},
  {id:'email_doc',label:'Notificar al doctor referente en alta',desc:'Al dar de alta a un paciente, notifica al médico que lo refirió.',icon:'✉️',on:false},
];

let currentDate=new Date();
let currentWeek=0;
let dragData=null;
let editingTherapistId=null;
let selectedColor='ca';
let editingProtocolId=null;
let editingPatientId=null;
const allTabs=['agenda','pacientes','informes','paciente_rpt','protocolos','resumen','terapeutas','doctores','facturacion'];
let facturaCounter=10;
let currentTab='agenda';

// ======= HELPERS =======
function escapeHtml(v){
  if(v==null) return '';
  return String(v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
const esc = escapeHtml;
function fmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function getColor(id){return COLOR_OPTIONS.find(c=>c.id===id)||COLOR_OPTIONS[0]}
function getTherapist(id){return therapists.find(t=>t.id===id)}
function getPatient(id){return patients.find(p=>p.id===id)}
function getDoctor(id){return doctors.find(d=>d.id===id)}
function therapistHours(th){const h=[];for(let i=th.startH;i<th.endH;i++)h.push(i);return h;}
function getAvailHours(){const s=new Set();therapists.forEach(t=>therapistHours(t).forEach(h=>s.add(h)));return[...s].sort((a,b)=>a-b);}
function dotColor(s){return s==='conf'?'#1D9E75':s==='pend'?'#BA7517':'#E24B4A';}

// ======= LEYENDA DOCTORES =======
function renderRefLegend(){
  if(!doctors.length){document.getElementById('ref-legend-bar').innerHTML='';return;}
  const items=doctors.map(d=>`<span class="ref-legend-item"><span class="ref-stripe" style="background:${d.color}"></span>${esc(d.name)}<span style="color:#7a7a76;font-size:10px;margin-left:3px">(${esc(d.spec)})</span></span>`).join('');
  document.getElementById('ref-legend-bar').innerHTML=`<div class="ref-legend"><span class="ref-legend-lbl">Borde = doctor ref.:</span>${items}</div>`;
}

// ======= CICLO ESTADO =======
async function cycleStatus(id){
  const a=appointments.find(x=>x.id===id);if(!a)return;
  const prevStatus=a.status;
  const c=['conf','pend','noas'];
  a.status=c[(c.indexOf(a.status)+1)%3];
  checkBillingOnStatusChange(a,prevStatus);
  renderGrid();updateResumenBadge();updateFacturaBadge();
  dbUpdateApptStatus(a.id,a.status);
  
  
  if(a.status!=='conf' && prevStatus==='conf'){
    const pt=getPatient(a.patientId);
    if(pt){
      if(pt.billing) dbUpdateBillingPendientes(a.patientId, pt.billing.pendientes);
      const newDone = Math.max(0, (pt.done||0) - 1);
      await supa.from('patients').update({done: newDone}).eq('id',a.patientId);
      pt.done = newDone;
    }
  }
  // Si pasa de 'conf' a otro — revertir billing
  if(a.status!=='conf' && prevStatus==='conf'){
    const pt=getPatient(a.patientId);
    if(pt && pt.billing) dbUpdateBillingPendientes(a.patientId, pt.billing.pendientes);
  }
}
function checkBillingOnStatusChange(appt,prevStatus){
  const pt=getPatient(appt.patientId);if(!pt||!pt.billing)return;
  // Solo contar cuando se marca 'conf' (asistió) desde otro estado
  if(appt.status==='conf'&&prevStatus!=='conf'){
    pt.billing.pendientes=(pt.billing.pendientes||0)+1;
    if(pt.billing.pendientes>=pt.billing.sesPerFactura){
      showBillingAlert(pt);
    }
  } else if(appt.status!=='conf'&&prevStatus==='conf'){
    pt.billing.pendientes=Math.max(0,(pt.billing.pendientes||1)-1);
  }
}
function showBillingAlert(pt){
  const msg=`🧾 ${pt.name} llegó a ${pt.billing.sesPerFactura} citas — ¡hora de facturar!\n\nCI: ${pt.cedula||'—'}  ·  ${pt.email||'sin correo'}\n\n¿Ir a Facturación ahora?`;
  if(confirm(msg)){showTab('facturacion');}
}
function updateFacturaBadge(){
  const n=patients.filter(p=>p.billing&&p.billing.pendientes>=p.billing.sesPerFactura).length;
  const b=document.getElementById('factura-badge');if(!b)return;
  b.textContent=n;b.style.display=n>0?'':'none';
}

// ======= AGENDA =======
function renderGrid(){
  checkAutoNoas();
  const ds=fmtDate(currentDate);
  const dn=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('day-lbl').textContent=`${dn[currentDate.getDay()]}, ${currentDate.getDate()} de ${mn[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const ta=appointments.filter(a=>a.date===ds);
  const slots=therapists.reduce((s,t)=>s+therapistHours(t).length,0);
  const conf=ta.filter(a=>a.status==='conf').length;
  const pend=ta.filter(a=>a.status==='pend').length;
  const noas=ta.filter(a=>a.status==='noas').length;
  const util=slots>0?Math.round(ta.length/slots*100):0;

  document.getElementById('agenda-stats').innerHTML=`
    <div class="stat"><div class="stat-lbl">Citas hoy</div><div class="stat-val">${ta.length}</div><div class="stat-chg neu">${slots} slots disponibles</div></div>
    <div class="stat"><div class="stat-lbl">Confirmadas</div><div class="stat-val" style="color:#1D9E75">${conf}</div><div class="stat-chg up">Listas</div></div>
    <div class="stat"><div class="stat-lbl">Pendientes</div><div class="stat-val" style="color:#BA7517">${pend}</div><div class="stat-chg neu">Por confirmar</div></div>
    <div class="stat"><div class="stat-lbl">No asistieron</div><div class="stat-val" style="color:#E24B4A">${noas}</div><div class="stat-chg down">Seguimiento</div></div>`;

  const vh=getAvailHours();
  const g=document.getElementById('schedule-grid');
  g.innerHTML='';g.style.gridTemplateColumns=`60px repeat(${therapists.length},1fr)`;

  // Header
  const eh=document.createElement('div');eh.className='grid-header';eh.textContent='Hora';g.appendChild(eh);
  therapists.forEach(th=>{
    const c=getColor(th.colorId);
    const h=document.createElement('div');h.className='th-header';
    h.innerHTML=`<div class="avatar" style="background:${c.border}22;color:${c.text}">${esc(th.initials)}</div><div><div class="th-nm">${esc(th.name)}</div><div class="th-sp">${th.startH}:00-${th.endH}:00</div></div>`;
    g.appendChild(h);
  });

  vh.forEach(hr=>{
    const tc=document.createElement('div');tc.className='time-cell';tc.textContent=hr+':00';g.appendChild(tc);
    therapists.forEach(th=>{
      const avail=hr>=th.startH&&hr<th.endH;
      const slot=document.createElement('div');
      slot.className='slot'+(avail?'':' blocked');
      if(avail){
        slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('drag-over')});
        slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
        slot.addEventListener('drop',e=>{
          e.preventDefault();slot.classList.remove('drag-over');
          if(dragData!=null){
            const a=appointments.find(x=>x.id===dragData);
            if(a){
              const ex=appointments.find(x=>x.id!==a.id&&x.date===a.date&&x.therapistId===th.id&&x.hour===hr);
              if(!ex){a.therapistId=th.id;a.hour=hr;renderGrid();}else alert('Slot ocupado.');
            }
          }dragData=null;
        });
      }
      const appt=ta.find(a=>a.therapistId===th.id&&a.hour===hr);
      if(appt&&avail){
        const pt=getPatient(appt.patientId);
        const card=document.createElement('div');
        let sc='';if(appt.status==='pend')sc=' status-pend';else if(appt.status==='noas')sc=' status-noas';
        card.className=`appt ${th.colorId}${sc}`;
        card.draggable=true;
        // Nombre del paciente + tipo — sin punto del doctor
        const doc=pt&&pt.doctorId?getDoctor(pt.doctorId):null;
        const docTag=doc?`<span style="font-size:9px;opacity:.7">${esc(doc.name.split(' ').slice(-1)[0])}</span>`:'';
        // Borde izquierdo = color del doctor referente (si existe), si no = color del terapeuta
        if(doc){card.style.borderLeftColor=doc.color;card.title=`Ref: ${doc.name} (${doc.spec})${appt.status==='conf'?' · Doble click para registrar sesión':''}`;}/* card.title uses textContent — no escape needed */
        card.innerHTML=`<div class="appt-name" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px" title="Ver/editar paciente">${esc(pt?pt.name:(appt.patientName||'Sin paciente'))}</div><div class="appt-sub">${esc(appt.type)}</div><div class="appt-dot" style="background:${dotColor(appt.status)}" title="Estado: ${esc(appt.status)} — click para cambiar"></div><div class="appt-del">×</div>`;
        card.querySelector('.appt-name').addEventListener('click',e=>{e.stopPropagation();openEditPatient(appt.patientId);});
        card.querySelector('.appt-dot').addEventListener('click',e=>{e.stopPropagation();cycleStatus(appt.id);});
        card.querySelector('.appt-del').addEventListener('click',e=>{e.stopPropagation();delAppt(appt.id,e);});
        card.addEventListener('dragstart',()=>{dragData=appt.id});
        card.addEventListener('dblclick',e=>{
          e.stopPropagation();
          if(appt.status==='conf') openSessionModal(appt);
          else if(appt.patientId) {
            showTab('paciente_rpt');
            setTimeout(()=>{
              const sel=document.getElementById('patient-rpt-select');
              if(sel){sel.value=String(appt.patientId);updateEpisodes();}
            },100);
          }
        });
        slot.appendChild(card);
      }
      g.appendChild(slot);
    });
  });
  renderRefLegend();updateResumenBadge();
}


function openDatePicker() {
  const inp = document.getElementById('date-picker-input');
  inp.value = fmtDate(currentDate);
  inp.style.pointerEvents = 'auto';
  inp.showPicker ? inp.showPicker() : inp.click();
  setTimeout(() => inp.style.pointerEvents = 'none', 500);
}

async function delAppt(id,e){
  if(e)e.stopPropagation();
  if(!confirm('¿Eliminar esta cita?'))return;
  
  // Buscar la cita ANTES de eliminarla del array
  const cita = appointments.find(a => a.id === id);
  
  // Si era confirmada, revertir el contador done del paciente
  if(cita && cita.status === 'conf' && cita.patientId){
    const pt = getPatient(cita.patientId);
    if(pt){
      const newDone = Math.max(0, (pt.done||0) - 1);
      pt.done = newDone;
      // Actualizar en DB también
      if(typeof cita.patientId === 'string'){
        await supa.from('patients').update({done: newDone}).eq('id', cita.patientId);
      }
      // Revertir billing si aplica
      if(pt.billing && pt.billing.pendientes > 0){
        pt.billing.pendientes = Math.max(0, pt.billing.pendientes - 1);
        if(typeof cita.patientId === 'string'){
          dbUpdateBillingPendientes(cita.patientId, pt.billing.pendientes);
        }
      }
    }
  }
  
  // Ahora sí, eliminar de memoria y DB
  appointments = appointments.filter(a => a.id !== id);
  renderGrid();
  updateFacturaBadge();
  
  if(typeof id === 'string'){
    const {error} = await supa.from('appointments').delete().eq('id', id);
    if(error) toastErr('Error al eliminar cita: ' + error.message);
    else toastOk('Cita eliminada');
  }
}
function goToDate(ds) {
  if (!ds) return;
  const parts = ds.split('-');
  currentDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  renderGrid();
}

function agendarCitaParaPaciente(patientId) {
  showTab('agenda');
  setTimeout(() => {
    openApptModal();
    // Pre-seleccionar el paciente
    const p = getPatient(patientId);
    if (p) {
      const searchEl = document.getElementById('m-patient-search');
      const hiddenEl = document.getElementById('m-patient');
      if (searchEl) searchEl.value = p.name;
      if (hiddenEl) hiddenEl.value = p.id;
    }
  }, 200);
}

function changeDay(d){currentDate.setDate(currentDate.getDate()+d);renderGrid();}

function openApptModal(){
  if(!therapists.length){toastErr('Primero agrega al menos un terapeuta.');showTab('terapeutas');return;}
  if(!patients.length){toastErr('Primero agrega al menos un paciente.');showTab('pacientes');return;}
  // Limpiar buscador
  document.getElementById('m-date').value = fmtDate(currentDate);
  document.getElementById('m-patient-search').value='';
  document.getElementById('m-patient').value='';
  filterApptPatient();
  // Poblar terapeutas
  document.getElementById('m-therapist').innerHTML=therapists.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} (${t.startH}:00-${t.endH}:00)</option>`).join('');
  updateTimeSlots();
  document.getElementById('appt-modal').classList.add('open');
}
function updateTimeSlots(){
  const th=getTherapist(document.getElementById('m-therapist').value);
  if(!th)return;
  const allH=[];
  for(let h=7;h<=20;h++) allH.push(h);
  document.getElementById('m-time').innerHTML=allH.map(h=>`<option value="${h}">${h}:00</option>`).join('');
  // Seleccionar la primera hora del horario oficial por defecto
  document.getElementById('m-time').value=th.startH||7;
}
async function saveAppt(){
  const thId=document.getElementById('m-therapist').value;
  const hr=parseInt(document.getElementById('m-time').value);
  let patId=document.getElementById('m-patient').value;
  if(!thId){alert('Selecciona un terapeuta.');return;}

  // Si escribieron en el buscador pero no seleccionaron de la lista, buscar por nombre exacto
  if(!patId){
    const searchVal=document.getElementById('m-patient-search').value.trim().toLowerCase();
    const found=patients.find(p=>p.name.toLowerCase()===searchVal);
    if(found){patId=found.id;document.getElementById('m-patient').value=found.id;}
    else{toastErr('Selecciona un paciente de la lista.');return;}
  }
  if(isNaN(hr)){alert('Selecciona una hora válida.');return;}
  // Usar la fecha del modal, o currentDate si no hay fecha seleccionada
  const dateVal = document.getElementById('m-date').value;
  const ds = dateVal || fmtDate(currentDate);
  const today = fmtDate(new Date());
  if(ds < today){ toastErr('No se pueden agendar citas en días pasados.'); return; }
  if(appointments.find(a=>a.date===ds&&a.therapistId===thId&&a.hour===hr)){alert('Ese slot ya está ocupado.');return;}
  const _a={id:++apptCounter,date:ds,therapistId:thId,hour:hr,patientId:document.getElementById('m-patient').value,type:document.getElementById('m-type').value,status:document.getElementById('m-status').value,note:document.getElementById('m-note').value};
  appointments.push(_a);
  closeModal('appt-modal');renderGrid();
  try{
    const {data,error}=await supa.from('appointments').insert({
      date:_a.date, therapist_id:_a.therapistId,
      patient_id:_a.patientId, hour:_a.hour,
      type:_a.type, status:_a.status, note:_a.note||''
    }).select().single();
    if(error){toastErr('Error al guardar cita: '+error.message);}
    else{
      _a.id=data.id;
      // Citas recurrentes
      if(document.getElementById('m-recurrente')?.checked){
        const dias=[...document.querySelectorAll('.rec-day:checked')].map(c=>parseInt(c.value));
        const semanas=parseInt(document.getElementById('m-rec-semanas')?.value||'4');
        if(dias.length){
          const fechas=getRecDates(_a.date,dias,semanas);
          let creadas=0;
          for(const fecha of fechas){
            const {error:re}=await supa.from('appointments').insert({
              date:fecha,therapist_id:_a.therapistId,
              patient_id:_a.patientId,hour:_a.hour,
              type:_a.type,status:'pend',note:_a.note||''
            });
            if(!re){appointments.push({..._a,id:'rec-'+fecha+'-'+Math.random(),date:fecha,status:'pend'});creadas++;}
          }
          if(creadas>0)toastOk('✓ '+(creadas+1)+' citas creadas (recurrentes)');
        }
      }renderGrid();toastOk('Cita guardada correctamente');}
  }catch(e){toastErr('Error de conexión al guardar cita.');}
  updateFacturaBadge();
}

function updateGlobalSPF(v){
  const n=parseInt(v)||5;
  patients.forEach(p=>{if(p.billing)p.billing.sesPerFactura=n;});
  if(document.getElementById('facturacion-content').children.length>0)renderFacturacion();
  updateFacturaBadge();
}

// ======= RESUMEN DEL DÍA =======
function updateResumenBadge(){
  const ds=fmtDate(currentDate);
  const n=appointments.filter(a=>a.date===ds&&(a.status==='pend'||a.status==='noas')).length;
  const b=document.getElementById('resumen-badge');
  b.textContent=n;b.style.display=n>0?'':'none';
}
function renderResumen(){
  const ds=fmtDate(currentDate);
  const dn=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('resumen-day-lbl').textContent=`${dn[currentDate.getDay()]} ${currentDate.getDate()} de ${mn[currentDate.getMonth()]}`;
  const ta=appointments.filter(a=>a.date===ds);
  const noAs=ta.filter(a=>a.status==='noas');
  const pend=ta.filter(a=>a.status==='pend');
  const conf=ta.filter(a=>a.status==='conf');

  function row(a,kind){
    const pt=getPatient(a.patientId);const th=getTherapist(a.therapistId);const doc=pt&&pt.doctorId?getDoctor(pt.doctorId):null;
    const col=kind==='noas'?'#E24B4A':kind==='pend'?'#BA7517':'#1D9E75';
    const hasSession=a.hasSession||false;
    const pt_check = getPatient(a.patientId);
    const tieneEval = pt_check ? hasEvalInicial(pt_check) : true;
    const evalInicialBtn = (kind==='conf' && !tieneEval)
      ? `<button onclick="openEvalInicial('${a.patientId}')"
          style="font-size:10px;padding:4px 10px;border:1px solid rgba(224,80,80,.4);border-radius:99px;cursor:pointer;font-family:inherit;font-weight:600;background:rgba(224,80,80,.08);color:#E24B4A">
          ⚠️ Eval. inicial
        </button>` : '';
    const sessBtn=`<button onclick="openSessionModal(appointments.find(x=>x.id==='${a.id}'))" 
      style="font-size:10px;padding:4px 12px;border:none;border-radius:99px;cursor:pointer;font-family:inherit;font-weight:600;
      background:${hasSession?'rgba(29,158,117,.15)':'rgba(224,168,80,.2)'};
      color:${hasSession?'#1D9E75':'#e0a850'}">
      ${hasSession?'✓ Sesión ok':'📋 Completar sesión'}
    </button>${evalInicialBtn}`;
    const btns=kind!=='conf'?`<div class="resumen-actions">
     <button class="resumen-btn wa" onclick="simWA('${pt?pt.name:''}','${pt?pt.tel||'':''}')" style='white-space:nowrap'>WA</button>
      <button class="resumen-btn em" onclick="simEmail('${pt?pt.name:''}','${pt?pt.email||'':''}')">Email</button>
      <button class="resumen-btn rep" onclick="openApptModal()">Reagendar</button>
    </div>`:`<div class="resumen-actions" style="display:flex;align-items:center;gap:6px">${sessBtn}<span style="font-size:10px;color:#1D9E75;font-weight:500">✓ Asistió</span></div>`;
    return`<div class="resumen-row">
      <div style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:#1a1917">${pt?pt.name:'Paciente'}</div>
        <div style="font-size:11px;color:#6b6a64">${a.hour}:00 · ${a.type} · ${th?th.name:''}${doc?' · Ref: '+doc.name:''}</div>
      </div>${btns}</div>`;
  }

  let html='';
  if(noAs.length)html+=`<div class="resumen-section"><div class="resumen-section-title"><span style="width:8px;height:8px;border-radius:50%;background:#E24B4A;display:inline-block"></span>No asistieron (${noAs.length})</div>${noAs.map(a=>row(a,'noas')).join('')}</div>`;
  if(pend.length)html+=`<div class="resumen-section"><div class="resumen-section-title"><span style="width:8px;height:8px;border-radius:50%;background:#BA7517;display:inline-block"></span>Pendientes de confirmar (${pend.length})</div>${pend.map(a=>row(a,'pend')).join('')}</div>`;
  if(conf.length)html+=`<div class="resumen-section"><div class="resumen-section-title"><span style="width:8px;height:8px;border-radius:50%;background:#1D9E75;display:inline-block"></span>Asistieron correctamente (${conf.length})</div>${conf.map(a=>row(a,'conf')).join('')}</div>`;
  if(!ta.length)html='<div style="color:#6b6a64;font-size:13px;padding:20px 0">No hay citas registradas para hoy.</div>';
  document.getElementById('resumen-content').innerHTML=html;
}
function openWA(patientId) {
  const p = getPatient(patientId);
  if (!p || !p.tel) { toastErr('Sin teléfono registrado'); return; }
  const tel = '593' + p.tel.replace(/[^0-9]/g,'').slice(-9);
  window.open('https://wa.me/' + tel, '_blank');
}

function waPatient(encodedName) {
  const name = decodeURIComponent(encodedName);
  const pt = patients.find(p => p.name === name);
  if (pt) simWA(pt.name, pt.tel || '');
}

function hasEvalInicial(p) {
  return (p.log||[]).some(s => s.type === 'Evaluación inicial');
}

function simWA(nombre,tel){
  const msg=encodeURIComponent('Hola '+nombre+', le contactamos desde Rehactiva Rehabilitación. Notamos que no pudo asistir a su cita de hoy. ¿Le ayudamos a reagendar?');
  const num=(tel?tel.replace(/[^0-9]/g,''):'593999211258');
  window.open('https://wa.me/'+num+'?text='+msg,'_blank');
}
function simEmail(nombre,email){
  if(email){
    window.location.href=`mailto:${email}?subject=Ausencia en cita - Rehactiva&body=Hola ${nombre},%0A%0ANotamos que no pudo asistir a su cita de hoy en Rehactiva Rehabilitación y Fisioterapia.%0A%0A¿Le podemos ayudar a reagendar? Responda este correo o llámenos.%0A%0ASaludos,%0AEquipo Rehactiva`;
  } else {
    alert(`${nombre} no tiene correo registrado. Agrégalo en su perfil.`);
  }
}

// ======= PACIENTES =======
function openPatientModal(){
  document.getElementById('pm-doctor').innerHTML='<option value="">Sin doctor referente</option>'+doctors.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  document.getElementById('patient-modal').classList.add('open');
}
async function savePatient(){
  if(editingPatientId){
    // EDITAR paciente existente
    const p=getPatient(editingPatientId);
    if(!p)return;
    p.name=document.getElementById('pm-name').value.trim();
    p.age=parseInt(document.getElementById('pm-age').value)||35;
    p.cedula=document.getElementById('pm-cedula').value||'';
    p.tel=document.getElementById('pm-tel').value||'';
    p.email=document.getElementById('pm-email').value||'';
    p.dir=document.getElementById('pm-dir').value||'';
    p.diag=document.getElementById('pm-diag').value||'';
    p.doctorId=document.getElementById('pm-doctor').value||null;
    p.sessions=parseInt(document.getElementById('pm-sessions').value)||10;
    p.status=document.getElementById('pm-status').value;
    closeModal('patient-modal');
    renderPatients();
    document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
    editingPatientId=null;
    if(typeof p.id==='string'){
      const {error}=await supa.from('patients').update({
        name:p.name,age:p.age,cedula:p.cedula,tel:p.tel,email:p.email,
        dir:p.dir,diag:p.diag,
        doctor_id:p.doctorId||null,sessions:p.sessions,status:p.status
      }).eq('id',p.id);
      if(error){toastErr('Error al actualizar paciente: '+error.message);}
      else{toastOk('Paciente actualizado correctamente');}
    }
    return;
  }
  // CREAR nuevo paciente — continúa abajo
  const _dummy=null;
  if(_dummy)return;
  const name=document.getElementById('pm-name').value.trim();
  if(!name){alert('Ingresa el nombre.');return;}
  patients.push({id:++patCounter,name,
    age:parseInt(document.getElementById('pm-age').value)||35,
    cedula:document.getElementById('pm-cedula').value||'',
    tel:document.getElementById('pm-tel').value||'',
    email:document.getElementById('pm-email').value||'',
    dir:document.getElementById('pm-dir').value||'',
    diag:document.getElementById('pm-diag').value||'Sin diagnóstico',
    therapistId:null,
    doctorId:document.getElementById('pm-doctor').value||null,
    sessions:parseInt(document.getElementById('pm-sessions').value)||12,
    done:0,status:document.getElementById('pm-status').value,log:[],billing:{sesPerFactura:parseInt(document.getElementById('global-spf').value)||5,facturas:[],pendientes:parseInt(document.getElementById('pm-billing-start').value)||0}});
  const _p=patients[patients.length-1];
  closeModal('patient-modal');
  try{
    const {data,error}=await supa.from('patients').insert({
      name:_p.name, age:_p.age, cedula:_p.cedula, tel:_p.tel,
      email:_p.email, dir:_p.dir, diag:_p.diag,
      doctor_id:_p.doctorId||null,
      sessions:_p.sessions, done:0, status:_p.status,
      billing_ses_per_factura:_p.billing.sesPerFactura,
      billing_pendientes:_p.billing.pendientes
    }).select().single();
    if(error){toastErr('Error al guardar paciente: '+error.message);}
    else{
      const newId = data ? data.id : null;
      await loadAll();renderPatients();
      // Guardar evaluación inicial si se llenó
      const evalData = null;
      if(evalData && newId && (evalData.anamnesis||evalData.ant_per||evalData.notas)) {
        const evalNote = [
          evalData.ant_fam ? 'Ant. familiares: '+evalData.ant_fam : '',
          evalData.ant_per ? 'Ant. personales: '+evalData.ant_per : '',
          evalData.zonas ? 'Zonas: '+evalData.zonas : '',
          evalData.obs ? 'Observación: '+evalData.obs : '',
          evalData.insp ? 'Inspección: '+evalData.insp : '',
          evalData.palp ? 'Palpación: '+evalData.palp : '',
          evalData.movilidad ? 'Movilidad: '+evalData.movilidad : '',
          evalData.fuerza ? 'Fuerza: '+evalData.fuerza : '',
          evalData.pedido_medico ? 'Pedido médico: SÍ' : '',
          evalData.notas ? evalData.notas : ''
        ].filter(Boolean).join(' | ');
        await supa.from('session_log').insert({
          patient_id: newId,
          date: fmtDate(new Date()),
          type: 'Evaluación inicial',
          hour: '00:00',
          status: 'asistió',
          pain_before: evalData.eva_inicial,
          pain_after: evalData.eva_inicial,
          note: evalData.anamnesis ? evalData.anamnesis + ' | ' + evalNote : evalNote
        });
      }
      
      toastOk('Paciente guardado correctamente');
    }
  }catch(e){toastErr('Error de conexión al guardar paciente.');}
  ['pm-name','pm-diag','pm-cedula','pm-tel','pm-email','pm-dir'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pm-billing-start').value='0';
  editingPatientId=null;
  document.querySelector('#patient-modal h3').textContent='Nuevo paciente';
}
function renderPatients(){
  const q=(document.getElementById('patient-search').value||'').toLowerCase();
  let f=patients.filter(p=>p.name.toLowerCase().includes(q)||p.diag.toLowerCase().includes(q));
  // Ordenar: sin evaluación inicial primero
  f.sort((a,b)=>{
    const aEval=hasEvalInicial(a), bEval=hasEvalInicial(b);
    if(!aEval && bEval) return -1;
    if(aEval && !bEval) return 1;
    return a.name.localeCompare(b.name);
  });
  document.getElementById('patient-tbody').innerHTML=f.map(p=>{
    const th=getTherapist(p.therapistId);
    const doc=p.doctorId?getDoctor(p.doctorId):null;
    const pct=Math.round(p.done/p.sessions*100);
    const bc=p.status==='active'?'pg':p.status==='alta'?'pb':'pa';
    const bt=p.status==='active'?'Activo':p.status==='alta'?'Alta':'Pendiente';
    const adh=p.log.length>0?Math.round(p.log.filter(s=>s.status==='asistió').length/p.log.length*100):0;
    const ac=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
    const dc=doc
      ?`<span style="display:inline-flex;align-items:center;gap:5px;background:${doc.color}18;border:1px solid ${doc.color}44;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:500;color:${doc.color};white-space:nowrap">${esc(doc.name)}</span>`
      :'<span style="font-size:10px;color:#6b6a64;font-style:italic">Independiente</span>';
    return`<tr>
      <td style="font-weight:500;color:#1a1917">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${esc(p.name)}
          ${!hasEvalInicial(p)?'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:#fee2e2;color:#991b1b">⚠️ Sin eval.</span>':'<span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:99px;background:#dcfce7;color:#166534">✓ Eval. ok</span>'}
        </div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class='th-btn' style='font-size:9px;padding:2px 6px' onclick='openEditPatient("${p.id}")'>Editar</button>
          <button class='th-btn del' style='font-size:9px;padding:2px 6px' onclick='deletePatient("${p.id}")'>Eliminar</button>
          ${!hasEvalInicial(p)?'<button class=\'th-btn\' style=\'font-size:9px;padding:2px 6px;background:rgba(224,80,80,.1);color:#E24B4A;border-color:rgba(224,80,80,.3)\' onclick=\'openEvalInicial("'+p.id+'")\'> Eval. inicial</button>':''}
        </div>
      </td>
      <td style="color:#6b6a64;font-size:11px">${esc(p.diag)}</td>
      <td style="font-size:11px">${dc}</td>
      <td><div style="font-size:11px;margin-bottom:3px;color:#6b6a64">${p.done}/${p.sessions} (${pct}%)</div><div class="bar-wrap prog-mini"><div class="bar-fill" style="width:${pct}%;background:#1D9E75"></div></div></td>
      <td><span style="font-size:13px;font-weight:500;color:${ac}">${adh}%</span></td>
      <td><span class="pill ${bc}">${bt}</span></td>
    </tr>`;
  }).join('');
}


async function deletePatient(id){
  if(!confirm('¿Eliminar este paciente? Se eliminarán también sus citas y cobros.'))return;
  patients=patients.filter(p=>p.id!==id);
  appointments=appointments.filter(a=>a.patientId!==id);
  renderPatients();renderGrid();
  if(typeof id==='string'){
    toastInfo('Eliminando...');
    await supa.from('session_log').delete().eq('patient_id',id);
    await supa.from('cobros').delete().eq('patient_id',id);
    await supa.from('appointments').delete().eq('patient_id',id);
    const {error}=await supa.from('patients').delete().eq('id',id);
    if(error){toastErr('Error al eliminar paciente: '+error.message);}
    else{toastOk('Paciente eliminado correctamente');}
  } else {
    toastInfo('Paciente eliminado de la sesión (no estaba guardado en la base de datos).');
  }
}

// ======= INFORMES =======

function renderSemanal(){
  updateWeekLabel();
  const semStart=new Date(currentDate);
  semStart.setDate(semStart.getDate()-semStart.getDay()+1);
  const semEnd=new Date(semStart); semEnd.setDate(semStart.getDate()+4);
  const semDates=[];
  for(let i=0;i<5;i++){const d=new Date(semStart);d.setDate(semStart.getDate()+i);semDates.push(fmtDate(d));}
  const semAppts=appointments.filter(a=>semDates.includes(a.date));
  const conf=semAppts.filter(a=>a.status==='conf');
  const noas=semAppts.filter(a=>a.status==='noas');
  const pend=semAppts.filter(a=>a.status==='pend');
  const total=semAppts.length;
  const tasaAsist=total>0?Math.round(conf.length/total*100):0;
  const patsAtendidos=new Set(conf.map(a=>a.patientId)).size;
  const patsNoas=new Set(noas.map(a=>a.patientId)).size;
  const ingresosEst=conf.length*25;
  const semLabel=fmtDate(semStart)+' al '+fmtDate(semEnd);

  // Top diagnósticos
  const diagCount={};
  conf.forEach(a=>{const pt=getPatient(a.patientId);if(pt&&pt.diag){const d=pt.diag.split(/[,;]/)[0].trim();diagCount[d]=(diagCount[d]||0)+1;}});
  const topDiag=Object.entries(diagCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const proxAlta=patients.filter(p=>p.status==='active'&&p.sessions>0&&Math.round((p.done/p.sessions)*100)>=80).slice(0,5);

  const statsHtml=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:11px;color:#6b6a64;text-transform:uppercase;letter-spacing:.05em">Semana del</div>
      <div style="font-size:14px;font-weight:600;color:#1a1917">${semLabel}</div>
    </div>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis con IA ↗</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div class="stat"><div class="stat-lbl">Citas totales</div><div class="stat-val">${total}</div><div style="font-size:10px;color:#6b6a64">${semDates.length} días hábiles</div></div>
    <div class="stat"><div class="stat-lbl">Asistencia</div><div class="stat-val" style="color:${tasaAsist>=80?'#1D9E75':tasaAsist>=60?'#BA7517':'#E24B4A'}">${tasaAsist}%</div><div style="font-size:10px;color:#6b6a64">${conf.length} confirmadas</div></div>
    <div class="stat"><div class="stat-lbl">No asistieron</div><div class="stat-val" style="color:#E24B4A">${noas.length}</div><div style="font-size:10px;color:#6b6a64">${patsNoas} pacientes</div></div>
    <div class="stat"><div class="stat-lbl">Ingreso estimado</div><div class="stat-val" style="color:#1D9E75">$${ingresosEst}</div><div style="font-size:10px;color:#6b6a64">a $25/sesión</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes atendidos</div><div class="stat-val">${patsAtendidos}</div><div style="font-size:10px;color:#6b6a64">únicos</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes activos</div><div class="stat-val">${patients.filter(p=>p.status==='active').length}</div><div style="font-size:10px;color:#6b6a64">en tratamiento</div></div>
  </div>
  <div class="full-card" style="margin-bottom:12px">
    <div class="card-title" style="margin-bottom:10px">Desempeño por terapeuta</div>
    ${therapists.map(th=>{
      const thAppts=semAppts.filter(a=>a.therapistId===th.id);
      const thConf=thAppts.filter(a=>a.status==='conf').length;
      const thNoas=thAppts.filter(a=>a.status==='noas').length;
      const slots=therapistHours(th).length*5;
      const util=slots>0?Math.round(thConf/slots*100):0;
      const c=getColor(th.colorId);
      const uc=util>=80?'#1D9E75':util>=60?'#BA7517':'#E24B4A';
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.06)">'
        +'<div class="avatar" style="background:'+c.border+'22;color:'+c.text+';width:32px;height:32px;font-size:11px;flex-shrink:0">'+th.initials+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12px;font-weight:600;color:#1a1917">'+th.name+'</div>'
        +'<div style="display:flex;gap:10px;margin-top:2px"><span style="font-size:11px;color:#1D9E75">✓ '+thConf+'</span><span style="font-size:11px;color:#E24B4A">✗ '+thNoas+'</span></div>'
        +'<div style="margin-top:4px;height:4px;background:#f0efe8;border-radius:2px"><div style="height:4px;width:'+Math.min(util,100)+'%;background:'+uc+';border-radius:2px"></div></div>'
        +'</div><div style="font-size:15px;font-weight:700;color:'+uc+';flex-shrink:0">'+util+'%</div></div>';
    }).join('')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Top diagnósticos</div>
      ${topDiag.length?topDiag.map(([d,n])=>
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.05)">'
        +'<span style="font-size:11px;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">'+d+'</span>'
        +'<span style="font-size:11px;font-weight:700;color:#1D9E75;background:rgba(29,158,117,.1);padding:1px 7px;border-radius:99px;flex-shrink:0">'+n+'</span></div>'
      ).join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Sin datos esta semana</div>'}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Próximos a alta ≥80%</div>
      ${proxAlta.length?proxAlta.map(p=>{
        const pct=Math.round(p.done/p.sessions*100);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.05)">'
          +'<span style="font-size:11px;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">'+p.name.split(' ').slice(0,2).join(' ')+'</span>'
          +'<span style="font-size:11px;font-weight:700;color:#BA7517;background:rgba(186,117,23,.1);padding:1px 7px;border-radius:99px;flex-shrink:0">'+pct+'%</span></div>';
      }).join(''):'<div style="font-size:12px;color:#9c9a92;padding:8px 0">Ninguno cerca del alta</div>'}
    </div>
  </div>
  ${(function(){
    if(!noas.length) return '';
    let r='<div class="full-card"><div class="card-title" style="margin-bottom:10px">No asistieron — requieren seguimiento</div>';
    noas.slice(0,6).forEach(function(a){
      var pt=getPatient(a.patientId);var th=getTherapist(a.therapistId);
      var tel=pt&&pt.tel?'593'+pt.tel.replace(/[^0-9]/g,'').slice(-9):'';
      var waBtn=tel?'<button onclick="window.open(\'https://wa.me/'+tel+'\',\'_blank\')" style="font-size:10px;padding:3px 10px;background:rgba(37,211,102,.12);color:#25d366;border:none;border-radius:99px;cursor:pointer;font-weight:600">WA</button>':'';
      r+='<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(224,80,80,.08)">'
        +'<div><div style="font-size:12px;font-weight:500;color:#1a1917">'+(pt?pt.name:'Paciente')+'</div>'
        +'<div style="font-size:10px;color:#9c9a92">'+a.date+(th?' · '+th.name:'')+'</div></div>'
        +waBtn+'</div>';
    });
    r+='</div>';return r;
  })()}`;

  document.getElementById('semanal-stats').innerHTML=statsHtml;
  renderHeatmap();
  renderTherapistUtil();
  renderInsights();
}

function hmCol(p){if(p===null)return'#f0efe8';if(p===0)return'#f0efe8';if(p<25)return'#e8f5f0';if(p<50)return'#c5e8d8';if(p<75)return'#7dd9b2';if(p<90)return'#1D9E75';return'#0F6E56';}
function renderHeatmap(){
  let html=`<div class="heatmap-grid" style="grid-template-columns:50px repeat(5,1fr)"><div class="hm-hdr"></div>`;
  DAYS.forEach(d=>{html+=`<div class="hm-hdr">${d}</div>`;});
  ALL_HOURS.forEach(hr=>{
    html+=`<div class="hm-lbl">${hr}:00</div>`;
    DAYS.forEach(d=>{
      const av=therapists.filter(t=>hr>=t.startH&&hr<t.endH).length;
      if(!av){html+=`<div class="hm-cell" style="background:#f0efe8"><span style="font-size:9px;color:#444">—</span></div>`;return;}
      const occ=Math.min(av,Math.floor(hr>=9&&hr<=11?av*0.9:hr>=7&&hr<=8?av*0.75:hr===12||hr===13?av*0.4:av*0.55));
      const p=Math.round(occ/av*100);
      const tc=p>=75?'#e8e6e1':'#5ecfa0';
      html+=`<div class="hm-cell" style="background:${hmCol(p)};color:${tc}">${p}%<div class="tooltip-val">${d} ${hr}:00 — ${occ}/${av} · ${p}%</div></div>`;
    });
  });
  html+='</div>';document.getElementById('heatmap-container').innerHTML=html;
}
function renderTherapistUtil(){
  // Calcular utilización real desde appointments
  const semStart=new Date(currentDate);
  semStart.setDate(semStart.getDate()-semStart.getDay()+1);
  const semDates=[];
  for(let i=0;i<5;i++){const d=new Date(semStart);d.setDate(semStart.getDate()+i);semDates.push(fmtDate(d));}
  document.getElementById('th-util-report').innerHTML=therapists.map(th=>{
    const ts=therapistHours(th).length*5; // slots del horario oficial (base de comparación)
    const us=appointments.filter(a=>a.therapistId===th.id&&semDates.includes(a.date)&&a.status==='conf').length;
    const u=ts>0?Math.round(us/ts*100):0; // puede superar 100% si hay citas extra
    const c=getColor(th.colorId);const uc=u>=80?'#1D9E75':u>=60?'#BA7517':'#E24B4A';
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)">
      <div class="avatar" style="background:${c.border}22;color:${c.text};width:30px;height:30px">${esc(th.initials)}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:500;color:#1a1917">${esc(th.name)}</div>
        <div style="font-size:10px;color:#6b6a64">${th.startH}:00–${th.endH}:00</div>
        <div class="util-bar"><div class="util-fill" style="width:${u}%;background:${uc}"></div></div>
      </div>
      <div style="text-align:right;min-width:48px"><div style="font-size:15px;font-weight:500;color:${uc}">${u}%</div><div style="font-size:10px;color:#6b6a64">${us}/${ts}</div></div>
    </div>`;
  }).join('');
}
function renderInsights(){
  const items=[
    {bg:'#271d0e',tc:'#e0a850',icon:'!',t:'12:00-13:00 bajo el 40%',s:'Mediodía con baja ocupación.'},
    {bg:'#0d2a21',tc:'#5ecfa0',icon:'↑',t:'09:00-11:00 al 90%+',s:'Mayor demanda. Evalúa otro terapeuta.'},
    {bg:'#2b0f0f',tc:'#f07070',icon:'✕',t:'2 inasistencias sin aviso',s:'Lucía Herrera y Carlos Mendoza.'},
    {bg:'#0d1e2e',tc:'#7ab8e8',icon:'i',t:'Turno mañana más ocupado',s:'Mixtos tienen más horas libres.'},
  ];
  document.getElementById('insights').innerHTML=items.map(x=>`<div class="insight-row"><div class="insight-icon" style="background:${x.bg};color:${x.tc}">${x.icon}</div><div><div class="insight-text">${x.t}</div><div class="insight-sub">${x.s}</div></div></div>`).join('');
}
function changeWeek(d){currentWeek+=d;updateWeekLabel();renderHeatmap();renderTherapistUtil();}
function updateWeekLabel(){
  const base=new Date();
  const s=new Date(base);
  s.setDate(base.getDate()+currentWeek*7-(base.getDay()||7)+1);
  const e=new Date(s);e.setDate(s.getDate()+4);
  const f=x=>`${x.getDate()}/${x.getMonth()+1}`;
  document.getElementById('week-lbl').textContent=`Semana ${f(s)} – ${f(e)} ${e.getFullYear()}`;
}
function showSubTab(n,btn){
  ['semanal','mensual','anual'].forEach(t=>document.getElementById('subtab-'+t).style.display=t===n?'':'none');
  document.querySelectorAll('#tab-informes .sub-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  if(n==='semanal')renderSemanal();if(n==='mensual')renderMensual();if(n==='anual')renderAnual();
}
function renderMensual(){
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <select style="background:#ffffff;border:1px solid rgba(29,158,117,.2);border-radius:6px;padding:7px 12px;font-size:13px;color:#1a1917"><option>Marzo 2026</option><option>Febrero 2026</option><option>Enero 2026</option></select>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis con IA ↗</button>
  </div>`;
  html+=`<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Sesiones del mes</div><div class="stat-val">38</div><div class="stat-chg down">-12% vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Continuidad promedio</div><div class="stat-val" style="color:#BA7517">81%</div><div class="stat-chg neu">Meta: 85%</div></div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div><div class="stat-val" style="color:#E24B4A">7</div><div class="stat-chg down">+2 vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes activos</div><div class="stat-val">${patients.filter(p=>p.status==='active').length}</div><div class="stat-chg up">+1 vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Altas médicas</div><div class="stat-val">${patients.filter(p=>p.status==='alta').length}</div><div class="stat-chg up">+1 vs feb</div></div>
    <div class="stat"><div class="stat-lbl">Nuevos pacientes</div><div class="stat-val">3</div><div class="stat-chg up">+1 vs feb</div></div>
  </div>`;
  html+=`<div class="full-card"><div class="card-title">Pacientes por doctor referente</div>`;
  doctors.forEach(d=>{
    const n=patients.filter(p=>p.doctorId===d.id).length;
    html+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(29,158,117,.1)"><span style="width:10px;height:10px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0"></span><div style="flex:1;font-size:12px;color:#c8c6c0">${esc(d.name)} <span style="color:#6b6a64">(${esc(d.spec)})</span></div><div style="font-size:13px;font-weight:500;color:#1a1917">${n}</div></div>`;
  });
  html+=`</div><div class="full-card"><div class="card-title">Tendencia — últimos 3 meses</div><canvas id="monthly-chart" height="80"></canvas></div>`;
  document.getElementById('mensual-content').innerHTML=html;
  setTimeout(()=>{
    const ctx=document.getElementById('monthly-chart');if(!ctx)return;
    Chart.defaults.color='#6b6a64';
    new Chart(ctx,{type:'bar',data:{labels:['Enero','Febrero','Marzo'],datasets:[
      {label:'Sesiones',data:[30,42,38],backgroundColor:'#1D9E75',borderRadius:4},
      {label:'Continuidad %',data:[78,84,81],backgroundColor:'#378ADD',borderRadius:4},
      {label:'Inasistencias',data:[8,5,7],backgroundColor:'#E24B4A',borderRadius:4},
    ]},options:{responsive:true,plugins:{legend:{labels:{font:{size:11},color:'#9c9a92'}}},scales:{y:{beginAtZero:true,ticks:{color:'#6b6a64',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}},x:{ticks:{color:'#6b6a64'},grid:{display:false}}}}});
  },50);
}
function renderAnual(){
  const mn=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const s=[30,42,38,0,0,0,0,0,0,0,0,0];
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div style="font-size:14px;font-weight:500;color:#1a1917">Informe anual 2026</div>
    <button class="ai-btn" onclick="genSemanalAI()">Análisis anual con IA ↗</button>
  </div>`;
  html+=`<div class="informe-stat-grid">
    <div class="stat"><div class="stat-lbl">Sesiones acumuladas</div><div class="stat-val">110</div><div class="stat-chg neu">Ene-Mar 2026</div></div>
    <div class="stat"><div class="stat-lbl">Continuidad prom.</div><div class="stat-val" style="color:#BA7517">81%</div><div class="stat-chg neu">Meta: 85%</div></div>
    <div class="stat"><div class="stat-lbl">Altas médicas</div><div class="stat-val" style="color:#1D9E75">4</div><div class="stat-chg up">Acumulado</div></div>
    <div class="stat"><div class="stat-lbl">Pacientes únicos</div><div class="stat-val">${patients.length}</div><div class="stat-chg neu">Año hasta hoy</div></div>
    <div class="stat"><div class="stat-lbl">Inasistencias</div><div class="stat-val" style="color:#E24B4A">20</div><div class="stat-chg neu">Acumuladas</div></div>
    <div class="stat"><div class="stat-lbl">Proyección anual</div><div class="stat-val">440</div><div class="stat-chg up">Sesiones est.</div></div>
  </div>`;
  html+=`<div class="full-card"><div class="card-title">Sesiones por mes — 2026</div><canvas id="anual-chart" height="80"></canvas></div>`;
  document.getElementById('anual-content').innerHTML=html;
  setTimeout(()=>{
    const ctx=document.getElementById('anual-chart');if(!ctx)return;
    Chart.defaults.color='#6b6a64';
    new Chart(ctx,{type:'bar',data:{labels:mn,datasets:[{label:'Sesiones',data:s,backgroundColor:s.map(v=>v>0?'#1D9E75':'#1a1917'),borderRadius:4}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{color:'#6b6a64',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}},x:{ticks:{color:'#6b6a64'},grid:{display:false}}}}});
  },50);
}

// ======= INFORME PACIENTE =======
// Los pacientes pueden tener múltiples episodios (simulados como rangos del log)
function renderPatientReportSelect(){
  const sel=document.getElementById('patient-rpt-select');
  sel.innerHTML=patients.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(patients.length>0) sel.value=String(patients[0].id);
  updateEpisodes();
}
function updateEpisodes(){
  const id=document.getElementById('patient-rpt-select').value;
  const p=patients.find(x=>String(x.id)===String(id));
  const ep=document.getElementById('patient-rpt-episode');
  if(!p){ep.innerHTML='<option value="0">Episodio actual</option>';renderPatientReport();return;}

  // Detectar episodios por marcadores "Fin de episodio" en el log
  const log = p.log || [];
  const finEpisodios = log.filter(s => s.type === 'Fin de episodio').sort((a,b) => a.date > b.date ? 1 : -1);

  let options = '';
  if(finEpisodios.length === 0){
    // Solo un episodio
    options = `<option value="current">Episodio actual — ${esc(p.diag||'Sin diagnóstico')}</option>`;
  } else {
    // Episodio actual
    options = `<option value="current">Episodio actual — ${esc(p.diag||'Sin diagnóstico')}</option>`;
    // Episodios anteriores
    finEpisodios.forEach((fin, i) => {
      const diagAnterior = fin.note ? fin.note.split('Episodio anterior: ')[1]?.split(' · ')[0] || 'Tratamiento anterior' : 'Tratamiento anterior';
      const sesiones = fin.note ? fin.note.split('·')[1]?.trim() || '' : '';
      options += `<option value="ep_${i}">Episodio ${i+1} — ${esc(diagAnterior)} (${esc(fin.date)})</option>`;
    });
  }
  ep.innerHTML = options;
  renderPatientReport();
}
function renderPatientReport(){
  const id=document.getElementById('patient-rpt-select').value;
  const p=patients.find(x=>String(x.id)===String(id));
  const out=document.getElementById('patient-report-content');
  if(!p){out.innerHTML='<div style="color:#6b6a64;padding:20px;text-align:center">Selecciona un paciente del buscador</div>';return;}
  // Filtrar log según episodio seleccionado
  const epVal = document.getElementById('patient-rpt-episode')?.value || 'current';
  const fullLog = (p.log||[]).filter(s=>s&&s.date);
  const finMarkers = fullLog.filter(s=>s.type==='Fin de episodio').sort((a,b)=>a.date>b.date?1:-1);
  let log, epDiag = p.diag, epSessions = p.sessions, epDone = p.done;
  
  if(epVal === 'current' || finMarkers.length === 0){
    // Episodio actual: desde el último fin de episodio hasta hoy
    const lastFin = finMarkers.slice(-1)[0];
    log = lastFin ? fullLog.filter(s => s.date > lastFin.date && s.type !== 'Fin de episodio') : fullLog.filter(s => s.type !== 'Fin de episodio');
  } else {
    // Episodio anterior: entre marcadores
    const epIdx = parseInt(epVal.replace('ep_',''));
    const finStart = epIdx > 0 ? finMarkers[epIdx-1] : null;
    const finEnd = finMarkers[epIdx];
    log = fullLog.filter(s => {
      if(s.type === 'Fin de episodio') return false;
      if(finStart && s.date <= finStart.date) return false;
      if(finEnd && s.date > finEnd.date) return false;
      return true;
    });
    // Recuperar diagnóstico del episodio anterior del marcador
    if(finEnd && finEnd.note){
      epDiag = finEnd.note.split('Episodio anterior: ')[1]?.split(' ·')[0] || p.diag;
      const sesStr = finEnd.note.match(/(\d+) sesiones/);
      epSessions = sesStr ? parseInt(sesStr[1]) : p.sessions;
      epDone = log.filter(s=>s.status==='asistió').length;
    }
  }
  const isCurrentEpisode = epVal === 'current';
  const th=getTherapist(p.therapistId);
  const doc=p.doctorId?getDoctor(p.doctorId):null;
  const attended=log.filter(s=>s.status==='asistió');
  const adh=log.length>0?Math.round(attended.length/log.length*100):0;
  const pct=epSessions>0?Math.round(epDone/epSessions*100):0;
  const lp=attended.slice(-1)[0];
  const fp=attended[0];
  const thC=th?getColor(th.colorId):COLOR_OPTIONS[0];
  // Badge dinámico: depende de sesiones reales, no solo del campo status
  const citasConf = appointments.filter(a => String(a.patientId)===String(p.id) && a.status==='conf').length;
  const sesCompletas = (p.done||0) >= (p.sessions||1) && p.sessions > 0;
  let sp = '';
  if (p.status === 'alta' || sesCompletas) {
    sp = '<span class="pill pb">Alta médica</span>';
  } else if (citasConf >= 1 || (p.done||0) >= 1) {
    sp = '<span class="pill pg">En tratamiento</span>';
  }
  // Si tiene 0 citas confirmadas y 0 sesiones — sin badge
  const ac=adh>=85?'#1D9E75':adh>=70?'#BA7517':'#E24B4A';
  // Aviso de episodio completo
  const avisoEpisodio = sesCompletas && p.status !== 'alta'
    ? `<div style="background:#fef3c7;border:1px solid rgba(186,117,23,.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div style="font-size:12px;font-weight:600;color:#BA7517">✓ Tratamiento completado</div>
          <div style="font-size:11px;color:#6b6a64;margin-top:2px">${esc(p.name)} completó sus ${p.sessions} sesiones. ¿Viene por algo nuevo?</div>
        </div>
        <button onclick="nuevoEpisodio('${esc(p.id)}')" style="padding:6px 12px;background:#BA7517;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">Nuevo episodio</button>
      </div>` : '';

  // ── Header del paciente ──
  let html=avisoEpisodio+`<div class="full-card" style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
    <div class="avatar" style="background:${thC.border}22;color:${thC.text};width:48px;height:48px;font-size:16px;flex-shrink:0">${esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
    <div style="flex:1">
      <div style="font-size:15px;font-weight:600;color:#1a1917;margin-bottom:3px">${esc(p.name)} ${sp}</div>
      <div style="font-size:12px;color:#6b6a64">${esc(epDiag||p.diag||'Sin diagnóstico')} · ${p.age||'?'} años${!isCurrentEpisode?' <span style="font-size:10px;background:#fef3c7;color:#BA7517;padding:1px 7px;border-radius:99px;margin-left:4px">Episodio anterior</span>':''}</div>
      ${doc?`<div style="font-size:11px;color:#5a5a56;margin-top:2px">Ref: ${esc(doc.name)} (${esc(doc.spec)})</div>`:''}
      ${p.cedula?`<div style="font-size:11px;color:#6b6a64;margin-top:1px">CI: ${esc(p.cedula)}${p.tel?' · '+esc(p.tel):''}${p.email?' · '+esc(p.email):''}</div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
      <button class="ai-btn" onclick="genPatientAI()">Informe IA ↗</button>
      <button onclick="agendarCitaParaPaciente('${esc(p.id)}')" style="padding:6px 14px;background:rgba(29,158,117,.12);color:#1D9E75;border:1px solid rgba(29,158,117,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">+ Agendar cita</button>
      ${isCurrentEpisode ? `<button onclick="nuevoEpisodio('${esc(p.id)}')" style="padding:6px 14px;background:rgba(186,117,23,.1);color:#BA7517;border:1px solid rgba(186,117,23,.3);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">🔄 Nuevo episodio</button>` : ''}
    </div>
  </div>`;

  // ── Stats cards ──
  html+=`<div class="three-col" style="margin-bottom:14px">
    <div class="card"><div class="card-title">Progreso</div>
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:600;color:#1D9E75">${pct}%</div>
        <div style="font-size:11px;color:#6b6a64;margin:3px 0 8px">${epDone} de ${epSessions} sesiones</div>
        <div class="bar-wrap" style="height:6px"><div class="bar-fill" style="width:${pct}%;background:#1D9E75"></div></div>
      </div>
    </div>
    <div class="card"><div class="card-title">Continuidad</div>
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:600;color:${ac}">${adh}%</div>
        <div style="font-size:11px;color:#6b6a64;margin:3px 0 8px">${attended.length} asist. / ${log.length} citas</div>
        <div style="display:flex;justify-content:center;gap:16px">
          <div><div style="font-size:15px;font-weight:600;color:#1D9E75">${attended.length}</div><div style="font-size:10px;color:#6b6a64">Asistidas</div></div>
          <div><div style="font-size:15px;font-weight:600;color:#E24B4A">${log.length-attended.length}</div><div style="font-size:10px;color:#6b6a64">Ausencias</div></div>
        </div>
      </div>
    </div>
    <div class="card"><div class="card-title">Evolución EVA</div>
      <div style="text-align:center">${fp&&lp&&fp.pb!=null?`
        <div style="display:flex;justify-content:center;align-items:center;gap:14px">
          <div><div style="font-size:26px;font-weight:600;color:#E24B4A">${fp.pb}</div><div style="font-size:10px;color:#6b6a64">Inicio</div></div>
          <div style="color:#6b6a64;font-size:18px">→</div>
          <div><div style="font-size:26px;font-weight:600;color:#1D9E75">${lp.pa!=null?lp.pa:'?'}</div><div style="font-size:10px;color:#6b6a64">Última</div></div>
        </div>
        <div style="font-size:11px;color:${(fp.pb-(lp.pa||0))>0?'#1D9E75':'#E24B4A'};margin-top:6px">
          ${(fp.pb-(lp.pa||0))>0?'↓ Mejoró':'↑ Sin mejora'} ${Math.abs(fp.pb-(lp.pa||0))} puntos
        </div>`:'<div style="color:#6b6a64;font-size:12px;margin-top:12px">Sin datos EVA aún</div>'}</div>
    </div>
  </div>`;

  // ── Output IA ──
  html+=`<div id="patient-rpt-ai-output" class="full-card" style="display:none;margin-bottom:14px"></div>`;

  // ── Historial de sesiones ──
  html+=`<div class="full-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;color:#1a1917">Historial de sesiones</div>
      <div style="font-size:11px;color:#7a7a76">${log.length} registros</div>
    </div>`;

  if(!log.length){
    html+=`<div style="color:#6b6a64;font-size:13px;padding:16px;text-align:center">
      Sin sesiones registradas aún.<br>
      <span style="font-size:11px;opacity:.7">Las sesiones se registran al confirmar una cita en la Agenda.</span>
    </div>`;
  } else {
    html+=`<div class="timeline">`;
    [...log].reverse().forEach(s=>{
      const dc=s.status==='asistió'?'#1D9E75':'#E24B4A';
      const sp2=s.status==='asistió'?'<span class="pill pg" style="font-size:10px">Asistió</span>':'<span class="pill pr" style="font-size:10px">No asistió</span>';
      const evaStr=s.pb!=null?`<span style="font-size:11px;color:#6b6a64;background:rgba(255,255,255,.05);padding:2px 8px;border-radius:99px">EVA ${s.pb}→${s.pa!=null?s.pa:'?'}</span>`:'';
      html+=`<div class="tl-item">
        <div class="tl-dot" style="background:${dc}"></div>
        <div class="tl-date">${s.date}${s.hour?' · '+s.hour:''}</div>
        <div class="tl-content">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
            ${sp2}
            <span style="font-size:12px;font-weight:500;color:#1a1917">${esc(s.type||'')}</span>
            ${evaStr}
          </div>
          ${s.note?`<div class="tl-note" style="color:#6b6a64;font-size:12px">${esc(s.note)}</div>`:''}
        </div>
      </div>`;
    });
    html+=`</div>`;
  }
  html+=`</div>`;
  out.innerHTML=html;

  // Reconectar botón IA (se crea dinámicamente)
  const aiOut=document.getElementById('patient-rpt-ai-output');
  if(aiOut) aiOut.style.display='none';
}



// ======= PROTOCOLOS =======
function openProtocolModal(eid=null){
  editingProtocolId=eid;
  if(eid){const p=protocols.find(x=>x.id===eid);document.getElementById('prot-diag').value=p.diag;document.getElementById('prot-name').value=p.name;document.getElementById('prot-sessions').value=p.sessions;document.getElementById('prot-freq').value=p.freq;document.getElementById('prot-alta').value=p.alta;}
  else{['prot-diag','prot-name','prot-alta'].forEach(id=>document.getElementById(id).value='');document.getElementById('prot-sessions').value=20;document.getElementById('prot-freq').value=3;}
  document.getElementById('protocol-modal').classList.add('open');
}
function saveProtocol(){
  const diag=document.getElementById('prot-diag').value.trim();
  const name=document.getElementById('prot-name').value.trim();
  if(!diag||!name){alert('Completa diagnóstico y nombre.');return;}
  const d={diag,name,sessions:parseInt(document.getElementById('prot-sessions').value),freq:parseInt(document.getElementById('prot-freq').value),alta:document.getElementById('prot-alta').value};
  if(editingProtocolId)Object.assign(protocols.find(p=>p.id===editingProtocolId),d);
  else protocols.push({id:++protCounter,...d});
  const _pr=editingProtocolId?protocols.find(p=>p.id===editingProtocolId):protocols[protocols.length-1];
  closeModal('protocol-modal');renderProtocols();
  dbSaveProtocol(_pr);
}

function renderProtocols(){
  const fl={7:'Diaria',5:'5×/sem',3:'3×/sem',2:'2×/sem',1:'1×/sem'};
  const svgs={
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
  const qp=(document.getElementById('protocol-search')?.value||'').toLowerCase();
  const filtProts=qp?protocols.filter(p=>p.name.toLowerCase().includes(qp)||p.diag.toLowerCase().includes(qp)):protocols;
  if(!filtProts.length){
    document.getElementById('protocols-list').innerHTML=`<div style="color:#5a5a56;font-size:13px;padding:20px 0;text-align:center">No hay protocolos. Carga los predefinidos o crea uno nuevo.</div>`;
  } else {
    document.getElementById('protocols-list').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:14px">`+filtProts.map(p=>{
      const svg=svgs[p.img]||svgs.knee;
      return`<div class="protocol-card" style="display:flex;gap:14px;align-items:flex-start">
        <div style="flex-shrink:0;background:#f8f8f4;border-radius:8px;padding:8px;border:1px solid rgba(29,158,117,.12)">${svg}</div>
        <div style="flex:1;min-width:0">
          <div class="protocol-diag">${esc(p.name)}</div>
          ${p.def?`<div style="font-size:11px;color:#6b6a64;margin-top:4px;line-height:1.5">${p.def}</div>`:''}
          <div class="protocol-meta" style="margin-top:6px">${p.sessions} sesiones · ${fl[p.freq]||p.freq+'×/sem'}</div>
          ${p.alta?`<div style="font-size:10px;color:#7a7a76;margin-top:3px">Alta: ${p.alta}</div>`:''}
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="th-btn" onclick="openProtocolModal('${p.id}')">Editar</button>
            <button class="th-btn del" onclick="deleteProtocol('${p.id}')">Eliminar</button>
          </div>
        </div>
      </div>`;
    }).join('')+`</div>`;
  }
  protCurrentPage=0;renderProtocolAdherence();
}


function deleteProtocol(id){if(!confirm('¿Eliminar?'))return;protocols=protocols.filter(p=>p.id!==id);renderProtocols();dbDeleteProtocol(id);}

function getProtocolRows(){
  const rows=[];const fl={7:'Diaria',5:'5×/sem',3:'3×/sem',2:'2×/sem',1:'1×/sem'};
  patients.forEach(p=>{
    if(p.status==='alta')return;
    protocols.forEach(prot=>{
      const kw=prot.diag.toLowerCase().split(',').map(k=>k.trim());
      if(!kw.some(k=>p.diag.toLowerCase().includes(k)))return;
      const adh=p.log.length>0?Math.round(p.log.filter(s=>s.status==='asistió').length/p.log.length*100):0;
      const exp=Math.min(100,Math.round((p.done/prot.sessions)*100));
      rows.push({p,prot,adh,exp,fl});
    });
  });
  return rows;
}
function protPage(dir){
  const rows=getProtocolRows();
  const pages=Math.ceil(rows.length/PROT_PAGE_SIZE);
  protCurrentPage=Math.max(0,Math.min(pages-1,protCurrentPage+dir));
  renderProtocolAdherence();
}
function renderProtocolAdherence(){
  const rows=getProtocolRows();
  if(!rows.length){document.getElementById('protocol-adherence-list').innerHTML='<div style="color:#6b6a64;font-size:13px;padding:8px 0">No hay pacientes con protocolos activos.</div>';document.getElementById('prot-page-lbl').textContent='';return;}
  const pages=Math.max(1,Math.ceil(rows.length/PROT_PAGE_SIZE));
  protCurrentPage=Math.min(protCurrentPage,pages-1);
  const page=rows.slice(protCurrentPage*PROT_PAGE_SIZE,(protCurrentPage+1)*PROT_PAGE_SIZE);
  document.getElementById('prot-page-lbl').textContent=`${protCurrentPage+1}/${pages}`;
  document.getElementById('prot-prev').disabled=protCurrentPage===0;
  document.getElementById('prot-next').disabled=protCurrentPage>=pages-1;
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
          <div class="bar-wrap" style="height:6px">
            <div class="bar-fill" style="width:${adh}%;background:${ac}"></div>
          </div>
          <div style="position:absolute;top:-2px;left:${exp}%;width:2px;height:10px;background:rgba(255,255,255,0.3);border-radius:1px" title="Meta"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#6b6a64;margin-top:3px">
          <span>Real: <b style="color:${ac}">${adh}%</b></span><span>Meta: ${exp}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ======= TERAPEUTAS =======
function renderTherapistList(){
  const q=(document.getElementById('therapist-search')?.value||'').toLowerCase();
  const filtered=therapists.filter(t=>!q||t.name.toLowerCase().includes(q)||t.spec.toLowerCase().includes(q));
  document.getElementById('therapist-list').innerHTML=filtered.map(th=>{
    const c=getColor(th.colorId);
    return`<div class="th-manage-row">
      <div class="avatar" style="background:${c.border}22;color:${c.text};width:36px;height:36px;font-size:12px">${esc(th.initials)}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:#1a1917">${esc(th.name)}</div>
        <div style="font-size:11px;color:#6b6a64">${esc(th.spec)}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">Turno: ${th.startH}:00–${th.endH}:00 · ${therapistHours(th).length} h/día</div>
      </div>
      <div class="th-actions">
        <button class="th-btn" onclick="openEditTherapist('${th.id}')">Editar</button>
        <button class="th-btn del" onclick="deleteTherapist('${th.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('')||'<div style="color:#6b6a64;font-size:13px">Sin terapeutas registrados.</div>';
}
function openTherapistModal(ed=null){
  editingTherapistId=ed||null;
  document.getElementById('th-modal-title').textContent=ed?'Editar terapeuta':'Agregar terapeuta';
  if(ed){
    const th=getTherapist(ed);
    if(!th){toastErr('No se encontró el terapeuta.');return;}document.getElementById('th-name').value=th.name;document.getElementById('th-spec').value=th.spec;document.getElementById('th-start').value=th.startH;document.getElementById('th-end').value=th.endH;selectedColor=th.colorId;}
  else{document.getElementById('th-name').value='';document.getElementById('th-spec').value='';document.getElementById('th-start').value=7;document.getElementById('th-end').value=13;selectedColor='ca';}
  renderColorPicker();document.getElementById('therapist-modal').classList.add('open');
}
function openEditTherapist(id){openTherapistModal(id);}
function renderColorPicker(){
  document.getElementById('color-picker').innerHTML=COLOR_OPTIONS.map(c=>`<div class="color-swatch${c.id===selectedColor?' selected':''}" style="background:${c.border}" onclick="selectColor('${c.id}')"></div>`).join('');
}
function selectColor(id){selectedColor=id;renderColorPicker();}
async function saveTherapist(){
  const name=document.getElementById('th-name').value.trim();if(!name){alert('Ingresa el nombre.');return;}
  const s=parseInt(document.getElementById('th-start').value),e=parseInt(document.getElementById('th-end').value);
  if(e<=s){alert('La hora de fin debe ser mayor.');return;}
  const init=name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  if(editingTherapistId){const t=getTherapist(editingTherapistId);t.name=name;t.spec=document.getElementById('th-spec').value;t.startH=s;t.endH=e;t.colorId=selectedColor;t.initials=init;}
  else therapists.push({id:++thCounter,name,initials:init,spec:document.getElementById('th-spec').value,startH:s,endH:e,colorId:selectedColor});
  const _th=editingTherapistId?getTherapist(editingTherapistId):therapists[therapists.length-1];
  closeModal('therapist-modal');renderTherapistList();renderGrid();
  try{
    const payload={name:_th.name,initials:_th.initials,spec:_th.spec,start_h:_th.startH,end_h:_th.endH,color_id:_th.colorId};
    if(typeof _th.id==='string')payload.id=_th.id;
    const {data,error}=await supa.from('therapists').upsert(payload).select().single();
    if(error){toastErr('Error al guardar terapeuta: '+error.message);}
    else{if(!editingTherapistId)_th.id=data.id;renderTherapistList();renderGrid();toastOk((editingTherapistId?'Terapeuta actualizado':'Terapeuta guardado')+' correctamente');}
  }catch(e){toastErr('Error de conexión al guardar terapeuta.');}
updateFacturaBadge();

}
async function deleteTherapist(id){
  if(!confirm('¿Eliminar este terapeuta? Se borrarán también todas sus citas.'))return;
  therapists=therapists.filter(t=>t.id!==id);
  appointments=appointments.filter(a=>a.therapistId!==id);
  renderTherapistList();renderGrid();
  try {
    if (typeof id === 'string') {
      const {error: e1} = await supa.from('appointments').delete().eq('therapist_id', id);
      if (e1) toastErr('Error al borrar citas del terapeuta: ' + e1.message);
    }
    await dbDeleteTherapist(id);
  } catch (e) {
    toastErr('Error de conexión al eliminar terapeuta.');
  }
  updateFacturaBadge();
}

// ======= DOCTORES =======
function renderDoctorsList(){
  const q=(document.getElementById('doctor-search')?.value||'').toLowerCase();
  const filtDocs=doctors.filter(d=>!q||d.name.toLowerCase().includes(q)||d.spec.toLowerCase().includes(q));
  document.getElementById('doctors-list').innerHTML=`<div class="full-card">${filtDocs.map(d=>`
    <div class="th-manage-row">
      <div style="width:36px;height:36px;border-radius:50%;background:${d.color}22;border:1px solid ${d.color}44;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:${d.color};flex-shrink:0">${esc(d.name.split(' ').pop()[0])}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:#1a1917">${esc(d.name)}</div>
        <div style="font-size:11px;color:#6b6a64">${esc(d.spec)}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">${esc(d.email||'')}${d.tel?' · '+esc(d.tel):''}</div>
      </div>
      <div class="th-actions">
        <button class="th-btn" onclick="openDoctorModal('${d.id}')">Editar</button>
        <button class="th-btn del" onclick="deleteDoctor('${d.id}')">Eliminar</button>
      </div>
    </div>`).join('')||'<div style="color:#6b6a64;font-size:13px">Sin doctores registrados.</div>'}</div>`;
}
function openDoctorModal(eid=null){
  editingDocId=eid;
  document.getElementById('doc-modal-title').textContent=eid?'Editar doctor':'Agregar doctor referente';
  if(eid){const d=getDoctor(eid);document.getElementById('doc-name').value=d.name;document.getElementById('doc-spec').value=d.spec;document.getElementById('doc-email').value=d.email||'';document.getElementById('doc-tel').value=d.tel||'';selectedDocColor=d.color;}
  else{['doc-name','doc-spec','doc-email','doc-tel'].forEach(id=>document.getElementById(id).value='');selectedDocColor=DOC_COLORS[0];}
  renderDocColorPicker();document.getElementById('doctor-modal').classList.add('open');
}
function renderDocColorPicker(){
  document.getElementById('doc-color-picker').innerHTML=DOC_COLORS.map(c=>`<div class="color-swatch${c===selectedDocColor?' selected':''}" style="background:${c}" onclick="selectDocColor('${c}')"></div>`).join('');
}
function selectDocColor(c){selectedDocColor=c;renderDocColorPicker();}
async function saveDoctor(){
  const name=document.getElementById('doc-name').value.trim();if(!name){alert('Ingresa el nombre.');return;}
  const d={name,spec:document.getElementById('doc-spec').value,email:document.getElementById('doc-email').value,tel:document.getElementById('doc-tel').value,color:selectedDocColor};
  if(editingDocId)Object.assign(getDoctor(editingDocId),d);
  else doctors.push({id:++docCounter,...d});
  const _d=editingDocId?getDoctor(editingDocId):doctors[doctors.length-1];
  closeModal('doctor-modal');renderDoctorsList();renderRefLegend();
  try{
    const payload={name:_d.name,spec:_d.spec,email:_d.email,tel:_d.tel,color:_d.color};
    if(typeof _d.id==='string')payload.id=_d.id;
    const {data,error}=await supa.from('doctors').upsert(payload).select().single();
    if(error){toastErr('Error al guardar doctor: '+error.message);}
    else{if(!editingDocId)_d.id=data.id;renderDoctorsList();renderRefLegend();toastOk((editingDocId?'Doctor actualizado':'Doctor guardado')+' correctamente');}
  }catch(e){toastErr('Error de conexión al guardar doctor.');}
}
async function deleteDoctor(id){
  if(!confirm('¿Eliminar este doctor? Sus pacientes quedarán como independientes.'))return;
  doctors=doctors.filter(d=>d.id!==id);
  patients.forEach(p=>{if(p.doctorId===id)p.doctorId=null;});
  renderDoctorsList();renderRefLegend();
  try {
    if (typeof id === 'string') {
      const {error: e1} = await supa.from('patients').update({doctor_id: null}).eq('doctor_id', id);
      if (e1) toastErr('Error al desasociar pacientes: ' + e1.message);
    }
    await dbDeleteDoctor(id);
  } catch (e) {
    toastErr('Error de conexión al eliminar doctor.');
  }
}
function showDoctoresTab(n,btn){
  document.getElementById('config-doctores').style.display=n==='referentes'?'':'none';
  document.getElementById('config-notificaciones').style.display=n==='notificaciones'?'':'none';
  document.querySelectorAll('#tab-doctores .sub-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  if(n==='referentes')renderDoctorsList();if(n==='notificaciones')renderNotifList();
}

// ======= NOTIFICACIONES =======
function renderNotifList(){
  document.getElementById('notif-list').innerHTML=notifSettings.map(n=>`
    <div class="notif-row">
      <label class="toggle-wrap">
        <input type="checkbox" ${n.on?'checked':''} onchange="toggleNotif('${n.id}',this.checked)">
        <div class="toggle-track"></div>
        <div class="toggle-thumb"></div>
      </label>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:#1a1917">${n.icon} ${n.label}</div>
        <div style="font-size:11px;color:#5a5a56;margin-top:2px">${n.desc}</div>
        <span class="pill ${n.on?'pg':'pgr'}" style="margin-top:5px">${n.on?'Activo':'Inactivo'}</span>
      </div>
    </div>`).join('');
}
function toggleNotif(id,v){const n=notifSettings.find(x=>x.id===id);if(n){n.on=v;renderNotifList();}}

// ======= TABS =======
function closeModal(id){document.getElementById(id).classList.remove('open')}
function showTab(tab){
  currentTab=tab;
  allTabs.forEach(t=>document.getElementById('tab-'+t).style.display=t===tab?'':'none');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));const navMap={'agenda':0,'resumen':1,'pacientes':2,'paciente_rpt':3,'protocolos':4,'informes':5,'facturacion':6,'terapeutas':7,'doctores':8};const navItems=document.querySelectorAll('.nav-item');if(navItems[navMap[tab]])navItems[navMap[tab]].classList.add('active');
  if(tab==='pacientes')renderPatients();
  if(tab==='informes')renderSemanal();
  if(tab==='paciente_rpt')renderPatientReportSelect();
  if(tab==='terapeutas')renderTherapistList();
  if(tab==='resumen')renderResumen();
  if(tab==='protocolos')renderProtocols();
  if(tab==='doctores'){renderDoctorsList();renderNotifList();}
  if(tab==='facturacion')renderFacturacion();
}

renderGrid();
updateFacturaBadge();


// ======= FACTURACIÓN =======
function renderFacturacion(){
  updateFacturaBadge();
  const spf = parseInt(document.getElementById('global-spf').value)||5;

  // Para cada paciente calcular cobros ya hechos, pendientes y resumen
  function billingInfo(p){
    const sesTotal = p.sessions || 0;
    const sesYaCobradas = p.billing.facturas.reduce((s,f)=>s+f.n,0);
    const sesPend = p.billing.pendientes||0;
    // Cuántos cobros completos de SPF quedan, y el cobro final parcial
    const cobrosRealizados = p.billing.facturas.length;
    const totalCobros = Math.floor(sesTotal/spf) + (sesTotal%spf>0?1:0);
    const cobrosRestantes = totalCobros - cobrosRealizados;
    // El cobro actual: si pendientes >= spf cobro completo, si no es el cobro final parcial
    const esCierre = sesPend>0 && sesPend<spf && (sesYaCobradas+sesPend)>=sesTotal;
    return {sesTotal,sesYaCobradas,sesPend,cobrosRealizados,totalCobros,cobrosRestantes,esCierre};
  }

  const listos   = patients.filter(p=>p.billing && p.billing.pendientes>=spf);
  const cierre   = patients.filter(p=>{
    if(!p.billing||p.billing.pendientes<=0||p.billing.pendientes>=spf) return false;
    const info=billingInfo(p);
    return info.esCierre;
  });
  const enCurso  = patients.filter(p=>{
    if(!p.billing||p.billing.pendientes<=0||p.billing.pendientes>=spf) return false;
    const info=billingInfo(p);
    return !info.esCierre;
  });

  const totalCobros = patients.reduce((s,p)=>s+(p.billing&&p.billing.facturas?p.billing.facturas.length:0),0);
  const totalSes    = patients.reduce((s,p)=>s+(p.billing&&p.billing.facturas?p.billing.facturas.reduce((a,f)=>a+f.n,0):0),0);

  let html=`<div class="stats-row">
    <div class="stat"><div class="stat-lbl">Por cobrar ahora</div><div class="stat-val" style="color:${(listos.length+cierre.length)?'#e0a850':'#1D9E75'}">${listos.length+cierre.length}</div><div class="stat-chg neu">Pacientes</div></div>
    <div class="stat"><div class="stat-lbl">Acumulando citas</div><div class="stat-val">${enCurso.length}</div><div class="stat-chg neu">En curso</div></div>
    <div class="stat"><div class="stat-lbl">Total cobros hechos</div><div class="stat-val" style="color:#1D9E75">${totalCobros}</div><div class="stat-chg up">Histórico</div></div>
    <div class="stat"><div class="stat-lbl">Total sesiones cobradas</div><div class="stat-val" style="color:#1D9E75">${totalSes}</div><div class="stat-chg up">Histórico</div></div>
  </div>`;

  // ---- LISTOS PARA COBRAR (completos + cierre) ----
  const paracobrar = [...listos, ...cierre];
  if(paracobrar.length){
    html+=`<div class="full-card" style="border:1px solid rgba(224,168,80,.25);background:#fdf8ed">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="font-size:20px">🧾</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:#e0a850">${paracobrar.length} paciente${paracobrar.length>1?'s':''} listo${paracobrar.length>1?'s':''} para cobrar</div>
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
      // Cajitas: verdes = acumuladas en este cobro
      const cajitas=Array.from({length:nCita},(_,i)=>`<div style="width:22px;height:22px;border-radius:5px;background:${esFinal?'#378ADD':'#1D9E75'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${info.sesYaCobradas+i+1}</div>`).join('');
      const tagLabel=esFinal
        ? `<span style="font-size:10px;font-weight:600;color:#7ab8e8;background:#e8f2fc;border:1px solid rgba(55,138,221,.3);border-radius:99px;padding:1px 8px;margin-left:6px">Cobro final</span>`
        : `<span style="font-size:10px;font-weight:600;color:#e0a850;background:#fefaf0;border:1px solid rgba(224,168,80,.3);border-radius:99px;padding:1px 8px;margin-left:6px">Cobro ${info.cobrosRealizados+1} de ${info.totalCobros}</span>`;
      html+=`<div class="resumen-row" style="border-color:rgba(224,168,80,.2);background:#fefaf0;margin-bottom:6px;align-items:flex-start">
        <div style="width:9px;height:9px;border-radius:50%;background:${esFinal?'#378ADD':'#e0a850'};flex-shrink:0;margin-top:5px"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            <span style="font-size:13px;font-weight:600;color:#1a1917">${esc(p.name)}</span>
            ${tagLabel}
          </div>
          <div style="font-size:11px;color:#6b6a64;margin-top:3px">
            CI: ${esc(p.cedula||'—')} · ${esc(p.email||'sin correo')}${th?' · '+esc(th.name):''}${doc?' · Ref: '+esc(doc.name):''}
          </div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:3px;flex-wrap:wrap">
            ${cajitas}
            <span style="font-size:11px;color:#6b6a64;margin-left:6px">${nCita} cita${nCita>1?'s':''} este cobro · ${info.sesTotal} totales prescritas</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;margin-left:10px">
          <button class="resumen-btn" style="border-color:rgba(224,168,80,.5);color:#e0a850;font-size:11px;padding:5px 14px;font-weight:600" onclick="emitirFactura(${p.id})">✓ Cobrado</button>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  // ---- EN CURSO ----
  if(enCurso.length){
    html+=`<div class="full-card">
      <div class="card-title">Acumulando citas</div>`;
    enCurso.forEach(p=>{
      const info=billingInfo(p);
      const pend=info.sesPend;
      const faltan=spf-pend;
      const cajitas=Array.from({length:spf},(_,i)=>`<div style="width:18px;height:18px;border-radius:4px;background:${i<pend?'#1D9E75':'rgba(255,255,255,0.06)'};border:1px solid ${i<pend?'rgba(29,158,117,.4)':'rgba(255,255,255,.06)'};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;color:${i<pend?'#fff':'#333'}">${info.sesYaCobradas+i+1}</div>`).join('');
      html+=`<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(29,158,117,.1)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:#1a1917">${esc(p.name)}
            <span style="font-size:10px;font-weight:400;color:#5a5a56;margin-left:6px">cobro ${info.cobrosRealizados+1} de ${info.totalCobros}</span>
          </div>
          <div style="font-size:10px;color:#5a5a56;margin-top:2px">CI: ${esc(p.cedula||'—')} · ${esc(p.email||'sin correo')}</div>
          <div style="display:flex;align-items:center;gap:2px;margin-top:7px;flex-wrap:wrap">
            ${cajitas}
            <span style="font-size:11px;color:#5a5a56;margin-left:8px">Faltan ${faltan}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:22px;font-weight:700;color:${pend>=spf*0.8?'#e0a850':'#5a5a56'}">${pend}/${spf}</div>
          <div style="font-size:10px;color:#7a7a76">${info.sesTotal} prescritas</div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  if(!paracobrar.length && !enCurso.length){
    html+=`<div class="full-card" style="text-align:center;padding:32px">
      <div style="font-size:32px;margin-bottom:8px">✓</div>
      <div style="font-size:14px;font-weight:600;color:#1D9E75">Todo al día</div>
      <div style="font-size:12px;color:#5a5a56;margin-top:4px">No hay cobros pendientes en este momento.</div>
    </div>`;
  }

  document.getElementById('facturacion-content').innerHTML=html;
}

function emitirFactura(patientId){
  const p=getPatient(patientId);if(!p||!p.billing)return;
  const n=p.billing.pendientes;
  const fId='F'+(++facturaCounter).toString().padStart(3,'0');
  const today=fmtDate(new Date());
  p.billing.facturas.push({id:fId,n,fecha:today,estado:'cobrada'});
  p.billing.pendientes=0;
  updateFacturaBadge();
  renderFacturacion();
  dbRegistrarCobro(p.id,n,fId);
  toastOk(`Cobro ${fId} registrado — ${n} sesiones de ${p.name}`);
  simEmailFactura(p.name,p.email||'',fId,n);
}
function marcarTodosFacturados(){
  const spf=parseInt(document.getElementById("global-spf").value)||5;
  const paracobrar=patients.filter(p=>p.billing&&(p.billing.pendientes>=spf||(p.billing.pendientes>0&&(p.billing.facturas.reduce((s,f)=>s+f.n,0)+p.billing.pendientes)>=p.sessions)));
  paracobrar.forEach(p=>emitirFactura(p.id));
}
function simEmailFactura(nombre,email,fId='',n=5){
  const correo=email?`📧 ${email}`:'📧 Sin correo registrado — agrégalo en el perfil';
  alert(`✅ ${nombre} marcado como cobrado\n\nFactura ${fId}  ·  ${n} sesiones\n${correo}\n\n💡 Con backend: genera XML/SRI y envía comprobante automáticamente.`);
}
function checkAutoNoas(){
  const ds=fmtDate(currentDate);
  const now=new Date();
  const isToday=ds===fmtDate(now);
  if(!isToday)return; // Solo auto-rojo para el día actual
  const currentHour=now.getHours();
  const currentMin=now.getMinutes();
  appointments.forEach(a=>{
    if(a.date===ds && a.status==='pend'){
      // Si la hora de la cita + 30 min ya pasó, marcar como no asistió
      if(a.hour < currentHour || (a.hour===currentHour && currentMin>=30)){
        a.status='noas';
        dbUpdateApptStatus(a.id,'noas');
      }
    }
  });
}

function openEditPatient(id){
  const p=getPatient(id);if(!p)return;
  document.getElementById('pm-doctor').innerHTML='<option value="">Independiente</option>'+doctors.map(d=>`<option value="${esc(d.id)}" ${d.id===p.doctorId?'selected':''}>${esc(d.name)} (${esc(d.spec)})</option>`).join('');
  document.getElementById('pm-name').value=p.name;
  document.getElementById('pm-age').value=p.age||'';
  document.getElementById('pm-cedula').value=p.cedula||'';
  document.getElementById('pm-tel').value=p.tel||'';
  document.getElementById('pm-email').value=p.email||'';
  document.getElementById('pm-dir').value=p.dir||'';
  document.getElementById('pm-diag').value=p.diag||'';
  document.getElementById('pm-sessions').value=p.sessions||10;
  document.getElementById('pm-status').value=p.status||'active';
  document.getElementById('pm-billing-start').value=p.billing?.pendientes||0;
  editingPatientId=id;
  populateDiagList();
  document.querySelector('#patient-modal h3').textContent='Editar paciente';
  document.getElementById('patient-modal').classList.add('open');
}

function filterApptPatient(){
  const q=(document.getElementById('m-patient-search').value||'').toLowerCase();
  const dl=document.getElementById('m-patient-list');
  const match=patients.filter(p=>p.name.toLowerCase().includes(q)||(p.cedula&&p.cedula.includes(q)));
  dl.innerHTML=match.slice(0,10).map(p=>`<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}${p.cedula?' · '+esc(p.cedula):''}</option>`).join('');
  // Buscar si el texto ingresado coincide exactamente con algún paciente
  const exact=patients.find(p=>p.name.toLowerCase()===q);
  if(exact) document.getElementById('m-patient').value=exact.id;
  else{
    // También buscar si seleccionó de la lista
    const opt=[...dl.options].find(o=>o.value===document.getElementById('m-patient-search').value);
    if(opt) document.getElementById('m-patient').value=opt.getAttribute('data-id')||'';
  }
}

function populateDiagList(){
  const diags=[...new Set(patients.filter(p=>p.diag&&p.diag!=='Sin diagnóstico').map(p=>p.diag))];
  // También agregar los diagnósticos de los protocolos
  protocols.forEach(p=>p.name&&diags.push(p.name));
  const unique=[...new Set(diags)].sort();
  const dl=document.getElementById('diag-list');
  if(dl) dl.innerHTML=unique.map(d=>`<option value="${d}">`).join('');
}

function filterPatientRptSelect(){
  const q=(document.getElementById('patient-rpt-search').value||'').toLowerCase();
  const sel=document.getElementById('patient-rpt-select');
  sel.innerHTML=patients.filter(p=>p.name.toLowerCase().includes(q)||p.diag.toLowerCase().includes(q))
    .map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(sel.options.length>0)updateEpisodes();
}

// ── TÉCNICAS PRO ────────────────────────────────────────────
const PRO_TECNICAS = [
  'Compresa caliente','Crioterapia','Electroterapia','Magnetoterapia',
  'Laser','Ultrasonido','Masoterapia','Movilidad pasiva',
  'Movilidad activa','Fortalecimiento','Estiramientos','Reeducación postural',
  'Reeducación marcha','Propiocepción','Terapia manual','Vendaje funcional',
  'Punción seca','Tracción lumbar/cervical','Kinesioterapia','Ejercicio terapéutico'
];
let proTecnicasSel = [];

function renderProTecnicas() {
  const grid = document.getElementById('pro-tecnicas-grid');
  if (!grid) return;
  grid.innerHTML = PRO_TECNICAS.map(t => {
    const sel = proTecnicasSel.includes(t);
    return '<button type="button" onclick="toggleProTecnica(this)" data-t="'+t+'" style="'
      +'padding:6px 8px;border-radius:8px;border:1.5px solid '+(sel?'#1D9E75':'rgba(29,158,117,.2)')+';'
      +'background:'+(sel?'rgba(29,158,117,.15)':'#f8f8f4')+';color:'+(sel?'#1D9E75':'#6b6a64')+';'
      +'font-size:10px;font-weight:600;font-family:inherit;cursor:pointer;text-align:center;'
      +'transition:all .1s">'+t+'</button>';
  }).join('');
  document.getElementById('sess-type').value = proTecnicasSel.join(', ');
}

function toggleProTecnica(btn) {
  const t = btn.getAttribute('data-t');
  const idx = proTecnicasSel.indexOf(t);
  if (idx >= 0) proTecnicasSel.splice(idx, 1);
  else proTecnicasSel.push(t);
  renderProTecnicas();
}

// ── SESIÓN CLÍNICA ──────────────────────────────────────────
let _pendingSessionAppt = null;

function renderEvaButtons(cId, vId, cur, col) {
  var c = document.getElementById(cId);
  if (!c) return;
  c.innerHTML = '';
  for (var i = 0; i <= 10; i++) {
    var b = document.createElement('button');
    b.textContent = i;
    b.setAttribute('data-c', cId);
    b.setAttribute('data-v', vId);
    b.setAttribute('data-n', i);
    b.setAttribute('data-col', col);
    var active = (i === cur);
    b.style.flex = '1';
    b.style.padding = '8px 2px';
    b.style.borderRadius = '6px';
    b.style.border = 'none';
    b.style.cursor = 'pointer';
    b.style.fontSize = '13px';
    b.style.minWidth = '0';
    b.style.fontWeight = active ? '700' : '400';
    b.style.background = active ? col : 'rgba(255,255,255,0.06)';
    b.style.color = active ? '#fff' : '#6b6a64';
    b.style.transition = 'all .1s';
    b.onclick = function() {
      renderEvaButtons(
        this.getAttribute('data-c'),
        this.getAttribute('data-v'),
        parseInt(this.getAttribute('data-n')),
        this.getAttribute('data-col')
      );
    };
    c.appendChild(b);
  }
  document.getElementById(vId).textContent = cur;
}
function setEva(cId, vId, val, col) {
  renderEvaButtons(cId, vId, val, col);
}

function openSessionModal(appt) {
  if (!appt) return;
  _pendingSessionAppt = appt;
  const pt = getPatient(appt.patientId);
  // Buscar si ya existe sesión guardada para esta cita (para editar)
  const existing = pt && pt.log ? pt.log.find(s => s.date === appt.date && s.hour === appt.hour + ':00') : null;
  document.getElementById('session-modal-title').textContent = 
    (existing ? 'Editar sesión — ' : 'Registrar sesión — ') + (pt ? pt.name.split(' ').slice(0,2).join(' ') : 'Paciente');
  document.getElementById('session-modal-sub').textContent = 
    appt.type + ' · ' + appt.date + ' · ' + appt.hour + ':00';
  const pb = existing ? (existing.pb != null ? existing.pb : 5) : 5;
  const pa = existing ? (existing.pa != null ? existing.pa : 5) : 5;
  renderEvaButtons('eva-before-btns', 'sess-eva-before-val', pb, '#E24B4A');
  renderEvaButtons('eva-after-btns', 'sess-eva-after-val', pa, '#1D9E75');
  if (existing && existing.type) {
    const sel = document.getElementById('sess-type');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === existing.type) { sel.selectedIndex = i; break; }
    }
  }
  document.getElementById('sess-note').value = existing ? (existing.note || '') : '';
  proTecnicasSel = []; document.getElementById('sess-type').value = '';
  renderProTecnicas();
  document.getElementById('session-modal').classList.add('open');
}

async function saveSession() {
  const appt = _pendingSessionAppt;
  if (!appt) return;
  const pb = parseInt(document.getElementById('sess-eva-before-val').textContent) || 0;
  const pa = parseInt(document.getElementById('sess-eva-after-val').textContent) || 0;
  const type = document.getElementById('sess-type').value;
  const note = document.getElementById('sess-note').value.trim();
  if (!note) {
    document.getElementById('sess-note').style.borderColor = 'rgba(224,80,80,.6)';
    document.getElementById('sess-note').focus();
    toastErr('Describe brevemente qué se realizó en la sesión');
    return;
  }
  document.getElementById('sess-note').style.borderColor = '';
  
  if (appt.id && appt.patientId) {
    markLocalChange();
    // Buscar si ya existe sesión para este paciente en este día Y HORA
    const existingInDB = await supa.from('session_log')
      .select('id')
      .eq('patient_id', appt.patientId)
      .eq('date', appt.date)
      .eq('hour', appt.hour + ':00')
      .maybeSingle();

    let dbError;
    if (existingInDB.data) {
      // Actualizar la existente (misma fecha + misma hora)
      const {error} = await supa.from('session_log')
        .update({type, pain_before:pb, pain_after:pa, note})
        .eq('id', existingInDB.data.id);
      dbError = error;
    } else {
      // Crear nueva
      const {error} = await supa.from('session_log').insert({
        patient_id: appt.patientId,
        date: appt.date,
        type: type,
        hour: appt.hour + ':00',
        status: 'asistió',
        pain_before: pb,
        pain_after: pa,
        note: note,
      next_plan: document.getElementById('sess-next')?.value||''
      });
      dbError = error;
    }
    if (dbError) toastErr('Error guardando sesión: ' + dbError.message);
    else toastOk('Sesión guardada correctamente ✓');
  }
  
  // Actualizar en memoria — sobreescribir si mismo día
  const a = appointments.find(x => x.id === appt.id);
  if (a) a.hasSession = true;
  
  const pt2 = getPatient(appt.patientId);
  if (pt2) {
    if (!pt2.log) pt2.log = [];
    const hh = appt.hour + ':00';
    const existIdx = pt2.log.findIndex(s => s.date === appt.date && s.hour === hh);
    const newEntry = {date:appt.date, type:type, hour:hh, status:'asistió', pb:pb, pa:pa, note:note, tags:[]};
    if (existIdx >= 0) {
      pt2.log[existIdx] = newEntry; // sobreescribir misma cita
    } else {
      pt2.log.push(newEntry); // nueva entrada (otra cita el mismo día está permitida)
    }
  }
  
  closeModal('session-modal');
  _pendingSessionAppt = null;
  renderGrid();
  updateResumenBadge();
  toastOk('Sesión guardada en historial clínico ✓');
}

function skipSession() {
  closeModal('session-modal');
  _pendingSessionAppt = null;
  toastInfo('Sesión omitida — puedes registrarla desde Informe paciente');
}

// ── IA CON ANTHROPIC API ────────────────────────────────────
async function callAI(prompt, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.style.display = 'block';
  // Abrir Claude.ai con el prompt — gratis, sin API key
  const encoded = encodeURIComponent(prompt);
  const url = 'https://claude.ai/new?q=' + encoded;
  window.open(url, '_blank');
  el.innerHTML = '<div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:14px;font-size:12px;color:#6b6a64;line-height:1.6">'
    + '<div style="font-weight:600;color:#1D9E75;margin-bottom:6px">✓ Claude.ai abierto en nueva pestaña</div>'
    + 'El informe se está generando en Claude.ai. Copia el resultado y pégalo aquí si lo necesitas.<br><br>'
    + '<textarea style="width:100%;background:#f8f8f4;border:1px solid rgba(29,158,117,.25);border-radius:6px;padding:8px;font-size:12px;color:#1a1917;font-family:inherit;resize:vertical;min-height:80px" placeholder="Pega aquí el informe generado por Claude..."></textarea>'
    + '</div>';
}

function genSemanalAI() {
  const conf = appointments.filter(a=>a.status==='conf').length;
  const noas = appointments.filter(a=>a.status==='noas').length;
  const total = appointments.length;
  const prompt = `Eres el asistente de gestión de Rehactiva, centro de rehabilitación y fisioterapia en Quito, Ecuador. 
Analiza estos datos de la semana:
- Total de citas: ${total}
- Confirmadas/asistidas: ${conf}
- No asistieron: ${noas}
- Terapeutas activos: ${therapists.length}
- Tasa de asistencia: ${total>0?Math.round(conf/total*100):0}%

Genera un análisis ejecutivo breve (máximo 200 palabras) con: resumen del desempeño, puntos de atención y 2-3 recomendaciones concretas. Responde en español, tono profesional y directo.`;
  callAI(prompt, 'insights');
}

function genResumenDiaAI() {
  const ds = fmtDate(currentDate);
  const hoy = appointments.filter(a=>a.date===ds);
  const conf = hoy.filter(a=>a.status==='conf').length;
  const noas = hoy.filter(a=>a.status==='noas').length;
  const pend = hoy.filter(a=>a.status==='pend').length;
  const prompt = `Eres el asistente de Rehactiva, centro de rehabilitación en Quito. 
Datos del día ${ds}:
- Citas totales: ${hoy.length}
- Asistieron: ${conf}
- No asistieron: ${noas}  
- Pendientes: ${pend}

Genera un resumen del día en máximo 150 palabras con acciones de seguimiento para los no asistidos. Español, directo y profesional.`;
  callAI(prompt, 'resumen-ai-output');
}

function genPatientAI() {
  const selEl = document.getElementById('patient-rpt-select');
  if (!selEl) return;
  const id = selEl.value;
  const p = patients.find(x=>x.id===id || String(x.id)===id);
  if (!p) { toastErr('Selecciona un paciente primero'); return; }
  const th = getTherapist(p.therapistId);
  const doc = p.doctorId ? getDoctor(p.doctorId) : null;
  const sesiones = p.log && p.log.length > 0 ? p.log.map(s=>
    `- ${s.date}: EVA ${s.pb||'?'}→${s.pa||'?'}, ${s.type||s.status||''}, ${s.note||''}`.trim()
  ).join('\n') : 'Sin sesiones registradas aún';
  const prompt = `Eres un fisioterapeuta redactando un informe clínico profesional para Ecuador.

DATOS DEL PACIENTE:
- Nombre: ${p.name}
- Edad: ${p.age||'No registrada'} años
- Diagnóstico: ${p.diag||'No especificado'}
- Terapeuta: ${th?th.name:'No asignado'}
- Doctor referente: ${doc?doc.name+' ('+doc.spec+')':'Independiente'}
- Sesiones prescritas: ${p.sessions||0}
- Sesiones realizadas: ${p.done||0}
- Estado: ${p.status==='active'?'En tratamiento':p.status==='alta'?'Alta médica':'Inactivo'}

HISTORIAL DE SESIONES:
${sesiones}

Redacta un informe clínico de evolución en español, formato profesional médico, máximo 300 palabras. Incluye: estado actual, evolución del dolor (EVA), respuesta al tratamiento y recomendaciones.`;
  
  const outputEl = document.getElementById('patient-rpt-ai-output');
  if (outputEl) {
    outputEl.style.display = 'block';
    callAI(prompt, 'patient-rpt-ai-output');
  }
}

// ── EVALUACIÓN INICIAL MODAL ────────────────────────────────
let _evalPatientId = null;
let _evEvaVal = 5;

function openEvalInicial(patientId) {
  _evalPatientId = patientId;
  const p = getPatient(patientId);
  document.getElementById('eval-modal-patient-name').textContent =
    p ? p.name + ' · ' + (p.diag || 'Sin diagnóstico') : '';
  // Limpiar campos
  ['ev-ant-fam','ev-ant-per','ev-anamnesis','ev-obs','ev-insp','ev-palp','ev-movilidad','ev-fuerza','ev-notas'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  ['ev-cervical','ev-dorsal','ev-lumbar','ev-sup','ev-inf'].forEach(id => {
    const el = document.getElementById(id); if(el) el.checked = false;
  });
  document.getElementById('ev-pedido-no').checked = true;
  _evEvaVal = 5;
  renderEvEva();
  document.getElementById('eval-modal').classList.add('open');
}

function renderEvEva() {
  const container = document.getElementById('ev-eva-btns');
  if (!container) return;
  const colors = ['#22c55e','#4ade80','#86efac','#a3e635','#facc15','#fb923c','#f97316','#ef4444','#dc2626','#b91c1c','#991b1b'];
  container.innerHTML = '';
  for (let i = 0; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = i;
    const active = i === _evEvaVal;
    btn.style.cssText = 'flex:1;padding:8px 2px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;transition:all .1s;'
      + 'border:2px solid ' + (active ? colors[i] : 'transparent') + ';'
      + 'background:' + (active ? colors[i] + '33' : '#1a1917') + ';'
      + 'color:' + (active ? colors[i] : '#6b6a64');
    btn.onclick = () => { _evEvaVal = i; document.getElementById('ev-eva-val').value = i; renderEvEva(); };
    container.appendChild(btn);
  }
}

async function saveEvalInicial() {
  if (!_evalPatientId) return;
  const anamnesis = document.getElementById('ev-anamnesis').value.trim();
  if (!anamnesis) {
    document.getElementById('ev-anamnesis').style.borderColor = 'rgba(224,80,80,.6)';
    toastErr('La anamnesis es obligatoria');
    return;
  }
  document.getElementById('ev-anamnesis').style.borderColor = '';

  const zonas = ['ev-cervical','ev-dorsal','ev-lumbar','ev-sup','ev-inf']
    .filter(id => document.getElementById(id)?.checked)
    .map(id => ({
      'ev-cervical':'Columna cervical','ev-dorsal':'Columna dorsal',
      'ev-lumbar':'Columna lumbar','ev-sup':'Miembro superior','ev-inf':'Miembro inferior'
    })[id]).join(', ');

  const nota = [
    document.getElementById('ev-ant-fam').value ? 'Ant. familiares: ' + document.getElementById('ev-ant-fam').value : '',
    document.getElementById('ev-ant-per').value ? 'Ant. personales: ' + document.getElementById('ev-ant-per').value : '',
    zonas ? 'Zonas: ' + zonas : '',
    document.getElementById('ev-obs').value ? 'Observación: ' + document.getElementById('ev-obs').value : '',
    document.getElementById('ev-insp').value ? 'Inspección: ' + document.getElementById('ev-insp').value : '',
    document.getElementById('ev-palp').value ? 'Palpación: ' + document.getElementById('ev-palp').value : '',
    document.getElementById('ev-movilidad').value ? 'Movilidad: ' + document.getElementById('ev-movilidad').value : '',
    document.getElementById('ev-fuerza').value ? 'Fuerza: ' + document.getElementById('ev-fuerza').value : '',
    document.querySelector('input[name="ev-pedido"]:checked')?.value === 'si' ? 'Pedido médico: SÍ' : '',
    document.getElementById('ev-notas').value || ''
  ].filter(Boolean).join(' | ');

  const eva = _evEvaVal;
  const { error } = await supa.from('session_log').insert({
    patient_id: _evalPatientId,
    date: fmtDate(new Date()),
    type: 'Evaluación inicial',
    hour: '00:00',
    status: 'asistió',
    pain_before: eva,
    pain_after: eva,
    note: anamnesis + (nota ? ' | ' + nota : '')
  });

  if (error) { toastErr('Error al guardar: ' + error.message); return; }

  // Actualizar en memoria
  const p = getPatient(_evalPatientId);
  if (p) {
    if (!p.log) p.log = [];
    p.log.unshift({
      date: fmtDate(new Date()), type: 'Evaluación inicial',
      hour: '00:00', status: 'asistió',
      pb: eva, pa: eva, note: anamnesis + (nota ? ' | ' + nota : '')
    });
  }

  closeModal('eval-modal');
  renderPatients();
  renderResumen();
  toastOk('✓ Evaluación inicial guardada');
}

// ── CITAS RECURRENTES ────────────────────────────────────────
function toggleRecurrencia() {
  const on = document.getElementById('m-recurrente').checked;
  document.getElementById('recurrencia-panel').style.display = on ? 'block' : 'none';
  if (on) updateRecPreview();
}

function updateRecPreview() {
  const dias = [...document.querySelectorAll('.rec-day:checked')].map(c => parseInt(c.value));
  const semanas = parseInt(document.getElementById('m-rec-semanas').value);
  const dateVal = document.getElementById('m-date').value || fmtDate(currentDate);
  if (!dias.length) {
    document.getElementById('rec-preview').textContent = 'Selecciona al menos un día';
    return;
  }
  const fechas = getRecDates(dateVal, dias, semanas);
  document.getElementById('rec-preview').textContent =
    `Se crearán ${fechas.length} citas: ${fechas.slice(0,3).join(', ')}${fechas.length > 3 ? '... y ' + (fechas.length-3) + ' más' : ''}`;
}

function getRecDates(baseDate, dias, semanas) {
  const fechas = [];
  const start = new Date(baseDate + 'T12:00:00');
  for (let w = 0; w < semanas; w++) {
    for (let d = 0; d < 7; d++) {
      const fecha = new Date(start);
      fecha.setDate(start.getDate() + w * 7 + d);
      if (dias.includes(fecha.getDay())) {
        const ds = fmtDate(fecha);
        if (ds > baseDate) fechas.push(ds);
      }
    }
  }
  return [...new Set(fechas)].sort();
}

// Listener para actualizar preview
document.addEventListener('change', function(e) {
  if (e.target.classList.contains('rec-day') || e.target.id === 'm-rec-semanas') {
    updateRecPreview();
  }
});

// ── BUSCADOR GLOBAL ──────────────────────────────────────────
function globalSearch(q) {
  const res = document.getElementById('global-search-results');
  if (!q || q.length < 2) { res.style.display = 'none'; return; }
  q = q.toLowerCase();
  const matches = patients.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.cedula && p.cedula.includes(q)) ||
    (p.diag && p.diag.toLowerCase().includes(q)) ||
    (p.tel && p.tel.includes(q))
  ).slice(0, 8);

  if (!matches.length) {
    res.style.display = 'block';
    res.innerHTML = '<div style="padding:12px;font-size:12px;color:#9c9a92;text-align:center">Sin resultados</div>';
    return;
  }

  res.style.display = 'block';
  res.innerHTML = '';
  matches.forEach(p => {
    const th = getTherapist(p.therapistId);
    const evalOk = hasEvalInicial(p);
    const div = document.createElement('div');
    div.style.cssText = 'padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center;gap:10px';
    div.onmouseover = () => div.style.background = '#f5f5f0';
    div.onmouseout = () => div.style.background = '';
    div.onclick = () => selectGlobalResult(p.id);
    div.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#e8f5f0;color:#1D9E75;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">'
      + esc(p.name.split(' ').map(n=>n[0]).join('').slice(0,2)) + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:12px;font-weight:600;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.name) + (evalOk ? '' : ' ⚠️') + '</div>'
      + '<div style="font-size:10px;color:#9c9a92">' + esc(p.diag||'Sin diagnóstico') + (th?' · '+esc(th.name):'') + '</div>'
      + '</div>';
    res.appendChild(div);
  });
}

function selectGlobalResult(patientId) {
  document.getElementById('global-search').value = '';
  document.getElementById('global-search-results').style.display = 'none';
  // Ir a informe del paciente
  showTab('paciente_rpt');
  setTimeout(() => {
    const sel = document.getElementById('patient-rpt-select');
    if (sel) { sel.value = String(patientId); updateEpisodes(); }
  }, 100);
}

// Cerrar resultados al clickear fuera
document.addEventListener('click', function(e) {
  if (!e.target.closest('#global-search') && !e.target.closest('#global-search-results')) {
    const res = document.getElementById('global-search-results');
    if (res) res.style.display = 'none';
  }
});

// ── ALERTA CITAS SIN CONFIRMAR ───────────────────────────────
function checkCitasPendientes() {
  const n = new Date();
  const todayStr = fmtDate(n);
  // Citas de ayer sin confirmar
  const ayer = new Date(n); ayer.setDate(n.getDate()-1);
  const ayerStr = fmtDate(ayer);
  const sinConf = appointments.filter(a => a.date === ayerStr && a.status === 'pend');
  if (sinConf.length > 0) {
    toastErr(`⚠️ ${sinConf.length} cita${sinConf.length>1?'s':''} de ayer sin confirmar`);
  }
  // Citas de hoy pendientes que ya pasaron
  const hoyPend = appointments.filter(a => a.date === todayStr && a.status === 'pend' && a.hour < n.getHours());
  if (hoyPend.length > 0) {
    setTimeout(() => toastErr(`📋 ${hoyPend.length} cita${hoyPend.length>1?'s':''} de hoy sin registrar`), 2000);
  }
}

// ── NUEVO EPISODIO ───────────────────────────────────────────
let _nePatientId = null;

function nuevoEpisodio(patientId) {
  _nePatientId = patientId;
  const p = getPatient(patientId);
  if (!p) return;
  document.getElementById('ne-patient-name').textContent = p.name + ' · Episodio anterior: ' + (p.diag || 'Sin diagnóstico');
  document.getElementById('ne-diag').value = '';
  document.getElementById('ne-sessions').value = 12;
  document.querySelector('input[name="ne-eval"][value="si"]').checked = true;
  populateDiagList();
  document.getElementById('nuevo-episodio-modal').classList.add('open');
}

async function guardarNuevoEpisodio() {
  if (!_nePatientId) return;
  const p = getPatient(_nePatientId);
  if (!p) return;
  const newDiag = document.getElementById('ne-diag').value.trim();
  const newSessions = parseInt(document.getElementById('ne-sessions').value) || 12;
  const abrirEval = document.querySelector('input[name="ne-eval"]:checked').value === 'si';

  if (!newDiag) { toastErr('Ingresa el nuevo diagnóstico'); return; }

  // Guardar marcador de fin de episodio en session_log
  const oldDiag = p.diag;
  await supa.from('session_log').insert({
    patient_id: _nePatientId,
    date: fmtDate(new Date()),
    type: 'Fin de episodio',
    hour: '00:00',
    status: 'asistió',
    pain_before: 0, pain_after: 0,
    note: `Episodio anterior: ${oldDiag} · ${p.done||0} sesiones completadas`
  });

  // Actualizar paciente en Supabase
  const { error } = await supa.from('patients').update({
    diag: newDiag,
    sessions: newSessions,
    done: 0,
    status: 'active',
    billing_pendientes: 0
  }).eq('id', _nePatientId);

  if (error) { toastErr('Error: ' + error.message); return; }

  // Actualizar en memoria
  p.diag = newDiag;
  p.sessions = newSessions;
  p.done = 0;
  p.status = 'active';
  if (p.billing) p.billing.pendientes = 0;

  closeModal('nuevo-episodio-modal');
  toastOk('✓ Nuevo episodio iniciado — ' + newDiag);

  // Actualizar vistas
  renderPatients();
  renderPatientReportSelect();
  setTimeout(() => {
    const sel = document.getElementById('patient-rpt-select');
    if (sel) { sel.value = String(_nePatientId); updateEpisodes(); }
  }, 100);

  // Abrir evaluación inicial si eligió sí
  if (abrirEval) {
    setTimeout(() => openEvalInicial(_nePatientId), 400);
  }
}

// ── EXPORTAR PDF ─────────────────────────────────────
function exportarPDF() {
  const id = document.getElementById('patient-rpt-select')?.value;
  const p = id ? patients.find(x => String(x.id) === String(id)) : null;
  const win = window.open('', '_blank');
  if (!win) { toastErr('Permite ventanas emergentes para exportar PDF'); return; }

  const log = (p?.log || []).filter(s => s && s.date && s.type !== 'Fin de episodio');
  const attended = log.filter(s => s.status === 'asistió');
  const pct = p && p.sessions > 0 ? Math.round((p.done || 0) / p.sessions * 100) : 0;
  const adh = log.length > 0 ? Math.round(attended.length / log.length * 100) : 0;
  const fp = attended[0], lp = attended.slice(-1)[0];
  const doc = p && p.doctorId ? getDoctor(p.doctorId) : null;
  const today = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });

  // Generar filas de la tabla por separado
  let filasTabla = '';
  if (log.length) {
    filasTabla = [...log].reverse().map(function(s) {
      const evaTxt = s.pb != null ? s.pb + '→' + (s.pa != null ? s.pa : '?') : '—';
      const estadoCls = s.status === 'asistió' ? 'pg' : 'pr';
      return '<tr>' +
        '<td>' + s.date + '</td>' +
        '<td>' + (s.hour || '—') + '</td>' +
        '<td>' + (s.type || '—') + '</td>' +
        '<td style="text-align:center">' + evaTxt + '</td>' +
        '<td><span class="pill ' + estadoCls + '">' + (s.status || '—') + '</span></td>' +
        '<td style="font-size:10px;color:#6b6a64">' + (s.note || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  const tablaHTML = log.length
    ? '<table><thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>EVA antes/después</th><th>Estado</th><th>Nota clínica</th></tr></thead><tbody>' + filasTabla + '</tbody></table>'
    : '<div style="color:#6b6a64;padding:12px 0">Sin sesiones registradas.</div>';

  const evaCol = fp && lp && (fp.pb - (lp.pa || 0)) > 0 ? '#1D9E75' : '#6b6a64';
  const evaTxt = fp && lp && fp.pb != null
    ? (fp.pb + '→' + (lp.pa != null ? lp.pa : '?'))
    : '—';
  const evaLbl = fp && lp && fp.pb != null
    ? ((fp.pb - (lp.pa || 0)) > 0 ? '↓ Mejoró' : 'Sin cambio EVA')
    : 'Sin datos';
  const adhCol = adh >= 85 ? '#1D9E75' : adh >= 70 ? '#BA7517' : '#E24B4A';

  const html = '<!DOCTYPE html><html lang="es"><head>' +
    '<meta charset="UTF-8">' +
    '<title>Informe — ' + (p ? p.name : 'Paciente') + '</title>' +
    '<style>' +
      '* { box-sizing:border-box; margin:0; padding:0; }' +
      'body { font-family: Arial, sans-serif; font-size:12px; color:#1a1917; padding:30px; max-width:800px; margin:0 auto; }' +
      'h1 { font-size:20px; color:#1D9E75; margin-bottom:4px; }' +
      'h2 { font-size:13px; font-weight:600; color:#1D9E75; margin:18px 0 8px; border-bottom:1px solid #e0efe8; padding-bottom:4px; }' +
      '.header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }' +
      '.logo { font-size:18px; font-weight:700; }' +
      '.logo span { color:#1D9E75; }' +
      '.fecha { font-size:10px; color:#6b6a64; }' +
      '.grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }' +
      '.stat-box { background:#f5f5f0; border-radius:8px; padding:10px 12px; text-align:center; }' +
      '.stat-num { font-size:24px; font-weight:700; color:#1D9E75; }' +
      '.stat-lbl { font-size:10px; color:#6b6a64; text-transform:uppercase; letter-spacing:.05em; }' +
      '.info-row { display:flex; gap:6px; margin-bottom:4px; }' +
      '.info-lbl { font-size:10px; font-weight:600; color:#6b6a64; text-transform:uppercase; min-width:100px; }' +
      '.info-val { font-size:12px; color:#1a1917; }' +
      'table { width:100%; border-collapse:collapse; margin-top:8px; }' +
      'th { background:#f0f0e8; padding:7px 10px; font-size:10px; text-align:left; text-transform:uppercase; letter-spacing:.05em; color:#6b6a64; }' +
      'td { padding:7px 10px; border-bottom:1px solid #f0efe8; font-size:11px; color:#1a1917; }' +
      '.pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }' +
      '.pg { background:#dcfce7; color:#166534; }' +
      '.pr { background:#fee2e2; color:#991b1b; }' +
      '@media print { body { padding:15px; } button { display:none; } }' +
    '</style></head><body>' +
    '<div class="header">' +
      '<div>' +
        '<div class="logo">Reha<span>activa</span></div>' +
        '<div style="font-size:10px;color:#6b6a64">Centro de Rehabilitación y Fisioterapia</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:14px;font-weight:700">INFORME CLÍNICO</div>' +
        '<div class="fecha">' + today + '</div>' +
        '<button onclick="window.print()" style="margin-top:8px;padding:6px 14px;background:#1D9E75;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">🖨️ Imprimir / Guardar PDF</button>' +
      '</div>' +
    '</div>' +
    '<h2>Datos del paciente</h2>' +
    '<div class="info-row"><span class="info-lbl">Nombre</span><span class="info-val">' + (p?.name || '—') + '</span></div>' +
    '<div class="info-row"><span class="info-lbl">Cédula</span><span class="info-val">' + (p?.cedula || '—') + '</span></div>' +
    '<div class="info-row"><span class="info-lbl">Edad</span><span class="info-val">' + (p?.age || '—') + ' años</span></div>' +
    '<div class="info-row"><span class="info-lbl">Teléfono</span><span class="info-val">' + (p?.tel || '—') + '</span></div>' +
    '<div class="info-row"><span class="info-lbl">Correo</span><span class="info-val">' + (p?.email || '—') + '</span></div>' +
    '<div class="info-row"><span class="info-lbl">Diagnóstico</span><span class="info-val">' + (p?.diag || '—') + '</span></div>' +
    '<div class="info-row"><span class="info-lbl">Doctor ref.</span><span class="info-val">' + (doc ? doc.name + ' (' + doc.spec + ')' : 'Independiente') + '</span></div>' +
    '<h2>Resumen de evolución</h2>' +
    '<div class="grid3">' +
      '<div class="stat-box"><div class="stat-num">' + pct + '%</div><div class="stat-lbl">Progreso</div><div style="font-size:10px;color:#6b6a64">' + (p?.done || 0) + ' de ' + (p?.sessions || 0) + ' sesiones</div></div>' +
      '<div class="stat-box"><div class="stat-num" style="color:' + adhCol + '">' + adh + '%</div><div class="stat-lbl">Continuidad</div><div style="font-size:10px;color:#6b6a64">' + attended.length + ' asist. / ' + log.length + ' citas</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + evaTxt + '</div><div class="stat-lbl">Evolución EVA</div><div style="font-size:10px;color:' + evaCol + '">' + evaLbl + '</div></div>' +
    '</div>' +
    '<h2>Historial de sesiones (' + log.length + ' registros)</h2>' +
    tablaHTML +
    '<div style="margin-top:30px;padding-top:16px;border-top:1px solid #e0efe8;display:flex;justify-content:space-between;font-size:10px;color:#9c9a92">' +
      '<span>Rehactiva Rehabilitación y Fisioterapia · Quito, Ecuador</span>' +
      '<span>Generado el ' + today + '</span>' +
    '</div>' +
    '</body></html>';

  win.document.write(html);
  win.document.close();
}

// ============================================================
// REALTIME — sincronización entre pestañas/usuarios
// ============================================================
let realtimeChannel=null;
let realtimeReconnectTimer=null;

// ── Anti-eco por tabla (ventana 3 s) ──
const ANTI_ECHO_MS = 3000;
const TRACKED_TABLES = new Set(['appointments','patients','session_log','cobros','therapists','doctors']);
const _lastLocalChangeByTable = new Map();
function markLocalChange(table){
  if (table) { _lastLocalChangeByTable.set(table, Date.now()); return; }
  // Sin argumento: marcar todas (compatibilidad con callsites antiguos)
  const now = Date.now();
  TRACKED_TABLES.forEach(t => _lastLocalChangeByTable.set(t, now));
}
function isLocalEcho(table){
  const ts = _lastLocalChangeByTable.get(table) || 0;
  return (Date.now() - ts) < ANTI_ECHO_MS;
}

// ── Wrapper sobre supa.from: auto-marca cualquier mutación sobre tablas tracked ──
// Captura escrituras directas (cycleStatus, deletePatient, nuevoEpisodio, etc.) sin
// depender de que cada callsite recuerde llamar markLocalChange.
const _supaFromOrig = supa.from.bind(supa);
supa.from = function(table){
  const builder = _supaFromOrig(table);
  if (TRACKED_TABLES.has(table)) {
    ['insert','update','upsert','delete'].forEach(method => {
      const orig = builder[method];
      if (typeof orig === 'function') {
        builder[method] = function(...args){
          markLocalChange(table);
          return orig.apply(builder, args);
        };
      }
    });
  }
  return builder;
};

// ── Toasts agrupados (debounce 600 ms) ──
let _toastFlushTimer = null;
const _pendingToasts = new Map(); // table → { count, lastMsg }
const _TOAST_PLURAL = {
  appointments: 'Cambios en agenda',
  patients:     'Pacientes actualizados',
  session_log:  'Sesiones actualizadas',
  cobros:       'Cobros registrados',
  therapists:   'Terapeutas actualizados',
  doctors:      'Doctores actualizados',
};
function queueRemoteToast(table, msg){
  if (isLocalEcho(table)) return;
  const cur = _pendingToasts.get(table) || { count: 0, lastMsg: msg };
  cur.count += 1;
  cur.lastMsg = msg;
  _pendingToasts.set(table, cur);
  if (_toastFlushTimer) clearTimeout(_toastFlushTimer);
  _toastFlushTimer = setTimeout(_flushRemoteToasts, 600);
}
function _flushRemoteToasts(){
  _toastFlushTimer = null;
  for (const [table, info] of _pendingToasts) {
    const msg = info.count === 1
      ? info.lastMsg
      : `${_TOAST_PLURAL[table] || 'Cambios remotos'} (${info.count})`;
    toastInfo(msg);
  }
  _pendingToasts.clear();
}

// ── Mappers DB row → in-memory shape ──
function _mapAppt(r){
  const pt=getPatient(r.patient_id);
  return {id:r.id,date:r.date,therapistId:r.therapist_id,patientId:r.patient_id,patientName:pt?pt.name:null,hour:r.hour,type:r.type||'Fisioterapia',status:r.status||'pend',note:r.note||''};
}
function _mapPatient(r){
  const existing=patients.find(p=>p.id===r.id);
  return {
    id:r.id,name:r.name,age:r.age||35,cedula:r.cedula||'',tel:r.tel||'',email:r.email||'',dir:r.dir||'',
    diag:r.diag||'Sin diagnóstico',therapistId:r.therapist_id,doctorId:r.doctor_id,
    sessions:r.sessions||10,done:r.done||0,status:r.status||'active',
    log: existing ? existing.log : [],
    billing: {
      sesPerFactura:r.billing_ses_per_factura||5,
      pendientes:r.billing_pendientes||0,
      facturas: existing && existing.billing ? existing.billing.facturas : []
    }
  };
}
function _mapTherapist(r){ return {id:r.id,name:r.name,initials:r.initials||r.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(),spec:r.spec||'',startH:r.start_h,endH:r.end_h,colorId:r.color_id||'ca'}; }
function _mapDoctor(r){ return {id:r.id,name:r.name,spec:r.spec||'',email:r.email||'',tel:r.tel||'',color:r.color||'#E24B4A'}; }
function _mapSession(s){ return {date:s.date,type:s.type,hour:s.hour,status:s.status,pb:s.pain_before,pa:s.pain_after,note:s.note||'',tags:s.tags||[]}; }

// ── Re-render según pestaña activa ──
function _refreshTabAfterAppt(){
  if(currentTab==='agenda') renderGrid();
  else if(currentTab==='resumen') renderResumen();
  else if(currentTab==='facturacion') renderFacturacion();
  updateResumenBadge(); updateFacturaBadge();
}

// ── Handlers por tabla ──
function _onAppt(payload){
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!appointments.find(a=>a.id===payload.new.id)){
      appointments.push(_mapAppt(payload.new));
      queueRemoteToast('appointments','Nueva cita agregada');
    }
  } else if(ev==='UPDATE'){
    const i=appointments.findIndex(a=>a.id===payload.new.id);
    const mapped=_mapAppt(payload.new);
    if(i>=0){ mapped.hasSession=appointments[i].hasSession; appointments[i]=mapped; }
    else appointments.push(mapped);
    queueRemoteToast('appointments','Cita actualizada');
  } else if(ev==='DELETE'){
    const before=appointments.length;
    appointments=appointments.filter(a=>a.id!==payload.old.id);
    if(appointments.length<before) queueRemoteToast('appointments','Cita eliminada');
  }
  _refreshTabAfterAppt();
}

function _onPatient(payload){
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!patients.find(p=>p.id===payload.new.id)){
      patients.push(_mapPatient(payload.new));
      queueRemoteToast('patients','Paciente agregado');
    }
  } else if(ev==='UPDATE'){
    const i=patients.findIndex(p=>p.id===payload.new.id);
    if(i>=0) patients[i]=_mapPatient(payload.new);
    else patients.push(_mapPatient(payload.new));
    queueRemoteToast('patients','Paciente actualizado');
  } else if(ev==='DELETE'){
    const before=patients.length;
    patients=patients.filter(p=>p.id!==payload.old.id);
    if(patients.length<before) queueRemoteToast('patients','Paciente eliminado');
  }
  if(currentTab==='pacientes') renderPatients();
  else if(currentTab==='paciente_rpt'){
    const sel=document.getElementById('patient-rpt-select')?.value;
    if(sel) renderPatientReport();
  }
  else if(currentTab==='facturacion') renderFacturacion();
  updateFacturaBadge();
}

function _onSessionLog(payload){
  const ev=payload.eventType;
  const row=payload.new||payload.old;
  if(!row) return;
  const pid=row.patient_id;
  const p=getPatient(pid);
  if(!p) return;
  if(!p.log) p.log=[];
  if(ev==='INSERT'){
    if(!p.log.find(s=>s.date===payload.new.date && s.hour===payload.new.hour)){
      p.log.push(_mapSession(payload.new));
      queueRemoteToast('session_log','Sesión clínica registrada');
    }
    // marcar appointment.hasSession
    const hh=String((payload.new.hour||'').split(':')[0]);
    const a=appointments.find(x=>x.patientId===pid && x.date===payload.new.date && String(x.hour)===hh);
    if(a) a.hasSession=true;
  } else if(ev==='UPDATE'){
    const idx=p.log.findIndex(s=>s.date===payload.new.date && s.hour===payload.new.hour);
    if(idx>=0) p.log[idx]=_mapSession(payload.new);
    else p.log.push(_mapSession(payload.new));
    queueRemoteToast('session_log','Sesión actualizada');
  } else if(ev==='DELETE'){
    p.log=p.log.filter(s=>!(s.date===payload.old.date && s.hour===payload.old.hour));
    queueRemoteToast('session_log','Sesión eliminada');
  }
  if(currentTab==='paciente_rpt'){
    const sel=document.getElementById('patient-rpt-select')?.value;
    if(String(sel)===String(pid)) renderPatientReport();
  }
  if(currentTab==='agenda') renderGrid();
}

function _onCobro(payload){
  const ev=payload.eventType;
  if(ev==='INSERT'){
    const r=payload.new;
    const p=getPatient(r.patient_id);
    if(p && p.billing){
      if(!p.billing.facturas.find(f=>f.id===r.cobro_ref)){
        p.billing.facturas.push({id:r.cobro_ref,n:r.n_sessions,fecha:r.date,estado:'cobrada'});
      }
      const m=String(r.cobro_ref||'').match(/^F(\d+)$/);
      if(m){ const n=parseInt(m[1],10); if(n>facturaCounter) facturaCounter=n; }
    }
    queueRemoteToast('cobros','Cobro registrado');
  }
  if(currentTab==='facturacion') renderFacturacion();
  updateFacturaBadge();
}

function _onTherapist(payload){
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!therapists.find(t=>t.id===payload.new.id)){
      therapists.push(_mapTherapist(payload.new));
      queueRemoteToast('therapists','Terapeuta agregado');
    }
  } else if(ev==='UPDATE'){
    const i=therapists.findIndex(t=>t.id===payload.new.id);
    if(i>=0) therapists[i]=_mapTherapist(payload.new);
    else therapists.push(_mapTherapist(payload.new));
    queueRemoteToast('therapists','Terapeuta actualizado');
  } else if(ev==='DELETE'){
    const before=therapists.length;
    therapists=therapists.filter(t=>t.id!==payload.old.id);
    if(therapists.length<before) queueRemoteToast('therapists','Terapeuta eliminado');
  }
  if(currentTab==='terapeutas') renderTherapistList();
  if(currentTab==='agenda') renderGrid();
}

function _onDoctor(payload){
  const ev=payload.eventType;
  if(ev==='INSERT'){
    if(!doctors.find(d=>d.id===payload.new.id)){
      doctors.push(_mapDoctor(payload.new));
      queueRemoteToast('doctors','Doctor agregado');
    }
  } else if(ev==='UPDATE'){
    const i=doctors.findIndex(d=>d.id===payload.new.id);
    if(i>=0) doctors[i]=_mapDoctor(payload.new);
    else doctors.push(_mapDoctor(payload.new));
    queueRemoteToast('doctors','Doctor actualizado');
  } else if(ev==='DELETE'){
    const before=doctors.length;
    doctors=doctors.filter(d=>d.id!==payload.old.id);
    if(doctors.length<before) _toastRemote('Doctor eliminado');
  }
  renderRefLegend();
  if(currentTab==='doctores') renderDoctorsList();
  if(currentTab==='agenda') renderGrid();
}

// ── Subscribe / Unsubscribe / Reconnect ──
function subscribeRealtime(){
  if(realtimeChannel) return;
  realtimeChannel = supa.channel('rehactiva-realtime')
    .on('postgres_changes',{event:'*',schema:'public',table:'appointments'},_onAppt)
    .on('postgres_changes',{event:'*',schema:'public',table:'patients'},    _onPatient)
    .on('postgres_changes',{event:'*',schema:'public',table:'session_log'}, _onSessionLog)
    .on('postgres_changes',{event:'*',schema:'public',table:'cobros'},      _onCobro)
    .on('postgres_changes',{event:'*',schema:'public',table:'therapists'},  _onTherapist)
    .on('postgres_changes',{event:'*',schema:'public',table:'doctors'},     _onDoctor)
    .subscribe(status=>{
      if(status==='SUBSCRIBED'){
        console.log('[Realtime] conectado');
        if(realtimeReconnectTimer){ clearTimeout(realtimeReconnectTimer); realtimeReconnectTimer=null; }
      } else if(status==='CHANNEL_ERROR' || status==='CLOSED' || status==='TIMED_OUT'){
        console.warn('[Realtime] estado:', status, '— reintento en 5s');
        if(!realtimeReconnectTimer){
          realtimeReconnectTimer=setTimeout(async ()=>{
            realtimeReconnectTimer=null;
            try { if(realtimeChannel) await supa.removeChannel(realtimeChannel); } catch(e){}
            realtimeChannel=null;
            try {
              await loadAll(); // resync por si perdimos eventos
              if(currentTab==='agenda') renderGrid();
              else if(currentTab==='pacientes') renderPatients();
              else if(currentTab==='resumen') renderResumen();
              else if(currentTab==='facturacion') renderFacturacion();
              updateResumenBadge(); updateFacturaBadge();
            } catch(e){ console.warn('[Realtime] resync falló:', e); }
            subscribeRealtime();
          }, 5000);
        }
      }
    });
}

async function unsubscribeRealtime(){
  if(realtimeReconnectTimer){ clearTimeout(realtimeReconnectTimer); realtimeReconnectTimer=null; }
  if(realtimeChannel){
    try { await supa.removeChannel(realtimeChannel); } catch(e){}
    realtimeChannel=null;
  }
}

async function initApp(){
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('loading-overlay').style.display='none';
  const {data:{session}} = await supa.auth.getSession();
  if(session){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('loading-overlay').style.display='flex';
    await loadAll();
    document.getElementById('loading-overlay').style.display='none';
    checkAutoNoas();renderGrid();updateResumenBadge();updateFacturaBadge();
    checkCitasPendientes();
    subscribeRealtime();
  }
}
// ============================================================
// SISTEMA DE NOTIFICACIONES (toasts)
// ============================================================
function showToast(msg,type,duration){
  type=type||'success';duration=duration||3500;
  const c=document.getElementById('toast-container');
  if(!c)return;
  const t=document.createElement('div');
  t.className='toast '+type;
  const icons={success:'✓',error:'✕',info:'ℹ'};
  t.innerHTML='<span class="toast-icon">'+(icons[type]||'ℹ')+'</span><span class="toast-msg">'+esc(msg)+'</span>';
  c.appendChild(t);
  setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(function(){t.remove();},300);},duration);
}
function toastOk(msg){showToast(msg,'success',3500);}
function toastErr(msg){showToast(msg,'error',5000);}
function toastInfo(msg){showToast(msg,'info',3000);}

// Exponer funciones al window para que el HTML pueda llamarlas con onclick
Object.assign(window, {
  doLogin, doLogout, showTab, openApptModal, openPatientModal,
  openTherapistModal, openDoctorModal, openProtocolModal, openEditTherapist,
  openEditPatient, openSessionModal, openEvalInicial, openDatePicker,
  openWA, waPatient, agendarCitaParaPaciente, nuevoEpisodio,
  saveAppt, savePatient, saveTherapist, saveDoctor, saveProtocol,
  saveSession, saveEvalInicial, guardarNuevoEpisodio,
  delAppt, deletePatient, deleteTherapist, deleteDoctor, deleteProtocol,
  cycleStatus, changeDay, changeWeek, goToDate,
  showSubTab, showDoctoresTab, selectColor, selectDocColor,
  filterApptPatient, filterPatientRptSelect, updateEpisodes, updateTimeSlots,
  renderPatientReport, renderProtocols, protPage,
  toggleNotif, toggleRecurrencia, toggleProTecnica,
  closeModal, skipSession, simWA, simEmail, emitirFactura,
  marcarTodosFacturados, exportarPDF, genSemanalAI, genResumenDiaAI,
  genPatientAI, globalSearch, selectGlobalResult,
  updateGlobalSPF, updateRecPreview, populateDiagList,
  appointments, patients, supa, getPatient,
  hasEvalInicial
});

initApp();


