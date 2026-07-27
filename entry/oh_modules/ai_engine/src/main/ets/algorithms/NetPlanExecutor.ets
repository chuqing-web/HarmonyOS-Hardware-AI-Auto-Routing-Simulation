/**
 * 网络计划执行器 v1.0 — 纯执行引擎，不包含任何拓扑推理逻辑
 *
 * 职责: 接收 LLM 生成的 netPlan JSON，创建对应的 net、label、stub wire。
 * 不做任何拓扑判断 — 所有决策由 LLM 在 netPlan 中完成。
 * 仅做最低限度的安全检查（防止短路、浮空等致命错误）。
 */
import {
  SchTopology, NetInfo, NetLabelInfo, DeviceInst, NetNodeRef,
  IdUtil, Point2D, makeRouteLine, RouteLine,
  DeviceHitGeometry, SELECTION_HIT_PAD, FOREIGN_PIN_CLEARANCE, WorldHitRect,
  LabelPlaceHints,
  Logger, INSTR_TRACE_TAG, traceAiDiag, traceAiWireDraw, traceAiWireInventory
} from 'common';
import { IComponentLibrary } from 'component_library';
import { PinWorldResolver } from './PinWorldResolver';
import { TemplateSchematicKit } from './TemplateSchematicKit';

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

/** 增量合并建网结果：保留未变网导线/标号 */
export interface NetPlanMergeResult {
  topology: SchTopology;
  netCount: number;
  labelCount: number;
  stubWireCount: number;
  notes: string;
  failures: string[];
  changedNetNames: string[];
  preservedNetNames: string[];
}

interface LabelPinEntry {
  dev: DeviceInst;
  pinId: string;
  pinName: string;
}

/** 小网才允许标号→导线升级（防满图 A* / wire_cross） */
/** 可升级为 joinWired 的最大网脚数（略放宽以增加可见导线） */
const MAX_WIRE_PROMOTE_PINS: number = 4;

/** sanitizePinToken 返回值（ArkTS 禁止内联对象字面量作类型） */
export interface SanitizedPinToken {
  pinId: string;
  pinName: string;
}

/** 升级为 joinWired 后需拉近的器件对（位号/compRef） */
export interface WiredCompactPair {
  refA: string;
  refB: string;
  netName: string;
}

export class NetPlanExecutor {
  private static library: IComponentLibrary | null = null;

  static setComponentLibrary(library: IComponentLibrary | null): void {
    NetPlanExecutor.library = library;
  }

