// Headless review screenshots of the geometry, without the baked lighting (index.html?nobake).
// Usage: node tools/shots.mjs [pose ...]   (no names → every pose). Writes review/<name>.png.
// Needs Playwright with Chromium (npx playwright install chromium) and python3 for the static server.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000;

// name: [x, z, feet, yaw, pitch]  (yaw 0 = north, +π/2 west, π south, −π/2 east; pitch > 0 looks up)
const POSES = {
  kitchen_corner: [32.5, 7.5, 10, 0.85, 0.15],
  kitchen_west: [33, 5, 10, 1.5708, 0.1],
  kitchen_east: [31, 6, 10, -0.9, 0.15],
  passthrough_dining: [37.5, 17.5, 10, 0.05, 0.1],
  passthrough_kitchen: [38, 5.5, 10, 3.1416, 0.05],
  fridge_doorway: [35, 16, 10, 0.75, 0.05],
  living_rail_end: [33, 27, 10, 1.87, -0.1],
  rear_rail: [40, 3, 10, 0.2, -0.2],
  front_stair_foot: [24, 16, 0, 3.1416, 0.25],
  living_lights: [36, 21, 10, 3.1416, 0.45],
  bath1_vanity: [23.5, 9, 10, 1.5708, 0.3],
  stair_closet: [26.8, 20.2, 0, 3.1416, 0.1],
  garage: [8, 20, 0, 0.6, 0.1],
};

async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch {
    const require = createRequire(execSync('npm root -g').toString().trim() + '/');
    return require('playwright').chromium;
  }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(POSES);
for (const n of names) if (!POSES[n]) { console.error(`unknown pose: ${n}`); process.exit(1); }

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
const chromium = await loadChromium();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  for (let i = 0; ; i++) {
    try { await page.goto(`http://localhost:${PORT}/index.html?nobake`); break; } catch (e) {
      if (i > 20) throw e;
      await new Promise(r => setTimeout(r, 250));
    }
  }
  await page.waitForFunction(() => window.__house, null, { timeout: 180000 });
  await page.evaluate(() => window.__house.begin());
  await page.addStyleTag({ content: 'body > :not(#view) { display: none !important; }' });   // just the 3D view
  mkdirSync(path.join(root, 'review'), { recursive: true });
  for (const n of names) {
    await page.evaluate(p => window.__house.snap(...p), POSES[n]);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, 'review', n + '.png') });
    console.log('review/' + n + '.png');
  }
} finally {
  await browser.close();
  server.kill();
}
