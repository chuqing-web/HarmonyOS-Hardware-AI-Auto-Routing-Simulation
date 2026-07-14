import { paramMapGet, parseVoltageVolts, parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface SpiceBuildResult {
    netlist: string;
    nodeMap: Map<string, string>;
    elementCount: number;
}
function hasPowerSource(b478: SchTopology): boolean {
    return b478.deviceList.some(c478 => {
        const d478 = c478.libDevId.toUpperCase();
        return d478.includes('VSOURCE') || d478.includes('VDC') || d478.includes('BATTERY') ||
            d478.includes('POWER') || d478.includes('SUPPLY') || d478.includes('VCC');
    });
}
function hasSignalSource(y477: SchTopology): boolean {
    return y477.deviceList.some(z477 => {
        const a478 = z477.libDevId.toUpperCase();
        return a478.includes('VSIN') || a478.includes('VPULSE') || a478.includes('SIGNAL') ||
            a478.includes('VSOURCE') || a478.includes('FUNC_GEN');
    });
}
export class SpiceMatrixBuilder {
    static build(u475: SchTopology, v475: number, w475: number, x475: number): SpiceBuildResult {
        let y475 = `* AI-Auto-Routing SPICE Netlist\n* Schematic: ${u475.schName}\n\n`;
        y475 += `.temp ${v475}\n\n`;
        const z475 = new Map<string, string>();
        const a476 = new Map<string, string>();
        let b476 = 1;
        for (const p477 of u475.netList) {
            const q477 = p477.netName.length > 0 ? p477.netName : p477.netUuid;
            if (q477 === 'GND' || q477 === '0') {
                z475.set(p477.netUuid, '0');
                z475.set(q477, '0');
            }
            else if (q477 === 'VCC' || q477 === 'VDD' || q477 === 'VDD_5V' || q477 === '+5V') {
                z475.set(p477.netUuid, 'VCC');
                z475.set(q477, 'VCC');
            }
            else if (q477 === 'VEE' || q477 === 'VSS' || q477 === '-5V') {
                z475.set(p477.netUuid, 'VEE');
                z475.set(q477, 'VEE');
            }
            else {
                const x477 = `N${b476++}`;
                z475.set(p477.netUuid, x477);
                z475.set(q477, x477);
            }
            for (let r477 = 0; r477 < p477.nodeList.length; r477++) {
                const s477 = p477.nodeList[r477];
                const t477 = z475.get(p477.netUuid) ?? '0';
                let u477 = s477.devUuid;
                let v477 = s477.pinId;
                if (u477.length === 0 && v477.includes(':')) {
                    const w477 = parsePinRef(v477);
                    if (w477 !== null && w477.compId.length > 0) {
                        u477 = w477.compId;
                        v477 = w477.pinId;
                    }
                }
                if (u477.length > 0) {
                    a476.set(`${u477}_${v477}`, t477);
                }
            }
        }
        z475.set('GND', '0');
        z475.set('0', '0');
        z475.set('VCC', 'VCC');
        z475.set('VEE', 'VEE');
        let c476 = 1;
        let d476 = 1;
        let e476 = 1;
        let f476 = 1;
        let g476 = 1;
        let h476 = 1;
        let i476 = 1;
        const j476 = hasPowerSource(u475);
        const k476 = hasSignalSource(u475);
        for (const l476 of u475.deviceList) {
            const m476 = l476.libDevId.toUpperCase();
            const n476 = paramMapGet(l476.params, 'value', '');
            const o476 = l476.params;
            const p476 = SpiceMatrixBuilder.resolveAllPins(l476, z475, a476);
            if (m476.startsWith('R_') || m476.includes('RESISTOR') || m476 === 'R') {
                const n477 = p476.get(0) ?? '0';
                const o477 = p476.get(1) ?? '0';
                y475 += `R${c476} ${n477} ${o477} ${SpiceMatrixBuilder.toSpiceValue(n476 || '1k')}\n`;
                c476++;
            }
            else if (m476.startsWith('C_') || m476.includes('CAP') || m476 === 'C') {
                const l477 = p476.get(0) ?? '0';
                const m477 = p476.get(1) ?? '0';
                y475 += `C${d476} ${l477} ${m477} ${SpiceMatrixBuilder.toSpiceValue(n476 || '100n')} IC=0\n`;
                d476++;
            }
            else if (m476.startsWith('L_') || m476.includes('INDUCTOR')) {
                const j477 = p476.get(0) ?? '0';
                const k477 = p476.get(1) ?? '0';
                y475 += `L${e476} ${j477} ${k477} ${SpiceMatrixBuilder.toSpiceValue(n476 || '10u')}\n`;
                e476++;
            }
            else if (m476.includes('LED') || m476.startsWith('1N') || m476.includes('DIODE') || m476 === 'D') {
                const h477 = p476.get(0) ?? '0';
                const i477 = p476.get(1) ?? '0';
                y475 += `D${g476} ${h477} ${i477} DMOD\n`;
                g476++;
            }
            else if (m476.includes('2N') || m476.includes('BC') || m476.includes('NPN') || m476.includes('PNP') ||
                m476.includes('NMOS') || m476.includes('PMOS')) {
                const e477 = p476.get(0) ?? '0';
                const f477 = p476.get(1) ?? '0';
                const g477 = p476.get(2) ?? '0';
                y475 += `Q${f476} ${e477} ${f477} ${g477} QMOD\n`;
                f476++;
            }
            else if (m476.includes('LM358') || m476.includes('LM324') || m476.includes('OPAMP') ||
                m476.includes('OP07') || m476.includes('UA741')) {
                const b477 = p476.get(0) ?? '0';
                const c477 = p476.get(1) ?? '0';
                const d477 = p476.get(2) ?? '0';
                y475 += `X${h476} ${b477} ${c477} ${d477} OPAMP\n`;
                h476++;
            }
            else if (m476.includes('VDC') || m476.includes('BATTERY') || m476.includes('POWER_5V') ||
                m476.includes('POWER_3V3')) {
                const y476 = p476.get(0) ?? 'VCC';
                const z476 = p476.get(1) ?? '0';
                const a477 = paramMapGet(o476, 'voltage', paramMapGet(o476, 'value', '5'));
                y475 += `V${i476} ${y476} ${z476} DC ${a477}\n`;
                i476++;
            }
            else if (m476 === 'VCC' || (m476.includes('VCC') && !m476.includes('MCU'))) {
                const v476 = p476.get(0) ?? 'VCC';
                const w476 = paramMapGet(o476, 'voltage', '5V');
                const x476 = `${parseVoltageVolts(w476, 5)}`;
                y475 += `V${i476} ${v476} 0 DC ${x476}\n`;
                i476++;
            }
            else if (m476 === 'GND' || m476.endsWith('/GND')) {
            }
            else if (m476.includes('VPULSE') || m476.includes('VSIN') || m476.includes('SIGNAL') ||
                m476.includes('FUNC_GEN')) {
                const q476 = p476.get(0) ?? 'IN';
                const r476 = p476.get(1) ?? '0';
                const s476 = paramMapGet(o476, 'amplitude', paramMapGet(o476, 'amp', '5'));
                const t476 = paramMapGet(o476, 'frequency', paramMapGet(o476, 'freq', '1k'));
                const u476 = paramMapGet(o476, 'offset', '0');
                y475 += `V${i476} ${q476} ${r476} SIN(${u476} ${s476} ${t476} 0 0 0)\n`;
                i476++;
            }
        }
        if (!j476) {
            y475 += `\n* Default DC supply (no explicit power source in schematic)\n`;
            y475 += `VSUPPLY VCC 0 DC 5\n`;
        }
        y475 += `\n.model DMOD D (IS=1e-14 RS=1 N=1.0)\n`;
        y475 += `.model QMOD NPN (BF=100 IS=1e-14 VAF=100)\n`;
        y475 += `.model OPAMP OPAMP (AOL=100k GBW=1Meg)\n`;
        y475 += `\n.tran ${w475} ${x475} UIC\n`;
        if (k476) {
            y475 += `.ac DEC 10 1 1Meg\n`;
            y475 += `.noise V(OUT) VIN DEC 10 1 1Meg\n`;
            y475 += `.tf V(OUT) VIN\n`;
        }
        y475 += `.end\n`;
        return { netlist: y475, nodeMap: z475, elementCount: c476 + d476 + e476 + f476 + g476 + h476 + i476 };
    }
    private static resolveAllPins(j475: DeviceInst, k475: Map<string, string>, l475: Map<string, string>): Map<number, string> {
        const m475 = new Map<number, string>();
        const n475 = `${j475.instUuid}_`;
        const o475 = Array.from(l475.keys()).filter(t475 => t475.startsWith(n475));
        o475.sort();
        for (let s475 = 0; s475 < o475.length; s475++) {
            m475.set(s475, l475.get(o475[s475]) ?? '0');
        }
        if (m475.size === 0) {
            const p475 = ['A', 'B', 'C', 'E', 'G', 'S', 'D', 'K', '+', '-', 'OUT', 'IN', 'VCC', 'GND'];
            for (let q475 = 0; q475 < p475.length; q475++) {
                const r475 = `${j475.instUuid}_${p475[q475]}`;
                if (l475.has(r475)) {
                    m475.set(m475.size, l475.get(r475)!);
                }
            }
        }
        return m475;
    }
    private static toSpiceValue(i475: string): string {
        if (i475.includes('k') || i475.includes('K'))
            return i475.replace(/[Kk]/, 'k');
        if (i475.includes('M') && !i475.includes('Meg'))
            return i475.replace('M', 'Meg');
        if (i475.includes('u') || i475.includes('µ'))
            return i475.replace(/[µu]/, 'u');
        if (i475.includes('n'))
            return i475;
        if (i475.includes('p'))
            return i475;
        return i475.length > 0 ? i475 : '1k';
    }
}
