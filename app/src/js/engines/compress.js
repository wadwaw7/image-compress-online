/* ===== Image Compression Engine =====
   Ported from app.js (local compression pipeline)
   Pure functions — no DOM dependencies */

/**
 * Get file extension from a File object
 */
export function extFromMimeOrName(file) {
  const name = (file && file.name) ? file.name : '';
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  if (m) return m[1].toLowerCase();
  const type = (file && file.type) ? file.type.toLowerCase() : '';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpeg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'img';
}

/**
 * Load a File as an ImageBitmap (or HTMLImageElement fallback)
 */
export async function fileToImageBitmap(file) {
  if (window.createImageBitmap) {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; });
  URL.revokeObjectURL(url);
  return img;
}

/**
 * Lightweight file hash (SHA-256 first 8 bytes → hex)
 */
export async function md5Hex(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compress an image file locally using Canvas API
 * @param {File} file - Input image file
 * @param {string} outFmt - Output format: 'jpeg'|'jpg'|'png'|'webp'
 * @param {number} quality - 1-100 quality
 * @param {object} opts - { maxW, maxH, alpha:'white'|'black'|'keep' }
 * @returns {Promise<File>} Compressed output as a File object
 */
export async function compressLocal(file, outFmt, quality, opts) {
  const q = Math.max(1, Math.min(100, Number(quality) || 80)) / 100;
  const fmt = String(outFmt || 'webp').toLowerCase();
  const o = opts || { maxW: 0, maxH: 0, alpha: 'white' };

  const bitmapOrImg = await fileToImageBitmap(file);
  const srcW = bitmapOrImg.width;
  const srcH = bitmapOrImg.height;

  // Proportional resize
  let dstW = srcW, dstH = srcH;
  const maxW = Math.max(0, Number(o.maxW) || 0);
  const maxH = Math.max(0, Number(o.maxH) || 0);
  const ratioW = maxW > 0 ? (maxW / srcW) : 1;
  const ratioH = maxH > 0 ? (maxH / srcH) : 1;
  const ratio = Math.min(1, ratioW, ratioH);
  dstW = Math.max(1, Math.round(srcW * ratio));
  dstH = Math.max(1, Math.round(srcH * ratio));

  // Alpha handling: JPEG output needs flat background
  let out = fmt;
  const wantJpeg = (fmt === 'jpeg' || fmt === 'jpg');
  if (wantJpeg && o.alpha === 'keep') {
    out = 'webp';
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');

  // Fill background for JPEG output
  if (out === 'jpeg' || out === 'jpg') {
    ctx.fillStyle = (o.alpha === 'black') ? '#000' : '#fff';
    ctx.fillRect(0, 0, dstW, dstH);
  }
  ctx.drawImage(bitmapOrImg, 0, 0, dstW, dstH);

  let mime = 'image/webp';
  if (out === 'jpeg' || out === 'jpg') mime = 'image/jpeg';
  else if (out === 'png') mime = 'image/png';

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, q);
  });
  if (!blob) throw new Error('Compression failed (toBlob returned null)');

  const outExt = (out === 'jpg') ? 'jpeg' : out;
  const outName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + outExt;
  const outFile = new File([blob], outName, { type: mime });
  return outFile;
}

/**
 * Run a pool of async workers with N-way concurrency
 */
export async function runPool(items, limit, worker) {
  const queue = items.slice();
  const results = [];
  const runners = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (queue.length) {
      const it = queue.shift();
      try { results.push(await worker(it)); } catch (e) { results.push(null); }
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Format bytes to human-readable string
 */
export function formatSize(n) {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}
