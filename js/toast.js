import { esc } from './utils.js';

export function showToast(msg, type, duration) {
  type = type || 'success'; duration = duration || 3500;
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = {success:'✓', error:'✕', info:'ℹ'};
  t.innerHTML = '<span class="toast-icon">' + (icons[type]||'ℹ') + '</span><span class="toast-msg">' + esc(msg) + '</span>';
  c.appendChild(t);
  setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(function(){t.remove();},300);}, duration);
}
export function toastOk(msg){showToast(msg,'success',3500);}
export function toastErr(msg){showToast(msg,'error',5000);}
export function toastInfo(msg){showToast(msg,'info',3000);}
