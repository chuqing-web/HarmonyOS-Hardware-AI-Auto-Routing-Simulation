import { NetType, WireStyle, IdUtil, emptyStringMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface PinSpec {
    comp: ComponentInstance;
    pinId: string;
    pinName: string;
}
export class TemplateSchematicKit {
    static createDoc(name: string, description: string): SchematicDocument {
        const now = new Date().toISOString();
        return {
            id: IdUtil.generate('sch'),
            name: name,
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: 'LabTemplate', createdAt: now, modifiedAt: now,
                description: description, gridSize: 10, units: 'mm', undoLimit: 1000
            }
        };
    }
    static place(doc: SchematicDocument, libraryId: string, refDes: string, pos: Point2D): ComponentInstance {
        const parameters = emptyStringMap();
        if (libraryId.startsWith('R_')) {
            parameters.set('value', libraryId.substring(2));
            parameters.set('power', '0.25W');
        }
        else if (libraryId.startsWith('POT_')) {
            parameters.set('value', libraryId.substring(4));
            parameters.set('wiper', '0.5');
            parameters.set('power', '0.25W');
        }
        else if (libraryId.startsWith('C_')) {
            parameters.set('value', libraryId.substring(2));
            parameters.set('voltage', '50V');
        }
        else if (libraryId === 'LM7805') {
            parameters.set('output', '5V');
        }
        else if (libraryId === 'LM7812') {
            parameters.set('output', '12V');
        }
        else if (libraryId === 'AMS1117_3V3') {
            parameters.set('output', '3.3V');
        }
        else if (libraryId === 'VCC') {
            parameters.set('voltage', '5V');
        }
        const comp: ComponentInstance = {
            id: IdUtil.generate('comp'),
            libraryId: libraryId,
            refDes: refDes,
            position: pos,
            rotation: 0,
            mirrored: false,
            parameters: parameters
        };
        doc.components.push(comp);
        return comp;
    }
    static pinRef(c: ComponentInstance, pinId: string, pinName: string): string {
        return `${c.id}:${pinId}:${pinName}`;
    }
    static pinWorld(c: ComponentInstance, pinId: string, pinName: string): Point2D {
        const local = TemplateSchematicKit.pinOffset(c.libraryId, pinId, pinName);
        return { x: c.position.x + local.x, y: c.position.y + local.y };
    }
    static addNet(doc: SchematicDocument, name: string, type: NetType, pinRefs: string[]): string {
        let net = doc.nets.find(n => n.name === name);
        if (net === undefined) {
            net = { id: IdUtil.generate('net'), name: name, type: type, pinIds: [] };
            doc.nets.push(net);
        }
        for (let i = 0; i < pinRefs.length; i++) {
            if (!net.pinIds.includes(pinRefs[i])) {
                net.pinIds.push(pinRefs[i]);
            }
        }
        return net.id;
    }
    static netId(doc: SchematicDocument, name: string): string {
        const net = doc.nets.find(n => n.name === name);
        return net !== undefined ? net.id : name;
    }
    static addWire(doc: SchematicDocument, netId: string, ...pts: Point2D[]): void {
        const points: Point2D[] = [];
        for (let i = 0; i < pts.length; i++) {
            points.push({ x: pts[i].x, y: pts[i].y });
        }
        doc.wires.push({
            id: IdUtil.generate('wire'),
            netId: netId,
            points: points,
            style: WireStyle.ORTHOGONAL
        });
    }
    private static orthoPts(a: Point2D, b: Point2D): Point2D[] {
        if (a.x === b.x || a.y === b.y) {
            return [a, b];
        }
        return [a, { x: b.x, y: a.y }, b];
    }
    /** VCC/GND 符号提到 hub，减少负载脚作星心时的横穿 */
    private static promoteRailHub(pins: PinSpec[]): PinSpec[] {
        let railIdx = -1;
        for (let i = 0; i < pins.length; i++) {
            const lib = pins[i].comp.libraryId;
            if (lib === 'VCC' || lib === 'GND') {
                railIdx = i;
                break;
            }
        }
        if (railIdx <= 0) {
            return pins;
        }
        const out: PinSpec[] = [];
        out.push(pins[railIdx]);
        for (let i = 0; i < pins.length; i++) {
            if (i !== railIdx) {
                out.push(pins[i]);
            }
        }
        return out;
    }
    /** 远跨模块才优先标号；近/中距先物理线（与 tools/lab_templates/kit.mjs 对齐） */
    private static readonly LABEL_SPAN: number = 420;
    private static pinSpan(pins: PinSpec[]): number {
        if (pins.length < 2) {
            return 0;
        }
        let maxD = 0;
        for (let i = 0; i < pins.length; i++) {
            const a = TemplateSchematicKit.pinWorld(pins[i].comp, pins[i].pinId, pins[i].pinName);
            for (let j = i + 1; j < pins.length; j++) {
                const b = TemplateSchematicKit.pinWorld(pins[j].comp, pins[j].pinId, pins[j].pinName);
                const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
                if (d > maxD) {
                    maxD = d;
                }
            }
        }
        return maxD;
    }
    /** 本次脚之间 + 相对同名网最近已有脚 的跨距 */
    private static joinSpan(doc: SchematicDocument, netName: string, pins: PinSpec[]): number {
        let span = TemplateSchematicKit.pinSpan(pins);
        const existing = doc.nets.find(n => n.name === netName);
        if (existing === undefined || existing.pinIds.length === 0) {
            return span;
        }
        for (let i = 0; i < pins.length; i++) {
            const p = pins[i];
            const w = TemplateSchematicKit.pinWorld(p.comp, p.pinId, p.pinName);
            let best = Number.POSITIVE_INFINITY;
            for (let ri = 0; ri < existing.pinIds.length; ri++) {
                const parts = existing.pinIds[ri].split(':');
                let already = false;
                for (let k = 0; k < pins.length; k++) {
                    if (pins[k].comp.id === parts[0] && pins[k].pinId === parts[1]) {
                        already = true;
                        break;
                    }
                }
                if (already) {
                    continue;
                }
                const hubComp = doc.components.find(c => c.id === parts[0]);
                if (hubComp === undefined) {
                    continue;
                }
                const h = TemplateSchematicKit.pinWorld(hubComp, parts[1], parts.length > 2 ? parts[2] : parts[1]);
                const d = Math.abs(w.x - h.x) + Math.abs(w.y - h.y);
                if (d < best) {
                    best = d;
                }
            }
            if (best < Number.POSITIVE_INFINITY && best > span) {
                span = best;
            }
        }
        return span;
    }
    /**
     * 多脚并网（混用）：近/中距物理导线；远跨模块 Net Label。
     */
    static join(doc: SchematicDocument, netName: string, type: NetType, pins: PinSpec[]): string {
        if (pins.length === 0) {
            return '';
        }
        const span = TemplateSchematicKit.joinSpan(doc, netName, pins);
        if (span >= TemplateSchematicKit.LABEL_SPAN) {
            return TemplateSchematicKit.joinByLabel(doc, netName, type, pins);
        }
        return TemplateSchematicKit.joinWired(doc, netName, type, pins);
    }
    /** 强制物理正交布线 */
    static joinWired(doc: SchematicDocument, netName: string, type: NetType, pins: PinSpec[]): string {
        const existing = doc.nets.find(n => n.name === netName);
        const priorRefs: string[] = existing !== undefined ? existing.pinIds.slice() : [];
        let routePins = TemplateSchematicKit.promoteRailHub(pins);
        if (routePins.length === 1 && priorRefs.length >= 1) {
            const parts = priorRefs[0].split(':');
            const hubComp = doc.components.find(c => c.id === parts[0]);
            if (hubComp !== undefined) {
                const hubSpec: PinSpec = {
                    comp: hubComp,
                    pinId: parts[1],
                    pinName: parts.length > 2 ? parts[2] : parts[1]
                };
                routePins = TemplateSchematicKit.promoteRailHub([hubSpec, routePins[0]]);
            }
        }
        const refs: string[] = [];
        for (let i = 0; i < pins.length; i++) {
            const p = pins[i];
            refs.push(TemplateSchematicKit.pinRef(p.comp, p.pinId, p.pinName));
        }
        const nid = TemplateSchematicKit.addNet(doc, netName, type, refs);
        // 单脚 join 不画线 → 加载后 pinIds 被 wipe；改为 stub+标号保几何
        if (routePins.length < 2) {
            if (pins.length === 1) {
                TemplateSchematicKit.stubLabel(doc, pins[0], netName, type);
            }
            return nid;
        }
        const hubComp = routePins[0].comp;
        const hub = TemplateSchematicKit.pinWorld(hubComp, routePins[0].pinId, routePins[0].pinName);
        const useRailBus = (type === NetType.POWER || type === NetType.GROUND) &&
            (hubComp.libraryId === 'VCC' || hubComp.libraryId === 'GND');
        for (let i = 1; i < routePins.length; i++) {
            const pt = TemplateSchematicKit.pinWorld(routePins[i].comp, routePins[i].pinId, routePins[i].pinName);
            let route: Point2D[];
            if (useRailBus) {
                if (hub.x === pt.x || hub.y === pt.y) {
                    route = [hub, pt];
                }
                else {
                    route = [hub, { x: pt.x, y: hub.y }, pt];
                }
            }
            else {
                route = TemplateSchematicKit.orthoPts(hub, pt);
            }
            if (route.length === 2) {
                TemplateSchematicKit.addWire(doc, nid, route[0], route[1]);
            }
            else if (route.length >= 3) {
                TemplateSchematicKit.addWire(doc, nid, route[0], route[1], route[2]);
            }
        }
        return nid;
    }
    private static labelStubEnd(comp: ComponentInstance, worldPt: Point2D, stubLen: number, netName: string = ''): Point2D {
        const lib = comp.libraryId;
        const upper = netName.toUpperCase();
        if (lib === 'VCC' && (upper === 'VCC' || upper === 'VDD' || upper.length === 0)) {
            return { x: worldPt.x, y: worldPt.y - stubLen };
        }
        if (lib === 'GND' && (upper === 'GND' || upper === 'VSS' || upper === '0' ||
            upper.length === 0)) {
            return { x: worldPt.x, y: worldPt.y + stubLen };
        }
        const cx = comp.position.x;
        const cy = comp.position.y;
        if (worldPt.x < cx - 5) {
            return { x: worldPt.x - stubLen, y: worldPt.y };
        }
        if (worldPt.x > cx + 5) {
            return { x: worldPt.x + stubLen, y: worldPt.y };
        }
        if (worldPt.y < cy) {
            return { x: worldPt.x, y: worldPt.y - stubLen };
        }
        return { x: worldPt.x, y: worldPt.y + stubLen };
    }
    /** Stub labels stay local (global=false); editor may place global=true for VCC/GND symbols. */
    static netLabel(doc: SchematicDocument, netId: string, text: string, pos: Point2D, global: boolean = false): void {
        doc.netLabels.push({
            id: IdUtil.generate('lbl'),
            netId: netId,
            text: text,
            position: { x: pos.x, y: pos.y },
            global: global
        });
    }
    static stubLabel(doc: SchematicDocument, pin: PinSpec, name: string, type: NetType = NetType.SIGNAL, stubLen: number = 20): string {
        const ref = TemplateSchematicKit.pinRef(pin.comp, pin.pinId, pin.pinName);
        const nid = TemplateSchematicKit.addNet(doc, name, type, [ref]);
        const world = TemplateSchematicKit.pinWorld(pin.comp, pin.pinId, pin.pinName);
        const pinNum = parseInt(String(pin.pinId).replace(/\D/g, ''), 10);
        const baseLen = stubLen + ((!Number.isNaN(pinNum) ? (pinNum % 3) : 0) * 10);
        const selfKey = `${pin.comp.id}:${pin.pinId}`;
        let end = TemplateSchematicKit.labelStubEnd(pin.comp, world, baseLen, name);
        for (let len = baseLen; len <= baseLen + 40; len += 10) {
            const candidate = TemplateSchematicKit.labelStubEnd(pin.comp, world, len, name);
            let hitsForeign = false;
            for (let wi = 0; wi < doc.wires.length; wi++) {
                const w = doc.wires[wi];
                // Skip own net — only foreign wire endpoints count as collisions.
                if (w.netId === nid || w.points.length < 2) {
                    continue;
                }
                const a = w.points[0];
                const b = w.points[w.points.length - 1];
                if (Math.hypot(a.x - candidate.x, a.y - candidate.y) <= 5 ||
                    Math.hypot(b.x - candidate.x, b.y - candidate.y) <= 5) {
                    hitsForeign = true;
                    break;
                }
            }
            if (!hitsForeign) {
                for (let ci = 0; ci < doc.components.length; ci++) {
                    const comp = doc.components[ci];
                    const pinIds = TemplateSchematicKit.commonPinIds(comp.libraryId);
                    for (let pi = 0; pi < pinIds.length; pi++) {
                        const pid = pinIds[pi];
                        if (`${comp.id}:${pid}` === selfKey) {
                            continue;
                        }
                        const pw = TemplateSchematicKit.pinWorld(comp, pid, pid);
                        if (Math.hypot(pw.x - candidate.x, pw.y - candidate.y) <= 5) {
                            hitsForeign = true;
                            break;
                        }
                    }
                    if (hitsForeign) {
                        break;
                    }
                }
            }
            end = candidate;
            if (!hitsForeign) {
                break;
            }
        }
        let already = false;
        for (let wi = 0; wi < doc.wires.length; wi++) {
            const w = doc.wires[wi];
            if (w.netId !== nid || w.points.length < 2) {
                continue;
            }
            const a = w.points[0];
            const b = w.points[w.points.length - 1];
            if (Math.hypot(a.x - world.x, a.y - world.y) <= 2 ||
                Math.hypot(b.x - world.x, b.y - world.y) <= 2) {
                already = true;
                break;
            }
        }
        if (!already) {
            TemplateSchematicKit.addWire(doc, nid, world, end);
        }
        const labelPos = already ? world : end;
        // 每个 pin 必须有独立标号：邻脚间距约 10px，用 stubLen+4≈24 会误复用邻脚标号，
        // WireNetTopology 重建后无标号的 stub 网无法并入 GND/VCC → floating_net。
        let hasExact = false;
        for (let li = 0; li < doc.netLabels.length; li++) {
            const lb = doc.netLabels[li];
            if (lb.text !== name) {
                continue;
            }
            if (Math.hypot(lb.position.x - labelPos.x, lb.position.y - labelPos.y) <= 2) {
                hasExact = true;
                break;
            }
        }
        if (!hasExact) {
            TemplateSchematicKit.netLabel(doc, nid, name, labelPos);
        }
        return nid;
    }
    /** 强制同名 Net Label 并网（无长物理线） */
    static joinByLabel(doc: SchematicDocument, netName: string, type: NetType, pins: PinSpec[]): string {
        const refs: string[] = [];
        for (let i = 0; i < pins.length; i++) {
            refs.push(TemplateSchematicKit.pinRef(pins[i].comp, pins[i].pinId, pins[i].pinName));
        }
        const nid = TemplateSchematicKit.addNet(doc, netName, type, refs);
        for (let i = 0; i < pins.length; i++) {
            TemplateSchematicKit.stubLabel(doc, pins[i], netName, type);
        }
        return nid;
    }
    /** 串联两脚器件: A.1 — R — B.1 */
    static series2(doc: SchematicDocument, netMid: string, left: PinSpec, right: PinSpec): void {
        TemplateSchematicKit.join(doc, netMid, NetType.SIGNAL, [left, right]);
    }
    /** VCC/GND 电源轨 */
    static powerRails(doc: SchematicDocument, vccPin: PinSpec, gndPin: PinSpec, vccLoads: PinSpec[], gndLoads: PinSpec[]): void {
        const vccPins: PinSpec[] = [vccPin];
        for (let i = 0; i < vccLoads.length; i++) {
            vccPins.push(vccLoads[i]);
        }
        TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, vccPins);
        const gndPins: PinSpec[] = [gndPin];
        for (let i = 0; i < gndLoads.length; i++) {
            gndPins.push(gndLoads[i]);
        }
        TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, gndPins);
    }
    /** LED + 限流电阻；railNet='VCC' 时并入电源轨；driveOnPin2：驱动接电阻右脚（左向布线） */
    static ledBranch(doc: SchematicDocument, drive: PinSpec, gndPin: PinSpec, resistor: ComponentInstance, led: ComponentInstance, prefix: string, railNet: string | null = null, driveOnPin2: boolean = false): void {
        const driveNet = railNet !== null ? railNet : `${prefix}_R`;
        let driveType = NetType.SIGNAL;
        if (railNet === 'VCC') {
            driveType = NetType.POWER;
        }
        else if (railNet === 'GND') {
            driveType = NetType.GROUND;
        }
        const nearPin = driveOnPin2 ? '2' : '1';
        const farPin = driveOnPin2 ? '1' : '2';
        TemplateSchematicKit.join(doc, driveNet, driveType, [
            drive, { comp: resistor, pinId: nearPin, pinName: nearPin }
        ]);
        TemplateSchematicKit.series2(doc, `${prefix}_LED`, { comp: resistor, pinId: farPin, pinName: farPin }, { comp: led, pinId: 'A', pinName: 'A' });
        TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
            gndPin, { comp: led, pinId: 'K', pinName: 'K' }
        ]);
    }
    /**
     * 8051/STM32 最小系统电源+复位+去耦；prefix 隔离多 MCU 信号网。
     * rstNearPin2：复位电阻右侧(pin2)接 RST、左侧(pin1)接 VCC（电阻在 MCU 左脚外侧时）。
     */
    static mcuCore(doc: SchematicDocument, mcu: ComponentInstance, vcc: ComponentInstance, gnd: ComponentInstance, rRst: ComponentInstance, cDec: ComponentInstance, vccPin: string, gndPin: string, rstPin: string, prefix: string = '', rstNearPin2: boolean = false): void {
        const rstRPin = rstNearPin2 ? '2' : '1';
        const vccRPin = rstNearPin2 ? '1' : '2';
        const nrstName = `${prefix}NRST`;
        const nrstNetId = TemplateSchematicKit.join(doc, nrstName, NetType.SIGNAL, [
            { comp: rRst, pinId: rstRPin, pinName: rstRPin },
            { comp: mcu, pinId: rstPin, pinName: rstPin }
        ]);
        // Named label survives WireNetTopology rename (NET_N) via applyNetLabelConnectivity
        if (nrstNetId.length > 0 && !doc.netLabels.some(l => l.text === nrstName)) {
            const rstPos = TemplateSchematicKit.pinWorld(mcu, rstPin, rstPin);
            TemplateSchematicKit.netLabel(doc, nrstNetId, nrstName, { x: rstPos.x - 24, y: rstPos.y - 10 });
        }
        TemplateSchematicKit.powerRails(doc, { comp: vcc, pinId: '1', pinName: 'VCC' }, { comp: gnd, pinId: '1', pinName: 'GND' }, [
            { comp: mcu, pinId: vccPin, pinName: vccPin },
            { comp: rRst, pinId: vccRPin, pinName: vccRPin },
            { comp: cDec, pinId: '1', pinName: '1' }
        ], [
            { comp: mcu, pinId: gndPin, pinName: gndPin },
            { comp: cDec, pinId: '2', pinName: '2' }
        ]);
    }
    /**
     * 晶振 + 负载电容。以晶振脚为 hub 分段连接；gnd 可选作下地星心。
     * 布局约定：c1/c2 分列晶振左右同 y。
     */
    static crystal(doc: SchematicDocument, mcu: ComponentInstance, xtal: ComponentInstance, c1: ComponentInstance, c2: ComponentInstance, inPin: string, outPin: string, prefix: string = '', gnd: ComponentInstance | null = null): void {
        TemplateSchematicKit.join(doc, `${prefix}XTAL1`, NetType.SIGNAL, [
            { comp: xtal, pinId: '1', pinName: '1' },
            { comp: mcu, pinId: inPin, pinName: inPin }
        ]);
        TemplateSchematicKit.join(doc, `${prefix}XTAL1`, NetType.SIGNAL, [
            { comp: xtal, pinId: '1', pinName: '1' },
            { comp: c1, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.join(doc, `${prefix}XTAL2`, NetType.SIGNAL, [
            { comp: xtal, pinId: '2', pinName: '2' },
            { comp: mcu, pinId: outPin, pinName: outPin }
        ]);
        TemplateSchematicKit.join(doc, `${prefix}XTAL2`, NetType.SIGNAL, [
            { comp: xtal, pinId: '2', pinName: '2' },
            { comp: c2, pinId: '1', pinName: '1' }
        ]);
        // 负载电容接地用 stub+标号，避免 GND 母线横穿电容把 OSC 端并地
        if (gnd !== null) {
            TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
                { comp: gnd, pinId: '1', pinName: 'GND' }
            ]);
        }
        TemplateSchematicKit.stubLabel(doc, { comp: c1, pinId: '2', pinName: '2' }, 'GND', NetType.GROUND);
        TemplateSchematicKit.stubLabel(doc, { comp: c2, pinId: '2', pinName: '2' }, 'GND', NetType.GROUND);
    }
    /** Stub 避让用的常见脚列表（不必完备，覆盖无源/仪器即可） */
    private static commonPinIds(libraryId: string): string[] {
        if (libraryId === 'VCC') {
            return ['1', 'VCC'];
        }
        if (libraryId === 'GND') {
            return ['1', 'GND'];
        }
        if (libraryId === 'AMMETER_DC') {
            return ['I+', 'I-'];
        }
        if (libraryId === 'VOLTMETER_DC' || libraryId === 'VIRTUAL_METER') {
            return ['V+', 'COM'];
        }
        if (libraryId === 'VAC') {
            return ['1', '2'];
        }
        if (libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
            libraryId.startsWith('L_') || libraryId.startsWith('FUSE_') ||
            libraryId.startsWith('XTAL_')) {
            return ['1', '2'];
        }
        return ['1', '2'];
    }
    static pinOffset(libraryId: string, pinId: string, _pinName: string): Point2D {
        // 与 BuiltinComponents.makeRelaySpdt 对齐：线圈上排 + 触点下排
        if (libraryId === 'RELAY_SPDT') {
            if (pinId === '1') {
                return { x: -30, y: -10 };
            }
            if (pinId === '2') {
                return { x: 30, y: -10 };
            }
            if (pinId === 'COM') {
                return { x: 0, y: 20 };
            }
            if (pinId === 'NO') {
                return { x: 20, y: 20 };
            }
            if (pinId === 'NC') {
                return { x: -20, y: 20 };
            }
            return { x: 0, y: 0 };
        }
        if (libraryId.startsWith('POT_')) {
            if (pinId === '1') {
                return { x: -30, y: 0 };
            }
            if (pinId === '2') {
                return { x: 30, y: 0 };
            }
            if (pinId === 'W') {
                return { x: 0, y: 28 };
            }
            return { x: 0, y: 0 };
        }
        if (libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
            libraryId.startsWith('XTAL_') || libraryId.startsWith('L_') ||
            libraryId.startsWith('FUSE_') || libraryId === 'DS18B20' ||
            libraryId === 'HALL_SENSOR' || libraryId === 'LDR' ||
            libraryId === 'BUZZER' ||
            libraryId === 'SW_PUSH') {
            return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
        }
        if (libraryId.startsWith('LED_') || libraryId === '1N4148' ||
            libraryId === '1N4007' || libraryId === '1N5819') {
            return pinId === 'A' ? { x: -30, y: 0 } : { x: 30, y: 0 };
        }
        if (libraryId === 'VCC') {
            return { x: 0, y: 10 };
        }
        if (libraryId === 'GND') {
            return { x: 0, y: -10 };
        }
        if (libraryId === 'VAC') {
            return pinId === '1' ? { x: -20, y: 0 } : { x: 20, y: 0 };
        }
        if (libraryId === 'UA741') {
            switch (pinId) {
                case 'IN+': return { x: -30, y: -10 };
                case 'IN-': return { x: -30, y: 10 };
                case 'OUT': return { x: 30, y: 0 };
                case 'VCC': return { x: 0, y: -40 };
                case 'VEE': return { x: 0, y: 40 };
                default: return { x: 0, y: 0 };
            }
        }
        if (libraryId === 'LM358' || libraryId === 'TL082') {
            switch (pinId) {
                case 'OUT1': return { x: 50, y: -30 };
                case 'IN-1': return { x: -50, y: -20 };
                case 'IN+1': return { x: -50, y: -40 };
                case 'V-': return { x: 0, y: 50 };
                case 'IN+2': return { x: -50, y: 20 };
                case 'IN-2': return { x: -50, y: 40 };
                case 'OUT2': return { x: 50, y: 30 };
                case 'V+': return { x: 0, y: -50 };
                default: return { x: 0, y: 0 };
            }
        }
        if (libraryId === 'LM7805' || libraryId === 'LM7812' ||
            libraryId === 'AMS1117_3V3') {
            // TO-220：IN 左 / GND 下 / OUT 右（与 BuiltinComponents.icRegulator 对齐）
            if (pinId === '1') {
                return { x: -40, y: 0 };
            }
            if (pinId === '2') {
                return { x: 0, y: 40 };
            }
            if (pinId === '3') {
                return { x: 40, y: 0 };
            }
            return { x: 0, y: 0 };
        }
        if (libraryId === 'LM2596') {
            return TemplateSchematicKit.genPinOffset(5, pinId, 40);
        }
        if (libraryId.startsWith('74HC')) {
            if (pinId === '14') {
                return { x: 0, y: -40 };
            }
            if (pinId === '7') {
                return { x: 0, y: 40 };
            }
            if (libraryId === '74HC04') {
                if (pinId === '1') {
                    return { x: -40, y: 0 };
                }
                if (pinId === '2') {
                    return { x: 40, y: 0 };
                }
            }
            else {
                if (pinId === '1') {
                    return { x: -40, y: -10 };
                }
                if (pinId === '2') {
                    return { x: -40, y: 10 };
                }
                if (pinId === '3') {
                    return { x: 40, y: 0 };
                }
            }
            return { x: 0, y: 0 };
        }
        if (libraryId === 'CD4017') {
            return TemplateSchematicKit.genPinOffset(16, pinId, 40);
        }
        if (libraryId === '2764' || libraryId === '62256') {
            return TemplateSchematicKit.genPinOffset(28, pinId, 40);
        }
        if (libraryId === '24C02' || libraryId === 'W25Q64') {
            return TemplateSchematicKit.genPinOffset(8, pinId, 40);
        }
        if (libraryId.startsWith('STM32')) {
            const pinCount = libraryId.includes('F407') ? 100 : 48;
            return TemplateSchematicKit.mcuPinOffset(pinCount, pinId);
        }
        if (libraryId === 'AT89C51' || libraryId === 'AT89C52' ||
            libraryId.startsWith('STC')) {
            return TemplateSchematicKit.mcuPinOffset(40, pinId);
        }
        if (libraryId === '2N2222' || libraryId === '2N2907') {
            if (pinId === 'B')
                return { x: -30, y: 0 };
            if (pinId === 'C')
                return { x: 30, y: -20 };
            if (pinId === 'E')
                return { x: 30, y: 20 };
            return { x: 0, y: 0 };
        }
        if (libraryId === '2N7000' || libraryId === 'IRF540') {
            if (pinId === 'G')
                return { x: -30, y: 0 };
            if (pinId === 'D')
                return { x: 30, y: -10 };
            if (pinId === 'S')
                return { x: 30, y: 10 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'VOLTMETER_DC' || libraryId === 'VIRTUAL_METER') {
            if (pinId === 'V+' || pinId === 'V')
                return { x: -30, y: -25 };
            if (pinId === 'COM')
                return { x: -30, y: 25 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'AMMETER_DC') {
            if (pinId === 'I+')
                return { x: -30, y: 0 };
            if (pinId === 'I-')
                return { x: -30, y: 20 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'FREQ_COUNTER') {
            if (pinId === 'IN')
                return { x: -30, y: -10 };
            if (pinId === 'GND')
                return { x: -30, y: 10 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'OSCILLOSCOPE') {
            if (pinId === 'CH1')
                return { x: -40, y: -20 };
            if (pinId === 'CH2')
                return { x: -40, y: -10 };
            if (pinId === 'CH3')
                return { x: -40, y: 10 };
            if (pinId === 'CH4')
                return { x: -40, y: 20 };
            if (pinId === 'GND')
                return { x: 40, y: 40 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'LOGIC_ANALYZER') {
            const chNum = pinId.startsWith('CH') ? parseInt(pinId.substring(2)) : 0;
            if (chNum >= 1 && chNum <= 8)
                return { x: -40, y: -40 + (chNum - 1) * 10 };
            if (pinId === 'GND')
                return { x: -40, y: 40 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'POWER_METER') {
            if (pinId === 'V+')
                return { x: -40, y: -20 };
            if (pinId === 'V-')
                return { x: -40, y: 0 };
            if (pinId === 'I+')
                return { x: -40, y: 20 };
            if (pinId === 'I-')
                return { x: -40, y: 40 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'UART_TERMINAL') {
            if (pinId === 'TX')
                return { x: -40, y: -10 };
            if (pinId === 'RX')
                return { x: -40, y: 10 };
            if (pinId === 'GND')
                return { x: -40, y: 30 };
            return { x: 0, y: 0 };
        }
        if (libraryId === 'LCD1602') {
            return TemplateSchematicKit.genPinOffset(16, pinId, 40);
        }
        if (libraryId === 'OLED_12864') {
            switch (pinId) {
                case 'VCC': return { x: -30, y: -10 };
                case 'GND': return { x: -30, y: 10 };
                case 'SDA': return { x: 30, y: -10 };
                case 'SCL': return { x: 30, y: 10 };
                default: return { x: 0, y: 0 };
            }
        }
        const pinNum = parseInt(pinId);
        if (!isNaN(pinNum)) {
            return TemplateSchematicKit.genPinOffset(16, pinId, 40);
        }
        if (pinId.startsWith('P')) {
            const n = parseInt(pinId.substring(1));
            if (!isNaN(n)) {
                return TemplateSchematicKit.mcuPinOffset(48, pinId);
            }
        }
        return { x: 0, y: 0 };
    }
    private static genPinOffset(count: number, pinId: string, bodyX: number): Point2D {
        const pinNum = parseInt(pinId);
        const leftCount = Math.ceil(count / 2);
        const rightCount = Math.floor(count / 2);
        const bodyHalf = Math.max(leftCount, rightCount) * 10 / 2;
        const idx = pinNum - 1;
        if (idx < leftCount) {
            return { x: -bodyX, y: idx * 10 - bodyHalf };
        }
        const rightIdx = idx - leftCount;
        return { x: bodyX, y: rightIdx * 10 - bodyHalf };
    }
    private static mcuPinOffset(count: number, pinId: string): Point2D {
        const n = parseInt(pinId.substring(1));
        const leftCount = Math.ceil(count / 2);
        const rightCount = Math.floor(count / 2);
        const bodyHalf = Math.max(leftCount, rightCount) * 10 / 2;
        const idx = n - 1;
        if (idx < leftCount) {
            return { x: -50, y: idx * 10 - bodyHalf };
        }
        const rightIdx = idx - leftCount;
        return { x: 50, y: rightIdx * 10 - bodyHalf };
    }
}
