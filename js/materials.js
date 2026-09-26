// Material library. Every surface texture comes from the owner's photos (see tools/make_textures.py);
// everything else is a flat colour picked from the photos.
import * as THREE from 'three';

const T = 'textures/';
// key → definition. repeat: feet covered by one texture tile (world-UV materials).
const DEFS = {
  wood: { map: 'wood_floor.jpg', normalMap: 'wood_floor_normal.jpg', roughnessMap: 'wood_floor_rough.jpg', repeat: 6, roughness: 1, normalScale: 0.6 },
  tileMarble: { map: 'tile_marble.jpg', normalMap: 'tile_marble_normal.jpg', roughnessMap: 'tile_marble_rough.jpg', repeat: 4, roughness: 0.9 },
  tileWall: { map: 'tile_marble.jpg', normalMap: 'tile_marble_normal.jpg', roughnessMap: 'tile_marble_rough.jpg', repeat: 4, roughness: 0.6 },
  tileKitchen: { map: 'tile_kitchen.jpg', normalMap: 'tile_kitchen_normal.jpg', roughnessMap: 'tile_kitchen_rough.jpg', repeat: 4, roughness: 0.9 },
  tileGrey: { map: 'tile_kitchen.jpg', normalMap: 'tile_kitchen_normal.jpg', roughnessMap: 'tile_kitchen_rough.jpg', repeat: 4, roughness: 0.9, color: '#c3c6ca' },   // stair closet porcelain
  tileLanding: { map: 'tile_landing.jpg', normalMap: 'tile_landing_normal.jpg', roughnessMap: 'tile_landing_rough.jpg', repeat: 3, roughness: 1 },
  tileBath2: { map: 'tile_bath2.jpg', normalMap: 'tile_bath2_normal.jpg', roughnessMap: 'tile_bath2_rough.jpg', repeat: 4, roughness: 1 },
  carpetBeige: { map: 'carpet_beige.jpg', normalMap: 'carpet_beige_normal.jpg', repeat: 2, roughness: 1, normalScale: 0.8 },
  rugGrey: { map: 'rug_grey.jpg', normalMap: 'rug_grey_normal.jpg', repeat: 2, roughness: 1, normalScale: 1 },
  // area rugs upstairs: a dusty-blue traditional pattern (drawn), laid once across each rug
  rugDining: { color: '#ffffff', roughness: 1, procedural: 'rugPattern', albedo: [0.33, 0.37, 0.42] },
  rugLiving: { color: '#ffffff', roughness: 1, procedural: 'rugPattern', albedo: [0.33, 0.37, 0.42] },
  brocade: { color: '#ffffff', roughness: 0.8, procedural: 'brocade', repeat: 0.9, albedo: [0.13, 0.07, 0.035] },   // dining chair seats
  concrete: { map: 'concrete.jpg', repeat: 10, roughness: 0.85 },
  stone: { map: 'concrete.jpg', repeat: 4, roughness: 0.9, color: '#d8cfc0' },
  granite: { map: 'granite_bath1.jpg', repeat: 2.2, roughness: 0.18 },
  oakTread: { map: 'stair_tread.jpg', roughness: 0.35 },
  frontDoor: { map: 'front_door.jpg', roughness: 0.4, emissiveMap: 'front_door.jpg', emissive: '#ffffff', emissiveIntensity: 0.0 },
  washerFront: { map: 'washer_front.jpg', roughness: 0.3 },
  dryerFront: { map: 'dryer_front.jpg', roughness: 0.3 },

  trim: { color: '#f4f2ec', roughness: 0.55 },
  ceiling: { color: '#f3f1ec', roughness: 0.95 },
  vinyl: { color: '#f5f4f0', roughness: 0.55 },
  blind: { color: '#f1efe9', roughness: 0.6 },
  doorWhite: { color: '#f2f0ea', roughness: 0.6 },
  paintedWood: { color: '#f3f1ec', roughness: 0.5 },
  cabinet: { color: '#ece5d4', roughness: 0.45 },
  counter: { color: '#ebe5d8', roughness: 0.25 },
  counterBlack: { color: '#1d1d1f', roughness: 0.3 },     // kitchen top between the range and the fridge
  pull: { color: '#e8d9a6', roughness: 0.35 },             // butter-yellow cabinet loop pulls
  cultured: { color: '#ece3cf', roughness: 0.18 },
  oak: { map: 'stair_tread.jpg', roughness: 0.35 },          // handrails: same stained oak as the treads (photo 51)
  porcelain: { color: '#f7f7f5', roughness: 0.1 },
  enamelWhite: { color: '#f1f1ef', roughness: 0.3 },
  stainless: { color: '#c9cbcd', roughness: 0.3, metalness: 1 },
  chrome: { color: '#eeeeee', roughness: 0.08, metalness: 1 },
  nickel: { color: '#cfccc5', roughness: 0.3, metalness: 1 },
  brass: { color: '#c7a45e', roughness: 0.3, metalness: 1 },
  bronze: { color: '#4b3627', roughness: 0.45, metalness: 0.7 },
  castIron: { color: '#1b1b1b', roughness: 0.6 },
  galvanized: { color: '#a9adb0', roughness: 0.45, metalness: 0.8 },
  blackGlass: { color: '#070809', roughness: 0.06 },
  tvBody: { color: '#141414', roughness: 0.4 },
  ceramic: { color: '#e9e3d6', roughness: 0.3 },
  curtain: { color: '#8f949a', roughness: 0.9, side: 'double' },
  pegboard: { color: '#ffffff', roughness: 0.7, procedural: 'pegboard', repeat: 1, albedo: [0.7, 0.7, 0.68] },   // white, 1" holes
  garageDoor: { color: '#efeee9', roughness: 0.5 },
  grass: { color: '#6d8a47', roughness: 1, procedural: 'grass', repeat: 12 },
  asphalt: { color: '#4d4e50', roughness: 0.95 },
  roof: { color: '#ffffff', roughness: 0.9, procedural: 'shingles', repeat: 6, albedo: [0.07, 0.07, 0.075] },
  siding: { color: '#ffffff', roughness: 0.7, procedural: 'siding', repeat: 4, albedo: [0.62, 0.58, 0.5] },
  soffit: { color: '#f2f0ea', roughness: 0.6 },
  plate: { color: '#f3f1ea', roughness: 0.35 },
  // light-emitting / translucent parts (not baked; glow at runtime)
  lampGlow: { color: '#fff7e8', emissive: '#fff4e0', emissiveIntensity: 6, glow: true },
  alabaster: { color: '#f3dcae', emissive: '#ffd9a0', emissiveIntensity: 2.2, glow: true, side: 'double' },
  amberGlass: { color: '#e9c48a', emissive: '#ffcf8a', emissiveIntensity: 2.0, glow: true, side: 'double' },
  shade: { color: '#efe4cf', emissive: '#ffe4b8', emissiveIntensity: 0.7, glow: true, side: 'double' },
  frosted: { color: '#e9eef0', emissive: '#f2f6f8', emissiveIntensity: 0.9, glow: true },
  tvRachel: { color: '#000000', roughness: 0.12, emissive: '#ffffff', emissiveIntensity: 1.1, glow: true, procedural: 'msRachel' },   // playroom TV, switched on
};

