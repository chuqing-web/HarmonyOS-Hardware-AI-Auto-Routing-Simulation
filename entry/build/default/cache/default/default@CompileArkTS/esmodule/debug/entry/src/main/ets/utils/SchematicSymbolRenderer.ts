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
    /** LED fill/emission color; empty = unlit (outline only) */
    ledDisplayColor?: string;
    /** Weak conduction / below full-lit threshold — same hue, dimmer alpha */
    ledDimmed?: boolean;
    /** Buzzer energised (sounding) — filled body + sound waves */
    buzzerActive?: boolean;
    /** Pushbutton pressed (contacts closed) */
    switchPressed?: boolean;
    /** Potentiometer wiper fraction 0..1 (arrow along track) */
    potWiper?: number;
    /** DS18B20 teaching temperature °C (−55…125); undefined = generic sensor glyph */
    sensorTempC?: number;
    /** Hall sensor magnet field active */
    hallActive?: boolean;
    /** Instance parameter overrides (e.g. VCC voltage) for label drawing */
    paramOverrides?: Map<string, string>;
}
export class SchematicSymbolRenderer {
    /** Pin-dot circles in DeviceLibrary SVGs are typically r≤2; notch/bubbles are larger. */
    private static readonly SVG_PIN_DOT_R_MAX: number = 2.5;
    /** Inner SVG body frame inset from meta pin tips (outer shell hosts pins). */
    private static readonly SVG_INNER_BODY_INSET: number = 10;
    private static svgCacheBusted: boolean = false;
    static drawComponent(ctx: CanvasRenderingContext2D, originX: number, originY: number, def: ComponentDefinition, refDes: string, rotation: Rotation, mirrored: boolean, style: SymbolDrawStyle): SymbolBounds {
        ctx.save();
        ctx.translate(originX, originY);
        if (rotation !== 0) {
            ctx.rotate(rotation * Math.PI / 180);
        }
        if (mirrored) {
            ctx.scale(-1, 1);
        }
        const symbolKey = resolveSymbolKey(def.id, def.svgSymbol, def.behaviorModel);
        SchematicSymbolRenderer.drawSymbolBody(ctx, symbolKey, def, style.ledDisplayColor ?? '', style.buzzerActive === true, style.switchPressed === true, style.potWiper !== undefined ? style.potWiper : 0.5, style.sensorTempC !== undefined ? style.sensorTempC : Number.NaN, style.hallActive === true, style.ledDimmed === true);
        SchematicSymbolRenderer.drawPins(ctx, def.pins, style.strokeColor);
        SchematicSymbolRenderer.drawLabels(ctx, def, refDes, style);
        if (style.hovered && !style.selected) {
            const pad = 14;
            const bounds = calcSymbolBounds(def.pins, pad);
            ctx.fillStyle = 'rgba(0, 170, 255, 0.12)';
            ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
            ctx.strokeStyle = ProteusColors.HOVER_PREVIEW;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
            ctx.setLineDash([]);
        }
        ctx.restore();
        return calcSymbolBounds(def.pins, 8);
    }
    static drawGhost(ctx: CanvasRenderingContext2D, originX: number, originY: number, def: ComponentDefinition): void {
        ctx.save();
        ctx.translate(originX, originY);
        ctx.globalAlpha = 0.55;
        // Draw body backdrop for IC-type components so the ghost has a visible border,
        // matching how the canvas renders real components
        const pinBounds = calcSymbolBounds(def.pins, 0);
        const isRegulator = def.behaviorModel === 'regulator';
        const isMeterBody = def.behaviorModel === 'ammeter_dc' || def.behaviorModel === 'voltmeter_dc';
        if (!isMeterBody && (isRegulator || (def.pins.length > 0 && (pinBounds.width >= 50 || pinBounds.height >= 40)))) {
            let cx = (pinBounds.minX + pinBounds.maxX) / 2;
            let cy = (pinBounds.minY + pinBounds.maxY) / 2;
            let bodyW = Math.max(pinBounds.width, 12);
            let bodyH = Math.max(pinBounds.height, 12);
            if (isRegulator) {
                bodyW = Math.max(bodyW, 70);
                bodyH = Math.max(bodyH, 50);
                cx = 0;
                cy = 10;
            }
            ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
            ctx.fillRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH);
            ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
            ctx.lineWidth = 2;
            ctx.strokeRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH);
        }
        const symbolKey = resolveSymbolKey(def.id, def.svgSymbol, def.behaviorModel);
        SchematicSymbolRenderer.drawSymbolBody(ctx, symbolKey, def);
        SchematicSymbolRenderer.drawPins(ctx, def.pins, ProteusColors.HOVER_PREVIEW);
        ctx.restore();
    }
    private static drawSymbolBody(ctx: CanvasRenderingContext2D, key: string, def: ComponentDefinition, ledDisplayColor: string = '', buzzerActive: boolean = false, switchPressed: boolean = false, potWiper: number = 0.5, sensorTempC: number = Number.NaN, hallActive: boolean = false, ledDimmed: boolean = false): void {
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.fillStyle = ProteusColors.CANVAS_BG;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const isIcType = key === 'counter' || key === 'mcu_8051' || key === 'mcu_stm32' ||
            key === 'memory' || key === 'generic_ic' || key === 'timer555';
        // Procedural symbols: pin geometry must match BuiltinComponents / templates.
        // DeviceLibrary Common/*.svg must not override these (wrong scale / mis-keyed files).
        const skipSvg = key === 'led' || key === 'diode' || key === 'resistor' ||
            key === 'potentiometer' ||
            key === 'capacitor' || key === 'fuse' || key === 'buzzer' || key === 'switch' ||
            key === 'mosfet' || key === 'relay' || key === 'oled' ||
            key === 'ammeter' || key === 'voltmeter' ||
            key === 'vcc' || key === 'gnd' || key === 'vee' || key === 'vac' ||
            key === 'oscilloscope' || key === 'multimeter' || key === 'logic_analyzer' ||
            key === 'uart_terminal' || key === 'power_meter' || key === 'freq_counter' ||
            key === 'signal_gen';
        if (!skipSvg && def.svgSymbol.length > 20 && def.svgSymbol.indexOf('<') >= 0) {
            if (!SchematicSymbolRenderer.svgCacheBusted) {
                SvgSymbolCache.clear();
                SchematicSymbolRenderer.svgCacheBusted = true;
            }
            const cmds = SvgSymbolCache.preload(def.id, def.svgSymbol);
            if (cmds.length > 0) {
                // Outer shell + pins come from canvas backdrop / drawPins.
                // SVG keeps only inner decoration (inset body, notch) — never pin stubs.
                const bodyCmds = SchematicSymbolRenderer.stripSvgPinCommands(cmds, def.pins);
                SchematicSymbolRenderer.drawSvgCommands(ctx, bodyCmds);
                return;
            }
        }
        // No usable SVG: procedural IC body (canvas backdrop may still draw outer shell)
        if (isIcType) {
            SchematicSymbolRenderer.drawIcBody(ctx, def.pins, def.name);
        }
        switch (key) {
            case 'resistor':
                SchematicSymbolRenderer.drawResistor(ctx);
                break;
            case 'potentiometer':
                SchematicSymbolRenderer.drawPotentiometer(ctx, potWiper);
                break;
            case 'capacitor':
                SchematicSymbolRenderer.drawCapacitor(ctx);
                break;
            case 'inductor':
                SchematicSymbolRenderer.drawInductor(ctx);
                break;
            case 'crystal':
                SchematicSymbolRenderer.drawCrystal(ctx);
                break;
            case 'fuse':
                SchematicSymbolRenderer.drawFuse(ctx);
                break;
            case 'diode':
                SchematicSymbolRenderer.drawDiode(ctx, false, '');
                break;
            case 'led':
                SchematicSymbolRenderer.drawDiode(ctx, true, ledDisplayColor, ledDimmed);
                break;
            case 'transistor':
                SchematicSymbolRenderer.drawTransistor(ctx);
                break;
            case 'mosfet':
                SchematicSymbolRenderer.drawMosfet(ctx);
                break;
            case 'opamp':
                SchematicSymbolRenderer.drawOpAmp(ctx);
                break;
            case 'regulator':
                SchematicSymbolRenderer.drawRegulator(ctx);
                break;
            case 'gate_not':
                SchematicSymbolRenderer.drawGateNot(ctx);
                break;
            case 'gate_and':
            case 'gate_nand':
                SchematicSymbolRenderer.drawGateAnd(ctx, key === 'gate_nand');
                break;
            case 'gate_or':
            case 'gate_nor':
                SchematicSymbolRenderer.drawGateOr(ctx, key === 'gate_nor');
                break;
            case 'gate_xor':
                SchematicSymbolRenderer.drawGateXor(ctx);
                break;
            case 'oscilloscope':
                SchematicSymbolRenderer.drawOscilloscope(ctx);
                break;
            case 'multimeter':
                SchematicSymbolRenderer.drawMultimeter(ctx);
                break;
            case 'logic_analyzer':
                SchematicSymbolRenderer.drawLogicAnalyzer(ctx);
                break;
            case 'uart_terminal':
                SchematicSymbolRenderer.drawUartTerminal(ctx);
                break;
            case 'voltmeter':
                SchematicSymbolRenderer.drawVoltmeter(ctx);
                break;
            case 'ammeter':
                SchematicSymbolRenderer.drawAmmeter(ctx);
                break;
            case 'power_meter':
                SchematicSymbolRenderer.drawPowerMeter(ctx);
                break;
            case 'freq_counter':
                SchematicSymbolRenderer.drawFreqCounter(ctx);
                break;
            case 'signal_gen':
                SchematicSymbolRenderer.drawSignalGen(ctx);
                break;
            case 'lcd':
                SchematicSymbolRenderer.drawLcd(ctx);
                break;
            case 'oled':
                SchematicSymbolRenderer.drawOled(ctx);
                break;
            case 'switch':
                SchematicSymbolRenderer.drawSwitch(ctx, switchPressed);
                break;
            case 'relay':
                SchematicSymbolRenderer.drawRelay(ctx);
                break;
            case 'buzzer':
                SchematicSymbolRenderer.drawBuzzer(ctx, buzzerActive);
                break;
            case 'sensor':
                if (def.id.toUpperCase().includes('DS18B20') || def.behaviorModel === 'ds18b20') {
                    const tC = Number.isFinite(sensorTempC) ? sensorTempC : 25;
                    SchematicSymbolRenderer.drawDs18b20(ctx, tC);
                }
                else if (def.id.toUpperCase().includes('HALL') || def.behaviorModel === 'hall') {
                    SchematicSymbolRenderer.drawHallSensor(ctx, hallActive);
                }
                else {
                    SchematicSymbolRenderer.drawSensor(ctx);
                }
                break;
            case 'counter':
            case 'mcu_8051':
            case 'mcu_stm32':
            case 'memory':
            case 'timer555':
                // Body already drawn above as backdrop
                break;
            case 'vcc':
                SchematicSymbolRenderer.drawVcc(ctx);
                break;
            case 'gnd':
                SchematicSymbolRenderer.drawGnd(ctx);
                break;
            case 'vee':
                SchematicSymbolRenderer.drawVee(ctx);
                break;
            case 'vac':
                SchematicSymbolRenderer.drawVac(ctx);
                break;
            default:
                // Body already drawn above for generic_ic (isIcType=true)
                if (!isIcType) {
                    SchematicSymbolRenderer.drawIcBody(ctx, def.pins, def.name);
                }
                break;
        }
    }
    private static drawResistor(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-22, 0);
        ctx.lineTo(-18, -6);
        ctx.lineTo(-10, 6);
        ctx.lineTo(-2, -6);
        ctx.lineTo(6, 6);
        ctx.lineTo(14, -6);
        ctx.lineTo(22, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
    }
    /** Zigzag body + top slider track/knob; t=0 at pin1 (−30), t=1 at pin2 (+30) */
    private static drawPotentiometer(ctx: CanvasRenderingContext2D, wiper: number = 0.5): void {
        SchematicSymbolRenderer.drawResistor(ctx);
        let t = wiper;
        if (t < 0.001) {
            t = 0.001;
        }
        else if (t > 0.999) {
            t = 0.999;
        }
        // Top slider rail (above zigzag) — primary interactive affordance
        const railL = -22;
        const railR = 22;
        const railY = -16;
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(railL, railY);
        ctx.lineTo(railR, railY);
        ctx.stroke();
        // End stops
        ctx.beginPath();
        ctx.moveTo(railL, railY - 4);
        ctx.lineTo(railL, railY + 4);
        ctx.moveTo(railR, railY - 4);
        ctx.lineTo(railR, railY + 4);
        ctx.stroke();
        const wx = railL + t * (railR - railL);
        // Knob
        ctx.fillStyle = '#2a6fdb';
        ctx.strokeStyle = '#1a4a9a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(wx - 4, railY - 7, 8, 14);
        ctx.fill();
        ctx.stroke();
        // Arrow from electrical W pad (0,28) up to track (visual cue)
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 28);
        ctx.lineTo(0, 14);
        ctx.lineTo(wx, 8);
        ctx.lineTo(wx - 4, 3);
        ctx.moveTo(wx, 8);
        ctx.lineTo(wx + 4, 3);
        ctx.stroke();
        // % label above slider
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(t * 100)}%`, 0, railY - 12);
        ctx.textAlign = 'start';
    }
    private static drawCapacitor(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-4, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.lineTo(-4, 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, -10);
        ctx.lineTo(4, 10);
        ctx.stroke();
    }
    private static drawInductor(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-22, 0);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
            const cx = -18 + i * 10;
            ctx.beginPath();
            ctx.arc(cx, 0, 5, Math.PI, 0, false);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
    }
    private static drawCrystal(ctx: CanvasRenderingContext2D): void {
        ctx.strokeRect(-12, -8, 24, 16);
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-12, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
    }
    private static drawFuse(ctx: CanvasRenderingContext2D): void {
        ctx.strokeRect(-15, -5, 30, 10);
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-15, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
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
    private static drawDiode(ctx: CanvasRenderingContext2D, isLed: boolean, ledColor: string, ledDimmed: boolean = false): void {
        // Diode body lines
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-8, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
        // Triangle
        ctx.beginPath();
        ctx.moveTo(-8, -10);
        ctx.lineTo(-8, 10);
        ctx.lineTo(8, 0);
        ctx.closePath();
        if (isLed && ledColor.length > 0) {
            const hex = SchematicSymbolRenderer.diodeColorMap.get(ledColor) ?? '#E53935';
            const fillA = ledDimmed ? 0.12 : 0.72;
            const strokeA = ledDimmed ? 0.22 : 1.0;
            ctx.save();
            ctx.globalAlpha = fillA;
            ctx.fillStyle = hex;
            ctx.fill();
            ctx.globalAlpha = strokeA;
            ctx.strokeStyle = hex;
            ctx.lineWidth = ledDimmed ? 1.2 : 1.8;
            ctx.stroke();
            ctx.restore();
        }
        else {
            ctx.stroke();
        }
        // Cathode bar
        ctx.beginPath();
        ctx.moveTo(8, -10);
        ctx.lineTo(8, 10);
        ctx.stroke();
        // LED light emission arrows (full lit only; dim = weak fill, no rays)
        if (isLed && ledColor.length > 0 && !ledDimmed) {
            const hex = SchematicSymbolRenderer.diodeColorMap.get(ledColor) ?? '#E53935';
            ctx.strokeStyle = hex;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(10, -12);
            ctx.lineTo(18, -20);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(10, -8);
            ctx.lineTo(18, -16);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(13, -5);
            ctx.lineTo(21, -11);
            ctx.stroke();
            // Restore stroke style
            ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
            ctx.lineWidth = 1.2;
        }
    }
    private static drawTransistor(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-8, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, -10);
        ctx.lineTo(30, -18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, 10);
        ctx.lineTo(30, 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(8, -10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.lineTo(8, 10);
        ctx.stroke();
    }
    private static drawMosfet(ctx: CanvasRenderingContext2D): void {
        // D/S 与 pin 几何对齐（±20），保证预览/画布大黑框门禁 height≥40
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-10, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-10, -20);
        ctx.lineTo(-10, 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6, -16);
        ctx.lineTo(20, -16);
        ctx.lineTo(20, -24);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6, 16);
        ctx.lineTo(20, 16);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(20, -16);
        ctx.lineTo(30, -20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(20, 16);
        ctx.lineTo(30, 20);
        ctx.stroke();
    }
    private static drawOpAmp(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.moveTo(-20, -30);
        ctx.lineTo(20, 0);
        ctx.lineTo(-20, 30);
        ctx.closePath();
        ctx.stroke();
        ctx.fillText('+', -14, -8);
        ctx.fillText('−', -14, 12);
    }
    private static drawRegulator(ctx: CanvasRenderingContext2D): void {
        // 大黑框由 canvas backdrop 绘制；这里只标 REG，避免双重描边叠字。
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('REG', 0, 8);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
    private static drawGateNot(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.moveTo(-20, -25);
        ctx.lineTo(10, 0);
        ctx.lineTo(-20, 25);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(14, 0, 4, 0, Math.PI * 2);
        ctx.stroke();
    }
    private static drawGateAnd(ctx: CanvasRenderingContext2D, isNand: boolean): void {
        ctx.beginPath();
        ctx.moveTo(-20, -25);
        ctx.lineTo(0, -25);
        ctx.arc(0, 0, 25, -Math.PI / 2, Math.PI / 2, false);
        ctx.lineTo(-20, 25);
        ctx.closePath();
        ctx.stroke();
        if (isNand) {
            ctx.beginPath();
            ctx.arc(28, 0, 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    private static drawGateOr(ctx: CanvasRenderingContext2D, isNor: boolean): void {
        ctx.beginPath();
        ctx.moveTo(-20, -25);
        ctx.quadraticCurveTo(-5, 0, -20, 25);
        ctx.quadraticCurveTo(15, 25, 28, 0);
        ctx.quadraticCurveTo(15, -25, -20, -25);
        ctx.stroke();
        if (isNor) {
            ctx.beginPath();
            ctx.arc(32, 0, 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    private static drawGateXor(ctx: CanvasRenderingContext2D): void {
        SchematicSymbolRenderer.drawGateOr(ctx, false);
        ctx.beginPath();
        ctx.moveTo(-24, -25);
        ctx.quadraticCurveTo(-9, 0, -24, 25);
        ctx.stroke();
    }
    private static drawOscilloscope(ctx: CanvasRenderingContext2D): void {
        // Must match BuiltinComponents / DeviceLibrary OSCILLOSCOPE pins:
        //   x=-40, y={-30,-10,10,30,50}. drawPins only paints outward stubs,
        //   so body↔pin links are drawn here (same as OSCILLOSCOPE.symbol.svg).
        const pinX = -40;
        const bodyLeft = -30;
        const bodyRight = 30;
        const bodyTop = -35;
        const bodyBottom = 55;
        const pinYs: number[] = [-30, -10, 10, 30, 50];
        const w = bodyRight - bodyLeft;
        const h = bodyBottom - bodyTop;
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bodyLeft, bodyTop, w, h);
        // Screen area (leave strip at bottom for CH legend)
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(bodyLeft + 4, bodyTop + 4, w - 8, h - 22);
        ctx.strokeStyle = '#2a2a3e';
        ctx.lineWidth = 0.5;
        for (let gx = bodyLeft + 10; gx < bodyRight - 4; gx += 8) {
            ctx.beginPath();
            ctx.moveTo(gx, bodyTop + 4);
            ctx.lineTo(gx, bodyBottom - 18);
            ctx.stroke();
        }
        for (let gy = bodyTop + 8; gy < bodyBottom - 18; gy += 8) {
            ctx.beginPath();
            ctx.moveTo(bodyLeft + 4, gy);
            ctx.lineTo(bodyRight - 4, gy);
            ctx.stroke();
        }
        ctx.strokeStyle = '#00FF88';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bodyLeft + 6, 5);
        ctx.lineTo(-16, 0);
        ctx.lineTo(-6, 12);
        ctx.lineTo(4, -2);
        ctx.lineTo(14, 10);
        ctx.lineTo(24, 4);
        ctx.lineTo(bodyRight - 6, 8);
        ctx.stroke();
        ctx.fillStyle = '#00FF88';
        ctx.font = '8px monospace';
        ctx.fillText('CH1', bodyLeft + 6, bodyBottom - 6);
        // Body↔pin stubs (drawPins only extends further left of pinX)
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < pinYs.length; i++) {
            const py = pinYs[i];
            ctx.moveTo(pinX, py);
            ctx.lineTo(bodyLeft, py);
        }
        ctx.stroke();
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('SCOPE', -16, bodyTop - 4);
    }
    private static drawMultimeter(ctx: CanvasRenderingContext2D): void {
        // Pins at x=-30: V=-30 A=-10 OHM=10 COM=30
        const w = 56;
        const h = 72;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = '#C8E6C0';
        ctx.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 14);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, 14);
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('3.297', -16, -h / 2 + 17);
        ctx.font = '6px monospace';
        ctx.fillText('DCV', -6, -h / 2 + 24);
        const cy = 8;
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(5, cy - 5);
        ctx.stroke();
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = '5px sans-serif';
        ctx.fillText('V', -w / 2 + 2, -28);
        ctx.fillText('A', -w / 2 + 2, -8);
        ctx.fillText('Ω', -w / 2 + 2, 12);
        ctx.fillText('COM', -w / 2 + 2, 32);
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('DMM', -12, -h / 2 - 4);
    }
    private static drawLogicAnalyzer(ctx: CanvasRenderingContext2D): void {
        // Pins at x=-40, y={-40,-30,-20,-10,0,10,20,30,40} — body covers y=-50..50
        const w = 64;
        const h = 100;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        // Screen area
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(-w / 2 + 4, -h / 2 + 6, w - 8, h - 24);
        // 8 digital channel traces — spaced to match pin y positions
        const colors = ['#00FF88', '#FF6644', '#44AAFF', '#FFCC00',
            '#FF44CC', '#44FFCC', '#CC88FF', '#88FF44'];
        for (let i = 0; i < 8; i++) {
            const y = -h / 2 + 16 + i * 8;
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(-w / 2 + 6, y);
            const pattern = [0, 1, 1, 0, 0, 1, 0, 1];
            for (let s = 0; s < 8; s++) {
                const sx = -w / 2 + 8 + s * 6;
                ctx.lineTo(sx, y);
                ctx.lineTo(sx, pattern[(i + s) % 8] === 1 ? y - 3 : y + 3);
                ctx.lineTo(sx + 3, pattern[(i + s) % 8] === 1 ? y - 3 : y + 3);
            }
            ctx.stroke();
        }
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('LOGIC', -16, -h / 2 - 4);
    }
    private static drawUartTerminal(ctx: CanvasRenderingContext2D): void {
        // Pins at x=-40, y={-10,10,30} — body covers y=-30..30
        const w = 64;
        const h = 60;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        // Screen
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 22);
        // TX arrow (left side)
        ctx.strokeStyle = '#00AAFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 16, 4);
        ctx.lineTo(-6, 4);
        ctx.moveTo(-10, 0);
        ctx.lineTo(-6, 4);
        ctx.lineTo(-10, 8);
        ctx.stroke();
        ctx.fillStyle = '#00AAFF';
        ctx.font = '7px monospace';
        ctx.fillText('TX', -w / 2 + 8, 4);
        // RX arrow (right side)
        ctx.strokeStyle = '#FF6644';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 14, -2);
        ctx.lineTo(6, -2);
        ctx.moveTo(10, -6);
        ctx.lineTo(6, -2);
        ctx.lineTo(10, 2);
        ctx.stroke();
        ctx.fillStyle = '#FF6644';
        ctx.fillText('RX', w / 2 - 22, -2);
        // Title
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('UART', -14, -h / 2 - 4);
    }
    private static drawVoltmeter(ctx: CanvasRenderingContext2D): void {
        // Pins at left cluster — framed analog meter body
        const bw = 44;
        const bh = 52;
        const bx = -bw / 2;
        const by = -bh / 2;
        ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        const r = 14;
        const cy = -2;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(0, cy, r - 3, Math.PI * 0.82, Math.PI * 0.18, true);
        ctx.stroke();
        for (let a = Math.PI * 0.82; a >= Math.PI * 0.18; a -= 0.16) {
            const x1 = (r - 5) * Math.cos(a);
            const y1 = cy + (r - 5) * Math.sin(a);
            const x2 = (r - 1.5) * Math.cos(a);
            const y2 = cy + (r - 1.5) * Math.sin(a);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#CC0000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo((r - 4) * Math.cos(Math.PI * 0.55), cy + (r - 4) * Math.sin(Math.PI * 0.55));
        ctx.stroke();
        ctx.fillStyle = '#CC0000';
        ctx.beginPath();
        ctx.arc(0, cy, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('V', 0, cy + 8);
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('VOLT', 0, by + bh - 8);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
    }
    private static drawAmmeter(ctx: CanvasRenderingContext2D): void {
        // Pins at (±40, 0) — series through-meter with outer black frame
        const bw = 52;
        const bh = 48;
        const bx = -bw / 2;
        const by = -bh / 2;
        ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        // Lead stubs toward I+/I- (pins drawn separately outside)
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-40, 0);
        ctx.lineTo(bx, 0);
        ctx.moveTo(bx + bw, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
        const r = 14;
        const cy = -2;
        ctx.beginPath();
        ctx.arc(0, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(0, cy, r - 3, Math.PI * 0.82, Math.PI * 0.18, true);
        ctx.stroke();
        for (let a = Math.PI * 0.82; a >= Math.PI * 0.18; a -= 0.16) {
            const x1 = (r - 5) * Math.cos(a);
            const y1 = cy + (r - 5) * Math.sin(a);
            const x2 = (r - 1.5) * Math.cos(a);
            const y2 = cy + (r - 1.5) * Math.sin(a);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#CC0000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo((r - 4) * Math.cos(Math.PI * 0.4), cy + (r - 4) * Math.sin(Math.PI * 0.4));
        ctx.stroke();
        ctx.fillStyle = '#CC0000';
        ctx.beginPath();
        ctx.arc(0, cy, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('A', 0, cy + 8);
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('AMP', 0, by + bh - 8);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
    }
    private static drawPowerMeter(ctx: CanvasRenderingContext2D): void {
        // Pins at x=-40, y={-20,0,20,40} — body covers y=-38..46
        const w = 64;
        const h = 84;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        // Display area
        ctx.fillStyle = '#E8F5E9';
        ctx.fillRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 34);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 34);
        // Power reading
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('P=VI', -14, -h / 2 + 24);
        ctx.font = '8px monospace';
        ctx.fillText('3.30V', -20, -h / 2 + 38);
        ctx.fillText('12.5mA', 2, -h / 2 + 38);
        // Wattage
        ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
        ctx.font = 'bold 13px monospace';
        ctx.fillText('41.2', -12, -h / 2 + 52);
        ctx.font = '8px monospace';
        ctx.fillText('mW', 12, -h / 2 + 52);
        // PF indicator
        ctx.fillStyle = ProteusColors.TEXT_SECONDARY;
        ctx.font = '7px sans-serif';
        ctx.fillText('PF:0.95', -14, -h / 2 + 62);
        // Title
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('WATT', -14, -h / 2 - 4);
    }
    private static drawFreqCounter(ctx: CanvasRenderingContext2D): void {
        // Pins at x=-30, y={-10,10} — body covers y=-21..21
        const w = 52;
        const h = 42;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        // LED display
        ctx.fillStyle = '#1a0000';
        ctx.fillRect(-w / 2 + 5, -h / 2 + 5, w - 10, 16);
        ctx.strokeStyle = '#660000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, 16);
        // Frequency reading (7-seg style)
        ctx.fillStyle = '#FF2200';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('1000', -15, -h / 2 + 17);
        // Unit & gate labels
        ctx.fillStyle = ProteusColors.TEXT_SECONDARY;
        ctx.font = '7px monospace';
        ctx.fillText('Hz', 10, -2);
        ctx.fillText('G:1s', -19, 10);
        // Title
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText('FREQ', -14, -h / 2 - 4);
    }
    private static drawLcd(ctx: CanvasRenderingContext2D): void {
        ctx.strokeRect(-35, -22, 70, 44);
        ctx.strokeRect(-28, -15, 56, 30);
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.fillText('LCD', -10, 4);
    }
    private static drawOled(ctx: CanvasRenderingContext2D): void {
        // 主体覆盖脚距 ±20，预览大黑框内可见显示屏
        ctx.strokeRect(-28, -20, 56, 40);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(-22, -14, 44, 28);
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.fillText('OLED', -14, 4);
    }
    /**
     * Pushbutton: OPEN = raised angled blade + gap; CLOSED = flat bar bridging contacts.
     * Visuals must differ clearly — stroke color alone is not enough.
     */
    private static drawSwitch(ctx: CanvasRenderingContext2D, pressed: boolean = false): void {
        // Lead wires
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-10, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
        if (pressed) {
            // Closed: filled plate + horizontal blade bridging both contacts
            ctx.fillStyle = 'rgba(40, 160, 80, 0.18)';
            ctx.strokeStyle = '#2a8a48';
            ctx.lineWidth = 1.2;
            ctx.fillRect(-16, -14, 32, 28);
            ctx.strokeRect(-16, -14, 32, 28);
            ctx.fillStyle = '#2a8a48';
            ctx.beginPath();
            ctx.arc(-10, 0, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(10, 0, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#1e6b36';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.lineTo(10, 0);
            ctx.stroke();
            // Actuator plunger down
            ctx.fillStyle = '#2a8a48';
            ctx.fillRect(-5, -12, 10, 6);
            ctx.strokeStyle = '#1e6b36';
            ctx.lineWidth = 1;
            ctx.strokeRect(-5, -12, 10, 6);
            ctx.fillStyle = '#1e6b36';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('CLOSED', 0, 18);
            ctx.textAlign = 'start';
            return;
        }
        // Open: hollow enclosure + raised angled blade (visible air gap)
        ctx.fillStyle = 'rgba(80, 100, 120, 0.08)';
        ctx.strokeStyle = '#607080';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-16, -14, 32, 28);
        ctx.strokeRect(-16, -14, 32, 28);
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(-10, 0, 3.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(10, 0, 3.2, 0, Math.PI * 2);
        ctx.stroke();
        // Blade hinged at left, tip clear of right contact
        ctx.strokeStyle = '#4a5a6a';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(8, -11);
        ctx.stroke();
        // Actuator plunger up
        ctx.fillStyle = '#8a9aaa';
        ctx.fillRect(-5, -18, 10, 5);
        ctx.strokeStyle = '#607080';
        ctx.lineWidth = 1;
        ctx.strokeRect(-5, -18, 10, 5);
        ctx.fillStyle = '#607080';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('OPEN', 0, 18);
        ctx.textAlign = 'start';
    }
    private static drawRelay(ctx: CanvasRenderingContext2D): void {
        // 主体覆盖线圈脚 y=-20 与触点 y=20，配合大黑框
        ctx.strokeRect(-22, -18, 44, 36);
        ctx.beginPath();
        ctx.arc(-8, -6, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.fillText('K', -4, 8);
    }
    private static drawBuzzer(ctx: CanvasRenderingContext2D, active: boolean = false): void {
        if (active) {
            // Energised: filled amber body + bold sound arcs
            ctx.fillStyle = '#f5a623';
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#c07010';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#fff8e8';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#c07010';
            ctx.lineWidth = 2.2;
            for (let i = 0; i < 3; i++) {
                const r = 18 + i * 5;
                ctx.beginPath();
                ctx.arc(0, 0, r, -0.9, 0.9);
                ctx.stroke();
            }
            ctx.fillStyle = '#c07010';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ON', 0, -18);
            ctx.textAlign = 'start';
            return;
        }
        // Idle: outline + thin muted sound ticks
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(14, -6);
        ctx.lineTo(20, -10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(14, 6);
        ctx.lineTo(20, 10);
        ctx.stroke();
    }
    private static drawSensor(ctx: CanvasRenderingContext2D): void {
        // 主体略增高，配合 Hall/LDR 脚距 height≥40 的大黑框
        ctx.strokeRect(-18, -18, 36, 36);
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.stroke();
    }
    /**
     * Hall：传感器框 + 顶部「磁场」切换钮（仿按键 CLOSED/OPEN 可点感）。
     * active=有磁 → OUT 开漏拉低。
     */
    private static drawHallSensor(ctx: CanvasRenderingContext2D, active: boolean): void {
        SchematicSymbolRenderer.drawSensor(ctx);
        // Toggle button above body (same vertical band as DS18B20 slider)
        const bx = -24;
        const by = -34;
        const bw = 48;
        const bh = 16;
        if (active) {
            ctx.fillStyle = 'rgba(196, 92, 38, 0.22)';
            ctx.strokeStyle = '#c45c26';
            ctx.lineWidth = 1.4;
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh);
            // Pressed plunger
            ctx.fillStyle = '#c45c26';
            ctx.fillRect(-6, by + 2, 12, 5);
            ctx.strokeStyle = '#8a3a12';
            ctx.lineWidth = 1;
            ctx.strokeRect(-6, by + 2, 12, 5);
            ctx.fillStyle = '#8a3a12';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('MAG ON', 0, by + bh - 2);
        }
        else {
            ctx.fillStyle = 'rgba(80, 100, 120, 0.10)';
            ctx.strokeStyle = '#607080';
            ctx.lineWidth = 1.4;
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh);
            // Raised plunger
            ctx.fillStyle = '#8a9aaa';
            ctx.fillRect(-6, by - 2, 12, 5);
            ctx.strokeStyle = '#607080';
            ctx.lineWidth = 1;
            ctx.strokeRect(-6, by - 2, 12, 5);
            ctx.fillStyle = '#607080';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('MAG OFF', 0, by + bh - 2);
        }
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = '7px sans-serif';
        ctx.fillText('点按切换', 0, by - 4);
        ctx.textAlign = 'start';
    }
    /**
     * DS18B20：传感器框 + 顶部温度滑条（仿电位器）。
     * t 映射：−55°C … 125°C → 滑块位置 0…1。
     */
    private static drawDs18b20(ctx: CanvasRenderingContext2D, tempC: number = 25): void {
        SchematicSymbolRenderer.drawSensor(ctx);
        let tC = tempC;
        if (tC < -55) {
            tC = -55;
        }
        else if (tC > 125) {
            tC = 125;
        }
        const t = (tC + 55) / 180;
        const railL = -22;
        const railR = 22;
        const railY = -22;
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(railL, railY);
        ctx.lineTo(railR, railY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(railL, railY - 4);
        ctx.lineTo(railL, railY + 4);
        ctx.moveTo(railR, railY - 4);
        ctx.lineTo(railR, railY + 4);
        ctx.stroke();
        const wx = railL + t * (railR - railL);
        ctx.fillStyle = '#c45c26';
        ctx.strokeStyle = '#8a3a12';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(wx - 4, railY - 7, 8, 14);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        const label = `${tC >= 0 ? '' : '−'}${Math.abs(Math.round(tC))}°C`;
        ctx.fillText(label, 0, railY - 12);
        ctx.textAlign = 'start';
    }
    private static drawCounter(ctx: CanvasRenderingContext2D): void {
        SchematicSymbolRenderer.drawIcBody(ctx, [], '4017');
    }
    private static drawIcBody(ctx: CanvasRenderingContext2D, pins: Pin[], name: string): void {
        // Use negative padding so the body sits inside the pin positions;
        // pins extend outward from the body edge instead of being buried inside.
        const bounds = calcSymbolBounds(pins, -4);
        const w = Math.max(50, bounds.width);
        const h = Math.max(40, bounds.height);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        if (name.length > 0) {
            const shortName = name.length > 14 ? name.substring(0, 12) + '..' : name;
            ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
            ctx.fillStyle = ProteusColors.TEXT_LABEL;
            ctx.textAlign = 'center';
            ctx.fillText(shortName, 0, 4);
            ctx.textAlign = 'start';
        }
    }
    private static drawPins(ctx: CanvasRenderingContext2D, pins: Pin[], strokeColor: string): void {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        const showLabels = pins.length <= 128;
        for (let i = 0; i < pins.length; i++) {
            const pin = pins[i];
            const px = pin.position.x;
            const py = pin.position.y;
            const ext = SchematicSymbolRenderer.pinExtension(px, py);
            ctx.beginPath();
            ctx.moveTo(ext.x, ext.y);
            ctx.lineTo(px, py);
            ctx.stroke();
            // KiCad-ish 电气类型端点标记（颜色/形状），便于 ERC 目视核对
            SchematicSymbolRenderer.drawPinTypeMarker(ctx, px, py, pin.type, strokeColor);
            // Draw pin number/label at extension point
            if (showLabels) {
                // 少脚器件优先显示功能名（IN/OUT/GND），避免与位号叠数字且更易读
                const preferName = pins.length <= 6 && pin.name.length > 0 && pin.name !== pin.number;
                const label = preferName ? pin.name : (pin.number || pin.name);
                ctx.fillStyle = ProteusColors.TEXT_LABEL;
                ctx.font = '9px sans-serif';
                // Position label just beyond extension point
                const tx = ext.x + (px - ext.x > 0 ? 4 : px - ext.x < 0 ? -4 : 0);
                const ty = ext.y + (py - ext.y > 0 ? 4 : py - ext.y < 0 ? -4 : 0);
                // Align label based on extension direction (horizontal if ext.x changed, vertical if ext.y changed)
                if (ext.x !== px) {
                    ctx.textAlign = px < 0 ? 'end' : 'start';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, tx, ty);
                }
                else {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = py < 0 ? 'bottom' : 'top';
                    ctx.fillText(label, tx, ty);
                }
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }
        }
    }
    /** 引脚电气类型端点：Out=方、In=圆、BiDi=菱、Power/Gnd=色点、OC=三角、Passive=小圆 */
    private static drawPinTypeMarker(ctx: CanvasRenderingContext2D, px: number, py: number, type: PinType, strokeColor: string): void {
        const r = 2.5;
        ctx.lineWidth = 1;
        if (type === PinType.POWER) {
            ctx.fillStyle = ProteusColors.POWER;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (type === PinType.GROUND) {
            ctx.fillStyle = ProteusColors.GROUND;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (type === PinType.OUTPUT) {
            ctx.fillStyle = strokeColor;
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
            return;
        }
        if (type === PinType.BIDIRECTIONAL) {
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.moveTo(px, py - r);
            ctx.lineTo(px + r, py);
            ctx.lineTo(px, py + r);
            ctx.lineTo(px - r, py);
            ctx.closePath();
            ctx.fill();
            return;
        }
        if (type === PinType.OPEN_COLLECTOR) {
            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = ProteusColors.CANVAS_BG;
            ctx.beginPath();
            ctx.moveTo(px, py - r);
            ctx.lineTo(px + r, py + r);
            ctx.lineTo(px - r, py + r);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            return;
        }
        if (type === PinType.ANALOG) {
            ctx.strokeStyle = ProteusColors.ANALOG;
            ctx.fillStyle = ProteusColors.CANVAS_BG;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            return;
        }
        // INPUT / PASSIVE：实心圆
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
    }
    /**
     * SVG must not host pins. Meta pins + outer shell (canvas backdrop / drawPins) are authoritative.
     * - Drop all SVG lines (pin stubs in DeviceLibrary symbols)
     * - Drop small pin-dot circles
     * - Collapse body rects to one inset frame inside pin tips (inner box, no pins)
     */
    private static stripSvgPinCommands(cmds: DrawCommand[], pins: Pin[]): DrawCommand[] {
        if (pins.length === 0 || cmds.length === 0) {
            return cmds;
        }
        const rMax = SchematicSymbolRenderer.SVG_PIN_DOT_R_MAX;
        const inset = SchematicSymbolRenderer.SVG_INNER_BODY_INSET;
        const pinBounds = calcSymbolBounds(pins, 0);
        const inner = calcSymbolBounds(pins, -inset);
        const useInnerBody = pins.length >= 3 || pinBounds.width >= 50 || pinBounds.height >= 40;
        const out: DrawCommand[] = [];
        let emittedInnerRect = false;
        for (let i = 0; i < cmds.length; i++) {
            const c = cmds[i];
            if (c.type === 'line') {
                continue;
            }
            if (c.type === 'circle' && c.r !== undefined && c.r <= rMax) {
                continue;
            }
            if (c.type === 'rect' && useInnerBody) {
                if (emittedInnerRect) {
                    continue;
                }
                if (inner.width < 8 || inner.height < 8) {
                    continue;
                }
                const insetRect: DrawCommand = {
                    type: 'rect',
                    x: inner.minX,
                    y: inner.minY,
                    w: inner.width,
                    h: inner.height,
                    strokeWidth: c.strokeWidth ?? 1.2
                };
                out.push(insetRect);
                emittedInnerRect = true;
                continue;
            }
            out.push(c);
        }
        return out;
    }
    /** SVG 里常见的黑/近黑描边在深色画布上不可见 → 映射到主题描边色 */
    private static resolveSvgStroke(color: string | undefined): string {
        if (color === undefined || color.length === 0) {
            return ProteusColors.COMPONENT_STROKE;
        }
        const c = color.trim().toLowerCase();
        if (c === '#000' || c === '#000000' || c === 'black' || c === '#111' || c === '#111111' ||
            c === '#222' || c === '#222222' || c === 'rgb(0,0,0)' || c === 'rgb(0, 0, 0)') {
            return ProteusColors.COMPONENT_STROKE;
        }
        return color;
    }
    private static drawSvgCommands(ctx: CanvasRenderingContext2D, cmds: DrawCommand[]): void {
        for (let i = 0; i < cmds.length; i++) {
            const c = cmds[i];
            ctx.strokeStyle = SchematicSymbolRenderer.resolveSvgStroke(c.color);
            ctx.lineWidth = c.strokeWidth ?? 1.2;
            if (c.type === 'line' && c.x1 !== undefined && c.y1 !== undefined && c.x2 !== undefined && c.y2 !== undefined) {
                ctx.beginPath();
                ctx.moveTo(c.x1, c.y1);
                ctx.lineTo(c.x2, c.y2);
                ctx.stroke();
            }
            else if (c.type === 'rect' && c.x !== undefined && c.y !== undefined && c.w !== undefined && c.h !== undefined) {
                ctx.strokeRect(c.x, c.y, c.w, c.h);
            }
            else if (c.type === 'circle' && c.x !== undefined && c.y !== undefined && c.r !== undefined) {
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
    private static pinExtension(px: number, py: number): Point2D {
        const ext = 8;
        // Weighted comparison: heavily favor horizontal extension for IC left/right pins
        if (Math.abs(px) * 8 >= Math.abs(py)) {
            const result: Point2D = { x: px < 0 ? px - ext : px + ext, y: py };
            return result;
        }
        const result: Point2D = { x: px, y: py < 0 ? py - ext : py + ext };
        return result;
    }
    private static drawVcc(ctx: CanvasRenderingContext2D): void {
        // Power symbol: horizontal bar with upward vertical line, small circle at top
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, -10);
        ctx.moveTo(-6, 10);
        ctx.lineTo(6, 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -13, 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.textAlign = 'center';
        ctx.fillText('VCC', 0, -22);
        ctx.textAlign = 'start';
    }
    private static drawGnd(ctx: CanvasRenderingContext2D): void {
        // Ground symbol: vertical line down to three descending horizontal bars
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-12, 8);
        ctx.lineTo(12, 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-7, 13);
        ctx.lineTo(7, 13);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3, 18);
        ctx.lineTo(3, 18);
        ctx.stroke();
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.textAlign = 'center';
        ctx.fillText('GND', 0, 28);
        ctx.textAlign = 'start';
    }
    private static drawVee(ctx: CanvasRenderingContext2D): void {
        // Negative rail: mirror of VCC — bar at pin, stem down, circle at bottom
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.moveTo(-6, -10);
        ctx.lineTo(6, -10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 13, 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.textAlign = 'center';
        ctx.fillText('VEE', 0, 28);
        ctx.textAlign = 'start';
    }
    private static drawVac(ctx: CanvasRenderingContext2D): void {
        // AC source: circle with sine wave; pins at (±20, 0)
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.bezierCurveTo(-5, -8, -3, -8, 0, 0);
        ctx.bezierCurveTo(3, 8, 5, 8, 8, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-14, 0);
        ctx.moveTo(14, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.textAlign = 'center';
        ctx.fillText('VAC', 0, -18);
        ctx.textAlign = 'start';
    }
    private static drawSignalGen(ctx: CanvasRenderingContext2D): void {
        // Function generator: box + sine glyph; pins at (±30, 0)
        const w = 36;
        const h = 28;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.bezierCurveTo(-6, -8, -2, -8, 0, 0);
        ctx.bezierCurveTo(2, 8, 6, 8, 10, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-w / 2, 0);
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(30, 0);
        ctx.stroke();
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.textAlign = 'center';
        ctx.fillText('GEN', 0, h / 2 + 10);
        ctx.textAlign = 'start';
    }
    private static drawLabels(ctx: CanvasRenderingContext2D, def: ComponentDefinition, refDes: string, style: SymbolDrawStyle): void {
        const symbolKey = resolveSymbolKey(def.id, def.svgSymbol, def.behaviorModel);
        const isVac = symbolKey === 'vac' || symbolKey === 'signal_gen';
        const bounds = calcSymbolBounds(def.pins, 4);
        const isRegulator = def.behaviorModel === 'regulator';
        const isMeter = def.behaviorModel === 'ammeter_dc' || def.behaviorModel === 'voltmeter_dc';
        // 稳压器底脚有 GND 名，参数下移避免与脚名重叠；位号略上提
        // 电流表表头偏下，位号再上提；量程标在框外下方
        const refY = bounds.minY - (isRegulator || isMeter ? 10 : 4);
        const valY = bounds.maxY + (isRegulator ? 20 : (isMeter ? 14 : (isVac ? 18 : 10)));
        ctx.fillStyle = style.selected ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY;
        ctx.font = `${ProteusFonts.CANVAS_LABEL}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(refDes, 0, refY);
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        let valueKey = def.defaultParams.has('value') ? 'value' :
            (def.defaultParams.has('output') ? 'output' :
                (def.defaultParams.has('range') ? 'range' :
                    (def.defaultParams.has('voltage') ? 'voltage' : '')));
        if (isVac && (def.defaultParams.has('amplitude') ||
            (style.paramOverrides !== undefined && style.paramOverrides.has('amplitude')))) {
            valueKey = 'amplitude';
        }
        // 稳压器参数旁带短型号，便于辨认且不与体内 REG 抢位
        let valueText = '';
        if (valueKey.length > 0) {
            if (style.paramOverrides !== undefined && style.paramOverrides.has(valueKey)) {
                valueText = style.paramOverrides.get(valueKey) ?? '';
            }
            if (valueText.length === 0) {
                valueText = def.defaultParams.get(valueKey) ?? '';
            }
        }
        if (isRegulator && valueKey === 'output' && def.id.length > 0) {
            const shortId = def.id.length > 8 ? def.id.substring(0, 8) : def.id;
            valueText = `${shortId} ${valueText}`;
        }
        if (isVac && valueText.length > 0) {
            let freq = '';
            if (style.paramOverrides !== undefined && style.paramOverrides.has('frequency')) {
                freq = style.paramOverrides.get('frequency') ?? '';
            }
            if (freq.length === 0) {
                freq = def.defaultParams.get('frequency') ?? '';
            }
            if (freq.length > 0) {
                valueText = `${valueText} ${freq}`;
            }
        }
        if (valueText.length > 0) {
            const shortVal = valueText.length > 14 ? valueText.substring(0, 12) + '..' : valueText;
            ctx.fillText(shortVal, 0, valY);
        }
        ctx.textAlign = 'start';
    }
}
