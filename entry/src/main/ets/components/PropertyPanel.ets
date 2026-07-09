/**
 * Property panel — shows component parameters, instrument data, and MCU HEX burning.
 * Single-click any component to see its properties here.
 */
import { AppService } from '../services/AppService';
import {
  ComponentInstance, UnitParser, paramMapGet, emptyStringMap, ApiResult,
  CouplingMode, MathChannelOp, LogicDecodeProtocol, MultimeterMode, McuFamily
} from 'common';
import {
  ComponentParamsUpdate, ComponentParamEntry
} from 'schematic_editor';
import { ProteusParamRow, ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { OscilloscopeWaveCanvas } from './OscilloscopeWaveCanvas';
import { LogicAnalyzerWaveCanvas } from './LogicAnalyzerWaveCanvas';
import fs from '@ohos.file.fs';
import { picker } from '@kit.CoreFileKit';
import util from '@ohos.util';

@Component
export struct PropertyPanel {
  @Prop @Watch('onSelectionChange') selectedComponentId: string = '';
  @Prop @Watch('onDocVersionChange') docVersion: number = 0;
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
  @State amReading: string = '0.00';
  @State amUnit: string = 'mA DC';
  @State pmVoltage: string = '0.00';
  @State pmCurrent: string = '0.00';
  @State pmPower: string = '0.00';
  @State pmPF: string = '0.00';
  @State fcFreq: string = '0 Hz';
  @State fcGate: string = '1';
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

  private appService: AppService = AppService.getInstance();
  private refreshTimer: number = -1;

  aboutToAppear(): void {
    this.loadComponent();
    this.startRefresh();
  }

  aboutToDisappear(): void {
    this.stopRefresh();
  }

  onSelectionChange(): void {
    this.loadComponent();
    this.refreshInstrumentData();
  }

  onDocVersionChange(): void {
    this.loadComponent();
  }

  private startRefresh(): void {
    this.refreshTimer = setInterval(() => {
      if (this.comp !== null) {
        this.refreshInstrumentData();
      }
    }, 500);
  }

  private stopRefresh(): void {
    if (this.refreshTimer >= 0) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = -1;
    }
  }

  refreshInstrumentData(): void {
    if (this.comp === null) {
      // Clear per-component readers when nothing is selected
      this.appService.clearPerComponentReaders();
      return;
    }
    const libId = this.comp.libraryId.toUpperCase();
    // Wire instrument reader to selected component's circuit nets for all instrument types
    if (this.isInstrument() || libId.includes('METER') || libId.includes('SCOPE') || libId.includes('LOGIC')) {
      this.appService.refreshInstrumentReaderForComponent(this.comp.id);
    }
    try {
      if (libId.includes('VIRTUAL_METER') || libId === 'MULTIMETER') {
        const r = this.appService.instruments.measure();
        if (r.success && r.data !== undefined) {
          this.mmReading = Number(r.data).toFixed(3);
        }
        const snap = this.appService.instruments.getInstrumentSnapshot();
        if (snap !== undefined) {
          this.mmMode = this.modeLabel(snap.multimeterMode);
        }
      } else if (libId.includes('VOLTMETER')) {
        const r = this.appService.instruments.voltmeterMeasure();
        if (r.success && r.data !== undefined) {
          this.vmReading = Number(r.data).toFixed(2);
        }
        const cfg = this.appService.instruments.getVoltmeterConfig();
        if (cfg.success && cfg.data !== undefined) {
          this.vmUnit = cfg.data.unit ?? 'V DC';
        }
      } else if (libId.includes('AMMETER')) {
        const r = this.appService.instruments.ammeterMeasure();
        if (r.success && r.data !== undefined) {
          this.amReading = Number(r.data).toFixed(3);
        }
        const cfg = this.appService.instruments.getAmmeterConfig();
        if (cfg.success && cfg.data !== undefined) {
          this.amUnit = cfg.data.unit ?? 'mA DC';
        }
      } else if (libId.includes('POWER') || libId.includes('WATT')) {
        const r = this.appService.instruments.powerMeterMeasure();
        if (r.success && r.data !== undefined) {
          this.pmVoltage = Number(r.data.voltage).toFixed(3);
          this.pmCurrent = (Number(r.data.current) * 1000).toFixed(2);
          this.pmPower = (Number(r.data.power) * 1000).toFixed(1);
          this.pmPF = Number(r.data.powerFactor).toFixed(2);
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
      } else if (libId.includes('OSC')) {
        const w = this.appService.instruments.getOscilloscopeWave(0);
        if (w.success && w.data !== undefined) {
          this.oscTimeData = w.data.timeAxis;
          this.oscWaveData = w.data.voltageAxis;
        }
        const w2 = this.appService.instruments.getOscilloscopeWave(1);
        if (w2.success && w2.data !== undefined) {
          this.oscWaveDataCh2 = w2.data.voltageAxis;
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
            channels.push(bits);
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
  }

  loadComponent(): void {
    if (!this.selectedComponentId) {
      this.comp = null;
      this.oscWaveData = [];
      this.oscWaveDataCh2 = [];
      return;
    }
    const doc = this.appService.schematicEditor.getDocument();
    this.comp = doc.components.find(c => c.id === this.selectedComponentId) ?? null;
    if (this.comp) {
      const keys: string[] = [];
      this.comp.parameters.forEach((_value: string, key: string) => {
        keys.push(key);
      });
      this.paramEntries = keys;
    } else {
      this.paramEntries = [];
    }
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
          Text('器件信息')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .width('100%')
          ProteusParamRow({ label: '位号', value: this.comp.refDes, editable: false })
          ProteusParamRow({ label: '型号', value: this.comp.libraryId, editable: false })
          ProteusParamRow({ label: 'X', value: `${this.comp.position.x}`, editable: false })
          ProteusParamRow({ label: 'Y', value: `${this.comp.position.y}`, editable: false })

          // ---- Custom parameters ----
          if (this.paramEntries.length > 0) {
            Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4, bottom: 4 })
            ForEach(this.paramEntries, (key: string) => {
              ProteusParamRow({
                label: key,
                value: paramMapGet(this.comp !== null ? this.comp.parameters : emptyStringMap(), key, ''),
                editable: false
              })
            }, (key: string) => key)
          }

          // ---- Instrument data (conditional) ----
          if (this.isInstrument()) {
            Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 6, bottom: 4 })
            Text('仪表数据')
              .fontSize(ProteusFonts.TITLE)
              .fontColor(ProteusColors.TEXT_LABEL)
              .fontWeight(FontWeight.Medium)
              .width('100%')
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
            TextInput({ placeholder: '参数名称', text: this.paramKey })
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT)
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_PRIMARY)
              .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .onChange((v: string) => { this.paramKey = v; })
          }
          .width('100%').alignItems(VerticalAlign.Center)

          Row() {
            Text('数值:')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
            TextInput({ placeholder: '参数值', text: this.paramValue })
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT)
              .fontSize(ProteusFonts.PARAM_VALUE).fontColor(ProteusColors.TEXT_PRIMARY)
              .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .onChange((v: string) => { this.paramValue = v; })
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
  }

  @Builder
  OscilloscopeSection() {
    Column({ space: 4 }) {
      Text('波形显示')
        .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
      if (this.oscWaveData.length > 0) {
        Column({ space: 2 }) {
          OscilloscopeWaveCanvas({
            timeData: this.oscTimeData,
            voltageData: this.oscWaveData,
            channelLabel: 'CH1',
            vPerDiv: 1,
            triggerLevel: 0
          })
            .width('100%').height(100)
        }
        .border({ width: 1, color: ProteusColors.DIVIDER })
        if (this.oscWaveDataCh2.length > 0) {
          Column({ space: 2 }) {
            OscilloscopeWaveCanvas({
              timeData: this.oscTimeData,
              voltageData: this.oscWaveDataCh2,
              channelLabel: 'CH2',
              vPerDiv: 1,
              triggerLevel: 0
            })
              .width('100%').height(100)
          }
          .border({ width: 1, color: ProteusColors.DIVIDER })
        }
      } else {
        Text('(运行仿真后显示波形)')
          .fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_SECONDARY)
      }
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: 'AC', widthVal: 36,
          onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } })
        ProteusClassicBtn({ label: 'DC', widthVal: 36,
          onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } })
        ProteusClassicBtn({ label: 'FFT', widthVal: 36,
          onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT); } })
        ProteusClassicBtn({ label: '测量', widthVal: 44,
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
          .width('100%').height(80)
          .border({ width: 1, color: ProteusColors.DIVIDER })
      } else {
        Text('(运行仿真后显示逻辑波形)')
          .fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_SECONDARY)
      }
      Text('协议解码')
        .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
        .margin({ top: 4 })
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: 'UART', widthVal: 44,
          onAction: () => {
            this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200);
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'I2C', widthVal: 36,
          onAction: () => {
            this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C);
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'SPI', widthVal: 36,
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
    Column({ space: 4 }) {
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: 'DCV', widthVal: 36,
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.DCV);
            this.mmMode = 'DCV';
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'ACV', widthVal: 36,
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.ACV);
            this.mmMode = 'ACV';
          } })
        ProteusClassicBtn({ label: 'Ω', widthVal: 30,
          onAction: () => {
            this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
            this.mmMode = 'OHM';
            this.refreshInstrumentData();
          } })
        ProteusClassicBtn({ label: 'Auto', widthVal: 40,
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
      Row({ space: 4 }) {
        Text('闸门:')
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
        TextInput({ text: this.fcGate })
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_PRIMARY)
          .width(50).height(ProteusDimens.PARAM_ROW_HEIGHT)
          .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
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
        TextInput({ placeholder: 'HEX: 55 AA', text: this.uartHex })
          .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT)
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.uartHex = v; })
        ProteusClassicBtn({ label: '发', widthVal: 36,
          onAction: () => {
            this.appService.instruments.uartHexSend(this.uartHex);
            this.statusMessage = `已发送: ${this.uartHex}`;
          } })
      }
      .width('100%')
      if (this.uartLog.length > 0) {
        Text(this.uartLog)
          .fontSize(9).fontColor('#CCCCCC')
          .fontFamily('monospace')
          .backgroundColor('#0a0a12')
          .padding(4).width('100%').maxLines(8)
      }
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
        TextInput({ placeholder: 'firmware.hex 路径', text: this.hexPath })
          .layoutWeight(1).height(28)
          .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.hexPath = v; })
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
          const result = this.appService.hexDebugger.loadHexData(data, family);
          this.statusMessage = result.success ? 'HEX 加载成功' : `加载失败: ${result.error}`;
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
      return;
    }
    this.statusMessage = '烧录中...';
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
      const result = this.appService.hexDebugger.loadHexData(data, family);
      this.statusMessage = result.success ? 'HEX 烧录成功' : `烧录失败: ${result.error}`;
    } catch (_e) {
      this.statusMessage = `打开文件失败: ${_e}`;
    }
  }
}
