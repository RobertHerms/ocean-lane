// Builds the whole house (static geometry, doors, lights) from layout.js.
// Deterministic: the baker and the walkthrough call this and get identical geometry.
import * as THREE from 'three';
import * as L from './layout.js';
import { Builder, extrude } from './geom.js';

const TRIM = 'trim';
const EPS = 1e-4;
const FLOOR_LEVELS = [L.LOW, L.MID, L.FRONT, L.MAIN];
const NO_FLOOR = new Set(['foyer', 'rear', 'stcl']);   // rooms whose floors are drawn separately (landings, flights)
const NO_CEIL = new Set(['stcl', 'rcl']);

export function roomAt(x, z, y) {
  for (const r of L.ROOMS) {
    if (y < r.h[0] - EPS || y >= r.h[1]) continue;
    for (const [x0, x1, z0, z1] of r.bay ? [...r.rects, r.bay] : r.rects) if (x >= x0 - EPS && x <= x1 + EPS && z >= z0 - EPS && z <= z1 + EPS) return r;
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
  const sliders = [];          // sliding patio doors: moving panel + shade
  walls(b, glass, sliders);
  bowWindow(b, glass);
  floorsAndCeilings(b, glass);
  moldings(b);
  stairs(b);
  railings(b);
  fixtures(b, lamps);
  kitchen(b);
  stairCloset(b);
  furniture(b, mirrors, glass);
  wallArt(b);
  exterior(b);
  switchPlates(b);
  const doors = L.DOORS.map(s => buildDoor(s));
  const garageDoors = L.GARAGE_DOORS.map(s => buildGarageDoor(s));
  return { b, glass, mirrors, lamps, doors, garageDoors, sliders };
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
// top of a wall at position a along it (the annex walls follow the lean-to roof)
function wallTop(w, a) { return w.slope && w.z0 !== w.z1 ? Math.min(w.y[1], L.annexCeil(a)) : w.y[1]; }
// point on a wall line: along a, offset o (normal side), height y
const wp = (alongX, c, a, o, y) => (alongX ? [a, y, c + o] : [c + o, y, a]);
const wn = (alongX, s) => (alongX ? [0, 0, s] : [s, 0, 0]);
const xz = p => [p[0], p[2]];

function walls(b, glass, sliders) {
  for (const [wi, w] of L.WALLS.entries()) {
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
      for (const cut of [L.MAIN - 0.1, L.MAIN + 3, ...(w.yCuts || [])]) ranges = ranges.flatMap(([s, e]) => (s < cut - 1e-6 && e > cut + 1e-6 ? [[s, cut], [cut, e]] : [[s, e]]));
      for (const [s, e0] of ranges) {
        if (e0 - s < 1e-3) continue;
        // a free wall end runs on by half its thickness to close the corner; where another wall carries
        // on in line (a butt joint) it stops at the joint so the two faces don't overlap
        const jp = p === a0 ? joinedAt(w, p, -1, s, e0) : null, jq = q === a1 ? joinedAt(w, q, 1, s, e0) : null;
        const pp = p === a0 && !opEdges.has(p) ? (jp ? p - 0.01 : p - t / 2) : p;   // joints overlap a hair (no crack)
        const qq = q === a1 && !opEdges.has(q) ? (jq ? q + 0.01 : q + t / 2) : q;
        // a sloped wall top (lean-to annex) runs from ep at pp to eq at qq
        const isTop = Math.abs(e0 - w.y[1]) < 1e-6;
        const ep = isTop ? wallTop(w, pp) : e0, eq = isTop ? wallTop(w, qq) : e0, e = Math.max(ep, eq);
        if (e - s < 1e-3) continue;
        const ym = (s + Math.min(ep, eq)) / 2;
        for (const side of [-1, 1]) {
          const probe = wp(alongX, c, mid, side * (t / 2 + 0.25), ym);
          const r = roomAt(probe[0], probe[2], ym);
          const mat = paintFor(r, ym);
          const o = side * t / 2;
          b.poly([wp(alongX, c, pp, o, s), wp(alongX, c, qq, o, s), wp(alongX, c, qq, o, eq), wp(alongX, c, pp, o, ep)], mat,
            { n: wn(alongX, side), dens: r ? undefined : 1.2, chart: r ? `wall${wi}:${side}:${s < L.MAIN - 0.2 ? 'lo' : 'hi'}` : undefined });
        }
        // end / jamb faces
        const jambMat = a => {
          const op = w.ops.find(o2 => (o2.a0 === a || o2.a1 === a) && o2.b0 < e && o2.b1 > s);
          if (!op) return null;
          return op.kind === 'open' && !op.passThrough ? paintFor(roomAt(...xz(wp(alongX, c, a, 0, 0)), op.b0 + 1), op.b0 + 1) : TRIM;
        };
        const ends = [[pp, -1, opEdges.has(p) ? jambMat(p) : null, p === a0 && !(jp && jp.t >= t - 1e-6)], [qq, 1, opEdges.has(q) ? jambMat(q) : null, q === a1 && !(jq && jq.t >= t - 1e-6)]];
        for (const [a, dir, jm, isWallEnd] of ends) {
          if (!jm && !isWallEnd) continue;
          const mat = jm || paintFor(roomAt(...xz(wp(alongX, c, a + dir * 0.3, 0, 0)), ym), ym);
          const ea = dir < 0 ? ep : eq;
          b.poly([wp(alongX, c, a, -t / 2, s), wp(alongX, c, a, t / 2, s), wp(alongX, c, a, t / 2, ea), wp(alongX, c, a, -t / 2, ea)], mat,
            { n: alongX ? [dir, 0, 0] : [0, 0, dir] });
        }
        // soffit / sill faces next to openings
        for (const op of covering) {
          if (Math.abs(op.b1 - s) < 1e-6) {
            // soffit: each half of the wall's thickness, unless a room's flat ceiling at that height already
            // runs over it (to the wall centreline) and the two would be coplanar
            const mat = op.kind === 'open' && !op.passThrough ? paintFor(roomAt(...xz(wp(alongX, c, mid, 0, 0)), s - 1), s - 1) : TRIM;
            for (const [o0, o1] of [[-t / 2, 0], [0, t / 2]]) {
              const pr = wp(alongX, c, mid, Math.sign(o0 + o1) * (t / 2 + 0.3), s - 0.5), r = roomAt(pr[0], pr[2], s - 0.5);
              if (r && !r.slope && !NO_CEIL.has(r.id) && Math.abs(r.h[1] - s) < 1e-6) continue;
              b.poly([wp(alongX, c, p, o0, s), wp(alongX, c, q, o0, s), wp(alongX, c, q, o1, s), wp(alongX, c, p, o1, s)], mat, { n: [0, -1, 0] });
            }
          }
          if (Math.abs(op.b0 - e0) > 1e-6 || op.passThrough) continue;
          // no sill under an opening at floor level (doors, the front sidelights, the patio slider): the floors
          // (and the stoop / threshold outside) already cover it, and a sill face would be coplanar and z-fight
          if (FLOOR_LEVELS.some(y => Math.abs(op.b0 - y) < 1e-6) && (op.kind === 'door' || op.sidelight || op.slider)) continue;
          // a window's sill face stops where its stool starts (the stool's top is at the same height)
          const [s0, s1] = op.kind === 'window' ? (ins => (ins > 0 ? [-t / 2, t / 2 - 0.2] : [-(t / 2 - 0.2), t / 2]))(windowInSide(w, op)) : [-t / 2, t / 2];
          if (s1 - s0 > 1e-3) b.poly([wp(alongX, c, p, s0, e0), wp(alongX, c, q, s0, e0), wp(alongX, c, q, s1, e0), wp(alongX, c, p, s1, e0)], TRIM, { n: [0, 1, 0] });
        }
        const lo = wp(alongX, c, pp, -t / 2, s), hi = wp(alongX, c, qq, t / 2, e), ce = Math.min(e, w.colTop ?? Infinity);
        if (ce > s) b.collider(Math.min(lo[0], hi[0]), Math.max(lo[0], hi[0]), s, ce, Math.min(lo[2], hi[2]), Math.max(lo[2], hi[2]));
      }
    }
    capTop(b, w);
    for (const op of w.ops) {
      if (op.kind === 'window') windowUnit(b, glass, w, op, sliders);
      else if (op.kind === 'door') { (op.unit ? unitCasing : casings)(b, w, op); if (op.bypass) bypassTrack(b, w, op); }
      else if (op.passThrough) passThroughTrim(b, w, op);
      else if (op.garageDoor) garageTrim(b, w, op);
    }
  }
}
// A wall that stops below the ceilings on both sides (a half wall under a railing) gets a top face over
// whatever of its footprint no floor, tread, solid or taller wall already covers. Where its top is the
// floor level of the room on one side, that room's floor runs on over it (same material and lightmap chart)
// and the edge on the other (stairwell) side gets an oak nosing.
function capTop(b, w) {
  if (w.slope) return;
  const { alongX, t, c, a0, a1 } = wallInfo(w), y = w.y[1];
  const rs = [-1, 1].map(s => {
    const p = wp(alongX, c, (a0 + a1) / 2, s * (t / 2 + 0.3), y + 0.05), r = roomAt(p[0], p[2], y + 0.05);
    return r && y + 0.05 < (r.slope ? L.annexCeil(p[2]) : r.h[1]) ? r : null;
  });
  if (!rs[0] || !rs[1]) return;
  // the wall's footprint at its top: its length (to the joint or half a thickness past a free end) less the
  // openings that reach the top
  const lengthRects = (w2, yy) => {
    const q = wallInfo(w2);
    const e0 = joinedAt(w2, q.a0, -1, yy - 0.1, yy) ? q.a0 : q.a0 - q.t / 2, e1 = joinedAt(w2, q.a1, 1, yy - 0.1, yy) ? q.a1 : q.a1 + q.t / 2;
    let segs = [[e0, e1]];
    for (const op of w2.ops) if (op.b0 < yy && op.b1 >= yy - 1e-6) segs = subtract(segs, op.a0, op.a1);
    return segs.map(([s0, s1]) => (q.alongX ? [s0, s1, q.c - q.t / 2, q.c + q.t / 2] : [q.c - q.t / 2, q.c + q.t / 2, s0, s1]));
  };
  const cover = [...floorRectsAt(y), ...L.SOLIDS.filter(s => Math.abs(s.b[3] - y) < 1e-6).map(s => [s.b[0], s.b[1], s.b[4], s.b[5]]),
    ...L.WALLS.filter(w2 => w2 !== w && w2.y[0] <= y + 1e-6 && w2.y[1] > y + 0.05).flatMap(w2 => lengthRects(w2, y + 0.05))];
  const fi = rs.findIndex(r => Math.abs(r.h[0] - y) < 1e-6), fr = rs[fi];
  const mat = fr ? fr.floor : TRIM, o = fr ? { chart: 'floor' + y } : { dens: 8 };
  for (const rect of lengthRects(w, y - 0.05)) {
    for (const [x0, x1, z0, z1] of rectMinus(rect, cover)) {
      if (x1 - x0 < 1e-3 || z1 - z0 < 1e-3) continue;
      b.poly([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], mat, { n: [0, 1, 0], ...o });
      if (!fr) continue;
      const s = fi === 0 ? 1 : -1, face = c + s * t / 2, e0 = alongX ? x0 : z0, e1 = alongX ? x1 : z1;   // nosing on the other side
      if (Math.abs((alongX ? (s > 0 ? z1 : z0) : (s > 0 ? x1 : x0)) - face) > 1e-3) continue;
      const p0 = wp(alongX, c, e0, s * t / 2, y), p1 = wp(alongX, c, e1, s * (t / 2 + 0.07), y);   // (0.07: clear of a 0.06 skirt board)
      b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y - 0.12, y, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), 'oak',
        { skip: [alongX ? (s > 0 ? 'nz' : 'pz') : (s > 0 ? 'nx' : 'px')], dens: 8, bevel: 0.02 });
    }
  }
}
// The collinear wall (if any) that continues past `pos` in direction `dir` over heights s..e.
function joinedAt(w, pos, dir, s, e) {
  const me = wallInfo(w);
  for (const w2 of L.WALLS) {
    if (w2 === w) continue;
    const q = wallInfo(w2);
    if (q.alongX !== me.alongX || Math.abs(q.c - me.c) > 1e-3) continue;
    if (Math.min(e, w2.y[1]) - Math.max(s, w2.y[0]) < 0.01) continue;
    const f = pos + dir * 0.05;
    if (f > q.a0 && f < q.a1) return q;
  }
  return null;
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
// Front entry: one casing around the whole door + sidelight unit, a frieze board over the head and a
// cap that stands out like a shelf (photo 56). The mullions between door and sidelights are the unit frame.
function unitCasing(b, w, op) {
  const { alongX, t, c } = wallInfo(w);
  const [u0, u1] = op.unit, W = 0.33, P = 0.06, top = op.b1;
  const box = (s0, s1, y0, y1, d0, d1, mat, o) => {
    const p0 = wp(alongX, c, s0, d0, y0), p1 = wp(alongX, c, s1, d1, y1);
    b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), mat, o);
  };
  for (const side of [-1, 1]) {
    const o0 = side * t / 2, o1 = side * (t / 2 + P), wallSide = alongX ? (side > 0 ? 'nz' : 'pz') : (side > 0 ? 'nx' : 'px');
    casingBox(b, alongX, c, u0 - W, u0, op.b0, top + 0.55, o0, o1, side);
    casingBox(b, alongX, c, u1, u1 + W, op.b0, top + 0.55, o0, o1, side);
    casingBox(b, alongX, c, u0 - W, u1 + W, top, top + 0.55, o0, side * (t / 2 + P + 0.012), side);            // frieze board
    box(u0 - W - 0.06, u1 + W + 0.06, top + 0.47, top + 0.55, o0, side * (t / 2 + 0.13), TRIM, { skip: [wallSide], dens: 8 });   // bed mould
    box(u0 - W - 0.15, u1 + W + 0.15, top + 0.55, top + 0.69, o0, side * (t / 2 + 0.23), TRIM, { skip: [wallSide], dens: 8, bevel: 0.015 });  // cap
    for (const [m0, m1] of op.mullions || []) box(m0, m1, op.b0, top + 0.05, side * (t / 2 - 0.02), side * (t / 2 + 0.012), 'stain:#3b1f1a', { skip: [wallSide], dens: 6 });
  }
}
// Kitchen / dining pass-through: one white stool through the wall with an apron under it on each face.
// The face toward the room with crown (dining) gets a fluted casing with corner blocks, a frieze, bed
// mould and a cap that stands out like a shelf (proportions as unitCasing); the kitchen face a flat casing.
function passThroughTrim(b, w, op) {
  const { alongX, t, c } = wallInfo(w);
  const W = 0.33, sill = op.b0, top = op.b1, s0 = op.a0 - W, s1 = op.a1 + W;
  const box = (a0, a1, y0, y1, d0, d1, o = {}) => {
    const p0 = wp(alongX, c, a0, d0, y0), p1 = wp(alongX, c, a1, d1, y1);
    b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), TRIM, { dens: 8, ...o });
  };
  box(s0 - 0.1, s1 + 0.1, sill - 0.09, sill, -t / 2 - 0.15, t / 2 + 0.15, { bevel: 0.015 });            // stool
  for (const side of [-1, 1]) {
    const o0 = side * t / 2, d = p => side * (t / 2 + p);
    const skip = [alongX ? (side > 0 ? 'nz' : 'pz') : (side > 0 ? 'nx' : 'px')];
    const cas = (a0, a1, y0, y1, p) => casingBox(b, alongX, c, a0, a1, y0, y1, o0, d(p), side);
    const probe = wp(alongX, c, (op.a0 + op.a1) / 2, side * (t / 2 + 0.4), sill + 1);
    if (!roomAt(probe[0], probe[2], sill + 1)?.crown) {
      cas(s0, op.a0, sill, top, 0.06); cas(op.a1, s1, sill, top, 0.06);
      box(s0, s1, top, top + W, o0, d(0.06), { skip });
      cas(s0, s1, sill - 0.09 - 0.25, sill - 0.09, 0.06);                                                  // apron
      continue;
    }
    // fluted casing: a board 0.045 proud with ribs at 0.07 (bead, two ribs, outer band → three grooves)
    cas(s0, op.a0, sill, top, 0.045); cas(op.a1, s1, sill, top, 0.045);
    box(op.a0, op.a1, top, top + W, o0, d(0.045), { skip });
    for (const [u0, u1] of [[0, 0.05], [0.09, 0.13], [0.17, 0.21], [0.25, W]]) {
      cas(op.a0 - u1, op.a0 - u0, sill, top, 0.07); cas(op.a1 + u0, op.a1 + u1, sill, top, 0.07);
      box(op.a0, op.a1, top + u0, top + u1, o0, d(0.07), { skip });
    }
    for (const [a0, a1] of [[s0, op.a0], [op.a1, s1]]) box(a0, a1, top, top + W, o0, d(0.075), { skip });   // corner blocks
    const fTop = top + W + 0.3;
    box(s0, s1, top + W, fTop, o0, d(0.08), { skip });                                                     // frieze
    box(s0 - 0.06, s1 + 0.06, fTop - 0.08, fTop, o0, d(0.13), { skip });                                   // bed mould
    box(s0 - 0.15, s1 + 0.15, fTop, fTop + 0.14, o0, d(0.25), { skip, bevel: 0.015 });                     // cap
    cas(s0, s1, sill - 0.09 - 0.3, sill - 0.09, 0.06);                                                     // apron + bead
    const yb = sill - 0.09 - 0.28;
    beam(b, wp(alongX, c, s0, d(0.06), yb), wp(alongX, c, s1, d(0.06), yb), 0.045, 0, TRIM, { round: true });
  }
}
// Head track and floor guide for bypass closet doors.
function bypassTrack(b, w, op) {
  const { alongX, c } = wallInfo(w);
  const box = (s0, s1, y0, y1, d0, d1) => {
    const p0 = wp(alongX, c, s0, d0, y0), p1 = wp(alongX, c, s1, d1, y1);
    b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), 'nickel', { dens: 8 });
  };
  box(op.a0, op.a1, op.b1 - 0.1, op.b1, -0.19, 0.19);
  const m = (op.a0 + op.a1) / 2;
  box(m - 0.1, m + 0.1, op.b0, op.b0 + 0.05, -0.19, 0.19);
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
function sliderUnit(b, glass, w, op, inSide, sliders) {
  const { alongX, t, c } = wallInfo(w);
  const P = (a, o, y) => wp(alongX, c, a, o, y);
  const maker = (bb, mesh) => (s0, s1, y0, y1, d0, d1, mat, o = {}) => {
    const p0 = P(s0, d0, y0), p1 = P(s1, d1, y1);
    const a = [Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), mat];
    if (mesh) bb.mbox(...a); else bb.box(...a, { dens: 8, ...o });
  };
  const pb = new Builder(), sb = new Builder();
  const blk = maker(b, false), pblk = maker(pb, true), sblk = maker(sb, true);
  const fw = 0.2, f0 = inSide * -0.1, f1 = inSide * 0.3;
  blk(op.a0, op.a0 + fw, op.b0, op.b1, f0, f1, 'vinyl'); blk(op.a1 - fw, op.a1, op.b0, op.b1, f0, f1, 'vinyl');
  blk(op.a0, op.a1, op.b1 - fw, op.b1, f0, f1, 'vinyl');
  blk(op.a0 - 0.05, op.a1 + 0.05, op.b0, op.b0 + 0.08, inSide * -0.25, inSide * 0.32, 'nickel');        // threshold
  const mid = (op.a0 + op.a1) / 2, pw = 0.22, y0 = op.b0 + 0.08, y1 = op.b1 - fw;
  const panel = (mk, s0, s1, d) => {
    const dd0 = d - inSide * 0.06, dd1 = d + inSide * 0.06;
    mk(s0, s0 + pw, y0, y1, dd0, dd1, 'vinyl'); mk(s1 - pw, s1, y0, y1, dd0, dd1, 'vinyl');
    mk(s0, s1, y0, y0 + 0.3, dd0, dd1, 'vinyl'); mk(s0, s1, y1 - pw, y1, dd0, dd1, 'vinyl');
    return [P(s0 + pw, d, y0 + 0.3), P(s1 - pw, d, y0 + 0.3), P(s1 - pw, d, y1 - pw), P(s0 + pw, d, y1 - pw)];
  };
  // outer panel (right, seen from inside) is fixed; the inner panel on the left slides open in front of it
  glass.push({ pts: panel(blk, mid - 0.1, op.a1 - fw, 0), n: wn(alongX, inSide) });
  const s0 = op.a0 + fw, s1 = mid + 0.1;
  const panelGlass = panel(pblk, s0, s1, inSide * 0.17);
  pblk(mid - 0.02, mid + 0.04, op.b0 + 3.0, op.b0 + 3.9, inSide * 0.24, inSide * 0.3, 'nickel');       // pull handle
  // cellular shade on a fixed headrail; the shade and its bottom rail roll up
  const o0 = inSide * t / 2, W = 0.29;
  blk(op.a0 - 0.1, op.a1 + 0.1, op.b1 + 0.02, op.b1 + 0.3, o0 + inSide * 0.02, o0 + inSide * 0.24, 'vinyl');
  sblk(op.a0 - 0.05, op.a1 + 0.05, op.b0 + 0.35, op.b1 + 0.02, o0 + inSide * 0.08, o0 + inSide * 0.18, 'blind');
  sblk(op.a0 - 0.05, op.a1 + 0.05, op.b0 + 0.3, op.b0 + 0.35, o0 + inSide * 0.07, o0 + inSide * 0.19, 'vinyl');
  // interior casing (no stool) and exterior trim
  const o1 = inSide * (t / 2 + 0.055);
  casingBox(b, alongX, c, op.a0 - W, op.a0, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a1, op.a1 + W, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a0 - W - 0.03, op.a1 + W + 0.03, op.b1 + 0.3, op.b1 + W + 0.32, o0, o1, inSide);
  const e0 = -inSide * t / 2, e1 = -inSide * (t / 2 + 0.07);
  casingBox(b, alongX, c, op.a0 - 0.35, op.a0, op.b0, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a1, op.a1 + 0.35, op.b0, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a0 - 0.35, op.a1 + 0.35, op.b1, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  sliders.push({
    spec: { id: 'slider', name: 'Sliding door', alongX, c, a0: op.a0, a1: op.a1, base: op.b0, top: op.b1 + 0.02, slide: s1 - s0 - 0.3,
            cx: alongX ? (s0 + s1) / 2 : c, cz: alongX ? c : (s0 + s1) / 2 },
    panel: { parts: pb.parts }, shade: { parts: sb.parts }, glass: panelGlass, n: wn(alongX, inSide),
  });
}

