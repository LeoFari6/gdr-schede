import { store } from './store.js';
import { toast } from './ui.js';
import { applyTheme, applyAccent } from './theme.js';
import { renderHome } from './views/home.js';
import { renderCharacter } from './views/sheet.js';
import { t, lang } from './i18n.js';

document.documentElement.lang = lang;

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
  document.querySelectorAll('dialog, .suggest, .viewer, .emoji-pop').forEach((d) => d.remove());
  document.dispatchEvent(new CustomEvent('gdr-audio-play', { detail: null })); // cambiando pagina si ferma l'audio
  document.title = t('Schede GdR');
  applyAccent(document.documentElement, null);
  window.scrollTo(0, 0);
  if (parts[0] === 'c' && parts[1]) renderCharacter(root, decodeURIComponent(parts[1]));
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
