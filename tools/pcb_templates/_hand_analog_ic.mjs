/**
 * 模拟 IC 检测手布（4 层，每层都有走线）：
 *   F.Cu  — 器件间本地短连
 *   In1.Cu — GND 总线 + 上廊 SIG / 下廊 VOUT_R0 扇出
 *   In2.Cu — VCC 总线 + 上廊 LM_OUT / 下廊 BUCK_OUT 扇出
 *   B.Cu  — 绕行（反馈/555）+ 上廊 LM555_OUT / 下廊 DISCH 扇出
 * 铺铜仍由 pourPlanes：In1=GND、In2=VCC、B=GND（走线靠 clearance 避让）。
 */
function handLayoutLabAnalogIc(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  {
    const fp = doc.footprints.find(f => f.refDes === 'U4');
    if (fp && fp.defId !== 'FP_SIP5') {
      const neu = instantiate('FP_SIP5', 'U4', fp.value || 'LM2596', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
    }
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
  const sig = netByName('SIG');
  const bufIn = netByName('BUF_IN');
  const out741 = netByName('OUT741');
  const tlIn = netByName('TL_IN');
  const tlOut = netByName('TL_OUT');
  const u2b = netByName('U2_B_FB');
  const lmIn = netByName('LM_IN');
  const lmFb = netByName('LM_FB');
  const lmOut = netByName('LM_OUT');
  const u3b = netByName('U3_B_FB');
  const vout0 = netByName('VOUT_R0');
  const vout1 = netByName('VOUT_R1');
  const vout2 = netByName('VOUT_R2');
  const buckSw = netByName('BUCK_SW');
  const buckOut = netByName('BUCK_OUT');
  const disch = netByName('DISCH');
  const cap555 = netByName('555_CAP');
  const out555 = netByName('LM555_OUT');
  const led555 = netByName('LED555');
  const ctrl = netByName('CTRL');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (!pad || !net) return;
    pad.netId = net.id;
    pad.netName = net.name;
  };

  bindPad('U1', 2, out741); bindPad('U1', 3, bufIn); bindPad('U1', 4, gnd);
  bindPad('U1', 6, out741); bindPad('U1', 7, vcc);
  bindPad('U2', 1, tlOut); bindPad('U2', 2, tlOut); bindPad('U2', 3, tlIn); bindPad('U2', 4, gnd);
  bindPad('U2', 5, gnd); bindPad('U2', 6, u2b); bindPad('U2', 7, u2b); bindPad('U2', 8, vcc);
  bindPad('U3', 1, lmOut); bindPad('U3', 2, lmFb); bindPad('U3', 3, lmIn); bindPad('U3', 4, gnd);
  bindPad('U3', 5, gnd); bindPad('U3', 6, u3b); bindPad('U3', 7, u3b); bindPad('U3', 8, vcc);
  bindPad('U5', 1, gnd); bindPad('U5', 2, cap555); bindPad('U5', 3, out555);
  bindPad('U5', 4, vcc); bindPad('U5', 5, ctrl); bindPad('U5', 6, cap555);
  bindPad('U5', 7, disch); bindPad('U5', 8, vcc);
  bindPad('U4', 1, vcc); bindPad('U4', 2, buckSw); bindPad('U4', 3, gnd);
  bindPad('U4', 4, buckOut); bindPad('U4', 5, buckOut);
  bindPad('REG1', 1, vcc); bindPad('REG1', 2, gnd); bindPad('REG1', 3, vout0);
  bindPad('REG2', 1, vcc); bindPad('REG2', 2, gnd); bindPad('REG2', 3, vout1);
  bindPad('REG3', 1, vcc); bindPad('REG3', 2, gnd); bindPad('REG3', 3, vout2);

  // 布局：上运放链 / 中 555 / 下稳压+Buck / 右排针
  setPos('R1', 200, 300, 0);
  setPos('U1', 400, 280, 0);
  setPos('R2', 600, 300, 0);
  setPos('U2', 800, 280, 0);
  setPos('R3', 1000, 300, 0);
  setPos('U3', 1200, 280, 0);
  setPos('Rf3', 1480, 150, 0);
  setPos('Rg3', 1000, 480, 0);

  setPos('U5', 1920, 280, 0);
  setPos('RA', 1660, 140, 0);
  setPos('RB', 1660, 300, 0);
  setPos('CT', 1660, 460, 0);
  setPos('CD555', 2180, 100, 0);
  setPos('CC555', 2420, 520, 0);
  setPos('RLED', 2180, 280, 0);
  setPos('D555', 2420, 280, 0);

  for (let i = 0; i < 3; i++) {
    const x = 320 + i * 480;
    setPos(`REG${i + 1}`, x, 820, 0);
    setPos(`CI${i + 1}`, x - 220, 820, 0);
    setPos(`CO${i + 1}`, x + 220, 820, 0);
    setPos(`RL${i + 1}`, x + 220, 960, 0);
  }
  setPos('U4', 1900, 820, 0);
  setPos('CBI', 1540, 820, 0);
  setPos('LB', 2340, 820, 0);
  setPos('CBO', 2540, 820, 0);
  setPos('RFB', 2540, 960, 0);

  const hdr = instantiate('FP_PINHDR_8', 'J1', '1x8', { x: 2860, y: 500 }, 0);
  const hdrNets = [gnd, vcc, sig, lmOut, out555, vout0, buckOut, disch];
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
  // F stub → via → 内层短线（保证 In1/In2 可见走线）
  const toPlane = (net, padPt, dx, dy, plane, w = 14) => {
    if (!net || !padPt) return null;
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    const tip = { x: e.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx || 1) * 50 : 0),
      y: e.y + (Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy || 1) * 50 : 0) };
    if (dist(e, tip) > 0.5) add(net, e, tip, w, plane);
    return e;
  };
  // F stub → via → 指定信号层 manhattan → via → F
  const routeL = (net, a, b, layer, w = 12, dxA = 40, dyA = 0, dxB = 40, dyB = 0, midY = null) => {
    if (!net || !a || !b) return;
    const ea = { x: a.x + dxA, y: a.y + dyA };
    const eb = { x: b.x + dxB, y: b.y + dyB };
    add(net, a, ea, w, 'F.Cu');
    addVia(net, ea);
    if (midY != null) {
      L(net, [ea, { x: ea.x, y: midY }, { x: eb.x, y: midY }, eb], w, layer);
    } else if (Math.abs(ea.x - eb.x) < 0.5 || Math.abs(ea.y - eb.y) < 0.5) {
      add(net, ea, eb, w, layer);
    } else {
      L(net, [ea, { x: ea.x, y: eb.y }, eb], w, layer);
    }
    addVia(net, eb);
    add(net, eb, b, w, 'F.Cu');
  };
  // 排针扇出：上廊 V-first；下廊 H-first（同层最多 1 上+1 下）
  const fanTop = (net, src, jPad, layer, runY, colX) => {
    if (!net || !src || !jPad) return;
    const esc = { x: src.x + 40, y: src.y };
    add(net, src, esc, 12, 'F.Cu');
    addVia(net, esc);
    L(net, [esc, { x: esc.x, y: runY }, { x: colX, y: runY }, { x: colX, y: jPad.y }], 12, layer);
    addVia(net, { x: colX, y: jPad.y });
    add(net, { x: colX, y: jPad.y }, jPad, 12, 'F.Cu');
  };
  const fanBot = (net, src, jPad, layer, colX) => {
    if (!net || !src || !jPad) return;
    const esc = { x: src.x + (src.x < 2600 ? 40 : -40), y: src.y };
    add(net, src, esc, 12, 'F.Cu');
    addVia(net, esc);
    L(net, [esc, { x: colX, y: esc.y }, { x: colX, y: jPad.y }], 12, layer);
    addVia(net, { x: colX, y: jPad.y });
    add(net, { x: colX, y: jPad.y }, jPad, 12, 'F.Cu');
  };

  // —— In2：VCC 短桩 + 顶缘干线（y=40，竖直接线仅接 y≤120 的过孔，避开信号廊）——
  const vccRailY = 40;
  const vccVias = [];
  for (const [ref, num, dx, dy] of [
    ['U1', 7, 40, 0], ['U2', 8, 40, 0], ['U3', 8, 40, 0],
    ['U5', 8, 40, 0], ['U5', 4, 0, 55], ['RA', 1, 0, -40], ['CD555', 1, 0, -40],
    ['CI1', 1, 0, -40], ['CI2', 1, 0, -40], ['CI3', 1, 0, -40],
    ['REG1', 1, -40, 0], ['REG2', 1, -40, 0], ['REG3', 1, -40, 0],
    ['CBI', 1, 0, -40], ['U4', 1, 0, -40]
  ]) {
    const e = toPlane(vcc, pw(ref, num), dx, dy, 'In2.Cu', 14);
    if (e) vccVias.push(e);
  }
  if (vcc && vccVias.length) {
    add(vcc, { x: 180, y: vccRailY }, { x: 2820, y: vccRailY }, 20, 'In2.Cu');
    for (const p of vccVias) {
      if (p.y <= 120) add(vcc, p, { x: p.x, y: vccRailY }, 14, 'In2.Cu');
    }
  }

  // —— In1：GND 短桩（每焊盘可见走线；长总线易穿信号廊）——
  for (const [ref, num] of [
    ['U1', 4], ['U2', 4], ['U2', 5], ['U3', 4], ['U3', 5], ['Rg3', 2],
    ['U5', 1], ['CT', 2], ['CD555', 2], ['CC555', 2], ['D555', 2],
    ['REG1', 2], ['REG2', 2], ['REG3', 2],
    ['CI1', 2], ['CI2', 2], ['CI3', 2], ['CO1', 2], ['CO2', 2], ['CO3', 2],
    ['RL1', 2], ['RL2', 2], ['RL3', 2], ['U4', 3], ['CBI', 2], ['CBO', 2], ['RFB', 2]
  ]) {
    const p = pw(ref, num);
    if (!p || !gnd) continue;
    addVia(gnd, p);
    add(gnd, p, { x: p.x - 50, y: p.y }, 12, 'In1.Cu');
  }
  // In1 左缘 GND 干线（仅连接左半器件，避开右缘扇出列）
  if (gnd) {
    add(gnd, { x: 70, y: 200 }, { x: 70, y: 1000 }, 18, 'In1.Cu');
    for (const refNum of [['U1', 4], ['U2', 4], ['U3', 4], ['REG1', 2], ['CI1', 2]]) {
      const p = pw(refNum[0], refNum[1]);
      if (!p) continue;
      add(gnd, { x: p.x - 50, y: p.y }, { x: 70, y: p.y }, 12, 'In1.Cu');
    }
  }

  // —— F：运放链本地短连 ——
  add(bufIn, pw('R1', 2), pw('U1', 3), 12, 'F.Cu');
  add(tlIn, pw('R2', 2), pw('U2', 3), 12, 'F.Cu');
  add(tlOut, pw('U2', 1), pw('U2', 2), 10, 'F.Cu');
  add(u2b, pw('U2', 7), pw('U2', 6), 10, 'F.Cu');
  add(lmIn, pw('R3', 2), pw('U3', 3), 12, 'F.Cu');
  add(u3b, pw('U3', 7), pw('U3', 6), 10, 'F.Cu');

  // In1：OUT741 反馈 + 到 R2；TL_OUT 到 R3
  {
    const o = pw('U1', 6); const m = pw('U1', 2);
    if (o && m) {
      const ea = { x: o.x + 50, y: o.y }; const em = { x: m.x - 50, y: m.y };
      add(out741, o, ea, 12, 'F.Cu'); addVia(out741, ea);
      L(out741, [ea, { x: ea.x, y: 180 }, { x: em.x, y: 180 }, em], 12, 'In1.Cu');
      addVia(out741, em); add(out741, em, m, 12, 'F.Cu');
    }
  }
  routeL(out741, pw('U1', 6), pw('R2', 1), 'In1.Cu', 12, 55, 0, -45, 0, 200);
  routeL(tlOut, pw('U2', 1), pw('R3', 1), 'In1.Cu', 12, -45, 0, -45, 0, 220);

  // LM_OUT 本地走 B；扇出走 In2（避开 In1 的 SIG/GND）
  {
    const a = pw('U3', 1); const b = pw('Rf3', 2);
    if (a && b) {
      // 先上再左，避开 U3.2 的 LM_FB
      const up = { x: a.x, y: a.y - 50 };
      const ea = { x: a.x - 55, y: a.y - 50 };
      const eb = { x: b.x, y: b.y - 50 };
      add(lmOut, a, up, 12, 'F.Cu'); add(lmOut, up, ea, 12, 'F.Cu'); addVia(lmOut, ea);
      L(lmOut, [ea, { x: ea.x, y: 110 }, { x: eb.x, y: 110 }, eb], 12, 'B.Cu');
      addVia(lmOut, eb); add(lmOut, eb, b, 12, 'F.Cu');
    }
  }
  {
    const a = pw('U3', 2); const b = pw('Rf3', 1);
    if (a && b) {
      // 左逃再下，不穿 U3.1
      const ea = { x: a.x - 90, y: a.y };
      const eb = { x: b.x, y: b.y + 90 };
      add(lmFb, a, ea, 12, 'F.Cu'); addVia(lmFb, ea);
      L(lmFb, [ea, { x: ea.x, y: 560 }, { x: eb.x, y: 560 }, eb], 12, 'B.Cu');
      addVia(lmFb, eb); add(lmFb, eb, b, 12, 'F.Cu');
    }
  }
  routeL(lmFb, pw('Rf3', 1), pw('Rg3', 1), 'B.Cu', 12, 0, 80, 0, -40, 560);

  // —— 555：F stub 错开焊盘列 ——
  add(disch, pw('RA', 2), pw('RB', 1), 12, 'F.Cu');
  {
    const a = pw('RB', 1); const b = pw('U5', 7);
    if (a && b) {
      const ea = { x: a.x, y: a.y + 80 };
      const eb = { x: b.x + 100, y: b.y + 80 };
      add(disch, a, ea, 12, 'F.Cu'); addVia(disch, ea);
      L(disch, [ea, { x: ea.x, y: 400 }, { x: eb.x, y: 400 }, eb], 12, 'B.Cu');
      addVia(disch, eb);
      // 回焊盘：先到焊盘右侧再入，H 不与 pin6 CAP stub 同高抢道
      L(disch, [eb, { x: b.x + 100, y: b.y + 40 }, { x: b.x + 100, y: b.y }, b], 12, 'F.Cu');
    }
  }
  add(cap555, pw('RB', 2), pw('CT', 1), 12, 'F.Cu');
  {
    const a = pw('CT', 1); const b = pw('U5', 2);
    if (a && b) {
      const ea = { x: a.x, y: a.y + 70 };
      const eb = { x: b.x - 55, y: b.y };
      add(cap555, a, ea, 12, 'F.Cu'); addVia(cap555, ea);
      L(cap555, [ea, { x: 2200, y: ea.y }, { x: 2200, y: eb.y }, eb], 12, 'In1.Cu');
      addVia(cap555, eb); add(cap555, eb, b, 12, 'F.Cu');
    }
  }
  {
    const t2 = pw('U5', 2); const t6 = pw('U5', 6);
    if (t2 && t6) {
      const e2 = { x: t2.x - 55, y: t2.y };
      const e6 = { x: t6.x + 60, y: t6.y };
      add(cap555, t2, e2, 12, 'F.Cu'); addVia(cap555, e2);
      L(cap555, [e2, { x: e2.x, y: 540 }, { x: e6.x, y: 540 }, e6], 12, 'In1.Cu');
      addVia(cap555, e6); add(cap555, e6, t6, 12, 'F.Cu');
    }
  }
  {
    const a = pw('U5', 3); const b = pw('RLED', 1);
    if (a && b) {
      L(out555, [
        a, { x: a.x + 70, y: a.y }, { x: a.x + 70, y: a.y - 110 },
        { x: b.x, y: b.y - 110 }, b
      ], 12, 'F.Cu');
    }
  }
  add(led555, pw('RLED', 2), pw('D555', 1), 12, 'F.Cu');
  {
    const a = pw('U5', 5); const b = pw('CC555', 1);
    if (a && b) {
      L(ctrl, [
        a, { x: a.x, y: a.y + 100 }, { x: b.x, y: a.y + 100 }, b
      ], 12, 'F.Cu');
    }
  }

  // —— 稳压 / Buck ——
  for (let i = 1; i <= 3; i++) {
    const vout = i === 1 ? vout0 : i === 2 ? vout1 : vout2;
    add(vout, pw(`REG${i}`, 3), pw(`CO${i}`, 1), 14, 'F.Cu');
    add(vout, pw(`CO${i}`, 1), pw(`RL${i}`, 1), 12, 'F.Cu');
  }
  {
    const a = pw('U4', 2); const b = pw('LB', 1);
    if (a && b) {
      L(buckSw, [a, { x: a.x, y: a.y - 70 }, { x: b.x, y: b.y - 70 }, b], 14, 'F.Cu');
    }
  }
  add(buckOut, pw('LB', 2), pw('CBO', 1), 14, 'F.Cu');
  {
    const a = pw('CBO', 1); const b = pw('U4', 4);
    if (a && b) {
      const ea = { x: a.x - 45, y: a.y + 100 };
      const eb = { x: b.x, y: b.y + 100 };
      add(buckOut, a, ea, 12, 'F.Cu'); addVia(buckOut, ea);
      L(buckOut, [ea, { x: ea.x, y: 980 }, { x: eb.x, y: 980 }, eb], 12, 'B.Cu');
      addVia(buckOut, eb); add(buckOut, eb, b, 12, 'F.Cu');
    }
  }
  add(buckOut, pw('U4', 4), pw('U4', 5), 12, 'F.Cu');
  add(buckOut, pw('CBO', 1), pw('RFB', 1), 12, 'F.Cu');

  // —— 排针 ——
  const jGnd = pw('J1', 1);
  const jVcc = pw('J1', 2);
  const jSig = pw('J1', 3);
  const jLm = pw('J1', 4);
  const j555 = pw('J1', 5);
  const jV0 = pw('J1', 6);
  const jBk = pw('J1', 7);
  const jDs = pw('J1', 8);
  if (gnd && jGnd) {
    addVia(gnd, jGnd);
    add(gnd, jGnd, { x: jGnd.x - 40, y: jGnd.y }, 14, 'In1.Cu');
  }
  if (vcc && jVcc) {
    addVia(vcc, jVcc);
    add(vcc, jVcc, { x: jVcc.x - 40, y: jVcc.y }, 14, 'In2.Cu');
    add(vcc, { x: jVcc.x - 40, y: jVcc.y }, { x: jVcc.x - 40, y: vccRailY }, 14, 'In2.Cu');
    add(vcc, { x: jVcc.x - 40, y: vccRailY }, { x: 2820, y: vccRailY }, 14, 'In2.Cu');
  }

  // In1：SIG 上廊
  fanTop(sig, pw('R1', 1), jSig, 'In1.Cu', 50, 2680);
  // In2：LM_OUT + BUCK（VCC 总线 y=60）
  fanBot(lmOut, pw('Rf3', 2), jLm, 'In2.Cu', 2620);
  fanBot(buckOut, pw('CBO', 1), jBk, 'In2.Cu', 2760);
  // B：LM555 + DISCH 上廊；VOUT 下廊
  fanTop(out555, pw('RLED', 1), j555, 'B.Cu', 160, 2660);
  fanTop(disch, pw('RA', 2), jDs, 'B.Cu', 40, 2800);
  fanBot(vout0, pw('REG1', 3), jV0, 'B.Cu', 2720);

  const named = [
    vcc, gnd, sig, bufIn, out741, tlIn, tlOut, u2b, lmIn, lmFb, lmOut, u3b,
    vout0, vout1, vout2, buckSw, buckOut, disch, cap555, out555, led555, ctrl
  ];
  return {
    trackCount: doc.tracks.length,
    netCount: named.filter(Boolean).length,
    viaCount: doc.vias.length
  };
}
