/**
 * 存储器接口手布（6 层 + 大板）：
 *   F.Cu   — 晶振 / NRST / 控制逃逸 / LA
 *   In1.Cu — MEM_A MCU↔M3
 *   In2.Cu — MEM_D MCU↔M3
 *   In3.Cu — MEM_A 的 M4 支路 + I2C 长线 + 控制横连
 *   In4.Cu — MEM_D 的 M4 支路 + SPI 末端
 *   B.Cu   — SPI 横连
 *
 * 干线西侧：按 MCU 焊盘 Y 排 farm；DIP 脚按同序重绑。
 * M4 经汇合点过孔上支路层；数据脚走 DIP 右排。
 */
function handLayoutLabMemory(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp || fp.defId === defId) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };
  forceFp('U1', 'FP_QFP48', 'STM32F103RC');
  forceFp('M1', 'FP_SOIC8', '24C02');
  forceFp('M2', 'FP_SOIC8', 'W25Q64');
  forceFp('M3', 'FP_DIP28', '2764');
  forceFp('M4', 'FP_DIP28', '62256');
  forceFp('Y1', 'FP_HC49', '8M');

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const sda = netByName('I2C_SDA');
  const scl = netByName('I2C_SCL');
  const spiCs = netByName('SPI_CS');
  const spiMiso = netByName('SPI_MISO');
  const spiMosi = netByName('SPI_MOSI');
  const spiSck = netByName('SPI_SCK');
  const memCe = netByName('MEM_CE');
  const memOe = netByName('MEM_OE');
  const sramCe = netByName('SRAM_CE');
  const sramOe = netByName('SRAM_OE');
  const sramWe = netByName('SRAM_WE');
  const memA = [], memD = [];
  for (let i = 0; i < 8; i++) {
    memA.push(netByName(`MEM_A${i}`));
    memD.push(netByName(`MEM_D${i}`));
  }

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (!pad || !net) return;
    pad.netId = net.id;
    pad.netName = net.name;
  };

  for (const n of ['8', '23', '35', '47']) bindPad('U1', n, gnd);
  for (const n of ['9', '24', '36', '48']) bindPad('U1', n, vcc);
  bindPad('U1', '5', xtal1); bindPad('U1', '6', xtal2); bindPad('U1', '7', nrst);
  bindPad('U1', '14', spiCs); bindPad('U1', '15', spiSck);
  bindPad('U1', '16', spiMiso); bindPad('U1', '17', spiMosi);
  bindPad('U1', '42', scl); bindPad('U1', '43', sda);
  bindPad('U1', '45', memCe); bindPad('U1', '46', memOe);
  bindPad('U1', '21', sramCe); bindPad('U1', '22', sramOe); bindPad('U1', '25', sramWe);
  const mcuAPads = ['10', '11', '12', '13', '18', '19', '20', '39'];
  const mcuDPads = ['29', '30', '31', '32', '33', '34', '37', '38'];
  for (let i = 0; i < 8; i++) {
    bindPad('U1', mcuAPads[i], memA[i]);
    bindPad('U1', mcuDPads[i], memD[i]);
  }
  bindPad('M1', '1', gnd); bindPad('M1', '2', gnd); bindPad('M1', '3', gnd);
  bindPad('M1', '4', gnd); bindPad('M1', '5', sda); bindPad('M1', '6', scl);
  bindPad('M1', '7', gnd); bindPad('M1', '8', vcc);
  bindPad('M2', '1', spiCs); bindPad('M2', '2', spiMiso); bindPad('M2', '3', vcc);
  bindPad('M2', '4', gnd); bindPad('M2', '5', spiMosi); bindPad('M2', '6', spiSck);
  bindPad('M2', '7', vcc); bindPad('M2', '8', vcc);
  bindPad('M3', '1', vcc); bindPad('M4', '1', gnd);
  bindPad('M3', '18', gnd); bindPad('M3', '19', memCe); bindPad('M3', '20', memOe); bindPad('M3', '26', vcc);
  bindPad('M4', '18', gnd); bindPad('M4', '19', sramCe); bindPad('M4', '20', sramOe);
  bindPad('M4', '27', sramWe); bindPad('M4', '28', vcc);
  bindPad('Y1', '1', xtal1); bindPad('Y1', '2', xtal2);
  bindPad('CX1', '1', xtal1); bindPad('CX1', '2', gnd);
  bindPad('CX2', '1', xtal2); bindPad('CX2', '2', gnd);
  bindPad('R1', '1', nrst); bindPad('R1', '2', vcc);
  bindPad('C1', '1', vcc); bindPad('C1', '2', gnd);
  bindPad('RSDA', '1', vcc); bindPad('RSDA', '2', sda);
  bindPad('RSCL', '1', vcc); bindPad('RSCL', '2', scl);

  setPos('U1', 900, 1500, 0);
  setPos('Y1', 420, 2100, 0);
  setPos('CX1', 260, 2240, 0);
  setPos('CX2', 580, 2240, 0);
  setPos('R1', 220, 700, 0);
  setPos('C1', 220, 1500, 0);
  setPos('RSDA', 1500, 220, 0);
  setPos('RSCL', 1500, 520, 0);
  setPos('M1', 1900, 380, 0);
  setPos('M2', 2400, 380, 0);
  // DIP 东移，保证地址 farm 列始终在左排焊盘西侧（朝干线）
  setPos('M3', 4200, 1500, 0);
  setPos('M4', 5600, 1500, 0);

  const hdr = instantiate('FP_PINHDR_8', 'J1', 'LA', { x: 6400, y: 1500 }, 0);
  const hdrNets = [gnd, scl, sda, spiSck, spiCs, spiMosi, memCe, sramCe];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };

  // 教学脚位：MCU 焊盘 Y 序 ↔ DIP 焊盘 Y 序一一对应，两侧 farm 同序
  const sortByPadY = (ref, padNums) => [...padNums].sort((a, b) => {
    const pa = pw(ref, a), pb = pw(ref, b);
    if (!pa || !pb) return 0;
    const dy = pa.y - pb.y;
    return Math.abs(dy) > 0.5 ? dy : pa.x - pb.x;
  });
  const clearMemPads = (ref, keep) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    for (const pad of fp.pads) {
      if (keep.has(pad.number)) continue;
      pad.netId = undefined;
      pad.netName = undefined;
    }
  };
  clearMemPads('M3', new Set(['1', '18', '19', '20', '26']));
  clearMemPads('M4', new Set(['1', '18', '19', '20', '27', '28']));
  const m3APins = [], m3DPins = [], m4APins = [], m4DPins = [];
  {
    const aOrder = sortByPadY('U1', mcuAPads);
    aOrder.forEach((padNum, rank) => {
      const i = mcuAPads.indexOf(padNum);
      const pin = String(2 + rank);
      bindPad('M3', pin, memA[i]);
      bindPad('M4', pin, memA[i]);
      m3APins[i] = pin;
      m4APins[i] = pin;
    });
    // 数据全走右排（避开 18-20 控制脚），farm 一律在焊盘西侧朝干线
    const dOrder = sortByPadY('U1', mcuDPads);
    const dipDSorted = sortByPadY('M3', ['15', '16', '17', '21', '22', '23', '24', '25']);
    dOrder.forEach((padNum, rank) => {
      const i = mcuDPads.indexOf(padNum);
      const pin = dipDSorted[rank];
      bindPad('M3', pin, memD[i]);
      bindPad('M4', pin, memD[i]);
      m3DPins[i] = pin;
      m4DPins[i] = pin;
    });
  }
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
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  const pwrStub = (net, padPt) => { if (net && padPt) addVia(net, padPt); };

  // 焊盘内过孔 + 纯曼哈顿 farm 总线
  const padToTrunk = (net, pad, layer, runY, farmX, trunkX, w = 8) => {
    if (!net || !pad) return;
    addVia(net, pad);
    L(net, [
      pad,
      { x: farmX, y: pad.y },
      { x: farmX, y: runY },
      { x: trunkX, y: runY }
    ], w, layer);
  };

  const spurFromJoin = (net, pad, spurLayer, runY, farmX, joinX, w = 8) => {
    if (!net || !pad) return;
    const join = { x: joinX, y: runY };
    addVia(net, join);
    addVia(net, pad);
    L(net, [
      pad,
      { x: farmX, y: pad.y },
      { x: farmX, y: runY },
      join
    ], w, spurLayer);
  };

  /**
   * 按参考焊盘 Y 分配 runY / farm，避免竖线切横线。
   * south=true（南廊，竖线向下）：北焊盘→内列+近廊；南焊盘→外列+远廊
   * south=false（北廊，竖线向上）：南焊盘→内列+近廊；北焊盘→外列+远廊
   */
  const assignFarmBus = (entries, baseRy, south, tL, tR, P) => {
    const sorted = [...entries].filter(e => e.refPad).sort((a, b) => {
      const dy = a.refPad.y - b.refPad.y;
      return Math.abs(dy) > 0.5 ? dy : a.refPad.x - b.refPad.x;
    });
    const n = sorted.length;
    for (let rank = 0; rank < n; rank++) {
      const e = sorted[rank];
      if (south) {
        e.ry = baseRy + rank * P;
        e.fW = tL - (rank + 1) * P;
        e.fE = tR + (rank + 1) * P;
      } else {
        e.ry = baseRy + rank * P;
        e.fW = tL - (n - rank) * P;
        e.fE = tR + (n - rank) * P;
      }
    }
    return sorted;
  };

  for (const n of ['9', '24', '36', '48']) pwrStub(vcc, pw('U1', n));
  for (const n of ['8', '23', '35', '47']) pwrStub(gnd, pw('U1', n));
  for (const [ref, num] of [
    ['M1', 8], ['M2', 8], ['M2', 3], ['M2', 7], ['M3', 1], ['M3', 26], ['M4', 28],
    ['C1', 1], ['R1', 2], ['RSDA', 1], ['RSCL', 1]
  ]) pwrStub(vcc, pw(ref, num));
  for (const [ref, num] of [
    ['M1', 4], ['M1', 1], ['M1', 2], ['M1', 3], ['M1', 7],
    ['M2', 4], ['M3', 18], ['M4', 18], ['M4', 1],
    ['C1', 2], ['CX1', 2], ['CX2', 2]
  ]) pwrStub(gnd, pw(ref, num));

  {
    const a = pw('U1', 5), b = pw('Y1', 1), c = pw('CX1', 1);
    if (xtal1 && a && b) {
      const mid = { x: Math.min(a.x, b.x) - 50, y: a.y };
      L(xtal1, [a, mid, { x: mid.x, y: b.y }, b], 12, 'F.Cu');
    }
    if (xtal1 && b && c) add(xtal1, b, c, 12, 'F.Cu');
  }
  {
    const a = pw('U1', 6), b = pw('Y1', 2), c = pw('CX2', 1);
    if (xtal2 && a && b) {
      const mid = { x: Math.min(a.x, b.x) - 100, y: a.y };
      L(xtal2, [a, mid, { x: mid.x, y: b.y }, b], 12, 'F.Cu');
    }
    if (xtal2 && b && c) add(xtal2, b, c, 12, 'F.Cu');
  }
  {
    const a = pw('U1', 7), b = pw('R1', 1);
    if (nrst && a && b) {
      L(nrst, [a, { x: a.x + 50, y: a.y }, { x: a.x + 50, y: b.y }, b], 12, 'F.Cu');
    }
  }

  const P = 80;
  const tL = 2000;
  const tR = 2900;
  const wSig = 8;

  // In1：MEM_A MCU↔M3；In3：M4 支路（南廊）
  {
    const entries = [];
    for (let i = 0; i < 8; i++) {
      if (!memA[i] || !m3APins[i]) continue;
      const pU = pw('U1', mcuAPads[i]);
      entries.push({
        net: memA[i], refPad: pU, pU,
        p3: pw('M3', m3APins[i]), p4: pw('M4', m4APins[i])
      });
    }
    for (const e of assignFarmBus(entries, 2600, true, tL, tR, P)) {
      padToTrunk(e.net, e.pU, 'In1.Cu', e.ry, e.fW, tL, wSig);
      padToTrunk(e.net, e.p3, 'In1.Cu', e.ry, e.fE, tR, wSig);
      add(e.net, { x: tL, y: e.ry }, { x: tR, y: e.ry }, wSig, 'In1.Cu');
      spurFromJoin(e.net, e.p4, 'In3.Cu', e.ry, e.fE + 12 * P, tR, wSig);
    }
  }

  // In2：MEM_D MCU↔M3；In4：M4 支路（北廊，与地址支路分层）
  {
    const entries = [];
    for (let i = 0; i < 8; i++) {
      if (!memD[i] || !m3DPins[i]) continue;
      const pU = pw('U1', mcuDPads[i]);
      entries.push({
        net: memD[i], refPad: pU, pU,
        p3: pw('M3', m3DPins[i]), p4: pw('M4', m4DPins[i])
      });
    }
    for (const e of assignFarmBus(entries, 200, false, tL, tR, P)) {
      padToTrunk(e.net, e.pU, 'In2.Cu', e.ry, e.fW, tL, wSig);
      padToTrunk(e.net, e.p3, 'In2.Cu', e.ry, e.fE, tR, wSig);
      add(e.net, { x: tL, y: e.ry }, { x: tR, y: e.ry }, wSig, 'In2.Cu');
      spurFromJoin(e.net, e.p4, 'In4.Cu', e.ry, e.fE + 12 * P, tR, wSig);
    }
  }

  // In3：I2C（最上，避开 M4 支路）
  {
    const a = pw('U1', 42), b = pw('M1', 6), c = pw('RSCL', 2);
    if (scl && a && b) {
      const ea = { x: a.x, y: a.y - 50 };
      const eb = { x: b.x, y: b.y + 50 };
      add(scl, a, ea, 10, 'F.Cu'); addVia(scl, ea);
      add(scl, b, eb, 10, 'F.Cu'); addVia(scl, eb);
      L(scl, [ea, { x: 1100, y: ea.y }, { x: 1100, y: 60 }, { x: eb.x, y: 60 }, eb], 10, 'In3.Cu');
      if (c) L(scl, [c, { x: b.x, y: c.y }, b], 10, 'F.Cu');
    }
  }
  {
    const a = pw('U1', 43), b = pw('M1', 5), c = pw('RSDA', 2);
    if (sda && a && b) {
      const ea = { x: a.x, y: a.y - 50 };
      const eb = { x: b.x, y: b.y + 50 };
      add(sda, a, ea, 10, 'F.Cu'); addVia(sda, ea);
      add(sda, b, eb, 10, 'F.Cu'); addVia(sda, eb);
      L(sda, [ea, { x: 1200, y: ea.y }, { x: 1200, y: 140 }, { x: eb.x, y: 140 }, eb], 10, 'In3.Cu');
      if (c) L(sda, [c, { x: b.x, y: c.y }, b], 10, 'F.Cu');
    }
  }

  // 控制：U1 侧 F 逃逸；存储器侧焊盘过孔；In3 横连+竖降
  {
    const ctrlEntries = [
      { net: memCe, pA: pw('U1', 45), pB: pw('M3', 19) },
      { net: memOe, pA: pw('U1', 46), pB: pw('M3', 20) },
      { net: sramCe, pA: pw('U1', 21), pB: pw('M4', 19) },
      { net: sramOe, pA: pw('U1', 22), pB: pw('M4', 20) },
      { net: sramWe, pA: pw('U1', 25), pB: pw('M4', 27) }
    ].filter(e => e.net && e.pA && e.pB);
    ctrlEntries.forEach((e, i) => {
      const ry = 3300 + i * P;
      const gA = { x: e.pA.x, y: ry };
      add(e.net, e.pA, gA, wSig, 'F.Cu');
      addVia(e.net, gA);
      addVia(e.net, e.pB);
      L(e.net, [
        gA,
        { x: e.pB.x, y: ry },
        e.pB
      ], wSig, 'In3.Cu');
    });
  }

  // SPI：B 横连到门孔；M2 端 F 短降（避免 B 上竖线切横线）
  {
    const spiEntries = [
      { net: spiCs, pA: pw('U1', 14), pB: pw('M2', 1) },
      { net: spiSck, pA: pw('U1', 15), pB: pw('M2', 6) },
      { net: spiMosi, pA: pw('U1', 17), pB: pw('M2', 5) },
      { net: spiMiso, pA: pw('U1', 16), pB: pw('M2', 2) }
    ].filter(e => e.net && e.pA && e.pB)
      .sort((a, b) => a.pA.x - b.pA.x);
    spiEntries.forEach((e, i) => {
      const ry = 600 + i * P;
      const gB = { x: e.pB.x, y: ry };
      addVia(e.net, e.pA);
      addVia(e.net, gB);
      L(e.net, [
        e.pA,
        { x: e.pA.x, y: ry },
        gB
      ], wSig, 'B.Cu');
      add(e.net, gB, e.pB, wSig, 'In4.Cu');
    });
  }

  // LA：F，先东后南，南廊在 MEM_A 干线以南
  const j = (n) => pw('J1', n);
  if (gnd && j(1)) addVia(gnd, j(1));
  const tapLA = (net, src, jPad, runY) => {
    if (!net || !src || !jPad) return;
    const col = 6200;
    L(net, [
      src, { x: col, y: src.y }, { x: col, y: runY },
      { x: jPad.x, y: runY }, jPad
    ], 10, 'F.Cu');
  };
  tapLA(scl, pw('M1', 6), j(2), 3400);
  tapLA(sda, pw('M1', 5), j(3), 3480);
  tapLA(spiSck, pw('M2', 6), j(4), 3560);
  tapLA(spiCs, pw('M2', 1), j(5), 3640);
  tapLA(spiMosi, pw('M2', 5), j(6), 3720);
  tapLA(memCe, pw('M3', 19), j(7), 3800);
  tapLA(sramCe, pw('M4', 19), j(8), 3880);

  return {
    trackCount: doc.tracks.length,
    netCount: 32,
    viaCount: doc.vias.length
  };
}
