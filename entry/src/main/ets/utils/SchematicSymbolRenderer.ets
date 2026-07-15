/**
 * Proteus 风格原理图符号 Canvas 渲染器
 */
import { ComponentDefinition, SvgSymbolCache, DrawCommand } from 'component_library';
import { Pin, PinType, Point2D, Rotation } from 'common';
import { calcSymbolBounds, resolveSymbolKey, SymbolBounds } from 'common';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';

export interface SymbolDrawStyle {
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  selected: boolean;
  hovered: boolean;
  /** LED fill/emission color; empty = unlit (outline only) */
  ledDisplayColor?: string;
  /** Buzzer energised (sounding) — filled body + sound waves */
  buzzerActive?: boolean;
  /** Pushbutton pressed (contacts closed) */
  switchPressed?: boolean;
  /** Potentiometer wiper fraction 0..1 (arrow along track) */
  potWiper?: number;
}

export class SchematicSymbolRenderer {
  static drawComponent(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    def: ComponentDefinition,
    refDes: string,
    rotation: Rotation,
    mirrored: boolean,
    style: SymbolDrawStyle
  ): SymbolBounds {
    ctx.save();
    ctx.translate(originX, originY);
    if (rotation !== 0) {
      ctx.rotate(rotation * Math.PI / 180);
    }
    if (mirrored) {
      ctx.scale(-1, 1);
    }

    const symbolKey = resolveSymbolKey(def.id, def.svgSymbol, def.behaviorModel);
    SchematicSymbolRenderer.drawSymbolBody(
      ctx, symbolKey, def, style.ledDisplayColor ?? '', style.buzzerActive === true,
      style.switchPressed === true,
      style.potWiper !== undefined ? style.potWiper : 0.5
    );
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

  static drawGhost(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    def: ComponentDefinition
  ): void {
    ctx.save();
    ctx.translate(originX, originY);
    ctx.globalAlpha = 0.55;
    // Draw body backdrop for IC-type components so the ghost has a visible border,
    // matching how the canvas renders real components
    const pinBounds = calcSymbolBounds(def.pins, 0);
    if (def.pins.length > 0 && (pinBounds.width >= 50 || pinBounds.height >= 40)) {
      const cx = (pinBounds.minX + pinBounds.maxX) / 2;
      const cy = (pinBounds.minY + pinBounds.maxY) / 2;
      const bodyW = Math.max(pinBounds.width, 12);
      const bodyH = Math.max(pinBounds.height, 12);
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

  private static drawSymbolBody(
    ctx: CanvasRenderingContext2D,
    key: string,
    def: ComponentDefinition,
    ledDisplayColor: string = '',
    buzzerActive: boolean = false,
    switchPressed: boolean = false,
    potWiper: number = 0.5
  ): void {
    ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
    ctx.fillStyle = ProteusColors.CANVAS_BG;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const isIcType = key === 'counter' || key === 'mcu_8051' || key === 'mcu_stm32' ||
      key === 'memory' || key === 'generic_ic';

    // For IC-type components, always draw the body backdrop first so the border
    // is visible even when SVG content exists (device-library components)
    if (isIcType) {
      SchematicSymbolRenderer.drawIcBody(ctx, def.pins, def.name);
    }

    // LED/diode/resistor: always use procedural symbols so pin geometry (±30)
    // matches BuiltinComponents / template kit, even when DeviceLibrary ships SVG
    const skipSvg = key === 'led' || key === 'diode' || key === 'resistor' ||
      key === 'potentiometer' ||
      key === 'capacitor' || key === 'fuse' || key === 'buzzer' || key === 'switch';
    if (!skipSvg && def.svgSymbol.length > 20 && def.svgSymbol.indexOf('<') >= 0) {
      const cmds = SvgSymbolCache.preload(def.id, def.svgSymbol);
      if (cmds.length > 0) {
        SchematicSymbolRenderer.drawSvgCommands(ctx, cmds);
        return;
      }
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
        SchematicSymbolRenderer.drawDiode(ctx, true, ledDisplayColor);
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
        SchematicSymbolRenderer.drawSensor(ctx);
        break;
      case 'counter':
      case 'mcu_8051':
      case 'mcu_stm32':
      case 'memory':
        // Body already drawn above as backdrop
        break;
      case 'vcc':
        SchematicSymbolRenderer.drawVcc(ctx);
        break;
      case 'gnd':
        SchematicSymbolRenderer.drawGnd(ctx);
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
    } else if (t > 0.999) {
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

  private static drawDiode(ctx: CanvasRenderingContext2D, isLed: boolean, ledColor: string): void {
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
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = hex;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.stroke();
    }
    // Cathode bar
    ctx.beginPath();
    ctx.moveTo(8, -10);
    ctx.lineTo(8, 10);
    ctx.stroke();
    // LED light emission arrows
    if (isLed && ledColor.length > 0) {
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
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-10, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.lineTo(-10, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.lineTo(20, -10);
    ctx.lineTo(20, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 10);
    ctx.lineTo(20, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, -10);
    ctx.lineTo(30, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, 10);
    ctx.lineTo(30, 10);
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
    ctx.strokeRect(-25, -20, 50, 40);
    ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
    ctx.fillText('REG', -12, 4);
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
    // Pins at x=-40, y={-20,-10,10,20,40} — body covers y=-40..40
    const w = 70;
    const h = 80;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    // Screen area
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 20);
    // Grid lines
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 0.5;
    for (let gx = -w / 2 + 10; gx < w / 2 - 4; gx += 8) {
      ctx.beginPath();
      ctx.moveTo(gx, -h / 2 + 4);
      ctx.lineTo(gx, h / 2 - 16);
      ctx.stroke();
    }
    for (let gy = -h / 2 + 8; gy < h / 2 - 16; gy += 7) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, gy);
      ctx.lineTo(w / 2 - 4, gy);
      ctx.stroke();
    }
    // Waveform trace
    ctx.strokeStyle = '#00FF88';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, 0);
    ctx.lineTo(-16, -4);
    ctx.lineTo(-6, 6);
    ctx.lineTo(4, -8);
    ctx.lineTo(14, 4);
    ctx.lineTo(24, -2);
    ctx.lineTo(w / 2 - 6, 3);
    ctx.stroke();
    // CH1 label
    ctx.fillStyle = '#00FF88';
    ctx.font = '8px monospace';
    ctx.fillText('CH1', -w / 2 + 8, h / 2 - 6);
    // Title
    ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
    ctx.lineWidth = 1.2;
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
    ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
    ctx.fillText('SCOPE', -16, -h / 2 - 4);
  }

  private static drawMultimeter(ctx: CanvasRenderingContext2D): void {
    // Pins at x=-30, y={-10,10} — body covers y=-32..32
    const w = 54;
    const h = 64;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    // LCD display area
    ctx.fillStyle = '#C8E6C0';
    ctx.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 16);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, 16);
    // 7-segment style reading
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('3.297', -18, -h / 2 + 19);
    // Mode label
    ctx.font = '7px monospace';
    ctx.fillText('DCV', -7, -h / 2 + 25);
    // Dial circle
    const cy = h / 2 - 14;
    ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Dial pointer
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(6, cy - 6);
    ctx.stroke();
    // Title
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
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
    // Pins at x=-30, y={-10,10} — analog meter body
    const r = 18;
    // Half-circle top
    ctx.beginPath();
    ctx.arc(0, 2, r, Math.PI, 0);
    ctx.lineTo(r, 2 + r);
    ctx.arc(0, 2 + r, r, 0, Math.PI);
    ctx.closePath();
    ctx.stroke();
    // Scale arc
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 2, r - 3, Math.PI * 0.82, Math.PI * 0.18, true);
    ctx.stroke();
    // Tick marks
    for (let a = Math.PI * 0.82; a >= Math.PI * 0.18; a -= 0.13) {
      const x1 = (r - 6) * Math.cos(a);
      const y1 = 2 + (r - 6) * Math.sin(a);
      const x2 = (r - 1.5) * Math.cos(a);
      const y2 = 2 + (r - 1.5) * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // Needle
    ctx.strokeStyle = '#CC0000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo((r - 5) * Math.cos(Math.PI * 0.6), 2 + (r - 5) * Math.sin(Math.PI * 0.6));
    ctx.stroke();
    // Center dot
    ctx.fillStyle = '#CC0000';
    ctx.beginPath();
    ctx.arc(0, 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // V label in center
    ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
    ctx.lineWidth = 1;
    ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('V', -3, 6);
    // Title
    ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
    ctx.fillText('VOLT', -12, -r - 6);
  }

  private static drawAmmeter(ctx: CanvasRenderingContext2D): void {
    // Pins at x=-30, y={0,20} — analog meter body
    const r = 18;
    ctx.beginPath();
    ctx.arc(0, 2, r, Math.PI, 0);
    ctx.lineTo(r, 2 + r);
    ctx.arc(0, 2 + r, r, 0, Math.PI);
    ctx.closePath();
    ctx.stroke();
    // Scale arc
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 2, r - 3, Math.PI * 0.82, Math.PI * 0.18, true);
    ctx.stroke();
    // Tick marks
    for (let a = Math.PI * 0.82; a >= Math.PI * 0.18; a -= 0.13) {
      const x1 = (r - 6) * Math.cos(a);
      const y1 = 2 + (r - 6) * Math.sin(a);
      const x2 = (r - 1.5) * Math.cos(a);
      const y2 = 2 + (r - 1.5) * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // Needle
    ctx.strokeStyle = '#CC0000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo((r - 5) * Math.cos(Math.PI * 0.45), 2 + (r - 5) * Math.sin(Math.PI * 0.45));
    ctx.stroke();
    // Center dot
    ctx.fillStyle = '#CC0000';
    ctx.beginPath();
    ctx.arc(0, 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // A label
    ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
    ctx.lineWidth = 1;
    ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('A', -3, 6);
    // Title
    ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
    ctx.fillText('AMP', -11, -r - 6);
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
    ctx.strokeRect(-30, -18, 60, 36);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-24, -12, 48, 24);
    ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
    ctx.fillText('OLED', -14, 28);
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
    ctx.strokeRect(-20, -18, 40, 36);
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
    ctx.strokeRect(-18, -14, 36, 28);
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();
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
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.stroke();
      if (pin.type === PinType.POWER) {
        ctx.fillStyle = ProteusColors.POWER;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (pin.type === PinType.GROUND) {
        ctx.fillStyle = ProteusColors.GROUND;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Draw pin number/label at extension point
      if (showLabels) {
        const label = pin.number || pin.name;
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = '10px sans-serif';
        // Position label just beyond extension point
        const tx = ext.x + (px - ext.x > 0 ? 2 : px - ext.x < 0 ? -2 : 0);
        const ty = ext.y + (py - ext.y > 0 ? 2 : py - ext.y < 0 ? -2 : 0);
        // Align label based on extension direction (horizontal if ext.x changed, vertical if ext.y changed)
        if (ext.x !== px) {
          ctx.textAlign = px < 0 ? 'end' : 'start';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, tx, ty);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = py < 0 ? 'bottom' : 'top';
          ctx.fillText(label, tx, ty);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  private static drawSvgCommands(ctx: CanvasRenderingContext2D, cmds: DrawCommand[]): void {
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      ctx.strokeStyle = c.color ?? ProteusColors.COMPONENT_STROKE;
      ctx.lineWidth = c.strokeWidth ?? 1.2;
      if (c.type === 'line' && c.x1 !== undefined && c.y1 !== undefined && c.x2 !== undefined && c.y2 !== undefined) {
        ctx.beginPath();
        ctx.moveTo(c.x1, c.y1);
        ctx.lineTo(c.x2, c.y2);
        ctx.stroke();
      } else if (c.type === 'rect' && c.x !== undefined && c.y !== undefined && c.w !== undefined && c.h !== undefined) {
        ctx.strokeRect(c.x, c.y, c.w, c.h);
      } else if (c.type === 'circle' && c.x !== undefined && c.y !== undefined && c.r !== undefined) {
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

  private static drawLabels(
    ctx: CanvasRenderingContext2D,
    def: ComponentDefinition,
    refDes: string,
    style: SymbolDrawStyle
  ): void {
    const bounds = calcSymbolBounds(def.pins, 4);
    ctx.fillStyle = style.selected ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY;
    ctx.font = `${ProteusFonts.CANVAS_LABEL}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(refDes, 0, bounds.minY - 4);
    ctx.fillStyle = ProteusColors.TEXT_LABEL;
    ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
    const valueKey = def.defaultParams.has('value') ? 'value' :
      (def.defaultParams.has('output') ? 'output' : '');
    const valueText = valueKey.length > 0 ? (def.defaultParams.get(valueKey) ?? '') : def.id;
    const shortVal = valueText.length > 12 ? valueText.substring(0, 10) + '..' : valueText;
    ctx.fillText(shortVal, 0, bounds.maxY + 10);
    ctx.textAlign = 'start';
  }
}
