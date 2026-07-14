/**
 * Audit templates for cross-net T-junction merges
 * (same logic class as WireNetTopology.rebuildWireNetTopology).
 */
import { K, resetSeq } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

const TOL = 4;

function pointOnSegment(p, a, b, tol = TOL) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 < 1e-6) {
    return Math.abs(p.x - a.x) <= tol && Math.abs(p.y - a.y) <= tol;
  }
  const cross = Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy);
  const segLen = Math.sqrt(segLen2);
  if (cross / segLen > tol) return false;
  const dot = (p.x - a.x) * dx + (p.y - a.y) * dy;
  return dot >= -tol && dot <= segLen2 + tol;
}

function near(a, b, tol = 2) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

function pinWorlds(doc) {
  /** @type {Map<string,{ref:string,id:string,net:string,x:number,y:number,lib:string}>} */
  const map = new Map();
  for (const n of doc.nets) {
    for (const ref of n.pinIds) {
      const parts = ref.split(':');
      const comp = doc.components.find((c) => c.id === parts[0]);
      if (!comp) continue;
      const pinId = parts[1];
      const pinName = parts[2] || pinId;
      const w = K.pinWorld(comp, pinId, pinName);
      const key = `${comp.id}:${pinId}`;
      map.set(key, {
        ref: comp.refDes,
        id: pinId,
        net: n.name,
        x: w.x,
        y: w.y,
        lib: comp.libraryId
      });
    }
  }
  return [...map.values()];
}

function audit(doc) {
  const netById = Object.fromEntries(doc.nets.map((n) => [n.id, n.name]));
  const pins = pinWorlds(doc);
  const issues = [];

  // 1) Wire endpoint mid-hit on a DIFFERENT net's wire segment (runtime T-junction)
  for (let wi = 0; wi < doc.wires.length; wi++) {
    const wA = doc.wires[wi];
    if (wA.points.length < 2) continue;
    const netA = netById[wA.netId] || wA.netId;
    const ends = [wA.points[0], wA.points[wA.points.length - 1]];
    for (const ep of ends) {
      for (let wj = 0; wj < doc.wires.length; wj++) {
        if (wi === wj) continue;
        const wB = doc.wires[wj];
        const netB = netById[wB.netId] || wB.netId;
        if (netA === netB) continue;
        for (let si = 0; si < wB.points.length - 1; si++) {
          const a = wB.points[si];
          const b = wB.points[si + 1];
          if (!pointOnSegment(ep, a, b)) continue;
          // endpoint coinciding with B's own endpoint is normal junction of B — skip if already B ends
          if (near(ep, wB.points[0]) || near(ep, wB.points[wB.points.length - 1])) continue;
          issues.push({
            kind: 'T-wire',
            a: netA,
            b: netB,
            at: `(${ep.x},${ep.y})`,
            seg: `(${a.x},${a.y})-(${b.x},${b.y})`
          });
        }
      }
    }
  }

  // 2) Different-net wire endpoints coincide → WireNetTopology junction union (hard short)
  const EP_TOL = 5; // matches junctionRadius ≈ gridSize*0.5 with grid 10
  for (let wi = 0; wi < doc.wires.length; wi++) {
    const wA = doc.wires[wi];
    if (wA.points.length < 2) continue;
    const netA = netById[wA.netId] || wA.netId;
    const endsA = [wA.points[0], wA.points[wA.points.length - 1]];
    for (let wj = wi + 1; wj < doc.wires.length; wj++) {
      const wB = doc.wires[wj];
      if (wB.points.length < 2) continue;
      const netB = netById[wB.netId] || wB.netId;
      if (netA === netB) continue;
      const endsB = [wB.points[0], wB.points[wB.points.length - 1]];
      for (const ea of endsA) {
        for (const eb of endsB) {
          if (!near(ea, eb, EP_TOL)) continue;
          issues.push({
            kind: 'EP-short',
            a: netA,
            b: netB,
            at: `(${ea.x},${ea.y})`,
            seg: `ends≈(${eb.x},${eb.y})`
          });
        }
      }
    }
  }

  // 3) Pin of net X lies mid-segment on wire of net Y≠X (would snap/merge after bend endpoints sit on pin)
  for (const p of pins) {
    for (const w of doc.wires) {
      const netW = netById[w.netId] || w.netId;
      if (netW === p.net) continue;
      for (let si = 0; si < w.points.length - 1; si++) {
        const a = w.points[si];
        const b = w.points[si + 1];
        if (!pointOnSegment(p, a, b)) continue;
        if (near(p, a) || near(p, b)) continue;
        issues.push({
          kind: 'pin-on-wire',
          a: `${p.ref}.${p.id}/${p.net}`,
          b: netW,
          at: `(${p.x},${p.y})`,
          seg: `(${a.x},${a.y})-(${b.x},${b.y})`
        });
      }
    }
  }

  // dedupe
  const seen = new Set();
  const unique = [];
  for (const it of issues) {
    const k = `${it.kind}|${it.a}|${it.b}|${it.at}|${it.seg}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }
  return unique;
}

const summary = [];
for (const def of TEMPLATE_DEFS) {
  resetSeq();
  const doc = K.createDoc(def.name, def.description);
  def.build(doc);
  const issues = audit(doc);
  summary.push({ id: def.id, issues });
  const flag = issues.length ? 'BAD' : 'ok';
  console.log(`[${flag}] ${def.id} issues=${issues.length}`);
  for (const it of issues.slice(0, 15)) {
    console.log(`   ${it.kind}: ${it.a} ↔ ${it.b} @ ${it.at} on ${it.seg}`);
  }
  if (issues.length > 15) console.log(`   ... +${issues.length - 15} more`);
}

console.log('---');
console.log(
  'affected:',
  summary.filter((s) => s.issues.length).map((s) => `${s.id}(${s.issues.length})`).join(', ') || 'none'
);
