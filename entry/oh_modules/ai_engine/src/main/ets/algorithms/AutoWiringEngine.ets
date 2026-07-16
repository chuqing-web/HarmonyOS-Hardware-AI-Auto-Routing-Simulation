/**
 * AI 自动布线引擎 v3.0 — 全电路类型支持 + 仪器感知 + 连接模式选择
 * v3.0: 非MCU电路布线、电流表串联、电压表并联、标号vs导线智能选择
 */
import {
  SchematicDocument, ComponentInstance, Wire, Net, Point2D,
  WireStyle, NetType, NetLabel, IdUtil
} from 'common';

interface WiringNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: WiringNode | null;
}

interface InstrumentInfo {
  comp: ComponentInstance;
  type: string;
}

export class AutoWiringEngine {
  private gridSize: number = 10;

  /** v3.0: 支持所有电路类型，不再要求MCU */
  autoWire(doc: SchematicDocument): SchematicDocument {
    const result = JSON.parse(JSON.stringify(doc)) as SchematicDocument;
    this.ensurePowerNets(result);

    const instruments = this.detectInstruments(result);
    const mcu = result.components.find(c =>
      c.libraryId.includes('STM32') || c.libraryId.includes('AT89') || c.libraryId.includes('STC'));

    if (mcu) {
      this.wireMcuMinimumSystem(result, mcu);
    }

    if (instruments.length > 0) {
      this.wireInstruments(result, instruments);
    }

    this.wireRemainingConnections(result);
    this.optimizeWirePaths(result);
    return result;
  }

  /** v3.0: 检测所有仪器器件 */
  private detectInstruments(doc: SchematicDocument): InstrumentInfo[] {
    const result: InstrumentInfo[] = [];
    for (let i = 0; i < doc.components.length; i++) {
      const c = doc.components[i];
      const id = c.libraryId.toUpperCase();
      let type: string = 'other';
      if (id.includes('AMMETER')) {
        type = 'ammeter';
      } else if (id.includes('VOLTMETER') || id.includes('VIRTUAL_METER')) {
        type = 'voltmeter';
      } else if (id.includes('MULTIMETER')) {
        type = 'multimeter';
      } else if (id.includes('OSCILLOSCOPE')) {
        type = 'scope';
      } else if (id.includes('LOGIC_ANALYZER')) {
        type = 'logic_analyzer';
      } else if (id.includes('UART_TERMINAL')) {
        type = 'uart_terminal';
      } else if (id.includes('FREQ_COUNTER') || id.includes('POWER_METER')) {
        type = 'freq_counter';
      } else {
        continue;
      }
      result.push({ comp: c, type });
    }
    return result;
  }

  /** v3.0: 仪器布线 — 电流表串联入电源回路、电压表并联到被测节点、示波器探针连接到信号点 */
  private wireInstruments(doc: SchematicDocument, instruments: InstrumentInfo[]): void {
    const vccNet = doc.nets.find(n => n.name === 'VCC');
    const gndNet = doc.nets.find(n => n.name === 'GND');

    for (let i = 0; i < instruments.length; i++) {
      const instr = instruments[i];
      switch (instr.type) {
        case 'ammeter':
          this.wireAmmeterInSeries(doc, instr.comp, vccNet);
          break;
        case 'voltmeter':
        case 'multimeter':
          this.wireVoltmeterInParallel(doc, instr.comp, gndNet);
          break;
        case 'scope':
          this.wireScopeProbes(doc, instr.comp, gndNet);
          break;
        case 'logic_analyzer':
        case 'uart_terminal':
        case 'freq_counter':
          this.wireInstrumentByLabel(doc, instr.comp);
          break;
      }
    }
  }

