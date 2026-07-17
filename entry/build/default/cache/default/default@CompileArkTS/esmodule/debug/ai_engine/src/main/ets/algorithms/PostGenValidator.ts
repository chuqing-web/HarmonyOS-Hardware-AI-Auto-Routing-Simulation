import { ErcSeverity, IdUtil, TopologyAdapter, makeDeviceInst, stringMap1, getPinNetMap, Logger, DeviceHitGeometry, SELECTION_HIT_PAD, FOREIGN_PIN_CLEARANCE, WireConflictGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, NetNodeRef, Point2D, WorldHitRect } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary, ComponentDefinition } from 'component_library';
import { FaultDiagnoser } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/FaultDiagnoser";
import { SemanticNetBuilder } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/SemanticNetBuilder";
import { ConstrainedWiringEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/ConstrainedWiringEngine";
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
        this.wiringEngine.setComponentLibrary(library);
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
                    Logger.info('PostGenValidator', `[VALIDATE] round=${round + 1} pass (${warns.length} warnings)`);
                }
                else {
                    Logger.info('PostGenValidator', `[VALIDATE] round=${round + 1} all clear`);
                }
                return { passed: true, issues, fixedCount: totalFixed, topo: current };
            }
            Logger.info('PostGenValidator', `[VALIDATE] round=${round + 1} errors=${errors.length}` +
                ` issues=[${errors.map(e => e.type).join(',')}]`);
            for (const e of errors) {
                Logger.info('PostGenValidator', `  ${e.type}: ${e.desc}`);
            }
            const fixResult = this.attemptFixes(current, errors);
            current = fixResult.topo;
            totalFixed += fixResult.fixed;
            if (fixResult.fixed === 0) {
                Logger.warn('PostGenValidator', `[VALIDATE] round=${round + 1} cannot fix remaining ${errors.length} errors`);
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
        all.push(...this.checkOrphanOptionalCaps(topo));
        all.push(...this.checkDualLedSwitchTopology(topo));
        all.push(...this.checkErc(topo));
        return all;
    }
    /**
     * 双 LED + 开关/继电器：阴极必须接到 NC/NO，不能两路都直连 GND（否则无法互斥）。
     */
    private checkDualLedSwitchTopology(topo: SchTopology): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const leds = topo.deviceList.filter(d => d.libDevId.startsWith('LED_'));
        if (leds.length < 2) {
            return issues;
        }
        const hasSwitch = topo.deviceList.some(d => d.libDevId.startsWith('SW_') || d.libDevId.toUpperCase().indexOf('RELAY') >= 0);
        if (!hasSwitch) {
            return issues;
        }
        const hasRelay = topo.deviceList.some(d => d.libDevId === 'RELAY_SPDT' || d.libDevId.toUpperCase().indexOf('RELAY') >= 0);
        if (!hasRelay) {
            issues.push({
                type: 'instrument_topo',
                severity: 'error',
                desc: '双LED+开关互斥电路缺少 RELAY_SPDT（SW_PUSH 无法做 SPDT）'
            });
            return issues;
        }
        // 检查是否有 LED 阴极接到 RELAY 的 NC/NO
        const relay = topo.deviceList.find(d => d.libDevId === 'RELAY_SPDT' || d.libDevId.toUpperCase().indexOf('RELAY') >= 0);
        if (!relay) {
            return issues;
        }
        const isRelayContact = (n: NetNodeRef): boolean => {
            const id = (n.pinId ?? '').toUpperCase();
            const nm = (n.pinName ?? '').toUpperCase();
            return id === 'NC' || id === 'NO' || nm === 'NC' || nm === 'NO' ||
                id === '4' || id === '5' || nm === '4' || nm === '5';
        };
        const isLedCathode = (n: NetNodeRef): boolean => {
            const id = (n.pinId ?? '').toUpperCase();
            const nm = (n.pinName ?? '').toUpperCase();
            return id === 'K' || nm === 'K' || id === '2' || nm === '2';
        };
        let contactLinks = 0;
        for (const net of topo.netList) {
            const hasNcOrNo = net.nodeList.some(n => n.devUuid === relay.instUuid && isRelayContact(n));
            const hasLedK = net.nodeList.some(n => {
                const led = leds.find(l => l.instUuid === n.devUuid);
                return led !== undefined && isLedCathode(n);
            });
            if (hasNcOrNo && hasLedK) {
                contactLinks++;
            }
        }
        if (contactLinks < 2) {
            // 用 net_integrity 语义：勿触发整网 Semantic 清空（LLM 网可能已基本正确）
            issues.push({
                type: 'erc',
                severity: 'error',
                desc: `继电器触点指示不完整: 仅 ${contactLinks}/2 路 LED 接到 NC/NO（需局部补网，勿整图重建）`,
                targetUuid: relay.instUuid
            });
        }
        return issues;
    }
    /** 非 MCU：完全浮空的电容视为错误（自审幻觉添加） */
    private checkOrphanOptionalCaps(topo: SchTopology): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const hasMcu = topo.deviceList.some(d => {
            const id = d.libDevId.toUpperCase();
            return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0;
        });
        if (hasMcu) {
            return issues;
        }
        const doc = TopologyAdapter.fromTopology(topo);
        for (const dev of topo.deviceList) {
            if (!dev.libDevId.startsWith('C_')) {
                continue;
            }
            const pinNets = getPinNetMap(dev.instUuid, doc.nets);
            if (pinNets.size === 0) {
                issues.push({
                    type: 'floating_pin',
                    severity: 'error',
                    desc: `浮空电容 ${dev.refName}(${dev.libDevId}) — 非 MCU 电路应移除`,
                    targetUuid: dev.instUuid
                });
            }
        }
        return issues;
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
                }
                else if (iPlusNet === iMinusNet) {
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
                }
                else if (vPlusNet === comNet) {
                    issues.push({ type: 'instrument_topo', severity: 'error',
                        desc: `电压表 ${dev.refName} V+/COM 在同一网络 → 读数为0!`, targetUuid: dev.instUuid });
                }
            }
        }
        return issues;
    }
    // ─── 检查 3: 导线侵入器件选中范围 ───
    private checkWireBodyCollisions(topo: SchTopology): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const hitRects = this.buildHitRects(topo);
        for (const wire of topo.wireList) {
            for (let i = 1; i < wire.points.length; i++) {
                const a = wire.points[i - 1];
                const b = wire.points[i];
                // 段采样：本网本器件仅逃逸走廊放行，禁止穿体/穿异器件
                const samples = DeviceHitGeometry.sampleSegment(a, b, 8);
                for (let si = 0; si < samples.length; si++) {
                    const pt = samples[si];
                    for (let ri = 0; ri < hitRects.length; ri++) {
                        const rect = hitRects[ri];
                        if (!DeviceHitGeometry.pointInRect(pt.x, pt.y, rect)) {
                            continue;
                        }
                        if (this.pointInOwnDeviceEscapeCorridor(pt, topo, wire.netUuid, rect)) {
                            continue;
                        }
                        issues.push({
                            type: 'wire_body', severity: 'error',
                            desc: `导线侵入器件选中范围: net=${wire.netUuid} → ${rect.refName}(${rect.libDevId}) ` +
                                `选中区(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)}×${Math.round(rect.h)})`,
                            targetUuid: wire.netUuid
                        });
                        break;
                    }
                }
                // 整段 vs AABB：非纯逃逸走廊则报穿区
                for (let ri = 0; ri < hitRects.length; ri++) {
                    const rect = hitRects[ri];
                    if (DeviceHitGeometry.segmentIntersectsRect(a, b, rect)) {
                        if (this.segmentIsOwnEscapeOnly(a, b, topo, wire.netUuid, rect)) {
                            continue;
                        }
                        const already = issues.some(iss => iss.type === 'wire_body' && iss.targetUuid === wire.netUuid &&
                            iss.desc.indexOf(rect.refName) >= 0);
                        if (!already) {
                            issues.push({
                                type: 'wire_body', severity: 'error',
                                desc: `导线路径穿过器件选中范围: ${wire.netUuid} × ${rect.refName}`,
                                targetUuid: wire.netUuid
                            });
                        }
                    }
                }
            }
        }
        return this.dedupeIssues(issues);
    }
    private buildHitRects(topo: SchTopology): WorldHitRect[] {
        const rects: WorldHitRect[] = [];
        for (const dev of topo.deviceList) {
            const def = this.getCompDef(dev.libDevId);
            if (def && def.pins.length > 0) {
                rects.push(DeviceHitGeometry.hitRectFromDeviceInst(dev, def.pins, SELECTION_HIT_PAD));
            }
            else {
                const locals: Point2D[] = [
                    { x: -30, y: 0 }, { x: 30, y: 0 }, { x: 0, y: -20 }, { x: 0, y: 20 }
                ];
                rects.push(DeviceHitGeometry.hitRectFromLocalPoints(locals, dev.x, dev.y, dev.rotate, dev.mirrorH, SELECTION_HIT_PAD, dev.refName, dev.instUuid, dev.libDevId));
            }
        }
        return rects;
    }
    private readonly PIN_ESCAPE_GRID: number = 10;
    /** 本网、本器件选中区内的引脚逃逸走廊 */
    private pointInOwnDeviceEscapeCorridor(pt: Point2D, topo: SchTopology, netUuid: string, rect: WorldHitRect): boolean {
        const net = topo.netList.find(n => n.netUuid === netUuid);
        if (!net) {
            return false;
        }
        const hw = Math.max(this.PIN_ESCAPE_GRID, 10);
        for (const node of net.nodeList) {
            if (node.devUuid !== rect.instUuid) {
                continue;
            }
            const def = this.getCompDef(topo.deviceList.find(d => d.instUuid === node.devUuid)?.libDevId ?? '');
            const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
            if (!dev || !def) {
                continue;
            }
            const pin = def.pins.find(p => p.id === node.pinId || p.name === node.pinName);
            if (!pin) {
                continue;
            }
            const t = DeviceHitGeometry.transformLocal(pin.position, dev.rotate, dev.mirrorH);
            const px = dev.x + t.x;
            const py = dev.y + t.y;
            if (DeviceHitGeometry.pointInPinEscapeCorridor(pt.x, pt.y, px, py, rect, hw)) {
                return true;
            }
        }
        return false;
    }
    /** 整段是否仅沿本器件逃逸走廊（正交 stub / 短引出） */
    private segmentIsOwnEscapeOnly(a: Point2D, b: Point2D, topo: SchTopology, netUuid: string, rect: WorldHitRect): boolean {
        const samples = DeviceHitGeometry.sampleSegment(a, b, 6);
        for (let i = 0; i < samples.length; i++) {
            const pt = samples[i];
            if (!DeviceHitGeometry.pointInRect(pt.x, pt.y, rect)) {
                continue;
            }
            if (!this.pointInOwnDeviceEscapeCorridor(pt, topo, netUuid, rect)) {
                return false;
            }
        }
        return true;
    }
    private dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
        const seen = new Set<string>();
        return issues.filter(iss => {
            const key = `${iss.type}:${iss.targetUuid}:${iss.desc}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    // ─── 检查 3b: 导线-无关引脚接近 ───
    // 导线不得贴近或穿越不属于同一网络的器件引脚
    private checkWirePinProximity(topo: SchTopology): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const SAFE_DISTANCE = FOREIGN_PIN_CLEARANCE;
        // 构建所有器件的引脚世界坐标: Map<devUuid, Map<pinId, Point2D>>
        const allDevicePins = new Map<string, Map<string, Point2D>>();
        for (const dev of topo.deviceList) {
            const def = this.getCompDef(dev.libDevId);
            if (!def || def.pins.length === 0)
                continue;
            const pinMap = new Map<string, Point2D>();
            for (const pin of def.pins) {
                const t = DeviceHitGeometry.transformLocal(pin.position, dev.rotate, dev.mirrorH);
                pinMap.set(pin.id, { x: dev.x + t.x, y: dev.y + t.y });
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
        // 检查每段导线整段 vs 无关引脚（不仅顶点）；端点 12mil 内豁免邻脚误报
        const ENDPOINT_EXEMPT = 12;
        const deviceUuids: string[] = Array.from(allDevicePins.keys());
        for (const wire of topo.wireList) {
            const safeSet = netSafePins.get(wire.netUuid);
            const ends: Point2D[] = [];
            if (wire.points.length > 0) {
                ends.push(wire.points[0]);
                ends.push(wire.points[wire.points.length - 1]);
            }
            for (let si = 1; si < wire.points.length; si++) {
                const a = wire.points[si - 1];
                const b = wire.points[si];
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
                        let nearEnd = false;
                        for (let e = 0; e < ends.length; e++) {
                            if (Math.hypot(pinPos.x - ends[e].x, pinPos.y - ends[e].y) <= ENDPOINT_EXEMPT) {
                                nearEnd = true;
                                break;
                            }
                        }
                        if (nearEnd) {
                            continue;
                        }
                        const dist = DeviceHitGeometry.pointSegmentDistance(pinPos, a, b);
                        if (dist < SAFE_DISTANCE) {
                            const dev = topo.deviceList.find(d => d.instUuid === devUuid);
                            const ref = dev?.refName ?? devUuid;
                            issues.push({
                                type: 'pin_proximity', severity: 'error',
                                desc: `导线 ${wire.netUuid} 过于接近无关引脚 ${ref}.${pinId} (距段${Math.round(dist)}mil<${SAFE_DISTANCE})`,
                                targetUuid: wire.netUuid
                            });
                            break;
                        }
                    }
                }
            }
        }
        // 去重
        const seen = new Set<string>();
        return issues.filter(iss => {
            const key = `${iss.targetUuid}:${iss.desc}`;
            if (seen.has(key))
                return false;
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
                const conflict = WireConflictGeometry.wiresConflict(wires[i], wires[j]);
                if (conflict === 'none') {
                    continue;
                }
                const kind = conflict === 'orthogonal_cross' ? '正交交叉' : '共线重叠';
                issues.push({
                    type: 'wire_cross', severity: 'error',
                    desc: `不同网络导线${kind}: ${wires[i].netUuid} ↔ ${wires[j].netUuid}`,
                    targetUuid: wires[i].netUuid
                });
            }
        }
        return issues;
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
    private attemptFixes(topo: SchTopology, errors: ValidationIssue[]): FixResult {
        let fixed = 0;
        let current = this.deepClone(topo);
        // 修复 1: 缺少电源符号 → 补充
        const missingPower = errors.filter(e => e.type === 'missing_power');
        if (missingPower.length > 0) {
            const hasVcc = topo.deviceList.some(d => d.libDevId === 'VCC');
            const hasGnd = topo.deviceList.some(d => d.libDevId === 'GND');
            if (!hasVcc) {
                current.deviceList.push(makeDeviceInst(IdUtil.generate('inst'), 'VCC', 'VCC', 60, 80, 0, stringMap1('voltage', '5.0')));
                fixed++;
            }
            if (!hasGnd) {
                current.deviceList.push(makeDeviceInst(IdUtil.generate('inst'), 'GND', 'GND', 60, 500, 0, new Map()));
                fixed++;
            }
        }
        // 修复 1b: 非 MCU 浮空电容 → 直接删除
        const orphanCaps = errors.filter(e => e.type === 'floating_pin' && e.desc.indexOf('浮空电容') >= 0 && e.targetUuid);
        if (orphanCaps.length > 0) {
            const drop = new Set(orphanCaps.map(e => e.targetUuid as string));
            const before = current.deviceList.length;
            current.deviceList = current.deviceList.filter(d => !drop.has(d.instUuid));
            if (current.deviceList.length < before) {
                fixed += before - current.deviceList.length;
                Logger.info('PostGenValidator', `[FIX] removed ${before - current.deviceList.length} floating optional caps`);
            }
        }
        // 修复 2: 仅「缺 RELAY_SPDT」才整网 Semantic 重建（触点拓扑 LLM 不可能凭空编出）；
        // 其他仪器错误（浮空/短路/读数为0）留给 AI self-review fix loop 处理，避免清空已成功的 LLM net_plan。
        const instErrors = errors.filter(e => e.type === 'instrument_topo');
        const relayMissing = instErrors.filter(e => e.desc.indexOf('缺少 RELAY_SPDT') >= 0);
        const otherInstErrors = instErrors.filter(e => e.desc.indexOf('缺少 RELAY_SPDT') < 0);
        if (relayMissing.length > 0) {
            Logger.info('PostGenValidator', `[FIX] relay missing — rebuilding nets for SPDT topology`);
            try {
                const clone = this.deepClone(current);
                clone.netList = [];
                clone.netLabelList = [];
                clone.wireList = [];
                const semResult = new SemanticNetBuilder(this.library).build(clone);
                current = semResult.topology;
                fixed++;
                const routeResult = this.wiringEngine.routeUntilClean(current, ConstrainedWiringEngine.defaultConstraints(current), undefined, undefined, 3);
                current.wireList = routeResult.routeLines;
                fixed++;
            }
            catch (_e) {
                Logger.warn('PostGenValidator', '[FIX] SemanticNetBuilder rebuild failed');
            }
        }
        else if (otherInstErrors.length > 0) {
            Logger.info('PostGenValidator', `[FIX] instrument errors=${otherInstErrors.length} ` +
                `[${otherInstErrors.map(e => e.desc).join('; ')}] — deferred to AI fix loop, skip Semantic wipe`);
        }
        // 修复 3+4: 导线碰撞/重叠/引脚接近 → 重新布线
        const routeErrors = errors.filter(e => e.type === 'wire_body' || e.type === 'wire_cross' || e.type === 'pin_proximity');
        if (routeErrors.length > 0 && relayMissing.length === 0) {
            Logger.info('PostGenValidator', `[FIX] wire issues=${routeErrors.length}, re-routing`);
            const routeResult = this.wiringEngine.routeUntilClean(current, ConstrainedWiringEngine.defaultConstraints(current), undefined, undefined, 3);
            current.wireList = routeResult.routeLines;
            // 仍穿区的网 → 标号 stub，避免反复 A* 失败
            const stillBad = this.wiringEngine.findViolatingNetUuids(current, current.wireList);
            if (stillBad.size > 0) {
                this.wiringEngine.demoteNetsToLabelStubs(current, stillBad);
                fixed++;
            }
            fixed++;
        }
        else if (routeErrors.length > 0 && relayMissing.length > 0) {
            Logger.info('PostGenValidator', `[FIX] wire issues=${routeErrors.length} deferred after instrument rebuild+route`);
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
