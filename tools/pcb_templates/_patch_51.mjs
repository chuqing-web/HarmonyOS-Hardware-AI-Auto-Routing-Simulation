import { readFileSync, writeFileSync } from 'fs';

const path = new URL('./export.mjs', import.meta.url);
let src = readFileSync(path, 'utf8');

src = src.replace(
  "if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter') {\n    n = 2;\n  }",
  "if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') {\n    n = 2;\n  }"
);

const fn = `
/**
 * 51 流水灯手写布局：AT89C51 DIP-40 + 晶振/复位 + 8 路 LED。
 * P1.0-P1.7 左侧对齐 LED 行；VCC/GND 走 B 总线；阴极水平短接到单片机。
 */
function handLayoutLab51Led(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  // annotate 可能仍是错误封装，强制换成 DIP40 / HC49
  for (const fp of doc.footprints) {
    if (fp.refDes === 'U1') {
      const neu = instantiate('FP_DIP40', 'U1', fp.value || 'AT89C51', fp.position, 0, fp.schematicCompId);
      // 按原 schematicCompId 重绑网络
      const oldPads = fp.pads;
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      // 网络在下面 setPos 后用 pad 号从 doc.nets 再绑一次更稳：先清
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
      void oldPads;
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

  // U1 中心；P1.0 世界 Y = uy-950
  const ux = 780, uy = 1200;
  setPos('U1', ux, uy, 0);
  // 流水灯：左 VCC 总线 ← RL ← LED ← MCU P1
  for (let i = 0; i < 8; i++) {
    const y = uy - 950 + i * 100;
    setPos(\`RL\${i + 1}\`, 280, y, 0);
    setPos(\`D\${i + 1}\`, 420, y, 0);
  }
  // 晶振贴近 XTAL1/2（脚 19/18）
  setPos('Y1', ux - 180, uy + 850, 0);
  setPos('CX1', ux - 40, uy + 780, 0);
  setPos('CX2', ux - 40, uy + 920, 0);
  // 复位：RST=脚9
  setPos('R1', ux - 180, uy - 950 + 8 * 100, 0);
  setPos('C3', ux + 180, uy - 850, 0);
  // 电源指示
  setPos('R_PWR', ux + 200, uy - 1050, 0);
  setPos('D9', ux + 360, uy - 1050, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1300, y: uy }, 0);
  const hdrNets = [gnd, vcc, nrst, pwrLed];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  // 按 AT89 脚位把网络绑回 U1 / Y1
  const bindU1 = (padNum, net) => {
    const fp = byRef.get('U1');
    const pad = fp?.pads.find(p => p.number === String(padNum));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };
  for (let i = 0; i < 8; i++) {
    bindU1(i + 1, netByName(\`L\${i}_K\`));
  }
  bindU1(9, nrst);
  bindU1(18, xtal2);
  bindU1(19, xtal1);
  bindU1(20, gnd);
  bindU1(31, vcc); // EA
  bindU1(40, vcc);
  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal1) { p1.netId = xtal1.id; p1.netName = xtal1.name; }
    if (p2 && xtal2) { p2.netId = xtal2.id; p2.netName = xtal2.name; }
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

  // 晶振与负载电容
  add(xtal1, uX1, yA, 12, 'F.Cu');
  add(xtal2, uX2, yB, 12, 'F.Cu');
  add(xtal1, yA, cx1a, 12, 'F.Cu');
  add(xtal2, yB, cx2a, 12, 'F.Cu');
  addVia(gnd, cx1b);
  addVia(gnd, cx2b);
  add(gnd, cx1b, cx2b, 16, 'B.Cu');
  add(gnd, cx2b, { x: uGnd.x, y: cx2b.y }, 16, 'B.Cu');
  add(gnd, { x: uGnd.x, y: cx2b.y }, uGnd, 16, 'B.Cu');

  // 复位：VCC-R1-RST，C3 电源退耦
  add(vcc, r1a, { x: uVcc.x, y: r1a.y }, 16, 'B.Cu');
  addVia(vcc, { x: uVcc.x, y: r1a.y });
  add(vcc, { x: uVcc.x, y: r1a.y }, uVcc, 16, 'F.Cu');
  add(nrst, r1b, uRst, 12, 'F.Cu');
  addVia(vcc, c3a);
  add(vcc, c3a, { x: uVcc.x, y: c3a.y }, 16, 'B.Cu');
  add(vcc, { x: uVcc.x, y: c3a.y }, uVcc, 16, 'B.Cu');
  addVia(gnd, c3b);
  add(gnd, c3b, { x: uGnd.x, y: c3b.y }, 16, 'B.Cu');
  add(gnd, { x: uGnd.x, y: c3b.y }, uGnd, 16, 'B.Cu');
  // EA 接 VCC：右侧外廊，避免沿焊盘列竖穿
  add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 16, 'F.Cu');
  add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 16, 'F.Cu');
  add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 16, 'F.Cu');

  // 电源 LED：VCC-R_PWR-D9-GND
  add(vcc, rpA, { x: uVcc.x, y: rpA.y }, 16, 'B.Cu');
  add(pwrLed, rpB, d9a, 12, 'F.Cu');
  addVia(gnd, d9k);
  add(gnd, d9k, { x: uGnd.x, y: d9k.y }, 16, 'B.Cu');

  // 8 路流水灯
  const vBusX = 140;
  for (let i = 0; i < 8; i++) {
    const rlA = pw(\`RL\${i + 1}\`, 1);
    const rlB = pw(\`RL\${i + 1}\`, 2);
    const dA = pw(\`D\${i + 1}\`, 1);
    const dK = pw(\`D\${i + 1}\`, 2);
    const uP = pw('U1', i + 1);
    const netA = netByName(\`L\${i}_A\`);
    const netK = netByName(\`L\${i}_K\`);
    // VCC → RL.1（左侧总线）
    addVia(vcc, rlA);
    add(vcc, { x: vBusX, y: rlA.y }, rlA, 16, 'B.Cu');
    if (i === 0) {
      add(vcc, { x: vBusX, y: rlA.y }, { x: vBusX, y: uy - 950 + 7 * 100 }, 16, 'B.Cu');
      add(vcc, { x: vBusX, y: uy - 950 }, { x: uVcc.x, y: uy - 950 }, 16, 'B.Cu');
      addVia(vcc, { x: uVcc.x, y: uy - 950 });
      add(vcc, { x: uVcc.x, y: uy - 950 }, uVcc, 16, 'F.Cu');
    }
    // RL.2 → LED.A
    add(netA, rlB, dA, 12, 'F.Cu');
    // LED.K → P1.x（同行水平）
    add(netK, dK, uP, 12, 'F.Cu');
  }

  // 排针：GND/VCC/RST/PWR_LED
  add(gnd, uGnd, { x: jGnd.x, y: uGnd.y }, 16, 'B.Cu');
  addVia(gnd, { x: jGnd.x, y: uGnd.y });
  add(gnd, { x: jGnd.x, y: uGnd.y }, jGnd, 16, 'F.Cu');
  add(vcc, uVcc, { x: jVcc.x, y: uVcc.y }, 16, 'B.Cu');
  addVia(vcc, { x: jVcc.x, y: uVcc.y });
  add(vcc, { x: jVcc.x, y: uVcc.y }, jVcc, 16, 'F.Cu');
  add(nrst, uRst, { x: jRst.x, y: uRst.y }, 12, 'B.Cu');
  addVia(nrst, { x: jRst.x, y: uRst.y });
  add(nrst, { x: jRst.x, y: uRst.y }, jRst, 12, 'F.Cu');
  add(pwrLed, d9a, { x: jPwr.x, y: d9a.y }, 12, 'B.Cu');
  addVia(pwrLed, { x: jPwr.x, y: d9a.y });
  add(pwrLed, { x: jPwr.x, y: d9a.y }, jPwr, 12, 'F.Cu');

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

const insertAt = src.indexOf('\nfunction main()');
if (insertAt < 0) throw new Error('main not found');
src = src.slice(0, insertAt) + '\n' + fn + src.slice(insertAt);

src = src.replace(
  `} else if (id === 'lab_filter') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabFilter(doc);
    } else {
      route = autoRoute(doc);
    }
    applyLabBoardSize(doc, sch);
    const gndNet = doc.nets.find(n => isGndNet(n.name));
    if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter') {
      addCornerMountHoles(doc, gndNet);
    }`,
  `} else if (id === 'lab_filter') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabFilter(doc);
    } else if (id === 'lab_51_led') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab51Led(doc);
    } else {
      route = autoRoute(doc);
    }
    applyLabBoardSize(doc, sch);
    const gndNet = doc.nets.find(n => isGndNet(n.name));
    if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') {
      addCornerMountHoles(doc, gndNet);
    }`
);

src = src.replace(
  "const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter') ? ' [hand]' : '';",
  "const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') ? ' [hand]' : '';"
);

writeFileSync(path, src);
console.log('patched lab_51_led hand layout');
