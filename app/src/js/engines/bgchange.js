/* ===== Background Change Engine =====
   Ported from bg-change.html (full pipeline)
   Pure functions — no DOM dependencies */

/** Clamp value between min and max */
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** RGB color distance */
export function distRGB(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Parse color string to [r,g,b] or null
 * Supports: #RGB, #RRGGBB, rgb(r,g,b)
 */
export function parseColor(str) {
  const s = (str || '').trim();
  if (!s) return null;

  // #RGB / #RRGGBB
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    const hex = m[1];
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b];
    }
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  // rgb(r,g,b)
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(s);
  if (m) {
    const r = Math.max(0, Math.min(255, Number(m[1])));
    const g = Math.max(0, Math.min(255, Number(m[2])));
    const b = Math.max(0, Math.min(255, Number(m[3])));
    return [r, g, b];
  }

  return null;
}

/**
 * Auto-sample background color from image corners
 * @param {ImageData} imageData
 * @param {string} mode - 'auto'|'top-left'|'top-right'|'bottom-left'|'bottom-right'|'manual'
 * @param {[number,number,number]|null} manual - Manual RGB value (for 'manual' mode)
 * @returns {[number,number,number]} Background RGB
 */
export function sampleBgColor(imageData, mode, manual) {
  if (mode === 'manual' && manual && Array.isArray(manual)) return manual;

  const { data, width, height } = imageData;
  const size = 16;

  function rectStats(x0, y0, w, h) {
    const x1 = clamp(x0 + w, 0, width);
    const y1 = clamp(y0 + h, 0, height);
    let r = 0, g = 0, b = 0, c = 0;
    let r2 = 0, g2 = 0, b2 = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3];
        if (a === 0) continue;
        const rr = data[i], gg = data[i + 1], bb = data[i + 2];
        r += rr; g += gg; b += bb;
        r2 += rr * rr; g2 += gg * gg; b2 += bb * bb;
        c++;
      }
    }
    if (!c) return null;
    const mr = r / c, mg = g / c, mb = b / c;
    const vr = r2 / c - mr * mr;
    const vg = g2 / c - mg * mg;
    const vb = b2 / c - mb * mb;
    const v = (vr + vg + vb) / 3;
    return { mean: [Math.round(mr), Math.round(mg), Math.round(mb)], var: v, count: c };
  }

  const rects = [];
  if (mode === 'top-left') rects.push([0, 0, size, size]);
  else if (mode === 'top-right') rects.push([width - size, 0, size, size]);
  else if (mode === 'bottom-left') rects.push([0, height - size, size, size]);
  else if (mode === 'bottom-right') rects.push([width - size, height - size, size, size]);
  else {
    rects.push([0, 0, size, size]);
    rects.push([width - size, 0, size, size]);
    rects.push([0, height - size, size, size]);
    rects.push([width - size, height - size, size, size]);
  }

  const stats = rects.map(rc => rectStats(rc[0], rc[1], rc[2], rc[3])).filter(Boolean);
  if (!stats.length) return [255, 255, 255];

  const good = stats.filter(s => s.var < 1200);
  const use = good.length >= 2 ? good : stats;

  let sr = 0, sg = 0, sb = 0, sw = 0;
  use.forEach(s => {
    const w = 1 / (1 + s.var);
    sr += s.mean[0] * w;
    sg += s.mean[1] * w;
    sb += s.mean[2] * w;
    sw += w;
  });
  if (!sw) return use[0].mean;
  return [Math.round(sr / sw), Math.round(sg / sw), Math.round(sb / sw)];
}

/**
 * Compute crop rectangle for standard photo sizes
 */
function computeCropRect(sw, sh, tw, th, vshiftPct) {
  const targetRatio = tw / th;
  const srcRatio = sw / sh;
  let cw, ch;
  if (srcRatio > targetRatio) {
    ch = sh;
    cw = Math.round(sh * targetRatio);
  } else {
    cw = sw;
    ch = Math.round(sw / targetRatio);
  }

  const sx = Math.max(0, Math.floor((sw - cw) / 2));
  const baseSy = (sh - ch) / 2;
  const maxShift = (sh - ch) / 2;
  const shift = (clamp(Number(vshiftPct || 0), -30, 30) / 30) * maxShift;
  const sy = clamp(Math.floor(baseSy + shift), 0, sh - ch);

  return { sx, sy, sw: cw, sh: ch };
}