  /** v3.0: 电流表串联在 VCC 与负载之间 — VCC→I+→I-→负载电阻 */
  private wireAmmeterInSeries(doc: SchematicDocument, ammeter: ComponentInstance,
    vccNet: Net | undefined): void {
    if (!vccNet) return;

    // 查找 VCC 符号和第一负载电阻
    const vccComp = doc.components.find(c => c.libraryId === 'VCC');
    const firstResistor = doc.components.find(c =>
      c.libraryId.startsWith('R_') && c.libraryId !== 'R_10k' &&
      c.libraryId !== 'R_4.7k');

    if (!vccComp || !firstResistor) return;

    // 创建中间网络: VCC_AM (VCC经过电流表后的网络)
    const amNetId = IdUtil.generate('net');
    const amNet: Net = {
      id: amNetId, name: 'VCC_AM', type: NetType.SIGNAL, pinIds: []
    };
    doc.nets.push(amNet);

    // VCC → I+ (短导线)
    const vccPin = this.estimatePinPos(vccComp, 'top', 0);
    const amIPlus = this.estimatePinPos(ammeter, 'left', 0);
    doc.wires.push({
      id: IdUtil.generate('wire'), netId: vccNet.id,
      points: this.orthogonalRoute(vccPin, amIPlus, doc.components),
      style: WireStyle.ORTHOGONAL
    });

    // I- → 第一电阻 (电流表输出到负载，属于 VCC_AM 网络)
    const amIMinus = this.estimatePinPos(ammeter, 'right', 0);
    const resTop = this.estimatePinPos(firstResistor, 'top', 0);
    doc.wires.push({
      id: IdUtil.generate('wire'), netId: amNetId,
      points: this.orthogonalRoute(amIMinus, resTop, doc.components),
      style: WireStyle.ORTHOGONAL
    });

    // 用网络标号标记 VCC_AM，确保其他需要VCC的器件能识别
    const labelPos: Point2D = {
      x: (amIMinus.x + resTop.x) / 2, y: amIMinus.y - 20
    };
    doc.netLabels.push({
      id: IdUtil.generate('nl'), netId: amNetId,
      text: 'VCC_AM', position: labelPos, global: false
    });
  }

  /** v3.0: 电压表并联到分压节点上 — V+ 接被测高点，COM 接 GND */
  private wireVoltmeterInParallel(doc: SchematicDocument, voltmeter: ComponentInstance,
    gndNet: Net | undefined): void {
    if (!gndNet) return;

    // 找最近的电阻 — 电压表测量该电阻的压降
    const resistors = doc.components.filter(c => c.libraryId.startsWith('R_'));
    if (resistors.length === 0) return;

    // 将电压表唯一分配到某个电阻（按距离最小分配）
    const vmPos = voltmeter.position;
    let bestRes: ComponentInstance | null = null;
    let bestDist = Infinity;
    for (let ri = 0; ri < resistors.length; ri++) {
      const d = Math.hypot(vmPos.x - resistors[ri].position.x,
        vmPos.y - resistors[ri].position.y);
      if (d < bestDist) { bestDist = d; bestRes = resistors[ri]; }
    }
    if (!bestRes) return;

    const targetRes = bestRes;

    // 创建测量网络（信号类型）
    const senseNetId = IdUtil.generate('net');
    const senseNet: Net = {
      id: senseNetId,
      name: `SENSE_R_${targetRes.refDes}`, type: NetType.SIGNAL, pinIds: []
    };
    doc.nets.push(senseNet);

    // V+ → 电阻高端（通过标号，避免长导线跨越）
    const vmPlusPos = this.estimatePinPos(voltmeter, 'left', 0);
    // COM → GND
    const vmComPos = this.estimatePinPos(voltmeter, 'bottom', 0);
    const gndPin = this.estimatePinPos(targetRes, 'bottom', 0);

    // 电压表 COM 接 GND（短导线或标号）
    if (Math.abs(vmComPos.x - gndPin.x) < 200) {
      doc.wires.push({
        id: IdUtil.generate('wire'), netId: gndNet.id,
        points: this.orthogonalRoute(vmComPos, gndPin, doc.components),
        style: WireStyle.ORTHOGONAL
      });
    } else {
      // 远距离用标号
      doc.netLabels.push({
        id: IdUtil.generate('nl'), netId: gndNet.id,
        text: 'GND', position: { x: vmComPos.x + 10, y: vmComPos.y + 20 },
        global: false
      });
    }

    // 电压表 V+ 通过标号连接到被测电阻高端（仪器禁止长导线）
    doc.netLabels.push({
      id: IdUtil.generate('nl'), netId: senseNetId,
      text: `SENSE_R_${targetRes.refDes}`,
      position: { x: vmPlusPos.x - 30, y: vmPlusPos.y - 10 },
      global: false
    });
    // 在被测电阻高端也放标号
    const resTop = this.estimatePinPos(targetRes, 'top', 0);
    doc.netLabels.push({
      id: IdUtil.generate('nl'), netId: senseNetId,
      text: `SENSE_R_${targetRes.refDes}`,
      position: { x: resTop.x + 10, y: resTop.y - 20 },
      global: false
    });
  }

