/**
 * Repro: pad snap collapsing short L-stub → zero-length track.
 * Run: node tools/test_pcb_autoroute_snap.mjs
 */
function pointDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function snapEndpointLegacy(pt, pads, netId) {
  let best = null;
  let bestDist = Infinity;
  for (const pr of pads) {
    if (netId.length > 0 && pr.netId !== netId) continue;
    const d = pointDist(pt, pr.pos);
    const tightTol = Math.min(pr.tol, Math.max(pr.tol * 0.55, 12));
    if (d <= tightTol && d < bestDist) {
      bestDist = d;
      best = pr.pos;
    }
  }
  if (best !== null && bestDist > 0.01) {
    pt.x = best.x;
    pt.y = best.y;
    return true;
  }
  return false;
}

/** Fixed: refuse snap that collapses the track */
function snapEndpointSafe(pt, other, pads, netId) {
  let best = null;
  let bestDist = Infinity;
  for (const pr of pads) {
    if (netId.length > 0 && pr.netId !== netId) continue;
    const d = pointDist(pt, pr.pos);
    const tightTol = Math.min(pr.tol, Math.max(pr.tol * 0.55, 12));
    if (d <= tightTol && d < bestDist) {
      bestDist = d;
      best = pr.pos;
    }
  }
  if (best === null || bestDist <= 0.01) return false;
  const nx = best.x;
  const ny = best.y;
  if (pointDist({ x: nx, y: ny }, other) < 0.5) {
    return false; // would collapse
  }
  pt.x = nx;
  pt.y = ny;
  return true;
}

function pruneZero(tracks) {
  return tracks.filter(t => pointDist(t.start, t.end) >= 0.5);
}

// Case from logs: VOUT stub mid near pad → both ends snap to pad
const pad = { pos: { x: 175, y: 745 }, netId: 'vout', tol: 40 };
const pads = [pad];
const trkLegacy = {
  netId: 'vout',
  start: { x: 175, y: 740 },
  end: { x: 175, y: 745 }
};
snapEndpointLegacy(trkLegacy.start, pads, 'vout');
snapEndpointLegacy(trkLegacy.end, pads, 'vout');
const legacyLen = pointDist(trkLegacy.start, trkLegacy.end);

const trkFixed = {
  netId: 'vout',
  start: { x: 175, y: 740 },
  end: { x: 175, y: 745 }
};
snapEndpointSafe(trkFixed.start, trkFixed.end, pads, 'vout');
snapEndpointSafe(trkFixed.end, trkFixed.start, pads, 'vout');
const fixedLen = pointDist(trkFixed.start, trkFixed.end);

const pruned = pruneZero([{ start: { x: 483, y: 220 }, end: { x: 483, y: 220 } }]);

let failed = 0;
if (!(legacyLen < 0.5)) {
  console.error('FAIL: expected legacy snap to collapse stub');
  failed++;
} else {
  console.log('OK: legacy collapses (repro confirmed) len=' + legacyLen.toFixed(3));
}
if (!(fixedLen >= 0.5)) {
  console.error('FAIL: safe snap should keep stub length, got ' + fixedLen);
  failed++;
} else {
  console.log('OK: safe snap keeps stub len=' + fixedLen.toFixed(3));
}
if (pruned.length !== 0) {
  console.error('FAIL: prune should drop zero-length track');
  failed++;
} else {
  console.log('OK: prune drops zero-length');
}

process.exit(failed === 0 ? 0 : 1);
