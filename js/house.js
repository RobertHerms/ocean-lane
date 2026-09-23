// Builds the whole house (static geometry, doors, lights) from layout.js.
// Deterministic: the baker and the walkthrough call this and get identical geometry.
import * as THREE from 'three';
import * as L from './layout.js';
import { Builder, extrude } from './geom.js';

const TRIM = 'trim';
const EPS = 1e-4;

export function roomAt(x, z, y) {
  for (const r of L.ROOMS) {
    if (y < r.h[0] - EPS || y >= r.h[1]) continue;
    for (const [x0, x1, z0, z1] of r.rects) if (x >= x0 - EPS && x <= x1 + EPS && z >= z0 - EPS && z <= z1 + EPS) return r;
  }
  return null;
}
function paintFor(r, y) {
  if (!r) return 'siding';
  if (r.lower && y < r.h[0] + r.rail) return 'paint:' + r.lower;
  return 'paint:' + r.paint;
}

export function buildHouse() {
  const b = new Builder();
  const glass = [];            // transparent panes {pts, n, tint?}
  const mirrors = [];          // {pts, n}
  const lamps = [];            // bake light sources
  walls(b, glass);
  floorsAndCeilings(b, glass);
  moldings(b);
  stairs(b);
  railings(b);
  fixtures(b, lamps);
  kitchen(b);
  furniture(b, mirrors, glass);
  exterior(b);
  switchPlates(b);
  const doors = L.DOORS.map(s => buildDoor(s));
  const garageDoors = L.GARAGE_DOORS.map(s => buildGarageDoor(s));
  return { b, glass, mirrors, lamps, doors, garageDoors };
}

// ================================================================== walls ===
export function wallInfo(w) {
  const alongX = w.z0 === w.z1;
  return {
    alongX, t: w.t || L.WALL_T, c: alongX ? w.z0 : w.x0,
    a0: alongX ? Math.min(w.x0, w.x1) : Math.min(w.z0, w.z1),
    a1: alongX ? Math.max(w.x0, w.x1) : Math.max(w.z0, w.z1),
  };
}
// point on a wall line: along a, offset o (normal side), height y
const wp = (alongX, c, a, o, y) => (alongX ? [a, y, c + o] : [c + o, y, a]);
const wn = (alongX, s) => (alongX ? [0, 0, s] : [s, 0, 0]);
const xz = p => [p[0], p[2]];

function walls(b, glass) {
  for (const w of L.WALLS) {
    const { alongX, t, c, a0, a1 } = wallInfo(w);
    const cuts = new Set([a0, a1]);
    for (const op of w.ops) { cuts.add(Math.max(a0, Math.min(a1, op.a0))); cuts.add(Math.max(a0, Math.min(a1, op.a1))); }
    // split where the room (paint) changes on either side
    for (const y of [2, 6, 10.5, 14]) {
      if (y < w.y[0] || y > w.y[1]) continue;
      for (const s of [-1, 1]) {
        let prev = null;
        for (let a = a0; a <= a1 + 1e-6; a += 0.1) {
          const p = wp(alongX, c, a, s * (t / 2 + 0.2), y);
          const r = roomAt(p[0], p[2], y);
          const id = r ? r.id : null;
          if (a > a0 && id !== prev) cuts.add(Math.round((a - 0.05) * 100) / 100);
          prev = id;
        }
      }
    }
    const xs = [...cuts].sort((p, q) => p - q);
    const opEdges = new Set();
    for (const op of w.ops) { opEdges.add(op.a0); opEdges.add(op.a1); }
    for (let i = 0; i < xs.length - 1; i++) {
      const p = xs[i], q = xs[i + 1];
      if (q - p < 1e-3) continue;
      const mid = (p + q) / 2;
      const covering = w.ops.filter(op => op.a0 <= mid && op.a1 >= mid);
      let ranges = [w.y.slice()];
      for (const op of covering) ranges = subtract(ranges, op.b0, op.b1);
      for (const cut of [L.MAIN - 0.1, L.MAIN + 3]) ranges = ranges.flatMap(([s, e]) => (s < cut - 1e-6 && e > cut + 1e-6 ? [[s, cut], [cut, e]] : [[s, e]]));
      const pp = p === a0 && !opEdges.has(p) ? p - t / 2 : p;
      const qq = q === a1 && !opEdges.has(q) ? q + t / 2 : q;
      for (const [s, e] of ranges) {
        if (e - s < 1e-3) continue;
        const ym = (s + e) / 2;
        for (const side of [-1, 1]) {
          const probe = wp(alongX, c, mid, side * (t / 2 + 0.25), ym);
          const r = roomAt(probe[0], probe[2], ym);
          const mat = paintFor(r, ym);
          const o = side * t / 2;
          b.poly([wp(alongX, c, pp, o, s), wp(alongX, c, qq, o, s), wp(alongX, c, qq, o, e), wp(alongX, c, pp, o, e)], mat,
            { n: wn(alongX, side), dens: r ? undefined : 1.2 });
        }
        // end / jamb faces
        const jambMat = a => {
          const op = w.ops.find(o2 => (o2.a0 === a || o2.a1 === a) && o2.b0 < e && o2.b1 > s);
          if (!op) return null;
          return op.kind === 'open' && !op.passThrough ? paintFor(roomAt(...xz(wp(alongX, c, a, 0, 0)), op.b0 + 1), op.b0 + 1) : TRIM;
        };
        const ends = [[pp, -1, opEdges.has(p) ? jambMat(p) : null, p === a0], [qq, 1, opEdges.has(q) ? jambMat(q) : null, q === a1]];
        for (const [a, dir, jm, isWallEnd] of ends) {
          if (!jm && !isWallEnd) continue;
          const mat = jm || paintFor(roomAt(...xz(wp(alongX, c, a + dir * 0.3, 0, 0)), ym), ym);
          b.poly([wp(alongX, c, a, -t / 2, s), wp(alongX, c, a, t / 2, s), wp(alongX, c, a, t / 2, e), wp(alongX, c, a, -t / 2, e)], mat,
            { n: alongX ? [dir, 0, 0] : [0, 0, dir] });
        }
        // soffit / sill faces next to openings
        for (const op of covering) {
          if (Math.abs(op.b1 - s) < 1e-6) b.poly([wp(alongX, c, p, -t / 2, s), wp(alongX, c, q, -t / 2, s), wp(alongX, c, q, t / 2, s), wp(alongX, c, p, t / 2, s)],
            op.kind === 'open' && !op.passThrough ? paintFor(roomAt(...xz(wp(alongX, c, mid, 0, 0)), s - 1), s - 1) : TRIM, { n: [0, -1, 0] });
          if (Math.abs(op.b0 - e) < 1e-6) b.poly([wp(alongX, c, p, -t / 2, e), wp(alongX, c, q, -t / 2, e), wp(alongX, c, q, t / 2, e), wp(alongX, c, p, t / 2, e)],
            TRIM, { n: [0, 1, 0] });
        }
        const lo = wp(alongX, c, pp, -t / 2, s), hi = wp(alongX, c, qq, t / 2, e);
        b.collider(Math.min(lo[0], hi[0]), Math.max(lo[0], hi[0]), s, e, Math.min(lo[2], hi[2]), Math.max(lo[2], hi[2]));
      }
    }
    for (const op of w.ops) {
      if (op.kind === 'window') windowUnit(b, glass, w, op);
      else if (op.kind === 'door') casings(b, w, op);
      else if (op.passThrough) casings(b, w, op);
      else if (op.garageDoor) garageTrim(b, w, op);
    }
  }
}
function subtract(ranges, a, bb) {
  const out = [];
  for (const [s, e] of ranges) {
    if (bb <= s || a >= e) { out.push([s, e]); continue; }
    if (a > s) out.push([s, a]);
    if (bb < e) out.push([bb, e]);
  }
  return out;
}

// Door / cased-opening casing on both faces (3.5" colonial casing).
function casings(b, w, op) {
  const { alongX, t, c } = wallInfo(w);
  const W = 0.29, P = 0.055;
  for (const side of [-1, 1]) {
    const probe = wp(alongX, c, (op.a0 + op.a1) / 2, side * (t / 2 + 0.4), op.b0 + 1);
    if (!roomAt(probe[0], probe[2], op.b0 + 1) && !w.ext) continue;
    const o0 = side * t / 2, o1 = side * (t / 2 + P);
    const bottom = op.kind === 'door' ? op.b0 : op.b0 - W;
    const pieces = [
      [op.a0 - W, op.a0, bottom, op.b1 + W],
      [op.a1, op.a1 + W, bottom, op.b1 + W],
      [op.a0 - W - 0.03, op.a1 + W + 0.03, op.b1, op.b1 + W + 0.02],
    ];
    if (op.kind !== 'door') pieces.push([op.a0 - W, op.a1 + W, op.b0 - W, op.b0]);
    for (const [s0, s1, y0, y1] of pieces) casingBox(b, alongX, c, s0, s1, y0, y1, o0, o1, side);
  }
}
function garageTrim(b, w, op) {
  const { alongX, c, t } = wallInfo(w);
  for (const side of [-1, 1]) {
    const o0 = side * t / 2, o1 = side * (t / 2 + 0.07);
    casingBox(b, alongX, c, op.a0 - 0.35, op.a0, op.b0, op.b1 + 0.35, o0, o1, side, 'vinyl');
    casingBox(b, alongX, c, op.a1, op.a1 + 0.35, op.b0, op.b1 + 0.35, o0, o1, side, 'vinyl');
    casingBox(b, alongX, c, op.a0 - 0.35, op.a1 + 0.35, op.b1, op.b1 + 0.35, o0, o1, side, 'vinyl');
  }
}
function casingBox(b, alongX, c, s0, s1, y0, y1, o0, o1, side, mat = TRIM) {
  const p0 = wp(alongX, c, s0, o0, y0), p1 = wp(alongX, c, s1, o1, y1);
  b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), mat,
    { skip: [alongX ? (side > 0 ? 'nz' : 'pz') : (side > 0 ? 'nx' : 'px'), 'ny'], dens: 8 });
}

// Sliding glass patio door: vinyl frame, fixed outer panel, sliding inner panel, cellular shade drawn
// down over the glass, interior casing, exterior trim.
function sliderUnit(b, glass, w, op, inSide) {
  const { alongX, t, c } = wallInfo(w);
  const P = (a, o, y) => wp(alongX, c, a, o, y);
  const blk = (s0, s1, y0, y1, d0, d1, mat, o = {}) => {
    const p0 = P(s0, d0, y0), p1 = P(s1, d1, y1);
    b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), mat, { dens: 8, ...o });
  };
  const fw = 0.2, f0 = inSide * -0.1, f1 = inSide * 0.3;
  blk(op.a0, op.a0 + fw, op.b0, op.b1, f0, f1, 'vinyl'); blk(op.a1 - fw, op.a1, op.b0, op.b1, f0, f1, 'vinyl');
  blk(op.a0, op.a1, op.b1 - fw, op.b1, f0, f1, 'vinyl');
  blk(op.a0 - 0.05, op.a1 + 0.05, op.b0, op.b0 + 0.08, inSide * -0.25, inSide * 0.32, 'nickel');        // threshold
  const mid = (op.a0 + op.a1) / 2, pw = 0.22;
  // outer (fixed) panel on the right, inner (sliding) panel on the left, overlapping at the middle
  for (const [s0, s1, d] of [[mid - 0.1, op.a1 - fw, inSide * 0.0], [op.a0 + fw, mid + 0.1, inSide * 0.17]]) {
    const y0 = op.b0 + 0.08, y1 = op.b1 - fw, dd0 = d - inSide * 0.06, dd1 = d + inSide * 0.06;
    blk(s0, s0 + pw, y0, y1, dd0, dd1, 'vinyl'); blk(s1 - pw, s1, y0, y1, dd0, dd1, 'vinyl');
    blk(s0, s1, y0, y0 + 0.3, dd0, dd1, 'vinyl'); blk(s0, s1, y1 - pw, y1, dd0, dd1, 'vinyl');
    glass.push({ pts: [P(s0 + pw, d, y0 + 0.3), P(s1 - pw, d, y0 + 0.3), P(s1 - pw, d, y1 - pw), P(s0 + pw, d, y1 - pw)], n: wn(alongX, inSide) });
  }
  // pull handle on the sliding panel
  blk(mid - 0.02, mid + 0.04, op.b0 + 3.0, op.b0 + 3.9, inSide * 0.24, inSide * 0.3, 'nickel', { dens: 4 });
  // cellular shade on a headrail, drawn all the way down
  const o0 = inSide * t / 2, W = 0.29;
  blk(op.a0 - 0.1, op.a1 + 0.1, op.b1 + 0.02, op.b1 + 0.3, o0 + inSide * 0.02, o0 + inSide * 0.24, 'vinyl');
  blk(op.a0 - 0.05, op.a1 + 0.05, op.b0 + 0.35, op.b1 + 0.02, o0 + inSide * 0.08, o0 + inSide * 0.18, 'blind');
  blk(op.a0 - 0.05, op.a1 + 0.05, op.b0 + 0.3, op.b0 + 0.35, o0 + inSide * 0.07, o0 + inSide * 0.19, 'vinyl', { dens: 4 });
  // interior casing (no stool) and exterior trim
  const o1 = inSide * (t / 2 + 0.055);
  casingBox(b, alongX, c, op.a0 - W, op.a0, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a1, op.a1 + W, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a0 - W - 0.03, op.a1 + W + 0.03, op.b1 + 0.3, op.b1 + W + 0.32, o0, o1, inSide);
  const e0 = -inSide * t / 2, e1 = -inSide * (t / 2 + 0.07);
  casingBox(b, alongX, c, op.a0 - 0.35, op.a0, op.b0, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a1, op.a1 + 0.35, op.b0, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a0 - 0.35, op.a1 + 0.35, op.b1, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  // it doesn't open in the tour: keep the player inside
  const q0 = P(op.a0, -t / 2, 0), q1 = P(op.a1, t / 2, 0);
  b.collider(Math.min(q0[0], q1[0]), Math.max(q0[0], q1[0]), op.b0, op.b1, Math.min(q0[2], q1[2]), Math.max(q0[2], q1[2]));
}

