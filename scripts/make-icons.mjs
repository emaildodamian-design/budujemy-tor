// Renders the app icons (PNG) from inline SVG with the pre-installed Chromium.
// Run once after changing the artwork: `npm run icons`. The PNGs are committed.
// Requires Playwright (e.g. `npx playwright` or a global install).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

// `inset` shrinks the artwork for the maskable icon's safe zone.
const art = (inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${inset ? 0 : 112}" fill="#f6efe2"/>
  <g transform="translate(${inset} ${inset}) scale(${(512 - 2 * inset) / 512})">
    <rect x="56" y="56" width="400" height="400" rx="80" fill="#d5eac0"/>
    <path d="M140 456 V300 A120 120 0 0 1 260 180 H456" fill="none" stroke="#b98b61" stroke-width="120" stroke-dasharray="22 26"/>
    <path d="M104 456 V300 A156 156 0 0 1 260 144 H456 M176 456 V300 A84 84 0 0 1 260 216 H456" fill="none" stroke="#6b7280" stroke-width="14" stroke-linecap="round"/>
    <g transform="translate(300 180)">
      <rect x="-80" y="-50" width="160" height="100" rx="28" fill="#d8573e"/>
      <rect x="-80" y="-50" width="62" height="100" rx="24" fill="#a8412f"/>
      <rect x="-66" y="-32" width="34" height="64" rx="12" fill="#ffe6a8"/>
      <circle cx="28" cy="0" r="22" fill="#3f3f46"/>
      <circle cx="68" cy="0" r="14" fill="#ffe066"/>
    </g>
    <circle cx="150" cy="120" r="22" fill="#fff" opacity="0.85"/>
    <circle cx="200" cy="100" r="16" fill="#fff" opacity="0.7"/>
  </g>
</svg>`;

const icons = [
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  ['public/icons/icon-maskable-512.png', 512, 56],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, inset] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${art(inset).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
  console.log('wrote', file);
}
await browser.close();
