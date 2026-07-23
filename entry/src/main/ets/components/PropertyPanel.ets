/**
 * Property panel — shows component parameters, instrument data, and MCU HEX burning.
 * Single-click any component to see its properties here.
 */
import { AppService } from '../services/AppService';
import {
  ComponentInstance, UnitParser, paramMapGet, emptyStringMap, ApiResult,
  CouplingMode, MathChannelOp, LogicDecodeProtocol, MultimeterMode, McuFamily,
  VoltmeterType, traceUiRefresh, traceUiSelect, traceBurn, formatFirmwarePreview,
  SimulationState, getPinNetMap, findNetForPinLabel
} from 'common';
import {
  ComponentParamsUpdate, ComponentParamEntry
} from 'schematic_editor';
import { ComponentDefinition } from 'component_library';
import { SimulationKernelImpl } from 'simulation_kernel';
import { ProteusParamRow, ProteusClassicBtn, ProteusSectionTitle, ProteusTextInput } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';
import { OscilloscopeWaveCanvas } from './OscilloscopeWaveCanvas';
import { LogicAnalyzerWaveCanvas } from './LogicAnalyzerWaveCanvas';
import fs from '@ohos.file.fs';
import { picker } from '@kit.CoreFileKit';
import util from '@ohos.util';

/** LED 显示阈值默认值（与器件 defaultParams 一致；属性板可改） */
const LED_DEF_LIT_VF = 1.2;
const LED_DEF_LIT_VK_MAX = 0.9;
const LED_DEF_LIT_I_MA = 0.5;
const LED_DEF_LIT_VF_ALT = 1.0;
const LED_DEF_DIM_VF = 0.25;
const LED_DEF_OPEN_VK = 2.5;

const LED_THRESH_KEYS: string[] = [
  'litVf', 'litVkMax', 'litImA', 'litVfAlt', 'dimVf', 'openVk'
];

@Component
export struct PropertyPanel {
  /** 主题切换时重建，避免色板静态字段变更后子树仍缓存旧色 */
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop @Watch('onSelectionChange') selectedComponentId: string = '';
  @Prop @Watch('onDocVersionChange') docVersion: number = 0;
  @Prop @Watch('onSimWaveTick') simWaveTick: number = 0;
  @Link statusMessage: string;
  onDeleted: () => void = () => {};
  @State comp: ComponentInstance | null = null;
  @State paramKey: string = '';
  @State paramValue: string = '';
  @State paramEntries: string[] = [];
  // Instrument readings — initialized to "0" so unconnected instruments show meaningful defaults
  @State mmReading: string = '0.000';
  @State mmMode: string = 'DCV';
  @State vmReading: string = '0.00';
  @State vmUnit: string = 'V DC';
  @State vmWaveTime: number[] = [];
  @State vmWaveData: number[] = [];
  @State amReading: string = '0.00';
  @State amUnit: string = 'mA DC';
  @State amWaveTime: number[] = [];
  @State amWaveData: number[] = [];
  @State pmVoltage: string = '0.00';
  @State pmCurrent: string = '0.00';
  @State pmPower: string = '0.00';
  @State pmPF: string = '0.00';
  @State fcFreq: string = '0 Hz';
  @State fcGate: string = '1';
  @State fcWaveTime: number[] = [];
  @State fcWaveData: number[] = [];
  // Signal generator
  @State sigFreq: string = '1kHz';
  @State sigAmp: string = '3.3V';
  // UART
  @State uartHex: string = '';
  @State uartLog: string = '';
  // Logic analyzer
  @State decodedFrames: string = '';
  // MCU HEX burn
  @State hexPath: string = '';
  @State hexRegisters: string = '';
  @State hexState: string = 'stopped';
  // Oscilloscope
  @State oscTimeData: number[] = [];
  @State oscWaveData: number[] = [];
  @State oscWaveDataCh2: number[] = [];
  // Logic Analyzer
  @State logicChannelData: number[][] = [];
  @State logicSampleCount: number = 128;
  @State logicChannelCount: number = 8;
  // LED live + thresholds
  @State ledStatus: string = '—';
  @State ledVa: string = '—';
  @State ledVk: string = '—';
  @State ledVf: string = '—';
  @State ledI: string = '—';

  private appService: AppService = AppService.getInstance();
  private refreshTimer: number = -1;
  private uiLogTick: number = 0;

  aboutToAppear(): void {
    this.loadComponent();
    this.startRefresh();
  }

  aboutToDisappear(): void {
    this.stopRefresh();
  }

  onSelectionChange(): void {
    this.loadComponent();
    this.ensureInstrumentBinding();
    this.refreshInstrumentData();
    this.logInstrumentReading(true);
  }

  onDocVersionChange(): void {
    this.loadComponent();
    if (this.comp !== null) {
      this.appService.invalidateInstrumentBinding(this.comp.id);
      this.ensureInstrumentBinding();
      this.refreshInstrumentData();
    } else {
      this.resetInstrumentDisplay();
      this.appService.setActiveInstrumentComponent(null);
    }
  }

  private resetInstrumentDisplay(): void {
    this.mmReading = '0.000';
    this.vmReading = '0.00';
    this.amReading = '0.00';
    this.pmVoltage = '0.00';
    this.pmCurrent = '0.00';
    this.pmPower = '0.00';
    this.pmPF = '0.00';
    this.fcFreq = '0 Hz';
    this.sigFreq = '1kHz';
    this.sigAmp = '3.3V';
    this.uartHex = '';
    this.uartLog = '';
    this.decodedFrames = '';
    this.oscWaveData = [];
    this.oscWaveDataCh2 = [];
    this.logicChannelData = [];
    this.hexPath = '';
    this.hexRegisters = '';
    this.hexState = 'stopped';
    this.ledStatus = '—';
    this.ledVa = '—';
    this.ledVk = '—';
    this.ledVf = '—';
    this.ledI = '—';
  }

  onSimWaveTick(): void {
    if (this.comp !== null) {
      this.refreshInstrumentData();
    }
  }

  private startRefresh(): void {
    this.refreshTimer = setInterval(() => {
      if (this.comp !== null) {
        this.refreshInstrumentData();
      }
    }, 150);
  }

