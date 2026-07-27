/**
 * pin_id 数字/别名 → Builtin pin.id（Kit 几何真脚）
 *
 * 约定：
 * - DeviceLibrary: pin_id=封装数字, pin_label=语义名
 * - Builtin: pin.id=几何真脚, makePin 第3参=封装号
 * - Kit: 先 PinIdRegistry.resolve 再 pinOffset
 *
 * 生成：node tools/gen_pin_id_registry.js
 * 审计：node tools/pin_convention_audit.js
 */
export class PinIdRegistry {
    /** libDevId(upper) / 族键 → pinToken(upper) → Builtin pin.id */
    private static readonly MAP: Record<string, Record<string, string>> = {
        '1N4007': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        '1N4148': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        '1N5819': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        '24C02': { '1': 'A0', '2': 'A1', '3': 'A2', '4': 'VSS', '5': 'SDA', '6': 'SCL', '7': 'WP', '8': 'VCC', 'A0': 'A0', 'A1': 'A1', 'A2': 'A2', 'VSS': 'VSS', 'SDA': 'SDA', 'SCL': 'SCL', 'WP': 'WP', 'VCC': 'VCC' },
        '2764': { '1': 'VPP', '2': 'A0', '3': 'A1', '4': 'A2', '5': 'A3', '6': 'A4', '7': 'A5', '8': 'A6', '9': 'A7', '10': 'D0', '11': 'D1', '12': 'D2', '13': 'D3', '14': 'D4', '15': 'D5', '16': 'D6', '17': 'D7', '18': 'GND', '19': 'CE', '20': 'OE', '21': 'A8', '22': 'A9', '23': 'A10', '24': 'A11', '25': 'A12', '26': 'VCC', '27': 'NC26', '28': 'NC27', 'VPP': 'VPP', 'A0': 'A0', 'A1': 'A1', 'A2': 'A2', 'A3': 'A3', 'A4': 'A4', 'A5': 'A5', 'A6': 'A6', 'A7': 'A7', 'D0': 'D0', 'D1': 'D1', 'D2': 'D2', 'D3': 'D3', 'D4': 'D4', 'D5': 'D5', 'D6': 'D6', 'D7': 'D7', 'GND': 'GND', 'CE': 'CE', 'OE': 'OE', 'A8': 'A8', 'A9': 'A9', 'A10': 'A10', 'A11': 'A11', 'A12': 'A12', 'VCC': 'VCC', 'NC26': 'NC26', 'NC27': 'NC27' },
        '2N2222': { '1': 'B', '2': 'C', '3': 'E', 'B': 'B', 'C': 'C', 'E': 'E' },
        '2N2907': { '1': 'B', '2': 'C', '3': 'E', 'B': 'B', 'C': 'C', 'E': 'E' },
        '2N7000': { '1': 'G', '2': 'D', '3': 'S', 'G': 'G', 'D': 'D', 'S': 'S' },
        '62256': { '1': 'A14', '2': 'A0', '3': 'A1', '4': 'A2', '5': 'A3', '6': 'A4', '7': 'A5', '8': 'A6', '9': 'A7', '10': 'D0', '11': 'D1', '12': 'D2', '13': 'D3', '14': 'D4', '15': 'D5', '16': 'D6', '17': 'D7', '18': 'GND', '19': 'CE', '20': 'OE', '21': 'A8', '22': 'A9', '23': 'A10', '24': 'A11', '25': 'A12', '26': 'A13', '27': 'WE', '28': 'VCC', 'A14': 'A14', 'A0': 'A0', 'A1': 'A1', 'A2': 'A2', 'A3': 'A3', 'A4': 'A4', 'A5': 'A5', 'A6': 'A6', 'A7': 'A7', 'D0': 'D0', 'D1': 'D1', 'D2': 'D2', 'D3': 'D3', 'D4': 'D4', 'D5': 'D5', 'D6': 'D6', 'D7': 'D7', 'GND': 'GND', 'CE': 'CE', 'OE': 'OE', 'A8': 'A8', 'A9': 'A9', 'A10': 'A10', 'A11': 'A11', 'A12': 'A12', 'A13': 'A13', 'WE': 'WE', 'VCC': 'VCC' },
        '74HC00': { '1': '1', '2': '2', '3': '3', '7': '7', '14': '14', 'A': '1', 'B': '2', 'Y': '3', 'GND': '7', 'VCC': '14' },
        '74HC02': { '1': '1', '2': '2', '3': '3', '7': '7', '14': '14', 'A': '1', 'B': '2', 'Y': '3', 'GND': '7', 'VCC': '14' },
        '74HC04': { '1': '1', '2': '2', '7': '7', '14': '14', 'A': '1', 'Y': '2', 'GND': '7', 'VCC': '14' },
        '74HC08': { '1': '1', '2': '2', '3': '3', '7': '7', '14': '14', 'A': '1', 'B': '2', 'Y': '3', 'GND': '7', 'VCC': '14' },
        '74HC32': { '1': '1', '2': '2', '3': '3', '7': '7', '14': '14', 'A': '1', 'B': '2', 'Y': '3', 'GND': '7', 'VCC': '14' },
        '74HC74': { '1': '1', '2': '2', '3': '3', '7': '7', '14': '14', 'A': '1', 'B': '2', 'Y': '3', 'GND': '7', 'VCC': '14' },
        'AMMETER_DC': { '1': 'I+', '2': 'I-', 'I+': 'I+', 'I-': 'I-' },
        'AMS1117_3V3': { '1': '1', '2': '2', '3': '3', 'IN': '1', 'GND': '2', 'OUT': '3', 'VIN': '1', 'INPUT': '1', 'GROUND': '2', 'ADJ': '2', 'VOUT': '3', 'OUTPUT': '3' },
        'AT89C51': { '1': 'P1.0', '2': 'P1.1', '3': 'P1.2', '4': 'P1.3', '5': 'P1.4', '6': 'P1.5', '7': 'P1.6', '8': 'P1.7', '9': 'RST', '10': 'P3.0', '11': 'P3.1', '12': 'P3.2', '13': 'P3.3', '14': 'P3.4', '15': 'P3.5', '16': 'P3.6', '17': 'P3.7', '18': 'XTAL2', '19': 'XTAL1', '20': 'GND', '21': 'P2.0', '22': 'P2.1', '23': 'P2.2', '24': 'P2.3', '25': 'P2.4', '26': 'P2.5', '27': 'P2.6', '28': 'P2.7', '29': 'PSEN', '30': 'ALE', '31': 'EA', '32': 'P0.7', '33': 'P0.6', '34': 'P0.5', '35': 'P0.4', '36': 'P0.3', '37': 'P0.2', '38': 'P0.1', '39': 'P0.0', '40': 'VCC', 'P1.0': 'P1.0', 'P1.1': 'P1.1', 'P1.2': 'P1.2', 'P1.3': 'P1.3', 'P1.4': 'P1.4', 'P1.5': 'P1.5', 'P1.6': 'P1.6', 'P1.7': 'P1.7', 'RST': 'RST', 'P3.0': 'P3.0', 'P3.1': 'P3.1', 'P3.2': 'P3.2', 'P3.3': 'P3.3', 'P3.4': 'P3.4', 'P3.5': 'P3.5', 'P3.6': 'P3.6', 'P3.7': 'P3.7', 'XTAL2': 'XTAL2', 'XTAL1': 'XTAL1', 'GND': 'GND', 'P2.0': 'P2.0', 'P2.1': 'P2.1', 'P2.2': 'P2.2', 'P2.3': 'P2.3', 'P2.4': 'P2.4', 'P2.5': 'P2.5', 'P2.6': 'P2.6', 'P2.7': 'P2.7', 'PSEN': 'PSEN', 'ALE': 'ALE', 'EA': 'EA', 'P0.7': 'P0.7', 'P0.6': 'P0.6', 'P0.5': 'P0.5', 'P0.4': 'P0.4', 'P0.3': 'P0.3', 'P0.2': 'P0.2', 'P0.1': 'P0.1', 'P0.0': 'P0.0', 'VCC': 'VCC' },
        'AT89C52': { '1': 'P1.0', '2': 'P1.1', '3': 'P1.2', '4': 'P1.3', '5': 'P1.4', '6': 'P1.5', '7': 'P1.6', '8': 'P1.7', '9': 'RST', '10': 'P3.0', '11': 'P3.1', '12': 'P3.2', '13': 'P3.3', '14': 'P3.4', '15': 'P3.5', '16': 'P3.6', '17': 'P3.7', '18': 'XTAL2', '19': 'XTAL1', '20': 'GND', '21': 'P2.0', '22': 'P2.1', '23': 'P2.2', '24': 'P2.3', '25': 'P2.4', '26': 'P2.5', '27': 'P2.6', '28': 'P2.7', '29': 'PSEN', '30': 'ALE', '31': 'EA', '32': 'P0.7', '33': 'P0.6', '34': 'P0.5', '35': 'P0.4', '36': 'P0.3', '37': 'P0.2', '38': 'P0.1', '39': 'P0.0', '40': 'VCC', 'P1.0': 'P1.0', 'P1.1': 'P1.1', 'P1.2': 'P1.2', 'P1.3': 'P1.3', 'P1.4': 'P1.4', 'P1.5': 'P1.5', 'P1.6': 'P1.6', 'P1.7': 'P1.7', 'RST': 'RST', 'P3.0': 'P3.0', 'P3.1': 'P3.1', 'P3.2': 'P3.2', 'P3.3': 'P3.3', 'P3.4': 'P3.4', 'P3.5': 'P3.5', 'P3.6': 'P3.6', 'P3.7': 'P3.7', 'XTAL2': 'XTAL2', 'XTAL1': 'XTAL1', 'GND': 'GND', 'P2.0': 'P2.0', 'P2.1': 'P2.1', 'P2.2': 'P2.2', 'P2.3': 'P2.3', 'P2.4': 'P2.4', 'P2.5': 'P2.5', 'P2.6': 'P2.6', 'P2.7': 'P2.7', 'PSEN': 'PSEN', 'ALE': 'ALE', 'EA': 'EA', 'P0.7': 'P0.7', 'P0.6': 'P0.6', 'P0.5': 'P0.5', 'P0.4': 'P0.4', 'P0.3': 'P0.3', 'P0.2': 'P0.2', 'P0.1': 'P0.1', 'P0.0': 'P0.0', 'VCC': 'VCC' },
        'BUZZER': { '1': '1', '2': '2' },
        'CD4017': { '1': 'Q5', '2': 'Q1', '3': 'Q0', '4': 'Q2', '5': 'Q6', '6': 'Q7', '7': 'Q3', '8': 'VSS', '9': 'Q8', '10': 'Q4', '11': 'Q9', '12': 'CO', '13': 'CLK', '14': 'EN', '15': 'RST', '16': 'VDD', 'Q5': 'Q5', 'Q1': 'Q1', 'Q0': 'Q0', 'Q2': 'Q2', 'Q6': 'Q6', 'Q7': 'Q7', 'Q3': 'Q3', 'VSS': 'VSS', 'Q8': 'Q8', 'Q4': 'Q4', 'Q9': 'Q9', 'CO': 'CO', 'CLK': 'CLK', 'EN': 'EN', 'RST': 'RST', 'VDD': 'VDD' },
        'C_100NF': { '1': '1', '2': '2' },
        'C_100PF': { '1': '1', '2': '2' },
        'C_100UF': { '1': '1', '2': '2' },
        'C_10NF': { '1': '1', '2': '2' },
        'C_10PF': { '1': '1', '2': '2' },
        'C_10UF': { '1': '1', '2': '2' },
        'C_1NF': { '1': '1', '2': '2' },
        'C_1UF': { '1': '1', '2': '2' },
        'DS18B20': { '1': 'GND', '2': 'DQ', '3': 'VDD', 'GND': 'GND', 'DQ': 'DQ', 'VDD': 'VDD' },
        'FREQ_COUNTER': { '1': 'IN', '2': 'GND', 'IN': 'IN', 'GND': 'GND' },
        'FUSE_1A': { '1': '1', '2': '2' },
        'GND': { '1': '1', 'GND': '1' },
        'HALL_SENSOR': { '1': 'VCC', '2': 'OUT', '3': 'GND', 'VCC': 'VCC', 'OUT': 'OUT', 'GND': 'GND' },
        'IRF540': { '1': 'G', '2': 'D', '3': 'S', 'G': 'G', 'D': 'D', 'S': 'S' },
        'LCD1602': { '1': 'VSS', '2': 'VDD', '3': 'V0', '4': 'RS', '5': 'RW', '6': 'E', '7': 'D0', '8': 'D1', '9': 'D2', '10': 'D3', '11': 'D4', '12': 'D5', '13': 'D6', '14': 'D7', '15': 'A', '16': 'K', 'VSS': 'VSS', 'VDD': 'VDD', 'V0': 'V0', 'RS': 'RS', 'RW': 'RW', 'E': 'E', 'D0': 'D0', 'D1': 'D1', 'D2': 'D2', 'D3': 'D3', 'D4': 'D4', 'D5': 'D5', 'D6': 'D6', 'D7': 'D7', 'A': 'A', 'K': 'K' },
        'LDR': { '1': '1', '2': '2' },
        'LED_BLUE': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        'LED_GREEN': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        'LED_RED': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        'LM2596': { '1': 'VIN', '2': 'OUT', '3': 'GND', '4': 'FB', '5': 'ON', 'VIN': 'VIN', 'OUT': 'OUT', 'GND': 'GND', 'FB': 'FB', 'ON': 'ON' },
        'LM324': { '1': 'OUT1', '2': 'IN-1', '3': 'IN+1', '4': 'V-', '5': 'IN+2', '6': 'IN-2', '7': 'OUT2', '8': 'V+', 'OUT1': 'OUT1', 'IN-1': 'IN-1', 'IN+1': 'IN+1', 'V-': 'V-', 'IN+2': 'IN+2', 'IN-2': 'IN-2', 'OUT2': 'OUT2', 'V+': 'V+', 'OUTA': 'OUT1', 'OUTB': 'OUT2', 'INN1': 'IN-1', 'INP1': 'IN+1', 'INN2': 'IN-2', 'INP2': 'IN+2', '-IN1': 'IN-1', '+IN1': 'IN+1', '-IN2': 'IN-2', '+IN2': 'IN+2', 'VEE': 'V-', 'VCC': 'V+', 'VSS': 'V-', 'VDD': 'V+' },
        'LM358': { '1': 'OUT1', '2': 'IN-1', '3': 'IN+1', '4': 'V-', '5': 'IN+2', '6': 'IN-2', '7': 'OUT2', '8': 'V+', 'OUT1': 'OUT1', 'IN-1': 'IN-1', 'IN+1': 'IN+1', 'V-': 'V-', 'IN+2': 'IN+2', 'IN-2': 'IN-2', 'OUT2': 'OUT2', 'V+': 'V+', 'OUTA': 'OUT1', 'OUTB': 'OUT2', 'INN1': 'IN-1', 'INP1': 'IN+1', 'INN2': 'IN-2', 'INP2': 'IN+2', '-IN1': 'IN-1', '+IN1': 'IN+1', '-IN2': 'IN-2', '+IN2': 'IN+2', 'VEE': 'V-', 'VCC': 'V+', 'VSS': 'V-', 'VDD': 'V+' },
        'LM555': { '1': 'GND', '2': 'TRIG', '3': 'OUT', '4': 'RESET', '5': 'CTRL', '6': 'THRES', '7': 'DISCH', '8': 'VCC', 'GND': 'GND', 'TRIG': 'TRIG', 'OUT': 'OUT', 'RESET': 'RESET', 'CTRL': 'CTRL', 'THRES': 'THRES', 'DISCH': 'DISCH', 'VCC': 'VCC', 'CONT': 'CTRL', 'CONTROL': 'CTRL', 'CV': 'CTRL', 'TRIGGER': 'TRIG', 'THR': 'THRES', 'THRESHOLD': 'THRES', 'DISCHARGE': 'DISCH', 'RST': 'RESET', 'OUTPUT': 'OUT' },
        'LM741': { '2': 'IN-', '3': 'IN+', '4': 'VEE', '6': 'OUT', '7': 'VCC', 'IN+': 'IN+', 'IN-': 'IN-', 'OUT': 'OUT', 'VCC': 'VCC', 'VEE': 'VEE', 'V+': 'VCC', 'V-': 'VEE', '+IN': 'IN+', '-IN': 'IN-', 'INP': 'IN+', 'INN': 'IN-', 'OUTPUT': 'OUT', 'VDD': 'VCC', 'VSS': 'VEE' },
        'LM7805': { '1': '1', '2': '2', '3': '3', 'IN': '1', 'GND': '2', 'OUT': '3', 'VIN': '1', 'INPUT': '1', 'GROUND': '2', 'ADJ': '2', 'VOUT': '3', 'OUTPUT': '3' },
        'LM7812': { '1': '1', '2': '2', '3': '3', 'IN': '1', 'GND': '2', 'OUT': '3', 'VIN': '1', 'INPUT': '1', 'GROUND': '2', 'ADJ': '2', 'VOUT': '3', 'OUTPUT': '3' },
        'LOGIC_ANALYZER': { '1': 'TX', '2': 'RX', '3': 'GND', '4': 'CH4', '5': 'CH5', '6': 'CH6', '7': 'CH7', '8': 'CH8', '9': 'GND', 'CH${I + 1}': 'CH${i + 1}', '${I + 1}': 'CH${i + 1}', 'GND': 'GND', 'TX': 'TX', 'RX': 'RX', 'CH4': 'CH4', 'CH5': 'CH5', 'CH6': 'CH6', 'CH7': 'CH7', 'CH8': 'CH8' },
        'L_10UH': { '1': '1', '2': '2' },
        'NE555': { '1': 'GND', '2': 'TRIG', '3': 'OUT', '4': 'RESET', '5': 'CTRL', '6': 'THRES', '7': 'DISCH', '8': 'VCC', 'GND': 'GND', 'TRIG': 'TRIG', 'OUT': 'OUT', 'RESET': 'RESET', 'CTRL': 'CTRL', 'THRES': 'THRES', 'DISCH': 'DISCH', 'VCC': 'VCC', 'CONT': 'CTRL', 'CONTROL': 'CTRL', 'CV': 'CTRL', 'TRIGGER': 'TRIG', 'THR': 'THRES', 'THRESHOLD': 'THRES', 'DISCHARGE': 'DISCH', 'RST': 'RESET', 'OUTPUT': 'OUT' },
        'OLED_12864': { '1': 'VCC', '2': 'GND', '3': 'SDA', '4': 'SCL', 'VCC': 'VCC', 'GND': 'GND', 'SDA': 'SDA', 'SCL': 'SCL' },
        'OSCILLOSCOPE': { '1': 'CH1', '2': 'CH2', '3': 'CH3', '4': 'CH4', '5': 'GND', 'CH1': 'CH1', 'CH2': 'CH2', 'CH3': 'CH3', 'CH4': 'CH4', 'GND': 'GND', 'GROUND': 'GND', 'COM': 'GND', 'CHANNEL1': 'CH1', 'CHANNEL2': 'CH2', 'CHANNEL3': 'CH3', 'CHANNEL4': 'CH4' },
        'POT_100K': { '1': '1', '2': '2', '3': 'W', 'W': 'W' },
        'POT_10K': { '1': '1', '2': '2', '3': 'W', 'W': 'W' },
        'POT_1K': { '1': '1', '2': '2', '3': 'W', 'W': 'W' },
        'POWER_METER': { '1': 'V+', '2': 'V-', '3': 'I+', '4': 'I-', 'V+': 'V+', 'V-': 'V-', 'I+': 'I+', 'I-': 'I-' },
        'RELAY_SPDT': { '1': '1', '2': '2', '3': 'COM', '4': 'NO', '5': 'NC', 'COM': 'COM', 'NO': 'NO', 'NC': 'NC' },
        'R_10': { '1': '1', '2': '2' },
        'R_100': { '1': '1', '2': '2' },
        'R_100K': { '1': '1', '2': '2' },
        'R_10K': { '1': '1', '2': '2' },
        'R_1K': { '1': '1', '2': '2' },
        'R_330': { '1': '1', '2': '2' },
        'R_4.7K': { '1': '1', '2': '2' },
        'R_47K': { '1': '1', '2': '2' },
        'SIGNAL_GEN': { '1': 'OUT', '2': 'GND', 'OUT': 'OUT', 'GND': 'GND', 'OUTPUT': 'OUT', 'GROUND': 'GND' },
        'STC15W408AS': { '1': 'P1.0', '2': 'P1.1', '3': 'P1.2', '4': 'P1.3', '5': 'P1.4', '6': 'P1.5', '7': 'P1.6', '8': 'P1.7', '9': 'RST', '10': 'P3.0', '11': 'P3.1', '12': 'P3.2', '13': 'P3.3', '14': 'P3.4', '15': 'P3.5', '16': 'P3.6', '17': 'P3.7', '18': 'XTAL2', '19': 'XTAL1', '20': 'GND', '21': 'P2.0', '22': 'P2.1', '23': 'P2.2', '24': 'P2.3', '25': 'P2.4', '26': 'P2.5', '27': 'P2.6', '28': 'P2.7', '29': 'PSEN', '30': 'ALE', '31': 'EA', '32': 'P0.7', '33': 'P0.6', '34': 'P0.5', '35': 'P0.4', '36': 'P0.3', '37': 'P0.2', '38': 'P0.1', '39': 'P0.0', '40': 'VCC', 'P1.0': 'P1.0', 'P1.1': 'P1.1', 'P1.2': 'P1.2', 'P1.3': 'P1.3', 'P1.4': 'P1.4', 'P1.5': 'P1.5', 'P1.6': 'P1.6', 'P1.7': 'P1.7', 'RST': 'RST', 'P3.0': 'P3.0', 'P3.1': 'P3.1', 'P3.2': 'P3.2', 'P3.3': 'P3.3', 'P3.4': 'P3.4', 'P3.5': 'P3.5', 'P3.6': 'P3.6', 'P3.7': 'P3.7', 'XTAL2': 'XTAL2', 'XTAL1': 'XTAL1', 'GND': 'GND', 'P2.0': 'P2.0', 'P2.1': 'P2.1', 'P2.2': 'P2.2', 'P2.3': 'P2.3', 'P2.4': 'P2.4', 'P2.5': 'P2.5', 'P2.6': 'P2.6', 'P2.7': 'P2.7', 'PSEN': 'PSEN', 'ALE': 'ALE', 'EA': 'EA', 'P0.7': 'P0.7', 'P0.6': 'P0.6', 'P0.5': 'P0.5', 'P0.4': 'P0.4', 'P0.3': 'P0.3', 'P0.2': 'P0.2', 'P0.1': 'P0.1', 'P0.0': 'P0.0', 'VCC': 'VCC' },
        'STC89C52': { '1': 'P1.0', '2': 'P1.1', '3': 'P1.2', '4': 'P1.3', '5': 'P1.4', '6': 'P1.5', '7': 'P1.6', '8': 'P1.7', '9': 'RST', '10': 'P3.0', '11': 'P3.1', '12': 'P3.2', '13': 'P3.3', '14': 'P3.4', '15': 'P3.5', '16': 'P3.6', '17': 'P3.7', '18': 'XTAL2', '19': 'XTAL1', '20': 'GND', '21': 'P2.0', '22': 'P2.1', '23': 'P2.2', '24': 'P2.3', '25': 'P2.4', '26': 'P2.5', '27': 'P2.6', '28': 'P2.7', '29': 'PSEN', '30': 'ALE', '31': 'EA', '32': 'P0.7', '33': 'P0.6', '34': 'P0.5', '35': 'P0.4', '36': 'P0.3', '37': 'P0.2', '38': 'P0.1', '39': 'P0.0', '40': 'VCC', 'P1.0': 'P1.0', 'P1.1': 'P1.1', 'P1.2': 'P1.2', 'P1.3': 'P1.3', 'P1.4': 'P1.4', 'P1.5': 'P1.5', 'P1.6': 'P1.6', 'P1.7': 'P1.7', 'RST': 'RST', 'P3.0': 'P3.0', 'P3.1': 'P3.1', 'P3.2': 'P3.2', 'P3.3': 'P3.3', 'P3.4': 'P3.4', 'P3.5': 'P3.5', 'P3.6': 'P3.6', 'P3.7': 'P3.7', 'XTAL2': 'XTAL2', 'XTAL1': 'XTAL1', 'GND': 'GND', 'P2.0': 'P2.0', 'P2.1': 'P2.1', 'P2.2': 'P2.2', 'P2.3': 'P2.3', 'P2.4': 'P2.4', 'P2.5': 'P2.5', 'P2.6': 'P2.6', 'P2.7': 'P2.7', 'PSEN': 'PSEN', 'ALE': 'ALE', 'EA': 'EA', 'P0.7': 'P0.7', 'P0.6': 'P0.6', 'P0.5': 'P0.5', 'P0.4': 'P0.4', 'P0.3': 'P0.3', 'P0.2': 'P0.2', 'P0.1': 'P0.1', 'P0.0': 'P0.0', 'VCC': 'VCC' },
        'STM32F030F4': { '1': 'VDD', '2': 'VSS', '3': 'NRST', '4': 'BOOT0', '5': 'OSC_IN', '6': 'OSC_OUT', '7': 'PA0', '8': 'PA1', '9': 'PA2', '10': 'PA3', '11': 'PA4', '12': 'PA5', '13': 'PA6', '14': 'PA7', '15': 'PA8', '16': 'PA9', '17': 'PA10', '18': 'PA11', '19': 'PA12', '20': 'PA13', '21': 'PA14', '22': 'PA15', '23': 'PB0', '24': 'PB1', '25': 'PB2', '26': 'PB3', '27': 'PB4', '28': 'PB5', '29': 'PB6', '30': 'PB7', '31': 'PB8', '32': 'PB9', 'VDD': 'VDD', 'VSS': 'VSS', 'NRST': 'NRST', 'BOOT0': 'BOOT0', 'OSC_IN': 'OSC_IN', 'OSC_OUT': 'OSC_OUT', 'PA0': 'PA0', 'PA1': 'PA1', 'PA2': 'PA2', 'PA3': 'PA3', 'PA4': 'PA4', 'PA5': 'PA5', 'PA6': 'PA6', 'PA7': 'PA7', 'PA8': 'PA8', 'PA9': 'PA9', 'PA10': 'PA10', 'PA11': 'PA11', 'PA12': 'PA12', 'PA13': 'PA13', 'PA14': 'PA14', 'PA15': 'PA15', 'PB0': 'PB0', 'PB1': 'PB1', 'PB2': 'PB2', 'PB3': 'PB3', 'PB4': 'PB4', 'PB5': 'PB5', 'PB6': 'PB6', 'PB7': 'PB7', 'PB8': 'PB8', 'PB9': 'PB9' },
        'STM32F103C8': { '1': 'VDD', '2': 'VSS', '3': 'VDDA', '4': 'VSSA', '5': 'BOOT0', '6': 'NRST', '7': 'OSC_IN', '8': 'OSC_OUT', '9': 'PA0', '10': 'PA1', '11': 'PA2', '12': 'PA3', '13': 'PA4', '14': 'PA5', '15': 'PA6', '16': 'PA7', '17': 'PA8', '18': 'PA9', '19': 'PA10', '20': 'PA11', '21': 'PA12', '22': 'PA13', '23': 'PA14', '24': 'PA15', '25': 'PB0', '26': 'PB1', '27': 'PB2', '28': 'PB3', '29': 'PB4', '30': 'PB5', '31': 'PB6', '32': 'PB7', '33': 'PB8', '34': 'PB9', '35': 'PB10', '36': 'PB11', '37': 'PB12', '38': 'PB13', '39': 'PB14', '40': 'PB15', '41': 'PC0', '42': 'PC1', '43': 'PC2', '44': 'PC3', '45': 'PC4', '46': 'PC5', '47': 'PC6', '48': 'PC7', 'VDD': 'VDD', 'VSS': 'VSS', 'VDDA': 'VDDA', 'VSSA': 'VSSA', 'BOOT0': 'BOOT0', 'NRST': 'NRST', 'OSC_IN': 'OSC_IN', 'OSC_OUT': 'OSC_OUT', 'PA0': 'PA0', 'PA1': 'PA1', 'PA2': 'PA2', 'PA3': 'PA3', 'PA4': 'PA4', 'PA5': 'PA5', 'PA6': 'PA6', 'PA7': 'PA7', 'PA8': 'PA8', 'PA9': 'PA9', 'PA10': 'PA10', 'PA11': 'PA11', 'PA12': 'PA12', 'PA13': 'PA13', 'PA14': 'PA14', 'PA15': 'PA15', 'PB0': 'PB0', 'PB1': 'PB1', 'PB2': 'PB2', 'PB3': 'PB3', 'PB4': 'PB4', 'PB5': 'PB5', 'PB6': 'PB6', 'PB7': 'PB7', 'PB8': 'PB8', 'PB9': 'PB9', 'PB10': 'PB10', 'PB11': 'PB11', 'PB12': 'PB12', 'PB13': 'PB13', 'PB14': 'PB14', 'PB15': 'PB15', 'PC0': 'PC0', 'PC1': 'PC1', 'PC2': 'PC2', 'PC3': 'PC3', 'PC4': 'PC4', 'PC5': 'PC5', 'PC6': 'PC6', 'PC7': 'PC7' },
        'STM32F103C8T6': { '1': 'PE2', '2': 'PE3', '3': 'PE4', '4': 'PE5', '5': 'PE6', '6': 'VBAT', '7': 'PC13', '8': 'PC14', '9': 'PC15', '10': 'OSC_IN', '11': 'OSC_OUT', '12': 'NRST', '13': 'VSSA', '14': 'VDDA', '15': 'PA0', '16': 'PA1', '17': 'PA2', '18': 'PA3', '19': 'PA4', '20': 'PA5', '21': 'PA6', '22': 'PA7', '23': 'PC4', '24': 'PC5', '25': 'PB0', '26': 'PB1', '27': 'PB2', '28': 'PB10', '29': 'PB11', '30': 'VSS_1', '31': 'VDD_1', '32': 'PA8', '33': 'PA9', '34': 'PA10', '35': 'PA11', '36': 'PA12', '37': 'PA13', '38': 'PA14', '39': 'PA15', '40': 'PB3', '41': 'PB4', '42': 'PB5', '43': 'PB6', '44': 'PB7', '45': 'PB8', '46': 'PB9', '47': 'VSS_2', '48': 'VDD_2', 'PE2': 'PE2', 'PE3': 'PE3', 'PE4': 'PE4', 'PE5': 'PE5', 'PE6': 'PE6', 'VBAT': 'VBAT', 'PC13': 'PC13', 'PC14': 'PC14', 'PC15': 'PC15', 'OSC_IN': 'OSC_IN', 'OSC_OUT': 'OSC_OUT', 'NRST': 'NRST', 'VSSA': 'VSSA', 'VDDA': 'VDDA', 'PA0': 'PA0', 'PA1': 'PA1', 'PA2': 'PA2', 'PA3': 'PA3', 'PA4': 'PA4', 'PA5': 'PA5', 'PA6': 'PA6', 'PA7': 'PA7', 'PC4': 'PC4', 'PC5': 'PC5', 'PB0': 'PB0', 'PB1': 'PB1', 'PB2': 'PB2', 'PB10': 'PB10', 'PB11': 'PB11', 'VSS_1': 'VSS_1', 'VDD_1': 'VDD_1', 'PA8': 'PA8', 'PA9': 'PA9', 'PA10': 'PA10', 'PA11': 'PA11', 'PA12': 'PA12', 'PA13': 'PA13', 'PA14': 'PA14', 'PA15': 'PA15', 'PB3': 'PB3', 'PB4': 'PB4', 'PB5': 'PB5', 'PB6': 'PB6', 'PB7': 'PB7', 'PB8': 'PB8', 'PB9': 'PB9', 'VSS_2': 'VSS_2', 'VDD_2': 'VDD_2' },
        'STM32F103RC': { '1': 'VDD', '2': 'VSS', '3': 'VDDA', '4': 'VSSA', '5': 'BOOT0', '6': 'NRST', '7': 'OSC_IN', '8': 'OSC_OUT', '9': 'PA0', '10': 'PA1', '11': 'PA2', '12': 'PA3', '13': 'PA4', '14': 'PA5', '15': 'PA6', '16': 'PA7', '17': 'PA8', '18': 'PA9', '19': 'PA10', '20': 'PA11', '21': 'PA12', '22': 'PA13', '23': 'PA14', '24': 'PA15', '25': 'PB0', '26': 'PB1', '27': 'PB2', '28': 'PB3', '29': 'PB4', '30': 'PB5', '31': 'PB6', '32': 'PB7', '33': 'PB8', '34': 'PB9', '35': 'PB10', '36': 'PB11', '37': 'PB12', '38': 'PB13', '39': 'PB14', '40': 'PB15', '41': 'PC0', '42': 'PC1', '43': 'PC2', '44': 'PC3', '45': 'PC4', '46': 'PC5', '47': 'PC6', '48': 'PC7', 'VDD': 'VDD', 'VSS': 'VSS', 'VDDA': 'VDDA', 'VSSA': 'VSSA', 'BOOT0': 'BOOT0', 'NRST': 'NRST', 'OSC_IN': 'OSC_IN', 'OSC_OUT': 'OSC_OUT', 'PA0': 'PA0', 'PA1': 'PA1', 'PA2': 'PA2', 'PA3': 'PA3', 'PA4': 'PA4', 'PA5': 'PA5', 'PA6': 'PA6', 'PA7': 'PA7', 'PA8': 'PA8', 'PA9': 'PA9', 'PA10': 'PA10', 'PA11': 'PA11', 'PA12': 'PA12', 'PA13': 'PA13', 'PA14': 'PA14', 'PA15': 'PA15', 'PB0': 'PB0', 'PB1': 'PB1', 'PB2': 'PB2', 'PB3': 'PB3', 'PB4': 'PB4', 'PB5': 'PB5', 'PB6': 'PB6', 'PB7': 'PB7', 'PB8': 'PB8', 'PB9': 'PB9', 'PB10': 'PB10', 'PB11': 'PB11', 'PB12': 'PB12', 'PB13': 'PB13', 'PB14': 'PB14', 'PB15': 'PB15', 'PC0': 'PC0', 'PC1': 'PC1', 'PC2': 'PC2', 'PC3': 'PC3', 'PC4': 'PC4', 'PC5': 'PC5', 'PC6': 'PC6', 'PC7': 'PC7' },
        'STM32F407VG': { '1': 'VDD', '2': 'VSS', '3': 'VDDA', '4': 'VSSA', '5': 'BOOT0', '6': 'NRST', '7': 'OSC_IN', '8': 'OSC_OUT', '9': 'PA0', '10': 'PA1', '11': 'PA2', '12': 'PA3', '13': 'PA4', '14': 'PA5', '15': 'PA6', '16': 'PA7', '17': 'PA8', '18': 'PA9', '19': 'PA10', '20': 'PA11', '21': 'PA12', '22': 'PA13', '23': 'PA14', '24': 'PA15', '25': 'PB0', '26': 'PB1', '27': 'PB2', '28': 'PB3', '29': 'PB4', '30': 'PB5', '31': 'PB6', '32': 'PB7', '33': 'PB8', '34': 'PB9', '35': 'PB10', '36': 'PB11', '37': 'PB12', '38': 'PB13', '39': 'PB14', '40': 'PB15', '41': 'PC0', '42': 'PC1', '43': 'PC2', '44': 'PC3', '45': 'PC4', '46': 'PC5', '47': 'PC6', '48': 'PC7', '49': 'PD0', '50': 'PD1', '51': 'PD2', '52': 'PD3', '53': 'PD4', '54': 'PD5', '55': 'PD6', '56': 'PD7', '57': 'PD8', '58': 'PD9', '59': 'PD10', '60': 'PD11', '61': 'PD12', '62': 'PD13', '63': 'PD14', '64': 'PD15', '65': 'PE0', '66': 'PE1', '67': 'PE2', '68': 'PE3', '69': 'PE4', '70': 'PE5', '71': 'PE6', '72': 'PE7', '73': 'PE8', '74': 'PE9', '75': 'PE10', '76': 'PE11', '77': 'PE12', '78': 'PE13', '79': 'PE14', '80': 'PE15', '81': 'PC8', '82': 'PC9', '83': 'PC10', '84': 'PC11', '85': 'PC12', '86': 'PC13', '87': 'PC14', '88': 'PC15', '89': 'PF0', '90': 'PF1', '91': 'PF2', '92': 'PF3', '93': 'PF4', '94': 'PF5', '95': 'PF6', '96': 'PF7', '97': 'PF8', '98': 'PF9', '99': 'PF10', '100': 'PF11', 'VDD': 'VDD', 'VSS': 'VSS', 'VDDA': 'VDDA', 'VSSA': 'VSSA', 'BOOT0': 'BOOT0', 'NRST': 'NRST', 'OSC_IN': 'OSC_IN', 'OSC_OUT': 'OSC_OUT', 'PA0': 'PA0', 'PA1': 'PA1', 'PA2': 'PA2', 'PA3': 'PA3', 'PA4': 'PA4', 'PA5': 'PA5', 'PA6': 'PA6', 'PA7': 'PA7', 'PA8': 'PA8', 'PA9': 'PA9', 'PA10': 'PA10', 'PA11': 'PA11', 'PA12': 'PA12', 'PA13': 'PA13', 'PA14': 'PA14', 'PA15': 'PA15', 'PB0': 'PB0', 'PB1': 'PB1', 'PB2': 'PB2', 'PB3': 'PB3', 'PB4': 'PB4', 'PB5': 'PB5', 'PB6': 'PB6', 'PB7': 'PB7', 'PB8': 'PB8', 'PB9': 'PB9', 'PB10': 'PB10', 'PB11': 'PB11', 'PB12': 'PB12', 'PB13': 'PB13', 'PB14': 'PB14', 'PB15': 'PB15', 'PC0': 'PC0', 'PC1': 'PC1', 'PC2': 'PC2', 'PC3': 'PC3', 'PC4': 'PC4', 'PC5': 'PC5', 'PC6': 'PC6', 'PC7': 'PC7', 'PD0': 'PD0', 'PD1': 'PD1', 'PD2': 'PD2', 'PD3': 'PD3', 'PD4': 'PD4', 'PD5': 'PD5', 'PD6': 'PD6', 'PD7': 'PD7', 'PD8': 'PD8', 'PD9': 'PD9', 'PD10': 'PD10', 'PD11': 'PD11', 'PD12': 'PD12', 'PD13': 'PD13', 'PD14': 'PD14', 'PD15': 'PD15', 'PE0': 'PE0', 'PE1': 'PE1', 'PE2': 'PE2', 'PE3': 'PE3', 'PE4': 'PE4', 'PE5': 'PE5', 'PE6': 'PE6', 'PE7': 'PE7', 'PE8': 'PE8', 'PE9': 'PE9', 'PE10': 'PE10', 'PE11': 'PE11', 'PE12': 'PE12', 'PE13': 'PE13', 'PE14': 'PE14', 'PE15': 'PE15', 'PC8': 'PC8', 'PC9': 'PC9', 'PC10': 'PC10', 'PC11': 'PC11', 'PC12': 'PC12', 'PC13': 'PC13', 'PC14': 'PC14', 'PC15': 'PC15', 'PF0': 'PF0', 'PF1': 'PF1', 'PF2': 'PF2', 'PF3': 'PF3', 'PF4': 'PF4', 'PF5': 'PF5', 'PF6': 'PF6', 'PF7': 'PF7', 'PF8': 'PF8', 'PF9': 'PF9', 'PF10': 'PF10', 'PF11': 'PF11' },
        'STM32L431CB': { '1': 'VDD', '2': 'VSS', '3': 'VDDA', '4': 'VSSA', '5': 'BOOT0', '6': 'NRST', '7': 'OSC_IN', '8': 'OSC_OUT', '9': 'PA0', '10': 'PA1', '11': 'PA2', '12': 'PA3', '13': 'PA4', '14': 'PA5', '15': 'PA6', '16': 'PA7', '17': 'PA8', '18': 'PA9', '19': 'PA10', '20': 'PA11', '21': 'PA12', '22': 'PA13', '23': 'PA14', '24': 'PA15', '25': 'PB0', '26': 'PB1', '27': 'PB2', '28': 'PB3', '29': 'PB4', '30': 'PB5', '31': 'PB6', '32': 'PB7', '33': 'PB8', '34': 'PB9', '35': 'PB10', '36': 'PB11', '37': 'PB12', '38': 'PB13', '39': 'PB14', '40': 'PB15', '41': 'PC0', '42': 'PC1', '43': 'PC2', '44': 'PC3', '45': 'PC4', '46': 'PC5', '47': 'PC6', '48': 'PC7', 'VDD': 'VDD', 'VSS': 'VSS', 'VDDA': 'VDDA', 'VSSA': 'VSSA', 'BOOT0': 'BOOT0', 'NRST': 'NRST', 'OSC_IN': 'OSC_IN', 'OSC_OUT': 'OSC_OUT', 'PA0': 'PA0', 'PA1': 'PA1', 'PA2': 'PA2', 'PA3': 'PA3', 'PA4': 'PA4', 'PA5': 'PA5', 'PA6': 'PA6', 'PA7': 'PA7', 'PA8': 'PA8', 'PA9': 'PA9', 'PA10': 'PA10', 'PA11': 'PA11', 'PA12': 'PA12', 'PA13': 'PA13', 'PA14': 'PA14', 'PA15': 'PA15', 'PB0': 'PB0', 'PB1': 'PB1', 'PB2': 'PB2', 'PB3': 'PB3', 'PB4': 'PB4', 'PB5': 'PB5', 'PB6': 'PB6', 'PB7': 'PB7', 'PB8': 'PB8', 'PB9': 'PB9', 'PB10': 'PB10', 'PB11': 'PB11', 'PB12': 'PB12', 'PB13': 'PB13', 'PB14': 'PB14', 'PB15': 'PB15', 'PC0': 'PC0', 'PC1': 'PC1', 'PC2': 'PC2', 'PC3': 'PC3', 'PC4': 'PC4', 'PC5': 'PC5', 'PC6': 'PC6', 'PC7': 'PC7' },
        'SW_PUSH': { '1': '1', '2': '2' },
        'TL071': { '2': 'IN-', '3': 'IN+', '4': 'VEE', '6': 'OUT', '7': 'VCC', 'IN+': 'IN+', 'IN-': 'IN-', 'OUT': 'OUT', 'VCC': 'VCC', 'VEE': 'VEE', 'V+': 'VCC', 'V-': 'VEE', '+IN': 'IN+', '-IN': 'IN-', 'INP': 'IN+', 'INN': 'IN-', 'OUTPUT': 'OUT', 'VDD': 'VCC', 'VSS': 'VEE' },
        'TL081': { '2': 'IN-', '3': 'IN+', '4': 'VEE', '6': 'OUT', '7': 'VCC', 'IN+': 'IN+', 'IN-': 'IN-', 'OUT': 'OUT', 'VCC': 'VCC', 'VEE': 'VEE', 'V+': 'VCC', 'V-': 'VEE', '+IN': 'IN+', '-IN': 'IN-', 'INP': 'IN+', 'INN': 'IN-', 'OUTPUT': 'OUT', 'VDD': 'VCC', 'VSS': 'VEE' },
        'TL082': { '1': 'OUT1', '2': 'IN-1', '3': 'IN+1', '4': 'V-', '5': 'IN+2', '6': 'IN-2', '7': 'OUT2', '8': 'V+', 'OUT1': 'OUT1', 'IN-1': 'IN-1', 'IN+1': 'IN+1', 'V-': 'V-', 'IN+2': 'IN+2', 'IN-2': 'IN-2', 'OUT2': 'OUT2', 'V+': 'V+', 'OUTA': 'OUT1', 'OUTB': 'OUT2', 'INN1': 'IN-1', 'INP1': 'IN+1', 'INN2': 'IN-2', 'INP2': 'IN+2', '-IN1': 'IN-1', '+IN1': 'IN+1', '-IN2': 'IN-2', '+IN2': 'IN+2', 'VEE': 'V-', 'VCC': 'V+', 'VSS': 'V-', 'VDD': 'V+' },
        'UA741': { '2': 'IN-', '3': 'IN+', '4': 'VEE', '6': 'OUT', '7': 'VCC', 'IN+': 'IN+', 'IN-': 'IN-', 'OUT': 'OUT', 'VCC': 'VCC', 'VEE': 'VEE', 'V+': 'VCC', 'V-': 'VEE', '+IN': 'IN+', '-IN': 'IN-', 'INP': 'IN+', 'INN': 'IN-', 'OUTPUT': 'OUT', 'VDD': 'VCC', 'VSS': 'VEE' },
        'UART_TERMINAL': { '1': 'TX', '2': 'RX', '3': 'GND', 'TX': 'TX', 'RX': 'RX', 'GND': 'GND' },
        'VAC': { '1': '1', '2': '2', 'AC+': '1', 'AC-': '2' },
        'VCC': { '1': '1', 'VCC': '1' },
        'VEE': { '1': '1', 'VEE': '1' },
        'VIRTUAL_METER': { '1': 'V', '2': 'A', '3': 'OHM', '4': 'COM', 'V': 'V', 'A': 'A', 'OHM': 'OHM', 'COM': 'COM' },
        'VOLTMETER_DC': { '1': 'V+', '2': 'COM', 'V+': 'V+', 'COM': 'COM' },
        'W25Q64': { '1': 'CS', '2': 'DO', '3': 'WP', '4': 'GND', '5': 'DI', '6': 'CLK', '7': 'HOLD', '8': 'VCC', 'CS': 'CS', 'DO': 'DO', 'WP': 'WP', 'GND': 'GND', 'DI': 'DI', 'CLK': 'CLK', 'HOLD': 'HOLD', 'VCC': 'VCC' },
        'XTAL_11M': { '1': '1', '2': '2' },
        'XTAL_8M': { '1': '1', '2': '2' },
        'POT_*': { '1': '1', '2': '2', '3': 'W', 'W': 'W' },
        'LED_*': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
        '1N*': { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' },
    };
    private static familyKey(libDevId: string): string {
        const u = (libDevId ?? '').toUpperCase();
        if (u.startsWith('POT_')) {
            return 'POT_*';
        }
        if (u.startsWith('LED_')) {
            return 'LED_*';
        }
        if (u.startsWith('1N') || u.indexOf('DIODE') >= 0) {
            return '1N*';
        }
        return u;
    }
    private static tableFor(libDevId: string): Record<string, string> | undefined {
        const u = (libDevId ?? '').toUpperCase();
        return PinIdRegistry.MAP[u] ?? PinIdRegistry.MAP[PinIdRegistry.familyKey(libDevId)];
    }
    /** 有映射返回 Builtin pin.id；无映射返回空串 */
    static canonicalize(libDevId: string, pinId: string, pinName: string = ''): string {
        const table = PinIdRegistry.tableFor(libDevId);
        if (!table) {
            return '';
        }
        const tryOne = (raw: string): string => {
            const t = (raw ?? '').trim();
            if (t.length === 0) {
                return '';
            }
            const m = /^([A-Za-z0-9_.+-]+)\s*\([^)]*\)\s*$/.exec(t);
            const key = (m ? m[1] : t).toUpperCase();
            const hit = table[key];
            return hit !== undefined ? hit : '';
        };
        const a = tryOne(pinId);
        if (a.length > 0) {
            return a;
        }
        return tryOne(pinName);
    }
    /** 规范化；无映射时返回剥括号后的原 pinId */
    static resolve(libDevId: string, pinId: string, pinName: string = ''): string {
        const c = PinIdRegistry.canonicalize(libDevId, pinId, pinName);
        if (c.length > 0) {
            return c;
        }
        const t = (pinId ?? '').trim();
        const m = /^([A-Za-z0-9_.+-]+)\s*\([^)]*\)\s*$/.exec(t);
        return m ? m[1] : t;
    }
    static knownTokens(libDevId: string): string[] {
        const table = PinIdRegistry.tableFor(libDevId);
        if (!table) {
            return [];
        }
        const out: string[] = [];
        const seen = new Set<string>();
        const keys = Object.keys(table);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const v = table[k];
            if (!seen.has(k)) {
                seen.add(k);
                out.push(k);
            }
            const vu = (v ?? '').toUpperCase();
            if (vu.length > 0 && !seen.has(vu)) {
                seen.add(vu);
                out.push(v);
            }
        }
        return out;
    }
    static hasDevice(libDevId: string): boolean {
        return PinIdRegistry.tableFor(libDevId) !== undefined;
    }
}
