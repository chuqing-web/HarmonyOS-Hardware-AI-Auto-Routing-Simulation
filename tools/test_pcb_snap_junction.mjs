/**
 * Junction-aware snap must not tear shared L-corners.
 * Run: node tools/test_pcb_snap_junction.mjs
 */
function d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function jk(p, n, t) {
  return n + '|' + Math.round(p.x / t) + '|' + Math.round(p.y / t);
}

/** Per-endpoint snap with collapse guard — tears when only one side of a junction moves */
function snapLegacyTear(tracks, pad, tol) {
  for (const trk of tracks) {
    for (const end of ['start', 'end']) {
      const pt = trk[end];
      const other = end === 'start' ? trk.end : trk.start;
      const dist = d(pt, pad);
      if (dist <= tol && dist > 0.01 && d(pad, other) >= 0.5) {
        pt.x = pad.x;
        pt.y = pad.y;
      }
    }
  }
}

/** Junction bucket snap — all ends at a corner move together or not at all */
function snapJunction(tracks, pad, tol, jt) {
  const buckets = new Map();
  for (const trk of tracks) {
    for (const isStart of [true, false]) {
      const pt = isStart ? trk.start : trk.end;
      const k = jk(pt, trk.netId, jt);
      if (!buckets.has(k)) buckets.set(k, { pos: { x: pt.x, y: pt.y }, refs: [] });
      buckets.get(k).refs.push({ trk, isStart });
    }
  }
  for (const b of buckets.values()) {
    const dist = d(b.pos, pad);
    if (dist > tol || dist <= 0.01) continue;
    if (b.refs.some((r) => d(pad, r.isStart ? r.trk.end : r.trk.start) < 0.5)) continue;
    for (const r of b.refs) {
      const pt = r.isStart ? r.trk.start : r.trk.end;
      pt.x = pad.x;
      pt.y = pad.y;
    }
  }
}

const pad = { x: 175, y: 745 };
const mid = { x: 175, y: 740 };
const a = { x: 403, y: 738 };

const legacy = [
  { netId: 'n', start: { ...a }, end: { ...mid } },
  { netId: 'n', start: { ...mid }, end: { ...pad } }
];
snapLegacyTear(legacy, pad, 20);
const gapL = d(legacy[0].end, legacy[1].start);

const fixed = [
  { netId: 'n', start: { ...a }, end: { ...mid } },
  { netId: 'n', start: { ...mid }, end: { ...pad } }
];
snapJunction(fixed, pad, 20, 8);
const gapF = d(fixed[0].end, fixed[1].start);

let failed = 0;
if (!(gapL > 0.5)) {
  console.error('FAIL: legacy should tear shared mid, gap=' + gapL);
  failed++;
} else {
  console.log('OK: legacy tears gap=' + gapL.toFixed(3));
}
if (!(gapF < 0.5)) {
  console.error('FAIL: junction snap should keep join, gap=' + gapF);
  failed++;
} else {
  console.log('OK: junction keeps join gap=' + gapF.toFixed(3));
}
// Collapse skip: mid stays (do not suck stub into pad and orphan neighbor)
if (d(fixed[0].end, mid) > 0.01) {
  console.error('FAIL: expected collapse-skip to keep mid');
  failed++;
} else {
  console.log('OK: collapse-skip keeps mid stub');
}

process.exit(failed === 0 ? 0 : 1);
