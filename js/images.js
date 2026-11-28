// Immagini inserite nei testi (appunti, storia, diario, privilegi).
// Nel testo un'immagine è una riga "![didascalia](img:ID)"; il file vero sta
// nell'IndexedDB del browser, molto più capiente dello spazio delle schede.

// Una larghezza facoltativa in percentuale: "![didascalia](img:ID 50%)".
import { t } from './i18n.js';

export const IMG_LINE = /^\s*!\[([^\]]*)\]\(img:([\w-]+)(?:\s+(\d{1,3})%)?\)\s*$/;
const IMG_ANY = /!\[[^\]]*\]\(img:([\w-]+)(?:\s+\d{1,3}%)?\)/g;
export const IMG_MIN = 15;

/** Cambia la larghezza (in %, oppure null = automatica) dell'immagine `id` dentro un testo. */
export function setImageSize(text, id, pct) {
  return String(text ?? '').split('\n').map((line) => {
    const m = IMG_LINE.exec(line);
    if (!m || m[2] !== id) return line;
    const size = pct == null ? '' : ` ${Math.max(IMG_MIN, Math.min(100, Math.round(pct)))}%`;
    return `![${m[1]}](img:${id}${size})`;
  }).join('\n');
}

/** Tutti gli ID di immagine citati nei testi di un oggetto (es. i valori di un personaggio). */
export function imageIdsIn(value, out = new Set()) {
  if (typeof value === 'string') for (const m of value.matchAll(IMG_ANY)) out.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => imageIdsIn(v, out));
  else if (value && typeof value === 'object') {
    if (typeof value.audioId === 'string' && /^[\w-]+$/.test(value.audioId)) out.add(value.audioId); // file audio delle note
    Object.values(value).forEach((v) => imageIdsIn(v, out));
  }
  return out;
}

export const newImageId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---- archivio (IndexedDB) ---------------------------------------------------
const DB = 'gdr-schede-immagini';
const STORE = 'immagini';
let dbPromise;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(t('salvataggio dell\'immagine non riuscito')));
  });
}
export const putImage = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const getImage = (id) => run('readonly', (s) => s.get(id));
export const deleteImage = (id) => run('readwrite', (s) => s.delete(id));

// indirizzi già pronti (per mostrare subito le immagini già caricate, anche in stampa)
const urls = new Map();
export const cachedImageUrl = (id) => urls.get(id) || '';
export async function imageUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await getImage(id);
  if (!blob) throw new Error(t('immagine non trovata su questo dispositivo'));
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

/** Riduce l'immagine (lato lungo al massimo `max` px) e la converte in JPEG. */
export function compressImage(file, max = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff'; // le parti trasparenti diventano bianche (il JPEG non ha trasparenza)
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('immagine non leggibile')))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error(t('file non riconosciuto come immagine'))); };
    img.src = src;
  });
}

/** Salva un file scelto dall'utente e restituisce la riga da inserire nel testo. */
export async function addImageFromFile(file) {
  const blob = await compressImage(file);
  const id = newImageId();
  await putImage(id, blob);
  return `![](img:${id})`;
}

// ---- esportazione / importazione -------------------------------------------
const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Aggiunge a un file esportato le immagini citate nei suoi testi. */
export async function withImages(data) {
  const ids = imageIdsIn(data.character || data.characters || data);
  if (!ids.size) return data;
  const images = {};
  for (const id of ids) {
    try { const b = await getImage(id); if (b) images[id] = await toDataUrl(b); } catch { /* immagine mancante: si salta */ }
  }
  return Object.keys(images).length ? { ...data, images } : data;
}

/** Salva le immagini contenute in un file importato. */
export async function importImages(images) {
  let n = 0;
  for (const [id, dataUrl] of Object.entries(images || {})) {
    if (!/^[\w-]+$/.test(id) || typeof dataUrl !== 'string' || !/^data:(image|audio)\//.test(dataUrl)) continue; // immagini e audio delle note
    const blob = await (await fetch(dataUrl)).blob();
    await putImage(id, blob);
    n++;
  }
  return n;
}