/**
 * Full background change pipeline
 * @param {File} file - Input image file
 * @param {object} opts
 * @param {[number,number,number]} opts.bgColor - Target background RGB
 * @param {string} opts.sampleMode - Sampling mode ('auto'|'manual'|corner names)
 * @param {[number,number,number]|null} opts.manualBgRGB - Manual color pick
 * @param {number} opts.tolerance - Color tolerance (0-100)
 * @param {number} opts.feather - Edge feathering (0-20)
 * @param {number} opts.shrink - Edge shrink (0-6)
 * @param {string} opts.size - 'orig'|'1inch'|'2inch'
 * @param {number} opts.vshift - Vertical shift (-30 to 30)
 * @param {string} opts.format - 'image/jpeg'|'image/png'|'image/webp'
 * @param {number} opts.quality - 60-95
 * @returns {Promise<{blob:Blob, dataUrl:string, filename:string, stats:object}>}
 */
export async function changeBackground(file, opts) {
  const {
    bgColor = [255, 255, 255],
    sampleMode = 'auto',
    manualBgRGB = null,
    tolerance = 10,
    feather = 2,
    shrink = 0,
    size = 'orig',
    vshift = 0,
    format = 'image/jpeg',
    quality = 90
  } = opts;

  const outRGB = bgColor;

  // Load source
  const bmp = await createImageBitmap(file);
  const srcW = bmp.width;
  const srcH = bmp.height;

  // Draw to canvas
  const cv = document.createElement('canvas');
  cv.width = srcW;
  cv.height = srcH;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);

  const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = imgData.data;

  // Sample background color
  const bgRGB = sampleBgColor(imgData, sampleMode, manualBgRGB);

  // Size spec
  const sizeSpecs = {
    'orig': { w: 0, h: 0 },
    '1inch': { w: 295, h: 413 },
    '2inch': { w: 413, h: 579 }
  };
  const sizeSpec = sizeSpecs[size] || sizeSpecs['orig'];
  const needResize = sizeSpec.key !== undefined && size !== 'orig';
  const actualSize = sizeSpecs[size] || sizeSpecs['orig'];

  const needResizeFinal = size !== 'orig';
  const crop = needResizeFinal
    ? computeCropRect(cv.width, cv.height, actualSize.w, actualSize.h, vshift)
    : null;

  // Output canvas
  const cv2 = document.createElement('canvas');
  const ctx2 = cv2.getContext('2d', { willReadFrequently: true });
  cv2.width = needResizeFinal ? actualSize.w : cv.width;
  cv2.height = needResizeFinal ? actualSize.h : cv.height;

  // Fill background
  ctx2.fillStyle = `rgb(${outRGB[0]},${outRGB[1]},${outRGB[2]})`;
  ctx2.fillRect(0, 0, cv2.width, cv2.height);

  // Crop region
  const tol = tolerance;
  const soft = Math.max(0, feather) * 12;
  const hi = tol + soft;

  const sx0 = crop ? crop.sx : 0;
  const sy0 = crop ? crop.sy : 0;
  const sww = crop ? crop.sw : cv.width;
  const shh = crop ? crop.sh : cv.height;

  const maskW = sww;
  const maskH = shh;
  const mask = new Uint8Array(maskW * maskH);
  let bgCount = 0;
  const totalPx = d.length / 4;

  // Generate alpha mask
  for (let y = 0; y < maskH; y++) {
    const sy = sy0 + y;
    for (let x = 0; x < maskW; x++) {
      const sx = sx0 + x;
      const si = (sy * cv.width + sx) * 4;
      const a = d[si + 3];
      if (a === 0) {
        bgCount++;
        mask[y * maskW + x] = 0;
        continue;
      }
      const r = d[si], g = d[si + 1], b = d[si + 2];
      const dd = distRGB([r, g, b], bgRGB);
      if (dd <= tol) {
        bgCount++;
        mask[y * maskW + x] = 0;
        continue;
      }
      let alpha = 1;
      if (soft > 0 && dd < hi) {
        let t = (dd - tol) / soft;
        t = clamp(t, 0, 1);
        alpha = t * t * (3 - 2 * t);
      }
      mask[y * maskW + x] = Math.round(alpha * 255);
    }
  }

  // Edge erosion
  const shrinkPx = clamp(Math.round(shrink || 0), 0, 6);
  if (shrinkPx > 0) {
    let cur = mask;
    let tmp = new Uint8Array(maskW * maskH);
    for (let it = 0; it < shrinkPx; it++) {
      for (let y = 0; y < maskH; y++) {
        for (let x = 0; x < maskW; x++) {
          const idx = y * maskW + x;
          let m = cur[idx];
          if (m === 0) { tmp[idx] = 0; continue; }
          let minv = 255;
          for (let yy = y - 1; yy <= y + 1; yy++) {
            if (yy < 0 || yy >= maskH) continue;
            for (let xx = x - 1; xx <= x + 1; xx++) {
              if (xx < 0 || xx >= maskW) continue;
              const v = cur[yy * maskW + xx];
              if (v < minv) minv = v;
              if (minv === 0) break;
            }
            if (minv === 0) break;
          }
          tmp[idx] = minv;
        }
      }
      cur = tmp;
      tmp = new Uint8Array(maskW * maskH);
    }
    mask.set(cur);
  }

  // Composite
  const srcC = document.createElement('canvas');
  srcC.width = maskW;
  srcC.height = maskH;
  const sctx = srcC.getContext('2d', { willReadFrequently: true });
  const sImg = sctx.createImageData(maskW, maskH);
  const sd = sImg.data;

  for (let y = 0; y < maskH; y++) {
    const sy = sy0 + y;
    for (let x = 0; x < maskW; x++) {
      const sx = sx0 + x;
      const si = (sy * cv.width + sx) * 4;
      const di = (y * maskW + x) * 4;
      const r = d[si], g = d[si + 1], b = d[si + 2], a = d[si + 3];
      const ma = mask[y * maskW + x] / 255;
      if (a === 0 || ma <= 0) {
        sd[di] = outRGB[0];
        sd[di + 1] = outRGB[1];
        sd[di + 2] = outRGB[2];
        sd[di + 3] = 255;
        continue;
      }
      sd[di]     = Math.round(r * ma + outRGB[0] * (1 - ma));
      sd[di + 1] = Math.round(g * ma + outRGB[1] * (1 - ma));
      sd[di + 2] = Math.round(b * ma + outRGB[2] * (1 - ma));
      sd[di + 3] = 255;
    }
  }

  sctx.putImageData(sImg, 0, 0);
  ctx2.imageSmoothingEnabled = true;
  try { ctx2.imageSmoothingQuality = 'high'; } catch (_) { }

  if (needResizeFinal) {
    ctx2.drawImage(srcC, 0, 0, maskW, maskH, 0, 0, cv2.width, cv2.height);
  } else {
    ctx2.drawImage(srcC, 0, 0);
  }

  // Export
  const mime = format || 'image/jpeg';
  const q = clamp((quality || 90) / 100, 0.6, 0.95);
  const ext = (mime === 'image/jpeg') ? 'jpg' : (mime === 'image/webp' ? 'webp' : 'png');

  const blob = await new Promise(resolve => {
    if (mime === 'image/png') return cv2.toBlob(resolve, mime);
    return cv2.toBlob(resolve, mime, q);
  });
  if (!blob) throw new Error('Background change failed (toBlob returned null)');

  const bgRatio = totalPx ? (bgCount / totalPx) : 0;
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '');

  return {
    blob,
    dataUrl: cv2.toDataURL(mime, q),
    filename: base + `_bg.${ext}`,
    stats: {
      bgRGB, outRGB,
      tolerance: tol,
      feather,
      bgRatio,
      size: sizeSpec
    }
  };
}
