import { readFileSync, writeFileSync } from 'fs';

const path = new URL('./export.mjs', import.meta.url);
const src = readFileSync(path, 'utf8');
const start = src.indexOf('/**\n * 51 流水灯手写布局');
const end = src.indexOf('\nfunction main()', start);
if (start < 0 || end < 0) {
  console.error('markers', start, end);
  process.exit(1);
}

const repl = `/**
 * 51 流水灯手写布局：AT89C51 DIP-40 + 晶振/复位 + 8 路 LED。
 * P1.0-P1.7 左侧对齐 LED 行；VCC/GND 分列 B 总线；排针各网专属上升列。
 */
function handLayoutLab51Led(doc) {
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
  const pinY = (n) => uy - 950 + (n - 1) * 100; // pad number 1..20 left

  setPos('U1', ux, uy, 0);
  for (let i = 0; i < 8; i++) {
    const y = pinY(i + 1);
    setPos(\`RL\${i + 1}\`, 260, y, 0);
    setPos(\`D\${i + 1}\`, 400, y, 0);
  }
  // 晶振竖放，两脚分别对齐 XTAL1/XTAL2 行
  setPos('Y1', leftX - 200, (pinY(18) + pinY(19)) / 2, 90);
  setPos('CX1', leftX - 100, pinY(19), 0);
  setPos('CX2', leftX - 100, pinY(18), 0);
  setPos('R1', leftX - 160, pinY(9), 0);
  setPos('C3', rightX + 120, pinY(1), 0);
  setPos('R_PWR', rightX + 120, pinY(1) - 120, 0);
  setPos('D9', rightX + 280, pinY(1) - 120, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1400, y: uy }, 0);
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
    // rot90 后 pad1 靠上≈XTAL2，pad2 靠下≈XTAL1
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
  /** SMD：F 短 stub 到旁侧过孔，再接 B */
  const smdToB = (net, padPt, dirX, w = 14) => {
    const e = { x: padPt.x + dirX * 40, y: padPt.y };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };
  let slot = 0;
  const toHeader = (net, esc, jPad, w = 16) => {
    if (!net) return;
    const s = slot++;
    const riseX = 1180 + s * 45;
    const runY = 60 + s * 30;
    const atRun = { x: esc.x, y: runY };
    const atCol = { x: riseX, y: runY };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atRun, w, esc.x < 1100 ? 'F.Cu' : 'B.Cu');
    addVia(net, atRun);
    add(net, atRun, atCol, w, 'B.Cu');
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

  const gndRailX = leftX - 120;
  const vccRailX = rightX + 80;

  // —— 晶振：各行水平短接，不交叉 ——
  // Y1 rot90: pad1≈XTAL2 行，pad2≈XTAL1 行
  add(xtal1, uX1, cx1a, 12, 'F.Cu');
  add(xtal1, cx1a, yB, 12, 'F.Cu');
  add(xtal2, uX2, cx2a, 12, 'F.Cu');
  add(xtal2, cx2a, yA, 12, 'F.Cu');
  // CX 到 GND rail
  const eCx1g = smdToB(gnd, cx1b, -1, 14);
  const eCx2g = smdToB(gnd, cx2b, -1, 14);
  add(gnd, eCx1g, { x: gndRailX, y: eCx1g.y }, 16, 'B.Cu');
  add(gnd, eCx2g, { x: gndRailX, y: eCx2g.y }, 16, 'B.Cu');
  add(gnd, { x: gndRailX, y: eCx1g.y }, { x: gndRailX, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: gndRailX, y: uGnd.y }, uGnd, 16, 'B.Cu');

  // —— 复位 ——
  add(nrst, r1b, uRst, 12, 'F.Cu');
  const eR1v = smdToB(vcc, r1a, -1, 14);
  add(vcc, eR1v, { x: vccRailX, y: eR1v.y }, 16, 'B.Cu');

  // —— 退耦 C3 ——
  const eC3v = smdToB(vcc, c3a, 1, 14);
  const eC3g = smdToB(gnd, c3b, 1, 14);
  add(vcc, eC3v, { x: vccRailX, y: eC3v.y }, 16, 'B.Cu');
  add(gnd, eC3g, { x: rightX + 160, y: eC3g.y }, 16, 'B.Cu');
  add(gnd, { x: rightX + 160, y: eC3g.y }, { x: rightX + 160, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: rightX + 160, y: uGnd.y }, { x: uGnd.x, y: uGnd.y }, 16, 'B.Cu');

  // VCC rail → pin40，再外廊到 EA
  add(vcc, { x: vccRailX, y: eC3v.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: uVcc.y }, uVcc, 16, 'B.Cu');
  add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 16, 'F.Cu');
  add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 16, 'F.Cu');
  add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 16, 'F.Cu');
  // 接通 R1 的 VCC 到 rail 竖线
  add(vcc, { x: vccRailX, y: eR1v.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');

  // —— 电源 LED ——
  const eRpv = smdToB(vcc, rpA, 1, 14);
  add(vcc, eRpv, { x: vccRailX, y: eRpv.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eRpv.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(pwrLed, rpB, d9a, 12, 'F.Cu');
  const eD9g = smdToB(gnd, d9k, 1, 14);
  add(gnd, eD9g, { x: rightX + 160, y: eD9g.y }, 16, 'B.Cu');
  add(gnd, { x: rightX + 160, y: eD9g.y }, { x: rightX + 160, y: uGnd.y }, 16, 'B.Cu');

  // —— 8 路 LED ——
  const ledVccX = 100;
  for (let i = 0; i < 8; i++) {
    const rlA = pw(\`RL\${i + 1}\`, 1);
    const rlB = pw(\`RL\${i + 1}\`, 2);
    const dA = pw(\`D\${i + 1}\`, 1);
    const dK = pw(\`D\${i + 1}\`, 2);
    const uP = pw('U1', i + 1);
    const netA = netByName(\`L\${i}_A\`);
    const netK = netByName(\`L\${i}_K\`);
    const eRl = smdToB(vcc, rlA, -1, 14);
    add(vcc, eRl, { x: ledVccX, y: eRl.y }, 16, 'B.Cu');
    if (i === 0) {
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: vccRailX, y: pinY(1) }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: pinY(1) }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
    }
    add(netA, rlB, dA, 12, 'F.Cu');
    add(netK, dK, uP, 12, 'F.Cu');
  }

  // —— 排针（专属列）——
  toHeader(gnd, { x: gndRailX, y: uGnd.y }, jGnd, 16);
  toHeader(vcc, { x: vccRailX, y: uVcc.y }, jVcc, 16);
  const eRst = { x: uRst.x - 50, y: uRst.y };
  add(nrst, uRst, eRst, 12, 'F.Cu');
  addVia(nrst, eRst);
  toHeader(nrst, eRst, jRst, 12);
  const ePwr = smdToB(pwrLed, d9a, 1, 12);
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

writeFileSync(path, src.slice(0, start) + repl + src.slice(end));
console.log('rewrote handLayoutLab51Led');
