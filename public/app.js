// ImageCompress — 本地图片压缩引擎（纯浏览器端，无需服务器）
(function(){
  var els = {
    fileInput: document.getElementById('file-input'),
    btnUpload: document.getElementById('btn-upload'),
    btnCompress: document.getElementById('btn-compress'),
    btnClear: document.getElementById('btn-clear'),
    btnSelectPreview: document.getElementById('btn-select-preview'),
    fmt: document.getElementById('fmt'),
    concurrency: document.getElementById('concurrency'),
    maxW: document.getElementById('max-w'),
    maxH: document.getElementById('max-h'),
    alpha: document.getElementById('alpha'),
    q: document.getElementById('quality'),
    qv: document.getElementById('qv'),
    tblImages: document.querySelector('#tbl-images tbody'),
    tblTasks: document.querySelector('#tbl-tasks tbody'),
    chkAllImg: document.getElementById('chk-all-img'),
    btnDelSelected: document.getElementById('btn-del-selected'),
    btnDelAll: document.getElementById('btn-del-all'),
  };

  var state = {
    images: [],
    tasks: [],
    previewSelectMode: false,
    selectedImg: new Set(),
    nextImageId: 1,
    nextTaskId: 1,
    imageStore: new Map(),   // id -> { id, filename, file_ext, file_size, md5_hash, media_type, file }
    taskStore: new Map(),    // taskId -> { id, image_id, format, quality, status, compressed_size, _blob, _filename, error_message }
  };
  window.state = state;

  var msgEl = document.getElementById('upload-msg');

  function msg(text, isErr){
    if(!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = isErr ? '#ef4444' : '#64748b';
  }

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttr(value){
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function formatSize(n){
    if(n > 1024*1024) return (n/1024/1024).toFixed(2) + ' MB';
    if(n > 1024) return (n/1024).toFixed(1) + ' KB';
    return n + ' B';
  }

  function showConfirm(opts){
    return new Promise(function(resolve){
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML =
        '<div class="confirm-box">'+
          '<div class="confirm-title">'+(opts.icon||'')+' '+escapeHtml(opts.title||'')+'</div>'+
          '<div class="confirm-body">'+escapeHtml(opts.message||'')+'</div>'+
          (opts.detail ? '<div class="confirm-detail">'+opts.detail+'</div>' : '')+
          '<div class="confirm-actions">'+
            '<button class="btn gray cancel-btn">'+escapeHtml(opts.cancelText||'取消')+'</button>'+
            '<button class="btn confirm-btn" style="background:'+(opts.danger?'#ef4444':'var(--brand)')+'">'+escapeHtml(opts.confirmText||'确认')+'</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(overlay);
      function cleanup(){ if(overlay.parentNode) overlay.remove(); }
      overlay.querySelector('.cancel-btn').addEventListener('click', function(){ cleanup(); resolve(false); });
      overlay.querySelector('.confirm-btn').addEventListener('click', function(){ cleanup(); resolve(true); });
      overlay.addEventListener('click', function(e){ if(e.target===overlay){ cleanup(); resolve(false); } });
    });
  }

  // =============== 文件类型检测 ===============
  function extFromMimeOrName(file){
    var name = (file && file.name) ? file.name : '';
    var m = /\.([a-zA-Z0-9]+)$/.exec(name);
    if(m) return m[1].toLowerCase();
    var type = (file && file.type) ? file.type.toLowerCase() : '';
    if(type.includes('jpeg')||type.includes('jpg')) return 'jpeg';
    if(type.includes('png')) return 'png';
    if(type.includes('webp')) return 'webp';
    return 'img';
  }

  function isImageFile(file){
    if(!file) return false;
    var type = (file.type || '').toLowerCase();
    return type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || '');
  }

  // =============== 哈希（用于去重展示） ===============
  async function sha256Hex(file){
    var buf = await file.arrayBuffer();
    var hash = await crypto.subtle.digest('SHA-256', buf);
    var bytes = new Uint8Array(hash);
    return Array.from(bytes).slice(0,8).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }

  // =============== 图片加载 ===============
  async function fileToImageBitmap(file){
    if(window.createImageBitmap){
      return await createImageBitmap(file);
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise(function(res, rej){ img.onload = res; img.onerror = rej; });
    URL.revokeObjectURL(url);
    return img;
  }

  // =============== 核心压缩 ===============
  async function compressLocal(file, outFmt, quality, opts){
    var q = Math.max(1, Math.min(100, Number(quality)||80)) / 100;
    var fmt = String(outFmt||'webp').toLowerCase();
    var o = opts || { maxW:0, maxH:0, alpha:'white' };

    var bitmapOrImg = await fileToImageBitmap(file);
    var srcW = bitmapOrImg.width;
    var srcH = bitmapOrImg.height;

    // 等比缩放
    var dstW = srcW, dstH = srcH;
    var maxW = Math.max(0, Number(o.maxW)||0);
    var maxH = Math.max(0, Number(o.maxH)||0);
    var ratioW = maxW > 0 ? (maxW / srcW) : 1;
    var ratioH = maxH > 0 ? (maxH / srcH) : 1;
    var ratio = Math.min(1, ratioW, ratioH);
    dstW = Math.max(1, Math.round(srcW * ratio));
    dstH = Math.max(1, Math.round(srcH * ratio));

    // 透明策略
    var out = fmt;
    var wantJpeg = (fmt === 'jpeg' || fmt === 'jpg');
    if(wantJpeg && o.alpha === 'keep'){ out = 'webp'; }

    var canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    var ctx = canvas.getContext('2d');

    if(out === 'jpeg' || out === 'jpg'){
      ctx.fillStyle = (o.alpha === 'black') ? '#000' : '#fff';
      ctx.fillRect(0, 0, dstW, dstH);
    }
    ctx.drawImage(bitmapOrImg, 0, 0, dstW, dstH);

    var mime = 'image/webp';
    if(out === 'jpeg' || out === 'jpg') mime = 'image/jpeg';
    else if(out === 'png') mime = 'image/png';

    var blob = await new Promise(function(resolve){
      canvas.toBlob(function(b){ resolve(b); }, mime, q);
    });
    if(!blob) throw new Error('本地压缩失败（toBlob 返回空）');

    var outExt = (out === 'jpg') ? 'jpeg' : out;
    var outName = (file.name || 'image').replace(/\.[^.]+$/,'') + '.' + outExt;
    return new File([blob], outName, { type: mime });
  }

  // =============== 并发池 ===============
  async function runPool(items, limit, worker){
    var queue = items.slice();
    var results = [];
    var runners = new Array(Math.max(1, limit)).fill(0).map(async function(){
      while(queue.length){
        var it = queue.shift();
        try{ results.push(await worker(it)); }catch(e){ results.push(null); }
      }
    });
    await Promise.all(runners);
    return results;
  }

  function readInt(el, def){
    var v = (el && typeof el.value === 'string') ? el.value.trim() : '';
    var n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  }

  function localOptions(){
    var concurrency = Math.max(1, Math.min(4, readInt(els.concurrency, 2)));
    var maxW = Math.max(0, readInt(els.maxW, 0));
    var maxH = Math.max(0, readInt(els.maxH, 0));
    var alpha = (els.alpha && els.alpha.value) ? els.alpha.value : 'white';
    return { concurrency: concurrency, maxW: maxW, maxH: maxH, alpha: alpha };
  }

  // =============== 渲染 ===============
  function renderImages(){
    if(!els.tblImages) return;
    els.tblImages.innerHTML = state.images.map(function(x){
      return '<tr data-id="' + x.id + '">' +
        '<td style="width:36px"><input type="checkbox" class="chk-img" data-id="' + x.id + '" ' + (state.selectedImg.has(x.id)?'checked':'') + '></td>' +
        '<td>' + x.id + '</td><td>' + escapeHtml(x.filename) + '</td><td>' + escapeHtml(x.file_ext) + '</td><td>' + escapeHtml(formatSize(x.file_size)) + '</td><td><span class="muted">' + escapeHtml((x.md5_hash||'').slice(0,8)) + '...</span></td>' +
      '</tr>';
    }).join('');
    syncChkAll();
  }

  function renderTasks(){
    if(!els.tblTasks) return;
    els.tblTasks.innerHTML = state.tasks.map(function(t){
      var st = (t.status === 1) ? '<span class="ok">完成</span>'
        : (t.status === 2 ? '<span class="fail">失败</span>'
        : '<span class="badge">排队/处理中</span>');
      var size = t.compressed_size ? formatSize(t.compressed_size) : '-';
      var preview = t.status === 1 ? '<a href="javascript:;" data-action="preview" data-id="' + t.id + '">预览</a>' : '';
      var download = t.status === 1 ? '<a href="javascript:;" data-action="download" data-id="' + t.id + '">下载</a>' : '';
      var del = '<a href="javascript:;" data-action="delete" data-id="' + t.id + '">删除</a>';
      var ops = [preview, download, del].filter(Boolean).join(' / ');
      var titleAttr = (t.status === 2 && t.error_message) ? ' title="' + escapeAttr(t.error_message) + '"' : '';
      return '<tr data-id="' + t.id + '"' + titleAttr + '>' +
        '<td>' + t.id + '</td><td>' + t.image_id + '</td><td>' + escapeHtml(t.format) + '</td><td>' + escapeHtml(t.quality) + '</td><td>' + st + '</td><td>' + escapeHtml(size) + '</td><td>' + ops + '</td>' +
      '</tr>';
    }).join('');
  }

  function syncChkAll(){
    if(!els.chkAllImg) return;
    var allIds = state.images.map(function(x){ return x.id; });
    if(allIds.length === 0){ els.chkAllImg.checked = false; els.chkAllImg.indeterminate = false; return; }
    var all = allIds.every(function(id){ return state.selectedImg.has(id); });
    var some = state.selectedImg.size > 0 && !all;
    els.chkAllImg.checked = all;
    els.chkAllImg.indeterminate = some;
  }

  // =============== 上传/入队 ===============
  function addFiles(files){
    if(!files || files.length === 0) return;
    var added = [];
    var skipped = 0;
    for(var i = 0; i < files.length; i++){
      var f = files[i];
      if(!isImageFile(f)){ skipped++; continue; }
      var id = ++state.nextImageId;
      var ext = extFromMimeOrName(f);
      sha256Hex(f).then(function(h){
        var img = state.images.find(function(x){ return x.id === id; });
        if(img) img.md5_hash = h;
      });
      var item = { id: id, filename: f.name || ('image_'+id), file_ext: ext, file_size: f.size, md5_hash: '', media_type: 'image', file: f };
      state.imageStore.set(id, item);
      state.images.push({ id: item.id, filename: item.filename, file_ext: item.file_ext, file_size: item.file_size, md5_hash: item.md5_hash, media_type: 'image' });
      added.push(item);
    }
    if(els.fileInput) els.fileInput.value = '';
    renderImages();
    var txt = '已添加 ' + added.length + ' 张图片';
    if(skipped > 0) txt += '（跳过 ' + skipped + ' 个非图片文件）';
    msg(txt);
  }

  if(els.btnUpload) els.btnUpload.addEventListener('click', function(){
    var files = els.fileInput && els.fileInput.files;
    if(!files || files.length === 0){
      try{ els.fileInput && els.fileInput.click(); }catch(e){}
      msg('请先选择图片文件', true);
      return;
    }
    addFiles(files);
  });

  // =============== 压缩 ===============
  var compressing = false;
  if(els.btnCompress) els.btnCompress.addEventListener('click', async function(){
    if(compressing){ msg('正在压缩中，请稍候...', false); return; }
    if(state.images.length === 0){ msg('请先添加图片文件', true); return; }

    var fmt = els.fmt ? els.fmt.value : 'webp';
    var quality = parseInt(els.q ? els.q.value : '80', 10) || 80;

    try{
      compressing = true;
      if(els.btnCompress){ els.btnCompress.disabled = true; els.btnCompress.textContent = '压缩中...'; }

      var newTasks = [];
      for(var j = 0; j < state.images.length; j++){
        var imgId = state.images[j].id;
        var stored = state.imageStore.get(imgId);
        if(!stored || !stored.file) continue;
        var taskId = ++state.nextTaskId;
        var task = {
          id: taskId, image_id: imgId, format: fmt, quality: quality,
          status: 0, compressed_size: 0, _blob: null, _filename: '', error_message: ''
        };
        state.taskStore.set(taskId, task);
        newTasks.push(task);
      }
      state.tasks = newTasks.concat(state.tasks);
      renderTasks();

      var opts = localOptions();
      msg('正在压缩 ' + newTasks.length + ' 张图片（并发数：' + opts.concurrency + '）...');

      await runPool(newTasks, opts.concurrency, async function(t){
        try{
          var stored = state.imageStore.get(t.image_id);
          var outFile = await compressLocal(stored.file, fmt, quality, {
            maxW: opts.maxW, maxH: opts.maxH, alpha: opts.alpha
          });
          t._blob = outFile;
          t._filename = outFile.name;
          t.compressed_size = outFile.size;
          t.status = 1;
        }catch(err){
          console.error('compress failed', err);
          t.status = 2;
          t.error_message = err.message || String(err);
        }
        renderTasks();
        return t;
      });

      var done = newTasks.filter(function(t){ return t.status === 1; }).length;
      var failed = newTasks.filter(function(t){ return t.status === 2; }).length;
      var totalSize = newTasks.filter(function(t){ return t.status === 1; }).reduce(function(s,t){ return s + t.compressed_size; }, 0);
      msg('压缩完成：' + done + ' 张成功' + (failed ? '，' + failed + ' 张失败' : '') + '，输出大小 ' + formatSize(totalSize));
    }catch(e){
      msg('压缩出错：' + (e.message||e), true);
    }finally{
      compressing = false;
      if(els.btnCompress){ els.btnCompress.disabled = false; els.btnCompress.textContent = '全部压缩'; }
    }
  });

  // =============== 清除完成记录 ===============
  if(els.btnClear) els.btnClear.addEventListener('click', async function(){
    var completed = state.tasks.filter(function(t){ return t.status === 1; });
    if(!completed.length){ msg('没有已完成的压缩记录', false); return; }
    var ok = await showConfirm({
      icon: '🗑️', title: '清除完成记录',
      message: '即将清除所有已完成的压缩记录（共 ' + completed.length + ' 条）。',
      confirmText: '确认清除', danger: true
    });
    if(!ok) return;
    var before = state.tasks.length;
    state.tasks = state.tasks.filter(function(t){ return t.status !== 1; });
    renderTasks();
    msg('已清除 ' + (before - state.tasks.length) + ' 条完成记录');
  });

  // =============== 选择预览 ===============
  if(els.btnSelectPreview) els.btnSelectPreview.addEventListener('click', function(){
    state.previewSelectMode = !state.previewSelectMode;
    msg(state.previewSelectMode ? '选择预览模式已开启（点击已完成任务行即可预览）' : '选择预览模式已关闭');
  });

  // =============== 预览 & 下载 ===============
  function doPreview(id){
    var t = state.tasks.find(function(x){ return x.id === id; });
    if(!t || !t._blob){ msg('该任务无可预览内容', true); return; }
    var url = URL.createObjectURL(t._blob);
    window.open(url, '_blank');
    setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
  }

  function doDownload(id){
    var t = state.tasks.find(function(x){ return x.id === id; });
    if(!t || !t._blob){ msg('该任务无可下载内容', true); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(t._blob);
    a.download = t._filename || ('compressed_' + id);
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  window.downloadById = doDownload;
  window.previewById = doPreview;

  // =============== 删除图片 ===============
  function deleteImagesByIds(ids){
    if(!ids || !ids.length){ msg('请先勾选要删除的图片', true); return; }
    var set = new Set(ids);
    state.images = state.images.filter(function(x){ return !set.has(x.id); });
    state.selectedImg.clear();
    renderImages();
    // 同时清理关联的压缩任务
    state.tasks = state.tasks.filter(function(t){ return !set.has(t.image_id); });
    renderTasks();
    msg('已删除 ' + ids.length + ' 张图片及其压缩记录');
  }

  if(els.btnDelSelected) els.btnDelSelected.addEventListener('click', function(){
    deleteImagesByIds(Array.from(state.selectedImg));
  });

  if(els.btnDelAll) els.btnDelAll.addEventListener('click', async function(){
    if(!state.images.length){ msg('当前没有已添加的图片', true); return; }
    var ok = await showConfirm({
      icon: '⚠️', title: '删除全部图片',
      message: '即将删除全部 ' + state.images.length + ' 张图片及其压缩记录。',
      confirmText: '全部删除', danger: true
    });
    if(!ok) return;
    state.images = [];
    state.selectedImg.clear();
    renderImages();
    state.tasks = [];
    renderTasks();
    msg('已清空全部图片和压缩记录');
  });

  // =============== 表格事件 ===============
  if(els.chkAllImg) els.chkAllImg.addEventListener('change', function(){
    if(els.chkAllImg.checked){ state.images.forEach(function(x){ state.selectedImg.add(x.id); }); }
    else{ state.selectedImg.clear(); }
    renderImages();
  });

  if(els.tblImages) els.tblImages.addEventListener('change', function(e){
    var cb = e.target.closest('input.chk-img');
    if(!cb) return;
    var id = Number(cb.dataset.id);
    if(cb.checked){ state.selectedImg.add(id); } else { state.selectedImg.delete(id); }
    syncChkAll();
  });

  if(els.tblTasks) els.tblTasks.addEventListener('click', function(e){
    var a = e.target.closest('a[data-action]');
    if(a){
      e.preventDefault();
      var id = Number(a.dataset.id);
      var act = a.dataset.action;
      if(act === 'preview'){ doPreview(id); }
      else if(act === 'download'){ doDownload(id); }
      else if(act === 'delete'){
        if(!confirm('确认删除该压缩记录？')) return;
        state.tasks = state.tasks.filter(function(t){ return t.id !== id; });
        renderTasks();
        msg('已删除该压缩记录');
      }
      return;
    }
    // 选择预览模式
    if(state.previewSelectMode){
      var tr = e.target.closest('tr[data-id]');
      if(tr){
        var tid = Number(tr.dataset.id);
        var task = state.tasks.find(function(t){ return t.id === tid; });
        if(task && task.status === 1){ doPreview(tid); }
        else{ msg('该任务尚未完成，无法预览', true); }
      }
    }
  });

  // =============== 质量滑块 ===============
  if(els.q && els.qv) els.q.addEventListener('input', function(){ els.qv.textContent = els.q.value; });

})();
