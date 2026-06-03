/* ===== Background Change Page Controller ===== */
import store from '../store.js';
import { changeBackground, parseColor, clamp } from '../engines/bgchange.js';
import { showToast } from '../ui/toast.js';

export function initBgPage() {
  const els = {
    btnBrowse: document.getElementById('bg-btn-browse'),
    btnProcess: document.getElementById('bg-btn-process'),
    btnDownload: document.getElementById('bg-btn-download'),
    btnClear: document.getElementById('bg-btn-clear'),
    btnPick: document.getElementById('bg-btn-pick'),
    fileInput: document.getElementById('bg-file-input'),
    cvSrc: document.getElementById('bg-cv-src'),
    cvOut: document.getElementById('bg-cv-out'),
    colorPills: document.getElementById('bg-color-pills'),
    customColor: document.getElementById('bg-custom-color'),
    tolerance: document.getElementById('bg-tolerance'),
    tolVal: document.getElementById('bg-tol-val'),
    feather: document.getElementById('bg-feather'),
    featherVal: document.getElementById('bg-feather-val'),
    shrink: document.getElementById('bg-shrink'),
    shrinkVal: document.getElementById('bg-shrink-val'),
    size: document.getElementById('bg-size'),
    format: document.getElementById('bg-format'),
    quality: document.getElementById('bg-quality'),
    qVal: document.getElementById('bg-q-val'),
    msg: document.getElementById('bg-msg'),
  };

  const state = {
    file: null,
    srcBitmap: null,
    outBlob: null,
    outFilename: '',
    currentBgRGB: [255, 255, 255],
    manualBgRGB: null,
    pickingMode: false,
  };

  function setMsg(text, err) {
    els.msg.innerHTML = err
      ? `<span style="color:var(--neon-red)">⚠ ${text}</span>`
      : `<span class="text-cyan">▸</span> ${text}`;
  }

  function getSelectedBgRGB() {
    const custom = els.customColor.value.trim();
    if (custom && custom.toLowerCase() !== '#ffffff') {
      const c = parseColor(custom);
      if (c) return c;
    }
    const activePill = els.colorPills.querySelector('.color-pill.active');
    if (activePill) {
      const c = parseColor(activePill.dataset.color);
      if (c) return c;
    }
    return [255, 255, 255];
  }

  function drawBitmapToCanvas(bitmap, canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }

  // Color pills
  els.colorPills.querySelectorAll('.color-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      els.colorPills.querySelectorAll('.color-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      els.customColor.value = pill.dataset.color;
      state.currentBgRGB = parseColor(pill.dataset.color) || [255, 255, 255];
    });
  });

  // Custom color input
  els.customColor.addEventListener('input', () => {
    const c = parseColor(els.customColor.value);
    if (c) {
      state.currentBgRGB = c;
      els.colorPills.querySelectorAll('.color-pill').forEach(p => p.classList.remove('active'));
    }
  });

  // Sliders
  els.tolerance.addEventListener('input', () => els.tolVal.textContent = els.tolerance.value);
  els.feather.addEventListener('input', () => els.featherVal.textContent = els.feather.value);
  els.shrink.addEventListener('input', () => els.shrinkVal.textContent = els.shrink.value);
  els.quality.addEventListener('input', () => els.qVal.textContent = els.quality.value);

  // Eyedropper mode
  els.btnPick.addEventListener('click', () => {
    if (!state.srcBitmap) {
      setMsg('Please select an image first.', true);
      return;
    }
    state.pickingMode = !state.pickingMode;
    els.btnPick.classList.toggle('active', state.pickingMode);
    els.btnPick.textContent = state.pickingMode ? '💉 PICKING... (click on image)' : '💉 EYEDROPPER';
    els.cvSrc.style.cursor = state.pickingMode ? 'crosshair' : '';
  });

  els.cvSrc.addEventListener('click', (e) => {
    if (!state.pickingMode || !state.srcBitmap) return;
    const rect = els.cvSrc.getBoundingClientRect();
    const scaleX = els.cvSrc.width / rect.width;
    const scaleY = els.cvSrc.height / rect.height;
    const px = Math.floor((e.clientX - rect.left) * scaleX);
    const py = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = els.cvSrc.getContext('2d', { willReadFrequently: true });
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    const rgb = [pixel[0], pixel[1], pixel[2]];

    state.manualBgRGB = rgb;
    state.currentBgRGB = rgb;
    els.customColor.value = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    els.colorPills.querySelectorAll('.color-pill').forEach(p => p.classList.remove('active'));
    state.pickingMode = false;
    els.btnPick.classList.remove('active');
    els.btnPick.textContent = '💉 EYEDROPPER';
    els.cvSrc.style.cursor = '';
    setMsg(`Sampled background color: rgb(${rgb.join(',')})`);
  });

  async function loadFile(file) {
    state.file = file;
    state.outBlob = null;
    state.outFilename = '';
    state.manualBgRGB = null;
    els.btnProcess.disabled = false;
    els.btnDownload.disabled = true;
    els.btnClear.disabled = false;
    setMsg('Loading image...');
    try {
      const bmp = await createImageBitmap(file);
      state.srcBitmap = bmp;
      drawBitmapToCanvas(bmp, els.cvSrc);
      drawBitmapToCanvas(bmp, els.cvOut);
      setMsg('Select a background color and click CHANGE BG.');
    } catch (e) {
      console.error(e);
      setMsg('Failed to load image: ' + (e.message || e), true);
    }
  }

  async function process() {
    if (!state.srcBitmap) { setMsg('Please select an image first.', true); return; }

    const bgRGB = getSelectedBgRGB();
    const tol = parseInt(els.tolerance.value || 10);
    const feather = parseInt(els.feather.value || 2);
    const shrink = parseInt(els.shrink.value || 0);
    const size = els.size.value;
    const fmt = els.format.value;
    const quality = parseInt(els.quality.value || 90);

    setMsg('Processing, please wait...');
    els.btnProcess.disabled = true;
    els.btnProcess.textContent = '...';

    try {
      const result = await changeBackground(state.file, {
        bgColor: bgRGB,
        sampleMode: state.manualBgRGB ? 'manual' : 'auto',
        manualBgRGB: state.manualBgRGB,
        tolerance: tol,
        feather,
        shrink,
        size,
        format: fmt,
        quality,
      });

      state.outBlob = result.blob;
      state.outFilename = result.filename;

      // Display result
      const outBmp = await createImageBitmap(result.blob);
      drawBitmapToCanvas(outBmp, els.cvOut);

      els.btnDownload.disabled = false;
      const bgStr = result.stats.bgRGB.join(',');
      const ratioPct = (result.stats.bgRatio * 100).toFixed(1);
      setMsg(`Done! bgRGB(${bgStr}) · bg≈${ratioPct}% · ${result.blob.size > 1024 ? (result.blob.size/1024).toFixed(1)+'KB' : result.blob.size+'B'}`);
    } catch (e) {
      setMsg('Processing failed: ' + (e.message || e), true);
    } finally {
      els.btnProcess.disabled = false;
      els.btnProcess.textContent = '🎨 CHANGE BG';
    }
  }

  function resetAll() {
    state.file = null;
    state.srcBitmap = null;
    state.outBlob = null;
    state.outFilename = '';
    state.manualBgRGB = null;
    state.pickingMode = false;
    els.btnProcess.disabled = true;
    els.btnDownload.disabled = true;
    els.btnClear.disabled = true;
    els.btnPick.textContent = '💉 EYEDROPPER';
    els.cvSrc.style.cursor = '';
    const c1 = els.cvSrc.getContext('2d');
    const c2 = els.cvOut.getContext('2d');
    els.cvSrc.width = els.cvSrc.height = 1;
    els.cvOut.width = els.cvOut.height = 1;
    c1.clearRect(0, 0, 1, 1);
    c2.clearRect(0, 0, 1, 1);
    els.customColor.value = '#ffffff';
    els.colorPills.querySelectorAll('.color-pill').forEach(p => p.classList.remove('active'));
    els.colorPills.querySelector('[data-color="#ffffff"]')?.classList.add('active');
    setMsg('Click the eyedropper then click on the original image background to sample the color.');
  }

  // Events
  els.btnBrowse.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    const f = els.fileInput.files?.[0];
    if (f) loadFile(f);
  });
  els.btnProcess.addEventListener('click', process);
  els.btnClear.addEventListener('click', resetAll);
  els.btnDownload.addEventListener('click', () => {
    if (!state.outBlob) { setMsg('No result to download.', true); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(state.outBlob);
    a.download = state.outFilename || 'bg.jpg';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  });

  resetAll();
}
