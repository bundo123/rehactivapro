export const state = {
  therapists: [],
  doctors: [],
  patients: [],
  appointments: [],
  protocols: [],
  informes: [],
  notifSettings: [
    {id:'wa_rec',label:'Recordatorio WhatsApp 24h antes',desc:'Envía mensaje automático al paciente 24h antes de su cita.',icon:'📱',on:true},
    {id:'email_th',label:'Email al terapeuta al asignar cita',desc:'Notifica al terapeuta cuando se le agenda una nueva cita.',icon:'✉️',on:true},
    {id:'wa_noas',label:'Mensaje automático de inasistencia',desc:'Si el paciente no asistió, le envía mensaje para reprogramar.',icon:'📱',on:false},
    {id:'resumen',label:'Resumen diario al administrador',desc:'Al finalizar el día, envía resumen con asistencias e inasistencias.',icon:'📊',on:true},
    {id:'email_doc',label:'Notificar al doctor referente en alta',desc:'Al dar de alta a un paciente, notifica al médico que lo refirió.',icon:'✉️',on:false},
  ],
  currentDate: new Date(),
  resumenDate: new Date(),   // NUEVO 3: fecha seleccionada del Resumen del día (independiente de la agenda)
  currentWeek: 0,
  currentTab: 'agenda',
  informesSubTab: 'semanal',  // sub-tab visible de Informes: define qué rango analiza el botón de IA
  informesMes: null,          // 'YYYY-MM' del selector del informe mensual (lo comparten renderMensual y genMensualAI)
  dragData: null,
  facturaCounter: 10,
  thCounter: 10,
  docCounter: 10,
  patCounter: 10,
  apptCounter: 20,
  protCounter: 10,
  protCurrentPage: 0,
  editingTherapistId: null,
  editingDocId: null,
  editingPatientId: null,
  editingProtocolId: null,
  selectedColor: 'ca',
  selectedDocColor: '#E24B4A',
  currentUserRole: null,
  currentUserProfile: null,
  currentUserId: null,
  lastLoaded: {},
  dataLoaded: false,
  patientPage: 1,
  patientEvalFilter: false,
  patientStatusFilter: 'all',
  seguimientoFilter: 'con',
  // Historial de citas: el paciente elegido SOBREVIVE al cambio de pestaña (se puede llegar desde
  // una cita o desde el informe y volver por el menú sin perder la consulta), pero el filtro se
  // resetea al cambiar de paciente — un corte por episodio no significa nada en otro paciente.
  historialPatientId: null,
  historialFiltro: { corte: 'all', mes: 'all', estado: 'all' },
};
