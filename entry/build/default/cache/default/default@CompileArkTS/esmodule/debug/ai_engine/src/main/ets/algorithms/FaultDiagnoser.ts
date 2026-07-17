import { ErcSeverity, ErcRuleType, IdUtil, paramMapGet, NetType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ErcViolation, Net } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const MCU_IDS = new Set([
    'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
    'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);
const VCC_NAMES = new Set(['VCC', 'VDD', '3V3', '3.3V', '5V', 'VCC_5V', 'VCC_3V3']);
const GND_NAMES = new Set(['GND', 'VSS', '0V', 'GROUND', 'DGND', 'AGND']);
export class FaultDiagnoser {
    static diagnose(schematic: SchematicDocument): ErcViolation[] {
        const violations = ErcEngine.run(schematic, MCU_IDS);
        // L1: 致命错误
        const paramViolations = FaultDiagnoser.checkParamMismatch(schematic);
        for (let i = 0; i < paramViolations.length; i++) {
            violations.push(paramViolations[i]);
        }
        const ioViolations = FaultDiagnoser.checkIoRisks(schematic);
        for (let i = 0; i < ioViolations.length; i++) {
            violations.push(ioViolations[i]);
        }
        const shortViolations = FaultDiagnoser.checkShortCircuits(schematic);
        for (let i = 0; i < shortViolations.length; i++) {
            violations.push(shortViolations[i]);
        }
        const nameAbuseViolations = FaultDiagnoser.checkPowerNameAbuse(schematic);
        for (let i = 0; i < nameAbuseViolations.length; i++) {
            violations.push(nameAbuseViolations[i]);
        }
        const fullFloatViolations = FaultDiagnoser.checkFullyFloatingComponent(schematic);
        for (let i = 0; i < fullFloatViolations.length; i++) {
            violations.push(fullFloatViolations[i]);
        }
        // L2: 严重警告
        const floatingViolations = FaultDiagnoser.checkFloatingPins(schematic);
        for (let i = 0; i < floatingViolations.length; i++) {
            violations.push(floatingViolations[i]);
        }
        const powerViolations = FaultDiagnoser.checkPowerIntegrity(schematic);
        for (let i = 0; i < powerViolations.length; i++) {
            violations.push(powerViolations[i]);
        }
        const fanoutViolations = FaultDiagnoser.checkFanout(schematic);
        for (let i = 0; i < fanoutViolations.length; i++) {
            violations.push(fanoutViolations[i]);
        }
        const topoViolations = FaultDiagnoser.checkInstrumentTopology(schematic);
        for (let i = 0; i < topoViolations.length; i++) {
            violations.push(topoViolations[i]);
        }
        const gpioPowerViolations = FaultDiagnoser.checkGpioDirectPower(schematic);
        for (let i = 0; i < gpioPowerViolations.length; i++) {
            violations.push(gpioPowerViolations[i]);
        }
        // L3: 建议
        const capVoltageViolations = FaultDiagnoser.checkCapVoltage(schematic);
        for (let i = 0; i < capVoltageViolations.length; i++) {
            violations.push(capVoltageViolations[i]);
        }
        return violations;
    }
    // ---- L1: 致命错误 ----
    private static checkParamMismatch(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (const comp of doc.components) {
            if (comp.libraryId.startsWith('R_')) {
                const val = paramMapGet(comp.parameters, 'value', comp.libraryId.replace('R_', ''));
                // LED 限流电阻检查
                const ledsNearby = doc.components.filter(c => c.libraryId.includes('LED') &&
                    Math.abs(c.position.x - comp.position.x) < 200 &&
                    Math.abs(c.position.y - comp.position.y) < 150);
                if (ledsNearby.length > 0) {
                    const ohmStr = val.replace(/[kKmMgG]/, '000').replace(/[^0-9]/g, '');
                    const ohm = parseInt(ohmStr) || 0;
                    if (ohm > 10000) {
                        result.push({
                            id: IdUtil.generate('erc'),
                            severity: ErcSeverity.ERROR,
                            ruleType: ErcRuleType.PARAM_MISMATCH,
                            message: `${comp.refDes}(${val}) 作为 LED 限流电阻过大，LED 可能不亮`,
                            componentId: comp.id,
                            fixSuggestion: 'LED 限流电阻建议 220Ω~1kΩ，推荐 R_330'
                        });
                    }
                    else if (ohm < 100 && ohm > 0) {
                        result.push({
                            id: IdUtil.generate('erc'),
                            severity: ErcSeverity.ERROR,
                            ruleType: ErcRuleType.PARAM_MISMATCH,
                            message: `${comp.refDes}(${val}) 作为 LED 限流电阻过小，LED 可能烧毁`,
                            componentId: comp.id,
                            fixSuggestion: 'LED 限流电阻不要小于 150Ω'
                        });
                    }
                }
            }
            // 电容耐压检查
            const voltageParam = comp.parameters.get('voltage');
            if (comp.libraryId.startsWith('C_') && voltageParam !== undefined) {
                const v = parseInt(voltageParam);
                if (v < 16 && v > 0) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `${comp.refDes} 耐压 ${v}V 可能不足`,
                        componentId: comp.id,
                        fixSuggestion: '电源去耦电容建议 25V 以上耐压'
                    });
                }
            }
        }
        return result;
    }
    private static checkIoRisks(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const leds = doc.components.filter(c => c.libraryId.includes('LED'));
        const resistors = doc.components.filter(c => c.libraryId.startsWith('R_'));
        for (const led of leds) {
            // 检查是否在同一个 net 中有串联电阻
            const ledNets = doc.nets.filter(n => n.pinIds.some(p => p.includes(led.id)));
            let hasSeriesR = false;
            for (const net of ledNets) {
                for (const pinRef of net.pinIds) {
                    if (resistors.some(r => pinRef.includes(r.id))) {
                        hasSeriesR = true;
                        break;
                    }
                }
                if (hasSeriesR) {
                    break;
                }
            }
            if (!hasSeriesR) {
                // 再按距离判断
                const hasResistor = resistors.some(r => {
                    const dx = Math.abs(r.position.x - led.position.x);
                    const dy = Math.abs(r.position.y - led.position.y);
                    return dx < 100 && dy < 100;
                });
                if (!hasResistor) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.ERROR,
                        ruleType: ErcRuleType.IO_OVERCURRENT,
                        message: `LED ${led.refDes} 缺少限流电阻，可能烧毁`,
                        componentId: led.id,
                        fixSuggestion: '串联 220Ω~1kΩ 电阻（推荐 R_330）'
                    });
                }
            }
        }
        return result;
    }
    /** VCC-GND 短路检测 */
    private static checkShortCircuits(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (const net of doc.nets) {
            const compIds = net.pinIds.map(pr => pr.split(':')[0]);
            const uniqueComps: string[] = [];
            for (const id of compIds) {
                if (!uniqueComps.includes(id)) {
                    uniqueComps.push(id);
                }
            }
            const compLibIds = uniqueComps
                .map(id => doc.components.find(c => c.id === id)?.libraryId ?? '')
                .filter(id => id.length > 0);
            const hasVcc = compLibIds.some(id => VCC_NAMES.has(id.toUpperCase()) || id === 'VCC' ||
                id.startsWith('LM78') || id.startsWith('AMS'));
            const hasGnd = compLibIds.some(id => GND_NAMES.has(id.toUpperCase()) || id === 'GND');
            if (hasVcc && hasGnd) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: `网络 "${net.name}" 同时包含 VCC 和 GND — 可能短路！`,
                    netId: net.id,
                    fixSuggestion: '检查是否误将 VCC 和 GND 连到同一网络'
                });
            }
        }
        return result;
    }
    // ---- L2: 严重警告 ----
    /** 浮空引脚检测 */
    private static checkFloatingPins(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const connectedPinRefs = new Set<string>();
        for (const net of doc.nets) {
            for (const pr of net.pinIds) {
                connectedPinRefs.add(pr);
            }
        }
        for (const comp of doc.components) {
            // 跳过电源符号
            if (comp.libraryId === 'VCC' || comp.libraryId === 'GND' || comp.libraryId === 'VAC') {
                continue;
            }
            // MCU: 检查关键引脚
            if (MCU_IDS.has(comp.libraryId)) {
                let hasPower = false;
                for (const pr of connectedPinRefs) {
                    if (pr.startsWith(comp.id)) {
                        hasPower = true;
                        break;
                    }
                }
                if (!hasPower) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.ERROR,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `MCU ${comp.refDes} 似乎无任何引脚连接`,
                        componentId: comp.id,
                        fixSuggestion: '至少需要连接 VCC、GND、RST、晶振'
                    });
                }
            }
            // 运放: 检查反馈
            if (comp.libraryId === 'LM358' || comp.libraryId === 'UA741' ||
                comp.libraryId === 'TL082') {
                const compNets = doc.nets.filter(n => n.pinIds.some(p => p.startsWith(comp.id)));
                const hasFeedback = compNets.some(n => {
                    const pins = n.pinIds.filter(p => p.startsWith(comp.id));
                    const hasOut = pins.some(p => p.includes('OUT'));
                    const hasInMinus = pins.some(p => p.includes('IN-'));
                    return hasOut && hasInMinus;
                });
                if (!hasFeedback) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.ERROR,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `运放 ${comp.refDes} 可能开环（无反馈路径）`,
                        componentId: comp.id,
                        fixSuggestion: '添加反馈电阻连接 OUT 到 IN-'
                    });
                }
            }
        }
        return result;
    }
    /** 电源完整性检查 */
    private static checkPowerIntegrity(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const mcus = doc.components.filter(c => MCU_IDS.has(c.libraryId));
        const caps = doc.components.filter(c => c.libraryId.startsWith('C_'));
        for (const mcu of mcus) {
            // 检查去耦电容数量
            const nearbyCaps = caps.filter(c => {
                const dx = Math.abs(c.position.x - mcu.position.x);
                const dy = Math.abs(c.position.y - mcu.position.y);
                return dx < 200 && dy < 200;
            });
            const neededMin = mcu.libraryId.startsWith('STM32') ? 3 : 1;
            if (nearbyCaps.length < neededMin) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.WARNING,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: `MCU ${mcu.refDes} 去耦电容不足(${nearbyCaps.length}<${neededMin})`,
                    componentId: mcu.id,
                    fixSuggestion: `每个 VDD 引脚需配 1 个 C_100nF（共需≥${neededMin}）`
                });
            }
        }
        // 检查电源入口大电容
        const vccComp = doc.components.find(c => c.libraryId === 'VCC');
        if (vccComp !== undefined) {
            const hasBulkCap = caps.some(c => {
                const cVal = c.libraryId.toUpperCase();
                return (cVal.includes('10U') || cVal.includes('100U')) &&
                    Math.abs(c.position.x - vccComp.position.x) < 300;
            });
            if (!hasBulkCap) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.WARNING,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: '电源入口缺少电解大电容(≥10uF)',
                    componentId: vccComp.id,
                    fixSuggestion: 'VCC 入口并联 C_10uF 或 C_100uF'
                });
            }
        }
        return result;
    }
    /** 扇出过载检测 */
    private static checkFanout(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (const net of doc.nets) {
            const loadCount = net.pinIds.length;
            // 单个 GPIO 驱动 > 6 个负载
            if (loadCount > 6) {
                // 检查是否为电源网络
                if (!VCC_NAMES.has(net.name.toUpperCase()) &&
                    !GND_NAMES.has(net.name.toUpperCase())) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `网络 "${net.name}" 连接 ${loadCount} 个引脚，可能存在扇出过载`,
                        netId: net.id,
                        fixSuggestion: '使用缓冲器(74HC04)或减少负载数'
                    });
                }
            }
        }
        return result;
    }
    // ---- L2.5: 仪器拓扑校验 ----
    /**
     * 仪器拓扑校验 — 防止电流表并联、电压表同节点等接线错误
     *
     * 核心检测:
     *  1. 电流表必须在串联支路中: VCC→I+→I-→负载, 而非 I+→VCC, I-→负载 (并联)
     *  2. 多块电压表不应全部测量同一节点对
     *  3. 电流路径不得绕过测量仪器
     */
    private static checkInstrumentTopology(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const ammeters = doc.components.filter(c => c.libraryId === 'AMMETER_DC');
        const voltmeters = doc.components.filter(c => c.libraryId === 'VOLTMETER_DC' || c.libraryId === 'VIRTUAL_METER');
        // ---- 电流表串联校验 ----
        for (const am of ammeters) {
            const iPlusNet = doc.nets.find(n => n.pinIds.some(p => p.startsWith(am.id) && p.includes('I+')));
            const iMinusNet = doc.nets.find(n => n.pinIds.some(p => p.startsWith(am.id) && p.includes('I-')));
            if (iPlusNet === undefined || iMinusNet === undefined) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.UNCONNECTED_PIN,
                    message: `电流表 ${am.refDes} 引脚未完全连接`,
                    componentId: am.id,
                    fixSuggestion: 'I+ 接 VCC, I- 接负载电阻'
                });
                continue;
            }
            // 检1: I+ 和 I- 必须在不同网络 (串联), 不能在同一网络 (并联短路)
            if (iPlusNet.id === iMinusNet.id) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: `电流表 ${am.refDes} I+/I- 在同一网络 — 短路！应为串联`,
                    componentId: am.id,
                    fixSuggestion: '电流表必须串联: VCC→I+→I-→负载, I+/I- 分属不同网络'
                });
                continue;
            }
            // 检2: I+ 网络必须包含 VCC (或电源), I- 网络必须包含负载电阻
            const iPlusComps = FaultDiagnoser.netComponentIds(iPlusNet, doc);
            const iMinusComps = FaultDiagnoser.netComponentIds(iMinusNet, doc);
            const hasVccOnPlus = iPlusComps.some(id => {
                const c = doc.components.find(x => x.id === id);
                return c !== undefined && (c.libraryId === 'VCC' || VCC_NAMES.has(c.libraryId.toUpperCase()));
            });
            const hasLoadOnMinus = iMinusComps.some(id => {
                const c = doc.components.find(x => x.id === id);
                return c !== undefined && (c.libraryId.startsWith('R_') || c.libraryId.startsWith('LED_'));
            });
            if (!hasVccOnPlus) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: `电流表 ${am.refDes} I+ 未接 VCC — 可能未串联在电源回路`,
                    componentId: am.id,
                    fixSuggestion: 'I+ 应连接 VCC 或电源正极'
                });
            }
            if (!hasLoadOnMinus && iMinusComps.length > 0) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: `电流表 ${am.refDes} I- 未接负载 — 电流未流经测量器件`,
                    componentId: am.id,
                    fixSuggestion: 'I- 应连接负载电阻，使电流流经电流表后进入负载'
                });
            }
        }
        // ---- 电压表同节点检测 ----
        if (voltmeters.length >= 2) {
            const vmNodePairs: string[] = [];
            for (const vm of voltmeters) {
                const vPlusNet = doc.nets.find(n => n.pinIds.some(p => p.startsWith(vm.id) && (p.includes('V+') || p.includes('V'))));
                const comNet = doc.nets.find(n => n.pinIds.some(p => p.startsWith(vm.id) && p.includes('COM')));
                if (vPlusNet !== undefined && comNet !== undefined) {
                    vmNodePairs.push(`${vPlusNet.id}:${comNet.id}`);
                }
            }
            // 检测是否所有电压表测量同一节点对
            if (vmNodePairs.length >= 2) {
                const firstPair = vmNodePairs[0];
                let allSame = true;
                for (let i = 1; i < vmNodePairs.length; i++) {
                    if (vmNodePairs[i] !== firstPair) {
                        allSame = false;
                        break;
                    }
                }
                if (allSame && vmNodePairs[0].length > 0) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.ERROR,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `${voltmeters.length} 块电压表全部测量同一节点对 — 应分布在分压链不同节点`,
                        fixSuggestion: '电压表应分别测量不同电阻的压降 (VCC↔SENSE 和 SENSE↔GND)'
                    });
                }
            }
        }
        // ---- 电流路径完整性 ----
        // 检测: VCC 是否直接连到地 (绕过所有负载)
        const vccNets = doc.nets.filter(n => n.name.toUpperCase() === 'VCC');
        const gndNets = doc.nets.filter(n => n.name.toUpperCase() === 'GND' || n.name === 'GND');
        for (const vn of vccNets) {
            for (const gn of gndNets) {
                if (vn.id === gn.id) {
                    continue; // 同一网络即短路，由 checkShortCircuits 处理
                }
                const vnComps = FaultDiagnoser.netComponentIds(vn, doc);
                const gnComps = FaultDiagnoser.netComponentIds(gn, doc);
                // VCC 和 GND 网络共享同一电阻 → 该电阻跨接 VCC-GND (正常)
                // VCC 网络无电阻直接连到 GND 网络的器件 → 异常
                const hasResistorBetween = vnComps.some(id => {
                    const c = doc.components.find(x => x.id === id);
                    return c !== undefined && c.libraryId.startsWith('R_');
                });
                const gnHasLoad = gnComps.some(id => {
                    const c = doc.components.find(x => x.id === id);
                    return c !== undefined && (c.libraryId.startsWith('R_') || c.libraryId.startsWith('LED_'));
                });
                if (!hasResistorBetween && !gnHasLoad && vnComps.length > 0) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: 'VCC 与 GND 之间无负载电阻 — 可能存在电流直通路径',
                        fixSuggestion: '确保 VCC 与 GND 之间有分压电阻或负载'
                    });
                }
            }
        }
        return result;
    }
    /** 提取网络中所有器件 ID */
    private static netComponentIds(net: Net, doc: SchematicDocument): string[] {
        const ids: string[] = [];
        for (const pr of net.pinIds) {
            const compId = pr.split(':')[0];
            if (ids.indexOf(compId) < 0) {
                ids.push(compId);
            }
        }
        return ids;
    }
    // ---- L2.6: 命名违规 + 全浮空器件 + GPIO直连电源 ----
    /** 信号网络使用保留电源名 → 致命错误 */
    private static checkPowerNameAbuse(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const reserved = new Set(['VCC', 'VDD', 'GND', 'VSS', '3V3', '3.3V', '5V', '12V']);
        for (const net of doc.nets) {
            const upper = net.name.toUpperCase();
            if (reserved.has(upper) && net.type !== NetType.POWER && net.type !== NetType.GROUND) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.PARAM_MISMATCH,
                    message: `信号网络 "${net.name}" 使用了保留电源名 — 将导致仿真 Netlist 错误合并`,
                    netId: net.id,
                    fixSuggestion: `将网络名改为 "${net.name}_SIG" 或其他描述性名称`
                });
            }
        }
        return result;
    }
    /** 器件完全无连接 → 致命错误 */
    private static checkFullyFloatingComponent(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const skipIds = new Set(['VCC', 'GND', 'VAC']);
        for (const comp of doc.components) {
            if (skipIds.has(comp.libraryId)) {
                continue;
            }
            let connected = false;
            for (const net of doc.nets) {
                for (const pr of net.pinIds) {
                    if (pr.startsWith(comp.id)) {
                        connected = true;
                        break;
                    }
                }
                if (connected) {
                    break;
                }
            }
            if (!connected) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.UNCONNECTED_PIN,
                    message: `器件 ${comp.refDes}(${comp.libraryId}) 完全未连接 — 无效器件`,
                    componentId: comp.id,
                    fixSuggestion: '连接该器件到电路或从设计中移除'
                });
            }
        }
        return result;
    }
    /** GPIO 直连 VCC/GND 检测 — 推挽输出接电源可能导致短路 */
    private static checkGpioDirectPower(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const mcus = doc.components.filter(c => MCU_IDS.has(c.libraryId));
        if (mcus.length === 0) {
            return result;
        }
        for (const mcu of mcus) {
            const mcuNets = doc.nets.filter(n => n.pinIds.some(p => p.startsWith(mcu.id)));
            for (const net of mcuNets) {
                const isPowerNet = VCC_NAMES.has(net.name.toUpperCase()) ||
                    GND_NAMES.has(net.name.toUpperCase());
                if (!isPowerNet) {
                    continue;
                }
                // 找出该网络中 MCU 的引脚
                const mcuPins = net.pinIds.filter(p => p.startsWith(mcu.id));
                for (const pr of mcuPins) {
                    const pinId = pr.split(':')[1] ?? '';
                    // 跳过明显的电源引脚
                    const upperPin = pinId.toUpperCase();
                    if (upperPin.includes('VDD') || upperPin.includes('VCC') ||
                        upperPin.includes('VSS') || upperPin.includes('GND') ||
                        upperPin.includes('AVDD') || upperPin.includes('AVSS') ||
                        upperPin === 'EA' || upperPin === 'BOOT0') {
                        continue;
                    }
                    // 检测 GPIO/IO 引脚连接到电源
                    if (upperPin.startsWith('P') || upperPin.startsWith('PA') ||
                        upperPin.startsWith('PB') || upperPin.startsWith('PC') ||
                        upperPin.startsWith('PD') || upperPin.startsWith('PE') ||
                        upperPin.includes('GPIO')) {
                        result.push({
                            id: IdUtil.generate('erc'),
                            severity: ErcSeverity.ERROR,
                            ruleType: ErcRuleType.IO_OVERCURRENT,
                            message: `MCU ${mcu.refDes} 引脚 ${pinId} 直连电源 "${net.name}" — GPIO可能烧毁`,
                            componentId: mcu.id,
                            fixSuggestion: 'GPIO 通过限流电阻(≥330Ω)连接，或配置为开漏模式'
                        });
                    }
                }
            }
        }
        return result;
    }
    // ---- L3: 建议 ----
    private static checkCapVoltage(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (const comp of doc.components) {
            if (comp.libraryId.startsWith('C_')) {
                const voltageStr = comp.parameters.get('voltage');
                if (voltageStr !== undefined) {
                    const v = parseInt(voltageStr);
                    // 电源去耦需要至少 2x 余量
                    const isDecoupling = doc.components.some(c => MCU_IDS.has(c.libraryId) &&
                        Math.abs(c.position.x - comp.position.x) < 100);
                    if (isDecoupling && v > 0 && v < 10) {
                        result.push({
                            id: IdUtil.generate('erc'),
                            severity: ErcSeverity.INFO,
                            ruleType: ErcRuleType.PARAM_MISMATCH,
                            message: `${comp.refDes} 耐压 ${v}V 作为去耦电容余量不足`,
                            componentId: comp.id,
                            fixSuggestion: '推荐 25V 以上耐压'
                        });
                    }
                }
            }
        }
        return result;
    }
}
