// First-person walkthrough: baked global illumination (lightmaps + per-vertex probes),
// per-room reflection probes, auto exposure, doors, collisions and stairs.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as L from './layout.js';
import { buildHouse, roomAt } from './house.js';
import { layoutLightmap, collectProbes, doorFrame } from './lightmap.js';
import { makeMaterial, isGlow, setAnisotropy } from './materials.js';
import { createKids, prebuildKids } from './kids.js';
const kidGeometry = prebuildKids();   // children's meshes build in workers while the house loads

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ------------------------------------------------------------ constants ----
const EYE = 5.35, R = 0.75, STEP = 1.05;
const WALK = 5.0, TURN = 1.8, LOOK = 1.25;
const BODY_LO = 1.0, BODY_HI = 5.9;

const loadingEl = document.getElementById('loading');
const setLoading = t => { loadingEl.textContent = t; };

// ------------------------------------------------------------- renderer ----
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1;
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 800);
camera.rotation.order = 'YXZ';

// HDR pipeline: 4x MSAA scene render → soft bloom on windows and lamps → tone map + sRGB
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.12, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Sky dome: same radiance as the bake so windows read correctly.
const SKY = { zenith: [0.9, 1.45, 3.1], horizon: [2.9, 3.35, 4.0] };
const sunDir = new THREE.Vector3(...L.SUN_DIR).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { zen: { value: new THREE.Vector3(...SKY.zenith) }, hor: { value: new THREE.Vector3(...SKY.horizon) }, sun: { value: sunDir } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
  fragmentShader: `varying vec3 vD; uniform vec3 zen, hor, sun;
    void main(){ vec3 d = normalize(vD); vec3 c = d.y < 0.0 ? hor * 0.35 : mix(hor, zen, pow(d.y, 0.55));
      float s = max(dot(d, sun), 0.0); c += vec3(1.0, 0.95, 0.85) * (pow(s, 1200.0) * 400.0 + pow(s, 12.0) * 1.5);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
sky.frustumCulled = false;
scene.add(sky);

// ---------------------------------------------------------------- build ----
setLoading('Building the house…');
const house = buildHouse();
const parts = house.b.parts;
const atlas = layoutLightmap(parts);
const probeList = collectProbes(house);

async function loadBake() {
  try {
    const meta = await (await fetch('baked/meta.json')).json();
    if (meta.W !== atlas.W || meta.H !== atlas.H || meta.probes !== probeList.count) {
      console.warn('Baked lighting is out of date with the layout — run bake.html', meta, atlas, probeList.count);
      return null;
    }
    setLoading('Loading baked lighting…');
    const lm = await new HDRLoader().loadAsync('baked/lightmap.hdr');
    lm.flipY = false;
    lm.channel = 1;
    lm.minFilter = THREE.LinearFilter; lm.magFilter = THREE.LinearFilter; lm.generateMipmaps = false;
    lm.needsUpdate = true;
    const probes = new Float32Array(await (await fetch('baked/probes.bin')).arrayBuffer());
    return { meta, lm, probes };
  } catch (e) {
    console.warn('No baked lighting found', e);
    return null;
  }
}

const bake = await loadBake();
if (!bake) {
  // fallback so the layout can still be inspected before a bake exists
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a66', 2.5));
  document.getElementById('warn').classList.remove('hidden');
}

// ------------------------------------------------ assemble static geometry ----
setLoading('Assembling surfaces…');
const roomKey = (x, z, y) => { const r = roomAt(x, z, y); return r ? r.id : 'ext'; };
const groups = new Map();
function group(matKey, variant, room) {
  const k = `${matKey}|${variant}|${room}`;
  if (!groups.has(k)) groups.set(k, { matKey, variant, room, pos: [], nrm: [], uv: [], uv1: [], irr: [] });
  return groups.get(k);
}
const probeIrr = i => (bake ? [bake.probes[i * 3], bake.probes[i * 3 + 1], bake.probes[i * 3 + 2]] : [0.3, 0.3, 0.3]);

for (const p of parts) {
  if (p.kind === 'poly') {
    const c = p.pts.reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]], [0, 0, 0]).map(v => v / p.pts.length);
    const room = roomKey(c[0] + p.n[0] * 0.3, c[2] + p.n[2] * 0.3, c[1] + p.n[1] * 0.3 + 0.01);
    const g = group(p.mat, p.lm ? 'lm' : 'basic', room);
    for (let i = 1; i < p.pts.length - 1; i++) {
      for (const k of [0, i, i + 1]) {
        g.pos.push(...p.pts[k]); g.nrm.push(...p.n); g.uv.push(...p.uv[k]);
        if (p.uv1) g.uv1.push(...p.uv1[k]);
      }
    }
  } else if (p.kind === 'mesh') {
    const n = p.pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += p.pos[i * 3]; cy += p.pos[i * 3 + 1]; cz += p.pos[i * 3 + 2]; }
    const g = group(p.mat, isGlow(p.mat) ? 'glow' : 'vx', roomKey(cx / n, cz / n, cy / n));
    for (let i = 0; i < n; i++) {
      g.pos.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      g.nrm.push(p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]);
      g.uv.push(p.uv[i * 2], p.uv[i * 2 + 1]);
      g.irr.push(...probeIrr(p.probeBase + i));
    }
  }
}

const roomMaterials = new Map();
const staticMeshes = [];
for (const g of groups.values()) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  if (g.variant === 'lm') geo.setAttribute('uv1', new THREE.Float32BufferAttribute(g.uv1, 2));
  if (g.variant === 'vx') geo.setAttribute('irr', new THREE.Float32BufferAttribute(g.irr, 3));
  let mat;
  if (g.variant === 'basic') {
    const src = makeMaterial(g.matKey, 'flat');
    mat = new THREE.MeshBasicMaterial({ map: src.map, color: '#d8d8d8', side: THREE.DoubleSide });
  } else if (g.variant === 'lm' && !bake) mat = makeMaterial(g.matKey, 'flat');
  else mat = makeMaterial(g.matKey, g.variant === 'glow' ? 'flat' : g.variant, bake?.lm);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  geo.computeBoundsTree();
  scene.add(mesh);
  staticMeshes.push(mesh);
  if (!roomMaterials.has(g.room)) roomMaterials.set(g.room, []);
  roomMaterials.get(g.room).push(mat);
}

// glass & mirrors
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
{
  const pos = [], nrm = [];
  for (const gl of house.glass) {
    for (let i = 1; i < gl.pts.length - 1; i++) for (const k of [0, i, i + 1]) { pos.push(...gl.pts[k]); nrm.push(...gl.n); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const glass = new THREE.Mesh(geo, glassMat);
  glass.renderOrder = 2;
  scene.add(glass);
}
const mirrors = [];
for (const m of house.mirrors) {
  const [a, b, c] = m.pts;
  const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), h = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
  const refl = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 768, textureHeight: Math.round(768 * h / w), color: 0xb8b8b8, clipBias: 0.003 });
  refl.position.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  refl.lookAt(refl.position.x + m.n[0], refl.position.y + m.n[1], refl.position.z + m.n[2]);
  scene.add(refl);
  mirrors.push(refl);
}

// ------------------------------------------------------------------ doors ----
const doorMeshes = [];
function buildDynamic(obj, room) {
  const byMat = new Map();
  for (const p of obj.parts) {
    if (p.kind !== 'mesh') continue;
    if (!byMat.has(p.mat)) byMat.set(p.mat, []);
    byMat.get(p.mat).push(p);
  }
  const grp = new THREE.Group();
  for (const [key, list] of byMat) {
    const pos = [], nrm = [], uv = [], irr = [];
    for (const p of list) {
      const n = p.pos.length / 3;
      for (let i = 0; i < n; i++) {
        pos.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
        nrm.push(p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]);
        uv.push(p.uv[i * 2], p.uv[i * 2 + 1]);
        irr.push(...probeIrr(p.probeBase + i));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('irr', new THREE.Float32BufferAttribute(irr, 3));
    const mat = makeMaterial(key, isGlow(key) ? 'flat' : 'vx');
    const mesh = new THREE.Mesh(geo, mat);
    grp.add(mesh);
    doorMeshes.push(mesh);
    if (!roomMaterials.has(room)) roomMaterials.set(room, []);
    roomMaterials.get(room).push(mat);
  }
  return grp;
}

class Door {
  constructor(d) {
    const s = d.spec;
    Object.assign(this, s);
    this.w = d.w;
    const f = doorFrame(s);
    this.hx = f.hx; this.hz = f.hz; this.thC = f.thC; this.dlt = f.dlt;
    this.cx = s.axis === 'x' ? (s.a0 + s.a1) / 2 : s.c;
    this.cz = s.axis === 'x' ? s.c : (s.a0 + s.a1) / 2;
    const room = roomKey(this.cx + (s.axis === 'z' ? s.swing * 0.8 : 0), this.cz + (s.axis === 'x' ? s.swing * 0.8 : 0), s.base + 3);
    this.pivot = buildDynamic(d, room);
    this.pivot.position.set(this.hx, s.base, this.hz);
    this.pivot.traverse(o => { o.userData.door = this; });
    scene.add(this.pivot);
    this.t = 0; this.target = 0;
    this.update(0);
  }
  update(dt) {
    const sp = 1.6 * dt;
    this.t = this.target > this.t ? Math.min(this.target, this.t + sp) : Math.max(this.target, this.t - sp);
    const e = this.t * this.t * (3 - 2 * this.t);
    const a = this.thC + this.dlt * e;
    this.pivot.rotation.y = a;
    this.dx = Math.cos(a); this.dz = -Math.sin(a);
  }
  get isOpen() { return this.target > 0.5; }
}
const doors = house.doors.map(d => new Door(d));
const doorGroups = new Map();
for (const d of doors) { if (!doorGroups.has(d.group)) doorGroups.set(d.group, []); doorGroups.get(d.group).push(d); }
// start with the main interior doors open; closets and exterior doors closed
for (const d of doors) if (['bath2', 'br1', 'bath1', 'br2', 'br3', 'hb', 'laun'].includes(d.id)) { d.target = d.t = 1; d.update(0); }

class GarageDoor {
  constructor(d) {
    Object.assign(this, d.spec);
    this.isGarage = true;
    this.base = 0;
    this.cx = (this.x0 + this.x1) / 2; this.cz = this.z;
    this.grp = buildDynamic(d, 'gar');
    this.grp.traverse(o => { o.userData.door = this; });
    scene.add(this.grp);
    this.t = 0; this.target = 0;
    this.update(0);
  }
  update(dt) {
    const sp = 0.45 * dt;
    this.t = this.target > this.t ? Math.min(this.target, this.t + sp) : Math.max(this.target, this.t - sp);
    const e = this.t * this.t * (3 - 2 * this.t);
    const ang = e * Math.PI / 2;
    this.grp.rotation.x = -ang;
    this.grp.position.set(this.x0, e * (this.h + 0.05), this.z - 0.1 - e * 0.25);
  }
  get isOpen() { return this.target > 0.5; }
}
const garageDoors = house.garageDoors.map(d => new GarageDoor(d));

// ------------------------------------------------------ reflection probes ----
const envs = new Map();
if (bake) {
  setLoading('Capturing reflections…');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 400, cubeRT);
  for (const m of mirrors) m.visible = false;
  const capture = (id, x, y, z) => { cubeCam.position.set(x, y, z); cubeCam.update(renderer, scene); envs.set(id, pmrem.fromCubemap(cubeRT.texture).texture); };
  for (const r of L.ROOMS) {
    const big = r.rects.reduce((a, b) => ((b[1] - b[0]) * (b[3] - b[2]) > (a[1] - a[0]) * (a[3] - a[2]) ? b : a));
    const y = (r.id === 'foyer' || r.id === 'rear') ? L.MID + 5 : r.h[0] + 5;
    capture(r.id, (big[0] + big[1]) / 2, Math.min(y, r.h[1] - 0.5), (big[2] + big[3]) / 2);
  }
  capture('ext', 24.8, 5.5, 42);
  for (const [room, mats] of roomMaterials) {
    const env = envs.get(room) || envs.get('ext');
    for (const m of mats) {
      if (!m.isMeshStandardMaterial) continue;
      m.envMap = env;
      m.envMapIntensity = 1;
      // specular only — diffuse light is already baked
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = sh => {
        if (prev) prev(sh);
        sh.fragmentShader = sh.fragmentShader.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');
      };
      const prevKey = m.customProgramCacheKey.bind(m);
      m.customProgramCacheKey = () => prevKey() + '|spec';
      m.needsUpdate = true;
    }
  }
  glassMat.envMap = envs.get('ext');
  for (const m of mirrors) m.visible = true;
  cubeRT.dispose();
}

// --------------------------------------------------------------- player ----
const player = { x: L.START.x, z: L.START.z, feet: L.START.feet, vy: 0, yaw: L.START.yaw, pitch: 0.02, camY: L.START.feet + EYE };
const boxes = house.b.boxes;
const kidBodies = [];   // filled once the children are created

function floorAt(x, z, feet) {
  const lim = feet + STEP;
  let best = 0;
  for (const f of L.FLOORS) {
    const [x0, x1, z0, z1] = f.r;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && f.h <= lim && f.h > best) best = f.h;
  }
  for (const f of L.FLIGHTS) {
    const [x0, x1, z0, z1] = f.r;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
      const h = f.h0 + (f.h1 - f.h0) * (z - z0) / (z1 - z0);
      if (h <= lim && h > best) best = h;
    }
  }
  return best;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function resolve(px, pz, feet) {
  const b0 = feet + BODY_LO, b1 = feet + BODY_HI;
  for (let it = 0; it < 3; it++) {
    for (const c of boxes) {
      if (c.y1 <= b0 || c.y0 >= b1) continue;
      if (px < c.x0 - R || px > c.x1 + R || pz < c.z0 - R || pz > c.z1 + R) continue;
      const cx = clamp(px, c.x0, c.x1), cz = clamp(pz, c.z0, c.z1);
      const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      if (d2 > 1e-10) { const dd = Math.sqrt(d2); px = cx + dx / dd * R; pz = cz + dz / dd * R; }
      else {
        const l = px - c.x0, r = c.x1 - px, t = pz - c.z0, bb = c.z1 - pz, m = Math.min(l, r, t, bb);
        if (m === l) px = c.x0 - R; else if (m === r) px = c.x1 + R; else if (m === t) pz = c.z0 - R; else pz = c.z1 + R;
      }
    }
    for (const d of doors) {
      if (d.base + L.DOOR_H <= b0 || d.base >= b1) continue;
      const ax = d.hx, az = d.hz, vx = d.dx * d.w, vz = d.dz * d.w;
      const u = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
      const cx = ax + vx * u, cz = az + vz * u;
      const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz, rr = R + 0.08;
      if (d2 < rr * rr && d2 > 1e-10) { const dd = Math.sqrt(d2); px = cx + dx / dd * rr; pz = cz + dz / dd * rr; }
    }
    for (const g of garageDoors) {
      if (g.t < 0.75 && b0 < g.h && px > g.x0 - R && px < g.x1 + R && Math.abs(pz - g.z) < R + 0.1) pz = pz < g.z ? g.z - R - 0.1 : g.z + R + 0.1;
    }
    for (const k of kidBodies) {
      if (Math.abs(k.feet - feet) > 3) continue;
      const dx = px - k.x, dz = pz - k.z, d2 = dx * dx + dz * dz, rr = R + k.radius * 0.7;
      if (d2 < rr * rr && d2 > 1e-8) { const dd = Math.sqrt(d2); px = k.x + dx / dd * rr; pz = k.z + dz / dd * rr; }
    }
  }
  return [px, pz];
}

// --------------------------------------------------------------- children ----
let kids = null;
try {
  setLoading('Adding the kids…');
  kids = await createKids({ scene, renderer, floorAt, boxes, doors, envs, mirrors, geometry: kidGeometry });
  kidBodies.push(...kids.list);
} catch (e) { console.error('kids', e); }

// ---------------------------------------------------------------- input ----
const keys = new Set();
let started = false;
const hintEl = document.getElementById('hint');
const locEl = document.getElementById('loc');
const helpEl = document.getElementById('help');
const mapCanvas = document.getElementById('map');
const CAPTURE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End'];
window.addEventListener('keydown', e => {
  if (CAPTURE.includes(e.key)) e.preventDefault();
  if (!started) { if (e.key === 'Enter' || e.key === ' ') begin(); return; }
  if (e.repeat && e.key === ' ') return;
  if (e.key === ' ') { const t = findDoorTarget(); if (t) toggleDoor(t); }
  else if (e.key === 'm' || e.key === 'M') mapCanvas.classList.toggle('hidden');
  else if (e.key === 'h' || e.key === 'H' || e.key === '?') helpEl.classList.toggle('hidden');
  else if (e.key === 'Home' || e.key === 'c' || e.key === 'C') player.pitch = 0;
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});
window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => keys.clear());
let dragging = false;
canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  player.yaw -= e.movementX * 0.0042;
  player.pitch = clamp(player.pitch - e.movementY * 0.0042, -1.35, 1.35);
});

function toggleDoor(t) {
  if (t.isGarage) { t.target = t.isOpen ? 0 : 1; return; }
  const open = !t.isOpen;
  for (const d of doorGroups.get(t.group)) d.target = open ? 1 : 0;
}

// ------------------------------------------------------------ targeting ----
const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const allDoorLike = [...doors, ...garageDoors];
function lineOfSight(x, y, z, tx, ty, tz) {
  const d = new THREE.Vector3(tx - x, ty - y, tz - z);
  const dist = d.length();
  ray.set(new THREE.Vector3(x, y, z), d.normalize());
  ray.far = dist - 0.4;
  return ray.intersectObjects(staticMeshes, false).length === 0;
}
function findDoorTarget() {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = 7;
  const hits = ray.intersectObjects([...doorMeshes, ...staticMeshes], false);
  if (hits.length && hits[0].object.userData.door) return hits[0].object.userData.door;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best = null, bestScore = Infinity;
  for (const d of allDoorLike) {
    if (Math.abs(d.base - player.feet) > 3) continue;
    const vx = d.cx - player.x, vz = d.cz - player.z, dist = Math.hypot(vx, vz);
    if (dist > (d.isGarage ? 12 : 5.5) || dist < 0.01) continue;
    const cos = (vx * fx + vz * fz) / dist;
    if (cos < 0.45 && dist > 1.6) continue;
    if (!lineOfSight(player.x, player.feet + EYE, player.z, d.cx, d.base + 3.5, d.cz)) continue;
    const score = dist * (2.2 - cos);
    if (score < bestScore) { bestScore = score; best = d; }
  }
  return best;
}
let lastHint = 0;
function updateHint(now) {
  if (now - lastHint < 150) return;
  lastHint = now;
  const t = findDoorTarget();
  hintEl.innerHTML = t ? `<b>Space</b> ${t.isOpen ? 'close' : 'open'} ${t.name.toLowerCase()}` : '';
  hintEl.style.opacity = t ? 1 : 0;
}

// -------------------------------------------------------------- minimap ----
const mctx = mapCanvas.getContext('2d');
const MAP = { x0: -3, z0: -15, s: 9.2 };
mapCanvas.width = Math.round(52 * MAP.s);
mapCanvas.height = Math.round(62 * MAP.s);
const mx = x => (x - MAP.x0) * MAP.s, mz = z => (z - MAP.z0) * MAP.s;
function drawMap() {
  if (mapCanvas.classList.contains('hidden')) return;
  const g = mctx, S = MAP.s;
  g.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  const y = player.feet + 2.5, b0 = player.feet + BODY_LO, b1 = player.feet + BODY_HI;
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (const r of L.ROOMS) if (y >= r.h[0] && y < r.h[1]) for (const [x0, x1, z0, z1] of r.rects) g.fillRect(mx(x0), mz(z0), (x1 - x0) * S, (z1 - z0) * S);
  for (const f of L.FLIGHTS) {
    if (Math.min(f.h0, f.h1) > player.feet + 2 || Math.max(f.h0, f.h1) < player.feet - 2) continue;
    const [x0, x1, z0, z1] = f.r;
    g.fillStyle = 'rgba(230,190,120,0.3)';
    g.fillRect(mx(x0), mz(z0), (x1 - x0) * S, (z1 - z0) * S);
  }
  g.fillStyle = '#e8e2d6';
  for (const c of boxes) {
    if (c.y1 <= b0 || c.y0 >= b1 || c.y1 - c.y0 < 3) continue;
    g.fillRect(mx(c.x0), mz(c.z0), Math.max(1.5, (c.x1 - c.x0) * S), Math.max(1.5, (c.z1 - c.z0) * S));
  }
  g.strokeStyle = '#f0b35a'; g.lineWidth = 3;
  for (const d of doors) {
    if (d.base + L.DOOR_H <= b0 || d.base >= b1) continue;
    g.beginPath(); g.moveTo(mx(d.hx), mz(d.hz)); g.lineTo(mx(d.hx + d.dx * d.w), mz(d.hz + d.dz * d.w)); g.stroke();
  }
  g.font = `600 ${S * 1.05}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.6)';
  for (const r of L.ROOMS) {
    if (y < r.h[0] || y >= r.h[1]) continue;
    const [x0, x1, z0, z1] = r.rects[0];
    if ((x1 - x0) * (z1 - z0) < 40) continue;
    g.fillText(r.name.replace(/ \(.+\)/, ''), mx((x0 + x1) / 2), mz((z0 + z1) / 2) + S * 0.4);
  }
  if (kids) for (const k of kids.list) {
    if (Math.abs(k.feet - player.feet) > 4) continue;
    g.fillStyle = k.S.dot; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(mx(k.x), mz(k.z), S * 0.75, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.save();
  g.translate(mx(player.x), mz(player.z));
  g.rotate(-player.yaw);
  g.fillStyle = '#ff5a4f';
  g.beginPath(); g.moveTo(0, -S * 1.6); g.lineTo(S * 0.95, S * 0.9); g.lineTo(0, S * 0.4); g.lineTo(-S * 0.95, S * 0.9); g.closePath(); g.fill();
  g.restore();
}

// --------------------------------------------------------- auto exposure ----
const meterRT = new THREE.WebGLRenderTarget(48, 27, { type: THREE.HalfFloatType });
const meterBuf = new Uint16Array(48 * 27 * 4);
let exposure = 1, targetExposure = 1, meterBusy = false, lastMeter = 0;
const half = h => THREE.DataUtils.fromHalfFloat(h);
async function meter(now) {
  if (meterBusy || now - lastMeter < 200) return;
  meterBusy = true; lastMeter = now;
  renderer.setRenderTarget(meterRT);
  for (const m of mirrors) m.visible = false;
  renderer.render(scene, camera);
  for (const m of mirrors) m.visible = true;
  renderer.setRenderTarget(null);
  try {
    await renderer.readRenderTargetPixelsAsync(meterRT, 0, 0, 48, 27, meterBuf);
    let s = 0, n = 0;
    for (let i = 0; i < meterBuf.length; i += 4) {
      const l = 0.2126 * half(meterBuf[i]) + 0.7152 * half(meterBuf[i + 1]) + 0.0722 * half(meterBuf[i + 2]);
      s += Math.log(Math.max(l, 1e-4)); n++;
    }
    targetExposure = clamp(0.19 / Math.exp(s / n), 0.03, 3.5);
  } catch (e) { /* ignore */ }
  meterBusy = false;
}

// ----------------------------------------------------------------- loop ----
function levelName(f) {
  if (f < 2) return roomAt(player.x, player.z, 2) ? 'Lower level' : 'Outside';
  if (f < 7) return 'Entry landing';
  return 'Main level';
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started) {
    const shift = keys.has('Shift');
    let mf = 0, ms = 0, turn = 0, look = 0;
    if (keys.has('ArrowUp') || keys.has('w')) mf += 1;
    if (keys.has('ArrowDown') || keys.has('s')) mf -= 1;
    if (keys.has('ArrowLeft')) { if (shift) ms -= 1; else turn += 1; }
    if (keys.has('ArrowRight')) { if (shift) ms += 1; else turn -= 1; }
    if (keys.has('a')) ms -= 1;
    if (keys.has('d')) ms += 1;
    if (keys.has('q')) turn += 1;
    if (keys.has('e')) turn -= 1;
    if (keys.has('PageUp') || keys.has('r')) look += 1;
    if (keys.has('PageDown') || keys.has('f')) look -= 1;
    player.yaw += turn * TURN * dt;
    player.pitch = clamp(player.pitch + look * LOOK * dt, -1.35, 1.35);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    let vx = fx * mf - fz * ms, vz = fz * mf + fx * ms;
    const vl = Math.hypot(vx, vz);
    if (vl > 0) { vx /= vl; vz /= vl; }
    const speed = WALK * (mf < 0 && !ms ? 0.7 : 1);
    for (let i = 0; i < 3; i++) [player.x, player.z] = resolve(player.x + vx * speed * dt / 3, player.z + vz * speed * dt / 3, player.feet);
  }
  const fl = floorAt(player.x, player.z, player.feet);
  if (fl >= player.feet - 1e-4) { player.feet = fl; player.vy = 0; }
  else if (player.vy === 0 && player.feet - fl <= 0.9) player.feet = fl;
  else {
    player.vy -= 32 * dt; player.feet += player.vy * dt;
    if (player.feet <= fl) { player.feet = fl; player.vy = 0; }
  }
  [player.x, player.z] = resolve(player.x, player.z, player.feet);
  for (const d of doors) if (d.t !== d.target) d.update(dt);
  for (const g of garageDoors) if (g.t !== g.target) g.update(dt);
  if (kids) kids.update(dt, player, now);

  player.camY += (player.feet + (player.eyeH ?? EYE) - player.camY) * Math.min(1, dt * 12);   // eyeH: test override
  camera.position.set(player.x, player.camY, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  sky.position.copy(camera.position);

  if (bake) {
    meter(now);
    exposure += (targetExposure - exposure) * Math.min(1, dt * 2.2);
    renderer.toneMappingExposure = exposure;
  }
  if (started) {
    updateHint(now);
    const room = roomAt(player.x, player.z, player.feet + 2);
    locEl.innerHTML = `<span>${room ? room.name : 'Outside'}</span><small>${levelName(player.feet)}</small>`;
    drawMap();
  }
  bloom.threshold = 1.4 / Math.max(exposure, 1e-3);
  composer.render();
}

// ---------------------------------------------------------------- start ----
const startEl = document.getElementById('start');
function begin() {
  if (started) return;
  started = true;
  startEl.classList.add('hidden');
  canvas.focus();
}
document.getElementById('go').addEventListener('click', begin);
setLoading('Ready.');
document.getElementById('go').disabled = false;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
// Debug/test hook: jump to a pose, settle exposure synchronously and render once.
function snap(x, z, feet, yaw, pitch = 0) {
  Object.assign(player, { x, z, feet, yaw, pitch, camY: feet + EYE, vy: 0 });
  camera.position.set(x, feet + EYE, z);
  camera.rotation.set(pitch, yaw, 0);
  sky.position.copy(camera.position);
  const buf = new Uint16Array(48 * 27 * 4);
  for (let i = 0; i < 2 && bake; i++) {
    renderer.setRenderTarget(meterRT);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(meterRT, 0, 0, 48, 27, buf);
    renderer.setRenderTarget(null);
    let s = 0, n = 0;
    for (let k = 0; k < buf.length; k += 4) { s += Math.log(Math.max(1e-4, 0.2126 * half(buf[k]) + 0.7152 * half(buf[k + 1]) + 0.0722 * half(buf[k + 2]))); n++; }
    exposure = targetExposure = clamp(0.19 / Math.exp(s / n), 0.03, 3.5);
    renderer.toneMappingExposure = exposure;
  }
  bloom.threshold = 1.4 / Math.max(exposure, 1e-3);
  composer.render();
  return exposure;
}
window.__house = { player, doors, garageDoors, camera, keys, renderer, scene, begin, snap, kids };
requestAnimationFrame(frame);
