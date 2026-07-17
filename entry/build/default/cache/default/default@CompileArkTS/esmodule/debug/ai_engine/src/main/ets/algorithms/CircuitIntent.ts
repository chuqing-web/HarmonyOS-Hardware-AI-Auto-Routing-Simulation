import type { DeviceSelectLlmOutput, MatchedDevice, SchTopology } from 'common';
export interface CircuitIntent {
    needsPowerRails: boolean;
    hasMcuMinSystem: boolean;
    mutualLedIndicator: boolean;
    blinkOscillator: boolean;
    relayContactTopo: boolean;
    hasInstruments: boolean;
    needsLedSeriesR: boolean;
    needsI2cPullup: boolean;
    needsOpAmpFeedback: boolean;
    passiveOnly: boolean;
    reasons: string[];
}
export interface CritiqueSplit {
    hard: string[];
    soft: string[];
}
export function defaultCircuitIntent(): CircuitIntent {
    return {
        needsPowerRails: true,
        hasMcuMinSystem: false,
        mutualLedIndicator: false,
        blinkOscillator: false,
        relayContactTopo: false,
        hasInstruments: false,
        needsLedSeriesR: false,
        needsI2cPullup: false,
        needsOpAmpFeedback: false,
        passiveOnly: false,
        reasons: []
    };
}
function pushReason(intent: CircuitIntent, reason: string): void {
    if (intent.reasons.indexOf(reason) < 0) {
        intent.reasons.push(reason);
    }
}
function isBlinkLike(zh: string, lower: string): boolean {
    return zh.indexOf('闪烁') >= 0 || zh.indexOf('交替') >= 0 ||
        zh.indexOf('振荡') >= 0 || zh.indexOf('多谐') >= 0 ||
        zh.indexOf('跑马') >= 0 ||
        lower.indexOf('blink') >= 0 || lower.indexOf('flash') >= 0 ||
        lower.indexOf('astable') >= 0 || lower.indexOf('multivibrator') >= 0;
}
function isMutualLedSwitchPrompt(prompt: string): boolean {
    const zh = prompt ?? '';
    const lower = zh.toLowerCase();
    if (isBlinkLike(zh, lower)) {
        return false;
    }
    const dualColor = (zh.indexOf('绿') >= 0 && zh.indexOf('红') >= 0) ||
        (lower.indexOf('green') >= 0 && lower.indexOf('red') >= 0) ||
        (zh.indexOf('双') >= 0 && (zh.indexOf('LED') >= 0 || lower.indexOf('led') >= 0)) ||
        zh.indexOf('红绿灯') >= 0;
    const mutual = (zh.indexOf('打开') >= 0 && zh.indexOf('闭合') >= 0) ||
        (zh.indexOf('断开') >= 0 && (zh.indexOf('闭合') >= 0 || zh.indexOf('接通') >= 0)) ||
        (zh.indexOf('松开') >= 0 && zh.indexOf('按下') >= 0) ||
        (lower.indexOf('open') >= 0 && lower.indexOf('close') >= 0) ||
        zh.indexOf('互斥') >= 0 ||
        ((zh.indexOf('常开') >= 0 || zh.indexOf('常闭') >= 0) && dualColor);
    return mutual && (dualColor || zh.indexOf('LED') >= 0 || lower.indexOf('led') >= 0 ||
        zh.indexOf('灯') >= 0);
}
/** 选型前：仅根据用户提示粗分意图 */
export function classifyCircuitIntent(prompt: string): CircuitIntent {
    const intent = defaultCircuitIntent();
    const zh = prompt ?? '';
    const lower = zh.toLowerCase();
    if (isBlinkLike(zh, lower)) {
        intent.blinkOscillator = true;
        pushReason(intent, 'blink_keyword');
    }
    if (isMutualLedSwitchPrompt(prompt)) {
        intent.mutualLedIndicator = true;
        intent.relayContactTopo = true;
        intent.needsLedSeriesR = true;
        pushReason(intent, 'mutual_led_switch');
    }
    else if (intent.blinkOscillator) {
        intent.mutualLedIndicator = false;
        intent.relayContactTopo = false;
    }
    if (zh.indexOf('STM32') >= 0 || zh.indexOf('单片机') >= 0 || zh.indexOf('MCU') >= 0 ||
        zh.indexOf('8051') >= 0 || zh.indexOf('AT89') >= 0 || zh.indexOf('STC') >= 0 ||
        lower.indexOf('arduino') >= 0 || lower.indexOf('mcu') >= 0) {
        intent.hasMcuMinSystem = true;
        pushReason(intent, 'mcu_keyword');
    }
    if (zh.indexOf('LED') >= 0 || lower.indexOf('led') >= 0 || zh.indexOf('灯') >= 0 ||
        zh.indexOf('发光') >= 0) {
        intent.needsLedSeriesR = true;
        pushReason(intent, 'led_keyword');
    }
    if (zh.indexOf('I2C') >= 0 || lower.indexOf('i2c') >= 0 || zh.indexOf('I²C') >= 0) {
        intent.needsI2cPullup = true;
        pushReason(intent, 'i2c_keyword');
    }
    if (zh.indexOf('运放') >= 0 || zh.indexOf('放大器') >= 0 || lower.indexOf('opamp') >= 0 ||
        lower.indexOf('op-amp') >= 0 || zh.indexOf('LM358') >= 0 || zh.indexOf('LM324') >= 0) {
        intent.needsOpAmpFeedback = true;
        pushReason(intent, 'opamp_keyword');
    }
    if (zh.indexOf('电压表') >= 0 || zh.indexOf('电流表') >= 0 || zh.indexOf('示波器') >= 0 ||
        zh.indexOf('逻辑分析') >= 0 || zh.indexOf('测电流') >= 0 || zh.indexOf('测电压') >= 0 ||
        lower.indexOf('voltmeter') >= 0 || lower.indexOf('ammeter') >= 0 ||
        lower.indexOf('scope') >= 0) {
        intent.hasInstruments = true;
        pushReason(intent, 'instrument_keyword');
    }
    if (zh.indexOf('无电源') >= 0 || zh.indexOf('浮空教学') >= 0 ||
        (zh.indexOf('无源') >= 0 && zh.indexOf('无电源') >= 0)) {
        intent.needsPowerRails = false;
        pushReason(intent, 'no_power_keyword');
    }
    if (!intent.hasMcuMinSystem && !intent.needsLedSeriesR && !intent.needsOpAmpFeedback &&
        !intent.hasInstruments && (zh.indexOf('电阻') >= 0 || zh.indexOf('电容') >= 0) &&
        zh.indexOf('电源') < 0) {
        // 不强制 passiveOnly；仅作弱信号
    }
    return intent;
}
function collectBomIds(out: DeviceSelectLlmOutput): string[] {
    const list = out.deviceRequireList ?? [];
    const ids: string[] = [];
    for (let i = 0; i < list.length; i++) {
        const m = (list[i].explicitModel ?? '').trim();
        const t = (list[i].devType ?? '').trim();
        if (m.length > 0) {
            ids.push(m.toUpperCase());
        }
        if (t.length > 0) {
            ids.push(t.toUpperCase());
        }
    }
    return ids;
}
/** 选型后：用 BOM 精修意图（不因「双LED+SW」推断互斥） */
export function refineCircuitIntent(prompt: string, out: DeviceSelectLlmOutput, matched?: MatchedDevice[]): CircuitIntent {
    const intent = classifyCircuitIntent(prompt);
    const ids = collectBomIds(out);
    if (matched && matched.length > 0) {
        for (let i = 0; i < matched.length; i++) {
            const mid = matched[i].libDevId ?? '';
            if (mid.length > 0) {
                ids.push(mid.toUpperCase());
            }
        }
    }
    const hasMcuBom = ids.some(m => m.indexOf('STM32') >= 0 || m.indexOf('AT89') >= 0 || m.indexOf('STC') >= 0 ||
        m.indexOf('MCU') >= 0);
    if (hasMcuBom) {
        intent.hasMcuMinSystem = true;
        pushReason(intent, 'mcu_bom');
    }
    const ledN = ids.filter(m => m.indexOf('LED') >= 0).length;
    if (ledN > 0) {
        intent.needsLedSeriesR = true;
        pushReason(intent, 'led_bom');
    }
    const hasRelay = ids.some(m => m.indexOf('RELAY') >= 0);
    if (hasRelay && intent.mutualLedIndicator) {
        intent.relayContactTopo = true;
        pushReason(intent, 'relay_bom_mutual');
    }
    else if (hasRelay && !intent.blinkOscillator && ledN >= 2 && intent.mutualLedIndicator) {
        intent.relayContactTopo = true;
    }
    else if (hasRelay && intent.blinkOscillator) {
        // 闪烁电路偶带继电器也不强行触点双色铁律
        intent.relayContactTopo = false;
    }
    const hasI2cBom = (out.deviceRequireList ?? []).some(r => (r.func ?? '').toUpperCase().indexOf('I2C') >= 0 ||
        (r.devType ?? '').toUpperCase().indexOf('I2C') >= 0 ||
        (r.explicitModel ?? '').toUpperCase().indexOf('I2C') >= 0 ||
        (r.explicitModel ?? '').toUpperCase().indexOf('OLED') >= 0 ||
        (r.explicitModel ?? '').toUpperCase().indexOf('EEPROM') >= 0);
    if (hasI2cBom) {
        intent.needsI2cPullup = true;
        pushReason(intent, 'i2c_bom');
    }
    const hasOp = ids.some(m => m.indexOf('LM358') >= 0 || m.indexOf('LM324') >= 0 || m.indexOf('OPAMP') >= 0);
    if (hasOp) {
        intent.needsOpAmpFeedback = true;
        pushReason(intent, 'opamp_bom');
    }
    const hasInstr = ids.some(m => m.indexOf('VOLTMETER') >= 0 || m.indexOf('AMMETER') >= 0 ||
        m.indexOf('OSCILLOSCOPE') >= 0 || m.indexOf('LOGIC_ANALYZER') >= 0 ||
        m.indexOf('UART_TERMINAL') >= 0);
    if (hasInstr) {
        intent.hasInstruments = true;
        pushReason(intent, 'instrument_bom');
    }
    const hasVcc = ids.some(m => m === 'VCC');
    const hasGnd = ids.some(m => m === 'GND');
    if (hasVcc || hasGnd) {
        intent.needsPowerRails = true;
    }
    intent.passiveOnly = !intent.hasMcuMinSystem && !intent.hasInstruments &&
        !intent.needsOpAmpFeedback && ledN === 0 && !hasRelay;
    // 闪烁优先否决互斥
    if (intent.blinkOscillator) {
        intent.mutualLedIndicator = false;
        if (!hasRelay || intent.blinkOscillator) {
            intent.relayContactTopo = false;
        }
    }
    return intent;
}
/** 从已摆放拓扑再精修（net_plan / PostGen 前） */
export function refineIntentFromTopo(intent: CircuitIntent, topo: SchTopology): CircuitIntent {
    const next = copyIntent(intent);
    const hasRelay = topo.deviceList.some(d => d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0);
    const ledN = topo.deviceList.filter(d => d.libDevId.startsWith('LED_')).length;
    const hasMcu = topo.deviceList.some(d => {
        const id = (d.libDevId ?? '').toUpperCase();
        return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0;
    });
    if (hasMcu) {
        next.hasMcuMinSystem = true;
    }
    if (ledN > 0) {
        next.needsLedSeriesR = true;
    }
    if (hasRelay && next.mutualLedIndicator) {
        next.relayContactTopo = true;
    }
    else if (hasRelay && next.blinkOscillator) {
        next.relayContactTopo = false;
    }
    return next;
}
export function copyIntent(src: CircuitIntent): CircuitIntent {
    return {
        needsPowerRails: src.needsPowerRails,
        hasMcuMinSystem: src.hasMcuMinSystem,
        mutualLedIndicator: src.mutualLedIndicator,
        blinkOscillator: src.blinkOscillator,
        relayContactTopo: src.relayContactTopo,
        hasInstruments: src.hasInstruments,
        needsLedSeriesR: src.needsLedSeriesR,
        needsI2cPullup: src.needsI2cPullup,
        needsOpAmpFeedback: src.needsOpAmpFeedback,
        passiveOnly: src.passiveOnly,
        reasons: src.reasons.slice()
    };
}
export function formatIntentLog(intent: CircuitIntent): string {
    return `power=${intent.needsPowerRails} mcu=${intent.hasMcuMinSystem}` +
        ` mutual=${intent.mutualLedIndicator} blink=${intent.blinkOscillator}` +
        ` relayTopo=${intent.relayContactTopo} instr=${intent.hasInstruments}` +
        ` ledR=${intent.needsLedSeriesR} i2c=${intent.needsI2cPullup}` +
        ` opamp=${intent.needsOpAmpFeedback} reasons=${intent.reasons.join(',')}`;
}
/** HARD 残差指纹：忽略数字波动，排序后拼接 */
export function hardResidualFingerprint(hard: string[]): string {
    const norm = hard.map(s => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim());
    norm.sort();
    return norm.join('|');
}
export function splitEmpty(): CritiqueSplit {
    return { hard: [], soft: [] };
}
export function mergeSplit(a: CritiqueSplit, b: CritiqueSplit): CritiqueSplit {
    return { hard: a.hard.concat(b.hard), soft: a.soft.concat(b.soft) };
}
export function allCritiqueLines(split: CritiqueSplit): string[] {
    const lines: string[] = [];
    for (let i = 0; i < split.hard.length; i++) {
        lines.push(`[HARD] ${split.hard[i]}`);
    }
    for (let j = 0; j < split.soft.length; j++) {
        lines.push(`[SOFT] ${split.soft[j]}`);
    }
    return lines;
}
/** 兼容旧 isMutualLedSwitchPrompt 调用 */
export function intentIsMutualLedSwitch(prompt: string): boolean {
    return isMutualLedSwitchPrompt(prompt);
}
