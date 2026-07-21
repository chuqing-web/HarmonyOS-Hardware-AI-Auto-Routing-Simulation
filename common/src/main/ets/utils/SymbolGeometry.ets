/**
 * 器件符号几何计算 — 引脚边界与命中检测
 */
import { Pin, Point2D } from '../types/CommonTypes';

export interface SymbolBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

/** 仪器类符号主体半宽下限（示波器 70×80、逻辑分析仪 64×100） */
const INSTRUMENT_BODY_HALF_MIN = 50;

/**
 * 单侧引脚簇（示波器/电压表等）：符号主体画在原点附近，
 * 若仅用引脚 AABB，选中区会偏到引脚一侧，主体右半落在区外。
 * 将 AABB 扩到覆盖原点对称主体。
 */
export function coverOriginCenteredBody(
  minX: number, maxX: number, minY: number, maxY: number
): SymbolBounds {
  const spansBothX = minX < -8 && maxX > 8;
  const spansBothY = minY < -8 && maxY > 8;
  let outMinX = minX;
  let outMaxX = maxX;
  let outMinY = minY;
  let outMaxY = maxY;

  if (!spansBothX) {
    const pinHalfX = Math.max(Math.abs(minX), Math.abs(maxX));
    // 引脚距原点 ≥18：覆盖小仪器/表头（±20/±30）；VCC 单脚通常 <15
    if (pinHalfX >= 18) {
      const halfX = Math.max(pinHalfX, INSTRUMENT_BODY_HALF_MIN);
      const halfY = Math.max(Math.abs(minY), Math.abs(maxY), INSTRUMENT_BODY_HALF_MIN);
      outMinX = Math.min(outMinX, -halfX);
      outMaxX = Math.max(outMaxX, halfX);
      outMinY = Math.min(outMinY, -halfY);
      outMaxY = Math.max(outMaxY, halfY);
    }
  } else if (!spansBothY) {
    // 左右已有脚（如 TO-220 稳压：IN/OUT + 底 GND）— 只把 Y 扩到盖住原点附近主体，
    // 禁止套用仪器半宽下限，否则边界飙到 ±50，位号/参数/脚名叠成一团。
    const bodyHalfY = 20;
    outMinY = Math.min(outMinY, -bodyHalfY);
    outMaxY = Math.max(outMaxY, bodyHalfY);
  }

  return {
    minX: outMinX,
    maxX: outMaxX,
    minY: outMinY,
    maxY: outMaxY,
    width: outMaxX - outMinX,
    height: outMaxY - outMinY
  };
}

export function calcSymbolBounds(pins: Pin[], padding: number = 10): SymbolBounds {
  if (pins.length === 0) {
    const b: SymbolBounds = { minX: -30, maxX: 30, minY: -20, maxY: 20, width: 60, height: 40 };
    return b;
  }
  let minX = pins[0].position.x;
  let maxX = pins[0].position.x;
  let minY = pins[0].position.y;
  let maxY = pins[0].position.y;
  for (let i = 1; i < pins.length; i++) {
    const p = pins[i].position;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const covered = coverOriginCenteredBody(minX, maxX, minY, maxY);
  const result: SymbolBounds = {
    minX: covered.minX - padding,
    maxX: covered.maxX + padding,
    minY: covered.minY - padding,
    maxY: covered.maxY + padding,
    width: covered.width + padding * 2,
    height: covered.height + padding * 2
  };
  return result;
}

export function pointInSymbolBounds(point: Point2D, origin: Point2D, bounds: SymbolBounds): boolean {
  const lx = point.x - origin.x;
  const ly = point.y - origin.y;
  return lx >= bounds.minX && lx <= bounds.maxX && ly >= bounds.minY && ly <= bounds.maxY;
}

export function resolveSymbolKey(libraryId: string, svgSymbol: string, behaviorModel: string): string {
  const svg = svgSymbol.toLowerCase();
  const id = libraryId.toLowerCase();
  const behavior = behaviorModel.toLowerCase();

  if (id.startsWith('r_') || svg.includes('resistor')) return 'resistor';
  if (id.startsWith('pot_') || behavior === 'potentiometer' || svg.includes('potentiometer')) {
    return 'potentiometer';
  }
  if (id.startsWith('c_') || svg.includes('capacitor') || svg.includes('cap')) return 'capacitor';
  if (id.startsWith('l_') || svg.includes('inductor')) return 'inductor';
  if (id.startsWith('xtal') || svg.includes('crystal')) return 'crystal';
  if (id.includes('fuse')) return 'fuse';
  if (svg.includes('led') || id.startsWith('led_')) return 'led';
  if (svg.includes('diode') || behavior === 'diode' || /^1n\d+/.test(id)) return 'diode';
  if (svg.includes('mosfet') || behavior.includes('mos')) return 'mosfet';
  if (svg.includes('transistor') || behavior === 'npn' || behavior === 'pnp') return 'transistor';
  if (svg.includes('opamp') || behavior === 'opamp') return 'opamp';
  if (svg.includes('timer555') || behavior === 'timer555' || id === 'lm555' || id === 'ne555') {
    return 'timer555';
  }
  if (svg.includes('regulator') || behavior === 'regulator') return 'regulator';
  if (svg.includes('gate_not') || id.includes('hc04') || behavior.includes('not')) return 'gate_not';
  if (svg.includes('gate_nand') || behavior.includes('nand')) return 'gate_nand';
  if (svg.includes('gate_nor') || behavior.includes('nor')) return 'gate_nor';
  if (svg.includes('gate_and') || behavior.includes('and')) return 'gate_and';
  if (svg.includes('gate_or') || behavior.includes('or')) return 'gate_or';
  if (svg.includes('gate_xor') || behavior.includes('xor')) return 'gate_xor';
  if (svg.includes('oscilloscope') || id === 'oscilloscope') return 'oscilloscope';
  if (svg.includes('multimeter') || id === 'virtual_meter') return 'multimeter';
  if (svg.includes('logic_analyzer')) return 'logic_analyzer';
  if (svg.includes('uart') || id === 'uart_terminal') return 'uart_terminal';
  if (svg.includes('voltmeter') || id === 'voltmeter_dc') return 'voltmeter';
  if (svg.includes('ammeter') || id === 'ammeter_dc') return 'ammeter';
  if (svg.includes('power_meter') || id === 'power_meter') return 'power_meter';
  if (svg.includes('freq_counter') || id === 'freq_counter') return 'freq_counter';
  if (svg.includes('lcd') || id === 'lcd1602') return 'lcd';
  if (svg.includes('oled')) return 'oled';
  if (svg.includes('mcu_8051') || behavior === '8051_behavioral') return 'mcu_8051';
  if (svg.includes('mcu_stm32') || behavior === 'stm32_behavioral') return 'mcu_stm32';
  if (svg.includes('memory') || behavior.startsWith('mem_')) return 'memory';
  if (id === 'sw_push') return 'switch';
  if (id === 'relay_spdt' || id.startsWith('relay_')) return 'relay';
  if (id === 'signal_gen' || svg.includes('signal_gen') || behavior === 'signal_gen') {
    return 'signal_gen';
  }
  if (id === 'buzzer') return 'buzzer';
  if (id === 'ds18b20' || id === 'hall_sensor' || id === 'ldr') return 'sensor';
  if (id === 'cd4017') return 'counter';
  if (id === 'vcc' || svg.includes('vcc') || behavior === 'vcc') return 'vcc';
  if (id === 'gnd' || svg.includes('gnd') || behavior === 'gnd') return 'gnd';
  return 'generic_ic';
}
