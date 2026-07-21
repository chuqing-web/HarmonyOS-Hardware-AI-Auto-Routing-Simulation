/**
 * 具名脚默认几何 — 与 NamedDevicePins / BuiltinComponents 对齐。
 * 供 NetPinRebuildUtil / WireNetTopology 在无 library resolver 时回退，
 * 禁止再生成旧版 P1..Pn。
 */
export interface DefaultPinGeom {
    id: string;
    name: string;
    x: number;
    y: number;
}
function geom(id: string, x: number, y: number): DefaultPinGeom {
    const g: DefaultPinGeom = { id: id, name: id, x: x, y: y };
    return g;
}
/** 左右交错：与 NamedDevicePins.layoutNamedPins 一致 */
export function layoutNamedPinGeoms(ids: string[], bodyX: number): DefaultPinGeom[] {
    const pins: DefaultPinGeom[] = [];
    const leftCount = Math.ceil(ids.length / 2);
    const rightCount = Math.floor(ids.length / 2);
    const spacing = 10;
    const bodyHalf = Math.max(leftCount, rightCount) * spacing / 2;
    for (let i = 0; i < leftCount; i++) {
        pins.push(geom(ids[i], -bodyX, i * spacing - bodyHalf));
    }
    for (let i = 0; i < rightCount; i++) {
        pins.push(geom(ids[leftCount + i], bodyX, i * spacing - bodyHalf));
    }
    return pins;
}
function ids8051(): string[] {
    const d: string[] = [];
    for (let i = 0; i < 8; i++) {
        d.push(`P1.${i}`);
    }
    d.push('RST');
    for (let i = 0; i < 8; i++) {
        d.push(`P3.${i}`);
    }
    d.push('XTAL2', 'XTAL1', 'GND');
    for (let i = 0; i < 8; i++) {
        d.push(`P2.${i}`);
    }
    d.push('PSEN', 'ALE', 'EA');
    for (let i = 7; i >= 0; i--) {
        d.push(`P0.${i}`);
    }
    d.push('VCC');
    return d;
}
function idsStm32_48(): string[] {
    const d: string[] = [
        'VDD', 'VSS', 'VDDA', 'VSSA', 'BOOT0', 'NRST', 'OSC_IN', 'OSC_OUT'
    ];
    for (let i = 0; i < 16; i++) {
        d.push(`PA${i}`);
    }
    for (let i = 0; i < 16; i++) {
        d.push(`PB${i}`);
    }
    for (let i = 0; i < 8; i++) {
        d.push(`PC${i}`);
    }
    return d;
}
function idsStm32_32(): string[] {
    const d: string[] = ['VDD', 'VSS', 'NRST', 'BOOT0', 'OSC_IN', 'OSC_OUT'];
    for (let i = 0; i < 16; i++) {
        d.push(`PA${i}`);
    }
    for (let i = 0; i < 10; i++) {
        d.push(`PB${i}`);
    }
    return d;
}
function idsStm32_100(): string[] {
    const d = idsStm32_48().slice();
    for (let i = 0; i < 16; i++) {
        d.push(`PD${i}`);
    }
    for (let i = 0; i < 16; i++) {
        d.push(`PE${i}`);
    }
    for (let i = 8; i < 16; i++) {
        d.push(`PC${i}`);
    }
    for (let i = 0; i < 12; i++) {
        d.push(`PF${i}`);
    }
    return d;
}
/** MCU 具名脚；非 MCU 返回空数组 */
export function namedMcuPinGeoms(libUpper: string): DefaultPinGeom[] {
    if (libUpper.includes('AT89') || libUpper.includes('STC89') || libUpper.includes('STC15') ||
        libUpper.includes('8051') || libUpper.includes('MCS51')) {
        return layoutNamedPinGeoms(ids8051(), 50);
    }
    if (libUpper.includes('STM32') && libUpper.includes('F407')) {
        return layoutNamedPinGeoms(idsStm32_100(), 50);
    }
    if (libUpper.includes('STM32') && libUpper.includes('F030')) {
        return layoutNamedPinGeoms(idsStm32_32(), 50);
    }
    if (libUpper.includes('STM32')) {
        return layoutNamedPinGeoms(idsStm32_48(), 50);
    }
    return [];
}
/**
 * 其它具名封装回退（传感器/LCD/存储/逻辑/buck）。
 * 几何与 NamedDevicePins / TemplateSchematicKit 对齐。
 */
export function namedDevicePinGeoms(libUpper: string): DefaultPinGeom[] {
    if (libUpper === 'DS18B20' || libUpper.includes('DS18B20')) {
        return [
            geom('GND', -30, 0),
            geom('DQ', 0, 28),
            geom('VDD', 30, 0)
        ];
    }
    if (libUpper === 'HALL_SENSOR' || libUpper.includes('HALL')) {
        return [
            geom('VCC', -30, -10),
            geom('OUT', 30, 0),
            geom('GND', -30, 10)
        ];
    }
    if (libUpper === 'LCD1602') {
        return layoutNamedPinGeoms([
            'VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1',
            'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'
        ], 40);
    }
    if (libUpper === 'CD4017') {
        return layoutNamedPinGeoms([
            'Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS',
            'Q8', 'Q4', 'Q9', 'CO', 'CLK', 'EN', 'RST', 'VDD'
        ], 40);
    }
    if (libUpper === 'LM2596') {
        return [
            geom('VIN', -40, -20),
            geom('OUT', 40, -20),
            geom('GND', 0, 40),
            geom('FB', 40, 10),
            geom('ON', -40, 10)
        ];
    }
    if (libUpper === '24C02') {
        return layoutNamedPinGeoms(['A0', 'A1', 'A2', 'VSS', 'SDA', 'SCL', 'WP', 'VCC'], 40);
    }
    if (libUpper === 'W25Q64') {
        return layoutNamedPinGeoms(['CS', 'DO', 'WP', 'GND', 'DI', 'CLK', 'HOLD', 'VCC'], 40);
    }
    if (libUpper === 'OLED_12864') {
        return [
            geom('VCC', -30, -10),
            geom('GND', -30, 10),
            geom('SDA', 30, -10),
            geom('SCL', 30, 10)
        ];
    }
    return [];
}
