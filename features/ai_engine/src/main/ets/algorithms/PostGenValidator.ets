/**
 * 后生成验证器 — 画布布置完成后自检 + 自动修复
 *
 * 检查项:
 *   1. VCC/GND 存在性
 *   2. 仪器拓扑正确性 (电流表串联/电压表并联)
 *   3. 导线-器件体碰撞
 *   4. 跨网络导线重叠
 *   5. 浮空引脚 (委托 FaultDiagnoser)
 *
 * 修复策略: 最多 3 轮, 每轮修复 → 重布线 → 再检查
 */
import {
  SchTopology, DeviceInst, NetInfo, NetNodeRef,
  Point2D, ErcViolation, ErcSeverity, ErcRuleType,
  IdUtil, TopologyAdapter, makeDeviceInst,
  stringMap1, getPinNetMap, calcSymbolBounds, Pin, RouteLine,
  SymbolBounds,
  Logger
} from 'common';
import { IComponentLibrary, ComponentDefinition } from 'component_library';
import { FaultDiagnoser } from './FaultDiagnoser';
import { SemanticNetBuilder } from './SemanticNetBuilder';
import { ConstrainedWiringEngine } from './ConstrainedWiringEngine';

export interface ValidationIssue {
  type: 'missing_power' | 'instrument_topo' | 'wire_body' | 'wire_cross' | 'floating_pin' | 'pin_proximity' | 'erc';
  severity: 'error' | 'warning';
  desc: string;
  targetUuid?: string;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  fixedCount: number;
  topo: SchTopology;
}

interface Segment {
  a: Point2D;
  b: Point2D;
}

interface BoundingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FixResult {
  topo: SchTopology;
  fixed: number;
}

export class PostGenValidator {
  private library: IComponentLibrary;
  private wiringEngine: ConstrainedWiringEngine;

  constructor(library: IComponentLibrary) {
    this.library = library;
    this.wiringEngine = new ConstrainedWiringEngine();
  }

  /** 只读检查 — 不修改拓扑, 供 pipeline 几何碰撞检测使用 */
  collectIssues(topo: SchTopology): ValidationIssue[] {
    return this.collectAllIssues(topo);
  }

  /** 主入口: 验证 + 自动修复循环 (最多 3 轮) */
  validateAndFix(topo: SchTopology): ValidationResult {
    const maxRounds = 3;
    let totalFixed = 0;
    let current = topo;

    for (let round = 0; round < maxRounds; round++) {
      const issues = this.collectAllIssues(current);
      const errors = issues.filter(i => i.severity === 'error');

      if (errors.length === 0) {
        const warns = issues.filter(i => i.severity === 'warning');
        if (warns.length > 0) {
          Logger.info('PostGenValidator',
            `[VALIDATE] round=${round + 1} pass (${warns.length} warnings)`);
        } else {
          Logger.info('PostGenValidator',
            `[VALIDATE] round=${round + 1} all clear`);
        }
        return { passed: true, issues, fixedCount: totalFixed, topo: current };
      }

      Logger.info('PostGenValidator',
        `[VALIDATE] round=${round + 1} errors=${errors.length}` +
        ` issues=[${errors.map(e => e.type).join(',')}]`);
      for (const e of errors) {
        Logger.info('PostGenValidator', `  ${e.type}: ${e.desc}`);
      }

      const fixResult = this.attemptFixes(current, errors);
      current = fixResult.topo;
      totalFixed += fixResult.fixed;

      if (fixResult.fixed === 0) {
        Logger.warn('PostGenValidator',
          `[VALIDATE] round=${round + 1} cannot fix remaining ${errors.length} errors`);
        return { passed: false, issues, fixedCount: totalFixed, topo: current };
      }
    }

    const finalIssues = this.collectAllIssues(current);
    const remainingErrors = finalIssues.filter(i => i.severity === 'error');
    return {
      passed: remainingErrors.length === 0,
      issues: finalIssues,
      fixedCount: totalFixed,
      topo: current
    };
  }

  /** 收集所有类型的问题 */
  private collectAllIssues(topo: SchTopology): ValidationIssue[] {
    const all: ValidationIssue[] = [];
    all.push(...this.checkPowerSymbols(topo));
    all.push(...this.checkInstrumentTopology(topo));
    all.push(...this.checkWireBodyCollisions(topo));
    all.push(...this.checkWirePinProximity(topo));
    all.push(...this.checkCrossNetOverlaps(topo));
    all.push(...this.checkErc(topo));
    return all;
  }

  // ─── 检查 1: VCC/GND 存在性 ───

