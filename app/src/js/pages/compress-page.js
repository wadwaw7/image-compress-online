/* ===== Compress Page Controller ===== */
import store from '../store.js';
import { compressLocal, runPool, formatSize, extFromMimeOrName, md5Hex } from '../engines/compress.js';
import { showToast } from '../ui/toast.js';

export function initCompressPage() {
  const dropzone = document.getElementById('compress-dropzone');
  const input = document.getElementById('compress-input');
  const tbody = document.getElementById('queue-tbody');
  const queueWrap = document.getElementById('compress-queue-wrap');
  const progressWrap = document.getElementById('compress-progress-wrap');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressFile = document.getElementById('progress-file');
  const queueCount = document.getElementById('queue-count');
  const btnStart = document.getElementById('btn-compress-start');
  const btnDownloadAll = document.getElementById('btn-download-all');
  const btnClear = document.getElementById('btn-clear-queue');

  let files = [];
  let results = [];

  // Store refs for global drop handler
  window._compressInput = input;

  function updateUI() {
    const has = files.length > 0;
    queueWrap.classList.toggle('hidden', !has);
    btnStart.disabled = !has || store.get('compressRunning');
    btnDownloadAll.disabled = results.length === 0;
    btnClear.disabled = !has;
    queueCount.textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
  }

  function addFiles(newFiles) {
    for (const f of newFiles) {
      if (!f.type.startsWith('image/')) {
        showToast('Skipping non-image file: ' + f.name, 'error');
        continue;
      }
      files.push(f);
      const row = tbody.insertRow();
      row.dataset.file = f.name;
      row.innerHTML = `
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.name}">${f.name}</td>
        <td class="text-mono">${formatSize(f.size)}</td>
        <td class="text-muted">-</td>
        <td class="text-muted">-</td>
        <td><button class="btn ghost font-sm" data-remove="${f.name}" style="padding:2px 6px;font-size:10px">✕</button></td>
      `;
      row.querySelector('button').addEventListener('click', () => {
        files = files.filter(x => x.name !== f.name);
        row.remove();
        updateUI();
      });
    }
    updateUI();
  }

  // Drop zone events
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => {
    if (input.files) addFiles(input.files);
    input.value = '';
  });

  // Clear queue
  btnClear.addEventListener('click', () => {
    files = [];
    results = [];
    tbody.innerHTML = '';
    updateUI();
  });

  // Format & quality UI
  const fmtSelect = document.getElementById('compress-format');
  const qualitySlider = document.getElementById('compress-quality');
  const qualityVal = document.getElementById('quality-val');

  fmtSelect.addEventListener('change', () => store.setState({ compressFormat: fmtSelect.value }));
  qualitySlider.addEventListener('input', () => {
    qualityVal.textContent = qualitySlider.value;
    store.setState({ compressQuality: parseInt(qualitySlider.value) });
  });

  // Max width/height
  document.getElementById('compress-maxw').addEventListener('input', function () {
    store.setState({ compressMaxW: parseInt(this.value) || 0 });
  });
  document.getElementById('compress-maxh').addEventListener('input', function () {
    store.setState({ compressMaxH: parseInt(this.value) || 0 });
  });
  document.getElementById('compress-concurrency').addEventListener('change', function () {
    store.setState({ compressConcurrency: parseInt(this.value) || 2 });
  });

  // Start compression
  btnStart.addEventListener('click', async () => {
    if (files.length === 0) return;
    const fmt = fmtSelect.value;
    const quality = parseInt(qualitySlider.value);
    const maxW = parseInt(document.getElementById('compress-maxw').value) || 0;
    const maxH = parseInt(document.getElementById('compress-maxh').value) || 0;
    const concurrency = parseInt(document.getElementById('compress-concurrency').value) || 2;

    store.setState({ compressRunning: true, compressProgress: { done: 0, total: files.length, currentName: '' } });
    results = [];
    updateUI();

    progressWrap.classList.remove('hidden');
    progressBar.style.width = '0%';
    btnStart.disabled = true;
    btnStart.textContent = '...';

    const worker = async (file) => {
      const out = await compressLocal(file, fmt, quality, { maxW, maxH, alpha: 'white' });
      const p = store.get('compressProgress');
      store.setState({ compressProgress: { ...p, done: p.done + 1, currentName: file.name } });
      progressBar.style.width = ((p.done + 1) / files.length * 100) + '%';
      progressText.textContent = `Processing ${p.done + 1}/${files.length}`;
      progressFile.textContent = file.name;
      return { file, out };
    };

    try {
      const res = await runPool(files, concurrency, worker);
      results = res.filter(Boolean);

      // Update table with results
      results.forEach(({ file, out }) => {
        const row = tbody.querySelector(`[data-file="${CSS.escape(file.name)}"]`);
        // Actually, safer to use data attr
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(r => {
          const btn = r.querySelector('button');
          if (btn && btn.dataset.remove === file.name) {
            const cells = r.querySelectorAll('td');
            cells[2].textContent = formatSize(out.size);
            cells[2].style.color = 'var(--neon-green)';
            const saved = file.size > out.size
              ? ((1 - out.size / file.size) * 100).toFixed(0) + '%'
              : '0%';
            cells[3].textContent = saved;
            cells[3].style.color = 'var(--neon-cyan)';
          }
        });
      });

      showToast(`Compression complete! ${results.length} file(s) processed.`, 'success');
    } catch (e) {
      showToast('Compression error: ' + (e.message || e), 'error');
    } finally {
      store.setState({ compressRunning: false });
      btnStart.textContent = '⚡ START COMPRESSION';
      updateUI();
      setTimeout(() => progressWrap.classList.add('hidden'), 2000);
    }
  });

  // Download all
  btnDownloadAll.addEventListener('click', () => {
    results.forEach(({ out }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out);
      a.download = out.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    });
    showToast(`Downloading ${results.length} file(s)...`, 'info');
  });

  updateUI();
}