// Which side of the wall (±1 on its normal) a window's room is on.
function windowInSide(w, op) {
  if (op.inSide) return op.inSide;
  const { alongX, t, c } = wallInfo(w);
  for (const s of [-1, 1]) { const p = wp(alongX, c, (op.a0 + op.a1) / 2, s * (t / 2 + 0.4), (op.b0 + op.b1) / 2); if (roomAt(p[0], p[2], (op.b0 + op.b1) / 2)) return s; }
  return 1;
}
// Double-hung vinyl window: frame, sashes, glass, interior casing + stool, raised blinds.
function windowUnit(b, glass, w, op, sliders) {
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
  const inSide = windowInSide(w, op);
  if (op.slider) return sliderUnit(b, glass, w, op, inSide, sliders);
  const fw = 0.16, depth = 0.34;
  const f0 = inSide * -0.02, f1 = inSide * (depth - 0.02);
  const frame = (s0, s1, y0, y1, d0 = f0, d1 = f1) => {
    const p0 = P(s0, d0, y0), p1 = P(s1, d1, y1);
    b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), y0, y1, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), 'vinyl', { dens: 8 });
  };
  frame(op.a0, op.a0 + fw, op.b0, op.b1); frame(op.a1 - fw, op.a1, op.b0, op.b1);
  frame(op.a0, op.a1, op.b1 - fw, op.b1); frame(op.a0, op.a1, op.b0, op.b0 + fw);
  const h = op.b1 - op.b0;
  // panes: relative widths (a picture window's big centre light is fixed); otherwise 1-2 equal units
  const weights = op.panes || Array((op.a1 - op.a0) > 5.5 ? 2 : 1).fill(1);
  const wsum = weights.reduce((a, v) => a + v, 0), big = Math.max(...weights);
  const sash = 0.13;
  let acc = op.a0 + fw;
  for (let k = 0; k < weights.length; k++) {
    const s0 = acc, s1 = s0 + (op.a1 - op.a0 - 2 * fw) * weights[k] / wsum;
    acc = s1;
    if (k > 0) frame(s0 - 0.06, s0 + 0.06, op.b0, op.b1);
    const fixed = op.panes && weights[k] === big;
    const ys = h > 2.6 && !fixed
      ? [[op.b0 + fw, op.b0 + h / 2 + 0.03, inSide * 0.2], [op.b0 + h / 2 - 0.03, op.b1 - fw, inSide * 0.08]]
      : [[op.b0 + fw, op.b1 - fw, inSide * 0.14]];
    for (const [y0, y1, d] of ys) {
      const dd0 = d - inSide * 0.05, dd1 = d + inSide * 0.05;
      frame(s0, s0 + sash, y0, y1, dd0, dd1); frame(s1 - sash, s1, y0, y1, dd0, dd1);
      frame(s0, s1, y0, y0 + sash, dd0, dd1); frame(s0, s1, y1 - sash, y1, dd0, dd1);
      glass.push({ pts: [P(s0 + sash, d, y0 + sash), P(s1 - sash, d, y0 + sash), P(s1 - sash, d, y1 - sash), P(s0 + sash, d, y1 - sash)], n: wn(alongX, inSide) });
    }
  }
  // interior casing, stool and apron (cw: narrower casing that stops at a bow window's joints). Over a
  // countertop (sill within a foot of it) there's no apron and only a narrow stool: the backsplash is below
  const o0 = inSide * t / 2, o1 = inSide * (t / 2 + 0.055), W = 0.29;
  const [W0, W1] = op.cw || [W, W], j0 = W0 < W, j1 = W1 < W;
  casingBox(b, alongX, c, op.a0 - W0, op.a0, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a1, op.a1 + W1, op.b0, op.b1 + W, o0, o1, inSide);
  casingBox(b, alongX, c, op.a0 - W0 - (j0 ? 0 : 0.03), op.a1 + W1 + (j1 ? 0 : 0.03), op.b1, op.b1 + W + 0.02, o0, o1, inSide);
  casingBox(b, alongX, c, op.a0 - W0 - (j0 ? 0 : 0.1), op.a1 + W1 + (j1 ? 0 : 0.1), op.b0 - 0.07, op.b0, inSide * (t / 2 - 0.2), inSide * (t / 2 + (op.overCounter ? 0.1 : 0.2)), inSide);
  if (!op.overCounter) casingBox(b, alongX, c, op.a0 - W0 + (j0 ? 0 : 0.02), op.a1 + W1 - (j1 ? 0 : 0.02), op.b0 - 0.37, op.b0 - 0.07, o0, o1, inSide);
  // raised blinds: slat stack at the head of the opening
  const bs = inSide * (t / 2 - 0.12);
  const p0 = P(op.a0 + 0.05, bs - inSide * 0.08, op.b1 - 0.42), p1 = P(op.a1 - 0.05, bs + inSide * 0.08, op.b1 - 0.02);
  b.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), op.b1 - 0.42, op.b1 - 0.02, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), 'blind', { dens: 8 });
  // exterior trim
  const e0 = -inSide * t / 2, e1 = -inSide * (t / 2 + 0.07);
  const [X0, X1] = op.xw || [0.35, 0.35], k0 = op.xw ? 0 : 0.05, k1 = op.xw ? 0 : 0.05;
  casingBox(b, alongX, c, op.a0 - X0, op.a0, op.b0 - 0.2, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a1, op.a1 + X1, op.b0 - 0.2, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a0 - X0, op.a1 + X1, op.b1, op.b1 + 0.35, e0, e1, -inSide, 'vinyl');
  casingBox(b, alongX, c, op.a0 - X0 - k0, op.a1 + X1 + k1, op.b0 - 0.2, op.b0, e0, -inSide * (t / 2 + 0.16), -inSide, 'vinyl');
}

// ============================================================ bow window ===
// Living-room front (L.BOW): five equal window panels on a shallow arc. Each panel is a short straight
// wall built along x in its own frame and turned into place; inside there is a low flat ceiling behind
// a header, outside a fascia and soffit under the cantilevered floor.
function bowWindow(b, glass) {
  const { x0, x1, z, sag, n, sill, head, ceil } = L.BOW, t = 0.5, h = t / 2, F = L.MAIN, TOP = L.MAIN_CEIL;
  const half = (x1 - x0) / 2, R = (half * half + sag * sag) / (2 * sag), ox = (x0 + x1) / 2, oz = z + sag - R;
  const span = Math.asin(half / R), step = 2 * span / n, miter = h / Math.cos(step / 2);
  const at = (a, r) => [ox + r * Math.sin(a), oz + r * Math.cos(a)];
  const V = [], I = [], O = [];          // centreline, inside-face and outside-face corners
  for (let k = 0; k <= n; k++) { const a = -span + step * k; V.push(at(a, R)); I.push(at(a, R - miter)); O.push(at(a, R + miter)); }
  const dirOf = k => { const dx = V[k + 1][0] - V[k][0], dz = V[k + 1][1] - V[k][1], l = Math.hypot(dx, dz); return [dx / l, dz / l, l]; };
  const cross = (k, P, zc) => { const [dx, dz] = dirOf(k); const u = (zc - P[1]) / dz; return [P[0] + dx * u, zc]; };   // facet k's face line through P meets z = zc
  const outline = (P, zc) => [cross(0, P[1], zc), ...P.slice(1, n), cross(n - 1, P[n - 1], zc)];
  b.poly(outline(I, z).map(([px, pz]) => [px, F, pz]), 'wood', { n: [0, 1, 0] });
  b.poly(outline(I, z + 0.25).map(([px, pz]) => [px, ceil, pz]), 'ceiling', { n: [0, -1, 0] });   // from the header's outer face
  b.poly(outline(O, z + h).map(([px, pz]) => [px, F - 0.6, pz]), 'soffit', { n: [0, -1, 0], dens: 2 });
  const paint = 'paint:' + L.PAINT.tan, ext = h * Math.tan(step / 2);
  for (let k = 0; k < n; k++) {
    const [dx, dz, len] = dirOf(k), first = k === 0, last = k === n - 1;
    const mx = (V[k][0] + V[k + 1][0]) / 2, mz = (V[k][1] + V[k + 1][1]) / 2, ang = Math.atan2(-dz, dx);
    const loc = P => mx + (P[0] - mx) * dx + (P[1] - mz) * dz;           // world point → position along the facet
    const A0 = mx - len / 2 - (first ? 0.1 : ext), A1 = mx + len / 2 + (last ? 0.1 : ext);
    const p0 = first ? 0.22 : 0.12, p1 = last ? 0.22 : 0.12;           // wall left beside the opening
    const wa0 = mx - len / 2 + p0, wa1 = mx + len / 2 - p1;
    const i0 = loc(first ? cross(0, I[1], z - h) : I[k]), i1 = loc(last ? cross(n - 1, I[n - 1], z - h) : I[k + 1]);
    const gl = [];
    rotated(b, mx, mz, ang, sub => {
      // local frame: the panel runs along +x at z = mz, the room is on the -z side
      const zi = mz - h, zo = mz + h;
      const face = (a0, a1, y0, y1, zz, nz, mat) => sub.poly([[a0, y0, zz], [a1, y0, zz], [a1, y1, zz], [a0, y1, zz]], mat, { n: [0, 0, nz] });
      face(A0, A1, F, sill, zi, -1, paint); face(A0, wa0, sill, head, zi, -1, paint); face(wa1, A1, sill, head, zi, -1, paint);
      face(A0, A1, head, ceil, zi, -1, paint);
      face(A0, A1, F - 0.6, F - 0.1, zo, 1, 'vinyl');
      face(A0, A1, F - 0.1, sill, zo, 1, 'siding'); face(A0, wa0, sill, head, zo, 1, 'siding'); face(wa1, A1, sill, head, zo, 1, 'siding');
      face(A0, A1, head, TOP, zo, 1, 'siding');
      sub.poly([[wa0, sill, zi], [wa0, sill, zo], [wa0, head, zo], [wa0, head, zi]], TRIM, { n: [1, 0, 0] });
      sub.poly([[wa1, sill, zi], [wa1, sill, zo], [wa1, head, zo], [wa1, head, zi]], TRIM, { n: [-1, 0, 0] });
      sub.poly([[wa0, sill, mz - 0.05], [wa1, sill, mz - 0.05], [wa1, sill, zo], [wa0, sill, zo]], TRIM, { n: [0, 1, 0] });   // the stool covers the rest
      sub.poly([[wa0, head, zi], [wa1, head, zi], [wa1, head, zo], [wa0, head, zo]], TRIM, { n: [0, -1, 0] });
      sub.poly([[A0, TOP, zi], [A1, TOP, zi], [A1, TOP, zo], [A0, TOP, zo]], 'siding', { n: [0, 1, 0] });
      const w = { x0: A0, x1: A1, z0: mz, z1: mz, y: [F - 0.6, TOP], ops: [], t, ext: true };
      windowUnit(sub, gl, w, {
        a0: wa0, a1: wa1, b0: sill, b1: head, kind: 'window', inSide: -1,
        cw: [wa0 - i0 - 0.005, i1 - wa1 - 0.005], xw: [first ? 0.16 : p0 + ext, last ? 0.16 : p1 + ext],
      });
      extrude(sub, BASE, [i0 - (first ? 0.1 : 0), F, zi], [1, 0, 0], [0, 0, -1], i1 - i0 + (first ? 0.1 : 0) + (last ? 0.1 : 0), TRIM, { dens: 8 });
    });
    const c = Math.cos(ang), s = Math.sin(ang);
    const rp = ([px, py, pz]) => { const ddx = px - mx, ddz = pz - mz; return [mx + ddx * c + ddz * s, py, mz - ddx * s + ddz * c]; };
    for (const g of gl) glass.push({ ...g, pts: g.pts.map(rp), n: [g.n[0] * c + g.n[2] * s, g.n[1], -g.n[0] * s + g.n[2] * c] });
    // siding from the top of the wall up to the roof, and colliders along the panel
    const nx = -dz, nz = dx, wpt = (a, o) => [mx + dx * (a - mx) + nx * o, mz + dz * (a - mx) + nz * o];
    const [ax, az] = wpt(A0, h), [bx, bz] = wpt(A1, h);
    const ra = roofUnder(ax, az), rb = roofUnder(bx, bz);
    if (ra > TOP && rb > TOP) b.poly([[ax, TOP, az], [bx, TOP, bz], [bx, rb, bz], [ax, ra, az]], 'siding', { n: [nx, 0, nz], dens: 1.2 });
    for (let a = A0 + 0.2; a < A1; a += 0.4) { const [px, pz] = wpt(a, 0); b.collider(px - 0.25, px + 0.25, F - 0.1, TOP, pz - 0.25, pz + 0.25); }
  }
}

