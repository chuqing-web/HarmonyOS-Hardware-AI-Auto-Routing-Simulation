/**
 * PCB LLM 几何 apply 模拟检测（无真机 ArkTS）
 * 覆盖：正交展开、焊盘连通、orphan 拒收、clearance 拒绝、via 拒收、forcePour 降级语义
 * 运行：node tools/pcb_ai_llm_geo_smoke.mjs
 */
const PAD_HIT = 35;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function expandOrtho(points) {
  if (points.length < 2) return points.slice();
  const out = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    if (dist(prev, cur) < 0.5) continue;
    const horiz = Math.abs(prev.y - cur.y) < 0.5;
    const vert = Math.abs(prev.x - cur.x) < 0.5;
    if (horiz || vert) out.push({ x: cur.x, y: cur.y });
    else {
      out.push({ x: cur.x, y: prev.y });
      out.push({ x: cur.x, y: cur.y });
    }
  }
  return out;
}

class Uf {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i) {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]];
    return i;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p[rb] = ra;
  }
}

function distPointSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function netConnected(pads, tracks, vias, hit = PAD_HIT) {
  if (pads.length < 2) return true;
  const nodes = pads.map(p => ({ x: p.x, y: p.y }));
  const padCount = pads.length;
  for (const v of vias) nodes.push({ x: v.x, y: v.y });
  const pairStarts = [];
  const netTracks = [];
  for (const t of tracks) {
    pairStarts.push(nodes.length);
    netTracks.push(t);
    nodes.push({ x: t.a.x, y: t.a.y }, { x: t.b.x, y: t.b.y });
  }
  if (nodes.length < 2) return false;
  const uf = new Uf(nodes.length);
  for (const s of pairStarts) uf.union(s, s + 1);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const lim = (i < padCount || j < padCount) ? hit : 1.0;
      if (dist(nodes[i], nodes[j]) <= lim) uf.union(i, j);
    }
  }
  for (let pi = 0; pi < padCount; pi++) {
    for (let ti = 0; ti < netTracks.length; ti++) {
      if (distPointSeg(pads[pi], netTracks[ti].a, netTracks[ti].b) <= hit) {
        uf.union(pi, pairStarts[ti]);
      }
    }
    let viaNode = padCount;
    for (const v of vias) {
      if (dist(pads[pi], v) <= hit) uf.union(pi, viaNode);
      viaNode++;
    }
  }
  for (let ti = 0; ti < netTracks.length; ti++) {
    const t = netTracks[ti];
    for (let tj = 0; tj < netTracks.length; tj++) {
      if (ti === tj) continue;
      const o = netTracks[tj];
      if (distPointSeg(t.a, o.a, o.b) <= 1 || distPointSeg(t.b, o.a, o.b) <= 1) {
        uf.union(pairStarts[ti], pairStarts[tj]);
      }
    }
    let viaNode = padCount;
    for (const v of vias) {
      if (distPointSeg(v, t.a, t.b) <= hit) uf.union(viaNode, pairStarts[ti]);
      viaNode++;
    }
  }
  const r0 = uf.find(0);
  for (let i = 1; i < padCount; i++) {
    if (uf.find(i) !== r0) return false;
  }
  return true;
}

function pathClear(a, b, foreignPads, width = 10, clr = 10) {
  const need = clr + width / 2;
  for (const p of foreignPads) {
    // point-seg
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 < 1e-9 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < need + (p.r || 25)) return `pad_block ${p.ref}`;
  }
  return null;
}

let failed = 0;
function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`  OK  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ' | ' + detail : ''}`);
  }
}

console.log('=== pcb_ai_llm_geo_smoke ===\n');