  /** v3.0: 示波器探针连接 — CH1/CH2 通过标号连接到信号节点 */
  private wireScopeProbes(doc: SchematicDocument, scope: ComponentInstance,
    gndNet: Net | undefined): void {
    // 找信号源（运放输出或MCU GPIO）
    const signalComponents = doc.components.filter(c =>
      c.libraryId.includes('LM358') || c.libraryId.includes('LM324') ||
      c.libraryId.includes('OP') || c.libraryId.includes('STM32') ||
      c.libraryId.includes('AT89'));
    if (signalComponents.length === 0) return;
    const signal = signalComponents[0];

    // CH1 通过标号连接
    const ch1NetId = IdUtil.generate('net');
    doc.nets.push({
      id: ch1NetId, name: 'CH1_PROBE', type: NetType.SIGNAL, pinIds: []
    });
    doc.netLabels.push({
      id: IdUtil.generate('nl'), netId: ch1NetId,
      text: 'CH1_PROBE',
      position: { x: scope.position.x - 30, y: scope.position.y + 20 },
      global: false
    });
    doc.netLabels.push({
      id: IdUtil.generate('nl'), netId: ch1NetId,
      text: 'CH1_PROBE',
      position: { x: signal.position.x + 40, y: signal.position.y - 20 },
      global: false
    });

    // GND clip → GND 标号
    if (gndNet) {
      doc.netLabels.push({
        id: IdUtil.generate('nl'), netId: gndNet.id,
        text: 'GND',
        position: { x: scope.position.x - 30, y: scope.position.y + 60 },
        global: false
      });
    }
  }

  /** v3.0: 逻辑分析仪/UART终端/频率计 — 全部用标号连接 */
  private wireInstrumentByLabel(doc: SchematicDocument, instr: ComponentInstance): void {
    const netPrefix = instr.libraryId.includes('UART') ? 'UART' :
      instr.libraryId.includes('LOGIC') ? 'LA' : 'FC';
    const chNetId = IdUtil.generate('net');
    doc.nets.push({
      id: chNetId, name: `${netPrefix}_CH`, type: NetType.SIGNAL, pinIds: []
    });
    doc.netLabels.push({
      id: IdUtil.generate('nl'), netId: chNetId,
      text: `${netPrefix}_CH`,
      position: { x: instr.position.x - 30, y: instr.position.y + 20 },
      global: false
    });
  }

  /** v3.0: 接线剩余未连接的器件引脚 */
  private wireRemainingConnections(doc: SchematicDocument): void {
    const vccNet = doc.nets.find(n => n.name === 'VCC');
    const gndNet = doc.nets.find(n => n.name === 'GND');
    if (!vccNet || !gndNet) return;

    // 已连接引脚集合
    const connectedPins = new Set<string>();
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const netPins = doc.nets[ni].pinIds;
      for (let pi = 0; pi < netPins.length; pi++) {
        connectedPins.add(netPins[pi]);
      }
    }

