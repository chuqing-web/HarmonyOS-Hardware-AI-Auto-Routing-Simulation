/**
 * 运放滞回比较器整形手布（Cu=4，每层都有走线）：
 *   F.Cu   — HYST 分压本地、OUT→Rf 短连、电源焊盘逃逸
 *   In1.Cu — GND 干线（底边横贯 + 各 GND 焊盘竖馈）
 *   In2.Cu — VCC 干线（顶边横贯 + U1/J1 竖馈）
 *   B.Cu   — INPUT_SIG / OUTPUT_SIG 扇出、VEE
 *
 * UA741：2 IN-  3 IN+  4 V-  6 OUT  7 V+
 */
function handLayoutLabSchmitt(doc) {
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
  const hyst = netByName('HYST');
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
  setPos('U1', 1200, 700, 0);
  setPos('Rf', 1580, 1100, 0);  // 1=HYST  2=OUT
  setPos('Rg', 820, 1100, 0);   // 1=HYST  2=GND
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 380, 600, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2400, 750, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1200, y: 1650 }, 0);
  const hdrNets = [gnd, vcc, vee];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 2, inputSig);
  bindPad('U1', 3, hyst);
  bindPad('U1', 4, vee);
  bindPad('U1', 6, outputSig);
  bindPad('U1', 7, vcc);
  bindPad('Rf', 1, hyst); bindPad('Rf', 2, outputSig);
  bindPad('Rg', 1, hyst); bindPad('Rg', 2, gnd);
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

  const uInM = pw('U1', 2), uInP = pw('U1', 3), uVee = pw('U1', 4);
  const uOut = pw('U1', 6), uVcc = pw('U1', 7);
  const rf1 = pw('Rf', 1), rf2 = pw('Rf', 2);
  const rg1 = pw('Rg', 1), rg2 = pw('Rg', 2);
  const sgOut = pw('SG1', 1), sgGnd = pw('SG1', 2);
  const oscCh1 = pw('OSC1', 1), oscCh2 = pw('OSC1', 2), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jVee = pw('J1', 3);

  // —— F：HYST — 左逃超过 INPUT 入焊盘 stub，再上绕到电阻横廊 ——
  if (hyst && uInP && rg1 && rf1 && uInM) {
    const pastIn = uInM.x - 110;
    const esc = { x: pastIn, y: uInP.y };
    const up = { x: esc.x, y: uInP.y - 80 };
    const col = { x: Math.min(esc.x, rg1.x) - 20, y: up.y };
    const drop = { x: col.x, y: rg1.y - 50 };
    const atRg = { x: rg1.x, y: drop.y };
    const atRf = { x: rf1.x, y: drop.y };
    add(hyst, uInP, esc, 12, 'F.Cu');
    add(hyst, esc, up, 12, 'F.Cu');
    add(hyst, up, col, 12, 'F.Cu');
    add(hyst, col, drop, 12, 'F.Cu');
    add(hyst, drop, atRg, 12, 'F.Cu');
    add(hyst, atRg, rg1, 12, 'F.Cu');
    add(hyst, atRg, atRf, 12, 'F.Cu');
    add(hyst, atRf, rf1, 12, 'F.Cu');
  }

  // —— F：OUT → Rf.2 ——
  if (outputSig && uOut && rf2) {
    const mid = { x: rf2.x, y: uOut.y };
    add(outputSig, uOut, mid, 12, 'F.Cu');
    add(outputSig, mid, rf2, 12, 'F.Cu');
  }

  // —— B：INPUT_SIG ——
  if (inputSig && sgOut && uInM && oscCh1) {
    const eSg = { x: sgOut.x + 70, y: sgOut.y };
    const eIn = { x: uInM.x - 70, y: uInM.y };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 280;
    add(inputSig, sgOut, eSg, 12, 'F.Cu');
    addVia(inputSig, eSg);
    L(inputSig, [eSg, { x: eSg.x, y: runY }, { x: eIn.x, y: runY }, eIn], 12, 'B.Cu');
    addVia(inputSig, eIn);
    add(inputSig, eIn, uInM, 12, 'F.Cu');
    L(inputSig, [eIn, { x: eIn.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(inputSig, eOsc);
    add(inputSig, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— B：OUTPUT_SIG → OSC CH2 ——
  if (outputSig && rf2 && oscCh2) {
    const eRf = { x: rf2.x + 60, y: rf2.y };
    const eOsc = { x: oscCh2.x - 70, y: oscCh2.y };
    const runY = 1280;
    add(outputSig, rf2, eRf, 12, 'F.Cu');
    addVia(outputSig, eRf);
    L(outputSig, [eRf, { x: eRf.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(outputSig, eOsc);
    add(outputSig, eOsc, oscCh2, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc && uVcc && jVcc) {
    const busY = 120;
    const eU = { x: uVcc.x + 60, y: uVcc.y };
    add(vcc, uVcc, eU, 16, 'F.Cu');
    addVia(vcc, eU);
    L(vcc, [eU, { x: eU.x, y: busY }], 18, 'In2.Cu');
    add(vcc, { x: 160, y: busY }, { x: 2640, y: busY }, 20, 'In2.Cu');
    addVia(vcc, jVcc);
    L(vcc, [jVcc, { x: jVcc.x, y: busY }], 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 1880;
    add(gnd, { x: 160, y: busY }, { x: 2640, y: busY }, 20, 'In1.Cu');
    if (rg2) {
      const v = { x: rg2.x, y: rg2.y + 60 };
      add(gnd, rg2, v, 12, 'F.Cu');
      addVia(gnd, v);
      L(gnd, [v, { x: v.x, y: busY }], 14, 'In1.Cu');
    }
    if (sgGnd) {
      const v = { x: sgGnd.x, y: sgGnd.y + 60 };
      add(gnd, sgGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      L(gnd, [v, { x: v.x, y: busY }], 14, 'In1.Cu');
    }
    if (oscGnd) {
      const v = { x: oscGnd.x - 60, y: oscGnd.y };
      add(gnd, oscGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      L(gnd, [v, { x: v.x, y: busY }], 14, 'In1.Cu');
    }
    if (jGnd) {
      addVia(gnd, jGnd);
      L(gnd, [jGnd, { x: jGnd.x, y: busY }], 14, 'In1.Cu');
    }
  }

  // —— B：VEE（焊盘直接左逃，HYST 已改走上绕）——
  if (vee && uVee && jVee) {
    const eU = { x: uVee.x - 100, y: uVee.y };
    const eJ = { x: jVee.x - 80, y: jVee.y };
    const runY = 1450;
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
