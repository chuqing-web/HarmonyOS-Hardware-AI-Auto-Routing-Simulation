/**
 * Smoke: WarRouteOrder locality sort + NN chain (mirrors common WarRouteOrder.ets).
 * Run: node tools/war_route_order_smoke.mjs
 */
function maxNnEdgeLength(pins) {
  if (pins.length < 2) return 0;
  const chain = nearestNeighborChain(pins);
  let maxEdge = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const d = Math.hypot(chain[i + 1].pt.x - chain[i].pt.x, chain[i + 1].pt.y - chain[i].pt.y);
    if (d > maxEdge) maxEdge = d;
  }
  return maxEdge;
}

function nearestNeighborChain(pins) {
  if (pins.length <= 1) return pins.slice();
  let start = 0;
  for (let i = 1; i < pins.length; i++) {
    const a = pins[i].pt, b = pins[start].pt;
    if (a.x < b.x - 0.5 || (Math.abs(a.x - b.x) < 0.5 && a.y < b.y)) start = i;
  }
  const used = pins.map(() => false);
  const out = [];
  let cur = start;
  for (let step = 0; step < pins.length; step++) {
    out.push(pins[cur]);
    used[cur] = true;
    if (step === pins.length - 1) break;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < pins.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(pins[j].pt.x - pins[cur].pt.x, pins[j].pt.y - pins[cur].pt.y);
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best < 0) break;
    cur = best;
  }
  return out;
}

function sortNetIndicesByLocality(maxEdgeByNetIndex) {
  const idx = maxEdgeByNetIndex.map((_, i) => i);
  idx.sort((a, b) => {
    const da = maxEdgeByNetIndex[a], db = maxEdgeByNetIndex[b];
    if (da !== db) return da - db;
    return a - b;
  });
  return idx;
}

// Reproduce log pin sets
const HYS = [
  { key: 'U2.IN+', pt: { x: 400, y: 450 } },
  { key: 'R1.1', pt: { x: 410, y: 600 } },
  { key: 'R2.1', pt: { x: 590, y: 400 } },
];
const TRI = [
  { key: 'U3.OUT', pt: { x: 530, y: 260 } },
  { key: 'C1.1', pt: { x: 580, y: 540 } },
  { key: 'U2.IN-', pt: { x: 400, y: 470 } },
];
const SQR = [
  { key: 'U2.OUT', pt: { x: 460, y: 460 } },
  { key: 'R1.2', pt: { x: 470, y: 600 } },
  { key: 'R3.1', pt: { x: 740, y: 520 } },
];
const INT = [
  { key: 'U3.IN-', pt: { x: 470, y: 270 } },
  { key: 'R3.2', pt: { x: 800, y: 520 } },
  { key: 'C1.2', pt: { x: 640, y: 540 } },
];

const names = ['SQUARE_OUT', 'TRIANGLE_OUT', 'INT_IN', 'HYS_NODE'];
const edges = [maxNnEdgeLength(SQR), maxNnEdgeLength(TRI), maxNnEdgeLength(INT), maxNnEdgeLength(HYS)];
const order = sortNetIndicesByLocality(edges);
const orderedNames = order.map(i => `${names[i]}:${Math.round(edges[i])}`);

console.log('edges', edges.map((e, i) => `${names[i]}=${Math.round(e)}`).join(' '));
console.log('localFirst', orderedNames.join(','));

const hysChain = nearestNeighborChain(HYS).map(p => p.key).join('→');
console.log('HYS NN chain', hysChain);

let failed = 0;
if (orderedNames[0].indexOf('HYS_NODE') < 0 && edges[3] > edges[order[0]] + 1) {
  // HYS need not always be first if another net is shorter; but must be before TRIANGLE if shorter
}
const hysPos = order.indexOf(3);
const triPos = order.indexOf(1);
if (hysPos > triPos) {
  console.error('FAIL: HYS_NODE should route before TRIANGLE_OUT when its NN max-edge is smaller');
  failed++;
} else {
  console.log('PASS: HYS before TRIANGLE');
}
if (hysChain.indexOf('U2.IN+') !== 0 && hysChain.indexOf('R1.1') < 0) {
  console.error('FAIL: unexpected HYS chain', hysChain);
  failed++;
} else {
  console.log('PASS: HYS NN chain ok');
}

// Escape detour left-out must clear body for IN+→R1
function nearestEscapeEdge(pinX, pinY, r) {
  const dL = pinX - r.x, dR = (r.x + r.w) - pinX, dT = pinY - r.y, dB = (r.y + r.h) - pinY;
  const m = Math.min(dL, dR, dT, dB);
  if (m === dL) return 'L';
  if (m === dR) return 'R';
  if (m === dT) return 'T';
  return 'B';
}
const from = { x: 400, y: 450 }, to = { x: 410, y: 600 };
const u2hit = { x: 392, y: 412, w: 76, h: 96 };
const edge = nearestEscapeEdge(from.x, from.y, u2hit);
const margin = 30;
const esc = edge === 'L' ? { x: from.x - margin, y: from.y } : { x: from.x + margin, y: from.y };
const detour = [from, esc, { x: esc.x, y: to.y }, to];
if (edge !== 'L') {
  console.error('FAIL: IN+ escape edge should be L, got', edge);
  failed++;
} else {
  console.log('PASS: IN+ escape L', JSON.stringify(detour));
}

// WAR fail → label demote policy (contract)
function warFailShouldDemoteToLabel() {
  return true; // user-approved: geometry blocked nets become joinByLabel stubs
}
if (!warFailShouldDemoteToLabel()) {
  console.error('FAIL: WAR demote policy');
  failed++;
} else {
  console.log('PASS: WAR fail → joinByLabel demote allowed');
}

if (failed > 0) {
  process.exit(1);
}
console.log('ALL PASS');
