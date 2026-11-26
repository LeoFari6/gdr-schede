// Testo formattato leggero, usato da privilegi e note:
//   **grassetto**   *corsivo*   ***entrambi***   righe "- " = elenco puntato
// Il testo resta semplice (si salva così com'è); qui lo si disegna senza innerHTML.
import { h } from './ui.js';

export function richText(text) {
  const italic = (s) => s.split(/(\*[^*\s][^*]*\*)/).map((p) => (/^\*[^*\s][^*]*\*$/.test(p) ? h('em', {}, p.slice(1, -1)) : p));
  const inline = (s) => s.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*)/).flatMap((p) => {
    if (/^\*\*\*[^*]+\*\*\*$/.test(p)) return [h('strong', {}, h('em', {}, p.slice(3, -3)))];
    if (/^\*\*[^*]+\*\*$/.test(p)) return [h('strong', {}, italic(p.slice(2, -2)))];
    return italic(p);
  });
  const out = [];
  let ul = null;
  for (const line of String(text ?? '').split('\n')) {
    const m = /^\s*[-•]\s+(.*)$/.exec(line) || /^\s*\*\s+(.*)$/.exec(line);
    if (m) {
      if (!ul) out.push((ul = h('ul', {})));
      ul.append(h('li', {}, inline(m[1])));
      continue;
    }
    ul = null;
    if (line.trim()) out.push(h('p', {}, inline(line)));
  }
  return out;
}

export const FORMAT_HINT = 'Formattazione: **grassetto**, *corsivo*, ***entrambi***; le righe che iniziano con "- " diventano un elenco.';

/** Adatta l'altezza della textarea al contenuto. */
export function autoGrow(ta, min = 4) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight + 2, min * 24)}px`; };
  ta.addEventListener('input', fit);
  ta.fit = fit;
  requestAnimationFrame(fit);
  return ta;
}
