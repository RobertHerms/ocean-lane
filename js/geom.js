// Geometry collection shared by the baker and the walkthrough.
// Everything static is emitted as planar polygons ("polys", lightmapped) or small meshes
// ("mesh", lit per-vertex from baked probes). All coordinates are world feet.
import * as THREE from 'three';

const FACES = {
  px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1],
};

function newell(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// World-space texture coordinates in feet, projected on the dominant axis.
function worldUV(p, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0], n[1] > 0 ? -p[2] : p[2]];
  if (ax >= az) return [n[0] > 0 ? -p[2] : p[2], p[1]];
  return [n[2] > 0 ? p[0] : -p[0], p[1]];
}

export class Builder {
  constructor() {
    this.parts = [];
    this.boxes = [];          // colliders {x0,x1,y0,y1,z0,z1}
  }

  // pts: convex planar loop. o.n: intended normal (loop is re-ordered to match).
  // o.uv: 'world' (feet) | 'face' (0..1 over the poly's extent, optional o.rect [u0,v0,u1,v1]) | explicit array
  poly(pts, mat, o = {}) {
    let n = newell(pts);
    if (o.n && n[0] * o.n[0] + n[1] * o.n[1] + n[2] * o.n[2] < 0) { pts = pts.slice().reverse(); n = newell(pts); }
    let uv;
    if (Array.isArray(o.uv)) uv = o.uv;
    else if (o.uv === 'face') uv = faceUV(pts, n, o.rect, o.up);
    else uv = pts.map(p => worldUV(p, n));
    this.parts.push({ kind: 'poly', pts, n, uv, mat, lm: o.lm !== false, dens: o.dens, bake: o.bake !== false, tag: o.tag, chart: o.chart });
    return this;
  }

  // Axis-aligned box. mat: key or {px,nx,py,ny,pz,nz,default}. o.skip: array of face names.
  // o.bevel: chamfer radius — faces shrink by it and the edges/corners become small probe-lit bevels.
  box(x0, x1, y0, y1, z0, z1, mat, o = {}) {
    if (o.bevel) return this.bevelBox(x0, x1, y0, y1, z0, z1, mat, o);
    const skip = o.skip || [];
    const m = f => (typeof mat === 'string' ? mat : (mat[f] || mat.default));
    const F = {
      px: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
      nx: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      py: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
      ny: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      pz: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      nz: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
    };
    for (const f of Object.keys(F)) {
      if (skip.includes(f)) continue;
      const w = f[1] === 'x' ? Math.abs(z1 - z0) * Math.abs(y1 - y0) : f[1] === 'y' ? Math.abs(x1 - x0) * Math.abs(z1 - z0) : Math.abs(x1 - x0) * Math.abs(y1 - y0);
      if (w < 1e-6) continue;
      this.poly(F[f], m(f), { ...o, n: FACES[f], uv: o.uvFaces?.[f] ?? o.uv });
    }
    if (o.collide) this.boxes.push({ x0, x1, y0, y1, z0, z1 });
    return this;
  }