// ======================================================= floors & ceilings ===
function floorsAndCeilings(b, glass) {
  const ceilDone = [];                                // flat ceilings so far [y, rect]: later rooms don't repeat them
  for (const r of L.ROOMS) {
    for (const [x0, x1, z0r, z1r] of r.rects) {
      if (!NO_FLOOR.has(r.id)) b.poly([[x0, r.h[0], z0r], [x1, r.h[0], z0r], [x1, r.h[0], z1r], [x0, r.h[0], z1r]], r.floor, { n: [0, 1, 0], chart: 'floor' + r.h[0] });
      if (NO_CEIL.has(r.id)) continue;
      const cy = z => (r.slope ? L.annexCeil(z) : r.h[1]);
      // a sloped (annex) ceiling runs between the faces of the walls at its ends, not their centrelines: run on
      // under a wall it passes up inside it (the wall's top is open) and bakes outdoor light onto the joint
      const face = (zc, dir) => {
        const w = r.slope && L.WALLS.find(w2 => { const q = wallInfo(w2); return q.alongX && Math.abs(q.c - zc) < 1e-3 && q.a0 < x1 - 1e-3 && q.a1 > x0 + 1e-3 && w2.y[1] > cy(zc) - 0.2; });
        if (!w) return zc;
        const zf = zc + dir * wallInfo(w).t / 2;
        // an opening whose head stands above the ceiling there (the pantry door): close the slot over it
        for (const op of w.ops) {
          const a0 = Math.max(op.a0, x0), a1 = Math.min(op.a1, x1);
          if (a1 - a0 > 1e-3 && op.b1 > cy(zf) + 1e-3) b.poly([[a0, cy(zf), zf], [a1, cy(zf), zf], [a1, op.b1, zf], [a0, op.b1, zf]], 'ceiling', { n: [0, 0, -dir] });
        }
        return zf;
      };
      const z0 = face(z0r, 1), z1 = face(z1r, -1);
      const holes = L.SKYLIGHTS.map(sk => sk.r).filter(([a0, a1, c0, c1]) => a0 >= x0 && a1 <= x1 && c0 >= z0 && c1 <= z1 && r.h[1] === L.MAIN_CEIL);
      const k = Math.hypot(1, L.ANNEX_SLOPE), cn = r.slope ? [0, -1 / k, L.ANNEX_SLOPE / k] : [0, -1, 0];
      const done = r.slope ? [] : ceilDone.filter(([y]) => Math.abs(y - r.h[1]) < 1e-6).map(([, q]) => q);
      if (!r.slope) ceilDone.push([r.h[1], [x0, x1, z0, z1]]);
      for (const [a0, a1, c0, c1] of rectMinus([x0, x1, z0, z1], [...holes, ...done])) {
        if (a1 - a0 < 1e-3 || c1 - c0 < 1e-3) continue;
        b.poly([[a0, cy(c0), c0], [a1, cy(c0), c0], [a1, cy(c1), c1], [a0, cy(c1), c1]], 'ceiling', { n: cn, chart: r.slope ? 'slope' : 'ceil' + r.h[1] });
      }
    }
    if (r.rug) {
      const [x0, x1, z0, z1, key] = r.rug, y = r.h[0] + 0.045;
      b.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], key, { n: [0, 1, 0], uv: key === 'rugDining' ? 'face' : undefined });
      b.box(x0, x1, r.h[0], y, z0, z1, key, { skip: ['py', 'ny'], dens: 4 });
    }
  }
  // landings, stair-closet floors, the lower-hall ceiling strip under the upper foyer
  const F = L.FRONT, kx = 24.8 + OPEN_W;              // the landing stops at the knee wall's cap beside the bottom flight
  // entry tile: the 18" grid set out from the front door (a grout line on its centreline, a full tile at the sill)
  const entryUV = pts => pts.map(p => [p[0] - 24.8, -(p[2] - 29.75)]);
  const landings = [[F, [kx, 28.8, L.FU.z1, L.FD.z1], 'tileEntry'], [F, [20.8, 28.8, L.FD.z1, 30], 'tileEntry'], [L.MID, [35, 42.2, -8, -4.4], 'carpetBeige']];
  for (const [y, [x0, x1, z0, z1], mat] of landings) {
    const pts = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    b.poly(pts, mat, { n: [0, 1, 0], uv: mat === 'tileEntry' ? entryUV(pts) : undefined });
  }
  b.poly([[20.8, L.LOW, 19.5], [24.8, L.LOW, 19.5], [24.8, L.LOW, 29.75], [20.8, L.LOW, 29.75]], 'tileGrey', { n: [0, 1, 0] });   // under the bottom flight and the landing
  b.poly([[24.8, L.LOW, 19.5], [28.8, L.LOW, 19.5], [28.8, L.LOW, 29.75], [24.8, L.LOW, 29.75]], 'tileGrey', { n: [0, 1, 0] });   // stair closet
  b.poly([[20.8, L.LOW_CEIL, 19.5], [28.8, L.LOW_CEIL, 19.5], [28.8, L.LOW_CEIL, 20], [20.8, L.LOW_CEIL, 20]], 'ceiling', { n: [0, -1, 0] });
  // exposed edges of the main floor at the stair openings
  b.poly([[20.8, L.LOW_CEIL - 0.05, 20], [24.8, L.LOW_CEIL - 0.05, 20], [24.8, L.MAIN, 20], [20.8, L.MAIN, 20]], 'paint:' + L.PAINT.tan, { n: [0, 0, 1] });
  // solids: no top face where a floor at that height already covers it (the carpeted MID landings, the pantry
  // floor): the paint would be coplanar with the floor and z-fight with it
  for (const s of L.SOLIDS) {
    const [x0, x1, y0, y1, z0, z1] = s.b, mat = 'paint:' + s.paint, dens = s.ext ? 2 : undefined;
    b.box(x0, x1, y0, y1, z0, z1, mat, { skip: ['ny', 'py'], collide: true, dens });
    const cover = [...floorRectsAt(y1), ...landings.filter(([y]) => Math.abs(y - y1) < 1e-6).map(([, q]) => q)];
    for (const [a0, a1, c0, c1] of rectMinus([x0, x1, z0, z1], cover)) {
      if (a1 - a0 > 1e-3 && c1 - c0 > 1e-3) b.poly([[a0, y1, c0], [a0, y1, c1], [a1, y1, c1], [a1, y1, c0]], mat, { n: [0, 1, 0], dens });
    }
  }
  // skylight wells up through the roof, glazed at the top of a curb
  for (const sk of L.SKYLIGHTS) {
    if (sk.lean) { leaningShaft(b, glass, sk); continue; }
    const [x0, x1, z0, z1] = sk.r;
    const inAnnex = x0 >= 35 && x1 <= 45 && z0 >= -8 && z1 <= 0;           // well starts at the sloped ceiling there
    const ya = inAnnex ? L.annexCeil(z0) : L.MAIN_CEIL, yb = inAnnex ? L.annexCeil(z1) : L.MAIN_CEIL;
    const y1 = Math.max(roofUnder(x0, z0), roofUnder(x1, z1), roofUnder(x0, z1), roofUnder(x1, z0)) + 0.35;
    b.poly([[x0, ya, z0], [x1, ya, z0], [x1, y1, z0], [x0, y1, z0]], 'ceiling', { n: [0, 0, 1] });
    b.poly([[x0, yb, z1], [x1, yb, z1], [x1, y1, z1], [x0, y1, z1]], 'ceiling', { n: [0, 0, -1] });
    b.poly([[x0, ya, z0], [x0, yb, z1], [x0, y1, z1], [x0, y1, z0]], 'ceiling', { n: [1, 0, 0] });
    b.poly([[x1, ya, z0], [x1, yb, z1], [x1, y1, z1], [x1, y1, z0]], 'ceiling', { n: [-1, 0, 0] });
    for (const [pts, n] of [
      [[[x0 - 0.2, y1, z0 - 0.2], [x1 + 0.2, y1, z0 - 0.2], [x1 + 0.2, y1 + 0.3, z0 - 0.2], [x0 - 0.2, y1 + 0.3, z0 - 0.2]], [0, 0, -1]],
      [[[x0 - 0.2, y1, z1 + 0.2], [x1 + 0.2, y1, z1 + 0.2], [x1 + 0.2, y1 + 0.3, z1 + 0.2], [x0 - 0.2, y1 + 0.3, z1 + 0.2]], [0, 0, 1]],
      [[[x0 - 0.2, y1, z0 - 0.2], [x0 - 0.2, y1, z1 + 0.2], [x0 - 0.2, y1 + 0.3, z1 + 0.2], [x0 - 0.2, y1 + 0.3, z0 - 0.2]], [-1, 0, 0]],
      [[[x1 + 0.2, y1, z0 - 0.2], [x1 + 0.2, y1, z1 + 0.2], [x1 + 0.2, y1 + 0.3, z1 + 0.2], [x1 + 0.2, y1 + 0.3, z0 - 0.2]], [1, 0, 0]],
    ]) b.poly(pts, 'vinyl', { n, dens: 3 });
    glass.push({ pts: [[x0, y1 + 0.25, z0], [x1, y1 + 0.25, z0], [x1, y1 + 0.25, z1], [x0, y1 + 0.25, z1]], n: [0, -1, 0] });
  }
}
// A skylight whose shaft leans toward the back of the house: the glazing lies in the roof plane, its
// south edge straight above the ceiling opening's north edge, running `len` up the roof toward the north.
// Returns the ceiling opening r, the glass footprint and top(z) = height of the shaft's top edge.
function skylightShaft(sk) {
  const [x0, x1, z0, z1] = sk.r, [gx0, gx1] = sk.lean.glass, xm = (gx0 + gx1) / 2;
  const top = z => roofUnder(xm, z) + 0.35;
  const k = (roofUnder(xm, z0 + 0.5) - roofUnder(xm, z0 - 0.5));          // roof rise per foot toward the south
  const gz1 = z0, gz0 = gz1 - sk.lean.len / Math.hypot(1, k);
  // south face: from the opening's south edge up to the glass's south edge (a third of the way up: the can)
  const south = { bot: [(x0 + x1) / 2, L.MAIN_CEIL, z1], top: [xm, top(gz1), gz1] };
  return { r: sk.r, glass: [gx0, gx1, gz0, gz1], top, south };
}
function leaningShaft(b, glass, sk) {
  const [x0, x1, z0, z1] = sk.r, { glass: [gx0, gx1, gz0, gz1], top } = skylightShaft(sk), C = L.MAIN_CEIL;
  const ts = top(gz1), tn = top(gz0);
  b.poly([[x0, C, z1], [x1, C, z1], [gx1, ts, gz1], [gx0, ts, gz1]], 'ceiling', { n: [0, -(ts - C), -(z1 - gz1)] });   // south face (overhangs, faces down-north)
  b.poly([[x0, C, z0], [x1, C, z0], [gx1, tn, gz0], [gx0, tn, gz0]], 'ceiling', { n: [0, z0 - gz0, tn - C] });          // north face (faces up-south)
  // east / west faces taper from the opening's width to the glass's: two triangles each (not planar as quads)
  for (const [xa, xg, s] of [[x0, gx0, 1], [x1, gx1, -1]]) {
    b.poly([[xa, C, z0], [xa, C, z1], [xg, ts, gz1]], 'ceiling', { n: [s, 0, 0] });
    b.poly([[xa, C, z0], [xg, ts, gz1], [xg, tn, gz0]], 'ceiling', { n: [s, 0, 0] });
  }
  // vinyl curb round the glass, following the roof slope (from the roof's underside up past the glass)
  const cx0 = gx0 - 0.2, cx1 = gx1 + 0.2, cz0 = gz0 - 0.2, cz1 = gz1 + 0.2, lo = z => roofUnder((gx0 + gx1) / 2, z), hi = z => top(z) + 0.3;
  b.poly([[cx0, lo(cz0), cz0], [cx1, lo(cz0), cz0], [cx1, hi(cz0), cz0], [cx0, hi(cz0), cz0]], 'vinyl', { n: [0, 0, -1], dens: 3 });
  b.poly([[cx0, lo(cz1), cz1], [cx1, lo(cz1), cz1], [cx1, hi(cz1), cz1], [cx0, hi(cz1), cz1]], 'vinyl', { n: [0, 0, 1], dens: 3 });
  for (const [x, s] of [[cx0, -1], [cx1, 1]]) b.poly([[x, lo(cz0), cz0], [x, lo(cz1), cz1], [x, hi(cz1), cz1], [x, hi(cz0), cz0]], 'vinyl', { n: [s, 0, 0], dens: 3 });
  const yg = z => top(z) + 0.25, k = (yg(gz1) - yg(gz0)) / (gz1 - gz0), gn = [0, -1, k], l = Math.hypot(...gn);
  glass.push({ pts: [[gx0, yg(gz0), gz0], [gx1, yg(gz0), gz0], [gx1, yg(gz1), gz1], [gx0, yg(gz1), gz1]], n: gn.map(v => v / l) });
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

// Does a wall run across the line of a face at `pos`, just in front of it (an inside corner)?
function crossesInFront(wi, pos, faceC, s, y) {
  return L.WALLS.some(w2 => {
    const q = wallInfo(w2);
    if (q.alongX === wi.alongX || y < w2.y[0] - EPS || y > w2.y[1] + EPS || Math.abs(q.c - pos) > q.t / 2 + 0.05) return false;
    const f = faceC + s * 0.1;
    return f > q.a0 - q.t / 2 - EPS && f < q.a1 + q.t / 2 + EPS;
  });
}
// Does another wall carry on in line beyond `pos`?
function continuesInLine(wi, pos, dir, y) {
  return L.WALLS.some(w2 => {
    const q = wallInfo(w2);
    if (q.alongX !== wi.alongX || Math.abs(q.c - wi.c) > 0.06 || y < w2.y[0] - EPS || y > w2.y[1] + EPS) return false;
    const f = pos + dir * 0.05;
    return f > q.a0 && f < q.a1;
  });
}

function moldings(b) {
  for (const r of L.ROOMS) {
    if (['rear', 'stcl', 'rcl'].includes(r.id)) continue;
    const crownOnly = r.id === 'foyer';            // two-storey entry: crown at its ceiling only
    const list = crownOnly ? [...r.crownRects.map(q => [q, 'crown']), ...r.baseRects.map(q => [q, 'base'])]
      : [...r.rects.map(q => [q, 'all']), ...(r.crownRects || []).map(q => [q, 'crown'])];   // extra crown runs (a header inside the room)
    for (const [[x0, x1, z0, z1], kind] of list) {
      const edges = [['x', z0, x0, x1, 1], ['x', z1, x0, x1, -1], ['z', x0, z0, z1, 1], ['z', x1, z0, z1, -1]];
      for (const [ax, c, e0, e1, s] of edges) {
        for (const w of L.WALLS) {
          const wi = wallInfo(w);
          if ((ax === 'x') !== wi.alongX || Math.abs(wi.c - c) > 0.06) continue;
          const lo = Math.max(e0, wi.a0), hi = Math.min(e1, wi.a1);
          if (hi - lo < 0.05) continue;
          const face = wi.c + s * wi.t / 2;
          // draw = false: only work out the runs (baseboard and chair rail are drawn by wallTrim(), which
          // follows the outline of the walls round outside corners and through uncased openings)
          const run = (y, profile, casingGap, pad, draw = true) => {
            if (y < w.y[0] - EPS || y > w.y[1] + EPS) return;
            if (profile === BASE && w.y[1] < y + 0.6) return;      // wall stops at the floor (under a railing): no baseboard
            let segs = [[lo, hi]];
            for (const op of w.ops) {
              if (op.b0 - 0.05 <= y + pad && op.b1 + 0.05 >= y - pad) segs = subtract(segs, op.a0 - casingGap, op.a1 + casingGap);
            }
            if (!draw) return segs;
            for (let [a, bb] of segs) {
              if (bb - a < 0.05) continue;
              let m0 = 0, m1 = 0;
              if (profile === CROWN) {
                // outside corner: the wall ends here with nothing across in front of it, so the crown
                // runs on to the wall's end face and is mitred to meet the crown coming round the corner
                const outside = (pos, dir) => Math.abs(pos - (dir < 0 ? wi.a0 : wi.a1)) < 1e-3
                  && !continuesInLine(wi, pos, dir, y) && !crossesInFront(wi, pos, face, s, y);
                if (outside(a, -1)) { a -= wi.t / 2; m0 = 1; }
                if (outside(bb, 1)) { bb += wi.t / 2; m1 = 1; }
              }
              const origin = wi.alongX ? [a, y, face] : [face, y, a];
              extrude(b, profile, origin, wi.alongX ? [1, 0, 0] : [0, 0, 1], wi.alongX ? [0, 0, s] : [s, 0, 0], bb - a, TRIM, { dens: 8, m0, m1 });
            }
            return segs;
          };
          if (kind === 'crown') { run(r.h[1], CROWN, 0, 0.3); continue; }
          if (kind === 'base') continue;
          const segs = run(r.h[0], BASE, 0.29, 0.3, false) || [];
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
        }
      }
    }
  }
  // baseboard at each floor level, chair rail where a room has one
  const skip = new Set(['rear', 'stcl', 'rcl']);
  const levels = new Set(L.ROOMS.filter(r => !skip.has(r.id)).map(r => r.baseY ?? r.h[0]));
  const inRects = (rects, x, z) => rects.some(([x0, x1, z0, z1]) => x >= x0 - EPS && x <= x1 + EPS && z >= z0 - EPS && z <= z1 + EPS);
  for (const y of levels) {
    wallTrim(b, BASE, y, 0.3, (r, x, z) => !skip.has(r.id) && !(r.bay && inRects([r.bay], x, z))
      && (r.baseY !== undefined ? Math.abs(r.baseY - y) < EPS && inRects(r.baseRects, x, z) : Math.abs(r.h[0] - y) < EPS));
  }
  for (const r of L.ROOMS.filter(q => q.rail)) wallTrim(b, RAIL, r.h[0] + r.rail, 0.15, q => q === r);
}

// Baseboard / chair rail following the plan outline of the walls at height y: the wall footprints there
// (less the openings that reach that height) are merged, and the profile runs along every edge of the
// outline that faces a room `has(room, x, z)` accepts. Round an outside corner (a wall end, a pier)
// the runs are mitred and carry on along the end face; through a plain drywall-wrapped opening they
// wrap the jambs; beside cased openings (doors, windows, the pass-through) they stop at the casing.
function wallTrim(b, profile, y, pad, has) {
  const GAP = 0.29;
  // how the trim treats each opening: 'wrap' (plain drywall-wrapped: round the jambs), 'cased' (stop at
  // the casing) or 'none' (an opening the whole length of its wall, like the bow window's header)
  const treat = (op, l) => (op.kind !== 'open' || op.passThrough || op.garageDoor ? 'cased' : op.a0 <= l.a0 + 1e-6 && op.a1 >= l.a1 - 1e-6 ? 'none' : 'wrap');
  const rects = [];                  // footprints [x0, x1, z0, z1]
  const lines = [];                  // wall lines with their ops, to find casings and jambs
  for (const w of L.WALLS) {
    if (y < w.y[0] - 0.05 || w.y[1] < y + 0.6) continue;      // wall absent here, or it stops at the floor (under a railing)
    const { alongX, t, c, a0, a1 } = wallInfo(w);
    const ops = w.ops.filter(op => op.b0 - 0.05 <= y + pad && op.b1 + 0.05 >= y - pad);
    lines.push({ alongX, t, c, a0, a1, ops });
    const p0 = joinedAt(w, a0, -1, y, y + 0.6) ? a0 - 0.01 : a0 - t / 2, p1 = joinedAt(w, a1, 1, y, y + 0.6) ? a1 + 0.01 : a1 + t / 2;
    let segs = [[p0, p1]];
    for (const op of ops) segs = subtract(segs, op.a0, op.a1);
    for (const [s0, s1] of segs) if (s1 - s0 > 1e-3) rects.push(alongX ? [s0, s1, c - t / 2, c + t / 2] : [c - t / 2, c + t / 2, s0, s1]);
  }
  // cell grid over all the rect bounds; a cell is solid if a footprint covers it
  const snap = v => Math.round(v * 1000) / 1000;
  const xs = [...new Set(rects.flatMap(r => [snap(r[0]), snap(r[1])]))].sort((p, q) => p - q);
  const zs = [...new Set(rects.flatMap(r => [snap(r[2]), snap(r[3])]))].sort((p, q) => p - q);
  const nx = xs.length - 1, nz = zs.length - 1, solid = new Uint8Array(nx * nz);
  const xi = new Map(xs.map((v, i) => [v, i])), zi = new Map(zs.map((v, i) => [v, i]));
  for (const r of rects) {
    for (let i = xi.get(snap(r[0])); i < xi.get(snap(r[1])); i++) for (let j = zi.get(snap(r[2])); j < zi.get(snap(r[3])); j++) solid[i * nz + j] = 1;
  }
  const S = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && solid[i * nz + j] === 1;
  const solidAt = (x, z) => {
    let i = 0, j = 0;
    while (i < nx && xs[i + 1] <= x) i++;
    while (j < nz && zs[j + 1] <= z) j++;
    return x > xs[0] && z > zs[0] && x < xs[nx] && z < zs[nz] && S(i, j);
  };
  // boundary edges, merged into maximal straight runs: [alongX, c, a0, a1, n] (n = ±1: the room side)
  const edges = [];
  for (let j = 0; j <= nz; j++) for (const n of [-1, 1]) {       // edges along x at z = zs[j]
    let start = null;
    for (let i = 0; i <= nx; i++) {
      const on = i < nx && (n > 0 ? S(i, j - 1) && !S(i, j) : S(i, j) && !S(i, j - 1));
      if (on && start === null) start = i;
      if (!on && start !== null) { edges.push([true, zs[j], xs[start], xs[i], n]); start = null; }
    }
  }
  for (let i = 0; i <= nx; i++) for (const n of [-1, 1]) {       // edges along z at x = xs[i]
    let start = null;
    for (let j = 0; j <= nz; j++) {
      const on = j < nz && (n > 0 ? S(i - 1, j) && !S(i, j) : S(i, j) && !S(i - 1, j));
      if (on && start === null) start = j;
      if (!on && start !== null) { edges.push([false, xs[i], zs[start], zs[j], n]); start = null; }
    }
  }
  const P = (alongX, c, a) => (alongX ? [a, c] : [c, a]);
  for (const [alongX, c, e0, e1, n] of edges) {
    // a jamb of a cased opening (door, window, pass-through): the casing covers it
    const atEdge = op => Math.abs(op.a0 - c) < 0.02 || Math.abs(op.a1 - c) < 0.02;
    const jamb = lines.find(l => l.alongX !== alongX && e0 >= l.c - l.t / 2 - 0.02 && e1 <= l.c + l.t / 2 + 0.02 && l.ops.some(atEdge));
    if (jamb && !jamb.ops.some(op => atEdge(op) && treat(op, jamb) === 'wrap')) continue;
    // split where the room in front changes between trimmed / not trimmed, then cut round the casings
    let segs = [], cur = null;
    for (let a = e0; a < e1 - 1e-6; a = Math.min(e1, a + 0.1)) {
      const m = Math.min(e1, a + 0.1), [px, pz] = P(alongX, c + n * 0.3, (a + m) / 2);
      const r = roomAt(px, pz, y + 1), ok = !!r && has(r, px, pz);
      if (ok && !cur) { cur = [a, m]; segs.push(cur); } else if (ok) cur[1] = m; else cur = null;
    }
    for (const l of lines) {
      if (l.alongX !== alongX || Math.abs(Math.abs(l.c - c) - l.t / 2) > 0.02) continue;
      for (const op of l.ops) if (treat(op, l) === 'cased') segs = subtract(segs, op.a0 - GAP, op.a1 + GAP);
    }
    // outside corner at an end of the edge: the solid stops just past it → mitre
    const convex = (a, dir) => {
      const [qx, qz] = P(alongX, c + n * 0.01, a + dir * 0.01), [rx, rz] = P(alongX, c - n * 0.01, a + dir * 0.01);
      return !solidAt(qx, qz) && !solidAt(rx, rz);
    };
    // inside corner: the solid carries on across the face line just past the end (the end is buried)
    const concave = (a, dir) => { const [qx, qz] = P(alongX, c + n * 0.01, a + dir * 0.01); return solidAt(qx, qz); };
    for (const [a, bb] of segs) {
      if (bb - a < 0.05) continue;
      const m0 = Math.abs(a - e0) < 1e-6 && convex(e0, -1) ? 1 : 0, m1 = Math.abs(bb - e1) < 1e-6 && convex(e1, 1) ? 1 : 0;
      const origin = alongX ? [a, y, c] : [c, y, a];
      extrude(b, profile, origin, alongX ? [1, 0, 0] : [0, 0, 1], alongX ? [0, 0, n] : [n, 0, 0], bb - a, TRIM, { dens: 8, m0, m1 });
      // square ends that show (the room changes, a casing gap) get the profile as an end cap
      for (const [e, dir, m] of [[a, -1, m0], [bb, 1, m1]]) {
        if (m || concave(e, dir)) continue;
        const loop = [...(profile[0][0] ? [[0, profile[0][1]]] : []), ...profile, ...(profile[profile.length - 1][0] ? [[0, profile[profile.length - 1][1]]] : [])];   // closed on the wall
        const pts = loop.map(([o, u]) => (alongX ? [e, y + u, c + n * o] : [c + n * o, y + u, e]));
        b.poly(pts, TRIM, { n: alongX ? [dir, 0, 0] : [0, 0, dir], dens: 8 });
      }
    }
  }
}

// Light-switch plates beside each room door, on the side the door swings into: on the latch side just past
// the casing (a door with sidelights: past the whole unit's casing), failing that on the hinge side, and only
// where the plate sits whole on a wall face at that height, clear of openings, casings and furniture.
function switchPlates(b) {
  for (const d of L.DOORS) {
    if (/closet/i.test(d.name) || d.group !== d.id) continue;
    const alongX = d.axis === 'x', y = d.base + 4.0;
    const onLine = w2 => { const q = wallInfo(w2); return q.alongX === alongX && Math.abs(q.c - d.c) < 0.01; };
    const op = L.WALLS.filter(onLine).flatMap(w2 => w2.ops).find(o => o.kind === 'door' && Math.abs(o.a0 - d.a0) < 0.01);
    const [u0, u1] = op?.unit || [d.a0, d.a1], cw = op?.unit ? 0.33 : 0.29;
    for (const a of d.hinge ? [u0 - cw - 0.3, u1 + cw + 0.3] : [u1 + cw + 0.3, u0 - cw - 0.3]) {
      const w = L.WALLS.find(w2 => { const q = wallInfo(w2); return onLine(w2) && a - 0.12 >= q.a0 && a + 0.12 <= q.a1 && w2.y[0] <= y - 0.19 && w2.y[1] >= y + 0.19; });
      if (!w) continue;
      const clear = w.ops.every(o => {
        const [o0, o1] = o.unit || [o.a0, o.a1], g = o.unit ? 0.33 : 0.29;
        return a + 0.12 <= o0 - g || a - 0.12 >= o1 + g || y + 0.19 <= o.b0 - 0.4 || y - 0.19 >= o.b1 + 0.4;
      });
      const s = d.swing, face = d.c + s * wallInfo(w).t / 2, [fx, fz] = alongX ? [a, face + s * 0.15] : [face + s * 0.15, a];
      if (!clear || b.boxes.some(k => fx > k.x0 && fx < k.x1 && fz > k.z0 && fz < k.z1 && y > k.y0 && y < k.y1)) continue;
      const o0 = face, o1 = face + s * 0.025;
      if (alongX) b.mbox(a - 0.12, a + 0.12, y - 0.19, y + 0.19, Math.min(o0, o1), Math.max(o0, o1), 'plate');
      else b.mbox(Math.min(o0, o1), Math.max(o0, o1), y - 0.19, y + 0.19, a - 0.12, a + 0.12, 'plate');
      break;
    }
  }
}

// ================================================================ stairs ===
// Sloped undersides of the two flights that climb over closets (z → height).
const SOFFITS = {
  frontUp: z => L.FRONT - 0.7 + (L.FU.z1 - z) / (L.FU.z1 - L.FU.z0) * (L.MAIN - 1.25 - (L.FRONT - 0.7)),
  rearUp: z => L.MID - 0.7 + (z + 4.4) / 4.4 * (L.MAIN - 1.25 - (L.MID - 0.7)),
  frontDown: z => L.LOW + (z - L.FD.z0 - 1.6) * (L.FRONT - L.LOW) / (L.FD.z1 - L.FD.z0),   // meets the floor under the third step
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
// Plan rects [x0,x1,z0,z1] of the room floors and stair treads whose top is at height y.
function floorRectsAt(y) {
  const out = [];
  for (const r of L.ROOMS) if (!NO_FLOOR.has(r.id) && Math.abs(r.h[0] - y) < 1e-6) out.push(...r.rects);
  for (const f of L.FLIGHTS) {
    const x0 = f.r[0] - (f.open < 0 ? OPEN_W + 0.05 : 0), x1 = f.r[1] + (f.open > 0 ? OPEN_W + 0.05 : 0);
    for (const s of flightSteps(f)) {
      if (Math.abs(s.top - y) > 1e-6) continue;
      const nose = s.upper === s.zb ? -0.09 : 0.09, zf = s.upper === s.zb ? s.za : s.zb;
      out.push([x0, x1, Math.min(s.za, zf + nose), Math.max(s.zb, zf + nose)]);
    }
  }
  return out;
}

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
      const base = soffit ? Math.max(0, soffit(upAtZ1 ? zb : za)) : 0;
      b.box(x0, x1, base, top - 0.09, Math.min(za, zb), Math.max(za, zb), riserMat, { skip: ['ny', 'py'], dens: 6 });
      // the nose's front face is only 0.09 tall: lightmapped, its texels land mostly inside the riser block
      // below and bake black, so the lip is drawn probe-lit instead and the tread box has no front face
      const front = upAtZ1 ? 'nz' : 'pz', sg = Math.sign(nose);
      const carpet = f.finish === 'carpet';
      const t0 = carpet ? Math.min(za, zb) : Math.min(za, zb, zFront + nose), t1 = carpet ? Math.max(za, zb) : Math.max(za, zb, zFront + nose);
      // open side: tread ends run 0.05 past the stringer and show their end grain
      const tx0 = x0 - (f.open < 0 ? 0.05 : 0), tx1 = x1 + (f.open > 0 ? 0.05 : 0);
      const lip = f.finish === 'oak' || carpet;                 // (the exterior stone stoops keep a plain box)
      const tSkip = ['ny', ...(lip ? [front] : []), ...(f.open < 0 ? [] : ['nx']), ...(f.open > 0 ? [] : ['px'])];
      b.box(tx0, tx1, top - 0.09, top, t0, t1, treadMat, { skip: tSkip, dens: 7, uv: f.finish === 'oak' ? 'face' : undefined, bevel: 0.035 });
      if (carpet) {
        // carpet wraps the nose: a rounded lip along the riser top
        b.prim(new THREE.CylinderGeometry(0.05, 0.05, tx1 - tx0, 12), treadMat, (tx0 + tx1) / 2, top - 0.045, zFront + sg * 0.01, 0, { rz: Math.PI / 2 });
      } else if (lip) {
        const zn = zFront + nose;
        b.mbox(tx0, tx1, top - 0.09, top, Math.min(zn, zn - sg * 0.02), Math.max(zn, zn - sg * 0.02), treadMat);
      }
    }
    if (soffit) {
      let zLow = upAtZ1 ? z0 : z1;
      const zHigh = upAtZ1 ? z1 : z0;
      if (soffit(zLow) < 0) zLow += (zHigh - zLow) * -soffit(zLow) / (soffit(zHigh) - soffit(zLow));   // from where it meets the floor
      b.poly([[fx0, soffit(zLow), zLow], [fx1, soffit(zLow), zLow], [fx1, soffit(zHigh), zHigh], [fx0, soffit(zHigh), zHigh]], 'paint:' + (f.under || L.PAINT.closet), { n: [0, -1, 0] });
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
    let segs = flightSteps(fl).map(s => ({ za: s.za, zb: s.zb, top: soff(s.upper), band: true }));
    if (k.z0 < fl.r[2] - 1e-6) segs.push({ za: k.z0, zb: fl.r[2], top: Math.abs(fl.r[2] - hiZ) < 1e-6 ? hi : lo, cap: true });
    if (k.z1 > fl.r[3] + 1e-6) segs.push({ za: fl.r[3], zb: k.z1, top: Math.abs(fl.r[3] - hiZ) < 1e-6 ? hi : lo, cap: true });
    const T = OPEN_W, h = k.hole;
    // an opening under the wall from h.z0 on: its top edge is the underside of the flight next to it
    // (h.under), and it doesn't close again; only the part above that flight's soffit stays
    const hb = h ? z => Math.max(0, SOFFITS[h.under](z)) : null;
    const bot = h ? (g, z) => (g.za >= h.z0 - 1e-6 && g.zb <= h.z1 + 1e-6 ? hb(z) : 0) : () => 0;
    if (h) for (const zc of [h.z0, h.z1]) segs = segs.flatMap(g => (zc > g.za + 1e-6 && zc < g.zb - 1e-6 ? [{ ...g, zb: zc }, { ...g, za: zc }] : [g]));
    for (const s of [-1, 1]) {
      const x = k.x + s * T;
      for (const g of segs) {
        const r = roomAt(x + s * 0.3, (g.za + g.zb) / 2, 1);
        const paint = paintFor(r, 1), ba = bot(g, g.za), bb = bot(g, g.zb);
        if (g.band && s === fl.open) {
          const ya = Math.min(soff(g.za) - 0.6, g.top), yb = Math.min(soff(g.zb) - 0.6, g.top);
          b.poly([[x, ba, g.za], [x, bb, g.zb], [x, yb, g.zb], [x, ya, g.za]], paint, { n: [s, 0, 0] });
          b.poly([[x, ya, g.za], [x, yb, g.zb], [x, g.top, g.zb], [x, g.top, g.za]], TRIM, { n: [s, 0, 0] });
        } else {
          b.poly([[x, ba, g.za], [x, bb, g.zb], [x, g.top, g.zb], [x, g.top, g.za]], paint, { n: [s, 0, 0] });
        }
      }
    }
    if (h) {
      // the opening's jamb at h.z0, the wall's sloped underside along the flight, and the wall's end at k.z1
      const mat = paintFor(roomAt(k.x + 0.5, (h.z0 + h.z1) / 2, 1), 1), y0 = hb(h.z0), y1 = hb(h.z1);
      const k0 = (y1 - y0) / (h.z1 - h.z0), endTop = segs.find(g => Math.abs(g.zb - k.z1) < 1e-6)?.top ?? y1;
      if (y0 > 1e-3) b.poly([[k.x - T, 0, h.z0], [k.x + T, 0, h.z0], [k.x + T, y0, h.z0], [k.x - T, y0, h.z0]], mat, { n: [0, 0, 1] });
      b.poly([[k.x - T, y0, h.z0], [k.x + T, y0, h.z0], [k.x + T, y1, h.z1], [k.x - T, y1, h.z1]], mat, { n: [0, -1, k0] });
      if (h.z1 >= k.z1 - 1e-6) b.poly([[k.x - T, y1, k.z1], [k.x + T, y1, k.z1], [k.x + T, endTop, k.z1], [k.x - T, endTop, k.z1]], mat, { n: [0, 0, 1] });
    }
    for (const g of segs) {
      // cap, except where a floor or a tread at the same height already runs over the wall (coplanar)
      if (g.cap) {
        for (const [a0, a1, c0, c1] of rectMinus([k.x - T, k.x + T, g.za, g.zb], floorRectsAt(g.top))) {
          if (a1 - a0 > 1e-3 && c1 - c0 > 1e-3) b.poly([[a0, g.top, c0], [a1, g.top, c0], [a1, g.top, c1], [a0, g.top, c1]], TRIM, { n: [0, 1, 0] });
        }
      }
      b.collider(k.x - T, k.x + T, Math.min(bot(g, g.za), bot(g, g.zb)), g.top, g.za, g.zb);
    }
  }
  // skirt boards along the stair walls
  const skirt = (x, face, z0, z1, h0, h1) => {
    const bot0 = h0 - 0.2, bot1 = h1 - 0.2;
    b.poly([[x, Math.max(bot0, Math.min(h0, h1)), z0], [x, Math.max(bot1, Math.min(h0, h1)), z1], [x, h1 + 0.75, z1], [x, h0 + 0.75, z0]], TRIM, { n: [face, 0, 0], dens: 7 });
    b.poly([[x - face * 0.06, h0 + 0.75, z0], [x - face * 0.06, h1 + 0.75, z1], [x, h1 + 0.75, z1], [x, h0 + 0.75, z0]], TRIM, { n: [0, 1, 0], dens: 4 });
  };
  const fdH = z => L.LOW + (L.FRONT - L.LOW) * (z - L.FD.z0) / (L.FD.z1 - L.FD.z0);
  skirt(21.0 + 0.06, 1, L.FD.z0, L.FD.z1, L.LOW, L.FRONT);
  skirt(24.6 - 0.06, -1, 19.5, L.FD.z1, fdH(19.5), L.FRONT);
  skirt(28.55 - 0.06, -1, L.FU.z0, L.FU.z1, L.MAIN, L.FRONT);
  skirt(35.25 + 0.06, 1, -4.4, 0, L.MID, L.MAIN);
  skirt(42.0 - 0.06, -1, -4.4, 0, L.MID, L.LOW);
  skirt(38.9 + OPEN_W + 0.06, 1, -4.4, 0, L.MID, L.LOW);        // knee wall side of the rear down flight
}

