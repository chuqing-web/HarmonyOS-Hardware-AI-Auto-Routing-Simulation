import { ErcSeverity, ErcRuleType, NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ErcViolation, Pin, Net } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { appendArray } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
export type PinResolverFn = (libraryId: string) => Pin[] | null;
export class ErcEngine {
    static run(o21: SchematicDocument, p21: Set<string>, q21?: PinResolverFn): ErcViolation[] {
        const r21: ErcViolation[] = [];
        appendArray(r21, ErcEngine.checkFloatingNets(o21));
        appendArray(r21, ErcEngine.checkDuplicateNetNames(o21));
        appendArray(r21, ErcEngine.checkUnconnectedPins(o21, q21));
        appendArray(r21, ErcEngine.checkMcuRequirements(o21, p21));
        appendArray(r21, ErcEngine.checkPowerPins(o21));
        appendArray(r21, ErcEngine.checkSubcircuitPorts(o21));
        return r21;
    }
    private static checkFloatingNets(k21: SchematicDocument): ErcViolation[] {
        const l21: ErcViolation[] = [];
        for (let m21 = 0; m21 < k21.nets.length; m21++) {
            const n21 = k21.nets[m21];
            if (ErcEngine.isPowerOrGroundNet(n21)) {
                if (n21.pinIds.length <= 1) {
                    l21.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.FLOATING_NET, `电源/地网络 "${n21.name}" 未连接到其他器件（仅 ${n21.pinIds.length} 处连接）`, n21.id, undefined, undefined, '将 GND/VCC 符号用导线连接到 MCU、电阻等器件引脚'));
                }
                continue;
            }
            if (n21.pinIds.length === 0) {
                continue;
            }
            if (n21.pinIds.length <= 1 && n21.type === NetType.SIGNAL) {
                l21.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.FLOATING_NET, `网络 "${n21.name}" 仅有一处连接（悬空）`, n21.id, undefined, undefined, '添加网络标号或连接到器件引脚'));
            }
        }
        return l21;
    }
    private static isPowerOrGroundNet(i21: Net): boolean {
        if (i21.type === NetType.POWER || i21.type === NetType.GROUND) {
            return true;
        }
        const j21 = i21.name.toUpperCase();
        return j21 === 'GND' || j21 === 'VSS' || j21 === 'VEE' ||
            j21 === 'VCC' || j21 === 'VDD' || j21 === '0';
    }
    private static checkDuplicateNetNames(d21: SchematicDocument): ErcViolation[] {
        const e21: ErcViolation[] = [];
        const f21 = new Map<string, string>();
        for (let g21 = 0; g21 < d21.nets.length; g21++) {
            const h21 = d21.nets[g21];
            if (!h21.name || h21.name.startsWith('NET_')) {
                continue;
            }
            if (f21.has(h21.name)) {
                e21.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.DUPLICATE_NET, `重复网络标号 "${h21.name}"`, h21.id, undefined, undefined, '为每个网络使用唯一标号'));
            }
            else {
                f21.set(h21.name, h21.id);
            }
        }
        return e21;
    }
    private static checkUnconnectedPins(n20: SchematicDocument, o20?: PinResolverFn): ErcViolation[] {
        const p20: ErcViolation[] = [];
        const q20 = new Map<string, Set<string>>();
        for (let x20 = 0; x20 < n20.nets.length; x20++) {
            const y20 = n20.nets[x20];
            for (let z20 = 0; z20 < y20.pinIds.length; z20++) {
                const a21 = y20.pinIds[z20].split(':');
                if (a21.length >= 2) {
                    const b21 = a21[0];
                    const c21 = a21[1];
                    if (!q20.has(b21)) {
                        q20.set(b21, new Set<string>());
                    }
                    q20.get(b21)!.add(c21);
                }
            }
        }
        for (let r20 = 0; r20 < n20.components.length; r20++) {
            const s20 = n20.components[r20];
            if (s20.libraryId.includes('OSCILLOSCOPE')) {
                continue;
            }
            const t20 = ErcEngine.resolvePinIds(s20.libraryId, o20);
            const u20 = q20.get(s20.id);
            for (let v20 = 0; v20 < t20.length; v20++) {
                const w20 = t20[v20];
                if (!u20 || !u20.has(w20)) {
                    p20.push(ErcEngine.makeViolation(ErcSeverity.INFO, ErcRuleType.UNCONNECTED_PIN, `器件 ${s20.refDes} 引脚 ${w20} 未连接`, undefined, s20.id, w20, '连接引脚或添加 No ERC 标记'));
                }
            }
        }
        return p20;
    }
    private static resolvePinIds(i20: string, j20?: PinResolverFn): string[] {
        if (j20 != null) {
            const k20 = j20(i20);
            if (k20 != null && k20.length > 0) {
                const l20: string[] = [];
                for (let m20 = 0; m20 < k20.length; m20++) {
                    l20.push(k20[m20].id);
                }
                return l20;
            }
        }
        return ErcEngine.getPinDefs(i20);
    }
    private static checkMcuRequirements(v19: SchematicDocument, w19: Set<string>): ErcViolation[] {
        const x19: ErcViolation[] = [];
        const y19 = v19.components.filter(h20 => w19.has(h20.libraryId) ||
            h20.libraryId.includes('AT89') || h20.libraryId.includes('STC') || h20.libraryId.includes('STM32'));
        for (let z19 = 0; z19 < y19.length; z19++) {
            const a20 = y19[z19];
            const b20 = v19.components.some(g20 => g20.libraryId.includes('CRYSTAL') || g20.libraryId.includes('XTAL'));
            const c20 = v19.components.filter(f20 => f20.libraryId.startsWith('C_')).length >= 2;
            const d20 = v19.components.some(e20 => e20.libraryId.startsWith('R_'));
            if (!b20) {
                x19.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.MISSING_CRYSTAL, `MCU ${a20.refDes} 缺少晶振电路`, undefined, a20.id, undefined, '添加晶振及负载电容（通常 11.0592MHz 或 8MHz）'));
            }
            if (!c20) {
                x19.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.MISSING_RESET, `MCU ${a20.refDes} 可能缺少去耦/复位电容`, undefined, a20.id, undefined, '添加 100nF 去耦电容和 10kΩ 上拉电阻'));
            }
            if (!d20 && !c20) {
                x19.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.MISSING_RESET, `MCU ${a20.refDes} 复位电路可能不完整`, undefined, a20.id, undefined, '添加 RST 引脚 10kΩ 上拉和 100nF 电容'));
            }
        }
        return x19;
    }
    private static checkPowerPins(p19: SchematicDocument): ErcViolation[] {
        const q19: ErcViolation[] = [];
        let r19 = false;
        let s19 = false;
        for (let t19 = 0; t19 < p19.nets.length; t19++) {
            const u19 = p19.nets[t19];
            if (u19.type === NetType.POWER || u19.name === 'VCC' || u19.name === 'VDD') {
                r19 = true;
            }
            if (u19.type === NetType.GROUND || u19.name === 'GND' || u19.name === 'VSS') {
                s19 = true;
            }
        }
        if (!r19) {
            q19.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.POWER_REVERSED, '原理图缺少电源网络 (VCC/VDD)', undefined, undefined, undefined, '添加电源符号并连接到 MCU VCC 引脚'));
        }
        if (!s19) {
            q19.push(ErcEngine.makeViolation(ErcSeverity.ERROR, ErcRuleType.POWER_REVERSED, '原理图缺少地网络 (GND/VSS)', undefined, undefined, undefined, '添加地符号并连接到 MCU GND 引脚'));
        }
        return q19;
    }
    private static checkSubcircuitPorts(l19: SchematicDocument): ErcViolation[] {
        const m19: ErcViolation[] = [];
        for (let n19 = 0; n19 < l19.subcircuits.length; n19++) {
            const o19 = l19.subcircuits[n19];
            if (!o19.ports || o19.ports.length === 0) {
                m19.push(ErcEngine.makeViolation(ErcSeverity.WARNING, ErcRuleType.PORT_MISMATCH, `子电路 "${o19.name}" 未定义端口`, undefined, o19.id, undefined, '为子电路添加输入/输出端口定义'));
            }
        }
        return m19;
    }
    private static getPinDefs(k19: string): string[] {
        if (k19.startsWith('R_') || k19.startsWith('C_') ||
            k19.startsWith('L_') || k19.startsWith('XTAL_') ||
            k19.startsWith('FUSE_')) {
            return ['1', '2'];
        }
        if (k19.startsWith('LED_') || k19 === '1N4148' ||
            k19 === '1N4007' || k19 === '1N5819') {
            return ['A', 'K'];
        }
        if (k19 === 'SW_PUSH') {
            return ['1', '2'];
        }
        if (k19 === 'VCC')
            return ['1'];
        if (k19 === 'GND')
            return ['1'];
        if (k19 === 'VAC')
            return ['1', '2'];
        if (k19 === 'UA741')
            return ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'];
        if (k19 === 'LM358' || k19 === 'TL082') {
            return ['IN+1', 'IN-1', 'OUT1', 'IN+2', 'IN-2', 'OUT2', 'V+', 'V-'];
        }
        if (k19 === 'LM7805' || k19 === 'LM7812' || k19 === 'AMS1117_3V3') {
            return ['1', '2', '3'];
        }
        if (k19.includes('STM32F407')) {
            return ErcEngine.buildPinArray(100, 'P');
        }
        if (k19.includes('STM32')) {
            return ErcEngine.buildPinArray(48, 'P');
        }
        if (k19.includes('AT89') || k19.includes('STC')) {
            return ErcEngine.buildPinArray(40, 'P');
        }
        if (k19 === 'UART_TERMINAL')
            return ['TX', 'RX', 'GND'];
        if (k19 === 'LCD1602') {
            return ErcEngine.buildPinArray(16, '');
        }
        if (k19.includes('74HC04')) {
            return ['1', '2', '7', '14'];
        }
        if (k19.includes('74HC')) {
            return ['1', '2', '3', '7', '14'];
        }
        if (k19.includes('OSCILLOSCOPE'))
            return [];
        return ['1', '2'];
    }
    private static buildPinArray(g19: number, h19: string): string[] {
        const i19: string[] = [];
        for (let j19 = 0; j19 < g19; j19++) {
            i19.push(`${h19}${j19 + 1}`);
        }
        return i19;
    }
    private static estimatePinCount(f19: string): number {
        if (f19.startsWith('R_') || f19.startsWith('C_') || f19.startsWith('L_')) {
            return 2;
        }
        if (f19.includes('LED')) {
            return 2;
        }
        if (f19.includes('74HC')) {
            return 14;
        }
        if (f19.includes('STM32F407')) {
            return 100;
        }
        if (f19.includes('STM32')) {
            return 48;
        }
        if (f19.includes('AT89') || f19.includes('STC')) {
            return 40;
        }
        if (f19.includes('OSCILLOSCOPE')) {
            return 5;
        }
        return 2;
    }
    private static makeViolation(y18: ErcSeverity, z18: ErcRuleType, a19: string, b19?: string, c19?: string, d19?: string, e19?: string): ErcViolation {
        return {
            id: IdUtil.generate('erc'),
            severity: y18,
            ruleType: z18,
            message: a19,
            netId: b19,
            componentId: c19,
            pinId: d19,
            fixSuggestion: e19
        };
    }
}
