// Lightmap atlas layout: every lightmapped polygon gets its own rectangular chart
// (it is planar, so the chart is its exact flattened shape), packed into shelves. Coplanar pieces of
// one surface that share a `chart` key (a whole ceiling, one face of a wall) share one chart, so the
// baked light runs continuously across the joins instead of meeting at a seam.
// Deterministic — the baker and the walkthrough produce the same atlas from the same parts.

export const BASE_DENSITY = 8;        // texels per foot on interior surfaces (1.5")
const PAD = 2;                        // texels of padding around each chart

export function layoutLightmap(parts, density = BASE_DENSITY) {
  const charts = [];
  let area = 0;
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // chart members: a single polygon, or all polygons with the same chart key
  const members = [], byKey = new Map();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.kind !== 'poly' || !p.lm) continue;
    if (p.chart == null) { members.push([i]); continue; }
    if (!byKey.has(p.chart)) { byKey.set(p.chart, []); members.push(byKey.get(p.chart)); }
    byKey.get(p.chart).push(i);
  }
  for (const list of members) {
    const p = parts[list[0]], { pts, n } = p;
    // plane basis: e1 along the first edge (single polygon) or level along the surface (shared chart)
    let e1 = list.length === 1 ? sub(pts[1], pts[0]) : Math.abs(n[1]) > 0.9 ? [1, 0, 0] : cross([0, 1, 0], n);
    const l1 = Math.hypot(...e1) || 1;
    e1 = e1.map(v => v / l1);
    const e2 = cross(n, e1);
    const O = pts[0];
    const uvs = list.map(i => parts[i].pts.map(q => { const d = sub(q, O); return [dot(d, e1), dot(d, e2)]; }));
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const uv of uvs) for (const [u, v] of uv) { u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
    const w = u1 - u0, h = v1 - v0;
    const d = (p.dens ?? BASE_DENSITY) * density / BASE_DENSITY;
    const sx = Math.max(d, 1.6 / Math.max(w, 1e-3)), sy = Math.max(d, 1.6 / Math.max(h, 1e-3));
    const tw = Math.max(2, Math.ceil(w * sx)), th = Math.max(2, Math.ceil(h * sy));
    charts.push({ list, uvs, u0, v0, sx, sy, tw, th, cw: tw + 2 * PAD, ch: th + 2 * PAD });
    area += (tw + 2 * PAD) * (th + 2 * PAD);
  }
  // atlas width: power of two that keeps the atlas roughly square
  let W = 1024;
  while (W * W < area * 1.2 && W < 8192) W *= 2;
  const order = charts.map((c, k) => k).sort((a, b) => (charts[b].ch - charts[a].ch) || (charts[b].cw - charts[a].cw) || (a - b));
  let x = 0, y = 0, rowH = 0;
  for (const k of order) {
    const c = charts[k];
    if (x + c.cw > W) { x = 0; y += rowH; rowH = 0; }
    c.ox = x; c.oy = y;
    x += c.cw; rowH = Math.max(rowH, c.ch);
  }
  const H = Math.ceil((y + rowH) / 16) * 16;
  // per-vertex lightmap UVs
  for (const c of charts) {
    c.list.forEach((i, k) => {
      parts[i].uv1 = c.uvs[k].map(([u, v]) => [
        (c.ox + PAD + (u - c.u0) * c.sx) / W,
        (c.oy + PAD + (v - c.v0) * c.sy) / H,
      ]);
    });
  }
  return { W, H, count: charts.length };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Probe points (per-vertex lighting) for mesh parts and door leaves, in a fixed order.