// ============================================================== railings ===
function beam(b, p0, p1, w, h, mat, o = {}) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  // split along the run so the baked light is sampled along long rails; texture u runs along the
  // run (wood grain) at about 3.5' per repeat
  const segs = Math.max(1, Math.ceil(len / 1.2)), uvs = [];
  let g;
  if (o.round) {
    g = new THREE.CylinderGeometry(w / 2, w / 2, len, 14, segs);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (1 - uv.getY(i)) * len / 3.5, uv.getX(i) * 0.3);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  } else {
    // box with its long axis (x) on the run, height roughly vertical
    g = new THREE.BoxGeometry(len, h, w, segs, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 3.5, uv.getY(i) * 0.25);
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();
    const m = new THREE.Matrix4().makeBasis(dir, up, side.clone().negate());
    g.applyMatrix4(m);
  }
  g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  b.mesh(g, mat, o);
}

// Box newel (0.46 square): plain plinth with a cap moulding, a shaft with a recessed panel framed on all
// four faces, a collar at the rail, a plain upper block, a cap plate and a cushion block on top.
// half ('x+' | 'x-' | 'z+' | 'z-'): a half newel where the rail dies into a wall on that side: the post split
// down its centre plane, (x, z) on the wall face, full width along the wall and half depth out from it, no
// panel on the cut face.
function newelPost(b, x, z, y0, railTop, half) {
  if (half && half !== 'z+') return rotated(b, x, z, { 'x+': Math.PI / 2, 'z-': Math.PI, 'x-': -Math.PI / 2 }[half], sub => newelPost(sub, x, z, y0, railTop, 'z+'));
  const zb = h => (half ? z : z + h), back = half ? ['pz'] : [];                     // (built with the wall at +z)
  const sq = (h, ya, yb, o = {}) => b.box(x - h, x + h, ya, yb, z - h, zb(h), TRIM, { dens: 8, ...o, skip: [...(o.skip || []), ...back] });
  const mould = (h, ya, yb) => b.mbox(x - h, x + h, ya, yb, z - h, zb(h), TRIM);
  sq(0.23, y0, y0 + 0.9, { skip: ['ny', 'py'] });                                    // plinth
  mould(0.245, y0 + 0.9, y0 + 0.925); mould(0.26, y0 + 0.925, y0 + 0.95);             // plinth cap
  const s0 = y0 + 0.95, s1 = railTop - 0.05;
  sq(0.215, s0, railTop, { skip: ['ny', 'py'] });                                    // core: the panels, 0.015 back
  for (const sx of [-1, 1]) for (const sz of half ? [-1] : [-1, 1]) {               // corner stiles
    const cx = x + sx * 0.1875, cz = z + sz * 0.1875;
    b.box(cx - 0.0425, cx + 0.0425, s0, s1, cz - 0.0425, cz + 0.0425, TRIM, { skip: ['ny', 'py'], dens: 8 });
  }
  if (half) for (const sx of [-1, 1]) b.box(x + sx * 0.1875 - 0.0425, x + sx * 0.1875 + 0.0425, s0, s1, z - 0.0425, z, TRIM, { skip: ['ny', 'py', 'pz'], dens: 8 });   // stiles on the wall
  for (const [ya, yb] of [[s0, s0 + 0.07], [s1 - 0.07, s1]]) {                        // top and bottom rails
    b.mbox(x - 0.23, x + 0.23, ya, yb, z - 0.145, zb(0.145), TRIM);
    b.mbox(x - 0.145, x + 0.145, ya, yb, z - 0.23, zb(0.23), TRIM);
  }
  mould(0.26, railTop, railTop + 0.07);                                               // collar
  sq(0.23, railTop + 0.07, railTop + 0.47, { skip: ['ny', 'py'] });                  // upper block
  sq(0.31, railTop + 0.47, railTop + 0.54, { bevel: 0.02 });                          // cap plate
  const sh = new THREE.Shape(), y1 = half ? 0.07 : -0.12;                            // cushion: 0.38 square, rounded
  sh.moveTo(-0.12, y1); sh.lineTo(0.12, y1); sh.lineTo(0.12, 0.12); sh.lineTo(-0.12, 0.12); sh.lineTo(-0.12, y1);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  b.prim(g, TRIM, x, railTop + 0.54, z);
  b.collider(x - 0.23, x + 0.23, y0, railTop + 0.72, z - 0.23, zb(0.23));
}

