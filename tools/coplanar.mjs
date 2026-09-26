// Finds horizontal polys from buildHouse() that lie in the same plane and overlap (z-fighting).
// Usage: node tools/coplanar.mjs [--all]   (default: only pairs facing the same way; --all adds back-to-back pairs)
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const three = pathToFileURL(path.join(root, 'vendor/three/build/three.module.js')).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === 'three' ? { url: three, shortCircuit: true } : next(spec, ctx)) });
const { buildHouse } = await import(pathToFileURL(path.join(root, 'js/house.js')).href);

const all = process.argv.includes('--all');
const { b } = buildHouse();
const polys = b.parts.filter(p => p.kind === 'poly' && Math.abs(p.n[1]) > 0.999)
  .map(p => ({ p, y: p.pts[0][1], xz: p.pts.map(q => [q[0], q[2]]) }));

// area of a convex polygon, and the intersection of two convex polygons (Sutherland-Hodgman)
const area = P => Math.abs(P.reduce((s, a, i) => { const c = P[(i + 1) % P.length]; return s + a[0] * c[1] - c[0] * a[1]; }, 0)) / 2;
const ccw = P => (P.reduce((s, a, i) => { const c = P[(i + 1) % P.length]; return s + a[0] * c[1] - c[0] * a[1]; }, 0) < 0 ? P.slice().reverse() : P);
function clip(subject, clipper) {
  let out = ccw(subject);
  const C = ccw(clipper);
  for (let i = 0; i < C.length && out.length; i++) {
    const a = C[i], c = C[(i + 1) % C.length];
    const side = p => (c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
const bbox = P => [Math.min(...P.map(q => q[0])), Math.max(...P.map(q => q[0])), Math.min(...P.map(q => q[1])), Math.max(...P.map(q => q[1]))];

const groups = new Map();
for (const q of polys) {
  if (q.p.pts.some(v => Math.abs(v[1] - q.y) > 1e-4)) continue;
  q.bb = bbox(q.xz);
  const k = Math.round(q.y * 1000);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(q);
}
const hits = [];
for (const [, g] of groups) {
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const A = g[i], B = g[j];
    if (Math.abs(A.y - B.y) > 1e-4) continue;
    const same = Math.sign(A.p.n[1]) === Math.sign(B.p.n[1]);
    if (!same && !all) continue;
    if (A.bb[1] <= B.bb[0] + 1e-4 || B.bb[1] <= A.bb[0] + 1e-4 || A.bb[3] <= B.bb[2] + 1e-4 || B.bb[3] <= A.bb[2] + 1e-4) continue;
    const I = clip(A.xz, B.xz);
    const a = I.length >= 3 ? area(I) : 0;
    if (a < 1e-3) continue;
    const ib = bbox(I);
    hits.push({ y: A.y, same, a, mats: [A.p.mat, B.p.mat], where: ib.map(v => +v.toFixed(2)) });
  }
}
hits.sort((p, q) => p.y - q.y || q.a - p.a);
for (const h of hits) console.log(`y ${h.y.toFixed(3)}  ${h.same ? 'SAME' : 'b2b '}  area ${h.a.toFixed(3)}  x ${h.where[0]}..${h.where[1]} z ${h.where[2]}..${h.where[3]}  ${h.mats[0]} / ${h.mats[1]}`);
console.log(`${hits.length} overlapping coplanar pair(s)`);
