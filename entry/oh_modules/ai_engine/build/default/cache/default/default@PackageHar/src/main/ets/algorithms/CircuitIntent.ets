/**
 * CircuitIntent — 流水线统一意图中枢
 * 选型前粗分 / BOM 后精修；供 prompt 注入、HARD/SOFT critique、PostGen 门控共用。
 */
import { DeviceSelectLlmOutput, MatchedDevice, SchTopology } from 'common';

export interface CircuitIntent {
  needsPowerRails: boolean;
  hasMcuMinSystem: boolean;
  mutualLedIndicator: boolean;
  blinkOscillator: boolean;
  relayContactTopo: boolean;
  /** 串联 RC 充放电（观测 τ=RC / 指数波形）— 禁 RELAY，优先 SW_PUSH */
  seriesRcCharge: boolean;
  /** 运放/模拟双电源：需要 VEE 负压轨 */
  dualSupply: boolean;
  /** 用户指定的正电源电压文案（如 3.3V / 5V / 12V），空=默认 */
  preferredVccVoltage: string;
  /** 用户指定的负电源电压文案（如 -12V / -5V），空=默认 -12V */
  preferredVeeVoltage: string;
  /** 需要原理图 SIGNAL_GEN（正弦/方波/三角） */
  needsSignalGen: boolean;
  /** SIGNAL_GEN 波形：sine|square|triangle|saw|pulse */
  signalWaveform: string;
  /** SIGNAL_GEN 频率文案（如 1kHz / 500Hz），空=默认 1kHz */
  preferredSignalFrequency: string;
  /** SIGNAL_GEN 占空比文案（如 50% / 25），空=默认 50%；方波/脉冲有效 */
  preferredSignalDuty: string;
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
    seriesRcCharge: false,
    dualSupply: false,
    preferredVccVoltage: '',
    preferredVeeVoltage: '',
    needsSignalGen: false,
    signalWaveform: 'sine',
    preferredSignalFrequency: '',
    preferredSignalDuty: '',
    hasInstruments: false,
    needsLedSeriesR: false,
    needsI2cPullup: false,
    needsOpAmpFeedback: false,
    passiveOnly: false,
    reasons: []
  };
}

/** 串联 RC 充放电 / τ 观测（禁套互斥继电器） */
function isSeriesRcChargePrompt(prompt: string): boolean {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();
  if (isMutualLedSwitchPrompt(prompt)) {
    return false;
  }
  return zh.indexOf('充放电') >= 0 || zh.indexOf('时间常数') >= 0 ||
    zh.indexOf('指数波形') >= 0 || zh.indexOf('τ=RC') >= 0 || zh.indexOf('τ＝RC') >= 0 ||
    zh.indexOf('tau=RC') >= 0 || lower.indexOf('time constant') >= 0 ||
    lower.indexOf('rc charge') >= 0 || lower.indexOf('rc discharge') >= 0 ||
    (zh.indexOf('RC') >= 0 && (zh.indexOf('电容') >= 0 || zh.indexOf('电阻') >= 0) &&
      (zh.indexOf('充电') >= 0 || zh.indexOf('放电') >= 0 || zh.indexOf('波形') >= 0));
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
  const dualColor =
    (zh.indexOf('绿') >= 0 && zh.indexOf('红') >= 0) ||
    (lower.indexOf('green') >= 0 && lower.indexOf('red') >= 0) ||
    (zh.indexOf('双') >= 0 && (zh.indexOf('LED') >= 0 || lower.indexOf('led') >= 0)) ||
    zh.indexOf('红绿灯') >= 0;
  const mutual =
    (zh.indexOf('打开') >= 0 && zh.indexOf('闭合') >= 0) ||
    (zh.indexOf('断开') >= 0 && (zh.indexOf('闭合') >= 0 || zh.indexOf('接通') >= 0)) ||
    (zh.indexOf('松开') >= 0 && zh.indexOf('按下') >= 0) ||
    (lower.indexOf('open') >= 0 && lower.indexOf('close') >= 0) ||
    zh.indexOf('互斥') >= 0 ||
    ((zh.indexOf('常开') >= 0 || zh.indexOf('常闭') >= 0) && dualColor);
  // 互斥双色优先于 blink：红绿灯闪烁仍可能是 SPDT 互斥指示
  if (mutual && (dualColor || zh.indexOf('LED') >= 0 || lower.indexOf('led') >= 0 ||
    zh.indexOf('灯') >= 0)) {
    return true;
  }
  if (isBlinkLike(zh, lower)) {
    return false;
  }
  return false;
}

