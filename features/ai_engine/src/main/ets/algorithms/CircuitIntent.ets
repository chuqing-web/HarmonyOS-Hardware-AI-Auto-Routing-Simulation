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
  /** 555 单稳态延时（按键触发）— 禁止套用串联 RC 充放电配方 */
  timer555Monostable: boolean;
  /** 555 无稳态多谐（振荡/方波/闪烁） */
  timer555Astable: boolean;
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
  /** SIGNAL_GEN 幅度文案（如 5V / 2V），空=默认 1V；滞回整形默认≥5V */
  preferredSignalAmplitude: string;
  /** 滞回/施密特比较器整形：激励峰值须越过 ±β·|Vsat| */
  needsHysteresisComparator: boolean;
  /** 运放积分器（方波→三角等）：反相积分 + 双电源 + SIGNAL_GEN */
  needsOpAmpIntegrator: boolean;
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
    timer555Monostable: false,
    timer555Astable: false,
    dualSupply: false,
    preferredVccVoltage: '',
    preferredVeeVoltage: '',
    needsSignalGen: false,
    signalWaveform: 'sine',
    preferredSignalFrequency: '',
    preferredSignalDuty: '',
    preferredSignalAmplitude: '',
    needsHysteresisComparator: false,
    needsOpAmpIntegrator: false,
    hasInstruments: false,
    needsLedSeriesR: false,
    needsI2cPullup: false,
    needsOpAmpFeedback: false,
    passiveOnly: false,
    reasons: []
  };
}

