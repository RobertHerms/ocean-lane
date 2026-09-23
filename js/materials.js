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
  tileLanding: { map: 'tile_landing.jpg', normalMap: 'tile_landing_normal.jpg', roughnessMap: 'tile_landing_rough.jpg', repeat: 3, roughness: 1 },
  tileBath2: { map: 'tile_bath2.jpg', normalMap: 'tile_bath2_normal.jpg', roughnessMap: 'tile_bath2_rough.jpg', repeat: 4, roughness: 1 },
  carpetBeige: { map: 'carpet_beige.jpg', normalMap: 'carpet_beige_normal.jpg', repeat: 2, roughness: 1, normalScale: 0.8 },
  rugGrey: { map: 'rug_grey.jpg', normalMap: 'rug_grey_normal.jpg', repeat: 2, roughness: 1, normalScale: 1 },
  rugDining: { map: 'carpet_beige.jpg', normalMap: 'carpet_beige_normal.jpg', repeat: 1.2, roughness: 1, color: '#d8d9c4' },
  rugLiving: { map: 'carpet_beige.jpg', normalMap: 'carpet_beige_normal.jpg', repeat: 1.2, roughness: 1, color: '#e6dccb' },
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
  cultured: { color: '#ece3cf', roughness: 0.18 },
  oak: { color: '#6a3a1e', roughness: 0.35 },
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
  pegboard: { color: '#c9a77d', roughness: 0.9 },
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
};

function parse(key) {
  if (DEFS[key]) return DEFS[key];
  const [kind, hex] = key.split(':');
  if (kind === 'paint') return { color: hex, roughness: 0.9 };
  if (kind === 'fabric') return { color: hex, roughness: 0.95, normalMap: 'carpet_beige_normal.jpg', repeat: 0.7, normalScale: 0.35 };
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
  if (d.procedural) { const t = proceduralTexture(d.procedural).clone(); t.repeat.set(rep, rep); m.map = t; }
  if (d.normalScale) m.normalScale.set(d.normalScale, d.normalScale);
  if (d.emissive) { m.emissive.set(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
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
