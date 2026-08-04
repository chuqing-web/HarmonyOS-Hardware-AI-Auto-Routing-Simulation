import { readFileSync } from 'fs';

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function pointSegDist(p, s, e) {
  const abx = e.x - s.x, aby = e.y - s.y, len2 = abx * abx + aby * aby;
  if (len2 < 0.01) return dist(p, s);
  let t = ((p.x - s.x) * abx + (p.y - s.y) * aby) / len2;
  if (t < 0) t = 0; if (t > 1) t = 1;
  return Math.hypot(p.x - (s.x + t * abx), p.y - (s.y + t * aby));
}
function segSegDist(a0, a1, b0, b1) {
  const ax = a1.x - a0.x, ay = a1.y - a0.y, bx = b1.x - b0.x, by = b1.y - b0.y;
  const den = ax * by - ay * bx;
  if (Math.abs(den) > 1e-9) {
    const t = ((b0.x - a0.x) * by - (b0.y - a0.y) * bx) / den;
    const u = ((b0.x - a0.x) * ay - (b0.y - a0.y) * ax) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegDist(a0, b0, b1), pointSegDist(a1, b0, b1), pointSegDist(b0, a0, a1), pointSegDist(b1, a0, a1));
}
function segsIntersect(a0, a1, b0, b1) {
  const ax = a1.x - a0.x, ay = a1.y - a0.y, bx = b1.x - b0.x, by = b1.y - b0.y;
  const den = ax * by - ay * bx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b0.x - a0.x) * by - (b0.y - a0.y) * bx) / den;
  const u = ((b0.x - a0.x) * ay - (b0.y - a0.y) * ax) / den;
  if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) return true;
  return null;
}

const doc = JSON.parse(readFileSync('Test_Template/lab_analog_ic.pcbsim', 'utf8')).pcb;
const byLayer = {};
for (const t of doc.tracks) byLayer[t.layer] = (byLayer[t.layer] || 0) + 1;
const clr = 6;
let cross = 0, clash = 0;
const details = [];
for (let i = 0; i < doc.tracks.length; i++) {
  for (let j = i + 1; j < doc.tracks.length; j++) {
    const t1 = doc.tracks[i], t2 = doc.tracks[j];
    if (t1.layer !== t2.layer || t1.netId === t2.netId) continue;
    if (segsIntersect(t1.start, t1.end, t2.start, t2.end)) {
      cross++;
      details.push('X ' + t1.netName + '/' + t2.netName + ' ' + t1.layer);
    }
    const need = (t1.width + t2.width) / 2 + clr;
    const d = segSegDist(t1.start, t1.end, t2.start, t2.end);
    if (d + 1e-6 < need) {
      clash++;
      details.push('C ' + t1.netName + '/' + t2.netName + ' ' + t1.layer + ' d=' + d.toFixed(1));
      details.push('  ' + JSON.stringify(t1.start) + ' ' + JSON.stringify(t1.end));
      details.push('  ' + JSON.stringify(t2.start) + ' ' + JSON.stringify(t2.end));
    }
  }
}
const raw = Buffer.from(readFileSync('Test_Template/lab_analog_ic.pcbsim'))
  .equals(Buffer.from(readFileSync('entry/src/main/resources/rawfile/Test_Template/lab_analog_ic.pcbsim')));
console.log({ byLayer, cross, clash, cu: doc.layerStack?.copperCount, raw });
console.log(details.join('\n') || '(clean)');
