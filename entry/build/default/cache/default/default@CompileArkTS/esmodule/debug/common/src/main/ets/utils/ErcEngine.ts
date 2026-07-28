import { ErcSeverity, ErcRuleType, NetType, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ErcViolation, Pin, Net } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { appendArray } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { DeviceHitGeometry, WIRE_OBSTACLE_PAD } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/DeviceHitGeometry";
import type { DeviceInst } from '../types/TopologyTypes';
export type PinResolverFn = (libraryId: string) => Pin[] | null;
export class ErcEngine {
    static run(doc: SchematicDocument, mcuLibraryIds: Set<string>, pinResolver?: PinResolverFn): ErcViolation[] {
        const violations: ErcViolation[] = [];
        appendArray(violations, ErcEngine.checkFloatingNets(doc));
        appendArray(violations, ErcEngine.checkDuplicateNetNames(doc));
        appendArray(violations, ErcEngine.checkUnconnectedPins(doc, pinResolver));
        appendArray(violations, ErcEngine.checkPinTypeConflicts(doc, pinResolver));
        appendArray(violations, ErcEngine.checkLabelOverDevice(doc, pinResolver));
        appendArray(violations, ErcEngine.checkMcuRequirements(doc, mcuLibraryIds));
        appendArray(violations, ErcEngine.checkPowerPins(doc));
        appendArray(violations, ErcEngine.checkSubcircuitPorts(doc));
        return violations;
    }
    private static checkFloatingNets(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (let i = 0; i < doc.nets.length; i++) {
            const net = doc.nets[i];
            if (ErcEngine.isPowerOrGroundNet(net)) {
                // 拓扑每次 ensureNet(VCC/GND/VEE)：无脚且画布无对应电源符号 → 预置空轨，不报噪
                if (net.pinIds.length === 0 && !ErcEngine.docHasMatchingPowerSymbol(doc, net)) {
                    continue;
                }
                // 已有符号入网但几乎无负载：INFO，不挡门禁
                if (net.pinIds.length <= 1) {
                    result.push(ErcEngine.makeViolation(ErcSeverity.INFO, ErcRuleType.FLOATING_NET, `电源/地网络 "${net.name}" 仅符号入网（待接负载）`, net.id, undefined, undefined, '将 GND/VCC/VEE 符号用导线连接到器件电源脚'));
                }
                continue;
            }
            if (net.pinIds.length === 0) {
                continue;
            }
            if (net.pinIds.length <= 1 && net.type === NetType.SIGNAL) {
                const nm = (net.name ?? '').trim();
                const isAuto = nm.length === 0 || /^NET_\d+$/i.test(nm) || /^net_topo/i.test(nm);
                if (!isAuto) {
                    // 有意义网名仅 1 脚：多为标号未并网 / 混合 mode 分裂 → 挡 AI 门禁
                    result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.FLOATING_NET, `信号网络 "${nm}" 未完全连接（仅 1 脚，标号可能未并网）`, net.id, undefined, undefined, '检查同名网络标号是否落在同一几何网，或改为导线直连'));
                }
                else {
                    result.push(ErcEngine.makeViolation(ErcSeverity.INFO, ErcRuleType.FLOATING_NET, `网络 "${net.name}" 仅有一处连接（待并网/标号）`, net.id, undefined, undefined, '添加网络标号或连接到器件引脚'));
                }
            }
        }
        return result;
    }
    /** 电源/地网络（不应按普通信号网络做悬空判定） */
    private static isPowerOrGroundNet(net: Net): boolean {
        if (net.type === NetType.POWER || net.type === NetType.GROUND) {
            return true;
        }
        const upper = (net.name ?? '').toUpperCase();
        return upper === 'GND' || upper === 'VSS' || upper === 'VEE' ||
            upper === 'VCC' || upper === 'VDD' || upper === '0' ||
            upper === '-12V' || upper === '-5V';
    }
    /** 画布是否已放置与该轨对应的电源/地符号（VCC/GND/VEE） */
    private static docHasMatchingPowerSymbol(doc: SchematicDocument, net: Net): boolean {
        const want = ErcEngine.powerSymbolLibForNet(net);
        if (want.length === 0) {
            return false;
        }
        for (let i = 0; i < doc.components.length; i++) {
            const lib = (doc.components[i].libraryId ?? '').toUpperCase();
            if (lib === want || lib.endsWith(`/${want}`)) {
                return true;
            }
        }
        return false;
    }
    /** 轨网名 → 对应电源符号 libraryId；非标准名返回空 */
    private static powerSymbolLibForNet(net: Net): string {
        const upper = (net.name ?? '').toUpperCase();
        if (upper === 'VCC' || upper === 'VDD') {
            return 'VCC';
        }
        if (upper === 'GND' || upper === 'VSS' || upper === '0') {
            return 'GND';
        }
        if (upper === 'VEE' || upper === '-12V' || upper === '-5V') {
            return 'VEE';
        }
        if (net.type === NetType.GROUND) {
            return 'GND';
        }
        return '';
    }
    private static checkDuplicateNetNames(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const names = new Map<string, string>();
        for (let i = 0; i < doc.nets.length; i++) {
            const net = doc.nets[i];
            if (!net.name || net.name.startsWith('NET_')) {
                continue;
            }
            if (names.has(net.name)) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.DUPLICATE_NET, `重复网络标号 "${net.name}"（同名将并网；若非有意请改名）`, net.id, undefined, undefined, '为每个独立网络使用唯一标号，或确认同名并网意图'));
            }
            else {
                names.set(net.name, net.id);
            }
        }
        return result;
    }
    private static checkUnconnectedPins(doc: SchematicDocument, pinResolver?: PinResolverFn): ErcViolation[] {
        const result: ErcViolation[] = [];
        // Build connected pins map: compId -> Set<pinDefId>
        // Net.pinIds format: "${compId}:${pinDefId}:${pinDefName}"
        const connectedPins = new Map<string, Set<string>>();
        for (let i = 0; i < doc.nets.length; i++) {
            const net = doc.nets[i];
            for (let j = 0; j < net.pinIds.length; j++) {
                const parts = net.pinIds[j].split(':');
                if (parts.length >= 2) {
                    const compId = parts[0];
                    const pinDefId = parts[1];
                    if (!connectedPins.has(compId)) {
                        connectedPins.set(compId, new Set<string>());
                    }
                    connectedPins.get(compId)!.add(pinDefId);
                }
            }
        }
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            const pinDefs = ErcEngine.resolvePinIds(comp.libraryId, pinResolver);
            const compConnected = connectedPins.get(comp.id);
            for (let p = 0; p < pinDefs.length; p++) {
                const pinDefId = pinDefs[p];
                if (!compConnected || !compConnected.has(pinDefId)) {
                    result.push(ErcEngine.makeViolation(ErcSeverity.INFO, ErcRuleType.UNCONNECTED_PIN, `器件 ${comp.refDes} 引脚 ${pinDefId} 未连接`, undefined, comp.id, pinDefId, '连接引脚或添加 No ERC 标记'));
                }
            }
        }
        return result;
    }
    /**
     * KiCad-like 引脚电气类型冲突矩阵（同网）：
     * Out+Out → ERROR；Out/BiDi+Power → ERROR；BiDi+Out/BiDi → WARNING；
     * Passive/Input/OC 可共网；Power+Ground 同网 → ERROR。
     */
    private static checkPinTypeConflicts(doc: SchematicDocument, pinResolver?: PinResolverFn): ErcViolation[] {
        const result: ErcViolation[] = [];
        if (pinResolver == null) {
            return result;
        }
        for (let ni = 0; ni < doc.nets.length; ni++) {
            const net = doc.nets[ni];
            if (net.pinIds.length < 2) {
                continue;
            }
            let outN = 0;
            let bidN = 0;
            let pwrN = 0;
            let gndN = 0;
            let ocN = 0;
            let passiveN = 0;
            const drivers: string[] = [];
            for (let pi = 0; pi < net.pinIds.length; pi++) {
                const parts = net.pinIds[pi].split(':');
                if (parts.length < 2) {
                    continue;
                }
                const comp = doc.components.find(c => c.id === parts[0]);
                if (comp === undefined) {
                    continue;
                }
                const pins = pinResolver(comp.libraryId);
                if (pins == null) {
                    continue;
                }
                let pin: Pin | null = null;
                for (let j = 0; j < pins.length; j++) {
                    if (pins[j].id === parts[1] || pins[j].name === parts[1] ||
                        (parts.length >= 3 && pins[j].name === parts[2])) {
                        pin = pins[j];
                        break;
                    }
                }
                if (pin === null) {
                    continue;
                }
                const tag = `${comp.refDes}.${pin.name || pin.id}`;
                if (pin.type === PinType.OUTPUT) {
                    outN++;
                    drivers.push(tag);
                }
                else if (pin.type === PinType.BIDIRECTIONAL) {
                    bidN++;
                    drivers.push(tag);
                }
                else if (pin.type === PinType.POWER) {
                    pwrN++;
                    drivers.push(tag);
                }
                else if (pin.type === PinType.GROUND) {
                    gndN++;
                    drivers.push(tag);
                }
                else if (pin.type === PinType.OPEN_COLLECTOR) {
                    ocN++;
                }
                else if (pin.type === PinType.PASSIVE || pin.type === PinType.ANALOG ||
                    pin.type === PinType.INPUT) {
                    passiveN++;
                }
            }
            if (pwrN > 0 && gndN > 0) {
                result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.PIN_CONFLICT, `网络 "${net.name}" 电源脚与地脚同网（短路）`, net.id, undefined, undefined, '检查电源/地布线，避免 VCC 与 GND 并网'));
            }
            if (outN >= 2) {
                result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.PIN_CONFLICT, `网络 "${net.name}" 多输出驱动冲突（${drivers.slice(0, 4).join(', ')}）`, net.id, undefined, undefined, '勿将两个 OUTPUT 直连；加缓冲或改线'));
            }
            else if (outN >= 1 && bidN >= 1) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.PIN_CONFLICT, `网络 "${net.name}" OUTPUT 与 BIDI 共网（${drivers.slice(0, 4).join(', ')}）`, net.id, undefined, undefined, '确认总线争用可接受，否则隔离驱动'));
            }
            else if (bidN >= 2) {
                result.push(ErcEngine.makeViolation(ErcSeverity.INFO, ErcRuleType.PIN_CONFLICT, `网络 "${net.name}" 多个 BIDI 共网（可能总线争用）`, net.id, undefined, undefined, '确认分时驱动或加方向控制'));
            }
            // Out/BiDi 直连电源：无阻容等同网 PASSIVE 时 ERROR；有 PASSIVE 降为 WARNING（少误杀）
            if ((outN > 0 || bidN > 0) && pwrN > 0) {
                result.push(ErcEngine.makeViolation(passiveN > 0 ? ErcSeverity.WARNING : ErcSeverity.ERROR, ErcRuleType.PIN_CONFLICT, `网络 "${net.name}" 信号驱动脚与电源脚同网`, net.id, undefined, undefined, '信号网勿直接挂到 VCC/电源脚'));
            }
            // OC 并联允许；OC+强 OUTPUT 警告
            if (ocN > 0 && outN > 0) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.PIN_CONFLICT, `网络 "${net.name}" 开漏与推挽输出共网`, net.id, undefined, undefined, '开漏网应仅接 OC/输入/上拉，勿接推挽 OUTPUT'));
            }
        }
        return result;
    }
    /** H4：信号标号锚点落入器件选中区（压住符号） */
    private static checkLabelOverDevice(doc: SchematicDocument, pinResolver?: PinResolverFn): ErcViolation[] {
        const result: ErcViolation[] = [];
        const labels = doc.netLabels;
        if (labels === undefined || labels.length === 0 || pinResolver == null) {
            return result;
        }
        for (let li = 0; li < labels.length; li++) {
            const lb = labels[li];
            const upper = (lb.text ?? '').toUpperCase();
            // 电源/地标号常贴在电源符上，不算 H4
            if (upper === 'VCC' || upper === 'VDD' || upper === 'V+' || upper === 'VEE' ||
                upper === 'GND' || upper === 'VSS' || upper === '0') {
                continue;
            }
            for (let ci = 0; ci < doc.components.length; ci++) {
                const comp = doc.components[ci];
                const resolvedPins = pinResolver(comp.libraryId);
                const pins = resolvedPins !== null ? resolvedPins : [];
                const di: DeviceInst = {
                    instUuid: comp.id,
                    libDevId: comp.libraryId,
                    refName: comp.refDes,
                    x: comp.position.x,
                    y: comp.position.y,
                    rotate: comp.rotation,
                    mirrorH: comp.mirrored,
                    mirrorV: false,
                    params: new Map<string, string>(),
                    pinVoltage: new Map<string, number>(),
                    hidden: false,
                    subCircuitRef: '',
                    ercErrorMsg: ''
                };
                const hit = DeviceHitGeometry.hitRectFromDeviceInst(di, pins, WIRE_OBSTACLE_PAD);
                if (!DeviceHitGeometry.pointInRect(lb.position.x, lb.position.y, hit)) {
                    continue;
                }
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.LABEL_OVER_DEVICE, `网络标号 "${lb.text}" 压在器件 ${comp.refDes} 上`, lb.netId, comp.id, undefined, '将标号移到引脚外侧，避免覆盖符号'));
                break;
            }
        }
        return result;
    }
    /** Resolve pin IDs: use dynamic resolver when available, fall back to static map */
    private static resolvePinIds(libraryId: string, pinResolver?: PinResolverFn): string[] {
        if (pinResolver != null) {
            const pins = pinResolver(libraryId);
            if (pins != null && pins.length > 0) {
                const ids: string[] = [];
                for (let i = 0; i < pins.length; i++) {
                    ids.push(pins[i].id);
                }
                return ids;
            }
        }
        return ErcEngine.getPinDefs(libraryId);
    }
    private static checkMcuRequirements(doc: SchematicDocument, mcuIds: Set<string>): ErcViolation[] {
        const result: ErcViolation[] = [];
        const mcus = doc.components.filter(c => mcuIds.has(c.libraryId) ||
            c.libraryId.includes('AT89') || c.libraryId.includes('STC') || c.libraryId.includes('STM32'));
        for (let i = 0; i < mcus.length; i++) {
            const mcu = mcus[i];
            const hasCrystal = doc.components.some(c => c.libraryId.includes('CRYSTAL') || c.libraryId.includes('XTAL'));
            const hasCap = doc.components.filter(c => c.libraryId.startsWith('C_')).length >= 2;
            const hasResistor = doc.components.some(c => c.libraryId.startsWith('R_'));
            if (!hasCrystal) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.MISSING_CRYSTAL, `MCU ${mcu.refDes} 缺少晶振电路`, undefined, mcu.id, undefined, '外置晶振或确认使用内部时钟（STC/部分 STM32）'));
            }
            if (!hasCap) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.MISSING_RESET, `MCU ${mcu.refDes} 可能缺少去耦/复位电容`, undefined, mcu.id, undefined, '添加 100nF 去耦电容和 10kΩ 上拉电阻'));
            }
            if (!hasResistor && !hasCap) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.MISSING_RESET, `MCU ${mcu.refDes} 复位电路可能不完整`, undefined, mcu.id, undefined, '添加 RST 引脚 10kΩ 上拉和 100nF 电容'));
            }
        }
        return result;
    }
    private static checkPowerPins(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        let hasVcc = false;
        let hasGnd = false;
        let hasAltSource = false;
        let hasMcuOrDigital = false;
        for (let i = 0; i < doc.nets.length; i++) {
            const net = doc.nets[i];
            if (net.type === NetType.POWER || net.name === 'VCC' || net.name === 'VDD') {
                hasVcc = true;
            }
            if (net.type === NetType.GROUND || net.name === 'GND' || net.name === 'VSS') {
                hasGnd = true;
            }
        }
        for (let ci = 0; ci < doc.components.length; ci++) {
            const lib = doc.components[ci].libraryId;
            if (lib === 'VCC') {
                hasVcc = true;
            }
            if (lib === 'GND') {
                hasGnd = true;
            }
            if (lib === 'VAC' || lib === 'SIGNAL_GEN' || lib === 'VEE') {
                hasAltSource = true;
            }
            if (lib.includes('AT89') || lib.includes('STC') || lib.includes('STM32') ||
                lib.includes('74HC') || lib.includes('GATE_')) {
                hasMcuOrDigital = true;
            }
        }
        // 纯交流/信号源实验可不强制 VCC；有 MCU/数字则仍要求正电源
        if (!hasVcc && (hasMcuOrDigital || !hasAltSource)) {
            result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.POWER_REVERSED, '原理图缺少电源网络 (VCC/VDD)', undefined, undefined, undefined, '添加电源符号并连接到器件电源脚'));
        }
        if (!hasGnd) {
            result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.POWER_REVERSED, '原理图缺少地网络 (GND/VSS)', undefined, undefined, undefined, '添加地符号并连接到电路 GND'));
        }
        return result;
    }
    private static checkSubcircuitPorts(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (let i = 0; i < doc.subcircuits.length; i++) {
            const sub = doc.subcircuits[i];
            if (!sub.ports || sub.ports.length === 0) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.PORT_MISMATCH, `子电路 "${sub.name}" 未定义端口`, undefined, sub.id, undefined, '为子电路添加输入/输出端口定义'));
            }
        }
        return result;
    }
    /** Returns actual pin definition IDs for a given library component type */
    private static getPinDefs(libraryId: string): string[] {
        // Two-pin passives (R, C, L, XTAL, FUSE)
        if (libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
            libraryId.startsWith('L_') || libraryId.startsWith('XTAL_') ||
            libraryId.startsWith('FUSE_')) {
            return ['1', '2'];
        }
        if (libraryId.startsWith('POT_')) {
            return ['1', '2', 'W'];
        }
        // LEDs and diodes
        if (libraryId.startsWith('LED_') || libraryId === '1N4148' ||
            libraryId === '1N4007' || libraryId === '1N5819') {
            return ['A', 'K'];
        }
        // Switch / relay coil (+ optional contact pins when present)
        if (libraryId === 'SW_PUSH') {
            return ['1', '2'];
        }
        if (libraryId === 'RELAY_SPDT') {
            return ['1', '2', 'COM', 'NO', 'NC'];
        }
        if (libraryId === 'BUZZER') {
            return ['1', '2'];
        }
        // Power symbols (pin.id is '1' from makePin('1', 'VCC', ...) / makePin('1', 'GND', ...))
        if (libraryId === 'VCC')
            return ['1'];
        if (libraryId === 'GND')
            return ['1'];
        if (libraryId === 'VEE')
            return ['1'];
        if (libraryId === 'VAC')
            return ['1', '2'];
        if (libraryId === 'SIGNAL_GEN')
            return ['OUT', 'GND'];
        // Op-amps
        if (libraryId === 'UA741')
            return ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'];
        if (libraryId === 'LM358' || libraryId === 'TL082') {
            return ['IN+1', 'IN-1', 'OUT1', 'IN+2', 'IN-2', 'OUT2', 'V+', 'V-'];
        }
        if (libraryId === 'LM555' || libraryId === 'NE555') {
            return ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'];
        }
        // Voltage regulators (3-terminal, genPins 3)
        if (libraryId === 'LM7805' || libraryId === 'LM7812' || libraryId === 'AMS1117_3V3') {
            return ['1', '2', '3'];
        }
        // MCUs — 具名脚（与 NamedDevicePins / BuiltinComponents 对齐）
        if (libraryId.includes('STM32F407')) {
            return ErcEngine.stm32Pins100();
        }
        if (libraryId.includes('STM32F030')) {
            return ErcEngine.stm32Pins32();
        }
        if (libraryId.includes('STM32')) {
            return ErcEngine.stm32Pins48();
        }
        if (libraryId.includes('AT89') || libraryId.includes('STC')) {
            return ErcEngine.pins8051();
        }
        // Peripherals / instruments — 可选通道不强制全连
        if (libraryId === 'UART_TERMINAL')
            return ['TX', 'RX', 'GND'];
        if (libraryId === 'VOLTMETER_DC')
            return ['V+', 'COM'];
        // 至少电压档；A/OHM 可选（未接时 INFO）
        if (libraryId === 'VIRTUAL_METER')
            return ['V', 'COM'];
        if (libraryId === 'AMMETER_DC')
            return ['I+', 'I-'];
        if (libraryId === 'FREQ_COUNTER')
            return ['IN', 'GND'];
        // 逻辑分析仪 / 示波器：至少 1 通道 + GND；其余通道可选
        if (libraryId === 'LOGIC_ANALYZER')
            return ['CH1', 'GND'];
        if (libraryId === 'POWER_METER')
            return ['V+', 'V-', 'I+', 'I-'];
        if (libraryId === 'LCD1602') {
            return ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
        }
        if (libraryId === 'OLED_12864') {
            return ['VCC', 'GND', 'SCL', 'SDA'];
        }
        if (libraryId === '24C02') {
            return ['VCC', 'VSS', 'SDA', 'SCL'];
        }
        if (libraryId === 'W25Q64') {
            return ['VCC', 'GND', 'CS', 'CLK', 'DI', 'DO'];
        }
        if (libraryId === '2764' || libraryId === '62256') {
            return ['VCC', 'GND', 'CE', 'OE'];
        }
        if (libraryId === 'CD4017') {
            return ['VDD', 'VSS', 'CLK', 'RST', 'Q0'];
        }
        if (libraryId === 'LM2596') {
            return ['VIN', 'OUT', 'GND', 'FB', 'ON'];
        }
        // 三极管 / MOS
        if (libraryId.includes('2N3904') || libraryId.includes('2N3906') ||
            libraryId.includes('BC547') || libraryId.includes('BC557') ||
            libraryId.includes('NPN') || libraryId.includes('PNP')) {
            return ['B', 'C', 'E'];
        }
        if (libraryId.includes('2N7000') || libraryId.includes('IRF') ||
            libraryId.includes('NMOS') || libraryId.includes('PMOS') || libraryId.includes('MOSFET')) {
            return ['G', 'D', 'S'];
        }
        // 二极管（非 LED）
        if (libraryId === '1N4148' || libraryId === '1N4007' || libraryId === '1N5819') {
            return ['A', 'K'];
        }
        // 传感器
        if (libraryId.includes('LDR') || libraryId.includes('NTC') || libraryId.includes('PTC')) {
            return ['1', '2'];
        }
        if (libraryId.includes('DHT11') || libraryId.includes('DS18B20')) {
            return ['VDD', 'DQ', 'GND'];
        }
        if (libraryId.includes('HALL')) {
            return ['VCC', 'OUT', 'GND'];
        }
        // 74HC gates only expose functional pins (A, B, Y, GND, VCC), not all 14 package pins
        if (libraryId.includes('74HC04')) {
            return ['1', '2', '7', '14'];
        }
        if (libraryId.includes('74HC')) {
            return ['1', '2', '3', '7', '14'];
        }
        // 示波器：至少 CH1 + GND
        if (libraryId.includes('OSCILLOSCOPE'))
            return ['CH1', 'GND'];
        // 未知库 ID：禁止默认假脚 1/2（会让多脚 IC ERC 假通过）
        return [];
    }
    private static buildPinArray(count: number, prefix: string): string[] {
        const result: string[] = [];
        for (let i = 0; i < count; i++) {
            result.push(`${prefix}${i + 1}`);
        }
        return result;
    }
    private static gpioBank(letter: string, n: number): string[] {
        const out: string[] = [];
        for (let i = 0; i < n; i++) {
            out.push(`P${letter}${i}`);
        }
        return out;
    }
    private static stm32Pins48(): string[] {
        return ['VDD', 'VSS', 'VDDA', 'VSSA', 'BOOT0', 'NRST', 'OSC_IN', 'OSC_OUT']
            .concat(ErcEngine.gpioBank('A', 16))
            .concat(ErcEngine.gpioBank('B', 16))
            .concat(ErcEngine.gpioBank('C', 8));
    }
    private static stm32Pins32(): string[] {
        return ['VDD', 'VSS', 'NRST', 'BOOT0', 'OSC_IN', 'OSC_OUT']
            .concat(ErcEngine.gpioBank('A', 16))
            .concat(ErcEngine.gpioBank('B', 10));
    }
    private static stm32Pins100(): string[] {
        return ErcEngine.stm32Pins48()
            .concat(ErcEngine.gpioBank('D', 16))
            .concat(ErcEngine.gpioBank('E', 16))
            .concat(['PC8', 'PC9', 'PC10', 'PC11', 'PC12', 'PC13', 'PC14', 'PC15'])
            .concat(ErcEngine.gpioBank('F', 12));
    }
    private static pins8051(): string[] {
        const out: string[] = [];
        for (let i = 0; i < 8; i++) {
            out.push(`P1.${i}`);
        }
        out.push('RST');
        for (let i = 0; i < 8; i++) {
            out.push(`P3.${i}`);
        }
        out.push('XTAL2', 'XTAL1', 'GND');
        for (let i = 0; i < 8; i++) {
            out.push(`P2.${i}`);
        }
        out.push('PSEN', 'ALE', 'EA');
        for (let i = 7; i >= 0; i--) {
            out.push(`P0.${i}`);
        }
        out.push('VCC');
        return out;
    }
    private static estimatePinCount(libraryId: string): number {
        if (libraryId.startsWith('R_') || libraryId.startsWith('C_') || libraryId.startsWith('L_')) {
            return 2;
        }
        if (libraryId.includes('LED')) {
            return 2;
        }
        if (libraryId.includes('74HC')) {
            return 14;
        }
        if (libraryId.includes('DS18B20') || libraryId.includes('HALL')) {
            return 3;
        }
        if (libraryId.includes('STM32F030')) {
            return 32;
        }
        if (libraryId.includes('STM32F407')) {
            return 100;
        }
        if (libraryId.includes('STM32')) {
            return 48;
        }
        if (libraryId.includes('AT89') || libraryId.includes('STC')) {
            return 40;
        }
        if (libraryId.includes('OSCILLOSCOPE')) {
            return 5;
        }
        return 2;
    }
    private static makeViolation(severity: ErcSeverity, ruleType: ErcRuleType, message: string, netId?: string, componentId?: string, pinId?: string, fix?: string): ErcViolation {
        return {
            id: IdUtil.generate('erc'),
            severity: severity,
            ruleType: ruleType,
            message: message,
            netId: netId,
            componentId: componentId,
            pinId: pinId,
            fixSuggestion: fix
        };
    }
}
