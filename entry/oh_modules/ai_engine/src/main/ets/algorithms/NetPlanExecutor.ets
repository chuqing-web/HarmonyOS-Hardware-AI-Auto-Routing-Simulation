/**
 * 网络计划执行器 v1.0 — 纯执行引擎，不包含任何拓扑推理逻辑
 *
 * 职责: 接收 LLM 生成的 netPlan JSON，创建对应的 net、label、stub wire。
 * 不做任何拓扑判断 — 所有决策由 LLM 在 netPlan 中完成。
 * 仅做最低限度的安全检查（防止短路、浮空等致命错误）。
 */
import {
  SchTopology, NetInfo, NetLabelInfo, DeviceInst, NetNodeRef,
  IdUtil, Point2D, makeRouteLine
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

interface DevIndexEntry {
  dev: DeviceInst;
  idx: number;
}

interface LabelPinEntry {
  dev: DeviceInst;
  pinId: string;
  pinName: string;
}

export class NetPlanExecutor {

  /**
   * 执行 LLM 生成的 netPlan — 纯执行，无推理。
   * 将 LLM 的网络计划转换为实际的 NetInfo / NetLabelInfo / RouteLine。
   */
  static execute(topo: SchTopology, plan: NetPlanResult): NetPlanExecutionResult {
    const failures: string[] = [];
    let netCount = 0;
    let labelCount = 0;
    let stubWireCount = 0;

    // 构建 refDes → DeviceInst 索引
    const devByRef = new Map<string, DevIndexEntry>();
    for (let i = 0; i < topo.deviceList.length; i++) {
      const entry: DevIndexEntry = { dev: topo.deviceList[i], idx: i };
      devByRef.set(topo.deviceList[i].refName, entry);
    }

    // 清空旧网络（保留 ERC 错误记录）
    topo.netList = [];
    topo.netLabelList = [];

    // 逐网创建
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const netPlan = plan.nets[ni];

      // 验证: 至少2个连接
      if (netPlan.connections.length < 2) {
        failures.push(`网络 "${netPlan.name}" 只有 ${netPlan.connections.length} 个连接，跳过(需≥2)`);
        continue;
      }

      // 解析连接 → NodeRef
      const nodeList: NetNodeRef[] = [];
      const labelPins: LabelPinEntry[] = [];

      for (let ci = 0; ci < netPlan.connections.length; ci++) {
        const conn = netPlan.connections[ci];
        const entry = devByRef.get(conn.compRef);
        if (!entry) {
          failures.push(`器件 "${conn.compRef}" 不存在，跳过连接`);
          continue;
        }
        const nodeRef: NetNodeRef = {
          devUuid: entry.dev.instUuid,
          pinId: conn.pinId,
          pinName: conn.pinName.length > 0 ? conn.pinName : conn.pinId
        };
        nodeList.push(nodeRef);

        if (conn.mode === 'joinByLabel') {
          const lp: LabelPinEntry = { dev: entry.dev, pinId: conn.pinId, pinName: conn.pinName };
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
        const side = labelEntry ? labelEntry.side : 'right';
        const pinPos = PinWorldResolver.forDeviceInst(lp.dev, lp.pinId, lp.pinName);
        const labelPos = NetPlanExecutor.labelPosFromPin(pinPos, side);

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

        // 创建 stub 导线: 引脚位置 → 标号位置（正交折线）
        const routeLine = makeRouteLine(netInfo.netUuid, [
          pinPos,
          { x: labelPos.x, y: pinPos.y },  // 先水平折到标号X
          labelPos                          // 再垂直折到标号Y
        ], false);
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