export function collectProbes(house) {
  const pos = [], nrm = [];
  const add = (p, n) => { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); };
  // Probe points sit a little inside each part (toward its centre) so the ends of pieces that
  // butt into other geometry (baluster tops in a handrail, legs on a floor) are not buried.
  const inset = (m, i, c) => {
    const v = [m.pos[i], m.pos[i + 1], m.pos[i + 2]];
    const n = [m.nrm[i], m.nrm[i + 1], m.nrm[i + 2]];
    const d = [c[0] - v[0], c[1] - v[1], c[2] - v[2]];
    // slide along the surface only (drop the component along the normal)
    const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    d[0] -= dn * n[0]; d[1] -= dn * n[1]; d[2] -= dn * n[2];
    const l = Math.hypot(...d);
    const k = l > 0 ? Math.min(0.08 * l, 0.12) / l : 0;
    return [v[0] + d[0] * k, v[1] + d[1] * k, v[2] + d[2] * k];
  };
  const centre = m => {
    const c = [0, 0, 0], n = m.pos.length / 3;
    for (let i = 0; i < m.pos.length; i += 3) { c[0] += m.pos[i]; c[1] += m.pos[i + 1]; c[2] += m.pos[i + 2]; }
    return c.map(v => v / n);
  };
  const meshes = house.b.parts.filter(p => p.kind === 'mesh');
  for (const m of meshes) {
    m.probeBase = pos.length / 3;
    const c = centre(m);
    for (let i = 0; i < m.pos.length; i += 3) add(inset(m, i, c), [m.nrm[i], m.nrm[i + 1], m.nrm[i + 2]]);
  }
  const addLocal = (obj, matrix) => {
    for (const m of obj.parts) {
      if (m.kind !== 'mesh') continue;
      m.probeBase = pos.length / 3;
      const c = centre(m);
      for (let i = 0; i < m.pos.length; i += 3) {
        const p = matrix.apply(inset(m, i, c), 1);
        const n = matrix.apply([m.nrm[i], m.nrm[i + 1], m.nrm[i + 2]], 0);
        add(p, n);
      }
    }
  };
  for (const d of house.doors) addLocal(d, doorMatrix(d.spec, 0));
  for (const g of house.garageDoors) addLocal(g, { apply: (v, w) => (w ? [v[0] + g.spec.x0, v[1], v[2] + g.spec.z] : v) });
  // sliding doors: panel and shade are built in place (closed)
  const same = { apply: v => v };
  for (const s of house.sliders || []) { addLocal(s.panel, same); addLocal(s.shade, same); }
  const ranges = [...meshes, ...house.doors.flatMap(d => d.parts), ...house.garageDoors.flatMap(g => g.parts),
    ...(house.sliders || []).flatMap(s => [...s.panel.parts, ...s.shade.parts])]
    .filter(m => m.kind === 'mesh').map(m => [m.probeBase, m.pos.length / 3]);
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), count: pos.length / 3, ranges };
}

// Closed-door pose: hinge position and the rotation that lays the leaf along the wall.
export function doorFrame(s) {
  const hx = s.axis === 'x' ? (s.hinge ? s.a1 : s.a0) : s.c;
  const hz = s.axis === 'x' ? s.c : (s.hinge ? s.a1 : s.a0);
  const cd = s.axis === 'x' ? [s.hinge ? -1 : 1, 0] : [0, s.hinge ? -1 : 1];
  const od = s.axis === 'x' ? [0, s.swing] : [s.swing, 0];
  const thC = Math.atan2(-cd[1], cd[0]);
  let dlt = Math.atan2(-od[1], od[0]) - thC;
  while (dlt > Math.PI) dlt -= 2 * Math.PI;
  while (dlt < -Math.PI) dlt += 2 * Math.PI;
  return { hx, hz, thC, dlt: dlt * 0.96 };
}
export function doorMatrix(s, t) {
  const f = doorFrame(s);
  const a = s.slide ? f.thC : f.thC + f.dlt * t, c = Math.cos(a), sn = Math.sin(a);
  const tr = s.slide ? s.slide.track : 0, ox = s.axis === 'z' ? tr : 0, oz = s.axis === 'x' ? tr : 0;
  return {
    apply(v, w) {
      const x = v[0] * c + v[2] * sn, z = -v[0] * sn + v[2] * c;
      return w ? [x + f.hx + ox, v[1] + s.base, z + f.hz + oz] : [x, v[1], z];
    },
  };
}