  bevelBox(x0, x1, y0, y1, z0, z1, mat, o) {
    const skip = new Set(o.skip || []);
    const r = Math.min(o.bevel, (x1 - x0) / 2.5, (y1 - y0) / 2.5, (z1 - z0) / 2.5);
    const m = f => (typeof mat === 'string' ? mat : (mat[f] || mat.default));
    const has = f => !skip.has(f);
    // inset of each face boundary: only toward neighbours that exist (a skipped face means "against something")
    const ix0 = has('nx') ? r : 0, ix1 = has('px') ? r : 0, iy0 = has('ny') ? r : 0, iy1 = has('py') ? r : 0, iz0 = has('nz') ? r : 0, iz1 = has('pz') ? r : 0;
    const X0 = x0 + ix0, X1 = x1 - ix1, Y0 = y0 + iy0, Y1 = y1 - iy1, Z0 = z0 + iz0, Z1 = z1 - iz1;
    const faces = {
      px: [[x1, Y0, Z0], [x1, Y1, Z0], [x1, Y1, Z1], [x1, Y0, Z1]],
      nx: [[x0, Y0, Z0], [x0, Y0, Z1], [x0, Y1, Z1], [x0, Y1, Z0]],
      py: [[X0, y1, Z0], [X0, y1, Z1], [X1, y1, Z1], [X1, y1, Z0]],
      ny: [[X0, y0, Z0], [X1, y0, Z0], [X1, y0, Z1], [X0, y0, Z1]],
      pz: [[X0, Y0, z1], [X1, Y0, z1], [X1, Y1, z1], [X0, Y1, z1]],
      nz: [[X0, Y0, z0], [X0, Y1, z0], [X1, Y1, z0], [X1, Y0, z0]],
    };
    for (const f of Object.keys(faces)) if (has(f)) this.poly(faces[f], m(f), { ...o, n: FACES[f], uv: o.uvFaces?.[f] ?? o.uv });
    // edge chamfers + corner triangles, gathered into one small mesh
    const pos = [];
    const quad = (a, b, c, d, n) => { tri(a, b, c, n); tri(a, c, d, n); };
    const tri = (a, b, c, n) => {
      const nn = newell([a, b, c]);
      if (nn[0] * n[0] + nn[1] * n[1] + nn[2] * n[2] < 0) { pos.push(...a, ...c, ...b); } else pos.push(...a, ...b, ...c);
    };
    const S = s => (s > 0 ? 1 : -1);
    // edges parallel to x (between y and z faces)
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      if (!has(sy > 0 ? 'py' : 'ny') || !has(sz > 0 ? 'pz' : 'nz')) continue;
      const y = sy > 0 ? y1 : y0, z = sz > 0 ? z1 : z0;
      quad([X0, y - sy * r, z], [X1, y - sy * r, z], [X1, y, z - sz * r], [X0, y, z - sz * r], [0, S(sy), S(sz)]);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (!has(sx > 0 ? 'px' : 'nx') || !has(sz > 0 ? 'pz' : 'nz')) continue;
      const x = sx > 0 ? x1 : x0, z = sz > 0 ? z1 : z0;
      quad([x - sx * r, Y0, z], [x - sx * r, Y1, z], [x, Y1, z - sz * r], [x, Y0, z - sz * r], [S(sx), 0, S(sz)]);
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if (!has(sx > 0 ? 'px' : 'nx') || !has(sy > 0 ? 'py' : 'ny')) continue;
      const x = sx > 0 ? x1 : x0, y = sy > 0 ? y1 : y0;
      quad([x - sx * r, y, Z0], [x - sx * r, y, Z1], [x, y - sy * r, Z1], [x, y - sy * r, Z0], [S(sx), S(sy), 0]);
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      if (!has(sx > 0 ? 'px' : 'nx') || !has(sy > 0 ? 'py' : 'ny') || !has(sz > 0 ? 'pz' : 'nz')) continue;
      const x = sx > 0 ? x1 : x0, y = sy > 0 ? y1 : y0, z = sz > 0 ? z1 : z0;
      tri([x, y - sy * r, z - sz * r], [x - sx * r, y, z - sz * r], [x - sx * r, y - sy * r, z], [S(sx), S(sy), S(sz)]);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const key = typeof mat === 'string' ? mat : mat.default;
      this.mesh(g, key, { bake: o.bake });
    }
    if (o.collide) this.boxes.push({ x0, x1, y0, y1, z0, z1 });
    return this;
  }

  // Any three.js geometry already in world space → per-vertex (probe) lit mesh.
  mesh(geo, mat, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
    const uv = g.attributes.uv ? g.attributes.uv.array : new Float32Array(pos.length / 3 * 2);
    this.parts.push({ kind: 'mesh', pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv), mat, lm: false, bake: o.bake !== false, tag: o.tag });
    if (o.collide) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      this.boxes.push({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
    }
    return this;
  }

  // Small solid pieces (knobs, legs, balusters...) as probe-lit boxes.
  mbox(x0, x1, y0, y1, z0, z1, mat, o = {}) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.mesh(g, mat, o);
  }

  // Place a primitive with a transform (position, rotation Y) → probe-lit mesh.
  prim(geo, mat, x, y, z, ry = 0, o = {}) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    if (o.rx) m.multiply(new THREE.Matrix4().makeRotationX(o.rx));
    if (o.rz) m.multiply(new THREE.Matrix4().makeRotationZ(o.rz));
    geo.applyMatrix4(m);
    return this.mesh(geo, mat, o);
  }

  collider(x0, x1, y0, y1, z0, z1) { this.boxes.push({ x0, x1, y0, y1, z0, z1 }); return this; }
}

function faceUV(pts, n, rect = [0, 0, 1, 1], up) {
  // local frame: v = up (world y unless the face is horizontal), u = v × n
  let vx = [0, 1, 0];
  if (Math.abs(n[1]) > 0.9) vx = up || [0, 0, -1];
  const ux = [vx[1] * n[2] - vx[2] * n[1], vx[2] * n[0] - vx[0] * n[2], vx[0] * n[1] - vx[1] * n[0]];
  const us = pts.map(p => p[0] * ux[0] + p[1] * ux[1] + p[2] * ux[2]);
  const vs = pts.map(p => p[0] * vx[0] + p[1] * vx[1] + p[2] * vx[2]);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  return pts.map((p, i) => [
    rect[0] + (rect[2] - rect[0]) * (us[i] - u0) / (u1 - u0 || 1),
    rect[1] + (rect[3] - rect[1]) * (vs[i] - v0) / (v1 - v0 || 1),
  ]);
}

// Extrude a 2D profile (in the wall-normal / up plane) along a straight run, one poly per profile
// segment so each strip gets its own lightmap chart. profile: [[out, up], ...] relative to origin.
export function extrude(b, profile, origin, dir, normal, len, mat, o = {}) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [o0, u0] = profile[i], [o1, u1] = profile[i + 1];
    const p = (t, out, up) => [
      origin[0] + dir[0] * t + normal[0] * out,
      origin[1] + up,
      origin[2] + dir[2] * t + normal[2] * out,
    ];
    const m0 = o.m0 || 0, m1 = o.m1 || 0;          // mitres: the profile's outer edge runs on past the ends
    const pts = [p(-m0 * o0, o0, u0), p(len + m1 * o0, o0, u0), p(len + m1 * o1, o1, u1), p(-m0 * o1, o1, u1)];
    // Facing direction of the strip: profiles are traced from the wall edge outward and around,
    // so the face is on the (-du, dout) side of each segment.
    const du = u1 - u0, dout = o1 - o0;
    const nOut = [normal[0] * -du, dout, normal[2] * -du];
    const l = Math.hypot(...nOut) || 1;
    const { m0: _a, m1: _b, ...po } = o;
    b.poly(pts, mat, { ...po, n: [nOut[0] / l, nOut[1] / l, nOut[2] / l] });
  }
}
