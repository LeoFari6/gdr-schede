// Tabelle nei testi formattati, scritte come righe "| a | b |".
// Una riga "| --- | --- |" sotto la prima indica che quella è l'intestazione.

// limiti: oltre, righe e colonne in più non si aggiungono (e nel testo non si mostrano)
export const MAX_TABLE_ROWS = 15;
export const MAX_TABLE_COLS = 10;

export const TABLE_LINE = /^\s*\|.*\|\s*$/;
export const SEP_LINE = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;
export const splitRow = (line) => line.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Righe "| a | b |" → { header, rows } (header = la prima riga è l'intestazione). */
export function parseTable(lines) {
  const header = lines.length > 1 && SEP_LINE.test(lines[1]);
  const rows = lines.filter((l, i) => !(header && i === 1) && !SEP_LINE.test(l)).map(splitRow).slice(0, MAX_TABLE_ROWS);
  const cols = Math.min(MAX_TABLE_COLS, Math.max(1, ...rows.map((r) => r.length)));
  return { header, rows: rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? '')) };
}

/** { header, rows } → testo della tabella. */
export function tableToText({ header, rows }) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const cell = (c) => String(c ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
  const line = (r) => `| ${Array.from({ length: cols }, (_, i) => cell(r[i])).join(' | ')} |`;
  const out = rows.map(line);
  if (header && out.length) out.splice(1, 0, `|${' --- |'.repeat(cols)}`);
  return out.join('\n');
}

/** Sostituisce l'n-esima tabella del testo (testo vuoto = la toglie). */
export function replaceTable(text, n, next) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let k = -1;
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_LINE.test(lines[i]) && (i === 0 || !TABLE_LINE.test(lines[i - 1]))) {
      k++;
      if (k === n) {
        while (i + 1 < lines.length && TABLE_LINE.test(lines[i + 1])) i++;
        if (next) out.push(...next.split('\n'));
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}
