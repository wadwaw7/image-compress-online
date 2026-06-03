/* ===== Watermark Page Controller ===== */
import store from '../store.js';
import { inpaintDiffuse, createMaskFromRect } from '../engines/watermark.js';
import { showToast } from '../ui/toast.js';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function initWatermarkPage() {
  const els = {
    btnBrowse: document.getElementById('wm-btn-browse'),
    btnApply: document.getElementById('wm-btn-apply'),
    btnDownload: document.getElementById('wm-btn-download'),
    btnClear: document.getElementById('wm-btn-clear'),
    btnClearSel: document.getElementById('wm-btn-clearsel'),
    fileInput: document.getElementById('wm-file-input'),
    cvSrc: document.getElementById('wm-cv-src'),
    cvOut: document.getElementById('wm-cv-out'),
    overlay: document.getElementById('wm-overlay'),
    iterations: document.getElementById('wm-iterations'),
    iterVal: document.getElementById('wm-iter-val'),
    msg: document.getElementById('wm-msg'),
  };

  const state = {
    file: null,
    srcBitmap: null,
    outBlob: null,
    outFilename: '',
    sel: null,
    dragging: false,
    dragStart: null,
    rectEl: null,
  };

  function setMsg(text, err) {
    els.msg.innerHTML = err
      ? `<span style="color:var(--neon-red)">⚠ ${text}</span>`
      : `<span class="text-cyan">▸</span> ${text}`;
  }

  function clearSelection() {
    state.sel = null;
    if (state.rectEl) { state.rectEl.remove(); state.rectEl = null; }
    els.btnClearSel.disabled = true;
    els.btnApply.disabled = true;
    setMsg('Selection cleared. Drag on the original to re-select.');
  }

  function updateRectOverlay() {
    if (!state.sel) {
      if (state.rectEl) { state.rectEl.remove(); state.rectEl = null; }
      return;
    }
    const rect = els.cvSrc.getBoundingClientRect();
    const scaleX = rect.width / els.cvSrc.width;
    const scaleY = rect.height / els.cvSrc.height;
    if (!state.rectEl) {
      const div = document.createElement('div');
      div.className = 'sel-rect';
      els.overlay.appendChild(div);
      state.rectEl = div;
    }
    state.rectEl.style.left = (state.sel.x * scaleX) + 'px';
    state.rectEl.style.top = (state.sel.y * scaleY) + 'px';
    state.rectEl.style.width = (state.sel.w * scaleX) + 'px';
    state.rectEl.style.height = (state.sel.h * scaleY) + 'px';
  }

  function setSelectionFromClientRect(x0, y0, x1, y1) {
    const rect = els.cvSrc.getBoundingClientRect();
    const scaleX = els.cvSrc.width / rect.width;
    const scaleY = els.cvSrc.height / rect.height;
    const sx0 = clamp(Math.floor((Math.min(x0, x1) - rect.left) * scaleX), 0, els.cvSrc.width - 1);
    const sy0 = clamp(Math.floor((Math.min(y0, y1) - rect.top) * scaleY), 0, els.cvSrc.height - 1);
    const sx1 = clamp(Math.floor((Math.max(x0, x1) - rect.left) * scaleX), 0, els.cvSrc.width);
    const sy1 = clamp(Math.floor((Math.max(y0, y1) - rect.top) * scaleY), 0, els.cvSrc.height);
    const w = Math.max(1, sx1 - sx0);
    const h = Math.max(1, sy1 - sy0);
    state.sel = { x: sx0, y: sy0, w, h };
    updateRectOverlay();
    els.btnClearSel.disabled = false;
    els.btnApply.disabled = false;
    setMsg(`Selection: ${w}×${h}px — click INPAINT to process.`);
  }

  function drawBitmapToCanvas(bitmap, canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }

  async function loadFile(file) {
    state.file = file;
    state.outBlob = null;
    state.outFilename = '';
    state.sel = null;
    if (state.rectEl) { state.rectEl.remove(); state.rectEl = null; }
    els.btnApply.disabled = true;
    els.btnDownload.disabled = true;
    els.btnClear.disabled = false;
    els.btnClearSel.disabled = true;
    setMsg('Loading image...');
    try {
      const bmp = await createImageBitmap(file);
      state.srcBitmap = bmp;
      drawBitmapToCanvas(bmp, els.cvSrc);
      drawBitmapToCanvas(bmp, els.cvOut);
      setMsg('Drag on the original image to mark the watermark area.');
    } catch (e) {
      console.error(e);
      setMsg('Failed to load image: ' + (e.message || e), true);
    }
  }

  async function process() {
    if (!state.srcBitmap) { setMsg('Please select an image first.', true); return; }
    if (!state.sel) { setMsg('Please mark the watermark area on the original image.', true); return; }

    const iterations = parseInt(els.iterations.value || 35);
    els.iterVal.textContent = String(iterations);

    const cv = els.cvSrc;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const mask = createMaskFromRect(cv.width, cv.height, state.sel);

    setMsg('Inpainting, please wait...');
    els.btnApply.disabled = true;
    els.btnApply.textContent = '...';

    await new Promise(r => setTimeout(r, 10));
    const out = inpaintDiffuse(img, cv.width, cv.height, mask, iterations);

    const cv2 = els.cvOut;
    const ctx2 = cv2.getContext('2d', { willReadFrequently: true });
    cv2.width = cv.width;
    cv2.height = cv.height;
    ctx2.putImageData(out, 0, 0);

    const blob = await new Promise(resolve => cv2.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) { setMsg('Failed to generate result.', true); return; }

    state.outBlob = blob;
    const base = (state.file?.name || 'photo').replace(/\.[^.]+$/, '');
    state.outFilename = base + '_clean.jpg';
    els.btnDownload.disabled = false;
    els.btnApply.disabled = false;
    els.btnApply.textContent = '🔧 INPAINT';
    setMsg('Inpainting complete! Adjust selection or download.');
  }

  function resetAll() {
    state.file = null;
    state.srcBitmap = null;
    state.outBlob = null;
    state.outFilename = '';
    state.sel = null;
    state.dragging = false;
    state.dragStart = null;
    if (state.rectEl) { state.rectEl.remove(); state.rectEl = null; }
    els.btnApply.disabled = true;
    els.btnDownload.disabled = true;
    els.btnClear.disabled = true;
    els.btnClearSel.disabled = true;
    const c1 = els.cvSrc.getContext('2d');
    const c2 = els.cvOut.getContext('2d');
    els.cvSrc.width = els.cvSrc.height = 1;
    els.cvOut.width = els.cvOut.height = 1;
    c1.clearRect(0, 0, 1, 1);
    c2.clearRect(0, 0, 1, 1);
    setMsg('Select an image, then drag on the original to mark the watermark area.');
  }

  // Events
  els.btnBrowse.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    const f = els.fileInput.files?.[0];
    if (f) loadFile(f);
  });
  els.btnApply.addEventListener('click', process);
  els.btnClear.addEventListener('click', resetAll);
  els.btnClearSel.addEventListener('click', clearSelection);
  els.btnDownload.addEventListener('click', () => {
    if (!state.outBlob) { setMsg('No result to download.', true); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(state.outBlob);
    a.download = state.outFilename || 'clean.jpg';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  });

  els.iterations.addEventListener('input', () => {
    els.iterVal.textContent = els.iterations.value;
  });

  // Selection drag
  els.cvSrc.addEventListener('mousedown', (e) => {
    if (!state.srcBitmap) return;
    state.dragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.dragging || !state.dragStart) return;
    setSelectionFromClientRect(state.dragStart.x, state.dragStart.y, e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    state.dragging = false;
    state.dragStart = null;
  });

  resetAll();
}
