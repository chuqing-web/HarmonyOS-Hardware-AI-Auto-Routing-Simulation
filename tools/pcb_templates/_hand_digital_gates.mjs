/**
 * 数字门电路实验手布（Cu=4，每层都有走线）：
 *   F.Cu  — 门输出→限流→LED、按键/上拉本地
 *   In1.Cu — INPUT_A 总线 + GND 短桩
 *   In2.Cu — INPUT_B 总线 + VCC 短桩
 *   B.Cu  — CLK / Q0 扇出
 */
function handLayoutLabDigitalGates(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  for (const fp of doc.footprints) {
    const want = fp.refDes === 'U7' ? 'FP_DIP16'
      : /^U[1-6]$/.test(fp.refDes) ? 'FP_DIP14' : null;
    if (!want || fp.defId === want) continue;
    const neu = instantiate(want, fp.refDes, fp.value || fp.refDes, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
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
  const inA = netByName('INPUT_A');
  const inB = netByName('INPUT_B');
  const clk = netByName('CLK');
  const q0 = netByName('Q0');
  const q0Led = netByName('Q0_LED');
  const gateY = [];
  const ledA = [];
  for (let i = 1; i <= 6; i++) {
    gateY[i] = netByName(`GATE_Y${i}`);
    ledA[i] = netByName(`LED_A${i}`);
  }

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  // —— 放置 ——
  setPos('CDEC', 420, 420, 0);
  setPos('RPUA', 420, 900, 0);
  setPos('SWA', 780, 900, 0);
  setPos('RPUB', 420, 1400, 0);
  setPos('SWB', 780, 1400, 0);
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 420, 2600, 0);

  for (let i = 0; i < 6; i++) {
    const x = 1200 + i * 750;
    setPos(`U${i + 1}`, x, 2000, 0);
    setPos(`RL${i + 1}`, x, 1150, 0);
    setPos(`D${i + 1}`, x, 800, 0);
  }

  setPos('U7', 5800, 2000, 0);
  setPos('RQ0', 5450, 1150, 0);
  setPos('DQ0', 5450, 800, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 6200, y: 3000 }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  // —— 绑定（按原理图焊盘号）——
  bindPad('CDEC', 1, vcc); bindPad('CDEC', 2, gnd);
  bindPad('RPUA', 1, vcc); bindPad('RPUA', 2, inA);
  bindPad('SWA', 1, inA); bindPad('SWA', 2, gnd);
  bindPad('RPUB', 1, vcc); bindPad('RPUB', 2, inB);
  bindPad('SWB', 1, inB); bindPad('SWB', 2, gnd);
  bindPad('SG1', 1, clk); bindPad('SG1', 2, gnd);

  for (let i = 1; i <= 6; i++) {
    bindPad(`U${i}`, 14, vcc);
    bindPad(`U${i}`, 7, gnd);
    bindPad(`U${i}`, 1, inA);
    if (i !== 3) bindPad(`U${i}`, 2, inB);
    const yPad = i === 3 ? 2 : 3;
    bindPad(`U${i}`, yPad, gateY[i]);
    bindPad(`RL${i}`, 1, gateY[i]);
    bindPad(`RL${i}`, 2, ledA[i]);
    bindPad(`D${i}`, 1, ledA[i]);
    bindPad(`D${i}`, 2, gnd);
  }

  bindPad('U7', 16, vcc); bindPad('U7', 8, gnd);
  bindPad('U7', 13, clk); bindPad('U7', 14, gnd); bindPad('U7', 15, gnd);
  bindPad('U7', 3, q0);
  bindPad('RQ0', 1, q0); bindPad('RQ0', 2, q0Led);
  bindPad('DQ0', 1, q0Led); bindPad('DQ0', 2, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
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
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
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
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };

  /** F stub → 内层短桩（电源靠铺铜/干线连通） */
  const toPlane = (net, padPt, dx, dy, plane, w = 14) => {
    if (!net || !padPt) return;
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    add(net, e, {
      x: e.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx || 1) * 40 : 0),
      y: e.y + (Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy || 1) * 40 : 0)
    }, w, plane);
  };

  /** 地焊盘：过孔直接进 In1，避免 F 横穿信号扇出 */
  const gndVia = (pad) => {
    if (!gnd || !pad) return;
    addVia(gnd, pad);
    add(gnd, pad, { x: pad.x, y: pad.y + 45 }, 12, 'In1.Cu');
  };
  const vccVia = (pad) => {
    if (!vcc || !pad) return;
    addVia(vcc, pad);
    add(vcc, pad, { x: pad.x, y: pad.y - 45 }, 14, 'In2.Cu');
  };

  /** 多焊盘总线：水平离开左列后再竖到 busY（F），干线走内层 */
  const runBus = (net, pads, busY, layer, sideX) => {
    if (!net || pads.length < 2) return null;
    const vias = [];
    for (const p of pads) {
      if (!p) continue;
      const mid = { x: p.x + sideX, y: p.y };
      const e = { x: mid.x, y: busY };
      add(net, p, mid, 12, 'F.Cu');
      add(net, mid, e, 12, 'F.Cu');
      addVia(net, e);
      vias.push(e);
    }
    vias.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < vias.length; i++) add(net, vias[i], vias[i + 1], 12, layer);
    return vias;
  };

  // —— 本地：按键/上拉 ——
  if (inA && pw('RPUA', 2) && pw('SWA', 1)) add(inA, pw('RPUA', 2), pw('SWA', 1), 12, 'F.Cu');
  if (inB && pw('RPUB', 2) && pw('SWB', 1)) add(inB, pw('RPUB', 2), pw('SWB', 1), 12, 'F.Cu');
  vccVia(pw('RPUA', 1));
  vccVia(pw('RPUB', 1));
  vccVia(pw('CDEC', 1));
  gndVia(pw('SWA', 2));
  gndVia(pw('SWB', 2));
  gndVia(pw('CDEC', 2));
  gndVia(pw('SG1', 2));

  // —— 门输出 → RL → LED：GATE 走 B，避开 INPUT 的 F 扇出 ——
  for (let i = 1; i <= 6; i++) {
    const yPad = i === 3 ? 2 : 3;
    const a = pw(`U${i}`, yPad);
    const r1 = pw(`RL${i}`, 1);
    const r2 = pw(`RL${i}`, 2);
    const d1 = pw(`D${i}`, 1);
    const d2 = pw(`D${i}`, 2);
    if (gateY[i] && a && r1) {
      const ea = { x: a.x - 55, y: a.y };
      const eb = { x: r1.x, y: r1.y + 40 };
      add(gateY[i], a, ea, 12, 'F.Cu');
      addVia(gateY[i], ea);
      L(gateY[i], [ea, { x: ea.x, y: eb.y }, eb], 12, 'B.Cu');
      addVia(gateY[i], eb);
      add(gateY[i], eb, r1, 12, 'F.Cu');
    }
    if (ledA[i] && r2 && d1) {
      add(ledA[i], r2, { x: r2.x, y: d1.y }, 12, 'F.Cu');
      add(ledA[i], { x: r2.x, y: d1.y }, d1, 12, 'F.Cu');
    }
    gndVia(d2);
    vccVia(pw(`U${i}`, 14));
    gndVia(pw(`U${i}`, 7));
  }

  // —— In1：INPUT_A（上廊，扇出列 x-130）——
  const aPads = [pw('RPUA', 2)];
  for (let i = 1; i <= 6; i++) aPads.push(pw(`U${i}`, 1));
  runBus(inA, aPads, 1050, 'In1.Cu', -130);

  // —— In2：INPUT_B（下廊，扇出列 x-130）——
  const bPads = [pw('RPUB', 2)];
  for (const ref of ['U1', 'U2', 'U4', 'U5', 'U6']) bPads.push(pw(ref, 2));
  runBus(inB, bPads, 2750, 'In2.Cu', -130);

  // —— U7 电源 / EN·RST ——
  vccVia(pw('U7', 16));
  gndVia(pw('U7', 8));
  if (gnd && pw('U7', 14) && pw('U7', 15)) {
    const a = pw('U7', 14), b = pw('U7', 15);
    add(gnd, a, { x: a.x + 70, y: a.y }, 12, 'F.Cu');
    add(gnd, { x: a.x + 70, y: a.y }, { x: b.x + 70, y: b.y }, 12, 'F.Cu');
    add(gnd, { x: b.x + 70, y: b.y }, b, 12, 'F.Cu');
    const mid = { x: a.x + 70, y: (a.y + b.y) / 2 };
    addVia(gnd, mid);
    add(gnd, mid, { x: mid.x + 40, y: mid.y }, 12, 'In1.Cu');
  }

  // —— Q0 → LED（B 层，避开 U6）——
  if (q0 && pw('U7', 3) && pw('RQ0', 1)) {
    const a = pw('U7', 3), b = pw('RQ0', 1);
    const ea = { x: a.x - 55, y: a.y };
    const eb = { x: b.x, y: b.y + 40 };
    add(q0, a, ea, 12, 'F.Cu');
    addVia(q0, ea);
    L(q0, [ea, { x: ea.x, y: eb.y }, eb], 12, 'B.Cu');
    addVia(q0, eb);
    add(q0, eb, b, 12, 'F.Cu');
  }
  if (q0Led && pw('RQ0', 2) && pw('DQ0', 1)) {
    add(q0Led, pw('RQ0', 2), { x: pw('RQ0', 2).x, y: pw('DQ0', 1).y }, 12, 'F.Cu');
    add(q0Led, { x: pw('RQ0', 2).x, y: pw('DQ0', 1).y }, pw('DQ0', 1), 12, 'F.Cu');
  }
  gndVia(pw('DQ0', 2));

  // —— B：CLK SG1 → U7 ——
  if (clk && pw('SG1', 1) && pw('U7', 13)) {
    const a = pw('SG1', 1), b = pw('U7', 13);
    const ea = { x: a.x + 80, y: a.y };
    const eb = { x: b.x + 90, y: b.y };
    const runY = 3100;
    add(clk, a, ea, 12, 'F.Cu');
    addVia(clk, ea);
    L(clk, [ea, { x: ea.x, y: runY }, { x: eb.x, y: runY }, eb], 12, 'B.Cu');
    addVia(clk, eb);
    add(clk, eb, b, 12, 'F.Cu');
  }

  // —— 电源排针 ——
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    addVia(gnd, jGnd);
    add(gnd, jGnd, { x: jGnd.x - 50, y: jGnd.y }, 14, 'In1.Cu');
  }
  if (jVcc) {
    addVia(vcc, jVcc);
    add(vcc, jVcc, { x: jVcc.x - 50, y: jVcc.y }, 14, 'In2.Cu');
  }

  const x0 = 80, x1 = 6300;
  add(vcc, { x: x0, y: 160 }, { x: x1, y: 160 }, 20, 'In2.Cu');
  add(gnd, { x: x0, y: 3400 }, { x: x1, y: 3400 }, 20, 'In1.Cu');

  return {
    trackCount: doc.tracks.length,
    netCount: 19,
    viaCount: doc.vias.length
  };
}