  private checkPowerSymbols(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const hasVcc = topo.deviceList.some(d => d.libDevId === 'VCC');
    const hasGnd = topo.deviceList.some(d => d.libDevId === 'GND');
    if (!hasVcc) {
      issues.push({ type: 'missing_power', severity: 'error',
        desc: '缺少 VCC 电源符号 — 电路必须有电源' });
    }
    if (!hasGnd) {
      issues.push({ type: 'missing_power', severity: 'error',
        desc: '缺少 GND 接地符号 — 电路必须有地' });
    }
    return issues;
  }

  // ─── 检查 2: 仪器拓扑 ───

  private checkInstrumentTopology(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const doc = TopologyAdapter.fromTopology(topo);

    for (const dev of topo.deviceList) {
      const pinNets = getPinNetMap(dev.instUuid, doc.nets);
      const libId = dev.libDevId.toUpperCase();

      if (libId === 'AMMETER_DC') {
        const iPlusNet = pinNets.get('I+') ?? pinNets.get('1');
        const iMinusNet = pinNets.get('I-') ?? pinNets.get('2');
        if (!iPlusNet || !iMinusNet) {
          issues.push({ type: 'instrument_topo', severity: 'error',
            desc: `电流表 ${dev.refName} 引脚浮空 (I+或I-未入网)`, targetUuid: dev.instUuid });
        } else if (iPlusNet === iMinusNet) {
          issues.push({ type: 'instrument_topo', severity: 'error',
            desc: `电流表 ${dev.refName} I+/I- 在同一网络 → 短路!`, targetUuid: dev.instUuid });
        }
      }

      if (libId === 'VOLTMETER_DC') {
        const vPlusNet = pinNets.get('V+') ?? pinNets.get('1');
        const comNet = pinNets.get('COM') ?? pinNets.get('2');
        if (!vPlusNet || !comNet) {
          issues.push({ type: 'instrument_topo', severity: 'error',
            desc: `电压表 ${dev.refName} 引脚浮空 (V+或COM未入网)`, targetUuid: dev.instUuid });
        } else if (vPlusNet === comNet) {
          issues.push({ type: 'instrument_topo', severity: 'error',
            desc: `电压表 ${dev.refName} V+/COM 在同一网络 → 读数为0!`, targetUuid: dev.instUuid });
        }
      }
    }
    return issues;
  }

  // ─── 检查 3: 导线-器件体碰撞 ───

  private checkWireBodyCollisions(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const bodyRects = this.buildBodyRects(topo);

    for (const wire of topo.wireList) {
      for (let i = 1; i < wire.points.length; i++) {
        const seg: Segment = { a: wire.points[i - 1], b: wire.points[i] };
        bodyRects.forEach((rect: BoundingRect, devId: string) => {
          if (this.segmentIntersectsRect(seg.a, seg.b, rect)) {
            const dev = topo.deviceList.find(d => d.instUuid === devId);
            const ref = dev?.refName ?? devId;
            const issue: ValidationIssue = {
              type: 'wire_body', severity: 'error',
              desc: `导线 ${wire.netUuid} 穿过器件 ${ref} 体`,
              targetUuid: wire.netUuid
            };
            issues.push(issue);
          }
        });
      }
    }
    return issues;
  }

  private buildBodyRects(topo: SchTopology): Map<string, BoundingRect> {
    const map = new Map<string, BoundingRect>();
    for (const dev of topo.deviceList) {
      const def = this.getCompDef(dev.libDevId);
      if (!def || def.pins.length === 0) {
        continue;
      }
      const bounds = calcSymbolBounds(def.pins, 8);
      // Apply rotation/mirror to get world-space AABB
      const corners = this.transformBounds(bounds, dev);
      map.set(dev.instUuid, corners);
    }
    return map;
  }

