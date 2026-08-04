/**
 * 555 单稳态延时手布（Cu=4，每层都有走线）：
 *   F.Cu   — 本地短连（555_RC 右侧、TRIG/OUT/LED 左侧）
 *   In1.Cu — GND 显式连线干线（底边横贯 + 竖馈，非覆铜）
 *   In2.Cu — VCC 显式连线干线（顶边横贯 + 竖馈，非覆铜）
 *   B.Cu   — CTRL、TRIG→按键、OUT→示波器
 *
 * LM555：1 GND  2 TRIG  3 OUT  4 RESET  5 CTRL  6 THRES  7 DISCH  8 VCC
 * 单稳态：THRES+DISCH=555_RC；TRIG 经 RP 上拉，SW1 对地触发
 */
function handLayoutLab555Monostable(doc) {
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
  const rc = netByName('555_RC');
  const trig = netByName('TRIG');
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
  setPos('RT', 1550, 780, 0);
  setPos('CT', 1780, 1200, 0);
  setPos('CD1', 1550, 520, 0);
  setPos('CC1', 1950, 1000, 0);
  // RP/SW 靠左下，避开 OUT 左廊；RP pad2 朝右接 TRIG
  setPos('RP', 380, 980, 0);
  setPos('SW1', 380, 1350, 0);
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
  bindPad('U1', 2, trig);
  bindPad('U1', 3, out);
  bindPad('U1', 4, vcc);
  bindPad('U1', 5, ctrl);
  bindPad('U1', 6, rc);
  bindPad('U1', 7, rc);
  bindPad('U1', 8, vcc);
  bindPad('RT', 1, vcc); bindPad('RT', 2, rc);
  bindPad('CT', 1, rc); bindPad('CT', 2, gnd);
  bindPad('RP', 1, vcc); bindPad('RP', 2, trig);
  // 6x6 轻触：1↔3、2↔4 内短
  bindPad('SW1', 1, gnd); bindPad('SW1', 3, gnd);
  bindPad('SW1', 2, trig); bindPad('SW1', 4, trig);
  bindPad('CD1', 1, vcc); bindPad('CD1', 2, gnd);
  bindPad('CC1', 1, ctrl); bindPad('CC1', 2, gnd);
  bindPad('RLED', 2, out); bindPad('RLED', 1, ledPath);
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
  const rt1 = pw('RT', 1), rt2 = pw('RT', 2);
  const ct1 = pw('CT', 1), ct2 = pw('CT', 2);
  const rp1 = pw('RP', 1), rp2 = pw('RP', 2);
  const swGnd = pw('SW1', 1), swTrig = pw('SW1', 2);
  const cd1 = pw('CD1', 1), cd2 = pw('CD1', 2);
  const cc1 = pw('CC1', 1), cc2 = pw('CC1', 2);
  const rlOut = pw('RLED', 2), rlLed = pw('RLED', 1);
  const dA = pw('D1', 2), dK = pw('D1', 1);
  const oscCh1 = pw('OSC1', 1), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);

  // —— F：555_RC 短接 THRES↔DISCH，再连 RT.2 / CT.1 ——
  if (rc && uThres && uDisch) {
    add(rc, uThres, uDisch, 12, 'F.Cu');
  }
  if (rc && uDisch && rt2) {
    const atRt = { x: rt2.x, y: uDisch.y };
    add(rc, uDisch, atRt, 12, 'F.Cu');
    add(rc, atRt, rt2, 12, 'F.Cu');
  }
  if (rc && rt2 && ct1) {
    const midY = (rt2.y + ct1.y) / 2;
    L(rc, [rt2, { x: rt2.x, y: midY }, { x: ct1.x, y: midY }, ct1], 12, 'F.Cu');
  }

  // —— B：TRIG（F 仅短左 stub，避免与 GND/OUT 同层打架）——
  if (trig && uTrig && rp2 && swTrig) {
    const eU = { x: uTrig.x - 55, y: uTrig.y };
    const eR = { x: rp2.x + 50, y: rp2.y };
    const eS = { x: swTrig.x, y: swTrig.y - 55 };
    const runY = 1600;
    add(trig, uTrig, eU, 12, 'F.Cu');
    addVia(trig, eU);
    add(trig, rp2, eR, 12, 'F.Cu');
    addVia(trig, eR);
    add(trig, swTrig, eS, 12, 'F.Cu');
    addVia(trig, eS);
    L(trig, [
      eU, { x: eU.x, y: runY },
      { x: eR.x, y: runY }, eR
    ], 12, 'B.Cu');
    L(trig, [
      { x: eR.x, y: runY },
      { x: eS.x, y: runY }, eS
    ], 12, 'B.Cu');
  }

  // —— B：CTRL → CC1（上廊 y=400）——
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

  // —— F：OUT → RLED.2（先左再走，避开 TRIG / pad4 VCC）——
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
    if (rt1) {
      const v = { x: rt1.x, y: rt1.y - 50 };
      add(vcc, rt1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (rp1) {
      const v = { x: rp1.x - 50, y: rp1.y };
      add(vcc, rp1, v, 14, 'F.Cu');
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
      // 仅水平左逃，勿竖穿同列 TRIG/OUT
      const v = { x: uGnd.x - 90, y: uGnd.y };
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
    gndFeed(swGnd, -70, 0);
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
