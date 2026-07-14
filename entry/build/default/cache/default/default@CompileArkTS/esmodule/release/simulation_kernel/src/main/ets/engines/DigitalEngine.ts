import { LogicState, MinHeap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface HcTimingEntry {
    tPLH: number;
    tPHL: number;
    cin: number;
}
const HC_TIMING: Record<string, HcTimingEntry> = {
    '00': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '02': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '04': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '08': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '32': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '86': { tPLH: 10e-9, tPHL: 10e-9, cin: 3.5e-12 },
    '74': { tPLH: 14e-9, tPHL: 14e-9, cin: 3.5e-12 },
    '138': { tPLH: 11e-9, tPHL: 11e-9, cin: 3.5e-12 },
    '245': { tPLH: 8e-9, tPHL: 8e-9, cin: 5e-12 },
    '595': { tPLH: 14e-9, tPHL: 14e-9, cin: 3.5e-12 },
    'default': { tPLH: 9e-9, tPHL: 9e-9, cin: 3.5e-12 }
};
const FANOUT_LOAD_FACTOR = 50e-12;
const MIN_PULSE_WIDTH = 2e-9;
const SETUP_TIME_DFF = 5e-9;
const HOLD_TIME_DFF = 1e-9;
const MAX_HAZARD_HISTORY = 100;
interface DigitalNode {
    id: string;
    state: LogicState;
    drivers: string[];
    propagationDelay: number;
    lastChangeTime: number;
    lastChangeState: LogicState;
}
interface DigitalEvent {
    time: number;
    nodeId: string;
    newState: LogicState;
}
interface LogicGate {
    compId: string;
    gateType: string;
    inputIds: string[];
    outputId: string;
    tPLH: number;
    tPHL: number;
    inputCap: number;
    triState: boolean;
    enableId: string;
}
interface Shift595State {
    shiftReg: number;
    latch: number;
    lastShcp: LogicState;
    lastStcp: LogicState;
    lastDsSetupTime: number;
    lastShcpEdgeTime: number;
    qNetIds: string[];
}
interface DffState {
    lastClk: LogicState;
    lastDSetupTime: number;
    lastClkEdgeTime: number;
}
export interface HazardReport {
    path: string;
    type: 'glitch' | 'contention' | 'setup_violation' | 'hold_violation';
    sourceNodeId: string;
    affectedNodeId: string;
    toggleCount: number;
}
export class DigitalEngine {
    private nodes: Map<string, DigitalNode> = new Map();
    private gates: LogicGate[] = [];
    private eventHeap: MinHeap<DigitalEvent> = new MinHeap<DigitalEvent>((b469: DigitalEvent, c469: DigitalEvent) => b469.time - c469.time);
    private currentTime: number = 0;
    private hazardPaths: HazardReport[] = [];
    private shift595States: Map<string, Shift595State> = new Map();
    private dffStates: Map<string, DffState> = new Map();
    private toggleCounts: Map<string, number> = new Map();
    private doc: SchematicDocument | null = null;
    loadSchematic(y468: SchematicDocument): void {
        this.doc = y468;
        this.nodes.clear();
        this.gates = [];
        this.eventHeap.clear();
        this.hazardPaths = [];
        this.shift595States.clear();
        this.dffStates.clear();
        this.toggleCounts.clear();
        for (const a469 of y468.nets) {
            this.nodes.set(a469.id, {
                id: a469.id,
                state: LogicState.UNKNOWN,
                drivers: [],
                propagationDelay: 10e-9,
                lastChangeTime: 0,
                lastChangeState: LogicState.UNKNOWN
            });
        }
        for (const z468 of y468.components) {
            if (z468.libraryId.includes('74HC') || z468.libraryId.includes('74LS') ||
                z468.libraryId.includes('74HCT') || z468.libraryId.includes('CD40')) {
                this.initLogicGateFromNets(z468.id, z468.libraryId);
            }
        }
        this.buildFanoutWeights();
    }
    private getPinNetMap(r468: string): Map<string, string> {
        const s468 = new Map<string, string>();
        if (!this.doc)
            return s468;
        for (const t468 of this.doc.nets) {
            for (const u468 of t468.pinIds) {
                const v468 = u468.split(':');
                if (v468.length >= 3 && v468[0] === r468) {
                    const x468 = v468[2];
                    s468.set(x468, t468.id);
                }
                else if (v468.length >= 2 && v468[0] === r468) {
                    const w468 = v468[1];
                    s468.set(w468, t468.id);
                }
            }
        }
        return s468;
    }
    private initLogicGateFromNets(j467: string, k467: string): void {
        const l467 = this.getPinNetMap(j467);
        const m467 = this.resolveTiming(k467);
        if (k467.includes('04')) {
            const p468 = l467.get('1A');
            const q468 = l467.get('1Y');
            if (p468 && q468) {
                this.registerGate(j467, 'NOT', [p468], q468, m467.tPLH, m467.tPHL, m467.cin, false, '');
                this.ensureNode(p468, LogicState.UNKNOWN, m467.tPLH);
                this.ensureNode(q468, LogicState.UNKNOWN, m467.tPLH);
            }
        }
        else if (k467.includes('08') || k467.includes('00') ||
            k467.includes('32') || k467.includes('02') ||
            k467.includes('86')) {
            let l468 = 'AND';
            if (k467.includes('00'))
                l468 = 'NAND';
            else if (k467.includes('02'))
                l468 = 'NOR';
            else if (k467.includes('32'))
                l468 = 'OR';
            else if (k467.includes('86'))
                l468 = 'XOR';
            const m468 = l467.get('1A');
            const n468 = l467.get('1B');
            const o468 = l467.get('1Y');
            if (m468 && n468 && o468) {
                this.registerGate(j467, l468, [m468, n468], o468, m467.tPLH, m467.tPHL, m467.cin, false, '');
                this.ensureNode(m468, LogicState.UNKNOWN, m467.tPLH);
                this.ensureNode(n468, LogicState.UNKNOWN, m467.tPLH);
                this.ensureNode(o468, LogicState.UNKNOWN, m467.tPLH);
            }
        }
        else if (k467.includes('74') && !k467.includes('74595')) {
            const i468 = l467.get('1D') ?? l467.get('D');
            const j468 = l467.get('1CLK') ?? l467.get('CLK');
            const k468 = l467.get('1Q') ?? l467.get('Q');
            if (i468 && j468 && k468) {
                this.registerGate(j467, 'DFF', [i468, j468], k468, m467.tPLH, m467.tPHL, m467.cin, false, '');
                this.ensureNode(i468, LogicState.LOW, m467.tPLH);
                this.ensureNode(j468, LogicState.LOW, m467.tPLH);
                this.ensureNode(k468, LogicState.LOW, m467.tPLH);
                this.dffStates.set(j467, { lastClk: LogicState.LOW, lastDSetupTime: 0, lastClkEdgeTime: 0 });
            }
        }
        else if (k467.includes('125')) {
            const f468 = l467.get('1A') ?? l467.get('A');
            const g468 = l467.get('1Y') ?? l467.get('Y');
            const h468 = l467.get('1OE') ?? l467.get('OE');
            if (f468 && g468) {
                this.registerGate(j467, 'BUF', [f468], g468, m467.tPLH, m467.tPHL, m467.cin, true, h468 ?? '');
                this.ensureNode(f468, LogicState.UNKNOWN, m467.tPLH);
                this.ensureNode(g468, LogicState.HIGH_Z, m467.tPLH);
                if (h468)
                    this.ensureNode(h468, LogicState.HIGH, m467.tPLH);
            }
        }
        else if (k467.includes('245')) {
            const b468 = l467.get('A0') ?? l467.get('A');
            const c468 = l467.get('B0') ?? l467.get('B');
            const d468 = l467.get('DIR');
            const e468 = l467.get('OE');
            if (b468 && c468) {
                this.registerGate(j467, 'BUF', [b468], c468, m467.tPLH, m467.tPHL, m467.cin, true, e468 ?? '');
                this.ensureNode(b468, LogicState.UNKNOWN, m467.tPLH);
                this.ensureNode(c468, LogicState.UNKNOWN, m467.tPLH);
                if (e468)
                    this.ensureNode(e468, LogicState.HIGH, m467.tPLH);
            }
        }
        else if (k467.includes('595')) {
            const v467 = l467.get('DS') ?? l467.get('SER');
            const w467 = l467.get('SHCP') ?? l467.get('SRCLK');
            const x467 = l467.get('STCP') ?? l467.get('RCLK');
            const y467: string[] = [];
            for (let z467 = 0; z467 < 8; z467++) {
                const a468 = l467.get(`Q${z467}`) ?? `${j467}_Q${z467}`;
                y467.push(a468);
                this.ensureNode(a468, LogicState.LOW, m467.tPLH);
            }
            if (v467 && w467 && x467) {
                this.shift595States.set(j467, {
                    shiftReg: 0, latch: 0, lastShcp: LogicState.LOW, lastStcp: LogicState.LOW,
                    lastDsSetupTime: 0, lastShcpEdgeTime: 0,
                    qNetIds: y467
                });
                this.registerGate(j467, 'SHIFT595', [v467, w467, x467], y467[0], m467.tPLH, m467.tPHL, m467.cin, false, '');
                this.ensureNode(v467, LogicState.LOW, m467.tPLH);
                this.ensureNode(w467, LogicState.LOW, m467.tPLH);
                this.ensureNode(x467, LogicState.LOW, m467.tPLH);
            }
        }
        else if (k467.includes('138')) {
            const p467 = l467.get('A0');
            const q467 = l467.get('A1');
            const r467 = l467.get('A2');
            const s467 = l467.get('E1') ?? l467.get('E');
            if (p467 && q467 && r467) {
                this.registerGate(j467, 'DEC138', [p467, q467, r467, s467 ?? ''], l467.get('Y0') ?? `${j467}_Y0`, m467.tPLH, m467.tPHL, m467.cin, false, '');
                this.ensureNode(p467, LogicState.LOW, m467.tPLH);
                this.ensureNode(q467, LogicState.LOW, m467.tPLH);
                this.ensureNode(r467, LogicState.LOW, m467.tPLH);
                if (s467)
                    this.ensureNode(s467, LogicState.LOW, m467.tPLH);
                for (let t467 = 0; t467 < 8; t467++) {
                    const u467 = l467.get(`Y${t467}`) ?? `${j467}_Y${t467}`;
                    this.ensureNode(u467, LogicState.HIGH, m467.tPLH);
                }
            }
        }
        else {
            const n467 = l467.get('1A') ?? l467.get('A') ?? l467.get('IN');
            const o467 = l467.get('1Y') ?? l467.get('Y') ?? l467.get('OUT');
            if (n467 && o467) {
                this.registerGate(j467, 'BUF', [n467], o467, m467.tPLH, m467.tPHL, m467.cin, false, '');
                this.ensureNode(n467, LogicState.UNKNOWN, m467.tPLH);
                this.ensureNode(o467, LogicState.UNKNOWN, m467.tPLH);
            }
        }
    }
    private ensureNode(g467: string, h467: LogicState, i467: number): void {
        if (!this.nodes.has(g467)) {
            this.nodes.set(g467, {
                id: g467,
                state: h467,
                drivers: [],
                propagationDelay: i467,
                lastChangeTime: 0,
                lastChangeState: h467
            });
        }
    }
    private buildFanoutWeights(): void {
        const z466: Map<string, number> = new Map();
        for (const e467 of this.gates) {
            for (const f467 of e467.inputIds) {
                z466.set(f467, (z466.get(f467) ?? 0) + 1);
            }
            if (e467.enableId.length > 0) {
                z466.set(e467.enableId, (z466.get(e467.enableId) ?? 0) + 1);
            }
        }
        for (const a467 of this.gates) {
            const b467 = z466.get(a467.outputId) ?? 0;
            const c467 = b467 * FANOUT_LOAD_FACTOR * 1e9;
            const d467 = c467 * 1e-9;
            a467.tPLH += d467;
            a467.tPHL += d467;
        }
    }
    scheduleEvent(w466: number, x466: string, y466: LogicState): void {
        this.eventHeap.push({ time: w466, nodeId: x466, newState: y466 });
    }
    processEvents(n466: number): Map<string, LogicState> {
        while (!this.eventHeap.isEmpty) {
            const r466 = this.eventHeap.peek();
            if (r466 === null || r466.time > n466) {
                break;
            }
            const s466 = this.eventHeap.pop()!;
            this.currentTime = s466.time;
            const t466 = this.nodes.get(s466.nodeId);
            if (t466) {
                const v466 = s466.time - t466.lastChangeTime;
                if (t466.lastChangeState !== LogicState.UNKNOWN &&
                    t466.lastChangeState !== s466.newState &&
                    v466 > 0 && v466 < MIN_PULSE_WIDTH) {
                    continue;
                }
                t466.lastChangeTime = s466.time;
                t466.lastChangeState = s466.newState;
            }
            if (t466 && t466.state !== s466.newState) {
                t466.state = s466.newState;
                const u466 = (this.toggleCounts.get(s466.nodeId) ?? 0) + 1;
                this.toggleCounts.set(s466.nodeId, u466);
                if (u466 > 2 && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                    this.hazardPaths.push({
                        path: `Glitch: ${s466.nodeId} toggled ${u466}x in ${(s466.time * 1e9).toFixed(1)}ns window`,
                        type: 'glitch',
                        sourceNodeId: s466.nodeId,
                        affectedNodeId: s466.nodeId,
                        toggleCount: u466
                    });
                }
                this.propagate(s466.nodeId, s466.newState);
            }
        }
        const o466 = new Map<string, LogicState>();
        this.nodes.forEach((p466: DigitalNode, q466: string) => o466.set(q466, p466.state));
        return o466;
    }
    getState(m466: string): LogicState {
        return this.nodes.get(m466)?.state ?? LogicState.UNKNOWN;
    }
    setInput(k466: string, l466: LogicState): void {
        this.scheduleEvent(this.currentTime, k466, l466);
    }
    detectHazards(): HazardReport[] {
        this.nodes.forEach((f466: DigitalNode) => {
            if (f466.drivers.length > 1) {
                const g466 = f466.drivers.filter((i466: string) => {
                    const j466 = this.nodes.get(i466)?.state;
                    return j466 === LogicState.HIGH || j466 === LogicState.LOW;
                });
                if (g466.length > 1 && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                    const h466 = `${g466.join(' → ')} → ${f466.id}`;
                    this.hazardPaths.push({
                        path: `Contention: ${h466}`,
                        type: 'contention',
                        sourceNodeId: g466[0],
                        affectedNodeId: f466.id,
                        toggleCount: g466.length
                    });
                }
            }
        });
        return this.hazardPaths.slice();
    }
    getHazardPaths(): HazardReport[] {
        return this.hazardPaths.slice();
    }
    private resolveTiming(d466: string): HcTimingEntry {
        for (const e466 of Object.keys(HC_TIMING)) {
            if (e466 !== 'default' && d466.includes(e466)) {
                return HC_TIMING[e466];
            }
        }
        return HC_TIMING['default'];
    }
    private initLogicGate(k465: string, l465: string): void {
        const m465 = this.resolveTiming(l465);
        const n465 = m465.tPLH;
        const o465 = m465.tPHL;
        const p465 = m465.cin;
        if (l465.includes('04')) {
            for (let c466 = 0; c466 < 6; c466++) {
                this.registerGate(k465, 'NOT', [`${k465}_IN${c466}`], `${k465}_OUT${c466}`, n465, o465, p465, false, '');
            }
        }
        else if (l465.includes('08')) {
            for (let b466 = 0; b466 < 4; b466++) {
                this.registerGate(k465, 'AND', [`${k465}_A${b466}`, `${k465}_B${b466}`], `${k465}_OUT${b466}`, n465, o465, p465, false, '');
            }
        }
        else if (l465.includes('32')) {
            for (let a466 = 0; a466 < 4; a466++) {
                this.registerGate(k465, 'OR', [`${k465}_A${a466}`, `${k465}_B${a466}`], `${k465}_OUT${a466}`, n465, o465, p465, false, '');
            }
        }
        else if (l465.includes('00')) {
            for (let z465 = 0; z465 < 4; z465++) {
                this.registerGate(k465, 'NAND', [`${k465}_A${z465}`, `${k465}_B${z465}`], `${k465}_OUT${z465}`, n465, o465, p465, false, '');
            }
        }
        else if (l465.includes('02')) {
            for (let y465 = 0; y465 < 4; y465++) {
                this.registerGate(k465, 'NOR', [`${k465}_A${y465}`, `${k465}_B${y465}`], `${k465}_OUT${y465}`, n465, o465, p465, false, '');
            }
        }
        else if (l465.includes('86')) {
            for (let x465 = 0; x465 < 4; x465++) {
                this.registerGate(k465, 'XOR', [`${k465}_A${x465}`, `${k465}_B${x465}`], `${k465}_OUT${x465}`, n465, o465, p465, false, '');
            }
        }
        else if (l465.includes('74')) {
            for (let w465 = 0; w465 < 2; w465++) {
                this.registerGate(k465, 'DFF', [`${k465}_D${w465}`, `${k465}_CLK${w465}`], `${k465}_Q${w465}`, n465, o465, p465, false, '');
                this.dffStates.set(`${k465}_${w465}`, { lastClk: LogicState.LOW, lastDSetupTime: 0, lastClkEdgeTime: 0 });
            }
        }
        else if (l465.includes('125') || l465.includes('245')) {
            this.registerGate(k465, 'BUF', [`${k465}_IN`], `${k465}_OUT`, n465, o465, p465, true, `${k465}_OE`);
        }
        else if (l465.includes('595')) {
            this.shift595States.set(k465, {
                shiftReg: 0, latch: 0, lastShcp: LogicState.LOW, lastStcp: LogicState.LOW,
                lastDsSetupTime: 0, lastShcpEdgeTime: 0, qNetIds: []
            });
            this.registerGate(k465, 'SHIFT595', [`${k465}_DS`, `${k465}_SHCP`, `${k465}_STCP`], `${k465}_Q0`, n465, o465, p465, false, '');
            for (let u465 = 0; u465 < 8; u465++) {
                const v465 = `${k465}_Q${u465}`;
                if (!this.nodes.has(v465)) {
                    this.nodes.set(v465, { id: v465, state: LogicState.LOW, drivers: [k465], propagationDelay: n465, lastChangeTime: 0, lastChangeState: LogicState.LOW });
                }
            }
        }
        else if (l465.includes('138')) {
            this.registerGate(k465, 'DEC138', [`${k465}_A0`, `${k465}_A1`, `${k465}_A2`, `${k465}_E`], `${k465}_Y0`, n465, o465, p465, false, '');
            for (let s465 = 0; s465 < 8; s465++) {
                const t465 = `${k465}_Y${s465}`;
                if (!this.nodes.has(t465)) {
                    this.nodes.set(t465, { id: t465, state: LogicState.HIGH, drivers: [k465], propagationDelay: n465, lastChangeTime: 0, lastChangeState: LogicState.HIGH });
                }
            }
        }
        else {
            this.registerGate(k465, 'BUF', [`${k465}_IN`], `${k465}_OUT`, n465, o465, p465, false, '');
        }
        for (const q465 of this.gates) {
            if (q465.compId !== k465)
                continue;
            for (const r465 of q465.inputIds) {
                if (!this.nodes.has(r465)) {
                    this.nodes.set(r465, { id: r465, state: LogicState.UNKNOWN, drivers: [], propagationDelay: 0, lastChangeTime: 0, lastChangeState: LogicState.UNKNOWN });
                }
            }
            if (!this.nodes.has(q465.outputId)) {
                this.nodes.set(q465.outputId, { id: q465.outputId, state: LogicState.UNKNOWN, drivers: [q465.compId], propagationDelay: n465, lastChangeTime: 0, lastChangeState: LogicState.UNKNOWN });
            }
        }
    }
    private registerGate(b465: string, c465: string, d465: string[], e465: string, f465: number, g465: number, h465: number, i465: boolean, j465: string): void {
        this.gates.push({
            compId: b465, gateType: c465, inputIds: d465, outputId: e465,
            tPLH: f465, tPHL: g465, inputCap: h465, triState: i465, enableId: j465
        });
    }
    private propagate(z464: string, a465: LogicState): void {
        this.evaluateGates(z464);
    }
    private evaluateGates(t464: string): void {
        for (let u464 = 0; u464 < this.gates.length; u464++) {
            const v464 = this.gates[u464];
            if (!v464.inputIds.includes(t464) && v464.enableId !== t464) {
                continue;
            }
            const w464 = this.evalGateOutput(v464);
            const x464 = this.nodes.get(v464.outputId);
            if (x464 && x464.state !== w464) {
                const y464 = w464 === LogicState.HIGH ? v464.tPLH : v464.tPHL;
                this.scheduleEvent(this.currentTime + y464, v464.outputId, w464);
            }
        }
    }
    private evalGateOutput(d464: LogicGate): LogicState {
        if (d464.triState && d464.enableId.length > 0) {
            const s464 = this.getState(d464.enableId);
            if (s464 === LogicState.HIGH)
                return LogicState.HIGH_Z;
        }
        const e464 = d464.inputIds.map((r464: string) => this.getState(r464));
        if (e464.some((q464: LogicState) => q464 === LogicState.UNKNOWN))
            return LogicState.UNKNOWN;
        if (e464.some((p464: LogicState) => p464 === LogicState.HIGH_Z))
            return LogicState.HIGH_Z;
        const f464 = e464.map((o464: LogicState) => o464 === LogicState.HIGH);
        switch (d464.gateType) {
            case 'NOT': return f464[0] ? LogicState.LOW : LogicState.HIGH;
            case 'AND': return f464.every((n464: boolean) => n464) ? LogicState.HIGH : LogicState.LOW;
            case 'OR': return f464.some((m464: boolean) => m464) ? LogicState.HIGH : LogicState.LOW;
            case 'NAND': return f464.every((l464: boolean) => l464) ? LogicState.LOW : LogicState.HIGH;
            case 'NOR': return f464.some((k464: boolean) => k464) ? LogicState.LOW : LogicState.HIGH;
            case 'XOR': {
                let i464 = false;
                for (let j464 = 0; j464 < f464.length; j464++) {
                    i464 = i464 !== f464[j464];
                }
                return i464 ? LogicState.HIGH : LogicState.LOW;
            }
            case 'XNOR': {
                let g464 = false;
                for (let h464 = 0; h464 < f464.length; h464++) {
                    g464 = g464 !== f464[h464];
                }
                return g464 ? LogicState.LOW : LogicState.HIGH;
            }
            case 'BUF': return f464[0] ? LogicState.HIGH : LogicState.LOW;
            case 'DFF': return this.evalDff(d464);
            case 'SHIFT595': return this.evalShift595(d464);
            case 'DEC138': return this.evalDec138(d464);
            default: return LogicState.UNKNOWN;
        }
    }
    private evalDff(u463: LogicGate): LogicState {
        const v463 = u463.compId;
        let w463 = this.dffStates.get(v463);
        if (!w463) {
            w463 = { lastClk: LogicState.LOW, lastDSetupTime: 0, lastClkEdgeTime: 0 };
            this.dffStates.set(v463, w463);
        }
        const x463 = this.getState(u463.inputIds[1]);
        const y463 = this.getState(u463.inputIds[0]);
        if (w463.lastClk === LogicState.LOW && x463 === LogicState.HIGH) {
            w463.lastClkEdgeTime = this.currentTime;
            const b464 = this.currentTime - w463.lastDSetupTime;
            if (b464 > 0 && b464 < SETUP_TIME_DFF && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                const c464 = `${u463.compId} D→Q`;
                this.hazardPaths.push({
                    path: `Setup violation: ${c464} (Δt=${(b464 * 1e12).toFixed(1)}ps < ${SETUP_TIME_DFF * 1e12}ps)`,
                    type: 'setup_violation',
                    sourceNodeId: u463.inputIds[0],
                    affectedNodeId: u463.outputId,
                    toggleCount: 0
                });
            }
            return y463 === LogicState.HIGH ? LogicState.HIGH : LogicState.LOW;
        }
        if (w463.lastClkEdgeTime > 0) {
            const z463 = this.currentTime - w463.lastClkEdgeTime;
            if (z463 > 0 && z463 < HOLD_TIME_DFF && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                const a464 = `${u463.compId} D→Q`;
                this.hazardPaths.push({
                    path: `Hold violation: ${a464} (Δt=${(z463 * 1e12).toFixed(1)}ps < ${HOLD_TIME_DFF * 1e12}ps)`,
                    type: 'hold_violation',
                    sourceNodeId: u463.inputIds[0],
                    affectedNodeId: u463.outputId,
                    toggleCount: 0
                });
            }
        }
        w463.lastClk = x463;
        if (y463 === LogicState.HIGH || y463 === LogicState.LOW) {
            w463.lastDSetupTime = this.currentTime;
        }
        return this.getState(u463.outputId);
    }
    private evalShift595(i463: LogicGate): LogicState {
        const j463 = this.shift595States.get(i463.compId);
        if (!j463)
            return LogicState.UNKNOWN;
        const k463 = i463.inputIds[0];
        const l463 = i463.inputIds[1];
        const m463 = i463.inputIds[2];
        const n463 = this.getState(k463) === LogicState.HIGH;
        const o463 = this.getState(l463);
        const p463 = this.getState(m463);
        j463.lastDsSetupTime = this.currentTime;
        if (j463.lastShcp === LogicState.LOW && o463 === LogicState.HIGH) {
            j463.lastShcpEdgeTime = this.currentTime;
            const t463 = this.currentTime - j463.lastDsSetupTime;
            if (t463 > 0 && t463 < SETUP_TIME_DFF && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                this.hazardPaths.push({
                    path: `Setup violation: ${i463.compId} DS→SHCP (Δt=${(t463 * 1e12).toFixed(1)}ps)`,
                    type: 'setup_violation',
                    sourceNodeId: k463,
                    affectedNodeId: i463.outputId,
                    toggleCount: 0
                });
            }
            j463.shiftReg = ((j463.shiftReg << 1) | (n463 ? 1 : 0)) & 0xFF;
        }
        if (j463.lastStcp === LogicState.LOW && p463 === LogicState.HIGH) {
            j463.latch = j463.shiftReg;
            for (let q463 = 0; q463 < 8; q463++) {
                const r463 = (j463.latch >> q463) & 1;
                const s463 = j463.qNetIds[q463] ?? `${i463.compId}_Q${q463}`;
                this.scheduleEvent(this.currentTime + i463.tPLH, s463, r463 ? LogicState.HIGH : LogicState.LOW);
            }
        }
        j463.lastShcp = o463;
        j463.lastStcp = p463;
        return (j463.latch & 1) ? LogicState.HIGH : LogicState.LOW;
    }
    private evalDec138(w462: LogicGate): LogicState {
        const x462 = w462.inputIds.length >= 4 ? w462.inputIds[3] : '';
        const y462 = x462 ? this.getState(x462) : LogicState.LOW;
        if (y462 === LogicState.HIGH) {
            for (let g463 = 0; g463 < 8; g463++) {
                const h463 = w462.outputId.replace('Y0', `Y${g463}`);
                this.scheduleEvent(this.currentTime + w462.tPHL, h463, LogicState.HIGH);
            }
            return LogicState.HIGH;
        }
        const z462 = this.getState(w462.inputIds[0]) === LogicState.HIGH;
        const a463 = w462.inputIds.length >= 2 ? this.getState(w462.inputIds[1]) === LogicState.HIGH : false;
        const b463 = w462.inputIds.length >= 3 ? this.getState(w462.inputIds[2]) === LogicState.HIGH : false;
        const c463 = (b463 ? 4 : 0) + (a463 ? 2 : 0) + (z462 ? 1 : 0);
        for (let d463 = 0; d463 < 8; d463++) {
            const e463 = w462.outputId.replace('Y0', `Y${d463}`);
            const f463 = d463 === c463 ? LogicState.LOW : LogicState.HIGH;
            this.scheduleEvent(this.currentTime + (d463 === c463 ? w462.tPHL : w462.tPLH), e463, f463);
        }
        return c463 === 0 ? LogicState.LOW : LogicState.HIGH;
    }
    reset(): void {
        this.nodes.clear();
        this.gates = [];
        this.eventHeap.clear();
        this.currentTime = 0;
        this.hazardPaths = [];
        this.shift595States.clear();
        this.dffStates.clear();
        this.toggleCounts.clear();
    }
}
