import { TopologyAdapter, NetType, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, SchematicDocument, ComponentInstance, DevicePinMeta } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary } from 'component_library';
import { TemplateSchematicKit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
import type { PinSpec } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
export interface SemanticNetBuildResult {
    topology: SchTopology;
    summary: string;
    wiredNets: number;
    instrumentLinks: number;
    addedSymbols: number;
    autoFixes: string[];
}
interface SignalHub {
    net: string;
    pin: PinSpec;
}
interface OriginPoint {
    x: number;
    y: number;
}
interface RelayLedWireResult {
    wired: boolean;
    added: number;
}
interface DividerNodePair {
    high: string;
    low: string;
    comp: ComponentInstance;
}
/**
 * 分压链拓扑 — 协调分压器与仪器的统一接线计划
 *
 * 电路示例: VCC → [Ammeter?] → R1 → SENSE → R2 → GND
 *   nodes[0]="VCC", nodes[1]="SENSE" (或 "VCC_AM"), nodes[2]="GND"
 *
 * 核心约束:
 *  - 电流表必须在串联支路中 (VCC→I+→I-→R1, 而非并联)
 *  - 电压表分布在不同节点对上 (各测不同电阻的压降)
 */
interface DividerTopology {
    /** 分压链上的器件序列 [R1, R2, ...] 或 [R1, sensor, ...] */
    chain: ComponentInstance[];
    /** 链上各节点的网络名，nodes.length === chain.length + 1 */
    nodes: string[];
    /** 电流表器件 (若有) */
    ammeterComp: ComponentInstance | null;
    /** 电流表输出网络 (I- → R1.1)，即 VCC 经电流表后的有效 VCC */
    postAmmeterNet: string;
}
// ---- 引脚语义别名表 ----
const POWER_ALIASES: string[][] = [
    ['VCC', 'VDD', 'AVDD', 'VCCIO', 'VREF+', 'V+'],
    ['GND', 'VSS', 'AVSS', 'VSSA', 'VREF-', 'V-']
];
const RST_ALIASES: string[] = ['RST', 'RESET', 'NRST', 'RST_N', 'MCLR'];
const XTAL_IN_ALIASES: string[] = ['OSC_IN', 'XTAL1', 'XIN', 'HSE_IN', 'XTAL_IN', 'X1'];
const XTAL_OUT_ALIASES: string[] = ['OSC_OUT', 'XTAL2', 'XOUT', 'HSE_OUT', 'XTAL_OUT', 'X2'];
const BOOT0_ALIASES: string[] = ['BOOT0', 'BOOT_0', 'BOOT'];
const VCAP_ALIASES: string[] = ['VCAP', 'VCORE', 'VDD_CORE'];
const UART_TX_ALIASES: string[] = ['TX', 'TXD', 'UART_TX', 'USART_TX', 'USART1_TX'];
const UART_RX_ALIASES: string[] = ['RX', 'RXD', 'UART_RX', 'USART_RX', 'USART1_RX'];
const I2C_SCL_ALIASES: string[] = ['SCL', 'I2C_SCL', 'I2C1_SCL'];
const I2C_SDA_ALIASES: string[] = ['SDA', 'I2C_SDA', 'I2C1_SDA'];
const SWCLK_ALIASES: string[] = ['SWCLK', 'TCK', 'SWD_CLK'];
const SWDIO_ALIASES: string[] = ['SWDIO', 'TMS', 'SWD_IO'];
export class SemanticNetBuilder {
    private library: IComponentLibrary;
    constructor(library: IComponentLibrary) {
        this.library = library;
    }
    build(topo: SchTopology): SemanticNetBuildResult {
        const doc = TopologyAdapter.fromTopology(topo);
        let addedSymbols = 0;
        let instrumentLinks = 0;
        const notes: string[] = [];
        const autoFixes: string[] = [];
        // 确保有 VCC/GND 符号
        let vcc = SemanticNetBuilder.findByLib(doc, (id) => id === 'VCC');
        let gnd = SemanticNetBuilder.findByLib(doc, (id) => id === 'GND');
        if (vcc === null) {
            const origin = SemanticNetBuilder.contentOrigin(doc);
            vcc = TemplateSchematicKit.place(doc, 'VCC', 'VCC1', { x: origin.x - 80, y: origin.y - 40 });
            addedSymbols++;
            autoFixes.push('补放 VCC 符号');
        }
        if (gnd === null) {
            const origin = SemanticNetBuilder.contentOrigin(doc);
            gnd = TemplateSchematicKit.place(doc, 'GND', 'GND1', { x: origin.x - 80, y: origin.y + 80 });
            addedSymbols++;
            autoFixes.push('补放 GND 符号');
        }
        const mcu = SemanticNetBuilder.findByLib(doc, (id) => id.startsWith('STM32') || id.startsWith('AT89') || id.startsWith('STC'));
        const caps = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('C_'));
        const resistors = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('R_'));
        const leds = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('LED_'));
        const crystals = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('XTAL_'));
        if (mcu !== null && vcc !== null && gnd !== null) {
            const meta = this.library.getDeviceMeta(mcu.libraryId);
            const pinList = meta.success && meta.data ? meta.data.pin_list : [];
            const isStm32 = mcu.libraryId.startsWith('STM32');
            const is8051 = mcu.libraryId.startsWith('AT89') || mcu.libraryId.startsWith('STC');
            // ---- 动态解析电源引脚 ----
            const vddPins = this.resolvePins(pinList, POWER_ALIASES[0]);
            const vssPins = this.resolvePins(pinList, POWER_ALIASES[1]);
            const rstPin = this.resolvePin(pinList, RST_ALIASES) ?? '1';
            // ---- 连接所有 VDD/VSS ----
            // 去耦电容：每个 VDD 配一个 100nF
            const decCaps: ComponentInstance[] = [];
            for (let vi = 0; vi < vddPins.length; vi++) {
                let c: ComponentInstance | null = null;
                // 找一个未使用的 100nF 电容
                for (let ci = 0; ci < caps.length; ci++) {
                    const capId = caps[ci].libraryId;
                    if (capId.includes('100') && capId.includes('n') && !decCaps.includes(caps[ci])) {
                        c = caps[ci];
                        break;
                    }
                }
                if (c === null) {
                    // 没有足够的去耦电容，补放
                    const xOff = mcu.position.x + 60 + vi * 30;
                    const yOff = mcu.position.y - 40;
                    c = TemplateSchematicKit.place(doc, 'C_100nF', `C${caps.length + vi + 1}`, { x: xOff, y: yOff });
                    addedSymbols++;
                    autoFixes.push(`补放 C_100nF 为 VDD${vi + 1} 去耦`);
                }
                decCaps.push(c);
                // VDD → VCC 网络
                TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: mcu, pinId: vddPins[vi], pinName: vddPins[vi] },
                    { comp: c, pinId: '1', pinName: '1' }
                ]);
                TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                    { comp: gnd, pinId: '1', pinName: 'GND' },
                    { comp: c, pinId: '2', pinName: '2' }
                ]);
            }
            notes.push(`MCU ${mcu.refDes}: 连接 ${vddPins.length} 个 VDD + 去耦`);
            // ---- 连接所有 VSS ----
            for (let si = 0; si < vssPins.length; si++) {
                TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                    { comp: gnd, pinId: '1', pinName: 'GND' },
                    { comp: mcu, pinId: vssPins[si], pinName: vssPins[si] }
                ]);
            }
            if (vssPins.length > 1) {
                notes.push(`连接 ${vssPins.length} 个 GND 引脚`);
            }
            // ---- 复位引脚: 上拉 10kΩ 到 VCC ----
            const rRst = resistors.length > 0 ? resistors[0] : null;
            if (rRst !== null) {
                const rstNearPin2 = is8051; // 8051 的 RST 布局特殊
                const rstRPin = rstNearPin2 ? '2' : '1';
                const vccRPin = rstNearPin2 ? '1' : '2';
                const nrstNetId = TemplateSchematicKit.join(doc, 'NRST', NetType.SIGNAL, [
                    { comp: rRst, pinId: rstRPin, pinName: rstRPin },
                    { comp: mcu, pinId: rstPin, pinName: rstPin }
                ]);
                if (nrstNetId.length > 0 && !doc.netLabels.some(l => l.text === 'NRST')) {
                    const rstPos = TemplateSchematicKit.pinWorld(mcu, rstPin, rstPin);
                    TemplateSchematicKit.netLabel(doc, nrstNetId, 'NRST', { x: rstPos.x - 24, y: rstPos.y - 10 });
                }
                TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: rRst, pinId: vccRPin, pinName: vccRPin }
                ]);
                notes.push(`NRST 上拉: ${rRst.refDes}→${mcu.refDes}.${rstPin}`);
            }
            else {
                autoFixes.push('缺少复位上拉电阻');
            }
            // ---- BOOT0 接地 (STM32) ----
            if (isStm32) {
                const boot0Pin = this.resolvePin(pinList, BOOT0_ALIASES);
                if (boot0Pin !== null) {
                    TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                        { comp: gnd, pinId: '1', pinName: 'GND' },
                        { comp: mcu, pinId: boot0Pin, pinName: boot0Pin }
                    ]);
                    notes.push(`BOOT0(${boot0Pin})→GND`);
                }
            }
            // ---- EA 接 VCC (8051) ----
            if (is8051) {
                const eaPin = this.resolvePin(pinList, ['EA', 'EA_VPP', 'VPP']);
                if (eaPin !== null) {
                    TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                        { comp: vcc, pinId: '1', pinName: 'VCC' },
                        { comp: mcu, pinId: eaPin, pinName: eaPin }
                    ]);
                    notes.push(`EA(${eaPin})→VCC`);
                }
            }
            // ---- VCAP 去耦 (STM32) ----
            if (isStm32) {
                const vcapPin = this.resolvePin(pinList, VCAP_ALIASES);
                if (vcapPin !== null) {
                    // 补放 1uF 电容做 VCAP 去耦
                    let vcapC = caps.find(c => c.libraryId.includes('1u') && !decCaps.includes(c)) ?? null;
                    if (vcapC === null) {
                        vcapC = TemplateSchematicKit.place(doc, 'C_1uF', `C${caps.length + decCaps.length + 1}`, { x: mcu.position.x + 100, y: mcu.position.y - 60 });
                        addedSymbols++;
                        autoFixes.push('补放 C_1uF 为 VCAP 去耦');
                    }
                    TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                        { comp: gnd, pinId: '1', pinName: 'GND' },
                        { comp: mcu, pinId: vcapPin, pinName: vcapPin },
                        { comp: vcapC, pinId: '2', pinName: '2' }
                    ]);
                    notes.push(`VCAP(${vcapPin})→C_1uF→GND`);
                }
            }
            // ---- VDDA 独立滤波 (STM32) ----
            const vddaPin = this.resolvePin(pinList, ['VDDA', 'AVDD']);
            const vssaPin = this.resolvePin(pinList, ['VSSA', 'AVSS']);
            if (vddaPin !== null && vssaPin !== null) {
                // VDDA→VCC（经 0Ω 等价直接连）, VSSA→GND, 加 100nF+10uF 滤波
                TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: mcu, pinId: vddaPin, pinName: vddaPin }
                ]);
                TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                    { comp: gnd, pinId: '1', pinName: 'GND' },
                    { comp: mcu, pinId: vssaPin, pinName: vssaPin }
                ]);
                // 补 VDDA 滤波电容
                let vddaCaps = caps.filter(c => !decCaps.includes(c) && (c.libraryId.includes('10u') || c.libraryId.includes('100n')));
                for (const vc of vddaCaps.slice(0, 2)) {
                    TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                        { comp: mcu, pinId: vddaPin, pinName: vddaPin },
                        { comp: vc, pinId: '1', pinName: '1' }
                    ]);
                    TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                        { comp: mcu, pinId: vssaPin, pinName: vssaPin },
                        { comp: vc, pinId: '2', pinName: '2' }
                    ]);
                }
                notes.push(`VDDA(${vddaPin})/VSSA(${vssaPin}) 独立滤波`);
            }
        }
        // ---- 去耦电容未进 MCU 电源时并入 VCC/GND ----
        const usedCaps: ComponentInstance[] = [];
        for (const cap of caps) {
            const netPins = doc.nets.filter(n => n.pinIds.some(p => p.includes(cap.id)));
            if (netPins.some(n => n.type === NetType.POWER || n.type === NetType.GROUND)) {
                usedCaps.push(cap);
            }
        }
        for (const c of caps) {
            if (usedCaps.includes(c)) {
                continue;
            }
            if (vcc !== null && gnd !== null) {
                TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: c, pinId: '1', pinName: '1' }
                ]);
                TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                    { comp: gnd, pinId: '1', pinName: 'GND' },
                    { comp: c, pinId: '2', pinName: '2' }
                ]);
            }
        }
        // ═══════════════════════════════════════════════════════════════
        // 阶段 A: 分压链拓扑规划 + 电流表串联嵌入
        // 核心原则: 电流表必须在串联支路中 (VCC→I+→I-→R1)
        //           而非并联在电阻两端
        // v3.1: 移除 mcu===null 限制 — MCU电路中的仪器也需要拓扑感知接线
        // ═══════════════════════════════════════════════════════════════
        let dividerTopo: DividerTopology | null = null;
        const hasInstruments = SemanticNetBuilder.findAllByLib(doc, (id) => id === 'VOLTMETER_DC' || id === 'VIRTUAL_METER' || id === 'AMMETER_DC').length > 0;
        if (vcc !== null && gnd !== null && resistors.length > 0 && leds.length === 0) {
            const sensors = SemanticNetBuilder.findAllByLib(doc, (id) => id === 'LDR' || id === 'HALL_SENSOR' || id === 'DS18B20' ||
                id.indexOf('NTC') >= 0 || id.indexOf('THERM') >= 0);
            dividerTopo = this.buildDividerChain(doc, vcc, gnd, resistors, sensors, notes);
        }
        // ---- LED：优先继电器 SPDT 互斥双色；否则每颗 LED 配对限流电阻 ----
        let dividerWired = dividerTopo !== null;
        const relays = SemanticNetBuilder.findAllByLib(doc, (id) => id === 'RELAY_SPDT' || id.toUpperCase().indexOf('RELAY') >= 0);
        const switches = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('SW_'));
        // 有继电器时建触点网；缺继电器由 AI 选型/自审补齐，此处不硬塞
        let relayLedWired = false;
        if (!dividerWired && leds.length >= 2 && relays.length > 0 && vcc !== null && gnd !== null) {
            const relayRes = this.wireRelaySpdtDualLed(doc, vcc, gnd, relays[0], switches.length > 0 ? switches[0] : null, leds, resistors, notes, autoFixes);
            relayLedWired = relayRes.wired;
            addedSymbols += relayRes.added;
            if (relayLedWired) {
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] relay dual-LED topology: NC=green NO=red coil=${switches.length > 0 ? 'SW' : 'open'}`);
            }
        }
        if (leds.length > 0 && gnd !== null && !dividerWired && !relayLedWired) {
            const usedLedResistors: ComponentInstance[] = [];
            // MCU 复位上拉电阻优先保留，不占用 LED 限流
            const rstResistor = (mcu !== null && resistors.length > 0) ? resistors[0] : null;
            for (let li = 0; li < leds.length; li++) {
                const led = leds[li];
                let rLed: ComponentInstance | null = null;
                for (let i = 0; i < resistors.length; i++) {
                    const cand = resistors[i];
                    if (cand === rstResistor && leds.length < resistors.length) {
                        continue;
                    }
                    if (usedLedResistors.indexOf(cand) >= 0) {
                        continue;
                    }
                    rLed = cand;
                    break;
                }
                if (rLed === null) {
                    const ox = led.position.x - 80;
                    const oy = led.position.y;
                    rLed = TemplateSchematicKit.place(doc, 'R_330', `R_LED${li + 1}`, { x: ox, y: oy });
                    addedSymbols++;
                    autoFixes.push(`补放 ${led.refDes} 限流电阻 R_330`);
                }
                usedLedResistors.push(rLed);
                let drive: PinSpec;
                if (mcu !== null && li === 0) {
                    const meta = this.library.getDeviceMeta(mcu.libraryId);
                    const pinList = meta.success && meta.data ? meta.data.pin_list : [];
                    const gpio = this.resolvePin(pinList, ['GPIO', 'PA0', 'PB0', 'PC13', 'P1', 'P1.0']) ?? 'P1';
                    drive = { comp: mcu, pinId: gpio, pinName: gpio };
                }
                else if (vcc !== null) {
                    drive = { comp: vcc, pinId: '1', pinName: 'VCC' };
                }
                else {
                    drive = { comp: rLed, pinId: '1', pinName: '1' };
                }
                const prefix = leds.length > 1 ? `LED${li + 1}` : 'LED';
                TemplateSchematicKit.ledBranch(doc, drive, { comp: gnd, pinId: '1', pinName: 'GND' }, rLed, led, prefix, mcu !== null ? null : 'VCC', false);
                notes.push(`LED 支路: ${led.refDes}+${rLed.refDes}`);
            }
        }
        // ---- 晶振 + 负载电容 ----
        if (mcu !== null && crystals.length > 0) {
            const xtal = crystals[0];
            const meta = this.library.getDeviceMeta(mcu.libraryId);
            const pinList = meta.success && meta.data ? meta.data.pin_list : [];
            const xtalIn = this.resolvePin(pinList, XTAL_IN_ALIASES) ?? 'P5';
            const xtalOut = this.resolvePin(pinList, XTAL_OUT_ALIASES) ?? 'P6';
            // 确保有负载电容 C_22pF×2
            let c1: ComponentInstance | null = null;
            let c2: ComponentInstance | null = null;
            const leftoverCaps = caps.filter(c => !usedCaps.includes(c));
            if (leftoverCaps.length >= 2) {
                c1 = leftoverCaps[0];
                c2 = leftoverCaps[1];
            }
            else {
                c1 = TemplateSchematicKit.place(doc, 'C_100nF', `C${caps.length + 1}`, { x: xtal.position.x - 40, y: xtal.position.y + 30 });
                c2 = TemplateSchematicKit.place(doc, 'C_100nF', `C${caps.length + 2}`, { x: xtal.position.x + 40, y: xtal.position.y + 30 });
                addedSymbols += 2;
                autoFixes.push('补放晶振负载电容(用 100nF 代替 22pF)');
            }
            TemplateSchematicKit.crystal(doc, mcu, xtal, c1, c2, xtalIn, xtalOut, '', gnd);
            notes.push(`晶振: ${xtal.refDes}→${mcu.refDes}.${xtalIn}/${xtalOut}`);
        }
        // ═══════════════════════════════════════════════════════════════
        // 阶段 B: 仪器连线 — 基于拓扑规划分发
        // 电流表在 buildDividerChain 中已串联嵌入，此处处理电压表/示波器等
        // v3.1: MCU电路中的仪器也在此阶段处理
        // ═══════════════════════════════════════════════════════════════
        if (dividerTopo !== null) {
            // 有分压链拓扑 → 电压表按节点对分发 (各测不同电阻)
            instrumentLinks += this.wireDividerInstruments(doc, dividerTopo, notes);
        }
        else if (vcc !== null && gnd !== null) {
            // 无分压器但有 VCC/GND → 仪器用 signalHub 方式 (含MCU电路)
            const signalHub = SemanticNetBuilder.pickSignalHub(doc, mcu, leds);
            instrumentLinks += this.wireStandaloneInstruments(doc, vcc, gnd, signalHub, notes);
        }
        // 非分压器仪器 (示波器、频率计、UART终端) —— 始终执行
        instrumentLinks += this.wireNonDividerInstruments(doc, vcc, gnd, mcu, notes);
        // ---- I2C 上拉电阻 (检测 I2C 器件并自动加上拉) ----
        this.wireI2cPullups(doc, vcc, resistors, notes, autoFixes);
        // ---- 未连器件规则提示 ----
        this.applyAiWiringRulesHints(doc, notes);
        const outTopo = TopologyAdapter.toTopology(doc);
        outTopo.schUuid = topo.schUuid;
        outTopo.schName = topo.schName.length > 0 ? topo.schName : outTopo.schName;
        outTopo.gridStep = topo.gridStep;
        outTopo.ercErrorList = topo.ercErrorList;
        const wiredNets = doc.nets.filter(n => n.pinIds.length >= 2).length;
        const wireCount = doc.wires.length;
        // ---- 后验: 验证关键连接完整性 ----
        let validationErrors = 0;
        const pinCounts = TemplateSchematicKit.countConnectedPins(doc);
        // 仪器引脚完整性: 确保每个仪器的关键引脚都已入网
        const instrumentPins: [
            string,
            string[]
        ][] = [
            ['AMMETER_DC', ['I+', 'I-']],
            ['VOLTMETER_DC', ['V+', 'COM']],
            ['VIRTUAL_METER', ['V', 'COM']],
            ['OSCILLOSCOPE', ['CH1']],
            ['FREQ_COUNTER', ['IN', 'GND']],
            ['UART_TERMINAL', ['TX', 'RX', 'GND']],
        ];
        for (let ip = 0; ip < instrumentPins.length; ip++) {
            const libId = instrumentPins[ip][0];
            const reqPins = instrumentPins[ip][1];
            const comps = SemanticNetBuilder.findAllByLib(doc, (id) => id === libId);
            for (const comp of comps) {
                for (let rp = 0; rp < reqPins.length; rp++) {
                    const pinId = reqPins[rp];
                    const pinRef = `${comp.id}:${pinId}:${pinId}`;
                    let found = false;
                    for (const net of doc.nets) {
                        if (net.pinIds.some(p => p === pinRef)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        autoFixes.push(`${comp.refDes}.${pinId} 未连接`);
                        validationErrors++;
                    }
                }
            }
        }
        // MCU关键引脚: VCC/GND/RST至少有一个连接
        if (mcu !== null) {
            const mcuConns = pinCounts.get(mcu.id) ?? 0;
            if (mcuConns < 3) {
                autoFixes.push(`MCU ${mcu.refDes} 仅 ${mcuConns} 个引脚连接 (需要≥3)`);
                validationErrors++;
            }
        }
        const summary = `建网 ${wiredNets} 条(≥2脚) · 导线 ${wireCount} · 仪器连线 ${instrumentLinks} · 补符号 ${addedSymbols}` +
            (validationErrors > 0 ? ` · 验证问题 ${validationErrors}` : '') +
            (notes.length > 0 ? `\n  · ${notes.join('\n  · ')}` : '') +
            (autoFixes.length > 0 ? `\n  修复 ${autoFixes.length}: ${autoFixes.join('; ')}` : '');
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] semantic nets≥2=${wiredNets} wires=${wireCount}` +
            ` instr=${instrumentLinks} symbols+=${addedSymbols} fixes=${autoFixes.length}` +
            ` validation=${validationErrors}`);
        Logger.info('SemanticNet', summary);
        return {
            topology: outTopo, summary, wiredNets, instrumentLinks,
            addedSymbols, autoFixes
        };
    }
    // ---- 动态引脚解析 ----
    /** 从 pin_list 中查找匹配语义别名的引脚 ID */
    private resolvePin(pinList: DevicePinMeta[], aliases: string[]): string | null {
        if (pinList.length === 0) {
            return null;
        }
        for (const alias of aliases) {
            const upper = alias.toUpperCase();
            // 精确匹配
            let match = pinList.find(p => (p.pin_label ?? p.pin_id).toUpperCase() === upper);
            if (match) {
                return match.pin_id;
            }
            // 前缀匹配 (VDD 匹配 VDD_1)
            match = pinList.find(p => (p.pin_label ?? p.pin_id).toUpperCase().startsWith(upper));
            if (match) {
                return match.pin_id;
            }
            // 包含匹配
            match = pinList.find(p => (p.pin_label ?? p.pin_id).toUpperCase().includes(upper));
            if (match) {
                return match.pin_id;
            }
        }
        return null;
    }
    /** 从 pin_list 中查找所有匹配语义别名的引脚 ID 列表 */
    private resolvePins(pinList: DevicePinMeta[], aliases: string[]): string[] {
        if (pinList.length === 0) {
            return [];
        }
        const result: string[] = [];
        for (const p of pinList) {
            const upper = (p.pin_label ?? p.pin_id).toUpperCase();
            for (const alias of aliases) {
                const aUpper = alias.toUpperCase();
                if (upper === aUpper || upper.startsWith(aUpper)) {
                    if (!result.includes(p.pin_id)) {
                        result.push(p.pin_id);
                    }
                    break;
                }
            }
        }
        return result;
    }
    // ---- I2C 上拉检测 ----
    /** 检测 I2C 器件 (24C02, OLED 等)，自动补放 4.7kΩ 上拉电阻 */
    private wireI2cPullups(doc: SchematicDocument, vcc: ComponentInstance | null, resistors: ComponentInstance[], notes: string[], autoFixes: string[]): void {
        if (vcc === null) {
            return;
        }
        const i2cDevices = SemanticNetBuilder.findAllByLib(doc, (id) => id === '24C02' || id === 'OLED_12864' || id === 'W25Q64');
        if (i2cDevices.length === 0) {
            // 检查是否有 I2C net (SDA/SCL)
            const hasI2c = doc.nets.some(n => {
                const up = n.name.toUpperCase();
                return up.includes('SDA') || up.includes('SCL') ||
                    up.includes('I2C');
            });
            if (!hasI2c) {
                return;
            }
        }
        // 找未使用的 R_4.7k 或 R_10k
        const usedResistors = new Set<string>();
        for (const net of doc.nets) {
            for (const pinRef of net.pinIds) {
                const parts = pinRef.split(':');
                usedResistors.add(parts[0]);
            }
        }
        let rSda: ComponentInstance | null = null;
        let rScl: ComponentInstance | null = null;
        for (const r of resistors) {
            if (!usedResistors.has(r.id) && r.libraryId.includes('4.7')) {
                if (rSda === null) {
                    rSda = r;
                }
                else if (rScl === null) {
                    rScl = r;
                    break;
                }
            }
        }
        if (rSda === null || rScl === null) {
            // 补放
            if (rSda === null) {
                rSda = TemplateSchematicKit.place(doc, 'R_4.7k', `R${resistors.length + 1}`, { x: 500, y: 100 });
                autoFixes.push('补放 R_4.7k 为 I2C SDA 上拉');
            }
            if (rScl === null) {
                rScl = TemplateSchematicKit.place(doc, 'R_4.7k', `R${resistors.length + 2}`, { x: 500, y: 140 });
                autoFixes.push('补放 R_4.7k 为 I2C SCL 上拉');
            }
        }
        // 上拉到 VCC
        TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
            { comp: vcc, pinId: '1', pinName: 'VCC' },
            { comp: rSda, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
            { comp: vcc, pinId: '1', pinName: 'VCC' },
            { comp: rScl, pinId: '1', pinName: '1' }
        ]);
        notes.push('I2C 上拉: R_4.7k×2→VCC');
    }
    /**
     * RELAY_SPDT 互斥双色指示（对应「打开绿灯 / 闭合红灯」）:
     *   线圈: VCC→SW→coil1 / coil2→GND（无 SW 则线圈浮空留给上层）
     *   COM→GND
     *   NC 支路: VCC→R→LED_GREEN→NC（断开/未吸合亮绿）
     *   NO 支路: VCC→R→LED_RED→NO（闭合/吸合亮红）
     */
    private wireRelaySpdtDualLed(doc: SchematicDocument, vcc: ComponentInstance, gnd: ComponentInstance, relay: ComponentInstance, sw: ComponentInstance | null, leds: ComponentInstance[], resistors: ComponentInstance[], notes: string[], autoFixes: string[]): RelayLedWireResult {
        let added = 0;
        let ledGreen = leds.find(l => l.libraryId === 'LED_GREEN') ?? null;
        let ledRed = leds.find(l => l.libraryId === 'LED_RED') ?? null;
        if (ledGreen === null) {
            ledGreen = leds[0];
        }
        if (ledRed === null) {
            ledRed = leds.length > 1 ? leds[1] : leds[0];
        }
        if (ledGreen === ledRed && leds.length > 1) {
            ledRed = leds[1];
        }
        const usedR: ComponentInstance[] = [];
        const takeR = (tag: string, near: ComponentInstance): ComponentInstance => {
            for (let i = 0; i < resistors.length; i++) {
                if (usedR.indexOf(resistors[i]) < 0) {
                    usedR.push(resistors[i]);
                    return resistors[i];
                }
            }
            const r = TemplateSchematicKit.place(doc, 'R_330', `R_${tag}`, { x: near.position.x - 80, y: near.position.y });
            added++;
            autoFixes.push(`补放 ${tag} 限流电阻 R_330`);
            usedR.push(r);
            return r;
        };
        const rGreen = takeR('NC', ledGreen);
        const rRed = takeR('NO', ledRed);
        // COM → GND
        TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
            { comp: gnd, pinId: '1', pinName: 'GND' },
            { comp: relay, pinId: 'COM', pinName: 'COM' }
        ]);
        // NC: VCC→R→LED_GREEN.A ; LED_GREEN.K→NC
        TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
            { comp: vcc, pinId: '1', pinName: 'VCC' },
            { comp: rGreen, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.series2(doc, 'REL_NC_A', { comp: rGreen, pinId: '2', pinName: '2' }, { comp: ledGreen, pinId: 'A', pinName: 'A' });
        TemplateSchematicKit.join(doc, 'REL_NC', NetType.SIGNAL, [
            { comp: ledGreen, pinId: 'K', pinName: 'K' },
            { comp: relay, pinId: 'NC', pinName: 'NC' }
        ]);
        // NO: VCC→R→LED_RED.A ; LED_RED.K→NO
        TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
            { comp: vcc, pinId: '1', pinName: 'VCC' },
            { comp: rRed, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.series2(doc, 'REL_NO_A', { comp: rRed, pinId: '2', pinName: '2' }, { comp: ledRed, pinId: 'A', pinName: 'A' });
        TemplateSchematicKit.join(doc, 'REL_NO', NetType.SIGNAL, [
            { comp: ledRed, pinId: 'K', pinName: 'K' },
            { comp: relay, pinId: 'NO', pinName: 'NO' }
        ]);
        // 线圈驱动
        if (sw !== null) {
            TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, [
                { comp: vcc, pinId: '1', pinName: 'VCC' },
                { comp: sw, pinId: '1', pinName: '1' }
            ]);
            TemplateSchematicKit.series2(doc, 'REL_COIL_DRV', { comp: sw, pinId: '2', pinName: '2' }, { comp: relay, pinId: '1', pinName: '1' });
            TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                { comp: gnd, pinId: '1', pinName: 'GND' },
                { comp: relay, pinId: '2', pinName: '2' }
            ]);
            notes.push(`继电器互斥LED: SW开→${ledGreen.refDes}@NC 亮; SW闭→${ledRed.refDes}@NO 亮`);
            return { wired: true, added: added };
        }
        // 无 SW：只建触点支路，不半接线圈（避免 PINCONN/仿真误判）
        notes.push(`继电器互斥LED: NC→${ledGreen.refDes} NO→${ledRed.refDes}（缺 SW_PUSH，线圈未驱动）`);
        return { wired: true, added: added };
    }
    // ---- 以下方法保持不变 ----
    /**
     * 构建分压链拓扑 — 拓扑感知型接线，替代旧 wirePassiveDivider
     *
     * 核心改进:
     *  1. 检测电流表 → 自动嵌入串联支路 (VCC→I+→I-→R1)
     *  2. 返回 DividerTopology 供后续电压表分发
     *  3. 支持任意长度的电阻链 (R1→R2→R3→...)
     *
     * 单电阻: VCC─R1─GND
     * 双电阻+电流表: VCC→I+→I-→VCC_AM→R1→SENSE→R2→GND
     * 双电阻无电流表: VCC→R1→SENSE→R2→GND
     */
    private buildDividerChain(doc: SchematicDocument, vcc: ComponentInstance, gnd: ComponentInstance, resistors: ComponentInstance[], sensors: ComponentInstance[], notes: string[]): DividerTopology | null {
        if (resistors.length === 0) {
            return null;
        }
        // 构建链上器件序列
        const chain: ComponentInstance[] = [resistors[0]];
        if (sensors.length > 0) {
            chain.push(sensors[0]);
        }
        else if (resistors.length >= 2) {
            chain.push(resistors[1]);
        }
        // 追加额外电阻
        for (let i = 2; i < resistors.length; i++) {
            chain.push(resistors[i]);
        }
        // 检测电流表
        const ammeter = SemanticNetBuilder.findByLib(doc, (id) => id === 'AMMETER_DC');
        const postAmmeterNet = ammeter !== null ? 'VCC_AM' : 'VCC';
        const nodes: string[] = [postAmmeterNet];
        if (chain.length === 1) {
            // 单电阻: 无分压中点
            const r = chain[0];
            if (ammeter !== null) {
                // 电流表串联: VCC→I+→I-→R.1, R.2→GND
                TemplateSchematicKit.joinByLabel(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: ammeter, pinId: 'I+', pinName: 'I+' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, postAmmeterNet, NetType.POWER, [
                    { comp: ammeter, pinId: 'I-', pinName: 'I-' },
                    { comp: r, pinId: '1', pinName: '1' }
                ]);
            }
            else {
                TemplateSchematicKit.joinWired(doc, postAmmeterNet, NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: r, pinId: '1', pinName: '1' }
                ]);
            }
            TemplateSchematicKit.joinWired(doc, 'GND', NetType.GROUND, [
                { comp: gnd, pinId: '1', pinName: 'GND' },
                { comp: r, pinId: '2', pinName: '2' }
            ]);
            nodes.push('GND');
            notes.push(`单电阻: ${postAmmeterNet}─${r.refDes}─GND` +
                (ammeter !== null ? ` (${ammeter.refDes}串联)` : ''));
        }
        else {
            // 多器件分压链: VCC→[Ammeter]→R1→SENSE→R2→...→GND
            const rTop = chain[0];
            if (ammeter !== null) {
                // 电流表串联在 VCC 与 R1 之间
                TemplateSchematicKit.joinByLabel(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: ammeter, pinId: 'I+', pinName: 'I+' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, postAmmeterNet, NetType.POWER, [
                    { comp: ammeter, pinId: 'I-', pinName: 'I-' },
                    { comp: rTop, pinId: '1', pinName: '1' }
                ]);
            }
            else {
                TemplateSchematicKit.joinWired(doc, postAmmeterNet, NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: rTop, pinId: '1', pinName: '1' }
                ]);
            }
            // 中间节点: 每个链上相邻器件之间生成独立 SENSE 网络
            for (let i = 0; i < chain.length - 1; i++) {
                const nodeNet = chain.length === 2 ? 'SENSE' : `SENSE_${i + 1}`;
                TemplateSchematicKit.joinWired(doc, nodeNet, NetType.SIGNAL, [
                    { comp: chain[i], pinId: '2', pinName: '2' },
                    { comp: chain[i + 1], pinId: '1', pinName: '1' }
                ]);
                nodes.push(nodeNet);
            }
            // 末端接地
            const last = chain[chain.length - 1];
            TemplateSchematicKit.joinWired(doc, 'GND', NetType.GROUND, [
                { comp: gnd, pinId: '1', pinName: 'GND' },
                { comp: last, pinId: '2', pinName: '2' }
            ]);
            nodes.push('GND');
            const chainRefs = chain.map(c => c.refDes).join('─');
            notes.push(`分压链: ${postAmmeterNet}─${chainRefs}─GND nodes=${nodes.join('/')}` +
                (ammeter !== null ? ` (${ammeter.refDes}串联在 VCC 端)` : ''));
        }
        return {
            chain: chain,
            nodes: nodes,
            ammeterComp: ammeter,
            postAmmeterNet: postAmmeterNet
        };
    }
    /**
     * 基于分压链拓扑分发电压表 — 每块表测量不同的电阻压降
     *
     * 分发策略:
     *  - nodes = [VCC_AM, SENSE, GND] → 2 个测量点对: (VCC_AM,SENSE) 测量 R1, (SENSE,GND) 测量 R2
     *  - N 块电压表按顺序分配到 N 个测量点对上
     *  - 电压表数量 > 节点对数时，多余的循环分配
     *  - 电流表已在 buildDividerChain 中串联，此处跳过
     */
    private wireDividerInstruments(doc: SchematicDocument, topo: DividerTopology, notes: string[]): number {
        let count = 0;
        // 构建测量点对列表
        const nodePairs: DividerNodePair[] = [];
        for (let i = 0; i < topo.chain.length && i < topo.nodes.length - 1; i++) {
            const pair: DividerNodePair = {
                high: topo.nodes[i],
                low: topo.nodes[i + 1],
                comp: topo.chain[i]
            };
            nodePairs.push(pair);
        }
        if (nodePairs.length === 0) {
            return 0;
        }
        // 收集所有电压表
        const voltmeters = SemanticNetBuilder.findAllByLib(doc, (id) => id === 'VOLTMETER_DC' || id === 'VIRTUAL_METER');
        const ammeter = topo.ammeterComp;
        // 分发电压表到不同节点对
        for (let vi = 0; vi < voltmeters.length; vi++) {
            const vm = voltmeters[vi];
            const pair = nodePairs[vi % nodePairs.length];
            const id = vm.libraryId.toUpperCase();
            if (id === 'VOLTMETER_DC') {
                TemplateSchematicKit.joinByLabel(doc, pair.high, NetType.SIGNAL, [
                    { comp: pair.comp, pinId: '1', pinName: '1' },
                    { comp: vm, pinId: 'V+', pinName: 'V+' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, pair.low, NetType.SIGNAL, [
                    { comp: vm, pinId: 'COM', pinName: 'COM' }
                ]);
                notes.push(`电压表 ${vm.refDes} → ${pair.high}↔${pair.low} (测${pair.comp.refDes})`);
                count++;
            }
            else if (id === 'VIRTUAL_METER') {
                TemplateSchematicKit.joinByLabel(doc, pair.high, NetType.SIGNAL, [
                    { comp: pair.comp, pinId: '1', pinName: '1' },
                    { comp: vm, pinId: 'V', pinName: 'V' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, pair.low, NetType.SIGNAL, [
                    { comp: vm, pinId: 'COM', pinName: 'COM' }
                ]);
                notes.push(`万用表 ${vm.refDes} → ${pair.high}↔${pair.low}`);
                count++;
            }
        }
        // 电流表已在 buildDividerChain 中处理，仅记录
        if (ammeter !== null) {
            notes.push(`电流表 ${ammeter.refDes} 已串联在 VCC→${topo.postAmmeterNet}`);
        }
        return count;
    }
    /**
     * 无分压链电路中的仪器接线 v3.1
     * 用于: MCU GPIO、LED 支路、传感器探头等场景
     * v3.1: 多块电压表分发到不同 GPIO 引脚 (MCU电路) 或不同器件节点
     */
    private wireStandaloneInstruments(doc: SchematicDocument, vcc: ComponentInstance, gnd: ComponentInstance, signalHub: SignalHub | null, notes: string[]): number {
        let count = 0;
        const gndPin: PinSpec = { comp: gnd, pinId: '1', pinName: 'GND' };
        // 收集所有电压表
        const voltmeters = SemanticNetBuilder.findAllByLib(doc, (id) => id === 'VOLTMETER_DC' || id === 'VIRTUAL_METER');
        // v3.1: 构建多个测量点，将电压表分发到不同节点
        const measurePoints: SignalHub[] = [];
        const mcu = SemanticNetBuilder.findByLib(doc, (id) => id.startsWith('STM32') || id.startsWith('AT89') || id.startsWith('STC'));
        if (mcu !== null) {
            // MCU电路: 获取所有可用 GPIO 作为测量点
            const meta = this.library.getDeviceMeta(mcu.libraryId);
            const pinList = meta.success && meta.data ? meta.data.pin_list : [];
            const gpioPrefixes = ['PA', 'PB', 'PC', 'PD', 'PE', 'P1.', 'P0.', 'P2.', 'P3.'];
            const gpios: string[] = [];
            for (const prefix of gpioPrefixes) {
                const found = this.resolvePins(pinList, [prefix]);
                for (const f of found) {
                    if (gpios.length < 8)
                        gpios.push(f);
                }
            }
            // 为每个电压表创建独立的 PROBE 测量点
            for (let vi = 0; vi < voltmeters.length && vi < gpios.length; vi++) {
                const netName = `PROBE_${vi + 1}`;
                measurePoints.push({
                    net: netName,
                    pin: { comp: mcu, pinId: gpios[vi], pinName: gpios[vi] }
                });
            }
        }
        if (measurePoints.length === 0 && signalHub !== null) {
            // 无MCU或无可用GPIO → 使用 signalHub 作为唯一测量点
            measurePoints.push(signalHub);
        }
        // 将电压表分发到不同的测量点 (循环分配)
        for (let vi = 0; vi < voltmeters.length; vi++) {
            const vm = voltmeters[vi];
            const id = vm.libraryId.toUpperCase();
            const hub = measurePoints[vi % measurePoints.length];
            const vpin = id === 'VOLTMETER_DC' ? 'V+' : 'V';
            TemplateSchematicKit.joinByLabel(doc, hub.net, NetType.SIGNAL, [
                hub.pin, { comp: vm, pinId: vpin, pinName: vpin }
            ]);
            TemplateSchematicKit.joinByLabel(doc, 'GND', NetType.GROUND, [
                gndPin, { comp: vm, pinId: 'COM', pinName: 'COM' }
            ]);
            notes.push(`电压表 ${vm.refDes} → ${hub.net} (standalone${mcu !== null ? ', MCU ' + hub.pin.pinName : ''})`);
            count++;
        }
        // 电流表: 串联在 VCC 和第一个电阻之间
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            if (c.libraryId.toUpperCase() !== 'AMMETER_DC')
                continue;
            const load = SemanticNetBuilder.findAllByLib(doc, (lid) => lid.startsWith('R_'));
            if (load.length > 0) {
                const r = load[0];
                TemplateSchematicKit.joinByLabel(doc, 'VCC', NetType.POWER, [
                    { comp: vcc, pinId: '1', pinName: 'VCC' },
                    { comp: c, pinId: 'I+', pinName: 'I+' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, 'VCC_AM', NetType.POWER, [
                    { comp: c, pinId: 'I-', pinName: 'I-' },
                    { comp: r, pinId: '1', pinName: '1' }
                ]);
                notes.push(`电流表 ${c.refDes} 串联 (standalone)`);
                count++;
            }
        }
        return count;
    }
    /**
     * 非分压器类仪器: 示波器、频率计、UART终端
     * 这些仪器不参与分压测量，独立于拓扑计划之外
     */
    private wireNonDividerInstruments(doc: SchematicDocument, vcc: ComponentInstance | null, gnd: ComponentInstance | null, mcu: ComponentInstance | null, notes: string[]): number {
        let count = 0;
        const signalHub = SemanticNetBuilder.pickSignalHub(doc, mcu, SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('LED_')));
        const gndPin: PinSpec | null = gnd !== null
            ? { comp: gnd, pinId: '1', pinName: 'GND' }
            : null;
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const id = c.libraryId.toUpperCase();
            if (id === 'OSCILLOSCOPE' && signalHub !== null) {
                TemplateSchematicKit.joinByLabel(doc, signalHub.net, NetType.SIGNAL, [
                    signalHub.pin, { comp: c, pinId: 'CH1', pinName: 'CH1' }
                ]);
                TemplateSchematicKit.stubLabel(doc, { comp: c, pinId: 'GND', pinName: 'GND' }, 'GND');
                notes.push(`示波器 CH1→${signalHub.net}`);
                count++;
            }
            else if (id === 'FREQ_COUNTER' && signalHub !== null && gndPin !== null) {
                TemplateSchematicKit.joinByLabel(doc, signalHub.net, NetType.SIGNAL, [
                    signalHub.pin, { comp: c, pinId: 'IN', pinName: 'IN' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, 'GND', NetType.GROUND, [
                    gndPin, { comp: c, pinId: 'GND', pinName: 'GND' }
                ]);
                notes.push(`频率计 ${c.refDes}`);
                count++;
            }
            else if (id === 'UART_TERMINAL' && mcu !== null && gndPin !== null) {
                const meta = this.library.getDeviceMeta(mcu.libraryId);
                const pinList = meta.success && meta.data ? meta.data.pin_list : [];
                const tx = this.resolvePin(pinList, UART_TX_ALIASES) ?? 'P30';
                const rx = this.resolvePin(pinList, UART_RX_ALIASES) ?? 'P31';
                TemplateSchematicKit.joinByLabel(doc, 'UART_TX', NetType.SIGNAL, [
                    { comp: mcu, pinId: tx, pinName: tx },
                    { comp: c, pinId: 'RX', pinName: 'RX' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, 'UART_RX', NetType.SIGNAL, [
                    { comp: mcu, pinId: rx, pinName: rx },
                    { comp: c, pinId: 'TX', pinName: 'TX' }
                ]);
                TemplateSchematicKit.joinByLabel(doc, 'GND', NetType.GROUND, [
                    gndPin, { comp: c, pinId: 'GND', pinName: 'GND' }
                ]);
                notes.push(`UART 终端 ${c.refDes} (TX↔RX 交叉)`);
                count++;
            }
        }
        return count;
    }
    private applyAiWiringRulesHints(doc: SchematicDocument, notes: string[]): void {
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const r = this.library.getComponent(c.libraryId);
            if (!r.success || r.data === undefined) {
                continue;
            }
            const rules = r.data.aiWiringRules ?? [];
            if (rules.indexOf('mcu-crystal') >= 0) {
                notes.push(`规则提示 ${c.refDes}: mcu-crystal`);
            }
            if (rules.indexOf('voltage-probe') >= 0) {
                notes.push(`规则提示 ${c.refDes}: voltage-probe`);
            }
            if (rules.indexOf('current-sense') >= 0) {
                notes.push(`规则提示 ${c.refDes}: current-sense`);
            }
        }
    }
    private static pickSignalHub(doc: SchematicDocument, mcu: ComponentInstance | null, leds: ComponentInstance[]): SignalHub | null {
        if (leds.length > 0) {
            return { net: 'LED_NODE', pin: { comp: leds[0], pinId: 'A', pinName: 'A' } };
        }
        if (mcu !== null) {
            // 找第一个 GPIO 引脚
            return { net: 'PROBE', pin: { comp: mcu, pinId: 'P14', pinName: 'P14' } };
        }
        const pots = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('POT_'));
        if (pots.length > 0) {
            return { net: 'DIV_TOP', pin: { comp: pots[0], pinId: 'W', pinName: 'W' } };
        }
        const senseNet = doc.nets.find(n => n.name === 'SENSE');
        if (senseNet !== undefined && senseNet.pinIds.length > 0) {
            const parts = senseNet.pinIds[0].split(':');
            const comp = doc.components.find(c => c.id === parts[0]);
            if (comp !== undefined) {
                return { net: 'SENSE', pin: { comp: comp, pinId: parts[1] ?? '2', pinName: parts[1] ?? '2' } };
            }
        }
        const resistors = SemanticNetBuilder.findAllByLib(doc, (id) => id.startsWith('R_'));
        if (resistors.length > 0) {
            return { net: 'SENSE', pin: { comp: resistors[0], pinId: '2', pinName: '2' } };
        }
        const sensors = SemanticNetBuilder.findAllByLib(doc, (id) => id === 'LDR' || id === 'HALL_SENSOR' || id.indexOf('NTC') >= 0);
        if (sensors.length > 0) {
            return { net: 'SENSE', pin: { comp: sensors[0], pinId: '1', pinName: '1' } };
        }
        return null;
    }
    private static findByLib(doc: SchematicDocument, pred: (libId: string) => boolean): ComponentInstance | null {
        for (let i = 0; i < doc.components.length; i++) {
            if (pred(doc.components[i].libraryId)) {
                return doc.components[i];
            }
        }
        return null;
    }
    private static findAllByLib(doc: SchematicDocument, pred: (libId: string) => boolean): ComponentInstance[] {
        const out: ComponentInstance[] = [];
        for (let i = 0; i < doc.components.length; i++) {
            if (pred(doc.components[i].libraryId)) {
                out.push(doc.components[i]);
            }
        }
        return out;
    }
    private static contentOrigin(doc: SchematicDocument): OriginPoint {
        if (doc.components.length === 0) {
            return { x: 200, y: 200 };
        }
        let minX = doc.components[0].position.x;
        let minY = doc.components[0].position.y;
        for (let i = 1; i < doc.components.length; i++) {
            minX = Math.min(minX, doc.components[i].position.x);
            minY = Math.min(minY, doc.components[i].position.y);
        }
        return { x: minX, y: minY };
    }
}