function railings(b) {
  for (const r of L.RAILINGS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const at = t => [r.x0 + (r.x1 - r.x0) * t, r.base(t), r.z0 + (r.z1 - r.z0) * t];
    const sloped = r.base(0) !== r.base(1);
    const p0 = at(0), p1 = at(1);
    if (!sloped) beam(b, [p0[0], p0[1] + 0.08, p0[2]], [p1[0], p1[1] + 0.08, p1[2]], 0.22, 0.16, r.shoe || TRIM);
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
    for (const nd of r.newels) {                          // t, or { t, half } for a half newel on a wall
      const nt = nd.t ?? nd, p = at(nt);
      newelPost(b, p[0], p[2], r.newelBase ? r.newelBase(nt) : sloped ? p[1] - 0.12 : r.base(nt), p[1] + r.h + 0.1, nd.half);
    }
    b.collider(Math.min(r.x0, r.x1) - 0.14, Math.max(r.x0, r.x1) + 0.14, Math.min(r.base(0), r.base(1)), Math.max(r.base(0), r.base(1)) + r.h,
      Math.min(r.z0, r.z1) - 0.14, Math.max(r.z0, r.z1) + 0.14);
  }
  for (const [x0, z0, x1, z1, h0, h1] of L.HANDRAILS) {
    beam(b, [x0, h0, z0], [x1, h1, z1], 0.24, 0.2, 'oak');
    const wallX = x0 < 24 ? 20.8 + 0.2 : x0 < 30 ? 28.8 - 0.2 : x0 < 38 ? 35 + 0.25 : 42.2 - 0.2;
    // returns: each end turns and dies into the wall
    const out = Math.sign(x0 - wallX);
    for (const [z, h] of [[z0, h0], [z1, h1]]) beam(b, [wallX - out * 0.02, h, z], [x0 + out * 0.12, h, z], 0.24, 0.2, 'oak');
    for (const t of [0.35, 0.65]) {
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = h0 + (h1 - h0) * t;
      b.mbox(Math.min(wallX, x) - 0.02, Math.max(wallX, x) + 0.02, y - 0.25, y - 0.18, z - 0.03, z + 0.03, 'nickel');
    }
  }
}

// ============================================================== fixtures ===
function fixtures(b, lamps) {
  // smoke detectors: white domed disc with a vented rim and a small status light
  for (const [x, z, y] of L.SMOKE) {
    b.prim(new THREE.CylinderGeometry(0.25, 0.27, 0.08, 32), 'plate', x, y - 0.04, z);
    b.prim(new THREE.CylinderGeometry(0.17, 0.22, 0.05, 32), 'plate', x, y - 0.105, z);
    b.prim(new THREE.SphereGeometry(0.018, 8, 6), 'paint:#3fae5a', x + 0.12, y - 0.13, z);
  }
  for (const f of L.FIXTURES) {
    const { x, z, y } = f;
    if (f.kind === 'can') {
      b.prim(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 24), TRIM, x, y - 0.015, z);
      b.prim(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 24), 'lampGlow', x, y - 0.034, z, 0, { bake: false });
      lamps.push({ x, y: y - 0.06, z, r: 0.22, kind: 'down', I: f.I || 5.5 });
    } else if (f.kind === 'wellcan') {
      // can in a skylight shaft's south face, `up` of the way up it, facing along the face normal (north,
      // and down where the shaft leans toward the back)
      const sk = L.SKYLIGHTS[f.sky], { bot, top: tp } = sk.lean ? skylightShaft(sk).south
        : { bot: [(sk.r[0] + sk.r[1]) / 2, L.MAIN_CEIL, sk.r[3]], top: [(sk.r[0] + sk.r[1]) / 2, L.MAIN_CEIL + 3, sk.r[3]] };
      const v = [0, tp[1] - bot[1], tp[2] - bot[2]], l = Math.hypot(...v), n = [0, v[2] / l, -v[1] / l];
      const P = d => [bot[0] + v[0] * f.up + n[0] * d, bot[1] + v[1] * f.up + n[1] * d, bot[2] + v[2] * f.up + n[2] * d];
      const rx = Math.atan2(n[2], n[1]);                                  // turns the cylinder's axis (y) onto n
      b.prim(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 24), TRIM, ...P(0.015), 0, { rx });
      b.prim(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 24), 'lampGlow', ...P(0.034), 0, { rx, bake: false });
      const q = P(0.2);
      lamps.push({ x: q[0], y: q[1], z: q[2], r: 0.2, kind: 'omni', I: 4 });
    } else if (f.kind === 'fan') {
      // bath exhaust fan: white grille with dark louvre slots, no light
      b.mbox(x - 0.45, x + 0.45, y - 0.04, y, z - 0.35, z + 0.35, 'plate');
      for (let i = 0; i < 12; i++) { const sz = z - 0.275 + i * 0.05; b.mbox(x - 0.36, x + 0.36, y - 0.046, y - 0.039, sz - 0.0125, sz + 0.0125, 'paint:#2b2a28'); }
    } else if (f.kind === 'track') {
      // white ceiling track; cylinder spot heads on short stems, tilted 45 degrees down toward -z. Only the
      // lenses glow: each lamp is a 'down' lamp just in front of its lens, so the track and the heads' bodies
      // (above it) aren't flooded by their own lamps and don't bake as bright blocks
      b.mbox(f.x0, f.x1, y - 0.06, y, z - 0.05, z + 0.05, 'plate');
      const dy = -Math.SQRT1_2, dz = -Math.SQRT1_2, hy = y - 0.4;
      for (const hx of f.heads) {
        b.prim(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 8), 'plate', hx, y - 0.19, z);
        b.prim(new THREE.SphereGeometry(0.05, 10, 8), 'plate', hx, y - 0.32, z);
        b.prim(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 20), 'plate', hx, hy, z, 0, { rx: -3 * Math.PI / 4 });
        b.prim(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 20), 'lampGlow', hx, hy + dy * 0.23, z + dz * 0.23, 0, { rx: -3 * Math.PI / 4, bake: false });
        lamps.push({ x: hx, y: hy + dy * 0.4, z: z + dz * 0.4, r: 0.1, kind: 'down', I: 6 });
      }
    } else if (f.kind === 'flush') {
      // small white flush dome (11")
      b.prim(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 28), 'plate', x, y - 0.02, z);
      const g = new THREE.SphereGeometry(0.4, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      g.scale(1, 0.45, 1);
      b.prim(g, 'frosted', x, y - 0.04, z, 0, { bake: false });
      lamps.push({ x, y: y - 0.3, z, r: 0.25, kind: 'omni', I: 5 });
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
    } else if (f.kind === 'semiflush') {
      // hall fixture (photos 5, 31, 49): small canopy and stem, a ribbed cream glass bowl hung ~10" below
      // the ceiling on three scrolled bronze arms, finial underneath
      const rimY = y - 0.55, hubY = y - 0.2, R = 0.56;
      b.prim(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), 'bronze', x, y - 0.025, z);
      b.prim(new THREE.CylinderGeometry(0.03, 0.03, y - hubY, 8), 'bronze', x, (y + hubY) / 2, z);
      b.prim(new THREE.SphereGeometry(0.06, 12, 8), 'bronze', x, hubY, z);
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; pts.push(new THREE.Vector2(0.001 + Math.sin(a) * R, -Math.cos(a) * 0.34)); }
      const bowl = new THREE.LatheGeometry(pts, 48);
      const bp = bowl.attributes.position;                    // shallow ribs round the glass
      for (let i = 0; i < bp.count; i++) { const px = bp.getX(i), pz = bp.getZ(i), a = Math.atan2(pz, px), k = 1 + 0.02 * Math.cos(a * 24); bp.setX(i, px * k); bp.setZ(i, pz * k); }
      bowl.computeVertexNormals();
      b.prim(bowl, 'alabaster', x, rimY, z, 0, { bake: false });
      b.prim(new THREE.TorusGeometry(R + 0.01, 0.022, 8, 48), 'bronze', x, rimY + 0.005, z, 0, { rx: Math.PI / 2 });
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
        const Pt = (r, yy) => new THREE.Vector3(x + ca * r, yy, z + sa * r);
        b.mesh(new THREE.TubeGeometry(new THREE.CubicBezierCurve3(Pt(0.05, hubY), Pt(0.45, hubY + 0.1), Pt(0.72, rimY + 0.3), Pt(R + 0.01, rimY + 0.005)), 24, 0.02, 6), 'bronze');
        b.prim(new THREE.TorusGeometry(0.07, 0.014, 6, 16, Math.PI * 1.6), 'bronze', x + ca * 0.5, hubY + 0.02, z + sa * 0.5, -a);
      }
      b.prim(new THREE.SphereGeometry(0.045, 10, 8), 'bronze', x, rimY - 0.36, z);
      lamps.push({ x, y: rimY - 0.12, z, r: 0.3, kind: 'omni', I: 8 });
    } else if (f.kind === 'pendant') {
      // entry pendant: amber glass bowl held in a bronze rim ring by four scrolled arms from a hub on the stem
      const bot = y - f.drop, hubY = bot + 1.15, rimY = bot + 0.45;
      b.prim(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20), 'bronze', x, y - 0.03, z);
      b.prim(new THREE.CylinderGeometry(0.022, 0.022, y - hubY, 8), 'bronze', x, (y + hubY) / 2, z);
      b.prim(new THREE.SphereGeometry(0.075, 14, 10), 'bronze', x, hubY, z);
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; pts.push(new THREE.Vector2(0.001 + Math.sin(a) * 0.72, -Math.cos(a) * 0.42)); }
      b.prim(new THREE.LatheGeometry(pts, 32), 'amberGlass', x, rimY, z, 0, { bake: false });
      b.prim(new THREE.TorusGeometry(0.735, 0.028, 8, 48), 'bronze', x, rimY + 0.01, z, 0, { rx: Math.PI / 2 });
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
        const Pt = (r, yy) => new THREE.Vector3(x + ca * r, yy, z + sa * r);
        b.mesh(new THREE.TubeGeometry(new THREE.CubicBezierCurve3(Pt(0.05, hubY), Pt(0.5, hubY + 0.18), Pt(0.98, rimY + 0.55), Pt(0.735, rimY + 0.01)), 28, 0.022, 6), 'bronze');
        b.prim(new THREE.TorusGeometry(0.085, 0.015, 6, 18, Math.PI * 1.6), 'bronze', x + ca * 0.5, hubY - 0.02, z + sa * 0.5, -a);
      }
      b.prim(new THREE.SphereGeometry(0.055, 10, 8), 'bronze', x, bot + 0.01, z);
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

// ========================================================= stair closet ===
// Storage closet under the front stairs: runs from its door under the top flight and on under the entry
// landing to the front wall. White walls, grey tile, a flat ceiling under the landing, a foundation ledge
// along the front wall, a wire-shelving alcove with a bifold door, a black steel cabinet. The partition
// beside the bottom flight is full height only for the first foot past the door; from there it is open
// under the flight (see stairs()), and under the landing the closet runs on west to the stairwell wall.
function stairCloset(b) {
  const WH = 'paint:' + L.PAINT.storage, C = L.FRONT - 0.7, x0 = 24.8 + OPEN_W, xE = 28.55, xW = 20.8 + L.WALL_T / 2;
  b.poly([[x0, C, L.FU.z1], [xE, C, L.FU.z1], [xE, C, L.FD.z1], [x0, C, L.FD.z1]], WH, { n: [0, -1, 0] });      // flat ceiling
  b.poly([[xW, C, L.FD.z1], [xE, C, L.FD.z1], [xE, C, 29.75], [xW, C, 29.75]], WH, { n: [0, -1, 0] });            // ...on under the landing
  // under the bottom flight, wherever the headroom is below 5.5 ft, the player is kept out
  const sd = z => L.LOW + (z - L.FD.z0 - 1.6) * (L.FRONT - L.LOW) / (L.FD.z1 - L.FD.z0), zLow = L.FD.z0 + 1.6 + 5.5 * (L.FD.z1 - L.FD.z0) / (L.FRONT - L.LOW);
  for (let z = 19.5; z < zLow - 1e-6; z += 0.5) b.collider(20.8, x0, 0, Math.max(1.05, sd(z)), z, Math.min(zLow, z + 0.5));
  // white linings where the stairwell's walls run on above the landing height (their faces are tan there)
  const zm = L.FU.z1 - (L.FRONT - C) / ((L.MAIN - 1.25 - C) / (L.FU.z1 - L.FU.z0));                             // soffit at FRONT
  b.poly([[xE - 0.01, L.FRONT, 19.5], [xE - 0.01, L.FRONT, zm], [xE - 0.01, L.MAIN - 1.25, L.FU.z0], [xE - 0.01, L.MAIN - 1.25, 19.5]], WH, { n: [-1, 0, 0] });
  b.poly([[xE - 0.01, L.MAIN - 1.25, 19.5], [xE - 0.01, L.MAIN - 1.25, L.FU.z0], [xE - 0.01, L.LOW_CEIL, L.FU.z0], [xE - 0.01, L.LOW_CEIL, 19.5]], WH, { n: [-1, 0, 0] });
  b.poly([[x0, L.LOW + 6.8, 19.71], [xE, L.LOW + 6.8, 19.71], [xE, L.LOW_CEIL, 19.71], [x0, L.LOW_CEIL, 19.71]], WH, { n: [0, 0, 1] });
  const fd = z => L.LOW + (z - L.FD.z0 - 1.6) * (L.FRONT - L.LOW) / (L.FD.z1 - L.FD.z0), zf = L.FD.z0 + 1.6;       // under the bottom flight
  b.poly([[21.01, 0, zf], [21.01, 0, L.FD.z1], [21.01, fd(L.FD.z1), L.FD.z1]], WH, { n: [1, 0, 0] });
  // marble threshold in the doorway
  b.box(25.5, 28.1, L.LOW, L.LOW + 0.04, 19.28, 19.72, 'tileMarble', { skip: ['ny'], dens: 8 });
  // foundation ledge along the front wall
  b.box(xW, xE, L.LOW, L.LOW + 4.5, 28.95, 29.75, WH, { skip: ['ny', 'pz', 'nx', 'px'], collide: true });
  // wire-shelving alcove: framed box against the east wall, open to the west
  const za = 24.9, zb = 27.3, ax = 27.2, hy = 5.45;
  b.box(ax, xE, 0, C, za, za + 0.1, WH, { skip: ['px', 'ny', 'py'] });
  b.box(ax, xE, 0, C, zb - 0.1, zb, WH, { skip: ['px', 'ny', 'py'] });
  b.box(ax, xE, hy, C, za + 0.1, zb - 0.1, WH, { skip: ['px', 'py'] });
  for (const [z0, z1] of [[za - 0.05, za + 0.14], [zb - 0.14, zb + 0.05]]) b.box(ax - 0.05, ax, 0, hy + 0.1, z0, z1, TRIM, { skip: ['px', 'ny'], dens: 8 });
  b.box(ax - 0.05, ax, hy - 0.1, hy + 0.1, za + 0.14, zb - 0.14, TRIM, { skip: ['px'], dens: 8 });
  for (const y of [1.0, 2.2, 3.4, 4.6]) {
    for (const x of [ax + 0.12, xE - 0.04]) b.mbox(x - 0.012, x + 0.012, y - 0.03, y + 0.012, za + 0.1, zb - 0.1, 'plate');
    for (let z = za + 0.16; z < zb - 0.12; z += 0.1) b.mbox(ax + 0.12, xE - 0.04, y - 0.006, y + 0.006, z - 0.006, z + 0.006, 'plate');
  }
  b.collider(ax - 0.05, xE, 0, C, za - 0.05, zb + 0.05);
  // bifold: the south pair closed in the opening, the north pair folded open against the jamb
  const leaf = (x0l, x1l, z0l, z1l) => b.box(x0l, x1l, 0.05, hy - 0.12, z0l, z1l, 'doorWhite', { dens: 7, bevel: 0.01 });
  leaf(ax + 0.02, ax + 0.1, 26.12, 26.64); leaf(ax + 0.02, ax + 0.1, 26.66, zb - 0.16);
  leaf(ax - 0.5, ax + 0.06, za + 0.16, za + 0.24); leaf(ax - 0.5, ax + 0.06, za + 0.26, za + 0.34);
  b.prim(new THREE.SphereGeometry(0.035, 10, 8), 'nickel', ax - 0.01, 3.0, 26.2);
  // tall black steel cabinet on the east wall, beyond the door's swing
  const cz0 = 22.4, cz1 = cz0 + 1.3, cx = xE - 1.2;
  b.box(cx, xE, L.LOW, L.LOW + 4.5, cz0, cz1, 'tvBody', { skip: ['px', 'ny'], collide: true, bevel: 0.015 });
  b.mbox(cx - 0.005, cx + 0.002, 0.1, 4.4, (cz0 + cz1) / 2 - 0.008, (cz0 + cz1) / 2 + 0.008, 'paint:#050505');
  for (const dz of [-0.12, 0.12]) b.mbox(cx - 0.05, cx, 2.5, 2.9, (cz0 + cz1) / 2 + dz - 0.015, (cz0 + cz1) / 2 + dz + 0.015, 'nickel');
}

