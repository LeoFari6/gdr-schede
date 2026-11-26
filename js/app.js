import { store } from './store.js';
import { toast } from './ui.js';
import { applyTheme, applyAccent } from './theme.js';
import { renderHome } from './views/home.js';
import { renderCharacter } from './views/sheet.js';
import { renderEditor } from './views/editor.js';

const root = document.getElementById('app');
applyTheme();
store.onEvent((e) => {
  if (e.type === 'error') toast(e.error, 'error', 6000);
  if (e.type === 'external' && !document.activeElement?.matches('input, textarea, select')) route();
});

function route() {
  store.flush();
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  root.replaceChildren();
  document.querySelectorAll('dialog, .suggest, .death').forEach((d) => d.remove());
  document.title = 'Schede GdR';
  applyAccent(document.documentElement, null);
  window.scrollTo(0, 0);
  if (parts[0] === 'c' && parts[1]) renderCharacter(root, decodeURIComponent(parts[1]));
  else if (parts[0] === 't' && parts[1]) renderEditor(root, decodeURIComponent(parts[1]));
  else renderHome(root);
}

// Niente zoom con due dita su telefono: Safari su iPhone ignora user-scalable=no,
// quindi blocchiamo anche i suoi gesti di zoom. Lo scorrimento con un dito resta libero.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

addEventListener('hashchange', route);
route();

// Service worker: uso offline e installazione come app (non attivo su file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* facoltativo */ });
}