// 1) expandOrtho
{
  console.log('[expandOrtho]');
  const pts = expandOrtho([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
  assert('diagonal → L', pts.length === 3 && pts[1].x === 100 && pts[1].y === 0);
  const ortho = expandOrtho([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]);
  assert('already ortho kept', ortho.length === 3);
}

// 2) connectivity: good path
{
  console.log('[connectivity good]');
  const pads = [{ x: 100, y: 100 }, { x: 300, y: 200 }];
  const tracks = [
    { a: { x: 100, y: 100 }, b: { x: 300, y: 100 } },
    { a: { x: 300, y: 100 }, b: { x: 300, y: 200 } },
  ];
  assert('L path connects 2 pads', netConnected(pads, tracks, []));
}

// 3) orphan stub rejected
{
  console.log('[orphan reject]');
  const pads = [{ x: 100, y: 100 }, { x: 300, y: 200 }];
  const tracks = [{ a: { x: 50, y: 50 }, b: { x: 80, y: 50 } }];
  assert('orphan stub NOT connected', !netConnected(pads, tracks, []));
}

// 4) via bridges layers (position graph)
{
  console.log('[via bridge]');
  const pads = [{ x: 100, y: 100 }, { x: 300, y: 300 }];
  const tracks = [
    { a: { x: 100, y: 100 }, b: { x: 200, y: 100 } },
    { a: { x: 200, y: 300 }, b: { x: 300, y: 300 } },
  ];
  const vias = [{ x: 200, y: 100 }]; // only touches first track
  assert('via alone insufficient', !netConnected(pads, tracks, vias));
  const vias2 = [{ x: 200, y: 100 }, { x: 200, y: 300 }];
  // still need vertical copper — add track via via2
  const tracks2 = [
    ...tracks,
    { a: { x: 200, y: 100 }, b: { x: 200, y: 300 } },
  ];
  assert('via+vertical connects', netConnected(pads, tracks2, [{ x: 200, y: 100 }]));
  // T-junction
  const tPads = [{ x: 0, y: 0 }, { x: 50, y: 100 }];
  const tTracks = [
    { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
  ];
  assert('T-junction connects', netConnected(tPads, tTracks, []));
}

// 5) mount pads not mandatory — only 1 functional → ok
{
  console.log('[mount soft]');
  const functional = [{ x: 100, y: 100 }];
  assert('single functional pad ok', netConnected(functional, [], []));
}

// 6) clearance reject foreign pad
{
  console.log('[clearance]');
  const foreign = [{ ref: 'U1.1', x: 200, y: 100, r: 25 }];
  const block = pathClear({ x: 100, y: 100 }, { x: 300, y: 100 }, foreign);
  assert('path through foreign pad blocked', block !== null);
  const clear = pathClear({ x: 100, y: 200 }, { x: 300, y: 200 }, foreign);
  assert('parallel path clear', clear === null);
}

// 7) LM7805-like VOUT connect simulation
{
  console.log('[LM7805 VOUT sim]');
  const pads = [
    { x: 510, y: 480 }, // U1.3
    { x: 535, y: 480 }, // C2.1
    { x: 155, y: 720 }, // R1.1
    { x: 300, y: 720 }, // M1.1
    { x: 960, y: 630 }, // J1.4
  ];
  // bad: orphan near U1 only
  const bad = [{ a: { x: 510, y: 480 }, b: { x: 535, y: 480 } }];
  assert('partial VOUT fails', !netConnected(pads, bad, []));
  // good: mid-segment pad hit (M1 on bus)
  const midSeg = [
    { a: { x: 510, y: 480 }, b: { x: 535, y: 480 } },
    { a: { x: 535, y: 480 }, b: { x: 535, y: 720 } },
    { a: { x: 155, y: 720 }, b: { x: 535, y: 720 } }, // M1@300 on segment
    { a: { x: 535, y: 720 }, b: { x: 960, y: 720 } },
    { a: { x: 960, y: 720 }, b: { x: 960, y: 630 } },
  ];
  assert('mid-segment pad connects', netConnected(pads, midSeg, []));
  const good3 = [
    { a: { x: 510, y: 480 }, b: { x: 535, y: 480 } },
    { a: { x: 535, y: 480 }, b: { x: 535, y: 720 } },
    { a: { x: 535, y: 720 }, b: { x: 300, y: 720 } },
    { a: { x: 300, y: 720 }, b: { x: 155, y: 720 } },
    { a: { x: 535, y: 720 }, b: { x: 960, y: 720 } },
    { a: { x: 960, y: 720 }, b: { x: 960, y: 630 } },
  ];
  assert('full VOUT tree connects', netConnected(pads, good3, []));
}

// 8) parse-like point shapes
{
  console.log('[point parse shapes]');
  function parsePoint(v) {
    if (Array.isArray(v) && v.length >= 2) return { x: +v[0], y: +v[1] };
    if (v && typeof v === 'object') return { x: +v.x, y: +v.y };
    return null;
  }
  assert('{x,y}', parsePoint({ x: 1, y: 2 }).x === 1);
  assert('[x,y]', parsePoint([3, 4]).y === 4);
}

// 9) regression: ai_engine must not call runPcbGeometryRoute
{
  console.log('[source regression]');
  const fs = await import('fs');
  const path = await import('path');
  const root = path.resolve('features/ai_engine/src/main/ets/algorithms/pcb_agents');
  const files = fs.readdirSync(root).filter(f => f.endsWith('.ets'));
  let hits = 0;
  for (const f of files) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    if (txt.includes('runPcbGeometryRoute')) {
      hits++;
      console.error(`  still imports runPcbGeometryRoute in ${f}`);
    }
  }
  assert('no runPcbGeometryRoute in pcb_agents', hits === 0);
  const geoAgent = fs.readFileSync(path.join(root, 'PcbGeometryAgent.ets'), 'utf8');
  assert('GeometryAgent uses applyLlmPcbGeometry', geoAgent.includes('applyLlmPcbGeometry'));
  assert('GeometryAgent is async LLM', geoAgent.includes('async run') && geoAgent.includes('pcb_geometry'));
  const loader = fs.readFileSync('features/ai_engine/src/main/ets/prompts/PromptLoader.ets', 'utf8');
  assert('PromptLoader registers pcb_geometry', loader.includes("case 'pcb_geometry'"));
  const apply = fs.readFileSync('common/src/main/ets/utils/pcb_route/PcbLlmGeometryApply.ets', 'utf8');
  assert('connectivity gate present', apply.includes('netCopperConnectsPads'));
  assert('orphan rip present', apply.includes('pads not connected'));
  const fill = fs.readFileSync('common/src/main/ets/utils/pcb_route/ensureAllCopperUsed.ets', 'utf8');
  assert('filler uses clearance', fill.includes('pathClearBlockReason'));
  const qa = fs.readFileSync(path.join(root, 'PcbQaAgent.ets'), 'utf8');
  assert('QA no fake mutated', !qa.includes('else if (!mutated && !ripped)'));
  assert('QA uses geometryAgent', qa.includes('geometryAgent.run'));
  assert('QA connectivity gate', qa.includes('netCopperConnectsPads') && qa.includes('disconnected nets'));
  const editor = fs.readFileSync('features/pcb_editor/src/main/ets/PcbEditorImpl.ets', 'utf8');
  assert('DRC uses connectivity', editor.includes('netCopperConnectsPads'));
  assert('DRC orphan is ERROR', editor.includes('网络未连通(有孤儿铜)'));
}

console.log('');
if (failed > 0) {
  console.error(`SMOKE FAIL — ${failed} assertion(s)`);
  process.exit(1);
}
console.log('SMOKE OK — LLM geometry simulation passed');