// Double-hung vinyl window: frame, sashes, glass, interior casing + stool, raised blinds.
function windowUnit(b, glass, w, op) {
  const { alongX, t, c } = wallInfo(w);
  const P = (a, o, y) => wp(alongX, c, a, o, y);
  if (op.sidelight) {
    // leaded-glass sidelights beside the front door, textured from photo 56
    const u = op.a0 < 24 ? [0.02, 0.135] : [0.83, 0.985];
    for (const side of [-1, 1]) {
      b.poly([P(op.a0, side * 0.04, op.b0), P(op.a1, side * 0.04, op.b0), P(op.a1, side * 0.04, op.b1), P(op.a0, side * 0.04, op.b1)], 'frontDoor',
        { n: wn(alongX, side), uv: 'face', rect: side > 0 ? [u[0], 0.03, u[1], 0.97] : [u[1], 0.03, u[0], 0.97], lm: false, bake: false });
    }
    return;
  }
  const inSide = (() => {
    for (const s of [-1, 1]) { const p = P((op.a0 + op.a1) / 2, s * (t / 2 + 0.4), (op.b0 + op.b1) / 2); if (roomAt(p[0], p[2], (op.b0 + op.b1) / 2)) return s; }
    return 1;
  })();
  if (op.slider) return sliderUnit(b, glass, w, op, inSide);
  const fw = 0.16, depth = 0.34;
  const f0 = inSide * -0.02, f1 = inSide * (depth - 0.02);
  const frame = (s0, s1, y0, y1, d0 = f0, d1 = f1) => {
    const p0 = P(s0, d0, y0), p1 = P(s1, d1, y1);
    b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), 'vinyl', { dens: 8 });
  };
  frame(op.a0, op.a0 + fw, op.b0, op.b1); frame(op.a1 - fw, op.a1, op.b0, op.b1);
  frame(op.a0, op.a1, op.b1 - fw, op.b1); frame(op.a0, op.a1, op.b0, op.b0 + fw);
  const h = op.b1 - op.b0;
  const units = (op.a1 - op.a0) > 5.5 ? 2 : 1;
  const uw = (op.a1 - op.a0 - 2 * fw) / units;
  const sash = 0.13;
  for (let k = 0; k < units; k++) {
    const s0 = op.a0 + fw + k * uw, s1 = s0 + uw;
    if (k > 0) frame(s0 - 0.06, s0 + 0.06, op.b0, op.b1);
    const ys = h > 2.6
      ? [[op.b0 + fw, op.b0 + h / 2 + 0.03, inSide * 0.2], [op.b0 + h / 2 - 0.03, op.b1 - fw, inSide * 0.08]]
      : [[op.b0 + fw, op.b1 - fw, inSide * 0.14]];
    for (const [y0, y1, d] of ys) {
      const dd0 = d - inSide * 0.05, dd1 = d + inSide * 0.05;
      frame(s0, s0 + sash, y0, y1, dd0, dd1); frame(s1 - sash, s1, y0, y1, dd0, dd1);
      frame(s0, s1, y0, y0 + sash, dd0, dd1); frame(s0, s1, y1 - sash, y1, dd0, dd1);
      glass.push({ pts: [P(s0 + sash, d, y0 + sash), P(s1 - sash, d, y0 + sash), P(s1 - sash, d, y1 - sash), P(s0 + sash, d, y1 - sash)], n: wn(alongX, inSide) });
    }
  }
  // interior casing, stool and apron
  const o0 = inSide * t / 2, o1 = inSide * (t / 2 + 0.055), W = 0.29;
  casingBox(b, alongX, c, op.a0 - W, op.a0, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a1, op.a1 + W, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a0 - W - 0.03, op.a1 + W + 0.03, op.b1, op.b1 + W + 0.02, o0, o1, inSide);
  casingBox(b, alongX, c, op.a0 - W - 0.1, op.a1 + W + 0.1, op.b0 - 0.07, op.b0, inSide * (t / 2 - 0.2), inSide * (t / 2 + 0.2), inSide);
  casingBox(b, alongX, c, op.a0 - W + 0.02, op.a1 + W - 0.02, op.b0 - 0.37, op.b0 - 0.07, o0, o1, inSide);
  // raised blinds: slat stack at the head of the opening
  const bs = inSide * (t / 2 - 0.12);
  const p0 = P(op.a0 + 0.05, bs - inSide * 0.08, op.b1 - 0.42), p1 = P(op.a1 - 0.05, bs + inSide * 0.08, op.b1 - 0.02);
  b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), op.b1 - 0.42, op.b1 - 0.02, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), 'blind', { dens: 8 });
  // exterior trim
  const e0 = -inSide * t / 2, e1 = -inSide * (t / 2 + 0.07);
  casingBox(b, alongX, c, op.a0 - 0.35, op.a0, op.b0 - 0.2, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a1, op.a1 + 0.35, op.b0 - 0.2, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a0 - 0.35, op.a1 + 0.35, op.b1, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a0 - 0.4, op.a1 + 0.4, op.b0 - 0.2, op.b0, e0, -inSide * (t / 2 + 0.16), -inSide, 'vinyl');
}

// ======================================================= floors & ceilings ===
function floorsAndCeilings(b, glass) {
  const noFloor = new Set(['foyer', 'rear', 'stcl']);
  const noCeil = new Set(['stcl', 'rcl']);
  for (const r of L.ROOMS) {
    for (const [x0, x1, z0, z1] of r.rects) {
      if (!noFloor.has(r.id)) b.poly([[x0, r.h[0], z0], [x1, r.h[0], z0], [x1, r.h[0], z1], [x0, r.h[0], z1]], r.floor, { n: [0, 1, 0] });
      if (noCeil.has(r.id)) continue;
      const holes = L.SKYLIGHTS.filter(([a0, a1, c0, c1]) => a0 >= x0 && a1 <= x1 && c0 >= z0 && c1 <= z1 && r.h[1] === L.MAIN_CEIL);
      for (const [a0, a1, c0, c1] of rectMinus([x0, x1, z0, z1], holes)) {
        b.poly([[a0, r.h[1], c0], [a1, r.h[1], c0], [a1, r.h[1], c1], [a0, r.h[1], c1]], 'ceiling', { n: [0, -1, 0] });
      }
    }
    if (r.rug) {
      const [x0, x1, z0, z1, key] = r.rug, y = r.h[0] + 0.045;
      b.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], key, { n: [0, 1, 0] });
      b.box(x0, x1, r.h[0], y, z0, z1, key, { skip: ['py', 'ny'], dens: 4 });
    }
  }
  // landings, stair-closet floors, the lower-hall ceiling strip under the upper foyer
  b.poly([[20.8, L.MID, 24.6], [28.8, L.MID, 24.6], [28.8, L.MID, 30], [20.8, L.MID, 30]], 'tileLanding', { n: [0, 1, 0] });
  b.poly([[35, L.MID, -8], [42.2, L.MID, -8], [42.2, L.MID, -4.4], [35, L.MID, -4.4]], 'carpetBeige', { n: [0, 1, 0] });
  b.poly([[20.8, L.LOW, 19.5], [24.8, L.LOW, 19.5], [24.8, L.LOW, 20], [20.8, L.LOW, 20]], 'carpetBeige', { n: [0, 1, 0] });
  b.poly([[24.8, L.LOW, 19.5], [28.8, L.LOW, 19.5], [28.8, L.LOW, 24.6], [24.8, L.LOW, 24.6]], 'carpetBeige', { n: [0, 1, 0] });
  b.poly([[20.8, L.LOW_CEIL, 19.5], [28.8, L.LOW_CEIL, 19.5], [28.8, L.LOW_CEIL, 20], [20.8, L.LOW_CEIL, 20]], 'ceiling', { n: [0, -1, 0] });
  // exposed edges of the main floor at the stair openings
  b.poly([[20.8, L.LOW_CEIL - 0.05, 20], [24.8, L.LOW_CEIL - 0.05, 20], [24.8, L.MAIN, 20], [20.8, L.MAIN, 20]], 'paint:' + L.PAINT.tan, { n: [0, 0, 1] });
  b.poly([[38.9, 7.95, 0], [42.2, 7.95, 0], [42.2, L.MAIN, 0], [38.9, L.MAIN, 0]], 'paint:' + L.PAINT.tan, { n: [0, 0, -1] });
  for (const s of L.SOLIDS) {
    const [x0, x1, y0, y1, z0, z1] = s.b;
    b.box(x0, x1, y0, y1, z0, z1, 'paint:' + s.paint, { skip: ['ny'], collide: true, dens: s.ext ? 2 : undefined });
  }
  // skylight wells up through the roof, glazed at the top of a curb
  for (const [x0, x1, z0, z1] of L.SKYLIGHTS) {
    const y0 = L.MAIN_CEIL;
    const y1 = Math.max(roofUnder(x0, z0), roofUnder(x1, z1), roofUnder(x0, z1), roofUnder(x1, z0)) + 0.35;
    b.poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 'ceiling', { n: [0, 0, 1] });
    b.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'ceiling', { n: [0, 0, -1] });
    b.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'ceiling', { n: [1, 0, 0] });
    b.poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], 'ceiling', { n: [-1, 0, 0] });
    for (const [pts, n] of [
      [[[x0 - 0.2, y1, z0 - 0.2], [x1 + 0.2, y1, z0 - 0.2], [x1 + 0.2, y1 + 0.3, z0 - 0.2], [x0 - 0.2, y1 + 0.3, z0 - 0.2]], [0, 0, -1]],
      [[[x0 - 0.2, y1, z1 + 0.2], [x1 + 0.2, y1, z1 + 0.2], [x1 + 0.2, y1 + 0.3, z1 + 0.2], [x0 - 0.2, y1 + 0.3, z1 + 0.2]], [0, 0, 1]],
      [[[x0 - 0.2, y1, z0 - 0.2], [x0 - 0.2, y1, z1 + 0.2], [x0 - 0.2, y1 + 0.3, z1 + 0.2], [x0 - 0.2, y1 + 0.3, z0 - 0.2]], [-1, 0, 0]],
      [[[x1 + 0.2, y1, z0 - 0.2], [x1 + 0.2, y1, z1 + 0.2], [x1 + 0.2, y1 + 0.3, z1 + 0.2], [x1 + 0.2, y1 + 0.3, z0 - 0.2]], [1, 0, 0]],
    ]) b.poly(pts, 'vinyl', { n, dens: 3 });
    glass.push({ pts: [[x0, y1 + 0.25, z0], [x1, y1 + 0.25, z0], [x1, y1 + 0.25, z1], [x0, y1 + 0.25, z1]], n: [0, -1, 0] });
  }
}
function rectMinus([x0, x1, z0, z1], holes) {
  let rects = [[x0, x1, z0, z1]];
  for (const [a0, a1, c0, c1] of holes) {
    const next = [];
    for (const [r0, r1, s0, s1] of rects) {
      if (a1 <= r0 || a0 >= r1 || c1 <= s0 || c0 >= s1) { next.push([r0, r1, s0, s1]); continue; }
      if (s0 < c0) next.push([r0, r1, s0, c0]);
      if (c1 < s1) next.push([r0, r1, c1, s1]);
      if (r0 < a0) next.push([r0, a0, Math.max(s0, c0), Math.min(s1, c1)]);
      if (a1 < r1) next.push([a1, r1, Math.max(s0, c0), Math.min(s1, c1)]);
    }
    rects = next;
  }
  return rects;
}

// ============================================ baseboards, crown, chair rail ===
const CROWN = [[0.36, 0], [0.34, -0.03], [0.27, -0.05], [0.2, -0.1], [0.13, -0.19], [0.07, -0.29], [0.03, -0.33], [0.0, -0.36]];
const BASE = [[0, 0.45], [0.035, 0.45], [0.06, 0.41], [0.06, 0.0]];
const RAIL = [[0, 0.1], [0.05, 0.1], [0.07, 0.06], [0.07, -0.02], [0.04, -0.06], [0, -0.06]];

function moldings(b) {
  for (const r of L.ROOMS) {
    if (['foyer', 'rear', 'stcl', 'rcl'].includes(r.id)) continue;
    for (const [x0, x1, z0, z1] of r.rects) {
      const edges = [['x', z0, x0, x1, 1], ['x', z1, x0, x1, -1], ['z', x0, z0, z1, 1], ['z', x1, z0, z1, -1]];
      for (const [ax, c, e0, e1, s] of edges) {
        for (const w of L.WALLS) {
          const wi = wallInfo(w);
          if ((ax === 'x') !== wi.alongX || Math.abs(wi.c - c) > 0.06) continue;
          const lo = Math.max(e0, wi.a0), hi = Math.min(e1, wi.a1);
          if (hi - lo < 0.05) continue;
          const face = wi.c + s * wi.t / 2;
          const run = (y, profile, casingGap, pad) => {
            if (y < w.y[0] - EPS || y > w.y[1] + EPS) return;
            if (profile === BASE && w.y[1] < y + 0.6) return;      // wall stops at the floor (under a railing): no baseboard
            let segs = [[lo, hi]];
            for (const op of w.ops) {
              if (op.b0 - 0.05 <= y + pad && op.b1 + 0.05 >= y - pad) segs = subtract(segs, op.a0 - casingGap, op.a1 + casingGap);
            }
            for (const [a, bb] of segs) {
              if (bb - a < 0.05) continue;
              const origin = wi.alongX ? [a, y, face] : [face, y, a];
              extrude(b, profile, origin, wi.alongX ? [1, 0, 0] : [0, 0, 1], wi.alongX ? [0, 0, s] : [s, 0, 0], bb - a, TRIM, { dens: 8 });
            }
            return segs;
          };
          const segs = run(r.h[0], BASE, 0.29, 0.3) || [];
          // duplex outlets along the walls (not in closets)
          if (!/closet/i.test(r.name) && r.id !== 'util') {
            for (const [a, bb] of segs) {
              if (bb - a < 2.6) continue;
              for (let t = a + 1.4; t < bb - 1.2; t += 9) {
                const y = r.h[0] + 1.25, o0 = face, o1 = face + s * 0.025;
                const [x0, x1, z0, z1] = wi.alongX ? [t - 0.12, t + 0.12, Math.min(o0, o1), Math.max(o0, o1)] : [Math.min(o0, o1), Math.max(o0, o1), t - 0.12, t + 0.12];
                b.mbox(x0, x1, y - 0.19, y + 0.19, z0, z1, 'plate');
              }
            }
          }
          if (r.crown) run(r.h[1], CROWN, 0, 0.3);
          if (r.rail) run(r.h[0] + r.rail, RAIL, 0.29, 0.15);
        }
      }
    }
  }
}

// Light-switch plates beside each room door, on the latch side, on the side the door swings into.
function switchPlates(b) {
  for (const d of L.DOORS) {
    if (/closet/i.test(d.name) || d.group !== d.id) continue;
    const latch = d.hinge ? d.a0 - 0.29 - 0.3 : d.a1 + 0.29 + 0.3;
    const w =L.WALLS.find(w2 => { const wi = wallInfo(w2); return (d.axis === 'x') === wi.alongX && Math.abs(wi.c - d.c) < 0.01 && latch > wi.a0 && latch < wi.a1; });
    if (!w) continue;
    const wi = wallInfo(w);
    const s = d.swing, face = d.c + s * wi.t / 2, y = d.base + 4.0;
    const o0 = face, o1 = face + s * 0.025;
    if (d.axis === 'x') b.mbox(latch - 0.12, latch + 0.12, y - 0.19, y + 0.19, Math.min(o0, o1), Math.max(o0, o1), 'plate');
    else b.mbox(Math.min(o0, o1), Math.max(o0, o1), y - 0.19, y + 0.19, latch - 0.12, latch + 0.12, 'plate');
  }
}