// =============================================================== kitchen ===
// Cream flat-panel cabinets with butter-yellow loop pulls, cream solid-surface tops, a curved (concave)
// north-west corner and a rounded end at the stair; the uppers run up to a soffit in the cabinet finish, and a boxed
// bulkhead sits over the sink window. Stainless appliances (photos 3, 4, 37).
function roundedEnd(len, depth, radius) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, depth - radius);
  s.absarc(len - radius, depth - radius, radius, 0, Math.PI / 2, false);
  s.lineTo(0, depth); s.lineTo(0, 0);
  return s;
}
// Plan outline [[x, z], ...] in world feet, extruded from y0 up to y1 (probe-lit).
function planSolid(b, pts, mat, y0, y1) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))), { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  b.prim(g, mat, 0, y1, 0);
}
// Points on a plan arc round (cx, cz), angle a0 → a1 (0 = +x, π/2 = +z).
const arcPts = (cx, cz, r, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + (a1 - a0) * i / n;
  return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
});
function kitchen(b) {
  const F = L.MAIN, C = L.MAIN_CEIL, CAB = 'cabinet', TOP = 'counter', KICK = 'paint:#3a3632', SOF = CAB;   // soffit + bulkhead: same finish as the cabinets
  const baseH = 2.95, topT = 0.125, depth = 2.05, kick = 0.35, cTop = F + baseH;
  const W = 26.6 + 0.2;               // west wall face
  const N = 0.25;                     // north wall face
  // corner piece from the wall corner out to (x1, z1), with a concave quarter-round of radius r there
  const cove = (x1, z1, r) => [[W, N], [x1, N], ...arcPts(x1, z1, r, -Math.PI / 2, -Math.PI), [W, z1]];
  // curved door: a 0.06 shell just in front of a cove of radius r, pull near its north edge
  const curvedDoor = (cx, cz, r, y0, y1, py) => {
    const g = 0.02 / r, a0 = -Math.PI / 2 - g, a1 = -Math.PI + g, rf = r - 0.06, a = a0 - 0.15 / r;
    planSolid(b, [...arcPts(cx, cz, r - 0.003, a0, a1), ...arcPts(cx, cz, rf, a1, a0)], CAB, y0, y1);
    loopPull(b, [cx + rf * Math.cos(a), py, cz + rf * Math.sin(a)], [0, 1, 0], [-Math.cos(a), 0, -Math.sin(a)]);
  };
  const baseWest = (z0, z1, doors) => {
    b.box(W, W + depth - 0.1, F + kick, cTop - topT, z0, z1, CAB, { skip: ['ny', 'nx'], collide: true });
    b.box(W, W + depth - 0.2, F, F + kick, z0, z1, KICK, { skip: ['ny', 'nx', 'py'] });
    cabinetFronts(b, 'x+', W + depth - 0.1, z0, z1, F + kick, cTop - topT, doors, true);
  };
  const baseNorth = (x0, x1, doors, sink) => {        // sink: no top face (the counter covers the rest; the basin shows)
    b.box(x0, x1, F + kick, cTop - topT, N, N + depth - 0.1, CAB, { skip: ['ny', 'nz', ...(sink ? ['py'] : [])], collide: true });
    b.box(x0, x1, F, F + kick, N, N + depth - 0.2, KICK, { skip: ['ny', 'nz', 'py'] });
    cabinetFronts(b, 'z+', N + depth - 0.1, x0, x1, F + kick, cTop - topT, doors, true);
  };
  // north-west corner: a curved base cabinet; its kick and top follow concentric arcs
  const bx = 29.3, bz = 2.75;
  planSolid(b, cove(bx, bz, 0.65), KICK, F, F + kick);
  planSolid(b, cove(bx, bz, 0.55), CAB, F + kick, cTop - topT);
  planSolid(b, cove(bx, bz, 0.37), TOP, cTop - topT, cTop);
  curvedDoor(bx, bz, 0.55, F + kick + 0.02, cTop - topT - 0.02, cTop - topT - 0.35);
  b.collider(W, bx, F, cTop, N, bz);
  // west run: narrow base, range, base under a black top, the fridge enclosure's side panel, fridge
  baseWest(bz, 3.4, 1);
  range(b, W, 3.4, 5.9);
  baseWest(5.9, 6.72, 1);
  b.box(W, W + 2.4, F, C, 6.72, 6.78, CAB, { skip: ['nx', 'py'], collide: true });
  fridge(b, W, 6.8, 9.65, F);
  // north run: base with a drawer, sink base under the window, dishwasher, rounded end cabinet at the stair
  baseNorth(bx, 30.3, 1);
  baseNorth(30.3, 32.6, 2, true);
  dishwasher(b, 32.6, 34.5, N, F);
  const xEnd = 34.5;
  // countertops (west strip, black top between range and fridge, north run with sink cut-out)
  const z1 = N + depth + 0.08, xf = W + depth + 0.08;
  b.box(W, xf, cTop - topT, cTop, bz, 3.4, TOP, { skip: ['nx', 'nz', 'pz'], dens: 7 });
  b.box(W, xf, cTop - topT, cTop, 5.9, 6.72, 'counterBlack', { skip: ['nx'], dens: 7 });
  const sx0 = 30.55, sx1 = 32.35, sz0 = N + 0.6, sz1 = N + 1.95;          // basin forward, clear of the window trim
  const topPiece = (x0, x1, za, zb, skip) => b.box(x0, x1, cTop - topT, cTop, za, zb, TOP, { skip, dens: 7 });
  topPiece(bx, sx0, N, z1, ['nz', 'nx', 'px']);
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
  b.box(xEnd, 34.85, F, F + kick, N, N + depth - 0.2, KICK, { skip: ['ny', 'nz', 'py'] });
  b.collider(xEnd, 35.0, F, cTop, N, z1);
  // sink basin + faucet
  sinkInner(b, sx0, sx1, sz0, sz1, cTop - 0.75, cTop - topT);
  faucet(b, (sx0 + sx1) / 2, cTop, N + 0.42, 's');
  // backsplash (black over the black top)
  b.box(W, 35.0, cTop, cTop + 0.3, N, N + 0.05, TOP, { skip: ['nz', 'ny'], dens: 6 });
  b.box(W, W + 0.05, cTop, cTop + 0.3, N + 0.05, 3.4, TOP, { skip: ['nx', 'ny'], dens: 6 });
  b.box(W, W + 0.05, cTop, cTop + 0.3, 5.9, 6.72, 'counterBlack', { skip: ['nx', 'ny'], dens: 6 });
  // uppers: up to a soffit that fills the last few inches flush to the ceiling; curved corner, bulkhead
  // over the window, rounded end at the stair
  const uy0 = F + 4.5, uy1 = F + 7.75, ud = 1.1;
  const upperN = (x0, x1, doors) => { b.box(x0, x1, uy0, uy1, N, N + ud, CAB, { skip: ['nz', 'py'] }); cabinetFronts(b, 'z+', N + ud, x0, x1, uy0 + 0.02, uy1 - 0.02, doors, false); };
  const upperW = (z0, z1b, doors, y0 = uy0) => { b.box(W, W + ud, y0, uy1, z0, z1b, CAB, { skip: ['nx', 'py'] }); cabinetFronts(b, 'x+', W + ud, z0, z1b, y0 + 0.02, uy1 - 0.02, doors, false); };
  const ux = 28.5, uz = 1.95;
  planSolid(b, cove(ux, uz, 0.6), CAB, uy0, uy1);
  planSolid(b, cove(ux, uz, 0.6), SOF, uy1, C);
  curvedDoor(ux, uz, 0.6, uy0 + 0.04, uy1 - 0.04, uy0 + 0.35);
  upperW(uz, 3.4, 2);
  upperW(3.4, 5.9, 2, F + 6.2);
  upperW(5.9, 6.72, 1);
  microwave(b, W, 3.45, 5.85, F + 4.6);
  b.box(W, W + ud, uy1, C, uz, 6.72, SOF, { skip: ['nx', 'py', 'ny', 'nz', 'pz'] });
  upperN(ux, 30.25, 2);
  b.box(ux, 30.25, uy1, C, N, N + ud, SOF, { skip: ['nz', 'py', 'ny', 'nx', 'px'] });
  b.box(30.25, 33.6, F + 6.95, C, N, N + ud, SOF, { skip: ['nz', 'py', 'px'] });          // bulkhead over the window
  for (const [mat, y0, y1] of [[CAB, uy0, uy1], [SOF, uy1, C]]) {                          // rounded east upper + soffit
    const g = new THREE.ExtrudeGeometry(roundedEnd(35.0 - 33.6, ud, 0.45), { depth: y1 - y0, bevelEnabled: false, curveSegments: 16 });
    g.rotateX(Math.PI / 2);
    b.prim(g, mat, 33.6, y1, N);
  }
  cabinetFronts(b, 'z+', N + ud, 33.6, 34.55, uy0 + 0.02, uy1 - 0.02, 2, false);
  // cabinet over the fridge (2.4 deep, two doors) and its soffit
  b.box(W, W + 2.4, F + 6.4, uy1, 6.78, 9.7, CAB, { skip: ['nx', 'ny', 'py'] });
  cabinetFronts(b, 'x+', W + 2.4, 6.78, 9.7, F + 6.42, uy1 - 0.02, 2, false);
  b.box(W, W + 2.4, uy1, C, 6.78, 9.7, SOF, { skip: ['nx', 'py', 'ny', 'nz'] });
}
function cabinetFronts(b, facing, face, a0, a1, y0, y1, doors, drawer) {
  const gap = 0.02, depth = 0.06;
  const fr = (s0, s1, t0, t1) => {
    if (facing === 'x+') b.box(face, face + depth, t0, t1, s0, s1, 'cabinet', { skip: ['nx'], dens: 7, bevel: 0.014 });
    else b.box(s0, s1, t0, t1, face, face + depth, 'cabinet', { skip: ['nz'], dens: 7, bevel: 0.014 });
  };
  const pull = (s, t, horiz) => {
    const out = facing === 'x+' ? [1, 0, 0] : [0, 0, 1];
    loopPull(b, facing === 'x+' ? [face + depth, t, s] : [s, t, face + depth], horiz ? [out[2], 0, out[0]] : [0, 1, 0], out);
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
// D-shaped loop pull: a round rod bent into a squared U standing 0.07 off the door; c = centre on the
// door face, along = its length, out = the door's outward normal.
function loopPull(b, c, along, out, len = 0.33) {
  const h = len / 2, d = 0.07;
  const P = (a, o) => new THREE.Vector3(c[0] + along[0] * a + out[0] * o, c[1] + along[1] * a + out[1] * o, c[2] + along[2] * a + out[2] * o);
  const path = new THREE.CatmullRomCurve3([P(-h, -0.005), P(-h, d * 0.6), P(-h + 0.035, d), P(h - 0.035, d), P(h, d * 0.6), P(h, -0.005)], false, 'centripetal');
  b.mesh(new THREE.TubeGeometry(path, 24, 0.0175, 6), 'pull');
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
    if (f.mirror && dx !== 0) {
      const mw = Math.min(3.2, along[1] - along[0] - 0.6);
      const y0 = F + h + 0.15, y1 = y0 + 2.8, xm = back + s * 0.13;
      b.box(Math.min(back, back + s * 0.12), Math.max(back, back + s * 0.12), y0 - 0.1, y1 + 0.2, ca - mw / 2 - 0.2, ca + mw / 2 + 0.2, 'paintedWood');
      mirrors.push({ pts: [[xm, y0, ca + s * mw / 2], [xm, y0, ca - s * mw / 2], [xm, y1, ca - s * mw / 2], [xm, y1, ca + s * mw / 2]], n: [s, 0, 0] });
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
    const H = 2.5, top = F + H;
    if (f.chair === 'dining') {
      // moulded top edge (stacked bevelled layers), 0.35 apron, double pedestal: turned vase columns on
      // four splayed S-curved carved feet
      b.box(x0, x1, top - 0.06, top, z0, z1, wood, { dens: 6, bevel: 0.025 });
      b.box(x0 + 0.03, x1 - 0.03, top - 0.1, top - 0.06, z0 + 0.03, z1 - 0.03, wood, { skip: ['py'], dens: 6, bevel: 0.02 });
      b.box(x0 + 0.015, x1 - 0.015, top - 0.14, top - 0.1, z0 + 0.015, z1 - 0.015, wood, { skip: ['py'], dens: 6, bevel: 0.02 });
      b.box(x0 + 0.25, x1 - 0.25, top - 0.49, top - 0.14, z0 + 0.25, z1 - 0.25, wood, { skip: ['py'] });
      const foot = new THREE.Shape();
      foot.moveTo(0.08, 0.5); foot.bezierCurveTo(0.35, 0.52, 0.42, 0.14, 0.78, 0.12); foot.quadraticCurveTo(0.93, 0.11, 0.92, 0.03);
      foot.lineTo(0.9, 0); foot.lineTo(0.72, 0); foot.bezierCurveTo(0.55, 0.02, 0.4, 0.3, 0.08, 0.3); foot.lineTo(0.08, 0.5);
      const pz = (z0 + z1) / 2;
      for (const px of [x0 + 1.1, x1 - 1.1]) {
        b.mesh(turned([px, F + 0.15, pz], [px, top - 0.49, pz], [[0.001, 0], [0.22, 0], [0.22, 0.14], [0.15, 0.19], [0.2, 0.3], [0.25, 0.42],
          [0.22, 0.55], [0.1, 0.7], [0.15, 0.74], [0.15, 0.77], [0.09, 0.82], [0.13, 0.9], [0.18, 0.93], [0.18, 1], [0.001, 1]], 20), wood);
        for (let k = 0; k < 4; k++) {
          const g = new THREE.ExtrudeGeometry(foot, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 });
          g.translate(0, 0.02, -0.06);
          b.prim(g, wood, px, F, pz, -(Math.PI / 4 + k * Math.PI / 2));
        }
      }
    } else {
      // breakfast table: top with breadboard ends (grain across), 0.3 apron inset 0.15, four turned legs
      const T = 0.12, be = 0.25, ab = top - T - 0.3;
      b.box(x0 + be, x1 - be, top - T, top, z0, z1, wood, { dens: 6, bevel: 0.03 });
      for (const [xa, xb] of [[x0, x0 + be], [x1 - be, x1]]) {
        b.box(xa, xb, top - T, top, z0, z1, wood, { dens: 6, bevel: 0.03, uvFaces: { py: [[z0, xa], [z1, xa], [z1, xb], [z0, xb]] } });
      }
      b.box(x0 + 0.15, x1 - 0.15, ab, top - T, z0 + 0.15, z1 - 0.15, wood, { skip: ['py'] });
      for (const lx of [x0 + 0.25, x1 - 0.25]) for (const lz of [z0 + 0.25, z1 - 0.25]) {
        b.mbox(lx - 0.1, lx + 0.1, ab - 0.25, ab, lz - 0.1, lz + 0.1, wood);         // square top block
        b.mesh(turned([lx, F, lz], [lx, ab - 0.25, lz], [[0.001, 0], [0.066, 0], [0.07, 0.02], [0.075, 0.3], [0.08, 0.45], [0.09, 0.5],
          [0.09, 0.53], [0.07, 0.56], [0.078, 0.62], [0.098, 0.74], [0.075, 0.86], [0.088, 0.9], [0.088, 0.93], [0.07, 0.955], [0.092, 0.98], [0.092, 1], [0.001, 1]]), wood);
      }
    }
    b.collider(x0, x1, F, F + H, z0, z1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const seats = [];
    if (f.chairs === 6) { seats.push([x0 - 0.8, cz, 'e'], [x1 + 0.8, cz, 'w']); for (const px of [cx - 1.4, cx + 1.4]) seats.push([px, z0 - 0.75, 's'], [px, z1 + 0.75, 'n']); }
    else seats.push([x0 - 0.75, cz, 'e'], [x1 + 0.75, cz, 'w'], [cx, z0 - 0.75, 's'], [cx, z1 + 0.75, 'n']);
    for (const [sx, sz, face] of seats) {
      const side = sx < x0 ? 'w' : sx > x1 ? 'e' : sz < z0 ? 'n' : 's';
      if (side !== f.against) chair(b, sx, sz, F, face, wood, f.chair);    // no chair on the side against a wall
    }
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
    b.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], 'rugLiving', { n: [0, 1, 0], uv: 'face' });
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
    // one curved ultrawide monitor in the corner, turned to face out along the diagonal
    const fx = Math.SQRT1_2, fz = -Math.SQRT1_2, mx = x0 + 1.5, mz = z1 - 1.5;
    curvedMonitor(b, mx, F + 2.5, mz, fx, fz);
    // chair on the diagonal facing the monitor, seat tucked under the inside corner of the L
    const chx = mx + fx * 2.4, chz = mz + fz * 2.4;
    rotated(b, chx, chz, -Math.PI / 4, sub => officeChair(sub, chx, chz, F, false));
    b.collider(chx - 0.85, chx + 0.85, F, F + 1.8, chz - 0.85, chz + 0.85);
  },
  endTable(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, wood = 'stain:' + f.wood, H = 2.05;
    b.box(x0, x1, F + H - 0.1, F + H, z0, z1, wood, { collide: true, bevel: 0.025 });
    b.box(x0 + 0.06, x1 - 0.06, F + H - 0.4, F + H - 0.1, z0 + 0.06, z1 - 0.06, wood, { skip: ['py'] });      // apron + drawer
    b.box(x0 + 0.1, x1 - 0.1, F + 0.4, F + 0.47, z0 + 0.1, z1 - 0.1, wood);                                  // lower shelf
    for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) b.mbox(px - 0.07, px + 0.07, F, F + H - 0.1, pz - 0.07, pz + 0.07, wood);
    if (f.lamp) tableLamp(b, (x0 + x1) / 2, F + H, (z0 + z1) / 2);
  },
  makeupDesk(b, f) {
    // child's white vanity against a wall (back at z0) with a round mirror and a little chair
    const [x0, x1, z0, z1] = f.r, F = f.base, w = 'paintedWood', H = 2.05, cx = (x0 + x1) / 2;
    b.box(x0, x1, F + H - 0.08, F + H, z0, z1, w, { collide: true, bevel: 0.02 });
    b.box(x0 + 0.05, x1 - 0.05, F + H - 0.34, F + H - 0.08, z0 + 0.05, z1 - 0.05, w, { skip: ['py'] });
    b.mbox(cx - 0.45, cx + 0.45, F + H - 0.3, F + H - 0.12, z1 - 0.06, z1 - 0.03, w);
    b.prim(new THREE.SphereGeometry(0.035, 10, 8), 'nickel', cx, F + H - 0.21, z1 - 0.01);
    for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) b.prim(new THREE.CylinderGeometry(0.055, 0.04, H - 0.08, 12), w, px, F + (H - 0.08) / 2, pz);
    const my = F + H + 0.85, mz = z0 + 0.22;
    for (const sx of [-1, 1]) b.mbox(cx + sx * 0.66 - 0.04, cx + sx * 0.66 + 0.04, F + H, my + 0.1, mz - 0.04, mz + 0.04, w);
    b.prim(new THREE.TorusGeometry(0.58, 0.07, 10, 48), w, cx, my, mz);
    b.prim(new THREE.CircleGeometry(0.55, 48), 'chrome', cx, my, mz + 0.005, 0, { bake: false });
    // little chair
    const sz = z1 + 0.75;
    b.box(cx - 0.42, cx + 0.42, F + 1.15, F + 1.25, sz - 0.4, sz + 0.4, w, { collide: true, bevel: 0.02 });
    b.box(cx - 0.42, cx + 0.42, F + 1.25, F + 2.3, sz + 0.34, sz + 0.42, w, { bevel: 0.02 });
    for (const [px, pz] of [[cx - 0.36, sz - 0.34], [cx + 0.36, sz - 0.34], [cx - 0.36, sz + 0.36], [cx + 0.36, sz + 0.36]]) b.mbox(px - 0.035, px + 0.035, F, F + 1.15, pz - 0.035, pz + 0.035, w);
  },
  changingTable(b, f) {
    // white changing table with a guard rail and two open shelves, back against a west wall (x0)
    const [x0, x1, z0, z1] = f.r, F = f.base, w = 'paintedWood', H = 2.9;
    for (const [px, pz] of [[x0 + 0.07, z0 + 0.07], [x1 - 0.07, z0 + 0.07], [x0 + 0.07, z1 - 0.07], [x1 - 0.07, z1 - 0.07]]) b.box(px - 0.07, px + 0.07, F, F + H + 0.38, pz - 0.07, pz + 0.07, w, { skip: ['ny'], bevel: 0.015 });
    for (const y of [0.35, 1.5]) b.box(x0 + 0.05, x1 - 0.05, F + y, F + y + 0.07, z0 + 0.05, z1 - 0.05, w);
    b.box(x0, x1, F + H - 0.1, F + H, z0, z1, w, { bevel: 0.015 });
    b.box(x0, x0 + 0.07, F + H, F + H + 0.33, z0, z1, w);
    b.box(x0, x1, F + H, F + H + 0.33, z0, z0 + 0.07, w); b.box(x0, x1, F + H, F + H + 0.33, z1 - 0.07, z1, w);
    b.box(x0 + 0.12, x1 - 0.1, F + H, F + H + 0.2, z0 + 0.12, z1 - 0.12, 'fabric:#e6e2d9', { bevel: 0.07 });
    b.box(x0 + 0.2, x1 - 0.25, F + 1.57, F + 1.85, z0 + 0.25, z0 + 1.1, 'fabric:#c5d0da', { bevel: 0.04 });
    b.box(x0 + 0.2, x1 - 0.25, F + 0.42, F + 0.75, z1 - 1.15, z1 - 0.3, 'fabric:#dfe3e6', { bevel: 0.05 });
    b.collider(x0, x1, F, F + H, z0, z1);
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
    // L-shaped: long run with its back on the east wall, return along the south end facing north;
    // f.chaise: a chaise lounge that deep (from the wall) at the other (north) end
    const [x0, x1, z0, z1] = f.r, F = f.base, fab = 'fabric:' + f.fabric;
    const D = 3.0, CW = f.chaise ? 2.8 : 0;
    if (f.chaise) {
      b.box(x1 - f.chaise, x1 - D, F + 0.3, F + 1.45, z0, z0 + CW, fab, { skip: ['ny'], collide: true, bevel: 0.1 });
      b.box(x1 - f.chaise + 0.05, x1 - 0.82, F + 1.45, F + 1.95, z0 + 0.05, z0 + CW - 0.05, fab, { skip: ['ny'], dens: 5, bevel: 0.14 });
    }
    b.box(x1 - D, x1, F + 0.3, F + 1.45, z0, z1, fab, { skip: ['ny'], collide: true, bevel: 0.1 });
    b.box(x0, x1 - D, F + 0.3, F + 1.45, z1 - D, z1, fab, { skip: ['ny'], collide: true, bevel: 0.1 });
    b.box(x1 - 0.8, x1, F + 1.45, F + 2.85, z0, z1, fab, { skip: ['ny'], bevel: 0.14 });
    b.box(x0, x1 - 0.8, F + 1.45, F + 2.85, z1 - 0.8, z1, fab, { skip: ['ny'], bevel: 0.14 });
    if (!f.chaise) b.box(x1 - D, x1 - 0.8, F + 1.45, F + 2.2, z0, z0 + 0.6, fab, { skip: ['ny'], bevel: 0.14 });
    b.box(x0, x0 + 0.6, F + 1.45, F + 2.2, z1 - D, z1 - 0.8, fab, { skip: ['ny'], bevel: 0.14 });
    // big cushions: three along the long side, one in the corner, two on the return (backs match the seats)
    const seat = (a0, a1, c0, c1) => b.box(a0, a1, F + 1.45, F + 1.95, c0, c1, fab, { skip: ['ny'], dens: 5, bevel: 0.14 });
    const zA = z0 + (f.chaise ? CW : 0.65), zC = z1 - D, g = 0.03;
    const long = [0, 1, 2].map(i => [zA + (zC - zA) * i / 3 + g, zA + (zC - zA) * (i + 1) / 3 - g]);
    for (const [c0, c1] of long) seat(x1 - D + 0.05, x1 - 0.82, c0, c1);
    seat(x1 - D + 0.05, x1 - 0.82, zC + g, z1 - 0.82);                                          // corner
    const xA = x0 + 0.65, xC = x1 - D;
    const ret = [0, 1].map(i => [xA + (xC - xA) * i / 2 + g, xA + (xC - xA) * (i + 1) / 2 - g]);
    for (const [c0, c1] of ret) b.box(c0, c1, F + 1.45, F + 1.95, z1 - D + 0.05, z1 - 0.82, fab, { skip: ['ny'], dens: 5, bevel: 0.14 });
    const back = (a0, a1, c0, c1) => b.box(a0, a1, F + 1.9, F + 3.05, c0, c1, fab, { skip: ['ny'], dens: 5, bevel: 0.2 });
    if (f.chaise) back(x1 - 1.3, x1 - 0.75, z0 + g, z0 + CW - g);
    for (const [c0, c1] of long) back(x1 - 1.3, x1 - 0.75, c0, c1);
    back(x1 - 1.3, x1 - 0.75, zC + g, z1 - 0.82);
    for (const [c0, c1] of ret) back(c0, c1, z1 - 1.3, z1 - 0.75);
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
      if (f.tv === 'msRachel') b.prim(new THREE.PlaneGeometry(5.44, 2.99), 'tvRachel', xf, F + 4.775, cz, s * Math.PI / 2, { bake: false });   // TV on
      else b.poly([[xf, F + 3.28, cz - 2.72], [xf, F + 3.28, cz + 2.72], [xf, F + 6.27, cz + 2.72], [xf, F + 6.27, cz - 2.72]], 'blackGlass', { n: [s, 0, 0] });
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
  // Garage workshop corner (r = the L's extent): a plywood-topped bench on a 2x4 frame along the north wall
  // with a return along the west wall, a white pegboard behind it with a narrow shelf and hanging tools, two
  // wall shelves on standards above, an overhead platform shelf on chains, an office chair; a boxed soffit
  // across the ceiling and a round duct along the west wall that turns down.
  workshop(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, D = 2.3, H = 2.9, C = L.LOW_CEIL, WZ = 0.25, WX = 0.25;
    const PLY = 'stain:#c6a574', LUM = 'stain:#d5b27d', WHITE = 'paint:#f2f1ec';
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const STUFF = ['paint:#a57b4f', 'paint:#b38a5c', 'paint:#3c4a5a', 'paint:#d8d4c8', 'paint:#2b2b2b', 'paint:#8c6a45'];
    const boxesOn = (xa, xb, za, zb, y, maxH) => {                     // generic boxes and bins along a shelf
      for (let x = xa + 0.1; x < xb - 0.5;) {
        const w = Math.min(0.55 + rnd() * 0.9, xb - 0.05 - x), d = Math.min(zb - za - 0.1, 0.6 + rnd() * 0.6), h = Math.min(maxH, 0.35 + rnd() * 0.45);
        b.mbox(x, x + w, y, y + h, za + 0.05, za + 0.05 + d, STUFF[(rnd() * STUFF.length) | 0]);
        x += w + 0.08 + rnd() * 0.35;
      }
    };
    // bench: long run (x0..x1 along the north wall) and return (along the west wall)
    const runs = [[x0, x1, z0, z0 + D], [x0, x0 + D, z0 + D, z1]];
    for (const [bx0, bx1, bz0, bz1] of runs) {
      b.box(bx0, bx1, F + H - 0.06, F + H, bz0, bz1, PLY, { collide: true, dens: 5 });
      b.box(bx0 + 0.05, bx1 - 0.05, F + 0.5, F + 0.55, bz0 + 0.05, bz1 - 0.05, PLY, { dens: 4 });       // lower shelf
    }
    b.box(x0 + D, x1, F + H - 0.35, F + H - 0.06, z0 + D - 0.13, z0 + D, LUM, { skip: ['py'], dens: 5 });   // front rails
    b.box(x0 + D - 0.13, x0 + D, F + H - 0.35, F + H - 0.06, z0 + D, z1, LUM, { skip: ['py'], dens: 5 });
    const legs = [[x1 - 0.2, z0 + D - 0.3], [x0 + D + 3.4, z0 + D - 0.3], [x1 - 0.2, z0 + 0.05], [x0 + D + 3.4, z0 + 0.05],
      [x0 + D - 0.3, z1 - 0.2], [x0 + 0.05, z1 - 0.2], [x0 + D - 0.3, z0 + D - 0.3], [x0 + 0.05, z0 + 0.05]];
    for (const [lx, lz] of legs) b.mbox(lx, lx + 0.13, F, F + H - 0.06, lz, lz + 0.29, LUM);
    // pegboard 4 ft tall behind the whole bench, narrow shelf along its top, generic hanging tools
    const pb0 = F + 3.1, pb1 = pb0 + 4;
    b.box(WX + 0.04, x1, pb0, pb1, WZ, WZ + 0.04, 'pegboard', { skip: ['nz'], dens: 4 });
    b.box(WX, WX + 0.04, pb0, pb1, WZ, z1, 'pegboard', { skip: ['nx'], dens: 4 });
    b.box(WX + 0.04, x1, pb1, pb1 + 0.06, WZ, WZ + 0.45, WHITE, { skip: ['nz'], dens: 5 });
    b.box(WX, WX + 0.45, pb1, pb1 + 0.06, WZ + 0.45, z1, WHITE, { skip: ['nx'], dens: 5 });
    for (let i = 0; i < 11; i++) {
      const tx = x0 + 0.7 + i * 0.85, ty = pb0 + 1.2 + (i % 3) * 0.7, zf = WZ + 0.04;
      if (i % 3 === 0) { b.mbox(tx - 0.03, tx + 0.03, ty - 0.45, ty + 0.1, zf, zf + 0.06, 'tvBody'); b.mbox(tx - 0.14, tx + 0.14, ty + 0.1, ty + 0.2, zf, zf + 0.08, 'tvBody'); }
      else if (i % 3 === 1) { b.mbox(tx - 0.16, tx + 0.16, ty - 0.2, ty + 0.1, zf, zf + 0.22, 'paint:#d9a92a'); b.mbox(tx - 0.05, tx + 0.05, ty - 0.55, ty - 0.2, zf, zf + 0.12, 'tvBody'); }
      else b.mbox(tx - 0.025, tx + 0.025, ty - 0.5, ty + 0.3, zf, zf + 0.03, 'tvBody');
    }
    // two wall shelves on white standards and brackets above the pegboard, with boxes and bins
    for (const sx of [x0 + 0.6, x0 + 3.6, x0 + 6.6, x1 - 0.5]) {
      b.mbox(sx - 0.03, sx + 0.03, pb1 + 0.2, C - 0.15, WZ, WZ + 0.04, 'plate');
      for (const y of [7.9, 8.75]) b.mbox(sx - 0.015, sx + 0.015, F + y - 0.3, F + y, WZ + 0.04, WZ + 0.9, 'plate');
    }
    for (const [y, mh] of [[7.9, 0.7], [8.75, 0.6]]) {
      b.box(x0 + 0.1, x1 - 0.1, F + y, F + y + 0.06, WZ, WZ + 1.0, WHITE, { skip: ['nz'], dens: 5 });
      boxesOn(x0 + 0.1, x1 - 0.1, WZ, WZ + 1.0, F + y + 0.06, mh);
    }
    // overhead platform shelf: 2x4 frame, OSB deck about 2 ft below the ceiling, hung on chains, boxes on it
    const px0 = x0 + 0.7, px1 = x1, pz0 = WZ + 1.2, pz1 = pz0 + 2.4, dy = C - 2;
    b.box(px0, px1, dy, dy + 0.06, pz0, pz1, 'paint:#b48f5a', { dens: 4 });
    for (const zz of [pz0, pz1 - 0.13]) b.box(px0, px1, dy - 0.29, dy, zz, zz + 0.13, LUM, { skip: ['py'], dens: 4 });
    for (let xx = px0; xx < px1; xx += 2) b.mbox(xx, xx + 0.13, dy - 0.29, dy, pz0 + 0.13, pz1 - 0.13, LUM);
    for (const xx of [px0 + 0.2, (px0 + px1) / 2, px1 - 0.2]) for (const zz of [pz0 + 0.07, pz1 - 0.07]) {
      b.prim(new THREE.CylinderGeometry(0.018, 0.018, C - dy - 0.06, 6), 'galvanized', xx, (C + dy + 0.06) / 2, zz);
    }
    boxesOn(px0, px1, pz0, pz1, dy + 0.06, 1.0);
    officeChair(b, x0 + 5.3, z0 + D + 1.1, F);
    // boxed soffit across the ceiling; a 6" round duct along the west wall under the ceiling, turning down
    b.box(WX, 18.1, C - 0.8, C, 8.4, 9.6, 'paint:' + L.PAINT.garage, { skip: ['py', 'nx', 'px'] });
    const dx = WX + 0.36, dyc = C - 0.35, zt = z0 + 1.3;
    const duct = new THREE.CurvePath();
    duct.add(new THREE.LineCurve3(V3(dx, dyc, 8.4), V3(dx, dyc, zt + 0.5)));
    duct.add(new THREE.QuadraticBezierCurve3(V3(dx, dyc, zt + 0.5), V3(dx, dyc, zt), V3(dx, dyc - 0.5, zt)));
    duct.add(new THREE.LineCurve3(V3(dx, dyc - 0.5, zt), V3(dx, pb1 + 0.3, zt)));
    b.mesh(new THREE.TubeGeometry(duct, 40, 0.25, 16), 'galvanized');
    b.prim(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 16), 'galvanized', dx, pb1 + 0.3, zt);
    for (const zz of [7.4, 5.4, 3.4]) b.mbox(WX, dx, dyc + 0.2, dyc + 0.26, zz - 0.04, zz + 0.04, 'galvanized');   // straps
  },
  // grey steel two-door storage cabinet, doors facing west (x0)
  steelCabinet(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, H = f.h, zm = (z0 + z1) / 2;
    b.box(x0, x1, F, F + H, z0, z1, 'paint:#8f9398', { skip: ['px', 'ny'], collide: true, bevel: 0.02 });
    b.mbox(x0 - 0.005, x0 + 0.002, F + 0.15, F + H - 0.15, zm - 0.008, zm + 0.008, 'paint:#2b2d30');
    for (const dz of [-0.12, 0.12]) b.mbox(x0 - 0.06, x0, F + 3.1, F + 3.7, zm + dz - 0.015, zm + dz + 0.015, 'nickel');
    for (const zc of [(z0 + zm) / 2, (zm + z1) / 2]) for (const y of [F + 0.5, F + 0.6, F + 0.7, F + H - 0.7, F + H - 0.6, F + H - 0.5]) {
      b.mbox(x0 - 0.004, x0 + 0.002, y - 0.012, y + 0.012, zc - 0.35, zc + 0.35, 'paint:#3c3f43');   // louvres
    }
  },
  // plank shelf on white brackets against the wall on the x1 side, board top at base + y
  plankShelf(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base, y = F + f.y;
    b.box(x0, x1, y, y + 0.08, z0, z1, 'stain:#b58e5c', { skip: ['px'], dens: 5 });
    for (let z = z0 + 0.4; z < z1; z += 2.4) {
      b.mbox(x1 - 0.04, x1, y - 0.8, y, z - 0.02, z + 0.02, 'plate');
      b.mbox(x0 + 0.1, x1, y - 0.06, y, z - 0.02, z + 0.02, 'plate');
    }
    for (const [za, w, h, m] of [[z0 + 0.3, 1.1, 0.6, 'paint:#a57b4f'], [z0 + 1.6, 0.8, 0.45, 'paint:#3c4a5a'], [z0 + 3.2, 1.2, 0.7, 'paint:#b38a5c']]) b.mbox(x0 + 0.1, x1 - 0.1, y + 0.08, y + 0.08 + h, za, za + w, m);
  },
  doorMat(b, f) {
    const [x0, x1, z0, z1] = f.r, F = f.base;
    b.box(x0, x1, F, F + 0.03, z0, z1, 'fabric:#3b3733', { skip: ['ny'], dens: 4 });
  },
  fridge(b, f) {
    if (f.face === 'w') {
      // built facing south in a frame turned so the front faces west (back to the wall on the east)
      const [x0, x1, z0, z1] = f.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
      return rotated(b, cx, cz, -Math.PI / 2, sub => FURN.fridge(sub, { ...f, face: 's', r: [cx - hz, cx + hz, cz - hx, cz + hx] }));
    }
    const [x0, x1, z0, z1] = f.r, F = f.base;
    b.box(x0, x1, F, F + 5.6, z0, z1, 'enamelWhite', { skip: ['ny'], collide: true });
    b.box(x0 + 0.02, x1 - 0.02, F + 3.9, F + 3.93, z1, z1 + 0.01, 'paint:#bdbbb6');
    beam(b, [x1 - 0.25, F + 4.1, z1 + 0.1], [x1 - 0.25, F + 5.0, z1 + 0.1], 0.06, 0, 'enamelWhite', { round: true });
    beam(b, [x1 - 0.25, F + 2.2, z1 + 0.1], [x1 - 0.25, F + 3.6, z1 + 0.1], 0.06, 0, 'enamelWhite', { round: true });
  },
};

