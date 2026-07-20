import { ErcSeverity, ErcRuleType, NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ErcViolation, Pin, Net } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { appendArray } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
export type PinResolverFn = (libraryId: string) => Pin[] | null;
export class ErcEngine {
    static run(doc: SchematicDocument, mcuLibraryIds: Set<string>, pinResolver?: PinResolverFn): ErcViolation[] {
        const violations: ErcViolation[] = [];
        appendArray(violations, ErcEngine.checkFloatingNets(doc));
        appendArray(violations, ErcEngine.checkDuplicateNetNames(doc));
        appendArray(violations, ErcEngine.checkUnconnectedPins(doc, pinResolver));
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
                // 电源/地网络：仅接符号未接电路时 INFO，不挡门禁
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
            if (comp.libraryId.includes('OSCILLOSCOPE') ||
                comp.libraryId === 'LOGIC_ANALYZER') {
                continue;
            }
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
        // MCUs (genMcuPins)
        if (libraryId.includes('STM32F407')) {
            return ErcEngine.buildPinArray(100, 'P');
        }
        if (libraryId.includes('STM32')) {
            return ErcEngine.buildPinArray(48, 'P');
        }
        if (libraryId.includes('AT89') || libraryId.includes('STC')) {
            return ErcEngine.buildPinArray(40, 'P');
        }
        // Peripherals / instruments — 可选通道不强制全连
        if (libraryId === 'UART_TERMINAL')
            return ['TX', 'RX', 'GND'];
        if (libraryId === 'VOLTMETER_DC' || libraryId === 'VIRTUAL_METER')
            return ['V+', 'COM'];
        if (libraryId === 'AMMETER_DC')
            return ['I+', 'I-'];
        if (libraryId === 'FREQ_COUNTER')
            return ['IN', 'GND'];
        if (libraryId === 'LOGIC_ANALYZER')
            return [];
        if (libraryId === 'POWER_METER')
            return ['V+', 'V-', 'I+', 'I-'];
        if (libraryId === 'LCD1602') {
            return ErcEngine.buildPinArray(16, '');
        }
        if (libraryId === 'OLED_12864') {
            return ['VCC', 'GND', 'SCL', 'SDA'];
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
        // 传感器简脚
        if (libraryId.includes('LDR') || libraryId.includes('NTC') || libraryId.includes('PTC')) {
            return ['1', '2'];
        }
        if (libraryId.includes('DHT11') || libraryId.includes('DS18B20')) {
            return ['VCC', 'DATA', 'GND'];
        }
        // 74HC gates only expose functional pins (A, B, Y, GND, VCC), not all 14 package pins
        if (libraryId.includes('74HC04')) {
            return ['1', '2', '7', '14'];
        }
        if (libraryId.includes('74HC')) {
            return ['1', '2', '3', '7', '14'];
        }
        // Oscilloscope — skip
        if (libraryId.includes('OSCILLOSCOPE'))
            return [];
        // Default: two generic pins
        return ['1', '2'];
    }
    private static buildPinArray(count: number, prefix: string): string[] {
        const result: string[] = [];
        for (let i = 0; i < count; i++) {
            result.push(`${prefix}${i + 1}`);
        }
        return result;
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