  /** 将 LLM 原始 JSON 规范成可安全使用的 NetPlanResult（防 undefined.toUpperCase） */
  static normalizeLlmPlan(raw: Object | null): NetPlanResult | null {
    if (!raw || typeof raw !== 'object') {
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] net_plan normalize FAIL raw=null/non-object');
      return null;
    }
    const src = raw as Record<string, Object>;
    const netsRaw = src['nets'];
    if (!Array.isArray(netsRaw) || netsRaw.length === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan normalize FAIL nets=${netsRaw === undefined ? 'missing' :
          (Array.isArray(netsRaw) ? `empty(${(netsRaw as Object[]).length})` : typeof netsRaw)}`);
      return null;
    }
    const dropLines: string[] = [];
    let dropNet = 0;
    let dropConn = 0;
    let rawConn = 0;
    let pinSanitizeCount = 0;
    let aliasCompRefCount = 0;
    const pinSanitizeSamples: string[] = [];
    const aliasKeyHits = new Set<string>();
    const nets: NetPlanEntry[] = [];
    for (let i = 0; i < (netsRaw as Object[]).length; i++) {
      const nObj = (netsRaw as Object[])[i];
      if (!nObj || typeof nObj !== 'object') {
        dropNet++;
        if (dropLines.length < 12) {
          dropLines.push(`net[${i}] skipped: non-object`);
        }
        continue;
      }
      const n = nObj as Record<string, Object>;
      // LLM 常写 netId / id / net 代替 name — 必须兼容，否则整网被丢弃
      const nameRaw = n['name'] ?? n['netName'] ?? n['net_name'] ??
        n['netId'] ?? n['net_id'] ?? n['id'] ?? n['net'] ?? '';
      const name = `${nameRaw}`.trim();
      if (name.length === 0) {
        dropNet++;
        if (dropLines.length < 12) {
          dropLines.push(`net[${i}] skipped: empty name keys=[${Object.keys(n).join(',')}]`);
        }
        continue;
      }
      if ((n['name'] === undefined || n['name'] === null) &&
        (n['netName'] === undefined || n['netName'] === null) &&
        (n['net_name'] === undefined || n['net_name'] === null)) {
        aliasKeyHits.add('net.name←alias');
        if (dropLines.length < 12) {
          dropLines.push(`net[${i}] name aliased → "${name}" keys=[${Object.keys(n).join(',')}]`);
        }
      }
      const nameUp = name.toUpperCase();
      const typeRaw = `${n['type'] ?? n['netType'] ?? n['net_type'] ?? ''}`.toLowerCase();
      let type: 'power' | 'ground' | 'signal' =
        typeRaw === 'power' ? 'power' : (typeRaw === 'ground' ? 'ground' : 'signal');
      // 按网名强制纠正：LLM 常漏写 type，默认 signal 会触发 HARD critique 误杀 VCC/GND
      if (nameUp === 'VCC' || nameUp === 'VDD' || nameUp === '+5V' || nameUp === '5V' ||
        nameUp === '3V3' || nameUp === '+3V3') {
        type = 'power';
      } else if (nameUp === 'GND' || nameUp === 'VSS' || nameUp === 'AGND' || nameUp === 'DGND') {
        type = 'ground';
      }
      const netModeHint = `${n['mode'] ?? ''}`.toLowerCase();
      const connsRaw = n['connections'] ?? n['pins'] ?? n['nodes'];
      const connections: NetPlanConnection[] = [];
      if (Array.isArray(connsRaw)) {
        for (let ci = 0; ci < (connsRaw as Object[]).length; ci++) {
          const cObj = (connsRaw as Object[])[ci];
          rawConn++;
          let compRef = '';
          let pinId = '';
          let pinName = '';
          let modeRaw = netModeHint;
          // LLM 常写简写 "R1.1" / "OSC1.CH1"
          if (typeof cObj === 'string' || typeof cObj === 'number') {
            const s = `${cObj}`.trim();
            const dot = s.lastIndexOf('.');
            if (dot > 0 && dot < s.length - 1) {
              compRef = s.substring(0, dot).trim();
              pinId = s.substring(dot + 1).trim();
              pinName = pinId;
            } else {
              dropConn++;
              if (dropLines.length < 12) {
                dropLines.push(`net[${i}].conn[${ci}] skipped: bad string "${s}"`);
              }
              continue;
            }
          } else if (!cObj || typeof cObj !== 'object') {
            dropConn++;
            if (dropLines.length < 12) {
              dropLines.push(`net[${i}].conn[${ci}] skipped: non-object`);
            }
            continue;
          } else {
            const c = cObj as Record<string, Object>;
            // LLM 常写 deviceRef / device / component，与 schema 的 compRef/refDes 等价
            const hasCanonComp = !!(c['compRef'] || c['comp'] || c['ref'] || c['refDes']);
            const hasAliasComp = !!(c['deviceRef'] || c['device'] || c['component'] || c['instRef']);
            if (!hasCanonComp && hasAliasComp) {
              aliasCompRefCount++;
              if (c['deviceRef']) {
                aliasKeyHits.add('conn.deviceRef');
              } else if (c['device']) {
                aliasKeyHits.add('conn.device');
              } else if (c['component']) {
                aliasKeyHits.add('conn.component');
              } else {
                aliasKeyHits.add('conn.instRef');
              }
            }
            compRef = `${c['compRef'] ?? c['comp'] ?? c['ref'] ?? c['refDes'] ??
              c['deviceRef'] ?? c['device'] ?? c['component'] ?? c['instRef'] ?? ''}`.trim();
            pinId = `${c['pinId'] ?? c['pin'] ?? c['pin_id'] ?? ''}`.trim();
            pinName = `${c['pinName'] ?? c['pin_name'] ?? pinId}`.trim();
            // 对象里也可能写 "pin": "R1.1"
            if ((compRef.length === 0 || pinId.length === 0) && pinId.indexOf('.') > 0) {
              const s = pinId;
              const dot = s.lastIndexOf('.');
              compRef = s.substring(0, dot).trim();
              pinId = s.substring(dot + 1).trim();
              pinName = pinId;
            }
            // 默认标号；本地 prepareModes 会再按脚预算升级导线
            modeRaw = `${c['mode'] ?? netModeHint ?? 'joinByLabel'}`.toLowerCase();
            if (compRef.length === 0 || pinId.length === 0) {
              dropConn++;
              if (dropLines.length < 12) {
                dropLines.push(
                  `net[${i}](${name}).conn[${ci}] skipped: compRef="${compRef}" pinId="${pinId}" keys=[${Object.keys(c).join(',')}]`);
              }
              continue;
            }
          }
          if (compRef.length === 0 || pinId.length === 0) {
            dropConn++;
            continue;
          }
          // 提示里常写 "1(VCC)" / "1(1)" — 必须剥成库内 pinId，否则 pinOffset 落到错误脚
          const rawPinTok = pinId;
          const cleaned = NetPlanExecutor.sanitizePinToken(pinId, pinName);
          pinId = cleaned.pinId;
          pinName = cleaned.pinName;
          if (rawPinTok !== pinId) {
            pinSanitizeCount++;
            if (pinSanitizeSamples.length < 12) {
              pinSanitizeSamples.push(
                `${name}:${compRef} "${rawPinTok}"→"${pinId}"`);
            }
          }
          // 默认 joinByLabel；仅当 LLM 明确写 wire/wired 时暂记 joinWired（随后 prepareModes 仍会先全标号）
          const modeHint = `${modeRaw ?? 'joinByLabel'}`.toLowerCase();
          const mode: 'joinWired' | 'joinByLabel' =
            modeHint.indexOf('wire') >= 0 && modeHint.indexOf('label') < 0 ?
              'joinWired' : 'joinByLabel';
          connections.push({
            compRef, pinId, pinName: pinName.length > 0 ? pinName : pinId, mode
          });
        }
      }
      if (connections.length === 0) {
        dropNet++;
        if (dropLines.length < 12) {
          dropLines.push(`net[${i}](${name}) skipped: no valid connections`);
        }
        continue;
      }
      const routeWaypoints = NetPlanExecutor.parseRouteWaypoints(
        n['routeWaypoints'] ?? n['route_waypoints'] ?? n['waypoints']);
      const entry: NetPlanEntry = { name, type, connections };
      if (routeWaypoints.length > 0) {
        entry.routeWaypoints = routeWaypoints;
      }
      nets.push(entry);
    }
    if (nets.length === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan normalize FAIL all nets dropped rawNets=${(netsRaw as Object[]).length} dropNet=${dropNet} dropConn=${dropConn}`);
      if (dropLines.length > 0) {
        traceAiDiag('AI_PIPE', 'net_plan_drop', dropLines, 16);
      }
      return null;
    }

    const labels: NetPlanLabel[] = [];
    const labelsRaw = src['labels'] ?? src['netLabels'] ?? src['net_labels'];
    if (Array.isArray(labelsRaw)) {
      for (let i = 0; i < (labelsRaw as Object[]).length; i++) {
        const lObj = (labelsRaw as Object[])[i];
        if (!lObj || typeof lObj !== 'object') {
          continue;
        }
        const l = lObj as Record<string, Object>;
        const netName = `${l['netName'] ?? l['net'] ?? l['name'] ?? ''}`.trim();
        const text = `${l['text'] ?? l['label'] ?? netName}`.trim();
        const atComp = `${l['atComp'] ?? l['compRef'] ?? l['ref'] ??
          l['deviceRef'] ?? l['device'] ?? ''}`.trim();
        let atPin = `${l['atPin'] ?? l['pinId'] ?? l['pin'] ?? ''}`.trim();
        if (netName.length === 0 || atComp.length === 0 || atPin.length === 0) {
          continue;
        }
        const pinTok = NetPlanExecutor.sanitizePinToken(atPin, atPin);
        atPin = pinTok.pinId;
        const sideRaw = `${l['side'] ?? 'right'}`.toLowerCase();
        let side: 'left' | 'right' | 'top' | 'bottom' = 'right';
        if (sideRaw === 'left' || sideRaw === 'top' || sideRaw === 'bottom') {
          side = sideRaw;
        }
        labels.push({ netName, text: text.length > 0 ? text : netName, atComp, atPin, side });
      }
    }

    const hintsRaw = src['wiringHints'] ?? src['wiring_hints'] ?? src['connectionModeHints'];
    const wiringHints: NetPlanWiringHints = {
      priorityOrder: NetPlanExecutor.safeStringList(
        hintsRaw && typeof hintsRaw === 'object'
          ? (hintsRaw as Record<string, Object>)['priorityOrder'] ??
            (hintsRaw as Record<string, Object>)['priority_order'] : null),
      forceWire: NetPlanExecutor.safeStringList(
        hintsRaw && typeof hintsRaw === 'object'
          ? (hintsRaw as Record<string, Object>)['forceWire'] ??
            (hintsRaw as Record<string, Object>)['force_wire'] : null),
      forceLabel: NetPlanExecutor.safeStringList(
        hintsRaw && typeof hintsRaw === 'object'
          ? (hintsRaw as Record<string, Object>)['forceLabel'] ??
            (hintsRaw as Record<string, Object>)['force_label'] : null)
    };

    const notes = `${src['topologyNotes'] ?? src['topology_notes'] ?? src['notes'] ?? ''}`;
    let connKeep = 0;
    let wpNets = 0;
    for (let ni = 0; ni < nets.length; ni++) {
      connKeep += nets[ni].connections.length;
      if (nets[ni].routeWaypoints && (nets[ni].routeWaypoints?.length ?? 0) > 0) {
        wpNets++;
      }
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] net_plan normalize OK nets=${nets.length}/${(netsRaw as Object[]).length}` +
      ` conns=${connKeep}/${rawConn} dropNet=${dropNet} dropConn=${dropConn}` +
      ` labels=${labels.length} forceWire=${wiringHints.forceWire.length}` +
      ` forceLabel=${wiringHints.forceLabel.length}` +
      ` waypoints=${wpNets}` +
      ` pinSanitize=${pinSanitizeCount} aliasCompRef=${aliasCompRefCount}`);
    if (aliasKeyHits.size > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan alias keys=[${Array.from(aliasKeyHits).join(',')}]`);
    }
    if (pinSanitizeSamples.length > 0) {
      traceAiDiag('AI_PIPE', 'net_plan_pin_sanitize', pinSanitizeSamples, 12);
    }
    if (dropLines.length > 0) {
      traceAiDiag('AI_PIPE', 'net_plan_drop', dropLines, 16);
    }
    const sample: string[] = [];
    for (let i = 0; i < Math.min(nets.length, 8); i++) {
      const nn = nets[i];
      sample.push(`${nn.name}(${nn.type})×${nn.connections.length}` +
        `[${nn.connections.slice(0, 3).map(c => `${c.compRef}:${c.pinId}`).join(',')}]`);
    }
    if (sample.length > 0) {
      traceAiDiag('AI_PIPE', 'net_plan_norm', sample, 10);
    }
    return { nets, labels, wiringHints, topologyNotes: notes };
  }

  private static safeStringList(value: Object | null | undefined): string[] {
    const out: string[] = [];
    if (value === null || value === undefined || !Array.isArray(value)) {
      return out;
    }
    const arr = value as Object[];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === null || arr[i] === undefined) {
        continue;
      }
      const s = `${arr[i]}`.trim();
      if (s.length > 0 && s !== 'undefined' && s !== 'null') {
        out.push(s);
      }
    }
    return out;
  }

  /**
   * 解析 LLM routeWaypoints：支持
   * - Point2D[][] / [{x,y},...] 分段
   * - 扁平 [{x,y},{x,y}] 单段
   * - 数字对 [[x,y],[x,y],...] 单段（DeepSeek 常见）
   */
  static parseRouteWaypoints(raw: Object | undefined | null): Point2D[][] {
    const out: Point2D[][] = [];
    if (raw === undefined || raw === null || !Array.isArray(raw)) {
      return out;
    }
    const arr = raw as Object[];
    if (arr.length === 0) {
      return out;
    }
    const first = arr[0];
    // 数字对扁平: [[300,360],[300,380],...] → 单段
    const isNumPairList = Array.isArray(first) && (first as Object[]).length >= 2 &&
      typeof (first as Object[])[0] === 'number';
    if (isNumPairList) {
      const seg = NetPlanExecutor.parseNumericPairSegment(arr);
      if (seg.length >= 1) {
        out.push(seg);
      }
      return out;
    }
    // 扁平对象点: [{x,y},{x,y}] → 单段
    const isFlatPoint = first !== null && typeof first === 'object' &&
      !Array.isArray(first) &&
      ((first as Record<string, Object>)['x'] !== undefined ||
        (first as Record<string, Object>)['X'] !== undefined);
    if (isFlatPoint) {
      const seg = NetPlanExecutor.parseWaypointSegment(arr);
      if (seg.length >= 1) {
        out.push(seg);
      }
      return out;
    }
    for (let i = 0; i < arr.length; i++) {
      const segRaw = arr[i];
      if (!Array.isArray(segRaw)) {
        continue;
      }
      const inner = segRaw as Object[];
      // 段内是数字对列表，或单点 [x,y]
      if (inner.length >= 2 && typeof inner[0] === 'number') {
        const pt = NetPlanExecutor.snapWaypointPoint(Number(inner[0]), Number(inner[1]));
        if (pt) {
          // 可能是整段被拆成多个 [x,y] — 由外层 isNumPairList 处理；
          // 若落在分段循环，则把每个 [x,y] 当作单点段的一部分需聚合：此处拼成单段
          // 实际上进入此分支表示外层是 [seg0, seg1]，seg0=[x,y] 数字对 → 跳过单点段
          continue;
        }
      }
      const seg = NetPlanExecutor.parseWaypointSegment(inner);
      if (seg.length >= 1) {
        out.push(seg);
      }
    }
    // 若分段循环因数字对 continue 全空，回退整表数字对
    if (out.length === 0) {
      const fallback = NetPlanExecutor.parseNumericPairSegment(arr);
      if (fallback.length >= 1) {
        out.push(fallback);
      }
    }
    return out;
  }

  private static snapWaypointPoint(x: number, y: number): Point2D | null {
    if (isNaN(x) || isNaN(y)) {
      return null;
    }
    const gx = Math.round(x / 20) * 20;
    const gy = Math.round(y / 20) * 20;
    if (gx < 0 || gy < 0 || gx > 2000 || gy > 1600) {
      return null;
    }
    return { x: gx, y: gy };
  }

  /** [[x,y],[x,y],...] → 单段路径 */
  private static parseNumericPairSegment(arr: Object[]): Point2D[] {
    const seg: Point2D[] = [];
    for (let i = 0; i < arr.length; i++) {
      const pair = arr[i];
      if (!Array.isArray(pair) || (pair as Object[]).length < 2) {
        continue;
      }
      const p = pair as Object[];
      const pt = NetPlanExecutor.snapWaypointPoint(Number(p[0]), Number(p[1]));
      if (pt) {
        seg.push(pt);
      }
    }
    return seg;
  }

  private static parseWaypointSegment(arr: Object[]): Point2D[] {
    const seg: Point2D[] = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      // 允许段内混入 [x,y] 数字对
      if (Array.isArray(p) && (p as Object[]).length >= 2 &&
        typeof (p as Object[])[0] === 'number') {
        const pt = NetPlanExecutor.snapWaypointPoint(
          Number((p as Object[])[0]), Number((p as Object[])[1]));
        if (pt) {
          seg.push(pt);
        }
        continue;
      }
      if (!p || typeof p !== 'object') {
        continue;
      }
      const r = p as Record<string, Object>;
      const pt = NetPlanExecutor.snapWaypointPoint(
        Number(r['x'] ?? r['X'] ?? NaN), Number(r['y'] ?? r['Y'] ?? NaN));
      if (pt) {
        seg.push(pt);
      }
    }
    return seg;
  }

  /**
   * 剥掉 LLM 仿写的 "pinId(pinName)" / "1(VCC)" / "CH1(CH1)"，得到库内 pinId。
   * TemplateSchematicKit.pinOffset 对非精确 "1" 会落到错误脚（R/C 全走 pin2）。
   */
  static sanitizePinToken(pinIdRaw: string, pinNameRaw: string): SanitizedPinToken {
    let pinId = (pinIdRaw ?? '').trim();
    let pinName = (pinNameRaw ?? '').trim();
    if (pinId.length === 0) {
      const early: SanitizedPinToken = {
        pinId: pinId,
        pinName: pinName.length > 0 ? pinName : pinId
      };
      return early;
    }
    // "1(VCC)" / "2(2)" / "CH1(CH1)"
    const m = /^([A-Za-z0-9_+-]+)\s*\(([^)]*)\)\s*$/.exec(pinId);
    if (m) {
      const idPart = m[1].trim();
      const namePart = (m[2] ?? '').trim();
      pinId = idPart;
      if (namePart.length > 0 && (pinName.length === 0 || pinName === pinIdRaw || pinName === idPart)) {
        pinName = namePart;
      }
    }
    // 残留 "pin 1" / "Pin:CH1"
    const m2 = /^(?:pin|脚)\s*[:#]?\s*([A-Za-z0-9_+-]+)$/i.exec(pinId);
    if (m2) {
      pinId = m2[1].trim();
    }
    if (pinName.length === 0) {
      pinName = pinId;
    }
    const out: SanitizedPinToken = { pinId: pinId, pinName: pinName };
    return out;
  }

  /** 对 plan 内全部连接再跑一轮 pin token 清洗（critique 前兜底） */
  static sanitizePinIdsInPlan(plan: NetPlanResult): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let fixes = 0;
    const samples: string[] = [];
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const before = c.pinId;
        const cleaned = NetPlanExecutor.sanitizePinToken(c.pinId, c.pinName);
        if (cleaned.pinId !== before || cleaned.pinName !== c.pinName) {
          c.pinId = cleaned.pinId;
          c.pinName = cleaned.pinName;
          fixes++;
          if (samples.length < 10) {
            samples.push(
              `${plan.nets[ni].name}:${c.compRef} "${before}"→"${cleaned.pinId}"`);
          }
        }
      }
    }
    if (fixes > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan sanitizePinIds fixes=${fixes}`);
      traceAiDiag('AI_PIPE', 'net_plan_pin_sanitize2', samples, 10);
    }
    return fixes;
  }

  /**
   * 按器件库类型把别名/DIP 数字脚规范到库 pinId（555/双运放/三端稳压）。
   * 须在 validatePinsAgainstLibrary 之前调用。
   */
  static canonicalizeLibPinsInPlan(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    const libOf = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      const d = topo.deviceList.find(x => (x.refName ?? '').toUpperCase() === want);
      return d ? (d.libDevId ?? '') : '';
    };
    let fixes = 0;
    const samples: string[] = [];
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const lib = (libOf(c.compRef ?? '') ?? '').toUpperCase();
        if (lib.length === 0) {
          continue;
        }
        const before = c.pinId;
        let canon = '';
        if (lib === 'LM555' || lib === 'NE555' || lib.indexOf('555') >= 0) {
          canon = TemplateSchematicKit.canonicalize555Pin(c.pinId, c.pinName);
        } else if (lib === 'LM358' || lib === 'TL082' || lib === 'LM324') {
          canon = TemplateSchematicKit.canonicalizeDualOpAmpPin(c.pinId, c.pinName);
        } else if (lib === 'LM7805' || lib === 'LM7812' || lib === 'AMS1117_3V3' ||
          lib.indexOf('AMS1117') >= 0 || lib.indexOf('7805') >= 0 || lib.indexOf('7812') >= 0) {
          canon = TemplateSchematicKit.canonicalizeRegulatorPin(c.pinId, c.pinName);
        }
        if (canon.length > 0 && canon !== before) {
          c.pinId = canon;
          c.pinName = canon;
          fixes++;
          if (samples.length < 10) {
            samples.push(`${c.compRef}:${before}→${canon}(${lib})`);
          }
        }
      }
    }
    if (fixes > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan canonicalizeLibPins fixes=${fixes}`);
      traceAiDiag('AI_PIPE', 'net_plan_pin_canonicalize', samples, 10);
    }
    return fixes;
  }

  /**
   * 仪器测量脚误挂 VCC/GND 时：从电源网剥离并并入最大的非电源信号网（或新建 SIG 网）。
   * 避免 critique HARD 反复拒收后 LLM 改用 deviceRef 等破坏性变体。
   */
  static stripInstrumentSenseFromPowerNets(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    const isInstrLib = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('LOGIC_ANALYZER') >= 0 ||
        u.indexOf('UART') >= 0 || u.indexOf('FREQ') >= 0 || u.indexOf('POWER_METER') >= 0;
    };
    const libOf = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      const d = topo.deviceList.find(x => (x.refName ?? '').toUpperCase() === want);
      return d ? (d.libDevId ?? '') : '';
    };
    const isSensePin = (pin: string): boolean => {
      const u = (pin ?? '').toUpperCase();
      return /^CH\d+$/.test(u) || u === 'V+' || u === 'V' || u === 'IN' ||
        u === 'I+' || u === 'I-' || u === 'PROBE';
    };
    const isPowerNetName = (name: string): boolean => {
      const u = (name ?? '').toUpperCase();
      return u === 'VCC' || u === 'VDD' || u === '+5V' || u === 'GND' || u === 'VSS' ||
        u === 'VEE' || u === '0V';
    };
    let fixes = 0;
    const moved: NetPlanConnection[] = [];
    const moveSamples: string[] = [];
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      if (!isPowerNetName(net.name ?? '')) {
        continue;
      }
      const kept: NetPlanConnection[] = [];
      const conns = net.connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const pin = (c.pinName ?? c.pinId ?? '').toUpperCase();
        if (isSensePin(pin) && isInstrLib(libOf(c.compRef ?? ''))) {
          // 电源网保留 GND 脚；测量脚剥离
          if (pin === 'GND' || pin === 'COM') {
            kept.push(c);
            continue;
          }
          // 闲置示波通道 CH2+：直接丢弃，禁止并入其它信号网（否则污染 VREF 等）
          const chM = pin.match(/^CH(\d+)$/);
          if (chM !== null && parseInt(chM[1], 10) >= 2) {
            fixes++;
            if (moveSamples.length < 10) {
              moveSamples.push(`${c.compRef}.${pin} drop off ${net.name}`);
            }
            continue;
          }
          c.mode = 'joinByLabel';
          moved.push(c);
          fixes++;
          if (moveSamples.length < 10) {
            moveSamples.push(`${c.compRef}.${pin} off ${net.name}`);
          }
        } else {
          kept.push(c);
        }
      }
      net.connections = kept;
    }
    if (moved.length === 0) {
      if (fixes > 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan heal: drop unused OSC CH2+ off power ×${fixes}`);
        traceAiDiag('AI_PIPE', 'net_plan_instr_off_power', moveSamples, 10);
      }
      return fixes;
    }
    // 并入最大非电源网；没有则新建
    let bestIdx = -1;
    let bestLen = -1;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const n = plan.nets[ni];
      if (isPowerNetName(n.name ?? '')) {
        continue;
      }
      const len = (n.connections ?? []).length;
      if (len > bestLen) {
        bestLen = len;
        bestIdx = ni;
      }
    }
    const pinKey = (c: NetPlanConnection): string =>
      `${c.compRef ?? ''}:${c.pinId ?? ''}`.toUpperCase();
    if (bestIdx < 0) {
      const fresh: NetPlanEntry = {
        name: 'SIG_NODE',
        type: 'signal',
        connections: moved.slice()
      };
      plan.nets.push(fresh);
      fixes += moved.length;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan heal: strip instr sense off power → new SIG_NODE ×${moved.length}`);
      traceAiDiag('AI_PIPE', 'net_plan_instr_off_power', moveSamples, 10);
      return fixes;
    }
    const target = plan.nets[bestIdx];
    const existing = new Set((target.connections ?? []).map(pinKey));
    for (let i = 0; i < moved.length; i++) {
      const k = pinKey(moved[i]);
      if (existing.has(k)) {
        continue;
      }
      target.connections.push(moved[i]);
      existing.add(k);
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] net_plan heal: strip instr sense off power → ${target.name} ×${moved.length}`);
    traceAiDiag('AI_PIPE', 'net_plan_instr_off_power', moveSamples, 10);
    return fixes;
  }

  /**
   * 自激滞回+积分：补全比较器 IN-→三角网、积分器 IN+→GND；丢弃残余 joinWired 单脚网。
   * 避免 LLM 为 COMP_INV/INT_NON_INV 建「只有 1 连接」网导致 exec fatal ABORT。
   */
  static healOpAmpFloatingInputsInPlan(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let fixes = 0;
    const isOpAmpLib = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u === 'UA741' || u.indexOf('LM358') >= 0 || u.indexOf('TL08') >= 0 ||
        u.indexOf('LM324') >= 0;
    };
    const libOfRef = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      if (want.length === 0) {
        return '';
      }
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if ((d.refName ?? '').toUpperCase() === want) {
          return (d.libDevId ?? '').toUpperCase();
        }
      }
      return '';
    };
    const isResRef = (ref: string): boolean => {
      const r = (ref ?? '').toUpperCase();
      if (/^R\d/.test(r)) {
        return true;
      }
      const lib = libOfRef(ref);
      return lib.indexOf('R_') === 0 || lib.indexOf('RES') >= 0 || lib === 'R';
    };
    const isCapRef = (ref: string): boolean => {
      const r = (ref ?? '').toUpperCase();
      if (/^C\d/.test(r)) {
        return true;
      }
      const lib = libOfRef(ref);
      return lib.indexOf('C_') === 0 || lib.indexOf('CAP') >= 0 || lib === 'C';
    };
    const normPin = (p: string): string => (p ?? '').toUpperCase().replace(/\s/g, '');
    const isInnPin = (p: string): boolean => {
      const u = normPin(p);
      return u === 'IN-' || u === 'IN-1' || u === 'IN-2';
    };
    const isInpPin = (p: string): boolean => {
      const u = normPin(p);
      return u === 'IN+' || u === 'IN+1' || u === 'IN+2';
    };
    const isOutPin = (p: string): boolean => {
      const u = normPin(p);
      return u === 'OUT' || u === 'OUT1' || u === 'OUT2';
    };

    let gndRef = '';
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const lib = (d.libDevId ?? '').toUpperCase();
      const ref = d.refName ?? '';
      if (lib === 'GND' || ref.toUpperCase() === 'GND') {
        gndRef = ref;
        break;
      }
    }

    const findTriangleNetIdx = (): number => {
      for (let ni = 0; ni < plan.nets.length; ni++) {
        const name = (plan.nets[ni].name ?? '').toUpperCase();
        if ((name.indexOf('TRIANGLE') >= 0 || name.indexOf('TRI_') >= 0 ||
          name.indexOf('RAMP') >= 0) &&
          (plan.nets[ni].connections?.length ?? 0) >= 2) {
          return ni;
        }
      }
      for (let ni = 0; ni < plan.nets.length; ni++) {
        const conns = plan.nets[ni].connections ?? [];
        if (conns.length < 2) {
          continue;
        }
        let hasOpOut = false;
        let hasCap = false;
        for (let ci = 0; ci < conns.length; ci++) {
          const c = conns[ci];
          if (isOpAmpLib(libOfRef(c.compRef)) && isOutPin(c.pinId)) {
            hasOpOut = true;
          }
          if (isCapRef(c.compRef)) {
            hasCap = true;
          }
        }
        if (hasOpOut && hasCap) {
          return ni;
        }
      }
      return -1;
    };

    const findGndNetIdx = (): number => {
      for (let ni = 0; ni < plan.nets.length; ni++) {
        const n = plan.nets[ni];
        if ((n.type ?? '') === 'ground') {
          return ni;
        }
        const name = (n.name ?? '').toUpperCase();
        if (name === 'GND' || name.indexOf('GND') === 0) {
          return ni;
        }
      }
      return -1;
    };

    const netSize = (ni: number): number => plan.nets[ni]?.connections?.length ?? 0;

    const pinNetIndices = (ref: string, pin: string): number[] => {
      const wantRef = ref.toUpperCase();
      const wantPin = normPin(pin);
      const out: number[] = [];
      for (let ni = 0; ni < plan.nets.length; ni++) {
        const conns = plan.nets[ni].connections ?? [];
        for (let ci = 0; ci < conns.length; ci++) {
          if ((conns[ci].compRef ?? '').toUpperCase() === wantRef &&
            normPin(conns[ci].pinId) === wantPin) {
            out.push(ni);
            break;
          }
        }
      }
      return out;
    };

    const removeSingletonPinNets = (ref: string, pinPred: (p: string) => boolean,
      keepNi: number): number => {
      let removed = 0;
      for (let ni = plan.nets.length - 1; ni >= 0; ni--) {
        if (ni === keepNi) {
          continue;
        }
        const conns = plan.nets[ni].connections ?? [];
        if (conns.length === 1 &&
          (conns[0].compRef ?? '').toUpperCase() === ref.toUpperCase() &&
          pinPred(conns[0].pinId)) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] heal_opamp drop_singleton net=${plan.nets[ni].name}` +
            ` ${ref}.${conns[0].pinId}`);
          plan.nets.splice(ni, 1);
          removed++;
        }
      }
      return removed;
    };

    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      const lib = (d.libDevId ?? '').toUpperCase();
      if (!isOpAmpLib(lib)) {
        continue;
      }
      const ref = d.refName ?? '';
      if (ref.length === 0) {
        continue;
      }
      const channels: string[] = lib === 'UA741' ? [''] : ['1', '2', ''];
      for (let chi = 0; chi < channels.length; chi++) {
        const suf = channels[chi];
        const innPin = suf.length > 0 ? `IN-${suf}` : 'IN-';
        const inpPin = suf.length > 0 ? `IN+${suf}` : 'IN+';

        const innIdxs = pinNetIndices(ref, innPin);
        const inpIdxs = pinNetIndices(ref, inpPin);

        // 积分器判定须见电容（跨 OUT↔IN-）；仅有电阻可能是滞回/反馈，禁止误判
        const innIsIntegrator = innIdxs.some(ni => {
          if (netSize(ni) < 2) {
            return false;
          }
          const conns = plan.nets[ni].connections;
          return conns.some(c => isCapRef(c.compRef));
        });
        const inpIsHyst = inpIdxs.some(ni => {
          if (netSize(ni) < 2) {
            return false;
          }
          const conns = plan.nets[ni].connections;
          return conns.some(c => isResRef(c.compRef));
        });

        // 积分器：IN+ 须进 GND（禁止 INT_NON_INV 单脚网）
        // 【硬】同通道若 IN+ 已挂电阻（滞回比较器），绝不可拉 GND 拆掉 HYST_REF
        if (innIsIntegrator && gndRef.length > 0 && !inpIsHyst) {
          const needsGnd = inpIdxs.length === 0 || inpIdxs.every(ni => netSize(ni) < 2);
          if (needsGnd) {
            let gndNi = findGndNetIdx();
            if (gndNi < 0) {
              const gndConn: NetPlanConnection = {
                compRef: gndRef,
                pinId: 'GND',
                pinName: 'GND',
                mode: 'joinByLabel'
              };
              const gndEntry: NetPlanEntry = {
                name: 'GND',
                type: 'ground',
                connections: [gndConn]
              };
              plan.nets.push(gndEntry);
              gndNi = plan.nets.length - 1;
              fixes++;
            }
            const gndConns = plan.nets[gndNi].connections;
            const already = gndConns.some(c =>
              (c.compRef ?? '').toUpperCase() === ref.toUpperCase() &&
              normPin(c.pinId) === normPin(inpPin));
            if (!already) {
              const add: NetPlanConnection = {
                compRef: ref,
                pinId: inpPin,
                pinName: inpPin,
                mode: 'joinByLabel'
              };
              gndConns.push(add);
              fixes++;
              Logger.info(INSTR_TRACE_TAG,
                `[AI_PIPE] heal_opamp ${ref}.${inpPin}→GND (integrator non-inv)`);
            }
            fixes += removeSingletonPinNets(ref, isInpPin, gndNi);
          }
        }

        // 滞回比较器：IN- 须并入三角波网（禁止 COMP_INV 单脚网）
        if (inpIsHyst) {
          const innSingleton = innIdxs.length === 0 || innIdxs.every(ni => netSize(ni) < 2);
          if (innSingleton) {
            const triNi = findTriangleNetIdx();
            if (triNi >= 0) {
              const triConns = plan.nets[triNi].connections;
              const already = triConns.some(c =>
                (c.compRef ?? '').toUpperCase() === ref.toUpperCase() && isInnPin(c.pinId));
              if (!already) {
                let pinId = innPin;
                let pinName = innPin;
                for (let ii = 0; ii < innIdxs.length; ii++) {
                  const c0 = plan.nets[innIdxs[ii]].connections[0];
                  if (c0) {
                    pinId = c0.pinId;
                    pinName = (c0.pinName ?? '').length > 0 ? c0.pinName : c0.pinId;
                  }
                }
                const add: NetPlanConnection = {
                  compRef: ref,
                  pinId,
                  pinName,
                  mode: 'joinByLabel'
                };
                triConns.push(add);
                fixes++;
                Logger.info(INSTR_TRACE_TAG,
                  `[AI_PIPE] heal_opamp ${ref}.${pinId}→${plan.nets[triNi].name}` +
                  ` (comparator inv←triangle)`);
              }
              fixes += removeSingletonPinNets(ref, isInnPin, triNi);
            }
          }
        }
      }
    }

    fixes += NetPlanExecutor.healIntegratorFeedbackCapInPlan(plan, topo);
    fixes += NetPlanExecutor.dropOrphanSingletonNets(plan);
    return fixes;
  }

  /**
   * 积分器反馈电容：C 必须跨 OUT↔IN-（两网），禁止落成 INT_FB 单脚孤儿后被 drop。
   * sanitize 去重后常见：INT_FB 只剩 C.1 → 此处把 C 两端分别挂到积分 OUT / IN- 网。
   */
  static healIntegratorFeedbackCapInPlan(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let fixes = 0;
    const isOpAmpLib = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u === 'UA741' || u.indexOf('LM358') >= 0 || u.indexOf('TL08') >= 0 ||
        u.indexOf('LM324') >= 0;
    };
    const libOfRef = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if ((d.refName ?? '').toUpperCase() === want) {
          return (d.libDevId ?? '').toUpperCase();
        }
      }
      return '';
    };
    const isCapRef = (ref: string): boolean => {
      const r = (ref ?? '').toUpperCase();
      if (/^C\d/.test(r)) {
        return true;
      }
      const lib = libOfRef(ref);
      return lib.indexOf('C_') === 0 || lib.indexOf('CAP') >= 0 || lib === 'C';
    };
    const isResRef = (ref: string): boolean => {
      const r = (ref ?? '').toUpperCase();
      if (/^R\d/.test(r)) {
        return true;
      }
      const lib = libOfRef(ref);
      return lib.indexOf('R_') === 0 || lib.indexOf('RES') >= 0 || lib === 'R';
    };
    const normPin = (p: string): string => (p ?? '').toUpperCase().replace(/\s/g, '');
    const isInnPin = (p: string): boolean => {
      const u = normPin(p);
      return u === 'IN-' || u === 'IN-1' || u === 'IN-2';
    };
    const isOutPin = (p: string): boolean => {
      const u = normPin(p);
      return u === 'OUT' || u === 'OUT1' || u === 'OUT2';
    };

    const pinNetIdx = (ref: string, pinPred: (p: string) => boolean): number => {
      const want = ref.toUpperCase();
      for (let ni = 0; ni < plan.nets.length; ni++) {
        const conns = plan.nets[ni].connections ?? [];
        for (let ci = 0; ci < conns.length; ci++) {
          if ((conns[ci].compRef ?? '').toUpperCase() === want &&
            pinPred(conns[ci].pinId)) {
            return ni;
          }
        }
      }
      return -1;
    };

    const capPinNets = (ref: string): number[] => {
      const want = ref.toUpperCase();
      const out: number[] = [];
      for (let ni = 0; ni < plan.nets.length; ni++) {
        const conns = plan.nets[ni].connections ?? [];
        for (let ci = 0; ci < conns.length; ci++) {
          if ((conns[ci].compRef ?? '').toUpperCase() === want) {
            out.push(ni);
            break;
          }
        }
      }
      return out;
    };

    const removeCapFromNet = (ni: number, ref: string): void => {
      const want = ref.toUpperCase();
      const conns = plan.nets[ni].connections ?? [];
      plan.nets[ni].connections = conns.filter(c =>
        (c.compRef ?? '').toUpperCase() !== want);
    };

    /** 电容是否已跨接某运放 OUT↔IN-（禁止被另一片偷走） */
    const capBridgesAnyOpampFb = (cref: string): boolean => {
      const nets = capPinNets(cref);
      if (nets.length < 2) {
        return false;
      }
      for (let di = 0; di < topo.deviceList.length; di++) {
        const d = topo.deviceList[di];
        if (!isOpAmpLib(d.libDevId ?? '')) {
          continue;
        }
        const ref = d.refName ?? '';
        if (ref.length === 0) {
          continue;
        }
        const outNi = pinNetIdx(ref, isOutPin);
        const innNi = pinNetIdx(ref, isInnPin);
        if (outNi >= 0 && innNi >= 0 && outNi !== innNi &&
          nets.indexOf(outNi) >= 0 && nets.indexOf(innNi) >= 0) {
          return true;
        }
      }
      return false;
    };

    const isSquareOutNet = (name: string): boolean => {
      const u = (name ?? '').toUpperCase();
      return u.indexOf('SQUARE') >= 0 || u.indexOf('SQ_OUT') >= 0 ||
        u.indexOf('HYST_OUT') >= 0 || u.indexOf('COMP_OUT') >= 0;
    };
    const isTriangleOutNet = (name: string): boolean => {
      const u = (name ?? '').toUpperCase();
      return u.indexOf('TRIANGLE') >= 0 || u.indexOf('TRI_OUT') >= 0 ||
        u.indexOf('INTEG_OUT') >= 0 || u.indexOf('INT_OUT') >= 0 || u === 'TRI';
    };

    // 两遍：优先三角波 OUT（真积分器），再其它非方波；成功一次即停，防比较器偷电容
    const passes: boolean[] = [true, false];
    for (let pass = 0; pass < passes.length; pass++) {
      const onlyTriangle = passes[pass];
      for (let di = 0; di < topo.deviceList.length; di++) {
        const d = topo.deviceList[di];
        if (!isOpAmpLib(d.libDevId ?? '')) {
          continue;
        }
        const ref = d.refName ?? '';
        if (ref.length === 0) {
          continue;
        }
        const channels: string[] = (d.libDevId ?? '').toUpperCase() === 'UA741' ?
          [''] : ['1', '2', ''];
        for (let chi = 0; chi < channels.length; chi++) {
          const suf = channels[chi];
          const outPin = suf.length > 0 ? `OUT${suf}` : 'OUT';
          const innPin = suf.length > 0 ? `IN-${suf}` : 'IN-';
          const outNi = pinNetIdx(ref, p => normPin(p) === normPin(outPin) || isOutPin(p));
          const innNi = pinNetIdx(ref, p => normPin(p) === normPin(innPin) || isInnPin(p));
          if (outNi < 0 || innNi < 0 || outNi === innNi) {
            continue;
          }
          const outName = plan.nets[outNi].name ?? '';
          // 比较器方波 OUT 绝不当积分反馈跨接目标
          if (isSquareOutNet(outName)) {
            continue;
          }
          if (onlyTriangle && !isTriangleOutNet(outName)) {
            continue;
          }
          // 积分特征：IN- 网含电阻（输入 R）
          const innHasR = (plan.nets[innNi].connections ?? []).some(c => isResRef(c.compRef));
          if (!innHasR) {
            continue;
          }
          // 是否已有 C 同时出现在 OUT 与 IN- 两网
          let bridged = false;
          for (let ci = 0; ci < topo.deviceList.length; ci++) {
            const cdev = topo.deviceList[ci];
            if (!isCapRef(cdev.refName ?? '') && !(cdev.libDevId ?? '').startsWith('C_')) {
              continue;
            }
            const cref = cdev.refName ?? '';
            const nets = capPinNets(cref);
            if (nets.indexOf(outNi) >= 0 && nets.indexOf(innNi) >= 0) {
              bridged = true;
              break;
            }
          }
          if (bridged) {
            continue;
          }
          // 找可重挂的电容：优先 INT_FB 孤儿；禁止偷已跨接其它运放的反馈 C
          let capRef = '';
          for (let ni = 0; ni < plan.nets.length; ni++) {
            const name = (plan.nets[ni].name ?? '').toUpperCase();
            const conns = plan.nets[ni].connections ?? [];
            if (name.indexOf('INT_FB') >= 0 || name.indexOf('INTEG_FB') >= 0 ||
              name.indexOf('FB_C') >= 0) {
              for (let ci = 0; ci < conns.length; ci++) {
                if (isCapRef(conns[ci].compRef)) {
                  capRef = conns[ci].compRef;
                  break;
                }
              }
            }
            if (capRef.length > 0) {
              break;
            }
          }
          if (capRef.length === 0) {
            for (let ci = 0; ci < topo.deviceList.length; ci++) {
              const cdev = topo.deviceList[ci];
              if (!(cdev.libDevId ?? '').startsWith('C_')) {
                continue;
              }
              const cref = cdev.refName ?? '';
              const nets = capPinNets(cref);
              // 未跨本通道 OUT↔IN-；且未已是其它运放反馈 C
              if (nets.indexOf(outNi) < 0 || nets.indexOf(innNi) < 0) {
                if (capBridgesAnyOpampFb(cref)) {
                  continue;
                }
                // 跳过电源去耦（一端电源一端地）
                let onPower = false;
                for (let nxi = 0; nxi < nets.length; nxi++) {
                  const nn = (plan.nets[nets[nxi]].name ?? '').toUpperCase();
                  if (nn === 'VCC' || nn === 'VEE' || nn === 'GND' || nn === 'VDD') {
                    onPower = true;
                    break;
                  }
                }
                if (onPower && nets.length >= 2) {
                  continue;
                }
                capRef = cref;
                break;
              }
            }
          }
          if (capRef.length === 0) {
            continue;
          }
          // 从旧网摘掉该 C 的所有连接
          for (let ni = plan.nets.length - 1; ni >= 0; ni--) {
            removeCapFromNet(ni, capRef);
          }
          const addOut: NetPlanConnection = {
            compRef: capRef,
            pinId: '1',
            pinName: '1',
            mode: 'joinWired'
          };
          const addInn: NetPlanConnection = {
            compRef: capRef,
            pinId: '2',
            pinName: '2',
            mode: 'joinWired'
          };
          plan.nets[outNi].connections.push(addOut);
          plan.nets[innNi].connections.push(addInn);
          fixes++;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] heal_opamp_cap ${capRef}: ${plan.nets[outNi].name}` +
            `↔${plan.nets[innNi].name} (integrator feedback)`);
          return fixes;
        }
      }
    }
    return fixes;
  }

  /**
   * 丢弃无法执行的 joinWired 单脚网（保留单脚 joinByLabel 边界 stub）。
   * 不计 failure，避免「只有1连接」误判 fatal ABORT。
   */
  static dropOrphanSingletonNets(plan: NetPlanResult): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let dropped = 0;
    for (let i = plan.nets.length - 1; i >= 0; i--) {
      const conns = plan.nets[i].connections ?? [];
      if (conns.length >= 2) {
        continue;
      }
      if (conns.length === 1 && conns.every(c => c.mode === 'joinByLabel')) {
        continue; // 模块边界单脚标号
      }
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] drop_orphan_singleton net=${plan.nets[i].name}` +
        ` conns=${conns.length}`);
      plan.nets.splice(i, 1);
      dropped++;
    }
    return dropped;
  }

  /**
   * 确定性修复：合并探针/仪器重复脚、消除一脚双网。
   * 返回修复条数；调用方应在 critique 前执行。
   */
  static sanitizeDuplicatePins(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let fixes = 0;
    fixes += NetPlanExecutor.sanitizePinIdsInPlan(plan);
    fixes += NetPlanExecutor.canonicalizeLibPinsInPlan(plan, topo);
    fixes += NetPlanExecutor.stripInstrumentSenseFromPowerNets(plan, topo);
    fixes += NetPlanExecutor.sanitizeUnknownDeviceRefs(plan, topo);
    fixes += NetPlanExecutor.stripUnusedOscChannels(plan);
    const isInstrLib = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('LOGIC_ANALYZER') >= 0 ||
        u.indexOf('UART') >= 0 || u.indexOf('FREQ') >= 0;
    };
    const libOf = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      if (want.length === 0) {
        return '';
      }
      const d = topo.deviceList.find(x =>
        (x.refName ?? '').toUpperCase() === want);
      return d ? (d.libDevId ?? '') : '';
    };
    const isInstrRef = (ref: string): boolean => isInstrLib(libOf(ref));
    const isProbeNetName = (name: string): boolean => {
      const u = (name ?? '').toUpperCase();
      return u.indexOf('PROBE') === 0 || u.indexOf('OSC_') === 0 ||
        u.indexOf('OSCCH') === 0 || /^CH\d+$/.test(u) ||
        u.indexOf('SENSE_PROBE') >= 0;
    };
    const pinKey = (c: NetPlanConnection): string =>
      `${c.compRef ?? ''}:${c.pinId ?? ''}`.toUpperCase();

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

    // Pass3: 删空网，再补运放自激脚并丢掉残余 joinWired 单脚网
    plan.nets = plan.nets.filter(n => (n.connections ?? []).length > 0);
    fixes += NetPlanExecutor.healOpAmpFloatingInputsInPlan(plan, topo);
    return fixes;
  }

  /**
   * 未用示波器通道 CH2+：从 plan 删除，避免建单脚网 → PIN_CONNECTIVITY。
   * CH1 / GND 保留。
   */
  /**
   * 仅从电源/地网剥掉 CH2+（LLM 常把闲置通道挂 GND）。
   * 信号网上的 CH2/CH3… 是合法观测脚，禁止一律删除。
   */
  static stripUnusedOscChannels(plan: NetPlanResult): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    let fixes = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const netType = (net.type ?? '').toLowerCase();
      const netName = (net.name ?? '').toUpperCase();
      const isPowerish = netType === 'power' || netType === 'ground' ||
        netName === 'GND' || netName === 'VCC' || netName === 'VEE' ||
        netName === 'VDD' || netName === 'VSS' || netName === '0';
      if (!isPowerish) {
        continue;
      }
      const conns = net.connections ?? [];
      const kept: NetPlanConnection[] = [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const pin = (c.pinName ?? c.pinId ?? '').toUpperCase();
        const m = pin.match(/^CH(\d+)$/);
        if (m && parseInt(m[1], 10) >= 2) {
          fixes++;
          continue;
        }
        kept.push(c);
      }
      net.connections = kept;
    }
    if (fixes > 0) {
      plan.nets = plan.nets.filter(n => (n.connections ?? []).length > 0);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] stripUnusedOscChannels removed=${fixes} (power/GND only)`);
    }
    return fixes;
  }

  /**
   * 丢弃拓扑中不存在的器件引用（并行模块串扰 / LLM 幻觉 U1 等），
   * 避免 LED 模块接受 555 网表。
   */
  static sanitizeUnknownDeviceRefs(plan: NetPlanResult, topo: SchTopology): number {
    if (!plan.nets || plan.nets.length === 0) {
      return 0;
    }
    const known = new Set<string>();
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      known.add((d.refName ?? '').toUpperCase());
      known.add((d.libDevId ?? '').toUpperCase());
    }
    let fixes = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const conns = net.connections ?? [];
      const kept: NetPlanConnection[] = [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const ref = (c.compRef ?? '').toUpperCase();
        if (ref.length > 0 && known.has(ref)) {
          kept.push(c);
        } else {
          fixes++;
        }
      }
      net.connections = kept;
    }
    const before = plan.nets.length;
    plan.nets = plan.nets.filter(n => (n.connections ?? []).length >= 1);
    fixes += before - plan.nets.length;
    return fixes;
  }

  /**
   * 对照器件库校验 plan 中每个 pinId 是否合法。
   * 返回 HARD 问题列表（空=通过）。无脚信息的库条目不误杀。
   */
  static validatePinsAgainstLibrary(plan: NetPlanResult, topo: SchTopology,
    library: IComponentLibrary): string[] {
    const hard: string[] = [];
    if (!plan.nets || plan.nets.length === 0) {
      return hard;
    }
    const libOf = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      const d = topo.deviceList.find(x => (x.refName ?? '').toUpperCase() === want);
      return d ? (d.libDevId ?? '') : '';
    };
    const pinIdsOf = (libId: string): string[] => {
      const ids: string[] = [];
      if (!libId || libId.length === 0) {
        return ids;
      }
      try {
        const comp = library.getComponent(libId);
        if (comp.success && comp.data && comp.data.pins) {
          for (let i = 0; i < comp.data.pins.length; i++) {
            const p = comp.data.pins[i];
            const pid = `${p.id ?? ''}`.toUpperCase();
            const pname = `${p.name ?? ''}`.toUpperCase();
            if (pid.length > 0 && ids.indexOf(pid) < 0) {
              ids.push(pid);
            }
            if (pname.length > 0 && ids.indexOf(pname) < 0) {
              ids.push(pname);
            }
          }
        }
        const meta = library.getDeviceMeta(libId);
        if (meta.success && meta.data && meta.data.pin_list) {
          for (let i = 0; i < meta.data.pin_list.length; i++) {
            const mp = meta.data.pin_list[i];
            const pid = `${mp.pin_id ?? ''}`.toUpperCase();
            const pl = `${mp.pin_label ?? ''}`.toUpperCase();
            if (pid.length > 0 && ids.indexOf(pid) < 0) {
              ids.push(pid);
            }
            if (pl.length > 0 && ids.indexOf(pl) < 0) {
              ids.push(pl);
            }
          }
        }
      } catch (_e) {
        // ignore
      }
      return ids;
    };
    const seen = new Set<string>();
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const ref = c.compRef ?? '';
        const pin = (c.pinId ?? '').toUpperCase().trim();
        if (ref.length === 0 || pin.length === 0) {
          continue;
        }
        const key = `${ref}:${pin}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const libId = libOf(ref);
        if (libId.length === 0) {
          continue; // unknown ref 由 sanitizeUnknownDeviceRefs 处理
        }
        const allowed = pinIdsOf(libId);
        if (allowed.length === 0) {
          continue;
        }
        if (allowed.indexOf(pin) < 0) {
          hard.push(
            `引脚 ${ref}.${c.pinId} 不在库器件 ${libId} 合法脚列表` +
            `[${allowed.slice(0, 8).join(',')}] — 请用库脚名(如 CH1/GND/1/2)`);
        }
      }
    }
    return hard;
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
    const planNets = plan.nets?.length ?? 0;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] net_plan_exec BEGIN planNets=${planNets}` +
      ` devices=${topo.deviceList.length}` +
      ` forceLabel=${plan.wiringHints?.forceLabel?.length ?? 0}` +
      ` forceWire=${plan.wiringHints?.forceWire?.length ?? 0}`);

    // 执行前再清洗 pinId / 库别名 / 仪器误挂电源 / 未用 CH / 运放自激单脚网
    NetPlanExecutor.sanitizePinIdsInPlan(plan);
    NetPlanExecutor.canonicalizeLibPinsInPlan(plan, topo);
    NetPlanExecutor.stripInstrumentSenseFromPowerNets(plan, topo);
    NetPlanExecutor.stripUnusedOscChannels(plan);
    NetPlanExecutor.healOpAmpFloatingInputsInPlan(plan, topo);

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

    // 标号优先 → 按脚预算升级导线（可与 Orchestrator 预调用 prepareModes 幂等）
    NetPlanExecutor.prepareModes(plan);

    // 逐网创建
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const netPlan = plan.nets[ni];

      // 至少 2 脚；或单脚且 joinByLabel（模块边界 stub，合并阶段靠同名标号并网）
      const allLabel = netPlan.connections.length >= 1 &&
        netPlan.connections.every(c => c.mode === 'joinByLabel');
      if (netPlan.connections.length < 2 && !allLabel) {
        // 不记 failure：sanitize 应已 drop/heal；残余单脚网跳过即可，避免误 abort
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan skip singleton net=${netPlan.name}` +
          ` conns=${netPlan.connections.length}`);
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

      if (nodeList.length < 1) {
        failures.push(`网络 "${netPlan.name}" 解析后无有效连接`);
        continue;
      }
      if (nodeList.length < 2 && labelPins.length < 1) {
        failures.push(`网络 "${netPlan.name}" 解析后不足2个连接`);
        continue;
      }

      // 安全检查: 电流表 I+/I- 绝不允许同网（任意网名，含 SENSE/负载）
      {
        let hasIPlus = false;
        let hasIMinus = false;
        for (const conn of netPlan.connections) {
          const pn = (conn.pinName ?? conn.pinId ?? '').toUpperCase();
          if (pn === 'I+' || pn === 'I_PLUS') {
            hasIPlus = true;
          }
          if (pn === 'I-' || pn === 'I_MINUS') {
            hasIMinus = true;
          }
        }
        // 同器件同网也拦（按 pin 名粗检；精细按 device 在下方 nodeList 再拦）
        if (hasIPlus && hasIMinus) {
          failures.push(`电流表 I+/I- 在同一网络 "${netPlan.name}" → 短路！拒绝执行`);
          continue;
        }
      }

      // 安全检查: VCC 符号脚与 GND 符号脚绝不可同网
      {
        let hasVccSym = false;
        let hasGndSym = false;
        for (let ni = 0; ni < nodeList.length; ni++) {
          const nd = nodeList[ni];
          const d = topo.deviceList.find(x => x.instUuid === nd.devUuid);
          const lib = (d?.libDevId ?? '').toUpperCase();
          if (lib === 'VCC' || lib === 'VDD') {
            hasVccSym = true;
          }
          if (lib === 'GND' || lib === 'VSS') {
            hasGndSym = true;
          }
        }
        if (hasVccSym && hasGndSym) {
          failures.push(`VCC 与 GND 符号同网 "${netPlan.name}" → 短路！拒绝执行`);
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
        // 沿最近边逃逸引出，避开异器件/导线/已有标号
        const labelPos = NetPlanExecutor.stubLabelOutside(topo, lp.dev, pinPos, text);

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
        const wid = IdUtil.generate('w');
        const routeLine = makeRouteLine(netInfo.netUuid, [pinPos, labelPos], false, wid);
        topo.wireList.push(routeLine);
        stubWireCount++;
        const pinTok = lp.pinName.length > 0 && lp.pinName !== lp.pinId
          ? `${lp.pinId}(${lp.pinName})` : lp.pinId;
        traceAiWireDraw('net_plan_stub',
          `net=${netPlan.name} pin=${lp.dev.refName}.${pinTok}` +
          ` wireId=${wid} label=${text}` +
          ` ends=(${Math.round(pinPos.x)},${Math.round(pinPos.y)})→` +
          `(${Math.round(labelPos.x)},${Math.round(labelPos.y)})`);
      }
    }

    // 生产路径：空网不注入假 VCC/GND；由编排器 ABORT
    if (topo.netList.length === 0 && topo.deviceList.length > 0) {
      failures.push('LLM netPlan 执行后无有效网络（已拒绝最小电源网静默回退）');
    }

    const notes = plan.topologyNotes.length > 0
      ? `LLM拓扑推理: ${plan.topologyNotes}`
      : `执行 ${netCount} 网/${labelCount} 标号/${stubWireCount} stub导线`;

    NetPlanExecutor.auditPinWorldCollisions(topo);

    const netNameOf = (uuid: string): string => {
      const n = topo.netList.find(x => x.netUuid === uuid);
      return n?.netName ?? uuid.substring(0, 10);
    };
    traceAiWireInventory('net_plan_end', topo.wireList, netNameOf, 48);

    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] net_plan_exec END nets=${netCount} labels=${labelCount}` +
      ` stubs=${stubWireCount} failures=${failures.length}` +
      ` wires=${topo.wireList.length}`);
    if (failures.length > 0) {
      traceAiDiag('AI_PIPE', 'net_plan_exec_fail', failures.slice(0, 16), 16);
    }

    return { topology: topo, netCount, labelCount, stubWireCount, notes, failures };
  }

  /**
   * 增量合并建网：按网脚指纹保留未变更网络的 net/label/wire，仅重建变更/新增网。
   * 绝不先清空全部网线。edit 路径专用；create 仍用 execute。
   */
  static executeMerge(topo: SchTopology, plan: NetPlanResult,
    removeNetNames?: string[]): NetPlanMergeResult {
    const failures: string[] = [];
    const changedNetNames: string[] = [];
    const preservedNetNames: string[] = [];

    NetPlanExecutor.sanitizePinIdsInPlan(plan);
    NetPlanExecutor.canonicalizeLibPinsInPlan(plan, topo);
    NetPlanExecutor.stripInstrumentSenseFromPowerNets(plan, topo);
    NetPlanExecutor.stripUnusedOscChannels(plan);
    NetPlanExecutor.prepareModes(plan);

    const existingFp = NetPlanExecutor.buildExistingNetFingerprints(topo);
    const planFp = NetPlanExecutor.buildPlanNetFingerprints(plan, topo);
    const removeSet = new Set<string>();
    if (removeNetNames) {
      for (let i = 0; i < removeNetNames.length; i++) {
        const n = (removeNetNames[i] ?? '').trim();
        if (n.length > 0) {
          removeSet.add(n);
        }
      }
    }

    const planNameSet = new Set<string>();
    for (let i = 0; i < plan.nets.length; i++) {
      planNameSet.add(plan.nets[i].name);
    }

    // 分类：保留 / 重建
    const preserveNames = new Set<string>();
    for (let i = 0; i < plan.nets.length; i++) {
      const name = plan.nets[i].name;
      if (removeSet.has(name)) {
        changedNetNames.push(name);
        continue;
      }
      const oldFp = existingFp.get(name) ?? '';
      const newFp = planFp.get(name) ?? '';
      if (oldFp.length > 0 && oldFp === newFp) {
        preserveNames.add(name);
        preservedNetNames.push(name);
      } else {
        changedNetNames.push(name);
      }
    }
    // 现有网不在目标计划中 → 删除（计入 changed）
    for (let i = 0; i < topo.netList.length; i++) {
      const name = topo.netList[i].netName;
      if (!planNameSet.has(name) || removeSet.has(name)) {
        if (changedNetNames.indexOf(name) < 0) {
          changedNetNames.push(name);
        }
      }
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] net_plan_merge BEGIN planNets=${plan.nets.length}` +
      ` preserve=${preservedNetNames.length} change=${changedNetNames.length}` +
      ` devices=${topo.deviceList.length}`);

    // 保留未变网的网/标号/导线
    const keepNetUuids = new Set<string>();
    const keepNets: NetInfo[] = [];
    for (let i = 0; i < topo.netList.length; i++) {
      const net = topo.netList[i];
      if (preserveNames.has(net.netName)) {
        keepNets.push(net);
        keepNetUuids.add(net.netUuid);
      }
    }
    const keepLabels: NetLabelInfo[] = [];
    for (let i = 0; i < topo.netLabelList.length; i++) {
      const lb = topo.netLabelList[i];
      if (keepNetUuids.has(lb.netUuid)) {
        keepLabels.push(lb);
      }
    }
    const keepWires: RouteLine[] = [];
    for (let i = 0; i < topo.wireList.length; i++) {
      const w = topo.wireList[i];
      if (keepNetUuids.has(w.netUuid)) {
        keepWires.push(w);
      }
    }
    topo.netList = keepNets;
    topo.netLabelList = keepLabels;
    topo.wireList = keepWires;

    // 仅对变更/新增网执行追加建网
    const rebuildNets: NetPlanEntry[] = [];
    for (let i = 0; i < plan.nets.length; i++) {
      if (!preserveNames.has(plan.nets[i].name)) {
        rebuildNets.push(plan.nets[i]);
      }
    }
    let netCount = keepNets.length;
    let labelCount = keepLabels.length;
    let stubWireCount = keepWires.length;
    if (rebuildNets.length > 0) {
      const rebuildPlan: NetPlanResult = {
        nets: rebuildNets,
        labels: plan.labels ?? [],
        wiringHints: plan.wiringHints,
        routeStrategy: plan.routeStrategy,
        topologyNotes: plan.topologyNotes
      };
      const append = NetPlanExecutor.executeAppend(topo, rebuildPlan);
      netCount = topo.netList.length;
      labelCount = topo.netLabelList.length;
      stubWireCount = append.stubWireCount;
      for (let fi = 0; fi < append.failures.length; fi++) {
        failures.push(append.failures[fi]);
      }
    }

    if (topo.netList.length === 0 && topo.deviceList.length > 0) {
      failures.push('LLM netPlan merge 后无有效网络');
    }

    const notes = `merge preserve=${preservedNetNames.length} change=${changedNetNames.length}` +
      (plan.topologyNotes.length > 0 ? ` | ${plan.topologyNotes}` : '');
    NetPlanExecutor.auditPinWorldCollisions(topo);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] net_plan_merge END nets=${netCount} labels=${labelCount}` +
      ` wires=${topo.wireList.length} preserve=[${preservedNetNames.slice(0, 8).join(',')}]` +
      ` change=[${changedNetNames.slice(0, 8).join(',')}] failures=${failures.length}`);

    const result: NetPlanMergeResult = {
      topology: topo,
      netCount,
      labelCount,
      stubWireCount,
      notes,
      failures,
      changedNetNames,
      preservedNetNames
    };
    return result;
  }

  /** 现有拓扑网脚指纹：netName → sorted "REF.PIN" */
  static buildExistingNetFingerprints(topo: SchTopology): Map<string, string> {
    const uuidToRef = new Map<string, string>();
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      uuidToRef.set(d.instUuid, d.refName);
    }
    const out = new Map<string, string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const keys: string[] = [];
      for (let ki = 0; ki < (net.nodeList?.length ?? 0); ki++) {
        const node = net.nodeList[ki];
        const ref = uuidToRef.get(node.devUuid) ?? node.devUuid;
        const pin = (node.pinId ?? '').toUpperCase();
        keys.push(`${ref.toUpperCase()}.${pin}`);
      }
      keys.sort();
      out.set(net.netName, keys.join('|'));
    }
    return out;
  }

  /** 计划网脚指纹（按位号/库 ID 解析到现图实例） */
  static buildPlanNetFingerprints(plan: NetPlanResult, topo: SchTopology): Map<string, string> {
    const out = new Map<string, string>();
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const keys: string[] = [];
      for (let ci = 0; ci < net.connections.length; ci++) {
        const c = net.connections[ci];
        const resolved = NetPlanExecutor.resolveCompRef(c.compRef, topo);
        const ref = (resolved?.refName ?? c.compRef).toUpperCase();
        const pin = (c.pinId ?? '').toUpperCase();
        keys.push(`${ref}.${pin}`);
      }
      keys.sort();
      out.set(net.name, keys.join('|'));
    }
    return out;
  }

  /** 解析 plan compRef → 现图器件（位号优先，其次唯一 libDevId） */
  private static resolveCompRef(compRef: string, topo: SchTopology): DeviceInst | null {
    const key = (compRef ?? '').trim();
    if (key.length === 0) {
      return null;
    }
    for (let i = 0; i < topo.deviceList.length; i++) {
      if (topo.deviceList[i].refName === key) {
        return topo.deviceList[i];
      }
    }
    const matches: DeviceInst[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      if (topo.deviceList[i].libDevId === key) {
        matches.push(topo.deviceList[i]);
      }
    }
    if (matches.length === 1) {
      return matches[0];
    }
    return null;
  }

  /**
   * 在不清空现有网/线的前提下追加 plan 中的网络（execute 的追加版）。
   * 调用方须已剔除将重建的旧网。
   */
  static executeAppend(topo: SchTopology, plan: NetPlanResult): NetPlanExecutionResult {
    const failures: string[] = [];
    let netCount = 0;
    let labelCount = 0;
    let stubWireCount = 0;

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

    for (let ni = 0; ni < plan.nets.length; ni++) {
      const netPlan = plan.nets[ni];
      const allLabel = netPlan.connections.length >= 1 &&
        netPlan.connections.every(c => c.mode === 'joinByLabel');
      if (netPlan.connections.length < 2 && !allLabel) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan skip singleton net=${netPlan.name}` +
          ` conns=${netPlan.connections.length}`);
        continue;
      }

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

      if (nodeList.length < 1) {
        failures.push(`网络 "${netPlan.name}" 解析后无有效连接`);
        continue;
      }
      if (nodeList.length < 2 && labelPins.length < 1) {
        failures.push(`网络 "${netPlan.name}" 解析后不足2个连接`);
        continue;
      }

      let hasIPlus = false;
      let hasIMinus = false;
      for (const conn of netPlan.connections) {
        const pn = (conn.pinName ?? conn.pinId ?? '').toUpperCase();
        if (pn === 'I+' || pn === 'I_PLUS') {
          hasIPlus = true;
        }
        if (pn === 'I-' || pn === 'I_MINUS') {
          hasIMinus = true;
        }
      }
      if (hasIPlus && hasIMinus) {
        failures.push(`电流表 I+/I- 在同一网络 "${netPlan.name}" → 短路！拒绝执行`);
        continue;
      }

      let hasVccSym = false;
      let hasGndSym = false;
      for (let nsi = 0; nsi < nodeList.length; nsi++) {
        const nd = nodeList[nsi];
        const d = topo.deviceList.find(x => x.instUuid === nd.devUuid);
        const lib = (d?.libDevId ?? '').toUpperCase();
        if (lib === 'VCC' || lib === 'VDD') {
          hasVccSym = true;
        }
        if (lib === 'GND' || lib === 'VSS') {
          hasGndSym = true;
        }
      }
      if (hasVccSym && hasGndSym) {
        failures.push(`VCC 与 GND 符号同网 "${netPlan.name}" → 短路！拒绝执行`);
        continue;
      }

      const isPower = netPlan.type === 'power' || netPlan.type === 'ground';
      const netInfo: NetInfo = {
        netUuid: IdUtil.generate('net'),
        netName: netPlan.name,
        displayName: netPlan.name,
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

      for (const lp of labelPins) {
        const labelEntry = plan.labels.find(l =>
          l.netName === netPlan.name && l.atComp === lp.dev.refName && l.atPin === lp.pinId);
        const text = labelEntry ? labelEntry.text : netPlan.name;
        const pinPos = PinWorldResolver.forDeviceInst(lp.dev, lp.pinId, lp.pinName);
        const labelPos = NetPlanExecutor.stubLabelOutside(topo, lp.dev, pinPos, text);
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
        const wid = IdUtil.generate('w');
        const routeLine = makeRouteLine(netInfo.netUuid, [pinPos, labelPos], false, wid);
        topo.wireList.push(routeLine);
        stubWireCount++;
        const pinTok = lp.pinName.length > 0 && lp.pinName !== lp.pinId
          ? `${lp.pinId}(${lp.pinName})` : lp.pinId;
        traceAiWireDraw('net_plan_merge_stub',
          `net=${netPlan.name} pin=${lp.dev.refName}.${pinTok}` +
          ` wireId=${wid} label=${text}` +
          ` ends=(${Math.round(pinPos.x)},${Math.round(pinPos.y)})→` +
          `(${Math.round(labelPos.x)},${Math.round(labelPos.y)})`);
      }
    }

    return {
      topology: topo,
      netCount,
      labelCount,
      stubWireCount,
      notes: `append ${netCount} nets`,
      failures
    };
  }

  /**
   * 检测不同网/不同脚落在同一世界坐标（脏 pinId 典型症状：R1.1 与 R1.2 都落到 pin2）。
   * 写入 instr_trace，便于 oneshot/modular 排障。
   */
  static auditPinWorldCollisions(topo: SchTopology): number {
    // key = "x,y" → list of "net:ref.pin"
    const byPos = new Map<string, string[]>();
    const pinLines: string[] = [];
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const pinId = node.pinId.length > 0 ? node.pinId : '1';
        const pinName = (node.pinName !== undefined && node.pinName.length > 0) ?
          node.pinName : pinId;
        const dirtyHint = /\(/.test(pinId) ? ' DIRTY_PIN' : '';
        const world = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
        const posKey = `${Math.round(world.x)},${Math.round(world.y)}`;
        const label =
          `${net.netName}:${dev.refName}.${pinId}@(${posKey})${dirtyHint}`;
        if (pinLines.length < 24) {
          pinLines.push(label);
        }
        const list = byPos.get(posKey) ?? [];
        list.push(`${net.netName}:${dev.refName}.${pinId}`);
        byPos.set(posKey, list);
      }
    }
    const collisions: string[] = [];
    const keys = Array.from(byPos.keys());
    for (let i = 0; i < keys.length; i++) {
      const list = byPos.get(keys[i]) ?? [];
      if (list.length < 2) {
        continue;
      }
      // 同网同坐标可接受；异网或异脚同坐标需报警
      const uniq = new Set(list);
      if (uniq.size < 2) {
        continue;
      }
      const netsAt = new Set<string>();
      for (let j = 0; j < list.length; j++) {
        netsAt.add(list[j].split(':')[0]);
      }
      if (netsAt.size >= 2 || uniq.size >= 2) {
        collisions.push(`pos(${keys[i]}) → [${list.join(' | ')}]`);
      }
    }
    if (pinLines.length > 0) {
      traceAiDiag('AI_PIPE', 'net_plan_pin_world', pinLines, 24);
    }
    if (collisions.length > 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan PIN_WORLD_COLLISION count=${collisions.length}` +
        ` — 多网/多脚同坐标，疑脏 pinId 或摆放重叠`);
      traceAiDiag('AI_PIPE', 'net_plan_pin_collide', collisions, 12);
    } else {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan pin_world OK nodes=${pinLines.length} collisions=0`);
    }
    return collisions.length;
  }

  /**
   * 局部小网导线优先：全标号 -> hints -> 最多4脚按 DUT 预算升级 -> 大网/电源回标号 ->
   * fanout 兜底 -> 同网均质（仪器脚可混合标号）-> 自动写入 forceWire。
   * Orchestrator 可在 compact 拉近前预调用；execute 内再调一次幂等。
   */
  static prepareModes(plan: NetPlanResult): void {
    NetPlanExecutor.forceAllJoinByLabel(plan);
    NetPlanExecutor.applyWiringHints(plan);
    NetPlanExecutor.promoteJoinWiredByPinBudget(plan);
    NetPlanExecutor.demoteOversizedOrPowerWired(plan);
    NetPlanExecutor.capJoinWiredFanout(plan);
    // 仪器脚可 joinByLabel，同网 DUT 保持 joinWired（混合合法）
    NetPlanExecutor.homogenizeNetConnectionModes(plan);
    NetPlanExecutor.boostForceWireFromWiredNets(plan);
  }

  /**
   * 同一网络内：电源/大网整网标号；小信号 DUT 脚导线；仪器测量脚始终标号（允许混合）。
   * 禁止「网内有 CH1 就整网压标号」——那会把 DUT 间 WAR 导线一并抹掉。
   */
  private static homogenizeNetConnectionModes(plan: NetPlanResult): void {
    let netsToLabel = 0;
    let netsToWire = 0;
    let connsFixed = 0;
    let mixedInstr = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const conns = net.connections ?? [];
      if (conns.length < 2) {
        continue;
      }
      let labelN = 0;
      let wireN = 0;
      let hasInstr = false;
      let dutN = 0;
      for (let ci = 0; ci < conns.length; ci++) {
        if (conns[ci].mode === 'joinByLabel') {
          labelN++;
        } else if (conns[ci].mode === 'joinWired') {
          wireN++;
        }
        if (NetPlanExecutor.isInstrumentPin(conns[ci].pinName, conns[ci].pinId)) {
          hasInstr = true;
        } else {
          dutN++;
        }
      }
      const nameUp = (net.name ?? '').toUpperCase();
      const isPower = NetPlanExecutor.isPowerRailName(nameUp);

      // 含仪器：DUT 小网走导线，仪器脚标号（混合合法）
      if (hasInstr) {
        const preferDutWire = !isPower && dutN >= 2 && dutN <= MAX_WIRE_PROMOTE_PINS;
        for (let ci = 0; ci < conns.length; ci++) {
          const isInstr = NetPlanExecutor.isInstrumentPin(conns[ci].pinName, conns[ci].pinId);
          const target: 'joinWired' | 'joinByLabel' =
            isInstr ? 'joinByLabel' : (preferDutWire ? 'joinWired' : 'joinByLabel');
          if (conns[ci].mode !== target) {
            conns[ci].mode = target;
            connsFixed++;
          }
        }
        if (preferDutWire) {
          mixedInstr++;
          netsToWire++;
        } else {
          netsToLabel++;
        }
        continue;
      }

      if (labelN === 0 || wireN === 0) {
        continue;
      }
      // 无仪器的小网：有任一导线倾向即整网导线
      const preferWire = !isPower &&
        conns.length <= MAX_WIRE_PROMOTE_PINS && wireN >= 1;
      const target: 'joinWired' | 'joinByLabel' = preferWire ? 'joinWired' : 'joinByLabel';
      for (let ci = 0; ci < conns.length; ci++) {
        if (conns[ci].mode !== target) {
          conns[ci].mode = target;
          connsFixed++;
        }
      }
      if (preferWire) {
        netsToWire++;
      } else {
        netsToLabel++;
      }
    }
    if (netsToLabel > 0 || netsToWire > 0 || mixedInstr > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] homogenize mixed→wire=${netsToWire} →label=${netsToLabel}` +
        ` instrMixed=${mixedInstr} conns=${connsFixed}`);
    }
  }

  /**
   * 将 DUT 侧已 joinWired 的 2～4 脚小信号网写入 forceWire（仪器脚可仍为标号），
   * 并从 forceLabel 剔除，避免后续 A* 整网 demote 成标号。
   */
  private static boostForceWireFromWiredNets(plan: NetPlanResult): void {
    if (!plan.wiringHints) {
      const empty: NetPlanWiringHints = {
        priorityOrder: [],
        forceWire: [],
        forceLabel: []
      };
      plan.wiringHints = empty;
    }
    const hints = plan.wiringHints;
    const forceWire = (hints.forceWire ?? []).slice();
    const forceLabel = (hints.forceLabel ?? []).slice();
    const wireUp = new Set<string>();
    for (let i = 0; i < forceWire.length; i++) {
      wireUp.add(`${forceWire[i]}`.toUpperCase());
    }
    let added = 0;
    let removedLabel = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const name = net.name ?? '';
      if (name.length === 0) {
        continue;
      }
      const nameUp = name.toUpperCase();
      const conns = net.connections ?? [];
      let dutN = 0;
      let dutAllWired = true;
      for (let ci = 0; ci < conns.length; ci++) {
        if (NetPlanExecutor.isInstrumentPin(conns[ci].pinName, conns[ci].pinId)) {
          continue;
        }
        dutN++;
        if (conns[ci].mode !== 'joinWired') {
          dutAllWired = false;
        }
      }
      if (dutN < 2 || dutN > MAX_WIRE_PROMOTE_PINS) {
        continue;
      }
      if (NetPlanExecutor.isPowerRailName(nameUp) && dutN > 2) {
        continue;
      }
      if (!dutAllWired) {
        continue;
      }
      if (!wireUp.has(nameUp)) {
        forceWire.push(name);
        wireUp.add(nameUp);
        added++;
      }
      for (let li = forceLabel.length - 1; li >= 0; li--) {
        if (`${forceLabel[li]}`.toUpperCase() === nameUp) {
          forceLabel.splice(li, 1);
          removedLabel++;
        }
      }
    }
    hints.forceWire = forceWire;
    hints.forceLabel = forceLabel;
    if (added > 0 || removedLabel > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] boost forceWire+=${added} dropForceLabel=${removedLabel}` +
        ` forceWire=[${forceWire.slice(0, 16).join(',')}]`);
    }
  }

  /** 收集需拉近的 joinWired 小网器件对（DUT 连接数 2～4） */
  static collectWiredCompactPairs(plan: NetPlanResult): WiredCompactPair[] {
    const pairs: WiredCompactPair[] = [];
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const conns = net.connections ?? [];
      const dutN = NetPlanExecutor.countDutPins(conns);
      if (dutN < 2 || dutN > MAX_WIRE_PROMOTE_PINS) {
        continue;
      }
      if (NetPlanExecutor.isPowerRailName((net.name ?? '').toUpperCase()) && dutN > 2) {
        continue;
      }
      const wiredRefs: string[] = [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        if (c.mode !== 'joinWired') {
          continue;
        }
        if (NetPlanExecutor.isInstrumentPin(c.pinName, c.pinId)) {
          continue;
        }
        if (wiredRefs.indexOf(c.compRef) < 0) {
          wiredRefs.push(c.compRef);
        }
      }
      if (wiredRefs.length < 2) {
        continue;
      }
      for (let a = 0; a < wiredRefs.length; a++) {
        for (let b = a + 1; b < wiredRefs.length; b++) {
          const pair: WiredCompactPair = {
            refA: wiredRefs[a],
            refB: wiredRefs[b],
            netName: net.name ?? ''
          };
          pairs.push(pair);
        }
      }
    }
    return pairs;
  }

  private static forceAllJoinByLabel(plan: NetPlanResult): void {
    let n = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections;
      for (let ci = 0; ci < conns.length; ci++) {
        if (conns[ci].mode !== 'joinByLabel') {
          conns[ci].mode = 'joinByLabel';
          n++;
        }
      }
    }
    if (n > 0) {
      Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] label_first forceAllLabel changed=${n}`);
    }
  }

  /**
   * 仅当：DUT 脚数 2～4、非大电源扇出、非仪器脚、该脚 joinWired 累计仍 <2
   * 才从标号升级为导线。仪器脚始终保持标号；DUT 计数不含探针脚。
   */
  private static promoteJoinWiredByPinBudget(plan: NetPlanResult): void {
    const wiredCount = new Map<string, number>();
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections;
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        if (c.mode === 'joinWired') {
          const key = `${c.compRef}|${c.pinId}`;
          wiredCount.set(key, (wiredCount.get(key) ?? 0) + 1);
        }
      }
    }

    const order: number[] = [];
    for (let i = 0; i < plan.nets.length; i++) {
      order.push(i);
    }
    order.sort((ia: number, ib: number) =>
      NetPlanExecutor.countDutPins(plan.nets[ia].connections) -
      NetPlanExecutor.countDutPins(plan.nets[ib].connections));

    let promoted = 0;
    let keptLabel = 0;
    let skipLarge = 0;
    let skipPower = 0;
    for (let oi = 0; oi < order.length; oi++) {
      const net = plan.nets[order[oi]];
      const nameUp = (net.name ?? '').toUpperCase();
      const conns = net.connections ?? [];
      const dutN = NetPlanExecutor.countDutPins(conns);

      // 大网：按 DUT 脚数判定（探针脚不挤占预算）
      if (dutN > MAX_WIRE_PROMOTE_PINS) {
        for (let ci = 0; ci < conns.length; ci++) {
          if (conns[ci].mode === 'joinByLabel') {
            keptLabel++;
          }
        }
        skipLarge++;
        continue;
      }
      if (dutN < 2) {
        continue;
      }
      // 电源别名且 DUT >2：不升级
      if (NetPlanExecutor.isPowerRailName(nameUp) && dutN > 2) {
        skipPower++;
        for (let ci = 0; ci < conns.length; ci++) {
          if (conns[ci].mode === 'joinByLabel') {
            keptLabel++;
          }
        }
        continue;
      }

      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        if (c.mode === 'joinWired') {
          continue;
        }
        if (NetPlanExecutor.isInstrumentPin(c.pinName, c.pinId)) {
          keptLabel++;
          continue;
        }
        const key = `${c.compRef}|${c.pinId}`;
        const n = wiredCount.get(key) ?? 0;
        if (n >= 2) {
          keptLabel++;
          continue;
        }
        c.mode = 'joinWired';
        wiredCount.set(key, n + 1);
        promoted++;
      }
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] wire_boost promote wired+=${promoted} keptLabel=${keptLabel}` +
      ` skipLarge=${skipLarge} skipPower=${skipPower}`);
  }

  private static countDutPins(conns: NetPlanConnection[] | undefined): number {
    if (!conns || conns.length === 0) {
      return 0;
    }
    let n = 0;
    for (let i = 0; i < conns.length; i++) {
      if (!NetPlanExecutor.isInstrumentPin(conns[i].pinName, conns[i].pinId)) {
        n++;
      }
    }
    return n;
  }

  /**
   * 安全网：DUT >4 脚、或电源别名且 DUT>2 上的 joinWired → 压回标号；
   * 仪器测量脚强制标号。线圈短网（名含 COIL）保留导线。
   */
  private static demoteOversizedOrPowerWired(plan: NetPlanResult): void {
    let demoted = 0;
    let instrDemoted = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const nameUp = (net.name ?? '').toUpperCase();
      const conns = net.connections ?? [];
      const dutN = NetPlanExecutor.countDutPins(conns);
      const keepCoil = nameUp.indexOf('COIL') >= 0 || nameUp.indexOf('REL_COIL') >= 0;
      const tooBig = dutN > MAX_WIRE_PROMOTE_PINS;
      const powerFan = NetPlanExecutor.isPowerRailName(nameUp) && dutN > 2;
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        if (c.mode !== 'joinWired') {
          continue;
        }
        if (NetPlanExecutor.isInstrumentPin(c.pinName, c.pinId)) {
          c.mode = 'joinByLabel';
          instrDemoted++;
          continue;
        }
        if (!keepCoil && (tooBig || powerFan)) {
          c.mode = 'joinByLabel';
          demoted++;
        }
      }
    }
    if (demoted > 0 || instrDemoted > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] label_first demoteOversized wired→label=${demoted}` +
        ` instr→label=${instrDemoted}`);
    }
  }

  /** VCC/GND/VEE 及 VCC_AM、AVDD、AGND 等电源别名 */
  private static isPowerRailName(nameUp: string): boolean {
    if (nameUp.length === 0) {
      return false;
    }
    if (nameUp === 'V+' || nameUp === 'V-' || nameUp === 'VCC' || nameUp === 'GND' ||
      nameUp === 'VEE' || nameUp === 'VDD' || nameUp === 'VSS' ||
      nameUp === 'AVDD' || nameUp === 'AGND' || nameUp === 'DVDD' || nameUp === 'DGND') {
      return true;
    }
    return nameUp.indexOf('VCC') === 0 || nameUp.indexOf('GND') === 0 ||
      nameUp.indexOf('VEE') === 0 || nameUp.indexOf('VDD') === 0 ||
      nameUp.indexOf('VSS') === 0 || nameUp.indexOf('AVDD') === 0 ||
      nameUp.indexOf('AGND') === 0;
  }

  private static isInstrumentPin(pinName: string, pinId: string): boolean {
    const pin = `${pinName ?? pinId ?? ''}`.toUpperCase();
    if (/^CH\d+$/.test(pin)) {
      return true;
    }
    return pin === 'V+' || pin === 'I+' || pin === 'I-' || pin === 'I_PLUS' ||
      pin === 'I_MINUS' || pin === 'PROBE' || pin === 'COM';
  }

  /**
   * 按 wiringHints 改写连接 mode：forceWire 保 DUT 导线；仪器脚始终标号。
   * 禁止「网内有 CH1 就整网压标号」。
   */
  private static applyWiringHints(plan: NetPlanResult): void {
    const hints = plan.wiringHints;
    if (!hints) {
      return;
    }
    let forceLabel = (hints.forceLabel ?? []).slice();
    let forceWire = (hints.forceWire ?? []).slice();
    // 仅纯电源轨禁止 forceWire；信号网名含 OSC/SENSE 但挂 DUT 的仍可导线
    const demoteWire = new Set<string>();
    for (let wi = forceWire.length - 1; wi >= 0; wi--) {
      const up = `${forceWire[wi] ?? ''}`.toUpperCase();
      if (NetPlanExecutor.isPowerRailName(up)) {
        demoteWire.add(up);
        forceWire.splice(wi, 1);
      }
    }
    if (demoteWire.size > 0) {
      const flUp = new Set(forceLabel.map(x => `${x}`.toUpperCase()));
      const demoteArr = Array.from(demoteWire);
      for (let di = 0; di < demoteArr.length; di++) {
        const up = demoteArr[di];
        if (!flUp.has(up)) {
          forceLabel.push(up);
          flUp.add(up);
        }
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] applyWiringHints demote power forceWire→forceLabel n=${demoteWire.size}`);
    }
    if (forceLabel.length === 0 && forceWire.length === 0) {
      // 仍须把仪器脚压标号
      NetPlanExecutor.forceInstrumentPinsLabel(plan);
      return;
    }
    hints.forceLabel = forceLabel;
    hints.forceWire = forceWire;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const net = plan.nets[ni];
      const nameUp = (net.name ?? '').toUpperCase();
      if (nameUp.length === 0 || !net.connections) {
        continue;
      }
      let inForceLabel = false;
      let inForceWire = false;
      for (let i = 0; i < forceLabel.length; i++) {
        const fl = forceLabel[i];
        if (fl && nameUp === `${fl}`.toUpperCase()) {
          inForceLabel = true;
          break;
        }
      }
      for (let i = 0; i < forceWire.length; i++) {
        const fw = forceWire[i];
        if (fw && nameUp === `${fw}`.toUpperCase()) {
          inForceWire = true;
          break;
        }
      }
      const dutN = NetPlanExecutor.countDutPins(net.connections);
      const keepCoil = nameUp.indexOf('COIL') >= 0 || nameUp.indexOf('REL_COIL') >= 0;
      // 线圈：整网导线
      if (keepCoil || (inForceWire && !NetPlanExecutor.isPowerRailName(nameUp))) {
        for (let ci = 0; ci < net.connections.length; ci++) {
          const c = net.connections[ci];
          if (NetPlanExecutor.isInstrumentPin(c.pinName, c.pinId)) {
            c.mode = 'joinByLabel';
          } else {
            c.mode = 'joinWired';
          }
        }
        continue;
      }
      // forceLabel：仅当 DUT 不足 2 或电源轨时整网标号；否则只压仪器脚
      if (inForceLabel) {
        const wholeLabel = NetPlanExecutor.isPowerRailName(nameUp) || dutN < 2;
        for (let ci = 0; ci < net.connections.length; ci++) {
          const c = net.connections[ci];
          if (wholeLabel || NetPlanExecutor.isInstrumentPin(c.pinName, c.pinId)) {
            c.mode = 'joinByLabel';
          }
        }
      }
    }
    NetPlanExecutor.forceInstrumentPinsLabel(plan);
  }

  /** 仪器测量脚一律 joinByLabel（可与同网 DUT 导线并存） */
  private static forceInstrumentPinsLabel(plan: NetPlanResult): void {
    let n = 0;
    for (let ni = 0; ni < plan.nets.length; ni++) {
      const conns = plan.nets[ni].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        if (NetPlanExecutor.isInstrumentPin(c.pinName, c.pinId) && c.mode !== 'joinByLabel') {
          c.mode = 'joinByLabel';
          n++;
        }
      }
    }
    if (n > 0) {
      Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] instrPins→label n=${n}`);
    }
  }

  /**
   * 标号 stub 终点：库/估选中区 + 避开异器件/导线/已有标号（与 ConstrainedWiringEngine demote 对齐）
   */
  private static stubLabelOutside(topo: SchTopology, dev: DeviceInst, pinPos: Point2D,
    labelText: string = ''): Point2D {
    const hitRects = NetPlanExecutor.buildApproxHitRects(topo);
    let own = hitRects.find(r => r.instUuid === dev.instUuid);
    if (!own) {
      own = NetPlanExecutor.approxHitRectForDev(dev, pinPos);
    }
    const foreignPins = NetPlanExecutor.collectForeignPinWorlds(topo, pinPos);
    const occupied: Point2D[] = [];
    for (let li = 0; li < topo.netLabelList.length; li++) {
      occupied.push({ x: topo.netLabelList[li].x, y: topo.netLabelList[li].y });
    }
    const wirePaths: Point2D[][] = [];
    for (let wi = 0; wi < topo.wireList.length; wi++) {
      const pts = topo.wireList[wi].points;
      if (pts && pts.length >= 2) {
        wirePaths.push(pts);
      }
    }
    const hints: LabelPlaceHints = {
      wirePaths: wirePaths,
      occupiedLabels: occupied,
      labelText: labelText,
      wireClearance: 16,
      labelClearance: 24
    };
    return DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(
      pinPos, own, hitRects, FOREIGN_PIN_CLEARANCE, foreignPins, hints);
  }

  private static approxHitRectForDev(dev: DeviceInst, pinPosHint?: Point2D): WorldHitRect {
    const libSafe = NetPlanExecutor.library;
    if (libSafe !== null) {
      const r = libSafe.getComponent(dev.libDevId);
      const data = r.data;
      if (r.success && data !== undefined && data.pins !== undefined && data.pins.length > 0) {
        return DeviceHitGeometry.hitRectFromDeviceInst(dev, data.pins, SELECTION_HIT_PAD);
      }
    }
    const hx = pinPosHint !== undefined
      ? Math.max(Math.abs(pinPosHint.x - dev.x), 30)
      : 55;
    const hy = pinPosHint !== undefined
      ? Math.max(Math.abs(pinPosHint.y - dev.y), 20)
      : 30;
    const halfW = hx + SELECTION_HIT_PAD;
    const halfH = hy + SELECTION_HIT_PAD;
    const fallback: WorldHitRect = {
      x: dev.x - halfW,
      y: dev.y - halfH,
      w: halfW * 2,
      h: halfH * 2,
      refName: dev.refName,
      instUuid: dev.instUuid,
      libDevId: dev.libDevId
    };
    return fallback;
  }

  private static buildApproxHitRects(topo: SchTopology): WorldHitRect[] {
    const rects: WorldHitRect[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      rects.push(NetPlanExecutor.approxHitRectForDev(topo.deviceList[i]));
    }
    return rects;
  }

  private static collectForeignPinWorlds(topo: SchTopology, excludePin: Point2D): Point2D[] {
    const out: Point2D[] = [];
    const libSafe = NetPlanExecutor.library;
    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      let ids: string[] = [];
      if (libSafe !== null) {
        const r = libSafe.getComponent(d.libDevId);
        const data = r.data;
        if (r.success && data !== undefined && data.pins !== undefined) {
          for (let pi = 0; pi < data.pins.length; pi++) {
            const p = data.pins[pi];
            ids.push(p.id);
            if (p.name && p.name.length > 0 && p.name !== p.id) {
              ids.push(p.name);
            }
          }
        }
      }
      if (ids.length === 0) {
        ids = [
          '1', '2', '3', '4', '5', '6', '7', '8',
          'A', 'K', 'COM', 'NO', 'NC', 'IN+', 'IN-', 'OUT',
          'V+', 'V-', 'VCC', 'GND', 'CH1', 'CH2', 'I+', 'I-', 'PROBE'
        ];
      }
      for (let pi = 0; pi < ids.length; pi++) {
        const pw = PinWorldResolver.forDeviceInst(d, ids[pi], ids[pi]);
        if (Math.hypot(pw.x - excludePin.x, pw.y - excludePin.y) < 1) {
          continue;
        }
        if (Math.hypot(pw.x - d.x, pw.y - d.y) < 2 && ids[pi] !== '1') {
          continue;
        }
        out.push(pw);
      }
    }
    return out;
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
    // 大小写不敏感：按板上真实 refName / libDevId 对齐
    const up = (compRef ?? '').toUpperCase();
    if (up.length > 0) {
      for (let i = 0; i < allDevs.length; i++) {
        const d = allDevs[i];
        if ((d.refName ?? '').toUpperCase() !== up && (d.libDevId ?? '').toUpperCase() !== up) {
          continue;
        }
        const list = refQueues.get(d.refName) ?? libQueues.get(d.libDevId);
        if (!list || list.length === 0) {
          continue;
        }
        const idx = list.findIndex(x => x.instUuid === d.instUuid);
        if (idx < 0) {
          continue;
        }
        hit = list.splice(idx, 1)[0];
        NetPlanExecutor.drainDevice(hit, refQueues, libQueues);
        return hit;
      }
    }
    // 安全别名：R1/C1/D1/K1/S1 → 队列中未消费的同前缀首颗（精确一位号数字）
    const m = up.match(/^(R|C|L|D|K|S|U|Q|RV|POT|OSC|VM|AM|LED)(\d+)$/);
    if (m) {
      const prefix = m[1];
      let needle = '';
      if (prefix === 'R') {
        needle = 'R_';
      } else if (prefix === 'C') {
        needle = 'C_';
      } else if (prefix === 'L') {
        needle = 'L_';
      } else if (prefix === 'D' || prefix === 'LED') {
        needle = 'LED_';
      } else if (prefix === 'K') {
        needle = 'RELAY';
      } else if (prefix === 'S') {
        needle = 'SW_';
      } else if (prefix === 'RV' || prefix === 'POT') {
        needle = 'POT';
      } else if (prefix === 'OSC') {
        needle = 'OSCILLOSCOPE';
      } else if (prefix === 'VM') {
        needle = 'VOLTMETER';
      } else if (prefix === 'AM') {
        needle = 'AMMETER';
      } else if (prefix === 'SIG' || prefix === 'SG') {
        needle = 'SIGNAL_GEN';
      }
      if (needle.length > 0) {
        for (let i = 0; i < allDevs.length; i++) {
          const d = allDevs[i];
          const lib = (d.libDevId ?? '').toUpperCase();
          if (lib.indexOf(needle) < 0 && !lib.startsWith(needle)) {
            continue;
          }
          const list = libQueues.get(d.libDevId);
          if (!list || list.length === 0) {
            continue;
          }
          const idx = list.findIndex(x => x.instUuid === d.instUuid);
          if (idx < 0) {
            continue;
          }
          hit = list.splice(idx, 1)[0];
          NetPlanExecutor.drainDevice(hit, refQueues, libQueues);
          return hit;
        }
      }
    }
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
}
