/**
 * STM32 全系列手布：五列最小系统。
 * U1 F103C8=QFP48 / U2 F103RC=QFP64 / U3 F407=QFP100 / U4 L431=TSSOP20 / U5 F030=TSSOP20
 * Cu=6，每层都有走线：
 *   F.Cu  — 晶振 / LED / 复位短连
 *   In1.Cu — VCC 水平干线
 *   In2.Cu — GND 水平干线
 *   In3.Cu — VCC 竖直馈线
 *   In4.Cu — GND 竖直馈线
 *   B.Cu  — 排针与平行电源补线
 */
function handLayoutLabMcuStm32(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };

  const COLS = [
    { val: 'STM32F103C8', fp: 'FP_QFP48', w: 1500,
      p: { oscIn: '5', oscOut: '6', nrst: '7', gnd: '23', vdd: '24', pa0: '10' } },
    { val: 'STM32F103RC', fp: 'FP_QFP64', w: 1700,
      p: { oscIn: '5', oscOut: '6', nrst: '7', gnd: '22', vdd: '23', pa0: '14' } },
    { val: 'STM32F407VG', fp: 'FP_QFP100', w: 2100,
      p: { oscIn: '12', oscOut: '13', nrst: '14', gnd: '18', vdd: '19', pa0: '23' } },
    { val: 'STM32L431CB', fp: 'FP_TSSOP20', w: 1200,
      p: { oscIn: '2', oscOut: '3', nrst: '4', gnd: '15', vdd: '16', pa0: '6' } },
    { val: 'STM32F030F4', fp: 'FP_TSSOP20', w: 1200,
      p: { oscIn: '2', oscOut: '3', nrst: '4', gnd: '15', vdd: '16', pa0: '6' } }
  ];

  for (let i = 0; i < COLS.length; i++) {
    forceFp(`U${i + 1}`, COLS[i].fp, COLS[i].val);
    forceFp(`Y${i + 1}`, 'FP_HC49', '8M');
  }

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const uy = 1600;
  const gndBusY = uy + 1300;
  const vccBusY = uy - 1300;
  const colXs = [];
  let ox = 700;
  for (let i = 0; i < COLS.length; i++) {
    colXs.push(ox);
    ox += COLS[i].w;
  }

  for (let i = 0; i < COLS.length; i++) {
    const ux = colXs[i];
    const { p } = COLS[i];
    const u = `U${i + 1}`;
    const half = halfExtents(COLS[i].fp).halfW;
    const leftX = ux - half - 40;
    const rightX = ux + half + 40;
    const xtal1 = netByName(`S${i}_XTAL1`);
    const xtal2 = netByName(`S${i}_XTAL2`);
    const nrst = netByName(`S${i}_NRST`);
    const ledR = netByName(`L${i}_R`);
    const ledA = netByName(`L${i}_LED`);

    setPos(u, ux, uy, 0);
    // 晶振水平放置：两脚不同 X，XTAL1/2 各走一柱
    setPos(`Y${i + 1}`, leftX - 280, uy - 160, 0);
    setPos(`CX${i}1`, leftX - 340, uy - 320, 180);
    setPos(`CX${i}2`, leftX - 220, uy - 320, 180);
    // 复位：R 更靠下，NRST 水平带远离 OSC
    setPos(`R${i + 1}`, leftX - 160, uy + 200, 180);
    setPos(`CD${i + 1}`, rightX + 40, uy - 80, 0);
    setPos(`RL${i + 1}`, leftX - 200, uy + 320, 0);
    setPos(`D${i + 1}`, leftX - 420, uy + 320, 0);

    bindPad(u, p.oscIn, xtal1);
    bindPad(u, p.oscOut, xtal2);
    bindPad(u, p.nrst, nrst);
    bindPad(u, p.gnd, gnd);
    bindPad(u, p.vdd, vcc);
    bindPad(u, p.pa0, ledR);

    const y = byRef.get(`Y${i + 1}`);
    if (y) {
      const p1 = y.pads.find(pp => pp.number === '1');
      const p2 = y.pads.find(pp => pp.number === '2');
      if (p1 && xtal1) { p1.netId = xtal1.id; p1.netName = xtal1.name; }
      if (p2 && xtal2) { p2.netId = xtal2.id; p2.netName = xtal2.name; }
    }
    bindPad(`CX${i}1`, 1, xtal1); bindPad(`CX${i}1`, 2, gnd);
    bindPad(`CX${i}2`, 1, xtal2); bindPad(`CX${i}2`, 2, gnd);
    bindPad(`R${i + 1}`, 1, nrst); bindPad(`R${i + 1}`, 2, vcc);
    bindPad(`CD${i + 1}`, 1, vcc); bindPad(`CD${i + 1}`, 2, gnd);
    bindPad(`RL${i + 1}`, 1, ledR); bindPad(`RL${i + 1}`, 2, ledA);
    bindPad(`D${i + 1}`, 1, ledA); bindPad(`D${i + 1}`, 2, gnd);
  }

  const hdrX = ox + 80;
  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: hdrX, y: uy }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(pp => pp.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };
  const escOut = (net, padPt, ux, distN = 55, w = 12) => {
    const dx = padPt.x - ux;
    const dy = padPt.y - uy;
    let ex = 0, ey = 0;
    if (Math.abs(dx) >= Math.abs(dy)) ex = dx >= 0 ? distN : -distN;
    else ey = dy >= 0 ? distN : -distN;
    return esc(net, padPt, ex, ey, w);
  };

  const x0 = 60;
  const x1 = hdrX + 120;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  add(vcc, { x: x0, y: vccBusY + 50 }, { x: x1, y: vccBusY + 50 }, 16, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 50 }, { x: x1, y: gndBusY - 50 }, 16, 'B.Cu');

  for (let i = 0; i < COLS.length; i++) {
    const ux = colXs[i];
    const { p } = COLS[i];
    const half = halfExtents(COLS[i].fp).halfW;
    const leftX = ux - half - 40;
    const rightX = ux + half + 40;
    const u = `U${i + 1}`;
    const xtal1 = netByName(`S${i}_XTAL1`);
    const xtal2 = netByName(`S${i}_XTAL2`);
    const nrst = netByName(`S${i}_NRST`);
    const ledR = netByName(`L${i}_R`);
    const ledA = netByName(`L${i}_LED`);

    const vccFeedX = rightX + 200;
    const gndFeedL = leftX - 200;
    const gndFeedR = rightX + 40;
    const vccFeedL = leftX - 400;

    const uGnd = pw(u, p.gnd), uVcc = pw(u, p.vdd);
    const uRst = pw(u, p.nrst), uX1 = pw(u, p.oscIn), uX2 = pw(u, p.oscOut);
    const uPa0 = pw(u, p.pa0);
    const yA = pw(`Y${i + 1}`, 1), yB = pw(`Y${i + 1}`, 2);
    const cx1a = pw(`CX${i}1`, 1), cx1b = pw(`CX${i}1`, 2);
    const cx2a = pw(`CX${i}2`, 1), cx2b = pw(`CX${i}2`, 2);
    const r1a = pw(`R${i + 1}`, 1), r1b = pw(`R${i + 1}`, 2);
    const cda = pw(`CD${i + 1}`, 1), cdb = pw(`CD${i + 1}`, 2);
    const rlA = pw(`RL${i + 1}`, 1), rlB = pw(`RL${i + 1}`, 2);
    const dA = pw(`D${i + 1}`, 1), dK = pw(`D${i + 1}`, 2);

    // 晶振：两脚 fanout 分走 B / In1，F 仅留焊盘短桩，避免水平穿叠
    if (xtal1 && uX1 && yA) {
      const e = esc(xtal1, uX1, -50, 0, 12);
      add(xtal1, e, { x: yA.x, y: e.y }, 12, 'B.Cu');
      addVia(xtal1, { x: yA.x, y: e.y });
      add(xtal1, { x: yA.x, y: e.y }, yA, 12, 'F.Cu');
    }
    if (xtal2 && uX2 && yB) {
      const e = esc(xtal2, uX2, -55, 0, 12);
      add(xtal2, e, { x: yB.x, y: e.y }, 12, 'In1.Cu');
      addVia(xtal2, { x: yB.x, y: e.y });
      add(xtal2, { x: yB.x, y: e.y }, yB, 12, 'F.Cu');
    }
    if (xtal1 && yA && cx1a) {
      add(xtal1, yA, { x: yA.x, y: cx1a.y }, 12, 'F.Cu');
      add(xtal1, { x: yA.x, y: cx1a.y }, cx1a, 12, 'F.Cu');
    }
    if (xtal2 && yB && cx2a) {
      add(xtal2, yB, { x: yB.x, y: cx2a.y }, 12, 'F.Cu');
      add(xtal2, { x: yB.x, y: cx2a.y }, cx2a, 12, 'F.Cu');
    }

    for (const pad of [cx1b, cx2b]) {
      if (!pad) continue;
      const e = esc(gnd, pad, 0, 55, 12);
      add(gnd, e, { x: gndFeedL, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedL, y: gndBusY });
    }

    if (uGnd) {
      // 底边/侧边焊盘：GND 与 VCC 反方向逃逸，避免同带重叠
      const e = esc(gnd, uGnd, -70, 0, 14);
      add(gnd, e, { x: gndFeedL, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedL, y: gndBusY });
    }
    if (uVcc) {
      const e = esc(vcc, uVcc, 70, 0, 14);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }

    if (cdb) {
      const e = esc(gnd, cdb, 60, 0, 12);
      add(gnd, e, { x: gndFeedR, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedR, y: e.y }, { x: gndFeedR, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedR, y: gndBusY });
      add(gnd, { x: gndFeedR, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    if (dK) {
      const e = esc(gnd, dK, -55, 0, 12);
      add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: e.x, y: gndBusY });
      add(gnd, { x: e.x, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    // 复位：在 MCU 焊盘列外侧竖走，避免与 PA0 同 X 对穿
    if (nrst && r1a && uRst) {
      const colX = Math.min(r1a.x, uRst.x) - 50;
      add(nrst, r1a, { x: colX, y: r1a.y }, 12, 'F.Cu');
      add(nrst, { x: colX, y: r1a.y }, { x: colX, y: uRst.y }, 12, 'F.Cu');
      add(nrst, { x: colX, y: uRst.y }, uRst, 12, 'F.Cu');
    }
    if (r1b) {
      const e = esc(vcc, r1b, -60, 0, 12);
      add(vcc, e, { x: vccFeedL, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedL, y: vccBusY });
      add(vcc, { x: vccFeedL, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
    }

    if (cda) {
      const e = esc(vcc, cda, 55, 0, 12);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }

    if (ledR && uPa0 && rlA) {
      const e = esc(ledR, uPa0, -60, 0, 12);
      const jx = rlA.x - 80;
      add(ledR, e, { x: e.x, y: rlA.y + 90 }, 12, 'B.Cu');
      add(ledR, { x: e.x, y: rlA.y + 90 }, { x: jx, y: rlA.y + 90 }, 12, 'B.Cu');
      addVia(ledR, { x: jx, y: rlA.y + 90 });
      add(ledR, { x: jx, y: rlA.y + 90 }, { x: jx, y: rlA.y }, 12, 'F.Cu');
      add(ledR, { x: jx, y: rlA.y }, rlA, 12, 'F.Cu');
    }
    if (ledA && rlB && dA) {
      const e1 = esc(ledA, rlB, 0, 70, 12);
      const e2 = esc(ledA, dA, 0, 70, 12);
      add(ledA, e1, e2, 12, 'B.Cu');
    }

    addVia(vcc, { x: vccFeedX, y: vccBusY });
    addVia(gnd, { x: gndFeedL, y: gndBusY });
  }

  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY - 50 }, 14, 'B.Cu');
    addVia(gnd, { x: e.x, y: gndBusY - 50 });
    add(gnd, { x: e.x, y: gndBusY - 50 }, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
    add(gnd, { x: e.x, y: gndBusY }, { x: x1, y: gndBusY }, 14, 'In2.Cu');
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -120, 0, 14);
    add(vcc, e, { x: e.x, y: vccBusY + 50 }, 14, 'B.Cu');
    addVia(vcc, { x: e.x, y: vccBusY + 50 });
    add(vcc, { x: e.x, y: vccBusY + 50 }, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
    add(vcc, { x: e.x, y: vccBusY }, { x: x1, y: vccBusY }, 14, 'In1.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 27,
    viaCount: doc.vias.length
  };
}
