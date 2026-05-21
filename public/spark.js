// 鼠标拖尾效果 (桌面端) — 日间暖金 / 夜间冷蓝
(function(){
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

  var cvs = document.createElement('canvas');
  var ctx = cvs.getContext('2d');
  cvs.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9997;';

  var DPR = window.devicePixelRatio || 1;
  var W, H;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cvs.width  = W * DPR;
    cvs.height = H * DPR;
  }

  // 颜色方案
  var lightScheme = {
    glow:  'rgba(255,185,60,0.28)',
    glowW: 'rgba(255,150,30,0.10)',
    dot:   '#ffb83a',
  };
  var darkScheme = {
    glow:  'rgba(100,180,255,0.35)',
    glowW: 'rgba(70,140,235,0.14)',
    dot:   '#6db3f2',
  };

  function getScheme(){
    var mode = document.documentElement.getAttribute('data-theme');
    if (!mode) {
      try { mode = localStorage.getItem('themeMode'); } catch(e){}
    }
    return mode === 'dark' ? darkScheme : lightScheme;
  }

  // 历史位置环形缓冲区（保留最近 30 个点）
  var MAX = 30;
  var hist = [];
  var mx = -100, my = -100;
  var active = false;

  // 粒子
  var particles = [];

  document.addEventListener('mousemove', function(e){
    mx = e.clientX;
    my = e.clientY;
    if (!active) { active = true; return; }
  });

  document.addEventListener('mouseleave', function(){
    active = false;
    // 让拖尾自然消散
  });

  function frame(){
    requestAnimationFrame(frame);

    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 每帧读取主题，确保实时响应
    var s = getScheme();

    // 记录历史位置
    if (active && mx >= 0) {
      hist.push({ x: mx, y: my, t: Date.now() });
      if (hist.length > MAX) hist.shift();
    }

    // 清理过期历史点（超过 300ms）
    var now = Date.now();
    while (hist.length && now - hist[0].t > 300) hist.shift();

    if (!hist.length) { ctx.restore(); return; }

    var last = hist[hist.length - 1];

    // 生成粒子（在最新位置附近）
    if (active) {
      for (var i = 0; i < 3; i++) {
        particles.push({
          x: last.x + (Math.random() - 0.5) * 6,
          y: last.y + (Math.random() - 0.5) * 6,
          vy: -0.5 - Math.random() * 1.5,
          vx: (Math.random() - 0.5) * 1.5,
          life: 1,
          decay: 0.02 + Math.random() * 0.03,
          r: 1 + Math.random() * 2.5,
        });
      }
    }

    // 绘制拖尾连线（按时间远近分层）
    if (hist.length >= 2) {
      // 外层宽光晕
      ctx.beginPath();
      ctx.moveTo(hist[0].x, hist[0].y);
      for (var i = 1; i < hist.length; i++) {
        ctx.lineTo(hist[i].x, hist[i].y);
      }
      ctx.strokeStyle = s.glowW;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // 内层细光晕
      ctx.strokeStyle = s.glow;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 绘制历史点（越旧越小越淡）
    for (var i = 0; i < hist.length; i++) {
      var age = (now - hist[i].t) / 300; // 0~1
      var alpha = (1 - age) * 0.6;
      var r = 3 * (1 - age);
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.dot;
      ctx.beginPath();
      ctx.arc(hist[i].x, hist[i].y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制粒子
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life * 0.6;
      ctx.fillStyle = s.dot;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function start(){
    document.body.appendChild(cvs);
    resize();
    window.addEventListener('resize', resize);
    frame();
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();

// 邮箱保护：防止 Cloudflare Email Obfuscation 生成 /cdn-cgi/l/email-protection 链接
(function(){
  function decodeEmails(){
    var els = document.querySelectorAll('.email-protect');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var u = el.getAttribute('data-user') || '';
      var d = el.getAttribute('data-domain') || '';
      var m = u + '@' + d;
      el.textContent = m;
      if (el.tagName === 'A') {
        el.href = 'mailto:' + m;
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decodeEmails);
  } else {
    decodeEmails();
  }
})();