// ================================================================ stairs ===
// Sloped undersides of the two flights that climb over closets (z → height).
const SOFFITS = {
  frontUp: z => L.MID - 0.7 + (24.6 - z) / 4.6 * (L.MAIN - 1.25 - (L.MID - 0.7)),
  rearUp: z => L.MID - 0.7 + (z + 4.4) / 4.4 * (L.MAIN - 1.25 - (L.MID - 0.7)),
};
// Steps of a flight: tread top, z extent and the edge toward the high end.
function flightSteps(f) {
  const [, , z0, z1] = f.r;
  const lo = Math.min(f.h0, f.h1), hi = Math.max(f.h0, f.h1);
  const n = f.risers, rise = (hi - lo) / n, d = (z1 - z0) / n, upAtZ1 = f.h1 > f.h0;
  const out = [];
  for (let k = 1; k <= n; k++) {
    const za = upAtZ1 ? z0 + (k - 1) * d : z1 - k * d;
    out.push({ top: lo + k * rise, za, zb: za + d, upper: upAtZ1 ? za + d : za });
  }
  return out;
}
const OPEN_W = 0.2;   // knee wall half-thickness the open side of a flight runs over

function stairs(b) {
  for (const f of L.FLIGHTS) {
    const [fx0, fx1, z0, z1] = f.r;
    const x0 = fx0 - (f.open < 0 ? OPEN_W : 0), x1 = fx1 + (f.open > 0 ? OPEN_W : 0);
    const lo = Math.min(f.h0, f.h1), hi = Math.max(f.h0, f.h1);
    const n = f.risers, rise = (hi - lo) / n, d = (z1 - z0) / n;
    const upAtZ1 = f.h1 > f.h0;
    const soffit = SOFFITS[f.id];
    const riserMat = f.finish === 'oak' ? TRIM : f.finish === 'carpet' ? 'carpetBeige' : 'stone';
    const treadMat = f.finish === 'oak' ? 'oakTread' : riserMat;
    for (let k = 1; k <= n; k++) {
      const top = lo + k * rise;
      const za = upAtZ1 ? z0 + (k - 1) * d : z1 - k * d;
      const zb = za + d;
      const nose = upAtZ1 ? -0.09 : 0.09;          // nosing overhangs toward the low end
      const zFront = upAtZ1 ? za : zb;
      const base = soffit ? soffit(upAtZ1 ? zb : za) : 0;
      b.box(x0, x1, base, top - 0.09, Math.min(za, zb), Math.max(za, zb), riserMat, { skip: ['ny', 'py'], dens: 6 });
      const t0 = Math.min(za, zb, zFront + nose), t1 = Math.max(za, zb, zFront + nose);
      // open side: tread ends run 0.05 past the stringer and show their end grain
      const tx0 = x0 - (f.open < 0 ? 0.05 : 0), tx1 = x1 + (f.open > 0 ? 0.05 : 0);
      const tSkip = ['ny', ...(f.open < 0 ? [] : ['nx']), ...(f.open > 0 ? [] : ['px'])];
      b.box(tx0, tx1, top - 0.09, top, t0, t1, treadMat, { skip: tSkip, dens: 7, uv: f.finish === 'oak' ? 'face' : undefined, bevel: 0.035 });
    }
    if (soffit) {
      const zLow = upAtZ1 ? z0 : z1, zHigh = upAtZ1 ? z1 : z0;
      b.poly([[fx0, soffit(zLow), zLow], [fx1, soffit(zLow), zLow], [fx1, soffit(zHigh), zHigh], [fx0, soffit(zHigh), zHigh]], 'paint:' + L.PAINT.closet, { n: [0, -1, 0] });
    }
  }
  // knee walls under the open side of a flight: the wall stops under each riser block (the treads
  // and risers run over it); a white stringer band follows the slope below the steps.
  for (const k of L.KNEEWALLS.filter(k => k.closed)) {
    const fl = L.FLIGHTS.find(f => f.id === k.flight);
    const lo = Math.min(fl.h0, fl.h1), rise = (Math.max(fl.h0, fl.h1) - lo) / fl.risers, d = (fl.r[3] - fl.r[2]) / fl.risers;
    const lowZ = fl.h0 < fl.h1 ? fl.r[2] : fl.r[3];
    const top = z => lo + rise * (1 + Math.abs(z - lowZ) / d) + 0.12;
    const zs = [];
    for (let i = 0; i <= 16; i++) zs.push(k.z0 + (k.z1 - k.z0) * i / 16);
    const T = OPEN_W;
    for (const s of [-1, 1]) {
      const x = k.x + s * T;
      for (let i = 0; i < zs.length - 1; i++) {
        const za = zs[i], zb = zs[i + 1];
        b.poly([[x, 0, za], [x, 0, zb], [x, top(zb), zb], [x, top(za), za]], paintFor(roomAt(x + s * 0.3, (za + zb) / 2, 1), 1), { n: [s, 0, 0] });
      }
    }
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1];
      b.poly([[k.x - T - 0.03, top(za), za], [k.x + T + 0.03, top(za), za], [k.x + T + 0.03, top(zb), zb], [k.x - T - 0.03, top(zb), zb]], TRIM, { n: [0, 1, 0] });
    }
    b.collider(k.x - T, k.x + T, 0, Math.max(top(k.z0), top(k.z1)), k.z0, k.z1);
  }
  for (const k of L.KNEEWALLS.filter(k => !k.closed)) {
    const fl = L.FLIGHTS.find(f => f.id === k.flight);
    const soff = SOFFITS[fl.id];
    const lo = Math.min(fl.h0, fl.h1), hi = Math.max(fl.h0, fl.h1), hiZ = fl.h0 > fl.h1 ? fl.r[2] : fl.r[3];
    const segs = flightSteps(fl).map(s => ({ za: s.za, zb: s.zb, top: soff(s.upper), band: true }));
    if (k.z0 < fl.r[2] - 1e-6) segs.push({ za: k.z0, zb: fl.r[2], top: Math.abs(fl.r[2] - hiZ) < 1e-6 ? hi : lo, cap: true });
    if (k.z1 > fl.r[3] + 1e-6) segs.push({ za: fl.r[3], zb: k.z1, top: Math.abs(fl.r[3] - hiZ) < 1e-6 ? hi : lo, cap: true });
    const T = OPEN_W;
    for (const s of [-1, 1]) {
      const x = k.x + s * T;
      for (const g of segs) {
        const r = roomAt(x + s * 0.3, (g.za + g.zb) / 2, 1);
        const paint = paintFor(r, 1);
        if (g.band && s === fl.open) {
          const ya = Math.min(soff(g.za) - 0.6, g.top), yb = Math.min(soff(g.zb) - 0.6, g.top);
          b.poly([[x, 0, g.za], [x, 0, g.zb], [x, yb, g.zb], [x, ya, g.za]], paint, { n: [s, 0, 0] });
          b.poly([[x, ya, g.za], [x, yb, g.zb], [x, g.top, g.zb], [x, g.top, g.za]], TRIM, { n: [s, 0, 0] });
        } else {
          b.poly([[x, 0, g.za], [x, 0, g.zb], [x, g.top, g.zb], [x, g.top, g.za]], paint, { n: [s, 0, 0] });
        }
      }
    }
    for (const g of segs) {
      if (g.cap) b.poly([[k.x - T, g.top, g.za], [k.x + T, g.top, g.za], [k.x + T, g.top, g.zb], [k.x - T, g.top, g.zb]], TRIM, { n: [0, 1, 0] });
      b.collider(k.x - T, k.x + T, 0, g.top, g.za, g.zb);
    }
  }
  // skirt boards along the stair walls
  const skirt = (x, face, z0, z1, h0, h1) => {
    const bot0 = h0 - 0.2, bot1 = h1 - 0.2;
    b.poly([[x, Math.max(bot0, Math.min(h0, h1)), z0], [x, Math.max(bot1, Math.min(h0, h1)), z1], [x, h1 + 0.75, z1], [x, h0 + 0.75, z0]], TRIM, { n: [face, 0, 0], dens: 7 });
    b.poly([[x, h0 + 0.75, z0], [x, h1 + 0.75, z1], [x + face * 0.06, h1 + 0.75, z1], [x + face * 0.06, h0 + 0.75, z0]], TRIM, { n: [0, 1, 0], dens: 4 });
  };
  skirt(21.0 + 0.06, 1, 19.5, 24.6, L.LOW, L.MID);
  skirt(24.6 - 0.06, -1, 19.5, 24.6, L.LOW, L.MID);
  skirt(28.6 - 0.06, -1, 20, 24.6, L.MAIN, L.MID);
  skirt(35.25 + 0.06, 1, -4.4, 0, L.MID, L.MAIN);
  skirt(41.95 - 0.06, -1, -4.4, 0, L.MID, L.LOW);
}

// ============================================================== railings ===
function beam(b, p0, p1, w, h, mat, o = {}) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  let g;
  if (o.round) {
    g = new THREE.CylinderGeometry(w / 2, w / 2, len, 14, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  } else {
    // box with its long axis on the run, width horizontal, height roughly vertical
    g = new THREE.BoxGeometry(w, h, len);
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();
    const m = new THREE.Matrix4().makeBasis(side, up, dir);
    g.applyMatrix4(m);
  }
  g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  b.mesh(g, mat, o);
}

function railings(b) {
  for (const r of L.RAILINGS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const at = t => [r.x0 + (r.x1 - r.x0) * t, r.base(t), r.z0 + (r.z1 - r.z0) * t];
    const sloped = r.base(0) !== r.base(1);
    const p0 = at(0), p1 = at(1);
    if (!sloped) beam(b, [p0[0], p0[1] + 0.08, p0[2]], [p1[0], p1[1] + 0.08, p1[2]], 0.22, 0.16, TRIM);
    beam(b, [p0[0], p0[1] + r.h, p0[2]], [p1[0], p1[1] + r.h, p1[2]], 0.24, 0.2, 'oak');
    const fl = r.flight && L.FLIGHTS.find(f => f.id === r.flight);
    if (fl) {
      // two balusters standing on each tread, up to the sloped rail
      for (const s of flightSteps(fl)) {
        for (const q of [0.27, 0.73]) {
          const z = s.za + (s.zb - s.za) * q, t = (z - r.z0) / (r.z1 - r.z0);
          if (t < 0.02 || t > 0.98) continue;
          const x = r.x0 + (r.x1 - r.x0) * t;
          b.mbox(x - 0.055, x + 0.055, s.top, r.base(t) + r.h - 0.08, z - 0.055, z + 0.055, TRIM);
        }
      }
    } else {
      const n = Math.max(2, Math.round(len / 0.36));
      for (let i = 0; i < n; i++) {
        const p = at((i + 0.5) / n);
        b.mbox(p[0] - 0.055, p[0] + 0.055, p[1] + (sloped ? 0 : 0.16), p[1] + r.h - 0.08, p[2] - 0.055, p[2] + 0.055, TRIM);
      }
    }
    for (const nt of r.newels) {
      const p = at(nt);
      const baseY = r.newelBase ? r.newelBase(nt) : sloped ? p[1] - 0.12 : r.base(nt);
      const s = 0.23;
      b.box(p[0] - s, p[0] + s, baseY, p[1] + r.h + 0.35, p[2] - s, p[2] + s, TRIM, { skip: ['ny'], dens: 8, bevel: 0.02 });
      b.box(p[0] - s - 0.05, p[0] + s + 0.05, p[1] + r.h + 0.35, p[1] + r.h + 0.5, p[2] - s - 0.05, p[2] + s + 0.05, TRIM, { dens: 8, bevel: 0.03 });
    }
    b.collider(Math.min(r.x0, r.x1) - 0.14, Math.max(r.x0, r.x1) + 0.14, Math.min(r.base(0), r.base(1)), Math.max(r.base(0), r.base(1)) + r.h,
      Math.min(r.z0, r.z1) - 0.14, Math.max(r.z0, r.z1) + 0.14);
  }
  for (const [x0, z0, x1, z1, h0, h1] of L.HANDRAILS) {
    beam(b, [x0, h0, z0], [x1, h1, z1], 0.17, 0, 'oak', { round: true });
    const wallX = x0 < 24 ? 20.8 + 0.2 : x0 < 30 ? 28.8 - 0.2 : x0 < 38 ? 35 + 0.25 : 42.2 - 0.2;
    for (const t of [0.12, 0.88]) {
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = h0 + (h1 - h0) * t;
      b.mbox(Math.min(wallX, x) - 0.02, Math.max(wallX, x) + 0.02, y - 0.25, y - 0.18, z - 0.03, z + 0.03, 'nickel');
    }
  }
}

// ============================================================== fixtures ===
function fixtures(b, lamps) {
  for (const f of L.FIXTURES) {
    const { x, z, y } = f;
    if (f.kind === 'can') {
      b.prim(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 24), TRIM, x, y - 0.015, z);
      b.prim(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 24), 'lampGlow', x, y - 0.034, z, 0, { bake: false });
      lamps.push({ x, y: y - 0.06, z, r: 0.22, kind: 'down', I: 5.5 });
    } else if (f.kind === 'dome') {
      b.prim(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32), 'bronze', x, y - 0.025, z);
      const g = new THREE.SphereGeometry(0.58, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      g.scale(1, 0.55, 1);
      b.prim(g, 'alabaster', x, y - 0.05, z, 0, { bake: false });
      b.prim(new THREE.SphereGeometry(0.05, 10, 6), 'bronze', x, y - 0.38, z);
      lamps.push({ x, y: y - 0.25, z, r: 0.35, kind: 'omni', I: 8 });
    } else if (f.kind === 'shop') {
      b.mbox(x - f.len / 2, x + f.len / 2, y - 0.14, y, z - 0.25, z + 0.25, TRIM);
      b.mbox(x - f.len / 2 + 0.1, x + f.len / 2 - 0.1, y - 0.16, y - 0.14, z - 0.2, z + 0.2, 'lampGlow', { bake: false });
      for (const dx of [-f.len / 3, 0, f.len / 3]) lamps.push({ x: x + dx, y: y - 0.2, z, r: 0.25, kind: 'down', I: 9 });
    } else if (f.kind === 'pendant') {
      const bot = y - f.drop;
      b.prim(new THREE.CylinderGeometry(0.02, 0.02, f.drop - 0.9, 8), 'bronze', x, y - (f.drop - 0.9) / 2, z);
      b.prim(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20), 'bronze', x, y - 0.03, z);
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; pts.push(new THREE.Vector2(0.001 + Math.sin(a) * 0.72, -Math.cos(a) * 0.42)); }
      b.prim(new THREE.LatheGeometry(pts, 32), 'amberGlass', x, bot + 0.45, z, 0, { bake: false });
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        b.prim(new THREE.TorusGeometry(0.28, 0.018, 6, 16, Math.PI), 'bronze', x + Math.cos(a) * 0.55, bot + 0.75, z + Math.sin(a) * 0.55, -a + Math.PI / 2);
      }
      b.prim(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 32), 'bronze', x, bot + 0.45, z);
      lamps.push({ x, y: bot + 0.3, z, r: 0.35, kind: 'omni', I: 12 });
    } else if (f.kind === 'chandelier') {
      const cy = y - f.drop;
      b.prim(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), 'bronze', x, y - 0.03, z);
      b.prim(new THREE.CylinderGeometry(0.025, 0.025, f.drop - 0.5, 8), 'bronze', x, y - (f.drop - 0.5) / 2, z);
      b.prim(new THREE.SphereGeometry(0.2, 16, 12), 'bronze', x, cy + 0.2, z);
      b.prim(new THREE.CylinderGeometry(0.06, 0.12, 0.5, 12), 'bronze', x, cy - 0.1, z);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const ex = x + Math.cos(a) * 1.1, ez = z + Math.sin(a) * 1.1;
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, cy + 0.1, z), new THREE.Vector3(x + Math.cos(a) * 0.9, cy - 0.35, z + Math.sin(a) * 0.9), new THREE.Vector3(ex, cy + 0.15, ez));
        b.mesh(new THREE.TubeGeometry(curve, 12, 0.035, 6), 'bronze');
        b.prim(new THREE.CylinderGeometry(0.07, 0.05, 0.12, 10), 'bronze', ex, cy + 0.2, ez);
        b.prim(new THREE.CylinderGeometry(0.16, 0.28, 0.42, 20, 1, true), 'amberGlass', ex, cy + 0.45, ez, 0, { bake: false });
        lamps.push({ x: ex, y: cy + 0.42, z: ez, r: 0.12, kind: 'omni', I: 2.2 });
      }
    }
  }
}