/** 选型前：仅根据用户提示粗分意图 */
export function classifyCircuitIntent(prompt: string): CircuitIntent {
  const intent = defaultCircuitIntent();
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();

  if (isMutualLedSwitchPrompt(prompt)) {
    intent.mutualLedIndicator = true;
    intent.relayContactTopo = true;
    intent.blinkOscillator = false;
    pushReason(intent, 'mutual_led_switch');
  } else if (isBlinkLike(zh, lower)) {
    intent.blinkOscillator = true;
    pushReason(intent, 'blink_keyword');
  }

  if (isSeriesRcChargePrompt(prompt)) {
    intent.seriesRcCharge = true;
    intent.mutualLedIndicator = false;
    intent.relayContactTopo = false;
    pushReason(intent, 'series_rc_charge');
  }

  if (isMutualLedSwitchPrompt(prompt) && !intent.seriesRcCharge) {
    intent.mutualLedIndicator = true;
    intent.relayContactTopo = true;
    intent.needsLedSeriesR = true;
    pushReason(intent, 'mutual_led_switch');
  } else if (intent.blinkOscillator || intent.seriesRcCharge) {
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
    lower.indexOf('op-amp') >= 0 || zh.indexOf('LM358') >= 0 || zh.indexOf('LM324') >= 0 ||
    zh.indexOf('741') >= 0 || zh.indexOf('TL082') >= 0) {
    intent.needsOpAmpFeedback = true;
    pushReason(intent, 'opamp_keyword');
  }

  applyPowerAndSignalIntent(intent, prompt);

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

/** 解析电源电压 / 双电源 / 信号发生器意图 */
function applyPowerAndSignalIntent(intent: CircuitIntent, prompt: string): void {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();

  // 双电源 / VEE
  if (zh.indexOf('双电源') >= 0 || zh.indexOf('正负电源') >= 0 || zh.indexOf('负压') >= 0 ||
    zh.indexOf('VEE') >= 0 || lower.indexOf('vee') >= 0 ||
    zh.indexOf('±') >= 0 || zh.indexOf('+/-') >= 0 || lower.indexOf('+/-') >= 0 ||
    lower.indexOf('dual supply') >= 0 || lower.indexOf('split supply') >= 0 ||
    /[±]\s*1?2\s*v/i.test(zh) || /[±]\s*5\s*v/i.test(zh) ||
    /-12\s*v/i.test(zh) || /-5\s*v/i.test(zh)) {
    intent.dualSupply = true;
    intent.needsPowerRails = true;
    pushReason(intent, 'dual_supply');
  }
  // 运放默认倾向双电源（可被单电源提示覆盖）
  if (intent.needsOpAmpFeedback && !intent.dualSupply) {
    if (zh.indexOf('单电源') >= 0 || lower.indexOf('single supply') >= 0 ||
      zh.indexOf('单供') >= 0) {
      // 保持单电源
    } else if (zh.indexOf('双电源') >= 0 || zh.indexOf('±') >= 0 || zh.indexOf('VEE') >= 0) {
      intent.dualSupply = true;
      pushReason(intent, 'opamp_dual');
    }
  }

  // VCC 电压
  const vccM = zh.match(/(?:VCC|VDD|电源|供电)\s*(?:=|为|:|：)?\s*(3\.3|5|12)\s*V/i) ||
    zh.match(/\b(3\.3|5|12)\s*V\b/i);
  if (vccM) {
    intent.preferredVccVoltage = `${vccM[1]}V`;
    pushReason(intent, `vcc=${intent.preferredVccVoltage}`);
  }
  // VEE 电压
  const veeM = zh.match(/(?:VEE|负压|负电源)\s*(?:=|为|:|：)?\s*(-?1?2|-?5)\s*V/i) ||
    zh.match(/(-\s*12|-\s*5)\s*V/i);
  if (veeM) {
    let v = veeM[1].replace(/\s/g, '');
    if (!v.startsWith('-')) {
      v = `-${v}`;
    }
    intent.preferredVeeVoltage = `${v}V`;
    intent.dualSupply = true;
    pushReason(intent, `vee=${intent.preferredVeeVoltage}`);
  } else if (intent.dualSupply && intent.preferredVeeVoltage.length === 0) {
    intent.preferredVeeVoltage = '-12V';
  }

  // 信号发生器
  const wantSig = zh.indexOf('信号发生') >= 0 || zh.indexOf('函数发生') >= 0 ||
    zh.indexOf('信号源') >= 0 || lower.indexOf('signal gen') >= 0 ||
    lower.indexOf('function gen') >= 0 || lower.indexOf('waveform gen') >= 0 ||
    (zh.indexOf('激励') >= 0 && (zh.indexOf('正弦') >= 0 || zh.indexOf('方波') >= 0 ||
      zh.indexOf('三角') >= 0));
  if (wantSig) {
    intent.needsSignalGen = true;
    intent.hasInstruments = true;
    pushReason(intent, 'signal_gen');
  }
  // 激励波形：优先「输入/激励/信号源」语境；「整形/输出方波」不覆盖正弦激励
  const hasSine = zh.indexOf('正弦') >= 0 || lower.indexOf('sine') >= 0;
  const hasSquare = zh.indexOf('方波') >= 0 || lower.indexOf('square') >= 0;
  const hasTri = zh.indexOf('三角') >= 0 || lower.indexOf('triangle') >= 0;
  const hasSaw = zh.indexOf('锯齿') >= 0 || lower.indexOf('saw') >= 0;
  const hasPulse = zh.indexOf('脉冲') >= 0 || lower.indexOf('pulse') >= 0;
  const squareAsOutputOnly = hasSquare && hasSine && (
    zh.indexOf('整形') >= 0 || zh.indexOf('滞回') >= 0 || zh.indexOf('比较器') >= 0 ||
    zh.indexOf('输出') >= 0 || zh.indexOf('削波') >= 0 ||
    /输入\s*正弦|正弦\s*波?\s*信号|正弦\s*激励/.test(zh)
  );
  const exciteCtx = (wave: string): boolean => {
    const i = zh.indexOf(wave);
    if (i < 0) {
      return false;
    }
    const win = zh.substring(Math.max(0, i - 8), Math.min(zh.length, i + wave.length + 8));
    return win.indexOf('输入') >= 0 || win.indexOf('激励') >= 0 || win.indexOf('信号源') >= 0 ||
      win.indexOf('信号发生') >= 0 || win.indexOf('函数发生') >= 0;
  };
  if (hasSine && (exciteCtx('正弦') || squareAsOutputOnly || !hasSquare)) {
    intent.signalWaveform = 'sine';
    if (wantSig || exciteCtx('正弦')) {
      intent.needsSignalGen = true;
    }
  } else if (hasSquare && !squareAsOutputOnly) {
    intent.signalWaveform = 'square';
    if (wantSig || zh.indexOf('波形') >= 0 || exciteCtx('方波')) {
      intent.needsSignalGen = true;
    }
  } else if (hasTri) {
    intent.signalWaveform = 'triangle';
    if (wantSig || zh.indexOf('波形') >= 0) {
      intent.needsSignalGen = true;
    }
  } else if (hasSaw) {
    intent.signalWaveform = 'saw';
    if (wantSig || zh.indexOf('波形') >= 0) {
      intent.needsSignalGen = true;
    }
  } else if (hasPulse) {
    intent.signalWaveform = 'pulse';
    if (wantSig || zh.indexOf('波形') >= 0) {
      intent.needsSignalGen = true;
    }
  } else if (hasSine) {
    intent.signalWaveform = 'sine';
    if (wantSig) {
      intent.needsSignalGen = true;
    }
  }
  // 频率：1kHz / 500Hz / 频率=10kHz
  const freqM = zh.match(/(?:频率|freq(?:uency)?)\s*(?:=|为|:|：)?\s*([\d.]+\s*[kKmM]?[Hh][Zz]?)/i) ||
    zh.match(/([\d.]+\s*[kKmM]?[Hh][Zz])/);
  if (freqM && (intent.needsSignalGen || wantSig || zh.indexOf('方波') >= 0 ||
    zh.indexOf('正弦') >= 0 || zh.indexOf('三角') >= 0)) {
    let f = freqM[1].replace(/\s/g, '');
    if (!/[Hh][Zz]$/i.test(f)) {
      f = `${f}Hz`;
    }
    intent.preferredSignalFrequency = f;
    pushReason(intent, `sigFreq=${f}`);
  }
  // 占空比：占空比50% / duty=25 / 25%占空
  const dutyM = zh.match(/(?:占空比|duty(?:\s*cycle)?)\s*(?:=|为|:|：)?\s*([\d.]+)\s*%?/i) ||
    zh.match(/([\d.]+)\s*%\s*(?:占空|duty)/i);
  if (dutyM) {
    const n = parseFloat(dutyM[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100) {
      intent.preferredSignalDuty = `${n}%`;
      if (intent.needsSignalGen || wantSig) {
        pushReason(intent, `sigDuty=${intent.preferredSignalDuty}`);
      }
    }
  }
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
export function refineCircuitIntent(
  prompt: string,
  out: DeviceSelectLlmOutput,
  matched?: MatchedDevice[]
): CircuitIntent {
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

  const hasMcuBom = ids.some(m =>
    m.indexOf('STM32') >= 0 || m.indexOf('AT89') >= 0 || m.indexOf('STC') >= 0 ||
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
  const hasR = ids.some(m => m.startsWith('R_'));
  const hasC = ids.some(m => m.startsWith('C_'));
  if (intent.seriesRcCharge || (hasR && hasC && isSeriesRcChargePrompt(prompt))) {
    intent.seriesRcCharge = true;
    intent.relayContactTopo = false;
    intent.mutualLedIndicator = false;
    pushReason(intent, 'series_rc_bom');
  }
  if (hasRelay && intent.mutualLedIndicator && !intent.seriesRcCharge) {
    intent.relayContactTopo = true;
    pushReason(intent, 'relay_bom_mutual');
  } else if (hasRelay && !intent.blinkOscillator && ledN >= 2 && intent.mutualLedIndicator &&
    !intent.seriesRcCharge) {
    intent.relayContactTopo = true;
  } else if (hasRelay && (intent.blinkOscillator || intent.seriesRcCharge)) {
    // 闪烁 / RC 充放电偶带继电器也不强行触点双色铁律
    intent.relayContactTopo = false;
  }

  const hasI2cBom = (out.deviceRequireList ?? []).some(r =>
    (r.func ?? '').toUpperCase().indexOf('I2C') >= 0 ||
    (r.devType ?? '').toUpperCase().indexOf('I2C') >= 0 ||
    (r.explicitModel ?? '').toUpperCase().indexOf('I2C') >= 0 ||
    (r.explicitModel ?? '').toUpperCase().indexOf('OLED') >= 0 ||
    (r.explicitModel ?? '').toUpperCase().indexOf('EEPROM') >= 0);
  if (hasI2cBom) {
    intent.needsI2cPullup = true;
    pushReason(intent, 'i2c_bom');
  }

  const hasOp = ids.some(m =>
    m.indexOf('LM358') >= 0 || m.indexOf('LM324') >= 0 || m.indexOf('OPAMP') >= 0);
  if (hasOp) {
    intent.needsOpAmpFeedback = true;
    pushReason(intent, 'opamp_bom');
  }

  const hasInstr = ids.some(m =>
    m.indexOf('VOLTMETER') >= 0 || m.indexOf('AMMETER') >= 0 ||
    m.indexOf('OSCILLOSCOPE') >= 0 || m.indexOf('LOGIC_ANALYZER') >= 0 ||
    m.indexOf('UART_TERMINAL') >= 0);
  if (hasInstr) {
    intent.hasInstruments = true;
    pushReason(intent, 'instrument_bom');
  }

  const hasVcc = ids.some(m => m === 'VCC');
  const hasGnd = ids.some(m => m === 'GND');
  const hasVee = ids.some(m => m === 'VEE' || m.indexOf('VEE') >= 0);
  const hasSig = ids.some(m => m.indexOf('SIGNAL_GEN') >= 0);
  if (hasVcc || hasGnd || hasVee) {
    intent.needsPowerRails = true;
  }
  if (hasVee) {
    intent.dualSupply = true;
    pushReason(intent, 'vee_bom');
  }
  if (hasSig) {
    intent.needsSignalGen = true;
    intent.hasInstruments = true;
    pushReason(intent, 'signal_gen_bom');
    // BOM 显式 waveform 覆盖启发式（避免「输出方波」误判激励）
    const list = out.deviceRequireList ?? [];
    for (let i = 0; i < list.length; i++) {
      const id = `${list[i].explicitModel ?? ''} ${list[i].devType ?? ''}`.toUpperCase();
      if (id.indexOf('SIGNAL_GEN') < 0) {
        continue;
      }
      const wf = (list[i].paramConstraint?.get('waveform') ?? '').trim().toLowerCase();
      if (wf === 'sine' || wf === 'square' || wf === 'triangle' || wf === 'saw' || wf === 'pulse') {
        intent.signalWaveform = wf;
        pushReason(intent, `sigWfBom=${wf}`);
      }
      const freq = (list[i].paramConstraint?.get('frequency') ?? '').trim();
      if (freq.length > 0) {
        intent.preferredSignalFrequency = freq;
      }
      const duty = (list[i].paramConstraint?.get('dutyCycle') ?? '').trim();
      if (duty.length > 0) {
        intent.preferredSignalDuty = duty;
      }
      break;
    }
  }
  // 运放 BOM + 未声明单电源 → 倾向双电源
  if (intent.needsOpAmpFeedback && !intent.dualSupply) {
    const zh = prompt ?? '';
    if (zh.indexOf('单电源') < 0 && zh.toLowerCase().indexOf('single supply') < 0) {
      // 不强制 dual，仅当提示含双电源/± 时已在 classify 设置
    }
  }

  intent.passiveOnly = !intent.hasMcuMinSystem && !intent.hasInstruments &&
    !intent.needsOpAmpFeedback && ledN === 0 && !hasRelay;

  // 闪烁 / RC 优先否决互斥
  if (intent.blinkOscillator || intent.seriesRcCharge) {
    intent.mutualLedIndicator = false;
    intent.relayContactTopo = false;
  }

  return intent;
}

/** 从已摆放拓扑再精修（net_plan / PostGen 前） */
export function refineIntentFromTopo(intent: CircuitIntent, topo: SchTopology): CircuitIntent {
  const next = copyIntent(intent);
  const hasRelay = topo.deviceList.some(d =>
    d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0);
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
  if (next.seriesRcCharge) {
    next.mutualLedIndicator = false;
    next.relayContactTopo = false;
  } else if (hasRelay && next.mutualLedIndicator) {
    next.relayContactTopo = true;
  } else if (hasRelay && next.blinkOscillator) {
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
    seriesRcCharge: src.seriesRcCharge,
    dualSupply: src.dualSupply,
    preferredVccVoltage: src.preferredVccVoltage,
    preferredVeeVoltage: src.preferredVeeVoltage,
    needsSignalGen: src.needsSignalGen,
    signalWaveform: src.signalWaveform,
    preferredSignalFrequency: src.preferredSignalFrequency,
    preferredSignalDuty: src.preferredSignalDuty,
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
    ` relayTopo=${intent.relayContactTopo} seriesRc=${intent.seriesRcCharge}` +
    ` dual=${intent.dualSupply} vcc=${intent.preferredVccVoltage || '-'}` +
    ` vee=${intent.preferredVeeVoltage || '-'} sig=${intent.needsSignalGen}/${intent.signalWaveform}` +
    `@${intent.preferredSignalFrequency || '1kHz'}/duty=${intent.preferredSignalDuty || '50%'}` +
    ` instr=${intent.hasInstruments}` +
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
