  const vBusTop = 40;
  const vBusLow = 700;
  const vSpineL = 80;
  if (vcc) {
    add(vcc, { x: vSpineL, y: vBusTop }, { x: 2600, y: vBusTop }, 20, 'F.Cu');
    for (const [ref, num] of [['U1', 7], ['U2', 8], ['U3', 8], ['U5', 8], ['U5', 4],
      ['RA', 1], ['CD555', 1]]) {
      const p = pw(ref, num);
      if (!p) continue;
      const esc = { x: p.x + 30, y: p.y };
      add(vcc, p, esc, 14, 'F.Cu');
      addVia(vcc, esc);
      add(vcc, esc, { x: esc.x, y: vBusTop }, 14, 'B.Cu');
      addVia(vcc, { x: esc.x, y: vBusTop });
    }
    addVia(vcc, { x: vSpineL, y: vBusTop });
    add(vcc, { x: vSpineL, y: vBusTop }, { x: vSpineL, y: vBusLow }, 18, 'B.Cu');
    addVia(vcc, { x: vSpineL, y: vBusLow });
    add(vcc, { x: vSpineL, y: vBusLow }, { x: 2100, y: vBusLow }, 18, 'B.Cu');
    for (const [ref, num] of [['CI1', 1], ['CI2', 1], ['CI3', 1],
      ['REG1', 1], ['REG2', 1], ['REG3', 1], ['CBI', 1], ['U4', 1]]) {
      const p = pw(ref, num);
      if (!p) continue;
      addVia(vcc, { x: p.x, y: vBusLow });
      add(vcc, { x: p.x, y: vBusLow }, p, 14, 'F.Cu');
    }
  }

  add(bufIn, pw('R1', 2), pw('U1', 3), 12, 'F.Cu');
  {
    const o = pw('U1', 6);
    const m = pw('U1', 2);
    if (o && m) L(out741, [o, { x: o.x + 70, y: o.y }, { x: o.x + 70, y: 180 },
      { x: m.x - 50, y: 180 }, { x: m.x - 50, y: m.y }, m], 12, 'F.Cu');
  }
  {
    const o = pw('U1', 6);
    const r = pw('R2', 1);
    if (o && r) L(out741, [{ x: o.x + 70, y: o.y }, { x: o.x + 70, y: r.y }, r], 12, 'F.Cu');
  }
  add(tlIn, pw('R2', 2), pw('U2', 3), 12, 'F.Cu');
  add(tlOut, pw('U2', 1), pw('U2', 2), 10, 'F.Cu');
  add(u2b, pw('U2', 7), pw('U2', 6), 10, 'F.Cu');
  {
    const o = pw('U2', 1);
    const r = pw('R3', 1);
    // 顶廊 y=160，避开后续 LM 左廊
    if (o && r) L(tlOut, [o, { x: o.x, y: 160 }, { x: r.x, y: 160 }, r], 12, 'F.Cu');
  }
  add(lmIn, pw('R3', 2), pw('U3', 3), 12, 'F.Cu');
  {
    const out = pw('U3', 1);
    const inm = pw('U3', 2);
    const rf1 = pw('Rf3', 1);
    const rf2 = pw('Rf3', 2);
    // 先短左逃再下，避免穿同列 IN+/LM_IN；深廊互异
    if (out && rf2) L(lmOut, [
      out, { x: out.x - 55, y: out.y }, { x: out.x - 55, y: 500 },
      { x: rf2.x, y: 500 }, rf2
    ], 12, 'F.Cu');
    if (inm && rf1) L(lmFb, [
      inm, { x: inm.x - 90, y: inm.y }, { x: inm.x - 90, y: 540 },
      { x: rf1.x, y: 540 }, rf1
    ], 12, 'F.Cu');
  }
  ortho(lmFb, pw('Rf3', 1), pw('Rg3', 1), 12, true);
  add(u3b, pw('U3', 7), pw('U3', 6), 10, 'F.Cu');
  if (gnd) {
    for (const [ref, num] of [['U1', 4], ['U2', 4], ['U2', 5], ['U3', 4], ['U3', 5], ['Rg3', 2]]) {
      addVia(gnd, pw(ref, num));
    }
  }

  // 555：DISCH / CAP 分列（-90 / -50），禁止共竖井
  add(disch, pw('RA', 2), pw('RB', 1), 12, 'F.Cu');
  {
    const rb1 = pw('RB', 1);
    const d = pw('U5', 7);
    if (rb1 && d) L(disch, [rb1, { x: d.x - 90, y: rb1.y }, { x: d.x - 90, y: d.y }, d], 12, 'F.Cu');
  }
  add(cap555, pw('RB', 2), pw('CT', 1), 12, 'F.Cu');
  {
    const ct1 = pw('CT', 1);
    const t = pw('U5', 2);
    if (ct1 && t) L(cap555, [ct1, { x: t.x - 50, y: ct1.y }, { x: t.x - 50, y: t.y }, t], 12, 'F.Cu');
  }
  {
    const t2 = pw('U5', 2);
    const t6 = pw('U5', 6);
    if (t2 && t6) L(cap555, [t2, { x: t2.x, y: 190 }, { x: t6.x, y: 190 }, t6], 12, 'F.Cu');
  }
  add(out555, pw('U5', 3), pw('RLED', 1), 12, 'F.Cu');
  add(led555, pw('RLED', 2), pw('D555', 1), 12, 'F.Cu');
  add(ctrl, pw('U5', 5), pw('CC555', 1), 12, 'F.Cu');
  if (gnd) {
    for (const [ref, num] of [['U5', 1], ['CT', 2], ['CD555', 2], ['CC555', 2], ['D555', 2]]) {
      addVia(gnd, pw(ref, num));
    }
  }

  for (let i = 1; i <= 3; i++) {
    const vout = i === 1 ? vout0 : i === 2 ? vout1 : vout2;
    add(vout, pw(`REG${i}`, 3), pw(`CO${i}`, 1), 14, 'F.Cu');
    add(vout, pw(`CO${i}`, 1), pw(`RL${i}`, 1), 12, 'F.Cu');
    if (gnd) {
      addVia(gnd, pw(`REG${i}`, 2));
      addVia(gnd, pw(`CI${i}`, 2));
      addVia(gnd, pw(`CO${i}`, 2));
      addVia(gnd, pw(`RL${i}`, 2));
    }
  }

  add(buckSw, pw('U4', 2), pw('LB', 1), 14, 'F.Cu');
  add(buckOut, pw('LB', 2), pw('CBO', 1), 14, 'F.Cu');
  ortho(buckOut, pw('CBO', 1), pw('U4', 4), 12, false);
  add(buckOut, pw('U4', 4), pw('U4', 5), 12, 'F.Cu');
  add(buckOut, pw('CBO', 1), pw('RFB', 1), 12, 'F.Cu');
  if (gnd) {
    for (const [ref, num] of [['U4', 3], ['CBI', 2], ['CBO', 2], ['RFB', 2]]) addVia(gnd, pw(ref, num));
  }

  const jGnd = pw('J1', 1);
  const jVcc = pw('J1', 2);
  const jSig = pw('J1', 3);
  const jLm = pw('J1', 4);
  const j555 = pw('J1', 5);
  const jV0 = pw('J1', 6);
  const jBk = pw('J1', 7);
  const jDs = pw('J1', 8);
  if (gnd && jGnd) addVia(gnd, jGnd);
  if (vcc && jVcc) {
    const col = jVcc.x - 60;
    L(vcc, [
      { x: 2600, y: vBusTop }, { x: col, y: vBusTop },
      { x: col, y: jVcc.y }, jVcc
    ], 18, 'F.Cu');
  }

  // 扇出：横走 F、竖走 B（严格分层，互异 runY / riseX）
  let slot = 0;
  const toHdr = (net, src, jPad, mode = 'east') => {
    if (!net || !src || !jPad) return;
    const s = slot++;
    const riseX = 2580 + s * 40;
    const runY = mode === 'low' ? (1100 + s * 30) : (80 + s * 30);
    let esc;
    if (mode === 'left') esc = { x: src.x - 40, y: src.y };
    else if (mode === 'low') esc = { x: src.x, y: src.y + 45 };
    else esc = { x: src.x + 40, y: src.y };
    add(net, src, esc, 12, 'F.Cu');
    addVia(net, esc);
    add(net, esc, { x: esc.x, y: runY }, 12, 'B.Cu');
    addVia(net, { x: esc.x, y: runY });
    add(net, { x: esc.x, y: runY }, { x: riseX, y: runY }, 12, 'F.Cu');
    addVia(net, { x: riseX, y: runY });
    add(net, { x: riseX, y: runY }, { x: riseX, y: jPad.y }, 12, 'B.Cu');
    addVia(net, { x: riseX, y: jPad.y });
    add(net, { x: riseX, y: jPad.y }, jPad, 12, 'F.Cu');
  };
  toHdr(sig, pw('R1', 1), jSig, 'left');
  toHdr(lmOut, pw('Rf3', 2), jLm, 'east');
  toHdr(out555, pw('RLED', 2), j555, 'east');
  toHdr(disch, pw('RA', 2), jDs, 'east');
  toHdr(vout0, pw('REG1', 3), jV0, 'low');
  toHdr(buckOut, pw('CBO', 1), jBk, 'low');

  const named = [
    vcc, gnd, sig, bufIn, out741, tlIn, tlOut, u2b, lmIn, lmFb, lmOut, u3b,
    vout0, vout1, vout2, buckSw, buckOut, disch, cap555, out555, led555, ctrl
  ];
  return {
    trackCount: doc.tracks.length,
    netCount: named.filter(Boolean).length,
    viaCount: doc.vias.length
  };
}

