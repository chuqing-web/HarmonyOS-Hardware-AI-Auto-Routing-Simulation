/**
 * PCB AI 几何引擎冒烟：复现 08-05 LM7805 布局。
 * 对齐：Cu=2 同层 H/V、短网优先、先核心后连接器、异网焊盘全层障碍+端点邻域、
 * 电源/地星型+软臂、板边绕行、安装孔软连通。
 * 运行：node tools/pcb_ai_geo_smoke.mjs
 */
const CLR = 10;
const WIDTH = 20;
const GRID = 5;
const BOARD = { minX: 0, maxX: 1120, minY: 0, maxY: 960 };

const pads = {
  GND: {
    core: [
      { ref: 'C1.2', x: 745, y: 480 },
      { ref: 'U1.2', x: 420, y: 570, th: 1 },
      { ref: 'C2.2', x: 625, y: 480 },
      { ref: 'R1.2', x: 245, y: 720 },
      { ref: 'M1.2', x: 400, y: 720, th: 1 },
    ],
    conn: [{ ref: 'J1.1', x: 960, y: 330, th: 1 }],
    mount: [
      { ref: 'H1', x: 20, y: 20, th: 1 },
      { ref: 'H2', x: 1100, y: 20, th: 1 },
      { ref: 'H3', x: 20, y: 940, th: 1 },
      { ref: 'H4', x: 1100, y: 940, th: 1 },
    ],
    kind: 'gnd',
  },
  VCC: {
    core: [{ ref: 'F1.1', x: 760, y: 480 }],
    conn: [{ ref: 'J1.2', x: 960, y: 430, th: 1 }],
    mount: [],
    kind: 'power',
  },
  REG_IN: {
    core: [
      { ref: 'F1.2', x: 880, y: 480 },
      { ref: 'C1.1', x: 655, y: 480 },
      { ref: 'U1.1', x: 330, y: 480, th: 1 },
    ],
    conn: [{ ref: 'J1.3', x: 960, y: 530, th: 1 }],
    mount: [],
    kind: 'signal',
  },
  VOUT: {
    core: [
      { ref: 'U1.3', x: 510, y: 480, th: 1 },
      { ref: 'C2.1', x: 535, y: 480 },
      { ref: 'R1.1', x: 155, y: 720 },
      { ref: 'M1.1', x: 300, y: 720, th: 1 },
    ],
    conn: [{ ref: 'J1.4', x: 960, y: 630, th: 1 }],
    mount: [],
    kind: 'signal',
  },
};

const allForeign = [];
for (const [net, g] of Object.entries(pads)) {
  for (const p of [...g.core, ...g.conn, ...g.mount]) {
    allForeign.push({ ...p, net, padR: p.th ? 30 : 25 });
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function distPointSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function pathClear(a, b, netId, tracks) {
  const need = CLR + WIDTH / 2;
  for (const t of tracks) {
    if (t.net === netId) continue;
    const d = Math.min(
      distPointSeg(a, t.a, t.b), distPointSeg(b, t.a, t.b),
      distPointSeg(t.a, a, b), distPointSeg(t.b, a, b)
    );
    if (d < need + WIDTH / 2) return `track ${t.net}`;
  }
  for (const p of allForeign) {
    if (p.net === netId) continue;
    const thr = need + p.padR;
    if (dist(p, a) < thr || dist(p, b) < thr) continue;
    if (distPointSeg(p, a, b) < thr) return `pad ${p.ref}`;
  }
  return null;
}
function snap(v) { return Math.round(v / GRID) * GRID; }

function tryL(a, b, net, tracks) {
  const cands = [
    [a, { x: snap(b.x), y: snap(a.y) }, b],
    [a, { x: snap(a.x), y: snap(b.y) }, b],
  ];
  for (const m of [2, 4, 8, 12, 16, 24, 32, 48, 64, 80]) {
    const j = GRID * m;
    cands.push(
      [a, { x: snap(a.x), y: snap(a.y + j) }, { x: snap(b.x), y: snap(a.y + j) }, b],
      [a, { x: snap(a.x), y: snap(a.y - j) }, { x: snap(b.x), y: snap(a.y - j) }, b],
      [a, { x: snap(a.x + j), y: snap(a.y) }, { x: snap(a.x + j), y: snap(b.y) }, b],
      [a, { x: snap(a.x - j), y: snap(a.y) }, { x: snap(a.x - j), y: snap(b.y) }, b]
    );
  }
  const m = 40;
  const left = BOARD.minX + m, right = BOARD.maxX - m;
  const top = BOARD.minY + m, bot = BOARD.maxY - m;
  cands.push(
    [a, { x: snap(a.x), y: top }, { x: left, y: top }, { x: left, y: snap(b.y) }, b],
    [a, { x: snap(a.x), y: bot }, { x: right, y: bot }, { x: right, y: snap(b.y) }, b],
    [a, { x: snap(a.x), y: bot }, { x: left, y: bot }, { x: left, y: snap(b.y) }, b],
    [a, { x: snap(a.x), y: top }, { x: right, y: top }, { x: right, y: snap(b.y) }, b]
  );
  for (const pts of cands) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      if (dist(p0, p1) < 0.5) continue;
      segs.push({ a: p0, b: p1 });
    }
    let ok = true;
    for (const s of segs) {
      if (pathClear(s.a, s.b, net, tracks)) { ok = false; break; }
    }
    if (ok) {
      for (const s of segs) tracks.push({ ...s, net });
      return true;
    }
  }
  return false;
}

