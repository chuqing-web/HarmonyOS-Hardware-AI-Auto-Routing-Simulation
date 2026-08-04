/**
 * RC 积分电路手布（Cu=4，每层都有走线）：
 *   F.Cu   — R1/积分节点/Cf·Rf 反馈本地
 *   In1.Cu — GND 干线（底边横贯，经各馈点显式折线）
 *   In2.Cu — VCC 干线（顶边横贯，经各馈点显式折线）
 *   B.Cu   — INPUT_SIG / OUTPUT_SIG 扇出、VEE
 *
 * UA741：2 IN-  3 IN+  4 V-  6 OUT  7 V+
 * 网络：INPUT→R1→INT_NODE(IN-/Cf/Rf)→OUT；IN+→GND
 */
function handLayoutLabIntegrator(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

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
  const vee = netByName('VEE');
  const inputSig = netByName('INPUT_SIG');
  const intNode = netByName('INT_NODE');
  const outputSig = netByName('OUTPUT_SIG');

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

  // —— 放置 ——
  setPos('U1', 1300, 750, 0);
  setPos('R1', 900, 720, 0);     // 1=INPUT  2=INT
  setPos('Cf', 1680, 620, 0);    // 1=INT    2=OUT
  setPos('Rf', 1680, 920, 0);    // 1=INT    2=OUT
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 380, 650, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2500, 780, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1300, y: 1680 }, 0);
  const hdrNets = [gnd, vcc, vee];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 2, intNode);
  bindPad('U1', 3, gnd);
  bindPad('U1', 4, vee);
  bindPad('U1', 6, outputSig);
  bindPad('U1', 7, vcc);
  bindPad('R1', 1, inputSig); bindPad('R1', 2, intNode);
  bindPad('Cf', 1, intNode); bindPad('Cf', 2, outputSig);
  bindPad('Rf', 1, intNode); bindPad('Rf', 2, outputSig);
  bindPad('SG1', 1, inputSig); bindPad('SG1', 2, gnd);
  bindPad('OSC1', 1, inputSig); bindPad('OSC1', 2, outputSig); bindPad('OSC1', 5, gnd);

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
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
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
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  /** 内层干线：竖馈到 busY 后，按 x 排序显式折线串过每个馈点 */
  const planeBus = (net, vias, busY, w = 18, layer = 'In1.Cu') => {
    if (!net || !vias.length) return;
    const js = vias.map(v => ({ x: v.x, y: busY })).sort((a, b) => a.x - b.x);
    for (const v of vias) L(net, [v, { x: v.x, y: busY }], w, layer);
    const left = { x: js[0].x - 100, y: busY };
    const right = { x: js[js.length - 1].x + 100, y: busY };
    L(net, [left, ...js, right], w + 2, layer);
  };

  const uInM = pw('U1', 2), uInP = pw('U1', 3), uVee = pw('U1', 4);
  const uOut = pw('U1', 6), uVcc = pw('U1', 7);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const cf1 = pw('Cf', 1), cf2 = pw('Cf', 2);
  const rf1 = pw('Rf', 1), rf2 = pw('Rf', 2);
  const sgOut = pw('SG1', 1), sgGnd = pw('SG1', 2);
  const oscCh1 = pw('OSC1', 1), oscCh2 = pw('OSC1', 2), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jVee = pw('J1', 3);

  // —— F：R1.2→IN-（左逃超过 VEE stub）——
  if (intNode && r1b && uInM) {
    const esc = { x: uInM.x - 130, y: uInM.y };
    const atR = { x: esc.x, y: r1b.y };
    add(intNode, uInM, esc, 12, 'F.Cu');
    add(intNode, esc, atR, 12, 'F.Cu');
    add(intNode, atR, r1b, 12, 'F.Cu');
  }

  // —— F：INT 底绕至 Cf/Rf 左廊 ——
  if (intNode && cf1 && rf1 && uInM) {
    const busX = Math.min(cf1.x, rf1.x) - 55;
    const esc = { x: uInM.x - 130, y: uInM.y };
    const underY = Math.max(rf1.y, uInM.y) + 80;
    const atUnder = { x: esc.x, y: underY };
    const atBus = { x: busX, y: underY };
    add(intNode, esc, atUnder, 12, 'F.Cu');
    add(intNode, atUnder, atBus, 12, 'F.Cu');
    add(intNode, atBus, { x: busX, y: rf1.y }, 12, 'F.Cu');
    add(intNode, { x: busX, y: rf1.y }, rf1, 12, 'F.Cu');
    add(intNode, { x: busX, y: rf1.y }, { x: busX, y: cf1.y }, 12, 'F.Cu');
    add(intNode, { x: busX, y: cf1.y }, cf1, 12, 'F.Cu');
  }

  // —— F：OUT 顶绕至 Cf/Rf 右廊，再从右廊扇出到示波器 ——
  let outBusX = null;
  if (outputSig && uOut && cf2 && rf2) {
    outBusX = Math.max(cf2.x, rf2.x) + 55;
    const overY = Math.min(cf2.y, uOut.y) - 80;
    const esc = { x: uOut.x + 90, y: uOut.y };
    const up = { x: esc.x, y: overY };
    const atTop = { x: outBusX, y: overY };
    add(outputSig, uOut, esc, 12, 'F.Cu');
    add(outputSig, esc, up, 12, 'F.Cu');
    add(outputSig, up, atTop, 12, 'F.Cu');
    add(outputSig, atTop, { x: outBusX, y: cf2.y }, 12, 'F.Cu');
    add(outputSig, { x: outBusX, y: cf2.y }, cf2, 12, 'F.Cu');
    add(outputSig, { x: outBusX, y: cf2.y }, { x: outBusX, y: rf2.y }, 12, 'F.Cu');
    add(outputSig, { x: outBusX, y: rf2.y }, rf2, 12, 'F.Cu');
  }

  // —— B：INPUT_SIG  SG1 → R1.1 → OSC CH1 ——
  if (inputSig && sgOut && r1a && oscCh1) {
    const eSg = { x: sgOut.x + 70, y: sgOut.y };
    const eR = { x: r1a.x - 55, y: r1a.y };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 280;
    add(inputSig, sgOut, eSg, 12, 'F.Cu');
    addVia(inputSig, eSg);
    L(inputSig, [eSg, { x: eSg.x, y: runY }, { x: eR.x, y: runY }, eR], 12, 'B.Cu');
    addVia(inputSig, eR);
    add(inputSig, eR, r1a, 12, 'F.Cu');
    L(inputSig, [eR, { x: eR.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(inputSig, eOsc);
    add(inputSig, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— B：OUTPUT_SIG → OSC CH2（从右廊出发，避免折返穿 Rf）——
  if (outputSig && rf2 && oscCh2 && outBusX !== null) {
    const eRf = { x: outBusX + 45, y: rf2.y };
    const eOsc = { x: oscCh2.x - 70, y: oscCh2.y };
    const runY = 1280;
    add(outputSig, { x: outBusX, y: rf2.y }, eRf, 12, 'F.Cu');
    addVia(outputSig, eRf);
    L(outputSig, [eRf, { x: eRf.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(outputSig, eOsc);
    add(outputSig, eOsc, oscCh2, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc && uVcc && jVcc) {
    const busY = 120;
    const eU = { x: uVcc.x, y: uVcc.y - 55 };
    add(vcc, uVcc, eU, 16, 'F.Cu');
    addVia(vcc, eU);
    addVia(vcc, jVcc);
    planeBus(vcc, [eU, jVcc], busY, 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 1900;
    const vias = [];
    if (uInP) {
      const v = { x: uInP.x + 50, y: uInP.y };
      add(gnd, uInP, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (sgGnd) {
      const v = { x: sgGnd.x, y: sgGnd.y + 60 };
      add(gnd, sgGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (oscGnd) {
      const v = { x: oscGnd.x - 60, y: oscGnd.y };
      add(gnd, oscGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (jGnd) {
      addVia(gnd, jGnd);
      vias.push(jGnd);
    }
    planeBus(gnd, vias, busY, 14, 'In1.Cu');
  }

  // —— B：VEE ——
  if (vee && uVee && jVee) {
    const eU = { x: uVee.x - 100, y: uVee.y };
    const eJ = { x: jVee.x - 80, y: jVee.y };
    const runY = 1480;
    add(vee, uVee, eU, 16, 'F.Cu');
    addVia(vee, eU);
    L(vee, [eU, { x: eU.x, y: runY }, { x: eJ.x, y: runY }, eJ], 16, 'B.Cu');
    addVia(vee, eJ);
    add(vee, eJ, jVee, 16, 'F.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 6,
    viaCount: doc.vias.length
  };
}