// =============================================================== kitchen ===
// Cream flat-panel cabinets with brass bar pulls, cream solid-surface tops with a rounded end,
// stainless appliances (photos 3, 4, 37).
function roundedEnd(len, depth, radius) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, depth - radius);
  s.absarc(len - radius, depth - radius, radius, 0, Math.PI / 2, false);
  s.lineTo(0, depth); s.lineTo(0, 0);
  return s;
}
function kitchen(b) {
  const F = L.MAIN, CAB = 'cabinet', TOP = 'counter';
  const baseH = 2.95, topT = 0.125, depth = 2.05, kick = 0.35;
  const W = 26.6 + 0.2;               // west wall face
  const N = 0.25;                     // north wall face
  const baseWest = (z0, z1, doors) => {
    b.box(W, W + depth - 0.1, F + kick, F + baseH - topT, z0, z1, CAB, { skip: ['ny', 'nx'], collide: true });
    b.box(W, W + depth - 0.2, F, F + kick, z0, z1, 'paint:#3a3632', { skip: ['ny', 'nx', 'py'] });
    cabinetFronts(b, 'x+', W + depth - 0.1, z0, z1, F + kick, F + baseH - topT, doors, true);
  };
  const baseNorth = (x0, x1, doors) => {
    b.box(x0, x1, F + kick, F + baseH - topT, N, N + depth - 0.1, CAB, { skip: ['ny', 'nz'], collide: true });
    b.box(x0, x1, F, F + kick, N, N + depth - 0.2, 'paint:#3a3632', { skip: ['ny', 'nz', 'py'] });
    cabinetFronts(b, 'z+', N + depth - 0.1, x0, x1, F + kick, F + baseH - topT, doors, true);
  };
  // west run: corner base, range, pantry tower, fridge
  baseWest(N + depth - 0.1, 3.0, 1);
  range(b, W, 3.0, 5.5);
  b.box(W, W + depth - 0.1, F, F + 7.6, 5.5, 6.72, CAB, { skip: ['ny', 'nx'], collide: true });
  cabinetFronts(b, 'x+', W + depth - 0.1, 5.5, 6.72, F + 0.1, F + 4.4, 1, false);
  cabinetFronts(b, 'x+', W + depth - 0.1, 5.5, 6.72, F + 4.5, F + 7.5, 1, false);
  fridge(b, W, 6.75, 9.65, F);
  // north run: bases, sink under the window, dishwasher, rounded end cabinet at the stair
  baseNorth(W, 30.3, 2);
  baseNorth(30.3, 32.6, 2);
  dishwasher(b, 32.6, 34.5, N, F);
  const xEnd = 34.5;
  // countertops (west strip, corner, north run with sink cut-out)
  const cTop = F + baseH;
  const z1 = N + depth + 0.08;
  b.box(W, W + depth + 0.08, cTop - topT, cTop, z1, 3.0, TOP, { skip: ['nx', 'pz'], dens: 7 });
  const sx0 = 30.55, sx1 = 32.35, sz0 = N + 0.3, sz1 = N + 1.75;
  const topPiece = (x0, x1, za, zb, skip) => b.box(x0, x1, cTop - topT, cTop, za, zb, TOP, { skip, dens: 7 });
  topPiece(W, sx0, N, z1, ['nz', 'nx', 'px']);
  topPiece(sx1, xEnd, N, z1, ['nz', 'nx', 'px']);
  topPiece(sx0, sx1, N, sz0, ['nz', 'nx', 'px']);
  topPiece(sx0, sx1, sz1, z1, ['nz', 'nx', 'px']);
  // rounded end of the counter (plan: counter stops at x = 35)
  const endTop = new THREE.ExtrudeGeometry(roundedEnd(35.0 - xEnd, z1 - N, 0.45), { depth: topT, bevelEnabled: false, curveSegments: 16 });
  endTop.rotateX(Math.PI / 2);
  b.prim(endTop, TOP, xEnd, cTop, N);
  const endBody = new THREE.ExtrudeGeometry(roundedEnd(35.0 - xEnd - 0.08, z1 - N - 0.18, 0.4), { depth: baseH - topT - kick, bevelEnabled: false, curveSegments: 16 });
  endBody.rotateX(Math.PI / 2);
  b.prim(endBody, CAB, xEnd, cTop - topT, N);
  b.box(xEnd, 34.85, F, F + kick, N, N + depth - 0.2, 'paint:#3a3632', { skip: ['ny', 'nz', 'py'] });
  b.collider(xEnd, 35.0, F, cTop, N, z1);
  // sink basin + faucet
  sinkInner(b, sx0, sx1, sz0, sz1, cTop - 0.75, cTop - topT);
  faucet(b, (sx0 + sx1) / 2, cTop, N + 0.12, 's');
  // backsplash
  b.box(W, 35.0, cTop, cTop + 0.3, N, N + 0.05, TOP, { skip: ['nz', 'ny'], dens: 6 });
  b.box(W, W + 0.05, cTop, cTop + 0.3, N, 3.0, TOP, { skip: ['nx', 'ny'], dens: 6 });
  // uppers: north wall either side of the window (30.6..33.4) and on the west wall
  const uy0 = F + 4.5, uy1 = F + 7.5, ud = 1.1;
  const upperN = (x0, x1, doors) => { b.box(x0, x1, uy0, uy1, N, N + ud, CAB, { skip: ['nz'] }); cabinetFronts(b, 'z+', N + ud, x0, x1, uy0 + 0.02, uy1 - 0.02, doors, false); };
  const upperW = (z0, z1b, doors, y0 = uy0) => { b.box(W, W + ud, y0, uy1, z0, z1b, CAB, { skip: ['nx'] }); cabinetFronts(b, 'x+', W + ud, z0, z1b, y0 + 0.02, uy1 - 0.02, doors, false); };
  upperN(W + ud, 30.25, 2);
  upperN(33.75, 35.0, 1);
  upperW(N, 3.0, 1);
  upperW(3.0, 5.5, 2, F + 6.2);
  microwave(b, W, 3.05, 5.45, F + 4.6);
  b.box(W, W + 2.4, F + 6.4, uy1, 6.72, 9.7, CAB, { skip: ['nx', 'ny'] });
}
function cabinetFronts(b, facing, face, a0, a1, y0, y1, doors, drawer) {
  const gap = 0.02, depth = 0.06;
  const fr = (s0, s1, t0, t1) => {
    if (facing === 'x+') b.box(face, face + depth, t0, t1, s0, s1, 'cabinet', { skip: ['nx'], dens: 7, bevel: 0.014 });
    else b.box(s0, s1, t0, t1, face, face + depth, 'cabinet', { skip: ['nz'], dens: 7, bevel: 0.014 });
  };
  const pull = (s, t, horiz) => {
    const L2 = horiz ? 0.35 : 0.3;
    if (facing === 'x+') {
      if (horiz) b.mbox(face + depth, face + depth + 0.07, t - 0.015, t + 0.015, s - L2 / 2, s + L2 / 2, 'brass');
      else b.mbox(face + depth, face + depth + 0.07, t - L2 / 2, t + L2 / 2, s - 0.015, s + 0.015, 'brass');
    } else if (horiz) b.mbox(s - L2 / 2, s + L2 / 2, t - 0.015, t + 0.015, face + depth, face + depth + 0.07, 'brass');
    else b.mbox(s - 0.015, s + 0.015, t - L2 / 2, t + L2 / 2, face + depth, face + depth + 0.07, 'brass');
  };
  let top = y1;
  const w = (a1 - a0) / doors;
  if (drawer && y1 - y0 > 2) {
    const dy = y1 - 0.5;
    for (let i = 0; i < doors; i++) { fr(a0 + i * w + gap, a0 + (i + 1) * w - gap, dy + gap, y1 - gap); pull(a0 + (i + 0.5) * w, (dy + y1) / 2, true); }
    top = dy;
  }
  for (let i = 0; i < doors; i++) {
    const s0 = a0 + i * w + gap, s1 = a0 + (i + 1) * w - gap;
    fr(s0, s1, y0 + gap, top - gap);
    const s = doors === 2 ? (i === 0 ? s1 - 0.15 : s0 + 0.15) : s1 - 0.15;
    pull(s, drawer ? top - 0.3 : y0 + 0.35, false);
  }
}
function range(b, W, z0, z1) {
  const F = L.MAIN;
  b.box(W, W + 2.1, F, F + 3.0, z0 + 0.02, z1 - 0.02, 'stainless', { skip: ['nx', 'ny'], collide: true, bevel: 0.03 });
  b.box(W + 2.1, W + 2.14, F + 0.7, F + 2.3, z0 + 0.25, z1 - 0.25, 'blackGlass', { skip: ['nx'] });
  b.box(W + 0.05, W + 2.1, F + 3.0, F + 3.03, z0 + 0.05, z1 - 0.05, 'blackGlass', { skip: ['ny'] });
  b.box(W, W + 0.35, F + 3.0, F + 3.7, z0 + 0.02, z1 - 0.02, 'stainless', { skip: ['nx', 'ny'] });
  beam(b, [W + 2.22, F + 2.5, z0 + 0.3], [W + 2.22, F + 2.5, z1 - 0.3], 0.06, 0, 'stainless', { round: true });
  for (const [dz, dx] of [[0.6, 0.6], [1.9, 0.6], [0.6, 1.5], [1.9, 1.5]]) {
    b.prim(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 20), 'castIron', W + dx, F + 3.05, z0 + dz);
  }
  for (let i = 0; i < 4; i++) b.prim(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), 'stainless', W + 2.14, F + 2.75, z0 + 0.45 + i * 0.52, 0, { rz: Math.PI / 2 });
}
function microwave(b, W, z0, z1, y) {
  b.box(W, W + 1.35, y, y + 1.4, z0, z1, 'stainless', { skip: ['nx'], bevel: 0.03 });
  b.box(W + 1.35, W + 1.37, y + 0.2, y + 1.25, z0 + 0.1, z1 - 0.7, 'blackGlass', { skip: ['nx'] });
  b.box(W + 1.35, W + 1.37, y + 0.2, y + 1.25, z1 - 0.62, z1 - 0.1, 'blackGlass', { skip: ['nx'] });
}
function fridge(b, W, z0, z1, F) {
  const D = 2.35, H = 5.9;
  b.box(W, W + D - 0.1, F, F + H, z0, z1, 'stainless', { skip: ['nx', 'ny'], collide: true, bevel: 0.04 });
  const zm = (z0 + z1) / 2;
  b.box(W + D - 0.1, W + D, F + 2.3, F + H - 0.05, z0 + 0.02, zm - 0.01, 'stainless', { skip: ['nx'], bevel: 0.03 });
  b.box(W + D - 0.1, W + D, F + 2.3, F + H - 0.05, zm + 0.01, z1 - 0.02, 'stainless', { skip: ['nx'], bevel: 0.03 });
  b.box(W + D - 0.1, W + D, F + 0.35, F + 2.25, z0 + 0.02, z1 - 0.02, 'stainless', { skip: ['nx'], bevel: 0.03 });
  b.box(W + D - 0.2, W + D - 0.1, F, F + 0.33, z0 + 0.1, z1 - 0.1, 'paint:#2a2826', { skip: ['nx'] });
  beam(b, [W + D + 0.12, F + 2.7, zm - 0.12], [W + D + 0.12, F + 5.1, zm - 0.12], 0.07, 0, 'stainless', { round: true });
  beam(b, [W + D + 0.12, F + 2.7, zm + 0.12], [W + D + 0.12, F + 5.1, zm + 0.12], 0.07, 0, 'stainless', { round: true });
  beam(b, [W + D + 0.12, F + 2.0, z0 + 0.4], [W + D + 0.12, F + 2.0, z1 - 0.4], 0.07, 0, 'stainless', { round: true });
}
function dishwasher(b, x0, x1, N, F) {
  b.box(x0, x1, F + 0.35, F + 2.82, N, N + 2.0, 'stainless', { skip: ['nz'], collide: true, bevel: 0.02 });
  b.box(x0 + 0.02, x1 - 0.02, F, F + 0.35, N, N + 1.9, 'paint:#2a2826', { skip: ['nz', 'py'] });
  beam(b, [x0 + 0.15, F + 2.55, N + 2.12], [x1 - 0.15, F + 2.55, N + 2.12], 0.06, 0, 'stainless', { round: true });
}
function sinkInner(b, x0, x1, z0, z1, y0, y1) {
  const o = { dens: 8 };
  b.poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 'porcelain', { ...o, n: [0, 1, 0] });
  b.poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 'porcelain', { ...o, n: [0, 0, 1] });
  b.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'porcelain', { ...o, n: [0, 0, -1] });
  b.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'porcelain', { ...o, n: [1, 0, 0] });
  b.poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], 'porcelain', { ...o, n: [-1, 0, 0] });
  b.prim(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16), 'stainless', (x0 + x1) / 2, y0 + 0.01, (z0 + z1) / 2);
}
function faucet(b, x, y, z, face, mat = 'chrome') {
  const dir = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[face];
  b.prim(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 16), mat, x, y + 0.04, z);
  b.prim(new THREE.CylinderGeometry(0.045, 0.05, 0.85, 12), mat, x, y + 0.45, z);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y + 0.85, z), new THREE.Vector3(x, y + 1.15, z), new THREE.Vector3(x + dir[0] * 0.7, y + 1.0, z + dir[1] * 0.7));
  b.mesh(new THREE.TubeGeometry(curve, 16, 0.04, 8), mat);
  b.prim(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), mat, x + dir[0] * 0.7, y + 0.9, z + dir[1] * 0.7);
}

// ============================================================= furniture ===
function furniture(b, mirrors, glass) {
  for (const f of L.FURNITURE) {
    const fn = FURN[f.type];
    if (fn) fn(b, f, mirrors, glass);
  }
}
const faceDir = f => ({ n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f]);

