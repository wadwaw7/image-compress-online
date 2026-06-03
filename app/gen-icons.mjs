/* ===== Icon Generator (using sharp) ===== */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'src', 'public', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

const SIZES = [48, 72, 96, 128, 144, 152, 192, 384, 512];

function makeSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const sw = size * 0.04;
  const blur = size * 0.06;

  // Hexagon
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
  }
  const hexPts = pts.join(' ');

  // Lightning bolt
  const b = r * 0.3;
  const bolt = [
    cx - b, cy + b * 0.5,
    cx + b * 0.1, cy - b * 0.05,
    cx - b * 0.08, cy + b * 0.05,
    cx + b * 0.4, cy - b * 0.6,
    cx - b * 0.03, cy + b * 0.1,
    cx + b * 0.25, cy + b * 0.1
  ].join(' ');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">',
    '<defs>',
    '<radialGradient id="g" cx="50%" cy="50%" r="60%">',
    '<stop offset="0%" stop-color="rgba(0,240,255,0.25)"/>',
    '<stop offset="60%" stop-color="rgba(255,0,255,0.08)"/>',
    '<stop offset="100%" stop-color="transparent"/>',
    '</radialGradient>',
    '<linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#00f0ff"/>',
    '<stop offset="100%" stop-color="#ff00ff"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="' + size + '" height="' + size + '" fill="#06060f"/>',
    '<rect width="' + size + '" height="' + size + '" fill="url(#g)"/>',
    '<polygon points="' + hexPts + '" fill="url(#hg)" opacity="0.85" stroke="#00f0ff" stroke-width="' + sw + '"/>',
    '<polygon points="' + bolt + '" fill="#06060f"/>',
    '</svg>'
  ].join('');
}

async function generateIcon(size) {
  const svg = makeSvg(size);
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const outPath = join(OUT, 'icon-' + size + '.png');
  writeFileSync(outPath, buf);
  console.log('  OK icon-' + size + '.png');
}

(async () => {
  console.log('Generating cyberpunk icons...');
  for (const size of SIZES) {
    await generateIcon(size);
  }
  console.log('\nDone! ' + SIZES.length + ' icons generated in ' + OUT);
})();
