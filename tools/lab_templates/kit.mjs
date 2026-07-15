/** TemplateSchematicKit — Node 版，引脚几何与 BuiltinComponents 对齐 */

const NetType = { SIGNAL: 'signal', POWER: 'power', GROUND: 'ground', BUS: 'bus' };
const WireStyle = { ORTHOGONAL: 'orthogonal' };

let _seq = 0;
function genId(prefix) {
  _seq += 1;
  return `${prefix}_${Date.now()}_${_seq}`;
}

export function resetSeq() {
  _seq = 0;
}

const ROUTE_TOL = 4;

function nearPt(a, b, tol = 2) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

function pointOnSegment(p, a, b, tol = ROUTE_TOL) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 < 1e-6) {
    return Math.abs(p.x - a.x) <= tol && Math.abs(p.y - a.y) <= tol;
  }
  const cross = Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy);
  const segLen = Math.sqrt(segLen2);
  if (cross / segLen > tol) return false;
  const dot = (p.x - a.x) * dx + (p.y - a.y) * dy;
  return dot >= -tol && dot <= segLen2 + tol;
}

/** 电源轨：沿 hub.y 做母线再垂直接脚（避免在器件脚同行横穿） */
function railBusPts(hub, pt) {
  if (hub.x === pt.x || hub.y === pt.y) return [hub, pt];
  return [hub, { x: pt.x, y: hub.y }, pt];
}

/** 候选正交路径：优先沿起点高度横走（电源母线友好），再尝试绕行 */
function candidateRoutes(a, b, channel = 0) {
  if (a.x === b.x || a.y === b.y) return [[a, b]];
  const routes = [
    [a, { x: b.x, y: a.y }, b], // 先横后竖（母线在 a.y）
    [a, { x: a.x, y: b.y }, b]
  ];
  const dirX = Math.sign(b.x - a.x) || 1;
  const dirY = Math.sign(b.y - a.y) || 1;
  for (let k = 1; k <= 12; k++) {
    const jog = 20 * k + channel * 10;
    const midX = a.x + dirX * jog;
    const midY = a.y + dirY * jog;
    routes.push([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]);
    routes.push([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]);
    const outX = a.x - dirX * jog;
    const outY = a.y - dirY * jog;
    routes.push([a, { x: outX, y: a.y }, { x: outX, y: b.y }, b]);
    routes.push([a, { x: a.x, y: outY }, { x: b.x, y: outY }, b]);
  }
  for (const gy of [-80, -140, 600, 660, 720, 780]) {
    routes.push([a, { x: a.x, y: gy + channel * 10 }, { x: b.x, y: gy + channel * 10 }, b]);
  }
  for (const gx of [-80, -140, 1320, 1400]) {
    routes.push([a, { x: gx - channel * 10, y: a.y }, { x: gx - channel * 10, y: b.y }, b]);
  }
  return routes;
}

/** 电源母线并行通道（hub.y ± offset），避免落入负载引脚行 */
function railBusCandidates(hub, pt) {
  const routes = [];
  for (const dy of [0, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100]) {
    const busY = hub.y + dy;
    if (dy === 0 && (hub.x === pt.x || hub.y === pt.y)) {
      routes.push([hub, pt]);
    } else {
      routes.push([hub, { x: hub.x, y: busY }, { x: pt.x, y: busY }, pt]);
    }
  }
  return routes;
}

function isDensePackage(libraryId) {
  // 仅密集脚列封装需要离脚；运放/仪器离脚反而制造共竖列短路
  return libraryId.startsWith('STM32') || libraryId.startsWith('AT89') ||
    libraryId.startsWith('STC') || libraryId.startsWith('74HC') ||
    libraryId === 'CD4017' || libraryId === 'LCD1602' ||
    libraryId === '2764' || libraryId === '62256' ||
    libraryId === '24C02' || libraryId === 'W25Q64' ||
    libraryId === 'LOGIC_ANALYZER';
}

/**
 * 离开封装本体再布线。按 pinId 扇出不同离脚距离。
 * 仅 MCU/存储器远距离信号启用；74HC/LA 离脚易共竖列，交由避障 U 形处理。
 */
function leaveStub(comp, worldPt, pinId, otherWorld) {
  const lib = comp.libraryId;
  const allow = lib.startsWith('STM32') || lib.startsWith('AT89') || lib.startsWith('STC') ||
    lib === '2764' || lib === '62256' || lib === 'LCD1602' || lib === 'LOGIC_ANALYZER';
  if (!allow) return null;
  if (otherWorld && Math.hypot(otherWorld.x - worldPt.x, otherWorld.y - worldPt.y) < 120) {
    return null;
  }
  const cx = comp.position.x;
  const cy = comp.position.y;
  let fan = 0;
  if (pinId.startsWith('P')) {
    fan = (parseInt(pinId.substring(1), 10) % 7) * 12;
  } else if (pinId.startsWith('CH')) {
    fan = (parseInt(pinId.substring(2), 10) % 7) * 12;
  } else {
    for (let i = 0; i < pinId.length; i++) fan += pinId.charCodeAt(i);
    fan = (fan % 7) * 12;
  }
  const CLEAR = 55 + fan;
  if (worldPt.x < cx - 5) return { x: worldPt.x - CLEAR, y: worldPt.y };
  if (worldPt.x > cx + 5) return { x: worldPt.x + CLEAR, y: worldPt.y };
  if (worldPt.y < cy) return { x: worldPt.x, y: worldPt.y - CLEAR };
  return { x: worldPt.x, y: worldPt.y + CLEAR };
}

