import { readFileSync, writeFileSync } from 'fs';

const p = new URL('./export.mjs', import.meta.url);
const src = readFileSync(p, 'utf8');
const start = src.indexOf('function handLayoutLab51Led(doc) {');
const end = src.indexOf('\nfunction main()', start);
if (start < 0 || end < 0) throw new Error('markers not found');

const repl = `function handLayoutLab51Led(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  for (const fp of doc.footprints) {
    if (fp.refDes === 'U1') {
      const neu = instantiate('FP_DIP40', 'U1', fp.value || 'AT89C51', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
    } else if (fp.refDes === 'Y1' && fp.defId !== 'FP_HC49') {
      const neu = instantiate('FP_HC49', 'Y1', fp.value || '11.0592M', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
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

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const pwrLed = netByName('PWR_LED');

  const ux = 820, uy = 1200;
  const leftX = ux - 300;
  const rightX = ux + 300;
  const pinY = (n) => uy - 950 + (n - 1) * 100; // pad 1..20 left column

  setPos('U1', ux, uy, 0);
  for (let i = 0; i < 8; i++) {
    const y = pinY(i + 1);
    setPos(\`RL\${i + 1}\`, 260, y, 0);
    setPos(\`D\${i + 1}\`, 400, y, 0);
  }
  // 晶振竖放；CX 旋转 180°：pad1(信号)朝 Y1，pad2(GND)朝外，避免 XTAL 线穿 GND 焊盘
  setPos('Y1', leftX - 200, (pinY(18) + pinY(19)) / 2, 90);
  setPos('CX1', leftX - 360, pinY(19), 180);
  setPos('CX2', leftX - 360, pinY(18), 180);
  setPos('R1', leftX - 160, pinY(9), 0);
  setPos('C3', rightX + 140, pinY(1), 0);
  setPos('R_PWR', rightX + 140, pinY(1) - 140, 0);
  setPos('D9', rightX + 300, pinY(1) - 140, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1500, y: uy }, 0);
  const hdrNets = [gnd, vcc, nrst, pwrLed];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const bindU1 = (padNum, net) => {
    const fp = byRef.get('U1');
    const pad = fp?.pads.find(p => p.number === String(padNum));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };
  for (let i = 0; i < 8; i++) bindU1(i + 1, netByName(\`L\${i}_K\`));
  bindU1(9, nrst);
  bindU1(18, xtal2);
  bindU1(19, xtal1);
  bindU1(20, gnd);
  bindU1(31, vcc);
  bindU1(40, vcc);
  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal2) { p1.netId = xtal2.id; p1.netName = xtal2.name; }
    if (p2 && xtal1) { p2.netId = xtal1.id; p2.netName = xtal1.name; }
  }

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
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
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const smdToB = (net, padPt, dx, dy, w = 14) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };
  /**
   * 到排针：先 B 横到专属 riseX，再 F 竖到针脚行，短 B 进焊盘。
   * 禁止在逃逸 X 上长竖穿板（会与电源横线交叉）。
   */
  let slot = 0;
  const j1x = 1500;
  const toHeader = (net, esc, jPad, w = 16) => {
    if (!net || !esc || !jPad) return;
    const s = slot++;
    const riseX = j1x - 120 - s * 55;
    const atCol = { x: riseX, y: esc.y };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, jPad, w, 'B.Cu');
    addVia(net, jPad);
  };

  const uGnd = pw('U1', 20), uVcc = pw('U1', 40), uEa = pw('U1', 31);
  const uRst = pw('U1', 9), uX1 = pw('U1', 19), uX2 = pw('U1', 18);
  const yA = pw('Y1', 1), yB = pw('Y1', 2);
  const cx1a = pw('CX1', 1), cx1b = pw('CX1', 2);
  const cx2a = pw('CX2', 1), cx2b = pw('CX2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c3a = pw('C3', 1), c3b = pw('C3', 2);
  const rpA = pw('R_PWR', 1), rpB = pw('R_PWR', 2);
  const d9a = pw('D9', 1), d9k = pw('D9', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jRst = pw('J1', 3), jPwr = pw('J1', 4);

  const gndLeftX = leftX - 200;
  const gndRightX = rightX + 260;
  const vccRailX = rightX + 60;
  const ledVccX = 90;
  const gndJoinY = uy + 1100; // 器件下方、专属接合，无异网竖线穿越

  // —— 晶振：MCU↔Y1↔CX(pad1 朝内)；GND 自 pad2 向外 ——
  add(xtal1, uX1, { x: yB.x, y: uX1.y }, 12, 'F.Cu');
  add(xtal1, { x: yB.x, y: uX1.y }, yB, 12, 'F.Cu');
  add(xtal2, uX2, { x: yA.x, y: uX2.y }, 12, 'F.Cu');
  add(xtal2, { x: yA.x, y: uX2.y }, yA, 12, 'F.Cu');
  add(xtal1, yB, { x: cx1a.x, y: yB.y }, 12, 'F.Cu');
  add(xtal1, { x: cx1a.x, y: yB.y }, cx1a, 12, 'F.Cu');
  add(xtal2, yA, { x: cx2a.x, y: yA.y }, 12, 'F.Cu');
  add(xtal2, { x: cx2a.x, y: yA.y }, cx2a, 12, 'F.Cu');
  const eCx1g = smdToB(gnd, cx1b, -55, 0, 14);
  const eCx2g = smdToB(gnd, cx2b, -55, 0, 14);
  add(gnd, eCx1g, { x: gndLeftX, y: eCx1g.y }, 16, 'B.Cu');
  add(gnd, eCx2g, { x: gndLeftX, y: eCx2g.y }, 16, 'B.Cu');
  add(gnd, { x: gndLeftX, y: Math.min(eCx1g.y, eCx2g.y) },
    { x: gndLeftX, y: gndJoinY }, 16, 'B.Cu');
  // U1.GND 仅短接到左轨，不横穿整板
  add(gnd, uGnd, { x: gndLeftX, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: gndLeftX, y: uGnd.y }, { x: gndLeftX, y: gndJoinY }, 16, 'B.Cu');

  // —— 复位：R1 右脚→RST；左脚 VCC→LED 左总线 ——
  add(nrst, r1b, uRst, 12, 'F.Cu');
  const eR1v = smdToB(vcc, r1a, -50, 0, 14);
  add(vcc, eR1v, { x: ledVccX, y: eR1v.y }, 16, 'B.Cu');

  // —— 右侧退耦：VCC 向上逃逸，GND 向下逃逸，避免同行对穿 ——
  const eC3v = smdToB(vcc, c3a, 0, -55, 14);
  const eC3g = smdToB(gnd, c3b, 0, 55, 14);
  add(vcc, eC3v, { x: vccRailX, y: eC3v.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eC3v.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: uVcc.y }, uVcc, 16, 'B.Cu');
  // EA 与 VCC 同网：芯片右侧 F 竖连
  add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 16, 'F.Cu');
  add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 16, 'F.Cu');
  add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 16, 'F.Cu');
  add(gnd, eC3g, { x: gndRightX, y: eC3g.y }, 16, 'B.Cu');
  add(gnd, { x: gndRightX, y: eC3g.y }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // —— 电源 LED ——
  const eRpv = smdToB(vcc, rpA, 0, -55, 14);
  add(vcc, eRpv, { x: vccRailX, y: eRpv.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eRpv.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(pwrLed, rpB, d9a, 12, 'F.Cu');
  const eD9g = smdToB(gnd, d9k, 55, 0, 14);
  add(gnd, eD9g, { x: gndRightX, y: eD9g.y }, 16, 'B.Cu');
  add(gnd, { x: gndRightX, y: eD9g.y }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // 左右 GND 只在板底接合
  add(gnd, { x: gndLeftX, y: gndJoinY }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // —— 8 路 LED ——
  for (let i = 0; i < 8; i++) {
    const rlA = pw(\`RL\${i + 1}\`, 1);
    const rlB = pw(\`RL\${i + 1}\`, 2);
    const dA = pw(\`D\${i + 1}\`, 1);
    const dK = pw(\`D\${i + 1}\`, 2);
    const uP = pw('U1', i + 1);
    const netA = netByName(\`L\${i}_A\`);
    const netK = netByName(\`L\${i}_K\`);
    const eRl = smdToB(vcc, rlA, -50, 0, 14);
    add(vcc, eRl, { x: ledVccX, y: eRl.y }, 16, 'B.Cu');
    if (i === 0) {
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');
      const topY = pinY(1) - 100;
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: topY }, { x: vccRailX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: topY }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
    }
    add(netA, rlB, dA, 12, 'F.Cu');
    add(netK, dK, uP, 12, 'F.Cu');
  }
  add(vcc, { x: ledVccX, y: eR1v.y }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');

  // —— 排针（专属列，F 竖，不与 B 电源横线交叉）——
  toHeader(gnd, { x: gndRightX, y: gndJoinY }, jGnd, 16);
  toHeader(vcc, { x: vccRailX, y: uVcc.y }, jVcc, 16);
  const eRst = smdToB(nrst, uRst, -70, 0, 12);
  toHeader(nrst, eRst, jRst, 12);
  const ePwr = smdToB(pwrLed, d9a, 0, -55, 12);
  toHeader(pwrLed, ePwr, jPwr, 12);

  const ledNets = [];
  for (let i = 0; i < 8; i++) {
    ledNets.push(netByName(\`L\${i}_A\`), netByName(\`L\${i}_K\`));
  }
  return {
    trackCount: doc.tracks.length,
    netCount: [vcc, gnd, xtal1, xtal2, nrst, pwrLed, ...ledNets].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}

`;

writeFileSync(p, src.slice(0, start) + repl + src.slice(end));
console.log('replaced handLayoutLab51Led');
