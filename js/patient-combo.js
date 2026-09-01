// ── Combobox de paciente (buscar + elegir en un solo control) — FÁBRICA ──
// Copia fiel del comportamiento del combo del informe (informes.js:412-490): lista ordenada por
// nombre, tope de 50, navegación con ↑/↓/Enter/Esc, cierre al hacer click afuera y selección por
// 'mousedown' (no 'click') para ganarle al blur del input, que si no cierra la lista antes de que
// el click llegue.
//
// Lo que cambia es que ACÁ no hay ids fijos ni estado de módulo: cada combo recibe los ids de sus
// tres elementos (que ya existen en el HTML) y se lleva su propio estado en el closure. Por eso se
// puede tener el del informe y el del historial abiertos en la misma página sin pisarse.
// informes.js NO se toca en este lote (acaba de pasar auditoría); migrarlo a esta fábrica queda
// como deuda anotada.
import { state } from './state.js';
import { esc, getTherapist } from './utils.js';

// inputId    = <input type="text"> visible (el que se escribe)
// resultsId  = <div> del desplegable
// hiddenId   = <input type="hidden"> cuyo .value ES el id del paciente elegido (el contrato)
// onSelect   = se llama SOLO cuando lo elige una persona; setValue() no lo dispara (evita bucles
//              cuando el render sincroniza el control con el estado).
// Devuelve { setValue, getValue, refresh } — o un API inerte si el HTML todavía no está.
export function crearComboPaciente({ inputId, resultsId, hiddenId, onSelect, getPatients = () => state.patients }) {
  const inp = document.getElementById(inputId);
  const res = document.getElementById(resultsId);
  const hidden = document.getElementById(hiddenId);
  const inerte = { setValue() {}, getValue() { return ''; }, refresh() {} };
  if (!inp || !res || !hidden) return inerte;
  // Idempotente: setup() puede correr más de una vez (realtime, re-render) y no debe apilar
  // listeners sobre los mismos elementos.
  if (inp.dataset.comboReady) return inp._combo || inerte;
  inp.dataset.comboReady = '1';

  let listados = [];   // pacientes visibles ahora (para ↑/↓/Enter)
  let hi = -1;         // índice resaltado

  const sincronizarTexto = () => {
    const p = (getPatients() || []).find(x => String(x.id) === String(hidden.value));
    inp.value = p ? p.name : '';
  };

  const cerrar = () => { res.style.display = 'none'; hi = -1; };

  const pintarHi = () => {
    res.querySelectorAll('[data-i]').forEach(el => {
      const on = parseInt(el.getAttribute('data-i'), 10) === hi;
      el.style.background = on ? '#f5f5f0' : '';
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  };

  const elegir = (id) => {
    hidden.value = String(id);
    sincronizarTexto();
    cerrar();
    if (onSelect) onSelect(String(id));
  };

  const filtrar = () => {
    const q = (inp.value || '').toLowerCase().trim();
    const todos = getPatients() || [];
    let list = q
      ? todos.filter(p => (p.name || '').toLowerCase().includes(q) || (p.diag || '').toLowerCase().includes(q))
      : todos;
    // Tope de 50: el desplegable es para elegir, no para listar los ~190 pacientes.
    list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 50);
    listados = list; hi = -1;
    res.style.display = 'block';
    if (!list.length) {
      res.innerHTML = '<div style="padding:12px;font-size:12px;color:#9c9a92;text-align:center">Sin resultados</div>';
      return;
    }
    res.innerHTML = list.map((p, i) => {
      const th = getTherapist(p.therapistId);
      return `<div data-i="${i}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center">
        <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#1a1917;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
        <div style="font-size:10px;color:#9c9a92">${esc(p.diag || 'Sin diagnóstico')}${th ? ' · ' + esc(th.name) : ''}</div></div>
      </div>`;
    }).join('');
  };

  // 'mousedown' y no 'click': el blur del input cierra la lista y con 'click' la fila ya no existe
  // cuando el evento llega. Es la misma razón del onmousedown inline de informes.js.
  res.addEventListener('mousedown', e => {
    const fila = e.target.closest('[data-i]');
    if (!fila) return;
    e.preventDefault();
    const p = listados[parseInt(fila.getAttribute('data-i'), 10)];
    if (p) elegir(p.id);
  });

  inp.addEventListener('input', filtrar);
  inp.addEventListener('focus', () => { inp.select(); filtrar(); });
  inp.addEventListener('keydown', e => {
    const abierta = res.style.display !== 'none';
    if (e.key === 'ArrowDown') {
      if (!abierta) { filtrar(); return; }
      hi = Math.min(hi + 1, listados.length - 1); pintarHi(); e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      hi = Math.max(hi - 1, 0); pintarHi(); e.preventDefault();
    } else if (e.key === 'Enter') {
      if (abierta && listados[hi]) { elegir(String(listados[hi].id)); e.preventDefault(); }
    } else if (e.key === 'Escape') {
      cerrar();
    }
  });

  // Cerrar al hacer click fuera del combo. El contenedor es el .hdr-search que envuelve a los tres
  // elementos; si el HTML cambiara de forma, cae al padre directo del input.
  const caja = inp.closest('.hdr-search') || inp.parentElement;
  document.addEventListener('click', e => { if (!caja.contains(e.target)) cerrar(); });

  const api = {
    setValue(id) { hidden.value = id != null ? String(id) : ''; sincronizarTexto(); cerrar(); },
    getValue() { return hidden.value || ''; },
    refresh() { sincronizarTexto(); },
  };
  inp._combo = api;   // para que un segundo crearComboPaciente() devuelva el mismo API
  return api;
}