function nearest(from, cands) {
  let best = cands[0], bd = Infinity;
  for (const c of cands) {
    const d = dist(from, c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function pickHub(core) {
  let hub = core[0], hubScore = -1;
  for (const c of core) {
    let score = 0;
    for (const o of core) {
      if (o === c) continue;
      score += 1 / (1 + dist(c, o));
    }
    if (score > hubScore) { hubScore = score; hub = c; }
  }
  return hub;
}

const tracks = [];
const failed = [];
const names = Object.keys(pads);
names.sort((a, b) => {
  const ga = pads[a], gb = pads[b];
  const ca = Math.max(ga.core.length, 1) + (ga.core.length < 2 ? ga.conn.length : 0);
  const cb = Math.max(gb.core.length, 1) + (gb.core.length < 2 ? gb.conn.length : 0);
  if (ca !== cb) return ca - cb;
  const rank = (k) => (k === 'signal' ? 0 : k === 'power' ? 1 : 2);
  return rank(ga.kind) - rank(gb.kind);
});

const pending = [];
for (const n of names) {
  const g = pads[n];
  let core = g.core;
  let deferConn = true;
  if (core.length < 2) {
    core = g.core.concat(g.conn);
    deferConn = false;
  }
  const snap0 = tracks.length;
  let ok = true;
  if ((g.kind === 'gnd' || g.kind === 'power') && core.length >= 3) {
    const hub = pickHub(core);
    const connected = [hub];
    const pendingPads = core.filter(p => dist(p, hub) >= 0.5);
    let progress = true;
    while (pendingPads.length && progress) {
      progress = false;
      for (let pi = pendingPads.length - 1; pi >= 0; pi--) {
        const target = pendingPads[pi];
        const hubsTry = connected.slice().sort((p, q) => dist(p, target) - dist(q, target));
        let linked = false;
        for (const h of hubsTry) {
          if (tryL(h, target, n, tracks)) {
            connected.push(target);
            pendingPads.splice(pi, 1);
            linked = true;
            progress = true;
            break;
          }
        }
        if (!linked) { /* retry next round */ }
      }
    }
    for (const p of pendingPads) console.log('soft unreachable', n, p.ref);
    ok = connected.length >= 2;
  } else {
    // NN for signals / short
    const left = core.slice(1);
    const ordered = [core[0]];
    while (left.length) {
      const cur = ordered[ordered.length - 1];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) {
        const d = dist(cur, left[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      ordered.push(left.splice(bi, 1)[0]);
    }
    for (let i = 0; i < ordered.length - 1; i++) {
      if (!tryL(ordered[i], ordered[i + 1], n, tracks)) {
        if (g.kind === 'gnd' || g.kind === 'power') continue;
        ok = false;
        break;
      }
    }
    if ((g.kind === 'gnd' || g.kind === 'power') && tracks.length === snap0) ok = false;
  }
  if (!ok) {
    tracks.length = snap0;
    failed.push(n);
    continue;
  }
  if (deferConn && g.conn.length) pending.push(n);
  else for (const m of g.mount) tryL(m, nearest(m, g.core), n, tracks);
}

for (const n of pending) {
  if (failed.includes(n)) continue;
  const g = pads[n];
  for (const c of g.conn) {
    if (!tryL(nearest(c, g.core), c, n, tracks)) {
      if (g.kind === 'gnd' || g.kind === 'power') console.log('soft conn', n, c.ref);
      else {
        for (let i = tracks.length - 1; i >= 0; i--) if (tracks[i].net === n) tracks.splice(i, 1);
        failed.push(n);
        break;
      }
    }
  }
  for (const m of g.mount) tryL(m, nearest(m, g.core), n, tracks);
}

console.log({ order: names, failed, tracks: tracks.length });
if (failed.length > 0) {
  console.error('SMOKE FAIL');
  process.exit(1);
}
console.log('SMOKE OK');
