// Taglio degli audio delle note: non modifica il file, salva solo inizio e fine (secondi).
import { h, icon, modal } from './ui.js';
import { t } from './i18n.js';

export const MIN_TRIM = 0.5; // durata minima della parte scelta, in secondi

/** Parte da suonare per la voce `it` ({ da?, a? }) con durata totale `dur`: { start, end, len, cut }. */
export function trimRange(it, dur) {
  const total = Number.isFinite(dur) && dur > 0 ? dur : Infinity;
  let start = Math.max(0, Number(it?.da) || 0);
  let end = Number(it?.a);
  if (!Number.isFinite(end) || end <= 0 || end > total) end = total;
  if (Number.isFinite(total) && start > total - MIN_TRIM) start = Math.max(0, total - MIN_TRIM);
  if (end - start < MIN_TRIM) end = Math.min(total, start + MIN_TRIM);
  return { start, end, len: end - start, cut: start > 0 || end < total };
}

/** Valori da salvare dopo il taglio: undefined se coincide con l'audio intero. */
export function trimToStore(start, end, dur) {
  const r = (n) => Math.round(n * 10) / 10;
  const da = start > 0.05 ? r(start) : undefined;
  const a = end < dur - 0.05 ? r(end) : undefined;
  return { da, a };
}

/** Tempo leggibile: m:ss, oppure m:ss.d se `tenths`. */
export function fmtTime(s, tenths = false) {
  if (!Number.isFinite(s)) return '–:––';
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  const sec = tenths ? (v % 60).toFixed(1).padStart(4, '0') : String(Math.floor(v % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

// picchi della forma d'onda (null se il browser non sa decodificare il file)
async function peaks(blob, n) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ac = new Ctx();
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    ac.close?.();
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / n));
    const out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let mx = 0;
      for (let j = i * step, e = Math.min(data.length, j + step); j < e; j += 4) { const v = Math.abs(data[j]); if (v > mx) mx = v; }
      out[i] = mx;
    }
    const top = Math.max(...out) || 1;
    return { list: out.map((v) => v / top), dur: buf.duration };
  } catch { return null; }
}

/**
 * Finestra di taglio. `blob` = file audio, `it` = voce ({ nome, da?, a? }).
 * Restituisce { da, a } da salvare (undefined = estremo originale), oppure null se annulli.
 */
