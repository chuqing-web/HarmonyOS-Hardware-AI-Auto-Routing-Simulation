import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
import type { WaveData } from '../types/SimExtendedTypes';
import type { SchematicDocument, ComponentInstance, Net, Wire, ViewportState, SimulationState } from '../types/CommonTypes';
import type { ErcError } from '../types/TopologyTypes';
import { parsePinRef, getPinNetMap } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { isInstrumentLibraryId, detectInstrumentKind } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentKindUtil";
export const INSTR_TRACE_TAG = 'instr_trace';
export let INSTR_TRACE_SIM_STEP = false;
export function setInstrTraceSimStep(c39: boolean): void {
    INSTR_TRACE_SIM_STEP = c39;
}
export function formatPinNetMap(w38: Map<string, string>, x38: number = 12): string {
    const y38: string[] = [];
    let z38 = 0;
    w38.forEach((a39: string, b39: string) => {
        if (z38 >= x38) {
            return;
        }
        y38.push(`${b39}->${a39}`);
        z38++;
    });
    if (w38.size > x38) {
        y38.push(`...+${w38.size - x38}`);
    }
    return y38.length > 0 ? y38.join(', ') : '(empty)';
}
export interface BindingTraceInfo {
    libraryId: string;
    scopeProbes: string[];
    logicProbes: string[];
    hasVoltageReader: boolean;
    hasCurrentReader: boolean;
    hasPowerVoltageReader: boolean;
    hasPowerCurrentReader: boolean;
    hasFreqReader: boolean;
}
export function formatBindingSummary(r38: BindingTraceInfo): string {
    const s38: string[] = [];
    if (r38.hasVoltageReader)
        s38.push('V');
    if (r38.hasCurrentReader)
        s38.push('I');
    if (r38.hasPowerVoltageReader)
        s38.push('PV');
    if (r38.hasPowerCurrentReader)
        s38.push('PI');
    if (r38.hasFreqReader)
        s38.push('F');
    const t38 = r38.scopeProbes.filter(v38 => v38.length > 0).join('|');
    const u38 = r38.logicProbes.join('|');
    return `lib=${r38.libraryId} scope=[${t38}] logic=[${u38}] readers=[${s38.join(',')}]`;
}
export function formatWaveSummary(j38: WaveData[], k38: number = 6): string {
    const l38: string[] = [];
    const m38 = Math.min(j38.length, k38);
    for (let n38 = 0; n38 < m38; n38++) {
        const o38 = j38[n38];
        const p38 = o38.voltageAxis.length;
        const q38 = p38 > 0 ? o38.voltageAxis[p38 - 1].toFixed(4) : '0';
        l38.push(`${o38.probeName}/${o38.netName}:${p38}pt@${q38}V`);
    }
    if (j38.length > k38) {
        l38.push(`...+${j38.length - k38}`);
    }
    return l38.length > 0 ? l38.join('; ') : '(no waves)';
}
export function formatVoltageSample(d38: Map<string, number>, e38: number = 8): string {
    const f38: string[] = [];
    let g38 = 0;
    d38.forEach((h38: number, i38: string) => {
        if (g38 >= e38) {
            return;
        }
        if (Math.abs(h38) > 1e-12 || i38 === 'VCC' || i38 === 'GND' || i38 === '0') {
            f38.push(`${i38}=${h38.toFixed(4)}V`);
            g38++;
        }
    });
    return f38.length > 0 ? f38.join(', ') : '(all ~0)';
}
export function formatCurrentSample(x37: Map<string, number>, y37: number = 8): string {
    const z37: string[] = [];
    let a38 = 0;
    x37.forEach((b38: number, c38: string) => {
        if (a38 >= y37) {
            return;
        }
        if (Math.abs(b38) > 1e-15) {
            z37.push(`${c38}=${(b38 * 1000).toFixed(4)}mA`);
            a38++;
        }
    });
    return z37.length > 0 ? z37.join(', ') : '(all ~0)';
}
function refDesForComp(u37: ComponentInstance[], v37: string): string {
    for (let w37 = 0; w37 < u37.length; w37++) {
        if (u37[w37].id === v37) {
            return u37[w37].refDes;
        }
    }
    return v37.length > 10 ? v37.substring(0, 10) : v37;
}
function netDisplayName(t37: Net): string {
    return t37.name.length > 0 ? t37.name : t37.id;
}
export function traceDataFlow(r37: string, s37: string): void {
    Logger.info(INSTR_TRACE_TAG, `[FLOW] ${r37} | ${s37}`);
}
export function traceCanvasInfo(p37: SchematicDocument, q37: ViewportState): void {
    Logger.info(INSTR_TRACE_TAG, `[CANVAS] doc=${p37.name} grid=${q37.gridSize} zoom=${q37.zoom.toFixed(2)} ` +
        `pan=(${q37.panOffset.x.toFixed(0)},${q37.panOffset.y.toFixed(0)}) ` +
        `snap=${q37.snapToGrid} units=${p37.metadata.units} wires=${p37.wires.length} labels=${p37.netLabels.length}`);
}
export function traceComponentLayout(g37: ComponentInstance[], h37: number = 30): void {
    Logger.info(INSTR_TRACE_TAG, `[LAYOUT] total=${g37.length}`);
    const i37 = Math.min(g37.length, h37);
    for (let j37 = 0; j37 < i37; j37++) {
        const k37 = g37[j37];
        const l37: string[] = [];
        k37.parameters.forEach((n37: string, o37: string) => {
            if (l37.length < 3) {
                l37.push(o37);
            }
        });
        const m37 = l37.length > 0 ? ` params=[${l37.join(',')}...]` : '';
        Logger.info(INSTR_TRACE_TAG, `[LAYOUT] #${j37 + 1} ref=${k37.refDes} lib=${k37.libraryId} id=${k37.id} ` +
            `pos=(${k37.position.x.toFixed(0)},${k37.position.y.toFixed(0)}) rot=${k37.rotation} mir=${k37.mirrored}${m37}`);
    }
    if (g37.length > h37) {
        Logger.info(INSTR_TRACE_TAG, `[LAYOUT] ...+${g37.length - h37} more components`);
    }
}
export function traceWireTopology(y36: Wire[], z36: number = 15): void {
    Logger.info(INSTR_TRACE_TAG, `[WIRES] total=${y36.length}`);
    const a37 = Math.min(y36.length, z36);
    for (let b37 = 0; b37 < a37; b37++) {
        const c37 = y36[b37];
        const d37 = c37.points.length;
        const e37 = d37 > 0 ? `(${c37.points[0].x.toFixed(0)},${c37.points[0].y.toFixed(0)})` : '?';
        const f37 = d37 > 1 ? `(${c37.points[d37 - 1].x.toFixed(0)},${c37.points[d37 - 1].y.toFixed(0)})` : e37;
        Logger.info(INSTR_TRACE_TAG, `[WIRES] #${b37 + 1} id=${c37.id} net=${c37.netId} pts=${d37} ${e37}->${f37}`);
    }
    if (y36.length > z36) {
        Logger.info(INSTR_TRACE_TAG, `[WIRES] ...+${y36.length - z36} more wires`);
    }
}
export function traceNetPinDetail(j36: SchematicDocument, k36: number = 25): void {
    const l36 = j36.components;
    let m36 = 0;
    let n36 = 0;
    for (let x36 = 0; x36 < j36.nets.length; x36++) {
        if (j36.nets[x36].pinIds.length > 0) {
            m36++;
        }
        else {
            n36++;
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[NETS] total=${j36.nets.length} connected=${m36} empty=${n36}`);
    let o36 = 0;
    for (let p36 = 0; p36 < j36.nets.length && o36 < k36; p36++) {
        const q36 = j36.nets[p36];
        if (q36.pinIds.length === 0) {
            continue;
        }
        const r36: string[] = [];
        const s36 = Math.min(q36.pinIds.length, 10);
        for (let u36 = 0; u36 < s36; u36++) {
            const v36 = parsePinRef(q36.pinIds[u36]);
            if (v36 !== null) {
                const w36 = refDesForComp(l36, v36.compId);
                r36.push(`${w36}.${v36.pinName.length > 0 ? v36.pinName : v36.pinId}`);
            }
        }
        const t36 = q36.pinIds.length > s36 ? `...+${q36.pinIds.length - s36}` : '';
        Logger.info(INSTR_TRACE_TAG, `[NETS] net=${netDisplayName(q36)} id=${q36.id} type=${q36.type} pins=[${r36.join(', ')}${t36}]`);
        o36++;
    }
    if (m36 > k36) {
        Logger.info(INSTR_TRACE_TAG, `[NETS] ...+${m36 - k36} more connected nets`);
    }
}
export function traceUnconnectedComponents(f36: SchematicDocument): void {
    for (let g36 = 0; g36 < f36.components.length; g36++) {
        const h36 = f36.components[g36];
        const i36 = getPinNetMap(h36.id, f36.nets);
        if (i36.size === 0) {
            Logger.warn(INSTR_TRACE_TAG, `[CONNECT] UNCONNECTED ref=${h36.refDes} lib=${h36.libraryId} id=${h36.id} — no pin→net mapping`);
        }
    }
}
export function traceInstrumentInventory(z35: SchematicDocument): void {
    let a36 = 0;
    for (let b36 = 0; b36 < z35.components.length; b36++) {
        const c36 = z35.components[b36];
        if (!isInstrumentLibraryId(c36.libraryId)) {
            continue;
        }
        a36++;
        const d36 = detectInstrumentKind(c36.libraryId);
        const e36 = getPinNetMap(c36.id, z35.nets);
        Logger.info(INSTR_TRACE_TAG, `[INSTR] #${a36} ref=${c36.refDes} lib=${c36.libraryId} kind=${d36} ` +
            `pins={${formatPinNetMap(e36, 16)}}`);
    }
    if (a36 === 0) {
        Logger.info(INSTR_TRACE_TAG, '[INSTR] (no instrument components on schematic)');
    }
    else {
        Logger.info(INSTR_TRACE_TAG, `[INSTR] total=${a36} instrument components`);
    }
}
export function traceInstrumentWiringIssues(i35: SchematicDocument): void {
    for (let j35 = 0; j35 < i35.components.length; j35++) {
        const k35 = i35.components[j35];
        if (!isInstrumentLibraryId(k35.libraryId)) {
            continue;
        }
        const l35 = getPinNetMap(k35.id, i35.nets);
        const m35 = (w35: string): string => {
            const x35 = i35.nets.find(y35 => y35.id === w35);
            return x35 !== undefined && x35.name.length > 0 ? x35.name : w35.substring(0, 14);
        };
        const n35 = (t35: string[]): string | null => {
            for (let u35 = 0; u35 < t35.length; u35++) {
                const v35 = l35.get(t35[u35].toUpperCase());
                if (v35 !== undefined) {
                    return v35;
                }
            }
            return null;
        };
        const o35 = detectInstrumentKind(k35.libraryId);
        if (o35 === 'vm' || o35 === 'dmm') {
            const r35 = n35(['V+', 'V', 'PLUS', '+', 'A', 'PROBE1']);
            const s35 = n35(['COM', 'V-', '-', 'GND', 'B', 'PROBE2']);
            if (r35 !== null && s35 !== null && r35 === s35) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${k35.refDes} V+ and COM on same net ${m35(r35)} — reading will be 0V`);
            }
        }
        else if (o35 === 'am') {
            const p35 = n35(['I+', 'PLUS', '+', 'A']);
            const q35 = n35(['I-', 'MINUS', '-', 'B', 'COM']);
            if (p35 !== null && q35 !== null && p35 === q35) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${k35.refDes} I+ and I- on same net ${m35(p35)} — reading will be 0A`);
            }
        }
    }
}
export function tracePinMultiNetConflicts(q34: SchematicDocument): void {
    const r34 = new Map<string, string[]>();
    for (let c35 = 0; c35 < q34.nets.length; c35++) {
        const d35 = q34.nets[c35];
        for (let e35 = 0; e35 < d35.pinIds.length; e35++) {
            const f35 = parsePinRef(d35.pinIds[e35]);
            if (f35 === null) {
                continue;
            }
            const g35 = `${f35.compId}:${f35.pinName.length > 0 ? f35.pinName : f35.pinId}`;
            const h35 = r34.get(g35) ?? [];
            if (!h35.includes(d35.id)) {
                h35.push(d35.id);
                r34.set(g35, h35);
            }
        }
    }
    let s34 = 0;
    r34.forEach((t34: string[], u34: string) => {
        if (t34.length <= 1) {
            return;
        }
        s34++;
        const v34 = u34.split(':');
        const w34 = refDesForComp(q34.components, v34[0]);
        const x34 = v34.length > 1 ? v34[1] : '?';
        const y34 = t34.map(z34 => {
            const a35 = q34.nets.find(b35 => b35.id === z34);
            return a35 !== undefined ? netDisplayName(a35) : z34.substring(0, 12);
        });
        Logger.warn(INSTR_TRACE_TAG, `[PIN_CONFLICT] ${w34}.${x34} on ${t34.length} nets: [${y34.join(', ')}]`);
    });
    if (s34 === 0) {
        Logger.info(INSTR_TRACE_TAG, '[PIN_CONFLICT] (none detected)');
    }
    else {
        Logger.warn(INSTR_TRACE_TAG, `[PIN_CONFLICT] total=${s34} — same pin on multiple nets`);
    }
}
export function traceWireEndpointCollisions(v33: Wire[], w33: SchematicDocument): void {
    const x33 = new Map<string, Set<string>>();
    const y33 = new Map<string, string[]>();
    for (let i34 = 0; i34 < v33.length; i34++) {
        const j34 = v33[i34];
        if (j34.points.length < 2) {
            continue;
        }
        const k34 = [j34.points[0], j34.points[j34.points.length - 1]];
        for (let l34 = 0; l34 < k34.length; l34++) {
            const m34 = k34[l34];
            const n34 = `${Math.round(m34.x)},${Math.round(m34.y)}`;
            const o34 = x33.get(n34) ?? new Set<string>();
            o34.add(j34.netId);
            x33.set(n34, o34);
            const p34 = y33.get(n34) ?? [];
            p34.push(`${j34.id}@${l34 === 0 ? 'start' : 'end'}`);
            y33.set(n34, p34);
        }
    }
    let z33 = 0;
    x33.forEach((a34: Set<string>, b34: string) => {
        if (a34.size <= 1) {
            return;
        }
        z33++;
        const c34 = b34.split(',');
        const d34: string[] = [];
        a34.forEach((f34: string) => {
            const g34 = w33.nets.find(h34 => h34.id === f34);
            d34.push(g34 !== undefined ? netDisplayName(g34) : f34.substring(0, 12));
        });
        const e34 = y33.get(b34) ?? [];
        Logger.warn(INSTR_TRACE_TAG, `[WIRE_COLLISION] point=(${c34[0]},${c34[1]}) nets=[${d34.join('|')}] wires=[${e34.join(', ')}] — should merge nets`);
    });
    if (z33 === 0) {
        Logger.info(INSTR_TRACE_TAG, '[WIRE_COLLISION] (none detected)');
    }
    else {
        Logger.warn(INSTR_TRACE_TAG, `[WIRE_COLLISION] total=${z33} junction(s) need net merge`);
    }
}
export function traceComponentPinNets(u33: SchematicDocument): void {
    tracePerPinConnectivity(u33);
}
interface CompPinEntry {
    pinId: string;
    pinName: string;
    netId: string;
}
function collectCompPins(l33: SchematicDocument, m33: string): CompPinEntry[] {
    const n33 = new Set<string>();
    const o33: CompPinEntry[] = [];
    for (let p33 = 0; p33 < l33.nets.length; p33++) {
        const q33 = l33.nets[p33];
        for (let r33 = 0; r33 < q33.pinIds.length; r33++) {
            const s33 = parsePinRef(q33.pinIds[r33]);
            if (s33 === null || s33.compId !== m33) {
                continue;
            }
            const t33 = `${s33.pinId}\0${s33.pinName}`;
            if (n33.has(t33)) {
                continue;
            }
            n33.add(t33);
            o33.push({ pinId: s33.pinId, pinName: s33.pinName, netId: q33.id });
        }
    }
    return o33;
}
function formatPeerPins(a33: Net, b33: ComponentInstance[], c33: string, d33: string, e33: number = 12): string {
    const f33: string[] = [];
    for (let g33 = 0; g33 < a33.pinIds.length; g33++) {
        const h33 = parsePinRef(a33.pinIds[g33]);
        if (h33 === null) {
            continue;
        }
        const i33 = h33.pinName.length > 0 ? h33.pinName : h33.pinId;
        const j33 = d33;
        if (h33.compId === c33 &&
            (i33.toUpperCase() === j33.toUpperCase() || h33.pinId.toUpperCase() === j33.toUpperCase())) {
            continue;
        }
        const k33 = refDesForComp(b33, h33.compId);
        f33.push(`${k33}.${i33}`);
    }
    if (f33.length === 0) {
        return '(none)';
    }
    if (f33.length > e33) {
        return `${f33.slice(0, e33).join(', ')}...+${f33.length - e33}`;
    }
    return f33.join(', ');
}
function instrumentModelHint(y32: string): string {
    const z32 = detectInstrumentKind(y32);
    if (z32 === 'vm' || z32 === 'dmm') {
        return ' model=10MΩ(V+→COM) ΔV=V(V+)-V(COM) +当V+电位高于COM';
    }
    if (z32 === 'am') {
        return ' model=0.1Ω(I+→I-) I=(V(I+)-V(I-))/0.1Ω +当电流从I+流向I-';
    }
    return '';
}
export function tracePerPinConnectivity(j32: SchematicDocument, k32?: Map<string, string>): void {
    Logger.info(INSTR_TRACE_TAG, `[PINCONN] ========== per-pin connectivity (${j32.components.length} components) ==========`);
    for (let l32 = 0; l32 < j32.components.length; l32++) {
        const m32 = j32.components[l32];
        const n32 = collectCompPins(j32, m32.id);
        const o32 = instrumentModelHint(m32.libraryId);
        Logger.info(INSTR_TRACE_TAG, `[PINCONN] ${m32.refDes} id=${m32.id} lib=${m32.libraryId}${o32}`);
        if (n32.length === 0) {
            Logger.warn(INSTR_TRACE_TAG, `[PINCONN]   (no pins on any net — check wiring)`);
            continue;
        }
        for (let p32 = 0; p32 < n32.length; p32++) {
            const q32 = n32[p32];
            const r32 = q32.pinName.length > 0 ? q32.pinName : q32.pinId;
            const s32 = j32.nets.find(x32 => x32.id === q32.netId);
            if (s32 === undefined) {
                Logger.warn(INSTR_TRACE_TAG, `[PINCONN]   ${r32} → net=${q32.netId} (missing net record)`);
                continue;
            }
            const t32 = netDisplayName(s32);
            const u32 = k32 !== undefined ? (k32.get(s32.id) ?? '(unmapped)') : '';
            const v32 = u32.length > 0 ? ` node=${u32}` : '';
            const w32 = formatPeerPins(s32, j32.components, m32.id, r32);
            Logger.info(INSTR_TRACE_TAG, `[PINCONN]   ${r32} → net=${t32} uuid=${s32.id}${v32} peers=[${w32}]`);
        }
    }
    Logger.info(INSTR_TRACE_TAG, '[PINCONN] ========== per-pin connectivity END ==========');
}
export function traceInstrumentMeasureModel(k31: SchematicDocument, l31: (netId: string) => number, m31: (compId: string) => number): void {
    Logger.info(INSTR_TRACE_TAG, '[INSTR_MODEL] voltmeter/ammeter MNA stamp & signed reading');
    for (let n31 = 0; n31 < k31.components.length; n31++) {
        const o31 = k31.components[n31];
        const p31 = detectInstrumentKind(o31.libraryId);
        const q31 = getPinNetMap(o31.id, k31.nets);
        const r31 = (g32: string): string => {
            const h32 = k31.nets.find(i32 => i32.id === g32);
            return h32 !== undefined ? netDisplayName(h32) : g32.substring(0, 14);
        };
        const s31 = (d32: string[]): string | null => {
            for (let e32 = 0; e32 < d32.length; e32++) {
                const f32 = q31.get(d32[e32].toUpperCase());
                if (f32 !== undefined) {
                    return f32;
                }
            }
            return null;
        };
        if (p31 === 'vm' || p31 === 'dmm') {
            const y31 = s31(['V+', 'V', 'PLUS', '+']);
            const z31 = s31(['COM', 'V-', '-', 'GND']);
            if (y31 === null || z31 === null) {
                continue;
            }
            const a32 = l31(y31);
            const b32 = l31(z31);
            const c32 = a32 - b32;
            Logger.info(INSTR_TRACE_TAG, `[INSTR_MODEL] ${o31.refDes} VM 10MΩ V+(${r31(y31)})=${a32.toFixed(4)}V ` +
                `COM(${r31(z31)})=${b32.toFixed(4)}V Δ=${c32.toFixed(4)}V ` +
                `sign=${c32 >= 0 ? '+' : '-'} (${c32 >= 0 ? 'V+>COM' : 'COM>V+'})`);
        }
        else if (p31 === 'am') {
            const t31 = s31(['I+', 'PLUS', '+']);
            const u31 = s31(['I-', 'MINUS', '-']);
            if (t31 === null || u31 === null) {
                continue;
            }
            const v31 = m31(o31.id);
            const w31 = v31 * 1000;
            const x31 = u31 !== null ? r31(u31) : '?';
            Logger.info(INSTR_TRACE_TAG, `[INSTR_MODEL] ${o31.refDes} AM 0.1Ω I+(${r31(t31)})→I-(${x31}) ` +
                `I=${w31.toFixed(4)}mA sign=${v31 >= 0 ? '+' : '-'} ` +
                `(${v31 >= 0 ? 'I+→I-' : 'I-→I+'})`);
        }
    }
}
export function traceResistorDividerCheck(m30: SchematicDocument): void {
    const n30 = m30.components.filter(j31 => j31.libraryId.toUpperCase().startsWith('R_') || j31.libraryId.toUpperCase().includes('RESISTOR'));
    if (n30.length < 2) {
        return;
    }
    for (let o30 = 0; o30 < n30.length; o30++) {
        const p30 = n30[o30];
        const q30 = getPinNetMap(p30.id, m30.nets);
        const r30 = new Set<string>();
        q30.forEach((i31: string) => r30.add(i31));
        if (r30.size < 2) {
            Logger.warn(INSTR_TRACE_TAG, `[DIVIDER] ${p30.refDes} only ${r30.size} net(s) — not a two-terminal connection`);
            continue;
        }
        for (let s30 = o30 + 1; s30 < n30.length; s30++) {
            const t30 = n30[s30];
            const u30 = getPinNetMap(t30.id, m30.nets);
            const v30 = new Set<string>();
            u30.forEach((h31: string) => v30.add(h31));
            const w30: string[] = [];
            r30.forEach((g31: string) => {
                if (v30.has(g31)) {
                    w30.push(g31);
                }
            });
            if (w30.length === 0) {
                continue;
            }
            const x30 = new Set<string>();
            r30.forEach((f31: string) => x30.add(f31));
            v30.forEach((e31: string) => x30.add(e31));
            const y30 = (b31: string): string => {
                const c31 = m30.nets.find(d31 => d31.id === b31);
                return c31 !== undefined ? netDisplayName(c31) : b31.substring(0, 12);
            };
            if (x30.size < 3) {
                const z30: string[] = [];
                x30.forEach((a31: string) => z30.push(y30(a31)));
                Logger.warn(INSTR_TRACE_TAG, `[DIVIDER] ${p30.refDes}+${t30.refDes} share net(s) [${w30.map(y30).join(', ')}] ` +
                    `but only ${x30.size} unique net(s) [${z30.join(', ')}] — ` +
                    `need 3 nets (VCC, MID, GND) for voltage divider`);
            }
            else if (w30.length === 1) {
                Logger.info(INSTR_TRACE_TAG, `[DIVIDER] ${p30.refDes}+${t30.refDes} OK: 3 nets, mid=${y30(w30[0])}`);
            }
            else if (w30.length >= 2) {
                Logger.warn(INSTR_TRACE_TAG, `[DIVIDER] ${p30.refDes}+${t30.refDes} share ${w30.length} nets — may be shorted`);
            }
        }
    }
}
export function traceTopologyHealthCheck(k30: SchematicDocument, l30?: Map<string, string>): void {
    Logger.info(INSTR_TRACE_TAG, '---------- TOPOLOGY HEALTH CHECK ----------');
    tracePinMultiNetConflicts(k30);
    traceWireEndpointCollisions(k30.wires, k30);
    tracePerPinConnectivity(k30, l30);
    traceResistorDividerCheck(k30);
    traceInstrumentWiringIssues(k30);
    Logger.info(INSTR_TRACE_TAG, '---------- TOPOLOGY HEALTH CHECK END ----------');
}
export function traceErcErrorList(b30: ErcError[], c30: string = 'ERC'): void {
    if (b30.length === 0) {
        Logger.info(INSTR_TRACE_TAG, `[${c30}] errors=0`);
        return;
    }
    let d30 = 0;
    let e30 = 0;
    for (let j30 = 0; j30 < b30.length; j30++) {
        if (b30[j30].severity === 'error' || b30[j30].severity === 'critical') {
            d30++;
        }
        else if (b30[j30].severity === 'warning') {
            e30++;
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[${c30}] errors=${b30.length} critical=${d30} warn=${e30} ----------`);
    for (let f30 = 0; f30 < b30.length; f30++) {
        const g30 = b30[f30];
        const h30 = g30.targetUuid.length > 0 ? g30.targetUuid : '-';
        const i30 = `[${c30}] #${f30 + 1} ${g30.severity} type=${g30.errType} target=${h30} ${g30.desc}`;
        if (g30.severity === 'error' || g30.severity === 'critical') {
            Logger.warn(INSTR_TRACE_TAG, i30);
        }
        else {
            Logger.info(INSTR_TRACE_TAG, i30);
        }
        if (g30.suggest.length > 0) {
            Logger.info(INSTR_TRACE_TAG, `[${c30}]     fix: ${g30.suggest}`);
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[${c30}] ---------- END errors=${b30.length} ----------`);
}
export function traceAnalogDeviceStamp(u29: string, v29: string, w29: string, x29: string, y29: string, z29: string): void {
    const a30 = x29 === y29 ? ' SHORTED' : '';
    Logger.info(INSTR_TRACE_TAG, `[MNA] ${u29} ${v29} lib=${w29} ${x29}->${y29}${a30} ${z29}`);
}
export interface AnalogResistorStamp {
    devId: string;
    refDes: string;
    nodeA: string;
    nodeB: string;
    ohms: number;
}
export function traceAnalogNetlistSummary(p29: AnalogResistorStamp[], q29: string[]): void {
    Logger.info(INSTR_TRACE_TAG, `[NETLIST] resistors=${p29.length} vsrc=${q29.length}`);
    for (let s29 = 0; s29 < p29.length; s29++) {
        const t29 = p29[s29];
        Logger.info(INSTR_TRACE_TAG, `[NETLIST] ${t29.devId} ${t29.refDes} ${t29.nodeA}->${t29.nodeB} ${t29.ohms}Ω`);
    }
    for (let r29 = 0; r29 < q29.length; r29++) {
        Logger.info(INSTR_TRACE_TAG, `[NETLIST] ${q29[r29]}`);
    }
}
export function traceNetVoltageResolve(i29: SchematicDocument, j29: (netId: string) => number, k29: Map<string, string>): void {
    Logger.info(INSTR_TRACE_TAG, '[VRESOLVE] net UUID → spice node → voltage');
    for (let l29 = 0; l29 < i29.nets.length; l29++) {
        const m29 = i29.nets[l29];
        if (m29.pinIds.length === 0) {
            continue;
        }
        const n29 = k29.get(m29.id) ?? '(unmapped)';
        const o29 = j29(m29.id);
        Logger.info(INSTR_TRACE_TAG, `[VRESOLVE] ${netDisplayName(m29)} uuid=${m29.id.substring(0, 16)} spice=${n29} V=${o29.toFixed(4)}V`);
    }
}
export function traceConnectionPointSimData(s28: SchematicDocument, t28: (netId: string) => number, u28: (netId: string) => number, v28: boolean, w28: string, x28: number = 30): void {
    Logger.info(INSTR_TRACE_TAG, `[SIMDATA] state=${w28} active=${v28 ? 'YES' : 'NO'}`);
    if (!v28) {
        Logger.warn(INSTR_TRACE_TAG, '[SIMDATA] 仿真未运行 — 连接点电压/电流均为 0 或未初始化');
    }
    let y28 = 0;
    for (let z28 = 0; z28 < s28.nets.length && y28 < x28; z28++) {
        const a29 = s28.nets[z28];
        if (a29.pinIds.length === 0) {
            continue;
        }
        const b29 = t28(a29.id);
        const c29 = u28(a29.id);
        const d29: string[] = [];
        const e29 = Math.min(a29.pinIds.length, 6);
        for (let f29 = 0; f29 < e29; f29++) {
            const g29 = parsePinRef(a29.pinIds[f29]);
            if (g29 !== null) {
                const h29 = refDesForComp(s28.components, g29.compId);
                d29.push(`${h29}.${g29.pinName.length > 0 ? g29.pinName : g29.pinId}`);
            }
        }
        Logger.info(INSTR_TRACE_TAG, `[SIMDATA] net=${netDisplayName(a29)} V=${b29.toFixed(4)}V I=${(c29 * 1000).toFixed(4)}mA ` +
            `pins=[${d29.join(', ')}]`);
        y28++;
    }
}
export function traceSpiceNodeMap(l28: Map<string, string>, m28: number = 15): void {
    if (l28.size === 0) {
        Logger.info(INSTR_TRACE_TAG, '[SPICE] nodeMap=(empty)');
        return;
    }
    const n28: string[] = [];
    let o28 = 0;
    l28.forEach((q28: string, r28: string) => {
        if (o28 >= m28) {
            return;
        }
        n28.push(`${r28.substring(0, 12)}→${q28}`);
        o28++;
    });
    const p28 = l28.size > m28 ? ` ...+${l28.size - m28}` : '';
    Logger.info(INSTR_TRACE_TAG, `[SPICE] nodeMap={${n28.join(', ')}${p28}}`);
}
export function traceSimGlobalSnapshot(h28: Map<string, number>, i28: Map<string, number>, j28: WaveData[], k28: number): void {
    Logger.info(INSTR_TRACE_TAG, `[SNAPSHOT] step=${k28} V={${formatVoltageSample(h28, 12)}} ` +
        `I={${formatCurrentSample(i28, 8)}} waves=[${formatWaveSummary(j28, 6)}]`);
}
export function traceProjectOpenAudit(d28: string, e28: string, f28: SchematicDocument, g28: ViewportState): void {
    Logger.info(INSTR_TRACE_TAG, '========== PROJECT OPEN AUDIT START ==========');
    traceDataFlow('OPEN', `path=${d28} project=${e28} doc=${f28.id} v=${f28.version}`);
    traceCanvasInfo(f28, g28);
    traceComponentLayout(f28.components);
    traceWireTopology(f28.wires);
    traceNetPinDetail(f28);
    traceUnconnectedComponents(f28);
    traceInstrumentInventory(f28);
    traceTopologyHealthCheck(f28);
    traceDataFlow('OPEN', `audit complete comps=${f28.components.length} nets=${f28.nets.length} wires=${f28.wires.length}`);
    Logger.info(INSTR_TRACE_TAG, '========== PROJECT OPEN AUDIT END ==========');
}
export function traceSimStartupAudit(q27: SchematicDocument, r27: SimulationState, s27: number, t27: (netId: string) => number, u27: (netId: string) => number, v27: Map<string, number>, w27: Map<string, number>, x27: WaveData[], y27: Map<string, string>, z27: string | null, a28?: (compId: string) => number): void {
    Logger.info(INSTR_TRACE_TAG, '========== SIM STARTUP AUDIT START ==========');
    traceDataFlow('SIM_START', `state=${r27} step=${s27} active=${z27 ?? 'null'}`);
    traceTopologyHealthCheck(q27, y27);
    const b28 = a28 ?? ((c28: string) => 0);
    traceInstrumentMeasureModel(q27, t27, b28);
    traceConnectionPointSimData(q27, t27, u27, true, r27);
    traceNetVoltageResolve(q27, t27, y27);
    traceSpiceNodeMap(y27);
    traceSimGlobalSnapshot(v27, w27, x27, s27);
    traceInstrumentInventory(q27);
    Logger.info(INSTR_TRACE_TAG, '========== SIM STARTUP AUDIT END ==========');
}
export function traceBindingRefresh(i27: string, j27: string, k27: Map<string, string>, l27: BindingTraceInfo, m27: boolean = false, n27: string = ''): void {
    const o27 = m27 ? 'RUNNING' : 'IDLE';
    let p27 = `bind comp=${i27} ref=${j27} sim=${o27} pins={${formatPinNetMap(k27)}} ${formatBindingSummary(l27)}`;
    if (n27.length > 0) {
        p27 += ` ${n27}`;
    }
    Logger.info(INSTR_TRACE_TAG, p27);
    if (!m27) {
        Logger.warn(INSTR_TRACE_TAG, `bind ${j27}: 仿真未运行，仪器读数不可用 — 请先点击「运行仿真」`);
    }
}
let lastMeasureKey = '';
let lastMeasureTick = 0;
export function traceMeasure(c27: string, d27: string, e27: boolean, f27: string): void {
    const g27 = `${c27}:${d27}:${f27}`;
    const h27 = Date.now();
    if (g27 === lastMeasureKey && h27 - lastMeasureTick < 2000) {
        return;
    }
    lastMeasureKey = g27;
    lastMeasureTick = h27;
    Logger.info(INSTR_TRACE_TAG, `measure ref=${c27} kind=${d27} sim=${e27 ? 'RUNNING' : 'IDLE'} ${f27}`);
}
export function traceActiveComponent(a27: string | null, b27: string): void {
    Logger.debug(INSTR_TRACE_TAG, `active comp=${a27 ?? 'null'} src=${b27}`);
}
let lastActiveCompLogged: string | null = null;
export function traceActiveComponentChanged(x26: string | null, y26: string): void {
    const z26 = x26 ?? '';
    if (z26 === (lastActiveCompLogged ?? '')) {
        return;
    }
    lastActiveCompLogged = x26;
    Logger.info(INSTR_TRACE_TAG, `active CHANGED comp=${x26 ?? 'null'} src=${y26}`);
}
export function traceReloadSchematic(u26: string | null, v26: number, w26: number): void {
    Logger.info(INSTR_TRACE_TAG, `reload schematic comps=${v26} nets=${w26} active=${u26 ?? 'null'}`);
}
export function traceSimStep(n26: number, o26: number, p26: WaveData[], q26: string | null, r26: Map<string, number>, s26?: Map<string, number>): void {
    if (!INSTR_TRACE_SIM_STEP && n26 % 100 !== 0) {
        return;
    }
    let t26 = `sim step=${n26} waves=${o26} active=${q26 ?? 'null'} ` +
        `w=[${formatWaveSummary(p26, 4)}] V={${formatVoltageSample(r26, 6)}}`;
    if (s26 !== undefined) {
        t26 += ` I={${formatCurrentSample(s26, 4)}}`;
    }
    if (n26 % 100 === 0) {
        Logger.info(INSTR_TRACE_TAG, t26);
    }
    else {
        Logger.debug(INSTR_TRACE_TAG, t26);
    }
}
export function traceCaptureWave(i26: number, j26: string, k26: string, l26: number, m26: number): void {
    Logger.debug(INSTR_TRACE_TAG, `scope CH${i26 + 1} probe=${j26} src=${k26} pts=${l26} last=${m26.toFixed(4)}V`);
}
export function traceUiRefresh(c26: string, d26: string, e26: string, f26: string, g26: string, h26: string): void {
    Logger.debug(INSTR_TRACE_TAG, `${c26} comp=${d26} ref=${e26} lib=${f26} kind=${g26} reading=${h26}`);
}
export function traceUiSelect(w25: string, x25: string, y25: string, z25: string, a26: string, b26: string): void {
    Logger.info(INSTR_TRACE_TAG, `[SELECT] ${w25} comp=${x25} ref=${y25} lib=${z25} kind=${a26} reading=${b26}`);
}
export function traceLoadSchematic(t25: boolean, u25: number, v25: number): void {
    Logger.info(INSTR_TRACE_TAG, `kernel loadSchematic comps=${u25} nets=${v25} clearedWaves=${t25}`);
}
export function traceAnalogOpSummary(p25: number, q25: number, r25: boolean, s25: string): void {
    Logger.info(INSTR_TRACE_TAG, `analog OP R=${p25} Vsrc=${q25} converged=${r25} nodes={${s25}}`);
}
export function traceNetConnectivity(k25: number, l25: number, m25: number, n25: number, o25: number): void {
    Logger.info(INSTR_TRACE_TAG, `net_pins before=${k25} after=${l25} wire_hits=${m25} comps=${n25} wires=${o25}`);
}
export function tracePinNetEmpty(i25: string, j25: string): void {
    Logger.warn(INSTR_TRACE_TAG, `bind FAILED: no pin nets for comp=${i25} ref=${j25} — check wire connectivity / rebuildNetPinConnectivity`);
}
