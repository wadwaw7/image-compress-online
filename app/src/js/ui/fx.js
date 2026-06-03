/* ===== Cyberpunk Ambient Effects =====
   Neon floating particles, energy lines, subtle glitch */

let canvas, ctx, particles = [];
let animId = null;
let running = false;

const CONFIG = {
  particleCount: 60,
  neonColors: ['#00f0ff', '#ff00ff', '#39ff14', '#4466ff', '#ffe600'],
  speedRange: [0.2, 0.8],
  sizeRange: [1, 3],
  opacityRange: [0.15, 0.5],
  connectionDistance: 150
};

class Particle {
  constructor(w, h) {
    this.reset(w, h, true);
  }

  reset(w, h, initial) {
    this.x = Math.random() * w;
    this.y = initial ? Math.random() * h : (Math.random() < 0.5 ? -10 : h + 10);
    const [minS, maxS] = CONFIG.speedRange;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = -Math.random() * (maxS - minS) - minS; // Float upward
    const [minSz, maxSz] = CONFIG.sizeRange;
    this.size = minSz + Math.random() * (maxSz - minSz);
    const [minO, maxO] = CONFIG.opacityRange;
    this.opacity = minO + Math.random() * (maxO - minO);
    this.color = CONFIG.neonColors[Math.floor(Math.random() * CONFIG.neonColors.length)];
    this.twinkle = Math.random() * Math.PI * 2;
  }

  update(w, h) {
    this.x += this.vx;
    this.y += this.vy;
    this.twinkle += 0.03;

    // Wrap around
    if (this.y < -20) { this.y = h + 20; this.x = Math.random() * w; }
    if (this.y > h + 20) { this.y = -20; this.x = Math.random() * w; }
    if (this.x < -20) this.x = w + 20;
    if (this.x > w + 20) this.x = -20;
  }

  draw(ctx) {
    const alpha = this.opacity * (0.6 + 0.4 * Math.sin(this.twinkle));
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    // Glow
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = alpha * 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function initParticles(w, h) {
  particles = [];
  for (let i = 0; i < CONFIG.particleCount; i++) {
    particles.push(new Particle(w, h));
  }
}

function drawConnections(ctx) {
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONFIG.connectionDistance) {
        const alpha = (1 - dist / CONFIG.connectionDistance) * 0.06;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = '#00f0ff';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}

function animate() {
  if (!running) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles.forEach(p => {
    p.update(canvas.width, canvas.height);
    p.draw(ctx);
  });

  drawConnections(ctx);
  animId = requestAnimationFrame(animate);
}

/**
 * Start ambient effects
 */
export function initFX() {
  // Don't run on very low-end devices or if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 480) {
    CONFIG.particleCount = 30; // Fewer particles on mobile
    CONFIG.connectionDistance = 80;
  }

  canvas = document.createElement('canvas');
  canvas.id = 'fx-canvas';
  document.body.appendChild(canvas);

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  ctx = canvas.getContext('2d');
  initParticles(canvas.width, canvas.height);
  running = true;
  animate();
}

/**
 * Stop ambient effects
 */
export function stopFX() {
  running = false;
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
  particles = [];
}

export default { initFX, stopFX };
