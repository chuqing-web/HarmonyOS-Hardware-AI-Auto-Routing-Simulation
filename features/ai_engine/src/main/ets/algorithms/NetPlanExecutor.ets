/**
 * 网络计划执行器 v1.0 — 纯执行引擎，不包含任何拓扑推理逻辑
 *
 * 职责: 接收 LLM 生成的 netPlan JSON，创建对应的 net、label、stub wire。
 * 不做任何拓扑判断 — 所有决策由 LLM 在 netPlan 中完成。
 * 仅做最低限度的安全检查（防止短路、浮空等致命错误）。
 */
import {
  SchTopology, NetInfo, NetLabelInfo, DeviceInst, NetNodeRef,
  IdUtil, Point2D, makeRouteLine,
  DeviceHitGeometry, SELECTION_HIT_PAD, WorldHitRect
} from 'common';
import { PinWorldResolver } from './PinWorldResolver';

export interface NetPlanWiringHints {
  priorityOrder: string[];
  forceWire: string[];
  forceLabel: string[];
}

export interface NetPlanConnection {
  compRef: string;
  pinId: string;
  pinName: string;
  mode: 'joinWired' | 'joinByLabel';
}

export interface NetPlanEntry {
  name: string;
  type: 'power' | 'ground' | 'signal';
  connections: NetPlanConnection[];
  /** Optional: AI-suggested intermediate waypoints for wire routing.
   *  Each entry is a sequence of points the wire should pass through.
   *  Index maps to the wire segment between connections[i] and connections[i+1].
   *  The routing engine will try to pass through these points while avoiding obstacles. */
  routeWaypoints?: Point2D[][];
}

export interface NetPlanLabel {
  netName: string;
  text: string;
  atComp: string;
  atPin: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  /** Optional: precise world position override for the label */
  worldPos?: Point2D;
}

export interface NetPlanResult {
  nets: NetPlanEntry[];
  labels: NetPlanLabel[];
  wiringHints: NetPlanWiringHints;
  /** Optional: AI-suggested routing strategy per net.
   *  Key = net name, Value = "direct" (straight L-shape) | "avoid_cross" (detour to avoid crossings) */
  routeStrategy?: Record<string, string>;
  topologyNotes: string;
}

export interface NetPlanExecutionResult {
  topology: SchTopology;
  netCount: number;
  labelCount: number;
  stubWireCount: number;
  notes: string;
  failures: string[];
}

interface LabelPinEntry {
  dev: DeviceInst;
  pinId: string;
  pinName: string;
}

export class NetPlanExecutor {

