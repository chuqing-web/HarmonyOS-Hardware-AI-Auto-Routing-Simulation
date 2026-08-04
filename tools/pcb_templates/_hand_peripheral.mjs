/**
 * 外设接口实验手布：STM32F103C8 + 按键/继电器/蜂鸣器/LCD/OLED。
 * Cu=6，每层都有走线：
 *   F.Cu  — 本地短连 / 短扇出
 *   In1.Cu — VCC 水平干线 + XTAL2
 *   In2.Cu — GND 水平干线 + XTAL1 短跨
 *   In3.Cu — VCC 竖馈 + 信号竖直段（无异网水平）
 *   In4.Cu — GND 竖馈
 *   B.Cu  — 信号水平干线（与竖直分层）
 */
function handLayoutLabPeripheral(doc) {
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
  forceFp('SW1', 'FP_SW_PUSH', 'SW_PUSH');
  forceFp('K1', 'FP_RELAY_SPDT', 'RELAY_SPDT');
  forceFp('BZ1', 'FP_BUZZER', 'BUZZER');
  forceFp('LCD1', 'FP_LCD1602', 'LCD1602');
  forceFp('OLED1', 'FP_OLED', 'OLED_12864');

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
  const key = netByName('KEY');
  const relDrv = netByName('REL_DRV');
  const relCoil = netByName('REL_COIL');
  const relNoA = netByName('REL_NO_A');
  const relNo = netByName('REL_NO');
  const relNcA = netByName('REL_NC_A');
  const relNc = netByName('REL_NC');
  const buz = netByName('BUZ');
  const buzDrv = netByName('BUZ_DRV');
  const lcdVo = netByName('LCD_VO');
  const lcdRs = netByName('LCD_RS');
  const lcdE = netByName('LCD_E');
  const lcdD4 = netByName('LCD_D4');
  const lcdD5 = netByName('LCD_D5');
  const lcdD6 = netByName('LCD_D6');
  const lcdD7 = netByName('LCD_D7');
  const oledSda = netByName('OLED_SDA');
  const oledScl = netByName('OLED_SCL');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const ux = 1200, uy = 1800;
  const gndBusY = uy + 1600;
  const vccBusY = uy - 1600;

  setPos('U1', ux, uy, 0);
  setPos('Y1', ux - 580, uy - 200, 0);
  setPos('CX1', ux - 640, uy - 380, 180);
  setPos('CX2', ux - 520, uy - 380, 180);
  setPos('R1', ux - 540, uy + 240, 180);
  setPos('C1', ux + 480, uy - 120, 0);

  // R2 旋转 180：pad1(KEY) 朝右接 SW
  setPos('R2', 2100, 520, 180);
  setPos('SW1', 2450, 520, 0);
  setPos('K1', 2600, 1500, 0);
  setPos('RR', 2100, 1400, 0);
  setPos('RLNO', 3300, 400, 0);
  setPos('DNO', 3600, 400, 0);
  setPos('RLNC', 3300, 1800, 0);
  setPos('DNC', 3600, 1800, 0);
  setPos('RBZ', 2100, 2550, 0);
  setPos('BZ1', 2550, 2550, 0);

  setPos('LCD1', 4600, 800, 0);
  setPos('RVO', 3900, 1300, 90);
  setPos('OLED1', 4600, 2800, 0);
  // 上拉与 SDA/SCL 焊盘同 X，只做竖连
  // pad2(信号) 朝向 OLED：上方用 90，下方用 270
  setPos('RODA', 4540, 2500, 90);
  setPos('ROCL', 4720, 3100, 270);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 5800, y: uy }, 0);
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
  bindPad('U1', 11, key); bindPad('U1', 12, relDrv); bindPad('U1', 13, buz);
  bindPad('U1', 18, lcdRs); bindPad('U1', 19, lcdE);
  bindPad('U1', 25, lcdD4); bindPad('U1', 26, lcdD5);
  bindPad('U1', 27, lcdD6); bindPad('U1', 28, lcdD7);
  bindPad('U1', 42, oledScl); bindPad('U1', 43, oledSda);

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

  bindPad('SW1', 1, key); bindPad('SW1', 2, gnd);
  bindPad('SW1', 3, key); bindPad('SW1', 4, gnd);
  bindPad('R2', 1, key); bindPad('R2', 2, vcc);

  bindPad('RR', 1, relDrv); bindPad('RR', 2, relCoil);
  bindPad('K1', 1, relCoil); bindPad('K1', 2, gnd);
  bindPad('K1', 3, gnd); bindPad('K1', 4, relNo); bindPad('K1', 5, relNc);

  bindPad('RLNO', 1, vcc); bindPad('RLNO', 2, relNoA);
  bindPad('DNO', 1, relNoA); bindPad('DNO', 2, relNo);
  bindPad('RLNC', 1, vcc); bindPad('RLNC', 2, relNcA);
  bindPad('DNC', 1, relNcA); bindPad('DNC', 2, relNc);

  bindPad('RBZ', 1, buz); bindPad('RBZ', 2, buzDrv);
  bindPad('BZ1', 1, buzDrv); bindPad('BZ1', 2, gnd);

  bindPad('LCD1', 1, gnd); bindPad('LCD1', 2, vcc); bindPad('LCD1', 3, lcdVo);
  bindPad('LCD1', 4, lcdRs); bindPad('LCD1', 5, gnd); bindPad('LCD1', 6, lcdE);
  bindPad('LCD1', 11, lcdD4); bindPad('LCD1', 12, lcdD5);
  bindPad('LCD1', 13, lcdD6); bindPad('LCD1', 14, lcdD7);
  bindPad('LCD1', 15, vcc); bindPad('LCD1', 16, gnd);
  bindPad('RVO', 1, lcdVo); bindPad('RVO', 2, gnd);

  bindPad('OLED1', 1, vcc); bindPad('OLED1', 2, gnd);
  bindPad('OLED1', 3, oledSda); bindPad('OLED1', 4, oledScl);
  bindPad('RODA', 1, vcc); bindPad('RODA', 2, oledSda);
  bindPad('ROCL', 1, vcc); bindPad('ROCL', 2, oledScl);

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

  /**
   * F：按焊盘边单段短引出（左 L / 底 D / 右 R / 顶 U）。
   * 错列横线交替走 In1/In2（异层不碰）；In3 竖直；B 水平。
   */
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
    const step = 100 + (slot % 4) * 40;
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
    if (Math.abs(ax - a0.x) > 0.5) {
      add(net, a0, { x: ax, y: a0.y }, 12, jogA);
      addVia(net, { x: ax, y: a0.y });
    }
    if (Math.abs(bx - b0.x) > 0.5) {
      add(net, b0, { x: bx, y: b0.y }, 12, jogB);
      addVia(net, { x: bx, y: b0.y });
    }
    add(net, { x: ax, y: a0.y }, { x: ax, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: ax, y: chanY });
    add(net, { x: bx, y: b0.y }, { x: bx, y: chanY }, 12, 'In3.Cu');
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

  const x0 = 60, x1 = 6100;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  // B 层板边平行电源（Y 远离信号通道 380~2850）
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

  // 晶振
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
    // 底边地：向下出，避免与 VCC 共水平
    const e = esc(gnd, uGnd, 0, 90, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (uVcc) {
    // 焊盘内过孔直下 In3，避免 F 竖线贴住右侧 LCD_Dx
    addVia(vcc, uVcc);
    usedCols.push(Math.round(uVcc.x));
    // 先错到安全列再上到电源轨
    const col = uVcc.x - 160;
    usedCols.push(Math.round(col));
    add(vcc, uVcc, { x: col, y: uVcc.y }, 14, 'In2.Cu');
    addVia(vcc, { x: col, y: uVcc.y });
    add(vcc, { x: col, y: uVcc.y }, { x: col, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: col, y: vccBusY });
    add(vcc, { x: col, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
  }
  if (c1a) {
    const e = esc(vcc, c1a, 55, -50, 12);
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
  if (r1b) {
    const e = esc(vcc, r1b, -60, 0, 12);
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }

  // —— 信号（QFP48：1-12 左 / 13-24 底 / 25-36 右 / 37-48 顶）——
  runSig(key, pw('U1', 11), pw('R2', 1), 560, 'L', 'R');
  if (key && pw('R2', 1) && pw('SW1', 1)) {
    const a = pw('R2', 1), b = pw('SW1', 1);
    add(key, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(key, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  feedVcc(pw('R2', 2), -70, 0);
  feedGnd(pw('SW1', 2), 0, 70);

  // pad12 左 / pad13 底：拐角用焊盘过孔，避免 F 短段互贴
  {
    const relPad = pw('U1', 12), rrPad = pw('RR', 1);
    if (relDrv && relPad && rrPad) {
      addVia(relDrv, relPad);
      usedCols.push(Math.round(relPad.x));
      const a0 = { x: relPad.x, y: relPad.y };
      const b0 = fan(relDrv, rrPad, 'L', escSlot + 2);
      const slot = escSlot++;
      const ax = pickCol(a0.x - 80, slot);
      const bx = pickCol(b0.x, slot + 13);
      const jogA = 'In1.Cu', jogB = 'In2.Cu';
      add(relDrv, a0, { x: ax, y: a0.y }, 12, jogA);
      addVia(relDrv, { x: ax, y: a0.y });
      if (Math.abs(bx - b0.x) > 0.5) {
        add(relDrv, b0, { x: bx, y: b0.y }, 12, jogB);
        addVia(relDrv, { x: bx, y: b0.y });
      }
      add(relDrv, { x: ax, y: a0.y }, { x: ax, y: 1280 }, 12, 'In3.Cu');
      addVia(relDrv, { x: ax, y: 1280 });
      add(relDrv, { x: bx, y: b0.y }, { x: bx, y: 1280 }, 12, 'In3.Cu');
      addVia(relDrv, { x: bx, y: 1280 });
      add(relDrv, { x: ax, y: 1280 }, { x: bx, y: 1280 }, 12, 'B.Cu');
    }
  }
  if (relCoil && pw('RR', 2) && pw('K1', 1)) add(relCoil, pw('RR', 2), pw('K1', 1), 12, 'F.Cu');
  feedGnd(pw('K1', 2), 0, -55);
  feedGnd(pw('K1', 3), 55, 0);

  feedVcc(pw('RLNO', 1), 0, -55);
  if (relNoA && pw('RLNO', 2) && pw('DNO', 1)) add(relNoA, pw('RLNO', 2), pw('DNO', 1), 12, 'F.Cu');
  runSig(relNo, pw('DNO', 2), pw('K1', 4), 360, 'D', 'U');

  feedVcc(pw('RLNC', 1), 0, -55);
  if (relNcA && pw('RLNC', 2) && pw('DNC', 1)) add(relNcA, pw('RLNC', 2), pw('DNC', 1), 12, 'F.Cu');
  runSig(relNc, pw('DNC', 2), pw('K1', 5), 1920, 'D', 'D');

  {
    const buzPad = pw('U1', 13), rbzPad = pw('RBZ', 1);
    if (buz && buzPad && rbzPad) {
      addVia(buz, buzPad);
      usedCols.push(Math.round(buzPad.x));
      const a0 = { x: buzPad.x, y: buzPad.y };
      const b0 = fan(buz, rbzPad, 'L', escSlot + 2);
      const slot = escSlot++;
      const ax = pickCol(a0.x + 80, slot);
      const bx = pickCol(b0.x, slot + 13);
      add(buz, a0, { x: ax, y: a0.y }, 12, 'In2.Cu');
      addVia(buz, { x: ax, y: a0.y });
      if (Math.abs(bx - b0.x) > 0.5) {
        add(buz, b0, { x: bx, y: b0.y }, 12, 'In1.Cu');
        addVia(buz, { x: bx, y: b0.y });
      }
      add(buz, { x: ax, y: a0.y }, { x: ax, y: 2420 }, 12, 'In3.Cu');
      addVia(buz, { x: ax, y: 2420 });
      add(buz, { x: bx, y: b0.y }, { x: bx, y: 2420 }, 12, 'In3.Cu');
      addVia(buz, { x: bx, y: 2420 });
      add(buz, { x: ax, y: 2420 }, { x: bx, y: 2420 }, 12, 'B.Cu');
    }
  }
  if (buzDrv && pw('RBZ', 2) && pw('BZ1', 1)) add(buzDrv, pw('RBZ', 2), pw('BZ1', 1), 12, 'F.Cu');
  feedGnd(pw('BZ1', 2), 0, 55);

  // 先占住 LCD 电源竖列，再布信号，避免 In3 共列
  for (const padN of [1, 2, 5, 15, 16]) {
    const pad = pw('LCD1', padN);
    if (!pad) continue;
    if (padN === 2 || padN === 15) feedVcc(pad, 0, -90);
    else feedGnd(pad, 0, -90);
  }

  runSig(lcdRs, pw('U1', 18), pw('LCD1', 4), 960, 'D', 'D');
  runSig(lcdE, pw('U1', 19), pw('LCD1', 6), 1080, 'D', 'D');
  runSig(lcdD4, pw('U1', 25), pw('LCD1', 11), 700, 'R', 'D');
  runSig(lcdD5, pw('U1', 26), pw('LCD1', 12), 820, 'R', 'D');
  runSig(lcdD6, pw('U1', 27), pw('LCD1', 13), 1180, 'R', 'D');
  runSig(lcdD7, pw('U1', 28), pw('LCD1', 14), 1400, 'R', 'D');

  // VO：在 pad1 高度横连，GND 从 pad2 向下出，互不穿越本体
  if (lcdVo && pw('LCD1', 3) && pw('RVO', 1)) {
    const p = pw('LCD1', 3), r = pw('RVO', 1);
    add(lcdVo, p, { x: p.x, y: r.y }, 12, 'F.Cu');
    add(lcdVo, { x: p.x, y: r.y }, r, 12, 'F.Cu');
  }
  feedGnd(pw('RVO', 2), 0, 100);

  // OLED：SDA 上出 / SCL 下出，避免焊盘行水平互穿
  runSig(oledSda, pw('U1', 43), pw('OLED1', 3), 2580, 'U', 'U');
  runSig(oledScl, pw('U1', 42), pw('OLED1', 4), 2980, 'U', 'D');
  if (oledSda && pw('RODA', 2) && pw('OLED1', 3)) {
    const a = pw('RODA', 2), b = pw('OLED1', 3);
    add(oledSda, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(oledSda, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  if (oledScl && pw('ROCL', 2) && pw('OLED1', 4)) {
    const a = pw('ROCL', 2), b = pw('OLED1', 4);
    add(oledScl, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(oledScl, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  // 上拉 VCC 横向离开信号竖线
  feedVcc(pw('RODA', 1), -100, 0);
  feedVcc(pw('ROCL', 1), 100, 0);
  feedVcc(pw('OLED1', 1), -70, -120);
  feedGnd(pw('OLED1', 2), 70, 120);

  // J1：只走内层竖馈，禁止 B 层长竖线贯穿信号通道
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -50, 0, 14);
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 23,
    viaCount: doc.vias.length
  };
}
