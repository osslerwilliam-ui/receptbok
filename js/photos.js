// Foton till testloggar: förminskas på telefonen, sparas i IndexedDB och visas som miniatyrer.

import * as db from './db.js';
import { uuid } from './store.js';
import { sheet, esc } from './ui.js';

const MAX_SIDE = 1600;
const QUALITY = 0.82;

/** Förminskar en bildfil till JPEG. Returnerar { blob, type, width, height }. */
export async function shrink(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Äldre webbläsare: via <img>
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = bmp.width, h0 = bmp.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY));
  return { blob, type: 'image/jpeg', width: w, height: h };
}

export function newPhotoRecord(testlogId, shrunk) {
  return { id: uuid(), testlogId, ...shrunk, createdAt: new Date().toISOString() };
}

/* ---------- Visning ---------- */

const urls = new Map(); // foto-id → objekt-URL

export async function photoUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const ph = await db.getPhoto(id);
  if (!ph) return null;
  const url = URL.createObjectURL(ph.blob);
  urls.set(id, url);
  return url;
}

/** Visar en tillfällig (ännu ej sparad) bild. */
export function tempUrl(id, blob) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
  return urls.get(id);
}

/** Fyller i alla <img data-photo="id"> under root. Foton som saknas (t.ex. backup utan foton) döljs. */
export function hydrate(root) {
  root.querySelectorAll('img[data-photo]:not([src])').forEach(async img => {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url;
    else img.closest('.thumb')?.remove();
  });
}

export function thumbsHtml(ids) {
  if (!ids?.length) return '';
  return `<div class="thumbs">${ids.map(id =>
    `<button type="button" class="thumb" data-open-photo="${esc(id)}" aria-label="Visa foto"><img data-photo="${esc(id)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>`;
}

/** Visar ett foto i stort format. */
export async function openPhoto(id) {
  const url = await photoUrl(id);
  if (!url) return;
  await sheet({
    body: `<img class="photo-full" src="${url}" alt="Foto från test">`,
    actions: [{ label: 'Stäng', value: null }],
  });
}

/** Lyssnar efter tryck på miniatyrer under root. */
export function wirePhotoClicks(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-open-photo]');
    if (!b) return;
    e.stopPropagation();
    openPhoto(b.dataset.openPhoto);
  }, true);
}

/* ---------- Backup ---------- */

export function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}