const FURN = {
  bed(b, f) {
    if (f.head === 's') {
      const [x0, x1, z0, z1] = f.r;
      return rotated(b, (x0 + x1) / 2, (z0 + z1) / 2, Math.PI, sub => FURN.bed(sub, { ...f, head: 'n' }));
    }
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = f.wood === '#f4f2ec' ? 'paintedWood' : 'stain:' + f.wood;
    const king = f.size === 'king';
    const headN = f.head === 'n';
    const hb = king ? 0.45 : 0.3;
    const mX0 = headN ? x0 + 0.25 : x0 + hb, mX1 = x1 - 0.25;
    const mZ0 = headN ? z0 + hb : z0 + 0.25, mZ1 = headN ? z1 - 0.35 : z1 - 0.25;
    b.box(mX0 - 0.1, mX1 + 0.1, F + 0.35, F + 1.25, mZ0 - 0.05, mZ1 + 0.05, wood, { skip: ['ny'], collide: true, bevel: 0.04 });
    b.box(mX0, mX1, F + 1.25, F + 2.1, mZ0, mZ1, 'fabric:#f1efe9', { skip: ['ny'], bevel: 0.14 });
    const dv = headN ? [mX0 - 0.15, mX1 + 0.15, mZ0 + (mZ1 - mZ0) * 0.28, mZ1 + 0.12] : [mX0 + (mX1 - mX0) * 0.28, mX1 + 0.12, mZ0 - 0.15, mZ1 + 0.15];
    b.box(dv[0], dv[1], F + 1.0, F + 2.22, dv[2], dv[3], king ? 'fabric:#cfcbb7' : 'fabric:#e8c9d3', { skip: ['ny'], bevel: 0.16 });
    const pillows = king ? 2 : 1;
    for (let i = 0; i < pillows; i++) {
      const span = headN ? (mX1 - mX0) / pillows : (mZ1 - mZ0);
      const g = new THREE.CapsuleGeometry(0.34, Math.max(0.4, (headN ? span : 2.6) - 0.9), 6, 12);
      g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1);
      if (!headN) g.rotateY(Math.PI / 2);
      const px = headN ? mX0 + (i + 0.5) * (mX1 - mX0) / pillows : mX0 + 0.55;
      const pz = headN ? mZ0 + 0.55 : (mZ0 + mZ1) / 2;
      b.prim(g, 'fabric:#f4f2ee', px, F + 2.3, pz);
    }
    if (headN) {
      sleighPanel(b, x0, x1, z0, z0 + hb, F, king ? 4.7 : 3.4, wood, 'z');
      b.box(x0, x1, F, F + (king ? 2.9 : 2.3), mZ1 + 0.05, z1, wood, { skip: ['ny'], collide: true, bevel: 0.04 });
      b.box(x0 - 0.05, x1 + 0.05, F + (king ? 2.9 : 2.3), F + (king ? 3.05 : 2.4), mZ1, z1 + 0.08, wood, { bevel: 0.05 });
    } else {
      sleighPanel(b, x0, x0 + hb, z0, z1, F, 3.6, wood, 'x');
      b.box(x1 - 0.25, x1, F, F + 2.6, z0, z1, wood, { skip: ['ny'], collide: true, bevel: 0.04 });
    }
  },
  nightstand(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = 'stain:' + f.wood;
    b.box(x0, x1, F + 0.25, F + 2.2, z0, z1, wood, { skip: ['ny'], collide: true, bevel: 0.03 });
    for (const [a, c] of [[x0 + 0.05, z1 - 0.2], [x1 - 0.2, z1 - 0.2], [x0 + 0.05, z0], [x1 - 0.2, z0]]) b.box(a, a + 0.15, F, F + 0.25, c, c + 0.15, wood, { skip: ['ny', 'py'] });
    b.box(x0 + 0.1, x1 - 0.1, F + 1.35, F + 2.05, z1, z1 + 0.04, wood, { skip: ['nz'] });
    b.box(x0 + 0.1, x1 - 0.1, F + 0.45, F + 1.25, z1, z1 + 0.04, wood, { skip: ['nz'] });
    b.prim(new THREE.SphereGeometry(0.05, 10, 8), 'brass', (x0 + x1) / 2, F + 1.7, z1 + 0.07);
    b.prim(new THREE.SphereGeometry(0.05, 10, 8), 'brass', (x0 + x1) / 2, F + 0.85, z1 + 0.07);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.prim(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 18), 'ceramic', cx, F + 2.65, cz);
    b.prim(new THREE.CylinderGeometry(0.35, 0.48, 0.7, 24, 1, true), 'shade', cx, F + 3.45, cz, 0, { bake: false });
  },
  dresser(b, f, mirrors) {
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = f.wood === '#f4f2ec' ? 'paintedWood' : 'stain:' + f.wood;
    const [dx, dz] = faceDir(f.face);
    const h = f.h;
    b.box(x0, x1, F + 0.25, F + h - 0.1, z0, z1, wood, { skip: ['ny'], collide: true, bevel: 0.03 });
    b.box(x0 - 0.05, x1 + 0.05, F + h - 0.1, F + h, z0 - 0.05, z1 + 0.05, wood, { bevel: 0.03 });
    b.box(x0 + 0.05, x1 - 0.05, F, F + 0.25, z0 + 0.05, z1 - 0.05, wood, { skip: ['ny', 'py'] });
    const along = dx === 0 ? [x0, x1] : [z0, z1];
    const face = dx === 0 ? (dz > 0 ? z1 : z0) : (dx > 0 ? x1 : x0);
    const s = dx === 0 ? dz : dx;
    const rows = Math.max(3, Math.round((h - 0.4) / 0.7)), cols = (along[1] - along[0]) > 3.5 ? 2 : 1;
    const rh = (h - 0.45) / rows, cw = (along[1] - along[0] - 0.16) / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = along[0] + 0.08 + c * cw + 0.02, a2 = a + cw - 0.04;
      const y0 = F + 0.3 + r * rh + 0.02, y1 = y0 + rh - 0.04;
      const f0 = Math.min(face, face + s * 0.05), f1 = Math.max(face, face + s * 0.05);
      if (dx === 0) b.box(a, a2, y0, y1, f0, f1, wood, { skip: [s > 0 ? 'nz' : 'pz'], dens: 6, bevel: 0.015 });
      else b.box(f0, f1, y0, y1, a, a2, wood, { skip: [s > 0 ? 'nx' : 'px'], dens: 6, bevel: 0.015 });
      const pc = (a + a2) / 2, py = (y0 + y1) / 2;
      const kx = dx === 0 ? pc : face + s * 0.09, kz = dx === 0 ? face + s * 0.09 : pc;
      b.prim(new THREE.SphereGeometry(0.045, 10, 8), wood === 'paintedWood' ? 'nickel' : 'brass', kx, py, kz);
    }
    const back = dx === 0 ? (dz > 0 ? z0 : z1) : (dx > 0 ? x0 : x1);
    const ca = (along[0] + along[1]) / 2;
    if (f.tv && dx === 0) {
      const tw = 4.3, th = 2.45, cy = F + h + 2.35;
      const f0 = back, f1 = back + s * 0.14;
      b.box(ca - tw / 2, ca + tw / 2, cy - th / 2, cy + th / 2, Math.min(f0, f1), Math.max(f0, f1), 'tvBody', { dens: 6 });
      const zf = f1 + s * 0.005;
      b.poly([[ca - tw / 2 + 0.06, cy - th / 2 + 0.06, zf], [ca + tw / 2 - 0.06, cy - th / 2 + 0.06, zf], [ca + tw / 2 - 0.06, cy + th / 2 - 0.06, zf], [ca - tw / 2 + 0.06, cy + th / 2 - 0.06, zf]], 'blackGlass', { n: [0, 0, s], dens: 4 });
    }
    if (f.mirror && dx === 0) {
      const mw = Math.min(3.2, along[1] - along[0] - 0.6);
      const y0 = F + h + 0.15, y1 = y0 + 2.8;
      b.box(ca - mw / 2 - 0.2, ca + mw / 2 + 0.2, y0 - 0.1, y1 + 0.2, Math.min(back, back + s * 0.12), Math.max(back, back + s * 0.12), 'paintedWood');
      mirrors.push({ pts: [[ca - mw / 2, y0, back + s * 0.13], [ca + mw / 2, y0, back + s * 0.13], [ca + mw / 2, y1, back + s * 0.13], [ca - mw / 2, y1, back + s * 0.13]], n: [0, 0, s] });
    }
  },
  vanity(b, f, mirrors) {
    if (f.face === 'e') {
      // back against the west wall: build it facing west and turn it half round (mirror too)
      const [x0, x1, z0, z1] = f.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ms = [];
      rotated(b, cx, cz, Math.PI, sub => FURN.vanity(sub, { ...f, face: 'w' }, ms));
      for (const m of ms) mirrors.push({ pts: m.pts.map(([x, y, z]) => [2 * cx - x, y, 2 * cz - z]), n: [-m.n[0], m.n[1], -m.n[2]] });
      return;
    }
    const [x0, x1, z0, z1] = f.r, F = f.base, cab = f.cab === '#f2f1ec' ? 'paintedWood' : 'cabinet';
    // faces west (-x), back against x1
    const H = 2.85, topT = 0.1;
    b.box(x0 + 0.08, x1, F + 0.3, F + H - topT, z0, z1, cab, { skip: ['ny', 'px'], collide: true, bevel: 0.02 });
    b.box(x0 + 0.2, x1, F, F + 0.3, z0 + 0.05, z1 - 0.05, 'paint:#3a3632', { skip: ['ny', 'px', 'py'] });
    const face = x0 + 0.08;
    const n = (z1 - z0) > 3.6 ? 3 : 2;
    const w = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const a = z0 + i * w + 0.03, a2 = a + w - 0.06;
      if ((n === 3 && i === 1) || n === 2) {
        b.box(face - 0.05, face, F + 0.4, F + H - topT - 0.45, a, a2, cab, { skip: ['px'], dens: 6 });
        const pz = n === 2 ? (i === 0 ? a2 - 0.15 : a + 0.15) : a2 - 0.15;
        b.mbox(face - 0.12, face - 0.05, F + 1.6, F + 2.0, pz - 0.015, pz + 0.015, 'nickel');
        b.box(face - 0.05, face, F + H - topT - 0.4, F + H - topT - 0.05, a, a2, cab, { skip: ['px'], dens: 6 });
      } else {
        for (let r = 0; r < 4; r++) {
          const y0 = F + 0.4 + r * 0.53, y1 = y0 + 0.49;
          b.box(face - 0.05, face, y0, y1, a, a2, cab, { skip: ['px'], dens: 6 });
          b.mbox(face - 0.12, face - 0.05, (y0 + y1) / 2 - 0.015, (y0 + y1) / 2 + 0.015, (a + a2) / 2 - 0.2, (a + a2) / 2 + 0.2, 'nickel');
        }
      }
    }
    // top with an undermount oval basin
    const top = f.top === 'granite' ? 'granite' : 'cultured';
    const cz = (z0 + z1) / 2, cy = F + H;
    const bw = 1.55, bd = 1.05, bx = (x0 + x1) / 2 - 0.1;
    b.box(x0 - 0.05, x1, cy - topT, cy, z0 - 0.05, z1 + 0.05, top, { skip: ['py', 'px'], dens: 7 });
    const flat = { skip: ['ny', 'px', 'nx', 'pz', 'nz'], dens: 7 };
    b.box(x0 - 0.05, x1, cy - topT, cy, z0 - 0.05, cz - bw / 2, top, flat);
    b.box(x0 - 0.05, x1, cy - topT, cy, cz + bw / 2, z1 + 0.05, top, flat);
    b.box(x0 - 0.05, bx - bd / 2, cy - topT, cy, cz - bw / 2, cz + bw / 2, top, flat);
    b.box(bx + bd / 2, x1, cy - topT, cy, cz - bw / 2, cz + bw / 2, top, flat);
    const bowl = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bowl.scale(bd / 2, 0.45, bw / 2);
    bowl.scale(-1, 1, 1);
    b.prim(bowl, 'porcelain', bx, cy - topT + 0.01, cz);
    faucet(b, x1 - 0.35, cy, cz, 'w', 'nickel');
    b.box(x1 - 0.06, x1, cy, cy + 0.33, z0 - 0.05, z1 + 0.05, top, { skip: ['px', 'ny'], dens: 6 });
    if (f.mirror) {
      const my0 = cy + 0.6, my1 = cy + 3.9;
      mirrors.push({ pts: [[x1 - 0.03, my0, z0], [x1 - 0.03, my0, z1], [x1 - 0.03, my1, z1], [x1 - 0.03, my1, z0]], n: [-1, 0, 0] });
      b.box(x1 - 0.06, x1 - 0.02, my1 + 0.1, my1 + 0.3, z0 + 0.3, z1 - 0.3, 'nickel', { skip: ['px'] });
      for (let i = 0; i < 3; i++) b.prim(new THREE.CylinderGeometry(0.12, 0.09, 0.3, 14, 1, true), 'frosted', x1 - 0.3, my1 + 0.1, z0 + 0.6 + i * ((z1 - z0) - 1.2) / 2, 0, { bake: false });
    }
  },
  toilet(b, f) {
    const { x, z, base: F } = f;
    const ang = { e: 0, w: Math.PI, n: Math.PI / 2, s: -Math.PI / 2 }[f.face];
    const g = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.4, 0), new THREE.Vector2(0.38, 0.4), new THREE.Vector2(0.62, 1.15), new THREE.Vector2(0.66, 1.33), new THREE.Vector2(0.6, 1.38), new THREE.Vector2(0.001, 1.2)], 28);
    g.scale(1.3, 1, 1);
    g.translate(0.35, 0, 0);
    const tank = new THREE.BoxGeometry(0.62, 1.25, 1.65); tank.translate(-0.62, 1.95, 0);
    const lid = new THREE.BoxGeometry(0.7, 0.08, 1.72); lid.translate(-0.62, 2.62, 0);
    const seat = new THREE.TorusGeometry(0.55, 0.1, 8, 24); seat.rotateX(Math.PI / 2); seat.scale(1.3, 0.6, 1); seat.translate(0.35, 1.4, 0);
    for (const geo of [g, tank, lid, seat]) {
      geo.rotateY(-ang); geo.translate(x, F, z);
      b.mesh(geo, 'porcelain');
    }
    b.collider(x - 0.9, x + 0.9, F, F + 2.6, z - 0.9, z + 0.9);
  },
  tub(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, H = 1.7;
    b.box(x0, x1, F, F + H, z1 - 0.15, z1, 'porcelain', { skip: ['ny'], dens: 7 });
    b.box(x0, x1, F + H - 0.12, F + H, z0, z1 - 0.15, 'porcelain', { skip: ['ny'], dens: 7 });
    b.poly([[x0 + 0.1, F + 0.35, z0 + 0.1], [x1 - 0.1, F + 0.35, z0 + 0.1], [x1 - 0.1, F + 0.35, z1 - 0.2], [x0 + 0.1, F + 0.35, z1 - 0.2]], 'porcelain', { n: [0, 1, 0], dens: 7 });
    b.poly([[x0 + 0.1, F + 0.35, z1 - 0.2], [x1 - 0.1, F + 0.35, z1 - 0.2], [x1 - 0.1, F + H - 0.12, z1 - 0.2], [x0 + 0.1, F + H - 0.12, z1 - 0.2]], 'porcelain', { n: [0, 0, -1], dens: 7 });
    b.collider(x0, x1, F, F + H, z0, z1);
    // 12x24 marble-look tile surround to 7' on the three alcove walls (around the window)
    const t0 = F + H, t1 = F + 7.3;
    const wall = (pts, n) => b.poly(pts, 'tileWall', { n, dens: 6 });
    const zN = 0.25 + 0.005, xW = 21.3 + 0.2 + 0.005, xE = 26.6 - 0.2 - 0.005;
    const wy0 = L.MAIN + 4, wa0 = 22.8 - 0.3, wa1 = 25.9 + 0.3;
    wall([[xW, t0, zN], [wa0, t0, zN], [wa0, t1, zN], [xW, t1, zN]], [0, 0, 1]);
    wall([[wa1, t0, zN], [xE, t0, zN], [xE, t1, zN], [wa1, t1, zN]], [0, 0, 1]);
    wall([[wa0, t0, zN], [wa1, t0, zN], [wa1, wy0 - 0.37, zN], [wa0, wy0 - 0.37, zN]], [0, 0, 1]);
    wall([[xW, t0, zN], [xW, t0, z1], [xW, t1, z1], [xW, t1, zN]], [1, 0, 0]);
    wall([[xE, t0, zN], [xE, t0, z1], [xE, t1, z1], [xE, t1, zN]], [-1, 0, 0]);
    // curtain rod + gathered curtain (photo 11)
    beam(b, [xW, F + 6.9, z1 + 0.05], [xE, F + 6.9, z1 + 0.05], 0.06, 0, 'chrome', { round: true });
    const cw = 1.8, folds = 9, geo = new THREE.PlaneGeometry(cw, 5.6, folds * 4, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / cw * folds * Math.PI * 2) * 0.09);
    geo.computeVertexNormals();
    b.prim(geo, 'curtain', x0 + 1.1, F + 4.05, z1 + 0.05, 0);
  },
  shower(b, f, mirrors, glass) {
    const [x0, x1, z0, z1] = f.r, F = f.base;
    b.box(x0, x1, F, F + 0.4, z0, z1, 'porcelain', { skip: ['ny'], dens: 7 });
    for (const [pts, n] of [
      [[[x0 + 0.01, F + 0.4, z0], [x0 + 0.01, F + 0.4, z1], [x0 + 0.01, F + 7.2, z1], [x0 + 0.01, F + 7.2, z0]], [1, 0, 0]],
      [[[x0, F + 0.4, z1 - 0.01], [x1, F + 0.4, z1 - 0.01], [x1, F + 7.2, z1 - 0.01], [x0, F + 7.2, z1 - 0.01]], [0, 0, -1]],
      [[[x1 - 0.01, F + 0.4, z0], [x1 - 0.01, F + 0.4, z1], [x1 - 0.01, F + 7.2, z1], [x1 - 0.01, F + 7.2, z0]], [-1, 0, 0]],
    ]) b.poly(pts, 'cultured', { n, dens: 5 });
    const g = z0 + 0.05;
    for (const x of [x0 + 0.05, x1 - 0.05, (x0 + x1) / 2]) b.mbox(x - 0.04, x + 0.04, F + 0.4, F + 6.4, g - 0.04, g + 0.04, 'brass');
    b.mbox(x0, x1, F + 6.35, F + 6.45, g - 0.05, g + 0.05, 'brass');
    b.collider(x0, x1, F, F + 6.5, z0 - 0.1, z0 + 0.15);
    glass.push({ pts: [[x0 + 0.09, F + 0.45, g], [x1 - 0.09, F + 0.45, g], [x1 - 0.09, F + 6.33, g], [x0 + 0.09, F + 6.33, g]], n: [0, 0, -1], tint: '#e9dcbb' });
  },
  table(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = 'stain:' + f.wood;
    const H = 2.5;
    b.box(x0, x1, F + H - 0.14, F + H, z0, z1, wood, { dens: 6, bevel: 0.035 });
    b.box(x0 + 0.25, x1 - 0.25, F + H - 0.45, F + H - 0.14, z0 + 0.25, z1 - 0.25, wood, { skip: ['py'] });
    if (f.chair === 'dining') {
      for (const px of [x0 + 1.1, x1 - 1.1]) {
        b.prim(new THREE.CylinderGeometry(0.22, 0.35, H - 0.6, 12), wood, px, F + (H - 0.45) / 2 + 0.15, (z0 + z1) / 2);
        b.box(px - 0.3, px + 0.3, F, F + 0.3, z0 + 0.6, z1 - 0.6, wood, { skip: ['ny'] });
      }
    } else {
      for (const [px, pz] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3]]) b.prim(new THREE.CylinderGeometry(0.1, 0.07, H - 0.14, 10), wood, px, F + (H - 0.14) / 2, pz);
    }
    b.collider(x0, x1, F, F + H, z0, z1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const seats = [];
    if (f.chairs === 6) { seats.push([x0 - 0.8, cz, 'e'], [x1 + 0.8, cz, 'w']); for (const px of [cx - 1.4, cx + 1.4]) seats.push([px, z0 - 0.75, 's'], [px, z1 + 0.75, 'n']); }
    else seats.push([x0 - 0.75, cz, 'e'], [x1 + 0.75, cz, 'w'], [cx, z0 - 0.75, 's'], [cx, z1 + 0.75, 'n']);
    for (const [sx, sz, face] of seats) chair(b, sx, sz, F, face, wood, f.chair);
  },
  sofa(b, f) {
    if (f.face === 'n') {
      // build facing west in a frame turned 90 degrees, then rotate so the back sits on the south side
      const [x0, x1, z0, z1] = f.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
      return rotated(b, cx, cz, -Math.PI / 2, sub => FURN.sofa(sub, { ...f, face: 'w', r: [cx - hz, cx + hz, cz - hx, cz + hx] }));
    }
    // rolled-arm sofa with loose seat and back cushions (photo 1)
    const [x0, x1, z0, z1] = f.r, F = f.base, fab = 'fabric:' + f.fabric;
    const [dx] = faceDir(f.face);
    const D = x1 - x0, arm = 0.7;
    // helpers in "depth" coordinates: u = 0 at the front edge, u = D at the back
    const X = u => (dx < 0 ? x0 + u : x1 - u);
    const bx = (u0, u1, y0, y1, za, zb, o = {}) => b.box(Math.min(X(u0), X(u1)), Math.max(X(u0), X(u1)), y0, y1, za, zb, fab, o);
    bx(0.12, D - 0.1, F + 0.42, F + 1.3, z0 + arm - 0.05, z1 - arm + 0.05, { skip: ['ny'], collide: true, bevel: 0.08 });
    bx(D - 0.62, D, F + 0.42, F + 2.55, z0 + 0.1, z1 - 0.1, { skip: ['ny'], bevel: 0.16 });
    for (const [za, zb] of [[z0, z0 + arm], [z1 - arm, z1]]) {
      bx(0.05, D, F + 0.42, F + 1.95, za, zb, { skip: ['ny'], collide: true, bevel: 0.12 });
      const roll = new THREE.CylinderGeometry(arm * 0.62, arm * 0.62, D - 0.05, 20);
      roll.rotateZ(Math.PI / 2);
      b.prim(roll, fab, (X(0.05) + X(D)) / 2, F + 1.95, (za + zb) / 2);
    }
    const n = Math.max(2, Math.round((z1 - z0 - 2 * arm) / 2.2));
    const cw = (z1 - z0 - 2 * arm) / n;
    for (let i = 0; i < n; i++) {
      const a = z0 + arm + i * cw + 0.02, a2 = a + cw - 0.04;
      bx(0.02, D - 0.6, F + 1.3, F + 1.88, a, a2, { skip: ['ny'], dens: 5, bevel: 0.16 });
      bx(D - 1.12, D - 0.55, F + 1.7, F + 3.02, a, a2, { skip: ['ny'], dens: 5, bevel: 0.2 });
    }
    // throw pillows leaning in the corners
    for (const [pz, tilt] of [[z0 + arm + 0.55, 0.35], [z1 - arm - 0.55, -0.35]]) {
      const g = new THREE.SphereGeometry(0.72, 20, 14);
      g.scale(0.28, 0.9, 1);
      g.rotateX(tilt);
      g.rotateZ(dx < 0 ? 0.35 : -0.35);
      b.prim(g, 'fabric:#e7dfcf', X(D - 1.35), F + 2.4, pz);
    }
    for (const [u, pz] of [[0.25, z0 + 0.25], [D - 0.25, z0 + 0.25], [0.25, z1 - 0.25], [D - 0.25, z1 - 0.25]]) {
      b.prim(new THREE.CylinderGeometry(0.07, 0.05, 0.42, 10), 'stain:#2b1c14', X(u), F + 0.21, pz);
    }
  },
  coffeeTable(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = 'stain:' + f.wood;
    b.box(x0, x1, F + 1.35, F + 1.5, z0, z1, wood, { collide: true, bevel: 0.03 });
    b.box(x0 + 0.15, x1 - 0.15, F + 0.35, F + 0.45, z0 + 0.15, z1 - 0.15, wood);
    for (const [px, pz] of [[x0 + 0.15, z0 + 0.15], [x1 - 0.15, z0 + 0.15], [x0 + 0.15, z1 - 0.15], [x1 - 0.15, z1 - 0.15]]) b.mbox(px - 0.1, px + 0.1, F, F + 1.35, pz - 0.1, pz + 0.1, wood);
  },
  rugRect(b, f) {
    const [x0, x1, z0, z1] = f.r, y = f.base + 0.04;
    b.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], 'rugLiving', { n: [0, 1, 0] });
    b.box(x0, x1, f.base, y, z0, z1, 'rugLiving', { skip: ['py', 'ny'], dens: 4 });
  },
  floorLamp(b, f) {
    const { x, z, base: F } = f;
    b.prim(new THREE.CylinderGeometry(0.45, 0.5, 0.08, 20), 'bronze', x, F + 0.04, z);
    b.prim(new THREE.CylinderGeometry(0.04, 0.04, 5.0, 8), 'bronze', x, F + 2.5, z);
    b.prim(new THREE.CylinderGeometry(0.5, 0.7, 0.9, 24, 1, true), 'shade', x, F + 5.2, z, 0, { bake: false });
  },
  desk(b, f) {
    if (f.face === 'e') {
      // back against a west wall: build it facing north and turn it a quarter
      const [x0, x1, z0, z1] = f.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (z1 - z0) / 2, hd = (x1 - x0) / 2;
      return rotated(b, cx, cz, -Math.PI / 2, sub => FURN.desk(sub, { ...f, face: 'n', r: [cx - hw, cx + hw, cz - hd, cz + hd] }));
    }
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = f.wood === '#f4f2ec' ? 'paintedWood' : 'stain:' + f.wood;
    b.box(x0, x1, F + 2.35, F + 2.5, z0, z1, wood, { collide: true, bevel: 0.025 });
    for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) b.mbox(px - 0.08, px + 0.08, F, F + 2.35, pz - 0.08, pz + 0.08, wood);
    if (f.chair) officeChair(b, (x0 + x1) / 2, z0 - 0.9, F);
    if (f.monitors) {
      for (let i = 0; i < f.monitors; i++) {
        const cx = x0 + (i + 0.5) * (x1 - x0) / f.monitors;
        b.mbox(cx - 0.9, cx + 0.9, F + 3.1, F + 4.25, z1 - 0.55, z1 - 0.48, 'tvBody');
        b.mbox(cx - 0.05, cx + 0.05, F + 2.5, F + 3.1, z1 - 0.5, z1 - 0.42, 'tvBody');
      }
    }
  },
  lDesk(b, f) {
    // L-shaped corner desk: one run on the west wall (x0), one on the south wall (z1)
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = 'stain:' + f.wood, D = 2.4;
    b.box(x0, x0 + D, F + 2.35, F + 2.5, z0, z1, wood, { collide: true, bevel: 0.025 });
    b.box(x0 + D, x1, F + 2.35, F + 2.5, z1 - D, z1, wood, { collide: true, bevel: 0.025 });
    // drawer pedestal at the north end of the west run
    b.box(x0 + 0.05, x0 + D - 0.1, F, F + 2.35, z0 + 0.05, z0 + 1.5, wood, { skip: ['ny'], collide: true });
    for (let i = 0; i < 3; i++) {
      const y0 = F + 0.12 + i * 0.73;
      b.box(x0 + D - 0.1, x0 + D - 0.06, y0, y0 + 0.66, z0 + 0.1, z0 + 1.45, wood, { skip: ['nx'] });
      b.mbox(x0 + D - 0.06, x0 + D - 0.02, y0 + 0.5, y0 + 0.55, z0 + 0.55, z0 + 1.0, 'nickel');
    }
    // end panel under the south run, corner leg, back panel along the west wall
    b.box(x1 - 0.1, x1, F, F + 2.35, z1 - D, z1, wood, { skip: ['ny'], collide: true });
    b.mbox(x0 + D - 0.16, x0 + D - 0.02, F, F + 2.35, z1 - D + 0.02, z1 - D + 0.16, wood);
    b.box(x0 + 0.05, x0 + 0.12, F + 0.8, F + 2.35, z0 + 1.5, z1 - 0.05, wood);
    // two monitors on the south run near the corner, facing north
    for (const cx of [x0 + 1.55, x0 + 3.45]) {
      b.mbox(cx - 0.9, cx + 0.9, F + 3.1, F + 4.25, z1 - 0.55, z1 - 0.48, 'tvBody');
      b.mbox(cx - 0.05, cx + 0.05, F + 2.5, F + 3.1, z1 - 0.5, z1 - 0.42, 'tvBody');
    }
    officeChair(b, x0 + 2.6, z1 - D - 0.7, F);
  },
  crib(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, w = 'paintedWood';
    b.box(x0 + 0.15, x1 - 0.15, F + 1.3, F + 1.65, z0 + 0.15, z1 - 0.15, 'fabric:#f3f3f1', { collide: true });
    for (const [px, pz] of [[x0, z0], [x1 - 0.18, z0], [x0, z1 - 0.18], [x1 - 0.18, z1 - 0.18]]) b.box(px, px + 0.18, F, F + 3.4, pz, pz + 0.18, w, { skip: ['ny'] });
    b.box(x0, x1, F + 2.9, F + 3.45, z0, z0 + 0.12, w); b.box(x0, x1, F + 2.9, F + 3.45, z1 - 0.12, z1, w);
    b.box(x0, x0 + 0.12, F + 3.2, F + 3.35, z0, z1, w); b.box(x1 - 0.12, x1, F + 3.2, F + 3.35, z0, z1, w);
    b.box(x0, x0 + 0.12, F + 1.1, F + 1.25, z0, z1, w); b.box(x1 - 0.12, x1, F + 1.1, F + 1.25, z0, z1, w);
    for (let z = z0 + 0.35; z < z1 - 0.2; z += 0.28) for (const px of [x0 + 0.04, x1 - 0.1]) b.mbox(px, px + 0.06, F + 1.25, F + 3.2, z, z + 0.06, w);
  },
  glider(b, f) {
    const { x, z, base: F } = f;
    const fab = 'fabric:#d8d2c8';
    b.box(x - 1.1, x + 1.1, F + 0.4, F + 1.55, z - 1.0, z + 1.0, fab, { collide: true, bevel: 0.12 });
    b.box(x - 1.1, x + 1.1, F + 1.55, F + 3.4, z + 0.55, z + 1.0, fab, { bevel: 0.12 });
    b.box(x - 1.1, x - 0.75, F + 1.55, F + 2.3, z - 1.0, z + 0.55, fab, { bevel: 0.12 });
    b.box(x + 0.75, x + 1.1, F + 1.55, F + 2.3, z - 1.0, z + 0.55, fab, { bevel: 0.12 });
    b.box(x - 0.9, x + 0.9, F, F + 0.4, z - 0.9, z + 0.9, 'paint:#9a948c', { skip: ['ny'] });
  },
  sectional(b, f) {
    // L-shaped: long run with its back on the east wall, return along the south end facing north
    const [x0, x1, z0, z1] = f.r, F = f.base, fab = 'fabric:' + f.fabric;
    const D = 3.0;
    b.box(x1 - D, x1, F + 0.3, F + 1.45, z0, z1, fab, { skip: ['ny'], collide: true, bevel: 0.1 });
    b.box(x0, x1 - D, F + 0.3, F + 1.45, z1 - D, z1, fab, { skip: ['ny'], collide: true, bevel: 0.1 });
    b.box(x1 - 0.8, x1, F + 1.45, F + 2.85, z0, z1, fab, { skip: ['ny'], bevel: 0.14 });
    b.box(x0, x1 - 0.8, F + 1.45, F + 2.85, z1 - 0.8, z1, fab, { skip: ['ny'], bevel: 0.14 });
    b.box(x1 - D, x1 - 0.8, F + 1.45, F + 2.2, z0, z0 + 0.6, fab, { skip: ['ny'], bevel: 0.14 });
    b.box(x0, x0 + 0.6, F + 1.45, F + 2.2, z1 - D, z1 - 0.8, fab, { skip: ['ny'], bevel: 0.14 });
    for (let zz = z0 + 0.65; zz < z1 - 0.85; zz += 2.25) b.box(x1 - D + 0.05, x1 - 0.82, F + 1.45, F + 1.95, zz, Math.min(zz + 2.2, z1 - 0.82), fab, { skip: ['ny'], dens: 5, bevel: 0.14 });
    for (let xx = x0 + 0.65; xx < x1 - D - 0.05; xx += 2.25) b.box(xx, Math.min(xx + 2.2, x1 - D), F + 1.45, F + 1.95, z1 - D + 0.05, z1 - 0.82, fab, { skip: ['ny'], dens: 5, bevel: 0.14 });
    for (let zz = z0 + 0.65; zz < z1 - 0.85; zz += 2.25) b.box(x1 - 1.3, x1 - 0.75, F + 1.9, F + 2.95, zz, Math.min(zz + 2.2, z1 - 0.82), fab, { skip: ['ny'], dens: 5, bevel: 0.18 });
  },
  sectionalOld(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, fab = 'fabric:' + f.fabric;
    const D = 3.0;
    b.box(x0, x1, F + 0.3, F + 1.45, z1 - D, z1, fab, { skip: ['ny'], collide: true, bevel: 0.12 });
    b.box(x0, x0 + D, F + 0.3, F + 1.45, z0, z1 - D, fab, { skip: ['ny'], collide: true, bevel: 0.12 });
    b.box(x0, x1, F + 1.45, F + 2.85, z1 - 0.8, z1, fab, { skip: ['ny'], bevel: 0.12 });
    b.box(x0, x0 + 0.8, F + 1.45, F + 2.85, z0, z1 - 0.8, fab, { skip: ['ny'], bevel: 0.12 });
    b.box(x1 - 0.6, x1, F + 1.45, F + 2.2, z1 - D, z1 - 0.8, fab, { skip: ['ny'], bevel: 0.12 });
    b.box(x0 + 0.8, x0 + D, F + 1.45, F + 2.2, z0, z0 + 0.6, fab, { skip: ['ny'], bevel: 0.12 });
    for (let xx = x0 + 0.85; xx < x1 - 0.7; xx += 2.2) b.box(xx, Math.min(xx + 2.15, x1 - 0.62), F + 1.45, F + 1.95, z1 - D + 0.05, z1 - 0.82, fab, { skip: ['ny'], dens: 5, bevel: 0.12 });
    for (let zz = z0 + 0.65; zz < z1 - D - 0.05; zz += 2.2) b.box(x0 + 0.82, x0 + D - 0.05, F + 1.45, F + 1.95, zz, Math.min(zz + 2.15, z1 - D), fab, { skip: ['ny'], dens: 5, bevel: 0.12 });
  },
  console(b, f) {
    // low media cabinet against a wall with the TV mounted above; face = side the front looks toward
    const [x0, x1, z0, z1] = f.r, F = f.base;
    const s = f.face === 'e' ? 1 : -1;
    const front = s > 0 ? x1 : x0, wall = s > 0 ? x0 : x1;
    b.box(x0, x1, F + 0.2, F + 2.0, z0, z1, 'stain:#1f1a17', { skip: ['ny'], collide: true, bevel: 0.02 });
    for (let i = 0; i < 3; i++) {
      const a = z0 + 0.1 + i * (z1 - z0 - 0.2) / 3, c = a + (z1 - z0 - 0.2) / 3 - 0.04;
      b.box(Math.min(front, front + s * 0.03), Math.max(front, front + s * 0.03), F + 0.35, F + 1.85, a, c, 'blackGlass', { skip: [s > 0 ? 'nx' : 'px'] });
    }
    if (f.tv) {
      const cz = (z0 + z1) / 2, t0 = wall + s * 0.02, t1 = wall + s * 0.15;
      b.box(Math.min(t0, t1), Math.max(t0, t1), F + 3.2, F + 6.35, cz - 2.8, cz + 2.8, 'tvBody', { skip: [s > 0 ? 'nx' : 'px'], bevel: 0.02 });
      const xf = t1 + s * 0.005;
      b.poly([[xf, F + 3.28, cz - 2.72], [xf, F + 3.28, cz + 2.72], [xf, F + 6.27, cz + 2.72], [xf, F + 6.27, cz - 2.72]], 'blackGlass', { n: [s, 0, 0] });
    }
  },
  washer(b, f) { appliance(b, f, 'washerFront'); },
  dryer(b, f) { appliance(b, f, 'dryerFront'); },
  pedestalSink(b, f) {
    // built facing north (back to +z); face 'w' turns it to back onto an east wall
    if (f.face === 'w') return rotated(b, f.x, f.z, Math.PI / 2, sub => FURN.pedestalSink(sub, { ...f, face: 'n' }));
    const { x, z, base: F } = f;
    const cz = z - 0.1, top = F + 2.95;
    b.prim(new THREE.CylinderGeometry(0.2, 0.33, top - 0.3 - F, 24), 'porcelain', x, F + (top - 0.3 - F) / 2, z + 0.12);
    // rounded basin body under an oval rim, with the bowl recessed into the rim
    const body = new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    body.scale(0.95, 0.42, 0.68);
    b.prim(body, 'porcelain', x, top - 0.07, cz);
    const rim = new THREE.Shape();
    rim.absellipse(0, 0, 0.95, 0.68, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, -0.08, 0.6, 0.4, 0, Math.PI * 2, true);
    rim.holes.push(hole);
    const deck = new THREE.ExtrudeGeometry(rim, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 40 });
    deck.rotateX(Math.PI / 2);                                    // shape y -> +z (toward the wall), depth downward
    b.prim(deck, 'porcelain', x, top, cz);
    const bowl = new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bowl.scale(-0.6, 0.3, 0.4);                                   // mirrored: shows its inside
    b.prim(bowl, 'porcelain', x, top - 0.06, cz - 0.08);
    b.collider(x - 0.95, x + 0.95, top - 0.5, top, cz - 0.68, cz + 0.68);
    faucet(b, x, top, cz + 0.5, 'n', 'nickel');
  },
  furnace(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base;
    b.box(x0, x1, F, F + 4.6, z0, z1, 'paint:#8f9398', { skip: ['ny'], collide: true });
    b.box(x0 + 0.3, x1 - 0.3, F + 4.6, L.LOW_CEIL - 0.02, z0 + 0.4, z1 - 0.4, 'galvanized', { skip: ['ny'] });
  },
  waterHeater(b, f) {
    const { x, z, base: F } = f;
    b.prim(new THREE.CylinderGeometry(0.95, 0.95, 5.0, 28), 'paint:#e4e2dd', x, F + 2.5, z, 0, { collide: true });
    b.prim(new THREE.CylinderGeometry(0.12, 0.12, 3.0, 10), 'galvanized', x, F + 6.5, z);
  },
  shelving(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base;
    for (const y of [0.3, 1.8, 3.3, 4.8, 6.3]) b.box(x0, x1, F + y, F + y + 0.06, z0, z1, 'galvanized', { dens: 3 });
    for (const [px, pz] of [[x0, z0], [x1 - 0.1, z0], [x0, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) b.mbox(px, px + 0.1, F, F + 6.6, pz, pz + 0.1, 'galvanized');
    b.collider(x0, x1, F, F + 6.6, z0, z1);
  },
  workbench(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base;
    b.box(x0, x1, F + 2.9, F + 3.05, z0, z1, 'stain:#a07c52', { collide: true });
    b.box(x0, x1, F + 0.5, F + 0.56, z0 + 0.1, z1 - 0.1, 'stain:#a07c52');
    for (const [px, pz] of [[x0, z0], [x1 - 0.2, z0], [x0, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) b.mbox(px, px + 0.2, F, F + 2.9, pz, pz + 0.2, 'stain:#a07c52');
    b.box(x0, x1, F + 3.05, F + 5.2, z0 - 0.02, z0 + 0.04, 'pegboard', { dens: 4 });
  },
  fridge(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base;
    b.box(x0, x1, F, F + 5.6, z0, z1, 'enamelWhite', { skip: ['ny'], collide: true });
    b.box(x0 + 0.02, x1 - 0.02, F + 3.9, F + 3.93, z1, z1 + 0.01, 'paint:#bdbbb6');
    beam(b, [x1 - 0.25, F + 4.1, z1 + 0.1], [x1 - 0.25, F + 5.0, z1 + 0.1], 0.06, 0, 'enamelWhite', { round: true });
    beam(b, [x1 - 0.25, F + 2.2, z1 + 0.1], [x1 - 0.25, F + 3.6, z1 + 0.1], 0.06, 0, 'enamelWhite', { round: true });
  },
};

function officeChair(b, x, z, F) {
  b.prim(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), 'chrome', x, F + 0.95, z);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    b.mbox(x + Math.cos(a) * 0.55 - 0.04, x + Math.cos(a) * 0.55 + 0.04, F + 0.12, F + 0.2, z + Math.sin(a) * 0.55 - 0.04, z + Math.sin(a) * 0.55 + 0.04, 'tvBody');
    b.prim(new THREE.BoxGeometry(1.1, 0.07, 0.1), 'tvBody', x + Math.cos(a) * 0.3, F + 0.2, z + Math.sin(a) * 0.3, -a);
    b.prim(new THREE.SphereGeometry(0.07, 8, 6), 'tvBody', x + Math.cos(a) * 0.6, F + 0.07, z + Math.sin(a) * 0.6);
  }
  b.box(x - 0.85, x + 0.85, F + 1.55, F + 1.8, z - 0.8, z + 0.8, 'fabric:#2a2a2c', { bevel: 0.08 });
  b.box(x - 0.8, x + 0.8, F + 2.0, F + 3.6, z - 0.86, z - 0.72, 'fabric:#2a2a2c', { bevel: 0.06 });
  b.mbox(x - 0.05, x + 0.05, F + 1.55, F + 2.2, z - 0.85, z - 0.75, 'tvBody');
  b.collider(x - 0.9, x + 0.9, F, F + 1.8, z - 0.9, z + 0.9);
}

// Build something with a rotation about the vertical axis through (cx, cz).
function rotated(b, cx, cz, ang, fn) {
  const sub = new Builder();
  fn(sub);
  const c = Math.cos(ang), s = Math.sin(ang);
  const rp = (x, y, z) => { const dx = x - cx, dz = z - cz; return [cx + dx * c + dz * s, y, cz - dx * s + dz * c]; };
  for (const p of sub.parts) {
    if (p.kind === 'poly') {
      p.pts = p.pts.map(([x, y, z]) => rp(x, y, z));
      p.n = [p.n[0] * c + p.n[2] * s, p.n[1], -p.n[0] * s + p.n[2] * c];
    } else if (p.kind === 'mesh') {
      for (let i = 0; i < p.pos.length; i += 3) {
        const q = rp(p.pos[i], p.pos[i + 1], p.pos[i + 2]);
        p.pos[i] = q[0]; p.pos[i + 1] = q[1]; p.pos[i + 2] = q[2];
        const nx = p.nrm[i], nz = p.nrm[i + 2];
        p.nrm[i] = nx * c + nz * s; p.nrm[i + 2] = -nx * s + nz * c;
      }
    }
    b.parts.push(p);
  }
  for (const k of sub.boxes) {
    const a = rp(k.x0, 0, k.z0), d = rp(k.x1, 0, k.z1);
    b.boxes.push({ x0: Math.min(a[0], d[0]), x1: Math.max(a[0], d[0]), y0: k.y0, y1: k.y1, z0: Math.min(a[2], d[2]), z1: Math.max(a[2], d[2]) });
  }
}

function sleighPanel(b, x0, x1, z0, z1, F, H, wood, axis) {
  // headboard panel with an arched crest and a rolled cap following it (photos 16-20)
  const len = axis === 'z' ? x1 - x0 : z1 - z0;
  const rise = axis === 'z' ? 0.9 : 0.5;
  const N = 18;
  const crest = [];
  for (let i = 0; i <= N; i++) { const t = i / N; crest.push([t, F + H - rise + rise * Math.sin(Math.PI * t)]); }
  const at = (t, y, d) => (axis === 'z' ? [x0 + t * len, y, d] : [d, y, z0 + t * len]);
  const [d0, d1] = axis === 'z' ? [z0, z1] : [x0, x1];
  const nFront = axis === 'z' ? [0, 0, 1] : [1, 0, 0], nBack = axis === 'z' ? [0, 0, -1] : [-1, 0, 0];
  for (const [d, n] of [[d1, nFront], [d0, nBack]]) {
    b.poly([at(0, F, d), at(1, F, d), ...crest.slice().reverse().map(([t, y]) => at(t, y, d))], wood, { n });
  }
  for (let i = 0; i < N; i++) {
    const [ta, ya] = crest[i], [tb, yb] = crest[i + 1];
    b.poly([at(ta, ya, d0), at(tb, yb, d0), at(tb, yb, d1), at(ta, ya, d1)], wood, { n: [0, 1, 0] });
  }
  const mid = (d0 + d1) / 2;
  const curve = new THREE.CatmullRomCurve3(crest.map(([t, y]) => new THREE.Vector3(...at(t, y + 0.12, mid))));
  b.mesh(new THREE.TubeGeometry(curve, 40, 0.2, 12), wood);
  for (const t0 of [0, 1 - 0.3 / len]) {
    const q0 = at(t0, F, 0), q1 = at(t0 + 0.3 / len, F, 0);
    if (axis === 'z') b.box(q0[0], q1[0], F, F + H - rise + 0.35, z0 - 0.05, z1 + 0.05, wood, { skip: ['ny'], bevel: 0.03 });
    else b.box(x0 - 0.05, x1 + 0.05, F, F + H - rise + 0.35, q0[2], q1[2], wood, { skip: ['ny'], bevel: 0.03 });
  }
  if (axis === 'z') b.collider(x0, x1, F, F + H, z0, z1); else b.collider(x0, x1, F, F + H, z0, z1);
}
function chair(b, x, z, F, face, wood, style) {
  const [dx, dz] = faceDir(face);
  const dining = style === 'dining';
  const s = dining ? 0.95 : 0.85;
  // local frame: forward (toward the table) = (dx, dz), side = perpendicular
  const fx = dx, fz = dz, sx = -dz, sz = dx;
  const P = (f, sd) => [x + fx * f + sx * sd, z + fz * f + sz * sd];
  const ang = Math.atan2(fx, fz);
  if (dining) {
    const seat = new THREE.BoxGeometry(2 * s - 0.05, 0.22, 2 * s - 0.1);
    b.prim(seat, wood, x, F + 1.42, z, ang);
    const cush = new THREE.BoxGeometry(2 * s - 0.2, 0.2, 2 * s - 0.3, 1, 1, 1);
    const pos = cush.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * 0.92); pos.setZ(i, pos.getZ(i) * 0.9); }
    cush.computeVertexNormals();
    b.prim(cush, 'fabric:#6b5238', x, F + 1.62, z, ang);
  } else {
    b.prim(new THREE.BoxGeometry(2 * s, 0.14, 2 * s), wood, x, F + 1.5, z, ang);
  }
  for (const [f, sd] of [[s - 0.12, s - 0.12], [s - 0.12, -s + 0.12], [-s + 0.12, s - 0.12], [-s + 0.12, -s + 0.12]]) {
    const [px, pz] = P(f, sd);
    b.prim(new THREE.CylinderGeometry(0.07, dining ? 0.045 : 0.05, 1.35, 10), wood, px, F + 0.67, pz);
  }
  // back
  const H = dining ? 3.75 : 3.25;
  const back = -s + 0.08;
  for (const sd of [s - 0.1, -s + 0.1]) {
    const [px, pz] = P(back, sd);
    b.prim(new THREE.CylinderGeometry(0.065, 0.075, H - 1.45, 10), wood, px, F + 1.45 + (H - 1.45) / 2, pz);
  }
  if (dining) {
    // arched top rail + vase-shaped splat
    const arc = new THREE.CatmullRomCurve3([-s + 0.1, -0.4, 0, 0.4, s - 0.1].map((sd, i) => {
      const [px, pz] = P(back, sd); return new THREE.Vector3(px, F + H - 0.12 + [0, 0.12, 0.18, 0.12, 0][i], pz);
    }));
    b.mesh(new THREE.TubeGeometry(arc, 16, 0.075, 8), wood);
    const sh = new THREE.Shape();
    sh.moveTo(-0.18, 0); sh.bezierCurveTo(-0.34, 0.5, -0.12, 0.9, -0.26, 1.4); sh.bezierCurveTo(-0.34, 1.8, -0.22, 1.95, -0.2, 2.05);
    sh.lineTo(0.2, 2.05); sh.bezierCurveTo(0.22, 1.95, 0.34, 1.8, 0.26, 1.4); sh.bezierCurveTo(0.12, 0.9, 0.34, 0.5, 0.18, 0); sh.lineTo(-0.18, 0);
    const splat = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false, curveSegments: 8 });
    splat.translate(0, 0, -0.03);
    const [px, pz] = P(back, 0);
    b.prim(splat, wood, px, F + 1.55, pz, ang);
  } else {
    const [tx, tz] = P(back, 0);
    b.prim(new THREE.BoxGeometry(2 * s - 0.2, 0.3, 0.1), wood, tx, F + H - 0.15, tz, ang);
    for (let i = -2; i <= 2; i++) {
      const [px, pz] = P(back, i * 0.28);
      b.prim(new THREE.CylinderGeometry(0.03, 0.03, H - 1.8, 6), wood, px, F + 1.55 + (H - 1.8) / 2, pz);
    }
  }
  b.collider(x - s, x + s, F, F + 1.7, z - s, z + s);
}
function appliance(b, f, front) {
  const [x0, x1, z0, z1] = f.r, F = f.base, H = 3.55;
  b.box(x0, x1, F, F + H, z0, z1, 'enamelWhite', { skip: ['ny', 'pz'], collide: true, bevel: 0.05 });
  b.poly([[x0, F, z1], [x1, F, z1], [x1, F + H, z1], [x0, F + H, z1]], front, { n: [0, 0, 1], uv: 'face', dens: 8 });
  b.box(x0, x1, F + H, F + H + 0.55, z0, z0 + 0.45, 'enamelWhite', { skip: ['ny'], bevel: 0.05 });
}