export async function trimAudio(blob, it) {
  const url = URL.createObjectURL(blob);
  const player = new Audio(url);
  player.preload = 'auto';
  const dur = await new Promise((res) => {
    if (Number.isFinite(player.duration) && player.duration > 0) return res(player.duration);
    player.addEventListener('loadedmetadata', () => res(player.duration), { once: true });
    player.addEventListener('error', () => res(NaN), { once: true });
  });
  if (!Number.isFinite(dur) || dur <= 0) { URL.revokeObjectURL(url); throw new Error(t('Questo audio non si può riprodurre')); }
  document.dispatchEvent(new CustomEvent('gdr-audio-play', { detail: player })); // ferma gli altri audio

  let { start, end } = trimRange(it, dur);
  const BARS = 120;
  const canvas = h('canvas', { class: 'trim-wave', width: 960, height: 160 });
  const sel = h('div', { class: 'trim-sel' });
  const head = h('div', { class: 'trim-head', title: t('Trascina per scegliere da dove ascoltare') });
  const hStart = h('div', { class: 'trim-handle', 'aria-hidden': 'true' });
  const hEnd = h('div', { class: 'trim-handle', 'aria-hidden': 'true' });
  const area = h('div', { class: 'trim-area' }, canvas, sel, hStart, hEnd, head);
  const range = (v) => h('input', { type: 'range', class: 'trim-range', min: 0, max: Math.round(dur * 10), step: 1, value: Math.round(v * 10) });
  const inStart = range(start);
  const inEnd = range(end);
  const outStart = h('b', {});
  const outEnd = h('b', {});
  const outLen = h('span', { class: 'trim-len' });
  const playBtn = h('button', { type: 'button', class: 'btn small' });
  const allBtn = h('button', { type: 'button', class: 'btn ghost small' }, t('Tutto l\'audio'));
  let wave = null;

  const draw = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(area);
    const W = canvas.width, H = canvas.height, bw = W / BARS;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < BARS; i++) {
      const v = wave ? Math.max(0.04, wave[i]) : 0.35;
      const x = i * bw, tm = ((i + 0.5) / BARS) * dur;
      ctx.fillStyle = tm >= start && tm <= end ? css.getPropertyValue('--accent').trim() || '#c33' : css.getPropertyValue('--ink-3').trim() || '#999';
      ctx.globalAlpha = tm >= start && tm <= end ? 1 : 0.45;
      const bh = v * (H - 8);
      ctx.fillRect(x + bw * 0.18, (H - bh) / 2, bw * 0.64, bh);
    }
    ctx.globalAlpha = 1;
  };
  const update = () => {
    const pct = (s) => `${(s / dur) * 100}%`;
    sel.style.left = pct(start); sel.style.width = pct(end - start);
    hStart.style.left = pct(start); hEnd.style.left = pct(end);
    inStart.value = String(Math.round(start * 10)); inEnd.value = String(Math.round(end * 10));
    outStart.textContent = fmtTime(start, true); outEnd.textContent = fmtTime(end, true);
    outLen.textContent = t('Durata: {d}', { d: fmtTime(end - start, true) }) + (end - start < dur - 0.05 ? ` · ${t('su {d}', { d: fmtTime(dur) })}` : '');
    allBtn.disabled = start <= 0.05 && end >= dur - 0.05;
    clampCue();
    draw();
  };
  // punto di partenza dell'ascolto (barra bianca): segue l'inizio finché non lo sposti tu
  let cue = start;
  let cueSet = false;
  const clampCue = () => {
    cue = cueSet ? Math.max(start, Math.min(cue, end - 0.1)) : start;
    if (player.paused) head.style.left = `${(cue / dur) * 100}%`;
  };
  const setCue = (s) => {
    cueSet = true;
    cue = s;
    clampCue();
    if (!player.paused) player.currentTime = cue;
    head.style.left = `${(cue / dur) * 100}%`;
  };
  const setStart = (s) => { start = Math.max(0, Math.min(s, end - MIN_TRIM)); if (!player.paused && player.currentTime < start) player.currentTime = start; update(); };
  const setEnd = (s) => { end = Math.min(dur, Math.max(s, start + MIN_TRIM)); update(); };
  inStart.addEventListener('input', () => setStart(Number(inStart.value) / 10));
  inEnd.addEventListener('input', () => setEnd(Number(inEnd.value) / 10));
  allBtn.addEventListener('click', () => { start = 0; end = dur; cueSet = false; update(); });

  // trascinando sulla forma d'onda: vicino alla barra bianca si sposta il punto d'ascolto,
  // altrimenti l'estremo (inizio o fine) più vicino
  let drag = null;
  const timeAt = (e) => { const r = area.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
  // la barra bianca si prende dal pallino in alto, oppure ovunque se non è sopra una maniglia
  const onHead = (e) => {
    const r = area.getBoundingClientRect();
    const px = (s) => r.left + (s / dur) * r.width;
    const hr = head.getBoundingClientRect();
    if (Math.abs(e.clientX - (hr.left + hr.width / 2)) > 14) return false;
    const nearHandle = Math.min(Math.abs(e.clientX - px(start)), Math.abs(e.clientX - px(end))) <= 14;
    return e.clientY - r.top <= 28 || !nearHandle;
  };
  const move = { start: (s) => setStart(s), end: (s) => setEnd(s), cue: (s) => setCue(s) };
  area.addEventListener('pointerdown', (e) => {
    const tm = timeAt(e);
    drag = onHead(e) ? 'cue' : Math.abs(tm - start) <= Math.abs(tm - end) ? 'start' : 'end';
    try { area.setPointerCapture(e.pointerId); } catch { /* evento sintetico */ }
    area.classList.toggle('trim-dragcue', drag === 'cue');
    move[drag](tm);
  });
  area.addEventListener('pointermove', (e) => {
    if (drag) move[drag](timeAt(e));
    else area.classList.toggle('trim-overcue', onHead(e));
  });
  const stopDrag = () => { drag = null; area.classList.remove('trim-dragcue'); };
  area.addEventListener('pointerup', stopDrag);
  area.addEventListener('pointercancel', stopDrag);

  // ascolto della parte scelta
  let raf = 0;
  const syncPlay = () => {
    const playing = !player.paused;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), h('span', {}, playing ? t('Pausa') : t('Ascolta la parte scelta')));
    area.classList.toggle('trim-playing', playing);
  };
  // in pausa (o alla fine della parte) si torna sempre al punto d'ascolto scelto
  const stop = () => { player.pause(); player.currentTime = cue; head.style.left = `${(cue / dur) * 100}%`; };
  const tick = () => {
    if (player.currentTime >= end) { stop(); return; }
    head.style.left = `${(player.currentTime / dur) * 100}%`;
    if (!player.paused) raf = requestAnimationFrame(tick);
  };
  playBtn.addEventListener('click', () => {
    if (player.paused) {
      player.currentTime = cue;
      player.play().then(() => { raf = requestAnimationFrame(tick); }).catch(() => {});
    } else stop();
  });
  player.addEventListener('play', syncPlay);
  player.addEventListener('pause', () => { cancelAnimationFrame(raf); syncPlay(); });
  syncPlay();

  const body = h('div', { class: 'trim' },
    h('p', { class: 'muted small' }, t('Scegli dove inizia e dove finisce. La barra bianca indica da dove parte l\'ascolto: trascinala per sentire un punto preciso. Il file originale resta intatto.')),
    area,
    h('div', { class: 'trim-fields' },
      h('label', { class: 'trim-field' }, h('span', { class: 'lbl' }, t('Inizio')), outStart, inStart),
      h('label', { class: 'trim-field' }, h('span', { class: 'lbl' }, t('Fine')), outEnd, inEnd)),
    h('div', { class: 'trim-bar' }, playBtn, outLen, allBtn));
  update();
  peaks(blob, BARS).then((p) => { if (p) { wave = p.list; draw(); } else area.classList.add('trim-nowave'); });

  const res = await modal({
    title: t('Taglia «{nome}»', { nome: it?.nome || t('Senza nome') }),
    body,
    wide: true,
    actions: [{ label: t('Annulla'), value: null }, { label: t('Salva'), value: () => trimToStore(start, end, dur), cls: 'primary' }],
  });
  player.pause();
  cancelAnimationFrame(raf);
  URL.revokeObjectURL(url);
  return res;
}