  private stopRefresh(): void {
    if (this.refreshTimer >= 0) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = -1;
    }
  }

  refreshInstrumentData(): void {
    if (this.comp === null) {
      this.appService.setActiveInstrumentComponent(null);
      return;
    }
    const libId = this.comp.libraryId.toUpperCase();
    const isInstrument = libId.includes('METER') || libId.includes('SCOPE') || libId.includes('OSC') ||
      libId.includes('LOGIC') || libId.includes('ANALYZER') || libId.includes('POWER') ||
      libId.includes('SIGNAL') || libId.includes('UART') || libId.includes('GENERATOR');
    // Do not steal instrument binding when inspecting a pot / MCU / passive.
    if (isInstrument) {
      this.appService.setActiveInstrumentComponent(this.comp.id);
    }
    try {
      if (libId.includes('VIRTUAL_METER') || libId === 'MULTIMETER') {
        const raw = this.appService.readMultimeterRawForComponent(this.comp.id);
        if (raw !== null) {
          this.appService.instruments.multimeterSnapReading(raw);
          this.mmReading = this.formatDmmReading(raw);
        } else {
          const r = this.appService.instruments.measure();
          if (r.success && r.data !== undefined) {
            this.mmReading = this.formatDmmReading(Number(r.data));
          }
        }
        const snap = this.appService.instruments.getInstrumentSnapshot();
        if (snap !== undefined) {
          this.mmMode = this.modeLabel(snap.multimeterMode);
        }
      } else if (libId.includes('VOLTMETER')) {
        const delta = this.appService.readVoltmeterDeltaForComponent(this.comp.id);
        if (delta !== null) {
          this.appService.instruments.voltmeterSnapReading(delta);
          this.vmReading = delta.toFixed(2);
        } else {
          const r = this.appService.instruments.voltmeterMeasure();
          if (r.success && r.data !== undefined) {
            this.vmReading = Number(r.data).toFixed(2);
          }
        }
        const cfg = this.appService.instruments.getVoltmeterConfig();
        if (cfg.success && cfg.data !== undefined) {
          this.vmUnit = cfg.data.unit ?? 'V DC';
        }
        const vw = this.appService.instruments.getVoltmeterWave();
        if (vw.success && vw.data !== undefined && vw.data.voltageAxis.length > 1) {
          this.vmWaveTime = vw.data.timeAxis.slice();
          this.vmWaveData = vw.data.voltageAxis.slice();
        }
      } else if (libId.includes('AMMETER')) {
        const mA = this.appService.readAmmeterCurrentForComponent(this.comp.id);
        if (mA !== null) {
          this.appService.instruments.ammeterSnapReading(mA);
          this.amReading = mA.toFixed(3);
        } else {
          const r = this.appService.instruments.ammeterMeasure();
          if (r.success && r.data !== undefined) {
            this.amReading = Number(r.data).toFixed(3);
          }
        }
        const cfg = this.appService.instruments.getAmmeterConfig();
        if (cfg.success && cfg.data !== undefined) {
          this.amUnit = cfg.data.unit ?? 'mA DC';
        }
        const aw = this.appService.instruments.getAmmeterWave();
        if (aw.success && aw.data !== undefined && aw.data.voltageAxis.length > 1) {
          this.amWaveTime = aw.data.timeAxis.slice();
          this.amWaveData = aw.data.voltageAxis.slice();
        }
      } else if (libId.includes('POWER') || libId.includes('WATT')) {
        const pm = this.appService.readPowerMeterForComponent(this.comp.id);
        if (pm !== null) {
          this.pmVoltage = pm.voltage.toFixed(3);
          this.pmCurrent = (pm.current * 1000).toFixed(2);
          this.pmPower = (pm.power * 1000).toFixed(1);
          this.pmPF = pm.powerFactor.toFixed(2);
        } else {
          const r = this.appService.instruments.powerMeterMeasure();
          if (r.success && r.data !== undefined) {
            this.pmVoltage = Number(r.data.voltage).toFixed(3);
            this.pmCurrent = (Number(r.data.current) * 1000).toFixed(2);
            this.pmPower = (Number(r.data.power) * 1000).toFixed(1);
            this.pmPF = Number(r.data.powerFactor).toFixed(2);
          }
        }
      } else if (libId.includes('FREQ') || libId.includes('COUNTER')) {
        const r = this.appService.instruments.freqCounterMeasure();
        if (r.success && r.data !== undefined) {
          if (Number(r.data) >= 1e6) {
            this.fcFreq = `${(Number(r.data) / 1e6).toFixed(3)} MHz`;
          } else if (Number(r.data) >= 1e3) {
            this.fcFreq = `${(Number(r.data) / 1e3).toFixed(1)} kHz`;
          } else {
            this.fcFreq = `${Number(r.data).toFixed(0)} Hz`;
          }
        }
        const cfg = this.appService.instruments.getFreqCounterConfig();
        if (cfg.success && cfg.data !== undefined) {
          this.fcGate = `${cfg.data.gateTime}`;
        }
        const fw = this.appService.instruments.getFreqCounterWave();
        if (fw.success && fw.data !== undefined && fw.data.voltageAxis.length > 1) {
          this.fcWaveTime = fw.data.timeAxis.slice();
          this.fcWaveData = fw.data.voltageAxis.slice();
        }
      } else if (libId.includes('OSC')) {
        const w = this.appService.instruments.getOscilloscopeWave(0);
        if (w.success && w.data !== undefined) {
          this.oscTimeData = w.data.timeAxis.slice();
          this.oscWaveData = w.data.voltageAxis.slice();
        }
        const w2 = this.appService.instruments.getOscilloscopeWave(1);
        if (w2.success && w2.data !== undefined) {
          this.oscWaveDataCh2 = w2.data.voltageAxis.slice();
        }
      } else if (libId.includes('LOGIC') || libId.includes('ANALYZER')) {
        const snap = this.appService.instruments.getLogicWaveData();
        if (snap.success && snap.data !== undefined) {
          const channels: number[][] = [];
          const waveArr = snap.data;
          for (let i = 0; i < waveArr.length; i++) {
            const wave = waveArr[i];
            const bits: number[] = [];
            for (let j = 0; j < wave.voltageAxis.length; j++) {
              bits.push(wave.voltageAxis[j] > 0.5 ? 1 : 0);
            }
            channels.push(bits.slice());
          }
          this.logicChannelData = channels;
          this.logicSampleCount = channels.length > 0 ? channels[0].length : 128;
          this.logicChannelCount = channels.length;
        }
        const frames = this.appService.instruments.getDecodedFrames();
        if (frames.length > 0) {
          let text = '';
          for (let i = 0; i < Math.min(frames.length, 8); i++) {
            text += `[${frames[i].timestamp}] ${frames[i].data}\n`;
          }
          this.decodedFrames = text;
        }
      } else if (libId.includes('UART') || libId.includes('TERMINAL')) {
        this.uartLog = this.appService.instruments.getUartLog();
      }
    } catch (_e) {
      // Best-effort refresh
    }
    this.refreshLedStatus();
    this.logInstrumentReading(false);
  }

  private isLedThreshKey(key: string): boolean {
    for (let i = 0; i < LED_THRESH_KEYS.length; i++) {
      if (LED_THRESH_KEYS[i] === key) {
        return true;
      }
    }
    return false;
  }

  /** 阈值项在 LED 专区编辑，避免与通用参数列表重复 */
  private visibleParamEntries(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.paramEntries.length; i++) {
      const key = this.paramEntries[i];
      if (!this.isLedThreshKey(key)) {
        out.push(key);
      }
    }
    return out;
  }

  private parseLedNumber(raw: string, fallback: number): number {
    if (raw.length === 0) {
      return fallback;
    }
    const cleaned = raw.trim().replace(/[VvMmAa]/g, '').replace(/Ω/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }

  private getLedThresh(key: string, fallback: number): number {
    return this.parseLedNumber(this.paramDisplayValue(key), fallback);
  }

  private isLed(): boolean {
    if (this.comp === null) {
      return false;
    }
    return this.comp.libraryId.toUpperCase().includes('LED');
  }

  private findLedAnodeNet(def: ComponentDefinition, pinNets: Map<string, string>): string | null {
    for (let i = 0; i < def.pins.length; i++) {
      const pin = def.pins[i];
      const name = pin.name.toUpperCase();
      if (name === 'A' || name === 'ANODE' || name === '1') {
        const net = findNetForPinLabel(pinNets, pin.name) ?? findNetForPinLabel(pinNets, pin.id);
        if (net !== null) {
          return net;
        }
      }
    }
    if (def.pins.length > 0) {
      return findNetForPinLabel(pinNets, def.pins[0].name) ?? findNetForPinLabel(pinNets, def.pins[0].id);
    }
    return null;
  }

  private findLedCathodeNet(def: ComponentDefinition, pinNets: Map<string, string>): string | null {
    for (let i = 0; i < def.pins.length; i++) {
      const pin = def.pins[i];
      const name = pin.name.toUpperCase();
      if (name === 'K' || name === 'C' || name === 'CATHODE' || name === '2') {
        const net = findNetForPinLabel(pinNets, pin.name) ?? findNetForPinLabel(pinNets, pin.id);
        if (net !== null) {
          return net;
        }
      }
    }
    if (def.pins.length > 1) {
      return findNetForPinLabel(pinNets, def.pins[1].name) ?? findNetForPinLabel(pinNets, def.pins[1].id);
    }
    return null;
  }

  private refreshLedStatus(): void {
    if (this.comp === null || !this.isLed()) {
      return;
    }
    const defRes = this.appService.componentLibrary.getComponent(this.comp.libraryId);
    if (!defRes.success || defRes.data === undefined) {
      this.ledStatus = '—';
      this.ledVa = '—';
      this.ledVk = '—';
      this.ledVf = '—';
      this.ledI = '—';
      return;
    }
    const def = defRes.data;
    const doc = this.appService.schematicEditor.getDocument();
    const pinNets = getPinNetMap(this.comp.id, doc.nets);
    const anodeNet = this.findLedAnodeNet(def, pinNets);
    const cathodeNet = this.findLedCathodeNet(def, pinNets);
    if (anodeNet === null || cathodeNet === null || anodeNet === cathodeNet) {
      this.ledStatus = '未接线';
      this.ledVa = '—';
      this.ledVk = '—';
      this.ledVf = '—';
      this.ledI = '—';
      return;
    }
    const simState = this.appService.simulationKernel.getState();
    const simActive = simState === SimulationState.RUNNING || simState === SimulationState.PAUSED;
    if (!simActive) {
      this.ledStatus = '仿真未运行';
      this.ledVa = '—';
      this.ledVk = '—';
      this.ledVf = '—';
      this.ledI = '—';
      return;
    }
    const kernel = this.appService.simulationKernel as SimulationKernelImpl;
    const vA = kernel.getNetVoltageByUuid(anodeNet);
    const vK = kernel.getNetVoltageByUuid(cathodeNet);
    const vf = vA - vK;
    const current = Math.abs(kernel.getBranchCurrent(this.comp.id));
    this.ledVa = `${vA.toFixed(3)} V`;
    this.ledVk = `${vK.toFixed(3)} V`;
    this.ledVf = `${vf.toFixed(3)} V`;
    if (current >= 1e-3) {
      this.ledI = `${(current * 1000).toFixed(3)} mA`;
    } else {
      this.ledI = `${(current * 1e6).toFixed(2)} uA`;
    }
    let status = '熄灭';
    const litVf = this.getLedThresh('litVf', LED_DEF_LIT_VF);
    const litVkMax = this.getLedThresh('litVkMax', LED_DEF_LIT_VK_MAX);
    const litI = this.getLedThresh('litImA', LED_DEF_LIT_I_MA) * 1e-3;
    const litVfAlt = this.getLedThresh('litVfAlt', LED_DEF_LIT_VF_ALT);
    const dimVf = this.getLedThresh('dimVf', LED_DEF_DIM_VF);
    const openVk = this.getLedThresh('openVk', LED_DEF_OPEN_VK);
    if (vK >= openVk) {
      status = '熄灭';
    } else if ((vK <= litVkMax && vf >= litVf) ||
      (current >= litI && vf >= litVfAlt)) {
      status = '点亮';
    } else if (vf >= dimVf || (current >= 1e-5 && vf >= 0.15)) {
      status = '昏暗';
    }
    this.ledStatus = status;
  }

  private logInstrumentReading(onSelect: boolean): void {
    if (this.comp === null) {
      return;
    }
    if (!this.isInstrument()) {
      return;
    }
    this.uiLogTick++;
    if (!onSelect && this.uiLogTick % 20 !== 0) {
      return;
    }
    const kind = this.instrType();
    const reading = this.buildReadingSummary(kind);
    if (onSelect) {
      traceUiSelect('Props', this.comp.id, this.comp.refDes, this.comp.libraryId, kind, reading);
    } else {
      traceUiRefresh('Props', this.comp.id, this.comp.refDes, this.comp.libraryId, kind, reading);
    }
  }

  private buildReadingSummary(kind: string): string {
    if (kind === 'dmm') return `DMM ${this.mmReading} ${this.mmMode}`;
    if (kind === 'vm') return `VM ${this.vmReading} ${this.vmUnit}`;
    if (kind === 'am') return `AM ${this.amReading} ${this.amUnit}`;
    if (kind === 'power') return `PM V=${this.pmVoltage} I=${this.pmCurrent} P=${this.pmPower}`;
    if (kind === 'freq') return `FC ${this.fcFreq} gate=${this.fcGate}`;
    if (kind === 'osc') {
      const pts = this.oscWaveData.length;
      const last = pts > 0 ? this.oscWaveData[pts - 1].toFixed(4) : '0';
      return `OSC pts=${pts} last=${last}V`;
    }
    if (kind === 'logic') return `LA ch=${this.logicChannelCount} samples=${this.logicSampleCount}`;
    if (kind === 'uart') return `UART logLen=${this.uartLog.length}`;
    return kind;
  }

  private ensureInstrumentBinding(): void {
    if (this.comp === null) {
      return;
    }
    const libId = this.comp.libraryId.toUpperCase();
    if (!this.isInstrument() && !libId.includes('METER') && !libId.includes('SCOPE') &&
      !libId.includes('LOGIC') && !libId.includes('OSC') && !libId.includes('ANALYZER') &&
      !libId.includes('UART') && !libId.includes('GENERATOR') && !libId.includes('SIGNAL')) {
      return;
    }
    this.appService.setActiveInstrumentComponent(this.comp.id);
    this.appService.refreshInstrumentReaderForComponent(this.comp.id);
    if (libId.includes('VOLTMETER_DC') || libId === 'VOLTMETER') {
      this.vmUnit = 'V DC';
      this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
    }
  }

  loadComponent(): void {
    if (!this.selectedComponentId) {
      this.comp = null;
      this.paramEntries = [];
      this.resetInstrumentDisplay();
      return;
    }
    const doc = this.appService.schematicEditor.getDocument();
    this.comp = doc.components.find(c => c.id === this.selectedComponentId) ?? null;
    if (this.comp) {
      const keys: string[] = [];
      this.comp.parameters.forEach((_value: string, key: string) => {
        keys.push(key);
      });
      const def = this.appService.componentLibrary.getComponent(this.comp.libraryId);
      if (def.success && def.data !== undefined) {
        def.data.defaultParams.forEach((_value: string, key: string) => {
          if (!keys.includes(key)) {
            keys.push(key);
          }
        });
      }
      this.paramEntries = keys;
    } else {
      this.paramEntries = [];
    }
  }

  private paramDisplayValue(key: string): string {
    if (this.comp === null) {
      return '';
    }
    const stored = this.comp.parameters.get(key);
    if (stored !== undefined && stored.length > 0) {
      return stored;
    }
    const def = this.appService.componentLibrary.getComponent(this.comp.libraryId);
    if (def.success && def.data !== undefined) {
      return paramMapGet(def.data.defaultParams, key, '');
    }
    return '';
  }

  private paramEditable(key: string): boolean {
    if (this.comp === null) {
      return false;
    }
    const lib = this.comp.libraryId.toUpperCase();
    if (key === 'voltage') {
      return lib === 'VCC' || lib === 'VEE' || lib.includes('VAC') ||
        lib.includes('POWER') || lib.includes('VDC');
    }
    if (key === 'power') {
      return lib.startsWith('R_');
    }
    if (key === 'value') {
      return lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_');
    }
    // 信号发生器：波形 / 频率 / 幅值 / 偏置 / 占空比均可改
    if (lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN')) {
      return key === 'waveform' || key === 'frequency' || key === 'amplitude' ||
        key === 'offset' || key === 'dutyCycle' || key === 'duty';
    }
    if (lib.includes('LED')) {
      return key === 'color' || key === 'forwardVoltage' || this.isLedThreshKey(key);
    }
    return false;
  }

  private saveParam(key: string, value: string): void {
    if (this.comp === null) {
      return;
    }
    const validated = UnitParser.validateParam(key, value);
    if (!validated.valid) {
      this.statusMessage = `参数无效: ${key}=${value}`;
      return;
    }
    this.appService.schematicEditor.setDeviceParam(this.comp.id, key, validated.normalized);
    this.comp.parameters.set(key, validated.normalized);
    this.appService.syncComponentParamToSimulation(this.comp.id, key, validated.normalized);
    this.statusMessage = `已更新 ${key}=${validated.normalized}`;
  }

  private isInstrument(): boolean {
    return this.instrType().length > 0;
  }

  private instrType(): string {
    if (this.comp === null) return '';
    const id = this.comp.libraryId.toUpperCase();
    if (id.includes('OSC')) return 'osc';
    if (id.includes('LOGIC') || id.includes('ANALYZER')) return 'logic';
    if (id.includes('VIRTUAL_METER') || id === 'MULTIMETER') return 'dmm';
    if (id.includes('UART') || id.includes('TERMINAL')) return 'uart';
    if (id.includes('VOLT')) return 'vm';
    if (id.includes('AMMETER') || id.includes('AMP')) return 'am';
    if (id.includes('POWER') || id.includes('WATT')) return 'pm';
    if (id.includes('FREQ') || id.includes('COUNTER')) return 'fc';
    return '';
  }

  private modeLabel(mode: MultimeterMode): string {
    switch (mode) {
      case MultimeterMode.DCV: return 'DCV';
      case MultimeterMode.ACV: return 'ACV';
      case MultimeterMode.RESISTANCE: return 'OHM';
      case MultimeterMode.CURRENT: return 'AMP';
      case MultimeterMode.DIODE: return 'DIODE';
      default: return 'DCV';
    }
  }

  private formatDmmReading(raw: number): string {
    if (this.mmMode === 'AMP') {
      return `${(raw * 1000).toFixed(3)} mA`;
    }
    if (this.mmMode === 'OHM') {
      if (raw >= 1e8) {
        return 'OL';
      }
      if (raw >= 1000) {
        return `${(raw / 1000).toFixed(3)} kΩ`;
      }
      return `${raw.toFixed(1)} Ω`;
    }
    return `${raw.toFixed(3)} V`;
  }

  private isMcu(): boolean {
    if (this.comp === null) return false;
    const id = this.comp.libraryId;
    return id.includes('AT89') || id.includes('STC') || id.includes('STM32');
  }

  build() {
    Scroll() {
      Column({ space: 6 }) {
        if (this.comp) {
          // ---- Basic info (always shown) ----
          if (this.isInstrument()) {
            this.InstrumentComponentHeader()
          } else {
            ProteusSectionTitle({ title: '器件信息' })
            ProteusParamRow({ label: '位号', value: this.comp.refDes, editable: false })
            ProteusParamRow({ label: '型号', value: this.comp.libraryId, editable: false })
          }
          ProteusParamRow({ label: 'X', value: `${this.comp.position.x}`, editable: false })
          ProteusParamRow({ label: 'Y', value: `${this.comp.position.y}`, editable: false })

          // ---- Custom parameters ----
          if (this.paramEntries.length > 0) {
            Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4, bottom: 4 })
            ForEach(this.visibleParamEntries(), (key: string) => {
              ProteusParamRow({
                label: key,
                value: this.paramDisplayValue(key),
                editable: this.paramEditable(key),
                onChange: (v: string) => { this.saveParam(key, v); }
              })
            }, (key: string) => key)
          }

          // ---- Instrument data (conditional) ----
          if (this.isInstrument()) {
            Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 6, bottom: 4 })
            Text('仪表数据')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_LABEL)
              .fontWeight(FontWeight.Medium)
              .width('100%')
              .padding({ left: 8, top: 4 })
            if (this.instrType() === 'osc') {
              this.OscilloscopeSection()
            } else if (this.instrType() === 'logic') {
              this.LogicAnalyzerSection()
            } else if (this.instrType() === 'dmm') {
              this.MultimeterSection()
            } else if (this.instrType() === 'vm') {
              this.VoltmeterSection()
            } else if (this.instrType() === 'am') {
              this.AmmeterSection()
            } else if (this.instrType() === 'pm') {
              this.PowerMeterSection()
            } else if (this.instrType() === 'fc') {
              this.FreqCounterSection()
            } else if (this.instrType() === 'uart') {
              this.UartTerminalSection()
            }
          }

          // ---- LED live + thresholds ----
          if (this.isLed()) {
            Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 6, bottom: 4 })
            this.LedSection()
          }

          // ---- MCU HEX burn (conditional) ----
          if (this.isMcu()) {
            Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 6, bottom: 4 })
            Text('烧录 HEX')
              .fontSize(ProteusFonts.TITLE)
              .fontColor(ProteusColors.TEXT_LABEL)
              .fontWeight(FontWeight.Medium)
              .width('100%')
            this.McuBurnSection()
          }

          Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 6, bottom: 4 })

          // ---- Add parameter form ----
          Text('添加参数')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .width('100%')

          Row() {
            Text('名称:')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
            ProteusTextInput({
              placeholder: '参数名称',
              text: this.paramKey,
              onChange: (v: string) => { this.paramKey = v; }
            })
              .layoutWeight(1)
          }
          .width('100%').alignItems(VerticalAlign.Center)

          Row() {
            Text('数值:')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
            ProteusTextInput({
              placeholder: '参数值',
              text: this.paramValue,
              onChange: (v: string) => { this.paramValue = v; }
            })
              .layoutWeight(1)
          }
          .width('100%').alignItems(VerticalAlign.Center)

          Row({ space: 6 }) {
            ProteusClassicBtn({
              label: '添加',
              widthVal: '30%',
              onAction: () => {
                if (this.comp && this.paramKey) {
                  const validated = UnitParser.validateParam(this.paramKey, this.paramValue);
                  if (!validated.valid) {
                    this.statusMessage = `非法参数: ${this.paramValue}`;
                    return;
                  }
                  const entry: ComponentParamEntry = { key: this.paramKey, value: validated.normalized };
                  const update: ComponentParamsUpdate = { entries: [entry] };
                  this.appService.schematicEditor.updateComponentParams(this.comp.id, update);
                  this.appService.syncComponentParamToSimulation(this.comp.id, entry.key, entry.value);
                  this.loadComponent();
                  this.statusMessage = '参数已更新';
                }
              }
            })
            ProteusClassicBtn({
              label: '旋转',
              widthVal: '30%',
              onAction: () => {
                if (this.comp) {
                  const next = ((this.comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                  this.appService.schematicEditor.rotateComponent(this.comp.id, next);
                  this.loadComponent();
                }
              }
            })
            ProteusClassicBtn({
              label: '删除',
              widthVal: '30%',
              onAction: () => {
                if (this.comp) {
                  this.appService.schematicEditor.deleteComponent(this.comp.id);
                  this.comp = null;
                  this.onDeleted();
                  this.statusMessage = '器件已删除';
                }
              }
            })
          }
          .width('100%').justifyContent(FlexAlign.SpaceBetween)
        } else {
          Column() {
            Text('未选择器件')
              .fontSize(ProteusFonts.TITLE)
              .fontColor(ProteusColors.TEXT_LABEL)
            Text('单击画布上的器件查看属性')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .margin({ top: 4 })
          }
          .width('100%').alignItems(HorizontalAlign.Start)
        }
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 4, bottom: 8 })
    }
    .width('100%')
    .height('100%')
    .scrollBar(BarState.Auto)
    .backgroundColor(ProteusColors.CANVAS_BG)
    .key(`prop_panel_${this.themeRev}`)
  }

  @Builder
  InstrumentComponentHeader() {
    Column({ space: 4 }) {
      Text(this.comp !== null ? this.comp.refDes : '')
        .fontSize(14)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Medium)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
      Text(this.comp !== null ? this.comp.libraryId : '')
        .fontSize(11)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
    }
    .width('100%')
    .padding({ top: 4, bottom: 6, left: 2, right: 2 })
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  LedSection() {
    Column({ space: 4 }) {
      Text('LED 状态')
        .fontSize(ProteusFonts.TITLE)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .width('100%')
      ProteusParamRow({ label: '显示', value: this.ledStatus, editable: false, labelWidth: 100 })
      ProteusParamRow({ label: 'Va', value: this.ledVa, editable: false, labelWidth: 100 })
      ProteusParamRow({ label: 'Vk', value: this.ledVk, editable: false, labelWidth: 100 })
      ProteusParamRow({ label: 'Vf', value: this.ledVf, editable: false, labelWidth: 100 })
      ProteusParamRow({ label: 'I', value: this.ledI, editable: false, labelWidth: 100 })
      Text('显示阈值（可改）')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .width('100%')
        .margin({ top: 4 })
      ProteusParamRow({
        label: '点亮Vf',
        value: this.paramDisplayValue('litVf'),
        editable: true,
        labelWidth: 100,
        onChange: (v: string) => { this.saveParam('litVf', v); }
      })
      ProteusParamRow({
        label: '点亮Vk上限',
        value: this.paramDisplayValue('litVkMax'),
        editable: true,
        labelWidth: 100,
        onChange: (v: string) => { this.saveParam('litVkMax', v); }
      })
      ProteusParamRow({
        label: '点亮电流mA',
        value: this.paramDisplayValue('litImA'),
        editable: true,
        labelWidth: 100,
        onChange: (v: string) => { this.saveParam('litImA', v); }
      })
      ProteusParamRow({
        label: '点亮Vf(电流)',
        value: this.paramDisplayValue('litVfAlt'),
        editable: true,
        labelWidth: 100,
        onChange: (v: string) => { this.saveParam('litVfAlt', v); }
      })
      ProteusParamRow({
        label: '昏暗Vf',
        value: this.paramDisplayValue('dimVf'),
        editable: true,
        labelWidth: 100,
        onChange: (v: string) => { this.saveParam('dimVf', v); }
      })
      ProteusParamRow({
        label: '开路Vk',
        value: this.paramDisplayValue('openVk'),
        editable: true,
        labelWidth: 100,
        onChange: (v: string) => { this.saveParam('openVk', v); }
      })
      Text('点亮：Vk≤点亮Vk上限 且 Vf≥点亮Vf，或 I≥点亮电流 且 Vf≥点亮Vf(电流)')
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .width('100%')
      Text('昏暗：正向 Vf≥昏暗Vf 但未达点亮；熄灭：反偏 / Vf过低 / Vk≥开路Vk')
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  OscilloscopeSection() {
    Column({ space: 6 }) {
      Text('波形显示')
        .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
      OscilloscopeWaveCanvas({
        timeData: this.oscTimeData,
        voltageData: this.oscWaveData,
        channelLabel: 'CH1',
        waveColor: '#00e676',
        vPerDiv: 1,
        triggerLevel: 0,
        autoFit: true,
        canvasHeight: 140,
        showStats: true
      })
        .width('100%')
      if (this.oscWaveDataCh2.length > 1) {
        OscilloscopeWaveCanvas({
          timeData: this.oscTimeData,
          voltageData: this.oscWaveDataCh2,
          channelLabel: 'CH2',
          waveColor: '#40c4ff',
          vPerDiv: 1,
          triggerLevel: 0,
          autoFit: true,
          canvasHeight: 140,
          showStats: true
        })
          .width('100%')
      }
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'AC', widthVal: '48%',
          onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } })
        ProteusClassicBtn({ label: 'DC', widthVal: '48%',
          onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } })
      }
      .width('100%')
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'FFT', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.setMathChannel(MathChannelOp.FFT, true);
            const w = this.appService.instruments.getOscilloscopeWave(0);
            if (w.success && w.data !== undefined) {
              this.oscTimeData = w.data.timeAxis.slice();
              this.oscWaveData = w.data.voltageAxis.slice();
            }
            const w2 = this.appService.instruments.getOscilloscopeWave(1);
            if (w2.success && w2.data !== undefined) {
              this.oscWaveDataCh2 = w2.data.voltageAxis.slice();
            }
          } })
        ProteusClassicBtn({ label: '测量', widthVal: '48%',
          onAction: () => {
            const m = this.appService.instruments.measureCursors(50, 150);
            if (m.success && m.data !== undefined) {
              this.statusMessage =
                `ΔV:${m.data.deltaVoltage.toFixed(2)}V ΔT:${m.data.deltaTime.toFixed(3)}ms`;
            }
          } })
      }
      .width('100%')
    }
  }

  @Builder
  LogicAnalyzerSection() {
    Column({ space: 4 }) {
      if (this.logicChannelData.length > 0) {
        Text('逻辑波形')
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
        LogicAnalyzerWaveCanvas({
          channelData: this.logicChannelData,
          channelCount: this.logicChannelCount,
          sampleCount: this.logicSampleCount
        })
          .width('100%').height(192)
          .border({ width: 1, color: ProteusColors.DIVIDER })
      } else {
        Text('(运行仿真后显示逻辑波形)')
          .fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_SECONDARY)
      }
      Text('协议解码')
        .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
        .margin({ top: 4 })
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'UART', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200);
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'I2C', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C);
            this.refreshInstrumentData();
          } })
      }
      .width('100%')
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'SPI', widthVal: '100%',
          onAction: () => {
            this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI);
            this.refreshInstrumentData();
          } })
      }
      .width('100%')
      if (this.decodedFrames.length > 0) {
        Text(this.decodedFrames)
          .fontSize(9).fontColor(ProteusColors.TEXT_PRIMARY)
          .fontFamily('monospace')
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .padding(4).width('100%')
      } else {
        Text('(点击协议按钮解码)')
          .fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_SECONDARY)
      }
    }
  }

  @Builder
  MultimeterSection() {
    Column({ space: 6 }) {
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'DCV', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.DCV);
            this.mmMode = 'DCV';
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'ACV', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.ACV);
            this.mmMode = 'ACV';
            this.refreshInstrumentData();
          } })
      }
      .width('100%')
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'Ω', widthVal: '32%',
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
            this.mmMode = 'OHM';
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'A', widthVal: '32%',
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.CURRENT);
            this.mmMode = 'AMP';
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: '二极管', widthVal: '32%',
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.DIODE);
            this.mmMode = 'DIODE';
            this.refreshInstrumentData();
          } })
      }
      .width('100%')
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'Auto', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.autoRange();
            this.refreshInstrumentData();
          } })
      }
      .width('100%')
      Text(`${this.mmMode}: ${this.mmReading}`)
        .fontSize(22).fontColor(ProteusColors.TEXT_PRIMARY)
        .fontFamily('monospace').fontWeight(FontWeight.Bold)
        .width('100%').textAlign(TextAlign.Center)
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .padding(8).margin({ top: 4 })
    }
  }

  @Builder
  VoltmeterSection() {
    Column({ space: 4 }) {
      Text(`${this.vmReading} ${this.vmUnit}`)
        .fontSize(24).fontColor(ProteusColors.TEXT_PRIMARY)
        .fontFamily('monospace').fontWeight(FontWeight.Bold)
        .width('100%').textAlign(TextAlign.Center)
        .backgroundColor('#E8F5E9')
        .padding(8)
      if (this.vmWaveData.length > 1) {
        OscilloscopeWaveCanvas({
          timeData: this.vmWaveTime,
          voltageData: this.vmWaveData,
          channelLabel: 'ΔV',
          waveColor: '#66bb6a',
          vPerDiv: 1,
          triggerLevel: 0,
          autoFit: true,
          canvasHeight: 96,
          showStats: false
        })
          .width('100%')
      }
    }
  }

  @Builder
  AmmeterSection() {
    Column({ space: 4 }) {
      Text(`${this.amReading} ${this.amUnit}`)
        .fontSize(24).fontColor(ProteusColors.TEXT_PRIMARY)
        .fontFamily('monospace').fontWeight(FontWeight.Bold)
        .width('100%').textAlign(TextAlign.Center)
        .backgroundColor('#FFF3E0')
        .padding(8)
      if (this.amWaveData.length > 1) {
        OscilloscopeWaveCanvas({
          timeData: this.amWaveTime,
          voltageData: this.amWaveData,
          channelLabel: 'I(mA)',
          waveColor: '#ffa726',
          vPerDiv: 1,
          triggerLevel: 0,
          autoFit: true,
          canvasHeight: 96,
          showStats: false
        })
          .width('100%')
      }
    }
  }

  @Builder
  PowerMeterSection() {
    Column({ space: 4 }) {
      Text(`功率表读数`)
        .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
      ProteusParamRow({ label: '电压', value: `${this.pmVoltage} V`, editable: false })
      ProteusParamRow({ label: '电流', value: `${this.pmCurrent} mA`, editable: false })
      ProteusParamRow({ label: '功率', value: `${this.pmPower} mW`, editable: false })
      ProteusParamRow({ label: '功率因数', value: this.pmPF, editable: false })
    }
  }

  @Builder
  FreqCounterSection() {
    Column({ space: 4 }) {
      Text(this.fcFreq)
        .fontSize(24).fontColor('#FF2200')
        .fontFamily('monospace').fontWeight(FontWeight.Bold)
        .width('100%').textAlign(TextAlign.Center)
        .backgroundColor('#1a0000')
        .padding(8)
      if (this.fcWaveData.length > 1) {
        OscilloscopeWaveCanvas({
          timeData: this.fcWaveTime,
          voltageData: this.fcWaveData,
          channelLabel: 'IN',
          waveColor: '#42a5f5',
          vPerDiv: 1,
          triggerLevel: 0,
          autoFit: true,
          canvasHeight: 96,
          showStats: false
        })
          .width('100%')
      }
      Row({ space: 4 }) {
        Text('闸门:')
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
        TextInput({ text: this.fcGate })
          .fontSize(ProteusFonts.INPUT).fontColor(ProteusColors.TEXT_PRIMARY)
          .placeholderFont({ size: ProteusFonts.INPUT })
          .placeholderColor(ProteusColors.TEXT_SECONDARY)
          .caretColor(ProteusColors.INPUT_FOCUS)
          .width(50).height(ProteusDimens.PARAM_ROW_HEIGHT)
          .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .padding({ left: ProteusDimens.INPUT_PAD_H, right: ProteusDimens.INPUT_PAD_H })
          .onChange((v: string) => { this.fcGate = v; })
        ProteusClassicBtn({ label: '设置', widthVal: 40,
          onAction: () => {
            const g = parseFloat(this.fcGate) || 1;
            this.appService.instruments.freqCounterSetGateTime(g);
            this.statusMessage = `闸门设为 ${g}s`;
          } })
      }
      .width('100%').margin({ top: 4 })
    }
  }

  @Builder
  UartTerminalSection() {
    Column({ space: 4 }) {
      Text('串口终端')
        .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
      Row() {
        ProteusTextInput({
          placeholder: 'HEX: 55 AA',
          text: this.uartHex,
          onChange: (v: string) => { this.uartHex = v; }
        })
          .layoutWeight(1)
        ProteusClassicBtn({ label: '发', widthVal: 36,
          onAction: () => {
            this.appService.instruments.uartHexSend(this.uartHex);
            this.uartLog = this.appService.instruments.getUartLog();
            this.statusMessage = `已发送: ${this.uartHex}`;
          } })
        ProteusClassicBtn({ label: '收', widthVal: 36,
          onAction: () => {
            this.uartLog = this.appService.instruments.getUartLog();
            this.statusMessage = this.uartLog.length > 0 ? '已刷新接收日志' : '暂无数据';
          } })
      }
      .width('100%')
      Scroll() {
        Text(this.uartLog.length > 0 ? this.uartLog : '等待接收数据...')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(this.uartLog.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY)
          .fontFamily('monospace')
          .width('100%')
          .textAlign(TextAlign.Start)
      }
      .width('100%')
      .height(96)
      .padding(6)
      .backgroundColor(ProteusColors.INPUT_READONLY_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .scrollBar(BarState.Auto)
      .align(Alignment.TopStart)
      .edgeEffect(EdgeEffect.None)
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: '清空', widthVal: '48%',
          onAction: () => {
            this.appService.instruments.clearUartLog();
            this.uartLog = '';
          } })
        ProteusClassicBtn({ label: '导出', widthVal: '48%',
          onAction: () => {
            void this.appService.instruments.exportUartLog('/data/storage/el2/base/uart_log.txt');
            this.statusMessage = '日志已导出';
          } })
      }
      .width('100%')
    }
  }

  @Builder
  McuBurnSection() {
    Column({ space: 4 }) {
      Row() {
        ProteusTextInput({
          placeholder: 'firmware.hex 路径',
          text: this.hexPath,
          onChange: (v: string) => { this.hexPath = v; }
        })
          .layoutWeight(1)
        ProteusClassicBtn({ label: '浏览', widthVal: 44,
          onAction: () => { void this.browseHexFile(); } })
      }
      .width('100%')

      ProteusClassicBtn({ label: '烧录 HEX', widthVal: '100%',
        onAction: () => { void this.burnHex(); } })

      Row({ space: 4 }) {
        ProteusClassicBtn({ label: '▶', widthVal: '23%',
          onAction: () => {
            this.appService.hexDebugger.run();
            this.hexState = 'running';
            this.statusMessage = 'MCU 运行中';
          } })
        ProteusClassicBtn({ label: '⏸', widthVal: '23%',
          onAction: () => {
            this.appService.hexDebugger.pause();
            this.hexState = 'paused';
            this.statusMessage = 'MCU 已暂停';
          } })
        ProteusClassicBtn({ label: '↷', widthVal: '23%',
          onAction: () => {
            this.appService.hexDebugger.step();
            this.statusMessage = '单步执行';
          } })
        ProteusClassicBtn({ label: '↺', widthVal: '23%',
          onAction: () => {
            this.appService.hexDebugger.reset();
            this.hexState = 'stopped';
            this.statusMessage = 'MCU 已复位';
          } })
      }
      .width('100%').justifyContent(FlexAlign.SpaceBetween)

      Text(`状态: ${this.hexState}`)
        .fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_SECONDARY)

      ProteusClassicBtn({ label: '加载示例 HEX', widthVal: '100%',
        onAction: () => {
          const sampleHex = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
          const encoder = new util.TextEncoder();
          const data = encoder.encodeInto(sampleHex);
          let family: McuFamily = McuFamily.MCU_8051;
          if (this.comp !== null) {
            const id = this.comp.libraryId;
            if (id.includes('STM32')) family = McuFamily.MCU_STM32F1;
          }
          traceBurn('UI_BURN_BEGIN', `source=property_sample family=${family} bytes=${data.length}`);
          const result = this.appService.hexDebugger.loadHexData(data, family);
          if (result.success && result.data !== undefined) {
            const fam = family === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
            this.appService.loadMcuIntoSim(result.data.data, 0, fam);
            this.statusMessage = 'HEX 加载成功';
          } else {
            this.statusMessage = `加载失败: ${result.error}`;
            traceBurn('UI_BURN_FAIL', `source=property_sample err=${result.error}`);
          }
        } })

      if (this.hexRegisters.length > 0) {
        Text('寄存器组')
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
          .margin({ top: 4 })
        Text(this.hexRegisters)
          .fontSize(9).fontColor(ProteusColors.TEXT_PRIMARY)
          .fontFamily('monospace')
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .padding(4).width('100%')
      }
    }
  }

  private async browseHexFile(): Promise<void> {
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['hex', 'HEX', 'ihx'];
      const docSelect = new picker.DocumentViewPicker();
      const uris = await docSelect.select(options);
      if (uris.length > 0) {
        this.hexPath = uris[0];
      }
    } catch (_e) {
      this.statusMessage = '文件选择器不可用，请手动输入路径';
    }
  }

  private async burnHex(): Promise<void> {
    if (this.hexPath.length === 0) {
      this.statusMessage = '请先输入 HEX 文件路径';
      traceBurn('UI_BURN_ABORT', 'empty path (property panel)');
      return;
    }
    this.statusMessage = '烧录中...';
    const ref = this.comp !== null ? this.comp.refDes : '-';
    traceBurn('UI_BURN_BEGIN', `source=property_panel path=${this.hexPath} ref=${ref}`);
    try {
      const fileHandle = fs.openSync(this.hexPath, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(this.hexPath);
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buf);
      fs.closeSync(fileHandle);
      const data = new Uint8Array(buf);
      let family: McuFamily = McuFamily.MCU_8051;
      if (this.comp !== null) {
        const id = this.comp.libraryId;
        if (id.includes('STM32')) family = McuFamily.MCU_STM32F1;
      }
      const familyStr = family === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
      traceBurn('UI_BURN_READ',
        `path=${this.hexPath} size=${stat.size} family=${familyStr} preview=${formatFirmwarePreview(data)}`);
      const result = this.appService.hexDebugger.loadHexData(data, family);
      if (result.success && result.data !== undefined) {
        this.appService.loadMcuIntoSim(result.data.data, 0, familyStr);
        this.statusMessage = 'HEX 烧录成功';
        traceBurn('UI_BURN_OK', `source=property_panel path=${this.hexPath} family=${familyStr}`);
      } else {
        this.statusMessage = `烧录失败: ${result.error}`;
        traceBurn('UI_BURN_FAIL', `source=property_panel path=${this.hexPath} err=${result.error}`);
      }
    } catch (_e) {
      this.statusMessage = `打开文件失败: ${_e}`;
      traceBurn('UI_BURN_FAIL', `source=property_panel path=${this.hexPath} ex=${_e}`);
    }
  }
}
