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
                // 电源/地网络：仅接符号未接电路时单独提示，不算普通信号悬空
                if (net.pinIds.length <= 1) {
                    result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.FLOATING_NET, `电源/地网络 "${net.name}" 未连接到其他器件（仅 ${net.pinIds.length} 处连接）`, net.id, undefined, undefined, '将 GND/VCC 符号用导线连接到 MCU、电阻等器件引脚'));
                }
                continue;
            }
            if (net.pinIds.length === 0) {
                continue;
            }
            if (net.pinIds.length <= 1 && net.type === NetType.SIGNAL) {
                result.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.FLOATING_NET, `网络 "${net.name}" 仅有一处连接（悬空）`, net.id, undefined, undefined, '添加网络标号或连接到器件引脚'));
            }
        }
        return result;
    }
    /** 电源/地网络（不应按普通信号网络做悬空判定） */
    private static isPowerOrGroundNet(net: Net): boolean {
        if (net.type === NetType.POWER || net.type === NetType.GROUND) {
            return true;
        }
        const upper = net.name.toUpperCase();
        return upper === 'GND' || upper === 'VSS' || upper === 'VEE' ||
            upper === 'VCC' || upper === 'VDD' || upper === '0';
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
                result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.DUPLICATE_NET, `重复网络标号 "${net.name}"`, net.id, undefined, undefined, '为每个网络使用唯一标号'));
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
            if (comp.libraryId.includes('OSCILLOSCOPE')) {
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
                result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.MISSING_CRYSTAL, `MCU ${mcu.refDes} 缺少晶振电路`, undefined, mcu.id, undefined, '添加晶振及负载电容（通常 11.0592MHz 或 8MHz）'));
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
        for (let i = 0; i < doc.nets.length; i++) {
            const net = doc.nets[i];
            if (net.type === NetType.POWER || net.name === 'VCC' || net.name === 'VDD') {
                hasVcc = true;
            }
            if (net.type === NetType.GROUND || net.name === 'GND' || net.name === 'VSS') {
                hasGnd = true;
            }
        }
        // 拓扑重建可能改名网络，但电源/地符号仍在时不应误报「缺少电源」
        for (let ci = 0; ci < doc.components.length; ci++) {
            const lib = doc.components[ci].libraryId;
            if (lib === 'VCC') {
                hasVcc = true;
            }
            if (lib === 'GND') {
                hasGnd = true;
            }
        }
        if (!hasVcc) {
            result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.POWER_REVERSED, '原理图缺少电源网络 (VCC/VDD)', undefined, undefined, undefined, '添加电源符号并连接到 MCU VCC 引脚'));
        }
        if (!hasGnd) {
            result.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.POWER_REVERSED, '原理图缺少地网络 (GND/VSS)', undefined, undefined, undefined, '添加地符号并连接到 MCU GND 引脚'));
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
        if (libraryId === 'VAC')
            return ['1', '2'];
        // Op-amps
        if (libraryId === 'UA741')
            return ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'];
        if (libraryId === 'LM358' || libraryId === 'TL082') {
            return ['IN+1', 'IN-1', 'OUT1', 'IN+2', 'IN-2', 'OUT2', 'V+', 'V-'];
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
        // Peripherals
        if (libraryId === 'UART_TERMINAL')
            return ['TX', 'RX', 'GND'];
        if (libraryId === 'LCD1602') {
            return ErcEngine.buildPinArray(16, '');
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
