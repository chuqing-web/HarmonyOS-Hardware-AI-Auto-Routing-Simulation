import type { Pin, Point2D } from '../types/CommonTypes';
export interface SymbolBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
}
export function calcSymbolBounds(f50: Pin[], g50: number = 10): SymbolBounds {
    if (f50.length === 0) {
        const o50: SymbolBounds = { minX: -30, maxX: 30, minY: -20, maxY: 20, width: 60, height: 40 };
        return o50;
    }
    let h50 = f50[0].position.x;
    let i50 = f50[0].position.x;
    let j50 = f50[0].position.y;
    let k50 = f50[0].position.y;
    for (let m50 = 1; m50 < f50.length; m50++) {
        const n50 = f50[m50].position;
        h50 = Math.min(h50, n50.x);
        i50 = Math.max(i50, n50.x);
        j50 = Math.min(j50, n50.y);
        k50 = Math.max(k50, n50.y);
    }
    const l50: SymbolBounds = {
        minX: h50 - g50,
        maxX: i50 + g50,
        minY: j50 - g50,
        maxY: k50 + g50,
        width: i50 - h50 + g50 * 2,
        height: k50 - j50 + g50 * 2
    };
    return l50;
}
export function pointInSymbolBounds(a50: Point2D, b50: Point2D, c50: SymbolBounds): boolean {
    const d50 = a50.x - b50.x;
    const e50 = a50.y - b50.y;
    return d50 >= c50.minX && d50 <= c50.maxX && e50 >= c50.minY && e50 <= c50.maxY;
}
export function resolveSymbolKey(u49: string, v49: string, w49: string): string {
    const x49 = v49.toLowerCase();
    const y49 = u49.toLowerCase();
    const z49 = w49.toLowerCase();
    if (y49.startsWith('r_') || x49.includes('resistor'))
        return 'resistor';
    if (y49.startsWith('c_') || x49.includes('capacitor') || x49.includes('cap'))
        return 'capacitor';
    if (y49.startsWith('l_') || x49.includes('inductor'))
        return 'inductor';
    if (y49.startsWith('xtal') || x49.includes('crystal'))
        return 'crystal';
    if (y49.includes('fuse'))
        return 'fuse';
    if (x49.includes('led') || y49.startsWith('led_'))
        return 'led';
    if (x49.includes('diode') || z49 === 'diode' || /^1n\d+/.test(y49))
        return 'diode';
    if (x49.includes('mosfet') || z49.includes('mos'))
        return 'mosfet';
    if (x49.includes('transistor') || z49 === 'npn' || z49 === 'pnp')
        return 'transistor';
    if (x49.includes('opamp') || z49 === 'opamp')
        return 'opamp';
    if (x49.includes('regulator') || z49 === 'regulator')
        return 'regulator';
    if (x49.includes('gate_not') || y49.includes('hc04') || z49.includes('not'))
        return 'gate_not';
    if (x49.includes('gate_nand') || z49.includes('nand'))
        return 'gate_nand';
    if (x49.includes('gate_nor') || z49.includes('nor'))
        return 'gate_nor';
    if (x49.includes('gate_and') || z49.includes('and'))
        return 'gate_and';
    if (x49.includes('gate_or') || z49.includes('or'))
        return 'gate_or';
    if (x49.includes('gate_xor') || z49.includes('xor'))
        return 'gate_xor';
    if (x49.includes('oscilloscope') || y49 === 'oscilloscope')
        return 'oscilloscope';
    if (x49.includes('multimeter') || y49 === 'virtual_meter')
        return 'multimeter';
    if (x49.includes('logic_analyzer'))
        return 'logic_analyzer';
    if (x49.includes('uart') || y49 === 'uart_terminal')
        return 'uart_terminal';
    if (x49.includes('voltmeter') || y49 === 'voltmeter_dc')
        return 'voltmeter';
    if (x49.includes('ammeter') || y49 === 'ammeter_dc')
        return 'ammeter';
    if (x49.includes('power_meter') || y49 === 'power_meter')
        return 'power_meter';
    if (x49.includes('freq_counter') || y49 === 'freq_counter')
        return 'freq_counter';
    if (x49.includes('lcd') || y49 === 'lcd1602')
        return 'lcd';
    if (x49.includes('oled'))
        return 'oled';
    if (x49.includes('mcu_8051') || z49 === '8051_behavioral')
        return 'mcu_8051';
    if (x49.includes('mcu_stm32') || z49 === 'stm32_behavioral')
        return 'mcu_stm32';
    if (x49.includes('memory') || z49.startsWith('mem_'))
        return 'memory';
    if (y49 === 'sw_push')
        return 'switch';
    if (y49 === 'relay_spdt')
        return 'relay';
    if (y49 === 'buzzer')
        return 'buzzer';
    if (y49 === 'ds18b20' || y49 === 'hall_sensor' || y49 === 'ldr')
        return 'sensor';
    if (y49 === 'cd4017')
        return 'counter';
    if (y49 === 'vcc' || x49.includes('vcc') || z49 === 'vcc')
        return 'vcc';
    if (y49 === 'gnd' || x49.includes('gnd') || z49 === 'gnd')
        return 'gnd';
    return 'generic_ic';
}