// ============================================================== wall art ===
// Framed prints (L.ART): a frame of four mouldings, an optional white mat and the picture, drawn
// procedurally by the 'art:<style>' material. A frameless decal just sits on the wall.
function wallArt(b) {
  const FR = { black: 'paint:#1d1c1b', white: 'paintedWood', silver: 'paint:#c3c2bd', wood: 'stain:#b58a5a' };
  for (const p of L.ART) {
    const alongX = p.wall === 'x', off = t => p.c + p.dir * t;
    const ry = alongX ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const at = t => (alongX ? [p.a, p.y, off(t)] : [off(t), p.y, p.a]);
    const box = (a0, a1, y0, y1, t0, t1, mat) => {
      const [o0, o1] = [off(t0), off(t1)].sort((m, n) => m - n);
      if (alongX) b.mbox(p.a + a0, p.a + a1, p.y + y0, p.y + y1, o0, o1, mat);
      else b.mbox(o0, o1, p.y + y0, p.y + y1, p.a + a0, p.a + a1, mat);
    };
    const hw = p.w / 2, hh = p.h / 2;
    if (p.frame === 'none') { b.prim(new THREE.PlaneGeometry(p.w, p.h), 'art:' + p.style, ...at(0.01), ry); continue; }
    const fw = p.w > 2.5 ? 0.16 : 0.1, D = 0.1, fm = FR[p.frame];
    box(-hw, hw, hh - fw, hh, 0, D, fm); box(-hw, hw, -hh, -hh + fw, 0, D, fm);
    box(-hw, -hw + fw, -hh + fw, hh - fw, 0, D, fm); box(hw - fw, hw, -hh + fw, hh - fw, 0, D, fm);
    let iw = p.w - 2 * fw, ih = p.h - 2 * fw;
    if (p.mat) {
      b.prim(new THREE.PlaneGeometry(iw, ih), 'paint:#f4f2ec', ...at(D - 0.03), ry);
      const m = Math.min(iw, ih) * 0.14;
      iw -= 2 * m; ih -= 2 * m;
    }
    b.prim(new THREE.PlaneGeometry(iw, ih), 'art:' + p.style, ...at(D - 0.025), ry);
  }
}

// table lamp: turned ceramic base, brass stem and a drum shade
function tableLamp(b, x, y, z) {
  const V = (r, h) => new THREE.Vector2(r, h);
  b.prim(new THREE.LatheGeometry([V(0.001, 0), V(0.28, 0), V(0.28, 0.06), V(0.2, 0.13), V(0.3, 0.5), V(0.33, 0.78), V(0.24, 1.05), V(0.1, 1.16), V(0.06, 1.22), V(0.001, 1.22)], 28), 'ceramic', x, y, z);
  b.prim(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), 'brass', x, y + 1.5, z);
  b.prim(new THREE.CylinderGeometry(0.42, 0.62, 0.78, 32, 1, true), 'shade', x, y + 1.98, z, 0, { bake: false });
  b.prim(new THREE.SphereGeometry(0.05, 10, 8), 'brass', x, y + 2.4, z);
}

// 48"-wide curved super-ultrawide (1800R) on a centre stand; (fx, fz) = direction the screen faces
function curvedMonitor(b, cx, y, cz, fx, fz) {
  const R = 5.9, W = 4.0, H = 1.2, N = 20, rx = fz, rz = -fx;
  const Cx = cx + fx * R, Cz = cz + fz * R, yc = y + 0.62 + H / 2;
  const arc = (width, inset, h, depth, mat) => {
    const th = width / R;
    for (let i = 0; i < N; i++) {
      const phi = ((i + 0.5) / N - 0.5) * th;
      const nx = fx * Math.cos(phi) + rx * Math.sin(phi), nz = fz * Math.cos(phi) + rz * Math.sin(phi);
      const px = Cx - nx * (R + inset), pz = Cz - nz * (R + inset);
      b.prim(new THREE.BoxGeometry(width / N * 1.04, h, depth), mat, px, yc, pz, Math.atan2(nx, nz));
    }
  };
  arc(W, 0.05, H, 0.09, 'tvBody');                 // shell
  arc(W - 0.05, -0.002, H - 0.06, 0.006, 'blackGlass');   // screen
  // stand: neck behind the screen and a low oval foot on the desk
  const bx = cx - fx * 0.3, bz = cz - fz * 0.3;
  b.prim(new THREE.BoxGeometry(0.14, 0.95, 0.07), 'tvBody', bx, y + 0.5, bz, Math.atan2(fx, fz), { rx: -0.12 });
  const foot = new THREE.CylinderGeometry(0.34, 0.36, 0.04, 28);
  foot.scale(1, 1, 0.62);
  b.prim(foot, 'tvBody', cx - fx * 0.2, y + 0.02, cz - fz * 0.2, Math.atan2(rx, rz));
}

