/**
 * 数字逻辑检测手布（4 层，每层都有信号走线）：
 *   F.Cu  — 焊盘 stub / 过孔扇出
 *   In1.Cu — LOGIC_H 总线 + H→排针 + Q1/Q2 下廊（GND 仅短桩）
 *   In2.Cu — LOGIC_L 总线 + L→排针 + CLK 下廊（VCC 仅短桩）
 *   B.Cu  — LOGIC_L→U7 下廊 + Q0 上廊
 */
function handLayoutLabDigital(doc) {
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
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const logicH = netByName('LOGIC_H');
  const logicL = netByName('LOGIC_L');
  const clk = netByName('CLK');
  const la = [];
  for (let i = 1; i <= 7; i++) la.push(netByName(`LA_CH${i}`));

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (!pad || !net) return;
    pad.netId = net.id;
    pad.netName = net.name;
  };

  for (let i = 1; i <= 6; i++) {
    const ref = `U${i}`;
    bindPad(ref, 7, gnd);
    bindPad(ref, 14, vcc);
    bindPad(ref, 1, logicH);
    if (i !== 3) bindPad(ref, 2, logicL);
  }
  bindPad('U7', 8, gnd);
  bindPad('U7', 16, vcc);
  bindPad('U7', 13, clk);
  bindPad('U7', 14, logicL);
  bindPad('U7', 15, logicL);
  const qPads = [3, 2, 4, 7, 10, 1, 5];
  for (let i = 0; i < 7; i++) bindPad('U7', qPads[i], la[i]);
  bindPad('RHI', 1, vcc);
  bindPad('RHI', 2, logicH);
  bindPad('RLO', 1, logicL);
  bindPad('RLO', 2, gnd);

  setPos('RHI', 120, 80, 0);
  setPos('RLO', 120, 700, 0);
  for (let i = 0; i < 6; i++) setPos(`U${i + 1}`, 480 + i * 420, 360, 0);
  setPos('U7', 3100, 360, 0);

  const hdr = instantiate('FP_PINHDR_8', 'J1', '1x8', { x: 3420, y: 420 }, 0);
  const hdrNets = [gnd, vcc, logicH, logicL, clk, la[0], la[1], la[2]];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const addVia = (net, p) => {
    if (!net || !p) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 14, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  // 电源：F stub + via + 内层短桩（铺铜连通，不拉长干线抢信号层）
  const toPlane = (net, padPt, dx, dy, plane, w = 14) => {
    if (!net || !padPt) return;
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    add(net, e, {
      x: e.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx || 1) * 35 : 0),
      y: e.y + (Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy || 1) * 35 : 0)
    }, w, plane);
  };
  // 信号：F stub → 指定信号层 manhattan → F
  const routeSig = (net, a, b, layer, w = 12, midY = null) => {
    if (!net || !a || !b) return;
    const ea = { x: a.x, y: a.y + (midY != null && midY < a.y ? -40 : 40) };
    const eb = { x: b.x, y: b.y + (midY != null && midY < b.y ? -40 : 40) };
    add(net, a, ea, w, 'F.Cu');
    addVia(net, ea);
    if (midY != null) {
      L(net, [ea, { x: ea.x, y: midY }, { x: eb.x, y: midY }, eb], w, layer);
    } else {
      L(net, [ea, { x: eb.x, y: ea.y }, eb], w, layer);
    }
    addVia(net, eb);
    add(net, eb, b, w, 'F.Cu');
  };
  // 上下廊扇出：先竖到 runY 再横到 col，避免在焊盘高度横穿整板
  const fanY = (net, src, jPad, layer, runY, colX, escDist = 70) => {
    if (!net || !src || !jPad) return;
    const left = src.x < 3100;
    const esc = { x: src.x + (left ? -escDist : escDist), y: src.y };
    add(net, src, esc, 12, 'F.Cu');
    addVia(net, esc);
    L(net, [
      esc,
      { x: esc.x, y: runY },
      { x: colX, y: runY },
      { x: colX, y: jPad.y }
    ], 12, layer);
    addVia(net, { x: colX, y: jPad.y });
    add(net, { x: colX, y: jPad.y }, jPad, 12, 'F.Cu');
  };

  // —— 电源短桩 ——
  for (let i = 1; i <= 6; i++) {
    toPlane(vcc, pw(`U${i}`, 14), 0, -45, 'In2.Cu', 14); // 上逃，避开 pin1 水平
    const gp = pw(`U${i}`, 7);
    if (gp && gnd) {
      addVia(gnd, gp);
      add(gnd, gp, { x: gp.x, y: gp.y + 45 }, 12, 'In1.Cu');
    }
  }
  toPlane(vcc, pw('U7', 16), 0, -45, 'In2.Cu', 14);
  toPlane(vcc, pw('RHI', 1), 0, -40, 'In2.Cu', 14);
  {
    const gp = pw('U7', 8);
    if (gp && gnd) {
      addVia(gnd, gp);
      add(gnd, gp, { x: gp.x, y: gp.y + 45 }, 12, 'In1.Cu');
    }
  }
  {
    const gp = pw('RLO', 2);
    if (gp && gnd) {
      addVia(gnd, gp);
      add(gnd, gp, { x: gp.x, y: gp.y + 45 }, 12, 'In1.Cu');
    }
  }

  // —— In1：LOGIC_H 总线 + 接到排针 ——
  const hNodes = [];
  const rhi2 = pw('RHI', 2);
  if (rhi2) hNodes.push(rhi2);
  for (let i = 1; i <= 6; i++) {
    const p = pw(`U${i}`, 1);
    if (p) hNodes.push(p);
  }
  let hBusEnd = null;
  if (logicH && hNodes.length >= 2) {
    const busY = Math.min(...hNodes.map(p => p.y)) - 55;
    const vias = [];
    for (const p of hNodes) {
      const e = { x: p.x, y: busY };
      add(logicH, p, { x: p.x, y: p.y - 35 }, 12, 'F.Cu');
      add(logicH, { x: p.x, y: p.y - 35 }, e, 12, 'F.Cu');
      addVia(logicH, e);
      vias.push(e);
    }
    for (let i = 0; i < vias.length - 1; i++) {
      add(logicH, vias[i], vias[i + 1], 12, 'In1.Cu');
    }
    hBusEnd = vias[vias.length - 1];
  }

  // —— In2：LOGIC_L 总线 + 接到排针 ——
  const lNodes = [];
  const rlo1 = pw('RLO', 1);
  if (rlo1) lNodes.push(rlo1);
  for (const ref of ['U1', 'U2', 'U4', 'U5', 'U6']) {
    const p = pw(ref, 2);
    if (p) lNodes.push(p);
  }
  let lBusEnd = null;
  if (logicL && lNodes.length >= 2) {
    const busY = Math.max(...lNodes.map(p => p.y)) + 55;
    const vias = [];
    for (const p of lNodes) {
      const e = { x: p.x, y: busY };
      add(logicL, p, { x: p.x, y: p.y + 35 }, 12, 'F.Cu');
      add(logicL, { x: p.x, y: p.y + 35 }, e, 12, 'F.Cu');
      addVia(logicL, e);
      vias.push(e);
    }
    for (let i = 0; i < vias.length - 1; i++) {
      add(logicL, vias[i], vias[i + 1], 12, 'In2.Cu');
    }
    lBusEnd = vias[vias.length - 1];
  }

  // —— B：LOGIC_L → U7 EN/RST（更深下廊，给 Q 扇出留空）——
  const u6l = pw('U6', 2);
  const u7en = pw('U7', 14);
  const u7rst = pw('U7', 15);
  if (logicL && u6l && u7en) {
    routeSig(logicL, u6l, u7en, 'B.Cu', 12, 1120);
    if (u7rst) add(logicL, u7en, u7rst, 12, 'F.Cu');
  }

  const jGnd = pw('J1', 1);
  const jVcc = pw('J1', 2);
  const jH = pw('J1', 3);
  const jL = pw('J1', 4);
  const jClk = pw('J1', 5);
  const jQ0 = pw('J1', 6);
  const jQ1 = pw('J1', 7);
  const jQ2 = pw('J1', 8);
  if (gnd && jGnd) {
    addVia(gnd, jGnd);
    add(gnd, jGnd, { x: jGnd.x - 35, y: jGnd.y }, 14, 'In1.Cu');
  }
  if (vcc && jVcc) {
    addVia(vcc, jVcc);
    add(vcc, jVcc, { x: jVcc.x - 35, y: jVcc.y }, 14, 'In2.Cu');
  }

  // 总线末端先上廊再进排针
  const busToHdr = (net, busPt, jPad, layer, runY, colX) => {
    if (!net || !busPt || !jPad) return;
    L(net, [
      busPt,
      { x: busPt.x, y: runY },
      { x: colX, y: runY },
      { x: colX, y: jPad.y }
    ], 12, layer);
    addVia(net, { x: colX, y: jPad.y });
    add(net, { x: colX, y: jPad.y }, jPad, 12, 'F.Cu');
  };
  busToHdr(logicH, hBusEnd, jH, 'In1.Cu', 40, 3280);
  busToHdr(logicL, lBusEnd, jL, 'In2.Cu', 160, 3320);

  // 上廊仅 B（无总线横挡）；Q1/Q2 下廊走 In1；CLK 下廊走 In2；L→U7 独享 B 下廊
  fanY(la[0], pw('U7', 3), jQ0, 'B.Cu', 50, 3440, 70);
  fanY(la[1], pw('U7', 2), jQ1, 'In1.Cu', 1000, 3400, 100);
  fanY(la[2], pw('U7', 4), jQ2, 'In1.Cu', 1060, 3480, 140);
  fanY(clk, pw('U7', 13), jClk, 'In2.Cu', 1080, 3360, 110);

  // Q3..Q6 可测短桩（短水平，避开扇出逃逸线）
  for (let i = 3; i < 7; i++) {
    const p = pw('U7', qPads[i]);
    if (p && la[i]) {
      const side = p.x < 3100 ? -1 : 1;
      const e = { x: p.x + side * 28, y: p.y };
      add(la[i], p, e, 12, 'F.Cu');
      addVia(la[i], e);
    }
  }

  const named = [vcc, gnd, logicH, logicL, clk, ...la];
  return {
    trackCount: doc.tracks.length,
    netCount: named.filter(Boolean).length,
    viaCount: doc.vias.length
  };
}