  private transformBounds(
    bounds: SymbolBounds,
    dev: DeviceInst
  ): BoundingRect {
    const p0: Point2D = { x: bounds.minX, y: bounds.minY };
    const p1: Point2D = { x: bounds.maxX, y: bounds.minY };
    const p2: Point2D = { x: bounds.minX, y: bounds.maxY };
    const p3: Point2D = { x: bounds.maxX, y: bounds.maxY };
    const pts: Point2D[] = [p0, p1, p2, p3];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      let lx = p.x, ly = p.y;
      if (dev.mirrorH) { lx = -lx; }
      switch (dev.rotate) {
        case 90: { const t = lx; lx = -ly; ly = t; break; }
        case 180: { lx = -lx; ly = -ly; break; }
        case 270: { const t = lx; lx = ly; ly = -t; break; }
      }
      const wx = dev.x + lx, wy = dev.y + ly;
      if (wx < minX) { minX = wx; }
      if (wy < minY) { minY = wy; }
      if (wx > maxX) { maxX = wx; }
      if (wy > maxY) { maxY = wy; }
    }
    const result: BoundingRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    return result;
  }

  private segmentIntersectsRect(a: Point2D, b: Point2D,
    r: BoundingRect): boolean {
    // Axis-aligned segment (horizontal or vertical) vs AABB
    if (a.x === b.x) {
      // Vertical
      const x = a.x;
      if (x < r.x || x > r.x + r.w) { return false; }
      const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
      return !(yMax < r.y || yMin > r.y + r.h);
    }
    if (a.y === b.y) {
      // Horizontal
      const y = a.y;
      if (y < r.y || y > r.y + r.h) { return false; }
      const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
      return !(xMax < r.x || xMin > r.x + r.w);
    }
    return false; // Non-orthogonal wire — skip
  }

  // ─── 检查 3b: 导线-无关引脚接近 ───
  // 导线不得贴近或穿越不属于同一网络的器件引脚

  private checkWirePinProximity(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const SAFE_DISTANCE = 20; // mil, 引脚安全距离

    // 构建所有器件的引脚世界坐标: Map<devUuid, Map<pinId, Point2D>>
    const allDevicePins = new Map<string, Map<string, Point2D>>();
    for (const dev of topo.deviceList) {
      const def = this.getCompDef(dev.libDevId);
      if (!def || def.pins.length === 0) continue;
      const pinMap = new Map<string, Point2D>();
      for (const pin of def.pins) {
        const local: Point2D = { x: pin.position.x, y: pin.position.y };
        let lx: number = local.x;
        let ly: number = local.y;
        if (dev.mirrorH) { lx = -lx; }
        switch (dev.rotate) {
          case 90: { const t = lx; lx = -ly; ly = t; break; }
          case 180: { lx = -lx; ly = -ly; break; }
          case 270: { const t = lx; lx = ly; ly = -t; break; }
        }
        pinMap.set(pin.id, { x: dev.x + lx, y: dev.y + ly });
      }
      allDevicePins.set(dev.instUuid, pinMap);
    }

    // 构建每个网络关联的 (devUuid, pinId) 集合
    const netSafePins = new Map<string, Set<string>>();
    for (const net of topo.netList) {
      const safe = new Set<string>();
      for (const node of net.nodeList) {
        safe.add(`${node.devUuid}:${node.pinId}`);
      }
      netSafePins.set(net.netUuid, safe);
    }

    // 检查每段导线的每一点 vs 所有无关引脚
    const deviceUuids: string[] = Array.from(allDevicePins.keys());
    for (const wire of topo.wireList) {
      const safeSet = netSafePins.get(wire.netUuid);
      for (const pt of wire.points) {
        for (let di = 0; di < deviceUuids.length; di++) {
          const devUuid = deviceUuids[di];
          const pinMap = allDevicePins.get(devUuid);
          if (!pinMap) {
            continue;
          }
          const pinIds: string[] = Array.from(pinMap.keys());
          for (let pi = 0; pi < pinIds.length; pi++) {
            const pinId = pinIds[pi];
            const pinPos = pinMap.get(pinId);
            if (!pinPos) {
              continue;
            }
            const safeKey = `${devUuid}:${pinId}`;
            if (safeSet && safeSet.has(safeKey)) {
              continue;
            }
            const dist = Math.hypot(pt.x - pinPos.x, pt.y - pinPos.y);
            if (dist < SAFE_DISTANCE) {
              const dev = topo.deviceList.find(d => d.instUuid === devUuid);
              const ref = dev?.refName ?? devUuid;
              issues.push({
                type: 'pin_proximity', severity: 'error',
                desc: `导线 ${wire.netUuid} 过于接近 ${ref}.${pinId} (距离${Math.round(dist)}mil)`,
                targetUuid: wire.netUuid
              });
              break; // 每个点对每个器件只报一次
            }
          }
        }
      }
    }
    // 去重: 同一(导线, 器件, 引脚)只保留一条
    const seen = new Set<string>();
    return issues.filter(iss => {
      const key = `${iss.targetUuid}:${iss.desc}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ─── 检查 4: 跨网络导线重叠 ───

  private checkCrossNetOverlaps(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const wires = topo.wireList;

    for (let i = 0; i < wires.length; i++) {
      for (let j = i + 1; j < wires.length; j++) {
        if (wires[i].netUuid === wires[j].netUuid) { continue; }
        for (let si = 1; si < wires[i].points.length; si++) {
          for (let sj = 1; sj < wires[j].points.length; sj++) {
            if (this.segmentsCollinearOverlap(
              wires[i].points[si - 1], wires[i].points[si],
              wires[j].points[sj - 1], wires[j].points[sj]
            )) {
              issues.push({
                type: 'wire_cross', severity: 'error',
                desc: `不同网络导线重叠: ${wires[i].netUuid} ↔ ${wires[j].netUuid}`,
                targetUuid: wires[i].netUuid
              });
              // Break to next wire pair
              si = wires[i].points.length;
              break;
            }
          }
        }
      }
    }
    return issues;
  }

  private segmentsCollinearOverlap(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
    // Both must be horizontal or both vertical
    const aHoriz = a.y === b.y, cHoriz = c.y === d.y;
    if (aHoriz !== cHoriz) { return false; }

    if (aHoriz) {
      if (a.y !== c.y) { return false; }
      const aMin = Math.min(a.x, b.x), aMax = Math.max(a.x, b.x);
      const cMin = Math.min(c.x, d.x), cMax = Math.max(c.x, d.x);
      const overlap = Math.min(aMax, cMax) - Math.max(aMin, cMin);
      return overlap > 1; // >1 grid unit overlap
    } else {
      if (a.x !== c.x) { return false; }
      const aMin = Math.min(a.y, b.y), aMax = Math.max(a.y, b.y);
      const cMin = Math.min(c.y, d.y), cMax = Math.max(c.y, d.y);
      const overlap = Math.min(aMax, cMax) - Math.max(aMin, cMin);
      return overlap > 1;
    }
  }

  // ─── 检查 5: ERC ───

  private checkErc(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const doc = TopologyAdapter.fromTopology(topo);
    const violations = FaultDiagnoser.diagnose(doc);
    for (const v of violations) {
      if (v.severity === ErcSeverity.ERROR || v.severity === ErcSeverity.WARNING) {
        issues.push({
          type: 'erc',
          severity: v.severity === ErcSeverity.ERROR ? 'error' : 'warning',
          desc: `[${v.ruleType}] ${v.message}`,
          targetUuid: v.componentId ?? v.netId ?? ''
        });
      }
    }
    return issues;
  }

  // ─── 自动修复 ───

  private attemptFixes(topo: SchTopology, errors: ValidationIssue[]):
    FixResult {
    let fixed = 0;
    let current = this.deepClone(topo);

    // 修复 1: 缺少电源符号 → 补充
    const missingPower = errors.filter(e => e.type === 'missing_power');
    if (missingPower.length > 0) {
      const hasVcc = topo.deviceList.some(d => d.libDevId === 'VCC');
      const hasGnd = topo.deviceList.some(d => d.libDevId === 'GND');
      if (!hasVcc) {
        current.deviceList.push(makeDeviceInst(
          IdUtil.generate('inst'), 'VCC', 'VCC', 60, 80, 0, stringMap1('voltage', '5.0')));
        fixed++;
      }
      if (!hasGnd) {
        current.deviceList.push(makeDeviceInst(
          IdUtil.generate('inst'), 'GND', 'GND', 60, 500, 0, new Map()));
        fixed++;
      }
    }

    // 修复 2: 仪器拓扑错误 → SemanticNetBuilder 重建
    const instErrors = errors.filter(e => e.type === 'instrument_topo');
    if (instErrors.length > 0) {
      Logger.info('PostGenValidator', `[FIX] instrument topology errors=${instErrors.length}, rebuilding nets`);
      try {
        const semResult = new SemanticNetBuilder(this.library).build(current);
        current = semResult.topology;
        fixed++;
      } catch (_e) {
        Logger.warn('PostGenValidator', '[FIX] SemanticNetBuilder rebuild failed');
      }
    }

    // 修复 3+4: 导线碰撞/重叠/引脚接近 → 重新布线
    const routeErrors = errors.filter(e => e.type === 'wire_body' || e.type === 'wire_cross' || e.type === 'pin_proximity');
    if (routeErrors.length > 0) {
      Logger.info('PostGenValidator',
        `[FIX] wire issues=${routeErrors.length}, re-routing`);
      const routeResult = this.wiringEngine.route(current,
        ConstrainedWiringEngine.defaultConstraints(current));
      current.wireList = routeResult.routeLines;
      fixed++;
    }

    const result: FixResult = { topo: current, fixed: fixed };
    return result;
  }

  private deepClone(topo: SchTopology): SchTopology {
    return JSON.parse(JSON.stringify(topo)) as SchTopology;
  }

  private getCompDef(libraryId: string): ComponentDefinition | null {
    const resolved = this.library.resolveLibraryId(libraryId);
    const result = this.library.getComponent(resolved);
    return (result.success && result.data) ? result.data : null;
  }
}
