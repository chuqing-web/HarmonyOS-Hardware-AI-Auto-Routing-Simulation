import { SvgSymbolCache } from "@bundle:com.elecdraw.aischsim/entry@component_library/Index";
import type { ComponentDefinition, DrawCommand } from "@bundle:com.elecdraw.aischsim/entry@component_library/Index";
import { PinType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Pin, Point2D, Rotation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { calcSymbolBounds, resolveSymbolKey } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SymbolBounds } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
export interface SymbolDrawStyle {
    strokeColor: string;
    fillColor: string;
    lineWidth: number;
    selected: boolean;
    hovered: boolean;
    ledDisplayColor?: string;
}
export class SchematicSymbolRenderer {
    static drawComponent(v245: CanvasRenderingContext2D, w245: number, x245: number, y245: ComponentDefinition, z245: string, a246: Rotation, b246: boolean, c246: SymbolDrawStyle): SymbolBounds {
        v245.save();
        v245.translate(w245, x245);
        if (a246 !== 0) {
            v245.rotate(a246 * Math.PI / 180);
        }
        if (b246) {
            v245.scale(-1, 1);
        }
        const d246 = resolveSymbolKey(y245.id, y245.svgSymbol, y245.behaviorModel);
        SchematicSymbolRenderer.drawSymbolBody(v245, d246, y245, c246.ledDisplayColor ?? '');
        SchematicSymbolRenderer.drawPins(v245, y245.pins, c246.strokeColor);
        SchematicSymbolRenderer.drawLabels(v245, y245, z245, c246);
        if (c246.hovered && !c246.selected) {
            const e246 = 14;
            const f246 = calcSymbolBounds(y245.pins, e246);
            v245.fillStyle = 'rgba(0, 170, 255, 0.12)';
            v245.fillRect(f246.minX, f246.minY, f246.width, f246.height);
            v245.strokeStyle = ProteusColors.HOVER_PREVIEW;
            v245.lineWidth = 1.5;
            v245.setLineDash([4, 4]);
            v245.strokeRect(f246.minX, f246.minY, f246.width, f246.height);
            v245.setLineDash([]);
        }
        v245.restore();
        return calcSymbolBounds(y245.pins, 8);
    }
    static drawGhost(l245: CanvasRenderingContext2D, m245: number, n245: number, o245: ComponentDefinition): void {
        l245.save();
        l245.translate(m245, n245);
        l245.globalAlpha = 0.55;
        const p245 = calcSymbolBounds(o245.pins, 0);
        if (o245.pins.length > 0 && (p245.width >= 50 || p245.height >= 40)) {
            const r245 = (p245.minX + p245.maxX) / 2;
            const s245 = (p245.minY + p245.maxY) / 2;
            const t245 = Math.max(p245.width, 12);
            const u245 = Math.max(p245.height, 12);
            l245.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
            l245.fillRect(r245 - t245 / 2, s245 - u245 / 2, t245, u245);
            l245.strokeStyle = ProteusColors.COMPONENT_STROKE;
            l245.lineWidth = 2;
            l245.strokeRect(r245 - t245 / 2, s245 - u245 / 2, t245, u245);
        }
        const q245 = resolveSymbolKey(o245.id, o245.svgSymbol, o245.behaviorModel);
        SchematicSymbolRenderer.drawSymbolBody(l245, q245, o245);
        SchematicSymbolRenderer.drawPins(l245, o245.pins, ProteusColors.HOVER_PREVIEW);
        l245.restore();
    }
    private static drawSymbolBody(e245: CanvasRenderingContext2D, f245: string, g245: ComponentDefinition, h245: string = ''): void {
        e245.strokeStyle = ProteusColors.COMPONENT_STROKE;
        e245.fillStyle = ProteusColors.CANVAS_BG;
        e245.lineWidth = 1.2;
        e245.lineCap = 'round';
        e245.lineJoin = 'round';
        const i245 = f245 === 'counter' || f245 === 'mcu_8051' || f245 === 'mcu_stm32' ||
            f245 === 'memory' || f245 === 'generic_ic';
        if (i245) {
            SchematicSymbolRenderer.drawIcBody(e245, g245.pins, g245.name);
        }
        const j245 = f245 === 'led' || f245 === 'diode';
        if (!j245 && g245.svgSymbol.length > 20 && g245.svgSymbol.indexOf('<') >= 0) {
            const k245 = SvgSymbolCache.preload(g245.id, g245.svgSymbol);
            if (k245.length > 0) {
                SchematicSymbolRenderer.drawSvgCommands(e245, k245);
                return;
            }
        }
        switch (f245) {
            case 'resistor':
                SchematicSymbolRenderer.drawResistor(e245);
                break;
            case 'capacitor':
                SchematicSymbolRenderer.drawCapacitor(e245);
                break;
            case 'inductor':
                SchematicSymbolRenderer.drawInductor(e245);
                break;
            case 'crystal':
                SchematicSymbolRenderer.drawCrystal(e245);
                break;
            case 'fuse':
                SchematicSymbolRenderer.drawFuse(e245);
                break;
            case 'diode':
                SchematicSymbolRenderer.drawDiode(e245, false, '');
                break;
            case 'led':
                SchematicSymbolRenderer.drawDiode(e245, true, h245);
                break;
            case 'transistor':
                SchematicSymbolRenderer.drawTransistor(e245);
                break;
            case 'mosfet':
                SchematicSymbolRenderer.drawMosfet(e245);
                break;
            case 'opamp':
                SchematicSymbolRenderer.drawOpAmp(e245);
                break;
            case 'regulator':
                SchematicSymbolRenderer.drawRegulator(e245);
                break;
            case 'gate_not':
                SchematicSymbolRenderer.drawGateNot(e245);
                break;
            case 'gate_and':
            case 'gate_nand':
                SchematicSymbolRenderer.drawGateAnd(e245, f245 === 'gate_nand');
                break;
            case 'gate_or':
            case 'gate_nor':
                SchematicSymbolRenderer.drawGateOr(e245, f245 === 'gate_nor');
                break;
            case 'gate_xor':
                SchematicSymbolRenderer.drawGateXor(e245);
                break;
            case 'oscilloscope':
                SchematicSymbolRenderer.drawOscilloscope(e245);
                break;
            case 'multimeter':
                SchematicSymbolRenderer.drawMultimeter(e245);
                break;
            case 'logic_analyzer':
                SchematicSymbolRenderer.drawLogicAnalyzer(e245);
                break;
            case 'uart_terminal':
                SchematicSymbolRenderer.drawUartTerminal(e245);
                break;
            case 'voltmeter':
                SchematicSymbolRenderer.drawVoltmeter(e245);
                break;
            case 'ammeter':
                SchematicSymbolRenderer.drawAmmeter(e245);
                break;
            case 'power_meter':
                SchematicSymbolRenderer.drawPowerMeter(e245);
                break;
            case 'freq_counter':
                SchematicSymbolRenderer.drawFreqCounter(e245);
                break;
            case 'lcd':
                SchematicSymbolRenderer.drawLcd(e245);
                break;
            case 'oled':
                SchematicSymbolRenderer.drawOled(e245);
                break;
            case 'switch':
                SchematicSymbolRenderer.drawSwitch(e245);
                break;
            case 'relay':
                SchematicSymbolRenderer.drawRelay(e245);
                break;
            case 'buzzer':
                SchematicSymbolRenderer.drawBuzzer(e245);
                break;
            case 'sensor':
                SchematicSymbolRenderer.drawSensor(e245);
                break;
            case 'counter':
            case 'mcu_8051':
            case 'mcu_stm32':
            case 'memory':
                break;
            case 'vcc':
                SchematicSymbolRenderer.drawVcc(e245);
                break;
            case 'gnd':
                SchematicSymbolRenderer.drawGnd(e245);
                break;
            default:
                if (!i245) {
                    SchematicSymbolRenderer.drawIcBody(e245, g245.pins, g245.name);
                }
                break;
        }
    }
    private static drawResistor(d245: CanvasRenderingContext2D): void {
        d245.beginPath();
        d245.moveTo(-30, 0);
        d245.lineTo(-22, 0);
        d245.lineTo(-18, -6);
        d245.lineTo(-10, 6);
        d245.lineTo(-2, -6);
        d245.lineTo(6, 6);
        d245.lineTo(14, -6);
        d245.lineTo(22, 0);
        d245.lineTo(30, 0);
        d245.stroke();
    }
    private static drawCapacitor(c245: CanvasRenderingContext2D): void {
        c245.beginPath();
        c245.moveTo(-30, 0);
        c245.lineTo(-4, 0);
        c245.stroke();
        c245.beginPath();
        c245.moveTo(4, 0);
        c245.lineTo(30, 0);
        c245.stroke();
        c245.beginPath();
        c245.moveTo(-4, -10);
        c245.lineTo(-4, 10);
        c245.stroke();
        c245.beginPath();
        c245.moveTo(4, -10);
        c245.lineTo(4, 10);
        c245.stroke();
    }
    private static drawInductor(z244: CanvasRenderingContext2D): void {
        z244.beginPath();
        z244.moveTo(-30, 0);
        z244.lineTo(-22, 0);
        z244.stroke();
        for (let a245 = 0; a245 < 4; a245++) {
            const b245 = -18 + a245 * 10;
            z244.beginPath();
            z244.arc(b245, 0, 5, Math.PI, 0, false);
            z244.stroke();
        }
        z244.beginPath();
        z244.moveTo(22, 0);
        z244.lineTo(30, 0);
        z244.stroke();
    }
    private static drawCrystal(y244: CanvasRenderingContext2D): void {
        y244.strokeRect(-12, -8, 24, 16);
        y244.beginPath();
        y244.moveTo(-30, 0);
        y244.lineTo(-12, 0);
        y244.stroke();
        y244.beginPath();
        y244.moveTo(12, 0);
        y244.lineTo(30, 0);
        y244.stroke();
    }
    private static drawFuse(x244: CanvasRenderingContext2D): void {
        x244.strokeRect(-15, -5, 30, 10);
        x244.beginPath();
        x244.moveTo(-30, 0);
        x244.lineTo(-15, 0);
        x244.stroke();
        x244.beginPath();
        x244.moveTo(15, 0);
        x244.lineTo(30, 0);
        x244.stroke();
    }
    private static diodeColorMap: Map<string, string> = new Map([
        ['red', '#E53935'],
        ['green', '#43A047'],
        ['blue', '#1E88E5'],
        ['yellow', '#FDD835'],
        ['orange', '#FB8C00'],
        ['white', '#E0E0E0'],
        ['amber', '#FFB300'],
        ['cyan', '#00ACC1'],
        ['purple', '#8E24AA'],
        ['pink', '#D81B60'],
    ]);
    private static drawDiode(s244: CanvasRenderingContext2D, t244: boolean, u244: string): void {
        s244.beginPath();
        s244.moveTo(-30, 0);
        s244.lineTo(-8, 0);
        s244.stroke();
        s244.beginPath();
        s244.moveTo(8, 0);
        s244.lineTo(30, 0);
        s244.stroke();
        s244.beginPath();
        s244.moveTo(-8, -10);
        s244.lineTo(-8, 10);
        s244.lineTo(8, 0);
        s244.closePath();
        if (t244 && u244.length > 0) {
            const w244 = SchematicSymbolRenderer.diodeColorMap.get(u244) ?? '#E53935';
            s244.save();
            s244.globalAlpha = 0.30;
            s244.fillStyle = w244;
            s244.fill();
            s244.globalAlpha = 1;
            s244.stroke();
            s244.restore();
        }
        else {
            s244.stroke();
        }
        s244.beginPath();
        s244.moveTo(8, -10);
        s244.lineTo(8, 10);
        s244.stroke();
        if (t244 && u244.length > 0) {
            const v244 = SchematicSymbolRenderer.diodeColorMap.get(u244) ?? '#E53935';
            s244.strokeStyle = v244;
            s244.lineWidth = 1.5;
            s244.beginPath();
            s244.moveTo(10, -12);
            s244.lineTo(18, -20);
            s244.stroke();
            s244.beginPath();
            s244.moveTo(10, -8);
            s244.lineTo(18, -16);
            s244.stroke();
            s244.beginPath();
            s244.moveTo(13, -5);
            s244.lineTo(21, -11);
            s244.stroke();
            s244.strokeStyle = ProteusColors.COMPONENT_STROKE;
            s244.lineWidth = 1.2;
        }
    }
    private static drawTransistor(r244: CanvasRenderingContext2D): void {
        r244.beginPath();
        r244.arc(0, 0, 14, 0, Math.PI * 2);
        r244.stroke();
        r244.beginPath();
        r244.moveTo(-30, 0);
        r244.lineTo(-8, 0);
        r244.stroke();
        r244.beginPath();
        r244.moveTo(8, -10);
        r244.lineTo(30, -18);
        r244.stroke();
        r244.beginPath();
        r244.moveTo(8, 10);
        r244.lineTo(30, 18);
        r244.stroke();
        r244.beginPath();
        r244.moveTo(0, -6);
        r244.lineTo(8, -10);
        r244.stroke();
        r244.beginPath();
        r244.moveTo(0, 6);
        r244.lineTo(8, 10);
        r244.stroke();
    }
    private static drawMosfet(q244: CanvasRenderingContext2D): void {
        q244.beginPath();
        q244.moveTo(-30, 0);
        q244.lineTo(-10, 0);
        q244.stroke();
        q244.beginPath();
        q244.moveTo(-10, -14);
        q244.lineTo(-10, 14);
        q244.stroke();
        q244.beginPath();
        q244.moveTo(-6, -10);
        q244.lineTo(20, -10);
        q244.lineTo(20, -18);
        q244.stroke();
        q244.beginPath();
        q244.moveTo(-6, 10);
        q244.lineTo(20, 10);
        q244.stroke();
        q244.beginPath();
        q244.moveTo(20, -10);
        q244.lineTo(30, -10);
        q244.stroke();
        q244.beginPath();
        q244.moveTo(20, 10);
        q244.lineTo(30, 10);
        q244.stroke();
    }
    private static drawOpAmp(p244: CanvasRenderingContext2D): void {
        p244.beginPath();
        p244.moveTo(-20, -30);
        p244.lineTo(20, 0);
        p244.lineTo(-20, 30);
        p244.closePath();
        p244.stroke();
        p244.fillText('+', -14, -8);
        p244.fillText('−', -14, 12);
    }
    private static drawRegulator(o244: CanvasRenderingContext2D): void {
        o244.strokeRect(-25, -20, 50, 40);
        o244.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        o244.fillStyle = ProteusColors.TEXT_LABEL;
        o244.fillText('REG', -12, 4);
    }
    private static drawGateNot(n244: CanvasRenderingContext2D): void {
        n244.beginPath();
        n244.moveTo(-20, -25);
        n244.lineTo(10, 0);
        n244.lineTo(-20, 25);
        n244.closePath();
        n244.stroke();
        n244.beginPath();
        n244.arc(14, 0, 4, 0, Math.PI * 2);
        n244.stroke();
    }
    private static drawGateAnd(l244: CanvasRenderingContext2D, m244: boolean): void {
        l244.beginPath();
        l244.moveTo(-20, -25);
        l244.lineTo(0, -25);
        l244.arc(0, 0, 25, -Math.PI / 2, Math.PI / 2, false);
        l244.lineTo(-20, 25);
        l244.closePath();
        l244.stroke();
        if (m244) {
            l244.beginPath();
            l244.arc(28, 0, 4, 0, Math.PI * 2);
            l244.stroke();
        }
    }
    private static drawGateOr(j244: CanvasRenderingContext2D, k244: boolean): void {
        j244.beginPath();
        j244.moveTo(-20, -25);
        j244.quadraticCurveTo(-5, 0, -20, 25);
        j244.quadraticCurveTo(15, 25, 28, 0);
        j244.quadraticCurveTo(15, -25, -20, -25);
        j244.stroke();
        if (k244) {
            j244.beginPath();
            j244.arc(32, 0, 4, 0, Math.PI * 2);
            j244.stroke();
        }
    }
    private static drawGateXor(i244: CanvasRenderingContext2D): void {
        SchematicSymbolRenderer.drawGateOr(i244, false);
        i244.beginPath();
        i244.moveTo(-24, -25);
        i244.quadraticCurveTo(-9, 0, -24, 25);
        i244.stroke();
    }
    private static drawOscilloscope(d244: CanvasRenderingContext2D): void {
        const e244 = 70;
        const f244 = 80;
        d244.strokeRect(-e244 / 2, -f244 / 2, e244, f244);
        d244.fillStyle = '#1a1a2e';
        d244.fillRect(-e244 / 2 + 4, -f244 / 2 + 4, e244 - 8, f244 - 20);
        d244.strokeStyle = '#2a2a3e';
        d244.lineWidth = 0.5;
        for (let h244 = -e244 / 2 + 10; h244 < e244 / 2 - 4; h244 += 8) {
            d244.beginPath();
            d244.moveTo(h244, -f244 / 2 + 4);
            d244.lineTo(h244, f244 / 2 - 16);
            d244.stroke();
        }
        for (let g244 = -f244 / 2 + 8; g244 < f244 / 2 - 16; g244 += 7) {
            d244.beginPath();
            d244.moveTo(-e244 / 2 + 4, g244);
            d244.lineTo(e244 / 2 - 4, g244);
            d244.stroke();
        }
        d244.strokeStyle = '#00FF88';
        d244.lineWidth = 1.2;
        d244.beginPath();
        d244.moveTo(-e244 / 2 + 6, 0);
        d244.lineTo(-16, -4);
        d244.lineTo(-6, 6);
        d244.lineTo(4, -8);
        d244.lineTo(14, 4);
        d244.lineTo(24, -2);
        d244.lineTo(e244 / 2 - 6, 3);
        d244.stroke();
        d244.fillStyle = '#00FF88';
        d244.font = '8px monospace';
        d244.fillText('CH1', -e244 / 2 + 8, f244 / 2 - 6);
        d244.strokeStyle = ProteusColors.COMPONENT_STROKE;
        d244.lineWidth = 1.2;
        d244.fillStyle = ProteusColors.TEXT_LABEL;
        d244.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        d244.fillText('SCOPE', -16, -f244 / 2 - 4);
    }
    private static drawMultimeter(z243: CanvasRenderingContext2D): void {
        const a244 = 54;
        const b244 = 64;
        z243.strokeRect(-a244 / 2, -b244 / 2, a244, b244);
        z243.fillStyle = '#C8E6C0';
        z243.fillRect(-a244 / 2 + 6, -b244 / 2 + 6, a244 - 12, 16);
        z243.strokeStyle = '#666';
        z243.lineWidth = 0.5;
        z243.strokeRect(-a244 / 2 + 6, -b244 / 2 + 6, a244 - 12, 16);
        z243.fillStyle = '#333';
        z243.font = 'bold 14px monospace';
        z243.fillText('3.297', -18, -b244 / 2 + 19);
        z243.font = '7px monospace';
        z243.fillText('DCV', -7, -b244 / 2 + 25);
        const c244 = b244 / 2 - 14;
        z243.strokeStyle = ProteusColors.COMPONENT_STROKE;
        z243.lineWidth = 1.2;
        z243.beginPath();
        z243.arc(0, c244, 10, 0, Math.PI * 2);
        z243.stroke();
        z243.beginPath();
        z243.moveTo(0, c244);
        z243.lineTo(6, c244 - 6);
        z243.stroke();
        z243.fillStyle = ProteusColors.TEXT_LABEL;
        z243.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        z243.fillText('DMM', -12, -b244 / 2 - 4);
    }
    private static drawLogicAnalyzer(q243: CanvasRenderingContext2D): void {
        const r243 = 64;
        const s243 = 100;
        q243.strokeRect(-r243 / 2, -s243 / 2, r243, s243);
        q243.fillStyle = '#1a1a2e';
        q243.fillRect(-r243 / 2 + 4, -s243 / 2 + 6, r243 - 8, s243 - 24);
        const t243 = ['#00FF88', '#FF6644', '#44AAFF', '#FFCC00',
            '#FF44CC', '#44FFCC', '#CC88FF', '#88FF44'];
        for (let u243 = 0; u243 < 8; u243++) {
            const v243 = -s243 / 2 + 16 + u243 * 8;
            q243.strokeStyle = t243[u243];
            q243.lineWidth = 0.6;
            q243.beginPath();
            q243.moveTo(-r243 / 2 + 6, v243);
            const w243 = [0, 1, 1, 0, 0, 1, 0, 1];
            for (let x243 = 0; x243 < 8; x243++) {
                const y243 = -r243 / 2 + 8 + x243 * 6;
                q243.lineTo(y243, v243);
                q243.lineTo(y243, w243[(u243 + x243) % 8] === 1 ? v243 - 3 : v243 + 3);
                q243.lineTo(y243 + 3, w243[(u243 + x243) % 8] === 1 ? v243 - 3 : v243 + 3);
            }
            q243.stroke();
        }
        q243.strokeStyle = ProteusColors.COMPONENT_STROKE;
        q243.lineWidth = 1.2;
        q243.fillStyle = ProteusColors.TEXT_LABEL;
        q243.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        q243.fillText('LOGIC', -16, -s243 / 2 - 4);
    }
    private static drawUartTerminal(n243: CanvasRenderingContext2D): void {
        const o243 = 64;
        const p243 = 60;
        n243.strokeRect(-o243 / 2, -p243 / 2, o243, p243);
        n243.fillStyle = '#0a0a12';
        n243.fillRect(-o243 / 2 + 4, -p243 / 2 + 4, o243 - 8, p243 - 22);
        n243.strokeStyle = '#00AAFF';
        n243.lineWidth = 1;
        n243.beginPath();
        n243.moveTo(-o243 / 2 + 16, 4);
        n243.lineTo(-6, 4);
        n243.moveTo(-10, 0);
        n243.lineTo(-6, 4);
        n243.lineTo(-10, 8);
        n243.stroke();
        n243.fillStyle = '#00AAFF';
        n243.font = '7px monospace';
        n243.fillText('TX', -o243 / 2 + 8, 4);
        n243.strokeStyle = '#FF6644';
        n243.beginPath();
        n243.moveTo(o243 / 2 - 14, -2);
        n243.lineTo(6, -2);
        n243.moveTo(10, -6);
        n243.lineTo(6, -2);
        n243.lineTo(10, 2);
        n243.stroke();
        n243.fillStyle = '#FF6644';
        n243.fillText('RX', o243 / 2 - 22, -2);
        n243.strokeStyle = ProteusColors.COMPONENT_STROKE;
        n243.lineWidth = 1.2;
        n243.fillStyle = ProteusColors.TEXT_LABEL;
        n243.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        n243.fillText('UART', -14, -p243 / 2 - 4);
    }
    private static drawVoltmeter(g243: CanvasRenderingContext2D): void {
        const h243 = 18;
        g243.beginPath();
        g243.arc(0, 2, h243, Math.PI, 0);
        g243.lineTo(h243, 2 + h243);
        g243.arc(0, 2 + h243, h243, 0, Math.PI);
        g243.closePath();
        g243.stroke();
        g243.lineWidth = 0.6;
        g243.beginPath();
        g243.arc(0, 2, h243 - 3, Math.PI * 0.82, Math.PI * 0.18, true);
        g243.stroke();
        for (let i243 = Math.PI * 0.82; i243 >= Math.PI * 0.18; i243 -= 0.13) {
            const j243 = (h243 - 6) * Math.cos(i243);
            const k243 = 2 + (h243 - 6) * Math.sin(i243);
            const l243 = (h243 - 1.5) * Math.cos(i243);
            const m243 = 2 + (h243 - 1.5) * Math.sin(i243);
            g243.beginPath();
            g243.moveTo(j243, k243);
            g243.lineTo(l243, m243);
            g243.stroke();
        }
        g243.strokeStyle = '#CC0000';
        g243.lineWidth = 1;
        g243.beginPath();
        g243.moveTo(0, 2);
        g243.lineTo((h243 - 5) * Math.cos(Math.PI * 0.6), 2 + (h243 - 5) * Math.sin(Math.PI * 0.6));
        g243.stroke();
        g243.fillStyle = '#CC0000';
        g243.beginPath();
        g243.arc(0, 2, 1.2, 0, Math.PI * 2);
        g243.fill();
        g243.strokeStyle = ProteusColors.COMPONENT_STROKE;
        g243.lineWidth = 1;
        g243.fillStyle = ProteusColors.TEXT_PRIMARY;
        g243.font = 'bold 10px sans-serif';
        g243.fillText('V', -3, 6);
        g243.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        g243.fillStyle = ProteusColors.TEXT_LABEL;
        g243.fillText('VOLT', -12, -h243 - 6);
    }
    private static drawAmmeter(z242: CanvasRenderingContext2D): void {
        const a243 = 18;
        z242.beginPath();
        z242.arc(0, 2, a243, Math.PI, 0);
        z242.lineTo(a243, 2 + a243);
        z242.arc(0, 2 + a243, a243, 0, Math.PI);
        z242.closePath();
        z242.stroke();
        z242.lineWidth = 0.6;
        z242.beginPath();
        z242.arc(0, 2, a243 - 3, Math.PI * 0.82, Math.PI * 0.18, true);
        z242.stroke();
        for (let b243 = Math.PI * 0.82; b243 >= Math.PI * 0.18; b243 -= 0.13) {
            const c243 = (a243 - 6) * Math.cos(b243);
            const d243 = 2 + (a243 - 6) * Math.sin(b243);
            const e243 = (a243 - 1.5) * Math.cos(b243);
            const f243 = 2 + (a243 - 1.5) * Math.sin(b243);
            z242.beginPath();
            z242.moveTo(c243, d243);
            z242.lineTo(e243, f243);
            z242.stroke();
        }
        z242.strokeStyle = '#CC0000';
        z242.lineWidth = 1;
        z242.beginPath();
        z242.moveTo(0, 2);
        z242.lineTo((a243 - 5) * Math.cos(Math.PI * 0.45), 2 + (a243 - 5) * Math.sin(Math.PI * 0.45));
        z242.stroke();
        z242.fillStyle = '#CC0000';
        z242.beginPath();
        z242.arc(0, 2, 1.2, 0, Math.PI * 2);
        z242.fill();
        z242.strokeStyle = ProteusColors.COMPONENT_STROKE;
        z242.lineWidth = 1;
        z242.fillStyle = ProteusColors.TEXT_PRIMARY;
        z242.font = 'bold 10px sans-serif';
        z242.fillText('A', -3, 6);
        z242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        z242.fillStyle = ProteusColors.TEXT_LABEL;
        z242.fillText('AMP', -11, -a243 - 6);
    }
    private static drawPowerMeter(w242: CanvasRenderingContext2D): void {
        const x242 = 64;
        const y242 = 84;
        w242.strokeRect(-x242 / 2, -y242 / 2, x242, y242);
        w242.fillStyle = '#E8F5E9';
        w242.fillRect(-x242 / 2 + 5, -y242 / 2 + 5, x242 - 10, y242 - 34);
        w242.strokeStyle = '#999';
        w242.lineWidth = 0.5;
        w242.strokeRect(-x242 / 2 + 5, -y242 / 2 + 5, x242 - 10, y242 - 34);
        w242.fillStyle = '#333';
        w242.font = 'bold 11px monospace';
        w242.fillText('P=VI', -14, -y242 / 2 + 24);
        w242.font = '8px monospace';
        w242.fillText('3.30V', -20, -y242 / 2 + 38);
        w242.fillText('12.5mA', 2, -y242 / 2 + 38);
        w242.fillStyle = ProteusColors.TEXT_PRIMARY;
        w242.font = 'bold 13px monospace';
        w242.fillText('41.2', -12, -y242 / 2 + 52);
        w242.font = '8px monospace';
        w242.fillText('mW', 12, -y242 / 2 + 52);
        w242.fillStyle = ProteusColors.TEXT_SECONDARY;
        w242.font = '7px sans-serif';
        w242.fillText('PF:0.95', -14, -y242 / 2 + 62);
        w242.strokeStyle = ProteusColors.COMPONENT_STROKE;
        w242.lineWidth = 1.2;
        w242.fillStyle = ProteusColors.TEXT_LABEL;
        w242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        w242.fillText('WATT', -14, -y242 / 2 - 4);
    }
    private static drawFreqCounter(t242: CanvasRenderingContext2D): void {
        const u242 = 52;
        const v242 = 42;
        t242.strokeRect(-u242 / 2, -v242 / 2, u242, v242);
        t242.fillStyle = '#1a0000';
        t242.fillRect(-u242 / 2 + 5, -v242 / 2 + 5, u242 - 10, 16);
        t242.strokeStyle = '#660000';
        t242.lineWidth = 0.5;
        t242.strokeRect(-u242 / 2 + 5, -v242 / 2 + 5, u242 - 10, 16);
        t242.fillStyle = '#FF2200';
        t242.font = 'bold 12px monospace';
        t242.fillText('1000', -15, -v242 / 2 + 17);
        t242.fillStyle = ProteusColors.TEXT_SECONDARY;
        t242.font = '7px monospace';
        t242.fillText('Hz', 10, -2);
        t242.fillText('G:1s', -19, 10);
        t242.strokeStyle = ProteusColors.COMPONENT_STROKE;
        t242.lineWidth = 1.2;
        t242.fillStyle = ProteusColors.TEXT_LABEL;
        t242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        t242.fillText('FREQ', -14, -v242 / 2 - 4);
    }
    private static drawLcd(s242: CanvasRenderingContext2D): void {
        s242.strokeRect(-35, -22, 70, 44);
        s242.strokeRect(-28, -15, 56, 30);
        s242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        s242.fillStyle = ProteusColors.TEXT_LABEL;
        s242.fillText('LCD', -10, 4);
    }
    private static drawOled(r242: CanvasRenderingContext2D): void {
        r242.strokeRect(-30, -18, 60, 36);
        r242.fillStyle = '#1a1a2e';
        r242.fillRect(-24, -12, 48, 24);
        r242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        r242.fillStyle = ProteusColors.TEXT_LABEL;
        r242.fillText('OLED', -14, 28);
    }
    private static drawSwitch(q242: CanvasRenderingContext2D): void {
        q242.beginPath();
        q242.moveTo(-30, 0);
        q242.lineTo(-8, 0);
        q242.stroke();
        q242.beginPath();
        q242.arc(-8, 0, 3, 0, Math.PI * 2);
        q242.stroke();
        q242.beginPath();
        q242.moveTo(-8, 0);
        q242.lineTo(8, -10);
        q242.stroke();
        q242.beginPath();
        q242.arc(8, 0, 3, 0, Math.PI * 2);
        q242.stroke();
        q242.beginPath();
        q242.moveTo(8, 0);
        q242.lineTo(30, 0);
        q242.stroke();
    }
    private static drawRelay(p242: CanvasRenderingContext2D): void {
        p242.strokeRect(-20, -18, 40, 36);
        p242.beginPath();
        p242.arc(-8, -6, 6, 0, Math.PI * 2);
        p242.stroke();
        p242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        p242.fillStyle = ProteusColors.TEXT_LABEL;
        p242.fillText('K', -4, 8);
    }
    private static drawBuzzer(o242: CanvasRenderingContext2D): void {
        o242.beginPath();
        o242.arc(0, 0, 14, 0, Math.PI * 2);
        o242.stroke();
        o242.beginPath();
        o242.moveTo(14, -6);
        o242.lineTo(22, -12);
        o242.stroke();
        o242.beginPath();
        o242.moveTo(14, 6);
        o242.lineTo(22, 12);
        o242.stroke();
    }
    private static drawSensor(n242: CanvasRenderingContext2D): void {
        n242.strokeRect(-18, -14, 36, 28);
        n242.beginPath();
        n242.moveTo(-6, 0);
        n242.lineTo(6, 0);
        n242.stroke();
        n242.beginPath();
        n242.moveTo(0, -6);
        n242.lineTo(0, 6);
        n242.stroke();
    }
    private static drawCounter(m242: CanvasRenderingContext2D): void {
        SchematicSymbolRenderer.drawIcBody(m242, [], '4017');
    }
    private static drawIcBody(d242: CanvasRenderingContext2D, e242: Pin[], f242: string): void {
        const g242 = calcSymbolBounds(e242, -4);
        const h242 = Math.max(50, g242.width);
        const i242 = Math.max(40, g242.height);
        const j242 = (g242.minX + g242.maxX) / 2;
        const k242 = (g242.minY + g242.maxY) / 2;
        d242.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        d242.fillRect(j242 - h242 / 2, k242 - i242 / 2, h242, i242);
        d242.strokeStyle = ProteusColors.COMPONENT_STROKE;
        d242.lineWidth = 2;
        d242.strokeRect(j242 - h242 / 2, k242 - i242 / 2, h242, i242);
        if (f242.length > 0) {
            const l242 = f242.length > 14 ? f242.substring(0, 12) + '..' : f242;
            d242.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
            d242.fillStyle = ProteusColors.TEXT_LABEL;
            d242.textAlign = 'center';
            d242.fillText(l242, 0, 4);
            d242.textAlign = 'start';
        }
    }
    private static drawPins(r241: CanvasRenderingContext2D, s241: Pin[], t241: string): void {
        r241.strokeStyle = t241;
        r241.lineWidth = 1;
        const u241 = s241.length <= 128;
        for (let v241 = 0; v241 < s241.length; v241++) {
            const w241 = s241[v241];
            const x241 = w241.position.x;
            const y241 = w241.position.y;
            const z241 = SchematicSymbolRenderer.pinExtension(x241, y241);
            r241.beginPath();
            r241.moveTo(z241.x, z241.y);
            r241.lineTo(x241, y241);
            r241.stroke();
            r241.beginPath();
            r241.arc(x241, y241, 2.5, 0, Math.PI * 2);
            r241.fillStyle = t241;
            r241.fill();
            r241.stroke();
            if (w241.type === PinType.POWER) {
                r241.fillStyle = ProteusColors.POWER;
                r241.beginPath();
                r241.arc(x241, y241, 2.5, 0, Math.PI * 2);
                r241.fill();
            }
            else if (w241.type === PinType.GROUND) {
                r241.fillStyle = ProteusColors.GROUND;
                r241.beginPath();
                r241.arc(x241, y241, 2.5, 0, Math.PI * 2);
                r241.fill();
            }
            if (u241) {
                const a242 = w241.number || w241.name;
                r241.fillStyle = ProteusColors.TEXT_LABEL;
                r241.font = '10px sans-serif';
                const b242 = z241.x + (x241 - z241.x > 0 ? 2 : x241 - z241.x < 0 ? -2 : 0);
                const c242 = z241.y + (y241 - z241.y > 0 ? 2 : y241 - z241.y < 0 ? -2 : 0);
                if (z241.x !== x241) {
                    r241.textAlign = x241 < 0 ? 'end' : 'start';
                    r241.textBaseline = 'middle';
                    r241.fillText(a242, b242, c242);
                }
                else {
                    r241.textAlign = 'center';
                    r241.textBaseline = y241 < 0 ? 'bottom' : 'top';
                    r241.fillText(a242, b242, c242);
                }
                r241.textAlign = 'start';
                r241.textBaseline = 'alphabetic';
            }
        }
    }
    private static drawSvgCommands(n241: CanvasRenderingContext2D, o241: DrawCommand[]): void {
        for (let p241 = 0; p241 < o241.length; p241++) {
            const q241 = o241[p241];
            n241.strokeStyle = q241.color ?? ProteusColors.COMPONENT_STROKE;
            n241.lineWidth = q241.strokeWidth ?? 1.2;
            if (q241.type === 'line' && q241.x1 !== undefined && q241.y1 !== undefined && q241.x2 !== undefined && q241.y2 !== undefined) {
                n241.beginPath();
                n241.moveTo(q241.x1, q241.y1);
                n241.lineTo(q241.x2, q241.y2);
                n241.stroke();
            }
            else if (q241.type === 'rect' && q241.x !== undefined && q241.y !== undefined && q241.w !== undefined && q241.h !== undefined) {
                n241.strokeRect(q241.x, q241.y, q241.w, q241.h);
            }
            else if (q241.type === 'circle' && q241.x !== undefined && q241.y !== undefined && q241.r !== undefined) {
                n241.beginPath();
                n241.arc(q241.x, q241.y, q241.r, 0, Math.PI * 2);
                n241.stroke();
            }
        }
    }
    private static pinExtension(i241: number, j241: number): Point2D {
        const k241 = 8;
        if (Math.abs(i241) * 8 >= Math.abs(j241)) {
            const m241: Point2D = { x: i241 < 0 ? i241 - k241 : i241 + k241, y: j241 };
            return m241;
        }
        const l241: Point2D = { x: i241, y: j241 < 0 ? j241 - k241 : j241 + k241 };
        return l241;
    }
    private static drawVcc(h241: CanvasRenderingContext2D): void {
        h241.beginPath();
        h241.moveTo(0, 10);
        h241.lineTo(0, -10);
        h241.moveTo(-6, 10);
        h241.lineTo(6, 10);
        h241.stroke();
        h241.beginPath();
        h241.arc(0, -13, 3, 0, Math.PI * 2);
        h241.stroke();
        h241.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        h241.fillStyle = ProteusColors.TEXT_LABEL;
        h241.textAlign = 'center';
        h241.fillText('VCC', 0, -22);
        h241.textAlign = 'start';
    }
    private static drawGnd(g241: CanvasRenderingContext2D): void {
        g241.beginPath();
        g241.moveTo(0, -10);
        g241.lineTo(0, 8);
        g241.stroke();
        g241.beginPath();
        g241.moveTo(-12, 8);
        g241.lineTo(12, 8);
        g241.stroke();
        g241.beginPath();
        g241.moveTo(-7, 13);
        g241.lineTo(7, 13);
        g241.stroke();
        g241.beginPath();
        g241.moveTo(-3, 18);
        g241.lineTo(3, 18);
        g241.stroke();
        g241.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        g241.fillStyle = ProteusColors.TEXT_LABEL;
        g241.textAlign = 'center';
        g241.fillText('GND', 0, 28);
        g241.textAlign = 'start';
    }
    private static drawLabels(y240: CanvasRenderingContext2D, z240: ComponentDefinition, a241: string, b241: SymbolDrawStyle): void {
        const c241 = calcSymbolBounds(z240.pins, 4);
        y240.fillStyle = b241.selected ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY;
        y240.font = `${ProteusFonts.CANVAS_LABEL}px sans-serif`;
        y240.textAlign = 'center';
        y240.fillText(a241, 0, c241.minY - 4);
        y240.fillStyle = ProteusColors.TEXT_LABEL;
        y240.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        const d241 = z240.defaultParams.has('value') ? 'value' :
            (z240.defaultParams.has('output') ? 'output' : '');
        const e241 = d241.length > 0 ? (z240.defaultParams.get(d241) ?? '') : z240.id;
        const f241 = e241.length > 12 ? e241.substring(0, 10) + '..' : e241;
        y240.fillText(f241, 0, c241.maxY + 10);
        y240.textAlign = 'start';
    }
}
