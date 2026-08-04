/**
 * 555 多谐振荡器手布（Cu=4，每层都有走线）：
 *   F.Cu   — 本地短连（DISCH/CAP 右侧、OUT/LED 左侧）
 *   In1.Cu — GND 干线（底边横贯 + 竖馈，显式折线）
 *   In2.Cu — VCC 干线（顶边横贯 + 竖馈，显式折线）
 *   B.Cu   — TRIG↔THRES、CTRL、DISCH 跨列、OUT→示波器
 *
 * LM555：1 GND  2 TRIG  3 OUT  4 RESET  5 CTRL  6 THRES  7 DISCH  8 VCC
 */
function handLayoutLab555Astable(doc) {
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
  const disch = netByName('DISCH');
  const cap = netByName('555_CAP');
  const out = netByName('555_OUT');
  const ledPath = netByName('LED_PATH');
  const ctrl = netByName('555_CTRL');

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

  setPos('U1', 1100, 1000, 0);
  setPos('RA', 1550, 780, 0);
  setPos('RB', 1780, 1100, 0);
  setPos('CT', 1780, 1400, 0);
  setPos('CD1', 1550, 520, 0);
  setPos('CC1', 1950, 1000, 0);
  // RLED 在芯片左侧：pad2 朝芯片接 OUT，pad1 朝左接 LED
  setPos('RLED', 600, 720, 0);
  setPos('D1', 320, 720, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2450, 1000, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1100, y: 1850 }, 0);
  const hdrNets = [gnd, vcc];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 1, gnd);
  bindPad('U1', 2, cap);
  bindPad('U1', 3, out);
  bindPad('U1', 4, vcc);
  bindPad('U1', 5, ctrl);
  bindPad('U1', 6, cap);
  bindPad('U1', 7, disch);
  bindPad('U1', 8, vcc);
  bindPad('RA', 1, vcc); bindPad('RA', 2, disch);
  bindPad('RB', 1, disch); bindPad('RB', 2, cap);
  bindPad('CT', 1, cap); bindPad('CT', 2, gnd);
  bindPad('CD1', 1, vcc); bindPad('CD1', 2, gnd);
  bindPad('CC1', 1, ctrl); bindPad('CC1', 2, gnd);
  bindPad('RLED', 2, out); bindPad('RLED', 1, ledPath);
  // D1 在 RLED 左侧：pad2（右）朝电阻接 LED_PATH，pad1（左）接 GND
  bindPad('D1', 2, ledPath); bindPad('D1', 1, gnd);
  bindPad('OSC1', 1, out); bindPad('OSC1', 5, gnd);

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
  const planeBus = (net, vias, busY, w = 18, layer = 'In1.Cu') => {
    if (!net || !vias.length) return;
    const js = vias.map(v => ({ x: v.x, y: busY })).sort((a, b) => a.x - b.x);
    for (const v of vias) L(net, [v, { x: v.x, y: busY }], w, layer);
    const left = { x: js[0].x - 120, y: busY };
    const right = { x: js[js.length - 1].x + 120, y: busY };
    L(net, [left, ...js, right], w + 2, layer);
  };

  const uGnd = pw('U1', 1), uTrig = pw('U1', 2), uOut = pw('U1', 3), uRst = pw('U1', 4);
  const uCtrl = pw('U1', 5), uThres = pw('U1', 6), uDisch = pw('U1', 7), uVcc = pw('U1', 8);
  const ra1 = pw('RA', 1), ra2 = pw('RA', 2);
  const rb1 = pw('RB', 1), rb2 = pw('RB', 2);
  const ct1 = pw('CT', 1), ct2 = pw('CT', 2);
  const cd1 = pw('CD1', 1), cd2 = pw('CD1', 2);
  const cc1 = pw('CC1', 1), cc2 = pw('CC1', 2);
  const rlOut = pw('RLED', 2), rlLed = pw('RLED', 1);
  const dA = pw('D1', 2), dK = pw('D1', 1);
  const oscCh1 = pw('OSC1', 1), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);

  // —— F：DISCH U1.7 → RA.2；B：RA → RB（下廊 y=1550）——
  if (disch && uDisch && ra2) {
    const atRa = { x: ra2.x, y: uDisch.y };
    add(disch, uDisch, atRa, 12, 'F.Cu');
    add(disch, atRa, ra2, 12, 'F.Cu');
  }
  if (disch && ra2 && rb1) {
    const eA = { x: ra2.x + 50, y: ra2.y };
    const eB = { x: rb1.x - 50, y: rb1.y };
    const runY = 1550;
    add(disch, ra2, eA, 12, 'F.Cu');
    addVia(disch, eA);
    add(disch, rb1, eB, 12, 'F.Cu');
    addVia(disch, eB);
    L(disch, [eA, { x: eA.x, y: runY }, { x: eB.x, y: runY }, eB], 12, 'B.Cu');
  }

  // —— F：CAP U1.6 → RB.2 → CT.1（折线避开 CT.2 GND）——
  if (cap && uThres && rb2 && ct1) {
    const atRb = { x: rb2.x, y: uThres.y };
    add(cap, uThres, atRb, 12, 'F.Cu');
    add(cap, atRb, rb2, 12, 'F.Cu');
    const midY = (rb2.y + ct1.y) / 2;
    L(cap, [rb2, { x: rb2.x, y: midY }, { x: ct1.x, y: midY }, ct1], 12, 'F.Cu');
  }
  // —— B：TRIG ↔ THRES（F 仅短左 stub，下潜走 B，避开 OUT）——
  if (cap && uTrig && uThres) {
    const eTr = { x: uTrig.x - 55, y: uTrig.y };
    const eTh = { x: uThres.x + 70, y: uThres.y };
    const runY = 1750;
    add(cap, uTrig, eTr, 12, 'F.Cu');
    addVia(cap, eTr);
    add(cap, uThres, eTh, 12, 'F.Cu');
    addVia(cap, eTh);
    L(cap, [eTr, { x: eTr.x, y: runY }, { x: eTh.x, y: runY }, eTh], 12, 'B.Cu');
  }

  // —— B：CTRL → CC1（上廊 y=400，避开 DISCH/CAP 下廊）——
  if (ctrl && uCtrl && cc1) {
    const eU = { x: uCtrl.x + 120, y: uCtrl.y };
    const eC = { x: cc1.x, y: cc1.y - 55 };
    const runY = 400;
    add(ctrl, uCtrl, eU, 12, 'F.Cu');
    addVia(ctrl, eU);
    add(ctrl, cc1, eC, 12, 'F.Cu');
    addVia(ctrl, eC);
    L(ctrl, [eU, { x: eU.x, y: runY }, { x: eC.x, y: runY }, eC], 12, 'B.Cu');
  }

  // —— F：OUT → RLED.2（先左再走，避开同列 pad4 VCC stub）——
  if (out && uOut && rlOut) {
    const esc = { x: Math.min(uOut.x - 120, rlOut.x + 40), y: uOut.y };
    L(out, [uOut, esc, { x: esc.x, y: rlOut.y }, rlOut], 12, 'F.Cu');
  }
  if (ledPath && rlLed && dA) {
    add(ledPath, rlLed, dA, 12, 'F.Cu');
  }

  // —— B：OUT → OSC（最上廊 y=220）——
  if (out && rlOut && oscCh1) {
    const eR = { x: rlOut.x, y: rlOut.y - 55 };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 220;
    add(out, rlOut, eR, 12, 'F.Cu');
    addVia(out, eR);
    L(out, [eR, { x: eR.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(out, eOsc);
    add(out, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc) {
    const busY = 120;
    const vias = [];
    if (uVcc) {
      const v = { x: uVcc.x, y: uVcc.y - 55 };
      add(vcc, uVcc, v, 16, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (uRst) {
      const v = { x: uRst.x + 55, y: uRst.y };
      add(vcc, uRst, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (ra1) {
      const v = { x: ra1.x, y: ra1.y - 50 };
      add(vcc, ra1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (cd1) {
      const v = { x: cd1.x, y: cd1.y - 50 };
      add(vcc, cd1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (jVcc) {
      addVia(vcc, jVcc);
      vias.push(jVcc);
    }
    planeBus(vcc, vias, busY, 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 2100;
    const vias = [];
    if (uGnd) {
      const v = { x: uGnd.x - 55, y: uGnd.y };
      add(gnd, uGnd, v, 14, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    const gndFeed = (pad, dx, dy) => {
      if (!pad) return;
      const v = { x: pad.x + dx, y: pad.y + dy };
      add(gnd, pad, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    };
    gndFeed(ct2, 90, 80);
    gndFeed(cd2, 70, 55);
    gndFeed(cc2, 0, 55);
    gndFeed(dK, -60, 0);
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

  return {
    trackCount: doc.tracks.length,
    netCount: 7,
    viaCount: doc.vias.length
  };
}
