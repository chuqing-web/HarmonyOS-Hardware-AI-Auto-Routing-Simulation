/**
 * 8051 全系列手布：四列最小系统（教学统一 DIP-40）。
 * Cu=6，每层都有走线：
 *   F.Cu  — 晶振 / LED / 复位短连
 *   In1.Cu — VCC 水平干线
 *   In2.Cu — GND 水平干线
 *   In3.Cu — VCC 竖直馈线
 *   In4.Cu — GND 竖直馈线
 *   B.Cu  — 排针与列间补线
 */
function handLayoutLabMcu8051(doc) {
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

  const mcuVals = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
  for (let i = 0; i < 4; i++) {
    forceFp(`U${i + 1}`, 'FP_DIP40', mcuVals[i]);
    forceFp(`Y${i + 1}`, 'FP_HC49', i === 3 ? '8M' : '11.0592M');
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

  // 列距要够：CD 与下一列 RL 不能挤在同一 Y
  const colW = 1350;
  const uy = 1300;
  const pinY = (n) => uy - 950 + (n - 1) * 100;
  const gndBusY = uy + 1150;
  const vccBusY = uy - 1150;

  for (let i = 0; i < 4; i++) {
    const ux = 560 + i * colW;
    const leftX = ux - 300;
    const rightX = ux + 300;
    const u = `U${i + 1}`;
    const xtal1 = netByName(`M${i}_XTAL1`);
    const xtal2 = netByName(`M${i}_XTAL2`);
    const nrst = netByName(`M${i}_NRST`);
    const ledA = netByName(`L${i}_A`);
    const ledK = netByName(`L${i}_K`);

    setPos(u, ux, uy, 0);
    setPos(`RL${i + 1}`, leftX - 280, pinY(1), 0);
    setPos(`D${i + 1}`, leftX - 140, pinY(1), 0);
    setPos(`Y${i + 1}`, leftX - 220, (pinY(18) + pinY(19)) / 2, 90);
    setPos(`CX${i}1`, leftX - 380, pinY(19), 180);
    setPos(`CX${i}2`, leftX - 380, pinY(18), 180);
    setPos(`R${i + 1}`, leftX - 180, pinY(9), 0);
    // 去耦略偏下，避开 pin40 与邻列 RL 的同一水平带
    setPos(`CD${i + 1}`, rightX + 160, pinY(3), 0);

    bindPad(u, 1, ledK);
    bindPad(u, 9, nrst);
    bindPad(u, 18, xtal2);
    bindPad(u, 19, xtal1);
    bindPad(u, 20, gnd);
    bindPad(u, 31, vcc);
    bindPad(u, 40, vcc);

    const y = byRef.get(`Y${i + 1}`);
    if (y) {
      const p1 = y.pads.find(p => p.number === '1');
      const p2 = y.pads.find(p => p.number === '2');
      if (p1 && xtal2) { p1.netId = xtal2.id; p1.netName = xtal2.name; }
      if (p2 && xtal1) { p2.netId = xtal1.id; p2.netName = xtal1.name; }
    }
    bindPad(`CX${i}1`, 1, xtal1); bindPad(`CX${i}1`, 2, gnd);
    bindPad(`CX${i}2`, 1, xtal2); bindPad(`CX${i}2`, 2, gnd);
    bindPad(`R${i + 1}`, 1, nrst); bindPad(`R${i + 1}`, 2, vcc);
    bindPad(`CD${i + 1}`, 1, vcc); bindPad(`CD${i + 1}`, 2, gnd);
    bindPad(`RL${i + 1}`, 1, vcc); bindPad(`RL${i + 1}`, 2, ledA);
    bindPad(`D${i + 1}`, 1, ledA); bindPad(`D${i + 1}`, 2, ledK);
  }

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 280 + 4 * colW, y: uy }, 0);
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
  /** 焊盘短桩到过孔，返回过孔坐标 */
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  const x0 = 60;
  const x1 = 320 + 4 * colW;

  // —— 全板电源水平干线（分属 In1 / In2，互不交叉）——
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  // B 层平行复走，保证 B 也有铜线
  add(vcc, { x: x0, y: vccBusY + 40 }, { x: x1, y: vccBusY + 40 }, 16, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 40 }, { x: x1, y: gndBusY - 40 }, 16, 'B.Cu');

  for (let i = 0; i < 4; i++) {
    const ux = 560 + i * colW;
    const leftX = ux - 300;
    const rightX = ux + 300;
    const u = `U${i + 1}`;
    const xtal1 = netByName(`M${i}_XTAL1`);
    const xtal2 = netByName(`M${i}_XTAL2`);
    const nrst = netByName(`M${i}_NRST`);
    const ledA = netByName(`L${i}_A`);
    const ledK = netByName(`L${i}_K`);

    // 每列专用竖馈：VCC→In3，GND→In4（与水平干线分层）
    const vccFeedX = rightX + 180;
    const gndFeedL = leftX - 200;
    const gndFeedR = ux + 200;
    const vccFeedL = leftX - 460;

    const uGnd = pw(u, 20), uVcc = pw(u, 40), uEa = pw(u, 31);
    const uRst = pw(u, 9), uX1 = pw(u, 19), uX2 = pw(u, 18), uP10 = pw(u, 1);
    const yA = pw(`Y${i + 1}`, 1), yB = pw(`Y${i + 1}`, 2);
    const cx1a = pw(`CX${i}1`, 1), cx1b = pw(`CX${i}1`, 2);
    const cx2a = pw(`CX${i}2`, 1), cx2b = pw(`CX${i}2`, 2);
    const r1a = pw(`R${i + 1}`, 1), r1b = pw(`R${i + 1}`, 2);
    const cda = pw(`CD${i + 1}`, 1), cdb = pw(`CD${i + 1}`, 2);
    const rlA = pw(`RL${i + 1}`, 1), rlB = pw(`RL${i + 1}`, 2);
    const dA = pw(`D${i + 1}`, 1), dK = pw(`D${i + 1}`, 2);

    // F：晶振本地
    if (xtal1 && uX1 && yB) {
      add(xtal1, uX1, { x: yB.x, y: uX1.y }, 12, 'F.Cu');
      add(xtal1, { x: yB.x, y: uX1.y }, yB, 12, 'F.Cu');
    }
    if (xtal2 && uX2 && yA) {
      add(xtal2, uX2, { x: yA.x, y: uX2.y }, 12, 'F.Cu');
      add(xtal2, { x: yA.x, y: uX2.y }, yA, 12, 'F.Cu');
    }
    if (xtal1 && yB && cx1a) {
      add(xtal1, yB, { x: cx1a.x, y: yB.y }, 12, 'F.Cu');
      add(xtal1, { x: cx1a.x, y: yB.y }, cx1a, 12, 'F.Cu');
    }
    if (xtal2 && yA && cx2a) {
      add(xtal2, yA, { x: cx2a.x, y: yA.y }, 12, 'F.Cu');
      add(xtal2, { x: cx2a.x, y: yA.y }, cx2a, 12, 'F.Cu');
    }

    // CX GND → In4 竖馈 → In2 底轨
    for (const pad of [cx1b, cx2b]) {
      if (!pad) continue;
      const e = esc(gnd, pad, -50, 0, 12);
      add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: e.x, y: gndBusY });
      add(gnd, { x: e.x, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    // MCU GND
    if (uGnd) {
      const e = esc(gnd, uGnd, -50, 0, 14);
      add(gnd, e, { x: gndFeedL, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedL, y: gndBusY });
    }

    // CD GND（先右再下，远离 VCC 焊盘）
    if (cdb) {
      const e = esc(gnd, cdb, 60, 0, 12);
      add(gnd, e, { x: gndFeedR, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedR, y: e.y }, { x: gndFeedR, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedR, y: gndBusY });
      add(gnd, { x: gndFeedR, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    // 复位 F 短连；R 上拉 → VCC 经 In3 上顶轨
    if (nrst && r1b && uRst) add(nrst, r1b, uRst, 12, 'F.Cu');
    if (r1a) {
      const e = esc(vcc, r1a, -50, 0, 12);
      add(vcc, e, { x: vccFeedL, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedL, y: vccBusY });
      add(vcc, { x: vccFeedL, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
    }

    // CD / MCU VCC → In3 竖馈 → In1 顶轨
    if (cda) {
      const e = esc(vcc, cda, 0, -50, 12);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }
    if (uVcc) {
      const e = esc(vcc, uVcc, 50, 0, 14);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }
    if (uVcc && uEa) {
      add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 12, 'F.Cu');
      add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 12, 'F.Cu');
      add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 12, 'F.Cu');
    }

    // LED：F 串联；限流电阻 VCC 上 In3
    if (rlA) {
      const e = esc(vcc, rlA, -50, 0, 12);
      add(vcc, e, { x: vccFeedL, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedL, y: vccBusY });
    }
    if (ledA && rlB && dA) add(ledA, rlB, dA, 12, 'F.Cu');
    if (ledK && dK && uP10) add(ledK, dK, uP10, 12, 'F.Cu');

    // 列间：用 In1/In2 把本列馈点接到全板干线（已在 via 处）
    addVia(vcc, { x: vccFeedX, y: vccBusY });
    addVia(gnd, { x: gndFeedL, y: gndBusY });
  }

  // 排针：GND/VCC 用不同 X 的 B 竖线，避免同柱重叠
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY - 40 }, 14, 'B.Cu');
    addVia(gnd, { x: e.x, y: gndBusY - 40 });
    add(gnd, { x: e.x, y: gndBusY - 40 }, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
    add(gnd, { x: e.x, y: gndBusY }, { x: x1, y: gndBusY }, 14, 'In2.Cu');
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -120, 0, 14);
    add(vcc, e, { x: e.x, y: vccBusY + 40 }, 14, 'B.Cu');
    addVia(vcc, { x: e.x, y: vccBusY + 40 });
    add(vcc, { x: e.x, y: vccBusY + 40 }, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
    add(vcc, { x: e.x, y: vccBusY }, { x: x1, y: vccBusY }, 14, 'In1.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 22,
    viaCount: doc.vias.length
  };
}
