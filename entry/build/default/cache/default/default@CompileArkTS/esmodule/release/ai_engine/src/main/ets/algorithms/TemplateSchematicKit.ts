import { NetType, WireStyle, IdUtil, emptyStringMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface PinSpec {
    comp: ComponentInstance;
    pinId: string;
    pinName: string;
}
export class TemplateSchematicKit {
    static createDoc(q307: string, r307: string): SchematicDocument {
        const s307 = new Date().toISOString();
        return {
            id: IdUtil.generate('sch'),
            name: q307,
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: 'LabTemplate',
                createdAt: s307, modifiedAt: s307,
                description: r307,
                gridSize: 10, units: 'mm', undoLimit: 1000
            }
        };
    }
    static place(k307: SchematicDocument, l307: string, m307: string, n307: Point2D): ComponentInstance {
        const o307 = emptyStringMap();
        if (l307.startsWith('R_')) {
            o307.set('value', l307.substring(2));
            o307.set('power', '0.25W');
        }
        else if (l307.startsWith('C_')) {
            o307.set('value', l307.substring(2));
            o307.set('voltage', '50V');
        }
        else if (l307 === 'LM7805') {
            o307.set('output', '5V');
        }
        else if (l307 === 'LM7812') {
            o307.set('output', '12V');
        }
        else if (l307 === 'AMS1117_3V3') {
            o307.set('output', '3.3V');
        }
        else if (l307 === 'VCC') {
            o307.set('voltage', '5V');
        }
        const p307: ComponentInstance = {
            id: IdUtil.generate('comp'),
            libraryId: l307,
            refDes: m307,
            position: n307,
            rotation: 0,
            mirrored: false,
            parameters: o307
        };
        k307.components.push(p307);
        return p307;
    }
    static pinRef(h307: ComponentInstance, i307: string, j307: string): string {
        return `${h307.id}:${i307}:${j307}`;
    }
    static pinWorld(d307: ComponentInstance, e307: string, f307: string): Point2D {
        const g307 = TemplateSchematicKit.pinOffset(d307.libraryId, e307, f307);
        return { x: d307.position.x + g307.x, y: d307.position.y + g307.y };
    }
    static addNet(w306: SchematicDocument, x306: string, y306: NetType, z306: string[]): string {
        let a307 = w306.nets.find(c307 => c307.name === x306);
        if (a307 === undefined) {
            a307 = { id: IdUtil.generate('net'), name: x306, type: y306, pinIds: [] };
            w306.nets.push(a307);
        }
        for (let b307 = 0; b307 < z306.length; b307++) {
            if (!a307.pinIds.includes(z306[b307])) {
                a307.pinIds.push(z306[b307]);
            }
        }
        return a307.id;
    }
    static netId(s306: SchematicDocument, t306: string): string {
        const u306 = s306.nets.find(v306 => v306.name === t306);
        return u306 !== undefined ? u306.id : t306;
    }
    static addWire(n306: SchematicDocument, o306: string, ...p306: Point2D[]): void {
        const q306: Point2D[] = [];
        for (let r306 = 0; r306 < p306.length; r306++) {
            q306.push({ x: p306[r306].x, y: p306[r306].y });
        }
        n306.wires.push({
            id: IdUtil.generate('wire'),
            netId: o306,
            points: q306,
            style: WireStyle.ORTHOGONAL
        });
    }
    private static orthoPts(l306: Point2D, m306: Point2D): Point2D[] {
        if (l306.x === m306.x || l306.y === m306.y) {
            return [l306, m306];
        }
        return [l306, { x: m306.x, y: l306.y }, m306];
    }
    static join(z305: SchematicDocument, a306: string, b306: NetType, c306: PinSpec[]): string {
        const d306: string[] = [];
        for (let j306 = 0; j306 < c306.length; j306++) {
            const k306 = c306[j306];
            d306.push(TemplateSchematicKit.pinRef(k306.comp, k306.pinId, k306.pinName));
        }
        const e306 = TemplateSchematicKit.addNet(z305, a306, b306, d306);
        if (c306.length < 2) {
            return e306;
        }
        const f306 = TemplateSchematicKit.pinWorld(c306[0].comp, c306[0].pinId, c306[0].pinName);
        for (let g306 = 1; g306 < c306.length; g306++) {
            const h306 = TemplateSchematicKit.pinWorld(c306[g306].comp, c306[g306].pinId, c306[g306].pinName);
            const i306 = TemplateSchematicKit.orthoPts(f306, h306);
            if (i306.length === 2) {
                TemplateSchematicKit.addWire(z305, e306, i306[0], i306[1]);
            }
            else if (i306.length >= 3) {
                TemplateSchematicKit.addWire(z305, e306, i306[0], i306[1], i306[2]);
            }
        }
        return e306;
    }
    static series2(v305: SchematicDocument, w305: string, x305: PinSpec, y305: PinSpec): void {
        TemplateSchematicKit.join(v305, w305, NetType.SIGNAL, [x305, y305]);
    }
    static powerRails(m305: SchematicDocument, n305: PinSpec, o305: PinSpec, p305: PinSpec[], q305: PinSpec[]): void {
        const r305: PinSpec[] = [n305];
        for (let u305 = 0; u305 < p305.length; u305++) {
            r305.push(p305[u305]);
        }
        TemplateSchematicKit.join(m305, 'VCC', NetType.POWER, r305);
        const s305: PinSpec[] = [o305];
        for (let t305 = 0; t305 < q305.length; t305++) {
            s305.push(q305[t305]);
        }
        TemplateSchematicKit.join(m305, 'GND', NetType.GROUND, s305);
    }
    static ledBranch(d305: SchematicDocument, e305: PinSpec, f305: PinSpec, g305: ComponentInstance, h305: ComponentInstance, i305: string, j305: string | null = null): void {
        const k305 = j305 !== null ? j305 : `${i305}_R`;
        let l305 = NetType.SIGNAL;
        if (j305 === 'VCC') {
            l305 = NetType.POWER;
        }
        else if (j305 === 'GND') {
            l305 = NetType.GROUND;
        }
        TemplateSchematicKit.join(d305, k305, l305, [
            e305,
            { comp: g305, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.series2(d305, `${i305}_LED`, { comp: g305, pinId: '2', pinName: '2' }, { comp: h305, pinId: 'A', pinName: 'A' });
        TemplateSchematicKit.join(d305, 'GND', NetType.GROUND, [
            f305,
            { comp: h305, pinId: 'K', pinName: 'K' }
        ]);
    }
    static mcuCore(t304: SchematicDocument, u304: ComponentInstance, v304: ComponentInstance, w304: ComponentInstance, x304: ComponentInstance, y304: ComponentInstance, z304: string, a305: string, b305: string, c305: string = ''): void {
        TemplateSchematicKit.join(t304, `${c305}NRST`, NetType.SIGNAL, [
            { comp: u304, pinId: b305, pinName: b305 },
            { comp: x304, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.powerRails(t304, { comp: v304, pinId: '1', pinName: 'VCC' }, { comp: w304, pinId: '1', pinName: 'GND' }, [
            { comp: u304, pinId: z304, pinName: z304 },
            { comp: x304, pinId: '2', pinName: '2' },
            { comp: y304, pinId: '1', pinName: '1' }
        ], [
            { comp: u304, pinId: a305, pinName: a305 },
            { comp: y304, pinId: '2', pinName: '2' }
        ]);
    }
    static crystal(l304: SchematicDocument, m304: ComponentInstance, n304: ComponentInstance, o304: ComponentInstance, p304: ComponentInstance, q304: string, r304: string, s304: string = ''): void {
        TemplateSchematicKit.join(l304, `${s304}XTAL1`, NetType.SIGNAL, [
            { comp: m304, pinId: q304, pinName: q304 },
            { comp: n304, pinId: '1', pinName: '1' },
            { comp: o304, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.join(l304, `${s304}XTAL2`, NetType.SIGNAL, [
            { comp: m304, pinId: r304, pinName: r304 },
            { comp: n304, pinId: '2', pinName: '2' },
            { comp: p304, pinId: '1', pinName: '1' }
        ]);
        TemplateSchematicKit.join(l304, 'GND', NetType.GROUND, [
            { comp: o304, pinId: '2', pinName: '2' },
            { comp: p304, pinId: '2', pinName: '2' }
        ]);
    }
    static pinOffset(e304: string, f304: string, g304: string): Point2D {
        if (e304.startsWith('R_') || e304.startsWith('C_') ||
            e304.startsWith('XTAL_') || e304.startsWith('L_') ||
            e304.startsWith('FUSE_') || e304 === 'DS18B20' ||
            e304 === 'HALL_SENSOR' || e304 === 'LDR' ||
            e304 === 'BUZZER' || e304 === 'RELAY_SPDT' ||
            e304 === 'SW_PUSH') {
            return f304 === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
        }
        if (e304.startsWith('LED_') || e304 === '1N4148' ||
            e304 === '1N4007' || e304 === '1N5819') {
            return f304 === 'A' ? { x: -30, y: 0 } : { x: 30, y: 0 };
        }
        if (e304 === 'VCC') {
            return { x: 0, y: 10 };
        }
        if (e304 === 'GND') {
            return { x: 0, y: -10 };
        }
        if (e304 === 'VAC') {
            return f304 === '1' ? { x: -20, y: 0 } : { x: 20, y: 0 };
        }
        if (e304 === 'UA741') {
            switch (f304) {
                case 'IN+': return { x: -30, y: -10 };
                case 'IN-': return { x: -30, y: 10 };
                case 'OUT': return { x: 30, y: 0 };
                case 'VCC': return { x: 0, y: -40 };
                case 'VEE': return { x: 0, y: 40 };
                default: return { x: 0, y: 0 };
            }
        }
        if (e304 === 'LM358' || e304 === 'TL082') {
            switch (f304) {
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
        if (e304 === 'LM7805' || e304 === 'LM7812' ||
            e304 === 'AMS1117_3V3') {
            if (f304 === '1') {
                return { x: -40, y: 0 };
            }
            if (f304 === '2') {
                return { x: 0, y: 40 };
            }
            if (f304 === '3') {
                return { x: 40, y: 0 };
            }
            return { x: 0, y: 0 };
        }
        if (e304 === 'LM2596') {
            return TemplateSchematicKit.genPinOffset(5, f304, 40);
        }
        if (e304.startsWith('74HC')) {
            if (f304 === '14') {
                return { x: 0, y: -40 };
            }
            if (f304 === '7') {
                return { x: 0, y: 40 };
            }
            if (e304 === '74HC04') {
                if (f304 === '1') {
                    return { x: -40, y: 0 };
                }
                if (f304 === '2') {
                    return { x: 40, y: 0 };
                }
            }
            else {
                if (f304 === '1') {
                    return { x: -40, y: -10 };
                }
                if (f304 === '2') {
                    return { x: -40, y: 10 };
                }
                if (f304 === '3') {
                    return { x: 40, y: 0 };
                }
            }
            return { x: 0, y: 0 };
        }
        if (e304 === 'CD4017') {
            return TemplateSchematicKit.genPinOffset(16, f304, 40);
        }
        if (e304 === '2764' || e304 === '62256') {
            return TemplateSchematicKit.genPinOffset(28, f304, 40);
        }
        if (e304 === '24C02' || e304 === 'W25Q64') {
            return TemplateSchematicKit.genPinOffset(8, f304, 40);
        }
        if (e304.startsWith('STM32')) {
            const k304 = e304.includes('F407') ? 100 : 48;
            return TemplateSchematicKit.mcuPinOffset(k304, f304);
        }
        if (e304 === 'AT89C51' || e304 === 'AT89C52' ||
            e304.startsWith('STC')) {
            return TemplateSchematicKit.mcuPinOffset(40, f304);
        }
        if (e304 === '2N2222' || e304 === '2N2907') {
            if (f304 === 'B')
                return { x: -30, y: 0 };
            if (f304 === 'C')
                return { x: 30, y: -20 };
            if (f304 === 'E')
                return { x: 30, y: 20 };
            return { x: 0, y: 0 };
        }
        if (e304 === '2N7000' || e304 === 'IRF540') {
            if (f304 === 'G')
                return { x: -30, y: 0 };
            if (f304 === 'D')
                return { x: 30, y: -10 };
            if (f304 === 'S')
                return { x: 30, y: 10 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'VOLTMETER_DC' || e304 === 'VIRTUAL_METER') {
            if (f304 === 'V+' || f304 === 'V')
                return { x: -30, y: -10 };
            if (f304 === 'COM')
                return { x: -30, y: 10 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'AMMETER_DC') {
            if (f304 === 'I+')
                return { x: -30, y: 0 };
            if (f304 === 'I-')
                return { x: -30, y: 20 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'FREQ_COUNTER') {
            if (f304 === 'IN')
                return { x: -30, y: -10 };
            if (f304 === 'GND')
                return { x: -30, y: 10 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'OSCILLOSCOPE') {
            if (f304 === 'CH1')
                return { x: -40, y: -20 };
            if (f304 === 'CH2')
                return { x: -40, y: -10 };
            if (f304 === 'CH3')
                return { x: -40, y: 10 };
            if (f304 === 'CH4')
                return { x: -40, y: 20 };
            if (f304 === 'GND')
                return { x: -40, y: 40 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'LOGIC_ANALYZER') {
            const j304 = f304.startsWith('CH') ? parseInt(f304.substring(2)) : 0;
            if (j304 >= 1 && j304 <= 8)
                return { x: -40, y: -40 + (j304 - 1) * 10 };
            if (f304 === 'GND')
                return { x: -40, y: 40 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'POWER_METER') {
            if (f304 === 'V+')
                return { x: -40, y: -20 };
            if (f304 === 'V-')
                return { x: -40, y: 0 };
            if (f304 === 'I+')
                return { x: -40, y: 20 };
            if (f304 === 'I-')
                return { x: -40, y: 40 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'UART_TERMINAL') {
            if (f304 === 'TX')
                return { x: -40, y: -10 };
            if (f304 === 'RX')
                return { x: -40, y: 10 };
            if (f304 === 'GND')
                return { x: -40, y: 30 };
            return { x: 0, y: 0 };
        }
        if (e304 === 'LCD1602') {
            return TemplateSchematicKit.genPinOffset(16, f304, 40);
        }
        if (e304 === 'OLED_12864') {
            switch (f304) {
                case 'VCC': return { x: -30, y: -10 };
                case 'GND': return { x: -30, y: 10 };
                case 'SDA': return { x: 30, y: -10 };
                case 'SCL': return { x: 30, y: 10 };
                default: return { x: 0, y: 0 };
            }
        }
        const h304 = parseInt(f304);
        if (!isNaN(h304)) {
            return TemplateSchematicKit.genPinOffset(16, f304, 40);
        }
        if (f304.startsWith('P')) {
            const i304 = parseInt(f304.substring(1));
            if (!isNaN(i304)) {
                return TemplateSchematicKit.mcuPinOffset(48, f304);
            }
        }
        return { x: 0, y: 0 };
    }
    private static genPinOffset(v303: number, w303: string, x303: number): Point2D {
        const y303 = parseInt(w303);
        const z303 = Math.ceil(v303 / 2);
        const a304 = Math.floor(v303 / 2);
        const b304 = Math.max(z303, a304) * 10 / 2;
        const c304 = y303 - 1;
        if (c304 < z303) {
            return { x: -x303, y: c304 * 10 - b304 };
        }
        const d304 = c304 - z303;
        return { x: x303, y: d304 * 10 - b304 };
    }
    private static mcuPinOffset(n303: number, o303: string): Point2D {
        const p303 = parseInt(o303.substring(1));
        const q303 = Math.ceil(n303 / 2);
        const r303 = Math.floor(n303 / 2);
        const s303 = Math.max(q303, r303) * 10 / 2;
        const t303 = p303 - 1;
        if (t303 < q303) {
            return { x: -50, y: t303 * 10 - s303 };
        }
        const u303 = t303 - q303;
        return { x: 50, y: u303 * 10 - s303 };
    }
}
