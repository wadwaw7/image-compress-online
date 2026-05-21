(async function(){
  const els = {
    auth: document.getElementById('auth'),
    uploader: document.getElementById('uploader'),
    authMsg: document.getElementById('auth-msg'),
    uploadMsg: document.getElementById('upload-msg'),
    loginId: document.getElementById('login-identifier'),
    loginPwd: document.getElementById('login-password'),
    btnLogin: document.getElementById('btn-login'),
    btnRegister: document.getElementById('btn-register'),
    btnLogout: document.getElementById('btn-logout'),
    fileInput: document.getElementById('file-input'),
    btnUpload: document.getElementById('btn-upload'),
    btnCompress: document.getElementById('btn-compress'),
    btnClear: document.getElementById('btn-clear'),
    btnSelectPreview: document.getElementById('btn-select-preview'),
    fmt: document.getElementById('fmt'),
    mode: document.getElementById('mode'),
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
    videoCodec: document.getElementById('video-codec'),
    videoCodecWrap: document.getElementById('video-codec-wrap'),
    uploadProgress: document.getElementById('upload-progress'),
    uploadProgressWrap: document.getElementById('upload-progress-wrap'),
    uploadProgressText: document.getElementById('upload-progress-text'),
  };

  const state = {
    token: localStorage.getItem('token') || '',
    images: [],
    tasks: [],
    pollTimer: null,
    lastBatch: [],
    previewSelectMode: false,
    lastPollErrAt: 0, // 轮询错误提示去抖
    selectedImg: new Set(), // 已选择的图片ID
  };
  window.state = state;

  if (els.fileInput) {
    els.fileInput.addEventListener('change', () => {
      if (els.fileInput.files && els.fileInput.files.length > 0) {
        els.btnUpload && els.btnUpload.click();
      }
    });
  }

  function setToken(t){
    state.token = t || '';
    if(t){ localStorage.setItem('token', t); } else { localStorage.removeItem('token'); }
  }

  function authHeaders(){
    return state.token ? { 'Authorization': 'Bearer ' + state.token } : {};
  }
  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(value){
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function show(el){ if(!el) return; el.classList.remove('hidden'); try{ el.style.display=''; }catch(_){} }
  function hide(el){ if(!el) return; el.classList.add('hidden'); try{ el.style.display='none'; }catch(_){} }

  function isAuthPage(){
    try{
      const p = (location.pathname||'').toLowerCase();
      return p.endsWith('/login.html') || p.endsWith('/register.html') || p.endsWith('/profile.html');
    }catch(_){ return false; }
  }
  function uiRefresh(){
    // 未登录：仍然允许使用"本地压缩模式"（不走服务器）
    // 因此不再隐藏上传/压缩区域，仅隐藏登录块
    show(els.uploader);
    if (state.token) {
      hide(els.auth);
    } else {
      // 仅在登录/注册/个人资料页显示登录块；首页等页面不再显示该登录块
      if (isAuthPage()) show(els.auth); else hide(els.auth);
    }
  }

  function msg(el, text, isErr=false){
    if(!el) return;
    el.textContent = text || '';
    el.style.color = isErr ? '#ef4444' : '#64748b';
  }

  // =============== API 基址（支持对外访问：部署同源时默认走同源） ===============
  let API_BASE = '';
  let API_OK = true; // 非 file:// 默认同源，认为可用
  const API_BASE_KEY = 'api_base';
  function getQS(key){ try{ return new URLSearchParams(location.search).get(key); }catch(_){ return null; } }

  async function pickApiBase(){
    const forced = getQS('api');
    if (location.protocol !== 'file:') {
      // 在后端以 /static 方式打开，默认同源 API；也允许 ?api= 覆盖（例如跨域调试）
      API_BASE = (forced && forced !== 'self') ? forced : '';
      return;
    }
    // file:// 打开，默认走本机 8001，可通过 ?api= 覆盖成局域网 IP
    API_BASE = forced || 'http://127.0.0.1:8001';
    try{ if(getQS('reset_api')==='1'){ localStorage.removeItem(API_BASE_KEY); } }catch(_){ }
    // 允许把地址缓存起来（仅在 file:// 下有意义）
    try{ if(forced){ localStorage.setItem(API_BASE_KEY, forced); } }catch(_){ }
  }
  await pickApiBase();
  window.API_BASE = API_BASE;
  window.API_READY = API_OK;
  try { document.dispatchEvent(new CustomEvent('api-ready', { detail: { base: API_BASE, ok: API_OK } })); } catch(_) {}

  function onAuthExpired(){
    try{ msg(els.uploadMsg||els.authMsg, '登录已过期，请重新登录', true); }catch(_){ }
    setToken('');
    const cur = (location.protocol==='file:'? (location.pathname.split('/').pop() || 'index.html') : location.pathname);
    const redirect = encodeURIComponent(cur || '/');
    const loginUrl = (location.protocol==='file:'? `./login.html?redirect=${redirect}` : `/login.html?redirect=${redirect}`);
    setTimeout(()=>{ location.href = loginUrl; }, 800);
  }

  async function api(path, opts={}){
    const url = API_BASE + path;
    try{
      const res = await fetch(url, { ...opts, headers: { 'Accept': 'application/json', ...(opts.headers||{}), ...authHeaders() } });
      if(res.status===401 || res.status===403){
        const p = (location.pathname || '').toLowerCase();
        const isLoginApi = path.includes('/auth/login');
        const isAuthPage = p.endsWith('/login.html') || p.endsWith('/register.html') || p.endsWith('/profile.html');
        // 登录接口本身返回 401 表示账号密码错，不应跳转
        if (isLoginApi) {
          let detail = '用户名或密码错误';
          try {
            const j = await res.json();
            detail = j.detail || detail;
          } catch(_) {}
          throw new Error(detail);
        }
        // 已经在登录/注册/个人资料页：只抛错，不再触发重定向
        if (isAuthPage) {
          throw new Error('未登录或登录已过期');
        }
        onAuthExpired();
        throw new Error('未登录或登录已过期');
      }
    if(!res.ok){
      let detail = '';
      try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch { try { detail = await res.text(); } catch { detail=''; } }
      throw new Error(detail || (res.status+':'+res.statusText));
    }
    const ct = res.headers.get('content-type') || '';
    if(ct.includes('application/json')) return res.json();
    return res;
    }catch(err){
      if(err && (err.name === 'TypeError' || /NetworkError|Failed to fetch|abort/i.test(String(err)))){
        throw new Error('网络请求失败，可能是后端未启动或地址不正确（当前使用 '+API_BASE+'）。');
      }
      throw err;
    }
  }

  
  // ---- 2FA INLINE UI START ----
  let __twofaSessionId = '';
  function ensure2FAUI(){
    if(document.getElementById('twofa-box')) return;
    if(!els.auth) return;

    const box = document.createElement('div');
    box.id = 'twofa-box';
    box.style.cssText = 'margin-top:12px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;display:none;';
    box.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">管理员二次验证</div>
      <div style="color:#6b7280;font-size:13px;margin-bottom:8px">验证码已发送至邮箱，请在 5 分钟内输入。</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input id="twofa-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6位验证码"
               style="flex:1;min-width:160px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:9px;" />
        <button id="twofa-verify" class="btn" style="min-width:110px">验证登录</button>
        <button id="twofa-cancel" class="btn" style="background:#3b3f4b;min-width:110px">取消</button>
      </div>
      <div id="twofa-msg" class="status" style="margin-top:10px"></div>
    `;
    els.auth.appendChild(box);

    const btnVerify = document.getElementById('twofa-verify');
    const btnCancel = document.getElementById('twofa-cancel');

    btnCancel && btnCancel.addEventListener('click', () => {
      __twofaSessionId = '';
      box.style.display = 'none';
      msg(els.authMsg, '已取消二次验证', true);
    });

    btnVerify && btnVerify.addEventListener('click', async () => {
      try{
        const code = (document.getElementById('twofa-code')?.value || '').trim();
        if(!__twofaSessionId){ throw new Error('2FA 会话无效，请重新登录触发验证码'); }
        if(!code){ throw new Error('请输入验证码'); }

        msg(document.getElementById('twofa-msg'), '正在验证...', false);
        const data2 = await api('/api/v1/auth/verify-2fa', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ session_id: __twofaSessionId, code })
        });

        if(data2 && data2.access_token){
          setToken(data2.access_token);
          // 2FA 验证成功后，保存之前暂存的记住密码凭据
          try {
            const pendingId = sessionStorage.getItem('ic_2fa_pending_id');
            const pendingPwd = sessionStorage.getItem('ic_2fa_pending_pwd');
            if (pendingId) {
              saveLoginCredentials(pendingId, pendingPwd || '', true);
            }
            sessionStorage.removeItem('ic_2fa_pending_id');
            sessionStorage.removeItem('ic_2fa_pending_pwd');
          } catch(_) {}
          msg(els.authMsg, '登录成功，正在跳转...');
          const redirect = new URLSearchParams(location.search).get('redirect');
          location.href = redirect || (location.protocol === 'file:' ? './index.html' : '/');
          return;
        }
        throw new Error('验证码校验未返回 token');
      }catch(e){
        msg(document.getElementById('twofa-msg'), '验证失败：'+e.message, true);
      }
    });
  }

  function show2FA(sessionId){
    ensure2FAUI();
    __twofaSessionId = sessionId || '';
    const box = document.getElementById('twofa-box');
    if(box) box.style.display = 'block';
    const inp = document.getElementById('twofa-code');
    if(inp){ inp.value=''; inp.focus(); }
    msg(document.getElementById('twofa-msg'), '请输入验证码', false);
  }
  // ---- 2FA INLINE UI END ----

  // =============== 记住密码（仅登录页） ===============
  const REMEMBER_KEY = 'ic_remember_login';
  const REMEMBER_ID_KEY = 'ic_login_id';
  const REMEMBER_PWD_KEY = 'ic_login_pwd';

  function loadSavedLogin(){
    try{
      if(localStorage.getItem(REMEMBER_KEY) !== '1') return null;
      return {
        id: localStorage.getItem(REMEMBER_ID_KEY) || '',
        pwd: localStorage.getItem(REMEMBER_PWD_KEY) || '',
      };
    }catch(_){ return null; }
  }

  function saveLoginCredentials(identifier, password, remember){
    try{
      if(!remember){
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(REMEMBER_ID_KEY);
        localStorage.removeItem(REMEMBER_PWD_KEY);
        return;
      }
      localStorage.setItem(REMEMBER_KEY, '1');
      localStorage.setItem(REMEMBER_ID_KEY, identifier || '');
      localStorage.setItem(REMEMBER_PWD_KEY, password || '');
    }catch(_){ }
  }

  (function initLoginRemember(){
    try{
      const p = (location.pathname || '').toLowerCase();
      if(!p.endsWith('/login.html')) return;
      if(!els.loginId || !els.loginPwd) return;
      const cb = document.getElementById('remember-login');
      const saved = loadSavedLogin();
      if(saved){
        els.loginId.value = saved.id || '';
        els.loginPwd.value = saved.pwd || '';
        if(cb) cb.checked = true;
      }else{
        if(cb) cb.checked = false;
      }
    }catch(_){ }
  })();

if (els.btnLogin) els.btnLogin.addEventListener('click', async ()=>{
    try{
      const identifier = (els.loginId?.value || '').trim();
      const password = els.loginPwd?.value || '';
      const rememberCb = document.getElementById('remember-login');
      const data = await api('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username_or_email: identifier, password }) });
        // ---- 2FA（管理员新IP）处理：后端会返回 {2fa_required:true, session_id:"..."} ----
        if (data && data["2fa_required"] && data["session_id"]) {
          // 暂存凭据，待 2FA 验证成功后保存（用于记住密码）
          if (rememberCb && rememberCb.checked) {
            try { sessionStorage.setItem('ic_2fa_pending_id', identifier); } catch(_) {}
            try { sessionStorage.setItem('ic_2fa_pending_pwd', password); } catch(_) {}
          }
          show2FA(data["session_id"]);
          msg(els.authMsg, '需要二次验证：验证码已发送到邮箱', false);
          return;
        }
        // ---- 2FA 处理结束 ----
setToken(data.access_token);
      // 登录成功后，根据勾选情况保存/清理凭据
      saveLoginCredentials(identifier, password, !!(rememberCb && rememberCb.checked));
      msg(els.authMsg, '登录成功，正在跳转...');
      const redirect = new URLSearchParams(location.search).get('redirect');
      location.href = redirect || (location.protocol === 'file:' ? './index.html' : '/');
    }catch(e){ msg(els.authMsg, '登录失败：'+e.message, true); }
  });

  if (els.btnRegister) els.btnRegister.addEventListener('click', async ()=>{
    try{
      const identifier = (els.loginId?.value || '').trim();
      const password = els.loginPwd?.value || '';
      if(!identifier || !password){ throw new Error('请输入用户名或邮箱'); }
      const isEmail = /@/.test(identifier);
      const payload = isEmail ? { username: identifier.split('@')[0], email: identifier, password } : { username: identifier, email: identifier+"@example.com", password };
      await api('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await api('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username_or_email: identifier, password }) });
      setToken(data.access_token);
      msg(els.authMsg, '注册并登录成功，正在跳转...');
      const redirect = new URLSearchParams(location.search).get('redirect');
      location.href = redirect || (location.protocol === 'file:' ? './index.html' : '/');
    }catch(e){ msg(els.authMsg, '注册/登录失败：'+e.message, true); }
  });

  function stopPolling(){ if(state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer = null; } }
  if (els.btnLogout) els.btnLogout.addEventListener('click', ()=>{ setToken(''); state.images = []; state.tasks = []; renderImages(); renderTasks(); stopPolling(); uiRefresh(); });

  if (els.q && els.qv) els.q.addEventListener('input', ()=>{ els.qv.textContent = els.q.value; });

  // =============== 本地模式（未登录不走服务器） ===============
  const local = {
    enabled: true, // 默认开启本地压缩模式
    nextImageId: 1,
    images: new Map(), // id -> { id, filename, file_ext, file_size, md5_hash, file }
    nextTaskId: 1,
    tasks: new Map(), // taskId -> task
  };

  function extFromMimeOrName(file){
    const name = (file && file.name) ? file.name : '';
    const m = /\.([a-zA-Z0-9]+)$/.exec(name);
    if(m) return m[1].toLowerCase();
    const type = (file && file.type) ? file.type.toLowerCase() : '';
    if(type.includes('jpeg')||type.includes('jpg')) return 'jpeg';
    if(type.includes('png')) return 'png';
    if(type.includes('webp')) return 'webp';
    if(type.includes('mp4')||type.includes('quicktime')) return 'mp4';
    if(type.includes('webm')) return 'webm';
    if(type.includes('x-msvideo')) return 'avi';
    if(type.includes('x-matroska')) return 'mkv';
    return 'img';
  }

  function isVideoFile(file){
    if(!file) return false;
    const type = (file.type || '').toLowerCase();
    if(type.startsWith('video/')) return true;
    const name = (file.name || '').toLowerCase();
    return /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(name);
  }

  function hasVideoInQueue(){
    return state.images.some(function(x){
      if(x.media_type === 'video') return true;
      var ext = (x.file_ext || '').toLowerCase();
      return ['mp4','mov','avi','webm','mkv','flv','wmv'].indexOf(ext) !== -1;
    });
  }

  function updateVideoUI(){
    if(!els.videoCodecWrap) return;
    if(hasVideoInQueue()){
      els.videoCodecWrap.style.border = '2px solid #f59e0b';
      els.videoCodecWrap.style.borderRadius = '10px';
      els.videoCodecWrap.style.padding = '8px 12px';
      els.videoCodecWrap.style.background = '#fffbeb';
    } else {
      els.videoCodecWrap.style.border = '';
      els.videoCodecWrap.style.borderRadius = '';
      els.videoCodecWrap.style.padding = '';
      els.videoCodecWrap.style.background = '';
    }
  }

  async function md5Hex(file){
    // 轻量：使用 WebCrypto SHA-256 代替 MD5（浏览器原生无 MD5），仅用于展示/去重
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function fileToImageBitmap(file){
    // 兼容：优先 createImageBitmap，否则退化到 HTMLImageElement
    if (window.createImageBitmap) {
      return await createImageBitmap(file);
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((res, rej)=>{ img.onload=()=>res(); img.onerror=rej; });
    URL.revokeObjectURL(url);
    return img;
  }

  async function compressLocal(file, outFmt, quality, opts){
    const q = Math.max(1, Math.min(100, Number(quality)||80)) / 100;
    const fmt = String(outFmt||'webp').toLowerCase();
    const o = opts || { maxW:0, maxH:0, alpha:'white' };

    const bitmapOrImg = await fileToImageBitmap(file);
    const srcW = bitmapOrImg.width;
    const srcH = bitmapOrImg.height;

    // 等比缩放
    let dstW = srcW, dstH = srcH;
    const maxW = Math.max(0, Number(o.maxW)||0);
    const maxH = Math.max(0, Number(o.maxH)||0);
    const ratioW = maxW > 0 ? (maxW / srcW) : 1;
    const ratioH = maxH > 0 ? (maxH / srcH) : 1;
    const ratio = Math.min(1, ratioW, ratioH);
    dstW = Math.max(1, Math.round(srcW * ratio));
    dstH = Math.max(1, Math.round(srcH * ratio));

    // 透明策略：当输出 JPEG 且源可能有透明时，按 alpha 设定填充背景；若选择 keep，则自动改用 webp
    let out = fmt;
    const wantJpeg = (fmt === 'jpeg' || fmt === 'jpg');
    if(wantJpeg && o.alpha === 'keep'){
      out = 'webp';
    }

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d');

    // 如果输出 jpeg，需要先铺底色
    if(out === 'jpeg' || out === 'jpg'){
      ctx.fillStyle = (o.alpha === 'black') ? '#000' : '#fff';
      ctx.fillRect(0, 0, dstW, dstH);
    }
    ctx.drawImage(bitmapOrImg, 0, 0, dstW, dstH);

    let mime = 'image/webp';
    if (out === 'jpeg' || out === 'jpg') mime = 'image/jpeg';
    else if (out === 'png') mime = 'image/png';

    const blob = await new Promise((resolve)=>{
      canvas.toBlob((b)=>resolve(b), mime, q);
    });
    if(!blob) throw new Error('本地压缩失败（toBlob 返回空）');

    const outExt = (out === 'jpg') ? 'jpeg' : out;
    const outName = (file.name || 'image').replace(/\.[^\.]+$/,'') + '.' + outExt;
    const outFile = new File([blob], outName, { type: mime });
    return outFile;
  }

  async function runPool(items, limit, worker){
    const queue = items.slice();
    const results = [];
    const runners = new Array(Math.max(1, limit)).fill(0).map(async ()=>{
      while(queue.length){
        const it = queue.shift();
        try{ results.push(await worker(it)); }catch(e){ results.push(null); }
      }
    });
    await Promise.all(runners);
    return results;
  }

  function useServer(){
    // 登录后允许手动切换服务器模式；未登录强制本地
    const selected = (els.mode && els.mode.value) ? els.mode.value : 'local';
    return !!state.token && selected === 'server';
  }

  function readInt(el, def){
    const v = (el && typeof el.value === 'string') ? el.value.trim() : '';
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  }

  function localOptions(){
    const concurrency = Math.max(1, Math.min(4, readInt(els.concurrency, 2)));
    const maxW = Math.max(0, readInt(els.maxW, 1920));
    const maxH = Math.max(0, readInt(els.maxH, 1080));
    const alpha = (els.alpha && els.alpha.value) ? els.alpha.value : 'white';
    return { concurrency, maxW, maxH, alpha };
  }

  // 未登录时锁定 UI：禁止选择服务器模式
  function syncModeUI(){
    if(!els.mode) return;
    if(!state.token){
      els.mode.value = 'local';
      const optServer = Array.from(els.mode.options||[]).find(o=>o.value==='server');
      if(optServer) optServer.disabled = true;
    }else{
      const optServer = Array.from(els.mode.options||[]).find(o=>o.value==='server');
      if(optServer) optServer.disabled = false;
    }
  }
  if(els.mode){
  els.mode.addEventListener('change', ()=>{
    syncModeUI();
    // 若已选择图片，切换模式后需重新上传，避免本地/服务器混用
    if(state.images && state.images.length){
      state.images = [];
      state.selectedImg.clear();
      renderImages && renderImages();
      msg(els.uploadMsg, '已切换运行模式，请重新选择并上传图片', false);
    }
  });
}

  if (els.btnUpload) els.btnUpload.addEventListener('click', async ()=>{
    let files = els.fileInput?.files;
    if(!files || files.length===0){
      try{ els.fileInput && els.fileInput.click(); }catch(_){ }
      msg(els.uploadMsg, '请先选择图片', true);
      return;
    }

    // 未登录：本地入队，不上传服务器
    if(!useServer()){
      try{
        const added = [];
        var hasVideo = false;
        for(const f of files){
          const id = local.nextImageId++;
          const ext = extFromMimeOrName(f);
          const hash8 = await md5Hex(f);
          const video = isVideoFile(f);
          if(video) hasVideo = true;
          const item = { id, filename: f.name || ('image_'+id), file_ext: ext, file_size: f.size, md5_hash: hash8, file: f, media_type: video ? 'video' : 'image' };
          local.images.set(id, item);
          added.push(item);
        }
        state.images.push(...added.map(x=>({ id:x.id, filename:x.filename, file_ext:x.file_ext, file_size:x.file_size, md5_hash:x.md5_hash, media_type: x.media_type })));
        if (els.fileInput) els.fileInput.value = '';
        renderImages();
        updateVideoUI();
        var msg2 = `本地添加成功：${added.length} 个文件（未登录：不上传服务器）`;
        if(hasVideo) msg2 += '。视频压缩需要服务器模式，请登录后使用。';
        msg(els.uploadMsg, msg2);
      }catch(e){
        msg(els.uploadMsg, '本地添加失败：'+(e.message||e), true);
      }
      return;
    }

    // 已登录：走服务器上传
    const fd = new FormData();
    var hasVideoFile = false;
    for(const f of files){
      fd.append('files', f);
      if(isVideoFile(f)) hasVideoFile = true;
    }

    // Use XHR for video uploads to show progress
    if(hasVideoFile && els.uploadProgressWrap && els.uploadProgress){
      try{
        await new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();
          xhr.open('POST', API_BASE + '/api/v1/images/upload');
          xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.upload.onprogress = function(e){
            if(e.lengthComputable){
              var pct = Math.round(e.loaded / e.total * 100);
              els.uploadProgress.value = pct;
              els.uploadProgressText.textContent = pct + '%';
            }
          };
          xhr.onload = function(){
            if(xhr.status === 401 || xhr.status === 403){
              onAuthExpired();
              reject(new Error('未登录或登录已过期'));
              return;
            }
            if(!xhr.responseText){
              reject(new Error('服务器返回空响应'));
              return;
            }
            try{
              var data = JSON.parse(xhr.responseText);
              if(xhr.status >= 400){
                reject(new Error(data.detail || ('HTTP ' + xhr.status)));
                return;
              }
              resolve(data);
            }catch(e){
              reject(new Error('响应解析失败'));
            }
          };
          xhr.onerror = function(){ reject(new Error('网络错误')); };
          xhr.upload.onloadstart = function(){
            els.uploadProgressWrap.classList.remove('hidden');
            els.uploadProgressWrap.style.display = '';
            els.uploadProgress.value = 0;
            els.uploadProgressText.textContent = '0%';
          };
          xhr.upload.onload = function(){
            setTimeout(function(){
              els.uploadProgressWrap.classList.add('hidden');
              els.uploadProgressWrap.style.display = 'none';
            }, 1500);
          };
          xhr.send(fd);
        }).then(function(res){
          var items = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
          if (!items.length) { msg(els.uploadMsg, '服务器未返回上传记录', true); return; }
          state.images.push(...items.map(function(x){ return { id: x.image_id, filename: x.filename, file_ext: x.file_ext, file_size: x.file_size, md5_hash: x.md5_hash, media_type: x.media_type || 'image' }; }));
          state.lastBatch = items.map(function(x){ return x.image_id; });
          if (els.fileInput) els.fileInput.value = '';
          renderImages();
          updateVideoUI();
          msg(els.uploadMsg, '上传成功：' + items.length + ' 个文件');
        });
      }catch(e){
        msg(els.uploadMsg, '上传失败：'+e.message, true);
        console.error('upload error', e);
        els.uploadProgressWrap.classList.add('hidden');
      }
      return;
    }

    // No video: standard fetch upload
    try{
      const res = await api('/api/v1/images/upload', { method: 'POST', body: fd });
      const items = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
      if (!items.length) { msg(els.uploadMsg, '服务器未返回上传记录：' + JSON.stringify(res), true); return; }
      state.images.push(...items.map(function(x){ return { id: x.image_id, filename: x.filename, file_ext: x.file_ext, file_size: x.file_size, md5_hash: x.md5_hash, media_type: x.media_type || 'image' }; }));
      state.lastBatch = items.map(function(x){ return x.image_id; });
      if (els.fileInput) els.fileInput.value = '';
      renderImages();
      updateVideoUI();
      msg(els.uploadMsg, '上传成功：' + items.length + ' 个文件');
    }catch(e){ msg(els.uploadMsg, '上传失败：'+e.message, true); console.error('upload error', e); }
  });

  let __compressing = false;
  if (els.btnCompress) els.btnCompress.addEventListener('click', async ()=>{
    if (__compressing) {
      msg(els.uploadMsg, '已经有一批压缩任务在提交或处理中，请稍候片刻。', false);
      return;
    }
    const fmt = els.fmt?.value || 'webp';
    const quality = parseInt(els.q?.value || '80',10) || 80;
    if(state.images.length===0){ msg(els.uploadMsg, '尚无图片', true); return; }

    const allIds = Array.from(new Set(state.images.map(x=>x.id)));
    if (!allIds.length) { msg(els.uploadMsg, '没有需要压缩的文件', true); return; }

    // Separate image and video IDs for server mode
    var imageIds = [];
    var videoIds = [];
    for(var i = 0; i < allIds.length; i++){
      var id = allIds[i];
      var img = state.images.find(function(x){ return x.id === id; });
      if(img && img.media_type === 'video'){
        videoIds.push(id);
      } else {
        imageIds.push(id);
      }
    }

    // 未登录：本地压缩（不走服务器）
    if(!useServer()){
      // Warn if videos are present in local mode
      if(videoIds.length > 0){
        msg(els.uploadMsg, '视频压缩需要服务器模式，已跳过 ' + videoIds.length + ' 个视频文件。请登录后使用服务器模式。', true);
        if(imageIds.length === 0) return;
      }
      try{
        var newTasks = [];
        for(var j = 0; j < imageIds.length; j++){
          var id2 = imageIds[j];
          var img2 = local.images.get(id2);
          if(!img2 || !img2.file) continue;

          var taskId = local.nextTaskId++;
          var task = {
            id: taskId,
            image_id: id2,
            format: fmt,
            quality: quality,
            media_type: 'image',
            status: 0,
            compressed_size: 0,
            _local: true,
            _blob: null,
            _filename: '',
          };
          local.tasks.set(taskId, task);
          newTasks.push(task);
        }
        state.tasks = newTasks.concat(state.tasks);
        renderTasks();

        const opts = localOptions();
        msg(els.uploadMsg, '本地压缩开始：' + newTasks.length + ' 张（并发数：' + opts.concurrency + '）');

        await runPool(newTasks, opts.concurrency, async function(t){
          try{
            var img3 = local.images.get(t.image_id);
            var outFile = await compressLocal(img3.file, fmt, quality, {
              maxW: opts.maxW,
              maxH: opts.maxH,
              alpha: opts.alpha
            });
            t._blob = outFile;
            t._filename = outFile.name;
            t.compressed_size = outFile.size;
            t.status = 1;
          }catch(err){
            console.error('local compress failed', err);
            t.status = 2;
          }
          renderTasks();
          return t;
        });

        msg(els.uploadMsg, '本地压缩完成，可在任务列表中下载');
      }catch(e){
        msg(els.uploadMsg, '本地压缩失败：'+(e.message||e), true);
      }
      return;
    }

    // 已登录：走服务器压缩
    var btnOldText = els.btnCompress ? (els.btnCompress.textContent || '') : '';
    try{
      __compressing = true;
      if (els.btnCompress) { els.btnCompress.disabled = true; els.btnCompress.textContent = '提交中...'; }

      var allTasks = [];

      // Compress images via batch-compress
      if(imageIds.length > 0){
        msg(els.uploadMsg, '正在提交图片压缩任务...', false);
        var imgTasks = await api('/api/v1/images/batch-compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_ids: imageIds, format: fmt, quality: quality })
        });
        if(Array.isArray(imgTasks) && imgTasks.length){
          allTasks = allTasks.concat(imgTasks);
        }
      }

      // Compress videos via video-compress
      if(videoIds.length > 0){
        var codec = (els.videoCodec && els.videoCodec.value) ? els.videoCodec.value : 'h264';
        msg(els.uploadMsg, '正在提交视频压缩任务（' + codec + '）...', false);
        var vidTasks = await api('/api/v1/images/video-compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_ids: videoIds, codec: codec, quality: quality })
        });
        if(Array.isArray(vidTasks) && vidTasks.length){
          allTasks = allTasks.concat(vidTasks);
        }
      }

      if(allTasks.length){
        state.tasks = allTasks.concat(state.tasks);
        state.lastBatch = [];
        renderTasks();
        msg(els.uploadMsg, '已提交压缩：' + allTasks.length + ' 个任务（处理中，可在下方查看进度）');
        ensurePolling();
      }else{
        msg(els.uploadMsg, '压缩提交失败或服务器未返回任务', true);
      }
    }catch(e){
      msg(els.uploadMsg, '提交压缩失败：'+(e.message||e), true);
      console.error('compress failed', e);
    }finally{
      __compressing = false;
      if (els.btnCompress) { els.btnCompress.disabled = false; els.btnCompress.textContent = btnOldText || '全部压缩'; }
    }
  });

  // 自定义确认弹窗（替代浏览器原生 confirm）
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

  if (els.btnClear) els.btnClear.addEventListener('click', async ()=>{
    var completed = state.tasks.filter(function(t){ return t.status === 1; });
    if (!completed.length) { msg(els.uploadMsg, '没有已完成的记录', false); return; }
    var ok = await showConfirm({
      icon: '🗑️', title: '清除完成记录',
      message: '即将清除所有标记为"完成"的压缩记录。',
      detail: '共 '+completed.length+' 条已完成记录将被清除。此操作不可撤销。',
      confirmText: '确认清除', danger: true
    });
    if (!ok) return;

    const isServerMode = !!state.token && useServer();

    // 本地模式或未登录：仅在前端清理完成任务
    if (!isServerMode) {
      const before = state.tasks.length;
      state.tasks = state.tasks.filter(t => t.status !== 1);
      renderTasks();
      msg(els.uploadMsg, `已在本地清除完成记录：${before - state.tasks.length} 条（本地模式）`);
      return;
    }

    try{
      const res = await api('/api/v1/images/tasks?status=1', { method: 'DELETE' });
      state.tasks = state.tasks.filter(t => t.status !== 1);
      renderTasks();
      msg(els.uploadMsg, `已清除记录：${(res && res.deleted) || 0} 条`);
    }catch(e){ msg(els.uploadMsg, '清除失败：' + e.message, true); }
  });

  if (els.btnSelectPreview) els.btnSelectPreview.addEventListener('click', ()=>{
    state.previewSelectMode = !state.previewSelectMode;
    msg(els.uploadMsg, state.previewSelectMode ? '选择预览模式已开启' : '选择预览模式已关闭');
  });

  function renderImages(){
    if (!els.tblImages) return;
    els.tblImages.innerHTML = state.images.map(function(x){
      var mediaBadge = (x.media_type === 'video') ? ' <span class="badge" style="background:#fef3c7;color:#d97706">视频</span>' : '';
      return '<tr data-id="' + x.id + '">' +
        '<td style="width:36px"><input type="checkbox" class="chk-img" data-id="' + x.id + '" ' + (state.selectedImg.has(x.id)?'checked':'') + '></td>' +
        '<td>' + x.id + '</td><td>' + escapeHtml(x.filename) + mediaBadge + '</td><td>' + escapeHtml(x.file_ext) + '</td><td>' + escapeHtml(formatSize(x.file_size)) + '</td><td><span class="muted">' + escapeHtml((x.md5_hash||'').slice(0,8)) + '...</span></td>' +
      '</tr>';
    }).join('');
    syncChkAll();
  }

  function renderTasks() {
    if (!els.tblTasks) return;
    els.tblTasks.innerHTML = state.tasks.map(function(t){
        const isLocal = !!t._local;
        const st = (t.status === 1) ? '<span class="ok">完成</span>'
          : (t.status === 2 ? '<span class="fail">失败</span>'
          : (t.status === 3 ? '<span class="badge" style="background:#f3f4f6;color:#64748b">已取消</span>'
          : '<span class="badge">排队/处理中</span>'));
        const size = t.compressed_size ? formatSize(t.compressed_size) : '-';
        const isVideo = t.media_type === 'video';
        const mediaBadge = isVideo ? ' <span class="badge" style="background:#fef3c7;color:#d97706">视频</span>' : '';
        const preview = t.status === 1 && !isVideo ? '<a href="javascript:;" data-action="preview" data-id="' + t.id + '">预览</a>' : '';
        const download = t.status === 1 ? '<a href="javascript:;" data-action="download" data-id="' + t.id + '">下载</a>' : '';
        const del = '<a href="javascript:;" data-action="delete" data-id="' + t.id + '">删除</a>';
        const ops = [preview, download, del].filter(Boolean).join(' / ');
        const titleAttr = (t.status === 2 && t.error_message) ? ' title="' + escapeAttr(t.error_message) + '"' : '';
        return '<tr data-id="' + t.id + '"' + (isLocal ? ' style="opacity:0.8" title="本地任务（未登录）"' : titleAttr) + '>' +
          '<td>' + t.id + mediaBadge + (isLocal ? ' <span style="font-size:10px;color:#9ca3af">(本地)</span>' : '') + '</td>' +
          '<td>' + t.image_id + '</td><td>' + escapeHtml(t.format) + '</td><td>' + escapeHtml(t.quality) + '</td><td>' + st + '</td><td>' + escapeHtml(size) + '</td><td>' + ops + '</td>' +
        '</tr>';
    }).join('');
  }

  function syncChkAll(){
    if(!els.chkAllImg) return;
    const allIds = state.images.map(x=>x.id);
    if(allIds.length===0){ els.chkAllImg.checked=false; els.chkAllImg.indeterminate=false; return; }
    const all = allIds.every(id=>state.selectedImg.has(id));
    const some = state.selectedImg.size>0 && !all;
    els.chkAllImg.checked = all;
    els.chkAllImg.indeterminate = some;
  }

  // 选择框事件
  if(els.chkAllImg){
    els.chkAllImg.addEventListener('change', ()=>{
      if(els.chkAllImg.checked){ state.images.forEach(x=>state.selectedImg.add(x.id)); }
      else{ state.selectedImg.clear(); }
      renderImages();
    });
  }
  if(els.tblImages){
    els.tblImages.addEventListener('change', (e)=>{
      const cb = e.target.closest('input.chk-img');
      if(!cb) return;
      const id = Number(cb.dataset.id);
      if(cb.checked){ state.selectedImg.add(id); } else { state.selectedImg.delete(id); }
      syncChkAll();
    });
  }

  async function deleteImagesByIds(ids){
    if(!ids || !ids.length){ msg(els.uploadMsg,'请先勾选要删除的图片', true); return; }

    var selectedImgs = state.images.filter(function(x){ return ids.indexOf(x.id) !== -1; });
    var names = selectedImgs.slice(0, 10).map(function(x){ return escapeHtml(x.filename); }).join('<br>');
    if (selectedImgs.length > 10) names += '<br>……等共 ' + selectedImgs.length + ' 张图片';
    var ok = await showConfirm({
      icon: '🗑️', title: '删除选中图片',
      message: '即将删除选中的 ' + ids.length + ' 张图片及其关联的压缩记录。',
      detail: names,
      confirmText: '确认删除', danger: true
    });
    if (!ok) return;

    const isServerMode = !!state.token && useServer();

    // 未登录或本地模式：只在前端删除，不调用后端
    if (!isServerMode) {
      const set = new Set(ids);
      state.images = state.images.filter(x=>!set.has(x.id));
      state.selectedImg.clear();
      renderImages();
      state.tasks = state.tasks.filter(t=>!set.has(t.image_id));
      renderTasks();
      msg(els.uploadMsg, `已在本地删除图片：${ids.length} 张（本地模式）`);
      return;
    }

    try{
      const res = await api('/api/v1/images?ids=' + ids.join(','), { method:'DELETE' });
      const set = new Set(ids);
      state.images = state.images.filter(x=>!set.has(x.id));
      state.selectedImg.clear();
      renderImages();
      state.tasks = state.tasks.filter(t=>!set.has(t.image_id));
      renderTasks();
      ensurePolling();
      msg(els.uploadMsg, `已删除图片：${(res && res.deleted) || ids.length} 张`);
    }catch(e){ msg(els.uploadMsg, '删除失败：'+(e.message||e), true); }
  }

  // 删除选中/全部
  if(els.btnDelSelected){ els.btnDelSelected.addEventListener('click', ()=>{ deleteImagesByIds(Array.from(state.selectedImg)); }); }
  if(els.btnDelAll){ els.btnDelAll.addEventListener('click', async ()=>{
    if(!state.images.length){ msg(els.uploadMsg,'当前没有已上传图片', true); return; }

    var names = state.images.slice(0, 10).map(function(x){ return escapeHtml(x.filename); }).join('<br>');
    if (state.images.length > 10) names += '<br>……等共 ' + state.images.length + ' 张图片';
    var ok = await showConfirm({
      icon: '⚠️', title: '删除全部图片',
      message: '即将删除当前账号的 全部 ' + state.images.length + ' 张 已上传图片及其压缩记录。',
      detail: names,
      confirmText: '全部删除', danger: true
    });
    if (!ok) return;

    const isServerMode = !!state.token && useServer();

    // 本地模式或未登录：只清空前端状态
    if (!isServerMode) {
      state.images = []; state.selectedImg.clear(); renderImages();
      state.tasks = []; renderTasks();
      msg(els.uploadMsg,'已在本地删除全部图片及其压缩记录（本地模式）');
      return;
    }

    try{
      const res = await api('/api/v1/images?all=1', { method:'DELETE' });
      state.images = []; state.selectedImg.clear(); renderImages();
      // 清空任务列表，交给轮询再拉取（后端也会删除关联任务）
      state.tasks = []; renderTasks(); ensurePolling();
      msg(els.uploadMsg, `已删除全部图片（${(res && res.deleted) || 0} 张）`);
    }catch(e){ msg(els.uploadMsg,'删除失败：'+(e.message||e), true); }
  }); }

  function formatSize(n){
    if(n>1024*1024) return (n/1024/1024).toFixed(2)+' MB';
    if(n>1024) return (n/1024).toFixed(1)+' KB';
    return n+ ' B';
  }

  async function pollOnce(){
    // 本地模式不轮询服务器任务（否则会把本地压缩任务列表覆盖掉）
    try{
      const mv = (els.mode && els.mode.value) ? String(els.mode.value) : '';
      if(mv.includes('local')){ return; }
    }catch(e){}

    if(!state.token) return; // 未登录不轮询
    try{
      const data = await api('/api/v1/images/tasks?page=1&page_size=50');
      if(Array.isArray(data.items)){
        state.tasks = data.items;
        renderTasks();
      }
    }catch(e){
      console.warn('poll tasks failed', e.message);
      const now = Date.now();
      if (els.uploadMsg && (!state.lastPollErrAt || now - state.lastPollErrAt > 4000)) {
        msg(els.uploadMsg, '轮询任务失败：' + (e.message || e), true);
        state.lastPollErrAt = now;
      }
    }
  }

  function ensurePolling(){
    if(state.pollTimer) clearInterval(state.pollTimer);
    var hasActive = state.tasks && state.tasks.some(function(t){ return t.status === 0; });
    var interval = hasActive ? 3000 : 10000;
    state.pollTimer = setInterval(pollOnce, interval);
  }

  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ if(state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer=null; } }
    else if(state.token) ensurePolling();
  });

  // 二进制请求（带上 Token），返回 { blob, filename }
  async function fetchBinary(path){
    const res = await fetch(API_BASE + path, { headers: { ...authHeaders() } });
    if(res.status===401 || res.status===403){
      // 登录接口本身返回 401 表示账号密码错，不应跳转
      if(path.includes('/auth/login')){
        const j = await res.json();
        throw new Error(j.detail || '用户名或密码错误');
      }
      onAuthExpired();
      throw new Error('未登录或登录已过期');
    }
    if(!res.ok){
      let detail='';
      try{ const j=await res.json(); detail=j.detail||JSON.stringify(j); }catch{ try{ detail=await res.text(); }catch{} }
      throw new Error(detail || (res.status+':'+res.statusText));
    }
    const cd = res.headers.get('content-disposition') || '';
    let filename = '';
    const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
    if(m){ filename = decodeURIComponent(m[1]||m[2]||''); }
    const blob = await res.blob();
    return { blob, filename };
  }

  async function doPreview(id){
    // 本地任务：直接预览本地 Blob
    const t = state.tasks.find(x=>x.id===id);
    if(t && t._local && t._blob){
      const url = URL.createObjectURL(t._blob);
      window.open(url, '_blank');
      setTimeout(()=>URL.revokeObjectURL(url), 10_000);
      return;
    }

    const { blob } = await fetchBinary(`/api/v1/images/preview/${id}`);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(()=>URL.revokeObjectURL(url), 10_000);
  }

  async function doDownload(id){
    // 本地任务：直接下载本地 Blob
    const t = state.tasks.find(x=>x.id===id);
    if(t && t._local && t._blob){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(t._blob);
      a.download = t._filename || (`local_${id}`);
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return;
    }

    const { blob, filename } = await fetchBinary(`/api/v1/images/download/${id}`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || (`image_${id}`);
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  try{ window.downloadById = doDownload; window.previewById = doPreview; }catch(_){ }

  if (els.tblTasks) {
    els.tblTasks.addEventListener('click', async (e)=>{
      const a = e.target.closest('a[data-action]');
      if (a) {
        e.preventDefault();
        e.stopPropagation();

        const id = Number(a.dataset.id);
        const act = a.dataset.action;

        if (act === 'preview') {
          try { await doPreview(id); } catch (err) { msg(els.uploadMsg, '预览失败：' + (err.message||err), true); }
        } else if (act === 'download') {
          try { await doDownload(id); } catch (err) { msg(els.uploadMsg, '下载失败：' + (err.message||err), true); }
        } else if (act === 'delete') {
          if (!confirm('确认删除该压缩记录？')) return;

          const isServerMode = !!state.token && useServer();

          // 本地模式或未登录：仅在前端删除
          if (!isServerMode) {
            state.tasks = state.tasks.filter(t => t.id !== id);
            renderTasks();
            msg(els.uploadMsg, '已在本地删除该压缩记录（本地模式）');
            return;
          }

          try {
            await api(`/api/v1/images/tasks/${id}`, { method: 'DELETE' });
            state.tasks = state.tasks.filter(t => t.id !== id);
            renderTasks();
            msg(els.uploadMsg, '已删除记录');
          } catch(err) { msg(els.uploadMsg, '删除失败：' + err.message, true); }
        }
        return;
      }

      if (state.previewSelectMode) {
        const tr = e.target.closest('tr[data-id]');
        if (tr) {
          const id = Number(tr.dataset.id);
          const task = state.tasks.find(t=>t.id===id);
          if (task && task.status===1) {
            try { await doPreview(id); } catch(err){ msg(els.uploadMsg,'预览失败：'+(err.message||err), true); }
          } else {
            msg(els.uploadMsg, '该任务尚未完成，无法预览', true);
          }
        }
      }
    });
  }

  (function(){
    const navLogin = document.getElementById('nav-login');
    const navWrap = document.getElementById('nav-user-wrap');
    const navMenu = document.getElementById('nav-user-menu');
    const navViewProfile = document.getElementById('nav-view-profile');
    const navLogoutMenu = document.getElementById('nav-logout-menu');
    const navAdmin = document.getElementById('nav-admin');

    function isFile(){ return location.protocol === 'file:'; }
    function goto(p){ location.href = isFile()? ('./'+p) : ('/'+p); }

    async function applyUserNav(){
      if(!navLogin || !navWrap) return;
      if(!state.token){
        navLogin.textContent = '登录';
        if(navMenu) navMenu.style.display = 'none';
        if(navWrap){ navWrap.classList.remove('logged-in'); navWrap.classList.remove('open'); }
        navLogin.onclick = ()=>goto('login.html');
        return;
      }
      try{
        const meRes = await fetch(API_BASE + '/api/v1/auth/me-admin', { headers: authHeaders() });
        if(!meRes.ok) throw 0;
        const me = await meRes.json();
        const name = me.nickname || me.username;
        navLogin.textContent = name || '我的';

        // 管理员：点击昵称跳转到管理后台
        if (me && me.is_admin) {
          navLogin.onclick = (e)=>{ e.preventDefault(); goto('admin.html'); };
        } else {
          navLogin.onclick = (e)=>{ e.preventDefault(); goto('profile.html'); };
        }

        if(navViewProfile){ navViewProfile.onclick = ()=>goto('profile.html'); }

        // 管理后台入口：仅管理员可见
        if (navAdmin) {
          if (me && me.is_admin) {
            navAdmin.style.display = 'block';
            navAdmin.onclick = ()=>goto('admin.html');
          } else {
            navAdmin.style.display = 'none';
          }
        }
        if(navLogoutMenu){ navLogoutMenu.onclick = ()=>{ setToken(''); if(state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer=null; } goto('login.html'); }; }
        if(navWrap && navMenu){
          navWrap.classList.add('logged-in');
          navWrap.classList.remove('open');
          const open = ()=> navWrap.classList.add('open');
          const close = ()=> navWrap.classList.remove('open');
          // 不要在这里覆盖 navLogin.onclick（管理员需要跳转 admin.html）
          navWrap.addEventListener('mouseenter', open);
          document.addEventListener('click', (ev)=>{ if(!navWrap.contains(ev.target)) close(); });
        }
      }catch(_){
        setToken('');
        if(state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer=null; }
        if(navMenu) navMenu.style.display='none';
        navLogin.textContent = '登录';
        navLogin.onclick = ()=>goto('login.html');
      }
    }
    applyUserNav();
  })();

  // 让 UI 在首次加载时就同步"服务器模式是否可选"
  try{ syncModeUI(); }catch(_){ }

  uiRefresh();
  if(state.token){
      pollOnce();
      ensurePolling();
  }
})();
