/* ===== App Icon Generator =====
   Run: node gen-icons.js
   Generates cyberpunk-styled PNG icons for PWA */
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'src', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

const SIZES = [48, 72, 96, 128, 144, 152, 192, 384, 512];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Deep background
  ctx.fillStyle = '#06060f';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;

  // Outer glow ring
  const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.3);
  glow.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
  glow.addColorStop(0.5, 'rgba(255, 0, 255, 0.1)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Hexagon shape
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Gradient fill
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#00f0ff');
  grad.addColorStop(1, '#ff00ff');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.85;
  ctx.fill();

  // Border
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = size * 0.04;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = size * 0.08;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Lightning bolt
  ctx.fillStyle = '#06060f';
  ctx.beginPath();
  const b = size * 0.12;
  ctx.moveTo(-b * 1.2, b * 2);
  ctx.lineTo(b * 0.8, -b * 0.2);
  ctx.lineTo(-b * 0.4, b * 0.2);
  ctx.lineTo(b * 1.2, -b * 1.8);
  ctx.lineTo(b * 0.2, -b * 0.4);
  ctx.lineTo(b * 1.2, b * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  return canvas;
}

SIZES.forEach((size) => {
  const canvas = drawIcon(size);
  const buf = canvas.toBuffer('image/png');
  const outPath = join(OUT, `icon-${size}.png`);
  writeFileSync(outPath, buf);
  console.log(`  ✓ icon-${size}.png`);
});

console.log(`\n⚡ Generated ${SIZES.length} icons in ${OUT}`);
