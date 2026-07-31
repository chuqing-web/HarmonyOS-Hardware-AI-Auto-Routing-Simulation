import { readFileSync, writeFileSync } from 'fs';
const p = new URL('./export.mjs', import.meta.url);
let s = readFileSync(p, 'utf8');
const a = s.indexOf('  /** SMD：F 短 stub 到旁侧过孔，再接 B */\n  const smdToB = (net, padPt, dx, dy, w = 14) => {');
// only inside lab51 - find within handLayoutLab51Led
const fn = s.indexOf('function handLayoutLab51Led');
const main = s.indexOf('\nfunction main()', fn);
const local = s.slice(fn, main);
const idx = local.indexOf('  /** SMD：F 短 stub 到旁侧过孔，再接 B */');
if (idx < 0) throw new Error('smdToB block not found in lab51');
const abs = fn + idx;
const endLocal = local.lastIndexOf('  return {');
const absEnd = fn + endLocal;

const repl = `  /** SMD：F 短 stub 到旁侧过孔，再接 B */
  const smdToB = (net, padPt, dx, dy, w = 14) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };
  /** 排针：先到板底专属 chanY（B），再横到 riseX，F 上升到针脚 */
  let slot = 0;
  const toHeader = (net, esc, jPad, w = 16) => {
    if (!net) return;
    const s = slot++;
    const riseX = 1200 + s * 50;
    const chanY = uy + 1180 + s * 40;
    const atChan = { x: esc.x, y: chanY };
    const atCol = { x: riseX, y: chanY };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atChan, w, 'B.Cu');
    addVia(net, atChan);
    add(net, atChan, atCol, w, 'B.Cu');
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

  const gndRailX = leftX - 140;
  const vccRailX = rightX + 90;
  const ledVccX = 90;

  // —— 晶振：MCU↔Y1，CX 只接到 Y1 同侧，GND 向下 ——
  add(xtal1, uX1, yB, 12, 'F.Cu');
  add(xtal2, uX2, yA, 12, 'F.Cu');
  add(xtal1, yB, cx1a, 12, 'F.Cu');
  add(xtal2, yA, cx2a, 12, 'F.Cu');
  const eCx1g = smdToB(gnd, cx1b, 0, 50, 14);
  const eCx2g = smdToB(gnd, cx2b, 0, 50, 14);
  add(gnd, eCx1g, { x: gndRailX, y: eCx1g.y }, 16, 'B.Cu');
  add(gnd, eCx2g, { x: gndRailX, y: eCx2g.y }, 16, 'B.Cu');
  add(gnd, { x: gndRailX, y: eCx1g.y }, { x: gndRailX, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: gndRailX, y: uGnd.y }, uGnd, 16, 'B.Cu');

  // —— 复位：R1 竖放左侧，VCC 只接到 ledVcc 左总线 ——
  add(nrst, r1b, uRst, 12, 'F.Cu');
  const eR1v = smdToB(vcc, r1a, -50, 0, 14);
  add(vcc, eR1v, { x: ledVccX, y: eR1v.y }, 16, 'B.Cu');

  // —— 右侧退耦 + VCC/EA ——
  const eC3v = smdToB(vcc, c3a, 50, 0, 14);
  const eC3g = smdToB(gnd, c3b, 50, 0, 14);
  add(vcc, eC3v, { x: vccRailX, y: eC3v.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eC3v.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: uVcc.y }, uVcc, 16, 'B.Cu');
  add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 16, 'F.Cu');
  add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 16, 'F.Cu');
  add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 16, 'F.Cu');
  add(gnd, eC3g, { x: vccRailX + 50, y: eC3g.y }, 16, 'B.Cu');
  add(gnd, { x: vccRailX + 50, y: eC3g.y }, { x: vccRailX + 50, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: vccRailX + 50, y: uGnd.y }, { x: gndRailX, y: uGnd.y }, 16, 'B.Cu');

  // —— 电源 LED ——
  const eRpv = smdToB(vcc, rpA, 50, 0, 14);
  add(vcc, eRpv, { x: vccRailX, y: eRpv.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eRpv.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(pwrLed, rpB, d9a, 12, 'F.Cu');
  const eD9g = smdToB(gnd, d9k, 0, 50, 14);
  add(gnd, eD9g, { x: vccRailX + 50, y: eD9g.y }, 16, 'B.Cu');
  add(gnd, { x: vccRailX + 50, y: eD9g.y }, { x: vccRailX + 50, y: uGnd.y }, 16, 'B.Cu');

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
      // 左总线经板顶接到右 VCC rail
      const topY = pinY(1) - 90;
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: topY }, { x: vccRailX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: topY }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
    }
    add(netA, rlB, dA, 12, 'F.Cu');
    add(netK, dK, uP, 12, 'F.Cu');
  }
  // R1 的 VCC 支路接到左总线竖线
  add(vcc, { x: ledVccX, y: eR1v.y }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');

  // —— 排针 ——
  toHeader(gnd, { x: gndRailX, y: uGnd.y }, jGnd, 16);
  toHeader(vcc, { x: vccRailX, y: uVcc.y }, jVcc, 16);
  const eRst = smdToB(nrst, uRst, -70, 0, 12);
  // uRst is TH - smdToB still OK (F stub + via)
  toHeader(nrst, eRst, jRst, 12);
  const ePwr = smdToB(pwrLed, d9a, 50, 0, 12);
  toHeader(pwrLed, ePwr, jPwr, 12);

  const ledNets = [];
  for (let i = 0; i < 8; i++) {
    ledNets.push(netByName(\`L\${i}_A\`), netByName(\`L\${i}_K\`));
  }
  `;

writeFileSync(p, s.slice(0, abs) + repl + s.slice(absEnd));
console.log('rewrote routing block');