function officeChair(b, x, z, F, collide = true) {
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
  if (collide) b.collider(x - 0.9, x + 0.9, F, F + 1.8, z - 0.9, z + 0.9);
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
// Lathe along the segment p0 → p1; profile [[r, t], ...], t = 0..1 from p0 to p1.
function turned(p0, p1, profile, seg = 14, phi = 0) {
  const a = new THREE.Vector3(...p0), d = new THREE.Vector3(...p1).sub(a), len = d.length();
  const g = new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r, t * len)), seg, phi);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
// Tube along a curve with its radius following rf(t), t = 0..1 along the curve.
function taperTube(curve, rf, segs = 24, radial = 8, closed = false) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, closed), pos = g.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rf(i / segs)).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
// piecewise-linear [[t, v], ...] → function of t
const ramp = pts => t => {
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
  return pts[pts.length - 1][1];
};
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// A flat board in a chair back: runs x0 → x1 between edge heights yb(x) and yt(x), `thick` deep, centred on
// z = zAt(x, y) (the back's rake and bend).
function backBoard(x0, x1, yb, yt, thick, zAt, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; pts.push(new THREE.Vector2(x, yb(x))); }
  for (let i = n; i >= 0; i--) { const x = x0 + (x1 - x0) * i / n; pts.push(new THREE.Vector2(x, yt(x))); }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: thick, bevelEnabled: false });
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - thick / 2 + zAt(pos.getX(i), pos.getY(i)));
  g.computeVertexNormals();
  return g;
}

// Chairs are built in a local frame (+z toward the table, y up from the floor) and turned into place.
function chair(b, x, z, F, face, wood, style) {
  const [dx, dz] = faceDir(face);
  const put = (g, mat = wood) => b.prim(g, mat, x, F, z, Math.atan2(dx, dz));
  const s = style === 'dining' ? diningChair(put) : wheatChair(put);
  b.collider(x - s, x + s, F, F + 1.7, z - s, z + s);
}

// Wheat-back (sheaf-back) Windsor: dished saddle seat, splayed turned legs with an H-stretcher and a front
// stretcher, turned back posts with acorn finials, a bent crest rail and a lower back rail joined by a fan
// of spindles gathered into a sheaf half way up.
function wheatChair(put) {
  const seat = new THREE.BoxGeometry(1.35, 0.12, 1.3, 14, 1, 14), sp = seat.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let u = sp.getX(i) / 0.675, v = sp.getZ(i) / 0.65;
    const m = Math.max(Math.abs(u), Math.abs(v));
    if (m > 1e-6) { const k = m / Math.pow(u ** 4 + v ** 4, 0.25); u *= k; v *= k; }      // rounded (superellipse) plan
    const dish = sp.getY(i) > 0 ? 0.035 * Math.max(0, 1 - u * u - (v + 0.1) ** 2) : 0;
    sp.setXYZ(i, u * 0.675, sp.getY(i) + 1.44 - dish, v * 0.65);
  }
  seat.computeVertexNormals();
  put(seat);
  // legs splayed about 5 degrees, turned with a vase and rings
  const legs = [[-0.45, 0.38], [0.45, 0.38], [-0.45, -0.36], [0.45, -0.36]].map(([lx, lz]) => ({
    top: [lx, 1.39, lz], foot: [lx + Math.sign(lx) * 0.12, 0, lz + Math.sign(lz) * 0.1] }));
  const legAt = (l, y) => l.foot.map((c, i) => c + (l.top[i] - c) * y / 1.39);
  for (const l of legs) put(turned(l.foot, l.top, [[0.001, 0], [0.042, 0], [0.045, 0.06], [0.055, 0.35], [0.062, 0.4], [0.045, 0.43],
    [0.058, 0.5], [0.07, 0.7], [0.06, 0.9], [0.045, 0.97], [0.045, 1], [0.001, 1]], 12));
  const stretch = [[0.001, 0], [0.028, 0], [0.03, 0.1], [0.042, 0.5], [0.03, 0.9], [0.028, 1], [0.001, 1]];
  const sides = [[0, 2], [1, 3]].map(([f, k]) => [legAt(legs[f], 0.5), legAt(legs[k], 0.5)]);
  for (const [p, q] of sides) put(turned(p, q, stretch, 10));
  const mid = sides.map(([p, q]) => p.map((c, i) => (c + q[i]) / 2));
  put(turned(mid[0], mid[1], stretch, 10));                                              // H-stretcher
  put(turned(legAt(legs[0], 0.62), legAt(legs[1], 0.62), stretch, 10));                 // front stretcher
  // back: posts raked back; crest rail and lower rail bent back; spindles in a sheaf
  const zb = y => -0.5 - (y - 1.46) * 0.13, bow = x => 0.07 * (1 - (x / 0.5) ** 2), zAt = (x, y) => zb(y) - bow(x);
  for (const sx of [-1, 1]) {
    put(turned([sx * 0.5, 1.46, zb(1.46)], [sx * 0.52, 3.3, zb(3.3)], [[0.001, 0], [0.05, 0], [0.052, 0.05], [0.04, 0.15], [0.048, 0.45],
      [0.042, 0.6], [0.038, 0.95], [0.04, 1], [0.001, 1]], 12));
    const acorn = new THREE.SphereGeometry(0.05, 12, 8); acorn.scale(1, 1.35, 1);
    acorn.translate(sx * 0.52, 3.36, zb(3.36)); put(acorn);
  }
  const cb = x => 2.98 + 0.03 * (1 - (x / 0.47) ** 2);
  put(backBoard(-0.5, 0.5, cb, x => 3.21 + 0.06 * (1 - (x / 0.5) ** 2), 0.07, zAt));             // crest
  put(backBoard(-0.5, 0.5, () => 2.0, () => 2.1, 0.06, zAt));                                    // lower rail
  for (let i = 0; i < 9; i++) {
    const u = (i - 4) / 4, pt = (x, y) => V3(x, y, zAt(x, y));
    const path = new THREE.CatmullRomCurve3([pt(u * 0.4, cb(u * 0.4) + 0.02), pt(u * 0.2, 2.65), pt(u * 0.05, 2.35), pt(u * 0.3, 2.08)], false, 'centripetal');
    put(new THREE.TubeGeometry(path, 16, 0.016, 5));
  }
  const band = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 16); band.scale(1, 1, 0.45); band.translate(0, 2.35, zAt(0, 2.35)); put(band);   // sheaf
  return 0.7;
}

// Dining chair: cabriole front legs with carved knees, straight rear legs splayed back, a serpentine
// upholstered seat in brocade, an open back with an interlaced figure-8 splat and small volutes, and an
// arched crest rail with scrolled ends and a carved shell at its centre.
function diningChair(put) {
  const zf = u => 0.78 + 0.05 * Math.cos(1.5 * Math.PI * u);                     // serpentine front edge
  const outline = (inset, back) => {
    const pts = [[0.8 - inset, back], [-0.8 + inset, back]];
    for (let i = 0; i <= 16; i++) { const u = -1 + 2 * i / 16; pts.push([u * (0.88 - inset), zf(u) - inset]); }
    return new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, pz)));
  };
  const flat = (shape, y0, y1, o = {}) => {
    const bt = o.bevelThickness || 0;
    const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0 - 2 * bt, bevelEnabled: !!bt, curveSegments: 12, ...o });
    g.rotateX(Math.PI / 2); g.translate(0, y1 - bt, 0);
    return g;
  };
  put(flat(outline(0, -0.78), 1.28, 1.42));                                                  // seat rails
  put(flat(outline(0.06, -0.64), 1.42, 1.6, { bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }), 'brocade');
  put(new THREE.BoxGeometry(0.5, 0.2, 0.14).translate(0, 1.52, -0.72));                     // shoe under the splat
  // cabriole front legs: knee forward, ankle back, pad foot; a small carving on each knee
  for (const sx of [-1, 1]) {
    const lx = sx * 0.74, P = (y, dz) => V3(lx, y, 0.62 + dz);
    put(taperTube(new THREE.CatmullRomCurve3([P(1.3, 0), P(1.06, 0.08), P(0.72, 0), P(0.3, -0.06), P(0.1, -0.01), P(0.02, 0.05)]),
      ramp([[0, 0.07], [0.12, 0.085], [0.45, 0.055], [0.8, 0.035], [1, 0.045]]), 24, 10));
    const knee = new THREE.SphereGeometry(0.06, 10, 8); knee.scale(0.9, 1.3, 0.45); knee.translate(lx, 1.08, 0.75); put(knee);
    const pad = new THREE.SphereGeometry(0.07, 12, 8); pad.scale(1, 0.45, 1.1); pad.translate(lx, 0.03, 0.68); put(pad);
  }
  // rear legs splayed back, and the stiles above the seat raked back
  const zb = y => -0.72 - (y - 1.4) * 0.107, lean = (x, y) => zb(y);
  for (const sx of [-1, 1]) {
    put(turned([sx * 0.74, 0, -0.95], [sx * 0.72, 1.4, zb(1.4)], [[0.001, 0], [0.042, 0], [0.058, 1], [0.001, 1]], 4, Math.PI / 4));
    put(turned([sx * 0.72, 1.4, zb(1.4)], [sx * 0.7, 3.5, zb(3.5)], [[0.001, 0], [0.058, 0], [0.045, 1], [0.001, 1]], 4, Math.PI / 4));
  }
  // crest: arched, ears flicking up into scrolls, a scalloped shell in the middle
  const cu = x => x / 0.74;
  put(backBoard(-0.74, 0.74, x => 3.3 + 0.06 * (1 - cu(x) ** 2), x => 3.48 + 0.1 * (1 - cu(x) ** 2) + 0.4 * Math.max(0, Math.abs(cu(x)) - 0.85), 0.08, lean, 24));
  for (const sx of [-1, 1]) {
    const ear = new THREE.TorusGeometry(0.05, 0.016, 6, 14, Math.PI * 1.6);
    ear.rotateZ(sx > 0 ? -0.6 : Math.PI + 0.6); ear.translate(sx * 0.73, 3.52, zb(3.52) + 0.04); put(ear);
  }
  const shell = new THREE.Shape();
  shell.moveTo(-0.175, 0);
  for (let i = 0; i <= 36; i++) { const a = Math.PI - Math.PI * i / 36, r = 0.175 * (1 - 0.07 * Math.abs(Math.sin(4.5 * (Math.PI - a)))); shell.lineTo(r * Math.cos(a), 0.9 * r * Math.sin(a)); }
  const sg = new THREE.ExtrudeGeometry(shell, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 });
  sg.translate(0, 3.4, zb(3.4) + 0.04); put(sg);
  // open back: two figure-8 ribbons crossing each other, a hair apart in depth, and volutes at the top
  for (const k of [-1, 1]) {
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const th = 2 * Math.PI * i / 28, y = 2.49 + 0.8 * Math.cos(th);
      pts.push(V3(k * 0.09 + 0.24 * Math.sin(th) * (1 - 0.7 * Math.sin(th) ** 2), y, zb(y) + k * 0.014));
    }
    const g = taperTube(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), () => 0.032, 72, 6, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const zc = zb(pos.getY(i)) + k * 0.014; pos.setZ(i, zc + (pos.getZ(i) - zc) * 0.45); }   // flat ribbon
    g.computeVertexNormals();
    put(g);
    const vol = new THREE.TorusGeometry(0.06, 0.015, 6, 14, Math.PI * 1.7);
    vol.rotateZ(k > 0 ? -1.2 : Math.PI + 1.2); vol.translate(k * 0.36, 3.2, zb(3.2)); put(vol);
  }
  return 0.9;
}
function appliance(b, f, front) {
  // the cabinet stands on four levelling feet (keeps its lower edges clear of the floor)
  const [x0, x1, z0, z1] = f.r, F = f.base + 0.06, H = 3.55 - 0.06;
  b.box(x0, x1, F, F + H, z0, z1, 'enamelWhite', { skip: ['pz'], collide: true, bevel: 0.05 });
  b.poly([[x0, F, z1], [x1, F, z1], [x1, F + H, z1], [x0, F + H, z1]], front, { n: [0, 0, 1], uv: 'face', dens: 8 });
  for (const [px, pz] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) b.mbox(px - 0.05, px + 0.05, f.base, F, pz - 0.05, pz + 0.05, 'tvBody');
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
  { x: [34.5, 46], z: [-9, 0], h: [L.annexCeil(-9) + 0.75, L.annexCeil(0) + 0.75] },   // lean-to over the rear stairs
];
const planeH = (p, z) => p.h[0] + (p.h[1] - p.h[0]) * (z - p.z[0]) / (p.z[1] - p.z[0]);
// underside of the lowest roof over a point (NaN if none)
export function roofUnder(x, z) {
  let h = Infinity;
  for (const p of ROOF_PLANES) if (x >= p.x[0] && x <= p.x[1] && z >= p.z[0] - 1e-6 && z <= p.z[1] + 1e-6) h = Math.min(h, planeH(p, z) - 0.12);
  return h === Infinity ? NaN : h;
}

function exterior(b) {
  const holes = L.SKYLIGHTS.map(sk => (sk.lean ? skylightShaft(sk).glass : sk.r)).map(([a0, a1, c0, c1]) => [a0 - 0.2, a1 + 0.2, c0 - 0.2, c1 + 0.2]);
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
        const ta = wallTop(w, xs[i]), tb = wallTop(w, xs[i + 1]);
        if (!(ha > ta + 0.01) || !(hb > tb + 0.01)) continue;
        b.poly([wp(alongX, c, xs[i], off, ta), wp(alongX, c, xs[i + 1], off, tb), wp(alongX, c, xs[i + 1], off, hb), wp(alongX, c, xs[i], off, ha)], 'siding', { n: wn(alongX, side), dens: 1.2 });
      }
    }
  }
  b.poly([[20.8, L.MAIN_CEIL, 30], [28.8, L.MAIN_CEIL, 30], [28.8, L.MAIN_CEIL, 35], [20.8, L.MAIN_CEIL, 35]], 'soffit', { n: [0, -1, 0], dens: 2 });
  // ground, driveway, walks, street
  b.poly([[-140, -0.03, -140], [190, -0.03, -140], [190, -0.03, 190], [-140, -0.03, 190]], 'grass', { n: [0, 1, 0], dens: 0.12 });
  b.poly([[0.2, -0.01, L.GARAGE_Z], [20.6, -0.01, L.GARAGE_Z], [20.6, -0.01, 75], [0.2, -0.01, 75]], 'concrete', { n: [0, 1, 0], dens: 0.6 });
  const walk0 = L.FLIGHTS.find(f => f.id === 'frontStoop').r[3];
  b.poly([[22.6, -0.01, walk0], [27, -0.01, walk0], [27, -0.01, 75], [22.6, -0.01, 75]], 'stone', { n: [0, 1, 0], dens: 0.8 });
  b.poly([[35.9, -0.01, -30], [39.1, -0.01, -30], [39.1, -0.01, -13.2], [35.9, -0.01, -13.2]], 'stone', { n: [0, 1, 0], dens: 0.8 });
  b.poly([[-140, -0.005, 75], [190, -0.005, 75], [190, -0.005, 100], [-140, -0.005, 100]], 'asphalt', { n: [0, 1, 0], dens: 0.1 });
}

// ================================================================== doors ===
// Leaf geometry in the door's local frame: hinge at origin, leaf along +x, thickness on z.
function buildDoor(s) {
  // sliding (bypass) panels hang below a head track, are a little thinner and have flush cup pulls
  const sl = !!s.slide;
  const w = s.a1 - s.a0 - 0.04, H = sl ? L.DOOR_H - 0.13 : L.DOOR_H, T = sl ? 0.12 : 0.14;
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
  if (s.style === 'panel' && w > (sl ? 1.0 : 1.2)) {
    const P = sl ? 0.025 : 0.035;
    for (const side of [-1, 1]) {
      for (const [y0, y1] of [[3.55, 6.25], [0.55, 3.2]]) {
        lb.mbox(0.35, w - 0.31, y0, y1, side > 0 ? T / 2 : -T / 2 - P, side > 0 ? T / 2 + P : -T / 2, 'doorWhite');
      }
    }
  }
  if (sl) {
    const px = s.pull === 'start' ? 0.3 : w - 0.26;
    for (const side of [-1, 1]) {
      lb.prim(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20), 'nickel', px, 3.2, side * (T / 2 + 0.004), 0, { rx: Math.PI / 2 });
      lb.prim(new THREE.CylinderGeometry(0.056, 0.056, 0.004, 20), 'galvanized', px, 3.2, side * (T / 2 + 0.011), 0, { rx: Math.PI / 2 });
    }
    return { spec: s, parts: lb.parts, w: w + 0.04 };
  }
  if (s.style === 'rear') {
    for (const side of [-1, 1]) lb.mbox(0.45, w - 0.45, 1.4, 6.2, side > 0 ? T / 2 : -T / 2 - 0.02, side > 0 ? T / 2 + 0.02 : -T / 2, 'frosted');
  }
  const knob = s.style === 'front' ? 'bronze' : 'nickel';
  for (const side of [-1, 1]) doorKnob(lb, knob, w - 0.25, 3.0, side * T / 2, side);
  for (const y of [0.9, 3.4, 5.9]) lb.mbox(-0.03, 0.05, y - 0.15, y + 0.15, -0.05, 0.05, knob);
  return { spec: s, parts: lb.parts, w: w + 0.04 };
}
// Knob on an arched rectangular rose, projecting along ±z from the door face at z0.
function doorKnob(lb, mat, x, y, z0, side) {
  const rose = new THREE.Shape();
  rose.moveTo(-0.1, -0.16); rose.lineTo(0.1, -0.16); rose.lineTo(0.1, 0.06);
  rose.absarc(0, 0.06, 0.1, 0, Math.PI, false); rose.lineTo(-0.1, -0.16);
  const plate = new THREE.ExtrudeGeometry(rose, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 });
  lb.prim(plate, mat, x, y, z0, side > 0 ? 0 : Math.PI);
  // turned knob: short neck, then a flattened ball with a broad face
  const V = (r, h) => new THREE.Vector2(r, h);
  const lathe = new THREE.LatheGeometry([V(0.001, 0), V(0.04, 0), V(0.035, 0.07), V(0.05, 0.1), V(0.1, 0.13), V(0.115, 0.17), V(0.105, 0.21), V(0.07, 0.225), V(0.001, 0.228)], 32);
  lathe.scale(0.74, 1, 1);                             // oval: narrower side to side, so it stands taller than wide on the door
  lb.prim(lathe, mat, x, y, z0 + side * 0.02, 0, { rx: side * Math.PI / 2 });
}
function buildGarageDoor(s) {
  const w = s.x1 - s.x0, lb = new Builder();
  const g = new THREE.BoxGeometry(w, s.h, 0.15, 8, 8, 1);
  g.translate(w / 2, s.h / 2, 0);
  lb.mesh(g, 'garageDoor');
  for (let i = 1; i < 4; i++) lb.mbox(0, w, i * s.h / 4 - 0.03, i * s.h / 4 + 0.03, -0.1, 0.1, 'garageDoor');
  return { spec: s, parts: lb.parts, w };
}
