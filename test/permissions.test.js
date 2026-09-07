// Tests de la MATRIZ DE PERMISOS (hasPermission / canAccessTab) — node --test.
// permissions.js solo depende de state.js, que no toca DOM: se importa la función real.
// La tabla esperada está escrita A MANO a propósito: si se derivara de ROLE_ACTIONS el test
// no probaría nada, solo se repetiría a sí mismo. Al agregar una acción hay que tocar acá.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { hasPermission, canAccessTab } from '../js/permissions.js';

const _roleAntes = state.currentUserRole;
after(() => { state.currentUserRole = _roleAntes; });

// Todas las acciones que existen hoy, en el mismo orden que ROLE_ACTIONS.
const ACCIONES = [
  'createAppt','deleteAppt','cycleStatus','createPatient','editPatient','deletePatient',
  'registerSession','deleteSession','evalInicial','createTherapist','deleteTherapist',
  'createDoctor','createProtocol','emitirFactura','viewAI','deleteInforme','apptPastDate',
  'conciliarQB','manageBlocks','editAppt','newEpisode',
];

// true = el rol PUEDE. Escrita a mano, acción por acción.
const MATRIZ = {
  admin: {
    createAppt:true, deleteAppt:true, cycleStatus:true, createPatient:true, editPatient:true,
    deletePatient:true, registerSession:true, deleteSession:true, evalInicial:true,
    createTherapist:true, deleteTherapist:true, createDoctor:true, createProtocol:true,
    emitirFactura:true, viewAI:true, deleteInforme:true, apptPastDate:true, conciliarQB:true,
    manageBlocks:true, editAppt:true, newEpisode:true,
  },
  secretaria: {
    createAppt:true, deleteAppt:true, cycleStatus:true, createPatient:true, editPatient:true,
    deletePatient:false, registerSession:false, deleteSession:false, evalInicial:false,
    createTherapist:true, deleteTherapist:false, createDoctor:true, createProtocol:false,
    emitirFactura:true, viewAI:false, deleteInforme:false, apptPastDate:true, conciliarQB:true,
    manageBlocks:true, editAppt:true, newEpisode:false,
  },
  terapeuta: {
    createAppt:false, deleteAppt:false, cycleStatus:true, createPatient:false, editPatient:true,
    deletePatient:false, registerSession:true, deleteSession:false, evalInicial:true,
    createTherapist:false, deleteTherapist:false, createDoctor:false, createProtocol:false,
    emitirFactura:false, viewAI:true, deleteInforme:true, apptPastDate:false, conciliarQB:false,
    manageBlocks:false, editAppt:false, newEpisode:true,
  },
};

const TABS = ['agenda','historial','resumen','pacientes','seguimiento','paciente_rpt','protocolos',
              'informes','facturacion','terapeutas','doctores'];

const TABS_ESPERADOS = {
  admin: {
    agenda:true, historial:true, resumen:true, pacientes:true, seguimiento:true, paciente_rpt:true,
    protocolos:true, informes:true, facturacion:true, terapeutas:true, doctores:true,
  },
  secretaria: {
    agenda:true, historial:true, resumen:true, pacientes:true, seguimiento:true, paciente_rpt:true,
    protocolos:true, informes:false, facturacion:true, terapeutas:true, doctores:true,
  },
  terapeuta: {
    agenda:true, historial:true, resumen:true, pacientes:true, seguimiento:true, paciente_rpt:true,
    protocolos:true, informes:false, facturacion:false, terapeutas:false, doctores:false,
  },
};

for (const rol of Object.keys(MATRIZ)) {
  test(`hasPermission — matriz completa del rol ${rol}`, () => {
    state.currentUserRole = rol;
    for (const a of ACCIONES) {
      assert.equal(hasPermission(a), MATRIZ[rol][a], `${rol} × ${a}`);
    }
  });

  test(`canAccessTab — tabs del rol ${rol}`, () => {
    state.currentUserRole = rol;
    for (const t of TABS) {
      assert.equal(canAccessTab(t), TABS_ESPERADOS[rol][t], `${rol} × ${t}`);
    }
  });
}

test('canAccessTab — el terapeuta NO ve informes, facturación, terapeutas ni doctores', () => {
  state.currentUserRole = 'terapeuta';
  for (const t of ['informes','facturacion','terapeutas','doctores']) {
    assert.equal(canAccessTab(t), false, t);
  }
});

test('canAccessTab — la secretaria NO ve informes', () => {
  state.currentUserRole = 'secretaria';
  assert.equal(canAccessTab('informes'), false);
});

// SEG-01: editar una cita es agenda pura (recepción); el terapeuta solo cicla el estado.
test('editAppt — terapeuta no, secretaria sí', () => {
  state.currentUserRole = 'terapeuta';
  assert.equal(hasPermission('editAppt'), false);
  assert.equal(hasPermission('cycleStatus'), true);  // lo suyo sigue siendo el estado
  state.currentUserRole = 'secretaria';
  assert.equal(hasPermission('editAppt'), true);
});

// SEG-03: cerrar/abrir episodio es decisión clínica; la secretaria no la toma.
test('newEpisode — secretaria no, terapeuta sí', () => {
  state.currentUserRole = 'secretaria';
  assert.equal(hasPermission('newEpisode'), false);
  state.currentUserRole = 'terapeuta';
  assert.equal(hasPermission('newEpisode'), true);
});

// Un rol que no está en la matriz no hereda nada: sin acciones y sin tabs.
// (El default 'terapeuta' de hasPermission solo aplica cuando el rol viene vacío.)
test('rol desconocido — sin permisos ni tabs', () => {
  state.currentUserRole = 'contador';
  for (const a of ACCIONES) assert.equal(hasPermission(a), false, a);
  for (const t of TABS) assert.equal(canAccessTab(t), false, t);
});

test('rol undefined — cae al default terapeuta, nunca a admin', () => {
  state.currentUserRole = undefined;
  assert.equal(hasPermission('deletePatient'), false);
  assert.equal(hasPermission('createAppt'), false);
  assert.equal(hasPermission('editAppt'), false);
  assert.equal(hasPermission('emitirFactura'), false);
  assert.equal(canAccessTab('facturacion'), false);
  assert.equal(canAccessTab('informes'), false);
  assert.equal(canAccessTab('agenda'), true);
});
