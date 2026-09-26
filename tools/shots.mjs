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

// name: [x, z, feet, yaw, pitch, eye?]  (yaw 0 = north, +π/2 west, π south, −π/2 east; pitch > 0 looks up;
// eye: camera height above the feet, for the exterior views from the street and from above)
const POSES = {
  kitchen_corner: [32.5, 7.5, 10, 0.85, 0.15],
  kitchen_west: [33, 5, 10, 1.5708, 0.1],
  kitchen_east: [31, 6, 10, -0.9, 0.15],
  kitchen_counters: [32, 6.2, 10, 1.0, -0.5],
  sink_front: [33, 3.2, 10, 0.1, -0.1],
  sink_side: [29.9, 2.9, 10, -1.3, -0.25],
  passthrough_dining: [37.5, 17.5, 10, 0.05, 0.1],
  passthrough_trim: [41.6, 17.8, 10, 0.22, 0.08],
  passthrough_kitchen: [38, 5.5, 10, 3.1416, 0.05],
  fridge_doorway: [35, 16, 10, 0.75, 0.05],
  dining_table: [36.5, 20.5, 10, 0.1, -0.15],
  kitchen_table: [39.2, 7.8, 10, -0.9, -0.3],
  dining_chair_back: [40.2, 19.2, 10, 0.76, -0.5],
  dining_chair_side: [34.2, 18.6, 10, 0.1, -0.6],
  living_rail_end: [33, 27, 10, 1.87, -0.1],
  foyer_rail_base: [26.2, 20.1, 9.93, 3.56, -0.6],
  rear_wall_top: [40, -5.6, 5, 3.1416, 0.3],
  rear_rail: [40, 3, 10, 0.2, -0.2],
  half_newel_front: [30.2, 27.6, 10, 2.56, -0.3],
  half_newel_rear: [40.3, 2.3, 10, -0.705, -0.35],
  front_stair_foot: [24, 16, 0, 3.1416, 0.25],
  front_newel: [22.6, 14.6, 0, -2.6, -0.05],
  front_stair_top: [27.5, 17.3, 10, 2.39, -0.35],
  front_door_switch: [25.3, 26.4, 6.875, 3.1416, -0.1],
  lower_hall_rail: [23.0, 16.2, 0, -2.45, -0.25],
  living_lights: [36, 21, 10, 3.1416, 0.45],
  bath1_vanity: [23.5, 9, 10, 1.5708, 0.3],
  bath1_well: [22.9, 7.2, 10, 3.1416, 0.75],
  bath1_ceiling: [23.2, 10.6, 10, 0, 0.5],
  bath1_vanity_wall: [23.7, 9.2, 10, 1.5708, -0.12],
  bath1_tub: [24.0, 5.6, 10, 0.12, 0.02],
  bath1_tub_west: [25.8, 3.55, 10, 1.02, 0.05],
  bath1_niche: [24.4, 3.55, 10, -0.95, 0.05],
  bath1_door: [22.8, 6.2, 10, 3.1416, 0.0],
  rear_track: [39, 4.5, 10, 0, 0.3],
  rear_down_flight: [40.2, 1.4, 0, -0.08, -0.6],
  rear_up_top: [37, 0.9, 10, 0, -0.6],
  stair_closet: [26.8, 20.2, 0, 3.1416, 0.1],
  stair_closet_west: [28.0, 23.4, 0, 1.5708, -0.6],
  stair_closet_back: [26.6, 28.2, 0, 0, 0.15],
  garage: [8, 20, 0, 0.6, 0.1],
  garage_bench: [7.5, 9.2, 0, 0.35, 0.05],
  garage_door: [12.5, 17.5, 0, -1.5708, 0.05],
  base_fridge_pier: [34.5, 15.8, 10, 0.6, -0.45],
  base_play_opening: [34, 17, 0, 1.5708, -0.3],
  base_hall_corner: [12.5, 14, 10, -2.33, -0.6],
  ext_street: [17.5, 77, 0, 0.0, -0.17, 8.2],
  ext_above: [33.4, 34.4, 0, 0.61, -1.35, 88],   // (the walkthrough clamps pitch to ±1.35: offset back to centre the lot)
  ext_entry: [22, 52, 0, 0.12, 0.12],
  ext_garage: [8, 44, 0, 0.1, 0.05],
  ext_rear: [30, -30, 0, 3.0, 0.2],
  // round 5 (FIXES_ROUND5.md, Finish)
  r5_1A_garage: [10, 45, 0, 0, 0.12],
  r5_1B_soffit: [10, 29.3, 0, 0, 1.0],
  r5_1C_se: [58, 52, 0, 0.65, 0.15],
  r5_1D_west: [-10, 45, 0, -0.72, 0.2],
  r5_1E_front: [22, 75, 0, 0, 0.25],
  r5_1E2_rear: [22, -30, 0, 3.1416, 0.35],
  r5_1G_br2: [5, 20, 10, 3.1416, -0.1],
  r5_1H_br3: [15, 21, 10, 3.1416, -0.1],
  r5_1I_living: [37, 24, 10, 3.1416, 0],
  r5_1J_garage: [10, 12, 0, 3.1416, 0],
  r5_1J_playroom: [37, 25, 0, 3.1416, 0],
  r5_1K_foyer: [24.8, 28.9, 6.875, 0, 0],
  r5_2a_east: [53, 9.5, 0, 1.5708, 0.55],   // (nudged back and up from 52, 12, 0.35 to frame the upper windows)
  r5_2a_bath1: [24.35, 3.5, 10, 0, 0.15],
  r5_2b_front: [10.4, 52, 0, 0, 0.22],
  r5_2b_br2: [6.15, 23.5, 10, 3.1416, 0.1],
  r5_2b_br3: [14.95, 23.5, 10, 3.1416, 0.1],
  r5_2c_out: [36.7, 47, 0, 0, 0.12],
  r5_2c_in: [36.7, 27, 0, 3.1416, 0],
  r5_2c_seam: [34.8, 33.2, 0, 3.1416, -0.15],
  r5_2d_bow: [37.35, 50, 0, 0, 0.3],
  r5_2d_bow_in: [37.35, 29, 10, 3.1416, 0],
  r5_2d_door: [24.8, 45, 0, 0, 0.2],
  r5_3a_flight: [25, 60, 0, 0, 0.08],
  r5_3a_steps: [12, 52, 0, -0.9, 0.05],
  r5_3a_landing: [24.8, 34, 6.875, 3.1416, -0.2],
  r5_3b_west: [12, 38, 0, -1.5708, 0.15],
  r5_3b_porch: [24.8, 50, 0, 0, 0.3],
  r5_3b_side: [40, 56, 0, 0.62, 0.1],
  r5_3b_w1: [24.8, 33, 6.875, 1.5708, 0],
  r5_4a_top: [33, 42, 35, 0, -1.55],
  r5_4a_wall: [38, 55, 0, 0.3, -0.05],
  r5_4b_planters: [24.5, 38, 6.875, -2.75, -0.75],   // (nudged from yaw π, pitch -0.4 to frame the planters)
  r5_street: [22.5, 72, 0, 0, 0.12],
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
    await page.evaluate(p => {
      const h = window.__house;
      h.player.eyeH = p[5];
      h.snap(...p.slice(0, 5));
      if (p[5] !== undefined) h.player.camY = p[2] + p[5];
    }, POSES[n]);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, 'review', n + '.png') });
    console.log('review/' + n + '.png');
  }
} finally {
  await browser.close();
  server.kill();
}
