/* ===== Watermark Removal Engine =====
   Ported from watermark-remover.html (inpaint diffusion algorithm)
   Pure functions — no DOM dependencies */

/**
 * Clamp a value between min and max
 */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/**
 * Diffusion-based inpainting
 * Fills the masked region by sampling from surrounding non-masked pixels
 * @param {ImageData} imageData - Source image data
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {Uint8Array} mask - Mask array (1 = fill, 0 = keep), size w*h
 * @param {number} iterations - Number of diffusion passes (10-80, recommended 25-45)
 * @returns {ImageData} The inpainted image data
 */
export function inpaintDiffuse(imageData, w, h, mask, iterations) {
  const src = imageData.data;
  const buf = new Uint8ClampedArray(src);
  const tmp = new Uint8ClampedArray(src.length);

  tmp.set(buf);

  function idx(x, y) { return (y * w + x) * 4; }

  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = mask[y * w + x];
        if (!m) continue;

        let r = 0, g = 0, b = 0, c = 0;
        for (let yy = y - 2; yy <= y + 2; yy++) {
          if (yy < 0 || yy >= h) continue;
          for (let xx = x - 2; xx <= x + 2; xx++) {
            if (xx < 0 || xx >= w) continue;
            if (mask[yy * w + xx]) continue;
            const ii = idx(xx, yy);
            r += buf[ii]; g += buf[ii + 1]; b += buf[ii + 2];
            c++;
          }
        }
        if (c === 0) continue;
        const di = idx(x, y);
        tmp[di]     = Math.round(r / c);
        tmp[di + 1] = Math.round(g / c);
        tmp[di + 2] = Math.round(b / c);
        tmp[di + 3] = 255;
      }
    }
    buf.set(tmp);
  }

  imageData.data.set(buf);
  return imageData;
}

/**
 * Create a binary mask from a rectangle selection
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {{x:number,y:number,w:number,h:number}} rect - Selection rectangle
 * @returns {Uint8Array} Mask where 1 = fill area, 0 = keep
 */
export function createMaskFromRect(width, height, rect) {
  const mask = new Uint8Array(width * height);
  const x0 = clamp(rect.x, 0, width - 1);
  const y0 = clamp(rect.y, 0, height - 1);
  const x1 = clamp(rect.x + rect.w, 0, width);
  const y1 = clamp(rect.y + rect.h, 0, height);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      mask[y * width + x] = 1;
    }
  }
  return mask;
}

/**
 * Remove watermark from an image file
 * @param {File} file - Input image file
 * @param {{x:number,y:number,w:number,h:number}} rect - Watermark region
 * @param {number} iterations - Diffusion iterations
 * @returns {Promise<{blob:Blob, dataUrl:string, filename:string}>}
 */
export async function removeWatermark(file, rect, iterations) {
  const bmp = await createImageBitmap(file);
  const w = bmp.width;
  const h = bmp.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const mask = createMaskFromRect(w, h, rect);

  const iter = clamp(iterations, 10, 80);
  inpaintDiffuse(imageData, w, h, mask, iter);

  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Watermark removal failed (toBlob returned null)');

  const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
  return {
    blob,
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    filename: base + '_clean.jpg'
  };
}