function parse(key) {
  if (DEFS[key]) return DEFS[key];
  const [kind, hex] = key.split(':');
  if (kind === 'paint') return { color: hex, roughness: 0.9 };
  if (kind === 'fabric') return { color: hex, roughness: 0.95, normalMap: 'carpet_beige_normal.jpg', repeat: 0.7, normalScale: 0.35 };
  if (kind === 'art') return { color: '#ffffff', roughness: 0.55, procedural: key, albedo: [0.45, 0.45, 0.45], alphaTest: ['nautical', 'dreamcatcher'].includes(hex) ? 0.5 : 0 };
  if (kind === 'stain') {
    // oak grain from the stair treads (photo 51), re-tinted to the furniture's stain colour
    const c = new THREE.Color(hex), tread = [0.135, 0.058, 0.034];
    return { color: new THREE.Color(c.r / tread[0], c.g / tread[1], c.b / tread[2]), map: 'stair_tread.jpg', repeat: 3, roughness: 0.45, albedo: [c.r, c.g, c.b] };
  }
  console.warn('unknown material', key);
  return { color: '#ff00ff', roughness: 1 };
}

// ---------------------------------------------------------------- loading ----
const cache = new Map();
let maxAniso = 8;
export function setAnisotropy(a) { maxAniso = a; }