    for (let i = 0; i < doc.components.length; i++) {
      const comp = doc.components[i];
      const id = comp.libraryId.toUpperCase();
      // 跳过电源/地符号（它们是端点）、已连接的器件、仪器（已处理）
      if (id === 'VCC' || id === 'GND') continue;
      if (id.includes('AMMETER') || id.includes('VOLTMETER') ||
        id.includes('VIRTUAL_METER') || id.includes('OSCILLOSCOPE') ||
        id.includes('LOGIC_ANALYZER') || id.includes('UART_TERMINAL')) continue;

      // 去耦电容接地
      if (id.startsWith('C_') && id.includes('100')) {
        const capPin = this.estimatePinPos(comp, 'bottom', 0);
        const gndPin = this.estimatePinPos(
          doc.components.find(c => c.libraryId === 'GND') ?? comp, 'top', 0);
        doc.wires.push({
          id: IdUtil.generate('wire'), netId: gndNet.id,
          points: this.orthogonalRoute(capPin, gndPin, doc.components),
          style: WireStyle.ORTHOGONAL
        });
      }

      // LED → GND (通过限流电阻已连VCC)
      if (id.startsWith('LED_')) {
        // 查找LED的阴极引脚(K)位置假设
        const ledPin = this.estimatePinPos(comp, 'bottom', 0);
        doc.netLabels.push({
          id: IdUtil.generate('nl'), netId: gndNet.id,
          text: 'GND',
          position: { x: ledPin.x, y: ledPin.y + 20 },
          global: false
        });
      }

      // 上拉/下拉电阻连接
      if (id.startsWith('R_')) {
        // 短电阻连接用导线，远距离用标号
        const resPin = this.estimatePinPos(comp, 'right', 0);
        const nearVcc = Math.abs(comp.position.x - 60) < 150;
        if (nearVcc && id.includes('10k')) {
          // 上拉电阻接VCC
          doc.wires.push({
            id: IdUtil.generate('wire'), netId: vccNet.id,
            points: this.orthogonalRoute(resPin,
              this.estimatePinPos(comp, 'left', 0), doc.components),
            style: WireStyle.ORTHOGONAL
          });
        }
      }
    }
  }

  /** 估算引脚世界坐标（基于器件位置+已知引脚偏移规则） */
  private estimatePinPos(comp: ComponentInstance, edge: string, pinIndex: number): Point2D {
    const p = comp.position;
    // 常见器件尺寸: IC 80x50, R 60x20, C 40x30, 仪器 100x60
    const id = comp.libraryId.toUpperCase();
    let w = 60; let h = 40; // 默认

    if (id.includes('STM32') || id.includes('AT89') || id.includes('STC')) {
      w = 100; h = 80;
    } else if (id.includes('AMMETER') || id.includes('VOLTMETER') ||
      id.includes('VIRTUAL_METER') || id.includes('OSCILLOSCOPE')) {
      w = 100; h = 70;
    } else if (id === 'VCC') { w = 30; h = 30; }
    else if (id === 'GND') { w = 30; h = 30; }
    else if (id.startsWith('R_')) { w = 60; h = 20; }
    else if (id.startsWith('C_')) { w = 40; h = 30; }
    else if (id.startsWith('LED_')) { w = 40; h = 40; }
    else if (id.includes('XTAL')) { w = 50; h = 40; }

    switch (edge) {
      case 'left': return { x: p.x, y: p.y + h / 2 };
      case 'right': return { x: p.x + w, y: p.y + h / 2 };
      case 'top': return { x: p.x + w / 2, y: p.y };
      case 'bottom': return { x: p.x + w / 2, y: p.y + h };
      default: return { x: p.x + w / 2, y: p.y + h / 2 };
    }
  }

  /** 正交布线: 源→拐点→目标，绕开障碍 */
  private orthogonalRoute(start: Point2D, end: Point2D,
    obstacles: ComponentInstance[]): Point2D[] {
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    // 短距离直线
    if (dist < 100) {
      const mid: Point2D = {
        x: Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ?
          end.x : start.x,
        y: Math.abs(end.y - start.y) > Math.abs(end.x - start.x) ?
          end.y : start.y
      };
      return [start, mid, end];
    }
    // 长距离用A*路径
    return this.findPath(start, end, obstacles);
  }

  private ensurePowerNets(doc: SchematicDocument): void {
    const hasVcc = doc.nets.some(n => n.name === 'VCC' || n.type === NetType.POWER);
    const hasGnd = doc.nets.some(n => n.name === 'GND' || n.type === NetType.GROUND);

    if (!hasVcc) {
      doc.nets.push({ id: IdUtil.generate('net'), name: 'VCC', type: NetType.POWER, pinIds: [] });
    }
    if (!hasGnd) {
      doc.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
    }
  }

  /** MCU最小系统布线: 晶振、去耦电容、复位 */
  private wireMcuMinimumSystem(doc: SchematicDocument, mcu: ComponentInstance): void {
    const crystal = doc.components.find(c => c.libraryId.includes('XTAL'));
    const caps = doc.components.filter(c => c.libraryId.startsWith('C_'));
    const resistors = doc.components.filter(c => c.libraryId.startsWith('R_'));

    const vccNet = doc.nets.find(n => n.name === 'VCC')!;
    const gndNet = doc.nets.find(n => n.name === 'GND')!;

    // 晶振到MCU (OSC_IN/OSC_OUT)
    if (crystal) {
      const xtalOut = this.estimatePinPos(crystal, 'right', 0);
      const mcuXtal = this.estimatePinPos(mcu, 'left', 2);
      doc.wires.push({
        id: IdUtil.generate('wire'), netId: IdUtil.generate('net'),
        points: this.orthogonalRoute(xtalOut, mcuXtal, doc.components),
        style: WireStyle.ORTHOGONAL
      });
      // 晶振负载电容接地
      for (let ci = 0; ci < Math.min(2, caps.length); ci++) {
        const cap = caps[ci];
        if (cap.libraryId.includes('22p') || cap.libraryId.includes('22')) {
          const capBottom = this.estimatePinPos(cap, 'bottom', 0);
          const gndPin = this.estimatePinPos(
            doc.components.find(c => c.libraryId === 'GND') ?? mcu, 'top', 0);
          doc.wires.push({
            id: IdUtil.generate('wire'), netId: gndNet.id,
            points: this.orthogonalRoute(capBottom, gndPin, doc.components),
            style: WireStyle.ORTHOGONAL
          });
        }
      }
    }

    // 去耦电容: VDD 侧接 VCC, GND 侧接地
    for (let ci = 0; ci < Math.min(3, caps.length); ci++) {
      const cap = caps[ci];
      if (cap.libraryId.includes('100n') || cap.libraryId.includes('100')) {
        const capTop = this.estimatePinPos(cap, 'top', 0);
        const capBottom = this.estimatePinPos(cap, 'bottom', 0);
        // 就近VCC/GND — 如果靠近VCC符号就用导线，否则用标号
        const vccComp = doc.components.find(c => c.libraryId === 'VCC');
        if (vccComp && Math.abs(cap.position.x - vccComp.position.x) < 200) {
          doc.wires.push({
            id: IdUtil.generate('wire'), netId: vccNet.id,
            points: this.orthogonalRoute(capTop, this.estimatePinPos(vccComp, 'top', 0),
              doc.components),
            style: WireStyle.ORTHOGONAL
          });
        } else {
          doc.netLabels.push({
            id: IdUtil.generate('nl'), netId: vccNet.id,
            text: 'VCC',
            position: { x: capTop.x, y: capTop.y - 15 },
            global: false
          });
        }
        doc.netLabels.push({
          id: IdUtil.generate('nl'), netId: gndNet.id,
          text: 'GND',
          position: { x: capBottom.x, y: capBottom.y + 15 },
          global: false
        });
      }
    }

    // 复位电阻: 一端VCC, 一端RST
    for (let ri = 0; ri < Math.min(1, resistors.length); ri++) {
      const res = resistors[ri];
      if (res.libraryId.includes('10k')) {
        const resLeft = this.estimatePinPos(res, 'left', 0);
        const mcuRst = this.estimatePinPos(mcu, 'left', 1);
        doc.wires.push({
          id: IdUtil.generate('wire'), netId: IdUtil.generate('net'),
          points: this.orthogonalRoute(resLeft, mcuRst, doc.components),
          style: WireStyle.ORTHOGONAL
        });
      }
    }
  }

  private createWireBetween(doc: SchematicDocument, from: ComponentInstance,
    to: ComponentInstance, netId: string): void {
    const start = this.estimatePinPos(from, 'right', 0);
    const end = this.estimatePinPos(to, 'left', 0);
    doc.wires.push({
      id: IdUtil.generate('wire'),
      netId,
      points: this.orthogonalRoute(start, end, doc.components),
      style: WireStyle.ORTHOGONAL
    });
  }

  private createWireToGround(doc: SchematicDocument, comp: ComponentInstance, gndNetId: string): void {
    const start = this.estimatePinPos(comp, 'bottom', 0);
    const gndComp = doc.components.find(c => c.libraryId === 'GND');
    if (gndComp) {
      const end = this.estimatePinPos(gndComp, 'top', 0);
      doc.wires.push({
        id: IdUtil.generate('wire'),
        netId: gndNetId,
        points: this.orthogonalRoute(start, end, doc.components),
        style: WireStyle.ORTHOGONAL
      });
    } else {
      doc.wires.push({
        id: IdUtil.generate('wire'),
        netId: gndNetId,
        points: [start, { x: start.x, y: start.y + 60 }],
        style: WireStyle.ORTHOGONAL
      });
    }
  }

  /** A* 路径搜索 */
  private findPath(start: Point2D, end: Point2D, obstacles: ComponentInstance[]): Point2D[] {
    const openList: WiringNode[] = [];
    const closedSet: Set<string> = new Set();

    const startNode: WiringNode = {
      x: this.snap(start.x), y: this.snap(start.y),
      g: 0, h: this.heuristic(start, end), f: 0, parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);

    while (openList.length > 0) {
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;
      const key = `${current.x},${current.y}`;

      if (closedSet.has(key)) continue;
      closedSet.add(key);

      if (Math.abs(current.x - end.x) < this.gridSize && Math.abs(current.y - end.y) < this.gridSize) {
        return this.reconstructPath(current);
      }

      for (const neighbor of this.getNeighbors(current, obstacles)) {
        const nKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(nKey)) continue;
        neighbor.g = current.g + this.gridSize;
        neighbor.h = this.heuristic({ x: neighbor.x, y: neighbor.y }, end);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        openList.push(neighbor);
      }

      if (closedSet.size > 800) break;
    }

    return [start, { x: start.x, y: end.y }, end];
  }

  private getNeighbors(node: WiringNode, obstacles: ComponentInstance[]): WiringNode[] {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const neighbors: WiringNode[] = [];
    for (let i = 0; i < dirs.length; i++) {
      const dx = dirs[i][0];
      const dy = dirs[i][1];
      const nx = node.x + dx * this.gridSize;
      const ny = node.y + dy * this.gridSize;
      if (nx >= 0 && nx <= 800 && ny >= 0 && ny <= 600 &&
        !this.isBlocked(nx, ny, obstacles)) {
        neighbors.push({ x: nx, y: ny, g: 0, h: 0, f: 0, parent: null });
      }
    }
    return neighbors;
  }

  /**
   * 器件体遮挡检测 — position 是器件中心坐标, 包围盒须居中。
   * 覆盖器件符号体 + 选中边距 (≈±55mil 水平 × ±30mil 垂直, 覆盖标准 60mil 引脚间距 + 边距)。
   */
  private isBlocked(x: number, y: number, obstacles: ComponentInstance[]): boolean {
    for (const obs of obstacles) {
      const cx = obs.position.x;
      const cy = obs.position.y;
      if (x >= cx - 55 && x <= cx + 55 &&
          y >= cy - 30 && y <= cy + 30) {
        return true;
      }
    }
    return false;
  }

  private heuristic(a: Point2D, b: Point2D): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private reconstructPath(node: WiringNode): Point2D[] {
    const path: Point2D[] = [];
    let current: WiringNode | null = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    return this.simplifyPath(path);
  }

  private simplifyPath(path: Point2D[]): Point2D[] {
    if (path.length <= 2) return path;
    const result: Point2D[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const sameX = prev.x === curr.x && curr.x === next.x;
      const sameY = prev.y === curr.y && curr.y === next.y;
      if (!sameX && !sameY) result.push(curr);
    }
    result.push(path[path.length - 1]);
    return result;
  }

  private optimizeWirePaths(doc: SchematicDocument): void {
    for (const wire of doc.wires) {
      if (wire.points.length > 2) {
        wire.points = this.simplifyPath(wire.points);
      }
    }
  }

  private snap(v: number): number {
    return Math.round(v / this.gridSize) * this.gridSize;
  }
}
