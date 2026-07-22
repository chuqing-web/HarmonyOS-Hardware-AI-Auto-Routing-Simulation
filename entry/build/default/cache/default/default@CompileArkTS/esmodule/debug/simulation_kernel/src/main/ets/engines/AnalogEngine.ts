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
/** Runtime-switched relay contact pair stamped as two resistors (NO / NC). */
interface RelayContactEntry {
    compId: string;
    coilNodeA: string;
    coilNodeB: string;
    coilRatedV: number;
    noDevId: string;
    ncDevId: string;
    energized: boolean;
}
/** Behavioral 555: OUT as VS to GND, DISCH as switched R to GND, FF updated after each step. */
interface Timer555Entry {
    compId: string;
    refDes: string;
    nodeVcc: string;
    nodeGnd: string;
    nodeTrig: string;
    nodeThres: string;
    nodeCtrl: string;
    nodeReset: string;
    nodeOut: string;
    outVsId: string;
    dischRId: string;
    ctrlFloating: boolean;
    resetFloating: boolean;
    qHigh: boolean;
}
const SW_CLOSED_OHMS = 0.01;
const SW_OPEN_OHMS = 1e12;
const RELAY_COIL_OHMS = 400;
const RELAY_CONTACT_CLOSED_OHMS = 0.01;
const RELAY_CONTACT_OPEN_OHMS = 1e12;
const TIMER555_DISCH_ON_OHMS = 10;
const TIMER555_DISCH_OFF_OHMS = 1e12;
const TIMER555_OUT_LOW = 0.1;
const TIMER555_OUT_HIGH_DROP = 1.4;
interface CapacitorEntry {
    id: string;
    nodeA: string;
    nodeB: string;
    capacitance: number;
    /** Branch voltage vA-vB after last committed step (OP seed or transient). */
    voltage: number;
    prevVoltage: number;
    /** Branch current A→B after last committed step. */
    current: number;
    geq: number;
    /** Stores -J for Norton stamp; MNA uses rhs[A] -= ieq (= +J). */
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
    geq: number;
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
    /** OUT↔IN+ resistive path and no OUT↔IN- path → Schmitt / pos-FB comparator. */
    comparatorMode: boolean;
    /** Latched output polarity for comparatorMode (hysteresis memory). */
    compHigh: boolean;
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
// Pin info parsed from net connections
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
    /** True while assembling/solving a transient step (C/L companions active). */
    private inTransientStep: boolean = false;
    private matrixSize: number = 0;
    private mnaG: number[] = [];
    private mnaRhs: number[] = [];
    private newtonIterations: number = 0;
    private maxNewtonIter: number = 120;
    private gndRow: number = 0;
    private compPinNets: Map<string, PinNetMapping[]> = new Map();
    // Persist net UUID → node name mapping for instrument lookup
    private netUuidToNode: Map<string, string> = new Map();
    // Component instance UUID → internal device ID mapping (for current lookup)
    private compUuidToDevId: Map<string, string[]> = new Map();
    private relayContacts: RelayContactEntry[] = [];
    private timer555s: Timer555Entry[] = [];
    /** Last updateRelayContactsFromCoil(): true if a relay NO/NC contact changed. */
    private lastRelayFlipped: boolean = false;
    /** Suppress per-device MNA flood during live pot/switch edits */
    private quietLoad: boolean = false;
    setQuietLoad(quiet: boolean): void {
        this.quietLoad = quiet;
    }
    loadSchematic(doc: SchematicDocument, config: SimulationConfig): void {
        this.netUuidToNode.clear();
        this.compUuidToDevId.clear();
        this.compPinNets.clear();
        this.relayContacts = [];
        this.timer555s = [];
        this.nodeVoltages.clear();
        this.branchCurrents.clear();
        this.netlist = this.generateNetlist(doc, config);
        this.buildDeviceModels(doc);
        if (!this.quietLoad) {
            traceSpiceNodeMap(this.netUuidToNode);
        }
        this.buildNodeIndex(doc);
        // Ensure VCC/GND have baseline voltages before OP analysis
        this.nodeVoltages.set('0', 0);
        this.nodeVoltages.set('GND', 0);
        this.nodeVoltages.set('VCC', 5.0);
        this.simTime = config.startTime;
        this.inTransientStep = false;
        this.runOpAnalysis();
        this.seedReactiveFromOp();
        this.syncGroundAlias();
        if (this.quietLoad) {
            const adc = this.nodeVoltages.get('ADC');
            const adcStr = adc !== undefined ? ` ADC=${adc.toFixed(3)}V` : '';
            Logger.info(INSTR_TRACE_TAG, `analog OP quiet R=${this.resistors.length} Vsrc=${this.voltageSources.length} ` +
                `converged=${this.lastConverged}${adcStr}`);
            return;
        }
        const nodeParts: string[] = [];
        let nodeCount = 0;
        this.nodeVoltages.forEach((v: number, name: string) => {
            if (nodeCount >= 6) {
                return;
            }
            if (Math.abs(v) > 1e-9 || name === 'VCC' || name === '0') {
                nodeParts.push(`${name}=${v.toFixed(3)}V`);
                nodeCount++;
            }
        });
        traceAnalogOpSummary(this.resistors.length, this.voltageSources.length, this.lastConverged, nodeParts.join(', '));
        if (this.resistors.length > 0) {
            const r0 = this.resistors[0];
            Logger.info(INSTR_TRACE_TAG, `analog R0 ${r0.id} ${r0.nodeA}->${r0.nodeB} ${r0.resistance}Ω nets=${summarizeNetPins(doc, 4)}`);
        }
    }
    /** Get the node name for a net UUID (for instrument lookups) */
    getNodeNameForNetUuid(netUuid: string): string {
        return this.netUuidToNode.get(netUuid) ?? '';
    }
    /** Get all net UUID → node name mappings */
    getNetUuidMapping(): Map<string, string> {
        return new Map(this.netUuidToNode);
    }
    /** Get voltage by either node name or net UUID */
    getVoltage(key: string): number {
        const direct = this.nodeVoltages.get(key);
        if (direct !== undefined)
            return direct;
        const nodeName = this.netUuidToNode.get(key);
        if (nodeName !== undefined)
            return this.nodeVoltages.get(nodeName) ?? 0;
        return 0;
    }
    /** Get current through a net (computed as sum of branch currents at that node) */
    getNetCurrent(netUuid: string): number {
        const nodeName = this.netUuidToNode.get(netUuid) ?? netUuid;
        let totalCurrent = 0;
        for (const r of this.resistors) {
            if (r.nodeA === nodeName || r.nodeB === nodeName) {
                const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
                const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
                totalCurrent += (vA - vB) / Math.max(r.resistance, 1e-12);
            }
        }
        for (const cap of this.capacitors) {
            if (cap.nodeA === nodeName || cap.nodeB === nodeName) {
                totalCurrent += this.branchCurrents.get(`I(${cap.id})`) ?? 0;
            }
        }
        return totalCurrent;
    }
    /** Get the resistance between two nets (for ammeter current calculation) */
    getResistanceBetweenNets(netUuid1: string, netUuid2: string): number {
        const node1 = this.netUuidToNode.get(netUuid1) ?? netUuid1;
        const node2 = this.netUuidToNode.get(netUuid2) ?? netUuid2;
        // Find resistors connecting these two nodes
        for (const r of this.resistors) {
            if ((r.nodeA === node1 && r.nodeB === node2) || (r.nodeA === node2 && r.nodeB === node1)) {
                return r.resistance;
            }
        }
        return Infinity;
    }
    generateNetlist(doc: SchematicDocument, config: SimulationConfig): string {
        let nl = `* ElecDraw MNA Netlist (circuit-connected)\n* ${doc.name}\n\n`;
        nl += `.temp ${config.temperature}\n\n`;
        const netNodeMap = this.buildNetNodeMap(doc);
        let rCount = 1;
        let cCount = 1;
        let dCount = 1;
        let qCount = 1;
        let xCount = 1;
        for (const comp of doc.components) {
            const libId = comp.libraryId.toUpperCase();
            const pinNets = this.getPinNetConnections(comp.id, doc);
            const isDiodeLike = libId.startsWith('LED') || libId.startsWith('1N') || libId.includes('DIODE');
            const passive = this.resolvePassiveTerminals(comp, pinNets, netNodeMap, isDiodeLike);
            const nA = passive[0];
            const nB = passive[1];
            if (libId.startsWith('R_') || libId.includes('RESISTOR')) {
                const val = paramMapGet(comp.parameters, 'value', libId.replace('R_', ''));
                nl += `R${rCount} ${nA} ${nB} ${this.toSpiceValue(val)}\n`;
                rCount++;
            }
            else if (libId.startsWith('POT_') || libId.includes('POTENTIOMETER') ||
                libId.includes('RHEOSTAT')) {
                const n1 = this.resolveCompNode(comp, '1', pinNets, netNodeMap);
                const n2 = this.resolveCompNode(comp, '2', pinNets, netNodeMap);
                const nW = this.resolveCompNode(comp, 'W', pinNets, netNodeMap);
                const val = paramMapGet(comp.parameters, 'value', libId.replace('POT_', ''));
                const rTot = Math.max(this.parseResistance(this.withUnitSuffix(val, '10k')), 1);
                const tap = AnalogEngine.parseWiperFraction(paramMapGet(comp.parameters, 'wiper', '0.5'));
                nl += `R${rCount} ${n1} ${nW} ${Math.max(rTot * tap, 1)}\n`;
                rCount++;
                nl += `R${rCount} ${nW} ${n2} ${Math.max(rTot * (1 - tap), 1)}\n`;
                rCount++;
            }
            else if (libId === 'LDR' || libId.includes('PHOTORESISTOR')) {
                const val = paramMapGet(comp.parameters, 'value', '50k');
                nl += `R${rCount} ${nA} ${nB} ${this.toSpiceValue(val)}\n`;
                rCount++;
            }
            else if (libId === 'DS18B20' || libId.includes('DS18B20')) {
                const nDq = this.resolveCompNode(comp, 'DQ', pinNets, netNodeMap);
                const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                const tempC = AnalogEngine.parseTempCelsius(paramMapGet(comp.parameters, 'temp_c', '25'));
                const vTeach = AnalogEngine.tempCToTeachVolts(tempC);
                nl += `V${rCount} ${nDq} ${nGnd} ${vTeach}\n`;
                rCount++;
            }
            else if (libId.startsWith('FUSE') || libId.includes('FUSE')) {
                nl += `R${rCount} ${nA} ${nB} 0.01\n`;
                rCount++;
            }
            else if (libId.startsWith('C_') || libId.includes('CAP')) {
                const val = paramMapGet(comp.parameters, 'value', libId.replace('C_', ''));
                nl += `C${cCount} ${nA} ${nB} ${this.toSpiceValue(val)}\n`;
                cCount++;
            }
            else if (libId.startsWith('LED') || libId.startsWith('1N') || libId.includes('DIODE')) {
                nl += `D${dCount} ${nA} ${nB} DMOD\n`;
                dCount++;
            }
            else if (libId.includes('NPN') || libId.includes('PNP') || libId.includes('2N') || libId.includes('BC')) {
                const nC = this.resolveCompNode(comp, 'C', pinNets, netNodeMap);
                const nE = this.resolveCompNode(comp, 'E', pinNets, netNodeMap);
                nl += `Q${qCount} ${nC} ${nB} ${nE} ${libId.includes('PNP') ? 'PNP' : 'NPN'}\n`;
                qCount++;
            }
            else if (libId.includes('LM358') || libId.includes('LM324') || libId.includes('741') ||
                libId.includes('TL08') || libId.includes('OPAMP') || libId.includes('OP_AMP')) {
                const nO = this.resolveOpAmpSignalNode(comp, pinNets, netNodeMap, 'out', ['OUT1', 'OUT', 'OUTPUT']);
                const nP = this.resolveOpAmpSignalNode(comp, pinNets, netNodeMap, 'inp', ['IN+1', 'IN+', '+', 'VIP']);
                const nN = this.resolveOpAmpSignalNode(comp, pinNets, netNodeMap, 'inn', ['IN-1', 'IN-', '-', 'VIN']);
                const rails = this.resolveOpAmpRails(comp, pinNets, netNodeMap);
                nl += `X${xCount} ${nP} ${nN} ${nO} ${rails[0]} ${rails[1]} OPA\n`;
                xCount++;
            }
            else if (libId === 'SIGNAL_GEN' || libId.startsWith('SIGNAL_GEN')) {
                const nOut = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
                const nA = this.isFloatingNode(nOut) ? this.resolveCompNode(comp, '1', pinNets, netNodeMap) : nOut;
                const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                const nB = this.isFloatingNode(nGnd) ? this.resolveCompNode(comp, '2', pinNets, netNodeMap) : nGnd;
                const amp = parseVoltageVolts(paramMapGet(comp.parameters, 'amplitude', '1V'), 1);
                const freq = UnitParser.parseFrequency(paramMapGet(comp.parameters, 'frequency', '1kHz')).numeric;
                const off = parseVoltageVolts(paramMapGet(comp.parameters, 'offset', '0'), 0);
                const wf = AnalogEngine.normalizeWaveformName(paramMapGet(comp.parameters, 'waveform', 'sine'));
                const dutyRaw = paramMapGet(comp.parameters, 'dutyCycle', '50');
                let duty = 0.5;
                const dutyN = parseFloat(dutyRaw.replace(/%/g, ''));
                if (Number.isFinite(dutyN)) {
                    duty = dutyN > 1 ? dutyN / 100 : dutyN;
                }
                duty = Math.max(0.01, Math.min(0.99, duty));
                const period = 1 / Math.max(freq, 1e-9);
                const pw = duty * period;
                if (wf === 'sin') {
                    nl += `V${rCount} ${nA} ${nB} SIN(${off} ${amp} ${freq})\n`;
                }
                else if (wf === 'square' || wf === 'pulse') {
                    const vLo = wf === 'pulse' ? off : (off - amp);
                    const vHi = wf === 'pulse' ? (off + amp) : (off + amp);
                    nl += `V${rCount} ${nA} ${nB} PULSE(${vLo} ${vHi} 0 1n 1n ${pw} ${period})\n`;
                }
                else {
                    // triangle/saw → 近似正弦网表；MNA 路径按真实波形注入
                    nl += `V${rCount} ${nA} ${nB} SIN(${off} ${amp} ${freq})\n`;
                }
                rCount++;
            }
            else if (libId === 'VAC' || libId.startsWith('VAC')) {
                const nPlus = this.resolveCompNode(comp, 'AC+', pinNets, netNodeMap);
                const nA = this.isFloatingNode(nPlus) ? this.resolveCompNode(comp, '1', pinNets, netNodeMap) : nPlus;
                const nMinus = this.resolveCompNode(comp, 'AC-', pinNets, netNodeMap);
                const nB = this.isFloatingNode(nMinus) ? this.resolveCompNode(comp, '2', pinNets, netNodeMap) : nMinus;
                const amp = parseVoltageVolts(paramMapGet(comp.parameters, 'amplitude', '220V'), 220);
                const freq = UnitParser.parseFrequency(paramMapGet(comp.parameters, 'frequency', '50Hz')).numeric;
                const off = parseVoltageVolts(paramMapGet(comp.parameters, 'offset', paramMapGet(comp.parameters, 'voltage', '0')), 0);
                nl += `V${rCount} ${nA} ${nB} SIN(${off} ${amp} ${freq})\n`;
                rCount++;
            }
            else if (libId.includes('LM7805') || libId.includes('LM7812') ||
                libId.includes('AMS1117') || libId.includes('REGULATOR')) {
                const nOut = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
                const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                let defOut = '5';
                if (libId.includes('7812')) {
                    defOut = '12';
                }
                else if (libId.includes('3V3') || libId.includes('1117')) {
                    defOut = '3.3';
                }
                const vNum = parseVoltageVolts(paramMapGet(comp.parameters, 'output', `${defOut}V`), parseFloat(defOut));
                nl += `VREG${rCount} ${nOut} ${nGnd} DC ${vNum}\n`;
                rCount++;
            }
            else if (AnalogEngine.isDcRailSupply(libId)) {
                const defHint = AnalogEngine.isNegativeDcRail(libId) ? 'VEE' : 'VCC';
                const supplyNode = this.resolveSupplyNode(comp, pinNets, netNodeMap, defHint);
                const defV = AnalogEngine.isNegativeDcRail(libId) ? '-12V' : '5V';
                const defNum = AnalogEngine.isNegativeDcRail(libId) ? -12 : 5;
                let vNum = parseVoltageVolts(paramMapGet(comp.parameters, 'voltage', defV), defNum);
                // VEE 参数常写成 "12V"；负轨必须为负电压
                if (AnalogEngine.isNegativeDcRail(libId) && vNum > 0) {
                    vNum = -vNum;
                }
                nl += `V${rCount} ${supplyNode} 0 DC ${vNum}\n`;
                rCount++;
            }
            else if (libId.includes('GND')) {
                const gndNode = this.resolveSupplyNode(comp, pinNets, netNodeMap, '0');
                nl += `* GND reference at ${gndNode}\n`;
            }
        }
        nl += `.model DMOD D (IS=1e-14 RS=0.5 N=1.0)\n`;
        nl += `.subckt OPA IN+ IN- OUT VCC VEE\n`;
        nl += `E1 OUT 0 VCC VEE IN+ IN- 100k\n.ends\n`;
        nl += `.tran ${config.stepSize} ${config.stopTime}\n.op\n.end\n`;
        return nl;
    }
    private buildNetNodeMap(doc: SchematicDocument): Map<string, string> {
        const map = new Map<string, string>();
        map.set('GND', '0');
        let unnamedIdx = 1;
        for (const net of doc.nets) {
            const upper = (net.name ?? '').toUpperCase();
            // Case-insensitive rails — 'gnd'/'Vss' must map to 0, not a floating signal node
            const isGnd = upper === 'GND' || upper === '0' || upper === 'VSS';
            const isVcc = upper === 'VCC' || upper === 'VDD' || upper === 'V+';
            const isVee = upper === 'VEE' || upper === 'V-';
            let nodeName: string;
            if (isGnd) {
                nodeName = '0';
            }
            else if (isVcc) {
                nodeName = 'VCC';
            }
            else if (isVee) {
                nodeName = 'VEE';
            }
            else if (net.name.length > 0) {
                nodeName = net.name;
            }
            else {
                nodeName = `N${unnamedIdx++}`;
            }
            map.set(net.id, nodeName);
            this.netUuidToNode.set(net.id, nodeName);
        }
        this.netUuidToNode.set('GND', '0');
        this.netUuidToNode.set('0', '0');
        this.netUuidToNode.set('VSS', '0');
        this.netUuidToNode.set('VCC', 'VCC');
        this.netUuidToNode.set('VDD', 'VCC');
        return map;
    }
    private getPinNetConnections(compId: string, doc: SchematicDocument): PinNetMapping[] {
        const cached = this.compPinNets.get(compId);
        if (cached)
            return cached;
        const mappings: PinNetMapping[] = [];
        for (const net of doc.nets) {
            for (const pinRef of net.pinIds) {
                const parts = pinRef.split(':');
                if (parts.length >= 2 && parts[0] === compId) {
                    mappings.push({ pinId: parts[1], pinName: parts[2] ?? parts[1], netId: net.id });
                }
            }
        }
        this.compPinNets.set(compId, mappings);
        return mappings;
    }
    private resolveCompNode(comp: ComponentInstance, pinHint: string, pinNets: PinNetMapping[], netNodeMap: Map<string, string>): string {
        const hintUpper = pinHint.toUpperCase();
        // First pass: exact match by pin name or ID
        for (const m of pinNets) {
            const pn = m.pinName.toUpperCase();
            const pi = m.pinId.toUpperCase();
            if (pn === hintUpper || pi === hintUpper) {
                return netNodeMap.get(m.netId) ?? `NC_${comp.id}_${pinHint}`;
            }
        }
        // Second pass: prefix match (e.g. hint 'V' matching 'V+')
        for (const m of pinNets) {
            const pn = m.pinName.toUpperCase();
            const pi = m.pinId.toUpperCase();
            if (pn.startsWith(hintUpper) || pi.startsWith(hintUpper)) {
                return netNodeMap.get(m.netId) ?? `NC_${comp.id}_${pinHint}`;
            }
        }
        // Fallback: numeric index only. Alphabetic index disabled when named pins exist
        // (prevents BJT/opamp/555 silent wrong-node stamps via 'B'→index 1).
        if (pinNets.length > 0) {
            const numIdx = parseInt(pinHint);
            if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= pinNets.length) {
                return netNodeMap.get(pinNets[numIdx - 1].netId) ?? `N_${comp.id}_${pinHint}`;
            }
            let hasNamedPins = false;
            for (let i = 0; i < pinNets.length; i++) {
                const pn = pinNets[i].pinName;
                if (pn.length > 0 && !/^\d+$/.test(pn) && pn.toUpperCase() !== pinNets[i].pinId.toUpperCase()) {
                    hasNamedPins = true;
                    break;
                }
            }
            if (!hasNamedPins) {
                const alphaIdx = pinHint.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
                if (alphaIdx >= 0 && alphaIdx < pinNets.length) {
                    return netNodeMap.get(pinNets[alphaIdx].netId) ?? `N_${comp.id}_${pinHint}`;
                }
            }
        }
        return `N_${comp.id}_${pinHint}`;
    }
    /** Two-terminal passives / diodes. Diode polarity (A→K) matters — prefer named pins first. */
    private resolvePassiveTerminals(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, preferPolarity: boolean = false): [
        string,
        string
    ] {
        // Named pin conventions first when polarity matters (LED / diode)
        const tryHints = preferPolarity
            ? [['A', 'K'], ['ANODE', 'CATHODE'], ['+', '-'], ['1', '2'], ['A', 'B'], ['P1', 'P2'], ['PLUS', 'MINUS']]
            : [['A', 'K'], ['A', 'B'], ['1', '2'], ['P1', 'P2'], ['+', '-'], ['ANODE', 'CATHODE'], ['PLUS', 'MINUS']];
        if (preferPolarity) {
            for (const hintPair of tryHints) {
                const nA = this.resolveCompNode(comp, hintPair[0], pinNets, netNodeMap);
                const nB = this.resolveCompNode(comp, hintPair[1], pinNets, netNodeMap);
                if (nA !== nB && !this.isFloatingNode(nA) && !this.isFloatingNode(nB)) {
                    return [nA, nB];
                }
            }
        }
        // Index order is fine for resistors/caps (bidirectional)
        if (pinNets.length >= 2) {
            const nA = netNodeMap.get(pinNets[0].netId) ?? `NC_${comp.id}_A`;
            const nB = netNodeMap.get(pinNets[1].netId) ?? `NC_${comp.id}_B`;
            if (nA !== nB && !this.isFloatingNode(nA) && !this.isFloatingNode(nB)) {
                return [nA, nB];
            }
        }
        if (!preferPolarity) {
            for (const hintPair of tryHints) {
                const nA = this.resolveCompNode(comp, hintPair[0], pinNets, netNodeMap);
                const nB = this.resolveCompNode(comp, hintPair[1], pinNets, netNodeMap);
                if (nA !== nB && !this.isFloatingNode(nA) && !this.isFloatingNode(nB)) {
                    return [nA, nB];
                }
            }
        }
        if (pinNets.length >= 2) {
            return [
                netNodeMap.get(pinNets[0].netId) ?? `NC_${comp.id}_A`,
                netNodeMap.get(pinNets[1].netId) ?? `NC_${comp.id}_B`
            ];
        }
        if (pinNets.length === 1) {
            const n1 = netNodeMap.get(pinNets[0].netId) ?? `NC_${comp.id}_1`;
            return [n1, `NC_${comp.id}_2`];
        }
        return [`NC_${comp.id}_A`, `NC_${comp.id}_B`];
    }
    /**
     * True DC rail / supply symbols only.
     * POWER_METER must NOT match — `includes('POWER')` previously stamped it as 5V Vsrc.
     */
    private static isDcRailSupply(libId: string): boolean {
        if (libId.includes('METER') || libId.includes('WATT') || libId.includes('AMMETER') ||
            libId === 'VAC' || libId.startsWith('VAC') || libId === 'SIGNAL_GEN') {
            return false;
        }
        return libId === 'VCC' || libId === 'VDD' || libId === 'VEE' || libId === 'POWER' ||
            libId.startsWith('VCC') || libId.startsWith('VDD') || libId.startsWith('VEE') ||
            (libId.includes('POWER') && !libId.includes('METER'));
    }
    private static isNegativeDcRail(libId: string): boolean {
        const u = (libId ?? '').toUpperCase();
        return u === 'VEE' || u.startsWith('VEE');
    }
    /** sine|square|triangle|saw|pulse → AnalogEngine waveform 名 */
    private static normalizeWaveformName(raw: string): string {
        const u = (raw ?? '').trim().toLowerCase();
        if (u === 'square' || u === '方波' || u === 'sq') {
            return 'square';
        }
        if (u === 'triangle' || u === '三角' || u === '三角波' || u === 'tri') {
            return 'triangle';
        }
        if (u === 'saw' || u === 'sawtooth' || u === '锯齿') {
            return 'sawtooth';
        }
        if (u === 'pulse' || u === '脉冲') {
            return 'pulse';
        }
        return 'sin';
    }
    /** First wired node among pin-name hints (V+/V/COM/V- aliases). */
    private resolveFirstWiredNode(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, hints: string[]): string {
        for (let i = 0; i < hints.length; i++) {
            const node = this.resolveCompNode(comp, hints[i], pinNets, netNodeMap);
            if (!this.isFloatingNode(node)) {
                return node;
            }
        }
        if (hints.length > 0) {
            return this.resolveCompNode(comp, hints[0], pinNets, netNodeMap);
        }
        return `NC_${comp.id}`;
    }
    /** Voltmeter V+/COM and ammeter I+/I- — never rely on pin index order. */
    private resolveInstrumentTerminals(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, libUpper: string): [
        string,
        string
    ] {
        if (libUpper.includes('POWER_METER') || (libUpper.includes('WATT') && libUpper.includes('METER'))) {
            const nPlus = this.resolveFirstWiredNode(comp, pinNets, netNodeMap, ['V+', 'VP', 'PLUS', '+']);
            const nMinus = this.resolveFirstWiredNode(comp, pinNets, netNodeMap, ['V-', 'COM', 'GND', '-']);
            return [nPlus, nMinus];
        }
        if (libUpper.includes('VOLTMETER') || libUpper.includes('VIRTUAL_METER') || libUpper === 'MULTIMETER' ||
            (libUpper.includes('METER') && !libUpper.includes('AMMETER') && !libUpper.includes('POWER'))) {
            // VIRTUAL_METER uses pin "V"; VOLTMETER_DC uses "V+".
            const nPlus = this.resolveFirstWiredNode(comp, pinNets, netNodeMap, ['V+', 'V', 'PLUS', '+', 'PROBE1']);
            const nCom = this.resolveFirstWiredNode(comp, pinNets, netNodeMap, ['COM', 'V-', '-', 'GND', 'PROBE2']);
            return [nPlus, nCom];
        }
        if (libUpper.includes('AMMETER')) {
            const nPlus = this.resolveCompNode(comp, 'I+', pinNets, netNodeMap);
            const nMinus = this.resolveCompNode(comp, 'I-', pinNets, netNodeMap);
            return [nPlus, nMinus];
        }
        return this.resolvePassiveTerminals(comp, pinNets, netNodeMap);
    }
    /** Single-pin supply symbols (VCC/GND) — match by pin name or ID; must be wire-connected. */
    private resolveSupplyNode(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, defaultName: string): string {
        for (const hint of ['VCC', 'VDD', 'VEE', 'V+', 'V-', 'GND', '1', 'A']) {
            const node = this.resolveCompNode(comp, hint, pinNets, netNodeMap);
            if (!this.isFloatingNode(node)) {
                return node;
            }
        }
        if (pinNets.length > 0) {
            const node = netNodeMap.get(pinNets[0].netId);
            if (node !== undefined && !this.isFloatingNode(node)) {
                return node;
            }
        }
        return `NC_${comp.id}_${defaultName}`;
    }
    private isOpAmpRailPin(pinName: string, pinId: string): boolean {
        const n = pinName.toUpperCase();
        const i = pinId.toUpperCase();
        return n === 'V+' || n === 'V-' || n === 'VCC' || n === 'VEE' || n === 'VDD' || n === 'GND' ||
            i === 'V+' || i === 'V-' || i === 'VCC' || i === 'VEE' || i === 'VDD' || i === 'GND';
    }
    /** Match dual (OUT1/IN+1/IN-1) and single (OUT/+/− / IN+/IN−) op-amp signal pins. */
    private resolveOpAmpSignalNode(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, role: string, exactNames: string[]): string {
        for (let hi = 0; hi < exactNames.length; hi++) {
            const hint = exactNames[hi].toUpperCase();
            for (const m of pinNets) {
                if (this.isOpAmpRailPin(m.pinName, m.pinId)) {
                    continue;
                }
                const pn = m.pinName.toUpperCase();
                const pi = m.pinId.toUpperCase();
                if (pn === hint || pi === hint) {
                    return netNodeMap.get(m.netId) ?? `NC_${comp.id}_${hint}`;
                }
            }
        }
        // Fuzzy: prefer channel-1 (OUT1/IN+1/IN-1) over channel-2 on dual packages
        let fallback: string | null = null;
        for (const m of pinNets) {
            if (this.isOpAmpRailPin(m.pinName, m.pinId)) {
                continue;
            }
            const pn = m.pinName.toUpperCase();
            let hit = false;
            if (role === 'out') {
                hit = pn.indexOf('OUT') >= 0;
            }
            else if (role === 'inp') {
                hit = pn.indexOf('IN+') >= 0 || (pn.indexOf('+') >= 0 && pn.indexOf('IN-') < 0);
            }
            else if (role === 'inn') {
                hit = pn.indexOf('IN-') >= 0 || (pn.indexOf('-') >= 0 && pn.indexOf('IN+') < 0);
            }
            if (!hit) {
                continue;
            }
            const node = netNodeMap.get(m.netId) ?? `NC_${comp.id}_${role}`;
            if (pn.endsWith('1') || pn === 'OUT' || pn === 'IN+' || pn === 'IN-') {
                return node;
            }
            if (fallback === null) {
                fallback = node;
            }
        }
        return fallback ?? `NC_${comp.id}_${role}`;
    }
    private resolveOpAmpRails(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>): [
        string,
        string
    ] {
        let nVcc = 'VCC';
        let nVee = '0';
        for (const m of pinNets) {
            const pn = m.pinName.toUpperCase();
            const node = netNodeMap.get(m.netId);
            if (node === undefined) {
                continue;
            }
            if (pn === 'V+' || pn === 'VCC' || pn === 'VDD') {
                nVcc = node === 'GND' ? '0' : node;
            }
            else if (pn === 'V-' || pn === 'VEE' || pn === 'GND') {
                nVee = node === 'GND' ? '0' : node;
            }
        }
        return [nVcc, nVee];
    }
    private areTerminalsConnected(nA: string, nB: string): boolean {
        return !this.isFloatingNode(nA) && !this.isFloatingNode(nB) && nA !== nB;
    }
    private isFloatingNode(nodeName: string): boolean {
        if (nodeName.startsWith('NC_')) {
            return true;
        }
        // Synthetic node from resolveCompNode when pin is unmapped: N_<compId>_<pinHint>
        // compId contains underscores (e.g. comp_1783663703417_11), so do not use [^_]+.
        if (nodeName.startsWith('N_')) {
            return true;
        }
        return false;
    }
    // ---- MNA core solver ----
    private buildNodeIndex(_doc: SchematicDocument): void {
        this.nodeIndex.clear();
        this.nodeIndex.set('0', 0);
        let idx = 1;
        const addNode = (nodeName: string): void => {
            if (nodeName.length === 0) {
                return;
            }
            const normalized = nodeName === 'GND' ? '0' : nodeName;
            if (normalized === '0' || this.nodeIndex.has(normalized)) {
                return;
            }
            this.nodeIndex.set(normalized, idx++);
        };
        // Use the same node names as buildNetNodeMap / device stamps
        this.netUuidToNode.forEach((nodeName: string) => {
            addNode(nodeName);
        });
        for (const r of this.resistors) {
            addNode(r.nodeA);
            addNode(r.nodeB);
        }
        for (const c of this.capacitors) {
            addNode(c.nodeA);
            addNode(c.nodeB);
        }
        for (const l of this.inductors) {
            addNode(l.nodeA);
            addNode(l.nodeB);
        }
        for (const d of this.diodes) {
            addNode(d.nodeA);
            addNode(d.nodeB);
        }
        for (const vs of this.voltageSources) {
            addNode(vs.nodeA);
            addNode(vs.nodeB);
        }
        for (const bjt of this.bjts) {
            addNode(bjt.nodeC);
            addNode(bjt.nodeB);
            addNode(bjt.nodeE);
        }
        for (const mos of this.mosfets) {
            addNode(mos.nodeD);
            addNode(mos.nodeG);
            addNode(mos.nodeS);
        }
        for (const opa of this.opamps) {
            addNode(opa.nodeOut);
            addNode(opa.nodeInP);
            addNode(opa.nodeInN);
            addNode(opa.nodeVcc);
            addNode(opa.nodeVee);
        }
        if (!this.nodeIndex.has('VCC')) {
            addNode('VCC');
        }
        this.matrixSize = idx + this.voltageSources.length + 10;
    }
    private buildDeviceModels(doc: SchematicDocument): void {
        this.resistors = [];
        this.capacitors = [];
        this.inductors = [];
        this.diodes = [];
        this.bjts = [];
        this.mosfets = [];
        this.opamps = [];
        this.voltageSources = [];
        this.compPinNets.clear();
        this.relayContacts = [];
        this.timer555s = [];
        const netNodeMap = this.buildNetNodeMap(doc);
        const vt = 0.02585;
        let rIdx = 0;
        let cIdx = 0;
        let dIdx = 0;
        let qIdx = 0;
        let xIdx = 0;
        for (const comp of doc.components) {
            const libId = comp.libraryId.toUpperCase();
            const pinNets = this.getPinNetConnections(comp.id, doc);
            const isDiodeLike = libId.startsWith('LED') || libId.startsWith('1N') || libId.includes('DIODE');
            const passive = this.resolvePassiveTerminals(comp, pinNets, netNodeMap, isDiodeLike);
            const nA = passive[0];
            const nB = passive[1];
            if (libId.startsWith('R_') || libId.includes('RESISTOR')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: resistor pin(s) not wired`);
                    continue;
                }
                const val = paramMapGet(comp.parameters, 'value', '');
                const fallback = libId.replace(/^(R_|RESISTOR_?)/i, '');
                const corrected = this.withUnitSuffix(val, fallback);
                const rVal = this.parseResistance(corrected);
                const devId = `R${rIdx++}`;
                this.resistors.push({ id: devId, nodeA: nA, nodeB: nB, resistance: rVal });
                this.compUuidToDevId.set(comp.id, [devId]);
                if (!this.quietLoad) {
                    Logger.info(INSTR_TRACE_TAG, `analog R-dev ${comp.refDes} lib=${comp.libraryId} val="${val}" fallback="${fallback}" corrected="${corrected}" → ${rVal}Ω`);
                    traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `${rVal}Ω pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                }
                // Also store net ↔ node mapping for this component's nets
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.startsWith('POT_') || libId.includes('POTENTIOMETER') ||
                libId.includes('RHEOSTAT')) {
                const n1 = this.resolveCompNode(comp, '1', pinNets, netNodeMap);
                const n2 = this.resolveCompNode(comp, '2', pinNets, netNodeMap);
                const nW = this.resolveCompNode(comp, 'W', pinNets, netNodeMap);
                if (this.isFloatingNode(n1) || this.isFloatingNode(n2) || this.isFloatingNode(nW)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: pot pin(s) not wired`);
                    continue;
                }
                const val = paramMapGet(comp.parameters, 'value', '');
                const fallback = libId.replace(/^(POT_|POTENTIOMETER_?)/i, '');
                const corrected = this.withUnitSuffix(val, fallback.length > 0 ? fallback : '10k');
                const rTot = Math.max(this.parseResistance(corrected), 1);
                const tap = AnalogEngine.parseWiperFraction(paramMapGet(comp.parameters, 'wiper', '0.5'));
                const rAw = Math.max(rTot * tap, 1);
                const rWb = Math.max(rTot * (1 - tap), 1);
                const idAw = `R${rIdx++}`;
                const idWb = `R${rIdx++}`;
                this.resistors.push({ id: idAw, nodeA: n1, nodeB: nW, resistance: rAw });
                this.resistors.push({ id: idWb, nodeA: nW, nodeB: n2, resistance: rWb });
                this.compUuidToDevId.set(comp.id, [idAw, idWb]);
                if (!this.quietLoad) {
                    Logger.info(INSTR_TRACE_TAG, `analog POT ${comp.refDes} lib=${comp.libraryId} R=${rTot}Ω wiper=${tap.toFixed(3)} ` +
                        `→ ${rAw.toFixed(1)}Ω + ${rWb.toFixed(1)}Ω`);
                    traceAnalogDeviceStamp(comp.refDes, idAw, comp.libraryId, n1, nW, `POT A-W ${rAw.toFixed(1)}Ω tap=${tap.toFixed(3)}`);
                    traceAnalogDeviceStamp(comp.refDes, idWb, comp.libraryId, nW, n2, `POT W-B ${rWb.toFixed(1)}Ω`);
                }
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId === 'LDR' || libId.includes('PHOTORESISTOR')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: LDR pin(s) not wired`);
                    continue;
                }
                const val = paramMapGet(comp.parameters, 'value', '50k');
                const corrected = this.withUnitSuffix(val, '50k');
                const rVal = this.parseResistance(corrected);
                const devId = `R${rIdx++}`;
                this.resistors.push({ id: devId, nodeA: nA, nodeB: nB, resistance: rVal });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `LDR ${rVal}Ω pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId === 'DS18B20' || libId.includes('DS18B20')) {
                // Teaching analog: DQ→GND voltage tracks temp_c (−55°C→0V … 125°C→5V).
                // Real 1-Wire protocol is not modelled; canvas slider drives this Vsrc.
                // Firmware must keep PA3 as GPIO input so it does not fight this source.
                const nDq = this.resolveCompNode(comp, 'DQ', pinNets, netNodeMap);
                const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                if (this.isFloatingNode(nDq) || this.isFloatingNode(nGnd)) {
                    if (!this.quietLoad) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: DS18B20 DQ/GND not wired`);
                    }
                    continue;
                }
                const tempC = AnalogEngine.parseTempCelsius(paramMapGet(comp.parameters, 'temp_c', '25'));
                const vTeach = AnalogEngine.tempCToTeachVolts(tempC);
                const devId = `V${this.voltageSources.length}`;
                this.voltageSources.push({
                    id: devId, nodeA: nDq, nodeB: nGnd,
                    voltage: vTeach, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                    dutyCycle: 0.5, riseTime: 0, fallTime: 0
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                if (!this.quietLoad) {
                    Logger.info(INSTR_TRACE_TAG, `analog DS18B20 ${comp.refDes} temp_c=${tempC.toFixed(1)}°C → DQ=${vTeach.toFixed(3)}V`);
                    traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nDq, nGnd, `DS18B20 teach ${tempC.toFixed(1)}°C→${vTeach.toFixed(3)}V`);
                }
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId === 'HALL_SENSOR' || libId.includes('HALL')) {
                // Open-collector: active(magnet)=1 → OUT short to GND; else high-Z (external pull-up).
                const nOut = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
                const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                if (this.isFloatingNode(nOut) || this.isFloatingNode(nGnd)) {
                    if (!this.quietLoad) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: HALL OUT/GND not wired`);
                    }
                    continue;
                }
                const active = AnalogEngine.isTruthyParam(paramMapGet(comp.parameters, 'active', '0'));
                if (active) {
                    const devId = `R${rIdx++}`;
                    this.resistors.push({ id: devId, nodeA: nOut, nodeB: nGnd, resistance: 10 });
                    this.compUuidToDevId.set(comp.id, [devId]);
                    if (!this.quietLoad) {
                        Logger.info(INSTR_TRACE_TAG, `analog HALL ${comp.refDes} active=1 OUT→GND 10Ω`);
                        traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nOut, nGnd, 'HALL magnet ON');
                    }
                }
                else if (!this.quietLoad) {
                    Logger.info(INSTR_TRACE_TAG, `analog HALL ${comp.refDes} active=0 (open / pull-up)`);
                }
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.startsWith('FUSE') || libId.includes('FUSE')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: fuse pin(s) not wired`);
                    continue;
                }
                const devId = `R${rIdx++}`;
                this.resistors.push({ id: devId, nodeA: nA, nodeB: nB, resistance: 0.01 });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `0.01Ω FUSE pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId === 'SW_PUSH' || libId.includes('SWITCH_PUSH') || libId === 'BUTTON') {
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: switch pin(s) not wired`);
                    continue;
                }
                const pressed = AnalogEngine.isTruthyParam(paramMapGet(comp.parameters, 'pressed', '0'));
                const rVal = pressed ? SW_CLOSED_OHMS : SW_OPEN_OHMS;
                const devId = `R${rIdx++}`;
                this.resistors.push({ id: devId, nodeA: nA, nodeB: nB, resistance: rVal });
                this.compUuidToDevId.set(comp.id, [devId]);
                if (!this.quietLoad) {
                    traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `${pressed ? 'CLOSED' : 'OPEN'} ${rVal}Ω SW pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                }
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId === 'RELAY_SPDT' || libId.includes('RELAY')) {
                rIdx = this.stampRelay(comp, pinNets, netNodeMap, rIdx);
            }
            else if (libId === 'BUZZER' || libId.includes('BUZZER')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: buzzer pin(s) not wired`);
                    continue;
                }
                // Passive load so MCU drive sees a real sink (~10mA @ 3.3V)
                const devId = `R${rIdx++}`;
                this.resistors.push({ id: devId, nodeA: nA, nodeB: nB, resistance: 330 });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `330Ω BUZ pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.startsWith('C_') || libId.includes('CAP')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    continue;
                }
                const val = paramMapGet(comp.parameters, 'value', '');
                const fallback = libId.replace(/^(C_|CAP_?)/i, '');
                const cVal = this.parseCapacitance(this.withUnitSuffix(val, fallback));
                const devId = `C${cIdx}`;
                this.capacitors.push({
                    id: devId, nodeA: nA, nodeB: nB,
                    capacitance: cVal, voltage: 0, prevVoltage: 0, current: 0, geq: 0, ieq: 0
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                cIdx++;
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.startsWith('L_') || libId.includes('INDUCTOR')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    continue;
                }
                const val = paramMapGet(comp.parameters, 'value', '');
                const fallback = libId.replace(/^L_/i, '');
                const lVal = this.parseInductance(this.withUnitSuffix(val, fallback || '1m'));
                const devId = `L${cIdx}`;
                this.inductors.push({
                    id: devId, nodeA: nA, nodeB: nB,
                    inductance: lVal, current: 0, prevCurrent: 0, prevVoltage: 0, ieqStamp: 0, geq: 0
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                cIdx++;
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.startsWith('LED') || libId.startsWith('1N') || libId.includes('DIODE')) {
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: diode/LED pin(s) not wired (A=${nA} K=${nB})`);
                    continue;
                }
                const devId = `D${dIdx++}`;
                // LEDs need ~1.8–2.2V Vf. Is=1e-20 forces EXP_CLAMP→Newton stalls; 1e-17 still ≈2.8V@10mA.
                const isLed = libId.startsWith('LED');
                this.diodes.push({
                    id: devId, nodeA: nA, nodeB: nB,
                    is: isLed ? 1e-17 : 1e-14,
                    n: isLed ? 2.0 : 1.0,
                    vt: vt,
                    rs: isLed ? 10 : 0.5
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `${isLed ? 'LED' : 'DIODE'} pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (this.isMosfetLib(libId)) {
                const nD = this.resolveCompNode(comp, 'D', pinNets, netNodeMap);
                const nG = this.resolveCompNode(comp, 'G', pinNets, netNodeMap);
                const nS = this.resolveCompNode(comp, 'S', pinNets, netNodeMap);
                if (this.isFloatingNode(nD) || this.isFloatingNode(nG) || this.isFloatingNode(nS)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: MOSFET D/G/S not wired (D=${nD} G=${nG} S=${nS})`);
                    continue;
                }
                const isPmos = libId.includes('PMOS') || libId.includes('AO3401') || libId.includes('IRF9');
                const devId = `M${this.mosfets.length}`;
                this.mosfets.push({
                    id: devId, nodeD: nD, nodeG: nG, nodeS: nS, nodeB: nS,
                    type: isPmos ? 'pmos' : 'nmos',
                    kp: 0.05, vto: isPmos ? -1.5 : 1.5, lambda: 0.02, w: 1, l: 1
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nD, nS, `${isPmos ? 'PMOS' : 'NMOS'} G=${nG} pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.includes('NPN') || libId.includes('PNP') || this.isBjtLib(libId)) {
                const nC = this.resolveCompNode(comp, 'C', pinNets, netNodeMap);
                const nBjtB = this.resolveCompNode(comp, 'B', pinNets, netNodeMap);
                const nE = this.resolveCompNode(comp, 'E', pinNets, netNodeMap);
                if (this.isFloatingNode(nC) || this.isFloatingNode(nBjtB) || this.isFloatingNode(nE)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: BJT C/B/E not wired (C=${nC} B=${nBjtB} E=${nE})`);
                    continue;
                }
                const isPnp = this.isPnpLib(libId);
                const devId = `Q${qIdx++}`;
                this.bjts.push({
                    id: devId, nodeC: nC, nodeB: nBjtB, nodeE: nE,
                    type: isPnp ? 'pnp' : 'npn',
                    is: 1e-14, bf: 200, nf: 1.0, vaf: 100
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                Logger.info(INSTR_TRACE_TAG, `[MNA] ${comp.refDes} ${devId} lib=${comp.libraryId} ${isPnp ? 'PNP' : 'NPN'} C=${nC} B=${nBjtB} E=${nE}`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.includes('LM358') || libId.includes('LM324') || libId.includes('741') ||
                libId.includes('TL08') || libId.includes('OPAMP') || libId.includes('OP_AMP')) {
                const nO = this.resolveOpAmpSignalNode(comp, pinNets, netNodeMap, 'out', ['OUT1', 'OUT', 'OUTPUT']);
                const nP = this.resolveOpAmpSignalNode(comp, pinNets, netNodeMap, 'inp', ['IN+1', 'IN+', '+', 'VIP']);
                const nN = this.resolveOpAmpSignalNode(comp, pinNets, netNodeMap, 'inn', ['IN-1', 'IN-', '-', 'VIN']);
                if (this.isFloatingNode(nO) || this.isFloatingNode(nP) || this.isFloatingNode(nN)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: opamp OUT/IN+/IN- not wired (out=${nO} inp=${nP} inn=${nN})`);
                    continue;
                }
                const rails = this.resolveOpAmpRails(comp, pinNets, netNodeMap);
                const devId = `X${xIdx++}`;
                this.opamps.push({
                    // A=1e4 is still ≫ closed-loop gain of lab circuits; 1e5 Ill-conditions the MNA.
                    id: devId, nodeOut: nO, nodeInP: nP, nodeInN: nN,
                    nodeVcc: rails[0], nodeVee: rails[1], gain: 10000, bw: 1e6,
                    comparatorMode: false, compHigh: false
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                Logger.info(INSTR_TRACE_TAG, `[MNA] ${comp.refDes} ${devId} lib=${comp.libraryId} OUT=${nO} IN+=${nP} IN-=${nN} V+=${rails[0]} V-=${rails[1]}`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (AnalogEngine.isTimer555Lib(libId)) {
                rIdx = this.stampTimer555(comp, pinNets, netNodeMap, rIdx);
            }
            else if (libId === 'VAC' || libId.startsWith('VAC') ||
                libId === 'SIGNAL_GEN' || libId.startsWith('SIGNAL_GEN')) {
                const isSig = libId === 'SIGNAL_GEN' || libId.startsWith('SIGNAL_GEN');
                let nA: string;
                let nB: string;
                if (isSig) {
                    const nOut = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
                    nA = this.isFloatingNode(nOut) ? this.resolveCompNode(comp, '1', pinNets, netNodeMap) : nOut;
                    const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                    nB = this.isFloatingNode(nGnd) ? this.resolveCompNode(comp, '2', pinNets, netNodeMap) : nGnd;
                }
                else {
                    const nPlus = this.resolveCompNode(comp, 'AC+', pinNets, netNodeMap);
                    nA = this.isFloatingNode(nPlus) ? this.resolveCompNode(comp, '1', pinNets, netNodeMap) : nPlus;
                    const nMinus = this.resolveCompNode(comp, 'AC-', pinNets, netNodeMap);
                    nB = this.isFloatingNode(nMinus) ? this.resolveCompNode(comp, '2', pinNets, netNodeMap) : nMinus;
                }
                if (!this.areTerminalsConnected(nA, nB)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: ${isSig ? 'SIGNAL_GEN' : 'VAC'} pin(s) not wired`);
                    continue;
                }
                const defAmp = isSig ? '1V' : '220V';
                const defFreq = isSig ? '1kHz' : '50Hz';
                const amp = parseVoltageVolts(paramMapGet(comp.parameters, 'amplitude', defAmp), isSig ? 1 : 220);
                const freqParsed = UnitParser.parseFrequency(paramMapGet(comp.parameters, 'frequency', defFreq));
                const freq = freqParsed.numeric > 0 ? freqParsed.numeric : (isSig ? 1000 : 50);
                const off = parseVoltageVolts(paramMapGet(comp.parameters, 'offset', paramMapGet(comp.parameters, 'voltage', '0')), 0);
                const wf = isSig
                    ? AnalogEngine.normalizeWaveformName(paramMapGet(comp.parameters, 'waveform', 'sine'))
                    : 'sin';
                const dutyRaw = paramMapGet(comp.parameters, 'dutyCycle', '50');
                let dutyCycle = 0.5;
                const dutyN = parseFloat(dutyRaw.replace(/%/g, ''));
                if (Number.isFinite(dutyN)) {
                    dutyCycle = dutyN > 1 ? dutyN / 100 : dutyN;
                }
                dutyCycle = Math.max(0.01, Math.min(0.99, dutyCycle));
                const devId = `V${this.voltageSources.length}`;
                this.voltageSources.push({
                    id: devId, nodeA: nA, nodeB: nB,
                    voltage: off, waveform: wf, freq: freq, amplitude: amp, phase: 0,
                    dutyCycle: dutyCycle, riseTime: 0, fallTime: 0
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB, `${isSig ? 'SIGGEN' : 'VAC'} wf=${wf} offset=${off}V amp=${amp}V f=${freq}Hz` +
                    ` duty=${(dutyCycle * 100).toFixed(0)}%` +
                    ` pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (AnalogEngine.isDcRailSupply(libId)) {
                const defHint = AnalogEngine.isNegativeDcRail(libId) ? 'VEE' : 'VCC';
                const supplyNode = this.resolveSupplyNode(comp, pinNets, netNodeMap, defHint);
                if (this.isFloatingNode(supplyNode)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: supply pin not wired`);
                    continue;
                }
                const defV = AnalogEngine.isNegativeDcRail(libId) ? '-12V' : '5V';
                const defNum = AnalogEngine.isNegativeDcRail(libId) ? -12 : 5;
                let vNum = parseVoltageVolts(paramMapGet(comp.parameters, 'voltage', defV), defNum);
                // VEE 参数常写成 "12V"；负轨必须为负电压
                if (AnalogEngine.isNegativeDcRail(libId) && vNum > 0) {
                    vNum = -vNum;
                }
                const devId = `V${this.voltageSources.length}`;
                this.voltageSources.push({
                    id: devId, nodeA: supplyNode, nodeB: '0',
                    voltage: vNum, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                    dutyCycle: 0.5, riseTime: 0, fallTime: 0
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                if (!this.quietLoad) {
                    traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, supplyNode, '0', `Vsrc ${vNum}V pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                }
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else if (libId.includes('LM7805') || libId.includes('LM7812') ||
                libId.includes('AMS1117') || libId.includes('REGULATOR')) {
                const nOut = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
                const nOutAlt = this.isFloatingNode(nOut)
                    ? this.resolveCompNode(comp, '3', pinNets, netNodeMap) : nOut;
                const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
                const nGndAlt = this.isFloatingNode(nGnd)
                    ? this.resolveCompNode(comp, '2', pinNets, netNodeMap) : nGnd;
                if (!this.areTerminalsConnected(nOutAlt, nGndAlt)) {
                    Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: regulator OUT/GND not wired`);
                    continue;
                }
                let defOut = '5V';
                if (libId.includes('7812')) {
                    defOut = '12V';
                }
                else if (libId.includes('3V3') || libId.includes('1117')) {
                    defOut = '3.3V';
                }
                const vNum = parseVoltageVolts(paramMapGet(comp.parameters, 'output', defOut), 5);
                const devId = `V${this.voltageSources.length}`;
                this.voltageSources.push({
                    id: devId, nodeA: nOutAlt, nodeB: nGndAlt,
                    voltage: vNum, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                    dutyCycle: 0.5, riseTime: 0, fallTime: 0
                });
                this.compUuidToDevId.set(comp.id, [devId]);
                traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nOutAlt, nGndAlt, `REG ${vNum}V pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
            else {
                // MCU, instruments, etc. — inject characteristic impedance so nodes don't float
                const libUpper = libId.toUpperCase();
                if (libUpper.includes('POWER_METER') || (libUpper.includes('WATT') && libUpper.includes('METER'))) {
                    // V 路：高阻并测；I 路：0V 理想串联（与电流表相同），否则 I+/I- 分网会开路。
                    const nVp = this.resolveFirstWiredNode(comp, pinNets, netNodeMap, ['V+', 'VP', 'PLUS', '+']);
                    const nVm = this.resolveFirstWiredNode(comp, pinNets, netNodeMap, ['V-', 'COM', 'GND', '-']);
                    const nIp = this.resolveCompNode(comp, 'I+', pinNets, netNodeMap);
                    const nIm = this.resolveCompNode(comp, 'I-', pinNets, netNodeMap);
                    const devIds: string[] = [];
                    if (this.areTerminalsConnected(nIp, nIm) && nIp !== nIm &&
                        !this.isFloatingNode(nIp) && !this.isFloatingNode(nIm)) {
                        const iDev = `V${this.voltageSources.length}`;
                        this.voltageSources.push({
                            id: iDev, nodeA: nIp, nodeB: nIm,
                            voltage: 0, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                            dutyCycle: 0.5, riseTime: 0, fallTime: 0
                        });
                        // VSRC 放首位：getCurrentForComponent 取 branch I(V*)
                        devIds.push(iDev);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, iDev, comp.libraryId, nIp, nIm, `0V Ideal-PM-I pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                        }
                    }
                    else if (!this.quietLoad) {
                        Logger.info(INSTR_TRACE_TAG, `analog ${comp.refDes}: power-meter I+/I- not series-wired (skip I stamp)`);
                    }
                    if (this.areTerminalsConnected(nVp, nVm) && !this.isFloatingNode(nVp) && !this.isFloatingNode(nVm)) {
                        const rDev = `R${rIdx++}`;
                        this.resistors.push({ id: rDev, nodeA: nVp, nodeB: nVm, resistance: 10e6 });
                        devIds.push(rDev);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, rDev, comp.libraryId, nVp, nVm, `10MΩ PM-V pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                        }
                    }
                    else if (!this.quietLoad) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: power-meter V+/V- not wired`);
                    }
                    if (devIds.length > 0) {
                        this.compUuidToDevId.set(comp.id, devIds);
                    }
                }
                else if (libUpper.includes('VIRTUAL_METER') || libUpper === 'MULTIMETER') {
                    // 四端 DMM：V-COM 高阻；A-COM 理想串联；OHM-COM 戴维南感测 1V+1kΩ
                    const nV = this.resolveCompNode(comp, 'V', pinNets, netNodeMap);
                    const nA = this.resolveCompNode(comp, 'A', pinNets, netNodeMap);
                    const nOhm = this.resolveCompNode(comp, 'OHM', pinNets, netNodeMap);
                    const nCom = this.resolveCompNode(comp, 'COM', pinNets, netNodeMap);
                    const dmmDevs: string[] = [];
                    if (!this.isFloatingNode(nA) && !this.isFloatingNode(nCom) && nA !== nCom) {
                        const aDev = `V${this.voltageSources.length}`;
                        this.voltageSources.push({
                            id: aDev, nodeA: nA, nodeB: nCom,
                            voltage: 0, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                            dutyCycle: 0.5, riseTime: 0, fallTime: 0
                        });
                        dmmDevs.push(aDev);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, aDev, comp.libraryId, nA, nCom, `0V DMM-A pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                        }
                    }
                    if (!this.isFloatingNode(nV) && !this.isFloatingNode(nCom) && nV !== nCom) {
                        const vDev = `R${rIdx++}`;
                        this.resistors.push({ id: vDev, nodeA: nV, nodeB: nCom, resistance: 10e6 });
                        dmmDevs.push(vDev);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, vDev, comp.libraryId, nV, nCom, `10MΩ DMM-V pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                        }
                    }
                    if (!this.isFloatingNode(nOhm) && !this.isFloatingNode(nCom) && nOhm !== nCom) {
                        const nInt = `DMM_OHM_${comp.id}`;
                        const ohmV = `V${this.voltageSources.length}`;
                        this.voltageSources.push({
                            id: ohmV, nodeA: nInt, nodeB: nCom,
                            voltage: 1, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                            dutyCycle: 0.5, riseTime: 0, fallTime: 0
                        });
                        const ohmR = `R${rIdx++}`;
                        this.resistors.push({ id: ohmR, nodeA: nInt, nodeB: nOhm, resistance: 1000 });
                        dmmDevs.push(ohmV);
                        dmmDevs.push(ohmR);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, ohmV, comp.libraryId, nInt, nCom, `1V DMM-OHM Thevenin pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                            traceAnalogDeviceStamp(comp.refDes, ohmR, comp.libraryId, nInt, nOhm, '1kΩ DMM-OHM Rsense');
                        }
                    }
                    if (dmmDevs.length > 0) {
                        this.compUuidToDevId.set(comp.id, dmmDevs);
                    }
                }
                else if (libUpper.includes('VOLTMETER') ||
                    (libUpper.includes('METER') && !libUpper.includes('AMMETER') && !libUpper.includes('POWER') &&
                        !libUpper.includes('VIRTUAL'))) {
                    const vm = this.resolveInstrumentTerminals(comp, pinNets, netNodeMap, libUpper);
                    if (!this.areTerminalsConnected(vm[0], vm[1])) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: voltmeter pin(s) not wired`);
                    }
                    else {
                        const devId = `R${rIdx++}`;
                        this.resistors.push({ id: devId, nodeA: vm[0], nodeB: vm[1], resistance: 10e6 });
                        this.compUuidToDevId.set(comp.id, [devId]);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, vm[0], vm[1], `10MΩ VM pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                        }
                    }
                }
                else if (libUpper.includes('AMMETER')) {
                    const am = this.resolveInstrumentTerminals(comp, pinNets, netNodeMap, libUpper);
                    if (!this.areTerminalsConnected(am[0], am[1])) {
                        Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: ammeter pin(s) not wired`);
                    }
                    else {
                        // Ideal series ammeter: 0V VSRC. Branch current comes from MNA unknown.
                        // 0.1Ω shunt ΔV≈µV 会落在 Newton 1e-5 容差内 → (V+-V-)/R 恒为 0。
                        const devId = `V${this.voltageSources.length}`;
                        this.voltageSources.push({
                            id: devId, nodeA: am[0], nodeB: am[1],
                            voltage: 0, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
                            dutyCycle: 0.5, riseTime: 0, fallTime: 0
                        });
                        this.compUuidToDevId.set(comp.id, [devId]);
                        if (!this.quietLoad) {
                            traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, am[0], am[1], `0V Ideal-AM pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
                        }
                    }
                }
                for (const m of pinNets) {
                    const node = netNodeMap.get(m.netId);
                    if (node)
                        this.netUuidToNode.set(m.netId, node);
                }
            }
        }
        this.classifyOpAmpFeedbackModes();
        const rStamps: AnalogResistorStamp[] = [];
        for (let ri = 0; ri < this.resistors.length; ri++) {
            const r = this.resistors[ri];
            let refDes = r.id;
            this.compUuidToDevId.forEach((devIds: string[], compId: string) => {
                if (devIds.includes(r.id)) {
                    const comp = doc.components.find(c => c.id === compId);
                    if (comp !== undefined) {
                        refDes = comp.refDes;
                    }
                }
            });
            rStamps.push({ devId: r.id, refDes: refDes, nodeA: r.nodeA, nodeB: r.nodeB, ohms: r.resistance });
        }
        const vsrcLines: string[] = [];
        for (let vi = 0; vi < this.voltageSources.length; vi++) {
            const vs = this.voltageSources[vi];
            vsrcLines.push(`Vsrc ${vs.id} ${vs.nodeA}->${vs.nodeB} ${vs.voltage}V`);
        }
        if (!this.quietLoad) {
            traceAnalogNetlistSummary(rStamps, vsrcLines);
        }
    }
    solveTransient(time: number, stepSize: number): Map<string, number> {
        this.lastStepSize = Math.max(stepSize, 1e-15);
        this.simTime = time;
        this.solveTransientStep(this.lastStepSize);
        const signals = new Map<string, number>();
        this.nodeVoltages.forEach((v, node) => signals.set(node, v));
        this.computeBranchCurrents();
        return signals;
    }
    solveDC(): Map<string, number> {
        this.inTransientStep = false;
        this.runOpAnalysis();
        this.seedReactiveFromOp();
        this.syncGroundAlias();
        this.computeBranchCurrents();
        return copyNodeMap(this.nodeVoltages);
    }
    solveAC(freq: number): Map<string, number> {
        this.buildMnaSystem(freq, true);
        const n = this.nodeIndex.size + this.voltageSources.length;
        if (!this.solveLinearSystem(n)) {
            this.lastConverged = false;
            return copyNodeMap(this.nodeVoltages);
        }
        const result = new Map<string, number>();
        this.nodeIndex.forEach((idx, node) => {
            if (idx < this.mnaRhs.length)
                result.set(node, Math.abs(this.mnaRhs[idx]));
        });
        this.lastConverged = true;
        return result;
    }
    getNetlist(): string { return this.netlist; }
    getBranchCurrents(): Map<string, number> { return this.branchCurrents; }
    getLastConverged(): boolean { return this.lastConverged; }
    /** Snapshot of SPICE node → voltage after last OP/transient solve */
    exportNodeVoltages(): Map<string, number> {
        return copyNodeMap(this.nodeVoltages);
    }
    getNodeVoltage(node: string): number { return this.nodeVoltages.get(node) ?? 0; }
    getTotalIterations(): number { return this.newtonIterations; }
    /** Highest time-varying source frequency (Hz); 0 if only DC. Used to size scope sim bursts. */
    getMaxAcFrequency(): number {
        let maxF = 0;
        for (let i = 0; i < this.voltageSources.length; i++) {
            const vs = this.voltageSources[i];
            if (vs.freq > maxF && vs.amplitude !== 0) {
                maxF = vs.freq;
            }
        }
        return maxF;
    }
    /** Count of behavioral 555 timers in the loaded netlist (astable/monostable). */
    getTimer555Count(): number {
        return this.timer555s.length;
    }
    /**
     * After updateRelayContactsFromCoil(): whether a DC re-solve is required.
     * Relay contact changes need OP; 555 OUT/DISCH updates must NOT run DC OP mid-transient
     * (capacitors go open and wipe timing-cap voltage — kills astable oscillation).
     */
    needsDcResolveAfterSwitch(): boolean {
        return this.lastRelayFlipped;
    }
    private runOpAnalysis(): void {
        // On LU failure keep the previous iterate (do not snap back) — restoring
        // every singular step freezes VAC-driven circuits near op-amp rails.
        for (let iter = 0; iter < this.maxNewtonIter; iter++) {
            this.newtonIterations = iter + 1;
            this.buildMnaSystem(0, false);
            const n = this.nodeIndex.size + this.voltageSources.length;
            if (!this.solveLinearSystem(n)) {
                this.lastConverged = false;
                this.enforceVoltageSources();
                this.syncGroundAlias();
                return;
            }
            if (this.checkNewtonConvergence(n)) {
                this.lastConverged = true;
                this.updateNodeVoltages(n, 1.0, 0);
                this.enforceVoltageSources();
                return;
            }
            // Adaptive damp + per-iter step cap: diode/BJT first guess otherwise injects Vd≈VCC
            const maxDelta = this.newtonMaxDelta(n);
            const damp = maxDelta < 1e-2 ? 1.0 : 0.6;
            const stepLim = maxDelta < 0.1 ? 2.0 : 0.4;
            this.updateNodeVoltages(n, damp, stepLim);
        }
        this.lastConverged = false;
        this.enforceVoltageSources();
    }
    private solveTransientStep(dt: number): void {
        // 1) Build companions from committed (v,i) state for this dt
        // 2) Solve with companions held fixed across Newton iterations
        // 3) Commit new (v,i) — do NOT update ieq before the solve (old bug)
        this.prepareReactiveCompanions(dt);
        this.inTransientStep = true;
        this.runOpAnalysis();
        // Always pin ideal sources to simTime so UI cannot freeze when Newton soft-fails
        this.enforceVoltageSources();
        // Commit reactive companions even on soft-fail so C/L (and wall-clock) keep advancing
        this.commitReactiveCompanions();
        this.inTransientStep = false;
        this.syncGroundAlias();
    }
    /**
     * Pin ideal VSRC nodes after registerSignalSource / DIG Thevenin.
     * holdAcAtOffset=true (default): VAC/SIGGEN snap to DC offset — correct for .OP / load.
     * holdAcAtOffset=false: keep instantaneous AC at simTime so mid-run DIG THEV stamps
     * do not freeze SIGGEN at offset (lab_digital CLK stuck at 2.5V / no CD4017 edges).
     */
    pinVoltageSources(holdAcAtOffset: boolean = true): void {
        if (holdAcAtOffset) {
            this.enforceVoltageSources();
            return;
        }
        const prev = this.inTransientStep;
        this.inTransientStep = true;
        this.enforceVoltageSources();
        this.inTransientStep = prev;
    }
    /** Re-run DC OP after live param / GPIO Thevenin changes (e.g. SW press). */
    reSolveOp(): void {
        this.inTransientStep = false;
        this.runOpAnalysis();
        this.syncGroundAlias();
    }
    /**
     * Instantaneous VAC/SIGGEN voltage at simTime.
     * DC OP must use offset only (SPICE-like): square at t=0 is +amp, which with
     * capacitors open turns a lossy integrator into a saturated inverting amp
     * (lab_integrator: Vout→−rail, Cf seeded wrong → no triangle on CH2).
     */
    private instantaneousSourceVoltage(vs: VoltageSourceEntry): number {
        if (vs.freq <= 0) {
            return vs.voltage;
        }
        // Bias / .OP: hold AC sources at their DC offset
        if (!this.inTransientStep) {
            return vs.voltage;
        }
        const omega = 2 * Math.PI * vs.freq;
        const period = 1.0 / vs.freq;
        const phase = ((this.simTime % period) + period) % period / period;
        switch (vs.waveform) {
            case 'sin':
                return vs.voltage + vs.amplitude * Math.sin(omega * this.simTime + vs.phase);
            case 'square': {
                const sqPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
                return vs.voltage + (sqPhase < (vs.dutyCycle || 0.5) ? vs.amplitude : -vs.amplitude);
            }
            case 'triangle': {
                const triPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
                return vs.voltage + vs.amplitude * (4 * Math.abs(triPhase - 0.5) - 1);
            }
            case 'sawtooth': {
                const sawPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
                return vs.voltage + vs.amplitude * (2 * sawPhase - 1);
            }
            case 'pulse': {
                const pPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
                return vs.voltage + (pPhase < (vs.dutyCycle || 0.5) ? vs.amplitude : 0);
            }
            default:
                return vs.voltage;
        }
    }
    /** Force VSRC/VAC nodes to their analytic values at simTime (MNA may leave them stale). */
    private enforceVoltageSources(): void {
        for (let i = 0; i < this.voltageSources.length; i++) {
            const vs = this.voltageSources[i];
            // Ideal ammeter (0V between two signal nodes): keep MNA solution; do not rewrite rails
            if (vs.voltage === 0 && vs.freq === 0 && vs.waveform === 'dc' &&
                vs.nodeA !== '0' && vs.nodeA !== 'GND' &&
                vs.nodeB !== '0' && vs.nodeB !== 'GND') {
                continue;
            }
            const vVal = this.instantaneousSourceVoltage(vs);
            const vB = this.nodeVoltages.get(vs.nodeB) ?? 0;
            if (vs.nodeB === '0' || vs.nodeB === 'GND') {
                this.nodeVoltages.set(vs.nodeA, vVal);
            }
            else {
                this.nodeVoltages.set(vs.nodeA, vVal + vB);
            }
        }
    }
    /** After DC OP: capacitors keep Vop with i=0; inductors keep i with v≈0. */
    private seedReactiveFromOp(): void {
        for (const cap of this.capacitors) {
            const vA = this.nodeVoltages.get(cap.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(cap.nodeB) ?? 0;
            const v = vA - vB;
            cap.voltage = v;
            cap.prevVoltage = v;
            cap.current = 0;
            cap.geq = 0;
            cap.ieq = 0;
        }
        for (const ind of this.inductors) {
            const vA = this.nodeVoltages.get(ind.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(ind.nodeB) ?? 0;
            ind.prevVoltage = vA - vB;
            ind.current = 0;
            ind.prevCurrent = 0;
            ind.geq = 0;
            ind.ieqStamp = 0;
        }
    }
    private prepareReactiveCompanions(dt: number): void {
        const h = Math.max(dt, 1e-15);
        for (const cap of this.capacitors) {
            if (cap.capacitance <= 0) {
                cap.geq = 0;
                cap.ieq = 0;
                continue;
            }
            // Trapezoidal: geq = 2C/h, J = geq*v_prev + i_prev, stamp ieq = -J
            let geq = 2 * cap.capacitance / h;
            if (geq > 1e8) {
                geq = 1e8;
            }
            cap.geq = geq;
            const J = geq * cap.voltage + cap.current;
            cap.ieq = -J;
        }
        for (const ind of this.inductors) {
            if (ind.inductance <= 0) {
                ind.geq = 0;
                ind.ieqStamp = 0;
                continue;
            }
            // i_n = geq*v_n + I_hist, I_hist = i_prev + geq*v_prev
            let geq = h / (2 * ind.inductance);
            if (geq > 1e8) {
                geq = 1e8;
            }
            ind.geq = geq;
            ind.ieqStamp = ind.current + geq * ind.prevVoltage;
        }
    }
    private commitReactiveCompanions(): void {
        for (const cap of this.capacitors) {
            const vA = this.nodeVoltages.get(cap.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(cap.nodeB) ?? 0;
            const vNow = vA - vB;
            // i_n = geq*v_n - J = geq*v_n + ieq
            const iNow = cap.geq * vNow + cap.ieq;
            cap.prevVoltage = cap.voltage;
            cap.voltage = vNow;
            cap.current = iNow;
            this.branchCurrents.set(`I(${cap.id})`, iNow);
        }
        for (const ind of this.inductors) {
            const vA = this.nodeVoltages.get(ind.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(ind.nodeB) ?? 0;
            const vNow = vA - vB;
            const iNow = ind.ieqStamp + ind.geq * vNow;
            ind.prevCurrent = ind.current;
            ind.current = iNow;
            ind.prevVoltage = vNow;
            this.branchCurrents.set(`I(${ind.id})`, iNow);
        }
    }
    private syncGroundAlias(): void {
        const g = this.nodeVoltages.get('0') ?? 0;
        this.nodeVoltages.set('0', g);
        this.nodeVoltages.set('GND', g);
    }
    private buildMnaSystem(freq: number, isAc: boolean): void {
        const vSrcCount = this.voltageSources.length;
        const totalSize = this.nodeIndex.size + vSrcCount;
        this.mnaG = new Array(totalSize * totalSize).fill(0);
        this.mnaRhs = new Array(totalSize).fill(0);
        const n = this.nodeIndex.size;
        const omega = 2 * Math.PI * freq;
        const useComplex = isAc && freq > 0;
        // Ground node constraint (re-asserted after all stamps — see end of method)
        const gndIdx = this.nodeIndex.get('0') ?? 0;
        // Resistors: g = 1/R (skip open-circuit contacts / switches ≥1e11Ω —
        // Gmin already keeps floating nets nonsingular; stamping 1T creates a
        // fake LED path that parks REL_NO near ~4V and confuses VF diagnostics)
        for (const r of this.resistors) {
            if (r.resistance >= 1e11) {
                continue;
            }
            const ni = this.nodeIndex.get(r.nodeA);
            const nj = this.nodeIndex.get(r.nodeB);
            if (ni === undefined || nj === undefined)
                continue;
            const g = 1.0 / Math.max(r.resistance, 1e-12);
            this.stampConductance(ni, nj, g, totalSize);
        }
        // Gmin to ground — keeps nearly-floating nets nonsingular during OP
        this.nodeIndex.forEach((idx, node) => {
            if (node !== '0' && node !== 'GND' && idx !== gndIdx) {
                this.mnaG[idx * totalSize + idx] += 1e-9;
            }
        });
        // Capacitors: open at DC OP; trapezoidal companion in transient; jωC in AC
        for (const cap of this.capacitors) {
            const ni = this.nodeIndex.get(cap.nodeA);
            const nj = this.nodeIndex.get(cap.nodeB);
            if (ni === undefined || nj === undefined)
                continue;
            if (useComplex) {
                const g = omega * cap.capacitance;
                this.stampConductance(ni, nj, g, totalSize);
            }
            else if (this.inTransientStep && cap.geq > 0) {
                this.stampConductance(ni, nj, cap.geq, totalSize);
                this.mnaRhs[ni] -= cap.ieq;
                this.mnaRhs[nj] += cap.ieq;
            }
        }
        // Inductors: short at DC OP; trapezoidal companion in transient
        for (const ind of this.inductors) {
            const ni = this.nodeIndex.get(ind.nodeA);
            const nj = this.nodeIndex.get(ind.nodeB);
            if (ni === undefined || nj === undefined)
                continue;
            if (useComplex) {
                const g = ind.inductance > 0 ? 1.0 / Math.max(omega * ind.inductance, 1e-18) : 1e12;
                this.stampConductance(ni, nj, g, totalSize);
            }
            else if (this.inTransientStep && ind.inductance > 0) {
                this.stampConductance(ni, nj, ind.geq, totalSize);
                this.mnaRhs[ni] -= ind.ieqStamp;
                this.mnaRhs[nj] += ind.ieqStamp;
            }
            else if (!this.inTransientStep && ind.inductance > 0) {
                // DC OP: inductor ≈ short
                this.stampConductance(ni, nj, 1e6, totalSize);
            }
        }
        // Voltage sources (stamp as extra rows/cols)
        for (let vsIdx = 0; vsIdx < vSrcCount; vsIdx++) {
            const vs = this.voltageSources[vsIdx];
            const ni = this.nodeIndex.get(vs.nodeA);
            const nj = this.nodeIndex.get(vs.nodeB);
            if (ni === undefined || nj === undefined)
                continue;
            const row = n + vsIdx;
            // AC small-signal: stamp DC offset as bias; transient uses instantaneous value
            const vVal = isAc ? vs.voltage : this.instantaneousSourceVoltage(vs);
            this.mnaG[ni * totalSize + row] = 1;
            this.mnaG[nj * totalSize + row] = -1;
            this.mnaG[row * totalSize + ni] = 1;
            this.mnaG[row * totalSize + nj] = -1;
            this.mnaRhs[row] = vVal;
        }
        // Nonlinear devices: diodes, BJTs, opamps
        for (const d of this.diodes) {
            const ni = this.nodeIndex.get(d.nodeA);
            const nj = this.nodeIndex.get(d.nodeB);
            if (ni === undefined || nj === undefined || useComplex)
                continue;
            this.stampDiode(ni, nj, d, totalSize);
        }
        for (const bjt of this.bjts) {
            const nc = this.nodeIndex.get(bjt.nodeC);
            const nb = this.nodeIndex.get(bjt.nodeB);
            const ne = this.nodeIndex.get(bjt.nodeE);
            if (nc === undefined || nb === undefined || ne === undefined || useComplex)
                continue;
            this.stampBjt(nc, nb, ne, bjt, totalSize);
        }
        for (const mos of this.mosfets) {
            const nd = this.nodeIndex.get(mos.nodeD);
            const ng = this.nodeIndex.get(mos.nodeG);
            const ns = this.nodeIndex.get(mos.nodeS);
            if (nd === undefined || ng === undefined || ns === undefined || useComplex)
                continue;
            this.stampMosfet(nd, ng, ns, mos, totalSize);
        }
        for (const opa of this.opamps) {
            const no = this.nodeIndex.get(opa.nodeOut);
            const np = this.nodeIndex.get(opa.nodeInP);
            const nn = this.nodeIndex.get(opa.nodeInN);
            if (no === undefined || np === undefined || nn === undefined || useComplex)
                continue;
            this.stampOpAmp(no, np, nn, opa, totalSize);
        }
        // Re-assert ground after all stamps (device stamps otherwise pollute row 0)
        for (let j = 0; j < totalSize; j++) {
            this.mnaG[gndIdx * totalSize + j] = 0;
        }
        this.mnaG[gndIdx * totalSize + gndIdx] = 1;
        this.mnaRhs[gndIdx] = 0;
    }
    private stampConductance(ni: number, nj: number, g: number, size: number): void {
        this.mnaG[ni * size + ni] += g;
        this.mnaG[nj * size + nj] += g;
        this.mnaG[ni * size + nj] -= g;
        this.mnaG[nj * size + ni] -= g;
    }
    private stampDiode(ni: number, nj: number, d: DiodeModel, size: number): void {
        const vdRaw = (this.nodeVoltages.get(d.nodeA) ?? 0) - (this.nodeVoltages.get(d.nodeB) ?? 0);
        const vThermal = d.n * d.vt;
        // Cap forward eval: without this Newton first step lands at Vd≈VCC and stalls in EXP_CLAMP
        const vdMax = d.n * (d.is < 1e-16 ? 1.4 : 0.85);
        const vd = Math.max(-5, Math.min(vdRaw, vdMax));
        let id: number;
        let gd: number;
        if (vd > -10 * vThermal) {
            const expArg = Math.min(vd / vThermal, 40);
            id = d.is * (Math.exp(expArg) - 1);
            gd = d.is * Math.exp(expArg) / vThermal;
        }
        else {
            id = -d.is;
            gd = 1e-12;
        }
        if (d.rs > 0 && gd > 0) {
            const denom = 1 + gd * d.rs;
            gd = gd / denom;
            id = id / denom;
        }
        gd = Math.max(gd, 1e-12);
        this.stampConductance(ni, nj, gd, size);
        // Norton companion: I = gd*Vd + Ieq, Ieq = id - gd*Vd (not raw id)
        const ieq = id - gd * vd;
        this.mnaRhs[ni] -= ieq;
        this.mnaRhs[nj] += ieq;
    }
    private stampBjt(nc: number, nb: number, ne: number, bjt: BjtModel, size: number): void {
        const vb = this.nodeVoltages.get(bjt.nodeB) ?? 0;
        const ve = this.nodeVoltages.get(bjt.nodeE) ?? 0;
        const vc = this.nodeVoltages.get(bjt.nodeC) ?? 0;
        const vt = bjt.nf * 0.02585;
        const alpha = bjt.bf / (bjt.bf + 1);
        const pnp = bjt.type === 'pnp';
        let vbe = pnp ? (ve - vb) : (vb - ve);
        let vbc = pnp ? (vc - vb) : (vb - vc);
        vbe = Math.max(-5, Math.min(vbe, 0.85));
        vbc = Math.max(-5, Math.min(vbc, 0.85));
        let gbe: number;
        let ibe: number;
        if (vbe > -10 * vt) {
            const expArg = Math.min(vbe / vt, 40);
            ibe = (bjt.is / bjt.bf) * (Math.exp(expArg) - 1);
            gbe = (bjt.is / bjt.bf) * Math.exp(expArg) / vt;
        }
        else {
            ibe = -bjt.is / bjt.bf;
            gbe = 1e-12;
        }
        let gbc: number;
        let ibc: number;
        if (vbc > -10 * vt) {
            const expArg = Math.min(vbc / vt, 40);
            ibc = bjt.is * (Math.exp(expArg) - 1);
            gbc = bjt.is * Math.exp(expArg) / vt;
        }
        else {
            ibc = -bjt.is;
            gbc = 1e-12;
        }
        gbe = Math.max(gbe, 1e-12);
        gbc = Math.max(gbc, 1e-12);
        const expBe = Math.exp(Math.min(Math.max(vbe / vt, -40), 40));
        const It = alpha * bjt.is * (expBe - 1);
        const gm = Math.max(alpha * bjt.is * expBe / vt, 0);
        const ieqbe = ibe - gbe * vbe;
        const ieqbc = ibc - gbc * vbc;
        const ieqt = It - gm * vbe;
        if (!pnp) {
            this.stampConductance(nb, ne, gbe, size);
            this.stampConductance(nb, nc, gbc, size);
            this.mnaRhs[nb] -= ieqbe + ieqbc;
            this.mnaRhs[ne] += ieqbe;
            this.mnaRhs[nc] += ieqbc;
            this.mnaG[nc * size + nb] += gm;
            this.mnaG[nc * size + ne] -= gm;
            this.mnaG[ne * size + nb] -= gm;
            this.mnaG[ne * size + ne] += gm;
            this.mnaRhs[nc] -= ieqt;
            this.mnaRhs[ne] += ieqt;
        }
        else {
            this.stampConductance(ne, nb, gbe, size);
            this.stampConductance(nc, nb, gbc, size);
            this.mnaRhs[ne] -= ieqbe;
            this.mnaRhs[nb] += ieqbe;
            this.mnaRhs[nc] -= ieqbc;
            this.mnaRhs[nb] += ieqbc;
            this.mnaG[ne * size + ne] += gm;
            this.mnaG[ne * size + nb] -= gm;
            this.mnaG[nc * size + ne] -= gm;
            this.mnaG[nc * size + nb] += gm;
            this.mnaRhs[ne] -= ieqt;
            this.mnaRhs[nc] += ieqt;
        }
    }
    /**
     * Level-1-ish MOSFET for lamp/load switching (lab_discrete).
     * Linearized IDS companion: gds between D-S + gm from G.
     */
    private stampMosfet(nd: number, ng: number, ns: number, mos: MosfetModel, size: number): void {
        const vd = this.nodeVoltages.get(mos.nodeD) ?? 0;
        const vg = this.nodeVoltages.get(mos.nodeG) ?? 0;
        const vs = this.nodeVoltages.get(mos.nodeS) ?? 0;
        const pmos = mos.type === 'pmos';
        // Device-oriented voltages (positive Vgs/Vds when enhanced for each type)
        let vgs = pmos ? (vs - vg) : (vg - vs);
        let vds = pmos ? (vs - vd) : (vd - vs);
        vds = Math.max(vds, 0);
        const vt = Math.abs(mos.vto);
        const k = Math.max(mos.kp * (mos.w / Math.max(mos.l, 1e-6)), 1e-4);
        let id = 0;
        let gm = 0;
        let gds = 1e-9;
        if (vgs > vt) {
            const von = vgs - vt;
            if (vds < von) {
                // Triode
                id = k * (von * vds - 0.5 * vds * vds) * (1 + mos.lambda * vds);
                gm = k * vds;
                gds = k * (von - vds) + k * mos.lambda * (von * vds - 0.5 * vds * vds);
            }
            else {
                // Saturation
                id = 0.5 * k * von * von * (1 + mos.lambda * vds);
                gm = k * von;
                gds = 0.5 * k * von * von * mos.lambda;
            }
            gds = Math.max(gds, 1e-6);
        }
        else {
            // Cutoff — tiny leakage so Newton stays nonsingular
            id = 0;
            gm = 0;
            gds = 1e-9;
        }
        // Companion: i = id0 + gm*vgs + gds*vds
        this.stampConductance(nd, ns, gds, size);
        const id0 = id - gm * vgs - gds * vds;
        if (pmos) {
            this.mnaG[nd * size + ng] -= gm;
            this.mnaG[nd * size + ns] += gm;
            this.mnaG[ns * size + ng] += gm;
            this.mnaG[ns * size + ns] -= gm;
            this.mnaRhs[nd] += id0;
            this.mnaRhs[ns] -= id0;
        }
        else {
            // gm polarity: +gm on D←G (prior sign was inverted → drain runaway)
            this.mnaG[nd * size + ng] += gm;
            this.mnaG[nd * size + ns] -= gm;
            this.mnaG[ns * size + ng] -= gm;
            this.mnaG[ns * size + ns] += gm;
            this.mnaRhs[nd] -= id0;
            this.mnaRhs[ns] += id0;
        }
    }
    private isMosfetLib(libId: string): boolean {
        return libId.includes('MOS') || libId.includes('2N7000') || libId.includes('IRF') ||
            libId.includes('BSS') || libId.includes('AO340');
    }
    private isBjtLib(libId: string): boolean {
        if (this.isMosfetLib(libId)) {
            return false;
        }
        return libId.includes('2N') || libId.includes('BC') || libId.includes('NPN') ||
            libId.includes('PNP') || libId.includes('TRANSISTOR');
    }
    private isPnpLib(libId: string): boolean {
        return libId.includes('PNP') || libId.includes('2N2907') || libId.includes('2N3906') ||
            libId.includes('BC557') || libId.includes('BC558');
    }
    /**
     * Positive-feedback (Schmitt) paths OUT↔IN+ without OUT↔IN- make the linear VCVS
     * admit an unstable mid-point (Vout≈Vin/β). Detect that topology and use a
     * latched rail comparator instead; keep linear+soft-rail for negative-FB amps.
     */
    private classifyOpAmpFeedbackModes(): void {
        for (let i = 0; i < this.opamps.length; i++) {
            const opa = this.opamps[i];
            const negFb = this.nodesResistivelyCoupled(opa.nodeOut, opa.nodeInN);
            const posFb = this.nodesResistivelyCoupled(opa.nodeOut, opa.nodeInP);
            opa.comparatorMode = posFb && !negFb;
            if (opa.comparatorMode && !this.quietLoad) {
                Logger.info(INSTR_TRACE_TAG, `[MNA] ${opa.id} comparatorMode (pos-FB Schmitt) OUT=${opa.nodeOut} IN+=${opa.nodeInP}`);
            }
        }
    }
    /** True if two nodes are the same or linked by resistors (R < 1e11Ω). */
    private nodesResistivelyCoupled(a: string, b: string): boolean {
        if (a.length === 0 || b.length === 0) {
            return false;
        }
        if (a === b) {
            return true;
        }
        const adj = new Map<string, string[]>();
        for (let i = 0; i < this.resistors.length; i++) {
            const r = this.resistors[i];
            if (r.resistance >= 1e11) {
                continue;
            }
            let la = adj.get(r.nodeA);
            if (!la) {
                la = [];
                adj.set(r.nodeA, la);
            }
            la.push(r.nodeB);
            let lb = adj.get(r.nodeB);
            if (!lb) {
                lb = [];
                adj.set(r.nodeB, lb);
            }
            lb.push(r.nodeA);
        }
        const seen = new Set<string>();
        const queue: string[] = [a];
        seen.add(a);
        while (queue.length > 0) {
            const cur = queue.shift() as string;
            if (cur === b) {
                return true;
            }
            const nbrs = adj.get(cur);
            if (!nbrs) {
                continue;
            }
            for (let j = 0; j < nbrs.length; j++) {
                const n = nbrs[j];
                if (!seen.has(n)) {
                    seen.add(n);
                    queue.push(n);
                }
            }
        }
        return false;
    }
    private stampOpAmp(no: number, np: number, nn: number, opa: OpAmpModel, size: number): void {
        const gOut = 1e-2;
        const vcc = this.nodeVoltages.get(opa.nodeVcc) ?? this.nodeVoltages.get('VCC') ?? 5;
        const vee = this.nodeVoltages.get(opa.nodeVee) ?? this.nodeVoltages.get('0') ?? 0;
        const vSatLo = vee + 0.1;
        const vSatHi = Math.max(vSatLo + 0.2, vcc - 1.5);
        const vp = this.nodeVoltages.get(opa.nodeInP) ?? 0;
        const vn = this.nodeVoltages.get(opa.nodeInN) ?? 0;
        const vDiff = vp - vn;
        // Schmitt / pos-FB: latch to rails (breaks unstable Vout≈Vin/β saddle).
        if (opa.comparatorMode) {
            const eps = 1e-4;
            if (vDiff > eps) {
                opa.compHigh = true;
            }
            else if (vDiff < -eps) {
                opa.compHigh = false;
            }
            const vTarget = opa.compHigh ? vSatHi : vSatLo;
            this.mnaG[no * size + no] += gOut;
            this.mnaRhs[no] += gOut * vTarget;
            return;
        }
        // Linear VCVS: gOut*(A*(vp−vn) − vout) = 0 ⇒ vout ≈ A*(vp−vn).
        // Soft rails act on the OUTPUT node (not A*vDiff): early Newton has huge open-loop
        // A*vDiff before feedback settles; clamping on that killed the Jacobian (lab_analog_ic).
        const A = opa.gain;
        this.mnaG[no * size + no] += gOut;
        this.mnaG[no * size + np] -= gOut * A;
        this.mnaG[no * size + nn] += gOut * A;
        const vOut = this.nodeVoltages.get(opa.nodeOut) ?? 0;
        if (vOut < vSatLo) {
            const over = Math.min(vSatLo - vOut, 3);
            const gd = 0.5 + 20 * over;
            this.mnaG[no * size + no] += gd;
            this.mnaRhs[no] += gd * vSatLo;
        }
        else if (vOut > vSatHi) {
            const over = Math.min(vOut - vSatHi, 3);
            const gd = 0.5 + 20 * over;
            this.mnaG[no * size + no] += gd;
            this.mnaRhs[no] += gd * vSatHi;
        }
    }
    // ---- LU decomposition solver with partial pivoting ----
    private solveLinearSystem(n: number): boolean {
        if (n <= 0)
            return false;
        const a = this.mnaG.slice();
        const b = this.mnaRhs.slice();
        // LU decomposition in-place with partial pivoting
        for (let k = 0; k < n; k++) {
            // Find pivot
            let maxVal = Math.abs(a[k * n + k]);
            let maxRow = k;
            for (let i = k + 1; i < n; i++) {
                const val = Math.abs(a[i * n + k]);
                if (val > maxVal) {
                    maxVal = val;
                    maxRow = i;
                }
            }
            if (maxVal < 1e-12) {
                // Singular row — ground it
                a[k * n + k] = 1;
                b[k] = 0;
                continue;
            }
            // Swap rows
            if (maxRow !== k) {
                for (let j = 0; j < n; j++) {
                    const tmp = a[k * n + j];
                    a[k * n + j] = a[maxRow * n + j];
                    a[maxRow * n + j] = tmp;
                }
                const tmpB = b[k];
                b[k] = b[maxRow];
                b[maxRow] = tmpB;
            }
            // Eliminate below
            const pivot = a[k * n + k];
            for (let i = k + 1; i < n; i++) {
                const factor = a[i * n + k] / pivot;
                if (Math.abs(factor) < 1e-15)
                    continue;
                a[i * n + k] = factor; // Store L factor
                for (let j = k + 1; j < n; j++) {
                    a[i * n + j] -= factor * a[k * n + j];
                }
                b[i] -= factor * b[k];
            }
        }
        // Back substitution
        for (let k = n - 1; k >= 0; k--) {
            if (Math.abs(a[k * n + k]) < 1e-12) {
                b[k] = 0;
                continue;
            }
            for (let i = k + 1; i < n; i++) {
                b[k] -= a[k * n + i] * b[i];
            }
            b[k] /= a[k * n + k];
        }
        this.mnaRhs = b;
        return true;
    }
    private newtonMaxDelta(n: number): number {
        let maxDelta = 0;
        this.nodeIndex.forEach((idx, node) => {
            if (idx < n && idx < this.mnaRhs.length) {
                const oldV = this.nodeVoltages.get(node) ?? 0;
                const delta = Math.abs(this.mnaRhs[idx] - oldV);
                if (delta > maxDelta)
                    maxDelta = delta;
            }
        });
        return maxDelta;
    }
    private checkNewtonConvergence(n: number): boolean {
        return this.newtonMaxDelta(n) < 1e-5;
    }
    private updateNodeVoltages(n: number, damp: number = 1.0, stepLim: number = 0): void {
        const alpha = Math.max(0.05, Math.min(1.0, damp));
        this.nodeIndex.forEach((idx, node) => {
            if (idx < n && idx < this.mnaRhs.length) {
                const oldV = this.nodeVoltages.get(node) ?? 0;
                let delta = this.mnaRhs[idx] - oldV;
                if (stepLim > 0) {
                    if (delta > stepLim)
                        delta = stepLim;
                    if (delta < -stepLim)
                        delta = -stepLim;
                }
                let next = oldV + alpha * delta;
                if (next > 15)
                    next = 15;
                if (next < -15)
                    next = -15;
                this.nodeVoltages.set(node, next);
            }
        });
        this.syncGroundAlias();
        const nodeCount = this.nodeIndex.size;
        const vSrcCount = this.voltageSources.length;
        for (let i = 0; i < vSrcCount; i++) {
            const row = nodeCount + i;
            if (row < this.mnaRhs.length) {
                this.branchCurrents.set(`I(${this.voltageSources[i].id})`, this.mnaRhs[row]);
            }
        }
    }
    private computeBranchCurrents(): void {
        for (const r of this.resistors) {
            if (r.resistance >= 1e11) {
                this.branchCurrents.set(`I(${r.id})`, 0);
                continue;
            }
            const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
            this.branchCurrents.set(`I(${r.id})`, (vA - vB) / Math.max(r.resistance, 1e-12));
        }
        for (const cap of this.capacitors) {
            // Prefer committed companion current (stable); fallback to backward difference
            const committed = cap.current;
            if (this.inTransientStep || Math.abs(committed) > 0 || Math.abs(cap.voltage) > 0) {
                this.branchCurrents.set(`I(${cap.id})`, committed);
            }
            else {
                const vA = this.nodeVoltages.get(cap.nodeA) ?? 0;
                const vB = this.nodeVoltages.get(cap.nodeB) ?? 0;
                const ic = cap.capacitance * ((vA - vB) - cap.prevVoltage) / Math.max(this.lastStepSize, 1e-15);
                this.branchCurrents.set(`I(${cap.id})`, ic);
            }
        }
        for (const ind of this.inductors) {
            this.branchCurrents.set(`I(${ind.id})`, ind.current);
        }
        for (const d of this.diodes) {
            const vd = (this.nodeVoltages.get(d.nodeA) ?? 0) - (this.nodeVoltages.get(d.nodeB) ?? 0);
            const vThermal = d.n * d.vt;
            let id = 0;
            if (vd > -10 * vThermal) {
                const expArg = Math.min(vd / vThermal, 40);
                id = d.is * (Math.exp(expArg) - 1);
            }
            else {
                id = -d.is;
            }
            this.branchCurrents.set(`I(${d.id})`, id);
        }
        // Also compute net-specific currents for instrument support
        this.netUuidToNode.forEach((nodeName: string, netUuid: string) => {
            if (nodeName !== '0' && nodeName !== 'VCC') {
                let netCurrent = 0;
                for (const r of this.resistors) {
                    if (r.nodeA === nodeName) {
                        const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
                        const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
                        netCurrent += (vA - vB) / Math.max(r.resistance, 1e-12);
                    }
                    else if (r.nodeB === nodeName) {
                        const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
                        const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
                        netCurrent -= (vA - vB) / Math.max(r.resistance, 1e-12);
                    }
                }
                this.branchCurrents.set(`NET(${netUuid})`, netCurrent);
            }
        });
    }
    /** Get branch current for a component instance UUID */
    getCurrentForComponent(compUuid: string): number {
        const devIds = this.compUuidToDevId.get(compUuid);
        if (devIds && devIds.length > 0) {
            return this.branchCurrents.get(`I(${devIds[0]})`) ?? 0;
        }
        return 0;
    }
    /** Register or update a signal generator as a voltage source in the circuit */
    registerSignalSource(sourceId: string, nodeA: string, nodeB: string, waveform: string, voltage: number, amplitude: number, freq: number, phase: number, dutyCycle: number): void {
        // Find existing source with this ID or add new one
        let existing = false;
        for (let i = 0; i < this.voltageSources.length; i++) {
            if (this.voltageSources[i].id === sourceId) {
                this.voltageSources[i] = {
                    id: sourceId, nodeA, nodeB,
                    voltage, waveform, freq, amplitude, phase, dutyCycle,
                    riseTime: 0, fallTime: 0
                };
                existing = true;
                break;
            }
        }
        if (!existing) {
            this.voltageSources.push({
                id: sourceId, nodeA, nodeB,
                voltage, waveform, freq, amplitude, phase, dutyCycle,
                riseTime: 0, fallTime: 0
            });
        }
        // Expand node index if needed
        if (!this.nodeIndex.has(nodeA)) {
            this.nodeIndex.set(nodeA, this.nodeIndex.size);
        }
        if (!this.nodeIndex.has(nodeB)) {
            this.nodeIndex.set(nodeB, this.nodeIndex.size);
        }
    }
    /** Remove a previously registered signal / GPIO Thevenin source (high-Z). */
    removeSignalSource(sourceId: string): void {
        for (let i = 0; i < this.voltageSources.length; i++) {
            if (this.voltageSources[i].id === sourceId) {
                this.voltageSources.splice(i, 1);
                return;
            }
        }
    }
    /**
     * After each SPICE step: refresh relay NO/NC contact resistances from coil voltage.
     * Also updates behavioral 555 OUT/DISCH from TRIG/THRES/RESET.
     * Returns true if any contact/FF state flipped.
     * Call needsDcResolveAfterSwitch() before reSolveOp — 555-only flips must not DC-OP
     * (opens C and destroys timing-cap state).
     */
    updateRelayContactsFromCoil(): boolean {
        this.lastRelayFlipped = false;
        let timer555Flipped = false;
        for (let i = 0; i < this.relayContacts.length; i++) {
            const rc = this.relayContacts[i];
            const vA = this.getVoltage(rc.coilNodeA);
            const vB = this.getVoltage(rc.coilNodeB);
            const vCoil = Math.abs(vA - vB);
            const thresh = Math.max(0.8, rc.coilRatedV * 0.35);
            const on = vCoil >= thresh;
            if (on === rc.energized) {
                continue;
            }
            rc.energized = on;
            this.lastRelayFlipped = true;
            this.setResistorOhms(rc.noDevId, on ? RELAY_CONTACT_CLOSED_OHMS : RELAY_CONTACT_OPEN_OHMS);
            this.setResistorOhms(rc.ncDevId, on ? RELAY_CONTACT_OPEN_OHMS : RELAY_CONTACT_CLOSED_OHMS);
            Logger.info(INSTR_TRACE_TAG, `[RELAY] ${rc.compId} coil=${vCoil.toFixed(2)}V → ${on ? 'ENERGIZED' : 'RELEASED'} ` +
                `(NO=${on ? 'ON' : 'OFF'} NC=${on ? 'OFF' : 'ON'})`);
        }
        if (this.updateTimer555State()) {
            timer555Flipped = true;
        }
        return this.lastRelayFlipped || timer555Flipped;
    }
    /** Readable relay coil/contact snapshot lines for instr_trace [REL]. */
    getRelayTraceLines(): string[] {
        const lines: string[] = [];
        for (let i = 0; i < this.relayContacts.length; i++) {
            const rc = this.relayContacts[i];
            const vA = this.getVoltage(rc.coilNodeA);
            const vB = this.getVoltage(rc.coilNodeB);
            const vCoil = Math.abs(vA - vB);
            const thresh = Math.max(0.8, rc.coilRatedV * 0.35);
            const noOhms = this.getResistorOhms(rc.noDevId);
            const ncOhms = this.getResistorOhms(rc.ncDevId);
            const noClosed = noOhms < 1;
            const ncClosed = ncOhms < 1;
            lines.push(`${rc.compId} coil=${vCoil.toFixed(2)}V thresh=${thresh.toFixed(2)}V ` +
                `${rc.energized ? 'ENERGIZED' : 'RELEASED'} ` +
                `NO=${noClosed ? 'CLOSED' : 'OPEN'}(${noOhms}Ω) ` +
                `NC=${ncClosed ? 'CLOSED' : 'OPEN'}(${ncOhms}Ω) ` +
                `COM_nodes coilA=${rc.coilNodeA} coilB=${rc.coilNodeB}`);
        }
        return lines;
    }
    private getResistorOhms(devId: string): number {
        for (let i = 0; i < this.resistors.length; i++) {
            if (this.resistors[i].id === devId) {
                return this.resistors[i].resistance;
            }
        }
        return -1;
    }
    private setResistorOhms(devId: string, ohms: number): void {
        for (let i = 0; i < this.resistors.length; i++) {
            if (this.resistors[i].id === devId) {
                this.resistors[i].resistance = ohms;
                return;
            }
        }
    }
    private setVoltageSourceVolts(devId: string, volts: number): void {
        for (let i = 0; i < this.voltageSources.length; i++) {
            if (this.voltageSources[i].id === devId) {
                this.voltageSources[i].voltage = volts;
                return;
            }
        }
    }
    private static isTimer555Lib(libId: string): boolean {
        return libId === 'LM555' || libId === 'NE555' || libId === 'SE555' ||
            libId === 'SA555' || libId === 'ICM7555' || libId === 'TLC555' ||
            libId.includes('TIMER555') || (libId.endsWith('555') && libId.length <= 8);
    }
    private stampTimer555(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, rIdx: number): number {
        const nVcc = this.resolveCompNode(comp, 'VCC', pinNets, netNodeMap);
        const nGnd = this.resolveCompNode(comp, 'GND', pinNets, netNodeMap);
        const nOut = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
        const nDisch = this.resolveCompNode(comp, 'DISCH', pinNets, netNodeMap);
        const nTrig = this.resolveCompNode(comp, 'TRIG', pinNets, netNodeMap);
        const nThres = this.resolveCompNode(comp, 'THRES', pinNets, netNodeMap);
        const nCtrl = this.resolveCompNode(comp, 'CTRL', pinNets, netNodeMap);
        const nReset = this.resolveCompNode(comp, 'RESET', pinNets, netNodeMap);
        if (this.isFloatingNode(nVcc) || this.isFloatingNode(nGnd) || this.isFloatingNode(nOut)) {
            Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: 555 VCC/GND/OUT not wired`);
            return rIdx;
        }
        const gndNode = nGnd === 'GND' ? '0' : nGnd;
        const outVsId = `V${this.voltageSources.length}`;
        this.voltageSources.push({
            id: outVsId, nodeA: nOut, nodeB: gndNode,
            voltage: TIMER555_OUT_LOW, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
            dutyCycle: 0.5, riseTime: 0, fallTime: 0
        });
        const dischRId = `R${rIdx++}`;
        // Initial Q low → discharge ON (classic power-on for astable)
        const dischWired = !this.isFloatingNode(nDisch);
        if (dischWired) {
            this.resistors.push({
                id: dischRId, nodeA: nDisch, nodeB: gndNode, resistance: TIMER555_DISCH_ON_OHMS
            });
        }
        const ctrlFloating = this.isFloatingNode(nCtrl);
        const resetFloating = this.isFloatingNode(nReset);
        this.timer555s.push({
            compId: comp.id,
            refDes: comp.refDes,
            nodeVcc: nVcc,
            nodeGnd: gndNode,
            nodeTrig: nTrig,
            nodeThres: nThres,
            nodeCtrl: nCtrl,
            nodeReset: nReset,
            nodeOut: nOut,
            outVsId: outVsId,
            dischRId: dischWired ? dischRId : '',
            ctrlFloating: ctrlFloating,
            resetFloating: resetFloating,
            qHigh: false
        });
        const ids: string[] = [outVsId];
        if (dischWired) {
            ids.push(dischRId);
        }
        this.compUuidToDevId.set(comp.id, ids);
        Logger.info(INSTR_TRACE_TAG, `[MNA] ${comp.refDes} TIMER555 OUT=${nOut} DISCH=${nDisch} TRIG=${nTrig} THRES=${nThres} ` +
            `VCC=${nVcc} GND=${gndNode}`);
        for (const m of pinNets) {
            const node = netNodeMap.get(m.netId);
            if (node)
                this.netUuidToNode.set(m.netId, node);
        }
        return rIdx;
    }
    /** Classic 555 SR latch: RESET low forces Q=0; THRES≥⅔ resets; TRIG≤⅓ sets. */
    private updateTimer555State(): boolean {
        let flipped = false;
        for (let i = 0; i < this.timer555s.length; i++) {
            const t = this.timer555s[i];
            const vGnd = this.getVoltage(t.nodeGnd);
            const vcc = this.getVoltage(t.nodeVcc) - vGnd;
            const vTrig = this.getVoltage(t.nodeTrig) - vGnd;
            const vThres = this.getVoltage(t.nodeThres) - vGnd;
            let vCtrl = t.ctrlFloating ? (vcc * 2 / 3) : (this.getVoltage(t.nodeCtrl) - vGnd);
            if (vCtrl < 0.5) {
                vCtrl = vcc * 2 / 3;
            }
            const thrHigh = vCtrl;
            const thrLow = vCtrl / 2;
            let next = t.qHigh;
            if (!t.resetFloating && (this.getVoltage(t.nodeReset) - vGnd) < 0.7) {
                next = false;
            }
            else if (!this.isFloatingNode(t.nodeThres) && vThres >= thrHigh - 0.01) {
                next = false;
            }
            else if (!this.isFloatingNode(t.nodeTrig) && vTrig <= thrLow + 0.01) {
                next = true;
            }
            const outTarget = next
                ? Math.max(TIMER555_OUT_LOW, vcc - TIMER555_OUT_HIGH_DROP)
                : TIMER555_OUT_LOW;
            this.setVoltageSourceVolts(t.outVsId, outTarget);
            if (t.dischRId.length > 0) {
                this.setResistorOhms(t.dischRId, next ? TIMER555_DISCH_OFF_OHMS : TIMER555_DISCH_ON_OHMS);
            }
            if (next !== t.qHigh) {
                t.qHigh = next;
                flipped = true;
                Logger.info(INSTR_TRACE_TAG, `[555] ${t.refDes} Q→${next ? 'HIGH' : 'LOW'} ` +
                    `trig=${vTrig.toFixed(2)} thres=${vThres.toFixed(2)} ctrl=${vCtrl.toFixed(2)} ` +
                    `out=${outTarget.toFixed(2)}V`);
            }
        }
        return flipped;
    }
    private stampRelay(comp: ComponentInstance, pinNets: PinNetMapping[], netNodeMap: Map<string, string>, rIdx: number): number {
        const nCoilA = this.resolveCompNode(comp, '1', pinNets, netNodeMap);
        const nCoilAAlt = this.isFloatingNode(nCoilA)
            ? this.resolveCompNode(comp, 'COIL+', pinNets, netNodeMap) : nCoilA;
        const nCoilB = this.resolveCompNode(comp, '2', pinNets, netNodeMap);
        const nCoilBAlt = this.isFloatingNode(nCoilB)
            ? this.resolveCompNode(comp, 'COIL-', pinNets, netNodeMap) : nCoilB;
        if (!this.areTerminalsConnected(nCoilAAlt, nCoilBAlt)) {
            Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: relay coil pin(s) not wired`);
            return rIdx;
        }
        const rated = parseVoltageVolts(paramMapGet(comp.parameters, 'coilVoltage', '5V'), 5);
        const coilDev = `R${rIdx++}`;
        this.resistors.push({
            id: coilDev, nodeA: nCoilAAlt, nodeB: nCoilBAlt, resistance: RELAY_COIL_OHMS
        });
        const devIds: string[] = [coilDev];
        traceAnalogDeviceStamp(comp.refDes, coilDev, comp.libraryId, nCoilAAlt, nCoilBAlt, `COIL ${RELAY_COIL_OHMS}Ω rated=${rated}V pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
        const nCom = this.resolveCompNode(comp, 'COM', pinNets, netNodeMap);
        const nNo = this.resolveCompNode(comp, 'NO', pinNets, netNodeMap);
        const nNc = this.resolveCompNode(comp, 'NC', pinNets, netNodeMap);
        // Need COM + both contact legs wired; avoid self-loop R(COM↔COM)
        if (!this.isFloatingNode(nCom) && !this.isFloatingNode(nNo) && !this.isFloatingNode(nNc)) {
            const noDev = `R${rIdx++}`;
            const ncDev = `R${rIdx++}`;
            // Default de-energized: NC closed, NO open
            this.resistors.push({
                id: noDev, nodeA: nCom, nodeB: nNo, resistance: RELAY_CONTACT_OPEN_OHMS
            });
            this.resistors.push({
                id: ncDev, nodeA: nCom, nodeB: nNc, resistance: RELAY_CONTACT_CLOSED_OHMS
            });
            devIds.push(noDev);
            devIds.push(ncDev);
            this.relayContacts.push({
                compId: comp.id,
                coilNodeA: nCoilAAlt,
                coilNodeB: nCoilBAlt,
                coilRatedV: rated,
                noDevId: noDev,
                ncDevId: ncDev,
                energized: false
            });
            Logger.info(INSTR_TRACE_TAG, `[MNA] ${comp.refDes} RELAY contacts COM=${nCom} NO=${nNo} NC=${nNc}`);
        }
        this.compUuidToDevId.set(comp.id, devIds);
        for (const m of pinNets) {
            const node = netNodeMap.get(m.netId);
            if (node)
                this.netUuidToNode.set(m.netId, node);
        }
        return rIdx;
    }
    private static isTruthyParam(v: string): boolean {
        const s = v.trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'yes' || s === 'on' || s === 'pressed';
    }
    /** Parse wiper position: "0.5", "50%", "50" → clamp to (0,1). */
    private static parseWiperFraction(raw: string): number {
        let s = raw.trim().replace(/\s+/g, '');
        if (s.length === 0) {
            return 0.5;
        }
        let pct = false;
        if (s.endsWith('%')) {
            pct = true;
            s = s.substring(0, s.length - 1);
        }
        let n = parseFloat(s);
        if (isNaN(n)) {
            return 0.5;
        }
        if (pct || n > 1) {
            n = n / 100;
        }
        if (n < 0.001) {
            return 0.001;
        }
        if (n > 0.999) {
            return 0.999;
        }
        return n;
    }
    /** Parse DS18B20 temp_c (°C), clamp to datasheet range −55…125. */
    static parseTempCelsius(raw: string): number {
        let s = raw.trim().replace(/\s+/g, '');
        if (s.endsWith('°C') || s.endsWith('℃')) {
            s = s.substring(0, s.length - 2);
        }
        else if (s.length > 1 && (s.endsWith('C') || s.endsWith('c'))) {
            const before = s.charAt(s.length - 2);
            if (before === '-' || before === '.' || (before >= '0' && before <= '9')) {
                s = s.substring(0, s.length - 1);
            }
        }
        let n = parseFloat(s);
        if (isNaN(n)) {
            return 25;
        }
        if (n < -55) {
            return -55;
        }
        if (n > 125) {
            return 125;
        }
        return n;
    }
    /** Teaching map: −55°C→0V, 125°C→5V (linear). */
    static tempCToTeachVolts(tempC: number): number {
        return ((tempC + 55) / 180) * 5;
    }
    /** Get all node voltages for display/export */
    getNodeVoltageMap(): Map<string, number> {
        return copyNodeMap(this.nodeVoltages);
    }
    /** Get all branch currents for display/export */
    getBranchCurrentMap(): Map<string, number> {
        return new Map(this.branchCurrents);
    }
    /** Get net current (sum of branch currents at a net) */
    getNetCurrentForUuid(netUuid: string): number {
        return this.branchCurrents.get(`NET(${netUuid})`) ?? 0;
    }
    // ---- Parse utilities ----
    /**
     * If value is a bare number (no unit suffix) but fallback has one,
     * append the suffix so "4.7"+"4.7K"→"4.7K".  If value is empty,
     * return the fallback as-is.
     */
    private withUnitSuffix(value: string, fallback: string): string {
        const v = value.trim();
        if (v.length === 0)
            return fallback;
        if (/[a-z]/i.test(v))
            return v; // already has a unit
        const m = fallback.match(/[a-zµ]+$/i); // extract suffix from fallback
        if (m === null)
            return v;
        return v + m[0];
    }
    private static formatPinNetDetail(pinNets: PinNetMapping[], netNodeMap: Map<string, string>): string {
        const parts: string[] = [];
        for (let i = 0; i < pinNets.length; i++) {
            const m = pinNets[i];
            const label = m.pinName.length > 0 ? m.pinName : m.pinId;
            const node = netNodeMap.get(m.netId) ?? '?';
            parts.push(`${label}@${node}`);
        }
        return parts.length > 0 ? parts.join(',') : '(none)';
    }
    private parseResistance(val: string): number {
        const normalized = AnalogEngine.normalizeResistanceInput(val);
        const parsed = UnitParser.parseResistance(normalized);
        if (parsed.valid && parsed.numeric > 0) {
            return parsed.numeric;
        }
        const s = normalized.toLowerCase().replace(/[ωohm]/g, '').trim();
        if (s.includes('meg')) {
            return parseFloat(s) * 1e6;
        }
        if (s.includes('k')) {
            const n = parseFloat(s);
            return isNaN(n) ? 1000 : n * 1000;
        }
        if (s.includes('m') && !s.includes('meg')) {
            return parseFloat(s) * 0.001;
        }
        const n = parseFloat(s);
        return isNaN(n) || n <= 0 ? 1000 : n;
    }
    /**
     * Fix malformed values like "47000ΩK" (already ohms + stray K from lib id).
     * Values >= 1000 with a trailing K are treated as plain ohms.
     */
    private static normalizeResistanceInput(val: string): string {
        let s = val.trim().replace(/\s+/g, '');
        // "47ΩK" / "47000ΩK" — strip Ω before K/M/G suffix
        s = s.replace(/(?:Ω|ohm|R)(?=[KMG])/i, '');
        const redundantK = s.match(/^([\d.]+)(?:Ω|ohm|R)?K$/i);
        if (redundantK !== null) {
            const n = parseFloat(redundantK[1]);
            if (!isNaN(n) && n >= 1000) {
                return `${n}Ω`;
            }
        }
        return s;
    }
    private parseCapacitance(val: string): number {
        const s = val.toLowerCase().replace('f', '').trim();
        if (s.includes('u') || s.includes('µ'))
            return parseFloat(s) * 1e-6;
        if (s.includes('n'))
            return parseFloat(s) * 1e-9;
        if (s.includes('p'))
            return parseFloat(s) * 1e-12;
        if (s.includes('m'))
            return parseFloat(s) * 1e-3;
        const n = parseFloat(s);
        return isNaN(n) || n <= 0 ? 100e-9 : n;
    }
    private parseInductance(val: string): number {
        const s = val.toLowerCase().replace('h', '').trim();
        if (s.includes('u') || s.includes('µ'))
            return parseFloat(s) * 1e-6;
        if (s.includes('n'))
            return parseFloat(s) * 1e-9;
        if (s.includes('p'))
            return parseFloat(s) * 1e-12;
        if (s.includes('m'))
            return parseFloat(s) * 1e-3;
        const n = parseFloat(s);
        return isNaN(n) || n <= 0 ? 0.001 : n;
    }
    private toSpiceValue(val: string): string {
        if (val.length === 0)
            return '1k';
        const s = val.replace('µ', 'u');
        if (s.includes('Meg'))
            return s;
        if (s.includes('k') || s.includes('K'))
            return s.toUpperCase().replace('K', 'k');
        if (s.includes('M') && !s.includes('Meg') && !s.includes('m'))
            return s.replace('M', 'Meg');
        if (/^\d+(\.\d+)?$/.test(s))
            return s;
        return s;
    }
}
function copyNodeMap(source: Map<string, number>): Map<string, number> {
    const copy = new Map<string, number>();
    source.forEach((v, k) => copy.set(k, v));
    return copy;
}