// ================================================================ exterior ===
// Roof: a 5/12 gable over the main block (ridge running east-west), a low shed over the
// living-room bump-out and porch, and a shed over the rear stair annex. h = height at z[0], z[1].
const RC = L.MAIN_CEIL;
const ROOF_PLANES = [
  { x: [-1, 46], z: [-1, 13.95], h: [RC + 0.48, RC + 6.7] },
  { x: [-1, 46], z: [13.95, 28.9], h: [RC + 6.7, RC + 0.48] },
  { x: [20.3, 46], z: [27.9, 37.2], h: [RC + 0.9, RC + 0.15] },
  { x: [34.5, 46], z: [-9, 0], h: [RC + 0.15, RC + 0.9] },
];
const planeH = (p, z) => p.h[0] + (p.h[1] - p.h[0]) * (z - p.z[0]) / (p.z[1] - p.z[0]);
// underside of the lowest roof over a point (NaN if none)
export function roofUnder(x, z) {
  let h = Infinity;
  for (const p of ROOF_PLANES) if (x >= p.x[0] && x <= p.x[1] && z >= p.z[0] - 1e-6 && z <= p.z[1] + 1e-6) h = Math.min(h, planeH(p, z) - 0.12);
  return h === Infinity ? NaN : h;
}

function exterior(b) {
  const holes = L.SKYLIGHTS.map(([a0, a1, c0, c1]) => [a0 - 0.2, a1 + 0.2, c0 - 0.2, c1 + 0.2]);
  for (const p of ROOF_PLANES) {
    const hs = holes.filter(([a0, a1, c0, c1]) => a0 >= p.x[0] && a1 <= p.x[1] && c0 >= p.z[0] && c1 <= p.z[1]);
    for (const [a0, a1, c0, c1] of rectMinus([p.x[0], p.x[1], p.z[0], p.z[1]], hs)) {
      const top = z => planeH(p, z), bot = z => planeH(p, z) - 0.12;
      b.poly([[a0, top(c0), c0], [a1, top(c0), c0], [a1, top(c1), c1], [a0, top(c1), c1]], 'roof', { n: [0, 1, 0], dens: 0.8 });
      b.poly([[a0, bot(c0), c0], [a1, bot(c0), c0], [a1, bot(c1), c1], [a0, bot(c1), c1]], 'soffit', { n: [0, -1, 0], dens: 0.8 });
    }
    // fascia boards on the eaves and rakes
    const lowZ = p.h[0] < p.h[1] ? p.z[0] : p.z[1], lowH = Math.min(...p.h);
    b.poly([[p.x[0], lowH - 0.55, lowZ], [p.x[1], lowH - 0.55, lowZ], [p.x[1], lowH + 0.02, lowZ], [p.x[0], lowH + 0.02, lowZ]], 'soffit', { n: [0, 0, lowZ === p.z[0] ? -1 : 1], dens: 1.5 });
    for (const [x, s] of [[p.x[0], -1], [p.x[1], 1]]) {
      b.poly([[x, planeH(p, p.z[0]) - 0.45, p.z[0]], [x, planeH(p, p.z[1]) - 0.45, p.z[1]], [x, planeH(p, p.z[1]) + 0.02, p.z[1]], [x, planeH(p, p.z[0]) + 0.02, p.z[0]]], 'soffit', { n: [s, 0, 0], dens: 1.5 });
    }
  }
  // siding between the wall tops and the roof (eave friezes and the gable triangles)
  for (const w of L.WALLS) {
    if (!w.ext) continue;
    const { alongX, t, c, a0, a1 } = wallInfo(w);
    const inside = s => { const p = wp(alongX, c, (a0 + a1) / 2, s * (t / 2 + 0.3), L.MAIN + 1); return !!roomAt(p[0], p[2], L.MAIN + 1); };
    const sides = [-1, 1].filter(s => !inside(s));
    const stops = new Set([a0 - t / 2, a1 + t / 2]);
    for (let a = Math.ceil(a0); a < a1; a++) stops.add(a);
    if (!alongX) stops.add(13.95);
    const xs = [...stops].filter(a => a >= a0 - t / 2 && a <= a1 + t / 2).sort((m, n) => m - n);
    for (const side of sides) {
      const off = side * t / 2;
      for (let i = 0; i < xs.length - 1; i++) {
        const pa = wp(alongX, c, xs[i], off, 0), pb = wp(alongX, c, xs[i + 1], off, 0);
        const ha = roofUnder(pa[0], pa[2]), hb = roofUnder(pb[0], pb[2]);
        if (!(ha > w.y[1] + 0.01) || !(hb > w.y[1] + 0.01)) continue;
        b.poly([wp(alongX, c, xs[i], off, w.y[1]), wp(alongX, c, xs[i + 1], off, w.y[1]), wp(alongX, c, xs[i + 1], off, hb), wp(alongX, c, xs[i], off, ha)], 'siding', { n: wn(alongX, side), dens: 1.2 });
      }
    }
  }
  b.poly([[20.8, L.MAIN_CEIL, 30], [28.8, L.MAIN_CEIL, 30], [28.8, L.MAIN_CEIL, 35], [20.8, L.MAIN_CEIL, 35]], 'soffit', { n: [0, -1, 0], dens: 2 });
  b.poly([[31.2, L.MAIN - 0.1, 35], [43.5, L.MAIN - 0.1, 35], [43.5, L.MAIN - 0.1, 36.2], [31.2, L.MAIN - 0.1, 36.2]], 'soffit', { n: [0, -1, 0], dens: 2 });
  b.box(31.0, 43.7, L.MAIN - 0.6, L.MAIN - 0.1, 36.2, 36.45, 'vinyl', { dens: 2 });
  // ground, driveway, walks, street
  b.poly([[-140, -0.03, -140], [190, -0.03, -140], [190, -0.03, 190], [-140, -0.03, 190]], 'grass', { n: [0, 1, 0], dens: 0.12 });
  b.poly([[0.2, -0.01, L.GARAGE_Z], [20.6, -0.01, L.GARAGE_Z], [20.6, -0.01, 75], [0.2, -0.01, 75]], 'concrete', { n: [0, 1, 0], dens: 0.6 });
  b.poly([[22.6, -0.01, 35.2], [27, -0.01, 35.2], [27, -0.01, 75], [22.6, -0.01, 75]], 'stone', { n: [0, 1, 0], dens: 0.8 });
  b.poly([[35.9, -0.01, -30], [39.1, -0.01, -30], [39.1, -0.01, -13.2], [35.9, -0.01, -13.2]], 'stone', { n: [0, 1, 0], dens: 0.8 });
  b.poly([[-140, -0.005, 75], [190, -0.005, 75], [190, -0.005, 100], [-140, -0.005, 100]], 'asphalt', { n: [0, 1, 0], dens: 0.1 });
}