/** 枚举器件真实引脚（用于避障，含尚未入网的脚） */
function enumerateCompPins(comp) {
  const lib = comp.libraryId;
  const ids = [];
  if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_') ||
    lib.startsWith('XTAL') || lib.startsWith('FUSE') ||
    lib === 'DS18B20' || lib === 'HALL_SENSOR' || lib === 'LDR' ||
    lib === 'BUZZER' || lib === 'SW_PUSH') {
    ids.push('1', '2');
  } else if (lib === 'RELAY_SPDT') {
    ids.push('1', '2', 'COM', 'NO', 'NC');
  } else if (lib.startsWith('LED_') || lib === '1N4148' || lib === '1N4007' || lib === '1N5819') {
    ids.push('A', 'K');
  } else if (lib === 'VAC') {
    ids.push('1', '2');
  } else if (lib === 'VCC' || lib === 'GND') {
    ids.push('1');
  } else if (lib === 'LM7805' || lib === 'LM7812' || lib === 'AMS1117_3V3') {
    ids.push('1', '2', '3');
  } else if (lib === 'LM358' || lib === 'TL082') {
    ids.push('OUT1', 'IN-1', 'IN+1', 'V-', 'IN+2', 'IN-2', 'OUT2', 'V+');
  } else if (lib === 'UA741') {
    ids.push('IN+', 'IN-', 'OUT', 'VCC', 'VEE');
  } else if (lib.startsWith('74HC')) {
    ids.push('1', '2', '3', '7', '14');
  } else if (lib.startsWith('STM32') || lib.startsWith('AT89') || lib.startsWith('STC')) {
    const n = lib.includes('F407') ? 100 : (lib.startsWith('AT89') || lib.startsWith('STC') ? 40 : 48);
    for (let i = 1; i <= n; i++) ids.push(`P${i}`);
  } else if (lib === '2N2222' || lib === '2N2907') {
    ids.push('B', 'C', 'E');
  } else if (lib === '2N7000' || lib === 'IRF540') {
    ids.push('G', 'D', 'S');
  } else if (lib === 'VOLTMETER_DC' || lib === 'VIRTUAL_METER') {
    ids.push('V+', 'V', 'COM');
  } else if (lib === 'AMMETER_DC') {
    ids.push('I+', 'I-');
  } else if (lib === 'OSCILLOSCOPE') {
    ids.push('CH1', 'CH2', 'CH3', 'CH4', 'GND');
  } else if (lib === 'LOGIC_ANALYZER') {
    for (let c = 1; c <= 8; c++) ids.push(`CH${c}`);
    ids.push('GND');
  } else if (lib === 'UART_TERMINAL') {
    ids.push('TX', 'RX', 'GND');
  } else if (lib === 'POWER_METER') {
    ids.push('V+', 'V-', 'I+', 'I-');
  } else if (lib === 'FREQ_COUNTER') {
    ids.push('IN', 'GND');
  } else if (lib === 'LCD1602') {
    for (let i = 1; i <= 16; i++) ids.push(String(i));
  } else if (lib === 'OLED_12864') {
    ids.push('VCC', 'GND', 'SDA', 'SCL');
  } else if (lib === 'CD4017') {
    for (let i = 1; i <= 16; i++) ids.push(String(i));
  } else if (lib === '2764' || lib === '62256') {
    for (let i = 1; i <= 28; i++) ids.push(String(i));
  } else if (lib === '24C02' || lib === 'W25Q64') {
    for (let i = 1; i <= 8; i++) ids.push(String(i));
  } else if (lib === 'LM2596') {
    for (let i = 1; i <= 5; i++) ids.push(String(i));
  }
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    const w = K.pinWorld(comp, id, id);
    const key = `${Math.round(w.x)},${Math.round(w.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: w.x, y: w.y, pinId: id, compId: comp.id });
  }
  return out;
}

/** 路径是否会与异网导线/引脚形成 T 结（与 WireNetTopology 同判据） */
function pathConflicts(doc, netId, pts) {
  if (!pts || pts.length < 2) return false;
  const ourEnds = [pts[0], pts[pts.length - 1]];
  const EP_SHORT = 5; // 与 WireNetTopology junctionRadius≈grid*0.5 对齐

  const ourNetPins = new Set();
  const ourNet = doc.nets.find(n => n.id === netId);
  if (ourNet) {
    for (const ref of ourNet.pinIds) ourNetPins.add(ref.split(':').slice(0, 2).join(':'));
  }

  for (const w of doc.wires) {
    if (w.netId === netId || w.points.length < 2) continue;
    const foreignEnds = [w.points[0], w.points[w.points.length - 1]];

    // 异网端点重合 → UF 并网（硬短路）；原先 near 时 continue 会漏检
    for (const ep of foreignEnds) {
      if (nearPt(ep, ourEnds[0], EP_SHORT) || nearPt(ep, ourEnds[1], EP_SHORT)) {
        return true;
      }
    }

    // 本路径拐点/端点落在异网中段
    for (const p of pts) {
      for (let si = 0; si < w.points.length - 1; si++) {
        const a = w.points[si];
        const b = w.points[si + 1];
        if (!pointOnSegment(p, a, b)) continue;
        if (nearPt(p, foreignEnds[0]) || nearPt(p, foreignEnds[1])) continue;
        return true;
      }
    }

    // 异网端点落在本路径中段
    for (const ep of foreignEnds) {
      for (let si = 0; si < pts.length - 1; si++) {
        const a = pts[si];
        const b = pts[si + 1];
        if (!pointOnSegment(ep, a, b)) continue;
        if (nearPt(ep, ourEnds[0]) || nearPt(ep, ourEnds[1])) continue;
        return true;
      }
    }
  }

  // 任意器件引脚落在本路径中段，或压在端点上（stub 踩邻脚）
  for (const comp of doc.components) {
    for (const pw of enumerateCompPins(comp)) {
      const key = `${pw.compId}:${pw.pinId}`;
      if (ourNetPins.has(key)) continue;
      if (nearPt(pw, ourEnds[0], EP_SHORT) || nearPt(pw, ourEnds[1], EP_SHORT)) {
        return true;
      }
      for (let si = 0; si < pts.length - 1; si++) {
        const a = pts[si];
        const b = pts[si + 1];
        if (!pointOnSegment(pw, a, b)) continue;
        if (nearPt(pw, ourEnds[0]) || nearPt(pw, ourEnds[1])) continue;
        return true;
      }
    }
  }
  return false;
}

function pickRoute(doc, netId, a, b, channel = 0) {
  const cands = candidateRoutes(a, b, channel);
  for (const c of cands) {
    if (!pathConflicts(doc, netId, c)) return c;
  }
  return cands[0];
}

function isRailLib(libraryId) {
  return libraryId === 'VCC' || libraryId === 'GND';
}

/** 把 VCC/GND 符号脚提到 hub，减少负载脚做星心时的横穿短路 */
function promoteRailHub(pins) {
  const idx = pins.findIndex(p => isRailLib(p.comp.libraryId));
  if (idx <= 0) return pins;
  const out = pins.slice();
  const [rail] = out.splice(idx, 1);
  out.unshift(rail);
  return out;
}

function resolvePinSpec(doc, pinRef) {
  const parts = pinRef.split(':');
  const comp = doc.components.find(c => c.id === parts[0]);
  if (!comp) return null;
  return { comp, pinId: parts[1], pinName: parts[2] || parts[1] };
}

/**
 * 超过此正交跨距才优先 Net Label（跨模块）；近/中距一律先走物理线。
 * 原 160 过小，导致模板几乎全变 stub+标号。
 */
const LABEL_SPAN = 420;

function pinSpan(pins) {
  if (!pins || pins.length < 2) return 0;
  let maxD = 0;
  for (let i = 0; i < pins.length; i++) {
    const a = K.pinWorld(pins[i].comp, pins[i].pinId, pins[i].pinName);
    for (let j = i + 1; j < pins.length; j++) {
      const b = K.pinWorld(pins[j].comp, pins[j].pinId, pins[j].pinName);
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d > maxD) maxD = d;
    }
  }
  return maxD;
}

/**
 * 跨距：本次引脚之间，或「本次任脚 → 同名网最近已有脚」。
 * 不用电源符号作唯一 hub，避免局部追加也被当成长跨距。
 */
function joinSpan(doc, netName, pins) {
  let span = pinSpan(pins);
  const existing = doc.nets.find(n => n.name === netName);
  if (!existing || existing.pinIds.length === 0) return span;
  for (const p of pins) {
    const w = K.pinWorld(p.comp, p.pinId, p.pinName);
    let best = Infinity;
    for (const ref of existing.pinIds) {
      const hub = resolvePinSpec(doc, ref);
      if (!hub) continue;
      // 跳过已在本次 pins 里的脚
      if (pins.some(x => x.comp.id === hub.comp.id && x.pinId === hub.pinId)) continue;
      const h = K.pinWorld(hub.comp, hub.pinId, hub.pinName);
      const d = Math.abs(w.x - h.x) + Math.abs(w.y - h.y);
      if (d < best) best = d;
    }
    if (best < Infinity && best > span) span = best;
  }
  return span;
}

/** 自 wireStart 起新增导线是否与异网形成 T 结 */
function newWiresConflict(doc, wireStart) {
  for (let wi = wireStart; wi < doc.wires.length; wi++) {
    const w = doc.wires[wi];
    if (pathConflicts(doc, w.netId, w.points)) return true;
  }
  return false;
}

/** Short label stub away from body. Only VCC/GND symbols use vertical stubs. */
function labelStubEnd(comp, worldPt, stubLen = 20, netName = '') {
  const lib = comp.libraryId || '';
  const upper = String(netName || '').toUpperCase();
  if (lib === 'VCC' && (upper === 'VCC' || upper === 'VDD' || upper.length === 0)) {
    return { x: worldPt.x, y: worldPt.y - stubLen };
  }
  if (lib === 'GND' && (upper === 'GND' || upper === 'VSS' || upper === '0' || upper.length === 0)) {
    return { x: worldPt.x, y: worldPt.y + stubLen };
  }
  const cx = comp.position.x;
  const cy = comp.position.y;
  if (worldPt.x < cx - 5) return { x: worldPt.x - stubLen, y: worldPt.y };
  if (worldPt.x > cx + 5) return { x: worldPt.x + stubLen, y: worldPt.y };
  if (worldPt.y < cy) return { x: worldPt.x, y: worldPt.y - stubLen };
  return { x: worldPt.x, y: worldPt.y + stubLen };
}

export class K {
  static createDoc(name, description) {
    const now = new Date().toISOString();
    return {
      id: genId('sch'),
      name,
      version: '1.0',
      components: [],
      wires: [],
      nets: [],
      netLabels: [],
      subcircuits: [],
      metadata: {
        author: 'LabTemplate',
        createdAt: now,
        modifiedAt: now,
        description,
        gridSize: 10,
        units: 'mm',
        undoLimit: 1000
      }
    };
  }

  static place(doc, libraryId, refDes, pos) {
    const parameters = {};
    if (libraryId.startsWith('R_')) {
      parameters.value = libraryId.slice(2);
      parameters.power = '0.25W';
    } else if (libraryId.startsWith('POT_')) {
      parameters.value = libraryId.slice(4);
      parameters.wiper = '0.5';
      parameters.power = '0.25W';
    } else if (libraryId.startsWith('C_')) {
      parameters.value = libraryId.slice(2);
      parameters.voltage = '50V';
    } else if (libraryId === 'LM7805') {
      parameters.output = '5V';
    } else if (libraryId === 'LM7812') {
      parameters.output = '12V';
    } else if (libraryId === 'AMS1117_3V3') {
      parameters.output = '3.3V';
    } else if (libraryId === 'VCC') {
      parameters.voltage = '5V';
    }
    const comp = {
      id: genId('comp'),
      libraryId,
      refDes,
      position: { x: pos.x, y: pos.y },
      rotation: 0,
      mirrored: false,
      parameters
    };
    doc.components.push(comp);
    return comp;
  }

  static pinRef(c, pinId, pinName) {
    return `${c.id}:${pinId}:${pinName}`;
  }

  static pinWorld(c, pinId, pinName) {
    const local = K.pinOffset(c.libraryId, pinId, pinName);
    return { x: c.position.x + local.x, y: c.position.y + local.y };
  }

  static addNet(doc, name, type, pinRefs) {
    let net = doc.nets.find(n => n.name === name);
    if (!net) {
      net = { id: genId('net'), name, type, pinIds: [] };
      doc.nets.push(net);
    }
    for (const ref of pinRefs) {
      if (!net.pinIds.includes(ref)) net.pinIds.push(ref);
    }
    return net.id;
  }

  static addWire(doc, netId, ...pts) {
    doc.wires.push({
      id: genId('wire'),
      netId,
      points: pts.map(p => ({ x: p.x, y: p.y })),
      style: WireStyle.ORTHOGONAL
    });
  }

  /**
   * 多脚并网（按真实情况混用）：
   * - 近/中距 → 物理正交导线
   * - 远跨模块（≥ LABEL_SPAN）或走线会异网 T 结 → Net Label
   * 强制：joinWired / joinByLabel
   */
  static join(doc, netName, type, pins) {
    if (!pins || pins.length === 0) return null;
    const span = joinSpan(doc, netName, pins);
    if (span >= LABEL_SPAN) {
      return K.joinByLabel(doc, netName, type, pins);
    }
    const wireStart = doc.wires.length;
    const nid = K.joinWired(doc, netName, type, pins);
    if (doc.wires.length > wireStart && newWiresConflict(doc, wireStart)) {
      doc.wires.length = wireStart;
      // 回滚后去掉因 joinWired 可能留下的空增量：net 登记保留
      return K.joinByLabel(doc, netName, type, pins);
    }
    return nid;
  }

  /** 强制物理正交布线并网 */
  static joinWired(doc, netName, type, pins) {
    const existing = doc.nets.find(n => n.name === netName);
    const priorRefs = existing ? existing.pinIds.slice() : [];
    let routePins = promoteRailHub(pins);

    if (routePins.length === 1 && priorRefs.length >= 1) {
      const hubSpec = resolvePinSpec(doc, priorRefs[0]);
      if (hubSpec) {
        routePins = promoteRailHub([hubSpec, routePins[0]]);
      }
    }

    const refs = pins.map(p => K.pinRef(p.comp, p.pinId, p.pinName));
    const nid = K.addNet(doc, netName, type, refs);
    // 单脚 join 不画线 → 加载后 pinIds 被 wipe，器件悬空；改为 stub+标号保几何
    if (routePins.length < 2) {
      if (pins.length === 1) {
        K.stubLabel(doc, pins[0], netName, type);
      }
      return nid;
    }

    const hubComp = routePins[0].comp;
    const hub = K.pinWorld(routePins[0].comp, routePins[0].pinId, routePins[0].pinName);
    const useRailBus = (type === NetType.POWER || type === NetType.GROUND)
      && isRailLib(hubComp.libraryId);

    for (let i = 1; i < routePins.length; i++) {
      const load = routePins[i];
      const pt = K.pinWorld(load.comp, load.pinId, load.pinName);
      const hubLeave = leaveStub(hubComp, hub, routePins[0].pinId, pt);
      const loadLeave = leaveStub(load.comp, pt, load.pinId, hub);
      const a = hubLeave || hub;
      const b = loadLeave || pt;

      if (hubLeave) K.addWire(doc, nid, hub, hubLeave);
      if (loadLeave) K.addWire(doc, nid, loadLeave, pt);

      let route = null;
      if (useRailBus && !hubLeave && !loadLeave) {
        for (const c of railBusCandidates(a, b)) {
          if (!pathConflicts(doc, nid, c)) {
            route = c;
            break;
          }
        }
      }
      if (!route) {
        route = pickRoute(doc, nid, a, b, i);
      }
      if (route.length >= 2) {
        K.addWire(doc, nid, ...route);
      }
    }
    return nid;
  }

  /** Place a Net Label at position (case-sensitive text). Stub labels stay local (global=false). */
  static netLabel(doc, netId, text, pos, global = false) {
    if (!doc.netLabels) doc.netLabels = [];
    const lb = {
      id: genId('lbl'),
      netId,
      text,
      position: { x: pos.x, y: pos.y },
      global: !!global
    };
    doc.netLabels.push(lb);
    return lb;
  }

  /** Short stub from pin + Net Label (Proteus-style local end) */
  static stubLabel(doc, pin, name, type = NetType.SIGNAL, stubLen = 20) {
    const ref = K.pinRef(pin.comp, pin.pinId, pin.pinName);
    const nid = K.addNet(doc, name, type, [ref]);
    const world = K.pinWorld(pin.comp, pin.pinId, pin.pinName);
    // 密排脚错开 stub 长度，降低端点被 WireNetTopology 并短路的概率
    const pinNum = parseInt(String(pin.pinId).replace(/\D/g, ''), 10);
    const baseLen = stubLen + ((!Number.isNaN(pinNum) ? pinNum % 3 : 0) * 10);
    const selfKey = `${pin.comp.id}:${pin.pinId}`;
    let end = labelStubEnd(pin.comp, world, baseLen, name);
    for (let len = baseLen; len <= baseLen + 40; len += 10) {
      const candidate = labelStubEnd(pin.comp, world, len, name);
      const hitsWire = doc.wires.some((w) => {
        if (w.netId === nid || w.points.length < 2) return false;
        return nearPt(w.points[0], candidate, 5) ||
          nearPt(w.points[w.points.length - 1], candidate, 5);
      });
      let hitsPin = false;
      for (const comp of doc.components) {
        for (const pw of enumerateCompPins(comp)) {
          if (`${pw.compId}:${pw.pinId}` === selfKey) continue;
          if (nearPt(pw, candidate, 5)) {
            hitsPin = true;
            break;
          }
        }
        if (hitsPin) break;
      }
      end = candidate;
      if (!hitsWire && !hitsPin) break;
    }
    // Avoid duplicate stub wires when an existing wire end already sits on this pin
    const already = doc.wires.some((w) => {
      if (w.netId !== nid || w.points.length < 2) return false;
      return nearPt(w.points[0], world, 2) || nearPt(w.points[w.points.length - 1], world, 2);
    });
    if (!already) {
      K.addWire(doc, nid, world, end);
    }
    const labelPos = already ? world : end;
    // 每个 pin 必须有独立标号：邻脚间距约 10px，用 stubLen+4≈24 会误复用邻脚标号，
    // WireNetTopology 重建后无标号的 stub 网无法并入 GND/VCC → floating_net。
    const hasExact = (doc.netLabels || []).some((lb) =>
      lb.text === name && nearPt(lb.position, labelPos, 2));
    if (!hasExact) {
      K.netLabel(doc, nid, name, labelPos);
    }
    return nid;
  }

  /**
   * Same-name Net Labels connect pins without long physical wires.
   * Preferred for signal nets on dense / multi-block lab templates.
   */
  static joinByLabel(doc, netName, type, pins) {
    if (!pins || pins.length === 0) return null;
    const refs = pins.map(p => K.pinRef(p.comp, p.pinId, p.pinName));
    const nid = K.addNet(doc, netName, type, refs);
    for (const pin of pins) {
      K.stubLabel(doc, pin, netName, type);
    }
    return nid;
  }

  static series2(doc, netMid, left, right) {
    K.join(doc, netMid, NetType.SIGNAL, [left, right]);
  }

  static powerRails(doc, vccPin, gndPin, vccLoads, gndLoads) {
    K.join(doc, 'VCC', NetType.POWER, [vccPin, ...vccLoads]);
    K.join(doc, 'GND', NetType.GROUND, [gndPin, ...gndLoads]);
  }

  /**
   * LED 支路. railNet='VCC' 时把电阻入口并入电源轨，避免同一脚进多个网络名。
   * driveOnPin2=true：MCU/电源在电阻右侧（pin2），LED 在左侧（pin1）—— 适配 51 左脚排。
   */
  static ledBranch(doc, drive, gndPin, resistor, led, prefix, railNet = null, driveOnPin2 = false) {
    const driveNet = railNet !== null ? railNet : `${prefix}_R`;
    const driveType = railNet === 'VCC' ? NetType.POWER
      : (railNet === 'GND' ? NetType.GROUND : NetType.SIGNAL);
    const nearPin = driveOnPin2 ? '2' : '1';
    const farPin = driveOnPin2 ? '1' : '2';
    K.join(doc, driveNet, driveType, [
      drive, { comp: resistor, pinId: nearPin, pinName: nearPin }
    ]);
    K.series2(doc, `${prefix}_LED`,
      { comp: resistor, pinId: farPin, pinName: farPin },
      { comp: led, pinId: 'A', pinName: 'A' });
    K.join(doc, 'GND', NetType.GROUND, [gndPin, { comp: led, pinId: 'K', pinName: 'K' }]);
  }

  /**
   * MCU 电源/复位。rstNearPin2=true：复位电阻右侧(pin2)接 RST、左侧(pin1)接 VCC
   * （电阻在 MCU 左脚外侧时的自然朝向）。
   */
  static mcuCore(doc, mcu, vcc, gnd, rRst, cDec, vccPin, gndPin, rstPin, prefix = '', rstNearPin2 = false) {
    const rstRPin = rstNearPin2 ? '2' : '1';
    const vccRPin = rstNearPin2 ? '1' : '2';
    K.join(doc, `${prefix}NRST`, NetType.SIGNAL, [
      { comp: rRst, pinId: rstRPin, pinName: rstRPin },
      { comp: mcu, pinId: rstPin, pinName: rstPin }
    ]);
    K.powerRails(doc,
      { comp: vcc, pinId: '1', pinName: 'VCC' },
      { comp: gnd, pinId: '1', pinName: 'GND' },
      [
        { comp: mcu, pinId: vccPin, pinName: vccPin },
        { comp: rRst, pinId: vccRPin, pinName: vccRPin },
        { comp: cDec, pinId: '1', pinName: '1' }
      ],
      [
        { comp: mcu, pinId: gndPin, pinName: gndPin },
        { comp: cDec, pinId: '2', pinName: '2' }
      ]);
  }

  /**
   * 晶振 + 负载电容。MCU 脚先水平离脚再连晶振，电容就近并入对应端。
   * 布局约定：c1/c2 分列晶振左右同 y。
   */
  static crystal(doc, mcu, xtal, c1, c2, inPin, outPin, prefix = '', gnd = null) {
    // 分段：MCU←→XTAL、XTAL←→C，避免星形竖穿脚列
    K.join(doc, `${prefix}XTAL1`, NetType.SIGNAL, [
      { comp: xtal, pinId: '1', pinName: '1' },
      { comp: mcu, pinId: inPin, pinName: inPin }
    ]);
    K.join(doc, `${prefix}XTAL1`, NetType.SIGNAL, [
      { comp: xtal, pinId: '1', pinName: '1' },
      { comp: c1, pinId: '1', pinName: '1' }
    ]);
    K.join(doc, `${prefix}XTAL2`, NetType.SIGNAL, [
      { comp: xtal, pinId: '2', pinName: '2' },
      { comp: mcu, pinId: outPin, pinName: outPin }
    ]);
    K.join(doc, `${prefix}XTAL2`, NetType.SIGNAL, [
      { comp: xtal, pinId: '2', pinName: '2' },
      { comp: c2, pinId: '1', pinName: '1' }
    ]);
    // 负载电容接地用 stub+标号：GND 电源母线若横穿电容本体（同 y 的 pin1–pin2），
    // 拓扑重建会把 OSC 端并到地（CX2 两端皆 GND）。
    if (gnd) {
      K.join(doc, 'GND', NetType.GROUND, [
        { comp: gnd, pinId: '1', pinName: 'GND' }
      ]);
    }
    K.stubLabel(doc, { comp: c1, pinId: '2', pinName: '2' }, 'GND', NetType.GROUND);
    K.stubLabel(doc, { comp: c2, pinId: '2', pinName: '2' }, 'GND', NetType.GROUND);
  }

  static pinOffset(libraryId, pinId, _pinName) {
    // 与 BuiltinComponents.makeRelaySpdt 对齐：线圈上排 + 触点下排
    if (libraryId === 'RELAY_SPDT') {
      switch (pinId) {
        case '1': return { x: -30, y: -10 };
        case '2': return { x: 30, y: -10 };
        case 'COM': return { x: 0, y: 20 };
        case 'NO': return { x: 20, y: 20 };
        case 'NC': return { x: -20, y: 20 };
        default: return { x: 0, y: 0 };
      }
    }
    if (libraryId.startsWith('POT_')) {
      if (pinId === '1') return { x: -30, y: 0 };
      if (pinId === '2') return { x: 30, y: 0 };
      if (pinId === 'W') return { x: 0, y: 28 };
      return { x: 0, y: 0 };
    }
    if (libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
      libraryId.startsWith('XTAL_') || libraryId.startsWith('L_') ||
      libraryId.startsWith('FUSE_') || libraryId === 'DS18B20' ||
      libraryId === 'HALL_SENSOR' || libraryId === 'LDR' ||
      libraryId === 'BUZZER' ||
      libraryId === 'SW_PUSH') {
      return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    if (libraryId.startsWith('LED_') || libraryId === '1N4148' ||
      libraryId === '1N4007' || libraryId === '1N5819') {
      return pinId === 'A' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    if (libraryId === 'VCC') return { x: 0, y: 10 };
    if (libraryId === 'GND') return { x: 0, y: -10 };
    if (libraryId === 'VAC') return pinId === '1' ? { x: -20, y: 0 } : { x: 20, y: 0 };
    if (libraryId === 'UA741') {
      switch (pinId) {
        case 'IN+': return { x: -30, y: -10 };
        case 'IN-': return { x: -30, y: 10 };
        case 'OUT': return { x: 30, y: 0 };
        case 'VCC': return { x: 0, y: -40 };
        case 'VEE': return { x: 0, y: 40 };
        default: return { x: 0, y: 0 };
      }
    }
    if (libraryId === 'LM358' || libraryId === 'TL082') {
      switch (pinId) {
        case 'OUT1': return { x: 50, y: -30 };
        case 'IN-1': return { x: -50, y: -20 };
        case 'IN+1': return { x: -50, y: -40 };
        case 'V-': return { x: 0, y: 50 };
        case 'IN+2': return { x: -50, y: 20 };
        case 'IN-2': return { x: -50, y: 40 };
        case 'OUT2': return { x: 50, y: 30 };
        case 'V+': return { x: 0, y: -50 };
        default: return { x: 0, y: 0 };
      }
    }
    if (libraryId === 'LM7805' || libraryId === 'LM7812' || libraryId === 'AMS1117_3V3') {
      // TO-220：IN 左 / GND 下 / OUT 右（与 BuiltinComponents.icRegulator 对齐）
      if (pinId === '1') return { x: -40, y: 0 };
      if (pinId === '2') return { x: 0, y: 40 };
      if (pinId === '3') return { x: 40, y: 0 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LM2596') return K.genPinOffset(5, pinId, 40);
    if (libraryId.startsWith('74HC')) {
      if (pinId === '14') return { x: 0, y: -40 };
      if (pinId === '7') return { x: 0, y: 40 };
      if (libraryId === '74HC04') {
        if (pinId === '1') return { x: -40, y: 0 };
        if (pinId === '2') return { x: 40, y: 0 };
      } else {
        if (pinId === '1') return { x: -40, y: -10 };
        if (pinId === '2') return { x: -40, y: 10 };
        if (pinId === '3') return { x: 40, y: 0 };
      }
      return { x: 0, y: 0 };
    }
    if (libraryId === 'CD4017') return K.genPinOffset(16, pinId, 40);
    if (libraryId === '2764' || libraryId === '62256') return K.genPinOffset(28, pinId, 40);
    if (libraryId === '24C02' || libraryId === 'W25Q64') return K.genPinOffset(8, pinId, 40);
    if (libraryId.startsWith('STM32')) {
      const pinCount = libraryId.includes('F407') ? 100 : 48;
      return K.mcuPinOffset(pinCount, pinId);
    }
    if (libraryId === 'AT89C51' || libraryId === 'AT89C52' || libraryId.startsWith('STC')) {
      return K.mcuPinOffset(40, pinId);
    }
    if (libraryId === '2N2222' || libraryId === '2N2907') {
      if (pinId === 'B') return { x: -30, y: 0 };
      if (pinId === 'C') return { x: 30, y: -20 };
      if (pinId === 'E') return { x: 30, y: 20 };
      return { x: 0, y: 0 };
    }
    if (libraryId === '2N7000' || libraryId === 'IRF540') {
      if (pinId === 'G') return { x: -30, y: 0 };
      if (pinId === 'D') return { x: 30, y: -10 };
      if (pinId === 'S') return { x: 30, y: 10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'VOLTMETER_DC' || libraryId === 'VIRTUAL_METER') {
      // 脚距加大，避免 stub 标号在吸附时 V+/COM 互抢（原 ±10）
      if (pinId === 'V+' || pinId === 'V') return { x: -30, y: -25 };
      if (pinId === 'COM') return { x: -30, y: 25 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'AMMETER_DC') {
      if (pinId === 'I+') return { x: -30, y: 0 };
      if (pinId === 'I-') return { x: -30, y: 20 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'FREQ_COUNTER') {
      if (pinId === 'IN') return { x: -30, y: -10 };
      if (pinId === 'GND') return { x: -30, y: 10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'OSCILLOSCOPE') {
      if (pinId === 'CH1') return { x: -40, y: -20 };
      if (pinId === 'CH2') return { x: -40, y: -10 };
      if (pinId === 'CH3') return { x: -40, y: 10 };
      if (pinId === 'CH4') return { x: -40, y: 20 };
      if (pinId === 'GND') return { x: 40, y: 40 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LOGIC_ANALYZER') {
      const chNum = pinId.startsWith('CH') ? parseInt(pinId.substring(2), 10) : 0;
      if (chNum >= 1 && chNum <= 8) return { x: -40, y: -40 + (chNum - 1) * 10 };
      if (pinId === 'GND') return { x: -40, y: 40 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'POWER_METER') {
      if (pinId === 'V+') return { x: -40, y: -20 };
      if (pinId === 'V-') return { x: -40, y: 0 };
      if (pinId === 'I+') return { x: -40, y: 20 };
      if (pinId === 'I-') return { x: -40, y: 40 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'UART_TERMINAL') {
      if (pinId === 'TX') return { x: -40, y: -10 };
      if (pinId === 'RX') return { x: -40, y: 10 };
      if (pinId === 'GND') return { x: -40, y: 30 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LCD1602') return K.genPinOffset(16, pinId, 40);
    if (libraryId === 'OLED_12864') {
      switch (pinId) {
        case 'VCC': return { x: -30, y: -10 };
        case 'GND': return { x: -30, y: 10 };
        case 'SDA': return { x: 30, y: -10 };
        case 'SCL': return { x: 30, y: 10 };
        default: return { x: 0, y: 0 };
      }
    }
    const pinNum = parseInt(pinId, 10);
    if (!isNaN(pinNum)) return K.genPinOffset(16, pinId, 40);
    if (pinId.startsWith('P')) {
      const n = parseInt(pinId.substring(1), 10);
      if (!isNaN(n)) return K.mcuPinOffset(48, pinId);
    }
    return { x: 0, y: 0 };
  }

  /** 与 BuiltinComponents.genPins 一致 */
  static genPinOffset(count, pinId, bodyX) {
    const pinNum = parseInt(pinId, 10);
    const leftCount = Math.ceil(count / 2);
    const rightCount = Math.floor(count / 2);
    const bodyHalf = Math.max(leftCount, rightCount) * 10 / 2;
    const idx = pinNum - 1;
    if (idx < leftCount) return { x: -bodyX, y: idx * 10 - bodyHalf };
    const rightIdx = idx - leftCount;
    return { x: bodyX, y: rightIdx * 10 - bodyHalf };
  }

  static mcuPinOffset(count, pinId) {
    const n = parseInt(pinId.substring(1), 10);
    const leftCount = Math.ceil(count / 2);
    const rightCount = Math.floor(count / 2);
    const bodyHalf = Math.max(leftCount, rightCount) * 10 / 2;
    const idx = n - 1;
    if (idx < leftCount) return { x: -50, y: idx * 10 - bodyHalf };
    const rightIdx = idx - leftCount;
    return { x: 50, y: rightIdx * 10 - bodyHalf };
  }
}

export const R = (doc, id, ref, x, y) => K.place(doc, id, ref, { x, y });
export const C = (doc, id, ref, x, y) => K.place(doc, id, ref, { x, y });
export const NetTypeEnum = NetType;
