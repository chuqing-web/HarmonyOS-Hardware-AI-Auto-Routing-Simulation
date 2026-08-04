/**
 * 传感器实验手布：STM32F103C8 + DS18B20/霍尔/电位器/光敏 + 三色指示灯。
 * Cu=6，每层都有走线：
 *   F.Cu  — 本地短连 / 晶振
 *   In1.Cu — VCC 水平干线 + 信号错列
 *   In2.Cu — GND 水平干线 + 信号错列
 *   In3.Cu — VCC 竖馈 + 信号竖直
 *   In4.Cu — GND 竖馈
 *   B.Cu  — 信号水平干线
 */
function handLayoutLabSensor(doc) {
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

  forceFp('U1', 'FP_QFP48', 'STM32F103C8');
  forceFp('Y1', 'FP_HC49', '8M');
  forceFp('T1', 'FP_TO92_SENSOR', 'DS18B20');
  forceFp('H1', 'FP_TO92_SENSOR', 'HALL');
  forceFp('RV1', 'FP_POT3', 'POT_10k');
  forceFp('LDR1', 'FP_LDR', 'LDR');

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
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const oneWire = netByName('1WIRE');
  const hall = netByName('HALL');
  const adc = netByName('ADC');
  const ledPa4 = netByName('LED_PA4');
  const ledPa4A = netByName('LED_PA4_A');
  const ledPa5 = netByName('LED_PA5');
  const ledPa5A = netByName('LED_PA5_A');
  const ledPa6 = netByName('LED_PA6');
  const ledPa6A = netByName('LED_PA6_A');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const ux = 1200, uy = 1700;
  const gndBusY = uy + 1500;
  const vccBusY = uy - 1500;

  setPos('U1', ux, uy, 0);
  setPos('Y1', ux - 580, uy - 200, 0);
  setPos('CX1', ux - 640, uy - 380, 180);
  setPos('CX2', ux - 520, uy - 380, 180);
  setPos('R1', ux - 540, uy + 240, 180);
  setPos('C1', ux + 480, uy - 120, 0);

  // 传感器列：上拉在器件上方，避免与信号横线共 Y
  setPos('T1', 2800, 800, 0);
  setPos('R2', 2800, 550, 90);
  setPos('H1', 2800, 1600, 0);
  setPos('RH', 2800, 1350, 90);
  setPos('RV1', 2800, 2400, 0);
  setPos('LDR1', 3200, 2600, 0);

  // LED 列
  setPos('RL1', 4200, 800, 0);
  setPos('D_ADC', 4600, 800, 0);
  setPos('RL2', 4200, 1500, 0);
  setPos('D_HALL', 4600, 1500, 0);
  setPos('RL3', 4200, 2200, 0);
  setPos('D_TEMP', 4600, 2200, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 5200, y: uy }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  bindPad('U1', 5, xtal1); bindPad('U1', 6, xtal2);
  bindPad('U1', 7, nrst);
  bindPad('U1', 23, gnd); bindPad('U1', 24, vcc);
  bindPad('U1', 10, adc);   // PA0
  bindPad('U1', 13, oneWire); // PA3
  bindPad('U1', 14, ledPa4);  // PA4
  bindPad('U1', 15, ledPa5);  // PA5
  bindPad('U1', 16, ledPa6);  // PA6
  bindPad('U1', 18, hall);    // PB0

  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal1) { p1.netId = xtal1.id; p1.netName = xtal1.name; }
    if (p2 && xtal2) { p2.netId = xtal2.id; p2.netName = xtal2.name; }
  }
  bindPad('CX1', 1, xtal1); bindPad('CX1', 2, gnd);
  bindPad('CX2', 1, xtal2); bindPad('CX2', 2, gnd);
  bindPad('R1', 1, nrst); bindPad('R1', 2, vcc);
  bindPad('C1', 1, vcc); bindPad('C1', 2, gnd);

  bindPad('T1', 1, gnd); bindPad('T1', 2, oneWire); bindPad('T1', 3, vcc);
  bindPad('R2', 1, oneWire); bindPad('R2', 2, vcc);

  bindPad('H1', 1, vcc); bindPad('H1', 2, hall); bindPad('H1', 3, gnd);
  bindPad('RH', 1, vcc); bindPad('RH', 2, hall);

  bindPad('RV1', 1, vcc); bindPad('RV1', 2, adc); bindPad('RV1', 3, gnd);
  bindPad('LDR1', 1, adc); bindPad('LDR1', 2, gnd);

  bindPad('RL1', 1, ledPa4); bindPad('RL1', 2, ledPa4A);
  bindPad('D_ADC', 1, ledPa4A); bindPad('D_ADC', 2, gnd);
  bindPad('RL2', 1, ledPa5); bindPad('RL2', 2, ledPa5A);
  bindPad('D_HALL', 1, ledPa5A); bindPad('D_HALL', 2, gnd);
  bindPad('RL3', 1, ledPa6); bindPad('RL3', 2, ledPa6A);
  bindPad('D_TEMP', 1, ledPa6A); bindPad('D_TEMP', 2, gnd);

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
  const colTaken = (x) => usedCols.some(c => Math.abs(c - x) < 36);
  const pickCol = (baseX, slot) => {
    let x = Math.round(baseX + ((slot % 2 === 0) ? -1 : 1) * (60 + slot * 32));
    let guard = 0;
    while (colTaken(x) && guard++ < 50) x += (x >= baseX ? 36 : -36);
    usedCols.push(x);
    return x;
  };
  const fan = (net, pad, dir, slot) => {
    const step = 100 + slot * 40;
    let x = pad.x, y = pad.y;
    if (dir === 'L') x -= step;
    else if (dir === 'R') x += step;
    else if (dir === 'U') y -= step;
    else y += step;
    add(net, pad, { x, y }, 12, 'F.Cu');
    addVia(net, { x, y });
    return { x, y };
  };
  const runSig = (net, fromPad, toPad, chanY, fromDir, toDir) => {
    if (!net || !fromPad || !toPad) return;
    const slot = escSlot++;
    const a0 = fan(net, fromPad, fromDir, slot);
    const b0 = fan(net, toPad, toDir, slot + 2);
    const ax = pickCol(a0.x, slot);
    const bx = pickCol(b0.x, slot + 13);
    const jogA = (slot % 2 === 0) ? 'In1.Cu' : 'In2.Cu';
    const jogB = (slot % 2 === 0) ? 'In2.Cu' : 'In1.Cu';
    // 错列高度按 slot 错开，避免同层平行横线贴边
    const ay = a0.y + ((slot % 2 === 0) ? -1 : 1) * (20 + slot * 18);
    const by = b0.y + ((slot % 2 === 0) ? 1 : -1) * (20 + slot * 18);
    add(net, a0, { x: a0.x, y: ay }, 12, 'In3.Cu');
    addVia(net, { x: a0.x, y: ay });
    if (Math.abs(ax - a0.x) > 0.5) {
      add(net, { x: a0.x, y: ay }, { x: ax, y: ay }, 12, jogA);
      addVia(net, { x: ax, y: ay });
    }
    add(net, b0, { x: b0.x, y: by }, 12, 'In3.Cu');
    addVia(net, { x: b0.x, y: by });
    if (Math.abs(bx - b0.x) > 0.5) {
      add(net, { x: b0.x, y: by }, { x: bx, y: by }, 12, jogB);
      addVia(net, { x: bx, y: by });
    }
    add(net, { x: ax, y: ay }, { x: ax, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: ax, y: chanY });
    add(net, { x: bx, y: by }, { x: bx, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: bx, y: chanY });
    add(net, { x: ax, y: chanY }, { x: bx, y: chanY }, 12, 'B.Cu');
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

  const x0 = 60, x1 = 5400;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  add(vcc, { x: x0, y: vccBusY + 80 }, { x: x1, y: vccBusY + 80 }, 14, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 80 }, { x: x1, y: gndBusY - 80 }, 14, 'B.Cu');

  const vccFeedX = ux + 520;
  const uGnd = pw('U1', 23), uVcc = pw('U1', 24);
  const uRst = pw('U1', 7), uX1 = pw('U1', 5), uX2 = pw('U1', 6);
  const yA = pw('Y1', 1), yB = pw('Y1', 2);
  const cx1a = pw('CX1', 1), cx1b = pw('CX1', 2);
  const cx2a = pw('CX2', 1), cx2b = pw('CX2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);

  if (xtal1 && uX1 && yA) {
    const e = esc(xtal1, uX1, -50, 0, 12);
    add(xtal1, e, { x: yA.x, y: e.y }, 12, 'In2.Cu');
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
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }

  if (uGnd) {
    const e = esc(gnd, uGnd, 0, 90, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (uVcc) {
    // 焊盘过孔后先上到远离底边信号带，再错列（避免与 PA* In2 共 Y）
    addVia(vcc, uVcc);
    usedCols.push(Math.round(uVcc.x));
    const midY = uVcc.y - 120;
    add(vcc, uVcc, { x: uVcc.x, y: midY }, 14, 'In3.Cu');
    addVia(vcc, { x: uVcc.x, y: midY });
    const col = uVcc.x - 160;
    usedCols.push(Math.round(col));
    add(vcc, { x: uVcc.x, y: midY }, { x: col, y: midY }, 14, 'In1.Cu');
    addVia(vcc, { x: col, y: midY });
    add(vcc, { x: col, y: midY }, { x: col, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: col, y: vccBusY });
    add(vcc, { x: col, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
  }
  if (c1a) {
    const e = esc(vcc, c1a, 55, -50, 12);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }
  if (c1b) {
    const e = esc(gnd, c1b, 60, 50, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (nrst && r1a && uRst) {
    const colX = Math.min(r1a.x, uRst.x) - 55;
    add(nrst, r1a, { x: colX, y: r1a.y }, 12, 'F.Cu');
    add(nrst, { x: colX, y: r1a.y }, { x: colX, y: uRst.y }, 12, 'F.Cu');
    add(nrst, { x: colX, y: uRst.y }, uRst, 12, 'F.Cu');
  }
  if (r1b) feedVcc(r1b, -60, 0);

  // QFP48：1-12 左 / 13-24 底 / 25-36 右 / 37-48 顶
  // PA0=10 左；PA3=13、PA4-6=14-16、PB0=18 底

  // 1-Wire：底边向下出；上拉在 T1 上方竖连；电源向外/向下，不横穿中间脚
  runSig(oneWire, pw('U1', 13), pw('T1', 2), 480, 'D', 'U');
  if (oneWire && pw('R2', 2) && pw('T1', 2)) add(oneWire, pw('R2', 2), pw('T1', 2), 12, 'F.Cu');
  feedVcc(pw('R2', 1), -80, 0);
  feedVcc(pw('T1', 3), 0, 80);
  feedGnd(pw('T1', 1), 0, 80);

  // 霍尔：电源向下出，信号从上拉竖入
  runSig(hall, pw('U1', 18), pw('H1', 2), 1200, 'D', 'U');
  if (hall && pw('RH', 2) && pw('H1', 2)) add(hall, pw('RH', 2), pw('H1', 2), 12, 'F.Cu');
  feedVcc(pw('RH', 1), -80, 0);
  feedVcc(pw('H1', 1), 0, 90);
  feedGnd(pw('H1', 3), 0, 90);

  // ADC：PA0 左侧出
  runSig(adc, pw('U1', 10), pw('RV1', 2), 2100, 'L', 'U');
  if (adc && pw('RV1', 2) && pw('LDR1', 1)) {
    const a = pw('RV1', 2), b = pw('LDR1', 1);
    add(adc, a, { x: a.x, y: b.y }, 12, 'F.Cu');
    add(adc, { x: a.x, y: b.y }, b, 12, 'F.Cu');
  }
  feedVcc(pw('RV1', 1), -70, 0);
  feedGnd(pw('RV1', 3), 70, 0);
  feedGnd(pw('LDR1', 2), 0, 70);

  // LED：底边焊盘一律向下短引出，避免共 Y 水平互贴
  runSig(ledPa4, pw('U1', 14), pw('RL1', 1), 640, 'D', 'L');
  runSig(ledPa5, pw('U1', 15), pw('RL2', 1), 1320, 'D', 'L');
  runSig(ledPa6, pw('U1', 16), pw('RL3', 1), 1980, 'D', 'L');
  if (ledPa4A && pw('RL1', 2) && pw('D_ADC', 1)) add(ledPa4A, pw('RL1', 2), pw('D_ADC', 1), 12, 'F.Cu');
  if (ledPa5A && pw('RL2', 2) && pw('D_HALL', 1)) add(ledPa5A, pw('RL2', 2), pw('D_HALL', 1), 12, 'F.Cu');
  if (ledPa6A && pw('RL3', 2) && pw('D_TEMP', 1)) add(ledPa6A, pw('RL3', 2), pw('D_TEMP', 1), 12, 'F.Cu');
  feedGnd(pw('D_ADC', 2), 0, 70);
  feedGnd(pw('D_HALL', 2), 0, 70);
  feedGnd(pw('D_TEMP', 2), 0, 70);

  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -50, 0, 14);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 14,
    viaCount: doc.vias.length
  };
}
