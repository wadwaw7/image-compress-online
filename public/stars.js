// 动态星空背景 — 仅深色模式显示
(function(){
  var cvs = document.createElement('canvas');
  cvs.id = 'stars-canvas';
  var ctx = cvs.getContext('2d');
  cvs.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W, H;
  var stars = [];
  var brightStars = [];
  var shootingStars = [];
  var STAR_COUNT = 200;
  var BRIGHT_COUNT = 8;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cvs.width = W * DPR;
    cvs.height = H * DPR;
  }

  function createStars() {
    stars = [];
    for (var i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.015 + 0.003,
        phase: Math.random() * Math.PI * 2,
        baseAlpha: Math.random() * 0.4 + 0.4,
        hue: Math.random() < 0.15 ? (Math.random() * 60 + 200) : 0,
        driftX: (Math.random() - 0.5) * 0.03,
        driftY: (Math.random() - 0.5) * 0.015,
      });
    }

    brightStars = [];
    for (var i = 0; i < BRIGHT_COUNT; i++) {
      brightStars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 1.2,
        speed: Math.random() * 0.01 + 0.004,
        phase: Math.random() * Math.PI * 2,
        baseAlpha: Math.random() * 0.3 + 0.55,
        driftX: (Math.random() - 0.5) * 0.02,
        driftY: (Math.random() - 0.5) * 0.01,
      });
    }
  }

  function spawnShootingStar() {
    if (Math.random() < 0.002) {
      var fromLeft = Math.random() < 0.5;
      shootingStars.push({
        x: fromLeft ? Math.random() * W * 0.3 : W - Math.random() * W * 0.3,
        y: Math.random() * H * 0.4,
        vx: (Math.random() * 3 + 3) * (fromLeft ? 1 : -1),
        vy: Math.random() * 1.5 + 1,
        life: 1,
        decay: Math.random() * 0.01 + 0.012,
        len: Math.random() * 100 + 50,
      });
    }
  }

  function isDark() {
    var mode = document.documentElement.getAttribute('data-theme');
    if (!mode) {
      try { mode = localStorage.getItem('themeMode'); } catch(e) {}
    }
    return mode === 'dark';
  }

  function drawStar(ctx, x, y, r, alpha, hue) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hue ? 'hsla(' + hue + ', 70%, 85%, ' + alpha + ')' : 'rgba(255,255,255,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGlowStar(ctx, x, y, r, alpha) {
    var glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    glow.addColorStop(0, 'rgba(170,200,255,' + (alpha * 0.5) + ')');
    glow.addColorStop(0.4, 'rgba(130,165,255,' + (alpha * 0.15) + ')');
    glow.addColorStop(1, 'rgba(130,165,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e8eeff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame() {
    requestAnimationFrame(frame);

    if (!isDark()) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      return;
    }

    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.phase += s.speed;
      s.x += s.driftX;
      s.y += s.driftY;
      if (s.x < -10) s.x = W + 10;
      if (s.x > W + 10) s.x = -10;
      if (s.y < -10) s.y = H + 10;
      if (s.y > H + 10) s.y = -10;

      var alpha = s.baseAlpha + Math.sin(s.phase) * 0.25;
      alpha = Math.max(0.12, Math.min(1, alpha));
      drawStar(ctx, s.x, s.y, s.r, alpha, s.hue);
    }

    for (var i = 0; i < brightStars.length; i++) {
      var bs = brightStars[i];
      bs.phase += bs.speed;
      bs.x += bs.driftX;
      bs.y += bs.driftY;
      if (bs.x < -10) bs.x = W + 10;
      if (bs.x > W + 10) bs.x = -10;
      if (bs.y < -10) bs.y = H + 10;
      if (bs.y > H + 10) bs.y = -10;

      var alpha = bs.baseAlpha + Math.sin(bs.phase) * 0.3;
      alpha = Math.max(0.15, Math.min(1, alpha));
      drawGlowStar(ctx, bs.x, bs.y, bs.r, alpha);
    }

    spawnShootingStar();
    for (var i = shootingStars.length - 1; i >= 0; i--) {
      var ss = shootingStars[i];
      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life -= ss.decay;

      if (ss.life <= 0) { shootingStars.splice(i, 1); continue; }

      var tailX = ss.x - ss.vx * ss.len / 4;
      var tailY = ss.y - ss.vy * ss.len / 4;
      var grad = ctx.createLinearGradient(ss.x, ss.y, tailX, tailY);
      grad.addColorStop(0, 'rgba(255,255,255,' + ss.life + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = ss.life;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function start() {
    document.body.insertBefore(cvs, document.body.firstChild);
    resize();
    createStars();
    window.addEventListener('resize', function() {
      resize();
      createStars();
    });
    frame();
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();
