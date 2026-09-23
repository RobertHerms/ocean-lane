// Builds one child's geometry off the main thread.
import { buildKidGeometry } from './kidgeom.js';
self.onmessage = e => {
  const g = buildKidGeometry(e.data);
  const b = g.body, h = g.hair;
  self.postMessage(g, [b.pos.buffer, b.nrm.buffer, b.index.buffer, b.lab.buffer, b.si.buffer, b.sw.buffer, h.pos.buffer, h.nrm.buffer, h.index.buffer]);
};