function loadTex(file, srgb) {
  const k = file + (srgb ? '|s' : '|l');
  if (!cache.has(k)) {
    const tex = new THREE.TextureLoader().load(T + file);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = maxAniso;
    cache.set(k, tex);
  }
  return cache.get(k);
}
// Exterior surfaces have no photos, so they are drawn procedurally.
function proceduralTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === 'grass') {
    g.fillStyle = '#6d8a47'; g.fillRect(0, 0, 512, 512);
    const cols = ['#5d7a3b', '#7e9b55', '#688540', '#86a35c', '#56722f'];
    for (let i = 0; i < 60000; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = 0.5; g.fillRect(rnd() * 512, rnd() * 512, 1.5, 3); }
  } else if (kind === 'siding') {
    // 4' tile: seven 7" vinyl laps with a shadow line under each
    g.fillStyle = '#ddd5c5'; g.fillRect(0, 0, 512, 512);
    const lap = 512 / 7;
    for (let i = 0; i < 7; i++) {
      const y = i * lap;
      const grd = g.createLinearGradient(0, y, 0, y + lap);
      grd.addColorStop(0, '#cfc6b5'); grd.addColorStop(0.12, '#e4ddcf'); grd.addColorStop(1, '#d8d0c0');
      g.fillStyle = grd; g.fillRect(0, y, 512, lap);
      g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(0, y, 512, 2);
    }
    g.globalAlpha = 0.05;
    for (let i = 0; i < 4000; i++) { g.fillStyle = rnd() < 0.5 ? '#fff' : '#9a917f'; g.fillRect(rnd() * 512, rnd() * 512, 8 + rnd() * 30, 1); }
  } else if (kind.startsWith('art:')) {
    const t = new THREE.CanvasTexture(drawArt(c, g, kind.slice(4), rnd));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    cache.set(kind, t);
    return t;
  } else if (kind === 'rugPattern') {
    c.width = 1024; c.height = 768;
    const W = c.width, H = c.height, R0 = (a, b) => a + (b - a) * rnd();
    const field = '#7f97ad', cream = '#ebe3d2', navy = '#2f4260', rust = '#b98a72', sage = '#9fb0a6';
    g.fillStyle = cream; g.fillRect(0, 0, W, H);
    const band = (m, col) => { g.fillStyle = col; g.fillRect(m, m, W - 2 * m, H - 2 * m); };
    band(18, navy); band(26, cream); band(84, rust); band(92, navy); band(100, field);
    // border motifs: small lozenges and dots in the cream band
    g.fillStyle = navy;
    for (let x = 60; x < W - 40; x += 44) for (const y of [55, H - 55]) { g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x + 11, y); g.lineTo(x, y + 13); g.lineTo(x - 11, y); g.fill(); }
    for (let y = 60; y < H - 40; y += 44) for (const x of [55, W - 55]) { g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x + 11, y); g.lineTo(x, y + 13); g.lineTo(x - 11, y); g.fill(); }
    // field: soft abrash streaks and scattered floral sprigs
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '30,45,70'},0.05)`; g.fillRect(100, R0(100, H - 100), W - 200, R0(6, 30)); }
    const sprig = (x, y, s, col) => { g.fillStyle = col; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.7, s * 0.35, a, 0, Math.PI * 2); g.fill(); } g.fillStyle = cream; g.beginPath(); g.arc(x, y, s * 0.35, 0, 7); g.fill(); };
    for (let i = 0; i < 60; i++) { const x = R0(130, W - 130), y = R0(130, H - 130); if (Math.hypot((x - W / 2) / 1.3, y - H / 2) < 190) continue; sprig(x, y, R0(7, 12), [cream, sage, navy][i % 3]); }
    // central medallion and corner quarter-medallions
    const medallion = (x, y, r) => {
      for (const [k, col] of [[1, navy], [0.82, cream], [0.66, rust], [0.5, field], [0.34, cream], [0.18, navy]]) {
        g.fillStyle = col; g.beginPath();
        for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, rr = r * k * (1 + 0.12 * Math.cos(a * 8)); g.lineTo(x + Math.cos(a) * rr * 1.35, y + Math.sin(a) * rr); }
        g.fill();
      }
    };
    medallion(W / 2, H / 2, 150);
    g.save(); g.beginPath(); g.rect(100, 100, W - 200, H - 200); g.clip();
    for (const [x, y] of [[100, 100], [W - 100, 100], [100, H - 100], [W - 100, H - 100]]) medallion(x, y, 110);
    g.restore();
    // wool texture
    for (let i = 0; i < 26000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    cache.set(kind, t);
    return t;
  } else if (kind === 'msRachel') {
    // title card for the playroom TV: the show's name in big rounded letters on a sunny backdrop
    c.width = 1024; c.height = 564;
    const W = c.width, H = c.height;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#fff3a8'); bg.addColorStop(0.55, '#ffd7e6'); bg.addColorStop(1, '#c9e9ff');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const dots = ['#ff7eb6', '#ffb347', '#6fd3c7', '#9b8cff', '#6fb6ff'];
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = 0.35; g.fillStyle = dots[i % dots.length];
      g.beginPath(); g.arc(rnd() * W, rnd() * H, 6 + rnd() * 16, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    const word = 'Ms Rachel', cols = ['#ff4f9a', '#ff9f1c', null, '#1fb5a7', '#7a5cff', '#2f86ff', '#ff4f9a', '#ff9f1c', '#1fb5a7'];
    g.font = '800 196px "Arial Rounded MT Bold", "Comic Sans MS", "Trebuchet MS", sans-serif';
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    const widths = [...word].map(ch => g.measureText(ch).width), total = widths.reduce((a, v) => a + v, 0);
    let x = (W - total) / 2;
    [...word].forEach((ch, i) => {
      const y = H * 0.47 + (i % 2 ? -8 : 8);
      if (cols[i]) {
        g.save(); g.shadowColor = 'rgba(80,40,90,0.35)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
        g.strokeStyle = '#ffffff'; g.lineWidth = 26; g.strokeText(ch, x, y); g.restore();
        g.fillStyle = cols[i]; g.fillText(ch, x, y);
      }
      x += widths[i];
    });
    // a small heart under the name
    const hx = W / 2, hy = H * 0.8, r = 26;
    g.fillStyle = '#ff4f9a'; g.strokeStyle = '#ffffff'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(hx, hy + r * 1.1);
    g.bezierCurveTo(hx - r * 2.2, hy - r * 0.2, hx - r * 1.1, hy - r * 1.9, hx, hy - r * 0.7);
    g.bezierCurveTo(hx + r * 1.1, hy - r * 1.9, hx + r * 2.2, hy - r * 0.2, hx, hy + r * 1.1);
    g.stroke(); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    cache.set(kind, t);
    return t;
  } else if (kind === 'pegboard') {
    // white hardboard with holes on a 1" grid (one tile = 1 ft)
    g.fillStyle = '#f1f0ec'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#6d6a64';
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { g.beginPath(); g.arc((i + 0.5) * 512 / 12, (j + 0.5) * 512 / 12, 4, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'brocade') {
    // bronze-brown brocade: muted gold paisley swirls in offset rows (tiles seamlessly)
    g.fillStyle = '#5c3b24'; g.fillRect(0, 0, 512, 512);
    g.globalAlpha = 0.08;
    for (let x = 0; x < 512; x += 4) { g.fillStyle = x % 8 ? '#3e2716' : '#7a5636'; g.fillRect(x, 0, 2, 512); }
    const paisley = (cx, cy, rot, sc) => {
      g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(sc, sc);
      g.beginPath(); g.moveTo(0, 58); g.bezierCurveTo(-52, 40, -46, -38, 4, -50); g.bezierCurveTo(44, -58, 50, -18, 22, -6);
      g.bezierCurveTo(8, 0, 12, 16, 26, 12); g.bezierCurveTo(30, 36, 18, 52, 0, 58);
      g.globalAlpha = 0.75; g.fillStyle = '#9c7a4a'; g.fill();
      g.globalAlpha = 0.9; g.lineWidth = 4; g.strokeStyle = '#5c3b24';
      g.beginPath(); g.moveTo(0, 40); g.bezierCurveTo(-30, 26, -28, -26, 4, -32); g.bezierCurveTo(26, -36, 30, -14, 14, -10); g.stroke();
      g.beginPath(); g.arc(-4, 8, 9, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.7; g.fillStyle = '#9c7a4a';
      for (let i = 0; i < 7; i++) { const a = -0.4 + i * 0.5; g.beginPath(); g.arc(Math.cos(a) * 74, 12 + Math.sin(a) * 70, 3.5, 0, Math.PI * 2); g.fill(); }
      g.restore();
    };
    for (const [cx, cy, rot] of [[128, 128, 0.5], [384, 384, 0.5], [384, 128, -2.6], [128, 384, -2.6]]) {
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) paisley(cx + ox, cy + oy, rot, 0.95);
    }
  } else if (kind === 'shingles') {
    // architectural asphalt shingles, 5" exposure
    g.fillStyle = '#39383a'; g.fillRect(0, 0, 512, 512);
    const row = 512 / 14.4;
    for (let r = 0; r < 15; r++) {
      let x = -rnd() * 60;
      while (x < 512) {
        const w = 25 + rnd() * 45;
        const v = 40 + rnd() * 30 | 0;
        g.fillStyle = `rgb(${v},${v - 2},${v + 2})`;
        g.fillRect(x, r * row, w - 2, row - 3);
        x += w;
      }
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, r * row + row - 3, 512, 3);
    }
    g.globalAlpha = 0.25;
    for (let i = 0; i < 30000; i++) { g.fillStyle = rnd() < 0.5 ? '#6b6a6c' : '#1e1d1f'; g.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  cache.set(kind, t);
  return t;
}

// Generic wall art, drawn in the spirit of what hangs in the house (photos 1-50): soft abstracts,
// black-and-white landscapes, seascapes, nursery prints. Nothing personal is reproduced.
function drawArt(c, g, style, rnd) {
  const W = 512, H = 512;
  c.width = W; c.height = H;
  const R = (a, b) => a + (b - a) * rnd();
  const grad = (stops, x0 = 0, y0 = 0, x1 = 0, y1 = H) => { const q = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => q.addColorStop(o, col)); return q; };
  const fill = col => { g.fillStyle = col; g.fillRect(0, 0, W, H); };
  const anchor = (x, y, s, col) => {
    g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(0, -78, 14, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -64); g.lineTo(0, 78); g.stroke();
    g.beginPath(); g.moveTo(-40, -38); g.lineTo(40, -38); g.stroke();
    g.beginPath(); g.arc(0, 18, 62, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 60, 42); g.lineTo(sx * 72, 26); g.lineTo(sx * 46, 32); g.fill(); }
    g.restore();
  };
  const whale = (x, y, s, col) => {
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = col;
    g.beginPath(); g.moveTo(-90, 10); g.bezierCurveTo(-90, -45, 20, -60, 60, -20); g.bezierCurveTo(75, -5, 85, 0, 100, -30);
    g.bezierCurveTo(105, -10, 110, 5, 120, 10); g.bezierCurveTo(105, 12, 95, 14, 85, 22); g.bezierCurveTo(40, 55, -60, 60, -90, 10); g.fill();
    g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round';
    for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(-40, -52); g.quadraticCurveTo(-40 + a * 30, -80, -40 + a * 45, -95); g.stroke(); }
    g.fillStyle = '#f4f2ec'; g.beginPath(); g.arc(-55, -5, 5, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  const heart = (x, y, s, col) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.8, y - s * 1.3, x, y - s * 0.4);
    g.bezierCurveTo(x + s * 0.8, y - s * 1.3, x + s * 1.6, y - s * 0.1, x, y + s * 0.9); g.fill();
  };
  const sail = (x, y, s, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.55, y); g.lineTo(x, y); g.fill(); g.beginPath(); g.moveTo(x - 2, y - s * 0.8); g.lineTo(x - s * 0.35, y); g.lineTo(x - 2, y); g.fill(); };
  if (style === 'abstract') {
    fill(grad([[0, '#e9eaec'], [1, '#cfd3d9']]));
    for (let i = 0; i < 90; i++) {
      const cols = ['#ffffff', '#b9bec7', '#9aa1ad', '#d9d2e3', '#c8ced8', '#7d8594'];
      g.strokeStyle = cols[i % cols.length]; g.globalAlpha = R(0.12, 0.45); g.lineWidth = R(4, 40); g.lineCap = 'round';
      const y0 = R(-50, H + 50);
      g.beginPath(); g.moveTo(-20, y0); g.bezierCurveTo(W * 0.3, y0 + R(-160, 160), W * 0.6, y0 + R(-160, 160), W + 20, y0 + R(-100, 100)); g.stroke();
    }
  } else if (style === 'flower') {
    fill('#fbf8f4');
    g.strokeStyle = '#6f9a5f'; g.lineWidth = 8; g.beginPath(); g.moveTo(256, 470); g.quadraticCurveTo(240, 350, 256, 240); g.stroke();
    g.fillStyle = '#7fae6c'; g.beginPath(); g.ellipse(215, 370, 45, 16, -0.6, 0, Math.PI * 2); g.fill();
    for (const [dx, col] of [[-38, '#f3a3bf'], [38, '#f3a3bf'], [0, '#ee86a9']]) { g.fillStyle = col; g.beginPath(); g.ellipse(256 + dx, 190, 42, 78, dx / 120, 0, Math.PI * 2); g.fill(); }
  } else if (style.startsWith('bw')) {
    // black-and-white landscape: sky, layered hills, still water
    const v = style.length > 2 ? +style[2] : 1;
    fill(grad([[0, '#d8d8d8'], [0.55, '#a9a9a9'], [1, '#2f2f2f']]));
    for (let k = 0; k < 4; k++) {
      const base = H * (0.45 + k * 0.08), sh = 190 - k * 35;
      g.fillStyle = `rgb(${sh},${sh},${sh})`; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, base - 40 * Math.sin(x / (60 + v * 17 + k * 23) + v + k) - R(0, 10));
      g.lineTo(W, H); g.fill();
    }
    g.fillStyle = 'rgba(40,40,40,0.8)';
    for (let i = 0; i < 12; i++) { const x = R(0, W), y = H * 0.75 + R(-10, 20), h = R(40, 110); g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.18, y); g.lineTo(x - h * 0.18, y); g.fill(); }
  } else if (style === 'seascape' || style === 'beach' || style === 'panorama') {
    const [sky, sea, low] = style === 'seascape' ? [['#9aa3ad', '#dfe3e6'], '#5f6f7d', '#3d4a55'] : style === 'beach' ? [['#dfe8ee', '#f3f1ea'], '#9fbccb', '#e9dcc3'] : [['#e7dcc6', '#d4c3a3'], '#a58f6b', '#6d5a40'];
    fill(grad([[0, sky[0]], [0.55, sky[1]], [0.56, sea], [1, low]]));
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const y = H * R(0.58, 0.98); g.strokeStyle = `rgba(255,255,255,${R(0.1, 0.5)})`; g.lineWidth = R(2, 7);
      g.beginPath(); const x = R(-60, W); g.moveTo(x, y); g.quadraticCurveTo(x + 60, y - R(4, 14), x + R(90, 200), y); g.stroke();
    }
    if (style === 'beach') { g.fillStyle = '#e9dcc3'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.84); g.quadraticCurveTo(W * 0.5, H * 0.78, W, H * 0.88); g.lineTo(W, H); g.fill(); }
    if (style === 'panorama') { g.fillStyle = '#5a4832'; for (let x = 0; x < W; x += 22) g.fillRect(x, H * 0.46 - R(10, 60), 16, R(10, 60) + 6); }
  } else if (style === 'anchor') { fill('#fbfbf9'); anchor(256, 270, 1.35, '#1f2d4d'); }
  else if (style === 'whale') { fill('#fbfbf9'); whale(256, 290, 1.5, '#1f2d4d'); }
  else if (style === 'sailboat') { fill(grad([[0, '#eef3f7'], [0.7, '#cfe0ea'], [0.71, '#5d86a8'], [1, '#3e6283']])); sail(256, 350, 200, '#ffffff'); g.fillStyle = '#1f2d4d'; g.fillRect(200, 350, 120, 20); }
  else if (style === 'sailboats') {
    fill(grad([[0, '#dbe8f3'], [0.55, '#b9d2e6'], [0.56, '#3f78b2'], [1, '#1d4a7c']]));
    for (let i = 0; i < 7; i++) sail(R(40, 470), H * R(0.56, 0.66) + i * 8, R(90, 190), i % 3 ? '#ffffff' : '#e8eef4');
    g.lineCap = 'round';
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(255,255,255,${R(0.1, 0.45)})`; g.lineWidth = R(2, 5); const x = R(0, W), y = H * R(0.66, 0.98); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(20, 70), y); g.stroke(); }
  } else if (style === 'hearts') {
    fill('#fbf8f7');
    const cols = ['#f2a7c3', '#c7a4e0', '#8fd3cf', '#f7b39a', '#b39ddb', '#f48fb1', '#80cbc4', '#ce93d8', '#ffab91'];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) heart(128 + q * 128, 128 + r * 128, 40, cols[r * 3 + q]);
  } else if (style === 'stripes') {
    const cols = ['#f4a9c6', '#fbd3e2', '#c5a3e0', '#e6d8f3', '#8fd3cf', '#d6f0ee'];
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.fillRect(0, i * H / 6, W, H / 6 + 1); }
    g.fillStyle = '#ffffff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 40 : 95; g.lineTo(256 + r * Math.cos(a), 256 + r * Math.sin(a)); } g.fill();
  } else if (style === 'dahlia') {
    fill('#fbf9f8');
    const cols = ['#e56aa3', '#b988d8', '#8bd0c9', '#f4a3c4', '#7d5bb3', '#5fb8b0'];
    for (let ring = 3; ring >= 0; ring--) {
      const n = 10 + ring * 3, len = 60 + ring * 45;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + ring * 0.3;
        g.save(); g.translate(256, 256); g.rotate(a); g.fillStyle = cols[(i + ring) % cols.length];
        g.beginPath(); g.ellipse(len * 0.55, 0, len * 0.5, 12 + ring * 5, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
  } else if (style === 'skyline') {
    fill(grad([[0, '#e9ecef'], [1, '#aeb4ba']]));
    g.fillStyle = '#2b2e33';
    let x = 0;
    while (x < W) { const w = R(24, 60), h = R(80, 300); g.fillRect(x, H - h, w - 3, h); if (rnd() < 0.3) g.fillRect(x + w / 2 - 3, H - h - R(20, 60), 6, 60); x += w; }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 160; i++) g.fillRect(R(0, W), H - R(10, 240), 4, 6);
  } else if (style === 'cork') {
    fill('#b98c5a');
    for (let i = 0; i < 5000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,60,30,0.35)' : 'rgba(230,200,150,0.35)'; g.fillRect(R(0, W), R(0, H), 3, 3); }
    const papers = [[70, 60, 150, 190, '#ffffff'], [240, 40, 170, 130, '#fff6b8'], [90, 280, 160, 150, '#d9f0ff'], [290, 210, 150, 200, '#ffffff'], [420, 60, 80, 110, '#ffd6e7']];
    papers.forEach(([x, y, w, h, col], k) => {
      g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(R(-0.12, 0.12)); g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h);
      // a child's crayon drawing: a sun, a house or a flower
      g.lineWidth = 5; g.lineCap = 'round';
      if (k % 3 === 0) { g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(0, -10, 26, 0, 7); g.fill(); g.strokeStyle = '#ffb300'; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(34 * Math.cos(a), -10 + 34 * Math.sin(a)); g.lineTo(50 * Math.cos(a), -10 + 50 * Math.sin(a)); g.stroke(); } }
      else if (k % 3 === 1) { g.strokeStyle = '#e53935'; g.strokeRect(-30, -5, 60, 40); g.beginPath(); g.moveTo(-38, -5); g.lineTo(0, -40); g.lineTo(38, -5); g.stroke(); g.strokeStyle = '#43a047'; g.beginPath(); g.moveTo(-w / 2 + 8, h / 2 - 12); g.lineTo(w / 2 - 8, h / 2 - 12); g.stroke(); }
      else { g.strokeStyle = '#43a047'; g.beginPath(); g.moveTo(0, h / 2 - 15); g.lineTo(0, -5); g.stroke(); g.fillStyle = '#ab47bc'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.arc(14 * Math.cos(a), -20 + 14 * Math.sin(a), 11, 0, 7); g.fill(); } }
      g.restore();
      g.fillStyle = '#d32f2f'; g.beginPath(); g.arc(x + w / 2, y + 8, 6, 0, 7); g.fill();
    });
  } else if (style === 'dreamcatcher') {
    // drawn for a 1:2 (w:h) panel, so vertical sizes are halved to keep the hoop round
    g.clearRect(0, 0, W, H);
    const cx = 256, cy = 120, rx = 150, ry = 75;
    g.strokeStyle = '#efe6dc'; g.lineWidth = 9; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#f1b7c9'; g.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); g.lineTo(cx + Math.cos(a + 1.3) * rx * 0.5, cy + Math.sin(a + 1.3) * ry * 0.5); g.stroke(); }
    g.beginPath(); g.ellipse(cx, cy, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, rx * 0.2, ry * 0.2, 0, 0, Math.PI * 2); g.stroke();
    const feathers = [[150, '#f6c9d6'], [205, '#f09ab4'], [256, '#fbe3ea'], [307, '#f09ab4'], [362, '#f6c9d6'], [185, '#fde9dd'], [330, '#fde9dd']];
    feathers.forEach(([x, col], k) => {
      const top = cy + ry * 0.9 + (k > 4 ? 30 : 0), len = 170 + (k % 3) * 40;
      g.strokeStyle = '#e8dccf'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, cy + ry * 0.6); g.lineTo(x, top + 20); g.stroke();
      g.fillStyle = '#f4d58d'; g.beginPath(); g.ellipse(x, top + 18, 9, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.beginPath(); g.ellipse(x, top + 25 + len * 0.5, 24, len * 0.5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top + 25); g.lineTo(x, top + 25 + len); g.stroke();
    });
  } else if (style === 'nautical') {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#dfe3ea'; g.beginPath(); g.moveTo(300, 40); g.lineTo(430, 380); g.lineTo(300, 380); g.fill();   // pale sail
    whale(190, 360, 0.9, '#1f2d4d'); anchor(370, 380, 0.75, '#1f2d4d');
  } else fill('#cccccc');
  return c;
}

