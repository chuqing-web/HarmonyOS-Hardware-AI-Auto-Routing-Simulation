/**
 * 仪器仪表实验手布：信号源/电表/示波器/逻辑分析仪/UART + CD4017。
 * 虚拟仪器以排针探针形式落板。Cu=6，每层都有走线：
 *   F.Cu  — 本地短连 + 短扇出到唯一列
 *   In1.Cu — VCC 干线 + 部分信号水平干线
 *   In2.Cu — GND 干线 + 部分信号水平干线
 *   In3.Cu — VCC 竖馈 + 信号竖直（唯一列）
 *   In4.Cu — GND 竖馈
 *   B.Cu  — 部分信号水平干线 + 电源边线
 */
function handLayoutLabInstruments(doc) {
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

  forceFp('U7', 'FP_DIP16', 'CD4017');
  forceFp('RV1', 'FP_POT3', 'POT_10k');

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
  const amOut = netByName('AM_OUT');
  const hi = netByName('HI');
  const top = netByName('TOP');
  const mid = netByName('MID');
  const clk = netByName('CLK');
  const dmmA = netByName('DMM_A');
  const dmmARet = netByName('DMM_A_RET');
  const dmmOhm = netByName('DMM_OHM');
  const logicL = netByName('LOGIC_L');
  const uartLb = netByName('UART_LB');
  const laCh = [];
  for (let i = 1; i <= 7; i++) laCh[i] = netByName(`LA_CH${i}`);

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

  const gndBusY = 3800;
  const vccBusY = 200;

  // —— 放置 ——
  // 左：电源链 SG / A1 / PM1
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 600, 900, 0);
  addProbe('A1', 'FP_THT2', 'AMMETER', 600, 1400, 0);
  addProbe('PM1', 'FP_PINHDR_4', 'PWR_METER', 600, 2000, 0);

  // 中上：分压 + 电压表
  setPos('R1', 1600, 1400, 0);
  setPos('RV1', 2100, 1400, 0);
  addProbe('M1', 'FP_THT2', 'VOLTMETER', 2600, 1400, 0);

  // 中：万用表支路（VM 与电阻列错开 X，避免竖线共柱）
  addProbe('VM1', 'FP_PINHDR_4', 'DMM', 3000, 900, 0);
  setPos('RAMP', 3600, 1600, 0);
  setPos('DAMP', 4000, 1600, 0);
  setPos('ROHM', 3600, 2200, 0);
  setPos('DOHM', 4000, 2200, 0);
  addProbe('FC1', 'FP_THT2', 'FREQ', 4000, 2700, 0);

  // 右：示波器 / CD4017 / LA / UART
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 4200, 700, 0);
  setPos('U7', 4800, 2000, 0);
  addProbe('LA1', 'FP_PINHDR_10', 'LA', 6400, 2000, 0);
  addProbe('TERM1', 'FP_PINHDR_4', 'UART', 6400, 900, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 6800, y: 3400 }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  // —— 绑定 ——
  bindPad('SG1', 1, clk); bindPad('SG1', 2, gnd);
  bindPad('A1', 1, vcc); bindPad('A1', 2, amOut);
  bindPad('PM1', 1, amOut); bindPad('PM1', 2, hi);
  bindPad('PM1', 3, hi); bindPad('PM1', 4, gnd);

  bindPad('R1', 1, hi); bindPad('R1', 2, top);
  bindPad('RV1', 1, top); bindPad('RV1', 2, mid); bindPad('RV1', 3, gnd);
  bindPad('M1', 1, mid); bindPad('M1', 2, gnd);

  bindPad('VM1', 1, clk); bindPad('VM1', 2, dmmARet);
  bindPad('VM1', 3, dmmOhm); bindPad('VM1', 4, gnd);
  bindPad('RAMP', 1, vcc); bindPad('RAMP', 2, dmmA);
  bindPad('DAMP', 1, dmmA); bindPad('DAMP', 2, dmmARet);
  bindPad('ROHM', 1, dmmOhm); bindPad('ROHM', 2, gnd);
  bindPad('DOHM', 1, dmmOhm); bindPad('DOHM', 2, gnd);
  bindPad('FC1', 1, clk); bindPad('FC1', 2, gnd);

  bindPad('OSC1', 1, clk); bindPad('OSC1', 2, hi);
  bindPad('OSC1', 3, mid); bindPad('OSC1', 4, top);
  bindPad('OSC1', 5, gnd);

  // CD4017
  bindPad('U7', 16, vcc); bindPad('U7', 8, gnd);
  bindPad('U7', 13, clk); bindPad('U7', 14, logicL); bindPad('U7', 15, logicL);
  bindPad('U7', 3, laCh[1]);  // Q0
  bindPad('U7', 2, laCh[2]);  // Q1
  bindPad('U7', 4, laCh[3]);  // Q2
  bindPad('U7', 7, laCh[4]);  // Q3
  bindPad('U7', 10, laCh[5]); // Q4
  bindPad('U7', 1, laCh[6]);  // Q5
  bindPad('U7', 5, laCh[7]);  // Q6
  bindPad('RLO', 1, logicL); bindPad('RLO', 2, gnd);

  for (let i = 1; i <= 7; i++) bindPad('LA1', i, laCh[i]);
  bindPad('LA1', 8, clk); bindPad('LA1', 9, gnd);

  bindPad('TERM1', 1, uartLb); bindPad('TERM1', 2, uartLb); bindPad('TERM1', 3, gnd);

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

  let escSlot = 0;
  const usedCols = [];
  const usedTrunkY = [];
  const colTaken = (x) => usedCols.some(c => Math.abs(c - x) < 48);
  const pickCol = (baseX, slot) => {
    let x = Math.round(baseX + ((slot % 2 === 0) ? -1 : 1) * (50 + (slot % 7) * 24));
    let guard = 0;
    while (colTaken(x) && guard++ < 80) x += (x >= baseX ? 48 : -48);
    usedCols.push(x);
    return x;
  };
  const pickTrunkY = (baseY) => {
    let y = Math.round(baseY);
    let guard = 0;
    while (usedTrunkY.some(r => Math.abs(r - y) < 48) && guard++ < 80) y += 48;
    usedTrunkY.push(y);
    return y;
  };
  /** F 短引出到唯一列；In3 竖直；干线按 slot 分到 B/In1/In2（每层都有信号） */
  const fan = (net, pad, dir, slot) => {
    const step = 120 + (slot % 5) * 28;
    let prefer = pad.x;
    if (dir === 'L') prefer -= step;
    else if (dir === 'R') prefer += step;
    else prefer += ((slot % 2 === 0) ? -1 : 1) * step;
    const x = pickCol(prefer, slot);
    let y = pad.y;
    if (dir === 'U') y -= step;
    else if (dir === 'D') y += step;
    if (dir === 'L' || dir === 'R') {
      add(net, pad, { x, y: pad.y }, 12, 'F.Cu');
      y = pad.y;
    } else if (Math.abs(x - pad.x) > 0.5) {
      add(net, pad, { x: pad.x, y }, 12, 'F.Cu');
      add(net, { x: pad.x, y }, { x, y }, 12, 'F.Cu');
    } else {
      add(net, pad, { x, y }, 12, 'F.Cu');
    }
    addVia(net, { x, y });
    return { x, y };
  };
  const trunkLayer = (slot) => {
    const m = slot % 3;
    if (m === 0) return 'B.Cu';
    if (m === 1) return 'In1.Cu';
    return 'In2.Cu';
  };
  const runSig = (net, fromPad, toPad, chanY, fromDir, toDir) => {
    if (!net || !fromPad || !toPad) return;
    const slot = escSlot++;
    const a0 = fan(net, fromPad, fromDir, slot);
    const b0 = fan(net, toPad, toDir, slot + 2);
    const ty = pickTrunkY(chanY);
    const tl = trunkLayer(slot);
    add(net, a0, { x: a0.x, y: ty }, 12, 'In3.Cu');
    addVia(net, { x: a0.x, y: ty });
    add(net, b0, { x: b0.x, y: ty }, 12, 'In3.Cu');
    addVia(net, { x: b0.x, y: ty });
    add(net, { x: a0.x, y: ty }, { x: b0.x, y: ty }, 12, tl);
  };

  const feedVcc = (pad, dx, dy) => {
    if (!vcc || !pad) return;
    const e = esc(vcc, pad, dx, dy, 12);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  };
  const feedGnd = (pad, dx, dy) => {
    if (!gnd || !pad) return;
    const e = esc(gnd, pad, dx, dy, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  };

  const x0 = 60, x1 = 7000;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  add(vcc, { x: x0, y: vccBusY + 70 }, { x: x1, y: vccBusY + 70 }, 14, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 70 }, { x: x1, y: gndBusY - 70 }, 14, 'B.Cu');
  usedTrunkY.push(vccBusY, gndBusY, vccBusY + 70, gndBusY - 70, 560);

  // —— 电源链本地 ——
  feedVcc(pw('A1', 1), 0, -70);
  if (amOut && pw('A1', 2) && pw('PM1', 1)) {
    const a = pw('A1', 2), b = pw('PM1', 1);
    add(amOut, a, { x: a.x, y: b.y }, 12, 'F.Cu');
    add(amOut, { x: a.x, y: b.y }, b, 12, 'F.Cu');
  }
  // HI: PM1.2 → R1.1 本地；PM1.3 同网短连
  if (hi && pw('PM1', 2) && pw('PM1', 3)) add(hi, pw('PM1', 2), pw('PM1', 3), 12, 'F.Cu');
  if (hi && pw('PM1', 2) && pw('R1', 1)) {
    const a = pw('PM1', 2), b = pw('R1', 1);
    add(hi, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(hi, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  feedGnd(pw('PM1', 4), 70, 0);
  // SG：地向下，CLK 向上引出再进总线，避免共 Y
  if (clk && pw('SG1', 1)) {
    add(clk, pw('SG1', 1), { x: pw('SG1', 1).x, y: pw('SG1', 1).y - 80 }, 12, 'F.Cu');
  }
  feedGnd(pw('SG1', 2), 0, 100);

  // TOP / MID 本地分压
  if (top && pw('R1', 2) && pw('RV1', 1)) add(top, pw('R1', 2), pw('RV1', 1), 12, 'F.Cu');
  if (mid && pw('RV1', 2) && pw('M1', 1)) {
    const a = pw('RV1', 2), b = pw('M1', 1);
    add(mid, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(mid, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  feedGnd(pw('RV1', 3), 0, 70);
  feedGnd(pw('M1', 2), 0, 70);

  // DMM 支路本地（正交，不共柱）
  feedVcc(pw('RAMP', 1), -80, 0);
  if (dmmA && pw('RAMP', 2) && pw('DAMP', 1)) add(dmmA, pw('RAMP', 2), pw('DAMP', 1), 12, 'F.Cu');
  if (dmmARet && pw('DAMP', 2) && pw('VM1', 2)) {
    const a = pw('DAMP', 2), b = pw('VM1', 2);
    add(dmmARet, a, { x: a.x, y: b.y }, 12, 'F.Cu');
    add(dmmARet, { x: a.x, y: b.y }, b, 12, 'F.Cu');
  }
  // DMM_OHM：VM→ROHM 走内层，避免 F 长竖穿越 LA 扇出
  runSig(dmmOhm, pw('VM1', 3), pw('ROHM', 1), 2480, 'R', 'U');
  // OHM 桥接在地引出下方
  if (dmmOhm && pw('ROHM', 1) && pw('DOHM', 1)) {
    const a = pw('ROHM', 1), b = pw('DOHM', 1);
    const y = Math.max(a.y, b.y) + 140;
    add(dmmOhm, a, { x: a.x, y }, 12, 'F.Cu');
    add(dmmOhm, { x: a.x, y }, { x: b.x, y }, 12, 'F.Cu');
    add(dmmOhm, { x: b.x, y }, b, 12, 'F.Cu');
  }
  feedGnd(pw('ROHM', 2), 90, 0);
  feedGnd(pw('DOHM', 2), 90, 0);
  feedGnd(pw('VM1', 4), 80, 0);
  feedGnd(pw('FC1', 2), 0, 80);

  // UART 环回
  if (uartLb && pw('TERM1', 1) && pw('TERM1', 2)) add(uartLb, pw('TERM1', 1), pw('TERM1', 2), 12, 'F.Cu');
  feedGnd(pw('TERM1', 3), 70, 0);

  // LOGIC_L：EN/RST 在芯片右侧更远短连，避开 CLK(pin13)
  if (logicL && pw('U7', 14) && pw('U7', 15)) {
    const a = pw('U7', 14), b = pw('U7', 15);
    add(logicL, a, { x: a.x + 140, y: a.y }, 12, 'F.Cu');
    add(logicL, { x: a.x + 140, y: a.y }, { x: b.x + 140, y: b.y }, 12, 'F.Cu');
    add(logicL, { x: b.x + 140, y: b.y }, b, 12, 'F.Cu');
  }
  setPos('RLO', 5400, 3000, 0);
  runSig(logicL, pw('U7', 14), pw('RLO', 1), 2900, 'U', 'U');
  feedGnd(pw('RLO', 2), 0, 70);
  feedVcc(pw('U7', 16), 70, 0);
  feedGnd(pw('U7', 8), -70, 0);
  feedGnd(pw('OSC1', 5), 70, 0);
  feedGnd(pw('LA1', 9), 70, 0);

  // —— CLK 总线：各探针垂到 B@clkY，再按 X 串联（避免同焊盘多次 fan）——
  const clkY = 560;
  const clkPads = [
    [{ x: pw('SG1', 1).x, y: pw('SG1', 1).y - 80 }, 'R', true],
    [pw('OSC1', 1), 'U', false],
    [pw('VM1', 1), 'U', false],
    [pw('FC1', 1), 'U', false],
    [pw('U7', 13), 'D', false],
    [pw('LA1', 8), 'R', false]
  ];
  const clkCols = [];
  for (const [pad, dir, preEsc] of clkPads) {
    if (!clk || !pad) continue;
    const slot = escSlot++;
    if (preEsc) addVia(clk, pad);
    const a0 = fan(clk, pad, dir, slot);
    add(clk, a0, { x: a0.x, y: clkY }, 12, 'In3.Cu');
    addVia(clk, { x: a0.x, y: clkY });
    clkCols.push(a0.x);
  }
  clkCols.sort((a, b) => a - b);
  for (let i = 0; i + 1 < clkCols.length; i++) {
    add(clk, { x: clkCols[i], y: clkY }, { x: clkCols[i + 1], y: clkY }, 12, 'B.Cu');
  }

  // HI / MID / TOP → 示波器（扇出方向错开，避免电位器焊盘区交叉）
  runSig(hi, pw('R1', 1), pw('OSC1', 2), 1500, 'L', 'L');
  runSig(mid, pw('RV1', 2), pw('OSC1', 3), 1620, 'D', 'L');
  runSig(top, pw('RV1', 1), pw('OSC1', 4), 1740, 'U', 'L');

  // LA_CH：U7 向左扇、LA 向右扇，F 短线不相向穿越
  const qPads = [
    [1, 3, 'L'], [2, 2, 'L'], [3, 4, 'L'], [4, 7, 'L'],
    [5, 10, 'R'], [6, 1, 'L'], [7, 5, 'L']
  ];
  let cy = 1860;
  for (const [ch, padN, dir] of qPads) {
    runSig(laCh[ch], pw('U7', padN), pw('LA1', ch), cy, dir, 'R');
    cy += 110;
  }

  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    const gx = pickCol(e.x - 60, escSlot++);
    if (Math.abs(gx - e.x) > 0.5) {
      add(gnd, e, { x: gx, y: e.y }, 14, 'In2.Cu');
      addVia(gnd, { x: gx, y: e.y });
    }
    add(gnd, { x: gx, y: e.y }, { x: gx, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: gx, y: gndBusY });
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -50, 0, 14);
    const vx = pickCol(e.x - 60, escSlot++);
    if (Math.abs(vx - e.x) > 0.5) {
      add(vcc, e, { x: vx, y: e.y }, 14, 'In1.Cu');
      addVia(vcc, { x: vx, y: e.y });
    }
    add(vcc, { x: vx, y: e.y }, { x: vx, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: vx, y: vccBusY });
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 19,
    viaCount: doc.vias.length
  };
}
