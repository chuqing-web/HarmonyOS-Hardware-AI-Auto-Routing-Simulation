import { paramMapGet, parseVoltageVolts, traceAnalogOpSummary, summarizeNetPins, traceAnalogDeviceStamp, traceSpiceNodeMap, traceAnalogNetlistSummary, Logger, INSTR_TRACE_TAG, UnitParser } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, SimulationConfig, ComponentInstance, AnalogResistorStamp } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface MnaStamp {
    row: number;
    col: number;
    value: number;
}
interface ResistorEntry {
    id: string;
    nodeA: string;
    nodeB: string;
    resistance: number;
}
interface CapacitorEntry {
    id: string;
    nodeA: string;
    nodeB: string;
    capacitance: number;
    voltage: number;
    prevVoltage: number;
    geq: number;
    ieq: number;
}
interface InductorEntry {
    id: string;
    nodeA: string;
    nodeB: string;
    inductance: number;
    current: number;
    prevCurrent: number;
    prevVoltage: number;
    ieqStamp: number;
}
interface DiodeModel {
    id: string;
    nodeA: string;
    nodeB: string;
    is: number;
    n: number;
    vt: number;
    rs: number;
}
interface BjtModel {
    id: string;
    nodeC: string;
    nodeB: string;
    nodeE: string;
    type: 'npn' | 'pnp';
    is: number;
    bf: number;
    nf: number;
    vaf: number;
}
interface MosfetModel {
    id: string;
    nodeD: string;
    nodeG: string;
    nodeS: string;
    nodeB: string;
    type: 'nmos' | 'pmos';
    kp: number;
    vto: number;
    lambda: number;
    w: number;
    l: number;
}
interface OpAmpModel {
    id: string;
    nodeOut: string;
    nodeInP: string;
    nodeInN: string;
    nodeVcc: string;
    nodeVee: string;
    gain: number;
    bw: number;
}
interface VoltageSourceEntry {
    id: string;
    nodeA: string;
    nodeB: string;
    voltage: number;
    waveform: string;
    freq: number;
    amplitude: number;
    phase: number;
    dutyCycle: number;
    riseTime: number;
    fallTime: number;
}
interface PinNetMapping {
    pinId: string;
    pinName: string;
    netId: string;
}
export class AnalogEngine {
    private netlist: string = '';
    private nodeVoltages: Map<string, number> = new Map();
    private branchCurrents: Map<string, number> = new Map();
    private nodeIndex: Map<string, number> = new Map();
    private resistors: ResistorEntry[] = [];
    private capacitors: CapacitorEntry[] = [];
    private inductors: InductorEntry[] = [];
    private diodes: DiodeModel[] = [];
    private bjts: BjtModel[] = [];
    private mosfets: MosfetModel[] = [];
    private opamps: OpAmpModel[] = [];
    private voltageSources: VoltageSourceEntry[] = [];
    private simTime: number = 0;
    private lastStepSize: number = 1e-6;
    private lastConverged: boolean = true;
    private matrixSize: number = 0;
    private mnaG: number[] = [];
    private mnaRhs: number[] = [];
    private newtonIterations: number = 0;
    private maxNewtonIter: number = 50;
    private gndRow: number = 0;
    private compPinNets: Map<string, PinNetMapping[]> = new Map();
    private netUuidToNode: Map<string, string> = new Map();
    private compUuidToDevId: Map<string, string[]> = new Map();
    loadSchematic(p462: SchematicDocument, q462: SimulationConfig): void {
        this.netUuidToNode.clear();
        this.compUuidToDevId.clear();
        this.compPinNets.clear();
        this.nodeVoltages.clear();
        this.branchCurrents.clear();
        this.netlist = this.generateNetlist(p462, q462);
        this.buildDeviceModels(p462);
        traceSpiceNodeMap(this.netUuidToNode);
        this.buildNodeIndex(p462);
        this.nodeVoltages.set('0', 0);
        this.nodeVoltages.set('GND', 0);
        this.nodeVoltages.set('VCC', 5.0);
        this.simTime = q462.startTime;
        this.runOpAnalysis();
        const r462: string[] = [];
        let s462 = 0;
        this.nodeVoltages.forEach((u462: number, v462: string) => {
            if (s462 >= 6) {
                return;
            }
            if (Math.abs(u462) > 1e-9 || v462 === 'VCC' || v462 === '0') {
                r462.push(`${v462}=${u462.toFixed(3)}V`);
                s462++;
            }
        });
        traceAnalogOpSummary(this.resistors.length, this.voltageSources.length, this.lastConverged, r462.join(', '));
        if (this.resistors.length > 0) {
            const t462 = this.resistors[0];
            Logger.info(INSTR_TRACE_TAG, `analog R0 ${t462.id} ${t462.nodeA}->${t462.nodeB} ${t462.resistance}Ω nets=${summarizeNetPins(p462, 4)}`);
        }
    }
    getNodeNameForNetUuid(o462: string): string {
        return this.netUuidToNode.get(o462) ?? '';
    }
    getNetUuidMapping(): Map<string, string> {
        return new Map(this.netUuidToNode);
    }
    getVoltage(l462: string): number {
        const m462 = this.nodeVoltages.get(l462);
        if (m462 !== undefined)
            return m462;
        const n462 = this.netUuidToNode.get(l462);
        if (n462 !== undefined)
            return this.nodeVoltages.get(n462) ?? 0;
        return 0;
    }
    getNetCurrent(e462: string): number {
        const f462 = this.netUuidToNode.get(e462) ?? e462;
        let g462 = 0;
        for (const i462 of this.resistors) {
            if (i462.nodeA === f462 || i462.nodeB === f462) {
                const j462 = this.nodeVoltages.get(i462.nodeA) ?? 0;
                const k462 = this.nodeVoltages.get(i462.nodeB) ?? 0;
                g462 += (j462 - k462) / Math.max(i462.resistance, 1e-12);
            }
        }
        for (const h462 of this.capacitors) {
            if (h462.nodeA === f462 || h462.nodeB === f462) {
                g462 += this.branchCurrents.get(`I(${h462.id})`) ?? 0;
            }
        }
        return g462;
    }
    getResistanceBetweenNets(z461: string, a462: string): number {
        const b462 = this.netUuidToNode.get(z461) ?? z461;
        const c462 = this.netUuidToNode.get(a462) ?? a462;
        for (const d462 of this.resistors) {
            if ((d462.nodeA === b462 && d462.nodeB === c462) || (d462.nodeA === c462 && d462.nodeB === b462)) {
                return d462.resistance;
            }
        }
        return Infinity;
    }
    generateNetlist(w460: SchematicDocument, x460: SimulationConfig): string {
        let y460 = `* ElecDraw MNA Netlist (circuit-connected)\n* ${w460.name}\n\n`;
        y460 += `.temp ${x460.temperature}\n\n`;
        const z460 = this.buildNetNodeMap(w460);
        let a461 = 1;
        let b461 = 1;
        let c461 = 1;
        let d461 = 1;
        let e461 = 1;
        for (const f461 of w460.components) {
            const g461 = f461.libraryId.toUpperCase();
            const h461 = this.getPinNetConnections(f461.id, w460);
            const i461 = this.resolvePassiveTerminals(f461, h461, z460);
            const j461 = i461[0];
            const k461 = i461[1];
            if (g461.startsWith('R_') || g461.includes('RESISTOR')) {
                const y461 = paramMapGet(f461.parameters, 'value', g461.replace('R_', ''));
                y460 += `R${a461} ${j461} ${k461} ${this.toSpiceValue(y461)}\n`;
                a461++;
            }
            else if (g461.startsWith('FUSE') || g461.includes('FUSE')) {
                y460 += `R${a461} ${j461} ${k461} 0.01\n`;
                a461++;
            }
            else if (g461.startsWith('C_') || g461.includes('CAP')) {
                const x461 = paramMapGet(f461.parameters, 'value', g461.replace('C_', ''));
                y460 += `C${b461} ${j461} ${k461} ${this.toSpiceValue(x461)} IC=0\n`;
                b461++;
            }
            else if (g461.includes('LED') || g461.startsWith('1N') || g461.includes('DIODE')) {
                y460 += `D${c461} ${j461} ${k461} DMOD\n`;
                c461++;
            }
            else if (g461.includes('NPN') || g461.includes('PNP') || g461.includes('2N') || g461.includes('BC')) {
                const v461 = this.resolveCompNode(f461, 'C', h461, z460);
                const w461 = this.resolveCompNode(f461, 'E', h461, z460);
                y460 += `Q${d461} ${v461} ${k461} ${w461} ${g461.includes('PNP') ? 'PNP' : 'NPN'}\n`;
                d461++;
            }
            else if (g461.includes('LM358') || g461.includes('LM324') || g461.includes('OP')) {
                const s461 = this.resolveCompNode(f461, 'OUT', h461, z460);
                const t461 = this.resolveCompNode(f461, '+', h461, z460);
                const u461 = this.resolveCompNode(f461, '-', h461, z460);
                y460 += `X${e461} ${t461} ${u461} ${s461} VCC GND OPA\n`;
                e461++;
            }
            else if (g461.includes('LM7805') || g461.includes('LM7812') ||
                g461.includes('AMS1117') || g461.includes('REGULATOR')) {
                const o461 = this.resolveCompNode(f461, 'OUT', h461, z460);
                const p461 = this.resolveCompNode(f461, 'GND', h461, z460);
                let q461 = '5';
                if (g461.includes('7812')) {
                    q461 = '12';
                }
                else if (g461.includes('3V3') || g461.includes('1117')) {
                    q461 = '3.3';
                }
                const r461 = parseVoltageVolts(paramMapGet(f461.parameters, 'output', `${q461}V`), parseFloat(q461));
                y460 += `VREG${a461} ${o461} ${p461} DC ${r461}\n`;
                a461++;
            }
            else if (g461.includes('VCC') || g461.includes('POWER') || g461.includes('VDD')) {
                const m461 = this.resolveSupplyNode(f461, h461, z460, 'VCC');
                const n461 = parseVoltageVolts(paramMapGet(f461.parameters, 'voltage', '5V'), 5);
                y460 += `V${a461} ${m461} GND DC ${n461}\n`;
                a461++;
            }
            else if (g461.includes('GND')) {
                const l461 = this.resolveSupplyNode(f461, h461, z460, '0');
                y460 += `* GND reference at ${l461}\n`;
            }
        }
        y460 += `.model DMOD D (IS=1e-14 RS=0.5 N=1.0)\n`;
        y460 += `.subckt OPA IN+ IN- OUT VCC VEE\n`;
        y460 += `E1 OUT 0 VCC VEE IN+ IN- 100k\n.ends\n`;
        y460 += `.tran ${x460.stepSize} ${x460.stopTime}\n.op\n.end\n`;
        return y460;
    }
    private buildNetNodeMap(p460: SchematicDocument): Map<string, string> {
        const q460 = new Map<string, string>();
        q460.set('GND', '0');
        let r460 = 1;
        for (const s460 of p460.nets) {
            const t460 = s460.name === 'GND' || s460.name === '0';
            const u460 = s460.name === 'VCC' || s460.name === 'VDD' || s460.name === 'V+';
            let v460: string;
            if (t460) {
                v460 = '0';
            }
            else if (u460) {
                v460 = 'VCC';
            }
            else if (s460.name.length > 0) {
                v460 = s460.name;
            }
            else {
                v460 = `N${r460++}`;
            }
            q460.set(s460.id, v460);
            this.netUuidToNode.set(s460.id, v460);
        }
        this.netUuidToNode.set('GND', '0');
        this.netUuidToNode.set('0', '0');
        return q460;
    }
    private getPinNetConnections(i460: string, j460: SchematicDocument): PinNetMapping[] {
        const k460 = this.compPinNets.get(i460);
        if (k460)
            return k460;
        const l460: PinNetMapping[] = [];
        for (const m460 of j460.nets) {
            for (const n460 of m460.pinIds) {
                const o460 = n460.split(':');
                if (o460.length >= 2 && o460[0] === i460) {
                    l460.push({ pinId: o460[1], pinName: o460[2] ?? o460[1], netId: m460.id });
                }
            }
        }
        this.compPinNets.set(i460, l460);
        return l460;
    }
    private resolveCompNode(v459: ComponentInstance, w459: string, x459: PinNetMapping[], y459: Map<string, string>): string {
        const z459 = w459.toUpperCase();
        for (const f460 of x459) {
            const g460 = f460.pinName.toUpperCase();
            const h460 = f460.pinId.toUpperCase();
            if (g460 === z459 || h460 === z459) {
                return y459.get(f460.netId) ?? `NC_${v459.id}_${w459}`;
            }
        }
        for (const c460 of x459) {
            const d460 = c460.pinName.toUpperCase();
            const e460 = c460.pinId.toUpperCase();
            if (d460.startsWith(z459) || e460.startsWith(z459)) {
                return y459.get(c460.netId) ?? `NC_${v459.id}_${w459}`;
            }
        }
        if (x459.length > 0) {
            const a460 = parseInt(w459);
            if (!isNaN(a460) && a460 >= 1 && a460 <= x459.length) {
                return y459.get(x459[a460 - 1].netId) ?? `N_${v459.id}_${w459}`;
            }
            const b460 = w459.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
            if (b460 >= 0 && b460 < x459.length) {
                return y459.get(x459[b460].netId) ?? `N_${v459.id}_${w459}`;
            }
        }
        return `N_${v459.id}_${w459}`;
    }
    private resolvePassiveTerminals(j459: ComponentInstance, k459: PinNetMapping[], l459: Map<string, string>): [
        string,
        string
    ] {
        if (k459.length >= 2) {
            const t459 = l459.get(k459[0].netId) ?? `NC_${j459.id}_A`;
            const u459 = l459.get(k459[1].netId) ?? `NC_${j459.id}_B`;
            if (t459 !== u459 && !this.isFloatingNode(t459) && !this.isFloatingNode(u459)) {
                return [t459, u459];
            }
        }
        const m459 = [
            ['A', 'K'], ['A', 'B'], ['1', '2'], ['P1', 'P2'],
            ['+', '-'], ['ANODE', 'CATHODE'], ['PLUS', 'MINUS']
        ];
        for (const o459 of m459) {
            const p459 = o459[0];
            const q459 = o459[1];
            const r459 = this.resolveCompNode(j459, p459, k459, l459);
            const s459 = this.resolveCompNode(j459, q459, k459, l459);
            if (r459 !== s459 && !this.isFloatingNode(r459) && !this.isFloatingNode(s459)) {
                return [r459, s459];
            }
        }
        if (k459.length >= 2) {
            return [
                l459.get(k459[0].netId) ?? `NC_${j459.id}_A`,
                l459.get(k459[1].netId) ?? `NC_${j459.id}_B`
            ];
        }
        if (k459.length === 1) {
            const n459 = l459.get(k459[0].netId) ?? `NC_${j459.id}_1`;
            return [n459, `NC_${j459.id}_2`];
        }
        return [`NC_${j459.id}_A`, `NC_${j459.id}_B`];
    }
    private resolveInstrumentTerminals(b459: ComponentInstance, c459: PinNetMapping[], d459: Map<string, string>, e459: string): [
        string,
        string
    ] {
        if (e459.includes('VOLTMETER') || (e459.includes('METER') && !e459.includes('AMMETER'))) {
            const h459 = this.resolveCompNode(b459, 'V+', c459, d459);
            const i459 = this.resolveCompNode(b459, 'COM', c459, d459);
            return [h459, i459];
        }
        if (e459.includes('AMMETER')) {
            const f459 = this.resolveCompNode(b459, 'I+', c459, d459);
            const g459 = this.resolveCompNode(b459, 'I-', c459, d459);
            return [f459, g459];
        }
        return this.resolvePassiveTerminals(b459, c459, d459);
    }
    private resolveSupplyNode(u458: ComponentInstance, v458: PinNetMapping[], w458: Map<string, string>, x458: string): string {
        for (const z458 of ['VCC', 'VDD', 'V+', 'GND', '1', 'A']) {
            const a459 = this.resolveCompNode(u458, z458, v458, w458);
            if (!this.isFloatingNode(a459)) {
                return a459;
            }
        }
        if (v458.length > 0) {
            const y458 = w458.get(v458[0].netId);
            if (y458 !== undefined && !this.isFloatingNode(y458)) {
                return y458;
            }
        }
        return `NC_${u458.id}_${x458}`;
    }
    private areTerminalsConnected(s458: string, t458: string): boolean {
        return !this.isFloatingNode(s458) && !this.isFloatingNode(t458) && s458 !== t458;
    }
    private isFloatingNode(r458: string): boolean {
        if (r458.startsWith('NC_')) {
            return true;
        }
        if (r458.startsWith('N_')) {
            return true;
        }
        return false;
    }
    private buildNodeIndex(e458: SchematicDocument): void {
        this.nodeIndex.clear();
        this.nodeIndex.set('0', 0);
        let f458 = 1;
        const g458 = (p458: string): void => {
            if (p458.length === 0) {
                return;
            }
            const q458 = p458 === 'GND' ? '0' : p458;
            if (q458 === '0' || this.nodeIndex.has(q458)) {
                return;
            }
            this.nodeIndex.set(q458, f458++);
        };
        this.netUuidToNode.forEach((o458: string) => {
            g458(o458);
        });
        for (const n458 of this.resistors) {
            g458(n458.nodeA);
            g458(n458.nodeB);
        }
        for (const m458 of this.capacitors) {
            g458(m458.nodeA);
            g458(m458.nodeB);
        }
        for (const l458 of this.inductors) {
            g458(l458.nodeA);
            g458(l458.nodeB);
        }
        for (const k458 of this.diodes) {
            g458(k458.nodeA);
            g458(k458.nodeB);
        }
        for (const j458 of this.voltageSources) {
            g458(j458.nodeA);
            g458(j458.nodeB);
        }
        for (const i458 of this.bjts) {
            g458(i458.nodeC);
            g458(i458.nodeB);
            g458(i458.nodeE);
        }
        for (const h458 of this.opamps) {
            g458(h458.nodeOut);
            g458(h458.nodeInP);
            g458(h458.nodeInN);
            g458(h458.nodeVcc);
            g458(h458.nodeVee);
        }
        if (!this.nodeIndex.has('VCC')) {
            g458('VCC');
        }
        this.matrixSize = f458 + this.voltageSources.length + 10;
    }
    private buildDeviceModels(a455: SchematicDocument): void {
        this.resistors = [];
        this.capacitors = [];
        this.inductors = [];
        this.diodes = [];
        this.bjts = [];
        this.mosfets = [];
        this.opamps = [];
        this.voltageSources = [];
        this.compPinNets.clear();
        const b455 = this.buildNetNodeMap(a455);
        const c455 = 0.02585;
        let d455 = 0;
        let e455 = 0;
        let f455 = 0;
        let g455 = 0;
        let h455 = 0;
        for (const t455 of a455.components) {
            const u455 = t455.libraryId.toUpperCase();
            const v455 = this.getPinNetConnections(t455.id, a455);
            const w455 = this.resolvePassiveTerminals(t455, v455, b455);
            const x455 = w455[0];
            const y455 = w455[1];
            if (u455.startsWith('R_') || u455.includes('RESISTOR')) {
                if (!this.areTerminalsConnected(x455, y455)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${t455.refDes}: resistor pin(s) not wired`);
                    continue;
                }
                const x457 = paramMapGet(t455.parameters, 'value', '');
                const y457 = u455.replace(/^(R_|RESISTOR_?)/i, '');
                const z457 = this.withUnitSuffix(x457, y457);
                const a458 = this.parseResistance(z457);
                const b458 = `R${d455++}`;
                Logger.info(INSTR_TRACE_TAG, `analog R-dev ${t455.refDes} lib=${t455.libraryId} val="${x457}" fallback="${y457}" corrected="${z457}" → ${a458}Ω`);
                this.resistors.push({ id: b458, nodeA: x455, nodeB: y455, resistance: a458 });
                this.compUuidToDevId.set(t455.id, [b458]);
                traceAnalogDeviceStamp(t455.refDes, b458, t455.libraryId, x455, y455, `${a458}Ω pins=[${AnalogEngine.formatPinNetDetail(v455, b455)}]`);
                for (const c458 of v455) {
                    const d458 = b455.get(c458.netId);
                    if (d458)
                        this.netUuidToNode.set(c458.netId, d458);
                }
            }
            else if (u455.startsWith('FUSE') || u455.includes('FUSE')) {
                if (!this.areTerminalsConnected(x455, y455)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${t455.refDes}: fuse pin(s) not wired`);
                    continue;
                }
                const u457 = `R${d455++}`;
                this.resistors.push({ id: u457, nodeA: x455, nodeB: y455, resistance: 0.01 });
                this.compUuidToDevId.set(t455.id, [u457]);
                traceAnalogDeviceStamp(t455.refDes, u457, t455.libraryId, x455, y455, `0.01Ω FUSE pins=[${AnalogEngine.formatPinNetDetail(v455, b455)}]`);
                for (const v457 of v455) {
                    const w457 = b455.get(v457.netId);
                    if (w457)
                        this.netUuidToNode.set(v457.netId, w457);
                }
            }
            else if (u455.startsWith('C_') || u455.includes('CAP')) {
                if (!this.areTerminalsConnected(x455, y455)) {
                    continue;
                }
                const o457 = paramMapGet(t455.parameters, 'value', '');
                const p457 = u455.replace(/^(C_|CAP_?)/i, '');
                const q457 = this.parseCapacitance(this.withUnitSuffix(o457, p457));
                const r457 = `C${e455}`;
                this.capacitors.push({
                    id: r457, nodeA: x455, nodeB: y455,
                    capacitance: q457,
                    voltage: 0, prevVoltage: 0, geq: 0, ieq: 0
                });
                this.compUuidToDevId.set(t455.id, [r457]);
                e455++;
                for (const s457 of v455) {
                    const t457 = b455.get(s457.netId);
                    if (t457)
                        this.netUuidToNode.set(s457.netId, t457);
                }
            }
            else if (u455.startsWith('L_') || u455.includes('INDUCTOR')) {
                if (!this.areTerminalsConnected(x455, y455)) {
                    continue;
                }
                const i457 = paramMapGet(t455.parameters, 'value', '');
                const j457 = u455.replace(/^L_/i, '');
                const k457 = this.parseInductance(this.withUnitSuffix(i457, j457 || '1m'));
                const l457 = `L${e455}`;
                this.inductors.push({
                    id: l457, nodeA: x455, nodeB: y455,
                    inductance: k457,
                    current: 0, prevCurrent: 0, prevVoltage: 0, ieqStamp: 0
                });
                this.compUuidToDevId.set(t455.id, [l457]);
                e455++;
                for (const m457 of v455) {
                    const n457 = b455.get(m457.netId);
                    if (n457)
                        this.netUuidToNode.set(m457.netId, n457);
                }
            }
            else if (u455.includes('LED') || u455.startsWith('1N') || u455.includes('DIODE')) {
                if (!this.areTerminalsConnected(x455, y455)) {
                    continue;
                }
                const f457 = `D${f455++}`;
                this.diodes.push({
                    id: f457, nodeA: x455, nodeB: y455,
                    is: 1e-14, n: 1.0,
                    vt: c455,
                    rs: 0.5
                });
                this.compUuidToDevId.set(t455.id, [f457]);
                for (const g457 of v455) {
                    const h457 = b455.get(g457.netId);
                    if (h457)
                        this.netUuidToNode.set(g457.netId, h457);
                }
            }
            else if (u455.includes('NPN') || u455.includes('PNP') || u455.includes('2N') || u455.includes('BC')) {
                const a457 = this.resolveCompNode(t455, 'C', v455, b455);
                const b457 = this.resolveCompNode(t455, 'E', v455, b455);
                const c457 = `Q${g455++}`;
                this.bjts.push({
                    id: c457, nodeC: a457, nodeB: y455, nodeE: b457,
                    type: u455.includes('PNP') ? 'pnp' : 'npn',
                    is: 1e-14, bf: 200, nf: 1.0, vaf: 100
                });
                this.compUuidToDevId.set(t455.id, [c457]);
                for (const d457 of v455) {
                    const e457 = b455.get(d457.netId);
                    if (e457)
                        this.netUuidToNode.set(d457.netId, e457);
                }
            }
            else if (u455.includes('LM358') || u455.includes('LM324') || u455.includes('OP')) {
                const u456 = this.resolveCompNode(t455, 'OUT', v455, b455);
                const v456 = this.resolveCompNode(t455, '+', v455, b455);
                const w456 = this.resolveCompNode(t455, '-', v455, b455);
                const x456 = `X${h455++}`;
                this.opamps.push({
                    id: x456, nodeOut: u456, nodeInP: v456, nodeInN: w456,
                    nodeVcc: 'VCC', nodeVee: '0', gain: 100000, bw: 1e6
                });
                this.compUuidToDevId.set(t455.id, [x456]);
                for (const y456 of v455) {
                    const z456 = b455.get(y456.netId);
                    if (z456)
                        this.netUuidToNode.set(y456.netId, z456);
                }
            }
            else if (u455.includes('VCC') || u455.includes('POWER') || u455.includes('VDD')) {
                const p456 = this.resolveSupplyNode(t455, v455, b455, 'VCC');
                if (this.isFloatingNode(p456)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${t455.refDes}: supply pin not wired`);
                    continue;
                }
                const q456 = parseVoltageVolts(paramMapGet(t455.parameters, 'voltage', '5V'), 5);
                const r456 = `V${this.voltageSources.length}`;
                this.voltageSources.push({
                    id: r456, nodeA: p456,
                    nodeB: '0',
                    voltage: q456,
                    waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                    dutyCycle: 0.5, riseTime: 0, fallTime: 0
                });
                this.compUuidToDevId.set(t455.id, [r456]);
                traceAnalogDeviceStamp(t455.refDes, r456, t455.libraryId, p456, '0', `Vsrc ${q456}V pins=[${AnalogEngine.formatPinNetDetail(v455, b455)}]`);
                for (const s456 of v455) {
                    const t456 = b455.get(s456.netId);
                    if (t456)
                        this.netUuidToNode.set(s456.netId, t456);
                }
            }
            else if (u455.includes('LM7805') || u455.includes('LM7812') ||
                u455.includes('AMS1117') || u455.includes('REGULATOR')) {
                const g456 = this.resolveCompNode(t455, 'OUT', v455, b455);
                const h456 = this.isFloatingNode(g456)
                    ? this.resolveCompNode(t455, '3', v455, b455) : g456;
                const i456 = this.resolveCompNode(t455, 'GND', v455, b455);
                const j456 = this.isFloatingNode(i456)
                    ? this.resolveCompNode(t455, '2', v455, b455) : i456;
                if (!this.areTerminalsConnected(h456, j456)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${t455.refDes}: regulator OUT/GND not wired`);
                    continue;
                }
                let k456 = '5V';
                if (u455.includes('7812')) {
                    k456 = '12V';
                }
                else if (u455.includes('3V3') || u455.includes('1117')) {
                    k456 = '3.3V';
                }
                const l456 = parseVoltageVolts(paramMapGet(t455.parameters, 'output', k456), 5);
                const m456 = `V${this.voltageSources.length}`;
                this.voltageSources.push({
                    id: m456, nodeA: h456, nodeB: j456,
                    voltage: l456,
                    waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                    dutyCycle: 0.5, riseTime: 0, fallTime: 0
                });
                this.compUuidToDevId.set(t455.id, [m456]);
                traceAnalogDeviceStamp(t455.refDes, m456, t455.libraryId, h456, j456, `REG ${l456}V pins=[${AnalogEngine.formatPinNetDetail(v455, b455)}]`);
                for (const n456 of v455) {
                    const o456 = b455.get(n456.netId);
                    if (o456)
                        this.netUuidToNode.set(n456.netId, o456);
                }
            }
            else {
                const z455 = u455.toUpperCase();
                if (z455.includes('VOLTMETER') || (z455.includes('METER') && !z455.includes('AMMETER'))) {
                    const e456 = this.resolveInstrumentTerminals(t455, v455, b455, z455);
                    if (!this.areTerminalsConnected(e456[0], e456[1])) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${t455.refDes}: voltmeter pin(s) not wired`);
                    }
                    else {
                        const f456 = `R${d455++}`;
                        this.resistors.push({ id: f456, nodeA: e456[0], nodeB: e456[1], resistance: 10e6 });
                        this.compUuidToDevId.set(t455.id, [f456]);
                        traceAnalogDeviceStamp(t455.refDes, f456, t455.libraryId, e456[0], e456[1], `10MΩ VM pins=[${AnalogEngine.formatPinNetDetail(v455, b455)}]`);
                    }
                }
                else if (z455.includes('AMMETER')) {
                    const c456 = this.resolveInstrumentTerminals(t455, v455, b455, z455);
                    if (!this.areTerminalsConnected(c456[0], c456[1])) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${t455.refDes}: ammeter pin(s) not wired`);
                    }
                    else {
                        const d456 = `R${d455++}`;
                        this.resistors.push({ id: d456, nodeA: c456[0], nodeB: c456[1], resistance: 0.1 });
                        this.compUuidToDevId.set(t455.id, [d456]);
                        traceAnalogDeviceStamp(t455.refDes, d456, t455.libraryId, c456[0], c456[1], `0.1Ω AM pins=[${AnalogEngine.formatPinNetDetail(v455, b455)}]`);
                    }
                }
                for (const a456 of v455) {
                    const b456 = b455.get(a456.netId);
                    if (b456)
                        this.netUuidToNode.set(a456.netId, b456);
                }
            }
        }
        const i455: AnalogResistorStamp[] = [];
        for (let m455 = 0; m455 < this.resistors.length; m455++) {
            const n455 = this.resistors[m455];
            let o455 = n455.id;
            this.compUuidToDevId.forEach((p455: string[], q455: string) => {
                if (p455.includes(n455.id)) {
                    const r455 = a455.components.find(s455 => s455.id === q455);
                    if (r455 !== undefined) {
                        o455 = r455.refDes;
                    }
                }
            });
            i455.push({ devId: n455.id, refDes: o455, nodeA: n455.nodeA, nodeB: n455.nodeB, ohms: n455.resistance });
        }
        const j455: string[] = [];
        for (let k455 = 0; k455 < this.voltageSources.length; k455++) {
            const l455 = this.voltageSources[k455];
            j455.push(`Vsrc ${l455.id} ${l455.nodeA}->${l455.nodeB} ${l455.voltage}V`);
        }
        traceAnalogNetlistSummary(i455, j455);
    }
    solveTransient(v454: number, w454: number): Map<string, number> {
        this.lastStepSize = w454;
        this.simTime = v454;
        this.solveTransientStep(w454);
        const x454 = new Map<string, number>();
        this.nodeVoltages.forEach((y454, z454) => x454.set(z454, y454));
        this.computeBranchCurrents();
        return x454;
    }
    solveDC(): Map<string, number> {
        this.runOpAnalysis();
        return copyNodeMap(this.nodeVoltages);
    }
    solveAC(q454: number): Map<string, number> {
        this.buildMnaSystem(q454, true);
        const r454 = this.nodeIndex.size + this.voltageSources.length;
        if (!this.solveLinearSystem(r454)) {
            this.lastConverged = false;
            return copyNodeMap(this.nodeVoltages);
        }
        const s454 = new Map<string, number>();
        this.nodeIndex.forEach((t454, u454) => {
            if (t454 < this.mnaRhs.length)
                s454.set(u454, Math.abs(this.mnaRhs[t454]));
        });
        this.lastConverged = true;
        return s454;
    }
    getNetlist(): string { return this.netlist; }
    getBranchCurrents(): Map<string, number> { return this.branchCurrents; }
    getLastConverged(): boolean { return this.lastConverged; }
    getNodeVoltage(p454: string): number { return this.nodeVoltages.get(p454) ?? 0; }
    getTotalIterations(): number { return this.newtonIterations; }
    private runOpAnalysis(): void {
        for (let n454 = 0; n454 < this.maxNewtonIter; n454++) {
            this.newtonIterations = n454 + 1;
            this.buildMnaSystem(0, false);
            const o454 = this.nodeIndex.size + this.voltageSources.length;
            if (!this.solveLinearSystem(o454)) {
                this.lastConverged = false;
                return;
            }
            if (this.checkNewtonConvergence(o454)) {
                this.lastConverged = true;
                this.updateNodeVoltages(o454);
                return;
            }
            this.updateNodeVoltages(o454);
        }
        this.lastConverged = false;
    }
    private solveTransientStep(l454: number): void {
        this.updateCompanionModels(l454);
        this.runOpAnalysis();
        for (const m454 of this.capacitors) {
            m454.prevVoltage = m454.voltage;
        }
    }
    private buildMnaSystem(s452: number, t452: boolean): void {
        const u452 = this.voltageSources.length;
        const v452 = this.nodeIndex.size + u452;
        this.mnaG = new Array(v452 * v452).fill(0);
        this.mnaRhs = new Array(v452).fill(0);
        const w452 = this.nodeIndex.size;
        const x452 = 2 * Math.PI * s452;
        const y452 = t452 && s452 > 0;
        const z452 = this.nodeIndex.get('0') ?? 0;
        this.mnaG[z452 * v452 + z452] = 1;
        this.mnaRhs[z452] = 0;
        for (const h454 of this.resistors) {
            const i454 = this.nodeIndex.get(h454.nodeA);
            const j454 = this.nodeIndex.get(h454.nodeB);
            if (i454 === undefined || j454 === undefined)
                continue;
            const k454 = 1.0 / Math.max(h454.resistance, 1e-12);
            this.stampConductance(i454, j454, k454, v452);
        }
        for (const d454 of this.capacitors) {
            const e454 = this.nodeIndex.get(d454.nodeA);
            const f454 = this.nodeIndex.get(d454.nodeB);
            if (e454 === undefined || f454 === undefined)
                continue;
            if (y452) {
                const g454 = x452 * d454.capacitance;
                this.stampConductance(e454, f454, g454, v452);
            }
            else if (this.lastStepSize > 0) {
                this.stampConductance(e454, f454, d454.geq, v452);
                this.mnaRhs[e454] -= d454.ieq;
                this.mnaRhs[f454] += d454.ieq;
            }
        }
        for (const y453 of this.inductors) {
            const z453 = this.nodeIndex.get(y453.nodeA);
            const a454 = this.nodeIndex.get(y453.nodeB);
            if (z453 === undefined || a454 === undefined)
                continue;
            if (y452) {
                const c454 = y453.inductance > 0 ? 1.0 / (x452 * y453.inductance) : 1e12;
                this.stampConductance(z453, a454, c454, v452);
            }
            else if (this.lastStepSize > 0 && y453.inductance > 0) {
                const b454 = this.lastStepSize / (2 * y453.inductance);
                this.stampConductance(z453, a454, b454, v452);
                this.mnaRhs[z453] -= y453.ieqStamp;
                this.mnaRhs[a454] += y453.ieqStamp;
            }
        }
        for (let l453 = 0; l453 < u452; l453++) {
            const m453 = this.voltageSources[l453];
            const n453 = this.nodeIndex.get(m453.nodeA);
            const o453 = this.nodeIndex.get(m453.nodeB);
            if (n453 === undefined || o453 === undefined)
                continue;
            const p453 = w452 + l453;
            let q453 = m453.voltage;
            if (!t452 && m453.freq > 0) {
                const r453 = 2 * Math.PI * m453.freq;
                const s453 = 1.0 / m453.freq;
                const t453 = ((this.simTime % s453) + s453) % s453 / s453;
                switch (m453.waveform) {
                    case 'sin':
                        q453 = m453.voltage + m453.amplitude * Math.sin(r453 * this.simTime + m453.phase);
                        break;
                    case 'square': {
                        const x453 = (t453 + m453.phase / (2 * Math.PI) + 1) % 1;
                        q453 = m453.voltage + (x453 < (m453.dutyCycle || 0.5) ? m453.amplitude : -m453.amplitude);
                        break;
                    }
                    case 'triangle': {
                        const w453 = (t453 + m453.phase / (2 * Math.PI) + 1) % 1;
                        q453 = m453.voltage + m453.amplitude * (4 * Math.abs(w453 - 0.5) - 1);
                        break;
                    }
                    case 'sawtooth': {
                        const v453 = (t453 + m453.phase / (2 * Math.PI) + 1) % 1;
                        q453 = m453.voltage + m453.amplitude * (2 * v453 - 1);
                        break;
                    }
                    case 'pulse': {
                        const u453 = (t453 + m453.phase / (2 * Math.PI) + 1) % 1;
                        q453 = m453.voltage + (u453 < (m453.dutyCycle || 0.5) ? m453.amplitude : 0);
                        break;
                    }
                    default:
                        q453 = m453.voltage;
                        break;
                }
            }
            this.mnaG[n453 * v452 + p453] = 1;
            this.mnaG[o453 * v452 + p453] = -1;
            this.mnaG[p453 * v452 + n453] = 1;
            this.mnaG[p453 * v452 + o453] = -1;
            this.mnaRhs[p453] = q453;
        }
        for (const i453 of this.diodes) {
            const j453 = this.nodeIndex.get(i453.nodeA);
            const k453 = this.nodeIndex.get(i453.nodeB);
            if (j453 === undefined || k453 === undefined || y452)
                continue;
            this.stampDiode(j453, k453, i453, v452);
        }
        for (const e453 of this.bjts) {
            const f453 = this.nodeIndex.get(e453.nodeC);
            const g453 = this.nodeIndex.get(e453.nodeB);
            const h453 = this.nodeIndex.get(e453.nodeE);
            if (f453 === undefined || g453 === undefined || h453 === undefined || y452)
                continue;
            this.stampBjt(f453, g453, h453, e453, v452);
        }
        for (const a453 of this.opamps) {
            const b453 = this.nodeIndex.get(a453.nodeOut);
            const c453 = this.nodeIndex.get(a453.nodeInP);
            const d453 = this.nodeIndex.get(a453.nodeInN);
            if (b453 === undefined || c453 === undefined || d453 === undefined || y452)
                continue;
            this.stampOpAmp(b453, c453, d453, a453, v452);
        }
    }
    private stampConductance(o452: number, p452: number, q452: number, r452: number): void {
        this.mnaG[o452 * r452 + o452] += q452;
        this.mnaG[p452 * r452 + p452] += q452;
        this.mnaG[o452 * r452 + p452] -= q452;
        this.mnaG[p452 * r452 + o452] -= q452;
    }
    private stampDiode(e452: number, f452: number, g452: DiodeModel, h452: number): void {
        const i452 = (this.nodeVoltages.get(g452.nodeA) ?? 0) - (this.nodeVoltages.get(g452.nodeB) ?? 0);
        const j452 = g452.n * g452.vt;
        let k452: number;
        let l452: number;
        if (i452 > -10 * j452) {
            const n452 = Math.min(i452 / j452, 40);
            k452 = g452.is * (Math.exp(n452) - 1);
            l452 = g452.is * Math.exp(n452) / j452;
        }
        else {
            k452 = -g452.is;
            l452 = 1e-12;
        }
        if (g452.rs > 0 && l452 > 0) {
            const m452 = 1 + l452 * g452.rs;
            l452 = l452 / m452;
            k452 = k452 / m452;
        }
        l452 = Math.max(l452, 1e-12);
        this.stampConductance(e452, f452, l452, h452);
        this.mnaRhs[e452] -= k452;
        this.mnaRhs[f452] += k452;
    }
    private stampBjt(o451: number, p451: number, q451: number, r451: BjtModel, s451: number): void {
        const t451 = (this.nodeVoltages.get(r451.nodeB) ?? 0) - (this.nodeVoltages.get(r451.nodeE) ?? 0);
        const u451 = (this.nodeVoltages.get(r451.nodeB) ?? 0) - (this.nodeVoltages.get(r451.nodeC) ?? 0);
        const v451 = r451.nf * 0.02585;
        let w451: number;
        let x451: number;
        if (t451 > -10 * v451) {
            const d452 = Math.min(t451 / v451, 40);
            x451 = (r451.is / r451.bf) * (Math.exp(d452) - 1);
            w451 = (r451.is / r451.bf) * Math.exp(d452) / v451;
        }
        else {
            x451 = -r451.is / r451.bf;
            w451 = 1e-12;
        }
        let y451: number;
        let z451: number;
        if (u451 > -10 * v451) {
            const c452 = Math.min(u451 / v451, 40);
            z451 = r451.is * (Math.exp(c452) - 1);
            y451 = r451.is * Math.exp(c452) / v451;
        }
        else {
            z451 = -r451.is;
            y451 = 1e-12;
        }
        const a452 = r451.bf / (r451.bf + 1);
        const b452 = a452 * r451.is * (Math.exp(Math.min(t451 / v451, 40)) - 1) - z451;
        this.stampConductance(p451, q451, w451, s451);
        this.stampConductance(p451, o451, y451, s451);
        this.mnaRhs[p451] -= x451 + z451;
        this.mnaRhs[o451] -= b452 - z451;
        this.mnaRhs[q451] += x451 + b452;
    }
    private stampOpAmp(z450: number, a451: number, b451: number, c451: OpAmpModel, d451: number): void {
        const e451 = 1e-3;
        const f451 = this.nodeVoltages.get('VCC') ?? 5;
        const g451 = this.nodeVoltages.get(c451.nodeVee) ?? 0;
        const h451 = (this.nodeVoltages.get(c451.nodeInP) ?? 0) - (this.nodeVoltages.get(c451.nodeInN) ?? 0);
        let i451 = h451 * c451.gain;
        const j451 = (f451 + g451) / 2;
        const k451 = (f451 - g451) / 2 - 0.2;
        const l451 = j451 + k451 * Math.tanh(i451 / Math.max(k451, 0.1));
        const m451 = this.nodeVoltages.get(c451.nodeOut) ?? j451;
        const n451 = e451 * (l451 - m451);
        this.mnaG[z450 * d451 + z450] += e451;
        this.mnaRhs[z450] += n451;
    }
    private solveLinearSystem(i450: number): boolean {
        if (i450 <= 0)
            return false;
        const j450 = this.mnaG.slice();
        const k450 = this.mnaRhs.slice();
        for (let n450 = 0; n450 < i450; n450++) {
            let o450 = Math.abs(j450[n450 * i450 + n450]);
            let p450 = n450;
            for (let x450 = n450 + 1; x450 < i450; x450++) {
                const y450 = Math.abs(j450[x450 * i450 + n450]);
                if (y450 > o450) {
                    o450 = y450;
                    p450 = x450;
                }
            }
            if (o450 < 1e-12) {
                j450[n450 * i450 + n450] = 1;
                k450[n450] = 0;
                continue;
            }
            if (p450 !== n450) {
                for (let v450 = 0; v450 < i450; v450++) {
                    const w450 = j450[n450 * i450 + v450];
                    j450[n450 * i450 + v450] = j450[p450 * i450 + v450];
                    j450[p450 * i450 + v450] = w450;
                }
                const u450 = k450[n450];
                k450[n450] = k450[p450];
                k450[p450] = u450;
            }
            const q450 = j450[n450 * i450 + n450];
            for (let r450 = n450 + 1; r450 < i450; r450++) {
                const s450 = j450[r450 * i450 + n450] / q450;
                if (Math.abs(s450) < 1e-15)
                    continue;
                j450[r450 * i450 + n450] = s450;
                for (let t450 = n450 + 1; t450 < i450; t450++) {
                    j450[r450 * i450 + t450] -= s450 * j450[n450 * i450 + t450];
                }
                k450[r450] -= s450 * k450[n450];
            }
        }
        for (let l450 = i450 - 1; l450 >= 0; l450--) {
            if (Math.abs(j450[l450 * i450 + l450]) < 1e-12) {
                k450[l450] = 0;
                continue;
            }
            for (let m450 = l450 + 1; m450 < i450; m450++) {
                k450[l450] -= j450[l450 * i450 + m450] * k450[m450];
            }
            k450[l450] /= j450[l450 * i450 + l450];
        }
        this.mnaRhs = k450;
        return true;
    }
    private checkNewtonConvergence(c450: number): boolean {
        let d450 = 0;
        this.nodeIndex.forEach((e450, f450) => {
            if (e450 < c450 && e450 < this.mnaRhs.length) {
                const g450 = this.nodeVoltages.get(f450) ?? 0;
                const h450 = Math.abs(this.mnaRhs[e450] - g450);
                if (h450 > d450)
                    d450 = h450;
            }
        });
        return d450 < 1e-5;
    }
    private updateNodeVoltages(w449: number): void {
        this.nodeIndex.forEach((a450, b450) => {
            if (a450 < w449 && a450 < this.mnaRhs.length) {
                this.nodeVoltages.set(b450, this.mnaRhs[a450]);
            }
        });
        const x449 = this.voltageSources.length;
        for (let y449 = 0; y449 < x449; y449++) {
            const z449 = w449 + y449;
            if (z449 < this.mnaRhs.length) {
                this.branchCurrents.set(`I(${this.voltageSources[y449].id})`, this.mnaRhs[z449]);
            }
        }
    }
    private updateCompanionModels(l449: number): void {
        for (const s449 of this.capacitors) {
            if (l449 > 1e-15 && s449.capacitance > 0) {
                s449.geq = 2 * s449.capacitance / l449;
                const t449 = this.nodeVoltages.get(s449.nodeA) ?? 0;
                const u449 = this.nodeVoltages.get(s449.nodeB) ?? 0;
                const v449 = t449 - u449;
                s449.ieq = -(2 * s449.geq * v449) - s449.ieq;
                s449.prevVoltage = s449.voltage;
                s449.voltage = v449;
            }
        }
        for (const m449 of this.inductors) {
            if (l449 > 1e-15 && m449.inductance > 0) {
                const n449 = this.nodeVoltages.get(m449.nodeA) ?? 0;
                const o449 = this.nodeVoltages.get(m449.nodeB) ?? 0;
                const p449 = n449 - o449;
                const q449 = l449 / (2 * m449.inductance);
                const r449 = m449.ieqStamp + q449 * p449;
                m449.ieqStamp = r449 + q449 * p449;
                m449.current = r449;
                m449.prevCurrent = m449.current;
                m449.prevVoltage = p449;
            }
        }
    }
    private computeBranchCurrents(): void {
        for (const i449 of this.resistors) {
            const j449 = this.nodeVoltages.get(i449.nodeA) ?? 0;
            const k449 = this.nodeVoltages.get(i449.nodeB) ?? 0;
            this.branchCurrents.set(`I(${i449.id})`, (j449 - k449) / Math.max(i449.resistance, 1e-12));
        }
        for (const e449 of this.capacitors) {
            const f449 = this.nodeVoltages.get(e449.nodeA) ?? 0;
            const g449 = this.nodeVoltages.get(e449.nodeB) ?? 0;
            const h449 = e449.capacitance * ((f449 - g449) - e449.prevVoltage) / Math.max(this.lastStepSize, 1e-15);
            this.branchCurrents.set(`I(${e449.id})`, h449);
        }
        this.netUuidToNode.forEach((w448: string, x448: string) => {
            if (w448 !== '0' && w448 !== 'VCC') {
                let y448 = 0;
                for (const z448 of this.resistors) {
                    if (z448.nodeA === w448) {
                        const c449 = this.nodeVoltages.get(z448.nodeA) ?? 0;
                        const d449 = this.nodeVoltages.get(z448.nodeB) ?? 0;
                        y448 += (c449 - d449) / Math.max(z448.resistance, 1e-12);
                    }
                    else if (z448.nodeB === w448) {
                        const a449 = this.nodeVoltages.get(z448.nodeA) ?? 0;
                        const b449 = this.nodeVoltages.get(z448.nodeB) ?? 0;
                        y448 -= (a449 - b449) / Math.max(z448.resistance, 1e-12);
                    }
                }
                this.branchCurrents.set(`NET(${x448})`, y448);
            }
        });
    }
    getCurrentForComponent(u448: string): number {
        const v448 = this.compUuidToDevId.get(u448);
        if (v448 && v448.length > 0) {
            return this.branchCurrents.get(`I(${v448[0]})`) ?? 0;
        }
        return 0;
    }
    registerSignalSource(j448: string, k448: string, l448: string, m448: string, n448: number, o448: number, p448: number, q448: number, r448: number): void {
        let s448 = false;
        for (let t448 = 0; t448 < this.voltageSources.length; t448++) {
            if (this.voltageSources[t448].id === j448) {
                this.voltageSources[t448] = {
                    id: j448,
                    nodeA: k448,
                    nodeB: l448,
                    voltage: n448,
                    waveform: m448,
                    freq: p448,
                    amplitude: o448,
                    phase: q448,
                    dutyCycle: r448,
                    riseTime: 0, fallTime: 0
                };
                s448 = true;
                break;
            }
        }
        if (!s448) {
            this.voltageSources.push({
                id: j448,
                nodeA: k448,
                nodeB: l448,
                voltage: n448,
                waveform: m448,
                freq: p448,
                amplitude: o448,
                phase: q448,
                dutyCycle: r448,
                riseTime: 0, fallTime: 0
            });
        }
        if (!this.nodeIndex.has(k448)) {
            this.nodeIndex.set(k448, this.nodeIndex.size);
        }
        if (!this.nodeIndex.has(l448)) {
            this.nodeIndex.set(l448, this.nodeIndex.size);
        }
    }
    getNodeVoltageMap(): Map<string, number> {
        return copyNodeMap(this.nodeVoltages);
    }
    getBranchCurrentMap(): Map<string, number> {
        return new Map(this.branchCurrents);
    }
    getNetCurrentForUuid(i448: string): number {
        return this.branchCurrents.get(`NET(${i448})`) ?? 0;
    }
    private withUnitSuffix(e448: string, f448: string): string {
        const g448 = e448.trim();
        if (g448.length === 0)
            return f448;
        if (/[a-z]/i.test(g448))
            return g448;
        const h448 = f448.match(/[a-zµ]+$/i);
        if (h448 === null)
            return g448;
        return g448 + h448[0];
    }
    private static formatPinNetDetail(x447: PinNetMapping[], y447: Map<string, string>): string {
        const z447: string[] = [];
        for (let a448 = 0; a448 < x447.length; a448++) {
            const b448 = x447[a448];
            const c448 = b448.pinName.length > 0 ? b448.pinName : b448.pinId;
            const d448 = y447.get(b448.netId) ?? '?';
            z447.push(`${c448}@${d448}`);
        }
        return z447.length > 0 ? z447.join(',') : '(none)';
    }
    private parseResistance(r447: string): number {
        const s447 = AnalogEngine.normalizeResistanceInput(r447);
        const t447 = UnitParser.parseResistance(s447);
        if (t447.valid && t447.numeric > 0) {
            return t447.numeric;
        }
        const u447 = s447.toLowerCase().replace(/[ωohm]/g, '').trim();
        if (u447.includes('meg')) {
            return parseFloat(u447) * 1e6;
        }
        if (u447.includes('k')) {
            const w447 = parseFloat(u447);
            return isNaN(w447) ? 1000 : w447 * 1000;
        }
        if (u447.includes('m') && !u447.includes('meg')) {
            return parseFloat(u447) * 0.001;
        }
        const v447 = parseFloat(u447);
        return isNaN(v447) || v447 <= 0 ? 1000 : v447;
    }
    private static normalizeResistanceInput(n447: string): string {
        let o447 = n447.trim().replace(/\s+/g, '');
        o447 = o447.replace(/(?:Ω|ohm|R)(?=[KMG])/i, '');
        const p447 = o447.match(/^([\d.]+)(?:Ω|ohm|R)?K$/i);
        if (p447 !== null) {
            const q447 = parseFloat(p447[1]);
            if (!isNaN(q447) && q447 >= 1000) {
                return `${q447}Ω`;
            }
        }
        return o447;
    }
    private parseCapacitance(k447: string): number {
        const l447 = k447.toLowerCase().replace('f', '').trim();
        if (l447.includes('u') || l447.includes('µ'))
            return parseFloat(l447) * 1e-6;
        if (l447.includes('n'))
            return parseFloat(l447) * 1e-9;
        if (l447.includes('p'))
            return parseFloat(l447) * 1e-12;
        if (l447.includes('m'))
            return parseFloat(l447) * 1e-3;
        const m447 = parseFloat(l447);
        return isNaN(m447) || m447 <= 0 ? 100e-9 : m447;
    }
    private parseInductance(h447: string): number {
        const i447 = h447.toLowerCase().replace('h', '').trim();
        if (i447.includes('u') || i447.includes('µ'))
            return parseFloat(i447) * 1e-6;
        if (i447.includes('n'))
            return parseFloat(i447) * 1e-9;
        if (i447.includes('p'))
            return parseFloat(i447) * 1e-12;
        if (i447.includes('m'))
            return parseFloat(i447) * 1e-3;
        const j447 = parseFloat(i447);
        return isNaN(j447) || j447 <= 0 ? 0.001 : j447;
    }
    private toSpiceValue(f447: string): string {
        if (f447.length === 0)
            return '1k';
        const g447 = f447.replace('µ', 'u');
        if (g447.includes('Meg'))
            return g447;
        if (g447.includes('k') || g447.includes('K'))
            return g447.toUpperCase().replace('K', 'k');
        if (g447.includes('M') && !g447.includes('Meg') && !g447.includes('m'))
            return g447.replace('M', 'Meg');
        if (/^\d+(\.\d+)?$/.test(g447))
            return g447;
        return g447;
    }
}
function copyNodeMap(b447: Map<string, number>): Map<string, number> {
    const c447 = new Map<string, number>();
    b447.forEach((d447, e447) => c447.set(e447, d447));
    return c447;
}