// Average linear albedo of a material (used by the light baker for bounce light).
const albedoCache = new Map();
export async function albedoOf(key) {
  if (albedoCache.has(key)) return albedoCache.get(key);
  const d = parse(key);
  const col = new THREE.Color(d.color || '#ffffff');          // linear (colour management on)
  let a = d.albedo ? d.albedo.slice() : [col.r, col.g, col.b];
  if (d.procedural === 'grass') a = [0.09, 0.15, 0.05];
  if (d.map) {
    const m = await meanOfImage(T + d.map);
    a = [a[0] * m[0], a[1] * m[1], a[2] * m[2]];
  }
  if (d.metalness) a = a.map(v => v * 0.25);                   // metals: little diffuse bounce
  a = a.map(v => Math.min(0.92, v));
  albedoCache.set(key, a);
  return a;
}
const imgMeans = new Map();
function meanOfImage(url) {
  if (!imgMeans.has(url)) {
    imgMeans.set(url, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
        const px = g.getImageData(0, 0, 32, 32).data;
        const s = [0, 0, 0];
        const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        for (let i = 0; i < px.length; i += 4) { s[0] += lin(px[i]); s[1] += lin(px[i + 1]); s[2] += lin(px[i + 2]); }
        resolve(s.map(v => v / 1024));
      };
      img.onerror = () => resolve([0.5, 0.5, 0.5]);
      img.src = url;
    }));
  }
  return imgMeans.get(url);
}

