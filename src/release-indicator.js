import { releases } from './releases.js';
const key = 'wgit.logs.lastRead';
const latest = () => releases[0]?.id || '';
let memoryRead = null;
function read() {
  try { if (localStorage.getItem(key) === latest()) return latest(); } catch {}
  try { if (sessionStorage.getItem(key) === latest()) return latest(); } catch {}
  return memoryRead;
}
export function markLogsRead() { memoryRead = latest(); try { localStorage.setItem(key, latest()); } catch { try { sessionStorage.setItem(key, latest()); } catch {} } }
export function setupReleaseIndicator(active = false) {
  const link = document.querySelector('.tab[href="/logs"]');
  if (!link) return;
  if (active) markLogsRead();
  function render() {
    const unread = !!latest() && read() !== latest();
    link.querySelector('.logs-unread-dot')?.remove();
    if (unread) { const dot=document.createElement('span'); dot.className='logs-unread-dot'; dot.setAttribute('aria-hidden','true'); link.append(dot); }
    if (unread) { link.title='New updates available'; link.setAttribute('aria-description','New updates available'); }
    else { link.removeAttribute('title'); link.removeAttribute('aria-description'); }
  }
  link.addEventListener('click', () => { markLogsRead(); render(); });
  window.addEventListener('storage', e => { if (e.key === key || e.key === null) render(); });
  render();
}