// ================================================================== doors ===
// Leaf geometry in the door's local frame: hinge at origin, leaf along +x, thickness on z.
function buildDoor(s) {
  const w = s.a1 - s.a0 - 0.04, H = L.DOOR_H, T = 0.14;
  const lb = new Builder();
  const g = new THREE.BoxGeometry(w, H, T, 4, 10, 1);
  g.translate(w / 2 + 0.02, H / 2 + 0.02, 0);
  if (s.style === 'front') {
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const u = (pos.getX(i) - 0.02) / w, v = (pos.getY(i) - 0.02) / H;
      uv.setXY(i, pos.getZ(i) > 0 ? 0.16 + u * 0.64 : 0.80 - u * 0.64, 0.04 + v * 0.93);
    }
  }
  lb.mesh(g, s.style === 'front' ? 'frontDoor' : 'doorWhite');
  if (s.style === 'panel' && w > 1.2) {
    for (const side of [-1, 1]) {
      for (const [y0, y1] of [[3.55, 6.25], [0.55, 3.2]]) {
        lb.mbox(0.35, w - 0.31, y0, y1, side > 0 ? T / 2 : -T / 2 - 0.035, side > 0 ? T / 2 + 0.035 : -T / 2, 'doorWhite');
      }
    }
  }
  if (s.style === 'rear') {
    for (const side of [-1, 1]) lb.mbox(0.45, w - 0.45, 1.4, 6.2, side > 0 ? T / 2 : -T / 2 - 0.02, side > 0 ? T / 2 + 0.02 : -T / 2, 'frosted');
  }
  const knob = s.style === 'front' ? 'bronze' : 'nickel';
  for (const side of [-1, 1]) {
    lb.prim(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), knob, w - 0.25, 3.0, side * (T / 2 + 0.015), 0, { rx: Math.PI / 2 });
    lb.prim(new THREE.SphereGeometry(0.1, 16, 12), knob, w - 0.25, 3.0, side * (T / 2 + 0.16));
    lb.prim(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 10), knob, w - 0.25, 3.0, side * (T / 2 + 0.08), 0, { rx: Math.PI / 2 });
  }
  for (const y of [0.9, 3.4, 5.9]) lb.mbox(-0.03, 0.05, y - 0.15, y + 0.15, -0.05, 0.05, knob);
  return { spec: s, parts: lb.parts, w: w + 0.04 };
}
function buildGarageDoor(s) {
  const w = s.x1 - s.x0, lb = new Builder();
  const g = new THREE.BoxGeometry(w, s.h, 0.15, 8, 8, 1);
  g.translate(w / 2, s.h / 2, 0);
  lb.mesh(g, 'garageDoor');
  for (let i = 1; i < 4; i++) lb.mbox(0, w, i * s.h / 4 - 0.03, i * s.h / 4 + 0.03, -0.1, 0.1, 'garageDoor');
  return { spec: s, parts: lb.parts, w };
}