export function isGlow(key) { return !!parse(key).glow; }

// Runtime material. variant: 'lm' (atlas lightmap on uv1) | 'vx' (per-vertex baked irradiance) | 'flat'
export function makeMaterial(key, variant, lightMap) {
  const d = parse(key);
  const m = new THREE.MeshStandardMaterial({
    color: d.color || '#ffffff',
    roughness: d.roughness ?? 0.8,
    metalness: d.metalness ?? 0,
    side: d.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
  });
  const rep = d.repeat ? 1 / d.repeat : 1;
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
    if (!d[slot]) continue;
    const t = loadTex(d[slot], slot === 'map' || slot === 'emissiveMap');
    const tt = rep !== 1 ? t.clone() : t;
    if (rep !== 1) tt.repeat.set(rep, rep);
    m[slot] = tt;
  }
  if (d.procedural) {
    const t = proceduralTexture(d.procedural).clone(); t.repeat.set(rep, rep); m.map = t;
    if (d.emissive) m.emissiveMap = t;          // a lit screen shows its own picture
  }
  if (d.normalScale) m.normalScale.set(d.normalScale, d.normalScale);
  if (d.emissive) { m.emissive.set(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
  if (d.alphaTest) m.alphaTest = d.alphaTest;
  if (d.glow) { m.toneMapped = true; }
  if (variant === 'lm' && lightMap) { m.lightMap = lightMap; m.lightMapIntensity = 1; }
  if (variant === 'vx') {
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 irr;\nvarying vec3 vIrr;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIrr = irr;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIrr;')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nirradiance += vIrr;');
    };
    m.customProgramCacheKey = () => 'vx';
  }
  m.userData.key = key;
  return m;
}
