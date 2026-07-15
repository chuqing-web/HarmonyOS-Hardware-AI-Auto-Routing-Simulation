import { paramMapGet, parseVoltageVolts, parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface SpiceBuildResult {
    netlist: string;
    nodeMap: Map<string, string>;
    elementCount: number;
}
/** Detect if the topology already has a DC voltage/power source component */
function hasPowerSource(topo: SchTopology): boolean {
    return topo.deviceList.some(d => {
        const lib = d.libDevId.toUpperCase();
        return lib.includes('VSOURCE') || lib.includes('VDC') || lib.includes('BATTERY') ||
            lib.includes('POWER') || lib.includes('SUPPLY') || lib.includes('VCC');
    });
}
/** Detect if the topology has a signal source (pulse, sine, etc.) */
function hasSignalSource(topo: SchTopology): boolean {
    return topo.deviceList.some(d => {
        const lib = d.libDevId.toUpperCase();
        return lib.includes('VSIN') || lib.includes('VPULSE') || lib.includes('SIGNAL') ||
            lib.includes('VSOURCE') || lib.includes('FUNC_GEN');
    });
}
export class SpiceMatrixBuilder {
    static build(topo: SchTopology, tempC: number, stepSize: number, stopTime: number): SpiceBuildResult {
        let nl = `* AI-Auto-Routing SPICE Netlist\n* Schematic: ${topo.schName}\n\n`;
        nl += `.temp ${tempC}\n\n`;
        const nodeMap = new Map<string, string>();
        const pinMap = new Map<string, string>();
        let nodeIdx = 1; // Start from 1, 0 is GND
        // Map nets to SPICE nodes
        for (const net of topo.netList) {
            const name = net.netName.length > 0 ? net.netName : net.netUuid;
            if (name === 'GND' || name === '0') {
                nodeMap.set(net.netUuid, '0');
                nodeMap.set(name, '0');
            }
            else if (name === 'VCC' || name === 'VDD' || name === 'VDD_5V' || name === '+5V') {
                nodeMap.set(net.netUuid, 'VCC');
                nodeMap.set(name, 'VCC');
            }
            else if (name === 'VEE' || name === 'VSS' || name === '-5V') {
                nodeMap.set(net.netUuid, 'VEE');
                nodeMap.set(name, 'VEE');
            }
            else {
                const spiceNode = `N${nodeIdx++}`;
                nodeMap.set(net.netUuid, spiceNode);
                nodeMap.set(name, spiceNode);
            }
            // Map pin references on this net
            for (let ni = 0; ni < net.nodeList.length; ni++) {
                const ref = net.nodeList[ni];
                const spiceNode = nodeMap.get(net.netUuid) ?? '0';
                let devUuid = ref.devUuid;
                let pinId = ref.pinId;
                if (devUuid.length === 0 && pinId.includes(':')) {
                    const parsed = parsePinRef(pinId);
                    if (parsed !== null && parsed.compId.length > 0) {
                        devUuid = parsed.compId;
                        pinId = parsed.pinId;
                    }
                }
                if (devUuid.length > 0) {
                    pinMap.set(`${devUuid}_${pinId}`, spiceNode);
                }
            }
        }
        nodeMap.set('GND', '0');
        nodeMap.set('0', '0');
        nodeMap.set('VCC', 'VCC');
        nodeMap.set('VEE', 'VEE');
        let rCount = 1;
        let cCount = 1;
        let lCount = 1;
        let qCount = 1;
        let dCount = 1;
        let xCount = 1;
        let vCount = 1;
        const hasPower = hasPowerSource(topo);
        const hasSignal = hasSignalSource(topo);
        for (const dev of topo.deviceList) {
            const lib = dev.libDevId.toUpperCase();
            const val = paramMapGet(dev.params, 'value', '');
            const params = dev.params;
            // Resolve nodes using actual pin connections from topology
            const pinNodes = SpiceMatrixBuilder.resolveAllPins(dev, nodeMap, pinMap);
            if (lib.startsWith('R_') || lib.includes('RESISTOR') || lib === 'R') {
                const n1 = pinNodes.get(0) ?? '0';
                const n2 = pinNodes.get(1) ?? '0';
                nl += `R${rCount} ${n1} ${n2} ${SpiceMatrixBuilder.toSpiceValue(val || '1k')}\n`;
                rCount++;
            }
            else if (lib.startsWith('C_') || lib.includes('CAP') || lib === 'C') {
                const n1 = pinNodes.get(0) ?? '0';
                const n2 = pinNodes.get(1) ?? '0';
                nl += `C${cCount} ${n1} ${n2} ${SpiceMatrixBuilder.toSpiceValue(val || '100n')} IC=0\n`;
                cCount++;
            }
            else if (lib.startsWith('L_') || lib.includes('INDUCTOR')) {
                const n1 = pinNodes.get(0) ?? '0';
                const n2 = pinNodes.get(1) ?? '0';
                nl += `L${lCount} ${n1} ${n2} ${SpiceMatrixBuilder.toSpiceValue(val || '10u')}\n`;
                lCount++;
            }
            else if (lib.startsWith('LED') || lib.startsWith('1N') || lib.includes('DIODE') || lib === 'D') {
                const nA = pinNodes.get(0) ?? '0';
                const nK = pinNodes.get(1) ?? '0';
                nl += `D${dCount} ${nA} ${nK} DMOD\n`;
                dCount++;
            }
            else if (lib.includes('2N') || lib.includes('BC') || lib.includes('NPN') || lib.includes('PNP') ||
                lib.includes('NMOS') || lib.includes('PMOS')) {
                const nc = pinNodes.get(0) ?? '0';
                const nb = pinNodes.get(1) ?? '0';
                const ne = pinNodes.get(2) ?? '0';
                nl += `Q${qCount} ${nc} ${nb} ${ne} QMOD\n`;
                qCount++;
            }
            else if (lib.includes('LM358') || lib.includes('LM324') || lib.includes('OPAMP') ||
                lib.includes('OP07') || lib.includes('UA741')) {
                const nPlus = pinNodes.get(0) ?? '0';
                const nMinus = pinNodes.get(1) ?? '0';
                const nOut = pinNodes.get(2) ?? '0';
                nl += `X${xCount} ${nPlus} ${nMinus} ${nOut} OPAMP\n`;
                xCount++;
            }
            else if (lib.includes('VDC') || lib.includes('BATTERY') || lib.includes('POWER_5V') ||
                lib.includes('POWER_3V3')) {
                const nPos = pinNodes.get(0) ?? 'VCC';
                const nNeg = pinNodes.get(1) ?? '0';
                const voltage = paramMapGet(params, 'voltage', paramMapGet(params, 'value', '5'));
                nl += `V${vCount} ${nPos} ${nNeg} DC ${voltage}\n`;
                vCount++;
            }
            else if (lib === 'VCC' || (lib.includes('VCC') && !lib.includes('MCU'))) {
                const nPos = pinNodes.get(0) ?? 'VCC';
                const voltageRaw = paramMapGet(params, 'voltage', '5V');
                const voltage = `${parseVoltageVolts(voltageRaw, 5)}`;
                nl += `V${vCount} ${nPos} 0 DC ${voltage}\n`;
                vCount++;
            }
            else if (lib === 'GND' || lib.endsWith('/GND')) {
                // GND symbol — reference node only
            }
            else if (lib === 'SW_PUSH' || lib.includes('SWITCH_PUSH') || lib === 'BUTTON') {
                const n1 = pinNodes.get(0) ?? '0';
                const n2 = pinNodes.get(1) ?? '0';
                const pressed = paramMapGet(params, 'pressed', '0').trim().toLowerCase();
                const closed = pressed === '1' || pressed === 'true' || pressed === 'on' || pressed === 'pressed';
                nl += `R${rCount} ${n1} ${n2} ${closed ? '0.01' : '1G'}\n`;
                rCount++;
            }
            else if (lib === 'RELAY_SPDT' || lib.includes('RELAY')) {
                const n1 = pinNodes.get(0) ?? '0';
                const n2 = pinNodes.get(1) ?? '0';
                nl += `R${rCount} ${n1} ${n2} 400\n`; // coil
                rCount++;
            }
            else if (lib === 'BUZZER' || lib.includes('BUZZER')) {
                const n1 = pinNodes.get(0) ?? '0';
                const n2 = pinNodes.get(1) ?? '0';
                nl += `R${rCount} ${n1} ${n2} 330\n`;
                rCount++;
            }
            else if (lib.includes('VPULSE') || lib.includes('VSIN') || lib.includes('SIGNAL') ||
                lib.includes('FUNC_GEN')) {
                const nPos = pinNodes.get(0) ?? 'IN';
                const nNeg = pinNodes.get(1) ?? '0';
                const amp = paramMapGet(params, 'amplitude', paramMapGet(params, 'amp', '5'));
                const freq = paramMapGet(params, 'frequency', paramMapGet(params, 'freq', '1k'));
                const offset = paramMapGet(params, 'offset', '0');
                nl += `V${vCount} ${nPos} ${nNeg} SIN(${offset} ${amp} ${freq} 0 0 0)\n`;
                vCount++;
            }
        }
        // Only add default DC source if no explicit power source exists
        if (!hasPower) {
            nl += `\n* Default DC supply (no explicit power source in schematic)\n`;
            nl += `VSUPPLY VCC 0 DC 5\n`;
        }
        // Models
        nl += `\n.model DMOD D (IS=1e-14 RS=1 N=1.0)\n`;
        nl += `.model QMOD NPN (BF=100 IS=1e-14 VAF=100)\n`;
        nl += `.model OPAMP OPAMP (AOL=100k GBW=1Meg)\n`;
        // Analysis
        nl += `\n.tran ${stepSize} ${stopTime} UIC\n`;
        // Add AC/DC/Noise only if there's a signal source to stimulate
        if (hasSignal) {
            nl += `.ac DEC 10 1 1Meg\n`;
            nl += `.noise V(OUT) VIN DEC 10 1 1Meg\n`;
            nl += `.tf V(OUT) VIN\n`;
        }
        nl += `.end\n`;
        return { netlist: nl, nodeMap: nodeMap, elementCount: rCount + cCount + lCount + qCount + dCount + xCount + vCount };
    }
    /** Resolve all pins of a device to their SPICE node names, indexed by position */
    private static resolveAllPins(dev: DeviceInst, nodeMap: Map<string, string>, pinMap: Map<string, string>): Map<number, string> {
        const result = new Map<number, string>();
        const prefix = `${dev.instUuid}_`;
        const keys = Array.from(pinMap.keys()).filter(k => k.startsWith(prefix));
        keys.sort();
        for (let i = 0; i < keys.length; i++) {
            result.set(i, pinMap.get(keys[i]) ?? '0');
        }
        // Fallback: try common pin names A, B, C, etc.
        if (result.size === 0) {
            const commonPins = ['A', 'B', 'C', 'E', 'G', 'S', 'D', 'K', '+', '-', 'OUT', 'IN', 'VCC', 'GND'];
            for (let i = 0; i < commonPins.length; i++) {
                const pinKey = `${dev.instUuid}_${commonPins[i]}`;
                if (pinMap.has(pinKey)) {
                    result.set(result.size, pinMap.get(pinKey)!);
                }
            }
        }
        return result;
    }
    private static toSpiceValue(val: string): string {
        if (val.includes('k') || val.includes('K'))
            return val.replace(/[Kk]/, 'k');
        if (val.includes('M') && !val.includes('Meg'))
            return val.replace('M', 'Meg');
        if (val.includes('u') || val.includes('µ'))
            return val.replace(/[µu]/, 'u');
        if (val.includes('n'))
            return val;
        if (val.includes('p'))
            return val;
        return val.length > 0 ? val : '1k';
    }
}