/** 解析幅度文案为伏特峰值；无法解析返回 NaN */
export function parseSignalAmplitudeVolts(text: string): number {
  const s = (text ?? '').trim();
  if (s.length === 0) {
    return Number.NaN;
  }
  const m = s.match(/^([\d.]+)\s*[Vv]?$/);
  if (!m) {
    return Number.NaN;
  }
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** 滞回整形激励最小可靠峰值（Rf/Rg≈10:1、±12V 时 |Vth|≈1V，1V 峰会锁死） */
export const HYSTERESIS_MIN_SIGNAL_AMP_V: number = 2;
/** 滞回整形推荐峰值（余量充足） */
export const HYSTERESIS_RECOMMENDED_SIGNAL_AMP: string = '5V';

/** 当前幅度过小或不合法时返回推荐文案，否则原样（空→推荐） */
export function resolveHysteresisSafeAmplitude(ampText: string): string {
  const curV = parseSignalAmplitudeVolts(ampText);
  if (!Number.isFinite(curV) || curV < HYSTERESIS_MIN_SIGNAL_AMP_V) {
    return HYSTERESIS_RECOMMENDED_SIGNAL_AMP;
  }
  return (ampText ?? '').trim().length > 0 ? ampText.trim() : HYSTERESIS_RECOMMENDED_SIGNAL_AMP;
}

/** 画布上是否具备滞回整形常见 BOM（运放+信号源） */
export function schematicLikelyHysteresisComparator(libDevIds: string[]): boolean {
  let hasOp = false;
  let hasSig = false;
  for (let i = 0; i < libDevIds.length; i++) {
    const u = (libDevIds[i] ?? '').toUpperCase();
    if (u.indexOf('UA741') >= 0 || u.indexOf('LM358') >= 0 || u.indexOf('TL082') >= 0 ||
      u.indexOf('LM324') >= 0 || u.indexOf('LM741') >= 0 || u === 'OPAMP') {
      hasOp = true;
    }
    if (u.indexOf('SIGNAL_GEN') >= 0) {
      hasSig = true;
    }
  }
  return hasOp && hasSig;
}

function isOpAmpIntegratorPrompt(prompt: string): boolean {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();
  if (zh.indexOf('积分') >= 0 || lower.indexOf('integrator') >= 0 ||
    lower.indexOf('integrat') >= 0) {
    return true;
  }
  // 方波入 → 三角出（经典积分示教）
  const hasSquareIn = zh.indexOf('方波') >= 0 || lower.indexOf('square') >= 0;
  const hasTriOut = zh.indexOf('三角') >= 0 || lower.indexOf('triangle') >= 0 ||
    lower.indexOf('ramp') >= 0;
  const hasOp = zh.indexOf('运放') >= 0 || lower.indexOf('opamp') >= 0 ||
    zh.indexOf('741') >= 0 || zh.indexOf('TL082') >= 0 || zh.indexOf('LM358') >= 0;
  return hasOp && hasSquareIn && hasTriOut;
}

function isHysteresisComparatorPrompt(prompt: string): boolean {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();
  return zh.indexOf('滞回') >= 0 || zh.indexOf('施密特') >= 0 ||
    lower.indexOf('schmitt') >= 0 || lower.indexOf('hysteresis') >= 0 ||
    (zh.indexOf('比较器') >= 0 && (zh.indexOf('整形') >= 0 || zh.indexOf('正反馈') >= 0 ||
      zh.indexOf('方波') >= 0)) ||
    (zh.indexOf('整形') >= 0 && (zh.indexOf('正弦') >= 0 || zh.indexOf('方波') >= 0));
}

/** 串联 RC 充放电 / τ 观测（禁套互斥继电器） */
function isSeriesRcChargePrompt(prompt: string): boolean {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();
  if (isMutualLedSwitchPrompt(prompt)) {
    return false;
  }
  // 555 单稳态也常写「RC / 延时」，不得误判为串联 RC 充放电
  if (is555MonostablePrompt(prompt)) {
    return false;
  }
  return zh.indexOf('充放电') >= 0 || zh.indexOf('时间常数') >= 0 ||
    zh.indexOf('指数波形') >= 0 || zh.indexOf('τ=RC') >= 0 || zh.indexOf('τ＝RC') >= 0 ||
    zh.indexOf('tau=RC') >= 0 || lower.indexOf('time constant') >= 0 ||
    lower.indexOf('rc charge') >= 0 || lower.indexOf('rc discharge') >= 0 ||
    (zh.indexOf('RC') >= 0 && (zh.indexOf('电容') >= 0 || zh.indexOf('电阻') >= 0) &&
      (zh.indexOf('充电') >= 0 || zh.indexOf('放电') >= 0 || zh.indexOf('波形') >= 0));
}

/** 555 单稳态延时 / 按键触发 */
function is555MonostablePrompt(prompt: string): boolean {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();
  return zh.indexOf('单稳态') >= 0 || zh.indexOf('单稳') >= 0 ||
    zh.indexOf('延时') >= 0 || zh.indexOf('延迟') >= 0 ||
    zh.indexOf('延时熄灭') >= 0 ||
    lower.indexOf('monostable') >= 0 || lower.indexOf('one-shot') >= 0 ||
    lower.indexOf('oneshot') >= 0 || lower.indexOf('one shot') >= 0;
}

/** 555 无稳态多谐 / 振荡 */
function is555AstablePrompt(prompt: string): boolean {
  const zh = prompt ?? '';
  const lower = zh.toLowerCase();
  return zh.indexOf('多谐') >= 0 || zh.indexOf('振荡') >= 0 ||
    zh.indexOf('方波') >= 0 || zh.indexOf('闪烁') >= 0 ||
    lower.indexOf('astable') >= 0 || lower.indexOf('multivibrator') >= 0;
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
  // 555：区分单稳态 vs 无稳态（禁止一律打成 555_astable）
  if (zh.indexOf('555') >= 0 || lower.indexOf('lm555') >= 0) {
    const mono = is555MonostablePrompt(prompt);
    const asta = is555AstablePrompt(prompt);
    if (mono && !asta) {
      intent.timer555Monostable = true;
      intent.seriesRcCharge = false;
      pushReason(intent, '555_monostable');
    } else if (asta && !mono) {
      intent.timer555Astable = true;
      intent.blinkOscillator = true;
      pushReason(intent, '555_astable');
    } else if (mono && asta) {
      // 同时出现时：单稳态关键词优先（「555 单稳态延时」）
      intent.timer555Monostable = true;
      intent.seriesRcCharge = false;
      pushReason(intent, '555_monostable');
    } else if (zh.indexOf('按键') >= 0 || zh.indexOf('触发') >= 0 ||
      lower.indexOf('button') >= 0 || lower.indexOf('trigger') >= 0) {
      intent.timer555Monostable = true;
      intent.seriesRcCharge = false;
      pushReason(intent, '555_monostable');
    } else {
      // 裸「555」默认无稳态配方（兼容旧提示）
      intent.timer555Astable = true;
      pushReason(intent, '555_astable');
    }
  }

  if (isSeriesRcChargePrompt(prompt) && !intent.timer555Monostable && !intent.timer555Astable) {
    // 运放积分不是串联 RC 充放电
    if (!intent.needsOpAmpIntegrator && prompt.indexOf('积分') < 0) {
      intent.seriesRcCharge = true;
      intent.mutualLedIndicator = false;
      intent.relayContactTopo = false;
      pushReason(intent, 'series_rc_charge');
    }
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
    zh.indexOf('741') >= 0 || zh.indexOf('TL082') >= 0 || zh.indexOf('比较器') >= 0 ||
    zh.indexOf('滞回') >= 0 || zh.indexOf('施密特') >= 0 || lower.indexOf('schmitt') >= 0) {
    intent.needsOpAmpFeedback = true;
    pushReason(intent, 'opamp_keyword');
  }
  if (isHysteresisComparatorPrompt(prompt)) {
    intent.needsHysteresisComparator = true;
    intent.needsOpAmpFeedback = true;
    intent.dualSupply = true;
    pushReason(intent, 'hysteresis_comparator');
  }
  if (isOpAmpIntegratorPrompt(prompt)) {
    intent.needsOpAmpIntegrator = true;
    intent.needsOpAmpFeedback = true;
    intent.dualSupply = true;
    intent.needsSignalGen = true;
    intent.hasInstruments = true;
    if (intent.signalWaveform.length === 0 || intent.signalWaveform === 'sine') {
      // 积分示教默认方波激励（可被用户显式波形覆盖，见 applyPowerAndSignalIntent）
      intent.signalWaveform = 'square';
    }
    if (intent.preferredSignalAmplitude.length === 0) {
      intent.preferredSignalAmplitude = '5V';
    }
    pushReason(intent, 'opamp_integrator');
  }

  applyPowerAndSignalIntent(intent, prompt);

  // 积分器：激励波形以方波为准（「三角」是输出观测，不是信号源）
  if (intent.needsOpAmpIntegrator) {
    intent.dualSupply = true;
    intent.needsSignalGen = true;
    const zh2 = prompt ?? '';
    const lower2 = zh2.toLowerCase();
    const userSaidSineExcite =
      (zh2.indexOf('正弦') >= 0 || lower2.indexOf('sine') >= 0) &&
      (zh2.indexOf('输入') >= 0 || zh2.indexOf('激励') >= 0 || zh2.indexOf('信号源') >= 0);
    if (!userSaidSineExcite) {
      intent.signalWaveform = 'square';
    }
    if (intent.preferredSignalAmplitude.length === 0) {
      intent.preferredSignalAmplitude = '5V';
    }
    if (intent.preferredVccVoltage.length === 0) {
      intent.preferredVccVoltage = '12V';
    }
    if (intent.preferredVeeVoltage.length === 0) {
      intent.preferredVeeVoltage = '-12V';
    }
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
  // 运放默认双电源（教学场景）；仅当用户明确「单电源」时保持单供
  if (intent.needsOpAmpFeedback && !intent.dualSupply) {
    if (zh.indexOf('单电源') >= 0 || lower.indexOf('single supply') >= 0 ||
      zh.indexOf('单供') >= 0) {
      pushReason(intent, 'opamp_single_supply');
    } else {
      intent.dualSupply = true;
      intent.needsPowerRails = true;
      pushReason(intent, 'opamp_dual_default');
    }
  }
  // 积分器：强制双电源 + 方波激励缺省
  if (intent.needsOpAmpIntegrator) {
    intent.dualSupply = true;
    intent.needsPowerRails = true;
    intent.needsSignalGen = true;
    if (intent.signalWaveform !== 'sine' && intent.signalWaveform !== 'triangle' &&
      intent.signalWaveform !== 'saw' && intent.signalWaveform !== 'pulse') {
      intent.signalWaveform = 'square';
    }
    if (intent.preferredSignalAmplitude.length === 0) {
      intent.preferredSignalAmplitude = '5V';
    }
  }

  // VCC 电压
  const dualRailM = zh.match(/[±]\s*(15|12|5)\s*[Vv]/);
  if (dualRailM) {
    intent.dualSupply = true;
    intent.preferredVccVoltage = `${dualRailM[1]}V`;
    intent.preferredVeeVoltage = `-${dualRailM[1]}V`;
    pushReason(intent, `dualRail=±${dualRailM[1]}V`);
  }
  const vccM = zh.match(/(?:VCC|VDD|电源|供电)\s*(?:=|为|:|：)?\s*(3\.3|5|12|15)\s*V/i);
  if (vccM) {
    intent.preferredVccVoltage = `${vccM[1]}V`;
    pushReason(intent, `vcc=${intent.preferredVccVoltage}`);
  } else if (!dualRailM) {
    const bareV = zh.match(/\b(3\.3|5|12|15)\s*V\b/i);
    if (bareV) {
      intent.preferredVccVoltage = `${bareV[1]}V`;
      pushReason(intent, `vcc=${intent.preferredVccVoltage}`);
    }
  }
  // VEE 电压
  const veeM = zh.match(/(?:VEE|负压|负电源)\s*(?:=|为|:|：)?\s*(-?1?5|-?1?2|-?5)\s*V/i) ||
    zh.match(/(-\s*15|-\s*12|-\s*5)\s*V/i);
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
  // 双电源：未指定正轨时与 |VEE| 对称
  if (intent.dualSupply && intent.preferredVccVoltage.length === 0) {
    const veeN = parseFloat((intent.preferredVeeVoltage || '-12').replace(/[Vv]/g, ''));
    const abs = Number.isFinite(veeN) ? Math.abs(veeN) : 12;
    intent.preferredVccVoltage = `${abs > 0 ? abs : 12}V`;
    pushReason(intent, `vccSym=${intent.preferredVccVoltage}`);
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
  // 幅度：幅度5V / amp=2V / ±5V（作峰峰值时取一半？此处按峰值文案）
  const ampM = zh.match(/(?:幅度|幅值|amplitude|amp)\s*(?:=|为|:|：)?\s*([\d.]+)\s*[Vv]?/i) ||
    zh.match(/[±]\s*([\d.]+)\s*[Vv]/);
  if (ampM) {
    const n = parseFloat(ampM[1]);
    if (Number.isFinite(n) && n > 0) {
      intent.preferredSignalAmplitude = `${n}V`;
      pushReason(intent, `sigAmp=${intent.preferredSignalAmplitude}`);
    }
  }
  // 滞回整形：激励须 >|Vth|；未指定或过小则抬到推荐 5V
  if (intent.needsHysteresisComparator) {
    intent.needsSignalGen = true;
    if (intent.signalWaveform.length === 0) {
      intent.signalWaveform = 'sine';
    }
    const curV = parseSignalAmplitudeVolts(intent.preferredSignalAmplitude);
    if (!Number.isFinite(curV) || curV < HYSTERESIS_MIN_SIGNAL_AMP_V) {
      intent.preferredSignalAmplitude = HYSTERESIS_RECOMMENDED_SIGNAL_AMP;
      pushReason(intent, `sigAmpHyst=${HYSTERESIS_RECOMMENDED_SIGNAL_AMP}`);
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
  const has555Bom = ids.some(m => m.indexOf('LM555') >= 0 || m.indexOf('NE555') >= 0 || m === '555');
  if (has555Bom) {
    if (is555MonostablePrompt(prompt) || intent.timer555Monostable) {
      intent.timer555Monostable = true;
      intent.timer555Astable = false;
      intent.seriesRcCharge = false;
      pushReason(intent, '555_monostable_bom');
    } else if (is555AstablePrompt(prompt) || intent.timer555Astable || intent.blinkOscillator) {
      intent.timer555Astable = true;
      pushReason(intent, '555_astable_bom');
    } else if (!intent.timer555Monostable && !intent.timer555Astable) {
      // BOM 有 555 但提示未明：有按键倾向单稳态，否则无稳态
      if (ids.some(m => m.indexOf('SW_') >= 0) && !intent.blinkOscillator) {
        intent.timer555Monostable = true;
        intent.seriesRcCharge = false;
        pushReason(intent, '555_monostable_bom');
      } else {
        intent.timer555Astable = true;
        pushReason(intent, '555_astable_bom');
      }
    }
  }
  if (!intent.timer555Monostable && !intent.timer555Astable &&
    (intent.seriesRcCharge || (hasR && hasC && isSeriesRcChargePrompt(prompt)))) {
    if (!intent.needsOpAmpIntegrator && prompt.indexOf('积分') < 0) {
      intent.seriesRcCharge = true;
      intent.relayContactTopo = false;
      intent.mutualLedIndicator = false;
      pushReason(intent, 'series_rc_bom');
    }
  }
  // 555 与串联 RC 互斥：板上有 555 时绝不能走 wireSeriesRc
  if (intent.timer555Monostable || intent.timer555Astable || has555Bom) {
    intent.seriesRcCharge = false;
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
    m.indexOf('LM358') >= 0 || m.indexOf('LM324') >= 0 || m.indexOf('OPAMP') >= 0 ||
    m.indexOf('UA741') >= 0 || m.indexOf('TL082') >= 0 || m.indexOf('LM741') >= 0);
  if (hasOp) {
    intent.needsOpAmpFeedback = true;
    pushReason(intent, 'opamp_bom');
  }
  if (isHysteresisComparatorPrompt(prompt) ||
    (hasOp && intent.needsSignalGen && (prompt.indexOf('整形') >= 0 ||
      prompt.indexOf('滞回') >= 0 || prompt.indexOf('比较器') >= 0))) {
    intent.needsHysteresisComparator = true;
    intent.needsOpAmpFeedback = true;
    pushReason(intent, 'hysteresis_bom');
  }
  if (isOpAmpIntegratorPrompt(prompt) ||
    (hasOp && intent.needsSignalGen && prompt.indexOf('积分') >= 0)) {
    intent.needsOpAmpIntegrator = true;
    intent.needsOpAmpFeedback = true;
    intent.dualSupply = true;
    intent.needsSignalGen = true;
    pushReason(intent, 'integrator_bom');
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
  // BOM 显式收获 VCC/VEE/SIGNAL_GEN 电参（AI 选型决定值优先于启发式）
  const bomList = out.deviceRequireList ?? [];
  for (let bi = 0; bi < bomList.length; bi++) {
    const id = `${bomList[bi].explicitModel ?? ''} ${bomList[bi].devType ?? ''}`.toUpperCase();
    const pc = bomList[bi].paramConstraint;
    if (id.indexOf('VCC') >= 0 && id.indexOf('VEE') < 0) {
      const vv = (pc?.get('voltage') ?? '').trim();
      if (vv.length > 0) {
        intent.preferredVccVoltage = vv;
        pushReason(intent, `vccBom=${vv}`);
      }
    }
    if (id.indexOf('VEE') >= 0) {
      const vv = (pc?.get('voltage') ?? '').trim();
      if (vv.length > 0) {
        intent.preferredVeeVoltage = vv;
        intent.dualSupply = true;
        pushReason(intent, `veeBom=${vv}`);
      }
    }
  }
  // 双电源：空 VEE/VCC 才补对称默认；已写不对称（如 5/-12）由 HARD critique 逼 AI 改，不本地改写
  if (intent.dualSupply) {
    if (intent.preferredVeeVoltage.length === 0) {
      intent.preferredVeeVoltage = '-12V';
    }
    if (intent.preferredVccVoltage.length === 0) {
      const veeN = parseFloat(intent.preferredVeeVoltage.replace(/[Vv]/g, ''));
      const absVee = Number.isFinite(veeN) ? Math.abs(veeN) : 12;
      intent.preferredVccVoltage = `${absVee > 0 ? absVee : 12}V`;
      pushReason(intent, `vccSymBom=${intent.preferredVccVoltage}`);
    }
  }
  if (hasSig) {
    intent.needsSignalGen = true;
    intent.hasInstruments = true;
    pushReason(intent, 'signal_gen_bom');
    // BOM 显式 waveform 覆盖启发式（避免「输出方波」误判激励）
    for (let i = 0; i < bomList.length; i++) {
      const id = `${bomList[i].explicitModel ?? ''} ${bomList[i].devType ?? ''}`.toUpperCase();
      if (id.indexOf('SIGNAL_GEN') < 0) {
        continue;
      }
      const wf = (bomList[i].paramConstraint?.get('waveform') ?? '').trim().toLowerCase();
      if (wf === 'sine' || wf === 'square' || wf === 'triangle' || wf === 'saw' || wf === 'pulse') {
        intent.signalWaveform = wf;
        pushReason(intent, `sigWfBom=${wf}`);
      }
      const freq = (bomList[i].paramConstraint?.get('frequency') ?? '').trim();
      if (freq.length > 0) {
        intent.preferredSignalFrequency = freq;
      }
      const duty = (bomList[i].paramConstraint?.get('dutyCycle') ?? '').trim();
      if (duty.length > 0) {
        intent.preferredSignalDuty = duty;
      }
      const amp = (bomList[i].paramConstraint?.get('amplitude') ?? '').trim();
      if (amp.length > 0) {
        intent.preferredSignalAmplitude = amp;
        pushReason(intent, `sigAmpBom=${amp}`);
      }
      break;
    }
  }
  // 滞回：BOM 幅度过小则抬到推荐值（避免 1V 峰锁死单轨）
  if (intent.needsHysteresisComparator) {
    intent.needsSignalGen = true;
    const curV = parseSignalAmplitudeVolts(intent.preferredSignalAmplitude);
    if (!Number.isFinite(curV) || curV < HYSTERESIS_MIN_SIGNAL_AMP_V) {
      intent.preferredSignalAmplitude = HYSTERESIS_RECOMMENDED_SIGNAL_AMP;
      pushReason(intent, `sigAmpHystBump=${HYSTERESIS_RECOMMENDED_SIGNAL_AMP}`);
    }
  }
  // 运放 / 积分：未声明单电源 → 意图标记双电源（供 Prompt 注入）；具体电压由 LLM 写出
  if (intent.needsOpAmpFeedback || intent.needsOpAmpIntegrator) {
    const zh = prompt ?? '';
    if (zh.indexOf('单电源') < 0 && zh.toLowerCase().indexOf('single supply') < 0) {
      intent.dualSupply = true;
      // 仅当 BOM 未写电压时给意图默认，供空字段补齐；已有 vccBom/veeBom 不覆盖
      if (intent.preferredVeeVoltage.length === 0) {
        intent.preferredVeeVoltage = '-12V';
      }
      if (intent.preferredVccVoltage.length === 0) {
        intent.preferredVccVoltage = '12V';
        pushReason(intent, 'vccOpAmpDefault=12V');
      }
    }
  }
  if (intent.needsOpAmpIntegrator) {
    intent.needsSignalGen = true;
    if (intent.signalWaveform !== 'sine' && intent.signalWaveform !== 'pulse') {
      intent.signalWaveform = 'square';
    }
    if (intent.preferredSignalAmplitude.length === 0) {
      intent.preferredSignalAmplitude = '5V';
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
  const has555 = topo.deviceList.some(d => {
    const id = (d.libDevId ?? '').toUpperCase();
    return id.indexOf('LM555') >= 0 || id.indexOf('NE555') >= 0 || id === '555';
  });
  if (has555) {
    next.seriesRcCharge = false;
    if (!next.timer555Monostable && !next.timer555Astable) {
      const hasSw = topo.deviceList.some(d =>
        (d.libDevId ?? '').toUpperCase().indexOf('SW_') >= 0);
      if (hasSw && !next.blinkOscillator) {
        next.timer555Monostable = true;
        pushReason(next, '555_monostable_topo');
      } else {
        next.timer555Astable = true;
        pushReason(next, '555_astable_topo');
      }
    }
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
    timer555Monostable: src.timer555Monostable,
    timer555Astable: src.timer555Astable,
    dualSupply: src.dualSupply,
    preferredVccVoltage: src.preferredVccVoltage,
    preferredVeeVoltage: src.preferredVeeVoltage,
    needsSignalGen: src.needsSignalGen,
    signalWaveform: src.signalWaveform,
    preferredSignalFrequency: src.preferredSignalFrequency,
    preferredSignalDuty: src.preferredSignalDuty,
    preferredSignalAmplitude: src.preferredSignalAmplitude,
    needsHysteresisComparator: src.needsHysteresisComparator,
    needsOpAmpIntegrator: src.needsOpAmpIntegrator,
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
    ` t555=${intent.timer555Monostable ? 'mono' : (intent.timer555Astable ? 'asta' : '-')}` +
    ` dual=${intent.dualSupply} vcc=${intent.preferredVccVoltage || '-'}` +
    ` vee=${intent.preferredVeeVoltage || '-'} sig=${intent.needsSignalGen}/${intent.signalWaveform}` +
    `@${intent.preferredSignalFrequency || '1kHz'}/amp=${intent.preferredSignalAmplitude || '1V'}` +
    `/duty=${intent.preferredSignalDuty || '50%'}` +
    ` hyst=${intent.needsHysteresisComparator} integ=${intent.needsOpAmpIntegrator}` +
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