  /**
   * 确定性修复：合并探针/仪器重复脚、消除一脚双网。
   * 返回修复条数；调用方应在 critique 前执行。
   */
  static sanitizeDuplicatePins(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let fixes = 0;
    const isInstrLib = (lib: string): boolean => {
      const u = lib.toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('LOGIC_ANALYZER') >= 0 ||
        u.indexOf('UART') >= 0 || u.indexOf('FREQ') >= 0;
    };
    const libOf = (ref: string): string => {
      const d = topo.deviceList.find(x =>
        x.refName.toUpperCase() === ref.toUpperCase());
      return d ? d.libDevId : '';
    };
    const isInstrRef = (ref: string): boolean => isInstrLib(libOf(ref));
    const isProbeNetName = (name: string): boolean => {
      const u = name.toUpperCase();
      return u.indexOf('PROBE') === 0 || u.indexOf('OSC_') === 0 ||
        u.indexOf('OSCCH') === 0 || /^CH\d+$/.test(u) ||
        u.indexOf('SENSE_PROBE') >= 0;
    };
    const pinKey = (c: NetPlanConnection): string =>
      `${c.compRef}:${c.pinId}`.toUpperCase();

    // Pass1: 探针网 → 并入已含同一 DUT 脚的信号网
    for (let pi = plan.nets.length - 1; pi >= 0; pi--) {
      const probe = plan.nets[pi];
      if (!isProbeNetName(probe.name ?? '')) {
        continue;
      }
      const conns = probe.connections ?? [];
      let targetIdx = -1;
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        if (isInstrRef(c.compRef)) {
          continue;
        }
        const key = pinKey(c);
        for (let ni = 0; ni < plan.nets.length; ni++) {
          if (ni === pi) {
            continue;
          }
          const other = plan.nets[ni];
          if (isProbeNetName(other.name ?? '')) {
            continue;
          }
          const has = (other.connections ?? []).some(oc => pinKey(oc) === key);
          if (has) {
            targetIdx = ni;
            break;
          }
        }
        if (targetIdx >= 0) {
          break;
        }
      }
      if (targetIdx < 0) {
        continue;
      }
      const target = plan.nets[targetIdx];
      const existing = new Set((target.connections ?? []).map(pinKey));
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const k = pinKey(c);
        if (existing.has(k)) {
          continue;
        }
        // 只把仪器脚并入；DUT 脚已在 target
        if (isInstrRef(c.compRef)) {
          target.connections.push(c);
          existing.add(k);
          fixes++;
        }
      }
      plan.nets.splice(pi, 1);
      fixes++;
    }

    // Pass2: 残留一脚双网 — 仪器侧优先让路；否则保留先出现的非探针网
    const owner = new Map<string, number>();
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const conns = net.connections ?? [];
      const kept: NetPlanConnection[] = [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const k = pinKey(c);
        const prev = owner.get(k);
        if (prev === undefined) {
          owner.set(k, ni);
          kept.push(c);
          continue;
        }
        if (prev === ni) {
          kept.push(c);
          continue;
        }
        const prevName = (plan.nets[prev].name ?? '').toUpperCase();
        const curName = (net.name ?? '').toUpperCase();
        const prevProbe = isProbeNetName(prevName);
        const curProbe = isProbeNetName(curName);
        // 当前是探针/仅仪器脚 → 丢弃本处 DUT 重复，仪器脚改并入 owner
        if (curProbe || isInstrRef(c.compRef)) {
          if (isInstrRef(c.compRef)) {
            const oConns = plan.nets[prev].connections ?? [];
            if (!oConns.some(oc => pinKey(oc) === k)) {
              oConns.push(c);
              plan.nets[prev].connections = oConns;
            }
          }
          fixes++;
          continue;
        }
        // 先前是探针 → 改由当前网接管
        if (prevProbe) {
          const oNet = plan.nets[prev];
          oNet.connections = (oNet.connections ?? []).filter(oc => pinKey(oc) !== k);
          owner.set(k, ni);
          kept.push(c);
          fixes++;
          continue;
        }
        // 真冲突（如 B 脚挂两路驱动）：优先保留蜂鸣器驱动网 / 非 LED 网
        const prevPrefer = prevName.indexOf('BUZZ') >= 0 || prevName.indexOf('BJT') >= 0;
        const curPrefer = curName.indexOf('BUZZ') >= 0 || curName.indexOf('BJT') >= 0;
        if (curPrefer && !prevPrefer) {
          const oNet = plan.nets[prev];
          oNet.connections = (oNet.connections ?? []).filter(oc => pinKey(oc) !== k);
          owner.set(k, ni);
          kept.push(c);
          fixes++;
          continue;
        }
        fixes++;
      }
      net.connections = kept;
    }

    // Pass3: 删空网
    plan.nets = plan.nets.filter(n => (n.connections ?? []).length > 0);
    return fixes;
  }

  /**
   * 执行 LLM 生成的 netPlan — 纯执行，无推理。
   * 将 LLM 的网络计划转换为实际的 NetInfo / NetLabelInfo / RouteLine。
   */
  static execute(topo: SchTopology, plan: NetPlanResult): NetPlanExecutionResult {
    const failures: string[] = [];
    let netCount = 0;
    let labelCount = 0;
    let stubWireCount = 0;

    // 队列索引：同名/同 libDevId 多实例按出现顺序消费，禁止 Map 覆盖丢器件
    const refQueues = new Map<string, DeviceInst[]>();
    const libQueues = new Map<string, DeviceInst[]>();
    const libCounts = new Map<string, number>();
    const stickyByKey = new Map<string, DeviceInst>();
    const allDevs = topo.deviceList.slice();
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const rq = refQueues.get(d.refName) ?? [];
      rq.push(d);
      refQueues.set(d.refName, rq);
      const lq = libQueues.get(d.libDevId) ?? [];
      lq.push(d);
      libQueues.set(d.libDevId, lq);
      libCounts.set(d.libDevId, (libCounts.get(d.libDevId) ?? 0) + 1);
    }

    // 清空旧网络与导线（避免编辑/重跑残留脏线并入新 stub）
    topo.netList = [];
    topo.netLabelList = [];
    topo.wireList = [];

    // wiringHints：强制标号 / 强制导线（先于扇出截断）
    NetPlanExecutor.applyWiringHints(plan);

    // 单脚最多 2 根 joinWired：超出改为 joinByLabel
    NetPlanExecutor.capJoinWiredFanout(plan);

    // 逐网创建
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const netPlan = plan.nets[ni];

      // 验证: 至少2个连接
      if (netPlan.connections.length < 2) {
        failures.push(`网络 "${netPlan.name}" 只有 ${netPlan.connections.length} 个连接，跳过(需≥2)`);
        continue;
      }

      // 解析连接 → NodeRef（单网内同 compRef 固定同一实例；唯一位号跨网粘滞）
      const nodeList: NetNodeRef[] = [];
      const labelPins: LabelPinEntry[] = [];
      const netLocal = new Map<string, DeviceInst>();

      for (let ci = 0; ci < netPlan.connections.length; ci++) {
        const conn = netPlan.connections[ci];
        let dev = netLocal.get(conn.compRef);
        if (!dev) {
          dev = stickyByKey.get(conn.compRef);
        }
        if (!dev) {
          const taken = NetPlanExecutor.takeDevice(conn.compRef, refQueues, libQueues, allDevs);
          dev = taken !== null ? taken : undefined;
          if (dev) {
            // 精确位号始终跨网粘滞；同型号多实例禁止粘滞模糊名/libDevId
            stickyByKey.set(dev.refName, dev);
            if ((libCounts.get(dev.libDevId) ?? 0) <= 1) {
              stickyByKey.set(dev.libDevId, dev);
              stickyByKey.set(conn.compRef, dev);
            } else if (conn.compRef === dev.refName) {
              stickyByKey.set(conn.compRef, dev);
            }
          }
        }
        if (dev) {
          netLocal.set(conn.compRef, dev);
        }
        if (!dev) {
          failures.push(`器件 "${conn.compRef}" 不存在，跳过连接`);
          continue;
        }
        const nodeRef: NetNodeRef = {
          devUuid: dev.instUuid,
          pinId: conn.pinId,
          pinName: conn.pinName.length > 0 ? conn.pinName : conn.pinId
        };
        nodeList.push(nodeRef);

        if (conn.mode === 'joinByLabel') {
          const lp: LabelPinEntry = { dev: dev, pinId: conn.pinId, pinName: conn.pinName };
          labelPins.push(lp);
        }
      }

      if (nodeList.length < 2) {
        failures.push(`网络 "${netPlan.name}" 解析后不足2个连接`);
        continue;
      }

      // 安全检查: 电流表 I+/I- 不该在同一网络
      if (netPlan.name.toUpperCase().includes('VCC') && !netPlan.name.includes('VCC_AM')) {
        let hasIPlus = false;
        let hasIMinus = false;
        for (const conn of netPlan.connections) {
          if (conn.pinName === 'I+') hasIPlus = true;
          if (conn.pinName === 'I-') hasIMinus = true;
        }
        if (hasIPlus && hasIMinus) {
          failures.push(`电流表 I+/I- 在同一网络 "${netPlan.name}" → 短路！拒绝执行`);
          continue;
        }
      }

      // 确定网络类型
      const isPower = netPlan.type === 'power' || netPlan.type === 'ground';
      const netName = netPlan.name;

      const netInfo: NetInfo = {
        netUuid: IdUtil.generate('net'),
        netName: netName,
        displayName: netName,
        nodeList: nodeList,
        isPower: isPower,
        isAnalog: false,
        isBusMember: false,
        busParentUuid: '',
        defaultVoltage: netPlan.type === 'power' ? 5.0 : 0.0,
        ercWarning: false,
        connectedProbeIds: []
      };
      topo.netList.push(netInfo);
      netCount++;

      // 为 joinByLabel 引脚创建标号 + stub 导线
      for (const lp of labelPins) {
        const labelEntry = plan.labels.find(l =>
          l.netName === netPlan.name && l.atComp === lp.dev.refName && l.atPin === lp.pinId);
        const text = labelEntry ? labelEntry.text : netPlan.name;
        const pinPos = PinWorldResolver.forDeviceInst(lp.dev, lp.pinId, lp.pinName);
        // 沿最近边逃逸引出，禁止 L 折线穿选中区
        const labelPos = NetPlanExecutor.stubLabelOutside(lp.dev, pinPos);

        // 创建标号数据
        const labelInfo: NetLabelInfo = {
          id: IdUtil.generate('lbl'),
          netUuid: netInfo.netUuid,
          text: text,
          x: labelPos.x,
          y: labelPos.y,
          global: false
        };
        topo.netLabelList.push(labelInfo);
        labelCount++;

        // 单段正交 stub：引脚 → 区外标号
        const routeLine = makeRouteLine(netInfo.netUuid, [pinPos, labelPos], false);
        topo.wireList.push(routeLine);
        stubWireCount++;
      }
    }

    // 无 LLM 计划的 fallback: 最少保证 VCC/GND 网络存在
    if (topo.netList.length === 0 && topo.deviceList.length > 0) {
      NetPlanExecutor.ensureMinimumNets(topo, failures);
    }

    const notes = plan.topologyNotes.length > 0
      ? `LLM拓扑推理: ${plan.topologyNotes}`
      : `执行 ${netCount} 网/${labelCount} 标号/${stubWireCount} stub导线`;

    return { topology: topo, netCount, labelCount, stubWireCount, notes, failures };
  }

  /**
   * 按 wiringHints 改写连接 mode：forceLabel 优先于 forceWire。
   */
  private static applyWiringHints(plan: NetPlanResult): void {
    const hints = plan.wiringHints;
    if (!hints) {
      return;
    }
    const forceLabel = hints.forceLabel ?? [];
    const forceWire = hints.forceWire ?? [];
    if (forceLabel.length === 0 && forceWire.length === 0) {
      return;
    }
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const nameUp = net.name.toUpperCase();
      let toLabel = false;
      let toWire = false;
      for (let i = 0; i < forceLabel.length; i++) {
        if (nameUp === forceLabel[i].toUpperCase()) {
          toLabel = true;
          break;
        }
      }
      for (let i = 0; i < forceWire.length; i++) {
        if (nameUp === forceWire[i].toUpperCase()) {
          toWire = true;
          break;
        }
      }
      // 线圈驱动网禁止 forceLabel 误伤
      if (toLabel && (nameUp.indexOf('COIL') >= 0 || nameUp.indexOf('REL_COIL') >= 0)) {
        toLabel = false;
        toWire = true;
      }
      if (!toLabel && !toWire) {
        continue;
      }
      for (let ci = 0; ci < net.connections.length; ci++) {
        if (toLabel) {
          net.connections[ci].mode = 'joinByLabel';
        } else if (toWire) {
          net.connections[ci].mode = 'joinWired';
        }
      }
    }
  }

  /** 标号 stub 终点：沿器件选中区最近边引出 */
  private static stubLabelOutside(dev: DeviceInst, pinPos: Point2D): Point2D {
    const halfW = Math.max(Math.abs(pinPos.x - dev.x), 30) + SELECTION_HIT_PAD;
    const halfH = Math.max(Math.abs(pinPos.y - dev.y), 20) + SELECTION_HIT_PAD;
    const rect: WorldHitRect = {
      x: dev.x - halfW,
      y: dev.y - halfH,
      w: halfW * 2,
      h: halfH * 2,
      refName: dev.refName,
      instUuid: dev.instUuid,
      libDevId: dev.libDevId
    };
    return DeviceHitGeometry.stubLabelOutsidePin(pinPos, rect, 20);
  }

  /**
   * 同一引脚（compRef+pinId）最多 2 次 joinWired；超出改为 joinByLabel。
   * 避免星形扇出在规划阶段就埋下 >2 根导线。
   */
  private static capJoinWiredFanout(plan: NetPlanResult): void {
    const wiredCount = new Map<string, number>();
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections;
      for (let ci = 0; ci < conns.length; ci++) {
        const conn = conns[ci];
        if (conn.mode !== 'joinWired') {
          continue;
        }
        const key = `${conn.compRef}|${conn.pinId}`;
        const n = (wiredCount.get(key) ?? 0) + 1;
        if (n > 2) {
          conn.mode = 'joinByLabel';
        } else {
          wiredCount.set(key, n);
        }
      }
    }
  }

  /**
   * 解析 LLM compRef → 器件实例。
   * 优先精确 refName，其次 libDevId。
   * 从队列 shift，保证同名第二颗电阻不会被第一颗覆盖。
   */
  private static takeDevice(compRef: string,
    refQueues: Map<string, DeviceInst[]>,
    libQueues: Map<string, DeviceInst[]>,
    allDevs: DeviceInst[]): DeviceInst | null {
    const fromQueue = (q: Map<string, DeviceInst[]>, key: string): DeviceInst | null => {
      const list = q.get(key);
      if (list !== undefined && list.length > 0) {
        return list.shift() as DeviceInst;
      }
      return null;
    };
    let hit = fromQueue(refQueues, compRef);
    if (hit) {
      NetPlanExecutor.drainDevice(hit, refQueues, libQueues);
      return hit;
    }
    hit = fromQueue(libQueues, compRef);
    if (hit) {
      NetPlanExecutor.drainDevice(hit, refQueues, libQueues);
      return hit;
    }
    // 禁止子串模糊匹配（"R"/"LED" 会误绑多实例）
    return null;
  }

  /** 从所有队列移除该实例，避免重复分配 */
  private static drainDevice(dev: DeviceInst,
    refQueues: Map<string, DeviceInst[]>,
    libQueues: Map<string, DeviceInst[]>): void {
    const rq = refQueues.get(dev.refName);
    if (rq) {
      refQueues.set(dev.refName, rq.filter(d => d.instUuid !== dev.instUuid));
    }
    const lq = libQueues.get(dev.libDevId);
    if (lq) {
      libQueues.set(dev.libDevId, lq.filter(d => d.instUuid !== dev.instUuid));
    }
  }

  /** 根据 pin 实际坐标 + side 计算标号放置位置 */
  private static labelPosFromPin(pinPos: Point2D, side: string): Point2D {
    const stubLen = 30;
    switch (side) {
      case 'left': return { x: pinPos.x - stubLen, y: pinPos.y };
      case 'right': return { x: pinPos.x + stubLen, y: pinPos.y };
      case 'top': return { x: pinPos.x, y: pinPos.y - stubLen };
      case 'bottom': default: return { x: pinPos.x, y: pinPos.y + stubLen };
    }
  }

  /** 最小网络保障: 无LLM计划时确保 VCC/GND 存在 */
  private static ensureMinimumNets(topo: SchTopology, failures: string[]): void {
    const hasVcc = topo.deviceList.some(d => d.libDevId === 'VCC');
    const hasGnd = topo.deviceList.some(d => d.libDevId === 'GND');

    if (hasVcc) {
      topo.netList.push({
        netUuid: IdUtil.generate('net'),
        netName: 'VCC',
        displayName: 'VCC',
        nodeList: [],
        isPower: true,
        isAnalog: false,
        isBusMember: false,
        busParentUuid: '',
        defaultVoltage: 5.0,
        ercWarning: false,
        connectedProbeIds: []
      });
    }
    if (hasGnd) {
      topo.netList.push({
        netUuid: IdUtil.generate('net'),
        netName: 'GND',
        displayName: 'GND',
        nodeList: [],
        isPower: true,
        isAnalog: false,
        isBusMember: false,
        busParentUuid: '',
        defaultVoltage: 0.0,
        ercWarning: false,
        connectedProbeIds: []
      });
    }
    failures.push('LLM netPlan 为空或无效，已创建最小 VCC/GND 网络');
  }
}
